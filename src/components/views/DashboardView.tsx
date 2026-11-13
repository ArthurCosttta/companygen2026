import { useMemo, useState } from 'react';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  FolderKanban,
  Layers,
  MessageCircle,
  PackageCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardViewProps {
  profile: BusinessProfile;
  revision: number;
  dashboard: DashboardMetricsProjection | null;
  workerConnected?: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onBackToDual: () => void;
  onEditFicha: () => void;
}

function catmullRomPath(points: [number, number][]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;
  let path = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return path;
}

export function DashboardView({
  profile,
  revision,
  dashboard,
  workerConnected,
  loading,
  onRefresh,
  onBackToDual,
  onEditFicha,
}: DashboardViewProps) {
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(7);

  const metrics = dashboard || {
    sourceRevision: revision,
    businessName: profile.business.name || 'Minha Loja',
    whatsappConnected: profile.whatsapp.connected,
    displayPhone: profile.whatsapp.displayPhone || profile.whatsapp.phoneE164,
    visitsTotal: 0,
    visitsByDay: {},
    ordersCount: 0,
    salesCents: 0,
    messagesCount: 0,
    catalogCount: profile.catalog.products.filter(p => p.active).length,
    stockUnits: profile.catalog.products.filter(p => p.active).reduce((s, p) => s + p.stock, 0),
    recentOrders: [],
  };
  const whatsappConnected = workerConnected ?? metrics.whatsappConnected;

  const chartSeries = useMemo(() => {
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const dayKeys = Object.keys(metrics.visitsByDay || {}).sort().slice(-7);
    const values = labels.map((_, idx) => {
      const key = dayKeys[idx];
      if (key) return Number(metrics.visitsByDay[key] || 0);
      return idx === 6 ? metrics.visitsTotal : Math.max(0, Math.round(metrics.visitsTotal * (idx / 7)));
    });
    const max = Math.max(10, ...values);
    const left = 48;
    const right = 450;
    const top = 20;
    const bottom = 140;
    const pts: [number, number][] = values.map((v, i) => [
      left + (i * (right - left)) / (values.length - 1),
      bottom - (v / max) * (bottom - top),
    ]);
    const lineD = catmullRomPath(pts);
    const fillD = `${lineD} L ${right},${bottom} L ${left},${bottom} Z`;
    return { labels, values, pts, lineD, fillD, max };
  }, [metrics.visitsByDay, metrics.visitsTotal]);

  const activeProducts = profile.catalog.products.filter(p => p.active);
  const maxStock = Math.max(10, ...activeProducts.map(p => p.stock));

  return (
    <div data-testid="dashboard-t5-view" className="min-h-full bg-[#F7FAFF] text-[#0B1D52] p-5 sm:p-7">
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Topbar faithful to CompanyGen_Preview_Cards_V1 */}
        <header className="bg-white border border-[#E0EAF8] rounded-3xl px-6 py-4 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                  whatsappConnected ? 'bg-[#DFFBE6] text-[#008E2D]' : 'bg-slate-100 text-slate-600'
                }`}>
                  ● {whatsappConnected ? `WhatsApp online (${metrics.displayPhone || 'ativo'})` : 'WhatsApp offline'}
                </span>
                <span
                  data-testid="dashboard-revision-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EAF2FF] text-[#0867E8]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ficha rev.{revision} ✓
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1.5">
                {metrics.businessName} · Painel em tempo real
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5 bg-[#F3F7FD] border border-[#DCE8F7] rounded-full px-3 py-1.5 text-xs font-bold">
              <CalendarDays className="w-3.5 h-3.5 text-[#0867E8]" />
              <select
                value={periodDays}
                onChange={e => setPeriodDays(Number(e.target.value) as 7 | 30 | 90)}
                className="bg-transparent outline-none cursor-pointer"
                aria-label="Período do painel"
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onEditFicha}>
              Editar Ficha
            </Button>
            <Button type="button" size="sm" onClick={onBackToDual} className="bg-[#0867E8] hover:bg-[#0652BC] text-white font-bold gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Voltar para Loja
            </Button>
          </div>
        </header>

        {/* 6 Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" aria-label="Indicadores da operação">
          {/* Card 1: Visitas à loja */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0B1D52] flex items-center justify-center shrink-0">
                <Eye className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Visitas à loja</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xl font-extrabold tracking-tight">{metrics.visitsTotal.toLocaleString('pt-BR')}</span>
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[#DFFBE6] text-[#008E2D]">
                    <ArrowUpRight className="w-3.5 h-3.5" /> ao vivo
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">Visitas nos últimos {periodDays} dias</p>
              </div>
            </header>
            <div className="mt-4">
              <svg viewBox="0 0 470 165" className="w-full h-36 overflow-visible">
                <path d={chartSeries.fillD} fill="#DDEBFF" opacity="0.8" />
                <path d={chartSeries.lineD} fill="none" stroke="#0867E8" strokeWidth="3.2" strokeLinecap="round" />
                {chartSeries.pts.map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r="4.5" fill="#FFFFFF" stroke="#0867E8" strokeWidth="2.5" />
                    <text x={x} y={158} textAnchor="middle" fill="#64748B" fontSize="12">
                      {chartSeries.labels[i]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </article>

          {/* Card 2: Pedidos (Fluxo A) */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0867E8] flex items-center justify-center shrink-0">
                <Box className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Pedidos</h2>
                <div className="text-3xl font-extrabold tracking-tight mt-1" data-testid="dashboard-orders-count">
                  {metrics.ordersCount} pedidos
                </div>
                <p className="text-xs text-[#64748B] mt-1">Recalculados pelo catálogo oficial</p>
              </div>
            </header>
            <div className="mt-4 space-y-2.5">
              {metrics.recentOrders.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#F3F7FD] text-xs text-[#64748B] text-center">
                  Nenhum pedido recebido ainda. Teste finalizar um carrinho no Fluxo A!
                </div>
              ) : (
                metrics.recentOrders.slice(0, 3).map(order => (
                  <div key={order.order_ref} className="flex items-center justify-between gap-3 py-2 border-b border-[#DCE8F7] last:border-0 text-sm">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{order.items[0]?.name || order.customer_name}</div>
                      <div className="text-xs text-[#64748B]">{order.order_ref} · {order.payment_method}</div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      order.status === 'confirmado' || order.status === 'concluido'
                        ? 'bg-[#DFFBE6] text-[#008E2D]'
                        : 'bg-[#E5F1FF] text-[#0867E8]'
                    }`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>

          {/* Card 3: Vendas */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0867E8] flex items-center justify-center shrink-0">
                <CreditCard className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Vendas</h2>
                <div className="text-3xl font-extrabold tracking-tight mt-1" data-testid="dashboard-sales-total">
                  {formatCurrencyBRL(metrics.salesCents)}
                </div>
                <p className="text-xs text-[#64748B] mt-1">Valor recalculado via `skus.json`</p>
              </div>
            </header>
            <div className="mt-4 space-y-2">
              {metrics.recentOrders.slice(0, 3).map(order => (
                <div key={order.order_ref} className="flex items-center justify-between border border-[#DCE8F7] rounded-2xl px-3.5 py-2.5 text-sm">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PackageCheck className="w-4 h-4 text-[#008E2D]" /> Pedido {order.order_ref}
                  </span>
                  <strong>{formatCurrencyBRL(order.total_cents)}</strong>
                </div>
              ))}
              {metrics.recentOrders.length === 0 && (
                <div className="p-4 rounded-2xl bg-[#F3F7FD] text-xs text-[#64748B] text-center">
                  Aguardando primeiras vendas confirmadas.
                </div>
              )}
            </div>
          </article>

          {/* Card 4: Mensagens */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0B1D52] flex items-center justify-center shrink-0">
                <MessageCircle className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Mensagens</h2>
                <div className="text-3xl font-extrabold tracking-tight mt-1">
                  {metrics.messagesCount} <span className="text-base font-normal text-[#64748B]">mensagens</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">Atendente IA: {profile.agent.name || 'Sofia'}</p>
              </div>
            </header>
            <div className="mt-4 bg-[#EDF5FF] rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="bg-white border border-[#DCE8F7] rounded-xl p-2.5 max-w-[85%]">
                Tem {activeProducts[0]?.name || 'produto disponível'}?
              </div>
              <div className="bg-[#DDFBE1] border border-emerald-200 rounded-xl p-2.5 ml-auto max-w-[88%]">
                📦 {activeProducts[0]?.name || 'Produto'} · {formatCurrencyBRL(activeProducts[0]?.priceCents || 0)} · {metrics.businessName}
              </div>
            </div>
          </article>

          {/* Card 5: Catálogo (substitui Posts planejados) */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0867E8] flex items-center justify-center shrink-0">
                <FolderKanban className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Catálogo</h2>
                <div className="text-3xl font-extrabold tracking-tight mt-1" data-testid="dashboard-catalog-count">
                  {metrics.catalogCount} produtos
                </div>
                <p className="text-xs text-[#64748B] mt-1">Sincronizados entre Loja V5 e WhatsApp</p>
              </div>
            </header>
            <div className="mt-4 space-y-2">
              {activeProducts.slice(0, 3).map(prod => (
                <div key={prod.id} className="flex items-center justify-between border border-[#DCE8F7] rounded-2xl px-3 py-2 text-sm">
                  <span className="font-bold truncate">{prod.name}</span>
                  <span className="text-xs font-bold bg-[#EAF2FF] text-[#0867E8] px-2.5 py-1 rounded-full shrink-0">
                    {formatCurrencyBRL(prod.priceCents)}
                  </span>
                </div>
              ))}
              {activeProducts.length === 0 && (
                <div className="p-4 rounded-2xl bg-[#F3F7FD] text-xs text-[#64748B] text-center">
                  Cadastre produtos na Ficha (passo 7).
                </div>
              )}
            </div>
          </article>

          {/* Card 6: Estoque */}
          <article className="bg-white border border-[#E0EAF8] rounded-3xl p-6 shadow-[0_7px_23px_rgba(11,29,82,0.055)] flex flex-col justify-between min-h-[300px]">
            <header className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF2FF] text-[#0867E8] flex items-center justify-center shrink-0">
                <Layers className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Estoque</h2>
                <div className="text-3xl font-extrabold tracking-tight mt-1">
                  {metrics.stockUnits} unidades
                </div>
                <p className="text-xs text-[#64748B] mt-1">Disponibilidade em tempo real no Fluxo B</p>
              </div>
            </header>
            <div className="mt-4 space-y-2.5">
              {activeProducts.slice(0, 3).map(prod => (
                <div key={prod.id} className="grid grid-cols-[1fr_42px_90px] items-center gap-3 text-sm">
                  <span className="font-semibold truncate">{prod.name}</span>
                  <span className="font-bold text-right">{prod.stock}</span>
                  <span className="h-2.5 rounded-full bg-[#E0E9F7] overflow-hidden block">
                    <span
                      className="h-full bg-[#0867E8] block rounded-full"
                      style={{ width: `${Math.min(100, Math.round((prod.stock / maxStock) * 100))}%` }}
                    />
                  </span>
                </div>
              ))}
              {activeProducts.length === 0 && (
                <div className="p-4 rounded-2xl bg-[#F3F7FD] text-xs text-[#64748B] text-center">
                  Sem itens em estoque.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
