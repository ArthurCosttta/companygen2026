import React, { useEffect, useState } from 'react';
import { Gift, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useToast } from '@/components/ui/ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';

export interface RedeemCreditCodeCardProps {
  userId?: string;
  compact?: boolean;
  onRedeemed?: (result: { creditsAdded: number; newBalance: number }) => void;
}

function formatCodeInput(raw: string): string {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

export function RedeemCreditCodeCard({
  userId,
  compact = false,
  onRedeemed,
}: RedeemCreditCodeCardProps) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number }>({
    used: 0,
    limit: 3,
    remaining: 3,
  });

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const prefill = params.get('redeem')?.trim();
      if (prefill) setCode(formatCodeInput(prefill));
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    if (!userId) return;
    authenticatedFetch('/api/credits/redemption-quota', undefined, userId)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.ok) return;
        setQuota({
          used: Number(json.used || 0),
          limit: Number(json.limit || 3),
          remaining: Number(json.remaining ?? Math.max(0, 3 - Number(json.used || 0))),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const limitReached = quota.used >= quota.limit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || limitReached) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 8) {
      setError('Digite o código completo (ex.: RC10-XXXX-XXXX).');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await authenticatedFetch(
        '/api/credits/redeem-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed }),
        },
        userId,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        const msg = json?.error || json?.message || 'Não foi possível resgatar este código.';
        setError(msg);
        showToast({ type: 'error', message: msg });
        return;
      }

      const added = Number(json.creditsAdded || 0);
      const newBal = Number(json.newBalance || 0);
      const nextUsed = Number(json.redemptionsUsed ?? quota.used + 1);
      const nextLimit = Number(json.limit ?? quota.limit);
      setQuota({
        used: nextUsed,
        limit: nextLimit,
        remaining: Math.max(0, nextLimit - nextUsed),
      });
      setCode('');
      const formattedAdded = added.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      const formattedBal = newBal.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      const msg = `+${formattedAdded} créditos adicionados! Novo saldo: ${formattedBal} cr.`;
      setSuccessMsg(msg);
      showToast({ type: 'success', title: 'Créditos resgatados!', message: msg });
      window.dispatchEvent(new CustomEvent('companygen:credits-updated', { detail: { balance: newBal } }));
      onRedeemed?.({ creditsAdded: added, newBalance: newBal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao resgatar código.';
      setError(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="redeem-credit-code-card"
      className={`rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111726] ${
        compact ? 'p-4 space-y-3' : 'p-5 space-y-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <Gift className="size-4.5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
              Resgatar Código de Créditos
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tem um código especial de recarga (RC10)? Resgate aqui direto na sua conta.
            </p>
          </div>
        </div>
        <span
          data-testid="redeem-quota-badge"
          className={`cg-tabular rounded-full px-2.5 py-1 text-[11px] font-bold ${
            limitReached
              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              : 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
          }`}
        >
          Resgates usados: {quota.used} de {quota.limit}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(formatCodeInput(e.target.value));
            if (error) setError('');
          }}
          disabled={limitReached || submitting}
          placeholder="RC10-XXXX-XXXX"
          maxLength={14}
          data-testid="redeem-code-input"
          aria-label="Código de recarga de créditos"
          className="cg-tabular min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm font-bold tracking-wider uppercase text-[#0F172A] placeholder:font-sans placeholder:tracking-normal placeholder:font-normal focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
        />
        <ActionButton
          type="submit"
          size={44}
          variant="primary"
          disabled={limitReached || !code.trim()}
          isLoading={submitting}
          loadingText="Resgatando..."
          data-testid="redeem-code-submit"
          leftIcon={<Sparkles className="size-4" />}
          className="shrink-0"
        >
          Resgatar Créditos
        </ActionButton>
      </form>

      {limitReached ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <AlertCircle className="size-3.5 shrink-0" />
          Você atingiu o limite máximo de {quota.limit} resgates de códigos promocionais nesta conta.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="redeem-code-error"
          className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {successMsg ? (
        <p
          role="status"
          data-testid="redeem-code-success"
          className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-3.5 shrink-0" />
          {successMsg}
        </p>
      ) : null}
    </section>
  );
}
