import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Headphones,
  ShoppingBag,
  X,
} from 'lucide-react';
import type {
  D1FunnelMetrics,
  NotificationSeverityLevel,
  WhatsappNotificationEvent,
} from '@/schemas/ai-whatsapp-intent.schema';
import { formatRelativeTimeBr } from '@/hooks/useHighSaturationNotifications';
import { cn } from '@/lib/utils';

export interface HighSaturationNotificationBarProps {
  notifications: WhatsappNotificationEvent[];
  d1Funnel?: D1FunnelMetrics;
  liveResponderActive?: boolean;
  botConnected?: boolean;
  humanEscalationCount?: number;
  waitingHumanCount?: number;
  purchaseAlertCount?: number;
  isMuted?: boolean;
  muteRemainingMinutes?: number;
  onMute15Min?: () => void;
  onUnmute?: () => void;
  onAckEvent?: (eventId: string, action?: 'ack' | 'assume_human' | 'resolve' | 'resume_ai') => void;
  onOpenQueueDrawer?: () => void;
  onOpenBrainModal?: () => void;
  fixed?: boolean;
  className?: string;
}

const SEVERITY_CARD_STYLE: Record<
  NotificationSeverityLevel,
  {
    borderClass: string;
    pillBg: string;
    label: string;
  }
> = {
  HUMAN_ESCALATION: {
    borderClass: 'border-[#FF2E54]/80 shadow-[0_12px_32px_rgba(255,46,84,0.28)]',
    pillBg: 'bg-[#FF2E54] text-white',
    label: 'Atendente Necessário',
  },
  PURCHASE_MESSAGE_ARRIVED: {
    borderClass: 'border-[#10B981]/75 shadow-[0_12px_28px_rgba(16,185,129,0.22)]',
    pillBg: 'bg-[#10B981] text-[#052E16]',
    label: 'Novo Pedido WhatsApp',
  },
  NEW_MESSAGE_WAITING: {
    borderClass: 'border-[#F59E0B]/70 shadow-[0_10px_24px_rgba(245,158,11,0.18)]',
    pillBg: 'bg-[#F59E0B] text-[#0F172A]',
    label: 'Nova Mensagem',
  },
};

export function HighSaturationNotificationBar({
  notifications,
  onAckEvent,
  onOpenQueueDrawer,
  fixed = true,
  className,
}: HighSaturationNotificationBarProps) {
  const [queueExpanded, setQueueExpanded] = useState(false);

  useEffect(() => {
    if (!queueExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQueueExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [queueExpanded]);

  useEffect(() => {
    if (notifications.length <= 1 && queueExpanded) {
      setQueueExpanded(false);
    }
  }, [notifications.length, queueExpanded]);

  if (notifications.length === 0) {
    return null;
  }

  const head = notifications[0];
  const queuedRest = notifications.slice(1);
  const style = SEVERITY_CARD_STYLE[head.level] || SEVERITY_CARD_STYLE.NEW_MESSAGE_WAITING;
  const isUrgent = head.level === 'HUMAN_ESCALATION';

  return (
    <aside
      data-testid="tela-38-notification-bar"
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      aria-label="Notificações da Loja"
      className={cn(
        fixed ? 'fixed right-3 top-3 z-50 w-[min(420px,calc(100vw-24px))]' : 'relative z-30 w-full max-w-[440px]',
        'pointer-events-auto flex flex-col gap-2 transform-gpu',
        className,
      )}
    >
      {/* 1. Notificação ativa estilo celular */}
      <div
        data-testid="phone-notification-primary"
        className={cn(
          'rounded-2xl border bg-[#0F172A]/95 p-3.5 text-white backdrop-blur-md transition-all duration-200',
          style.borderClass,
          isUrgent && 'animate-pulse ring-2 ring-[#FF2E54]/70',
        )}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
              className={cn(
                'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                style.pillBg,
                isUrgent && 'animate-bounce',
              )}
            >
              {isUrgent ? <Headphones className="h-4 w-4" /> : head.level === 'PURCHASE_MESSAGE_ARRIVED' ? <ShoppingBag className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-bold uppercase tracking-wide text-white">
                  {style.label}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatRelativeTimeBr(head.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-white">
                {head.customerName || 'Cliente WhatsApp'}
              </p>
              {head.message ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-300">
                  {head.message}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onAckEvent?.(head.eventId || head.id, 'ack')}
            aria-label="Dispensar notificação"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-transform hover:bg-white/10 hover:text-white active:scale-[0.98]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onAckEvent?.(head.eventId || head.id, isUrgent ? 'assume_human' : 'resolve');
              onOpenQueueDrawer?.();
            }}
            className={cn(
              'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-transform duration-150 active:scale-[0.98]',
              isUrgent
                ? 'bg-[#FF2E54] text-white hover:bg-[#E11D48]'
                : 'bg-[#10B981] text-[#052E16] hover:bg-[#059669]',
            )}
          >
            {isUrgent ? 'Assumir no WhatsApp' : 'Marcar como visto'}
          </button>

          {isUrgent && (
            <button
              type="button"
              onClick={() => {
                onAckEvent?.(head.eventId || head.id, 'resume_ai');
              }}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
            >
              Devolver p/ IA
            </button>
          )}

          {queuedRest.length > 0 ? (
            <button
              type="button"
              data-testid="phone-notification-queue-toggle"
              onClick={() => setQueueExpanded((prev) => !prev)}
              aria-expanded={queueExpanded}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white transition-transform hover:bg-white/15 active:scale-[0.98]"
            >
              <span>+{queuedRest.length} na fila</span>
              {queueExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Fila empilhada estilo celular quando houver múltiplas notificações */}
      {queueExpanded && queuedRest.length > 0 ? (
        <div
          data-testid="phone-notification-queue-list"
          className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto rounded-2xl border border-white/15 bg-[#0F172A]/95 p-2.5 shadow-2xl backdrop-blur-md"
        >
          {queuedRest.map((item) => {
            const itemTheme = SEVERITY_CARD_STYLE[item.level] || SEVERITY_CARD_STYLE.NEW_MESSAGE_WAITING;
            return (
              <div
                key={item.eventId || item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', item.level === 'HUMAN_ESCALATION' ? 'bg-[#FF2E54]' : 'bg-[#10B981]')} />
                    <span className="truncate text-xs font-semibold text-white">
                      {item.customerName || itemTheme.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatRelativeTimeBr(item.createdAt)}
                    </span>
                  </div>
                  {item.message ? (
                    <p className="truncate text-[11px] text-slate-300">{item.message}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onAckEvent?.(item.eventId || item.id, 'resolve')}
                  className="inline-flex min-h-[36px] shrink-0 items-center rounded-lg bg-white/10 px-2.5 text-[11px] font-semibold text-white hover:bg-white/20"
                >
                  Resolver
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
