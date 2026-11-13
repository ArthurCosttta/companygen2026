import JSZip from 'jszip';
import { authenticatedFetch } from './supabase-client';
import { workspaceUser } from './local-storage';
import {
  BusinessProfileSchema,
  createEmptyProfile,
  type BusinessOrder,
  type BusinessProfile,
  type CatalogProduct,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';

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

export async function loadDashboardMetrics(owner = workspaceUser()): Promise<DashboardMetricsProjection> {
  const response = await authenticatedFetch('/api/dashboard', undefined, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(raw.error || 'Não foi possível carregar o dashboard.');
  return raw.dashboard;
}

export async function loadOrders(owner = workspaceUser()): Promise<BusinessOrder[]> {
  const response = await authenticatedFetch('/api/orders', undefined, owner);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(raw.error || 'Não foi possível listar pedidos.');
  return Array.isArray(raw.orders) ? raw.orders : [];
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
  if (rows.length === 0) return [];
  const header = rows[0].map(h =>
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
  const iVar = colIdx('variacao', 'tamanho', 'modelo', 'variant');
  const iDesc = colIdx('descricao', 'description', 'detalhes', 'obs');
  const iImg = colIdx('imagem', 'foto', 'image', 'url');

  const hasHeader = iName >= 0 || iPrice >= 0 || iSku >= 0;
  const startRow = hasHeader ? 1 : 0;

  const products: CatalogProduct[] = [];
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(cell => !String(cell || '').trim())) continue;
    const name = String(iName >= 0 ? row[iName] : row[0] || '').trim();
    if (!name) continue;
    const skuRaw = String(iSku >= 0 ? row[iSku] : row[1] || `SKU-${products.length + 1}`).trim();
    const sku = skuRaw.toUpperCase().replace(/[^A-Z0-9_-]/g, '-') || `SKU-${products.length + 1}`;
    const priceCents = parsePriceToCents(String(iPrice >= 0 ? row[iPrice] : row[2] || '0'));
    const stockNum = Number.parseInt(String(iStock >= 0 ? row[iStock] : row[3] || '10').replace(/\D/g, ''), 10);
    const category = String(iCat >= 0 ? row[iCat] : row[4] || 'Geral').trim() || 'Geral';
    const variation = String(iVar >= 0 ? row[iVar] : row[5] || 'Padrão').trim() || 'Padrão';
    const description = String(iDesc >= 0 ? row[iDesc] : '').trim();
    const imageUrl = String(iImg >= 0 ? row[iImg] : '').trim();

    products.push({
      id: `${sku.toLowerCase()}-${products.length + 1}`,
      sku,
      name,
      category,
      description,
      priceCents,
      variation,
      stock: Number.isFinite(stockNum) ? Math.max(0, stockNum) : 10,
      active: true,
      imageUrl,
      approvedAsset: Boolean(imageUrl),
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
