import JSZip from 'jszip';
import { authenticatedFetch } from './supabase-client';
import { workspaceUser } from './local-storage';
import { normalizeSpreadsheetItemType } from '@/schemas/formula-v9.schema';
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
  entregue: 'concluido',
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

function parsePriceToCents(raw: string): number {
  const str = String(raw || '').trim();
  if (!str) return 0;
  const cleaned = str.replace(/R\$/gi, '').replace(/\s+/g, '');
  let num: number;
  if (cleaned.includes(',')) {
    num = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  } else {
    num = Number(cleaned);
  }
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function columnLettersToIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

function mapSpreadsheetRows(rows: string[][]): CatalogProduct[] {
  const nonEmptyRows = rows.filter(r => Array.isArray(r) && r.some(cell => String(cell || '').trim()));
  if (nonEmptyRows.length === 0) return [];
  const header = nonEmptyRows[0].map(h =>
    String(h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim(),
  );
  const colIdx = (...candidates: string[]) => header.findIndex(h => candidates.some(c => h.includes(c)));
  const iName = colIdx('nome', 'produto', 'name', 'titulo', 'item');
  const iSku = colIdx('sku', 'codigo', 'cod', 'ref');
  const iPrice = colIdx('preco', 'valor', 'price');
  const iStock = colIdx('estoque', 'stock', 'qtd', 'quantidade');
  const iCat = colIdx('categoria', 'category', 'grupo');
  const iTypeExact = colIdx('tipo', 'type');
  const iType = iTypeExact >= 0 ? iTypeExact : colIdx('modelo');
  const iVar = colIdx('variante', 'variacao', 'tamanho', 'modelo', 'variant');
  const iDesc = colIdx('descricao', 'description', 'detalhes', 'obs');
  const iImg = colIdx('imagem', 'foto', 'image', 'url');

  const hasHeader = iName >= 0 || iPrice >= 0 || iSku >= 0;
  const startRow = hasHeader ? 1 : 0;

  const products: CatalogProduct[] = [];
  for (let r = startRow; r < nonEmptyRows.length; r++) {
    const row = nonEmptyRows[r];
    if (!row || row.every(cell => !String(cell || '').trim())) continue;
    const name = String(iName >= 0 ? row[iName] : row[0] || '').trim();
    if (!name) continue;
    const skuRaw = String(
      iSku >= 0 ? row[iSku] : (!hasHeader ? row[1] : '') || `ITEM-${String(products.length + 1).padStart(3, '0')}`,
    ).trim();
    const sku = skuRaw.toUpperCase().replace(/[^A-Z0-9_-]/g, '-') || `ITEM-${String(products.length + 1).padStart(3, '0')}`;
    const priceCents = parsePriceToCents(String(iPrice >= 0 ? row[iPrice] : (!hasHeader ? row[2] : '0') || '0'));
    const stockNum = Number.parseInt(
      String(iStock >= 0 ? row[iStock] : (!hasHeader ? row[3] : '20') || '20').replace(/\D/g, ''),
      10,
    );
    const category = String(iCat >= 0 ? row[iCat] : (!hasHeader ? row[4] : 'Geral') || 'Geral').trim() || 'Geral';
    const variation = String(iVar >= 0 ? row[iVar] : (!hasHeader ? row[5] : 'Padrão') || 'Padrão').trim() || 'Padrão';
    const description = String(iDesc >= 0 ? row[iDesc] : '').trim();
    const imageUrl = String(iImg >= 0 ? row[iImg] : '').trim();
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
      imageUrl,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    });
  }
  return products;
}

export async function parseSpreadsheetProducts(file: File): Promise<CatalogProduct[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    const sep = text.includes(';') ? ';' : ',';
    const rows = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.split(sep).map(cell => cell.replace(/^"|"$/g, '').trim()));
    return mapSpreadsheetRows(rows);
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  const sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const doc = parser.parseFromString(await ssFile.async('string'), 'application/xml');
    for (const si of Array.from(doc.querySelectorAll('si'))) {
      sharedStrings.push(Array.from(si.querySelectorAll('t')).map(t => t.textContent || '').join(''));
    }
  }

  const sheetFiles = Object.keys(zip.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort();
  if (sheetFiles.length === 0) throw new Error('Planilha .xlsx inválida ou sem abas.');

  const firstSheet = await zip.file(sheetFiles[0])!.async('string');
  const sheetDoc = parser.parseFromString(firstSheet, 'application/xml');
  const rows: string[][] = [];

  for (const rowEl of Array.from(sheetDoc.querySelectorAll('sheetData > row'))) {
    const rowValues: string[] = [];
    for (const cEl of Array.from(rowEl.querySelectorAll('c'))) {
      const ref = cEl.getAttribute('r') || '';
      const idx = ref ? columnLettersToIndex(ref) : rowValues.length;
      const type = cEl.getAttribute('t') || '';
      let val = '';
      if (type === 'inlineStr') {
        val = cEl.querySelector('is > t')?.textContent || '';
      } else {
        const raw = cEl.querySelector('v')?.textContent || '';
        val = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw;
      }
      while (rowValues.length < idx) rowValues.push('');
      rowValues[idx] = val;
    }
    rows.push(rowValues);
  }

  return mapSpreadsheetRows(rows);
}
