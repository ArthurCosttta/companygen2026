import * as React from "react";
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
    "bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] text-[#1D4ED8]",
  secondary:
    "bg-[#F1F5F9] hover:bg-[#E2E8F0] active:bg-[#CBD5E1] text-[#0F172A]",
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

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      variant = "primary",
      size = 44,
      isLoading = false,
      isSubmitting = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      haptic = true,
      disabled = false,
      className,
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

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      if (haptic) {
        triggerHapticFeedback();
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={busy || undefined}
        data-variant={variant}
        data-size={sizeKey}
        onClick={handleClick}
        className={cn(
          "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl font-semibold select-none",
          "transition-all duration-[120ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          "active:scale-[0.98] disabled:active:scale-100 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          VARIANT_CLASSES[variant],
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
        ) : (
          <>
            {leftIcon ? <span className="inline-flex shrink-0">{leftIcon}</span> : null}
            <span>{children}</span>
            {rightIcon ? <span className="inline-flex shrink-0">{rightIcon}</span> : null}
          </>
        )}
      </button>
    );
  }
);

ActionButton.displayName = "ActionButton";
