import { CANVAS_H, CANVAS_W, SAFE_MARGIN as M, type Layer, type TemplateDefinition } from '@/compiler/types';
import { BODY, HEADLINE, imageLayer, layer, textLayer } from '@/compiler/layout-engine';
import { brandMark, rgba, slideCounter } from './common';

const W = CANVAS_W - M * 2;

export const coverTemplate: TemplateDefinition = {
  id: 'cover',
  label: 'Capa',
  description: 'Imagem principal, headline de alto contraste e identidade da marca.',
  defaultVariant: 'panel',
  variants: [
    { id: 'panel', label: 'Painel lateral' },
    { id: 'bottom_gradient', label: 'Foto inteira + degradê' },
    { id: 'framed', label: 'Foto emoldurada' },
  ],
  build(ctx) {
    const p = ctx.palette;
    const s = ctx.slide;
    const assetId = ctx.asset?.asset_id ?? null;
    const out: Layer[] = [];
    if (ctx.variant === 'bottom_gradient') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.dark }));
      out.push(imageLayer('photo', 'Foto principal', 0, 0, CANVAS_W, CANVAS_H, assetId, { image_query: s.image_query }));
      out.push(
        layer({
          id: 'scrim', name: 'Degradê de leitura', type: 'gradient', role: 'shape', x: 0, y: 480, width: CANVAS_W, height: CANVAS_H - 480,
          gradient_direction: 'vertical', gradient_stops: [[0, rgba(p.dark, 0)], [0.45, rgba(p.dark, 0.78)], [1, rgba(p.dark, 0.94)]],
        }),
      );
      out.push(textLayer('headline', 'Headline', M, 700, W, 380, s.headline, { font_size: HEADLINE.max, font_size_min: HEADLINE.min, font_weight: 800, line_height: 1.05, fill: p.light, contrast_bg: p.dark, vertical_align: 'bottom' }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1104, W, 174, s.body, { font_size: BODY.max, font_size_min: BODY.min, font_weight: 500, line_height: 1.3, fill: p.light, contrast_bg: p.dark }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    if (ctx.variant === 'framed') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.background }));
      out.push(imageLayer('photo', 'Foto principal', M, 176, W, 760, assetId, { corner_radius: 36, image_query: s.image_query }));
      out.push(layer({ id: 'accent_bar', name: 'Barra de destaque', type: 'rect', role: 'decoration', x: M, y: 972, width: 96, height: 10, fill: p.primary, corner_radius: 5 }));
      out.push(textLayer('headline', 'Headline', M, 1004, W, 180, s.headline, { font_size: 84, font_size_min: HEADLINE.min, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1192, W, 86, s.body, { font_size: 34, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.background }));
      out.push(...brandMark(ctx, { fill: p.primary, color: p.onPrimary }), ...slideCounter(ctx, { fill: p.surface, color: p.text }));
      return out;
    }
    // panel (default) — mirrors the reference composition: text column + photo on the right
    const split = 500;
    out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.background }));
    out.push(imageLayer('photo', 'Foto principal', split, 0, CANVAS_W - split, CANVAS_H, assetId, { image_query: s.image_query }));
    out.push(
      layer({
        id: 'fade', name: 'Transição da foto', type: 'gradient', role: 'shape', x: split - 1, y: 0, width: 140, height: CANVAS_H,
        gradient_direction: 'horizontal', gradient_stops: [[0, rgba(p.background, 1)], [1, rgba(p.background, 0)]],
      }),
    );
    out.push(layer({ id: 'wave', name: 'Forma decorativa', type: 'ellipse', role: 'decoration', x: -260, y: 1060, width: 1100, height: 560, fill: p.primary, opacity: 0.1 }));
    out.push(textLayer('headline', 'Headline', M, 300, 410, 560, s.headline, { font_size: 92, font_size_min: HEADLINE.min, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background, vertical_align: 'bottom' }));
    if (s.body) out.push(textLayer('body', 'Texto complementar', M, 892, 400, 260, s.body, { font_size: 38, font_size_min: BODY.min, font_weight: 500, line_height: 1.3, fill: p.muted, contrast_bg: p.background }));
    out.push(...brandMark(ctx, { fill: p.surface, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
    return out;
  },
};
