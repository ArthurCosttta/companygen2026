import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  normalizeSearchText,
  levenshteinDistance,
  fuzzyMatch,
  matchesProductQuery,
} from '../src/utils/fuzzySearch.ts';
import { validateImageMagicBytes } from '../server/media-sanitize.mjs';
import { createWorkspaceApi } from '../server/workspace.mjs';
import { classifyAndRespondWithLocalAi } from '../server/ai-sofia-local.mjs';

const TEST_USER = '66666666-6666-4666-8666-666666666666';
const EXPIRES = Math.floor(Date.now() / 1000) + 3600;
const TEST_JWT =
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ sub: TEST_USER, exp: EXPIRES })).toString('base64url') +
  '.sig';

async function startTempServer(root) {
  const fetchProvider = async (url, options = {}) => {
    if (String(url).includes('/auth/v1/user')) {
      const auth = String(options.headers?.Authorization || '');
      return Response.json(
        auth.includes(TEST_JWT) ? { id: TEST_USER } : { error: 'invalid' },
        { status: auth.includes(TEST_JWT) ? 200 : 401 },
      );
    }
    if (String(url).includes('/rest/v1/')) {
      return Response.json({ code: 'PGRST205' }, { status: 404 });
    }
    return fetch(url, options);
  };
  const api = createWorkspaceApi({ root, fetch: fetchProvider });
  const server = http.createServer((req, res) => api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    async request(route, method = 'GET', body) {
      return fetch(`${origin}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${TEST_JWT}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    async close() {
      await api.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test('BUG-F03-12: fuzzySearch tolera acentos, typos Levenshtein <= 1 e encontra variações', () => {
  assert.equal(normalizeSearchText('Sérum Ácido Hialurônico'), 'serum acido hialuronico');
  assert.equal(levenshteinDistance('camizeta', 'camiseta'), 1);

  assert.equal(fuzzyMatch('serum', 'Sérum Facial Vitamina C'), true);
  assert.equal(fuzzyMatch('camizeta', 'Camiseta Tech Minimal'), true);
  assert.equal(fuzzyMatch('hidratnt', 'Hidratante Lavanda'), false);
  assert.equal(fuzzyMatch('hidrant', 'Creme Hidrante'), true);

  const sampleProduct = {
    name: 'Sérum Facial Vitamina C',
    sku: 'SER-VITC-30',
    category: 'Skincare',
    variation: '30ml',
    description: 'Antioxidante facial diário',
  };
  assert.equal(matchesProductQuery(sampleProduct, 'serum 30ml'), true);
  assert.equal(matchesProductQuery(sampleProduct, 'skincari'), true);
  assert.equal(matchesProductQuery(sampleProduct, 'bicicleta'), false);
});

test('BUG-F03-03: validateImageMagicBytes aceita PNG/JPG/WebP reais e rejeita SVG/HTML disfarçados', () => {
  // Real PNG header
  const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.equal(validateImageMagicBytes(realPng).ok, true);
  assert.equal(validateImageMagicBytes(realPng).mimeType, 'image/png');

  // Real JPEG header
  const realJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(validateImageMagicBytes(realJpg).ok, true);
  assert.equal(validateImageMagicBytes(realJpg).mimeType, 'image/jpeg');

  // Real WebP header
  const realWebp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1');
  assert.equal(validateImageMagicBytes(realWebp).ok, true);
  assert.equal(validateImageMagicBytes(realWebp).mimeType, 'image/webp');

  // Fake PNG containing SVG XSS
  const evilSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const resSvg = validateImageMagicBytes(evilSvg);
  assert.equal(resSvg.ok, false);
  assert.equal(resSvg.status, 415);

  // Disguised Data URI image/svg+xml
  const evilDataUri = `data:image/svg+xml;base64,${evilSvg.toString('base64')}`;
  const resDataUri = validateImageMagicBytes(evilDataUri);
  assert.equal(resDataUri.ok, false);
  assert.equal(resDataUri.status, 415);

  // Fake HTML disguised as binary
  const evilHtml = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>');
  assert.equal(validateImageMagicBytes(evilHtml).status, 415);
});

test('BUG-F03-01, BUG-F03-02, BUG-F03-10 & Sofia: estoque concorrente atômico, cupons server-side, frete e QR sanitizado', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-fila03-'));
  const app = await startTempServer(root);

  try {
    const profilePayload = {
      schemaVersion: 1,
      business: { name: 'Botânica Lume', segment: 'Skincare' },
      whatsapp: { connected: true, phoneE164: '5511988887777', displayPhone: '+55 11 98888-7777' },
      payment: { pixDiscountPercent: 5, acceptedMethods: ['pix', 'credit_card'] },
      shipping: { fixedFeeCents: 1500, freeShippingThresholdCents: 15000, pickupAvailable: true },
      coupons: [
        { code: 'VERAO10', discountPercent: 10, active: true },
        { code: 'PAUSADO50', discountPercent: 50, active: false },
      ],
      catalog: {
        products: [
          {
            id: 'prod-last-unit',
            sku: 'SER-01',
            name: 'Sérum Vitamina C',
            category: 'Skincare',
            priceCents: 10000,
            stock: 1,
            lowStockThreshold: 3,
            active: true,
            approvedAsset: true,
          },
          {
            id: 'prod-rich',
            sku: 'KIT-02',
            name: 'Kit Glow Completo',
            category: 'Kits',
            priceCents: 20000,
            stock: 5,
            active: true,
            approvedAsset: true,
          },
        ],
      },
    };

    const putRes = await app.request('/api/profile', 'PUT', { revision: 0, profile: profilePayload });
    assert.equal(putRes.status, 200);
    const { profile: savedProfile } = await putRes.json();

    // 1. BUG-F03-01: Dois pedidos simultâneos para o ÚNICO item em estoque (stock=1)
    const [orderA, orderB] = await Promise.all([
      app.request('/api/orders', 'POST', {
        customerName: 'Cliente A',
        paymentMethod: 'pix',
        couponCode: 'VERAO10',
        shippingCents: 0, // tentativa de fraude tentando zerar frete abaixo de R$ 150!
        deliveryType: 'entrega',
        items: [{ sku: 'SER-01', name: 'Sérum Vitamina C', qty: 1, unitPriceCents: 100 }],
      }),
      app.request('/api/orders', 'POST', {
        customerName: 'Cliente B',
        paymentMethod: 'pix',
        deliveryType: 'entrega',
        items: [{ sku: 'SER-01', name: 'Sérum Vitamina C', qty: 1 }],
      }),
    ]);

    const statuses = [orderA.status, orderB.status].sort();
    assert.deepEqual(statuses, [201, 422]);

    const winRes = orderA.status === 201 ? orderA : orderB;
    const winJson = await winRes.json();
    // Verifica cálculo estrito no servidor (se Cliente A venceu: 10000 - 10% = 9000 - 5% Pix = 8550 + 1500 frete = 10050)
    if (winJson.order.customer_name === 'Cliente A') {
      assert.equal(winJson.order.shipping_cents, 1500);
      assert.equal(winJson.order.discount_cents, 1450);
      assert.equal(winJson.order.total_cents, 10050);
    }

    // Estoque virou 0 e item foi pausado automaticamente
    const profAfter = await (await app.request('/api/profile', 'GET')).json();
    const serumAfter = profAfter.profile.catalog.products.find((p) => p.sku === 'SER-01');
    assert.equal(serumAfter.stock, 0);
    assert.equal(serumAfter.active, false);
    assert.equal(serumAfter.autoPausedOutOfStock, true);

    // 2. BUG-F03-02: Cupom pausado deve retornar 422; frete grátis >= R$ 150 deve zerar frete
    const pausedCouponRes = await app.request('/api/orders', 'POST', {
      customerName: 'Fraude Cupom',
      paymentMethod: 'credit_card',
      couponCode: 'PAUSADO50',
      deliveryType: 'entrega',
      items: [{ sku: 'KIT-02', qty: 1 }],
    });
    assert.equal(pausedCouponRes.status, 422);

    const freeShipRes = await app.request('/api/orders', 'POST', {
      customerName: 'Cliente Frete Grátis',
      paymentMethod: 'credit_card',
      deliveryType: 'entrega',
      items: [{ sku: 'KIT-02', qty: 1 }], // 20000 >= 15000 -> frete 0
    });
    assert.equal(freeShipRes.status, 201);
    const freeShipJson = await freeShipRes.json();
    assert.equal(freeShipJson.order.shipping_cents, 0);
    assert.equal(freeShipJson.order.total_cents, 20000);

    // 3. BUG-F03-10: QR Code GET sanitiza label XSS e parametriza query
    const qrRes = await app.request(
      '/api/store/qr-code?target=custom&label=Mesa-04<script>alert(1)</script>',
      'GET',
    );
    assert.equal(qrRes.status, 200);
    const qrJson = await qrRes.json();
    assert.ok(qrJson.pngDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(!qrJson.targetUrl.includes('<script>'));
    assert.match(qrJson.label, /^Mesa-04/);

    // 4. Sofia reflete regras de frete e cupom ativo sem escalar incorretamente
    const sofiaCoupon = await classifyAndRespondWithLocalAi({
      messageText: 'Oi, vocês tem algum cupom disponível?',
      customerName: 'Laura',
      profile: savedProfile,
      diskSkus: savedProfile.catalog.products,
      skipOllama: true,
    });
    assert.equal(sofiaCoupon.classification.requiresHuman, false);
    assert.match(sofiaCoupon.replyText, /VERAO10/);

    const sofiaShipping = await classifyAndRespondWithLocalAi({
      messageText: 'Qual o valor da entrega e frete grátis?',
      customerName: 'Laura',
      profile: savedProfile,
      diskSkus: savedProfile.catalog.products,
      skipOllama: true,
    });
    assert.match(sofiaShipping.replyText, /15,00/);
    assert.match(sofiaShipping.replyText, /150,00/);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('BUG-F03-04: parseBRLInputToCents aceita formatos BR/US válidos e rejeita vírgulas múltiplas, negativos e lixo', async () => {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@/schemas/profile.schema') {
        return nextResolve(pathToFileURL(path.resolve('src/schemas/profile.schema.ts')).href, context);
      }
      return nextResolve(specifier, context);
    },
  });
  const { parseBRLInputToCents } = await import('../src/components/views/storefront/storefront-utils.ts');

  assert.equal(parseBRLInputToCents('129,90'), 12990);
  assert.equal(parseBRLInputToCents('R$ 1.299,90'), 129990);
  assert.equal(parseBRLInputToCents('49.50'), 4950);
  assert.equal(parseBRLInputToCents('100'), 10000);
  assert.equal(parseBRLInputToCents('12,34,56'), 0);
  assert.equal(parseBRLInputToCents('12..50'), 0);
  assert.equal(parseBRLInputToCents('-50'), 0);
  assert.equal(parseBRLInputToCents('abc'), 0);
  assert.equal(parseBRLInputToCents('1e5'), 0);
  assert.equal(parseBRLInputToCents('12,345'), 0);
});
