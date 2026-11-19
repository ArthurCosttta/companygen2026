/**
 * GLM-5.3 Product Strategist & Free Compositor Prompt Builder (Formula-IR v9.0)
 * Zero hardcoded niches/presets — feeds verified profile inputs, catalog SKUs,
 * and reusable v9.0 building blocks (11 sections + 5 atoms + Sacola/WhatsApp).
 */
import {
  FORMULA_V9_VERSION,
  WHITELISTED_ICONS,
  deriveThemeTokensFromHex,
} from '../shared/formula-ir/composer-schema.mjs';
import {
  buildNeutralFallbackV9Document,
  ensureFormulaV9,
} from '../shared/formula-ir/neutral-fallback-v9.mjs';

export { buildNeutralFallbackV9Document, ensureFormulaV9 };

export function normalizeDisplayTitle(rawName = '') {
  const cleaned = String(rawName || '')
    .replace(/\s+/g, ' ')
    .replace(/^[-_•*#\s]+|[-_•*\s]+$/g, '')
    .trim();
  if (!cleaned) return 'Item do Catálogo';
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 4) {
    return cleaned
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase())
      .slice(0, 90);
  }
  return cleaned.slice(0, 90);
}

export function summarizeCatalogForPrompt(profile) {
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];

  const picked = [];
  const seenCategories = new Set();
  for (const p of products) {
    if (picked.length >= 15) break;
    const cat = String(p.category || 'Geral').toLowerCase();
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      picked.push(p);
    }
  }
  for (const p of products) {
    if (picked.length >= 15) break;
    if (!picked.includes(p)) picked.push(p);
  }

  return picked.map((p) => ({
    sku: String(p.sku || p.id || '').slice(0, 48),
    name: normalizeDisplayTitle(p.name || ''),
    category: String(p.category || 'Geral').slice(0, 48),
    itemType: String(p.itemType || 'produto_fisico'),
    priceCents: Math.max(0, Math.round(Number(p.priceCents || 0))),
    variation: String(p.variation || 'Padrão').slice(0, 48),
    description: String(p.description || '').slice(0, 70),
  }));
}

export function computeCatalogMetricsForPrompt(profile) {
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];
  const validPrices = products
    .map((p) => Math.max(0, Math.round(Number(p.priceCents || 0))))
    .filter((c) => c > 0);
  const avgPriceCents =
    validPrices.length > 0
      ? Math.round(validPrices.reduce((acc, c) => acc + c, 0) / validPrices.length)
      : 0;
  const serviceCount = products.filter((p) => p.itemType === 'servico_agendado').length;
  const physicalCount = products.length - serviceCount;
  const ticketTier =
    avgPriceCents >= 50000
      ? 'high_ticket_consultative'
      : avgPriceCents > 0 && avgPriceCents < 8000
        ? 'low_ticket_impulse_pix'
        : 'mid_ticket_balanced';
  return {
    totalActiveSkus: products.length,
    avgPriceCents,
    serviceCount,
    physicalCount,
    ticketTier,
  };
}

/**
 * Builds [system, user] messages teaching GLM-5.3 to act as product strategist,
 * interaction designer, and art director emitting strictly valid Formula-IR v9.0 JSON.
 */
