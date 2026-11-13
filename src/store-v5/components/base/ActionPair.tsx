import React from 'react';

export type ActionPairProps = {
  primaryLabel: string;
  onPrimary: (e: React.MouseEvent) => void;
  primaryDisabled?: boolean;
  primaryAriaLabel?: string;
  secondaryLabel?: string;
  onSecondary?: (e: React.MouseEvent) => void;
  secondaryDisabled?: boolean;
  secondaryAriaLabel?: string;
  layout?: 'sideBySide' | 'stacked';
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
};

export const ActionPair: React.FC<ActionPairProps> = ({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryAriaLabel,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  secondaryAriaLabel,
  layout = 'sideBySide',
  className = '',
  primaryClassName = 'action-pair__primary',
  secondaryClassName = 'action-pair__secondary'
}) => {
  return (
    <div className={`action-pair action-pair--${layout} ${className}`}>
      <button
        type="button"
        className={primaryClassName}
        disabled={primaryDisabled}
        aria-label={primaryAriaLabel || primaryLabel}
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button
          type="button"
          className={secondaryClassName}
          disabled={secondaryDisabled}
          aria-label={secondaryAriaLabel || secondaryLabel}
          onClick={onSecondary}
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
};
