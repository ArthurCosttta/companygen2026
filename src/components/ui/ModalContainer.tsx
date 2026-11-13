import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalContainerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  role?: "dialog" | "alertdialog";
  initialFocus?: "first" | "cancel";
  cancelRef?: React.RefObject<HTMLElement | null>;
  preventClose?: boolean;
  preventCloseWhileSubmitting?: boolean;
  showCloseButton?: boolean;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  mobileHeight?: "auto" | "50%" | "85%" | "90%" | "95%";
  layoutId?: string;
  titleLayoutId?: string;
  className?: string;
  contentClassName?: string;
}

const MAX_WIDTH_CLASSES: Record<NonNullable<ModalContainerProps["maxWidth"]>, string> = {
  sm: "min-[769px]:max-w-sm",
  md: "min-[769px]:max-w-[480px]",
  lg: "min-[769px]:max-w-[560px]",
  xl: "min-[769px]:max-w-[680px]",
  "2xl": "min-[769px]:max-w-[780px]",
};

const MOBILE_HEIGHT_CLASSES: Record<
  NonNullable<ModalContainerProps["mobileHeight"]>,
  string
> = {
  auto: "max-[768px]:max-h-[90dvh]",
  "50%": "max-[768px]:min-h-[50dvh] max-[768px]:max-h-[85dvh]",
  "85%": "max-[768px]:max-h-[85dvh]",
  "90%": "max-[768px]:max-h-[90dvh]",
  "95%": "max-[768px]:max-h-[95dvh]",
};

function findCancelElement(container: HTMLElement | null): HTMLElement | null {
  if (!container) return null;
  const explicit = container.querySelector<HTMLElement>(
    '[data-modal-cancel="true"], [data-initial-focus="cancel"]'
  );
  if (explicit) return explicit;

  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  return (
    buttons.find((btn) =>
      /cancelar|continuar|voltar|fechar|não|agora não/i.test(btn.textContent ?? "")
    ) ?? null
  );
}

export function ModalContainer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  role = "dialog",
  initialFocus = "first",
  cancelRef,
  preventClose = false,
  preventCloseWhileSubmitting = false,
  showCloseButton,
  maxWidth = "md",
  mobileHeight = "85%",
  layoutId,
  titleLayoutId,
  className,
  contentClassName,
}: ModalContainerProps) {
  const isCloseBlocked = Boolean(preventClose || preventCloseWhileSubmitting);
  const shouldShowClose =
    showCloseButton !== undefined ? showCloseButton && !isCloseBlocked : role !== "alertdialog" && !isCloseBlocked;

  const contentRef = React.useRef<HTMLDivElement | null>(null);
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

  const handleOpenAutoFocus = (event: Event) => {
    if (initialFocus !== "cancel") {
      return;
    }
    event.preventDefault();
    const target = cancelRef?.current ?? findCancelElement(contentRef.current);
    if (target) {
      target.focus();
      return;
    }
    const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
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
      <DialogPrimitive.Portal container={typeof document !== "undefined" ? document.body : undefined}>
        <DialogPrimitive.Overlay
          data-slot="modal-overlay"
          className={cn(
            "fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[4px]",
            "transition-opacity duration-200",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          ref={contentRef}
          role={role}
          aria-modal="true"
          data-slot="modal-content"
          data-layout-id={layoutId}
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={(event) => {
            if (isCloseBlocked) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            if (isCloseBlocked) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isCloseBlocked) {
              event.preventDefault();
            }
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-white text-[#0F172A] shadow-2xl outline-none",
            "border border-slate-200/80",
            // Mobile <= 768px: Bottom Sheet 85%-95%
            "max-[768px]:inset-x-0 max-[768px]:bottom-0 max-[768px]:w-full max-[768px]:rounded-t-2xl max-[768px]:rounded-b-none",
            !layoutId &&
              "max-[768px]:data-[state=open]:animate-in max-[768px]:data-[state=open]:slide-in-from-bottom-full max-[768px]:data-[state=open]:duration-200",
            !layoutId &&
              "max-[768px]:data-[state=closed]:animate-out max-[768px]:data-[state=closed]:slide-out-to-bottom-full max-[768px]:data-[state=closed]:duration-150",
            MOBILE_HEIGHT_CLASSES[mobileHeight],
            // Desktop >= 769px: sem -translate-x/y quando Anime.js layout FLIP estiver ativo
            layoutId
              ? "min-[769px]:inset-0 min-[769px]:m-auto min-[769px]:h-fit min-[769px]:w-[calc(100%-2rem)] min-[769px]:rounded-2xl min-[769px]:max-h-[88dvh]"
              : cn(
                  "min-[769px]:top-1/2 min-[769px]:left-1/2 min-[769px]:w-[calc(100%-2rem)] min-[769px]:-translate-x-1/2 min-[769px]:-translate-y-1/2 min-[769px]:rounded-2xl min-[769px]:max-h-[88dvh]",
                  "min-[769px]:duration-200 min-[769px]:ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  "min-[769px]:data-[state=open]:animate-in min-[769px]:data-[state=open]:fade-in-0 min-[769px]:data-[state=open]:zoom-in-[0.92]",
                  "min-[769px]:data-[state=closed]:animate-out min-[769px]:data-[state=closed]:fade-out-0 min-[769px]:data-[state=closed]:zoom-out-[0.95]"
                ),
            MAX_WIDTH_CLASSES[maxWidth],
            className
          )}
        >
          {/* Mobile Bottom Sheet drag-handle visual */}
          <div className="hidden max-[768px]:flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-slate-300" />
          </div>

          <div
            data-layout-id={titleLayoutId}
            className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 shrink-0"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-snug text-[#0F172A]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm leading-relaxed text-slate-600">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === "string" ? title : "Caixa de diálogo"}
                </DialogPrimitive.Description>
              )}
            </div>

            {shouldShowClose ? (
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Fechar janela"
                  className="inline-flex min-h-[44px] min-w-[44px] -mr-2 -mt-2 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
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
            <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] rounded-b-2xl max-[768px]:rounded-b-none">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
