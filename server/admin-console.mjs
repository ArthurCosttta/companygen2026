import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_ACCESS_CODES,
  isLocalShowcaseEnabled,
  resolveSupabaseAdminConfig,
  serializeCreditOp,
} from './access-and-checkout.mjs';
import {
  createQrCampaign,
  listAllQrCampaigns,
  listAllTickets,
  renderQrAssets,
  resolveTicketStatus,
  toggleOrDeleteQrCampaign,
} from './support-and-qr.mjs';

export function decodeJwtClaims(bearer) {
  try {
    const parts = String(bearer || '').split('.');
    if (parts.length < 2) return {};
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function emptyAdminRegistry() {
  return {
    schemaVersion: 1,
    adminUserIds: [],
    adminEmails: [],
    bannedUsers: {},
    userMeta: {},
    auditLog: [],
    incidents: [],
    updatedAt: null,
  };
}

function normalizeAdminRegistry(raw) {
  const base = emptyAdminRegistry();
  if (!raw || typeof raw !== 'object') return base;
  return {
    schemaVersion: 1,
    adminUserIds: Array.isArray(raw.adminUserIds) ? raw.adminUserIds.map(String) : [],
    adminEmails: Array.isArray(raw.adminEmails)
      ? raw.adminEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [],
    bannedUsers:
      raw.bannedUsers && typeof raw.bannedUsers === 'object' && !Array.isArray(raw.bannedUsers)
        ? raw.bannedUsers
        : {},
    userMeta:
      raw.userMeta && typeof raw.userMeta === 'object' && !Array.isArray(raw.userMeta)
        ? raw.userMeta
        : {},
    auditLog: Array.isArray(raw.auditLog) ? raw.auditLog.slice(-100) : [],
    incidents: Array.isArray(raw.incidents) ? raw.incidents.slice(-100) : [],
    updatedAt: raw.updatedAt || null,
  };
}

export async function recordSystemIncident({
  root,
  type,
  endpoint = '',
  userId = '',
  detail = '',
  readJsonFile,
  atomicWriteJson,
}) {
  if (!root || !type) return;
  const registryPath = path.join(root, '_admin_registry.json');
  try {
    await serializeCreditOp(registryPath, async () => {
      const raw = readJsonFile ? await readJsonFile(registryPath, null) : null;
      const registry = normalizeAdminRegistry(raw);
      registry.incidents.push({
        id: randomUUID(),
        type: String(type).slice(0, 64),
        endpoint: String(endpoint || '').slice(0, 120),
        userId: String(userId || '').slice(0, 64),
        detail: String(detail || '').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 240),
        createdAt: new Date().toISOString(),
      });
      registry.incidents = registry.incidents.slice(-100);
      registry.updatedAt = new Date().toISOString();
      if (atomicWriteJson) {
        await atomicWriteJson(registryPath, registry);
      }
    });
  } catch {
    // Telemetry failure must never break primary flow.
  }
}

const DEFAULT_OWNER_ADMIN_EMAIL = 'arthurpolarbuy@gmail.com';

function getEnvAdminEmails() {
  const configured = String(process.env.CG_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : [DEFAULT_OWNER_ADMIN_EMAIL];
}

function getEnvAdminUserIds() {
  return String(process.env.CG_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalShowcaseUser(user) {
  return (
    user?.isLocalShowcase === true ||
    String(user?.bearer || '').startsWith('cg-local-showcase.')
  );
}

function computeIsAdmin(user, email, registry) {
  if (!user?.id || user.id === 'public-visitor' || isLocalShowcaseUser(user)) {
    return false;
  }
  const envUserIds = getEnvAdminUserIds();
  if (envUserIds.length > 0 && user?.id && envUserIds.includes(user.id)) {
    return true;
  }
  const envEmails = getEnvAdminEmails();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (envEmails.length > 0 && cleanEmail && envEmails.includes(cleanEmail)) {
    return true;
  }
  if (registry.adminUserIds.includes(user.id)) return true;
  if (cleanEmail && registry.adminEmails.includes(cleanEmail)) return true;
  return false;
}

export async function isAdminRequest({ root, user, readJsonFile }) {
  if (!user?.id || user.id === 'public-visitor' || isLocalShowcaseUser(user)) return false;
  const registryPath = path.join(root, '_admin_registry.json');
  const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
  const claims = decodeJwtClaims(user?.bearer);
  const email = String(claims?.email || claims?.user_metadata?.email || '').trim().toLowerCase();
  return computeIsAdmin(user, email, registry);
}

function generateAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len) => {
    const bytes = randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  };
  return `AI10-${pick(4)}-${pick(4)}`;
}

function computeSha256(text) {
  return createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex');
}

export async function recordUserTouchAndCheckBan({ root, user, readJsonFile, atomicWriteJson }) {
  if (!user?.id || user.id === 'public-visitor') return { banned: false, isAdmin: false };
  const registryPath = path.join(root, '_admin_registry.json');
  const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
  const claims = decodeJwtClaims(user.bearer);
  const email = String(claims?.email || claims?.user_metadata?.email || '').trim().toLowerCase();
  const displayName = String(
    claims?.user_metadata?.full_name || claims?.user_metadata?.name || '',
  ).trim();

  const prevMeta = registry.userMeta[user.id] || {};
  const now = new Date().toISOString();
  const lastSeenMs = prevMeta.lastSeenAt ? new Date(prevMeta.lastSeenAt).getTime() : 0;
  if (
    (email && prevMeta.email !== email) ||
    (displayName && prevMeta.displayName !== displayName) ||
    Date.now() - lastSeenMs > 60_000
  ) {
    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      const latestMeta = latest.userMeta[user.id] || {};
      latest.userMeta[user.id] = {
        ...latestMeta,
        email: email || latestMeta.email || '',
        displayName: displayName || latestMeta.displayName || '',
        lastSeenAt: now,
      };
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest).catch(() => {});
    }).catch(() => {});
  }

  const banInfo = registry.bannedUsers[user.id];
  const isAdmin = computeIsAdmin(user, email, registry);
  return {
    banned: Boolean(banInfo?.banned) && !isAdmin,
    reason: banInfo?.reason || 'Conta suspensa pelo administrador.',
    isAdmin,
    email,
  };
}

