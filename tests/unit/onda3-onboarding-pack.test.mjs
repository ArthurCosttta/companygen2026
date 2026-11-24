import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('White-label UI files contain zero visible GLM branding leaks', () => {
  const files = [
    'src/components/views/onboarding/OnboardingIgnitionView.tsx',
    'src/components/views/onboarding/OnboardingSynthesisStage.tsx',
    'src/components/views/storefront/DynamicBriefQuestionsModal.tsx',
    'src/components/views/whatsapp/WhatsAppConnectionView.tsx',
    'src/components/views/whatsapp/WhatsappPersistentVisualizer.tsx',
  ];
  for (const rel of files) {
    const content = readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
    // Match visible UI copy mentioning "com GLM", "no GLM", "IA GLM", "Pensando GLM", "· GLM"
    assert.doesNotMatch(content, /(?:com GLM|no GLM|IA GLM|Pensando GLM|· GLM)/, `Leak in ${rel}`);
  }
});

test('Onboarding includes 80% loading progress bar, free-text question notes, and PreBuildPagesCartStep', () => {
  const ignition = readFileSync(
    new URL('../../src/components/views/onboarding/OnboardingIgnitionView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ignition, /ignition-loading-bar-80/);
  assert.match(ignition, /ignition-q-custom-text-/);
  assert.match(ignition, /PreBuildPagesCartStep/);
  assert.match(ignition, /useDraftAutoSave/);

  const serverMolde = readFileSync(
    new URL('../../server/storefront-molde-fs.mjs', import.meta.url),
    'utf8',
  );
  assert.match(serverMolde, /recommendedSectionsPreview/);
  assert.match(serverMolde, /recommendedExtraPages/);
  assert.match(serverMolde, /\/api\/store-molde\/ensure-pack/);
});
