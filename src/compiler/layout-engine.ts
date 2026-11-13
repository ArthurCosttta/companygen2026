import { CANVAS_H, CANVAS_W, SAFE_MARGIN, type Layer, type Palette, type SceneWarning, type TextMeasurer } from './types';
import type { BrandSpec } from '@/schemas/campaign.schema';

// ---------- colour utilities ----------
export function normalizeHex(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return `#${full.toUpperCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

export function bestTextOn(bg: string, candidates: string[]): string {
  return [...candidates].sort((x, y) => contrastRatio(y, bg) - contrastRatio(x, bg))[0];
}

export function buildPalette(brand: BrandSpec): Palette {
  const primary = normalizeHex(brand.colors.primary);
  const background = normalizeHex(brand.colors.background);
  const text = normalizeHex(brand.colors.text);
  const dark = relativeLuminance(text) < 0.2 ? text : '#0B1D52';
  const light = '#FFFFFF';
  const accent = normalizeHex(brand.colors.accent ?? mix(primary, '#FFFFFF', 0.82));
  return {
    primary,
    background,
    text: contrastRatio(text, background) >= 4.5 ? text : bestTextOn(background, [dark, light, '#000000']),
    accent,
    onPrimary: bestTextOn(primary, [light, dark, '#000000']),
    onAccent: bestTextOn(accent, [dark, light, '#000000']),
    surface: mix(background, primary, 0.06),
    muted: mix(text, background, 0.35),
    dark,
    light,
  };
}

// ---------- text layout ----------
export const FONT_STACKS: Record<string, string> = {
  Inter: 'Inter',
  'Playfair Display': 'Playfair Display',
};
export const ALLOWED_FONTS = Object.keys(FONT_STACKS);

/** Deterministic approximate measurer, used in Node tests / when no canvas is available. */
export const approximateMeasurer: TextMeasurer = (text, _family, weight, size) => {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 0.28;
    else if ('il.,:;!|\''.includes(ch)) w += 0.3;
    else if ('mwMW'.includes(ch)) w += 0.86;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else w += 0.56;
  }
  return w * size * (weight >= 700 ? 1.06 : 1);
};

let canvasMeasurer: TextMeasurer | null = null;
/** Browser measurer using the same canvas text engine Konva uses. */
export function getCanvasMeasurer(): TextMeasurer {
  if (canvasMeasurer) return canvasMeasurer;
  const ctx = document.createElement('canvas').getContext('2d')!;
  const cache = new Map<string, number>();
  canvasMeasurer = (text, family, weight, size) => {
    const key = `${weight}|${size}|${family}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = `normal normal ${weight} ${size}px "${family}"`;
    const w = ctx.measureText(text).width;
    if (cache.size > 20000) cache.clear();
    cache.set(key, w);
    return w;
  };
  return canvasMeasurer;
}

/** Konva's font string for a given weight. */
export function konvaFontStyle(weight: number): string {
  return String(weight);
}

export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  return wrapTextDetailed(text, maxWidth, measure).lines;
}

