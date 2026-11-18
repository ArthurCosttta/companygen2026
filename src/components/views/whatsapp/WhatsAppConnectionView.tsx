import * as React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Paperclip,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
  Unplug,
  Wifi,
  WifiOff,
  FolderClosed,
  Zap,
  Users,
  Bot,
  UserCheck,
} from 'lucide-react';
import {
  ActionButton,
  SkeletonBlock,
  useToast,
} from '@/components/ui';
import { RealWhatsAppWeb } from '@/components/views/WhatsAppView';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import { useHighSaturationNotifications } from '@/hooks/useHighSaturationNotifications';
import { getDesktopBridge, useWebviewWhatsappResponder } from '@/hooks/useWebviewWhatsappResponder';
import {
  sanitizePhoneE164,
  type BusinessProfile,
} from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import { DisconnectConfirmModal } from './DisconnectConfirmModal';
import { QuickRepliesSection } from './QuickRepliesSection';

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
}

interface LocalKnowledgeFile {
  id: string;
  title: string;
  content: string;
  category?: string;
  updatedAt?: string;
}

export interface WhatsAppConnectionViewProps {
  userId: string;
  profile?: BusinessProfile | null;
  whatsappData?: WhatsappDadosResponse | null;
  whatsapp?: WhatsappDadosResponse | null;
  onRefresh?: () => Promise<unknown> | void;
  onStatusChange?: (data: WhatsappDadosResponse) => void;
  onBrowserIdentity?: (identity: { connected: boolean; phoneE164: string }) => void;
  notificationState?: ReturnType<typeof useHighSaturationNotifications>;
  onNavigateOrders?: () => void;
}

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

