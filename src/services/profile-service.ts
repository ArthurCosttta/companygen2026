import { authenticatedFetch } from './supabase-client';
import { workspaceUser } from './local-storage';
import { normalizeSpreadsheetItemType } from '@/schemas/formula-v9.schema';
import { parseUniversalSpreadsheet, parsePriceToCents as parseUniversalPriceCents } from '@/utils/xlsx-io';
import {
  BusinessProfileSchema,
  createEmptyProfile,
  sanitizePhoneE164,
  type BusinessOrder,
  type BusinessProfile,
  type CatalogItemType,
  type CatalogProduct,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';

export type BackendOrderStatus = BusinessOrder['status'];
export type DashboardPeriodDays = 7 | 30 | 90 | 'all';

export const ORDER_STATUS_UI_MAP: Record<BackendOrderStatus, string> = {
  aguardando_dados: 'Novo',
  aguardando_pagamento: 'Aguardando Pagamento',
  confirmado: 'Pago',
  em_preparo: 'Em Preparo',
  enviado: 'Enviado',
  entregue: 'Entregue',
  concluido: 'Entregue',
  cancelado: 'Cancelado',
};

export const UI_LABEL_TO_ORDER_STATUS: Record<string, BackendOrderStatus> = {
  novo: 'aguardando_dados',
  aguardando_dados: 'aguardando_dados',
  'aguardando pagamento': 'aguardando_pagamento',
  aguardando_pagamento: 'aguardando_pagamento',
  pago: 'confirmado',
  confirmado: 'confirmado',
  'em preparo': 'em_preparo',
  em_preparo: 'em_preparo',
  enviado: 'enviado',
  entregue: 'entregue',
  concluido: 'concluido',
  cancelado: 'cancelado',
};

export const ORDER_STATUS_META: Record<
  BackendOrderStatus,
  { status: BackendOrderStatus; label: string; tone: 'amber' | 'green' | 'blue' | 'red'; badgeClass: string }
> = {
  aguardando_dados: {
    status: 'aguardando_dados',
    label: 'Novo',
    tone: 'amber',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  aguardando_pagamento: {
    status: 'aguardando_pagamento',
    label: 'Aguardando Pagamento',
    tone: 'amber',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  confirmado: {
    status: 'confirmado',
    label: 'Pago',
    tone: 'green',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  em_preparo: {
    status: 'em_preparo',
    label: 'Em Preparo',
    tone: 'blue',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  enviado: {
    status: 'enviado',
    label: 'Enviado',
    tone: 'blue',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  entregue: {
    status: 'entregue',
    label: 'Entregue',
    tone: 'blue',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  concluido: {
    status: 'concluido',
    label: 'Entregue',
    tone: 'blue',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  cancelado: {
    status: 'cancelado',
    label: 'Cancelado',
    tone: 'red',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
  },
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_UI_MAP[status as BackendOrderStatus] || status;
}

export function resolveBackendOrderStatus(input: string): BackendOrderStatus | null {
  const key = String(input || '').trim().toLowerCase();
  return UI_LABEL_TO_ORDER_STATUS[key] ?? null;
}

export interface ManualOrderItemInput {
  sku?: string;
  productId?: string;
  name?: string;
  customItemName?: string;
  quantity?: number;
  qty?: number;
  unitPriceCents?: number;
  overrideTotalCents?: number;
}

export interface ManualOrderPayload {
  customerName: string;
  customerPhone?: string;
  customerJid?: string;
  productId?: string;
  sku?: string;
  customItemName?: string;
  items?: ManualOrderItemInput[];
  totalCents?: number;
  discountCents?: number;
  deliveryCents?: number;
  shippingCents?: number;
  paymentMethod: string;
  status?: BackendOrderStatus;
  markAsPaid?: boolean;
  orderRef?: string;
}

export type ProfileSnapshot = {
  revision: number;
  provider: 'supabase' | 'servidor';
  profile: BusinessProfile;
  diff?: { changedPaths: string[]; targets: string[] };
  projections?: {
    bot?: Record<string, unknown>;
    storePublic?: Record<string, unknown>;
  };
};

const pendingProfileWrites = new Map<string, Promise<unknown>>();

export async function loadBusinessProfile(owner = workspaceUser()): Promise<ProfileSnapshot> {
  const response = await authenticatedFetch('/api/profile', undefined, owner);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Não foi possível carregar a ficha da empresa.');
  }
  const raw = await response.json();
  return {
    ...raw,
    profile: BusinessProfileSchema.parse(raw.profile || {}),
  };
}

export async function saveBusinessProfile(
  revision: number,
  profile: BusinessProfile,
  options?: { publish?: boolean },
  owner = workspaceUser(),
): Promise<ProfileSnapshot> {
  const response = await authenticatedFetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision,
      profile: BusinessProfileSchema.parse(profile),
      publish: Boolean(options?.publish),
    }),
  }, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(raw.error || 'Não foi possível salvar a ficha da empresa.') as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return {
    ...raw,
    profile: BusinessProfileSchema.parse(raw.profile || {}),
  };
}

export function updateBusinessProfile(
  mutate: (draft: BusinessProfile) => void,
  options?: { publish?: boolean },
  owner = workspaceUser(),
): Promise<ProfileSnapshot> {
  const job = (pendingProfileWrites.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const snap = await loadBusinessProfile(owner);
      const draft = structuredClone(snap.profile || createEmptyProfile());
      mutate(draft);
      try {
        return await saveBusinessProfile(snap.revision, draft, options, owner);
      } catch (err) {
        if ((err as { status?: number })?.status === 409) continue;
        throw err;
      }
    }
    throw new Error('A ficha sofreu alterações simultâneas. Tente salvar novamente.');
  });
  pendingProfileWrites.set(owner, job);
  return job.finally(() => {
    if (pendingProfileWrites.get(owner) === job) pendingProfileWrites.delete(owner);
  });
}

export async function loadDashboardMetrics(
  owner = workspaceUser(),
  periodDays: DashboardPeriodDays = 7,
): Promise<DashboardMetricsProjection> {
  const query = `?days=${encodeURIComponent(String(periodDays))}`;
  const response = await authenticatedFetch(`/api/dashboard${query}`, undefined, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(raw.error || 'Não foi possível carregar o painel de vendas.');
  return raw.dashboard;
}

export async function loadOrders(owner = workspaceUser()): Promise<BusinessOrder[]> {
  const response = await authenticatedFetch('/api/orders', undefined, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(raw.error || 'Não foi possível listar pedidos.');
  return Array.isArray(raw.orders) ? raw.orders : [];
}

export async function createManualOrder(
  payload: ManualOrderPayload,
  owner = workspaceUser(),
): Promise<BusinessOrder> {
  const customerName = String(payload.customerName || '').trim();
  if (!customerName) {
    throw new Error('Informe o nome do cliente para registrar a venda.');
  }
  const phoneDigits = sanitizePhoneE164(payload.customerPhone || '');
  const response = await authenticatedFetch(
    '/api/orders',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        manual: true,
        customerName,
        customerPhone: phoneDigits,
        customerJid: payload.customerJid || (phoneDigits ? `${phoneDigits}@s.whatsapp.net` : ''),
      }),
    },
    owner,
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || !raw.order) {
    throw new Error(raw.error || 'Não foi possível registrar a venda. Tente novamente.');
  }
  return raw.order as BusinessOrder;
}

export async function updateOrderStatus(
  orderRef: string,
  status: BackendOrderStatus,
  owner = workspaceUser(),
): Promise<BusinessOrder> {
  const cleanRef = String(orderRef || '').trim();
  if (!cleanRef) {
    throw new Error('Identificador do pedido inválido.');
  }
  const response = await authenticatedFetch(
    '/api/orders',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderRef: cleanRef, status }),
    },
    owner,
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || !raw.order) {
    throw new Error(raw.error || 'Falha ao atualizar status do pedido. Tente novamente.');
  }
  return raw.order as BusinessOrder;
}

