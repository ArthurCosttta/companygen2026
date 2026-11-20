import { createHash } from 'node:crypto';

export const EXPERIENCE_MATRIX = {
  heroVariants: [
    'split_editorial',
    'full_bleed_spotlight',
    'bento_showcase',
    'minimal_typographic',
    'catalog_first',
  ],
  sectionVariants: [
    'comparison_table',
    'steps_timeline',
    'bento_benefits',
    'faq_accordion',
    'social_proof_wall',
    'guarantee_seal',
  ],
  cardVariants: [
    'compact_2col',
    'editorial_tall',
    'quick_add_pill',
    'service_booking_row',
  ],
  rhythmVariants: [
    'airy_luxury',
    'dense_commerce',
    'bold_tech',
  ],
};

export function computeStoreIdentityId({ slug = '', niche = '', name = '' } = {}) {
  const seed = `${String(slug).trim().toLowerCase()}|${String(niche).trim().toLowerCase()}|${String(name).trim().toLowerCase()}`;
  const hex8 = createHash('sha256').update(seed || 'companygen-default').digest('hex').slice(0, 8);
  return `cg_${hex8}`;
}

export function pickExperienceCombo(storeIdentityId = 'cg_00000000', overrides = {}) {
  const digest = createHash('sha256').update(String(storeIdentityId)).digest();
  const heroVariant = EXPERIENCE_MATRIX.heroVariants.includes(overrides.heroVariant)
    ? overrides.heroVariant
    : EXPERIENCE_MATRIX.heroVariants[digest[0] % EXPERIENCE_MATRIX.heroVariants.length];
  const cardVariant = EXPERIENCE_MATRIX.cardVariants.includes(overrides.cardVariant)
    ? overrides.cardVariant
    : EXPERIENCE_MATRIX.cardVariants[digest[1] % EXPERIENCE_MATRIX.cardVariants.length];
  const rhythm = EXPERIENCE_MATRIX.rhythmVariants.includes(overrides.rhythm)
    ? overrides.rhythm
    : EXPERIENCE_MATRIX.rhythmVariants[digest[2] % EXPERIENCE_MATRIX.rhythmVariants.length];

  const pool = [...EXPERIENCE_MATRIX.sectionVariants];
  const sectionOrder = [];
  for (let i = 0; i < 3 && pool.length > 0; i += 1) {
    const idx = digest[3 + i] % pool.length;
    sectionOrder.push(pool.splice(idx, 1)[0]);
  }

  return {
    storeIdentityId,
    heroVariant,
    cardVariant,
    rhythm,
    sectionOrder,
  };
}

export function sanitizeCustomHtmlBlock(rawHtml = '') {
  let clean = String(rawHtml || '');
  clean = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  clean = clean.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  clean = clean.replace(/<embed\b[^>]*>/gi, '');
  clean = clean.replace(/<meta\b[^>]*>/gi, '');
  clean = clean.replace(/<base\b[^>]*>/gi, '');
  clean = clean.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  clean = clean.replace(
    /(href|src|action)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html)[^"']*\2/gi,
    '$1=$2#$2',
  );
  clean = clean.replace(
    /(href|src|action)\s*=\s*(?:javascript:|vbscript:|data:text\/html)[^\s>]*/gi,
    '$1="#"',
  );
  return clean.trim();
}

export function auditCopyConversion(sections = []) {
  const genericPattern = /\b(lorem\s+ipsum|texto\s+exemplo|subt[ií]tulo\s+exemplo|clique\s+aqui|seu\s+t[ií]tulo)\b/i;
  const issues = [];
  for (const sec of Array.isArray(sections) ? sections : []) {
    const cfg = sec?.config || {};
    const title = String(cfg.title || '');
    const subtitle = String(cfg.subtitle || cfg.body || '');
    if (genericPattern.test(title) || genericPattern.test(subtitle)) {
      issues.push({
        sectionId: sec?.id || '',
        type: sec?.type || '',
        reason: 'Texto genérico detectado; substitua por benefício específico + CTA direto.',
      });
    }
  }
  const score = Math.max(40, 100 - issues.length * 15);
  return { score, issues };
}
