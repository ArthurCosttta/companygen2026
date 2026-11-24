import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createWorkspaceApi } from '../../server/workspace.mjs';

function makeJwt(sub, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ sub, email, exp })).toString('base64url');
  return `${header}.${payload}.sig`;
}

const TEST_UID = '33333333-3333-4333-8333-333333339999';
const TEST_JWT = makeJwt(TEST_UID, 'lojista-sem-wpp@example.com');

test('Pedidos na vitrine e Test-Alarm geram notificação celular mesmo sem WhatsApp logado + /api/desktop/download por SO', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-mobile-alerts-'));
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';

  const mockFetch = async (url, init) => {
    if (String(url).includes('/auth/v1/user')) {
      const tok = String(init?.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
      const claims = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8'));
      return new Response(JSON.stringify({ id: claims.sub, email: claims.email }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  };

  const api = createWorkspaceApi({ root, fetch: mockFetch });
  const server = http.createServer((req, res) => {
    void api.handler(req, res, () => {
      res.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    // WhatsApp está explicitamente desconectado (whatsapp.connected: false)
    const getProf = await (
      await fetch(`${origin}/api/profile`, { headers: { Authorization: `Bearer ${TEST_JWT}` } })
    ).json();
    const saveProf = await fetch(`${origin}/api/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_JWT}`,
      },
      body: JSON.stringify({
        revision: getProf.revision,
        profile: {
          ...getProf.profile,
          business: { name: 'FarmaSub Alertas', segment: 'Farmácia & Drogaria' },
          whatsapp: { connected: false, phoneE164: '' },
          catalog: {
            products: [
              { id: 'dip-1', sku: 'DIP-500', name: 'Dipirona 500mg', category: 'Analgésicos', priceCents: 690, stock: 10, stockQty: 10, active: true, approvedAsset: true },
            ],
          },
        },
      }),
    });
    assert.equal(saveProf.status, 200);

    // 1. Cliente fecha pedido na Vitrine SEM WhatsApp logado -> deve gerar notificação imediata!
    const orderRes = await fetch(`${origin}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_JWT}`,
      },
      body: JSON.stringify({
        customerName: 'Ana Maria',
        paymentMethod: 'pix',
        items: [{ sku: 'DIP-500', name: 'Dipirona 500mg', qty: 2 }],
      }),
    });
    assert.equal(orderRes.status, 201);

    const eventsRes = await fetch(`${origin}/api/whatsapp/events`, {
      headers: { Authorization: `Bearer ${TEST_JWT}` },
    });
    assert.equal(eventsRes.status, 200);
    const eventsJson = await eventsRes.json();
    assert.equal(eventsJson.botConnected, false);
    assert.ok(eventsJson.notifications.length >= 1);
    assert.equal(eventsJson.notifications[0].level, 'PURCHASE_MESSAGE_ARRIVED');
    assert.match(eventsJson.notifications[0].message, /Ana Maria/);

    // 2. Endpoint de teste de alarme no celular funciona sem WhatsApp conectado
    const alarmRes = await fetch(`${origin}/api/whatsapp/events/test-alarm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_JWT}`,
      },
      body: JSON.stringify({ level: 'HUMAN_ESCALATION' }),
    });
    assert.equal(alarmRes.status, 201);
    const alarmJson = await alarmRes.json();
    assert.equal(alarmJson.ok, true);
    assert.equal(alarmJson.notification.level, 'HUMAN_ESCALATION');

    // 3. Download por SO na Landing Page retorna pacotes específicos
    const macRes = await fetch(`${origin}/api/desktop/download?os=mac`);
    assert.equal(macRes.status, 200);
    assert.match(macRes.headers.get('content-disposition') || '', /CompanyGen-macOS-App\.zip/);
    assert.ok((await macRes.arrayBuffer()).byteLength > 100);

    const linuxRes = await fetch(`${origin}/api/desktop/download?os=linux`);
    assert.equal(linuxRes.status, 200);
    assert.match(linuxRes.headers.get('content-disposition') || '', /CompanyGen-Linux-App\.zip/);

    const win32Head = await fetch(`${origin}/api/desktop/download?os=win32`, { method: 'HEAD', redirect: 'manual' });
    assert.ok([200, 302].includes(win32Head.status));
  } finally {
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    await api.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
