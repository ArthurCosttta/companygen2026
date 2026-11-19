import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  Package,
  Printer,
  RotateCcw,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  type BusinessOrder,
  type BusinessProfile,
} from '@/schemas/profile.schema';
import {
  ORDER_STATUS_META,
  ORDER_STATUS_UI_MAP,
  updateOrderStatus,
  type BackendOrderStatus,
} from '@/services/profile-service';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import {
  ORDER_STATUS_LIST,
  buildWhatsAppOrderUrl,
  extractCustomerPhone,
  formatOrderDateTime,
  formatPhoneBR,
  isManualOrder,
  normalizeOrderStatus,
} from './order-utils';

export interface OrderDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: BusinessOrder | null;
  profile?: BusinessProfile;
  owner?: string;
  onStatusUpdated?: (updatedOrder: BusinessOrder) => void;
  onContactWhatsApp?: (phoneDigits: string, order: BusinessOrder) => void;
}

export function OrderDetailsModal({
  open,
  onOpenChange,
  order,
  profile,
  owner,
  onStatusUpdated,
  onContactWhatsApp,
}: OrderDetailsModalProps) {
  const { showToast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const cancelKeepButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmCancelOpen(false);
    }
  }, [open, order?.order_ref]);

  const productThumbMap = useMemo(() => {
    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const prod of profile?.catalog?.products ?? []) {
      if (prod.imageUrl) {
        if (prod.sku) bySku.set(prod.sku.trim().toUpperCase(), prod.imageUrl);
        if (prod.name) byName.set(prod.name.trim().toLowerCase(), prod.imageUrl);
      }
    }
    return { bySku, byName };
  }, [profile?.catalog?.products]);

  if (!order) return null;

  const currentStatus = normalizeOrderStatus(order.status);
  const currentMeta = ORDER_STATUS_META[currentStatus];
  const customerPhone = extractCustomerPhone(order);
  const created = formatOrderDateTime(order.created_at);
  const updated = formatOrderDateTime(order.updated_at);
  const manualSale = isManualOrder(order);

  const addressSummary = [
    order.delivery_address?.street,
    order.delivery_address?.number,
    order.delivery_address?.neighborhood,
    order.delivery_address?.city,
    order.delivery_address?.notes,
  ]
    .filter(Boolean)
    .join(', ');

  async function applyStatusChange(nextStatus: BackendOrderStatus, skipUndo = false) {
    if (!order || isUpdating || nextStatus === currentStatus) return;
    const prevStatus = currentStatus;
    setIsUpdating(true);
    setConfirmCancelOpen(false);

    try {
      const updatedOrder = await updateOrderStatus(order.order_ref, nextStatus, owner);
      onStatusUpdated?.(updatedOrder);

      const nextLabel = ORDER_STATUS_UI_MAP[nextStatus];
      showToast({
        type: 'success',
        message: `Status do pedido #${order.order_ref} atualizado para ${nextLabel}!`,
        durationMs: skipUndo ? 2500 : 5000,
        ...(skipUndo
          ? {}
          : {
              actionLabel: 'Desfazer',
              onUndo: async () => {
                try {
                  const reverted = await updateOrderStatus(order.order_ref, prevStatus, owner);
                  onStatusUpdated?.(reverted);
                  showToast({
                    type: 'neutral',
                    message: `Status do pedido #${order.order_ref} restaurado para ${ORDER_STATUS_UI_MAP[prevStatus]}.`,
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
            }),
      });
    } catch {
      showToast({
        type: 'error',
        message: 'Falha ao atualizar status do pedido. Tente novamente.',
        durationMs: 3500,
      });
    } finally {
      setIsUpdating(false);
    }
  }

  function handleSelectStatus(nextStatus: BackendOrderStatus) {
    if (isUpdating || nextStatus === currentStatus) return;
    if (nextStatus === 'cancelado') {
      setConfirmCancelOpen(true);
      return;
    }
    void applyStatusChange(nextStatus);
  }

  function handleWhatsAppContact() {
    if (!order || !customerPhone) return;
    if (onContactWhatsApp) {
      onContactWhatsApp(customerPhone, order);
      return;
    }
    const url = buildWhatsAppOrderUrl(customerPhone, order, profile?.business?.name);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <>
      <ModalContainer
        open={open}
        onOpenChange={next => {
          if (!isUpdating) onOpenChange(next);
        }}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-[#0F172A]">
              Pedido #{order.order_ref}
            </span>
            <span
              data-testid="order-details-status-badge"
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${currentMeta.badgeClass}`}
            >
              {currentMeta.label}
            </span>
            {manualSale ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                Venda do Balcão
              </span>
            ) : null}
          </div>
        }
        description={`${order.customer_name} · ${formatCurrencyBRL(order.total_cents)}`}
        role="dialog"
        maxWidth="lg"
        mobileHeight="90%"
        preventCloseWhileSubmitting={isUpdating}
      >
        <div className="cg-print-comanda-root space-y-5">
          {/* Customer card + primary WhatsApp CTA */}
          <section className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-slate-50/70 dark:bg-[#090D16] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                  {order.customer_name}
                </h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-[#94A3B8]">
                  <span>
                    {customerPhone
                      ? `WhatsApp: ${formatPhoneBR(customerPhone)}`
                      : 'WhatsApp não informado'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CreditCard className="size-3.5 text-slate-400" aria-hidden="true" />
                    {order.payment_method || 'A combinar'}
                  </span>
                </div>
                {addressSummary ? (
                  <p className="flex items-start gap-1.5 pt-1 text-xs text-slate-600 dark:text-[#CBD5E1]">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>{addressSummary}</span>
                  </p>
                ) : null}
              </div>

              <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center">
                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<Printer className="size-4" />}
                  onClick={() => window.print()}
                  data-testid="order-details-print-btn"
                >
                  Imprimir Comanda
                </ActionButton>
                <ActionButton
                  variant="success"
                  size={44}
                  leftIcon={<MessageSquare className="size-4" />}
                  disabled={!customerPhone}
                  onClick={handleWhatsAppContact}
                  className="sm:w-[210px]"
                  data-testid="order-details-whatsapp-btn"
                >
                  Chamar no WhatsApp
                </ActionButton>
              </div>
            </div>
          </section>

          {/* Cancelled quick-revert banner */}
          {currentStatus === 'cancelado' ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-red-800">
                <p className="font-semibold">Este pedido está marcado como Cancelado.</p>
                <p>Ele não é somado no faturamento do período. Cancelou por engano?</p>
              </div>
              <ActionButton
                variant="success"
                size={44}
                leftIcon={<RotateCcw className="size-4" />}
                isSubmitting={isUpdating}
                onClick={() => void applyStatusChange('confirmado')}
                data-testid="order-details-revert-paid"
              >
                Reverter para Pago
              </ActionButton>
            </div>
          ) : null}

          {/* Reversible status selector */}
          <section className="no-print space-y-2.5" aria-label="Alterar status do pedido">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0F172A]">Status do Pedido</h4>
              <span className="text-xs text-slate-500">Toque para atualizar</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ORDER_STATUS_LIST.map(statusKey => {
                const meta = ORDER_STATUS_META[statusKey];
                const isActive = statusKey === currentStatus;
                return (
                  <button
                    key={statusKey}
                    type="button"
                    disabled={isUpdating || isActive}
                    aria-pressed={isActive}
                    onClick={() => handleSelectStatus(statusKey)}
                    data-testid={`order-status-pill-${statusKey}`}
                    className={`min-h-[44px] rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all duration-[120ms] active:scale-[0.98] disabled:cursor-default ${
                      isActive
                        ? `${meta.badgeClass} ring-2 ring-[#2563EB]/30`
                        : statusKey === 'cancelado'
                          ? 'border-red-200 bg-white text-red-700 hover:bg-red-50'
                          : 'border-slate-200 bg-white text-[#0F172A] hover:bg-slate-50'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Visual timeline */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
            <h4 className="text-sm font-bold text-[#0F172A]">Linha do Tempo</h4>
            <ol className="space-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2.5">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                  <Clock className="size-3.5" aria-hidden="true" />
                </span>
                <span>
                  Recebido às <strong className="text-[#0F172A]">{created.time}</strong> ({created.date})
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#16A34A]">
                  <Clock className="size-3.5" aria-hidden="true" />
                </span>
                <span>
                  Última atualização às <strong className="text-[#0F172A]">{updated.time}</strong> ({updated.date})
                </span>
              </li>
            </ol>
          </section>

          {/* Order items */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-sm font-bold text-[#0F172A]">
              Itens do Pedido ({order.items.length})
            </h4>

            <ul className="divide-y divide-slate-100">
              {order.items.map((item, idx) => {
                const thumb =
                  productThumbMap.bySku.get(String(item.sku || '').trim().toUpperCase()) ||
                  productThumbMap.byName.get(String(item.name || '').trim().toLowerCase()) ||
                  '';

                return (
                  <li key={`${item.sku}-${idx}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-5 text-slate-400" aria-hidden="true" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0F172A]">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity}x · {formatCurrencyBRL(item.unitPriceCents)}
                        {item.variation ? ` · ${item.variation}` : ''}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-bold text-[#0F172A]">
                      {formatCurrencyBRL(item.lineTotalCents)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrencyBRL(order.subtotal_cents)}</span>
              </div>
              {order.shipping_cents > 0 ? (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Entrega</span>
                  <span>{formatCurrencyBRL(order.shipping_cents)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between pt-1 text-base font-extrabold text-[#0F172A]">
                <span>Total do Pedido</span>
                <span>{formatCurrencyBRL(order.total_cents)}</span>
              </div>
            </div>
          </section>
        </div>
      </ModalContainer>

      {/* Confirmation dialog ONLY for cancellation */}
      <ModalContainer
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        role="alertdialog"
        initialFocus="cancel"
        cancelRef={cancelKeepButtonRef}
        title="Confirmar cancelamento do pedido?"
        description={`O pedido #${order.order_ref} será removido do faturamento do período.`}
        maxWidth="sm"
        mobileHeight="auto"
        preventCloseWhileSubmitting={isUpdating}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionButton
              ref={cancelKeepButtonRef}
              variant="secondary"
              size={44}
              data-modal-cancel="true"
              disabled={isUpdating}
              onClick={() => setConfirmCancelOpen(false)}
            >
              Manter Pedido
            </ActionButton>
            <ActionButton
              variant="danger"
              size={44}
              isSubmitting={isUpdating}
              loadingText="Cancelando..."
              onClick={() => void applyStatusChange('cancelado')}
              data-testid="confirm-cancel-order-btn"
            >
              Sim, Cancelar Pedido
            </ActionButton>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
          <p>
            O valor de <strong>{formatCurrencyBRL(order.total_cents)}</strong> será descontado dos
            indicadores financeiros. Se mudar de ideia, você poderá desfazer em 5 segundos ou
            reverter para <strong>Pago</strong> depois com 1 clique.
          </p>
        </div>
      </ModalContainer>
    </>
  );
}
