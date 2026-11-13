import type {
  Asset,
  AssetRole,
  Category,
  Overlays,
  Product,
  ProjectSpecV2,
  Screens,
  Section,
  SiteIR,
  StoreRules,
  Theme,
  WhatsAppConfig
} from './types';

export const DUMMY_PHONE = '55' + '0'.repeat(11);

export const slugify = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'produto';

export const mapKindToRole = (kind?: string): AssetRole => {
  if (!kind) return 'product_cutout';
  const k = kind.toLowerCase();
  if (k.includes('logo')) return 'brand_logo';
  if (k.includes('portrait')) return 'portrait';
  if (k.includes('hero') || k.includes('full_scene') || k.includes('scene')) return 'full_scene';
  if (k.includes('category') || k.includes('tile')) return 'category_tile';
  if (k.includes('service')) return 'service_photo';
  if (k.includes('icon')) return 'icon';
  if (k.includes('cutout') || k.includes('product')) return 'product_cutout';
  return 'decorative';
};

/**
 * Migra qualquer JSON 1.0.0 ou 1.1.0 (ou já 2.0.0) para ProjectSpecV2 em memória,
 * garantindo compatibilidade sem alterar o arquivo original no disco.
 */
export function migrateToV2(raw: Record<string, unknown>): {
  spec: ProjectSpecV2;
  notes: string[];
  originalVersion: string;
} {
  const originalVersion = String(raw.schemaVersion || '1.0.0');
  const notes: string[] = [];

  // Se já for V2 íntegro
  if (originalVersion === '2.0.0' && raw.screens && raw.overlays && raw.catalog) {
    return {
      spec: raw as unknown as ProjectSpecV2,
      notes: ['JSON já em especificação ProjectSpec 2.0.0.'],
      originalVersion: '2.0.0'
    };
  }

  const business = (raw.business || {
    name: 'Loja',
    description: '',
    address: { city: '', state: '' }
  }) as ProjectSpecV2['business'];

  const rawTheme = (raw.theme || {}) as Record<string, unknown>;
  const theme: Theme = {
    primary: String(rawTheme.primary || '#0B319A'),
    accent: String(rawTheme.accent || '#FF8754'),
    background: String(rawTheme.background || '#FFF9F1'),
    text: String(rawTheme.text || '#071843'),
    radius: typeof rawTheme.radius === 'number' ? rawTheme.radius : 16,
    fontFamily: (rawTheme.fontFamily as 'sans' | 'serif') || 'sans'
  };

  const tokens = (rawTheme.tokens as Theme['tokens']) || {
    'color.primary': rawTheme.primary || '#0B319A',
    'color.accent': rawTheme.accent || '#FF8754',
    'color.surface': rawTheme.background || '#FFF9F1',
    'color.ink': rawTheme.text || '#071843',
    'space.unitPx': 4,
    'radius.cardPx': rawTheme.radius || 16
  };
  Object.defineProperty(theme, 'tokens', { value: tokens, enumerable: false, writable: true });

  const categories = ((raw.categories as Category[]) || []).map(c => ({
    id: c.id,
    name: c.name,
    assetId: c.assetId
  }));

  const rawProducts = ((raw.products || (raw.catalog as any)?.products) as Product[]) || [];
  const products: Product[] = rawProducts.map(p => {
    const item: Product = {
      sku: p.sku,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      priceCents: p.priceCents,
      stock: p.stock,
      attributes: p.attributes,
      whatsappTemplateId: p.whatsappTemplateId,
      genes: p.genes,
      responsive: p.responsive,
      media: (p.media || []).map((m: any) =>
        typeof m === 'string' ? { assetId: m, kind: 'product.cutout', status: 'ready' } : m
      ),
      variants: p.variants
    };
    const sl = p.slug || slugify(p.name || p.sku);
    Object.defineProperty(item, 'slug', { value: sl, enumerable: false, writable: true });
    return item;
  });

  const rawAssets = (raw.assets as Asset[]) || [];
  const assets: Asset[] = rawAssets.map(a => {
    const item: Asset = {
      assetId: a.assetId,
      kind: a.kind || 'product.cutout',
      ownerRef: a.ownerRef || a.assetId,
      ratio: a.ratio || (a.width && a.height ? `${a.width}:${a.height}` : '1:1'),
      status: a.status || (a.url ? 'ready' : 'needs_asset'),
      url: a.url,
      path: a.path,
      alt: a.alt || a.assetId,
      sourceUrl: a.sourceUrl,
      license: a.license,
      creator: a.creator,
      approved: a.approved
    };
    const r = a.role || mapKindToRole(a.kind);
    const cr = a.cropApproval ?? (r === 'full_scene' ? false : true);
    const fp = a.focalPoint || { x: 0.5, y: 0.5 };
    const sa = a.safeArea ?? (r === 'full_scene' ? 0.12 : 0);
    const w = a.width || 1024;
    const h = a.height || 1024;
    Object.defineProperty(item, 'role', { value: r, enumerable: false, writable: true });
    Object.defineProperty(item, 'cropApproval', { value: cr, enumerable: false, writable: true });
    Object.defineProperty(item, 'focalPoint', { value: fp, enumerable: false, writable: true });
    Object.defineProperty(item, 'safeArea', { value: sa, enumerable: false, writable: true });
    Object.defineProperty(item, 'mobileAssetRef', { value: a.mobileAssetRef, enumerable: false, writable: true });
    Object.defineProperty(item, 'width', { value: w, enumerable: false, writable: true });
    Object.defineProperty(item, 'height', { value: h, enumerable: false, writable: true });
    return item;
  });

  // Separar seções:
  const rawSections: Section[] =
    ((raw.layout as any)?.sections || (raw.screens as any)?.home?.sections || []) as Section[];

  const homeSections = rawSections.filter(s => s.type !== 'cart');
  if (rawSections.length !== homeSections.length) {
    notes.push('Seção cart movida da home pública para overlay modal CartDialog.');
  }

  const screens: Screens = {
    home: {
      route: '/',
      sections: homeSections
    },
    product: {
      route: '/produto/:slug',
      proteinId: 'ProductDetail',
      dataSource: 'catalog.products'
    }
  };

  const overlays: Overlays = {
    cart: {
      proteinId: 'CartDialog',
      mode: 'modal',
      maxWidthPx: 640,
      maxHeightDvh: 90,
      steps: ['cart', 'review']
    },
    search: {
      proteinId: 'SearchResults',
      debounceMs: 150,
      maxResults: 8,
      fields: ['name', 'category', 'sku']
    }
  };

  const rawPrompts = (raw.prompts as ProjectSpecV2['prompts']) || { assets: [] };
  const rawMessages = (raw.messages as ProjectSpecV2['messages']) || { templates: [] };
  const rawWhatsapp = (raw.whatsapp as WhatsAppConfig) || {
    phoneE164: DUMMY_PHONE,
    demoMode: true,
    checkoutTemplateId: 'cart-checkout'
  };

  const rawRules = (raw.rules as StoreRules) || {
    currency: 'BRL',
    quantityStep: 1,
    maxPerItem: 20,
    checkoutMode: 'whatsapp_link',
    shippingCents: 0,
    discountCents: 0
  };

  const spec: ProjectSpecV2 = {
    schemaVersion: '2.0.0',
    project: {
      id: slugify(business.name),
      mode: 'editor'
    },
    business,
    theme,
    catalog: {
      categories,
      products
    },
    assets,
    prompts: rawPrompts,
    componentPresets: {
      'recommendationCard.standard': {
        proteinId: 'RecommendationCard',
        proteinVersion: 2,
        genes: {
          'card.minWidthPx': 220,
          'media.fit': 'contain',
          'media.maxBlockPx': 132,
          'content.titleMaxLines': 2,
          'content.priceNoWrap': true,
          'actions.layout': 'sideBySide',
          'actions.primary': 'product.open',
          'actions.secondary': 'cart.add',
          'motion.enter': 'subtleFade',
          'motion.pressMs': 120,
          'motion.successMs': 200,
          'motion.routeMs': 260
        },
        variants: [
          { containerMinPx: 160, name: 'listCompact' },
          { containerMinPx: 220, name: 'standard' },
          { containerMinPx: 360, name: 'detailed' }
        ]
      },
      'productCard.standard': {
        proteinId: 'ProductCard',
        proteinVersion: 2,
        genes: {
          'card.minWidthPx': 220,
          'media.fit': 'contain',
          'content.titleMaxLines': 2,
          'content.priceNoWrap': true,
          'actions.layout': 'sideBySide'
        },
        variants: [
          { containerMinPx: 160, name: 'compact' },
          { containerMinPx: 240, name: 'standard' },
          { containerMinPx: 360, name: 'detailed' }
        ]
      }
    },
    screens,
    overlays,
    flows: [
      {
        source: 'header.search',
        actionId: 'search.selectProduct',
        target: 'screens.product'
      },
      {
        source: 'header.cart',
        actionId: 'cart.open',
        target: 'overlays.cart'
      },
      {
        source: 'card.open',
        actionId: 'product.open',
        target: 'screens.product'
      },
      {
        source: 'card.add',
        actionId: 'cart.add',
        target: 'overlays.cart'
      }
    ],
    messages: rawMessages,
    whatsapp: rawWhatsapp,
    rules: rawRules,
    publication: {
      target: rawWhatsapp.phoneE164 === DUMMY_PHONE ? 'preview' : 'public',
      requireApprovedAssets: true,
      rejectPlaceholderPhone: true,
      excludeEditorControls: true
    }
  };

  notes.push(`Migrado de schemaVersion ${originalVersion} para 2.0.0.`);
  notes.push(`${products.length} produtos mapeados com slugs estáveis.`);
  notes.push(`${assets.length} assets convertidos com papéis tipados.`);
  notes.push(`${homeSections.length} seções na tela Home (excluído cart público).`);

  return { spec, notes, originalVersion };
}

