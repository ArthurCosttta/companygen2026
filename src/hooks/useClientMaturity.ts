import { useMemo } from 'react';
import { isValidProductionPhone, type BusinessProfile } from '@/schemas/profile.schema';
import {
  deriveConnectionPhase,
  type ConnectionPhase,
  type WhatsappRuntimeStatus,
} from './useConnectionPhase';

export type MaturityState =
  | 'ESTADO_0'
  | 'ESTADO_1'
  | 'ESTADO_2'
  | 'ESTADO_3'
  | 'ESTADO_4';

export type MaturityTab = 'store' | 'whatsapp' | 'dashboard' | 'settings';

export type ProfileSnapInput =
  | { profile?: BusinessProfile | null }
  | BusinessProfile
  | null
  | undefined;

export interface UseClientMaturityOptions {
  connectionPhase?: ConnectionPhase;
  runtimeStatus?: WhatsappRuntimeStatus | null;
}

export interface ClientMaturityResult {
  maturityState: MaturityState;
  isBootstrapping: boolean;
  activeProductsCount: number;
  isCatalogEmpty: boolean;
  canPublishStore: boolean;
  allowedTabs: MaturityTab[];
  connectionPhase: ConnectionPhase;
}

function extractProfile(profileSnap: ProfileSnapInput): BusinessProfile | null {
  if (!profileSnap || typeof profileSnap !== 'object') return null;
  if ('profile' in profileSnap) {
    return profileSnap.profile ?? null;
  }
  return profileSnap as BusinessProfile;
}

/**
 * Derivação pura da máquina de maturidade da loja (ESTADO_0..ESTADO_4)
 * sobre os caminhos reais de BusinessProfileSchema (INV-02, INV-03, INV-06).
 */
export function deriveClientMaturity(
  session: unknown,
  profileSnap: ProfileSnapInput,
  options?: UseClientMaturityOptions,
): ClientMaturityResult {
  if (!session) {
    return {
      maturityState: 'ESTADO_0',
      isBootstrapping: false,
      activeProductsCount: 0,
      isCatalogEmpty: true,
      canPublishStore: false,
      allowedTabs: [],
      connectionPhase: 'DISCONNECTED',
    };
  }

  const profile = extractProfile(profileSnap);
  if (!profile) {
    return {
      maturityState: 'ESTADO_1',
      isBootstrapping: true,
      activeProductsCount: 0,
      isCatalogEmpty: true,
      canPublishStore: false,
      allowedTabs: [],
      connectionPhase: 'DISCONNECTED',
    };
  }

  const businessName = (profile.business?.name ?? '').trim();
  const phoneE164 = profile.whatsapp?.phoneE164 || '';
  const hasValidPhone = isValidProductionPhone(phoneE164);
  const fichaOk =
    Boolean(profile.onboarding?.fichaCompleted) &&
    businessName.length >= 2 &&
    hasValidPhone;

  const activeProducts = (profile.catalog?.products ?? []).filter(p => p.active !== false);
  const activeProductsCount = activeProducts.length;
  const isCatalogEmpty = activeProductsCount === 0;
  const canPublishStore = fichaOk && !isCatalogEmpty && hasValidPhone;
  const connectionPhase =
    options?.connectionPhase ?? deriveConnectionPhase(profile, options?.runtimeStatus);

  if (!fichaOk) {
    return {
      maturityState: 'ESTADO_1',
      isBootstrapping: false,
      activeProductsCount,
      isCatalogEmpty,
      canPublishStore: false,
      allowedTabs: [],
      connectionPhase,
    };
  }

  if (isCatalogEmpty) {
    return {
      maturityState: 'ESTADO_2',
      isBootstrapping: false,
      activeProductsCount: 0,
      isCatalogEmpty: true,
      canPublishStore: false,
      allowedTabs: [],
      connectionPhase,
    };
  }

  if (!profile.publishedStore?.published && connectionPhase !== 'LIVE_READY') {
    return {
      maturityState: 'ESTADO_3',
      isBootstrapping: false,
      activeProductsCount,
      isCatalogEmpty: false,
      canPublishStore,
      allowedTabs: ['store', 'settings'],
      connectionPhase,
    };
  }

  return {
    maturityState: 'ESTADO_4',
    isBootstrapping: false,
    activeProductsCount,
    isCatalogEmpty: false,
    canPublishStore,
    allowedTabs: ['store', 'whatsapp', 'dashboard', 'settings'],
    connectionPhase,
  };
}

/**
 * Hook único de roteamento por maturidade da loja (INV-02, INV-03).
 */
export function useClientMaturity(
  session: unknown,
  profileSnap: ProfileSnapInput,
  options?: UseClientMaturityOptions,
): ClientMaturityResult {
  const profile = extractProfile(profileSnap);
  const hasSession = Boolean(session);
  const optionPhase = options?.connectionPhase;
  const runtimeStatus = options?.runtimeStatus;

  return useMemo(
    () =>
      deriveClientMaturity(hasSession, profile, {
        connectionPhase: optionPhase,
        runtimeStatus,
      }),
    [hasSession, profile, optionPhase, runtimeStatus],
  );
}
