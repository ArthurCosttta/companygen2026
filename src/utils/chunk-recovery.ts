/**
 * Chunk & Vite preload error recovery for stale assets after Cloud Run / Firebase deploys.
 * Uses a 15-second sessionStorage cooldown so reload loops cannot happen.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RELOAD_STAMP_KEY = 'cg_chunk_reload_stamp_v1';
const CHUNK_RELOAD_COUNT_KEY = 'cg_chunk_reload_count_v1';
const COOLDOWN_MS = 15_000;

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Unable to preload CSS/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Cannot read properties of undefined \(reading 'default'\)/i.test(msg) ||
    /reading 'default'/i.test(msg)
  );
}

export function clearChunkReloadGuard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_STAMP_KEY);
    window.sessionStorage.removeItem(CHUNK_RELOAD_COUNT_KEY);
  } catch {
    // Ignore storage restriction
  }
}

export function attemptOneTimeChunkReload(source = 'preloadError'): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const now = Date.now();
    const lastStamp = Number(window.sessionStorage.getItem(CHUNK_RELOAD_STAMP_KEY) || '0');
    const count = Number(window.sessionStorage.getItem(CHUNK_RELOAD_COUNT_KEY) || '0');
    if (lastStamp > 0 && now - lastStamp < COOLDOWN_MS && count >= 1) {
      return false;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_STAMP_KEY, String(now));
    window.sessionStorage.setItem(CHUNK_RELOAD_COUNT_KEY, String(lastStamp > 0 && now - lastStamp < COOLDOWN_MS ? count + 1 : 1));
    window.location.reload();
    return true;
  } catch {
    // Fall back to returning false instead of infinite reload if storage is unavailable
    void source;
    return false;
  }
}

let vitePreloadInstalled = false;

export function installVitePreloadRecovery(): void {
  if (vitePreloadInstalled || typeof window === 'undefined') return;
  vitePreloadInstalled = true;
  window.addEventListener('vite:preloadError', (event) => {
    const reloaded = attemptOneTimeChunkReload('vite:preloadError');
    if (reloaded && typeof event?.preventDefault === 'function') {
      event.preventDefault();
    }
  });
}

/**
 * Resiliencia para React.lazy em deploys novos (Firebase Hosting / Cloud Run):
 * evita `{ default: undefined }` e recupera automaticamente se um chunk antigo expirar.
 */
export function lazyNamed<
  M extends Record<string, any>,
  K extends keyof M,
  T extends ComponentType<any> = M[K] extends ComponentType<any> ? M[K] : ComponentType<any>,
>(
  loader: () => Promise<M>,
  exportName: K,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await loader();
      const candidate = mod && typeof mod === 'object' ? mod[exportName] ?? (mod as { default?: T }).default : undefined;
      if (typeof candidate !== 'function' && (!candidate || typeof candidate !== 'object')) {
        attemptOneTimeChunkReload(`missing_export:${String(exportName)}`);
        throw new Error(`Módulo "${String(exportName)}" indisponível nesta versão em cache.`);
      }
      return { default: candidate as T };
    } catch (err) {
      if (isChunkLoadError(err) || err instanceof TypeError) {
        attemptOneTimeChunkReload(`lazy_catch:${String(exportName)}`);
      }
      throw err;
    }
  });
}
