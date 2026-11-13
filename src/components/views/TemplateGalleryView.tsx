import React, { useState } from 'react';
import { listTemplates } from '@/compiler/template-registry';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { ProductSpec } from '@/schemas/campaign.schema';
import {
  LayoutTemplate,
  Plus,
} from 'lucide-react';

interface TemplateGalleryViewProps {
  products: ProductSpec[];
  onUseTemplate: (newPost: StudioPost) => void;
  onNavigateToCalendar: () => void;
}

export const TemplateGalleryView: React.FC<TemplateGalleryViewProps> = ({
  products,
  onUseTemplate,
  onNavigateToCalendar,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const allTemplates = listTemplates();

  const categories = [
    { id: 'all', label: 'Todos os Templates' },
    { id: 'cover', label: 'Capas & Aberturas' },
    { id: 'product_focus', label: 'Produtos & Preços' },
    { id: 'editorial_split', label: 'Editoriais & Dicas' },
    { id: 'detail', label: 'Detalhes & Zoom' },
    { id: 'cta', label: 'Conversão & CTA' },
  ];

  const filteredTemplates = allTemplates.filter((t) => {
    if (selectedCategory === 'all') return true;
    return t.id === selectedCategory;
  });

  const handleCreateFromTemplate = (templateId: string, variantId: string) => {
    const postId = `post_tpl_${Date.now()}`;
    const newPost: StudioPost = {
      id: postId,
      date: '2026-11-16',
      time: '10:00',
      type: 'carousel',
      status: 'draft',
      title: `Novo Post — ${templateId}`,
      product_ids: products[0] ? [products[0].id] : [],
      caption: `Post baseado no template ${templateId}. Confira os detalhes e novidades!`,
      slides: [
        {
          id: `s1_${postId}`,
          template: templateId,
          variant: variantId,
          headline: 'Título de Alto Impacto',
          body: 'Texto complementar explicativo ajustado para engajamento no Instagram.',
          image_query: 'navy blue polo shirt',
        },
        {
          id: `s2_${postId}`,
          template: 'cta',
          variant: 'band',
          headline: 'Gostou dessa sugestão?',
          body: 'Conheça nossa coleção completa no link da bio.',
          cta_label: 'Ver coleção',
          image_query: 'mens clothing collection',
        },
      ],
    };

    onUseTemplate(newPost);
    onNavigateToCalendar();
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#F7FAFF] cg-scroll select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E6EFFB]">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
                <LayoutTemplate className="w-4 h-4" />
              </div>
              <h2 className="text-[22px] font-bold text-[#0B1D52]">
                Biblioteca Oficial de Templates e Variantes
              </h2>
            </div>
            <p className="text-[13px] text-[#64748B] mt-1">
              Catálogo visual dos motores de composição Konva/Canvas com regras de tipografia e proporções 4:5.
            </p>
          </div>

          <button
            onClick={onNavigateToCalendar}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#0B1D52] transition-colors"
          >
            ← Voltar ao Calendário
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all ${
                selectedCategory === c.id
                  ? 'bg-[#0867E8] text-white shadow-xs'
                  : 'bg-white border border-[#E6EFFB] text-[#64748B] hover:text-[#0B1D52]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-2xl border border-[#E6EFFB] overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              {/* Card Header & Preview */}
              <div>
                <div className="p-4 border-b border-[#E6EFFB] bg-[#F7FAFF] flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[15px] text-[#0B1D52]">{tpl.label}</h3>
                    <span className="font-mono text-[11px] text-[#0867E8]">ID: {tpl.id}</span>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-[#E6EFFB] text-[#64748B]">
                    {tpl.variants.length} variantes
                  </span>
                </div>

                {/* Mockup Wireframe Preview */}
                <div className="p-5 flex items-center justify-center bg-[#FDFEFE]">
                  <div className="w-[140px] aspect-[4/5] rounded-xl border-2 border-[#0867E8] bg-white p-2.5 flex flex-col justify-between shadow-sm relative overflow-hidden">
                    {/* Visual sketch representing the template */}
                    {tpl.id === 'cover' && (
                      <>
                        <div className="w-12 h-2.5 bg-[#0867E8] rounded-full" />
                        <div className="space-y-1">
                          <div className="w-full h-3 bg-[#0B1D52] rounded" />
                          <div className="w-3/4 h-2 bg-[#64748B] rounded" />
                        </div>
                        <div className="w-full h-10 bg-[#EDF4FF] rounded-lg border border-dashed border-[#0867E8]/30 flex items-center justify-center text-[8px] text-[#0867E8]">
                          Foto + Split
                        </div>
                      </>
                    )}
                    {tpl.id === 'product_focus' && (
                      <>
                        <div className="w-12 h-2.5 bg-[#0867E8] rounded-full" />
                        <div className="w-full h-14 bg-[#EDF4FF] rounded-xl flex items-center justify-center text-[8px] text-[#0867E8]">
                          Produto Destaque
                        </div>
                        <div className="space-y-1">
                          <div className="w-full h-2.5 bg-[#0B1D52] rounded" />
                          <div className="w-10 h-2.5 bg-[#24A677] rounded" />
                        </div>
                      </>
                    )}
                    {tpl.id === 'editorial_split' && (
                      <>
                        <div className="w-12 h-2.5 bg-[#0867E8] rounded-full" />
                        <div className="grid grid-cols-2 gap-1 flex-1 my-1">
                          <div className="bg-[#EDF4FF] rounded text-[7px] text-[#0867E8] flex items-center justify-center">
                            Foto
                          </div>
                          <div className="flex flex-col justify-center space-y-1">
                            <div className="w-full h-2 bg-[#0B1D52] rounded" />
                            <div className="w-3/4 h-1.5 bg-[#64748B] rounded" />
                          </div>
                        </div>
                      </>
                    )}
                    {tpl.id === 'detail' && (
                      <>
                        <div className="w-12 h-2.5 bg-[#0867E8] rounded-full" />
                        <div className="w-full flex-1 my-1 bg-[#EDF4FF] rounded-lg relative flex items-center justify-center text-[8px] text-[#0867E8]">
                          Zoom (1.6x)
                          <div className="absolute right-1 top-1 w-5 h-5 rounded-full border border-white" />
                        </div>
                        <div className="w-full h-2 bg-[#0B1D52] rounded" />
                      </>
                    )}
                    {tpl.id === 'cta' && (
                      <>
                        <div className="w-12 h-2.5 bg-[#0867E8] rounded-full" />
                        <div className="w-full h-10 bg-[#EDF4FF] rounded" />
                        <div className="w-full h-4 bg-[#0867E8] rounded-md flex items-center justify-center text-[7px] text-white font-bold">
                          BOTÃO CTA →
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Description and Variants list */}
                <div className="p-4 space-y-3">
                  <p className="text-[12px] text-[#64748B] leading-relaxed">
                    {tpl.description}
                  </p>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[#0B1D52] uppercase tracking-wide">
                      Variantes Suportadas:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {tpl.variants.map((v) => (
                        <span
                          key={v.id}
                          className="px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[11px] text-[#0B1D52] font-medium"
                        >
                          {v.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action */}
              <div className="p-4 border-t border-[#E6EFFB] bg-[#F7FAFF]">
                <button
                  type="button"
                  onClick={() => handleCreateFromTemplate(tpl.id, tpl.defaultVariant)}
                  className="w-full py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Usar Template no Post</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
