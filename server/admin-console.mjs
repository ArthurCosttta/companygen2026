import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  applyKiwifyReversalLocal,
  DEFAULT_ACCESS_CODES,
  getCreditLockState,
  isLocalShowcaseEnabled,
  resolveSupabaseAdminConfig,
  roundCredits,
  serializeCreditOp,
} from './access-and-checkout.mjs';
import { scrubObject, scrubPii } from './pii-scrubber.mjs';
import {
  createQrBatchPackage,
  createQrCampaign,
  listAllOnboardingFeedback,
  listAllQrCampaigns,
  listAllTickets,
  renderQrAssets,
  resolveTicketStatus,
  toggleOrDeleteQrCampaign,
} from './support-and-qr.mjs';
import { TIER_LIMITS } from './middleware/ai-budget.mjs';
import { sendEmail } from './email-mailer.mjs';
import { creditsAddedEmail } from './email-templates.mjs';
import { loadStorefrontSnapshot } from './public-storefront-loader.mjs';

const REASON_LABELS_PT = Object.freeze({
  support_comp: 'Compensação de Suporte',
  bonus: 'Bônus Promocional / Parceria',
  refund_fix: 'Estorno / Falha de Motor IA',
  chargeback_adjust: 'Ajuste de Chargeback',
  manual_audit: 'Auditoria Manual Administrativa',
});

async function persistAuditEntryToCloud({ entry, fetchImpl = globalThis.fetch }) {
  const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
  if (process.env.CG_PERSISTENCE === 'local' || !sbUrl || !serviceRoleKey) return false;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entry?.targetUserId || ''));
  try {
    const res = await fetchImpl(`${sbUrl}/rest/v1/cg_admin_audit_log`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: String(entry?.action || 'admin_action'),
        target_user_id: isUuid ? entry.targetUserId : null,
        actor: String(entry?.by || 'admin'),
        payload: scrubObject(entry || {}),
      }),
      signal: AbortSignal.timeout(4500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function persistRegistryKeyToCloud({ key, value, fetchImpl = globalThis.fetch }) {
  const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
  if (process.env.CG_PERSISTENCE === 'local' || !sbUrl || !serviceRoleKey) return false;
  try {
    const res = await fetchImpl(`${sbUrl}/rest/v1/cg_admin_registry?on_conflict=key`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        key: String(key),
        value: value ?? {},
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const UNIT_ECONOMICS_CONFIG = Object.freeze({
  COST_GLM_PAGE_USD: Number(process.env.CG_COST_GLM_PAGE_USD || 0.015),
  COST_RUNPOD_IMAGE_USD: Number(process.env.CG_COST_RUNPOD_IMAGE_USD || 0.012),
  USD_TO_BRL: Number(process.env.CG_USD_TO_BRL || 5.8),
  KIWIFY_FEE_PCT: Number(process.env.CG_KIWIFY_FEE_PCT || 0.0899),
  COST_GLM_PAGE_CENTS: Math.round(Number(process.env.CG_COST_GLM_PAGE_USD || 0.015) * Number(process.env.CG_USD_TO_BRL || 5.8) * 100),
  COST_RUNPOD_IMAGE_CENTS: Math.round(Number(process.env.CG_COST_RUNPOD_IMAGE_USD || 0.012) * Number(process.env.CG_USD_TO_BRL || 5.8) * 100),
  COST_WHATSAPP_REPLY_CENTS: 1,
});

const VALID_CREDIT_REASON_CODES = new Set([
  'bonus',
  'refund_fix',
  'support_comp',
  'chargeback_adjust',
  'manual_audit',
]);

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  ia_v9_studio: {
    key: 'ia_v9_studio',
    globalMode: 'all',
    betaUserIds: [],
    description: 'Estúdio Visual Formula V9',
  },
  whatsapp_co_pilot: {
    key: 'whatsapp_co_pilot',
    globalMode: 'all',
    betaUserIds: [],
    description: 'Rascunhos Co-Piloto Sofia na Fila Humana',
  },
  qr_batch_a4: {
    key: 'qr_batch_a4',
    globalMode: 'admin_only',
    betaUserIds: [],
    description: 'Gerador de Lotes Gráficos A4/ZIP',
  },
});

const DEFAULT_DESKTOP_POLICY = Object.freeze({
  minSupportedVersion: '1.0.0',
  latestVersion: '1.0.0',
  forceUpdate: false,
  downloadUrl: 'https://companygen.store/download',
  releaseNotes: 'Versão estável Desktop Windows com bandeja ativa e motor Sofia.',
});

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
    schemaVersion: 2,
    adminUserIds: [],
    adminEmails: [],
    bannedUsers: {},
    userMeta: {},
    userLimits: {},
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    desktopPolicy: { ...DEFAULT_DESKTOP_POLICY },
    appliedIdempotencyKeys: [],
    auditLog: [],
    incidents: [],
    updatedAt: null,
  };
}

function normalizeAdminRegistry(raw) {
  const base = emptyAdminRegistry();
  if (!raw || typeof raw !== 'object') return base;
  const mergedFlags = { ...DEFAULT_FEATURE_FLAGS };
  if (raw.featureFlags && typeof raw.featureFlags === 'object' && !Array.isArray(raw.featureFlags)) {
    for (const [key, val] of Object.entries(raw.featureFlags)) {
      if (!val || typeof val !== 'object') continue;
      mergedFlags[key] = {
        key,
        globalMode: ['off', 'admin_only', 'beta_list', 'all'].includes(val.globalMode)
          ? val.globalMode
          : 'off',
        betaUserIds: Array.isArray(val.betaUserIds) ? val.betaUserIds.map(String) : [],
        description: String(val.description || '').slice(0, 140),
      };
    }
  }
  const dp = raw.desktopPolicy && typeof raw.desktopPolicy === 'object' ? raw.desktopPolicy : {};
  return {
    schemaVersion: 2,
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
    userLimits:
      raw.userLimits && typeof raw.userLimits === 'object' && !Array.isArray(raw.userLimits)
        ? raw.userLimits
        : {},
    featureFlags: mergedFlags,
    desktopPolicy: {
      minSupportedVersion: String(dp.minSupportedVersion || DEFAULT_DESKTOP_POLICY.minSupportedVersion).slice(0, 24),
      latestVersion: String(dp.latestVersion || DEFAULT_DESKTOP_POLICY.latestVersion).slice(0, 24),
      forceUpdate: Boolean(dp.forceUpdate),
      downloadUrl: String(dp.downloadUrl || DEFAULT_DESKTOP_POLICY.downloadUrl).slice(0, 240),
      releaseNotes: String(dp.releaseNotes || DEFAULT_DESKTOP_POLICY.releaseNotes).slice(0, 280),
    },
    appliedIdempotencyKeys: Array.isArray(raw.appliedIdempotencyKeys)
      ? raw.appliedIdempotencyKeys.slice(-200)
      : [],
    auditLog: Array.isArray(raw.auditLog) ? raw.auditLog.slice(-150) : [],
    incidents: Array.isArray(raw.incidents) ? raw.incidents.slice(-150) : [],
    updatedAt: raw.updatedAt || null,
  };
}

