export type AssetRole =
  | 'product_cutout'
  | 'portrait'
  | 'icon'
  | 'full_scene'
  | 'decorative'
  | 'category_tile'
  | 'brand_logo'
  | 'service_photo';

export type AssetStatus = 'ready' | 'needs_asset' | 'in_review' | 'error';

export type Asset = {
  assetId: string;
  kind?: string;
  role?: AssetRole;
  ownerRef?: string;
  ratio?: string;
  status: AssetStatus;
  url?: string;
  path?: string;
  alt?: string;
  sourceUrl?: string;
  license?: string;
  creator?: string;
  approved?: boolean;
  cropApproval?: boolean;
  focalPoint?: { x: number; y: number };
  safeArea?: number;
  mobileAssetRef?: string;
  slot?: string;
  width?: number;
  height?: number;
};

export type AssetPrompt = {
  assetId: string;
  width?: number;
  height?: number;
  text: string;
  negative?: string;
  generationScope?: 'full_scene' | 'cutout' | 'official_upload' | string;
  references?: { sourceUrl: string; license: string; usage: 'reference_only' }[];
};

export type Variant = {
  optionId: string;
  sku: string;
  label: string;
  priceCents: number;
  stock: number;
};

export type Product = {
  sku: string;
  slug?: string;
  name: string;
  description?: string;
  categoryId: string;
  priceCents: number;
  stock: number;
  attributes?: Record<string, string>;
  whatsappTemplateId?: string;
  genes?: Record<string, unknown>;
  responsive?: Record<string, Record<string, unknown>>;
  media: { assetId: string; kind?: string; status?: string }[];
  variants?: Variant[];
};

export type Category = {
  id: string;
  name: string;
  assetId?: string;
};

export type SectionType =
  | 'header'
  | 'hero'
  | 'features'
  | 'categoryTiles'
  | 'catalog'
  | 'cart'
  | 'footer'
  | 'story'
  | 'faq'
  | 'testimonials'
  | 'announcement'
  | 'contact'
  | 'kitBuilder'
  | 'booking'
  | 'recommendations';

export type KitSlot = {
  id: string;
  label: string;
  categoryId: string;
  productSkus: string[];
  defaultSku?: string;
};

export type Section = {
  id: string;
  type: SectionType;
  proteinId?: string;
  preset?: string;
  variant?: string;
  title?: string;
  eyebrow?: string;
  description?: string;
  assetId?: string;
  cta?: string;
  items?: { title: string; body: string; author?: string }[];
  pet?: { name: string; species: string; age: string; size: string; assetId: string };
  kit?: { slots: KitSlot[] };
  booking?: { dateOptions: string[]; timeOptions: string[]; templateId: string };
  productSkus?: string[];
  navItems?: { label: string; target: string }[];
  genes?: Record<string, unknown>;
  responsive?: Record<string, Record<string, unknown>>;
};

export type BusinessInfo = {
  name: string;
  description: string;
  tagline?: string;
  segment?: string;
  address: { city: string; state: string };
  features?: { title: string; description: string }[];
};

export type ThemeTokens = {
  'color.primary'?: string;
  'color.accent'?: string;
  'color.surface'?: string;
  'color.ink'?: string;
  'space.unitPx'?: number;
  'radius.cardPx'?: number;
  [key: string]: unknown;
};

export type Theme = {
  primary: string;
  accent?: string;
  background: string;
  text: string;
  radius: number;
  fontFamily?: 'sans' | 'serif' | string;
  tokens?: ThemeTokens;
};

export type WhatsAppConfig = {
  phoneE164: string;
  demoMode: boolean;
  recipientLabel?: string;
  defaultTemplateId?: string;
  checkoutTemplateId: string;
  quoteTemplateId?: string;
  supportTemplateId?: string;
};

export type MessageTemplate = {
  id: string;
  text: string;
};

export type StoreRules = {
  currency: 'BRL' | string;
  quantityStep: number;
  maxPerItem?: number;
  checkoutMode: 'whatsapp_link' | 'whatsapp_quote' | string;
  shippingCents?: number;
  discountCents?: number;
};

export type ComponentPreset = {
  proteinId: string;
  proteinVersion: number;
  genes: Record<string, unknown>;
  variants?: { containerMinPx: number; name: string }[];
};

export type ComponentInstance = {
  id: string;
  preset?: string;
  proteinId?: string;
  productRef?: string;
  mediaRef?: string;
  genes?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
};

export type ScreenHome = {
  route: '/';
  sections: Section[];
};

export type ScreenProduct = {
  route: '/produto/:slug';
  proteinId: 'ProductDetail';
  dataSource?: string;
};

export type Screens = {
  home: ScreenHome;
  product: ScreenProduct;
};

export type CartOverlay = {
  proteinId: 'CartDialog';
  mode: 'modal';
  maxWidthPx: number;
  maxHeightDvh: number;
  steps: ('cart' | 'review')[];
};

