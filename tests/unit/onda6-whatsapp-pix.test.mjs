import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import {
  classifyWhatsappMessage,
  normalizeBrWhatsappCore,
  sanitizeCustomerDisplayName,
} from '../../server/ai-sofia-local.mjs';
import { createWorkspaceApi } from '../../server/workspace.mjs';

test('sanitizeCustomerDisplayName blocks Meu numero:!, Minha Claro, Você and phone strings', () => {
  assert.equal(sanitizeCustomerDisplayName('Meu numero:!', false), '');
  assert.equal(sanitizeCustomerDisplayName('~Você', false), '');
  assert.equal(sanitizeCustomerDisplayName('Minha Claro', false), '');
  assert.equal(sanitizeCustomerDisplayName('+55 11 99999-8888', false), '');
  assert.equal(sanitizeCustomerDisplayName('Maria Clara', false), 'Maria');
});

test('normalizeBrWhatsappCore handles BR 9th digit equivalence', () => {
  assert.equal(normalizeBrWhatsappCore('5511988887777'), normalizeBrWhatsappCore('551188887777'));
});

test('classifyWhatsappMessage allows Pix discount inquiry / checkout without false HUMAN_ESCALATION', () => {
  const res = classifyWhatsappMessage({
    messageText: 'Quero comprar no Pix com desconto, pode mandar a chave?',
    products: [{ id: 'p1', sku: 'SKU1', name: 'Camiseta Cotton', priceCents: 7990, active: true, stock: 5 }],
  });
  assert.notEqual(res.intent, 'HUMAN_ESCALATION');
  assert.equal(res.requiresHuman, false);
});

test('WhatsApp WebView audio muted permanently and custom message flows persist on disk', () => {
  const desktopMain = readFileSync(new URL('../../desktop/main.mjs', import.meta.url), 'utf8');
  assert.match(desktopMain, /setAudioMuted\(true\)/);

  const webviewScript = readFileSync(new URL('../../shared/whatsapp-webview-script.mjs', import.meta.url), 'utf8');
  assert.match(webviewScript, /muteAll\(true\)/);

  const flowsPanel = readFileSync(
    new URL('../../src/components/views/whatsapp/WhatsappMessageFlowsPanel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(flowsPanel, /action: 'create'/);

  const sofiaLocal = readFileSync(new URL('../../server/ai-sofia-local.mjs', import.meta.url), 'utf8');
  assert.match(sofiaLocal, /TWELVE_HOURS_MS/);
});

test('Approved whatsapp_flows triggers and self-chat live orders reply without suppression', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-wpp-triggers-'));
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';
  const uid = '55555555-5555-4555-8555-555555555555';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: uid, email: 'test@loja.com', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const token = `${header}.${payload}.sig`;
  const mockFetch = async (url) =>
    String(url).includes('/auth/v1/user')
      ? new Response(JSON.stringify({ id: uid, email: 'test@loja.com' }), { status: 200 })
      : new Response('{}', { status: 404 });

  const api = createWorkspaceApi({ root, fetch: mockFetch });
  const srv = http.createServer((req, res) => void api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  try {
    const g = await (await fetch(`${base}/api/profile`, { headers: { Authorization: `Bearer ${token}` } })).json();
    await fetch(`${base}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        revision: g.revision,
        profile: {
          ...g.profile,
          business: { name: 'NatalRoupas', segment: 'Moda' },
          whatsapp: { connected: true, phoneE164: '5561993742091' },
          onboarding: { fichaCompleted: true, storeGenerated: true },
          catalog: {
            products: [
              { id: 'c1', sku: 'CABO-240W', name: 'Cabo Trançado Kevlar USB-C 240W 2m', category: 'Cabos', priceCents: 8990, stock: 15, active: true, approvedAsset: true },
            ],
          },
        },
      }),
    });

    await fetch(`${base}/api/whatsapp/ai/message-flows/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: 'create',
        flow: {
          id: 'flow-entrega',
          title: 'tempo de entrega',
          sampleCustomerTrigger: 'qual o tempo de entrega',
          steps: [{ role: 'assistant', label: 'Resposta', body: 'Entregamos em até 2 horas na região da {nome_loja}!' }],
        },
      }),
    });

    const trigRes = await (await fetch(`${base}/api/whatsapp/ai/classify-and-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerName: 'Meu numero:',
        customerPhone: '5561993742091',
        isSelfChat: true,
        mode: 'live_whatsapp',
        messageText: 'Oi, qual o tempo de entrega?',
      }),
    })).json();
    assert.equal(trigRes.ok, true);
    assert.equal(trigRes.autoReplySuppressed, false);
    assert.match(trigRes.replyText, /Entregamos em até 2 horas na região da NatalRoupas/);

    const orderRes = await (await fetch(`${base}/api/whatsapp/ai/classify-and-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerName: 'Meu numero:',
        customerPhone: '5561993742091',
        isSelfChat: true,
        mode: 'live_whatsapp',
        messageText: 'Olá, NatalRoupas! Gostaria de fazer um pedido: 1x Cabo Trançado Kevlar USB-C 240W 2m - R$ 89,90',
      }),
    })).json();
    assert.equal(orderRes.ok, true);
    assert.equal(orderRes.autoReplySuppressed, false);
    assert.equal(orderRes.intent, 'PURCHASE_ORDER');
    assert.match(orderRes.replyText, /Cabo Trançado Kevlar USB-C 240W 2m/);
  } finally {
    if (prevPersistence === undefined) delete process.env.CG_PERSISTENCE;
    else process.env.CG_PERSISTENCE = prevPersistence;
    await api.close();
    await new Promise((r) => srv.close(r));
    await rm(root, { recursive: true, force: true });
  }
});
