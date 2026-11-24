import type { BusinessProfile } from '@/schemas/profile.schema';
import { WhatsappFlowCenterModal } from '../whatsapp/WhatsappFlowCenterModal';

export interface StorefrontPostGenWhatsappModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: Partial<BusinessProfile> | null;
  owner?: string;
  autoSimulateFirst?: boolean;
}

/**
 * Modal central exibido no meio da tela para ilustrar e simular as mensagens do WhatsApp.
 * Mostra o celular com animação em tempo real e o mapa de regras ("Se o cliente mandar tal...").
 */
export function StorefrontPostGenWhatsappModal({
  isOpen,
  onClose,
  profile,
  owner,
}: StorefrontPostGenWhatsappModalProps) {
  return (
    <WhatsappFlowCenterModal
      isOpen={isOpen}
      onClose={onClose}
      profile={profile}
      owner={owner}
    />
  );
}
