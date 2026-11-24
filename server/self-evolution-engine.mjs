import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Módulo de Autoevolução Visual (Zero-GLM Loop + Gates Objetivos + Critério de Parada).
 * Lê telemetria DOM/pixel + caminhos de crops do Component Studio CLI e avalia se o render
 * atingiu excelência ou qual camada da stack (math, spec, compiler, renderer) precisa evoluir.
 */

export const HARD_GATE_THRESHOLDS = {
  minNormalTextContrast: 4.5,
  minLargeHeadlineContrast: 3.0,
  minButtonContrast: 4.5,
  minButtonHeightPx: 34,
  minHeroButtonHeightPx: 44,
  minHeroViewportCoverage: 0.72,
  maxAllowedEyebrowTagsAboveH1: 0,
};

export function evaluateTelemetryAgainstGates(telemetry = {}, options = {}) {
  const gates = [];
  const role = String(telemetry.heroRole || options.role || '');
  const requireFullHero = Boolean(options.requireFullHero && role === 'hero_stage' && telemetry.heroHasPhoto);

  // G1: Contraste real contra ancestral opaco pintado
  const contrastViolations = Array.isArray(telemetry.contrastViolations) ? telemetry.contrastViolations : [];
  gates.push({
    id: 'G1_REAL_CONTRAST',
    passed: contrastViolations.length === 0,
    details:
      contrastViolations.length === 0
        ? `0 colisões de contraste (${telemetry.checkedTextNodes || 0} nós verificados)`
        : `${contrastViolations.length} colisões detectadas`,
    offenders: contrastViolations.slice(0, 8),
    mutationTarget: 'AtomicSectionRenderers.tsx (resolução local) + atomic-visual-critic.mjs + visual-math-engine.mjs',
  });

  // G2: Zero tags/pills acima de H1
  const eyebrowCount = Number(telemetry.eyebrowTagsAboveH1 || 0);
  gates.push({
    id: 'G2_ZERO_HEADLINE_TAGS',
    passed: eyebrowCount <= HARD_GATE_THRESHOLDS.maxAllowedEyebrowTagsAboveH1,
    details: `tags acima de H1 = ${eyebrowCount}`,
    offenders: telemetry.eyebrowOffenders || [],
    mutationTarget: 'AtomicSectionRenderers.tsx + FormulaTreeRenderer.tsx + neutral-fallback-v9.mjs',
  });

  // G3: Cobertura Hero full-screen quando hero_stage tem foto
  const heroRatio = Number(telemetry.heroHeightViewportRatio || 0);
  gates.push({
    id: 'G3_HERO_FULL_BLEED',
    passed: !requireFullHero || heroRatio >= HARD_GATE_THRESHOLDS.minHeroViewportCoverage,
    details: requireFullHero
      ? `altura hero / viewport = ${(heroRatio * 100).toFixed(1)}% (mínimo 72%)`
      : 'não aplicável ou hero compacto intencional',
    mutationTarget: 'AtomicGrammarCompiler.ts (heroMinHeightCss / minVh) + section-property-prompts.mjs',
  });

  // G4: Fonte carregada + tracking óptico negativo em H1 desktop
  const fontLoaded = telemetry.displayFontLoaded !== false;
  const h1FontSizePx = Number(telemetry.h1FontSizePx || 0);
  const h1LetterSpacingPx = Number(telemetry.h1LetterSpacingPx || 0);
  const trackingOk = h1FontSizePx < 28 || h1LetterSpacingPx <= 0;
  gates.push({
    id: 'G4_FONT_LOADED',
    passed: Boolean(fontLoaded && trackingOk),
    details: `fontLoaded=${fontLoaded} | h1Size=${h1FontSizePx.toFixed(1)}px | tracking=${h1LetterSpacingPx.toFixed(2)}px`,
    mutationTarget: 'index.html + AtomicGrammarCompiler.ts (resolveFontVoices + opticalTrackingEm)',
  });

  // G5: Anatomia moderna de botões
  const buttonViolations = Array.isArray(telemetry.buttonViolations) ? telemetry.buttonViolations : [];
  gates.push({
    id: 'G5_BUTTON_ANATOMY',
    passed: buttonViolations.length === 0,
    details:
      buttonViolations.length === 0
        ? `${telemetry.checkedButtons || 0} botões validados (>= altura mínima e contraste >= 4.5)`
        : `${buttonViolations.length} botões fora da anatomia`,
    offenders: buttonViolations.slice(0, 6),
    mutationTarget: 'AtomicSectionRenderers.tsx + DEFAULT_DESIGN_CONTAINERS.buttonMotionSpec',
  });

  // G6: Zero overflow horizontal & zero imagem quebrada
  const hasOverflow = Boolean(telemetry.horizontalOverflow);
  const brokenImages = Number(telemetry.brokenImagesCount || 0);
  gates.push({
    id: 'G6_NO_OVERFLOW_NO_404',
    passed: !hasOverflow && brokenImages === 0,
    details: `overflow=${hasOverflow} (${telemetry.scrollWidth}/${telemetry.clientWidth}) | brokenImgs=${brokenImages}`,
    mutationTarget: 'AtomicSectionRenderers.tsx (SafeCatalogImage / SafeHeroFallback / responsive grid)',
  });

  const failedGates = gates.filter((g) => !g.passed);
  const hardGatesFailed = failedGates.length;
  const deterministicScore = Math.max(0, Number((10 - hardGatesFailed * 1.8).toFixed(2)));

  return {
    passedAllHardGates: hardGatesFailed === 0,
    hardGatesFailed,
    deterministicScore,
    gates,
    failedGates,
  };
}