/** Word wrap. `broke` is true when a single word had to be split by characters. */
export function wrapTextDetailed(text: string, maxWidth: number, measure: (s: string) => number): { lines: string[]; broke: boolean } {
  const out: string[] = [];
  let broke = false;
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // word longer than the line: hard-break by characters
      if (measure(word) > maxWidth) {
        broke = true;
        let chunk = '';
        for (const ch of word) {
          if (measure(chunk + ch) > maxWidth && chunk) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
    if (line) out.push(line);
  }
  return { lines: out, broke };
}

export interface FitResult {
  lines: string[];
  fontSize: number;
  height: number;
  overflow: boolean;
}

/** Largest font size in [min,max] (step 2px) whose wrapped text fits the box. */
export function fitText(
  text: string,
  box: { width: number; height: number; padding: number },
  font: { family: string; weight: number; max: number; min: number; lineHeight: number },
  measurer: TextMeasurer,
): FitResult {
  const innerW = Math.max(1, box.width - box.padding * 2);
  const innerH = Math.max(1, box.height - box.padding * 2);
  const min = Math.min(font.min, font.max);
  for (let size = font.max; size >= min; size -= 2) {
    const m = (s: string) => measurer(s, font.family, font.weight, size);
    const { lines, broke } = wrapTextDetailed(text, innerW, m);
    const h = lines.length * size * font.lineHeight;
    if (!broke && h <= innerH && lines.every((l) => m(l) <= innerW + 0.5)) return { lines, fontSize: size, height: h, overflow: false };
  }
  const m = (s: string) => measurer(s, font.family, font.weight, min);
  const lines = wrapText(text, innerW, m);
  return { lines, fontSize: min, height: lines.length * min * font.lineHeight, overflow: true };
}

export function applyTextLayout(layer: Layer, measurer: TextMeasurer, warnings: SceneWarning[]): Layer {
  if (layer.type !== 'text') return layer;
  const raw = layer.text ?? '';
  const text = layer.text_transform === 'uppercase' ? raw.toLocaleUpperCase('pt-BR') : raw;
  const max = layer.font_size ?? 40;
  const fit = fitText(
    text,
    { width: layer.width, height: layer.height, padding: layer.padding ?? 0 },
    { family: layer.font_family ?? 'Inter', weight: layer.font_weight ?? 400, max, min: Math.min(layer.font_size_min ?? max, max), lineHeight: layer.line_height ?? 1.2 },
    measurer,
  );
  const innerH = layer.height - (layer.padding ?? 0) * 2;
  const va = layer.vertical_align ?? 'top';
  const offset = va === 'top' ? 0 : va === 'middle' ? (innerH - fit.height) / 2 : innerH - fit.height;
  if (fit.overflow && layer.visible) {
    warnings.push({
      severity: 'error',
      code: 'overflow',
      layer_id: layer.id,
      message: `"${layer.name}" não cabe na área (${fit.lines.length} linhas a ${fit.fontSize}px). Reduza o texto ou troque de template/variante.`,
    });
  }
  return { ...layer, lines: fit.lines, fitted_font_size: fit.fontSize, text_offset_y: Math.max(0, offset), overflow: fit.overflow };
}

export function checkContrast(layer: Layer, overridden: boolean, palette: Palette, warnings: SceneWarning[]): Layer {
  if (layer.type !== 'text' || !layer.fill || !layer.contrast_bg || !layer.visible) return layer;
  const need = layer.min_contrast ?? ((layer.font_size ?? 0) >= 56 ? 3 : 4.5);
  const ratio = contrastRatio(layer.fill, layer.contrast_bg);
  if (ratio >= need) return layer;
  if (overridden) {
    warnings.push({ severity: 'warning', code: 'contrast', layer_id: layer.id, message: `Contraste baixo em "${layer.name}" (${ratio.toFixed(2)}:1, mínimo ${need}:1).` });
    return layer;
  }
  const fixed = bestTextOn(layer.contrast_bg, [palette.light, palette.dark, '#000000']);
  warnings.push({ severity: 'info', code: 'contrast_fixed', layer_id: layer.id, message: `Cor de "${layer.name}" ajustada para garantir contraste.` });
  return { ...layer, fill: fixed };
}

export function checkBounds(layer: Layer, warnings: SceneWarning[]) {
  if (!layer.visible || layer.role === 'background') return;
  const tol = 1;
  if (layer.role === 'text') {
    const insideSafe = layer.x >= SAFE_MARGIN - 24 - tol && layer.y >= SAFE_MARGIN - 24 - tol && layer.x + layer.width <= CANVAS_W - SAFE_MARGIN + 24 + tol && layer.y + layer.height <= CANVAS_H - SAFE_MARGIN + 24 + tol;
    if (!insideSafe) warnings.push({ severity: 'warning', code: 'bounds', layer_id: layer.id, message: `"${layer.name}" está fora da margem segura de ${SAFE_MARGIN}px.` });
  }
  if (layer.x < -tol || layer.y < -tol || layer.x + layer.width > CANVAS_W + tol || layer.y + layer.height > CANVAS_H + tol) {
    if (layer.role === 'text') warnings.push({ severity: 'error', code: 'bounds', layer_id: layer.id, message: `"${layer.name}" ultrapassa os limites do Canvas.` });
  }
}

// ---------- helpers used by templates ----------
let zCounter = 0;
export function resetZ() {
  zCounter = 0;
}

type LayerInit = Partial<Layer> & Pick<Layer, 'id' | 'name' | 'type' | 'role' | 'x' | 'y' | 'width' | 'height'>;
export function layer(init: LayerInit): Layer {
  zCounter += 10;
  return { rotation: 0, opacity: 1, z_index: zCounter, locked: false, visible: true, ...init };
}

export function rect(id: string, name: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<Layer> = {}): Layer {
  return layer({ id, name, type: 'rect', role: 'shape', x, y, width: w, height: h, fill, corner_radius: 0, ...extra });
}

export function textLayer(id: string, name: string, x: number, y: number, w: number, h: number, text: string, extra: Partial<Layer>): Layer {
  return layer({
    id,
    name,
    type: 'text',
    role: 'text',
    x,
    y,
    width: w,
    height: h,
    text,
    font_family: 'Inter',
    font_weight: 400,
    line_height: 1.2,
    text_align: 'left',
    vertical_align: 'top',
    padding: 0,
    ...extra,
  });
}

export function imageLayer(id: string, name: string, x: number, y: number, w: number, h: number, assetId: string | null, extra: Partial<Layer> = {}): Layer {
  return layer({
    id,
    name,
    type: 'image',
    role: 'image',
    x,
    y,
    width: w,
    height: h,
    asset_id: assetId,
    image_fit: 'cover',
    image_focal_x: 0.5,
    image_focal_y: 0.5,
    image_zoom: 1,
    corner_radius: 0,
    fill: '#E6EFFB',
    ...extra,
  });
}

export const HEADLINE = { min: 56, max: 100 };
export const BODY = { min: 28, max: 42 };

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
