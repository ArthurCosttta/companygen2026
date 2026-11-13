import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Bot, CalendarDays, Check, CircleCheck, Image, Link2, MessageSquare, RefreshCw, Search, Smartphone, Sparkles, Store, Unplug, X } from 'lucide-react';
import { authenticatedFetch } from '@/services/supabase-client';
import { isWebUrl, searchWebAssets, type WebAsset } from '@/services/image-search';
import { loadWorkspace, updateWorkspace } from '@/services/local-storage';

type Produto = { id: string; nome: string; preco: number; estoque: number; imagem?: string; mensagemMolde?: string };
type Documento = { id: string; titulo: string; conteudo: string };
type Template = {
  id: string;
  titulo?: string;
  title?: string;
  category?: string;
  gatilhos?: string[];
  resposta?: string;
  body?: string;
};
type Painel = {
  conectado: boolean; status: string; numeroBot: string; qr?: string;
  persistencia?: { provider: 'supabase' | 'servidor'; syncedAt?: string | null; error?: string | null };
  configLoja: Record<string, string | number | boolean>;
  config: { botAtivo?: boolean; enviarFotoAutomatica?: boolean; somenteNovas?: boolean; ignorarArquivadas?: boolean; responderAudioComAudio?: boolean; delayHumanoMs?: number };
  skus: Produto[]; documentos: Documento[];
  templates: Template[] | { sourceRevision?: number; items?: Template[] };
};
const tabs = [
  ['inbox', 'Atendimentos', MessageSquare],
  ['messages', 'Mensagens personalizadas', Sparkles],
  ['connection', 'Conexão', Smartphone],
  ['catalog', 'Catálogo', Store],
  ['knowledge', 'Respostas e documentos', BookOpen],
  ['workflow', 'Planejamento', CalendarDays],
] as const;

async function whatsapp<T>(owner: string, route: string, payload?: object): Promise<T> {
  const res = await authenticatedFetch('/api/whatsapp' + route, payload === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, owner);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.erro || data.error || 'Não foi possível concluir a operação.');
  return data;
}

