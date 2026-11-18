import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  FileSpreadsheet,
  MessageCircle,
  MousePointerClick,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type { D1FunnelMetrics } from '@/schemas/ai-whatsapp-intent.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  formatCurrencyBRL,
  type BusinessOrder,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import {
  ORDER_STATUS_META,
  ORDER_STATUS_UI_MAP,
  loadDashboardMetrics,
  updateOrderStatus,
  type BackendOrderStatus,
  type DashboardPeriodDays,
} from '@/services/profile-service';
import {
  ActionButton,
  EmptyStateCard,
  SkeletonBlock,
  SkeletonTableRows,
  useToast,
} from '@/components/ui';
import { ManualSaleModal } from './ManualSaleModal';
import { OrderDetailsModal } from './OrderDetailsModal';
import { OrderSpreadsheetCatalogModal } from './OrderSpreadsheetCatalogModal';
import {
  ORDER_STATUS_LIST,
  extractCustomerPhone,
  formatOrderDateTime,
  formatPhoneBR,
  isManualOrder,
  normalizeOrderStatus,
} from './order-utils';

export interface OrdersKanbanViewProps {
  profile: BusinessProfile;
  revision?: number;
  dashboard?: DashboardMetricsProjection | null;
  d1Funnel?: Partial<D1FunnelMetrics> | null;
  owner?: string;
  loading?: boolean;
  storeUrl?: string;
  onRefresh?: () => void | Promise<void>;
  onDashboardChange?: (next: DashboardMetricsProjection) => void;
  onOpenWhatsApp?: (phoneDigits: string, order: BusinessOrder) => void;
}

const PERIOD_OPTIONS: Array<{ value: DashboardPeriodDays; label: string }> = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 'all', label: 'Todos' },
];

