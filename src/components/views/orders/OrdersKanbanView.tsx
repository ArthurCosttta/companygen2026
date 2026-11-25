import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyNamed } from '@/utils/chunk-recovery';
import {
  CheckCircle2,
  Copy,
  Eye,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  MousePointerClick,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  Undo2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { D1FunnelMetrics } from '@/schemas/ai-whatsapp-intent.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import { resolveBrandedAppOrigin } from '@/components/views/storefront/storefront-utils';
import {
  formatCurrencyBRL,
  type BusinessOrder,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import {
  ORDER_STATUS_META,
  ORDER_STATUS_UI_MAP,
  deleteOrdersByRef,
  loadDashboardMetrics,
  updateOrderStatus,
  type BackendOrderStatus,
  type DashboardPeriodDays,
} from '@/services/profile-service';
import {
  ActionButton,
  EmptyStateCard,
  HumanErrorCard,
  SkeletonTableRows,
  useToast,
} from '@/components/ui';
const ImportOrdersSpreadsheetModal = lazyNamed(
  () => import('./ImportOrdersSpreadsheetModal'),
  'ImportOrdersSpreadsheetModal',
);
const ManualSaleModal = lazyNamed(() => import('./ManualSaleModal'), 'ManualSaleModal');
const OrderDetailsModal = lazyNamed(() => import('./OrderDetailsModal'), 'OrderDetailsModal');
const OrderSpreadsheetCatalogModal = lazyNamed(
  () => import('./OrderSpreadsheetCatalogModal'),
  'OrderSpreadsheetCatalogModal',
);
import {
  buildOptimisticBusinessOrderFromRow,
  sanitizeOrderPhoneDigits,
  type ParsedOrderRow,
} from './orders-spreadsheet-import';
import {
  ORDER_STATUS_LIST,
  extractCustomerPhone,
  formatPhoneBR,
  isManualOrder,
  isOrderDelayedOver2Hours,
  isSimulationOrder,
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
  const [ordersSubTab, setOrdersSubTab] = useState<'kanban' | 'crm'>('kanban');
  const [autoNotifyStages, setAutoNotifyStages] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('companygen:auto_notify_order_stages') !== '0';
    } catch {
      return true;
    }
  });
  const [mutationError, setMutationError] = useState<{
    order: BusinessOrder;
    nextStatus: BackendOrderStatus;
    message: string;
  } | null>(null);
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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [lastImportedBatch, setLastImportedBatch] = useState<{
    orderRefs: string[];
    totalCents: number;
    count: number;
  } | null>(null);
  const [isUndoingImport, setIsUndoingImport] = useState(false);
  const [eventsFunnel, setEventsFunnel] = useState<Partial<D1FunnelMetrics> | null>(null);
  const [selectedOrderRef, setSelectedOrderRef] = useState<string | null>(null);
  const [updatingRefs, setUpdatingRefs] = useState<Record<string, boolean>>({});
  const [colLimitMap, setColLimitMap] = useState<Record<string, number>>({});
  const [aiModifyInstruction, setAiModifyInstruction] = useState('');
  const [aiModifyBusy, setAiModifyBusy] = useState(false);

  const handleAiModifyOrders = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cmd = aiModifyInstruction.trim();
    if (!cmd || aiModifyBusy) return;
    setAiModifyBusy(true);
    try {
      const res = await authenticatedFetch(
        '/api/orders/ai-modify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: cmd }),
        },
        owner,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || json?.message || 'Não foi possível aplicar comando nos pedidos.'));
      }
      if (Array.isArray(json.orders)) {
        setOrders(json.orders as BusinessOrder[]);
      }
      setAiModifyInstruction('');
      showToast({
        type: 'success',
        message: String(json.summary || 'Pedidos atualizados!'),
        durationMs: 3600,
      });
      void fetchMetrics(periodDays);
      void onRefresh?.();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao modificar pedidos.',
      });
    } finally {
      setAiModifyBusy(false);
    }
  };

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

  // INV-08 + BUG-F06-03: exclui 'cancelado' e 'isSimulation' de todos os cálculos financeiros
  const kpis = useMemo(() => {
    const validReal = orders.filter(
      order => normalizeOrderStatus(order.status) !== 'cancelado' && !isSimulationOrder(order),
    );
    const paid = validReal.filter(order => {
      const st = normalizeOrderStatus(order.status);
      return st === 'confirmado' || st === 'concluido';
    });
    const awaiting = validReal.filter(order => {
      const st = normalizeOrderStatus(order.status);
      return st === 'aguardando_pagamento' || st === 'aguardando_dados';
    });

    const computedSalesCents = validReal.reduce(
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
      validReal.length > 0 ? Math.round(salesCents / validReal.length) : 0;

    return {
      salesCents,
      nonCancelledCount: validReal.length,
      paidCount: paid.length,
      paidTotalCents,
      awaitingCount: awaiting.length,
      awaitingTotalCents,
      avgTicketCents,
    };
  }, [orders, localDashboard]);

  const crmAnalytics = useMemo(() => {
    if (localDashboard?.crmSummary) return localDashboard.crmSummary;
    const validReal = orders.filter(
      order => normalizeOrderStatus(order.status) !== 'cancelado' && !isSimulationOrder(order),
    );
    const totalRevenueCents = validReal.reduce((s, o) => s + (Number(o.total_cents) || 0), 0);
    const orderCount = validReal.length;
    const avgTicketCents = orderCount > 0 ? Math.round(totalRevenueCents / orderCount) : 0;
    const byChannel = { storefront: 0, whatsapp: 0, counter: 0 };
    const prodMap = new Map<string, { sku: string; name: string; storefrontQty: number; whatsappQty: number; counterQty: number; totalQty: number; revenueCents: number }>();
    const custMap = new Map<string, { customerKey: string; customerName: string; phone: string; orderCount: number; totalCents: number; lastOrderAt: string }>();

    for (const order of validReal) {
      const ch = String(order.source_channel || order.channel || '').toLowerCase();
      const channelKey: 'storefront' | 'whatsapp' | 'counter' =
        isManualOrder(order) || ch.includes('counter')
          ? 'counter'
          : ch.includes('whatsapp')
            ? 'whatsapp'
            : 'storefront';
      byChannel[channelKey] += 1;

      for (const item of order.items || []) {
        const sku = String(item.sku || item.name).toUpperCase();
        const qty = Math.max(1, Number(item.quantity || 1));
        const cur = prodMap.get(sku) || {
          sku,
          name: item.name,
          storefrontQty: 0,
          whatsappQty: 0,
          counterQty: 0,
          totalQty: 0,
          revenueCents: 0,
        };
        if (channelKey === 'storefront') cur.storefrontQty += qty;
        else if (channelKey === 'whatsapp') cur.whatsappQty += qty;
        else cur.counterQty += qty;
        cur.totalQty += qty;
        cur.revenueCents += Number(item.lineTotalCents) || 0;
        prodMap.set(sku, cur);
      }

      const phone = extractCustomerPhone(order);
      const custKey = phone || order.customer_name.toLowerCase();
      const curC = custMap.get(custKey) || {
        customerKey: custKey,
        customerName: order.customer_name,
        phone,
        orderCount: 0,
        totalCents: 0,
        lastOrderAt: order.created_at,
      };
      curC.orderCount += 1;
      curC.totalCents += Number(order.total_cents) || 0;
      if (Date.parse(order.created_at || '') > Date.parse(curC.lastOrderAt || '')) {
        curC.lastOrderAt = order.created_at;
      }
      custMap.set(custKey, curC);
    }

    return {
      totalRevenueCents,
      orderCount,
      avgTicketCents,
      byChannel,
      topProducts: Array.from(prodMap.values())
        .sort((a, b) => b.totalQty - a.totalQty || b.revenueCents - a.revenueCents)
        .slice(0, 5),
      repeatCustomers: Array.from(custMap.values())
        .sort((a, b) => b.orderCount - a.orderCount || b.totalCents - a.totalCents)
        .slice(0, 20),
    };
  }, [orders, localDashboard]);

  const statusCounts = useMemo(() => {
    const counts: Record<BackendOrderStatus, number> = {
      aguardando_dados: 0,
      aguardando_pagamento: 0,
      confirmado: 0,
      em_preparo: 0,
      enviado: 0,
      entregue: 0,
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
    const origin = resolveBrandedAppOrigin();
    if (!origin) return '';
    const slugOrOwner =
      owner ||
      profile.publishedStore.publicSlug ||
      profile.business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${origin}/?view=store&u=${encodeURIComponent(slugOrOwner)}`;
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
    setMutationError(null);

    // 0ms Optimistic UI update + recalculates column totals immediately
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
    } catch (err) {
      // M4 / BUG-F06-04: Rollback síncrono em erro 500/rede + HumanErrorCard retry
      applyLocalOrderUpdate(prevOrder);
      setMutationError({
        order: prevOrder,
        nextStatus,
        message:
          err instanceof Error && err.message
            ? err.message
            : `Não foi possível mover o pedido #${ref} agora. A coluna original foi preservada.`,
      });
      showToast({
        type: 'error',
        message: `Falha ao atualizar pedido #${ref}. Estado restaurado.`,
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

  async function handleImportOrdersBatch(validRows: ParsedOrderRow[]) {
    if (validRows.length === 0) return;
    const payloadRows = validRows.map((row, i) => ({
      orderRef: buildOptimisticBusinessOrderFromRow(row, i).order_ref,
      customerName: row.customerName,
      customerPhone: sanitizeOrderPhoneDigits(row.customerPhone) || undefined,
      customItemName: row.itemsSummary || 'Pedido Planilha',
      totalCents: row.totalCents,
      paymentMethod:
        row.status === 'confirmado' || row.status === 'concluido' ? 'Pix' : 'A combinar',
      status: row.status,
    }));

    const batchRes = await authenticatedFetch(
      '/api/orders/import-batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payloadRows }),
      },
      owner,
    );
    const batchJson = (await batchRes.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      orders?: BusinessOrder[];
    } | null;

    if (!batchRes.ok || !batchJson?.ok || !Array.isArray(batchJson.orders)) {
      throw new Error(String(batchJson?.error || 'Falha ao importar lote de pedidos.'));
    }

    const createdOrders = batchJson.orders;

    const createdRefs = createdOrders.map(o => o.order_ref);
    const totalImportedCents = createdOrders.reduce(
      (sum, o) => sum + (Number(o.total_cents) || 0),
      0,
    );

    setOrders(prev => {
      const refSet = new Set(createdRefs);
      return [...createdOrders, ...prev.filter(o => !refSet.has(o.order_ref))];
    });

    setLastImportedBatch({
      orderRefs: createdRefs,
      totalCents: totalImportedCents,
      count: createdOrders.length,
    });

    showToast({
      type: 'success',
      message: `${createdOrders.length} pedido(s) importado(s) · ${formatCurrencyBRL(totalImportedCents)} adicionados`,
      durationMs: 6000,
    });

    void onRefresh?.();
  }

  async function handleUndoLastImport() {
    if (!lastImportedBatch || isUndoingImport) return;
    const batch = lastImportedBatch;
    setIsUndoingImport(true);
    try {
      await deleteOrdersByRef(batch.orderRefs, owner).catch(() => null);
      const removeSet = new Set(batch.orderRefs);
      setOrders(prev => prev.filter(o => !removeSet.has(o.order_ref)));
      setLastImportedBatch(null);
      showToast({
        type: 'neutral',
        message: `Importação de ${batch.count} pedido(s) desfeita.`,
        durationMs: 3500,
      });
      void onRefresh?.();
    } finally {
      setIsUndoingImport(false);
    }
  }

  return (
    <div
      data-testid="orders-kanban-view"
      className="min-h-full w-full overflow-x-hidden bg-[#F8FAFC] dark:bg-[#090D16] px-5 py-6 pb-10 text-[#09090B] dark:text-[#F8FAFC] sm:px-8"
    >
      <div data-testid="dashboard-t5-view" className="mx-auto max-w-[1360px] space-y-5">
        {/* Header Editorial Minimalista (alinhado à Minha Loja) */}
        <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E2E8F0] pb-5 dark:border-[#1E293B]">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 min-w-0">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-serif text-[34px] font-extrabold leading-[0.95] tracking-[-0.03em] text-[#09090B] dark:text-[#F8FAFC] sm:text-[44px]">
                  Pedidos
                </h1>
                <span
                  data-testid="dashboard-sales-total"
                  className="cg-tabular inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-bold text-[#09090B] dark:border-[#1E293B] dark:bg-[#111726] dark:text-emerald-300"
                >
                  <span className="size-2 rounded-full bg-[#10B981]" aria-hidden="true" />
                  {formatCurrencyBRL(kpis.salesCents)} · {kpis.nonCancelledCount} válido(s)
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
                Vitrine, WhatsApp e lançamentos do balcão ·{' '}
                <span data-testid="dashboard-catalog-count" className="cg-tabular font-semibold text-[#09090B] dark:text-slate-200">
                  {(profile.catalog?.products ?? []).filter(p => p.active !== false).length} itens ativos
                </span>
              </p>
            </div>
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
              data-testid="orders-import-spreadsheet-btn"
              leftIcon={<Upload className="size-4 text-[#2563EB]" />}
              onClick={() => setImportModalOpen(true)}
              className="max-w-full flex-1 whitespace-nowrap sm:flex-none"
            >
              Importar Planilha (.xlsx / .csv)
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

        {lastImportedBatch ? (
          <div
            data-testid="orders-import-audit-banner"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs font-semibold text-emerald-950 shadow-2xs dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <span className="cg-tabular flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                {lastImportedBatch.count} pedido(s) importado(s) ·{' '}
                <strong>{formatCurrencyBRL(lastImportedBatch.totalCents)}</strong> adicionados ao Kanban
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="orders-undo-import-btn"
                disabled={isUndoingImport}
                onClick={() => void handleUndoLastImport()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-white px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition disabled:opacity-50 dark:bg-[#090D16] dark:text-emerald-200"
              >
                <Undo2 className="size-3.5" />
                <span>{isUndoingImport ? 'Desfazendo...' : 'Desfazer'}</span>
              </button>
              <button
                type="button"
                aria-label="Fechar resumo de importação"
                onClick={() => setLastImportedBatch(null)}
                className="inline-flex size-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}

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

        {/* Sub-abas Pedidos: Fila de Pedidos (Kanban) <-> Resumo de Vendas & Clientes + Período + Auto-Notify */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Visões de Pedidos"
              className="inline-flex rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={ordersSubTab === 'kanban'}
                data-testid="orders-subtab-kanban"
                onClick={() => setOrdersSubTab('kanban')}
                className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition ${
                  ordersSubTab === 'kanban'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                }`}
              >
                Fila de Pedidos (Kanban)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ordersSubTab === 'crm'}
                data-testid="orders-subtab-crm"
                onClick={() => {
                  setMutationError(null);
                  setOrdersSubTab('crm');
                }}
                className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition ${
                  ordersSubTab === 'crm'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                }`}
              >
                Resumo de Vendas & Clientes
              </button>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={autoNotifyStages}
              data-testid="orders-auto-notify-toggle"
              onClick={() =>
                setAutoNotifyStages(prev => {
                  const next = !prev;
                  try {
                    window.localStorage.setItem('companygen:auto_notify_order_stages', next ? '1' : '0');
                  } catch {
                    // ignore
                  }
                  return next;
                })
              }
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
                autoNotifyStages
                  ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] text-slate-600 dark:text-slate-300'
              }`}
            >
              <MessageCircle className="size-3.5 shrink-0" />
              <span>Avisar etapas no WhatsApp</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
            <form
              onSubmit={(e) => void handleAiModifyOrders(e)}
              className="flex flex-1 items-center gap-1.5 sm:flex-none"
            >
              <input
                type="text"
                data-testid="orders-ai-modify-input"
                value={aiModifyInstruction}
                onChange={(e) => setAiModifyInstruction(e.target.value)}
                placeholder="Comando nos pedidos (ex: limpar simulações)"
                className="min-h-[38px] w-full min-w-[210px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none sm:w-[250px]"
              />
              <button
                type="submit"
                data-testid="orders-ai-modify-btn"
                disabled={aiModifyBusy || !aiModifyInstruction.trim()}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl bg-[#09090B] px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {aiModifyBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                <span>Aplicar</span>
              </button>
            </form>

            <span className="text-xs font-bold text-slate-500 dark:text-[#94A3B8]">Período:</span>
            <div
              role="group"
              aria-label="Filtrar faturamento e pedidos por período"
              className="inline-flex flex-1 items-center gap-1 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-1 sm:flex-none"
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
                    className={`min-h-[38px] flex-1 rounded-xl px-3.5 text-xs font-semibold transition-all duration-[120ms] active:scale-[0.98] sm:flex-none ${
                      active
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E293B] hover:text-[#0F172A]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {mutationError ? (
          <div data-testid="orders-optimistic-error-card">
            <HumanErrorCard
              status={500}
              fallbackMessage={mutationError.message}
              actionLabel="Tentar novamente"
              onAction={() => {
                const { order: failedOrder, nextStatus } = mutationError;
                setMutationError(null);
                void handleQuickStatusChange(failedOrder, nextStatus);
              }}
            />
          </div>
        ) : null}

        {fetchError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 p-4 text-sm text-amber-900 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
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

        {ordersSubTab === 'crm' ? (
          <section data-testid="crm-resumo-panel" className="space-y-4">
            {/* Faixa única de 3 KPIs CRM em tabular-nums (excluindo cancelados e simulações) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">Faturamento Real</span>
                <div
                  data-testid="crm-total-revenue"
                  className="cg-tabular mt-1 text-2xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC]"
                >
                  {formatCurrencyBRL(crmAnalytics.totalRevenueCents)}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                  Exclui cancelados e simulações de teste
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">Ticket Médio</span>
                <div
                  data-testid="crm-avg-ticket"
                  className="cg-tabular mt-1 text-2xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC]"
                >
                  {formatCurrencyBRL(crmAnalytics.avgTicketCents)}
                </div>
                <p className="cg-tabular mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                  Vitrine {crmAnalytics.byChannel.storefront} · WhatsApp {crmAnalytics.byChannel.whatsapp} · Balcão {crmAnalytics.byChannel.counter}
                </p>
              </article>

              <article className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">Total Pedidos Válidos</span>
                <div
                  data-testid="crm-order-count"
                  className="cg-tabular mt-1 text-2xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC]"
                >
                  {crmAnalytics.orderCount}
                </div>
                <p className="cg-tabular mt-1 text-xs text-slate-500 dark:text-[#94A3B8]">
                  {crmAnalytics.repeatCustomers.length} cliente(s) únicos atendidos
                </p>
              </article>
            </div>

            {(() => {
              const realOrders = orders.filter((o) => !isSimulationOrder(o));
              const nonCancelled = realOrders.filter(
                (o) => normalizeOrderStatus(o.status) !== 'cancelado',
              );
              const grossRevenueCents = nonCancelled.reduce(
                (acc, o) => acc + Math.max(0, Number(o.total_cents || 0)),
                0,
              );
              const cmvCents = nonCancelled.reduce((acc, o) => {
                const raw = o as unknown as { cmv_cents?: number; unitCost?: number };
                return acc + Math.max(0, Math.round(Number(raw.cmv_cents ?? (Number(raw.unitCost || 0) * 100))));
              }, 0);
              const feesCents = nonCancelled.reduce((acc, o) => {
                const raw = o as unknown as { fee_cents?: number; feeAmount?: number };
                return acc + Math.max(0, Math.round(Number(raw.fee_cents ?? (Number(raw.feeAmount || 0) * 100))));
              }, 0);
              const lossesCents = realOrders.reduce((acc, o) => {
                const raw = o as unknown as { loss_cents?: number; lossAmount?: number };
                return acc + Math.max(0, Math.round(Number(raw.loss_cents ?? (Number(raw.lossAmount || 0) * 100))));
              }, 0);
              const netProfitCents = grossRevenueCents - cmvCents - feesCents - lossesCents;
              const marginPct =
                grossRevenueCents > 0
                  ? ((netProfitCents / grossRevenueCents) * 100).toFixed(1)
                  : '0.0';
              return (
                <div
                  data-testid="orders-dre-panel"
                  className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      DRE Financeiro & Contábil (IA)
                    </span>
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      Margem Líquida: {marginPct}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Faturamento Bruto</span>
                      <div className="cg-tabular font-bold text-[#0F172A] dark:text-white">{formatCurrencyBRL(grossRevenueCents)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">(-) CMV / Custos</span>
                      <div className="cg-tabular font-bold text-slate-700 dark:text-slate-200">{formatCurrencyBRL(cmvCents)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">(-) Taxas</span>
                      <div className="cg-tabular font-bold text-slate-700 dark:text-slate-200">{formatCurrencyBRL(feesCents)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">(-) Prejuízos</span>
                      <div className="cg-tabular font-bold text-rose-600 dark:text-rose-400">{formatCurrencyBRL(lossesCents)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">(=) Lucro Líquido</span>
                      <div className="cg-tabular font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrencyBRL(netProfitCents)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Top 5 Produtos (Vitrine vs. WhatsApp vs. Balcão) */}
              <div className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  Top 5 Produtos (Vitrine vs. WhatsApp)
                </h2>
                {crmAnalytics.topProducts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                    Ainda sem vendas confirmadas neste período.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-[#1E293B]">
                    {crmAnalytics.topProducts.map(prod => (
                      <li key={prod.sku} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[#0F172A] dark:text-[#F8FAFC]">{prod.name}</p>
                          <p className="cg-tabular text-[11px] text-slate-500 dark:text-[#94A3B8]">
                            Vitrine: {prod.storefrontQty} · WhatsApp: {prod.whatsappQty} · Balcão: {prod.counterQty}
                          </p>
                        </div>
                        <div className="cg-tabular shrink-0 text-right">
                          <span className="block font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                            {formatCurrencyBRL(prod.revenueCents)}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">{prod.totalQty} un.</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Clientes Recorrentes (tabela >430px, cards empilhados <=430px) */}
              <div className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-xs space-y-3">
                <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  Clientes Recorrentes
                </h2>
                {crmAnalytics.repeatCustomers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                    Nenhum cliente registrado neste período.
                  </p>
                ) : (
                  <>
                    <div className="hidden min-[431px]:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-[#1E293B] text-[11px] font-semibold uppercase text-slate-500 dark:text-[#94A3B8]">
                            <th className="py-2 pr-2">Cliente</th>
                            <th className="py-2 px-2">WhatsApp</th>
                            <th className="py-2 px-2 text-right">Pedidos</th>
                            <th className="py-2 pl-2 text-right">Total R$</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#1E293B]">
                          {crmAnalytics.repeatCustomers.map(c => (
                            <tr key={c.customerKey}>
                              <td className="py-2 pr-2 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                                {c.customerName}
                              </td>
                              <td className="cg-tabular py-2 px-2 text-slate-600 dark:text-[#94A3B8]">
                                {c.phone ? formatPhoneBR(c.phone) : 'Não informado'}
                              </td>
                              <td className="cg-tabular py-2 px-2 text-right font-bold">{c.orderCount}</td>
                              <td className="cg-tabular py-2 pl-2 text-right font-bold text-[#10B981]">
                                {formatCurrencyBRL(c.totalCents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="min-[431px]:hidden flex flex-col gap-2.5">
                      {crmAnalytics.repeatCustomers.map(c => (
                        <div
                          key={c.customerKey}
                          className="rounded-xl border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#090D16] p-3 text-xs space-y-1 min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                              {c.customerName}
                            </span>
                            <span className="cg-tabular shrink-0 font-bold text-[#10B981]">
                              {formatCurrencyBRL(c.totalCents)}
                            </span>
                          </div>
                          <div className="cg-tabular flex items-center justify-between text-[11px] text-slate-500 dark:text-[#94A3B8]">
                            <span>{c.phone ? formatPhoneBR(c.phone) : 'Sem WhatsApp'}</span>
                            <span>{c.orderCount} pedido(s)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Search & Status Filters */}
            <section
              aria-label="Filtros da lista de pedidos"
              className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-3 sm:p-3.5 shadow-xs space-y-2.5"
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
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] pr-11 pl-10 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
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
                  className={`cg-tabular min-h-[40px] rounded-xl border px-3 text-xs font-semibold transition-all duration-[120ms] ${
                    statusFilter === 'all'
                      ? 'border-[#0F172A] bg-[#0F172A] dark:bg-[#2563EB] dark:border-[#2563EB] text-white'
                      : 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
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
                      className={`cg-tabular min-h-[40px] rounded-xl border px-3 text-xs font-semibold transition-all duration-[120ms] ${
                        active
                          ? `${meta.badgeClass} ring-2 ring-[#2563EB]/25`
                          : 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {meta.label} ({statusCounts[statusKey]})
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Kanban Board 4 Colunas (4 Sinais por Card + Soma Real excluindo isSimulation + ⏰ >2h) */}
            {effectiveLoading && orders.length === 0 ? (
              <SkeletonTableRows rows={5} columns={5} rowHeight={64} />
            ) : orders.length === 0 ? (
              <EmptyStateCard
                icon={
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-100 text-slate-500">
                    <FileSpreadsheet className="size-7" aria-hidden="true" />
                  </div>
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
              <section
                aria-label="Quadro Kanban de Pedidos"
                data-testid="orders-kanban-board"
                className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4"
              >
                {(
                  [
                    { key: 'aguardando_dados' as const, title: 'Novos', nextStatus: 'aguardando_pagamento' as BackendOrderStatus },
                    { key: 'aguardando_pagamento' as const, title: 'Aguardando Pagto', nextStatus: 'confirmado' as BackendOrderStatus },
                    { key: 'confirmado' as const, title: 'Preparo / Pago', nextStatus: 'concluido' as BackendOrderStatus },
                    { key: 'concluido' as const, title: 'Entregues', nextStatus: null },
                  ] as const
                ).map(col => {
                  const colOrders = filteredOrders.filter(o => normalizeOrderStatus(o.status) === col.key);
                  const realColOrders = colOrders.filter(o => !isSimulationOrder(o));
                  const realSumCents = realColOrders.reduce((s, o) => s + (Number(o.total_cents) || 0), 0);

                  return (
                    <div
                      key={col.key}
                      data-testid={`kanban-col-${col.key}`}
                      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-slate-100/70 dark:bg-[#090D16] p-3"
                    >
                      <header
                        data-testid={`kanban-col-header-${col.key}`}
                        className="cg-tabular flex items-center justify-between gap-2 px-1 text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]"
                      >
                        <span className="truncate">
                          {col.title} · {realColOrders.length} · {formatCurrencyBRL(realSumCents)}
                        </span>
                      </header>

                      <div className="space-y-2.5">
                        {colOrders.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#1E293B] p-4 text-center text-[11px] text-slate-400">
                            Sem pedidos nesta etapa
                          </div>
                        ) : (
                          colOrders.slice(0, colLimitMap[col.key] || 50).map(order => {
                            const delayed = isOrderDelayedOver2Hours(order);
                            const isSim = isSimulationOrder(order);
                            const firstItem = order.items[0]?.name || 'Pedido';
                            const extraItems = Math.max(0, order.items.length - 1);
                            const busy = Boolean(updatingRefs[order.order_ref]);

                            return (
                              <article
                                key={order.order_ref}
                                data-testid={`kanban-card-${order.order_ref}`}
                                style={{ contentVisibility: 'auto', containIntrinsicSize: '150px' }}
                                onClick={() => setSelectedOrderRef(order.order_ref)}
                                className="cursor-pointer rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-4 shadow-2xs space-y-2 hover:border-[#2563EB]/50 transition"
                              >
                                {/* Sinal 1: Nome do comprador + pílula ⏰ >2h (ou [Simulação]) */}
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                                    {order.customer_name}
                                  </h3>
                                  {delayed ? (
                                    <span
                                      data-testid={`kanban-delay-badge-${order.order_ref}`}
                                      className="cg-tabular shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"
                                    >
                                      ⏰ &gt;2h
                                    </span>
                                  ) : isSim ? (
                                    <span
                                      data-testid={`kanban-sim-badge-${order.order_ref}`}
                                      className="shrink-0 rounded-full bg-slate-200 dark:bg-[#1E293B] px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                                    >
                                      Simulação
                                    </span>
                                  ) : null}
                                </div>

                                {/* Sinal 2: Resumo em 1 linha dos itens */}
                                <p className="truncate text-xs text-slate-600 dark:text-[#94A3B8]">
                                  {firstItem}
                                  {extraItems > 0 ? ` +${extraItems}` : ''}
                                </p>

                                {/* Sinal 3: Valor total R$ tabular */}
                                <p className="cg-tabular text-sm font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                                  {formatCurrencyBRL(order.total_cents)}
                                </p>

                                {/* Sinal 4: 1 botão único limpo Avançar → */}
                                <div className="pt-0.5">
                                  {col.nextStatus ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      data-testid={`kanban-advance-btn-${order.order_ref}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        void handleQuickStatusChange(order, col.nextStatus as BackendOrderStatus);
                                      }}
                                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-1 rounded-xl bg-[#2563EB]/10 dark:bg-blue-500/20 px-3 text-xs font-bold text-[#2563EB] dark:text-blue-300 hover:bg-[#2563EB]/20 transition disabled:opacity-50"
                                    >
                                      <span>Avançar →</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      data-testid={`order-details-btn-${order.order_ref}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setSelectedOrderRef(order.order_ref);
                                      }}
                                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-[#334155] px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1E293B]"
                                    >
                                      <Eye className="size-3.5" />
                                      <span>Ver Comanda</span>
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })
                        )}
                        {colOrders.length > (colLimitMap[col.key] || 50) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setColLimitMap((prev) => ({
                                ...prev,
                                [col.key]: (prev[col.key] || 50) + 50,
                              }))
                            }
                            className="w-full rounded-xl border border-dashed border-slate-300 bg-white/80 py-2 text-xs font-bold text-slate-700 hover:bg-white"
                          >
                            Ver +50 pedidos ({colOrders.length - (colLimitMap[col.key] || 50)} restantes)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>

      {/* TELA 28: Registrar Venda Manual */}
      {manualSaleOpen ? (
        <Suspense fallback={null}>
          <ManualSaleModal
            open={manualSaleOpen}
            onOpenChange={setManualSaleOpen}
            profile={profile}
            owner={owner}
            onCreated={handleManualSaleCreated}
          />
        </Suspense>
      ) : null}

      {/* TELA 29: Detalhes do Pedido */}
      {selectedOrder ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      {/* TELA 05: Importar Pedidos via Planilha (.XLSX / .CSV / Colagem Excel) */}
      {importModalOpen ? (
        <Suspense fallback={null}>
          <ImportOrdersSpreadsheetModal
            open={importModalOpen}
            onOpenChange={setImportModalOpen}
            existingOrders={orders}
            onImportOrders={handleImportOrdersBatch}
          />
        </Suspense>
      ) : null}

      {/* TELA 27-XLS: Catalogar & Exportar Pedidos (.XLSX com IA) */}
      {ordersXlsOpen ? (
        <Suspense fallback={null}>
          <OrderSpreadsheetCatalogModal
            open={ordersXlsOpen}
            onOpenChange={setOrdersXlsOpen}
            orders={orders}
            ownerUser={owner}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
