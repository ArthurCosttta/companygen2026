import { geneStyle } from './gene-registry';
import type { Theme } from '../compiler/types';

export type ResolutionContext = {
  proteinId: string;
  proteinVersion?: number;
  theme?: Theme;
  presetGenes?: Record<string, unknown>;
  instanceGenes?: Record<string, unknown>;
  containerWidth?: number;
  state?: string; // 'idle' | 'hover' | 'press' | 'selected' | 'success' | 'error'
  responsive?: Record<string, Record<string, unknown>>;
};

export type ResolvedGeneMap = Record<string, unknown>;

export type GeneResolutionDiagnostic = {
  geneKey: string;
  resolvedValue: unknown;
  source: 'proteinDefault' | 'theme' | 'preset' | 'instance' | 'container' | 'state';
  path?: string;
  warning?: string;
};

export function resolveGene(params: {
  geneId: string;
  proteinDefault: unknown;
  themeTokens?: Record<string, unknown>;
  presetGenes?: Record<string, unknown>;
  instanceGenes?: Record<string, unknown>;
  containerWidth?: number;
  responsiveMap?: Record<string, Record<string, unknown>>;
  stateOverrides?: Record<string, Record<string, unknown>>;
  activeStates?: string[];
}): {
  effectiveValue: unknown;
  appliedLayer: 'proteinDefault' | 'theme' | 'preset' | 'instance' | 'containerWidth' | 'state';
} {
  let effectiveValue = params.proteinDefault;
  let appliedLayer: 'proteinDefault' | 'theme' | 'preset' | 'instance' | 'containerWidth' | 'state' =
    'proteinDefault';

  // 1. Theme
  if (params.themeTokens && params.themeTokens[params.geneId] !== undefined) {
    effectiveValue = params.themeTokens[params.geneId];
    appliedLayer = 'theme';
  }

  // 2. Preset
  if (params.presetGenes && params.presetGenes[params.geneId] !== undefined) {
    effectiveValue = params.presetGenes[params.geneId];
    appliedLayer = 'preset';
  }

  // 3. Instance
  if (params.instanceGenes && params.instanceGenes[params.geneId] !== undefined) {
    effectiveValue = params.instanceGenes[params.geneId];
    appliedLayer = 'instance';
  }

  // 4. Container Width
  if (params.containerWidth !== undefined && params.responsiveMap) {
    const w = String(params.containerWidth);
    if (params.responsiveMap[w] && params.responsiveMap[w][params.geneId] !== undefined) {
      effectiveValue = params.responsiveMap[w][params.geneId];
      appliedLayer = 'containerWidth';
    }
  }

  // 5. State
  if (params.activeStates && params.stateOverrides) {
    for (const st of params.activeStates) {
      if (params.stateOverrides[st] && params.stateOverrides[st][params.geneId] !== undefined) {
        effectiveValue = params.stateOverrides[st][params.geneId];
        appliedLayer = 'state';
      }
    }
  }

  return { effectiveValue, appliedLayer };
}

/**
 * Resolver de Genes V5 com ordem estrita de precedência:
 * protein default → theme → preset → instance → largura do contêiner → estado
 */
