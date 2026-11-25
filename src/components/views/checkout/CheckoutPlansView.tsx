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
  X,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useToast } from '@/components/ui/ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';
import { getBrandHorizontalLogo, useDocumentDarkMode } from '@/utils/themeLogos';
import { CreditDurationSimulator } from './CreditDurationSimulator';
import { RedeemCreditCodeCard } from '@/components/views/settings/RedeemCreditCodeCard';

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
  recharge_code: { label: 'Código especial de recarga resgatado', category: 'credit' },
  redeem_code: { label: 'Código de acesso resgatado', category: 'credit' },
  order_refunded: { label: 'Estorno / Reembolso Kiwify', category: 'refund' },
  failure_refund: { label: 'Estorno automático de falha', category: 'credit' },
  generate_storefront: { label: 'Geração de Vitrine com IA', category: 'debit' },
  debit_generate_full_storefront: { label: 'Geração de Vitrine com IA', category: 'debit' },
  edit_storefront: { label: 'Edição / Nova página na Vitrine', category: 'debit' },
  debit_create_subpage: { label: 'Edição / Nova página na Vitrine', category: 'debit' },
  debit_edit_block: { label: 'Ajuste cirúrgico na Vitrine', category: 'debit' },
  generate_image: { label: 'Geração / Busca de Imagem IA', category: 'debit' },
  debit_generate_image_schnell: { label: 'Geração de Imagem Produto IA', category: 'debit' },
  debit_generate_hero_dev: { label: 'Geração de Capa Hero IA', category: 'debit' },
  whatsapp_reply_consumed: { label: 'Atendimento WhatsApp (Sofia IA)', category: 'debit' },
  debit_glm_whatsapp: { label: 'Atendimento WhatsApp (Sofia IA)', category: 'debit' },
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
  const [selectedOperationType, setSelectedOperationType] = useState<string | null>(null);
  const [hoveredEntry, setHoveredEntry] = useState<CreditLedgerEntry | null>(null);
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
                credits: 250,
                priceCents: 10000,
                priceFormatted: 'R$ 100,00',
                pricePerCredit: 'R$ 0,40',
                savingsPercent: '20%',
                popular: true,
                kiwifyUrl: 'https://pay.kiwify.com.br/0USJqo5',
                description: '250 créditos (200 + 50 bônus): até 2.500 respostas da Sofia ou vitrine IA + 20 fotos + 2.260 msgs.',
              },
              {
                id: 'plan_micro_10',
                slug: 'plan_micro_10',
                name: 'Recarga Entrada',
                credits: 20,
                priceCents: 990,
                priceFormatted: 'R$ 9,90',
                pricePerCredit: 'R$ 0,50',
                savingsPercent: null,
                popular: false,
                kiwifyUrl: 'https://pay.kiwify.com.br/7fBDYu4',
                description: '20 créditos: até 200 respostas da Sofia ou 1 vitrine IA + 4 fotos + 120 msgs no WhatsApp.',
              },
              {
                id: 'plan_growth_25',
                slug: 'plan_growth_25',
                name: 'Recarga Crescimento',
                credits: 55,
                priceCents: 2490,
                priceFormatted: 'R$ 24,90',
                pricePerCredit: 'R$ 0,45',
                savingsPercent: '10%',
                popular: false,
                kiwifyUrl: 'https://pay.kiwify.com.br/O0ueDhe',
                description: '55 créditos (50 + 5 bônus): até 550 respostas da Sofia ou 2 vitrines + 10 fotos + 370 msgs.',
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
  const [animatedProjectedBalance, setAnimatedProjectedBalance] = useState<number>(projectedBalance);
  const prevProjectedRef = useRef<number>(projectedBalance);

  useEffect(() => {
    const startVal = prevProjectedRef.current;
    const endVal = projectedBalance;
    if (startVal === endVal) {
      setAnimatedProjectedBalance(endVal);
      return;
    }
    const startMs = performance.now();
    const durationMs = 260;
    let rafId = 0;
    const tick = (nowMs: number) => {
      const t = Math.min(1, (nowMs - startMs) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      setAnimatedProjectedBalance(Math.round(startVal + (endVal - startVal) * eased));
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        prevProjectedRef.current = endVal;
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      prevProjectedRef.current = endVal;
    };
  }, [projectedBalance]);

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
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
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
    const byOp = new Map<string, { opType: string; label: string; total: number; count: number }>();
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
        const prev = byOp.get(entry.operation_type) || {
          opType: entry.operation_type,
          label: meta.label,
          total: 0,
          count: 0,
        };
        prev.total += abs;
        prev.count += 1;
        byOp.set(entry.operation_type, prev);
      }
    }
    const bars = Array.from(byOp.values()).sort((a, b) => b.total - a.total);
    const maxBar = Math.max(1, ...bars.map((b) => b.total));
    const filteredLedger = selectedOperationType
      ? ledgerEntries.filter((e) => e.operation_type === selectedOperationType)
      : ledgerEntries;
    const paymentHistory = ledgerEntries.filter((e) =>
      ['purchase_kiwify', 'order_refunded', 'welcome_invite', 'redeem_code', 'failure_refund'].includes(e.operation_type) ||
      Number(e.delta || 0) > 0,
    );
    return { totalSpent, totalLoaded, bars, maxBar, filteredLedger, paymentHistory };
  }, [ledgerEntries, selectedOperationType]);

  return (
    <div
      className={`min-h-screen w-full font-sans px-5 py-6 sm:px-8 transition-colors ${
        isDark
          ? 'bg-[#090D16] text-slate-100'
          : 'bg-[#F8FAFC] text-[#09090B]'
      }`}
    >
      <div className="mx-auto max-w-[1360px]">
        {/* Barra Superior Editorial Minimalista */}
        <header
          className={`flex flex-col gap-4 pb-5 border-b md:flex-row md:items-end md:justify-between ${
            isDark ? 'border-slate-800' : 'border-[#E2E8F0]'
          }`}
        >
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
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
              className={`inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                isDark
                  ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                  : 'border-[#E2E8F0] bg-white text-[#09090B] hover:bg-[#F1F5F9]'
              }`}
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              Voltar ao Aplicativo
            </button>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <img
                  src={getBrandHorizontalLogo(isDark)}
                  alt="CompanyGen"
                  data-testid="checkout-brand-logo"
                  className="h-6 w-auto object-contain bg-transparent"
                />
                <span
                  className={`text-[11px] font-semibold tracking-wider uppercase ${
                    isDark ? 'text-slate-400' : 'text-[#64748B]'
                  }`}
                >
                  Créditos, pagamentos & consumo
                </span>
              </div>
              <h1
                className={`font-serif text-[34px] font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-[44px] ${
                  isDark ? 'text-white' : 'text-[#09090B]'
                }`}
              >
                Planos
              </h1>
            </div>
          </div>

          {/* Saldo Atual */}
          <div
            className={`flex shrink-0 items-center gap-3 self-start rounded-[14px] border px-4 py-2.5 md:self-auto ${
              isDark
                ? 'border-[#1E293B] bg-[#111726]'
                : 'border-[#E2E8F0] bg-white'
            }`}
          >
            <Zap className={`size-4 ${isDark ? 'text-[#38BDF8]' : 'text-[#2563EB]'}`} />
            <div>
              <span
                className={`text-[10px] font-semibold block uppercase ${
                  isDark ? 'text-slate-400' : 'text-[#64748B]'
                }`}
              >
                Saldo Atual
              </span>
              <span
                className={`cg-tabular text-lg font-bold ${
                  isDark ? 'text-white' : 'text-[#09090B]'
                }`}
                data-testid="checkout-current-balance"
              >
                {currentBalance.toLocaleString('pt-BR')} créditos
              </span>
            </div>
          </div>
        </header>

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
              <div data-testid="credits-telemetry-panel" className="flex items-center justify-between gap-2">
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
                <div
                  className="space-y-2.5 pt-2"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, transparent 0, transparent 42px, rgba(100,116,139,0.12) 42px, rgba(100,116,139,0.12) 43px)',
                  }}
                >
                  {telemetry.bars.map((bar) => {
                    const pct = Math.max(6, Math.round((bar.total / telemetry.maxBar) * 100));
                    const isPressed = selectedOperationType === bar.opType;
                    return (
                      <button
                        key={bar.opType}
                        type="button"
                        role="button"
                        aria-pressed={isPressed}
                        data-testid={`checkout-chart-bar-${bar.opType}`}
                        onClick={() =>
                          setSelectedOperationType((cur) => (cur === bar.opType ? null : bar.opType))
                        }
                        className={`w-full rounded-xl border p-2.5 text-left space-y-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                          isPressed
                            ? 'border-[#2563EB] bg-blue-500/10 ring-1 ring-[#2563EB]/30'
                            : isDark
                              ? 'border-transparent hover:bg-slate-800/60'
                              : 'border-transparent hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className={`font-semibold truncate ${isDark ? 'text-slate-200' : 'text-[var(--cg-text)]'}`}>
                            {bar.label}
                          </span>
                          <span className="cg-tabular shrink-0 font-mono text-[#38BDF8]">
                            -{bar.total.toLocaleString('pt-BR')} cr ({bar.count}x)
                          </span>
                        </div>
                        <div className={`h-2.5 w-full overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                          <div
                            className={`h-full rounded-full transition-colors ${
                              isPressed
                                ? 'bg-[#09090B] dark:bg-[#2563EB]'
                                : 'bg-[#2563EB]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    className={`text-sm font-bold flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-[var(--cg-text)]'
                    }`}
                  >
                    <ReceiptText className="size-4 text-emerald-500" />
                    Histórico de Pagamentos & Movimentações
                  </h2>
                  <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-[var(--cg-text-muted)]'}`}>
                    Clique em qualquer barra ao lado para filtrar ou passe o mouse/foque para detalhes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOperationType && (
                    <button
                      type="button"
                      data-testid="checkout-clear-ledger-filter"
                      onClick={() => setSelectedOperationType(null)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-[#2563EB]/40 bg-blue-500/10 px-2.5 text-xs font-bold text-[#2563EB] dark:text-[#38BDF8] hover:bg-blue-500/20"
                    >
                      <X className="size-3" />
                      Limpar filtro
                    </button>
                  )}
                  <span className="cg-tabular rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                    Recargas: +{telemetry.totalLoaded.toLocaleString('pt-BR')} cr
                  </span>
                </div>
              </div>

              {/* Tooltip Camada 2 ao focar / passar mouse em item do extrato */}
              {hoveredEntry && (
                <div
                  data-testid="checkout-ledger-tooltip"
                  role="status"
                  className="cg-tabular rounded-xl border border-blue-200 dark:border-blue-500/40 bg-blue-50/80 dark:bg-blue-500/10 px-3.5 py-2 text-xs text-[#0F172A] dark:text-blue-100 flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    <strong>{(OP_LABELS[hoveredEntry.operation_type] || { label: hoveredEntry.operation_type }).label}</strong> ·{' '}
                    {new Date(hoveredEntry.created_at).toLocaleString('pt-BR')}
                  </span>
                  <span className="font-mono font-bold">
                    {Number(hoveredEntry.delta) >= 0 ? `+${hoveredEntry.delta}` : hoveredEntry.delta} cr ·{' '}
                    {Number(hoveredEntry.balance_after) - Number(hoveredEntry.delta)} → {hoveredEntry.balance_after} cr
                  </span>
                </div>
              )}

              {telemetry.filteredLedger.length === 0 ? (
                <div
                  className={`rounded-2xl border border-dashed p-6 text-center text-xs ${
                    isDark
                      ? 'border-slate-700 bg-slate-900/50 text-slate-300'
                      : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)]'
                  }`}
                >
                  Nenhuma movimentação registrada para este filtro.
                </div>
              ) : (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {telemetry.filteredLedger.slice(0, 40).map((entry) => {
                    const meta = OP_LABELS[entry.operation_type] || {
                      label: entry.operation_type || 'Movimentação',
                      category: entry.delta >= 0 ? 'credit' : 'debit',
                    };
                    const isPositive = Number(entry.delta || 0) >= 0;
                    const isRefund = entry.operation_type === 'order_refunded';
                    return (
                      <li
                        key={entry.id}
                        tabIndex={0}
                        data-testid={`checkout-ledger-row-${entry.operation_type}`}
                        onMouseEnter={() => setHoveredEntry(entry)}
                        onFocus={() => setHoveredEntry(entry)}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
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
        <div className="mt-6 space-y-6">
          {userId ? (
            <RedeemCreditCodeCard
              userId={userId}
              compact
              onRedeemed={({ newBalance }) => setCurrentBalance(newBalance)}
            />
          ) : null}
          <CreditDurationSimulator
            plans={plans}
            selectedPlanId={selectedPlanId}
            onSelectPlan={setSelectedPlanId}
            isDark={isDark}
          />

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Coluna 1 & 2: Seleção de Planos */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-[var(--cg-text-muted)]'}`}>
              Escolha seu Pacote de Créditos (Sem Validade)
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const cleanPrice = sanitizePlanPriceLabel(plan.priceFormatted);
                return (
                  <div
                    key={plan.id}
                    data-testid={`checkout-plan-card-${plan.id}`}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                    }}
                    className={`relative flex flex-col justify-between rounded-[14px] border p-5 cursor-pointer transition-colors ${
                      plan.popular ? 'order-first sm:order-none' : ''
                    } ${
                      isSelected
                        ? isDark
                          ? 'border-[#3B82F6] bg-[#182034] ring-1 ring-[#3B82F6]/40'
                          : 'border-[#09090B] bg-white ring-1 ring-[#09090B]'
                        : isDark
                          ? 'border-slate-800 bg-[#111726]/90 hover:border-slate-700 hover:bg-[#182034]'
                          : 'border-[#E2E8F0] bg-white hover:border-[#09090B]/30'
                    }`}
                  >
                    {/* Tag de Destaque */}
                    {plan.popular && (
                      <div className="absolute -top-2.5 left-4 rounded-full bg-[#09090B] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:bg-white dark:text-[#09090B]">
                        Recomendado
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
                    <span
                      data-testid="checkout-projected-balance"
                      className="cg-tabular font-bold text-emerald-600 dark:text-emerald-400"
                    >
                      {animatedProjectedBalance.toLocaleString('pt-BR')} créditos
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
        </div>
        )}
      </div>
    </div>
  );
}
