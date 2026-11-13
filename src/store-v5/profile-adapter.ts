import type { BusinessProfile } from '@/schemas/profile.schema';
import { isValidProductionPhone, sanitizePhoneE164 } from '@/schemas/profile.schema';
import { compile } from './compiler/compile';
import { compilePublicStore, type PublicCompilationResult } from './compiler/public-compiler';
import { slugify } from './compiler/migrate';
import type {
  Asset,
  AssetPrompt,
  Category,
  Product,
  ProjectSpecV2,
  Section,
  Site,
  SiteIR,
} from './compiler/types';

export type CompiledStoreFromProfile = {
  sourceRevision: number;
  siteInput: Site;
  site?: SiteIR;
  specV2?: ProjectSpecV2;
  publicStore?: PublicCompilationResult;
  errors: string[];
};

const SEGMENT_DEFAULTS: Record<string, { tagline: string; heroScope: string; primary: string; accent: string }> = {
  'Eletrônicos': {
    tagline: 'Acessórios, áudio e assistência técnica especializada.',
    heroScope: 'tecnologia, smartphones e acessórios modernos em bancada clean',
    primary: '#0F172A',
    accent: '#0284C7',
  },
  'Moda': {
    tagline: 'Curadoria autoral com acabamento impecável para o seu estilo.',
    heroScope: 'editorial de moda minimalista em estúdio iluminado',
    primary: '#18181B',
    accent: '#E11D48',
  },
  'Beleza': {
    tagline: 'Cuidados e fórmulas selecionadas para sua rotina diária.',
    heroScope: 'bancada de cosméticos clean com iluminação natural',
    primary: '#064E3B',
    accent: '#10B981',
  },
  'Alimentação': {
    tagline: 'Receitas frescas e entrega rápida direto na sua mesa.',
    heroScope: 'mesa artesanal com apresentação gastronômica apetitosa',
    primary: '#7C2D12',
    accent: '#F59E0B',
  },
  'Pet': {
    tagline: 'Tudo para o cuidado, diversão e nutrição do seu pet.',
    heroScope: 'produtos e acessórios pet em estúdio acolhedor',
    primary: '#1E3A8A',
    accent: '#F97316',
  },
};

