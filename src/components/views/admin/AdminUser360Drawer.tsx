import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  Flag,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Zap,
} from 'lucide-react';
import { ActionButton, DrawerContainer, useToast } from '@/components/ui';
import { authenticatedFetch, setSupportReadonlySession } from '@/services/supabase-client';
import { resolveBrandedAppOrigin } from '@/components/views/storefront/storefront-utils';

export interface AdminUser360Target {
  id: string;
  email: string;
  displayName: string;
  businessName: string;
  whatsappPhone: string;
  credits: number;
  totalSpent?: number;
  published?: boolean;
  publicSlug?: string;
  storeUrl?: string;
  banned: boolean;
  banReason: string;
  isAdmin: boolean;
  lastSeenAt: string | null;
  funnelStage?: string;
  stalledHours?: number;
  stalledOver24h?: boolean;
  tier?: 'standard' | 'vip' | 'restricted';
  reviewFlag?: string | null;
  shortfallCredits?: number;
  riskAbuse?: boolean;
  riskReason?: string;
  revenueCents?: number;
  aiCostCents?: number;
  marginCents?: number;
}

export interface AdminFeatureFlagDef {
  key: string;
  globalMode: 'off' | 'admin_only' | 'beta_list' | 'all';
  betaUserIds: string[];
  description?: string;
}

export interface AdminKiwifyEventRow {
  id?: string;
  order_id: string;
  webhook_event_type: string;
  customer_email?: string;
  plan_code?: string;
  credits?: number;
  price_cents?: number;
  processing_status?: string;
  error_message?: string | null;
  classification?: string;
  replay_count?: number;
  created_at?: string;
}

interface AdminUser360DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminUserId: string;
  targetUser: AdminUser360Target | null;
  featureFlags: Record<string, AdminFeatureFlagDef>;
  kiwifyEvents: AdminKiwifyEventRow[];
  onRefreshOverview: () => Promise<void>;
  onEnterSupportMode?: (snapshot: Record<string, unknown>, target: AdminUser360Target) => void;
}

const REASON_OPTIONS = [
  { value: 'support_comp', label: 'Compensação de Suporte' },
  { value: 'bonus', label: 'Bônus Promocional / Parceria' },
  { value: 'refund_fix', label: 'Estorno / Falha de Motor IA' },
  { value: 'chargeback_adjust', label: 'Ajuste de Chargeback / Contestação' },
  { value: 'manual_audit', label: 'Auditoria Manual Administrativa' },
];

const FUNNEL_LABELS: Record<string, string> = {
  conta_criada: 'Conta Criada',
  dados_loja: 'Dados da Loja',
  whatsapp_conectado: 'WhatsApp Conectado',
  publicado: 'Vitrine Publicada',
  primeira_venda: '1ª Venda Realizada',
};

