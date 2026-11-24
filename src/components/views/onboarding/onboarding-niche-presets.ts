import type { CatalogProduct } from '@/schemas/profile.schema';

export interface IgnitionPresetProductSeed {
  sku: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  variation: string;
  stock: number;
}

export interface IgnitionNichePreset {
  id: 'papelaria' | 'moda' | 'gastronomia' | 'beleza' | 'eletronicos';
  label: string;
  defaultBusinessName: string;
  segment: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  searchQuery: string;
  products: IgnitionPresetProductSeed[];
}

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export const IGNITION_NICHE_PRESETS: IgnitionNichePreset[] = [
  {
    id: 'papelaria',
    label: 'Papelaria & Presentes',
    defaultBusinessName: 'Papelaria',
    segment: 'Papelaria & Presentes',
    description:
      'Papelaria criativa, kits presenteáveis e cestas artesanais com entrega rápida e atendimento direto pelo WhatsApp.',
    primaryColor: '#09090B',
    accentColor: '#2563EB',
    searchQuery: 'stationery notebook gift box craft paper',
    products: [
      {
        sku: 'PAP-001',
        name: 'Cesta Café Artesanal Manhã',
        category: 'Kits & Cestas',
        description: 'Cesta artesanal com café especial, bloco kraft pautado, cartão personalizado e laço natural.',
        priceCents: 18990,
        variation: 'Padrão',
        stock: 10,
      },
      {
        sku: 'PAP-002',
        name: 'Caderno Espiral Capa Kraft A5',
        category: 'Cadernos',
        description: 'Papel pólen 90g de alta gramatura com 100 folhas pontilhadas e fechamento em elástico.',
        priceCents: 4990,
        variation: 'A5 · 100 fls',
        stock: 24,
      },
      {
        sku: 'PAP-003',
        name: 'Kit Escrita Executiva Preto Matte',
        category: 'Escrita',
        description: 'Caneta rollerball metálica acompanhada de estojo rígido e refil de tinta alemã.',
        priceCents: 8900,
        variation: 'Preto Matte',
        stock: 15,
      },
      {
        sku: 'PAP-004',
        name: 'Planner Semanal Mesa Minimalista',
        category: 'Organização',
        description: 'Bloco destacável com 52 semanas datáveis para mesa de trabalho e foco diário.',
        priceCents: 6490,
        variation: '52 Folhas',
        stock: 18,
      },
      {
        sku: 'PAP-005',
        name: 'Caixa Presente Lacrada + Fita Algodão',
        category: 'Embalagens',
        description: 'Caixa rígida revestida com fita de algodão cru e tag impressa pronta para envio.',
        priceCents: 3490,
        variation: 'Média · 24x18cm',
        stock: 30,
      },
      {
        sku: 'PAP-006',
        name: 'Conjunto Blocos Adesivos Terracota',
        category: 'Papelaria Fina',
        description: 'Kit com 4 tamanhos coordenados em papel 120g de alta aderência sem marcar o papel.',
        priceCents: 3990,
        variation: 'Pack 4 un.',
        stock: 28,
      },
    ],
  },
  {
    id: 'moda',
    label: 'Moda & Vestuário',
    defaultBusinessName: 'Studio Linho',
    segment: 'Moda & Acessórios',
    description:
      'Curadoria de peças atemporais em linho e algodão puro com envio nacional e reserva imediata no WhatsApp.',
    primaryColor: '#09090B',
    accentColor: '#2563EB',
    searchQuery: 'linen clothing fashion editorial dress shirt',
    products: [
      {
        sku: 'MOD-001',
        name: 'Vestido Linho Puro Midi',
        category: 'Vestidos',
        description: 'Modelagem fluida em linho misto com bolsos laterais e acabamento em costura francesa.',
        priceCents: 28900,
        variation: 'P · M · G',
        stock: 12,
      },
      {
        sku: 'MOD-002',
        name: 'Camisa Alfaiataria Algodão Egípcio',
        category: 'Camisas',
        description: 'Corte reto confortável com botões em madrepérola e toque macio que quase não amassa.',
        priceCents: 21900,
        variation: 'Off-White',
        stock: 16,
      },
      {
        sku: 'MOD-003',
        name: 'Calça Pantalona Cintura Alta',
        category: 'Calças',
        description: 'Caimento estruturado que alonga a silhueta, perfeita para trabalho ou eventos.',
        priceCents: 24990,
        variation: 'Areia · P ao GG',
        stock: 14,
      },
      {
        sku: 'MOD-004',
        name: 'Blazer Estruturado Minimal',
        category: 'Terceira Peça',
        description: 'Forro em cetim respirável e lapela clássica para composições urbanas.',
        priceCents: 38900,
        variation: 'Preto · P ao G',
        stock: 8,
      },
      {
        sku: 'MOD-005',
        name: 'T-Shirt Malha Pima Essencial',
        category: 'Básicos',
        description: 'Gola reforçada e algodão peruano penteado de altíssima durabilidade.',
        priceCents: 11900,
        variation: 'Branca',
        stock: 35,
      },
      {
        sku: 'MOD-006',
        name: 'Bolsa Tote Couro Legítimo',
        category: 'Acessórios',
        description: 'Alça de ombro anatômica, compartimento para notebook e fecho magnético oculto.',
        priceCents: 44900,
        variation: 'Caramelo',
        stock: 6,
      },
    ],
  },
  {
    id: 'gastronomia',
    label: 'Gastronomia & Delivery',
    defaultBusinessName: 'Doce Grão',
    segment: 'Gastronomia & Confeitaria',
    description:
      'Produção artesanal diária com ingredientes selecionados, retirada no balcão ou entrega agendada.',
    primaryColor: '#18181B',
    accentColor: '#2563EB',
    searchQuery: 'artisan bakery coffee cake croissant gourmet',
    products: [
      {
        sku: 'GAS-001',
        name: 'Bolo Vulcão Belga 70% Cacau',
        category: 'Bolos & Tortas',
        description: 'Massa úmida de chocolate com cobertura cremosa de ganache meio amargo belga.',
        priceCents: 12800,
        variation: 'Serve 10 fatias',
        stock: 12,
      },
      {
        sku: 'GAS-002',
        name: 'Combo Café da Manhã Executivo',
        category: 'Combos',
        description: 'Dois croissants amanteigados, pão de fermentação natural, geleia da casa e café coado.',
        priceCents: 7990,
        variation: '2 Pessoas',
        stock: 20,
      },
      {
        sku: 'GAS-003',
        name: 'Caixa Degustação 12 Brigadeiros Gourmet',
        category: 'Doces Finos',
        description: 'Seleção ao leite, pistache, caramelo salgado e chocolate intenso feitos no dia.',
        priceCents: 5800,
        variation: '12 Unidades',
        stock: 25,
      },
      {
        sku: 'GAS-004',
        name: 'Torta Basca Queimada com Baunilha',
        category: 'Tortas Especiais',
        description: 'Interior cremoso de cream cheese artesanal com topo caramelizado na medida certa.',
        priceCents: 14900,
        variation: '1,2 kg',
        stock: 8,
      },
      {
        sku: 'GAS-005',
        name: 'Pão Sourdough Fermentação Natural 48h',
        category: 'Padaria',
        description: 'Casca crocante e miolo aerado assado em forno de pedra diariamente.',
        priceCents: 3400,
        variation: '750g',
        stock: 18,
      },
      {
        sku: 'GAS-006',
        name: 'Café Especial Torra Média em Grãos',
        category: 'Cafés',
        description: 'Notas de caramelo e amêndoas torradas, pontuação 86 SCA da Alta Mogiana.',
        priceCents: 4690,
        variation: '250g',
        stock: 30,
      },
    ],
  },
  {
    id: 'beleza',
    label: 'Beleza & Cosméticos',
    defaultBusinessName: 'Ateliê Botânico',
    segment: 'Beleza & Cosméticos',
    description:
      'Fórmulas dermatológicas de alta performance para skincare, corpo e rotina diária de autocuidado.',
    primaryColor: '#09090B',
    accentColor: '#2563EB',
    searchQuery: 'minimal skincare serum dropper cosmetic bottle',
    products: [
      {
        sku: 'BEL-001',
        name: 'Sérum Facial Vitamina C 15% + Ferúlico',
        category: 'Skincare',
        description: 'Ação antioxidante iluminadora com absorção seca imediata e redução de linhas finas.',
        priceCents: 13990,
        variation: '30ml',
        stock: 22,
      },
      {
        sku: 'BEL-002',
        name: 'Gel de Limpeza Suave Niacinamida',
        category: 'Limpeza Facial',
        description: 'Equilibra a oleosidade sem repuxar a pele, ideal para uso diário manhã e noite.',
        priceCents: 7490,
        variation: '150ml',
        stock: 30,
      },
      {
        sku: 'BEL-003',
        name: 'Hidratante Reparador Ceramidas',
        category: 'Hidratação',
        description: 'Restaura a barreira cutânea com pantenol e esqualano vegetal em textura leve.',
        priceCents: 9800,
        variation: '50g',
        stock: 18,
      },
      {
        sku: 'BEL-004',
        name: 'Kit Rotina Completa Glow Diário',
        category: 'Kits & Combos',
        description: 'Conjunto com limpeza suave, sérum antioxidante e hidratante reparador com desconto especial.',
        priceCents: 26900,
        variation: '3 Itens',
        stock: 12,
      },
      {
        sku: 'BEL-005',
        name: 'Protetor Solar Fluido Toque Seco FPS 60',
        category: 'Proteção Solar',
        description: 'Acabamento invisível resistente à água, sem deixar resíduo branco na pele.',
        priceCents: 8990,
        variation: '50ml',
        stock: 25,
      },
      {
        sku: 'BEL-006',
        name: 'Óleo Capilar Reparador Argan & Jojoba',
        category: 'Cabelos',
        description: 'Sela pontas duplas e devolve brilho espelhado sem pesar os fios.',
        priceCents: 7900,
        variation: '60ml',
        stock: 20,
      },
    ],
  },
  {
    id: 'eletronicos',
    label: 'Eletrônicos',
    defaultBusinessName: 'Tech Point',
    segment: 'Eletrônicos & Assistência',
    description:
      'Acessórios originais, periféricos de produtividade e garantia direta com atendimento ágil no WhatsApp.',
    primaryColor: '#09090B',
    accentColor: '#2563EB',
    searchQuery: 'minimal tech desk gadgets headphones charger',
    products: [
      {
        sku: 'ELE-001',
        name: 'Fone Bluetooth Cancelamento Ativo ANC',
        category: 'Áudio',
        description: 'Até 36 horas de bateria, modo transparência e microfones com isolamento de ruído.',
        priceCents: 34990,
        variation: 'Preto Grafite',
        stock: 15,
      },
      {
        sku: 'ELE-002',
        name: 'Carregador Rápido GaN 65W Dupla USB-C',
        category: 'Energia',
        description: 'Carrega notebook e smartphone ao mesmo tempo com proteção térmica inteligente.',
        priceCents: 16900,
        variation: '65W Bivolt',
        stock: 24,
      },
      {
        sku: 'ELE-003',
        name: 'Hub USB-C 7 em 1 HDMI 4K Alumínio',
        category: 'Produtividade',
        description: 'Saída 4K, leitor SD/TF, 3 portas USB 3.0 e Power Delivery de até 100W.',
        priceCents: 18990,
        variation: 'Cinza Espacial',
        stock: 19,
      },
      {
        sku: 'ELE-004',
        name: 'Teclado Mecânico Compacto Sem Fio',
        category: 'Periféricos',
        description: 'Conexão multi-dispositivo até 3 telas, switches silenciosos e retroiluminação branca.',
        priceCents: 42900,
        variation: 'ABNT2 · Compacto',
        stock: 9,
      },
      {
        sku: 'ELE-005',
        name: 'Power Bank Magnético 10.000mAh',
        category: 'Energia',
        description: 'Fixação magnética segura com carregamento rápido sem fio de 15W e porta USB-C.',
        priceCents: 22900,
        variation: '10.000mAh',
        stock: 14,
      },
      {
        sku: 'ELE-006',
        name: 'Suporte Articulado Alumínio Notebook',
        category: 'Ergonomia',
        description: 'Ajuste de altura estável com apoio em silicone antiderrapante para desktop limpo.',
        priceCents: 12990,
        variation: 'Prata Fosco',
        stock: 22,
      },
    ],
  },
];

