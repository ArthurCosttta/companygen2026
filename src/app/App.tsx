import { useState, useEffect, useRef } from 'react';
import type { CampaignSpec } from '@/schemas/campaign.schema';
import {
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import { loadWorkspace, updateWorkspace, setWorkspaceUser } from '@/services/local-storage';
import {
  loadBusinessProfile,
  loadDashboardMetrics,
  recordStoreVisit,
  saveBusinessProfile,
  simulateWhatsappFlow,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { syncConnectedWhatsappProfile } from '@/services/whatsapp-profile-sync';
import { Sidebar, menuTitles } from '@/components/Sidebar';
import { AuthFlowView } from '@/components/auth/AuthFlowView';
import { FichaWizardView } from '@/components/views/FichaWizardView';
import { StoreV5Pane } from '@/components/views/StoreV5Pane';
import { WhatsAppView } from '@/components/views/WhatsAppView';
import { DashboardView } from '@/components/views/DashboardView';
import { SettingsView } from '@/components/views/SettingsView';
import { GenerationLoader } from '@/store-v5/components/studio/GenerationLoader';
import { authenticatedFetch, supabase } from '@/services/supabase-client';
import type { User } from '@supabase/supabase-js';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  BarChart3,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Store as StoreIcon,
  Sun,
  X,
} from 'lucide-react';

type WhatsAppGlobal = {
  conectado: boolean;
  status: string;
  numeroBot?: string;
  contatos?: unknown[];
  conversas?: Array<{ mensagensTotal?: number }>;
  skus?: unknown[];
  persistencia?: { provider: 'supabase' | 'servidor'; syncedAt?: string | null; error?: string | null };
};

export function App() {
  const [user, setUser] = useState<User | null>();
  const verifiedId = useRef('');

  useEffect(() => {
    let active = true;
    let version = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (user === undefined) return <main className="cg-center" role="status">Validando sessão…</main>;
  if (!user) return <AuthFlowView />;
  return <StudioApp key={user.id} user={user} />;
}

function StudioApp({ user }: { user: User }) {
  const [campaignSpec, setCampaignSpec] = useState<CampaignSpec | null>(null);
  const [profileSnap, setProfileSnap] = useState<ProfileSnapshot | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetricsProjection | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [activeMenu, setActiveMenu] = useState<'connect' | 'ficha' | 'store' | 'whatsapp' | 'messages' | 'dual' | 'dashboard' | 'settings'>('store');
  const [openPanes, setOpenPanes] = useState<{ store: boolean; whatsapp: boolean }>({ store: true, whatsapp: true });
  const [generatingInfo, setGeneratingInfo] = useState<{ active: boolean; storeName: string; promptText: string }>({
    active: false,
    storeName: '',
    promptText: '',
  });
  const [dualBanner, setDualBanner] = useState('');
  const [whatsappRefreshKey, setWhatsappRefreshKey] = useState(0);

  const [mobileMenu, setMobileMenu] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [whatsapp, setWhatsapp] = useState<WhatsAppGlobal>();
  const [browserWhatsapp, setBrowserWhatsapp] = useState<{ connected: boolean; phoneE164: string }>();
  const whatsappProfileSync = useRef('');

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
    } catch {}
  }, [isDarkMode]);

  const handleLogout = () => { void supabase.auth.signOut({ scope: 'local' }); };
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  async function refreshDashboard() {
    setDashboardLoading(true);
    try {
      const data = await loadDashboardMetrics(user.id);
      setDashboard(data);
    } catch {} finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoadError('');
    Promise.all([
      loadWorkspace(user.id),
      loadBusinessProfile(user.id),
    ]).then(([{ data }, snap]) => {
      if (!active) return;
      const fallbackSpec: CampaignSpec = data.campaigns?.at(-1) || {
        schema_version: '1.0.0',
        brand: {
          id: 'brand',
          name: snap.profile.business.name || 'Minha loja',
          segment: snap.profile.business.segment || 'Geral',
          colors: { primary: snap.profile.brand.primaryColor, background: '#f1f3ef', text: '#152927' },
        },
        campaign: {
          id: 'studio',
          name: 'Operação Loja e WhatsApp',
          start_date: today(),
          duration_days: 30,
          timezone: 'America/Sao_Paulo',
          platform: 'instagram',
        },
        products: [],
        posts: [],
      };
      setCampaignSpec(fallbackSpec);
      setProfileSnap(snap);

      // O catálogo vem primeiro. O WhatsApp é conectado somente depois que a
      // pessoa termina a ficha e consegue visualizar a loja gerada.
      if (!snap.profile.onboarding.fichaCompleted) {
        setActiveMenu('ficha');
      } else {
        setActiveMenu('store');
        void recordStoreVisit(user.id);
      }
      void refreshDashboard();
    }).catch(err => {
      if (active) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o CompanyGen.');
    });
    return () => { active = false; };
  }, [user.id, loadVersion]);

  useEffect(() => {
    let active = true;
    let timer: number;
    async function pollWhatsapp() {
      try {
        const res = await authenticatedFetch('/api/whatsapp/api/dados', undefined, user.id);
        if (res.ok && active) setWhatsapp(await res.json());
      } catch {}
      if (active) timer = window.setTimeout(pollWhatsapp, 5000);
    }
    void pollWhatsapp();
    return () => { active = false; window.clearTimeout(timer); };
  }, [user.id]);

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
    const needsSync = activeConnection.origin === 'webview'
      ? !savedPhoneIsValid
        || savedWhatsapp.verifiedOrigin !== 'manual'
        || Boolean(connectedPhone && connectedPhone !== savedWhatsapp.phoneE164)
        || savedWhatsapp.connected
      : !savedWhatsapp.connected
        || !savedPhoneIsValid
        || Boolean(connectedPhone && connectedPhone !== savedWhatsapp.phoneE164);

    if (!needsSync) return;

    const syncKey = `connected:${activeConnection.origin}:${connectedPhone || 'detecting'}`;
    if (whatsappProfileSync.current === syncKey) return;
    whatsappProfileSync.current = syncKey;

    void syncConnectedWhatsappProfile(activeConnection, user.id)
      .then(saved => {
        setProfileSnap(saved);
        void refreshDashboard();
      })
      .catch(() => {
        // O polling tentará novamente quando o worker terminar de expor o perfil.
      })
      .finally(() => {
        if (whatsappProfileSync.current === syncKey) whatsappProfileSync.current = '';
      });
  }, [browserWhatsapp, profileSnap, user.id, whatsapp]);

  async function handleSaveFichaAndGenerate(nextProfile: BusinessProfile) {
    if (!profileSnap) return;
    const saved = await saveBusinessProfile(profileSnap.revision, nextProfile, undefined, user.id);
    setProfileSnap(saved);
    if (campaignSpec) {
      setCampaignSpec({
        ...campaignSpec,
        brand: { ...campaignSpec.brand, name: saved.profile.business.name || campaignSpec.brand.name },
      });
    }
    setGeneratingInfo({
      active: true,
      storeName: saved.profile.business.name || 'Minha Loja',
      promptText: `Ficha rev.${saved.revision} · ${saved.profile.catalog.products.length} produtos · WhatsApp ${saved.profile.whatsapp.displayPhone || saved.profile.whatsapp.phoneE164} · Fluxos A/B + 50 moldes`,
    });
    void recordStoreVisit(user.id);
    void refreshDashboard();
  }

  async function handlePublishStore() {
    if (!profileSnap) return;
    const nextProfile: BusinessProfile = {
      ...structuredClone(profileSnap.profile),
      publishedStore: {
        ...profileSnap.profile.publishedStore,
        published: true,
      },
    };
    const saved = await saveBusinessProfile(profileSnap.revision, nextProfile, { publish: true }, user.id);
    setProfileSnap(saved);
    void refreshDashboard();
  }

  async function handleSimulateCheckout(message: string) {
    const result = await simulateWhatsappFlow(message, {
      nomeCliente: 'Cliente Teste (Site V5)',
    }, user.id);
    setOpenPanes({ store: true, whatsapp: true });
    setWhatsappRefreshKey(k => k + 1);
    setDualBanner(
      result?.order
        ? `Pedido ${result.order.order_ref} criado no Fluxo A! Confira a resposta no WhatsApp e o indicador no Dashboard.`
        : 'Mensagem enviada para a Sofia no WhatsApp.',
    );
    void refreshDashboard();
  }

  async function renameBrand(name: string): Promise<boolean> {
    if (!profileSnap) return false;
    const clean = name.trim();
    if (!clean) return false;
    try {
      const nextProfile: BusinessProfile = {
        ...structuredClone(profileSnap.profile),
        business: {
          ...profileSnap.profile.business,
          name: clean,
        },
      };
      const saved = await saveBusinessProfile(profileSnap.revision, nextProfile, undefined, user.id);
      setProfileSnap(saved);
      await updateWorkspace(data => {
        const c = data.campaigns?.at(-1);
        if (c) c.brand.name = clean;
      }, user.id).catch(() => {});
      if (campaignSpec) {
        setCampaignSpec({ ...campaignSpec, brand: { ...campaignSpec.brand, name: clean } });
      }
      void refreshDashboard();
      return true;
    } catch {
      return false;
    }
  }

  if (loadError) {
    return (
      <main className="cg-center">
        <p role="alert">{loadError}</p>
        <small>Sua conta continua protegida. Nenhum dado de outro usuário é carregado.</small>
        <button className="cg-primary" onClick={() => setLoadVersion(n => n + 1)}>Tentar novamente</button>
        <button className="cg-secondary" onClick={handleLogout}>Sair</button>
      </main>
    );
  }

  if (!campaignSpec || !profileSnap) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F7FAFF]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#0867E8] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#0B1D52] font-semibold text-[14px]">Carregando CompanyGen...</span>
        </div>
      </div>
    );
  }

  // T3: Automated SOF Genome V5 Composer transition (without ChatComposer)
  if (generatingInfo.active) {
    return (
      <div className="min-h-screen bg-[#081946] flex items-center justify-center p-6">
        <GenerationLoader
          storeName={generatingInfo.storeName}
          promptText={generatingInfo.promptText}
          durationMs={1200}
          onComplete={() => {
            setGeneratingInfo({ active: false, storeName: '', promptText: '' });
            setActiveMenu('store');
            setOpenPanes({ store: true, whatsapp: true });
          }}
        />
      </div>
    );
  }

  // Primeiro passo: Ficha + Produtos. O WhatsApp vem depois da Loja.
  if (activeMenu === 'ficha') {
    return (
      <FichaWizardView
        initialProfile={profileSnap.profile}
        revision={profileSnap.revision}
        onSaveAndGenerate={handleSaveFichaAndGenerate}
        onBackToDual={profileSnap.profile.onboarding.fichaCompleted ? () => setActiveMenu('store') : undefined}
      />
    );
  }

  const profile = profileSnap.profile;
  const revision = profileSnap.revision;
  const displayTitle = profile.business.name || campaignSpec.brand.name || 'CompanyGen';
  const onboardingCompleted = Boolean(profile.onboarding.fichaCompleted);
  // A sessão do navegador serve para descobrir o destino da loja. Somente o
  // worker Baileys responde mensagens automaticamente; não misture os estados.
  const workerConnected = Boolean(whatsapp?.conectado);
  const browserConnected = Boolean(browserWhatsapp?.connected);
  const storePhoneReady = isValidProductionPhone(profile.whatsapp.phoneE164);
  const navigate = (menu: string) => {
    setMobileMenu(false);
    if (menu === 'store' || menu === 'whatsapp' || menu === 'messages' || menu === 'dual' || menu === 'dashboard' || menu === 'ficha' || menu === 'connect' || menu === 'settings') {
      if (menu === 'dashboard') void refreshDashboard();
      setActiveMenu(menu);
    }
  };

  return (
    <div className="cg-shell">
      <div className={'cg-nav-wrap' + (mobileMenu ? ' cg-nav-open' : '')}>
        <Sidebar
          brand={{ ...campaignSpec.brand, name: displayTitle }}
          activeMenu={activeMenu}
          onSelectMenu={navigate}
          whatsappConnected={workerConnected}
          onboardingCompleted={onboardingCompleted}
        />
      </div>

      <Sheet open={mobileMenu} onOpenChange={setMobileMenu}>
        <SheetContent side="left" className="p-0 w-72">
          <Sidebar
            brand={{ ...campaignSpec.brand, name: displayTitle }}
            activeMenu={activeMenu}
            onSelectMenu={navigate}
            whatsappConnected={workerConnected}
            onboardingCompleted={onboardingCompleted}
          />
        </SheetContent>
      </Sheet>

      <div className="cg-stage">
        <header className="cg-topbar">
          <div className="cg-topbar-title">
            <button
              type="button"
              className="cg-icon cg-mobile-menu"
              aria-label="Abrir navegação"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu(v => !v)}
            >
              <Menu size={20} />
            </button>
            <h1>{activeMenu === 'dual' ? `${displayTitle} · Loja e WhatsApp` : menuTitles[activeMenu] || displayTitle}</h1>
          </div>

          <div className="cg-topbar-actions flex-wrap">
            <button
              type="button"
              data-testid="topbar-toggle-store"
              onClick={() => setActiveMenu('store')}
              className={`cg-topbar-shortcut inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                activeMenu === 'store'
                  ? 'bg-[#0867E8] text-white border-[#0867E8]'
                  : 'bg-white text-[#0B1D52] border-[#DCE8F7] hover:bg-[#EAF2FF]'
              }`}
            >
              <StoreIcon size={14} />
              Loja
            </button>

            <button
              type="button"
              data-testid="topbar-toggle-whatsapp"
              onClick={() => setActiveMenu('whatsapp')}
              className={`cg-topbar-shortcut inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                activeMenu === 'whatsapp'
                  ? 'bg-[#008E2D] text-white border-[#008E2D]'
                  : 'bg-white text-[#0B1D52] border-[#DCE8F7] hover:bg-[#DFFBE6]'
              }`}
            >
              <MessageSquare size={14} />
              WhatsApp
            </button>

            <button
              type="button"
              data-testid="topbar-open-dual"
              onClick={() => {
                setOpenPanes({ store: true, whatsapp: true });
                setActiveMenu('dual');
              }}
              className={`cg-topbar-shortcut inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                activeMenu === 'dual'
                  ? 'bg-[#0B1D52] text-white border-[#0B1D52]'
                  : 'bg-white text-[#0B1D52] border-[#DCE8F7] hover:bg-[#F3F7FD]'
              }`}
            >
              Loja e WhatsApp
            </button>

            <button
              type="button"
              data-testid="topbar-open-dashboard"
              onClick={() => {
                void refreshDashboard();
                setActiveMenu('dashboard');
              }}
              className={`cg-topbar-shortcut inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                activeMenu === 'dashboard'
                  ? 'bg-[#0B1D52] text-white border-[#0B1D52]'
                  : 'bg-white text-[#0B1D52] border-[#DCE8F7] hover:bg-[#F3F7FD]'
              }`}
            >
              <BarChart3 size={14} /> Dashboard
            </button>

            <button
              type="button"
              className="cg-icon"
              title="Alternar tema"
              aria-label="Alternar tema"
              onClick={() => setIsDarkMode(v => !v)}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="cg-secondary cg-logout" title="Sair da conta e entrar com outro e-mail" aria-label="Sair da conta e entrar com outro e-mail" onClick={handleLogout}>
              <LogOut size={18} /> Trocar conta
            </button>
          </div>
        </header>

        <div className="cg-workspace flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F7FAFF]">
          {activeMenu === 'store' && (
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
              {dualBanner && (
                <div className="px-4 py-2 rounded-xl bg-[#DFFBE6] border border-emerald-200 text-[#008E2D] text-xs font-bold flex items-center justify-between shrink-0">
                  <span>{dualBanner}</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setActiveMenu('whatsapp')} className="underline font-extrabold">Abrir WhatsApp</button>
                    <button type="button" onClick={() => setDualBanner('')} className="font-extrabold">✕</button>
                  </div>
                </div>
              )}
              <StoreV5Pane
                profile={profile}
                revision={revision}
                whatsappConnected={storePhoneReady}
                onConnectWhatsapp={() => setActiveMenu('whatsapp')}
                onClosePane={() => setActiveMenu('whatsapp')}
                onPublishStore={handlePublishStore}
                onSimulateCheckout={handleSimulateCheckout}
                onEditFicha={() => setActiveMenu('ficha')}
              />
            </div>
          )}

          {(activeMenu === 'whatsapp' || activeMenu === 'messages') && (
            <div className="flex-1 min-h-0 flex flex-col overflow-auto bg-white">
              <WhatsAppView
                key={whatsappRefreshKey}
                userId={user.id}
                onStatusChange={setWhatsapp}
                onBrowserIdentity={setBrowserWhatsapp}
                initialTab={activeMenu === 'messages' ? 'messages' : 'inbox'}
              />
            </div>
          )}

          {activeMenu === 'dual' && (
            <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
              {dualBanner && (
                <div className="px-4 py-2 rounded-xl bg-[#DFFBE6] border border-emerald-200 text-[#008E2D] text-xs font-bold flex items-center justify-between shrink-0">
                  <span>{dualBanner}</span>
                  <button type="button" onClick={() => setDualBanner('')} className="ml-4 font-extrabold">✕</button>
                </div>
              )}

              {!openPanes.store && !openPanes.whatsapp ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-white border border-[#DCE8F7] rounded-3xl p-8 text-center">
                  <h2 className="text-xl font-extrabold text-[#0B1D52]">Os dois navegadores foram recolhidos</h2>
                  <p className="text-sm text-[#64748B] mt-1 mb-5">Reabra a Loja V5, o WhatsApp Aberto ou vá direto para o Dashboard.</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenPanes({ store: true, whatsapp: false })}
                      className="px-4 py-2 rounded-xl bg-[#0867E8] text-white font-bold text-sm"
                    >
                      Reabrir Loja V5
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenPanes({ store: false, whatsapp: true })}
                      className="px-4 py-2 rounded-xl bg-[#008E2D] text-white font-bold text-sm"
                    >
                      Reabrir WhatsApp
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="dual-browser-grid"
                  className={`flex-1 min-h-0 grid gap-3 ${
                    openPanes.store && openPanes.whatsapp ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {openPanes.store && (
                    <StoreV5Pane
                      profile={profile}
                      revision={revision}
                      whatsappConnected={storePhoneReady}
                      onConnectWhatsapp={() => setActiveMenu('whatsapp')}
                      onClosePane={() => setOpenPanes(p => ({ ...p, store: false }))}
                      onPublishStore={handlePublishStore}
                      onSimulateCheckout={handleSimulateCheckout}
                      onEditFicha={() => setActiveMenu('ficha')}
                    />
                  )}

                  {openPanes.whatsapp && (
                    <div
                      data-testid="dual-pane-whatsapp"
                      className="flex flex-col h-full bg-white border border-[#DCE8F7] rounded-2xl overflow-hidden shadow-[0_7px_23px_rgba(11,29,82,0.06)]"
                    >
                      <div className="px-3.5 py-2.5 bg-[#F3F7FD] border-b border-[#DCE8F7] flex items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare className="w-4 h-4 text-[#008E2D] shrink-0" />
                          <span className="text-xs font-extrabold text-[#0B1D52] truncate">
                            NAVEGADOR 2 · WhatsApp Aberto ({profile.whatsapp.displayPhone || profile.whatsapp.phoneE164 || 'Conecte'})
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            browserConnected ? 'bg-[#DFFBE6] text-[#008E2D]' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {browserConnected ? '● Navegador online' : '● Abra para detectar'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenPanes(p => ({ ...p, whatsapp: false }))}
                          aria-label="Fechar navegador do WhatsApp"
                          data-testid="close-whatsapp-pane"
                          className="w-8 h-8 rounded-lg border border-[#DCE8F7] bg-white hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-[#64748B] font-bold"
                          title="Fechar navegador do WhatsApp (expande Loja para 100%)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        <WhatsAppView
                          key={whatsappRefreshKey}
                          userId={user.id}
                          onStatusChange={setWhatsapp}
                          onBrowserIdentity={setBrowserWhatsapp}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeMenu === 'dashboard' && (
            <div className="flex-1 min-h-0 overflow-auto">
              <DashboardView
                profile={profile}
                revision={revision}
                dashboard={dashboard}
                workerConnected={workerConnected}
                loading={dashboardLoading}
                onRefresh={() => void refreshDashboard()}
                onBackToDual={() => setActiveMenu('store')}
                onEditFicha={() => setActiveMenu('ficha')}
              />
            </div>
          )}

          {activeMenu === 'settings' && (
            <div className="flex-1 min-h-0 overflow-auto p-6">
              <SettingsView
                brand={{ ...campaignSpec.brand, name: displayTitle }}
                isDarkMode={isDarkMode}
                onBrandUpdate={renameBrand}
                onLogout={handleLogout}
                onEditFicha={() => setActiveMenu('ficha')}
                onOpenConnect={() => setActiveMenu('whatsapp')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
