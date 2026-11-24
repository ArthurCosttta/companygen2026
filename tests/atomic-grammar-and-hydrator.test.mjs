import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AtomicBlueprintSchema,
  CURATED_ICON_CHOICES,
  contrastRatio,
  resolveSectionSurfaceTokens,
} from '../shared/formula-ir/atomic-grammar.mjs';
import { hydrateAndValidateBlueprint } from '../server/atomic-hydrator.mjs';
import { auditAndRepairAtomicBlueprint } from '../server/atomic-visual-critic.mjs';
import { buildArchitectInputPacket } from '../server/store-semantic-dossier.mjs';
import {
  buildPropertyDrivenSectionPrompt,
  compileSectionPropertiesToTuples,
} from '../server/section-property-prompts.mjs';
import { runMultiPhaseAtomicArchitecture } from '../server/atomic-architect-pipeline.mjs';
import {
  buildComeauLayeredShadow,
  buildLarsenEasingScrim,
  computeNestedRadius,
  computeUtopiaTypeScale,
  deriveOklchPaletteSystem,
} from '../shared/formula-ir/visual-math-engine.mjs';

function makeValidTuple(id, role, surface = 'ui:bg=#FFFFFF lum=0.98 | ux:<auto_wcag:4.5> <alt_temp>') {
  return {
    tuple: [id, role, 'ESTADO_2'],
    surface,
    layout: 'ui:cols=12 span=6/6 mob=2 gap=16 py=64 px=24 rad=20',
    type: 'ui:sz=32/20/15/11 wt=800/600/400 ch=56 | ux:<tabular_nums>',
    textStyle: 'wt=700 track=tight',
    textSlots: [
      {
        micro: ['left_col', 'eyebrow', 'Destaque da loja', 'ui:sz=12 wt=700', 'icon:sparkles'],
        mediaPick: 'none',
      },
      {
        micro: ['left_col', 'display', 'Variedades com entrega rápida', 'ui:sz=36 wt=800', 'icon:none'],
        mediaPick: 'none',
      },
    ],
    media: 'ui:ar=16:9 fit=cover slot=img_hero_main | ux:<on_error_monogram>',
    catalog: 'ui:mode=full_searchable_grid take=24 per_cat=4 | ux:<forbid_ai_rename>',
    interact: 'ui:h=44 rad=12 | fx:press=0.98/120ms',
    responsive: 'mob:1|tab:2|desk:2',
    motion: 'enter:fade_up|dur:260',
    dataBind: 'src:catalog',
    a11y: 'contrast:4.5',
    fallback: 'fb:anchor_bento_4',
    lighting: 'lit:soft_studio',
    textureAndMask: 'tex:clean',
    cardAnatomy: 'card:elevated',
    photoTreatment: 'grade:natural',
    ornaments: 'orn:none',
    onboardingLink: 'link:profile_brand',
    productNaming: 'naming:catalog_exact',
    storeContextRules: 'ctx:whatsapp_city',
    content: {},
    contract: 'guard:persona=visitante_publico h>=44 wcag>=4.5 <emit_confirmed>',
  };
}

test('QAB-01: AtomicBlueprintSchema aprova blueprint com 5 tuplas e rejeita icon fora de CURATED_ICON_CHOICES', () => {
  const validBlueprint = {
    brandTokens: {
      archetype: 'multi_category_retail',
      paletteSource: 'logo_extracted',
      colors: {
        primary: '#301800',
        accent: '#D97706',
        neutral: '#F8FAFC',
      },
      fontPairing: 'geometric_bold',
    },
    imageRequests: [
      {
        slotId: 'img_hero_main',
        targetSectionId: 'sec_hero',
        aspectRatio: '16:9',
        width: 1344,
        height: 768,
        source: 'ai_generate',
        prompt: 'Editorial retail display with phone cases, toys and chargers',
        negativePrompt: 'pizza, sushi, burger, dentist',
      },
    ],
    sections: [
      makeValidTuple('sec_hero', 'hero_split', 'ui:bg=logo[0] lum=0.10 | ux:<auto_wcag:4.5> <alt_temp>'),
      makeValidTuple('sec_ribbon', 'kinetic_ribbon'),
      makeValidTuple('sec_bento', 'bento_spotlight'),
      makeValidTuple('sec_cat', 'catalog_full_grid'),
      makeValidTuple('sec_footer', 'anchor_footer'),
    ],
  };

  const ok = AtomicBlueprintSchema.safeParse(validBlueprint);
  assert.equal(ok.success, true, ok.success ? '' : ok.error.message);
  assert.equal(CURATED_ICON_CHOICES.includes('sparkles'), true);

  const invalid = structuredClone(validBlueprint);
  invalid.sections[0].textSlots[0].micro[4] = 'icon:invalid_unicorn_99';
  const bad = AtomicBlueprintSchema.safeParse(invalid);
  assert.equal(bad.success, false);
});

