import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { issueLocalShowcaseToken } from '../server/access-and-checkout.mjs';
import { isSafeRedirectTarget, resolveBrandedServerOrigin } from '../server/support-and-qr.mjs';
import { createWorkspaceApi } from '../server/workspace.mjs';

function sha256(text) {
  return createHash('sha256').update(String(text || '').trim().toLowerCase()).digest('hex');
}

test('Wave 1 — resolveBrandedServerOrigin & isSafeRedirectTarget bloqueiam run.app e aceitam Firebase Hosting / companygen.store', () => {
  const prevUrl = process.env.COMPANYGEN_URL;
  process.env.COMPANYGEN_URL = 'https://companygen.store';
  try {
    assert.equal(
      resolveBrandedServerOrigin({ headers: { 'x-forwarded-host': 'companygen-app.web.app' } }),
      'https://companygen-app.web.app',
    );
    assert.equal(
      resolveBrandedServerOrigin({ headers: { host: 'companygen-app-sbbb3a4lfq-rj.a.run.app' } }),
      'https://companygen-app.web.app',
    );
    assert.equal(
      resolveBrandedServerOrigin({ headers: { host: 'companygen.store' } }),
      'https://companygen.store',
    );
    assert.equal(
      resolveBrandedServerOrigin({ headers: { host: '127.0.0.1:5174' } }),
      'https://companygen.store',
    );
    delete process.env.COMPANYGEN_URL;
    assert.equal(
      resolveBrandedServerOrigin({ headers: { host: '127.0.0.1:5174', 'x-forwarded-proto': 'http' } }),
      'http://127.0.0.1:5174',
    );
  } finally {
    if (prevUrl === undefined) delete process.env.COMPANYGEN_URL;
    else process.env.COMPANYGEN_URL = prevUrl;
  }

  assert.equal(isSafeRedirectTarget('https://companygen-app.web.app/?route=access'), true);
  assert.equal(isSafeRedirectTarget('https://companygen-app.firebaseapp.com/?view=store'), true);
  assert.equal(isSafeRedirectTarget('https://companygenai.web.app/'), true);
  assert.equal(isSafeRedirectTarget('https://companygen.store/'), true);
  assert.equal(isSafeRedirectTarget('https://evil.example.com/'), false);
});

