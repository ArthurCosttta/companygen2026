import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  QrCode,
  RefreshCw,
  Smartphone,
  Unplug,
  Zap,
} from 'lucide-react';
import {
  ActionButton,
  DrawerContainer,
  SkeletonBlock,
  useToast,
} from '@/components/ui';
import { RealWhatsAppWeb } from '@/components/views/WhatsAppView';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import {
  sanitizePhoneE164,
  type BusinessProfile,
} from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import { DisconnectConfirmModal } from './DisconnectConfirmModal';
import {
  QuickRepliesSection,
  type QuickReplyTemplate,
} from './QuickRepliesSection';

export interface WhatsappDadosResponse extends WhatsappRuntimeStatus {
  conectado: boolean;
  status: string;
  numeroBot: string;
  qr?: string;
  configLoja?: Record<string, string | number | boolean>;
  config?: {
    botAtivo?: boolean;
    enviarFotoAutomatica?: boolean;
  };
  templates?: QuickReplyTemplate[] | { items?: QuickReplyTemplate[]; molds?: QuickReplyTemplate[] };
}

export interface WhatsAppConnectionViewProps {
  userId: string;
  profile?: BusinessProfile | null;
  onStatusChange?: (data: WhatsappDadosResponse) => void;
  onBrowserIdentity?: (identity: { connected: boolean; phoneE164: string }) => void;
}

const QR_TTL_SECONDS = 45;

