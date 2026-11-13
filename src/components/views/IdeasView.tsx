import React from 'react';
import { Lightbulb, ArrowRight } from 'lucide-react';

interface IdeasViewProps {
  onUseIdea: (title: string, query: string) => void;
  onNavigateToCalendar: () => void;
}

export const IdeasView: React.FC<IdeasViewProps> = ({ onUseIdea, onNavigateToCalendar }) => {
  const contentPillars = [
    {
      pillar: 'Autoridade & Estilo',
      description: 'Construa credibilidade ensinando combinações inteligentes.',
      ideas: [
        { title: '3 formas de usar a Camisa Polo no trabalho', query: 'smart casual mens outfit' },
        { title: 'Como escolher o tamanho certo de polo', query: 'polo shirt studio photo' },
        { title: 'Qualidade que dura: como reconhecer algodão nobre', query: 'blue polo shirt detail' },
      ],
    },
    {
      pillar: 'Vendas & Produto',
      description: 'Destaque atributos que justificam o valor da peça.',
      ideas: [
        { title: 'Camisa Polo Azul: a peça coringa do guarda-roupa', query: 'navy blue polo shirt' },
        { title: 'Guia de combinações: Polo Azul + Chino Bege', query: 'casual polo outfit jeans' },
        { title: 'Reposição de estoque: tamanhos mais pedidos', query: 'mens outfit flat lay' },
      ],
    },
    {
      pillar: 'Bastidores & Conexão',
      description: 'Gere proximidade mostrando o cuidado por trás de cada pedido.',
      ideas: [
        { title: 'Bastidores: como preparamos cada envio', query: 'folded casual clothes' },
        { title: 'Por dentro do showroom da nossa loja', query: 'mens clothing studio photography' },
        { title: 'Look de fim de semana: elegância sem esforço', query: 'polo shirt fashion outfit' },
      ],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#F7FAFF] cg-scroll select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#E6EFFB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[22px] font-bold text-[#0B1D52]">
                Matriz de Ideias de Conteúdo para 30 Dias
              </h2>
              <p className="text-[13px] text-[#64748B]">
                Pilares estruturados para manter consistência, variedade e conversão no Instagram.
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {contentPillars.map((p, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-[#E6EFFB] p-5 space-y-4 shadow-xs">
              <div>
                <h3 className="font-bold text-[16px] text-[#0B1D52]">{p.pillar}</h3>
                <p className="text-[12px] text-[#64748B] mt-0.5">{p.description}</p>
              </div>

              <div className="space-y-2.5">
                {p.ideas.map((idea, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      onUseIdea(idea.title, idea.query);
                      onNavigateToCalendar();
                    }}
                    className="p-3 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] hover:border-[#0867E8] hover:bg-[#EDF4FF] cursor-pointer transition-all space-y-1.5 group"
                  >
                    <div className="font-semibold text-[13px] text-[#0B1D52] group-hover:text-[#0867E8] transition-colors">
                      {idea.title}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                      <span>Foto: {idea.query}</span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#0867E8]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
