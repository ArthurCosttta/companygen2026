/**
 * Accent-insensitive and typo-tolerant fuzzy search utilities for catalog tables and storefronts.
 */

export function normalizeSearchText(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  const s = normalizeSearchText(a);
  const t = normalizeSearchText(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = new Array<number>(t.length + 1);
  const curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    const ch = s.charCodeAt(i - 1);
    for (let j = 1; j <= t.length; j += 1) {
      const cost = ch === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

export function fuzzyMatch(query: string, target: string): boolean {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true;
  const normTarget = normalizeSearchText(target);
  if (!normTarget) return false;
  if (normTarget.includes(normQuery)) return true;

  const queryTokens = normQuery.split(' ').filter(Boolean);
  const targetWords = normTarget.split(/[\s\-_/.,;:()]+/).filter(Boolean);

  return queryTokens.every((token) => {
    if (normTarget.includes(token)) return true;
    if (token.length < 4) return false;
    return targetWords.some((word) => {
      if (Math.abs(word.length - token.length) <= 1 && levenshteinDistance(token, word) <= 1) {
        return true;
      }
      if (token.length >= 5 && word.length > token.length) {
        return levenshteinDistance(token, word.slice(0, token.length)) <= 1;
      }
      return false;
    });
  });
}

export function matchesProductQuery(
  product: {
    name?: string;
    sku?: string;
    category?: string;
    variation?: string;
    description?: string;
  },
  query: string,
): boolean {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery) return true;
  const haystack = [
    product?.name || '',
    product?.sku || '',
    product?.category || '',
    product?.variation || '',
    product?.description || '',
  ]
    .filter(Boolean)
    .join(' ');
  return fuzzyMatch(cleanQuery, haystack);
}
