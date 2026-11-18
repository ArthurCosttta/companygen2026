/**
 * Formula-IR 8.2 — Schema e Validador Universal Configuracional (Zero Hardcode de Nicho)
 */

export const FORMULA_IR_VERSION = '8.2';

export const FORMULA_BLOCK_TYPES = [
  'topbar_nav',
  'hero_band',
  'trust_bar',
  'step_routine_builder',
  'tabs_timeline_map',
  'catalog_grid_20x',
  'wide_cards_pair',
  'scheduler_pickup_split',
  'rich_footer',
];

export const FORMULA_PALETTES = {
  lume_clinical_blue: {
    id: 'lume_clinical_blue',
    label: 'Azul Clínico Editorial',
    surface: '#F3F8FE',
    surfaceAlt: '#E6F0FA',
    card: '#FFFFFF',
    ink: '#0A2540',
    inkMuted: '#475569',
    accent: '#0B4DB8',
    accentDeep: '#083B9A',
    footerBg: '#062E78',
    accentText: '#FFFFFF',
    border: 'rgba(11, 77, 184, 0.10)',
    cardShadow: '0 14px 36px -10px rgba(11, 77, 184, 0.08)',
    radiusPx: 24,
  },
  sage_editorial: {
    id: 'sage_editorial',
    label: 'Sálvia Editorial',
    surface: '#F3F8FE',
    surfaceAlt: '#E6F0FA',
    card: '#FFFFFF',
    ink: '#0A2540',
    inkMuted: '#475569',
    accent: '#0B4DB8',
    accentDeep: '#083B9A',
    footerBg: '#062E78',
    accentText: '#FFFFFF',
    border: 'rgba(11, 77, 184, 0.10)',
    cardShadow: '0 14px 36px -10px rgba(11, 77, 184, 0.08)',
    radiusPx: 24,
  },
  cobalt_trust: {
    id: 'cobalt_trust',
    label: 'Cobalto Confiança',
    surface: '#F3F8FE',
    surfaceAlt: '#E6F0FA',
    card: '#FFFFFF',
    ink: '#0A2540',
    inkMuted: '#475569',
    accent: '#0B4DB8',
    accentDeep: '#083B9A',
    footerBg: '#062E78',
    accentText: '#FFFFFF',
    border: 'rgba(11, 77, 184, 0.10)',
    cardShadow: '0 14px 36px -10px rgba(11, 77, 184, 0.08)',
    radiusPx: 24,
  },
  warm_terracotta: {
    id: 'warm_terracotta',
    label: 'Terracota Atelier',
    surface: '#FAF6F2',
    surfaceAlt: '#F2E9E1',
    card: '#FFFFFF',
    ink: '#0A2540',
    inkMuted: '#6A584F',
    accent: '#B4532A',
    accentDeep: '#083B9A',
    footerBg: '#062E78',
    accentText: '#FFFFFF',
    border: 'rgba(11, 77, 184, 0.10)',
    cardShadow: '0 14px 36px -10px rgba(11, 77, 184, 0.08)',
    radiusPx: 24,
  },
};

export function resolveFormulaThemeTokens(profile = {}, paletteOverride = null) {
  const brand = profile?.brand || {};
  const presetKey =
    (typeof paletteOverride === 'string' && FORMULA_PALETTES[paletteOverride] ? paletteOverride : null) ||
    (typeof brand.themePreset === 'string' && FORMULA_PALETTES[brand.themePreset] ? brand.themePreset : null) ||
    'lume_clinical_blue';
  const base = FORMULA_PALETTES[presetKey] || FORMULA_PALETTES.lume_clinical_blue;
  const customAccent = typeof brand.primaryColor === 'string' && /^#[0-9a-f]{6}$/i.test(brand.primaryColor)
    ? brand.primaryColor
    : '';
  return {
    ...base,
    accent: customAccent && brand.primaryColor !== '#111827' ? customAccent : base.accent,
    fontDisplay: "'Inter', system-ui, -apple-system, sans-serif",
    fontBody: "'Inter', system-ui, -apple-system, sans-serif",
  };
}

export function slugifyFormulaId(raw, fallback = 'pagina') {
  const clean = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return clean || fallback;
}

export function validateFormulaIrDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['Documento Formula-IR ausente.'] };
  }
  if (doc.version !== FORMULA_IR_VERSION) {
    errors.push(`Versão inválida: esperado ${FORMULA_IR_VERSION}.`);
  }
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    errors.push('Nenhuma página definida em pages[].');
  } else {
    for (const page of doc.pages) {
      if (!page?.id || !page?.filename || !Array.isArray(page?.blocks)) {
        errors.push(`Página inválida: ${page?.id || 'sem id'}.`);
        continue;
      }
      for (const blk of page.blocks) {
        if (!blk?.id || !FORMULA_BLOCK_TYPES.includes(blk?.type)) {
          errors.push(`Bloco inválido na página ${page.filename}: ${blk?.type || 'desconhecido'}.`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
