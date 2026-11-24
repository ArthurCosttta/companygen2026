import type {
  BusinessProfile,
  CatalogProduct,
  DashboardMetricsProjection,
} from '@/schemas/profile.schema';

export type EditorialCatalogFilter = 'active' | 'paused' | 'all';

export const EDITORIAL_COMMAND_IDS = {
  SEARCH: 'catalog.search',
  CREATE_PRODUCT: 'catalog.create',
  IMPORT_XLSX: 'catalog.importXlsx',
  CYCLE_FILTER: 'catalog.cycleFilter',
  OPEN_VITRINE: 'store.openPreview',
  OPEN_STUDIO: 'store.openStudio',
  NAV_WHATSAPP: 'nav.whatsapp',
  NAV_ORDERS: 'nav.orders',
  NAV_SETTINGS: 'nav.settings',
  OPEN_CHECKOUT: 'account.checkout',
  REDO_ONBOARDING: 'account.redoOnboarding',
  OPEN_ADMIN: 'account.admin',
  LOGOUT: 'account.logout',
} as const;

export type EditorialCommandId =
  (typeof EDITORIAL_COMMAND_IDS)[keyof typeof EDITORIAL_COMMAND_IDS];

export interface EditorialStoreMetrics {
  visitsTotal: number;
  clicksTotal: number;
  ordersCount: number;
  activeProductsCount: number;
  pausedProductsCount: number;
  totalProductsCount: number;
}

export function deriveEditorialMetrics(
  profile: BusinessProfile | null | undefined,
  dashboard: DashboardMetricsProjection | null | undefined,
): EditorialStoreMetrics {
  const products = Array.isArray(profile?.catalog?.products)
    ? profile!.catalog!.products
    : [];
  const activeProductsCount = products.filter((p) => p && p.active !== false).length;
  const pausedProductsCount = products.filter((p) => p && p.active === false).length;

  const ordersCount = Number.isFinite(dashboard?.ordersCount)
    ? Math.max(0, Number(dashboard!.ordersCount))
    : Array.isArray(dashboard?.recentOrders)
      ? dashboard!.recentOrders.length
      : 0;

  return {
    visitsTotal: Math.max(0, Number(dashboard?.visitsTotal ?? 0) || 0),
    clicksTotal: Math.max(0, Number(dashboard?.messagesCount ?? 0) || 0),
    ordersCount,
    activeProductsCount,
    pausedProductsCount,
    totalProductsCount: products.length,
  };
}

export function normalizeEditorialText(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedEditDistanceOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < a.length && j < b.length) {
    if (a.charCodeAt(i) === b.charCodeAt(j)) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (
      a.length === b.length &&
      i + 1 < a.length &&
      a.charCodeAt(i) === b.charCodeAt(j + 1) &&
      a.charCodeAt(i + 1) === b.charCodeAt(j)
    ) {
      i += 2;
      j += 2;
    } else if (a.length > b.length) {
      i += 1;
    } else if (b.length > a.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function isOrderedSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi += 1) {
    if (haystack.charCodeAt(hi) === needle.charCodeAt(ni)) {
      ni += 1;
    }
  }
  return ni === needle.length;
}

/**
 * Accent-insensitive token, subsequence and 1-typo fuzzy matching budgeted under 16ms.
 */
export function fuzzySubsequenceMatch(query: string, target: string): boolean {
  const normQuery = normalizeEditorialText(query);
  if (!normQuery) return true;
  const normTarget = normalizeEditorialText(target);
  if (!normTarget) return false;
  if (normTarget.includes(normQuery)) return true;

  const queryTokens = normQuery.split(' ').filter(Boolean);
  const targetWords = normTarget.split(/[\s\-_/.,;:()]+/).filter(Boolean);

  return queryTokens.every((token) => {
    if (normTarget.includes(token)) return true;
    if (token.length >= 3 && isOrderedSubsequence(token, normTarget.replace(/\s+/g, ''))) {
      return true;
    }
    if (token.length < 4) return false;
    return targetWords.some((word) => {
      if (boundedEditDistanceOne(token, word)) return true;
      if (word.length > token.length) {
        return boundedEditDistanceOne(token, word.slice(0, token.length));
      }
      return false;
    });
  });
}

function formatPriceDigitsForSearch(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const brl = (safe / 100).toFixed(2).replace('.', ',');
  const integer = String(Math.floor(safe / 100));
  return `${brl} ${integer}`;
}

export function filterEditorialProducts(
  products: CatalogProduct[],
  filter: EditorialCatalogFilter,
  query: string,
): CatalogProduct[] {
  const list = Array.isArray(products) ? products : [];
  const byStatus = list.filter((p) => {
    if (!p) return false;
    if (filter === 'active') return p.active !== false;
    if (filter === 'paused') return p.active === false;
    return true;
  });

  const cleanQuery = normalizeEditorialText(query);
  if (!cleanQuery) return byStatus;

  return byStatus.filter((p) => {
    const haystack = [
      p.name || '',
      p.sku || '',
      p.category || '',
      p.variation || '',
      formatPriceDigitsForSearch(p.priceCents),
    ]
      .filter(Boolean)
      .join(' ');
    return fuzzySubsequenceMatch(cleanQuery, haystack);
  });
}

export function nextEditorialFilter(
  current: EditorialCatalogFilter,
): EditorialCatalogFilter {
  if (current === 'active') return 'paused';
  if (current === 'paused') return 'all';
  return 'active';
}
