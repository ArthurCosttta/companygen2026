import { useEffect, useState } from 'react';
import { Activity, ChevronDown, ExternalLink, Image as ImageIcon, MessageSquare, Power, ShieldAlert } from 'lucide-react';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  getDesktopBridge,
  type RuntimeFeedEvent,
  type WebviewResponderStatus,
} from '@/hooks/useWebviewWhatsappResponder';

interface PersistedRuntimeSnapshot {
  phase: string;
  active: boolean;
  trayBackground?: boolean;
  chatTitle: string;
  draftText: string;
  typedChars: number;
  totalChars: number;
  etaSeconds: number;
  repliedCount: number;
  lastReplyAt: string | null;
  lastChatTitle: string;
  lastError: string;
  lastModelUsed?: string;
  lastMediaCount?: number;
  recentEvents: RuntimeFeedEvent[];
}

export interface WhatsappPersistentVisualizerProps {
  userId: string;
  connected: boolean;
  onOpenWhatsApp: () => void;
}

export function WhatsappPersistentVisualizer({
  userId,
  connected,
  onOpenWhatsApp,
}: WhatsappPersistentVisualizerProps) {
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState<PersistedRuntimeSnapshot>({
    phase: 'idle',
    active: false,
    chatTitle: '',
    draftText: '',
    typedChars: 0,
    totalChars: 0,
    etaSeconds: 0,
    repliedCount: 0,
    lastReplyAt: null,
    lastChatTitle: '',
    lastError: '',
    recentEvents: [],
  });
  const desktopBridge = getDesktopBridge();

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void authenticatedFetch('/api/whatsapp/ai/runtime', undefined, userId)
      .then((res) => res.json())
      .then((json: { ok?: boolean; runtime?: Partial<PersistedRuntimeSnapshot> }) => {
        if (!alive || !json?.ok || !json.runtime) return;
        const rt = json.runtime;
        setRuntime((prev) => ({
          ...prev,
          phase: prev.phase !== 'idle' ? prev.phase : rt.phase || 'idle',
          active: prev.active || Boolean(rt.active),
          chatTitle: prev.chatTitle || rt.chatTitle || '',
          draftText: prev.draftText || rt.draftText || '',
          typedChars: prev.typedChars || Number(rt.typedChars) || 0,
          totalChars: prev.totalChars || Number(rt.totalChars) || 0,
          repliedCount: Math.max(prev.repliedCount, Number(rt.repliedCount) || 0),
          lastReplyAt: prev.lastReplyAt || rt.lastReplyAt || null,
          lastChatTitle: prev.lastChatTitle || rt.lastChatTitle || '',
          lastError: prev.lastError || rt.lastError || '',
          lastModelUsed: prev.lastModelUsed || rt.lastModelUsed || '',
          lastMediaCount: prev.lastMediaCount ?? rt.lastMediaCount ?? 0,
          recentEvents:
            prev.recentEvents.length > 0
              ? prev.recentEvents
              : Array.isArray(rt.recentEvents)
                ? rt.recentEvents
                : [],
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    const onLiveUpdate = (event: Event) => {
      const detail = (event as CustomEvent<WebviewResponderStatus>).detail;
      if (!detail) return;
      const preview = detail.liveTypingPreview;
      setRuntime((prev) => ({
        ...prev,
        active: Boolean(detail.active),
        phase: preview?.phase || (detail.processing ? 'thinking' : detail.active ? 'listening' : 'idle'),
        chatTitle: preview?.chatTitle || detail.lastChatTitle || prev.chatTitle,
        draftText: preview?.draftText ?? prev.draftText,
        typedChars: preview?.visibleChars ?? prev.typedChars,
        totalChars: preview?.totalChars ?? prev.totalChars,
        etaSeconds: preview?.etaSeconds ?? 0,
        repliedCount: Math.max(prev.repliedCount, detail.repliedCount || 0),
        lastReplyAt: detail.lastReplyAt || prev.lastReplyAt,
        lastChatTitle: detail.lastChatTitle || prev.lastChatTitle,
        lastError: detail.lastError || '',
        recentEvents:
          Array.isArray(detail.recentEvents) && detail.recentEvents.length > 0
            ? detail.recentEvents
            : prev.recentEvents,
      }));
    };
    window.addEventListener('companygen:wa-runtime-update', onLiveUpdate);
    return () => window.removeEventListener('companygen:wa-runtime-update', onLiveUpdate);
  }, []);

  if (!desktopBridge?.isDesktop && !connected && runtime.repliedCount === 0 && runtime.recentEvents.length === 0) {
    return null;
  }

  const isTyping = runtime.phase === 'typing' && runtime.totalChars > 0;
  const isThinking = runtime.phase === 'thinking';
  const isPausedHuman = runtime.phase === 'paused_human';

  const pillClasses = isPausedHuman
    ? 'border-[#FF2E54]/40 bg-red-50 text-[#B91C1C]'
    : isTyping
      ? 'border-blue-300 bg-blue-50 text-blue-900'
      : isThinking
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : runtime.active || connected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  const dotColor = isPausedHuman
    ? 'bg-[#FF2E54] animate-pulse'
    : isTyping
      ? 'bg-blue-600 animate-ping'
      : isThinking
        ? 'bg-amber-500 animate-pulse'
        : runtime.active || connected
          ? 'bg-emerald-500'
          : 'bg-slate-400';

  const label = isTyping
    ? `Digitando (${runtime.typedChars}/${runtime.totalChars}) · ${runtime.chatTitle || 'Cliente'}`
    : isThinking
      ? `Preparando resposta · ${runtime.chatTitle || 'Cliente'}`
      : isPausedHuman
        ? `Humano pendente · ${runtime.chatTitle || 'Cliente'}`
        : runtime.active || connected
          ? `Sofia 2º plano · ${runtime.repliedCount} resp.`
          : `Sofia (${runtime.repliedCount} hist.)`;

  const progressPct =
    runtime.totalChars > 0 ? Math.min(100, Math.round((runtime.typedChars / runtime.totalChars) * 100)) : 0;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="wpp-global-visualizer-pill"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-[36px] max-w-[125px] sm:max-w-[260px] items-center gap-1.5 sm:gap-2 rounded-full border px-2.5 sm:px-3 py-1 text-xs font-semibold shadow-xs transition hover:brightness-95 ${pillClasses}`}
        title="Abrir Visualizador Persistente da Sofia IA"
      >
        <span className={`size-2 shrink-0 rounded-full ${dotColor}`} />
        <span className="truncate sm:hidden">Sofia · {runtime.repliedCount}</span>
        <span className="hidden truncate sm:inline">{label}</span>
        <ChevronDown className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="wpp-global-visualizer-panel"
          className="absolute right-0 top-11 z-50 w-[360px] max-w-[92vw] rounded-2xl border border-[#E2E8F0] bg-white p-4 text-left shadow-sm"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-[#0F172A]">Visualizador Persistente — Sofia IA</p>
                <p className="text-[11px] text-slate-500">
                  {desktopBridge?.isDesktop
                    ? 'Fechar no X recolhe para a Bandeja e mantém respondendo.'
                    : 'Estado persistido no servidor local.'}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {runtime.repliedCount} enviadas
            </span>
          </div>

          {isTyping && runtime.draftText ? (
            <div className="mt-3 space-y-1.5 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-blue-900">
                <span>Digitando letra a letra ({runtime.chatTitle})</span>
                <span>{runtime.typedChars}/{runtime.totalChars}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                <div className="h-full bg-blue-600 transition-all duration-150" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="text-xs leading-relaxed text-slate-800">
                {runtime.draftText.slice(0, runtime.typedChars)}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 align-middle bg-blue-600 animate-pulse" />
              </p>
            </div>
          ) : isPausedHuman ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#FF2E54]" />
              <div>
                <p className="font-bold">Atendimento humano pendente: {runtime.chatTitle}</p>
                <p className="text-[11px] text-red-700">Abra o painel WhatsApp para assumir ou devolver à IA.</p>
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Atividade recente persistida
            </p>
            {runtime.recentEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-500">
                Nenhuma resposta registrada ainda nesta loja.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {runtime.recentEvents.slice(0, 6).map((evt) => (
                  <li
                    key={evt.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
                        <MessageSquare className="size-3 shrink-0 text-emerald-600" />
                        <span className="truncate">{evt.chatTitle}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                        {(evt.mediaCount || 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 text-emerald-800">
                            <ImageIcon className="size-2.5" />
                            {evt.mediaCount}
                          </span>
                        )}
                        {evt.createdAt ? new Date(evt.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{evt.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenWhatsApp();
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <ExternalLink className="size-3.5" />
              Abrir Painel WhatsApp
            </button>
            {desktopBridge?.quitApp && (
              <button
                type="button"
                onClick={() => void desktopBridge.quitApp?.()}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                title="Encerrar completamente o CompanyGen (inclusive da bandeja)"
              >
                <Power className="size-3.5" />
                Sair
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
