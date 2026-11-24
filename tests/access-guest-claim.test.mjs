import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.CG_PERSISTENCE = 'local';
process.env.ALLOW_LOCAL_SHOWCASE_PROFILES = '1';

const { debitCredits, handleAccessAndCheckoutRoutes } = await import(
  '../server/access-and-checkout.mjs'
);

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function invokeRoute({ method = 'POST', pathname, body = {}, user, root }) {
  const userDir = path.join(root, user.id);
  await mkdir(userDir, { recursive: true });
  let status = 200;
  let payload = null;

  const req = {
    url: `http://127.0.0.1:5174${pathname}`,
    method,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = {
    headersSent: false,
    setHeader() {},
  };

  try {
    await handleAccessAndCheckoutRoutes(req, res, {
      user,
      bearer: '',
      directory: userDir,
      readJson: async () => body,
      send: (_res, s, data) => {
        status = s;
        payload = data;
      },
      ApiError,
      readJsonFile,
      atomicWriteJson,
    });
  } catch (err) {
    status = err?.status || 500;
    payload = { ok: false, error: err?.message || 'Error' };
  }
  return { status, payload };
}

test('Código AI10 iniciado sem e-mail permite retomar / vincular a um e-mail real e bloqueia depois', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-guest-claim-'));
  try {
    const rawCode = 'AI10-GUES-CLM1';
    const hash = createHash('sha256').update(rawCode.toLowerCase()).digest('hex');
    await atomicWriteJson(path.join(root, '_shared_access_codes.json'), [
      {
        id: randomUUID(),
        code: rawCode,
        hash,
        masked: 'AI10-****-CLM1',
        codeType: 'invite_only',
        credits: 20,
        maxRedemptions: 1,
        redemptionCount: 0,
        status: 'active',
        reusableInDev: false,
      },
    ]);

    const visitor = { id: 'public-visitor' };

    // 1. Usuário A inicia sem e-mail
    const startA = await invokeRoute({
      pathname: '/api/access/guest-start',
      body: { code: rawCode },
      user: visitor,
      root,
    });
    assert.equal(startA.status, 200);
    assert.equal(startA.payload.ok, true);
    assert.equal(startA.payload.resumed, false);
    assert.equal(startA.payload.balance, 20);
    const guestId = startA.payload.user.id;
    const guestToken = startA.payload.token;

    // Simula gasto de 4 cr na loja convidada + criação de profile.json e IR
    const guestDir = path.join(root, guestId);
    await debitCredits({
      user: { id: guestId, isGuest: true },
      directory: guestDir,
      action: 'generate_full_storefront',
      readJsonFile,
      atomicWriteJson,
    });
    await atomicWriteJson(path.join(guestDir, 'profile.json'), {
      revision: 1,
      data: { business: { name: 'Loja Convidada Teste' } },
    });
    await atomicWriteJson(path.join(guestDir, 'storefront-molde', 'data', 'formulas-ir.json'), {
      logoUrl: `/api/store-molde/${guestId}/assets/logo.png`,
    });

    // 2. Outro usuário digita o mesmo código AI10: deve reconhecer saldo real (16 cr) e estado "sem e-mail"
    const valB = await invokeRoute({
      pathname: '/api/access/validate',
      body: { code: rawCode },
      user: visitor,
      root,
    });
    assert.equal(valB.status, 200);
    assert.equal(valB.payload.valid, true);
    assert.equal(valB.payload.claimedWithoutEmail, true);
    assert.equal(valB.payload.credits, 16);
    assert.equal(valB.payload.guestStoreName, 'Loja Convidada Teste');

    // Reentrar sem e-mail retoma a mesma guestUserId com 16 cr (sem duplicar 20 cr!)
    const startB = await invokeRoute({
      pathname: '/api/access/guest-start',
      body: { code: rawCode },
      user: visitor,
      root,
    });
    assert.equal(startB.status, 200);
    assert.equal(startB.payload.resumed, true);
    assert.equal(startB.payload.user.id, guestId);
    assert.equal(startB.payload.balance, 16);

    // 3. Usuário vincula o código + loja convidada a um e-mail real
    const realUserId = randomUUID();
    const claimRes = await invokeRoute({
      pathname: '/api/access/claim-email',
      body: { code: rawCode, guestToken },
      user: { id: realUserId, email: 'cliente@loja.com.br', isGuest: false },
      root,
    });
    assert.equal(claimRes.status, 200);
    assert.equal(claimRes.payload.ok, true);
    assert.equal(claimRes.payload.balance, 16);

    // Verifica migração de profile.json + reescrita de URL + saldo zerado no guest
    const migratedProfile = await readJsonFile(path.join(root, realUserId, 'profile.json'), null);
    assert.equal(migratedProfile?.data?.business?.name, 'Loja Convidada Teste');
    const migratedIr = await readJsonFile(
      path.join(root, realUserId, 'storefront-molde', 'data', 'formulas-ir.json'),
      null,
    );
    assert.equal(migratedIr?.logoUrl, `/api/store-molde/${realUserId}/assets/logo.png`);
    const guestLedgerAfter = await readJsonFile(path.join(guestDir, 'credits_ledger.json'), []);
    assert.equal(guestLedgerAfter[guestLedgerAfter.length - 1]?.balance_after, 0);

    // 4. Depois que o e-mail foi vinculado, outro usuário NÃO pode mais validar nem entrar como convidado!
    const valAfter = await invokeRoute({
      pathname: '/api/access/validate',
      body: { code: rawCode },
      user: visitor,
      root,
    });
    assert.equal(valAfter.payload.valid, false);
    assert.equal(valAfter.payload.reason, 'already_redeemed');
    assert.equal(valAfter.payload.hasLinkedEmail, true);
    assert.equal(valAfter.payload.maskedEmail, 'cl***@loja.com.br');

    const startAfter = await invokeRoute({
      pathname: '/api/access/guest-start',
      body: { code: rawCode },
      user: visitor,
      root,
    });
    assert.equal(startAfter.status, 409);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
