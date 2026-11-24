import {
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';

export interface PublishBlocker {
  id: 'whatsapp' | 'empty_catalog' | 'invalid_price' | 'missing_photo';
  title: string;
  description: string;
  actionLabel: string;
  productIds?: string[];
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function utf8ToBase64(input: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
  return '';
}

const placeholderDataUriCache = new Map<string, string>();

/**
 * Generates a valid, self-contained SVG data-URI placeholder for products
 * without custom photos so publishing never triggers HTTP 422.
 */
export function buildProductPlaceholderDataUri(
  productName: string,
  category = 'Loja',
  primaryColor = '#2563EB',
): string {
  const cleanName = String(productName || 'Produto').trim() || 'Produto';
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#2563EB';
  const cleanCategory = String(category || 'Catálogo').trim().slice(0, 22);
  const cacheKey = `${cleanName}\0${cleanCategory}\0${safeColor}`;
  const cached = placeholderDataUriCache.get(cacheKey);
  if (cached) return cached;

  const words = cleanName.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();

  const safeCategory = escapeXml(cleanCategory);
  const safeInitials = escapeXml(initials || 'PR');

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">',
    '<defs>',
    '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#F8FAFC"/>',
    '<stop offset="100%" stop-color="#EFF6FF"/>',
    '</linearGradient>',
    '</defs>',
    '<rect width="600" height="600" fill="url(#bg)"/>',
    `<circle cx="300" cy="255" r="108" fill="${safeColor}" fill-opacity="0.12"/>`,
    `<circle cx="300" cy="255" r="78" fill="${safeColor}" fill-opacity="0.18"/>`,
    `<text x="300" y="275" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="64" font-weight="700" fill="${safeColor}">${safeInitials}</text>`,
    `<rect x="190" y="395" width="220" height="36" rx="18" fill="${safeColor}" fill-opacity="0.10"/>`,
    `<text x="300" y="419" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="16" font-weight="600" fill="#0F172A">${safeCategory}</text>`,
    '</svg>',
  ].join('');

  const encoded = utf8ToBase64(svg);
  const result = encoded
    ? `data:image/svg+xml;base64,${encoded}`
    : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  if (placeholderDataUriCache.size >= 500) {
    placeholderDataUriCache.clear();
  }
  placeholderDataUriCache.set(cacheKey, result);
  return result;
}

export function resolveProductImageUrl(
  imageUrl?: string,
  name?: string,
  category?: string,
  primaryColor?: string,
): string {
  const trimmed = String(imageUrl || '').trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/api/') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return buildProductPlaceholderDataUri(name || 'Produto', category || 'Loja', primaryColor);
}

/**
 * Parses Brazilian/international currency text (e.g. "29,90", "R$ 1.299,50") into integer cents.
 * Strictly rejects negative values, scientific notation, multiple decimal separators, or non-numeric garbage.
 */
export function parseBRLInputToCents(raw: string): number {
  const text = String(raw || '').trim();
  if (!text) return 0;
  const cleaned = text.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!cleaned || /^[-+]|e/i.test(cleaned) || /[^0-9.,]/.test(cleaned)) {
    return 0;
  }

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    const commaParts = cleaned.split(',');
    if (commaParts.length !== 2) return 0;
    const [intRaw, decRaw] = commaParts;
    if (!intRaw || decRaw.length === 0 || decRaw.length > 2 || /[^0-9.]/.test(intRaw) || /\D/.test(decRaw)) {
      return 0;
    }
    if (intRaw.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(intRaw)) {
      return 0;
    }
    normalized = `${intRaw.replace(/\./g, '')}.${decRaw}`;
  } else if (cleaned.includes('.')) {
    const dotParts = cleaned.split('.');
    if (dotParts.length === 2 && dotParts[1].length <= 2 && dotParts[0].length >= 1) {
      normalized = cleaned;
    } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    } else {
      return 0;
    }
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function formatCentsForInput(cents: number): string {
  const safe = Number.isFinite(cents) && cents > 0 ? cents : 0;
  return (safe / 100).toFixed(2).replace('.', ',');
}

