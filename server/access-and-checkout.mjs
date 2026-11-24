import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoundedTtlMap } from './middleware/bounded-map.mjs';
import { resolveClientIp } from './middleware/client-ip.mjs';

const __ACCESS_DIR = path.dirname(fileURLToPath(import.meta.url));
let EMBEDDED_SUPABASE_PUBLIC = { url: '', publishableKey: '' };
try {
  EMBEDDED_SUPABASE_PUBLIC = JSON.parse(
    readFileSync(path.resolve(__ACCESS_DIR, '..', 'src', 'config', 'supabase-public.json'), 'utf8'),
  );
} catch {}

const EPHEMERAL_SHOWCASE_SECRET = randomBytes(32).toString('hex');

// Arredondamento monetário/crédito seguro em 2 casas decimais (evita drift IEEE-754)
export function roundCredits(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// Tabela Oficial de Custos de Créditos de IA (Margem protegida para páginas, artes e co-direção)
export const CREDIT_ACTION_COSTS = {
  glm_whatsapp: 0.1,
  generate_message_flows: 0.5,
  patch_micro: 0.5,
  edit_block: 1,
  generate_image_schnell: 1,
  generate_hero_dev: 2,
  edit_image_qwen: 1.5,
  co_direction_upgrade: 1.5,
  create_subpage: 4,
  create_subpage_campaign: 4,
  create_subpage_with_art: 6,
  generate_full_storefront: 12,
  generate_full_storefront_with_art: 18,
};

export const SHOWCASE_PROFILE_CODES = new Set([
  'AI10-FARM-LUME',
  'AI10-NATAL-VERT',
  'AI10-NATA-LVER',
  'AI10-NATAL-VER',
  'AI10-NATL-VERT',
  'AI10-BLCK-NORT',
  'AI10-CUID-MOTI',
  'AI10-DOCE-ATEL',
  'AI10-TECH-APEX',
]);
export const SHOWCASE_USER_IDS = {
  'AI10-FARM-LUME': 'bbbbbbbb-2222-4222-8222-222222222222',
  'AI10-NATAL-VERT': '11111111-1111-4111-8111-111111110001',
  'AI10-NATA-LVER': '11111111-1111-4111-8111-111111110001',
  'AI10-NATAL-VER': '11111111-1111-4111-8111-111111110001',
  'AI10-NATL-VERT': '11111111-1111-4111-8111-111111110001',
  'AI10-BLCK-NORT': '11111111-2222-4222-8222-111111110002',
  'AI10-CUID-MOTI': '11111111-3333-4333-8333-111111110003',
  'AI10-DOCE-ATEL': '11111111-4444-4444-8444-111111110004',
  'AI10-TECH-APEX': '11111111-5555-4555-8555-111111110005',
};

export function normalizeAccessCodeKey(raw) {
  const upper = String(raw || '').trim().toUpperCase();
  if (
    upper === 'AI10-NATA-LVER' ||
    upper === 'AI10-NATAL-VER' ||
    upper === 'AI10-NATL-VERT' ||
    upper === 'AI10NATALVERT' ||
    upper === 'AI10NATALVER'
  ) {
    return 'AI10-NATAL-VERT';
  }
  return upper;
}

function getLocalShowcaseHmacSecret() {
  if (process.env.CG_SHOWCASE_HMAC_SECRET) {
    return process.env.CG_SHOWCASE_HMAC_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    return EPHEMERAL_SHOWCASE_SECRET;
  }
  return createHash('sha256')
    .update(`companygen-local-showcase:${process.cwd()}:${process.env.GLM_API_KEY || 'dev-salt'}`)
    .digest('hex');
}

export function isLocalShowcaseEnabled() {
  if (process.env.NODE_ENV === 'production') {
    return process.env.ALLOW_LOCAL_SHOWCASE_PROFILES === '1';
  }
  return process.env.ALLOW_LOCAL_SHOWCASE_PROFILES !== '0';
}

export function issueLocalShowcaseToken(userId, email = 'sandbox@companygen.local', ttlSeconds = 86400) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      showcase: true,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', getLocalShowcaseHmacSecret()).update(payload).digest('base64url');
  return `cg-local-showcase.${payload}.${sig}`;
}

const UUID_REGEX = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function issueGuestInviteToken(userId, email) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      guest: true,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', getLocalShowcaseHmacSecret()).update(payload).digest('base64url');
  return `cg-local-showcase.${payload}.${sig}`;
}

export function verifyLocalShowcaseToken(bearer) {
  if (typeof bearer !== 'string' || !bearer.startsWith('cg-local-showcase.')) return null;
  const parts = bearer.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  const expectedSig = createHmac('sha256', getLocalShowcaseHmacSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed?.sub !== 'string' || !UUID_REGEX.test(parsed.sub)) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= Date.now()) return null;
    if (parsed.guest === true) {
      return { id: parsed.sub, email: String(parsed.email || 'guest@companygen.store'), isGuest: true };
    }
    if (!isLocalShowcaseEnabled() || !parsed?.showcase) return null;
    return { id: parsed.sub, email: String(parsed.email || 'sandbox@local') };
  } catch {
    return null;
  }
}

// Planos canônicos de crédito (FILA 11: alinhados a 0,1 cr/msg = R$ 0,04–0,05/msg)
export const CREDIT_PLANS = [
  {
    id: 'plan_100_brl',
    slug: 'plan_100_brl',
    name: 'Plano Profissional IA',
    credits: 250,
    priceCents: 10000,
    priceFormatted: 'R$ 100,00',
    pricePerCredit: 'R$ 0,40',
    pricePerMessage: 'R$ 0,04',
    estimatedMessages: 2500,
    savingsPercent: '20%',
    popular: true,
    kiwifyUrl: 'https://pay.kiwify.com.br/0USJqo5',
    description: '250 créditos (200 + 50 bônus): até 2.500 respostas da Sofia ou vitrine IA + 20 fotos + 2.260 msgs.',
  },
  {
    id: 'plan_micro_10',
    slug: 'plan_micro_10',
    name: 'Recarga Entrada',
    credits: 20,
    priceCents: 990,
    priceFormatted: 'R$ 9,90',
    pricePerCredit: 'R$ 0,50',
    pricePerMessage: 'R$ 0,05',
    estimatedMessages: 200,
    savingsPercent: null,
    popular: false,
    kiwifyUrl: 'https://pay.kiwify.com.br/7fBDYu4',
    description: '20 créditos: até 200 respostas da Sofia ou 1 vitrine IA + 4 fotos + 120 msgs no WhatsApp.',
  },
  {
    id: 'plan_growth_25',
    slug: 'plan_growth_25',
    name: 'Recarga Crescimento',
    credits: 55,
    priceCents: 2490,
    priceFormatted: 'R$ 24,90',
    pricePerCredit: 'R$ 0,45',
    pricePerMessage: 'R$ 0,045',
    estimatedMessages: 550,
    savingsPercent: '10%',
    popular: false,
    kiwifyUrl: 'https://pay.kiwify.com.br/O0ueDhe',
    description: '55 créditos (50 + 5 bônus): até 550 respostas da Sofia ou 2 vitrines + 10 fotos + 370 msgs.',
  },
];

// Códigos de convite padrão pré-autorizados
export const DEFAULT_ACCESS_CODES = [
  {
    code: 'AI10-A7K9-P2XM',
    hash: createHash('sha256').update('ai10-a7k9-p2xm').digest('hex'),
    masked: 'AI10-****-P2XM',
    credits: 250,
    maxRedemptions: 10,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
  },
  {
    code: 'AI10-PROD-2026',
    hash: createHash('sha256').update('ai10-prod-2026').digest('hex'),
    masked: 'AI10-****-2026',
    credits: 500,
    maxRedemptions: 50,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
  },
  {
    code: 'AI10-DEMO-SOF1',
    hash: createHash('sha256').update('ai10-demo-sof1').digest('hex'),
    masked: 'AI10-****-SOF1',
    credits: 100,
    maxRedemptions: 100,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
  },
  {
    code: 'AI10-NATAL-VERT',
    hash: createHash('sha256').update('ai10-natal-vert').digest('hex'),
    masked: 'AI10-****-VERT',
    credits: 120,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-NATA-LVER',
    hash: createHash('sha256').update('ai10-nata-lver').digest('hex'),
    masked: 'AI10-****-LVER',
    credits: 120,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-NATL-VERT',
    hash: createHash('sha256').update('ai10-natl-vert').digest('hex'),
    masked: 'AI10-****-VERT',
    credits: 120,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-BLCK-NORT',
    hash: createHash('sha256').update('ai10-blck-nort').digest('hex'),
    masked: 'AI10-****-NORT',
    credits: 120,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-CUID-MOTI',
    hash: createHash('sha256').update('ai10-cuid-moti').digest('hex'),
    masked: 'AI10-****-MOTI',
    credits: 150,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-DOCE-ATEL',
    hash: createHash('sha256').update('ai10-doce-atel').digest('hex'),
    masked: 'AI10-****-ATEL',
    credits: 100,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-TECH-APEX',
    hash: createHash('sha256').update('ai10-tech-apex').digest('hex'),
    masked: 'AI10-****-APEX',
    credits: 100,
    maxRedemptions: 999,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
    reusableInDev: true,
  },
  {
    code: 'AI10-TEST-100C',
    hash: createHash('sha256').update('ai10-test-100c').digest('hex'),
    masked: 'AI10-****-100C',
    credits: 100,
    maxRedemptions: 10,
    redemptionCount: 0,
    status: 'active',
    expiresAt: null,
  },
  {
    code: 'AI10-EXPI-2020',
    hash: createHash('sha256').update('ai10-expi-2020').digest('hex'),
    masked: 'AI10-****-2020',
    credits: 100,
    maxRedemptions: 5,
    redemptionCount: 0,
    status: 'active',
    expiresAt: '2020-01-01T00:00:00.000Z',
  },
  {
    code: 'AI10-USED-0001',
    hash: createHash('sha256').update('ai10-used-0001').digest('hex'),
    masked: 'AI10-****-0001',
    credits: 100,
    maxRedemptions: 1,
    redemptionCount: 1,
    status: 'depleted',
    lastRedeemedByEmail: 'usado@sandbox.local',
    expiresAt: null,
  },
  {
    code: 'AI10-FARM-LUME',
    hash: createHash('sha256').update('ai10-farm-lume').digest('hex'),
    masked: 'AI10-****-LUME',
    credits: 65,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: 'bbbbbbbb-2222-4222-8222-222222222222',
    showcaseUserId: 'bbbbbbbb-2222-4222-8222-222222222222',
    expiresAt: null,
  },
  {
    code: 'AI10-NATAL-VERT',
    hash: createHash('sha256').update('ai10-natal-vert').digest('hex'),
    masked: 'AI10-****-VERT',
    credits: 120,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-1111-4111-8111-111111110001',
    showcaseUserId: '11111111-1111-4111-8111-111111110001',
    expiresAt: null,
  },
  {
    code: 'AI10-NATA-LVER',
    hash: createHash('sha256').update('ai10-nata-lver').digest('hex'),
    masked: 'AI10-****-LVER',
    credits: 120,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-1111-4111-8111-111111110001',
    showcaseUserId: '11111111-1111-4111-8111-111111110001',
    expiresAt: null,
  },
  {
    code: 'AI10-NATAL-VER',
    hash: createHash('sha256').update('ai10-natal-ver').digest('hex'),
    masked: 'AI10-****-VER',
    credits: 120,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-1111-4111-8111-111111110001',
    showcaseUserId: '11111111-1111-4111-8111-111111110001',
    expiresAt: null,
  },
  {
    code: 'AI10-BLCK-NORT',
    hash: createHash('sha256').update('ai10-blck-nort').digest('hex'),
    masked: 'AI10-****-NORT',
    credits: 120,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-2222-4222-8222-111111110002',
    showcaseUserId: '11111111-2222-4222-8222-111111110002',
    expiresAt: null,
  },
  {
    code: 'AI10-CUID-MOTI',
    hash: createHash('sha256').update('ai10-cuid-moti').digest('hex'),
    masked: 'AI10-****-MOTI',
    credits: 150,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-3333-4333-8333-111111110003',
    showcaseUserId: '11111111-3333-4333-8333-111111110003',
    expiresAt: null,
  },
  {
    code: 'AI10-DOCE-ATEL',
    hash: createHash('sha256').update('ai10-doce-atel').digest('hex'),
    masked: 'AI10-****-ATEL',
    credits: 100,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-4444-4444-8444-111111110004',
    showcaseUserId: '11111111-4444-4444-8444-111111110004',
    expiresAt: null,
  },
  {
    code: 'AI10-TECH-APEX',
    hash: createHash('sha256').update('ai10-tech-apex').digest('hex'),
    masked: 'AI10-****-APEX',
    credits: 100,
    maxRedemptions: 500,
    redemptionCount: 0,
    status: 'active',
    reusableInDev: true,
    showcase: true,
    showcaseProfileId: '11111111-5555-4555-8555-111111110005',
    showcaseUserId: '11111111-5555-4555-8555-111111110005',
    expiresAt: null,
  },
];

