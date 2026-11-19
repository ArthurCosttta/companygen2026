/**
 * Zero-credit Canvas 2D renderer for Catalog Feed (1080x1080) and Story (1080x1920) assets.
 */

import { formatCurrencyBRL, type CatalogProduct } from '@/schemas/profile.schema';

export type SocialPostFormat = '1080x1080' | '1080x1920';

export interface RenderCatalogSocialPostOptions {
  product: CatalogProduct;
  storeName: string;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  pixDiscountPercent?: number;
  format: SocialPostFormat;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = String(hex || '').replace('#', '').trim();
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  }
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return [
      Number.parseInt(clean[0] + clean[0], 16),
      Number.parseInt(clean[1] + clean[1], 16),
      Number.parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [8, 103, 232];
}

function getRelativeLuminance([r, g, b]: [number, number, number]): number {
  const norm = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
}

function contrastOnBg(hexBg: string): { fg: string; muted: string } {
  const lum = getRelativeLuminance(parseHexRgb(hexBg));
  if (lum > 0.42) {
    return { fg: '#0B1D52', muted: '#334155' };
  }
  return { fg: '#FFFFFF', muted: '#E2E8F0' };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Produto em Destaque'];

  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      } else {
        lines.push(word);
      }
      current = word;
      if (lines.length === maxLines - 1) {
        const remaining = [current, ...words.slice(i + 1)].join(' ');
        let clipped = remaining;
        while (clipped.length > 3 && ctx.measureText(`${clipped}...`).width > maxWidth) {
          clipped = clipped.slice(0, -1).trimEnd();
        }
        lines.push(clipped !== remaining ? `${clipped}...` : remaining);
        return lines.slice(0, maxLines);
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function tryLoadCorsSafeImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    const timer = window.setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawCoverWithFocalPoint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  focalXPercent = 50,
  focalYPercent = 50,
) {
  const iw = img.naturalWidth || img.width || 1;
  const ih = img.naturalHeight || img.height || 1;
  const imgRatio = iw / ih;
  const boxRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (imgRatio > boxRatio) {
    sw = ih * boxRatio;
    const fx = Math.min(100, Math.max(0, focalXPercent)) / 100;
    sx = Math.max(0, Math.min(iw - sw, (iw - sw) * fx));
  } else if (imgRatio < boxRatio) {
    sh = iw / boxRatio;
    const fy = Math.min(100, Math.max(0, focalYPercent)) / 100;
    sy = Math.max(0, Math.min(ih - sh, (ih - sh) * fy));
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export async function renderCatalogSocialPostDataUrl({
  product,
  storeName,
  primaryColor = '#0867E8',
  accentColor = '#24A677',
  logoUrl = '/brand/simbolo-colorido.webp',
  pixDiscountPercent = 0,
  format,
}: RenderCatalogSocialPostOptions): Promise<string> {
  const width = 1080;
  const height = format === '1080x1920' ? 1920 : 1080;
  const isStory = format === '1080x1920';

  const safePrimary = /^#[0-9a-f]{3,8}$/i.test(primaryColor) ? primaryColor : '#0867E8';
  const safeAccent = /^#[0-9a-f]{3,8}$/i.test(accentColor) ? accentColor : '#24A677';
  const primaryContrast = contrastOnBg(safePrimary);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#F7FAFF');
  grad.addColorStop(1, '#EDF4FF');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Decorative brand header accent
  ctx.fillStyle = safePrimary;
  ctx.fillRect(0, 0, width, isStory ? 280 : 180);

  const safeMarginTop = isStory ? 120 : 44;
  const safeMarginBottom = isStory ? 120 : 48;
  const sidePad = 72;
  const contentW = width - sidePad * 2;

  // Store logo + name inside safe header
  const logoImg =
    (await tryLoadCorsSafeImage(logoUrl || '/brand/simbolo-colorido.webp')) ||
    (await tryLoadCorsSafeImage('/brand/simbolo-colorido.webp'));

  const logoSize = isStory ? 76 : 64;
  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, sidePad, safeMarginTop, logoSize, logoSize, 18);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sidePad, safeMarginTop, logoSize, logoSize);
    drawCoverWithFocalPoint(ctx, logoImg, sidePad, safeMarginTop, logoSize, logoSize, 50, 50);
    ctx.restore();
  } else {
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, sidePad, safeMarginTop, logoSize, logoSize, 18);
    ctx.fill();
    ctx.fillStyle = safePrimary;
    ctx.font = '800 32px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (storeName || 'CG').slice(0, 2).toUpperCase(),
      sidePad + 14,
      safeMarginTop + logoSize / 2,
    );
  }

  ctx.fillStyle = primaryContrast.fg;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${isStory ? 34 : 30}px Inter, system-ui, sans-serif`;
  ctx.fillText(
    (storeName || 'Minha Loja').slice(0, 28),
    sidePad + logoSize + 20,
    safeMarginTop + logoSize / 2,
  );

  // Main white product card
  const cardTop = isStory ? 250 : 156;
  const cardHeight = height - cardTop - safeMarginBottom - (isStory ? 96 : 20);
  ctx.save();
  ctx.shadowColor = 'rgba(11, 29, 82, 0.10)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, sidePad, cardTop, contentW, cardHeight, 36);
  ctx.fill();
  ctx.restore();

  // Product square image area
  const imgPad = 40;
  const imgSize = isStory ? contentW - imgPad * 2 : 520;
  const imgX = sidePad + (contentW - imgSize) / 2;
  const imgY = cardTop + imgPad;

  const prodImg = await tryLoadCorsSafeImage(product.imageUrl || '');
  ctx.save();
  drawRoundedRect(ctx, imgX, imgY, imgSize, imgSize, 28);
  ctx.clip();
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(imgX, imgY, imgSize, imgSize);
  if (prodImg) {
    drawCoverWithFocalPoint(
      ctx,
      prodImg,
      imgX,
      imgY,
      imgSize,
      imgSize,
      product.imageFocalPoint?.x ?? 50,
      product.imageFocalPoint?.y ?? 50,
    );
  } else {
    ctx.fillStyle = safePrimary;
    ctx.font = '800 112px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (product.name || 'PR').slice(0, 2).toUpperCase();
    ctx.fillText(initials, imgX + imgSize / 2, imgY + imgSize / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Text & pricing region below image
  const infoY = imgY + imgSize + (isStory ? 46 : 32);
  ctx.fillStyle = '#475569';
  ctx.textBaseline = 'top';
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  const catLabel = [product.category || 'Catálogo', product.variation && product.variation !== 'Padrão' ? product.variation : '']
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  ctx.fillText(catLabel.slice(0, 44), sidePad + imgPad, infoY);

  ctx.fillStyle = '#0B1D52';
  ctx.font = `800 ${isStory ? 44 : 38}px Inter, system-ui, sans-serif`;
  const titleLines = wrapTextLines(ctx, product.name, contentW - imgPad * 2, 2);
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, sidePad + imgPad, infoY + 40 + idx * (isStory ? 54 : 46));
  });

  // Bottom price & Pix badge inside card
  const safePriceY = cardTop + cardHeight - 132;
  const pixPct = Math.max(0, Math.min(90, Number(pixDiscountPercent || 0)));
  const pixPriceCents =
    pixPct > 0 ? Math.round((product.priceCents * (100 - pixPct)) / 100) : product.priceCents;

  ctx.fillStyle = safePrimary;
  ctx.font = `800 ${isStory ? 56 : 48}px Inter, system-ui, sans-serif`;
  ctx.fillText(formatCurrencyBRL(pixPct > 0 ? pixPriceCents : product.priceCents), sidePad + imgPad, safePriceY);

  if (pixPct > 0) {
    ctx.fillStyle = safeAccent;
    const pillW = 280;
    const pillX = sidePad + contentW - imgPad - pillW;
    drawRoundedRect(ctx, pillX, safePriceY + 4, pillW, 54, 999);
    ctx.fill();
    const pillContrast = contrastOnBg(safeAccent);
    ctx.fillStyle = pillContrast.fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillText(`${pixPct}% OFF no Pix`, pillX + pillW / 2, safePriceY + 31);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  // Story footer CTA safely inside bottom 120px margin
  if (isStory) {
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 28px Inter, system-ui, sans-serif';
    ctx.fillText('Peça direto pela nossa Vitrine & WhatsApp', width / 2, height - safeMarginBottom - 26);
    ctx.textAlign = 'left';
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