function formatPhoneDisplay(raw: string): string {
  const digits = sanitizePhoneE164(raw);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('55') && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function extractTemplates(raw: WhatsappDadosResponse['templates']): QuickReplyTemplate[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (Array.isArray(raw.items)) return raw.items.filter(Boolean);
  if (Array.isArray(raw.molds)) return raw.molds.filter(Boolean);
  return [];
}

export function WhatsAppConnectionView({
  userId,
  profile,
  onStatusChange,
  onBrowserIdentity,
}: WhatsAppConnectionViewProps) {
  const { showToast } = useToast();
  const effectiveUserId = userId?.trim() || 'companygen-whatsapp';

  const [data, setData] = React.useState<WhatsappDadosResponse | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [connectionError, setConnectionError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState(false);
  const [wasConnected, setWasConnected] = React.useState(false);
  const [embeddedIdentity, setEmbeddedIdentity] = React.useState<{
    connected: boolean;
    phoneE164: string;
  } | null>(null);

  const [activeSubTab, setActiveSubTab] = React.useState<'whatsapp' | 'quickReplies'>('whatsapp');
  const [quickRepliesDrawerOpen, setQuickRepliesDrawerOpen] = React.useState(false);
  const [disconnectModalOpen, setDisconnectModalOpen] = React.useState(false);

  // 45s QR expiration tracker
  const [qrSecondsLeft, setQrSecondsLeft] = React.useState<number>(QR_TTL_SECONDS);
  const lastQrRef = React.useRef<string>('');
  const lastRequestRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const requestId = ++lastRequestRef.current;
    try {
      const res = await authenticatedFetch('/api/whatsapp/api/dados', undefined, effectiveUserId);
      const json = (await res.json().catch(() => ({}))) as WhatsappDadosResponse & {
        erro?: string;
        error?: string;
      };
      if (requestId !== lastRequestRef.current) return;
      if (!res.ok) {
        throw new Error(json.erro || json.error || 'Não foi possível verificar o status do WhatsApp.');
      }
      setData(json);
      setConnectionError('');
      onStatusChange?.(json);
      if (json.conectado) {
        setWasConnected(true);
      }
    } catch (error) {
      if (requestId === lastRequestRef.current) {
        setConnectionError(
          error instanceof Error ? error.message : 'Conexão temporariamente indisponível.',
        );
      }
    } finally {
      if (requestId === lastRequestRef.current) {
        setInitialLoading(false);
      }
    }
  }, [effectiveUserId, onStatusChange]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh();
      if (active) {
        timer = setTimeout(poll, 3000);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      lastRequestRef.current++;
    };
  }, [refresh]);

  React.useEffect(() => {
    const currentQr = data?.qr || '';
    if (!currentQr) {
      lastQrRef.current = '';
      setQrSecondsLeft(QR_TTL_SECONDS);
      return;
    }
    if (currentQr !== lastQrRef.current) {
      lastQrRef.current = currentQr;
      setQrSecondsLeft(QR_TTL_SECONDS);
    }
  }, [data?.qr]);

  React.useEffect(() => {
    if (!data?.qr || data?.conectado) return;
    if (qrSecondsLeft <= 0) return;
    const interval = setInterval(() => {
      setQrSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.conectado, data?.qr, qrSecondsLeft]);

  const runtimeStatus = React.useMemo<WhatsappRuntimeStatus | null>(() => {
    if (!data && !embeddedIdentity) return null;
    return {
      connected: Boolean(data?.conectado || embeddedIdentity?.connected),
      conectado: Boolean(data?.conectado || embeddedIdentity?.connected),
      qrPending: Boolean(data?.qr),
      qrCode: data?.qr || null,
      status: data?.status,
      numeroBot: data?.numeroBot || embeddedIdentity?.phoneE164 || '',
      phoneE164: embeddedIdentity?.phoneE164 || data?.numeroBot || '',
    };
  }, [data, embeddedIdentity]);

  const phaseInfo = useConnectionPhaseInfo(profile, runtimeStatus);

  const handleBrowserIdentity = React.useCallback(
    (identity: { connected: boolean; phoneE164: string }) => {
      setEmbeddedIdentity(identity);
      if (identity.connected) {
        setWasConnected(true);
      }
      onBrowserIdentity?.(identity);
    },
    [onBrowserIdentity],
  );

  const handleRequestQr = async (resetFirst = false) => {
    if (busyAction) return;
    setBusyAction(true);
    try {
      if (resetFirst) {
        await authenticatedFetch(
          '/api/whatsapp/api/sessao/reset',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
          effectiveUserId,
        );
      }
      const res = await authenticatedFetch(
        '/api/whatsapp/api/sessao/connect',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        throw new Error(json.erro || json.error || 'Não foi possível gerar o QR Code.');
      }
      setQrSecondsLeft(QR_TTL_SECONDS);
      await refresh();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao solicitar novo QR Code.',
        durationMs: 3000,
      });
    } finally {
      setBusyAction(false);
    }
  };

  const formattedPhone = formatPhoneDisplay(
    embeddedIdentity?.phoneE164 || data?.numeroBot || profile?.whatsapp?.phoneE164 || '',
  );
  const templates = React.useMemo(() => extractTemplates(data?.templates), [data?.templates]);
  const qrExpired = Boolean(data?.qr && qrSecondsLeft === 0);
  const showDisconnectedAlert =
    (wasConnected || Boolean(profile?.whatsapp?.connected)) && !phaseInfo.isLiveReady;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      {/* Top Status & Quick Action Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full ring-4 ring-slate-100"
            style={{ backgroundColor: phaseInfo.colorHex }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#0F172A]">
              {phaseInfo.isLiveReady
                ? formattedPhone
                  ? `Conectado: ${formattedPhone} | Atendimento Oficial da Loja`
                  : phaseInfo.labelPT
                : phaseInfo.labelPT}
            </p>
            <p className="truncate text-xs text-slate-500">
              {phaseInfo.isLiveReady
                ? 'Atendimento sincronizado e pronto para responder clientes.'
                : phaseInfo.phase === 'STORE_NUMBER_ONLY'
                  ? 'Sua vitrine já vende com link direto para o seu número enquanto o aparelho não está pareado.'
                  : 'Conecte o WhatsApp da loja pelo QR Code para atender e enviar mensagens por aqui.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="softBlue"
            size={44}
            leftIcon={<Zap className="size-4 text-[#F59E0B]" aria-hidden="true" />}
            onClick={() => setQuickRepliesDrawerOpen(true)}
          >
            Ver Respostas Rápidas da Loja
          </ActionButton>

          {(phaseInfo.isLiveReady || data?.conectado) && (
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={<Unplug className="size-4 text-slate-600" aria-hidden="true" />}
              onClick={() => setDisconnectModalOpen(true)}
            >
              Desconectar
            </ActionButton>
          )}
        </div>
      </header>

      {/* Clean Sub-navigation (mobile-friendly >= 44px) */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
        <button
          type="button"
          aria-current={activeSubTab === 'whatsapp' ? 'page' : undefined}
          onClick={() => setActiveSubTab('whatsapp')}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-[120ms] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
            activeSubTab === 'whatsapp'
              ? 'bg-[#EFF6FF] text-[#1D4ED8]'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          <span>WhatsApp da Loja</span>
        </button>

        <button
          type="button"
          aria-current={activeSubTab === 'quickReplies' ? 'page' : undefined}
          onClick={() => setActiveSubTab('quickReplies')}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-[120ms] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
            activeSubTab === 'quickReplies'
              ? 'bg-[#EFF6FF] text-[#1D4ED8]'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Zap className="size-4 text-[#F59E0B]" aria-hidden="true" />
          <span>Respostas Rápidas</span>
        </button>
      </div>

      {/* Reconnection Banner when phone disconnected */}
      {showDisconnectedAlert && (
        <div
          role="alert"
          className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <span className="font-medium">
              WhatsApp desconectou do seu celular. Leia o QR Code para voltar a atender por aqui.
            </span>
          </div>
          <ActionButton
            variant="primary"
            size={44}
            isLoading={busyAction}
            loadingText="Gerando QR..."
            leftIcon={<QrCode className="size-4" aria-hidden="true" />}
            onClick={() => {
              setActiveSubTab('whatsapp');
              void handleRequestQr(true);
            }}
          >
            Clique para Reconectar QR
          </ActionButton>
        </div>
      )}

      {connectionError && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 sm:mx-6"
        >
          {connectionError}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {activeSubTab === 'quickReplies' ? (
          <div className="mx-auto max-w-4xl">
            <QuickRepliesSection
              templates={templates}
              profile={profile}
              owner={effectiveUserId}
              loading={initialLoading && !data}
              onTemplateSaved={refresh}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4">
            {/* QR Code / Connection Panel when not yet live */}
            {!phaseInfo.isLiveReady && (
              <section
                aria-label="Conexão do WhatsApp"
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="grid items-center gap-6 md:grid-cols-[260px_1fr]">
                  <div className="relative mx-auto flex size-[240px] items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                    {initialLoading && !data ? (
                      <SkeletonBlock width="100%" height="100%" rounded="xl" />
                    ) : data?.qr ? (
                      <>
                        <img
                          src={data.qr}
                          alt="QR Code para conectar o WhatsApp"
                          className={`size-full rounded-xl bg-white object-contain p-1 transition-opacity duration-200 ${
                            qrExpired ? 'opacity-35' : 'opacity-100'
                          }`}
                        />
                        {qrExpired && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/75 p-4 text-center backdrop-blur-[2px]">
                            <p className="text-xs font-bold text-[#0F172A]">
                              QR Code expirado
                            </p>
                            <ActionButton
                              variant="primary"
                              size={44}
                              isLoading={busyAction}
                              loadingText="Renovando..."
                              leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                              onClick={() => void handleRequestQr(true)}
                            >
                              QR Expirado. Clique para renovar
                            </ActionButton>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3 px-4 text-center">
                        <QrCode className="size-10 text-[#2563EB]" aria-hidden="true" />
                        <p className="text-xs leading-relaxed text-slate-600">
                          Gere o QR Code para parear o WhatsApp da sua loja.
                        </p>
                        <ActionButton
                          variant="success"
                          size={44}
                          isLoading={busyAction}
                          loadingText="Gerando..."
                          leftIcon={<QrCode className="size-4" aria-hidden="true" />}
                          onClick={() => void handleRequestQr(false)}
                        >
                          Gerar QR Code
                        </ActionButton>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1D4ED8]">
                        <Smartphone className="size-3.5" aria-hidden="true" />
                        Pareamento com seu celular
                      </span>
                      <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
                        Conecte o WhatsApp da sua empresa
                      </h2>
                      {data?.qr && !qrExpired && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Este código expira em {qrSecondsLeft}s e renova quando solicitado.
                        </p>
                      )}
                    </div>

                    <ol className="space-y-2.5 text-sm text-slate-700">
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-xs font-bold text-[#1D4ED8]">
                          1
                        </span>
                        <span>Abra o WhatsApp no celular da loja.</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-xs font-bold text-[#1D4ED8]">
                          2
                        </span>
                        <span>
                          Toque em <strong>Aparelhos conectados</strong> e depois em{' '}
                          <strong>Conectar aparelho</strong>.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-xs font-bold text-[#1D4ED8]">
                          3
                        </span>
                        <span>Aponte a câmera para o QR Code ao lado.</span>
                      </li>
                    </ol>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <ActionButton
                        variant="secondary"
                        size={44}
                        isLoading={busyAction}
                        loadingText="Atualizando..."
                        leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                        onClick={() => void handleRequestQr(true)}
                      >
                        Gerar novo QR Code
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Embedded Official WhatsApp Web Container */}
            <section
              aria-label="WhatsApp Web Oficial"
              title="WhatsApp Web Oficial"
              className="flex min-h-[460px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                  <CheckCircle2
                    className={`size-4 ${
                      phaseInfo.isLiveReady ? 'text-[#16A34A]' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span>WhatsApp Web Oficial</span>
                </div>
                <span className="text-xs text-slate-500">
                  Sessão isolada da loja
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <RealWhatsAppWeb
                  userId={effectiveUserId}
                  connected={phaseInfo.isLiveReady}
                  onOpenConnection={() => void handleRequestQr(false)}
                  onIdentity={handleBrowserIdentity}
                />
              </div>
            </section>
          </div>
        )}
      </div>

      {/* TELA 25: Quick Replies Lateral Drawer */}
      <DrawerContainer
        open={quickRepliesDrawerOpen}
        onOpenChange={setQuickRepliesDrawerOpen}
        title="Respostas Rápidas da Loja"
        description="Copie mensagens prontas para responder clientes em segundos."
        size="default"
      >
        <QuickRepliesSection
          compact
          templates={templates}
          profile={profile}
          owner={effectiveUserId}
          loading={initialLoading && !data}
          onTemplateSaved={refresh}
        />
      </DrawerContainer>

      {/* TELA 26: Disconnect Confirmation AlertDialog */}
      <DisconnectConfirmModal
        open={disconnectModalOpen}
        onOpenChange={setDisconnectModalOpen}
        owner={effectiveUserId}
        phoneLabel={formattedPhone}
        onDisconnected={() => {
          setWasConnected(false);
          setEmbeddedIdentity(null);
          void refresh();
        }}
      />
    </div>
  );
}