function PrivateMedia({ owner, url, audio, alt }: { owner: string; url: string; audio?: boolean; alt: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    setSrc('');
    if (!url.startsWith('/media/')) return;
    const abort = new AbortController();
    let objectUrl = '';
    authenticatedFetch('/api/whatsapp' + url, { signal: abort.signal }, owner).then(async res => {
      if (!res.ok) return;
      const blob = await res.blob();
      if (abort.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {});
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [owner, url]);
  const link = src || (isWebUrl(url) ? url : '');
  if (!link) return null;
  return audio ? <audio src={link} controls preload="metadata" /> : <img src={link} alt={alt} loading="lazy" />;
}

type CompanyGenDesktopBridge = {
  isDesktop: true;
  readWhatsAppIdentity?: () => Promise<{
    connected?: boolean;
    phoneE164?: string;
    source?: string;
  }>;
};

function desktopBridge(): CompanyGenDesktopBridge | undefined {
  return (window as Window & { companygenDesktop?: CompanyGenDesktopBridge }).companygenDesktop;
}

export function RealWhatsAppWeb({
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
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function detectIdentity() {
      try {
        const identity = await readIdentity();
        if (live && identity?.connected && identity.phoneE164) {
          reportIdentity({ connected: true, phoneE164: identity.phoneE164 });
          return;
        }
      } catch {}
      if (live) timer = setTimeout(detectIdentity, 2500);
    }
    void detectIdentity();
    return () => { live = false; clearTimeout(timer); };
  }, [bridge, onIdentity]);

  if (!bridge) {
    return <div className="cg-real-whatsapp-fallback" data-testid="real-whatsapp-fallback">
      <MessageSquare size={34} />
      <h2>Abra no CompanyGen Desktop</h2>
      <p>O WhatsApp real é carregado dentro do aplicativo desktop. Esta versão do navegador não abre outra página nem reproduz uma caixa de entrada falsa.</p>
      {!connected && <button type="button" className="cg-secondary" onClick={onOpenConnection}>Configurar bot e IA</button>}
    </div>;
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
    <div ref={host} className="cg-real-whatsapp-host" />
  </div>;
}

type PerfilWhatsapp = { ok: boolean; conectado: boolean; nome?: string; numero?: string; telefoneFormatado?: string; fotoUrl?: string | null };

function WhatsAppOnboarding({ userId, data, refresh }: { userId: string; data: Painel; refresh: () => Promise<void> }) {
  const [step, setStep] = useState<1 | 2 | 3>(data.conectado ? 2 : 1);
  const [profile, setProfile] = useState<PerfilWhatsapp>();
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (!data.conectado) setStep(1);
    else if (step === 1) setStep(2);
  }, [data.conectado, step]);

  useEffect(() => {
    if (step !== 1 || data.conectado || data.qr || requested.current) return;
    requested.current = true;
    setFeedback('Preparando um QR Code novo…');
    whatsapp(userId, '/api/sessao/connect', {}).then(async () => {
      await refresh();
      setFeedback('');
    }).catch(error => {
      requested.current = false;
      setFeedback(error instanceof Error ? error.message : 'Não foi possível gerar o QR Code.');
    });
  }, [data.conectado, data.qr, refresh, step, userId]);

  useEffect(() => {
    if (step !== 2 || !data.conectado) return;
    let live = true;
    whatsapp<PerfilWhatsapp>(userId, '/api/whatsapp/perfil').then(result => {
      if (live) setProfile(result);
    }).catch(error => {
      if (live) setFeedback(error instanceof Error ? error.message : 'Não foi possível confirmar o perfil conectado.');
    });
    return () => { live = false; };
  }, [data.conectado, step, userId]);

  async function retryQr() {
    if (working) return;
    setWorking(true);
    setFeedback('Gerando um QR Code novo…');
    try {
      await whatsapp(userId, '/api/sessao/reset', {});
      requested.current = false;
      await refresh();
      setStep(1);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível renovar o QR Code.');
    } finally {
      setWorking(false);
    }
  }

  async function rejectAccount() {
    if (!window.confirm('Desconectar esta conta e gerar um QR Code novo? O histórico sincronizado desta conexão será removido deste aparelho.')) return;
    await retryQr();
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setFeedback('Salvando a loja e ativando a atendente…');
    const form = new FormData(event.currentTarget);
    const nomeLoja = String(form.get('nomeLoja') || '').trim();
    const nomeAtendente = String(form.get('nomeAtendente') || '').trim();
    try {
      await whatsapp(userId, '/api/onboarding/salvar', {
        nomeLoja,
        nomeAtendente,
        endereco: String(form.get('endereco') || '').trim(),
        mapsUrl: String(form.get('mapsUrl') || '').trim(),
        chavePix: String(form.get('chavePix') || '').trim(),
        descontoPix: Number(form.get('descontoPix') || 0),
        horarioRetirada: String(form.get('horarioRetirada') || '').trim(),
        fotoPerfil: String(form.get('fotoPerfil') || '').trim(),
        fotoLoja: String(form.get('fotoLoja') || '').trim(),
        avatarAssistente: String(form.get('fotoPerfil') || '').trim(),
        onboardingConcluido: true,
      });
      await whatsapp(userId, '/api/config/save', {
        botAtivo: form.has('botAtivo'),
        enviarFotoAutomatica: form.has('enviarFotoAutomatica'),
        responderAudioComAudio: form.has('responderAudioComAudio'),
        ignorarArquivadas: form.has('ignorarArquivadas'),
        somenteNovas: true,
        delayHumanoMs: Number(form.get('delayHumanoMs') || 2000),
      });
      await refresh();
      setFeedback('Configuração concluída.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível concluir a configuração.');
    } finally {
      setWorking(false);
    }
  }

  const initials = (profile?.nome || 'WA').trim().slice(0, 2).toUpperCase();
  const config = data.configLoja;
  return <div className="cg-onboarding">
    <header className="cg-onboarding-head">
      <div>
        <span className="cg-onboarding-kicker">WhatsApp da sua empresa</span>
        <h1>{step === 1 ? 'Conecte o aparelho que atende seus clientes' : step === 2 ? 'Confirme a conta conectada' : 'Prepare sua loja e sua atendente'}</h1>
      </div>
      <ol aria-label="Progresso da configuração">
        {['Conectar', 'Confirmar', 'Configurar'].map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step > index + 1 ? 'is-done' : ''}>
          <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}
        </li>)}
      </ol>
    </header>

    {feedback && <p className="cg-onboarding-feedback" role="status">{feedback}</p>}

    {step === 1 && <section className="cg-onboarding-stage cg-onboarding-connect">
      <div className="cg-qr-stage">
        <div className="cg-qr-frame">
          {data.qr ? <img src={data.qr} alt="QR Code para conectar o WhatsApp" /> : <div className="cg-qr-wait"><RefreshCw size={30} /><strong>Gerando QR Code</strong><span>{data.status || 'Iniciando conexão segura…'}</span></div>}
        </div>
        <p><i /> Socket ativo · renovação automática</p>
      </div>
      <div className="cg-onboarding-instructions">
        <Smartphone size={28} />
        <h2>Leia o código pelo celular da loja</h2>
        <ol>
          <li><span>1</span>Abra o WhatsApp no aparelho.</li>
          <li><span>2</span>Entre em <strong>Aparelhos conectados</strong>.</li>
          <li><span>3</span>Toque em <strong>Conectar aparelho</strong> e aponte a câmera.</li>
        </ol>
        <button type="button" className="cg-secondary" disabled={working} onClick={() => void retryQr()}><RefreshCw size={16} /> Gerar outro código</button>
      </div>
    </section>}

    {step === 2 && <section className="cg-onboarding-stage cg-onboarding-confirm">
      <div className="cg-profile-photo">
        {profile?.fotoUrl ? <img src={profile.fotoUrl} alt="Foto do perfil conectado" /> : <span>{initials}</span>}
        <i><Check size={16} /></i>
      </div>
      <p>Conexão estabelecida. Confira se esta é a conta oficial da empresa.</p>
      <div className="cg-profile-card">
        <small>Conta oficial pareada</small>
        <strong>{profile?.nome || data.configLoja.nomeLoja || 'WhatsApp Comercial'}</strong>
        <span>{profile?.telefoneFormatado || (data.numeroBot ? `+${data.numeroBot}` : 'Número conectado')}</span>
      </div>
      <div className="cg-onboarding-actions">
        <button type="button" className="cg-danger-outline" disabled={working} onClick={() => void rejectAccount()}><X size={16} /> Não é esta conta</button>
        <button type="button" className="cg-primary" onClick={() => setStep(3)}>Sim, continuar <ArrowRight size={16} /></button>
      </div>
    </section>}

    {step === 3 && <form className="cg-onboarding-stage cg-onboarding-setup" onSubmit={finish}>
      <div className="cg-onboarding-section-head"><Store size={21} /><div><h2>Dados da empresa</h2><p>Estas informações serão usadas nas respostas do atendimento.</p></div></div>
      <div className="cg-onboarding-fields">
        <label>Nome da empresa<input className="cg-field" name="nomeLoja" required maxLength={80} defaultValue={String(config.nomeLoja || profile?.nome || '')} /></label>
        <label>Nome da atendente<input className="cg-field" name="nomeAtendente" required maxLength={80} defaultValue={String(config.nomeAtendente || 'Atendente Virtual')} /></label>
        <label className="cg-field-wide">Endereço físico<input className="cg-field" name="endereco" defaultValue={String(config.endereco || '')} /></label>
        <label>Link do Google Maps<input className="cg-field" name="mapsUrl" type="url" defaultValue={String(config.mapsUrl || '')} /></label>
        <label>Horário de atendimento<input className="cg-field" name="horarioRetirada" defaultValue={String(config.horarioRetirada || '')} /></label>
        <label>Chave Pix<input className="cg-field" name="chavePix" defaultValue={String(config.chavePix || '')} /></label>
        <label>Desconto no Pix (%)<input className="cg-field" name="descontoPix" type="number" min="0" max="100" defaultValue={Number(config.descontoPix || 0)} /></label>
        <label>Foto de perfil / logo<input className="cg-field" name="fotoPerfil" type="url" defaultValue={String(config.fotoPerfil || profile?.fotoUrl || '')} /></label>
        <label>Foto da loja<input className="cg-field" name="fotoLoja" type="url" defaultValue={String(config.fotoLoja || '')} /></label>
      </div>

      <div className="cg-onboarding-agent">
        <div className="cg-onboarding-section-head"><Bot size={21} /><div><h2>Agente de atendimento</h2><p>Escolha como a atendente deve responder às novas conversas.</p></div></div>
        <div className="cg-agent-options">
          <label><input type="checkbox" name="botAtivo" defaultChecked /><span><strong>Atender automaticamente</strong><small>A atendente responde novas mensagens.</small></span></label>
          <label><input type="checkbox" name="enviarFotoAutomatica" defaultChecked={data.config.enviarFotoAutomatica !== false} /><span><strong>Enviar fotos do catálogo</strong><small>Usa somente imagens cadastradas.</small></span></label>
          <label><input type="checkbox" name="responderAudioComAudio" defaultChecked={data.config.responderAudioComAudio === true} /><span><strong>Responder áudio com áudio</strong><small>Mantém a conversa no mesmo formato.</small></span></label>
          <label><input type="checkbox" name="ignorarArquivadas" defaultChecked={data.config.ignorarArquivadas !== false} /><span><strong>Ignorar conversas arquivadas</strong><small>Evita reabrir atendimentos encerrados.</small></span></label>
        </div>
        <label className="cg-delay-field">Tempo natural antes de responder<input className="cg-field" name="delayHumanoMs" type="number" min="500" max="10000" step="500" defaultValue={data.config.delayHumanoMs || 2000} /><span>milissegundos</span></label>
      </div>

      <div className="cg-onboarding-products"><Image size={20} /><div><strong>{data.skus.length} produtos já cadastrados</strong><p>Você poderá revisar fotos, preços e estoque na aba Catálogo depois de concluir.</p></div></div>
      <div className="cg-onboarding-actions cg-onboarding-actions-end">
        <button type="button" className="cg-secondary" onClick={() => setStep(2)}>Voltar</button>
        <button className="cg-primary" disabled={working}>{working ? 'Salvando…' : 'Concluir e abrir atendimento'} <ArrowRight size={16} /></button>
      </div>
    </form>}
  </div>;
}

