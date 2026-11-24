import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import {
  DEFAULT_ACCESS_CODES,
  resolveSupabaseAdminConfig,
  serializeCreditOp,
} from './access-and-checkout.mjs';
import { scrubObject, scrubPii } from './pii-scrubber.mjs';

const VALID_CATEGORIES = new Set(['vitrine', 'whatsapp', 'creditos', 'outro']);
const VALID_FEEDBACK_RATINGS = new Set(['easy', 'medium', 'stuck']);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALLOWED_REDIRECT_HOSTS = new Set([
  'companygen.store',
  'www.companygen.store',
  'app.companygen.store',
  'companygen-app.web.app',
  'companygen-app.firebaseapp.com',
  'companygenai.web.app',
  'companygenai.firebaseapp.com',
  '127.0.0.1',
  'localhost',
]);

export function resolveBrandedServerOrigin(req) {
  const reqHostRaw = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
  const reqProto =
    String(req?.headers?.['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim() || 'https';
  const reqHost = reqHostRaw.split(':')[0].toLowerCase();

  if (
    reqHost &&
    reqHost !== '127.0.0.1' &&
    reqHost !== 'localhost' &&
    !reqHost.endsWith('.run.app') &&
    (ALLOWED_REDIRECT_HOSTS.has(reqHost) ||
      reqHost.endsWith('.companygen.store') ||
      reqHost.endsWith('.web.app') ||
      reqHost.endsWith('.firebaseapp.com'))
  ) {
    return `https://${reqHostRaw}`;
  }

  const envOrigin = String(process.env.COMPANYGEN_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (
    envOrigin &&
    !envOrigin.includes('.run.app') &&
    !/127\.0\.0\.1|localhost/i.test(envOrigin)
  ) {
    if (reqHost.endsWith('.run.app') && envOrigin === 'https://companygen.store') {
      return 'https://companygen-app.web.app';
    }
    return envOrigin;
  }

  if (reqHost === '127.0.0.1' || reqHost === 'localhost') {
    return `${reqProto}://${reqHostRaw}`;
  }
  return 'https://companygen-app.web.app';
}

function isCloudTableMode() {
  if (process.env.CG_PERSISTENCE === 'local') return false;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  return Boolean(url && serviceRoleKey);
}

function getSupabaseAdminHeaders(extra = {}) {
  const { serviceRoleKey } = resolveSupabaseAdminConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export function normalizeQrSlug(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function isValidTargetUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//') && !trimmed.includes('\\');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeRedirectTarget(rawUrl, extraAllowedHosts = []) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.includes('\\') || /[\r\n\0]/.test(trimmed)) return false;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_REDIRECT_HOSTS.has(host) || host.endsWith('.companygen.store')) {
      return true;
    }
    return extraAllowedHosts.some((h) => String(h || '').toLowerCase() === host);
  } catch {
    return false;
  }
}

export function hasValidImageMagicBytes(buffer, declaredSubtype = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  const sub = String(declaredSubtype || '').toLowerCase();
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (sub === 'png') return isPng;
  if (sub === 'jpeg' || sub === 'jpg') return isJpeg;
  if (sub === 'webp') return isWebp;
  return isPng || isJpeg || isWebp;
}

export async function renderQrAssets(targetUrl) {
  const clean = String(targetUrl || '').trim();
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(clean, { type: 'svg', margin: 2, width: 256 }),
    QRCode.toDataURL(clean, { margin: 2, width: 512 }),
  ]);
  return { svg, pngDataUrl };
}

function redactContext(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const scrubbed = scrubObject(meta);
  const out = {};
  for (const [key, val] of Object.entries(scrubbed)) {
    const k = String(key).slice(0, 48);
    if (typeof val === 'string') {
      out[k] = val.slice(0, 240);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[k] = val;
    }
  }
  return out;
}

