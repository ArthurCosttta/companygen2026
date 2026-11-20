import {
  AtomicBlueprintSchema,
  parseAtomSpec,
  resolveSectionSurfaceTokens,
} from '../shared/formula-ir/atomic-grammar.mjs';

/**
 * Hidrata e valida deterministicamente o Blueprint atômico retornado pelo GLM:
 * 1) Valida no Zod (AtomicBlueprintSchema)
 * 2) Injeta URLs geradas por slotId nos MediaAtoms
 * 3) Hidrata produtos reais do catálogo (forbid_ai_rename: nunca aceita preço/nome inventado)
 * 4) Calcula tokens de superfície alternados com contraste WCAG >= 4.5:1
 */
export function hydrateAndValidateBlueprint({ blueprint, profile = {}, generatedImagesBySlot = {} }) {
  const parsed = AtomicBlueprintSchema.safeParse(blueprint);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, data: null };
  }

  const realProducts = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];
  const bySku = new Map(realProducts.map((p) => [String(p.sku || p.id || '').toUpperCase(), p]));

  const primaryHex = parsed.data.brandTokens.colors.primary || profile?.brand?.primaryColor || '#111827';
  const accentHex = parsed.data.brandTokens.colors.accent || profile?.brand?.accentColor || '#0B4DB8';

  let prevIsDark = null;
  const hydratedSections = parsed.data.sections.map((sec, idx) => {
    const surfaceTokens = resolveSectionSurfaceTokens({
      primaryHex,
      accentHex,
      surfaceStr: sec.surface,
      sectionIndex: idx,
      prevIsDark,
    });
    prevIsDark = surfaceTokens.isDark;

    const mediaSpec = parseAtomSpec(sec.media);
    const slotTag = mediaSpec.directives.find((d) => d.startsWith('slot:'));
    const slotId = slotTag ? slotTag.slice(5) : mediaSpec.params.slot || '';
    const resolvedImageUrl = slotId && generatedImagesBySlot[slotId] ? String(generatedImagesBySlot[slotId]) : '';

    const catalogSpec = parseAtomSpec(sec.catalog);
    const mode = catalogSpec.params.mode || 'none';
    const take = Math.max(0, Math.min(60, Number(catalogSpec.params.take || 8) || 8));
    const perCat = Math.max(1, Math.min(20, Number(catalogSpec.params.per_cat || 2) || 2));
    const maxPrice = catalogSpec.params.max_p ? Number(catalogSpec.params.max_p) : Infinity;

    let boundProducts = [];
    if (mode === 'by_skus' && Array.isArray(sec.content?.skus)) {
      boundProducts = sec.content.skus
        .map((s) => bySku.get(String(s).toUpperCase()))
        .filter(Boolean);
    } else if (mode === 'top_per_category') {
      const counts = new Map();
      for (const p of realProducts) {
        const cat = String(p.category || 'Geral');
        const c = counts.get(cat) || 0;
        if (c < perCat && Number(p.priceCents || 0) <= maxPrice) {
          boundProducts.push(p);
          counts.set(cat, c + 1);
        }
        if (boundProducts.length >= take) break;
      }
    } else if (mode === 'full_searchable_grid') {
      boundProducts = realProducts.slice(0, take);
    }

    return {
      ...sec,
      surfaceTokens,
      resolvedMedia: {
        slotId,
        imageUrl: resolvedImageUrl,
      },
      boundProducts,
    };
  });

  return {
    ok: true,
    data: {
      ...parsed.data,
      sections: hydratedSections,
    },
  };
}
