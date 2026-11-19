import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, stat, rm, utimes } from 'node:fs/promises';
import {
  FORMULA_V9_VERSION,
  contrastRatio,
  deriveThemeTokensFromHex,
  evaluateInteractiveExperience,
  normalizeSpreadsheetItemType,
  relativeLuminance,
  sanitizeFormulaV9Document,
} from '../shared/formula-ir/composer-schema.mjs';
import {
  buildGlmArchitectMessages,
  buildNeutralFallbackV9Document,
} from '../server/glm-architect-prompt.mjs';
import { renderMoldeHtmlPage } from '../server/molde-html-emitter.mjs';
import {
  ensureMoldeFromProfile,
  pruneStaleLocalWorkspaces,
} from '../server/workspace.mjs';

test('Sanitizador v9.0 protege preços reais, respeita uploads do lojista (0 cr) e limita imagePlan <= 5', () => {
  const profile = {
    business: {
      name: 'Patas & Espuma Pet',
      segment: 'Petshop & Estética Animal',
      businessModel: 'servicos',
      description: 'Banho sem gaiolas com água morna.',
    },
    brand: {
      primaryColor: '#2F6F4E',
      fontStyle: 'modern_sans',
      logoUrl: '/api/store-molde/u1/assets/generated/brand_logo.png',
      storefrontPhotoUrl: '/api/store-molde/u1/assets/generated/storefront_front.jpg',
    },
    payment: { pixDiscountPercent: 10 },
    catalog: {
      products: [
        { id: 'pet-1', sku: 'PET-BANHO-M', name: 'Banho Cão Médio', category: 'Higiene', priceCents: 7500, active: true },
        { id: 'pet-2', sku: 'PET-UNHA', name: 'Corte de Unhas', category: 'Extras', priceCents: 2500, active: true },
      ],
    },
  };

  const hallucinatedGlm = {
    version: FORMULA_V9_VERSION,
    imagePlan: [
      { slotId: 'brand_logo', targetSectionId: 'sec_hero', role: 'brand_logo', tier: 'flux-schnell', aspect: '1:1', promptEn: 'minimal logo' },
      { slotId: 'hero_main', targetSectionId: 'sec_hero', role: 'hero', tier: 'flux-dev', aspect: '4:3', promptEn: 'happy golden retriever getting warm bath in calm sunlit pet spa' },
      { slotId: 'j3', targetSectionId: 'sec_close', role: 'lifestyle_banner', tier: 'flux-schnell', aspect: '4:3', promptEn: 'pet grooming room with natural wood' },
      { slotId: 'j4', targetSectionId: 'sec_close', role: 'detail_card', tier: 'flux-schnell', aspect: '1:1', promptEn: 'towels stacked' },
      { slotId: 'j5', targetSectionId: 'sec_close', role: 'detail_card', tier: 'flux-schnell', aspect: '1:1', promptEn: 'brushes closeup' },
      { slotId: 'j6_overflow', targetSectionId: 'sec_close', role: 'detail_card', tier: 'flux-schnell', aspect: '1:1', promptEn: 'extra overflow item' },
    ],
    sections: [
      { id: 'sec_hero', type: 'HeroSection', imageSlotId: 'hero_main', config: { title: 'Patas & Espuma Pet', primaryCta: { label: 'Simular', href: '#experiencia' } } },
      {
        id: 'sec_exp',
        type: 'InteractiveExperience',
        config: {
          title: 'Monte o atendimento do seu pet',
          stateDefaults: { servico: 'banho_m', extras: ['unha'] },
          controls: [
            {
              id: 'c1',
              atomType: 'option_cards',
              stateKey: 'servico',
              label: 'Serviço',
              options: [{ value: 'banho_m', label: 'Nome inventado', skuRef: 'PET-BANHO-M', priceCents: 100 }], // preço alucinado (1,00)
            },
            {
              id: 'c2',
              atomType: 'checklist_addons',
              stateKey: 'extras',
              label: 'Extras',
              options: [{ value: 'unha', label: 'Unhas fake', skuRef: 'PET-UNHA', priceDeltaCents: 500 }],
            },
          ],
          calcRule: { mode: 'base_plus_addons', pixDiscountPercent: 50, summaryTitle: 'Resumo' }, // desconto falso 50%
          primaryAction: { type: 'cart.add_selected', label: 'Levar à sacola' },
        },
      },
      { id: 'sec_close', type: 'ClosingScheduleSplit', config: { title: 'Horários', whatsappHeading: 'Agendar agora' } },
    ],
  };

  const clean = sanitizeFormulaV9Document(hallucinatedGlm, profile);
  // Preço e Pix do perfil vencem sempre a alucinação da IA
  const exp = clean.sections.find((s) => s.type === 'InteractiveExperience');
  assert.equal(exp.config.controls[0].options[0].label, 'Banho Cão Médio');
  assert.equal(exp.config.controls[0].options[0].priceCents, 7500);
  assert.equal(exp.config.calcRule.pixDiscountPercent, 10);

  // Logo enviada pelo lojista impediu job de brand_logo; limite <= 5 mantido
  assert.ok(!clean.imagePlan.some((j) => j.role === 'brand_logo'));
  assert.ok(clean.imagePlan.length <= 5);

  // Storefront uploaded photo automaticamente vinculada na seção de fechamento
  const closing = clean.sections.find((s) => s.type === 'ClosingScheduleSplit');
  assert.equal(closing.config.imageUrl, '/api/store-molde/u1/assets/generated/storefront_front.jpg');

  const evalRes = evaluateInteractiveExperience({
    controls: exp.config.controls,
    state: { servico: 'banho_m', extras: ['unha'] },
    calcRule: exp.config.calcRule,
    catalog: profile.catalog.products,
  });
  assert.equal(evalRes.totalCents, 10000); // 75,00 + 25,00
  assert.equal(evalRes.pixTotalCents, 9000); // 10% OFF real do perfil
  assert.equal(evalRes.selectedProducts.length, 2);
});

