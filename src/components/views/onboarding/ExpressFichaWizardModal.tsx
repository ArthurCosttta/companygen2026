import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  HelpCircle,
  ImagePlus,
  Package,
  Rocket,
  Store,
  Truck,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { FICHA_MODAL_LAYOUT_ID } from '@/utils/fichaModalLayout';
import {
  formatCurrencyBRL,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import {
  ConfirmExitModal,
  ContextualHelpModal,
  SaveDraftModal,
} from './OnboardingModals';
import {
  buildDraftFromProfile,
  clearExpressFichaDraft,
  createProductPlaceholderSvgDataUri,
  formatBrazilPhoneDisplay,
  parsePriceBrlToCents,
  readExpressFichaDraft,
  SEGMENT_OPTIONS,
  validatePixKeyInput,
  writeExpressFichaDraft,
  type AcceptedPaymentMethod,
  type ExpressFichaDraft,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from './onboarding-helpers';

export interface ExpressFichaWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile | null;
  owner?: string;
  initialStep?: OnboardingWizardStep;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
  onCompleted?: (
    snap: ProfileSnapshot,
    meta: { published: boolean },
  ) => void;
}

const PAYMENT_METHOD_OPTIONS: Array<{
  id: AcceptedPaymentMethod;
  label: string;
}> = [
  { id: 'pix', label: 'Pix' },
  { id: 'credit_card', label: 'Cartão de Crédito' },
  { id: 'debit_card', label: 'Cartão de Débito' },
  { id: 'cash', label: 'Dinheiro' },
];

const PIX_DISCOUNT_PRESETS = [0, 5, 10] as const;

export function ExpressFichaWizardModal({
  open,
  onOpenChange,
  profile,
  owner,
  initialStep,
  onProfileUpdated,
  onCompleted,
}: ExpressFichaWizardModalProps) {
  const { showToast } = useToast();

  const [draft, setDraft] = React.useState<ExpressFichaDraft>(() =>
    buildDraftFromProfile(profile, initialStep ?? 1),
  );
  const [isDirty, setIsDirty] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [stepError, setStepError] = React.useState('');

  // Sub-modals (TELA 09, TELA 10, TELA 11)
  const [saveDraftModalOpen, setSaveDraftModalOpen] = React.useState(false);
  const [confirmExitModalOpen, setConfirmExitModalOpen] = React.useState(false);
  const [helpTopic, setHelpTopic] = React.useState<OnboardingHelpTopic | null>(null);

  // Track if user wants to add another product even when catalog already has >= 1
  const [addingExtraProduct, setAddingExtraProduct] = React.useState(false);

  const wasOpenRef = React.useRef(false);
  const savedProductInSessionRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      savedProductInSessionRef.current = false;
      const savedDraft = readExpressFichaDraft(owner);
      const base = buildDraftFromProfile(profile, initialStep ?? 1);
      if (savedDraft) {
        setDraft({
          ...base,
          ...savedDraft,
          currentStep: initialStep ?? savedDraft.currentStep,
        });
        setIsDirty(true);
      } else {
        setDraft(base);
        setIsDirty(false);
      }
      setStepError('');
      setAddingExtraProduct(false);
    }
    wasOpenRef.current = open;
  }, [open, profile, owner, initialStep]);

  const updateDraft = React.useCallback(
    (patch: Partial<ExpressFichaDraft>) => {
      setStepError('');
      setIsDirty(true);
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        writeExpressFichaDraft(next, owner);
        return next;
      });
    },
    [owner],
  );

  const activeProducts = React.useMemo(
    () => (profile?.catalog?.products ?? []).filter((p) => p.active !== false),
    [profile],
  );

  const phoneE164 = sanitizePhoneE164(draft.phoneInput);
  const phoneValid = isValidProductionPhone(phoneE164);
  const businessNameValid = draft.businessName.trim().length >= 2;
  const deliveryValid = draft.deliveryEnabled || draft.pickupEnabled;
  const step1Valid = businessNameValid && phoneValid && deliveryValid;

  const productPriceCents = parsePriceBrlToCents(draft.productPriceInput);
  const productNameValid = draft.productName.trim().length >= 2;
  const hasExistingProduct = activeProducts.length > 0;
  const mustFillProduct = !hasExistingProduct || addingExtraProduct;
  const step2Valid = mustFillProduct
    ? productNameValid && productPriceCents > 0
    : true;

  const pixCheck = validatePixKeyInput(draft.pixKey);

  const handleRequestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (submitting) return;
    if (isDirty) {
      setSaveDraftModalOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleSaveStep1AndNext = async () => {
    if (!businessNameValid) {
      setStepError('Informe o nome da sua loja (pelo menos 2 letras).');
      return;
    }
    if (!phoneValid) {
      setStepError(
        'Informe um número de WhatsApp válido com DDD (ex.: (11) 98765-4321).',
      );
      return;
    }
    if (!deliveryValid) {
      setStepError('Ative pelo menos uma opção: Entrega ou Retirada na loja.');
      return;
    }

    setSubmitting(true);
    setStepError('');
    try {
      const feeCents = parsePriceBrlToCents(draft.deliveryFeeInput);
      const areas = draft.deliveryAreasText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const snap = await updateBusinessProfile(
        (target) => {
          target.business.name = draft.businessName.trim();
          target.business.segment = draft.segment.trim() || 'Geral';
          target.whatsapp.phoneE164 = phoneE164;
          target.whatsapp.displayPhone = formatBrazilPhoneDisplay(phoneE164);
          target.delivery.deliveryEnabled = draft.deliveryEnabled;
          target.delivery.pickupEnabled = draft.pickupEnabled;
          target.delivery.defaultFeeCents = feeCents;
          target.delivery.areas = areas;
          target.onboarding.fichaCompleted = true;
        },
        undefined,
        owner,
      );

      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: 'Dados da loja salvos! Agora cadastre seu primeiro produto.',
        durationMs: 2500,
      });
      updateDraft({ currentStep: 2 });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar os dados da loja. Tente novamente.';
      setStepError(message);
      showToast({ type: 'error', message, durationMs: 3500 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveStep2AndNext = async () => {
    if (!mustFillProduct) {
      updateDraft({ currentStep: 3 });
      return;
    }
    if (!productNameValid) {
      setStepError('Informe o nome do produto (pelo menos 2 letras).');
      return;
    }
    if (productPriceCents <= 0) {
      setStepError('Informe um preço maior que zero (ex.: 49,90).');
      return;
    }

    setSubmitting(true);
    setStepError('');
    try {
      const trimmedName = draft.productName.trim();
      const trimmedCategory = draft.productCategory.trim() || 'Geral';
      const resolvedImageUrl =
        draft.productImageUrl.trim() ||
        createProductPlaceholderSvgDataUri(trimmedName, trimmedCategory);
      const stockNum = Number.parseInt(
        draft.productStockInput.replace(/\D/g, ''),
        10,
      );

      const snap = await updateBusinessProfile(
        (target) => {
          const nextIndex = target.catalog.products.length + 1;
          const internalCode = `PROD-${nextIndex}-${Date.now().toString(36).toUpperCase()}`;
          const newProduct: CatalogProduct = {
            id: `prod-${Date.now().toString(36)}-${nextIndex}`,
            sku: internalCode,
            name: trimmedName,
            category: trimmedCategory,
            description:
              draft.productDescription.trim() ||
              `${trimmedName} disponível com atendimento rápido pelo WhatsApp.`,
            priceCents: productPriceCents,
            variation: draft.productVariation.trim() || 'Padrão',
            stock: Number.isFinite(stockNum) ? Math.max(0, stockNum) : 10,
            active: true,
            imageUrl: resolvedImageUrl,
            approvedAsset: true,
            updatedAt: new Date().toISOString(),
          };
          target.catalog.products.push(newProduct);
        },
        undefined,
        owner,
      );

      savedProductInSessionRef.current = true;
      onProfileUpdated?.(snap);
      setAddingExtraProduct(false);
      showToast({
        type: 'success',
        message: `"${trimmedName}" adicionado ao catálogo!`,
        durationMs: 2500,
      });
      updateDraft({
        currentStep: 3,
        productName: '',
        productPriceInput: '',
        productDescription: '',
        productImageUrl: '',
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar o produto. Tente novamente.';
      setStepError(message);
      showToast({ type: 'error', message, durationMs: 3500 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteWizard = async () => {
    if (!pixCheck.valid) {
      setStepError(pixCheck.reason || 'Chave Pix inválida.');
      return;
    }
    if (!businessNameValid || !phoneValid) {
      setStepError('Revise o nome da loja e o WhatsApp no Passo 1.');
      updateDraft({ currentStep: 1 });
      return;
    }

    setSubmitting(true);
    setStepError('');
    try {
      const totalActiveAfter =
        (profile?.catalog?.products ?? []).filter((p) => p.active !== false).length;
      const canPublishNow =
        draft.publishOnComplete &&
        (totalActiveAfter >= 1 || savedProductInSessionRef.current) &&
        phoneValid;

      const snap = await updateBusinessProfile(
        (target) => {
          target.business.name = draft.businessName.trim();
          target.business.segment = draft.segment.trim() || 'Geral';
          target.whatsapp.phoneE164 = phoneE164;
          target.whatsapp.displayPhone = formatBrazilPhoneDisplay(phoneE164);
          target.payment.pixKey = draft.pixKey.trim();
          target.payment.pixDiscountPercent = draft.pixDiscountPercent;
          target.payment.acceptedMethods =
            draft.acceptedMethods.length > 0
              ? draft.acceptedMethods
              : ['pix', 'credit_card', 'debit_card', 'cash'];
          target.onboarding.fichaCompleted = true;
          target.onboarding.storeGenerated = true;

          // Garantir que todo produto ativo sem foto receba placeholder SVG aprovado antes de publicar
          target.catalog.products = target.catalog.products.map((item) => {
            if (item.active !== false && (!item.imageUrl || !item.approvedAsset)) {
              return {
                ...item,
                imageUrl:
                  item.imageUrl ||
                  createProductPlaceholderSvgDataUri(item.name, item.category),
                approvedAsset: true,
              };
            }
            return item;
          });

          if (canPublishNow) {
            target.publishedStore.published = true;
          }
        },
        canPublishNow ? { publish: true } : undefined,
        owner,
      );

      clearExpressFichaDraft(owner);
      setIsDirty(false);
      onProfileUpdated?.(snap);

      const published = Boolean(snap.profile.publishedStore.published);
      showToast({
        type: 'success',
        title: published ? 'Loja criada e publicada!' : 'Configuração concluída!',
        message: published
          ? 'Sua vitrine online já está pronta para receber pedidos.'
          : 'Dados salvos com sucesso.',
        durationMs: 3000,
      });

      onOpenChange(false);
      onCompleted?.(snap, { published });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a configuração. Tente novamente.';
      setStepError(message);
      showToast({ type: 'error', message, durationMs: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_500_000) {
      setStepError('Escolha uma imagem de até 1,5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDraft({ productImageUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const togglePaymentMethod = (method: AcceptedPaymentMethod) => {
    const exists = draft.acceptedMethods.includes(method);
    const next = exists
      ? draft.acceptedMethods.filter((m) => m !== method)
      : [...draft.acceptedMethods, method];
    if (next.length === 0) return;
    updateDraft({ acceptedMethods: next });
  };

  const activeHelpTopic: OnboardingHelpTopic =
    draft.currentStep === 1
      ? 'ficha'
      : draft.currentStep === 2
        ? 'product'
        : 'pix';

  const stepMeta = [
    { step: 1 as const, label: '1. Loja e Entrega', icon: Store },
    { step: 2 as const, label: '2. Produto', icon: Package },
    { step: 3 as const, label: '3. Pix', icon: CreditCard },
  ];

  const previewSvg = React.useMemo(
    () =>
      draft.productImageUrl.trim() ||
      createProductPlaceholderSvgDataUri(
        draft.productName || 'Seu Produto',
        draft.productCategory || 'Geral',
      ),
    [draft.productImageUrl, draft.productName, draft.productCategory],
  );

  return (
    <>
      <ModalContainer
        open={open}
        onOpenChange={handleRequestClose}
        role="dialog"
        maxWidth="lg"
        mobileHeight="95%"
        layoutId={open ? FICHA_MODAL_LAYOUT_ID : undefined}
        preventCloseWhileSubmitting={submitting}
        title={
          <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
            <span>Configuração Express da Loja</span>
            <button
              type="button"
              onClick={() => setHelpTopic(activeHelpTopic)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <HelpCircle className="size-4" aria-hidden="true" />
              <span>Ajuda</span>
            </button>
          </div>
        }
        description={`Passo ${draft.currentStep} de 3 · Tudo é salvo com segurança conforme você avança.`}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {draft.currentStep > 1 ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  disabled={submitting}
                  leftIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
                  onClick={() =>
                    updateDraft({
                      currentStep: (draft.currentStep - 1) as OnboardingWizardStep,
                    })
                  }
                >
                  Voltar
                </ActionButton>
              ) : null}

              <ActionButton
                variant="secondary"
                size={44}
                disabled={submitting}
                onClick={() => setSaveDraftModalOpen(true)}
              >
                Salvar e sair
              </ActionButton>
            </div>

            {draft.currentStep === 1 ? (
              <ActionButton
                variant="primaryGradient"
                size={48}
                disabled={!step1Valid}
                isLoading={submitting}
                loadingText="Salvando loja..."
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={handleSaveStep1AndNext}
                className="w-full sm:w-auto"
              >
                Salvar e Ir para Produto
              </ActionButton>
            ) : draft.currentStep === 2 ? (
              <ActionButton
                variant="success"
                size={48}
                disabled={!step2Valid}
                isLoading={submitting}
                loadingText="Salvando produto..."
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={handleSaveStep2AndNext}
                className="w-full sm:w-auto"
              >
                {mustFillProduct
                  ? 'Salvar Produto e Continuar'
                  : 'Continuar para Pagamento'}
              </ActionButton>
            ) : (
              <ActionButton
                variant="success"
                size={50}
                disabled={!pixCheck.valid}
                isLoading={submitting}
                loadingText="Finalizando loja..."
                leftIcon={<Rocket className="size-4" aria-hidden="true" />}
                onClick={handleCompleteWizard}
                className="w-full sm:w-auto"
              >
                Concluir e Criar Minha Loja
              </ActionButton>
            )}
          </div>
        }
      >
        <div role="form" aria-label="Assistente rápido de configuração da loja" className="space-y-5">
          {/* Stepper Pills */}
          <div className="grid grid-cols-3 gap-2">
            {stepMeta.map((item) => {
              const Icon = item.icon;
              const isCurrent = draft.currentStep === item.step;
              const isDone =
                (item.step === 1 && step1Valid && draft.currentStep > 1) ||
                (item.step === 2 && hasExistingProduct && draft.currentStep > 2);

              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={submitting || (item.step > 1 && !step1Valid)}
                  onClick={() => updateDraft({ currentStep: item.step })}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50',
                    isCurrent
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50 text-[#16A34A]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {isDone ? (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {stepError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {stepError}
            </div>
          ) : null}

          {/* ================================================================
           * TELA 06: Passo 1 — Nome, WhatsApp e Entrega
           * ============================================================== */}
          {draft.currentStep === 1 ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="wizard-business-name"
                  className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                >
                  Nome da Sua Loja *
                </label>
                <input
                  id="wizard-business-name"
                  type="text"
                  autoFocus
                  value={draft.businessName}
                  onChange={(e) => updateDraft({ businessName: e.target.value })}
                  placeholder="Ex.: Ateliê Bela Vista"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="wizard-whatsapp-phone"
                    className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                  >
                    WhatsApp de Pedidos (com DDD) *
                  </label>
                  <input
                    id="wizard-whatsapp-phone"
                    type="tel"
                    inputMode="tel"
                    value={draft.phoneInput}
                    onChange={(e) =>
                      updateDraft({
                        phoneInput: formatBrazilPhoneDisplay(e.target.value),
                      })
                    }
                    placeholder="(11) 98765-4321"
                    className={cn(
                      'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                      draft.phoneInput.trim().length > 0 && !phoneValid
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                        : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                    )}
                  />
                  {draft.phoneInput.trim().length > 0 && !phoneValid ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      Informe DDD + celular válido (10 ou 11 dígitos).
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      É neste número que você receberá os pedidos dos clientes.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="wizard-segment"
                    className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                  >
                    Ramo de Atuação
                  </label>
                  <select
                    id="wizard-segment"
                    value={draft.segment}
                    onChange={(e) => updateDraft({ segment: e.target.value })}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {SEGMENT_OPTIONS.map((seg) => (
                      <option key={seg} value={seg}>
                        {seg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <Truck className="size-4 text-[#2563EB]" aria-hidden="true" />
                  <span>Como você entrega os pedidos?</span>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={draft.deliveryEnabled}
                      onChange={(e) =>
                        updateDraft({ deliveryEnabled: e.target.checked })
                      }
                      className="size-4 accent-[#2563EB]"
                    />
                    <span className="text-sm font-medium text-[#0F172A]">
                      Faço entregas / envio
                    </span>
                  </label>

                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={draft.pickupEnabled}
                      onChange={(e) =>
                        updateDraft({ pickupEnabled: e.target.checked })
                      }
                      className="size-4 accent-[#2563EB]"
                    />
                    <span className="text-sm font-medium text-[#0F172A]">
                      Retirada no local
                    </span>
                  </label>
                </div>

                {draft.deliveryEnabled ? (
                  <div className="grid gap-3 pt-1 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="wizard-delivery-fee"
                        className="mb-1 block text-xs font-semibold text-slate-700"
                      >
                        Taxa padrão de entrega (R$)
                      </label>
                      <input
                        id="wizard-delivery-fee"
                        type="text"
                        inputMode="decimal"
                        value={draft.deliveryFeeInput}
                        onChange={(e) =>
                          updateDraft({ deliveryFeeInput: e.target.value })
                        }
                        placeholder="0,00"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="wizard-delivery-areas"
                        className="mb-1 block text-xs font-semibold text-slate-700"
                      >
                        Regiões atendidas (opcional)
                      </label>
                      <input
                        id="wizard-delivery-areas"
                        type="text"
                        value={draft.deliveryAreasText}
                        onChange={(e) =>
                          updateDraft({ deliveryAreasText: e.target.value })
                        }
                        placeholder="Ex.: Centro, Zona Sul, Todo Brasil"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ================================================================
           * TELA 07: Passo 2 — Produto Express
           * ============================================================== */}
          {draft.currentStep === 2 ? (
            <div className="space-y-4">
              {hasExistingProduct && !addingExtraProduct ? (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">
                        Você já tem {activeProducts.length}{' '}
                        {activeProducts.length === 1
                          ? 'produto cadastrado'
                          : 'produtos cadastrados'}
                      </p>
                      <p className="text-xs text-slate-600">
                        {activeProducts
                          .slice(0, 3)
                          .map((p) => `${p.name} (${formatCurrencyBRL(p.priceCents)})`)
                          .join(' · ')}
                      </p>
                    </div>
                    <ActionButton
                      variant="secondary"
                      size={44}
                      onClick={() => setAddingExtraProduct(true)}
                    >
                      + Adicionar outro
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <>
                  {hasExistingProduct ? (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
                      <span>Adicionando novo produto ao seu catálogo</span>
                      <button
                        type="button"
                        onClick={() => setAddingExtraProduct(false)}
                        className="min-h-[44px] px-2 font-semibold text-[#2563EB] underline underline-offset-4"
                      >
                        Usar produto já salvo
                      </button>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="wizard-product-name"
                        className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                      >
                        Nome do Produto *
                      </label>
                      <input
                        id="wizard-product-name"
                        type="text"
                        autoFocus
                        value={draft.productName}
                        onChange={(e) =>
                          updateDraft({ productName: e.target.value })
                        }
                        placeholder="Ex.: Camiseta Algodão Premium"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="wizard-product-price"
                        className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                      >
                        Preço de Venda (R$) *
                      </label>
                      <input
                        id="wizard-product-price"
                        type="text"
                        inputMode="decimal"
                        value={draft.productPriceInput}
                        onChange={(e) =>
                          updateDraft({ productPriceInput: e.target.value })
                        }
                        placeholder="Ex.: 79,90"
                        className={cn(
                          'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                          draft.productPriceInput.trim().length > 0 &&
                            productPriceCents <= 0
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                            : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                        )}
                      />
                      {productPriceCents > 0 ? (
                        <p className="mt-1 text-xs font-medium text-[#16A34A]">
                          Valor salvo: {formatCurrencyBRL(productPriceCents)}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">
                          Digite com vírgula ou ponto (ex.: 29,90).
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="wizard-product-category"
                        className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                      >
                        Categoria
                      </label>
                      <input
                        id="wizard-product-category"
                        type="text"
                        value={draft.productCategory}
                        onChange={(e) =>
                          updateDraft({ productCategory: e.target.value })
                        }
                        placeholder="Ex.: Roupas, Doces, Geral"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="wizard-product-variation"
                        className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                      >
                        Tamanho ou Opção (opcional)
                      </label>
                      <input
                        id="wizard-product-variation"
                        type="text"
                        value={draft.productVariation}
                        onChange={(e) =>
                          updateDraft({ productVariation: e.target.value })
                        }
                        placeholder="Ex.: Único, M, 500g"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="wizard-product-stock"
                        className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                      >
                        Quantidade disponível
                      </label>
                      <input
                        id="wizard-product-stock"
                        type="text"
                        inputMode="numeric"
                        value={draft.productStockInput}
                        onChange={(e) =>
                          updateDraft({
                            productStockInput: e.target.value.replace(/\D/g, ''),
                          })
                        }
                        placeholder="10"
                        className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>
                  </div>

                  {/* Optional photo with automatic approved SVG fallback */}
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
                    <img
                      src={previewSvg}
                      alt={
                        draft.productName.trim()
                          ? `Prévia de ${draft.productName.trim()}`
                          : 'Prévia do produto'
                      }
                      className="size-20 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-semibold text-[#0F172A]">
                        Foto do produto (opcional)
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {draft.productImageUrl
                          ? 'Foto personalizada selecionada e aprovada para publicação.'
                          : 'Se não tiver foto agora, usamos esta imagem pronta para você publicar a vitrine imediatamente.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-slate-100">
                          <ImagePlus className="size-4 text-[#2563EB]" aria-hidden="true" />
                          <span>Enviar foto do dispositivo</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageFileSelect}
                            className="sr-only"
                          />
                        </label>
                        {draft.productImageUrl ? (
                          <button
                            type="button"
                            onClick={() => updateDraft({ productImageUrl: '' })}
                            className="min-h-[44px] px-2 text-xs font-semibold text-slate-600 underline underline-offset-4"
                          >
                            Usar imagem padrão
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* ================================================================
           * TELA 08: Passo 3 — Pagamento Pix
           * ============================================================== */}
          {draft.currentStep === 3 ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="wizard-pix-key"
                    className="text-sm font-semibold text-[#0F172A]"
                  >
                    Chave Pix da Loja (opcional)
                  </label>
                  {phoneValid ? (
                    <button
                      type="button"
                      onClick={() => updateDraft({ pixKey: phoneE164.replace(/^55/, '') })}
                      className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
                    >
                      Usar meu WhatsApp como Pix
                    </button>
                  ) : null}
                </div>
                <input
                  id="wizard-pix-key"
                  type="text"
                  autoFocus
                  value={draft.pixKey}
                  onChange={(e) => updateDraft({ pixKey: e.target.value })}
                  placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                  className={cn(
                    'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                    !pixCheck.valid
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                  )}
                />
                {!pixCheck.valid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    {pixCheck.reason}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Quando informada, a chave Pix é sugerida aos clientes no momento do pagamento.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-semibold text-[#0F172A]">
                  Desconto para pagamento no Pix
                </span>
                <div className="flex flex-wrap gap-2">
                  {PIX_DISCOUNT_PRESETS.map((pct) => {
                    const selected = draft.pixDiscountPercent === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => updateDraft({ pixDiscountPercent: pct })}
                        className={cn(
                          'min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors',
                          selected
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {pct === 0 ? 'Sem desconto (0%)' : `${pct}% de desconto`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-semibold text-[#0F172A]">
                  Formas de pagamento aceitas
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((opt) => {
                    const active = draft.acceptedMethods.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => togglePaymentMethod(opt.id)}
                        className={cn(
                          'flex min-h-[44px] items-center justify-between rounded-xl border px-3.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <span>{opt.label}</span>
                        {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <input
                  type="checkbox"
                  checked={draft.publishOnComplete}
                  onChange={(e) =>
                    updateDraft({ publishOnComplete: e.target.checked })
                  }
                  className="size-4 accent-[#16A34A]"
                />
                <span className="text-sm font-semibold text-[#0F172A]">
                  Publicar minha vitrine online imediatamente ao concluir
                </span>
              </label>
            </div>
          ) : null}
        </div>
      </ModalContainer>

      {/* TELA 09: Salvar e sair / Rascunho */}
      <SaveDraftModal
        open={saveDraftModalOpen}
        onOpenChange={setSaveDraftModalOpen}
        draftSummary={draft}
        onSaveDraftAndExit={() => {
          writeExpressFichaDraft(draft, owner);
          setSaveDraftModalOpen(false);
          onOpenChange(false);
        }}
        onContinueEditing={() => setSaveDraftModalOpen(false)}
        onRequestDiscard={() => {
          setSaveDraftModalOpen(false);
          setConfirmExitModalOpen(true);
        }}
      />

      {/* TELA 10: Confirmar saída (alertdialog com foco seguro em Cancelar) */}
      <ConfirmExitModal
        open={confirmExitModalOpen}
        onOpenChange={setConfirmExitModalOpen}
        onCancelExit={() => setConfirmExitModalOpen(false)}
        onConfirmExit={() => {
          clearExpressFichaDraft(owner);
          setIsDirty(false);
          setConfirmExitModalOpen(false);
          onOpenChange(false);
        }}
      />

      {/* TELA 11: Ajuda contextual */}
      <ContextualHelpModal
        open={helpTopic !== null}
        onOpenChange={(next) => {
          if (!next) setHelpTopic(null);
        }}
        topic={helpTopic ?? activeHelpTopic}
      />
    </>
  );
}