/**
 * Converte ProjectSpecV2 ou Site legado no SiteIR totalmente resolvido em memória.
 */
export function buildSiteIR(
  spec: ProjectSpecV2,
  originalRawSections?: Section[],
  originalVersion?: string
): SiteIR {
  const assetIndex: Record<string, Asset> = {};
  for (const a of spec.assets) {
    assetIndex[a.assetId] = a;
  }

  const promptIndex: Record<string, any> = {};
  for (const p of spec.prompts?.assets || []) {
    promptIndex[p.assetId] = p;
  }

  const productIndex: Record<string, Product> = {};
  const slugIndex: Record<string, Product> = {};
  for (const p of spec.catalog.products) {
    productIndex[p.sku] = p;
    const s = p.slug || slugify(p.name);
    slugIndex[s] = p;
  }

  const categoryIndex: Record<string, Category> = {};
  for (const c of spec.catalog.categories) {
    categoryIndex[c.id] = c;
  }

  // Objeto compatível com a interface Site legado + extensões V5
  const ir: SiteIR = {
    schemaVersion: originalVersion || spec.schemaVersion,
    business: spec.business,
    theme: spec.theme,
    whatsapp: spec.whatsapp,
    categories: spec.catalog.categories,
    products: spec.catalog.products,
    assets: spec.assets,
    prompts: spec.prompts || { assets: [] },
    layout: { sections: originalRawSections || spec.screens.home.sections },
    messages: spec.messages,
    rules: spec.rules || {
      currency: 'BRL',
      quantityStep: 1,
      maxPerItem: 20,
      checkoutMode: 'whatsapp_link',
      shippingCents: 0,
      discountCents: 0
    },
    specV2: spec,
    assetIndex,
    promptIndex,
    productIndex,
    categoryIndex,
    slugIndex,
    screens: spec.screens,
    overlays: spec.overlays,
    flows: spec.flows || []
  };

  return ir;
}
