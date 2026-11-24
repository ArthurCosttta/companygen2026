import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { RootErrorBoundary } from '@/components/ui/ErrorBoundary';
import { installVitePreloadRecovery } from '@/utils/chunk-recovery';
import { installGlobalCrashListeners } from '@/utils/crash-telemetry';
import '@/styles/index.css';

installVitePreloadRecovery();
installGlobalCrashListeners();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const isVirtualTupleHarness =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('virtual_tuple_harness') === '1';

const VirtualTupleHarness = lazy(() =>
  import('./components/views/storefront/VirtualTupleHarness').then((m) => ({
    default: m.VirtualTupleHarness,
  })),
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      {isVirtualTupleHarness ? (
        <Suspense fallback={null}>
          <VirtualTupleHarness />
        </Suspense>
      ) : (
        <App />
      )}
    </RootErrorBoundary>
  </React.StrictMode>,
);
