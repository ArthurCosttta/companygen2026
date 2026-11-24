import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { clearLocalShowcaseSession, supabase } from '@/services/supabase-client';

export const PENDING_GUEST_CLAIM_KEY = 'cg_pending_guest_claim_v1';

export interface GuestClaimEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guestToken: string;
  inviteCode?: string;
  currentCredits?: number;
  storeName?: string;
  onClaimed?: (result: { email: string; balance?: number; userId?: string }) => void;
}

export function GuestClaimEmailModal({
  open,
  onOpenChange,
  guestToken,
  inviteCode,
  currentCredits,
  storeName,
  onClaimed,
}: GuestClaimEmailModalProps) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [companyName, setCompanyName] = useState(storeName || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  async function finalizeClaimWithToken(accessToken: string, realEmail: string) {
    const claimRes = await fetch('/api/access/claim-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        guestToken,
        code: inviteCode || '',
      }),
    });
    const claimJson = await claimRes.json().catch(() => null);
    if (!claimRes.ok || !claimJson?.ok) {
      throw new Error(claimJson?.error || 'Não foi possível vincular sua loja a este e-mail.');
    }
    try {
      sessionStorage.removeItem('cg_validated_invite');
      sessionStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
      localStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
    } catch {}
    clearLocalShowcaseSession();
    showToast({
      type: 'success',
      message: `E-mail ${realEmail} vinculado com sucesso! Sua loja e créditos foram salvos na sua conta.`,
      durationMs: 4500,
    });
    onOpenChange(false);
    onClaimed?.({
      email: realEmail,
      balance: typeof claimJson.balance === 'number' ? claimJson.balance : undefined,
      userId: claimJson.userId,
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.includes('@') || password.length < 6) {
      setErrorMsg('Informe um e-mail válido e senha com pelo menos 6 caracteres.');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setInfoMsg('');
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          throw new Error('E-mail ou senha incorretos. Verifique seus dados e tente novamente.');
        }
        const token = data?.session?.access_token;
        if (!token) {
          throw new Error('Sessão não iniciada. Tente entrar novamente.');
        }
        await finalizeClaimWithToken(token, cleanEmail);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            company_name: (companyName || storeName || 'Minha Loja').trim(),
          },
        },
      });
      if (error) {
        const low = (error.message || '').toLowerCase();
        if (low.includes('already') || low.includes('registered') || low.includes('exists')) {
          setMode('login');
          setErrorMsg('Este e-mail já tem cadastro. Digite sua senha para entrar e vincular esta loja a ele.');
          return;
        }
        throw new Error(error.message || 'Não foi possível criar sua conta agora.');
      }

      const token = data?.session?.access_token;
      if (token) {
        await finalizeClaimWithToken(token, cleanEmail);
        return;
      }

      // Caso a confirmação de e-mail esteja ativa no projeto Supabase, salva pendência para concluir ao logar
      try {
        const pendingPayload = JSON.stringify({
          guestToken,
          code: inviteCode || '',
          email: cleanEmail,
          savedAt: new Date().toISOString(),
        });
        localStorage.setItem(PENDING_GUEST_CLAIM_KEY, pendingPayload);
        sessionStorage.setItem(PENDING_GUEST_CLAIM_KEY, pendingPayload);
      } catch {}
      setInfoMsg(
        'Conta criada! Confirme o link enviado para o seu e-mail e faça login — sua loja e créditos serão vinculados automaticamente.',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao vincular e-mail.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="sm"
      mobileHeight="auto"
      preventCloseWhileSubmitting={busy}
      title="Vincular meu e-mail à loja"
      description="Transforme este acesso convidado em uma conta definitiva com e-mail e senha sem perder sua loja nem seus créditos."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton
            variant="secondary"
            size={44}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Agora não
          </ActionButton>
          <ActionButton
            type="submit"
            form="guest-claim-email-form"
            data-testid="guest-claim-submit-btn"
            variant="primary"
            size={44}
            isLoading={busy}
            loadingText="Vinculando..."
            rightIcon={<ArrowRight className="size-4" />}
          >
            {mode === 'signup' ? 'Salvar com este e-mail' : 'Entrar e vincular loja'}
          </ActionButton>
        </div>
      }
    >
      <form id="guest-claim-email-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          <span className="inline-flex items-center gap-1.5 font-bold">
            <KeyRound className="size-3.5 text-emerald-700" />
            {inviteCode ? `Código ${inviteCode}` : 'Sessão convidada ativa'}
          </span>
          {typeof currentCredits === 'number' ? (
            <span className="rounded-full bg-white px-2.5 py-0.5 font-extrabold text-emerald-800 shadow-2xs">
              {currentCredits.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr preservados
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg('');
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Criar conta nova
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
            }}
            className={`rounded-lg py-2 transition ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Já tenho e-mail
          </button>
        </div>

        {mode === 'signup' && !storeName ? (
          <div>
            <label htmlFor="claim-company-name" className="mb-1 block text-xs font-semibold text-slate-700">
              Nome da loja (opcional)
            </label>
            <input
              id="claim-company-name"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex.: Minha Loja"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="claim-email-input" className="mb-1 block text-xs font-semibold text-slate-700">
            Seu e-mail de acesso
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="claim-email-input"
              data-testid="guest-claim-email-input"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@suaempresa.com.br"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="claim-password-input" className="mb-1 block text-xs font-semibold text-slate-700">
            {mode === 'signup' ? 'Crie uma senha (mín. 6 caracteres)' : 'Sua senha'}
          </label>
          <div className="relative">
            <input
              id="claim-password-input"
              data-testid="guest-claim-password-input"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-3.5 pr-11 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-1 flex w-10 items-center justify-center text-slate-500 hover:text-slate-800"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {errorMsg ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {errorMsg}
          </div>
        ) : null}

        {infoMsg ? (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>{infoMsg}</span>
          </div>
        ) : null}

        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" />
          <span>Após vincular, o código {inviteCode || 'de entrada'} fica exclusivo deste e-mail.</span>
        </p>
      </form>
    </ModalContainer>
  );
}
