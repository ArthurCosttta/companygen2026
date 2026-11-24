import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const routeRegistry = JSON.parse(
  await readFile(path.join(root, 'shared/formula-ir/route-registry.json'), 'utf8'),
);
const capabilityRegistry = JSON.parse(
  await readFile(path.join(root, 'shared/formula-ir/capability-registry.json'), 'utf8'),
);

const wizardSource = await readFile(
  path.join(root, 'src/components/views/onboarding/ExpressFichaWizardModal.tsx'),
  'utf8',
);

const requiredActionTestIds = [
  'onb-instagram-analyze-btn',
  'onb-step1-xlsx-input',
  'onb-ai-autofill-btn',
];

const missing = [];
for (const tid of requiredActionTestIds) {
  if (!wizardSource.includes(tid)) {
    missing.push(`Missing testid: ${tid}`);
  }
}

const routeIds = new Set((routeRegistry.routes || []).map((r) => r.id));
for (const cap of capabilityRegistry.capabilities || []) {
  if (!routeIds.has(cap.screenId)) {
    missing.push(`Capability ${cap.id} references unregistered route ${cap.screenId}`);
  }
}

if (missing.length > 0) {
  console.error('verify-handlers failed:\n' + missing.join('\n'));
  process.exit(1);
}

console.log(
  `verify-handlers OK: ${routeIds.size} routes, ${(capabilityRegistry.capabilities || []).length} capabilities, ${requiredActionTestIds.length} action testids verified.`,
);
