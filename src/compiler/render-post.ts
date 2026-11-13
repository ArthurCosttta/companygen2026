import { CANVAS_W, CANVAS_H, SAFE_MARGIN, type PostSceneIR, type Layer, type Asset } from './types';
import { orderedLayers } from './build-post-ir';

// Image cache in memory to prevent refetching during renders
const imageElementCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();

export function loadImageSafe(src: string): Promise<HTMLImageElement> {
  const cached = imageElementCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }

  const pending = pendingLoads.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageElementCache.set(src, img);
      pendingLoads.delete(src);
      resolve(img);
    };
    img.onerror = (e) => {
      pendingLoads.delete(src);
      reject(e);
    };
    img.src = src;
  });

  pendingLoads.set(src, promise);
  return promise;
}

export interface RenderOptions {
  showSafeMarginGuide?: boolean;
  selectedLayerId?: string | null;
  interactive?: boolean;
  scale?: number;
}

/**
 * Pure 2D Canvas renderer for PostSceneIR.
 * Works uniformly for live preview, thumbnail generation, and 1080x1350 PNG export!
 */
export async function renderSceneToCanvas(
  scene: PostSceneIR,
  canvas: HTMLCanvasElement,
  assetMap: Map<string, Asset>,
  options: RenderOptions = {}
): Promise<void> {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

  // Background
  ctx.fillStyle = scene.background.fill || '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const layers = orderedLayers(scene);

  for (const layer of layers) {
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;

    // Transform (rotation around layer center if applicable)
    if (layer.rotation && layer.rotation !== 0) {
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (layer.type === 'rect') {
      drawRect(ctx, layer);
    } else if (layer.type === 'ellipse') {
      drawEllipse(ctx, layer);
    } else if (layer.type === 'gradient') {
      drawGradient(ctx, layer);
    } else if (layer.type === 'image') {
      await drawImageLayer(ctx, layer, assetMap);
    } else if (layer.type === 'text') {
      drawText(ctx, layer);
    }

    // Highlight selected layer in editor
    if (options.selectedLayerId && options.selectedLayerId === layer.id) {
      ctx.strokeStyle = '#0867E8';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(layer.x - 2, layer.y - 2, layer.width + 4, layer.height + 4);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // Safe margin guide if requested
  if (options.showSafeMarginGuide) {
    ctx.save();
    ctx.strokeStyle = 'rgba(8, 103, 232, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(SAFE_MARGIN, SAFE_MARGIN, CANVAS_W - SAFE_MARGIN * 2, CANVAS_H - SAFE_MARGIN * 2);
    ctx.restore();
  }
}

function drawRect(ctx: CanvasRenderingContext2D, layer: Layer) {
  const r = layer.corner_radius || 0;
  if (r > 0) {
    drawRoundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, r);
    if (layer.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fill();
    }
    if (layer.stroke && layer.stroke_width) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.stroke_width;
      ctx.stroke();
    }
  } else {
    if (layer.fill) {
      ctx.fillStyle = layer.fill;
      ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
    }
    if (layer.stroke && layer.stroke_width) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.stroke_width;
      ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
    }
  }
}

function drawEllipse(ctx: CanvasRenderingContext2D, layer: Layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const rx = layer.width / 2;
  const ry = layer.height / 2;

  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (layer.fill) {
    ctx.fillStyle = layer.fill;
    ctx.fill();
  }
  if (layer.stroke && layer.stroke_width) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = layer.stroke_width;
    ctx.stroke();
  }
}

