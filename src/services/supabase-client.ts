import { createClient, type User } from '@supabase/supabase-js';
import config from '@/config/supabase-public.json';
import { captureAndReportCrash } from '@/utils/crash-telemetry';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
);

const LOCAL_SHOWCASE_STORAGE_KEY = 'cg_local_showcase_session_v1';

export interface SupportReadonlySession {
  userId: string;
  email?: string;
  businessName?: string;
}

let activeSupportReadonlySession: SupportReadonlySession | null = null;

export function setSupportReadonlySession(session: SupportReadonlySession | null): void {
  activeSupportReadonlySession = session;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('companygen:support-readonly-changed', { detail: session }),
    );
  }
}

export function getSupportReadonlySession(): SupportReadonlySession | null {
  return activeSupportReadonlySession;
}

export interface LocalShowcaseSession {
  token: string;
  user: { id: string; email: string; isGuest?: boolean };
  code: string;
  credits: number;
  balance: number;
  savedAt: string;
}

export function isGuestAccountUser(
  user: { email?: string | null; isGuest?: boolean; user_metadata?: Record<string, unknown> } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.isGuest === true) return true;
  if (user.user_metadata?.guest === true) return true;
  const email = String(user.email || '').trim().toLowerCase();
  return email.endsWith('@guest.companygen.store');
}

export function saveLocalShowcaseSession(session: LocalShowcaseSession): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(session);
  try {
    window.sessionStorage.setItem(LOCAL_SHOWCASE_STORAGE_KEY, serialized);
  } catch {}
  try {
    window.localStorage.setItem(LOCAL_SHOWCASE_STORAGE_KEY, serialized);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('companygen:local-showcase-auth', { detail: session }));
  } catch {}
}

export function readLocalShowcaseSession(): LocalShowcaseSession | null {
  if (typeof window === 'undefined') return null;
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = store.getItem(LOCAL_SHOWCASE_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as LocalShowcaseSession;
      if (parsed?.token && parsed?.user?.id) return parsed;
    } catch {
      // Ignore storage access errors
    }
  }
  return null;
}

export function clearLocalShowcaseSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LOCAL_SHOWCASE_STORAGE_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(LOCAL_SHOWCASE_STORAGE_KEY);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('companygen:local-showcase-auth', { detail: null }));
  } catch {}
}

