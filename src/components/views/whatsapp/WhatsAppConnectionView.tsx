import * as React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Mic,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Unplug,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  FolderClosed,
  Zap,
  Users,
  Bot,
  UserCheck,
  Maximize2,
  Minimize2,
  Wrench,
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
  const [autonomyMode, setAutonomyMode] = React.useState<'sugestao' | 'misto' | 'autonomo'>('misto');
  const [autonomyAccordionOpen, setAutonomyAccordionOpen] = React.useState(false);
  const [channelTab, setChannelTab] = React.useState<'simulator' | 'real'>('real');
  const [whatsappFullscreen, setWhatsappFullscreen] = React.useState(false);
  const [repairingWhatsapp, setRepairingWhatsapp] = React.useState(false);
  const [soundMuted, setSoundMuted] = React.useState<boolean>(() => {
    try {
      return window.localStorage.getItem('companygen:sound_muted') === '1';
    } catch {
      return false;
    }
  });
  const [dragOverLibrary, setDragOverLibrary] = React.useState(false);
  const [copilotDraftsByKey, setCopilotDraftsByKey] = React.useState<
    Record<string, Array<{ id: string; label: string; text: string }>>
  >({});
  const [loadingDraftsKey, setLoadingDraftsKey] = React.useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = React.useState<string | null>(null);
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
  const [simLastQuery, setSimLastQuery] = React.useState('');
  const [simAudioTranscript, setSimAudioTranscript] = React.useState('');
  const [simAudioFallback, setSimAudioFallback] = React.useState('');
  const [simResult, setSimResult] = React.useState<{
    replyText: string;
    replyParts: string[];
    modelUsed: string;
    intent: string;
    suppressed: boolean;
    hallucinationBlocked?: boolean;
    securityBlocked?: boolean;
    isSimulationOrder?: boolean;
    antiBanDelaySec: string;
  } | null>(null);

  const toggleSoundMute = () => {
    setSoundMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('companygen:sound_muted', next ? '1' : '0');
      } catch {
        // Ignore storage quota errors.
      }
      return next;
    });
  };

  React.useEffect(() => {
    if (!whatsappFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWhatsappFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [whatsappFullscreen]);

  React.useEffect(() => {
    if (!effectiveUserId) return;
    const syncCredits = async () => {
      try {
        const res = await authenticatedFetch('/api/credits/balance', { method: 'GET' }, effectiveUserId);
        const json = await res.json().catch(() => null);
        if (typeof json?.balance === 'number') setCreditBalance(json.balance);
      } catch {}
    };
    const onCreditsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === 'number') {
        setCreditBalance(detail.balance);
      } else {
        void syncCredits();
      }
    };
    const onFocus = () => {
      void syncCredits();
    };
    window.addEventListener('companygen:credits-updated', onCreditsUpdated);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('companygen:credits-updated', onCreditsUpdated);
      window.removeEventListener('focus', onFocus);
    };
  }, [effectiveUserId]);

  const handleAutoRepairWhatsapp = async () => {
    if (repairingWhatsapp) return;
    setRepairingWhatsapp(true);
    try {
      const bridge = getDesktopBridge();
      if (bridge?.repairWhatsAppWebview) {
        const res = await bridge.repairWhatsAppWebview();
        if (res?.ok) {
          showToast({
            type: 'success',
            message: 'WhatsApp Web reparado e recarregado sem perder sua conexão.',
          });
        } else {
          showToast({
            type: 'error',
            message: res?.reason || 'Não foi possível reparar o WebView agora.',
          });
        }
      } else {
        await refreshStatus();
        showToast({
          type: 'success',
          message: 'Status do WhatsApp atualizado.',
        });
      }
    } finally {
      setRepairingWhatsapp(false);
    }
  };

  const handleRunLiveSofiaTest = async (
    overrideMessage?: string,
    overrideMode: 'simulator' | 'live_whatsapp' = 'simulator',
    bypassBusy = false,
  ) => {
    const clean = (overrideMessage ?? simMessage).trim();
    if (!clean || (simSending && !bypassBusy)) return;
    setSimSending(true);
    setSimLastQuery(clean);
    if (!overrideMessage) setSimMessage('');
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
            mode: overrideMode,
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        showToast({ type: 'error', message: json?.error || 'Falha ao testar Sofia local.' });
        return;
      }
      const replyText = String(json.replyText || json.suggestedReplyText || '(Sem resposta — thread em pausa humana)');
      const rawParts = Array.isArray(json.replyParts) && json.replyParts.length > 0 ? json.replyParts : [replyText];
      const delayMs = Math.max(1200, Math.min(4800, Number(json.readDelayMs || 2400)));
      setSimResult({
        replyText,
        replyParts: rawParts.slice(0, 2).map((p: unknown) => String(p)),
        modelUsed: String(json.modelUsed || 'desconhecido'),
        intent: String(json.intent || 'GENERAL_QUESTION'),
        suppressed: Boolean(json.autoReplySuppressed),
        hallucinationBlocked: Boolean(json.hallucinationBlocked),
        securityBlocked: Boolean(json.securityBlocked),
        isSimulationOrder: Boolean(json.orderCreated?.isSimulation),
        antiBanDelaySec: (delayMs / 1000).toFixed(1).replace('.', ','),
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

  const handleSimulateAudioNote = async (corrupted = false) => {
    if (simSending) return;
    setSimSending(true);
    try {
      // OggS valid header vs invalid corrupted bytes (>4MB or bad magic)
      const sampleBase64 = corrupted
        ? btoa('NOT_AN_AUDIO_FILE_INVALID_MAGIC_BYTES')
        : btoa('OggS\x00\x02simulated-audio-payload-tenis-runner-pro');
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/transcribe-audio',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: sampleBase64,
            mimeType: 'audio/ogg',
            durationSec: 6,
            fallbackHintText: corrupted ? '' : 'Oi, queria ver o valor do primeiro produto no Pix',
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (json?.transcript) {
        setSimAudioFallback('');
        setSimAudioTranscript(String(json.transcript));
        await handleRunLiveSofiaTest(String(json.transcript), 'simulator', true);
      } else {
        const msg = String(json?.message || 'Não consegui ouvir o áudio com clareza — pode digitar em texto, por favor?');
        setSimAudioFallback(msg);
      }
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
      updatedAt: string;
      pausedBy?: string;
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
        updatedAt: (pt as { updatedAt?: string }).updatedAt || pt.pausedAt || new Date().toISOString(),
        pausedBy: (pt as { pausedBy?: string }).pausedBy,
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
          updatedAt: n.createdAt || new Date().toISOString(),
          assumedByHuman: Boolean(n.acknowledged),
          eventId: n.eventId || n.id,
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.pausedBy === 'manual_human_reply' && b.pausedBy !== 'manual_human_reply') return -1;
      if (b.pausedBy === 'manual_human_reply' && a.pausedBy !== 'manual_human_reply') return 1;
      return new Date(b.updatedAt || b.pausedAt).getTime() - new Date(a.updatedAt || a.pausedAt).getTime();
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
      if (brain.autonomyMode === 'sugestao' || brain.autonomyMode === 'misto' || brain.autonomyMode === 'autonomo') {
        setAutonomyMode(brain.autonomyMode);
      }
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
    nextAutonomyMode: 'sugestao' | 'misto' | 'autonomo' = autonomyMode,
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
            autonomyMode: nextAutonomyMode,
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
      setAutonomyMode(nextAutonomyMode);
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

  const handlePasteKnowledgeSnippet = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedFiles = e.clipboardData?.files;
    if (pastedFiles && pastedFiles.length > 0) {
      e.preventDefault();
      await handleUploadKnowledgeFiles(pastedFiles);
      return;
    }
    const text = e.clipboardData?.getData('text/plain')?.trim() || '';
    if (text.length >= 12) {
      e.preventDefault();
      const title = `Anotação Colada (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).txt`;
      const docItem: LocalKnowledgeFile = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        content: text.slice(0, 50000),
        category: 'Trecho Colado',
        updatedAt: new Date().toISOString(),
      };
      await authenticatedFetch(
        '/api/whatsapp/api/documentos/save',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo: title, conteudo: docItem.content }),
        },
        effectiveUserId,
      ).catch(() => null);
      await persistAiState(aiPrompt, aiEnabled, [...aiFiles, docItem], 'Trecho salvo na Biblioteca da Sofia!');
    }
  };

  const handleLoadCopilotDrafts = async (entry: {
    key: string;
    customerName: string;
    message: string;
  }) => {
    if (loadingDraftsKey === entry.key) return;
    setLoadingDraftsKey(entry.key);
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/human-drafts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: entry.customerName,
            lastMessage: entry.message,
          }),
        },
        effectiveUserId,
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.drafts)) {
        setCopilotDraftsByKey((prev) => ({ ...prev, [entry.key]: json.drafts }));
      }
    } finally {
      setLoadingDraftsKey(null);
    }
  };

  const handleCopyCopilotDraft = async (draft: { id: string; text: string }) => {
    try {
      await navigator.clipboard?.writeText(draft.text);
      setCopiedDraftId(draft.id);
      setTimeout(() => setCopiedDraftId((cur) => (cur === draft.id ? null : cur)), 2000);
      showToast({ type: 'success', message: 'Sugestão do Co-Piloto copiada!', durationMs: 2200 });
    } catch {
      showToast({ type: 'success', message: draft.text, durationMs: 4000 });
    }
  };

  React.useEffect(() => {
    if (activeSideDrawer !== 'human_queue' || humanQueueEntries.length === 0) return;
    const first = humanQueueEntries[0];
    if (!first || copilotDraftsByKey[first.key] || loadingDraftsKey === first.key) return;
    void handleLoadCopilotDrafts(first);
  }, [activeSideDrawer, humanQueueEntries, copilotDraftsByKey, loadingDraftsKey]);

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
  const autonomyModeLabel =
    autonomyMode === 'sugestao' ? 'Sugestão' : autonomyMode === 'autonomo' ? 'Autônomo' : 'Misto';
  const promptLen = aiPrompt.length;
  const concisenessPct = Math.min(100, Math.round((promptLen / 900) * 100));
  const concisenessStatus =
    promptLen <= 500 ? 'Concisa' : promptLen <= 900 ? 'Detalhada' : 'Extensa';
  const catalogQuickSkus = (profile?.catalog?.products || [])
    .filter((p) => p && p.active !== false)
    .slice(0, 4);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC] dark:bg-[#090D16] text-[#0F172A] dark:text-[#F8FAFC]">
      {/* Banner Ambar Global 40px condicional — aparece APENAS quando safeTestMode=true */}
      {safeTestMode && (
        <div
          data-testid="wpp-safe-test-amber-banner"
          className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/12 dark:bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 sm:px-6"
        >
          <span className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="truncate">
              Modo Teste Seguro ativo: a Sofia responde somente você neste aparelho
            </span>
          </span>
          <button
            type="button"
            data-testid="wpp-turn-off-safe-mode-btn"
            disabled={savingAi}
            onClick={() =>
              void persistAiState(
                aiPrompt,
                aiEnabled,
                aiFiles,
                'Modo Teste Seguro desativado (clientes reais liberados).',
                false,
              )
            }
            className="inline-flex min-h-[28px] shrink-0 items-center rounded-lg border border-amber-600/40 bg-white/80 dark:bg-[#090D16]/70 px-2.5 text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/25 transition"
          >
            Desligar agora
          </button>
        </div>
      )}

      {/* Cabeçalho único e objetivo */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full ring-4 ring-slate-100 dark:ring-[#1E293B]"
            style={{ backgroundColor: isLive ? '#10B981' : '#F59E0B' }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              {isLive
                ? formattedPhone
                  ? `${phaseInfo.labelPT || 'WhatsApp conectado e respondendo'}: ${formattedPhone}`
                  : phaseInfo.labelPT || 'WhatsApp conectado e respondendo'
                : 'WhatsApp Web Oficial — Aguardando Conexão'}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-[#94A3B8]">
              {cloudAiAvailable || ollamaOnline
                ? responderStatus.pauseReason === 'credit_exhausted'
                  ? 'Atendimento pausado por falta de créditos — recarregue na Kiwify para retomar.'
                  : responderStatus.active
                    ? `Sofia Nuvem Ativa — respondendo ao vivo no WhatsApp Web${responderStatus.repliedCount > 0 ? ` (${responderStatus.repliedCount} enviada${responderStatus.repliedCount > 1 ? 's' : ''})` : ''}.`
                    : desktopBridge?.isDesktop && !embeddedIdentity?.connected
                      ? 'Sofia Nuvem pronta — escaneie o QR oficial ao lado para ativar respostas automáticas.'
                      : 'Sofia Nuvem pronta — atende catálogo, gera Pix e chama você apenas quando precisar.'
                : 'Sofia offline — clique em Verificar Conexão.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const hasCloudCredits = cloudAiAvailable && (creditBalance === null || creditBalance >= 0.1);
            const hasAnyAi = hasCloudCredits || Boolean(ollamaOnline);
            const msgsLeft = creditBalance !== null ? Math.max(0, Math.floor((creditBalance + 1e-9) / 0.1)) : null;
            const label = !aiEnabled
              ? 'Sofia Pausada'
              : responderStatus.pauseReason === 'credit_exhausted' || (cloudAiAvailable && creditBalance !== null && creditBalance < 0.1 && !ollamaOnline)
                ? 'Sem Créditos (0 msgs)'
                : hasCloudCredits
                  ? msgsLeft !== null
                    ? `IA Nuvem Ativa · ~${msgsLeft.toLocaleString('pt-BR')} msgs`
                    : 'IA Nuvem Ativa'
                  : ollamaOnline
                    ? 'IA Local Ativa'
                    : 'IA Offline';
            return (
              <span
                data-testid="wpp-ai-connection-pill"
                className={`cg-tabular inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                  hasAnyAi && aiEnabled && responderStatus.pauseReason !== 'credit_exhausted'
                    ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                    : !aiEnabled || responderStatus.pauseReason === 'credit_exhausted' || (cloudAiAvailable && creditBalance !== null && creditBalance < 0.1)
                      ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                      : 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300'
                }`}
              >
                {hasAnyAi ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
                {label}
              </span>
            );
          })()}

          <button
            type="button"
            data-testid="wpp-sound-mute-toggle"
            aria-label={soundMuted ? 'Ativar alertas sonoros' : 'Silenciar alertas sonoros'}
            onClick={toggleSoundMute}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E293B]"
          >
            {soundMuted ? <VolumeX className="size-3.5 text-slate-400" /> : <Volume2 className="size-3.5 text-[#2563EB]" />}
            <span className="hidden sm:inline">{soundMuted ? 'Som mudo' : 'Alertas ativos'}</span>
          </button>

          {isLive && (
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={<Unplug className="size-4 text-slate-600 dark:text-slate-300" aria-hidden="true" />}
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
          className="mx-4 mt-3 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-4 py-2.5 text-xs font-medium text-red-700 dark:text-red-300 sm:mx-6"
        >
          {connectionError || responderStatus.lastError}
        </div>
      )}

      {/* Grid Assimétrico Desktop (FILA 13: ~33% Cérebro / ~67% WhatsApp Real com Tela Cheia sem desmontar <webview>) */}
      <div className="grid flex-1 min-h-0 gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(360px,0.8fr)_minmax(640px,1.6fr)]">
        {/* COLUNA ESQUERDA (~33%) — Cérebro, Fila & Conhecimento */}
        <section
          aria-label="Cérebro, Fila Humana e Conhecimento da Sofia"
          className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-sm"
        >
          {/* 3 Toolbar Pills Mutuamente Exclusivos */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 dark:border-[#1E293B] pb-3">
            <button
              type="button"
              data-testid="wpp-drawer-human-queue-btn"
              onClick={() => toggleSideDrawer('human_queue')}
              className={`relative flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all duration-150 ${
                waitingHumanCount > 0
                  ? 'animate-pulse border-[#FF2E54] bg-[#FF2E54]/10 text-[#E11D48] dark:text-[#FF2E54] ring-1 ring-[#FF2E54]/40'
                  : activeSideDrawer === 'human_queue'
                    ? 'border-[#FF2E54] bg-[#FF2E54]/10 text-[#E11D48] dark:text-[#FF2E54]'
                    : 'border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
              }`}
            >
              <Users className={`size-4 shrink-0 ${waitingHumanCount > 0 || activeSideDrawer === 'human_queue' ? 'text-[#FF2E54]' : 'text-slate-500'}`} />
              <span className="truncate">Fila Humana</span>
              {humanQueueEntries.length > 0 && (
                <span
                  className={`cg-tabular flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                    waitingHumanCount > 0 ? 'bg-[#FF2E54]' : 'bg-amber-500'
                  }`}
                >
                  {humanQueueEntries.length}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="wpp-drawer-quick-replies-btn"
              onClick={() => toggleSideDrawer('quick_replies')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all duration-150 ${
                activeSideDrawer === 'quick_replies'
                  ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
              }`}
            >
              <Zap className="size-4 shrink-0 text-amber-500" />
              <span className="truncate">Rápidas</span>
            </button>

            <button
              type="button"
              data-testid="wpp-drawer-docs-btn"
              onClick={() => toggleSideDrawer('docs')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all duration-150 ${
                activeSideDrawer === 'docs'
                  ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 text-[#2563EB] dark:text-blue-300'
                  : 'border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
              }`}
            >
              <FolderClosed className="size-4 shrink-0 text-[#2563EB] dark:text-blue-400" />
              <span className="cg-tabular truncate">Biblioteca ({aiFiles.length})</span>
            </button>
          </div>

          {/* Drawer 1: Fila Humana (#FF2E54) + Co-Piloto 2 Pills + Retomar IA */}
          {activeSideDrawer === 'human_queue' && (
            <div
              data-testid="wpp-human-queue-drawer-panel"
              className="rounded-2xl border border-[#FF2E54]/30 bg-[#FFF1F2]/60 dark:bg-[#FF2E54]/5 p-4 space-y-3 transition-all duration-150"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-2">
                  <UserCheck className="size-4 text-[#FF2E54]" />
                  <span>Fila Humana & Co-Piloto</span>
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="wpp-refresh-queue-btn"
                    onClick={() => void notificationState?.refresh?.(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] dark:text-blue-400 hover:underline"
                  >
                    <RefreshCw className="size-3" />
                    Atualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSideDrawer('none')}
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {humanQueueEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] p-4 text-center text-xs text-slate-500 dark:text-[#94A3B8]">
                  <CheckCircle2 className="size-5 mx-auto mb-1 text-emerald-500" />
                  Nenhum cliente na Fila Humana agora. A Sofia está respondendo 100% dos atendimentos.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                  {humanQueueEntries.map((entry) => {
                    const lockKey = entry.customerPhone || entry.customerJid || entry.key;
                    const isResuming = resumingPhone === lockKey;
                    const isAssuming = assumingKey === entry.key;
                    const copilotDrafts = copilotDraftsByKey[entry.key] || [];
                    return (
                      <div
                        key={entry.key}
                        data-testid={`human-queue-card-${entry.key}`}
                        className={`flex flex-col gap-2.5 rounded-xl border bg-white dark:bg-[#090D16] p-3.5 shadow-2xs ${
                          !entry.assumedByHuman
                            ? 'border-[#FF2E54] ring-1 ring-[#FF2E54]/30'
                            : 'border-amber-300 dark:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">{entry.customerName}</p>
                            {entry.customerPhone ? (
                              <p className="cg-tabular text-[11px] text-slate-500 dark:text-[#94A3B8]">{entry.customerPhone}</p>
                            ) : null}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              !entry.assumedByHuman
                                ? 'bg-[#FF2E54]/15 text-[#FF2E54]'
                                : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {!entry.assumedByHuman ? 'Aguardando humano' : 'Em atendimento humano'}
                          </span>
                        </div>

                        {/* Timeline color-coded tags */}
                        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                          <span className="rounded-md bg-slate-100 dark:bg-[#1E293B] px-2 py-0.5 text-slate-700 dark:text-slate-300">
                            Cliente: "{entry.message.slice(0, 75)}"
                          </span>
                          <span className="rounded-md bg-[#FF2E54]/10 px-2 py-0.5 text-[#FF2E54]">
                            {entry.pausedBy === 'manual_human_reply'
                              ? 'Pausa Automática (.message-out · humano respondeu)'
                              : 'Sofia pausada neste chat'}
                          </span>
                        </div>

                        {/* Co-Piloto #FF2E54 Draft Pills */}
                        <div className="space-y-1.5 rounded-lg border border-[#FF2E54]/20 bg-[#FF2E54]/5 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-[#FF2E54] flex items-center gap-1">
                              <Sparkles className="size-3" />
                              Co-Piloto (2 sugestões prontas)
                            </span>
                            <button
                              type="button"
                              data-testid={`wpp-load-copilot-btn-${entry.key}`}
                              onClick={() => void handleLoadCopilotDrafts(entry)}
                              className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400 hover:underline"
                            >
                              {loadingDraftsKey === entry.key
                                ? 'Gerando...'
                                : copilotDrafts.length > 0
                                  ? 'Atualizar'
                                  : 'Gerar sugestões'}
                            </button>
                          </div>
                          {copilotDrafts.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {copilotDrafts.map((draft, idx) => (
                                <button
                                  key={draft.id}
                                  type="button"
                                  data-testid={`wpp-copilot-draft-pill-${idx}`}
                                  onClick={() => void handleCopyCopilotDraft(draft)}
                                  className="text-left rounded-lg border border-[#FF2E54]/30 bg-white dark:bg-[#111726] px-2.5 py-2 text-[11px] text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#FF2E54] transition"
                                >
                                  <span className="block font-bold text-[#FF2E54] mb-0.5">
                                    {copiedDraftId === draft.id ? 'Copiado!' : draft.label}
                                  </span>
                                  <span className="line-clamp-2 text-slate-600 dark:text-[#CBD5E1]">{draft.text}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                          {!entry.assumedByHuman && (
                            <ActionButton
                              variant="secondary"
                              size={44}
                              isLoading={isAssuming}
                              loadingText="Assumindo..."
                              onClick={() => void handleAssumeHuman(entry)}
                            >
                              Assumir
                            </ActionButton>
                          )}
                          <ActionButton
                            variant="success"
                            size={44}
                            data-testid="wpp-resume-ai-btn"
                            isLoading={isResuming}
                            loadingText="Retomando..."
                            leftIcon={<Bot className="size-4" />}
                            onClick={() =>
                              void handleResumeAi(entry.customerPhone, entry.customerJid, entry.eventId)
                            }
                          >
                            Retomar IA
                          </ActionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Drawer 2: Mensagens Rápidas */}
          {activeSideDrawer === 'quick_replies' && (
            <div
              data-testid="wpp-quick-replies-drawer-panel"
              className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-slate-50 dark:bg-[#090D16] p-4 space-y-3 transition-all duration-150"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-2">
                  <Zap className="size-4 text-amber-500" />
                  Mensagens Rápidas (0 cr por gatilho)
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSideDrawer('none')}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  Fechar
                </button>
              </div>
              <QuickRepliesSection profile={profile} owner={effectiveUserId} compact />
            </div>
          )}

          {/* Drawer 3: Biblioteca da Loja (Drag & Drop + Ctrl+V, ZERO termos técnicos) */}
          {activeSideDrawer === 'docs' && (
            <div
              data-testid="wpp-docs-drawer-panel"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverLibrary(true);
              }}
              onDragLeave={() => setDragOverLibrary(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverLibrary(false);
                void handleUploadKnowledgeFiles(e.dataTransfer?.files || null);
              }}
              onPaste={(e) => void handlePasteKnowledgeSnippet(e)}
              tabIndex={0}
              className={`rounded-2xl border p-4 space-y-3 transition-all duration-150 outline-none ${
                dragOverLibrary
                  ? 'border-[#2563EB] bg-blue-100/70 dark:bg-blue-500/20'
                  : 'border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-2">
                  <FolderClosed className="size-4 text-[#2563EB] dark:text-blue-400" />
                  <span className="cg-tabular">{aiFiles.length} documento(s) de apoio da loja</span>
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
                    className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                Arraste arquivos aqui (.txt, .md, .csv, até 5 MB) ou pressione <strong>Ctrl+V</strong> para colar regras de troca, prazos ou tabelas.
              </p>
              {aiFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {aiFiles.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 dark:border-[#334155] bg-white dark:bg-[#090D16] px-3 py-2 text-xs"
                    >
                      <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-[#F8FAFC] truncate">
                        <FileText className="size-3.5 shrink-0 text-[#2563EB]" />
                        <span className="truncate">{f.title}</span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="cg-tabular text-[11px] font-mono text-slate-500 dark:text-[#94A3B8]">
                          {Math.max(1, Math.round(f.content.length / 1024))} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveFile(f.id)}
                          aria-label={`Remover documento ${f.title}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-600"
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

          {/* Instruções da Sofia + Controles Sempre Visíveis */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-slate-50/70 dark:bg-[#090D16] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                data-testid="wpp-ai-brain-collapse-btn"
                aria-expanded={aiBrainExpanded}
                onClick={() => setAiBrainExpanded((prev) => !prev)}
                className="flex min-w-[210px] flex-1 items-center gap-2 text-left"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-slate-500 transition-transform ${aiBrainExpanded ? 'rotate-180' : ''}`}
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">Instruções da Sofia</h2>
                  <p className="truncate text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    Regras diretas combinadas com seu catálogo real.
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
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200'
                      : 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                  }`}
                >
                  {safeTestMode ? 'Teste Seguro: Ativo' : 'Modo Teste Seguro'}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={aiEnabled}
                  onClick={() => void persistAiState(aiPrompt, !aiEnabled, aiFiles, !aiEnabled ? 'IA ativada' : 'IA pausada')}
                  className={`inline-flex min-h-[40px] shrink-0 items-center rounded-xl border px-3 text-xs font-bold transition-transform active:scale-[0.98] ${
                    aiEnabled
                      ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-[#334155] bg-slate-100 dark:bg-[#1E293B] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {aiEnabled ? 'IA Ativa' : 'IA Pausada'}
                </button>
              </div>
            </div>

            {aiBrainExpanded && (
              loadingAi ? (
                <SkeletonBlock width="100%" height="140px" rounded="xl" />
              ) : (
                <div className="space-y-3 border-t border-slate-200/70 dark:border-[#1E293B] pt-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="wpp-ai-single-prompt" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Como você quer que a Sofia atenda seus clientes no WhatsApp?
                    </label>
                    <textarea
                      id="wpp-ai-single-prompt"
                      data-testid="wpp-ai-single-prompt"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={4}
                      placeholder="Ex.: Atenda com cordialidade, informe valores do catálogo, confirme prazo de entrega e transfira para um humano se o cliente pedir desconto."
                      className="w-full resize-y rounded-xl border border-slate-300 dark:border-[#334155] bg-white dark:bg-[#111726] p-3 text-sm text-[#0F172A] dark:text-[#F8FAFC] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/25"
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
                      Salvar Instruções
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      size={44}
                      data-testid="recheck-wpp-ai-connection"
                      leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
                      onClick={() => void loadAiContext()}
                    >
                      Verificar IA
                    </ActionButton>

                    {undoVisible && lastSavedSnapshot && (
                      <button
                        type="button"
                        onClick={() => void handleUndo()}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-500/20 px-3 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100"
                      >
                        <Undo2 className="size-3.5" />
                        Desfazer
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Acordeão Inferior (Padrão RECOLHIDO): Autonomia & Concisão */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-slate-50/70 dark:bg-[#090D16]">
            <button
              type="button"
              data-testid="wpp-autonomy-accordion-toggle"
              aria-expanded={autonomyAccordionOpen}
              onClick={() => setAutonomyAccordionOpen((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]"
            >
              <span className="truncate">
                {autonomyAccordionOpen ? '▾' : '▸'} Sofia: Modo {autonomyModeLabel} · {concisenessStatus}
              </span>
              <span className="cg-tabular shrink-0 text-[11px] font-medium text-slate-500 dark:text-[#94A3B8]">
                {promptLen}/900 chars
              </span>
            </button>

            {autonomyAccordionOpen && (
              <div
                data-testid="wpp-autonomy-accordion-panel"
                className="space-y-3 border-t border-slate-200 dark:border-[#1E293B] p-3.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-[#94A3B8]">
                    <span>Concisão da instrução (ideal até 500 caracteres)</span>
                    <span className="cg-tabular">{promptLen} chars · {concisenessStatus}</span>
                  </div>
                  <div className="h-[4px] w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#1E293B]">
                    <div
                      data-testid="wpp-conciseness-bar"
                      className={`h-full transition-all duration-200 ${
                        promptLen <= 500 ? 'bg-[#10B981]' : promptLen <= 900 ? 'bg-amber-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${Math.max(8, concisenessPct)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#94A3B8]">
                    Nível de Autonomia
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {[
                      { id: 'sugestao' as const, title: 'Só Sugestão', desc: 'Prepara rascunho sem enviar só' },
                      { id: 'misto' as const, title: 'Misto', desc: 'Responde catálogo e escala humanos' },
                      { id: 'autonomo' as const, title: 'Autônomo', desc: 'Conduz vendas do início ao fim' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`wpp-autonomy-option-${opt.id}`}
                        disabled={savingAi}
                        onClick={() =>
                          void persistAiState(
                            aiPrompt,
                            aiEnabled,
                            aiFiles,
                            `Autonomia alterada para ${opt.title}`,
                            safeTestMode,
                            opt.id,
                          )
                        }
                        className={`rounded-xl border p-2.5 text-left transition ${
                          autonomyMode === opt.id
                            ? 'border-[#2563EB] bg-blue-50/70 dark:bg-blue-500/15 text-[#1E3A8A] dark:text-blue-200 ring-1 ring-[#2563EB]/30'
                            : 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                        }`}
                      >
                        <span className="block text-xs font-bold">{opt.title}</span>
                        <span className="block text-[10px] opacity-80">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* COLUNA DIREITA (~68%) — Canal & Sandbox (Simulador Seguro ↔ WhatsApp Real com Tela Cheia sem desmontar <webview>) */}
        <section
          aria-label="Canal e Sandbox da Sofia"
          data-testid="wpp-channel-section"
          data-fullscreen={whatsappFullscreen ? 'true' : 'false'}
          className={
            whatsappFullscreen
              ? 'fixed inset-0 z-40 flex min-w-0 flex-col overflow-hidden bg-white dark:bg-[#111726] shadow-2xl'
              : 'flex min-w-0 min-h-[680px] lg:h-[calc(100vh-195px)] flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] shadow-sm'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-[#1E293B] bg-slate-50/70 dark:bg-[#090D16] px-4 py-2">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] p-1">
              <button
                type="button"
                data-testid="wpp-mode-simulator-btn"
                onClick={() => setChannelTab('simulator')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  channelTab === 'simulator'
                    ? 'bg-[#2563EB] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                Simulador Seguro
              </button>
              <button
                type="button"
                data-testid="wpp-mode-real-btn"
                onClick={() => setChannelTab('real')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  channelTab === 'real'
                    ? 'bg-[#0F172A] dark:bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                WhatsApp Real
              </button>
            </div>
            <div className="flex items-center gap-2">
              {channelTab === 'real' && (
                <>
                  <button
                    type="button"
                    data-testid="wpp-auto-repair-btn"
                    disabled={repairingWhatsapp}
                    onClick={() => void handleAutoRepairWhatsapp()}
                    title="Limpar cache do WhatsApp Web mantendo sua conta conectada"
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E293B] transition disabled:opacity-50"
                  >
                    <Wrench className={`size-3.5 ${repairingWhatsapp ? 'animate-spin' : ''}`} />
                    <span>{repairingWhatsapp ? 'Reparando...' : 'Corrigir WhatsApp'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="wpp-fullscreen-toggle-btn"
                    onClick={() => setWhatsappFullscreen((prev) => !prev)}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/15 px-2.5 text-[11px] font-bold text-[#2563EB] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition"
                  >
                    {whatsappFullscreen ? (
                      <>
                        <Minimize2 className="size-3.5" />
                        <span>Sair da Tela Cheia (Esc)</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="size-3.5" />
                        <span>Expandir (Tela Cheia)</span>
                      </>
                    )}
                  </button>
                </>
              )}
              {channelTab === 'simulator' && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#94A3B8]">
                  Teste grátis sem tocar em clientes reais
                </span>
              )}
            </div>
          </div>

          {channelTab === 'simulator' ? (
            <div data-testid="wpp-sofia-live-tester" className="flex flex-1 flex-col gap-3 p-4 sm:p-5 overflow-y-auto">
              {/* Mini-barra clicável com SKUs reais do catálogo */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                  Testar rapidamente com item real do seu catálogo:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {catalogQuickSkus.length > 0 ? (
                    catalogQuickSkus.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        data-testid={`wpp-sim-sku-${prod.id}`}
                        disabled={simSending}
                        onClick={() => void handleRunLiveSofiaTest(`Quero 1 ${prod.name}`, 'simulator')}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] px-2.5 text-[11px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB] hover:bg-blue-50 dark:hover:bg-blue-500/15 transition"
                      >
                        <span className="truncate max-w-[140px]">Quero 1 {prod.name}</span>
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      data-testid="wpp-sim-sku-default"
                      disabled={simSending}
                      onClick={() => void handleRunLiveSofiaTest('Quero comprar 1 produto da loja no Pix', 'simulator')}
                      className="inline-flex min-h-[32px] items-center rounded-full border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] px-3 text-[11px] font-semibold text-[#0F172A] dark:text-[#F8FAFC] hover:border-[#2563EB]"
                    >
                      Testar pedido de catálogo
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="wpp-sim-audio-btn"
                    disabled={simSending}
                    onClick={() => void handleSimulateAudioNote(false)}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition"
                  >
                    <Mic className="size-3" />
                    Testar Áudio
                  </button>
                  <button
                    type="button"
                    data-testid="wpp-sim-audio-invalid-btn"
                    disabled={simSending}
                    onClick={() => void handleSimulateAudioNote(true)}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-2.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200 hover:bg-amber-100 transition"
                  >
                    Áudio &gt;4MB / Inválido
                  </button>
                </div>
              </div>

              {/* Input livre de simulação */}
              <div className="flex gap-2">
                <input
                  type="text"
                  data-testid="wpp-sofia-test-input"
                  value={simMessage}
                  onChange={(e) => setSimMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRunLiveSofiaTest(undefined, 'simulator');
                  }}
                  placeholder="Digite como um cliente (ex: Tem entrega hoje? Quero Pix)..."
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] px-3 text-xs text-[#0F172A] dark:text-[#F8FAFC] focus:bg-white dark:focus:bg-[#111726] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                />
                <ActionButton
                  variant="primary"
                  size={44}
                  data-testid="wpp-sofia-test-send"
                  isLoading={simSending}
                  loadingText="Enviando..."
                  onClick={() => void handleRunLiveSofiaTest(undefined, 'simulator')}
                >
                  Simular
                </ActionButton>
              </div>

              {/* Transcrição explícita de áudio e fallback honesto (M5) */}
              {simAudioTranscript && (
                <div
                  data-testid="wpp-sim-audio-transcript"
                  className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/70 dark:bg-blue-500/10 px-3 py-2 text-xs text-[#1E3A8A] dark:text-blue-200"
                >
                  🎤 <strong>Transcrito:</strong> "{simAudioTranscript}"
                </div>
              )}

              {simAudioFallback && (
                <div
                  data-testid="wpp-sim-audio-fallback"
                  role="alert"
                  className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
                >
                  <strong>Fallback honesto (STT):</strong> {simAudioFallback}
                </div>
              )}

              {/* Área de bolhas simuladas + indicador humanizado + hover Re-testar */}
              {simResult ? (
                <div
                  data-testid="wpp-sofia-test-output"
                  className="group relative space-y-2.5 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/10 p-3.5 text-xs text-[#0F172A] dark:text-[#F8FAFC]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="cg-tabular inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      Digitando em {simResult.antiBanDelaySec}s — proteção anti-bloqueio
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(simResult.hallucinationBlocked || simResult.securityBlocked) && (
                        <span
                          data-testid="wpp-sim-shield-badge"
                          className="rounded-full bg-[#FF2E54]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF2E54]"
                        >
                          Escudo Preço Oficial Ativo
                        </span>
                      )}
                      {simResult.isSimulationOrder && (
                        <span
                          data-testid="wpp-sim-order-badge"
                          className="rounded-full bg-amber-100 dark:bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200"
                        >
                          Simulação
                        </span>
                      )}
                      {simLastQuery && (
                        <button
                          type="button"
                          data-testid="wpp-sim-retest-btn"
                          onClick={() => void handleRunLiveSofiaTest(simLastQuery, 'simulator')}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#111726] px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
                        >
                          <RotateCcw className="size-3" />
                          Re-testar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {simResult.replyParts.map((bubble, bIdx) => (
                      <div
                        key={`bubble-${bIdx}`}
                        className="rounded-xl border border-emerald-100 dark:border-[#334155] bg-white dark:bg-[#111726] px-3 py-2 text-xs leading-relaxed text-[#0F172A] dark:text-[#F8FAFC] shadow-2xs"
                      >
                        {bubble}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-[#334155] bg-slate-50/50 dark:bg-[#090D16] p-6 text-center text-xs text-slate-500 dark:text-[#94A3B8]">
                  <Bot className="size-7 mb-2 text-[#2563EB]" />
                  <p className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">Simulador Seguro da Sofia</p>
                  <p className="mt-1 max-w-sm">
                    Clique em qualquer produto acima ou envie uma pergunta para ver exatamente como a Sofia responde no seu tom de voz, sem cobrar nenhum cliente real.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden p-2 sm:p-3 gap-2">
              {!whatsappFullscreen && (
                <div
                  data-testid="wpp-antiban-preqr-checks"
                  className="grid grid-cols-1 gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-900 dark:text-emerald-200 sm:grid-cols-3 shrink-0"
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="size-3.5 shrink-0 text-[#10B981]" />
                    Leitura humanizada (2–4s)
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="size-3.5 shrink-0 text-[#10B981]" />
                    Máx. 2 balões por resposta
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="size-3.5 shrink-0 text-[#10B981]" />
                    Pausa automática humana
                  </span>
                </div>
              )}

              {desktopBridge?.isDesktop && !whatsappFullscreen && (
                <div
                  data-testid="wpp-desktop-live-responder-status"
                  className="rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#090D16] px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 shrink-0"
                >
                  {responderStatus.active
                    ? `Atendente Desktop ativo no WhatsApp Web (${responderStatus.repliedCount} enviada${responderStatus.repliedCount === 1 ? '' : 's'})`
                    : 'Conecte o WhatsApp Web abaixo para ativar respostas ao vivo.'}
                </div>
              )}

              <div
                data-testid="wpp-real-preview-frame"
                className="flex-1 min-h-[600px] overflow-hidden rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16]"
              >
                {initialLoading && !data && !desktopBridge?.isDesktop ? (
                  <div className="p-5">
                    <SkeletonBlock width="100%" height="560px" rounded="xl" />
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
            </div>
          )}
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