export function buildEvolutionCriticPrompt({
  roundNumber = 1,
  telemetryEvaluation,
  visualCrops = {},
  history = [],
}) {
  const prevMutations = history
    .slice(-4)
    .map((h) => `Round ${h.round}: score=${h.minVisualLens ?? h.deterministicScore} failed=${h.hardGatesFailed}`)
    .join('\n');

  return [
    `<self_evolution_critic round="${roundNumber}">`,
    `  <objective>Elevar todas as 5 Lentes Visuais para >= 8.8/10 e zerar todos os 6 Hard Gates sem gastar GLM.</objective>`,
    `  <hard_gate_telemetry>`,
    JSON.stringify(telemetryEvaluation, null, 2),
    `  </hard_gate_telemetry>`,
    `  <visual_crops_attached>`,
    JSON.stringify(visualCrops, null, 2),
    `  </visual_crops_attached>`,
    `  <previous_mutations>${prevMutations || 'Primeira rodada'}</previous_mutations>`,
    `  <evolution_instruction>`,
    `    1. Se hardGatesFailed > 0 ou qualquer lente visual estiver < 8.8, diagnostique a alavanca exata da stack.`,
    `    2. Evolua o container em tuple-specification-module.mjs, a fórmula OKLCH/escala/scrim em AtomicGrammarCompiler.ts ou o JSX em AtomicSectionRenderers.tsx.`,
    `    3. Só encerre o ciclo quando hardGatesFailed === 0 E minVisualLens >= 8.8 em pelo menos 2 paletas extremas.`,
    `  </evolution_instruction>`,
    `</self_evolution_critic>`,
  ].join('\n');
}

export function checkEvolutionStoppingCriteria(history = []) {
  if (!Array.isArray(history) || history.length === 0) {
    return { shouldStop: false, reason: 'NO_ROUNDS_RECORDED' };
  }
  const latest = history[history.length - 1];
  if (!latest.passedAllHardGates) {
    return { shouldStop: false, reason: `HARD_GATES_FAILED:${latest.hardGatesFailed}` };
  }
  const minLens = Number(latest.minVisualLens ?? latest.deterministicScore ?? 0);
  if (minLens < 8.8) {
    return { shouldStop: false, reason: `VISUAL_LENS_BELOW_TARGET:${minLens}` };
  }
  const testedThemes = new Set(history.filter((h) => h.passedAllHardGates).flatMap((h) => h.themesVerified || []));
  if (testedThemes.size < 2) {
    return { shouldStop: false, reason: `NEED_2_OPPOSITE_THEMES:found=${testedThemes.size}` };
  }
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const delta = Math.abs(minLens - Number(prev.minVisualLens ?? prev.deterministicScore ?? 0));
    if (prev.passedAllHardGates && delta < 0.15) {
      return { shouldStop: true, reason: `CONVERGED_STABLE_SCORE:${minLens}_DELTA_${delta.toFixed(2)}` };
    }
  }
  return { shouldStop: true, reason: `CONVERGED_ALL_GATES_AND_VISION:${minLens}` };
}

export async function recordEvolutionRound(historyPath, roundSummary) {
  const dir = path.dirname(historyPath);
  await mkdir(dir, { recursive: true });
  let existing = [];
  try {
    const raw = await readFile(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }
  existing.push({
    ...roundSummary,
    recordedAt: new Date().toISOString(),
  });
  const tmpPath = `${historyPath}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(existing, null, 2), 'utf-8');
  await rename(tmpPath, historyPath);
  return existing;
}
