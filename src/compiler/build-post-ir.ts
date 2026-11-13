import {
  CANVAS_H,
  CANVAS_W,
  ENGINE_VERSION,
  type Asset,
  type Layer,
  type LayerOverrides,
  type PostSceneIR,
  type SceneWarning,
  type TextMeasurer,
} from './types';
import { applyTextLayout, buildPalette, checkBounds, checkContrast, resetZ } from './layout-engine';
import { getTemplate } from './template-registry';
import { resolveAsset } from './image-resolver';
import type { BrandSpec, CampaignInfo, PostSpec, ProductSpec, SlideSpec } from '@/schemas/campaign.schema';

/** Internal slide representation: the JSON slide + persisted editor overrides. */
export type StudioSlide = SlideSpec & { layer_overrides?: LayerOverrides };
export type StudioPost = Omit<PostSpec, 'slides'> & { slides: StudioSlide[] };

export interface CompileInput {
  brand: BrandSpec;
  campaign: CampaignInfo;
  post: StudioPost;
  products: ProductSpec[];
  assets: Asset[];
  measurer: TextMeasurer;
}

const OVERRIDABLE: ReadonlySet<string> = new Set([
  'name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'z_index', 'locked', 'visible', 'fill', 'stroke', 'stroke_width',
  'corner_radius', 'padding', 'text', 'font_family', 'font_size', 'font_size_min', 'font_weight', 'line_height', 'text_align',
  'vertical_align', 'text_transform', 'asset_id', 'image_fit', 'image_focal_x', 'image_focal_y', 'image_zoom', 'gradient_stops',
]);

export function sanitizeOverride(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (OVERRIDABLE.has(k) && v !== undefined) out[k] = v;
  return out;
}