export async function deleteOrdersByRef(
  orderRefs: string[],
  owner = workspaceUser(),
): Promise<{ ok: boolean; removedCount: number; orders?: BusinessOrder[] }> {
  const cleanRefs = (Array.isArray(orderRefs) ? orderRefs : [])
    .map(r => String(r || '').trim())
    .filter(Boolean);
  if (cleanRefs.length === 0) {
    return { ok: true, removedCount: 0 };
  }
  const response = await authenticatedFetch(
    '/api/orders',
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderRefs: cleanRefs }),
    },
    owner,
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(raw.error || 'Não foi possível desfazer a importação de pedidos.');
  }
  return {
    ok: true,
    removedCount: Number(raw.removedCount) || cleanRefs.length,
    orders: Array.isArray(raw.orders) ? raw.orders : undefined,
  };
}

export async function recordStoreVisit(owner = workspaceUser()): Promise<void> {
  await authenticatedFetch('/api/store/visit', { method: 'POST' }, owner).catch(() => null);
}

export async function analyzeInstagramProfile(
  handle: string,
  owner = workspaceUser(),
): Promise<{
  ok: boolean;
  handle: string;
  fullName: string;
  bio: string;
  category: string;
  logoUrl: string;
  logoDataUrl?: string;
  dominantColors?: string[];
  source: string;
  phone: string;
  address: string;
  hours: string;
  differentials: string[];
  links: string[];
  error?: string;
}> {
  const response = await authenticatedFetch('/api/instagram/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  }, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(raw.error || 'Não foi possível analisar este perfil do Instagram.');
  }
  return raw;
}