export function WhatsAppView({
  userId,
  onStatusChange,
  onBrowserIdentity,
  initialTab = 'inbox',
}: {
  userId: string;
  onStatusChange?: (data: Painel) => void;
  onBrowserIdentity?: (identity: { connected: boolean; phoneE164: string }) => void;
  initialTab?: (typeof tabs)[number][0];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>(initialTab);
  const [data, setData] = useState<Painel>();
  const [connectionError, setConnectionError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [embeddedIdentity, setEmbeddedIdentity] = useState<{ connected: boolean; phoneE164: string }>();

  const reportBrowserIdentity = useCallback((identity: { connected: boolean; phoneE164: string }) => {
    setEmbeddedIdentity(identity);
    onBrowserIdentity?.(identity);
  }, [onBrowserIdentity]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const lastRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const fresh = await whatsapp<Painel>(userId, '/api/dados');
      if (request !== lastRequest.current) return;
      setData(fresh);
      onStatusChange?.(fresh);
      setConnectionError('');
    } catch (error) {
      if (request === lastRequest.current) setConnectionError(error instanceof Error ? error.message : 'Conexão indisponível.');
    }
  }, [onStatusChange, userId]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh();
      if (live) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { live = false; clearTimeout(timer); lastRequest.current++; };
  }, [refresh]);

  async function run(route: string, payload: object, success: string) {
    if (busy) return false;
    setBusy(true);
    setStatus('');
    try {
      await whatsapp(userId, route, payload);
      await refresh();
      setStatus(success);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const templates = (Array.isArray(data?.templates)
    ? data.templates
    : Array.isArray(data?.templates?.items) ? data.templates.items : [])
    .filter((item): item is Template => Boolean(item && typeof item.id === 'string'));

  if (data && data.configLoja.onboardingConcluido !== true && !desktopBridge()) {
    return <section className="cg-wa"><WhatsAppOnboarding userId={userId} data={data} refresh={refresh} /></section>;
  }

  return (
    <section className="cg-wa">
      <div className="cg-wa-nav">
        <nav aria-label="Áreas do WhatsApp">
          {tabs.map(([id, title, Icon]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => { setStatus(''); setTab(id); }}><Icon size={16} aria-hidden="true" /><span>{title}</span></button>)}
        </nav>
        <span className={'cg-connection' + (data?.conectado || embeddedIdentity?.connected ? ' is-connected' : '')}>
          <i /> {data?.conectado
            ? 'Conectado'
            : embeddedIdentity?.connected
              ? `WhatsApp Web conectado (+${embeddedIdentity.phoneE164})`
              : data?.qr ? 'Aguardando QR' : 'Desconectado'}
        </span>
        <span className={'cg-connection' + (data?.persistencia?.provider === 'supabase' ? ' is-connected' : '')}>
          <i /> {data?.persistencia?.provider === 'supabase' ? 'Catálogo sincronizado' : 'Configuração neste servidor'}
        </span>
      </div>
      {(connectionError || status) && <p className="cg-wa-notice" role={connectionError ? 'alert' : 'status'}>{connectionError || status}</p>}
      {tab === 'inbox' && (
        <RealWhatsAppWeb
          userId={userId}
          connected={Boolean(data?.conectado || embeddedIdentity?.connected)}
          onOpenConnection={() => setTab('connection')}
          onIdentity={reportBrowserIdentity}
        />
      )}
      {tab === 'connection' && <div className="cg-wa-panels">
        <section className="cg-panel">
          <h2>Conexão da conta</h2>
          {data?.conectado ? <p className="cg-inline"><CircleCheck size={18} /> +{data.numeroBot}</p> :
            data?.qr ? <><img className="cg-qr" src={data.qr} alt="QR Code para conectar o WhatsApp" /><p>No WhatsApp, abra Aparelhos conectados e escaneie o QR Code.</p></> :
            <p>{data?.status || 'Abra a conexão para gerar o QR Code.'}</p>}
          {data?.conectado || data?.qr
            ? <button className="cg-secondary" disabled={busy} onClick={() => void run('/api/sessao/pausar', {}, 'Conexão pausada.')}><Unplug size={17} /> Pausar conexão</button>
            : <button className="cg-primary" disabled={busy} onClick={() => void run('/api/sessao/connect', {}, 'Conexão solicitada.')}><Link2 size={17} /> Conectar WhatsApp</button>}
          {data?.conectado && <button className="cg-secondary" disabled={busy} onClick={() => void run('/api/onboarding/reset', {}, 'Configuração guiada reaberta.')}><RefreshCw size={16} /> Refazer configuração guiada</button>}
        </section>
        <section className="cg-panel">
          <h2>Identidade da loja</h2>
          {data && <form className="cg-form" onSubmit={e => {
            e.preventDefault();
            void run('/api/config_loja', Object.fromEntries(new FormData(e.currentTarget)), 'Identidade salva.');
          }}>
            <label>Nome da loja<input className="cg-field" name="nomeLoja" required maxLength={80} defaultValue={String(data.configLoja.nomeLoja || '')} /></label>
            <label>Nome da atendente<input className="cg-field" name="nomeAtendente" required maxLength={80} defaultValue={String(data.configLoja.nomeAtendente || '')} /></label>
            <label>Endereço<input className="cg-field" name="endereco" defaultValue={String(data.configLoja.endereco || '')} /></label>
            <button className="cg-primary" disabled={busy}>Salvar identidade</button>
          </form>}
        </section>
        <section className="cg-panel">
          <h2>Respostas automáticas</h2>
          {data && <form className="cg-form" onSubmit={e => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void run('/api/config/save', { botAtivo: form.has('active'), enviarFotoAutomatica: form.has('photo'), somenteNovas: true }, 'Preferências salvas.');
          }}>
            <label className="cg-check"><input type="checkbox" name="active" defaultChecked={data.config.botAtivo} /> Ativar Sofia</label>
            <label className="cg-check"><input type="checkbox" name="photo" defaultChecked={data.config.enviarFotoAutomatica} /> Enviar fotos do catálogo automaticamente</label>
            <button className="cg-primary" disabled={busy}>Salvar preferências</button>
          </form>}
        </section>
      </div>}
      {tab === 'messages' && (
        <PersonalizedMessagesPanel
          templates={templates}
          configLoja={data?.configLoja || {}}
          skus={data?.skus || []}
          onTestInSimulator={async (sampleText) => {
            try {
              await whatsapp(userId, '/api/fluxo/simular', { nomeCliente: 'Cliente Teste (Mensagens)', texto: sampleText });
              await refresh();
              setStatus('Fluxo validado com o catálogo atual. Nenhuma conversa de teste foi persistida.');
            } catch (err) {
              setStatus(err instanceof Error ? err.message : 'Falha ao simular mensagem.');
            }
          }}
        />
      )}
      {tab === 'catalog' && <Catalog owner={userId} products={data?.skus || []} run={run} busy={busy} />}
      {tab === 'knowledge' && <Knowledge documents={data?.documentos || []} templates={templates} run={run} busy={busy} />}
      {tab === 'workflow' && <Workflow owner={userId} />}
    </section>
  );
}

