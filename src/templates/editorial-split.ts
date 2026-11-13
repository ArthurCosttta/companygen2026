import { CANVAS_H, CANVAS_W, SAFE_MARGIN as M, type Layer, type TemplateDefinition } from '@/compiler/types';
import { BODY, HEADLINE, imageLayer, layer, textLayer } from '@/compiler/layout-engine';
import { brandMark, slideCounter } from './common';

/** Image share for each variant. ≤50% splits horizontally, 60% splits vertically (keeps text column legible). */
const RATIOS: Record<string, number> = { split_40_60: 0.4, split_50_50: 0.5, split_60_40: 0.6 };

export const editorialSplitTemplate: TemplateDefinition = {
  id: 'editorial_split',
  label: 'Editorial dividido',
  description: 'Composição dividida entre imagem e texto (40/60, 50/50, 60/40).',
  defaultVariant: 'split_50_50',
  variants: [
    { id: 'split_40_60', label: '40/60 (imagem/texto)' },
    { id: 'split_50_50', label: '50/50' },
    { id: 'split_60_40', label: '60/40 (imagem/texto)' },
  ],
  build(ctx) {
    const p = ctx.palette;
    const s = ctx.slide;
    const assetId = ctx.asset?.asset_id ?? null;
    const r = RATIOS[ctx.variant] ?? 0.5;
    const out: Layer[] = [];
    out.push(layer({ id: 'bg', name: 'Fundo', type: 'rect', role: 'background', x: 0, y: 0, width: CANVAS_W, height: CANVAS_H, fill: p.background }));

    if (r > 0.5) {
      const ih = Math.round(CANVAS_H * r);
      out.push(imageLayer('photo', 'Foto', 0, 0, CANVAS_W, ih, assetId, { image_query: s.image_query }));
      out.push(layer({ id: 'accent_bar', name: 'Barra de destaque', type: 'rect', role: 'decoration', x: M, y: ih + 48, width: 96, height: 10, fill: p.primary, corner_radius: 5 }));
      const top = ih + 82;
      const avail = CANVAS_H - M - top;
      out.push(textLayer('headline', 'Headline', M, top, CANVAS_W - M * 2, Math.round(avail * 0.58), s.headline, { font_size: 84, font_size_min: HEADLINE.min, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.background }));
      if (s.body) out.push(textLayer('body', 'Texto complementar', M, top + Math.round(avail * 0.6), CANVAS_W - M * 2, Math.round(avail * 0.4), s.body, { font_size: 36, font_size_min: BODY.min, font_weight: 500, line_height: 1.25, fill: p.muted, contrast_bg: p.background }));
      out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.light, color: p.dark }));
      return out;
    }

    const iw = Math.round(CANVAS_W * r);
    const tx = iw + 56;
    const tw = CANVAS_W - M - tx;
    out.push(layer({ id: 'panel', name: 'Painel de texto', type: 'rect', role: 'shape', x: iw, y: 0, width: CANVAS_W - iw, height: CANVAS_H, fill: p.surface }));
    out.push(imageLayer('photo', 'Foto', 0, 0, iw, CANVAS_H, assetId, { image_query: s.image_query }));
    out.push(layer({ id: 'accent_bar', name: 'Barra de destaque', type: 'rect', role: 'decoration', x: tx, y: 300, width: 96, height: 10, fill: p.primary, corner_radius: 5 }));
    out.push(textLayer('headline', 'Headline', tx, 340, tw, 540, s.headline, { font_size: r === 0.4 ? 88 : 76, font_size_min: HEADLINE.min, font_weight: 800, line_height: 1.05, fill: p.text, contrast_bg: p.surface }));
    if (s.body) out.push(textLayer('body', 'Texto complementar', tx, 900, tw, 300, s.body, { font_size: 38, font_size_min: BODY.min, font_weight: 500, line_height: 1.3, fill: p.muted, contrast_bg: p.surface }));
    out.push(...brandMark(ctx, { fill: p.light, color: p.primary }), ...slideCounter(ctx, { fill: p.background, color: p.text }));
    return out;
  },
};
