import { isValidProductionPhone, sanitizePhoneE164 } from '@/schemas/profile.schema';
import { authenticatedFetch } from './supabase-client';
import { updateBusinessProfile, type ProfileSnapshot } from './profile-service';

export type WhatsappConnectionSnapshot = {
  conectado?: boolean;
  numeroBot?: string;
  origin?: 'baileys' | 'webview';
};

type WhatsappProfileResponse = {
  ok?: boolean;
  conectado?: boolean;
  jid?: string;
  nome?: string;
  numero?: string;
  telefoneFormatado?: string;
  fotoUrl?: string | null;
};

/**
 * Mantém a Ficha Única alinhada ao número detectado. A origem `webview`
 * fornece apenas o destino da loja; ela não representa o worker automático.
 */
export async function syncConnectedWhatsappProfile(
  connection: WhatsappConnectionSnapshot,
  owner: string,
): Promise<ProfileSnapshot> {
  if (!connection.conectado) {
    return updateBusinessProfile(draft => {
      draft.whatsapp.connected = false;
      draft.onboarding.whatsappConnected = false;
      draft.onboarding.whatsappConfirmed = false;
    }, undefined, owner);
  }

  let remoteProfile: WhatsappProfileResponse = {};
  if (connection.origin !== 'webview') {
    const response = await authenticatedFetch(
      '/api/whatsapp/api/whatsapp/perfil',
      undefined,
      owner,
    ).catch(() => null);
    if (response?.ok) {
      remoteProfile = await response.json().catch(() => ({}));
    }
  }

  const phoneE164 = sanitizePhoneE164(
    remoteProfile.numero || connection.numeroBot || remoteProfile.jid?.split('@')[0] || '',
  );
  if (!isValidProductionPhone(phoneE164)) {
    throw new Error('O WhatsApp conectou, mas ainda não informou um número válido para a loja.');
  }

  return updateBusinessProfile(draft => {
    draft.whatsapp = {
      ...draft.whatsapp,
      connected: connection.origin !== 'webview',
      jid: remoteProfile.jid || `${phoneE164}@s.whatsapp.net`,
      phoneE164,
      displayPhone: remoteProfile.telefoneFormatado || remoteProfile.numero || `+${phoneE164}`,
      profileName: remoteProfile.nome || draft.whatsapp.profileName || 'Conta WhatsApp conectada',
      profilePhotoUrl: remoteProfile.fotoUrl || '',
      verifiedOrigin: connection.origin === 'webview' ? 'manual' : 'baileys',
    };
    draft.onboarding.whatsappConnected = connection.origin !== 'webview';
    draft.onboarding.whatsappConfirmed = true;
  }, undefined, owner);
}
