import { useEffect, useRef } from 'react';

export function readStoredDraft<T>(storageKey: string): T | null {
  if (typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStoredDraft(storageKey: string): void {
  if (typeof window === 'undefined' || !storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage removal restrictions
  }
}

export function useDraftAutoSave<T>(
  storageKey: string,
  value: T,
  enabled = true,
  debounceMs = 450,
): void {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !storageKey || typeof window === 'undefined') return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Ignore QuotaExceededError gracefully
      }
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [storageKey, value, enabled, debounceMs]);
}