/** FNV-1a 32-bit over a stable JSON string. */
export function stableHash(value: unknown): string {
  const json = JSON.stringify(value, (_k, v) => (v instanceof Blob ? undefined : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * PostCompositionEngine: compiles every slide of a post into a PostSceneIR.
 * Pure + deterministic: same input → same IR (and same hash).
 */
export class PostCompositionEngine {
  constructor(private readonly measurer: TextMeasurer) {}

  compilePost(input: Omit<CompileInput, 'measurer'>): PostSceneIR[] {
    const used = new Set<string>();
    return input.post.slides.map((slide, i) => {
      const scene = this.compileSlide({ ...input, measurer: this.measurer }, slide, i, used);
      scene.metadata.asset_ids.forEach((a) => used.add(a));
      return scene;
    });
  }

  compileSlide(input: CompileInput, slide: StudioSlide, slideIndex: number, usedInPost = new Set<string>()): PostSceneIR {
    return compileSlide(input, slide, slideIndex, usedInPost);
  }
}

export function compileSlide(input: CompileInput, slide: StudioSlide, slideIndex: number, usedInPost = new Set<string>()): PostSceneIR {
  const { brand, campaign, post, products, assets, measurer } = input;
  const warnings: SceneWarning[] = [];
  const template = getTemplate(slide.template);
  if (!template) throw new Error(`Template não registrado: ${slide.template}`);
  let variant = slide.variant && slide.variant !== 'default' ? slide.variant : template.defaultVariant;
  if (!template.variants.some((v) => v.id === variant)) {
    warnings.push({ severity: 'warning', code: 'variant', message: `Variante "${variant}" inexistente em ${template.id}; usando "${template.defaultVariant}".` });
    variant = template.defaultVariant;
  }
  const postProducts = products.filter((p) => post.product_ids.includes(p.id));
  const resolved = resolveAsset({ slide, slideIndex, post: post as PostSpec, products, assets, campaignId: campaign.id, usedInPost });
  if (resolved.missingExplicitId) {
    warnings.push({ severity: 'error', code: 'missing_image', message: `Imagem "${resolved.missingExplicitId}" não encontrada na biblioteca.` });
  }
  const palette = buildPalette(brand);

  resetZ();
  const base = template.build({
    brand,
    campaign,
    post: post as PostSpec,
    slide,
    slideIndex,
    slideCount: post.slides.length,
    products: postProducts,
    asset: resolved.asset,
    palette,
    variant,
  });

  if (slide.template === 'product_focus' && slide.show_price) {
    const p = postProducts[0];
    if (!p || p.price_cents == null) warnings.push({ severity: 'info', code: 'price', message: 'Preço não confirmado: área de preço omitida.' });
  }

  const overrides = slide.layer_overrides ?? {};
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));
  const layers: Layer[] = base.map((l) => {
    const ov = overrides[l.id] ? (sanitizeOverride(overrides[l.id] as Record<string, unknown>) as Partial<Layer>) : null;
    let out: Layer = ov ? { ...l, ...ov } : l;
    if (out.type === 'image') {
      out.image_focal_x = clamp(out.image_focal_x ?? 0.5, 0, 1);
      out.image_focal_y = clamp(out.image_focal_y ?? 0.5, 0, 1);
      out.image_zoom = clamp(out.image_zoom ?? 1, 1, 4);
      if (out.asset_id && !assetById.has(out.asset_id)) {
        warnings.push({ severity: 'error', code: 'missing_image', layer_id: out.id, message: `Imagem "${out.asset_id}" indisponível — placeholder exibido.` });
      }
      if (!out.asset_id && out.visible) {
        warnings.push({ severity: 'warning', code: 'missing_image', layer_id: out.id, message: `Sem imagem para "${out.image_query ?? out.name}" — placeholder identificado.` });
      }
      const a = out.asset_id ? assetById.get(out.asset_id) : undefined;
      if (a && out.visible) {
        const scale = Math.max(out.width / a.width, out.height / a.height) * (out.image_zoom ?? 1);
        if (scale > 1.6) warnings.push({ severity: 'info', code: 'low_resolution', layer_id: out.id, message: `Foto ampliada ${scale.toFixed(1)}× (${a.width}×${a.height}px): pode perder nitidez.` });
      }
    }
    out = checkContrast(out, Boolean(ov && 'fill' in ov), palette, warnings);
    out = applyTextLayout(out, measurer, warnings);
    checkBounds(out, warnings);
    return out;
  });

  const bg = layers.find((l) => l.role === 'background');
  const scene: PostSceneIR = {
    width: CANVAS_W,
    height: CANVAS_H,
    background: { fill: bg?.fill ?? palette.background },
    image_layers: layers.filter((l) => l.role === 'image'),
    shape_layers: layers.filter((l) => l.role === 'shape' || l.role === 'background'),
    text_layers: layers.filter((l) => l.role === 'text'),
    decorations: layers.filter((l) => l.role === 'decoration'),
    metadata: {
      engine_version: ENGINE_VERSION,
      campaign_id: campaign.id,
      post_id: post.id,
      slide_id: slide.id,
      slide_index: slideIndex,
      slide_count: post.slides.length,
      template: template.id,
      variant,
      asset_ids: layers.filter((l) => l.type === 'image' && l.asset_id && l.visible).map((l) => l.asset_id!) ,
      warnings,
      hash: '',
    },
  };
  scene.metadata.hash = stableHash({ ...scene, metadata: { ...scene.metadata, hash: '' } });
  return scene;
}

/** All layers in paint order (z_index asc, stable). */
export function orderedLayers(scene: PostSceneIR): Layer[] {
  const all = [...scene.shape_layers, ...scene.image_layers, ...scene.text_layers, ...scene.decorations];
  return all.map((l, i) => ({ l, i })).sort((a, b) => a.l.z_index - b.l.z_index || a.i - b.i).map((x) => x.l);
}

export function hasBlockingIssues(scene: PostSceneIR): SceneWarning[] {
  return scene.metadata.warnings.filter((w) => w.severity === 'error');
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