export function synthesizeStoreFromProfile(profile: BusinessProfile, sourceRevision = 0): CompiledStoreFromProfile {
  const businessName = (profile.business.name || 'Minha Loja').trim();
  const segment = (profile.business.segment || 'Geral').trim();
  const segDefaults = SEGMENT_DEFAULTS[segment] || {
    tagline: profile.business.description || 'Produtos selecionados com atendimento direto pelo WhatsApp.',
    heroScope: `vitrine comercial moderna de ${businessName}`,
    primary: '#111827',
    accent: '#10B981',
  };

  const primary = profile.brand.primaryColor || segDefaults.primary;
  const accent = profile.brand.accentColor || segDefaults.accent;
  const phoneDigits = sanitizePhoneE164(profile.whatsapp.phoneE164 || '') || '5511999999999';

  const activeProducts = profile.catalog.products.filter(p => p.active);
  const effectiveProducts = activeProducts.length > 0
    ? activeProducts
    : [
        {
          id: 'exemplo-1',
          sku: 'ITEM-01',
          name: `Produto destaque ${businessName}`,
          category: 'Destaques',
          description: 'Cadastre seus produtos na Ficha ou suba uma planilha .xlsx para exibir seu catálogo completo.',
          priceCents: 4990,
          variation: 'Padrão',
          stock: 10,
          active: true,
          imageUrl: '',
          approvedAsset: false,
          updatedAt: new Date().toISOString(),
        },
      ];

  const categoryNames = [...new Set(effectiveProducts.map(p => (p.category || 'Geral').trim() || 'Geral'))];
  const categories: Category[] = categoryNames.map(catName => {
    const slug = slugify(catName) || 'geral';
    return {
      id: `cat-${slug}`,
      name: catName,
      assetId: `asset-cat-${slug}`,
    };
  });

  const assets: Asset[] = [];
  const promptsAssets: AssetPrompt[] = [];

  const DEFAULT_NEGATIVE_PROMPT = 'texto cortado, marcas d agua, baixa resolucao, fundo poluido, objetos duplicados';

  // 1. Logo (brand.logoUrl or whatsapp.profilePhotoUrl)
  const logoUrl = profile.brand.logoUrl || profile.whatsapp.profilePhotoUrl || '';
  assets.push({
    assetId: 'asset-brand-logo',
    kind: 'brand.logo',
    ownerRef: 'header',
    ratio: '1:1',
    status: logoUrl ? 'ready' : 'needs_asset',
    ...(logoUrl ? { url: logoUrl } : {}),
    alt: `Logo ${businessName}`,
    approved: Boolean(logoUrl),
    width: 512,
    height: 512,
  });
  promptsAssets.push({
    assetId: 'asset-brand-logo',
    width: 512,
    height: 512,
    text: `Logotipo oficial em alta definicao da loja ${businessName} (${segment})`,
    negative: DEFAULT_NEGATIVE_PROMPT,
    generationScope: 'official_upload',
  });

  // 2. Hero Banner (reuses first approved product image if no hero specific banner)
  const firstProductImg = effectiveProducts.find(p => p.imageUrl)?.imageUrl || '';
  assets.push({
    assetId: 'asset-hero-main',
    kind: 'hero.banner',
    ownerRef: 'hero',
    ratio: '16:9',
    status: firstProductImg ? 'ready' : 'needs_asset',
    ...(firstProductImg ? { url: firstProductImg } : {}),
    alt: `Vitrine ${businessName}`,
    approved: Boolean(firstProductImg),
    width: 1280,
    height: 720,
  });
  promptsAssets.push({
    assetId: 'asset-hero-main',
    width: 1280,
    height: 720,
    text: `Banner editorial principal da vitrine ${businessName}: ${segDefaults.heroScope}`,
    negative: DEFAULT_NEGATIVE_PROMPT,
    generationScope: 'full_scene',
  });

  // 3. Category tiles
  for (const cat of categories) {
    const sampleImg = effectiveProducts.find(p => `cat-${slugify(p.category || 'Geral') || 'geral'}` === cat.id && p.imageUrl)?.imageUrl || '';
    assets.push({
      assetId: cat.assetId!,
      kind: 'category.tile',
      ownerRef: cat.id,
      ratio: '1:1',
      status: sampleImg ? 'ready' : 'needs_asset',
      ...(sampleImg ? { url: sampleImg } : {}),
      alt: cat.name,
      approved: Boolean(sampleImg),
      width: 400,
      height: 400,
    });
    promptsAssets.push({
      assetId: cat.assetId!,
      width: 400,
      height: 400,
      text: `Icone fotografico comercial da categoria ${cat.name} na loja ${businessName}`,
      negative: DEFAULT_NEGATIVE_PROMPT,
      generationScope: 'cutout',
    });
  }

  // 4. Products + Assets
  const products: Product[] = effectiveProducts.map((p, index) => {
    const skuClean = (p.sku || `SKU-${index + 1}`).toUpperCase();
    const assetId = `asset-prod-${slugify(skuClean) || index}`;
    const catId = `cat-${slugify(p.category || 'Geral') || 'geral'}`;
    assets.push({
      assetId,
      kind: 'product.cutout',
      ownerRef: skuClean,
      ratio: '1:1',
      status: p.imageUrl ? 'ready' : 'needs_asset',
      ...(p.imageUrl ? { url: p.imageUrl } : {}),
      alt: p.name,
      approved: Boolean(p.imageUrl && (p.approvedAsset ?? true)),
      width: 800,
      height: 800,
    });
    promptsAssets.push({
      assetId,
      width: 800,
      height: 800,
      text: `Foto comercial limpa em estudio do produto ${p.name} (${p.variation || 'Padrao'})`,
      negative: DEFAULT_NEGATIVE_PROMPT,
      generationScope: 'cutout',
    });
    return {
      sku: skuClean,
      name: p.name,
      description: p.description || `${p.name} · ${p.variation || 'Padrão'}`,
      categoryId: catId,
      priceCents: Math.max(0, Math.round(p.priceCents || 0)),
      stock: Math.max(0, Math.round(p.stock || 0)),
      attributes: {
        Variação: p.variation || 'Padrão',
        ...(profile.business.address ? { Loja: profile.business.address } : {}),
      },
      whatsappTemplateId: 'product-interest',
      media: [{ assetId, kind: 'product.cutout', status: p.imageUrl ? 'ready' : 'needs_asset' }],
      variants: p.variation
        ? [{ optionId: 'var-1', sku: `${skuClean}-V1`, label: p.variation, priceCents: Math.max(0, Math.round(p.priceCents || 0)), stock: Math.max(0, Math.round(p.stock || 0)) }]
        : undefined,
    };
  });

  const featuresList: { title: string; description: string }[] = [
    profile.delivery.deliveryEnabled
      ? {
          title: 'Entrega na sua região',
          description: profile.delivery.areas.length > 0
            ? `Atendemos: ${profile.delivery.areas.slice(0, 3).join(', ')}`
            : 'Consulte prazo e frete direto no WhatsApp.',
        }
      : { title: 'Atendimento direto', description: `Fale com ${profile.agent.name || 'nossa equipe'} no WhatsApp.` },
    profile.payment.pixDiscountPercent > 0
      ? { title: `${profile.payment.pixDiscountPercent}% OFF no Pix`, description: 'Desconto especial confirmado no fechamento do pedido.' }
      : { title: 'Pagamento facilitado', description: 'Pix, cartão de crédito, débito ou dinheiro na entrega.' },
    profile.delivery.pickupEnabled
      ? { title: 'Retirada na loja', description: profile.delivery.pickupHours || profile.business.hours || 'Combine o horário conosco.' }
      : { title: 'Horário de atendimento', description: profile.business.hours || 'Seg a Sáb · 09h às 19h' },
  ];

  const sections: Section[] = [
    {
      id: 'header',
      type: 'header',
      variant: 'classic',
      navItems: [
        { label: 'Catálogo', target: '#catalogo' },
        { label: 'Contato', target: '#contato' },
      ],
    },
    {
      id: 'hero',
      type: 'hero',
      variant: 'split',
      eyebrow: `${segment} · Revisão ${sourceRevision}`,
      title: businessName,
      description: profile.business.description || segDefaults.tagline,
      cta: 'Ver catálogo',
      assetId: 'asset-hero-main',
    },
    {
      id: 'features',
      type: 'features',
      variant: 'cards',
    },
    {
      id: 'categories',
      type: 'categoryTiles',
      variant: 'pills',
      title: 'Categorias',
    },
    {
      id: 'catalog',
      type: 'catalog',
      variant: 'grid',
      title: `Catálogo oficial — ${businessName}`,
      eyebrow: profile.brand.instagram ? `Siga ${profile.brand.instagram}` : `${products.length} itens sincronizados`,
    },
    {
      id: 'contact',
      type: 'contact',
      variant: 'panel',
      title: `Fale com ${businessName}`,
      description: [profile.business.address, profile.business.hours, profile.brand.instagram].filter(Boolean).join(' · ') || 'Atendimento rápido pelo WhatsApp.',
      cta: 'Chamar no WhatsApp',
    },
    {
      id: 'footer',
      type: 'footer',
      variant: 'standard',
      description: `${businessName}${profile.brand.instagram ? ` · Instagram ${profile.brand.instagram}` : ''}${profile.business.address ? ` · ${profile.business.address}` : ''}`,
    },
  ];

  const addressParts = (profile.business.address || '').split(',');
  const siteInput: Site = {
    schemaVersion: '1.1.0',
    business: {
      name: businessName,
      description: profile.business.description || segDefaults.tagline,
      tagline: segDefaults.tagline,
      segment,
      address: {
        city: addressParts[0]?.trim() || 'Brasil',
        state: addressParts[1]?.trim()?.slice(0, 2).toUpperCase() || 'BR',
      },
      features: featuresList,
    },
    theme: {
      primary,
      accent,
      background: '#FFFFFF',
      text: '#0F172A',
      radius: 12,
      fontFamily: 'sans',
      tokens: {
        'color.primary': primary,
        'color.accent': accent,
        'color.surface': '#FFFFFF',
        'color.ink': '#0F172A',
        'space.unitPx': 10,
        'radius.cardPx': 12,
      },
    },
    whatsapp: {
      phoneE164: phoneDigits,
      // O número detectado no WhatsApp Web já é suficiente para abrir wa.me.
      // A sessão do robô automático é independente e pode estar desconectada.
      demoMode: !isValidProductionPhone(profile.whatsapp.phoneE164),
      recipientLabel: `${businessName} (${profile.agent.name || 'Sofia'})`,
      defaultTemplateId: 'product-interest',
      checkoutTemplateId: 'cart-checkout',
      quoteTemplateId: 'quote-request',
      supportTemplateId: 'support',
    },
    categories,
    products,
    assets,
    prompts: { assets: promptsAssets },
    layout: { sections },
    messages: {
      templates: [
        {
          id: 'product-interest',
          text: `Olá, {{business.name}}! Gostaria de saber mais sobre {{product.name}}, quantidade {{quantity}}, valor {{unitPrice}}. Está disponível?`,
        },
        {
          id: 'cart-checkout',
          text: `🛒 NOVO PEDIDO — {{business.name}}\n\nOlá! Gostaria de finalizar meu pedido.\n\n📦 Itens do carrinho:\n{{items}}\n\n💰 Total: {{total}}\n\nGostaria de confirmar a disponibilidade e combinar a entrega ou retirada. Obrigado!`,
        },
        {
          id: 'quote-request',
          text: `📋 ORÇAMENTO — {{business.name}}\n\n{{items}}\n\nTotal estimado: {{total}}`,
        },
        {
          id: 'support',
          text: `Olá, {{business.name}}! Gostaria de falar sobre {{subject}}.`,
        },
      ],
    },
    rules: {
      currency: 'BRL',
      quantityStep: 1,
      maxPerItem: 25,
      checkoutMode: 'whatsapp_link',
      shippingCents: profile.delivery.deliveryEnabled ? profile.delivery.defaultFeeCents : 0,
      discountCents: 0,
    },
  };

  const compiled = compile(JSON.stringify(siteInput));
  const publicStore = compiled.site ? compilePublicStore(compiled.site) : undefined;

  return {
    sourceRevision,
    siteInput,
    site: compiled.site,
    specV2: compiled.specV2,
    publicStore,
    errors: compiled.errors,
  };
}
