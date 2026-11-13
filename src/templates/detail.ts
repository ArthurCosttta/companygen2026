import { CANVAS_H, CANVAS_W, SAFE_MARGIN as M, type Layer, type TemplateDefinition } from '@/compiler/types';
import { BODY, imageLayer, layer, textLayer } from '@/compiler/layout-engine';
import { brandMark, slideCounter } from './common';

const W = CANVAS_W - M * 2;

export const detailTemplate: TemplateDefinition = {
  id: 'detail',
  label: 'Detalhe',
  description: 'Fotografia com crop aproximado e bloco de explicação.',
  defaultVariant: 'zoom_panel',
  variants: [
    { id: 'zoom_panel', label: 'Zoom + painel' },
    { id: 'zoom_caption', label: 'Zoom + legenda abaixo' },
    { id: 'circle', label: 'Lupa circular' },
  ],
  build(ctx) {
    const p = ctx.palette;
    const s = ctx.slide;
    const assetId = ctx.asset?.asset_id ?? null;
    const out: Layer[] = [];
    if (ctx.variant === 'zoom_caption') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.background }));
      out.push(imageLayer('photo', 'Foto (detalhe)', 0, 0, CANVAS_W, 900, assetId, { image_zoom: 1.7, image_query: s.image_query }));
      out.push(layer({ id: 'accent_bar', name: 'Barra de destaque', type: 'rect', role: 'decoration', x: M, y: 948, width: 96, height: 10, fill: p.primary, corner_radius: 5 }));
      out.push(textLayer('headline', 'Headline', M, 982, W, 170, s.headline, { font_size: 76, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1160, W, 118, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.background }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    if (ctx.variant === 'circle') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.surface }));
      out.push(layer({ id: 'ring', name: 'Anel', type: 'ellipse', role: 'decoration', x: 170, y: 170, width: 740, height: 740, fill: p.primary, opacity: 0.14 }));
      out.push(imageLayer('photo', 'Foto (detalhe)', 200, 200, 680, 680, assetId, { corner_radius: 340, image_zoom: 1.6, image_query: s.image_query }));
      out.push(textLayer('headline', 'Headline', M, 940, W, 180, s.headline, { font_size: 76, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.surface, text_align: 'center', vertical_align: 'middle' }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1136, W, 142, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.surface, text_align: 'center' }));
      out.push(...brandMark(ctx, { fill: p.background, color: p.primary }), ...slideCounter(ctx, { fill: p.background, color: p.text }));
      return out;
    }
    // zoom_panel (default)
    out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.dark }));
    out.push(imageLayer('photo', 'Foto (detalhe)', 0, 0, CANVAS_W, CANVAS_H, assetId, { image_zoom: 1.6, image_query: s.image_query }));
    out.push(layer({ id: 'lens', name: 'Marcador de detalhe', type: 'ellipse', role: 'decoration', x: 700, y: 220, width: 230, height: 230, stroke: p.light, stroke_width: 8, opacity: 0.9 }));
    out.push(layer({ id: 'panel', name: 'Painel de texto', type: 'rect', role: 'shape', x: M, y: 912, width: W, height: 366, fill: p.background, corner_radius: 32, opacity: 0.97 }));
    out.push(textLayer('headline', 'Headline', M + 44, 948, W - 88, 170, s.headline, { font_size: 72, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background, vertical_align: 'bottom' }));
    if (s.body) out.push(textLayer('body', 'Texto complementar', M + 44, 1132, W - 88, 112, s.body, { font_size: 34, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.background }));
    out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
    return out;
  },
};
