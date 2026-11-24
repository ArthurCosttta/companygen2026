import { memo, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, MessageSquare, RefreshCw, Terminal } from 'lucide-react';
import { getDesktopBridge, type DesktopWhatsappBridge } from '@/hooks/useWebviewWhatsappResponder';

const WINDOWS_INSTALL_COMMAND = 'irm https://companygen.store/install.ps1 | iex';

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
  const [copiedCmd, setCopiedCmd] = useState(false);
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
      setError(detail.errorDescription || 'NÃ£o foi possÃ­vel carregar o WhatsApp Web.');
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
    const handleCopyInstallCmd = async () => {
      try {
        await navigator.clipboard.writeText(WINDOWS_INSTALL_COMMAND);
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2500);
      } catch {
        setCopiedCmd(false);
      }
    };

    return (
      <div className="cg-real-whatsapp-fallback mx-auto max-w-xl space-y-4 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-5 sm:p-6 text-left shadow-sm" data-testid="real-whatsapp-fallback">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Terminal size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              Instalar CompanyGen no Windows em 30 segundos
            </h2>
            <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
              Sem tela azul de alerta e sem precisar de senha de administrador. Basta copiar e colar o comando abaixo no PowerShell do Windows.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-[#EFF6FF]/70 dark:bg-[#090D16] p-4 space-y-3">
          <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <li><strong>1.</strong> Pressione <kbd className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px]">Win</kbd> + <kbd className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[11px]">R</kbd> no teclado, digite <code className="font-mono font-bold">powershell</code> e aperte <strong>Enter</strong>.</li>
            <li><strong>2.</strong> Cole o comando abaixo na janela que abrir e aperte <strong>Enter</strong>:</li>
          </ol>

          <pre
            data-testid="wpp-install-command-code"
            className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[#334155] bg-[#0F172A] p-3 font-mono text-[11px] text-emerald-300 select-all"
          >
            {WINDOWS_INSTALL_COMMAND}
          </pre>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="wpp-copy-install-command-btn"
              onClick={() => void handleCopyInstallCmd()}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white hover:bg-[#1D4ED8] transition"
            >
              {copiedCmd ? <Check size={15} /> : <Copy size={15} />}
              <span>{copiedCmd ? 'Comando copiado!' : 'Copiar comando de instalação'}</span>
            </button>

            <a
              href="https://companygen.store/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-[#334155] bg-white dark:bg-[#111726] px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E293B] transition"
            >
              <ExternalLink size={14} />
              <span>Abrir página de instalação</span>
            </a>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="cg-secondary inline-flex min-h-[42px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-[#334155] bg-white dark:bg-[#0F172A] px-4 text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-[#1E293B]"
            onClick={onOpenConnection}
          >
            <MessageSquare size={15} />
            <span>Atualizar status ({connected ? 'Conectado' : 'Testar no Simulador'})</span>
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
    <div ref={host} className="cg-real-whatsapp-host bg-white dark:bg-[#090D16]" />
  </div>;
});
