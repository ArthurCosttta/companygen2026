export type ProteinVariant = {
  name: string;
  containerMinPx: number;
  description: string;
};

export type ProteinContract = {
  proteinId: string;
  version: number;
  domAnatomy: string[];
  slots: string[];
  variants: ProteinVariant[];
  acceptedGenes: string[];
  minContainerPx: number;
  states: string[];
  events: string[];
  mediaRules?: {
    allowedRoles: string[];
    defaultFit: 'contain' | 'cover' | 'intrinsic';
    requiresCropApprovalForCover: boolean;
  };
  textRules?: {
    titleMaxLines: number;
    priceNoWrap: boolean;
  };
  actions: string[];
  qaInvariants: string[];
};

export const proteinRegistry: Record<string, ProteinContract> = {
  Header: {
    proteinId: 'Header',
    version: 2,
    domAnatomy: ['header', '.shop-header__brand', '.shop-header__search-area', '.shop-header__cart-btn'],
    slots: ['brand.logo', 'search', 'actions.cart'],
    variants: [
      { name: 'compact', containerMinPx: 320, description: 'Header com logo reduzido e busca compacta' },
      { name: 'classic', containerMinPx: 768, description: 'Header completo com navegação visível' }
    ],
    acceptedGenes: ['header.density', 'brand.logoSize', 'search.width', 'actions.gap'],
    minContainerPx: 320,
    states: ['default', 'compact', 'searchOpen', 'cartCountChanged'],
    events: ['search.open', 'cart.open'],
    mediaRules: {
      allowedRoles: ['brand_logo'],
      defaultFit: 'contain',
      requiresCropApprovalForCover: false
    },
    actions: ['cart.open', 'search.open'],
    qaInvariants: ['Nenhum item sobrepõe o logo ou busca', 'Botões com alvo mínimo de 44x44px']
  },

  Hero: {
    proteinId: 'Hero',
    version: 2,
    domAnatomy: ['section.shop-hero', '.shop-hero__copy', '.shop-hero__media', '.shop-hero__cta-btn'],
    slots: ['media.full_scene', 'copy.title', 'copy.cta'],
    variants: [
      { name: 'split', containerMinPx: 600, description: 'Texto à esquerda e imagem à direita' },
      { name: 'photoFull', containerMinPx: 320, description: 'Cena de fundo com texto sobreposto em área segura' }
    ],
    acceptedGenes: ['hero.minBlockPx', 'media.focalPoint', 'media.safeArea', 'title.maxLines'],
    minContainerPx: 320,
    states: ['idle', 'press'],
    events: ['hero.ctaClick'],
    mediaRules: {
      allowedRoles: ['full_scene'],
      defaultFit: 'cover',
      requiresCropApprovalForCover: true
    },
    actions: ['scroll.jump'],
    qaInvariants: ['Texto com contraste aprovado', 'Sem distorção de aspecto da cena']
  },

  RecommendationCard: {
    proteinId: 'RecommendationCard',
    version: 2,
    domAnatomy: [
      'article.recommendation-card',
      '.recommendation-card__media',
      '.recommendation-card__title',
      '.recommendation-card__price',
      '.recommendation-card__actions',
      '.recommendation-card__open-btn',
      '.recommendation-card__add-btn'
    ],
    slots: ['media', 'title', 'price', 'actions.open', 'actions.add'],
    variants: [
      { name: 'compact', containerMinPx: 160, description: 'Visual horizontal ultra-compacto' },
      { name: 'standard', containerMinPx: 220, description: 'Card padrão com botões lado a lado' },
      { name: 'detailed', containerMinPx: 360, description: 'Card estendido com descritivo' }
    ],
    acceptedGenes: [
      'card.minWidthPx',
      'media.fit',
      'media.maxBlockPx',
      'content.titleMaxLines',
      'content.priceNoWrap',
      'actions.minTargetPx'
    ],
    minContainerPx: 160,
    states: ['idle', 'hover', 'press', 'added'],
    events: ['product.open', 'cart.add'],
    mediaRules: {
      allowedRoles: ['product_cutout'],
      defaultFit: 'contain',
      requiresCropApprovalForCover: false
    },
    textRules: {
      titleMaxLines: 2,
      priceNoWrap: true
    },
    actions: ['product.open', 'cart.add'],
    qaInvariants: [
      'Título nunca estilizado como botão circular',
      'Botões Ver produto e Adicionar à sacola são distintos',
      'Alvo mínimo de 44x44px garantido para ambos os botões'
    ]
  },

  ProductCard: {
    proteinId: 'ProductCard',
    version: 2,
    domAnatomy: [
      'article.product-card',
      '.product-card__media',
      '.product-card__title',
      '.product-card__price-line',
      '.product-card__actions'
    ],
    slots: ['media', 'title', 'price', 'stepper', 'actions.add'],
    variants: [
      { name: 'compact', containerMinPx: 160, description: 'Card compacto de catálogo' },
      { name: 'standard', containerMinPx: 240, description: 'Card regular com controles' },
      { name: 'detailed', containerMinPx: 360, description: 'Card completo com variantes' }
    ],
    acceptedGenes: ['media.fit', 'content.titleMaxLines', 'content.priceNoWrap'],
    minContainerPx: 160,
    states: ['idle', 'hover', 'press', 'added'],
    events: ['product.open', 'cart.add'],
    mediaRules: {
      allowedRoles: ['product_cutout'],
      defaultFit: 'contain',
      requiresCropApprovalForCover: false
    },
    textRules: {
      titleMaxLines: 2,
      priceNoWrap: true
    },
    actions: ['product.open', 'cart.add'],
    qaInvariants: ['Sem sobreposição de texto sobre a foto', 'Alvo de 44px preservado']
  },

  KitBuilder: {
    proteinId: 'KitBuilder',
    version: 2,
    domAnatomy: [
      'section.kit-builder',
      '.kit-builder__heading',
      '.kit-builder__columns',
      '.kit-builder__summary'
    ],
    slots: ['pet.avatar', 'slots.selected', 'slots.options', 'summary.cta'],
    variants: [
      { name: 'stacked', containerMinPx: 320, description: 'Colunas empilhadas para mobile' },
      { name: 'twoCol', containerMinPx: 760, description: 'Colunas lado a lado' }
    ],
    acceptedGenes: ['kit.columns', 'slotCount', 'summary.stickyMode'],
    minContainerPx: 320,
    states: ['idle', 'slotSelected', 'itemAdded'],
    events: ['kit.selectSlot', 'kit.selectProduct', 'cart.add'],
    mediaRules: {
      allowedRoles: ['portrait', 'product_cutout'],
      defaultFit: 'contain',
      requiresCropApprovalForCover: false
    },
    actions: ['kit.selectSlot', 'kit.selectProduct', 'cart.add'],
    qaInvariants: ['Total calculado exatamente a partir da soma dos centavos dos SKUs escolhidos']
  },

  CartDialog: {
    proteinId: 'CartDialog',
    version: 2,
    domAnatomy: [
      '.dialog-backdrop',
      '.dialog-panel',
      '.cart-dialog__lines',
      '.cart-dialog__summary',
      '.cart-dialog__step-review'
    ],
    slots: ['lines', 'stepper', 'summary', 'message.preview', 'cta.whatsapp'],
    variants: [{ name: 'modal', containerMinPx: 320, description: 'Modal central padrão' }],
    acceptedGenes: ['dialog.maxWidthPx', 'overlay.opacity', 'steps'],
    minContainerPx: 320,
    states: ['closed', 'cart', 'review'],
    events: ['cart.open', 'cart.update', 'cart.remove', 'whatsapp.open', 'cart.close'],
    actions: ['cart.update', 'cart.remove', 'whatsapp.open', 'cart.close'],
    qaInvariants: [
      'Modal central único em toda a loja',
      'Passos cart e review dentro do mesmo modal',
      'Bloqueio de telefone fictício para links reais'
    ]
  },

  SearchResults: {
    proteinId: 'SearchResults',
    version: 2,
    domAnatomy: [
      '.search-results-popover',
      '.search-results-popover__header',
      '.search-results-popover__list',
      '.search-results-popover__item'
    ],
    slots: ['counter', 'items', 'emptyState'],
    variants: [{ name: 'popover', containerMinPx: 280, description: 'Menu suspenso ancorado' }],
    acceptedGenes: ['search.debounceMs', 'maxResults', 'fields'],
    minContainerPx: 280,
    states: ['closed', 'typing', 'results', 'empty'],
    events: ['search.query', 'search.selectProduct', 'search.close'],
    actions: ['search.selectProduct', 'search.close'],
    qaInvariants: [
      'Ancorado ao campo de busca',
      'Navegável por teclado (Setas, Enter, Escape)',
      'Seleção abre /produto/:slug'
    ]
  },

  ProductDetail: {
    proteinId: 'ProductDetail',
    version: 2,
    domAnatomy: [
      'main.product-screen',
      '.store-breadcrumb',
      '.product-detail-layout',
      '.product-gallery',
      '.product-detail-info'
    ],
    slots: ['gallery', 'title', 'price', 'variants', 'actions'],
    variants: [{ name: 'page', containerMinPx: 320, description: 'Página de detalhe completa' }],
    acceptedGenes: ['gallery.layout', 'media.fit', 'title.maxLines'],
    minContainerPx: 320,
    states: ['ready', 'variantChanging'],
    events: ['product.selectVariant', 'cart.add', 'whatsapp.open'],
    mediaRules: {
      allowedRoles: ['product_cutout'],
      defaultFit: 'contain',
      requiresCropApprovalForCover: false
    },
    actions: ['cart.add', 'whatsapp.open'],
    qaInvariants: [
      'Renderizado em /produto/:slug com SKU exato',
      'Voltar preserva posição de scroll'
    ]
  },

  CategoryTile: {
    proteinId: 'CategoryTile',
    version: 2,
    domAnatomy: ['.category-tile', '.category-thumb', '.category-tile__label-btn'],
    slots: ['media', 'title'],
    variants: [{ name: 'tile', containerMinPx: 160, description: 'Card compacto de categoria' }],
    acceptedGenes: ['tile.ratio', 'tile.radius', 'media.fit'],
    minContainerPx: 160,
    states: ['idle', 'hover', 'selected'],
    events: ['category.select'],
    actions: ['category.select'],
    qaInvariants: ['Alvo mínimo 44x44px', 'MediaFrame isolado']
  },

  KitSlot: {
    proteinId: 'KitSlot',
    version: 2,
    domAnatomy: ['.kit-slot', '.kit-slot__image', '.kit-slot__name'],
    slots: ['media', 'label', 'status'],
    variants: [{ name: 'standard', containerMinPx: 160, description: 'Slot de item do kit' }],
    acceptedGenes: ['slot.radius', 'media.fit'],
    minContainerPx: 160,
    states: ['empty', 'filled', 'active'],
    events: ['slot.activate'],
    actions: ['slot.activate'],
    qaInvariants: ['Feedback claro de seleção']
  },

  KitOptionCard: {
    proteinId: 'KitOptionCard',
    version: 2,
    domAnatomy: ['.kit-option-card', '.kit-option-card__image', '.kit-option-card__title', '.kit-option-card__price'],
    slots: ['media', 'title', 'price'],
    variants: [{ name: 'standard', containerMinPx: 160, description: 'Opção de produto para kit' }],
    acceptedGenes: ['card.radius', 'media.fit', 'price.format'],
    minContainerPx: 160,
    states: ['idle', 'selected'],
    events: ['kitOption.select'],
    actions: ['kitOption.select'],
    qaInvariants: ['Preço em linha única', 'Alvo de clique acessível']
  },

  BookingPanel: {
    proteinId: 'BookingPanel',
    version: 2,
    domAnatomy: ['.booking-scene', '.booking-background', '.booking-copy', '.booking-form'],
    slots: ['background', 'title', 'form'],
    variants: [{ name: 'split', containerMinPx: 320, description: 'Painel com formulário e cena' }],
    acceptedGenes: ['booking.bgFit', 'form.radius'],
    minContainerPx: 320,
    states: ['idle', 'submitting'],
    events: ['booking.submit'],
    actions: ['whatsapp.open'],
    qaInvariants: ['Cover apenas com crop aprovado', 'Interpolação no WhatsApp']
  },

  QuantityControl: {
    proteinId: 'QuantityControl',
    version: 2,
    domAnatomy: ['.quantity-control', '.quantity-control__btn', '.quantity-control__input'],
    slots: ['decrease', 'display', 'increase'],
    variants: [{ name: 'standard', containerMinPx: 160, description: 'Controle numérico de quantidade' }],
    acceptedGenes: ['control.size', 'control.step'],
    minContainerPx: 160,
    states: ['idle', 'minReached', 'maxReached'],
    events: ['quantity.change'],
    actions: ['quantity.change'],
    qaInvariants: ['Alvos de toque mínimos de 44x44px', 'Respeita limites de estoque']
  },

  SearchInput: {
    proteinId: 'SearchInput',
    version: 2,
    domAnatomy: ['.search-input-container', '.search-input-field', 'input[type=search]'],
    slots: ['input', 'icon', 'popover'],
    variants: [{ name: 'standard', containerMinPx: 200, description: 'Campo de busca integrado' }],
    acceptedGenes: ['search.debounceMs', 'search.placeholder'],
    minContainerPx: 200,
    states: ['idle', 'focused', 'hasQuery'],
    events: ['search.input', 'search.submit'],
    actions: ['search.query'],
    qaInvariants: ['Debounce de 150ms', 'Acessível por teclado']
  },

  FeatureBand: {
    proteinId: 'FeatureBand',
    version: 2,
    domAnatomy: ['.feature-band', '.feature-band__item'],
    slots: ['items'],
    variants: [{ name: 'band', containerMinPx: 320, description: 'Faixa de diferenciais' }],
    acceptedGenes: ['band.gap', 'band.background'],
    minContainerPx: 320,
    states: ['idle'],
    events: [],
    actions: [],
    qaInvariants: ['Contraste adequado', 'Layout responsivo em colunas']
  },

  Announcement: {
    proteinId: 'Announcement',
    version: 2,
    domAnatomy: ['.shop-announcement', '.shop-announcement__content'],
    slots: ['eyebrow', 'title', 'cta'],
    variants: [{ name: 'strip', containerMinPx: 320, description: 'Faixa de comunicado' }],
    acceptedGenes: ['announcement.background', 'announcement.align'],
    minContainerPx: 320,
    states: ['idle'],
    events: ['cta.click'],
    actions: ['catalog.jump'],
    qaInvariants: ['CTA opcional funcional']
  },

  EditorialSection: {
    proteinId: 'EditorialSection',
    version: 2,
    domAnatomy: ['.editorial-section', '.editorial-media', '.editorial-copy'],
    slots: ['media', 'title', 'body', 'cta'],
    variants: [{ name: 'split', containerMinPx: 320, description: 'Seção editorial de história ou contato' }],
    acceptedGenes: ['editorial.ratio', 'media.fit'],
    minContainerPx: 320,
    states: ['idle'],
    events: ['cta.click'],
    actions: ['whatsapp.open', 'catalog.jump'],
    qaInvariants: ['MediaFrame com proporção declarada']
  },

  Footer: {
    proteinId: 'Footer',
    version: 2,
    domAnatomy: ['.shop-footer', '.shop-footer__container', '.shop-footer__support-btn'],
    slots: ['brand', 'address', 'support'],
    variants: [{ name: 'standard', containerMinPx: 320, description: 'Rodapé comercial' }],
    acceptedGenes: ['footer.background', 'footer.textColor'],
    minContainerPx: 320,
    states: ['idle'],
    events: ['support.click'],
    actions: ['whatsapp.open'],
    qaInvariants: ['Oculta aviso fictício em modo público', 'Botão WhatsApp com alvo 44x44px']
  }
};

export const getProteinDefinition = (id: string): ProteinContract | undefined => proteinRegistry[id];