export function isFeatureEnabled(user, key, registryOrFlags, isAdminFlag = false) {
  const flagsMap =
    registryOrFlags?.featureFlags && typeof registryOrFlags.featureFlags === 'object'
      ? registryOrFlags.featureFlags
      : registryOrFlags && typeof registryOrFlags === 'object'
        ? registryOrFlags
        : DEFAULT_FEATURE_FLAGS;
  const flag = flagsMap?.[key];
  if (!flag) return false;
  switch (flag.globalMode) {
    case 'all':
      return true;
    case 'admin_only':
      return Boolean(isAdminFlag);
    case 'beta_list':
      return Boolean(
        isAdminFlag || (user?.id && Array.isArray(flag.betaUserIds) && flag.betaUserIds.includes(user.id)),
      );
    case 'off':
    default:
      return false;
  }
}

export function compareSemver(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
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
        detail: scrubPii(String(detail || '')).slice(0, 240),
        createdAt: new Date().toISOString(),
      });
      registry.incidents = registry.incidents.slice(-150);
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

function generateAccessCode(prefix = 'AI10') {
  const safePrefix = prefix === 'RC10' ? 'RC10' : 'AI10';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len) => {
    const bytes = randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i += 1) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  };
  return `${safePrefix}-${pick(4)}-${pick(4)}`;
}

function resolvePublicOrigin(req) {
  const envOrigin = String(process.env.COMPANYGEN_URL || '').trim().replace(/\/+$/, '');
  if (envOrigin && !/127\.0\.0\.1|localhost/i.test(envOrigin)) {
    return envOrigin;
  }
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  if (host && !/127\.0\.0\.1|localhost/i.test(host)) {
    return `${proto}://${host}`;
  }
  return envOrigin || 'https://companygen.store';
}

function computeCodeStatusTag(entry) {
  const rawStatus = String(entry?.status || 'active').toLowerCase();
  const count = Math.max(0, Number(entry?.redemptionCount ?? entry?.redemption_count ?? 0));
  const max = Math.max(1, Number(entry?.maxRedemptions ?? entry?.max_redemptions ?? 1));
  const expiresAt = entry?.expiresAt ?? entry?.expires_at ?? null;
  if (rawStatus === 'revoked') return { status: 'revoked', statusLabel: 'Revogado' };
  if (rawStatus === 'expired' || (expiresAt && new Date(expiresAt) < new Date())) {
    return { status: 'expired', statusLabel: 'Expirado' };
  }
  if (rawStatus === 'depleted' || count >= max) {
    return { status: 'depleted', statusLabel: max === 1 ? 'Utilizado (1/1)' : `Esgotado (${count}/${max})` };
  }
  if (count > 0) {
    return { status: 'used_partial', statusLabel: `Usado (${count}/${max})` };
  }
  return { status: 'active', statusLabel: 'Disponível' };
}

function formatInviteRow(raw, originBase) {
  const code = raw?.code_display || raw?.code || null;
  const codeType = (raw?.code_type || raw?.codeType) === 'user_recharge' ? 'user_recharge' : 'invite_only';
  const masked = raw?.code_masked || raw?.masked || (codeType === 'user_recharge' ? 'RC10-****' : 'AI10-****');
  const maxRedemptions = Math.max(1, Number(raw?.max_redemptions ?? raw?.maxRedemptions ?? 1));
  const redemptionCount = Math.max(0, Number(raw?.redemption_count ?? raw?.redemptionCount ?? 0));
  const { status, statusLabel } = computeCodeStatusTag({
    status: raw?.status,
    redemptionCount,
    maxRedemptions,
    expiresAt: raw?.expires_at ?? raw?.expiresAt ?? null,
  });
  const base = originBase || 'https://companygen.store';
  const inviteUrl =
    code && codeType === 'invite_only' ? `${base}/?route=access&code=${encodeURIComponent(code)}` : null;
  const redeemUrl =
    code && codeType === 'user_recharge' ? `${base}/?route=settings&redeem=${encodeURIComponent(code)}` : null;

  return {
    id: raw?.id || raw?.hash || masked,
    code,
    masked,
    codeType,
    credits: roundCredits(raw?.credits || 0),
    maxRedemptions,
    redemptionCount,
    status,
    statusLabel,
    createdAt: raw?.created_at || raw?.createdAt || null,
    createdBy: raw?.created_by_email || raw?.createdBy || null,
    note: raw?.note || (raw?.source_order_id ? `Kiwify ${raw.source_order_id}` : ''),
    lastRedeemedByEmail: raw?.last_redeemed_by_email || raw?.lastRedeemedByEmail || null,
    lastRedeemedAt: raw?.last_redeemed_at || raw?.lastRedeemedAt || null,
    inviteUrl,
    redeemUrl,
  };
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

function computeFunnelStage(profileData, whatsappConnected, ordersCount) {
  if (Number(ordersCount || 0) >= 1) return 'primeira_venda';
  if (Boolean(profileData?.publishedStore?.published)) return 'publicado';
  if (Boolean(whatsappConnected)) return 'whatsapp_conectado';
  if (String(profileData?.business?.name || '').trim()) return 'dados_loja';
  return 'conta_criada';
}

function detectAbuseUsers(events = [], nowMs = Date.now()) {
  const byIp = new Map();
  const flagged = new Map();
  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev?.ipHash || !ev?.userId) continue;
    const atMs = new Date(ev.at || 0).getTime();
    if (!Number.isFinite(atMs) || nowMs - atMs > 24 * 60 * 60 * 1000) continue;
    const arr = byIp.get(ev.ipHash) || [];
    arr.push({ userId: String(ev.userId), atMs, codeMasked: ev.codeMasked || '' });
    byIp.set(ev.ipHash, arr);
  }
  for (const [, entries] of byIp.entries()) {
    entries.sort((a, b) => a.atMs - b.atMs);
    for (let i = 0; i < entries.length; i += 1) {
      const windowUsers = new Set();
      for (let j = i; j < entries.length && entries[j].atMs - entries[i].atMs <= 3_600_000; j += 1) {
        windowUsers.add(entries[j].userId);
      }
      if (windowUsers.size >= 3) {
        for (const uid of windowUsers) {
          flagged.set(uid, `Multi-conta: ${windowUsers.size} resgates no mesmo IP em 1h`);
        }
      }
    }
  }
  return flagged;
}

