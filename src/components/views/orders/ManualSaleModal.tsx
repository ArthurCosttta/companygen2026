import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Minus, Plus, ShoppingBag, Tag } from 'lucide-react';
import {
  formatCurrencyBRL,
  type BusinessOrder,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { createManualOrder } from '@/services/profile-service';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { formatCentsForInput, parseBRLInputToCents } from './order-utils';

export interface ManualSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: BusinessProfile;
  products?: CatalogProduct[];
  owner?: string;
  onCreated?: (order: BusinessOrder) => void;
}

const PAYMENT_OPTIONS = ['Pix', 'Cartão', 'Dinheiro'] as const;
const CUSTOM_OPTION_VALUE = '__avulso__';

export function ManualSaleModal({
  open,
  onOpenChange,
  profile,
  products,
  owner,
  onCreated,
}: ManualSaleModalProps) {
  const { showToast } = useToast();

  const catalogProducts = useMemo(
    () => (products ?? profile?.catalog?.products ?? []).filter(p => p.active !== false),
    [products, profile],
  );

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>(CUSTOM_OPTION_VALUE);
  const [customItemName, setCustomItemName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [priceInput, setPriceInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_OPTIONS)[number]>('Pix');
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [touchedValue, setTouchedValue] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProduct = useMemo(
    () => catalogProducts.find(p => p.id === selectedProductId) ?? null,
    [catalogProducts, selectedProductId],
  );

  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    setTouchedValue(false);
    if (catalogProducts.length > 0 && selectedProductId === CUSTOM_OPTION_VALUE && !priceInput) {
      const first = catalogProducts[0];
      setSelectedProductId(first.id);
      setQuantity(1);
      setPriceInput(formatCentsForInput(first.priceCents));
    }
  }, [open, catalogProducts]);

  const totalCents = useMemo(() => parseBRLInputToCents(priceInput), [priceInput]);
  const catalogExpectedCents = selectedProduct ? selectedProduct.priceCents * quantity : 0;
  const discountAppliedCents =
    selectedProduct && totalCents > 0 && totalCents < catalogExpectedCents
      ? catalogExpectedCents - totalCents
      : 0;

  const isInvalidAmount = totalCents <= 0;
  const canSubmit = customerName.trim().length > 0 && !isInvalidAmount && !isSubmitting;

  function handleSelectProduct(nextId: string) {
    setSelectedProductId(nextId);
    setSubmitError('');
    if (nextId === CUSTOM_OPTION_VALUE) {
      setQuantity(1);
      return;
    }
    const found = catalogProducts.find(p => p.id === nextId);
    if (found) {
      setQuantity(1);
      setPriceInput(formatCentsForInput(found.priceCents));
      setTouchedValue(false);
    }
  }

  function handleQuantityChange(delta: number) {
    const nextQty = Math.max(1, Math.min(999, quantity + delta));
    setQuantity(nextQty);
    if (selectedProduct) {
      setPriceInput(formatCentsForInput(selectedProduct.priceCents * nextQty));
    }
  }

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomItemName('');
    setQuantity(1);
    if (catalogProducts.length > 0) {
      setSelectedProductId(catalogProducts[0].id);
      setPriceInput(formatCentsForInput(catalogProducts[0].priceCents));
    } else {
      setSelectedProductId(CUSTOM_OPTION_VALUE);
      setPriceInput('');
    }
    setPaymentMethod('Pix');
    setMarkAsPaid(true);
    setTouchedValue(false);
    setSubmitError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouchedValue(true);
    setSubmitError('');

    if (isSubmitting) return;
    if (!customerName.trim()) {
      setSubmitError('Informe o nome do cliente para registrar a venda.');
      return;
    }
    if (totalCents <= 0) {
      setSubmitError('O valor da venda precisa ser maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createManualOrder(
        {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          productId: selectedProduct?.id,
          sku: selectedProduct?.sku,
          customItemName: selectedProduct ? undefined : customItemName.trim() || 'Venda avulsa',
          items: selectedProduct
            ? [
                {
                  productId: selectedProduct.id,
                  sku: selectedProduct.sku,
                  name: selectedProduct.name,
                  quantity,
                  overrideTotalCents: totalCents,
                },
              ]
            : undefined,
          totalCents,
          paymentMethod,
          status: markAsPaid ? 'confirmado' : 'aguardando_pagamento',
          markAsPaid,
        },
        owner,
      );

      showToast({
        type: 'success',
        message: `Venda de ${formatCurrencyBRL(created.total_cents)} registrada no faturamento!`,
        durationMs: 3000,
      });

      onCreated?.(created);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível registrar a venda. Tente novamente.';
      setSubmitError(message);
      showToast({
        type: 'error',
        message: 'Não foi possível registrar a venda. Tente novamente.',
        durationMs: 3500,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalContainer
      open={open}
      onOpenChange={next => {
        if (!isSubmitting) onOpenChange(next);
      }}
      title="Registrar Venda do Balcão"
      description="Lance uma venda presencial, pelo WhatsApp ou Instagram direto no seu faturamento."
      role="dialog"
      maxWidth="lg"
      mobileHeight="85%"
      preventCloseWhileSubmitting={isSubmitting}
      footer={
        <div className="flex flex-col gap-2">
          <ActionButton
            type="submit"
            form="manual-sale-form"
            variant="success"
            size={48}
            fullWidth
            isSubmitting={isSubmitting}
            loadingText="Salvando venda..."
            disabled={!canSubmit}
            rightIcon={<Check className="size-[18px]" />}
            data-testid="manual-sale-submit"
          >
            Salvar Venda e Atualizar Faturamento
          </ActionButton>
        </div>
      }
    >
      <form id="manual-sale-form" onSubmit={handleSubmit} className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
          >
            {submitError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="manual-sale-customer-name"
              className="block text-sm font-semibold text-[#0F172A]"
            >
              Nome do Cliente <span className="text-[#EF4444]">*</span>
            </label>
            <input
              id="manual-sale-customer-name"
              type="text"
              required
              autoComplete="name"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Ex.: Maria Oliveira"
              disabled={isSubmitting}
              className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="manual-sale-customer-phone"
              className="block text-sm font-semibold text-[#0F172A]"
            >
              WhatsApp <span className="text-xs font-normal text-slate-500">(Opcional)</span>
            </label>
            <input
              id="manual-sale-customer-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              disabled={isSubmitting}
              className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="manual-sale-product"
            className="block text-sm font-semibold text-[#0F172A]"
          >
            Produto Vendido
          </label>
          <div className="relative">
            <ShoppingBag
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <select
              id="manual-sale-product"
              value={selectedProductId}
              onChange={e => handleSelectProduct(e.target.value)}
              disabled={isSubmitting}
              className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            >
              {catalogProducts.map(prod => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} — {formatCurrencyBRL(prod.priceCents)}
                </option>
              ))}
              <option value={CUSTOM_OPTION_VALUE}>Outro / Venda avulsa (valor livre)</option>
            </select>
          </div>
        </div>

        {selectedProduct ? (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <span className="text-sm font-medium text-slate-700">Quantidade</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => handleQuantityChange(-1)}
                disabled={isSubmitting || quantity <= 1}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F172A] transition active:scale-[0.98] disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-[2rem] text-center text-sm font-bold text-[#0F172A]">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => handleQuantityChange(1)}
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F172A] transition active:scale-[0.98] disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label
              htmlFor="manual-sale-custom-item"
              className="block text-sm font-semibold text-[#0F172A]"
            >
              Descrição do Item <span className="text-xs font-normal text-slate-500">(Opcional)</span>
            </label>
            <input
              id="manual-sale-custom-item"
              type="text"
              value={customItemName}
              onChange={e => setCustomItemName(e.target.value)}
              placeholder="Ex.: Kit Presente Personalizado"
              disabled={isSubmitting}
              className="min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="manual-sale-amount"
              className="text-sm font-bold text-[#0F172A]"
            >
              Valor Cobrado (R$) <span className="text-[#EF4444]">*</span>
            </label>
            {discountAppliedCents > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <Tag className="size-3" /> Desconto de {formatCurrencyBRL(discountAppliedCents)}
              </span>
            ) : null}
          </div>

          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base font-bold text-slate-500"
              aria-hidden="true"
            >
              R$
            </span>
            <input
              id="manual-sale-amount"
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={e => {
                setPriceInput(e.target.value);
                setTouchedValue(true);
              }}
              onBlur={() => setTouchedValue(true)}
              placeholder="0,00"
              disabled={isSubmitting}
              aria-invalid={touchedValue && isInvalidAmount}
              className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white pr-4 pl-12 text-xl font-bold text-[#0F172A] placeholder:text-slate-300 focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/20"
            />
          </div>

          {touchedValue && isInvalidAmount ? (
            <p role="alert" className="text-xs font-semibold text-[#EF4444]">
              O valor da venda precisa ser maior que zero
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Você pode editar o valor livremente para aplicar desconto presencial.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-[#0F172A]">
            Forma de Pagamento
          </span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
            {PAYMENT_OPTIONS.map(option => {
              const selected = paymentMethod === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isSubmitting}
                  onClick={() => setPaymentMethod(option)}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-all duration-[120ms] active:scale-[0.98] ${
                    selected
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
          <input
            type="checkbox"
            checked={markAsPaid}
            onChange={e => setMarkAsPaid(e.target.checked)}
            disabled={isSubmitting}
            className="size-4 rounded border-slate-300 text-[#16A34A] focus:ring-[#16A34A]"
          />
          <span className="text-sm font-medium text-[#0F172A]">
            Pagamento já recebido agora (registrar como <strong>Pago</strong>)
          </span>
        </label>
      </form>
    </ModalContainer>
  );
}
