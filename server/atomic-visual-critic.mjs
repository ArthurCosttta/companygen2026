import { wcagContrast } from 'culori';
import { pickContrastInk, tuneHexForMinContrast } from '../shared/formula-ir/visual-math-engine.mjs';
import { resolveDesignContainers } from './tuple-specification-module.mjs';

/**
 * Matriz limpa de propriedades validadas no Motor Virtual (nota >= 8 em 100 cenários).
 * Substitui as strings enigmáticas legadas de RICH_VECTOR_DEFAULTS.
 */
const CLEAN_PROPERTY_DEFAULTS = {
  hero_stage: {
    layout: 'cols=12 py=64 px=24 gap=24 radOut=20 | bleed=full_width',
    type: 'k=3.6 scaleRatio=1.333 wt=800 | highlight=accent_last_word',
    lighting: 'lit:radial_back_subject elev=3',
    textureAndMask: 'lib:svg_paper_grain op=0.025 | mask=cubic_scrim_left',
    cardAnatomy: 'none',
    photoTreatment: 'fit=cover focal=right_38 scrim=cubic_left_dark strength=0.88',
    ornaments: 'titleOrn=corner_sparks',
    motion: 'fx:hero_enter dur=420',
  },
  hero_centered: {
    layout: 'cols=12 py=64 px=24 gap=24 radOut=24',
    type: 'k=3.6 scaleRatio=1.333 wt=800 | highlight=accent_last_word',
    lighting: 'lit:radial_back_subject elev=2',
    textureAndMask: 'lib:svg_paper_grain op=0.025',
    cardAnatomy: 'none',
    photoTreatment: 'fit=cover scrim=bottom_soft strength=0.78',
    ornaments: 'titleOrn=corner_sparks',
    motion: 'fx:hero_enter dur=420',
  },
  hero_split: {
    layout: 'cols=12 py=56 px=24 gap=28 radOut=22',
    type: 'k=3.4 scaleRatio=1.333 wt=800 | highlight=accent_last_word',
    lighting: 'lit:radial_back_subject elev=3',
    textureAndMask: 'lib:svg_paper_grain op=0.025',
    cardAnatomy: 'none',
    photoTreatment: 'fit=cover scrim=cubic_left_dark strength=0.82',
    ornaments: 'titleOrn=trailing_line',
    motion: 'fx:hero_enter dur=380',
  },
  domain_workbench: {
    layout: 'cols=12 py=56 px=24 gap=24 radOut=24 | shell=attached_contrast_rail',
    type: 'k=2.6 wt=800',
    lighting: 'lib:comeau_shadow elev=2',
    textureAndMask: 'lib:svg_paper_grain op=0.02',
    cardAnatomy: 'optionCard=corner_check_badge rail=attached_solid_summary',
    photoTreatment: 'fit=contain',
    ornaments: 'headingOrn=trailing_line | progress=connected_nodes',
    motion: 'fx:shared_layout_tabs',
    workbench: 'kind=combo_or_mix_builder | liveTotal=true | bindTo=cart+whatsapp',
  },
  bento_spotlight: {
    layout: 'cols=12 py=56 px=24 gap=20 radOut=20',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=2',
    textureAndMask: 'lib:svg_paper_grain op=0.025',
    cardAnatomy: 'shell=zero_gap_bottom_bar pix_badge=true',
    photoTreatment: 'aspect=16:10 fit=cover scrim=bottom_soft',
    ornaments: 'headingOrn=trailing_line',
    motion: 'fx:stagger_reveal dur=320',
  },
  coupled_media_grid: {
    layout: 'cols=3 py=48 px=24 gap=20 radOut=18',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=2',
    textureAndMask: 'tex:none',
    cardAnatomy: 'shell=zero_gap_bottom_bar barTone=anchor_dark',
    photoTreatment: 'aspect=16:10 fit=cover scrim=bottom_soft',
    ornaments: 'headingOrn=flanked_lines',
    motion: 'fx:stagger_reveal dur=320',
  },
  split_story: {
    layout: 'cols=12 py=56 px=24 gap=28 radOut=20',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=2',
    textureAndMask: 'lib:svg_paper_grain op=0.03',
    cardAnatomy: 'none',
    photoTreatment: 'aspect=4:3 fit=cover',
    ornaments: 'headingOrn=trailing_line',
    motion: 'fx:stagger_reveal dur=320',
  },
  dark_glass_vault: {
    layout: 'cols=3 py=64 px=24 gap=20 radOut=20',
    type: 'k=2.5 wt=800',
    lighting: 'lib:comeau_shadow elev=4',
    textureAndMask: 'lib:svg_paper_grain op=0.025',
    cardAnatomy: 'pix_badge=true',
    photoTreatment: 'fit=cover',
    ornaments: 'headingOrn=corner_sparks',
    motion: 'fx:stagger_reveal dur=360',
  },
  sticky_lookbook: {
    layout: 'cols=12 py=56 px=24 gap=24 radOut=18',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=2',
    textureAndMask: 'lib:svg_paper_grain op=0.025',
    cardAnatomy: 'pix_badge=true',
    photoTreatment: 'aspect=4:3 fit=cover',
    ornaments: 'headingOrn=trailing_line',
    motion: 'fx:stagger_reveal dur=320',
  },
  embedded_banner: {
    layout: 'cols=12 py=40 px=24 gap=24 radOut=24',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=3',
    textureAndMask: 'mask=gradient_horizontal_fade',
    cardAnatomy: 'floatingCard=white_panel_p=20_rad=16_elev=3_embedded_right',
    photoTreatment: 'fit=cover',
    ornaments: 'titleOrn=corner_sparks',
    motion: 'fx:fade_up dur=360',
  },
  catalog_full_grid: {
    layout: 'cols=3 py=56 px=24 gap=18 radOut=18',
    type: 'k=2.4 wt=800',
    lighting: 'lib:comeau_shadow elev=1',
    textureAndMask: 'lib:svg_paper_grain op=0.02',
    cardAnatomy: 'no_photo=editorial_spec_card show_variation=true pix_badge=true',
    photoTreatment: 'aspect=4:3 fit=cover',
    ornaments: 'headingOrn=trailing_line',
    motion: 'fx:auto_animate_grid',
    responsive: 'mob:1|tab:2|desk:3',
  },
  open_columns_strip: {
    layout: 'cols=3 py=28 px=24 gap=0 | containerStyle=borderless_columns',
    type: 'k=1.4 wt=700',
    lighting: 'lit:flat elev=0',
    textureAndMask: 'tex:none',
    cardAnatomy: 'no_card_box_transparent',
    photoTreatment: 'none',
    ornaments: 'colDivider=vertical_hairline_1px',
    motion: 'fx:none',
  },
  anchor_footer: {
    layout: 'cols=4 py=52 px=24 | bleed=full_width',
    type: 'k=1.4 wt=700',
    lighting: 'lit:top_hairline elev=0',
    textureAndMask: 'tex:none',
    cardAnatomy: 'columns=4_with_legal_subbar',
    photoTreatment: 'none',
    ornaments: 'watermark=corner_line_art_right',
    motion: 'fx:none',
  },
};

