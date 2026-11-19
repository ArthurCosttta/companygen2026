import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  createBurstDebounceAccumulator,
  type BurstDebounceItem,
} from '../../shared/sofia/debounce-accumulator.mjs';

export { createBurstDebounceAccumulator, type BurstDebounceItem };

export interface DesktopHealthSnapshot {
  trayActive: boolean;
  webviewConnected: boolean;
  lastPollMs: number;
  appVersion: string;
  soundEnabled: boolean;
}

export interface ManualHumanReplyEvent {
  action?: string;
  customerKey?: string;
  customerName?: string;
  chatTitle?: string;
  chatPhone?: string;
  snippet?: string;
  msgKey?: string;
  ts?: number;
}

export interface DesktopWhatsappBridge {
  isDesktop?: boolean;
  openWhatsAppExternal?: () => Promise<unknown>;
  readWhatsAppIdentity?: () => Promise<{
    connected?: boolean;
    loggedIn?: boolean;
    phoneE164?: string;
    source?: string;
  }>;
  pollWhatsAppInbox?: () => Promise<{
    loggedIn?: boolean;
    connected?: boolean;
    phoneE164?: string;
    action?: string;
    customerKey?: string;
    customerName?: string;
    snippet?: string;
    chatTitle?: string;
    chatPhone?: string;
    isSelfChat?: boolean;
    msgKey?: string;
    text?: string;
    selectorHealth?: 'ok' | 'degraded';
    missingSelector?: string;
    error?: string;
  }>;
  sendWhatsAppReply?: (payload: {
    chatTitle?: string;
    text: string;
    replyParts?: string[];
    mediaItems?: Array<{ url: string; caption?: string; productName?: string }>;
    typingDurationMs?: number;
    replyJobId?: string;
  }) => Promise<{ ok?: boolean; method?: string; mediaSentCount?: number; error?: string }>;
  logoutWhatsAppWebview?: () => Promise<{ ok?: boolean }>;
  showWindow?: (tab?: string) => Promise<{ ok?: boolean }>;
  quitApp?: () => Promise<{ ok?: boolean }>;
  notifyDesktop?: (payload: { title: string; body: string }) => Promise<{ ok?: boolean }>;
  setTrayStatus?: (payload: {
    active?: boolean;
    phase?: string;
    summary?: string;
    repliedCount?: number;
    soundEnabled?: boolean;
  }) => Promise<{ ok?: boolean }>;
  getHealthSnapshot?: () => Promise<DesktopHealthSnapshot>;
  onWhatsappTypingProgress?: (
    callback: (data: {
      chatTitle?: string;
      replyJobId?: string;
      typedChars?: number;
      totalChars?: number;
      phase?: string;
      navigateTab?: string;
    }) => void,
  ) => () => void;
  onManualHumanReply?: (callback: (data: ManualHumanReplyEvent) => void) => () => void;
  onUpdaterStatus?: (
    callback: (data: { status: 'checking' | 'available' | 'downloaded' | 'error'; version?: string }) => void,
  ) => () => void;
  installDesktopUpdate?: () => Promise<{ ok?: boolean }>;
}

export interface LiveTypingPreview {
  chatTitle: string;
  phase: 'thinking' | 'typing' | 'sent' | 'paused_human';
  draftText: string;
  visibleChars: number;
  totalChars: number;
  etaSeconds: number;
}

export interface RuntimeFeedEvent {
  id: string;
  chatTitle: string;
  phase: string;
  summary: string;
  mediaCount?: number;
  createdAt: string;
}

export interface WebviewResponderStatus {
  active: boolean;
  processing: boolean;
  repliedCount: number;
  lastReplyAt: string | null;
  lastChatTitle: string;
  lastError: string;
  pauseReason?: 'credit_exhausted' | 'selector_degraded' | null;
  selectorHealth?: 'ok' | 'degraded';
  missingSelector?: string;
  cooldownRemainingSeconds?: number;
  liveTypingPreview?: LiveTypingPreview | null;
  recentEvents?: RuntimeFeedEvent[];
  humanPausedCustomerKeys?: string[];
}

