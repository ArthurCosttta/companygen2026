import { useEffect, useRef } from 'react';

export function useVisibilityAwareInterval(
  callback: () => void,
  delayMs: number | null,
  options?: { runOnVisible?: boolean },
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;
  const runOnVisible = Boolean(options?.runOnVisible);

  useEffect(() => {
    if (delayMs === null || delayMs <= 0 || typeof window === 'undefined') return;
    let timerId: number | null = null;

    const startTimer = () => {
      if (timerId !== null) return;
      timerId = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        savedCallback.current();
      }, delayMs);
    };

    const stopTimer = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        stopTimer();
      } else {
        startTimer();
        if (runOnVisible) savedCallback.current();
      }
    };

    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      startTimer();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [delayMs, runOnVisible]);
}
