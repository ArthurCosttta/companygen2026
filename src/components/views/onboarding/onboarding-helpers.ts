import type { BusinessProfile } from '@/schemas/profile.schema';

export type OnboardingWizardStep = 1 | 2 | 3;

export type OnboardingHelpTopic =
  | 'general'
  | 'ficha'
  | 'product'
  | 'pix'
  | 'publish';

export type AcceptedPaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'cash';

export interface ExpressFichaDraft {
  currentStep: OnboardingWizardStep;
  businessName: string;
  segment: string;
  phoneInput: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFeeInput: string;
  deliveryAreasText: string;
  productName: string;
  productPriceInput: string;
  productCategory: string;
  productVariation: string;
  productStockInput: string;
  productDescription: string;
  productImageUrl: string;
  pixKey: string;
  pixDiscountPercent: number;
  acceptedMethods: AcceptedPaymentMethod[];
  publishOnComplete: boolean;
  updatedAt: string;
}

export const SEGMENT_OPTIONS = [
  'Moda & Acessórios',
  'Beleza & Cosméticos',
  'Alimentação & Doces',
  'Casa & Decoração',
  'Eletrônicos & Acessórios',
  'Saúde & Bem-estar',
  'Serviços',
  'Geral',
] as const;

const DRAFT_KEY_PREFIX = 'cg_express_ficha_draft_v1:';