export async function createSupportTicketInternal({
  root,
  readJsonFile,
  atomicWriteJson,
  serializeCreditOp,
  fetchImpl = globalThis.fetch,
  userId,
  userEmail = '',
  storeName = 'CompanyGen',
  category = 'outro',
  subject,
  description,
  contextMeta = {},
}) {
  const now = new Date().toISOString();
  if (isCloudTableMode()) {
    const { url: sbUrl } = resolveSupabaseAdminConfig();
    try {
      const r = await fetchImpl(`${sbUrl}/rest/v1/cg_support_tickets`, {
        method: 'POST',
        headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: userId,
          user_email: userEmail,
          store_name: storeName,
          category,
          subject,
          description,
          context_meta: contextMeta,
          status: 'open',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const rows = await r.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]) {
          return { ticket: rows[0], storage: 'supabase' };
        }
      }
    } catch {}
  }

  const localPath = path.join(root, '_support_tickets.json');
  const ticket = await serializeCreditOp(localPath, async () => {
    const raw = await readJsonFile(localPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    const rec = {
      id: randomUUID(),
      user_id: userId,
      user_email: userEmail,
      store_name: storeName,
      category,
      subject,
      description,
      context_meta: contextMeta,
      status: 'open',
      admin_note: '',
      created_at: now,
      updated_at: now,
    };
    list.push(rec);
    await atomicWriteJson(localPath, list);
    return rec;
  });
  return { ticket, storage: 'local_fallback' };
}

export async function listAllTickets({ root, readJsonFile, fetchImpl = globalThis.fetch }) {
  const merged = new Map();
  const localPath = path.join(root, '_support_tickets.json');
  const localList = await readJsonFile(localPath, []);
  if (Array.isArray(localList)) {
    for (const row of localList) {
      if (row && row.id) merged.set(row.id, row);
    }
  }

  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(
        `${url}/rest/v1/cg_support_tickets?order=created_at.desc&limit=100&select=id,user_id,user_email,store_name,category,subject,description,context_meta,status,admin_note,resolved_at,created_at,updated_at`,
        { headers: getSupabaseAdminHeaders(), signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (!row?.id) continue;
            const existing = merged.get(row.id);
            const rowTs = new Date(row.updated_at || row.created_at || 0).getTime();
            const existingTs = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : -1;
            if (!existing || rowTs >= existingTs) {
              merged.set(row.id, row);
            }
          }
        }
      } else {
        const errBody = await res.text().catch(() => '');
        console.error(`[support] supabase list failed status=${res.status} body=${errBody.slice(0, 300)}`);
      }
    } catch (err) {
      console.error(`[support] supabase list error: ${err?.message || 'unknown'}`);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime(),
  );
}

export async function listAllQrCampaigns({ root, readJsonFile, fetchImpl = globalThis.fetch }) {
  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(
        `${url}/rest/v1/cg_qr_campaigns?order=created_at.desc&limit=100&select=id,slug,name,target_url,scans_count,active,created_by,last_scanned_at,created_at`,
        { headers: getSupabaseAdminHeaders(), signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows)) return rows;
      }
    } catch {}
  }

  const localPath = path.join(root, '_qr_campaigns.json');
  const list = await readJsonFile(localPath, []);
  return Array.isArray(list) ? [...list].reverse() : [];
}

export async function createQrCampaign({
  root,
  name,
  slug,
  targetUrl,
  legacySlugs = [],
  createdBy = 'admin',
  readJsonFile,
  atomicWriteJson,
  fetchImpl = globalThis.fetch,
}) {
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('Informe um nome para a campanha do QR Code.');
  if (!isValidTargetUrl(targetUrl)) {
    throw new Error('URL de destino inválida. Use https://..., http://... ou caminho /...');
  }

  let cleanSlug = normalizeQrSlug(slug || cleanName);
  if (cleanSlug.length < 2) {
    cleanSlug = `qr-${randomUUID().slice(0, 6)}`;
  }
  const normalizedLegacy = Array.isArray(legacySlugs)
    ? legacySlugs.map(normalizeQrSlug).filter((s) => s && s !== cleanSlug)
    : [];

  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(`${url}/rest/v1/cg_qr_campaigns`, {
        method: 'POST',
        headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          slug: cleanSlug,
          name: cleanName,
          target_url: String(targetUrl).trim(),
          active: true,
          created_by: String(createdBy || 'admin').slice(0, 80),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]) return rows[0];
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (String(errJson?.message || '').toLowerCase().includes('duplicate')) {
          throw new Error('Já existe um QR Code com esse identificador. Escolha outro nome.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Já existe')) throw err;
    }
  }

  const localPath = path.join(root, '_qr_campaigns.json');
  return serializeCreditOp(localPath, async () => {
    const raw = await readJsonFile(localPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    if (list.some((item) => item.slug === cleanSlug)) {
      throw new Error('Já existe um QR Code com esse identificador. Escolha outro nome.');
    }
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      slug: cleanSlug,
      name: cleanName,
      target_url: String(targetUrl).trim(),
      legacySlugs: normalizedLegacy,
      scans_count: 0,
      active: true,
      created_by: String(createdBy || 'admin').slice(0, 80),
      last_scanned_at: null,
      created_at: now,
      updated_at: now,
    };
    list.push(record);
    await atomicWriteJson(localPath, list);
    return record;
  });
}

