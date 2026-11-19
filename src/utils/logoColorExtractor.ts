export interface BrandPaletteExtractionResult {
  primaryHex: string;
  accentHex: string;
  textOnPrimaryHex: '#FFFFFF' | '#0F172A';
  fallbackUsed: boolean;
}

const DEFAULT_PRIMARY_HEX = '#0867E8';
const DEFAULT_ACCENT_HEX = '#24A677';

function clampChannel(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const rr = clampChannel(r).toString(16).padStart(2, '0');
  const gg = clampChannel(g).toString(16).padStart(2, '0');
  const bb = clampChannel(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = String(hex || '')
    .trim()
    .replace(/^#/, '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16) || 0,
      g: parseInt(clean.slice(2, 4), 16) || 0,
      b: parseInt(clean.slice(4, 6), 16) || 0,
    };
  }
  return { r: 8, g: 103, b: 232 };
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = clampChannel(c) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

export function ensureAccessiblePrimaryHex(hex: string): {
  primaryHex: string;
  textOnPrimaryHex: '#FFFFFF' | '#0F172A';
} {
  let { r, g, b } = hexToRgb(hex);
  let candidate = rgbToHex(r, g, b);

  // Tenta escurecer suavemente cores muito claras para atingir >= 4.5:1 sobre branco
  if (contrastRatio(candidate, '#FFFFFF') >= 4.5) {
    return { primaryHex: candidate, textOnPrimaryHex: '#FFFFFF' };
  }

  for (let step = 0; step < 12; step += 1) {
    r = Math.round(r * 0.88);
    g = Math.round(g * 0.88);
    b = Math.round(b * 0.88);
    candidate = rgbToHex(r, g, b);
    if (contrastRatio(candidate, '#FFFFFF') >= 4.5) {
      return { primaryHex: candidate, textOnPrimaryHex: '#FFFFFF' };
    }
  }

  // Fallback para contraste escuro caso a cor original seja pastel extremo
  const rawContrastDark = contrastRatio(hex, '#0F172A');
  if (rawContrastDark >= 4.5) {
    return { primaryHex: rgbToHex(hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b), textOnPrimaryHex: '#0F172A' };
  }

  return { primaryHex: DEFAULT_PRIMARY_HEX, textOnPrimaryHex: '#FFFFFF' };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function saturationWeight(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function extractPaletteFromRgbaPixels(
  pixels: Uint8ClampedArray | number[],
): BrandPaletteExtractionResult {
  const buckets = new Map<
    string,
    { count: number; sumR: number; sumG: number; sumB: number; score: number }
  >();

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    if (a < 128) continue;
    if (r > 240 && g > 240 && b > 240) continue;
    if (r < 18 && g < 18 && b < 18) continue;

    const qr = Math.floor(r / 16);
    const qg = Math.floor(g / 16);
    const qb = Math.floor(b / 16);
    const key = `${qr}:${qg}:${qb}`;
    const sat = saturationWeight(r, g, b);
    const weight = 1 + sat * 1.4;

    const prev = buckets.get(key) || {
      count: 0,
      sumR: 0,
      sumG: 0,
      sumB: 0,
      score: 0,
    };
    prev.count += 1;
    prev.sumR += r;
    prev.sumG += g;
    prev.sumB += b;
    prev.score += weight;
    buckets.set(key, prev);
  }

  if (buckets.size === 0) {
    return {
      primaryHex: DEFAULT_PRIMARY_HEX,
      accentHex: DEFAULT_ACCENT_HEX,
      textOnPrimaryHex: '#FFFFFF',
      fallbackUsed: true,
    };
  }

  const ranked = Array.from(buckets.values())
    .map((entry) => ({
      r: Math.round(entry.sumR / entry.count),
      g: Math.round(entry.sumG / entry.count),
      b: Math.round(entry.sumB / entry.count),
      score: entry.score,
    }))
    .sort((a, b) => b.score - a.score);

  const primaryRaw = ranked[0];
  const rawPrimaryHex = rgbToHex(primaryRaw.r, primaryRaw.g, primaryRaw.b);
  const { primaryHex, textOnPrimaryHex } = ensureAccessiblePrimaryHex(rawPrimaryHex);

  const accentCandidate = ranked.find(
    (entry) => colorDistance(entry, primaryRaw) >= 45,
  );

  let accentHex = DEFAULT_ACCENT_HEX;
  if (accentCandidate) {
    accentHex = rgbToHex(accentCandidate.r, accentCandidate.g, accentCandidate.b);
  } else {
    // Gera destaque harmônico se a logo tiver uma cor predominante única
    const pRgb = hexToRgb(primaryHex);
    accentHex = rgbToHex(
      (pRgb.r + 72) % 230,
      Math.max(40, (pRgb.g + 110) % 220),
      Math.max(40, (pRgb.b + 45) % 210),
    );
  }

  return {
    primaryHex,
    accentHex,
    textOnPrimaryHex,
    fallbackUsed: false,
  };
}

export async function extractBrandPalette(
  imageSource: string | HTMLImageElement,
): Promise<BrandPaletteExtractionResult> {
  if (typeof document === 'undefined') {
    return {
      primaryHex: DEFAULT_PRIMARY_HEX,
      accentHex: DEFAULT_ACCENT_HEX,
      textOnPrimaryHex: '#FFFFFF',
      fallbackUsed: true,
    };
  }

  try {
    const img =
      typeof imageSource === 'string'
        ? await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Falha ao carregar imagem para paleta.'));
            el.src = imageSource;
          })
        : imageSource;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D indisponível.');
    }
    ctx.drawImage(img, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    return extractPaletteFromRgbaPixels(data);
  } catch {
    return {
      primaryHex: DEFAULT_PRIMARY_HEX,
      accentHex: DEFAULT_ACCENT_HEX,
      textOnPrimaryHex: '#FFFFFF',
      fallbackUsed: true,
    };
  }
}
