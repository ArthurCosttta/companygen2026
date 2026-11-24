import { CURATED_ICON_CHOICES } from '../shared/formula-ir/atomic-grammar.mjs';
import { formatBriefAnswersForPrompt } from '../shared/formula-ir/brief-questions.mjs';
import {
  renderTupleSpecificationXmlTag,
  resolveDesignContainers,
} from './tuple-specification-module.mjs';

export function stripDashesText(value = '') {
  return String(value ?? '')
    .replace(/\u2014|\u2013/g, ', ')
    .replace(/\s*--\s*/g, ', ')
    .replace(/--+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const LAYOUT_ARCHETYPES = Object.freeze({
  editorial_centered_mega: {
    id: 'editorial_centered_mega',
    label: 'Editorial Centralizado Mega',
    description: 'Abertura centralizada de alto impacto, galeria escura em vidro fosco, cortinas divididas e palco interativo.',
    heroRole: 'hero_centered',
    showcaseRole: 'dark_glass_vault',
    storyRole: 'split_story',
    portalsRole: 'split_curtain_portals',
    experienceRole: 'interactive_image_text_stage',
    gridDensity: 3,
    groundMode: 'pure_gallery',
    displayVoice: 'instrument_serif',
    signatureOrnament: 'flanked_lines',
    heroTextAnchor: 'center',
    heroTypoScale: 'editorial_xxl',
    heroInteractionMode: 'hover_parallax_copy',
    heroAtmosphere: 'warm_linen',
    portalsBarTone: 'anchor_dark',
    layoutGrid: 'editorial_split',
    visualDirection: 'editorial_light',
  },
  boutique_lookbook_split: {
    id: 'boutique_lookbook_split',
    label: 'Boutique Lookbook Split',
    description: 'Capa editorial 50/50, lookbook fixo no scroll, narrativa de atelier e grade limpa de coleção.',
    heroRole: 'hero_split',
    showcaseRole: 'sticky_lookbook',
    storyRole: 'split_story',
    portalsRole: 'coupled_media_grid',
    experienceRole: 'embedded_banner',
    gridDensity: 3,
    groundMode: 'warm_linen',
    displayVoice: 'bricolage',
    signatureOrnament: 'trailing_line',
    heroTextAnchor: 'left',
    heroTypoScale: 'refined_lg',
    heroInteractionMode: 'scroll_reveal_couple',
    heroAtmosphere: 'anchor_dark',
    portalsBarTone: 'surface_light',
    layoutGrid: 'editorial_split',
    visualDirection: 'clean_craft',
  },
  clinic_agenda_steps: {
    id: 'clinic_agenda_steps',
    label: 'Clínica, Agenda e Etapas',
    description: 'Capa consultiva serena, mapa interativo de queixas/etapas, tabela transparente de planos e agenda de horários.',
    heroRole: 'clinic_editorial_hero',
    showcaseRole: 'clinic_symptom_map',
    storyRole: 'clinic_pricing_tiers',
    portalsRole: 'coupled_media_grid',
    experienceRole: 'calendar_delivery_slots',
    gridDensity: 2,
    groundMode: 'warm_linen',
    displayVoice: 'fraunces',
    signatureOrnament: 'flanked_lines',
    heroTextAnchor: 'left',
    heroTypoScale: 'refined_lg',
    heroInteractionMode: 'static',
    heroAtmosphere: 'warm_linen',
    portalsBarTone: 'surface_light',
    layoutGrid: 'editorial_split',
    visualDirection: 'editorial_light',
  },
  direct_offer_bundles: {
    id: 'direct_offer_bundles',
    label: 'Oferta Direta & Combos',
    description: 'Capa full-bleed de conversão rápida, montador de kits com cálculo na hora, vitrine bento de ofertas e grade densa.',
    heroRole: 'hero_stage',
    showcaseRole: 'bundle_builder_calculator',
    storyRole: 'bento_spotlight',
    portalsRole: 'coupled_media_grid',
    experienceRole: 'embedded_banner',
    gridDensity: 4,
    groundMode: 'soft_tint',
    displayVoice: 'archivo',
    signatureOrnament: 'slanted_bar',
    heroTextAnchor: 'left',
    heroTypoScale: 'poster_mega',
    heroInteractionMode: 'static',
    heroAtmosphere: 'anchor_dark',
    portalsBarTone: 'anchor_dark',
    layoutGrid: 'compact_dense',
    visualDirection: 'vibrant_retail',
  },
});

export const VALID_LAYOUT_ARCHETYPE_IDS = Object.freeze(Object.keys(LAYOUT_ARCHETYPES));

/**
 * Seleciona uma das 4 arquiteturas distintas a partir de escolha explícita ou análise real do negócio.
 */
export function resolveLayoutArchetype({ layoutArchetype = '', dossier = {}, profile = {} } = {}) {
  const explicit = String(layoutArchetype || profile?.brand?.layoutArchetype || '').trim();
  if (explicit && LAYOUT_ARCHETYPES[explicit]) {
    return LAYOUT_ARCHETYPES[explicit];
  }

  const segment = String(dossier?.brand?.segment || profile?.business?.segment || '').toLowerCase();
  const businessModel = String(profile?.business?.businessModel || '').toLowerCase();
  const campaignTheme = String(dossier?.growthStrategy?.campaignTheme || profile?.business?.campaignTheme || '').toLowerCase();
  const totalSkus = Number(dossier?.catalogSummary?.totalSkus || 0);
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];
  const validPrices = products.map((p) => Number(p.priceCents || 0)).filter((c) => c > 0);
  const avgCents = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;
  const serviceCount = products.filter((p) => p.itemType === 'servico_agendado').length;

  const isClinicOrService =
    businessModel === 'servicos' ||
    (products.length > 0 && serviceCount >= Math.ceil(products.length * 0.6)) ||
    /cl[ií]nic|sa[uú]de|fisio|odonto|est[eé]tic|psic|consult|advoc|terapia|nutri|m[eé]dic|veterin|pet\s*vet|studio|sal[aã]o|barbear/i.test(
      segment,
    );
  if (isClinicOrService) {
    return LAYOUT_ARCHETYPES.clinic_agenda_steps;
  }

  const isDirectOffer =
    campaignTheme === 'black_friday' ||
    campaignTheme === 'drop' ||
    totalSkus >= 12 ||
    (avgCents > 0 && avgCents < 7500) ||
    /supermercad|mercearia|suplement|eletr[oô]nic|inform[aá]tica|pet\s*shop|ra[cç][aã]o|atacad|varejo|bebida|farm[aá]cia/i.test(
      segment,
    );
  if (isDirectOffer) {
    return LAYOUT_ARCHETYPES.direct_offer_bundles;
  }

  const isEditorialMega =
    avgCents >= 25000 ||
    totalSkus <= 6 ||
    /joia|semijoia|design|arquitet|arte|galeria|perfum|luxo|rel[oó]g|cosm[eé]tic|skincare|premium/i.test(segment);
  if (isEditorialMega) {
    return LAYOUT_ARCHETYPES.editorial_centered_mega;
  }

  return LAYOUT_ARCHETYPES.boutique_lookbook_split;
}

/**
 * Prompt Estruturado com Tags Semânticas por Seção (<section_spec id="...">).
 * Cada tag ensina exatamente ao GLM como responder para aquela seção específica,
 * variando entre 4 arquiteturas reais sem repetir padrão único.
 */
export function buildPropertyDrivenSectionPrompt(dossier = {}, options = {}) {
  const iconsList = CURATED_ICON_CHOICES.join(' | ');
  const enrichedXml = formatBriefAnswersForPrompt(options?.briefAnswers || {}, options?.questionsJson || null);
  const archetype = resolveLayoutArchetype({
    layoutArchetype: options?.layoutArchetype,
    dossier,
    profile: options?.profile,
  });
  const selectedAddons = Array.isArray(options?.selectedAddons) ? options.selectedAddons.filter(Boolean) : [];
  const m = dossier?.growthStrategy?.tupleMultipliers || {};
  const storeName = stripDashesText(dossier?.brand?.name || 'Loja');
  const segment = stripDashesText(dossier?.brand?.segment || 'Produtos e Atendimento');
  const flagship = stripDashesText(dossier?.flagshipProduct?.name || 'Produto principal');
  const flagshipSku = dossier?.flagshipProduct?.sku ? ` [SKU ${dossier.flagshipProduct.sku}]` : '';
  const cats = (dossier?.catalogSummary?.categories || []).map((c) => stripDashesText(c.name)).filter(Boolean);
  const topSkus = (dossier?.catalogSummary?.categories || [])
    .flatMap((c) => c.sampleSkus || [])
    .slice(0, 8)
    .map((s) => `${s.sku ? `[${s.sku}] ` : ''}${stripDashesText(s.name)} (${s.priceBRL})`)
    .join('; ');

  const addonsNote =
    selectedAddons.length > 0 ? `  Adicionais ativos escolhidos pelo lojista: ${selectedAddons.join(', ')}` : '';

  return [
    `<brand_concept>`,
    `  Loja: ${storeName}`,
    `  Nicho: ${segment}`,
    `  Arquitetura selecionada: ${archetype.id} (${archetype.description})`,
    `  Voz da marca: ${dossier?.brand?.brandVoice || 'editorial_minimal'}`,
    `  Produto Carro-Chefe: ${flagship}${flagshipSku}`,
    `  Produtos reais do catálogo: ${topSkus || 'Ver catálogo'}`,
    `  Categorias reais: ${cats.join(', ') || 'Geral'}`,
    `  Público-alvo: ${stripDashesText(dossier?.targetAudience?.buyerPersona || '')}`,
    `  Principal objeção a quebrar: ${stripDashesText(dossier?.targetAudience?.mainObjection || '')}`,
    `  Gatilho de venda: ${stripDashesText(dossier?.targetAudience?.buyingTrigger || '')}`,
    `  Objetivo mensal: ${dossier?.growthStrategy?.monthlyGoal || 'fast_pix_turnover'}`,
    `  Desconto Pix: ${dossier?.brand?.pixDiscountPercent || 0}%`,
    ...(addonsNote ? [addonsNote] : []),
    `</brand_concept>`,
    ...(enrichedXml ? [``, stripDashesText(enrichedXml)] : []),
    ``,
    `<forbid_generic_phrases>`,
    `  PROIBIDO usar frases vazias de template: "envio organizado com acompanhamento", "curadoria técnica assistida", "diagnóstico sem achismo", "para o seu dia a dia", "qualidade e excelência", "soluções pensadas para você", "monte sua seleção".`,
    `  PROIBIDO usar duplo hífen ou travessão longo no texto gerado. Use vírgula, ponto final ou ponto médio ("·").`,
    `  OBRIGATÓRIO: incorporar fatos concretos das respostas em <enriched_merchant_brief> e os nomes/preços exatos de ${flagship} e das categorias (${cats.join(', ')}).`,
    `</forbid_generic_phrases>`,
    ``,
    renderTupleSpecificationXmlTag(),
    ``,
    `<architecture_blueprint id="${archetype.id}">`,
    `  Use OBRIGATORIAMENTE esta arquitetura visual distinta:`,
    `  - Hero role: ${archetype.heroRole} (textAnchor=${archetype.heroTextAnchor}, typoScale=${archetype.heroTypoScale})`,
    `  - Vitrine de destaque (sec_flagship): ${archetype.showcaseRole}`,
    `  - Narrativa ou Oferta secundária (sec_editorial_story): ${archetype.storyRole}`,
    `  - Portais de categorias (sec_categories): ${archetype.portalsRole}`,
    `  - Experiência interativa (sec_experience): ${archetype.experienceRole}`,
    `  - Densidade desktop do catálogo: ${archetype.gridDensity} colunas`,
    `  - Fonte display: ${archetype.displayVoice}, groundMode: ${archetype.groundMode}`,
    `</architecture_blueprint>`,
    ``,
    `<section_instructions>`,
    `  <section_spec id="sec_hero">`,
    `    Como responder: Use role="${archetype.heroRole}".`,
    `    NÃO envie eyebrow acima da headline (deixe eyebrow="").`,
    `    headline: 4 a 7 palavras autorais específicas de ${storeName} envolvendo as 2 últimas em <accent>...</accent>.`,
    `    subheadline: 1 frase concreta citando "${flagship}" ou o benefício numérico da operação.`,
    `    ctaPrimaryLabel: 2 a 4 palavras orientadas a ação (ex: "Explorar coleção", "Ver ${cats[0] || 'ofertas'}", "Agendar avaliação").`,
    `    displayVoice: ${archetype.displayVoice}.`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_ribbon">`,
    `    Como responder: 4 frases curtas de prova real específicas de ${storeName} (sem frases genéricas).`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_flagship">`,
    `    Como responder: Use role="${archetype.showcaseRole}".`,
    `    heading: título autoral destacando "${flagship}" com 1 palavra em <accent>...</accent>.`,
    `    storyParagraphs: exatamente 2 frases detalhando material, uso real e diferencial frente à concorrência.`,
    `    metrics: 2 métricas concretas reais de compra (ex: garantia, envio, economia no Pix, duração).`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_editorial_story">`,
    `    Como responder: Use role="${archetype.storyRole}" para reforçar a proposta única da arquitetura ${archetype.id}.`,
    `    heading: por que clientes escolhem ${storeName} em vez de opções genéricas.`,
    `    storyParagraphs: 2 parágrafos curtos com linguagem do nicho ${segment}.`,
    `    metrics: 2 diferenciais objetivos (ex: "Atendimento", "Prazo").`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_categories">`,
    `    Como responder: Use role="${archetype.portalsRole}". Se houver >= 2 categorias (${cats.join(', ')}), crie heading personalizado convidando a navegar pelas linhas reais.`,
    `    barTone: "${archetype.portalsBarTone}".`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_catalog">`,
    `    Como responder: heading e caption específicos de ${storeName}, convidando a fechar sacola ou tirar dúvida técnica no WhatsApp.`,
    `    cardsPerRowDesktop: ${Number(archetype.gridDensity || m.gridDensity || 3)}.`,
    `  </section_spec>`,
    ``,
    `  <section_spec id="sec_trust">`,
    `    Como responder: Exatamente 3 itens com ícones válidos (${iconsList}) e promessas concretas da operação de ${storeName}.`,
    `  </section_spec>`,
    `</section_instructions>`,
    ``,
    `<output_contract>`,
    `Responda APENAS um objeto JSON válido seguindo exatamente esta estrutura:`,
    JSON.stringify({
      engineSeed: {
        groundMode: archetype.groundMode,
        displayVoice: archetype.displayVoice,
        bodyVoice: 'manrope',
        scaleRatio: 1.333,
        signatureOrnament: archetype.signatureOrnament,
        headerMode: 'anchor_dark_center_nav',
        footerMode: 'anchor_dark_4col_watermark',
      },
      artDirectionBible: {
        visualStyle: 'stylized_editorial_illustration',
        lighting: 'Warm directional studio key and clean flat matte shading',
        surfaceMaterial: 'Risograph paper grain, brushed metal and sculpted clay objects',
        backdropTone: 'Cohesive atmospheric gradient backdrop without photo clutter',
        cameraFraming: 'Full-bleed widescreen illustration subject with clean breathing room',
      },
      imagePrompts: [
        {
          slotId: 'img_hero_main',
          prompt: `Stylized modern editorial gouache and graphic illustration featuring ${flagship} for ${storeName}, clean focal composition with breathing room, risograph grain, NOT photorealistic, zero faces, zero text`,
          negativePrompt: 'photorealistic photo, uncanny face, text, typography, watermark, logo, collage, cluttered',
        },
      ],
      sectionsByProperty: {
        sec_hero: {
          role: archetype.heroRole,
          eyebrow: '',
          headline: `Seleção autoral ${storeName} com <accent>entrega ágil.</accent>`,
          subheadline: `Conheça ${flagship} e escolha sua opção com condição clara no Pix.`,
          ctaPrimaryLabel: archetype.id === 'clinic_agenda_steps' ? 'Agendar avaliação' : 'Ver coleção completa',
          atmosphere: archetype.heroAtmosphere,
          fullScreenHero: true,
          paddingY: 72,
          radiusPx: 18,
          displayVoice: archetype.displayVoice,
          paperGrain: true,
        },
        sec_ribbon: {
          role: 'kinetic_ribbon',
          items: [storeName, 'Valores transparentes', 'Pedido direto no WhatsApp', 'Atendimento humano'],
          speedSec: 22,
        },
        sec_flagship: {
          role: archetype.showcaseRole,
          heading: `Destaque em <accent>${flagship}</accent>`,
          storyParagraphs: ['Especificação real do catálogo com envio confirmado.', 'Atendimento direto para orientar sua melhor escolha.'],
          metrics: [{ label: 'Atendimento', value: 'WhatsApp Direto' }, { label: 'Envio', value: 'Confirmado' }],
          paddingY: 64,
          radiusPx: 20,
          showPixBadge: true,
        },
        sec_editorial_story: {
          role: archetype.storyRole,
          heading: `Por que escolher a <accent>${storeName}</accent>`,
          storyParagraphs: [`Estrutura pensada para quem busca ${segment} sem rodeios.`, 'Condições reais de pagamento e prazo confirmado no pedido.'],
          metrics: [{ label: 'Suporte', value: 'WhatsApp Direto' }, { label: 'Pix', value: 'Aprovação Imediata' }],
          paddingY: 64,
          radiusPx: 20,
        },
        sec_categories: {
          role: archetype.portalsRole,
          heading: 'Navegue pelas linhas <accent>principais</accent>',
          barTone: archetype.portalsBarTone,
          paddingY: 56,
          radiusPx: 18,
          gapPx: 20,
        },
        sec_catalog: {
          role: 'catalog_full_grid',
          heading: `Catálogo ${storeName}`,
          caption: 'Selecione seus itens na sacola ou consulte especificações direto no WhatsApp.',
          cardsPerRowDesktop: archetype.gridDensity,
          cardsPerRowMobile: 1,
          showPixBadge: true,
          paddingY: 64,
          radiusPx: 18,
          gapPx: 20,
          paperGrain: true,
        },
        sec_trust: {
          role: 'open_columns_strip',
          items: [
            { icon: 'truck', text: 'Despacho ágil com rastreio' },
            { icon: 'shield', text: 'Compra protegida via Pix' },
            { icon: 'message_circle', text: 'Consultoria direta sem robô' },
          ],
        },
      },
    }),
    `</output_contract>`,
    `NUNCA invente nomes, preços ou SKUs de produtos que não existam em <brand_concept>.`,
  ].join('\n');
}

const VALID_HERO_ROLES = new Set([
  'hero_stage',
  'hero_split',
  'hero_centered',
  'clinic_editorial_hero',
  'campaign_christmas_hero',
  'campaign_blackfriday_hero',
]);

const VALID_SHOWCASE_ROLES = new Set([
  'bento_spotlight',
  'split_story',
  'sticky_lookbook',
  'dark_glass_vault',
  'clinic_symptom_map',
  'bundle_builder_calculator',
]);

const VALID_STORY_ROLES = new Set([
  'split_story',
  'bento_spotlight',
  'clinic_pricing_tiers',
  'clinic_case_scoreboard',
  'embedded_banner',
]);

/**
 * Compila a resposta em propriedades campo:valor do GLM para o array validado
 * de tuplas do AtomicBlueprintSchema, garantindo as 4 arquiteturas visuais distintas.
 */
export function compileSectionPropertiesToTuples(propsBySec = {}, dossier = {}, options = {}) {
  const sec = propsBySec && typeof propsBySec === 'object' ? propsBySec : {};
  const hero = sec.sec_hero || {};
  const ribbon = sec.sec_ribbon || {};
  const flagship = sec.sec_flagship || {};
  const story = sec.sec_editorial_story || null;
  const cats = sec.sec_categories || {};
  const catalog = sec.sec_catalog || {};
  const trust = sec.sec_trust || {};
  const archetype = resolveLayoutArchetype({
    layoutArchetype: options?.layoutArchetype,
    dossier,
    profile: options?.profile,
  });
  const m = dossier?.growthStrategy?.tupleMultipliers || {};
  const storeName = stripDashesText(dossier?.brand?.name || 'Loja');

  const heroRole = VALID_HERO_ROLES.has(hero.role) ? hero.role : archetype.heroRole;
  const isWarmHero = hero.atmosphere === 'warm_linen' || archetype.heroAtmosphere === 'warm_linen';
  const heroAtm = isWarmHero
    ? 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>'
    : 'ui:bg=anchor_dark lum=0.14 | ux:<auto_wcag:4.5>';
  const heroGrain =
    hero.paperGrain !== false ? 'lib:svg_paper_grain op=0.025 | mask=cubic_scrim_left' : 'mask=cubic_scrim_left';

  const flagRole = VALID_SHOWCASE_ROLES.has(flagship.role) ? flagship.role : archetype.showcaseRole;
  const storyRole = story && VALID_STORY_ROLES.has(story.role) ? story.role : archetype.storyRole;

  const tuples = [
    {
      tuple: ['sec_hero', heroRole, 'ESTADO_2'],
      surface: heroAtm,
      layout: `cols=12 py=${Number(hero.paddingY) || 72} px=24 gap=24 radOut=${Number(hero.radiusPx) || 18} minVh=${hero.fullScreenHero === false ? 56 : 80} | bleed=full_width`,
      type: `k=3.35 scaleRatio=1.333 wt=800 | highlight=accent_last_word`,
      media: 'ui:ar=16:9 fit=cover slot=img_hero_main | ux:<on_error_monogram>',
      catalog: 'ui:mode=none take=0 per_cat=0',
      lighting: 'lit:radial_back_subject elev=3',
      textureAndMask: heroGrain,
      cardAnatomy: 'none',
      photoTreatment: isWarmHero ? 'fit=cover scrim=bottom_soft strength=0.45' : 'fit=cover scrim=cubic_left_dark strength=0.88',
      ornaments: 'titleOrn=none',
      motion: 'fx:hero_cinematic dur=620',
      direction: {
        textAnchor: archetype.heroTextAnchor,
        typoScale: archetype.heroTypoScale,
        interactionMode: archetype.heroInteractionMode,
      },
      // ZERO eyebrow tag em cima do H1 (regra NO_EYEBROW_TAGS_ABOVE_HEADLINES)
      textSlots: [
        {
          micro: [
            archetype.heroTextAnchor === 'center' ? 'hero_center' : 'left_col',
            'display',
            stripDashesText(hero.headline || `${storeName} com curadoria <accent>sem atrito.</accent>`),
            `ui:sz=${archetype.heroTypoScale === 'editorial_xxl' ? 68 : archetype.heroTypoScale === 'poster_mega' ? 64 : 48} wt=800`,
            'icon:none',
          ],
          mediaPick: 'none',
        },
        {
          micro: [
            archetype.heroTextAnchor === 'center' ? 'hero_center' : 'left_col',
            'body',
            stripDashesText(hero.subheadline || dossier?.brand?.bio || 'Escolha seus itens e finalize em segundos.'),
            'ui:sz=16 wt=400',
            'icon:none',
          ],
          mediaPick: 'none',
        },
      ],
      content: {
        ctaPrimaryLabel: stripDashesText(hero.ctaPrimaryLabel || 'Explorar catálogo'),
        fullScreenHero: hero.fullScreenHero !== false,
        layoutArchetype: archetype.id,
        designContainers: resolveDesignContainers(hero, heroRole),
      },
    },
  ];

  const ribbonItems =
    Array.isArray(ribbon.items) && ribbon.items.length > 0
      ? ribbon.items.slice(0, 5).map((x) => stripDashesText(x)).filter(Boolean)
      : [storeName, 'Envio rápido', 'Atendimento consultivo'];
  tuples.push({
    tuple: ['sec_ribbon', 'kinetic_ribbon', 'ESTADO_1'],
    surface: 'ui:bg=anchor_dark lum=0.14 | ux:<auto_wcag:4.5>',
    layout: 'cols=12 py=12 px=16',
    type: 'k=1.2 wt=700',
    media: 'none',
    catalog: 'ui:mode=none take=0 per_cat=0',
    motion: `speed=${Math.max(12, Math.min(48, Number(ribbon.speedSec) || 22))}`,
    textSlots: ribbonItems.map((txt) => ({
      micro: ['top_left', 'caption', txt, 'ui:sz=11 wt=700', 'icon:sparkles'],
      mediaPick: 'none',
    })),
    content: {},
  });

  if (dossier?.catalogSummary?.totalSkus > 0) {
    const isDarkFlag = flagRole === 'dark_glass_vault' || flagRole === 'clinic_symptom_map';
    tuples.push({
      tuple: ['sec_flagship', flagRole, 'ESTADO_2'],
      surface: isDarkFlag
        ? 'ui:bg=anchor_dark lum=0.14 | ux:<auto_wcag:4.5>'
        : 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
      layout: `cols=12 py=${Number(flagship.paddingY) || 64} px=24 gap=24 radOut=${Number(flagship.radiusPx) || 20}`,
      type: 'k=2.6 wt=800',
      media: 'ui:ar=16:10 fit=cover slot=img_hero_main | ux:<on_error_monogram>',
      catalog: 'ui:mode=top_per_category take=6 per_cat=2 | ux:<forbid_ai_rename>',
      lighting: 'lib:comeau_shadow elev=2',
      textureAndMask: 'lib:svg_paper_grain op=0.025',
      cardAnatomy: `pix_badge=${flagship.showPixBadge !== false}`,
      photoTreatment: 'aspect=16:10 fit=cover',
      ornaments: `headingOrn=${archetype.signatureOrnament}`,
      motion: 'fx:stagger_reveal dur=380',
      textSlots: [
        {
          micro: [
            'top_left',
            'heading',
            stripDashesText(flagship.heading || `Seleção ${storeName}`),
            'ui:sz=30 wt=800',
            'icon:none',
          ],
          mediaPick: 'none',
        },
      ],
      content: {
        storyParagraphs: Array.isArray(flagship.storyParagraphs)
          ? flagship.storyParagraphs.slice(0, 3).map((p) => stripDashesText(p))
          : [],
        metrics: Array.isArray(flagship.metrics)
          ? flagship.metrics.slice(0, 4).map((mt) => ({
              label: stripDashesText(mt?.label || ''),
              value: stripDashesText(mt?.value || ''),
            }))
          : [],
      },
    });
  }

  // Seção secundária alinhada à arquitetura escolhida (evita repetir sempre split_story ou bento_spotlight)
  if (story && flagRole !== storyRole) {
    tuples.push({
      tuple: ['sec_editorial_story', storyRole, 'ESTADO_2'],
      surface: 'ui:bg=ground lum=0.96 | ux:<soft_wash> <auto_wcag:4.5>',
      layout: `cols=12 py=${Number(story.paddingY) || 64} px=24 gap=28 radOut=${Number(story.radiusPx) || 20}`,
      type: 'k=2.5 wt=800',
      media: 'ui:ar=4:3 fit=cover slot=img_banner_ambient | ux:<on_error_monogram>',
      catalog: storyRole === 'bento_spotlight' ? 'ui:mode=top_per_category take=4 per_cat=2 | ux:<forbid_ai_rename>' : 'ui:mode=none take=0 per_cat=0',
      lighting: 'lib:comeau_shadow elev=2',
      textureAndMask: 'lib:svg_paper_grain op=0.025',
      cardAnatomy: 'none',
      photoTreatment: 'aspect=4:3 fit=cover',
      ornaments: `headingOrn=${archetype.signatureOrnament}`,
      motion: 'fx:stagger_reveal dur=380',
      textSlots: [
        {
          micro: [
            'left_col',
            'heading',
            stripDashesText(story.heading || `Por que escolher a ${storeName}`),
            'ui:sz=28 wt=800',
            'icon:none',
          ],
          mediaPick: 'none',
        },
      ],
      content: {
        storyParagraphs: Array.isArray(story.storyParagraphs)
          ? story.storyParagraphs.slice(0, 3).map((p) => stripDashesText(p))
          : [],
        metrics: Array.isArray(story.metrics)
          ? story.metrics.slice(0, 4).map((mt) => ({
              label: stripDashesText(mt?.label || ''),
              value: stripDashesText(mt?.value || ''),
            }))
          : [],
      },
    });
  }

  if ((dossier?.catalogSummary?.categories || []).length >= 2) {
    const portalRole = ['coupled_media_grid', 'split_curtain_portals'].includes(cats.role)
      ? cats.role
      : archetype.portalsRole;
    const barTone = cats.barTone === 'surface_light' || archetype.portalsBarTone === 'surface_light' ? 'surface_light' : 'anchor_dark';
    tuples.push({
      tuple: ['sec_portals', portalRole, 'ESTADO_2'],
      surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
      layout: `cols=${portalRole === 'split_curtain_portals' ? 2 : 3} py=${Number(cats.paddingY) || 56} px=24 gap=${Number(cats.gapPx) || 20} radOut=${Number(cats.radiusPx) || 18}`,
      type: 'k=2.5 wt=800',
      media: 'ui:ar=16:10 fit=cover | ux:<on_error_monogram>',
      catalog: 'ui:mode=top_per_category take=4 per_cat=1',
      lighting: 'lib:comeau_shadow elev=2',
      textureAndMask: 'tex:none',
      cardAnatomy: `shell=zero_gap_bottom_bar barTone=${barTone}`,
      photoTreatment: 'aspect=16:10 fit=cover scrim=bottom_soft',
      ornaments: 'headingOrn=flanked_lines',
      motion: 'fx:stagger_reveal dur=360',
      textSlots: [
        {
          micro: [
            'top_left',
            'heading',
            stripDashesText(cats.heading || `Linhas de ${storeName}`),
            'ui:sz=28 wt=800',
            'icon:none',
          ],
          mediaPick: 'none',
        },
      ],
      content: {},
    });
  }

  const deskCols = Math.max(2, Math.min(4, Number(catalog.cardsPerRowDesktop || archetype.gridDensity || m.gridDensity || 3)));
  const mobCols = Math.max(1, Math.min(2, Number(catalog.cardsPerRowMobile || 1)));
  tuples.push({
    tuple: ['sec_cat', 'catalog_full_grid', 'ESTADO_2'],
    surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
    layout: `cols=${deskCols} py=${Number(catalog.paddingY) || 64} px=24 gap=${Number(catalog.gapPx) || 20} radOut=${Number(catalog.radiusPx) || 18}`,
    type: 'k=2.5 wt=800 | ux:<tabular_nums>',
    media: 'ui:ar=4:3 fit=cover | ux:<on_error_monogram>',
    catalog: 'ui:mode=full_searchable_grid take=36 per_cat=8 | ux:<forbid_ai_rename>',
    lighting: 'lib:comeau_shadow elev=1',
    textureAndMask: catalog.paperGrain !== false ? 'lib:svg_paper_grain op=0.02' : 'tex:none',
    cardAnatomy: `no_photo=editorial_spec_card show_variation=true pix_badge=${catalog.showPixBadge !== false}`,
    photoTreatment: 'aspect=4:3 fit=cover',
    ornaments: `headingOrn=${archetype.signatureOrnament}`,
    motion: 'fx:auto_animate_grid',
    responsive: `mob:${mobCols}|tab:2|desk:${deskCols}`,
    textSlots: [
      {
        micro: [
          'top_left',
          'heading',
          stripDashesText(catalog.heading || `Catálogo ${storeName}`),
          'ui:sz=28 wt=800',
          'icon:none',
        ],
        mediaPick: 'none',
      },
      {
        micro: [
          'top_left',
          'caption',
          stripDashesText(catalog.caption || 'Escolha os itens e envie seu pedido direto.'),
          'ui:sz=14 wt=400',
          'icon:none',
        ],
        mediaPick: 'none',
      },
    ],
    content: {},
  });

  const trustItems =
    Array.isArray(trust.items) && trust.items.length >= 2
      ? trust.items.slice(0, 3)
      : [
          { icon: 'truck', text: 'Envio organizado e rastreado' },
          { icon: 'shield', text: 'Pagamento simples no Pix' },
          { icon: 'message_circle', text: 'Suporte humano rápido' },
        ];
  tuples.push({
    tuple: ['sec_trust', 'open_columns_strip', 'ESTADO_1'],
    surface: 'ui:bg=ground lum=0.96 | ux:<auto_wcag:4.5>',
    layout: 'cols=3 py=32 px=24 gap=0 | containerStyle=borderless_columns',
    type: 'k=1.4 wt=700',
    media: 'none',
    catalog: 'ui:mode=none take=0 per_cat=0',
    lighting: 'lit:flat elev=0',
    textureAndMask: 'tex:none',
    cardAnatomy: 'no_card_box_transparent',
    ornaments: 'colDivider=vertical_hairline_1px',
    motion: 'fx:none',
    textSlots: trustItems.map((it) => ({
      micro: [
        'card_footer',
        'stat_callout',
        stripDashesText(it.text || 'Atendimento rápido'),
        'ui:sz=14 wt=700',
        `icon:${CURATED_ICON_CHOICES.includes(it.icon) ? it.icon : 'check'}`,
      ],
      mediaPick: 'none',
    })),
    content: {},
  });

  tuples.push({
    tuple: ['sec_footer', 'anchor_footer', 'ESTADO_1'],
    surface: 'ui:bg=anchor_dark lum=0.12 | ux:<auto_wcag:4.5>',
    layout: 'cols=4 py=56 px=24 | bleed=full_width',
    type: 'k=1.4 wt=700',
    media: 'none',
    catalog: 'ui:mode=none take=0 per_cat=0',
    lighting: 'lit:top_hairline elev=0',
    textureAndMask: 'tex:none',
    cardAnatomy: 'columns=4_with_legal_subbar',
    ornaments: 'watermark=corner_line_art_right',
    motion: 'fx:none',
    textSlots: [],
    content: {},
  });

  return tuples;
}
