import type { BusinessProfile } from '@/schemas/profile.schema';

export type OnboardingWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type OnboardingHelpTopic =
  | 'general'
  | 'ficha'
  | 'product'
  | 'pix'
  | 'publish';

export type AcceptedPaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'cash';

export type OnboardingBusinessModel = 'produtos' | 'servicos' | 'hibrido';
export type OnboardingFontStyle = 'modern_sans' | 'editorial_serif' | 'clean_geometric';
export type OnboardingVisualMood = 'boutique' | 'direct' | 'warm';
export type OnboardingDeliveryMode = 'pickup' | 'local' | 'national';
export type OnboardingPaymentPolicy = 'on_delivery' | 'pix_discount' | 'deposit_50';

export interface ExpressQuickProductDraft {
  id: string;
  name: string;
  priceInput: string;
  category: string;
  variation: string;
  description: string;
  imageUrl: string;
}

export interface ExpressFichaDraft {
  currentStep: OnboardingWizardStep;
  splitStep?: 1 | 2 | 3;
  preferredTrack?: 'store_first' | 'whatsapp_first' | 'full_guided';
  businessName: string;
  instagramHandle: string;
  businessDescription: string;
  segment: string;
  businessModel: OnboardingBusinessModel;
  differentials: string[];
  experienceGoal: string;
  campaignTheme: string;
  logoUrl: string;
  storefrontPhotoUrl: string;
  generateAiLogo: boolean;
  noPhysicalLocation: boolean;
  primaryColor: string;
  accentColor?: string;
  palettePrimaryFromLogo?: string;
  paletteAccentFromLogo?: string;
  fontStyle: OnboardingFontStyle;
  visualMood?: OnboardingVisualMood;
  businessAddress: string;
  businessHours: string;
  phoneInput: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryModes?: OnboardingDeliveryMode[];
  deliveryFeeInput: string;
  deliveryAreasText: string;
  productName: string;
  productPriceInput: string;
  productCategory: string;
  productVariation: string;
  productStockInput: string;
  productDescription: string;
  productImageUrl: string;
  photoMode?: 'upload' | 'ai' | 'draft';
  quickProducts?: ExpressQuickProductDraft[];
  pixKey: string;
  pixDiscountPercent: number;
  acceptedMethods: AcceptedPaymentMethod[];
  paymentPolicy?: OnboardingPaymentPolicy;
  faqCardAnswer?: string;
  faqDeliveryAnswer?: string;
  faqLocationAnswer?: string;
  welcomeGreeting?: string;
  nightNotice?: string;
  publishOnComplete: boolean;
  updatedAt: string;
}

export const SEGMENT_OPTIONS = [
  'Petshop & Estética Animal',
  'Gastronomia & Confeitaria',
  'Moda & Acessórios',
  'Beleza & Cosméticos',
  'Clínicas & Saúde',
  'Educação & Cursos',
  'Casa & Decoração',
  'Eletrônicos & Assistência',
  'Serviços Locais',
  'Geral',
] as const;

export const ONBOARDING_DIFFERENTIAL_CHIPS = [
  'Hora marcada',
  'Entrega no mesmo dia',
  'Atendimento personalizado',
  'Sem gaiolas / Baixo estresse',
  'Leva e traz',
  'Sob encomenda',
  'Produção artesanal',
  'Garantia inclusa',
] as const;

export const ONBOARDING_EXPERIENCE_PRESETS = [
  {
    id: 'calc_combo',
    title: 'Montar kit ou combo na hora',
    prompt: 'Permitir que o cliente monte seu próprio kit ou combinação e veja o subtotal em tempo real.',
  },
  {
    id: 'schedule_estimator',
    title: 'Simular serviço por porte ou necessidade',
    prompt: 'Ajudar o cliente a selecionar porte, características ou objetivo e receber indicação de serviços do catálogo.',
  },
  {
    id: 'compare_options',
    title: 'Comparar itens e vantagens lado a lado',
    prompt: 'Exibir comparativo claro entre planos, variações ou produtos para facilitar a escolha sem dúvidas.',
  },
  {
    id: 'showcase_story',
    title: 'Apresentar vitrine + história da marca',
    prompt: 'Destacar o espaço físico, diferenciais e catálogo organizado para pedido rápido no WhatsApp.',
  },
] as const;

export const ONBOARDING_COLOR_SWATCHES = [
  { hex: '#0B4DB8', label: 'Azul Confiança' },
  { hex: '#2F6F4E', label: 'Verde Botânico' },
  { hex: '#B4532A', label: 'Terracota Quente' },
  { hex: '#0F172A', label: 'Grafite Editorial' },
  { hex: '#6D28D9', label: 'Roxo Criativo' },
  { hex: '#CA8A04', label: 'Âmbar Dourado' },
] as const;

