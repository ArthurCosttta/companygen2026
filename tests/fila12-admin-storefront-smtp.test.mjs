import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { handleAdminRoutes } from '../server/admin-console.mjs';
import { loadStorefrontSnapshot } from '../server/public-storefront-loader.mjs';
import { creditsAddedEmail } from '../server/email-templates.mjs';

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

function makeFakeJwt(sub, email) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ sub, email })).toString('base64url');
  return `${h}.${p}.sig`;
}

function createServerWithTransport(root, emailTransportOverride) {
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

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const userId = String(req.headers['x-test-user-id'] || '11111111-1111-4111-8111-111111111111');
    const userEmail = String(req.headers['x-test-user-email'] || 'user@loja.com');
    const user = { id: userId, email: userEmail, bearer };
    const directory = path.join(root, userId);

    try {
      if (pathname.startsWith('/api/public/store/')) {
        const lookupKey = decodeURIComponent(pathname.slice('/api/public/store/'.length));
        const snap = await loadStorefrontSnapshot({ lookupKey, allowDraft: false, root, readJsonFile });
        return send(res, snap.ok ? 200 : snap.status || 404, snap);
      }
      if (pathname.startsWith('/api/admin/')) {
        const handled = await handleAdminRoutes(req, res, {
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
          emailTransportOverride,
        });
        if (handled !== false) return;
      }
      send(res, 404, { error: 'Not found' });
    } catch (err) {
      send(res, err?.status || 500, { error: err?.message || 'Internal error' });
    }
  });
}

test('QA12-05 — XSS / HTML injection é escapado no template de e-mail de créditos', () => {
  const mail = creditsAddedEmail({
    storeName: 'Loja <script>alert(1)</script>',
    amount: 50,
    newBalance: 75.5,
    reasonLabel: 'Bônus',
    note: '<img src=x onerror=alert(1)><b>hack</b>',
  });
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(!mail.html.includes('<img src=x'));
  assert.ok(mail.html.includes('&lt;script&gt;'));
  assert.ok(mail.html.includes('&lt;img src=x'));
  assert.ok(mail.html.includes('75,5 cr'));
  assert.ok(mail.html.includes('755 msgs'));
});