test('Classificação universal de planilha Petshop detecta servico_agendado e evita nichos alheios', () => {
  const petServices = [
    'Banho Porte Pequeno',
    'Tosa na Tesoura Completa',
    'Hidratação Pelagem Longa',
    'Corte de Unhas e Ouvido',
    'Vacina V10 Importada',
    'Hotelzinho Diária',
    'Taxi Dog Busca e Traz',
  ];
  for (const name of petServices) {
    assert.equal(
      normalizeSpreadsheetItemType({ name, category: 'Serviços Pet', defaultBusinessModel: 'servicos' }),
      'servico_agendado',
    );
  }
  assert.equal(
    normalizeSpreadsheetItemType({ name: 'Ração Super Premium 15kg', category: 'Alimentação', defaultBusinessModel: 'hibrido' }),
    'produto_fisico',
  );
  assert.equal(
    normalizeSpreadsheetItemType({ name: 'Caixa Presente 9 Doces', category: 'Kits', defaultBusinessModel: 'hibrido' }),
    'kit_combo',
  );
});

test('Prompt GLM e Fallback Neutro geram Petshop vs Confeitaria distintos com zero contaminação de farmácia', () => {
  const petProfile = {
    business: { name: 'AuMiau Spa', segment: 'Petshop', businessModel: 'servicos', description: 'Banho tranquilo sem gaiolas.' },
    brand: { primaryColor: '#2F6F4E', logoUrl: '/logo.png' },
    payment: { pixDiscountPercent: 5 },
    catalog: { products: [{ id: '1', sku: 'PET-01', name: 'Banho Porte M', category: 'Banho', itemType: 'servico_agendado', priceCents: 7900, imageUrl: '', active: true }] },
  };
  const sweetsProfile = {
    business: { name: 'Brigaderia Central', segment: 'Gastronomia & Confeitaria', businessModel: 'hibrido', description: 'Caixas de brigadeiros belgas sob encomenda.' },
    brand: { primaryColor: '#B4532A', fontStyle: 'editorial_serif' },
    payment: { pixDiscountPercent: 0 },
    catalog: { products: [{ id: '2', sku: 'DOC-01', name: 'Caixa 12 Brigadeiros', category: 'Caixas', itemType: 'kit_combo', priceCents: 6400, imageUrl: '', active: true }] },
  };

  const { userPrompt: petPrompt } = buildGlmArchitectMessages(petProfile);
  assert.match(petPrompt, /AuMiau Spa/);
  assert.match(petPrompt, /"usuarioJaEnviouLogo":true/);

  const petDoc = buildNeutralFallbackV9Document(petProfile);
  const sweetsDoc = buildNeutralFallbackV9Document(sweetsProfile);
  assert.notEqual(petDoc.designTokens.accent, sweetsDoc.designTokens.accent);
  assert.notEqual(petDoc.designTokens.fontStyle, sweetsDoc.designTokens.fontStyle);

  const html = renderMoldeHtmlPage({
    page: { filename: 'index.html', title: 'AuMiau Spa', sections: petDoc.sections },
    formulasIr: { ...petDoc, storeInfo: { name: 'AuMiau Spa' }, catalog: petProfile.catalog.products },
  });
  assert.doesNotMatch(html, /skincare|farm[aá]cia|Hidratar|Protetor solar|Av\. Paulista/i);
  assert.match(html, /cg-neutral-gray-box/);
});