type Run = (route: string, payload: object, success: string) => Promise<boolean>;
const emptyProduct: Produto = { id: '', nome: '', preco: 0, estoque: 0, imagem: '', mensagemMolde: '' };

function Catalog({ owner, products, run, busy }: { owner: string; products: Produto[]; run: Run; busy: boolean }) {
  const [product, setProduct] = useState<Produto>(emptyProduct);
  const [photos, setPhotos] = useState<WebAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState('');
  const searchVersion = useRef(0);

  function edit(item: Produto) {
    searchVersion.current++;
    setProduct(item);
    setPhotos([]);
    setFeedback('');
    setSearching(false);
  }

  async function search() {
    const current = ++searchVersion.current;
    setSearching(true);
    setFeedback('');
    try {
      const found = await searchWebAssets(product.nome.trim(), 6, 'image', owner);
      if (searchVersion.current !== current) return;
      setPhotos(found);
      if (!found.length) setFeedback('Nenhuma foto encontrada para esse nome.');
    } catch (error) {
      if (searchVersion.current === current) setFeedback(error instanceof Error ? error.message : 'Falha na busca.');
    } finally {
      if (searchVersion.current === current) setSearching(false);
    }
  }

  async function selectPhoto(url: string) {
    const version = ++searchVersion.current;
    setSearching(true);
    setFeedback('Carregando a foto…');
    try {
      const result = await whatsapp<{ url: string }>(owner, '/api/importar-imagem', { url });
      if (version !== searchVersion.current) return;
      setProduct(current => ({ ...current, imagem: result.url }));
      setFeedback('Foto pronta para salvar.');
    } catch (error) {
      if (version === searchVersion.current) setFeedback(error instanceof Error ? error.message : 'Escolha outra foto.');
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }

  return <div className="cg-wa-panels">
    <section className="cg-panel">
      <h2>Produtos</h2>
      <div className="cg-products">
        {products.map(item => <button key={item.id} onClick={() => edit(item)}>
          <div>{item.imagem ? <PrivateMedia owner={owner} url={item.imagem} alt="" /> : <Image size={20} />}</div>
          <span><strong>{item.nome}</strong><small>{item.id} · {Number(item.estoque)} em estoque</small></span>
        </button>)}
        {!products.length && <p>Cadastre um produto ou publique o catálogo pelo compilador da Loja.</p>}
      </div>
    </section>
    <section className="cg-panel">
      <div className="cg-inline cg-between"><h2>{product.id ? 'Editar produto' : 'Novo produto'}</h2>
        {product.id && <button className="cg-secondary" onClick={() => edit(emptyProduct)}>Novo</button>}</div>
      <form className="cg-form" onSubmit={async e => {
        e.preventDefault();
        const saved = await run('/api/skus/adicionar', product, 'Produto salvo.');
        if (saved) edit(emptyProduct);
      }}>
        <label>Nome<input className="cg-field" required maxLength={120} value={product.nome} onChange={e => setProduct({ ...product, nome: e.target.value })} /></label>
        <div className="cg-form-row">
          <label>Preço<input className="cg-field" type="number" min={0} step=".01" value={product.preco} onChange={e => setProduct({ ...product, preco: Number(e.target.value) })} /></label>
          <label>Estoque<input className="cg-field" type="number" min={0} value={product.estoque} onChange={e => setProduct({ ...product, estoque: Number(e.target.value) })} /></label>
        </div>
        <label>Foto<input className="cg-field" value={product.imagem || ''} placeholder="Link da imagem" onChange={e => setProduct({ ...product, imagem: e.target.value })} /></label>
        {product.imagem && <div className="cg-selected-photo"><PrivateMedia owner={owner} url={product.imagem} alt="Foto selecionada" /></div>}
        <button className="cg-secondary" type="button" disabled={searching || !product.nome.trim()} onClick={() => void search()}><Search size={16} /> {searching ? 'Buscando…' : 'Buscar fotos na web'}</button>
        {feedback && <p role="status">{feedback}</p>}
        {photos.length > 0 && <div className="cg-photo-grid">{photos.map(item =>
          <button type="button" key={item.rawUrl} title={item.titleSnippet} aria-label={item.titleSnippet || 'Selecionar imagem'}
            disabled={searching} onClick={() => void selectPhoto(item.rawUrl)}>
            <img src={isWebUrl(item.thumbnailUrl) ? item.thumbnailUrl : item.rawUrl} alt="" loading="lazy" />
          </button>)}</div>}
        <label>Mensagem personalizada<textarea className="cg-field" rows={3} value={product.mensagemMolde || ''} onChange={e => setProduct({ ...product, mensagemMolde: e.target.value })} /></label>
        <button className="cg-primary" disabled={busy || searching}>Salvar produto</button>
      </form>
    </section>
  </div>;
}

function Knowledge({ documents, templates, run, busy }: { documents: Documento[]; templates: Template[]; run: Run; busy: boolean }) {
  const [doc, setDoc] = useState<Documento>({ id: '', titulo: '', conteudo: '' });
  const [tpl, setTpl] = useState({ id: '', titulo: '', gatilhos: '', resposta: '' });
  return <div className="cg-wa-panels">
    <section className="cg-panel">
      <h2>Documentos da loja</h2>
      <div className="cg-document-list">{documents.map(item => <button className="cg-secondary" key={item.id} onClick={() => setDoc(item)}>{item.titulo}</button>)}</div>
      <form className="cg-form" onSubmit={async e => {
        e.preventDefault();
        if (await run('/api/documentos/save', doc, 'Documento salvo.')) setDoc({ id: '', titulo: '', conteudo: '' });
      }}>
        <label>Título<input className="cg-field" required maxLength={90} value={doc.titulo} onChange={e => setDoc({ ...doc, titulo: e.target.value })} /></label>
        <label>Conteúdo<textarea className="cg-field" required rows={6} value={doc.conteudo} onChange={e => setDoc({ ...doc, conteudo: e.target.value })} /></label>
        <div className="cg-inline"><button className="cg-primary" disabled={busy}>Salvar documento</button>
          {doc.id && <button className="cg-secondary" type="button" disabled={busy} onClick={async () => {
            if (await run('/api/documentos/delete', { id: doc.id }, 'Documento excluído.')) setDoc({ id: '', titulo: '', conteudo: '' });
          }}>Excluir</button>}</div>
      </form>
    </section>
    <section className="cg-panel">
      <h2>Respostas rápidas</h2>
      <div className="cg-document-list">{templates.map(item => <button className="cg-secondary" key={item.id}
        onClick={() => setTpl({ ...item, titulo: item.titulo || item.title || item.id, resposta: item.resposta || item.body || '', gatilhos: (item.gatilhos || []).join(', ') })}>{item.titulo || item.title || item.id}</button>)}</div>
      <form className="cg-form" onSubmit={async e => {
        e.preventDefault();
        if (await run('/api/templates/save', { ...tpl, gatilhos: tpl.gatilhos.split(',').map(word => word.trim()).filter(Boolean) }, 'Resposta salva.')) {
          setTpl({ id: '', titulo: '', gatilhos: '', resposta: '' });
        }
      }}>
        <label>Título<input className="cg-field" required value={tpl.titulo} onChange={e => setTpl({ ...tpl, titulo: e.target.value })} /></label>
        <label>Gatilhos separados por vírgula<input className="cg-field" required value={tpl.gatilhos} onChange={e => setTpl({ ...tpl, gatilhos: e.target.value })} /></label>
        <label>Resposta<textarea className="cg-field" required rows={5} value={tpl.resposta} onChange={e => setTpl({ ...tpl, resposta: e.target.value })} /></label>
        <button className="cg-primary" disabled={busy}>Salvar resposta</button>
      </form>
    </section>
  </div>;
}

function Workflow({ owner }: { owner: string }) {
  const [draft, setDraft] = useState({ objective: '', notes: '' });
  const [status, setStatus] = useState('Carregando…');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    loadWorkspace(owner).then(({ data }) => {
      if (!active) return;
      if (data.workflows) setDraft(data.workflows);
      setReady(true);
      setStatus('');
    }).catch(() => { if (active) setStatus('Não foi possível carregar o planejamento.'); });
    return () => { active = false; };
  }, [owner]);
  return <div className="cg-wa-panels"><section className="cg-panel">
    <h2>Planejamento comercial</h2>
    <form className="cg-form" onSubmit={async e => {
      e.preventDefault();
      setStatus('Salvando…');
      try {
        await updateWorkspace(data => { data.workflows = draft; }, owner);
        setStatus('Planejamento salvo.');
      } catch { setStatus('Não foi possível salvar.'); }
    }}>
      <label>Objetivo<input className="cg-field" disabled={!ready} value={draft.objective} onChange={e => setDraft({ ...draft, objective: e.target.value })} /></label>
      <label>Plano e aprovações pendentes<textarea className="cg-field" disabled={!ready} rows={7} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
      <button className="cg-primary" disabled={!ready || status === 'Salvando…'}>Salvar planejamento</button>
      {status && <p role="status">{status}</p>}
    </form>
  </section></div>;
}

