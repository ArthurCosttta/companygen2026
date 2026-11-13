import * as React from 'react';
import { Unplug } from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';

export interface DisconnectConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner?: string;
  phoneLabel?: string;
  onConfirmDisconnect?: () => Promise<void> | void;
  onDisconnected?: () => void;
}

export function DisconnectConfirmModal({
  open,
  onOpenChange,
  owner,
  phoneLabel,
  onConfirmDisconnect,
  onDisconnected,
}: DisconnectConfirmModalProps) {
  const { showToast } = useToast();
  const cancelBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const handleConfirm = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      if (onConfirmDisconnect) {
        await onConfirmDisconnect();
      } else {
        const res = await authenticatedFetch(
          '/api/whatsapp/api/sessao/reset',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
          owner,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.erro || data.error || 'Não foi possível desconectar agora.');
        }
      }

      showToast({
        type: 'neutral',
        message: 'WhatsApp desconectado. Você pode reconectar quando quiser lendo um novo QR Code.',
        durationMs: 2500,
      });
      onDisconnected?.();
      onOpenChange(false);
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível desconectar o WhatsApp. Tente novamente.',
        durationMs: 3500,
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      initialFocus="cancel"
      cancelRef={cancelBtnRef}
      preventCloseWhileSubmitting={isDisconnecting}
      maxWidth="sm"
      mobileHeight="auto"
      title="Desconectar WhatsApp da loja?"
      description="Confirme se deseja encerrar a conexão ativa neste painel."
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            ref={cancelBtnRef}
            data-modal-cancel="true"
            variant="secondary"
            size={44}
            disabled={isDisconnecting}
            onClick={() => onOpenChange(false)}
          >
            Continuar conectado
          </ActionButton>
          <ActionButton
            variant="danger"
            size={44}
            isLoading={isDisconnecting}
            loadingText="Desconectando..."
            leftIcon={<Unplug className="size-4" aria-hidden="true" />}
            onClick={() => void handleConfirm()}
          >
            Sim, desconectar
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-slate-600">
        <p>
          Ao desconectar{phoneLabel ? ` o número ${phoneLabel}` : ''}, o atendimento automático será
          pausado até você ler o QR Code novamente.
        </p>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
          Sua loja online, seu catálogo e os pedidos já recebidos continuam funcionando normalmente.
        </div>
      </div>
    </ModalContainer>
  );
}
