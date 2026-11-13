import React from 'react';
import { BarChart3, Clock, TrendingUp } from 'lucide-react';

export const AnalyticsView: React.FC<{ onNavigateToCalendar: () => void }> = ({ onNavigateToCalendar }) => {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#F7FAFF] cg-scroll select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#E6EFFB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[22px] font-bold text-[#0B1D52]">
                Análises de Performance e Planejamento
              </h2>
              <p className="text-[13px] text-[#64748B]">
                Métricas estimadas de retenção e mapa de calor dos melhores horários de postagem.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToCalendar}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#0B1D52] transition-colors"
          >
            ← Voltar ao Calendário
          </button>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#E6EFFB] space-y-1">
            <span className="text-[11.5px] font-medium text-[#64748B]">Posts Planejados</span>
            <div className="text-[24px] font-bold text-[#0B1D52]">9</div>
            <span className="text-[11px] text-[#24A677] font-semibold flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Semana ativa</span>
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E6EFFB] space-y-1">
            <span className="text-[11.5px] font-medium text-[#64748B]">Carrosséis Gerados</span>
            <div className="text-[24px] font-bold text-[#0867E8]">100%</div>
            <span className="text-[11px] text-[#64748B]">Formato 4:5 vertical</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E6EFFB] space-y-1">
            <span className="text-[11.5px] font-medium text-[#64748B]">Melhor Horário</span>
            <div className="text-[24px] font-bold text-[#0B1D52]">09:00</div>
            <span className="text-[11px] text-[#E8A23F] font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Pico de abertura</span>
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#E6EFFB] space-y-1">
            <span className="text-[11.5px] font-medium text-[#64748B]">Alcance Potencial</span>
            <div className="text-[24px] font-bold text-[#24A677]">18.4k</div>
            <span className="text-[11px] text-[#64748B]">Público segmento Moda</span>
          </div>
        </div>

        {/* Schedule Heatmap Card */}
        <div className="bg-white p-6 rounded-2xl border border-[#E6EFFB] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[15px] text-[#0B1D52]">
              Mapa de Calor — Horários Mais Estratégicos
            </h3>
            <span className="text-[12px] text-[#64748B]">Fuso: America/Sao_Paulo</span>
          </div>

          <div className="space-y-2 text-[12px]">
            <div className="flex items-center gap-3">
              <span className="w-20 font-semibold text-[#0B1D52]">07:00 – 09:00</span>
              <div className="flex-1 h-3 bg-[#E6EFFB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0867E8] rounded-full" style={{ width: '92%' }} />
              </div>
              <span className="w-12 text-right font-bold text-[#0867E8]">92%</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-20 font-semibold text-[#0B1D52]">11:00 – 12:00</span>
              <div className="flex-1 h-3 bg-[#E6EFFB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0867E8] rounded-full" style={{ width: '84%' }} />
              </div>
              <span className="w-12 text-right font-bold text-[#0867E8]">84%</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-20 font-semibold text-[#0B1D52]">14:00 – 16:00</span>
              <div className="flex-1 h-3 bg-[#E6EFFB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0867E8] rounded-full" style={{ width: '68%' }} />
              </div>
              <span className="w-12 text-right font-bold text-[#0867E8]">68%</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-20 font-semibold text-[#0B1D52]">18:00 – 20:00</span>
              <div className="flex-1 h-3 bg-[#E6EFFB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0867E8] rounded-full" style={{ width: '89%' }} />
              </div>
              <span className="w-12 text-right font-bold text-[#0867E8]">89%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
