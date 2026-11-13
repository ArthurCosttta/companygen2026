import { CANVAS_W, SAFE_MARGIN, type Layer, type TemplateContext } from '@/compiler/types';
import { approximateMeasurer, formatPrice, layer, rect, textLayer } from '@/compiler/layout-engine';

/** Approximate pill width from text (deterministic, template-time only; final fit is done by layout engine). */
function pillWidth(text: string, size: number, weight: number, padX: number, max = CANVAS_W - SAFE_MARGIN * 2) {
  return Math.min(max, Math.ceil(approximateMeasurer(text, 'Inter', weight, size) * 1.08 + padX * 2));
}

/** Brand identification pill (top-left). */
export function brandMark(ctx: TemplateContext, opts: { fill: string; color: string; x?: number; y?: number }): Layer[] {
  const name = ctx.brand.name;
  const x = opts.x ?? SAFE_MARGIN;
  const y = opts.y ?? SAFE_MARGIN;
  const w = pillWidth(name, 28, 700, 64, 560);
  return [
    layer({ id: 'brand_pill', name: 'Marca (fundo)', type: 'rect', role: 'decoration', x, y, width: w, height: 64, fill: opts.fill, corner_radius: 32 }),
    layer({ id: 'brand_dot', name: 'Marca (ponto)', type: 'ellipse', role: 'decoration', x: x + 22, y: y + 24, width: 16, height: 16, fill: ctx.palette.primary === opts.fill ? opts.color : ctx.palette.primary }),
    textLayer('brand_name', 'Marca', x + 48, y + 8, w - 64, 48, name, {
      role: 'decoration',
      font_size: 28,
      font_size_min: 20,
      font_weight: 700,
      fill: opts.color,
      contrast_bg: opts.fill,
      vertical_align: 'middle',
      line_height: 1.1,
    }),
  ];
}

/** Carousel position "2/5" (top-right). */
export function slideCounter(ctx: TemplateContext, opts: { fill: string; color: string }): Layer[] {
  if (ctx.slideCount < 2) return [];
  const w = 120;
  const x = CANVAS_W - SAFE_MARGIN - w;
  return [
    layer({ id: 'counter_pill', name: 'Contador (fundo)', type: 'rect', role: 'decoration', x, y: SAFE_MARGIN, width: w, height: 64, fill: opts.fill, corner_radius: 32, opacity: 0.94 }),
    textLayer('counter_text', 'Contador', x, SAFE_MARGIN + 8, w, 48, `${ctx.slideIndex + 1}/${ctx.slideCount}`, {
      role: 'decoration',
      font_size: 26,
      font_size_min: 22,
      font_weight: 600,
      fill: opts.color,
      contrast_bg: opts.fill,
      text_align: 'center',
      vertical_align: 'middle',
      line_height: 1.1,
    }),
  ];
}

export function ctaPill(label: string, x: number, y: number, opts: { fill: string; color: string; align?: 'left' | 'center' }): Layer[] {
  const w = pillWidth(label + ' →', 34, 700, 48);
  const px = opts.align === 'center' ? (CANVAS_W - w) / 2 : x;
  return [
    rect('cta_button', 'Botão CTA', px, y, w, 88, opts.fill, { corner_radius: 44 }),
    textLayer('cta_label', 'Texto do CTA', px + 32, y + 12, w - 64, 64, `${label} →`, {
      font_size: 34,
      font_size_min: 24,
      font_weight: 700,
      fill: opts.color,
      contrast_bg: opts.fill,
      text_align: 'center',
      vertical_align: 'middle',
      line_height: 1.1,
    }),
  ];
}

/** Confirmed price tag. Returns [] when price is not confirmed (null) or not requested. */
export function priceTag(ctx: TemplateContext, x: number, y: number, opts: { fill: string; color: string; align?: 'left' | 'center' }): Layer[] {
  const product = ctx.products[0];
  if (!ctx.slide.show_price || !product || product.price_cents == null) return [];
  const label = formatPrice(product.price_cents);
  const w = pillWidth(label, 36, 800, 40);
  const px = opts.align === 'center' ? (CANVAS_W - w) / 2 : x;
  return [
    rect('price_bg', 'Preço (fundo)', px, y, w, 76, opts.fill, { corner_radius: 20 }),
    textLayer('price', 'Preço', px + 20, y + 8, w - 40, 60, label, {
      font_size: 36,
      font_size_min: 26,
      font_weight: 800,
      fill: opts.color,
      contrast_bg: opts.fill,
      text_align: 'center',
      vertical_align: 'middle',
      line_height: 1.1,
    }),
  ];
}

export function hasPrice(ctx: TemplateContext): boolean {
  const p = ctx.products[0];
  return Boolean(ctx.slide.show_price && p && p.price_cents != null);
}

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
