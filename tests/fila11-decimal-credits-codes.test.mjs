import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import {
  CREDIT_ACTION_COSTS,
  CREDIT_PLANS,
  debitCredits,
  getCreditBalance,
  handleAccessAndCheckoutRoutes,
  issueLocalShowcaseToken,
  roundCredits,
} from '../server/access-and-checkout.mjs';
import { handleAdminRoutes } from '../server/admin-console.mjs';
import { resolveCredits } from '../supabase/functions/kiwify-webhook/core.mjs';

async function atomicWriteJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function createTestServer(root) {
  const send = (res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };
  const readJson = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  };
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const userId = req.headers['x-test-user-id'] || '11111111-1111-4111-8111-111111111111';
    const userEmail = req.headers['x-test-user-email'] || 'lojista@teste.com';
    const user = { id: String(userId), email: String(userEmail), bearer };
    const directory = path.join(root, user.id);

    try {
      const ctx = {
        req,
        res,
        pathname,
        url,
        user,
        bearer,
        directory,
        root,
        readJson,
        send,
        ApiError,
        readJsonFile,
        atomicWriteJson,
      };
      if (pathname.startsWith('/api/admin/')) {
        const handled = await handleAdminRoutes(req, res, ctx);
        if (handled !== false) return;
      }
      const handled = await handleAccessAndCheckoutRoutes(req, res, ctx);
      if (handled !== false) return;
      send(res, 404, { error: 'Not found' });
    } catch (err) {
      send(res, err?.status || 500, { error: err?.message || 'Internal error' });
    }
  });

  return server;
}

test('FILA 11 — Tabela recalibrada (0,1 cr WhatsApp; planos 20/55/250; Kiwify coerente)', () => {
  assert.equal(CREDIT_ACTION_COSTS.glm_whatsapp, 0.1);
  assert.equal(CREDIT_ACTION_COSTS.edit_block, 0.5);
  assert.equal(CREDIT_ACTION_COSTS.generate_image_schnell, 1);
  assert.equal(CREDIT_ACTION_COSTS.generate_hero_dev, 2);
  assert.equal(CREDIT_ACTION_COSTS.create_subpage, 2);
  assert.equal(CREDIT_ACTION_COSTS.generate_full_storefront, 4);

  const byId = Object.fromEntries(CREDIT_PLANS.map((p) => [p.id, p.credits]));
  assert.equal(byId.plan_micro_10, 20);
  assert.equal(byId.plan_growth_25, 55);
  assert.equal(byId.plan_100_brl, 250);

  assert.equal(resolveCredits({ Subscription: { plan: { checkout_code: '7fBDYu4' } } })?.credits, 20);
  assert.equal(resolveCredits({ Subscription: { plan: { checkout_code: 'O0ueDhe' } } })?.credits, 55);
  assert.equal(resolveCredits({ Commissions: { charge_amount: 10000 } })?.credits, 250);
  assert.equal(roundCredits(0.1 + 0.2), 0.3);
});

test('QA11-01 — 50 débitos paralelos de 0,1 cr em saldo 1,00 cr (exatamente 10 passam, saldo final exato 0)', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-fila11-race-'));
  try {
    const userId = '22222222-2222-4222-8222-222222222222';
    const dir = path.join(root, userId);
    await atomicWriteJson(path.join(dir, 'credits_ledger.json'), [
      { id: 'seed', user_id: userId, delta: 1, balance_after: 1, operation_type: 'welcome_invite', created_at: new Date().toISOString() },
    ]);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, idx) =>
        debitCredits({
          user: { id: userId },
          directory: dir,
          action: 'glm_whatsapp',
          metadata: { referenceId: `msg-${idx}` },
          readJsonFile,
          atomicWriteJson,
        }),
      ),
    );

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok && r.error === 'INSUFFICIENT_CREDITS').length;
    assert.equal(okCount, 10, `Esperava 10 débitos aprovados, obteve ${okCount}`);
    assert.equal(failCount, 40, `Esperava 40 bloqueios 402, obteve ${failCount}`);

    const finalBal = await getCreditBalance({ user: { id: userId }, directory: dir, readJsonFile });
    assert.equal(finalBal, 0);
  } finally {
    process.env.CG_PERSISTENCE = prevPersistence;
    await rm(root, { recursive: true, force: true });
  }
});

