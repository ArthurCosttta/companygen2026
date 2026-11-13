import type { BrandSpec } from '@/schemas/campaign.schema';
import type { Asset } from '@/compiler/types';

export interface GeneratedStoreTables {
  [sheetName: string]: any[][];
}

export interface ParsedItem {
  name: string;
  priceCents: number;
  category?: string;
  imagePath?: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  sublabel?: string;
  recommended?: boolean;
  data?: any;
}

export interface QuestionCard {
  id: string;
  title: string;
  description: string;
  type: 'single' | 'multiple';
  options: QuestionOption[];
}

export interface PromptAnalysisResult {
  niche: 'tech' | 'fashion' | 'fitness' | 'food' | 'lifestyle';
  detectedStoreName: string;
  questions: QuestionCard[];
}

export interface StoreCustomOptions {
  siteName?: string;
  pricingTier?: 'eco' | 'mid' | 'high';
  customProducts?: ParsedItem[];
  primaryColor?: string;
  offerText?: string;
}

/**
 * Question Analysis Engine:
 * Analyzes any free-form user prompt and produces structured interactive question cards
 * allowing the user to specify and refine product prices, SKUs, brand style, and offers.
 */
export function analyzePromptAndGenerateQuestions(promptText: string): PromptAnalysisResult {
  const text = promptText.trim();
  const lower = text.toLowerCase();

  // Detect niche
  let niche: 'tech' | 'fashion' | 'fitness' | 'food' | 'lifestyle' = 'lifestyle';
  if (lower.includes('eletr') || lower.includes('carregador') || lower.includes('cabo') || lower.includes('gadget') || lower.includes('fone') || lower.includes('tech') || lower.includes('gamer')) {
    niche = 'tech';
  } else if (lower.includes('moda') || lower.includes('roupa') || lower.includes('camisa') || lower.includes('tênis') || lower.includes('sneaker') || lower.includes('vestuário')) {
    niche = 'fashion';
  } else if (lower.includes('suplement') || lower.includes('whey') || lower.includes('creatina') || lower.includes('fit') || lower.includes('treino')) {
    niche = 'fitness';
  } else if (lower.includes('café') || lower.includes('cafe') || lower.includes('doce') || lower.includes('comida') || lower.includes('artesanal') || lower.includes('gourmet')) {
    niche = 'food';
  }

  // Detect or synthesize Store Name
  let detectedStoreName = '';
  const explicitName = text.match(/(?:chamad[ao]|marca|nome[:\s]+)\s*(?:de\s+)?["']?([A-Za-z0-9À-ÿ\s&'-]+?)["']?(?=\s+(?:com|de|para|que|focad)|$|[,\.])/i);
  if (explicitName && explicitName[1]) {
    detectedStoreName = explicitName[1].trim();
  }
  if (!detectedStoreName) {
    const lojaMatch = text.match(/loja\s+(?:de\s+)?([A-Za-z0-9À-ÿ\s&'-]+?)(?=\s+(?:com|para|que|focad|onde)|$|[,\.])/i);
    if (lojaMatch && lojaMatch[1]) {
      detectedStoreName = lojaMatch[1].trim();
    }
  }
  if (!detectedStoreName) {
    detectedStoreName = '';
  }

  const questions: QuestionCard[] = [];

  // Question 1: Faixa de Preço dos Produtos
  if (niche === 'tech') {
    questions.push({
      id: 'pricing_tier',
      title: '💰 Faixa de Preço & Posicionamento dos Produtos',
      description: 'Defina a média de preços que melhor atende o seu público-alvo:',
      type: 'single',
      options: [
        { id: 'eco', label: 'Econômico (R$ 29 - R$ 69)', sublabel: 'Cabos, adaptadores e carregadores básicos de alto giro' },
        { id: 'mid', label: 'Custo-Benefício (R$ 69 - R$ 149)', sublabel: 'Carregadores turbo 30W, indução e fones Bluetooth', recommended: true },
        { id: 'high', label: 'Linha GaN / Premium (R$ 149 - R$ 349)', sublabel: 'Estações 65W+, MagSafe avançado e hubs multifuncionais' },
      ],
    });

    questions.push({
      id: 'selected_skus',
      title: '📦 Quais produtos incluir no catálogo inicial?',
      description: 'Marque os itens que deseja adicionar à sua loja virtual:',
      type: 'multiple',
      options: [
        { id: 'sku-1', label: 'Carregador Rápido GaN 65W USB-C', sublabel: 'R$ 129,90', data: { name: 'Carregador Rápido GaN 65W USB-C', priceCents: 12990, category: 'Carregadores Turbo' } },
        { id: 'sku-2', label: 'Base de Indução Sem Fio MagSafe 15W', sublabel: 'R$ 149,90', data: { name: 'Base de Indução Sem Fio MagSafe 15W', priceCents: 14990, category: 'Indução & Sem Fio' } },
        { id: 'sku-3', label: 'Cabo USB-C Reforçado em Nylon 2m (100W)', sublabel: 'R$ 49,90', data: { name: 'Cabo USB-C Reforçado em Nylon 2m (100W)', priceCents: 4990, category: 'Cabos & Conexões' } },
        { id: 'sku-4', label: 'Powerbank Portátil 20.000mAh Ultra Turbo', sublabel: 'R$ 189,90', data: { name: 'Powerbank Portátil 20.000mAh Ultra Turbo', priceCents: 18990, category: 'Carregadores Portáteis' } },
        { id: 'sku-5', label: 'Carregador Veicular Turbo 38W Dual USB', sublabel: 'R$ 69,90', data: { name: 'Carregador Veicular Turbo 38W Dual USB', priceCents: 6990, category: 'Veicular' } },
      ],
    });

    questions.push({
      id: 'theme_style',
      title: '🎨 Estilo Visual & Paleta da Loja',
      description: 'Escolha as cores primárias que combinam com sua marca:',
      type: 'single',
      options: [
        { id: 'tech-blue', label: 'Azul Elétrico & Tech (#2563EB)', sublabel: 'Transmite modernidade, velocidade e segurança', recommended: true, data: { color: '#2563EB' } },
        { id: 'dark-slate', label: 'Dark Slate Minimalista (#0F172A)', sublabel: 'Estilo sóbrio com visual futurista e limpo', data: { color: '#0F172A' } },
        { id: 'neon-purple', label: 'Roxo Gamer / Inovação (#6366F1)', sublabel: 'Visual vibrante para o público jovem e tech entusiasta', data: { color: '#6366F1' } },
      ],
    });

    questions.push({
      id: 'commercial_offer',
      title: '🚀 Oferta Comercial de Abertura',
      description: 'Qual benefício comercial quer destacar no cabeçalho e carrinho?',
      type: 'single',
      options: [
        { id: 'frete-gratis', label: 'Frete Grátis acima de R$ 120 para todo o Brasil', recommended: true },
        { id: '10off', label: '10% de desconto imediato no pagamento via Pix' },
        { id: 'garantia', label: 'Garantia estendida de 12 meses com troca rápida' },
      ],
    });
  } else if (niche === 'fitness') {
    questions.push({
      id: 'pricing_tier',
      title: '💰 Faixa de Preço dos Suplementos',
      description: 'Selecione o perfil de valor dos seus produtos:',
      type: 'single',
      options: [
        { id: 'eco', label: 'Linha Acessível (R$ 49 - R$ 99)', sublabel: 'Whey concentrado refil e creatinas padrão' },
        { id: 'mid', label: 'Alta Performance (R$ 89 - R$ 169)', sublabel: 'Isolados, creatinas Creapure e pré-treinos importados', recommended: true },
        { id: 'high', label: 'Linha Premium / Importada (R$ 169 - R$ 320)', sublabel: 'Hidrolisados, nootrópicos e blends exclusivos' },
      ],
    });

    questions.push({
      id: 'selected_skus',
      title: '📦 Quais suplementos incluir no catálogo?',
      description: 'Marque os itens para a vitrine inicial:',
      type: 'multiple',
      options: [
        { id: 'sku-1', label: '100% Whey Protein Isolado 900g', sublabel: 'R$ 159,90', data: { name: '100% Whey Protein Isolado 900g', priceCents: 15990, category: 'Proteínas' } },
        { id: 'sku-2', label: 'Creatina Monohidratada 100% Pura 300g', sublabel: 'R$ 89,90', data: { name: 'Creatina Monohidratada 100% Pura 300g', priceCents: 8990, category: 'Aminoácidos' } },
        { id: 'sku-3', label: 'Pré-Treino Ultra Focus Pump 300g', sublabel: 'R$ 109,90', data: { name: 'Pré-Treino Ultra Focus Pump 300g', priceCents: 10990, category: 'Energia & Foco' } },
        { id: 'sku-4', label: 'Coqueteleira Inox Térmica Pro 700ml', sublabel: 'R$ 54,90', data: { name: 'Coqueteleira Inox Térmica Pro 700ml', priceCents: 5490, category: 'Acessórios' } },
      ],
    });

    questions.push({
      id: 'theme_style',
      title: '🎨 Identidade Visual',
      description: 'Cores que transmitem energia e força:',
      type: 'single',
      options: [
        { id: 'fit-orange', label: 'Laranja Energético (#EA580C)', recommended: true, data: { color: '#EA580C' } },
        { id: 'fit-red', label: 'Vermelho Intenso (#DC2626)', data: { color: '#DC2626' } },
        { id: 'fit-blue', label: 'Azul Performance (#0867E8)', data: { color: '#0867E8' } },
      ],
    });
  } else if (niche === 'fashion') {
    questions.push({
      id: 'pricing_tier',
      title: '💰 Faixa de Preço das Peças',
      description: 'Como você deseja precificar seu vestuário?',
      type: 'single',
      options: [
        { id: 'eco', label: 'Acessível (R$ 59 - R$ 119)', sublabel: 'Camisetas estampadas e básicos' },
        { id: 'mid', label: 'Streetwear Médio (R$ 119 - R$ 249)', sublabel: 'Oversized pesado, calças cargo e sneakers', recommended: true },
        { id: 'high', label: 'Grife / Exclusivo (R$ 249 - R$ 599)', sublabel: 'Edições limitadas e alfaiataria contemporânea' },
      ],
    });

    questions.push({
      id: 'selected_skus',
      title: '📦 Quais peças adicionar à vitrine?',
      description: 'Selecione as peças que formarão sua coleção:',
      type: 'multiple',
      options: [
        { id: 'sku-1', label: 'Camiseta Oversized Heavyweight Preto', sublabel: 'R$ 129,90', data: { name: 'Camiseta Oversized Heavyweight Preto', priceCents: 12990, category: 'Camisetas' } },
        { id: 'sku-2', label: 'Sneaker Retro Street Low White', sublabel: 'R$ 349,90', data: { name: 'Sneaker Retro Street Low White', priceCents: 34990, category: 'Sneakers' } },
        { id: 'sku-3', label: 'Calça Cargo Wide Leg Moletom', sublabel: 'R$ 189,90', data: { name: 'Calça Cargo Wide Leg Moletom', priceCents: 18990, category: 'Calças' } },
        { id: 'sku-4', label: 'Boné Strapback Sarja Bordado', sublabel: 'R$ 79,90', data: { name: 'Boné Strapback Sarja Bordado', priceCents: 7990, category: 'Acessórios' } },
      ],
    });

    questions.push({
      id: 'theme_style',
      title: '🎨 Estilo Visual',
      description: 'Paleta cromática do site:',
      type: 'single',
      options: [
        { id: 'fashion-black', label: 'Preto & Branco Minimalista (#0F172A)', recommended: true, data: { color: '#0F172A' } },
        { id: 'fashion-beige', label: 'Bege & Terroso (#78350F)', data: { color: '#78350F' } },
        { id: 'fashion-blue', label: 'Azul Marinho Nobre (#0A2540)', data: { color: '#0A2540' } },
      ],
    });
  } else {
    // General lifestyle / home / food
    questions.push({
      id: 'pricing_tier',
      title: '💰 Faixa de Preço do Catálogo',
      description: 'Selecione o tíquete médio desejado:',
      type: 'single',
      options: [
        { id: 'eco', label: 'Econômico (R$ 39 - R$ 79)' },
        { id: 'mid', label: 'Custo-Benefício (R$ 79 - R$ 179)', recommended: true },
        { id: 'high', label: 'Linha Premium (R$ 179 - R$ 399)' },
      ],
    });

    questions.push({
      id: 'selected_skus',
      title: '📦 Produtos recomendados para a loja:',
      description: 'Selecione os produtos para o catálogo:',
      type: 'multiple',
      options: [
        { id: 'sku-1', label: 'Item Signature Coleção Exclusiva', sublabel: 'R$ 149,90', data: { name: 'Item Signature Coleção Exclusiva', priceCents: 14990, category: 'Destaques' } },
        { id: 'sku-2', label: 'Pack Essencial Minimalista', sublabel: 'R$ 89,90', data: { name: 'Pack Essencial Minimalista', priceCents: 8990, category: 'Essenciais' } },
        { id: 'sku-3', label: 'Linha Studio Design Contemporâneo', sublabel: 'R$ 199,90', data: { name: 'Linha Studio Design Contemporâneo', priceCents: 19990, category: 'Exclusivos' } },
        { id: 'sku-4', label: 'Acessório Artesanal com Garantia', sublabel: 'R$ 64,90', data: { name: 'Acessório Artesanal com Garantia', priceCents: 6490, category: 'Acessórios' } },
      ],
    });

    questions.push({
      id: 'theme_style',
      title: '🎨 Identidade Visual',
      description: 'Escolha a paleta de cores:',
      type: 'single',
      options: [
        { id: 'style-blue', label: 'Azul Clássico (#0867E8)', recommended: true, data: { color: '#0867E8' } },
        { id: 'style-green', label: 'Verde Natural (#059669)', data: { color: '#059669' } },
        { id: 'style-gold', label: 'Dourado / Âmbar (#D97706)', data: { color: '#D97706' } },
      ],
    });
  }

  return {
    niche,
    detectedStoreName,
    questions,
  };
}

/**
 * Universal Store Sheet Generator:
 * Takes any natural language prompt, catalog text, or interactive question selections
 * and outputs the exact 15-sheet 2D table dictionary required by Store Compiler V2.
 */
export function generateStoreRawTables(
  promptText: string,
  brand?: BrandSpec,
  availableAssets: Asset[] = [],
  customOptions?: StoreCustomOptions
): { raw: GeneratedStoreTables; summary: { siteName: string; productCount: number; categoryCount: number } } {
  const text = promptText.trim();
  const lower = text.toLowerCase();

  // 1. Detect or synthesize Store Name
  let siteName = customOptions?.siteName || '';
  if (!siteName) {
    const explicitName = text.match(/(?:chamad[ao]|marca|nome[:\s]+)\s*(?:de\s+)?["']?([A-Za-z0-9À-ÿ\s&'-]+?)["']?(?=\s+(?:com|de|para|que|focad)|$|[,\.])/i);
    if (explicitName && explicitName[1]) {
      siteName = explicitName[1].trim();
    }
  }

  if (!siteName) {
    const lojaMatch = text.match(/loja\s+(?:de\s+)?([A-Za-z0-9À-ÿ\s&'-]+?)(?=\s+(?:com|para|que|focad|onde)|$|[,\.])/i);
    if (lojaMatch && lojaMatch[1]) {
      siteName = lojaMatch[1].trim();
    }
  }

  if (!siteName && brand?.name && brand.name !== 'Minha Marca') {
    siteName = brand.name;
  }

  if (!siteName) siteName = 'Minha Loja';

  // 2. Select Theme Colors based on niche or custom selection
  let primaryColor = customOptions?.primaryColor || '#0867E8';
  let bgColor = '#F7FAFF';
  let surfaceColor = '#FFFFFF';
  let textColor = '#0B1D52';
  let borderColor = '#E6EFFB';

  if (!customOptions?.primaryColor) {
    if (lower.includes('suplement') || lower.includes('whey') || lower.includes('fit')) {
      primaryColor = '#EA580C'; // energetic orange
      bgColor = '#FAFAF9';
      textColor = '#1C1917';
      borderColor = '#E7E5E4';
    } else if (lower.includes('café') || lower.includes('cafe')) {
      primaryColor = '#9A3412'; // warm coffee
      bgColor = '#FDFBF7';
      textColor = '#291E14';
      borderColor = '#EDE3D8';
    } else if (lower.includes('tech') || lower.includes('eletr') || lower.includes('carregador') || lower.includes('gamer')) {
      primaryColor = '#2563EB'; // vibrant royal blue
      bgColor = '#F8FAFC';
      textColor = '#0F172A';
      borderColor = '#E2E8F0';
    } else if (lower.includes('joia') || lower.includes('ouro') || lower.includes('luxo')) {
      primaryColor = '#D97706'; // gold/amber
      bgColor = '#FAFAF9';
      textColor = '#18181B';
      borderColor = '#F3E8D0';
    } else if (lower.includes('pet') || lower.includes('eco') || lower.includes('natural') || lower.includes('planta')) {
      primaryColor = '#059669'; // fresh green
      bgColor = '#F0FDF4';
      textColor = '#064E3B';
      borderColor = '#DCFCE7';
    }
  }

  // Multiplier from pricing tier if specified
  let priceMultiplier = 1.0;
  if (customOptions?.pricingTier === 'eco') priceMultiplier = 0.65;
  if (customOptions?.pricingTier === 'high') priceMultiplier = 1.6;

  // 3. Extract items explicitly if user listed them
  const parsedItems: ParsedItem[] = customOptions?.customProducts && customOptions.customProducts.length > 0
    ? customOptions.customProducts
    : [];

  if (parsedItems.length === 0) {
    const itemRegex = /([A-Za-zÀ-ÿ0-9\s-]{3,35})(?:\s+(?:por|de|valor|preço|custando|r\$|rs)?\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?))/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(text)) !== null) {
      const rawName = match[1].replace(/^(?:e|com|para|de|loja|vende|tem)\s+/i, '').trim();
      const rawPrice = match[2].replace(',', '.');
      const priceFloat = parseFloat(rawPrice);
      if (rawName.length >= 3 && !isNaN(priceFloat) && priceFloat > 0) {
        if (!['por', 'com', 'mais', 'para', 'loja'].includes(rawName.toLowerCase())) {
          parsedItems.push({
            name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
            priceCents: Math.round(priceFloat * 100),
          });
        }
      }
    }
  }

  interface CategoryDef {
    id: string;
    name: string;
    slug: string;
    description: string;
  }
  interface ProductDef {
    sku: string;
    name: string;
    categoryId: string;
    priceCents: number;
    description: string;
    featured: boolean;
    stock: number;
  }

  let categories: CategoryDef[] = [];
  let products: ProductDef[] = [];

  const slugify = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item';

  if (parsedItems.length >= 1) {
    categories = [
      { id: 'cat-01', name: 'Destaques', slug: 'destaques', description: 'Produtos solicitados no catálogo.' },
      { id: 'cat-02', name: 'Lançamentos', slug: 'lancamentos', description: 'Linha completa e novidades.' },
    ];
    products = parsedItems.map((item, idx) => ({
      sku: `SKU-${String(idx + 1).padStart(4, '0')}`,
      name: item.name,
      categoryId: idx % 2 === 0 ? 'cat-01' : 'cat-02',
      priceCents: Math.round(item.priceCents * priceMultiplier),
      description: `${item.name} de alta qualidade selecionado para sua experiência.`,
      featured: true,
      stock: 15 + idx * 5,
    }));
  } else {
    // Generate contextual products based on niche keywords
    if (lower.includes('carregador') || lower.includes('cabo') || lower.includes('eletr') || lower.includes('tech') || lower.includes('gamer')) {
      categories = [
        { id: 'cat-01', name: 'Carregadores Turbo & GaN', slug: 'carregadores-turbo', description: 'Carregadores rápidos para celular e notebook.' },
        { id: 'cat-02', name: 'Indução & Sem Fio', slug: 'inducao', description: 'Bases de indução MagSafe e wireless.' },
        { id: 'cat-03', name: 'Cabos & Conexões', slug: 'cabos', description: 'Cabos trançados de alta resistência.' },
      ];
      products = [
        { sku: 'CAR-001', name: 'Carregador GaN 65W Turbo USB-C Dual', categoryId: 'cat-01', priceCents: Math.round(12990 * priceMultiplier), description: 'Tecnologia GaN compacta compatível com notebooks e smartphones.', featured: true, stock: 25 },
        { sku: 'CAR-002', name: 'Base Carregador Indução MagSafe 15W', categoryId: 'cat-02', priceCents: Math.round(14990 * priceMultiplier), description: 'Fixação magnética precisa e carregamento wireless rápido.', featured: true, stock: 20 },
        { sku: 'CAR-003', name: 'Cabo USB-C Reforçado em Nylon 2m 100W', categoryId: 'cat-03', priceCents: Math.round(4990 * priceMultiplier), description: 'Pontas de alumínio e malha militar ultra durável.', featured: true, stock: 45 },
        { sku: 'CAR-004', name: 'Powerbank Portátil 20.000mAh Ultra Turbo', categoryId: 'cat-01', priceCents: Math.round(18990 * priceMultiplier), description: 'Bateria externa de alta capacidade com visor LED digital.', featured: true, stock: 18 },
        { sku: 'CAR-005', name: 'Carregador Veicular Turbo 38W Dual USB', categoryId: 'cat-01', priceCents: Math.round(6990 * priceMultiplier), description: 'Carregamento veloz para motoristas e viagens.', featured: false, stock: 30 },
      ];
    } else if (lower.includes('suplement') || lower.includes('whey') || lower.includes('fit') || lower.includes('creatina')) {
      categories = [
        { id: 'cat-01', name: 'Proteínas', slug: 'proteinas', description: 'Whey Protein concentrado e isolado.' },
        { id: 'cat-02', name: 'Aminoácidos', slug: 'aminoacidos', description: 'Creatina, BCAA e Glutamina.' },
        { id: 'cat-03', name: 'Acessórios', slug: 'acessorios', description: 'Coqueteleiras e munhequeiras.' },
      ];
      products = [
        { sku: 'SUP-001', name: '100% Whey Protein Isolado 900g', categoryId: 'cat-01', priceCents: Math.round(15990 * priceMultiplier), description: 'Alta concentração proteica para máxima recuperação muscular.', featured: true, stock: 25 },
        { sku: 'SUP-002', name: 'Creatina Monohidratada 100% Pura 300g', categoryId: 'cat-02', priceCents: Math.round(8990 * priceMultiplier), description: 'Mais força, potência e resistência celular nos treinos.', featured: true, stock: 40 },
        { sku: 'SUP-003', name: 'Whey Concentrado 1kg Sabor Chocolate', categoryId: 'cat-01', priceCents: Math.round(11990 * priceMultiplier), description: 'Sabor irresistível e excelente perfil de aminoácidos.', featured: true, stock: 18 },
        { sku: 'SUP-004', name: 'Pré-Treino Ultra Focus 300g', categoryId: 'cat-02', priceCents: Math.round(9990 * priceMultiplier), description: 'Energia explosiva e foco intenso do começo ao fim.', featured: false, stock: 12 },
        { sku: 'SUP-005', name: 'Coqueteleira Shaker Inox Pro 700ml', categoryId: 'cat-03', priceCents: Math.round(4990 * priceMultiplier), description: 'Vedação térmica antidumping com misturador em espiral.', featured: false, stock: 30 },
      ];
    } else if (lower.includes('café') || lower.includes('cafe')) {
      categories = [
        { id: 'cat-01', name: 'Grãos Especiais', slug: 'graos-especiais', description: 'Cafés especiais 100% arábica com torra fresca.' },
        { id: 'cat-02', name: 'Métodos e Filtros', slug: 'metodos', description: 'Prensas francesas, V60 e aeropress.' },
        { id: 'cat-03', name: 'Acessórios', slug: 'acessorios', description: 'Canecas térmicas e moedores manuais.' },
      ];
      products = [
        { sku: 'CAF-001', name: 'Café Especial Cerrado Mineiro 250g', categoryId: 'cat-01', priceCents: Math.round(4290 * priceMultiplier), description: 'Notas de caramelo, chocolate e corpo aveludado.', featured: true, stock: 30 },
        { sku: 'CAF-002', name: 'Café Microlote Mogiana Paulista 250g', categoryId: 'cat-01', priceCents: Math.round(4890 * priceMultiplier), description: 'Acidez cítrica vibrante e aroma floral intenso.', featured: true, stock: 20 },
        { sku: 'CAF-003', name: 'Prensa Francesa Vidro Borossilicato 600ml', categoryId: 'cat-02', priceCents: Math.round(11990 * priceMultiplier), description: 'Extração limpa preservando óleos essenciais do café.', featured: true, stock: 15 },
        { sku: 'CAF-004', name: 'Moedor de Café Manual com Mós de Cerâmica', categoryId: 'cat-03', priceCents: Math.round(13990 * priceMultiplier), description: 'Ajuste de moagem para espresso, coado ou prensa.', featured: false, stock: 10 },
        { sku: 'CAF-005', name: 'Caneca Cerâmica Artesanal 320ml', categoryId: 'cat-03', priceCents: Math.round(3890 * priceMultiplier), description: 'Design minimalista feito à mão com toque acetinado.', featured: false, stock: 25 },
      ];
    } else if (lower.includes('tênis') || lower.includes('sneaker') || lower.includes('moda') || lower.includes('street')) {
      categories = [
        { id: 'cat-01', name: 'Sneakers Street', slug: 'sneakers-street', description: 'Modelos clássicos para o dia a dia.' },
        { id: 'cat-02', name: 'Performance & Corrida', slug: 'corrida', description: 'Amortecimento com retorno de energia.' },
        { id: 'cat-03', name: 'Vestuário Urban', slug: 'vestuario', description: 'Camisetas oversized e hoodies.' },
      ];
      products = [
        { sku: 'SNK-001', name: 'Sneaker Retro Street Low White', categoryId: 'cat-01', priceCents: Math.round(34990 * priceMultiplier), description: 'Couro premium com solado vulcanizado de alta durabilidade.', featured: true, stock: 14 },
        { sku: 'SNK-002', name: 'Tênis Running Foam Air Pro', categoryId: 'cat-02', priceCents: Math.round(42990 * priceMultiplier), description: 'Entressola responsiva para máxima absorção de impacto.', featured: true, stock: 22 },
        { sku: 'SNK-003', name: 'Camiseta Oversized Heavyweight Preto', categoryId: 'cat-03', priceCents: Math.round(12990 * priceMultiplier), description: 'Algodão fio 26 penteado com caimento reto urbano.', featured: true, stock: 35 },
        { sku: 'SNK-004', name: 'Sneaker High Top Urban Suede', categoryId: 'cat-01', priceCents: Math.round(38990 * priceMultiplier), description: 'Cano alto em camurça legítima e acabamento artesanal.', featured: false, stock: 10 },
      ];
    } else {
      categories = [
        { id: 'cat-01', name: 'Coleção Principal', slug: 'colecao-principal', description: 'Peças exclusivas e selecionadas com rigor.' },
        { id: 'cat-02', name: 'Essenciais', slug: 'essenciais', description: 'Itens versáteis para o dia a dia.' },
        { id: 'cat-03', name: 'Edição Especial', slug: 'edicao-especial', description: 'Lançamentos limitados com acabamento nobre.' },
      ];
      products = [
        { sku: 'NEX-001', name: 'Item Signature Edição 01', categoryId: 'cat-01', priceCents: Math.round(18990 * priceMultiplier), description: 'Design contemporâneo unindo elegância e funcionalidade.', featured: true, stock: 20 },
        { sku: 'NEX-002', name: 'Pack Essencial Minimalista', categoryId: 'cat-02', priceCents: Math.round(12990 * priceMultiplier), description: 'Acabamento premium para valorizar o seu estilo.', featured: true, stock: 35 },
        { sku: 'NEX-003', name: 'Linha Studio Exclusive', categoryId: 'cat-03', priceCents: Math.round(24990 * priceMultiplier), description: 'Produção limitada com detalhes artesanais requintados.', featured: true, stock: 12 },
        { sku: 'NEX-004', name: 'Acessório Master Series', categoryId: 'cat-02', priceCents: Math.round(7990 * priceMultiplier), description: 'Complemento versátil com garantia de autenticidade.', featured: false, stock: 40 },
      ];
    }
  }

  // Nunca publique produtos de demonstração como se fossem dados do usuário.
  // Sem item explícito/confirmado, o compilador entrega um catálogo vazio.
  if (parsedItems.length === 0) {
    categories = [];
    products = [];
  }

  // 5. Build ASSETS table referencing available studio assets
  const assetsTable: any[][] = [
    ['asset_id', 'path', 'alt', 'mime', 'active'],
  ];

  const assignedAssetIds: string[] = [];
  products.forEach((prod, idx) => {
    const explicitPath = parsedItems[idx]?.imagePath || availableAssets[idx]?.local_path || '';
    const assetId = explicitPath ? `img-prod-${idx + 1}` : '';
    assignedAssetIds.push(assetId);
    if (!explicitPath) return;
    assetsTable.push([
      assetId,
      explicitPath,
      `Foto do produto ${prod.name}`,
      'image/jpeg',
      true,
    ]);
  });

  // Hero asset
  const heroPath = availableAssets[0]?.local_path || parsedItems[0]?.imagePath || '';
  const heroAssetId = heroPath ? 'img-hero-main' : '';
  if (heroPath) {
    assetsTable.push([
      heroAssetId,
      heroPath,
      `Destaque da loja ${siteName}`,
      'image/jpeg',
      true,
    ]);
  }

  // 6. Build PRODUCTS table
  const productsTable: any[][] = [
    ['sku', 'name', 'category_id', 'description', 'price_cents', 'stock', 'variants_json', 'image_asset_id', 'featured', 'active', 'slug'],
  ];
  products.forEach((p, idx) => {
    const assetId = assignedAssetIds[idx] || '';
    const variants = [
      { id: 'v1', label: 'Padrão', stock: Math.floor(p.stock * 0.6) },
      { id: 'v2', label: 'Especial', stock: Math.ceil(p.stock * 0.4) },
    ];
    productsTable.push([
      p.sku,
      p.name,
      p.categoryId,
      p.description,
      String(p.priceCents),
      String(p.stock),
      JSON.stringify(variants),
      assetId,
      p.featured,
      true,
      slugify(p.name),
    ]);
  });

  // 7. Build CATEGORIES table
  const categoriesTable: any[][] = [
    ['category_id', 'name', 'slug', 'description', 'image_asset_id', 'active'],
  ];
  categories.forEach((c) => {
    categoriesTable.push([
      c.id,
      c.name,
      c.slug,
      c.description,
      '',
      true,
    ]);
  });

  // 8. Build SECTIONS table (5 core sections)
  const heroConfig = JSON.stringify({
    eyebrow: siteName.toUpperCase(),
    title: `Conheça a ${siteName}`,
    subtitle: customOptions?.offerText || `Explore nossa curadoria com envio rápido, garantia e suporte exclusivo.`,
    button_text: 'Ver Catálogo',
    image_asset_id: heroAssetId,
  });

  const sectionsTable: any[][] = [
    ['section_id', 'page_id', 'slot', 'component', 'order', 'active', 'config_json'],
    ['s-01', 'home', 'main', 'EditorialHero', '10', true, heroConfig],
    ['s-02', 'home', 'main', 'CategoryChips', '20', true, JSON.stringify({ title: 'Compre por Categoria' })],
    ['s-03', 'home', 'main', 'SearchBar', '30', true, '{}'],
    ['s-04', 'home', 'main', 'FeaturedGrid', '40', true, JSON.stringify({ title: 'Destaques Imperdíveis', limit: 4 })],
    ['s-05', 'home', 'main', 'ProductGrid', '50', true, JSON.stringify({ title: 'Catálogo Completo' })],
  ];

  // 9. Build COMPOSITION_RULES table (universal coverage)
  const compositionRulesTable: any[][] = [
    ['rule_id', 'target', 'metric', 'min', 'max', 'value_json', 'priority', 'active'],
    ['category_1', 'category_nav', 'category_count', '1', '1', JSON.stringify({ strategy: 'direct' }), '1', true],
    ['category_2_5', 'category_nav', 'category_count', '2', '5', JSON.stringify({ strategy: 'chips' }), '1', true],
    ['category_6_9', 'category_nav', 'category_count', '6', '9', JSON.stringify({ strategy: 'chips_scroll' }), '1', true],
    ['category_10_plus', 'category_nav', 'category_count', '10', '999999', JSON.stringify({ strategy: 'mega_search' }), '1', true],
    ['products_1_3', 'product_grid', 'product_count', '1', '3', JSON.stringify({ columns: 2, page_size: 3, paginate: false, card_size: 'large' }), '1', true],
    ['products_4_12', 'product_grid', 'product_count', '4', '12', JSON.stringify({ columns: 3, page_size: 12, paginate: false }), '1', true],
    ['products_13_48', 'product_grid', 'product_count', '13', '48', JSON.stringify({ columns: 4, page_size: 12, paginate: true }), '1', true],
    ['products_49_plus', 'product_grid', 'product_count', '49', '999999', JSON.stringify({ columns: 4, page_size: 12, paginate: true, lazy: true }), '1', true],
    ['sections_1_5', 'section_spacing', 'section_count', '1', '5', JSON.stringify({ px: 84 }), '1', true],
    ['sections_6_9', 'section_spacing', 'section_count', '6', '9', JSON.stringify({ px: 68 }), '1', true],
    ['sections_10_plus', 'section_spacing', 'section_count', '10', '999999', JSON.stringify({ px: 52 }), '1', true],
  ];

  // 10. Build QA_CASES table with exact dynamic counts
  const expectedCounts = JSON.stringify({
    categories: categories.length,
    products: products.length,
    sections: 5,
  });

  const qaCasesTable: any[][] = [
    ['case_id', 'action', 'expected_json'],
    ['counts', 'counts', expectedCounts],
    ['cart', 'add_remove_qty_subtotal', JSON.stringify({ currency: 'BRL' })],
  ];

  // 11. Build LEIA_PRIMEIRO table
  const leiaPrimeiroTable: any[][] = [
    ['key', 'value'],
    ['schema_version', '2.0.0'],
    ['dataset_type', 'USER_CONFIRMED_CATALOG'],
    ['generated_by', 'CompanyGen Catalog Assistant V2'],
  ];

  // 12. Build SITE table
  const siteTable: any[][] = [
    ['key', 'value'],
    ['id', slugify(siteName)],
    ['name', siteName],
    ['logo_text', siteName],
    ['description', `Loja online oficial da ${siteName}. Catálogo de produtos com checkout seguro.`],
    ['currency', 'BRL'],
    ['email', 'contato@' + slugify(siteName) + '.com.br'],
  ];

  // 13. Build THEME table
  const themeTable: any[][] = [
    ['key', 'value'],
    ['primary', primaryColor],
    ['background', bgColor],
    ['surface', surfaceColor],
    ['text', textColor],
    ['border', borderColor],
    ['card_radius_px', '18'],
    ['motion_ms', '200'],
  ];

  // 14. Build PAGES table
  const pagesTable: any[][] = [
    ['page_id', 'type', 'path', 'title', 'active'],
    ['home', 'home', '/', 'Vitrine', true],
    ['product', 'product', '/produto/:slug/', 'Produto', true],
    ['category', 'category', '/categoria/:slug/', 'Categoria', true],
  ];

  // 15. Build NAVIGATION table
  const navigationTable: any[][] = [
    ['nav_id', 'label', 'href', 'order', 'active'],
    ['home', 'Início', '/', '10', true],
    ['produtos', 'Produtos', '/#catalogo', '20', true],
  ];

  // 16. Build COPY table
  const copyTable: any[][] = [
    ['key', 'value'],
    ['cart_empty', 'Seu carrinho está vazio'],
    ['checkout_inactive', 'Pagamento integrado com Mercado Pago'],
  ];

  // 17. Build CHECKOUT table
  const checkoutTable: any[][] = [
    ['key', 'value'],
    ['mode', 'disabled'],
    ['provider', 'mercado_pago_checkout_pro'],
    ['server_required', 'true'],
  ];

  // 18. Build POLICIES table
  const policiesTable: any[][] = [
    ['key', 'value'],
    ['shipping', 'Entregamos para todo o Brasil com rastreamento em tempo real.'],
    ['returns', 'Garantia de 7 dias após o recebimento para devolução sem custo.'],
  ];

  // 19. Build EXPORT table
  const exportTable: any[][] = [
    ['key', 'value'],
    ['canonical_url', ''],
    ['platform_default', 'hostinger'],
  ];

  const raw: GeneratedStoreTables = {
    LEIA_PRIMEIRO: leiaPrimeiroTable,
    SITE: siteTable,
    THEME: themeTable,
    CATEGORIES: categoriesTable,
    PRODUCTS: productsTable,
    ASSETS: assetsTable,
    PAGES: pagesTable,
    SECTIONS: sectionsTable,
    NAVIGATION: navigationTable,
    COPY: copyTable,
    COMPOSITION_RULES: compositionRulesTable,
    CHECKOUT: checkoutTable,
    POLICIES: policiesTable,
    EXPORT: exportTable,
    QA_CASES: qaCasesTable,
  };

  return {
    raw,
    summary: {
      siteName,
      productCount: products.length,
      categoryCount: categories.length,
    },
  };
}
