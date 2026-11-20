import { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Sparkles } from 'lucide-react';
import type { CreditPlan } from './CheckoutPlansView';

export interface CreditDurationSimulatorProps {
  plans: CreditPlan[];
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  isDark?: boolean;
}

interface CreditCostsMap {
  glm_whatsapp: number;
  generate_full_storefront: number;
}

const DEFAULT_COSTS: CreditCostsMap = {
  glm_whatsapp: 0.1,
  generate_full_storefront: 4,
};

export function CreditDurationSimulator({
  plans,
  selectedPlanId,
  onSelectPlan,
  isDark = false,
}: CreditDurationSimulatorProps) {
  const [whatsappPerDay, setWhatsappPerDay] = useState<number>(20);
  const [storefrontsPerMonth, setStorefrontsPerMonth] = useState<number>(2);
  const [costs, setCosts] = useState<CreditCostsMap>(DEFAULT_COSTS);

  useEffect(() => {
    let active = true;
    fetch('/api/credits/costs')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.costs) return;
        setCosts({
          glm_whatsapp: Math.max(0.05, Number(json.costs.glm_whatsapp) || 0.1),
          generate_full_storefront: Math.max(0.5, Number(json.costs.generate_full_storefront) || 4),
        });
      })
      .catch(() => {
        // fallback determinístico local já carregado
      });
    return () => {
      active = false;
    };
  }, []);

  const simulation = useMemo(() => {
    const monthlyCreditsNeeded =
      Math.max(0, whatsappPerDay) * 30 * costs.glm_whatsapp +
      Math.max(0, storefrontsPerMonth) * costs.generate_full_storefront;

    const sortedPlans = [...plans].sort((a, b) => a.credits - b.credits);
    const idealPlan =
      sortedPlans.find((p) => p.credits >= Math.max(1, monthlyCreditsNeeded)) ||
      sortedPlans[sortedPlans.length - 1] ||
      null;

    // BUG-F06-07: nunca divide por zero -> exibe estimativa limpa
    const dailyCreditsNeeded = monthlyCreditsNeeded / 30;
    const selected = plans.find((p) => p.id === selectedPlanId) || idealPlan;
    const estimatedDays =
      selected && dailyCreditsNeeded > 0
        ? Math.min(3650, Math.max(1, Math.round(selected.credits / dailyCreditsNeeded)))
        : null;

    return {
      monthlyCreditsNeeded,
      idealPlan,
      estimatedDays,
    };
  }, [whatsappPerDay, storefrontsPerMonth, costs, plans, selectedPlanId]);

  const handleSliderChange = (nextWpp: number, nextStores: number) => {
    setWhatsappPerDay(nextWpp);
    setStorefrontsPerMonth(nextStores);
    const needed = nextWpp * 30 * costs.glm_whatsapp + nextStores * costs.generate_full_storefront;
    const sorted = [...plans].sort((a, b) => a.credits - b.credits);
    const nextIdeal = sorted.find((p) => p.credits >= Math.max(1, needed)) || sorted[sorted.length - 1];
    if (nextIdeal && nextIdeal.id !== selectedPlanId) {
      onSelectPlan(nextIdeal.id);
    }
  };

  return (
    <section
      data-testid="credit-duration-simulator"
      aria-label="Simulador de Duração de Créditos"
      className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
        isDark
          ? 'border-slate-800 bg-[#111726] text-slate-100'
          : 'border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text)] shadow-xs'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-[#2563EB] dark:text-[#38BDF8]" aria-hidden="true" />
          <h2 className="text-sm font-bold">Simulador de Duração (~30 dias)</h2>
        </div>

        <span
          data-testid="simulator-monthly-estimate"
          className={`cg-tabular rounded-full px-3 py-1 text-xs font-bold ${
            isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-[#1D4ED8]'
          }`}
        >
          Consumo estimado: {simulation.monthlyCreditsNeeded.toLocaleString('pt-BR')} cr/mês
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <label htmlFor="sim-whatsapp-slider">Atendimentos WhatsApp/dia</label>
            <span className="cg-tabular font-bold text-[#2563EB] dark:text-[#38BDF8]" data-testid="sim-whatsapp-value">
              {whatsappPerDay} msgs/dia
            </span>
          </div>
          <input
            id="sim-whatsapp-slider"
            data-testid="sim-whatsapp-slider"
            type="range"
            min={0}
            max={150}
            step={5}
            value={whatsappPerDay}
            onChange={(e) => handleSliderChange(Number(e.target.value), storefrontsPerMonth)}
            className="w-full accent-[#2563EB] cursor-pointer"
          />
          <div className="cg-tabular flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>0</span>
            <span>75</span>
            <span>150</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <label htmlFor="sim-storefronts-slider">Vitrines ou campanhas/mês</label>
            <span className="cg-tabular font-bold text-[#2563EB] dark:text-[#38BDF8]" data-testid="sim-storefronts-value">
              {storefrontsPerMonth}x/mês
            </span>
          </div>
          <input
            id="sim-storefronts-slider"
            data-testid="sim-storefronts-slider"
            type="range"
            min={0}
            max={10}
            step={1}
            value={storefrontsPerMonth}
            onChange={(e) => handleSliderChange(whatsappPerDay, Number(e.target.value))}
            className="w-full accent-[#2563EB] cursor-pointer"
          />
          <div className="cg-tabular flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>
      </div>

      {simulation.idealPlan && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
            isDark
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
          }`}
        >
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4 shrink-0 text-[#10B981]" aria-hidden="true" />
            <span>
              Ideal para 30 dias:{' '}
              <strong data-testid="simulator-recommended-plan">{simulation.idealPlan.name}</strong> (
              <span className="cg-tabular">{simulation.idealPlan.credits.toLocaleString('pt-BR')} cr</span>)
            </span>
          </span>
          <span className="cg-tabular inline-flex items-center gap-1 font-bold" data-testid="simulator-estimated-days">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {simulation.estimatedDays !== null
              ? `Dura ~${simulation.estimatedDays} dias no pacote selecionado`
              : 'Consumo mínimo — pacote inicial cobre com folga'}
          </span>
        </div>
      )}
    </section>
  );
}
