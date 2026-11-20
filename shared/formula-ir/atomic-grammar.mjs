import { z } from 'zod';

/**
 * Parser determinístico para expressões paramétricas `ui: ... | fx: ... | ux: ... <tags>`
 */
export function parseAtomSpec(raw = '') {
  const str = String(raw || '').trim();
  const directives = [];
  const withoutTags = str.replace(/<([a-z0-9_.:->/]+)>/gi, (_, tag) => {
    directives.push(String(tag).trim());
    return ' ';
  });

  const params = {};
  const parts = withoutTags.split('|').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const cleaned = part.replace(/^(ui|fx|ux):/i, '').trim();
    for (const token of cleaned.split(/\s+/)) {
      const eqIdx = token.indexOf('=');
      if (eqIdx > 0) {
        const k = token.slice(0, eqIdx).trim();
        const v = token.slice(eqIdx + 1).trim();
        if (k) params[k] = v;
      }
    }
  }

  return { raw: str, params, directives };
}

export function clampNum(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return { r: 17, g: 24, b: 39 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function pickAccessibleInk(bgHex) {
  const darkContrast = contrastRatio('#0F172A', bgHex);
  const lightContrast = contrastRatio('#FFFFFF', bgHex);
  return lightContrast >= darkContrast ? '#FFFFFF' : '#0F172A';
}

export function resolveSectionSurfaceTokens({ primaryHex = '#111827', accentHex = '#0B4DB8', surfaceStr = '', sectionIndex = 0, prevIsDark = null }) {
  const parsed = parseAtomSpec(surfaceStr);
  const lumParam = parsed.params.lum !== undefined ? clampNum(parsed.params.lum, 0, 1, 0.98) : null;
  const bgParam = parsed.params.bg || '';
  const hasAltTemp = parsed.directives.some((d) => d.startsWith('alt_temp'));

  let isDark = lumParam !== null ? lumParam < 0.45 : sectionIndex === 0;
  if (hasAltTemp && prevIsDark !== null && sectionIndex > 0 && isDark === prevIsDark) {
    isDark = !prevIsDark;
  }

  let bgHex = '#FFFFFF';
  if (bgParam === 'logo[0]' && isDark) {
    bgHex = relativeLuminance(primaryHex) < 0.4 ? primaryHex : '#090D16';
  } else if (bgParam === 'logo[1]') {
    bgHex = accentHex;
  } else if (/^#[0-9a-f]{6}$/i.test(bgParam)) {
    bgHex = bgParam;
    isDark = relativeLuminance(bgHex) < 0.45;
  } else if (isDark) {
    bgHex = '#090D16';
  } else if (sectionIndex % 2 === 1) {
    bgHex = '#F8FAFC';
  }

  const inkHex = pickAccessibleInk(bgHex);
  const mutedHex = inkHex === '#FFFFFF' ? '#CBD5E1' : '#475569';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.09)';

  return {
    bgHex,
    inkHex,
    mutedHex,
    cardBg,
    borderColor,
    accentHex,
    isDark,
    blurPx: clampNum(parsed.params.blur, 0, 24, isDark ? 16 : 0),
  };
}

export const ImageRequestSchema = z.object({
  slotId: z.string().min(1).max(60),
  targetSectionId: z.string().min(1).max(60).optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', '4:5']).default('16:9'),
  width: z.number().int().min(512).max(1536).default(1344),
  height: z.number().int().min(512).max(1536).default(768),
  source: z.enum(['ai_generate', 'catalog_sku']).default('ai_generate'),
  sku: z.string().optional(),
  prompt: z.string().min(3).max(800),
  negativePrompt: z.string().max(400).default('watermark, blurry text, low quality, cropped, unrelated furniture'),
});

export const CURATED_ICON_CHOICES = [
  'none',
  'sparkles',
  'shield',
  'truck',
  'zap',
  'gift',
  'map_pin',
  'clock',
  'check',
  'message_circle',
  'star',
];

export const TextMicroTupleSchema = z.object({
  micro: z.tuple([
    z.enum([
      'top_left',
      'top_center',
      'hero_center',
      'left_col',
      'right_col',
      'overlay_bottom',
      'bottom_right',
      'card_footer',
    ]),
    z.enum(['eyebrow', 'display', 'heading', 'body', 'stat_callout', 'caption']),
    z.string().min(1).max(240),
    z.string().default('ui:sz=15 lh=1.5 wt=500 | ux:clamp=2'),
    z.string().default('icon:none'),
  ]),
  mediaPick: z.string().default('none'),
});

export const AtomicSectionTupleSchema = z.object({
  tuple: z.tuple([
    z.string().min(1), // sectionId
    z.enum([
      'hero_centered',
      'hero_split',
      'kinetic_ribbon',
      'scratch_reward',
      'dark_glass_vault',
      'split_curtain_portals',
      'sticky_lookbook',
      'bento_spotlight',
      'catalog_full_grid',
      'anchor_footer',
    ]),
    z.enum(['ESTADO_0', 'ESTADO_1', 'ESTADO_2', 'ESTADO_3', 'ESTADO_4']).default('ESTADO_1'),
  ]),
  surface: z.string().default('ui:bg=#FFFFFF lum=0.98 | ux:<auto_wcag:4.5> <alt_temp>'),
  layout: z.string().default('ui:cols=12 span=12/0 mob=2 gap=12/20 py=64/56 px=16/24 rad=20/14'),
  type: z.string().default('ui:sz=32/20/15/11 wt=800/600/400 ch=56 | ux:<tabular_nums>'),
  media: z.string().default('ui:ar=1:1 fit=contain pad=12 | ux:<on_error_monogram>'),
  catalog: z.string().default('ui:mode=none take=0 per_cat=0'),
  interact: z.string().default('ui:h=44 rad=12 | fx:press=0.97/120ms'),
  responsive: z.string().optional(),
  motion: z.string().optional(),
  dataBind: z.string().optional(),
  a11y: z.string().optional(),
  fallback: z.string().optional(),
  lighting: z.string().optional(),
  textureAndMask: z.string().optional(),
  cardAnatomy: z.string().optional(),
  photoTreatment: z.string().optional(),
  ornaments: z.string().optional(),
  onboardingLink: z.string().optional(),
  productNaming: z.string().optional(),
  storeContextRules: z.string().optional(),
  textStyle: z.string().optional(),
  textSlots: z.array(TextMicroTupleSchema).default([]),
  content: z.record(z.string(), z.unknown()).default({}),
  contract: z.string().default('guard:persona=visitante_publico h>=44 wcag>=4.5 <emit_confirmed>'),
});

export const AtomicBlueprintSchema = z.object({
  brandTokens: z.object({
    archetype: z.string().default('multi_category_retail'),
    paletteSource: z.string().default('logo_extracted'),
    colors: z.object({
      primary: z.string().default('#111827'),
      accent: z.string().default('#0B4DB8'),
      neutral: z.string().default('#F8FAFC'),
    }),
    fontPairing: z.enum(['geometric_bold', 'editorial_serif', 'clean_humanist']).default('geometric_bold'),
  }),
  imageRequests: z.array(ImageRequestSchema).default([]),
  sections: z.array(AtomicSectionTupleSchema).min(2).max(12),
});
