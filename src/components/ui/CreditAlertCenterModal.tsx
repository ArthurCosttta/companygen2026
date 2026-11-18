import { useEffect, useState } from 'react';
import { CheckCircle2, Coins, Sparkles } from 'lucide-react';
import { ActionButton } from './ActionButton';
import { ModalContainer } from './ModalContainer';

export interface InsufficientCreditsDetail {
  error?: string;
  balance?: number;
  required?: number;
  action?: string;
}

export interface CreditAlertCenterModalProps {
  onOpenPlans?: () => void;
}

export function CreditAlertCenterModal({ onOpenPlans }: CreditAlertCenterModalProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InsufficientCreditsDetail>({});

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<InsufficientCreditsDetail>;
      setDetail(custom?.detail && typeof custom.detail === 'object' ? custom.detail : {});
      setOpen(true);
    };
    window.addEventListener('companygen:insufficient-credits', handler as EventListener);
    return () => window.removeEventListener('companygen:insufficient-credits', handler as EventListener);
  }, []);

  const balance = Number.isFinite(Number(detail.balance)) ? Number(detail.balance) : 0;
  const required = Number.isFinite(Number(detail.required)) ? Number(detail.required) : 30;

  return (
    <ModalContainer
      open={open}
      onOpenChange={setOpen}
      role="dialog"
      maxWidth="md"
      mobileHeight="auto"
      title={
        <span className="inline-flex items-center gap-2 text-[#0F172A]">
          <Coins className="size-5 text-amber-600" aria-hidden="true" />
          <span>Créditos de IA insuficientes para esta ação</span>
        </span>
      }
      description={
        detail.error ||
        'Você pode recarregar seus créditos para ações de IA ou continuar usando todos os recursos manuais gratuitamente.'
      }
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <ActionButton variant="secondary" size={44} onClick={() => setOpen(false)}>
            Continuar editando (0 cr)
          </ActionButton>
          {onOpenPlans ? (
            <ActionButton
              variant="primaryGradient"
              size={44}
              leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
              onClick={() => {
                setOpen(false);
                onOpenPlans();
              }}
            >
              Ver Planos / Recarregar Créditos
            </ActionButton>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4" data-testid="credit-alert-center-modal">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-center">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-900">
              Seu saldo atual
            </span>
            <strong className="mt-0.5 block text-lg font-black text-amber-950">{balance} cr</strong>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-amber-900">
              Necessário nesta ação
            </span>
            <strong className="mt-0.5 block text-lg font-black text-amber-950">{required} cr</strong>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
            O que continua 100% grátis (0 créditos):
          </p>
          <ul className="space-y-1.5 text-xs font-medium text-emerald-950">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>Editar textos, preços, cores e reordenar seções manualmente</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>Subir logo, foto da frente da loja e imagens próprias</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>Pesquisar imagens reais na internet para o catálogo</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>Publicar vitrine, receber pedidos na Sacola/WhatsApp e baixar .ZIP</span>
            </li>
          </ul>
        </div>
      </div>
    </ModalContainer>
  );
}