test('QA12-01..09 — Ver loja (slug, fallback, draft, IDOR, zero PII) + Gmail SMTP (sucesso, falha resiliente, negativo, idempotência)', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevAdmins = process.env.CG_ADMIN_EMAILS;
  process.env.CG_PERSISTENCE = 'local';
  process.env.CG_ADMIN_EMAILS = 'admin@companygen.store';

  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-fila12-'));
  const sentEmails = [];
  let failSmtp = false;
  const mockTransport = {
    async sendMail(opts) {
      if (failSmtp) {
        const e = new Error('EAUTH Invalid login');
        e.code = 'EAUTH';
        throw e;
      }
      sentEmails.push(opts);
      return { messageId: `msg-${sentEmails.length}` };
    },
  };

  const server = createServerWithTransport(root, mockTransport);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const adminId = '99999999-9999-4999-8999-999999999999';
  const adminHeaders = {
    Authorization: `Bearer ${makeFakeJwt(adminId, 'admin@companygen.store')}`,
    'Content-Type': 'application/json',
    'x-test-user-id': adminId,
    'x-test-user-email': 'admin@companygen.store',
  };

  const pubUserId = '55555555-5555-4555-8555-555555555555';
  const draftUserId = '66666666-6666-4666-8666-666666666666';
  const normalUserHeaders = {
    Authorization: `Bearer ${makeFakeJwt(pubUserId, 'dono@lume.com')}`,
    'Content-Type': 'application/json',
    'x-test-user-id': pubUserId,
    'x-test-user-email': 'dono@lume.com',
  };

  try {
    // Seed loja publicada SEM formulas-ir.json (somente profile.json com PII privado)
    await atomicWriteJson(path.join(root, pubUserId, 'profile.json'), {
      data: {
        business: { name: 'Farmácia Lume', segment: 'Farmácia', email: 'secreto@lume.com' },
        whatsapp: { connected: true, phoneE164: '+5561999990001' },
        payment: { pixKey: 'chave-privada-123', showPixPublicly: false },
        desktopPrefs: { internalToken: 'super-secret-token' },
        catalog: { products: [{ id: 'p1', sku: 'S1', name: 'Protetor FPS 50', priceCents: 8990, active: true }] },
        publishedStore: { published: true, publicSlug: 'farmacia-lume' },
      },
    });
    // Seed loja em RASCUNHO (published: false)
    await atomicWriteJson(path.join(root, draftUserId, 'profile.json'), {
      data: {
        business: { name: 'Loja Rascunho', segment: 'Moda', email: 'rascunho@teste.com' },
        catalog: { products: [{ id: 'p2', sku: 'S2', name: 'Camiseta', priceCents: 4990, active: true }] },
        publishedStore: { published: false, publicSlug: 'loja-rascunho' },
      },
    });

    // QA12-04 & QA12-03: Slug público sem formulas-ir.json funciona via profile_fallback + ZERO PII
    const pubRes = await fetch(`${base}/api/public/store/farmacia-lume`);
    assert.equal(pubRes.status, 200);
    const pubJson = await pubRes.json();
    assert.equal(pubJson.source, 'profile_fallback');
    assert.equal(pubJson.profile.business.name, 'Farmácia Lume');
    assert.equal(pubJson.profile.catalog.products.length, 1);
    const rawPubStr = JSON.stringify(pubJson);
    assert.ok(!rawPubStr.includes('secreto@lume.com'), 'Vazou e-mail privado!');
    assert.ok(!rawPubStr.includes('chave-privada-123'), 'Vazou chave Pix privada!');
    assert.ok(!rawPubStr.includes('super-secret-token'), 'Vazou desktopPrefs!');

    // QA12-02: Público tentando ver rascunho -> 403
    const draftPubRes = await fetch(`${base}/api/public/store/${draftUserId}`);
    assert.equal(draftPubRes.status, 403);

    // QA12-01: Lojista comum tentando endpoint admin de loja alheia (IDOR) -> 403
    const idorRes = await fetch(`${base}/api/admin/users/${draftUserId}/storefront`, {
      headers: normalUserHeaders,
    });
    assert.equal(idorRes.status, 403);

    // Admin vendo loja em rascunho -> 200 com draft: true
    const adminDraftRes = await fetch(`${base}/api/admin/users/${draftUserId}/storefront`, {
      headers: adminHeaders,
    });
    assert.equal(adminDraftRes.status, 200);
    const adminDraftJson = await adminDraftRes.json();
    assert.equal(adminDraftJson.draft, true);
    assert.equal(adminDraftJson.profile.business.name, 'Loja Rascunho');

    // QA12-09: Admin adiciona +25 cr com notifyByEmail: true -> e-mail enviado!
    const credRes = await fetch(`${base}/api/admin/users/credits`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        userId: pubUserId,
        targetEmail: 'dono@lume.com',
        mode: 'add',
        amount: 25,
        reasonCode: 'support_comp',
        note: 'Compensação teste <script>xss</script>',
        notifyByEmail: true,
        idempotencyKey: 'idem-001',
      }),
    });
    assert.equal(credRes.status, 200);
    const credJson = await credRes.json();
    assert.equal(credJson.newBalance, 25);
    assert.equal(credJson.emailSent, true);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'dono@lume.com');
    assert.ok(!sentEmails[0].html.includes('<script>'));

    // QA12-08: Idempotência -> segunda chamada com mesmo idempotencyKey não duplica saldo nem e-mail
    const dupRes = await fetch(`${base}/api/admin/users/credits`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        userId: pubUserId,
        targetEmail: 'dono@lume.com',
        mode: 'add',
        amount: 25,
        reasonCode: 'support_comp',
        note: 'Compensação duplicada',
        notifyByEmail: true,
        idempotencyKey: 'idem-001',
      }),
    });
    const dupJson = await dupRes.json();
    assert.equal(dupJson.duplicate, true);
    assert.equal(sentEmails.length, 1);

    // QA12-07: Débito negativo (-5) com notifyByEmail: true -> NÃO dispara e-mail
    const negRes = await fetch(`${base}/api/admin/users/credits`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        userId: pubUserId,
        targetEmail: 'dono@lume.com',
        mode: 'add',
        amount: -5,
        reasonCode: 'manual_audit',
        note: 'Ajuste negativo de teste',
        notifyByEmail: true,
      }),
    });
    const negJson = await negRes.json();
    assert.equal(negJson.newBalance, 20);
    assert.equal(negJson.emailSent, false);
    assert.equal(sentEmails.length, 1);

    // QA12-06: SMTP quebrado -> créditos SÃO aplicados e retorna emailSent: false + emailError: 'EAUTH'
    failSmtp = true;
    const brokenSmtpRes = await fetch(`${base}/api/admin/users/credits`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        userId: pubUserId,
        targetEmail: 'dono@lume.com',
        mode: 'add',
        amount: 10,
        reasonCode: 'bonus',
        note: 'Bônus com SMTP fora',
        notifyByEmail: true,
      }),
    });
    assert.equal(brokenSmtpRes.status, 200);
    const brokenJson = await brokenSmtpRes.json();
    assert.equal(brokenJson.newBalance, 30);
    assert.equal(brokenJson.emailSent, false);
    assert.equal(brokenJson.emailError, 'EAUTH');
  } finally {
    server.close();
    process.env.CG_PERSISTENCE = prevPersistence;
    process.env.CG_ADMIN_EMAILS = prevAdmins;
    await rm(root, { recursive: true, force: true });
  }
});
