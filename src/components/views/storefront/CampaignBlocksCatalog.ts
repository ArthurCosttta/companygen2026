export type CampaignThemeId = 'natal' | 'black_friday' | 'consultorio' | 'evergreen';

export interface CampaignComponentMeta {
  roleId: string;
  campaign: CampaignThemeId;
  name: string;
  sourceRef: 'Vert Club' | 'Northpaw' | 'Motion Physio';
  mechanicSummary: string;
  reusableUseCases: string[];
}

export const CAMPAIGN_COMPONENTS_CATALOG: CampaignComponentMeta[] = [
  // Campanha Natal / Fim de Ano (Vert Club)
  {
    roleId: 'campaign_christmas_hero',
    campaign: 'natal',
    name: 'Hero Natalino Moldura Tricô + Cupom Rasgável',
    sourceRef: 'Vert Club',
    mechanicSummary: 'Título massivo (~120px) emoldurado por borda SVG tricotada natalina, flip-clock dourado e ticket inclinado interativo para rasgar.',
    reusableUseCases: ['Abertura de campanha de Natal / Ano Novo', 'Coleção de inverno ou edição especial de presentes'],
  },
  {
    roleId: 'scratch_reward',
    campaign: 'natal',
    name: 'Ticket / Cupom Rasgável Interativo',
    sourceRef: 'Vert Club',
    mechanicSummary: 'Ficha inclinada em papel quadriculado com 4 ilhoses metálicos e tira listrada "Clique para rasgar", combinada ao relógio countdown.',
    reusableUseCases: ['Cupom de Natal / Ano Novo', 'Vale-presente na 1ª compra', 'Desconto relâmpago de frete'],
  },
  {
    roleId: 'campaign_christmas_checkpoints',
    campaign: 'natal',
    name: 'Trilha de Presentes com Checkpoints (CP 01..04)',
    sourceRef: 'Vert Club',
    mechanicSummary: 'Headline bicolor massiva, linhas topográficas SVG contínuas, linha tracejada com pinos CP e cards escalonados alternados.',
    reusableUseCases: ['Guia de presentes por faixa de preço', 'Etapas do kit de fim de ano', 'Jornada de encomendas sazonais'],
  },
  // Campanha Black Friday / Drops Relâmpago (Northpaw)
  {
    roleId: 'campaign_blackfriday_hero',
    campaign: 'black_friday',
    name: 'Hero Black Friday Gigante + Carimbo + Ticker Diagonal',
    sourceRef: 'Northpaw',
    mechanicSummary: 'Faixa hazard superior, display condensado gigante (Big Shoulders Display), carimbo vazado inclinado "-30%", flip-clock, lista VIP e ticker diagonal laranja.',
    reusableUseCases: ['Abertura de Black Friday / Liquidação Anual', 'Lançamento de drop com horário contado'],
  },
  {
    roleId: 'campaign_blackfriday_drop',
    campaign: 'black_friday',
    name: 'THE CARD: Drop 50/50 + Undercard 2 Colunas',
    sourceRef: 'Northpaw',
    mechanicSummary: 'Título gigante + split 50/50 vibrante/escuro com tabela de lote + 2 destaques inferiores com tarja diagonal "SAVE 25%".',
    reusableUseCases: ['Oferta âncora de Black Friday + 2 combos secundários', 'Lote limitado com estoque contado'],
  },
  {
    roleId: 'campaign_blackfriday_terms',
    campaign: 'black_friday',
    name: 'Faixa Técnica de Regras + Watermark Gigante',
    sourceRef: 'Northpaw',
    mechanicSummary: 'Faixa zebrada diagonal + 4 colunas em fonte mono (abertura, encerramento, lote e envio) + marca d’água gigante no rodapé.',
    reusableUseCases: ['Regras claras de promoção e troca', 'Política transparente de frete e lotes'],
  },
  {
    roleId: 'kinetic_ribbon',
    campaign: 'black_friday',
    name: 'Faixa Cinética de Ofertas Contínuas',
    sourceRef: 'Northpaw',
    mechanicSummary: 'Marquee infinito com pausa inteligente no hover destacando percentuais OFF, regras de envio e bônus Pix.',
    reusableUseCases: ['Tarja de Black Friday', 'Aviso de entrega no mesmo dia', 'Destaques de cupom'],
  },
  // Consultório / Clínica / Serviços Consultivos (Motion Physio)
  {
    roleId: 'clinic_editorial_hero',
    campaign: 'consultorio',
    name: 'Hero Editorial + Card Flutuante + Faixa 4 Passos',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Título Fraunces com sublinhado orgânico desenhado, foto com arco decorativo + card flutuante de avaliação e faixa 01..04 logo abaixo.',
    reusableUseCases: ['Clínica / Consultório / Estética', 'Serviço premium com diagnóstico inicial'],
  },
  {
    roleId: 'clinic_symptom_map',
    campaign: 'consultorio',
    name: 'Seletor Interativo com Silhueta Anatômica ("Onde dói?")',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Diagrama SVG anatômico contínuo com hotspots clicáveis, condições comuns em pills, checklist de tratamento e plano em 3 fases.',
    reusableUseCases: ['Clínica / Fisioterapia / Odontologia / Estética', 'Oficina ou Assistência Técnica por sintoma', 'Consultoria por necessidade'],
  },
  {
    roleId: 'clinic_specialists_deck',
    campaign: 'consultorio',
    name: 'Deck de Especialistas / Equipe (02)',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Retratos verticais 3:4 com badge de anos de experiência, citação sobre gradiente da foto, especialidades em pills e agendamento direto.',
    reusableUseCases: ['Corpo clínico / Equipe médica', 'Consultores / Advogados / Curadores da loja'],
  },
  {
    roleId: 'clinic_pricing_tiers',
    campaign: 'consultorio',
    name: 'Planos Numerados + Quadro de Garantias/Convênios (03)',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Card esquerdo escuro "Comece por aqui" + 2 planos claros à direita + quadro 2×2 de garantias, reembolso e regras transparentes.',
    reusableUseCases: ['Consultas e pacotes de acompanhamento', 'Planos mensais / recorrência', 'Combos Bom / Melhor / Premium'],
  },
  {
    roleId: 'clinic_case_scoreboard',
    campaign: 'consultorio',
    name: 'Placar de Evolução "Antes → Depois" em 3 Colunas (04)',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Métrica comparativa gigante em serif (ex.: 62% → 95%) seguida por Problema, Tratamento/Processo e Resultado mensurável.',
    reusableUseCases: ['Provas sociais clínicas / estéticas', 'Resultados de clientes / portfólio', 'Estudos de caso B2B'],
  },
  // Onda 2 — Co-Direcao Interativa Imagem+Texto, Combo & Agenda Sazonal (DOC 04 + DOC 09)
  {
    roleId: 'interactive_image_text_stage',
    campaign: 'evergreen',
    name: 'Palco Interativo Imagem + Texto com Hotspots',
    sourceRef: 'Northpaw',
    mechanicSummary: 'Pinos numerados clicáveis sobre a imagem com zoom focal suave sincronizado à coluna de texto e adição direta do SKU.',
    reusableUseCases: ['Detalhamento de kit/cesta ou hardware', 'Lookbook interativo', 'Guia visual de ingredientes ou componentes'],
  },
  {
    roleId: 'bundle_builder_calculator',
    campaign: 'natal',
    name: 'Montador de Combo Progressivo + Pix',
    sourceRef: 'Vert Club',
    mechanicSummary: 'Cliente escolhe 2 a 4 itens e destrava descontos progressivos (10%, 15%, 20% OFF + brinde) calculados em centavos exatos.',
    reusableUseCases: ['Cestas e kits de Natal', 'Combos Black Friday leve 3 pague menos', 'Pacotes personalizados'],
  },
  {
    roleId: 'calendar_delivery_slots',
    campaign: 'consultorio',
    name: 'Janela de Encomendas & Agendamento Real',
    sourceRef: 'Motion Physio',
    mechanicSummary: 'Seletor interativo de data e turno com vagas reais que já formata e envia reserva direta no WhatsApp.',
    reusableUseCases: ['Agendamento clínico/estético', 'Encomendas de confeitaria e ceias', 'Visitas técnicas com horário marcado'],
  },
];
