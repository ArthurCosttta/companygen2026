import { CANVAS_H, CANVAS_W, SAFE_MARGIN as M, type Layer, type TemplateDefinition } from '@/compiler/types';
import { BODY, imageLayer, layer, textLayer } from '@/compiler/layout-engine';
import { brandMark, hasPrice, priceTag, slideCounter } from './common';

const W = CANVAS_W - M * 2;

export const productFocusTemplate: TemplateDefinition = {
  id: 'product_focus',
  label: 'Produto em foco',
  description: 'Imagem em destaque, nome do produto e área opcional para preço confirmado.',
  defaultVariant: 'card',
  variants: [
    { id: 'card', label: 'Cartão central' },
    { id: 'full_bleed', label: 'Foto inteira + cartão' },
    { id: 'side', label: 'Foto lateral' },
  ],
  build(ctx) {
    const p = ctx.palette;
    const s = ctx.slide;
    const assetId = ctx.asset?.asset_id ?? null;
    const price = hasPrice(ctx);
    const out: Layer[] = [];
    if (ctx.variant === 'full_bleed') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.dark }));
      out.push(imageLayer('photo', 'Foto do produto', 0, 0, CANVAS_W, CANVAS_H, assetId, { image_query: s.image_query }));
      out.push(layer({ id: 'card', name: 'Cartão de informações', type: 'rect', role: 'shape', x: 48, y: 900, width: CANVAS_W - 96, height: 402, fill: p.background, corner_radius: 40 }));
      out.push(textLayer('headline', 'Nome do produto', 96, 940, CANVAS_W - 192, 160, s.headline, { font_size: 76, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background, vertical_align: 'bottom' }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', 96, 1112, CANVAS_W - 192, price ? 80 : 150, s.body, { font_size: 34, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.background }));
      out.push(...priceTag(ctx, 96, 1202, { fill: p.primary, color: p.onPrimary }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    if (ctx.variant === 'side') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.background }));
      out.push(imageLayer('photo', 'Foto do produto', 560, 0, CANVAS_W - 560, CANVAS_H, assetId, { image_query: s.image_query }));
      out.push(layer({ id: 'accent_bar', name: 'Barra de destaque', type: 'rect', role: 'decoration', x: M, y: 330, width: 96, height: 10, fill: p.primary, corner_radius: 5 }));
      out.push(textLayer('headline', 'Nome do produto', M, 370, 440, 420, s.headline, { font_size: 80, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 810, 440, 240, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.3, fill: p.muted, contrast_bg: p.background }));
      out.push(...priceTag(ctx, M, 1090, { fill: p.primary, color: p.onPrimary }));
      out.push(...brandMark(ctx, { fill: p.surface, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    // card (default)
    out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.surface }));
    out.push(layer({ id: 'halo', name: 'Forma decorativa', type: 'ellipse', role: 'decoration', x: 140, y: 150, width: 800, height: 800, fill: p.primary, opacity: 0.08 }));
    out.push(imageLayer('photo', 'Foto do produto', 152, 168, 776, 736, assetId, { corner_radius: 40, image_query: s.image_query }));
    out.push(textLayer('headline', 'Nome do produto', M, 932, W, 150, s.headline, { font_size: 80, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.surface, text_align: 'center', vertical_align: 'middle' }));
    if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1090, W, price ? 100 : 188, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.surface, text_align: 'center' }));
    out.push(...priceTag(ctx, 0, 1202, { fill: p.primary, color: p.onPrimary, align: 'center' }));
    out.push(...brandMark(ctx, { fill: p.background, color: p.primary }), ...slideCounter(ctx, { fill: p.background, color: p.text }));
    return out;
  },
};