export function OrdersKanbanView({
  profile,
  dashboard,
  d1Funnel: d1FunnelProp,
  owner,
  loading: externalLoading = false,
  storeUrl,
  onRefresh,
  onDashboardChange,
  onOpenWhatsApp,
}: OrdersKanbanViewProps) {
  const { showToast } = useToast();

  const [periodDays, setPeriodDays] = useState<DashboardPeriodDays>(7);
  const [statusFilter, setStatusFilter] = useState<'all' | BackendOrderStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [localDashboard, setLocalDashboard] = useState<DashboardMetricsProjection | null>(
    dashboard ?? null,
  );
  const [orders, setOrders] = useState<BusinessOrder[]>(dashboard?.recentOrders ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [ordersXlsOpen, setOrdersXlsOpen] = useState(false);
  const [eventsFunnel, setEventsFunnel] = useState<Partial<D1FunnelMetrics> | null>(null);
  const [selectedOrderRef, setSelectedOrderRef] = useState<string | null>(null);
  const [updatingRefs, setUpdatingRefs] = useState<Record<string, boolean>>({});
  const [highlightedRefs, setHighlightedRefs] = useState<Record<string, boolean>>({});
  const knownOrderRefsRef = useRef<Set<string>>(
    new Set((dashboard?.recentOrders ?? []).map((o) => o.order_ref)),
  );

  useEffect(() => {
    const newOnes = orders.filter((o) => o.order_ref && !knownOrderRefsRef.current.has(o.order_ref));
    if (newOnes.length === 0) return;
    newOnes.forEach((o) => knownOrderRefsRef.current.add(o.order_ref));
    const additions: Record<string, boolean> = {};
    newOnes.forEach((o) => {
      additions[o.order_ref] = true;
    });
    setHighlightedRefs((prev) => ({ ...prev, ...additions }));
    const timer = window.setTimeout(() => {
      setHighlightedRefs((prev) => {
        const next = { ...prev };
        newOnes.forEach((o) => {
          delete next[o.order_ref];
        });
        return next;
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [orders]);

  const fetchEventsFunnel = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/whatsapp/events', undefined, owner);
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        d1Funnel?: D1FunnelMetrics;
      } | null;
      if (json?.d1Funnel) {
        setEventsFunnel(json.d1Funnel);
      }
    } catch {
      // Preserve last snapshot on transient failure
    }
  }, [owner]);

  useEffect(() => {
    if (d1FunnelProp !== undefined) return;
    void fetchEventsFunnel();
  }, [d1FunnelProp, fetchEventsFunnel, localDashboard?.sourceRevision, orders.length]);

  const updatingOrderRefSet = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);

  // Sync from parent dashboard prop on initial load or external refresh
  useEffect(() => {
    if (!dashboard) return;
    setLocalDashboard(dashboard);
    setOrders(Array.isArray(dashboard.recentOrders) ? dashboard.recentOrders : []);
  }, [dashboard]);

  const fetchMetrics = useCallback(
    async (targetPeriod: DashboardPeriodDays) => {
      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      setFetchError('');
      try {
        const next = await loadDashboardMetrics(owner, targetPeriod);
        if (seq !== requestSeqRef.current) return;
        setLocalDashboard(next);
        setOrders(Array.isArray(next.recentOrders) ? next.recentOrders : []);
        onDashboardChange?.(next);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        setFetchError(
          err instanceof Error
            ? err.message
            : 'Não foi possível atualizar os pedidos agora. Exibindo os dados salvos.',
        );
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [owner, onDashboardChange],
  );

  // Fetch when period changes or on initial mount when no dashboard prop was provided
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (!dashboard) {
        void fetchMetrics(periodDays);
      }
      return;
    }
    void fetchMetrics(periodDays);
  }, [periodDays, fetchMetrics]);

  const effectiveLoading = isLoading || externalLoading;

  // INV-08: exclude 'cancelado' from sales totals across 7 dias, 30 dias, and Todos
  const kpis = useMemo(() => {
    const nonCancelled = orders.filter(
      order => normalizeOrderStatus(order.status) !== 'cancelado',
    );
    const paid = orders.filter(order => {
      const st = normalizeOrderStatus(order.status);
      return st === 'confirmado' || st === 'concluido';
    });
    const awaiting = orders.filter(order => {
      const st = normalizeOrderStatus(order.status);
      return st === 'aguardando_pagamento' || st === 'aguardando_dados';
    });

    const computedSalesCents = nonCancelled.reduce(
      (sum, order) => sum + (Number(order.total_cents) || 0),
      0,
    );
    const salesCents =
      orders.length === 0 && localDashboard && localDashboard.ordersCount > 0
        ? localDashboard.salesCents
        : computedSalesCents;

    const paidTotalCents = paid.reduce(
      (sum, order) => sum + (Number(order.total_cents) || 0),
      0,
    );
    const awaitingTotalCents = awaiting.reduce(
      (sum, order) => sum + (Number(order.total_cents) || 0),
      0,
    );
    const avgTicketCents =
      nonCancelled.length > 0 ? Math.round(salesCents / nonCancelled.length) : 0;

    return {
      salesCents,
      nonCancelledCount: nonCancelled.length,
      paidCount: paid.length,
      paidTotalCents,
      awaitingCount: awaiting.length,
      awaitingTotalCents,
      avgTicketCents,
    };
  }, [orders, localDashboard]);

  const statusCounts = useMemo(() => {
    const counts: Record<BackendOrderStatus, number> = {
      aguardando_dados: 0,
      aguardando_pagamento: 0,
      confirmado: 0,
      concluido: 0,
      cancelado: 0,
    };
    for (const order of orders) {
      counts[normalizeOrderStatus(order.status)] += 1;
    }
    return counts;
  }, [orders]);

  const d1Radar = useMemo(() => {
    const strictFromDashboard = (
      localDashboard as
        | (DashboardMetricsProjection & {
            d1StrictConversion?: Partial<D1FunnelMetrics> & { manualOrdersCount?: number };
          })
        | null
    )?.d1StrictConversion;

    const strictWhatsappOrders = orders.filter((order) => {
      if (normalizeOrderStatus(order.status) === 'cancelado') return false;
      const ext = order as BusinessOrder & {
        whatsapp_purchase_confirmed?: boolean;
        source_channel?: string;
      };
      return (
        ext.whatsapp_purchase_confirmed === true ||
        ext.source_channel === 'whatsapp_purchase_message'
      );
    });
    const strictRevenueFromOrders = strictWhatsappOrders.reduce(
      (sum, o) => sum + (Number(o.total_cents) || 0),
      0,
    );

    const activeFunnel = d1FunnelProp ?? eventsFunnel;
    const visits = Math.max(
      0,
      Number(localDashboard?.visitsTotal) || 0,
      Number(activeFunnel?.visits) || 0,
      Number(strictFromDashboard?.visits) || 0,
    );
    const productClicks = Math.max(
      0,
      Number(activeFunnel?.productClicks) || 0,
      Number(strictFromDashboard?.productClicks) || 0,
    );
    const whatsappPurchaseMessages = Math.max(
      0,
      Number(activeFunnel?.whatsappPurchaseMessages) || 0,
      Number(strictFromDashboard?.whatsappPurchaseMessages) || 0,
    );
    const d1ConfirmedOrders = Math.max(
      strictWhatsappOrders.length,
      Number(activeFunnel?.d1ConfirmedOrders) || 0,
      Number(strictFromDashboard?.d1ConfirmedOrders) || 0,
    );
    const d1RevenueCents = Math.max(
      strictRevenueFromOrders,
      Number(activeFunnel?.d1RevenueCents) || 0,
      Number(strictFromDashboard?.d1RevenueCents) || 0,
    );
    const conversionRatePct =
      visits > 0 ? Math.min(100, Number(((d1ConfirmedOrders / visits) * 100).toFixed(1))) : 0;

    return {
      visits,
      productClicks,
      whatsappPurchaseMessages,
      d1ConfirmedOrders,
      d1RevenueCents,
      conversionRatePct,
    };
  }, [localDashboard, d1FunnelProp, eventsFunnel, orders]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orders.filter(order => {
      const normalized = normalizeOrderStatus(order.status);
      if (statusFilter !== 'all' && normalized !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const itemNames = order.items.map(i => i.name.toLowerCase()).join(' ');
      return (
        order.customer_name.toLowerCase().includes(query) ||
        order.order_ref.toLowerCase().includes(query) ||
        order.payment_method.toLowerCase().includes(query) ||
        extractCustomerPhone(order).includes(query.replace(/\D/g, '') || '__none__') ||
        itemNames.includes(query)
      );
    });
  }, [orders, statusFilter, searchQuery]);

  const selectedOrder = useMemo(
    () => orders.find(o => o.order_ref === selectedOrderRef) ?? null,
    [orders, selectedOrderRef],
  );

  const resolvedStoreUrl = useMemo(() => {
    if (storeUrl) return storeUrl;
    if (typeof window === 'undefined') return '';
    const slugOrOwner =
      owner ||
      profile.publishedStore.publicSlug ||
      profile.business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${window.location.origin}/?view=store&u=${encodeURIComponent(slugOrOwner)}`;
  }, [storeUrl, owner, profile.publishedStore.publicSlug, profile.business.name]);

  async function handleCopyStoreLink() {
    if (!resolvedStoreUrl) return;
    try {
      await navigator.clipboard.writeText(resolvedStoreUrl);
      showToast({
        type: 'success',
        message: 'Link da loja copiado! Agora é só divulgar no WhatsApp e Instagram.',
        durationMs: 3000,
      });
    } catch {
      showToast({
        type: 'neutral',
        message: `Link da loja: ${resolvedStoreUrl}`,
        durationMs: 4000,
      });
    }
  }

  function applyLocalOrderUpdate(updatedOrder: BusinessOrder) {
    setOrders(prev => {
      const exists = prev.some(o => o.order_ref === updatedOrder.order_ref);
      if (!exists) return [updatedOrder, ...prev];
      return prev.map(o => (o.order_ref === updatedOrder.order_ref ? updatedOrder : o));
    });
  }

  async function handleQuickStatusChange(order: BusinessOrder, nextStatus: BackendOrderStatus) {
    const ref = order.order_ref;
    if (updatingOrderRefSet.current.has(ref)) return;

    const prevOrder = order;
    const prevStatus = normalizeOrderStatus(order.status);
    if (prevStatus === nextStatus) return;

    updatingOrderRefSet.current.add(ref);
    setUpdatingRefs(prev => ({ ...prev, [ref]: true }));

    // Optimistic update so INV-08 KPIs recalculate immediately
    applyLocalOrderUpdate({
      ...order,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    });

    try {
      const saved = await updateOrderStatus(ref, nextStatus, owner);
      applyLocalOrderUpdate(saved);
      void onRefresh?.();

      showToast({
        type: 'success',
        message: `Pedido #${ref} atualizado para ${ORDER_STATUS_UI_MAP[nextStatus]}!`,
        durationMs: 5000,
        actionLabel: 'Desfazer',
        onUndo: async () => {
          try {
            const reverted = await updateOrderStatus(ref, prevStatus, owner);
            applyLocalOrderUpdate(reverted);
            void onRefresh?.();
            showToast({
              type: 'neutral',
              message: `Pedido #${ref} restaurado para ${ORDER_STATUS_UI_MAP[prevStatus]}.`,
              durationMs: 2500,
            });
          } catch {
            showToast({
              type: 'error',
              message: 'Não foi possível desfazer a alteração de status.',
              durationMs: 3000,
            });
          }
        },
      });
    } catch {
      applyLocalOrderUpdate(prevOrder);
      showToast({
        type: 'error',
        message: 'Falha ao atualizar status do pedido. Tente novamente.',
        durationMs: 3500,
      });
    } finally {
      updatingOrderRefSet.current.delete(ref);
      setUpdatingRefs(prev => {
        const next = { ...prev };
        delete next[ref];
        return next;
      });
    }
  }

  function handleManualSaleCreated(createdOrder: BusinessOrder) {
    setOrders(prev => [createdOrder, ...prev.filter(o => o.order_ref !== createdOrder.order_ref)]);
    void fetchMetrics(periodDays);
    void onRefresh?.();
  }

  function renderQuickAction(order: BusinessOrder) {
    const status = normalizeOrderStatus(order.status);
    const busy = Boolean(updatingRefs[order.order_ref]);

    if (status === 'aguardando_dados' || status === 'aguardando_pagamento') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleQuickStatusChange(order, 'confirmado')}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-[#15803D] transition-all duration-[120ms] hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50"
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Marcar Pago
        </button>
      );
    }

    if (status === 'confirmado') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleQuickStatusChange(order, 'concluido')}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-semibold text-[#1D4ED8] transition-all duration-[120ms] hover:bg-blue-100 active:scale-[0.98] disabled:opacity-50"
        >
          <ShoppingBag className="size-3.5" aria-hidden="true" />
          Entregue
        </button>
      );
    }

    if (status === 'cancelado') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleQuickStatusChange(order, 'confirmado')}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-[#15803D] transition-all duration-[120ms] hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reverter Pago
        </button>
      );
    }

    return null;
  }

  return (
    <div
      data-testid="orders-kanban-view"
      className="min-h-full w-full overflow-x-hidden bg-[#F8FAFC] px-4 py-4 pb-10 text-[#0F172A] sm:px-6 min-[769px]:pb-8"
    >
      <div data-testid="dashboard-t5-view" className="mx-auto max-w-7xl space-y-3.5 sm:space-y-4">
        {/* Header & Primary Action */}
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
              Pedidos e Vendas
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Acompanhe vendas da vitrine, WhatsApp e lançamentos do balcão em tempo real.
            </p>
            <span
              data-testid="dashboard-catalog-count"
              className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
            >
              {(profile.catalog?.products ?? []).filter(p => p.active !== false).length} produtos ativos no catálogo
            </span>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              isLoading={effectiveLoading}
              leftIcon={<RefreshCw className="size-4" />}
              onClick={() => {
                void fetchMetrics(periodDays);
                if (d1FunnelProp === undefined) {
                  void fetchEventsFunnel();
                }
                void onRefresh?.();
              }}
              aria-label="Atualizar pedidos"
              className="flex-1 sm:flex-none"
            >
              Atualizar
            </ActionButton>

            <ActionButton
              variant="secondary"
              size={44}
              data-testid="open-tela-27-xls-orders"
              leftIcon={<FileSpreadsheet className="size-4 text-[#A855F7]" />}
              onClick={() => setOrdersXlsOpen(true)}
              className="max-w-full flex-1 whitespace-nowrap sm:flex-none"
            >
              Exportar .XLSX (IA)
            </ActionButton>

            <ActionButton
              variant="success"
              size={44}
              leftIcon={<PlusCircle className="size-[18px]" />}
              onClick={() => setManualSaleOpen(true)}
              data-testid="open-manual-sale-btn"
              className="w-full sm:w-auto"
            >
              Registrar Venda Manual
            </ActionButton>
          </div>
        </header>

        {/* TELA 39 — Radar de Tráfego da Vitrine & Conversão Estrita D1 */}
        <section
          data-testid="tela-39-d1-radar"
          aria-label="Radar de Tráfego da Vitrine e Conversão Estrita D1"
          className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs dark:border-[#27272A] dark:bg-[#121215]"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 pb-2">
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F4F4F5]">
                Radar de Tráfego da Vitrine &amp; Conversão Estrita D1
              </h2>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Cliques sem envio de mensagem de compra no WhatsApp NÃO inflam a conversão online D1.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              Taxa D1: {d1Radar.conversionRatePct}% · {formatCurrencyBRL(d1Radar.d1RevenueCents)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3 dark:border-[#27272A] dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-600 dark:text-[#A1A1AA]">
                <span className="truncate">1. Visitantes</span>
                <Users className="size-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
              </div>
              <p className="mt-1 text-lg font-extrabold text-[#0F172A] dark:text-white">
                {d1Radar.visits}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3 dark:border-[#27272A] dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-600 dark:text-[#A1A1AA]">
                <span className="truncate">2. Cliques Produto</span>
                <MousePointerClick className="size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              </div>
              <p className="mt-1 text-lg font-extrabold text-[#0F172A] dark:text-white">
                {d1Radar.productClicks}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3 dark:border-[#27272A] dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-600 dark:text-[#A1A1AA]">
                <span className="truncate">3. Compra WhatsApp</span>
                <MessageCircle className="size-4 shrink-0 text-[#10B981]" aria-hidden="true" />
              </div>
              <p className="mt-1 text-lg font-extrabold text-[#0F172A] dark:text-white">
                {d1Radar.whatsappPurchaseMessages}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 sm:p-3 dark:border-emerald-500/30 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <span className="truncate">4. Conversão D1</span>
                <CheckCircle2 className="size-4 shrink-0 text-[#10B981]" aria-hidden="true" />
              </div>
              <p className="mt-1 text-lg font-extrabold text-emerald-900 dark:text-emerald-200">
                {d1Radar.d1ConfirmedOrders}
              </p>
            </div>
          </div>
        </section>

        {/* Period Filter + Network Error Fallback */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500">Período:</span>
            <div
              role="group"
              aria-label="Filtrar faturamento e pedidos por período"
              className="inline-flex w-full items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 sm:w-auto"
            >
              {PERIOD_OPTIONS.map(option => {
                const active = periodDays === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPeriodDays(option.value)}
                    data-testid={`period-filter-${option.value}`}
                    className={`min-h-[44px] flex-1 rounded-xl px-4 text-sm font-semibold transition-all duration-[120ms] active:scale-[0.98] sm:flex-none ${
                      active
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs font-medium text-slate-500">
            Pedidos cancelados não entram no somatório de vendas.
          </p>
        </div>

        {fetchError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{fetchError}</span>
            <ActionButton
              variant="secondary"
              size={44}
              onClick={() => void fetchMetrics(periodDays)}
            >
              Tentar novamente
            </ActionButton>
          </div>
        ) : null}

        {/* KPI Cards */}
        {effectiveLoading && orders.length === 0 ? (
          <section
            aria-label="Carregando indicadores financeiros"
            className="grid grid-cols-2 gap-3 sm:gap-3.5 xl:grid-cols-4"
          >
            {[0, 1, 2, 3].map(idx => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-2">
                <SkeletonBlock height={14} width="55%" />
                <SkeletonBlock height={28} width="70%" />
                <SkeletonBlock height={12} width="80%" />
              </div>
            ))}
          </section>
        ) : (
          <section
            aria-label="Indicadores de vendas do período"
            className="grid grid-cols-2 gap-3 sm:gap-3.5 xl:grid-cols-4"
          >
            {/* KPI 1: Vendas no período (INV-08) */}
            <article className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-600">Vendas no período</span>
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-[#16A34A]">
                  <TrendingUp className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div
                data-testid="dashboard-sales-total"
                className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]"
              >
                {formatCurrencyBRL(kpis.salesCents)}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Faturamento líquido ({kpis.nonCancelledCount}{' '}
                {kpis.nonCancelledCount === 1 ? 'pedido válido' : 'pedidos válidos'})
              </p>
            </article>

            {/* KPI 2: Pedidos pagos */}
            <article className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-600">Pedidos pagos</span>
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div
                data-testid="dashboard-paid-count"
                className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]"
              >
                {kpis.paidCount}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatCurrencyBRL(kpis.paidTotalCents)} confirmados e entregues
              </p>
            </article>

            {/* KPI 3: Aguardando pagamento */}
            <article className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-600">Aguardando pagamento</span>
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-amber-50 text-[#F59E0B]">
                  <Clock className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div
                data-testid="dashboard-awaiting-count"
                className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]"
              >
                {kpis.awaitingCount}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatCurrencyBRL(kpis.awaitingTotalCents)} em aberto
              </p>
            </article>

            {/* KPI 4: Ticket médio */}
            <article className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-600">Ticket médio</span>
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-slate-100 text-[#0F172A]">
                  <CreditCard className="size-4" aria-hidden="true" />
                </span>
              </div>
              <div
                data-testid="dashboard-avg-ticket"
                className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]"
              >
                {formatCurrencyBRL(kpis.avgTicketCents)}
              </div>
              <p className="mt-0.5 text-xs text-slate-500" data-testid="dashboard-orders-count">
                {orders.length} {orders.length === 1 ? 'pedido no período' : 'pedidos no período'}
              </p>
            </article>
          </section>
        )}

        {/* Search & Status Filters */}
        <section
          aria-label="Filtros da lista de pedidos"
          className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-3.5 shadow-xs space-y-2.5"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome do cliente, código (#PED) ou produto..."
              aria-label="Buscar pedidos"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-11 pl-10 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-1 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-[#0F172A]"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div
            role="group"
            aria-label="Filtrar por status do pedido"
            className="flex flex-wrap items-center gap-2"
          >
            <button
              type="button"
              aria-pressed={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              className={`min-h-[44px] rounded-xl border px-3.5 text-xs font-semibold transition-all duration-[120ms] active:scale-[0.98] ${
                statusFilter === 'all'
                  ? 'border-[#0F172A] bg-[#0F172A] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Todos ({orders.length})
            </button>

            {ORDER_STATUS_LIST.map(statusKey => {
              const meta = ORDER_STATUS_META[statusKey];
              const active = statusFilter === statusKey;
              return (
                <button
                  key={statusKey}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(statusKey)}
                  data-testid={`status-filter-${statusKey}`}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-xs font-semibold transition-all duration-[120ms] active:scale-[0.98] ${
                    active
                      ? `${meta.badgeClass} ring-2 ring-[#2563EB]/25`
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {meta.label} ({statusCounts[statusKey]})
                </button>
              );
            })}
          </div>
        </section>

        {/* Orders List: Loading / Empty / Desktop Table + Mobile Cards */}
        {effectiveLoading && orders.length === 0 ? (
          <SkeletonTableRows rows={5} columns={5} rowHeight={64} />
        ) : orders.length === 0 ? (
          <EmptyStateCard
            icon={
              <img
                src="/brand/illustrations/illustration-request-tracking.svg"
                alt="Acompanhamento de pedidos"
                className="h-14 w-16 object-contain"
              />
            }
            title="Nenhum pedido recebido neste período"
            description="Divulgue o link da sua vitrine no WhatsApp e Instagram ou registre uma venda presencial do balcão."
            ctaLabel="Copiar Link da Loja para Divulgar"
            ctaIcon={<Copy className="size-4" />}
            ctaVariant="primary"
            onCta={() => void handleCopyStoreLink()}
            secondaryLabel="Registrar Venda Manual"
            secondaryIcon={<PlusCircle className="size-4" />}
            onSecondary={() => setManualSaleOpen(true)}
          />
        ) : filteredOrders.length === 0 ? (
          <EmptyStateCard
            icon={<Search className="size-7" />}
            title="Nenhum pedido encontrado para este filtro"
            description="Tente limpar a busca ou selecionar outro status para ver todos os pedidos do período."
            ctaLabel="Limpar Filtros"
            ctaVariant="secondary"
            onCta={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <>
            {/* Desktop Table (>= 769px) */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs min-[769px]:block">
              <div className="overflow-x-auto">
                <table role="table" className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3.5">Pedido</th>
                      <th className="px-4 py-3.5">Cliente</th>
                      <th className="px-4 py-3.5">Itens</th>
                      <th className="px-4 py-3.5">Pagamento</th>
                      <th className="px-4 py-3.5">Total</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map(order => {
                      const status = normalizeOrderStatus(order.status);
                      const meta = ORDER_STATUS_META[status];
                      const dt = formatOrderDateTime(order.created_at);
                      const phone = extractCustomerPhone(order);
                      const firstItem = order.items[0]?.name || 'Venda';
                      const extraItems = Math.max(0, order.items.length - 1);
                      const manual = isManualOrder(order);

                      return (
                        <tr
                          key={order.order_ref}
                          data-testid={`order-row-${order.order_ref}`}
                          className={`transition-colors duration-300 ${
                            highlightedRefs[order.order_ref]
                              ? 'bg-emerald-50/90 ring-1 ring-inset ring-emerald-300'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#0F172A]">#{order.order_ref}</span>
                              {manual ? (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                                  Balcão
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-500">
                              {dt.date} · {dt.time}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 align-middle">
                            <div className="max-w-[200px] truncate font-semibold text-[#0F172A]">
                              {order.customer_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {phone ? formatPhoneBR(phone) : 'Sem WhatsApp'}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 align-middle">
                            <div className="max-w-[220px] truncate font-medium text-[#0F172A]">
                              {firstItem}
                            </div>
                            {extraItems > 0 ? (
                              <div className="text-xs text-slate-500">
                                +{extraItems} {extraItems === 1 ? 'outro item' : 'outros itens'}
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-3.5 align-middle text-xs font-medium text-slate-700">
                            {order.payment_method || 'A combinar'}
                          </td>

                          <td className="px-4 py-3.5 align-middle font-bold text-[#0F172A]">
                            {formatCurrencyBRL(order.total_cents)}
                          </td>

                          <td className="px-4 py-3.5 align-middle">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex items-center justify-end gap-2">
                              {renderQuickAction(order)}
                              <button
                                type="button"
                                onClick={() => setSelectedOrderRef(order.order_ref)}
                                data-testid={`order-details-btn-${order.order_ref}`}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F172A] transition-all duration-[120ms] hover:bg-slate-100 active:scale-[0.98]"
                              >
                                <Eye className="size-3.5" aria-hidden="true" />
                                Detalhes
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Stacked Cards (<= 768px) */}
            <div className="space-y-3 min-[769px]:hidden">
              {filteredOrders.map(order => {
                const status = normalizeOrderStatus(order.status);
                const meta = ORDER_STATUS_META[status];
                const dt = formatOrderDateTime(order.created_at);
                const firstItem = order.items[0]?.name || 'Venda';
                const extraItems = Math.max(0, order.items.length - 1);

                return (
                  <article
                    key={order.order_ref}
                    data-testid={`order-card-${order.order_ref}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#0F172A]">
                            #{order.order_ref}
                          </span>
                          <span className="text-xs text-slate-500">
                            {dt.date} · {dt.time}
                          </span>
                        </div>
                        <h3 className="mt-0.5 truncate text-base font-bold text-[#0F172A]">
                          {order.customer_name}
                        </h3>
                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="truncate font-medium text-slate-700">
                        {firstItem}
                        {extraItems > 0 ? ` (+${extraItems})` : ''}
                      </span>
                      <span className="shrink-0 text-sm font-extrabold text-[#0F172A]">
                        {formatCurrencyBRL(order.total_cents)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {renderQuickAction(order)}
                      <button
                        type="button"
                        onClick={() => setSelectedOrderRef(order.order_ref)}
                        className="ml-auto inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F172A] transition-all duration-[120ms] hover:bg-slate-50 active:scale-[0.98]"
                      >
                        <Eye className="size-3.5" aria-hidden="true" />
                        Ver Detalhes
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* TELA 28: Registrar Venda Manual */}
      <ManualSaleModal
        open={manualSaleOpen}
        onOpenChange={setManualSaleOpen}
        profile={profile}
        owner={owner}
        onCreated={handleManualSaleCreated}
      />

      {/* TELA 29: Detalhes do Pedido */}
      <OrderDetailsModal
        open={Boolean(selectedOrder)}
        onOpenChange={nextOpen => {
          if (!nextOpen) setSelectedOrderRef(null);
        }}
        order={selectedOrder}
        profile={profile}
        owner={owner}
        onStatusUpdated={updatedOrder => {
          applyLocalOrderUpdate(updatedOrder);
          void onRefresh?.();
        }}
        onContactWhatsApp={onOpenWhatsApp}
      />

      {/* TELA 27-XLS: Catalogar & Exportar Pedidos (.XLSX com IA) */}
      <OrderSpreadsheetCatalogModal
        open={ordersXlsOpen}
        onOpenChange={setOrdersXlsOpen}
        orders={orders}
        ownerUser={owner}
      />
    </div>
  );
}
