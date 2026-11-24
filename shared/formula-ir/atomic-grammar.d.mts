export declare const CURATED_ICON_CHOICES: string[];
export declare function parseAtomSpec(raw: unknown): {
  params: Record<string, string>;
  directives: string[];
};
export declare function clampNum(val: unknown, min: number, max: number, fallback: number): number;
export declare function relativeLuminance(hex: string): number;
export declare function contrastRatio(hexA: string, hexB: string): number;
export declare function pickAccessibleInk(bgHex: string): string;
export declare function ensureAccessibleAccent(
  accentHex: string,
  bgHex: string,
  isDark: boolean,
  primaryHex?: string,
): string;
export declare function resolveSectionSurfaceTokens(opts: {
  primaryHex?: string;
  accentHex?: string;
  surfaceStr?: string;
  sectionIndex?: number;
  prevIsDark?: boolean | null;
  groundMode?: string;
}): {
  bgHex: string;
  inkHex: string;
  mutedHex: string;
  cardBg: string;
  borderColor: string;
  accentHex: string;
  accentInkHex: string;
  anchorDarkBg: string;
  groundBg: string;
  softWashBg: string;
  isDark: boolean;
  blurPx: number;
};
export declare const AtomicBlueprintSchema: unknown;
export declare const AtomicSectionTupleSchema: unknown;
export declare const TextMicroTupleSchema: unknown;
export declare const ImageRequestSchema: unknown;