test('QAB-02: hydrateAndValidateBlueprint preserva 100% os nomes e preços reais do catálogo (<forbid_ai_rename>)', () => {
  const profile = {
    business: { name: 'Alexandre Variedades', city: 'São Luís' },
    brand: { primaryColor: '#301800', accentColor: '#D97706' },
    whatsapp: { phoneE164: '+5598999990000' },
    catalog: {
      products: [
        { id: 'SKU-1', sku: 'SKU-1', name: 'Capinha Silicone iPhone 15', category: 'Capinhas', priceCents: 3990, active: true },
        { id: 'SKU-2', sku: 'SKU-2', name: 'Carrinho Controle Remoto', category: 'Brinquedos', priceCents: 12900, active: true },
      ],
    },
  };

  const blueprint = {
    brandTokens: {
      archetype: 'multi_category_retail',
      paletteSource: 'logo_extracted',
      colors: {
        primary: '#301800',
        accent: '#D97706',
        neutral: '#F8FAFC',
      },
      fontPairing: 'geometric_bold',
    },
    imageRequests: [],
    sections: [
      {
        ...makeValidTuple('sec_cat', 'catalog_full_grid'),
        catalog: 'ui:mode=by_skus take=10 | ux:<forbid_ai_rename>',
        content: {
          skus: ['SKU-1', 'SKU-2'],
          products: [{ id: 'SKU-1', name: 'Nome Inventado Pela IA', priceCents: 100 }],
        },
      },
      makeValidTuple('sec_footer', 'anchor_footer'),
    ],
  };

  const res = hydrateAndValidateBlueprint({
    blueprint,
    profile,
    generatedImagesBySlot: { img_hero_main: '/api/store-molde/u1/assets/generated/img_hero_main.webp' },
  });

  assert.equal(res.ok, true, res.ok ? '' : res.error);
  const sec = res.data.sections[0];
  assert.equal(sec.resolvedMedia.imageUrl, '/api/store-molde/u1/assets/generated/img_hero_main.webp');
  assert.equal(sec.boundProducts.length, 2);
  assert.equal(sec.boundProducts[0].name, 'Capinha Silicone iPhone 15');
  assert.equal(sec.boundProducts[0].priceCents, 3990);
  assert.equal(sec.boundProducts[1].name, 'Carrinho Controle Remoto');
  assert.equal(sec.boundProducts[1].priceCents, 12900);
});

test('WCAG + Crítico: accent escuro (#180000) em fundo escuro (#301800) é promovido para >= 4.5:1 e crítico preenche Apple specs', () => {
  const s1 = resolveSectionSurfaceTokens({
    primaryHex: '#301800',
    accentHex: '#180000',
    surfaceStr: 'ui:bg=logo[0] lum=0.10 | ux:<auto_wcag:4.5> <alt_temp>',
    sectionIndex: 0,
    prevIsDark: null,
  });
  const s2 = resolveSectionSurfaceTokens({
    primaryHex: '#301800',
    accentHex: '#180000',
    surfaceStr: 'ui:bg=logo[0] lum=0.10 | ux:<auto_wcag:4.5> <alt_temp>',
    sectionIndex: 1,
    prevIsDark: s1.isDark,
  });
  assert.equal(s1.isDark, true);
  assert.equal(s2.isDark, false);
  assert.ok(contrastRatio(s1.inkHex, s1.bgHex) >= 4.5);
  assert.ok(contrastRatio(s1.accentHex, s1.bgHex) >= 4.5, `accentHex ${s1.accentHex} on ${s1.bgHex}`);
  assert.ok(contrastRatio(s2.inkHex, s2.bgHex) >= 4.5);
  assert.ok(contrastRatio(s2.accentHex, s2.bgHex) >= 4.5, `accentHex ${s2.accentHex} on ${s2.bgHex}`);

  const audited = auditAndRepairAtomicBlueprint({
    brandTokens: { colors: { primary: '#301800', accent: '#D8A848', neutral: '#F5F5F7' } },
    imageRequests: [{ slotId: 'img_hero_main' }],
    sections: [
      { tuple: ['sec_hero', 'hero_split', 'ESTADO_2'], surfaceTokens: s1, resolvedMedia: { imageUrl: '/hero.webp' } },
      { tuple: ['sec_portals', 'split_curtain_portals', 'ESTADO_2'], surfaceTokens: s2 },
      { tuple: ['sec_cat', 'catalog_full_grid', 'ESTADO_2'], surfaceTokens: s1 },
      { tuple: ['sec_footer', 'anchor_footer', 'ESTADO_2'], surfaceTokens: s2 },
    ],
  });
  assert.equal(audited.ok, true, audited.issues.join(','));
  assert.ok(audited.data.sections[0].lighting.includes('radial_back_subject'));
  assert.ok(audited.data.sections[2].cardAnatomy.includes('editorial_spec_card'));

  // Verificar equações do visual-math-engine
  const sys = deriveOklchPaletteSystem({ brandHex: '#301800', accentHex: '#180000', groundMode: 'warm_linen' });
  assert.ok(sys.groundBg.startsWith('#'));
  assert.ok(contrastRatio(sys.accentOnDark, sys.anchorDarkBg) >= 4.5);
  assert.equal(computeNestedRadius(24, 16), 8);
  assert.ok(computeUtopiaTypeScale({ stepK: 3.4 }).fontSize.startsWith('clamp('));
  assert.ok(buildComeauLayeredShadow(2, '#301800').includes('oklch('));
  assert.ok(buildLarsenEasingScrim({ colorHex: '#301800' }).includes('100%'));
});

