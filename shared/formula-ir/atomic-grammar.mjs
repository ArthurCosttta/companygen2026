import { z } from 'zod';
import { deriveOklchPaletteSystem, pickContrastInk, tuneHexForMinContrast } from './visual-math-engine.mjs';

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

function mixHexColor(hexA, hexB, weightB) {
  const parse = (hx) => {
    const clean = String(hx || '').replace('#', '').trim().padEnd(6, '0').slice(0, 6);
    const num = parseInt(clean, 16);
    if (!Number.isFinite(num)) return [15, 23, 42];
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const r = clamp(r1 + (r2 - r1) * weightB);
  const g = clamp(g1 + (g2 - g1) * weightB);
  const b = clamp(b1 + (b2 - b1) * weightB);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function ensureAccessibleAccent(accentHex, bgHex, isDark, primaryHex = '#111827') {
  const base = /^#[0-9a-f]{6}$/i.test(String(accentHex || '')) ? String(accentHex) : '#D8A848';
  if (contrastRatio(base, bgHex) >= 4.5) return base;
  if (/^#[0-9a-f]{6}$/i.test(String(primaryHex || '')) && contrastRatio(primaryHex, bgHex) >= 4.5) {
    return primaryHex;
  }
  const target = isDark ? '#FDE68A' : '#1D1D1F';
  for (let step = 0.25; step <= 1.0; step += 0.15) {
    const mixed = mixHexColor(base, target, step);
    if (contrastRatio(mixed, bgHex) >= 4.6) return mixed;
  }
  return isDark ? '#F5C451' : '#1D1D1F';
}

export function resolveSectionSurfaceTokens({
  primaryHex = '#111827',
  accentHex = '#D8A848',
  surfaceStr = '',
  sectionIndex = 0,
  prevIsDark = null,
  groundMode = 'warm_linen',
}) {
  const parsed = parseAtomSpec(surfaceStr);
  const lumParam = parsed.params.lum !== undefined ? clampNum(parsed.params.lum, 0, 1, 0.98) : null;
  const bgParam = parsed.params.bg || '';
  const isWash = parsed.directives.some((d) => d.includes('soft_wash'));
  const hasAltTemp = parsed.directives.some((d) => d.startsWith('alt_temp'));

  const sys = deriveOklchPaletteSystem({
    brandHex: primaryHex,
    accentHex,
    groundMode,
  });

  let isDark = lumParam !== null ? lumParam < 0.45 : sectionIndex === 0;
  if (bgParam === 'anchor_dark' || bgParam === 'logo[0]') isDark = lumParam !== null ? lumParam < 0.45 : true;
  if (bgParam === 'ground' || bgParam === 'warm_linen') isDark = false;
  if (hasAltTemp && prevIsDark !== null && sectionIndex > 0 && isDark === prevIsDark) {
    isDark = !prevIsDark;
  }

  let bgHex = sys.groundBg;
  if (isDark) {
    bgHex = bgParam && /^#[0-9a-f]{6}$/i.test(bgParam) ? bgParam : sys.anchorDarkBg;
  } else if (isWash) {
    bgHex = sys.softWashBg;
  } else if (bgParam && /^#[0-9a-f]{6}$/i.test(bgParam)) {
    bgHex = bgParam;
    isDark = relativeLuminance(bgHex) < 0.45;
  } else if (sectionIndex % 2 === 1) {
    bgHex = sys.groundAltBg;
  }

  const inkHex = isDark ? sys.inkOnDark : sys.inkOnLight;
  const mutedHex = isDark ? sys.mutedOnDark : sys.mutedOnLight;
  const safeAccentHex = tuneHexForMinContrast(isDark ? sys.accentOnDark : sys.accentOnLight, bgHex, 4.6);
  const accentInkHex = pickContrastInk(safeAccentHex);
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : sys.cardBg;
  const borderColor = isDark ? sys.hairlineDark : sys.hairlineLight;

  return {
    bgHex,
    inkHex,
    mutedHex,
    cardBg,
    borderColor,
    accentHex: safeAccentHex,
    accentInkHex,
    anchorDarkBg: sys.anchorDarkBg,
    groundBg: sys.groundBg,
    softWashBg: sys.softWashBg,
    isDark,
    blurPx: clampNum(parsed.params.blur, 0, 24, isDark ? 18 : 0),
  };
}

export const ImageRequestSchema = z.object({
  slotId: z.string().min(1).max(60),
  targetSectionId: z.string().min(1).max(60).optional(),
  moldeId: z.string().max(64).optional(),
  aspectRatio: z.enum(['16:9', '16:10', '4:3', '1:1', '4:5', '3:4']).default('16:9'),
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
    z.string().default('icon:none').refine(
      (val) => {
        const clean = String(val || '').replace(/^icon:/, '').trim();
        return !clean || CURATED_ICON_CHOICES.includes(clean);
      },
      { message: 'Icon must be one of CURATED_ICON_CHOICES' },
    ),
  ]),
  mediaPick: z.string().default('none'),
});

