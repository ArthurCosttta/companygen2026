import React from 'react';
import * as atomicGrammar from '../../../../shared/formula-ir/atomic-grammar.mjs';
import * as mathEngine from '../../../../shared/formula-ir/visual-math-engine.mjs';

export const parseAtomSpec: (raw: unknown) => { params: Record<string, string>; directives: string[] } =
  (atomicGrammar as unknown as {
    parseAtomSpec?: (raw: unknown) => { params: Record<string, string>; directives: string[] };
  }).parseAtomSpec ??
  (() => ({ params: {}, directives: [] }));

const computeUtopiaTypeScale = mathEngine.computeUtopiaTypeScale;
const computeNestedRadius = mathEngine.computeNestedRadius;
const buildComeauLayeredShadow = mathEngine.buildComeauLayeredShadow;
const buildLarsenEasingScrim = mathEngine.buildLarsenEasingScrim;
export const computeStaggerDelaySec = mathEngine.computeStaggerDelaySec;

export type OrnamentSignature = 'flanked_lines' | 'trailing_line' | 'slanted_bar' | 'corner_sparks';

export interface CompiledSectionDesign {
  paddingY: number;
  outerRadiusPx: number;
  innerRadiusPx: number;
  gapPx: number;
  isFullBleed: boolean;
  fullScreenHero: boolean;
  heroMinHeightCss: string;
  displayStyle: React.CSSProperties;
  h2Style: React.CSSProperties;
  shadowCss: string;
  scrimCss: string;
  ornamentKind: OrnamentSignature;
  showColDividers: boolean;
  showConnectedNodes: boolean;
  hasSlashedAccent: boolean;
  zeroGapBottomBar: boolean;
  barToneLight: boolean;
  borderlessCols: boolean;
  attachedContrastRail: boolean;
  floatingCardEmbedded: boolean;
  heroFit: 'cover' | 'contain';
  paperGrainOpacity: number;
  showPixBadge: boolean;
  gridColsMobile: number;
  gridColsTablet: number;
  gridColsDesktop: number;
  displayFontFamily: string;
  bodyFontFamily: string;
  marqueeSpeedSec: number;
}

function isValidHex6(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v.trim());
}

/**
 * Trava determinística anti texto-escuro-no-escuro / texto-claro-no-claro.
 * Se o contraste WCAG entre texto e fundo ficar abaixo do mínimo seguro, corrige na hora.
 */
export function ensureSafeInkContrast(
  candidateInk: string,
  bgHex: string,
  minRatio = 4.6,
): string {
  const safeBg = isValidHex6(bgHex) ? bgHex.trim().toUpperCase() : '#FFFFFF';
  const safeCand = isValidHex6(candidateInk) ? candidateInk.trim().toUpperCase() : '';
  if (safeCand && atomicGrammar.contrastRatio(safeCand, safeBg) >= minRatio) {
    return safeCand;
  }
  return mathEngine.pickContrastInk(safeBg);
}

/**
 * Garante contraste mínimo para cores de destaque/acento em texto ou botão.
 */
export function ensureSafeAccentContrast(
  candidateAccent: string,
  bgHex: string,
  minRatio = 4.5,
): string {
  const safeBg = isValidHex6(bgHex) ? bgHex.trim().toUpperCase() : '#FFFFFF';
  const safeCand = isValidHex6(candidateAccent) ? candidateAccent.trim().toUpperCase() : '#D8A848';
  return mathEngine.tuneHexForMinContrast(safeCand, safeBg, minRatio);
}

