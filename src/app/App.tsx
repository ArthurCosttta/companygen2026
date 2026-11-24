import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  BusinessProfileSchema,
  createEmptyProfile,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import { sanitizeFormulaV9Document } from '@/schemas/formula-v9.schema';
import {
  useClientMaturity,
} from '@/hooks/useClientMaturity';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import { useHighSaturationNotifications } from '@/hooks/useHighSaturationNotifications';
import { useNetworkAndDraftGuard } from '@/hooks/useNetworkAndDraftGuard';
import { setWorkspaceUser } from '@/services/local-storage';
import {
  loadBusinessProfile,
  loadDashboardMetrics,
  recordStoreVisit,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import {
  authenticatedFetch,
  clearLocalShowcaseSession,
  getSupportReadonlySession,
  isGuestAccountUser,
  readLocalShowcaseSession,
  setSupportReadonlySession,
  supabase,
  toSupabaseUserFromShowcase,
  type SupportReadonlySession,
} from '@/services/supabase-client';
import { syncConnectedWhatsappProfile } from '@/services/whatsapp-profile-sync';
import { AuthFlowView } from '@/components/auth/AuthFlowView';
import {
  GuestClaimEmailModal,
  PENDING_GUEST_CLAIM_KEY,
} from '@/components/auth/GuestClaimEmailModal';
import {
  CommandPaletteModal,
  Sidebar,
  Topbar,
  type SidebarTab,
} from '@/components/shell';
import { RouteErrorBoundary } from '@/components/ui/ErrorBoundary';
import { lazyNamed } from '@/utils/chunk-recovery';
import { isLowSpecEnabled, syncLowSpecClassOnHtml } from '@/utils/performance-mode';
import { recordTelemetryBreadcrumb, updateTelemetryAppContext } from '@/utils/crash-telemetry';
import { FloatingTopPill } from '@/components/shell/FloatingTopPill';
import { HighSaturationNotificationBar } from '@/components/shell/HighSaturationNotificationBar';
import {
  ActionButton,
  CreditAlertCenterModal,
  EmptyStateCard,
  SkeletonBlock,
  SkeletonTableRows,
  SupportTicketModal,
  ToastProvider,
  useToast,
} from '@/components/ui';
import { GlobalAiAssistantWidget } from '@/components/ui/GlobalAiAssistantWidget';
import {
  clearExpressFichaDraft,
  ContextualHelpModal,
  readExpressFichaDraft,
  type GenerateFullStorefrontResponse,
  type IgnitionSubmissionPayload,
  type OnboardingHelpTopic,
} from '@/components/views/onboarding';
const OnboardingIgnitionView = lazyNamed(
  () => import('@/components/views/onboarding/OnboardingIgnitionView'),
  'OnboardingIgnitionView',
);
const OnboardingSynthesisStage = lazyNamed(
  () => import('@/components/views/onboarding/OnboardingSynthesisStage'),
  'OnboardingSynthesisStage',
);
import type { CatalogProduct } from '@/schemas/profile.schema';
const ArchetypeComposerView = lazyNamed(
  () => import('@/components/views/studio'),
  'ArchetypeComposerView',
);
import {
  buildStorePublicUrl,
  readImageFileAsDataUrl,
} from '@/components/views/storefront/storefront-utils';
const CustomerStorefrontView = lazyNamed(
  () => import('@/components/views/storefront/CustomerStorefrontView'),
  'CustomerStorefrontView',
);
const EditorialStoreControlView = lazyNamed(
  () => import('@/components/views/storefront/EditorialStoreControlView'),
  'EditorialStoreControlView',
);
import type { WhatsappDadosResponse } from '@/components/views/whatsapp';
const WhatsAppConnectionView = lazyNamed(
  () => import('@/components/views/whatsapp/WhatsAppConnectionView'),
  'WhatsAppConnectionView',
);
const OrdersKanbanView = lazyNamed(
  () => import('@/components/views/orders'),
  'OrdersKanbanView',
);
const SettingsView = lazyNamed(
  () => import('@/components/views/settings'),
  'SettingsView',
);
import { AccessCodeView } from '@/components/views/access/AccessCodeView';
const AdminConsoleView = lazyNamed(
  () => import('@/components/views/admin/AdminConsoleView'),
  'AdminConsoleView',
);
const CheckoutPlansView = lazyNamed(
  () => import('@/components/views/checkout/CheckoutPlansView'),
  'CheckoutPlansView',
);
import { getDesktopBridge } from '@/hooks/useWebviewWhatsappResponder';

type PreviewKind = 'preview' | 'public' | null;

interface PublicStoreRouteTarget {
  isPublicStore: boolean;
  targetOwnerId: string;
  targetSlug: string;
}

function readPublicStoreRouteTarget(): PublicStoreRouteTarget {
  if (typeof window === 'undefined') {
    return { isPublicStore: false, targetOwnerId: '', targetSlug: '' };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view')?.trim().toLowerCase();
    const targetOwnerId = params.get('u')?.trim() || '';
    const targetSlug = params.get('loja')?.trim() || '';
    const isPublicStore = view === 'store' || Boolean(targetSlug);
    return { isPublicStore, targetOwnerId, targetSlug };
  } catch {
    return { isPublicStore: false, targetOwnerId: '', targetSlug: '' };
  }
}

function readInitialRoute(): 'access' | 'checkout' | null {
  if (typeof window === 'undefined') return null;
  try {
    const pathname = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route')?.toLowerCase();
    const codeParam = (params.get('code') || params.get('invite') || '').trim();
    if (pathname === '/access' || route === 'access') {
      return 'access';
    }
    if (/^AI10-[A-Z0-9]{3,5}-[A-Z0-9]{3,5}$/i.test(codeParam)) {
      try {
        const validatedRaw = sessionStorage.getItem('cg_validated_invite');
        const validatedParsed = validatedRaw ? (JSON.parse(validatedRaw) as { code?: string }) : null;
        if (validatedParsed?.code?.toUpperCase() === codeParam.toUpperCase()) {
          return null;
        }
      } catch {}
      return 'access';
    }
    if (pathname === '/checkout' || route === 'checkout') return 'checkout';
  } catch {}
  return null;
}

function readInitialPreviewKind(): PreviewKind {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'vitrine') return 'preview';
    if (params.get('view') === 'store' || params.get('loja')) return 'public';
  } catch {
    // Ignore malformed query strings
  }
  return null;
}