function formatBrlFromCents(cents = 0): string {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function AdminUser360Drawer({
  open,
  onOpenChange,
  adminUserId,
  targetUser,
  featureFlags,
  kiwifyEvents,
  onRefreshOverview,
  onEnterSupportMode,
}: AdminUser360DrawerProps) {
  const { showToast } = useToast();
  const [openSection, setOpenSection] = useState<'credits' | 'kiwify' | 'flags' | 'limits'>('credits');

  // Credits form
  const [creditMode, setCreditMode] = useState<'add' | 'set'>('add');
  const [creditAmount, setCreditAmount] = useState('100');
  const [reasonCode, setReasonCode] = useState('support_comp');
  const [creditNote, setCreditNote] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submittingCredit, setSubmittingCredit] = useState(false);

  // Limits form
  const [tier, setTier] = useState<'standard' | 'vip' | 'restricted'>('standard');
  const [limitNote, setLimitNote] = useState('Ajuste de capacidade pelo suporte.');
  const [clearNegativeLock, setClearNegativeLock] = useState(false);
  const [submittingLimit, setSubmittingLimit] = useState(false);

  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (targetUser) {
      setTier(targetUser.tier || 'standard');
      setClearNegativeLock(Boolean(targetUser.reviewFlag === 'NEGATIVE_BALANCE_REVIEW'));
      setCreditNote('');
      setIdempotencyKey(`ui-${targetUser.id.slice(0, 8)}-${Date.now()}`);
    }
  }, [targetUser]);

  if (!targetUser) return null;

  const matchingEvents = kiwifyEvents.filter(
    (ev) =>
      (targetUser.email &&
        String(ev.customer_email || '').toLowerCase() === targetUser.email.toLowerCase()) ||
      String(ev.order_id || '').includes(targetUser.id),
  );

  const handleOpenSupportReadonly = async () => {
    setLoadingSnapshot(true);
    try {
      const res = await authenticatedFetch(
        `/api/admin/users/${encodeURIComponent(targetUser.id)}/support-snapshot`,
        { method: 'GET' },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao carregar Modo Suporte.');
      }
      setSupportReadonlySession({
        userId: targetUser.id,
        email: targetUser.email,
        businessName: targetUser.businessName,
      });
      onEnterSupportMode?.(json.snapshot || {}, targetUser);
      onOpenChange(false);
      showToast({
        type: 'amber',
        message: `Modo Suporte Somente Leitura ativo para ${targetUser.businessName}.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao entrar no Modo Suporte.',
      });
    } finally {
      setLoadingSnapshot(false);
    }
  };

  const handleCreditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingCredit) return;
    const numericAmount = Math.round(Number(creditAmount));
    if (!Number.isFinite(numericAmount)) {
      showToast({ type: 'error', message: 'Informe um número válido de créditos.' });
      return;
    }
    if (creditNote.trim().length < 5) {
      showToast({ type: 'error', message: 'Informe uma justificativa de pelo menos 5 caracteres.' });
      return;
    }

    setSubmittingCredit(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/users/credits',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser.id,
            targetEmail: targetUser.email,
            mode: creditMode,
            amount: numericAmount,
            reasonCode,
            note: creditNote.trim(),
            notifyByEmail,
            idempotencyKey,
          }),
        },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao ajustar créditos.');
      }
      const fmtNewBal = Number(json.newBalance || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      if (json.duplicate) {
        showToast({
          type: 'neutral',
          message: 'Ajuste já aplicado anteriormente (idempotência garantida).',
        });
      } else if (notifyByEmail && Number(json.delta || 0) > 0 && json.emailSent === false) {
        showToast({
          type: 'warning',
          title: `Saldo atualizado para ${fmtNewBal} cr`,
          message:
            json.emailError === 'SMTP_NOT_CONFIGURED'
              ? 'Créditos aplicados, mas o Gmail SMTP ainda não foi configurado no servidor.'
              : `Créditos aplicados, porém o envio de e-mail falhou (${json.emailError || 'erro SMTP'}).`,
        });
      } else {
        showToast({
          type: 'success',
          message: json.emailSent
            ? `Saldo atualizado para ${fmtNewBal} cr · E-mail enviado para ${targetUser.email || 'o lojista'}.`
            : `Saldo atualizado para ${fmtNewBal} créditos.`,
        });
      }
      setCreditNote('');
      setIdempotencyKey(`ui-${targetUser.id.slice(0, 8)}-${Date.now()}`);
      await onRefreshOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao atualizar créditos.',
      });
    } finally {
      setSubmittingCredit(false);
    }
  };

  const handleSaveLimits = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingLimit) return;
    if (limitNote.trim().length < 3) {
      showToast({ type: 'error', message: 'Informe uma observação mínima para alterar limites.' });
      return;
    }
    setSubmittingLimit(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/users/limits',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser.id,
            tier,
            note: limitNote.trim(),
            clearNegativeLock,
          }),
        },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao atualizar limites.');
      }
      showToast({
        type: 'success',
        message: `Limites (${tier.toUpperCase()}) salvos com registro de auditoria.`,
      });
      await onRefreshOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao salvar limites.',
      });
    } finally {
      setSubmittingLimit(false);
    }
  };

  const handleToggleBetaFlag = async (flag: AdminFeatureFlagDef) => {
    setBusyAction(true);
    try {
      const exists = flag.betaUserIds.includes(targetUser.id);
      const nextBeta = exists
        ? flag.betaUserIds.filter((id) => id !== targetUser.id)
        : [...flag.betaUserIds, targetUser.id];
      const res = await authenticatedFetch(
        '/api/admin/feature-flags',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: flag.key,
            globalMode: flag.globalMode === 'off' && !exists ? 'beta_list' : flag.globalMode,
            betaUserIds: nextBeta,
            description: flag.description || '',
          }),
        },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erro ao atualizar flag.');
      showToast({
        type: 'success',
        message: exists ? `Removido do beta ${flag.key}` : `Adicionado ao beta ${flag.key}`,
      });
      await onRefreshOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao atualizar beta.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleBan = async () => {
    setBusyAction(true);
    try {
      const nextBanned = !targetUser.banned;
      const res = await authenticatedFetch(
        '/api/admin/users/ban',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser.id,
            banned: nextBanned,
            reason: nextBanned ? 'Suspenso pelo administrador via Visão 360°.' : '',
          }),
        },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erro ao alterar suspensão.');
      showToast({
        type: 'success',
        message: nextBanned ? 'Conta suspensa imediatamente.' : 'Conta reativada.',
      });
      await onRefreshOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao suspender conta.' });
    } finally {
      setBusyAction(false);
    }
  };

  const handleReplayEvent = async (ev: AdminKiwifyEventRow) => {
    setBusyAction(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/kiwify/replay',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: ev.order_id,
            eventType: ev.webhook_event_type || 'order_approved',
            userId: targetUser.id,
          }),
        },
        adminUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erro no replay Kiwify.');
      showToast({
        type: 'success',
        message: json.duplicate ? 'Evento já contabilizado (idempotente).' : 'Replay processado com sucesso.',
      });
      await onRefreshOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro no replay.' });
    } finally {
      setBusyAction(false);
    }
  };

  const toggleSection = (sec: 'credits' | 'kiwify' | 'flags' | 'limits') => {
    setOpenSection((prev) => (prev === sec ? 'credits' : sec));
  };

  return (
    <DrawerContainer
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      contentClassName="min-[769px]:w-[520px] min-[769px]:max-w-[92vw]"
      title={
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="size-5 shrink-0 text-[#2563EB]" aria-hidden="true" />
          <span className="truncate">{targetUser.businessName || 'Visão 360° do Lojista'}</span>
        </div>
      }
      description={
        <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
          {targetUser.email || targetUser.id}
        </span>
      }
    >
      <div data-testid="admin-user-360-drawer" className="min-w-0 space-y-4">
        {/* Ação Fixa de Topo: Modo Suporte Somente Leitura */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 dark:border-blue-500/30 dark:bg-blue-950/35">
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#1D4ED8] shadow-xs dark:bg-[#111726] dark:text-blue-300">
              {FUNNEL_LABELS[targetUser.funnelStage || 'conta_criada'] || 'Setup Inicial'}
            </span>
            <span className="cg-tabular rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-800 shadow-xs dark:bg-[#111726] dark:text-slate-100">
              {targetUser.credits.toLocaleString('pt-BR')} cr
            </span>
            {targetUser.riskAbuse ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle className="size-3" /> Risco Multi-conta
              </span>
            ) : null}
            {targetUser.reviewFlag === 'NEGATIVE_BALANCE_REVIEW' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                <ShieldAlert className="size-3" /> Trava Chargeback (-{targetUser.shortfallCredits || 0} cr)
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ActionButton
              type="button"
              variant="softBlue"
              size={44}
              data-testid="admin-drawer-view-store-btn"
              onClick={() => {
                const origin = resolveBrandedAppOrigin();
                const url = `${origin}/?view=store&u=${encodeURIComponent(targetUser.id)}&adminPreview=1`;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="w-full"
              leftIcon={<ExternalLink className="size-4" />}
            >
              Abrir Loja do Cliente ({targetUser.published ? 'Publicada' : 'Rascunho'})
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              size={44}
              data-testid="admin-drawer-copy-store-url-btn"
              onClick={() => {
                const origin = resolveBrandedAppOrigin() || window.location.origin;
                const publicUrl = targetUser.publicSlug
                  ? `${origin}/?loja=${encodeURIComponent(targetUser.publicSlug)}`
                  : `${origin}/?view=store&u=${encodeURIComponent(targetUser.id)}`;
                void navigator.clipboard?.writeText(publicUrl).catch(() => {});
                showToast({ type: 'success', message: `Link da loja copiado: ${publicUrl}` });
              }}
              className="w-full"
              leftIcon={<Copy className="size-4" />}
            >
              Copiar Link Público
            </ActionButton>
          </div>

          <div className="mt-2">
            <ActionButton
              type="button"
              variant="primary"
              size={44}
              data-testid="admin-360-support-readonly-btn"
              isLoading={loadingSnapshot}
              onClick={handleOpenSupportReadonly}
              className="w-full"
              leftIcon={<Eye className="size-4" />}
            >
              Ver Painel Como Cliente (Modo Suporte Somente Leitura)
            </ActionButton>
          </div>
        </div>

        {/* Acordeão 1: Saldo & Créditos */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726]">
          <button
            type="button"
            data-testid="admin-360-acc-credits"
            onClick={() => toggleSection('credits')}
            className="flex w-full min-h-[46px] items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#0F172A] dark:text-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <Coins className="size-4 text-[#2563EB]" /> Saldo & Créditos (Auditoria)
            </span>
            {openSection === 'credits' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {openSection === 'credits' ? (
            <form onSubmit={handleCreditSubmit} className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Modo
                  </label>
                  <select
                    value={creditMode}
                    onChange={(e) => setCreditMode(e.target.value === 'set' ? 'set' : 'add')}
                    className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                  >
                    <option value="add">Somar / Subtrair delta</option>
                    <option value="set">Definir saldo exato</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Quantidade (cr)
                  </label>
                  <input
                    data-testid="admin-360-credit-amount"
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    className="cg-tabular min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Motivo Padronizado (Obrigatório)
                </label>
                <select
                  data-testid="admin-360-credit-reason"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                >
                  {REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Justificativa para Auditoria (mín. 5 caracteres)
                </label>
                <input
                  data-testid="admin-360-credit-note"
                  type="text"
                  required
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="Ex: Compensação por erro temporário na geração da vitrine"
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={notifyByEmail}
                  onChange={(e) => setNotifyByEmail(e.target.checked)}
                />
                Registrar notificação de e-mail para o lojista
              </label>

              <ActionButton
                type="submit"
                variant="primary"
                size={44}
                data-testid="admin-360-credit-submit"
                isLoading={submittingCredit}
                className="w-full"
              >
                Aplicar Ajuste Auditado
              </ActionButton>
            </form>
          ) : null}
        </section>

        {/* Acordeão 2: Kiwify & Custos */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726]">
          <button
            type="button"
            data-testid="admin-360-acc-kiwify"
            onClick={() => toggleSection('kiwify')}
            className="flex w-full min-h-[46px] items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#0F172A] dark:text-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <Zap className="size-4 text-emerald-600" /> Kiwify & Economia da Conta
            </span>
            {openSection === 'kiwify' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {openSection === 'kiwify' ? (
            <div className="space-y-3 border-t border-slate-100 p-4 text-xs dark:border-slate-800">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-[#090D16]">
                  <div className="text-[10px] text-slate-500">Receita</div>
                  <div className="cg-tabular font-bold text-[#0F172A] dark:text-slate-100">
                    {formatBrlFromCents(targetUser.revenueCents)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-[#090D16]">
                  <div className="text-[10px] text-slate-500">Custo IA</div>
                  <div className="cg-tabular font-bold text-[#0F172A] dark:text-slate-100">
                    {formatBrlFromCents(targetUser.aiCostCents)}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-[#090D16]">
                  <div className="text-[10px] text-slate-500">Margem</div>
                  <div
                    className={`cg-tabular font-bold ${(targetUser.marginCents || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                  >
                    {formatBrlFromCents(targetUser.marginCents)}
                  </div>
                </div>
              </div>

              {matchingEvents.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">
                  Nenhum evento Kiwify registrado para este e-mail.
                </p>
              ) : (
                <div className="space-y-2">
                  {matchingEvents.slice(0, 5).map((ev) => (
                    <div
                      key={`${ev.order_id}-${ev.webhook_event_type}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#0F172A] dark:text-slate-100">
                          {ev.webhook_event_type} · {ev.order_id}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Status: {ev.processing_status || 'processed'}
                        </p>
                      </div>
                      <ActionButton
                        type="button"
                        size={44}
                        variant="secondary"
                        disabled={busyAction}
                        onClick={() => void handleReplayEvent(ev)}
                        leftIcon={<RefreshCw className="size-3.5" />}
                      >
                        Replay
                      </ActionButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Acordeão 3: Feature Flags Beta */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726]">
          <button
            type="button"
            data-testid="admin-360-acc-flags"
            onClick={() => toggleSection('flags')}
            className="flex w-full min-h-[46px] items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#0F172A] dark:text-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <Flag className="size-4 text-violet-600" /> Feature Flags & Beta
            </span>
            {openSection === 'flags' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {openSection === 'flags' ? (
            <div className="space-y-2 border-t border-slate-100 p-4 text-xs dark:border-slate-800">
              {Object.values(featureFlags).map((flag) => {
                const inBeta = flag.betaUserIds.includes(targetUser.id);
                return (
                  <div
                    key={flag.key}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#0F172A] dark:text-slate-100">{flag.key}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        Modo global: {flag.globalMode}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleToggleBetaFlag(flag)}
                      className={`min-h-[34px] rounded-lg px-2.5 font-bold ${
                        inBeta
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                          : 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {inBeta ? 'No Beta ✓' : 'Incluir Beta'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* Acordeão 4: Limites, Risco & Banimento */}
        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111726]">
          <button
            type="button"
            data-testid="admin-360-acc-limits"
            onClick={() => toggleSection('limits')}
            className="flex w-full min-h-[46px] items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#0F172A] dark:text-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-600" /> Limites, Risco & Acesso
            </span>
            {openSection === 'limits' ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          {openSection === 'limits' ? (
            <div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800">
              {targetUser.riskAbuse ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
                  <strong>⚠ Alerta Anti-Abuso:</strong> {targetUser.riskReason}
                </div>
              ) : null}

              <form onSubmit={handleSaveLimits} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Nível de Taxa IA (Rate Limit)
                  </label>
                  <select
                    data-testid="admin-360-tier-select"
                    value={tier}
                    onChange={(e) => setTier(e.target.value as 'standard' | 'vip' | 'restricted')}
                    className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                  >
                    <option value="standard">Padrão (120 req/h · 30/min)</option>
                    <option value="vip">VIP (600 req/h · 120/min)</option>
                    <option value="restricted">Restrito (15 req/h · 5/min)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Motivo da alteração
                  </label>
                  <input
                    data-testid="admin-360-limit-note"
                    type="text"
                    value={limitNote}
                    onChange={(e) => setLimitNote(e.target.value)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                  />
                </div>

                {targetUser.reviewFlag === 'NEGATIVE_BALANCE_REVIEW' ? (
                  <label className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    <input
                      type="checkbox"
                      checked={clearNegativeLock}
                      onChange={(e) => setClearNegativeLock(e.target.checked)}
                    />
                    Desbloquear trava NEGATIVE_BALANCE_REVIEW após regularização
                  </label>
                ) : null}

                <ActionButton
                  type="submit"
                  size={44}
                  variant="secondary"
                  data-testid="admin-360-limit-submit"
                  isLoading={submittingLimit}
                  className="w-full"
                >
                  Salvar Limites
                </ActionButton>
              </form>

              {!targetUser.isAdmin ? (
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <ActionButton
                    type="button"
                    size={44}
                    variant={targetUser.banned ? 'secondary' : 'danger'}
                    data-testid="admin-360-ban-btn"
                    disabled={busyAction}
                    onClick={() => void handleToggleBan()}
                    className="w-full"
                    leftIcon={targetUser.banned ? <UserCheck className="size-4" /> : <Ban className="size-4" />}
                  >
                    {targetUser.banned ? 'Reativar Conta do Lojista' : 'Suspender Conta Imediatamente'}
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </DrawerContainer>
  );
}