export function buildGlmArchitectMessages(profile = {}) {
  const business = profile?.business || {};
  const brand = profile?.brand || {};
  const payment = profile?.payment || {};
  const whatsapp = profile?.whatsapp || {};

  const storeName = String(business.name || 'Minha Loja').trim();
  const segment = String(business.segment || 'Geral').trim();
  const businessModel = String(business.businessModel || 'hibrido').trim();
  const description = String(business.description || '').trim();
  const experienceGoal = String(business.experienceGoal || '').trim();
  const campaignTheme = String(business.campaignTheme || '').trim();
  const differentials = Array.isArray(business.differentials) ? business.differentials.filter(Boolean) : [];
  const address = String(business.address || '').trim();
  const hours = String(business.hours || '').trim();
  const pixDiscountPercent = Math.max(0, Math.min(90, Number(payment.pixDiscountPercent || 0)));
  const primaryColor = String(brand.primaryColor && brand.primaryColor !== '#111827' ? brand.primaryColor : '#0B4DB8').trim();
  const fontStyle = String(brand.fontStyle || 'modern_sans').trim();

  const hasUserLogo = Boolean(String(brand.logoUrl || '').trim());
  const wantsAiLogo = Boolean(brand.generateAiLogo) && !hasUserLogo;
  const hasUserStorefront = Boolean(String(brand.storefrontPhotoUrl || '').trim());
  const skus = summarizeCatalogForPrompt(profile);
  const catalogMetrics = computeCatalogMetricsForPrompt(profile);

  const systemPrompt = `Você é responsável pela estratégia de produto, pelo design de interação e pela direção visual de uma loja ou site de serviços.
Analise o catálogo e as entradas do lojista e proponha uma experiência específica para esse negócio, emitindo EXCLUSIVAMENTE um JSON válido no formato Formula-IR v9.0 (sem markdown, sem comentários fora do JSON).

<skill_01_entender_o_negocio>
- Identifique o que realmente é vendido (produtos físicos, serviços agendáveis, kits/combos ou sob medida) a partir dos itens reais do catálogo.
- Diferencie fatos confirmados no catálogo, diferenciais informados pelo lojista e o que depende de confirmação humana pelo WhatsApp.
- PROIBIDO inventar avaliações, depoimentos, certificados, prêmios, garantias ou descontos inexistentes.
- REGRA DE TICKET MÉDIO (avgPriceCents = ${catalogMetrics.avgPriceCents}):
  - Se avgPriceCents < 8000 (baixo ticket): use copy curta, direta, foco em Pix imediato e adição rápida à sacola.
  - Se avgPriceCents >= 50000 (alto ticket): use copy consultiva, destaque especificações técnicas, confiança e atendimento pelo WhatsApp.
</skill_01_entender_o_negocio>

<skill_02_escolher_a_experiencia>
- Escolha UMA experiência interativa principal concreta que resolva uma decisão real do visitante usando SKUs/preços reais do catálogo.
- Define "experienceMode": "quiz_recommendation" | "dosage_calculator" | "bundle_builder" e "recommendedSkus": lista de SKUs reais do catálogo.
- Avalie pela pergunta: "Que ação interessante o visitante consegue realizar aqui e o que ele recebe depois?"
- Evite frases vagas ("experiência inteligente/personalizada"); mostre utilidade prática no componente InteractiveExperience.
</skill_02_escolher_a_experiencia>

<skill_03_especificar_controles_e_estados>
- Em InteractiveExperience, use entre 1 e 5 átomos reais dentre:
  1. tabs_selector: { id, atomType:"tabs_selector", stateKey, label, options:[{ value, label, skuRef?, priceCents?, priceDeltaCents?, note? }] }
  2. option_cards: { id, atomType:"option_cards", stateKey, label, options:[{ value, label, skuRef?, priceCents?, priceDeltaCents?, note? }] }
  3. checklist_addons: { id, atomType:"checklist_addons", stateKey, label, options:[{ value, label, skuRef?, priceCents?, priceDeltaCents?, note? }] }
  4. slider_range: { id, atomType:"slider_range", stateKey, label, min, max, step, unitLabel, pricePerUnitCents, skuRef? }
  5. slot_time_picker: { id, atomType:"slot_time_picker", stateKey, label, slots:["Manhã 09h","Tarde 14h",...] }
- Cada option que referencia item do catálogo DEVE informar o "skuRef" exato da lista de SKUs fornecida e o priceCents real do item!
- Define "stateDefaults", "calcRule": { mode: "base_plus_addons"|"sum_selected"|"per_unit_slider"|"schedule_summary", pixDiscountPercent: ${pixDiscountPercent}, summaryTitle, limitNote }, e "primaryAction": { type:"cart.add_selected"|"whatsapp.send_summary", label }.
</skill_03_especificar_controles_e_estados>

<skill_04_direcao_visual_e_imagens>
- Monte ATÉ 7 seções principais em "sections[]" seguindo a REGRA DE ORDENAÇÃO GOAL-DRIVEN:
  - Se modeloDeVenda === "servicos" e <= 6 itens: abra com HeroSection -> DifferentialsStrip -> InteractiveExperience -> CatalogGrid -> ContextualFaq -> ClosingScheduleSplit.
  - Se >= 12 produtos físicos: priorize HeroSection -> HighlightsGrid -> ComplementaryBundles -> CatalogGrid -> InteractiveExperience -> ContextualFaq -> ClosingScheduleSplit.
- REGRA OBRIGATÓRIA 390x844 FOLD BUDGET:
  - Em HeroSection: "title" DEVE ter no máximo 58 caracteres (<= 58 chars) e "subtitle" no máximo 115 caracteres (<= 115 chars) para que título, foto e CTA caibam na primeira dobra mobile de 390x844px!
- Defina no topo do documento:
  - "visualDirection": "editorial_light" | "luxury_dark" | "vibrant_retail" | "clean_craft"
  - "layoutGrid": "bento_asymmetric" | "editorial_split" | "compact_dense"
  - "artDirectionBible": { "lighting": "...", "surfaceMaterial": "...", "backdropTone": "...", "cameraFraming": "..." }
- Tipos permitidos de seção em "sections[]":
  - HeroSection (imageSlotId opcional) { variant:"split"|"full_bleed", eyebrow, title (<=58 chars), subtitle (<=115 chars), primaryCta:{label,href}, secondaryCta?:{label,action:"whatsapp.send_summary"|"scroll"} }
  - DifferentialsStrip { items:[{ icon (use apenas ${WHITELISTED_ICONS.slice(0, 12).join('|')}), title, text }] }
  - InteractiveExperience (imageSlotId opcional) { eyebrow, title, subtitle, experienceMode:"quiz_recommendation"|"dosage_calculator"|"bundle_builder", recommendedSkus:string[], layoutVariant:"workbench_split"|"stacked_cards"|"compact_panel", stateDefaults, controls, calcRule, primaryAction, secondaryAction? }
  - ComplementaryBundles { title:"Combine e Economize", subtitle, items:[{ title, description, skuIds:string[] }] }
  - ContextualFaq { title:"Perguntas Frequentes", subtitle, items:[{ q, a }] } (cite APENAS address, hours, pixDiscountPercent e shipping reais)
  - EditorialMediaSplit (imageSlotId opcional) { variant:"media_left"|"media_right", eyebrow, title, body, bullets[], ctaLabel?, ctaHref? }
  - StepsTimeline { title, subtitle, tabs:[{ id, label, steps:[{ time, title, detail }] }] }
  - HighlightsGrid { title, subtitle, columns:2|3, cards:[{ eyebrow, title, description, ctaLabel, href, imageSlotId? }] }
  - FaqAccordion { title, items:[{ q, a }] }
  - CatalogGrid { title, subtitle, itemActionLabel, emptyImageMode:"neutral_gray" }
  - ClosingScheduleSplit (imageSlotId opcional) { eyebrow, title, subtitle, slots[], whatsappHeading, whatsappSubtext, ctaLabel }
  - RichFooter { tagline, showNewsletter:true }
- Planeje "imagePlan[]" com NO MÁXIMO 5 imagens editoriais (hero, ambientação, ilustração da experiência).
- REGRA CRÍTICA DE ECONOMIA E FIDELIDADE:
  - NUNCA coloque produtos individuais do catálogo (SKUs) em "imagePlan[]"! Itens do catálogo sem foto ficam em cinza neutro no CatalogGrid para busca gratuita posterior.
  - Se o lojista JÁ enviou Logo (${hasUserLogo ? 'SIM — JÁ ENVIADA' : wantsAiLogo ? 'NÃO — pediu emblema minimalista' : 'NÃO enviou'}), NÃO gere "brand_logo" no imagePlan${hasUserLogo ? ' em hipótese alguma' : wantsAiLogo ? ' (opcional apenas 1 slot brand_logo se sobrar espaço)' : ''}.
  - Se o lojista JÁ enviou Foto da Frente da Loja (${hasUserStorefront ? 'SIM — JÁ ENVIADA' : 'NÃO'}), NÃO gere imagem de fachada em "imagePlan[]".
  - Cada item do imagePlan: { slotId, targetSectionId, role: "hero"|"section_illustration"|"lifestyle_banner"|"detail_card"|"brand_logo", tier: "flux-dev"|"flux-schnell", aspect: "16:9"|"4:3"|"1:1", promptEn: "descrição fotorrealista em inglês coerente com o negócio real, sem texto legível sobreposto" }.
</skill_04_direcao_visual_e_imagens>

<constraints>
- Idioma de toda a interface: Português do Brasil natural, claro e específico para o negócio informado.
- NUNCA mencionar nomes, categorias, frases ou termos de outros nichos que não pertençam a este catálogo.
- Toda seção com "imageSlotId" que espera imagem gerada deve ter o slotId correspondente presente em "imagePlan[]".
</constraints>`;

  const userPrompt = JSON.stringify({
    entradas: {
      nomeDaLoja: storeName,
      segmento: segment,
      modeloDeVenda: businessModel,
      descricaoDoNegocio: description || `${storeName} (${segment})`,
      diferenciaisConfirmados: differentials,
      experienciaDesejadaPeloLojista: experienceGoal || 'Ajudar o cliente a simular ou montar seu pedido com clareza antes de fechar.',
      campanhaAtual: campaignTheme || 'Sem campanha sazonal',
      corPrincipalHex: primaryColor,
      estiloFonte: fontStyle,
      pixDescontoPorcento: pixDiscountPercent,
      endereco: address || 'Atendimento sob consulta',
      horario: hours || 'Seg a Sáb · 09h às 18h',
      whatsappConfigurado: Boolean(whatsapp.phoneE164),
      usuarioJaEnviouLogo: hasUserLogo,
      usuarioPediuLogoMinimalistaIA: wantsAiLogo,
      usuarioJaEnviouFotoFrenteDaLoja: hasUserStorefront,
      itensDoCatalogo: skus,
    },
    formatoEsperadoJson: {
      version: FORMULA_V9_VERSION,
      analysis: {
        factsConfirmed: ['fato 1 do catálogo'],
        dependencies: ['o que depende de confirmação via WhatsApp'],
        mainExperienceSummary: 'Resumo claro da ação que o visitante executa e do resultado obtido.',
      },
      designTokens: deriveThemeTokensFromHex(primaryColor, fontStyle),
      imagePlan: [
        {
          slotId: 'hero_main',
          targetSectionId: 'sec_hero',
          role: 'hero',
          tier: 'flux-dev',
          aspect: '4:3',
          promptEn: 'Natural photorealistic editorial scene tailored strictly to the business above, warm daylight, no overlaid text',
        },
      ],
      sections: [
        { id: 'sec_hero', type: 'HeroSection', imageSlotId: 'hero_main', config: { variant: 'split', eyebrow: '...', title: '...', subtitle: '...', primaryCta: { label: '...', href: '#experiencia' } } },
        { id: 'sec_diff', type: 'DifferentialsStrip', config: { items: [{ icon: 'ShieldCheck', title: '...', text: '...' }] } },
        { id: 'sec_exp', type: 'InteractiveExperience', config: { eyebrow: '...', title: '...', subtitle: '...', layoutVariant: 'workbench_split', stateDefaults: {}, controls: [], calcRule: { mode: 'base_plus_addons', pixDiscountPercent, summaryTitle: '...', limitNote: '...' }, primaryAction: { type: 'cart.add_selected', label: 'Adicionar seleção à sacola' } } },
        { id: 'sec_cat', type: 'CatalogGrid', config: { title: 'Catálogo completo', subtitle: '...', itemActionLabel: 'Adicionar à sacola', emptyImageMode: 'neutral_gray' } },
        { id: 'sec_close', type: 'ClosingScheduleSplit', config: { eyebrow: 'Atendimento', title: '...', subtitle: '...', slots: [], whatsappHeading: '...', whatsappSubtext: '...', ctaLabel: 'Enviar no WhatsApp' } },
        { id: 'sec_footer', type: 'RichFooter', config: { tagline: '...', showNewsletter: false } },
      ],
    },
  });

  return { systemPrompt, userPrompt };
}