function drawGradient(ctx: CanvasRenderingContext2D, layer: Layer) {
  let grad: CanvasGradient;
  if (layer.gradient_direction === 'horizontal') {
    grad = ctx.createLinearGradient(layer.x, layer.y, layer.x + layer.width, layer.y);
  } else {
    grad = ctx.createLinearGradient(layer.x, layer.y, layer.x, layer.y + layer.height);
  }

  const stops = layer.gradient_stops || [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']];
  for (const [pos, col] of stops) {
    grad.addColorStop(Math.max(0, Math.min(1, pos)), col);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
}

async function drawImageLayer(ctx: CanvasRenderingContext2D, layer: Layer, assetMap: Map<string, Asset>) {
  const asset = layer.asset_id ? assetMap.get(layer.asset_id) : null;
  const r = layer.corner_radius || 0;

  ctx.save();
  if (r > 0) {
    drawRoundedRectPath(ctx, layer.x, layer.y, layer.width, layer.height, r);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(layer.x, layer.y, layer.width, layer.height);
    ctx.clip();
  }

  let imgElement: HTMLImageElement | null = null;
  if (asset) {
    const src = asset.local_path.startsWith('blob:') || asset.local_path.startsWith('data:')
      ? asset.local_path
      : `./${asset.local_path.replace(/^\.?\//, '')}`;
    try {
      imgElement = await loadImageSafe(src);
    } catch {
      // Fallback if image failed to load
    }
  }

  if (imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
    const nw = imgElement.naturalWidth;
    const nh = imgElement.naturalHeight;
    const fit = layer.image_fit || 'cover';
    const zoom = Math.max(1, layer.image_zoom || 1);
    const focalX = Math.max(0, Math.min(1, layer.image_focal_x ?? 0.5));
    const focalY = Math.max(0, Math.min(1, layer.image_focal_y ?? 0.5));

    if (fit === 'cover') {
      const targetRatio = layer.width / layer.height;
      const srcRatio = nw / nh;
      let sw: number;
      let sh: number;

      if (srcRatio > targetRatio) {
        // Source is wider than target: fit height, crop width
        sh = nh / zoom;
        sw = sh * targetRatio;
      } else {
        // Source is taller than target: fit width, crop height
        sw = nw / zoom;
        sh = sw / targetRatio;
      }

      const sx = Math.max(0, Math.min(nw - sw, focalX * (nw - sw)));
      const sy = Math.max(0, Math.min(nh - sh, focalY * (nh - sh)));

      ctx.drawImage(imgElement, sx, sy, sw, sh, layer.x, layer.y, layer.width, layer.height);
    } else {
      // contain: fit inside box without cropping or stretching
      const scale = Math.min(layer.width / nw, layer.height / nh) * zoom;
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = layer.x + (layer.width - dw) / 2;
      const dy = layer.y + (layer.height - dh) / 2;
      ctx.drawImage(imgElement, 0, 0, nw, nh, dx, dy, dw, dh);
    }
  } else {
    // Elegant Placeholder when image is missing or failed
    ctx.fillStyle = layer.fill || '#E6EFFB';
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);

    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 32px Inter, sans-serif';
    const query = layer.image_query || layer.asset_id || layer.name || 'Foto';
    ctx.fillText('📷 ' + query, layer.x + layer.width / 2, layer.y + layer.height / 2 - 20);
    ctx.font = '400 22px Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('(Placeholder — substitua no painel lateral)', layer.x + layer.width / 2, layer.y + layer.height / 2 + 25);
  }

  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, layer: Layer) {
  const lines = layer.lines || (layer.text ? [layer.text] : []);
  if (!lines.length) return;

  const fontSize = layer.fitted_font_size || layer.font_size || 40;
  const weight = layer.font_weight || 400;
  const family = layer.font_family || 'Inter';
  const lineHeight = layer.line_height || 1.2;
  const align = layer.text_align || 'left';
  const offsetY = layer.text_offset_y || 0;

  ctx.font = `normal normal ${weight} ${fontSize}px "${family}", sans-serif`;
  ctx.fillStyle = layer.fill || '#0B1D52';
  ctx.textBaseline = 'top';
  ctx.textAlign = align;

  let startX = layer.x + (layer.padding || 0);
  if (align === 'center') {
    startX = layer.x + layer.width / 2;
  } else if (align === 'right') {
    startX = layer.x + layer.width - (layer.padding || 0);
  }

  const startY = layer.y + (layer.padding || 0) + offsetY;
  const lineDistance = fontSize * lineHeight;

  lines.forEach((lineText, index) => {
    ctx.fillText(lineText, startX, startY + index * lineDistance);
  });
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Render a scene and export as exact 1080x1350 PNG Blob */
export async function exportSceneToBlob(scene: PostSceneIR, assetMap: Map<string, Asset>): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderSceneToCanvas(scene, canvas, assetMap, { showSafeMarginGuide: false });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao gerar Blob do canvas'));
    }, 'image/png');
  });
}
