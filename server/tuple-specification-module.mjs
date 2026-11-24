import { pickContrastInk, tuneHexForMinContrast } from '../shared/formula-ir/visual-math-engine.mjs';
import { contrastRatio } from '../shared/formula-ir/atomic-grammar.mjs';

/**
 * Módulo de Especificação Formal da Tupla Atômica & Invariantes Visuais.
 * Define exatamente como cada cláusula funciona, proíbe bugs visuais (texto preto em fundo preto,
 * tags/pills acima de headlines) e especifica tipografia avançada, animações e botões modernos.
 */
export const TUPLE_CLAUSE_SPECIFICATION = {
  tuple: {
    syntax: '["<sectionId>", "<role>", "ESTADO_1|ESTADO_2"]',
    roles: {
      hero_stage: 'Capa principal em tela inteira (min-h-[78vh]) com imagem de fundo full-bleed e degradê lateral.',
      hero_split: 'Capa editorial 50/50 com headline avançada à esquerda e foto enquadrada de alta nitidez à direita.',
      hero_centered: 'Capa centralizada com tipografia de alto impacto e vitrine visual abaixo.',
      bento_spotlight: 'Grid assimétrico 7/5 destacando o produto carro-chefe + pilha rápida de itens complementares.',
      split_story: 'Narrativa autoral + métricas concretas à esquerda e fotografia editorial à direita.',
      dark_glass_vault: 'Seção escura com cards em vidro fosco (backdrop-blur) e destaque para itens premium.',
      sticky_lookbook: 'Briefing fixo no scroll à esquerda e pilha vertical editorial à direita.',
      coupled_media_grid: 'Cartões de categoria com foto edge-to-edge e barra inferior acoplada sem espaçamento morto.',
      catalog_full_grid: 'Grade pesquisável com filtros animados, selo Pix e cards modernos.',
      open_columns_strip: '3 diferenciais sem caixa pesada, divididos apenas por linha vertical fina 1px.',
      anchor_footer: 'Rodapé completo em 4 colunas ancorado na cor escura da marca.',
    },
  },
  surface: {
    syntax: 'ui:bg=<anchor_dark|ground|#HEX> lum=<0.0..1.0> | ux:<auto_wcag:4.5>',
    invariant: 'Texto escuro PROIBIDO em fundo escuro; texto claro PROIBIDO em fundo claro. Contraste mínimo 4.5:1.',
  },
  typography: {
    voices: ['fraunces', 'instrument_serif', 'syne', 'space_grotesk', 'bricolage', 'cormorant', 'playfair', 'plus_jakarta'],
    rules: [
      'NUNCA colocar tags, pills ou badges flutuantes em cima de headlines <h1> ou títulos principais <h2>.',
      'Usar <accent>...</accent> em no máximo 2 palavras finais da headline para criar foco óptico.',
      'Manter tracking negativo (-0.03em a -0.04em) em títulos display acima de 32px.',
    ],
  },
  buttons: {
    rule: 'Botões modernos com borda interna sutil 1px (inner shine), elevação hover (-1px), seta animada no hover e contraste >= 4.5:1.',
  },
  heroBackground: {
    rule: 'Em hero_stage, a fotografia DEVE cobrir 100% do fundo da seção (full-bleed) com scrim degradê suave protegendo a área do texto.',
  },
  motion: {
    variants: ['fx:hero_cinematic dur=650', 'fx:stagger_reveal dur=380', 'fx:scroll_parallax', 'fx:auto_animate_grid'],
  },
};

