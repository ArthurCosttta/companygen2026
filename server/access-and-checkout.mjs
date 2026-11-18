import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __ACCESS_DIR = path.dirname(fileURLToPath(import.meta.url));
let EMBEDDED_SUPABASE_PUBLIC = { url: '', publishableKey: '' };
try {
  EMBEDDED_SUPABASE_PUBLIC = JSON.parse(
    readFileSync(path.resolve(__ACCESS_DIR, '..', 'src', 'config', 'supabase-public.json'), 'utf8'),
  );
} catch {}

const EPHEMERAL_SHOWCASE_SECRET = randomBytes(32).toString('hex');

// Tabela Oficial de Custos de Créditos de IA
export const CREDIT_ACTION_COSTS = {
  glm_whatsapp: 2,
  edit_block: 3,
  generate_image_schnell: 5,
  generate_hero_dev: 10,
  edit_image_qwen: 10,
  create_subpage: 15,
  generate_full_storefront: 30,
};

export const SHOWCASE_PROFILE_CODES = new Set(['AI10-FARM-LUME']);
export const SHOWCASE_USER_IDS = {
  'AI10-FARM-LUME': 'bbbbbbbb-2222-4222-8222-222222222222',
};

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

export function verifyLocalShowcaseToken(bearer) {
  if (!isLocalShowcaseEnabled()) return null;
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
    if (typeof parsed?.sub !== 'string' || !UUID_REGEX.test(parsed.sub) || !parsed?.showcase) return null;
    if (typeof parsed.exp !== 'number' || parsed.exp * 1000 <= Date.now()) return null;
    return { id: parsed.sub, email: String(parsed.email || 'sandbox@local') };
  } catch {
    return null;
  }
}

// Planos canônicos de crédito
export const CREDIT_PLANS = [
  {
    id: 'plan_100_brl',
    slug: 'plan_100_brl',
    name: 'Plano Profissional IA',
    credits: 2500,
    priceCents: 10000,
    priceFormatted: 'R$ 100,00',
    pricePerCredit: 'R$ 0,04',
    savingsPercent: '60%',
    popular: true,
    kiwifyUrl: 'https://pay.kiwify.com.br/0USJqo5',
    description: 'Ideal para atendimento contínuo no WhatsApp durante o mês todo (~80-90 pedidos/dia).',
  },
  {
    id: 'plan_micro_10',
    slug: 'plan_micro_10',
    name: 'Recarga Rápida',
    credits: 100,
    priceCents: 990,
    priceFormatted: 'R$ 9,90/mês',
    pricePerCredit: 'R$ 0,10',
    savingsPercent: null,
    popular: false,
    kiwifyUrl: 'https://pay.kiwify.com.br/7fBDYu4',
    description: 'Pacote de entrada para testar o fluxo de respostas com clientes reais.',
  },
  {
    id: 'plan_growth_25',
    slug: 'plan_growth_25',
    name: 'Recarga Intermediária',
    credits: 300,
    priceCents: 2490,
    priceFormatted: 'R$ 24,90/mês',
    pricePerCredit: 'R$ 0,08',
    savingsPercent: '20%',
    popular: false,
    kiwifyUrl: 'https://pay.kiwify.com.br/O0ueDhe',
    description: 'Bom para picos de movimento e campanhas pontuais de vendas.',
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
      return 'generate_storefront';
    case 'edit_block':
    case 'create_subpage':
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
  return Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0));
}

