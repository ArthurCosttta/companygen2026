/**
 * Inteligência Semântica de Planilhas Multi-Nicho (DOC C03 + DOC C04 + DOC C05 + DOC C06)
 * Módulo puro compartilhado (ESM) entre servidor de planilhas, rotas WhatsApp/Storefront e React UI.
 */

function normText(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function detectExtendedCatalogColumns(headers = []) {
  const normalized = (headers || []).map(normText);
  const findCol = (patterns) => {
    for (const pat of patterns) {
      const idx = normalized.findIndex((h) => pat.test(h));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };

  return {
    durationCol: findCol([/\b(duracao|minutos|tempo atendimento|tempo sessao|tempo bancada)\b/]),
    returnDaysCol: findCol([/\b(retorno|intervalo dias|frequencia)\b/]),
    professionalCol: findCol([/\b(profissional|especialista|tecnico|medico|fisioterapeuta)\b/]),
    symptomOrNeedCol: findCol([/\b(sintoma|queixa|indicacao|para quem|beneficio|area|ambiente|modelo aparelho)\b/]),
    contraindicationCol: findCol([/\b(contraindicacao|restricao|alergenos|cuidados)\b/]),
    warrantyCol: findCol([/\b(garantia|peca original)\b/]),
    batchQtyCol: findCol([/\b(qtd minima|minimo|lote|faixa atacado|preco 10un|preco 50un)\b/]),
    bundleDiscountCol: findCol([/\b(desconto lote|economia kit|itens inclusos|desconto recorrente)\b/]),
    leadTimeCol: findCol([/\b(antecedencia|prazo entrega|janela retirada|dia entrega|diaria)\b/]),
    materialOrNotesCol: findCol([/\b(material|tecido|gramatura|notas sensoriais|massa|recheio|pedra|metal|madeira|kcal)\b/]),
    hotspotCol: findCol([/\b(detalhe ponto|pontos destaque|diferencial)\b/]),
    modalityOrPetCol: findCol([/\b(modalidade|porte pet|grade tamanhos|aro tamanho|serve pessoas|capacidade)\b/]),
  };
}

export function classifyBusinessArchetype({ segment = '', storeName = '', headers = [], products = [] } = {}) {
  const detectFromText = (rawText) => {
    const hay = normText(rawText);
    if (!hay) return null;

    if (/\b(farma|farmacia|drogaria|medicament|dipirona|paracetamol|ibuprofeno|amoxicilina|omeprazol|losartana|dorflex|neosaldina|comprimid|capsul|xarope|pomada|antisseptico|curativo|termometro|suplemento|vitamina|creatina|dermocosmet|fralda)\b/.test(hay) || /\b\d+\s?(mg|ml|mcg|ui)\b/.test(hay)) {
      return { archetype: 'farmacia_drogaria', nicheLabel: 'Farmácia & Drogaria', fontPairing: 'clean_humanist', displayVoice: 'plus_jakarta', bodyVoice: 'inter' };
    }
    if (/\b(fisio|clínic|clinica|odonto|psic|fisioterap|joelho|lombar|sessao|avaliacao clinica|consulta)\b/.test(hay)) {
      return { archetype: 'saude_clinica', nicheLabel: 'Saúde, Clínicas & Fisioterapia', fontPairing: 'editorial_serif', displayVoice: 'instrument_serif', bodyVoice: 'dm_sans' };
    }
    if (/\b(assistencia|bancada|iphone|oled|placa logica|celular|smartphone|notebook|reparo|defeito|peca original|carregador)\b/.test(hay)) {
      return { archetype: 'assistencia_tecnica', nicheLabel: 'Eletrônicos & Assistência Técnica', fontPairing: 'geometric_bold', displayVoice: 'archivo', bodyVoice: 'inter' };
    }
    if (/\b(bolo|confeitaria|doce|brigadeiro|padaria|fermentacao|encomenda|recheio|marmita|kcal|bistro|hamburguer|pizza|lanchonete)\b/.test(hay)) {
      return { archetype: 'gastronomia_encomendas', nicheLabel: 'Gastronomia, Confeitaria & Encomendas', fontPairing: 'editorial_serif', displayVoice: 'instrument_serif', bodyVoice: 'dm_sans' };
    }
    if (/\b(cafe|torra|moagem|espresso|coador|grao|vinho|emporio|notas sensoriais)\b/.test(hay)) {
      return { archetype: 'cafe_emporio', nicheLabel: 'Café Especial & Empório', fontPairing: 'geometric_bold', displayVoice: 'syne', bodyVoice: 'dm_sans' };
    }
    if (/\b(atacado|revenda|lote|preco 10un|preco 50un|pedido minimo|distribuidor)\b/.test(hay)) {
      return { archetype: 'atacado_b2b', nicheLabel: 'Atacado & B2B por Volume', fontPairing: 'geometric_bold', displayVoice: 'archivo', bodyVoice: 'inter' };
    }
    if (/\b(camiseta|vestido|boné|bone|streetwear|colecao|tecido|gramatura|drop|moda|calcado)\b/.test(hay)) {
      return { archetype: 'moda_drops', nicheLabel: 'Moda, Streetwear & Acessórios', fontPairing: 'geometric_bold', displayVoice: 'syne', bodyVoice: 'dm_sans' };
    }
    if (/\b(pet|cachorro|gato|banho e tosa|creche|racao|porte pet|veterinar)\b/.test(hay)) {
      return { archetype: 'pet_cuidados', nicheLabel: 'Petshop & Cuidados Animais', fontPairing: 'clean_humanist', displayVoice: 'fraunces', bodyVoice: 'plus_jakarta' };
    }
    if (/\b(estetica facial|botox|peeling|cabelo|barbearia|sobrancelha|depilacao)\b/.test(hay)) {
      return { archetype: 'estetica_beleza', nicheLabel: 'Estética, Cabelo & Barbearia', fontPairing: 'editorial_serif', displayVoice: 'instrument_serif', bodyVoice: 'dm_sans' };
    }
    if (/\b(vitrificacao|automotiv|polimento|higienizacao interna|detaling|oficina|veiculo)\b/.test(hay)) {
      return { archetype: 'estetica_automotiva', nicheLabel: 'Estética Automotiva & Oficina', fontPairing: 'geometric_bold', displayVoice: 'bricolage', bodyVoice: 'inter' };
    }
    if (/\b(marcenaria|planejado|arquitetura|mdf|madeira|m2|projeto sob medida)\b/.test(hay)) {
      return { archetype: 'arquitetura_marcenaria', nicheLabel: 'Arquitetura & Sob Medida', fontPairing: 'editorial_serif', displayVoice: 'instrument_serif', bodyVoice: 'dm_sans' };
    }
    if (/\b(joia|prata|ouro|anel|aro|gravacao|alianca|pedra)\b/.test(hay)) {
      return { archetype: 'joalheria_artesanal', nicheLabel: 'Joalheria & Peças Autorais', fontPairing: 'editorial_serif', displayVoice: 'instrument_serif', bodyVoice: 'dm_sans' };
    }
    if (/\b(pilates|academia|curso|mentoria|turma|aula|diaria|locacao|evento)\b/.test(hay)) {
      return /\b(diaria|locacao|evento|caucao)\b/.test(hay)
        ? { archetype: 'locacao_eventos', nicheLabel: 'Locação & Eventos', fontPairing: 'clean_humanist', displayVoice: 'bricolage', bodyVoice: 'dm_sans' }
        : { archetype: 'educacao_mentorias', nicheLabel: 'Educação, Aulas & Turmas', fontPairing: 'clean_humanist', displayVoice: 'bricolage', bodyVoice: 'dm_sans' };
    }
    return null;
  };

  // Produtos reais + nome da loja + cabeçalhos têm prioridade absoluta sobre qualquer segmento antigo em cache
  const catalogEvidenceText = [
    storeName,
    ...(headers || []),
    ...(products || []).slice(0, 20).map((p) => `${p?.name || ''} ${p?.category || ''} ${p?.description || ''}`),
  ].join(' ');
  const fromCatalog = detectFromText(catalogEvidenceText);
  if (fromCatalog) return fromCatalog;

  const fromSegment = detectFromText(segment);
  if (fromSegment) return fromSegment;

  return {
    archetype: 'varejo_geral',
    nicheLabel: segment || 'Comércio & Catálogo Direto',
    fontPairing: 'clean_humanist',
    displayVoice: 'bricolage',
    bodyVoice: 'dm_sans',
  };
}

export function extractSpreadsheetSignals({
  headers = [],
  rows = [],
  products = [],
  business = {},
  extraSheets = [],
} = {}) {
  const extendedCols = detectExtendedCatalogColumns(headers);
  const meta = classifyBusinessArchetype({
    segment: business?.segment || '',
    storeName: business?.name || '',
    headers,
    products,
  });

  const activeProducts = (Array.isArray(products) ? products : []).filter((p) => p && p.active !== false);
  const serviceCount = activeProducts.filter((p) => p.itemType === 'service').length;
  const hasServices = serviceCount > 0;
  const allHavePhotos =
    activeProducts.length > 0 &&
    activeProducts.every((p) => typeof p.imageUrl === 'string' && p.imageUrl.trim().length > 0);
  const fewFlagshipItems = activeProducts.length > 0 && activeProducts.length <= 6;

  const detectedSignals = [];
  if (extendedCols.durationCol || hasServices) detectedSignals.push('has_duration_or_service');
  if (extendedCols.symptomOrNeedCol) detectedSignals.push('has_symptom_or_need');
  if (extendedCols.warrantyCol) detectedSignals.push('has_warranty_trust');
  if (extendedCols.batchQtyCol || extendedCols.bundleDiscountCol) detectedSignals.push('has_bundle_or_wholesale');
  if (extendedCols.leadTimeCol) detectedSignals.push('has_leadtime_or_schedule');
  if (extendedCols.materialOrNotesCol || extendedCols.hotspotCol) detectedSignals.push('has_material_or_hotspot_detail');
  if (Array.isArray(extraSheets) && extraSheets.some((s) => /equipe|especialista/i.test(String(s?.name || '')))) {
    detectedSignals.push('has_specialists_sheet');
  }
  if (fewFlagshipItems) detectedSignals.push('focused_curated_catalog');
  if (allHavePhotos) detectedSignals.push('all_skus_already_photographed');

  // Seleção modular de componentes baseada nos dados (sem copiar templates fechados)
  const recommendedComponents = [];
  const defaultHeroAlignment =
    fewFlagshipItems ||
    meta.archetype === 'moda_drops' ||
    meta.archetype === 'joalheria_artesanal' ||
    meta.archetype === 'arquitetura_marcenaria'
      ? 'center'
      : 'left';
  const defaultTypoScale =
    meta.archetype === 'moda_drops' || meta.archetype === 'cafe_emporio'
      ? 'poster_mega'
      : defaultHeroAlignment === 'center'
        ? 'editorial_xxl'
        : 'refined_lg';

  recommendedComponents.push(defaultHeroAlignment === 'center' ? 'hero_centered' : 'hero_split');

  if (meta.archetype === 'saude_clinica' || meta.archetype === 'assistencia_tecnica' || detectedSignals.includes('has_symptom_or_need')) {
    recommendedComponents.push('clinic_symptom_map');
  }
  if (detectedSignals.includes('has_material_or_hotspot_detail') || meta.archetype === 'gastronomia_encomendas' || meta.archetype === 'joalheria_artesanal') {
    recommendedComponents.push('interactive_image_text_stage');
  }
  if (detectedSignals.includes('has_bundle_or_wholesale') || activeProducts.length >= 3) {
    recommendedComponents.push('bundle_builder_calculator');
  }
  if (
    detectedSignals.includes('has_leadtime_or_schedule') ||
    detectedSignals.includes('has_duration_or_service') ||
    hasServices ||
    meta.archetype === 'educacao_mentorias' ||
    meta.archetype === 'locacao_eventos'
  ) {
    recommendedComponents.push('calendar_delivery_slots');
  }
  if (meta.archetype === 'saude_clinica' || detectedSignals.includes('has_warranty_trust')) {
    recommendedComponents.push('clinic_case_scoreboard');
  }
  recommendedComponents.push('catalog_full_grid');

  // Plano contextual de imagens (respeita fotos existentes primeiro)
  const mediaStyleLock =
    meta.archetype === 'gastronomia_encomendas' || meta.archetype === 'cafe_emporio'
      ? 'warm_editorial_studio_photography'
      : meta.archetype === 'moda_drops' || meta.archetype === 'joalheria_artesanal'
        ? 'clean_gallery_minimal_editorial'
        : 'natural_daylight_authentic_scene';

  const imagePlanBlueprint = [];
  imagePlanBlueprint.push({
    slotId: 'hero',
    moldeId: defaultHeroAlignment === 'center' ? 'editorial_clean_split' : 'service_environment_wide',
    reason: 'Abertura principal da página combinando alinhamento e estilo único da marca',
    required: true,
  });
  if (recommendedComponents.includes('interactive_image_text_stage')) {
    imagePlanBlueprint.push({
      slotId: 'hotspot_stage',
      moldeId: 'product_macro_detail',
      reason: 'Foto nítida de detalhe para posicionar pinos explicativos sobre atributos reais da planilha',
      required: true,
    });
  }
  if (!allHavePhotos) {
    imagePlanBlueprint.push({
      slotId: 'catalog_studio_fallback',
      moldeId: 'catalog_neutral_studio',
      reason: 'Uniformização de fundo neutro para itens da planilha sem foto enviada',
      required: false,
    });
  }

  return {
    archetype: meta.archetype,
    nicheLabel: meta.nicheLabel,
    detectedSignals,
    extendedColumnsMatched: extendedCols,
    recommendedAlignments: {
      defaultHeroAlignment,
      defaultTypoScale,
      displayVoice: meta.displayVoice,
      bodyVoice: meta.bodyVoice,
      fontPairing: meta.fontPairing,
    },
    recommendedComponents: Array.from(new Set(recommendedComponents)),
    mediaStyleLock,
    imagePlanBlueprint,
    rowCount: Array.isArray(rows) ? rows.length : activeProducts.length,
  };
}

/**
 * Gera recomendações personalizadas de novas telas / subpáginas para aquele negócio específico,
 * sem expor nomes de templates internos ou jargões de marketing.
 */
export function buildRecommendedPagesForProfile(profile = {}) {
  const products = Array.isArray(profile?.catalog?.products) ? profile.catalog.products : [];
  const signals = extractSpreadsheetSignals({
    products,
    business: profile?.business || {},
  });

  const byArchetype = {
    saude_clinica: [
      {
        id: 'rec_primeira_avaliacao',
        slug: 'primeira-consulta',
        campaignTheme: 'consultorio',
        title: 'Primeira Consulta & Diagnóstico',
        summary: 'Explica como funciona a avaliação inicial, mapa de queixas e valores sem surpresa.',
        baseCostCredits: 5,
        recommendedComponents: ['clinic_editorial_hero', 'clinic_symptom_map', 'clinic_pricing_tiers'],
      },
      {
        id: 'rec_protocolos_retorno',
        slug: 'protocolos',
        campaignTheme: 'evergreen',
        title: 'Programas e Evolução de Resultados',
        summary: 'Apresenta pacotes de sessões com acompanhamento numérico de evolução.',
        baseCostCredits: 3,
        recommendedComponents: ['clinic_case_scoreboard', 'bundle_builder_calculator', 'calendar_delivery_slots'],
      },
      {
        id: 'rec_especialistas',
        slug: 'equipe',
        campaignTheme: 'consultorio',
        title: 'Especialistas & Agendamento',
        summary: 'Apresentação da equipe clínica e horários disponíveis para marcação.',
        baseCostCredits: 3,
        recommendedComponents: ['clinic_specialists_deck', 'calendar_delivery_slots'],
      },
    ],
    gastronomia_encomendas: [
      {
        id: 'rec_encomendas_data',
        slug: 'encomendas',
        campaignTheme: 'evergreen',
        title: 'Cardápio de Encomendas por Data',
        summary: 'Escolha de janela de retirada/entrega com antecedência real e pedido rápido.',
        baseCostCredits: 3,
        recommendedComponents: ['hero_centered', 'calendar_delivery_slots', 'catalog_full_grid'],
      },
      {
        id: 'rec_combos_festa',
        slug: 'combos-festa',
        campaignTheme: 'evergreen',
        title: 'Montador de Kits & Eventos',
        summary: 'Cliente combina itens do cardápio com desconto progressivo automático no Pix.',
        baseCostCredits: 3,
        recommendedComponents: ['interactive_image_text_stage', 'bundle_builder_calculator'],
      },
      {
        id: 'rec_temporada_presentes',
        slug: 'edicao-sazonal',
        campaignTheme: 'natal',
        title: 'Edição Especial de Presentes & Datas',
        summary: 'Seleção comemorativa com passe de vantagem e entrega em etapa programada.',
        baseCostCredits: 5,
        recommendedComponents: ['campaign_christmas_hero', 'campaign_christmas_checkpoints', 'calendar_delivery_slots'],
      },
    ],
    assistencia_tecnica: [
      {
        id: 'rec_orcamento_sintoma',
        slug: 'diagnostico',
        campaignTheme: 'consultorio',
        title: 'Orçamento Rápido por Defeito',
        summary: 'Cliente seleciona aparelho/sintoma, vê garantia de bancada e agenda entrega.',
        baseCostCredits: 5,
        recommendedComponents: ['clinic_symptom_map', 'clinic_case_scoreboard', 'calendar_delivery_slots'],
      },
      {
        id: 'rec_revisao_lote',
        slug: 'revisao-expressa',
        campaignTheme: 'black_friday',
        title: 'Campanha Revisão & Manutenção',
        summary: 'Pacotes fechados de manutenção com vaga limitada por dia e envio prioritário.',
        baseCostCredits: 5,
        recommendedComponents: ['campaign_blackfriday_hero', 'campaign_blackfriday_drop', 'campaign_blackfriday_terms'],
      },
    ],
    moda_drops: [
      {
        id: 'rec_lookbook_detalhes',
        slug: 'materiais-detalhes',
        campaignTheme: 'evergreen',
        title: 'Tecido, Caimento & Detalhes da Peça',
        summary: 'Foto central com pinos clicáveis explicando costura, gramatura e guia de uso.',
        baseCostCredits: 3,
        recommendedComponents: ['hero_centered', 'interactive_image_text_stage', 'catalog_full_grid'],
      },
      {
        id: 'rec_lancamento_drop',
        slug: 'lancamento',
        campaignTheme: 'black_friday',
        title: 'Página de Lançamento & Lote Limitado',
        summary: 'Abertura com display grande centralizado, contagem de horário e regras de envio.',
        baseCostCredits: 5,
        recommendedComponents: ['campaign_blackfriday_hero', 'campaign_blackfriday_drop', 'campaign_blackfriday_terms'],
      },
      {
        id: 'rec_presentes_loja',
        slug: 'kits-presente',
        campaignTheme: 'natal',
        title: 'Kits Presenteáveis & Combos',
        summary: 'Montador de peças combinadas com vantagem escalonada e vale-presente.',
        baseCostCredits: 3,
        recommendedComponents: ['bundle_builder_calculator', 'scratch_reward'],
      },
    ],
  };

  const specific = byArchetype[signals.archetype] || [
    {
      id: 'rec_destaque_central',
      slug: 'destaque',
      campaignTheme: 'evergreen',
      title: 'Página Editorial com Detalhes na Foto',
      summary: 'Título centralizado grande, foto explicada por pontos e montador de combo.',
      baseCostCredits: 3,
      recommendedComponents: ['hero_centered', 'interactive_image_text_stage', 'bundle_builder_calculator'],
    },
    {
      id: 'rec_agenda_encomenda',
      slug: 'agendamento',
      campaignTheme: 'evergreen',
      title: 'Reserva de Horários & Encomendas',
      summary: 'Cliente escolhe turno/data disponível e envia pedido pronto pelo WhatsApp.',
      baseCostCredits: 3,
      recommendedComponents: ['calendar_delivery_slots', 'catalog_full_grid'],
    },
    {
      id: 'rec_campanha_promocional',
      slug: 'oferta-especial',
      campaignTheme: 'black_friday',
      title: 'Campanha de Lote ou Liquidação',
      summary: 'Página de conversão direta com oferta principal, regras claras e contagem.',
      baseCostCredits: 5,
      recommendedComponents: ['campaign_blackfriday_hero', 'campaign_blackfriday_drop', 'campaign_blackfriday_terms'],
    },
  ];

  return {
    archetype: signals.archetype,
    nicheLabel: signals.nicheLabel,
    recommendedAlignments: signals.recommendedAlignments,
    pages: [
      ...specific,
      {
        id: 'rec_sazonal_custom',
        slug: 'colecao-especial',
        campaignTheme: 'natal',
        title: 'Campanha Sazonal / Datas Especiais',
        summary: 'Seleção comemorativa com cupom interativo e entregas em etapas.',
        baseCostCredits: 5,
        recommendedComponents: ['campaign_christmas_hero', 'campaign_christmas_checkpoints'],
      },
    ],
  };
}

/**
 * Gera Fluxos-Molde de Mensagens WhatsApp derivados da planilha e arquétipo (DOC C05).
 */
export function buildWorkspaceWhatsappFlows({ profile = {}, focus = 'geral', existingTitles = [] } = {}) {
  const storeName = String(profile?.business?.name || 'Nossa Loja').trim();
  const pixKey = String(profile?.payment?.pixKey || '{chave_pix}').trim() || '{chave_pix}';
  const products = Array.isArray(profile?.catalog?.products) ? profile.catalog.products.filter((p) => p && p.active !== false) : [];
  const flagship = products[0];
  const second = products[1] || flagship;
  const signals = extractSpreadsheetSignals({ products, business: profile?.business || {} });
  const priceText = flagship?.priceCents
    ? `R$ ${(Number(flagship.priceCents) / 100).toFixed(2).replace('.', ',')}`
    : '{PRECO}';

  const baseFlows = [
    {
      id: 'flow_boas_vindas_triagem',
      title: 'Boas-vindas & Direcionamento Inicial',
      intentTag: 'greeting_triage',
      status: 'approved',
      enabledInBot: true,
      sampleCustomerTrigger: 'Oi, gostaria de saber como funciona e ver opções.',
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Abertura direta',
          body: `Olá! Aqui é o atendimento da ${storeName}. Posso te ajudar com ${flagship?.name || 'nosso catálogo'} (${priceText}) ou mostrar todas as opções da nossa vitrine.`,
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Próximo passo',
          body:
            signals.detectedSignals.includes('has_duration_or_service')
              ? 'Para agendar ou tirar dúvidas, me diga qual dia/turno prefere ou qual sintoma/objetivo você busca.'
              : 'Você prefere receber em qual bairro ou retirar direto conosco?',
        },
      ],
    },
    {
      id: 'flow_orcamento_pix_combo',
      title: 'Orçamento Rápido + Vantagem no Pix',
      intentTag: 'bundle_pix_quote',
      status: 'pending_review',
      enabledInBot: true,
      sampleCustomerTrigger: `Quanto fica ${flagship?.name || 'o item principal'} e tem desconto à vista?`,
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Valor confirmado',
          body: `${flagship?.name || 'O item escolhido'} sai por ${priceText}. ${second && second.id !== flagship?.id ? `Combinando com ${second.name} no mesmo pedido você libera desconto progressivo de kit.` : 'Pagando no Pix você já garante prioridade na separação.'}`,
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Fechamento Pix',
          body: `Se quiser fechar agora, nossa chave Pix é ${pixKey}. Assim que mandar o comprovante por aqui, já confirmamos.`,
        },
      ],
    },
    {
      id: 'flow_janela_agenda_prazo',
      title: signals.detectedSignals.includes('has_duration_or_service') ? 'Confirmação de Horário & Preparo' : 'Prazo de Entrega & Janela de Envio',
      intentTag: 'schedule_window',
      status: 'pending_review',
      enabledInBot: true,
      sampleCustomerTrigger: 'Para quando vocês conseguem entregar ou atender?',
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Disponibilidade real',
          body:
            signals.detectedSignals.includes('has_duration_or_service')
              ? `Temos horários disponíveis de segunda a sábado para ${flagship?.name || 'atendimento'}. Confirmamos a vaga assim que você escolher o turno.`
              : `Trabalhamos com janelas agendadas de entrega e retirada para garantir qualidade. Para hoje ainda temos horários abertos na janela da tarde.`,
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Confirmação',
          body: 'Qual turno funciona melhor para você (manhã 09h-12h ou tarde 14h-18h)?',
        },
      ],
    },
    {
      id: 'flow_pos_venda_rastreio',
      title: 'Pós-Venda, Retorno & Acompanhamento',
      intentTag: 'post_sale_followup',
      status: 'pending_review',
      enabledInBot: true,
      sampleCustomerTrigger: 'Já paguei / quero acompanhar meu pedido.',
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Confirmação imediata',
          body: 'Recebemos seu comprovante! Seu pedido #{numero_pedido} já entrou na fila de preparo da equipe.',
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Acompanhamento',
          body: 'Assim que sair para entrega ou ficar pronto para retirada, te aviso por aqui com os detalhes.',
        },
      ],
    },
  ];

  const extraByFocus = [
    {
      id: `flow_objecao_preco_${Date.now().toString(36).slice(-4)}`,
      title: focus === 'objecao' ? 'Contorno de Dúvida sobre Valor & Garantia' : 'Sugestão de Complemento na Conversa',
      intentTag: focus === 'objecao' ? 'objection_handling' : 'smart_upsell',
      status: 'pending_review',
      enabledInBot: true,
      sampleCustomerTrigger: focus === 'objecao' ? 'Achei um pouco caro / tenho dúvida se resolve' : 'Tem algo para combinar junto?',
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Argumento real da loja',
          body:
            focus === 'objecao'
              ? `Entendo! Em ${storeName} trabalhamos com padrão completo em ${flagship?.name || 'cada atendimento'} e acompanhamento direto do início ao fim.`
              : `Quem leva ${flagship?.name || 'esse item'} costuma adicionar ${second?.name || 'uma opção complementar'} no mesmo frete/janela com vantagem no Pix.`,
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Chamada leve',
          body: 'Quer que eu já calcule o valor fechado das duas opções para você comparar sem compromisso?',
        },
      ],
    },
    {
      id: `flow_recuperacao_${Date.now().toString(36).slice(-4)}`,
      title: 'Retomada Leve após Orçamento sem Resposta',
      intentTag: 'gentle_recovery',
      status: 'pending_review',
      enabledInBot: true,
      sampleCustomerTrigger: '(Cliente visualizou orçamento há 2h e não respondeu)',
      steps: [
        {
          stepOrder: 1,
          role: 'assistant',
          label: 'Retomada sem pressão',
          body: `Oi! Passando só para saber se ficou alguma dúvida sobre ${flagship?.name || 'o seu orçamento'} na ${storeName}.`,
        },
        {
          stepOrder: 2,
          role: 'assistant',
          label: 'Facilidade de resposta',
          body: 'Se quiser reservar a janela de hoje, basta responder por aqui que já deixo separado para você.',
        },
      ],
    },
  ];

  const seen = new Set((existingTitles || []).map((t) => normText(t)));
  const candidatePool = focus === 'geral' ? baseFlows : [...extraByFocus, ...baseFlows];
  return candidatePool.filter((f) => !seen.has(normText(f.title)));
}
