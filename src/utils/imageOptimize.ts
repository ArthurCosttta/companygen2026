/**
 * Client-side magic-byte inspection, low-resolution detection (< 500px), and WebP canvas compression.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  lowResolution: boolean;
  mimeType: string;
}

const INVALID_IMAGE_MSG =
  'Formato de imagem inválido ou não permitido. Envie um arquivo JPG, PNG ou WebP real.';

export function detectBrowserImageMagicMime(bytes: Uint8Array): string {
  if (!bytes || bytes.length < 4) return '';

  let headText = '';
  try {
    headText = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.subarray(0, 128))
      .replace(/^\uFEFF/, '')
      .trimStart()
      .toLowerCase();
  } catch {
    headText = '';
  }

  if (
    headText.startsWith('<svg') ||
    headText.startsWith('<?xml') ||
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.includes('<script') ||
    headText.includes('<svg')
  ) {
    return '';
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // GIF
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  return '';
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(INVALID_IMAGE_MSG));
    img.src = src;
  });
}

export async function validateAndOptimizeImageFile(
  file: File,
  options: {
    maxDimension?: number;
    quality?: number;
    minRecommendedPx?: number;
    maxFileSizeBytes?: number;
  } = {},
): Promise<OptimizedImageResult> {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 15 * 1024 * 1024;
  if (!file || file.size <= 0) {
    throw new Error(INVALID_IMAGE_MSG);
  }
  if (file.size > maxFileSizeBytes) {
    throw new Error('A imagem deve ter no máximo 15 MB.');
  }

  const headerSlice = await file.slice(0, 128).arrayBuffer();
  const magicMime = detectBrowserImageMagicMime(new Uint8Array(headerSlice));
  if (!magicMime) {
    throw new Error(INVALID_IMAGE_MSG);
  }

  const maxDimension = Math.max(128, options.maxDimension ?? 1200);
  const quality = Math.min(0.95, Math.max(0.5, options.quality ?? 0.82));
  const minRecommendedPx = options.minRecommendedPx ?? 500;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const originalWidth = img.naturalWidth || img.width || 0;
    const originalHeight = img.naturalHeight || img.height || 0;
    if (originalWidth <= 0 || originalHeight <= 0) {
      throw new Error(INVALID_IMAGE_MSG);
    }

    const lowResolution = originalWidth < minRecommendedPx || originalHeight < minRecommendedPx;
    const largest = Math.max(originalWidth, originalHeight);
    const scale = largest > maxDimension ? maxDimension / largest : 1;
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Não foi possível processar a imagem no navegador.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/webp', quality);
    let outputMime = 'image/webp';
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/png');
      outputMime = 'image/png';
    }

    return {
      dataUrl,
      width,
      height,
      originalWidth,
      originalHeight,
      lowResolution,
      mimeType: outputMime,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
