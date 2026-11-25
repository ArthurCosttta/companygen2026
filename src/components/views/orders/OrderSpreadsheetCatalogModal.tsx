import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/services/supabase-client';
import { workspaceUser } from '@/services/local-storage';
import { buildXlsxUint8Array } from '@/utils/xlsx-io';
import type { BusinessOrder } from '@/schemas/profile.schema';
import { Download, FileSpreadsheet, RefreshCw, Sparkles, X } from 'lucide-react';

export interface CatalogedOrderRow {
  orderRef: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  itemsSummary: string;
  totalCents: number;
  totalBRL: string;
  statusLabel: string;
  canalOrigem: string;
  contaNoD1: boolean;
  categoriaIA: string;
  prioridadeIA: 'Alta' | 'Média' | 'Baixa' | string;
  resumoIA: string;
}

export interface OrderCatalogSummary {
  totalPedidos: number;
  pedidosCancelados: number;
  faturamentoLiquidoCents: number;
  faturamentoLiquidoBRL: string;
  conversoesD1Wpp: number;
  balcaoManual: number;
  vitrineWeb?: number;
  ticketMedioBRL?: string;
}

interface CatalogOrdersResponse {
  ok: boolean;
  modelUsed: string;
  usedFallback: boolean;
  summary: OrderCatalogSummary;
  catalogedOrders: CatalogedOrderRow[];
  xlsxBase64: string;
  filename: string;
}

export interface OrderSpreadsheetCatalogModalProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  orders?: BusinessOrder[];
  ownerUser?: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadBase64Xlsx(base64: string, filename: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function localFallbackCatalogOrders(orders: BusinessOrder[]): Promise<CatalogOrdersResponse> {
  const fmtBRL = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  let faturamentoLiquidoCents = 0;
  let pedidosCancelados = 0;
  let conversoesD1Wpp = 0;
  let balcaoManual = 0;
  const prodStats = new Map<string, { name: string; qty: number; rev: number; orders: number }>();

  const catalogedOrders: CatalogedOrderRow[] = orders.map(order => {
    const ext = order as BusinessOrder & { channel?: string; origin?: string; source?: string };
    const hints = `${ext.channel || ''} ${ext.origin || ''} ${ext.source || ''} ${order.order_ref || ''}`;
    const isManual = /balc[aã]o|manual|pdv/i.test(hints);
    const isD1 = !isManual && (/d1|whatsapp|wpp|bot/i.test(hints) || /@(s\.whatsapp\.net|lid)/i.test(order.customer_jid || ''));
    const canalOrigem = isManual ? 'Balcão Manual' : isD1 ? 'WhatsApp D1' : 'Balcão Manual';
    const contaNoD1 = canalOrigem === 'WhatsApp D1';
    const isCancelled = order.status === 'cancelado';

    if (isCancelled) pedidosCancelados += 1;
    else {
      faturamentoLiquidoCents += order.total_cents || 0;
      if (contaNoD1) conversoesD1Wpp += 1;
      else balcaoManual += 1;

      for (const rawItem of order.items || []) {
        const item = rawItem as typeof rawItem & { qty?: number; unit_price_cents?: number };
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const unitCents = Number(item.unitPriceCents ?? item.unit_price_cents ?? 0);
        const curr = prodStats.get(item.name) || { name: item.name, qty: 0, rev: 0, orders: 0 };
        curr.qty += qty;
        curr.rev += unitCents * qty;
        curr.orders += 1;
        prodStats.set(item.name, curr);
      }
    }

    const totalCents = order.total_cents || 0;
    return {
      orderRef: order.order_ref,
      createdAt: order.created_at,
      customerName: order.customer_name,
      customerPhone: (order.customer_jid || '').replace(/@.*$/, '') || 'Sem telefone',
      itemsSummary: (order.items || [])
        .map(rawItem => {
          const item = rawItem as typeof rawItem & { qty?: number };
          return `${item.quantity ?? item.qty ?? 1}x ${item.name}`;
        })
        .join(' | '),
      totalCents,
      totalBRL: fmtBRL(totalCents),
      statusLabel: order.status,
      canalOrigem,
      contaNoD1,
      categoriaIA: contaNoD1 ? 'Conversão WhatsApp D1' : 'Venda Balcão',
      prioridadeIA: totalCents >= 25000 ? 'Alta' : totalCents >= 8000 ? 'Média' : 'Baixa',
      resumoIA: `${canalOrigem} · ${fmtBRL(totalCents)}`,
    };
  });

  const summary: OrderCatalogSummary = {
    totalPedidos: catalogedOrders.length,
    pedidosCancelados,
    faturamentoLiquidoCents,
    faturamentoLiquidoBRL: fmtBRL(faturamentoLiquidoCents),
    conversoesD1Wpp,
    balcaoManual,
  };

  const xlsxBytes = await buildXlsxUint8Array([
    {
      name: 'Pedidos_Catalogados',
      headers: [
        'Ref_Pedido',
        'Cliente',
        'Canal',
        'Conta_no_D1',
        'Categoria_IA',
        'Prioridade_IA',
        'Valor_BRL',
        'Itens',
      ],
      rows: catalogedOrders.map(o => [
        o.orderRef,
        o.customerName,
        o.canalOrigem,
        o.contaNoD1 ? 'Sim' : 'Não',
        o.categoriaIA,
        o.prioridadeIA,
        o.totalBRL,
        o.itemsSummary,
      ]),
    },
    {
      name: 'Resumo_D1_e_Canais',
      headers: ['Indicador', 'Valor'],
      rows: [
        ['Total Pedidos', summary.totalPedidos],
        ['Faturamento Líquido', summary.faturamentoLiquidoBRL],
        ['Conversões D1 WPP', summary.conversoesD1Wpp],
        ['Balcão Manual', summary.balcaoManual],
      ],
    },
    {
      name: 'Produtos_Mais_Vendidos',
      headers: ['Produto', 'Quantidade', 'Receita_BRL', 'Pedidos'],
      rows: [...prodStats.values()]
        .sort((a, b) => b.rev - a.rev)
        .map(p => [p.name, p.qty, fmtBRL(p.rev), p.orders]),
    },
  ]);

  return {
    ok: true,
    modelUsed: 'deterministic-browser-fallback',
    usedFallback: true,
    summary,
    catalogedOrders,
    xlsxBase64: uint8ToBase64(xlsxBytes),
    filename: 'pedidos_catalogados_companygen.xlsx',
  };
}

export function OrderSpreadsheetCatalogModal({
  open,
  onClose,
  onOpenChange,
  orders,
  ownerUser,
}: OrderSpreadsheetCatalogModalProps) {
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogOrdersResponse | null>(null);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  const runCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const owner = ownerUser || workspaceUser();
      const response = await authenticatedFetch(
        '/api/ai/spreadsheet/catalog-orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orders ? { ordersOverride: orders } : {}),
        },
        owner
      );

      if (response.ok) {
        const json = (await response.json()) as CatalogOrdersResponse;
        setData(json);
        return;
      }

      if (response.status === 404 || response.status >= 500) {
        setData(await localFallbackCatalogOrders(orders || []));
        return;
      }

      const errPayload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(errPayload.error || errPayload.message || `Falha HTTP ${response.status}`);
    } catch (err) {
      if (orders) {
        setData(await localFallbackCatalogOrders(orders));
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao catalogar pedidos via IA.');
      }
    } finally {
      setLoading(false);
    }
  }, [orders, ownerUser]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    void runCatalog();
    return () => cancelAnimationFrame(raf);
  }, [open, runCatalog]);

  if (!open) return null;

  return (
    <div
      data-testid="tela-27-xls-orders-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6"
      style={{
        opacity: entered ? 1 : 0,
        transition: 'opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Catalogação Inteligente de Pedidos D1 e Balcão"
        className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-[#27272A] bg-[#09090B] text-[#FFFFFF] shadow-sm overflow-hidden"
        style={{
          transform: entered
            ? 'translate3d(0, 0, 0) scale3d(1, 1, 1)'
            : 'translate3d(0, 12px, 0) scale3d(0.985, 0.985, 1)',
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
          willChange: 'transform, opacity',
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272A] bg-[#121215] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#27272A] bg-[#18181B] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                TELA 27-XLS · Auditoria de Pedidos
              </span>
              {data && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <Sparkles className="w-3 h-3" />
                  {data.modelUsed}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-extrabold text-[#FFFFFF]">
              Catalogação de Pedidos IA (WhatsApp D1 × Balcão Manual)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runCatalog()}
              className="min-h-[44px] rounded-xl border border-[#27272A] bg-[#18181B] hover:border-zinc-500 px-3.5 text-xs font-semibold text-[#F4F4F5] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Reprocessar
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fechar modal de pedidos"
              className="min-h-[44px] rounded-xl border border-[#27272A] bg-[#18181B] px-4 text-xs font-bold text-[#FFFFFF] hover:bg-zinc-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              Fechar
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 bg-[#09090B]">
          {loading && !data && (
            <div className="rounded-2xl border border-[#27272A] bg-[#121215] p-8 text-center text-xs text-[#E4E4E7]">
              Classificando pedidos e gerando planilha multi-abas (.XLSX)...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Visual KPI Header */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-[#27272A] bg-[#121215] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#E4E4E7]/70">
                    Total Pedidos
                  </div>
                  <div data-testid="kpi-total-pedidos" className="mt-1 text-2xl font-extrabold text-[#FFFFFF]">
                    {data.summary.totalPedidos}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#27272A] bg-[#121215] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#E4E4E7]/70">
                    Faturamento Líquido
                  </div>
                  <div data-testid="kpi-faturamento-liquido" className="mt-1 text-2xl font-extrabold text-emerald-400">
                    {data.summary.faturamentoLiquidoBRL}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#27272A] bg-[#121215] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#E4E4E7]/70">
                    Conversões D1 WPP
                  </div>
                  <div data-testid="kpi-conversoes-d1" className="mt-1 text-2xl font-extrabold text-sky-400">
                    {data.summary.conversoesD1Wpp}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#27272A] bg-[#121215] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#E4E4E7]/70">
                    Balcão Manual
                  </div>
                  <div data-testid="kpi-balcao-manual" className="mt-1 text-2xl font-extrabold text-amber-300">
                    {data.summary.balcaoManual}
                  </div>
                </div>
              </div>

              {/* Cataloged Orders Table */}
              <section className="rounded-2xl border border-[#27272A] bg-[#121215] overflow-hidden">
                <div className="border-b border-[#27272A] bg-[#18181B] px-4 py-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F4F5]">
                    Pedidos Catalogados ({data.catalogedOrders.length})
                  </h3>
                  <span className="text-[11px] text-[#E4E4E7]/75">
                    3 abas prontas no .XLSX: Pedidos_Catalogados · Resumo_D1_e_Canais · Produtos_Mais_Vendidos
                  </span>
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#18181B] border-b border-[#27272A] text-[#E4E4E7]/85">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">orderRef</th>
                        <th className="px-4 py-2.5 font-semibold">Cliente</th>
                        <th className="px-4 py-2.5 font-semibold">Canal</th>
                        <th className="px-4 py-2.5 font-semibold">Conta em D1?</th>
                        <th className="px-4 py-2.5 font-semibold">Categoria IA</th>
                        <th className="px-4 py-2.5 font-semibold">Prioridade IA</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]/70">
                      {data.catalogedOrders.map(row => (
                        <tr key={row.orderRef} className="hover:bg-[#18181B]/70">
                          <td className="px-4 py-2.5 font-mono font-bold text-[#FFFFFF]">{row.orderRef}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-[#F4F4F5]">{row.customerName}</div>
                            <div className="text-[11px] text-[#E4E4E7]/65 truncate max-w-[200px]">
                              {row.itemsSummary}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[#E4E4E7]">{row.canalOrigem}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                                row.contaNoD1
                                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                                  : 'border-zinc-600/40 bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {row.contaNoD1 ? 'Sim (D1)' : 'Não'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[#F4F4F5]">{row.categoriaIA}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                                row.prioridadeIA === 'Alta'
                                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                                  : row.prioridadeIA === 'Média'
                                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              }`}
                            >
                              {row.prioridadeIA}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-[#FFFFFF]">
                            {row.totalBRL}
                          </td>
                        </tr>
                      ))}
                      {data.catalogedOrders.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-[#E4E4E7]/70">
                            Nenhum pedido registrado ainda nesta loja.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#27272A] bg-[#121215] px-5 py-3.5">
          <span className="text-xs text-[#E4E4E7]/70">
            Arquivo gerado nativamente via OpenXML (.XLSX) com formatação e abas auditáveis
          </span>

          <button
            type="button"
            data-testid="download-cataloged-orders-xlsx-btn"
            disabled={!data?.xlsxBase64}
            onClick={() => data && downloadBase64Xlsx(data.xlsxBase64, data.filename)}
            className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-5 text-xs font-bold text-[#FFFFFF] inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Baixar Pedidos Catalogados (.XLSX)
          </button>
        </footer>
      </div>
    </div>
  );
}
