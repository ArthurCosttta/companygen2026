import * as React from 'react';
import { ChevronDown, ChevronUp, Truck } from 'lucide-react';
import { formatCurrencyBRL, type BusinessProfile } from '@/schemas/profile.schema';
import { updateBusinessProfile, type ProfileSnapshot } from '@/services/profile-service';
import { ActionButton, useToast } from '@/components/ui';
import { formatCentsForInput, parseBRLInputToCents } from './storefront-utils';

export interface ShippingQuickCardProps {
  profile: BusinessProfile;
  owner?: string;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
}

export function ShippingQuickCard({
  profile,
  owner,
  onProfileUpdated,
}: ShippingQuickCardProps) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const currentFixedFeeCents = Math.max(
    0,
    Number(profile.shipping?.fixedFeeCents ?? profile.delivery?.defaultFeeCents ?? 0),
  );
  const currentFreeThresholdCents = Math.max(
    0,
    Number(profile.shipping?.freeShippingThresholdCents ?? 0),
  );
  const currentPickupAvailable =
    profile.shipping?.pickupAvailable !== undefined
      ? Boolean(profile.shipping.pickupAvailable)
      : profile.delivery?.pickupEnabled !== false;

  const [fixedFeeText, setFixedFeeText] = React.useState(() =>
    formatCentsForInput(currentFixedFeeCents),
  );
  const [freeThresholdText, setFreeThresholdText] = React.useState(() =>
    currentFreeThresholdCents > 0 ? formatCentsForInput(currentFreeThresholdCents) : '',
  );
  const [pickupAvailable, setPickupAvailable] = React.useState(currentPickupAvailable);

  React.useEffect(() => {
    setFixedFeeText(formatCentsForInput(currentFixedFeeCents));
    setFreeThresholdText(
      currentFreeThresholdCents > 0 ? formatCentsForInput(currentFreeThresholdCents) : '',
    );
    setPickupAvailable(currentPickupAvailable);
  }, [currentFixedFeeCents, currentFreeThresholdCents, currentPickupAvailable]);

  const summaryParts = [
    currentFixedFeeCents > 0
      ? `Entrega fixa ${formatCurrencyBRL(currentFixedFeeCents)}`
      : 'Entrega grátis',
    currentFreeThresholdCents > 0
      ? `Grátis acima de ${formatCurrencyBRL(currentFreeThresholdCents)}`
      : 'Sem frete grátis por valor',
    currentPickupAvailable ? 'Retirada OK' : 'Sem retirada',
  ];

  async function handleSaveShipping(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const nextFixedFeeCents = Math.max(0, parseBRLInputToCents(fixedFeeText));
    const nextFreeThresholdCents = freeThresholdText.trim()
      ? Math.max(0, parseBRLInputToCents(freeThresholdText))
      : 0;

    setSaving(true);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.shipping = {
            fixedFeeCents: nextFixedFeeCents,
            freeShippingThresholdCents: nextFreeThresholdCents,
            pickupAvailable,
          };
          draft.delivery = {
            pickupEnabled: pickupAvailable,
            deliveryEnabled: draft.delivery?.deliveryEnabled !== false,
            areas: Array.isArray(draft.delivery?.areas) ? draft.delivery.areas : [],
            defaultFeeCents: nextFixedFeeCents,
            pickupHours: draft.delivery?.pickupHours || 'Seg a Sáb · 09h às 18h',
          };
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      setExpanded(false);
      showToast({
        type: 'success',
        message: 'Regras de entrega e frete atualizadas na Vitrine e Sofia!',
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível salvar as regras de frete agora.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="shipping-quick-card"
      aria-label="Configuração Rápida de Entrega e Frete"
      className="rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] transition-all duration-200 ease-[var(--cg-ease)]"
    >
      <div className="flex min-h-[56px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--cg-hover)] text-[var(--cg-primary)]">
            <Truck className="size-4" aria-hidden="true" />
          </span>
          <p
            data-testid="shipping-quick-summary"
            className="cg-tabular truncate text-xs font-medium text-[var(--cg-text-secondary)] sm:text-sm"
          >
            {summaryParts.join(' · ')}
          </p>
        </div>

        <button
          type="button"
          data-testid="shipping-quick-card-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-xs font-semibold text-[var(--cg-text)] transition-colors hover:bg-[var(--cg-hover)]"
        >
          <span>{expanded ? 'Fechar Frete' : 'Editar Frete'}</span>
          {expanded ? (
            <ChevronUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {expanded ? (
        <form
          onSubmit={(e) => void handleSaveShipping(e)}
          data-testid="shipping-quick-card-form"
          className="border-t border-[var(--cg-border)] px-4 py-4 sm:px-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="shipping-fixed-fee-input"
                className="block text-xs font-semibold text-[var(--cg-text)]"
              >
                Taxa fixa de entrega (R$)
              </label>
              <input
                id="shipping-fixed-fee-input"
                data-testid="shipping-fixed-fee-input"
                type="text"
                inputMode="decimal"
                value={fixedFeeText}
                onChange={(e) => setFixedFeeText(e.target.value)}
                placeholder="15,00"
                className="cg-tabular h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm font-semibold text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="shipping-free-threshold-input"
                className="block text-xs font-semibold text-[var(--cg-text)]"
              >
                Frete grátis acima de (R$)
              </label>
              <input
                id="shipping-free-threshold-input"
                data-testid="shipping-free-threshold-input"
                type="text"
                inputMode="decimal"
                value={freeThresholdText}
                onChange={(e) => setFreeThresholdText(e.target.value)}
                placeholder="150,00 (ou vazio)"
                className="cg-tabular h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm font-semibold text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={pickupAvailable}
                  aria-label="Permitir retirada na loja"
                  data-testid="shipping-pickup-switch"
                  onClick={() => setPickupAvailable((v) => !v)}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors ${
                    pickupAvailable ? 'bg-[#24A677]' : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block size-6 rounded-full bg-white shadow-xs transition-transform ${
                      pickupAvailable ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-semibold text-[var(--cg-text)]">
                  Retirada no local
                </span>
              </div>

              <ActionButton
                type="submit"
                variant="primary"
                size={44}
                isLoading={saving}
                loadingText="Salvando..."
                data-testid="shipping-save-btn"
              >
                Salvar Frete
              </ActionButton>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}
