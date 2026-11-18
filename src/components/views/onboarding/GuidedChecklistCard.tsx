import * as React from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Circle,
  CreditCard,
  Eye,
  HelpCircle,
  Package,
  QrCode,
  Rocket,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer, SkeletonBlock, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { FICHA_MODAL_LAYOUT_ID } from '@/utils/fichaModalLayout';
import type { MaturityState } from '@/hooks/useClientMaturity';
import {
  connectionPhaseColorHex,
  humanLabelPT,
  useConnectionPhase,
  type ConnectionPhase,
} from '@/hooks/useConnectionPhase';
import {
  isValidProductionPhone,
  type BusinessProfile,
} from '@/schemas/profile.schema';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import {
  formatBrazilPhoneDisplay,
  readExpressFichaDraft,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from './onboarding-helpers';

export interface GuidedChecklistCardProps {
  profile: BusinessProfile | null;
  maturityState: MaturityState;
  connectionPhase?: ConnectionPhase;
  isLoading?: boolean;
  owner?: string;
  hasDraft?: boolean;
  isWizardOpen?: boolean;
  onOpenExpressWizard: (initialStep?: OnboardingWizardStep) => void;
  onOpenProductStep?: () => void;
  onOpenPixStep?: () => void;
  onPublishStore?: () => Promise<void> | void;
  onStorePublished?: (snap: ProfileSnapshot) => void;
  onConnectWhatsapp?: () => void;
  onOpenStorefront?: () => void;
  onOpenHelp?: (topic?: OnboardingHelpTopic) => void;
  className?: string;
}

export function GuidedChecklistCard({
  profile,
  maturityState,
  connectionPhase: phaseOverride,
  isLoading = false,
  owner,
  hasDraft: hasDraftProp,
  isWizardOpen = false,
  onOpenExpressWizard,
  onOpenProductStep,
  onOpenPixStep,
  onPublishStore,
  onStorePublished,
  onConnectWhatsapp,
  onOpenStorefront,
  onOpenHelp,
  className,
}: GuidedChecklistCardProps) {
  const { showToast } = useToast();
  const derivedPhase = useConnectionPhase(profile);
  const phase = phaseOverride ?? derivedPhase;
  const [publishing, setPublishing] = React.useState(false);
  const [compileModalOpen, setCompileModalOpen] = React.useState(false);
  const [compileProgress, setCompileProgress] = React.useState(100);

  const detectedDraft = React.useMemo(() => {
    if (typeof hasDraftProp === 'boolean') return hasDraftProp;
    return Boolean(readExpressFichaDraft(owner));
  }, [hasDraftProp, owner]);

  if (isLoading || !profile) {
    return (
      <section
        aria-busy="true"
        aria-label="Carregando checklist da loja"
        className={cn(
          'mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm',
          className,
        )}
      >
        <div className="space-y-4">
          <SkeletonBlock className="h-6 w-56" />
          <SkeletonBlock className="h-3 w-full" rounded="full" />
          <div className="space-y-3 pt-2">
            <SkeletonBlock className="h-20 w-full" rounded="xl" />
            <SkeletonBlock className="h-20 w-full" rounded="xl" />
            <SkeletonBlock className="h-20 w-full" rounded="xl" />
          </div>
        </div>
      </section>
    );
  }

  const businessName = (profile.business?.name ?? '').trim();
  const phoneE164 = profile.whatsapp?.phoneE164 || '';
  const hasValidPhone = isValidProductionPhone(phoneE164);
  const step1Done =
    Boolean(profile.onboarding?.fichaCompleted) &&
    businessName.length >= 2 &&
    hasValidPhone;

  const activeProducts = (profile.catalog?.products ?? []).filter(
    (p) => p.active !== false,
  );
  const activeProductsCount = activeProducts.length;
  const step2Done = activeProductsCount >= 1;

  const isStorePublished = Boolean(profile.publishedStore?.published);
  const step3Done = isStorePublished || phase === 'LIVE_READY';
  const canPublish = step1Done && step2Done && hasValidPhone;

  const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;
  const progressPercent = Math.round((completedCount / 3) * 100);
  const phaseLabel = humanLabelPT(phase);
  const phaseColor = connectionPhaseColorHex(phase);

  const handlePublishClick = async () => {
    if (publishing || !canPublish) return;
    setPublishing(true);
    try {
      if (onPublishStore) {
        await onPublishStore();
      } else {
        const snap = await updateBusinessProfile(
          (draft) => {
            draft.onboarding.fichaCompleted = true;
            draft.onboarding.storeGenerated = true;
            draft.publishedStore.published = true;
          },
          { publish: true },
          owner,
        );
        showToast({
          type: 'success',
          title: 'Loja publicada com sucesso!',
          message: 'Sua vitrine online já está no ar e pronta para receber pedidos.',
          durationMs: 3000,
        });
        onStorePublished?.(snap);
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Não foi possível publicar agora',
        message:
          err instanceof Error
            ? err.message
            : 'Verifique os dados da loja e tente novamente.',
        durationMs: 4000,
      });
    } finally {
      setPublishing(false);
    }
  };

  const stageBanner = (() => {
    if (maturityState === 'ESTADO_4' || step3Done) {
      return {
        eyebrow: 'Tudo pronto · Loja ativa',
        title: `${businessName || 'Sua loja'} está no ar!`,
        subtitle:
          'Você já pode divulgar o link da sua vitrine e acompanhar os pedidos em tempo real.',
      };
    }
    if (maturityState === 'ESTADO_3' || (step1Done && step2Done)) {
      return {
        eyebrow: 'Etapa 3 de 3 · Publicação da vitrine',
        title: 'Falta só publicar sua loja para começar a vender',
        subtitle:
          'Seu catálogo já tem produto e WhatsApp válido. Publique agora para liberar o link direto ou conecte seu WhatsApp quando quiser.',
      };
    }
    if (maturityState === 'ESTADO_2' || step1Done) {
      return {
        eyebrow: 'Etapa 2 de 3 · Primeiro produto',
        title: 'Cadastre seu primeiro produto',
        subtitle:
          'Você só precisa de 1 produto com nome e preço para destravar sua vitrine online.',
      };
    }
    return {
      eyebrow: 'Etapa 1 de 3 · Dados iniciais',
      title: 'Configure o nome, WhatsApp e entrega da sua loja',
      subtitle:
        'Esses dados identificam sua vitrine e garantem que os pedidos cheguem no WhatsApp certo.',
    };
  })();

  const formattedPhone = formatBrazilPhoneDisplay(phoneE164);

  return (
    <section
      role="region"
      aria-label="Checklist de configuração da loja"
      className={cn(
        'mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7',
        className,
      )}
    >
      {/* Header & Progress */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1D4ED8]">
              {stageBanner.eyebrow}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-[#0F172A]"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: phaseColor }}
                aria-hidden="true"
              />
              <span>{phaseLabel}</span>
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
            {stageBanner.title}
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            {stageBanner.subtitle}
          </p>
        </div>

        {onOpenHelp ? (
          <button
            type="button"
            onClick={() =>
              onOpenHelp(
                !step1Done
                  ? 'ficha'
                  : !step2Done
                    ? 'product'
                    : 'publish',
              )
            }
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <HelpCircle className="size-4 text-[#2563EB]" aria-hidden="true" />
            <span>Ajuda</span>
          </button>
        ) : null}
      </div>

      {/* Progress Bar */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Progresso da ativação</span>
          <span className="text-[#0F172A]">{completedCount} de 3 concluídos</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso da configuração da loja"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={completedCount}
          className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Draft resume notice */}
      {detectedDraft && !step3Done ? (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
        >
          <div className="flex items-center gap-2">
            <BookmarkCheck className="size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <span>Você tem um rascunho salvo em andamento.</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenExpressWizard()}
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-[#1D4ED8] underline underline-offset-4 hover:bg-amber-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            Retomar rascunho
          </button>
        </div>
      ) : null}

      {/* 3 Guided Steps */}
      <div className="mt-5 space-y-3">
        {/* TELA 02 / E1 — Dados da Loja */}
        <div
          data-layout-id={!isWizardOpen ? FICHA_MODAL_LAYOUT_ID : undefined}
          className={cn(
            'rounded-2xl border p-4 transition-colors',
            !step1Done
              ? 'border-[#2563EB]/40 bg-[#EFF6FF]/60'
              : 'border-emerald-200 bg-emerald-50/40',
            isWizardOpen && 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {step1Done ? (
                <CheckCircle2
                  className="mt-0.5 size-6 shrink-0 text-[#16A34A]"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="mt-0.5 size-6 shrink-0 text-[#2563EB]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Store className="size-4 text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-bold text-[#0F172A]">
                    1. Nome da loja, WhatsApp e Entrega
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {step1Done
                    ? `${businessName} · WhatsApp ${formattedPhone}`
                    : 'Informe o nome da loja, DDD + celular e opções de entrega ou retirada.'}
                </p>
              </div>
            </div>

            {!step1Done ? (
              <ActionButton
                variant="primaryGradient"
                size={48}
                data-testid="btn-preencher-dados-loja"
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={() => onOpenExpressWizard(1)}
                className="w-full sm:w-auto"
              >
                {detectedDraft ? 'Retomar Dados da Loja' : 'Preencher Dados da Loja'}
              </ActionButton>
            ) : (
              <ActionButton
                variant="secondary"
                size={44}
                data-testid="btn-preencher-dados-loja"
                onClick={() => onOpenExpressWizard(1)}
                className="w-full sm:w-auto"
              >
                Editar dados
              </ActionButton>
            )}
          </div>
        </div>

        {/* TELA 03 / E2 — Primeiro Produto */}
        <div
          className={cn(
            'rounded-2xl border p-4 transition-colors',
            step1Done && !step2Done
              ? 'border-[#2563EB]/40 bg-[#EFF6FF]/60'
              : step2Done
                ? 'border-emerald-200 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50/70 opacity-85',
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {step2Done ? (
                <CheckCircle2
                  className="mt-0.5 size-6 shrink-0 text-[#16A34A]"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className={cn(
                    'mt-0.5 size-6 shrink-0',
                    step1Done ? 'text-[#2563EB]' : 'text-slate-400',
                  )}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-slate-500" aria-hidden="true" />
                  <p className="text-sm font-bold text-[#0F172A]">
                    2. Primeiro produto no catálogo
                  </p>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {step2Done
                    ? `${activeProductsCount} ${activeProductsCount === 1 ? 'produto ativo cadastrado' : 'produtos ativos cadastrados'}.`
                    : 'Cadastre pelo menos 1 item com nome e preço. Sem foto? Geramos uma imagem pronta automaticamente.'}
                </p>
              </div>
            </div>

            {step1Done && !step2Done ? (
              <ActionButton
                variant="primary"
                size={52}
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={() => (onOpenProductStep ? onOpenProductStep() : onOpenExpressWizard(7))}
                className="w-full sm:w-auto"
              >
                Cadastrar Primeiro Produto
              </ActionButton>
            ) : (
              <ActionButton
                variant="secondary"
                size={44}
                disabled={!step1Done}
                onClick={() => (onOpenProductStep ? onOpenProductStep() : onOpenExpressWizard(7))}
                className="w-full sm:w-auto"
              >
                {step2Done ? 'Adicionar produto' : 'Aguardando passo 1'}
              </ActionButton>
            )}
          </div>
        </div>

        {/* TELA 04 / E3 — Pix & Publicação */}
        <div
          className={cn(
            'rounded-2xl border p-4 transition-colors',
            step1Done && step2Done && !step3Done
              ? 'border-emerald-300 bg-emerald-50/50'
              : step3Done
                ? 'border-emerald-200 bg-emerald-50/40'
                : 'border-slate-200 bg-slate-50/70 opacity-85',
          )}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {step3Done ? (
                  <CheckCircle2
                    className="mt-0.5 size-6 shrink-0 text-[#16A34A]"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className={cn(
                      'mt-0.5 size-6 shrink-0',
                      canPublish ? 'text-[#16A34A]' : 'text-slate-400',
                    )}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Rocket className="size-4 text-slate-500" aria-hidden="true" />
                    <p className="text-sm font-bold text-[#0F172A]">
                      3. Pix e publicação da vitrine
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {step3Done
                      ? 'Vitrine publicada e liberada para pedidos dos clientes.'
                      : profile.payment?.pixKey?.trim()
                        ? `Chave Pix configurada (${profile.payment.pixKey.trim()}). Clique para publicar sua loja.`
                        : 'Adicione sua chave Pix (opcional) e publique sua loja com link direto no WhatsApp.'}
                  </p>
                </div>
              </div>

              {canPublish && !step3Done ? (
                <ActionButton
                  variant="success"
                  size={52}
                  isLoading={publishing}
                  loadingText="Publicando..."
                  leftIcon={<Rocket className="size-4" aria-hidden="true" />}
                  onClick={handlePublishClick}
                  className="w-full sm:w-auto"
                >
                  Publicar Minha Loja Agora
                </ActionButton>
              ) : step3Done && onOpenStorefront ? (
                <ActionButton
                  variant="primary"
                  size={44}
                  leftIcon={<Eye className="size-4" aria-hidden="true" />}
                  onClick={onOpenStorefront}
                  className="w-full sm:w-auto"
                >
                  Ver Minha Vitrine
                </ActionButton>
              ) : (
                <ActionButton
                  variant="secondary"
                  size={44}
                  disabled={!step1Done}
                  onClick={() => (onOpenPixStep ? onOpenPixStep() : onOpenExpressWizard(8))}
                  className="w-full sm:w-auto"
                >
                  {step1Done ? 'Configurar Pix' : 'Aguardando passos 1 e 2'}
                </ActionButton>
              )}
            </div>

            {step1Done && step2Done && !step3Done ? (
              <div className="flex flex-wrap gap-2 pt-1 pl-0 sm:pl-9">
                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<CreditCard className="size-4" aria-hidden="true" />}
                  onClick={() => (onOpenPixStep ? onOpenPixStep() : onOpenExpressWizard(8))}
                >
                  {profile.payment?.pixKey?.trim() ? 'Alterar Chave Pix' : 'Configurar Chave Pix'}
                </ActionButton>

                {onConnectWhatsapp ? (
                  <ActionButton
                    variant="softBlue"
                    size={44}
                    leftIcon={<QrCode className="size-4" aria-hidden="true" />}
                    onClick={onConnectWhatsapp}
                  >
                    Conectar WhatsApp (Opcional)
                  </ActionButton>
                ) : null}

                <ActionButton
                  variant="secondary"
                  size={44}
                  data-testid="open-compile-progress"
                  onClick={() => {
                    setCompileProgress(100);
                    setCompileModalOpen(true);
                  }}
                >
                  Acompanhar Compilação V5
                </ActionButton>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* TELA 11: Modal Compilação e Geração V5 */}
      <ModalContainer
        open={compileModalOpen}
        onOpenChange={setCompileModalOpen}
        maxWidth="md"
        mobileHeight="auto"
        title="Compilando sua Vitrine Online"
        description="Gerando páginas otimizadas, catálogo e links de pedido no WhatsApp."
        footer={
          <ActionButton
            variant="primary"
            size={48}
            fullWidth
            disabled={compileProgress < 100}
            rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            onClick={() => {
              setCompileModalOpen(false);
              if (canPublish && !step3Done) {
                void handlePublishClick();
              }
            }}
          >
            Avançar para Ativação
          </ActionButton>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-100 bg-[#EFF6FF]/60 p-6 text-center">
            <span className="text-3xl font-extrabold tracking-tight text-[#2563EB]">
              {compileProgress}%
            </span>
            <p className="mt-1 text-sm font-medium text-[#0F172A]">
              {compileProgress === 100 ? 'Pronto!' : 'Aplicando cores do setor...'}
            </p>
            <div
              role="progressbar"
              aria-label="Progresso da compilação da vitrine"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={compileProgress}
              className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white shadow-inner"
            >
              <div
                className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                style={{ width: `${compileProgress}%` }}
              />
            </div>
          </div>

          <ul className="space-y-2.5 text-sm text-[#0F172A]">
            <li className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-[#16A34A]">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <span>
                Lendo catálogo ({activeProductsCount}{' '}
                {activeProductsCount === 1 ? 'produto' : 'produtos'})
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-[#16A34A]">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <span>Aplicando design da marca</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-[#16A34A]">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <span>Gerando páginas públicas da vitrine</span>
            </li>
          </ul>
        </div>
      </ModalContainer>
    </section>
  );
}