export const AtomicSectionTupleSchema = z.object({
  tuple: z.tuple([
    z.string().min(1), // sectionId
    z.enum([
      'hero_stage',
      'hero_centered',
      'hero_split',
      'domain_workbench',
      'coupled_media_grid',
      'embedded_banner',
      'split_story',
      'open_columns_strip',
      'kinetic_ribbon',
      'scratch_reward',
      'dark_glass_vault',
      'split_curtain_portals',
      'sticky_lookbook',
      'bento_spotlight',
      'catalog_full_grid',
      'anchor_footer',
      'campaign_christmas_hero',
      'campaign_christmas_checkpoints',
      'campaign_blackfriday_hero',
      'campaign_blackfriday_drop',
      'campaign_blackfriday_terms',
      'clinic_editorial_hero',
      'clinic_symptom_map',
      'clinic_specialists_deck',
      'clinic_pricing_tiers',
      'clinic_case_scoreboard',
      'interactive_image_text_stage',
      'bundle_builder_calculator',
      'calendar_delivery_slots',
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
  workbench: z.string().optional(),
  onboardingLink: z.string().optional(),
  productNaming: z.string().optional(),
  storeContextRules: z.string().optional(),
  textStyle: z.string().optional(),
  direction: z
    .object({
      focalPoint: z.object({ xPct: z.number().min(0).max(100), yPct: z.number().min(0).max(100) }).optional(),
      textAnchor: z.enum(['left', 'right', 'center', 'bottom_left']).optional(),
      typoScale: z.enum(['refined_lg', 'editorial_xxl', 'poster_mega']).optional(),
      interactionMode: z
        .enum(['static', 'hotspot_zoom_sync', 'hover_parallax_copy', 'scroll_reveal_couple'])
        .optional(),
      scrimAutoLock: z.boolean().optional(),
      hotspots: z
        .array(
          z.object({
            id: z.string(),
            xPct: z.number().min(0).max(100),
            yPct: z.number().min(0).max(100),
            pinLabel: z.string().max(24),
            headline: z.string().max(100),
            description: z.string().max(260),
            linkedSkuId: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  textSlots: z.array(TextMicroTupleSchema).default([]),
  content: z.record(z.string(), z.unknown()).default({}),
  contract: z.string().default('guard:persona=visitante_publico h>=44 wcag>=4.5 <emit_confirmed>'),
});

export const AtomicBlueprintSchema = z.object({
  engineSeed: z.object({
    groundMode: z.enum(['warm_linen', 'soft_tint', 'cool_mist', 'pure_gallery']).default('warm_linen'),
    displayVoice: z
      .enum([
        'archivo',
        'big_shoulders',
        'fraunces',
        'instrument_serif',
        'bricolage',
        'plus_jakarta',
        'playfair',
        'space_grotesk',
        'cormorant',
        'syne',
      ])
      .default('archivo'),
    bodyVoice: z.enum(['manrope', 'plus_jakarta', 'inter', 'dm_sans']).default('manrope'),
    scaleRatio: z.number().min(1.125).max(1.5).default(1.333),
    signatureOrnament: z.enum(['flanked_lines', 'trailing_line', 'slanted_bar', 'corner_sparks']).default('trailing_line'),
    headerMode: z.enum(['anchor_dark_center_nav', 'light_divided_bar']).default('anchor_dark_center_nav'),
    footerMode: z.enum(['anchor_dark_4col_watermark', 'anchor_dark_compact']).default('anchor_dark_4col_watermark'),
  }).optional(),
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
