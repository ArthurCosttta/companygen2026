/**
 * Formula-IR v9.0 · Pure Structural Builder & upcastToV9 (`ensureFormulaV9`)
 * Niche-agnostic fallback and seamless legacy profile -> Formula-IR v9.0 upgrade.
 */
import {
  FORMULA_V9_VERSION,
  WHITELISTED_ICONS,
  deriveThemeTokensFromHex,
  sanitizeFormulaV9Document,
} from './composer-schema.mjs';

export function buildNeutralFallbackV9Document(profile = {}) {
  const business = profile?.business || {};
  const brand = profile?.brand || {};
  const payment = profile?.payment || {};
  const storeName = String(business.name || 'Nossa Loja').trim();
  const segment = String(business.segment || 'Atendimento Especializado').trim();
  const businessModel = String(business.businessModel || 'hibrido').trim();
  const description = String(business.description || `${storeName} — ${segment}`).trim();
  const campaignTheme = String(business.campaignTheme || '').trim();
  const pixDiscountPercent = Math.max(0, Math.min(90, Number(payment.pixDiscountPercent || 0)));
  const primaryColor = String(brand.primaryColor && brand.primaryColor !== '#111827' ? brand.primaryColor : '#0B4DB8').trim();
  const fontStyle = String(brand.fontStyle || 'modern_sans').trim();
  const hasUserLogo = Boolean(String(brand.logoUrl || '').trim());
  const hasUserStorefront = Boolean(String(brand.storefrontPhotoUrl || '').trim());
  const differentials = Array.isArray(business.differentials) ? business.differentials.filter(Boolean).slice(0, 3) : [];

  const activeItems = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];

  const serviceItems = activeItems.filter((p) => p.itemType === 'servico_agendado');
  const primaryPool = (businessModel === 'servicos' && serviceItems.length > 0 ? serviceItems : activeItems).slice(0, 4);
  const addonPool = activeItems.filter((p) => !primaryPool.some((x) => x.id === p.id)).slice(0, 4);

  const mainOptions =
    primaryPool.length > 0
      ? primaryPool.map((p, idx) => ({
          value: `item_${idx + 1}`,
          label: String(p.name || `Opção ${idx + 1}`).slice(0, 88),
          skuRef: String(p.sku || p.id || ''),
          priceCents: Math.max(0, Number(p.priceCents || 0)),
          note: String(p.category || ''),
        }))
      : [
          {
            value: 'consulta_inicial',
            label: businessModel === 'servicos' ? 'Atendimento principal sob consulta' : 'Seleção principal da loja',
            priceCents: 0,
            note: 'Confirmado via WhatsApp',
          },
        ];

  const controls = [
    {
      id: 'ctrl_principal',
      atomType: 'option_cards',
      stateKey: 'principal',
      label: businessModel === 'servicos' ? '1. Escolha o serviço principal' : '1. Escolha o item ou opção base',
      options: mainOptions,
    },
  ];

  const stateDefaults = {
    principal: mainOptions[0]?.value || 'item_1',
  };

  if (addonPool.length > 0) {
    controls.push({
      id: 'ctrl_adicionais',
      atomType: 'checklist_addons',
      stateKey: 'adicionais',
      label: '2. Complementos opcionais do catálogo',
      options: addonPool.map((p, idx) => ({
        value: `addon_${idx + 1}`,
        label: String(p.name || `Extra ${idx + 1}`).slice(0, 88),
        skuRef: String(p.sku || p.id || ''),
        priceDeltaCents: Math.max(0, Number(p.priceCents || 0)),
        note: String(p.category || ''),
      })),
    });
    stateDefaults.adicionais = [];
  }

  if (businessModel === 'servicos' || serviceItems.length > 0) {
    controls.push({
      id: 'ctrl_horario',
      atomType: 'slot_time_picker',
      stateKey: 'preferencia_horario',
      label: `${controls.length + 1}. Preferência de turno`,
      slots: ['Manhã (09h–12h)', 'Tarde (13h–17h)', 'Fim da tarde (17h–19h)'],
    });
    stateDefaults.preferencia_horario = 'Manhã (09h–12h)';
  }

  const imagePlan = [
    {
      slotId: 'hero_main',
      targetSectionId: 'sec_hero',
      role: 'hero',
      tier: 'flux-dev',
      aspect: '4:3',
      promptEn: `Editorial lifestyle scene representing ${storeName} (${segment}), ${description.slice(0, 140)}, warm natural light, high craft photography, no text`,
    },
  ];
  if (!hasUserStorefront) {
    imagePlan.push({
      slotId: 'ambient_space',
      targetSectionId: 'sec_editorial',
      role: 'lifestyle_banner',
      tier: 'flux-schnell',
      aspect: '4:3',
      promptEn: `Inviting workspace and customer reception area for ${storeName} (${segment}), clean architectural photography, natural daylight, no readable words`,
    });
  }
  if (!hasUserLogo && brand.generateAiLogo) {
    imagePlan.push({
      slotId: 'brand_logo',
      targetSectionId: 'sec_hero',
      role: 'brand_logo',
      tier: 'flux-schnell',
      aspect: '1:1',
      promptEn: `Minimalist geometric brand emblem for ${storeName} (${segment}) on clean light background, flat vector icon feel, no small text`,
    });
  }

  const diffItems =
    differentials.length > 0
      ? differentials.map((d, idx) => ({
          icon: idx === 0 ? 'ShieldCheck' : idx === 1 ? 'Clock' : WHITELISTED_ICONS[2] || 'Heart',
          title: d.slice(0, 58),
          text: 'Confirmado diretamente pela equipe no atendimento.',
        }))
      : [
          { icon: 'ShieldCheck', title: 'Atendimento transparente', text: 'Preços e condições alinhados ao catálogo atual.' },
          { icon: 'MessageCircle', title: 'Pedido direto no WhatsApp', text: 'Envie sua seleção organizada em um clique.' },
        ];

  const sections = [
    {
      id: 'sec_hero',
      type: 'HeroSection',
      imageSlotId: 'hero_main',
      config: {
        variant: 'split',
        eyebrow: campaignTheme || segment,
        title: storeName,
        subtitle: description,
        primaryCta: {
          label: businessModel === 'servicos' ? 'Simular atendimento' : 'Explorar experiência',
          href: '#experiencia',
        },
        secondaryCta: { label: 'Falar no WhatsApp', action: 'whatsapp.send_summary' },
      },
    },
    {
      id: 'sec_diff',
      type: 'DifferentialsStrip',
      config: { items: diffItems },
    },
    {
      id: 'sec_experiencia',
      type: 'InteractiveExperience',
      config: {
        eyebrow: campaignTheme ? `Destaque: ${campaignTheme}` : 'Simulador da Loja',
        title: businessModel === 'servicos' ? 'Monte sua solicitação' : 'Monte sua seleção',
        subtitle: String(business.experienceGoal || 'Selecione opções abaixo e veja o resumo atualizado antes de finalizar.'),
        layoutVariant: 'workbench_split',
        stateDefaults,
        controls,
        calcRule: {
          mode: 'base_plus_addons',
          pixDiscountPercent,
          summaryTitle: 'Resumo da sua escolha',
          limitNote:
            businessModel === 'servicos'
              ? 'Disponibilidade exata de agenda confirmada pela equipe no WhatsApp.'
              : 'Consulte prazos e combinações diretamente ao finalizar.',
        },
        primaryAction: {
          type: 'cart.add_selected',
          label: businessModel === 'servicos' ? 'Levar solicitação à sacola' : 'Adicionar seleção à sacola',
        },
        secondaryAction: {
          type: 'whatsapp.send_summary',
          label: 'Enviar resumo no WhatsApp',
        },
      },
    },
    {
      id: 'sec_editorial',
      type: 'EditorialMediaSplit',
      imageSlotId: hasUserStorefront ? undefined : 'ambient_space',
      config: {
        variant: 'media_right',
        eyebrow: 'Nosso espaço e jeito de trabalhar',
        title: `Conheça ${storeName}`,
        body: description,
        bullets: differentials,
        ctaLabel: 'Ver itens abaixo',
        ctaHref: '#catalogo',
        imageUrl: hasUserStorefront ? String(brand.storefrontPhotoUrl) : undefined,
      },
    },
    {
      id: 'sec_catalogo',
      type: 'CatalogGrid',
      config: {
        title: businessModel === 'servicos' ? 'Serviços e itens disponíveis' : 'Catálogo completo',
        subtitle: 'Adicione diretamente à sacola ou clique em um item para ver detalhes.',
        itemActionLabel: 'Adicionar à sacola',
        emptyImageMode: 'neutral_gray',
      },
    },
    {
      id: 'sec_closing',
      type: 'ClosingScheduleSplit',
      config: {
        eyebrow: 'Atendimento',
        title: String(business.hours || 'Atendimento ágil e organizado'),
        subtitle: String(business.address || 'Combine entrega ou retirada diretamente com nossa equipe.'),
        slots: ['Manhã', 'Tarde', 'Sob consulta'],
        whatsappHeading: `Dúvidas sobre ${storeName}?`,
        whatsappSubtext: 'Envie sua dúvida ou pedido montado direto no WhatsApp.',
        ctaLabel: 'Chamar no WhatsApp',
        imageUrl: hasUserStorefront ? String(brand.storefrontPhotoUrl) : undefined,
      },
    },
    {
      id: 'sec_footer',
      type: 'RichFooter',
      config: {
        tagline: `${storeName} — ${description.slice(0, 140)}`,
        showNewsletter: false,
      },
    },
  ];

  return sanitizeFormulaV9Document(
    {
      version: FORMULA_V9_VERSION,
      generatedBy: 'neutral-v9-fallback',
      modelUsed: 'structural-fallback',
      analysis: {
        factsConfirmed: activeItems.slice(0, 4).map((p) => `${p.name}`),
        dependencies: ['Prazo final e disponibilidade exata confirmados no WhatsApp'],
        mainExperienceSummary: String(
          business.experienceGoal || 'Permite escolher item base, extras opcionais e enviar à sacola.',
        ),
      },
      designTokens: deriveThemeTokensFromHex(primaryColor, fontStyle),
      imagePlan,
      sections,
    },
    profile,
  );
}

/**
 * upcastToV9: Ensures any profile (even legacy pre-v9 without formulasIr v9.0)
 * produces a valid Formula-IR v9.0 document without calling AI or losing data.
 */
export function ensureFormulaV9(profile = {}) {
  const savedIr = profile?.storeLayout?.formulasIr;
  if (savedIr?.version === FORMULA_V9_VERSION && Array.isArray(savedIr.sections) && savedIr.sections.length > 0) {
    return savedIr;
  }
  return buildNeutralFallbackV9Document(profile);
}