export function buildCatalogProductsFromNiche(
  preset: IgnitionNichePreset,
): CatalogProduct[] {
  const now = new Date().toISOString();
  return preset.products.map((item, idx) => ({
    id: `seed_${preset.id}_${idx + 1}_${Date.now().toString(36)}`,
    sku: item.sku,
    name: item.name,
    category: item.category,
    description: item.description,
    priceCents: Math.max(100, Math.round(item.priceCents)),
    variation: item.variation,
    stock: item.stock,
    stockQty: item.stock,
    trackStock: true,
    lowStockThreshold: 3,
    autoPausedOutOfStock: false,
    imageFocalPoint: { x: 50, y: 50 },
    imageLowRes: false,
    active: true,
    imageUrl: '',
    approvedAsset: true,
    itemType: 'produto_fisico',
    updatedAt: now,
  }));
}

export function buildDefaultSeedProductsForStore(storeName: string): CatalogProduct[] {
  const cleanName = storeName.trim() || 'Minha Loja';
  const now = new Date().toISOString();
  return [
    {
      id: `seed_custom_1_${Date.now().toString(36)}`,
      sku: 'ITEM-001',
      name: `Destaque ${cleanName}`,
      category: 'Destaques',
      description: `Produto principal da loja ${cleanName} com pedido rápido pelo WhatsApp.`,
      priceCents: 12990,
      variation: 'Padrão',
      stock: 12,
      stockQty: 12,
      trackStock: true,
      lowStockThreshold: 3,
      autoPausedOutOfStock: false,
      imageFocalPoint: { x: 50, y: 50 },
      imageLowRes: false,
      active: true,
      imageUrl: '',
      approvedAsset: true,
      itemType: 'produto_fisico',
      updatedAt: now,
    },
    {
      id: `seed_custom_2_${Date.now().toString(36)}`,
      sku: 'ITEM-002',
      name: `Kit Especial ${cleanName}`,
      category: 'Kits',
      description: 'Seleção especial pronta para envio imediato com opção de pagamento no Pix.',
      priceCents: 18990,
      variation: 'Completo',
      stock: 8,
      stockQty: 8,
      trackStock: true,
      lowStockThreshold: 3,
      autoPausedOutOfStock: false,
      imageFocalPoint: { x: 50, y: 50 },
      imageLowRes: false,
      active: true,
      imageUrl: '',
      approvedAsset: true,
      itemType: 'produto_fisico',
      updatedAt: now,
    },
  ];
}

export function extractInstagramHandle(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  const urlMatch = value.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
  if (urlMatch?.[1]) {
    const clean = urlMatch[1].replace(/\/$/, '');
    if (!['p', 'reel', 'reels', 'stories', 'explore'].includes(clean.toLowerCase())) {
      return `@${clean}`;
    }
  }

  const atMatch = value.match(/^@([a-zA-Z0-9._]{2,30})$/);
  if (atMatch?.[1]) {
    return `@${atMatch[1]}`;
  }

  return null;
}

export function detectPixKeyType(raw: string): PixKeyType | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'email';
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return 'random';
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14 && !value.startsWith('+')) {
    return 'cnpj';
  }
  if (digits.length === 11) {
    if (value.startsWith('+55') || (digits[2] === '9' && value.includes('('))) {
      return 'phone';
    }
    return 'cpf';
  }
  if (digits.length >= 12 && digits.length <= 13 && (value.startsWith('+55') || digits.startsWith('55'))) {
    return 'phone';
  }
  if (digits.length === 10) {
    return 'phone';
  }
  if (value.length >= 24) {
    return 'random';
  }
  return null;
}

export function normalizeBrazilWhatsAppE164(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}