export function toSupabaseUserFromShowcase(session: LocalShowcaseSession): User {
  const email = String(session.user.email || '');
  const isGuest = Boolean(session.user.isGuest) || email.toLowerCase().endsWith('@guest.companygen.store');
  return {
    id: session.user.id,
    email,
    app_metadata: { provider: 'local_showcase', code: session.code },
    user_metadata: { showcase: true, guest: isGuest },
    aud: 'authenticated',
    created_at: session.savedAt || new Date().toISOString(),
  } as User;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const AI_FETCH_TIMEOUT_MS = 75000;
const LONG_FETCH_TIMEOUT_MS = 120000;

function resolveFetchTimeoutMs(input: string): number {
  if (
    input.includes('generate-full') ||
    input.includes('create-page') ||
    input.includes('hunt') ||
    input.includes('generate-image') ||
    input.includes('generate-product-images')
  ) {
    return LONG_FETCH_TIMEOUT_MS;
  }
  if (
    input.includes('/api/whatsapp/ai/') ||
    input.includes('/api/ai/') ||
    input.includes('edit-block') ||
    input.includes('patch-section') ||
    input.includes('analyze-brief') ||
    input.includes('onboarding-assist') ||
    input.includes('ai-autofill') ||
    input.includes('instagram/analyze')
  ) {
    return AI_FETCH_TIMEOUT_MS;
  }
  return DEFAULT_FETCH_TIMEOUT_MS;
}

export async function authenticatedFetch(input: string, init?: RequestInit, expectedUser?: string) {
  if (!input.startsWith('/api/') || input.includes('\\')) throw new Error('Rota inválida.');

  // Prioriza a sessão real autenticada do Supabase para evitar que uma sessão showcase residual em localStorage a sobrescreva
  const localShowcase = typeof window !== 'undefined' ? readLocalShowcaseSession() : null;
  const { data, error } = await supabase.auth.getSession();
  const realToken = !error ? (data?.session?.access_token || '') : '';
  const realUserId = !error ? (data?.session?.user?.id || '') : '';

  let accessToken = '';
  let activeUserId = '';

  if (realToken && realUserId) {
    if (!expectedUser || realUserId === expectedUser) {
      accessToken = realToken;
      activeUserId = realUserId;
    } else if (localShowcase && localShowcase.user.id === expectedUser) {
      accessToken = localShowcase.token;
      activeUserId = localShowcase.user.id;
    }
  } else if (localShowcase && (!expectedUser || localShowcase.user.id === expectedUser)) {
    accessToken = localShowcase.token;
    activeUserId = localShowcase.user.id;
  }

  if (!accessToken || (expectedUser && activeUserId !== expectedUser)) {
    throw new Error('Entre na sua conta para continuar.');
  }

  const timeoutMs = resolveFetchTimeoutMs(input);
  let timeoutSignal: AbortSignal | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let signal: AbortSignal | undefined = init?.signal ?? undefined;

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (signal) {
      if (typeof AbortSignal.any === 'function') {
        signal = AbortSignal.any([signal, timeoutSignal]);
      } else {
        const fallbackController = new AbortController();
        const forwardAbort = (src: AbortSignal) => {
          if (!fallbackController.signal.aborted) {
            fallbackController.abort(src.reason);
          }
        };
        if (signal.aborted) forwardAbort(signal);
        else signal.addEventListener('abort', () => forwardAbort(signal!), { once: true });
        if (timeoutSignal.aborted) forwardAbort(timeoutSignal);
        else timeoutSignal.addEventListener('abort', () => forwardAbort(timeoutSignal!), { once: true });
        signal = fallbackController.signal;
      }
    } else {
      signal = timeoutSignal;
    }
  } else if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', () => controller.abort(signal?.reason), { once: true });
    }
    timeoutSignal = controller.signal;
    fallbackTimer = setTimeout(() => {
      controller.abort(new Error('Timeout'));
    }, timeoutMs);
    signal = controller.signal;
  }

  let res: Response;
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const methodUpper = String(init?.method || 'GET').toUpperCase();
  const cleanRoute = input.split('?')[0];
  const doFetch = async (tokenToUse: string) => {
    const reqHeaders = new Headers(init?.headers);
    reqHeaders.set('Authorization', 'Bearer ' + tokenToUse);
    if (activeSupportReadonlySession && !input.startsWith('/api/admin/')) {
      reqHeaders.set('X-Support-Readonly', '1');
    }
    return fetch(input, { ...init, headers: reqHeaders, signal, cache: 'no-store', redirect: 'error' });
  };

  try {
    res = await doFetch(accessToken);
    // QA14-05: Renovação silenciosa de JWT no 401 (1 retry) para manter Desktop aberto 24h sem deslogar
    const isUsingRealSupabaseSession = Boolean(realToken && accessToken === realToken);
    if (res.status === 401 && isUsingRealSupabaseSession) {
      try {
        const refreshed = await supabase.auth.refreshSession();
        const freshToken = refreshed?.data?.session?.access_token || '';
        const freshUserId = refreshed?.data?.session?.user?.id || '';
        if (freshToken && (!expectedUser || freshUserId === expectedUser)) {
          res = await doFetch(freshToken);
        }
      } catch {
        // Mantém o 401 original se refresh falhar
      }
    }
  } catch (err) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    if (timeoutSignal?.aborted && !init?.signal?.aborted) {
      const timeoutErr = new Error('Tempo limite de resposta excedido. Tente novamente.');
      timeoutErr.name = 'TimeoutError';
      void captureAndReportCrash({
        severity: 'error',
        source: 'client_api',
        category: 'API_TIMEOUT',
        title: `Timeout ${methodUpper} ${cleanRoute}`,
        message: `Requisição ${methodUpper} ${cleanRoute} excedeu ${timeoutMs}ms`,
        endpoint: cleanRoute,
        method: methodUpper,
        statusCode: 408,
        extra: { durationMs: Math.round(elapsed) },
      });
      throw timeoutErr;
    }
    if (!init?.signal?.aborted) {
      void captureAndReportCrash({
        severity: 'error',
        source: 'client_api',
        category: 'API_NETWORK_ERROR',
        title: `Falha de rede ${methodUpper} ${cleanRoute}`,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack || '' : '',
        endpoint: cleanRoute,
        method: methodUpper,
        extra: { durationMs: Math.round(elapsed) },
      });
    }
    throw err;
  } finally {
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
    }
  }
  if (!cleanRoute.includes('/api/telemetry/crash') && res.status >= 500) {
    const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
    void res
      .clone()
      .json()
      .catch(() => null)
      .then((errJson) => {
        const errDetail = String(errJson?.error || errJson?.message || `HTTP ${res.status}`);
        void captureAndReportCrash({
          severity: 'critical',
          source: 'client_api',
          category: `HTTP_${res.status}`,
          title: `Falha HTTP ${res.status} em ${methodUpper} ${cleanRoute}`,
          message: errDetail,
          endpoint: cleanRoute,
          method: methodUpper,
          statusCode: res.status,
          extra: { durationMs },
        });
      });
  }
  if (typeof window !== 'undefined' && (res.status === 402 || input.startsWith('/api/store-molde/') || input.startsWith('/api/whatsapp/ai/') || input.startsWith('/api/ai/'))) {
    try {
      const cloned = await res.clone().json().catch(() => null);
      if (cloned && typeof cloned.debited === 'number' && cloned.debited > 0) {
        window.dispatchEvent(
          new CustomEvent('companygen:credit-spent', {
            detail: {
              debited: Number(cloned.debited),
              action: String(cloned.action || input),
              balanceAfter: typeof cloned.balanceAfter === 'number' ? cloned.balanceAfter : undefined,
              at: new Date().toISOString(),
            },
          }),
        );
      }
      if (cloned && typeof cloned.balanceAfter === 'number') {
        window.dispatchEvent(
          new CustomEvent('companygen:credit-balance-updated', { detail: { balance: cloned.balanceAfter } }),
        );
        window.dispatchEvent(
          new CustomEvent('companygen:credits-updated', { detail: { balance: cloned.balanceAfter } }),
        );
      } else if (res.status === 402 && cloned) {
        if (typeof cloned.balance === 'number') {
          window.dispatchEvent(
            new CustomEvent('companygen:credit-balance-updated', { detail: { balance: cloned.balance } }),
          );
          window.dispatchEvent(
            new CustomEvent('companygen:credits-updated', { detail: { balance: cloned.balance } }),
          );
        }
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: cloned }));
      }
    } catch {}
  }
  return res;
}
