import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  D1FunnelMetrics,
  NotificationSeverityLevel,
  SimulatorMessage,
  WhatsappIncomingClassification,
  WhatsappNotificationEvent,
  WhatsappQueueItem,
} from '@/schemas/ai-whatsapp-intent.schema';
import { authenticatedFetch } from '@/services/supabase-client';

const DEFAULT_FUNNEL: D1FunnelMetrics = {
  visits: 0,
  productClicks: 0,
  whatsappPurchaseMessages: 0,
  d1ConfirmedOrders: 0,
  d1RevenueCents: 0,
  conversionRatePct: 0,
};

const MUTE_STORAGE_PREFIX = 'companygen_wpp_notify_mute_until:';
const MUTE_DURATION_MS = 15 * 60 * 1000;

let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

export async function playNotificationSound(level: NotificationSeverityLevel = 'HUMAN_ESCALATION'): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(level === 'HUMAN_ESCALATION' ? [140, 60, 140] : [80]);
    }
  } catch {}
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const freqs = level === 'HUMAN_ESCALATION' ? [880, 1174.66, 880, 1174.66] : [659.25, 880];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = level === 'HUMAN_ESCALATION' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.13);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.13 + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.13);
      osc.stop(now + idx * 0.13 + 0.125);
    });
    (window as unknown as Record<string, unknown>).__companygenLastNotificationAudioAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

export function formatBrlCents(cents: number): string {
  const safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safe / 100);
}

