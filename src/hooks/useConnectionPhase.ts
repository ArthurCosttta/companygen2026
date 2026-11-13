import { useMemo } from 'react';
import { isValidProductionPhone, type BusinessProfile } from '@/schemas/profile.schema';

export type ConnectionPhase =
  | 'DISCONNECTED'
  | 'STORE_NUMBER_ONLY'
  | 'QR_PENDING'
  | 'LIVE_READY';

export interface WhatsappRuntimeStatus {
  connected?: boolean;
  conectado?: boolean;
  qrPending?: boolean;
  qrCode?: string | null;
  status?: string;
  numeroBot?: string;
  phoneE164?: string;
}

export interface ConnectionPhaseInfo {
  phase: ConnectionPhase;
  labelPT: string;
  colorHex: string;
  isLiveReady: boolean;
  hasStoreNumber: boolean;
  isQrPending: boolean;
  isDisconnected: boolean;
}

const PHASE_LABELS_PT: Record<ConnectionPhase, string> = {
  LIVE_READY: 'WhatsApp conectado e respondendo',
  QR_PENDING: 'Aguardando leitura do QR Code',
  STORE_NUMBER_ONLY: 'Link direto ativo no WhatsApp da loja',
  DISCONNECTED: 'WhatsApp da loja não configurado',
};

const PHASE_COLORS_HEX: Record<ConnectionPhase, string> = {
  LIVE_READY: '#16A34A',
  QR_PENDING: '#F59E0B',
  STORE_NUMBER_ONLY: '#2563EB',
  DISCONNECTED: '#64748B',
};

/**
 * Deriva deterministicamente o estágio de conexão WhatsApp da loja
 * sem misturar estados paralelos de webview e bot (INV-06).
 */
export function deriveConnectionPhase(
  profile?: Partial<BusinessProfile> | null,
  runtimeStatus?: WhatsappRuntimeStatus | null,
): ConnectionPhase {
  const isLive = Boolean(
    runtimeStatus?.connected ||
      runtimeStatus?.conectado ||
      profile?.whatsapp?.connected ||
      profile?.onboarding?.whatsappConnected,
  );
  if (isLive) return 'LIVE_READY';

  const isQrPending = Boolean(
    runtimeStatus?.qrPending ||
      runtimeStatus?.qrCode ||
      runtimeStatus?.status === 'qr_pending' ||
      runtimeStatus?.status === 'qr',
  );
  if (isQrPending) return 'QR_PENDING';

  const phoneCandidate = profile?.whatsapp?.phoneE164 || runtimeStatus?.phoneE164 || runtimeStatus?.numeroBot || '';
  if (isValidProductionPhone(phoneCandidate)) {
    return 'STORE_NUMBER_ONLY';
  }

  return 'DISCONNECTED';
}

/**
 * Retorna rótulo comercial em português livre de termos técnicos (INV-04).
 */
export function humanLabelPT(phase: ConnectionPhase): string {
  return PHASE_LABELS_PT[phase];
}

/**
 * Retorna a cor semântica hexadecimal associada ao estágio de conexão.
 */
export function connectionPhaseColorHex(phase: ConnectionPhase): string {
  return PHASE_COLORS_HEX[phase];
}

/**
 * Hook único para estado de conexão WhatsApp em toda a árvore React (INV-06).
 */
export function useConnectionPhase(
  profile?: Partial<BusinessProfile> | null,
  runtimeStatus?: WhatsappRuntimeStatus | null,
): ConnectionPhase {
  const connectedRuntime = Boolean(runtimeStatus?.connected || runtimeStatus?.conectado);
  const qrPending = Boolean(
    runtimeStatus?.qrPending ||
      runtimeStatus?.qrCode ||
      runtimeStatus?.status === 'qr_pending' ||
      runtimeStatus?.status === 'qr',
  );
  const runtimePhone = runtimeStatus?.phoneE164 || runtimeStatus?.numeroBot || '';
  const profileWaConnected = Boolean(profile?.whatsapp?.connected);
  const onboardingWaConnected = Boolean(profile?.onboarding?.whatsappConnected);
  const profilePhone = profile?.whatsapp?.phoneE164 || '';

  return useMemo(
    () =>
      deriveConnectionPhase(
        {
          whatsapp: { connected: profileWaConnected, phoneE164: profilePhone } as BusinessProfile['whatsapp'],
          onboarding: { whatsappConnected: onboardingWaConnected } as BusinessProfile['onboarding'],
        },
        {
          connected: connectedRuntime,
          qrPending,
          phoneE164: runtimePhone,
        },
      ),
    [connectedRuntime, onboardingWaConnected, profilePhone, profileWaConnected, qrPending, runtimePhone],
  );
}

/**
 * Hook auxiliar com metadados completos de exibição para barras de status e badges.
 */
export function useConnectionPhaseInfo(
  profile?: Partial<BusinessProfile> | null,
  runtimeStatus?: WhatsappRuntimeStatus | null,
): ConnectionPhaseInfo {
  const phase = useConnectionPhase(profile, runtimeStatus);
  return useMemo(
    () => ({
      phase,
      labelPT: humanLabelPT(phase),
      colorHex: connectionPhaseColorHex(phase),
      isLiveReady: phase === 'LIVE_READY',
      hasStoreNumber: phase === 'STORE_NUMBER_ONLY' || phase === 'LIVE_READY',
      isQrPending: phase === 'QR_PENDING',
      isDisconnected: phase === 'DISCONNECTED',
    }),
    [phase],
  );
}
