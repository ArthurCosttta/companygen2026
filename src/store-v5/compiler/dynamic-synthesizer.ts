import type { Site, Product, Category, Asset, AssetPrompt, Section } from './types';

/**
 * SOF GENOME — DYNAMIC STORE SYNTHESIZER
 * Recebe qualquer prompt em linguagem natural, imagens de referência e estilos estéticos.
 * Projeta uma experiência única, paleta de cores não-genérica e harmônica,
 * arquitetura com amplo espaço em branco (padrão editorial/Apple), catálogo sob medida e prompts fotográficos.
 */

export type SynthesisOptions = {
  referenceImage?: {
    name: string;
    dataUrl?: string;
    url?: string;
  };
  referenceColors?: {
    primary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  referenceStyle?: 'minimal-editorial' | 'nordic-pure' | 'dark-luxury' | 'warm-artisanal' | 'clean-biotech' | 'atelier-jewelry' | string;
  whitespaceMode?: 'generous' | 'standard';
};

export function synthesizeStoreFromPrompt(promptText: string, options?: SynthesisOptions): Site {
  const p = promptText.trim();
  const lower = p.toLowerCase();

  // 1. EXTRAÇÃO DE CONTAGEM DE PRODUTOS
  const countMatch = lower.match(/(\d+)\s*(produtos?|itens?|procedimentos?|serviços?|peças?)/);
  const requestedCount = countMatch ? Math.min(Math.max(parseInt(countMatch[1], 10), 3), 16) : 6;

  // 2. DETECÇÃO DE NICHO E ARQUÉTIPO SENSORIAL
  type NicheSpec = {
    segment: string;
    suggestedName: string;
    tagline: string;
    description: string;
    features: { title: string; description: string }[];
    primary: string;
    accent: string;
    background: string;
    text: string;
    radius: number;
    categories: string[];
    productTemplates: Array<{ name: string; desc: string; priceCents: number }>;
    hasBooking?: boolean;
    bookingTitle?: string;
    hasKitBuilder?: boolean;
    kitTitle?: string;
  };

  let niche: NicheSpec;

  if (/eletron|tech|celular|computador|gamer|audio|fone|gadget/i.test(lower)) {
    niche = {
      segment: 'Eletrônicos & Tecnologia',
      suggestedName: 'Volt & Tech Eletrônicos',
      tagline: 'Alta performance e inovação para o seu dia a dia.',
      description: 'Dispositivos inteligentes, áudio de alta definição, periféricos e acessórios premium com envio imediato.',
      features: [
        { title: 'Garantia de 1 Ano', description: 'Todos os produtos com suporte técnico e garantia oficial.' },
        { title: 'Desconto no Pix', description: '8% de desconto imediato para pagamentos à vista.' },
        { title: 'Envio Rápido', description: 'Despacho em até 24h com código de rastreamento.' }
      ],
      primary: '#0F172A',
      accent: '#0284C7',
      background: '#F8FAFC',
      text: '#0F172A',
      radius: 10,
      categories: ['Áudio & Som', 'Smart & Gadgets', 'Periféricos & Cabos'],
      productTemplates: [
        { name: 'Fone de Ouvido Bluetooth TWS Cancelamento Ativo', desc: 'Drivers de 12mm, cancelamento de ruído ANC e bateria para 32 horas totais.', priceCents: 18990 },
        { name: 'Smartwatch Ultra Pro GPS & Monitor Cardíaco', desc: 'Tela AMOLED de 1.9 polegadas, resistente à água e monitoramento esportivo avançado.', priceCents: 29900 },
        { name: 'Carregador Turbo 65W GaN 3 Portas USB-C', desc: 'Tecnologia GaN ultracompacta para notebook, tablet e celular simultaneamente.', priceCents: 13990 },
        { name: 'Caixa de Som Portátil Bluetooth À Prova D’água', desc: 'Som estéreo 360 graus com graves potentes e certificação IPX7.', priceCents: 21900 },
        { name: 'Teclado Mecânico Compacto RGB Switch Blue', desc: 'Layout 65%, switches táteis de alta durabilidade e iluminação personalizável.', priceCents: 24990 },
        { name: 'Mouse Gamer Sem Fio 16.000 DPI Ergonômico', desc: 'Sensor óptico de alta precisão, latência ultra baixa de 1ms e bateria recarregável.', priceCents: 15900 },
        { name: 'Hub Adaptador USB-C 8 em 1 com HDMI 4K', desc: 'Conectividade total com portas USB 3.0, leitor SD e saída de vídeo em alta definição.', priceCents: 17900 },
        { name: 'Power Bank 20.000mAh Carregamento Rápido 22.5W', desc: 'Carrega até 4 vezes o smartphone com visor digital de porcentagem de carga.', priceCents: 14990 },
        { name: 'Câmera de Segurança Inteligente Wi-Fi 360° Full HD', desc: 'Visão noturna infravermelha, detecção de movimento e áudio bidirecional.', priceCents: 19900 },
        { name: 'Ring Light 26cm com Tripé Articulado e Controle', desc: '3 temperaturas de cor e 10 níveis de brilho para criação de conteúdo e chamadas.', priceCents: 8990 },
        { name: 'Microfone Condensador USB com Braço Articulado', desc: 'Captação cardioide profissional para podcasts, streams e gravações de voz.', priceCents: 22900 },
        { name: 'Suporte Ergonômico em Alumínio para Notebook', desc: 'Ajuste de altura com 6 níveis, melhora a postura e refrigeração do equipamento.', priceCents: 7990 }
      ]
    };
  } else if (/barbearia|barba|cabelo|corte|degrad[eé]|navalha|grooming/i.test(lower)) {
    niche = {
      segment: 'Barbearia & Cuidados Masculinos',
      suggestedName: 'Barbearia Dom Corleone',
      tagline: 'Tradição, estilo e o corte impecável que você merece.',
      description: 'Atendimento com horário marcado, toalha quente, navalha afiada e linha exclusiva de pomadas e óleos.',
      features: [
        { title: 'Agendamento Direto', description: 'Reserve seu horário em segundos com confirmação no WhatsApp.' },
        { title: 'Toalha Quente & Ozônio', description: 'Relaxamento e cuidados especiais em todos os serviços de barba.' },
        { title: '10% OFF no Pix', description: 'Desconto especial em combos de corte e barba no pagamento à vista.' }
      ],
      primary: '#18181B',
      accent: '#D97706',
      background: '#FAFAFA',
      text: '#18181B',
      radius: 8,
      categories: ['Serviços & Cortes', 'Tratamentos de Barba', 'Produtos de Cuidado'],
      hasBooking: true,
      bookingTitle: 'Agende seu Atendimento',
      productTemplates: [
        { name: 'Corte Masculino Degradê com Acabamento na Navalha', desc: 'Corte moderno com tesoura e máquina, finalização com lâmina e penteado.', priceCents: 5500 },
        { name: 'Barba Terapia Tradicional com Toalha Quente', desc: 'Abertura de poros com toalha aquecida, óleo de barbear e bálsamo refrescante.', priceCents: 4500 },
        { name: 'Combo Completo Corte + Barba Terapia', desc: 'A experiência completa do cavalheiro com 10% de desconto no pacote.', priceCents: 9000 },
        { name: 'Pomada Modeladora Efeito Matte Fixação Forte', desc: 'Acabamento seco sem brilho, modelagem duradoura que não deixa resíduos.', priceCents: 4800 },
        { name: 'Óleo Nutritivo para Barba com Essência Amadeirada', desc: 'Amacia os fios, combate a coceira e perfuma suavemente com óleos naturais.', priceCents: 4200 },
        { name: 'Balm Multifuncional Calmante Pós-Barba', desc: 'Hidrata a pele, fecha os poros e previne foliculite e irritações pós-lâmina.', priceCents: 3800 },
        { name: 'Shampoo Especial para Cabelo e Barba Mentolado', desc: 'Limpeza profunda com sensação refrescante revigorante de hortelã.', priceCents: 3900 },
        { name: 'Pente de Madeira Antiestático para Barba', desc: 'Alinha os fios da barba sem quebrar ou eletrizar, cabe no bolso.', priceCents: 2500 }
      ]
    };
  } else if (/doce|bolo|confeit|torta|macaron|sobremesa|brigadeir/i.test(lower)) {
    niche = {
      segment: 'Confeitaria Artesanal & Doces Finos',
      suggestedName: 'Doceria Petit Caramelo',
      tagline: 'Momentos inesquecíveis em cada doce.',
      description: 'Bolos confeitados, caixas de brigadeiros gourmet e doces artesanais feitos com ingredientes nobres.',
      features: [
        { title: 'Produção Artesanal', description: 'Doces feitos no dia com chocolate nobre e frutas selecionadas.' },
        { title: 'Caixas Personalizadas', description: 'Monte a sua seleção de sabores com laço e cartão de presente.' },
        { title: 'Encomendas com Data', description: 'Agende a data e o horário exato da entrega para a sua festa.' }
      ],
      primary: '#831843',
      accent: '#DB2777',
      background: '#FFF1F2',
      text: '#1F2937',
      radius: 16,
      categories: ['Caixas de Doces', 'Bolos & Tortas', 'Presentes & Lembranças'],
      productTemplates: [
        { name: 'Caixa Degustação com 12 Brigadeiros Gourmet', desc: 'Escolha até 4 sabores entre pistache, belga, frutas vermelhas e caramelo flor de sal.', priceCents: 6500 },
        { name: 'Torta Red Velvet com Geleia de Frutas Vermelhas', desc: 'Massa aveludada, recheio de cream cheese leve e cobertura de frutas frescas.', priceCents: 12000 },
        { name: 'Box com 6 Macarons Franceses Artesanais', desc: 'Casquinha crocante e recheio cremoso nos sabores baunilha, framboesa e chocolate.', priceCents: 4800 },
        { name: 'Bolo Vulcão de Cenoura com Calda de Brigadeiro', desc: 'Bolo caseiro quentinho com cascata generosa de chocolate ao leite artesanal.', priceCents: 5800 },
        { name: 'Pote da Felicidade Ninho com Nutella', desc: 'Camadas generosas de creme ninho, nutella pura e morangos frescos.', priceCents: 2800 },
        { name: 'Copo Brownie Trufado com Caramelo Salgado', desc: 'Cubos de brownie molhadinho com ganache e calda artesanal de caramelo.', priceCents: 2600 }
      ]
    };
  } else if (/caf[eé]|torrefa|gr[aã]o|espresso|barista/i.test(lower)) {
    niche = {
      segment: 'Cafés Especiais & Torrefação',
      suggestedName: 'Torrefação Grão Raiz',
      tagline: 'O sabor da altitude na sua xícara.',
      description: 'Cafés de pequenos produtores com pontuação acima de 84 pontos, torrados artesanalmente em pequenos lotes.',
      features: [
        { title: 'Café 100% Arábica', description: 'Grãos selecionados com rastreabilidade da fazenda.' },
        { title: 'Moagem na Hora', description: 'Escolha para grão inteiro, prensa francesa, filtro ou espresso.' },
        { title: 'Frete Grátis Acima de R$ 150', description: 'Entrega rápida para você nunca ficar sem café fresco.' }
      ],
      primary: '#451A03',
      accent: '#B45309',
      background: '#FFFBEB',
      text: '#1C1917',
      radius: 12,
      categories: ['Grãos Especiais', 'Métodos de Extração', 'Kits & Degustação'],
      productTemplates: [
        { name: 'Café Especial Mogiana Paulista 250g (85 Pontos)', desc: 'Notas sensoriais de chocolate ao leite, caramelo e acidez cítrica suave.', priceCents: 3800 },
        { name: 'Café Especial Cerrado Mineiro 250g (86 Pontos)', desc: 'Corpo denso, finalização doce prolongada e notas de nozes e mel.', priceCents: 4200 },
        { name: 'Café Especial Chapada Diamantina 250g (88 Pontos)', desc: 'Floral delicado com notas de frutas amarelas e tangerina. Torra média clara.', priceCents: 4900 },
        { name: 'Prensa Francesa de Vidro Borossilicato 600ml', desc: 'Design elegante com filtro de aço inoxidável para extração encorpada.', priceCents: 9800 },
        { name: 'Moedor de Café Manual com Lâminas de Cerâmica', desc: 'Ajuste fino de moagem para garantir a granulometria perfeita em qualquer método.', priceCents: 12900 },
        { name: 'Caneca Térmica Inox Parede Dupla 350ml', desc: 'Mantém o café quente por até 4 horas sem esquentar a mão por fora.', priceCents: 6800 }
      ]
    };
  } else if (/suplement|nutri|vitamin|fitoter|manipula|sa[uú]de|farm[aá]cia/i.test(lower)) {
    niche = {
      segment: 'Suplementos & Nutracêuticos',
      suggestedName: 'Vitalis Nutracêuticos',
      tagline: 'Ciência, pureza e alta performance natural.',
      description: 'Fórmulas puras com ativos padronizados, certificação Anvisa e laudos de pureza lote a lote.',
      features: [
        { title: 'Laudo de Pureza', description: '100% das matérias-primas com testes de controle de qualidade.' },
        { title: 'Sem Açúcares e Glúten', description: 'Fórmulas limpas e biodisponíveis de alta absorção.' },
        { title: 'Orçamento para Lojistas', description: 'Condições e cotações especiais para compras no atacado.' }
      ],
      primary: '#065F46',
      accent: '#059669',
      background: '#F0FDF4',
      text: '#064E3B',
      radius: 10,
      categories: ['Performance & Foco', 'Imunidade & Longevidade', 'Lotes no Atacado'],
      productTemplates: [
        { name: 'Creatina Creapure 100% Pura Monohidratada 300g', desc: 'Matéria-prima de alta pureza sem sabor, rápida absorção para força e explosão.', priceCents: 9990 },
        { name: 'Whey Protein Isolado Grass-Fed 900g Baunilha', desc: '27g de proteína por dose, zero lactose, zero glúten com sabor natural suave.', priceCents: 17900 },
        { name: 'Multivitamínico Quelato Alta Biodisponibilidade 60 Caps', desc: 'Complexo completo de vitaminas A até Zinco com minerais quelatados.', priceCents: 6490 },
        { name: 'Ômega 3 TG Ultra Concentrado 1000mg 120 Caps', desc: 'Concentração elevada de EPA e DHA com certificação IFOS de pureza.', priceCents: 8900 },
        { name: 'Caixa Fechada com 12 Unidades de Creatina 300g (B2B)', desc: 'Lote econômico para revenda e farmácias com margem diferenciada.', priceCents: 84000 },
        { name: 'Caixa com 6 Unidades de Whey Isolado 900g (B2B)', desc: 'Kit de atacado para academias e lojas com desconto progressivo.', priceCents: 75000 }
      ]
    };
  } else {
    // NICHO GENÉRICO DINÂMICO
    const cleanWords = p.replace(/[^\w\sáéíóúâêîôûãõç]/gi, ' ').split(/\s+/).filter(w => w.length > 2);
    const mainTopic = cleanWords.slice(0, 3).join(' ') || 'Comércio & Serviços';
    const capitalizedTopic = mainTopic.charAt(0).toUpperCase() + mainTopic.slice(1);

    // Geração de paleta harmônica sofisticada e não-genérica
    let hash = 0;
    for (let i = 0; i < p.length; i++) hash = (hash << 5) - hash + p.charCodeAt(i);
    const hue = Math.abs(hash) % 360;

    const hslToHex = (h: number, s: number, l: number) => {
      l /= 100;
      const a = (s * Math.min(l, 1 - l)) / 100;
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
      };
      return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
    };

    // Fundo arejado e luminoso para máximo espaço em branco, tinta profunda e acento refinado
    const dynamicBg = hslToHex(hue, 12, 98);
    const dynamicPrimary = hslToHex(hue, 34, 18);
    const dynamicAccent = hslToHex((hue + 40) % 360, 52, 46);
    const dynamicText = hslToHex(hue, 26, 12);

    niche = {
      segment: capitalizedTopic,
      suggestedName: `Loja ${capitalizedTopic}`,
      tagline: 'Qualidade, variedade e atendimento de excelência.',
      description: `Soluções completas e produtos selecionados em ${capitalizedTopic} para você.`,
      features: [
        { title: 'Atendimento Personalizado', description: 'Tire suas dúvidas diretamente pelo WhatsApp antes de fechar.' },
        { title: 'Pagamento Facilitado', description: 'Desconto à vista no Pix ou parcelamento flexível.' },
        { title: 'Satisfação Garantida', description: 'Produtos testados e aprovados com total garantia.' }
      ],
      primary: dynamicPrimary,
      accent: dynamicAccent,
      background: dynamicBg,
      text: dynamicText,
      radius: 10,
      categories: ['Destaques', 'Mais Vendidos', 'Novidades'],
      productTemplates: [
        { name: `Produto Especial de ${capitalizedTopic} Mod. A`, desc: 'Alta qualidade e acabamento impecável para a sua necessidade diária.', priceCents: 8990 },
        { name: `Item Selecionado de ${capitalizedTopic} Mod. B`, desc: 'Desenvolvido com tecnologia de ponta para máxima durabilidade e praticidade.', priceCents: 12900 },
        { name: `Pacote Completo de ${capitalizedTopic} Mod. C`, desc: 'Kit promocional completo com os melhores componentes da linha.', priceCents: 19900 },
        { name: `Acessório de ${capitalizedTopic} Mod. D`, desc: 'Complemento ideal com design moderno e facilidade de uso.', priceCents: 5990 },
        { name: `Edição Premium de ${capitalizedTopic} Mod. E`, desc: 'Acabamento refinado para quem busca a melhor experiência do mercado.', priceCents: 24900 },
        { name: `Refil / Manutenção de ${capitalizedTopic} Mod. F`, desc: 'Peça de reposição ou recarga com total compatibilidade.', priceCents: 4500 }
      ]
    };
  }

  // 3. APLICAÇÃO DE ESTILO OU PALETA DE REFERÊNCIA (IMAGEM / OPÇÕES)
  if (options?.referenceStyle) {
    switch (options.referenceStyle) {
      case 'minimal-editorial':
        niche.primary = '#18181B';
        niche.accent = '#71717A';
        niche.background = '#FAF9F6';
        niche.text = '#18181B';
        niche.radius = 6;
        break;
      case 'nordic-pure':
        niche.primary = '#0F172A';
        niche.accent = '#0284C7';
        niche.background = '#F8FAFC';
        niche.text = '#0F172A';
        niche.radius = 8;
        break;
      case 'dark-luxury':
        niche.primary = '#1C1917';
        niche.accent = '#D97706';
        niche.background = '#FAF8F5';
        niche.text = '#1C1917';
        niche.radius = 6;
        break;
      case 'warm-artisanal':
        niche.primary = '#451A03';
        niche.accent = '#C26546';
        niche.background = '#FBF8F2';
        niche.text = '#28231D';
        niche.radius = 12;
        break;
      case 'clean-biotech':
        niche.primary = '#065F46';
        niche.accent = '#0D9488';
        niche.background = '#F8FAF8';
        niche.text = '#0A2518';
        niche.radius = 10;
        break;
      case 'atelier-jewelry':
        niche.primary = '#141414';
        niche.accent = '#C5A880';
        niche.background = '#FDFCFA';
        niche.text = '#141414';
        niche.radius = 4;
        break;
    }
  }

  if (options?.referenceColors) {
    if (options.referenceColors.primary) niche.primary = options.referenceColors.primary;
    if (options.referenceColors.accent) niche.accent = options.referenceColors.accent;
    if (options.referenceColors.background) niche.background = options.referenceColors.background;
    if (options.referenceColors.text) niche.text = options.referenceColors.text;
  }

  // 4. EXTRAÇÃO DO NOME DO NEGÓCIO
  let businessName = niche.suggestedName;
  const nameMatch = p.match(/para\s+(?:o|a|os|as)?\s*([A-ZÁÉÍÓÚÂÊÔÃÕ][\w\s&'-]{2,30})/);
  if (nameMatch && nameMatch[1]) {
    businessName = nameMatch[1].trim();
  }

  // 4. GERAÇÃO DOS PRODUTOS & ASSETS
  const products: Product[] = [];
  const assets: Asset[] = [];
  const promptsAssets: AssetPrompt[] = [];

  // Logo da Loja
  const logoAssetId = 'dyn-logo';
  assets.push({
    assetId: logoAssetId,
    kind: 'brand.logo',
    ownerRef: 'header',
    ratio: '1:1',
    status: 'needs_asset',
    alt: `Logo ${businessName}`,
    width: 512,
    height: 512
  });
  promptsAssets.push({
    assetId: logoAssetId,
    width: 512,
    height: 512,
    generationScope: 'official_upload',
    text: `Logotipo vetorial limpo e sofisticado para ${businessName} (${niche.segment}), design minimalista em fundo branco, alta legibilidade.`,
    negative: 'sem ruído, sem sombras complexas, sem elementos desfocados'
  });

  // Hero Banner da Loja
  const heroAssetId = 'dyn-hero';
  assets.push({
    assetId: heroAssetId,
    kind: 'hero.banner',
    ownerRef: 'hero',
    ratio: '16:9',
    status: 'needs_asset',
    alt: `Fachada ou cena conceitual de ${businessName}`,
    width: 1440,
    height: 810
  });
  promptsAssets.push({
    assetId: heroAssetId,
    width: 1440,
    height: 810,
    generationScope: 'full_scene',
    text: `Fotografia comercial cinematográfica de cena 16:9 para ${businessName} no segmento de ${niche.segment}. Iluminação acolhedora e estética profissional de estúdio.`,
    negative: 'sem artefatos borrados, sem texto ilegível na imagem, sem marcas d’água'
  });

  // Categorias
  const categories: Category[] = niche.categories.map((catName, idx) => {
    const catId = `cat-${idx + 1}`;
    const catAssetId = `dyn-cat-${idx + 1}`;
    assets.push({
      assetId: catAssetId,
      kind: 'category.tile',
      ownerRef: catId,
      ratio: '1:1',
      status: 'needs_asset',
      alt: `Categoria ${catName}`,
      width: 512,
      height: 512
    });
    promptsAssets.push({
      assetId: catAssetId,
      width: 512,
      height: 512,
      generationScope: 'cutout',
      text: `Fotografia representativa da categoria ${catName} para ${businessName}, composição visual limpa, estética harmonizada com ${niche.primary}.`,
      negative: 'sem distorção, sem fundo cinza'
    });
    return {
      id: catId,
      name: catName,
      assetId: catAssetId
    };
  });

  // Se tiver booking, adiciona o asset service.photo
  const bookingAssetId = 'dyn-booking-photo';
  if (niche.hasBooking) {
    assets.push({
      assetId: bookingAssetId,
      kind: 'service.photo',
      ownerRef: 'booking',
      ratio: '16:9',
      status: 'needs_asset',
      alt: `Espaço de atendimento ${businessName}`,
      width: 1440,
      height: 810
    });
    promptsAssets.push({
      assetId: bookingAssetId,
      width: 1440,
      height: 810,
      generationScope: 'full_scene',
      text: `Fotografia de ambiente acolhedor e profissional para ${businessName}, iluminação suave e foco nítido.`,
      negative: 'sem ruído, sem aberrações cromáticas'
    });
  }

  // Produtos: preenche até requestedCount
  for (let i = 0; i < requestedCount; i++) {
    const templateIdx = i % niche.productTemplates.length;
    const t = niche.productTemplates[templateIdx];
    const itemNumber = i + 1;
    const sku = `PROD-${String(itemNumber).padStart(2, '0')}`;
    const name = i < niche.productTemplates.length ? t.name : `${t.name} (Opção ${itemNumber})`;
    const cat = categories[i % categories.length];
    const assetId = `dyn-prod-${sku.toLowerCase()}`;

    assets.push({
      assetId,
      kind: 'product.cutout',
      ownerRef: sku,
      ratio: '1:1',
      status: 'needs_asset',
      alt: name,
      width: 512,
      height: 512
    });

    promptsAssets.push({
      assetId,
      width: 512,
      height: 512,
      generationScope: 'cutout',
      text: `Fotografia profissional de produto para ${name}. Isolado em fundo branco puro e limpo, sem sombras cortadas, lente 85mm f/2.8, iluminação de estúdio publicitário nítida e realista.`,
      negative: 'fundo cinza, fundo poluído, corte imperfeito, baixa resolução'
    });

    products.push({
      sku,
      name,
      description: t.desc,
      categoryId: cat.id,
      priceCents: t.priceCents,
      stock: 25 + (i * 3),
      media: [{ assetId, kind: 'product.cutout', status: 'needs_asset' }]
    });
  }

  // 5. SEÇÕES DE LAYOUT
  const sections: Section[] = [
    {
      id: 'header',
      type: 'header',
      assetId: logoAssetId,
      navItems: [
        { label: 'Início', target: 'hero' },
        { label: 'Produtos', target: 'catalog' },
        ...(niche.hasBooking ? [{ label: 'Agendamento', target: 'booking' }] : []),
        { label: 'Contato', target: 'contact' }
      ]
    },
    {
      id: 'hero',
      type: 'hero',
      title: businessName,
      eyebrow: niche.segment,
      description: niche.tagline,
      assetId: heroAssetId,
      cta: 'Conhecer produtos'
    },
    {
      id: 'features',
      type: 'features',
      title: 'Diferenciais da Nossa Loja',
      items: niche.features.map(f => ({ title: f.title, body: f.description }))
    },
    {
      id: 'categories',
      type: 'categoryTiles',
      title: 'Explore por Categoria'
    },
    {
      id: 'catalog',
      type: 'catalog',
      title: 'Catálogo de Produtos',
      description: `Conheça toda a nossa linha de ${niche.segment.toLowerCase()}.`
    }
  ];

  // Se tiver Agendamento (Booking)
  if (niche.hasBooking) {
    sections.push({
      id: 'booking',
      type: 'booking',
      variant: 'photoPanel',
      title: niche.bookingTitle || 'Agende seu Atendimento',
      description: 'Selecione o melhor dia e horário para o seu atendimento presencial.',
      cta: 'Confirmar horário',
      assetId: bookingAssetId,
      booking: {
        dateOptions: ['Hoje', 'Amanhã', 'Sábado', 'Próxima Terça'],
        timeOptions: ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30'],
        templateId: 'booking-interest'
      }
    });
  }

  // Seções Finais
  sections.push(
    {
      id: 'testimonials',
      type: 'testimonials',
      title: 'O que dizem nossos clientes',
      items: [
        { title: 'Excelente experiência', body: 'Atendimento impecável, produtos de primeira linha e entrega no prazo combinado.', author: 'Lucas M.' },
        { title: 'Super recomendo', body: 'Comprei com desconto no Pix e o suporte pelo WhatsApp tirou todas as minhas dúvidas.', author: 'Juliana S.' }
      ]
    },
    {
      id: 'cart',
      type: 'cart',
      title: 'Sua Sacola de Compras'
    },
    {
      id: 'footer',
      type: 'footer',
      title: businessName,
      description: niche.description
    }
  );

  // 6. MONTAGEM FINAL DO DOCUMENTO CANÔNICO (1.1.0)
  return {
    schemaVersion: '1.1.0',
    business: {
      name: businessName,
      segment: niche.segment,
      tagline: niche.tagline,
      description: niche.description,
      address: { city: 'São Paulo', state: 'SP' },
      features: niche.features
    },
    theme: {
      primary: niche.primary,
      accent: niche.accent,
      background: niche.background,
      text: niche.text,
      radius: niche.radius,
      fontFamily: options?.referenceStyle === 'atelier-jewelry' || /joia|luxo|alfaiat|atelier/i.test(lower) ? 'serif' : 'sans',
      tokens: {
        'color.primary': niche.primary,
        'color.accent': niche.accent,
        'color.surface': niche.background,
        'color.ink': niche.text,
        'space.unitPx': options?.whitespaceMode !== 'standard' ? 12 : 8,
        'radius.cardPx': niche.radius
      }
    },
    whatsapp: {
      phoneE164: '5511999998888',
      demoMode: false,
      recipientLabel: `${businessName} Atendimento Oficial`,
      defaultTemplateId: 'product-interest',
      checkoutTemplateId: 'cart-checkout',
      quoteTemplateId: 'quote-request',
      supportTemplateId: 'support'
    },
    categories,
    products,
    assets,
    prompts: {
      assets: promptsAssets
    },
    layout: {
      sections
    },
    messages: {
      templates: [
        {
          id: 'product-interest',
          text: `Olá, {{business.name}}! Tenho interesse em {{product.name}}, quantidade {{quantity}}, preço unitário {{unitPrice}}. Podem confirmar disponibilidade?`
        },
        {
          id: 'cart-checkout',
          text: `🛒 NOVO PEDIDO — {{business.name}}\nOlá! Gostaria de finalizar meu pedido.\n\n📦 Itens do carrinho:\n{{items}}\n\n💰 Total: {{total}}\n\nGostaria de confirmar a disponibilidade e prazo de envio.`
        },
        {
          id: 'quote-request',
          text: `📋 SOLICITAÇÃO DE COTAÇÃO — {{business.name}}\nOlá! Gostaria de uma cotação para os itens:\n\n{{items}}\n\nTotal estimado: {{total}}. Aguardo retorno.`
        },
        {
          id: 'support',
          text: `Olá, {{business.name}}! Gostaria de falar sobre {{subject}}.`
        },
        {
          id: 'booking-interest',
          text: `📅 *AGENDAMENTO — {{business.name}}*\nOlá! Quero agendar para {{pet.name}} na data {{booking.date}} às {{booking.time}}. Procedimento: {{service.name}}.`
        }
      ]
    },
    rules: {
      currency: 'BRL',
      quantityStep: 1,
      maxPerItem: 10,
      checkoutMode: 'whatsapp_link',
      shippingCents: 0,
      discountCents: 0
    }
  };
}
