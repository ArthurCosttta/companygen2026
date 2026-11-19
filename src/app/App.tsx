import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
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
  readLocalShowcaseSession,
  setSupportReadonlySession,
  supabase,
  toSupabaseUserFromShowcase,
  type SupportReadonlySession,
} from '@/services/supabase-client';
import { syncConnectedWhatsappProfile } from '@/services/whatsapp-profile-sync';
import { AuthFlowView } from '@/components/auth/AuthFlowView';
import {
  CommandPaletteModal,
  Sidebar,
  Topbar,
  type SidebarTab,
} from '@/components/shell';
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
import {
  buildDraftFromProfile,
  ContextualHelpModal,
  ExpressFichaWizardModal,
  GuidedChecklistCard,
  readExpressFichaDraft,
  StoreCreatedSuccessModal,
  WelcomeModal,
  writeExpressFichaDraft,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from '@/components/views/onboarding';
import { ArchetypeComposerView } from '@/components/views/studio';
import {
  buildStorePublicUrl,
  CustomerStorefrontView,
  ProductCatalogTable,
  readImageFileAsDataUrl,
} from '@/components/views/storefront';
import {
  WhatsAppConnectionView,
  type WhatsappDadosResponse,
} from '@/components/views/whatsapp';
import { OrdersKanbanView } from '@/components/views/orders';
import { SettingsView } from '@/components/views/settings';
import { AccessCodeView } from '@/components/views/access/AccessCodeView';
import { AdminConsoleView } from '@/components/views/admin/AdminConsoleView';
import { CheckoutPlansView } from '@/components/views/checkout/CheckoutPlansView';
import { getDesktopBridge } from '@/hooks/useWebviewWhatsappResponder';
import { runWithFichaModalLayout } from '@/utils/fichaModalLayout';

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
    if (/^AI10-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(codeParam)) {
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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [publicProfile, setPublicProfile] = useState<BusinessProfile | null>(null);

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
        const res = await fetch(
          `/api/store-molde/${encodeURIComponent(lookupKey)}/data/formulas-ir.json`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          throw new Error('Vitrine não encontrada ou ainda não publicada.');
        }
        const irData = (await res.json()) as Record<string, unknown>;
        if (!active) return;

        const storeInfo = (irData?.storeInfo || {}) as Record<string, unknown>;
        const designTokens = (irData?.designTokens || irData?.themeTokens || {}) as Record<string, unknown>;
        const catalogList = Array.isArray(irData?.catalog) ? irData.catalog : [];
        const base = createEmptyProfile();
        const rawModel = String(storeInfo.businessModel || '');
        const businessModel =
          rawModel === 'produtos' || rawModel === 'servicos' || rawModel === 'hibrido' || rawModel === 'sob_medida'
            ? rawModel
            : 'hibrido';

        const hydratedBase = BusinessProfileSchema.parse({
          ...base,
          business: {
            ...base.business,
            name: String(storeInfo.name || 'Vitrine Online'),
            segment: String(storeInfo.segment || 'Geral'),
            businessModel,
            description: String(storeInfo.description || ''),
            address: String(storeInfo.address || ''),
            hours: String(storeInfo.hours || ''),
          },
          brand: {
            ...base.brand,
            logoUrl: String(storeInfo.logoUrl || ''),
            storefrontPhotoUrl: String(storeInfo.storefrontPhotoUrl || ''),
            primaryColor:
              typeof designTokens.accent === 'string' && designTokens.accent
                ? designTokens.accent
                : base.brand.primaryColor,
            accentColor:
              typeof designTokens.accent === 'string' && designTokens.accent
                ? designTokens.accent
                : base.brand.accentColor,
          },
          whatsapp: {
            ...base.whatsapp,
            connected: Boolean(storeInfo.whatsappE164),
            phoneE164: String(storeInfo.whatsappE164 || ''),
            displayPhone: String(storeInfo.whatsappE164 || ''),
          },
          payment: {
            ...base.payment,
            pixDiscountPercent: Number(storeInfo.pixDiscountPercent || 0) || 0,
          },
          catalog: {
            products: catalogList,
          },
          publishedStore: {
            ...base.publishedStore,
            published: true,
            publicSlug: targetSlug || lookupKey,
          },
          storeLayout: {
            ...base.storeLayout,
            formulasIr: irData,
          },
        });
        const sanitizedIr = sanitizeFormulaV9Document(irData, hydratedBase);
        const hydrated: BusinessProfile = {
          ...hydratedBase,
          storeLayout: {
            ...hydratedBase.storeLayout,
            formulasIr: sanitizedIr,
          },
        };
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
  }, [lookupKey, targetSlug]);

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
      <CustomerStorefrontView
        profile={publicProfile}
        ownerId={lookupKey}
        mode="public"
      />
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

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('cg_theme');
      const shouldDark =
        saved === 'dark' ||
        (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', Boolean(shouldDark));
      window.dispatchEvent(new CustomEvent('companygen:theme-change'));
    } catch {
      // Ignore storage access failures
    }
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
  );
}