export type SearchOverlay = {
  proteinId: 'SearchResults';
  debounceMs: number;
  maxResults: number;
  fields: string[];
};

export type Overlays = {
  cart: CartOverlay;
  search: SearchOverlay;
};

export type FlowRule = {
  source: string;
  actionId: string;
  target?: string;
  payload?: Record<string, unknown>;
};

export type PublicationPolicy = {
  target?: 'preview' | 'public';
  requireApprovedAssets?: boolean;
  rejectPlaceholderPhone?: boolean;
  excludeEditorControls?: boolean;
};

/**
 * 1. ProjectSpecV2 — Fonte editável com prompts, assets, genes, proteínas, telas, fluxos e metadados editoriais.
 */
export type ProjectSpecV2 = {
  schemaVersion: '2.0.0';
  project?: {
    id?: string;
    mode?: 'editor' | 'preview' | 'public';
  };
  business: BusinessInfo;
  theme: Theme;
  catalog: {
    categories: Category[];
    products: Product[];
  };
  assets: Asset[];
  prompts?: {
    assets: AssetPrompt[];
  };
  componentPresets?: Record<string, ComponentPreset>;
  componentInstances?: ComponentInstance[];
  screens: Screens;
  overlays: Overlays;
  flows?: FlowRule[];
  messages: {
    templates: MessageTemplate[];
  };
  whatsapp: WhatsAppConfig;
  rules?: StoreRules;
  publication?: PublicationPolicy;
};

/**
 * Legado V1 / V1.1 (para compatibilidade de leitura)
 */
export type Site = {
  schemaVersion: string;
  business: BusinessInfo;
  theme: Theme;
  whatsapp: WhatsAppConfig;
  categories: Category[];
  products: Product[];
  assets: Asset[];
  prompts: { assets: AssetPrompt[] };
  layout: { sections: Section[] };
  messages: { templates: MessageTemplate[] };
  rules: StoreRules;
};

/**
 * 2. SiteIR — Representação intermediária em memória com referências resolvidas,
 * proteínas versionadas, genes herdados, rotas e mídia validadas.
 */
export type SiteIR = Site & {
  specV2?: ProjectSpecV2;
  assetIndex: Record<string, Asset>;
  promptIndex: Record<string, AssetPrompt>;
  productIndex: Record<string, Product>;
  categoryIndex: Record<string, Category>;
  slugIndex: Record<string, Product>;
  screens: Screens;
  overlays: Overlays;
  flows: FlowRule[];
};

/**
 * 3. PublicStoreIR — Projeção pública por lista positiva (somente dados necessários ao comprador).
 * Estritamente isento de base64, prompts, QA IDs, controles de edição e telefones fictícios.
 */
export type PublicStoreIR = {
  schemaVersion: '2.0.0';
  business: BusinessInfo;
  theme: {
    primary: string;
    accent?: string;
    background: string;
    text: string;
    radius: number;
    fontFamily?: string;
    tokens?: ThemeTokens;
  };
  catalog: {
    categories: Category[];
    products: {
      sku: string;
      slug: string;
      name: string;
      description?: string;
      categoryId: string;
      priceCents: number;
      stock: number;
      media: string[]; // URLs relativas públicas
      variants?: Variant[];
      attributes?: Record<string, string>;
      genes?: Record<string, unknown>;
    }[];
  };
  assets: {
    assetId: string;
    role: AssetRole;
    url: string; // caminho relativo ex: "assets/bento-logo.png"
    width?: number;
    height?: number;
    alt: string;
    ratio?: string;
    focalPoint?: { x: number; y: number };
    safeArea?: number;
    mobileAssetRef?: string;
  }[];
  screens: Screens;
  overlays: Overlays;
  messages: {
    templates: MessageTemplate[];
  };
  whatsapp: {
    phoneE164: string;
    checkoutTemplateId: string;
    defaultTemplateId?: string;
    quoteTemplateId?: string;
    supportTemplateId?: string;
  };
  rules: StoreRules;
};

export type CartLine = {
  key: string;
  sku: string;
  variantSku?: string;
  variantLabel?: string;
  name: string;
  priceCents: number;
  quantity: number;
  stock: number;
};

export type MigrationReportItem = {
  file: string;
  status: 'migrated' | 'compatible' | 'needs_review' | 'error';
  originalVersion: string;
  targetVersion: '2.0.0';
  productsCount: number;
  assetsCount: number;
  sectionsCount: number;
  notes: string[];
};

export type PublicationValidation = {
  canPublish: boolean;
  isBlocked: boolean;
  target: 'public' | 'preview';
  blockedReasons: string[];
  warnings: string[];
  publicJsonBytes?: number;
  assetsCount: number;
  hasDummyPhone: boolean;
  missingMandatoryAssets: string[];
};
