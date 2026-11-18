import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  ShieldCheck,
  Zap,
  BarChart3,
  ReceiptText,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useToast } from '@/components/ui/ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';
import { getBrandHorizontalLogo, useDocumentDarkMode } from '@/utils/themeLogos';

export interface CreditLedgerEntry {
  id: string;
  delta: number;
  balance_after: number;
  operation_type: string;
  reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface CreditPlan {
  id: string;
  slug: string;
  name: string;
  credits: number;
  priceCents: number;
  priceFormatted: string;
  pricePerCredit: string;
  savingsPercent: string | null;
  popular: boolean;
  kiwifyUrl?: string;
  description: string;
}

export interface PaymentOrder {
  id: string;
  orderRef: string;
  plan_id: string;
  plan_name: string;
  amount_cents: number;
  credits: number;
  payment_method: string;
  status: 'pending' | 'paid' | 'failed';
  pix_copy_paste: string;
  pix_qr_code: string;
  sandbox: boolean;
}

export interface CheckoutPlansViewProps {
  userId?: string;
  initialSubTab?: 'plans' | 'ledger';
  onBackToApp?: () => void;
}

const OP_LABELS: Record<string, { label: string; category: 'credit' | 'debit' | 'refund' }> = {
  purchase_kiwify: { label: 'Compra Kiwify aprovada', category: 'credit' },
  welcome_invite: { label: 'Código de convite resgatado', category: 'credit' },
  redeem_code: { label: 'Código de acesso resgatado', category: 'credit' },
  order_refunded: { label: 'Estorno / Reembolso Kiwify', category: 'refund' },
  failure_refund: { label: 'Estorno automático de falha', category: 'credit' },
  generate_storefront: { label: 'Geração de Vitrine com IA', category: 'debit' },
  edit_storefront: { label: 'Edição / Nova página na Vitrine', category: 'debit' },
  generate_image: { label: 'Geração / Busca de Imagem IA', category: 'debit' },
  whatsapp_reply_consumed: { label: 'Atendimento WhatsApp (Sofia IA)', category: 'debit' },
};

function sanitizePlanPriceLabel(raw: string): string {
  return String(raw || '').replace(/\/mês/gi, '').trim();
}

export function CheckoutPlansView({ userId, initialSubTab = 'plans', onBackToApp }: CheckoutPlansViewProps) {
  const { showToast } = useToast();
  const isDark = useDocumentDarkMode();
  const [activeSubTab, setActiveSubTab] = useState<'plans' | 'ledger'>(initialSubTab);
  const [plans, setPlans] = useState<CreditPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_100_brl');
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [ledgerEntries, setLedgerEntries] = useState<CreditLedgerEntry[]>([]);
  const [awaitingKiwifyPlan, setAwaitingKiwifyPlan] = useState<string | null>(null);
  const [confirmedCreditsDelta, setConfirmedCreditsDelta] = useState<number | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const baselineBalanceRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current !== null) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      const [plansResult, balanceResult] = await Promise.allSettled([
        fetch('/api/checkout/plans'),
        userId ? authenticatedFetch('/api/credits/balance', {}, userId) : Promise.resolve(null),
      ]);

      let loadedPlans: CreditPlan[] | null = null;
      if (plansResult.status === 'fulfilled' && plansResult.value.ok) {
        const plansJson = await plansResult.value.json().catch(() => null);
        if (plansJson?.plans && Array.isArray(plansJson.plans)) {
          loadedPlans = plansJson.plans as CreditPlan[];
        }
      }

