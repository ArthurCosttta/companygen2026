import React, { useState } from 'react';
import { Tag, Plus, X, Flame, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Promotion {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  discount: string;
  color: 'blue' | 'amber' | 'emerald' | 'purple' | 'rose';
}

interface CampaignBannerProps {
  promotions: Promotion[];
  weekDates: string[]; // ['2026-11-09', ..., '2026-11-15']
  onAddPromotion: (promo: Omit<Promotion, 'id'>) => void;
  onRemovePromotion: (id: string) => void;
}

const COLOR_MAP = {
  blue: 'bg-[#EDF4FF] border-[#BFDBFE] text-[#0867E8]',
  amber: 'bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]',
  emerald: 'bg-[#DCFCE7] border-[#BBF7D0] text-[#15803D]',
  purple: 'bg-[#F3E8FF] border-[#E9D5FF] text-[#7E22CE]',
  rose: 'bg-[#FFE4E6] border-[#FECDD3] text-[#BE123C]',
};

export const CampaignBanner: React.FC<CampaignBannerProps> = ({
  promotions,
  weekDates,
  onAddPromotion,
  onRemovePromotion,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('Promoção Semana das Polos');
  const [startDate, setStartDate] = useState('2026-11-09');
  const [endDate, setEndDate] = useState('2026-11-13');
  const [discount, setDiscount] = useState('20% OFF');
  const [color, setColor] = useState<Promotion['color']>('blue');

  // Filter promotions that overlap with this week
  const activeWeekPromos = promotions.filter((promo) => {
    return weekDates.some((d) => d >= promo.startDate && d <= promo.endDate);
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddPromotion({
      name,
      startDate,
      endDate,
      discount,
      color,
    });
    setIsModalOpen(false);
  };

  return (
    <div className="bg-[#F8FAFC] border-b border-[#E6EFFB] px-4 py-2 select-none">
      <div className="flex items-center justify-between gap-3">
        {/* Active Promos Strip */}
        <div className="flex-1 flex flex-wrap items-center gap-2 overflow-x-auto py-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] shrink-0">
            <Tag className="w-3.5 h-3.5 text-[#0867E8]" />
            <span>CAMPANHAS:</span>
          </div>

          {activeWeekPromos.map((promo) => {
            const startLabel = promo.startDate.split('-').slice(1).reverse().join('/');
            const endLabel = promo.endDate.split('-').slice(1).reverse().join('/');
            return (
              <div
                key={promo.id}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-2 shadow-2xs transition-all',
                  COLOR_MAP[promo.color]
                )}
              >
                <div className="flex items-center gap-1">
                  {promo.color === 'amber' || promo.color === 'rose' ? (
                    <Flame className="w-3 h-3 shrink-0" />
                  ) : (
                    <Sparkles className="w-3 h-3 shrink-0" />
                  )}
                  <span>{promo.name}</span>
                  <span className="font-extrabold px-1 rounded bg-white/60 text-[10px]">
                    {promo.discount}
                  </span>
                  <span className="opacity-75 font-normal text-[10px]">
                    ({startLabel} a {endLabel})
                  </span>
                </div>

                <button
                  onClick={() => onRemovePromotion(promo.id)}
                  className="opacity-60 hover:opacity-100 hover:text-red-600 transition-opacity p-0.5"
                  title="Remover promoção"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {activeWeekPromos.length === 0 && (
            <span className="text-[11px] text-slate-400 italic">
              Nenhuma promoção cadastrada para esta semana.
            </span>
          )}
        </div>

        {/* Button to add promo */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-2.5 py-1 rounded-lg border border-[#CBD5E1] hover:border-[#0867E8] bg-white text-[#0B1D52] hover:text-[#0867E8] text-[11.5px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 text-[#0867E8]" />
          <span>+ Promoção</span>
        </button>
      </div>

      {/* Modal to add Promotion */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E6EFFB] shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E6EFFB] pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#0867E8]" />
                <h3 className="font-bold text-[15px] text-[#0B1D52]">
                  Definir Campanha ou Promoção
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-[12px] font-bold text-[#0B1D52] mb-1">
                  Nome da Promoção
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Semana das Polos, Queima de Estoque..."
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[13px] outline-none focus:border-[#0867E8]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#0B1D52] mb-1">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[12.5px] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-[#0B1D52] mb-1">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[12.5px] outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#0B1D52] mb-1">
                    Desconto / Oferta
                  </label>
                  <input
                    type="text"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="Ex: 20% OFF, Leve 3 Pague 2"
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[12.5px] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#0B1D52] mb-1">
                    Cor do Destaque
                  </label>
                  <select
                    value={color}
                    onChange={(e) => setColor(e.target.value as Promotion['color'])}
                    className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-[12.5px] outline-none bg-white"
                  >
                    <option value="blue">Azul (Padrão)</option>
                    <option value="amber">Laranja (Destaque)</option>
                    <option value="emerald">Verde (Sucesso)</option>
                    <option value="purple">Roxo (Especial)</option>
                    <option value="rose">Vermelho (Queima)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-2 rounded-xl border border-[#CBD5E1] text-[12.5px] font-semibold text-[#64748B] hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[12.5px] font-bold cursor-pointer transition-colors"
                >
                  Salvar Promoção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
