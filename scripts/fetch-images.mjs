#!/usr/bin/env node
// Usage: node scripts/fetch-images.mjs examples/campaign-fashion.json [more.json ...]
// Reads image_search.queries (+ slide image_query as fallback), acquires up to
// image_search.target_count authorised photos per campaign into public/assets/images.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireImages, activeProvider } from './image-acquisition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'assets', 'images');
const files = process.argv.slice(2);
if (!files.length) {
  console.error('Informe ao menos um JSON de campanha.');
  process.exit(1);
}
console.log(`[images] provider ativo: ${activeProvider()}${process.env.PEXELS_API_KEY ? '' : ' (PEXELS_API_KEY ausente)'}`);
let failed = false;
for (const f of files) {
  const spec = JSON.parse(await fs.readFile(path.resolve(f), 'utf8'));
  const s = spec.image_search || {};
  if (s.enabled === false) { console.log(`[images] ${f}: image_search desativado`); continue; }
  const slideQueries = (spec.posts || []).flatMap((p) => (p.slides || []).map((x) => x.image_query)).filter(Boolean);
  const queries = [...new Set([...(s.queries || []), ...slideQueries])];
  const res = await acquireImages({ queries, targetCount: s.target_count ?? 20, collection: spec.campaign.id, outDir });
  console.log(`[images] ${f}: +${res.added.length} (total ${res.total}/${s.target_count ?? 20}), ignoradas ${res.skipped.length}, erros ${res.errors.length}`);
  for (const e of res.errors.slice(0, 10)) console.log('   erro:', e);
  if (res.total < (s.target_count ?? 20)) {
    failed = true;
    console.log(`[images] AVISO: acervo de "${spec.campaign.id}" incompleto (${res.total}/${s.target_count ?? 20}).`);
  }
}
process.exit(failed ? 2 : 0);
