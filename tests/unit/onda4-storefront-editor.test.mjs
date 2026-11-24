import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('storefront-zip-builder uses zero inline onclick= handlers and supports centered hero', () => {
  const zipSrc = readFileSync(
    new URL('../../src/components/views/storefront/storefront-zip-builder.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(zipSrc, /\sonclick="/);
  assert.match(zipSrc, /data-cg-open-cart/);
  assert.match(zipSrc, /data-cg-add-cart=/);
  assert.match(zipSrc, /hero_centered/);
});

test('EditorialStoreControlView exposes Baixar Loja (.ZIP) and CustomerStorefrontView shows desktop+mobile Sacola + viewport switch', () => {
  const editorial = readFileSync(
    new URL('../../src/components/views/storefront/EditorialStoreControlView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(editorial, /editorial-download-zip-btn/);
  assert.match(editorial, /Baixar Loja \(\.ZIP\)/);

  const storefront = readFileSync(
    new URL('../../src/components/views/storefront/CustomerStorefrontView.tsx', import.meta.url),
    'utf8',
  );
  assert.match(storefront, /preview-viewport-mobile/);
  assert.match(storefront, /storefront-floating-bag-bar/);
  assert.doesNotMatch(storefront, /fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md md:hidden/);
});

test('AtomicSectionRenderers enforces 2 columns on mobile and cleans empty category placeholder', () => {
  const renderers = readFileSync(
    new URL('../../src/components/views/storefront/AtomicSectionRenderers.tsx', import.meta.url),
    'utf8',
  );
  assert.match(renderers, /if \(columns === 2\) return 'grid-cols-2 sm:grid-cols-2'/);
  assert.match(renderers, /if \(columns === 3\) return 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3'/);
  assert.doesNotMatch(renderers, /opções selecionadas/);
  assert.match(renderers, /from '\.\/LazyReferencePacks'/);
});
