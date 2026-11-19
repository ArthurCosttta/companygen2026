import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {
  SHOWCASE_USER_IDS,
  checkAndRecordOperationalAlert,
  debitCredits,
  issueLocalShowcaseToken,
} from '../server/access-and-checkout.mjs';
import { scrubObject, scrubPii } from '../server/pii-scrubber.mjs';
import { buildDashboardProjection } from '../server/sync-engine.mjs';
import { createWorkspaceApi } from '../server/workspace.mjs';

const SHOWCASE_USER_ID = SHOWCASE_USER_IDS['AI10-FARM-LUME'];

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

test('FILA 06 (C71/C73/BUG-F06-03): buildDashboardProjection e /api/dashboard excluem simulações e cancelados do CRM e avgTicketCents', async () => {
  const now = Date.now();
  const orders = [
    {
      id: 'ord-1',
      order_ref: 'CG-1001',
      customer_jid: '5511999990001@s.whatsapp.net',
      customer_name: 'Maria Clara',
      items: [{ sku: 'SER-01', name: 'Sérum C+E', quantity: 2, unitPriceCents: 10000, lineTotalCents: 20000 }],
      total_cents: 20000,
      status: 'confirmado',
      source_channel: 'whatsapp_purchase_message',
      created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'ord-2',
      order_ref: 'CG-1002',
      customer_jid: '5511999990001@s.whatsapp.net',
      customer_name: 'Maria Clara',
      items: [{ sku: 'KIT-02', name: 'Kit Spa', quantity: 1, unitPriceCents: 40000, lineTotalCents: 40000 }],
      total_cents: 40000,
      status: 'concluido',
      source_channel: 'vitrine_storefront',
      created_at: new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'ord-sim',
      order_ref: 'CG-SIM9',
      customer_jid: '5511999990002',
      customer_name: 'Pedido Simulação',
      items: [{ sku: 'SER-01', name: 'Sérum C+E', quantity: 10, unitPriceCents: 10000, lineTotalCents: 100000 }],
      total_cents: 100000,
      status: 'confirmado',
      isSimulation: true,
      created_at: new Date(now - 60_000).toISOString(),
    },
    {
      id: 'ord-can',
      order_ref: 'CG-CAN1',
      customer_jid: '5511999990003',
      customer_name: 'Cancelado Silva',
      items: [{ sku: 'SER-01', name: 'Sérum C+E', quantity: 5, unitPriceCents: 10000, lineTotalCents: 50000 }],
      total_cents: 50000,
      status: 'cancelado',
      created_at: new Date(now - 60_000).toISOString(),
    },
  ];

  const dash7d = buildDashboardProjection(
    { business: { name: 'Loja Lume' }, catalog: { products: [] } },
    4,
    orders,
    { visits_total: 40, visits_by_day: {} },
    {},
    { period: '7d' },
  );
  // Em 7d: apenas CG-1001 (20000) eh real e nao cancelado
  assert.equal(dash7d.salesCents, 20000);
  assert.equal(dash7d.ordersCount, 1);
  assert.equal(dash7d.crmSummary.totalRevenueCents, 20000);
  assert.equal(dash7d.crmSummary.avgTicketCents, 20000);
  assert.equal(dash7d.crmSummary.byChannel.whatsapp, 1);

  const dash30d = buildDashboardProjection(
    { business: { name: 'Loja Lume' }, catalog: { products: [] } },
    4,
    orders,
    { visits_total: 40, visits_by_day: {} },
    {},
    { period: '30d' },
  );
  // Em 30d: CG-1001 (20000) + CG-1002 (40000) = 60000 / 2 pedidos => ticket 30000 (exclui simulação 100000 e cancelado 50000!)
  assert.equal(dash30d.salesCents, 60000);
  assert.equal(dash30d.ordersCount, 2);
  assert.equal(dash30d.crmSummary.avgTicketCents, 30000);
  assert.equal(dash30d.crmSummary.byChannel.whatsapp, 1);
  assert.equal(dash30d.crmSummary.byChannel.storefront, 1);
  assert.equal(dash30d.crmSummary.repeatCustomers[0].orderCount, 2);
  assert.equal(dash30d.crmSummary.repeatCustomers[0].totalCents, 60000);
});