/**
 * Evaluates publish preconditions without blocking on WhatsApp bot pairing (INV-03).
 */
export function getPublishBlockers(profile: BusinessProfile): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  if (!isValidProductionPhone(profile.whatsapp?.phoneE164 || '')) {
    blockers.push({
      id: 'whatsapp',
      title: 'WhatsApp da loja pendente',
      description: 'Informe um número de WhatsApp válido (com DDD) para receber os pedidos dos clientes.',
      actionLabel: 'Configurar WhatsApp',
    });
  }

  const activeProducts = (profile.catalog?.products ?? []).filter((p) => p.active !== false);
  if (activeProducts.length === 0) {
    blockers.push({
      id: 'empty_catalog',
      title: 'Catálogo sem produtos ativos',
      description: 'Cadastre ou ative pelo menos 1 produto antes de colocar sua loja no ar.',
      actionLabel: 'Cadastrar Produto',
    });
    return blockers;
  }

  const zeroPriceProducts = activeProducts.filter((p) => !Number.isFinite(p.priceCents) || p.priceCents <= 0);
  if (zeroPriceProducts.length > 0) {
    blockers.push({
      id: 'invalid_price',
      title: `${zeroPriceProducts.length} ${zeroPriceProducts.length === 1 ? 'produto com preço zerado' : 'produtos com preço zerado'}`,
      description: `Defina um preço maior que zero para: ${zeroPriceProducts.map((p) => p.name).slice(0, 3).join(', ')}.`,
      actionLabel: 'Ajustar Preço',
      productIds: zeroPriceProducts.map((p) => p.id),
    });
  }

  const missingPhotoProducts = activeProducts.filter((p) => !p.approvedAsset);
  if (missingPhotoProducts.length > 0) {
    blockers.push({
      id: 'missing_photo',
      title: `${missingPhotoProducts.length} ${missingPhotoProducts.length === 1 ? 'item sem revisão de catálogo' : 'itens sem revisão de catálogo'}`,
      description: `Revise os itens ou busque fotos grátis da internet (0 cr) para: ${missingPhotoProducts.map((p) => p.name).slice(0, 3).join(', ')}.`,
      actionLabel: 'Aprovar Capa Neutra',
      productIds: missingPhotoProducts.map((p) => p.id),
    });
  }

  return blockers;
}

export function resolveBrandedAppOrigin(): string {
  const envOrigin = String(import.meta.env.VITE_PUBLIC_ORIGIN || '')
    .trim()
    .replace(/\/+$/, '');
  if (envOrigin) return envOrigin;

  if (typeof window !== 'undefined' && window.location?.origin) {
    const hostname = String(window.location.hostname || '').toLowerCase();
    if (hostname.endsWith('.run.app')) {
      return 'https://companygen-app.web.app';
    }
    return window.location.origin;
  }

  return '';
}

export function buildStorePublicUrl(profile: BusinessProfile, ownerId?: string): string {
  const slug =
    profile.publishedStore?.publicSlug ||
    (profile.business?.name || 'minha-loja')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') ||
    'minha-loja';

  const param = ownerId ? encodeURIComponent(ownerId) : encodeURIComponent(slug);
  const origin = resolveBrandedAppOrigin();
  if (origin) {
    return `${origin}/?view=store&u=${param}`;
  }
  return `/?view=store&u=${param}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    }
  } catch {
    return false;
  }
  return false;
}

export function generateInternalProductCodes(name: string): { id: string; sku: string } {
  const base = String(name || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18) || 'item';

  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 6).toUpperCase()
      : Math.random().toString(36).slice(2, 8).toUpperCase();

  return {
    id: `${base}-${rand.toLowerCase()}`,
    sku: `ITEM-${rand}`,
  };
}

export function buildWhatsappDirectUrl(phoneE164: string, message: string): string {
  const digits = sanitizePhoneE164(phoneE164);
  if (!digits) return '';
  const base = `https://wa.me/${digits}?text=`;
  let safeMsg = String(message || '').trim();
  let encoded = encodeURIComponent(safeMsg);
  if (base.length + encoded.length > 1950) {
    const suffix = '\n...(resumo completo copiado)';
    while (safeMsg.length > 80 && base.length + encodeURIComponent(safeMsg + suffix).length > 1950) {
      safeMsg = safeMsg.slice(0, Math.floor(safeMsg.length * 0.8));
    }
    encoded = encodeURIComponent(`${safeMsg.trim()}${suffix}`);
  }
  return `${base}${encoded}`;
}

