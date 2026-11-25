import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/services/supabase-client';
import { workspaceUser } from '@/services/local-storage';
import {
  buildXlsxUint8Array,
  parsePriceToCents,
  parseUniversalSpreadsheet,
} from '@/utils/xlsx-io';
import {
  buildDefaultMensagemMolde,
  type CatalogItemType,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { normalizeSpreadsheetItemType } from '@/schemas/formula-v9.schema';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

export interface TransformedCatalogProduct {
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  price_brl: string;
  description: string;
  variants: string[];
  stock_qty: number;
  itemType?: CatalogItemType;
  prazoOuDuracao?: string;
  itensInclusosKit?: string[];
  mensagemMolde?: string;
  active: boolean;
}

export interface ColumnMappingEntry {
  targetField: string;
  sourceColumn: string | null;
  sourceIndex: number;
  detectedBy: string;
}

interface TransformCatalogResponse {
  ok: boolean;
  modelUsed: string;
  usedFallback: boolean;
  format?: string;
  columnMapping: {
    nameCol: string | null;
    priceCol: string | null;
    categoryCol: string | null;
    descriptionCol: string | null;
    variationCol: string | null;
    skuCol: string | null;
    stockCol: string | null;
    suggestedCategoryFixes?: Record<string, string>;
    mappings?: ColumnMappingEntry[];
  };
  totalRows: number;
  products: TransformedCatalogProduct[];
  xlsxBase64: string;
  filename: string;
}

export interface UniversalCatalogXlsxModalProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onImportProducts: (products: CatalogProduct[]) => void | Promise<void>;
  ownerUser?: string;
  businessModel?: 'produtos' | 'servicos' | 'hibrido';
}

function toCatalogProductList(items: TransformedCatalogProduct[]): CatalogProduct[] {
  const now = new Date().toISOString();
  return items.map((item, idx) => {
    const variation = item.variants?.length ? item.variants.join(' / ') : 'Padrão';
    const itemType: CatalogItemType = item.itemType || 'produto_fisico';
    const prazoOuDuracao = item.prazoOuDuracao || '';
    const itensInclusosKit = Array.isArray(item.itensInclusosKit) ? item.itensInclusosKit : [];
    const mensagemMolde =
      String(item.mensagemMolde || '').trim() ||
      buildDefaultMensagemMolde({
        name: item.name,
        priceCents: item.price_cents,
        variation,
        itemType,
        prazoOuDuracao,
        itensInclusosKit,
      });

    return {
      id: `${item.sku || 'item'}-${idx + 1}`.toLowerCase().replace(/[^a-z0-9-_]+/g, '-'),
      sku: item.sku,
      name: item.name,
      category: item.category || 'Geral',
      description: item.description || item.name,
      priceCents: item.price_cents,
      variation,
      stock: Number.isFinite(item.stock_qty) ? item.stock_qty : 0,
      active: item.active !== false,
      imageUrl: '',
      approvedAsset: false,
      itemType,
      prazoOuDuracao,
      itensInclusosKit,
      mensagemMolde,
      updatedAt: now,
    };
  });
}

