import type { BusinessOrder } from '@/schemas/profile.schema';
import type { ParsedSpreadsheetSheet } from '@/utils/xlsx-io';

export type ImportedKanbanStatus =
  | 'aguardando_dados'
  | 'aguardando_pagamento'
  | 'confirmado'
  | 'concluido';

export interface ParsedOrderRow {
  rowIndex: number;
  customerName: string;
  customerPhone: string;
  itemsSummary: string;
  rawPriceInput: string;
  totalCents: number;
  status: ImportedKanbanStatus;
  valid: boolean;
  ignored?: boolean;
  fieldErrors: Partial<Record<'customerName' | 'totalCents' | 'customerPhone', string>>;
}

export interface DetectedOrderColumnMap {
  customerNameIdx: number;
  customerPhoneIdx: number;
  itemsSummaryIdx: number;
  totalCentsIdx: number;
  unitPriceIdx: number;
  qtyIdx: number;
  skuIdx: number;
  typeIdx: number;
  statusIdx: number;
  hasHeader: boolean;
  matchedScore: number;
}

function normalizeHeaderToken(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function parseOrderPriceToCents(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.round(raw * 100);
  }
  const str = String(raw ?? '').trim();
  if (!str) return 0;

  // Reject purely alphabetic or negative strings
  const withoutCurrency = str.replace(/r\$/gi, '').replace(/\s+/g, '').trim();
  if (!withoutCurrency || /^[-+]/.test(withoutCurrency) || /[a-zA-Z]/.test(withoutCurrency)) {
    return 0;
  }

  const cleaned = withoutCurrency.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    if ((cleaned.match(/,/g) || []).length > 1) {
      return 0;
    }
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned) && !/^0\.\d+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    } else if ((cleaned.match(/\./g) || []).length > 1) {
      return 0;
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function normalizeImportedOrderStatus(raw: string | undefined | null): ImportedKanbanStatus {
  const token = normalizeHeaderToken(String(raw || ''));
  if (!token) return 'aguardando_dados';

  if (
    token.includes('entreg') ||
    token.includes('conclu') ||
    token.includes('deliver') ||
    token.includes('finaliz')
  ) {
    return 'concluido';
  }

  if (
    token.includes('pago') ||
    token.includes('pix') ||
    token.includes('confirm') ||
    token.includes('prepar')
  ) {
    return 'confirmado';
  }

  if (
    token.includes('aguardando pag') ||
    token.includes('pagto') ||
    token.includes('pendente') ||
    token.includes('cobranca')
  ) {
    return 'aguardando_pagamento';
  }

  return 'aguardando_dados';
}

export function sanitizeOrderPhoneDigits(raw: string | undefined | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function detectOrderColumnMap(firstRow: string[]): DetectedOrderColumnMap {
  const normalized = firstRow.map(normalizeHeaderToken);

  const findCol = (keywords: string[], exactTokens: string[] = []): number => {
    const exactIdx = normalized.findIndex((h) => exactTokens.includes(h));
    if (exactIdx >= 0) return exactIdx;
    return normalized.findIndex((h) => keywords.some((kw) => h.includes(kw)));
  };

  const customerNameIdx = findCol(
    ['cliente', 'comprador', 'tutor', 'nome', 'customer', 'client'],
    ['cliente', 'nome', 'comprador', 'tutor', 'customer'],
  );
  const customerPhoneIdx = findCol(
    ['telefone', 'whatsapp', 'celular', 'fone', 'phone', 'wpp', 'contato'],
    ['telefone', 'whatsapp', 'celular', 'fone'],
  );
  const itemsSummaryIdx = findCol(
    ['produto / servico', 'produto', 'produtos', 'servico', 'itens', 'item', 'resumo', 'pedido', 'descricao'],
    ['produto / servico', 'produto', 'produtos', 'servico', 'itens', 'resumo', 'pedido'],
  );
  const totalCentsIdx = findCol(
    ['valor total', 'total (r$)', 'valor', 'total', 'r$', 'amount'],
    ['valor total', 'valor total (r$)', 'valor', 'total', 'r$'],
  );
  const unitPriceIdx = findCol(
    ['preco unit', 'preco tabela', 'preco', 'price'],
    ['preco unit. (r$)', 'preco unitario', 'preco', 'price'],
  );
  const qtyIdx = findCol(['qtd', 'qtde', 'quant', 'qty'], ['qtd', 'qtde', 'quantidade', 'qty']);
  const skuIdx = findCol(['sku', 'codigo', 'cod'], ['sku', 'codigo']);
  const typeIdx = findCol(['tipo', 'operacao', 'movimentacao'], ['tipo']);
  const statusIdx = findCol(
    ['status', 'situacao', 'etapa', 'fase', 'estado'],
    ['status', 'situacao', 'etapa'],
  );

  const matchedScore = [
    customerNameIdx,
    customerPhoneIdx,
    itemsSummaryIdx,
    totalCentsIdx >= 0 ? totalCentsIdx : unitPriceIdx,
    statusIdx,
  ].filter((idx) => idx >= 0).length + (skuIdx >= 0 ? 1 : 0);

  if (matchedScore >= 2 || (customerNameIdx >= 0 && (totalCentsIdx >= 0 || unitPriceIdx >= 0))) {
    return {
      customerNameIdx: customerNameIdx >= 0 ? customerNameIdx : 0,
      customerPhoneIdx: customerPhoneIdx >= 0 ? customerPhoneIdx : 1,
      itemsSummaryIdx: itemsSummaryIdx >= 0 ? itemsSummaryIdx : 2,
      totalCentsIdx: totalCentsIdx >= 0 ? totalCentsIdx : unitPriceIdx >= 0 ? unitPriceIdx : 3,
      unitPriceIdx,
      qtyIdx,
      skuIdx,
      typeIdx,
      statusIdx: statusIdx >= 0 ? statusIdx : 4,
      hasHeader: true,
      matchedScore,
    };
  }

  return {
    customerNameIdx: 0,
    customerPhoneIdx: 1,
    itemsSummaryIdx: 2,
    totalCentsIdx: 3,
    unitPriceIdx: -1,
    qtyIdx: -1,
    skuIdx: -1,
    typeIdx: -1,
    statusIdx: 4,
    hasHeader: false,
    matchedScore: 0,
  };
}

export function validateOrderRow(
  draft: Omit<ParsedOrderRow, 'valid' | 'fieldErrors' | 'totalCents'> & { totalCents?: number },
): ParsedOrderRow {
  const customerName = String(draft.customerName || '').trim();
  const customerPhone = String(draft.customerPhone || '').trim();
  const itemsSummary = String(draft.itemsSummary || '').trim() || 'Pedido importado';
  const rawPriceInput = String(draft.rawPriceInput ?? '').trim();
  const computedCents =
    rawPriceInput.length > 0
      ? parseOrderPriceToCents(rawPriceInput)
      : typeof draft.totalCents === 'number' && draft.totalCents > 0
        ? Math.round(draft.totalCents)
        : 0;

  const fieldErrors: ParsedOrderRow['fieldErrors'] = {};

  if (!customerName) {
    fieldErrors.customerName = 'Informe o nome do cliente';
  }
  if (computedCents <= 0) {
    fieldErrors.totalCents = 'Informe um valor maior que zero (ex: 99,90)';
  }

  const phoneDigits = customerPhone.replace(/\D/g, '');
  if (phoneDigits.length > 0 && phoneDigits.length < 10) {
    fieldErrors.customerPhone = 'Telefone curto (mín. 10 dígitos com DDD)';
  }

  // Note: customerPhone warning does not block importing the order if name and price are valid
  const hasBlockingError = Boolean(fieldErrors.customerName || fieldErrors.totalCents);

  return {
    rowIndex: draft.rowIndex,
    customerName,
    customerPhone,
    itemsSummary,
    rawPriceInput:
      rawPriceInput ||
      (computedCents > 0 ? (computedCents / 100).toFixed(2).replace('.', ',') : ''),
    totalCents: computedCents,
    status: normalizeImportedOrderStatus(draft.status),
    valid: !hasBlockingError,
    ignored: Boolean(draft.ignored),
    fieldErrors,
  };
}

interface SkuCatalogEntry {
  name: string;
  priceCents: number;
}

function buildSkuLookupFromSheets(sheets: ParsedSpreadsheetSheet[]): Map<string, SkuCatalogEntry> {
  const map = new Map<string, SkuCatalogEntry>();
  for (const sheet of sheets) {
    const combined = sheet.headers.length > 0 ? [sheet.headers, ...sheet.rows] : sheet.rows;
    for (let rIdx = 0; rIdx < Math.min(12, combined.length); rIdx += 1) {
      const tokens = combined[rIdx].map(normalizeHeaderToken);
      const skuCol = tokens.findIndex((t) => t === 'sku' || t.startsWith('sku ') || t === 'codigo');
      const nameCol = tokens.findIndex((t) => t.includes('produto') || t.includes('servico') || t === 'nome' || t === 'item');
      const priceCol = tokens.findIndex((t) => t.includes('preco') || t.includes('valor') || t.includes('price'));
      if (skuCol >= 0 && nameCol >= 0) {
        for (let i = rIdx + 1; i < combined.length; i += 1) {
          const row = combined[i];
          const skuVal = String(row[skuCol] || '').trim().toUpperCase();
          const nameVal = String(row[nameCol] || '').trim();
          const priceCents = priceCol >= 0 ? parseOrderPriceToCents(row[priceCol]) : 0;
          if (skuVal && nameVal && !map.has(skuVal)) {
            map.set(skuVal, { name: nameVal, priceCents });
          }
        }
        break;
      }
    }
  }
  return map;
}

export function parseOrdersMatrix(
  headers: string[],
  rows: string[][],
  skuLookup?: Map<string, SkuCatalogEntry>,
): ParsedOrderRow[] {
  const combined = headers.length > 0 ? [headers, ...rows] : rows;
  const nonEmpty = combined
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
    .filter((r) => r.some((cell) => cell.length > 0));

  if (nonEmpty.length === 0) return [];

  // Escaneia as primeiras 15 linhas para achar a linha real de cabeçalho (mesmo com banner/título em cima)
  let headerIdx = 0;
  let colMap = detectOrderColumnMap(nonEmpty[0]);
  for (let i = 0; i < Math.min(15, nonEmpty.length); i += 1) {
    const candidateMap = detectOrderColumnMap(nonEmpty[i]);
    if (candidateMap.hasHeader && candidateMap.matchedScore > colMap.matchedScore) {
      colMap = candidateMap;
      headerIdx = i;
    }
  }

  const dataRows = colMap.hasHeader ? nonEmpty.slice(headerIdx + 1) : nonEmpty;

  const parsed: ParsedOrderRow[] = [];
  for (let idx = 0; idx < dataRows.length; idx += 1) {
    const cells = dataRows[idx];
    const typeToken = colMap.typeIdx >= 0 ? normalizeHeaderToken(cells[colMap.typeIdx] ?? '') : '';
    if (typeToken.includes('reembols') || typeToken.includes('estorn') || typeToken.includes('cancel')) {
      continue;
    }

    const customerName = cells[colMap.customerNameIdx] ?? '';
    const customerPhone = cells[colMap.customerPhoneIdx] ?? '';
    const skuRaw = colMap.skuIdx >= 0 ? String(cells[colMap.skuIdx] ?? '').trim().toUpperCase() : '';
    const catalogMatch = skuRaw && skuLookup ? skuLookup.get(skuRaw) : undefined;

    const rawItemSummary = String(cells[colMap.itemsSummaryIdx] ?? '').trim();
    const qtyNum = colMap.qtyIdx >= 0 ? Math.max(1, Math.round(Number(String(cells[colMap.qtyIdx] || '1').replace(',', '.')) || 1)) : 1;
    const itemsSummary =
      rawItemSummary ||
      (catalogMatch ? (qtyNum > 1 ? `${qtyNum}x ${catalogMatch.name}` : catalogMatch.name) : skuRaw ? `Item ${skuRaw}` : 'Pedido Planilha');

    let rawPriceInput = String(cells[colMap.totalCentsIdx] ?? '').trim();
    let computedTotalCents = parseOrderPriceToCents(rawPriceInput);

    // Fallback inteligente quando Valor Total na planilha veio como formula sem cache
    if (computedTotalCents <= 0 && colMap.unitPriceIdx >= 0) {
      const unitCents = parseOrderPriceToCents(cells[colMap.unitPriceIdx]);
      if (unitCents > 0) {
        computedTotalCents = unitCents * qtyNum;
        rawPriceInput = (computedTotalCents / 100).toFixed(2).replace('.', ',');
      }
    }
    if (computedTotalCents <= 0 && catalogMatch && catalogMatch.priceCents > 0) {
      computedTotalCents = catalogMatch.priceCents * qtyNum;
      rawPriceInput = (computedTotalCents / 100).toFixed(2).replace('.', ',');
    }

    const rawStatus = cells[colMap.statusIdx] ?? 'novo';
    parsed.push(
      validateOrderRow({
        rowIndex: parsed.length,
        customerName,
        customerPhone,
        itemsSummary,
        rawPriceInput,
        totalCents: computedTotalCents,
        status: normalizeImportedOrderStatus(rawStatus),
      }),
    );
  }
  return parsed;
}

export function parseOrdersWorkbookSheets(
  sheets: ParsedSpreadsheetSheet[],
  preferredSheetIndex?: number,
): {
  selectedSheetIdx: number;
  selectedSheetName: string;
  sheetNames: string[];
  rows: ParsedOrderRow[];
} {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { selectedSheetIdx: 0, selectedSheetName: '', sheetNames: [], rows: [] };
  }
  const skuLookup = buildSkuLookupFromSheets(sheets);
  const sheetNames = sheets.map((s, idx) => s.name || `Aba_${idx + 1}`);

  if (typeof preferredSheetIndex === 'number' && sheets[preferredSheetIndex]) {
    const target = sheets[preferredSheetIndex];
    return {
      selectedSheetIdx: preferredSheetIndex,
      selectedSheetName: sheetNames[preferredSheetIndex],
      sheetNames,
      rows: parseOrdersMatrix(target.headers, target.rows, skuLookup),
    };
  }

  let bestIdx = 0;
  let bestRows = parseOrdersMatrix(sheets[0].headers, sheets[0].rows, skuLookup);
  let bestScore = bestRows.filter((r) => r.valid).length * 10 + bestRows.length;

  for (let i = 1; i < sheets.length; i += 1) {
    const candidateRows = parseOrdersMatrix(sheets[i].headers, sheets[i].rows, skuLookup);
    const nameBoost = /lancament|pedido|venda|order|moviment/i.test(sheets[i].name || '') ? 500 : 0;
    const score = candidateRows.filter((r) => r.valid).length * 10 + candidateRows.length + nameBoost;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestRows = candidateRows;
    }
  }

  return {
    selectedSheetIdx: bestIdx,
    selectedSheetName: sheetNames[bestIdx],
    sheetNames,
    rows: bestRows,
  };
}

