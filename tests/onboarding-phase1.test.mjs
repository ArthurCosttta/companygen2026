import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidProductionPhone,
  PLACEHOLDER_PHONES,
} from '../src/schemas/profile.schema.ts';
import {
  buildCatalogProductsFromNiche,
  detectPixKeyType,
  extractInstagramHandle,
  IGNITION_NICHE_PRESETS,
  normalizeBrazilWhatsAppE164,
} from '../src/components/views/onboarding/onboarding-niche-presets.ts';

const ROOT = process.cwd();

test('Fase 1 Faxina: 4 arquivos legados do onboarding foram removidos do disco', () => {
  const deletedFiles = [
    'src/components/views/onboarding/OnboardingSplitStudio.tsx',
    'src/components/views/onboarding/ExpressFichaWizardModal.tsx',
    'src/components/views/onboarding/WelcomeModal.tsx',
    'src/components/views/onboarding/GuidedChecklistCard.tsx',
  ];

  for (const rel of deletedFiles) {
    const abs = path.join(ROOT, rel);
    assert.equal(fs.existsSync(abs), false, `Arquivo legado ainda existe: ${rel}`);
  }
});

test('Hard Constraint 02 (Anti-Mock): Onboarding novo nunca usa buildNeutralFallbackV9Document nem "Sofia" e chama generate-full real', () => {
  const ignitionCode = fs.readFileSync(
    path.join(ROOT, 'src/components/views/onboarding/OnboardingIgnitionView.tsx'),
    'utf8',
  );
  const synthesisCode = fs.readFileSync(
    path.join(ROOT, 'src/components/views/onboarding/OnboardingSynthesisStage.tsx'),
    'utf8',
  );
  const presetsCode = fs.readFileSync(
    path.join(ROOT, 'src/components/views/onboarding/onboarding-niche-presets.ts'),
    'utf8',
  );

  for (const [label, src] of [
    ['OnboardingIgnitionView', ignitionCode],
    ['OnboardingSynthesisStage', synthesisCode],
    ['onboarding-niche-presets', presetsCode],
  ]) {
    assert.equal(
      src.includes('buildNeutralFallbackV9Document'),
      false,
      `${label} não pode importar ou usar buildNeutralFallbackV9Document`,
    );
    assert.equal(
      src.includes('createProductPlaceholderSvgDataUri'),
      false,
      `${label} não pode gerar SVG placeholder fake de produto`,
    );
    assert.equal(
      /\bSofia\b/i.test(src),
      false,
      `${label} não pode mencionar "Sofia" na UI`,
    );
  }

  assert.ok(
    synthesisCode.includes("'/api/store-molde/generate-full'"),
    'OnboardingSynthesisStage deve chamar POST /api/store-molde/generate-full',
  );
  assert.ok(
    synthesisCode.includes('/api/store-molde/job/'),
    'OnboardingSynthesisStage deve fazer polling em GET /api/store-molde/job/:clientJobId',
  );
  assert.ok(
    synthesisCode.includes('sections.length < 4'),
    'OnboardingSynthesisStage deve validar >= 4 seções antes de publicar',
  );
  assert.ok(
    synthesisCode.includes('402') && synthesisCode.includes('synthesis-error-banner'),
    'OnboardingSynthesisStage deve tratar HTTP 402 transparentemente sem publicar mock falso',
  );
});

test('WhatsApp Validation: normalizeBrazilWhatsAppE164 + isValidProductionPhone bloqueia placeholders e aceita números reais', () => {
  assert.ok(PLACEHOLDER_PHONES.has('5511999999999'));
  assert.equal(isValidProductionPhone(normalizeBrazilWhatsAppE164('(11) 99999-9999')), false);
  assert.equal(isValidProductionPhone(normalizeBrazilWhatsAppE164('(00) 00000-0000')), false);
  assert.equal(isValidProductionPhone(normalizeBrazilWhatsAppE164('(11) 11111-1111')), false);
  assert.equal(isValidProductionPhone(normalizeBrazilWhatsAppE164('119988')), false);

  const valid = normalizeBrazilWhatsAppE164('(11) 98765-4321');
  assert.equal(valid, '5511987654321');
  assert.equal(isValidProductionPhone(valid), true);
});

test('Magic Import Helpers: detectPixKeyType e extractInstagramHandle reconhecem padrões reais', () => {
  assert.equal(detectPixKeyType(''), null);
  assert.equal(detectPixKeyType('12345678901'), 'cpf');
  assert.equal(detectPixKeyType('12.345.678/0001-99'), 'cnpj');
  assert.equal(detectPixKeyType('vendas@papelaria.com.br'), 'email');
  assert.equal(detectPixKeyType('(11) 98765-4321'), 'phone');
  assert.equal(detectPixKeyType('550e8400-e29b-41d4-a716-446655440000'), 'random');

  assert.equal(extractInstagramHandle('@papelariacriativa'), '@papelariacriativa');
  assert.equal(extractInstagramHandle('https://www.instagram.com/doce.grao/'), '@doce.grao');
  assert.equal(extractInstagramHandle('https://instagram.com/reel/XYZ123'), null);
  assert.equal(extractInstagramHandle('Papelaria Criativa'), null);
});

test('Niche Presets: 5 nichos com >= 6 produtos reais, priceCents inteiro, approvedAsset: true e sem SVG fake', () => {
  assert.equal(IGNITION_NICHE_PRESETS.length, 5);
  for (const preset of IGNITION_NICHE_PRESETS) {
    const catalog = buildCatalogProductsFromNiche(preset);
    assert.ok(catalog.length >= 6, `Nicho ${preset.id} precisa de >= 6 produtos`);
    for (const item of catalog) {
      assert.equal(item.active, true);
      assert.equal(item.approvedAsset, true);
      assert.ok(Number.isInteger(item.priceCents) && item.priceCents > 0);
      assert.equal(item.imageUrl.startsWith('data:image/svg+xml'), false);
    }
  }
});