export function resolveActionCost(action, amount) {
  if (Number.isFinite(Number(amount)) && Number(amount) >= 0) {
    return Math.round(Number(amount));
  }
  return Math.max(0, Number(CREDIT_ACTION_COSTS[action] ?? 0));
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
      const balanceBefore = Math.max(0, Number(res.payload.balance_before ?? res.payload.balance_after ?? 0));
      const balanceAfter = Math.max(0, Number(res.payload.balance_after ?? 0));
      const entry = {
        id: debitRef,
        db_entry_id: res.payload.entry_id || null,
        user_id: user.id,
        delta: -Number(res.payload.debited ?? cost),
        balance_after: balanceAfter,
        operation_type: `debit_${action}`,
        action,
        reference_id: debitRef,
        metadata,
        created_at: new Date().toISOString(),
      };
      return {
        ok: true,
        debited: Number(res.payload.debited ?? cost),
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
    const balanceBefore = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    if (balanceBefore < cost) {
      return {
        ok: false,
        status: 402,
        error: 'INSUFFICIENT_CREDITS',
        required: cost,
        balance: balanceBefore,
      };
    }
    const balanceAfter = balanceBefore - cost;
    const entry = {
      id: randomUUID(),
      user_id: user?.id || 'local-user',
      delta: -cost,
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
    return {
      ok: true,
      debited: cost,
      balanceBefore,
      balanceAfter,
      entry,
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
    const balanceBefore = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
    const balanceAfter = balanceBefore + credit;
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

// Rate Limiter em memória por workspace + IP (5 tentativas por minuto)
const rateLimitMap = new Map();
function checkRateLimit(bucketKey) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 5;

  const entry = rateLimitMap.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count += 1;
  }
  rateLimitMap.set(bucketKey, entry);

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
  const ledgerPath = path.join(directory, 'credits_ledger.json');
  const ordersPath = path.join(directory, 'payment_orders.json');

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

  // 0b. POST /api/access/local-showcase-login (Sandbox Dev explícito com ALLOW_LOCAL_SHOWCASE_PROFILES=1)
  if (pathname === '/api/access/local-showcase-login') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    if (!isLocalShowcaseEnabled()) {
      throw new ApiError(403, 'Login sandbox local desabilitado neste ambiente.');
    }
    const clientIp = req.socket?.remoteAddress || '127.0.0.1';
    const rate = checkRateLimit(`showcase-login:${path.dirname(directory)}:${clientIp}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas tentativas. Aguarde ${rate.retryAfterSeconds} segundos.`);
    }
    const body = await readJson(req, 4096);
    const rawCode = String(body?.code || '').trim().toUpperCase();
    if (!rawCode) throw new ApiError(400, 'Informe o código de acesso.');
    const codes = await loadAccessCodes();
    const codeHash = computeSha256(rawCode);
    const found = codes.find((c) => c.hash === codeHash);
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

  // 1. POST /api/access/validate (Público, Rate Limited)
  if (pathname === '/api/access/validate') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');

    const clientIp = req.socket?.remoteAddress || '127.0.0.1';
    const rate = checkRateLimit(`${path.dirname(directory)}:${clientIp}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas tentativas. Aguarde ${rate.retryAfterSeconds} segundos.`);
    }

    const body = await readJson(req, 4096);
    const rawCode = String(body?.code || '').trim();
    if (!rawCode) throw new ApiError(400, 'Informe o código de acesso.');

    const formattedMatch = /^AI10-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(rawCode);
    if (!formattedMatch) {
      return send(res, 200, {
        valid: false,
        reason: 'invalid_format',
        error: 'Formato inválido. O padrão é AI10-XXXX-XXXX.',
      });
    }

    const codeHash = computeSha256(rawCode);
    const codes = await loadAccessCodes();
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

    if (found.status === 'depleted' || found.redemptionCount >= found.maxRedemptions) {
      return send(res, 200, {
        valid: false,
        reason: 'already_redeemed',
        error: 'Este código de acesso já foi utilizado e atingiu o limite máximo de ativações.',
      });
    }

    return send(res, 200, {
      valid: true,
      credits: found.credits,
      masked: found.masked,
      expiresAt: found.expiresAt,
      reusableInDev: Boolean(found.reusableInDev),
      showcaseProfileId: found.showcaseProfileId || null,
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
          inactive_code: [400, 'Este código de acesso foi revogado ou desativado.'],
          expired_code: [400, 'Este código de acesso expirou.'],
          depleted_code: [400, 'Código de acesso indisponível para resgate.'],
          already_redeemed: [400, 'Você já resgatou este código de acesso anteriormente.'],
        };
        const [st, msg] = errMap[data.error] || [400, 'Não foi possível resgatar este código de acesso.'];
        throw new ApiError(st, msg);
      }
      return send(res, 200, {
        success: true,
        creditsAdded: Number(data.credits_added || 0),
        newBalance: Number(data.new_balance || 0),
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
        const currentBalance = ledger.length > 0 ? Math.max(0, Number(ledger[ledger.length - 1]?.balance_after || 0)) : 0;
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
        found.redemptionCount = Number(found.redemptionCount || 0) + 1;
        if (!found.reusableInDev && found.redemptionCount >= found.maxRedemptions) {
          found.status = 'depleted';
        }
        codes[foundIndex] = found;
        await atomicWriteJson(codesPath, codes);

        // Adiciona ao ledger do usuário
        const creditsToAdd = Number(found.credits || 0);
        const newBalance = currentBalance + creditsToAdd;
        const ledgerEntry = {
          id: randomUUID(),
          user_id: user?.id,
          delta: creditsToAdd,
          balance_after: newBalance,
          operation_type: 'welcome_invite',
          reference_id: found.hash,
          metadata: { code_masked: found.masked },
          created_at: new Date().toISOString(),
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
