import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileImagePromptFromMolde,
  validateNonGenericImagePrompt,
} from '../shared/formula-ir/image-moldes.mjs';
import {
  BriefQuestionsJsonSchema,
  formatBriefAnswersForPrompt,
  generateContextualBriefQuestions,
  parseOrRepairBriefQuestionsJson,
} from '../shared/formula-ir/brief-questions.mjs';
import { AtomicBlueprintSchema } from '../shared/formula-ir/atomic-grammar.mjs';
import { scanClicheViolations } from '../server/atomic-visual-critic.mjs';
import { CREDIT_ACTION_COSTS, DEFAULT_ACCESS_CODES } from '../server/access-and-checkout.mjs';
import { sanitizePublicStoreProfile } from '../server/public-storefront-loader.mjs';
import { FIVE_SHOWCASE_STORES } from '../shared/formula-ir/showcase-five-pages.mjs';

test('DOC 01: compileImagePromptFromMolde ancora hex, zona livre de texto e rejeita generico', () => {
  const res = compileImagePromptFromMolde({
    role: 'campaign_blackfriday_hero',
    storeName: 'Norte Torra Café',
    segment: 'Cafés Especiais',
    subject: 'mat black gooseneck kettle and craft bags',
    surfaceHex: '#0B0A09',
    accentHex: '#FF5B14',
    textAnchor: 'left',
  });
  assert.equal(res.moldeId, 'HERO_RIGHT_FOCAL_DARK_STAGE');
  assert.ok(res.prompt.includes('#0B0A09'));
  assert.ok(res.prompt.includes('#FF5B14'));
  assert.equal(validateNonGenericImagePrompt(res.prompt).valid, true);
  assert.equal(validateNonGenericImagePrompt('a nice photo').valid, false);
});

test('DOC 02: BriefQuestionsJsonSchema gera ate 5 perguntas tipadas com mapsToTarget', () => {
  const json = generateContextualBriefQuestions({
    profile: {
      business: { name: 'Instituto Motion', segment: 'Fisioterapia Esportiva' },
      catalog: {
        products: [{ id: '1', sku: 'AVAL', name: 'Avaliação Inicial', category: 'Joelho', priceCents: 24000, active: true }],
      },
    },
    campaignTheme: 'consultorio',
  });
  const parsed = BriefQuestionsJsonSchema.safeParse(json);
  assert.equal(parsed.success, true);
  assert.ok(json.questions.length >= 1 && json.questions.length <= 5);
  assert.ok(json.questions.every((q) => q.mapsToTarget.length >= 3));

  const xml = formatBriefAnswersForPrompt({ q_hero_promise: 'Avaliação em 60 min sem encaminhamento' }, json);
  assert.ok(xml.includes('<enriched_merchant_brief>'));
  assert.ok(xml.includes('Avaliação em 60 min'));

  const repaired = parseOrRepairBriefQuestionsJson({ invalid: true }, { campaignTheme: 'natal' });
  assert.equal(repaired.usedFallback, true);
  assert.equal(repaired.data.recommendedCampaignTheme, 'natal');
});

test('DOC 03: scanClicheViolations barra frases genericas de template', () => {
  const badHits = scanClicheViolations([
    {
      tuple: ['s1', 'hero_stage', 'ESTADO_2'],
      textSlots: [{ micro: ['left_col', 'body', 'Envio organizado com acompanhamento direto para você.', 'ui:sz=15', 'icon:none'] }],
    },
  ]);
  assert.ok(badHits.length >= 1);

  const cleanHits = scanClicheViolations([
    {
      tuple: ['s1', 'hero_stage', 'ESTADO_2'],
      textSlots: [{ micro: ['left_col', 'body', 'Café torrado toda terça em microlotes de 40 pacotes.', 'ui:sz=15', 'icon:none'] }],
    },
  ]);
  assert.equal(cleanHits.length, 0);
});

test('DOC 04 + DOC 09: AtomicBlueprintSchema aceita direction c/ hotspots e novos roles V2', () => {
  const res = AtomicBlueprintSchema.safeParse({
    engineSeed: { groundMode: 'warm_linen', displayVoice: 'fraunces', bodyVoice: 'manrope' },
    brandTokens: { archetype: 'co_directed', paletteSource: 'admin', colors: { primary: '#2B1B17', accent: '#C8843C', neutral: '#FAF5EC' } },
    imageRequests: [],
    sections: [
      {
        tuple: ['sec_spots', 'interactive_image_text_stage', 'ESTADO_2'],
        direction: {
          focalPoint: { xPct: 34, yPct: 48 },
          textAnchor: 'right',
          interactionMode: 'hotspot_zoom_sync',
          hotspots: [{ id: 'h1', xPct: 32, yPct: 44, pinLabel: '01', headline: 'Massa Folhada', description: 'Fermentação 24h' }],
        },
        textSlots: [{ micro: ['top_left', 'heading', 'Explore a caixa', 'ui:sz=32', 'icon:none'] }],
      },
      { tuple: ['sec_combo', 'bundle_builder_calculator', 'ESTADO_2'], textSlots: [] },
      { tuple: ['sec_slots', 'calendar_delivery_slots', 'ESTADO_2'], textSlots: [] },
    ],
  });
  assert.equal(res.success, true);
});

test('DOC 05 + DOC 06 + DOC 07: Custos progressivos, 5 codigos Admin e loader multi-pagina', () => {
  assert.equal(CREDIT_ACTION_COSTS.generate_full_storefront, 4);
  assert.ok(CREDIT_ACTION_COSTS.create_subpage >= 3);
  assert.ok(CREDIT_ACTION_COSTS.create_subpage_campaign >= 5);
  assert.ok(CREDIT_ACTION_COSTS.create_subpage_with_art >= 8);
  assert.ok(CREDIT_ACTION_COSTS.co_direction_upgrade >= 2);

  for (const store of FIVE_SHOWCASE_STORES) {
    const found = DEFAULT_ACCESS_CODES.find((c) => c.code === store.accessCode);
    assert.ok(found, `Código ${store.accessCode} deve existir em DEFAULT_ACCESS_CODES`);
    const pub = sanitizePublicStoreProfile(store.profile);
    assert.ok(pub.storeLayout?.formulasIr, `storeLayout.formulasIr preservado em ${store.accessCode}`);
  }
});
