import { useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, MessageSquare, ScanSearch } from 'lucide-react';
import { supabase } from '@/services/supabase-client';

export function AuthFlowView() {
  const [mode, setMode] = useState<'login' | 'signup' | 'link'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (error) throw error;
        setFeedback({ error: false, message: 'Se este e-mail estiver cadastrado, você receberá um link de acesso.' });
        return;
      }
      const credentials = { email: email.trim(), password };
      const { data, error } = mode === 'login'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
      if (error) throw error;
      if (!data.session) setFeedback({ error: false, message: 'Confira seu e-mail para confirmar a conta.' });
    } catch {
      setFeedback({ error: true, message: 'Não foi possível continuar. Confira os dados ou tente entrar por e-mail.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f1f3ef] p-4 text-[#152927] md:grid md:grid-cols-2 md:items-center md:gap-12 md:p-12">
      <section className="flex min-h-64 flex-col justify-between rounded-[1.6rem] bg-[#143d36] p-7 text-[#f5f7ed] md:min-h-[34rem] md:p-12">
        <p className="text-xl font-semibold tracking-tight">CompanyGen</p>
        <div className="mt-8">
          <h1 className="max-w-md text-4xl font-semibold tracking-tight md:text-6xl">Studio e atendimento</h1>
          <ul className="mt-8 grid gap-3 text-sm text-[#d3e1d8]">
            <li className="flex items-center gap-3"><CalendarDays size={18} /> Planeje e edite suas publicações</li>
            <li className="flex items-center gap-3"><ScanSearch size={18} /> Busque imagens para o catálogo</li>
            <li className="flex items-center gap-3"><MessageSquare size={18} /> Atenda pelo WhatsApp da sua conta</li>
          </ul>
        </div>
      </section>
      <section className="mx-auto w-full max-w-sm px-1 py-10" aria-labelledby="auth-heading">
        <h2 id="auth-heading" className="text-3xl font-semibold tracking-tight">
          {mode === 'signup' ? 'Criar conta' : mode === 'link' ? 'Entrar por e-mail' : 'Entrar no CompanyGen'}
        </h2>
        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            E-mail
            <input autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="cg-field" />
          </label>
          {mode !== 'link' && (
            <label className="grid gap-1.5 text-sm font-medium">
              Senha
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined}
                value={password} onChange={e => setPassword(e.target.value)} className="cg-field" />
            </label>
          )}
          {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-sm text-red-800' : 'text-sm'}>{feedback.message}</p>}
          <button type="submit" disabled={busy} className="cg-primary justify-between">
            {busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'link' ? 'Enviar link' : 'Entrar'} <ArrowRight size={17} />
          </button>
        </form>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-medium">
          {(mode === 'login' ? ['signup', 'link'] as const : ['login'] as const).map(option => (
            <button key={option} type="button" className="underline underline-offset-4"
              onClick={() => { setMode(option); setFeedback(null); setPassword(''); }}>
              {option === 'signup' ? 'Criar conta' : option === 'link' ? 'Usar link por e-mail' : 'Voltar para login'}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