export function isSoundMuted(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('companygen:sound_muted') === '1';
  } catch {
    return false;
  }
}

function playToneSequence(freqs: Array<{ freq: number; durationMs: number; delayMs: number; type?: OscillatorType; gain?: number }>) {
  if (isSoundMuted() || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const baseTime = ctx.currentTime;
    for (const step of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = step.type || 'sine';
      osc.frequency.setValueAtTime(step.freq, baseTime + step.delayMs / 1000);
      gain.gain.setValueAtTime(step.gain ?? 0.05, baseTime + step.delayMs / 1000);
      gain.gain.exponentialRampToValueAtTime(0.0001, baseTime + (step.delayMs + step.durationMs) / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(baseTime + step.delayMs / 1000);
      osc.stop(baseTime + (step.delayMs + step.durationMs + 20) / 1000);
    }
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // Ignore blocked audio contexts in headless environments
  }
}

export function playSoftOrderChime(): void {
  playToneSequence([
    { freq: 587.33, durationMs: 140, delayMs: 0, type: 'triangle', gain: 0.04 },
    { freq: 880, durationMs: 220, delayMs: 110, type: 'triangle', gain: 0.04 },
  ]);
}

export function playHumanEscalationAlert(): void {
  playToneSequence([
    { freq: 740, durationMs: 120, delayMs: 0, type: 'sine', gain: 0.06 },
    { freq: 554.37, durationMs: 140, delayMs: 140, type: 'sine', gain: 0.06 },
    { freq: 740, durationMs: 160, delayMs: 300, type: 'sine', gain: 0.06 },
  ]);
}

const sharedInFlightChatKeys = new Set<string>();
const sharedProcessedMsgIds = new Map<string, number>();
const sharedRecentBotEchoes = new Map<string, number>();
const sharedRetryAttempts = new Map<string, number>();
const sharedHumanPausedKeys = new Set<string>();

function normalizeEchoText(raw: string): string {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[*_~`"'.,!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pruneSharedMaps() {
  const now = Date.now();
  for (const [k, ts] of sharedProcessedMsgIds.entries()) {
    if (now - ts > 5 * 60 * 1000) sharedProcessedMsgIds.delete(k);
  }
  for (const [k, ts] of sharedRecentBotEchoes.entries()) {
    if (now - ts > 2 * 60 * 1000) sharedRecentBotEchoes.delete(k);
  }
}

export function getDesktopBridge(): DesktopWhatsappBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { companygenDesktop?: DesktopWhatsappBridge }).companygenDesktop;
}

export function useWebviewWhatsappResponder({
  userId,
  enabled,
  connected,
  phoneE164,
  onActivity,
}: {
  userId: string;
  enabled: boolean;
  connected: boolean;
  phoneE164?: string;
  onActivity?: () => void;
}): WebviewResponderStatus {
  const [status, setStatus] = useState<WebviewResponderStatus>({
    active: false,
    processing: false,
    repliedCount: 0,
    lastReplyAt: null,
    lastChatTitle: '',
    lastError: '',
    recentEvents: [],
    humanPausedCustomerKeys: [],
  });

  const inFlightRef = useRef(false);
  const recentKeysRef = useRef<Set<string>>(new Set());
  const repliedCountRef = useRef(0);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('companygen:wa-runtime-update', { detail: status }));
    } catch {}
  }, [status]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.isDesktop || !bridge.pollWhatsAppInbox || !bridge.sendWhatsAppReply || !enabled || !connected) {
      setStatus((prev) => (prev.active ? { ...prev, active: false, processing: false } : prev));
      void bridge?.setTrayStatus?.({
        active: false,
        phase: 'idle',
        summary: connected ? 'Sofia IA pausada' : 'Aguardando WhatsApp',
      });
      return;
    }

    const pollInbox = bridge.pollWhatsAppInbox;
    const sendReply = bridge.sendWhatsAppReply;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activeReplyProgressRef = { current: { replyJobId: '', visibleChars: 0, totalChars: 0 } };

    const persistRuntime = (payload: Record<string, unknown>) => {
      if (!userId) return;
      void authenticatedFetch(
        '/api/whatsapp/ai/runtime',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true, trayBackground: true, ...payload }),
        },
        userId,
      ).catch(() => {});
    };

    const handleManualTakeoverSignal = async (signal: ManualHumanReplyEvent) => {
      if (!live) return;
      const customerName = String(signal.customerName || signal.chatTitle || 'Cliente WhatsApp').trim();
      const customerPhone = String(signal.chatPhone || '').trim();
      const customerKey = normalizeEchoText(signal.customerKey || customerPhone || customerName || 'chat');
      if (!customerKey) return;

      sharedHumanPausedKeys.add(customerKey);
      burstAccumulator.cancel(customerKey);
      playHumanEscalationAlert();

      setStatus((prev) => ({
        ...prev,
        humanPausedCustomerKeys: Array.from(sharedHumanPausedKeys),
        liveTypingPreview: {
          chatTitle: customerName,
          phase: 'paused_human',
          draftText: `Resposta manual detectada — IA pausada somente para ${customerName}.`,
          visibleChars: 64,
          totalChars: 64,
          etaSeconds: 0,
        },
      }));

      if (userId) {
        await authenticatedFetch(
          '/api/whatsapp/events/ack',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'human_takeover_pause',
              customerKey,
              customerPhone,
              customerName,
              snippet: String(signal.snippet || '').slice(0, 140),
            }),
          },
          userId,
        ).catch(() => {});
      }
      onActivityRef.current?.();
    };

    const markMessageProcessed = (msgDedupeKey: string) => {
      sharedProcessedMsgIds.set(msgDedupeKey, Date.now());
      sharedRetryAttempts.delete(msgDedupeKey);
      recentKeysRef.current.add(msgDedupeKey);
      if (recentKeysRef.current.size > 400) {
        const first = recentKeysRef.current.values().next().value;
        if (first) recentKeysRef.current.delete(first);
      }
    };

    const processCustomerBurst = async (
      chatDedupKey: string,
      mergedText: string,
      meta: {
        chatTitle: string;
        chatPhone: string;
        isSelfChat: boolean;
        lastMsgDedupeKey: string;
      },
    ) => {
      if (!live || sharedHumanPausedKeys.has(chatDedupKey)) return;
      if (sharedInFlightChatKeys.has(chatDedupKey)) return;
      sharedInFlightChatKeys.add(chatDedupKey);

      const { chatTitle, chatPhone, isSelfChat, lastMsgDedupeKey } = meta;

      try {
        setStatus((prev) => ({
          ...prev,
          processing: true,
          lastError: '',
          liveTypingPreview: {
            chatTitle,
            phase: 'thinking',
            draftText: '',
            visibleChars: 0,
            totalChars: 0,
            etaSeconds: 4,
          },
        }));
        void bridge.setTrayStatus?.({
          active: true,
          phase: 'thinking',
          summary: `Pensando resposta para ${chatTitle}...`,
        });
        persistRuntime({ phase: 'thinking', chatTitle, draftText: '', typedChars: 0, totalChars: 0 });

        const fallbackTitleSlug = (chatTitle || 'cliente')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'cliente';
        const resolvedCustomerPhone = chatPhone || (isSelfChat ? phoneE164 || '' : '');
        const resolvedCustomerJid = resolvedCustomerPhone
          ? `${resolvedCustomerPhone}@s.whatsapp.net`
          : `wv:${fallbackTitleSlug}`;

        const aiRes = await authenticatedFetch(
          '/api/whatsapp/ai/classify-and-draft',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName: chatTitle || 'Cliente WhatsApp',
              customerPhone: resolvedCustomerPhone,
              customerJid: resolvedCustomerJid,
              isSelfChat: Boolean(isSelfChat),
              messageText: mergedText,
              mode: 'live_whatsapp',
              source: 'electron_webview',
            }),
          },
          userId,
        );

        const aiJson = (await aiRes.json().catch(() => null)) as {
          ok?: boolean;
          intent?: string;
          replyText?: string;
          replyParts?: string[];
          mediaItems?: Array<{ url: string; caption?: string; productName?: string }>;
          autoReplySuppressed?: boolean;
          suppressionReason?: string;
          cooldownSeconds?: number;
          pausedForHuman?: boolean;
          required?: number;
          balance?: number;
          error?: string;
        } | null;

        if (!live) return;

        if (aiRes.status === 402) {
          pausedByCredits = true;
          const errText = aiJson?.error || 'Créditos de IA esgotados. Recarregue para continuar respondendo.';
          setStatus((prev) => ({
            ...prev,
            active: false,
            processing: false,
            pauseReason: 'credit_exhausted',
            liveTypingPreview: null,
            lastError: errText,
          }));
          persistRuntime({ phase: 'paused_credits', lastError: errText });
          try {
            window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: aiJson || { status: 402 } }));
          } catch {}
          return;
        }

        if (!aiRes.ok || !aiJson?.ok) {
          const tries = (sharedRetryAttempts.get(lastMsgDedupeKey) || 0) + 1;
          sharedRetryAttempts.set(lastMsgDedupeKey, tries);
          const errText = aiJson?.error || `Falha ao gerar resposta (${aiRes.status}).`;
          if (tries >= 3) {
            markMessageProcessed(lastMsgDedupeKey);
          }
          setStatus((prev) => ({
            ...prev,
            processing: false,
            liveTypingPreview: null,
            lastError: errText,
          }));
          persistRuntime({ phase: 'error', lastError: errText });
          return;
        }

        if (!aiJson.autoReplySuppressed && String(aiJson.replyText || '').trim()) {
          const replyText = String(aiJson.replyText || '').trim();
          const replyParts = Array.isArray(aiJson.replyParts) && aiJson.replyParts.length >= 2
            ? aiJson.replyParts.slice(0, 2)
            : [replyText];
          const echoKey = `${chatDedupKey}::${normalizeEchoText(replyText)}`;
          sharedRecentBotEchoes.set(echoKey, Date.now());
          for (const part of replyParts) {
            sharedRecentBotEchoes.set(`${chatDedupKey}::${normalizeEchoText(part)}`, Date.now());
          }

          const totalChars = Array.from(replyText).length;
          const remainingTypingMs = Math.max(2400, Math.min(35000, totalChars * 75 + 900));
          const typingStartedAt = Date.now();
          const replyJobId = `${chatDedupKey}-${typingStartedAt}-${Math.random().toString(36).slice(2, 7)}`;
          activeReplyProgressRef.current = { replyJobId, visibleChars: 0, totalChars };

          setStatus((prev) => ({
            ...prev,
            processing: true,
            liveTypingPreview: {
              chatTitle,
              phase: 'typing',
              draftText: replyText,
              visibleChars: 0,
              totalChars,
              etaSeconds: Math.max(1, Math.ceil(remainingTypingMs / 1000)),
            },
          }));
          void bridge.setTrayStatus?.({
            active: true,
            phase: 'typing',
            summary: `Digitando para ${chatTitle}...`,
          });

          const animTimer = setInterval(() => {
            if (!live) return;
            if (activeReplyProgressRef.current.visibleChars > 0) return;
            const elapsed = Date.now() - typingStartedAt;
            const ratio = Math.min(0.95, elapsed / Math.max(800, remainingTypingMs));
            const etaSeconds = Math.max(1, Math.ceil((remainingTypingMs - elapsed) / 1000));
            setStatus((prev) => ({
              ...prev,
              processing: true,
              liveTypingPreview: {
                chatTitle,
                phase: 'typing',
                draftText: replyText,
                visibleChars: Math.max(1, Math.round(totalChars * ratio)),
                totalChars,
                etaSeconds,
              },
            }));
          }, 140);

          let sent: { ok?: boolean; method?: string; mediaSentCount?: number; error?: string } | undefined;
          try {
            sent = await sendReply({
              chatTitle,
              text: replyText,
              replyParts,
              mediaItems: Array.isArray(aiJson.mediaItems) ? aiJson.mediaItems : [],
              typingDurationMs: remainingTypingMs,
              replyJobId,
            });
          } finally {
            clearInterval(animTimer);
            activeReplyProgressRef.current = { replyJobId: '', visibleChars: 0, totalChars: 0 };
          }
          if (!live) return;

          if (sent?.ok) {
            markMessageProcessed(lastMsgDedupeKey);
            const sentAt = new Date().toISOString();
            const nextMediaCount = Number(sent.mediaSentCount || 0);
            if (aiJson.pausedForHuman) {
              sharedHumanPausedKeys.add(chatDedupKey);
              playHumanEscalationAlert();
              void bridge.notifyDesktop?.({
                title: `Fila Humana: ${chatTitle}`,
                body: 'Cliente pediu atendimento humano e foi pausado para você assumir.',
              });
            } else if (aiJson.intent === 'PURCHASE_ORDER') {
              playSoftOrderChime();
              void bridge.notifyDesktop?.({
                title: `Novo pedido no WhatsApp: ${chatTitle}`,
                body: replyText.slice(0, 120),
              });
            }
            const updatedCount = repliedCountRef.current + 1;
            repliedCountRef.current = updatedCount;
            setStatus((prev) => {
              const newEvent: RuntimeFeedEvent = {
                id: replyJobId,
                chatTitle,
                phase: aiJson.pausedForHuman ? 'paused_human' : 'sent',
                summary: replyText.slice(0, 140),
                mediaCount: nextMediaCount,
                createdAt: sentAt,
              };
              return {
                ...prev,
                processing: false,
                repliedCount: Math.max(prev.repliedCount + 1, updatedCount),
                lastReplyAt: sentAt,
                lastChatTitle: chatTitle,
                lastError: '',
                humanPausedCustomerKeys: Array.from(sharedHumanPausedKeys),
                recentEvents: [newEvent, ...(prev.recentEvents || [])].slice(0, 20),
                liveTypingPreview: {
                  chatTitle,
                  phase: aiJson.pausedForHuman ? 'paused_human' : 'sent',
                  draftText: replyText,
                  visibleChars: totalChars,
                  totalChars,
                  etaSeconds: 0,
                },
              };
            });
            void bridge.setTrayStatus?.({
              active: true,
              phase: 'sent',
              summary: `Sofia IA ativa (${updatedCount} enviadas)`,
              repliedCount: updatedCount,
            });
            persistRuntime({
              phase: aiJson.pausedForHuman ? 'paused_human' : 'sent',
              chatTitle,
              lastChatTitle: chatTitle,
              lastReplyAt: sentAt,
              draftText: replyText,
              typedChars: totalChars,
              totalChars,
              lastMediaCount: nextMediaCount,
              repliedCount: updatedCount,
              lastError: '',
            });
          } else {
            const tries = (sharedRetryAttempts.get(lastMsgDedupeKey) || 0) + 1;
            sharedRetryAttempts.set(lastMsgDedupeKey, tries);
            if (tries >= 3) markMessageProcessed(lastMsgDedupeKey);
            const errText = sent?.error || 'Não foi possível enviar a resposta no WhatsApp Web.';
            setStatus((prev) => ({
              ...prev,
              processing: false,
              liveTypingPreview: null,
              lastError: errText,
            }));
            persistRuntime({ phase: 'error', lastError: errText });
          }
        } else {
          markMessageProcessed(lastMsgDedupeKey);
          const suppressionMessage =
            aiJson.suppressionReason === 'safe_test_mode_third_party'
              ? 'Modo Teste Seguro ativo: resposta a terceiros ignorada.'
              : aiJson.suppressionReason === 'anti_ban_cooldown'
                ? `Proteção anti-ban ativa (${aiJson.cooldownSeconds || 15}s de pausa).`
                : aiJson.suppressionReason === 'bot_manual_pause'
                  ? 'Bot pausado manualmente neste atendimento.'
                  : aiJson.suppressionReason === 'bot_inactive' || aiJson.suppressionReason === 'brain_disabled'
                    ? 'Auto-resposta da Sofia está desativada nas configurações do WhatsApp.'
                    : aiJson.pausedForHuman
                      ? `Chat "${chatTitle || 'Cliente'}" está pausado aguardando humano na Fila Humana. Clique em "Retomar IA" para voltar a responder.`
                      : '';
          setStatus((prev) => ({
            ...prev,
            processing: false,
            cooldownRemainingSeconds: Number(aiJson.cooldownSeconds || 0) || undefined,
            lastError: suppressionMessage || prev.lastError,
            liveTypingPreview: aiJson.pausedForHuman
              ? {
                  chatTitle,
                  phase: 'paused_human',
                  draftText: 'Aguardando atendimento humano na Fila Humana.',
                  visibleChars: 48,
                  totalChars: 48,
                  etaSeconds: 0,
                }
              : null,
          }));
        }

        onActivityRef.current?.();
      } finally {
        sharedInFlightChatKeys.delete(chatDedupKey);
      }
    };

    const burstAccumulator = createBurstDebounceAccumulator<{
      chatTitle: string;
      chatPhone: string;
      isSelfChat: boolean;
      lastMsgDedupeKey: string;
    }>({
      debounceMs: 4500,
      maxWaitMs: 10000,
      onFlush: (chatDedupKey, mergedText, meta) => processCustomerBurst(chatDedupKey, mergedText, meta),
    });

    if (userId) {
      void authenticatedFetch('/api/whatsapp/ai/runtime', undefined, userId)
        .then((r) => r.json())
        .then((json: { ok?: boolean; runtime?: { repliedCount?: number; lastReplyAt?: string | null; lastChatTitle?: string; recentEvents?: RuntimeFeedEvent[] } }) => {
          if (!live || !json?.ok || !json.runtime) return;
          const rt = json.runtime;
          const persistedCount = Math.max(repliedCountRef.current, Number(rt.repliedCount) || 0);
          repliedCountRef.current = persistedCount;
          setStatus((prev) => ({
            ...prev,
            repliedCount: Math.max(prev.repliedCount, persistedCount),
            lastReplyAt: prev.lastReplyAt || rt.lastReplyAt || null,
            lastChatTitle: prev.lastChatTitle || rt.lastChatTitle || '',
            recentEvents:
              (prev.recentEvents?.length || 0) > 0
                ? prev.recentEvents
                : Array.isArray(rt.recentEvents)
                  ? rt.recentEvents
                  : [],
          }));
          void bridge.setTrayStatus?.({
            active: true,
            phase: 'listening',
            summary: `Sofia IA ativa (${Math.max(0, Number(rt.repliedCount) || 0)} enviadas)`,
            repliedCount: Math.max(0, Number(rt.repliedCount) || 0),
          });
        })
        .catch(() => {});
    }

    const unsubProgress = bridge.onWhatsappTypingProgress?.((data) => {
      if (!live || !data) return;
      if (data.replyJobId && activeReplyProgressRef.current.replyJobId === data.replyJobId) {
        const nextChars = Math.max(0, Number(data.typedChars) || 0);
        const total = Math.max(nextChars, Number(data.totalChars) || activeReplyProgressRef.current.totalChars || 1);
        activeReplyProgressRef.current.visibleChars = nextChars;
        const remainingEta = Math.max(1, Math.ceil(((total - nextChars) * 72) / 1000));
        setStatus((prev) =>
          prev.liveTypingPreview?.phase === 'typing'
            ? {
                ...prev,
                liveTypingPreview: {
                  ...prev.liveTypingPreview,
                  visibleChars: nextChars,
                  totalChars: total,
                  etaSeconds: remainingEta,
                },
              }
            : prev,
        );
      }
    });

    const unsubManualHuman = bridge.onManualHumanReply?.((ev) => {
      void handleManualTakeoverSignal(ev);
    });

    setStatus((prev) => ({ ...prev, active: true, lastError: '' }));
    void bridge.setTrayStatus?.({
      active: true,
      phase: 'listening',
      summary: 'Sofia IA ativa em 2º plano',
      soundEnabled: !isSoundMuted(),
    });

    let pausedByCredits = false;

    const handleCreditsUpdated = () => {
      if (pausedByCredits && live) {
        pausedByCredits = false;
        setStatus((prev) => ({
          ...prev,
          active: true,
          pauseReason: null,
          lastError: '',
        }));
        if (timer) clearTimeout(timer);
        timer = setTimeout(runCycle, 400);
      }
    };
    window.addEventListener('companygen:credits-updated', handleCreditsUpdated);

    const runCycle = async () => {
      if (!live || pausedByCredits || inFlightRef.current) {
        if (live && !pausedByCredits) timer = setTimeout(runCycle, 1200);
        return;
      }

      inFlightRef.current = true;
      const nextDelayMs = 1200;
      try {
        const poll = await pollInbox();
        if (!live) return;

        if (poll?.selectorHealth === 'degraded') {
          setStatus((prev) => ({
            ...prev,
            selectorHealth: 'degraded',
            missingSelector: poll.missingSelector || '',
            pauseReason: 'selector_degraded',
            lastError: prev.lastError || `Seletor WhatsApp Web degradado (${poll.missingSelector || 'DOM alterado'}).`,
          }));
        } else if (poll?.loggedIn) {
          setStatus((prev) =>
            prev.selectorHealth === 'degraded'
              ? { ...prev, selectorHealth: 'ok', missingSelector: '', pauseReason: prev.pauseReason === 'selector_degraded' ? null : prev.pauseReason }
              : prev,
          );
        }

        if (poll?.action === 'manual_human_takeover') {
          await handleManualTakeoverSignal(poll);
        } else if (poll?.action === 'incoming' && poll.text?.trim()) {
          pruneSharedMaps();
          const chatTitle = String(poll.chatTitle || 'Cliente WhatsApp').trim();
          const chatDedupKey = normalizeEchoText(poll.chatPhone || chatTitle || 'chat');
          const msgDedupeKey = `${chatDedupKey}::${poll.msgKey || normalizeEchoText(poll.text)}`;
          const incomingEchoKey = `${chatDedupKey}::${normalizeEchoText(poll.text)}`;

          if (
            !sharedHumanPausedKeys.has(chatDedupKey) &&
            !sharedInFlightChatKeys.has(chatDedupKey) &&
            !sharedProcessedMsgIds.has(msgDedupeKey) &&
            !sharedRecentBotEchoes.has(incomingEchoKey) &&
            !recentKeysRef.current.has(msgDedupeKey)
          ) {
            markMessageProcessed(msgDedupeKey);
            burstAccumulator.enqueue(chatDedupKey, poll.text, {
              chatTitle,
              chatPhone: String(poll.chatPhone || '').trim(),
              isSelfChat: Boolean(poll.isSelfChat),
              lastMsgDedupeKey: msgDedupeKey,
            });
          }
        }
      } catch (err) {
        if (live) {
          setStatus((prev) => ({
            ...prev,
            processing: false,
            lastError: err instanceof Error ? err.message : 'Erro no ciclo do atendente WhatsApp Web.',
          }));
        }
      } finally {
        inFlightRef.current = false;
        if (live && !pausedByCredits) {
          timer = setTimeout(runCycle, nextDelayMs);
        }
      }
    };

    void runCycle();

    return () => {
      live = false;
      burstAccumulator.clearAll();
      window.removeEventListener('companygen:credits-updated', handleCreditsUpdated);
      if (timer) clearTimeout(timer);
      unsubProgress?.();
      unsubManualHuman?.();
    };
  }, [connected, enabled, phoneE164, userId]);

  return status;
}
