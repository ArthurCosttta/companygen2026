import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerContainerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "default" | "wide" | "full";
  preventClose?: boolean;
  preventCloseWhileSubmitting?: boolean;
  showCloseButton?: boolean;
  className?: string;
  contentClassName?: string;
}

const DESKTOP_SIZE_CLASSES: Record<NonNullable<DrawerContainerProps["size"]>, string> = {
  default: "min-[769px]:w-[420px] min-[769px]:max-w-[440px]",
  wide: "min-[769px]:w-[560px] min-[769px]:max-w-[90vw]",
  full: "min-[769px]:w-[min(1120px,96vw)] min-[769px]:max-w-[96vw]",
};

export function DrawerContainer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "default",
  preventClose = false,
  preventCloseWhileSubmitting = false,
  showCloseButton = true,
  className,
  contentClassName,
}: DrawerContainerProps) {
  const isCloseBlocked = Boolean(preventClose || preventCloseWhileSubmitting);
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open && typeof document !== "undefined") {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        previousActiveElementRef.current = active;
      }
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isCloseBlocked) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleCloseAutoFocus = (event: Event) => {
    const prev = previousActiveElementRef.current;
    if (prev && prev.isConnected) {
      event.preventDefault();
      prev.focus();
      previousActiveElementRef.current = null;
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="drawer-overlay"
          className={cn(
            "fixed inset-0 z-50 bg-black/65 will-change-[opacity]",
            "transition-opacity duration-200",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          aria-modal="true"
          data-slot="drawer-content"
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            if (isCloseBlocked) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            const originalEvent = (
              event as unknown as {
                detail?: { originalEvent?: Event & { __cgToastOrigin?: boolean } };
              }
            ).detail?.originalEvent;
            const rawTarget = originalEvent?.target ?? event.target;
            const target =
              rawTarget instanceof Element ? rawTarget : (rawTarget as Node | null)?.parentElement;
            if (
              isCloseBlocked ||
              originalEvent?.__cgToastOrigin ||
              target?.closest?.('[data-cg-toast-region="true"]')
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const originalEvent = (
              event as unknown as {
                detail?: { originalEvent?: Event & { __cgToastOrigin?: boolean } };
              }
            ).detail?.originalEvent;
            const rawTarget = originalEvent?.target ?? event.target;
            const target =
              rawTarget instanceof Element ? rawTarget : (rawTarget as Node | null)?.parentElement;
            if (
              isCloseBlocked ||
              originalEvent?.__cgToastOrigin ||
              target?.closest?.('[data-cg-toast-region="true"]')
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            const originalEvent = (
              event as unknown as {
                detail?: { originalEvent?: Event & { __cgToastOrigin?: boolean } };
              }
            ).detail?.originalEvent;
            const rawTarget = originalEvent?.target ?? event.target;
            const target =
              rawTarget instanceof Element ? rawTarget : (rawTarget as Node | null)?.parentElement;
            if (
              isCloseBlocked ||
              originalEvent?.__cgToastOrigin ||
              target?.closest?.('[data-cg-toast-region="true"]')
            ) {
              event.preventDefault();
            }
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-white text-[#0F172A] shadow-2xl outline-none",
            "border-slate-200/80",
            "dark:bg-[#121215] dark:text-[#FFFFFF] dark:border-[#27272A]",
            "transform-gpu will-change-[transform,opacity]",
            // Mobile <= 768px: Bottom Sheet 95% height
            "max-[768px]:inset-x-0 max-[768px]:bottom-0 max-[768px]:h-[95dvh] max-[768px]:w-full max-[768px]:rounded-t-2xl max-[768px]:border-t",
            "max-[768px]:duration-250 max-[768px]:ease-[cubic-bezier(0.4,0,0.2,1)]",
            "max-[768px]:data-[state=open]:animate-in max-[768px]:data-[state=open]:slide-in-from-bottom-full",
            "max-[768px]:data-[state=closed]:animate-out max-[768px]:data-[state=closed]:slide-out-to-bottom-full",
            // Desktop >= 769px: Right Drawer 400px-440px (250ms)
            "min-[769px]:inset-y-0 min-[769px]:right-0 min-[769px]:h-full min-[769px]:border-l",
            "min-[769px]:duration-250 min-[769px]:ease-[cubic-bezier(0.4,0,0.2,1)]",
            "min-[769px]:data-[state=open]:animate-in min-[769px]:data-[state=open]:slide-in-from-right-full",
            "min-[769px]:data-[state=closed]:animate-out min-[769px]:data-[state=closed]:slide-out-to-right-full",
            DESKTOP_SIZE_CLASSES[size],
            className
          )}
        >
          {/* Mobile drag handle */}
          <div className="hidden max-[768px]:flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-zinc-700" />
          </div>

          <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-[#27272A] px-5 py-4 shrink-0">
            <div className="min-w-0 flex-1 space-y-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug text-[#0F172A] dark:text-[#FFFFFF]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm leading-relaxed text-slate-600 dark:text-[#E4E4E7]">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === "string" ? title : "Painel lateral"}
                </DialogPrimitive.Description>
              )}
            </div>

            {showCloseButton && !isCloseBlocked ? (
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar painel"
                  className="inline-flex min-h-[44px] min-w-[44px] -mr-2 -mt-2 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-[#F4F4F5] transition-colors hover:bg-slate-100 dark:hover:bg-[#18181B] hover:text-[#0F172A] dark:hover:text-[#FFFFFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </DialogPrimitive.Close>
            ) : null}
          </div>

          <div
            className={cn(
              "flex-1 overflow-y-auto overscroll-contain px-5 py-4",
              !footer && "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
              contentClassName
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="sticky bottom-0 shrink-0 border-t border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] dark:text-[#FFFFFF] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(15,23,42,0.05)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.45)]">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