/**
 * Onboarding AI Autofill Prompt (`POST /api/onboarding/ai-autofill`) — ~500 tokens, 0 credits.
 */
export function buildDeterministicOnboardingAutofill({
  businessName = 'Minha Loja',
  segment = 'Geral',
  productsSample = [],
} = {}) {
  const items = Array.isArray(productsSample) ? productsSample : [];
  const hasService = items.some((p) => String(p?.itemType || '').includes('servico'));
  const hasPhysical = items.some((p) => !p?.itemType || p.itemType === 'produto_fisico');
  const businessModel = hasService && !hasPhysical ? 'servicos' : hasService && hasPhysical ? 'hibrido' : 'produtos';
  const categories = Array.from(
    new Set(items.map((p) => String(p?.category || p?.cat || '').trim()).filter(Boolean)),
  ).slice(0, 3);
  const segLower = String(segment || '').toLowerCase();
  const primaryColor = segLower.includes('pet') || segLower.includes('saúd') || segLower.includes('saud')
    ? '#2F6F4E'
    : segLower.includes('doc') || segLower.includes('caf') || segLower.includes('alim')
      ? '#B4532A'
      : '#0B4DB8';
  const safeName = String(businessName || 'Minha Loja').trim();
  const sampleNames = items.slice(0, 2).map((p) => String(p?.name || p?.nome || '').trim()).filter(Boolean);
  const desc = sampleNames.length > 0
    ? `${safeName} oferece ${sampleNames.join(' e ')} com pedido organizado e confirmação direta pelo WhatsApp.`
    : `${safeName} oferece atendimento ágil em ${segment} com escolha prática e pedido direto pelo WhatsApp.`;

  return {
    businessModel,
    businessDescription: desc.slice(0, 180),
    differentials: [
      'Atendimento rápido pelo WhatsApp',
      'Valores claros antes de finalizar',
      hasService ? 'Agendamento em horário combinado' : 'Entrega ou retirada combinada',
    ],
    conversionAction: businessModel === 'servicos' ? 'schedule_slot' : 'cart_add',
    experienceGoal:
      businessModel === 'servicos'
        ? `Escolher o atendimento ideal de ${safeName}, selecionar opções e enviar o pedido de horário no WhatsApp.`
        : `Selecionar itens do catálogo de ${safeName}, calcular valores na hora e enviar o pedido no WhatsApp.`,
    activeFilters: categories.length >= 2 ? categories : ['Mais pedidos', 'Novidades'],
    primaryColor,
    fontStyle: 'modern_sans',
    sofiaTone: 'proximo',
    sofiaRules: [
      'Responda com cordialidade usando apenas os valores oficiais cadastrados.',
      'Ao confirmar compra ou agendamento, peça nome e forma de pagamento ou horário.',
      'Encaminhe para humano em caso de desconto especial ou pedido fora do catálogo.',
    ],
  };
}

