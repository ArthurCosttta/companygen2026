import { memo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MessageSquare, RefreshCw } from 'lucide-react';
import { getDesktopBridge, type DesktopWhatsappBridge } from '@/hooks/useWebviewWhatsappResponder';

function desktopBridge(): DesktopWhatsappBridge | undefined {
  return getDesktopBridge();
}

export const RealWhatsAppWeb = memo(function RealWhatsAppWeb({
  userId,
  connected,
  onOpenConnection,
  onIdentity,
}: {
  userId: string;
  connected: boolean;
  onOpenConnection: () => void;
  onIdentity?: (identity: { connected: boolean; phoneE164: string }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const webview = useRef<(HTMLElement & {
    goBack: () => void; goForward: () => void; reload: () => void;
    canGoBack: () => boolean; canGoForward: () => boolean;
  }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [error, setError] = useState('');
  const bridge = desktopBridge();

  useEffect(() => {
    if (!bridge || !host.current) return;
    const element = document.createElement('webview') as typeof webview.current;
    if (!element) return;
    element.className = 'cg-real-whatsapp-webview';
    element.setAttribute('src', 'https://web.whatsapp.com/');
    element.setAttribute('partition', `persist:companygen-wa-${userId.replace(/[^a-zA-Z0-9-]/g, '')}`);
    const updateNavigation = () => {
      try {
        setCanBack(element.canGoBack());
        setCanForward(element.canGoForward());
      } catch {
        setCanBack(false);
        setCanForward(false);
      }
    };
    const start = () => { setLoading(true); setError(''); };
    const stop = () => { setLoading(false); updateNavigation(); };
    const failed = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string };
      if (detail.errorCode === -3) return;
      setLoading(false);
      setError(detail.errorDescription || 'Não foi possível carregar o WhatsApp Web.');
    };
    element.addEventListener('did-start-loading', start);
    element.addEventListener('did-stop-loading', stop);
    element.addEventListener('did-navigate', updateNavigation);
    element.addEventListener('did-navigate-in-page', updateNavigation);
    element.addEventListener('did-fail-load', failed);
    host.current.replaceChildren(element);
    webview.current = element;
    return () => {
      element.removeEventListener('did-start-loading', start);
      element.removeEventListener('did-stop-loading', stop);
      element.removeEventListener('did-navigate', updateNavigation);
      element.removeEventListener('did-navigate-in-page', updateNavigation);
      element.removeEventListener('did-fail-load', failed);
      element.remove();
      webview.current = null;
    };
  }, [bridge, userId]);

  useEffect(() => {
    if (!bridge?.readWhatsAppIdentity || !onIdentity) return;
    const readIdentity = bridge.readWhatsAppIdentity;
    const reportIdentity = onIdentity;
    const BACKOFF_DELAYS = [900, 2500, 5000] as const;
    let live = true;
    let lastReportKey = '';
    let errorStreak = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function detectIdentity() {
      let nextDelay = 900;
      try {
        const identity = await readIdentity();
        errorStreak = 0;
        if (live) {
          const isConnected = Boolean(identity?.connected && (identity?.loggedIn ?? true));
          nextDelay = isConnected ? 3500 : 900;
          const phone = identity?.phoneE164 || '';
          const nextKey = `${isConnected}:${phone}`;
          if (nextKey !== lastReportKey) {
            lastReportKey = nextKey;
            reportIdentity({ connected: isConnected, phoneE164: phone });
          }
        }
      } catch (err) {
        const idx = Math.min(BACKOFF_DELAYS.length - 1, errorStreak);
        nextDelay = BACKOFF_DELAYS[idx];
        if (errorStreak === 0) {
          console.warn('[RealWhatsAppWeb] Falha ao ler identidade do WebView:', err);
        }
        errorStreak += 1;
      }
      if (live) timer = setTimeout(detectIdentity, nextDelay);
    }
    void detectIdentity();
    return () => { live = false; clearTimeout(timer); };
  }, [bridge, onIdentity]);

  if (!bridge) {
    return (
      <div className="cg-real-whatsapp-fallback mx-auto max-w-xl space-y-3 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 sm:p-6 text-left shadow-sm" data-testid="real-whatsapp-fallback">
        <div className="flex items-center gap-3">
          <img
            src="/brand/illustrations/illustration-download-hero.svg"
            alt="App WhatsApp Desktop"
            className="hidden sm:block h-14 w-16 shrink-0 rounded-xl border border-slate-100 dark:border-[#334155] bg-white object-contain p-1.5"
          />
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 sm:hidden">
            <MessageSquare size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">WhatsApp Web ao vivo no App para Windows (.exe)</h2>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
              No navegador você testa a Sofia AI agora mesmo; para responder clientes direto pelo seu número sem API paga, use o instalador Windows.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-[#EFF6FF]/70 dark:bg-blue-500/10 p-3.5 sm:p-4 space-y-2">
          <p className="text-xs font-bold text-[#1E3A8A] dark:text-blue-300">Baixar App para Windows (.exe)</p>
          <p className="text-xs text-slate-700 dark:text-[#CBD5E1]">
            Ao abrir pela primeira vez, se o Windows exibir a tela azul do SmartScreen, clique em <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.
          </p>
          <a
            href="/downloads/CompanyGen-Setup.exe"
            download
            data-testid="wpp-download-windows-exe-btn"
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-xl bg-[#0F172A] dark:bg-[#2563EB] px-4 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-blue-600"
          >
            Baixar para Windows (.exe)
          </a>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="cg-secondary min-h-[44px] w-full sm:w-auto rounded-xl border border-slate-300 dark:border-[#334155] bg-white dark:bg-[#0F172A] px-4 text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-[#1E293B]"
            onClick={onOpenConnection}
          >
            Abrir Simulador da Sofia ({connected ? 'Conectado' : 'Teste no Navegador'})
          </button>
        </div>
      </div>
    );
  }

  return <div className="cg-real-whatsapp" data-testid="real-whatsapp-web">
    <header className="cg-real-whatsapp-toolbar">
      <div className="cg-browser-controls" aria-label="Controles do WhatsApp Web">
        <button type="button" className="cg-icon-button" aria-label="Voltar" disabled={!canBack} onClick={() => webview.current?.goBack()}><ArrowLeft size={17} /></button>
        <button type="button" className="cg-icon-button" aria-label="Avançar" disabled={!canForward} onClick={() => webview.current?.goForward()}><ArrowRight size={17} /></button>
        <button type="button" className="cg-icon-button" aria-label="Atualizar WhatsApp Web" onClick={() => webview.current?.reload()}><RefreshCw className={loading ? 'cg-spin' : ''} size={17} /></button>
      </div>
      <div className="cg-real-whatsapp-address"><i /> web.whatsapp.com <span>sessão local isolada</span></div>
    </header>
    {error && <p className="cg-wa-notice" role="alert">{error}</p>}
    <div ref={host} className="cg-real-whatsapp-host bg-white p-3 rounded-xl" />
  </div>;
});