export async function simulateWhatsappFlow(
  texto: string,
  options?: { jid?: string; nomeCliente?: string },
  owner = workspaceUser(),
) {
  const response = await authenticatedFetch('/api/whatsapp/api/fluxo/simular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jid: options?.jid,
      nomeCliente: options?.nomeCliente,
      texto,
    }),
  }, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw.ok === false) {
    throw new Error(raw.error || raw.erro || 'Não foi possível simular a mensagem no WhatsApp.');
  }
  return raw;
}

export interface ReactiveSpreadsheetParseResult {
  ok: boolean;
  reactiveCode:
    | 'CATALOG_READY'
    | 'EXCEEDS_BATCH_LIMIT'
    | 'NON_CATALOG_FINANCIAL_SHEET'
    | 'NON_CATALOG_SHEET'
    | 'NO_CATALOG_ITEMS_FOUND'
    | 'EMPTY_OR_UNREADABLE';
  warning?: string;
  error?: string;
  modelUsed?: string;
  usedFallback?: boolean;
  detectedSegment?: string;
  products: CatalogProduct[];
  imageStats: {
    embeddedImagesCount: number;
    publicImageUrlsCount: number;
    invalidImageUrlsCount: number;
  };
}

function mapSpreadsheetSheetReactive(
  headers: string[],
  rows: string[][],
  imagesByRow: Record<number, string> = {},
): ReactiveSpreadsheetParseResult {
  if (!headers.length || !rows.length) {
    return {
      ok: false,
      reactiveCode: 'EMPTY_OR_UNREADABLE',
      error: 'Planilha vazia ou sem linhas de produtos.',
      products: [],
      imageStats: { embeddedImagesCount: 0, publicImageUrlsCount: 0, invalidImageUrlsCount: 0 },
    };
  }

  const headerNorm = headers.map((h) =>
    String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim(),
  );
  const colIdx = (...candidates: string[]) => headerNorm.findIndex((h) => candidates.some((c) => h.includes(c)));
  const iName = colIdx('nome', 'produto', 'name', 'titulo', 'mercadoria', 'cardapio', 'servico', 'item');
  const iSku = colIdx('sku', 'codigo', 'cod', 'ref');
  const iPrice = colIdx('preco', 'valor', 'price', 'unit', 'venda');
  const iStock = colIdx('estoque', 'stock', 'qtd', 'quantidade');
  const iCat = colIdx('categoria', 'category', 'grupo', 'departamento');
  const iTypeExact = colIdx('tipo', 'type');
  const iType = iTypeExact >= 0 ? iTypeExact : colIdx('modelo');
  const iVar = colIdx('variante', 'variacao', 'tamanho', 'modelo', 'variant', 'cor');
  const iDesc = colIdx('descricao', 'description', 'detalhes', 'obs');
  const iImg = colIdx('imagem', 'foto', 'image', 'thumb', 'url');

  const joined = headerNorm.join(' | ');
  const looksFinancial =
    /\b(receita|despesa|saldo|extrato|dre|contas a pagar|contas a receber|boleto|fluxo de caixa|folha|imposto)\b/.test(
      joined,
    );
  if (looksFinancial && !(iName >= 0 && iPrice >= 0)) {
    return {
      ok: false,
      reactiveCode: 'NON_CATALOG_FINANCIAL_SHEET',
      error:
        'Identificamos uma planilha financeira/fluxo de caixa em vez de catálogo de produtos. Envie uma tabela com colunas Nome e Preço.',
      products: [],
      imageStats: { embeddedImagesCount: 0, publicImageUrlsCount: 0, invalidImageUrlsCount: 0 },
    };
  }

  const maxBatch = 120;
  const totalRows = rows.length;
  const exceedsBatch = totalRows > maxBatch;
  const sliceRows = rows.slice(0, maxBatch);

  let embeddedImagesCount = 0;
  let publicImageUrlsCount = 0;
  let invalidImageUrlsCount = 0;

  const products: CatalogProduct[] = [];
  for (let r = 0; r < sliceRows.length; r++) {
    const row = sliceRows[r];
    if (!row || row.every((cell) => !String(cell || '').trim())) continue;
    const name = String(iName >= 0 ? row[iName] : row[0] || '').trim();
    if (!name || /^[-=_*]+$/.test(name)) continue;

    const skuRaw = String(
      iSku >= 0 ? row[iSku] : `ITEM-${String(products.length + 1).padStart(3, '0')}`,
    ).trim();
    const sku = skuRaw.toUpperCase().replace(/[^A-Z0-9_-]/g, '-') || `ITEM-${String(products.length + 1).padStart(3, '0')}`;
    const priceCents = parseUniversalPriceCents(String(iPrice >= 0 ? row[iPrice] : '0'));
    const stockNum = Number.parseInt(
      String(iStock >= 0 ? row[iStock] : '20').replace(/\D/g, ''),
      10,
    );
    const category = String(iCat >= 0 ? row[iCat] : 'Geral').trim() || 'Geral';
    const variation = String(iVar >= 0 ? row[iVar] : 'Padrão').trim() || 'Padrão';
    const description = String(iDesc >= 0 ? row[iDesc] : '').trim();

    let resolvedImage = '';
    if (imagesByRow[r]) {
      resolvedImage = imagesByRow[r];
      embeddedImagesCount += 1;
    } else {
      const candidate =
        String(iImg >= 0 ? row[iImg] : row.find((c) => /^https?:\/\/[^\s"'<>]+/i.test(String(c || '').trim())) || '').trim();
      if (/^https?:\/\/[^\s"'<>]+/i.test(candidate)) {
        resolvedImage = candidate;
        publicImageUrlsCount += 1;
      } else if (/^(file:\/\/|[a-z]:\\|\/users\/|fakepath)/i.test(candidate)) {
        invalidImageUrlsCount += 1;
      }
    }

    const rawType = String(iType >= 0 ? row[iType] : '').trim();
    const normalizedRawType = (() => {
      const clean = rawType.toLowerCase();
      if (!clean) return '';
      if (/^(service|services)$/i.test(clean)) return 'servico_agendado';
      if (/^(product|products)$/i.test(clean)) return 'produto_fisico';
      return rawType;
    })();
    const explicitTypeMatch =
      normalizedRawType &&
      /servico_agendado|servi[cç]o|agend|sess[aã]o|consulta|kit_combo|kit|combo|cesta|pacote|sob_medida|medida|encomenda|personaliz|planejad|produto_fisico|produto/i.test(
        normalizedRawType,
      );
    const itemType: CatalogItemType | undefined = explicitTypeMatch
      ? (normalizeSpreadsheetItemType({
          rawType: normalizedRawType,
          name,
          category,
          description,
        }) as CatalogItemType)
      : undefined;

    products.push({
      id: `${sku.toLowerCase()}-${products.length + 1}`,
      sku,
      name,
      category,
      description,
      priceCents,
      variation,
      stock: Number.isFinite(stockNum) ? Math.max(0, stockNum) : 20,
      active: true,
      ...(itemType ? { itemType } : {}),
      imageUrl: resolvedImage,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    });
  }

  if (products.length === 0) {
    return {
      ok: false,
      reactiveCode: 'NO_CATALOG_ITEMS_FOUND',
      error: 'Nenhum produto válido encontrado. Confira as colunas de Nome e Preço.',
      products: [],
      imageStats: { embeddedImagesCount, publicImageUrlsCount, invalidImageUrlsCount },
    };
  }

  return {
    ok: true,
    reactiveCode: exceedsBatch ? 'EXCEEDS_BATCH_LIMIT' : 'CATALOG_READY',
    ...(exceedsBatch
      ? {
          warning: `Planilha com ${totalRows} itens: carregamos os primeiros ${maxBatch} produtos para gerar sua loja com rapidez.`,
        }
      : {}),
    products,
    imageStats: { embeddedImagesCount, publicImageUrlsCount, invalidImageUrlsCount },
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function parseSpreadsheetReactive(
  file: File,
  options?: { ownerUser?: string; businessModel?: string; storeName?: string; segment?: string },
): Promise<ReactiveSpreadsheetParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isText = ext === 'csv' || ext === 'txt' || ext === 'tsv';
  const rawBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(rawBuffer);
  const rawText = isText ? new TextDecoder('utf-8').decode(bytes) : undefined;

  // 1) Try server-side GLM-5.3 spreadsheet analyzer first (when in browser with active network/backend)
  if (typeof window !== 'undefined') {
    try {
      const owner = options?.ownerUser || workspaceUser();
      const base64Content = isText ? undefined : uint8ArrayToBase64(bytes);
      const response = await authenticatedFetch(
        '/api/ai/spreadsheet/transform-catalog',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            ...(base64Content ? { base64Content } : { rawText }),
            businessModel: options?.businessModel || 'produtos',
            storeName: options?.storeName || '',
            segment: options?.segment || '',
          }),
        },
        owner,
      );
      if (response.ok) {
        const data = (await response.json()) as {
          ok?: boolean;
          reactiveCode?: ReactiveSpreadsheetParseResult['reactiveCode'];
          warning?: string;
          error?: string;
          modelUsed?: string;
          usedFallback?: boolean;
          detectedSegment?: string;
          imageStats?: ReactiveSpreadsheetParseResult['imageStats'];
          products?: Array<Record<string, unknown>>;
        };
        if (data?.ok && Array.isArray(data.products) && data.products.length > 0) {
          const normalizedProducts: CatalogProduct[] = data.products.map((p, idx) => {
            const sku = String(p.sku || `ITEM-${String(idx + 1).padStart(3, '0')}`).trim();
            const priceCents = Number(p.priceCents ?? p.price_cents ?? 0) || 0;
            const stock = Number(p.stock ?? p.stock_qty ?? 20);
            const variants = Array.isArray(p.variants) ? p.variants.map(String) : [];
            const variation = String(p.variation || (variants.length ? variants.join(' / ') : 'Padrão')).trim();
            const itemType = p.itemType as CatalogItemType | undefined;
            return {
              id: String(p.id || `${sku.toLowerCase()}-${idx + 1}`),
              sku,
              name: String(p.name || 'Produto').trim(),
              category: String(p.category || 'Geral').trim() || 'Geral',
              description: String(p.description || '').trim(),
              priceCents,
              variation,
              stock: Number.isFinite(stock) ? Math.max(0, stock) : 20,
              active: p.active !== false,
              ...(itemType ? { itemType } : {}),
              imageUrl: String(p.imageUrl || '').trim(),
              approvedAsset: true,
              updatedAt: new Date().toISOString(),
            };
          });
          return {
            ok: true,
            reactiveCode: data.reactiveCode || 'CATALOG_READY',
            ...(data.warning ? { warning: data.warning } : {}),
            modelUsed: data.modelUsed || 'zai-org/GLM-5.3',
            usedFallback: Boolean(data.usedFallback),
            ...(data.detectedSegment ? { detectedSegment: data.detectedSegment } : {}),
            products: normalizedProducts,
            imageStats: data.imageStats || {
              embeddedImagesCount: 0,
              publicImageUrlsCount: 0,
              invalidImageUrlsCount: 0,
            },
          };
        }
      }
    } catch {
      // Fallback to local reactive parser if offline or unauthenticated in unit test
    }
  }

  const source = isText ? (rawText ?? '') : bytes;
  const parsed = await parseUniversalSpreadsheet(source, file.name);
  if (!parsed.sheets.length) {
    return {
      ok: false,
      reactiveCode: 'EMPTY_OR_UNREADABLE',
      error: 'Planilha vazia ou ilegível.',
      products: [],
      imageStats: { embeddedImagesCount: 0, publicImageUrlsCount: 0, invalidImageUrlsCount: 0 },
    };
  }
  const sheet = parsed.sheets[0];
  return mapSpreadsheetSheetReactive(sheet.headers, sheet.rows, sheet.imagesByRow || {});
}

export async function parseSpreadsheetProducts(file: File): Promise<CatalogProduct[]> {
  const res = await parseSpreadsheetReactive(file);
  if (!res.ok) {
    throw new Error(res.error || 'Nenhum produto válido encontrado na planilha.');
  }
  return res.products;
}
