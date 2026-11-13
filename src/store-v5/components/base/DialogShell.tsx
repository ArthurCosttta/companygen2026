import React, { useEffect, useRef } from 'react';

export type DialogShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  ariaLabel?: string;
  maxWidthPx?: number;
  maxHeightDvh?: number;
  className?: string;
  footer?: React.ReactNode;
};

export const DialogShell: React.FC<DialogShellProps> = ({
  isOpen,
  onClose,
  title,
  children,
  ariaLabel,
  maxWidthPx = 640,
  maxHeightDvh = 90,
  className = '',
  footer
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focar no diálogo ao abrir
      dialogRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        tabIndex={-1}
        className={`dialog-panel ${className}`}
        style={{
          maxWidth: `min(${maxWidthPx}px, calc(100vw - 32px))`,
          maxHeight: `${maxHeightDvh}dvh`
        }}
      >
        <header className="dialog-panel__header">
          <h2 className="dialog-panel__title">{title}</h2>
          <button
            type="button"
            className="dialog-panel__close"
            aria-label="Fechar modal"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="dialog-panel__body">{children}</div>
        {footer && <footer className="dialog-panel__footer">{footer}</footer>}
      </div>
    </div>
  );
};