export async function handleAdminRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/admin/')) return false;

  const { user, directory, readJson, send, ApiError, readJsonFile, atomicWriteJson } = ctx;
  const root = path.dirname(directory);
  const registryPath = path.join(root, '_admin_registry.json');
  const codesPath = path.join(root, '_shared_access_codes.json');

  const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
  const claims = decodeJwtClaims(user?.bearer);
  const email = String(claims?.email || claims?.user_metadata?.email || '').trim().toLowerCase();
  const isAdmin = computeIsAdmin(user, email, registry);

  if (pathname === '/api/admin/status') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const banInfo = registry.bannedUsers[user.id];
    return send(res, 200, {
      ok: true,
      isAdmin,
      banned: Boolean(banInfo?.banned) && !isAdmin,
      reason: banInfo?.reason || '',
      email,
    });
  }

  if (!isAdmin) {
    throw new ApiError(403, 'Acesso restrito ao administrador.');
  }

  // GET /api/admin/overview
  if (pathname === '/api/admin/overview') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const users = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name === 'public-visitor') continue;
      const uid = entry.name;
      const userDir = path.join(root, uid);
      const [studioRaw, profileRaw, ledgerRaw] = await Promise.all([
        readJsonFile(path.join(userDir, 'studio.json'), null),
        readJsonFile(path.join(userDir, 'profile.json'), null),
        readJsonFile(path.join(userDir, 'credits_ledger.json'), []),
      ]);
      const ledger = Array.isArray(ledgerRaw) ? ledgerRaw : [];
      const balance = ledger.length > 0 ? Number(ledger[ledger.length - 1]?.balance_after || 0) : 0;
      const localSpent = ledger.reduce((sum, entry) => {
        const d = Number(entry?.delta || 0);
        return d < 0 && entry?.operation_type !== 'order_refunded' ? sum + Math.abs(d) : sum;
      }, 0);
      const profileData = profileRaw?.data || studioRaw?.data || {};
      const publicSlug = String(profileData?.publishedStore?.publicSlug || '').trim();
      const meta = registry.userMeta[uid] || {};
      const ban = registry.bannedUsers[uid] || {};
      const isRowAdmin =
        getEnvAdminUserIds().includes(uid) ||
        (meta.email && getEnvAdminEmails().includes(String(meta.email).toLowerCase())) ||
        registry.adminUserIds.includes(uid) ||
        (meta.email && registry.adminEmails.includes(String(meta.email).toLowerCase()));

      users.push({
        id: uid,
        email: meta.email || profileData?.business?.email || '',
        displayName: meta.displayName || profileData?.owner?.name || '',
        businessName: profileData?.business?.name || 'Sem vitrine configurada',
        whatsappPhone: profileData?.whatsapp?.phoneE164 || '',
        credits: balance,
        totalSpent: localSpent,
        published: Boolean(profileData?.publishedStore?.published),
        publicSlug,
        storeUrl: publicSlug ? `/?view=store&u=${encodeURIComponent(uid)}&loja=${encodeURIComponent(publicSlug)}` : `/?view=store&u=${encodeURIComponent(uid)}`,
        source: 'local',
        banned: Boolean(ban.banned),
        banReason: ban.reason || '',
        bannedAt: ban.bannedAt || null,
        isAdmin: isRowAdmin,
        lastSeenAt: meta.lastSeenAt || profileData?.updatedAt || null,
      });
    }

    users.sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime());

    const storedCodesRaw = await readJsonFile(codesPath, null);
    let storedCodes = Array.isArray(storedCodesRaw) ? storedCodesRaw : [];
    if (storedCodes.length === 0 && isLocalShowcaseEnabled()) {
      storedCodes = DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
    }

    let cloudIncidents = [];
    let cloudInvites = [];
    const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
    const isCloudActive = process.env.CG_PERSISTENCE !== 'local' && Boolean(sbUrl && serviceRoleKey);
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    if (isCloudActive) {
      const sbHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
      const [kwRes, codeRes, authRes, acctRes, ledgerRes, profRes] = await Promise.allSettled([
        sbFetch(
          `${sbUrl}/rest/v1/kiwify_webhooks?or=(processing_status.in.(needs_review,failed),error_message.not.is.null)&order=created_at.desc&limit=25&select=id,order_id,webhook_event_type,processing_status,error_message,attempt_count,credits_delta,created_at,email_sent_at`,
          { headers: sbHeaders, signal: AbortSignal.timeout(4000) },
        ),
        sbFetch(
          `${sbUrl}/rest/v1/cg_access_codes?order=created_at.desc&limit=40&select=id,code_masked,credits,max_redemptions,redemption_count,status,created_at,source_order_id`,
          { headers: sbHeaders, signal: AbortSignal.timeout(4000) },
        ),
        sbFetch(
          `${sbUrl}/auth/v1/admin/users?page=1&per_page=100`,
          { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
        ),
        sbFetch(
          `${sbUrl}/rest/v1/cg_credit_accounts?select=user_id,balance,updated_at&limit=200`,
          { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
        ),
        sbFetch(
          `${sbUrl}/rest/v1/cg_credit_ledger?select=user_id,operation_type,delta,created_at&order=created_at.desc&limit=1000`,
          { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
        ),
        sbFetch(
          `${sbUrl}/rest/v1/cg_business_profile?select=user_id,store_name,published,public_slug,whatsapp_phone,updated_at&limit=200`,
          { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
        ),
      ]);
      if (kwRes.status === 'fulfilled' && kwRes.value.ok) {
        const kwRows = await kwRes.value.json().catch(() => []);
        if (Array.isArray(kwRows)) {
          cloudIncidents = kwRows.map((row) => ({
            id: `kw-${row.id}`,
            type: String(row.error_message || '').startsWith('email_error:')
              ? 'KIWIFY_EMAIL_ERROR'
              : 'KIWIFY_WEBHOOK_REVIEW',
            endpoint: '/functions/v1/kiwify-webhook',
            detail: `${row.webhook_event_type || 'evento'} · pedido ${row.order_id} · status=${row.processing_status} · erro=${row.error_message || 'n/a'} (tentativas: ${row.attempt_count || 1})`,
            userId: null,
            createdAt: row.created_at,
          }));
        }
      }
      if (codeRes.status === 'fulfilled' && codeRes.value.ok) {
        const cRows = await codeRes.value.json().catch(() => []);
        if (Array.isArray(cRows)) {
          cloudInvites = cRows.map((c) => ({
            code: null,
            masked: c.code_masked || 'AI10-****',
            credits: Number(c.credits || 0),
            maxRedemptions: Number(c.max_redemptions || 1),
            redemptionCount: Number(c.redemption_count || 0),
            status: c.status || 'active',
            createdAt: c.created_at || null,
            note: c.source_order_id ? `Kiwify ${c.source_order_id}` : 'Supabase',
            inviteUrl: null,
          }));
        }
      }

      const authUsersList =
        authRes.status === 'fulfilled' && authRes.value.ok
          ? ((await authRes.value.json().catch(() => ({})))?.users || [])
          : [];
      const accountsList =
        acctRes.status === 'fulfilled' && acctRes.value.ok
          ? (await acctRes.value.json().catch(() => []))
          : [];
      const ledgerList =
        ledgerRes.status === 'fulfilled' && ledgerRes.value.ok
          ? (await ledgerRes.value.json().catch(() => []))
          : [];
      const profilesList =
        profRes.status === 'fulfilled' && profRes.value.ok
          ? (await profRes.value.json().catch(() => []))
          : [];

      const balMap = new Map(
        (Array.isArray(accountsList) ? accountsList : []).map((a) => [a.user_id, Number(a.balance || 0)]),
      );
      const profMap = new Map(
        (Array.isArray(profilesList) ? profilesList : []).map((p) => [p.user_id, p]),
      );
      const spendMap = new Map();
      const buyMap = new Map();
      for (const l of Array.isArray(ledgerList) ? ledgerList : []) {
        const d = Number(l.delta || 0);
        if (d < 0 && l.operation_type !== 'order_refunded') {
          spendMap.set(l.user_id, (spendMap.get(l.user_id) || 0) + Math.abs(d));
        } else if (d > 0) {
          buyMap.set(l.user_id, (buyMap.get(l.user_id) || 0) + d);
        }
      }

      const localById = new Map(users.map((u) => [u.id, u]));
      for (const au of Array.isArray(authUsersList) ? authUsersList : []) {
        const uid = au.id;
        if (!uid) continue;
        const cp = profMap.get(uid);
        const existing = localById.get(uid);
        const ban = registry.bannedUsers[uid] || {};
        const uEmail = String(au.email || existing?.email || '').trim().toLowerCase();
        const isRowAdmin =
          getEnvAdminUserIds().includes(uid) ||
          (uEmail && getEnvAdminEmails().includes(uEmail)) ||
          registry.adminUserIds.includes(uid) ||
          (uEmail && registry.adminEmails.includes(uEmail));
        const storeSlug = cp?.public_slug || '';
        const mergedRow = {
          id: uid,
          email: uEmail,
          displayName: String(au.user_metadata?.full_name || au.user_metadata?.name || existing?.displayName || ''),
          businessName: cp?.store_name || existing?.businessName || 'Sem vitrine configurada',
          whatsappPhone: cp?.whatsapp_phone || existing?.whatsappPhone || '',
          credits: balMap.has(uid) ? balMap.get(uid) : Number(existing?.credits || 0),
          totalSpent: spendMap.get(uid) || 0,
          totalPurchased: buyMap.get(uid) || 0,
          published: Boolean(cp?.published),
          publicSlug: storeSlug,
          storeUrl: storeSlug ? `/?view=store&u=${encodeURIComponent(uid)}&loja=${encodeURIComponent(storeSlug)}` : `/?view=store&u=${encodeURIComponent(uid)}`,
          source: 'cloud',
          banned: Boolean(ban.banned),
          banReason: ban.reason || '',
          bannedAt: ban.bannedAt || null,
          isAdmin: isRowAdmin,
          lastSeenAt: au.last_sign_in_at || cp?.updated_at || existing?.lastSeenAt || au.created_at || null,
        };
        localById.set(uid, mergedRow);
      }
      users.splice(0, users.length, ...Array.from(localById.values()));
      users.sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime());
    }

    const localInvites = storedCodes
      .map((c) => ({
        code: null,
        masked: c.masked || 'AI10-****',
        credits: Number(c.credits || 0),
        maxRedemptions: Number(c.maxRedemptions || 1),
        redemptionCount: Number(c.redemptionCount || 0),
        status: c.status || 'active',
        createdAt: c.createdAt || null,
        note: c.note || '',
        inviteUrl: null,
      }))
      .reverse();
    const invites = cloudInvites.length > 0 ? cloudInvites : localInvites;

    const legacyRegistryRaw = await readJsonFile(path.join(root, '_admin', 'admin_registry.json'), null);
    const legacyIncidents = Array.isArray(legacyRegistryRaw?.incidents) ? legacyRegistryRaw.incidents : [];
    const seenIncidentIds = new Set(registry.incidents.map((inc) => inc?.id).filter(Boolean));
    const mergedIncidents = [
      ...legacyIncidents.filter((inc) => inc && !seenIncidentIds.has(inc.id)),
      ...registry.incidents,
      ...cloudIncidents.filter((inc) => !seenIncidentIds.has(inc.id)),
    ]
      .sort((a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime())
      .slice(-100);

    const totalCredits = users.reduce((sum, u) => sum + (Number(u.credits) || 0), 0);
    const totalSpent = users.reduce((sum, u) => sum + (Number(u.totalSpent) || 0), 0);
    const bannedCount = users.filter((u) => u.banned).length;
    const activeInvites = invites.filter((i) => i.status === 'active').length;

    const [tickets, rawQrCampaigns] = await Promise.all([
      listAllTickets({ root, readJsonFile, fetchImpl: sbFetch }),
      listAllQrCampaigns({ root, readJsonFile, fetchImpl: sbFetch }),
    ]);

    const requestProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:1245').split(',')[0].trim();
    const originBase = process.env.COMPANYGEN_URL?.replace(/\/+$/, '') || `${requestProto}://${requestHost}`;

    const qrCampaigns = await Promise.all(
      rawQrCampaigns.map(async (q) => {
        const shortUrl = `${originBase}/q/${q.slug}`;
        const assets = await renderQrAssets(shortUrl).catch(() => ({ svg: '', pngDataUrl: '' }));
        return { ...q, shortUrl, ...assets };
      }),
    );

    const sites = users
      .filter((u) => u.businessName && u.businessName !== 'Sem vitrine configurada')
      .map((u) => ({
        userId: u.id,
        email: u.email,
        businessName: u.businessName,
        published: Boolean(u.published),
        publicSlug: u.publicSlug || '',
        storeUrl: u.storeUrl || `/?view=store&u=${encodeURIComponent(u.id)}`,
        updatedAt: u.lastSeenAt,
      }));

    return send(res, 200, {
      ok: true,
      summary: {
        totalUsers: users.length,
        totalCredits,
        totalSpent,
        bannedCount,
        activeInvites,
        openTicketsCount: tickets.filter((t) => t.status !== 'resolved').length,
        qrCount: qrCampaigns.length,
        incidentsCount: mergedIncidents.length,
      },
      users,
      sites,
      tickets,
      qrCampaigns,
      invites,
      incidents: [...mergedIncidents].reverse(),
    });
  }

  // POST /api/admin/users/credits
  if (pathname === '/api/admin/users/credits') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const targetUserId = String(body?.userId || '').trim();
    const mode = body?.mode === 'set' ? 'set' : 'add';
    const amount = Math.round(Number(body?.amount) || 0);
    if (!targetUserId || targetUserId.includes('..') || targetUserId.includes('/') || targetUserId.includes('\\')) {
      throw new ApiError(400, 'Usuário inválido.');
    }

    const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
    if (process.env.CG_PERSISTENCE !== 'local' && sbUrl && serviceRoleKey && isUuid) {
      const sbFetch = ctx.fetchImpl || globalThis.fetch;
      const sbHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
      const balRes = await sbFetch(`${sbUrl}/rest/v1/rpc/cg_get_user_credit_balance`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_user_id: targetUserId }),
        signal: AbortSignal.timeout(5000),
      });
      if (balRes.ok) {
        const curBal = Number(await balRes.json().catch(() => 0)) || 0;
        const targetBal = mode === 'set' ? Math.max(0, amount) : Math.max(0, curBal + amount);
        const cloudDelta = targetBal - curBal;
        const refId = `admin:${user.id}:${randomUUID()}`;
        if (cloudDelta > 0) {
          const r = await sbFetch(`${sbUrl}/rest/v1/rpc/cg_refund_credits`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({
              p_user_id: targetUserId,
              p_amount: cloudDelta,
              p_reference_id: refId,
              p_metadata: { source: 'admin_adjustment', by: email || user.id, mode, note: String(body?.note || '').slice(0, 120) },
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) throw new ApiError(502, 'Falha ao adicionar créditos no Supabase.');
        } else if (cloudDelta < 0) {
          const r = await sbFetch(`${sbUrl}/rest/v1/rpc/cg_debit_credits`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({
              p_user_id: targetUserId,
              p_cost: Math.abs(cloudDelta),
              p_operation_type: 'edit_storefront',
              p_reference_id: refId,
              p_metadata: { source: 'admin_adjustment', by: email || user.id, mode, note: String(body?.note || '').slice(0, 120) },
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) throw new ApiError(502, 'Falha ao ajustar créditos no Supabase.');
        }
        return send(res, 200, { ok: true, userId: targetUserId, newBalance: targetBal, cloud: true });
      }
    }

    const targetDir = path.join(root, targetUserId);
    const ledgerPath = path.join(targetDir, 'credits_ledger.json');
    const { nextBalance, delta, now } = await serializeCreditOp(targetDir, async () => {
      const ledgerRaw = await readJsonFile(ledgerPath, []);
      const ledger = Array.isArray(ledgerRaw) ? [...ledgerRaw] : [];
      const currentBalance = ledger.length > 0 ? Number(ledger[ledger.length - 1]?.balance_after || 0) : 0;
      const nextBal = mode === 'set' ? Math.max(0, amount) : Math.max(0, currentBalance + amount);
      const d = nextBal - currentBalance;

      const ts = new Date().toISOString();
      ledger.push({
        id: randomUUID(),
        user_id: targetUserId,
        delta: d,
        balance_after: nextBal,
        operation_type: 'admin_adjustment',
        reference_id: `admin:${user.id}:${ts}`,
        metadata: { by: email || user.id, mode, note: String(body?.note || '').slice(0, 120) },
        created_at: ts,
      });
      await atomicWriteJson(ledgerPath, ledger);
      return { nextBalance: nextBal, delta: d, now: ts };
    });

    await serializeCreditOp(registryPath, async () => {
      const latestRegistry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latestRegistry.auditLog.push({
        id: randomUUID(),
        action: 'credits_update',
        targetUserId,
        delta,
        nextBalance,
        by: email || user.id,
        at: now,
      });
      latestRegistry.updatedAt = now;
      await atomicWriteJson(registryPath, latestRegistry);
    });

    return send(res, 200, { ok: true, userId: targetUserId, newBalance: nextBalance });
  }

  // POST /api/admin/users/ban
  if (pathname === '/api/admin/users/ban') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const targetUserId = String(body?.userId || '').trim();
    const banned = Boolean(body?.banned);
    const reason = String(body?.reason || (banned ? 'Conta suspensa pelo administrador.' : '')).trim();
    if (
      !targetUserId ||
      targetUserId.includes('..') ||
      targetUserId.includes('/') ||
      targetUserId.includes('\\')
    ) {
      throw new ApiError(400, 'Usuário inválido.');
    }
    if (targetUserId === user.id && banned) {
      throw new ApiError(400, 'Não é possível banir sua própria conta administradora.');
    }

    const now = new Date().toISOString();
    await serializeCreditOp(registryPath, async () => {
      const latestRegistry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      if (banned) {
        latestRegistry.bannedUsers[targetUserId] = {
          banned: true,
          reason: reason || 'Conta suspensa pelo administrador.',
          bannedAt: now,
          by: email || user.id,
        };
      } else {
        delete latestRegistry.bannedUsers[targetUserId];
      }
      latestRegistry.auditLog.push({
        id: randomUUID(),
        action: banned ? 'ban_user' : 'unban_user',
        targetUserId,
        reason,
        by: email || user.id,
        at: now,
      });
      latestRegistry.updatedAt = now;
      await atomicWriteJson(registryPath, latestRegistry);
    });

    return send(res, 200, { ok: true, userId: targetUserId, banned });
  }

  // POST /api/admin/invites
  if (pathname === '/api/admin/invites') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const credits = Math.max(10, Math.min(100000, Math.round(Number(body?.credits) || 250)));
    const maxRedemptions = Math.max(1, Math.min(500, Math.round(Number(body?.maxRedemptions) || 1)));
    const note = String(body?.note || '').trim().slice(0, 120);

    const code = generateAccessCode();
    const parts = code.split('-');
    const masked = `${parts[0]}-****-${parts[2]}`;
    const now = new Date().toISOString();

    const storedEntry = {
      hash: computeSha256(code),
      masked,
      credits,
      maxRedemptions,
      redemptionCount: 0,
      status: 'active',
      expiresAt: null,
      note,
      createdBy: email || user.id,
      createdAt: now,
    };
    await serializeCreditOp(codesPath, async () => {
      const storedRaw = await readJsonFile(codesPath, null);
      const stored =
        Array.isArray(storedRaw) && storedRaw.length > 0
          ? [...storedRaw]
          : DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
      stored.push(storedEntry);
      await atomicWriteJson(codesPath, stored);
    });

    await serializeCreditOp(registryPath, async () => {
      const latestRegistry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latestRegistry.auditLog.push({
        id: randomUUID(),
        action: 'create_invite',
        masked,
        credits,
        maxRedemptions,
        by: email || user.id,
        at: now,
      });
      latestRegistry.updatedAt = now;
      await atomicWriteJson(registryPath, latestRegistry);
    });

    return send(res, 200, {
      ok: true,
      invite: {
        ...storedEntry,
        code,
        inviteUrl: `http://127.0.0.1:1245/access?code=${encodeURIComponent(code)}`,
      },
    });
  }

  // POST /api/admin/invites/revoke
  if (pathname === '/api/admin/invites/revoke') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 8 * 1024);
    const code = String(body?.code || '').trim();
    const masked = String(body?.masked || '').trim();

    const updated = await serializeCreditOp(codesPath, async () => {
      const storedRaw = await readJsonFile(codesPath, null);
      const stored =
        Array.isArray(storedRaw) && storedRaw.length > 0
          ? storedRaw.map((c) => ({ ...c }))
          : DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
      let didUpdate = false;
      const hash = code ? computeSha256(code) : '';

      for (const item of stored) {
        if ((hash && item.hash === hash) || (masked && item.masked === masked && item.status === 'active')) {
          item.status = 'revoked';
          didUpdate = true;
        }
      }
      if (didUpdate) {
        await atomicWriteJson(codesPath, stored);
      }
      return didUpdate;
    });

    return send(res, 200, { ok: true, revoked: updated });
  }

  // POST /api/admin/tickets/resolve
  if (pathname === '/api/admin/tickets/resolve') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const updated = await resolveTicketStatus({
      root,
      id: body?.id,
      status: body?.status || 'resolved',
      adminNote: body?.adminNote || '',
      readJsonFile,
      atomicWriteJson,
      fetchImpl: ctx.fetchImpl || globalThis.fetch,
    });
    if (!updated) throw new ApiError(404, 'Chamado não encontrado.');
    return send(res, 200, { ok: true, ticket: updated });
  }

  // GET / POST / PATCH / DELETE /api/admin/qr-campaigns
  if (pathname === '/api/admin/qr-campaigns') {
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    if (req.method === 'GET') {
      const list = await listAllQrCampaigns({ root, readJsonFile, fetchImpl: sbFetch });
      return send(res, 200, { ok: true, qrCampaigns: list });
    }
    if (req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      try {
        const created = await createQrCampaign({
          root,
          name: body?.name,
          slug: body?.slug,
          targetUrl: body?.targetUrl,
          createdBy: email || user.id,
          readJsonFile,
          atomicWriteJson,
          fetchImpl: sbFetch,
        });
        const requestProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:1245').split(',')[0].trim();
        const originBase = process.env.COMPANYGEN_URL?.replace(/\/+$/, '') || `${requestProto}://${requestHost}`;
        const shortUrl = `${originBase}/q/${created.slug}`;
        const assets = await renderQrAssets(shortUrl).catch(() => ({ svg: '', pngDataUrl: '' }));
        return send(res, 200, { ok: true, campaign: { ...created, shortUrl, ...assets } });
      } catch (err) {
        throw new ApiError(400, err instanceof Error ? err.message : 'Erro ao criar QR Code.');
      }
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req, 8 * 1024);
      await toggleOrDeleteQrCampaign({
        root,
        id: body?.id,
        mode: 'toggle',
        active: Boolean(body?.active),
        readJsonFile,
        atomicWriteJson,
        fetchImpl: sbFetch,
      });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const body = await readJson(req, 8 * 1024);
      await toggleOrDeleteQrCampaign({
        root,
        id: body?.id,
        mode: 'delete',
        readJsonFile,
        atomicWriteJson,
        fetchImpl: sbFetch,
      });
      return send(res, 200, { ok: true });
    }
    throw new ApiError(405, 'Método indisponível.');
  }

  return false;
}
