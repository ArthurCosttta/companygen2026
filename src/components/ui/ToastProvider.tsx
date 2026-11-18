import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, Undo2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "amber" | "warning" | "purple" | "neutral";

export interface ToastOptions {
  id?: string;
  type?: ToastType;
  title?: string;
  message?: string;
  description?: string;
  durationMs?: number;
  actionLabel?: string;
  onUndo?: () => void | Promise<void>;
  onExpire?: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  type: Exclude<ToastType, "warning">;
  title?: string;
  message: string;
  durationMs: number;
  actionLabel?: string;
  onUndo?: () => void | Promise<void>;
  onExpire?: () => void | Promise<void>;
  createdAt: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (options: ToastOptions) => string;
  toast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const STYLE_BY_TYPE: Record<
  ToastItem["type"],
  {
    container: string;
    accent: string;
    bar: string;
    iconColor: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    container: "bg-[#0F172A] text-white border-[#16A34A]/50",
    accent: "bg-[#16A34A]",
    bar: "bg-[#16A34A]",
    iconColor: "text-[#16A34A]",
    Icon: CheckCircle2,
  },
  error: {
    container: "bg-[#0F172A] text-white border-[#EF4444]/60",
    accent: "bg-[#EF4444]",
    bar: "bg-[#EF4444]",
    iconColor: "text-[#EF4444]",
    Icon: XCircle,
  },
  amber: {
    container: "bg-[#0F172A] text-white border-[#F59E0B]/60",
    accent: "bg-[#F59E0B]",
    bar: "bg-[#F59E0B]",
    iconColor: "text-[#F59E0B]",
    Icon: AlertTriangle,
  },
  purple: {
    container: "bg-[#0F172A] text-white border-[#8B5CF6]/60",
    accent: "bg-[#8B5CF6]",
    bar: "bg-[#8B5CF6]",
    iconColor: "text-[#8B5CF6]",
    Icon: Sparkles,
  },
  neutral: {
    container: "bg-[#0F172A] text-white border-slate-700",
    accent: "bg-[#2563EB]",
    bar: "bg-[#2563EB]",
    iconColor: "text-slate-300",
    Icon: Info,
  },
};

function normalizeToastType(type?: ToastType): ToastItem["type"] {
  if (!type) return "neutral";
  if (type === "warning") return "amber";
  return type;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  maxVisible?: number;
}

export function ToastProvider({ children, maxVisible = 4 }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const callbacksRef = React.useRef<
    Map<string, { onUndo?: () => void | Promise<void>; onExpire?: () => void | Promise<void>; settled: boolean }>
  >(new Map());

  const clearTimer = React.useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  React.useEffect(() => {
    const timers = timersRef.current;
    const callbacks = callbacksRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
      callbacks.clear();
    };
  }, []);

  const removeToast = React.useCallback(
    (id: string, reason: "expire" | "dismiss" | "undo") => {
      clearTimer(id);
      const entry = callbacksRef.current.get(id);
      if (entry && !entry.settled) {
        entry.settled = true;
        if (reason === "undo") {
          void entry.onUndo?.();
        } else {
          void entry.onExpire?.();
        }
      }
      callbacksRef.current.delete(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer]
  );

  const dismissToast = React.useCallback(
    (id: string) => {
      removeToast(id, "dismiss");
    },
    [removeToast]
  );

  const clearToasts = React.useCallback(() => {
    timersRef.current.forEach((timerId) => clearTimeout(timerId));
    timersRef.current.clear();
    callbacksRef.current.clear();
    setToasts([]);
  }, []);

  const showToast = React.useCallback(
    (options: ToastOptions): string => {
      const id =
        options.id ??
        `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      clearTimer(id);

      const hasUndo = Boolean(options.onUndo);
      const durationMs =
        options.durationMs && options.durationMs > 0
          ? options.durationMs
          : hasUndo
            ? 5000
            : 3000;

      const resolvedMessage =
        options.message ?? options.description ?? options.title ?? "";
      const resolvedTitle =
        options.title && options.title !== resolvedMessage
          ? options.title
          : undefined;

      const item: ToastItem = {
        id,
        type: normalizeToastType(options.type),
        title: resolvedTitle,
        message: resolvedMessage,
        durationMs,
        actionLabel: options.actionLabel ?? (hasUndo ? "Desfazer" : undefined),
        onUndo: options.onUndo,
        onExpire: options.onExpire,
        createdAt: Date.now(),
      };

      callbacksRef.current.set(id, {
        onUndo: options.onUndo,
        onExpire: options.onExpire,
        settled: false,
      });

      setToasts((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered, item].slice(-maxVisible);
      });

      const timerId = setTimeout(() => {
        removeToast(id, "expire");
      }, durationMs);
      timersRef.current.set(id, timerId);

      return id;
    },
    [clearTimer, maxVisible, removeToast]
  );

  const contextValue = React.useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      toast: showToast,
      dismissToast,
      clearToasts,
    }),
    [toasts, showToast, dismissToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 left-4 z-[90] flex w-auto flex-col gap-2 sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:w-[min(92vw,400px)] sm:translate-x-0"
      >
        {toasts.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onUndo={() => removeToast(item.id, "undo")}
            onDismiss={() => removeToast(item.id, "dismiss")}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastCardProps {
  item: ToastItem;
  onUndo: () => void;
  onDismiss: () => void;
}

function ToastCard({ item, onUndo, onDismiss }: ToastCardProps) {
  const [barDepleted, setBarDepleted] = React.useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setBarDepleted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [item.id, item.durationMs]);

  const theme = STYLE_BY_TYPE[item.type];
  const Icon = theme.Icon;
  const showAction = Boolean(item.actionLabel && item.onUndo);

  return (
    <div
      role={item.type === "error" ? "alert" : "status"}
      data-toast-type={item.type}
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-xl border shadow-xl",
        "animate-in fade-in-0 slide-in-from-bottom-4 duration-200",
        theme.container
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={cn("shrink-0", theme.iconColor)} aria-hidden="true">
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          {item.title ? (
            <p className="text-sm font-semibold leading-tight text-white">
              {item.title}
            </p>
          ) : null}
          {item.message ? (
            <p
              className={cn(
                "text-sm leading-snug text-slate-100",
                item.title && "mt-0.5 text-xs text-slate-300"
              )}
            >
              {item.message}
            </p>
          ) : null}
        </div>

        {showAction ? (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white transition-all duration-[120ms] hover:bg-white/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            <span>{item.actionLabel}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar notificação"
          className="inline-flex min-h-[44px] min-w-[44px] -mr-2 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Regressive progress bar (including 5000ms Undo window) */}
      <div className="h-1 w-full bg-white/10" aria-hidden="true">
        <div
          className={cn("h-full w-full origin-left", theme.bar)}
          style={{
            transform: barDepleted ? "scaleX(0)" : "scaleX(1)",
            transitionProperty: "transform",
            transitionDuration: `${item.durationMs}ms`,
            transitionTimingFunction: "linear",
          }}
        />
      </div>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
