import * as React from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  HelpCircle,
  QrCode,
  Rocket,
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
import { OnboardingSplitStudio } from './OnboardingSplitStudio';

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

  const [activeDraft, setActiveDraft] = React.useState(() => readExpressFichaDraft(owner));

  React.useEffect(() => {
    setActiveDraft(readExpressFichaDraft(owner));
    const syncHandler = (ev: Event) => {
      const custom = ev as CustomEvent<{ owner?: string }>;
      if (custom?.detail?.owner && (owner || 'default') !== custom.detail.owner) return;
      setActiveDraft(readExpressFichaDraft(owner));
    };
    window.addEventListener('companygen:ficha-draft-updated', syncHandler);
    return () => {
      window.removeEventListener('companygen:ficha-draft-updated', syncHandler);
    };
  }, [owner]);

  const detectedDraft = React.useMemo(() => {
    if (typeof hasDraftProp === 'boolean') return hasDraftProp;
    return Boolean(activeDraft);
  }, [hasDraftProp, activeDraft]);

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
  const step3Done = isStorePublished && step1Done && step2Done;
  const canPublish = step1Done && step2Done && hasValidPhone;

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
    if ((maturityState === 'ESTADO_4' || step3Done) && step1Done && step2Done) {
      return {
        eyebrow: 'Tudo pronto · Loja ativa',
        title: `${businessName || 'Sua loja'} está no ar!`,
        subtitle:
          'Você já pode divulgar o link da sua vitrine e acompanhar os pedidos em tempo real.',
      };
    }
    if (activeDraft?.splitStep === 3) {
      return {
        eyebrow: 'Etapa 3 de 3 · Pix e Sofia',
        title: 'Defina sua chave Pix e teste a Sofia antes de publicar',
        subtitle:
          'Suas 3 respostas rápidas já preparam o atendimento automático no WhatsApp ao clicar em Publicar.',
      };
    }
    if (activeDraft?.splitStep === 2) {
      return {
        eyebrow: 'Etapa 2 de 3 · Catálogo ao vivo',
        title: 'Adicione seus produtos e veja na prévia do celular',
        subtitle:
          'Cole uma lista, importe uma planilha ou escolha uma loja modelo sem gastar créditos.',
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
      eyebrow: 'Etapa 1 de 3 · Identidade e WhatsApp',
      title: 'Configure o nome, cores e WhatsApp da sua loja',
      subtitle:
        'Veja a identidade da sua marca ganhando forma no celular ao vivo ao lado.',
    };
  })();

  const formattedPhone = formatBrazilPhoneDisplay(phoneE164);

  if ((maturityState === 'ESTADO_4' || step3Done) && step1Done && step2Done) {
    return (
      <section
        role="region"
        aria-label="Próximo ganho recomendado"
        data-testid="guided-next-step"
        className={cn(
          'mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-slate-200 border-l-[3px] border-l-[var(--cg-primary)] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-[#111726]',
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-500/15 dark:text-[#38BDF8]">
            <Rocket className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0867E8] dark:text-[#38BDF8]">
              Próximo Ganho · {businessName || 'Sua loja'} no ar
            </p>
            <p className="truncate text-sm font-semibold text-[#0F172A] dark:text-white">
              {phase === 'LIVE_READY'
                ? 'Vitrine e WhatsApp ativos — divulgue seu link ou teste seu 1º pedido.'
                : 'Conecte seu WhatsApp para a Sofia atender seus clientes automaticamente.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {phase !== 'LIVE_READY' && onConnectWhatsapp ? (
            <ActionButton
              variant="primaryGradient"
              size={44}
              leftIcon={<QrCode className="size-4" />}
              onClick={onConnectWhatsapp}
            >
              Conectar WhatsApp
            </ActionButton>
          ) : null}
          {onOpenStorefront ? (
            <ActionButton
              variant="softBlue"
              size={44}
              leftIcon={<Eye className="size-4" />}
              onClick={onOpenStorefront}
            >
              Ver Vitrine Pública
            </ActionButton>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-label="Configuração rápida da loja"
      className={cn('mx-auto w-full max-w-6xl space-y-5', className)}
    >
      {/* Compact Header & Legacy Modal Trigger (Anime.js FLIP anchor) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:px-6 dark:border-slate-800 dark:bg-[#111726]">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1D4ED8] dark:bg-blue-500/15 dark:text-blue-200">
              {stageBanner.eyebrow}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-[#0F172A] dark:border-slate-700 dark:bg-[#182034] dark:text-white">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: phaseColor }}
                aria-hidden="true"
              />
              <span>{phaseLabel}</span>
            </span>
          </div>

          <h2 className="text-lg font-bold tracking-tight text-[#0F172A] sm:text-xl dark:text-white">
            {stageBanner.title}
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {stageBanner.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            data-layout-id={!isWizardOpen ? FICHA_MODAL_LAYOUT_ID : undefined}
            className={cn(
              'rounded-xl border border-[#2563EB]/30 bg-[#EFF6FF]/60 p-1.5 transition-opacity dark:border-blue-500/30 dark:bg-[#182034]',
              isWizardOpen && 'opacity-0 pointer-events-none',
            )}
          >
            <ActionButton
              variant="softBlue"
              size={44}
              data-testid="btn-preencher-dados-loja"
              rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
              onClick={() => onOpenExpressWizard(1)}
            >
              {detectedDraft ? 'Assistente Guiado (Modal)' : 'Preencher Dados da Loja'}
            </ActionButton>
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
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] dark:border-slate-700 dark:bg-[#182034] dark:text-slate-200"
            >
              <HelpCircle className="size-4 text-[#2563EB]" aria-hidden="true" />
              <span>Ajuda</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Onboarding Split Studio (55% Formulário Express / 45% Celular Ao Vivo) */}
      <OnboardingSplitStudio
        profile={profile}
        owner={owner}
        onStorePublished={onStorePublished}
        onConnectWhatsapp={onConnectWhatsapp}
        onOpenExpressWizard={onOpenExpressWizard}
      />

      {/* Checklist resumido de controle rápido quando o usuário prefere ações pontuais */}
      {step1Done && step2Done && !step3Done ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/20">
          <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
            Tudo preenchido ({formattedPhone || 'WhatsApp pronto'} · {activeProductsCount} itens). Clique para publicar agora ou acompanhar a compilação.
          </div>
          <div className="flex flex-wrap gap-2">
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
            <ActionButton
              variant="success"
              size={44}
              isLoading={publishing}
              loadingText="Publicando..."
              leftIcon={<Rocket className="size-4" aria-hidden="true" />}
              onClick={handlePublishClick}
            >
              Publicar Agora
            </ActionButton>
          </div>
        </div>
      ) : null}

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