export function renderTupleSpecificationXmlTag() {
  return [
    '<tuple_specification>',
    '  <design_rules>',
    '    1. ZERO_TAGS_OVER_HEADLINES: É TERMINANTEMENTE PROIBIDO gerar eyebrow, badge ou pill em cima de H1 ou H2. Deixe eyebrow vazio ("") e comece direto pela headline forte.',
    '    2. CONTRAST_LOCK: Em fundos escuros (anchor_dark, lum < 0.45), texto e botões secundários DEVEM ter alto contraste claro (#FFFFFF / #F8FAFC). Em fundos claros (ground, lum >= 0.45), texto DEVE ser escuro (#09090B / #1E293B). NUNCA gere texto escuro sobre fundo escuro.',
    '    3. FULL_BLEED_HERO_IMAGE: Quando role="hero_stage", a imagem ocupa 100% do fundo da tela inteira (fullscreen) com scrim degradê protege-leitura no lado esquerdo.',
    '    4. MODERN_BUTTONS: Botões primários e secundários usam altura mínima 46px, cantos refinados, borda sutil 1px, micro-animação na seta e contraste garantido.',
    '    5. ZERO_GENERIC_COPY: Proibido usar chavões como "Destaques do catálogo", "Explorar experiência", "Vitrine online com atendimento no WhatsApp" ou "Monte sua seleção". Escreva copy 100% personalizada para o nicho, os produtos reais e a dor do cliente.',
    '  </design_rules>',
    `  <advanced_fonts>${TUPLE_CLAUSE_SPECIFICATION.typography.voices.join(' | ')}</advanced_fonts>`,
    `  <section_roles>${Object.entries(TUPLE_CLAUSE_SPECIFICATION.tuple.roles).map(([k, v]) => `${k}: ${v}`).join(' || ')}</section_roles>`,
    '</tuple_specification>',
  ].join('\n');
}

  /**
   * Garante na marra que cor de tinta e fundo nunca colidam (ex: texto preto em fundo preto).
   */
  export function enforceSafeTextContrast(candidateInkHex, bgHex) {
    const safeBg = /^#[0-9a-f]{6}$/i.test(String(bgHex || '')) ? String(bgHex) : '#FFFFFF';
    const candidate = /^#[0-9a-f]{6}$/i.test(String(candidateInkHex || '')) ? String(candidateInkHex) : '';
    if (candidate && contrastRatio(candidate, safeBg) >= 4.5) {
      return candidate;
    }
    const ideal = pickContrastInk(safeBg);
    return tuneHexForMinContrast(ideal, safeBg, 4.6);
  }

  /**
   * Spec padrão enxuta (sem contaminar o prompt do GLM com ruído):
   * os 50 macetes compilam em 5 containers determinísticos acoplados ao renderer e motion engine.
   */
  export const DEFAULT_DESIGN_CONTAINERS = {
    buttonMotionSpec: {
      cornerProfile: 'editorial_soft',
      radiusPx: 12,
      minHeightPx: 48,
      specularInset: true,
      tintedShadow: true,
      sheenSweep: true,
      iconGlidePx: 5,
      secondaryTreatment: 'glass_hairline',
      pressScale: 0.965,
      spring: { stiffness: 420, damping: 26, mass: 0.8 },
      keyframes: [
        { at: 0, state: 'enter', y: 12, scale: 0.97, opacity: 0 },
        { at: 0.65, state: 'enter', y: -1, scale: 1.005, opacity: 1 },
        { at: 1, state: 'enter', y: 0, scale: 1, opacity: 1 },
        { at: 0, state: 'hover', y: 0, scale: 1, glowAlpha: 0.22 },
        { at: 1, state: 'hover', y: -2, scale: 1.015, glowAlpha: 0.44 },
      ],
      durationMs: 420,
      easeCurve: [0.16, 1, 0.3, 1],
    },
    photoCompositingSpec: {
      fullScreenHero: true,
      minHeightVh: 80,
      fit: 'cover',
      focalObjectPosition: '70% center',
      scrimDirection: 'to_right',
      scrimStrength: 0.88,
      edgeFeatherPx: 28,
      backlitGlowOpacity: 0.22,
      colorGradePreset: 'editorial_crisp',
      kenBurnsFrames: [
        { at: 0, scale: 1.06, opacity: 0.88 },
        { at: 1, scale: 1, opacity: 1 },
      ],
      kenBurnsDurationMs: 900,
      brokenMediaGraceful: true,
    },
    typographySpec: {
      eyebrowForbidden: true,
      opticalTrackingEm: -0.032,
      displayLineHeight: 1.05,
      bodyLineHeight: 1.58,
      measureMaxCh: 46,
      textWrap: 'balance',
      tabularNums: true,
    },
    atmosphereContrastSpec: {
      minContrastRatio: 4.6,
      localSurfaceLock: true,
      paperGrainOpacity: 0.025,
      shadowElevation: 3,
      hairlineAlpha: 0.14,
    },
    sectionChoreographySpec: {
      sequenceOrder: ['photo_ken_burns:0', 'headline:90', 'body:180', 'buttons:250'],
      staggerStepMs: 65,
      cardHoverLiftPx: -3,
      ribbonHoverPause: true,
      viewportOnce: true,
      reducedMotionSafe: true,
    },
  };

  export function resolveDesignContainers(overrides = {}, role = 'hero_stage') {
    const o = overrides && typeof overrides === 'object' ? overrides : {};
    const photoDefaults = {
      ...DEFAULT_DESIGN_CONTAINERS.photoCompositingSpec,
      fullScreenHero: role === 'hero_stage' ? o.fullScreenHero !== false : Boolean(o.fullScreenHero),
      minHeightVh: role === 'hero_stage' && o.fullScreenHero !== false ? Number(o.minHeightVh || 80) : Number(o.minHeightVh || 58),
    };
    return {
      buttonMotionSpec: {
        ...DEFAULT_DESIGN_CONTAINERS.buttonMotionSpec,
        ...(o.buttonMotionSpec && typeof o.buttonMotionSpec === 'object' ? o.buttonMotionSpec : {}),
      },
      photoCompositingSpec: {
        ...photoDefaults,
        ...(o.photoCompositingSpec && typeof o.photoCompositingSpec === 'object' ? o.photoCompositingSpec : {}),
      },
      typographySpec: {
        ...DEFAULT_DESIGN_CONTAINERS.typographySpec,
        ...(o.typographySpec && typeof o.typographySpec === 'object' ? o.typographySpec : {}),
      },
      atmosphereContrastSpec: {
        ...DEFAULT_DESIGN_CONTAINERS.atmosphereContrastSpec,
        ...(o.atmosphereContrastSpec && typeof o.atmosphereContrastSpec === 'object' ? o.atmosphereContrastSpec : {}),
      },
      sectionChoreographySpec: {
        ...DEFAULT_DESIGN_CONTAINERS.sectionChoreographySpec,
        ...(o.sectionChoreographySpec && typeof o.sectionChoreographySpec === 'object' ? o.sectionChoreographySpec : {}),
      },
    };
  }