test('QA11-02..08 — Códigos especiais (AI10 vs RC10), TOCTOU limite 3, tags, rate limit, NaN e zero 127.0.0.1', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevAdmins = process.env.CG_ADMIN_EMAILS;
  const prevUrl = process.env.COMPANYGEN_URL;
  process.env.CG_PERSISTENCE = 'local';
  process.env.CG_ADMIN_EMAILS = 'admin@companygen.store';
  process.env.COMPANYGEN_URL = 'https://companygen.store';

  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-fila11-api-'));
  const server = createTestServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const makeFakeJwt = (sub, email) => {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub, email })).toString('base64url');
    return `${h}.${p}.sig`;
  };
  const adminId = '99999999-9999-4999-8999-999999999999';
  const adminToken = makeFakeJwt(adminId, 'admin@companygen.store');
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
    'x-test-user-id': adminId,
    'x-test-user-email': 'admin@companygen.store',
  };

  const userId = '33333333-3333-4333-8333-333333333333';
  const userToken = issueLocalShowcaseToken(userId, 'cliente@loja.com');
  const userHeaders = {
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json',
    'x-test-user-id': userId,
    'x-test-user-email': 'cliente@loja.com',
  };

  try {
    // 1. Admin cria 1 código de convite (invite_only) e verifica URL sem 127.0.0.1
    const invRes = await fetch(`${base}/api/admin/invites`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ codeType: 'invite_only', credits: 20, maxRedemptions: 1, note: 'Convite QA' }),
    });
    assert.equal(invRes.status, 200);
    const invJson = await invRes.json();
    assert.match(invJson.invite.code, /^AI10-/);
    assert.equal(invJson.invite.codeType, 'invite_only');
    assert.equal(invJson.invite.statusLabel, 'Disponível');
    assert.ok(invJson.invite.inviteUrl.startsWith('https://companygen.store/'), `URL inválida: ${invJson.invite.inviteUrl}`);
    assert.ok(!invJson.invite.inviteUrl.includes('127.0.0.1'));

    // 2. Admin cria 4 códigos de recarga (user_recharge)
    const rechargeCodes = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await fetch(`${base}/api/admin/invites`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ codeType: 'user_recharge', credits: 5.5, maxRedemptions: 1, note: `Recarga ${i + 1}` }),
      });
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.match(j.invite.code, /^RC10-/);
      assert.equal(j.invite.credits, 5.5);
      rechargeCodes.push(j.invite.code);
    }

    // 3. QA11-03 — Troca cruzada bloqueada
    const wrongInviteAsRecharge = await fetch(`${base}/api/credits/redeem-code`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ code: invJson.invite.code }),
    });
    assert.equal(wrongInviteAsRecharge.status, 400);

    const wrongRechargeAsInvite = await fetch(`${base}/api/access/redeem`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({ code: rechargeCodes[0] }),
    });
    assert.equal(wrongRechargeAsInvite.status, 400);

    // 4. QA11-02 — TOCTOU: 4 resgates simultâneos de códigos RC10 pelo mesmo usuário (máx. 3!)
    const burstRedeem = await Promise.all(
      rechargeCodes.map((code) =>
        fetch(`${base}/api/credits/redeem-code`, {
          method: 'POST',
          headers: userHeaders,
          body: JSON.stringify({ code }),
        }).then(async (r) => ({ status: r.status, body: await r.json() })),
      ),
    );
    const succeeded = burstRedeem.filter((r) => r.status === 200);
    const blockedLimit = burstRedeem.filter((r) => r.status === 409);
    assert.equal(succeeded.length, 3, `Esperava 3 resgates aprovados, obteve ${succeeded.length}: ${JSON.stringify(burstRedeem)}`);
    assert.equal(blockedLimit.length, 1, `Esperava 1 bloqueio 409 no 4º resgate, obteve ${blockedLimit.length}`);

    // Verificar saldo exato (3 * 5.5 = 16.5) e quota (3/3)
    const balRes = await fetch(`${base}/api/credits/balance`, { headers: userHeaders });
    const balJson = await balRes.json();
    assert.equal(balJson.balance, 16.5);

    const quotaRes = await fetch(`${base}/api/credits/redemption-quota`, { headers: userHeaders });
    const quotaJson = await quotaRes.json();
    assert.equal(quotaJson.used, 3);
    assert.equal(quotaJson.remaining, 0);

    // 5. QA11-08 — Verificar GET /api/admin/invites mudou tag para Utilizado (1/1) com e-mail
    const listRes = await fetch(`${base}/api/admin/invites`, { headers: adminHeaders });
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    const usedOnes = listJson.invites.filter((i) => rechargeCodes.includes(i.code) && i.status === 'depleted');
    assert.equal(usedOnes.length, 3);
    assert.equal(usedOnes[0].statusLabel, 'Utilizado (1/1)');
    assert.equal(usedOnes[0].lastRedeemedByEmail, 'cliente@loja.com');

    // Revogar o convite não usado
    const revRes = await fetch(`${base}/api/admin/invites/revoke`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ code: invJson.invite.code }),
    });
    assert.equal(revRes.status, 200);
    const listAfterRev = await (await fetch(`${base}/api/admin/invites`, { headers: adminHeaders })).json();
    const revokedRow = listAfterRev.invites.find((i) => i.code === invJson.invite.code);
    assert.equal(revokedRow.statusLabel, 'Revogado');

    // 6. QA11-04 — Payloads maliciosos (NaN, Infinity, negativo) rejeitados com 400
    const badCredits = await fetch(`${base}/api/admin/invites`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ codeType: 'user_recharge', credits: -50 }),
    });
    assert.equal(badCredits.status, 400);

    const badAdjust = await fetch(`${base}/api/admin/users/credits`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ userId, mode: 'set', amount: 'NaN', reasonCode: 'bonus', note: 'Teste NaN' }),
    });
    assert.equal(badAdjust.status, 400);

    // 7. QA11-05 — Rate limit (força bruta por outro usuário: 6ª tentativa -> 429)
    const bruteUser = '44444444-4444-4444-8444-444444444444';
    const bruteHeaders = {
      Authorization: `Bearer ${issueLocalShowcaseToken(bruteUser, 'brute@teste.com')}`,
      'Content-Type': 'application/json',
      'x-test-user-id': bruteUser,
      'x-test-user-email': 'brute@teste.com',
    };
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await fetch(`${base}/api/credits/redeem-code`, {
        method: 'POST',
        headers: bruteHeaders,
        body: JSON.stringify({ code: `RC10-FAKE-000${i}` }),
      });
      statuses.push(r.status);
    }
    assert.equal(statuses[5], 429, `Esperava 429 na 6ª tentativa, obteve ${JSON.stringify(statuses)}`);

    // 8. QA11-07 — Unit Economics sem NaN após débito de WhatsApp
    await debitCredits({
      user: { id: userId },
      directory: path.join(root, userId),
      action: 'glm_whatsapp',
      metadata: { referenceId: 'wa-econ-1' },
      readJsonFile,
      atomicWriteJson,
    });
    const ovRes = await fetch(`${base}/api/admin/overview`, { headers: adminHeaders });
    const ovJson = await ovRes.json();
    assert.ok(Number.isFinite(ovJson.summary.aiCostCents), `aiCostCents NaN: ${ovJson.summary.aiCostCents}`);
    assert.ok(Number.isFinite(ovJson.summary.netMarginCents), `netMarginCents NaN: ${ovJson.summary.netMarginCents}`);
  } finally {
    server.close();
    process.env.CG_PERSISTENCE = prevPersistence;
    process.env.CG_ADMIN_EMAILS = prevAdmins;
    process.env.COMPANYGEN_URL = prevUrl;
    await rm(root, { recursive: true, force: true });
  }
});
