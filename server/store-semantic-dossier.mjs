import { computeStoreIdentityId } from './storefront-experience-matrix.mjs';

/**
 * Compila um dossiê semântico compacto (~350-450 tokens) cruzando:
 * 1) Identidade + Bio + Cidade + Horários do Instagram
 * 2) Distribuição % de TODAS as categorias do catálogo + faixa de preço + top SKUs com foto
 * 3) Arquétipo de compra e cores da logo
 */
export function buildArchitectInputPacket(profile = {}) {
  const business = profile?.business || {};
  const brand = profile?.brand || {};
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];

  const catMap = new Map();
  let minPriceCents = Infinity;
  let maxPriceCents = 0;

  for (const p of products) {
    const cat = String(p.category || 'Geral').trim() || 'Geral';
    const priceCents = Math.max(0, Number(p.priceCents || 0));
    if (priceCents > 0) {
      minPriceCents = Math.min(minPriceCents, priceCents);
      maxPriceCents = Math.max(maxPriceCents, priceCents);
    }
    const cur = catMap.get(cat) || {
      name: cat,
      count: 0,
      minCents: Infinity,
      maxCents: 0,
      sampleSkus: [],
    };
    cur.count += 1;
    if (priceCents > 0) {
      cur.minCents = Math.min(cur.minCents, priceCents);
      cur.maxCents = Math.max(cur.maxCents, priceCents);
    }
    if (cur.sampleSkus.length < 3) {
      cur.sampleSkus.push({
        sku: String(p.sku || p.id || ''),
        name: String(p.name || ''),
        variation: String(p.variation || ''),
        priceBRL: `R$ ${(priceCents / 100).toFixed(2)}`,
        hasImage: Boolean(p.imageUrl && !String(p.imageUrl).startsWith('data:image/svg')),
      });
    }
    catMap.set(cat, cur);
  }

  const categories = Array.from(catMap.values()).map((c) => ({
    name: c.name,
    count: c.count,
    sharePct: products.length > 0 ? Math.round((c.count / products.length) * 100) : 0,
    priceRange:
      c.maxCents > 0
        ? `R$ ${( (c.minCents === Infinity ? 0 : c.minCents) / 100 ).toFixed(2)}–R$ ${(c.maxCents / 100).toFixed(2)}`
        : 'Sob consulta',
    sampleSkus: c.sampleSkus,
  }));

  const storeIdentityId =
    brand.storeIdentityId ||
    computeStoreIdentityId({
      slug: profile?.publishedStore?.slug || business.name || '',
      niche: business.segment || '',
      name: business.name || '',
    });

  const buyingMode =
    categories.length >= 3 || products.length >= 10
      ? 'multi_category_retail'
      : business.businessModel === 'servicos'
        ? 'local_service'
        : 'boutique_curation';

  return {
    storeIdentityId,
    brand: {
      name: String(business.name || 'Minha Loja').trim(),
      segment: String(business.segment || '').trim(),
      bio: String(business.description || '').trim().slice(0, 280),
      city: String(business.city || business.address || '').trim(),
      hours: String(business.hours || '').trim(),
      instagramHandle: String(brand.instagram || '').trim(),
      hasLogo: Boolean(brand.logoUrl),
      logoColorsHex: [
        String(brand.primaryColor || '#111827'),
        String(brand.accentColor || '#0B4DB8'),
      ],
      pixDiscountPercent: Math.max(0, Number(profile?.payment?.pixDiscountPercent || 0)),
    },
    catalogSummary: {
      totalSkus: products.length,
      buyingMode,
      globalPriceRange:
        maxPriceCents > 0
          ? `R$ ${((minPriceCents === Infinity ? 0 : minPriceCents) / 100).toFixed(2)}–R$ ${(maxPriceCents / 100).toFixed(2)}`
          : 'Sob consulta',
      categories,
    },
  };
}
