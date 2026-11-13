import { createClient } from '@supabase/supabase-js';
import config from '@/config/supabase-public.json';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
);

export async function authenticatedFetch(input: string, init?: RequestInit, expectedUser?: string) {
  if (!input.startsWith('/api/') || input.includes('\\')) throw new Error('Rota inválida.');
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session || (expectedUser && session.user.id !== expectedUser)) {
    throw new Error('Entre na sua conta para continuar.');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', 'Bearer ' + session.access_token);
  return fetch(input, { ...init, headers, cache: 'no-store', redirect: 'error' });
}
