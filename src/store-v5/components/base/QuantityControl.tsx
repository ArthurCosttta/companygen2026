import React from 'react';

export type QuantityControlProps = {
  value: number;
  max: number;
  min?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  ariaLabel?: string;
};

export const QuantityControl: React.FC<QuantityControlProps> = ({
  value,
  max,
  min = 1,
  step = 1,
  disabled = false,
  onChange,
  ariaLabel = 'Quantidade'
}) => {
  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || value <= min) return;
    onChange(Math.max(min, value - step));
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || value >= max) return;
    onChange(Math.min(max, value + step));
  };

  return (
    <div className="quantity-control" aria-label={ariaLabel}>
      <button
        type="button"
        className="quantity-control__btn quantity-control__btn--dec"
        aria-label="Diminuir quantidade"
        disabled={disabled || value <= min}
        onClick={handleDecrement}
      >
        −
      </button>
      <output className="quantity-control__val" aria-label="Quantidade selecionada">
        {value}
      </output>
      <button
        type="button"
        className="quantity-control__btn quantity-control__btn--inc"
        aria-label="Aumentar quantidade"
        disabled={disabled || value >= max}
        onClick={handleIncrement}
      >
        +
      </button>
    </div>
  );
};
