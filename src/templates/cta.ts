import { CANVAS_H, CANVAS_W, SAFE_MARGIN as M, type Layer, type TemplateDefinition } from '@/compiler/types';
import { BODY, imageLayer, layer, mix, textLayer } from '@/compiler/layout-engine';
import { brandMark, ctaPill, slideCounter } from './common';

const W = CANVAS_W - M * 2;

export const ctaTemplate: TemplateDefinition = {
  id: 'cta',
  label: 'Chamada final (CTA)',
  description: 'Imagem, mensagem final e CTA visual.',
  defaultVariant: 'band',
  variants: [
    { id: 'band', label: 'Faixa de cor' },
    { id: 'centered', label: 'Centralizado sobre foto' },
    { id: 'card', label: 'Cartão com foto' },
  ],
  build(ctx) {
    const p = ctx.palette;
    const s = ctx.slide;
    const assetId = ctx.asset?.asset_id ?? null;
    const label = s.cta_label?.trim() || 'Saiba mais';
    const out: Layer[] = [];
    if (ctx.variant === 'centered') {
      const shade = mix(p.dark, '#000000', 0.2);
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: shade }));
      out.push(imageLayer('photo', 'Foto', 0, 0, CANVAS_W, CANVAS_H, assetId, { image_query: s.image_query }));
      out.push(layer({ id: 'overlay', name: 'Sombreamento', type: 'rect', role: 'shape', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: shade, opacity: 0.62 }));
      out.push(textLayer('headline', 'Headline', M, 360, W, 400, s.headline, { font_size: 96, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.light, contrast_bg: shade, text_align: 'center', vertical_align: 'bottom' }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 784, W, 150, s.body, { font_size: 40, font_size_min: BODY.min, font_weight: 500, line_height: 1.3, fill: p.light, contrast_bg: shade, text_align: 'center' }));
      out.push(...ctaPill(label, 0, 968, { fill: p.light, color: p.dark, align: 'center' }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    if (ctx.variant === 'card') {
      out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.primary }));
      out.push(imageLayer('photo', 'Foto', M, 176, W, 680, assetId, { corner_radius: 40, image_query: s.image_query }));
      out.push(textLayer('headline', 'Headline', M, 890, W, 180, s.headline, { font_size: 84, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.onPrimary, contrast_bg: p.primary, vertical_align: 'bottom' }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1080, W, 90, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.onPrimary, contrast_bg: p.primary }));
      out.push(...ctaPill(label, M, 1190, { fill: p.accent, color: p.onAccent }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }
    // band (default)
    out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.primary }));
    out.push(imageLayer('photo', 'Foto', 0, 0, CANVAS_W, 820, assetId, { image_query: s.image_query }));
    out.push(layer({ id: 'band', name: 'Faixa de cor', type: 'rect', role: 'shape', x: 0, y: 820, width: CANVAS_W, height: CANVAS_H - 820, fill: p.primary }));
    out.push(textLayer('headline', 'Headline', M, 868, W, 190, s.headline, { font_size: 88, font_size_min: 56, font_weight: 800, line_height: 1.05, fill: p.onPrimary, contrast_bg: p.primary, vertical_align: 'bottom' }));
    if (s.body) out.push(textLayer('body', 'Texto complementar', M, 1068, W, 100, s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.onPrimary, contrast_bg: p.primary }));
    out.push(...ctaPill(label, M, 1190, { fill: p.onPrimary, color: p.primary }));
    out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
    return out;
  },
};
