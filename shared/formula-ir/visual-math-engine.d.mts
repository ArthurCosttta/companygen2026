export declare function oklchAlphaCss(hex: string, alpha: number): string;
export declare function pickContrastInk(bgHex: string): string;
export declare function tuneHexForMinContrast(candidateHex: string, bgHex: string, minRatio?: number): string;
export declare function deriveOklchPaletteSystem(opts?: {
  brandHex?: string;
  accentHex?: string;
  groundMode?: string;
}): {
  brandHue: number;
  accentHue: number;
  groundBg: string;
  groundAltBg: string;
  softWashBg: string;
  cardBg: string;
  anchorDarkBg: string;
  inkOnLight: string;
  mutedOnLight: string;
  inkOnDark: string;
  mutedOnDark: string;
  accentOnDark: string;
  accentOnLight: string;
  accentFill: string;
  accentInk: string;
  hairlineLight: string;
  hairlineDark: string;
};
export declare function computeUtopiaTypeScale(opts?: {
  baseMin?: number;
  baseMax?: number;
  ratio?: number;
  stepK?: number;
  minVw?: number;
  maxVw?: number;
}): {
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  approxMaxPx: number;
};
export declare function computeNestedRadius(outerRadiusPx?: number, paddingPx?: number): number;
export declare function buildComeauLayeredShadow(elev?: number, tintHex?: string, isDarkSurface?: boolean): string;
export declare function buildLarsenEasingScrim(opts?: {
  direction?: string;
  colorHex?: string;
  strength?: number;
}): string;
export declare function computeStaggerDelaySec(index?: number, stepMs?: number): number;
