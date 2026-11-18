import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CREDIT_ACTION_COSTS,
  DEFAULT_ACCESS_CODES,
  SHOWCASE_USER_IDS,
  debitCredits,
  ensureSufficientCredits,
  getCreditBalance,
  handleAccessAndCheckoutRoutes,
  isCloudCreditMode,
  issueLocalShowcaseToken,
  refundCredits,
} from '../server/access-and-checkout.mjs';
import {
  FORMULA_V9_VERSION,
  FormulaV9DocumentSchema,
} from '../shared/formula-ir/composer-schema.mjs';
import { buildNeutralFallbackV9Document } from '../server/glm-architect-prompt.mjs';
import { writeStorefrontMoldeToDisk } from '../server/storefront-molde-fs.mjs';
import { createWorkspaceApi } from '../server/workspace.mjs';

const SHOWCASE_USER_ID = SHOWCASE_USER_IDS['AI10-FARM-LUME'];

test('Cláusula 1: AI10-FARM-LUME (65 cr) e contabilidade exata (30+15+3+5+10+2 = 65 -> 0 -> 402)', async () => {
  const lumeCode = DEFAULT_ACCESS_CODES.find((c) => c.code === 'AI10-FARM-LUME');
  assert.ok(lumeCode, 'AI10-FARM-LUME deve estar registrado em DEFAULT_ACCESS_CODES');
  assert.equal(lumeCode.credits, 65);
  assert.equal(lumeCode.reusableInDev, true);
  assert.equal(lumeCode.showcaseProfileId, SHOWCASE_USER_ID);

  assert.equal(CREDIT_ACTION_COSTS.glm_whatsapp, 2);
  assert.equal(CREDIT_ACTION_COSTS.edit_block, 3);
  assert.equal(CREDIT_ACTION_COSTS.generate_image_schnell, 5);
  assert.equal(CREDIT_ACTION_COSTS.generate_hero_dev, 10);
  assert.equal(CREDIT_ACTION_COSTS.edit_image_qwen, 10);
  assert.equal(CREDIT_ACTION_COSTS.create_subpage, 15);
  assert.equal(CREDIT_ACTION_COSTS.generate_full_storefront, 30);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cg-credits-test-'));
  try {
    const user = { id: SHOWCASE_USER_ID };
    const ledgerPath = path.join(tmpDir, 'credits_ledger.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      ledgerPath,
      JSON.stringify([
        {
          id: 'seed-65',
          user_id: user.id,
          delta: 65,
          balance_after: 65,
          operation_type: 'welcome_invite',
          created_at: new Date().toISOString(),
        },
      ]),
      'utf8',
    );

    assert.equal(await getCreditBalance({ directory: tmpDir }), 65);

    const d1 = await debitCredits({ user, directory: tmpDir, action: 'generate_full_storefront' });
    assert.equal(d1.ok, true);
    assert.equal(d1.debited, 30);
    assert.equal(d1.balanceAfter, 35);

    const d2 = await debitCredits({ user, directory: tmpDir, action: 'create_subpage' });
    assert.equal(d2.ok, true);
    assert.equal(d2.debited, 15);
    assert.equal(d2.balanceAfter, 20);

    const d3 = await debitCredits({ user, directory: tmpDir, action: 'edit_block' });
    assert.equal(d3.ok, true);
    assert.equal(d3.debited, 3);
    assert.equal(d3.balanceAfter, 17);

    const d4 = await debitCredits({ user, directory: tmpDir, action: 'generate_image_schnell' });
    assert.equal(d4.ok, true);
    assert.equal(d4.debited, 5);
    assert.equal(d4.balanceAfter, 12);

    const d5 = await debitCredits({ user, directory: tmpDir, action: 'edit_image_qwen' });
    assert.equal(d5.ok, true);
    assert.equal(d5.debited, 10);
    assert.equal(d5.balanceAfter, 2);

    const d6 = await debitCredits({ user, directory: tmpDir, action: 'glm_whatsapp' });
    assert.equal(d6.ok, true);
    assert.equal(d6.debited, 2);
    assert.equal(d6.balanceAfter, 0);

    // Saldo 0 -> bloqueio HTTP 402 para qualquer ação paga
    const checkZero = await ensureSufficientCredits({ directory: tmpDir, action: 'edit_block' });
    assert.equal(checkZero.ok, false);
    assert.equal(checkZero.status, 402);
    assert.equal(checkZero.error, 'INSUFFICIENT_CREDITS');
    assert.equal(checkZero.required, 3);
    assert.equal(checkZero.balance, 0);

    const blockedDebit = await debitCredits({ user, directory: tmpDir, action: 'glm_whatsapp' });
    assert.equal(blockedDebit.ok, false);
    assert.equal(blockedDebit.status, 402);
    assert.equal(blockedDebit.error, 'INSUFFICIENT_CREDITS');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('Cláusula 3: Formula-IR 9.0 + Pasta Molde e rota /api/store-molde/:userId/* com proteção de path traversal', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cg-molde-test-'));
  const userDir = path.join(tmpRoot, SHOWCASE_USER_ID);
  const profile = {
    business: {
      name: 'Cafeteria Grão Vivo',
      segment: 'Gastronomia & Café',
      businessModel: 'hibrido',
      description: 'Torra fresca artesanal e kits para preparo em casa.',
    },
    whatsapp: { phoneE164: '5511987654321' },
    payment: { pixDiscountPercent: 5 },
    brand: { primaryColor: '#7C3AED', fontStyle: 'modern_sans' },
    catalog: {
      products: [
        {
          id: 'cafe-1',
          sku: 'CAFE-001',
          name: 'Café Arábica 250g',
          category: 'Grãos',
          variation: '250 g',
          priceCents: 4990,
          itemType: 'produto_fisico',
          active: true,
        },
        {
          id: 'cafe-2',
          sku: 'CAFE-002',
          name: 'Filtro V60 Cerâmica',
          category: 'Acessórios',
          variation: 'Unidade',
          priceCents: 6990,
          itemType: 'produto_fisico',
          active: true,
        },
        {
          id: 'cafe-3',
          sku: 'CAFE-003',
          name: 'Kit Degustação Manhã',
          category: 'Kits',
          variation: '3 pacotes',
          priceCents: 8990,
          itemType: 'kit_combo',
          active: true,
        },
      ],
    },
  };

  const baseDoc = buildNeutralFallbackV9Document(profile);
  const ir = {
    ...baseDoc,
    storeInfo: {
      name: profile.business.name,
      segment: profile.business.segment,
      businessModel: profile.business.businessModel,
      description: profile.business.description,
      whatsappE164: profile.whatsapp.phoneE164,
      pixDiscountPercent: profile.payment.pixDiscountPercent,
    },
    catalog: profile.catalog.products,
    pages: [
      {
        id: 'page_catalogo',
        slug: 'catalogo',
        filename: 'pages/catalogo.html',
        title: 'Catálogo',
        sections: baseDoc.sections,
      },
    ],
  };

  const valid = FormulaV9DocumentSchema.safeParse(ir);
  assert.equal(valid.success, true, valid.success ? '' : valid.error.message);
  assert.equal(ir.version, FORMULA_V9_VERSION);

  const { moldeDir, writtenFiles } = await writeStorefrontMoldeToDisk({
    directory: userDir,
    formulasIr: ir,
    imageJobs: [],
  });

  for (const rel of [
    'index.html',
    'pages/catalogo.html',
    'styles.css',
    'app.js',
    'data/formulas-ir.json',
    'data/image-jobs.json',
  ]) {
    const st = await stat(path.join(moldeDir, rel));
    assert.ok(st.size > 0, `Arquivo obrigatório ${rel} deve existir na Pasta Molde`);
  }
  assert.ok(writtenFiles.includes('index.html'));

  const indexHtml = await readFile(path.join(moldeDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /Cafeteria Grão Vivo/);
  assert.match(indexHtml, /class="cg-header"/);
  assert.match(indexHtml, /data-cg-exp-id=/);
  assert.match(indexHtml, /id="catalogo"/);
  assert.match(indexHtml, /49,90/);
  assert.match(indexHtml, /89,90/);
  assert.match(indexHtml, /class="cg-footer"/);

  const api = createWorkspaceApi({ root: tmpRoot });
  const server = http.createServer((req, res) => api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const rUnpub = await fetch(`${origin}/api/store-molde/${SHOWCASE_USER_ID}/index.html`);
    assert.equal(rUnpub.status, 403, 'Loja não publicada não deve expor HTML anonimamente');

    const token = issueLocalShowcaseToken(SHOWCASE_USER_ID);
    const rIndex = await fetch(`${origin}/api/store-molde/${SHOWCASE_USER_ID}/index.html`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(rIndex.status, 200);
    assert.match(rIndex.headers.get('content-type') || '', /text\/html/);

    const rTraversal = await fetch(`${origin}/api/store-molde/${SHOWCASE_USER_ID}/..%2Fprofile.json`);
    assert.ok([403, 404].includes(rTraversal.status), 'Deve bloquear path traversal');

    // Testa bloqueio 402 na API quando saldo = 0
    const r402 = await fetch(`${origin}/api/store-molde/create-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'Teste Bloqueio' }),
    });
    assert.equal(r402.status, 402);
    const j402 = await r402.json();
    assert.equal(j402.error, 'INSUFFICIENT_CREDITS');
    assert.equal(j402.required, 15);
  } finally {
    await api.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('Fase 3 (F3-GATE-01): ponte Supabase Postgres (debit/refund sem colisão, 402, erro 503 e bloqueio dev em produção)', async () => {
  const prevServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevShowcase = process.env.ALLOW_LOCAL_SHOWCASE_PROFILES;
  const prevNodeEnv = process.env.NODE_ENV;

  const cloudUserId = '11111111-1111-4111-8111-111111111111';
  const cloudJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.mock';
  const validCode = 'AI10-REAL-0230';
  const { createHash } = await import('node:crypto');
  const validCodeHash = createHash('sha256').update(validCode.toLowerCase()).digest('hex');

  let cloudBalance = 230;
  let redeemedOnce = false;
  const ledgerRows = [];
  const seenRefs = new Set();
  const calls = [];
  let forceFailBalance = false;

  const mockFetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, query: u.search, body, auth: init.headers?.Authorization || '' });

    if (u.pathname === '/rest/v1/rpc/cg_get_user_credit_balance') {
      if (forceFailBalance) return new Response(JSON.stringify({ message: 'db down' }), { status: 500 });
      return new Response(JSON.stringify(cloudBalance), { status: 200 });
    }
    if (u.pathname === '/rest/v1/rpc/cg_debit_credits') {
      assert.ok(String(body.p_reference_id).startsWith('debit:'), 'reference_id de débito deve usar prefixo debit:');
      assert.equal(seenRefs.has(body.p_reference_id), false, 'reference_id de débito não pode colidir');
      if (cloudBalance < body.p_cost) {
        return new Response(
          JSON.stringify({ success: false, status: 402, error: 'INSUFFICIENT_CREDITS', required: body.p_cost, balance: cloudBalance }),
          { status: 200 },
        );
      }
      seenRefs.add(body.p_reference_id);
      const before = cloudBalance;
      cloudBalance -= body.p_cost;
      const row = {
        id: `entry-${seenRefs.size}`,
        user_id: body.p_user_id,
        delta: -body.p_cost,
        balance_after: cloudBalance,
        operation_type: body.p_operation_type,
        reference_id: body.p_reference_id,
        created_at: new Date().toISOString(),
      };
      ledgerRows.unshift(row);
      return new Response(
        JSON.stringify({
          success: true,
          debited: body.p_cost,
          balance_before: before,
          balance_after: cloudBalance,
          reference_id: body.p_reference_id,
          entry_id: row.id,
        }),
        { status: 200 },
      );
    }
    if (u.pathname === '/rest/v1/rpc/cg_refund_credits') {
      assert.ok(String(body.p_reference_id).startsWith('refund:'), 'reference_id de estorno deve usar prefixo refund:');
      assert.equal(seenRefs.has(body.p_reference_id), false, 'estorno não pode colidir com debit: no UNIQUE reference_id');
      seenRefs.add(body.p_reference_id);
      const before = cloudBalance;
      cloudBalance += body.p_amount;
      const row = {
        id: `entry-${seenRefs.size}`,
        user_id: body.p_user_id,
        delta: body.p_amount,
        balance_after: cloudBalance,
        operation_type: body.p_operation_type,
        reference_id: body.p_reference_id,
        created_at: new Date().toISOString(),
      };
      ledgerRows.unshift(row);
      return new Response(
        JSON.stringify({
          success: true,
          refunded: body.p_amount,
          balance_before: before,
          balance_after: cloudBalance,
          reference_id: body.p_reference_id,
          entry_id: row.id,
        }),
        { status: 200 },
      );
    }
    if (u.pathname === '/rest/v1/cg_access_codes') {
      if (u.search.includes(validCodeHash)) {
        return new Response(
          JSON.stringify([
            {
              id: 'code-1',
              credits: 230,
              code_masked: 'AI10-****-0230',
              max_redemptions: 1,
              redemption_count: redeemedOnce ? 1 : 0,
              expires_at: null,
              status: redeemedOnce ? 'depleted' : 'active',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.pathname === '/rest/v1/rpc/cg_redeem_access_code') {
      assert.equal(init.headers?.Authorization, `Bearer ${cloudJwt}`, 'resgate deve encaminhar JWT real do usuário');
      if (redeemedOnce) {
        return new Response(JSON.stringify({ success: false, error: 'already_redeemed' }), { status: 200 });
      }
      redeemedOnce = true;
      cloudBalance += 230;
      return new Response(
        JSON.stringify({ success: true, credits_added: 230, new_balance: cloudBalance, code_masked: 'AI10-****-0230' }),
        { status: 200 },
      );
    }
    if (u.pathname === '/rest/v1/cg_credit_ledger') {
      return new Response(JSON.stringify(ledgerRows), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'unexpected_route', path: u.pathname }), { status: 404 });
  };

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cg-cloud-bridge-'));
  try {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret';
    process.env.CG_PERSISTENCE = 'cloud';
    process.env.ALLOW_LOCAL_SHOWCASE_PROFILES = '0';
    process.env.NODE_ENV = 'production';

    const showcaseToken = issueLocalShowcaseToken(SHOWCASE_USER_ID);
    assert.equal(isCloudCreditMode({ user: { id: SHOWCASE_USER_ID, bearer: showcaseToken, isLocalShowcase: true } }), false);
    assert.equal(isCloudCreditMode({ user: { id: cloudUserId, bearer: cloudJwt } }), true);

    const bal = await getCreditBalance({ user: { id: cloudUserId, bearer: cloudJwt }, directory: tmpDir, fetchImpl: mockFetch });
    assert.equal(bal, 230);

    // Débito (-30) -> estorno por fallback (+30) garantindo reference_id distintos sem colisão UNIQUE
    const debitRes = await debitCredits({
      user: { id: cloudUserId, bearer: cloudJwt },
      directory: tmpDir,
      action: 'generate_full_storefront',
      amount: 30,
      metadata: { referenceId: 'job-v9-001' },
      fetchImpl: mockFetch,
    });
    assert.equal(debitRes.ok, true);
    assert.equal(debitRes.balanceAfter, 200);
    assert.equal(debitRes.entry.id, 'debit:job-v9-001');

    const refundRes = await refundCredits({
      user: { id: cloudUserId, bearer: cloudJwt },
      directory: tmpDir,
      action: 'generate_full_storefront',
      amount: 30,
      metadata: { reason: 'glm_fallback_no_charge', referenceId: debitRes.entry.id },
      fetchImpl: mockFetch,
    });
    assert.equal(refundRes.ok, true);
    assert.equal(refundRes.balanceAfter, 230);
    assert.equal(refundRes.entry.id, 'refund:job-v9-001');

    // Esgota saldo até < cost -> devolve 402 sem escrever no ledger
    cloudBalance = 1;
    const blocked = await debitCredits({
      user: { id: cloudUserId, bearer: cloudJwt },
      directory: tmpDir,
      action: 'glm_whatsapp',
      amount: 2,
      fetchImpl: mockFetch,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 402);
    assert.equal(blocked.error, 'INSUFFICIENT_CREDITS');
    assert.equal(blocked.balance, 1);

    // Erro 503 explícito quando Postgres falha (nunca finge saldo 0)
    forceFailBalance = true;
    await assert.rejects(
      () => getCreditBalance({ user: { id: cloudUserId, bearer: cloudJwt }, directory: tmpDir, fetchImpl: mockFetch }),
      (err) => err?.status === 503,
    );
    forceFailBalance = false;

    // Testa rotas HTTP /api/access/validate (bloqueia AI10-FARM-LUME em produção!), /api/access/redeem e /api/credits/balance
    const invokeRoute = async (pathname, method, bodyObj, userObj, ip = '127.0.0.10') => {
      const chunks = bodyObj ? [Buffer.from(JSON.stringify(bodyObj))] : [];
      const req = {
        method,
        url: pathname,
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: ip },
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c;
        },
      };
      let outStatus = 0;
      let outBody = null;
      const res = {
        headersSent: false,
        setHeader() {},
      };
      const send = (r, st, payload) => {
        outStatus = st;
        outBody = payload;
        r.headersSent = true;
        return true;
      };
      class ApiError extends Error {
        constructor(status, message) {
          super(message);
          this.status = status;
        }
      }
      const readJson = async () => bodyObj || {};
      await handleAccessAndCheckoutRoutes(req, res, {
        user: userObj,
        bearer: userObj?.bearer || '',
        fetchImpl: mockFetch,
        directory: tmpDir,
        readJson,
        send,
        ApiError,
        readJsonFile: async () => [],
        atomicWriteJson: async () => {},
      });
      return { status: outStatus, body: outBody };
    };

    const devBlocked = await invokeRoute('/api/access/validate', 'POST', { code: 'AI10-FARM-LUME' }, { id: 'public-visitor' }, '10.0.0.1');
    assert.equal(devBlocked.status, 200);
    assert.equal(devBlocked.body.valid, false);
    assert.equal(devBlocked.body.reason, 'not_found');

    const cloudValid = await invokeRoute('/api/access/validate', 'POST', { code: validCode }, { id: 'public-visitor' }, '10.0.0.2');
    assert.equal(cloudValid.status, 200);
    assert.equal(cloudValid.body.valid, true);
    assert.equal(cloudValid.body.credits, 230);

    const redeemed = await invokeRoute('/api/access/redeem', 'POST', { code: validCode }, { id: cloudUserId, bearer: cloudJwt });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.creditsAdded, 230);
    assert.equal(redeemed.body.newBalance, 231);

    const balRoute = await invokeRoute('/api/credits/balance', 'GET', null, { id: cloudUserId, bearer: cloudJwt });
    assert.equal(balRoute.status, 200);
    assert.equal(balRoute.body.balance, 231);
    assert.ok(Array.isArray(balRoute.body.history) && balRoute.body.history.length >= 2);
  } finally {
    if (prevServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceRole;
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    if (prevShowcase === undefined) delete process.env.ALLOW_LOCAL_SHOWCASE_PROFILES;
    else process.env.ALLOW_LOCAL_SHOWCASE_PROFILES = prevShowcase;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
