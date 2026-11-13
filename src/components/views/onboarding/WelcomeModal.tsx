import {
  ArrowRight,
  BookmarkCheck,
  CreditCard,
  HelpCircle,
  Package,
  Sparkles,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer } from '@/components/ui';

export interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName?: string;
  ownerEmail?: string;
  hasDraft?: boolean;
  onStartExpressWizard: () => void;
  onContinueDraft?: () => void;
  onExploreFirst?: () => void;
  onOpenHelp?: () => void;
}

const WELCOME_STEPS = [
  {
    step: 1,
    title: 'Nome, WhatsApp e Entrega',
    description: 'Como os clientes encontram sua loja e recebem os pedidos.',
    icon: Store,
  },
  {
    step: 2,
    title: 'Seu Primeiro Produto',
    description: 'Nome e preço em reais. Sem foto? Criamos uma imagem pronta.',
    icon: Package,
  },
  {
    step: 3,
    title: 'Pagamento com Pix',
    description: 'Deixe sua chave Pix pronta para acelerar as vendas.',
    icon: CreditCard,
  },
] as const;

export function WelcomeModal({
  open,
  onOpenChange,
  storeName,
  ownerEmail,
  hasDraft = false,
  onStartExpressWizard,
  onContinueDraft,
  onExploreFirst,
  onOpenHelp,
}: WelcomeModalProps) {
  const cleanStoreName = (storeName || '').trim();
  const hasCustomName =
    cleanStoreName.length >= 2 &&
    !/^(minha\s+loja|loja\s+companygen)$/i.test(cleanStoreName);

  const handlePrimaryClick = () => {
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
        <span className="inline-flex items-center gap-2 text-[#0F172A]">
          <Sparkles className="size-5 text-[#2563EB]" aria-hidden="true" />
          <span>
            {hasCustomName
              ? `Boas-vindas, ${cleanStoreName}!`
              : 'Boas-vindas ao CompanyGen!'}
          </span>
        </span>
      }
      description="Configure sua loja em 3 passos simples e comece a vender pela vitrine e pelo WhatsApp."
      footer={
        <div className="flex flex-col gap-2.5">
          <ActionButton
            variant="primaryGradient"
            size={52}
            fullWidth
            rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            onClick={handlePrimaryClick}
          >
            {hasDraft
              ? 'Continuar Configuração Express'
              : 'Configurar Minha Loja Agora (2 min)'}
          </ActionButton>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ActionButton
              variant="secondary"
              size={44}
              fullWidth
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
            Conta conectada: <span className="text-[#0F172A]">{ownerEmail}</span>
          </p>
        ) : null}

        {hasDraft ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950"
          >
            <BookmarkCheck className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <span>
              Encontramos um rascunho salvo da sua loja. Clique abaixo para continuar exatamente de onde parou.
            </span>
          </div>
        ) : null}

        <div className="grid gap-3">
          {WELCOME_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#0F172A]">
                    {item.step}. {item.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalContainer>
  );
}