test('FILA 06 (C82/C83/BUG-F06-01/02): PII scrubber limpa segredos e Backup .zip remove JWT + bloqueia SHA-256 adulterado com 400', async () => {
  const scrubbedText = scrubPii(
    'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig123 user=arthur@loja.com tel=+55 11 98888-7777 key=sb_secret_abcdef123456',
  );
  assert.doesNotMatch(scrubbedText, /eyJhbGci/);
  assert.doesNotMatch(scrubbedText, /sb_secret_abcdef/);
  assert.doesNotMatch(scrubbedText, /arthur@loja\.com/);
  assert.doesNotMatch(scrubbedText, /98888-7777/);

  const scrubbedObj = scrubObject({
    access_token: 'eyJ.secret.jwt',
    refresh_token: 'abc',
    storeName: 'Loja Segura',
  });
  assert.equal('access_token' in scrubbedObj, false);
  assert.equal('refresh_token' in scrubbedObj, false);
  assert.equal(scrubbedObj.storeName, 'Loja Segura');

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cg-backup-zip-'));
  const userDir = path.join(tmpRoot, SHOWCASE_USER_ID);
  await mkdir(userDir, { recursive: true });
  await atomicWriteJson(path.join(userDir, 'profile.json'), {
    revision: 3,
    data: {
      schemaVersion: 1,
      business: { name: 'Botânica Lume Backup', segment: 'Skincare' },
      whatsapp: { connected: false, phoneE164: '' },
      payment: { pixKey: 'pix@lume.local', pixDiscountPercent: 5, acceptedMethods: ['pix'] },
      catalog: {
        products: [
          { id: 'p1', sku: 'SER-1', name: 'Sérum C', category: 'Rosto', priceCents: 12990, active: true, stock: 5 },
        ],
      },
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXQiOnRydWV9.secret',
    },
  });

  const api = createWorkspaceApi({ root: tmpRoot });
  const server = http.createServer((req, res) => api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = issueLocalShowcaseToken(SHOWCASE_USER_ID);

  try {
    // 1. Exporta backup .zip e valida ausencia de JWT + magic bytes PK
    const exportRes = await fetch(`${origin}/api/workspace/backup-export?format=json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(exportRes.status, 200);
    const exported = await exportRes.json();
    assert.equal(exported.ok, true);
    assert.match(exported.sha256, /^[a-f0-9]{64}$/);
    const zipBuf = Buffer.from(exported.zipBase64, 'base64');
    assert.equal(zipBuf[0], 0x50); // P
    assert.equal(zipBuf[1], 0x4b); // K

    const parsedZip = await JSZip.loadAsync(zipBuf);
    const payloadStr = await parsedZip.file('payload.json').async('string');
    assert.doesNotMatch(payloadStr, /access_token/);
    assert.doesNotMatch(payloadStr, /eyJhbGciOiJIUzI1NiJ9/);

    // 2. Corrompe payload mantendo manifest.sha256 antigo => HTTP 400
    const tamperedZip = new JSZip();
    tamperedZip.file('manifest.json', await parsedZip.file('manifest.json').async('string'));
    tamperedZip.file('payload.json', payloadStr.replace('Botânica Lume Backup', 'LOJA HACKED'));
    const tamperedBase64 = (await tamperedZip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const badRestoreRes = await fetch(`${origin}/api/workspace/backup-restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ zipBase64: tamperedBase64 }),
    });
    assert.equal(badRestoreRes.status, 400);
    const badJson = await badRestoreRes.json();
    assert.match(badJson.error, /SHA-256|adulterado/i);

    // 3. Garbage non-ZIP magic bytes => HTTP 400
    const nonZipRes = await fetch(`${origin}/api/workspace/backup-restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ zipBase64: Buffer.from('NOT_A_ZIP_HEADER').toString('base64') }),
    });
    assert.equal(nonZipRes.status, 400);

    // 4. Restaura snapshot valido => HTTP 200 e mantem nome intacto
    const okRestoreRes = await fetch(`${origin}/api/workspace/backup-restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ zipBase64: exported.zipBase64 }),
    });
    assert.equal(okRestoreRes.status, 200);
    const okJson = await okRestoreRes.json();
    assert.equal(okJson.ok, true);
    assert.equal(okJson.profile.business.name, 'Botânica Lume Backup');
  } finally {
    await api.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('FILA 06 (C127/BUG-F06-05): Debitar 20 -> 14 -> 12 -> 10 emite exatamente 1 alerta < 15 cr em 24h', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cg-alerts-24h-'));
  try {
    const user = { id: SHOWCASE_USER_ID };
    const ledgerPath = path.join(tmpDir, 'credits_ledger.json');
    await atomicWriteJson(ledgerPath, [
      {
        id: 'seed-20',
        user_id: user.id,
        delta: 20,
        balance_after: 20,
        operation_type: 'welcome_invite',
        created_at: new Date().toISOString(),
      },
    ]);

    // 20 -> 14 (2x whatsapp? usamos edit_block=3 duas vezes => 20->17->14)
    const d1 = await debitCredits({
      user,
      directory: tmpDir,
      action: 'edit_block',
      readJsonFile,
      atomicWriteJson,
    });
    assert.equal(d1.balanceAfter, 17);
    assert.equal(d1.lowCreditAlert, null);

    const d2 = await debitCredits({
      user,
      directory: tmpDir,
      action: 'edit_block',
      readJsonFile,
      atomicWriteJson,
    });
    assert.equal(d2.balanceAfter, 14);
    assert.equal(d2.lowCreditAlert?.dispatched, true);

    // 14 -> 12 (glm_whatsapp = 2) -> suprimido pelo cooldown 24h!
    const d3 = await debitCredits({
      user,
      directory: tmpDir,
      action: 'glm_whatsapp',
      readJsonFile,
      atomicWriteJson,
    });
    assert.equal(d3.balanceAfter, 12);
    assert.equal(d3.lowCreditAlert?.dispatched, false);
    assert.equal(d3.lowCreditAlert?.suppressedByCooldown, true);

    // 12 -> 10 (glm_whatsapp = 2) -> continua suprimido dentro de 24h!
    const d4 = await debitCredits({
      user,
      directory: tmpDir,
      action: 'glm_whatsapp',
      readJsonFile,
      atomicWriteJson,
    });
    assert.equal(d4.balanceAfter, 10);
    assert.equal(d4.lowCreditAlert?.suppressedByCooldown, true);

    const alertsState = await readJsonFile(path.join(tmpDir, 'cg_alert_dispatches.json'), {});
    assert.equal(alertsState.dispatches.length, 1);

    // Após +24h01s, novo alerta é permitido novamente
    const after24h = await checkAndRecordOperationalAlert({
      user,
      directory: tmpDir,
      alertType: 'low_credits_15',
      details: { balanceAfter: 10 },
      readJsonFile,
      atomicWriteJson,
      nowMs: Date.now() + 24 * 60 * 60 * 1000 + 2000,
    });
    assert.equal(after24h.dispatched, true);
    assert.equal(after24h.totalDispatchesForType, 2);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