export function WhatsAppConnectionView({
  userId,
  profile,
  whatsappData,
  whatsapp: whatsappProp,
  onRefresh,
  onStatusChange,
  onBrowserIdentity,
  notificationState,
}: WhatsAppConnectionViewProps) {
  const { showToast } = useToast();
  const effectiveUserId = userId?.trim() || '';

  const externalWhatsapp = whatsappData !== undefined ? whatsappData : whatsappProp;
  const hasManagedWhatsapp = externalWhatsapp !== undefined || Boolean(onRefresh);

  const [localData, setLocalData] = React.useState<WhatsappDadosResponse | null>(null);
  const data = externalWhatsapp !== undefined ? externalWhatsapp : localData;
  const [initialLoading, setInitialLoading] = React.useState(!hasManagedWhatsapp);
  const [connectionError, setConnectionError] = React.useState('');
  const [embeddedIdentity, setEmbeddedIdentity] = React.useState<{
    connected: boolean;
    phoneE164: string;
  } | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = React.useState(false);

  // IA Local: Instrução única + arquivos locais reais
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [aiFiles, setAiFiles] = React.useState<LocalKnowledgeFile[]>([]);
  const [ollamaOnline, setOllamaOnline] = React.useState<boolean | null>(null);
  const [cloudAiAvailable, setCloudAiAvailable] = React.useState(true);
  const [creditBalance, setCreditBalance] = React.useState<number | null>(null);
  const [safeTestMode, setSafeTestMode] = React.useState(false);
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [activeModel, setActiveModel] = React.useState('qwen3:4b-instruct');
  const [loadingAi, setLoadingAi] = React.useState(true);
  const [savingAi, setSavingAi] = React.useState(false);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState<{
    prompt: string;
    enabled: boolean;
    files: LocalKnowledgeFile[];
  } | null>(null);
  const [undoVisible, setUndoVisible] = React.useState(false);
  const undoTimerRef = React.useRef<number | null>(null);
  const [activeSideDrawer, setActiveSideDrawer] = React.useState<'none' | 'docs' | 'quick_replies' | 'human_queue'>('none');
  const [aiBrainExpanded, setAiBrainExpanded] = React.useState(true);
  const toggleSideDrawer = React.useCallback((drawer: 'docs' | 'quick_replies' | 'human_queue') => {
    setActiveSideDrawer((prev) => {
      const next = prev === drawer ? 'none' : drawer;
      setAiBrainExpanded(next === 'none');
      return next;
    });
  }, []);
  const [resumingPhone, setResumingPhone] = React.useState<string | null>(null);
  const [assumingKey, setAssumingKey] = React.useState<string | null>(null);
  const [simMessage, setSimMessage] = React.useState('');
  const [simSending, setSimSending] = React.useState(false);
  const [simResult, setSimResult] = React.useState<{
    replyText: string;
    modelUsed: string;
    intent: string;
    suppressed: boolean;
  } | null>(null);

  const handleRunLiveSofiaTest = async () => {
    const clean = simMessage.trim();
    if (!clean || simSending) return;
    setSimSending(true);
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/simulate-or-reply',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerPhone: '5531995551122',
            customerName: 'Teste Painel',
            messageText: clean,
            mode: 'live_whatsapp',
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showToast({ type: 'error', message: json?.error || 'Falha ao testar Sofia local.' });
        return;
      }
      setSimResult({
        replyText: String(json.replyText || '(Sem resposta — thread em pausa humana)'),
        modelUsed: String(json.modelUsed || 'desconhecido'),
        intent: String(json.intent || 'GENERAL_QUESTION'),
        suppressed: Boolean(json.autoReplySuppressed),
      });
      void notificationState?.refresh?.(true);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao testar resposta da Sofia.',
        durationMs: 4000,
      });
    } finally {
      setSimSending(false);
    }
  };

  const humanQueueEntries = React.useMemo(() => {
    type QueueEntry = {
      key: string;
      customerName: string;
      customerPhone: string;
      customerJid: string;
      message: string;
      pausedAt: string;
      assumedByHuman: boolean;
      eventId?: string;
    };
    const byKey = new Map<string, QueueEntry>();
    for (const pt of notificationState?.pausedThreadItems || []) {
      const k = String(pt.customerPhone || pt.customerJid || pt.chatKey).trim();
      if (!k) continue;
      byKey.set(k, {
        key: k,
        customerName: pt.customerName || pt.customerPhone || 'Cliente',
        customerPhone: pt.customerPhone || '',
        customerJid: pt.customerJid || '',
        message: pt.lastMessage || pt.reason || 'Solicitou atendimento humano.',
        pausedAt: pt.pausedAt || new Date().toISOString(),
        assumedByHuman: Boolean(pt.assumedByHuman),
      });
    }
    const allNotifs = notificationState?.allNotifications || notificationState?.notifications || [];
    for (const n of allNotifs) {
      if (n.level !== 'HUMAN_ESCALATION' || n.resolved) continue;
      const k = String(n.customerPhone || n.customerJid || n.id).trim();
      if (!k) continue;
      const existing = byKey.get(k);
      if (existing) {
        if (!existing.eventId) existing.eventId = n.eventId || n.id;
        if (!existing.message && n.message) existing.message = n.message;
      } else {
        byKey.set(k, {
          key: k,
          customerName: n.customerName || n.customerPhone || 'Cliente',
          customerPhone: n.customerPhone || '',
          customerJid: n.customerJid || '',
          message: n.message || 'Aguardando atendimento humano.',
          pausedAt: n.createdAt || new Date().toISOString(),
          assumedByHuman: Boolean(n.acknowledged),
          eventId: n.eventId || n.id,
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.assumedByHuman !== b.assumedByHuman) return a.assumedByHuman ? 1 : -1;
      return new Date(b.pausedAt).getTime() - new Date(a.pausedAt).getTime();
    });
  }, [
    notificationState?.allNotifications,
    notificationState?.notifications,
    notificationState?.pausedThreadItems,
  ]);

  const waitingHumanCount = humanQueueEntries.filter((e) => !e.assumedByHuman).length;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const lastRequestRef = React.useRef(0);

  const draftStorageKey = `companygen:wpp_ai_draft:${effectiveUserId}`;

  const refreshStatus = React.useCallback(async () => {
    if (onRefresh) {
      try {
        await onRefresh();
        setConnectionError('');
      } catch (error) {
        setConnectionError(
          error instanceof Error ? error.message : 'Conexão temporariamente indisponível.',
        );
      } finally {
        setInitialLoading(false);
      }
      return;
    }

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
      setLocalData(json);
      setConnectionError('');
      onStatusChange?.(json);
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
  }, [effectiveUserId, onRefresh, onStatusChange]);

  const loadAiContext = React.useCallback(async () => {
    setLoadingAi(true);
    try {
      const res = await authenticatedFetch('/api/whatsapp/ai/brain', { method: 'GET' }, effectiveUserId);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setOllamaOnline(false);
        return;
      }
      const brain = json.brain || {};
      const draftPrompt = (() => {
        try {
          return window.sessionStorage.getItem(draftStorageKey) || '';
        } catch {
          return '';
        }
      })();
      setAiPrompt(String(brain.systemPrompt || draftPrompt || ''));
      setAiEnabled(brain.enabled !== false);
      setSafeTestMode(brain.safeTestMode === true);
      setAiFiles(Array.isArray(brain.ragDocuments) ? brain.ragDocuments : []);
      setOllamaOnline(Boolean(json.ollamaOnline));
      setCloudAiAvailable(json.cloudAiAvailable !== false);
      if (typeof json.creditBalance === 'number') setCreditBalance(json.creditBalance);
      setAvailableModels(Array.isArray(json.availableModels) ? json.availableModels : []);
      if (brain.modelName) setActiveModel(String(brain.modelName));
    } catch {
      setOllamaOnline(false);
    } finally {
      setLoadingAi(false);
    }
  }, [draftStorageKey, effectiveUserId]);

  React.useEffect(() => {
    const onCreditsUpdate = () => {
      void loadAiContext();
    };
    window.addEventListener('companygen:credits-updated', onCreditsUpdate);
    return () => window.removeEventListener('companygen:credits-updated', onCreditsUpdate);
  }, [loadAiContext]);

  React.useEffect(() => {
    if (!hasManagedWhatsapp) {
      void refreshStatus();
    } else {
      setInitialLoading(false);
    }
    void loadAiContext();
    return () => {
      lastRequestRef.current++;
    };
  }, [hasManagedWhatsapp, loadAiContext, refreshStatus]);

  React.useEffect(() => {
    try {
      window.sessionStorage.setItem(draftStorageKey, aiPrompt);
    } catch {}
  }, [aiPrompt, draftStorageKey]);

  React.useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const runtimeStatus = React.useMemo<WhatsappRuntimeStatus | null>(() => {
    if (!data && !embeddedIdentity) return null;
    return {
      connected: Boolean(data?.conectado || embeddedIdentity?.connected),
      conectado: Boolean(data?.conectado || embeddedIdentity?.connected),
      qrPending: false,
      qrCode: null,
      status: data?.status,
      numeroBot: data?.numeroBot || embeddedIdentity?.phoneE164 || '',
      phoneE164: embeddedIdentity?.phoneE164 || data?.numeroBot || '',
    };
  }, [data, embeddedIdentity]);

  const phaseInfo = useConnectionPhaseInfo(profile, runtimeStatus);
  const desktopBridge = getDesktopBridge();
  const responderStatus = useWebviewWhatsappResponder({
    userId: effectiveUserId,
    enabled: aiEnabled,
    connected: Boolean(embeddedIdentity?.connected || (embeddedIdentity as { loggedIn?: boolean } | null | undefined)?.loggedIn),
    phoneE164: embeddedIdentity?.phoneE164 || data?.numeroBot || profile?.whatsapp?.phoneE164,
    onActivity: () => {
      void notificationState?.refresh?.(true);
    },
  });

  const handleBrowserIdentity = React.useCallback(
    (identity: { connected: boolean; phoneE164: string }) => {
      setEmbeddedIdentity(identity);
      onBrowserIdentity?.(identity);
    },
    [onBrowserIdentity],
  );

  const persistAiState = async (
    nextPrompt: string,
    nextEnabled: boolean,
    nextFiles: LocalKnowledgeFile[],
    successMsg: string,
    nextSafeTestMode: boolean = safeTestMode,
  ) => {
    if (savingAi) return;
    setLastSavedSnapshot({ prompt: aiPrompt, enabled: aiEnabled, files: aiFiles });
    setSavingAi(true);
    try {
      const modelToSave = availableModels.includes(activeModel)
        ? activeModel
        : availableModels[0] || activeModel;
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/brain',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: nextEnabled,
            autoReplyWhenConnected: true,
            modelName: modelToSave,
            systemPrompt: nextPrompt,
            ragDocuments: nextFiles,
            safeTestMode: nextSafeTestMode,
            safeTestPhone: sanitizePhoneE164(embeddedIdentity?.phoneE164 || data?.numeroBot || profile?.whatsapp?.phoneE164 || ''),
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao salvar instruções da IA.');
      }
      setAiPrompt(nextPrompt);
      setAiEnabled(nextEnabled);
      setSafeTestMode(nextSafeTestMode);
      setAiFiles(nextFiles);
      setUndoVisible(true);
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = window.setTimeout(() => {
        setUndoVisible(false);
        undoTimerRef.current = null;
      }, 5000);
      showToast({
        type: 'success',
        message: successMsg,
        durationMs: 3500,
      });
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao salvar configuração da IA.',
        durationMs: 4000,
      });
    } finally {
      setSavingAi(false);
    }
  };

  const handleUploadKnowledgeFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || uploadingFile) return;
    setUploadingFile(true);
    try {
      const added: LocalKnowledgeFile[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`Arquivo "${file.name}" excede 5MB.`);
        }
        const text = await file.text();
        const trimmed = text.replace(/\u0000/g, '').trim();
        if (!trimmed) {
          throw new Error(`Arquivo "${file.name}" está vazio ou em formato binário ilegível.`);
        }
        const docItem: LocalKnowledgeFile = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: file.name,
          content: trimmed.slice(0, 50000),
          category: 'Arquivo Local',
          updatedAt: new Date().toISOString(),
        };
        added.push(docItem);
        const saveRes = await authenticatedFetch(
          '/api/whatsapp/api/documentos/save',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo: file.name, conteudo: trimmed.slice(0, 50000) }),
          },
          effectiveUserId,
        );
        if (!saveRes.ok) {
          const saveErr = await saveRes.json().catch(() => null);
          throw new Error(saveErr?.error || `Falha ao salvar documento "${file.name}" (${saveRes.status}).`);
        }
      }
      const nextFiles = [...aiFiles, ...added];
      await persistAiState(aiPrompt, aiEnabled, nextFiles, `${added.length} arquivo(s) adicionado(s) à IA`);
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao ler arquivo local.',
        durationMs: 4000,
      });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async (docId: string) => {
    const nextFiles = aiFiles.filter((d) => d.id !== docId);
    await persistAiState(aiPrompt, aiEnabled, nextFiles, 'Arquivo removido da IA');
  };

  const handleUndo = async () => {
    if (!lastSavedSnapshot) return;
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoVisible(false);
    await persistAiState(
      lastSavedSnapshot.prompt,
      lastSavedSnapshot.enabled,
      lastSavedSnapshot.files,
      'Alteração desfeita',
    );
  };

  const handleAssumeHuman = async (entry: {
    key: string;
    customerPhone: string;
    customerJid: string;
    eventId?: string;
  }) => {
    if (assumingKey) return;
    setAssumingKey(entry.key);
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/events/ack',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assume_human',
            eventId: entry.eventId,
            customerPhone: entry.customerPhone,
            customerJid: entry.customerJid,
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível assumir este atendimento.');
      }
      showToast({
        type: 'success',
        message: 'Atendimento assumido. A IA segue pausada até você devolvê-lo.',
        durationMs: 3200,
      });
      void notificationState?.refresh?.(true);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao assumir atendimento.',
        durationMs: 3500,
      });
    } finally {
      setAssumingKey(null);
    }
  };

  const handleResumeAi = async (phone: string, jid?: string, eventId?: string) => {
    if (resumingPhone) return;
    const lockKey = phone || jid || 'thread';
    setResumingPhone(lockKey);
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/notifications/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'resume_ai',
            eventId,
            customerPhone: phone,
            customerJid: jid,
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível reativar a IA neste chat.');
      }
      showToast({
        type: 'success',
        message: 'Cliente devolvido para a IA! Ela responderá as próximas mensagens.',
        durationMs: 3500,
      });
      void notificationState?.refresh?.(true);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao reativar IA.',
        durationMs: 4000,
      });
    } finally {
      setResumingPhone(null);
    }
  };

  const formattedPhone = formatPhoneDisplay(
    embeddedIdentity?.phoneE164 || data?.numeroBot || profile?.whatsapp?.phoneE164 || '',
  );
  const isLive = phaseInfo.isLiveReady || Boolean(data?.conectado);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC]">
      {/* Cabeçalho único e objetivo — sem barra preta, sem simulador, sem sub-abas duplicadas */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full ring-4 ring-slate-100"
            style={{ backgroundColor: isLive ? '#10B981' : '#F59E0B' }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#0F172A]">
              {isLive
                ? formattedPhone
                  ? `WhatsApp Conectado: ${formattedPhone}`
                  : 'WhatsApp Oficial Conectado'
                : 'WhatsApp Web Oficial — Aguardando Conexão'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {cloudAiAvailable || ollamaOnline
                ? responderStatus.pauseReason === 'credit_exhausted'
                  ? 'Atendimento pausado por falta de créditos — recarregue na Kiwify para retomar.'
                  : responderStatus.active
                    ? `IA Nuvem Ativa — respondendo ao vivo direto no WhatsApp Web Oficial${responderStatus.repliedCount > 0 ? ` (${responderStatus.repliedCount} enviada${responderStatus.repliedCount > 1 ? 's' : ''})` : ''}.`
                    : desktopBridge?.isDesktop && !embeddedIdentity?.connected
                      ? 'IA Nuvem pronta — escaneie o QR oficial abaixo para ativar a resposta automática.'
                      : 'IA Nuvem pronta — responde clientes automaticamente com baixo consumo e chama você quando precisar.'
                : 'IA desconectada — clique em Testar Conexão IA ao lado.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const hasCloudCredits = cloudAiAvailable && (creditBalance === null || creditBalance >= 2);
            const hasAnyAi = hasCloudCredits || Boolean(ollamaOnline);
            const msgsLeft = creditBalance !== null ? Math.max(0, Math.floor(creditBalance / 2)) : null;
            const label = !aiEnabled
              ? 'IA Pausada'
              : responderStatus.pauseReason === 'credit_exhausted' || (cloudAiAvailable && creditBalance !== null && creditBalance < 2 && !ollamaOnline)
                ? 'Sem Créditos (0 msgs)'
                : hasCloudCredits
                  ? msgsLeft !== null
                    ? `IA Nuvem Ativa · ~${msgsLeft} msgs`
                    : 'IA Nuvem Ativa'
                  : ollamaOnline
                    ? 'IA Local Ativa'
                    : 'IA Offline';
            return (
              <span
                data-testid="wpp-ai-connection-pill"
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                  hasAnyAi && aiEnabled && responderStatus.pauseReason !== 'credit_exhausted'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : !aiEnabled || responderStatus.pauseReason === 'credit_exhausted' || (cloudAiAvailable && creditBalance !== null && creditBalance < 2)
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {hasAnyAi ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
                {label}
              </span>
            );
          })()}

          {isLive && (
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

      {(connectionError || responderStatus.lastError) && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 sm:mx-6"
        >
          {connectionError || responderStatus.lastError}
        </div>
      )}

      {/* Área Principal: WhatsApp Web Oficial + Local Único de Instruções & Arquivos da IA */}
      <div className="grid flex-1 min-h-0 gap-4 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[1.35fr_0.9fr]">
        {/* WhatsApp Web Oficial (único QR oficial quando desconectado) */}
        <section
          aria-label="WhatsApp Web Oficial"
          className="flex min-h-[320px] lg:min-h-[440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
              <CheckCircle2
                className={`size-4 ${isLive ? 'text-[#16A34A]' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span>WhatsApp Web Oficial</span>
            </div>
            <span className="text-xs text-slate-500">Sessão isolada da loja</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {initialLoading && !data && !desktopBridge?.isDesktop ? (
              <div className="p-5">
                <SkeletonBlock width="100%" height="380px" rounded="xl" />
              </div>
            ) : (
              <RealWhatsAppWeb
                userId={effectiveUserId}
                connected={isLive}
                onOpenConnection={() => void refreshStatus()}
                onIdentity={handleBrowserIdentity}
              />
            )}
          </div>
        </section>

        {/* Bloco Único de Instruções da IA + Arquivos Locais */}
        <section
          aria-label="Instruções e Arquivos Locais da IA"
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          {/* Barra de Ferramentas / Atalhos Rápidos da IA */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
            <button
              type="button"
              data-testid="wpp-drawer-docs-btn"
              onClick={() => toggleSideDrawer('docs')}
              className={`flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                activeSideDrawer === 'docs'
                  ? 'border-blue-300 bg-blue-50 text-[#2563EB]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FolderClosed className="size-4 shrink-0 text-[#2563EB]" />
              <span className="truncate">Biblioteca ({aiFiles.length})</span>
            </button>

            <button
              type="button"
              data-testid="wpp-drawer-quick-replies-btn"
              onClick={() => toggleSideDrawer('quick_replies')}
              className={`flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                activeSideDrawer === 'quick_replies'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Zap className="size-4 shrink-0 text-amber-500" />
              <span className="truncate">Rápidas</span>
            </button>

            <button
              type="button"
              data-testid="wpp-drawer-human-queue-btn"
              onClick={() => toggleSideDrawer('human_queue')}
              className={`relative flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                waitingHumanCount > 0
                  ? 'animate-pulse border-[#FF2E54] bg-red-50 text-[#B91C1C] ring-2 ring-[#FF2E54]/40'
                  : activeSideDrawer === 'human_queue'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className={`size-4 shrink-0 ${waitingHumanCount > 0 ? 'text-[#FF2E54]' : 'text-slate-600'}`} />
              <span className="truncate">
                {waitingHumanCount > 0 ? 'Fila Humana (!)' : 'Fila Humana'}
              </span>
              {humanQueueEntries.length > 0 && (
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                    waitingHumanCount > 0 ? 'bg-[#FF2E54]' : 'bg-amber-500'
                  }`}
                >
                  {humanQueueEntries.length}
                </span>
              )}
            </button>
          </div>

          {/* Painel Expansível Lateral para Biblioteca de Documentos */}
          {activeSideDrawer === 'docs' && (
            <div
              data-testid="wpp-docs-drawer-panel"
              className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <FolderClosed className="size-4 text-[#2563EB]" />
                  <span>{aiFiles.length} documento(s) de apoio da loja</span>
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,.log"
                    className="sr-only"
                    onChange={(e) => void handleUploadKnowledgeFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    data-testid="upload-wpp-ai-file-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#1D4ED8] transition disabled:opacity-60"
                  >
                    <Paperclip className="size-3.5" aria-hidden="true" />
                    {uploadingFile ? 'Enviando...' : '+ Subir Arquivo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSideDrawer('docs')}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              {aiFiles.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Nenhum arquivo anexado no momento. Suba tabelas de preço, prazos ou políticas (.txt, .md, .csv, .json) para a Sofia consultar automaticamente.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {aiFiles.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs"
                    >
                      <span className="flex items-center gap-2 font-medium text-slate-800 truncate">
                        <FileText className="size-3.5 shrink-0 text-[#2563EB]" />
                        <span className="truncate">{f.title}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono text-slate-500">
                          {Math.max(1, Math.round(f.content.length / 1024))} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveFile(f.id)}
                          aria-label={`Remover documento ${f.title}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Painel Expansível Lateral para Fila Humana & Despausa */}
          {activeSideDrawer === 'human_queue' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <UserCheck className="size-4 text-[#10B981]" />
                  Clientes em Atendimento Humano
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSideDrawer('none')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Fechar
                </button>
              </div>

              {humanQueueEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
                  <CheckCircle2 className="size-5 mx-auto mb-1 text-emerald-500" />
                  Nenhum cliente aguardando atendimento humano no momento. A Sofia está respondendo 100% dos chats.
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {humanQueueEntries.map((entry) => {
                    const lockKey = entry.customerPhone || entry.customerJid || entry.key;
                    const isResuming = resumingPhone === lockKey;
                    const isAssuming = assumingKey === entry.key;
                    return (
                      <div
                        key={entry.key}
                        data-testid={`human-queue-card-${entry.key}`}
                        className={`flex flex-col gap-2 rounded-xl border bg-white p-3 shadow-2xs ${
                          !entry.assumedByHuman
                            ? 'border-[#FF2E54] ring-1 ring-[#FF2E54]/40'
                            : 'border-amber-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-[#0F172A]">{entry.customerName}</p>
                            {entry.customerPhone ? (
                              <p className="text-[11px] text-slate-500">{entry.customerPhone}</p>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              !entry.assumedByHuman
                                ? 'animate-pulse bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {!entry.assumedByHuman ? 'Aguardando humano' : 'Em atendimento humano'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{entry.message}</p>
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {!entry.assumedByHuman && (
                            <ActionButton
                              variant="secondary"
                              size={44}
                              isLoading={isAssuming}
                              loadingText="Assumindo..."
                              onClick={() => void handleAssumeHuman(entry)}
                            >
                              Assumir atendimento
                            </ActionButton>
                          )}
                          <ActionButton
                            variant="success"
                            size={44}
                            isLoading={isResuming}
                            loadingText="Reativando..."
                            leftIcon={<Bot className="size-4" />}
                            onClick={() =>
                              void handleResumeAi(entry.customerPhone, entry.customerJid, entry.eventId)
                            }
                          >
                            Devolver para a IA
                          </ActionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Painel Expansível Lateral para Mensagens Rápidas */}
          {activeSideDrawer === 'quick_replies' && (
            <div data-testid="wpp-quick-replies-drawer-panel" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Zap className="size-4 text-amber-500" />
                  Mensagens Rápidas (0 cr por gatilho)
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSideDrawer('none')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Fechar
                </button>
              </div>
              <QuickRepliesSection profile={profile} owner={effectiveUserId} compact />
            </div>
          )}
          {/* Bloco Colapsável de Instruções & Teste da Sofia (recolhe quando um painel acima abre) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                data-testid="wpp-ai-brain-collapse-btn"
                aria-expanded={aiBrainExpanded}
                onClick={() => setAiBrainExpanded((prev) => !prev)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-slate-500 transition-transform ${aiBrainExpanded ? 'rotate-180' : ''}`}
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A]">Instruções da IA & Teste ao Vivo</h2>
                  <p className="truncate text-[11px] text-slate-500">
                    {aiBrainExpanded
                      ? 'A Sofia lê suas instruções, biblioteca e catálogo real.'
                      : 'Painel recolhido para dar foco acima — clique para editar ou testar.'}
                  </p>
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  data-testid="wpp-safe-test-mode-toggle"
                  aria-checked={safeTestMode}
                  onClick={() =>
                    void persistAiState(
                      aiPrompt,
                      aiEnabled,
                      aiFiles,
                      !safeTestMode
                        ? 'Modo Teste Seguro ativado (só seu número responde).'
                        : 'Modo Teste Seguro desativado (clientes reais liberados).',
                      !safeTestMode,
                    )
                  }
                  className={`inline-flex min-h-[40px] shrink-0 items-center rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    safeTestMode
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {safeTestMode ? 'Teste Seguro: Só meu número' : 'Modo Teste Seguro'}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={aiEnabled}
                  onClick={() => void persistAiState(aiPrompt, !aiEnabled, aiFiles, !aiEnabled ? 'IA ativada' : 'IA pausada')}
                  className={`inline-flex min-h-[40px] shrink-0 items-center rounded-xl border px-3 text-xs font-bold transition-transform active:scale-[0.98] ${
                    aiEnabled
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 bg-slate-100 text-slate-700'
                  }`}
                >
                  {aiEnabled ? 'IA Ativa' : 'IA Pausada'}
                </button>
              </div>
            </div>

            {aiBrainExpanded && (
              loadingAi ? (
                <SkeletonBlock width="100%" height="160px" rounded="xl" />
              ) : (
                <div className="space-y-3 border-t border-slate-200/70 pt-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="wpp-ai-single-prompt" className="text-xs font-semibold text-slate-700">
                      O que você quer que a IA responda e faça no WhatsApp?
                    </label>
                    <textarea
                      id="wpp-ai-single-prompt"
                      data-testid="wpp-ai-single-prompt"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={5}
                      placeholder="Ex.: Atenda com cordialidade, informe valores do catálogo, confirme prazo de entrega e transfira imediatamente para um humano se o cliente pedir desconto ou reclamação."
                      className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-[#0F172A] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/25"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton
                      variant="success"
                      size={44}
                      data-testid="save-wpp-ai-instructions"
                      isLoading={savingAi}
                      loadingText="Salvando..."
                      leftIcon={<Save className="size-4" aria-hidden="true" />}
                      onClick={() => void persistAiState(aiPrompt, aiEnabled, aiFiles, 'Instruções da IA salvas com sucesso!')}
                    >
                      Salvar Instruções da IA
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      size={44}
                      data-testid="recheck-wpp-ai-connection"
                      leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                      onClick={() => void loadAiContext()}
                    >
                      Testar Conexão IA
                    </ActionButton>

                    {undoVisible && lastSavedSnapshot && (
                      <button
                        type="button"
                        onClick={() => void handleUndo()}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        <Undo2 className="size-3.5" />
                        Desfazer
                      </button>
                    )}
                  </div>

                  {desktopBridge?.isDesktop && (
                    <div
                      data-testid="wpp-desktop-live-responder-status"
                      className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                        responderStatus.liveTypingPreview?.phase === 'typing'
                          ? 'border-blue-300 bg-blue-50/80 text-blue-950'
                          : responderStatus.active
                            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium flex items-center gap-2">
                          {responderStatus.liveTypingPreview?.phase === 'typing' ? (
                            <>
                              <span className="inline-flex gap-0.5">
                                <span className="size-1.5 rounded-full bg-blue-600 animate-bounce" />
                                <span className="size-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:120ms]" />
                                <span className="size-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:240ms]" />
                              </span>
                              <span>
                                Digitando resposta no WhatsApp ({responderStatus.liveTypingPreview.etaSeconds}s)...
                              </span>
                            </>
                          ) : responderStatus.processing ? (
                            'IA gerando resposta rápida (~12s)...'
                          ) : responderStatus.active ? (
                            `Atendente Desktop ativo no WhatsApp Web (${responderStatus.repliedCount} resposta${responderStatus.repliedCount === 1 ? '' : 's'} enviada${responderStatus.repliedCount === 1 ? '' : 's'})`
                          ) : (
                            'Conecte o WhatsApp Web ao lado para iniciar as respostas automáticas reais.'
                          )}
                        </span>
                        {responderStatus.lastChatTitle ? (
                          <span className="truncate text-[11px] font-semibold text-emerald-700">
                            Último chat: {responderStatus.lastChatTitle}
                          </span>
                        ) : null}
                      </div>
                      {responderStatus.liveTypingPreview?.phase === 'paused_human' ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                          <span>
                            <strong>{responderStatus.liveTypingPreview.chatTitle}:</strong>{' '}
                            {responderStatus.liveTypingPreview.draftText}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSideDrawer('human_queue')}
                            className="shrink-0 font-bold text-amber-800 underline"
                          >
                            Abrir Fila Humana
                          </button>
                        </div>
                      ) : null}
                      {responderStatus.liveTypingPreview?.phase === 'typing' &&
                      responderStatus.liveTypingPreview.draftText ? (
                        <div className="rounded-lg border border-blue-200/80 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700">
                          <span className="font-semibold text-blue-700">
                            {responderStatus.liveTypingPreview.chatTitle}:{' '}
                          </span>
                          <span>
                            {responderStatus.liveTypingPreview.draftText.slice(
                              0,
                              responderStatus.liveTypingPreview.visibleChars,
                            )}
                          </span>
                          <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-blue-500 animate-pulse" />
                        </div>
                      ) : null}
                      {Array.isArray(responderStatus.recentEvents) && responderStatus.recentEvents.length > 0 && (
                        <div data-testid="wpp-recent-bubbles-feed" className="space-y-1.5 border-t border-emerald-200/60 pt-2">
                          {responderStatus.recentEvents.slice(0, 3).map((ev) => (
                            <div key={ev.id} className="rounded-lg border border-white/80 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700">
                              <span className="font-bold text-[#0F172A]">{ev.chatTitle}: </span>
                              <span className="text-slate-600">{ev.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Teste Ao Vivo da Sofia direto na UI */}
                  <div
                    data-testid="wpp-sofia-live-tester"
                    className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                        <Bot className="size-3.5 text-[#10B981]" />
                        Testar Resposta da Sofia Ao Vivo
                      </span>
                      {simResult ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {simResult.modelUsed} · {simResult.intent}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        data-testid="wpp-sofia-test-input"
                        value={simMessage}
                        onChange={(e) => setSimMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRunLiveSofiaTest();
                        }}
                        placeholder="Ex: Qual o valor ou prazo?"
                        className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#10B981]/30"
                      />
                      <ActionButton
                        variant="secondary"
                        size={44}
                        data-testid="wpp-sofia-test-send"
                        isLoading={simSending}
                        loadingText="Gerando..."
                        onClick={() => void handleRunLiveSofiaTest()}
                      >
                        Simular
                      </ActionButton>
                    </div>
                    {simResult ? (
                      <div
                        data-testid="wpp-sofia-test-output"
                        className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 text-xs text-[#0F172A]"
                      >
                        <p className="font-semibold text-emerald-700 mb-0.5">
                          Resposta gerada {simResult.suppressed ? '(Suprimida)' : '(Ativa)'}:
                        </p>
                        <p className="leading-relaxed">{simResult.replyText}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      </div>

      <DisconnectConfirmModal
        open={disconnectModalOpen}
        onOpenChange={setDisconnectModalOpen}
        owner={effectiveUserId}
        phoneLabel={formattedPhone}
        onDisconnected={() => {
          setEmbeddedIdentity(null);
          void refreshStatus();
        }}
      />
    </div>
  );
}
