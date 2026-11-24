import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_ACCESS_CODES } from '../server/access-and-checkout.mjs';
import { FIVE_SHOWCASE_STORES } from '../shared/formula-ir/showcase-five-pages.mjs';

const WORKDIR = path.resolve('.');

async function seedAllFiveAdminStores() {
  const workspacesRoot = path.join(WORKDIR, 'workspaces');
  await mkdir(workspacesRoot, { recursive: true });

  // 1. Atualiza registro de códigos administrativos padrão localmente
  const codesPath = path.join(workspacesRoot, '_shared_access_codes.json');
  let existingCodes = [];
  try {
    existingCodes = JSON.parse(await readFile(codesPath, 'utf8'));
    if (!Array.isArray(existingCodes)) existingCodes = [];
  } catch {
    existingCodes = [];
  }

  const byCode = new Map(existingCodes.map((c) => [c.code, c]));
  for (const def of DEFAULT_ACCESS_CODES) {
    if (!byCode.has(def.code)) {
      byCode.set(def.code, { ...def });
    }
  }
  await writeFile(codesPath, JSON.stringify(Array.from(byCode.values()), null, 2), 'utf8');

  // 2. Provisiona os 5 workspaces individuais completos + formulas-ir.json + credits_ledger.json
  for (const store of FIVE_SHOWCASE_STORES) {
    const dir = path.join(workspacesRoot, store.userId);
    const moldeDataDir = path.join(dir, 'storefront-molde', 'data');
    await mkdir(moldeDataDir, { recursive: true });

    const profileEnvelope = {
      revision: 1,
      updatedAt: new Date().toISOString(),
      data: store.profile,
    };
    await writeFile(path.join(dir, 'profile.json'), JSON.stringify(profileEnvelope, null, 2), 'utf8');
    await writeFile(path.join(dir, 'studio.json'), JSON.stringify(profileEnvelope, null, 2), 'utf8');
    await writeFile(
      path.join(moldeDataDir, 'formulas-ir.json'),
      JSON.stringify(store.profile.storeLayout.formulasIr, null, 2),
      'utf8',
    );
    await writeFile(
      path.join(dir, 'credits_ledger.json'),
      JSON.stringify(
        [
          {
            id: `seed_${store.accessCode}`,
            ts: new Date().toISOString(),
            action: 'access_code_grant',
            delta: store.credits,
            balance_after: store.credits,
            code: store.accessCode,
          },
        ],
        null,
        2,
      ),
      'utf8',
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        seededCodes: FIVE_SHOWCASE_STORES.map((s) => ({
          code: s.accessCode,
          storeName: s.profile.business.name,
          credits: s.credits,
          publicUrl: `/?view=store&u=${s.userId}&loja=${s.publicSlug}`,
          accessUrl: `/?route=access&code=${s.accessCode}`,
        })),
      },
      null,
      2,
    ),
  );
}

seedAllFiveAdminStores().catch((err) => {
  console.error(err);
  process.exit(1);
});
