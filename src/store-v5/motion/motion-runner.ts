export type MotionPreset =
  | 'none'
  | 'subtleFade'
  | 'lift'
  | 'press'
  | 'selected'
  | 'route';

export type MotionConfig = {
  pressMs: number;
  pressScale: number;
  selectedMs: number;
  modalBackdropMs: number;
  modalPanelMs: number;
  routeMs: number;
  reducedMotion: boolean;
};

export const defaultMotionConfig: MotionConfig = {
  pressMs: 110,
  pressScale: 0.985,
  selectedMs: 180,
  modalBackdropMs: 180,
  modalPanelMs: 200,
  routeMs: 260,
  reducedMotion: false
};

/**
 * Detecta suporte do navegador a prefers-reduced-motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * Executa transição com View Transition API com fallback instantâneo/CSS
 */
export async function runViewTransition(updateDom: () => void | Promise<void>): Promise<void> {
  const isReduced = prefersReducedMotion();

  // Se o usuário prefere movimento reduzido ou a API não existe
  if (isReduced || typeof document === 'undefined' || !(document as any).startViewTransition) {
    await updateDom();
    return;
  }

  try {
    const transition = (document as any).startViewTransition(async () => {
      await updateDom();
    });
    await transition.finished;
  } catch (e) {
    await updateDom();
  }
}

/**
 * Helper para estilos de movimento respeitando prefers-reduced-motion
 */
export function getMotionStyles(
  preset: MotionPreset,
  durationMs: number,
  isReduced = prefersReducedMotion()
): React.CSSProperties {
  if (isReduced || preset === 'none' || durationMs <= 0) {
    return {
      transition: 'none'
    };
  }

  switch (preset) {
    case 'subtleFade':
      return {
        transition: `opacity ${durationMs}ms ease`
      };
    case 'lift':
      return {
        transition: `transform ${durationMs}ms cubic-bezier(0.2, 0, 0, 1), box-shadow ${durationMs}ms ease`
      };
    case 'press':
      return {
        transition: `transform ${durationMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
      };
    case 'selected':
      return {
        transition: `border-color ${durationMs}ms ease, background-color ${durationMs}ms ease`
      };
    case 'route':
      return {
        transition: `opacity ${durationMs}ms ease, transform ${durationMs}ms ease`
      };
    default:
      return {};
  }
}
