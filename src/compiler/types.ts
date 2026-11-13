import type { BrandSpec, CampaignInfo, PostSpec, ProductSpec, SlideSpec } from '@/schemas/campaign.schema';

export const CANVAS_W = 1080;
export const CANVAS_H = 1350;
export const SAFE_MARGIN = 72;
export const ENGINE_VERSION = '1.0.0';

export type LayerType = 'rect' | 'ellipse' | 'gradient' | 'image' | 'text';
export type LayerRole = 'background' | 'image' | 'shape' | 'text' | 'decoration';
export type ImageFit = 'cover' | 'contain';
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** A single scene element. Coordinates are logical canvas units (1080×1350). */
export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  role: LayerRole;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  z_index: number;
  locked: boolean;
  visible: boolean;
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  corner_radius?: number;
  padding?: number;
  // gradient
  gradient_stops?: Array<[number, string]>;
  gradient_direction?: 'vertical' | 'horizontal';
  // text
  text?: string;
  font_family?: string;
  font_size?: number;
  font_size_min?: number;
  font_weight?: number;
  line_height?: number;
  text_align?: TextAlign;
  vertical_align?: VerticalAlign;
  text_transform?: 'none' | 'uppercase';
  /** colour the text sits on (used for contrast checks) */
  contrast_bg?: string;
  /** min contrast ratio required for this text */
  min_contrast?: number;
  // text output of layout engine
  lines?: string[];
  fitted_font_size?: number;
  text_offset_y?: number;
  overflow?: boolean;
  // image
  asset_id?: string | null;
  image_query?: string;
  image_fit?: ImageFit;
  image_focal_x?: number;
  image_focal_y?: number;
  image_zoom?: number;
}

export type LayerOverride = Partial<Omit<Layer, 'id' | 'type' | 'role' | 'lines' | 'fitted_font_size' | 'overflow' | 'text_offset_y'>>;
export type LayerOverrides = Record<string, LayerOverride>;

export interface SceneWarning {
  severity: 'info' | 'warning' | 'error';
  code: 'overflow' | 'contrast' | 'contrast_fixed' | 'bounds' | 'missing_image' | 'variant' | 'price' | 'low_resolution';
  layer_id?: string;
  message: string;
}

export interface PostSceneIR {
  width: number;
  height: number;
  background: { fill: string };
  image_layers: Layer[];
  shape_layers: Layer[];
  text_layers: Layer[];
  decorations: Layer[];
  metadata: {
    engine_version: string;
    campaign_id: string;
    post_id: string;
    slide_id: string;
    slide_index: number;
    slide_count: number;
    template: string;
    variant: string;
    asset_ids: string[];
    warnings: SceneWarning[];
    hash: string;
  };
}

export interface Asset {
  asset_id: string;
  provider: string;
  provider_id?: string;
  collection?: string;
  source_url: string | null;
  download_url?: string;
  photographer: string;
  photographer_url?: string | null;
  license: string;
  license_url?: string | null;
  attribution?: string;
  title?: string;
  local_path: string;
  width: number;
  height: number;
  tags: string[];
  query?: string;
  sha256?: string;
  stock_photo?: boolean;
  /** uploads only: kept in IndexedDB */
  blob?: Blob;
}

export interface Palette {
  primary: string;
  background: string;
  text: string;
  accent: string;
  onPrimary: string;
  onAccent: string;
  surface: string;
  muted: string;
  dark: string;
  light: string;
}

export interface TextMeasurer {
  (text: string, fontFamily: string, fontWeight: number, fontSize: number): number;
}

export interface TemplateContext {
  brand: BrandSpec;
  campaign: CampaignInfo;
  post: PostSpec;
  slide: SlideSpec;
  slideIndex: number;
  slideCount: number;
  products: ProductSpec[];
  asset: Asset | null;
  palette: Palette;
  variant: string;
}

export interface TemplateVariant {
  id: string;
  label: string;
}

export interface TemplateDefinition {
  id: string;
  label: string;
  description: string;
  variants: TemplateVariant[];
  defaultVariant: string;
  build(ctx: TemplateContext): Layer[];
}
