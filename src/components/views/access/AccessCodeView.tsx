import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Clock, Lock } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useToast } from '@/components/ui/ToastProvider';
import { saveLocalShowcaseSession } from '@/services/supabase-client';
import { getBrandHorizontalLogo, useDocumentDarkMode } from '@/utils/themeLogos';
import {
  buildAccessCreditsSummary,
  normalizeInviteCodeInput,
} from '@/utils/inviteCode';

export { normalizeInviteCodeInput };

export interface AccessCodeViewProps {
  onSuccess?: (codeData: { code: string; credits: number }) => void;
  onGoToLogin?: () => void;
}

export type AccessCodeState =
  | 'idle'
  | 'loading'
  | 'invalid'
  | 'expired'
  | 'already_redeemed'
  | 'activated';

export function formatAccessCodeInput(raw: string): string {
  return normalizeInviteCodeInput(raw);
}

export function AccessCodeView({ onSuccess, onGoToLogin }: AccessCodeViewProps) {
  const { showToast } = useToast();
  const isDark = useDocumentDarkMode();
  const [code, setCode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qrParam = (params.get('qr') || '').trim();
      if (qrParam) {
        sessionStorage.setItem('cg_entry_qr', qrParam);
      }
      const q = normalizeInviteCodeInput(params.get('code') || params.get('invite') || '');
      if (/^AI10-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(q)) return q;
    } catch {}
    return 'AI10-';
  });
  const [state, setState] = useState<AccessCodeState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [creditsAwarded, setCreditsAwarded] = useState<number>(0);
  const debounceAbortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const formatted = normalizeInviteCodeInput(val);
    setCode(formatted);
    if (formatted.length < 14 || formatted !== code) {
      debounceAbortRef.current?.abort();
      setCreditsAwarded(0);
    }
    if (state !== 'idle') {
      setState('idle');
      setErrorMessage('');
    }
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData?.getData('text');
    if (typeof pasted === 'string' && pasted.trim()) {
      e.preventDefault();
      const formatted = normalizeInviteCodeInput(pasted);
      setCode(formatted);
      if (formatted.length < 14 || formatted !== code) {
        debounceAbortRef.current?.abort();
        setCreditsAwarded(0);
      }
      if (state !== 'idle') {
        setState('idle');
        setErrorMessage('');
      }
    }
  };

  useEffect(() => {
    const cleanCode = code.trim();
    if (cleanCode.length !== 14 || !/^AI10-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(cleanCode)) {
      setCreditsAwarded(0);
      return;
    }
    if (submittingRef.current || state === 'activated') return;

    const timer = window.setTimeout(() => {
      if (submittingRef.current) return;
      debounceAbortRef.current?.abort();
      const ctrl = new AbortController();
      debounceAbortRef.current = ctrl;
      fetch('/api/access/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode, dryRun: true }),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (ctrl.signal.aborted) return;
          if (res.ok && data?.valid && Number(data.credits) > 0) {
            setCreditsAwarded(Number(data.credits));
          } else {
            setCreditsAwarded(0);
          }
        })
        .catch(() => {
          if (!ctrl.signal.aborted) {
            setCreditsAwarded(0);
          }
        });
    }, 150);

    return () => {
      window.clearTimeout(timer);
      debounceAbortRef.current?.abort();
    };
  }, [code, state]);

  const handleValidateCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim();
    debounceAbortRef.current?.abort();

    if (cleanCode.length !== 14 || !/^AI10-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(cleanCode)) {
      setState('invalid');
      setErrorMessage('Por favor, digite o código completo no formato AI10-XXXX-XXXX.');
      return;
    }

    submittingRef.current = true;
    setState('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/access/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 429) {
        setState('invalid');
        setErrorMessage(data?.error || 'Muitas tentativas. Aguarde 60 segundos antes de tentar novamente.');
        return;
      }

      if (!res.ok || !data?.valid) {
        if (data?.reason === 'expired') {
          setState('expired');
        } else if (data?.reason === 'already_redeemed') {
          setState('already_redeemed');
        } else {
          setState('invalid');
        }
        setErrorMessage(data?.error || 'Código de acesso inválido ou esgotado.');
        return;
      }

      // Código válido!
      setState('activated');
      const credits = Number(data.credits) || 100;
      setCreditsAwarded(credits);

      // Salva no sessionStorage para vincular à conta após login/registro
      try {
        sessionStorage.setItem('cg_validated_invite', JSON.stringify({
          code: cleanCode,
          credits,
          validatedAt: new Date().toISOString(),
        }));
      } catch {}

      if (data?.showcaseProfileId) {
        try {
          const showcaseRes = await fetch('/api/access/local-showcase-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: cleanCode }),
          });
          const showcaseData = await showcaseRes.json().catch(() => null);
          if (showcaseRes.ok && showcaseData?.ok && showcaseData.token) {
            saveLocalShowcaseSession({
              token: showcaseData.token,
              user: showcaseData.user,
              code: cleanCode,
              credits: Number(showcaseData.credits) || credits,
              balance: Number(showcaseData.balance ?? credits),
              savedAt: new Date().toISOString(),
            });
          }
        } catch {}
      }

      showToast({
        type: 'success',
        message: `Código validado! ${credits} créditos de IA liberados para sua conta.`,
        durationMs: 4000,
      });

      if (onSuccess) {
        setTimeout(() => {
          onSuccess({ code: cleanCode, credits });
        }, 1200);
      }
    } catch {
      setState('invalid');
      setErrorMessage('Não foi possível conectar ao servidor para validar o convite.');
    } finally {
      submittingRef.current = false;
    }
  };

  const hasErrorState = state === 'invalid' || state === 'expired' || state === 'already_redeemed';

  return (
    <main
      className={`flex min-h-screen w-full items-center justify-center p-4 font-sans transition-colors ${
        isDark ? 'bg-[#090D16] text-slate-100' : 'bg-[var(--cg-background)] text-[var(--cg-text)]'
      }`}
      role="region"
      aria-label="Página de Código de Acesso"
    >
      <div
        className={`relative w-full max-w-[460px] overflow-hidden rounded-3xl border p-8 shadow-2xl backdrop-blur-xl ${
          isDark
            ? 'border-slate-800 bg-[#111726]/95'
            : 'border-[var(--cg-border)] bg-[var(--cg-surface)] shadow-[0_20px_50px_rgba(11,29,82,0.08)]'
        }`}
      >
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-56 rounded-full bg-blue-500/15 blur-3xl" />

        {/* Header CompanyGen Studio */}
        <div className="relative flex flex-col items-center text-center">
          <img
            src={getBrandHorizontalLogo(isDark)}
            alt="CompanyGen Studio"
            data-testid="access-brand-logo"
            className="mx-auto mb-3 h-9 w-auto object-contain bg-transparent"
          />

          <h1
            className={`text-xl font-black tracking-tight sm:text-2xl ${
              isDark ? 'text-white' : 'text-[var(--cg-text)]'
            }`}
          >
            BEM-VINDO À PLATAFORMA
          </h1>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
            Seu ambiente de criação com IA
          </p>
        </div>

        {/* Formulário Central */}
        <form onSubmit={handleValidateCode} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="access-code-input"
              className={`block text-center text-xs font-semibold ${
                isDark ? 'text-slate-300' : 'text-[var(--cg-text-secondary)]'
              }`}
            >
              Insira seu código de acesso
            </label>
            <div className={`relative ${hasErrorState ? 'cg-shake' : ''}`}>
              <input
                id="access-code-input"
                data-testid="access-code-input"
                type="text"
                autoComplete="off"
                spellCheck="false"
                maxLength={14}
                value={code}
                onChange={handleInputChange}
                onPaste={handleInputPaste}
                disabled={state === 'loading' || state === 'activated'}
                placeholder="AI10-XXXX-XXXX"
                className={`w-full rounded-2xl border px-4 py-3.5 text-center font-mono text-xl font-bold tracking-widest transition-all focus:outline-none focus:ring-2 ${
                  isDark
                    ? 'bg-slate-900/90 text-white placeholder-slate-500'
                    : 'bg-[var(--cg-surface-elevated)] text-[var(--cg-text)] placeholder-slate-400'
                } ${
                  state === 'invalid'
                    ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/20 text-red-500'
                    : state === 'expired' || state === 'already_redeemed'
                      ? 'border-amber-500/80 focus:border-amber-500 focus:ring-amber-500/20 text-amber-500'
                      : state === 'activated'
                        ? 'border-emerald-500/80 focus:border-emerald-500 focus:ring-emerald-500/20 text-emerald-500'
                        : isDark
                          ? 'border-slate-700/80 focus:border-blue-500 focus:ring-blue-500/20'
                          : 'border-[var(--cg-border-strong)] focus:border-[var(--cg-primary)] focus:ring-blue-500/20'
                }`}
              />
            </div>

            {/* Mensagem de Erro / Sucesso */}
            {(errorMessage || state === 'activated') && (
              <div data-testid="access-state-feedback" data-state={state} className="pt-1">
                {errorMessage && (
                  <div
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                      state === 'expired'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                        : state === 'already_redeemed'
                          ? 'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
                    }`}
                  >
                    {state === 'expired' ? (
                      <Clock className="size-4 shrink-0" />
                    ) : state === 'already_redeemed' ? (
                      <Lock className="size-4 shrink-0" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0" />
                    )}
                    <span>{errorMessage}</span>
                  </div>
                )}

                {state === 'activated' && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>
                      +{creditsAwarded} créditos liberados na sua conta.
                    </span>
                  </div>
                )}
              </div>
            )}

            {creditsAwarded > 0 ? (
              <div
                data-testid="access-credits-translation-card"
                className={`mt-2 rounded-xl border px-3.5 py-2.5 text-center text-xs font-medium ${
                  isDark
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                    : 'border-blue-200 bg-blue-50/80 text-[#0B1D52]'
                }`}
              >
                <span className="font-bold">{creditsAwarded} cr:</span>{' '}
                {buildAccessCreditsSummary(creditsAwarded)}
              </div>
            ) : null}
          </div>

          <ActionButton
            type="submit"
            data-testid="access-validate-btn"
            variant="primary"
            size={48}
            isLoading={state === 'loading'}
            loadingText="VALIDANDO CÓDIGO..."
            disabled={state === 'loading' || state === 'activated' || code.length < 8}
            className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-2xl text-sm tracking-wide shadow-lg shadow-blue-600/20"
          >
            VALIDAR CÓDIGO E CONTINUAR →
          </ActionButton>
        </form>

        {/* Checklist de Benefícios */}
        <div
          className={`mt-6 space-y-2 rounded-2xl border p-4 text-xs ${
            isDark
              ? 'border-slate-800/80 bg-slate-900/40 text-slate-300'
              : 'border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Convites individuais e exclusivos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Créditos gratuitos de boas-vindas</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Acesso completo aos recursos de loja e Sofia IA</span>
          </div>
        </div>

        {/* Rodapé / Link para Login */}
        <div className={`mt-6 text-center text-xs ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
          <span>Já possui conta? </span>
          <button
            type="button"
            data-testid="access-go-to-login-btn"
            onClick={() => {
              if (onGoToLogin) {
                onGoToLogin();
              } else {
                const url = new URL(window.location.href);
                url.pathname = '/';
                url.searchParams.delete('route');
                window.location.href = url.toString();
              }
            }}
            className={`font-bold underline underline-offset-4 transition ${
              isDark
                ? 'text-[#38BDF8] hover:text-white'
                : 'text-[var(--cg-primary)] hover:text-[var(--cg-primary-dark)]'
            }`}
          >
            [ Entrar ]
          </button>
        </div>
      </div>
    </main>
  );
}
