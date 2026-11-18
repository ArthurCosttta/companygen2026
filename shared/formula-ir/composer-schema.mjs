/**
 * Formula-IR v9.0 — Schema Único Configuracional (Zod v4 + Sanitizador + Calculadora Pura)
 * Shared single source of truth between Node backend (ESM) and React frontend (TS).
 */
import { z } from 'zod';

export const FORMULA_V9_VERSION = '9.0';

const SAFE_CSS_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DANGEROUS_URI_RE = /^(?:javascript|vbscript|data):/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i;

export function safeCssHex(val, fallback = '#0B4DB8') {
  const clean = String(val ?? '').trim();
  return SAFE_CSS_HEX_RE.test(clean) ? clean : fallback;
}

export function sanitizeSafeHref(raw, fallback = '#') {
  const clean = String(raw ?? '').replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!clean) return fallback;
  if (DANGEROUS_URI_RE.test(clean) || /^\/\//.test(clean)) return fallback;
  if (/^(?:https?:\/\/|mailto:|tel:|#)/i.test(clean)) return clean;
  if (/^(?:\.\.\/|\.\/|\/)?[a-z0-9._-][a-z0-9._/-]*\.html(?:[?#].*)?$/i.test(clean)) return clean;
  return fallback;
}

export function sanitizeSafeAssetUrl(raw, fallback = '') {
  const clean = String(raw ?? '').replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!clean) return fallback;
  if (/^(?:javascript|vbscript):/i.test(clean) || /^\/\//.test(clean)) return fallback;
  if (/^data:/i.test(clean)) {
    return SAFE_DATA_IMAGE_RE.test(clean) ? clean : fallback;
  }
  if (/^(?:https?:\/\/|\/(?!\/)|(?:\.\.\/|\.\/)?assets\/|[a-z0-9._-]+\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#].*)?$)/i.test(clean)) {
    return clean;
  }
  return fallback;
}

function isSafeHrefValue(val) {
  const clean = String(val ?? '').replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!clean) return true;
  return !DANGEROUS_URI_RE.test(clean) && !/^\/\//.test(clean);
}

function isSafeAssetUrlValue(val) {
  const clean = String(val ?? '').replace(/[\u0000-\u001F\u007F]+/g, '').trim();
  if (!clean) return true;
  if (/^(?:javascript|vbscript):/i.test(clean) || /^\/\//.test(clean)) return false;
  if (/^data:/i.test(clean)) return SAFE_DATA_IMAGE_RE.test(clean);
  return true;
}

const SafeHrefSchema = z.string().max(120).refine(isSafeHrefValue, { message: 'Protocolo inseguro em href.' });
const SafeNavHrefSchema = z.string().max(500).refine(isSafeHrefValue, { message: 'Protocolo inseguro em href.' });
const SafeAssetUrlSchema = z.string().refine(isSafeAssetUrlValue, { message: 'URL de mídia insegura.' });

export const WHITELISTED_ICONS = [
  'Sparkles',
  'ShieldCheck',
  'Clock',
  'MessageCircle',
  'Heart',
  'CheckCircle2',
  'Package',
  'Calendar',
  'Stethoscope',
  'PawPrint',
  'Utensils',
  'Smartphone',
  'Gift',
  'Palette',
  'MapPin',
  'Star',
  'ShoppingBag',
  'Sun',
  'Moon',
];

export const AtomOptionSchema = z.object({
  value: z.string().min(1).max(64),
  label: z.string().min(1).max(90),
  skuRef: z.string().max(64).optional(),
  priceCents: z.number().int().min(0).optional(),
  priceDeltaCents: z.number().int().min(-500000).max(5000000).optional(),
  note: z.string().max(110).optional(),
});

export const AtomControlSchema = z.discriminatedUnion('atomType', [
  z.object({
    id: z.string().min(1),
    atomType: z.literal('tabs_selector'),
    stateKey: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    options: z.array(AtomOptionSchema).min(1).max(6),
  }),
  z.object({
    id: z.string().min(1),
    atomType: z.literal('option_cards'),
    stateKey: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    options: z.array(AtomOptionSchema).min(1).max(8),
  }),
  z.object({
    id: z.string().min(1),
    atomType: z.literal('checklist_addons'),
    stateKey: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    options: z.array(AtomOptionSchema).min(1).max(10),
  }),
  z.object({
    id: z.string().min(1),
    atomType: z.literal('slider_range'),
    stateKey: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    min: z.number().int().min(1).max(100),
    max: z.number().int().min(2).max(500),
    step: z.number().int().min(1).max(50).default(1),
    unitLabel: z.string().min(1).max(30),
    pricePerUnitCents: z.number().int().min(0).default(0),
    skuRef: z.string().max(64).optional(),
  }),
  z.object({
    id: z.string().min(1),
    atomType: z.literal('slot_time_picker'),
    stateKey: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    slots: z.array(z.string().min(1).max(30)).min(1).max(12),
  }),
]);

export const CalcRuleSchema = z.object({
  mode: z.enum(['base_plus_addons', 'sum_selected', 'per_unit_slider', 'schedule_summary']).default('base_plus_addons'),
  pixDiscountPercent: z.number().min(0).max(90).default(0),
  summaryTitle: z.string().min(1).max(70).default('Resumo da sua escolha'),
  limitNote: z.string().max(180).default(''),
});

export const ActionBindingSchema = z.object({
  type: z.enum(['cart.add_selected', 'whatsapp.send_summary', 'catalog.filter']),
  label: z.string().min(1).max(60),
});

export const ImagePlanItemSchema = z.object({
  slotId: z.string().min(1).max(48).regex(/^[a-z0-9_-]+$/i),
  targetSectionId: z.string().min(1).max(48),
  role: z.enum(['hero', 'section_illustration', 'lifestyle_banner', 'detail_card', 'brand_logo']),
  tier: z.enum(['flux-dev', 'flux-schnell']).default('flux-schnell'),
  aspect: z.enum(['16:9', '4:3', '1:1']).default('4:3'),
  promptEn: z.string().min(10).max(480),
  assetUrl: SafeAssetUrlSchema.optional(),
  relativePath: z.string().optional(),
  filename: z.string().optional(),
  modelUsed: z.string().optional(),
  elapsedMs: z.number().optional(),
  status: z.enum(['pending', 'completed', 'error']).default('pending'),
});

export const DesignTokensSchema = z.object({
  accent: z.string().regex(SAFE_CSS_HEX_RE),
  accentDeep: z.string().regex(SAFE_CSS_HEX_RE),
  surface: z.string().regex(SAFE_CSS_HEX_RE),
  surfaceAlt: z.string().regex(SAFE_CSS_HEX_RE),
  card: z.string().regex(SAFE_CSS_HEX_RE).default('#FFFFFF'),
  ink: z.string().regex(SAFE_CSS_HEX_RE).default('#0F172A'),
  inkMuted: z.string().regex(SAFE_CSS_HEX_RE).default('#475569'),
  footerBg: z.string().regex(SAFE_CSS_HEX_RE),
  fontStyle: z.enum(['modern_sans', 'editorial_serif', 'clean_geometric']).default('modern_sans'),
  radiusPx: z.number().int().min(8).max(28).default(20),
});

export const SectionNodeSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('HeaderNav'),
    config: z.object({
      ctaLabel: z.string().max(40).default('Sacola'),
      showSearch: z.boolean().default(true),
      showBag: z.boolean().default(true),
      links: z.array(z.object({ label: z.string(), href: SafeNavHrefSchema })).default([]),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('HeroSection'),
    imageSlotId: z.string().optional(),
    config: z.object({
      variant: z.enum(['split', 'full_bleed']).default('split'),
      eyebrow: z.string().max(60).default(''),
      title: z.string().min(1).max(110),
      subtitle: z.string().max(240).default(''),
      primaryCta: z.object({ label: z.string().max(44), href: SafeHrefSchema }),
      secondaryCta: z.object({
        label: z.string().max(44),
        action: z.enum(['whatsapp.send_summary', 'scroll']).default('whatsapp.send_summary'),
      }).optional(),
      imageUrl: SafeAssetUrlSchema.optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('DifferentialsStrip'),
    config: z.object({
      items: z.array(z.object({
        icon: z.string().default('ShieldCheck'),
        title: z.string().min(1).max(60),
        text: z.string().max(110).default(''),
      })).min(1).max(4),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('InteractiveExperience'),
    imageSlotId: z.string().optional(),
    config: z.object({
      eyebrow: z.string().max(60).default(''),
      title: z.string().min(1).max(100),
      subtitle: z.string().max(220).default(''),
      layoutVariant: z.enum(['workbench_split', 'stacked_cards', 'compact_panel']).default('workbench_split'),
      stateDefaults: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])).default({}),
      controls: z.array(AtomControlSchema).min(1).max(5),
      calcRule: CalcRuleSchema,
      primaryAction: ActionBindingSchema,
      secondaryAction: ActionBindingSchema.optional(),
      imageUrl: SafeAssetUrlSchema.optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('EditorialMediaSplit'),
    imageSlotId: z.string().optional(),
    config: z.object({
      variant: z.enum(['media_left', 'media_right']).default('media_right'),
      eyebrow: z.string().max(60).default(''),
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(460),
      bullets: z.array(z.string().max(100)).max(5).default([]),
      ctaLabel: z.string().max(44).optional(),
      ctaHref: SafeHrefSchema.optional(),
      imageUrl: SafeAssetUrlSchema.optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('StepsTimeline'),
    imageSlotId: z.string().optional(),
    config: z.object({
      title: z.string().min(1).max(100),
      subtitle: z.string().max(200).default(''),
      tabs: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(50),
        steps: z.array(z.object({
          time: z.string().min(1).max(36),
          title: z.string().min(1).max(80),
          detail: z.string().max(200),
        })).min(1).max(6),
      })).min(1).max(4),
      imageUrl: SafeAssetUrlSchema.optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('HighlightsGrid'),
    config: z.object({
      title: z.string().min(1).max(100),
      subtitle: z.string().max(200).default(''),
      columns: z.union([z.literal(2), z.literal(3)]).default(2),
      cards: z.array(z.object({
        eyebrow: z.string().max(44).default(''),
        title: z.string().min(1).max(80),
        description: z.string().max(200).default(''),
        ctaLabel: z.string().max(40).default('Ver detalhes'),
        href: SafeHrefSchema.default('#catalogo'),
        imageSlotId: z.string().optional(),
        imageUrl: SafeAssetUrlSchema.optional(),
      })).min(1).max(3),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('FaqAccordion'),
    config: z.object({
      title: z.string().min(1).max(100),
      items: z.array(z.object({
        q: z.string().min(1).max(140),
        a: z.string().min(1).max(360),
      })).min(1).max(8),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('CatalogGrid'),
    config: z.object({
      title: z.string().min(1).max(100),
      subtitle: z.string().max(200).default(''),
      itemActionLabel: z.string().max(36).default('Adicionar'),
      emptyImageMode: z.literal('neutral_gray').default('neutral_gray'),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('ClosingScheduleSplit'),
    imageSlotId: z.string().optional(),
    config: z.object({
      eyebrow: z.string().max(60).default('Atendimento'),
      title: z.string().min(1).max(100),
      subtitle: z.string().max(200).default(''),
      slots: z.array(z.string().max(24)).max(6).default([]),
      whatsappHeading: z.string().min(1).max(90),
      whatsappSubtext: z.string().max(200).default(''),
      ctaLabel: z.string().max(44).default('Chamar no WhatsApp'),
      imageUrl: SafeAssetUrlSchema.optional(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('RichFooter'),
    config: z.object({
      tagline: z.string().max(220).default(''),
      showNewsletter: z.boolean().default(true),
    }),
  }),
]);

export const AnalysisSchema = z.object({
  factsConfirmed: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  mainExperienceSummary: z.string().default(''),
});

export const FormulaV9PageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  filename: z
    .string()
    .min(1)
    .max(120)
    .refine(
      (val) =>
        !val.includes('..') &&
        !val.includes('\\') &&
        !val.startsWith('/') &&
        /^[a-z0-9._/-]+\.html$/i.test(val),
      { message: 'Filename de página inválido.' },
    ),
  title: z.string().min(1),
  isHome: z.boolean().default(false),
  sections: z.array(SectionNodeSchema).min(1).max(9),
});

const SafeCatalogRecordSchema = z.record(z.string(), z.unknown()).superRefine((item, ctx) => {
  for (const key of ['href', 'url']) {
    if (typeof item[key] === 'string' && !isSafeHrefValue(item[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Protocolo inseguro em catalog.${key}.`,
      });
    }
  }
  if (typeof item.imageUrl === 'string' && !isSafeAssetUrlValue(item.imageUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageUrl'],
      message: 'URL insegura em catalog.imageUrl.',
    });
  }
});

export const FormulaV9DocumentSchema = z.object({
  version: z.literal(FORMULA_V9_VERSION),
  generatedAt: z.string().optional(),
  generatedBy: z.string().optional(),
  modelUsed: z.string().optional(),
  analysis: AnalysisSchema.default({ factsConfirmed: [], dependencies: [], mainExperienceSummary: '' }),
  designTokens: DesignTokensSchema,
  imagePlan: z.array(ImagePlanItemSchema).max(5).default([]),
  sections: z.array(SectionNodeSchema).max(7).default([]),
  pages: z.array(FormulaV9PageSchema).optional(),
  storeInfo: z.record(z.string(), z.unknown()).optional(),
  catalog: z.array(SafeCatalogRecordSchema).optional(),
});

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return { r: 11, g: 77, b: 184 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function mixHex(hexA, hexB, weightB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w,
  );
}

/**
 * Derives an accessible cohesive token palette dynamically from any chosen brand hex color.
 */
export function deriveThemeTokensFromHex(primaryHex = '#0B4DB8', fontStyle = 'modern_sans') {
  const normalizedHex = safeCssHex(primaryHex, '#0B4DB8').toUpperCase();
  const safeAccent = normalizedHex.length === 4
    ? '#' + normalizedHex.slice(1).split('').map((c) => c + c).join('')
    : normalizedHex.slice(0, 7);
  const safeFont = ['modern_sans', 'editorial_serif', 'clean_geometric'].includes(fontStyle)
    ? fontStyle
    : 'modern_sans';

  const rgb = hexToRgb(safeAccent);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const isVeryDark = luminance < 0.18;

  const accent = isVeryDark ? '#2563EB' : safeAccent;
  const accentDeep = mixHex(accent, '#070F1C', 0.34);
  const footerBg = mixHex(accent, '#050C17', 0.62);
  const surface = mixHex(accent, '#FFFFFF', 0.95);
  const surfaceAlt = mixHex(accent, '#FFFFFF', 0.88);
  const ink = mixHex(accent, '#0A1322', 0.86);
  const inkMuted = '#475569';

  return {
    accent,
    accentDeep,
    surface,
    surfaceAlt,
    card: '#FFFFFF',
    ink,
    inkMuted,
    footerBg,
    fontStyle: safeFont,
    radiusPx: safeFont === 'clean_geometric' ? 14 : 22,
  };
}

const SERVICE_KEYWORDS =
  /agend|sess[aã]o|hor[aá]rio|consulta|exame|vacin|banho|tosa|hidrata[cç][aã]o de pelagem|corte de unha|limpeza de ouvido|escova[cç][aã]o|hospedagem|hotel|creche|adestramento|passeio|barba|manicure|pedicure|massagem|depila[cç][aã]o|instala[cç][aã]o|manuten[cç][aã]o|revis[aã]o|aula|curso|visita/;

/**
 * Shared spreadsheet item type classifier (supports products vs scheduled services vs kits vs custom).
 */
export function normalizeSpreadsheetItemType({
  rawType = '',
  name = '',
  category = '',
  description = '',
  defaultBusinessModel = 'produtos',
  sourceHint = '',
} = {}) {
  const explicit = String(rawType || '').toLowerCase();
  if (/servico_agendado|servi[cç]o|agend|sess[aã]o|consulta/.test(explicit)) return 'servico_agendado';
  if (/kit_combo|kit|combo|cesta|pacote/.test(explicit)) return 'kit_combo';
  if (/sob_medida|medida|encomenda|personaliz|planejad/.test(explicit)) return 'sob_medida';
  if (/produto_fisico|produto/.test(explicit)) return 'produto_fisico';

  const combined = `${name} ${category} ${description}`.toLowerCase();
  if (/\bkits?\b|\bcombos?\b/i.test(combined)) return 'kit_combo';
  if (SERVICE_KEYWORDS.test(combined)) return 'servico_agendado';
  if (/\bkits?\b|\bcombos?\b|cesta|duo\b|trio\b|caixa\s+(?:de\s+|presente|degust)/i.test(combined)) return 'kit_combo';
  if (/sob medida|personalizad|planejad|encomenda/.test(combined)) return 'sob_medida';
  if (/\b(?:ra[cç][aã]o|coleira|brinquedo|petisco|shampoo|caderno|camiseta|perfume|sapato)\b|\b\d+\s?(?:kg|g|ml|l)\b/i.test(combined)) {
    return 'produto_fisico';
  }

  if (defaultBusinessModel === 'servicos' || /servi[cç]os/i.test(String(sourceHint || ''))) {
    return 'servico_agendado';
  }
  return 'produto_fisico';
}

/**
 * Pure shared calculator for InteractiveExperience (identical behavior in React and offline static HTML/JS).
 */
export function evaluateInteractiveExperience({ controls = [], state = {}, calcRule = {}, catalog = [] } = {}) {
  const catalogByRef = new Map();
  for (const p of Array.isArray(catalog) ? catalog : []) {
    if (p?.sku) catalogByRef.set(String(p.sku).toUpperCase(), p);
    if (p?.id) catalogByRef.set(String(p.id), p);
  }

  let totalCents = 0;
  const chosenSummaryLines = [];
  const selectedProducts = [];

  for (const ctrl of Array.isArray(controls) ? controls : []) {
    const val = state[ctrl.stateKey];
    if (ctrl.atomType === 'tabs_selector' || ctrl.atomType === 'option_cards') {
      const match = (ctrl.options || []).find((o) => o.value === val) || ctrl.options?.[0];
      if (match) {
        const realSku = match.skuRef
          ? catalogByRef.get(String(match.skuRef).toUpperCase()) || catalogByRef.get(String(match.skuRef))
          : null;
        const unitCents = realSku
          ? Number(realSku.priceCents || 0)
          : Number(match.priceCents ?? match.priceDeltaCents ?? 0);
        totalCents += unitCents;
        chosenSummaryLines.push(`${ctrl.label}: ${match.label}`);
        if (realSku) selectedProducts.push(realSku);
      }
    } else if (ctrl.atomType === 'checklist_addons') {
      const activeArr = Array.isArray(val) ? val : [];
      for (const opt of ctrl.options || []) {
        if (!activeArr.includes(opt.value)) continue;
        const realSku = opt.skuRef
          ? catalogByRef.get(String(opt.skuRef).toUpperCase()) || catalogByRef.get(String(opt.skuRef))
          : null;
        const addonCents = realSku ? Number(realSku.priceCents || 0) : Number(opt.priceCents || 0);
        totalCents += addonCents;
        chosenSummaryLines.push(`+ ${opt.label}`);
        if (realSku) selectedProducts.push(realSku);
      }
    } else if (ctrl.atomType === 'slider_range') {
      const minVal = Number(ctrl.min ?? 1);
      const maxVal = Number(ctrl.max ?? 10);
      const qty = Math.max(minVal, Math.min(maxVal, Number(val ?? minVal)));
      totalCents += qty * Number(ctrl.pricePerUnitCents || 0);
      chosenSummaryLines.push(`${ctrl.label}: ${qty} ${ctrl.unitLabel}`);
    } else if (ctrl.atomType === 'slot_time_picker' && val) {
      chosenSummaryLines.push(`${ctrl.label}: ${String(val)}`);
    }
  }

  const safeTotal = Math.max(0, Math.round(totalCents));
  const pixPct = Math.max(0, Math.min(90, Number(calcRule?.pixDiscountPercent || 0)));
  const pixTotalCents = pixPct > 0 ? Math.max(0, safeTotal - Math.round((safeTotal * pixPct) / 100)) : safeTotal;
  return {
    totalCents: safeTotal,
    pixTotalCents,
    pixDiscountPercent: pixPct,
    chosenSummaryLines,
    selectedProducts,
  };
}

/**
 * Deterministic sanitizer enforcing constraints, real catalog prices/Pix, and <=7 sections / <=5 imagePlan items.
 */
export function sanitizeFormulaV9Document(rawDoc, profile = {}) {
  const safeCatalog = Array.isArray(profile?.catalog?.products) ? profile.catalog.products.filter((p) => p && p.active !== false) : [];
  const catalogByRef = new Map();
  for (const p of safeCatalog) {
    if (p?.sku) catalogByRef.set(String(p.sku).toUpperCase(), p);
    if (p?.id) catalogByRef.set(String(p.id), p);
  }

  const pixDiscountPercent = Math.max(0, Math.min(90, Number(profile?.payment?.pixDiscountPercent || 0)));
  const hasRealLogo = Boolean(String(profile?.brand?.logoUrl || '').trim());
  const hasRealStorefrontPhoto = Boolean(String(profile?.brand?.storefrontPhotoUrl || '').trim());

  const candidateSections = Array.isArray(rawDoc?.sections)
    ? rawDoc.sections
    : Array.isArray(rawDoc?.pages?.[0]?.sections)
      ? rawDoc.pages[0].sections
      : [];

  const parsedSections = [];
  for (const rawSec of candidateSections.slice(0, 7)) {
    if (!rawSec || typeof rawSec !== 'object') continue;
    const cloned = JSON.parse(JSON.stringify(rawSec));

    if (cloned.type === 'InteractiveExperience' && Array.isArray(cloned?.config?.controls)) {
      const defaults = { ...(cloned.config.stateDefaults || {}) };
      cloned.config.controls = cloned.config.controls
        .slice(0, 5)
        .map((ctrl, cIdx) => {
          if (!ctrl || typeof ctrl !== 'object') return null;
          const id = String(ctrl.id || `ctrl_${cIdx + 1}`);
          const stateKey = String(ctrl.stateKey || `key_${cIdx + 1}`).replace(/[^a-z0-9_]/gi, '_').slice(0, 40) || `key_${cIdx + 1}`;
          if (Array.isArray(ctrl.options)) {
            ctrl.options = ctrl.options.map((opt) => {
              const found = opt?.skuRef
                ? catalogByRef.get(String(opt.skuRef).toUpperCase()) || catalogByRef.get(String(opt.skuRef))
                : null;
              return found ? { ...opt, label: found.name, priceCents: Math.max(0, Number(found.priceCents || 0)) } : opt;
            });
            if (ctrl.atomType === 'checklist_addons') {
              if (!Array.isArray(defaults[stateKey])) defaults[stateKey] = [];
            } else if (!defaults[stateKey] || !ctrl.options.some((o) => o.value === defaults[stateKey])) {
              defaults[stateKey] = ctrl.options[0]?.value || '';
            }
          } else if (ctrl.atomType === 'slider_range') {
            defaults[stateKey] = Number.isFinite(Number(defaults[stateKey])) ? Number(defaults[stateKey]) : Number(ctrl.min || 1);
          } else if (ctrl.atomType === 'slot_time_picker' && Array.isArray(ctrl.slots)) {
            if (!defaults[stateKey]) defaults[stateKey] = ctrl.slots[0] || '';
          }
          return { ...ctrl, id, stateKey };
        })
        .filter(Boolean);

      cloned.config.stateDefaults = defaults;
      if (cloned.config.calcRule) {
        cloned.config.calcRule.pixDiscountPercent = pixDiscountPercent;
      }
    }

    if (cloned.type === 'DifferentialsStrip' && Array.isArray(cloned?.config?.items)) {
      cloned.config.items = cloned.config.items.slice(0, 4).map((it) => ({
        ...it,
        icon: WHITELISTED_ICONS.includes(it?.icon) ? it.icon : 'ShieldCheck',
      }));
    }

    if (cloned.type === 'HeaderNav' && Array.isArray(cloned?.config?.links)) {
      cloned.config.links = cloned.config.links.map((l) => ({
        ...l,
        href: sanitizeSafeHref(l?.href, '#'),
      }));
    }

    if (cloned.type === 'HeroSection' && cloned?.config?.primaryCta && typeof cloned.config.primaryCta === 'object') {
      cloned.config.primaryCta = {
        ...cloned.config.primaryCta,
        href: sanitizeSafeHref(cloned.config.primaryCta.href, '#'),
      };
    }

    if (cloned.type === 'EditorialMediaSplit' && cloned?.config && cloned.config.ctaHref !== undefined) {
      cloned.config.ctaHref = sanitizeSafeHref(cloned.config.ctaHref, '#catalogo');
    }

    if (cloned.type === 'HighlightsGrid' && Array.isArray(cloned?.config?.cards)) {
      cloned.config.cards = cloned.config.cards.map((card) => ({
        ...card,
        href: sanitizeSafeHref(card?.href, '#catalogo'),
        ...(card?.imageUrl !== undefined ? { imageUrl: sanitizeSafeAssetUrl(card.imageUrl, '') } : {}),
      }));
    }

    if (cloned?.config && typeof cloned.config.imageUrl === 'string') {
      cloned.config.imageUrl = sanitizeSafeAssetUrl(cloned.config.imageUrl, '');
    }

    const check = SectionNodeSchema.safeParse(cloned);
    if (check.success) parsedSections.push(check.data);
  }

  const rawImagePlan = Array.isArray(rawDoc?.imagePlan) ? rawDoc.imagePlan : [];
  const imagePlan = [];
  for (const item of rawImagePlan) {
    if (imagePlan.length >= 5) break;
    const candidateItem = item && typeof item === 'object' && typeof item.assetUrl === 'string'
      ? { ...item, assetUrl: sanitizeSafeAssetUrl(item.assetUrl, '') }
      : item;
    const check = ImagePlanItemSchema.safeParse(candidateItem);
    if (!check.success) continue;
    if (hasRealLogo && check.data.role === 'brand_logo') continue;
    imagePlan.push({ ...check.data, status: check.data.status || 'pending' });
  }

  if (hasRealStorefrontPhoto) {
    const safeStorefrontUrl = sanitizeSafeAssetUrl(profile.brand.storefrontPhotoUrl, '');
    if (safeStorefrontUrl) {
      for (const sec of parsedSections) {
        if ((sec.type === 'ClosingScheduleSplit' || sec.type === 'EditorialMediaSplit') && !sec.config.imageUrl) {
          sec.config.imageUrl = safeStorefrontUrl;
        }
      }
    }
  }

  const fallbackTokens = deriveThemeTokensFromHex(
    profile?.brand?.primaryColor && profile.brand.primaryColor !== '#111827'
      ? profile.brand.primaryColor
      : '#0B4DB8',
    profile?.brand?.fontStyle || 'modern_sans',
  );
  const rawTokens = rawDoc?.designTokens && typeof rawDoc.designTokens === 'object'
    ? rawDoc.designTokens
    : rawDoc?.themeTokens && typeof rawDoc.themeTokens === 'object'
      ? rawDoc.themeTokens
      : null;
  const tokensCheck = DesignTokensSchema.safeParse(rawTokens);
  const tokenSrc = tokensCheck.success ? tokensCheck.data : rawTokens;
  const requestedFont = profile?.brand?.fontStyle || tokenSrc?.fontStyle;
  const designTokens = tokenSrc && typeof tokenSrc === 'object'
    ? {
        accent: safeCssHex(tokenSrc.accent, fallbackTokens.accent),
        accentDeep: safeCssHex(tokenSrc.accentDeep, fallbackTokens.accentDeep),
        surface: safeCssHex(tokenSrc.surface, fallbackTokens.surface),
        surfaceAlt: safeCssHex(tokenSrc.surfaceAlt, fallbackTokens.surfaceAlt),
        card: safeCssHex(tokenSrc.card, fallbackTokens.card),
        ink: safeCssHex(tokenSrc.ink, fallbackTokens.ink),
        inkMuted: safeCssHex(tokenSrc.inkMuted, fallbackTokens.inkMuted),
        footerBg: safeCssHex(tokenSrc.footerBg, fallbackTokens.footerBg),
        fontStyle: ['modern_sans', 'editorial_serif', 'clean_geometric'].includes(requestedFont)
          ? requestedFont
          : fallbackTokens.fontStyle,
        radiusPx: Number.isFinite(Number(tokenSrc.radiusPx))
          ? Math.max(8, Math.min(28, Math.round(Number(tokenSrc.radiusPx))))
          : fallbackTokens.radiusPx,
      }
    : fallbackTokens;

  const safeAnalysis = AnalysisSchema.safeParse(rawDoc?.analysis);

  const sanitizedCatalog = Array.isArray(rawDoc?.catalog)
    ? rawDoc.catalog
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          ...item,
          ...(typeof item.href === 'string' ? { href: sanitizeSafeHref(item.href, '#catalogo') } : {}),
          ...(typeof item.url === 'string' ? { url: sanitizeSafeHref(item.url, '#catalogo') } : {}),
          ...(typeof item.imageUrl === 'string' ? { imageUrl: sanitizeSafeAssetUrl(item.imageUrl, '') } : {}),
        }))
    : undefined;

  return {
    version: FORMULA_V9_VERSION,
    generatedAt: String(rawDoc?.generatedAt || new Date().toISOString()),
    generatedBy: String(rawDoc?.generatedBy || 'glm-architect-v9'),
    modelUsed: String(rawDoc?.modelUsed || 'zai-org/GLM-5.3'),
    analysis: safeAnalysis.success
      ? safeAnalysis.data
      : { factsConfirmed: [], dependencies: [], mainExperienceSummary: '' },
    designTokens,
    imagePlan,
    sections: parsedSections,
    ...(sanitizedCatalog !== undefined ? { catalog: sanitizedCatalog } : {}),
  };
}
