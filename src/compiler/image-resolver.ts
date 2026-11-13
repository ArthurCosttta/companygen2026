import type { Asset } from './types';
import type { PostSpec, ProductSpec, SlideSpec } from '@/schemas/campaign.schema';

export function tokenize(s: string | undefined | null): string[] {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** Only same-origin relative paths, blob: and data: URLs may enter the Canvas (prevents tainting). */
export function isSafeAssetUrl(url: string, origin = typeof location !== 'undefined' ? location.origin : 'http://localhost'): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:image/')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  }
  return !url.startsWith('//');
}

export interface ResolveInput {
  slide: SlideSpec;
  slideIndex: number;
  post: PostSpec;
  products: ProductSpec[];
  assets: Asset[];
  campaignId: string;
  /** assets already chosen by previous slides of the same post */
  usedInPost: Set<string>;
}

export interface ResolveResult {
  asset: Asset | null;
  reason: 'explicit' | 'product' | 'query' | 'fallback' | 'missing';
  missingExplicitId?: string;
}

/**
 * Deterministic asset resolution: explicit id → product image → best tag/query match.
 * Ties are broken by asset_id so the same spec + library always yields the same choice.
 */
export function resolveAsset(input: ResolveInput): ResolveResult {
  const { slide, post, products, assets } = input;
  const byId = new Map(assets.map((a) => [a.asset_id, a]));
  if (slide.image_asset_id) {
    const a = byId.get(slide.image_asset_id);
    if (a) return { asset: a, reason: 'explicit' };
    return { asset: null, reason: 'missing', missingExplicitId: slide.image_asset_id };
  }
  if (slide.template === 'product_focus') {
    const product = products.find((p) => post.product_ids.includes(p.id) && p.image_asset_id && byId.has(p.image_asset_id));
    if (product?.image_asset_id) return { asset: byId.get(product.image_asset_id)!, reason: 'product' };
  }
  if (!assets.length) return { asset: null, reason: 'missing' };
  const qTokens = tokenize(slide.image_query || post.title);
  const qSet = new Set(qTokens);
  let best: Asset | null = null;
  let bestScore = -Infinity;
  const sorted = [...assets].sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  for (const a of sorted) {
    let score = 0;
    const tags = new Set([...a.tags.flatMap((t) => tokenize(t)), ...tokenize(a.query)]);
    for (const t of qSet) if (tags.has(t)) score += 1;
    if (a.query && slide.image_query && a.query.toLowerCase() === slide.image_query.toLowerCase()) score += 2.5;
    if (a.collection && a.collection === input.campaignId) score += 3;
    if (a.provider === 'upload') score += 0.5;
    if (input.usedInPost.has(a.asset_id)) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return { asset: best, reason: bestScore > 0 ? 'query' : 'fallback' };
}
