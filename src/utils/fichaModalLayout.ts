export const FICHA_MODAL_LAYOUT_ID = 'ficha-store-dialog';
export const FICHA_MODAL_TITLE_LAYOUT_ID = 'ficha-store-header';

export interface FichaModalLayoutParams {
  duration?: number;
  easing?: string;
  ease?: string;
}

const DEFAULT_DURATION_MS = 220;
const DEFAULT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const activeAnimations = new WeakMap<HTMLElement, Animation>();
let pendingRafId: number | null = null;

function cancelPendingLayoutFrame(): void {
  if (pendingRafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(pendingRafId);
    pendingRafId = null;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateModalTarget(
  target: HTMLElement,
  params?: FichaModalLayoutParams,
): void {
  if (typeof target.animate !== 'function') {
    return;
  }

  const prev = activeAnimations.get(target);
  if (prev) {
    prev.cancel();
    activeAnimations.delete(target);
  }

  const duration =
    typeof params?.duration === 'number' && params.duration > 0
      ? params.duration
      : DEFAULT_DURATION_MS;
  const easing = params?.easing ?? DEFAULT_EASING;

  target.style.willChange = 'transform, opacity';

  const animation = target.animate(
    [
      {
        opacity: 0,
        transform: 'translate3d(0, 10px, 0) scale3d(0.97, 0.97, 1)',
      },
      {
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)',
      },
    ],
    {
      duration,
      easing,
      fill: 'none',
    },
  );

  activeAnimations.set(target, animation);

  const cleanup = () => {
    if (activeAnimations.get(target) === animation) {
      activeAnimations.delete(target);
      target.style.willChange = '';
    }
  };

  animation.onfinish = cleanup;
  animation.oncancel = cleanup;
}

/**
 * Executa a atualização de estado do modal ("Preencher Dados da Loja") sem `flushSync`,
 * agendando uma animação GPU-composited leve (apenas `transform: translate3d/scale3d` + `opacity`)
 * via `requestAnimationFrame` no elemento alvo `[data-layout-id="ficha-store-dialog"]`.
 */
export function runWithFichaModalLayout(
  mutationFn: () => void,
  params?: FichaModalLayoutParams,
): void {
  if (
    typeof document === 'undefined' ||
    typeof requestAnimationFrame !== 'function' ||
    prefersReducedMotion()
  ) {
    mutationFn();
    return;
  }

  try {
    cancelPendingLayoutFrame();
    const selector = `[data-layout-id="${FICHA_MODAL_LAYOUT_ID}"]`;
    const previousTarget = document.querySelector<HTMLElement>(selector);

    mutationFn();

    const tryAnimate = (attempt: number) => {
      const target = document.querySelector<HTMLElement>(selector);
      if (target && (target !== previousTarget || attempt >= 1)) {
        pendingRafId = null;
        animateModalTarget(target, params);
        return;
      }
      if (attempt < 2) {
        pendingRafId = requestAnimationFrame(() => tryAnimate(attempt + 1));
      } else {
        pendingRafId = null;
      }
    };

    pendingRafId = requestAnimationFrame(() => tryAnimate(0));
  } catch {
    cancelPendingLayoutFrame();
    mutationFn();
  }
}