      if (active) {
        if (loadedPlans) {
          setPlans([...loadedPlans].sort((a, b) => a.priceCents - b.priceCents));
        } else {
          // Fallback para planos locais se offline
          setPlans(
            [
              {
                id: 'plan_100_brl',
                slug: 'plan_100_brl',
                name: 'Plano Profissional IA',
                credits: 2500,
                priceCents: 10000,
                priceFormatted: 'R$ 100,00',
                pricePerCredit: 'R$ 0,04',
                savingsPercent: '60%',
                popular: true,
                kiwifyUrl: 'https://pay.kiwify.com.br/0USJqo5',
                description: 'Ideal para atendimento contínuo no WhatsApp e geração completa de vitrines.',
              },
              {
                id: 'plan_micro_10',
                slug: 'plan_micro_10',
                name: 'Recarga Rápida',
                credits: 100,
                priceCents: 990,
                priceFormatted: 'R$ 9,90',
                pricePerCredit: 'R$ 0,10',
                savingsPercent: null,
                popular: false,
                kiwifyUrl: 'https://pay.kiwify.com.br/7fBDYu4',
                description: 'Recarga única de entrada para testar respostas e edições com clientes reais.',
              },
              {
                id: 'plan_growth_25',
                slug: 'plan_growth_25',
                name: 'Recarga Intermediária',
                credits: 300,
                priceCents: 2490,
                priceFormatted: 'R$ 24,90',
                pricePerCredit: 'R$ 0,08',
                savingsPercent: '20%',
                popular: false,
                kiwifyUrl: 'https://pay.kiwify.com.br/O0ueDhe',
                description: 'Bom para picos de movimento e campanhas pontuais de vendas.',
              },
            ].sort((a, b) => a.priceCents - b.priceCents),
          );
        }

        if (balanceResult.status === 'fulfilled' && balanceResult.value?.ok) {
          const balanceJson = await balanceResult.value.json().catch(() => null);
          if (balanceJson?.balance !== undefined) {
            setCurrentBalance(Number(balanceJson.balance) || 0);
          }
          const rawHistory = balanceJson?.history || balanceJson?.entries;
          if (Array.isArray(rawHistory)) {
            setLedgerEntries(rawHistory as CreditLedgerEntry[]);
          }
        }
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [userId]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const projectedBalance = selectedPlan ? currentBalance + selectedPlan.credits : currentBalance;

  const resolveKiwifyUrl = (plan?: CreditPlan): string => {
    if (plan?.kiwifyUrl) return plan.kiwifyUrl;
    if (plan?.id === 'plan_micro_10') return 'https://pay.kiwify.com.br/7fBDYu4';
    if (plan?.id === 'plan_growth_25') return 'https://pay.kiwify.com.br/O0ueDhe';
    return 'https://pay.kiwify.com.br/0USJqo5';
  };

  const startPostCheckoutPolling = () => {
    if (!userId) return;
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
    }
    baselineBalanceRef.current = currentBalance;
    let ticks = 0;
    pollingIntervalRef.current = window.setInterval(async () => {
      ticks += 1;
      if (ticks > 36) {
        if (pollingIntervalRef.current !== null) {
          window.clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setAwaitingKiwifyPlan(null);
        return;
      }
      try {
        const res = await authenticatedFetch('/api/credits/balance', {}, userId);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const nextBal = Number(json?.balance);
          const rawHistory = json?.history || json?.entries;
          if (Array.isArray(rawHistory)) {
            setLedgerEntries(rawHistory as CreditLedgerEntry[]);
          }
          if (Number.isFinite(nextBal) && nextBal > baselineBalanceRef.current) {
            const delta = nextBal - baselineBalanceRef.current;
            setCurrentBalance(nextBal);
            setAwaitingKiwifyPlan(null);
            setConfirmedCreditsDelta(delta);
            if (pollingIntervalRef.current !== null) {
              window.clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            window.dispatchEvent(new CustomEvent('companygen:credit-balance-updated', { detail: { balance: nextBal } }));
            window.dispatchEvent(new CustomEvent('companygen:credits-updated', { detail: { balance: nextBal } }));
            showToast({
              type: 'success',
              message: `+${delta.toLocaleString('pt-BR')} créditos confirmados na sua conta!`,
              durationMs: 4500,
            });
          }
        }
      } catch {}
    }, 5000);
  };

  const handleOpenKiwifyCheckout = (plan?: CreditPlan) => {
    const targetPlan = plan || selectedPlan;
    const targetUrl = resolveKiwifyUrl(targetPlan);
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    setConfirmedCreditsDelta(null);
    setAwaitingKiwifyPlan(targetPlan?.name || 'pacote selecionado');
    startPostCheckoutPolling();
    showToast({
      type: 'success',
      message: `Checkout Kiwify aberto para ${targetPlan?.name || 'o plano selecionado'}.`,
      durationMs: 3500,
    });
  };

  const telemetry = useMemo(() => {
    const byOp = new Map<string, { label: string; total: number; count: number }>();
    let totalSpent = 0;
    let totalLoaded = 0;
    for (const entry of ledgerEntries) {
      const delta = Number(entry.delta || 0);
      if (delta > 0) {
        totalLoaded += delta;
      } else if (delta < 0 && entry.operation_type !== 'order_refunded') {
        const abs = Math.abs(delta);
        totalSpent += abs;
        const meta = OP_LABELS[entry.operation_type] || { label: entry.operation_type || 'Outro uso', category: 'debit' };
        const prev = byOp.get(entry.operation_type) || { label: meta.label, total: 0, count: 0 };
        prev.total += abs;
        prev.count += 1;
        byOp.set(entry.operation_type, prev);
      }
    }
    const bars = Array.from(byOp.values()).sort((a, b) => b.total - a.total);
    const maxBar = Math.max(1, ...bars.map((b) => b.total));
    const paymentHistory = ledgerEntries.filter((e) =>
      ['purchase_kiwify', 'order_refunded', 'welcome_invite', 'redeem_code', 'failure_refund'].includes(e.operation_type) ||
      Number(e.delta || 0) > 0,
    );
    return { totalSpent, totalLoaded, bars, maxBar, paymentHistory };
  }, [ledgerEntries]);

  return (
    <div
      className={`min-h-screen w-full font-sans p-4 sm:p-6 md:p-8 transition-colors ${
        isDark
          ? 'bg-[#090D16] text-slate-100'
          : 'bg-[var(--cg-background)] text-[var(--cg-text)]'
      }`}
    >
      <div className="mx-auto max-w-6xl">
        {/* Barra Superior */}
        <div
          className={`flex flex-wrap items-center justify-between gap-4 pb-6 border-b ${
            isDark ? 'border-slate-800' : 'border-[var(--cg-border)]'
          }`}
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <button
              onClick={() => {
                if (onBackToApp) {
                  onBackToApp();
                } else {
                  const url = new URL(window.location.href);
                  url.pathname = '/';
                  url.searchParams.delete('route');
                  window.location.href = url.toString();
                }
              }}
              className={`inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isDark
                  ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                  : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)] hover:text-[var(--cg-text)]'
              }`}
            >
              <ArrowLeft className="size-4 shrink-0" />
              Voltar ao Aplicativo
            </button>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <img
                  src={getBrandHorizontalLogo(isDark)}
                  alt="CompanyGen"
                  data-testid="checkout-brand-logo"
                  className="h-7 w-auto object-contain bg-transparent"
                />
                <span
                  className={`text-xs font-mono font-bold tracking-widest uppercase ${
                    isDark ? 'text-[#38BDF8]' : 'text-[var(--cg-primary)]'
                  }`}
                >
                  ◈ CRÉDITOS, PAGAMENTOS & CONSUMO
                </span>
              </div>
              <h1
                className={`text-2xl font-black sm:text-3xl ${
                  isDark ? 'text-white' : 'text-[var(--cg-text)]'
                }`}
              >
                Planos & Telemetria da Conta
              </h1>
            </div>
          </div>

          {/* Saldo Atual */}
          <div
            className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 ${
              isDark
                ? 'border-blue-500/30 bg-blue-500/10'
                : 'border-blue-200 bg-blue-50/90'
            }`}
          >
            <Zap className={`size-5 ${isDark ? 'text-[#38BDF8]' : 'text-[var(--cg-primary)]'}`} />
            <div>
              <span
                className={`text-[10px] font-semibold block uppercase ${
                  isDark ? 'text-blue-300' : 'text-blue-700'
                }`}
              >
                Saldo Atual
              </span>
              <span
                className={`cg-tabular text-lg font-black ${
                  isDark ? 'text-white' : 'text-[var(--cg-text)]'
                }`}
                data-testid="checkout-current-balance"
              >
                {currentBalance.toLocaleString('pt-BR')} créditos
              </span>
            </div>
          </div>
        </div>

        {/* Sub-abas: Recarregar vs. Extrato & Gráfico de Consumo */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="checkout-tab-plans"
            onClick={() => setActiveSubTab('plans')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
              activeSubTab === 'plans'
                ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-600/20'
                : isDark
                  ? 'border border-slate-800 bg-[#111726] text-slate-300 hover:bg-slate-800'
                  : 'border border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)]'
            }`}
          >
            <Sparkles className="size-4" />
            Recarregar Créditos
          </button>
          <button
            type="button"
            data-testid="checkout-tab-ledger"
            onClick={() => setActiveSubTab('ledger')}
            className={`cg-tabular inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${
              activeSubTab === 'ledger'
                ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-600/20'
                : isDark
                  ? 'border border-slate-800 bg-[#111726] text-slate-300 hover:bg-slate-800'
                  : 'border border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)]'
            }`}
          >
            <BarChart3 className="size-4" />
            Extrato & Consumo ({ledgerEntries.length})
          </button>
        </div>

        {activeSubTab === 'ledger' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2" data-testid="checkout-ledger-panel">
            {/* Gráfico de Consumo de Créditos/Tokens */}
            <section
              className={`rounded-3xl border p-6 space-y-4 ${
                isDark
                  ? 'border-slate-800 bg-[#111726]'
                  : 'border-[var(--cg-border)] bg-[var(--cg-surface)] shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2
                    className={`text-sm font-bold flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-[var(--cg-text)]'
                    }`}
                  >
                    <BarChart3 className="size-4 text-[#38BDF8]" />
                    Gráfico de Consumo de Créditos
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                    Onde seus créditos foram investidos até agora.
                  </p>
                </div>
                <span
                  className={`cg-tabular rounded-full px-3 py-1 text-xs font-bold ${
                    isDark
                      ? 'bg-slate-800 text-slate-200'
                      : 'bg-[var(--cg-surface-subtle)] text-[var(--cg-text)]'
                  }`}
                >
                  Total gasto: {telemetry.totalSpent.toLocaleString('pt-BR')} cr
                </span>
              </div>

              {telemetry.bars.length === 0 ? (
                <div
                  className={`rounded-2xl border border-dashed p-6 text-center text-xs space-y-3 ${
                    isDark
                      ? 'border-slate-700 bg-slate-900/50 text-slate-400'
                      : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)]'
                  }`}
                >
                  <img
                    src="/brand/illustrations/illustration-opportunity-consultoria-financeira.png"
                    alt="Consumo financeiro"
                    className="mx-auto h-24 rounded-xl bg-white p-2 object-contain"
                  />
                  <p>Nenhum consumo registrado ainda nesta conta. Ao gerar vitrines, imagens ou responder no WhatsApp, o gráfico aparecerá aqui.</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {telemetry.bars.map((bar) => {
                    const pct = Math.max(6, Math.round((bar.total / telemetry.maxBar) * 100));
                    return (
                      <div key={bar.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-[var(--cg-text)]'}`}>
                            {bar.label}
                          </span>
                          <span className="cg-tabular font-mono text-[#38BDF8]">
                            -{bar.total.toLocaleString('pt-BR')} cr ({bar.count}x)
                          </span>
                        </div>
                        <div className={`h-3 w-full overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Histórico de Pagamentos, Recargas & Movimentações */}
            <section
              className={`rounded-3xl border p-6 space-y-4 ${
                isDark
                  ? 'border-slate-800 bg-[#111726]'
                  : 'border-[var(--cg-border)] bg-[var(--cg-surface)] shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2
                    className={`text-sm font-bold flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-[var(--cg-text)]'
                    }`}
                  >
                    <ReceiptText className="size-4 text-emerald-500" />
                    Histórico de Pagamentos & Movimentações
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                    Recargas Kiwify, códigos resgatados, estornos e lançamentos recentes.
                  </p>
                </div>
                <span className="cg-tabular rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                  Recargas: +{telemetry.totalLoaded.toLocaleString('pt-BR')} cr
                </span>
              </div>

              {ledgerEntries.length === 0 ? (
                <div
                  className={`rounded-2xl border border-dashed p-6 text-center text-xs ${
                    isDark
                      ? 'border-slate-700 bg-slate-900/50 text-slate-400'
                      : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)]'
                  }`}
                >
                  Nenhuma movimentação registrada ainda nesta conta.
                </div>
              ) : (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {ledgerEntries.slice(0, 40).map((entry) => {
                    const meta = OP_LABELS[entry.operation_type] || {
                      label: entry.operation_type || 'Movimentação',
                      category: entry.delta >= 0 ? 'credit' : 'debit',
                    };
                    const isPositive = Number(entry.delta || 0) >= 0;
                    const isRefund = entry.operation_type === 'order_refunded';
                    return (
                      <li
                        key={entry.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-xs ${
                          isDark
                            ? 'border-slate-800 bg-slate-900/60'
                            : 'border-[var(--cg-border)] bg-[var(--cg-surface-elevated)]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className={`truncate font-semibold ${isDark ? 'text-white' : 'text-[var(--cg-text)]'}`}>
                            {meta.label}
                          </p>
                          <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                            {new Date(entry.created_at).toLocaleString('pt-BR')} · Saldo após:{' '}
                            <strong className={`cg-tabular ${isDark ? 'text-slate-200' : 'text-[var(--cg-text)]'}`}>
                              {Number(entry.balance_after || 0).toLocaleString('pt-BR')} cr
                            </strong>
                          </p>
                        </div>
                        <span
                          className={`cg-tabular shrink-0 rounded-full px-2.5 py-1 font-mono font-bold ${
                            isRefund
                              ? 'bg-rose-500/20 text-rose-500 dark:text-rose-300'
                              : isPositive
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : isDark
                                  ? 'bg-slate-800 text-slate-300'
                                  : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isPositive ? `+${entry.delta}` : entry.delta} cr
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : (
        /* Conteúdo Principal de Planos */
        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          {/* Coluna 1 & 2: Seleção de Planos */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
              Escolha seu Pacote de Créditos (Sem Validade)
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const cleanPrice = sanitizePlanPriceLabel(plan.priceFormatted);
                return (
                  <div
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                    }}
                    className={`relative flex flex-col justify-between rounded-3xl border p-5 cursor-pointer transition-all ${
                      isSelected
                        ? isDark
                          ? 'border-[#3B82F6] bg-[#182034] shadow-xl ring-2 ring-[#3B82F6]/40'
                          : 'border-[var(--cg-primary)] bg-[var(--cg-hover)] shadow-md ring-2 ring-[#0867E8]/20'
                        : isDark
                          ? 'border-slate-800 bg-[#111726]/90 hover:border-slate-700 hover:bg-[#182034]'
                          : 'border-[var(--cg-border)] bg-[var(--cg-surface)] hover:border-[var(--cg-border-strong)] hover:bg-[var(--cg-surface-elevated)] shadow-xs'
                    } ${plan.popular ? 'sm:-translate-y-1' : ''}`}
                  >
                    {/* Tag de Destaque */}
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-md">
                        ★ MAIS POPULAR
                      </div>
                    )}

                    <div>
                      <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-[var(--cg-text)]'}`}>
                        {plan.name}
                      </h3>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className={`cg-tabular text-2xl font-black ${isDark ? 'text-white' : 'text-[var(--cg-text)]'}`}>
                          {cleanPrice}
                        </span>
                        <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                          única
                        </span>
                      </div>

                      <div className="cg-tabular mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-bold text-[#0867E8] dark:text-[#38BDF8]">
                        <Sparkles className="size-3.5" />
                        {plan.credits.toLocaleString('pt-BR')} Créditos
                      </div>

                      <p className={`mt-3 text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-secondary)]'}`}>
                        {plan.description}
                      </p>
                    </div>

                    <div className={`mt-4 pt-3 border-t space-y-2 ${isDark ? 'border-slate-800' : 'border-[var(--cg-border)]'}`}>
                      <div className={`text-[11px] flex items-center justify-between ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                        <span>Custo/msg:</span>
                        <span className={`cg-tabular font-bold ${isDark ? 'text-slate-200' : 'text-[var(--cg-text)]'}`}>
                          {plan.pricePerCredit}
                        </span>
                      </div>
                      <button
                        type="button"
                        data-testid={`kiwify-checkout-card-${plan.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlanId(plan.id);
                          handleOpenKiwifyCheckout(plan);
                        }}
                        className="w-full inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600/15 border border-emerald-600/35 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition"
                      >
                        <ExternalLink className="size-3.5" />
                        Comprar na Kiwify
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Informações de Margem e Segurança */}
            <div
              className={`mt-6 rounded-2xl border p-4 text-xs space-y-2 ${
                isDark
                  ? 'border-slate-800 bg-[#111726]/60 text-slate-400'
                  : 'border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)]'
              }`}
            >
              <div className={`flex items-center gap-2 font-semibold ${isDark ? 'text-slate-300' : 'text-[var(--cg-text)]'}`}>
                <ShieldCheck className="size-4 text-emerald-500" />
                Créditos Sem Validade
              </div>
              <p>
                Os créditos adquiridos ficam na sua conta sem prazo de expiração — você consome apenas quando gera vitrines, edita com IA ou responde clientes no WhatsApp.
              </p>
            </div>
          </div>

          {/* Coluna 3: Resumo do Pedido & Pagamento */}
          <div
            className={`rounded-3xl border p-6 shadow-xl flex flex-col justify-between ${
              isDark
                ? 'border-slate-800 bg-[#111726]'
                : 'border-[var(--cg-border)] bg-[var(--cg-surface)]'
            }`}
          >
            <div>
              <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]'}`}>
                Resumo da Compra
              </h2>

              {selectedPlan && (
                <div className={`space-y-3 pb-4 border-b text-sm ${isDark ? 'border-slate-800' : 'border-[var(--cg-border)]'}`}>
                  <div className={`flex justify-between ${isDark ? 'text-slate-300' : 'text-[var(--cg-text-secondary)]'}`}>
                    <span>Pacote Selecionado:</span>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-[var(--cg-text)]'}`}>
                      {selectedPlan.name}
                    </span>
                  </div>
                  <div className={`flex justify-between ${isDark ? 'text-slate-300' : 'text-[var(--cg-text-secondary)]'}`}>
                    <span>Créditos a Adicionar:</span>
                    <span className="cg-tabular font-bold text-[#0867E8] dark:text-[#38BDF8]">
                      +{selectedPlan.credits.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className={`flex justify-between ${isDark ? 'text-slate-300' : 'text-[var(--cg-text-secondary)]'}`}>
                    <span>Novo Saldo Estimado:</span>
                    <span className="cg-tabular font-bold text-emerald-600 dark:text-emerald-400">
                      {projectedBalance.toLocaleString('pt-BR')} créditos
                    </span>
                  </div>
                  <div
                    className={`flex justify-between text-base font-black pt-2 border-t ${
                      isDark ? 'text-white border-slate-800/80' : 'text-[var(--cg-text)] border-[var(--cg-border)]'
                    }`}
                  >
                    <span>Total a Pagar:</span>
                    <span className="cg-tabular text-emerald-600 dark:text-emerald-400">
                      {sanitizePlanPriceLabel(selectedPlan.priceFormatted)}
                    </span>
                  </div>
                </div>
              )}

              <div
                className={`mt-5 rounded-2xl border p-4 space-y-2 text-xs ${
                  isDark
                    ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  Pagamento Seguro via Kiwify
                </div>
                <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-emerald-900'}`}>
                  Ao confirmar abaixo, você será redirecionado com segurança para o checkout oficial da Kiwify (PIX instantâneo ou Cartão de Crédito).
                </p>
              </div>
            </div>

            {/* Ação Primária Kiwify */}
            <div className={`mt-6 pt-4 border-t space-y-3 ${isDark ? 'border-slate-800' : 'border-[var(--cg-border)]'}`}>
              {awaitingKiwifyPlan ? (
                <div
                  data-testid="kiwify-awaiting-confirmation"
                  className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs font-semibold text-amber-700 dark:text-amber-200"
                >
                  Aguardando confirmação automática da Kiwify para <strong>{awaitingKiwifyPlan}</strong>... Assim que o pagamento aprovar, o saldo atualiza sozinho aqui.
                </div>
              ) : null}
              {confirmedCreditsDelta !== null ? (
                <div
                  data-testid="kiwify-credits-confirmed"
                  className="rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3.5 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                >
                  Pagamento confirmado! +{confirmedCreditsDelta.toLocaleString('pt-BR')} créditos adicionados à sua conta.
                </div>
              ) : null}
              <ActionButton
                variant="success"
                size={48}
                data-testid="kiwify-checkout-primary-btn"
                leftIcon={<ExternalLink className="size-4" />}
                onClick={() => handleOpenKiwifyCheckout(selectedPlan)}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-black tracking-wide rounded-2xl shadow-lg shadow-emerald-600/20"
              >
                COMPRAR {sanitizePlanPriceLabel(selectedPlan?.priceFormatted || '').toUpperCase()} NA KIWIFY
              </ActionButton>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