export function resolveGenes(
  proteinDefaults: Record<string, unknown>,
  context: ResolutionContext
): {
  resolved: ResolvedGeneMap;
  diagnostics: Record<string, GeneResolutionDiagnostic>;
  styles: Record<string, string | number>;
} {
  const resolved: ResolvedGeneMap = { ...proteinDefaults };
  const diagnostics: Record<string, GeneResolutionDiagnostic> = {};

  for (const [key, value] of Object.entries(proteinDefaults)) {
    diagnostics[key] = {
      geneKey: key,
      resolvedValue: value,
      source: 'proteinDefault'
    };
  }

  // 1. Herança do Tema
  if (context.theme) {
    if (context.theme.radius !== undefined) {
      resolved['surface.borderRadius'] = context.theme.radius;
      resolved['surface.radiusPx'] = context.theme.radius;
      diagnostics['surface.radiusPx'] = {
        geneKey: 'surface.radiusPx',
        resolvedValue: context.theme.radius,
        source: 'theme'
      };
    }
    if (context.theme.tokens) {
      for (const [tKey, tVal] of Object.entries(context.theme.tokens)) {
        if (tVal !== undefined) {
          resolved[tKey] = tVal;
          diagnostics[tKey] = {
            geneKey: tKey,
            resolvedValue: tVal,
            source: 'theme'
          };
        }
      }
    }
  }

  // 2. Preset da variante
  if (context.presetGenes) {
    for (const [key, value] of Object.entries(context.presetGenes)) {
      if (value !== undefined) {
        resolved[key] = value;
        diagnostics[key] = {
          geneKey: key,
          resolvedValue: value,
          source: 'preset'
        };
      }
    }
  }

  // 3. Override da Instância
  if (context.instanceGenes) {
    for (const [key, value] of Object.entries(context.instanceGenes)) {
      if (value !== undefined) {
        resolved[key] = value;
        diagnostics[key] = {
          geneKey: key,
          resolvedValue: value,
          source: 'instance'
        };
      }
    }
  }

  // 4. Breakpoint por Largura do Contêiner
  if (context.containerWidth !== undefined && context.responsive) {
    const width = context.containerWidth;
    const bp = ([320, 390, 480, 720, 768, 1024, 1440] as const)
      .filter(n => width >= n)
      .pop();

    if (bp && context.responsive[bp]) {
      for (const [key, value] of Object.entries(context.responsive[bp])) {
        if (value !== undefined) {
          resolved[key] = value;
          diagnostics[key] = {
            geneKey: key,
            resolvedValue: value,
            source: 'container'
          };
        }
      }
    }
  }

  // 5. Estado Atual (ex: pressScale, hover, etc.)
  if (context.state && context.state !== 'idle') {
    if (context.state === 'press') {
      const pressScale = resolved['motion.pressScale'] ?? 0.99;
      resolved['transform'] = `scale(${pressScale})`;
      diagnostics['transform'] = {
        geneKey: 'transform',
        resolvedValue: `scale(${pressScale})`,
        source: 'state'
      };
    } else if (context.state === 'selected') {
      const selectedBorder = resolved['surface.selectedBorder'] ?? '2px solid var(--accent, #FF8754)';
      resolved['surface.border'] = selectedBorder;
      diagnostics['surface.border'] = {
        geneKey: 'surface.border',
        resolvedValue: selectedBorder,
        source: 'state'
      };
    }
  }

  // Compilar estilos seguros whitelisted aplicáveis ao DOM
  const domInput: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resolved)) {
    if (
      k.startsWith('layout.') ||
      k.startsWith('dimensions.') ||
      k.startsWith('surface.') ||
      k.startsWith('typography.') ||
      k.startsWith('effects.') ||
      k.startsWith('animation.')
    ) {
      domInput[k] = v;
    }
  }

  let styles: Record<string, string | number> = {};
  try {
    styles = geneStyle(domInput);
  } catch {
    // Mantém fallback seguro se algum gene customizado não tiver mapping direto
  }

  return { resolved, diagnostics, styles };
}

/**
 * Validador de conflitos proibidos entre genes
 */
export function validateGeneConflicts(genes: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Regra 1: product_cutout com cover_approved
  if (genes['media.role'] === 'product_cutout' && genes['media.fit'] === 'cover_approved') {
    errors.push('media.role=product_cutout não pode usar media.fit=cover_approved sem aprovação fotográfica contextual.');
  }

  // Regra 2: cover_approved sem cropApproval
  if (genes['media.fit'] === 'cover_approved' && !genes['media.cropApproval']) {
    errors.push('media.fit=cover_approved exige media.cropApproval=true.');
  }

  // Regra 3: minTargetPx menor que 44px
  if (typeof genes['action.minTargetPx'] === 'number' && genes['action.minTargetPx'] < 44) {
    errors.push('action.minTargetPx deve ser no mínimo 44 px para conformidade com acessibilidade.');
  }

  return errors;
}
