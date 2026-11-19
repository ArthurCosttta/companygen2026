import { createClient, type User } from '@supabase/supabase-js';
import config from '@/config/supabase-public.json';

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
  user: { id: string; email: string };
  code: string;
  credits: number;
  balance: number;
  savedAt: string;
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
  return {
    id: session.user.id,
    email: session.user.email,
    app_metadata: { provider: 'local_showcase', code: session.code },
    user_metadata: { showcase: true },
    aud: 'authenticated',
    created_at: session.savedAt || new Date().toISOString(),
  } as User;
}

const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const AI_FETCH_TIMEOUT_MS = 60000;
const LONG_FETCH_TIMEOUT_MS = 120000;

function resolveFetchTimeoutMs(input: string): number {
  if (input.includes('generate-full') || input.includes('hunt') || input.includes('generate-image')) {
    return LONG_FETCH_TIMEOUT_MS;
  }
  if (
    input.includes('/api/whatsapp/ai/') ||
    input.includes('/api/ai/') ||
    input.includes('edit-block') ||
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
  const headers = new Headers(init?.headers);
  headers.set('Authorization', 'Bearer ' + accessToken);
  if (activeSupportReadonlySession && !input.startsWith('/api/admin/')) {
    headers.set('X-Support-Readonly', '1');
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
  try {
    res = await fetch(input, { ...init, headers, signal, cache: 'no-store', redirect: 'error' });
  } catch (err) {
    if (timeoutSignal?.aborted && !init?.signal?.aborted) {
      const timeoutErr = new Error('Tempo limite de resposta excedido. Tente novamente.');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (fallbackTimer !== undefined) {
      clearTimeout(fallbackTimer);
    }
  }
  if (typeof window !== 'undefined' && (res.status === 402 || input.startsWith('/api/store-molde/') || input.startsWith('/api/whatsapp/ai/') || input.startsWith('/api/ai/'))) {
    try {
      const cloned = await res.clone().json().catch(() => null);
      if (cloned && typeof cloned.balanceAfter === 'number') {
        window.dispatchEvent(
          new CustomEvent('companygen:credit-balance-updated', { detail: { balance: cloned.balanceAfter } }),
        );
      } else if (res.status === 402 && cloned) {
        if (typeof cloned.balance === 'number') {
          window.dispatchEvent(
            new CustomEvent('companygen:credit-balance-updated', { detail: { balance: cloned.balance } }),
          );
        }
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: cloned }));
      }
    } catch {}
  }
  return res;
}