test('Wave 1 — /api/kiwify/lookup-code valida entrada, expõe código apenas se não resgatado e oculta se já resgatado/revogado', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevUrl = process.env.CG_SUPABASE_URL;
  const prevService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.CG_PERSISTENCE;
  process.env.CG_SUPABASE_URL = 'https://mock-supabase.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-wave1-lookup-'));

  const purchaseRows = [
    {
      id: 'p-1',
      order_id: 'ord-available-1',
      webhook_event_type: 'order_approved',
      access_code_id: 'ac-1',
      buyer_email: 'comprador@teste.com',
      code_plain: 'AI10-KW77-M9PQ',
      code_masked: 'AI10-****-M9PQ',
      credits: 250,
      plan_code: '0USJqo5',
      created_at: '2026-11-22T10:00:00.000Z',
    },
    {
      id: 'p-2',
      order_id: 'ord-redeemed-2',
      webhook_event_type: 'order_approved',
      access_code_id: 'ac-2',
      buyer_email: 'comprador@teste.com',
      code_plain: null,
      code_masked: 'AI10-****-ZZ11',
      credits: 55,
      plan_code: 'O0ueDhe',
      created_at: '2026-11-22T11:00:00.000Z',
    },
    {
      id: 'p-3',
      order_id: 'ord-revoked-3',
      webhook_event_type: 'order_approved',
      access_code_id: 'ac-3',
      buyer_email: 'comprador@teste.com',
      code_plain: null,
      code_masked: 'AI10-****-RV99',
      credits: 20,
      plan_code: '7fBDYu4',
      created_at: '2026-11-22T12:00:00.000Z',
    },
  ];
  const accessCodeRows = {
    'ac-1': { id: 'ac-1', status: 'active', redemption_count: 0, max_redemptions: 1, last_redeemed_at: null, credits: 250 },
    'ac-2': { id: 'ac-2', status: 'depleted', redemption_count: 1, max_redemptions: 1, last_redeemed_at: '2026-11-22T11:05:00.000Z', credits: 55 },
    'ac-3': { id: 'ac-3', status: 'revoked', redemption_count: 0, max_redemptions: 1, last_redeemed_at: null, credits: 20 },
  };

  const api = createWorkspaceApi({
    root: tmpRoot,
    fetch: async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === '/rest/v1/cg_kiwify_purchase_codes') {
        const emailEq = (parsed.searchParams.get('buyer_email') || '').replace(/^eq\./, '');
        const orderEq = (parsed.searchParams.get('order_id') || '').replace(/^eq\./, '');
        const hit = purchaseRows.filter((r) => r.buyer_email === emailEq && r.order_id === orderEq);
        return Response.json(hit, { status: 200 });
      }
      if (parsed.pathname === '/rest/v1/cg_access_codes') {
        const idEq = (parsed.searchParams.get('id') || '').replace(/^eq\./, '');
        const row = accessCodeRows[idEq];
        return Response.json(row ? [row] : [], { status: 200 });
      }
      return Response.json({ error: 'not_mocked' }, { status: 404 });
    },
  });

  const server = http.createServer((req, res) => {
    api.handler(req, res, () => {
      res.writeHead(404);
      res.end('not found');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const badRes = await fetch(`${base}/api/kiwify/lookup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'comprador@teste.com', orderId: '' }),
    });
    assert.equal(badRes.status, 400);

    const missRes = await fetch(`${base}/api/kiwify/lookup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'outro@teste.com', orderId: 'ord-available-1' }),
    });
    assert.equal(missRes.status, 404);

    const okRes = await fetch(`${base}/api/kiwify/lookup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'COMPRADOR@TESTE.COM', orderId: '#ord-available-1' }),
    });
    assert.equal(okRes.status, 200);
    const okJson = await okRes.json();
    assert.equal(okJson.status, 'available');
    assert.equal(okJson.code, 'AI10-KW77-M9PQ');
    assert.equal(okJson.credits, 250);

    const redeemedRes = await fetch(`${base}/api/kiwify/lookup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'comprador@teste.com', orderId: 'ord-redeemed-2' }),
    });
    assert.equal(redeemedRes.status, 200);
    const redeemedJson = await redeemedRes.json();
    assert.equal(redeemedJson.status, 'redeemed');
    assert.equal(redeemedJson.code, undefined);
    assert.equal(redeemedJson.codeMasked, 'AI10-****-ZZ11');

    const revokedRes = await fetch(`${base}/api/kiwify/lookup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'comprador@teste.com', orderId: 'ord-revoked-3' }),
    });
    assert.equal(revokedRes.status, 200);
    const revokedJson = await revokedRes.json();
    assert.equal(revokedJson.status, 'revoked');
    assert.equal(revokedJson.code, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    api.close();
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    if (prevUrl === undefined) delete process.env.CG_SUPABASE_URL;
    else process.env.CG_SUPABASE_URL = prevUrl;
    if (prevService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevService;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('Wave 1 — /api/credits/redeem-code aceita kiwify_purchase mesmo após 3 códigos promocionais RC10', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-wave1-redeem-'));

  const userId = '44444444-4444-4444-8444-444444444444';
  const userDir = path.join(tmpRoot, userId);
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(
    path.join(userDir, 'credits_ledger.json'),
    JSON.stringify([
      { id: 'r1', user_id: userId, delta: 10, balance_after: 10, operation_type: 'recharge_code', reference_id: 'recharge:1' },
      { id: 'r2', user_id: userId, delta: 10, balance_after: 20, operation_type: 'recharge_code', reference_id: 'recharge:2' },
      { id: 'r3', user_id: userId, delta: 10, balance_after: 30, operation_type: 'recharge_code', reference_id: 'recharge:3' },
    ]),
    'utf8',
  );
  await fs.writeFile(
    path.join(tmpRoot, '_shared_access_codes.json'),
    JSON.stringify([
      {
        code: 'AI10-KW11-2233',
        hash: sha256('AI10-KW11-2233'),
        masked: 'AI10-****-2233',
        codeType: 'kiwify_purchase',
        credits: 250,
        maxRedemptions: 1,
        redemptionCount: 0,
        status: 'active',
        expiresAt: null,
      },
    ]),
    'utf8',
  );

  const api = createWorkspaceApi({ root: tmpRoot });
  const server = http.createServer((req, res) => {
    api.handler(req, res, () => {
      res.writeHead(404);
      res.end('not found');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueLocalShowcaseToken(userId, 'cliente@kiwify.com');

  try {
    const res = await fetch(`${base}/api/credits/redeem-code`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'AI10-KW11-2233' }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.creditsAdded, 250);
    assert.equal(json.newBalance, 280);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    api.close();
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test('Wave 1 — Migration SQL e Edge Function garantem código AI10 em toda compra aprovada e APP_URL Firebase', async () => {
  const migrationSql = await fs.readFile(
    new URL('../supabase/migrations/20261122000100_cg_kiwify_always_generate_code.sql', import.meta.url),
    'utf8',
  );
  const edgeFn = await fs.readFile(
    new URL('../supabase/functions/kiwify-webhook/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(migrationSql, /'kiwify_purchase'/);
  assert.match(migrationSql, /create table if not exists public\.cg_kiwify_purchase_codes/i);
  assert.match(migrationSql, /enable row level security/i);
  assert.match(migrationSql, /p_access_code_plain text default null/i);
  assert.match(migrationSql, /v_code_type = 'user_recharge' and v_used_count >= 3/i);

  assert.match(edgeFn, /https:\/\/companygen-app\.web\.app/);
  assert.match(edgeFn, /p_access_code_plain:\s*generatedCode/);
  assert.match(edgeFn, /access_code:\s*context\.code/);
});