export function resolveFontVoices(engineSeed?: Record<string, any>) {
  const displayVoice = String(engineSeed?.displayVoice || 'archivo');
  const bodyVoice = String(engineSeed?.bodyVoice || 'manrope');
  const voiceMap: Record<string, string> = {
    archivo: "'Archivo', 'Plus Jakarta Sans', system-ui, sans-serif",
    big_shoulders: "'Big Shoulders Display', 'Archivo', sans-serif",
    fraunces: "'Fraunces', 'Instrument Serif', Georgia, serif",
    instrument_serif: "'Instrument Serif', 'Fraunces', Georgia, serif",
    bricolage: "'Bricolage Grotesque', 'Archivo', 'Plus Jakarta Sans', sans-serif",
    space_grotesk: "'Space Grotesk', 'Archivo', sans-serif",
    cormorant: "'Cormorant Garamond', 'Fraunces', Georgia, serif",
    playfair: "'Playfair Display', 'Fraunces', Georgia, serif",
    plus_jakarta: "'Plus Jakarta Sans', 'Manrope', 'Inter', sans-serif",
    syne: "'Syne', 'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif",
  };
  const maxWeightByVoice: Record<string, number> = {
    instrument_serif: 400,
    fraunces: 700,
    cormorant: 700,
    playfair: 700,
    space_grotesk: 700,
    archivo: 900,
    big_shoulders: 900,
    bricolage: 800,
    plus_jakarta: 800,
    syne: 800,
  };
  const displayFontFamily = voiceMap[displayVoice] || voiceMap.archivo;
  const maxDisplayWeight = maxWeightByVoice[displayVoice] ?? 800;
  const bodyFontFamily =
    bodyVoice === 'dm_sans'
      ? "'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif"
      : bodyVoice === 'inter'
        ? "'Inter', 'Manrope', system-ui, sans-serif"
        : bodyVoice === 'plus_jakarta'
          ? "'Plus Jakarta Sans', 'Manrope', system-ui, sans-serif"
          : "'Manrope', 'Plus Jakarta Sans', system-ui, sans-serif";
  const monoFontFamily = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace";
  return { displayFontFamily, bodyFontFamily, monoFontFamily, maxDisplayWeight };
}

function parseResponsiveCols(rawResponsive: unknown, layoutParams: Record<string, string>) {
  const str = String(rawResponsive || '');
  const matchMob = str.match(/mob:(\d+)/i);
  const matchTab = str.match(/tab:(\d+)/i);
  const matchDesk = str.match(/desk:(\d+)/i);
  const layoutCols = Number(layoutParams.cols || 0);

  const mob = matchMob ? Math.max(1, Math.min(2, Number(matchMob[1]))) : 1;
  const tab = matchTab ? Math.max(1, Math.min(3, Number(matchTab[1]))) : 2;
  const desk = matchDesk
    ? Math.max(1, Math.min(4, Number(matchDesk[1])))
    : layoutCols >= 2 && layoutCols <= 4
      ? layoutCols
      : 3;
  return { mob, tab, desk };
}