const MAX_RAW_UPLOAD_BYTES = 15 * 1024 * 1024;
const TARGET_MAX_DIMENSION = 1400;

function isLikelyImageFile(file: File): boolean {
  const t = String(file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  const name = String(file.name || '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|jfif|bmp|avif|heic|heif)$/i.test(name);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) reject(new Error('Falha ao ler arquivo de imagem.'));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.readAsDataURL(blob);
  });
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!file || file.size <= 0) {
    throw new Error('Arquivo de imagem vazio ou inválido.');
  }
  if (file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new Error('A imagem deve ter no máximo 15 MB.');
  }
  const lowerType = String(file.type || '').toLowerCase();
  const lowerName = String(file.name || '').toLowerCase();
  if (lowerType.includes('svg') || /\.svg$/i.test(lowerName)) {
    throw new Error('SVG não é aceito neste campo. Envie JPG, PNG ou WebP.');
  }
  if (!isLikelyImageFile(file)) {
    throw new Error('Escolha uma imagem JPG, PNG, WebP ou GIF válida.');
  }
  if (lowerType === 'image/gif' && file.size <= 1.5 * 1024 * 1024) {
    return readBlobAsDataUrl(file);
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return readBlobAsDataUrl(file);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível decodificar esta imagem. Use JPG, PNG ou WebP.'));
      el.src = objectUrl;
    });
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w <= 0 || h <= 0) {
      throw new Error('Imagem sem dimensões válidas.');
    }
    const maxSide = Math.max(w, h);
    const scale = maxSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxSide : 1;
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return readBlobAsDataUrl(file);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let dataUrl = canvas.toDataURL('image/webp', 0.85);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL(lowerType === 'image/png' ? 'image/png' : 'image/jpeg', 0.86);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadStorefrontMediaDataUrl(options: {
  ownerId?: string;
  dataUrl: string;
  slotId?: string;
  sectionId?: string;
}): Promise<string> {
  const cleanDataUrl = String(options.dataUrl || '').trim();
  if (!cleanDataUrl.startsWith('data:image/')) {
    return cleanDataUrl;
  }
  try {
    const res = await authenticatedFetch(
      '/api/store-molde/media/upload',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: options.slotId || `media_${Date.now()}`,
          sectionId: options.sectionId || '',
          dataUrl: cleanDataUrl,
        }),
      },
      options.ownerId,
    );
    if (!res.ok) return cleanDataUrl;
    const json = (await res.json().catch(() => null)) as { assetUrl?: string } | null;
    if (json?.assetUrl && typeof json.assetUrl === 'string') {
      return json.assetUrl;
    }
    return cleanDataUrl;
  } catch {
    return cleanDataUrl;
  }
}

export function safeHref(raw: unknown, fallback = '#'): string {
  const value = String(raw ?? '').trim();
  if (!value) return fallback;
  if (
    value.startsWith('#') ||
    (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\'))
  ) {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    ) {
      return value;
    }
  } catch {
    // Reject non-allowlisted or malformed URIs
  }
  return fallback;
}

export function sanitizeProductForCustomerDisplay(product: CatalogProduct): {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  variation: string;
  stock: number;
  active: boolean;
  imageUrl: string;
} {
  return {
    id: product.id,
    name: product.name,
    category: product.category || 'Geral',
    description: product.description || '',
    priceCents: product.priceCents,
    variation: product.variation || 'Padrão',
    stock: product.stock,
    active: product.active !== false,
    imageUrl: product.imageUrl || '',
  };
}
