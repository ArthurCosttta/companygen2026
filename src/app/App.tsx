import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Eye,
  LogOut,
  Moon,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { CampaignSpec } from '@/schemas/campaign.schema';
import {
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import {
  useClientMaturity,
} from '@/hooks/useClientMaturity';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import { loadWorkspace, setWorkspaceUser } from '@/services/local-storage';
import {
  loadBusinessProfile,
  loadDashboardMetrics,
  recordStoreVisit,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { authenticatedFetch, supabase } from '@/services/supabase-client';
import { syncConnectedWhatsappProfile } from '@/services/whatsapp-profile-sync';
import { AuthFlowView } from '@/components/auth/AuthFlowView';
import {
  Sidebar,
  SIDEBAR_TITLES,
  type SidebarTab,
} from '@/components/shell';
import {
  ActionButton,
  EmptyStateCard,
  SkeletonBlock,
  SkeletonTableRows,
  ToastProvider,
} from '@/components/ui';
import {
  ContextualHelpModal,
  ExpressFichaWizardModal,
  GuidedChecklistCard,
  readExpressFichaDraft,
  StoreCreatedSuccessModal,
  WelcomeModal,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from '@/components/views/onboarding';
import {
  buildStorePublicUrl,
  CustomerStorefrontView,
  ProductCatalogTable,
} from '@/components/views/storefront';
import {
  WhatsAppConnectionView,
  type WhatsappDadosResponse,
} from '@/components/views/whatsapp';
import { OrdersKanbanView } from '@/components/views/orders';
import { SettingsView } from '@/components/views/settings';
import { runWithFichaModalLayout } from '@/utils/fichaModalLayout';

type PreviewKind = 'preview' | 'public' | null;

function readInitialPreviewKind(): PreviewKind {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'vitrine') return 'preview';
    if (params.get('view') === 'store') return 'public';
  } catch {
    // Ignore malformed query strings
  }
  return null;
}

export function App() {
  const [user, setUser] = useState<User | null>();
  const verifiedId = useRef('');

  useEffect(() => {
    let active = true;
    let version = 0;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const check = ++version;
      if (!session) {
        verifiedId.current = '';
        setWorkspaceUser('');
        setUser(null);
        return;
      }
      if (event !== 'TOKEN_REFRESHED' && session.user.id !== verifiedId.current) {
        setWorkspaceUser('');
        setUser(undefined);
      }
      window.setTimeout(async () => {
        const { data, error } = await supabase.auth.getUser(session.access_token);
        if (!active || check !== version) return;
        const verified = error ? null : data.user;
        verifiedId.current = verified?.id || '';
        setWorkspaceUser(verified?.id || '');
        setUser(verified);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ESTADO_0 / Validating session wrapped in ToastProvider
  const preAuthMaturity = useClientMaturity(user ?? null, null);

  return (
    <ToastProvider>
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
  const [campaignSpec, setCampaignSpec] = useState<CampaignSpec | null>(null);
  const [profileSnap, setProfileSnap] = useState<ProfileSnapshot | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetricsProjection | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<SidebarTab>('store');
  const [previewKind, setPreviewKind] = useState<PreviewKind>(() => readInitialPreviewKind());
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);

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
    } catch {
      // Ignore storage access failures
    }
  }, [isDarkMode]);

  const handleLogout = useCallback(() => {
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

  // Initial load: workspace + profile + dashboard
  useEffect(() => {
    let active = true;
    setLoadError('');
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    Promise.all([loadWorkspace(user.id), loadBusinessProfile(user.id)])
      .then(([{ data }, snap]) => {
        if (!active) return;
        const fallbackSpec: CampaignSpec = data.campaigns?.at(-1) || {
          schema_version: '1.0.0',
          brand: {
            id: 'brand',
            name: snap.profile.business.name || 'Minha loja',
            segment: snap.profile.business.segment || 'Geral',
            colors: {
              primary: snap.profile.brand.primaryColor,
              background: '#f1f3ef',
              text: '#152927',
            },
          },
          campaign: {
            id: 'studio',
            name: 'Operação Loja e WhatsApp',
            start_date: today,
            duration_days: 30,
            timezone: 'America/Sao_Paulo',
            platform: 'instagram',
          },
          products: [],
          posts: [],
        };
        setCampaignSpec(fallbackSpec);
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

  // Poll WhatsApp worker status cleanly
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function pollWhatsapp() {
      try {
        const res = await authenticatedFetch('/api/whatsapp/api/dados', undefined, user.id);
        if (res.ok && active) {
          const json = (await res.json()) as WhatsappDadosResponse;
          setWhatsapp(json);
        }
      } catch {
        // Retry on next interval
      }
      if (active) {
        timer = window.setTimeout(pollWhatsapp, 5000);
      }
    }
    void pollWhatsapp();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [user.id]);

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
        ? !savedPhoneIsValid ||
          savedWhatsapp.verifiedOrigin !== 'manual' ||
          Boolean(connectedPhone && connectedPhone !== savedWhatsapp.phoneE164) ||
          savedWhatsapp.connected
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

  const runtimeStatus = useMemo<WhatsappRuntimeStatus | null>(() => {
    if (!whatsapp && !browserWhatsapp) return null;
    return {
      connected: Boolean(whatsapp?.conectado),
      conectado: Boolean(whatsapp?.conectado),
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
      if (campaignSpec) {
        setCampaignSpec({
          ...campaignSpec,
          brand: {
            ...campaignSpec.brand,
            name: snap.profile.business.name || campaignSpec.brand.name,
          },
        });
      }
      void refreshDashboard();
    },
    [campaignSpec, refreshDashboard],
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
        window.history.replaceState({}, '', url.toString());
      } catch {
        // Ignore history errors
      }
    }
  }, []);

  const handleSelectTab = useCallback(
    (tab: SidebarTab) => {
      setPreviewKind(null);
      if (tab === 'dashboard') {
        void refreshDashboard();
      }
      setActiveTab(tab);
    },
    [refreshDashboard],
  );

  const hasDraft = useMemo(() => Boolean(readExpressFichaDraft(user.id)), [user.id, wizardOpen]);

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
  const storeName = profile.business.name.trim() || campaignSpec?.brand.name || 'Minha Loja';
  const isCatalogEmpty = maturity.isCatalogEmpty;
  const isStoreOperationReady =
    maturity.maturityState === 'ESTADO_3' || maturity.maturityState === 'ESTADO_4';

  // Customer Storefront Preview / Public Store Mode (?preview=vitrine or ?view=store)
  if (previewKind) {
    return (
      <div className="min-h-dvh bg-[#F8FAFC]">
        <CustomerStorefrontView
          profile={profile}
          ownerId={user.id}
          mode={previewKind}
          onBackToAdmin={exitPreview}
          onOrderCreated={() => void refreshDashboard()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      <Sidebar
        storeName={storeName}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        connectionPhaseInfo={connectionPhaseInfo}
        pendingOrdersCount={pendingOrdersCount}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Clean Topbar */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-bold tracking-tight text-[#0F172A]">
              {SIDEBAR_TITLES[activeTab]}
            </h1>

            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
              title={connectionPhaseInfo.labelPT}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: connectionPhaseInfo.colorHex }}
              />
              <span className="truncate max-w-[230px]">{connectionPhaseInfo.labelPT}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isCatalogEmpty ? (
              <ActionButton
                variant="softBlue"
                size={44}
                leftIcon={<Eye className="size-4" />}
                onClick={() => enterPreview('preview')}
                data-testid="topbar-preview-vitrine"
              >
                <span className="hidden sm:inline">Ver Vitrine</span>
                <span className="sm:hidden">Vitrine</span>
              </ActionButton>
            ) : null}

            <button
              type="button"
              onClick={() => setIsDarkMode((v) => !v)}
              aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={isDarkMode ? 'Modo claro' : 'Modo escuro'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {isDarkMode ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </button>
          </div>
        </header>

        {/* Main Workspace Stage (extra bottom padding on mobile for 64px fixed bar) */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-20 min-[769px]:pb-0">
          {/* TAB 1: Minha Loja */}
          {activeTab === 'store' && (
            <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
              {maturity.maturityState !== 'ESTADO_4' ? (
                <GuidedChecklistCard
                  profile={profile}
                  maturityState={maturity.maturityState}
                  connectionPhase={connectionPhaseInfo.phase}
                  owner={user.id}
                  hasDraft={hasDraft}
                  isWizardOpen={wizardOpen}
                  onOpenExpressWizard={openWizard}
                  onOpenProductStep={() => openWizard(2)}
                  onOpenPixStep={() => openWizard(3)}
                  onPublishStore={handlePublishStore}
                  onStorePublished={handleProfileUpdated}
                  onConnectWhatsapp={() => setActiveTab('whatsapp')}
                  onOpenStorefront={() => enterPreview('preview')}
                  onOpenHelp={(topic) => setHelpTopic(topic ?? 'general')}
                />
              ) : null}

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
                />
              ) : null}
            </div>
          )}

          {/* TAB 2: WhatsApp */}
          {activeTab === 'whatsapp' && (
            <div className="flex h-full min-h-0 flex-col">
              {!isStoreOperationReady ? (
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
                  onStatusChange={setWhatsapp}
                  onBrowserIdentity={setBrowserWhatsapp}
                />
              </div>
            </div>
          )}

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
        </main>
      </div>

      {/* Onboarding & Help Modals (TELA 01..12) */}
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={dismissWelcomeRemember}
        storeName={profile.business.name}
        ownerEmail={user.email}
        hasDraft={hasDraft}
        onStartExpressWizard={() => {
          dismissWelcomeRemember(false);
          openWizard(1);
        }}
        onContinueDraft={() => {
          dismissWelcomeRemember(false);
          openWizard(1);
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
        onOpenStorefront={() => {
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
    </div>
  );
}