function estimateLedgerEconomics(ledger = []) {
  let grossRevenueCents = 0;
  let aiCostCents = 0;
  const recent24hMs = Date.now() - 24 * 60 * 60 * 1000;
  const refunds24h = { glm: 0, runpod: 0, smtp: 0, other: 0, total: 0 };

  for (const entry of Array.isArray(ledger) ? ledger : []) {
    const delta = Number(entry?.delta || 0);
    const op = String(entry?.operation_type || '');
    const action = String(entry?.action || entry?.metadata?.action || '');
    const atMs = new Date(entry?.created_at || 0).getTime();

    if (op === 'purchase_kiwify' || op === 'subscription_renewed' || op === 'checkout_purchase') {
      // Approx R$0.45 per purchased credit baseline if price not explicitly recorded
      const priceCents = Number(entry?.metadata?.priceCents || 0);
      grossRevenueCents += priceCents > 0 ? priceCents : Math.round(Math.max(0, delta) * 45);
    } else if (op === 'chargeback' || op === 'order_refunded') {
      const revCents = Number(entry?.metadata?.priceCents || 0);
      grossRevenueCents -= revCents > 0 ? revCents : Math.round(Math.abs(delta) * 45);
    } else if (delta < 0) {
      if (action.includes('image') || op === 'generate_image' || op === 'debit_generate_image_schnell' || op === 'debit_generate_hero_dev' || op === 'debit_edit_image_qwen') {
        aiCostCents += UNIT_ECONOMICS_CONFIG.COST_RUNPOD_IMAGE_CENTS;
      } else if (action.includes('storefront') || action.includes('subpage') || op === 'generate_storefront' || op === 'debit_generate_full_storefront') {
        aiCostCents += UNIT_ECONOMICS_CONFIG.COST_GLM_PAGE_CENTS;
      } else if (action.includes('whatsapp') || op === 'whatsapp_reply_consumed' || op === 'debit_glm_whatsapp') {
        aiCostCents += UNIT_ECONOMICS_CONFIG.COST_WHATSAPP_REPLY_CENTS;
      } else {
        aiCostCents += 3;
      }
    }

    if ((op === 'failure_refund' || op.startsWith('refund_')) && atMs >= recent24hMs) {
      const provider = String(entry?.metadata?.provider || '').toLowerCase();
      if (provider.includes('runpod') || action.includes('image')) refunds24h.runpod += 1;
      else if (provider.includes('smtp') || action.includes('email')) refunds24h.smtp += 1;
      else if (provider.includes('glm') || action.includes('storefront') || action.includes('whatsapp')) refunds24h.glm += 1;
      else refunds24h.other += 1;
      refunds24h.total += 1;
    }
  }

  const kiwifyFeeCents = Math.max(0, Math.round(Math.max(0, grossRevenueCents) * UNIT_ECONOMICS_CONFIG.KIWIFY_FEE_PCT));
  const netMarginCents = grossRevenueCents - kiwifyFeeCents - aiCostCents;
  return { grossRevenueCents, kiwifyFeeCents, aiCostCents, netMarginCents, refunds24h };
}

function evaluateFleetAndCanary(fleetList = [], desktopPolicy = DEFAULT_DESKTOP_POLICY, nowMs = Date.now()) {
  const normalized = (Array.isArray(fleetList) ? fleetList : []).map((m) => ({
    ...m,
    outdated: compareSemver(m.appVersion || '0.0.0', desktopPolicy.minSupportedVersion || '1.0.0') < 0,
  }));
  const cutoff12h = nowMs - 12 * 60 * 60 * 1000;
  const degradedUsers = new Set();
  const affectedMachines = [];
  for (const m of normalized) {
    const seenMs = new Date(m.lastSeenAt || 0).getTime();
    if (m.selectorHealth === 'degraded' && Number.isFinite(seenMs) && seenMs >= cutoff12h) {
      if (m.userId) degradedUsers.add(String(m.userId));
      affectedMachines.push(m.machineId);
    }
  }
  const canaryActive = degradedUsers.size >= 2;
  return {
    desktopFleet: normalized.sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime()),
    canaryDomAlert: {
      active: canaryActive,
      code: 'WHATSAPP_DOM_CANARY',
      degradedUsersCount: degradedUsers.size,
      affectedMachines,
      message: canaryActive
        ? `Alerta Canário DOM WhatsApp: ${degradedUsers.size} contas reportaram seletores degradados nas últimas 12h.`
        : 'Seletores DOM do WhatsApp Web operando normalmente.',
    },
  };
}

const fleetHeartbeatLimiter = new Map();
function allowFleetHeartbeat(key, nowMs = Date.now()) {
  const prev = fleetHeartbeatLimiter.get(key) || { count: 0, resetAt: nowMs + 60_000 };
  if (nowMs > prev.resetAt) {
    fleetHeartbeatLimiter.set(key, { count: 1, resetAt: nowMs + 60_000 });
    return true;
  }
  prev.count += 1;
  fleetHeartbeatLimiter.set(key, prev);
  return prev.count <= 20;
}

export async function handlePublicOrUserFleetRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const { user, root, readJson, send, ApiError, readJsonFile, atomicWriteJson } = ctx;
  const registryPath = path.join(root, '_admin_registry.json');

  if (pathname === '/api/desktop/release-policy') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
    return send(res, 200, { ok: true, policy: registry.desktopPolicy });
  }

  if (pathname === '/api/features') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
    const claims = decodeJwtClaims(user?.bearer);
    const email = String(claims?.email || claims?.user_metadata?.email || '').trim().toLowerCase();
    const isAdminFlag = computeIsAdmin(user, email, registry);
    const flags = {};
    for (const key of Object.keys(registry.featureFlags)) {
      flags[key] = isFeatureEnabled(user, key, registry, isAdminFlag);
    }
    return send(res, 200, { ok: true, flags, definitions: registry.featureFlags });
  }

  if (pathname === '/api/desktop/heartbeat') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    if (!user?.id || user.id === 'public-visitor') {
      throw new ApiError(401, 'Sessão necessária para telemetria desktop.');
    }
    if (!allowFleetHeartbeat(user.id)) {
      throw new ApiError(429, 'Muitos heartbeats em sequência.');
    }
    const body = await readJson(req, 4096);
    const machineId = String(body?.machineId || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
    const appVersion = String(body?.appVersion || '1.0.0').replace(/[^0-9a-zA-Z.-]/g, '').slice(0, 24);
    const osPlatform = String(body?.osPlatform || process.platform).slice(0, 24);
    const webviewPhase = String(body?.webviewPhase || 'idle').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    const selectorHealth = ['healthy', 'degraded', 'offline'].includes(body?.selectorHealth)
      ? body.selectorHealth
      : 'healthy';
    if (!machineId) {
      throw new ApiError(400, 'machineId inválido.');
    }

    const fleetPath = path.join(root, '_desktop_fleet.json');
    const now = new Date().toISOString();
    const record = {
      machineId,
      userId: user.id,
      appVersion,
      osPlatform,
      webviewPhase,
      selectorHealth,
      lastSeenAt: now,
    };

    await serializeCreditOp(fleetPath, async () => {
      const raw = await readJsonFile(fleetPath, []);
      const list = Array.isArray(raw) ? [...raw] : [];
      const idx = list.findIndex((item) => item?.machineId === machineId);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      await atomicWriteJson(fleetPath, list.slice(-500));
    });

    const registry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
    if (selectorHealth === 'degraded') {
      const fleetList = await readJsonFile(fleetPath, []);
      const { canaryDomAlert } = evaluateFleetAndCanary(fleetList, registry.desktopPolicy);
      if (canaryDomAlert.active) {
        await recordSystemIncident({
          root,
          type: 'WHATSAPP_DOM_CANARY',
          endpoint: '/api/desktop/heartbeat',
          userId: user.id,
          detail: canaryDomAlert.message,
          readJsonFile,
          atomicWriteJson,
        });
      }
    }

    return send(res, 200, {
      ok: true,
      outdated: compareSemver(appVersion, registry.desktopPolicy.minSupportedVersion) < 0,
      policy: registry.desktopPolicy,
    });
  }

  return false;
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
    const redemptionEvents = await readJsonFile(path.join(root, '_access_redemption_events.json'), []);
    const abuseByUser = detectAbuseUsers(redemptionEvents);
    const fleetRaw = await readJsonFile(path.join(root, '_desktop_fleet.json'), []);
    const localKiwifyRaw = await readJsonFile(path.join(root, '_kiwify_events.json'), []);
    const allLedgersFor24h = [];
    const users = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_') || entry.name === 'public-visitor') continue;
      const uid = entry.name;
      const userDir = path.join(root, uid);
      const [studioRaw, profileRaw, ledgerRaw, ordersRaw, whatsappRaw, creditLock] = await Promise.all([
        readJsonFile(path.join(userDir, 'studio.json'), null),
        readJsonFile(path.join(userDir, 'profile.json'), null),
        readJsonFile(path.join(userDir, 'credits_ledger.json'), []),
        readJsonFile(path.join(userDir, 'orders.json'), []),
        readJsonFile(path.join(userDir, 'whatsapp_session.json'), null),
        getCreditLockState({ user: { id: uid }, directory: userDir, readJsonFile }),
      ]);
      const ledger = Array.isArray(ledgerRaw) ? ledgerRaw : [];
      allLedgersFor24h.push(...ledger);
      const balance = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
      const localSpent = ledger.reduce((sum, entryItem) => {
        const d = Number(entryItem?.delta || 0);
        return d < 0 && entryItem?.operation_type !== 'order_refunded' ? sum + Math.abs(d) : sum;
      }, 0);
      const profileData = profileRaw?.data || studioRaw?.data || {};
      const ordersList = Array.isArray(ordersRaw) ? ordersRaw.filter((o) => !o?.isSimulation && o?.status !== 'cancelado') : [];
      const whatsappConnected = Boolean(
        profileData?.whatsapp?.connected ||
          profileData?.whatsapp?.phoneE164 ||
          whatsappRaw?.connected,
      );
      const funnelStage = computeFunnelStage(profileData, whatsappConnected, ordersList.length);
      const econ = estimateLedgerEconomics(ledger);
      const publicSlug = String(profileData?.publishedStore?.publicSlug || '').trim();
      const meta = registry.userMeta[uid] || {};
      const ban = registry.bannedUsers[uid] || {};
      const limitCfg = registry.userLimits?.[uid] || {};
      const tier = ['standard', 'vip', 'restricted'].includes(limitCfg.tier) ? limitCfg.tier : 'standard';
      const lastSeenIso = meta.lastSeenAt || profileData?.updatedAt || null;
      const lastSeenMs = lastSeenIso ? new Date(lastSeenIso).getTime() : 0;
      const stalledHours =
        funnelStage !== 'primeira_venda' && Number.isFinite(lastSeenMs) && lastSeenMs > 0
          ? Math.max(0, Math.floor((Date.now() - lastSeenMs) / 3_600_000))
          : 0;
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
        lastSeenAt: lastSeenIso,
        funnelStage,
        stalledHours,
        stalledOver24h: funnelStage !== 'primeira_venda' && stalledHours >= 24,
        tier,
        reviewFlag: creditLock.reviewFlag || (balance <= 0 ? null : null),
        shortfallCredits: creditLock.shortfallCredits || 0,
        riskAbuse: abuseByUser.has(uid),
        riskReason: abuseByUser.get(uid) || '',
        revenueCents: econ.grossRevenueCents,
        aiCostCents: econ.aiCostCents,
        marginCents: econ.netMarginCents,
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
          `${sbUrl}/rest/v1/cg_access_codes?order=created_at.desc&limit=300&select=id,code_masked,code_display,code_type,credits,max_redemptions,redemption_count,status,expires_at,note,created_by_email,last_redeemed_by_email,last_redeemed_at,created_at,source_order_id`,
          { headers: sbHeaders, signal: AbortSignal.timeout(4000) },
        ).then(async (r) => {
          if (r.ok) return r;
          return sbFetch(
            `${sbUrl}/rest/v1/cg_access_codes?order=created_at.desc&limit=300&select=id,code_masked,credits,max_redemptions,redemption_count,status,expires_at,created_at,source_order_id`,
            { headers: sbHeaders, signal: AbortSignal.timeout(4000) },
          );
        }),
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
      const overviewOrigin = resolvePublicOrigin(req);
      if (codeRes.status === 'fulfilled' && codeRes.value.ok) {
        const cRows = await codeRes.value.json().catch(() => []);
        if (Array.isArray(cRows)) {
          cloudInvites = cRows.map((c) => formatInviteRow(c, overviewOrigin));
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

    const localOrigin = resolvePublicOrigin(req);
    const localInvites = storedCodes
      .map((c) => formatInviteRow(c, localOrigin))
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

    const [tickets, rawQrCampaigns, onboardingFeedback] = await Promise.all([
      listAllTickets({ root, readJsonFile, fetchImpl: sbFetch }),
      listAllQrCampaigns({ root, readJsonFile, fetchImpl: sbFetch }),
      listAllOnboardingFeedback({ root, readJsonFile, fetchImpl: sbFetch }),
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

    const { desktopFleet, canaryDomAlert } = evaluateFleetAndCanary(fleetRaw, registry.desktopPolicy);
    const funnelSummary = {
      conta_criada: users.filter((u) => u.funnelStage === 'conta_criada').length,
      dados_loja: users.filter((u) => u.funnelStage === 'dados_loja').length,
      whatsapp_conectado: users.filter((u) => u.funnelStage === 'whatsapp_conectado').length,
      publicado: users.filter((u) => u.funnelStage === 'publicado').length,
      primeira_venda: users.filter((u) => u.funnelStage === 'primeira_venda').length,
      stalledOver24h: users.filter((u) => u.stalledOver24h).length,
    };
    const onboardingFeedbackSummary = {
      total: onboardingFeedback.length,
      easy: onboardingFeedback.filter((f) => f?.rating === 'easy').length,
      medium: onboardingFeedback.filter((f) => f?.rating === 'medium').length,
      stuck: onboardingFeedback.filter((f) => f?.rating === 'stuck').length,
    };
    const allEcon = estimateLedgerEconomics(allLedgersFor24h);
    const kiwifyEvents = (Array.isArray(localKiwifyRaw) ? localKiwifyRaw : []).slice(-100).reverse();

    const engineHealth = {
      glm: {
        status: allEcon.refunds24h.glm > 3 ? 'degraded' : 'healthy',
        avgLatencyMs: Number(process.env.CG_GLM_AVG_LATENCY_MS || 840),
        fallbackRatePct: allEcon.refunds24h.glm > 0 ? Math.min(100, allEcon.refunds24h.glm * 5) : 0,
      },
      runpod: {
        status: allEcon.refunds24h.runpod > 3 ? 'degraded' : 'healthy',
        queueDepth: 0,
      },
      smtp: {
        status: mergedIncidents.some((inc) => inc?.type === 'KIWIFY_EMAIL_ERROR') ? 'degraded' : 'healthy',
      },
      failureRefunds24h: allEcon.refunds24h,
    };

    const marginAlert = allEcon.grossRevenueCents > 0 && allEcon.netMarginCents < 0;

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
        onboardingFeedbackCount: onboardingFeedback.length,
        grossRevenueCents: allEcon.grossRevenueCents,
        kiwifyFeeCents: allEcon.kiwifyFeeCents,
        aiCostCents: allEcon.aiCostCents,
        netMarginCents: allEcon.netMarginCents,
        marginAlert,
      },
      funnelSummary,
      onboardingFeedbackSummary,
      desktopFleet,
      desktopPolicy: registry.desktopPolicy,
      canaryDomAlert,
      engineHealth,
      unitEconomics: UNIT_ECONOMICS_CONFIG,
      kiwifyEvents,
      featureFlags: registry.featureFlags,
      tierLimits: TIER_LIMITS,
      auditLog: [...registry.auditLog].slice(-50).reverse(),
      users,
      sites,
      tickets,
      qrCampaigns,
      onboardingFeedback,
      invites,
      incidents: [...mergedIncidents].reverse(),
    });
  }

  // GET /api/admin/users/:userId/support-snapshot (Read-Only Suporte 360°)
  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/support-snapshot')) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const segments = pathname.split('/');
    const targetUserId = decodeURIComponent(segments[4] || '').trim();
    if (!targetUserId || targetUserId.includes('..') || targetUserId.includes('/') || targetUserId.includes('\\')) {
      throw new ApiError(400, 'Usuário inválido.');
    }
    const targetDir = path.join(root, targetUserId);
    const [profileRaw, ledgerRaw, ordersRaw, ticketsAll, creditLock] = await Promise.all([
      readJsonFile(path.join(targetDir, 'profile.json'), null),
      readJsonFile(path.join(targetDir, 'credits_ledger.json'), []),
      readJsonFile(path.join(targetDir, 'orders.json'), []),
      listAllTickets({ root, readJsonFile, fetchImpl: ctx.fetchImpl || globalThis.fetch }),
      getCreditLockState({ user: { id: targetUserId }, directory: targetDir, readJsonFile }),
    ]);
    const ledger = Array.isArray(ledgerRaw) ? ledgerRaw : [];
    const balance = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    const orders = (Array.isArray(ordersRaw) ? ordersRaw : []).slice(-20).reverse();
    const userTickets = ticketsAll.filter((t) => t?.user_id === targetUserId);
    const meta = registry.userMeta?.[targetUserId] || {};
    const limitCfg = registry.userLimits?.[targetUserId] || { tier: 'standard', note: '' };
    const ban = registry.bannedUsers?.[targetUserId] || {};

    const nowIso = new Date().toISOString();
    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latest.auditLog.push({
        id: randomUUID(),
        action: 'support_view_readonly',
        targetUserId,
        by: email || user.id,
        at: nowIso,
      });
      latest.updatedAt = nowIso;
      await atomicWriteJson(registryPath, latest);
    });

    return send(res, 200, {
      ok: true,
      readOnly: true,
      snapshot: scrubObject({
        userId: targetUserId,
        email: meta.email || profileRaw?.data?.business?.email || '',
        businessName: profileRaw?.data?.business?.name || 'Sem vitrine',
        profile: profileRaw?.data || {},
        orders,
        creditsBalance: balance,
        ledger: ledger.slice(-30).reverse(),
        tickets: userTickets,
        tier: limitCfg.tier || 'standard',
        limitNote: limitCfg.note || '',
        banned: Boolean(ban.banned),
        banReason: ban.reason || '',
        creditLock,
      }),
    });
  }

  // GET /api/admin/users/:userId/storefront (Visualizar loja real do cliente, inclusive rascunho)
  const adminStoreMatch = /^\/api\/admin\/users\/([^/]+)\/storefront$/i.exec(pathname);
  if (adminStoreMatch) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const targetUserId = decodeURIComponent(adminStoreMatch[1]).trim();
    if (!targetUserId || targetUserId.includes('..') || targetUserId.includes('/') || targetUserId.includes('\\')) {
      throw new ApiError(400, 'Usuário inválido.');
    }
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    const snap = await loadStorefrontSnapshot({
      lookupKey: targetUserId,
      allowDraft: true,
      root,
      readJsonFile,
      fetchImpl: sbFetch,
    });
    if (!snap.ok) {
      throw new ApiError(snap.status || 404, snap.error || 'Vitrine do cliente não encontrada.');
    }
    const auditEntry = {
      id: randomUUID(),
      action: 'admin_view_storefront',
      targetUserId,
      draft: snap.draft,
      source: snap.source,
      by: email || user.id,
      at: new Date().toISOString(),
    };
    void persistAuditEntryToCloud({ entry: auditEntry, fetchImpl: sbFetch });
    return send(res, 200, snap);
  }

  // POST /api/admin/users/credits
  if (pathname === '/api/admin/users/credits') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const targetUserId = String(body?.userId || '').trim();
    const mode = body?.mode === 'set' ? 'set' : 'add';
    const rawAmount = Number(body?.amount);
    if (!Number.isFinite(rawAmount) || Math.abs(rawAmount) > 100000) {
      throw new ApiError(400, 'Informe uma quantidade válida de créditos.');
    }
    const amount = roundCredits(rawAmount);
    if (mode === 'set' && amount < 0) {
      throw new ApiError(400, 'O saldo definido não pode ser negativo.');
    }
    const reasonCode = String(body?.reasonCode || '').trim();
    const note = scrubPii(String(body?.note || '').trim()).slice(0, 200);
    const idempotencyKey = String(body?.idempotencyKey || '').trim().slice(0, 80);
    const notifyByEmail = Boolean(body?.notifyByEmail);

    if (!targetUserId || targetUserId.includes('..') || targetUserId.includes('/') || targetUserId.includes('\\')) {
      throw new ApiError(400, 'Usuário inválido.');
    }
    if (!VALID_CREDIT_REASON_CODES.has(reasonCode)) {
      throw new ApiError(400, 'Selecione um motivo padronizado válido (bonus, refund_fix, support_comp, chargeback_adjust, manual_audit).');
    }
    if (note.length < 5) {
      throw new ApiError(400, 'Informe uma justificativa com pelo menos 5 caracteres para auditoria.');
    }

    const idemComposite = idempotencyKey ? `${targetUserId}:${idempotencyKey}` : '';
    if (idemComposite) {
      const latestRegCheck = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      if (latestRegCheck.appliedIdempotencyKeys.includes(idemComposite)) {
        const targetDir = path.join(root, targetUserId);
        const ledgerRaw = await readJsonFile(path.join(targetDir, 'credits_ledger.json'), []);
        const curBal = Array.isArray(ledgerRaw) && ledgerRaw.length > 0 ? roundCredits(ledgerRaw[ledgerRaw.length - 1]?.balance_after || 0) : 0;
        return send(res, 200, { ok: true, duplicate: true, userId: targetUserId, newBalance: curBal, emailSent: false, emailError: null });
      }
    }

    const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId);
    const isCloudEligible = process.env.CG_PERSISTENCE !== 'local' && Boolean(sbUrl && serviceRoleKey && isUuid);

    let appliedCloud = false;
    let nextBalance = 0;
    let delta = 0;
    let now = new Date().toISOString();

    if (isCloudEligible) {
      const sbHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
      const balRes = await sbFetch(`${sbUrl}/rest/v1/rpc/cg_get_user_credit_balance`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ p_user_id: targetUserId }),
        signal: AbortSignal.timeout(5000),
      });
      if (balRes.ok) {
        const curBal = roundCredits(await balRes.json().catch(() => 0));
        const targetBal = mode === 'set' ? Math.max(0, amount) : Math.max(0, roundCredits(curBal + amount));
        const cloudDelta = roundCredits(targetBal - curBal);
        const refId = `admin:${user.id}:${idempotencyKey || randomUUID()}`;
        if (cloudDelta > 0) {
          const r = await sbFetch(`${sbUrl}/rest/v1/rpc/cg_refund_credits`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({
              p_user_id: targetUserId,
              p_amount: cloudDelta,
              p_reference_id: refId,
              p_operation_type: 'manual_adjustment',
              p_metadata: { source: 'admin_adjustment', reasonCode, by: email || user.id, mode, note, notifyByEmail },
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
              p_metadata: { source: 'admin_adjustment', reasonCode, by: email || user.id, mode, note, notifyByEmail },
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (!r.ok) throw new ApiError(502, 'Falha ao ajustar créditos no Supabase.');
        }
        appliedCloud = true;
        nextBalance = targetBal;
        delta = cloudDelta;
        now = new Date().toISOString();
      }
    }

    if (!appliedCloud) {
      const targetDir = path.join(root, targetUserId);
      const ledgerPath = path.join(targetDir, 'credits_ledger.json');
      const localRes = await serializeCreditOp(targetDir, async () => {
        const ledgerRaw = await readJsonFile(ledgerPath, []);
        const ledger = Array.isArray(ledgerRaw) ? [...ledgerRaw] : [];
        const currentBalance = ledger.length > 0 ? roundCredits(ledger[ledger.length - 1]?.balance_after || 0) : 0;
        const nextBal = mode === 'set' ? Math.max(0, amount) : Math.max(0, roundCredits(currentBalance + amount));
        const d = roundCredits(nextBal - currentBalance);

        const ts = new Date().toISOString();
        ledger.push({
          id: randomUUID(),
          user_id: targetUserId,
          delta: d,
          balance_after: nextBal,
          operation_type: 'admin_adjustment',
          reference_id: idempotencyKey ? `admin:${targetUserId}:${idempotencyKey}` : `admin:${user.id}:${ts}`,
          metadata: { by: email || user.id, mode, reasonCode, note, notifyByEmail },
          created_at: ts,
        });
        await atomicWriteJson(ledgerPath, ledger);
        return { nextBalance: nextBal, delta: d, now: ts };
      });
      nextBalance = localRes.nextBalance;
      delta = localRes.delta;
      now = localRes.now;
    }

    // Disparo real de e-mail via Gmail SMTP quando notifyByEmail === true e delta > 0
    let emailSent = false;
    let emailError = null;
    let recipientEmail = '';
    if (notifyByEmail && delta > 0) {
      const localProf = await readJsonFile(path.join(root, targetUserId, 'profile.json'), null);
      const profData = localProf?.data || localProf?.profile || localProf || {};
      let storeName = String(profData?.business?.name || registry.usersMeta?.[targetUserId]?.displayName || 'Sua Loja');
      recipientEmail = String(
        body?.targetEmail ||
          registry.usersMeta?.[targetUserId]?.email ||
          profData?.business?.email ||
          '',
      ).trim();

      if (!recipientEmail && isCloudEligible) {
        try {
          const authRes = await sbFetch(`${sbUrl}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, {
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
            signal: AbortSignal.timeout(4000),
          });
          if (authRes.ok) {
            const au = await authRes.json().catch(() => null);
            recipientEmail = String(au?.email || '').trim();
            if (!storeName || storeName === 'Sua Loja') {
              storeName = String(au?.user_metadata?.full_name || storeName);
            }
          }
        } catch {}
      }

      const mailContent = creditsAddedEmail({
        storeName,
        amount: delta,
        newBalance: nextBalance,
        reasonLabel: REASON_LABELS_PT[reasonCode] || reasonCode,
        note,
        appUrl: `${resolvePublicOrigin(req)}/?route=access`,
      });
      const mailResult = await sendEmail({
        to: recipientEmail,
        ...mailContent,
        transportOverride: ctx.emailTransportOverride || null,
      });
      emailSent = Boolean(mailResult.sent);
      emailError = mailResult.error || null;
    }

    const auditEntry = {
      id: randomUUID(),
      action: 'credits_update',
      targetUserId,
      delta,
      nextBalance,
      reasonCode,
      note,
      notifyByEmail,
      emailSent,
      emailError,
      cloud: appliedCloud,
      by: email || user.id,
      at: now,
    };

    await serializeCreditOp(registryPath, async () => {
      const latestRegistry = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latestRegistry.auditLog.push(auditEntry);
      if (idemComposite && !latestRegistry.appliedIdempotencyKeys.includes(idemComposite)) {
        latestRegistry.appliedIdempotencyKeys.push(idemComposite);
      }
      latestRegistry.updatedAt = now;
      await atomicWriteJson(registryPath, latestRegistry);
    });
    await persistAuditEntryToCloud({ entry: auditEntry, fetchImpl: sbFetch });

    return send(res, 200, {
      ok: true,
      userId: targetUserId,
      delta,
      newBalance: nextBalance,
      reasonCode,
      note,
      cloud: appliedCloud,
      emailSent,
      emailError,
      auditEntry,
    });
  }

  // POST /api/admin/users/limits
  if (pathname === '/api/admin/users/limits') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const targetUserId = String(body?.userId || '').trim();
    const tier = ['standard', 'vip', 'restricted'].includes(body?.tier) ? body.tier : '';
    const note = scrubPii(String(body?.note || '').trim()).slice(0, 200);
    const clearNegativeLock = Boolean(body?.clearNegativeLock);
    if (!targetUserId || targetUserId.includes('..') || targetUserId.includes('/') || targetUserId.includes('\\')) {
      throw new ApiError(400, 'Usuário inválido.');
    }
    if (!tier) {
      throw new ApiError(400, 'Selecione um nível válido: standard, vip ou restricted.');
    }
    if (note.length < 3) {
      throw new ApiError(400, 'Informe uma observação para registro da mudança de limite.');
    }

    const now = new Date().toISOString();
    if (clearNegativeLock) {
      const lockPath = path.join(root, targetUserId, 'cg_credit_lock.json');
      await serializeCreditOp(path.join(root, targetUserId), async () => {
        await atomicWriteJson(lockPath, {
          userId: targetUserId,
          reviewFlag: null,
          shortfallCredits: 0,
          note: `Desbloqueio admin por ${email || user.id}: ${note}`,
          updatedAt: now,
        });
      });
    }

    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latest.userLimits[targetUserId] = {
        tier,
        note,
        updatedAt: now,
        by: email || user.id,
      };
      latest.auditLog.push({
        id: randomUUID(),
        action: clearNegativeLock ? 'limits_and_unlock' : 'limits_update',
        targetUserId,
        tier,
        note,
        by: email || user.id,
        at: now,
      });
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest);
    });

    return send(res, 200, {
      ok: true,
      userId: targetUserId,
      tier,
      limits: TIER_LIMITS[tier],
      clearedNegativeLock: clearNegativeLock,
    });
  }

  // GET /api/admin/kiwify/events?q=&status=
  if (pathname === '/api/admin/kiwify/events') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const statusFilter = String(url.searchParams.get('status') || '').trim().toLowerCase();
    const localRaw = await readJsonFile(path.join(root, '_kiwify_events.json'), []);
    let events = Array.isArray(localRaw) ? [...localRaw] : [];
    if (q) {
      events = events.filter((ev) =>
        `${ev?.order_id || ''} ${ev?.customer_email || ''} ${ev?.plan_code || ''} ${ev?.error_message || ''}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (statusFilter) {
      events = events.filter((ev) => String(ev?.processing_status || '').toLowerCase() === statusFilter);
    }
    events.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
    return send(res, 200, {
      ok: true,
      events,
      unitEconomics: UNIT_ECONOMICS_CONFIG,
    });
  }

  // POST /api/admin/kiwify/replay
  if (pathname === '/api/admin/kiwify/replay') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 32 * 1024);
    const orderId = String(body?.orderId || '').trim();
    const eventType = String(body?.eventType || 'order_approved').trim();
    if (!orderId) {
      throw new ApiError(400, 'Informe o orderId do evento Kiwify para replay.');
    }

    const kiwifyPath = path.join(root, '_kiwify_events.json');
    const localEvents = await readJsonFile(kiwifyPath, []);
    const matchedEv = (Array.isArray(localEvents) ? localEvents : []).find(
      (ev) => ev?.order_id === orderId && (!body?.eventType || ev?.webhook_event_type === eventType),
    );

    const targetUserId = String(body?.userId || matchedEv?.user_id || '').trim();
    const creditsAmount = Math.max(0, Math.round(Number(body?.credits ?? matchedEv?.credits ?? 100)));
    const effectiveType = matchedEv?.webhook_event_type || eventType;
    const priceCents = Math.max(0, Math.round(Number(body?.priceCents ?? matchedEv?.price_cents ?? creditsAmount * 4)));

    const refKey = `kiwify:${orderId}:${effectiveType}`;
    const targetDir = targetUserId ? path.join(root, targetUserId) : '';
    let replayResult = { ok: true, duplicate: false, status: 'processed', action: 'noop', balance: null };

    if (targetDir) {
      if (effectiveType === 'chargeback' || effectiveType === 'order_refunded') {
        replayResult = await applyKiwifyReversalLocal({
          userId: targetUserId,
          directory: targetDir,
          creditsToReverse: creditsAmount,
          orderId,
          eventType: effectiveType,
          readJsonFile,
          atomicWriteJson,
        });
      } else {
        const ledgerPath = path.join(targetDir, 'credits_ledger.json');
        replayResult = await serializeCreditOp(targetDir, async () => {
          const rawLedger = await readJsonFile(ledgerPath, []);
          const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
          const existing = ledger.find((entry) => entry?.reference_id === refKey);
          if (existing) {
            return {
              ok: true,
              duplicate: true,
              status: 'processed',
              action: 'duplicate',
              balance: Math.max(0, Number(existing.balance_after || 0)),
            };
          }
          const prevBal = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
          const nextBal = prevBal + creditsAmount;
          const now = new Date().toISOString();
          ledger.push({
            id: randomUUID(),
            user_id: targetUserId,
            delta: creditsAmount,
            balance_after: nextBal,
            operation_type: effectiveType === 'subscription_renewed' ? 'subscription_renewed' : 'purchase_kiwify',
            reference_id: refKey,
            metadata: { orderId, replayedBy: email || user.id, priceCents },
            created_at: now,
          });
          await atomicWriteJson(ledgerPath, ledger);
          return {
            ok: true,
            duplicate: false,
            status: 'processed',
            action: 'account_credited',
            balance: nextBal,
          };
        });
      }
    }

    const now = new Date().toISOString();
    await serializeCreditOp(kiwifyPath, async () => {
      const list = Array.isArray(await readJsonFile(kiwifyPath, [])) ? [...(await readJsonFile(kiwifyPath, []))] : [];
      const idx = list.findIndex((ev) => ev?.order_id === orderId && ev?.webhook_event_type === effectiveType);
      const updatedRecord = {
        ...(idx >= 0 ? list[idx] : {}),
        id: (idx >= 0 ? list[idx]?.id : null) || `kw-${orderId}`,
        order_id: orderId,
        webhook_event_type: effectiveType,
        user_id: targetUserId || null,
        credits: creditsAmount,
        price_cents: priceCents,
        processing_status: 'processed',
        error_message: null,
        replay_count: Number((idx >= 0 ? list[idx]?.replay_count : 0) || 0) + 1,
        replayed_at: now,
        created_at: (idx >= 0 ? list[idx]?.created_at : null) || now,
      };
      if (idx >= 0) list[idx] = updatedRecord;
      else list.push(updatedRecord);
      await atomicWriteJson(kiwifyPath, list.slice(-200));
    });

    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latest.auditLog.push({
        id: randomUUID(),
        action: 'kiwify_replay',
        targetUserId: targetUserId || orderId,
        orderId,
        eventType: effectiveType,
        duplicate: Boolean(replayResult.duplicate),
        by: email || user.id,
        at: now,
      });
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest);
    });

    return send(res, 200, { ok: true, orderId, eventType: effectiveType, ...replayResult });
  }

  // PUT /api/admin/desktop-policy
  if (pathname === '/api/admin/desktop-policy') {
    if (req.method !== 'PUT') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 8 * 1024);
    const now = new Date().toISOString();
    let updatedPolicy = null;
    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latest.desktopPolicy = {
        minSupportedVersion: String(body?.minSupportedVersion || latest.desktopPolicy.minSupportedVersion).slice(0, 24),
        latestVersion: String(body?.latestVersion || latest.desktopPolicy.latestVersion).slice(0, 24),
        forceUpdate: Boolean(body?.forceUpdate),
        downloadUrl: String(body?.downloadUrl || latest.desktopPolicy.downloadUrl).slice(0, 240),
        releaseNotes: scrubPii(String(body?.releaseNotes || latest.desktopPolicy.releaseNotes)).slice(0, 280),
      };
      updatedPolicy = latest.desktopPolicy;
      latest.auditLog.push({
        id: randomUUID(),
        action: 'desktop_policy_update',
        policy: updatedPolicy,
        by: email || user.id,
        at: now,
      });
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest);
    });
    return send(res, 200, { ok: true, policy: updatedPolicy });
  }

  // PUT /api/admin/feature-flags
  if (pathname === '/api/admin/feature-flags') {
    if (req.method !== 'PUT') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const key = String(body?.key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const globalMode = ['off', 'admin_only', 'beta_list', 'all'].includes(body?.globalMode) ? body.globalMode : '';
    if (!key || !globalMode) {
      throw new ApiError(400, 'Informe key e globalMode válido (off, admin_only, beta_list, all).');
    }
    const betaUserIds = Array.isArray(body?.betaUserIds)
      ? body.betaUserIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 100)
      : [];
    const now = new Date().toISOString();
    let savedFlag = null;
    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      savedFlag = {
        key,
        globalMode,
        betaUserIds,
        description: String(body?.description || latest.featureFlags?.[key]?.description || '').slice(0, 140),
      };
      latest.featureFlags[key] = savedFlag;
      latest.auditLog.push({
        id: randomUUID(),
        action: 'feature_flag_update',
        key,
        globalMode,
        by: email || user.id,
        at: now,
      });
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest);
    });
    return send(res, 200, { ok: true, flag: savedFlag });
  }

  // POST /api/admin/qr-batches
  if (pathname === '/api/admin/qr-batches') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const requestProto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '127.0.0.1:1245').split(',')[0].trim();
    const originBase = process.env.COMPANYGEN_URL?.replace(/\/+$/, '') || `${requestProto}://${requestHost}`;
    const pkg = await createQrBatchPackage({
      root,
      batchName: body?.batchName || 'Campanha CompanyGen',
      count: body?.count ?? 10,
      credits: body?.credits ?? 100,
      originBase,
      createdBy: email || user.id,
      readJsonFile,
      atomicWriteJson,
    });
    const now = new Date().toISOString();
    await serializeCreditOp(registryPath, async () => {
      const latest = normalizeAdminRegistry(await readJsonFile(registryPath, emptyAdminRegistry()));
      latest.auditLog.push({
        id: randomUUID(),
        action: 'qr_batch_created',
        batchId: pkg.batchId,
        count: pkg.count,
        creditsPerCode: pkg.creditsPerCode,
        by: email || user.id,
        at: now,
      });
      latest.updatedAt = now;
      await atomicWriteJson(registryPath, latest);
    });
    return send(res, 200, pkg);
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
    const banAuditEntry = {
      id: randomUUID(),
      action: banned ? 'ban_user' : 'unban_user',
      targetUserId,
      reason,
      by: email || user.id,
      at: now,
    };
    let persistedBannedUsers = {};
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
      latestRegistry.auditLog.push(banAuditEntry);
      latestRegistry.updatedAt = now;
      persistedBannedUsers = latestRegistry.bannedUsers;
      await atomicWriteJson(registryPath, latestRegistry);
    });
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    await persistAuditEntryToCloud({ entry: banAuditEntry, fetchImpl: sbFetch });
    await persistRegistryKeyToCloud({
      key: 'banned_users',
      value: persistedBannedUsers,
      updatedBy: email || user.id,
      fetchImpl: sbFetch,
    });

    return send(res, 200, { ok: true, userId: targetUserId, banned });
  }

  // GET / POST /api/admin/invites (Códigos especiais: invite_only vs user_recharge)
  if (pathname === '/api/admin/invites') {
    const originBase = resolvePublicOrigin(req);
    const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
    const isCloudActive = process.env.CG_PERSISTENCE !== 'local' && Boolean(sbUrl && serviceRoleKey);
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    const sbHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    };

    if (req.method === 'GET') {
      if (isCloudActive) {
        let r = await sbFetch(
          `${sbUrl}/rest/v1/cg_access_codes?order=created_at.desc&limit=300&select=id,code_masked,code_display,code_type,credits,max_redemptions,redemption_count,status,expires_at,note,created_by_email,last_redeemed_by_email,last_redeemed_at,created_at,source_order_id`,
          { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
        ).catch(() => null);
        if (r && !r.ok) {
          r = await sbFetch(
            `${sbUrl}/rest/v1/cg_access_codes?order=created_at.desc&limit=300&select=id,code_masked,credits,max_redemptions,redemption_count,status,expires_at,created_at,source_order_id`,
            { headers: sbHeaders, signal: AbortSignal.timeout(5000) },
          ).catch(() => null);
        }
        if (r?.ok) {
          const rows = await r.json().catch(() => []);
          const list = Array.isArray(rows) ? rows.map((row) => formatInviteRow(row, originBase)) : [];
          return send(res, 200, { ok: true, invites: list, cloud: true });
        }
      }
      const storedRaw = await readJsonFile(codesPath, null);
      const stored =
        Array.isArray(storedRaw) && storedRaw.length > 0
          ? storedRaw
          : DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
      const list = stored.map((c) => formatInviteRow(c, originBase)).reverse();
      return send(res, 200, { ok: true, invites: list, cloud: false });
    }

    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 16 * 1024);
    const rawCredits = Number(body?.credits);
    if (!Number.isFinite(rawCredits) || rawCredits <= 0 || rawCredits > 10000) {
      throw new ApiError(400, 'Informe uma quantidade de créditos válida entre 0,5 e 10.000.');
    }
    const credits = Math.max(0.5, roundCredits(rawCredits));
    const maxRedemptions = Math.max(1, Math.min(500, Math.round(Number(body?.maxRedemptions) || 1)));
    const codeType = body?.codeType === 'user_recharge' ? 'user_recharge' : 'invite_only';
    const note = scrubPii(String(body?.note || '').trim()).slice(0, 120);

    const prefix = codeType === 'user_recharge' ? 'RC10' : 'AI10';
    const code = generateAccessCode(prefix);
    const parts = code.split('-');
    const masked = `${parts[0]}-****-${parts[2]}`;
    const hash = computeSha256(code);
    const now = new Date().toISOString();

    const storedEntry = {
      id: randomUUID(),
      code,
      hash,
      masked,
      codeType,
      credits,
      maxRedemptions,
      redemptionCount: 0,
      status: 'active',
      expiresAt: null,
      note,
      createdBy: email || user.id,
      createdAt: now,
      lastRedeemedByEmail: null,
      lastRedeemedAt: null,
    };

    let cloudPersisted = false;
    if (isCloudActive) {
      const insertPayload = {
        code_hash: hash,
        code_masked: masked,
        code_display: code,
        code_type: codeType,
        credits,
        max_redemptions: maxRedemptions,
        redemption_count: 0,
        status: 'active',
        note,
        created_by_email: email || null,
      };
      const insRes = await sbFetch(`${sbUrl}/rest/v1/cg_access_codes`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(insertPayload),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (insRes?.ok) {
        const createdRows = await insRes.json().catch(() => []);
        if (Array.isArray(createdRows) && createdRows[0]?.id) {
          storedEntry.id = createdRows[0].id;
        }
        cloudPersisted = true;
      } else {
        // Fallback compatível caso migration ainda não tenha sido aplicada no banco remoto
        const fallbackRes = await sbFetch(`${sbUrl}/rest/v1/cg_access_codes`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            code_hash: hash,
            code_masked: masked,
            credits: Math.max(1, Math.round(credits)),
            max_redemptions: maxRedemptions,
            redemption_count: 0,
            status: 'active',
          }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (fallbackRes?.ok) {
          cloudPersisted = true;
        }
      }
    }

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
        action: codeType === 'user_recharge' ? 'create_recharge_code' : 'create_invite',
        masked,
        codeType,
        credits,
        maxRedemptions,
        cloudPersisted,
        by: email || user.id,
        at: now,
      });
      latestRegistry.updatedAt = now;
      await atomicWriteJson(registryPath, latestRegistry);
    });

    return send(res, 200, {
      ok: true,
      cloud: cloudPersisted,
      invite: formatInviteRow(storedEntry, originBase),
    });
  }

  // POST /api/admin/invites/revoke
  if (pathname === '/api/admin/invites/revoke') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 8 * 1024);
    const id = String(body?.id || '').trim();
    const code = String(body?.code || '').trim();
    const masked = String(body?.masked || '').trim();
    const hash = code ? computeSha256(code) : '';

    const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
    const isCloudActive = process.env.CG_PERSISTENCE !== 'local' && Boolean(sbUrl && serviceRoleKey);
    const sbFetch = ctx.fetchImpl || globalThis.fetch;
    let cloudRevoked = false;
    if (isCloudActive && (id || hash || masked)) {
      const sbHeaders = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
      const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const filter = isUuidId
        ? `id=eq.${encodeURIComponent(id)}`
        : hash
          ? `code_hash=eq.${encodeURIComponent(hash)}`
          : `code_masked=eq.${encodeURIComponent(masked)}&status=eq.active`;
      const revRes = await sbFetch(`${sbUrl}/rest/v1/cg_access_codes?${filter}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ status: 'revoked' }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (revRes?.ok) {
        const updatedRows = await revRes.json().catch(() => []);
        cloudRevoked = Array.isArray(updatedRows) && updatedRows.length > 0;
      }
    }

    const localRevoked = await serializeCreditOp(codesPath, async () => {
      const storedRaw = await readJsonFile(codesPath, null);
      const stored =
        Array.isArray(storedRaw) && storedRaw.length > 0
          ? storedRaw.map((c) => ({ ...c }))
          : DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
      let didUpdate = false;

      for (const item of stored) {
        if (
          (id && (item.id === id || item.hash === id)) ||
          (hash && item.hash === hash) ||
          (masked && item.masked === masked && item.status === 'active')
        ) {
          item.status = 'revoked';
          didUpdate = true;
        }
      }
      if (didUpdate) {
        await atomicWriteJson(codesPath, stored);
      }
      return didUpdate;
    });

    return send(res, 200, { ok: true, revoked: cloudRevoked || localRevoked });
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