function StudioApp({ user }: { user: User }) {
  const { showToast } = useToast();
  const [creditBalance, setCreditBalance] = useState<number>(0);
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
  });
  const [archetypeComposerOpen, setArchetypeComposerOpen] = useState(false);

  // Runtime WhatsApp state (Baileys worker + embedded Electron WebView identity)
  const [whatsapp, setWhatsapp] = useState<WhatsappDadosResponse | null>(null);
  const [browserWhatsapp, setBrowserWhatsapp] = useState<{
    connected: boolean;
    phoneE164: string;
  }>();
  const whatsappProfileSync = useRef('');

  // Onboarding modals state
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<OnboardingWizardStep>(1);
  const [helpTopic, setHelpTopic] = useState<OnboardingHelpTopic | null>(null);
  const [successModalState, setSuccessModalState] = useState<{
    open: boolean;
    storeName: string;
    publicSlug?: string;
    productsCount: number;
  }>({
    open: false,
    storeName: '',
    productsCount: 0,
  });
  const initialWelcomeCheckedRef = useRef(false);
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
      const saved = localStorage.getItem('cg_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
    clearLocalShowcaseSession();
    void supabase.auth.signOut({ scope: 'local' });
  }, []);

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
            setIsAdmin(Boolean(statusJson?.isAdmin));
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
        setCreditBalance(detail.balance);
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
            setCreditBalance(balJson.balance);
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
        setWhatsapp(json);
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
      const delay = ok
        ? 5000
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

  // Open WelcomeModal automatically on first visit when in ESTADO_1 (not dismissed in this session)
  useEffect(() => {
    if (maturity.isBootstrapping || !profileSnap || initialWelcomeCheckedRef.current) return;
    initialWelcomeCheckedRef.current = true;

    if (maturity.maturityState === 'ESTADO_1' && !previewKind) {
      try {
        const dismissed = sessionStorage.getItem(`cg_welcome_dismissed_${user.id}`) === '1';
        if (!dismissed) {
          setWelcomeOpen(true);
        }
      } catch {
        setWelcomeOpen(true);
      }
    }
  }, [maturity.isBootstrapping, maturity.maturityState, previewKind, profileSnap, user.id]);

  const dismissWelcomeRemember = useCallback(
    (open: boolean) => {
      setWelcomeOpen(open);
      if (!open) {
        try {
          sessionStorage.setItem(`cg_welcome_dismissed_${user.id}`, '1');
        } catch {
          // Ignore storage errors
        }
      }
    },
    [user.id],
  );

  const openWizard = useCallback((step: OnboardingWizardStep = 1) => {
    runWithFichaModalLayout(() => {
      setWizardStep(step);
      setWizardOpen(true);
    });
  }, []);

  const handleWizardOpenChange = useCallback((nextOpen: boolean) => {
    runWithFichaModalLayout(() => {
      setWizardOpen(nextOpen);
    });
  }, []);

  const handleProfileUpdated = useCallback(
    (snap: ProfileSnapshot) => {
      setProfileSnap(snap);
      void refreshDashboard();
    },
    [refreshDashboard],
  );

  const handlePublishStore = useCallback(async () => {
    const snap = await updateBusinessProfile(
      (draft) => {
        draft.onboarding.fichaCompleted = true;
        draft.onboarding.storeGenerated = true;
        draft.publishedStore = {
          ...draft.publishedStore,
          published: true,
        };
      },
      { publish: true },
      user.id,
    );
    handleProfileUpdated(snap);
    const activeCount = (snap.profile.catalog?.products ?? []).filter((p) => p.active !== false).length;
    setSuccessModalState({
      open: true,
      storeName: snap.profile.business.name || 'Minha Loja',
      publicSlug: snap.profile.publishedStore?.publicSlug,
      productsCount: activeCount,
    });
  }, [handleProfileUpdated, user.id]);

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

  const handleSelectTab = useCallback(
    (tab: SidebarTab) => {
      setPreviewKind(null);
      setArchetypeComposerOpen(false);
      if (tab === 'dashboard') {
        void refreshDashboard();
      }
      setActiveTab(tab);
    },
    [refreshDashboard],
  );

  const hasDraft = useMemo(() => Boolean(readExpressFichaDraft(user.id)), [user.id, wizardOpen]);
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
              fullWidth
              leftIcon={<RefreshCw className="size-4" />}
              onClick={() => setLoadVersion((n) => n + 1)}
            >
              Recarregar dados
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              fullWidth
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

  return (
    <div
      className={
        previewKind
          ? 'min-h-dvh w-full bg-[#F3F8FE] text-[#0F172A]'
          : 'flex h-dvh w-full overflow-hidden bg-[#F8FAFC] text-[#0F172A]'
      }
    >
      {previewKind ? (
        <div
          data-testid="vitrine-overlay-persistent"
          className="relative z-50 min-h-dvh w-full bg-[#F3F8FE]"
        >
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
        </div>
      ) : null}

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
        <Sidebar
          storeName={storeName}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          connectionPhaseInfo={connectionPhaseInfo}
          pendingOrdersCount={pendingOrdersCount}
          waitingHumanCount={notificationsState.waitingHumanCount}
          isAdmin={isAdmin}
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

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Centro de Notificações Estilo Celular (2 estados: principal + fila expansível + som imediato) */}
        <HighSaturationNotificationBar
          notifications={notificationsState.notifications}
          waitingHumanCount={notificationsState.waitingHumanCount}
          onAckEvent={(eventId, action) => {
            void notificationsState.ackNotification({ eventId, action: action || 'ack' });
          }}
          onOpenQueueDrawer={() => handleSelectTab('whatsapp')}
          fixed
        />

        {/* Topbar 3 Zonas: Breadcrumb, Ctrl+K, Saldo Tabular, Ver Vitrine, Tema e Menu Ajuda (?) */}
        <Topbar
          storeName={storeName}
          activeTab={activeTab}
          creditBalance={creditBalance}
          isCatalogEmpty={isCatalogEmpty}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((v) => !v)}
          onOpenCheckout={() => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('route', 'checkout');
              window.history.pushState({}, '', url.toString());
            } catch {}
            window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
          }}
          onOpenPreview={() => enterPreview('preview')}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenSupport={() => setSupportModalOpen(true)}
          onOpenTour={() => setWelcomeOpen(true)}
        />

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
        <main className="flex-1 min-h-0 overflow-y-auto pb-20 min-[769px]:pb-0">
          {/* TAB 1: Minha Loja */}
          {!previewKind && activeTab === 'store' &&
            (archetypeComposerOpen && isStoreOperationReady ? (
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
              <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
                <GuidedChecklistCard
                  profile={profile}
                  maturityState={maturity.maturityState}
                  connectionPhase={connectionPhaseInfo.phase}
                  owner={user.id}
                  hasDraft={hasDraft}
                  isWizardOpen={wizardOpen}
                  onOpenExpressWizard={openWizard}
                  onOpenProductStep={() => openWizard(7)}
                  onOpenPixStep={() => openWizard(8)}
                  onPublishStore={handlePublishStore}
                  onStorePublished={(snap) => {
                    handleProfileUpdated(snap);
                    const activeCount = (snap.profile.catalog?.products ?? []).filter(
                      (p) => p.active !== false,
                    ).length;
                    setSuccessModalState({
                      open: true,
                      storeName: snap.profile.business.name || 'Minha Loja',
                      publicSlug: snap.profile.publishedStore?.publicSlug,
                      productsCount: activeCount,
                    });
                  }}
                  onConnectWhatsapp={() => setActiveTab('whatsapp')}
                  onOpenStorefront={() => enterPreview('preview')}
                  onOpenHelp={(topic) => setHelpTopic(topic ?? 'general')}
                />

                {isStoreOperationReady ? (
                  <ProductCatalogTable
                    profile={profile}
                    revision={revision}
                    owner={user.id}
                    runtimeStatus={runtimeStatus}
                    onProfileUpdated={handleProfileUpdated}
                    onOpenCustomerPreview={() => enterPreview('preview')}
                    onOpenSettings={() => setActiveTab('settings')}
                    onOpenWhatsApp={() => setActiveTab('whatsapp')}
                    onOpenArchetypeComposer={() => setArchetypeComposerOpen(true)}
                  />
                ) : null}
              </div>
            ))}

          {/* TAB 2: WhatsApp (mantido montado permanentemente sem desmontar ao alternar para Vitrine ou outras abas) */}
          <div
            data-testid="whatsapp-persistent-mount"
            aria-hidden={activeTab !== 'whatsapp' || Boolean(previewKind)}
            className="flex h-full min-h-0 flex-col"
            style={
              activeTab === 'whatsapp' && !previewKind
                ? undefined
                : {
                    visibility: 'hidden',
                    pointerEvents: 'none',
                    position: 'fixed',
                    inset: 0,
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
              {isDesktop || activeTab === 'whatsapp' ? (
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
              ) : null}
            </div>
          </div>

          {/* TAB 3: Pedidos */}
          {activeTab === 'dashboard' && (
            <div className="h-full min-h-0">
              {!isStoreOperationReady ? (
                <div className="p-4 sm:p-8">
                  <EmptyStateCard
                    icon={<ShoppingBag className="size-7" />}
                    title="Seus pedidos aparecerão aqui"
                    description="Complete os dados iniciais da loja e cadastre pelo menos 1 produto em Minha Loja para liberar o painel de pedidos e vendas manuais."
                    ctaLabel="Completar Minha Loja"
                    onCta={() => setActiveTab('store')}
                    secondaryLabel="Abrir Assistente Guiado"
                    onSecondary={() => openWizard(1)}
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
              runtimeStatus={runtimeStatus}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((v) => !v)}
              onProfileUpdated={handleProfileUpdated}
              onLogout={handleLogout}
              onOpenExpressWizard={openWizard}
              onOpenWhatsApp={() => setActiveTab('whatsapp')}
              onOpenPreview={() => enterPreview('preview')}
              onOpenWelcome={() => setWelcomeOpen(true)}
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
        </main>
        </div>
      </div>

      {/* Onboarding & Help Modals (TELA 01..12) */}
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={dismissWelcomeRemember}
        storeName={profile.business.name}
        ownerEmail={user.email}
        hasDraft={hasDraft}
        initialTrack={profile.onboarding?.preferredTrack ?? 'full_guided'}
        onSelectTrack={(track) => {
          dismissWelcomeRemember(false);
          const existingDraft = readExpressFichaDraft(user.id) || buildDraftFromProfile(profile, 1);
          writeExpressFichaDraft({ ...existingDraft, preferredTrack: track }, user.id);
          void updateBusinessProfile(
            (draft) => {
              draft.onboarding.preferredTrack = track;
            },
            undefined,
            user.id,
          )
            .then(handleProfileUpdated)
            .catch(() => {});
          if (track === 'whatsapp_first') {
            setActiveTab('whatsapp');
          } else {
            setActiveTab('store');
          }
        }}
        onStartExpressWizard={() => {
          dismissWelcomeRemember(false);
          setActiveTab('store');
        }}
        onContinueDraft={() => {
          dismissWelcomeRemember(false);
          setActiveTab('store');
        }}
        onExploreFirst={() => dismissWelcomeRemember(false)}
        onOpenHelp={() => setHelpTopic('general')}
      />

      <ExpressFichaWizardModal
        open={wizardOpen}
        onOpenChange={handleWizardOpenChange}
        profile={profile}
        owner={user.id}
        initialStep={wizardStep}
        onProfileUpdated={handleProfileUpdated}
        onCompleted={(snap, meta) => {
          handleProfileUpdated(snap);
          if (meta.published) {
            const activeCount = (snap.profile.catalog?.products ?? []).filter(
              (p) => p.active !== false,
            ).length;
            setSuccessModalState({
              open: true,
              storeName: snap.profile.business.name || 'Minha Loja',
              publicSlug: snap.profile.publishedStore?.publicSlug,
              productsCount: activeCount,
            });
          }
        }}
      />

      <ContextualHelpModal
        open={helpTopic !== null}
        onOpenChange={(open) => {
          if (!open) setHelpTopic(null);
        }}
        topic={helpTopic ?? 'general'}
      />

      <StoreCreatedSuccessModal
        open={successModalState.open}
        onOpenChange={(open) =>
          setSuccessModalState((prev) => ({ ...prev, open }))
        }
        storeName={successModalState.storeName}
        publicSlug={successModalState.publicSlug}
        ownerId={user.id}
        whatsappConnected={connectionPhaseInfo.isLiveReady}
        productsCount={successModalState.productsCount}
        primaryColor={profile.brand?.primaryColor}
        accentColor={profile.brand?.accentColor}
        logoUrl={profile.brand?.logoUrl}
        onOpenStorefront={() => {
          setSuccessModalState((prev) => ({ ...prev, open: false }));
          enterPreview('preview');
        }}
        onSimulateFirstOrder={() => {
          setSuccessModalState((prev) => ({ ...prev, open: false }));
          enterPreview('preview');
        }}
        onConnectWhatsapp={() => {
          setSuccessModalState((prev) => ({ ...prev, open: false }));
          setActiveTab('whatsapp');
        }}
        onContinueToPanel={() => {
          setSuccessModalState((prev) => ({ ...prev, open: false }));
          setActiveTab('store');
        }}
      />

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
        onOpenCheckout={() => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('route', 'checkout');
            window.history.pushState({}, '', url.toString());
          } catch {}
          window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
        }}
        onOpenPreview={() => enterPreview('preview')}
        onOpenSupport={() => setSupportModalOpen(true)}
        onToggleDarkMode={() => setIsDarkMode((v) => !v)}
        onOpenTour={() => setWelcomeOpen(true)}
      />

      <SupportTicketModal
        open={supportModalOpen}
        onOpenChange={setSupportModalOpen}
        userId={user.id}
        storeName={storeName}
      />
    </div>
  );
}