export function clampOnboardingStep(value: unknown): OnboardingWizardStep {
  const num = Number(value);
  if (Number.isInteger(num) && num >= 1 && num <= 8) {
    return num as OnboardingWizardStep;
  }
  return 1;
}

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
    const validModel =
      parsed.businessModel === 'produtos' ||
      parsed.businessModel === 'servicos' ||
      parsed.businessModel === 'hibrido'
        ? parsed.businessModel
        : 'hibrido';
    const validFont =
      parsed.fontStyle === 'modern_sans' ||
      parsed.fontStyle === 'editorial_serif' ||
      parsed.fontStyle === 'clean_geometric'
        ? parsed.fontStyle
        : 'modern_sans';

    const validMood: OnboardingVisualMood =
      parsed.visualMood === 'boutique' ||
      parsed.visualMood === 'direct' ||
      parsed.visualMood === 'warm'
        ? parsed.visualMood
        : 'boutique';
    const validSplitStep: 1 | 2 | 3 =
      parsed.splitStep === 2 || parsed.splitStep === 3 ? parsed.splitStep : 1;
    const validDeliveryModes: OnboardingDeliveryMode[] = Array.isArray(parsed.deliveryModes)
      ? parsed.deliveryModes.filter(
          (m): m is OnboardingDeliveryMode =>
            m === 'pickup' || m === 'local' || m === 'national',
        )
      : ['pickup', 'local'];
    const validPaymentPolicy: OnboardingPaymentPolicy =
      parsed.paymentPolicy === 'on_delivery' ||
      parsed.paymentPolicy === 'pix_discount' ||
      parsed.paymentPolicy === 'deposit_50'
        ? parsed.paymentPolicy
        : 'pix_discount';

    const validTrack =
      parsed.preferredTrack === 'store_first' ||
      parsed.preferredTrack === 'whatsapp_first' ||
      parsed.preferredTrack === 'full_guided'
        ? parsed.preferredTrack
        : undefined;

    return {
      currentStep: clampOnboardingStep(parsed.currentStep),
      splitStep: validSplitStep,
      preferredTrack: validTrack,
      businessName: typeof parsed.businessName === 'string' ? parsed.businessName : '',
      instagramHandle: typeof parsed.instagramHandle === 'string' ? parsed.instagramHandle : '',
      businessDescription: typeof parsed.businessDescription === 'string' ? parsed.businessDescription : '',
      segment: typeof parsed.segment === 'string' && parsed.segment ? parsed.segment : 'Geral',
      businessModel: validModel,
      differentials: Array.isArray(parsed.differentials)
        ? parsed.differentials.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 3)
        : [],
      experienceGoal: typeof parsed.experienceGoal === 'string' ? parsed.experienceGoal : '',
      campaignTheme: typeof parsed.campaignTheme === 'string' ? parsed.campaignTheme : '',
      logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : '',
      storefrontPhotoUrl: typeof parsed.storefrontPhotoUrl === 'string' ? parsed.storefrontPhotoUrl : '',
      generateAiLogo: Boolean(parsed.generateAiLogo),
      noPhysicalLocation: Boolean(parsed.noPhysicalLocation),
      primaryColor: typeof parsed.primaryColor === 'string' && parsed.primaryColor ? parsed.primaryColor : '#0B4DB8',
      accentColor: typeof parsed.accentColor === 'string' && parsed.accentColor ? parsed.accentColor : '#24A677',
      palettePrimaryFromLogo:
        typeof parsed.palettePrimaryFromLogo === 'string' ? parsed.palettePrimaryFromLogo : undefined,
      paletteAccentFromLogo:
        typeof parsed.paletteAccentFromLogo === 'string' ? parsed.paletteAccentFromLogo : undefined,
      fontStyle: validFont,
      visualMood: validMood,
      businessAddress: typeof parsed.businessAddress === 'string' ? parsed.businessAddress : '',
      businessHours: typeof parsed.businessHours === 'string' ? parsed.businessHours : '',
      phoneInput: typeof parsed.phoneInput === 'string' ? parsed.phoneInput : '',
      deliveryEnabled: parsed.deliveryEnabled !== false,
      pickupEnabled: parsed.pickupEnabled !== false,
      deliveryModes: validDeliveryModes.length > 0 ? validDeliveryModes : ['pickup', 'local'],
      deliveryFeeInput: typeof parsed.deliveryFeeInput === 'string' ? parsed.deliveryFeeInput : '0,00',
      deliveryAreasText: typeof parsed.deliveryAreasText === 'string' ? parsed.deliveryAreasText : '',
      productName: typeof parsed.productName === 'string' ? parsed.productName : '',
      productPriceInput: typeof parsed.productPriceInput === 'string' ? parsed.productPriceInput : '',
      productCategory: typeof parsed.productCategory === 'string' && parsed.productCategory ? parsed.productCategory : 'Geral',
      productVariation: typeof parsed.productVariation === 'string' && parsed.productVariation ? parsed.productVariation : 'Padrão',
      productStockInput: typeof parsed.productStockInput === 'string' && parsed.productStockInput ? parsed.productStockInput : '10',
      productDescription: typeof parsed.productDescription === 'string' ? parsed.productDescription : '',
      productImageUrl: typeof parsed.productImageUrl === 'string' ? parsed.productImageUrl : '',
      photoMode:
        parsed.photoMode === 'ai' || parsed.photoMode === 'upload' || parsed.photoMode === 'draft'
          ? parsed.photoMode
          : 'draft',
      quickProducts: Array.isArray(parsed.quickProducts) ? parsed.quickProducts.slice(0, 30) : [],
      pixKey: typeof parsed.pixKey === 'string' ? parsed.pixKey : '',
      pixDiscountPercent:
        typeof parsed.pixDiscountPercent === 'number' && Number.isFinite(parsed.pixDiscountPercent)
          ? Math.min(90, Math.max(0, parsed.pixDiscountPercent))
          : 0,
      acceptedMethods:
        Array.isArray(parsed.acceptedMethods) && parsed.acceptedMethods.length > 0
          ? parsed.acceptedMethods
          : ['pix', 'credit_card', 'debit_card', 'cash'],
      paymentPolicy: validPaymentPolicy,
      faqCardAnswer: typeof parsed.faqCardAnswer === 'string' ? parsed.faqCardAnswer : '',
      faqDeliveryAnswer: typeof parsed.faqDeliveryAnswer === 'string' ? parsed.faqDeliveryAnswer : '',
      faqLocationAnswer: typeof parsed.faqLocationAnswer === 'string' ? parsed.faqLocationAnswer : '',
      welcomeGreeting: typeof parsed.welcomeGreeting === 'string' ? parsed.welcomeGreeting : '',
      nightNotice: typeof parsed.nightNotice === 'string' ? parsed.nightNotice : '',
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
    window.dispatchEvent(
      new CustomEvent('companygen:ficha-draft-updated', { detail: { owner: owner || 'default' } }),
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
    currentStep: clampOnboardingStep(initialStep),
    splitStep: 1,
    preferredTrack: profile?.onboarding?.preferredTrack,
    businessName: profile?.business?.name ?? '',
    instagramHandle: profile?.brand?.instagram ?? '',
    businessDescription: profile?.business?.description ?? '',
    segment: profile?.business?.segment || 'Geral',
    businessModel: profile?.business?.businessModel ?? 'hibrido',
    differentials: Array.isArray(profile?.business?.differentials) ? [...profile.business.differentials].slice(0, 3) : [],
    experienceGoal: profile?.business?.experienceGoal ?? '',
    campaignTheme: profile?.business?.campaignTheme ?? '',
    logoUrl: profile?.brand?.logoUrl ?? '',
    storefrontPhotoUrl: profile?.brand?.storefrontPhotoUrl ?? '',
    generateAiLogo: Boolean(profile?.brand?.generateAiLogo),
    noPhysicalLocation: !profile?.business?.address?.trim() && !profile?.brand?.storefrontPhotoUrl,
    primaryColor: profile?.brand?.primaryColor || '#0B4DB8',
    accentColor: profile?.brand?.accentColor || '#24A677',
    fontStyle: profile?.brand?.fontStyle ?? 'modern_sans',
    visualMood: profile?.brand?.visualMood ?? 'boutique',
    businessAddress: profile?.business?.address ?? '',
    businessHours: profile?.business?.hours ?? '',
    phoneInput: formatBrazilPhoneDisplay(rawPhone),
    deliveryEnabled: profile?.delivery?.deliveryEnabled !== false,
    pickupEnabled: profile?.delivery?.pickupEnabled !== false,
    deliveryModes: profile?.business?.deliveryModes && profile.business.deliveryModes.length > 0
      ? [...profile.business.deliveryModes]
      : ['pickup', 'local'],
    deliveryFeeInput: formatCentsToInputBrl(feeCents),
    deliveryAreasText: (profile?.delivery?.areas ?? []).join(', '),
    productName: '',
    productPriceInput: '',
    productCategory: 'Geral',
    productVariation: 'Padrão',
    productStockInput: '10',
    productDescription: '',
    productImageUrl: '',
    photoMode: 'draft',
    quickProducts: [],
    pixKey: profile?.payment?.pixKey ?? '',
    pixDiscountPercent: profile?.payment?.pixDiscountPercent ?? 0,
    acceptedMethods:
      profile?.payment?.acceptedMethods && profile.payment.acceptedMethods.length > 0
        ? [...profile.payment.acceptedMethods]
        : ['pix', 'credit_card', 'debit_card', 'cash'],
    paymentPolicy: profile?.payment?.paymentPolicy ?? 'pix_discount',
    faqCardAnswer: '',
    faqDeliveryAnswer: '',
    faqLocationAnswer: '',
    welcomeGreeting: profile?.agent?.welcomeMessage ?? '',
    nightNotice: '',
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
