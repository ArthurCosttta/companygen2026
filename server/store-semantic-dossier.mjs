import { computeStoreIdentityId } from './storefront-experience-matrix.mjs';
import { classifyBusinessArchetype } from '../shared/formula-ir/spreadsheet-intelligence.mjs';

/**
 * Compila a Ficha de Conceito Enriquecida (Concept Sheet + Dossiê Semântico) cruzando:
 * 1) Identidade, voz da marca, cidade, horários e paleta
 * 2) Produto Carro-Chefe (Flagship Hero SKU) + distribuição real de categorias
 * 3) Persona do comprador, principal objeção e gatilho de decisão
 * 4) Meta mensal de growth + 4 ganchos semanais de conteúdo para o calendário
 * 5) Multiplicadores visuais do onboarding (heroLayout, showcaseLayout, gridDensity)
 */
export function buildArchitectInputPacket(profile = {}) {
  const business = profile?.business || {};
  const brand = profile?.brand || {};
  const concept = profile?.marketingConcept || {};
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];
  const inferredArchetype = classifyBusinessArchetype({
    segment: String(business.segment || '').trim(),
    storeName: String(business.name || '').trim(),
    products,
  });
  const resolvedSegment =
    products.length > 0 && inferredArchetype.archetype !== 'varejo_geral'
      ? inferredArchetype.nicheLabel
      : String(business.segment || inferredArchetype.nicheLabel || '').trim();

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
        ? `R$ ${((c.minCents === Infinity ? 0 : c.minCents) / 100).toFixed(2)}–R$ ${(c.maxCents / 100).toFixed(2)}`
        : 'Sob consulta',
    sampleSkus: c.sampleSkus,
  }));

  const storeIdentityId =
    brand.storeIdentityId ||
    computeStoreIdentityId({
      slug: profile?.publishedStore?.slug || business.name || '',
      niche: resolvedSegment,
      name: business.name || '',
    });

  const buyingMode =
    categories.length >= 3 || products.length >= 10
      ? 'multi_category_retail'
      : business.businessModel === 'servicos'
        ? 'local_service'
        : 'boutique_curation';

  // Pick flagship hero product (explicit user choice first, or best-illustrated SKU)
  const flagshipRaw =
    products.find((p) => concept.coreProductSku && String(p.sku || p.id).toUpperCase() === String(concept.coreProductSku).toUpperCase()) ||
    products.find((p) => p.imageUrl && !String(p.imageUrl).startsWith('data:image/svg')) ||
    products[0] ||
    null;

  const flagshipProduct = flagshipRaw
    ? {
        sku: String(flagshipRaw.sku || flagshipRaw.id || ''),
        name: String(flagshipRaw.name || ''),
        category: String(flagshipRaw.category || 'Destaque'),
        priceCents: Math.max(0, Number(flagshipRaw.priceCents || 0)),
        priceBRL: flagshipRaw.priceCents > 0 ? `R$ ${(Number(flagshipRaw.priceCents) / 100).toFixed(2)}` : 'Sob consulta',
        hasImage: Boolean(flagshipRaw.imageUrl && !String(flagshipRaw.imageUrl).startsWith('data:image/svg')),
        highlightReason: concept.coreProductSku
          ? 'Carro-chefe definido pelo lojista'
          : 'Principal produto com maior destaque visual',
      }
    : null;

  const isConsultive = /servi|saúde|advoc|clínic|nutri|estétic/i.test(resolvedSegment);
  const brandVoice =
    concept.brandVoice ||
    (isConsultive ? 'consultive_prestige' : buyingMode === 'boutique_curation' ? 'warm_artisan' : 'editorial_minimal');
  const pixDiscountPercent = Math.max(0, Number(profile?.payment?.pixDiscountPercent || 0));
  const storeName = String(business.name || 'Minha Loja').trim();

  const defaultHooks = [
    {
      week: 1,
      theme: 'Apresentação do Carro-Chefe',
      hook: flagshipProduct
        ? `Por que "${flagshipProduct.name}" é o item mais pedido em ${storeName}`
        : `Conheça os destaques da semana em ${storeName}`,
      ctaAction: 'Abrir catálogo no link da bio',
    },
    {
      week: 2,
      theme: 'Curadoria & Bastidores',
      hook: `Como preparamos cada pedido de ${categories[0]?.name || 'nossa linha'} antes do envio`,
      ctaAction: 'Chamar no WhatsApp para tirar dúvidas',
    },
    {
      week: 3,
      theme: 'Comparativo & Combinação',
      hook: `Qual opção escolher? Guia rápido entre ${categories.slice(0, 2).map((c) => c.name).join(' e ') || 'nossos modelos'}`,
      ctaAction: 'Montar sacola na vitrine',
    },
    {
      week: 4,
      theme: 'Condição Direta no Pix',
      hook:
        pixDiscountPercent > 0
          ? `Fechamento expresso com ${pixDiscountPercent}% de desconto no Pix direto pelo catálogo`
          : `Pedido confirmado em segundos direto pelo WhatsApp de ${storeName}`,
      ctaAction: 'Finalizar pedido no Pix',
    },
  ];

  const monthlyCalendarHooks =
    Array.isArray(concept.monthlyHooks) && concept.monthlyHooks.length >= 2
      ? concept.monthlyHooks
      : defaultHooks;

  return {
    storeIdentityId,
    brand: {
      name: storeName,
      segment: resolvedSegment,
      bio: String(business.description || '').trim().slice(0, 280),
      city: String(business.city || business.address || '').trim(),
      hours: String(business.hours || '').trim(),
      instagramHandle: String(brand.instagram || '').trim(),
      hasLogo: Boolean(brand.logoUrl),
      brandVoice,
      logoColorsHex: [
        String(brand.primaryColor || '#111827'),
        String(brand.accentColor || '#0B4DB8'),
      ],
      pixDiscountPercent,
    },
    targetAudience: {
      buyerPersona: String(concept.buyerPersona || `Clientes de ${resolvedSegment || 'comércio local'} que buscam compra ágil sem atrito`).trim(),
      mainObjection: String(concept.mainObjection || 'Dúvida sobre disponibilidade imediata, prazo e confiança na compra').trim(),
      buyingTrigger: String(
        concept.buyingTrigger ||
          (pixDiscountPercent > 0
            ? `Desconto de ${pixDiscountPercent}% no Pix e atendimento humano rápido`
            : 'Catálogo transparente com pedido direto no WhatsApp'),
      ).trim(),
    },
    flagshipProduct,
    growthStrategy: {
      monthlyGoal: String(concept.growthGoal || (isConsultive ? 'lead_booking' : 'fast_pix_turnover')),
      experienceGoal: String(business.experienceGoal || '').trim(),
      campaignTheme: String(business.campaignTheme || '').trim(),
      differentials: Array.isArray(business.differentials) ? business.differentials : [],
      tupleMultipliers: {
        heroLayout: String(concept.heroLayout || 'hero_stage'),
        showcaseLayout: String(concept.showcaseLayout || 'bento_spotlight'),
        gridDensity: String(concept.gridDensity || '3'),
      },
    },
    monthlyCalendarHooks,
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