const TARGET_FIELD_LABEL: Record<string, string> = {
  name: 'Nome do Produto',
  price: 'Preço (Centavos / R$)',
  category: 'Categoria',
  description: 'Descrição',
  variation: 'Variações / Grade',
  sku: 'SKU / Código',
  stock: 'Estoque',
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadBase64Xlsx(base64: string, filename: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function localFallbackTransform(
  bytes: Uint8Array,
  filename: string,
  businessModel: 'produtos' | 'servicos' | 'hibrido' = 'produtos'
): Promise<TransformCatalogResponse> {
  const parsed = await parseUniversalSpreadsheet(bytes, filename);
  const sheet = parsed.sheets[0];
  if (!sheet) {
    throw new Error('Nenhuma planilha com dados encontrada no arquivo enviado.');
  }

  const normalized = sheet.headers.map(normalizeHeader);
  const findCol = (patterns: RegExp[]) => {
    for (const re of patterns) {
      const idx = normalized.findIndex(h => re.test(h));
      if (idx >= 0) return sheet.headers[idx];
    }
    return null;
  };

  const nameCol =
    findCol([
      /\b(nome|produto|titulo|mercadoria|servico|cardapio|prato|name|title|product)\b/,
      /^(?!.*\b(id|cod|codigo|ref|sku)\b).*\b(peca|item|desc)\b/,
    ]) ||
    sheet.headers[0] ||
    null;
  const priceCol = findCol([/\b(preco|valor|price|unit|custo|venda|vlr|r)\b/]);
  const categoryCol = findCol([/\b(categoria|grupo|departamento|linha|colecao|secao|category)\b/]);
  const descriptionCol = findCol([/\b(obs|detalhes|descricao|especificacao|ingredientes|porcao|composicao|description)\b/]);
  const variationCol = findCol([/\b(variacao|variacoes|grade|tam|tamanho|cor|sabor|opcao|opcoes|peso|medida)\b/]);
  const skuCol = findCol([/\b(sku|codigo|cod|ref|referencia)\b/, /\b(id_item|id)\b/]);
  const stockCol = findCol([/\b(estoque|qtd|quantidade|saldo|disponivel|stock)\b/]);

  const idxOf = (col: string | null) => (col ? sheet.headers.indexOf(col) : -1);
  const products: TransformedCatalogProduct[] = [];

  sheet.rows.forEach((row, idx) => {
    const nIdx = idxOf(nameCol);
    const name = (nIdx >= 0 ? row[nIdx] : '').trim();
    if (!name) return;
    const pIdx = idxOf(priceCol);
    const priceCents = parsePriceToCents(pIdx >= 0 ? row[pIdx] : '');
    const cIdx = idxOf(categoryCol);
    const dIdx = idxOf(descriptionCol);
    const vIdx = idxOf(variationCol);
    const sIdx = idxOf(skuCol);
    const qIdx = idxOf(stockCol);
    const rawVar = (vIdx >= 0 ? row[vIdx] : '').trim();
    const qtyParsed = parseInt(((qIdx >= 0 ? row[qIdx] : '') || '').replace(/\D/g, ''), 10);

    const itemName = name;
    const itemCat = (cIdx >= 0 ? row[cIdx] : '').trim() || 'Geral';
    const itemDesc = (dIdx >= 0 ? row[dIdx] : '').trim() || name;
    const inferredType: CatalogItemType = normalizeSpreadsheetItemType({
      name: itemName,
      category: itemCat,
      description: itemDesc,
      defaultBusinessModel: businessModel,
      sourceHint: filename,
    }) as CatalogItemType;
    const variantsList = rawVar ? rawVar.split(/[,;|/]+/).map(x => x.trim()).filter(Boolean) : [];
    const varLabel = variantsList.length ? variantsList.join(' / ') : 'Padrão';

    products.push({
      sku: (sIdx >= 0 ? row[sIdx] : '').trim() || `ITEM-${String(idx + 1).padStart(3, '0')}`,
      name: itemName,
      category: itemCat,
      price_cents: priceCents,
      price_brl: `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}`,
      description: itemDesc,
      variants: variantsList,
      stock_qty: Number.isFinite(qtyParsed) ? qtyParsed : 10,
      itemType: inferredType,
      prazoOuDuracao: '',
      itensInclusosKit: [],
      mensagemMolde: buildDefaultMensagemMolde({
        name: itemName,
        priceCents,
        variation: varLabel,
        itemType: inferredType,
      }),
      active: true,
    });
  });

  const outBytes = await buildXlsxUint8Array([
    {
      name: 'Catalogo_Padronizado',
      headers: ['SKU', 'Nome', 'Categoria', 'Preco_BRL', 'Preco_Centavos', 'Descricao', 'Variacoes', 'Estoque'],
      rows: products.map(p => [
        p.sku,
        p.name,
        p.category,
        p.price_brl,
        p.price_cents,
        p.description,
        p.variants.join(', '),
        p.stock_qty,
      ]),
    },
  ]);

  const mappings: ColumnMappingEntry[] = [
    { targetField: 'name', sourceColumn: nameCol, sourceIndex: idxOf(nameCol), detectedBy: 'deterministic' },
    { targetField: 'price', sourceColumn: priceCol, sourceIndex: idxOf(priceCol), detectedBy: 'deterministic' },
    { targetField: 'category', sourceColumn: categoryCol, sourceIndex: idxOf(categoryCol), detectedBy: 'deterministic' },
    { targetField: 'description', sourceColumn: descriptionCol, sourceIndex: idxOf(descriptionCol), detectedBy: 'deterministic' },
    { targetField: 'variation', sourceColumn: variationCol, sourceIndex: idxOf(variationCol), detectedBy: 'deterministic' },
    { targetField: 'sku', sourceColumn: skuCol, sourceIndex: idxOf(skuCol), detectedBy: 'deterministic' },
    { targetField: 'stock', sourceColumn: stockCol, sourceIndex: idxOf(stockCol), detectedBy: 'deterministic' },
  ];

  return {
    ok: true,
    modelUsed: 'deterministic-browser-fallback',
    usedFallback: true,
    format: parsed.format,
    columnMapping: {
      nameCol,
      priceCol,
      categoryCol,
      descriptionCol,
      variationCol,
      skuCol,
      stockCol,
      mappings,
    },
    totalRows: products.length,
    products,
    xlsxBase64: uint8ToBase64(outBytes),
    filename: 'catalogo_padronizado_companygen.xlsx',
  };
}

export function UniversalCatalogXlsxModal({
  open,
  onClose,
  onOpenChange,
  onImportProducts,
  ownerUser,
  businessModel = 'produtos',
}: UniversalCatalogXlsxModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilename, setSourceFilename] = useState('');
  const [result, setResult] = useState<TransformCatalogResponse | null>(null);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  const processSpreadsheet = async (bytes: Uint8Array, filename: string) => {
    setLoading(true);
    setError(null);
    setSourceFilename(filename);

    try {
      const base64Content = uint8ToBase64(bytes);
      const owner = ownerUser || workspaceUser();
      const response = await authenticatedFetch(
        '/api/ai/spreadsheet/transform-catalog',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, base64Content, businessModel }),
        },
        owner
      );

      if (response.ok) {
        const data = (await response.json()) as TransformCatalogResponse;
        setResult(data);
        return;
      }

      if (response.status === 404 || response.status >= 500) {
        const fallbackData = await localFallbackTransform(bytes, filename, businessModel);
        setResult(fallbackData);
        return;
      }

      const errPayload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(errPayload.error || errPayload.message || `Falha HTTP ${response.status}`);
    } catch (err) {
      try {
        const fallbackData = await localFallbackTransform(bytes, filename, businessModel);
        setResult(fallbackData);
      } catch (innerErr) {
        setError(innerErr instanceof Error ? innerErr.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await processSpreadsheet(new Uint8Array(buffer), file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleLoadComplexSample = async () => {
    const sampleBytes = await buildXlsxUint8Array([
      {
        name: 'Fornecedor_Bruto',
        headers: [
          'Cod Ref',
          'Desc. do Produto / Item',
          'Categoria Fornecedor',
          'Valor Unit. (R$)',
          'Grade / Tam',
          'Obs Técnica',
          'Saldo Qtd',
        ],
        rows: [
          ['FORN-901', 'Cesta Café Artesanal Manhã', 'Kits e Cestas', 'R$ 189,90', 'P / M / G', 'Caixa kraft com laço e cartão personalizado', 18],
          ['FORN-902', 'Conjunto Xícaras Porcelana Fosca', 'Mesa Posta', '1290.50', 'Preto / Areia', 'Jogo com 6 peças esmaltadas à mão', 7],
          ['FORN-903', 'Vela Aromática Lavanda 220g', 'Aromas', '49,90', '220g / Refil', 'Cera vegetal de coco e pavio de algodão', 42],
          ['FORN-904', 'Sabonete Líquido Botânico Alecrim', 'Banho e Cuidado', 'R$ 64,00', '300ml', 'Frasco âmbar reutilizável', 25],
          ['FORN-905', 'Caneca Cerâmica Pintada à Mão', 'Mesa Posta', '79,50', 'Azul / Terracota', 'Alta resistência térmica 320ml', 31],
          ['FORN-906', 'Difusor de Ambientes Capim-Limão', 'Aromas', '119.00', '250ml', 'Acompanha 6 varetas de fibra preta', 14],
        ],
      },
    ]);
    await processSpreadsheet(sampleBytes, 'fornecedor_catalogo_complexo.xlsx');
  };

  const handleImportToStore = async () => {
    if (!result?.products.length) return;
    setImporting(true);
    try {
      await onImportProducts(toCatalogProductList(result.products));
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar produtos na loja.');
    } finally {
      setImporting(false);
    }
  };

  const mappingEntries: ColumnMappingEntry[] = result?.columnMapping.mappings || [
    { targetField: 'name', sourceColumn: result?.columnMapping.nameCol || null, sourceIndex: 0, detectedBy: 'ai' },
    { targetField: 'price', sourceColumn: result?.columnMapping.priceCol || null, sourceIndex: 1, detectedBy: 'ai' },
    { targetField: 'category', sourceColumn: result?.columnMapping.categoryCol || null, sourceIndex: 2, detectedBy: 'ai' },
    { targetField: 'description', sourceColumn: result?.columnMapping.descriptionCol || null, sourceIndex: 3, detectedBy: 'ai' },
    { targetField: 'variation', sourceColumn: result?.columnMapping.variationCol || null, sourceIndex: 4, detectedBy: 'ai' },
    { targetField: 'sku', sourceColumn: result?.columnMapping.skuCol || null, sourceIndex: 5, detectedBy: 'ai' },
    { targetField: 'stock', sourceColumn: result?.columnMapping.stockCol || null, sourceIndex: 6, detectedBy: 'ai' },
  ];

  return (
    <div
      data-testid="tela-08-xls-universal-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      style={{
        opacity: entered ? 1 : 0,
        transition: 'opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conversor Universal de Planilhas com IA"
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-[#27272A] bg-[#09090B] text-[#FFFFFF] shadow-sm overflow-hidden"
        style={{
          transform: entered
            ? 'translate3d(0, 0, 0) scale3d(1, 1, 1)'
            : 'translate3d(0, 12px, 0) scale3d(0.985, 0.985, 1)',
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
          willChange: 'transform, opacity',
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272A] bg-[#121215] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#27272A] bg-[#18181B] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                TELA 08-XLS · IA Universal
              </span>
              {result && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <Sparkles className="w-3 h-3" />
                  {result.modelUsed}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-extrabold text-[#FFFFFF]">
              Importador & Padronizador Universal (.XLSX / .XLS / .CSV / .TSV)
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar modal"
            className="min-h-[44px] rounded-xl border border-[#27272A] bg-[#18181B] px-4 text-xs font-bold text-[#FFFFFF] hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Fechar
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 bg-[#09090B]">
          {/* Upload + 1-click Complex Sample Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
            <div className="md:col-span-7 rounded-2xl border-2 border-dashed border-[#27272A] hover:border-emerald-500/70 bg-[#121215] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[#FFFFFF]">
                  Envie a planilha do seu fornecedor ou ERP (.xlsx, .xls, .csv, .tsv)
                </p>
                <p className="text-[11px] text-[#E4E4E7]/75">
                  {sourceFilename
                    ? `Arquivo ativo: ${sourceFilename}`
                    : 'Aceita Excel moderno, SpreadsheetML 2003, tabelas HTML de ERP e CSV (; / ,).'}
                </p>
              </div>
              <input
                ref={fileRef}
                data-testid="xlsx-catalog-upload-input"
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                className="hidden"
                onChange={e => void handleFileChange(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => fileRef.current?.click()}
                className="shrink-0 min-h-[44px] rounded-xl border border-[#27272A] bg-[#18181B] hover:border-emerald-500 px-4 text-xs font-bold text-[#FFFFFF] inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                {loading ? 'Analisando...' : 'Escolher Arquivo'}
              </button>
            </div>

            <button
              type="button"
              data-testid="load-complex-xlsx-sample-btn"
              disabled={loading}
              onClick={() => void handleLoadComplexSample()}
              className="md:col-span-5 min-h-[44px] rounded-2xl border border-emerald-500/50 bg-emerald-950/35 hover:bg-emerald-950/55 px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
            >
              <div>
                <div className="text-xs font-extrabold text-emerald-300">
                  Carregar Planilha Externa de Exemplo (.XLSX Complexo)
                </div>
                <div className="text-[11px] text-[#E4E4E7]/80 mt-0.5">
                  Gera um .xlsx real despadronizado em memória e testa o mapeamento IA
                </div>
              </div>
              <Sparkles className="w-5 h-5 shrink-0 text-emerald-400" />
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {/* Auditable Mapping Table */}
              <section className="rounded-2xl border border-[#27272A] bg-[#121215] overflow-hidden">
                <div className="border-b border-[#27272A] bg-[#18181B] px-4 py-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F4F5]">
                    Auditoria de Mapeamento de Colunas (Coluna Original → Campo CompanyGen)
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-300">
                    {result.totalRows} produto(s) padronizados
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#27272A] text-[#E4E4E7]/75">
                        <th className="px-4 py-2.5 font-semibold">Coluna Original</th>
                        <th className="px-2 py-2.5"></th>
                        <th className="px-4 py-2.5 font-semibold">Campo CompanyGen</th>
                        <th className="px-4 py-2.5 font-semibold">Motor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]/70">
                      {mappingEntries.map(entry => (
                        <tr key={entry.targetField}>
                          <td className="px-4 py-2 font-mono text-[#FFFFFF]">
                            {entry.sourceColumn || <span className="text-[#E4E4E7]/45">(não detectada)</span>}
                          </td>
                          <td className="px-2 py-2 text-emerald-400">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </td>
                          <td className="px-4 py-2 font-semibold text-emerald-300">
                            {TARGET_FIELD_LABEL[entry.targetField] || entry.targetField}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-[#E4E4E7]/75">
                            {entry.detectedBy}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Normalized Products Preview */}
              <section className="rounded-2xl border border-[#27272A] bg-[#121215] overflow-hidden">
                <div className="border-b border-[#27272A] bg-[#18181B] px-4 py-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F4F5]">
                    Prévia dos Produtos Padronizados
                  </h3>
                  <span className="text-[11px] text-[#E4E4E7]/75">
                    Valores convertidos com precisão em centavos BRL
                  </span>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#18181B] border-b border-[#27272A] text-[#E4E4E7]/85">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">SKU</th>
                        <th className="px-4 py-2.5 font-semibold">Nome</th>
                        <th className="px-4 py-2.5 font-semibold">Categoria</th>
                        <th className="px-4 py-2.5 font-semibold">Preço</th>
                        <th className="px-4 py-2.5 font-semibold">Variações</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Estoque</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]/70">
                      {result.products.map((prod, idx) => (
                        <tr key={`${prod.sku}-${idx}`} className="hover:bg-[#18181B]/70">
                          <td className="px-4 py-2 font-mono text-[11px] text-emerald-300">{prod.sku}</td>
                          <td className="px-4 py-2 font-semibold text-[#FFFFFF]">{prod.name}</td>
                          <td className="px-4 py-2 text-[#E4E4E7]">{prod.category}</td>
                          <td className="px-4 py-2 font-mono font-bold text-[#FFFFFF]">{prod.price_brl}</td>
                          <td className="px-4 py-2 text-[#E4E4E7]/85">
                            {prod.variants.length ? prod.variants.join(', ') : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[#E4E4E7]">{prod.stock_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#27272A] bg-[#121215] px-5 py-3.5">
          <button
            type="button"
            disabled={!result?.xlsxBase64}
            onClick={() => result && downloadBase64Xlsx(result.xlsxBase64, result.filename)}
            className="min-h-[44px] rounded-xl border border-[#27272A] bg-[#18181B] hover:border-zinc-500 disabled:opacity-40 px-4 text-xs font-bold text-[#FFFFFF] inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Baixar Catálogo Padronizado (.XLSX)
          </button>

          <button
            type="button"
            data-testid="import-standardized-products-btn"
            disabled={!result?.products.length || importing}
            onClick={() => void handleImportToStore()}
            className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-5 text-xs font-bold text-[#FFFFFF] inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            {importing ? 'Importando...' : 'Importar Produtos na Loja'}
          </button>
        </footer>
      </div>
    </div>
  );
}