export function auditAndRepairAtomicBlueprint(hydratedData, profile = {}) {
  const issues = [];
  const data = hydratedData ? structuredClone(hydratedData) : null;
  if (!data || !Array.isArray(data.sections) || data.sections.length < 4) {
    return {
      ok: false,
      score: 0,
      issues: ['BLUEPRINT_MISSING_OR_TOO_SHORT'],
      needsGlmRefine: true,
      data,
    };
  }

  let missingSpecCount = 0;

  data.sections = data.sections.map((sec) => {
    const role = String(sec?.tuple?.[1] || 'coupled_media_grid');
    const defaults =
      CLEAN_PROPERTY_DEFAULTS[role] ||
      (role === 'split_curtain_portals' ? CLEAN_PROPERTY_DEFAULTS.coupled_media_grid : CLEAN_PROPERTY_DEFAULTS.embedded_banner);
    const patched = { ...sec };

    for (const field of ['lighting', 'textureAndMask', 'cardAnatomy', 'photoTreatment', 'ornaments', 'motion', 'workbench', 'responsive']) {
      if (defaults[field] && !String(patched[field] || '').trim()) {
        missingSpecCount += 1;
        patched[field] = defaults[field];
      }
    }
    if (!String(patched.layout || '').includes('cols=')) {
      patched.layout = defaults.layout;
    }
    if (!String(patched.type || '').includes('k=')) {
      patched.type = defaults.type;
    }

    // Remove terminantemente qualquer eyebrow residual em Hero (regra ZERO_TAGS_OVER_HEADLINES)
    if (
      (role === 'hero_stage' || role === 'hero_split' || role === 'hero_centered') &&
      Array.isArray(patched.textSlots)
    ) {
      patched.textSlots = patched.textSlots.filter((slot) => slot?.micro?.[1] !== 'eyebrow');
    }

    // Garante containers determinísticos padrão sem exigir ruído extra do GLM
    patched.content = {
      ...(patched.content && typeof patched.content === 'object' ? patched.content : {}),
      designContainers: resolveDesignContainers(
        patched.content?.designContainers || patched.content || {},
        role,
      ),
    };

    // Auto-reparo determinístico de contraste: NUNCA deixa texto preto em fundo preto nem claro no claro
    if (patched.surfaceTokens && typeof patched.surfaceTokens === 'object') {
      const st = { ...patched.surfaceTokens };
      const bgHex = /^#[0-9a-f]{6}$/i.test(String(st.bgHex || '')) ? String(st.bgHex) : '#FFFFFF';
      const inkC = wcagContrast(st.inkHex || '#111827', bgHex);
      if (inkC < 4.5) {
        issues.push(`REPAIRED_INK_CONTRAST:${sec.tuple?.[0]}`);
        st.inkHex = pickContrastInk(bgHex);
      }
      const mutedC = wcagContrast(st.mutedHex || st.inkHex || '#111827', bgHex);
      if (mutedC < 3.6) {
        st.mutedHex = st.isDark ? '#CBD5E1' : '#334155';
      }
      const accC = wcagContrast(st.accentHex || '#D8A848', bgHex);
      if (accC < 4.5) {
        issues.push(`REPAIRED_ACCENT_CONTRAST:${sec.tuple?.[0]}`);
        st.accentHex = tuneHexForMinContrast(st.accentHex || '#D8A848', bgHex, 4.6);
      }
      st.accentInkHex = pickContrastInk(st.accentHex || '#D8A848');
      patched.surfaceTokens = st;
    }

    return patched;
  });

  if (missingSpecCount > 0) {
    issues.push(`ENRICHED_MISSING_PROPERTIES:${missingSpecCount}`);
  }

  const heroSec = data.sections.find(
    (s) => s.tuple?.[1] === 'hero_stage' || s.tuple?.[1] === 'hero_split' || s.tuple?.[1] === 'hero_centered',
  );
  if (!heroSec?.resolvedMedia?.imageUrl && (data.imageRequests || []).length > 0) {
    issues.push('HERO_IMAGE_NOT_BOUND');
  }

  const realCategories = new Set(
    (profile?.catalog?.products || []).filter((p) => p?.active !== false).map((p) => String(p.category || 'Geral').trim()),
  );
  const portalsSec = data.sections.find(
    (s) =>
      s.tuple?.[1] === 'coupled_media_grid' ||
      s.tuple?.[1] === 'split_curtain_portals' ||
      s.tuple?.[1] === 'bento_spotlight' ||
      s.tuple?.[1] === 'sticky_lookbook',
  );
  if (realCategories.size >= 2 && !portalsSec) {
    issues.push('MISSING_MULTI_CATEGORY_PORTALS');
  }

  const clicheHits = scanClicheViolations(data.sections);
  if (clicheHits.length > 0) {
    issues.push(`CLICHE_GENERIC_COPY:${clicheHits.length}`);
  }

  const hardFailures = issues.filter(
    (i) => i.startsWith('LOW_INK_CONTRAST') || i.startsWith('LOW_ACCENT_CONTRAST') || i === 'BLUEPRINT_MISSING_OR_TOO_SHORT',
  );
  const score = Math.max(0, 100 - hardFailures.length * 25 - (issues.length - hardFailures.length) * 5);

  return {
    ok: hardFailures.length === 0,
    score,
    issues,
    clicheHits,
    needsGlmRefine: false,
    data,
  };
}

export const CLICHE_PHRASES_BLACKLIST = [
  'envio organizado com acompanhamento',
  'curadoria técnica assistida',
  'diagnóstico sem achismo',
  'para o seu dia a dia',
  'soluções pensadas para você',
  'qualidade e excelência',
  'monte sua seleção',
];

export function scanClicheViolations(sections = []) {
  const hits = [];
  for (const sec of Array.isArray(sections) ? sections : []) {
    const secId = sec?.tuple?.[0] || sec?.id || 'sec';
    const textDump = [
      ...(Array.isArray(sec?.textSlots) ? sec.textSlots.map((t) => String(t?.micro?.[2] || '')) : []),
      String(sec?.content?.subheadline || ''),
      String(sec?.content?.ctaPrimaryLabel || ''),
    ]
      .join(' ')
      .toLowerCase();
    for (const phrase of CLICHE_PHRASES_BLACKLIST) {
      if (textDump.includes(phrase)) {
        hits.push({ sectionId: secId, phrase });
      }
    }
  }
  return hits;
}
