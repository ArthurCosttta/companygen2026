import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';

import { createWorkspaceApi } from '../server/workspace.mjs';
import {
  applyKiwifyReversalLocal,
  debitCredits,
  ensureSufficientCredits,
} from '../server/access-and-checkout.mjs';
import { checkUserAiTierLimit, clearAiBudgetCache } from '../server/middleware/ai-budget.mjs';
import { generateAndDispatchDailyAdminDigest } from '../server/admin-digest.mjs';
import { recordSystemIncident } from '../server/admin-console.mjs';
import { classifyKiwifyError } from '../supabase/functions/kiwify-webhook/core.mjs';
import { runBackup321 } from '../scripts/backup-321.mjs';

function makeFakeJwt(sub, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      user_metadata: { full_name: email.split('@')[0] },
    }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeAtomicJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function startTestServer(api) {
  const srv = http.createServer((req, res) => {
    void api.handler(req, res, () => {
      res.writeHead(404).end();
    });
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address();
  return { server: srv, baseUrl: `http://127.0.0.1:${addr.port}` };
}

test('FILA 07 Bloco 1-4: Auditoria, PII Scrub, DLQ Replay, Chargeback Lock, ReadOnly 403, Fleet Canary, Flags, QR Batch ZIP & Backup 3-2-1', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  const prevAdminEmails = process.env.CG_ADMIN_EMAILS;
  process.env.CG_PERSISTENCE = 'local';
  delete process.env.CG_ADMIN_EMAILS;
  clearAiBudgetCache();

  const adminId = 'aaaaaaaa-1111-4111-8111-111111111111';
  const clientId = 'bbbbbbbb-2222-4222-8222-222222222222';
  const adminToken = makeFakeJwt(adminId, 'arthurpolarbuy@gmail.com');
  const clientToken = makeFakeJwt(clientId, 'lojista-f07@teste.com');
  const tokenMap = new Map([
    [adminToken, { id: adminId, email: 'arthurpolarbuy@gmail.com' }],
    [clientToken, { id: clientId, email: 'lojista-f07@teste.com' }],
  ]);

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-f07-'));
  const api = createWorkspaceApi({
    root: tmpRoot,
    fetch: async (url, options = {}) => {
      if (String(url).includes('/auth/v1/user')) {
        const authHeader = new Headers(options.headers || {}).get('authorization') || '';
        const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
        const hit = tokenMap.get(bearer);
        if (!hit) return new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
        return new Response(JSON.stringify(hit), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const { server, baseUrl } = await startTestServer(api);

  try {
    // Seed initial client workspace
    await writeAtomicJson(path.join(tmpRoot, clientId, 'profile.json'), {
      revision: 1,
      data: {
        business: { name: 'Ateliê Horizonte' },
        publishedStore: { published: true, publicSlug: 'atelie-horizonte' },
      },
    });
    await writeAtomicJson(path.join(tmpRoot, clientId, 'credits_ledger.json'), [
      { id: 'init', delta: 50, balance_after: 50, operation_type: 'welcome_invite', created_at: new Date().toISOString() },
    ]);

    // 1. Audited Credits requires reasonCode & note >= 5 + idempotencyKey dedup
    const badCreditRes = await fetch(`${baseUrl}/api/admin/users/credits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: clientId, mode: 'add', amount: 100, note: 'abc' }),
    });
    assert.equal(badCreditRes.status, 400);

    const idemKey = 'idem-f07-1';
    const goodCreditRes1 = await fetch(`${baseUrl}/api/admin/users/credits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: clientId,
        mode: 'add',
        amount: 100,
        reasonCode: 'support_comp',
        note: 'Bônus compensatório por ajuste de fila',
        idempotencyKey: idemKey,
      }),
    });
    const goodJson1 = await goodCreditRes1.json();
    assert.equal(goodCreditRes1.status, 200);
    assert.equal(goodJson1.newBalance, 150);

    const goodCreditRes2 = await fetch(`${baseUrl}/api/admin/users/credits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: clientId,
        mode: 'add',
        amount: 100,
        reasonCode: 'support_comp',
        note: 'Bônus compensatório por ajuste de fila',
        idempotencyKey: idemKey,
      }),
    });
    const goodJson2 = await goodCreditRes2.json();
    assert.equal(goodJson2.duplicate, true);
    assert.equal(goodJson2.newBalance, 150);

    // 2. PII Scrubber in recordSystemIncident & Support Ticket + Magic Bytes validation
    await recordSystemIncident({
      root: tmpRoot,
      type: 'TEST_PII',
      endpoint: '/api/test',
      detail: 'Falha CPF 123.456.789-01 Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc email joao@loja.com',
      readJsonFile: readJsonSafe,
      atomicWriteJson: writeAtomicJson,
    });
    const regSaved = await readJsonSafe(path.join(tmpRoot, '_admin_registry.json'), {});
    const incDetail = regSaved.incidents.at(-1).detail;
    assert.equal(incDetail.includes('123.456.789-01'), false);
    assert.equal(incDetail.includes('eyJhbGciOiJIUzI1NiJ9'), false);
    assert.equal(incDetail.includes('joao@loja.com'), false);

    // Forged PNG attachment (HTML bytes disguised as image/png)
    const forgedB64 = Buffer.from('<html><script>alert(1)</script></html>', 'utf8').toString('base64');
    const forgedTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'vitrine',
        subject: 'Erro com token',
        description: 'CPF 111.222.333-44 bloqueado',
        attachmentDataUrl: `data:image/png;base64,${forgedB64}`,
      }),
    });
    assert.equal(forgedTicketRes.status, 400);

    // Valid ticket scrubs PII
    const validTicketRes = await fetch(`${baseUrl}/api/support/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'vitrine',
        subject: 'Ajuda com CPF 111.222.333-44',
        description: 'Meu e-mail cliente@teste.com e telefone (11) 98765-4321 precisam de verificação.',
      }),
    });
    const ticketJson = await validTicketRes.json();
    assert.equal(validTicketRes.status, 200);
    assert.equal(ticketJson.ticket.subject.includes('111.222.333-44'), false);
    assert.equal(ticketJson.ticket.description.includes('cliente@teste.com'), false);

    // 3. Kiwify DLQ Classification, Replay Idempotency, Chargeback Floor >= 0 & NEGATIVE_BALANCE_REVIEW Lock
    assert.equal(classifyKiwifyError('Invalid HMAC signature', 401), 'AUTH');
    assert.equal(classifyKiwifyError('unknown_plan', 400), 'PERMANENT');
    assert.equal(classifyKiwifyError('ETIMEDOUT upstream', 503), 'TRANSIENT');

    await writeAtomicJson(path.join(tmpRoot, '_kiwify_events.json'), [
      {
        id: 'kw-ord-1',
        order_id: 'KW-ORD-777',
        webhook_event_type: 'order_approved',
        user_id: clientId,
        customer_email: 'lojista-f07@teste.com',
        credits: 200,
        price_cents: 1990,
        processing_status: 'failed',
        error_message: 'timeout',
        classification: 'TRANSIENT',
        created_at: new Date().toISOString(),
      },
    ]);

    const rep1 = await fetch(`${baseUrl}/api/admin/kiwify/replay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'KW-ORD-777', eventType: 'order_approved' }),
    });
    const rep1Json = await rep1.json();
    assert.equal(rep1Json.duplicate, false);
    assert.equal(rep1Json.balance, 350);

    const rep2 = await fetch(`${baseUrl}/api/admin/kiwify/replay`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'KW-ORD-777', eventType: 'order_approved' }),
    });
    const rep2Json = await rep2.json();
    assert.equal(rep2Json.duplicate, true);
    assert.equal(rep2Json.balance, 350);

    // Chargeback larger than balance (500 > 350) -> clamps at 0 + NEGATIVE_BALANCE_REVIEW lock
    const cbRes = await applyKiwifyReversalLocal({
      userId: clientId,
      directory: path.join(tmpRoot, clientId),
      creditsToReverse: 500,
      orderId: 'KW-ORD-777',
      eventType: 'chargeback',
      readJsonFile: readJsonSafe,
      atomicWriteJson: writeAtomicJson,
    });
    assert.equal(cbRes.balance, 0);
    assert.equal(cbRes.shortfallCredits, 150);
    assert.equal(cbRes.reviewFlag, 'NEGATIVE_BALANCE_REVIEW');

    // Preflight and debit MUST block even 0-cost/AI ops while NEGATIVE_BALANCE_REVIEW is active
    const blockedPreflight = await ensureSufficientCredits({
      user: { id: clientId },
      directory: path.join(tmpRoot, clientId),
      action: 'generate_image_schnell',
      readJsonFile: readJsonSafe,
    });
    assert.equal(blockedPreflight.ok, false);
    assert.equal(blockedPreflight.error, 'NEGATIVE_BALANCE_REVIEW');

    const blockedDebit = await debitCredits({
      user: { id: clientId },
      directory: path.join(tmpRoot, clientId),
      action: 'glm_whatsapp',
      readJsonFile: readJsonSafe,
      atomicWriteJson: writeAtomicJson,
    });
    assert.equal(blockedDebit.ok, false);
    assert.equal(blockedDebit.status, 403);

    // Clear negative lock + set tier via /api/admin/users/limits
    const unlockRes = await fetch(`${baseUrl}/api/admin/users/limits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: clientId,
        tier: 'restricted',
        note: 'Quitou chargeback manualmente',
        clearNegativeLock: true,
      }),
    });
    assert.equal(unlockRes.status, 200);

    // Tier rate limit verification (restricted = 5 req/min)
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkUserAiTierLimit(clientId, 'restricted', 100000).allowed, true);
    }
    assert.equal(checkUserAiTierLimit(clientId, 'restricted', 100000).allowed, false);

    // 4. Support Snapshot (Admin OK / Client 403) + Read-Only 403 Blocker
    const clientSnapAttempt = await fetch(`${baseUrl}/api/admin/users/${clientId}/support-snapshot`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(clientSnapAttempt.status, 403);

    const adminSnap = await fetch(`${baseUrl}/api/admin/users/${clientId}/support-snapshot`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminSnapJson = await adminSnap.json();
    assert.equal(adminSnap.status, 200);
    assert.equal(adminSnapJson.readOnly, true);

    const roWriteAttempt = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Support-Readonly': '1',
      },
      body: JSON.stringify({ customerName: 'Teste Bloqueio' }),
    });
    assert.equal(roWriteAttempt.status, 403);
    const roJson = await roWriteAttempt.json();
    assert.equal(roJson.error, 'SUPPORT_READONLY_BLOCKED');

    // 5. Multi-account Anti-Abuse Detection + Desktop Fleet + WHATSAPP_DOM_CANARY + Feature Flags
    await writeAtomicJson(path.join(tmpRoot, '_access_redemption_events.json'), [
      { userId: clientId, ipHash: 'same-ip-hash', codeMasked: 'AI10-****-AAAA', at: new Date().toISOString() },
      { userId: 'cccccccc-3333-4333-8333-333333333333', ipHash: 'same-ip-hash', codeMasked: 'AI10-****-BBBB', at: new Date().toISOString() },
      { userId: 'dddddddd-4444-4444-8444-444444444444', ipHash: 'same-ip-hash', codeMasked: 'AI10-****-CCCC', at: new Date().toISOString() },
    ]);

    const otherToken = makeFakeJwt('cccccccc-3333-4333-8333-333333333333', 'outra@teste.com');
    tokenMap.set(otherToken, { id: 'cccccccc-3333-4333-8333-333333333333', email: 'outra@teste.com' });

    await fetch(`${baseUrl}/api/admin/desktop-policy`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ minSupportedVersion: '2.0.0', latestVersion: '2.1.0', forceUpdate: false }),
    });

    const hb1 = await fetch(`${baseUrl}/api/desktop/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: 'WIN-PC-01', appVersion: '1.0.0', osPlatform: 'win32', selectorHealth: 'degraded' }),
    });
    const hb1Json = await hb1.json();
    assert.equal(hb1Json.outdated, true);

    await fetch(`${baseUrl}/api/desktop/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: 'WIN-PC-02', appVersion: '2.1.0', osPlatform: 'win32', selectorHealth: 'degraded' }),
    });

    await fetch(`${baseUrl}/api/admin/feature-flags`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'nova_ai_beta', globalMode: 'beta_list', betaUserIds: [clientId] }),
    });

    const clientFlagsRes = await fetch(`${baseUrl}/api/features`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const otherFlagsRes = await fetch(`${baseUrl}/api/features`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal((await clientFlagsRes.json()).flags.nova_ai_beta, true);
    assert.equal((await otherFlagsRes.json()).flags.nova_ai_beta, false);

    // 6. Auto-Healing QR 301 + Open-Redirect Guard + QR Batch A4/ZIP
    await writeAtomicJson(path.join(tmpRoot, '_qr_campaigns.json'), [
      {
        id: 'qr-heal-1',
        slug: 'promo-nova',
        legacySlugs: ['promo-antiga'],
        target_url: 'https://companygen.store/?loja=promo',
        active: true,
        scans_count: 0,
      },
      {
        id: 'qr-evil-1',
        slug: 'evil-redirect',
        target_url: 'https://evil-phishing.example.org/steal',
        active: true,
        scans_count: 0,
      },
    ]);

    const healRes = await fetch(`${baseUrl}/q/promo-antiga`, { redirect: 'manual' });
    assert.equal(healRes.status, 301);
    assert.equal(healRes.headers.get('location'), 'https://companygen.store/?loja=promo');

    const evilRes = await fetch(`${baseUrl}/q/evil-redirect`, { redirect: 'manual' });
    assert.equal(evilRes.status, 404);

    const batchRes = await fetch(`${baseUrl}/api/admin/qr-batches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchName: 'Evento SP', count: 4, credits: 150 }),
    });
    const batchJson = await batchRes.json();
    assert.equal(batchRes.status, 200);
    assert.equal(batchJson.count, 4);
    const zipBuf = Buffer.from(batchJson.zipBase64, 'base64');
    // PK magic bytes check
    assert.equal(zipBuf[0], 0x50);
    assert.equal(zipBuf[1], 0x4b);
    const parsedZip = await JSZip.loadAsync(zipBuf);
    const a4File = await parsedZip.file('cartelas-a4.html')?.async('string');
    const csvFile = await parsedZip.file('manifest.csv')?.async('string');
    assert.ok(a4File?.includes('break-inside: avoid'));
    assert.ok(a4File?.includes('#ffffff'));
    assert.ok(csvFile?.includes('AI10-'));
    const pngFiles = Object.keys(parsedZip.files).filter((n) => n.endsWith('.png'));
    assert.equal(pngFiles.length, 4);
    const firstPng = await parsedZip.file(pngFiles[0]).async('nodebuffer');
    assert.equal(firstPng[0], 0x89);
    assert.equal(firstPng[1], 0x50);

    // 7. Overview consolidates Funnel + Abuse + Canary + Audit
    const ovRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ovJson = await ovRes.json();
    assert.equal(ovJson.canaryDomAlert.active, true);
    assert.equal(ovJson.canaryDomAlert.code, 'WHATSAPP_DOM_CANARY');
    const clientRow = ovJson.users.find((u) => u.id === clientId);
    assert.equal(clientRow.riskAbuse, true);
    assert.equal(clientRow.funnelStage, 'publicado');

    // 8. Daily Digest 08h BRT Idempotency & 3-2-1 Encrypted Backup Roundtrip
    const d1 = await generateAndDispatchDailyAdminDigest({
      root: tmpRoot,
      overviewData: ovJson,
      readJsonFile: readJsonSafe,
      atomicWriteJson: writeAtomicJson,
      now: new Date('2026-11-19T11:00:00Z'),
    });
    const d2 = await generateAndDispatchDailyAdminDigest({
      root: tmpRoot,
      overviewData: ovJson,
      readJsonFile: readJsonSafe,
      atomicWriteJson: writeAtomicJson,
      now: new Date('2026-11-19T14:00:00Z'),
    });
    assert.equal(d1.duplicate, false);
    assert.equal(d2.duplicate, true);

    const bkpOut = path.join(tmpRoot, '_backups');
    const bkpRes = await runBackup321({ sourceRoot: tmpRoot, outputDir: bkpOut });
    assert.equal(bkpRes.roundtripVerified, true);
    assert.ok(bkpRes.fileCount >= 3);
  } finally {
    await api.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    if (prevPersistence !== undefined) process.env.CG_PERSISTENCE = prevPersistence;
    else delete process.env.CG_PERSISTENCE;
    if (prevAdminEmails !== undefined) process.env.CG_ADMIN_EMAILS = prevAdminEmails;
    else delete process.env.CG_ADMIN_EMAILS;
    clearAiBudgetCache();
  }
});
