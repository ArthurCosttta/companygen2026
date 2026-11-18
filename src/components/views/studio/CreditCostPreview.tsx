import React from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';

export interface CreditCostPreviewProps {
  cost: number;
  balance: number;
  label?: string;
  onOpenRecharge?: () => void;
}

export const CreditCostPreview: React.FC<CreditCostPreviewProps> = ({
  cost,
  balance,
  label,
  onOpenRecharge,
}) => {
  const after = balance - cost;
  const insufficient = balance < cost;

  if (cost <= 0) {
    return (
      <span
        data-testid="credit-cost-preview-free"
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"
      >
        <span>Grátis · 0 cr</span>
      </span>
    );
  }

  return (
    <div
      data-testid="credit-cost-preview"
      data-insufficient={insufficient ? 'true' : 'false'}
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold ${
        insufficient
          ? 'border-rose-300 bg-rose-50 text-rose-700'
          : 'border-blue-200 bg-[#EFF6FF] text-[#0B4DB8]'
      }`}
    >
      {insufficient ? (
        <AlertCircle className="size-3.5 shrink-0 text-rose-600" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3.5 shrink-0 text-[#0B4DB8]" aria-hidden="true" />
      )}
      <span>
        {label ? `${label} · ` : ''}-{cost} cr · {insufficient ? `saldo ${balance}` : `saldo ${after}`}
      </span>
      {insufficient && onOpenRecharge ? (
        <button
          type="button"
          data-testid="credit-cost-recharge-link"
          onClick={onOpenRecharge}
          className="ml-1 underline underline-offset-2 hover:text-rose-900"
        >
          Recarregar
        </button>
      ) : null}
    </div>
  );
};