function splitDelimitedLine(line: string, delimiter: '\t' | ';' | ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parsePastedOrdersText(rawText: string): ParsedOrderRow[] {
  const clean = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter: '\t' | ';' | ',' = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(';')
      ? ';'
      : ',';

  const matrix = lines.map((line) => splitDelimitedLine(line, delimiter));
  return parseOrdersMatrix([], matrix);
}

export function updateParsedOrderRowField(
  row: ParsedOrderRow,
  field: 'customerName' | 'customerPhone' | 'itemsSummary' | 'rawPriceInput' | 'status',
  value: string,
): ParsedOrderRow {
  const nextDraft = {
    ...row,
    [field]: field === 'status' ? normalizeImportedOrderStatus(value) : value,
  };
  return validateOrderRow(nextDraft);
}

export function buildSampleOrdersCsv(): string {
  return [
    'Cliente;WhatsApp;Produto;Valor;Status',
    'Mariana Costa;(11) 98765-4321;Cesta Café Artesanal Manhã;R$ 189,90;Pago',
    'Rafael Almeida;(11) 97654-3210;Caderno Espiral Capa Dura + Kit Escrita;R$ 138,90;Em Preparo',
    'Juliana Ribeiro;(21) 99812-3344;Planner Semanal Minimalista;R$ 64,90;Novo',
    'Lucas Ferreira;(31) 99123-4567;Caixa Organizadora Linho;R$ 119,00;Entregue',
  ].join('\n');
}

export function buildOptimisticBusinessOrderFromRow(
  row: ParsedOrderRow,
  indexOffset = 0,
): BusinessOrder {
  const now = new Date().toISOString();
  const phoneDigits = sanitizeOrderPhoneDigits(row.customerPhone);
  const suffix = String(Date.now() + indexOffset).slice(-4);
  return {
    id: `imp-${Date.now()}-${row.rowIndex}`,
    order_ref: `PED-IMP${suffix}${row.rowIndex + 1}`,
    customer_jid: phoneDigits ? `${phoneDigits}@s.whatsapp.net` : '',
    customer_name: row.customerName.trim() || 'Cliente',
    items: [
      {
        sku: `PLANILHA-${row.rowIndex + 1}`,
        name: row.itemsSummary.trim() || 'Pedido Planilha',
        variation: 'Balcão',
        quantity: 1,
        unitPriceCents: row.totalCents,
        lineTotalCents: row.totalCents,
      },
    ],
    subtotal_cents: row.totalCents,
    shipping_cents: 0,
    discount_cents: 0,
    total_cents: row.totalCents,
    payment_method: row.status === 'confirmado' || row.status === 'concluido' ? 'Pix' : 'A combinar',
    delivery_address: phoneDigits ? { phone: phoneDigits } : {},
    status: row.status,
    isSimulation: false,
    is_simulation: false,
    source_revision: 1,
    created_at: now,
    updated_at: now,
  };
}
