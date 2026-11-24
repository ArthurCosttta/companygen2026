import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleOrdersCsv,
  detectOrderColumnMap,
  normalizeImportedOrderStatus,
  parseOrderPriceToCents,
  parseOrdersMatrix,
  parsePastedOrdersText,
  updateParsedOrderRowField,
} from '../src/components/views/orders/orders-spreadsheet-import.ts';

test('Fase 3 — parseOrderPriceToCents parses BRL and decimal strings and flags invalid values as 0', () => {
  assert.equal(parseOrderPriceToCents('R$ 189,90'), 18990);
  assert.equal(parseOrderPriceToCents('189.90'), 18990);
  assert.equal(parseOrderPriceToCents('1.250,50'), 125050);
  assert.equal(parseOrderPriceToCents('64,90'), 6490);
  assert.equal(parseOrderPriceToCents(99.9), 9990);
  assert.equal(parseOrderPriceToCents('abc'), 0);
  assert.equal(parseOrderPriceToCents(''), 0);
  assert.equal(parseOrderPriceToCents('-10,00'), 0);
});

test('Fase 3 — detectOrderColumnMap matches varied PT-BR/EN headers fuzzily', () => {
  const map = detectOrderColumnMap([
    'Comprador',
    'WhatsApp',
    'Resumo do Pedido',
    'R$ Total',
    'Situação',
  ]);
  assert.equal(map.hasHeader, true);
  assert.equal(map.customerNameIdx, 0);
  assert.equal(map.customerPhoneIdx, 1);
  assert.equal(map.itemsSummaryIdx, 2);
  assert.equal(map.totalCentsIdx, 3);
  assert.equal(map.statusIdx, 4);
});

test('Fase 3 — normalizeImportedOrderStatus maps common labels to Kanban columns', () => {
  assert.equal(normalizeImportedOrderStatus('Pago'), 'confirmado');
  assert.equal(normalizeImportedOrderStatus('Pix Confirmado'), 'confirmado');
  assert.equal(normalizeImportedOrderStatus('Em Preparo'), 'confirmado');
  assert.equal(normalizeImportedOrderStatus('Aguardando Pagamento'), 'aguardando_pagamento');
  assert.equal(normalizeImportedOrderStatus('Pendente'), 'aguardando_pagamento');
  assert.equal(normalizeImportedOrderStatus('Entregue'), 'concluido');
  assert.equal(normalizeImportedOrderStatus('Novo'), 'aguardando_dados');
  assert.equal(normalizeImportedOrderStatus(''), 'aguardando_dados');
});

test('Fase 3 — parsePastedOrdersText tolerates invalid row in mixed batch and allows inline fix', () => {
  const mixedBatch = [
    'Cliente\tWhatsApp\tProduto\tValor\tStatus',
    'Mariana Costa\t11987654321\tCesta Café Artesanal Manhã\tR$ 189,90\tPago',
    'Rafael Almeida\t11976543210\tCaderno Espiral Capa Dura\t49,90\tEm Preparo',
    'Juliana Ribeiro\t21998123344\tPlanner Semanal Minimalista\tR$ 64,90\tNovo',
    'Lucas Ferreira\t31991234567\tCaixa Organizadora Linho\t119.00\tEntregue',
    'Cliente Com Erro\t11911112222\tKit Escrita Executiva\tabc\tPago',
  ].join('\n');

  const parsed = parsePastedOrdersText(mixedBatch);
  assert.equal(parsed.length, 5);

  const validBefore = parsed.filter((r) => r.valid);
  const invalidBefore = parsed.filter((r) => !r.valid);
  assert.equal(validBefore.length, 4, '4 valid rows must be preserved without rejecting the batch');
  assert.equal(invalidBefore.length, 1, '1 invalid row must be flagged for inline correction');

  assert.equal(parsed[0].totalCents, 18990);
  assert.equal(parsed[0].status, 'confirmado');
  assert.equal(parsed[1].totalCents, 4990);
  assert.equal(parsed[2].totalCents, 6490);
  assert.equal(parsed[2].status, 'aguardando_dados');
  assert.equal(parsed[3].totalCents, 11900);
  assert.equal(parsed[3].status, 'concluido');

  assert.equal(parsed[4].valid, false);
  assert.ok(parsed[4].fieldErrors.totalCents, '5th row should flag fieldErrors.totalCents');

  // Fix inline
  const fixedRow = updateParsedOrderRowField(parsed[4], 'rawPriceInput', 'R$ 99,90');
  assert.equal(fixedRow.valid, true);
  assert.equal(fixedRow.totalCents, 9990);
  assert.equal(fixedRow.fieldErrors.totalCents, undefined);
});

test('Fase 3 — buildSampleOrdersCsv produces valid parseable sample template', () => {
  const csv = buildSampleOrdersCsv();
  const rows = parsePastedOrdersText(csv);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.valid && r.totalCents > 0));
});