// Serialização por diretório para evitar race condition no credits_ledger.json
const creditQueues = new Map();
export function serializeCreditOp(directory, job) {
  const key = path.resolve(directory);
  const prev = creditQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  creditQueues.set(key, next);
  return next.finally(() => {
    if (creditQueues.get(key) === next) creditQueues.delete(key);
  });
}

async function defaultReadJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function resolveSupabaseAdminConfig() {
  const url = String(
    process.env.CG_SUPABASE_URL || process.env.VITE_SUPABASE_URL || EMBEDDED_SUPABASE_PUBLIC.url || '',
  )
    .trim()
    .replace(/\/$/, '');
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const publishableKey = String(
    process.env.CG_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      EMBEDDED_SUPABASE_PUBLIC.publishableKey ||
      '',
  ).trim();
  return { url, serviceRoleKey, publishableKey };
}

export function isCloudCreditMode({ user, bearer } = {}) {
  if (process.env.CG_PERSISTENCE === 'local') return false;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  if (!url || !serviceRoleKey) return false;
  const effectiveBearer = bearer || user?.bearer || '';
  if (!effectiveBearer || typeof effectiveBearer !== 'string') return false;
  if (effectiveBearer.startsWith('cg-local-showcase.') || user?.isLocalShowcase) return false;
  if (!user?.id || !UUID_REGEX.test(user.id)) return false;
  return true;
}

export function mapActionToDbOperationType(action) {
  switch (String(action || '').trim()) {
    case 'glm_whatsapp':
      return 'whatsapp_reply_consumed';
    case 'generate_full_storefront':
    case 'generate_full_storefront_with_art':
      return 'generate_storefront';
    case 'patch_micro':
    case 'edit_block':
    case 'create_subpage':
    case 'create_subpage_campaign':
    case 'create_subpage_with_art':
    case 'co_direction_upgrade':
      return 'edit_storefront';
    case 'generate_image_schnell':
    case 'generate_hero_dev':
    case 'edit_image_qwen':
      return 'generate_image';
    case 'failure_refund':
      return 'failure_refund';
    default:
      return 'edit_storefront';
  }
}

async function supabaseRestFetch({
  url,
  apiKey,
  authToken,
  route,
  method = 'GET',
  body,
  fetchImpl = globalThis.fetch,
}) {
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${authToken || apiKey}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetchImpl(`${url}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  const payload = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload };
}

function buildDebitReferenceId(rawRef) {
  const clean = String(rawRef || '').trim();
  if (!clean) return `debit:${randomUUID()}`;
  return clean.startsWith('debit:') ? clean : `debit:${clean}`;
}

function buildRefundReferenceId(rawRef) {
  const clean = String(rawRef || '').trim();
  if (!clean) return `refund:${randomUUID()}`;
  if (clean.startsWith('refund:')) return clean;
  if (clean.startsWith('debit:')) return `refund:${clean.slice('debit:'.length)}`;
  return `refund:${clean}`;
}

export async function getCreditBalance({
  user,
  bearer,
  directory,
  readJsonFile = defaultReadJsonFile,
  fetchImpl = globalThis.fetch,
}) {
  if (isCloudCreditMode({ user, bearer })) {
    const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
    const res = await supabaseRestFetch({
      url,
      apiKey: serviceRoleKey,
      route: '/rest/v1/rpc/cg_get_user_credit_balance',
      method: 'POST',
      body: { p_user_id: user.id },
      fetchImpl,
    }).catch(() => null);
    if (!res || !res.ok) {
      const err = new Error('Não foi possível consultar o saldo no Supabase.');
      err.status = 503;
      throw err;
    }
    return Math.max(0, Number(res.payload || 0));
  }
  const ledgerPath = path.join(directory, 'credits_ledger.json');
  const ledger = await readJsonFile(ledgerPath, []);
  if (!Array.isArray(ledger) || ledger.length === 0) return 0;
  return Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0));
}

export function resolveActionCost(action, amount) {
  if (amount !== undefined && amount !== null && amount !== '' && Number.isFinite(Number(amount)) && Number(amount) >= 0) {
    return roundCredits(amount);
  }
  return Math.max(0, roundCredits(CREDIT_ACTION_COSTS[action] ?? 0));
}

export async function getCreditLockState({
  user,
  directory,
  readJsonFile = defaultReadJsonFile,
}) {
  if (!directory) return { locked: false, reviewFlag: null, shortfallCredits: 0, note: '' };
  const lockPath = path.join(directory, 'cg_credit_lock.json');
  const lockRaw = await readJsonFile(lockPath, null);
  if (lockRaw && typeof lockRaw === 'object' && lockRaw.reviewFlag === 'NEGATIVE_BALANCE_REVIEW') {
    return {
      locked: true,
      reviewFlag: 'NEGATIVE_BALANCE_REVIEW',
      shortfallCredits: Math.max(0, Number(lockRaw.shortfallCredits || 0)),
      note: String(lockRaw.note || 'Saldo em revisão após estorno/chargeback.'),
      userId: user?.id || lockRaw.userId || '',
    };
  }
  return { locked: false, reviewFlag: null, shortfallCredits: 0, note: '' };
}

export async function applyKiwifyReversalLocal({
  userId,
  directory,
  creditsToReverse,
  orderId,
  eventType = 'chargeback',
  readJsonFile = defaultReadJsonFile,
  atomicWriteJson,
}) {
  const reversal = Math.max(0, roundCredits(creditsToReverse || 0));
  const refId = `kiwify:${String(orderId || '').trim()}:${String(eventType || 'chargeback').trim()}`;
  return serializeCreditOp(directory, async () => {
    const ledgerPath = path.join(directory, 'credits_ledger.json');
    const lockPath = path.join(directory, 'cg_credit_lock.json');
    const rawLedger = await readJsonFile(ledgerPath, []);
    const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
    const existing = ledger.find((entry) => entry?.reference_id === refId);
    if (existing) {
      const lockState = await getCreditLockState({ user: { id: userId }, directory, readJsonFile });
      return {
        ok: true,
        duplicate: true,
        balance: Math.max(0, roundCredits(existing.balance_after || 0)),
        appliedDelta: 0,
        shortfallCredits: lockState.shortfallCredits,
        reviewFlag: lockState.reviewFlag,
      };
    }

    const prevBalance = ledger.length > 0 ? Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    const prevLock = await readJsonFile(lockPath, null);
    let shortfall = Math.max(0, roundCredits(prevLock?.shortfallCredits || 0));
    let nextBalance = 0;
    let appliedDelta = 0;
    if (prevBalance >= reversal) {
      appliedDelta = roundCredits(-reversal);
      nextBalance = roundCredits(prevBalance - reversal);
    } else {
      appliedDelta = roundCredits(-prevBalance);
      nextBalance = 0;
      shortfall = roundCredits(shortfall + (reversal - prevBalance));
    }

    const now = new Date().toISOString();
    ledger.push({
      id: randomUUID(),
      user_id: userId || 'local-user',
      delta: appliedDelta,
      balance_after: nextBalance,
      operation_type: eventType === 'order_refunded' ? 'order_refunded' : 'chargeback',
      reference_id: refId,
      metadata: {
        orderId,
        requested_credits: reversal,
        shortfall_credits: shortfall,
      },
      created_at: now,
    });

    const writeAtomic = async (targetPath, payload) => {
      if (typeof atomicWriteJson === 'function') {
        await atomicWriteJson(targetPath, payload);
      } else {
        const { mkdir, rename, writeFile } = await import('node:fs/promises');
        await mkdir(directory, { recursive: true });
        const tmp = `${targetPath}.${randomUUID()}.tmp`;
        await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
        await rename(tmp, targetPath);
      }
    };

    await writeAtomic(ledgerPath, ledger);
    const reviewFlag = shortfall > 0 ? 'NEGATIVE_BALANCE_REVIEW' : null;
    await writeAtomic(lockPath, {
      userId,
      reviewFlag,
      shortfallCredits: shortfall,
      note: shortfall > 0 ? `Chargeback ${orderId} excedeu saldo em ${shortfall} cr.` : '',
      updatedAt: now,
    });

    return {
      ok: true,
      duplicate: false,
      balance: nextBalance,
      appliedDelta,
      shortfallCredits: shortfall,
      reviewFlag,
    };
  });
}

export async function ensureSufficientCredits({
  user,
  bearer,
  directory,
  action,
  amount,
  readJsonFile = defaultReadJsonFile,
  fetchImpl = globalThis.fetch,
}) {
  const lockState = await getCreditLockState({ user, directory, readJsonFile });
  if (lockState.locked) {
    return {
      ok: false,
      status: 403,
      error: 'NEGATIVE_BALANCE_REVIEW',
      message: lockState.note || 'Conta em revisão por estorno/chargeback.',
      shortfallCredits: lockState.shortfallCredits,
      balance: 0,
    };
  }
  const required = resolveActionCost(action, amount);
  const balance = await getCreditBalance({ user, bearer, directory, readJsonFile, fetchImpl });
  if (required <= 0) {
    return { ok: true, required: 0, balance };
  }
  if (balance < required) {
    return {
      ok: false,
      status: 402,
      error: 'INSUFFICIENT_CREDITS',
      required,
      balance,
    };
  }
  return { ok: true, required, balance };
}

const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function writeAlertDispatchUnsafe({
  userId,
  directory,
  alertType,
  details = {},
  readJsonFile,
  atomicWriteJson,
  nowMs = Date.now(),
  cooldownHours = 24,
}) {
  if (!directory || !alertType) return { dispatched: false, reason: 'missing_params' };
  const filePath = path.join(directory, 'cg_alert_dispatches.json');
  const existingRaw = typeof readJsonFile === 'function' ? await readJsonFile(filePath, {}) : {};
  const state =
    existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
      ? { ...existingRaw }
      : { byType: {}, dispatches: [] };
  const byType = state.byType && typeof state.byType === 'object' ? { ...state.byType } : {};
  const dispatches = Array.isArray(state.dispatches) ? [...state.dispatches] : [];
  const prevMs = byType[alertType] ? Date.parse(String(byType[alertType])) : 0;
  const windowMs = Math.max(1, Number(cooldownHours || 24)) * 60 * 60 * 1000;

  if (Number.isFinite(prevMs) && prevMs > 0 && nowMs - prevMs < windowMs) {
    return {
      dispatched: false,
      suppressedByCooldown: true,
      alertType,
      cooldownRemainingMs: windowMs - (nowMs - prevMs),
      totalDispatchesForType: dispatches.filter((d) => d?.alertType === alertType).length,
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  const record = {
    id: randomUUID(),
    userId: userId || 'local-user',
    alertType,
    details,
    sentAt: nowIso,
  };
  byType[alertType] = nowIso;
  dispatches.unshift(record);

  const nextState = {
    byType,
    dispatches: dispatches.slice(0, 100),
  };
  if (typeof atomicWriteJson === 'function') {
    await atomicWriteJson(filePath, nextState);
  } else {
    const { mkdir, rename, writeFile } = await import('node:fs/promises');
    await mkdir(directory, { recursive: true });
    const tmp = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(nextState, null, 2), 'utf8');
    await rename(tmp, filePath);
  }

  return {
    dispatched: true,
    suppressedByCooldown: false,
    alertType,
    record,
    totalDispatchesForType: dispatches.filter((d) => d?.alertType === alertType).length,
  };
}

export async function checkAndRecordOperationalAlert({
  user,
  directory,
  alertType,
  details = {},
  readJsonFile,
  atomicWriteJson,
  nowMs = Date.now(),
  cooldownHours = 24,
}) {
  return serializeCreditOp(directory, () =>
    writeAlertDispatchUnsafe({
      userId: user?.id || 'local-user',
      directory,
      alertType,
      details,
      readJsonFile,
      atomicWriteJson,
      nowMs,
      cooldownHours: Math.max(1, cooldownHours || ALERT_COOLDOWN_MS / (60 * 60 * 1000)),
    }),
  );
}

export async function debitCredits({
  user,
  bearer,
  directory,
  action,
  amount,
  metadata = {},
  readJsonFile = defaultReadJsonFile,
  atomicWriteJson,
  fetchImpl = globalThis.fetch,
}) {
  const lockState = await getCreditLockState({ user, directory, readJsonFile });
  if (lockState.locked) {
    return {
      ok: false,
      status: 403,
      error: 'NEGATIVE_BALANCE_REVIEW',
      message: lockState.note || 'Conta em revisão por estorno/chargeback.',
      shortfallCredits: lockState.shortfallCredits,
      balance: 0,
    };
  }
  const cost = resolveActionCost(action, amount);
  if (cost <= 0) {
    const balance = await getCreditBalance({ user, bearer, directory, readJsonFile, fetchImpl });
    return { ok: true, debited: 0, balanceBefore: balance, balanceAfter: balance, entry: null };
  }
  const debitRef = buildDebitReferenceId(metadata?.referenceId);

  if (isCloudCreditMode({ user, bearer })) {
    const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
    return serializeCreditOp(`cloud:${user.id}`, async () => {
      const res = await supabaseRestFetch({
        url,
        apiKey: serviceRoleKey,
        route: '/rest/v1/rpc/cg_debit_credits',
        method: 'POST',
        body: {
          p_user_id: user.id,
          p_cost: cost,
          p_operation_type: mapActionToDbOperationType(action),
          p_reference_id: debitRef,
          p_metadata: { ...(metadata || {}), action },
        },
        fetchImpl,
      }).catch(() => null);
      if (!res || !res.ok || !res.payload || typeof res.payload !== 'object') {
        const err = new Error('Não foi possível debitar créditos no Supabase.');
        err.status = 503;
        throw err;
      }
      if (res.payload.success === false && res.payload.error === 'INSUFFICIENT_CREDITS') {
        return {
          ok: false,
          status: 402,
          error: 'INSUFFICIENT_CREDITS',
          required: cost,
          balance: Math.max(0, Number(res.payload.balance || 0)),
        };
      }
      if (res.payload.success !== true) {
        const err = new Error('Falha ao registrar débito de créditos.');
        err.status = 503;
        throw err;
      }
      const balanceBefore = Math.max(0, roundCredits(res.payload.balance_before ?? res.payload.balance_after ?? 0));
      const balanceAfter = Math.max(0, roundCredits(res.payload.balance_after ?? 0));
      const entry = {
        id: debitRef,
        db_entry_id: res.payload.entry_id || null,
        user_id: user.id,
        delta: roundCredits(-Number(res.payload.debited ?? cost)),
        balance_after: balanceAfter,
        operation_type: `debit_${action}`,
        action,
        reference_id: debitRef,
        metadata,
        created_at: new Date().toISOString(),
      };
      let lowCreditAlert = null;
      if (balanceAfter < 2) {
        lowCreditAlert = await writeAlertDispatchUnsafe({
          userId: user.id,
          directory,
          alertType: 'low_credits_2',
          details: { balanceAfter, action },
          readJsonFile,
          atomicWriteJson,
        }).catch(() => null);
      }
      return {
        ok: true,
        debited: roundCredits(res.payload.debited ?? cost),
        balanceBefore,
        balanceAfter,
        entry,
        lowCreditAlert,
      };
    });
  }

  return serializeCreditOp(directory, async () => {
    const ledgerPath = path.join(directory, 'credits_ledger.json');
    const rawLedger = await readJsonFile(ledgerPath, []);
    const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
    const balanceBefore = ledger.length > 0 ? Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    if (balanceBefore + 1e-9 < cost) {
      return {
        ok: false,
        status: 402,
        error: 'INSUFFICIENT_CREDITS',
        required: cost,
        balance: balanceBefore,
      };
    }
    const balanceAfter = Math.max(0, roundCredits(balanceBefore - cost));
    const entry = {
      id: randomUUID(),
      user_id: user?.id || 'local-user',
      delta: roundCredits(-cost),
      balance_after: balanceAfter,
      operation_type: `debit_${action}`,
      action,
      reference_id: metadata?.referenceId || randomUUID(),
      metadata,
      created_at: new Date().toISOString(),
    };
    ledger.push(entry);
    if (typeof atomicWriteJson === 'function') {
      await atomicWriteJson(ledgerPath, ledger);
    } else {
      const { mkdir, rename, writeFile } = await import('node:fs/promises');
      await mkdir(directory, { recursive: true });
      const tmp = `${ledgerPath}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(ledger, null, 2), 'utf8');
      await rename(tmp, ledgerPath);
    }
    let lowCreditAlert = null;
    if (balanceAfter < 2) {
      lowCreditAlert = await writeAlertDispatchUnsafe({
        userId: user?.id || 'local-user',
        directory,
        alertType: 'low_credits_2',
        details: { balanceAfter, action },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => null);
    }
    return {
      ok: true,
      debited: cost,
      balanceBefore,
      balanceAfter,
      entry,
      lowCreditAlert,
    };
  });
}

