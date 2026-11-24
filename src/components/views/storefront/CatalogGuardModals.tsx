import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ActionButton, ModalContainer } from '@/components/ui';

export interface DiscardChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDiscard: () => void;
}

export function DiscardChangesModal({
  open,
  onOpenChange,
  onConfirmDiscard,
}: DiscardChangesModalProps) {
  const cancelBtnRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      initialFocus="cancel"
      cancelRef={cancelBtnRef}
      maxWidth="sm"
      mobileHeight="auto"
      title={
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#F59E0B]">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <span>Descartar alterações?</span>
        </span>
      }
      description="As modificações feitas neste produto ainda não foram salvas."
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            ref={cancelBtnRef}
            variant="secondary"
            size={44}
            data-modal-cancel="true"
            onClick={() => onOpenChange(false)}
          >
            Continuar editando
          </ActionButton>
          <ActionButton
            variant="danger"
            size={44}
            onClick={() => {
              onOpenChange(false);
              onConfirmDiscard();
            }}
          >
            Descartar alterações
          </ActionButton>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Se sair agora, o formulário voltará ao estado anterior e nenhum dado será alterado na vitrine.
      </p>
    </ModalContainer>
  );
}