export function formatRelativeTimeBr(isoDate: string | null | undefined): string {
  if (!isoDate) return 'agora';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s atrás`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return new Date(isoDate).toLocaleDateString('pt-BR');
}

function dedupeNotifications(items: WhatsappNotificationEvent[]): WhatsappNotificationEvent[] {
  const seen = new Set<string>();
  const priority = (level: NotificationSeverityLevel): number => {
    if (level === 'HUMAN_ESCALATION') return 1;
    if (level === 'PURCHASE_MESSAGE_ARRIVED') return 2;
    return 3;
  };
  const unique = items.filter((item) => {
    const key = item.eventId || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => {
    const aDone = a.resolved || a.acknowledged ? 1 : 0;
    const bDone = b.resolved || b.acknowledged ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const pDiff = priority(a.level) - priority(b.level);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function readMuteUntil(owner: string): number {
  if (typeof window === 'undefined' || !owner) return 0;
  try {
    const raw = window.localStorage.getItem(`${MUTE_STORAGE_PREFIX}${owner}`);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
  } catch {
    return 0;
  }
}

export interface UseHighSaturationNotificationsOptions {
  owner?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export interface SimulateMessageInput {
  customerName?: string;
  customerPhone?: string;
  messageText: string;
  mode?: 'simulator' | 'live_whatsapp';
  customerClicksCount?: number;
  source?: 'vitrine_checkout' | 'whatsapp_direct' | 'simulator' | 'live_whatsapp';
}

export interface SimulateMessageResult {
  ok: boolean;
  intent?: WhatsappIncomingClassification['intent'];
  classification?: WhatsappIncomingClassification;
  notification?: WhatsappNotificationEvent | null;
  queueItem?: WhatsappQueueItem | null;
  replyText?: string;
  modelUsed?: string;
  usedFallback?: boolean;
  hallucinationBlocked?: boolean;
  pausedForHuman?: boolean;
  autoReplySuppressed?: boolean;
  d1Funnel?: D1FunnelMetrics;
  error?: string;
}

export interface AckNotificationInput {
  eventId?: string;
  queueItemId?: string;
  orderRef?: string;
  customerPhone?: string;
  customerJid?: string;
  action: 'ack' | 'assume_human' | 'resolve' | 'confirm_d1' | 'resume_ai';
}

export interface PausedThreadItem {
  chatKey: string;
  customerName: string;
  customerPhone: string;
  customerJid?: string;
  reason?: string;
  lastMessage?: string;
  pausedAt: string;
  assumedByHuman: boolean;
  assumedAt?: string | null;
}

export interface TrafficClickInput {
  productId?: string;
  productName?: string;
  sourceComponent?: string;
  incrementVisit?: boolean;
}

export function useHighSaturationNotifications({
  owner = '',
  enabled = true,
  pollIntervalMs = 4000,
}: UseHighSaturationNotificationsOptions = {}) {
  const [allNotifications, setAllNotifications] = useState<WhatsappNotificationEvent[]>([]);
  const [queueItems, setQueueItems] = useState<WhatsappQueueItem[]>([]);
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [d1Funnel, setD1Funnel] = useState<D1FunnelMetrics>(DEFAULT_FUNNEL);
  const [liveResponderActive, setLiveResponderActive] = useState(false);
  const [botConnected, setBotConnected] = useState(false);
  const [pausedThreads, setPausedThreads] = useState<string[]>([]);
  const [pausedThreadItems, setPausedThreadItems] = useState<PausedThreadItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muteUntilMs, setMuteUntilMs] = useState<number>(() => readMuteUntil(owner));

  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initialHydratedRef = useRef(false);
  const lastPayloadSignatureRef = useRef<string>('');
  const [lastSoundAt, setLastSoundAt] = useState<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    setMuteUntilMs(readMuteUntil(owner));
    initialHydratedRef.current = false;
    seenNotificationIdsRef.current = new Set();
    lastPayloadSignatureRef.current = '';
    return () => {
      mountedRef.current = false;
    };
  }, [owner]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const applyEventsPayload = useCallback((data: Record<string, unknown>) => {
    if (!mountedRef.current) return;
    const signature = JSON.stringify({
      notifications: data.notifications ?? null,
      queueItems: data.queueItems ?? null,
      simulatorMessages: data.simulatorMessages ?? null,
      d1Funnel: data.d1Funnel ?? null,
      liveResponderActive: data.liveResponderActive ?? null,
      botConnected: data.botConnected ?? null,
      pausedThreads: data.pausedThreads ?? null,
      pausedThreadItems: data.pausedThreadItems ?? null,
    });
    if (signature === lastPayloadSignatureRef.current) {
      return;
    }
    lastPayloadSignatureRef.current = signature;
    if (Array.isArray(data.notifications)) {
      const normalized = dedupeNotifications(data.notifications as WhatsappNotificationEvent[]);
      setAllNotifications(normalized);
      const unread = normalized.filter((n) => !n.resolved && !n.acknowledged);
      if (!initialHydratedRef.current) {
        unread.forEach((n) => seenNotificationIdsRef.current.add(n.eventId || n.id));
        initialHydratedRef.current = true;
      } else {
        const fresh = unread.filter((n) => !seenNotificationIdsRef.current.has(n.eventId || n.id));
        if (fresh.length > 0) {
          fresh.forEach((n) => seenNotificationIdsRef.current.add(n.eventId || n.id));
          if (readMuteUntil(ownerRef.current) <= Date.now()) {
            const top = fresh.find((f) => f.level === 'HUMAN_ESCALATION') || fresh[0];
            void playNotificationSound(top.level).then((played) => {
              if (played && mountedRef.current) setLastSoundAt(Date.now());
            });
          }
        }
      }
    }
    if (Array.isArray(data.queueItems)) {
      setQueueItems(data.queueItems as WhatsappQueueItem[]);
    }
    if (Array.isArray(data.simulatorMessages)) {
      setSimulatorMessages(data.simulatorMessages as SimulatorMessage[]);
    }
    if (data.d1Funnel && typeof data.d1Funnel === 'object') {
      setD1Funnel({ ...DEFAULT_FUNNEL, ...(data.d1Funnel as Partial<D1FunnelMetrics>) });
    }
    if (typeof data.liveResponderActive === 'boolean') {
      setLiveResponderActive(data.liveResponderActive);
    }
    if (typeof data.botConnected === 'boolean') {
      setBotConnected(data.botConnected);
    }
    if (Array.isArray(data.pausedThreads)) {
      setPausedThreads(data.pausedThreads as string[]);
    }
    if (Array.isArray(data.pausedThreadItems)) {
      setPausedThreadItems(data.pausedThreadItems as PausedThreadItem[]);
    }
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      const targetOwner = ownerRef.current.trim();
      if (!enabled || !targetOwner || inFlightRef.current) return;

      inFlightRef.current = true;
      if (!silent && mountedRef.current) {
        setIsLoading(true);
      }

      try {
        const res = await authenticatedFetch('/api/whatsapp/events', { method: 'GET' }, targetOwner);
        const payload = await res.json().catch(() => null);
        if (!mountedRef.current) return;

        if (!res.ok || !payload?.ok) {
          setError(payload?.error || `Falha ao sincronizar eventos (${res.status})`);
          return;
        }
        setError(null);
        applyEventsPayload(payload as Record<string, unknown>);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Erro ao buscar alertas do WhatsApp');
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [applyEventsPayload, enabled],
  );

  useEffect(() => {
    if (!enabled || !owner.trim()) return;
    void refresh(false);

    const intervalMs = Math.max(2500, pollIntervalMs);
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void refresh(true);
    }, intervalMs);

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refresh(true);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [enabled, owner, pollIntervalMs, refresh]);

  const ackNotification = useCallback(
    async (input: AckNotificationInput) => {
      const targetOwner = ownerRef.current.trim();
      if (!targetOwner) return { ok: false, error: 'Sessão indisponível.' };

      try {
        const res = await authenticatedFetch(
          '/api/whatsapp/events/ack',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          },
          targetOwner,
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) {
          return { ok: false, error: payload?.error || 'Não foi possível atualizar o item.' };
        }
        await refresh(true);
        return { ok: true, ...(payload as Record<string, unknown>) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Falha na requisição.' };
      }
    },
    [refresh],
  );

  const triggerSimulate = useCallback(
    async (input: SimulateMessageInput): Promise<SimulateMessageResult> => {
      const targetOwner = ownerRef.current.trim();
      if (!targetOwner) {
        return { ok: false, error: 'Sessão indisponível para simular WhatsApp.' };
      }
      setIsSimulating(true);
      try {
        const res = await authenticatedFetch(
          '/api/whatsapp/ai/simulate-or-reply',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerName: input.customerName || 'Cliente Simulado',
              customerPhone: input.customerPhone || '5511991000001',
              messageText: input.messageText,
              mode: input.mode || 'simulator',
              customerClicksCount: input.customerClicksCount,
              source: input.source,
            }),
          },
          targetOwner,
        );
        const payload = (await res.json().catch(() => null)) as SimulateMessageResult | null;
        if (!res.ok || !payload?.ok) {
          return { ok: false, error: payload?.error || 'Falha ao processar mensagem com Sofia.' };
        }
        await refresh(true);
        return payload;
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Erro de conexão com Sofia IA.' };
      } finally {
        if (mountedRef.current) {
          setIsSimulating(false);
        }
      }
    },
    [refresh],
  );

  const recordProductClick = useCallback(
    async (input: TrafficClickInput) => {
      const targetOwner = ownerRef.current.trim();
      if (!targetOwner) return { ok: false };
      try {
        const res = await authenticatedFetch(
          '/api/whatsapp/traffic/click',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          },
          targetOwner,
        );
        const payload = await res.json().catch(() => null);
        if (res.ok && payload?.ok && payload?.d1Funnel && mountedRef.current) {
          setD1Funnel({ ...DEFAULT_FUNNEL, ...payload.d1Funnel });
        }
        return payload || { ok: res.ok };
      } catch {
        return { ok: false };
      }
    },
    [],
  );

  const muteFor15Min = useCallback(() => {
    const until = Date.now() + MUTE_DURATION_MS;
    setMuteUntilMs(until);
    try {
      if (ownerRef.current) {
        window.localStorage.setItem(`${MUTE_STORAGE_PREFIX}${ownerRef.current}`, String(until));
      }
    } catch {}
  }, []);

  const unmute = useCallback(() => {
    setMuteUntilMs(0);
    try {
      if (ownerRef.current) {
        window.localStorage.removeItem(`${MUTE_STORAGE_PREFIX}${ownerRef.current}`);
      }
    } catch {}
  }, []);

  const activeNotifications = useMemo(
    () => allNotifications.filter((item) => !item.resolved && !item.acknowledged),
    [allNotifications],
  );

  const waitingHumanCount = useMemo(() => {
    const unassumedThreads = pausedThreadItems.filter((item) => !item.assumedByHuman).length;
    if (unassumedThreads > 0) return unassumedThreads;
    return allNotifications.filter(
      (n) => n.level === 'HUMAN_ESCALATION' && !n.resolved && !n.acknowledged,
    ).length;
  }, [allNotifications, pausedThreadItems]);

  const humanEscalationCount = useMemo(
    () =>
      pausedThreadItems.length ||
      allNotifications.filter((n) => n.level === 'HUMAN_ESCALATION' && !n.resolved).length ||
      queueItems.filter((q) => q.intent === 'HUMAN_ESCALATION' && q.status !== 'resolved').length,
    [allNotifications, pausedThreadItems, queueItems],
  );

  const purchaseAlertCount = useMemo(
    () => activeNotifications.filter((n) => n.level === 'PURCHASE_MESSAGE_ARRIVED').length,
    [activeNotifications],
  );

  const unreadUrgentCount = useMemo(
    () => activeNotifications.length,
    [activeNotifications],
  );

  const latestUrgentEvent = useMemo(
    () => activeNotifications[0] ?? null,
    [activeNotifications],
  );

  const isMuted = muteUntilMs > Date.now();
  const muteRemainingMinutes = isMuted ? Math.max(1, Math.ceil((muteUntilMs - Date.now()) / 60000)) : 0;

  const playTestSound = useCallback(async () => {
    const ok = await playNotificationSound('HUMAN_ESCALATION');
    if (ok && mountedRef.current) setLastSoundAt(Date.now());
    return ok;
  }, []);

  return {
    notifications: activeNotifications,
    allNotifications,
    queueItems,
    simulatorMessages,
    d1Funnel,
    liveResponderActive,
    botConnected,
    pausedThreads,
    pausedThreadItems,
    waitingHumanCount,
    unreadUrgentCount,
    humanEscalationCount,
    purchaseAlertCount,
    latestUrgentEvent,
    isLoading,
    isSimulating,
    error,
    isMuted,
    muteRemainingMinutes,
    lastSoundAt,
    playTestSound,
    muteFor15Min,
    unmute,
    refresh,
    ackNotification,
    triggerSimulate,
    recordProductClick,
  };
}
