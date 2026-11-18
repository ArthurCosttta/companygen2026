import { randomUUID } from 'node:crypto';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  resolveSupabaseAdminConfig,
  serializeCreditOp,
} from './access-and-checkout.mjs';

const VALID_CATEGORIES = new Set(['vitrine', 'whatsapp', 'creditos', 'outro']);

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
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
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
  const out = {};
  for (const [key, val] of Object.entries(meta)) {
    const k = String(key).slice(0, 48);
    if (typeof val === 'string') {
      out[k] = val.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 240);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[k] = val;
    }
  }
  return out;
}

export async function listAllTickets({ root, readJsonFile, fetchImpl = globalThis.fetch }) {
  if (isCloudTableMode()) {
    const { url } = resolveSupabaseAdminConfig();
    try {
      const res = await fetchImpl(
        `${url}/rest/v1/cg_support_tickets?order=created_at.desc&limit=100&select=id,user_id,user_email,store_name,category,subject,description,context_meta,status,admin_note,resolved_at,created_at,updated_at`,
        { headers: getSupabaseAdminHeaders(), signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows)) return rows;
      }
    } catch {}
  }

  const localPath = path.join(root, '_support_tickets.json');
  const list = await readJsonFile(localPath, []);
  return Array.isArray(list) ? [...list].reverse() : [];
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
    match = await serializeCreditOp(localPath, async () => {
      const raw = await readJsonFile(localPath, []);
      const list = Array.isArray(raw) ? [...raw] : [];
      let found = null;
      const now = new Date().toISOString();
      const next = list.map((item) => {
        if (item.slug === slug && item.active !== false) {
          found = { ...item, scans_count: Number(item.scans_count || 0) + 1, last_scanned_at: now, updated_at: now };
          return found;
        }
        return item;
      });
      if (found) await atomicWriteJson(localPath, next);
      return found;
    });
  }

  if (!match || !isValidTargetUrl(match.target_url)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>QR não encontrado</title><p style="font-family:sans-serif;padding:2rem">Este QR Code não está ativo ou não foi encontrado.</p>');
    return true;
  }

  res.writeHead(302, {
    Location: match.target_url,
    'Cache-Control': 'no-store',
  });
  res.end();
  return true;
}

export async function handleSupportAndQrClientRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const { user, root, readJson, send, ApiError, readJsonFile, atomicWriteJson, fetchImpl = globalThis.fetch } = ctx;

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
      const subject = String(body?.subject || '').trim().slice(0, 120);
      const description = String(body?.description || '').trim().slice(0, 2000);
      const storeName = String(body?.storeName || '').trim().slice(0, 120);
      const userEmail = String(user?.email || body?.email || '').trim().slice(0, 120);
      const contextMeta = redactContext(body?.contextMeta);

      let validAttachmentDataUrl = null;
      if (body?.attachmentDataUrl !== undefined && body?.attachmentDataUrl !== null && String(body.attachmentDataUrl).trim() !== '') {
        const rawAttachment = String(body.attachmentDataUrl).trim();
        const isAllowedImageDataUrl = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=\s]+$/i.test(rawAttachment);
        if (!isAllowedImageDataUrl || rawAttachment.length > 2_200_000) {
          throw new ApiError(400, 'Anexo inválido. Envie uma imagem PNG, JPEG ou WebP de até 1,5 MB.');
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
              return send(res, 200, { ok: true, ticket: rows[0] });
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
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 8 * 1024);
    const targetUrl = String(body?.targetUrl || '').trim();
    if (!isValidTargetUrl(targetUrl)) {
      throw new ApiError(400, 'Link inválido para gerar QR Code.');
    }
    const assets = await renderQrAssets(targetUrl);
    return send(res, 200, { ok: true, targetUrl, ...assets });
  }

  return false;
}
