import { useEffect, useState } from 'react';

export interface UseNetworkAndDraftGuardOptions {
  isDirty?: boolean;
  onSaveDraft?: () => void | Promise<void>;
}

export function useNetworkAndDraftGuard({
  isDirty = false,
  onSaveDraft,
}: UseNetworkAndDraftGuardOptions = {}) {
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  );

  useEffect(() => {
    const syncOnline = () => setIsOffline(false);
    const syncOffline = () => setIsOffline(true);
    const onCustomStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ offline?: boolean }>).detail;
      if (typeof detail?.offline === 'boolean') {
        setIsOffline(detail.offline);
      }
    };

    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOffline);
    window.addEventListener('companygen:network-status', onCustomStatus as EventListener);

    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOffline);
      window.removeEventListener('companygen:network-status', onCustomStatus as EventListener);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void onSaveDraft?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSaveDraft]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return { isOffline };
}
