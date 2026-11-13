import type {
  PublicStoreIR,
  PublicationValidation,
  SiteIR
} from './types';
import { slugify, DUMMY_PHONE } from './migrate';

export type PublicAssetFile = {
  path: string;
  data: string | Uint8Array; // base64 string or binary bytes
  isBase64: boolean;
};

export type PublicCompilationResult = {
  publicIR: PublicStoreIR;
  publicJsonString: string;
  publicJsonBytes: number;
  filesToZip: PublicAssetFile[];
  validation: PublicationValidation;
};

export const isDummyPhone = (phone?: string): boolean => {
  if (!phone) return true;
  const clean = phone.replace(/\D/g, '');
  if (clean === DUMMY_PHONE || clean === '0'.repeat(13) || clean.length < 10) return true;
  if (/^(\d)\1+$/.test(clean)) return true; // ex: 0000000000, 1111111111
  return false;
};

/**
 * Compila o SiteIR na projeção pública estrita PublicStoreIR.
 * Executa validação de publicação por lista positiva, extraindo imagens de base64
 * para arquivos em assets/ e mantendo o JSON leve (<100KB).
 */
export function compilePublicStore(
  site: SiteIR,
  assetOverrides: Record<string, { url?: string; approved?: boolean; alt?: string }> = {}
): PublicCompilationResult {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const filesToZip: PublicAssetFile[] = [];

  const rawPhone = site.whatsapp?.phoneE164 || '';
  const dummyPhone = isDummyPhone(rawPhone);

  if (dummyPhone) {
    blockedReasons.push(
      `Número de WhatsApp fictício ou de demonstração (${rawPhone || 'vazio'}). A publicação comercial exige um número E.164 válido do negócio.`
    );
  }

  const missingAssets: string[] = [];
  const publicAssets: PublicStoreIR['assets'] = [];

  for (const asset of site.assets) {
    const override = assetOverrides[asset.assetId];
    const isApproved = override?.approved ?? asset.approved ?? (asset.status === 'ready');
    const effectiveUrl = override?.url || asset.url || '';
    const alt = override?.alt || asset.alt || asset.assetId;

    let relativePath = asset.path || '';

    // Se a imagem for data:image base64, extrair para arquivo
    if (effectiveUrl.startsWith('data:image/')) {
      const match = effectiveUrl.match(/^data:image\/(png|jpeg|jpg|webp|avif|svg\+xml);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1].replace('+xml', '');
        relativePath = `assets/${slugify(asset.assetId)}.${ext}`;
        filesToZip.push({
          path: relativePath,
          data: match[2],
          isBase64: true
        });
      } else {
        warnings.push(`Asset ${asset.assetId}: formato data URL não reconhecido.`);
      }
    } else if (effectiveUrl.startsWith('assets/')) {
      relativePath = effectiveUrl;
    } else if (effectiveUrl.startsWith('http://') || effectiveUrl.startsWith('https://')) {
      relativePath = effectiveUrl;
    } else if (effectiveUrl) {
      relativePath = `assets/${slugify(asset.assetId)}.png`;
    }

    if (!isApproved && asset.role !== 'decorative') {
      missingAssets.push(asset.assetId);
    }

    // Projeção por lista positiva do asset
    publicAssets.push({
      assetId: asset.assetId,
      role: asset.role || 'product_cutout',
      url: relativePath || `assets/${slugify(asset.assetId)}.png`,
      width: asset.width,
      height: asset.height,
      alt,
      ratio: asset.ratio,
      focalPoint: asset.focalPoint,
      safeArea: asset.safeArea,
      mobileAssetRef: asset.mobileAssetRef
    });
  }

  if (missingAssets.length > 0) {
    warnings.push(`${missingAssets.length} assets pendentes de aprovação: ${missingAssets.slice(0, 5).join(', ')}${missingAssets.length > 5 ? '...' : ''}.`);
  }

  const canPublish = blockedReasons.length === 0;
  const isBlocked = !canPublish;
  const target = canPublish ? 'public' : 'preview';

  // Projeção do catálogo (apenas campos públicos)
  const publicProducts: PublicStoreIR['catalog']['products'] = site.products.map(p => ({
    sku: p.sku,
    slug: p.slug || slugify(p.name),
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    priceCents: p.priceCents,
    stock: p.stock,
    media: (p.media || []).map(m => {
      const a = publicAssets.find(x => x.assetId === m.assetId);
      return a ? a.url : `assets/${slugify(m.assetId)}.png`;
    }),
    variants: p.variants?.map(v => ({
      optionId: v.optionId,
      label: v.label,
      sku: v.sku,
      priceCents: v.priceCents,
      stock: v.stock
    })),
    attributes: p.attributes,
    genes: p.genes
  }));

  const publicIR: PublicStoreIR = {
    schemaVersion: '2.0.0',
    business: {
      name: site.business.name,
      description: site.business.description,
      tagline: site.business.tagline,
      segment: site.business.segment,
      address: site.business.address,
      features: site.business.features
    },
    theme: {
      primary: site.theme.primary,
      accent: site.theme.accent,
      background: site.theme.background,
      text: site.theme.text,
      radius: site.theme.radius,
      fontFamily: site.theme.fontFamily,
      tokens: site.theme.tokens
    },
    catalog: {
      categories: site.categories.map(c => ({
        id: c.id,
        name: c.name,
        assetId: c.assetId
      })),
      products: publicProducts
    },
    assets: publicAssets,
    screens: site.screens,
    overlays: site.overlays,
    messages: {
      templates: site.messages.templates.map(t => ({
        id: t.id,
        text: t.text
      }))
    },
    whatsapp: {
      phoneE164: canPublish ? site.whatsapp.phoneE164 : (dummyPhone ? '' : site.whatsapp.phoneE164),
      checkoutTemplateId: site.whatsapp.checkoutTemplateId || 'cart-checkout',
      defaultTemplateId: site.whatsapp.defaultTemplateId,
      quoteTemplateId: site.whatsapp.quoteTemplateId,
      supportTemplateId: site.whatsapp.supportTemplateId
    },
    rules: site.rules
  };

  const publicJsonString = JSON.stringify(publicIR, null, 2);
  const publicJsonBytes = new TextEncoder().encode(publicJsonString).length;

  const validation: PublicationValidation = {
    canPublish,
    isBlocked,
    target,
    blockedReasons,
    warnings,
    publicJsonBytes,
    assetsCount: publicAssets.length,
    hasDummyPhone: dummyPhone,
    missingMandatoryAssets: missingAssets
  };

  return {
    publicIR,
    publicJsonString,
    publicJsonBytes,
    filesToZip,
    validation
  };
}
