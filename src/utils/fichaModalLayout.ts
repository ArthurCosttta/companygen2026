import { flushSync } from 'react-dom';
import { createLayout, type AutoLayout, type LayoutAnimationParams } from 'animejs';

export const FICHA_MODAL_LAYOUT_ID = 'ficha-store-dialog';
export const FICHA_MODAL_TITLE_LAYOUT_ID = 'ficha-store-header';

const DEFAULT_LAYOUT_PARAMS: LayoutAnimationParams = {
  duration: 420,
  ease: 'outExpo',
  enterFrom: {
    opacity: 0,
    duration: 280,
    ease: 'outCubic',
  },
  leaveTo: {
    opacity: 0,
    duration: 220,
    ease: 'inCubic',
  },
};

let sharedFichaLayout: AutoLayout | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getFichaLayout(): AutoLayout | null {
  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  if (sharedFichaLayout && sharedFichaLayout.root === document.body) {
    return sharedFichaLayout;
  }

  sharedFichaLayout = createLayout(document.body, {
    children: [
      `[data-layout-id="${FICHA_MODAL_LAYOUT_ID}"]`,
      `[data-layout-id="${FICHA_MODAL_TITLE_LAYOUT_ID}"]`,
    ],
    properties: ['borderRadius', 'backgroundColor', 'borderColor', 'opacity'],
    ...DEFAULT_LAYOUT_PARAMS,
  });

  return sharedFichaLayout;
}

/**
 * Executa uma atualização síncrona do estado do modal ("Preencher Dados da Loja")
 * dentro do ciclo `layout.update()` do Anime.js v4 (`createLayout`),
 * reproduzindo a transição espacial FLIP de card -> dialog e dialog -> card.
 */
export function runWithFichaModalLayout(
  mutationFn: () => void,
  params?: LayoutAnimationParams,
): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    mutationFn();
    return;
  }

  const layout = getFichaLayout();
  if (!layout) {
    mutationFn();
    return;
  }

  try {
    layout.update(
      () => {
        flushSync(() => {
          mutationFn();
        });
      },
      {
        ...DEFAULT_LAYOUT_PARAMS,
        ...params,
      },
    );
  } catch {
    mutationFn();
  }
}