export function compileAtomicSectionDesign(
  section: Record<string, any>,
  engineSeed?: Record<string, any>,
): CompiledSectionDesign {
  const layout = parseAtomSpec(section.layout);
  const type = parseAtomSpec(section.type);
  const lighting = parseAtomSpec(section.lighting);
  const photo = parseAtomSpec(section.photoTreatment);
  const media = parseAtomSpec(section.media);
  const texture = parseAtomSpec(section.textureAndMask);
  const ornaments = parseAtomSpec(section.ornaments);
  const card = parseAtomSpec(section.cardAnatomy);
  const motion = parseAtomSpec(section.motion);

  const st = (section.surfaceTokens as Record<string, any>) || {};
  const isDark = Boolean(st.isDark);
  const bgHex = String(st.bgHex || '#FBF6EE');

  const scaleRatio = Number(type.params.scaleRatio || engineSeed?.scaleRatio || 1.333);
  const rawPy = Number(String(layout.params.py || '56').split('/')[0]);
  const paddingY = Number.isFinite(rawPy) ? Math.max(12, Math.min(96, rawPy)) : 56;

  const rawRad = Number(String(layout.params.radOut ?? layout.params.rad ?? '20').split('/')[0]);
  const outerRadiusPx = Number.isFinite(rawRad) ? Math.max(0, Math.min(32, rawRad)) : 20;
  const padForNest = Number(String(layout.params.pad || '16').split('/')[0]) || 16;
  const innerRadiusPx = computeNestedRadius(outerRadiusPx, padForNest);

  const rawGap = Number(String(layout.params.gap || '20').split('/')[0]);
  const gapPx = Number.isFinite(rawGap) ? Math.max(8, Math.min(48, rawGap)) : 20;

  // Fix elev=0 bug: explicitly check undefined and flat lighting instead of falsy || 2
  const rawLightingStr = String(section.lighting || '').toLowerCase();
  const elev =
    rawLightingStr.includes('lit:flat') || lighting.params.elev === '0'
      ? 0
      : lighting.params.elev !== undefined
        ? Math.max(0, Math.min(5, Number(lighting.params.elev) || 2))
        : 2;
  const shadowCss =
    elev === 0
      ? 'none'
      : buildComeauLayeredShadow(elev, String(st.anchorDarkBg || '#18181B'), isDark);

  const scrimMode = String(photo.params.scrim || 'cubic_left_dark');
  const scrimStrength = Number(photo.params.strength || '0.88');
  const scrimDirection = scrimMode.includes('right')
    ? 'to left'
    : scrimMode.includes('bottom')
      ? 'to top'
      : 'to right';
  const scrimColor = scrimMode.includes('light') ? '#FFFFFF' : bgHex;
  const scrimCss = buildLarsenEasingScrim({
    direction: scrimDirection,
    colorHex: scrimColor,
    strength: scrimStrength,
  });

  // Honor k= step and wt= weight from type clause
  const requestedK = Number(type.params.k || String(section.type || '').match(/k=(\d+(?:\.\d+)?)/)?.[1] || 3.4);
  const clampedDisplayK = Number.isFinite(requestedK) ? Math.max(2.0, Math.min(4.4, requestedK)) : 3.4;
  const requestedWeight = Number(type.params.wt || 800);
  const displayWeight = [400, 500, 600, 700, 800, 900].includes(requestedWeight) ? requestedWeight : 800;

  const displayScale = computeUtopiaTypeScale({ baseMin: 15, baseMax: 17, ratio: scaleRatio, stepK: clampedDisplayK });
  const dirTypoScale = String(section.direction?.typoScale || '').trim();
  const explicitDisplaySize =
    dirTypoScale === 'poster_mega'
      ? 'clamp(3.25rem, 8.2vw, 7.25rem)'
      : dirTypoScale === 'editorial_xxl'
        ? 'clamp(2.65rem, 6vw, 5.25rem)'
        : dirTypoScale === 'refined_lg'
          ? 'clamp(2.25rem, 4.4vw, 3.75rem)'
          : displayScale.fontSize;
  const h2Scale = computeUtopiaTypeScale({ baseMin: 15, baseMax: 17, ratio: scaleRatio, stepK: Math.min(2.6, clampedDisplayK * 0.72) });
  const { displayFontFamily, bodyFontFamily, maxDisplayWeight } = resolveFontVoices(engineSeed);
  const safeDisplayWeight = Math.min(displayWeight, maxDisplayWeight);

  const rawHeadingOrn =
    ornaments.params.headingOrn || ornaments.params.titleOrn || engineSeed?.signatureOrnament || 'trailing_line';
  const ornamentKind: OrnamentSignature = (
    ['flanked_lines', 'trailing_line', 'slanted_bar', 'corner_sparks'].includes(rawHeadingOrn)
      ? rawHeadingOrn
      : 'trailing_line'
  ) as OrnamentSignature;

  const speedRaw = Number(String(motion.params.speed || '26').replace(/[^0-9.]/g, ''));
  const marqueeSpeedSec = Number.isFinite(speedRaw) && speedRaw >= 10 && speedRaw <= 60 ? speedRaw : 26;

  const heroFit: 'cover' | 'contain' =
    photo.params.fit === 'contain' || media.params.fit === 'contain' ? 'contain' : 'cover';

  const hasGrain = String(section.textureAndMask || '').includes('svg_paper_grain');
  const rawGrainOp = Number(texture.params.op || '0.03');
  const paperGrainOpacity = hasGrain
    ? Math.max(0.015, Math.min(0.12, Number.isFinite(rawGrainOp) ? rawGrainOp : 0.03))
    : 0;

  const showPixBadge =
    card.params.pix_badge === 'true' || String(section.cardAnatomy || '').includes('pix_badge');
  const barToneLight = card.params.barTone === 'surface_light';
  const responsiveCols = parseResponsiveCols(section.responsive, layout.params);

  const dc = (section.content?.designContainers as Record<string, any>) || {};
  const photoSpec = (dc.photoCompositingSpec as Record<string, any>) || {};
  const typoSpec = (dc.typographySpec as Record<string, any>) || {};
  const minVhParam = Number(layout.params.minVh || photoSpec.minHeightVh || 0);
  const fullScreenHero =
    String(section.tuple?.[1] || '') === 'hero_stage'
      ? photoSpec.fullScreenHero !== false && section.content?.fullScreenHero !== false
      : Boolean(minVhParam >= 70);
  const clampedMinVh = Number.isFinite(minVhParam) && minVhParam >= 50 ? Math.min(92, minVhParam) : 80;
  const heroMinHeightCss = fullScreenHero ? `clamp(520px, ${clampedMinVh}vh, 780px)` : '460px';

  const opticalTrack = type.params.trk
    ? `${type.params.trk}em`
    : clampedDisplayK >= 3.0
      ? `${typoSpec.opticalTrackingEm ?? -0.032}em`
      : displayScale.letterSpacing;

  return {
    paddingY,
    outerRadiusPx,
    innerRadiusPx,
    gapPx,
    isFullBleed: layout.params.bleed === 'full_width' || layout.params.container !== 'boxed',
    fullScreenHero,
    heroMinHeightCss,
    displayStyle: {
      fontFamily: displayFontFamily,
      fontSize: explicitDisplaySize,
      lineHeight:
        dirTypoScale === 'poster_mega'
          ? '0.92'
          : dirTypoScale === 'editorial_xxl'
            ? '0.98'
            : clampedDisplayK >= 3.0
              ? String(typoSpec.displayLineHeight ?? 1.05)
              : displayScale.lineHeight,
      letterSpacing: opticalTrack,
      fontWeight: safeDisplayWeight,
      textWrap: 'balance' as React.CSSProperties['textWrap'],
    },
    h2Style: {
      fontFamily: displayFontFamily,
      fontSize: h2Scale.fontSize,
      lineHeight: h2Scale.lineHeight,
      letterSpacing: '-0.024em',
      fontWeight: safeDisplayWeight,
      textWrap: 'balance' as React.CSSProperties['textWrap'],
    },
    shadowCss,
    scrimCss,
    ornamentKind,
    showColDividers: Boolean(ornaments.params.colDivider || ornaments.params.dividers),
    showConnectedNodes: Boolean(ornaments.params.progress),
    hasSlashedAccent: ornamentKind === 'slanted_bar',
    zeroGapBottomBar:
      String(photo.params.attachment || '').includes('zero_gap_bottom_bar') ||
      String(card.params.shell || '').includes('zero_gap_bottom_bar'),
    barToneLight,
    borderlessCols: String(layout.params.containerStyle || '').includes('borderless_columns'),
    attachedContrastRail: String(layout.params.shell || '').includes('attached_contrast_rail'),
    floatingCardEmbedded:
      String(layout.params.variant || '').includes('floating_card') || Boolean(card.params.floatingCard),
    heroFit,
    paperGrainOpacity,
    showPixBadge,
    gridColsMobile: responsiveCols.mob,
    gridColsTablet: responsiveCols.tab,
    gridColsDesktop: responsiveCols.desk,
    displayFontFamily,
    bodyFontFamily,
    marqueeSpeedSec,
  };
}

export function renderHighlightedCopy(rawText: string, accentHex: string): React.ReactNode {
  const str = String(rawText || '');
  const parts = str.split(/(<accent>.*?<\/accent>)/gi);
  if (parts.length === 1) return str;
  return parts.map((part, idx) => {
    const match = part.match(/^<accent>(.*?)<\/accent>$/i);
    if (match) {
      return React.createElement('span', { key: idx, style: { color: accentHex } }, match[1]);
    }
    return React.createElement(React.Fragment, { key: idx }, part);
  });
}
