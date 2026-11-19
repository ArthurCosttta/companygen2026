import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionButtonVariant =
  | "primary"
  | "primaryGradient"
  | "success"
  | "danger"
  | "purple"
  | "dark"
  | "softBlue"
  | "secondary";

export type ActionButtonSize =
  | 44
  | 46
  | 48
  | 50
  | 52
  | 56
  | "44"
  | "46"
  | "48"
  | "50"
  | "52"
  | "56";

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  isLoading?: boolean;
  isSubmitting?: boolean;
  loadingText?: string;
  keepWidthOnLoading?: boolean;
  copyText?: string;
  copySuccessLabel?: string;
  costHint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  haptic?: boolean;
}

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  primary:
    "bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white shadow-md shadow-blue-600/20",
  primaryGradient:
    "bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] hover:from-[#1D4ED8] hover:to-[#1E40AF] text-white shadow-md shadow-blue-600/20",
  success:
    "bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] text-white shadow-md shadow-green-600/20",
  danger:
    "bg-[#EF4444] hover:bg-[#DC2626] active:bg-[#B91C1C] text-white shadow-md shadow-red-600/15",
  purple:
    "bg-[#8B5CF6] hover:bg-[#7C3AED] active:bg-[#6D28D9] text-white shadow-md shadow-violet-600/20",
  dark:
    "bg-[#0F172A] hover:bg-[#2563EB] active:bg-[#1D4ED8] text-white shadow-sm",
  softBlue:
    "bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] text-[#1D4ED8] dark:bg-[#1E3A8A]/40 dark:border-[#3B82F6]/40 dark:text-[#93C5FD] dark:hover:bg-[#1E3A8A]/60",
  secondary:
    "bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] text-[#0F172A] dark:bg-[var(--cg-surface-elevated)] dark:border dark:border-[var(--cg-border-strong)] dark:text-[var(--cg-text)] dark:hover:bg-[var(--cg-hover)]",
};

const SIZE_CLASSES: Record<string, string> = {
  "44": "min-h-[44px] px-4 text-sm",
  "46": "min-h-[46px] px-4 text-sm",
  "48": "min-h-[48px] px-5 text-sm",
  "50": "min-h-[50px] px-5 text-[15px]",
  "52": "min-h-[52px] px-6 text-[15px]",
  "56": "min-h-[56px] px-6 text-base",
};

function triggerHapticFeedback(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(10);
    } catch {
      // Ignore environments where vibration is blocked or unsupported.
    }
  }
}

async function writeClipboardText(value: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fallback below
  }
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "true");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
    } catch {
      // Ignore clipboard failures
    } finally {
      document.body.removeChild(el);
    }
  }
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      variant = "primary",
      size = 44,
      isLoading = false,
      isSubmitting = false,
      loadingText,
      keepWidthOnLoading = true,
      copyText,
      copySuccessLabel = "✓ Copiado",
      costHint,
      leftIcon,
      rightIcon,
      fullWidth = false,
      haptic = true,
      disabled = false,
      className,
      style,
      children,
      onClick,
      type = "button",
      ...props
    },
    ref
  ) => {
    const busy = Boolean(isLoading || isSubmitting);
    const isDisabled = Boolean(disabled || busy);
    const sizeKey = String(size);

    const internalRef = React.useRef<HTMLButtonElement | null>(null);
    const [lockedWidth, setLockedWidth] = React.useState<number | null>(null);
    const [copied, setCopied] = React.useState(false);
    const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const setMergedRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    React.useLayoutEffect(() => {
      if (!keepWidthOnLoading || busy || copied) return;
      const el = internalRef.current;
      if (el) {
        const w = el.getBoundingClientRect().width;
        if (w > 0) setLockedWidth(Math.ceil(w));
      }
    }, [keepWidthOnLoading, busy, copied, children]);

    React.useEffect(() => {
      return () => {
        if (copyTimerRef.current !== null) {
          clearTimeout(copyTimerRef.current);
        }
      };
    }, []);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      if (haptic) {
        triggerHapticFeedback();
      }
      if (typeof copyText === "string") {
        void writeClipboardText(copyText);
        setCopied(true);
        if (copyTimerRef.current !== null) {
          clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, 2000);
      }
      onClick?.(event);
    };

    const computedStyle: React.CSSProperties =
      keepWidthOnLoading && (busy || copied) && lockedWidth
        ? { minWidth: `${lockedWidth}px`, ...style }
        : { ...style };

    return (
      <button
        ref={setMergedRef}
        type={type}
        disabled={isDisabled}
        aria-busy={busy || undefined}
        data-variant={variant}
        data-size={sizeKey}
        data-copied={copied ? "true" : undefined}
        style={computedStyle}
        onClick={handleClick}
        className={cn(
          "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl font-semibold select-none",
          "transition-all duration-[120ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          "active:scale-[0.98] disabled:active:scale-100 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          copied
            ? "bg-[#16A34A] text-white shadow-md shadow-emerald-600/20"
            : VARIANT_CLASSES[variant],
          SIZE_CLASSES[sizeKey] ?? SIZE_CLASSES["44"],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {busy ? (
          <>
            <svg
              className="size-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
            <span>{loadingText ?? children}</span>
          </>
        ) : copied ? (
          <>
            <Check className="size-4" aria-hidden="true" />
            <span>{copySuccessLabel}</span>
          </>
        ) : (
          <>
            {leftIcon ? <span className="inline-flex shrink-0">{leftIcon}</span> : null}
            <span>{children}</span>
            {costHint ? (
              <span className="cg-tabular ml-0.5 rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] font-semibold opacity-95">
                {costHint}
              </span>
            ) : null}
            {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
          </>
        )}
      </button>
    );
  }
);

ActionButton.displayName = "ActionButton";