export async function toggleOrDeleteQrCampaign({
  root,
  id,
  mode = 'toggle',
  active,
  readJsonFile,
  atomicWriteJson,
  fetchImpl = globalThis.fetch,
}) {
  const cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('Campanha QR inválida.');

  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const endpoint = `${url}/rest/v1/cg_qr_campaigns?id=eq.${encodeURIComponent(cleanId)}`;
      const res = await fetchImpl(endpoint, {
        method: mode === 'delete' ? 'DELETE' : 'PATCH',
        headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
        body: mode === 'delete' ? undefined : JSON.stringify({ active: Boolean(active), updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
    } catch {}
  }

  const localPath = path.join(root, '_qr_campaigns.json');
  return serializeCreditOp(localPath, async () => {
    const raw = await readJsonFile(localPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    const next =
      mode === 'delete'
        ? list.filter((item) => item.id !== cleanId)
        : list.map((item) => (item.id === cleanId ? { ...item, active: Boolean(active), updated_at: new Date().toISOString() } : item));
    await atomicWriteJson(localPath, next);
    return true;
  });
}

export async function resolveTicketStatus({
  root,
  id,
  status = 'resolved',
  adminNote = '',
  readJsonFile,
  atomicWriteJson,
  fetchImpl = globalThis.fetch,
}) {
  const cleanId = String(id || '').trim();
  const nextStatus = ['open', 'in_progress', 'resolved'].includes(status) ? status : 'resolved';
  const now = new Date().toISOString();
  const resolvedAt = nextStatus === 'resolved' ? now : null;

  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(
        `${url}/rest/v1/cg_support_tickets?id=eq.${encodeURIComponent(cleanId)}`,
        {
          method: 'PATCH',
          headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify({
            status: nextStatus,
            admin_note: String(adminNote || '').slice(0, 500),
            resolved_at: resolvedAt,
            updated_at: now,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    } catch {}
  }

  const localPath = path.join(root, '_support_tickets.json');
  return serializeCreditOp(localPath, async () => {
    const raw = await readJsonFile(localPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    let updated = null;
    const next = list.map((item) => {
      if (item.id !== cleanId) return item;
      updated = {
        ...item,
        status: nextStatus,
        admin_note: String(adminNote || '').slice(0, 500),
        resolved_at: resolvedAt,
        updated_at: now,
      };
      return updated;
    });
    if (updated) await atomicWriteJson(localPath, next);
    return updated;
  });
}

export async function handlePublicQrRedirect(req, res, { root, readJsonFile, atomicWriteJson, fetchImpl = globalThis.fetch }) {
  const pathname = (req.url || '').split('?')[0];
  if (!pathname.startsWith('/q/')) return false;
  const slug = normalizeQrSlug(decodeURIComponent(pathname.slice(3)));
  if (!slug) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('QR Code inválido.');
    return true;
  }

  let match = null;
  let isLegacyAutoHeal = false;
  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const rpcRes = await fetchImpl(`${url}/rest/v1/rpc/cg_increment_qr_scan`, {
        method: 'POST',
        headers: getSupabaseAdminHeaders(),
        body: JSON.stringify({ p_slug: slug }),
        signal: AbortSignal.timeout(4000),
      });
      if (rpcRes.ok) {
        const rows = await rpcRes.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.target_url) {
          match = rows[0];
        }
      }
    } catch {}
  }

  if (!match) {
    const localPath = path.join(root, '_qr_campaigns.json');
    const resolved = await serializeCreditOp(localPath, async () => {
      const raw = await readJsonFile(localPath, []);
      const list = Array.isArray(raw) ? [...raw] : [];
      let found = null;
      let legacyHit = false;
      const now = new Date().toISOString();
      const next = list.map((item) => {
        if (item.active === false) return item;
        const legacySlugs = Array.isArray(item.legacySlugs) ? item.legacySlugs.map(normalizeQrSlug) : [];
        if (item.slug === slug) {
          found = { ...item, scans_count: Number(item.scans_count || 0) + 1, last_scanned_at: now, updated_at: now };
          return found;
        }
        if (legacySlugs.includes(slug)) {
          legacyHit = true;
          found = { ...item, scans_count: Number(item.scans_count || 0) + 1, last_scanned_at: now, updated_at: now };
          return found;
        }
        return item;
      });
      if (found) await atomicWriteJson(localPath, next);
      return { found, legacyHit };
    });
    match = resolved?.found || null;
    isLegacyAutoHeal = Boolean(resolved?.legacyHit);
  }

  const reqHostHeader = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(':')[0]
    .trim();
  const safeTarget = match && isSafeRedirectTarget(match.target_url, reqHostHeader ? [reqHostHeader] : []);
  if (!match || !safeTarget) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>QR não encontrado</title><p style="font-family:sans-serif;padding:2rem">Este QR Code não está ativo ou não foi encontrado.</p>');
    return true;
  }

  const userAgent = String(req.headers?.['user-agent'] || '').toLowerCase();
  const isLinkPreviewBot = /(whatsapp|facebookexternalhit|twitterbot|telegrambot|slackbot|discordbot)/i.test(userAgent);
  if (isLinkPreviewBot) {
    const safeTitle = String(match.label || match.title || 'Vitrine Online · CompanyGen').replace(/[<>"&]/g, '').slice(0, 90);
    const safeDesc = String(match.description || 'Confira produtos, preços e envie seu pedido direto no WhatsApp.').replace(/[<>"&]/g, '').slice(0, 160);
    const safeOgUrl = String(safeTarget).replace(/"/g, '&quot;');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=120',
    });
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>${safeTitle}</title><meta property="og:type" content="website" /><meta property="og:title" content="${safeTitle}" /><meta property="og:description" content="${safeDesc}" /><meta property="og:url" content="${safeOgUrl}" /><meta http-equiv="refresh" content="0;url=${safeOgUrl}" /></head><body>Redirecionando para <a href="${safeOgUrl}">${safeTitle}</a>...</body></html>`);
    return true;
  }

  res.writeHead(isLegacyAutoHeal ? 301 : 302, {
    Location: match.target_url,
    'Cache-Control': isLegacyAutoHeal ? 'public, max-age=300' : 'no-store',
  });
  res.end();
  return true;
}

export async function listAllOnboardingFeedback({ root, readJsonFile, fetchImpl = globalThis.fetch }) {
  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(
        `${url}/rest/v1/cg_onboarding_feedback?order=created_at.desc&limit=100`,
        { headers: getSupabaseAdminHeaders(), signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows)) return rows;
      }
    } catch {}
  }

  const localPath = path.join(root, '_onboarding_feedback.json');
  const list = await readJsonFile(localPath, []);
  return Array.isArray(list) ? [...list].reverse() : [];
}

export async function handleSupportAndQrClientRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const {
    user,
    root,
    directory,
    readJson,
    send,
    ApiError,
    readJsonFile,
    atomicWriteJson,
    loadProfileState,
    fetchImpl = globalThis.fetch,
  } = ctx;

  if (pathname === '/api/support/tickets') {
    if (!user?.id || user.id === 'public-visitor') {
      throw new ApiError(401, 'Entre na sua conta para abrir ou acompanhar chamados.');
    }

    if (req.method === 'GET') {
      if (isCloudTableMode() && !String(user?.bearer || '').startsWith('cg-local-showcase.')) {
        const { url: sbUrl } = resolveSupabaseAdminConfig();
        try {
          const r = await fetchImpl(
            `${sbUrl}/rest/v1/cg_support_tickets?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=50`,
            { headers: getSupabaseAdminHeaders(), signal: AbortSignal.timeout(5000) },
          );
          if (r.ok) {
            const rows = await r.json().catch(() => []);
            return send(res, 200, { ok: true, tickets: Array.isArray(rows) ? rows : [] });
          }
        } catch {}
      }
      const localPath = path.join(root, '_support_tickets.json');
      const raw = await readJsonFile(localPath, []);
      const mine = (Array.isArray(raw) ? raw : []).filter((t) => t.user_id === user.id).reverse();
      return send(res, 200, { ok: true, tickets: mine });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 3 * 1024 * 1024);
      const category = VALID_CATEGORIES.has(body?.category) ? body.category : 'outro';
      const subject = scrubPii(String(body?.subject || '').trim()).slice(0, 120);
      const description = scrubPii(String(body?.description || '').trim()).slice(0, 2000);
      const storeName = scrubPii(String(body?.storeName || '').trim()).slice(0, 120);
      const userEmail = String(user?.email || body?.email || '').trim().slice(0, 120);
      const contextMeta = redactContext(body?.contextMeta);

      let validAttachmentDataUrl = null;
      if (body?.attachmentDataUrl !== undefined && body?.attachmentDataUrl !== null && String(body.attachmentDataUrl).trim() !== '') {
        const rawAttachment = String(body.attachmentDataUrl).trim();
        const mimeMatch = rawAttachment.match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/i);
        if (!mimeMatch || rawAttachment.length > 2_200_000) {
          throw new ApiError(400, 'Anexo inválido. Envie uma imagem PNG, JPEG ou WebP de até 1,5 MB.');
        }
        const rawBuf = Buffer.from(mimeMatch[2].replace(/\s+/g, ''), 'base64');
        if (!hasValidImageMagicBytes(rawBuf, mimeMatch[1])) {
          throw new ApiError(400, 'Arquivo de imagem inválido ou corrompido (assinatura binária incompatível).');
        }
        validAttachmentDataUrl = rawAttachment;
        contextMeta.has_attachment = true;
      }

      if (subject.length < 3 || description.length < 6) {
        throw new ApiError(400, 'Descreva brevemente o título e o que aconteceu.');
      }

      const now = new Date().toISOString();
      if (isCloudTableMode() && !String(user?.bearer || '').startsWith('cg-local-showcase.')) {
        const { url: sbUrl } = resolveSupabaseAdminConfig();
        try {
          const r = await fetchImpl(`${sbUrl}/rest/v1/cg_support_tickets`, {
            method: 'POST',
            headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
            body: JSON.stringify({
              user_id: user.id,
              user_email: userEmail,
              store_name: storeName,
              category,
              subject,
              description,
              context_meta: contextMeta,
              attachment_url: validAttachmentDataUrl,
              status: 'open',
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const rows = await r.json().catch(() => []);
            if (Array.isArray(rows) && rows[0]) {
              return send(res, 200, { ok: true, ticket: rows[0], storage: 'supabase' });
            }
          } else {
            const errBody = await r.text().catch(() => '');
            console.error(`[support] supabase insert failed status=${r.status} body=${errBody.slice(0, 300)}`);
          }
        } catch (err) {
          console.error(`[support] supabase insert error: ${err?.message || 'unknown'}`);
        }
      }

      const localPath = path.join(root, '_support_tickets.json');
      const ticket = await serializeCreditOp(localPath, async () => {
        const raw = await readJsonFile(localPath, []);
        const list = Array.isArray(raw) ? [...raw] : [];
        const rec = {
          id: randomUUID(),
          user_id: user.id,
          user_email: userEmail,
          store_name: storeName,
          category,
          subject,
          description,
          attachment_url: validAttachmentDataUrl,
          context_meta: contextMeta,
          status: 'open',
          admin_note: '',
          resolved_at: null,
          created_at: now,
          updated_at: now,
        };
        list.push(rec);
        await atomicWriteJson(localPath, list);
        return rec;
      });

      return send(res, 200, { ok: true, ticket });
    }

    throw new ApiError(405, 'Método indisponível.');
  }

  if (pathname === '/api/store/qr-code') {
    if (!['GET', 'POST'].includes(req.method)) throw new ApiError(405, 'Método indisponível.');
    const body = req.method === 'POST' ? await readJson(req, 8 * 1024) : {};
    const targetMode = String(
      (req.method === 'GET' ? url.searchParams.get('target') : body?.target) || 'store',
    )
      .trim()
      .toLowerCase();
    const rawSku = String(
      (req.method === 'GET' ? url.searchParams.get('sku') : body?.sku) || '',
    );
    const rawLabel = String(
      (req.method === 'GET' ? url.searchParams.get('label') : body?.label) || '',
    );
    const safeSku = rawSku.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const safeLabel = rawLabel.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

    let targetUrl = String(
      (req.method === 'GET' ? url.searchParams.get('targetUrl') : body?.targetUrl) || '',
    ).trim();

    let slug = '';
    if (loadProfileState && user?.id && directory) {
      try {
        const snap = await loadProfileState(user, directory);
        slug = String(snap?.current?.data?.publishedStore?.publicSlug || '').trim();
      } catch {}
    }

    if (!targetUrl) {
      const requestedOrigin = String(
        (req.method === 'GET' ? url.searchParams.get('origin') : body?.origin) ||
          req.headers?.origin ||
          '',
      )
        .trim()
        .replace(/\/+$/, '');
      const fallbackOrigin = resolveBrandedServerOrigin(req);
      let safeOrigin = fallbackOrigin;
      if (requestedOrigin && /^https?:\/\//i.test(requestedOrigin)) {
        try {
          const parsedReq = new URL(requestedOrigin);
          if (!parsedReq.hostname.toLowerCase().endsWith('.run.app')) {
            safeOrigin = parsedReq.origin;
          }
        } catch {}
      }
      const base = new URL(safeOrigin);
      base.searchParams.set('view', 'store');
      if (slug) base.searchParams.set('loja', slug);
      else if (user?.id) base.searchParams.set('u', user.id);
      targetUrl = base.toString();
    }

    if (!isValidTargetUrl(targetUrl)) {
      throw new ApiError(400, 'Link inválido para gerar QR Code.');
    }

    const parsedTarget = new URL(targetUrl, resolveBrandedServerOrigin(req));
    if ((targetMode === 'product' || safeSku) && safeSku) {
      parsedTarget.searchParams.set('item', safeSku);
    }
    if ((targetMode === 'custom' || safeLabel) && safeLabel) {
      parsedTarget.searchParams.set('origem', safeLabel);
    }
    const finalTargetUrl = parsedTarget.toString();
    const assets = await renderQrAssets(finalTargetUrl);
    return send(res, 200, {
      ok: true,
      target: targetMode,
      sku: safeSku,
      label: safeLabel,
      slug,
      targetUrl: finalTargetUrl,
      ...assets,
    });
  }

  if (pathname === '/api/onboarding/feedback') {
    if (!user?.id || user.id === 'public-visitor') {
      throw new ApiError(401, 'Entre na sua conta para enviar feedback.');
    }

    if (req.method === 'GET') {
      const items = await listAllOnboardingFeedback({ root, readJsonFile, fetchImpl });
      const mine = items.filter((item) => item && item.user_id === user.id);
      return send(res, 200, { ok: true, items: mine });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const rating = String(body?.rating || '').trim().toLowerCase();
      if (!VALID_FEEDBACK_RATINGS.has(rating)) {
        throw new ApiError(400, 'Avaliação inválida. Use easy, medium ou stuck.');
      }
      const rawStep = Number(body?.stepStopped);
      const stepStopped = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 8 ? rawStep : null;
      const comment = String(body?.comment || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]')
        .replace(/\b\S+@\S+\.\S+\b/g, '[email]')
        .trim()
        .slice(0, 280);

      const now = new Date().toISOString();
      if (isCloudTableMode() && !String(user?.bearer || '').startsWith('cg-local-showcase.')) {
        const { url: sbUrl } = resolveSupabaseAdminConfig();
        try {
          const r = await fetchImpl(`${sbUrl}/rest/v1/cg_onboarding_feedback`, {
            method: 'POST',
            headers: getSupabaseAdminHeaders({ Prefer: 'return=representation' }),
            body: JSON.stringify({
              user_id: user.id,
              rating,
              step_stopped: stepStopped,
              comment,
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const rows = await r.json().catch(() => []);
            if (Array.isArray(rows) && rows[0]) {
              return send(res, 200, { ok: true, feedback: rows[0] });
            }
          }
        } catch {}
      }

      const localPath = path.join(root, '_onboarding_feedback.json');
      const feedback = await serializeCreditOp(localPath, async () => {
        const raw = await readJsonFile(localPath, []);
        const list = Array.isArray(raw) ? [...raw] : [];
        const rec = {
          id: randomUUID(),
          user_id: user.id,
          rating,
          step_stopped: stepStopped,
          comment,
          created_at: now,
        };
        list.push(rec);
        await atomicWriteJson(localPath, list);
        return rec;
      });

      return send(res, 200, { ok: true, feedback });
    }

    throw new ApiError(405, 'Método indisponível.');
  }

  return false;
}

function generateBatchAccessCode() {
  const buf = randomBytes(8);
  const pick = (i) => CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return `AI10-${pick(0)}${pick(1)}${pick(2)}${pick(3)}-${pick(4)}${pick(5)}${pick(6)}${pick(7)}`;
}

function escapeHtmlBasic(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function createQrBatchPackage({
  root,
  batchName = 'Lote Campanha',
  count = 10,
  credits = 100,
  originBase = 'https://companygen-app.web.app',
  createdBy = 'admin',
  readJsonFile,
  atomicWriteJson,
}) {
  const safeCount = Math.max(1, Math.min(50, Math.round(Number(count) || 10)));
  const safeCredits = Math.max(10, Math.min(100000, Math.round(Number(credits) || 100)));
  const cleanBatch = String(batchName || 'Lote Campanha').trim().slice(0, 60);
  const cleanOrigin = String(originBase || 'https://companygen-app.web.app').replace(/\/+$/, '');
  const batchId = `batch-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
  const slugBase = normalizeQrSlug(cleanBatch) || 'lote';
  const now = new Date().toISOString();

  const codesPath = path.join(root, '_shared_access_codes.json');
  const qrPath = path.join(root, '_qr_campaigns.json');

  const items = [];
  const usedCodes = new Set();
  for (let idx = 0; idx < safeCount; idx += 1) {
    let code = generateBatchAccessCode();
    while (usedCodes.has(code)) code = generateBatchAccessCode();
    usedCodes.add(code);
    const parts = code.split('-');
    const masked = `${parts[0]}-****-${parts[2]}`;
    const hash = createHash('sha256').update(code.toLowerCase()).digest('hex');
    const slug = `${slugBase}-${String(idx + 1).padStart(2, '0')}-${parts[2].toLowerCase()}`;
    const targetUrl = `${cleanOrigin}/?route=access&code=${encodeURIComponent(code)}`;
    const shortUrl = `${cleanOrigin}/q/${slug}`;
    const pngBuffer = await QRCode.toBuffer(shortUrl, { margin: 2, width: 512, type: 'png' });
    const pngDataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    items.push({
      index: idx + 1,
      code,
      masked,
      hash,
      credits: safeCredits,
      slug,
      shortUrl,
      targetUrl,
      pngBuffer,
      pngDataUrl,
    });
  }

  await serializeCreditOp(codesPath, async () => {
    const raw = await readJsonFile(codesPath, null);
    const list =
      Array.isArray(raw) && raw.length > 0 ? [...raw] : DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
    for (const item of items) {
      list.push({
        hash: item.hash,
        masked: item.masked,
        credits: item.credits,
        maxRedemptions: 1,
        redemptionCount: 0,
        status: 'active',
        expiresAt: null,
        note: `${cleanBatch} (#${item.index})`,
        batchId,
        createdBy: String(createdBy || 'admin').slice(0, 80),
        createdAt: now,
      });
    }
    await atomicWriteJson(codesPath, list);
  });

  await serializeCreditOp(qrPath, async () => {
    const raw = await readJsonFile(qrPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    for (const item of items) {
      list.push({
        id: randomUUID(),
        slug: item.slug,
        name: `${cleanBatch} #${String(item.index).padStart(2, '0')}`,
        target_url: item.targetUrl,
        legacySlugs: [],
        scans_count: 0,
        active: true,
        batchId,
        created_by: String(createdBy || 'admin').slice(0, 80),
        last_scanned_at: null,
        created_at: now,
        updated_at: now,
      });
    }
    await atomicWriteJson(qrPath, list);
  });

  const manifestLines = ['indice,codigo,creditos,slug,url_curta,url_destino'];
  const zip = new JSZip();
  for (const item of items) {
    manifestLines.push(
      `${item.index},"${item.code}",${item.credits},"${item.slug}","${item.shortUrl}","${item.targetUrl}"`,
    );
    zip.file(`qr-${String(item.index).padStart(2, '0')}-${item.slug}.png`, item.pngBuffer);
  }
  const manifestCsv = manifestLines.join('\n');
  zip.file('manifest.csv', manifestCsv);

  const cardsHtml = items
    .map(
      (item) => `
      <article class="qr-card">
        <div class="qr-badge">${escapeHtmlBasic(cleanBatch)} · #${String(item.index).padStart(2, '0')}</div>
        <div class="qr-quiet-zone">
          <img src="${item.pngDataUrl}" alt="QR ${escapeHtmlBasic(item.code)}" />
        </div>
        <div class="qr-code-text">${escapeHtmlBasic(item.code)}</div>
        <div class="qr-credits">${item.credits.toLocaleString('pt-BR')} créditos IA</div>
        <div class="qr-url">${escapeHtmlBasic(item.shortUrl)}</div>
      </article>`,
    )
    .join('\n');

  const a4Html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlBasic(cleanBatch)} — Cartela A4 (${items.length} QRs)</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { margin: 0; background: #ffffff; color: #0f172a; padding: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px 0; }
  p.sub { font-size: 12px; color: #475569; margin: 0 0 14px 0; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .qr-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; text-align: center; background: #ffffff; break-inside: avoid; page-break-inside: avoid; }
  .qr-badge { font-size: 11px; font-weight: 700; color: #1d4ed8; margin-bottom: 8px; }
  .qr-quiet-zone { display: inline-block; background: #ffffff; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; }
  .qr-quiet-zone img { display: block; width: 140px; height: 140px; }
  .qr-code-text { margin-top: 8px; font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: #0f172a; }
  .qr-credits { margin-top: 2px; font-size: 12px; font-weight: 600; color: #059669; }
  .qr-url { margin-top: 4px; font-size: 10px; color: #64748b; word-break: break-all; }
</style>
</head>
<body>
  <h1>${escapeHtmlBasic(cleanBatch)} — Lote Oficial CompanyGen</h1>
  <p class="sub">${items.length} cartelas geradas em ${escapeHtmlBasic(now)} · Quiet zone branca #FFFFFF garantida</p>
  <section class="grid">${cardsHtml}</section>
</body>
</html>`;

  zip.file('cartelas-a4.html', a4Html);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = `${slugBase}-${batchId}.zip`;

  return {
    ok: true,
    batchId,
    batchName: cleanBatch,
    count: items.length,
    creditsPerCode: safeCredits,
    codes: items.map(({ pngBuffer: _buf, ...rest }) => rest),
    manifestCsv,
    a4Html,
    zipBase64: zipBuffer.toString('base64'),
    filename,
  };
}
