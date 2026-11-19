import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  HelpCircle,
  MessageSquare,
  Rocket,
  Sparkles,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer } from '@/components/ui';
import { cn } from '@/lib/utils';

export type OnboardingPreferredTrack = 'store_first' | 'whatsapp_first' | 'full_guided';

export interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName?: string;
  ownerEmail?: string;
  hasDraft?: boolean;
  initialTrack?: OnboardingPreferredTrack;
  onSelectTrack?: (track: OnboardingPreferredTrack) => void;
  onStartExpressWizard: () => void;
  onContinueDraft?: () => void;
  onExploreFirst?: () => void;
  onOpenHelp?: () => void;
}

const WELCOME_TRACKS: ReadonlyArray<{
  id: OnboardingPreferredTrack;
  title: string;
  description: string;
  recommended?: boolean;
  icon: typeof Store;
}> = [
  {
    id: 'full_guided',
    title: 'Setup Completo Guiado',
    description: 'Crie sua vitrine com IA + configure a Sofia em 3 passos com prévia ao vivo.',
    recommended: true,
    icon: Rocket,
  },
  {
    id: 'store_first',
    title: 'Criar Vitrine IA primeiro',
    description: 'Foque agora no catálogo, logo e link público compartilhável no Instagram.',
    icon: Store,
  },
  {
    id: 'whatsapp_first',
    title: 'Conectar WhatsApp primeiro',
    description: 'Pareie seu número via QR Code antes de preencher o restante da loja.',
    icon: MessageSquare,
  },
];

export function WelcomeModal({
  open,
  onOpenChange,
  storeName,
  ownerEmail,
  hasDraft = false,
  initialTrack = 'full_guided',
  onSelectTrack,
  onStartExpressWizard,
  onContinueDraft,
  onExploreFirst,
  onOpenHelp,
}: WelcomeModalProps) {
  const [selectedTrack, setSelectedTrack] = useState<OnboardingPreferredTrack>(initialTrack);

  useEffect(() => {
    setSelectedTrack(initialTrack);
  }, [initialTrack, open]);

  const cleanStoreName = (storeName || '').trim();
  const hasCustomName =
    cleanStoreName.length >= 2 &&
    !/^(minha\s+loja|loja\s+companygen)$/i.test(cleanStoreName);

  const handlePrimaryClick = () => {
    if (onSelectTrack) {
      onSelectTrack(selectedTrack);
    }
    if (selectedTrack === 'whatsapp_first') {
      return;
    }
    if (hasDraft && onContinueDraft) {
      onContinueDraft();
      return;
    }
    onStartExpressWizard();
  };

  const handleExplore = () => {
    if (onExploreFirst) {
      onExploreFirst();
      return;
    }
    onOpenChange(false);
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="lg"
      mobileHeight="90%"
      title={
        <span className="inline-flex items-center gap-2 text-[#0F172A] dark:text-white">
          <Sparkles className="size-5 text-[#2563EB]" aria-hidden="true" />
          <span>
            {hasCustomName
              ? `Boas-vindas, ${cleanStoreName}!`
              : 'Boas-vindas ao CompanyGen!'}
          </span>
        </span>
      }
      description="Escolha como prefere começar — você pode ajustar tudo depois com 1 clique."
      footer={
        <div className="flex flex-col gap-2.5">
          <ActionButton
            variant="primaryGradient"
            size={52}
            fullWidth
            data-testid="welcome-start-track-btn"
            rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            onClick={handlePrimaryClick}
          >
            {selectedTrack === 'whatsapp_first'
              ? 'Ir para Conexão WhatsApp'
              : hasDraft
                ? 'Continuar Configuração Express'
                : 'Começar em Menos de 3 Min'}
          </ActionButton>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ActionButton
              variant="secondary"
              size={44}
              className="w-full sm:flex-1"
              onClick={handleExplore}
            >
              Explorar o painel primeiro
            </ActionButton>

            {onOpenHelp ? (
              <button
                type="button"
                onClick={onOpenHelp}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <HelpCircle className="size-4 text-[#2563EB]" aria-hidden="true" />
                <span>Como funciona?</span>
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {ownerEmail ? (
          <p className="text-xs font-medium text-slate-500">
            Conta conectada: <span className="text-[#0F172A] dark:text-white">{ownerEmail}</span>
          </p>
        ) : null}

        {hasDraft ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950"
          >
            <BookmarkCheck className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <span>
              Encontramos um rascunho salvo da sua loja. Você continuará exatamente de onde parou.
            </span>
          </div>
        ) : null}

        <div className="grid gap-3" role="radiogroup" aria-label="Objetivo inicial">
          {WELCOME_TRACKS.map((track) => {
            const Icon = track.icon;
            const active = selectedTrack === track.id;
            return (
              <button
                key={track.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`welcome-track-${track.id}`}
                onClick={() => setSelectedTrack(track.id)}
                className={cn(
                  'flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all',
                  active
                    ? 'border-[#2563EB] bg-[#EFF6FF] ring-2 ring-[#2563EB]/25 dark:border-blue-500 dark:bg-[#182034]'
                    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-[#111726]',
                )}
              >
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    active ? 'bg-[#2563EB] text-white' : 'bg-[#EFF6FF] text-[#2563EB]',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#0F172A] dark:text-white">
                      {track.title}
                    </p>
                    {track.recommended ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Recomendado
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {track.description}
                  </p>
                </div>
                {active ? (
                  <Check className="mt-1 size-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </ModalContainer>
  );
}