export function buildOnboardingAutofillMessages({
  businessName = '',
  segment = 'Geral',
  productsSample = [],
} = {}) {
  const safeSample = (Array.isArray(productsSample) ? productsSample : []).slice(0, 8).map((p) => ({
    nome: String(p?.name || p?.nome || '').slice(0, 60),
    cat: String(p?.category || p?.cat || 'Geral').slice(0, 32),
    preco: Number.isFinite(Number(p?.priceCents))
      ? (Number(p.priceCents) / 100).toFixed(2).replace('.', ',')
      : String(p?.preco || '0,00'),
    var: String(p?.variation || p?.var || 'Padrão').slice(0, 24),
  }));

  const systemPrompt = `Você preenche a configuração inicial de uma loja ou prestador de serviços no Brasil.
Retorne EXCLUSIVAMENTE 1 objeto JSON válido (sem markdown, sem explicações), em Português do Brasil, fiel ao negócio e ao catálogo informados.

Regras rígidas:
- "businessModel": escolha APENAS "produtos" | "servicos" | "hibrido".
- "businessDescription": 1 ou 2 frases objetivas (máx. 180 caracteres) explicando o que vende/faz com base real nas entradas.
- "differentials": exatamente 3 frases curtas (máx. 45 caracteres cada) coerentes com o ramo, sem inventar prêmios, notas ou certificações.
- "conversionAction": escolha APENAS "cart_add" | "schedule_slot" | "kit_builder" | "quote_request".
- "experienceGoal": 1 frase curta (máx. 140 caracteres) descrevendo a principal tarefa interativa útil que o visitante fará na página usando esse catálogo.
- "activeFilters": array com 2 a 3 rótulos curtos de filtro reais para esse catálogo (máx. 24 caracteres cada).
- "primaryColor": escolha 1 hex entre ["#0B4DB8","#2F6F4E","#B4532A","#0F172A","#6D28D9","#CA8A04"].
- "fontStyle": escolha APENAS "modern_sans" | "editorial_serif" | "clean_geometric".
- "sofiaTone": escolha APENAS "proximo" | "formal" | "direto".
- "sofiaRules": exatamente 3 regras curtas de atendimento no WhatsApp (máx. 90 caracteres cada), usando apenas fatos da loja.`;

  const userPrompt = JSON.stringify({
    nome: String(businessName || 'Minha Loja').trim().slice(0, 80),
    segmento: String(segment || 'Geral').trim().slice(0, 60),
    itensAmostra: safeSample,
    schema: {
      businessModel: 'produtos|servicos|hibrido',
      businessDescription: '...',
      differentials: ['...', '...', '...'],
      conversionAction: 'cart_add|schedule_slot|kit_builder|quote_request',
      experienceGoal: '...',
      activeFilters: ['...', '...'],
      primaryColor: '#0B4DB8',
      fontStyle: 'modern_sans|editorial_serif|clean_geometric',
      sofiaTone: 'proximo|formal|direto',
      sofiaRules: ['...', '...', '...'],
    },
  });

  return { systemPrompt, userPrompt };
}