test('QAB-03: Ficha Enriquecida + Contrato Campo:Valor compilam para tuplas válidas no AtomicBlueprintSchema', async () => {
  const profile = {
    business: { name: 'Atelier Papel', segment: 'Papelaria Editorial', description: 'Cadernos artesanais em papel pólen.' },
    brand: { primaryColor: '#1E293B', accentColor: '#D8A848' },
    payment: { pixDiscountPercent: 8 },
    marketingConcept: {
      brandVoice: 'warm_artisan',
      coreProductSku: 'CAD-01',
      buyerPersona: 'Pessoas que buscam presentes criativos',
      mainObjection: 'Medo de atrasar o presente',
      growthGoal: 'fast_pix_turnover',
      heroLayout: 'hero_split',
      showcaseLayout: 'bento_spotlight',
      gridDensity: '4',
    },
    catalog: {
      products: [
        { id: '1', sku: 'CAD-01', name: 'Caderno Pólen Costura Exposta', category: 'Cadernos', priceCents: 6990, active: true },
        { id: '2', sku: 'KIT-02', name: 'Kit Presente Caligrafia', category: 'Kits', priceCents: 14900, active: true },
      ],
    },
  };

  const dossier = buildArchitectInputPacket(profile);
  assert.equal(dossier.flagshipProduct?.sku, 'CAD-01');
  assert.equal(dossier.brand.brandVoice, 'warm_artisan');
  assert.equal(dossier.monthlyCalendarHooks.length, 4);

  const promptText = buildPropertyDrivenSectionPrompt(dossier);
  assert.ok(promptText.includes('sectionsByProperty'));
  assert.ok(promptText.includes('<brand_concept>'));
  assert.ok(promptText.includes('<tuple_specification>'));
  assert.ok(promptText.includes('<section_spec id="sec_hero">'));
  assert.ok(promptText.includes('CAD-01'));

  const mockSectionsByProp = {
    sec_hero: {
      role: 'hero_split',
      eyebrow: 'EDIÇÃO AUTORAL',
      headline: 'Cadernos feitos à mão no <accent>seu ritmo.</accent>',
      subheadline: 'Presentes com envio no mesmo dia e 8% off no Pix.',
      atmosphere: 'anchor_dark',
      paddingY: 64,
      radiusPx: 22,
    },
    sec_flagship: { role: 'bento_spotlight', heading: 'Carro-chefe <accent>da semana</accent>', showPixBadge: true },
    sec_categories: { role: 'coupled_media_grid', heading: 'Explore por categoria', barTone: 'surface_light' },
    sec_catalog: { role: 'catalog_full_grid', cardsPerRowDesktop: 4, cardsPerRowMobile: 1, showPixBadge: true },
    sec_trust: {
      role: 'open_columns_strip',
      items: [
        { icon: 'truck', text: 'Envio no mesmo dia' },
        { icon: 'shield', text: 'Pix com 8% de desconto' },
        { icon: 'sparkles', text: 'Embalagem presenteável' },
      ],
    },
  };

  const compiledTuples = compileSectionPropertiesToTuples(mockSectionsByProp, dossier);
  assert.equal(compiledTuples[0].tuple[1], 'hero_split');
  assert.ok(compiledTuples.some((s) => s.tuple[1] === 'bento_spotlight'));
  assert.ok(compiledTuples.some((s) => s.responsive === 'mob:1|tab:2|desk:4'));

  const archRes = await runMultiPhaseAtomicArchitecture({
    dossier,
    profile,
    callGlm53Json: async () => ({
      ok: true,
      model: 'zai-org/GLM-5.3',
      data: {
        engineSeed: { groundMode: 'warm_linen', displayVoice: 'fraunces' },
        sectionsByProperty: mockSectionsByProp,
        imagePrompts: [{ slotId: 'img_hero_main', prompt: 'Artisanal notebooks on linen desk, right framed', negativePrompt: 'text' }],
      },
    }),
  });
  assert.equal(archRes.ok, true);
  assert.equal(AtomicBlueprintSchema.safeParse(archRes.blueprint).success, true);
});