function getDraftStorageKey(owner?: string): string {
  const safeOwner = (owner || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${DRAFT_KEY_PREFIX}${safeOwner}`;
}

export function readExpressFichaDraft(owner?: string): ExpressFichaDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExpressFichaDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      currentStep: parsed.currentStep === 2 || parsed.currentStep === 3 ? parsed.currentStep : 1,
      businessName: typeof parsed.businessName === 'string' ? parsed.businessName : '',
      segment: typeof parsed.segment === 'string' && parsed.segment ? parsed.segment : 'Geral',
      phoneInput: typeof parsed.phoneInput === 'string' ? parsed.phoneInput : '',
      deliveryEnabled: parsed.deliveryEnabled !== false,
      pickupEnabled: parsed.pickupEnabled !== false,
      deliveryFeeInput: typeof parsed.deliveryFeeInput === 'string' ? parsed.deliveryFeeInput : '0,00',
      deliveryAreasText: typeof parsed.deliveryAreasText === 'string' ? parsed.deliveryAreasText : '',
      productName: typeof parsed.productName === 'string' ? parsed.productName : '',
      productPriceInput: typeof parsed.productPriceInput === 'string' ? parsed.productPriceInput : '',
      productCategory: typeof parsed.productCategory === 'string' && parsed.productCategory ? parsed.productCategory : 'Geral',
      productVariation: typeof parsed.productVariation === 'string' && parsed.productVariation ? parsed.productVariation : 'Padrão',
      productStockInput: typeof parsed.productStockInput === 'string' && parsed.productStockInput ? parsed.productStockInput : '10',
      productDescription: typeof parsed.productDescription === 'string' ? parsed.productDescription : '',
      productImageUrl: typeof parsed.productImageUrl === 'string' ? parsed.productImageUrl : '',
      pixKey: typeof parsed.pixKey === 'string' ? parsed.pixKey : '',
      pixDiscountPercent:
        typeof parsed.pixDiscountPercent === 'number' && Number.isFinite(parsed.pixDiscountPercent)
          ? Math.min(90, Math.max(0, parsed.pixDiscountPercent))
          : 0,
      acceptedMethods:
        Array.isArray(parsed.acceptedMethods) && parsed.acceptedMethods.length > 0
          ? parsed.acceptedMethods
          : ['pix', 'credit_card', 'debit_card', 'cash'],
      publishOnComplete: parsed.publishOnComplete !== false,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeExpressFichaDraft(draft: ExpressFichaDraft, owner?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getDraftStorageKey(owner),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Ignore storage quota or private mode failures.
  }
}

export function clearExpressFichaDraft(owner?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getDraftStorageKey(owner));
  } catch {
    // Ignore storage failures.
  }
}

export function buildDraftFromProfile(
  profile: BusinessProfile | null | undefined,
  initialStep: OnboardingWizardStep = 1,
): ExpressFichaDraft {
  const rawPhone = profile?.whatsapp?.phoneE164 || profile?.whatsapp?.displayPhone || '';
  const feeCents = profile?.delivery?.defaultFeeCents ?? 0;

  return {
    currentStep: initialStep,
    businessName: profile?.business?.name ?? '',
    segment: profile?.business?.segment || 'Geral',
    phoneInput: formatBrazilPhoneDisplay(rawPhone),
    deliveryEnabled: profile?.delivery?.deliveryEnabled !== false,
    pickupEnabled: profile?.delivery?.pickupEnabled !== false,
    deliveryFeeInput: formatCentsToInputBrl(feeCents),
    deliveryAreasText: (profile?.delivery?.areas ?? []).join(', '),
    productName: '',
    productPriceInput: '',
    productCategory: 'Geral',
    productVariation: 'Padrão',
    productStockInput: '10',
    productDescription: '',
    productImageUrl: '',
    pixKey: profile?.payment?.pixKey ?? '',
    pixDiscountPercent: profile?.payment?.pixDiscountPercent ?? 0,
    acceptedMethods:
      profile?.payment?.acceptedMethods && profile.payment.acceptedMethods.length > 0
        ? [...profile.payment.acceptedMethods]
        : ['pix', 'credit_card', 'debit_card', 'cash'],
    publishOnComplete: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Formata dígitos de telefone brasileiro para exibição legível com DDD.
 */
export function formatBrazilPhoneDisplay(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Converte texto monetário em português (ex.: "29,90" ou "R$ 1.250,00") para centavos inteiros.
 */
export function parsePriceBrlToCents(raw: string): number {
  const cleaned = String(raw || '')
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return 0;

  let numeric: number;
  if (cleaned.includes(',')) {
    numeric = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  } else {
    numeric = Number(cleaned);
  }

  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

export function formatCentsToInputBrl(cents: number): string {
  const safe = Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : 0;
  return (safe / 100).toFixed(2).replace('.', ',');
}

export function validatePixKeyInput(raw: string): { valid: boolean; reason?: string } {
  const value = raw.trim();
  if (!value) return { valid: true }; // Optional unless enforced by caller
  if (value.length < 5) {
    return {
      valid: false,
      reason: 'Informe uma chave Pix válida (CPF, CNPJ, e-mail, celular ou chave aleatória).',
    };
  }
  return { valid: true };
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Gera SVG data-URI limpo e seguro para produtos cadastrados no Express Wizard sem foto própria,
 * garantindo imageUrl válido + approvedAsset: true contra bloqueio HTTP 422 ao publicar.
 */
export function createProductPlaceholderSvgDataUri(
  productName: string,
  category = 'Geral',
): string {
  const cleanName = productName.trim() || 'Produto';
  const initials = cleanName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'CG';

  const safeInitials = escapeXmlText(initials);
  const safeCategory = escapeXmlText((category.trim() || 'Catálogo').slice(0, 22));
  const safeTitle = escapeXmlText(cleanName.slice(0, 26));

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
    '<defs>',
    '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#EFF6FF"/>',
    '<stop offset="100%" stop-color="#DBEAFE"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="640" height="640" rx="36" fill="url(#bg)"/>',
    '<circle cx="320" cy="252" r="96" fill="#2563EB" opacity="0.12"/>',
    '<rect x="248" y="180" width="144" height="144" rx="36" fill="#2563EB"/>',
    `<text x="320" y="272" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="60" font-weight="700" fill="#FFFFFF">${safeInitials}</text>`,
    `<text x="320" y="396" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="700" fill="#0F172A">${safeTitle}</text>`,
    `<text x="320" y="438" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="#1D4ED8">${safeCategory}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildPublicStoreShareUrl(publicSlug?: string, owner?: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', 'store');
  if (owner) {
    url.searchParams.set('u', owner);
  } else if (publicSlug) {
    url.searchParams.set('loja', publicSlug);
  }
  return url.toString();
}
