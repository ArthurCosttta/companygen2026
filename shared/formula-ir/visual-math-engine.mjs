import { clampChroma, formatHex, oklch, wcagContrast } from 'culori';

function toValidHex(raw, fallback = '#18181B') {
  const clean = String(raw || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toUpperCase() : fallback;
}

function oklchToHex(l, c, h) {
  const safeL = Math.max(0.02, Math.min(0.99, Number(l) || 0.5));
  const safeC = Math.max(0, Math.min(0.32, Number(c) || 0));
  const safeH = Number.isFinite(Number(h)) ? ((Number(h) % 360) + 360) % 360 : 60;
  return formatHex(clampChroma({ mode: 'oklch', l: safeL, c: safeC, h: safeH }, 'oklch')).toUpperCase();
}

export function oklchAlphaCss(hex, alpha) {
  const c = oklch(toValidHex(hex));
  const l = (c?.l ?? 0.2).toFixed(3);
  const ch = (c?.c ?? 0.04).toFixed(3);
  const h = Number.isFinite(c?.h) ? c.h.toFixed(1) : '60';
  return `oklch(${l} ${ch} ${h} / ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function pickContrastInk(bgHex) {
  const safe = toValidHex(bgHex, '#FFFFFF');
  const darkInk = '#111827';
  const lightInk = '#FFFFFF';
  return wcagContrast(lightInk, safe) >= wcagContrast(darkInk, safe) ? lightInk : darkInk;
}

export function tuneHexForMinContrast(candidateHex, bgHex, minRatio = 4.6) {
  const safeBg = toValidHex(bgHex, '#FFFFFF');
  const candidate = toValidHex(candidateHex, '#D8A848');
  if (wcagContrast(candidate, safeBg) >= minRatio) return candidate;

  const parsed = oklch(candidate) || { l: 0.65, c: 0.14, h: 75 };
  const bgParsed = oklch(safeBg) || { l: 0.97, c: 0.01, h: 75 };
  const bgIsDark = bgParsed.l < 0.5;
  const h = Number.isFinite(parsed.h) ? parsed.h : 75;
  const c = Math.max(0.06, parsed.c || 0.12);

  for (let step = 1; step <= 12; step += 1) {
    const nextL = bgIsDark
      ? Math.min(0.95, parsed.l + step * 0.065)
      : Math.max(0.14, parsed.l - step * 0.065);
    const hex = oklchToHex(nextL, c, h);
    if (wcagContrast(hex, safeBg) >= minRatio) return hex;
  }
  return bgIsDark ? '#FDE68A' : '#18181B';
}

/**
 * Equação 1 · Sistema Cromático Perceptual OKLCH a partir de seed + groundMode.
 */
export function deriveOklchPaletteSystem({
  brandHex = '#301800',
  accentHex = '#D8A848',
  groundMode = 'warm_linen',
} = {}) {
  const safeBrand = toValidHex(brandHex, '#1E293B');
  const safeAccent = toValidHex(accentHex, '#D8A848');
  const b = oklch(safeBrand) || { l: 0.25, c: 0.06, h: 65 };
  const a = oklch(safeAccent) || { l: 0.72, c: 0.13, h: 82 };

  const brandHue = Number.isFinite(b.h) ? b.h : 65;
  const accentHue = Number.isFinite(a.h) ? a.h : 82;

  let groundBg = '#FBF6EE';
  if (groundMode === 'cool_mist') {
    groundBg = oklchToHex(0.968, 0.012, 240);
  } else if (groundMode === 'soft_tint') {
    groundBg = oklchToHex(0.968, Math.min(0.018, (b.c || 0.04) * 0.45), brandHue);
  } else if (groundMode === 'pure_gallery') {
    groundBg = '#FFFFFF';
  } else {
    // warm_linen: creme quente tátil derivado com leve harmonia
    groundBg = oklchToHex(0.972, 0.014, 78);
  }

  const groundAltBg =
    groundMode === 'pure_gallery'
      ? '#F5F5F7'
      : oklchToHex(0.946, 0.02, groundMode === 'cool_mist' ? 235 : 78);

  const softWashBg = oklchToHex(0.915, Math.min(0.045, Math.max(0.022, (b.c || 0.05) * 0.5)), brandHue);

  // Âncora escura mantém o matiz da marca em luminosidade controlada (0.19..0.24)
  const anchorDarkBg = b.l >= 0.15 && b.l <= 0.30
    ? safeBrand
    : oklchToHex(0.21, Math.min(0.09, Math.max(0.03, b.c || 0.05)), brandHue);

  const cardBg = '#FFFFFF';
  const inkOnLight = oklchToHex(0.18, Math.min(0.03, (b.c || 0.03) * 0.4), brandHue);
  const mutedOnLight = oklchToHex(0.45, Math.min(0.025, (b.c || 0.02) * 0.3), brandHue);
  const inkOnDark = '#FAFAFA';
  const mutedOnDark = oklchToHex(0.84, 0.015, accentHue);

  // Acento vivo garantido contra escuro e claro
  const vividSeed = a.l < 0.35 && b.l < 0.35
    ? oklchToHex(0.76, 0.15, Number.isFinite(a.h) ? a.h : 80)
    : safeAccent;

  const accentOnDark = tuneHexForMinContrast(vividSeed, anchorDarkBg, 4.6);
  const accentOnLight = tuneHexForMinContrast(
    a.l > 0.72 ? oklchToHex(0.52, Math.max(0.11, a.c || 0.13), accentHue) : safeAccent,
    groundBg,
    4.6,
  );
  const accentFill = a.l < 0.35 ? accentOnDark : vividSeed;
  const accentInk = pickContrastInk(accentFill);

  return {
    brandHue: Math.round(brandHue),
    accentHue: Math.round(accentHue),
    groundBg,
    groundAltBg,
    softWashBg,
    cardBg,
    anchorDarkBg,
    inkOnLight,
    mutedOnLight,
    inkOnDark,
    mutedOnDark,
    accentOnDark,
    accentOnLight,
    accentFill,
    accentInk,
    hairlineLight: oklchAlphaCss(anchorDarkBg, 0.11),
    hairlineDark: oklchAlphaCss('#FFFFFF', 0.16),
  };
}

/**
 * Equação 2 · Escala Tipográfica Fluida (Utopia clamp) + Entrelinha & Tracking inversos.
 */
export function computeUtopiaTypeScale({
  baseMin = 15,
  baseMax = 17,
  ratio = 1.333,
  stepK = 0,
  minVw = 390,
  maxVw = 1440,
} = {}) {
  const safeRatio = Math.max(1.125, Math.min(1.5, Number(ratio) || 1.333));
  const k = Number(stepK) || 0;
  const minPx = Math.max(11, Math.min(72, baseMin * Math.pow(safeRatio, k * 0.75)));
  const maxPx = Math.max(minPx, Math.min(84, baseMax * Math.pow(safeRatio, k)));
  const avgPx = (minPx + maxPx) / 2;

  const slope = (maxPx - minPx) / (maxVw - minVw);
  const yIntercept = -minVw * slope + minPx;
  const clampCss = `clamp(${(minPx / 16).toFixed(3)}rem, ${(yIntercept / 16).toFixed(3)}rem + ${(slope * 100).toFixed(3)}vw, ${(maxPx / 16).toFixed(3)}rem)`;

  const lineHeight = Number((1.03 + 10 / Math.max(12, avgPx)).toFixed(3));
  const letterSpacingEm = Number((-0.042 * Math.max(0, avgPx - 14) / 48).toFixed(4));

  return {
    fontSize: clampCss,
    lineHeight: String(lineHeight),
    letterSpacing: `${letterSpacingEm}em`,
    approxMaxPx: Math.round(maxPx),
  };
}

/**
 * Equação 3 · Concêntrica de Raios (Radius Nesting Law).
 */
export function computeNestedRadius(outerRadiusPx = 24, paddingPx = 16) {
  return Math.max(4, Math.round(Number(outerRadiusPx) - Number(paddingPx)));
}

/**
 * Equação 4 · Sombras Físicas em 5 Camadas Exponenciais Tintadas (Josh Comeau algorithm).
 */
export function buildComeauLayeredShadow(elev = 2, tintHex = '#18181B', isDarkSurface = false) {
  const e = Math.max(0, Math.min(4, Number(elev) || 0));
  if (e === 0) return 'none';
  const alphaScale = isDarkSurface ? 2.4 : 1.0;
  const layers = [1, 2, 4, 8, 16].map((m, idx) => {
    const y = Math.round(m * e * 0.45);
    const blur = Math.round(m * e * 1.15);
    const alpha = Math.min(0.42, (0.025 + idx * 0.008) * alphaScale);
    return `0 ${y}px ${blur}px ${oklchAlphaCss(tintHex, alpha)}`;
  });
  return layers.join(', ');
}

/**
 * Equação 5 · Scrim Gradient com 11 stops em curva cúbica (Larsen Easing Gradients).
 */
export function buildLarsenEasingScrim({
  direction = 'to right',
  colorHex = '#09090B',
  strength = 0.9,
} = {}) {
  const safeStrength = Math.max(0.1, Math.min(1, Number(strength) || 0.88));
  // Coordenadas cúbicas ease-out suaves para evitar banda cinza artificial
  const curve = [
    [0, 1.0],
    [12, 0.94],
    [24, 0.82],
    [36, 0.65],
    [48, 0.46],
    [60, 0.29],
    [72, 0.15],
    [84, 0.06],
    [94, 0.015],
    [100, 0],
  ];
  const stops = curve.map(([pct, weight]) => `${oklchAlphaCss(colorHex, safeStrength * weight)} ${pct}%`);
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/**
 * Equação 6 · Stagger exponencial suavizado.
 */
export function computeStaggerDelaySec(index = 0, stepMs = 55) {
  let total = 0;
  for (let i = 0; i < Math.min(20, index); i += 1) {
    total += stepMs * Math.exp(-0.12 * i);
  }
  return Number((total / 1000).toFixed(3));
}