function PublicStorefrontRoute({
  targetOwnerId,
  targetSlug,
}: {
  targetOwnerId: string;
  targetSlug: string;
}) {
  const lookupKey = targetOwnerId || targetSlug;
  const isAdminPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('adminPreview') === '1';
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [publicProfile, setPublicProfile] = useState<BusinessProfile | null>(null);
  const [isDraftStore, setIsDraftStore] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPublicStore() {
      if (!lookupKey) {
        if (active) {
          setErrorMessage('Vitrine pública não especificada.');
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setErrorMessage('');
      try {
        const endpoint = isAdminPreview
          ? `/api/admin/users/${encodeURIComponent(lookupKey)}/storefront`
          : `/api/public/store/${encodeURIComponent(lookupKey)}`;
        const res = isAdminPreview
          ? await authenticatedFetch(endpoint, { cache: 'no-store' })
          : await fetch(endpoint, { cache: 'no-store' });
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok || !payload?.ok) {
          throw new Error(String(payload?.error || 'Vitrine não encontrada ou ainda não publicada.'));
        }
        if (!active) return;

        setIsDraftStore(Boolean(payload.draft));
        const irData = (payload.formulasIr && typeof payload.formulasIr === 'object'
          ? payload.formulasIr
          : null) as Record<string, unknown> | null;
        const prof = (payload.profile && typeof payload.profile === 'object'
          ? payload.profile
          : {}) as Record<string, unknown>;
        const profBiz = (prof.business || {}) as Record<string, unknown>;
        const profBrand = (prof.brand || {}) as Record<string, unknown>;
        const profWa = (prof.whatsapp || {}) as Record<string, unknown>;
        const profPay = (prof.payment || {}) as Record<string, unknown>;
        const profDel = (prof.delivery || {}) as Record<string, unknown>;
        const profCat = (prof.catalog || {}) as Record<string, unknown>;
        const profPub = (prof.publishedStore || {}) as Record<string, unknown>;

        const storeInfo = (irData?.storeInfo || {}) as Record<string, unknown>;
        const designTokens = (irData?.designTokens || irData?.themeTokens || {}) as Record<string, unknown>;
        const catalogList =
          Array.isArray(profCat.products) && profCat.products.length > 0
            ? profCat.products
            : Array.isArray(irData?.catalog)
              ? irData.catalog
              : [];

        const base = createEmptyProfile();
        const rawModel = String(profBiz.businessModel || storeInfo.businessModel || '');
        const businessModel =
          rawModel === 'produtos' || rawModel === 'servicos' || rawModel === 'hibrido' || rawModel === 'sob_medida'
            ? rawModel
            : 'hibrido';

        const hydratedBase = BusinessProfileSchema.parse({
          ...base,
          business: {
            ...base.business,
            name: String(profBiz.name || storeInfo.name || 'Vitrine Online'),
            segment: String(profBiz.segment || storeInfo.segment || 'Geral'),
            businessModel,
            description: String(profBiz.description || storeInfo.description || ''),
            address: String(profBiz.address || storeInfo.address || ''),
            hours: String(profBiz.hours || storeInfo.hours || ''),
          },
          brand: {
            ...base.brand,
            logoUrl: String(profBrand.logoUrl || storeInfo.logoUrl || ''),
            storefrontPhotoUrl: String(profBrand.storefrontPhotoUrl || storeInfo.storefrontPhotoUrl || ''),
            primaryColor:
              typeof profBrand.primaryColor === 'string' && profBrand.primaryColor
                ? profBrand.primaryColor
                : typeof designTokens.accent === 'string' && designTokens.accent
                  ? designTokens.accent
                  : base.brand.primaryColor,
            accentColor:
              typeof profBrand.accentColor === 'string' && profBrand.accentColor
                ? profBrand.accentColor
                : typeof designTokens.accent === 'string' && designTokens.accent
                  ? designTokens.accent
                  : base.brand.accentColor,
          },
          whatsapp: {
            ...base.whatsapp,
            connected: Boolean(profWa.phoneE164 || storeInfo.whatsappE164),
            phoneE164: String(profWa.phoneE164 || storeInfo.whatsappE164 || ''),
            displayPhone: String(profWa.displayPhone || profWa.phoneE164 || storeInfo.whatsappE164 || ''),
          },
          payment: {
            ...base.payment,
            pixDiscountPercent: Number(profPay.pixDiscountPercent ?? storeInfo.pixDiscountPercent ?? 0) || 0,
          },
          delivery: {
            ...base.delivery,
            defaultFeeCents: Number(profDel.defaultFeeCents || 0) || 0,
          },
          catalog: {
            products: catalogList,
          },
          publishedStore: {
            ...base.publishedStore,
            published: !payload.draft,
            publicSlug: String(profPub.publicSlug || targetSlug || lookupKey),
          },
          storeLayout: {
            ...base.storeLayout,
            ...(irData ? { formulasIr: irData } : {}),
          },
        });

        const hydrated: BusinessProfile = irData
          ? {
              ...hydratedBase,
              storeLayout: {
                ...hydratedBase.storeLayout,
                formulasIr: sanitizeFormulaV9Document(irData, hydratedBase),
              },
            }
          : hydratedBase;
        setPublicProfile(hydrated);
      } catch (err) {
        if (active) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Não foi possível carregar esta vitrine.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPublicStore();
    return () => {
      active = false;
    };
  }, [lookupKey, targetSlug, isAdminPreview]);

  if (loading) {
    return (
      <main
        className="flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6"
        role="status"
        aria-label="Carregando vitrine"
      >
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="h-4 w-64" />
          <SkeletonBlock className="h-32 w-full" rounded="xl" />
        </div>
      </main>
    );
  }

  if (errorMessage || !publicProfile) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <ShoppingBag className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-[#0F172A]">Vitrine indisponível</h1>
          <p className="text-sm text-slate-600">
            {errorMessage || 'Não foi possível localizar a vitrine solicitada.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <div data-testid="public-storefront-route" className="min-h-dvh w-full bg-[#F3F8FE] text-[#0F172A]">
      {isAdminPreview ? (
        <div
          data-testid="admin-storefront-preview-banner"
          className="sticky top-0 z-50 flex min-h-[40px] items-center justify-between gap-3 bg-[#DC2626] px-4 py-2 text-xs font-bold text-white shadow-sm"
        >
          <span>
            Prévia Administrativa · {isDraftStore ? 'Loja em Rascunho (ainda não publicada)' : 'Loja Publicada ao Vivo'}
          </span>
          <span className="font-mono text-[11px] opacity-90">{lookupKey}</span>
        </div>
      ) : null}
      <RouteErrorBoundary
        routeName="Vitrine Pública"
        onBack={() => {
          window.location.href = '/';
        }}
      >
        <CustomerStorefrontView
          profile={publicProfile}
          ownerId={lookupKey}
          mode="public"
        />
      </RouteErrorBoundary>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>();
  const verifiedId = useRef('');
  const [currentRoute, setCurrentRoute] = useState<'access' | 'checkout' | null>(() => readInitialRoute());
  const [publicStoreRoute, setPublicStoreRoute] = useState<PublicStoreRouteTarget>(() =>
    readPublicStoreRouteTarget(),
  );

  const [lowSpecActive, setLowSpecActive] = useState<boolean>(() => isLowSpecEnabled());

  useEffect(() => {
    setLowSpecActive(syncLowSpecClassOnHtml());
    const onLowSpecChange = () => setLowSpecActive(isLowSpecEnabled());
    window.addEventListener('companygen:low-spec-change', onLowSpecChange);
    try {
      const qs = new URLSearchParams(window.location.search);
      const qTheme = (qs.get('theme') || qs.get('cg_theme') || '').toLowerCase();
      if (qTheme === 'light' || qTheme === 'dark') {
        window.localStorage.setItem('cg_theme', qTheme);
      }
      const saved = window.localStorage.getItem('cg_theme');
      const shouldDark = qTheme === 'dark' ? true : qTheme === 'light' ? false : saved === 'dark';
      document.documentElement.classList.toggle('dark', Boolean(shouldDark));
      window.dispatchEvent(new CustomEvent('companygen:theme-change'));
    } catch {
      // Ignore storage access failures
    }
    return () => {
      window.removeEventListener('companygen:low-spec-change', onLowSpecChange);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(readInitialRoute());
      setPublicStoreRoute(readPublicStoreRouteTarget());
    };
    const handleOpenCheckout = () => setCurrentRoute('checkout');
    const handleOpenAccess = () => setCurrentRoute('access');

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('companygen:open-checkout', handleOpenCheckout);
    window.addEventListener('companygen:open-access', handleOpenAccess);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('companygen:open-checkout', handleOpenCheckout);
      window.removeEventListener('companygen:open-access', handleOpenAccess);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let version = 0;
    let authCheckTimer: number | undefined;
    const syncLocalShowcase = () => {
      const localShowcase = readLocalShowcaseSession();
      if (localShowcase) {
        const showcaseUser = toSupabaseUserFromShowcase(localShowcase);
        verifiedId.current = showcaseUser.id;
        setWorkspaceUser(showcaseUser.id);
        setUser(showcaseUser);
        return true;
      }
      return false;
    };

    const handleShowcaseEvent = () => {
      if (!syncLocalShowcase()) {
        verifiedId.current = '';
        setWorkspaceUser('');
        setUser(null);
      }
    };
    window.addEventListener('companygen:local-showcase-auth', handleShowcaseEvent);
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data?.session && !syncLocalShowcase()) {
        verifiedId.current = '';
        setWorkspaceUser('');
        setUser(null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const check = ++version;
      if (!session) {
        // Só usa sessão Showcase se não houver sessão real autenticada no Supabase
        if (syncLocalShowcase()) return;
        verifiedId.current = '';
        setWorkspaceUser('');
        setUser(null);
        return;
      }
      if (event !== 'TOKEN_REFRESHED' && session.user.id !== verifiedId.current) {
        verifiedId.current = session.user.id;
        setWorkspaceUser(session.user.id);
        setUser(session.user);
      }
      if (authCheckTimer !== undefined) {
        window.clearTimeout(authCheckTimer);
      }
      authCheckTimer = window.setTimeout(async () => {
        try {
          const { data, error } = await supabase.auth.getUser(session.access_token);
          if (!active || check !== version) return;
          if (error) {
            // Só derruba a sessão se o token for explicitamente inválido/expirado
            const status = (error as { status?: number })?.status;
            if (status === 401 || status === 403) {
              verifiedId.current = '';
              setWorkspaceUser('');
              setUser(null);
            }
            return;
          }
          const verified = data.user;
          if (verified) {
            verifiedId.current = verified.id;
            setWorkspaceUser(verified.id);
            setUser(verified);
          }
        } catch {
          // Mantém sessão local em caso de oscilação de rede
        }
      }, 0);
    });
    return () => {
      active = false;
      if (authCheckTimer !== undefined) {
        window.clearTimeout(authCheckTimer);
      }
      window.removeEventListener('companygen:local-showcase-auth', handleShowcaseEvent);
      subscription.unsubscribe();
    };
  }, []);

  // ESTADO_0 / Validating session wrapped in ToastProvider
  const preAuthMaturity = useClientMaturity(user ?? null, null);

  if (currentRoute === 'access') {
    const clearAccessUrl = (preserveTracking = false) => {
      try {
        const url = new URL(window.location.href);
        url.pathname = '/';
        url.searchParams.delete('route');
        url.searchParams.delete('invite');
        url.searchParams.delete('credits');
        if (!preserveTracking) {
          url.searchParams.delete('code');
        }
        window.history.pushState({}, '', url.toString());
      } catch {}
    };
    return (
      <ToastProvider>
        <AccessCodeView
          onSuccess={() => {
            const localShowcase = readLocalShowcaseSession();
            if (localShowcase?.token && localShowcase.user?.id) {
              const showcaseUser = toSupabaseUserFromShowcase(localShowcase);
              setWorkspaceUser(showcaseUser.id);
              setUser(showcaseUser);
            }
            setCurrentRoute(null);
            clearAccessUrl(true);
          }}
          onGoToLogin={() => {
            setCurrentRoute(null);
            clearAccessUrl(true);
          }}
        />
      </ToastProvider>
    );
  }

  if (currentRoute === 'checkout') {
    const initialCheckoutTab = (() => {
      try {
        return new URLSearchParams(window.location.search).get('tab') === 'ledger' ? 'ledger' : 'plans';
      } catch {
        return 'plans';
      }
    })();
    return (
      <ToastProvider>
        <RouteErrorBoundary
          routeName="Créditos & Planos"
          onBack={() => {
            setCurrentRoute(null);
            try {
              const url = new URL(window.location.href);
              url.pathname = '/';
              url.searchParams.delete('route');
              url.searchParams.delete('tab');
              window.history.pushState({}, '', url.toString());
            } catch {}
          }}
        >
          <Suspense fallback={<div className="p-6 text-xs text-slate-400">Carregando módulo...</div>}>
          <CheckoutPlansView
            userId={user?.id}
            initialSubTab={initialCheckoutTab}
            onBackToApp={() => {
              setCurrentRoute(null);
              try {
                const url = new URL(window.location.href);
                url.pathname = '/';
                url.searchParams.delete('route');
                url.searchParams.delete('tab');
                window.history.pushState({}, '', url.toString());
              } catch {}
            }}
          />
          </Suspense>
        </RouteErrorBoundary>
      </ToastProvider>
    );
  }

  const isPublicStoreVisitorOrCrossTenant =
    publicStoreRoute.isPublicStore &&
    user !== undefined &&
    (!user || (Boolean(publicStoreRoute.targetOwnerId) && user.id !== publicStoreRoute.targetOwnerId));

  if (isPublicStoreVisitorOrCrossTenant) {
    return (
      <ToastProvider>
        <PublicStorefrontRoute
          targetOwnerId={publicStoreRoute.targetOwnerId}
          targetSlug={publicStoreRoute.targetSlug}
        />
      </ToastProvider>
    );
  }

  return (
    <MotionConfig reducedMotion={lowSpecActive ? 'always' : 'user'}>
      <ToastProvider>
        <CreditAlertCenterModal onOpenPlans={() => setCurrentRoute('checkout')} />
        {user === undefined ? (
          <main
            className="flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6"
            role="status"
            aria-label="Validando sessão"
          >
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <SkeletonBlock className="h-6 w-40" />
              <SkeletonBlock className="h-4 w-64" />
              <SkeletonBlock className="h-12 w-full" rounded="xl" />
            </div>
          </main>
        ) : preAuthMaturity.maturityState === 'ESTADO_0' || !user ? (
          <AuthFlowView />
        ) : (
          <StudioApp key={user.id} user={user} />
        )}
      </ToastProvider>
    </MotionConfig>
  );
}

function StudioApp({ user }: { user: User }) {
  const { showToast } = useToast();
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [claimEmailModalOpen, setClaimEmailModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bannedReason, setBannedReason] = useState('');
  const inviteRedeemAttemptedRef = useRef(false);
  const [profileSnap, setProfileSnap] = useState<ProfileSnapshot | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetricsProjection | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<SidebarTab>('store');
  const [previewKind, setPreviewKind] = useState<PreviewKind>(() => readInitialPreviewKind());
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);

  // Global AI Notifications (TELA 38 / TELA 36 / TELA 37) + Archetype Composer (TELA 34)
  const notificationsState = useHighSaturationNotifications({
    owner: user?.id,
    enabled: Boolean(user?.id),
    pollIntervalMs: activeTab === 'whatsapp' ? 5000 : 18000,
  });

  // Modulos secundarios carregados sob demanda (sem bloquear boot ou travar PCs com pouca RAM)
  const [archetypeComposerOpen, setArchetypeComposerOpen] = useState(false);

  // Runtime WhatsApp state (Baileys worker + embedded Electron WebView identity)
  const [whatsapp, setWhatsapp] = useState<WhatsappDadosResponse | null>(null);
  const [browserWhatsapp, setBrowserWhatsapp] = useState<{
    connected: boolean;
    phoneE164: string;
  }>();
  const whatsappProfileSync = useRef('');

  // Onboarding state (TELA 01 Ignição + TELA 02 Síntese Real)
  const [onboardingStage, setOnboardingStage] = useState<'none' | 'ignition' | 'synthesis'>('none');
  const [ignitionDraftSnapshot, setIgnitionDraftSnapshot] =
    useState<Partial<IgnitionSubmissionPayload> | null>(null);
  const [synthesisCtx, setSynthesisCtx] = useState<{
    clientJobId: string;
    profile: BusinessProfile;
    seedProducts: CatalogProduct[];
    nicheSearchQuery?: string;
  } | null>(null);
  const [helpTopic, setHelpTopic] = useState<OnboardingHelpTopic | null>(null);
  const visitRecordedRef = useRef(false);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportReadonly, setSupportReadonly] = useState<SupportReadonlySession | null>(() =>
    getSupportReadonlySession(),
  );
  const [updateReadyVersion, setUpdateReadyVersion] = useState<string>('');

  useEffect(() => {
    const handleReadonlyChanged = (event: Event) => {
      const detail = (event as CustomEvent<SupportReadonlySession | null>).detail;
      setSupportReadonly(detail || null);
    };
    window.addEventListener('companygen:support-readonly-changed', handleReadonlyChanged);
    const bridge = getDesktopBridge();
    const unsubUpdater = bridge?.onUpdaterStatus?.((payload) => {
      if (payload?.status === 'downloaded') {
        setUpdateReadyVersion(payload.version || 'nova');
      }
    });
    return () => {
      window.removeEventListener('companygen:support-readonly-changed', handleReadonlyChanged);
      unsubUpdater?.();
    };
  }, []);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const qTheme = (qs.get('theme') || qs.get('cg_theme') || '').toLowerCase();
      if (qTheme === 'light') {
        localStorage.setItem('cg_theme', 'light');
        return false;
      }
      if (qTheme === 'dark') {
        localStorage.setItem('cg_theme', 'dark');
        return true;
      }
      const saved = localStorage.getItem('cg_theme');
      return saved === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', isDarkMode);
      localStorage.setItem('cg_theme', isDarkMode ? 'dark' : 'light');
      window.dispatchEvent(new CustomEvent('companygen:theme-change'));
    } catch {
      // Ignore storage access failures
    }
  }, [isDarkMode]);

  const handleLogout = useCallback(() => {
    setIsAdmin(false);
    setActiveTab('store');
    setProfileSnap(null);
    setSupportReadonlySession(null);
    clearLocalShowcaseSession();
    try {
      sessionStorage.removeItem('cg_validated_invite');
      sessionStorage.removeItem(`cg_welcome_dismissed_${user.id}`);
      sessionStorage.removeItem(`cg_post_onboarding_tips_${user.id}`);
      localStorage.removeItem(`cg_ignition_wizard_draft_${user.id}`);
      localStorage.removeItem(`cg_global_ai_msgs_${user.id}`);
      localStorage.removeItem('companygen_active_workspace_user');
    } catch {}
    void getDesktopBridge()?.setTrayStatus?.({
      active: false,
      phase: 'idle',
      summary: 'Sessão encerrada',
    });
    void supabase.auth.signOut({ scope: 'local' });
    try {
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.search = '?route=access';
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, [user.id]);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const data = await loadDashboardMetrics(user.id);
      setDashboard(data);
    } catch {
      // Keep previous dashboard snapshot on transient failure
    } finally {
      setDashboardLoading(false);
    }
  }, [user.id]);

  // Initial load: profile + dashboard
  useEffect(() => {
    let active = true;
    setLoadError('');

    loadBusinessProfile(user.id)
      .then((snap) => {
        if (!active) return;
        setProfileSnap(snap);

        if (snap.profile.onboarding.fichaCompleted && !visitRecordedRef.current) {
          visitRecordedRef.current = true;
          void recordStoreVisit(user.id);
        }
        void refreshDashboard();
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : 'Não foi possível carregar os dados da sua loja.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [user.id, loadVersion, refreshDashboard]);

  // Carrega saldo de créditos IA e resgata automaticamente código de acesso validado
  useEffect(() => {
    let active = true;

    async function syncInviteAndBalance() {
      const isGuest = isGuestAccountUser(user);
      if (!isGuest) {
        try {
          const pendingRaw =
            sessionStorage.getItem(PENDING_GUEST_CLAIM_KEY) ||
            localStorage.getItem(PENDING_GUEST_CLAIM_KEY);
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as { guestToken?: string; code?: string };
            if (pending?.guestToken || pending?.code) {
              const claimRes = await authenticatedFetch(
                '/api/access/claim-email',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    guestToken: pending.guestToken || '',
                    code: pending.code || '',
                  }),
                },
                user.id,
              );
              const claimJson = await claimRes.json().catch(() => null);
              if (claimRes.ok && claimJson?.ok) {
                sessionStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
                localStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
                sessionStorage.removeItem('cg_validated_invite');
                clearLocalShowcaseSession();
                if (active) {
                  if (typeof claimJson.balance === 'number') setCreditBalance(claimJson.balance);
                  setLoadVersion((v) => v + 1);
                  showToast({
                    type: 'success',
                    message: 'Loja convidada vinculada ao seu e-mail com sucesso!',
                    durationMs: 4500,
                  });
                }
              } else if (claimRes.status >= 400 && claimRes.status < 500) {
                sessionStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
                localStorage.removeItem(PENDING_GUEST_CLAIM_KEY);
              }
            }
          }
        } catch {}
      }

      let pendingInviteCode = '';
      try {
        const rawInvite = sessionStorage.getItem('cg_validated_invite');
        if (rawInvite) {
          const parsed = JSON.parse(rawInvite) as { code?: string };
          if (parsed && typeof parsed.code === 'string' && parsed.code.trim()) {
            pendingInviteCode = parsed.code.trim();
          }
        }
      } catch {
        // Ignore storage read failure
      }

      if (pendingInviteCode && !inviteRedeemAttemptedRef.current) {
        inviteRedeemAttemptedRef.current = true;
        try {
          const redeemRes = await authenticatedFetch(
            '/api/access/redeem',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: pendingInviteCode }),
            },
            user.id,
          );
          const redeemJson = await redeemRes.json().catch(() => null);
          if (redeemRes.ok && redeemJson?.success) {
            try {
              sessionStorage.removeItem('cg_validated_invite');
            } catch {}
            if (active) {
              if (typeof redeemJson.newBalance === 'number') {
                setCreditBalance(redeemJson.newBalance);
              }
              if (!redeemJson.alreadyRedeemed) {
                showToast({
                  type: 'success',
                  message: `Convite resgatado! +${redeemJson.creditsAdded || 0} créditos adicionados ao seu saldo.`,
                  durationMs: 4500,
                });
              }
            }
          } else if (redeemRes.status >= 400 && redeemRes.status < 500) {
            try {
              sessionStorage.removeItem('cg_validated_invite');
            } catch {}
          }
        } catch {
          // Allow retry on next mount if network failed
          inviteRedeemAttemptedRef.current = false;
        }
      }

      try {
        const balRes = await authenticatedFetch('/api/credits/balance', {}, user.id);
        if (balRes.ok && active) {
          const balJson = await balRes.json().catch(() => null);
          if (typeof balJson?.balance === 'number') {
            setCreditBalance(balJson.balance);
          }
        }
      } catch {
        // Ignore transient failure
      }

      try {
        setIsAdmin(false);
        const adminRes = await authenticatedFetch('/api/admin/status', {}, user.id);
        if (active) {
          if (adminRes.status === 403) {
            const errJson = await adminRes.json().catch(() => null);
            if (errJson?.code === 'ACCOUNT_BANNED' || errJson?.error === 'ACCOUNT_BANNED') {
              setBannedReason(
                String(errJson?.message || errJson?.reason || 'Sua conta foi suspensa pelo administrador.'),
              );
              return;
            }
          } else if (adminRes.ok) {
            const statusJson = await adminRes.json().catch(() => null);
            const verifiedUserEmail = String(user.email || statusJson?.email || '').trim().toLowerCase();
            const isStrictAdmin = Boolean(statusJson?.isAdmin) && verifiedUserEmail === 'arthurpolarbuy@gmail.com';
            setIsAdmin(isStrictAdmin);
            if (statusJson?.banned) {
              setBannedReason('Sua conta foi suspensa pelo administrador.');
            }
          }
        }
      } catch {
        // Ignore transient failure
      }
    }

    const onBalanceUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ balance?: number }>).detail;
      if (detail && typeof detail.balance === 'number') {
        setCreditBalance((prev) => (prev === detail.balance ? prev : detail.balance!));
      } else {
        void authenticatedFetch('/api/credits/balance', undefined, user.id)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (active && typeof j?.balance === 'number') {
              setCreditBalance((prev) => (prev === j.balance ? prev : j.balance));
            }
          })
          .catch(() => {});
      }
    };
    const onInsufficientCredits = (ev: Event) => {
      const detail = (ev as CustomEvent<{ required?: number; balance?: number }>).detail;
      showToast({
        type: 'error',
        message: `Saldo insuficiente (${detail?.balance ?? 0} cr disponíveis, necessário ${detail?.required ?? 0} cr). Recarregue em Planos IA.`,
        durationMs: 4500,
      });
    };
    const refreshLiveBalance = async () => {
      try {
        const balRes = await authenticatedFetch('/api/credits/balance', {}, user.id);
        if (balRes.ok && active) {
          const balJson = await balRes.json().catch(() => null);
          if (typeof balJson?.balance === 'number') {
            setCreditBalance((prev) => (prev === balJson.balance ? prev : balJson.balance));
          }
        }
      } catch {
        // Ignore transient failure
      }
    };

    let lastFocusRefresh = Date.now();
    const onWindowFocusRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFocusRefresh < 12000) return;
      lastFocusRefresh = Date.now();
      void refreshLiveBalance();
    };

    try {
      const arrivalParams = new URLSearchParams(window.location.search);
      const urlCredits = arrivalParams.get('credits');
      const urlBalance = arrivalParams.get('balance');
      const isRefundParam = arrivalParams.get('refund') === '1';
      if (urlCredits) {
        showToast({
          type: isRefundParam ? 'warning' : 'success',
          message: isRefundParam
            ? `Estorno processado (${urlCredits} cr). Saldo atual: ${urlBalance ?? 'atualizado'} créditos.`
            : `Créditos adicionados (+${urlCredits} cr)! Saldo atual: ${urlBalance ?? 'atualizado'} créditos.`,
          durationMs: 5000,
        });
        arrivalParams.delete('credits');
        arrivalParams.delete('balance');
        arrivalParams.delete('refund');
        const cleanedSearch = arrivalParams.toString();
        const nextUrl = `${window.location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {}

    window.addEventListener('companygen:credit-balance-updated', onBalanceUpdate);
    window.addEventListener('companygen:credits-updated', onBalanceUpdate);
    window.addEventListener('companygen:insufficient-credits', onInsufficientCredits);
    window.addEventListener('focus', onWindowFocusRefresh);
    document.addEventListener('visibilitychange', onWindowFocusRefresh);

    void syncInviteAndBalance();
    return () => {
      active = false;
      window.removeEventListener('companygen:credit-balance-updated', onBalanceUpdate);
      window.removeEventListener('companygen:credits-updated', onBalanceUpdate);
      window.removeEventListener('companygen:insufficient-credits', onInsufficientCredits);
      window.removeEventListener('focus', onWindowFocusRefresh);
      document.removeEventListener('visibilitychange', onWindowFocusRefresh);
    };
  }, [user.id, showToast]);

  // Poll WhatsApp worker status cleanly (single centralized source, pauses when hidden + backoff on error)
  const whatsappErrorStreakRef = useRef(0);
  const whatsappPollInFlightRef = useRef(false);
  const refreshWhatsappStatus = useCallback(async (): Promise<boolean> => {
    if (whatsappPollInFlightRef.current) return true;
    whatsappPollInFlightRef.current = true;
    try {
      const res = await authenticatedFetch('/api/whatsapp/api/dados', undefined, user.id);
      if (res.ok) {
        const json = (await res.json()) as WhatsappDadosResponse;
        setWhatsapp((prev) => {
          if (
            prev &&
            prev.conectado === json.conectado &&
            prev.status === json.status &&
            prev.numeroBot === json.numeroBot &&
            prev.qr === json.qr
          ) {
            return prev;
          }
          return json;
        });
        whatsappErrorStreakRef.current = 0;
        return true;
      }
    } catch {
      // Retry with exponential backoff
    } finally {
      whatsappPollInFlightRef.current = false;
    }
    whatsappErrorStreakRef.current = Math.min(4, whatsappErrorStreakRef.current + 1);
    return false;
  }, [user.id]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    whatsappErrorStreakRef.current = 0;

    const clearPollTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = (ok: boolean) => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const baseDelay = activeTab === 'whatsapp' ? 5000 : 15000;
      const delay = ok
        ? baseDelay
        : Math.min(30000, 5000 * Math.pow(2, Math.max(0, whatsappErrorStreakRef.current - 1)));
      clearPollTimer();
      timer = window.setTimeout(() => {
        void runPoll();
      }, delay);
    };

    async function runPoll() {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clearPollTimer();
        return;
      }
      const ok = await refreshWhatsappStatus();
      scheduleNext(ok);
    }

    const handleVisibilityOrFocus = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clearPollTimer();
      } else {
        clearPollTimer();
        void runPoll();
      }
    };

    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      void runPoll();
    }
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      active = false;
      clearPollTimer();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshWhatsappStatus]);

  // Sync detected WhatsApp identity (Baileys or Electron WebView) into BusinessProfile via updateBusinessProfile
  useEffect(() => {
    if (!profileSnap || (!whatsapp && !browserWhatsapp)) return;

    const savedWhatsapp = profileSnap.profile.whatsapp;
    const activeConnection = whatsapp?.conectado
      ? { conectado: true, numeroBot: whatsapp.numeroBot, origin: 'baileys' as const }
      : browserWhatsapp?.connected
        ? { conectado: true, numeroBot: browserWhatsapp.phoneE164, origin: 'webview' as const }
        : { conectado: false, numeroBot: '', origin: 'baileys' as const };
    if (!activeConnection.conectado) return;

    const connectedPhone = sanitizePhoneE164(activeConnection.numeroBot || '');
    const savedPhoneIsValid = isValidProductionPhone(savedWhatsapp.phoneE164);
    const needsSync =
      activeConnection.origin === 'webview'
        ? !savedWhatsapp.connected ||
          !savedPhoneIsValid ||
          savedWhatsapp.verifiedOrigin !== 'manual' ||
          Boolean(connectedPhone && connectedPhone !== savedWhatsapp.phoneE164)
        : !savedWhatsapp.connected ||
          !savedPhoneIsValid ||
          Boolean(connectedPhone && connectedPhone !== savedWhatsapp.phoneE164);

    if (!needsSync) return;

    const syncKey = `connected:${activeConnection.origin}:${connectedPhone || 'detecting'}`;
    if (whatsappProfileSync.current === syncKey) return;
    whatsappProfileSync.current = syncKey;

    void syncConnectedWhatsappProfile(activeConnection, user.id)
      .then((saved) => {
        setProfileSnap(saved);
        void refreshDashboard();
      })
      .catch(() => {
        // Polling retries automatically if worker profile is not ready yet
      })
      .finally(() => {
        if (whatsappProfileSync.current === syncKey) whatsappProfileSync.current = '';
      });
  }, [browserWhatsapp, profileSnap, user.id, whatsapp, refreshDashboard]);

  // Sync URL popstate for ?preview=vitrine / ?view=store
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setPreviewKind(readInitialPreviewKind());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const unsub = getDesktopBridge()?.onWhatsappTypingProgress?.((data) => {
      if (data?.navigateTab === 'whatsapp') {
        setActiveTab('whatsapp');
      }
    });
    return () => {
      unsub?.();
    };
  }, []);

  const runtimeStatus = useMemo<WhatsappRuntimeStatus | null>(() => {
    if (!whatsapp && !browserWhatsapp) return null;
    const isLive = Boolean(whatsapp?.conectado || browserWhatsapp?.connected);
    return {
      connected: isLive,
      conectado: isLive,
      qrPending: Boolean(whatsapp?.qr),
      qrCode: whatsapp?.qr || null,
      status: whatsapp?.status,
      numeroBot: whatsapp?.numeroBot || browserWhatsapp?.phoneE164 || '',
      phoneE164: browserWhatsapp?.phoneE164 || whatsapp?.numeroBot || '',
    };
  }, [whatsapp, browserWhatsapp]);

  const connectionPhaseInfo = useConnectionPhaseInfo(profileSnap?.profile, runtimeStatus);
  const maturity = useClientMaturity(user, profileSnap, {
    connectionPhase: connectionPhaseInfo.phase,
    runtimeStatus,
  });

  const openCheckoutRoute = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('route', 'checkout');
      window.history.pushState({}, '', url.toString());
    } catch {}
    window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
  }, []);

  const handleProfileUpdated = useCallback(
    (snap: ProfileSnapshot) => {
      setProfileSnap(snap);
      void refreshDashboard();
    },
    [refreshDashboard],
  );

  const enterPreview = useCallback((kind: Exclude<PreviewKind, null> = 'preview') => {
    setPreviewKind(kind);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('preview', 'vitrine');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore history errors
      }
    }
  }, []);

  const exitPreview = useCallback(() => {
    setPreviewKind(null);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('preview');
        url.searchParams.delete('view');
        url.searchParams.delete('u');
        url.searchParams.delete('loja');
        url.searchParams.delete('archetype');
        url.searchParams.delete('theme');
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore history errors
      }
    }
  }, []);

  const handleStartSynthesis = useCallback(
    async (payload: IgnitionSubmissionPayload) => {
      const savedSnap = await updateBusinessProfile(
        (draft) => {
          const alreadyOperational = Boolean(
            draft.onboarding?.storeGenerated ||
              draft.publishedStore?.published ||
              (draft.business?.name && (draft.catalog?.products?.length || 0) > 0),
          );
          draft.onboarding = {
            ...draft.onboarding,
            fichaCompleted: alreadyOperational ? Boolean(draft.onboarding?.fichaCompleted) : true,
            storeGenerated: alreadyOperational ? Boolean(draft.onboarding?.storeGenerated) : false,
          };
          draft.business = {
            ...draft.business,
            name: payload.businessName,
            segment: payload.segment,
            description: payload.description,
            ...(payload.address !== undefined ? { address: payload.address } : {}),
            ...(payload.goalText !== undefined ? { experienceGoal: payload.goalText } : {}),
          };
          draft.brand = {
            ...draft.brand,
            instagram: payload.instagramHandle || '',
            primaryColor: payload.primaryColor || draft.brand.primaryColor || '#09090B',
            accentColor: payload.accentColor || draft.brand.accentColor || '#2563EB',
            logoUrl: payload.logoUrl || draft.brand.logoUrl || '',
            ...(payload.storefrontPhotoUrl !== undefined ? { storefrontPhotoUrl: payload.storefrontPhotoUrl } : {}),
          };
          draft.whatsapp = {
            ...draft.whatsapp,
            phoneE164: payload.whatsappDigits,
            displayPhone: payload.whatsappDisplay,
            verifiedOrigin: 'manual',
          };
          draft.payment = {
            ...draft.payment,
            pixKey: payload.pixKey,
          };
          draft.catalog = {
            products: payload.importedProducts,
          };
          if (payload.marketingConcept) {
            draft.marketingConcept = {
              brandVoice: payload.marketingConcept.brandVoice,
              coreProductSku: payload.marketingConcept.coreProductSku,
              buyerPersona: payload.marketingConcept.buyerPersona,
              mainObjection: payload.marketingConcept.mainObjection,
              buyingTrigger: payload.marketingConcept.buyingTrigger,
              growthGoal: payload.marketingConcept.growthGoal,
              heroLayout: payload.marketingConcept.heroLayout,
              showcaseLayout: payload.marketingConcept.showcaseLayout,
              gridDensity: payload.marketingConcept.gridDensity,
              monthlyHooks: draft.marketingConcept?.monthlyHooks || [],
            };
          }
        },
        undefined,
        user.id,
      );

      handleProfileUpdated(savedSnap);
      try {
        window.sessionStorage.setItem(
          `cg_ignition_opts_${payload.clientJobId}`,
          JSON.stringify({
            layoutArchetype: payload.layoutArchetype,
            addons: payload.addons,
            briefAnswers: payload.briefAnswers,
            questionsJson: payload.questionsJson,
            estimatedCredits: payload.estimatedCredits,
            extraPages: payload.extraPages || [],
          }),
        );
      } catch {
        // Ignore sessionStorage restrictions
      }
      setIgnitionDraftSnapshot(payload);
      setSynthesisCtx({
        clientJobId: payload.clientJobId,
        profile: savedSnap.profile,
        seedProducts: payload.importedProducts,
        nicheSearchQuery: payload.nicheSearchQuery,
      });
      setOnboardingStage('synthesis');
    },
    [handleProfileUpdated, user.id],
  );

  const handleSynthesisCompleted = useCallback(
    (publishedSnap: ProfileSnapshot, result: GenerateFullStorefrontResponse) => {
      handleProfileUpdated(publishedSnap);
      if (typeof result.balanceAfter === 'number') {
        setCreditBalance(result.balanceAfter);
      }
      clearExpressFichaDraft(user.id);
      try {
        sessionStorage.setItem(`cg_post_onboarding_tips_${user.id}`, '1');
      } catch {}
      setOnboardingStage('none');
      setSynthesisCtx(null);
      setIgnitionDraftSnapshot(null);
      showToast({
        type: 'success',
        message: 'Vitrine publicada! Veja as sugestões da IA no painel para os próximos passos.',
        durationMs: 4200,
      });
      enterPreview('preview');
    },
    [enterPreview, handleProfileUpdated, showToast, user.id],
  );

  const handleSelectTab = useCallback(
    (tab: SidebarTab) => {
      if (tab === 'admin' && !isAdmin) return;
      recordTelemetryBreadcrumb('navigation', `Aba -> ${tab}`);
      setPreviewKind(null);
      setArchetypeComposerOpen(false);
      if (tab !== 'store') {
        setOnboardingStage('none');
      }
      if (tab === 'dashboard') {
        void refreshDashboard();
      }
      setActiveTab(tab);
    },
    [isAdmin, refreshDashboard],
  );

  useEffect(() => {
    const prof = profileSnap?.profile;
    updateTelemetryAppContext({
      activeTab,
      onboardingStep: onboardingStage !== 'none' ? onboardingStage : 'completed',
      storeName: prof?.business?.name || '',
      segment: prof?.business?.segment || '',
      productsCount: Array.isArray(prof?.catalog?.products) ? prof.catalog.products.length : 0,
      onboardingCompleted: Boolean(prof?.onboarding?.fichaCompleted),
      published: Boolean(prof?.publishedStore?.published),
      whatsappConnected: Boolean(whatsapp?.connected || browserWhatsapp?.connected),
    });
  }, [activeTab, browserWhatsapp?.connected, onboardingStage, profileSnap, whatsapp?.connected]);

  const hasDraft = useMemo(
    () => Boolean(readExpressFichaDraft(user.id) || ignitionDraftSnapshot),
    [user.id, ignitionDraftSnapshot],
  );
  const { isOffline } = useNetworkAndDraftGuard({
    isDirty: hasDraft,
    onSaveDraft: () => {
      showToast({
        type: 'neutral',
        message: 'Rascunho salvo localmente com segurança (Ctrl+S).',
        durationMs: 2500,
      });
    },
  });

  const pendingOrdersCount = useMemo(() => {
    const list = dashboard?.recentOrders ?? [];
    return list.filter(
      (o) => o.status === 'aguardando_dados' || o.status === 'aguardando_pagamento',
    ).length;
  }, [dashboard?.recentOrders]);

  // Error recovery fallback
  if (loadError) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-50 text-[#EF4444]">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-[#0F172A]">Não foi possível carregar sua loja</h1>
          <p role="alert" className="text-sm text-slate-600">
            {loadError}
          </p>
          <p className="text-xs text-slate-500">
            Sua conta continua protegida. Nenhum dado foi perdido.
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <ActionButton
              variant="primary"
              size={44}
              className="flex-1"
              leftIcon={<RefreshCw className="size-4" />}
              onClick={() => setLoadVersion((n) => n + 1)}
            >
              Recarregar dados
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              className="flex-1"
              leftIcon={<LogOut className="size-4" />}
              onClick={handleLogout}
            >
              Sair
            </ActionButton>
          </div>
        </div>
      </main>
    );
  }

  // Conta banida pelo administrador
  if (bannedReason) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-red-50 text-[#EF4444]">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-[#0F172A]">Acesso suspenso</h1>
          <p className="text-sm text-slate-600">{bannedReason}</p>
          <ActionButton
            variant="secondary"
            size={44}
            fullWidth
            leftIcon={<LogOut className="size-4" />}
            onClick={handleLogout}
          >
            Sair da conta
          </ActionButton>
        </div>
      </main>
    );
  }

  // Bootstrapping skeleton fallback (INV-02 safe loading state)
  if (maturity.isBootstrapping || !profileSnap) {
    return (
      <div className="flex min-h-dvh w-full bg-[#F8FAFC]">
        <aside className="hidden min-[769px]:flex w-[240px] shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4">
          <SkeletonBlock className="h-10 w-full" rounded="xl" />
          <div className="space-y-2 pt-2">
            <SkeletonBlock className="h-11 w-full" rounded="xl" />
            <SkeletonBlock className="h-11 w-full" rounded="xl" />
            <SkeletonBlock className="h-11 w-full" rounded="xl" />
            <SkeletonBlock className="h-11 w-full" rounded="xl" />
          </div>
        </aside>
        <main className="flex-1 p-6 space-y-6">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-44 w-full" rounded="xl" />
          <SkeletonTableRows rows={4} />
        </main>
      </div>
    );
  }

  const profile: BusinessProfile = profileSnap.profile;
  const revision = profileSnap.revision;
  const storeName = profile.business.name.trim() || 'Minha Loja';
  const isCatalogEmpty = maturity.isCatalogEmpty;
  const isStoreOperationReady =
    maturity.maturityState === 'ESTADO_3' || maturity.maturityState === 'ESTADO_4';
  const isDesktop = Boolean(getDesktopBridge()?.isDesktop);
  const showFullScreenOnboarding =
    !previewKind &&
    activeTab === 'store' &&
    (!isStoreOperationReady || onboardingStage === 'ignition' || onboardingStage === 'synthesis');
  const showEditorialStoreCanvas =
    !previewKind &&
    activeTab === 'store' &&
    isStoreOperationReady &&
    !archetypeComposerOpen &&
    onboardingStage === 'none';
  const showSharedFloatingTopPill =
    !previewKind &&
    isStoreOperationReady &&
    !showFullScreenOnboarding &&
    !archetypeComposerOpen &&
    (activeTab === 'store' || activeTab === 'whatsapp' || activeTab === 'dashboard' || activeTab === 'settings');
  const hideLegacyChrome = showFullScreenOnboarding || showEditorialStoreCanvas || showSharedFloatingTopPill;

  return (
    <div
      className={
        previewKind
          ? 'min-h-dvh w-full bg-[#F3F8FE] text-[#0F172A]'
          : 'flex h-dvh w-full overflow-hidden bg-[#F8FAFC] text-[#0F172A]'
      }
    >
      {previewKind !== 'public' ? (
        <HighSaturationNotificationBar
          notifications={notificationsState.notifications}
          waitingHumanCount={notificationsState.waitingHumanCount}
          isMuted={notificationsState.isMuted}
          muteRemainingMinutes={notificationsState.muteRemainingMinutes}
          notificationPermission={notificationsState.notificationPermission}
          onRequestMobilePermission={() => {
            void notificationsState.requestMobilePermission();
          }}
          onMute15Min={notificationsState.muteFor15Min}
          onUnmute={notificationsState.unmute}
          onAckEvent={(eventId, action, item) => {
            const act = action || 'ack';
            void notificationsState
              .ackNotification({
                eventId,
                customerPhone: item?.customerPhone || '',
                customerJid: item?.customerJid || '',
                action: act,
              })
              .then((res) => {
                if (!res?.ok) {
                  showToast({
                    type: 'error',
                    message: String(res?.error || 'Não foi possível concluir essa ação na fila do WhatsApp.'),
                  });
                  return;
                }
                if (act === 'resume_ai') {
                  showToast({
                    type: 'success',
                    message: 'Conversa devolvida para a IA Sofia com sucesso.',
                  });
                } else if (act === 'assume_human') {
                  showToast({
                    type: 'amber',
                    message: 'Conversa assumida por humano. A IA não responderá neste chat.',
                  });
                }
              });
          }}
          onOpenQueueDrawer={() => {
            if (previewKind) exitPreview();
            handleSelectTab('whatsapp');
          }}
          fixed
        />
      ) : null}

      <Suspense fallback={null}>
      {previewKind ? (
        <div
          data-testid="vitrine-overlay-persistent"
          className="relative z-50 min-h-dvh w-full bg-[#F3F8FE]"
        >
          <RouteErrorBoundary routeName="Prévia da Vitrine" onBack={exitPreview}>
          <CustomerStorefrontView
            profile={profile}
            ownerId={user.id}
            mode={previewKind}
            runtimeStatus={runtimeStatus}
            onBackToAdmin={exitPreview}
            onGoToOrders={() => {
              exitPreview();
              setActiveTab('dashboard');
            }}
            onProfileUpdated={handleProfileUpdated}
            onOrderCreated={() => void refreshDashboard()}
            onUploadProductImage={
              previewKind === 'preview'
                ? async (productId, file) => {
                    const dataUrl = await readImageFileAsDataUrl(file);
                    const snap = await updateBusinessProfile(
                      (draft) => {
                        const target = draft.catalog?.products?.find((p) => p.id === productId);
                        if (target) {
                          target.imageUrl = dataUrl;
                          target.approvedAsset = true;
                          target.updatedAt = new Date().toISOString();
                        }
                      },
                      undefined,
                      user.id,
                    );
                    handleProfileUpdated(snap);
                  }
                : undefined
            }
            onUploadBrandAsset={
              previewKind === 'preview'
                ? async (slot, file) => {
                    const dataUrl = await readImageFileAsDataUrl(file);
                    const snap = await updateBusinessProfile(
                      (draft) => {
                        draft.brand = {
                          instagram: draft.brand?.instagram || '',
                          logoUrl: draft.brand?.logoUrl || '',
                          storefrontPhotoUrl: draft.brand?.storefrontPhotoUrl || '',
                          heroImageUrl: draft.brand?.heroImageUrl || '',
                          heroBackgroundUrl: draft.brand?.heroBackgroundUrl || '',
                          pageBackgroundUrl: draft.brand?.pageBackgroundUrl || '',
                          sectionBackgrounds: { ...(draft.brand?.sectionBackgrounds || {}) },
                          primaryColor: draft.brand?.primaryColor || '#111827',
                          accentColor: draft.brand?.accentColor || '#10b981',
                          fontStyle: draft.brand?.fontStyle || 'modern_sans',
                          generateAiLogo: Boolean(draft.brand?.generateAiLogo),
                          themePreset: draft.brand?.themePreset || 'minimal-luxury',
                        };
                        if (slot === 'logoUrl') draft.brand.logoUrl = dataUrl;
                        else if (slot === 'heroImageUrl') draft.brand.heroImageUrl = dataUrl;
                        else if (slot === 'heroBackgroundUrl') draft.brand.heroBackgroundUrl = dataUrl;
                        else if (slot === 'pageBackgroundUrl') draft.brand.pageBackgroundUrl = dataUrl;
                        else if (slot.startsWith('section:')) {
                          const secId = slot.slice('section:'.length);
                          draft.brand.sectionBackgrounds[secId] = dataUrl;
                        }
                      },
                      undefined,
                      user.id,
                    );
                    handleProfileUpdated(snap);
                  }
                : undefined
            }
          />
          </RouteErrorBoundary>
        </div>
      ) : null}
      </Suspense>

      <div
        className="flex h-dvh w-full overflow-hidden"
        style={
          previewKind
            ? {
                visibility: 'hidden',
                pointerEvents: 'none',
                position: 'fixed',
                inset: 0,
                zIndex: -1,
              }
            : undefined
        }
      >
        {!hideLegacyChrome ? (
          <Sidebar
            storeName={storeName}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onOpenSupport={() => setSupportModalOpen(true)}
            connectionPhaseInfo={connectionPhaseInfo}
            pendingOrdersCount={pendingOrdersCount}
            waitingHumanCount={notificationsState.waitingHumanCount}
            isAdmin={isAdmin}
            onLogout={handleLogout}
            electronHealth={{
              isDesktop,
              trayActive: isDesktop,
              soundEnabled: !notificationsState.isMuted,
              updateReadyVersion,
              onInstallUpdate: () => {
                void getDesktopBridge()?.installDesktopUpdate?.();
              },
            }}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {!hideLegacyChrome ? (
          <>
            {/* Topbar 3 Zonas: Breadcrumb, Ctrl+K, Saldo Tabular, Ver Vitrine, Tema e Menu Ajuda (?) */}
            <Topbar
              storeName={storeName}
              activeTab={activeTab}
              creditBalance={creditBalance}
              isCatalogEmpty={isCatalogEmpty}
              isDarkMode={isDarkMode}
              isGuestSession={isGuestAccountUser(user)}
              onClaimGuestEmail={() => setClaimEmailModalOpen(true)}
              onToggleDarkMode={() => setIsDarkMode((v) => !v)}
              onOpenCheckout={openCheckoutRoute}
              onOpenPreview={() => enterPreview('preview')}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              onOpenSupport={() => setSupportModalOpen(true)}
              onOpenTour={() => {
                setActiveTab('store');
                setOnboardingStage('ignition');
              }}
            />
          </>
        ) : null}

        {/* Banner Sticky Modo Suporte Somente Leitura (40px --cg-error) */}
        {supportReadonly ? (
          <div
            role="status"
            data-testid="support-readonly-banner"
            className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-2 bg-[#E11D48] px-4 py-1.5 text-xs font-bold text-white"
          >
            <span className="truncate">
              Modo Suporte Somente Leitura ativo para: {supportReadonly.businessName || supportReadonly.userId} — alterações estão bloqueadas
            </span>
            <button
              type="button"
              data-testid="support-readonly-exit-btn"
              onClick={() => {
                setSupportReadonlySession(null);
                setActiveTab('admin');
              }}
              className="rounded-lg bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/30"
            >
              Sair do Modo Suporte
            </button>
          </div>
        ) : null}

        {/* Banner Offline não-destrutivo (36px) */}
        {isOffline ? (
          <div
            role="status"
            data-testid="network-offline-banner"
            className="flex min-h-[36px] shrink-0 items-center justify-center gap-2 border-b border-amber-300/70 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <WifiOff className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
            <span>
              Sem conexão com a internet — suas edições estão salvas como rascunho local e serão sincronizadas quando a rede voltar.
            </span>
          </div>
        ) : null}

        {/* Main Workspace Stage (extra bottom padding on mobile for 64px fixed bar) */}
        <main className={hideLegacyChrome ? 'flex-1 min-h-0 overflow-y-auto bg-[#F8FAFC]' : 'flex-1 min-h-0 overflow-y-auto pb-20 min-[769px]:pb-0'}>
          {showSharedFloatingTopPill ? (
            <FloatingTopPill
              activeTab={activeTab}
              onSelectTab={handleSelectTab}
              onOpenVitrine={() => enterPreview('preview')}
              isOnline={Boolean(profile.publishedStore?.published)}
              isAdmin={isAdmin}
              pendingOrdersCount={pendingOrdersCount}
              waitingHumanCount={notificationsState.waitingHumanCount}
              creditBalance={creditBalance}
              onOpenCheckout={openCheckoutRoute}
              onLogout={handleLogout}
            />
          ) : null}
          <RouteErrorBoundary
            routeName="Painel Principal"
            onBack={() => {
              setActiveTab('store');
              setOnboardingStage('none');
            }}
          >
          <Suspense fallback={<div className="p-6 text-xs text-slate-400">Carregando módulo...</div>}>
          {/* TAB 1: Minha Loja (Onboarding Tela Cheia ou Centro Editorial Imagem 1) */}
          {!previewKind && activeTab === 'store' &&
            (onboardingStage === 'synthesis' && synthesisCtx ? (
              <OnboardingSynthesisStage
                ownerId={user.id}
                clientJobId={synthesisCtx.clientJobId}
                initialProfile={synthesisCtx.profile}
                seedProducts={synthesisCtx.seedProducts}
                nicheSearchQuery={synthesisCtx.nicheSearchQuery}
                onCompleted={handleSynthesisCompleted}
                onBackToIgnition={() => {
                  setSynthesisCtx(null);
                  setOnboardingStage('ignition');
                }}
                onOpenCheckout={openCheckoutRoute}
              />
            ) : !isStoreOperationReady || onboardingStage === 'ignition' ? (
              <OnboardingIgnitionView
                profile={profile}
                ownerId={user.id}
                userEmail={user.email || ''}
                creditBalance={creditBalance}
                initialValues={ignitionDraftSnapshot}
                onStartSynthesis={handleStartSynthesis}
                onLogout={handleLogout}
                onOpenLogin={handleLogout}
                onCancelToStore={
                  isStoreOperationReady
                    ? () => {
                        setOnboardingStage('none');
                      }
                    : undefined
                }
              />
            ) : archetypeComposerOpen ? (
              <div className="h-full min-h-[70vh] w-full">
                <ArchetypeComposerView
                  profile={profile}
                  ownerId={user.id}
                  creditBalance={creditBalance}
                  onCreditBalanceChange={setCreditBalance}
                  onProfileUpdated={handleProfileUpdated}
                  onBackToDashboard={() => setArchetypeComposerOpen(false)}
                  onOpenPreviewScreen={() => {
                    setArchetypeComposerOpen(false);
                    enterPreview('preview');
                  }}
                />
              </div>
            ) : (
              <EditorialStoreControlView
                profile={profile}
                dashboard={dashboard}
                ownerId={user.id}
                whatsappConnected={connectionPhaseInfo.isLiveReady}
                pendingOrdersCount={pendingOrdersCount}
                waitingHumanCount={notificationsState.waitingHumanCount}
                creditBalance={creditBalance}
                hideTopPill={showSharedFloatingTopPill}
                isAdmin={isAdmin}
                onSelectTab={handleSelectTab}
                onOpenVitrine={() => enterPreview('preview')}
                onOpenArchetypeComposer={() => setArchetypeComposerOpen(true)}
                onOpenCheckout={openCheckoutRoute}
                onRedoOnboarding={() => setOnboardingStage('ignition')}
                onProfileUpdated={handleProfileUpdated}
                onLogout={handleLogout}
              />
            ))}

          {/* TAB 2: WhatsApp (montado em background apenas no Desktop Electron ou quando aberto no Web) */}
          {isDesktop || activeTab === 'whatsapp' ? (
          <div
            data-testid="whatsapp-persistent-mount"
            aria-hidden={activeTab !== 'whatsapp' || Boolean(previewKind)}
            className="flex h-full min-h-0 flex-col"
            style={
              activeTab === 'whatsapp' && !previewKind
                ? undefined
                : {
                    position: 'fixed',
                    left: '-12000px',
                    top: 0,
                    width: '1024px',
                    height: '768px',
                    visibility: 'hidden',
                    contain: 'strict',
                    opacity: 0.01,
                    pointerEvents: 'none',
                    zIndex: -1,
                  }
            }
          >
            {activeTab === 'whatsapp' && !isStoreOperationReady ? (
              <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-[#EFF6FF] px-4 py-3 text-sm text-[#1D4ED8] sm:mx-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                  <span>
                    Finalize os dados iniciais em <strong>Minha Loja</strong> para colocar sua vitrine online enquanto conecta seu WhatsApp.
                  </span>
                </div>
                <ActionButton
                  variant="primary"
                  size={44}
                  onClick={() => setActiveTab('store')}
                >
                  Ir para Minha Loja
                </ActionButton>
              </div>
            ) : null}

            <div className="flex-1 min-h-0">
              <WhatsAppConnectionView
                userId={user.id}
                profile={profile}
                whatsappData={whatsapp}
                onRefresh={refreshWhatsappStatus}
                onStatusChange={setWhatsapp}
                onBrowserIdentity={setBrowserWhatsapp}
                notificationState={notificationsState}
                onNavigateOrders={() => handleSelectTab('dashboard')}
              />
            </div>
          </div>
          ) : null}

          {/* TAB 3: Pedidos */}
          {activeTab === 'dashboard' && (
            <div className="h-full min-h-0">
              {!isStoreOperationReady ? (
                <div className="p-4 sm:p-8">
                  <EmptyStateCard
                    icon={<ShoppingBag className="size-7" />}
                    title="Seus pedidos aparecerão aqui"
                    description="Complete os dados iniciais da loja em Minha Loja para liberar o painel de pedidos e vendas."
                    ctaLabel="Completar Minha Loja"
                    onCta={() => {
                      setActiveTab('store');
                      setOnboardingStage('ignition');
                    }}
                  />
                </div>
              ) : (
                <OrdersKanbanView
                  profile={profile}
                  revision={revision}
                  dashboard={dashboard}
                  d1Funnel={notificationsState.d1Funnel}
                  owner={user.id}
                  loading={dashboardLoading}
                  storeUrl={buildStorePublicUrl(profile, user.id)}
                  onRefresh={refreshDashboard}
                  onDashboardChange={setDashboard}
                />
              )}
            </div>
          )}

          {/* TAB 4: Ajustes */}
          {activeTab === 'settings' && (
            <SettingsView
              profile={profile}
              owner={user.id}
              ownerEmail={user.email}
              creditBalance={creditBalance}
              runtimeStatus={runtimeStatus}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((v) => !v)}
              onProfileUpdated={handleProfileUpdated}
              onStoreReset={() => {
                setArchetypeComposerOpen(false);
                setPreviewKind(null);
                setSynthesisCtx(null);
                setActiveTab('store');
                setOnboardingStage('ignition');
              }}
              onOpenCheckout={openCheckoutRoute}
              onLogout={handleLogout}
              onOpenExpressWizard={() => {
                setActiveTab('store');
                setOnboardingStage('ignition');
              }}
              onOpenWhatsApp={() => setActiveTab('whatsapp')}
              onOpenPreview={() => enterPreview('preview')}
              onOpenWelcome={() => {
                setActiveTab('store');
                setOnboardingStage('ignition');
              }}
              onOpenHelp={(topic) => setHelpTopic(topic ?? 'general')}
            />
          )}

          {/* TAB 5: Admin Desktop */}
          {activeTab === 'admin' && isAdmin && (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <AdminConsoleView
                userId={user.id}
                onEnterSupportMode={() => {
                  setActiveTab('store');
                }}
              />
            </div>
          )}
          </Suspense>
          </RouteErrorBoundary>
        </main>
        </div>
      </div>

      <ContextualHelpModal
        open={helpTopic !== null}
        onOpenChange={(open) => {
          if (!open) setHelpTopic(null);
        }}
        topic={helpTopic ?? 'general'}
      />

      {!hideLegacyChrome ? (
        <CommandPaletteModal
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          isAdmin={isAdmin}
          isDarkMode={isDarkMode}
          isCatalogEmpty={isCatalogEmpty}
          products={(profile.catalog?.products ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            priceCents: p.priceCents,
          }))}
          onSelectTab={handleSelectTab}
          onOpenCheckout={openCheckoutRoute}
          onOpenPreview={() => enterPreview('preview')}
          onOpenSupport={() => setSupportModalOpen(true)}
          onToggleDarkMode={() => setIsDarkMode((v) => !v)}
          onOpenTour={() => {
            setActiveTab('store');
            setOnboardingStage('ignition');
          }}
          onLogout={handleLogout}
        />
      ) : null}

      <SupportTicketModal
        open={supportModalOpen}
        onOpenChange={setSupportModalOpen}
        userId={user.id}
        storeName={storeName}
      />

      {isGuestAccountUser(user) ? (
        <GuestClaimEmailModal
          open={claimEmailModalOpen}
          onOpenChange={setClaimEmailModalOpen}
          guestToken={readLocalShowcaseSession()?.token || ''}
          inviteCode={readLocalShowcaseSession()?.code || ''}
          currentCredits={creditBalance}
          storeName={storeName !== 'Minha Loja' ? storeName : undefined}
          onClaimed={({ balance }) => {
            if (typeof balance === 'number') setCreditBalance(balance);
            setLoadVersion((v) => v + 1);
          }}
        />
      ) : null}

      {!previewKind ? (
        <GlobalAiAssistantWidget
          userId={user.id}
          activeTab={activeTab}
          isOnboarding={showFullScreenOnboarding}
          storeName={storeName}
          creditBalance={creditBalance}
          onOpenSupport={() => setSupportModalOpen(true)}
          onNavigateTab={(tab) => handleSelectTab(tab)}
          onRefreshData={() => {
            setLoadVersion((v) => v + 1);
            void refreshDashboard();
          }}
        />
      ) : null}
    </div>
  );
}
