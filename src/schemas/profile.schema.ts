import { z } from 'zod';

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

export const CatalogProductSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default('Geral'),
  description: z.string().default(''),
  priceCents: z.number().int().min(0),
  variation: z.string().default('Padrão'),
  stock: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  imageUrl: z.string().default(''),
  approvedAsset: z.boolean().default(false),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

export const BusinessProfileSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  onboarding: z.object({
    whatsappConnected: z.boolean().default(false),
    whatsappConfirmed: z.boolean().default(false),
    fichaCompleted: z.boolean().default(false),
    storeGenerated: z.boolean().default(false),
  }).default({
    whatsappConnected: false,
    whatsappConfirmed: false,
    fichaCompleted: false,
    storeGenerated: false,
  }),
  business: z.object({
    name: z.string().default(''),
    segment: z.string().default('Geral'),
    description: z.string().default(''),
    address: z.string().default(''),
    mapsUrl: z.string().default(''),
    hours: z.string().default('Seg a Sáb · 09h às 19h'),
    email: z.string().default(''),
  }).default({
    name: '',
    segment: 'Geral',
    description: '',
    address: '',
    mapsUrl: '',
    hours: 'Seg a Sáb · 09h às 19h',
    email: '',
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
  }).default({
    pixKey: '',
    pixDiscountPercent: 0,
    acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
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
    primaryColor: z.string().default('#111827'),
    accentColor: z.string().default('#10b981'),
    themePreset: z.string().default('minimal-luxury'),
  }).default({
    instagram: '',
    logoUrl: '',
    primaryColor: '#111827',
    accentColor: '#10b981',
    themePreset: 'minimal-luxury',
  }),
  catalog: z.object({
    products: z.array(CatalogProductSchema).default([]),
  }).default({
    products: [],
  }),
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
  payment_method: string;
  delivery_address: Record<string, string>;
  status: 'aguardando_dados' | 'aguardando_pagamento' | 'confirmado' | 'cancelado' | 'concluido';
  source_revision: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardMetricsProjection {
  sourceRevision: number;
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
}

export function createEmptyProfile(partial?: Partial<BusinessProfile>): BusinessProfile {
  return BusinessProfileSchema.parse({
    schemaVersion: 1,
    ...partial,
  });
}
