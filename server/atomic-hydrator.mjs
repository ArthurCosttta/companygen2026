import {
  AtomicBlueprintSchema,
  parseAtomSpec,
  resolveSectionSurfaceTokens,
} from '../shared/formula-ir/atomic-grammar.mjs';
import { deriveOklchPaletteSystem } from '../shared/formula-ir/visual-math-engine.mjs';

/**
 * Hidrata e valida deterministicamente o Blueprint atômico v4:
 * 1) Valida no Zod (AtomicBlueprintSchema)
 * 2) Deriva paletteSystem perceptual (OKLCH) para ground creme/linho, âncora escura e acentos acessíveis
 * 3) Injeta URLs reais geradas por slotId + categoryImages (com blindagem anti-imagem quebrada)
 * 4) Hidrata produtos reais do catálogo (<forbid_ai_rename>)
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

  const primaryHex = parsed.data.brandTokens.colors.primary || profile?.brand?.primaryColor || '#1E293B';
  const accentHex = parsed.data.brandTokens.colors.accent || profile?.brand?.accentColor || '#D8A848';
  const groundMode = parsed.data.engineSeed?.groundMode || 'warm_linen';
  const paletteSystem = deriveOklchPaletteSystem({
    brandHex: primaryHex,
    accentHex,
    groundMode,
  });

  const categoryImages = {};
  for (const req of parsed.data.imageRequests || []) {
    const slotUrl = req?.slotId && generatedImagesBySlot[req.slotId] ? String(generatedImagesBySlot[req.slotId]) : '';
    if (!slotUrl) continue;
    const catHint = String(req?.targetSectionId || '').replace(/^cat:/i, '').trim();
    if (catHint && !catHint.startsWith('sec_')) {
      categoryImages[catHint.toLowerCase()] = slotUrl;
    }
  }
  const realCategories = Array.from(
    new Set(realProducts.map((p) => String(p.category || 'Geral').trim() || 'Geral')),
  );
  realCategories.forEach((cat, idx) => {
    const slotCandidate = generatedImagesBySlot[`img_cat_${idx + 1}`];
    if (slotCandidate && !categoryImages[cat.toLowerCase()]) {
      categoryImages[cat.toLowerCase()] = String(slotCandidate);
    }
    // Se categoria nao tem foto gerada, aproveita foto real de produto da categoria se houver (nunca SVG placeholder)
    if (!categoryImages[cat.toLowerCase()]) {
      const catProdWithImg = realProducts.find(
        (p) =>
          String(p.category || 'Geral').trim().toLowerCase() === cat.toLowerCase() &&
          typeof p.imageUrl === 'string' &&
          p.imageUrl.trim() &&
          !/^data:image\/svg\+xml/i.test(p.imageUrl.trim()),
      );
      if (catProdWithImg) {
        categoryImages[cat.toLowerCase()] = String(catProdWithImg.imageUrl).trim();
      }
    }
  });

  let prevIsDark = null;
  const hydratedSections = parsed.data.sections.map((sec, idx) => {
    const role = String(sec.tuple?.[1] || '');
    const rawSurface = String(sec.surface || '');
    // Secoes de hero/banner/footer podem ser anchor_dark; workbench, portals e catalog ficam no chao claro/linho
    const lightRoles = new Set(['domain_workbench', 'coupled_media_grid', 'split_curtain_portals', 'catalog_full_grid', 'open_columns_strip', 'split_story']);
    let effectiveSurface = rawSurface;
    if (lightRoles.has(role) && !rawSurface.includes('bg=')) {
      effectiveSurface = `ui:bg=ground lum=0.97 | ${rawSurface}`;
    } else if (role === 'hero_stage' && !rawSurface.includes('lum=')) {
      effectiveSurface = `ui:bg=anchor_dark lum=0.18 | ${rawSurface}`;
    }

    const surfaceTokens = resolveSectionSurfaceTokens({
      primaryHex,
      accentHex,
      surfaceStr: effectiveSurface,
      sectionIndex: idx,
      prevIsDark,
      groundMode,
    });
    if (role !== 'kinetic_ribbon' && role !== 'open_columns_strip') {
      prevIsDark = surfaceTokens.isDark;
    }

    const mediaSpec = parseAtomSpec(sec.media);
    const slotTag = mediaSpec.directives.find((d) => d.startsWith('slot:'));
    const slotId = slotTag ? slotTag.slice(5) : mediaSpec.params.slot || '';
    const resolvedImageUrl = slotId && generatedImagesBySlot[slotId] ? String(generatedImagesBySlot[slotId]) : '';

    const catalogSpec = parseAtomSpec(sec.catalog);
    const mode = catalogSpec.params.mode || 'none';
    const take = Math.max(0, Math.min(60, Number(catalogSpec.params.take || 30) || 30));
    const perCat = Math.max(1, Math.min(20, Number(catalogSpec.params.per_cat || 4) || 4));
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
      surface: effectiveSurface,
      surfaceTokens,
      resolvedMedia: {
        slotId,
        imageUrl: resolvedImageUrl,
        categoryImages,
        allGeneratedSlots: generatedImagesBySlot,
      },
      boundProducts,
    };
  });

  return {
    ok: true,
    data: {
      ...parsed.data,
      paletteSystem,
      sections: hydratedSections,
    },
  };
}
