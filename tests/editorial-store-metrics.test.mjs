import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveEditorialMetrics,
  EDITORIAL_COMMAND_IDS,
  filterEditorialProducts,
  fuzzySubsequenceMatch,
  nextEditorialFilter,
} from '../src/components/views/storefront/editorial-store-helpers.ts';

const ROOT = process.cwd();

function makeProduct(partial) {
  return {
    id: partial.id,
    sku: partial.sku || `SKU-${partial.id}`,
    name: partial.name,
    category: partial.category || 'Kits & Cestas',
    description: partial.description || '',
    priceCents: partial.priceCents ?? 18990,
    variation: partial.variation || 'Padrão',
    stock: partial.stock ?? 10,
    active: partial.active ?? true,
    imageUrl: partial.imageUrl ?? '',
    approvedAsset: true,
    updatedAt: new Date().toISOString(),
  };
}

test('Fase 2 Métricas: deriveEditorialMetrics espelha 0 quando vazio e valores reais quando populado', () => {
  const profile = {
    catalog: {
      products: [
        makeProduct({ id: '1', name: 'Cesta Café', active: true }),
        makeProduct({ id: '2', name: 'Caderno Kraft', active: true }),
        makeProduct({ id: '3', name: 'Item Pausado', active: false }),
      ],
    },
  };

  const emptyMetrics = deriveEditorialMetrics(profile, null);
  assert.deepEqual(emptyMetrics, {
    visitsTotal: 0,
    clicksTotal: 0,
    ordersCount: 0,
    activeProductsCount: 2,
    pausedProductsCount: 1,
    totalProductsCount: 3,
  });

  const populatedDashboard = {
    visitsTotal: 142,
    messagesCount: 38,
    ordersCount: 12,
  };

  const realMetrics = deriveEditorialMetrics(profile, populatedDashboard);
  assert.deepEqual(realMetrics, {
    visitsTotal: 142,
    clicksTotal: 38,
    ordersCount: 12,
    activeProductsCount: 2,
    pausedProductsCount: 1,
    totalProductsCount: 3,
  });
});

test('Fase 2 Filtro & Fuzzy Search: Ativos/Pausados/Todos e matching < 16ms em 200 itens', () => {
  const sampleProducts = [
    makeProduct({ id: '1', name: 'Cesta Café Artesanal Manhã', priceCents: 18990, active: true }),
    makeProduct({ id: '2', name: 'Caderno Papelaria Kraft A5', category: 'Cadernos', priceCents: 4990, active: true }),
    makeProduct({ id: '3', name: 'Item Fora de Linha', category: 'Arquivo', priceCents: 9900, active: false }),
  ];

  assert.equal(filterEditorialProducts(sampleProducts, 'active', '').length, 2);
  assert.equal(filterEditorialProducts(sampleProducts, 'paused', '').length, 1);
  assert.equal(filterEditorialProducts(sampleProducts, 'all', '').length, 3);

  assert.equal(fuzzySubsequenceMatch('cesta caf', 'Cesta Café Artesanal Manhã'), true);
  assert.equal(filterEditorialProducts(sampleProducts, 'active', 'cesta caf')[0]?.id, '1');
  assert.equal(filterEditorialProducts(sampleProducts, 'active', '189')[0]?.id, '1');
  assert.equal(filterEditorialProducts(sampleProducts, 'active', 'papelraia')[0]?.id, '2');

  assert.equal(nextEditorialFilter('active'), 'paused');
  assert.equal(nextEditorialFilter('paused'), 'all');
  assert.equal(nextEditorialFilter('all'), 'active');

  const largeCatalog = Array.from({ length: 200 }, (_, i) =>
    makeProduct({
      id: `bulk_${i}`,
      name: i === 150 ? 'Cesta Café Artesanal Especial' : `Produto Editorial ${i}`,
      category: 'Papelaria',
      priceCents: 4500 + i * 100,
      active: i % 5 !== 0,
    }),
  );

  const startedAt = performance.now();
  const matches = filterEditorialProducts(largeCatalog, 'all', 'cesta caf');
  const elapsedMs = performance.now() - startedAt;
  assert.ok(matches.some((m) => m.id === 'bulk_150'));
  assert.ok(elapsedMs < 16, `Fuzzy filter em 200 itens levou ${elapsedMs.toFixed(2)}ms (limite < 16ms)`);
});

test('Fase 2 Contrato UI: EditorialStoreControlView sem "Sofia", sem simulador e com IDs estáveis', () => {
  assert.equal(EDITORIAL_COMMAND_IDS.CREATE_PRODUCT, 'catalog.create');
  assert.equal(EDITORIAL_COMMAND_IDS.OPEN_VITRINE, 'store.openPreview');
  assert.equal(EDITORIAL_COMMAND_IDS.CYCLE_FILTER, 'catalog.cycleFilter');

  const viewSrc = fs.readFileSync(
    path.join(ROOT, 'src/components/views/storefront/EditorialStoreControlView.tsx'),
    'utf8',
  );
  assert.equal(/\bSofia\b/i.test(viewSrc), false, 'EditorialStoreControlView não deve mencionar "Sofia"');
  assert.equal(
    viewSrc.includes('split-smartphone-frame'),
    false,
    'EditorialStoreControlView não deve conter simulador de celular',
  );
});