test('pruneStaleLocalWorkspaces mantém no máximo N pastas em cache LRU e ensureMoldeFromProfile reidrata (0 cr)', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'cg-lru-test-'));
  try {
    const now = Date.now();
    for (let i = 1; i <= 5; i += 1) {
      const mDir = path.join(tmpRoot, `user_${i}`, 'storefront-molde');
      await mkdir(mDir, { recursive: true });
      await writeFile(path.join(mDir, 'index.html'), `<html>${i}</html>`, 'utf8');
      const age = new Date(now - i * 60_000);
      await utimes(mDir, age, age);
    }

    const res = await pruneStaleLocalWorkspaces(tmpRoot, {
      keepUserId: 'user_5', // oldest, but pinned
      maxCachedStores: 2,
    });
    // user_5 (pinned) + user_1 + user_2 kept (Wait: user_1 is newest, user_5 pinned => user_3 and user_4 must be pruned!)
    assert.ok(res.pruned.includes('user_3') || res.pruned.includes('user_4'));
    assert.ok(res.pruned.length >= 2);
    await assert.doesNotReject(() => stat(path.join(tmpRoot, 'user_5', 'storefront-molde')));

    // Reidrata user_4 sob demanda a partir de storeLayout.formulasIr (sem IA, 0 cr)
    const fallbackDoc = buildNeutralFallbackV9Document({
      business: { name: 'Loja Reidratada', businessModel: 'produtos', description: 'Teste reidratação' },
      catalog: { products: [] },
    });
    const hydrated = await ensureMoldeFromProfile(path.join(tmpRoot, 'user_4'), {
      storeLayout: { formulasIr: { ...fallbackDoc, storeInfo: { name: 'Loja Reidratada' }, catalog: [] } },
    });
    assert.equal(hydrated, true);
    const rehydratedStat = await stat(path.join(tmpRoot, 'user_4', 'storefront-molde', 'index.html'));
    assert.ok(rehydratedStat.size > 50);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('BUG-F04-01, BUG-F04-02, BUG-F04-06 & BUG-F04-10: Guardião WCAG AA (12 cores extremas >= 4.5:1), bloqueio de skuId falso e Fold Budget', () => {
  const extremeColors = [
    '#FEF08A',
    '#38BDF8',
    '#1E1B4B',
    '#000000',
    '#FFFFFF',
    '#FDE047',
    '#A7F3D0',
    '#FBCFE8',
    '#0B4DB8',
    '#2F6F4E',
    '#B4532A',
    '#6D28D9',
  ];

  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(Math.round(relativeLuminance('#FFFFFF')), 1);
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21);

  for (const hex of extremeColors) {
    const tokens = deriveThemeTokensFromHex(hex, 'modern_sans');
    assert.ok(
      contrastRatio(tokens.ink, tokens.surface) >= 4.5,
      `ink vs surface failed for ${hex}: ${contrastRatio(tokens.ink, tokens.surface)}`,
    );
    assert.ok(
      contrastRatio(tokens.ink, tokens.card) >= 4.5,
      `ink vs card failed for ${hex}: ${contrastRatio(tokens.ink, tokens.card)}`,
    );
    assert.ok(
      contrastRatio(tokens.inkMuted, tokens.surface) >= 4.5,
      `inkMuted vs surface failed for ${hex}: ${contrastRatio(tokens.inkMuted, tokens.surface)}`,
    );
    assert.ok(
      contrastRatio(tokens.inkMuted, tokens.surfaceAlt) >= 4.5,
      `inkMuted vs surfaceAlt failed for ${hex}: ${contrastRatio(tokens.inkMuted, tokens.surfaceAlt)}`,
    );
    assert.ok(
      contrastRatio(tokens.accent, '#FFFFFF') >= 4.5,
      `accent vs #FFFFFF failed for ${hex}: ${contrastRatio(tokens.accent, '#FFFFFF')}`,
    );
    assert.ok(
      contrastRatio(tokens.onPrimary, tokens.accent) >= 4.5,
      `onPrimary vs accent failed for ${hex}: ${contrastRatio(tokens.onPrimary, tokens.accent)}`,
    );
    assert.ok(
      contrastRatio(tokens.badgeText, tokens.surfaceAlt) >= 4.5,
      `badgeText vs surfaceAlt failed for ${hex}: ${contrastRatio(tokens.badgeText, tokens.surfaceAlt)}`,
    );
  }

  const profile = {
    business: { name: 'Lume Botânica', segment: 'Skincare', businessModel: 'produtos' },
    payment: { pixDiscountPercent: 5 },
    catalog: {
      products: [
        { id: 'p1', sku: 'SER-01', name: 'Sérum Vitamina C', priceCents: 11990, active: true },
        { id: 'p2', sku: 'CRE-02', name: 'Creme Lavanda', priceCents: 6990, active: true },
      ],
    },
  };

  const docWithHallucinatedSkusAndLongHero = {
    version: FORMULA_V9_VERSION,
    visualDirection: 'editorial_light',
    layoutGrid: 'editorial_split',
    designTokens: deriveThemeTokensFromHex('#FEF08A'),
    sections: [
      {
        id: 'sec_hero',
        type: 'HeroSection',
        config: {
          title: 'Um título exageradamente longo com mais de cento e vinte caracteres que empurraria a foto e o CTA para fora dos 844px iniciais no celular',
          subtitle: 'Um subtítulo gigante que também ultrapassa o limite de 115 caracteres do Fold Budget mobile definido para 390x844px nas diretrizes de conversão da vitrine.',
          primaryCta: { label: 'Explorar', href: '#experiencia' },
        },
      },
      {
        id: 'sec_exp',
        type: 'InteractiveExperience',
        config: {
          title: 'Calculadora e Quiz',
          experienceMode: 'dosage_calculator',
          recommendedSkus: ['SER-01', 'FAKE-999', 'CRE-02'],
          controls: [
            {
              id: 'c_slider',
              atomType: 'slider_range',
              stateKey: 'qtd',
              label: 'Unidades',
              min: 1,
              max: 10,
              step: 1,
              unitLabel: 'un.',
              pricePerUnitCents: 1999,
              skuRef: 'SER-01',
            },
          ],
          calcRule: { mode: 'per_unit_slider', pixDiscountPercent: 50, summaryTitle: 'Resumo' },
          primaryAction: { type: 'cart.add_selected', label: 'Adicionar' },
        },
      },
      {
        id: 'sec_bundles',
        type: 'ComplementaryBundles',
        config: {
          title: 'Combine e Economize',
          items: [
            {
              id: 'b_valid',
              title: 'Combo Real + Falso',
              skuIds: ['SER-01', 'FAKE-999', 'CRE-02'],
              totalCents: 500, // tentativa de adulterar preço para R$ 5,00
            },
            {
              id: 'b_all_fake',
              title: 'Combo 100% Fantasma',
              skuIds: ['GHOST-1', 'GHOST-2'],
              totalCents: 100,
            },
          ],
        },
      },
      {
        id: 'sec_faq',
        type: 'ContextualFaq',
        config: {
          title: 'Perguntas Frequentes',
          items: [{ q: 'Aceita Pix?', a: 'Sim, 5% OFF.' }],
        },
      },
    ],
  };

  const sanitized = sanitizeFormulaV9Document(docWithHallucinatedSkusAndLongHero, profile);
  const hero = sanitized.sections.find((s) => s.type === 'HeroSection');
  assert.ok(hero.config.title.length <= 58);
  assert.ok(hero.config.subtitle.length <= 115);

  const exp = sanitized.sections.find((s) => s.type === 'InteractiveExperience');
  assert.deepEqual(exp.config.recommendedSkus, ['SER-01', 'CRE-02']);
  assert.equal(exp.config.controls[0].pricePerUnitCents, 11990);

  const bundles = sanitized.sections.find((s) => s.type === 'ComplementaryBundles');
  assert.equal(bundles.config.items.length, 1);
  assert.deepEqual(bundles.config.items[0].skuIds, ['SER-01', 'CRE-02']);
  assert.equal(bundles.config.items[0].totalCents, 11990 + 6990);
  assert.equal(bundles.config.items[0].pixTotalCents, Math.round((11990 + 6990) * 0.95));

  // BUG-F04-10: Dosage calculator em centavos inteiros exatos (3 * 11990 = 35970, zero float drift)
  const calc3 = evaluateInteractiveExperience({
    controls: exp.config.controls,
    state: { qtd: 3 },
    calcRule: exp.config.calcRule,
    catalog: profile.catalog.products,
  });
  assert.equal(calc3.totalCents, 35970);
  assert.equal(Number.isInteger(calc3.totalCents), true);
  assert.equal(Number.isInteger(calc3.pixTotalCents), true);
});