export async function refundCredits({
  user,
  bearer,
  directory,
  action,
  amount,
  metadata = {},
  readJsonFile = defaultReadJsonFile,
  atomicWriteJson,
  fetchImpl = globalThis.fetch,
}) {
  const credit = resolveActionCost(action, amount);
  if (credit <= 0) {
    const balance = await getCreditBalance({ user, bearer, directory, readJsonFile, fetchImpl });
    return { ok: true, refunded: 0, balanceAfter: balance, entry: null };
  }
  const refundRef = buildRefundReferenceId(metadata?.referenceId);

  if (isCloudCreditMode({ user, bearer })) {
    const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
    return serializeCreditOp(`cloud:${user.id}`, async () => {
      const res = await supabaseRestFetch({
        url,
        apiKey: serviceRoleKey,
        route: '/rest/v1/rpc/cg_refund_credits',
        method: 'POST',
        body: {
          p_user_id: user.id,
          p_amount: credit,
          p_reference_id: refundRef,
          p_operation_type: 'failure_refund',
          p_metadata: { ...(metadata || {}), action },
        },
        fetchImpl,
      }).catch(() => null);
      if (!res || !res.ok || !res.payload || res.payload.success !== true) {
        const err = new Error('Não foi possível estornar créditos no Supabase.');
        err.status = 503;
        throw err;
      }
      const balanceBefore = Math.max(0, Number(res.payload.balance_before ?? res.payload.balance_after ?? 0));
      const balanceAfter = Math.max(0, Number(res.payload.balance_after ?? 0));
      const entry = {
        id: refundRef,
        db_entry_id: res.payload.entry_id || null,
        user_id: user.id,
        delta: Number(res.payload.refunded ?? credit),
        balance_after: balanceAfter,
        operation_type: `refund_${action}`,
        action,
        reference_id: refundRef,
        metadata,
        created_at: new Date().toISOString(),
      };
      return {
        ok: true,
        refunded: Number(res.payload.refunded ?? credit),
        balanceBefore,
        balanceAfter,
        entry,
      };
    });
  }

  return serializeCreditOp(directory, async () => {
    const ledgerPath = path.join(directory, 'credits_ledger.json');
    const rawLedger = await readJsonFile(ledgerPath, []);
    const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
    const balanceBefore = ledger.length > 0 ? Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    const balanceAfter = roundCredits(balanceBefore + credit);
    const entry = {
      id: randomUUID(),
      user_id: user?.id || 'local-user',
      delta: credit,
      balance_after: balanceAfter,
      operation_type: `refund_${action}`,
      action,
      reference_id: metadata?.referenceId || randomUUID(),
      metadata,
      created_at: new Date().toISOString(),
    };
    ledger.push(entry);
    if (typeof atomicWriteJson === 'function') {
      await atomicWriteJson(ledgerPath, ledger);
    } else {
      const { mkdir, rename, writeFile } = await import('node:fs/promises');
      await mkdir(directory, { recursive: true });
      const tmp = `${ledgerPath}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(ledger, null, 2), 'utf8');
      await rename(tmp, ledgerPath);
    }
    return {
      ok: true,
      refunded: credit,
      balanceBefore,
      balanceAfter,
      entry,
    };
  });
}

// Rate Limiter em memória por workspace + IP com teto LRU + TTL (evita vazamento de RAM)
const rateLimitMap = new BoundedTtlMap({ maxEntries: 3000, defaultTtlMs: 3600_000 });
function checkRateLimit(bucketKey, maxAttempts = 5, windowMs = 60 * 1000) {
  const now = Date.now();

  const entry = rateLimitMap.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(bucketKey, entry, Math.max(windowMs, entry.resetAt - now));

  return {
    allowed: entry.count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function computeSha256(text) {
  return createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex');
}

export function generateFakePixPayload(amountCents, orderRef) {
  const amountStr = (amountCents / 100).toFixed(2);
  const txid = (orderRef || randomUUID().slice(0, 8)).toUpperCase();
  // String compacta no formato EMVCo PIX Banco Central do Brasil
  return `00020126580014br.gov.bcb.pix0136companygen-pix-key@bcb.gov.br520400005303986540${amountStr.length < 10 ? '0' + amountStr.length : amountStr}${amountStr}5802BR5910COMPANYGEN6009SAO PAULO62070503${txid}6304`;
}

export async function handleAccessAndCheckoutRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const { user, bearer: ctxBearer, directory, readJson, send, ApiError, readJsonFile, atomicWriteJson, fetchImpl } = ctx;
  const effectiveBearer = ctxBearer || user?.bearer || '';
  const cloudFetch = fetchImpl || globalThis.fetch;

  const codesPath = path.join(directory, '..', '_shared_access_codes.json');
  const guestClaimsPath = path.join(directory, '..', '_shared_guest_claims.json');
  const ledgerPath = path.join(directory, 'credits_ledger.json');
  const ordersPath = path.join(directory, 'payment_orders.json');

  function maskEmailForHint(rawEmail) {
    const clean = String(rawEmail || '').trim().toLowerCase();
    const at = clean.indexOf('@');
    if (at <= 0) return '';
    const local = clean.slice(0, at);
    const domain = clean.slice(at + 1);
    const prefix = local.slice(0, Math.min(2, local.length));
    return `${prefix}***@${domain}`;
  }

  function isGuestPlaceholderEmail(rawEmail) {
    const clean = String(rawEmail || '').trim().toLowerCase();
    return !clean || clean.endsWith('@guest.companygen.store') || clean.endsWith('@sandbox.local');
  }

  async function readGuestStoreSummary(guestUserId) {
    if (!guestUserId || !UUID_REGEX.test(guestUserId)) return { balance: 0, storeName: '' };
    const guestDir = path.resolve(path.dirname(directory), guestUserId);
    const rawLedger = await readJsonFile(path.join(guestDir, 'credits_ledger.json'), []);
    const balance =
      Array.isArray(rawLedger) && rawLedger.length > 0
        ? Math.max(0, roundCredits(rawLedger[rawLedger.length - 1]?.balance_after || 0))
        : 0;
    const rawProfile = await readJsonFile(path.join(guestDir, 'profile.json'), null);
    const storeName = String(rawProfile?.data?.business?.name || rawProfile?.business?.name || '').trim();
    return { balance, storeName };
  }

  async function rewriteCopiedStoreUrls(filePath, oldUserId, newUserId) {
    try {
      const raw = await readFile(filePath, 'utf8');
      if (!raw.includes(oldUserId)) return;
      const updated = raw.split(oldUserId).join(newUserId);
      await writeFile(filePath, updated, 'utf8');
    } catch {}
  }

  async function migrateGuestWorkspaceDirectory({ guestUserId, targetUserId }) {
    const rootDir = path.dirname(directory);
    const guestDir = path.resolve(rootDir, guestUserId);
    const targetDir = path.resolve(rootDir, targetUserId);
    await mkdir(targetDir, { recursive: true });

    let entries = [];
    try {
      entries = await readdir(guestDir);
    } catch {
      return { copied: 0 };
    }

    const existingTargetProfile = await readJsonFile(path.join(targetDir, 'profile.json'), { revision: 0, data: {} });
    const targetHasStore =
      Number(existingTargetProfile?.revision || 0) > 0 ||
      Boolean(existingTargetProfile?.data?.business?.name) ||
      (Array.isArray(existingTargetProfile?.data?.catalog?.products) &&
        existingTargetProfile.data.catalog.products.length > 0);

    let copied = 0;
    for (const entry of entries) {
      if (entry === 'worker.lock' || entry === 'credits_ledger.json') continue;
      const srcPath = path.join(guestDir, entry);
      const dstPath = path.join(targetDir, entry);
      const srcStat = await stat(srcPath).catch(() => null);
      if (!srcStat) continue;

      let dstExists = false;
      try {
        await stat(dstPath);
        dstExists = true;
      } catch {}

      if (srcStat.isDirectory()) {
        const shouldOverwrite = entry === 'storefront-molde' && !targetHasStore;
        await cp(srcPath, dstPath, { recursive: true, force: shouldOverwrite, errorOnExist: false });
        copied += 1;
        if (entry === 'storefront-molde') {
          await rewriteCopiedStoreUrls(path.join(dstPath, 'data', 'formulas-ir.json'), guestUserId, targetUserId);
          await rewriteCopiedStoreUrls(path.join(dstPath, 'data', 'image-jobs.json'), guestUserId, targetUserId);
          await rewriteCopiedStoreUrls(path.join(dstPath, 'data', 'storefront.json'), guestUserId, targetUserId);
        }
      } else {
        if (!dstExists || !targetHasStore) {
          await cp(srcPath, dstPath, { force: !dstExists || !targetHasStore });
          await rewriteCopiedStoreUrls(dstPath, guestUserId, targetUserId);
          copied += 1;
        }
      }
    }
    return { copied };
  }

  // Helper para carregar códigos compartilhados locais (nunca expõe códigos dev em produção sem showcase explícito)
  async function loadAccessCodes() {
    if (!isLocalShowcaseEnabled()) {
      const data = await readJsonFile(codesPath, null).catch(() => null);
      if (Array.isArray(data)) {
        const defaultHashes = new Set(DEFAULT_ACCESS_CODES.map((d) => d.hash));
        return data.filter((item) => !defaultHashes.has(item?.hash));
      }
      return [];
    }
    try {
      const data = await readJsonFile(codesPath, null);
      if (Array.isArray(data) && data.length > 0) {
        const merged = [...data];
        for (const def of DEFAULT_ACCESS_CODES) {
          const idx = merged.findIndex((item) => item.hash === def.hash);
          if (idx === -1) {
            merged.push({ ...def });
          } else if (def.reusableInDev) {
            merged[idx] = { ...merged[idx], ...def, status: 'active' };
          }
        }
        return merged;
      }
    } catch {}
    return DEFAULT_ACCESS_CODES.map((c) => ({ ...c }));
  }

  // 0. GET /api/access/showcase-status (Público)
  if (pathname === '/api/access/showcase-status') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    return send(res, 200, {
      ok: true,
      enabled: isLocalShowcaseEnabled(),
      codes: isLocalShowcaseEnabled() ? Array.from(SHOWCASE_PROFILE_CODES) : [],
    });
  }

  // 0b. POST /api/access/guest-start (Cria ou retoma sessão convidada única enquanto o código ainda não tiver e-mail vinculado)
  if (pathname === '/api/access/guest-start') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const clientIp = resolveClientIp(req);
    const maxGuestAttempts = process.env.NODE_ENV === 'production' ? 30 : 120;
    const rate = checkRateLimit(`guest-start:${path.dirname(directory)}:${clientIp}`, maxGuestAttempts, 3600_000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas sessões convidadas neste IP. Aguarde ${rate.retryAfterSeconds}s.`);
    }
    const body = await readJson(req, 4096);
    let rawCode = normalizeAccessCodeKey(String(body?.code || body?.inviteCode || '').trim().toUpperCase());
    if (!/^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(rawCode)) {
      throw new ApiError(400, 'Informe um código de convite válido no formato AI10-XXXX-XXXX.');
    }
    const codeHash = computeSha256(rawCode);
    const codes = await loadAccessCodes();
    let found = codes.find((c) => c.hash === codeHash);

    const adminCfg = resolveSupabaseAdminConfig();
    if (!found && process.env.CG_PERSISTENCE !== 'local' && adminCfg.url && adminCfg.serviceRoleKey) {
      const cloudRes = await supabaseRestFetch({
        url: adminCfg.url,
        apiKey: adminCfg.serviceRoleKey,
        route: `/rest/v1/cg_access_codes?code_hash=eq.${encodeURIComponent(codeHash)}&select=id,credits,code_masked,max_redemptions,redemption_count,expires_at,status,last_redeemed_by_email&limit=1`,
        method: 'GET',
        fetchImpl: cloudFetch,
      }).catch(() => null);
      const row = cloudRes?.ok && Array.isArray(cloudRes.payload) ? cloudRes.payload[0] : null;
      if (row) {
        found = {
          hash: codeHash,
          credits: Number(row.credits || 0),
          masked: row.code_masked,
          maxRedemptions: Number(row.max_redemptions || 1),
          redemptionCount: Number(row.redemption_count || 0),
          lastRedeemedByEmail: row.last_redeemed_by_email || null,
          status: row.status,
          active: row.status !== 'revoked',
        };
      }
    }
    if (!found && SHOWCASE_PROFILE_CODES.has(rawCode)) {
      found = {
        hash: codeHash,
        credits: 100,
        masked: rawCode,
        active: true,
        reusableInDev: true,
      };
    }
    if (!found || found.active === false || found.status === 'revoked') {
      throw new ApiError(404, 'Código de convite não encontrado ou inativo.');
    }
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
      throw new ApiError(400, 'Este código de convite expirou.');
    }

    const guestResult = await serializeCreditOp(guestClaimsPath, () =>
      serializeCreditOp(codesPath, async () => {
        const claimsRaw = await readJsonFile(guestClaimsPath, {});
        const claims = claimsRaw && typeof claimsRaw === 'object' && !Array.isArray(claimsRaw) ? { ...claimsRaw } : {};
        const existingClaim = claims[codeHash] || null;
        const linkedEmail =
          (existingClaim?.claimedByEmail && !isGuestPlaceholderEmail(existingClaim.claimedByEmail)
            ? existingClaim.claimedByEmail
            : null) ||
          (found.lastRedeemedByEmail && !isGuestPlaceholderEmail(found.lastRedeemedByEmail)
            ? found.lastRedeemedByEmail
            : null);

        if (linkedEmail && !found.reusableInDev) {
          const maskedEmail = maskEmailForHint(linkedEmail);
          throw new ApiError(
            409,
            maskedEmail
              ? `Este código já foi reivindicado pelo e-mail ${maskedEmail}. Faça login com esse e-mail.`
              : 'Este código já foi reivindicado por uma conta com e-mail cadastrado. Faça login com esse e-mail.',
          );
        }

        if (
          !existingClaim?.guestUserId &&
          !found.reusableInDev &&
          linkedEmail &&
          (found.status === 'depleted' || Number(found.redemptionCount || 0) >= Number(found.maxRedemptions || 1))
        ) {
          throw new ApiError(409, 'Este código já atingiu o limite máximo de ativações.');
        }

        const nowIso = new Date().toISOString();
        const isResumingGuest = Boolean(existingClaim?.guestUserId && UUID_REGEX.test(existingClaim.guestUserId));
        const guestUserId = isResumingGuest ? existingClaim.guestUserId : randomUUID();
        const guestDir = path.resolve(path.dirname(directory), guestUserId);
        const guestLedgerPath = path.join(guestDir, 'credits_ledger.json');
        const initialCredits = Math.max(0, roundCredits(found.credits || 100));

        let currentBalance = initialCredits;
        if (isResumingGuest) {
          const existingLedger = await readJsonFile(guestLedgerPath, []);
          if (Array.isArray(existingLedger) && existingLedger.length > 0) {
            currentBalance = Math.max(0, roundCredits(existingLedger[existingLedger.length - 1]?.balance_after || 0));
          } else {
            await atomicWriteJson(guestLedgerPath, [
              {
                id: randomUUID(),
                user_id: guestUserId,
                delta: initialCredits,
                balance_after: initialCredits,
                operation_type: 'guest_invite_start',
                reference_id: found.hash,
                metadata: { code_masked: found.masked, isGuest: true },
                created_at: nowIso,
              },
            ]);
          }
        } else {
          await atomicWriteJson(guestLedgerPath, [
            {
              id: randomUUID(),
              user_id: guestUserId,
              delta: initialCredits,
              balance_after: initialCredits,
              operation_type: 'guest_invite_start',
              reference_id: found.hash,
              metadata: { code_masked: found.masked, isGuest: true },
              created_at: nowIso,
            },
          ]);
        }

        claims[codeHash] = {
          codeHash,
          codeMasked: found.masked || rawCode,
          guestUserId,
          initialCredits,
          claimedByEmail: null,
          claimedByUserId: null,
          guestStartedAt: existingClaim?.guestStartedAt || nowIso,
          lastResumedAt: nowIso,
          claimedAt: null,
        };
        await atomicWriteJson(guestClaimsPath, claims);

        // Mantém referência de sessão convidada também no JSON compartilhado local sem marcar e-mail definitivo
        const localCodes = await readJsonFile(codesPath, null);
        if (Array.isArray(localCodes)) {
          const idx = localCodes.findIndex((c) => c.hash === codeHash);
          if (idx !== -1) {
            localCodes[idx] = {
              ...localCodes[idx],
              guestUserId,
              emailClaimed: false,
              guestStartedAt: claims[codeHash].guestStartedAt,
            };
            await atomicWriteJson(codesPath, localCodes);
          }
        }

        const guestEmail = `guest.${guestUserId.slice(0, 8)}@guest.companygen.store`;
        const token = issueGuestInviteToken(guestUserId, guestEmail);
        return {
          ok: true,
          resumed: isResumingGuest,
          claimedWithoutEmail: true,
          token,
          user: { id: guestUserId, email: guestEmail, isGuest: true },
          code: rawCode,
          credits: currentBalance,
          balance: currentBalance,
          isGuest: true,
        };
      }),
    );
    return send(res, 200, guestResult);
  }

  if (pathname === '/api/access/local-showcase-login') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    if (!isLocalShowcaseEnabled()) {
      throw new ApiError(403, 'Login sandbox local desabilitado neste ambiente.');
    }
    const clientIp = resolveClientIp(req);
    const rate = checkRateLimit(`showcase-login:${path.dirname(directory)}:${clientIp}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas tentativas. Aguarde ${rate.retryAfterSeconds} segundos.`);
    }
    const body = await readJson(req, 4096);
    let rawCode = normalizeAccessCodeKey(String(body?.code || '').trim().toUpperCase());
    if (!rawCode) throw new ApiError(400, 'Informe o código de acesso.');
    const codes = await loadAccessCodes();
    const codeHash = computeSha256(rawCode);
    let found = codes.find((c) => c.hash === codeHash);

    const adminCfg = resolveSupabaseAdminConfig();
    if (!found && process.env.CG_PERSISTENCE !== 'local' && adminCfg.url && adminCfg.serviceRoleKey) {
      const cloudRes = await supabaseRestFetch({
        url: adminCfg.url,
        apiKey: adminCfg.serviceRoleKey,
        route: `/rest/v1/cg_access_codes?code_hash=eq.${encodeURIComponent(codeHash)}&select=id,credits,code_masked,max_redemptions,redemption_count,expires_at,status&limit=1`,
        method: 'GET',
        fetchImpl: cloudFetch,
      }).catch(() => null);
      const row = cloudRes?.ok && Array.isArray(cloudRes.payload) ? cloudRes.payload[0] : null;
      if (row) {
        found = {
          hash: codeHash,
          credits: Number(row.credits || 0),
          masked: row.code_masked,
          status: row.status,
          active: row.status !== 'revoked',
        };
      }
    }
    if (!found && SHOWCASE_PROFILE_CODES.has(rawCode)) {
      found = {
        hash: codeHash,
        credits: 100,
        masked: rawCode,
        active: true,
      };
    }
    if (!found || !SHOWCASE_PROFILE_CODES.has(rawCode)) {
      throw new ApiError(404, 'Código sandbox não encontrado.');
    }
    const userId = found.showcaseUserId || SHOWCASE_USER_IDS[rawCode] || SHOWCASE_USER_IDS['AI10-FARM-LUME'];
    const showcaseDir = path.resolve(path.dirname(directory), userId);
    const showcaseLedgerPath = path.join(showcaseDir, 'credits_ledger.json');
    const existingLedger = await readJsonFile(showcaseLedgerPath, []);
    let balance = Array.isArray(existingLedger) && existingLedger.length > 0
      ? Number(existingLedger[existingLedger.length - 1]?.balance_after || 0)
      : 0;
    if (!Array.isArray(existingLedger) || existingLedger.length === 0) {
      const nextLedger = [
        {
          id: randomUUID(),
          user_id: userId,
          delta: found.credits,
          balance_after: found.credits,
          operation_type: 'welcome_invite',
          reference_id: found.hash,
          metadata: { code_masked: found.masked, showcase: true },
          created_at: new Date().toISOString(),
        },
      ];
      await atomicWriteJson(showcaseLedgerPath, nextLedger);
      balance = found.credits;
    }
    const email = `${rawCode.toLowerCase().replace(/[^a-z0-9]/g, '.')}@sandbox.local`;
    const token = issueLocalShowcaseToken(userId, email);
    return send(res, 200, {
      ok: true,
      token,
      user: { id: userId, email },
      code: rawCode,
      credits: found.credits,
      balance,
    });
  }

  // 1. POST /api/access/validate (Público, Rate Limited; dryRun usa balde isolado para não bloquear digitação)
  if (pathname === '/api/access/validate') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');

    const body = await readJson(req, 4096);
    const isDryRun = Boolean(body?.dryRun);
    const clientIp = resolveClientIp(req);
    const rate = isDryRun
      ? checkRateLimit(`dry:${path.dirname(directory)}:${clientIp}`, 30)
      : checkRateLimit(`${path.dirname(directory)}:${clientIp}`, 5);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas tentativas. Aguarde ${rate.retryAfterSeconds} segundos.`);
    }

    const rawCode = String(body?.code || '').trim();
    if (!rawCode) throw new ApiError(400, 'Informe o código de acesso.');

    const upper = rawCode.toUpperCase();
    const effectiveCode = normalizeAccessCodeKey(upper);

    const formattedMatch =
      /^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(upper) ||
      /^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(effectiveCode);
    if (!formattedMatch) {
      return send(res, 200, {
        valid: false,
        reason: 'invalid_format',
        error: 'Formato inválido. O padrão é AI10-XXXX-XXXX.',
      });
    }

    const codeHash = computeSha256(effectiveCode);
    const codes = await loadAccessCodes();
    let found = codes.find((c) => c.hash === codeHash || c.code?.toUpperCase() === effectiveCode);

    if (!found && SHOWCASE_PROFILE_CODES.has(effectiveCode)) {
      found = {
        hash: codeHash,
        code: effectiveCode,
        credits: effectiveCode === 'AI10-CUID-MOTI' ? 150 : 120,
        masked: effectiveCode,
        maxRedemptions: 999,
        redemptionCount: 0,
        expiresAt: null,
        lastRedeemedByEmail: null,
        status: 'active',
        reusableInDev: true,
        showcaseProfileId: SHOWCASE_USER_IDS[effectiveCode],
      };
    }

    const adminCfg = resolveSupabaseAdminConfig();
    if (!found && process.env.CG_PERSISTENCE !== 'local' && adminCfg.url && adminCfg.serviceRoleKey) {
      const cloudRes = await supabaseRestFetch({
        url: adminCfg.url,
        apiKey: adminCfg.serviceRoleKey,
        route: `/rest/v1/cg_access_codes?code_hash=eq.${encodeURIComponent(codeHash)}&select=id,credits,code_masked,max_redemptions,redemption_count,expires_at,status,last_redeemed_by_email&limit=1`,
        method: 'GET',
        fetchImpl: cloudFetch,
      }).catch(() => null);
      if (!cloudRes || !cloudRes.ok) {
        throw new ApiError(503, 'Não foi possível validar o código de acesso no momento.');
      }
      const row = Array.isArray(cloudRes.payload) ? cloudRes.payload[0] : null;
      if (row) {
        found = {
          hash: codeHash,
          credits: Number(row.credits || 0),
          masked: row.code_masked,
          maxRedemptions: Number(row.max_redemptions || 1),
          redemptionCount: Number(row.redemption_count || 0),
          expiresAt: row.expires_at || null,
          lastRedeemedByEmail: row.last_redeemed_by_email || null,
          status: row.status,
          reusableInDev: false,
          showcaseProfileId: null,
        };
      }
    }

    if (!found) {
      return send(res, 200, {
        valid: false,
        reason: 'not_found',
        error: 'Código de acesso não encontrado ou inválido.',
      });
    }

    if (found.status === 'revoked') {
      return send(res, 200, {
        valid: false,
        reason: 'revoked',
        error: 'Este código de acesso foi revogado pelo administrador.',
      });
    }

    if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
      return send(res, 200, {
        valid: false,
        reason: 'expired',
        error: 'Este código de acesso expirou.',
      });
    }

    const claimsRaw = await readJsonFile(guestClaimsPath, {});
    const claims = claimsRaw && typeof claimsRaw === 'object' && !Array.isArray(claimsRaw) ? claimsRaw : {};
    const claim = claims[codeHash] || null;
    const linkedEmail =
      (claim?.claimedByEmail && !isGuestPlaceholderEmail(claim.claimedByEmail) ? claim.claimedByEmail : null) ||
      (found.lastRedeemedByEmail && !isGuestPlaceholderEmail(found.lastRedeemedByEmail) ? found.lastRedeemedByEmail : null);

    if (linkedEmail && !found.reusableInDev) {
      const maskedEmail = maskEmailForHint(linkedEmail);
      return send(res, 200, {
        valid: false,
        reason: 'already_redeemed',
        hasLinkedEmail: true,
        maskedEmail,
        error: maskedEmail
          ? `Este código já foi reivindicado pelo e-mail ${maskedEmail}. Faça login com esse e-mail.`
          : 'Este código de acesso já foi vinculado a uma conta com e-mail cadastrado. Faça login para acessar.',
      });
    }

    if (
      (claim?.guestUserId && !claim?.claimedByEmail && UUID_REGEX.test(claim.guestUserId)) ||
      (!linkedEmail && (found.status === 'depleted' || found.redemptionCount >= found.maxRedemptions) && !found.reusableInDev)
    ) {
      const summary = claim?.guestUserId ? await readGuestStoreSummary(claim.guestUserId) : { balance: 0, storeName: '' };
      const effectiveCredits = summary.balance > 0 ? summary.balance : roundCredits(found.credits || 0);
      return send(res, 200, {
        valid: true,
        state: 'claimed_guest_no_email',
        claimedWithoutEmail: true,
        guestStoreName: summary.storeName || null,
        credits: effectiveCredits,
        remainingCredits: effectiveCredits,
        masked: found.masked,
        expiresAt: found.expiresAt,
        reusableInDev: Boolean(found.reusableInDev),
        showcaseProfileId: found.showcaseProfileId || null,
      });
    }

    return send(res, 200, {
      valid: true,
      state: 'available',
      claimedWithoutEmail: false,
      credits: found.credits,
      masked: found.masked,
      expiresAt: found.expiresAt,
      reusableInDev: Boolean(found.reusableInDev),
      showcaseProfileId: found.showcaseProfileId || null,
    });
  }

  // 1b. POST /api/access/claim-email (Autenticado com e-mail real: vincula código/sessão convidada ao e-mail do usuário)
  if (pathname === '/api/access/claim-email') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    if (!user?.id || !UUID_REGEX.test(user.id) || user.isGuest || isGuestPlaceholderEmail(user.email)) {
      throw new ApiError(401, 'Entre ou crie uma conta com e-mail válido antes de vincular este código.');
    }

    const body = await readJson(req, 8192);
    const rawCode = String(body?.code || body?.inviteCode || '').trim().toUpperCase();
    const guestToken = String(body?.guestToken || '').trim();
    const verifiedGuest = guestToken ? verifyLocalShowcaseToken(guestToken) : null;
    if (guestToken && (!verifiedGuest || !verifiedGuest.isGuest)) {
      throw new ApiError(401, 'Sessão convidada expirada ou inválida.');
    }
    if (!rawCode && !verifiedGuest?.id) {
      throw new ApiError(400, 'Informe o código de entrada ou a sessão convidada para vincular ao e-mail.');
    }

    const realEmail = String(user.email || '').trim().toLowerCase();
    const claimResult = await serializeCreditOp(guestClaimsPath, () =>
      serializeCreditOp(codesPath, () =>
        serializeCreditOp(directory, async () => {
          const claimsRaw = await readJsonFile(guestClaimsPath, {});
          const claims = claimsRaw && typeof claimsRaw === 'object' && !Array.isArray(claimsRaw) ? { ...claimsRaw } : {};

          let targetClaimKey = rawCode ? computeSha256(rawCode) : '';
          let targetClaim = targetClaimKey ? claims[targetClaimKey] || null : null;

          if (!targetClaim && verifiedGuest?.id) {
            const matchEntry = Object.entries(claims).find(([, entry]) => entry?.guestUserId === verifiedGuest.id);
            if (matchEntry) {
              [targetClaimKey, targetClaim] = matchEntry;
            }
          }

          if (targetClaim?.claimedByEmail && !isGuestPlaceholderEmail(targetClaim.claimedByEmail)) {
            if (targetClaim.claimedByUserId === user.id || targetClaim.claimedByEmail === realEmail) {
              const bal = await getCreditBalance({ user, bearer: effectiveBearer, directory, readJsonFile, fetchImpl: cloudFetch });
              return { ok: true, alreadyClaimedByYou: true, email: realEmail, balance: bal, codeMasked: targetClaim.codeMasked || '' };
            }
            throw new ApiError(409, 'Este código já foi reivindicado por outro e-mail cadastrado.');
          }

          const guestUserId = verifiedGuest?.id || targetClaim?.guestUserId || '';
          if (!guestUserId || !UUID_REGEX.test(guestUserId)) {
            throw new ApiError(404, 'Nenhuma loja convidada sem e-mail foi encontrada para este código.');
          }

          const guestDir = path.resolve(path.dirname(directory), guestUserId);
          const guestLedgerPath = path.join(guestDir, 'credits_ledger.json');
          const rawGuestLedger = await readJsonFile(guestLedgerPath, []);
          const guestLedger = Array.isArray(rawGuestLedger) ? [...rawGuestLedger] : [];
          const guestBalance =
            guestLedger.length > 0
              ? Math.max(0, roundCredits(guestLedger[guestLedger.length - 1]?.balance_after || 0))
              : roundCredits(targetClaim?.initialCredits || 0);

          await migrateGuestWorkspaceDirectory({ guestUserId, targetUserId: user.id });

          const nowIso = new Date().toISOString();
          const claimRefId = `claim:${targetClaimKey || guestUserId}`;

          if (guestBalance > 0) {
            guestLedger.push({
              id: randomUUID(),
              user_id: guestUserId,
              delta: -guestBalance,
              balance_after: 0,
              operation_type: 'guest_account_claimed',
              reference_id: `${claimRefId}:debit_guest`,
              metadata: { claimedByEmail: realEmail, claimedByUserId: user.id },
              created_at: nowIso,
            });
            await atomicWriteJson(guestLedgerPath, guestLedger);
          }

          let newBalance = 0;
          if (isCloudCreditMode({ user, bearer: effectiveBearer })) {
            const { url: sbUrl, publishableKey, serviceRoleKey } = resolveSupabaseAdminConfig();
            let redeemedCloud = false;
            if (rawCode) {
              const rpcRes = await supabaseRestFetch({
                url: sbUrl,
                apiKey: publishableKey || serviceRoleKey,
                authToken: effectiveBearer,
                route: '/rest/v1/rpc/cg_redeem_access_code',
                method: 'POST',
                body: { p_code: rawCode, p_ip_hash: computeSha256(req.socket?.remoteAddress || '127.0.0.1') },
                fetchImpl: cloudFetch,
              }).catch(() => null);
              if (rpcRes?.ok && rpcRes.payload?.success) {
                redeemedCloud = true;
                newBalance = roundCredits(rpcRes.payload.new_balance || guestBalance);
                const granted = roundCredits(rpcRes.payload.credits_added || 0);
                const spentByGuest = roundCredits(Math.max(0, granted - guestBalance));
                if (spentByGuest > 0) {
                  const debRes = await supabaseRestFetch({
                    url: sbUrl,
                    apiKey: serviceRoleKey,
                    route: '/rest/v1/rpc/cg_debit_credits',
                    method: 'POST',
                    body: {
                      p_user_id: user.id,
                      p_cost: spentByGuest,
                      p_operation_type: 'edit_storefront',
                      p_reference_id: `${claimRefId}:guest_spent`,
                      p_metadata: { guestUserId, note: 'Ajuste de créditos já utilizados na sessão convidada' },
                    },
                    fetchImpl: cloudFetch,
                  }).catch(() => null);
                  if (debRes?.ok && typeof debRes.payload?.new_balance === 'number') {
                    newBalance = roundCredits(debRes.payload.new_balance);
                  }
                }
              }
            }
            if (!redeemedCloud) {
              const curCloudBal = await getCreditBalance({ user, bearer: effectiveBearer, directory, readJsonFile, fetchImpl: cloudFetch });
              if (guestBalance > 0) {
                const targetCloudBal = roundCredits(curCloudBal + guestBalance);
                const insLedger = await supabaseRestFetch({
                  url: sbUrl,
                  apiKey: serviceRoleKey,
                  route: '/rest/v1/cg_credit_ledger',
                  method: 'POST',
                  body: {
                    user_id: user.id,
                    delta: guestBalance,
                    balance_after: targetCloudBal,
                    operation_type: 'welcome_invite',
                    reference_id: claimRefId,
                    metadata: { claimedFromGuestId: guestUserId, claimedByEmail: realEmail, code_masked: targetClaim?.codeMasked || rawCode || '' },
                  },
                  fetchImpl: cloudFetch,
                }).catch(() => null);
                if (insLedger?.ok) {
                  await supabaseRestFetch({
                    url: sbUrl,
                    apiKey: serviceRoleKey,
                    route: '/rest/v1/cg_credit_accounts?on_conflict=user_id',
                    method: 'POST',
                    body: { user_id: user.id, balance: targetCloudBal, updated_at: nowIso },
                    fetchImpl: cloudFetch,
                  }).catch(() => null);
                  newBalance = targetCloudBal;
                } else {
                  newBalance = curCloudBal;
                }
              } else {
                newBalance = curCloudBal;
              }
            }
          } else {
            const targetLedgerRaw = await readJsonFile(ledgerPath, []);
            const targetLedger = Array.isArray(targetLedgerRaw) ? [...targetLedgerRaw] : [];
            const alreadyMigrated = targetLedger.some((entry) => entry?.reference_id === claimRefId);
            const currentTargetBal =
              targetLedger.length > 0
                ? Math.max(0, roundCredits(targetLedger[targetLedger.length - 1]?.balance_after || 0))
                : 0;
            if (!alreadyMigrated && guestBalance > 0) {
              newBalance = roundCredits(currentTargetBal + guestBalance);
              targetLedger.push({
                id: randomUUID(),
                user_id: user.id,
                delta: guestBalance,
                balance_after: newBalance,
                operation_type: 'welcome_invite',
                reference_id: claimRefId,
                metadata: {
                  claimedFromGuestId: guestUserId,
                  claimedByEmail: realEmail,
                  code_masked: targetClaim?.codeMasked || rawCode || '',
                },
                created_at: nowIso,
              });
              await atomicWriteJson(ledgerPath, targetLedger);
            } else {
              newBalance = currentTargetBal;
            }
          }

          if (targetClaimKey) {
            claims[targetClaimKey] = {
              ...(targetClaim || {}),
              codeHash: targetClaimKey,
              codeMasked: targetClaim?.codeMasked || rawCode || 'AI10-****',
              guestUserId: null,
              claimedByEmail: realEmail,
              claimedByUserId: user.id,
              claimedAt: nowIso,
            };
            await atomicWriteJson(guestClaimsPath, claims);
          }

          // Atualiza também o registro em _shared_access_codes.json (e Supabase se disponível)
          const localCodes = await readJsonFile(codesPath, null);
          if (Array.isArray(localCodes) && targetClaimKey) {
            const idx = localCodes.findIndex((c) => c.hash === targetClaimKey);
            if (idx !== -1) {
              const codeObj = { ...localCodes[idx] };
              codeObj.emailClaimed = true;
              codeObj.guestUserId = null;
              codeObj.lastRedeemedByEmail = realEmail;
              codeObj.lastRedeemedAt = nowIso;
              codeObj.redemptionCount = Math.max(1, Number(codeObj.redemptionCount || 0));
              if (!codeObj.reusableInDev && codeObj.redemptionCount >= (codeObj.maxRedemptions || 1)) {
                codeObj.status = 'depleted';
              }
              localCodes[idx] = codeObj;
              await atomicWriteJson(codesPath, localCodes);
            }
          }

          const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
          if (process.env.CG_PERSISTENCE !== 'local' && sbUrl && serviceRoleKey && targetClaimKey) {
            await supabaseRestFetch({
              url: sbUrl,
              apiKey: serviceRoleKey,
              route: `/rest/v1/cg_access_codes?code_hash=eq.${encodeURIComponent(targetClaimKey)}`,
              method: 'PATCH',
              body: {
                last_redeemed_by_email: realEmail,
                last_redeemed_at: nowIso,
              },
              fetchImpl: cloudFetch,
            }).catch(() => null);
          }

          return {
            ok: true,
            email: realEmail,
            userId: user.id,
            balance: newBalance,
            codeMasked: targetClaim?.codeMasked || rawCode || '',
          };
        }),
      ),
    );

    return send(res, 200, claimResult);
  }

  // 1c. POST /api/kiwify/lookup-code (Público, Rate Limited: busca código AI10 por email + order_id da compra Kiwify)
  if (pathname === '/api/kiwify/lookup-code') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');

    const clientIp = resolveClientIp(req);
    const rl = checkRateLimit(`kiwify-lookup:${path.dirname(directory)}:${clientIp}`, 12, 5 * 60 * 1000);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      throw new ApiError(429, `Muitas consultas. Aguarde ${rl.retryAfterSeconds}s e tente novamente.`);
    }

    const body = await readJson(req, 4096);
    const email = String(body?.email || '').trim().toLowerCase();
    const rawOrderId = String(body?.orderId || body?.order_id || '')
      .trim()
      .replace(/^#/, '')
      .trim();

    if (!email || !email.includes('@') || email.length > 160) {
      throw new ApiError(400, 'Informe o e-mail usado na compra da Kiwify.');
    }
    if (!rawOrderId || rawOrderId.length < 3 || rawOrderId.length > 120) {
      throw new ApiError(400, 'Informe o ID do pedido recebido no recibo da Kiwify.');
    }

    const adminCfg = resolveSupabaseAdminConfig();
    if (process.env.CG_PERSISTENCE === 'local' || !adminCfg.url || !adminCfg.serviceRoleKey) {
      return send(res, 404, {
        ok: false,
        found: false,
        error: 'Nenhuma compra aprovada encontrada para este e-mail e ID do pedido.',
      });
    }

    const orderCandidates = [rawOrderId];
    const lowerOrderId = rawOrderId.toLowerCase();
    if (lowerOrderId !== rawOrderId) orderCandidates.push(lowerOrderId);

    let purchaseRow = null;
    for (const candidateOrderId of orderCandidates) {
      const lookupRes = await supabaseRestFetch({
        url: adminCfg.url,
        apiKey: adminCfg.serviceRoleKey,
        route: `/rest/v1/cg_kiwify_purchase_codes?buyer_email=eq.${encodeURIComponent(email)}&order_id=eq.${encodeURIComponent(candidateOrderId)}&select=id,order_id,webhook_event_type,access_code_id,buyer_email,code_plain,code_masked,credits,plan_code,created_at&order=created_at.desc&limit=1`,
        method: 'GET',
        fetchImpl: cloudFetch,
      }).catch(() => null);
      if (!lookupRes || !lookupRes.ok) {
        throw new ApiError(503, 'Não foi possível consultar seu pedido agora. Tente novamente em instantes.');
      }
      if (Array.isArray(lookupRes.payload) && lookupRes.payload[0]) {
        purchaseRow = lookupRes.payload[0];
        break;
      }
    }

    if (!purchaseRow) {
      return send(res, 404, {
        ok: false,
        found: false,
        error: 'Nenhuma compra aprovada encontrada para este e-mail e ID do pedido. Confira os dados no recibo da Kiwify.',
      });
    }

    const codeRes = await supabaseRestFetch({
      url: adminCfg.url,
      apiKey: adminCfg.serviceRoleKey,
      route: `/rest/v1/cg_access_codes?id=eq.${encodeURIComponent(purchaseRow.access_code_id)}&select=id,status,redemption_count,max_redemptions,last_redeemed_at,credits&limit=1`,
      method: 'GET',
      fetchImpl: cloudFetch,
    }).catch(() => null);
    if (!codeRes || !codeRes.ok) {
      throw new ApiError(503, 'Não foi possível validar o status do código agora.');
    }
    const codeRow = Array.isArray(codeRes.payload) ? codeRes.payload[0] : null;
    const credits = roundCredits(codeRow?.credits ?? purchaseRow.credits ?? 0);

    if (!codeRow || codeRow.status === 'revoked') {
      return send(res, 200, {
        ok: true,
        found: true,
        status: 'revoked',
        orderId: purchaseRow.order_id,
        codeMasked: purchaseRow.code_masked,
        credits,
        message: 'Este pedido foi cancelado ou estornado e o código foi revogado.',
      });
    }

    if (
      codeRow.status !== 'active' ||
      Number(codeRow.redemption_count || 0) >= Number(codeRow.max_redemptions || 1) ||
      !purchaseRow.code_plain
    ) {
      return send(res, 200, {
        ok: true,
        found: true,
        status: 'redeemed',
        orderId: purchaseRow.order_id,
        codeMasked: purchaseRow.code_masked,
        credits,
        redeemedAt: codeRow.last_redeemed_at || null,
        message: `O código ${purchaseRow.code_masked} (${credits} cr) deste pedido já foi resgatado em uma conta.`,
      });
    }

    return send(res, 200, {
      ok: true,
      found: true,
      status: 'available',
      orderId: purchaseRow.order_id,
      code: purchaseRow.code_plain,
      codeMasked: purchaseRow.code_masked,
      credits,
    });
  }

  // 2. POST /api/access/redeem (Autenticado)
  if (pathname === '/api/access/redeem') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 4096);
    const rawCode = String(body?.code || '').trim();
    if (!rawCode) throw new ApiError(400, 'Informe o código de acesso para resgate.');

    if (isCloudCreditMode({ user, bearer: effectiveBearer })) {
      const { url: sbUrl, publishableKey, serviceRoleKey } = resolveSupabaseAdminConfig();
      const clientIp = String(req.socket?.remoteAddress || '127.0.0.1');
      const rpcRes = await supabaseRestFetch({
        url: sbUrl,
        apiKey: publishableKey || serviceRoleKey,
        authToken: effectiveBearer,
        route: '/rest/v1/rpc/cg_redeem_access_code',
        method: 'POST',
        body: { p_code: rawCode, p_ip_hash: computeSha256(clientIp) },
        fetchImpl: cloudFetch,
      }).catch(() => null);
      if (!rpcRes) {
        throw new ApiError(503, 'Não foi possível resgatar o código de acesso no momento.');
      }
      if (!rpcRes.ok) {
        if (rpcRes.status === 401 || rpcRes.status === 403) {
          throw new ApiError(401, 'Sessão inválida para resgate de código.');
        }
        throw new ApiError(503, rpcRes.payload?.message || 'Erro ao resgatar código no Supabase.');
      }
      const data = rpcRes.payload || {};
      if (!data.success) {
        const errMap = {
          invalid_code: [404, 'Código de acesso inexistente.'],
          recharge_code_use_settings: [400, 'Este código é de recarga para quem já tem conta. Entre na sua conta e resgate em Ajustes → Resgatar Código.'],
          inactive_code: [400, 'Este código de acesso foi revogado ou desativado.'],
          expired_code: [400, 'Este código de acesso expirou.'],
          depleted_code: [400, 'Código de acesso indisponível para resgate.'],
          already_redeemed: [400, 'Você já resgatou este código de acesso anteriormente.'],
        };
        const [st, msg] = errMap[data.error] || [400, 'Não foi possível resgatar este código de acesso.'];
        throw new ApiError(st, msg);
      }
      const claimEmailStr = !isGuestPlaceholderEmail(user?.email) ? String(user.email).trim().toLowerCase() : null;
      if (claimEmailStr) {
        await serializeCreditOp(guestClaimsPath, async () => {
          const codeHash = computeSha256(rawCode);
          const prevClaims = await readJsonFile(guestClaimsPath, {});
          const nextClaims = prevClaims && typeof prevClaims === 'object' && !Array.isArray(prevClaims) ? { ...prevClaims } : {};
          nextClaims[codeHash] = {
            ...(nextClaims[codeHash] || {}),
            codeHash,
            codeMasked: data.code_masked || '',
            guestUserId: null,
            claimedByEmail: claimEmailStr,
            claimedByUserId: user?.id || null,
            claimedAt: new Date().toISOString(),
          };
          await atomicWriteJson(guestClaimsPath, nextClaims);
        }).catch(() => {});
      }
      return send(res, 200, {
        success: true,
        creditsAdded: roundCredits(data.credits_added || 0),
        newBalance: roundCredits(data.new_balance || 0),
        codeMasked: data.code_masked || '',
      });
    }

    const codeHash = computeSha256(rawCode);
    const redeemResult = await serializeCreditOp(codesPath, () =>
      serializeCreditOp(directory, async () => {
        const codes = await loadAccessCodes();
        const foundIndex = codes.findIndex((c) => c.hash === codeHash);

        if (foundIndex === -1) {
          throw new ApiError(404, 'Código de acesso inexistente.');
        }

        const found = { ...codes[foundIndex] };
        if (found.codeType === 'user_recharge') {
          throw new ApiError(
            400,
            'Este código é de recarga para quem já tem conta. Entre na sua conta e resgate em Ajustes → Resgatar Código.',
          );
        }
        if (found.status === 'revoked') {
          throw new ApiError(400, 'Este código de acesso foi revogado pelo administrador.');
        }
        if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
          throw new ApiError(400, 'Este código de acesso expirou.');
        }
        if (!found.reusableInDev && (found.redemptionCount >= found.maxRedemptions || found.status !== 'active')) {
          throw new ApiError(400, 'Código de acesso indisponível para resgate.');
        }

        // Carrega o ledger do usuário
        const rawLedger = await readJsonFile(ledgerPath, []);
        const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
        const currentBalance = ledger.length > 0 ? Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
        const alreadyRedeemed = ledger.some((entry) => entry?.reference_id === found.hash);
        if (alreadyRedeemed) {
          if (found.reusableInDev) {
            return {
              success: true,
              alreadyRedeemed: true,
              creditsAdded: 0,
              newBalance: currentBalance,
              codeMasked: found.masked,
            };
          }
          throw new ApiError(400, 'Você já resgatou este código de acesso anteriormente.');
        }

        // Atualiza contagem do código
        const nowIso = new Date().toISOString();
        found.redemptionCount = Number(found.redemptionCount || 0) + 1;
        found.lastRedeemedByEmail = String(user?.email || user?.id || '').trim() || null;
        found.lastRedeemedAt = nowIso;
        if (!found.reusableInDev && found.redemptionCount >= found.maxRedemptions) {
          found.status = 'depleted';
        }
        codes[foundIndex] = found;
        await atomicWriteJson(codesPath, codes);

        const claimEmailStr = !isGuestPlaceholderEmail(user?.email) ? String(user.email).trim().toLowerCase() : null;
        if (claimEmailStr && !found.reusableInDev) {
          await serializeCreditOp(guestClaimsPath, async () => {
            const prevClaims = await readJsonFile(guestClaimsPath, {});
            const nextClaims = prevClaims && typeof prevClaims === 'object' && !Array.isArray(prevClaims) ? { ...prevClaims } : {};
            nextClaims[found.hash] = {
              ...(nextClaims[found.hash] || {}),
              codeHash: found.hash,
              codeMasked: found.masked || '',
              guestUserId: null,
              claimedByEmail: claimEmailStr,
              claimedByUserId: user?.id || null,
              claimedAt: nowIso,
            };
            await atomicWriteJson(guestClaimsPath, nextClaims);
          }).catch(() => {});
        }

        // Adiciona ao ledger do usuário
        const creditsToAdd = roundCredits(found.credits || 0);
        const newBalance = roundCredits(currentBalance + creditsToAdd);
        const ledgerEntry = {
          id: randomUUID(),
          user_id: user?.id,
          delta: creditsToAdd,
          balance_after: newBalance,
          operation_type: 'welcome_invite',
          reference_id: found.hash,
          metadata: { code_masked: found.masked, code_type: 'invite_only' },
          created_at: nowIso,
        };
        ledger.push(ledgerEntry);
        await atomicWriteJson(ledgerPath, ledger);

        return {
          success: true,
          creditsAdded: creditsToAdd,
          newBalance,
          codeMasked: found.masked,
        };
      }),
    );

    // Record invite redemption metadata (IP hash + prefix) for multi-account abuse detection
    if (redeemResult?.success && !redeemResult?.alreadyRedeemed) {
      const clientIp = String(
        req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      )
        .split(',')[0]
        .trim();
      const eventsPath = path.join(path.dirname(directory), '_access_redemption_events.json');
      await serializeCreditOp(eventsPath, async () => {
        const prev = await readJsonFile(eventsPath, []);
        const list = Array.isArray(prev) ? [...prev] : [];
        list.push({
          userId: user?.id || 'unknown',
          ipHash: computeSha256(clientIp),
          codePrefix: rawCode.slice(0, 9).toUpperCase(),
          codeMasked: redeemResult.codeMasked || '',
          at: new Date().toISOString(),
        });
        await atomicWriteJson(eventsPath, list.slice(-500));
      }).catch(() => {});
    }

    return send(res, 200, redeemResult);
  }

  // 3. GET /api/checkout/plans (Público / Autenticado)
  if (pathname === '/api/checkout/plans') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    return send(res, 200, {
      success: true,
      plans: CREDIT_PLANS,
      featuredPlan: CREDIT_PLANS.find((p) => p.popular) || CREDIT_PLANS[0],
    });
  }

  // 4. GET /api/credits/balance (Autenticado)
  if (pathname === '/api/credits/balance') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    if (isCloudCreditMode({ user, bearer: effectiveBearer })) {
      const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
      const [balance, historyRes] = await Promise.all([
        getCreditBalance({ user, bearer: effectiveBearer, directory, readJsonFile, fetchImpl: cloudFetch }),
        supabaseRestFetch({
          url: sbUrl,
          apiKey: serviceRoleKey,
          route: `/rest/v1/cg_credit_ledger?user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=40&select=id,user_id,delta,balance_after,operation_type,reference_id,metadata,created_at`,
          method: 'GET',
          fetchImpl: cloudFetch,
        }).catch(() => null),
      ]);
      const history = historyRes?.ok && Array.isArray(historyRes.payload) ? historyRes.payload : [];
      return send(res, 200, {
        success: true,
        balance,
        costs: CREDIT_ACTION_COSTS,
        history,
      });
    }
    const ledger = await readJsonFile(ledgerPath, []);
    const balance = ledger.length > 0 ? (ledger[ledger.length - 1].balance_after || 0) : 0;
    return send(res, 200, {
      success: true,
      balance,
      costs: CREDIT_ACTION_COSTS,
      history: ledger.slice(-40).reverse(),
    });
  }

  // 4b. GET /api/credits/costs (Público / Autenticado)
  if (pathname === '/api/credits/costs') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    return send(res, 200, {
      ok: true,
      costs: CREDIT_ACTION_COSTS,
    });
  }

  // 4c. GET /api/credits/redemption-quota (Autenticado — limite máx. 3 resgates de códigos de recarga por conta)
  if (pathname === '/api/credits/redemption-quota') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    if (isCloudCreditMode({ user, bearer: effectiveBearer })) {
      const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
      const quotaRes = await supabaseRestFetch({
        url: sbUrl,
        apiKey: serviceRoleKey,
        route: '/rest/v1/rpc/cg_get_recharge_redemption_quota',
        method: 'POST',
        body: { p_user_id: user.id },
        fetchImpl: cloudFetch,
      }).catch(() => null);
      if (quotaRes?.ok && quotaRes.payload && typeof quotaRes.payload === 'object') {
        const used = Math.max(0, Number(quotaRes.payload.used || 0));
        const limit = Math.max(1, Number(quotaRes.payload.limit || 3));
        return send(res, 200, { ok: true, used, limit, remaining: Math.max(0, limit - used) });
      }
    }
    const rawLedger = await readJsonFile(ledgerPath, []);
    const ledger = Array.isArray(rawLedger) ? rawLedger : [];
    const used = ledger.filter((e) => e?.operation_type === 'recharge_code').length;
    return send(res, 200, { ok: true, used, limit: 3, remaining: Math.max(0, 3 - used) });
  }

  // 4d. POST /api/credits/redeem-code (Autenticado — resgate de código especial 'user_recharge', máx. 3 por conta)
  if (pathname === '/api/credits/redeem-code') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 4096);
    const rawCode = String(body?.code || '').trim();
    if (!rawCode || rawCode.length > 64) {
      throw new ApiError(400, 'Informe um código de recarga válido.');
    }

    const rateKey = `redeem-code:${user?.id || 'anon'}`;
    const rl = checkRateLimit(rateKey, 5, 10 * 60 * 1000);
    if (!rl.allowed) {
      throw new ApiError(429, `Muitas tentativas de resgate. Aguarde ${rl.retryAfterSeconds}s e tente novamente.`);
    }

    const clientIp = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();

    if (isCloudCreditMode({ user, bearer: effectiveBearer })) {
      const { url: sbUrl, publishableKey, serviceRoleKey } = resolveSupabaseAdminConfig();
      const rpcRes = await supabaseRestFetch({
        url: sbUrl,
        apiKey: publishableKey || serviceRoleKey,
        authToken: effectiveBearer,
        route: '/rest/v1/rpc/cg_redeem_recharge_code',
        method: 'POST',
        body: { p_code: rawCode, p_ip_hash: computeSha256(clientIp) },
        fetchImpl: cloudFetch,
      }).catch(() => null);
      if (!rpcRes) {
        throw new ApiError(503, 'Não foi possível resgatar o código no momento.');
      }
      if (!rpcRes.ok) {
        if (rpcRes.status === 401 || rpcRes.status === 403) {
          throw new ApiError(401, 'Sessão inválida para resgate de código.');
        }
        throw new ApiError(503, rpcRes.payload?.message || 'Erro ao resgatar código no Supabase.');
      }
      const data = rpcRes.payload || {};
      if (!data.success) {
        const errMap = {
          invalid_code: [404, 'Código de recarga não encontrado.'],
          invite_only_code: [400, 'Este código é exclusivo de convite para novas contas e não pode ser resgatado aqui.'],
          recharge_limit_reached: [409, 'Você já atingiu o limite máximo de 3 resgates de códigos por conta.'],
          already_redeemed: [409, 'Você já resgatou este código anteriormente.'],
          depleted_code: [410, 'Este código já foi utilizado e atingiu o limite de usos.'],
          inactive_code: [410, 'Este código foi revogado ou desativado.'],
          expired_code: [410, 'Este código expirou.'],
        };
        const [st, msg] = errMap[data.error] || [400, 'Não foi possível resgatar este código.'];
        throw new ApiError(st, msg);
      }
      return send(res, 200, {
        success: true,
        creditsAdded: roundCredits(data.credits_added || 0),
        newBalance: roundCredits(data.new_balance || 0),
        codeMasked: data.code_masked || '',
        redemptionsUsed: Number(data.redemptions_used || 1),
        redemptionsRemaining: Number(data.redemptions_remaining ?? 0),
        limit: Number(data.limit || 3),
      });
    }

    const codeHash = computeSha256(rawCode);
    const redeemResult = await serializeCreditOp(codesPath, () =>
      serializeCreditOp(directory, async () => {
        const codes = await loadAccessCodes();
        const foundIndex = codes.findIndex((c) => c.hash === codeHash);
        if (foundIndex === -1) {
          throw new ApiError(404, 'Código de recarga não encontrado.');
        }
        const found = { ...codes[foundIndex] };
        const effectiveType = found.codeType || 'invite_only';
        if (effectiveType !== 'user_recharge' && effectiveType !== 'kiwify_purchase') {
          throw new ApiError(
            400,
            'Este código é exclusivo de convite para novas contas e não pode ser resgatado aqui.',
          );
        }
        if (found.status === 'revoked') {
          throw new ApiError(410, 'Este código foi revogado pelo administrador.');
        }
        if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
          throw new ApiError(410, 'Este código expirou.');
        }
        if (found.redemptionCount >= found.maxRedemptions || found.status !== 'active') {
          throw new ApiError(410, 'Este código já foi utilizado e atingiu o limite de usos.');
        }

        const rawLedger = await readJsonFile(ledgerPath, []);
        const ledger = Array.isArray(rawLedger) ? [...rawLedger] : [];
        const usedRechargeCount = ledger.filter((entry) => entry?.operation_type === 'recharge_code').length;
        if (effectiveType === 'user_recharge' && usedRechargeCount >= 3) {
          throw new ApiError(409, 'Você já atingiu o limite máximo de 3 resgates de códigos por conta.');
        }
        const alreadyRedeemed = ledger.some((entry) => entry?.reference_id === `recharge:${found.hash}`);
        if (alreadyRedeemed) {
          throw new ApiError(409, 'Você já resgatou este código anteriormente.');
        }

        const nowIso = new Date().toISOString();
        found.redemptionCount = Number(found.redemptionCount || 0) + 1;
        found.lastRedeemedByEmail = String(user?.email || user?.id || '').trim() || null;
        found.lastRedeemedAt = nowIso;
        if (found.redemptionCount >= found.maxRedemptions) {
          found.status = 'depleted';
        }
        codes[foundIndex] = found;
        await atomicWriteJson(codesPath, codes);

        const claimEmailStr = !isGuestPlaceholderEmail(user?.email) ? String(user.email).trim().toLowerCase() : null;
        if (claimEmailStr && !found.reusableInDev) {
          await serializeCreditOp(guestClaimsPath, async () => {
            const prevClaims = await readJsonFile(guestClaimsPath, {});
            const nextClaims = prevClaims && typeof prevClaims === 'object' && !Array.isArray(prevClaims) ? { ...prevClaims } : {};
            nextClaims[found.hash] = {
              ...(nextClaims[found.hash] || {}),
              codeHash: found.hash,
              codeMasked: found.masked || '',
              guestUserId: null,
              claimedByEmail: claimEmailStr,
              claimedByUserId: user?.id || null,
              claimedAt: nowIso,
            };
            await atomicWriteJson(guestClaimsPath, nextClaims);
          }).catch(() => {});
        }

        const currentBalance = ledger.length > 0 ? Math.max(0, roundCredits(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
        const creditsToAdd = roundCredits(found.credits || 0);
        const newBalance = roundCredits(currentBalance + creditsToAdd);
        ledger.push({
          id: randomUUID(),
          user_id: user?.id,
          delta: creditsToAdd,
          balance_after: newBalance,
          operation_type: 'recharge_code',
          reference_id: `recharge:${found.hash}`,
          metadata: { code_masked: found.masked, code_type: 'user_recharge' },
          created_at: nowIso,
        });
        await atomicWriteJson(ledgerPath, ledger);

        const nextUsed = usedRechargeCount + 1;
        return {
          success: true,
          creditsAdded: creditsToAdd,
          newBalance,
          codeMasked: found.masked,
          redemptionsUsed: nextUsed,
          redemptionsRemaining: Math.max(0, 3 - nextUsed),
          limit: 3,
        };
      }),
    );

    return send(res, 200, redeemResult);
  }

  // 5. POST /api/checkout/order (Autenticado)
  if (pathname === '/api/checkout/order') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 8192);
    const planId = String(body?.planId || 'plan_100_brl').trim();
    const paymentMethod = body?.paymentMethod === 'card' ? 'card' : 'pix';

    const plan = CREDIT_PLANS.find((p) => p.id === planId) || CREDIT_PLANS[0];
    const orderId = randomUUID();
    const orderRef = `PIX-${randomUUID().slice(0, 6).toUpperCase()}`;
    const pixCopyPaste = generateFakePixPayload(plan.priceCents, orderRef);

    const newOrder = {
      id: orderId,
      orderRef,
      user_id: user?.id,
      plan_id: plan.id,
      plan_name: plan.name,
      amount_cents: plan.priceCents,
      credits: plan.credits,
      payment_method: paymentMethod,
      status: 'pending',
      pix_copy_paste: pixCopyPaste,
      pix_qr_code: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><text x="100" y="100" font-family="sans-serif" font-size="12" text-anchor="middle" fill="%232563EB">PIX ${orderRef}</text></svg>`,
      sandbox: true,
      created_at: new Date().toISOString(),
    };

    await serializeCreditOp(directory, async () => {
      const ordersRaw = await readJsonFile(ordersPath, []);
      const orders = Array.isArray(ordersRaw) ? [...ordersRaw] : [];
      orders.push(newOrder);
      await atomicWriteJson(ordersPath, orders);
    });

    return send(res, 200, {
      success: true,
      order: newOrder,
    });
  }

  // 6. POST /api/checkout/confirm (Webhook assinado / Admin / Sandbox explícito)
  if (pathname === '/api/checkout/confirm') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    if (!user?.id || user.id === 'public-visitor') {
      throw new ApiError(401, 'Usuário autenticado obrigatório.');
    }

    const body = await readJson(req, 8192);
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) throw new ApiError(400, 'Informe o ID do pedido.');

    const webhookSecret = String(process.env.CG_PAYMENT_WEBHOOK_SECRET || '').trim();
    const rawSigHeader = String(req.headers['x-payment-signature'] || '').trim();
    let hasValidWebhookSig = false;
    if (webhookSecret && rawSigHeader) {
      const cleanSig = rawSigHeader.replace(/^sha256=/i, '').trim().toLowerCase();
      const sigBuf = Buffer.from(cleanSig, 'utf8');
      const candidates = [
        createHmac('sha256', webhookSecret).update(orderId).digest('hex'),
        createHmac('sha256', webhookSecret).update(JSON.stringify(body || {})).digest('hex'),
      ];
      hasValidWebhookSig = candidates.some((expected) => {
        const expBuf = Buffer.from(expected, 'utf8');
        return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
      });
    }

    const isAdminCaller = Boolean(
      ctx.isAdmin === true || (typeof ctx.isAdminRequest === 'function' && (await ctx.isAdminRequest())),
    );
    const allowSandboxConfirm = process.env.ALLOW_SANDBOX_CHECKOUT_CONFIRM === '1';

    if (!hasValidWebhookSig && !isAdminCaller && !allowSandboxConfirm) {
      throw new ApiError(403, 'Confirmação de pagamento não autorizada.');
    }

    const confirmResult = await serializeCreditOp(directory, async () => {
      const ordersRaw = await readJsonFile(ordersPath, []);
      const orders = Array.isArray(ordersRaw) ? [...ordersRaw] : [];
      const orderIndex = orders.findIndex((o) => o.id === orderId);
      if (orderIndex === -1) throw new ApiError(404, 'Pedido não encontrado.');

      const order = { ...orders[orderIndex] };
      if (order.user_id && order.user_id !== user.id && !isAdminCaller) {
        throw new ApiError(403, 'Pedido não pertence a este usuário.');
      }

      if (order.status === 'paid') {
        return {
          success: true,
          alreadyPaid: true,
          credits: order.credits,
        };
      }

      const ledgerRaw = await readJsonFile(ledgerPath, []);
      const ledger = Array.isArray(ledgerRaw) ? [...ledgerRaw] : [];
      if (ledger.some((entry) => entry?.reference_id === order.id)) {
        order.status = 'paid';
        order.paid_at = order.paid_at || new Date().toISOString();
        orders[orderIndex] = order;
        await atomicWriteJson(ordersPath, orders);
        return {
          success: true,
          alreadyPaid: true,
          credits: order.credits,
        };
      }

      order.status = 'paid';
      order.paid_at = new Date().toISOString();
      order.confirmed_via = hasValidWebhookSig ? 'webhook' : isAdminCaller ? 'admin' : 'sandbox';
      orders[orderIndex] = order;
      await atomicWriteJson(ordersPath, orders);

      const currentBalance = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
      const newBalance = currentBalance + Number(order.credits || 0);

      const ledgerEntry = {
        id: randomUUID(),
        user_id: order.user_id || user?.id,
        delta: Number(order.credits || 0),
        balance_after: newBalance,
        operation_type: order.plan_id === 'plan_100_brl' ? 'purchase_plan_100' : 'purchase_plan_micro',
        reference_id: order.id,
        metadata: { order_ref: order.orderRef, amount_cents: order.amount_cents, confirmed_via: order.confirmed_via },
        created_at: new Date().toISOString(),
      };
      ledger.push(ledgerEntry);
      await atomicWriteJson(ledgerPath, ledger);

      return {
        success: true,
        orderId: order.id,
        creditsAdded: order.credits,
        newBalance,
      };
    });

    return send(res, 200, confirmResult);
  }

  return false;
}
