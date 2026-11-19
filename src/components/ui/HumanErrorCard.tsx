import { AlertTriangle, RefreshCw, Sparkles, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveHumanError, type HumanErrorInfo } from '@/utils/humanErrors';
import { ActionButton } from './ActionButton';

export interface HumanErrorCardProps {
  status?: number;
  code?: string;
  isOffline?: boolean;
  fallbackMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  className?: string;
}

export function HumanErrorCard({
  status,
  code,
  isOffline,
  fallbackMessage,
  actionLabel,
  onAction,
  actionLoading = false,
  className,
}: HumanErrorCardProps) {
  const info: HumanErrorInfo = resolveHumanError({
    status,
    code,
    isOffline,
    fallbackMessage,
  });

  const Icon =
    info.variant === 'offline'
      ? WifiOff
      : info.status === 402
        ? Sparkles
        : AlertTriangle;

  const paletteClass =
    info.variant === 'offline' || info.variant === 'warning'
      ? 'border-amber-300/70 bg-amber-50/90 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/25 dark:text-amber-100'
      : 'border-rose-300/70 bg-rose-50/90 text-rose-950 dark:border-rose-500/35 dark:bg-rose-950/25 dark:text-rose-100';

  const iconBgClass =
    info.variant === 'offline' || info.variant === 'warning'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
      : 'bg-rose-500/15 text-rose-600 dark:text-rose-300';

  return (
    <div
      role="alert"
      data-testid="human-error-card"
      data-error-status={String(info.status)}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 @min-[480px]:flex-row @min-[480px]:items-center @min-[480px]:justify-between sm:flex-wrap',
        paletteClass,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
            iconBgClass,
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-bold leading-snug">{info.title}</p>
          <p className="text-xs leading-relaxed opacity-90">{info.message}</p>
        </div>
      </div>

      {onAction ? (
        <ActionButton
          variant={info.status === 402 ? 'primary' : 'secondary'}
          size={44}
          isLoading={actionLoading}
          leftIcon={<RefreshCw className="size-4" />}
          onClick={onAction}
          data-testid="human-error-action-btn"
          className="shrink-0 whitespace-nowrap"
        >
          {actionLabel || info.actionLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}
