import { z } from 'zod';

export const CatalogItemTypeEnum = z.enum([
  'produto_fisico',
  'servico_agendado',
  'kit_combo',
  'sob_medida',
]);
export type CatalogItemType = z.infer<typeof CatalogItemTypeEnum>;

export const PLACEHOLDER_PHONES = new Set([
  '5511999999999',
  '5500000000000',
  '5511000000000',
  '5511111111111',
  '0000000000000',
]);

export function sanitizePhoneE164(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidProductionPhone(phoneE164: string): boolean {
  const digits = sanitizePhoneE164(phoneE164);
  if (digits.length < 12 || digits.length > 13) return false;
  if (PLACEHOLDER_PHONES.has(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function formatCurrencyBRL(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safe / 100);
}

export const ProductFocalPointSchema = z.object({
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
});
export type ProductFocalPoint = z.infer<typeof ProductFocalPointSchema>;

export const CatalogProductSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default('Geral'),
  description: z.string().default(''),
  priceCents: z.number().int().min(0),
  variation: z.string().default('Padrão'),
  stock: z.number().int().min(0).default(0),
  stockQty: z.number().int().min(0).optional(),
  trackStock: z.boolean().default(false).optional(),
  lowStockThreshold: z.number().int().min(0).default(3).optional(),
  autoPausedOutOfStock: z.boolean().default(false).optional(),
  imageFocalPoint: ProductFocalPointSchema.default({ x: 50, y: 50 }).optional(),
  imageLowRes: z.boolean().default(false).optional(),
  active: z.boolean().default(true),
  imageUrl: z.string().default(''),
  approvedAsset: z.boolean().default(false),
  itemType: CatalogItemTypeEnum.optional(),
  mensagemMolde: z.string().optional(),
  prazoOuDuracao: z.string().optional(),
  itensInclusosKit: z.array(z.string()).optional(),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

export function buildDefaultMensagemMolde(
  product: Partial<CatalogProduct> & { name: string },
  storeName = ''
): string {
  const name = String(product.name || 'Item').trim();
  const itemType = product.itemType || 'produto_fisico';
  const variation = product.variation && product.variation !== 'Padrão' ? ` (${product.variation})` : '';
  const priceText =
    Number(product.priceCents || 0) > 0
      ? formatCurrencyBRL(Number(product.priceCents || 0))
      : 'sob consulta';
  const prazo = product.prazoOuDuracao ? ` | Prazo/Duração: ${product.prazoOuDuracao}` : '';
  const lojaSuffix = storeName ? ` na ${storeName}` : '';

  if (itemType === 'servico_agendado') {
    return `Olá${lojaSuffix}! Quero agendar o serviço *${name}*${variation} (${priceText}${prazo}). Quais horários disponíveis?`;
  }
  if (itemType === 'kit_combo') {
    const inclusos = Array.isArray(product.itensInclusosKit) && product.itensInclusosKit.length > 0
      ? ` [Inclui: ${product.itensInclusosKit.join(', ')}]`
      : '';
    return `Olá${lojaSuffix}! Tenho interesse no Kit *${name}*${variation} por ${priceText}${inclusos}. Pode me confirmar?`;
  }
  if (itemType === 'sob_medida') {
    return `Olá${lojaSuffix}! Quero orçamento sob medida para *${name}*${variation} (ref. ${priceText}${prazo}). Minhas especificações: `;
  }
  return `Olá${lojaSuffix}! Quero pedir *${name}*${variation} — valor ${priceText}${prazo}. Está disponível?`;
}

export function hydrateMensagemMolde(
  template: string | undefined,
  product: CatalogProduct,
  extras?: { storeName?: string; quantity?: number; variation?: string; customNote?: string }
): string {
  const storeName = extras?.storeName || '';
  const variation = extras?.variation || product.variation || 'Padrão';
  const rawTemplate = String(template || product.mensagemMolde || '').trim();
  const base = rawTemplate || buildDefaultMensagemMolde({ ...product, variation }, storeName);
  const resolved = base
    .replace(/\{nomeProduto\}/gi, product.name)
    .replace(/\{preco\}/gi, Number(product.priceCents || 0) > 0 ? formatCurrencyBRL(product.priceCents) : 'sob consulta')
    .replace(/\{variacao\}/gi, variation)
    .replace(/\{sku\}/gi, product.sku)
    .replace(/\{itemType\}/gi, product.itemType || 'produto_fisico')
    .replace(/\{loja\}/gi, storeName || 'loja')
    .replace(/\{prazo\}/gi, product.prazoOuDuracao || 'a combinar');
  const qtySuffix = extras?.quantity && extras.quantity > 1 ? `\nQuantidade: ${extras.quantity}x` : '';
  const noteSuffix = extras?.customNote?.trim() ? `\nObservação: ${extras.customNote.trim()}` : '';
  return `${resolved}${qtySuffix}${noteSuffix}`.trim();
}

export const StoreShippingConfigSchema = z.object({
  fixedFeeCents: z.number().int().min(0).default(0),
  freeShippingThresholdCents: z.number().int().min(0).default(0),
  pickupAvailable: z.boolean().default(true),
});
export type StoreShippingConfig = z.infer<typeof StoreShippingConfigSchema>;

export const StoreCouponSchema = z.object({
  code: z.string().min(3).max(20),
  discountPercent: z.number().int().min(1).max(90),
  active: z.boolean().default(true),
  expiresAt: z.string().nullable().optional(),
  usageCount: z.number().int().min(0).default(0).optional(),
});
export type StoreCoupon = z.infer<typeof StoreCouponSchema>;

export const BusinessProfileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  onboarding: z.object({
    whatsappConnected: z.boolean().default(false),
    whatsappConfirmed: z.boolean().default(false),
    fichaCompleted: z.boolean().default(false),
    storeGenerated: z.boolean().default(false),
    preferredTrack: z.enum(['store_first', 'whatsapp_first', 'full_guided']).default('full_guided').optional(),
    completedFirstSimulatedOrder: z.boolean().default(false).optional(),
  }).default({
    whatsappConnected: false,
    whatsappConfirmed: false,
    fichaCompleted: false,
    storeGenerated: false,
    preferredTrack: 'full_guided',
    completedFirstSimulatedOrder: false,
  }),
  business: z.object({
    name: z.string().default(''),
    segment: z.string().default('Geral'),
    businessModel: z.enum(['produtos', 'servicos', 'hibrido']).default('produtos'),
    description: z.string().default(''),
    experienceGoal: z.string().default(''),
    differentials: z.array(z.string()).default([]),
    campaignTheme: z.string().default(''),
    address: z.string().default(''),
    mapsUrl: z.string().default(''),
    hours: z.string().default('Seg a Sáb · 09h às 19h'),
    email: z.string().default(''),
    deliveryModes: z.array(z.enum(['pickup', 'local', 'national'])).default(['pickup', 'local']).optional(),
  }).default({
    name: '',
    segment: 'Geral',
    businessModel: 'produtos',
    description: '',
    experienceGoal: '',
    differentials: [],
    campaignTheme: '',
    address: '',
    mapsUrl: '',
    hours: 'Seg a Sáb · 09h às 19h',
    email: '',
    deliveryModes: ['pickup', 'local'],
  }),
  whatsapp: z.object({
    connected: z.boolean().default(false),
    jid: z.string().default(''),
    phoneE164: z.string().default(''),
    displayPhone: z.string().default(''),
    profileName: z.string().default(''),
    profilePhotoUrl: z.string().default(''),
    verifiedOrigin: z.enum(['baileys', 'manual']).default('baileys'),
  }).default({
    connected: false,
    jid: '',
    phoneE164: '',
    displayPhone: '',
    profileName: '',
    profilePhotoUrl: '',
    verifiedOrigin: 'baileys',
  }),
  payment: z.object({
    pixKey: z.string().default(''),
    pixDiscountPercent: z.number().min(0).max(90).default(0),
    acceptedMethods: z.array(z.enum(['pix', 'credit_card', 'debit_card', 'cash'])).default(['pix', 'credit_card', 'debit_card', 'cash']),
    paymentPolicy: z.enum(['on_delivery', 'pix_discount', 'deposit_50']).default('pix_discount').optional(),
  }).default({
    pixKey: '',
    pixDiscountPercent: 0,
    acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
    paymentPolicy: 'pix_discount',
  }),
  delivery: z.object({
    pickupEnabled: z.boolean().default(true),
    deliveryEnabled: z.boolean().default(true),
    areas: z.array(z.string()).default([]),
    defaultFeeCents: z.number().int().min(0).default(0),
    pickupHours: z.string().default('Seg a Sáb · 09h às 18h'),
  }).default({
    pickupEnabled: true,
    deliveryEnabled: true,
    areas: [],
    defaultFeeCents: 0,
    pickupHours: 'Seg a Sáb · 09h às 18h',
  }),
  agent: z.object({
    name: z.string().default('Sofia'),
    tone: z.enum(['proximo', 'formal', 'direto', 'consultivo']).default('proximo'),
    autoReplyEnabled: z.boolean().default(true),
    welcomeMessage: z.string().default(''),
  }).default({
    name: 'Sofia',
    tone: 'proximo',
    autoReplyEnabled: true,
    welcomeMessage: '',
  }),
  brand: z.object({
    instagram: z.string().default(''),
    logoUrl: z.string().default(''),
    storefrontPhotoUrl: z.string().default(''),
    heroImageUrl: z.string().default(''),
    heroBackgroundUrl: z.string().default(''),
    pageBackgroundUrl: z.string().default(''),
    sectionBackgrounds: z.record(z.string(), z.string()).default({}),
    primaryColor: z.string().default('#111827'),
    accentColor: z.string().default('#10b981'),
    fontStyle: z.enum(['modern_sans', 'editorial_serif', 'clean_geometric']).default('modern_sans'),
    visualMood: z.enum(['boutique', 'direct', 'warm']).default('boutique').optional(),
    generateAiLogo: z.boolean().default(false),
    themePreset: z.string().default('minimal-luxury'),
    storeIdentityId: z.string().optional(),
  }).default({
    instagram: '',
    logoUrl: '',
    storefrontPhotoUrl: '',
    heroImageUrl: '',
    heroBackgroundUrl: '',
    pageBackgroundUrl: '',
    sectionBackgrounds: {},
    primaryColor: '#111827',
    accentColor: '#10b981',
    fontStyle: 'modern_sans',
    visualMood: 'boutique',
    generateAiLogo: false,
    themePreset: 'minimal-luxury',
  }),
  catalog: z.object({
    products: z.array(CatalogProductSchema).default([]),
  }).default({
    products: [],
  }),
  shipping: StoreShippingConfigSchema.optional(),
  coupons: z.array(StoreCouponSchema).default([]).optional(),
  publishedStore: z.object({
    published: z.boolean().default(false),
    publishedAt: z.string().nullable().default(null),
    publicSlug: z.string().default(''),
    sourceRevision: z.number().int().min(0).default(0),
  }).default({
    published: false,
    publishedAt: null,
    publicSlug: '',
    sourceRevision: 0,
  }),
  storeLayout: z.object({
    storePrompt: z.string().default(''),
    presetBase: z.string().default('HYBRID_EDITORIAL_COMMERCE'),
    widgets: z.array(z.any()).default([]),
    executionPlan: z.any().optional(),
    formulasIr: z.any().optional(),
    reviews: z.array(z.object({
      id: z.string(),
      author: z.string(),
      text: z.string(),
      productRef: z.string().default(''),
      rating: z.number().int().min(1).max(5).default(5),
    })).default([]),
    faq: z.array(z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
    })).default([]),
    updatedAt: z.string().default(''),
  }).default({
    storePrompt: '',
    presetBase: 'HYBRID_EDITORIAL_COMMERCE',
    widgets: [],
    reviews: [],
    faq: [],
    updatedAt: '',
  }),
  desktopPrefs: z.object({
    minimizeToTray: z.boolean().default(true),
    soundNewOrder: z.boolean().default(true),
    soundHumanAlert: z.boolean().default(true),
    lowCreditEmailAlert: z.boolean().default(true),
    offlineEmailAlert: z.boolean().default(true),
  }).optional(),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export interface BusinessOrderItem {
  sku: string;
  name: string;
  variation: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface BusinessOrder {
  id: string;
  order_ref: string;
  customer_jid: string;
  customer_name: string;
  items: BusinessOrderItem[];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  discount_cents?: number;
  coupon_code?: string;
  payment_method: string;
  delivery_address: Record<string, string>;
  status:
    | 'aguardando_dados'
    | 'aguardando_pagamento'
    | 'confirmado'
    | 'em_preparo'
    | 'enviado'
    | 'entregue'
    | 'cancelado'
    | 'concluido';
  isSimulation?: boolean;
  is_simulation?: boolean;
  manual?: boolean;
  channel?: string;
  source_channel?: string;
  source_revision: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardCrmSummary {
  totalRevenueCents: number;
  orderCount: number;
  avgTicketCents: number;
  byChannel: {
    storefront: number;
    whatsapp: number;
    counter: number;
  };
  topProducts: Array<{
    sku: string;
    name: string;
    storefrontQty: number;
    whatsappQty: number;
    counterQty: number;
    totalQty: number;
    revenueCents: number;
  }>;
  repeatCustomers: Array<{
    customerKey: string;
    customerName: string;
    phone: string;
    orderCount: number;
    totalCents: number;
    lastOrderAt: string;
  }>;
}

export interface DashboardMetricsProjection {
  sourceRevision: number;
  periodDays?: number | 'all';
  businessName: string;
  whatsappConnected: boolean;
  displayPhone: string;
  visitsTotal: number;
  visitsByDay: Record<string, number>;
  ordersCount: number;
  salesCents: number;
  messagesCount: number;
  catalogCount: number;
  stockUnits: number;
  recentOrders: BusinessOrder[];
  crmSummary?: DashboardCrmSummary;
}

export function createEmptyProfile(partial?: Partial<BusinessProfile>): BusinessProfile {
  return BusinessProfileSchema.parse({
    schemaVersion: 1,
    ...partial,
  });
}