function hydrateTemplatePreview(
  rawText: string,
): string {
  return String(rawText || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\(\s*SKU[^)]*\)/gi, '')
    .replace(/\bSKU[:\s#-]*[A-Za-z0-9_.-]+\b/gi, '');
}

function PersonalizedMessagesPanel({
  templates,
  configLoja,
  skus,
  onTestInSimulator,
}: {
  templates: Template[];
  configLoja: Record<string, string | number | boolean>;
  skus: Produto[];
  onTestInSimulator: (sampleText: string) => Promise<void>;
}) {
  const [filterText, setFilterText] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const normalized = templates.map(tpl => ({
    id: tpl.id,
    category: tpl.category || 'Respostas rápidas',
    title: tpl.title || tpl.titulo || tpl.id,
    body: hydrateTemplatePreview(tpl.body || tpl.resposta || ''),
  }));

  const q = filterText.trim().toLowerCase();
  const filtered = normalized.filter(
    item =>
      !q ||
      item.id.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q),
  );

  return (
    <div data-testid="whatsapp-personalized-messages" className="p-4 sm:p-6 space-y-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#DCE8F7] rounded-2xl p-4">
        <div>
          <h2 className="text-base font-extrabold text-[#0B1D52]">
            Mensagens personalizadas ({filtered.length})
          </h2>
          <p className="text-xs text-[#64748B]">
            Textos prontos para o atendimento da loja {String(configLoja.nomeLoja || 'CompanyGen')}.
          </p>
          <p className="text-xs text-[#64748B]">
            Campos entre chaves dependem do cliente, produto ou pedido e são preenchidos durante o atendimento.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filtrar por código, categoria ou texto..."
            className="h-9 px-3 rounded-lg border border-[#DCE8F7] text-xs bg-[#F8FBFF] min-w-[240px]"
          />
          <button
            type="button"
            className="cg-secondary"
            onClick={() => void onTestInSimulator(skus[0]?.nome ? `Quero saber do ${skus[0].nome}` : 'Oi, tudo bem?')}
          >
            Testar Fluxo no WhatsApp
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-[#DCE8F7] rounded-2xl p-8 text-center text-sm text-[#64748B]">
          Nenhuma mensagem personalizada encontrada para "{filterText}".
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <article
              key={item.id}
              data-testid={`wa-mold-${item.id}`}
              className="bg-white border border-[#DCE8F7] rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-[0_4px_14px_rgba(11,29,82,0.04)]"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#EAF2FF] text-[#0867E8]">
                    {item.id}
                  </span>
                  <span className="text-[11px] font-semibold text-[#64748B] truncate">{item.category}</span>
                </div>
                <h3 className="text-sm font-extrabold text-[#0B1D52]">{item.title}</h3>
                <pre className="whitespace-pre-wrap font-sans text-xs text-[#334155] bg-[#F8FBFF] border border-[#E2ECF9] rounded-xl p-3 leading-relaxed">
                  {item.body}
                </pre>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="cg-secondary"
                  style={{ fontSize: 11, padding: '6px 10px' }}
                  disabled={/\{[A-Z][A-Z0-9_]*\}/.test(item.body)}
                  title={/\{[A-Z][A-Z0-9_]*\}/.test(item.body) ? 'Disponível após preencher os dados do atendimento.' : undefined}
                  onClick={() => {
                    void navigator.clipboard?.writeText(item.body);
                    setCopiedId(item.id);
                    setTimeout(() => setCopiedId(c => (c === item.id ? '' : c)), 2000);
                  }}
                >
                  {/\{[A-Z][A-Z0-9_]*\}/.test(item.body) ? 'Aguardando dados' : copiedId === item.id ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
