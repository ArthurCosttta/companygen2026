import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  buildGlmArchitectMessages,
  buildNeutralFallbackV9Document,
  computeCatalogMetricsForPrompt,
  normalizeDisplayTitle,
} from '../server/glm-architect-prompt.mjs';
import { runDesignCritic } from '../server/design-critic.mjs';
import { applyArtDirectionBibleToPrompt } from '../server/runpod-media.mjs';
import { createWorkspaceApi } from '../server/workspace.mjs';
import { renderMoldeHtmlPage } from '../server/molde-html-emitter.mjs';

const TEST_USER = '44444444-4444-4444-8444-444444444444';
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
  const server = http.createServer((req, res) =>
    api.handler(req, res, () => res.writeHead(404).end()),
  );
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

test('C35, C36, C37 & C40: Ordenação Goal-Driven (3 serviços vs 15 produtos), Ticket Copy, ArtDirectionBible e Design Critic sem falso positivo', () => {
  assert.equal(normalizeDisplayTitle('  ---SÉRUM VITAMINA C PURA--- '), 'Sérum Vitamina C Pura');

  const servicesProfile = {
    business: {
      name: 'Clínica Aura',
      segment: 'Estética & Bem-Estar',
      businessModel: 'servicos',
      description: 'Protocolos faciais sob agendamento.',
      hours: 'Seg a Sáb · 09h às 19h',
    },
    shipping: { fixedFeeCents: 0, freeShippingThresholdCents: 0, pickupAvailable: true },
    catalog: {
      products: [
        { id: 's1', sku: 'SRV-1', name: 'Limpeza Facial Profunda', itemType: 'servico_agendado', priceCents: 22000, variation: '60min', imageUrl: 'https://cdn.example/s1.webp', active: true },
        { id: 's2', sku: 'SRV-2', name: 'Peeling de Diamante', itemType: 'servico_agendado', priceCents: 28000, variation: '45min', imageUrl: 'https://cdn.example/s2.webp', active: true },
        { id: 's3', sku: 'SRV-3', name: 'Drenagem Linfática', itemType: 'servico_agendado', priceCents: 19000, variation: '50min', imageUrl: 'https://cdn.example/s3.webp', active: true },
      ],
    },
  };

  const retail15Profile = {
    business: {
      name: 'Empório Botânico',
      segment: 'Cosméticos',
      businessModel: 'produtos',
      description: 'Linha completa de cuidados diários.',
    },
    shipping: { fixedFeeCents: 1500, freeShippingThresholdCents: 15000, pickupAvailable: true },
    catalog: {
      products: Array.from({ length: 15 }, (_, idx) => ({
        id: `p_${idx + 1}`,
        sku: `SKU-${idx + 1}`,
        name: `Produto Botânico ${idx + 1}`,
        category: idx % 2 === 0 ? 'Facial' : 'Corporal',
        itemType: 'produto_fisico',
        priceCents: 4990,
        variation: '100ml',
        imageUrl: 'https://cdn.example/prod.webp',
        active: true,
      })),
    },
  };

  const metricsLow = computeCatalogMetricsForPrompt(retail15Profile);
  assert.equal(metricsLow.avgPriceCents, 4990);
  assert.equal(metricsLow.ticketTier, 'low_ticket_impulse_pix');

  const { systemPrompt } = buildGlmArchitectMessages(retail15Profile);
  assert.match(systemPrompt, /avgPriceCents = 4990/);
  assert.match(systemPrompt, /FOLD BUDGET/i);
  assert.match(systemPrompt, /artDirectionBible/);

  const servicesDoc = buildNeutralFallbackV9Document(servicesProfile);
  const servicesTypes = servicesDoc.sections.map((s) => s.type);
  assert.equal(servicesTypes[0], 'HeroSection');
  assert.equal(servicesTypes[1], 'DifferentialsStrip');
  assert.equal(servicesTypes[2], 'InteractiveExperience');
  assert.ok(servicesTypes.includes('ContextualFaq'));
  assert.equal(servicesTypes[servicesTypes.length - 1], 'ClosingScheduleSplit');

  const retailDoc = buildNeutralFallbackV9Document(retail15Profile);
  const retailTypes = retailDoc.sections.map((s) => s.type);
  assert.equal(retailTypes[0], 'HeroSection');
  assert.equal(retailTypes[1], 'HighlightsGrid');
  assert.equal(retailTypes[2], 'ComplementaryBundles');
  assert.equal(retailTypes[3], 'CatalogGrid');

  // RunPod Scene Continuity
  const enrichedPrompt = applyArtDirectionBibleToPrompt(
    'Product bottle on table',
    retailDoc.artDirectionBible,
  );
  assert.match(enrichedPrompt, /\[Art Direction Bible/);
  assert.match(enrichedPrompt, /Lighting:/);

  // BUG-F04-09: Design Critic nunca reclama de frete quando shipping.fixedFeeCents já está configurado
  const tipsWithShipping = runDesignCritic(retail15Profile, retailDoc);
  assert.ok(!tipsWithShipping.some((t) => t.id === 'critic_shipping_unset'));
  assert.ok(tipsWithShipping.length <= 2);
});

test('BUG-F04-03, BUG-F04-04 & M2: POST /api/store-molde/patch-section preserva seções irmãs, mantém sourceRevision e estorna -5 cr em falha GLM', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cg-fila04-patch-'));
  const app = await startTempServer(root);
  try {
    const getInit = await app.request('/api/profile');
    const initJson = await getInit.json();

    const profilePayload = {
      ...initJson.profile,
      business: {
        ...initJson.profile.business,
        name: 'Atelier Lume',
        segment: 'Skincare',
        businessModel: 'produtos',
        description: 'Fórmulas botânicas.',
      },
      whatsapp: {
        connected: true,
        phoneE164: '5511988887777',
        displayPhone: '+55 11 98888-7777',
      },
      payment: {
        pixKey: 'pix@lume.com.br',
        pixDiscountPercent: 5,
        acceptedMethods: ['pix', 'credit_card'],
      },
      shipping: {
        fixedFeeCents: 1200,
        freeShippingThresholdCents: 15000,
        pickupAvailable: true,
      },
      catalog: {
        products: [
          {
            id: 'prod-1',
            sku: 'SER-01',
            name: 'Sérum Vitamina C',
            category: 'Séruns',
            priceCents: 11990,
            variation: '30ml',
            stock: 10,
            active: true,
            approvedAsset: true,
          },
          {
            id: 'prod-2',
            sku: 'CRE-02',
            name: 'Creme Calmante',
            category: 'Hidratantes',
            priceCents: 7990,
            variation: '50g',
            stock: 8,
            active: true,
            approvedAsset: true,
          },
        ],
      },
    };

    const putRes = await app.request('/api/profile', 'PUT', {
      revision: initJson.revision,
      profile: profilePayload,
      publish: false,
    });
    assert.equal(putRes.status, 200);
    const afterPut = await putRes.json();
    const revBeforePatch = afterPut.revision;

    // 1. Semeia saldo inicial de 65 cr no ledger local do usuário e confere /api/store-molde/state
    const { mkdir, writeFile } = await import('node:fs/promises');
    const userDir = path.join(root, TEST_USER);
    await mkdir(userDir, { recursive: true });
    await writeFile(
      path.join(userDir, 'credits_ledger.json'),
      JSON.stringify([
        {
          id: 'seed-65',
          user_id: TEST_USER,
          delta: 65,
          balance_after: 65,
          operation_type: 'welcome_invite',
          created_at: new Date().toISOString(),
        },
      ]),
      'utf8',
    );
    const stateBeforeRes = await app.request('/api/store-molde/state');
    const stateBefore = await stateBeforeRes.json();
    const initialBalance = stateBefore.balance;
    assert.equal(initialBalance, 65);

    // 2. Patch Cirúrgico válido (-5 cr): atualiza APENAS sec_hero preservando todas as outras seções
    const patchRes = await app.request('/api/store-molde/patch-section', 'POST', {
      sectionId: 'sec_hero',
      instruction: 'Botânica pura com entrega rápida hoje',
      useGlm: false,
    });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.ok, true);
    assert.equal(patchJson.debited, 5);
    assert.equal(patchJson.balanceAfter, initialBalance - 5);
    assert.ok(Array.isArray(patchJson.criticTips));

    const patchedHero = patchJson.formulaIr.sections.find((s) => s.id === 'sec_hero');
    const siblingExp = patchJson.formulaIr.sections.find((s) => s.type === 'InteractiveExperience');
    const siblingCat = patchJson.formulaIr.sections.find((s) => s.type === 'CatalogGrid');
    assert.match(patchedHero.config.subtitle, /Botânica pura com entrega rápida hoje/);
    assert.ok(siblingExp, 'InteractiveExperience sibling section must be preserved');
    assert.ok(siblingCat, 'CatalogGrid sibling section must be preserved');

    // M2: preserveRevision garante que o perfil do lojista não teve revision incrementada espuriamente
    const checkRev = await (await app.request('/api/profile')).json();
    assert.equal(checkRev.revision, revBeforePatch);

    // 3. BUG-F04-03: Falha simulada no GLM dentro do patch-section deve estornar integralmente os -5 cr
    const failPatchRes = await app.request('/api/store-molde/patch-section', 'POST', {
      sectionId: 'sec_hero',
      instruction: 'Causar falha simulada',
      simulateGlmFailure: true,
    });
    assert.equal(failPatchRes.status, 502);
    const failPatchJson = await failPatchRes.json();
    assert.equal(failPatchJson.refunded, true);
    assert.equal(failPatchJson.balanceAfter, initialBalance - 5);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('BUG-F04-07 & P6: Emissor estático HTML escapa payloads XSS em produtos/FAQ/Bundles e calcula soma exata em centavos', () => {
  const formulasIr = {
    version: '9.0',
    storeInfo: {
      name: 'Loja Teste <img src=x onerror=alert(1)>',
      pixDiscountPercent: 10,
    },
    designTokens: {
      accent: '#0B4DB8',
      accentDeep: '#073B91',
      surface: '#F8FAFC',
      surfaceAlt: '#EFF6FF',
      card: '#FFFFFF',
      ink: '#0F172A',
      inkMuted: '#475569',
      footerBg: '#0F172A',
      fontStyle: 'modern_sans',
      radiusPx: 18,
    },
    catalog: [
      { id: 'p1', sku: 'A-1', name: 'Produto </script><script>alert(2)</script>', category: 'Geral', priceCents: 1999, stock: 5, active: true },
      { id: 'p2', sku: 'B-2', name: 'Item B', category: 'Geral', priceCents: 4000, stock: 5, active: true },
    ],
    sections: [
      {
        id: 'sec_bundles',
        type: 'ComplementaryBundles',
        config: {
          title: 'Combine e Economize',
          subtitle: 'Kit real <script>alert(3)</script>',
          items: [{ id: 'c1', title: 'Combo Real', skuIds: ['A-1', 'B-2', 'FAKE-999'] }],
        },
      },
      {
        id: 'sec_faq',
        type: 'ContextualFaq',
        config: {
          title: 'Dúvidas',
          items: [{ q: 'Entrega <img onerror=alert(4)>', a: 'Em 24h úteis.' }],
        },
      },
      {
        id: 'sec_cat',
        type: 'CatalogGrid',
        config: { title: 'Catálogo', subtitle: '', itemActionLabel: 'Adicionar à sacola', emptyImageMode: 'neutral_gray' },
      },
    ],
  };

  const html = renderMoldeHtmlPage({
    page: { id: 'home', slug: 'index', filename: 'index.html', title: 'Home', sections: formulasIr.sections },
    formulasIr,
  });

  // Zero tag <script>/<img onerror= literal não escapada fora do JSON
  assert.doesNotMatch(html, /<script>alert\(/i);
  assert.doesNotMatch(html, /<img[^>]*onerror=/i);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  // Soma real de A-1 (19,99) + B-2 (40,00) = 59,99 (descartando FAKE-999) + badge Pix 10%
  assert.match(html, /59,99/);
  assert.match(html, /no Pix/i);
});
