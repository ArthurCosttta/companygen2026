import React, { useState } from 'react';
import type { CampaignSpec, ProductSpec } from '@/schemas/campaign.schema';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { Asset } from '@/compiler/types';
import {
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle2,
  Wand2,
  Tag,
  Clock,
} from 'lucide-react';

interface GeneratePostsViewProps {
  campaignSpec: CampaignSpec;
  products: ProductSpec[];
  assets: Asset[];
  onSchedulePost: (newPost: StudioPost) => void;
  onNavigateToCalendar: () => void;
}

export const GeneratePostsView: React.FC<GeneratePostsViewProps> = ({
  campaignSpec,
  products,
  assets: _assets,
  onSchedulePost,
  onNavigateToCalendar,
}) => {
  const [topic, setTopic] = useState('Apresentação de produto');
  const [themePillar, setThemePillar] = useState<'dicas' | 'produto' | 'vendas' | 'bastidores'>('dicas');
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [slideCount, setSlideCount] = useState<number>(5);
  const [targetDate, setTargetDate] = useState('2026-11-16');
  const [targetTime, setTargetTime] = useState('09:00');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState<StudioPost | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const handleGenerateDraft = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const postId = `catalog_draft_${Date.now()}`;
      const storeName = campaignSpec?.brand?.name || 'sua loja';
      const productName = selectedProduct?.name || 'produto selecionado';
      const draft: StudioPost = {
        id: postId,
        date: targetDate,
        time: targetTime,
        type: slideCount > 1 ? 'carousel' : 'single',
        status: 'draft',
        title: topic,
        product_ids: selectedProduct ? [selectedProduct.id] : [],
        caption: `${topic}\n\nConheça ${productName} no catálogo da ${storeName}. Fale com nossa equipe pelo WhatsApp para consultar detalhes, disponibilidade e condições cadastradas.`,
        slides: [
          {
            id: `s1_${postId}`,
            template: 'cover',
            variant: 'panel',
            headline: topic,
            body: `Conteúdo preparado a partir do catálogo da ${storeName}.`,
            image_query: productName,
          },
          {
            id: `s2_${postId}`,
            template: 'editorial_split',
            variant: 'split_50_50',
            headline: productName,
            body: 'Apresente aqui os benefícios confirmados e as informações reais deste item.',
            image_query: productName,
          },
          {
            id: `s3_${postId}`,
            template: 'product_focus',
            variant: 'card',
            headline: productName,
            body: 'Consulte preço, estoque e variações diretamente no catálogo cadastrado.',
            image_query: productName,
            show_price: true,
          },
          {
            id: `s4_${postId}`,
            template: 'detail',
            variant: 'zoom_panel',
            headline: 'Detalhes que importam',
            body: 'Use uma imagem real do produto para mostrar seus detalhes sem promessas inventadas.',
            image_query: `${productName} detalhes`,
          },
          {
            id: `s5_${postId}`,
            template: 'cta',
            variant: 'band',
            headline: 'Garanta a sua peça',
            body: 'Visite nossa loja ou chame nossa equipe no WhatsApp para atendimento personalizado.',
            cta_label: 'Chamar no WhatsApp',
            image_query: productName,
          },
        ].slice(0, slideCount),
      };

      setGeneratedDraft(draft);
      setIsGenerating(false);
    }, 600);
  };

  const handleConfirmSchedule = () => {
    if (!generatedDraft) return;
    onSchedulePost(generatedDraft);
    onNavigateToCalendar();
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[#F7FAFF] cg-scroll select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E6EFFB]">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#0867E8] text-white flex items-center justify-center font-bold shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-[22px] font-bold text-[#0B1D52]">
                Estúdio de composição de posts
              </h2>
            </div>
            <p className="text-[13px] text-[#64748B] mt-1">
              Defina o tema, vincule o produto e compile carrosséis completos prontos para o calendário.
            </p>
          </div>

          <button
            onClick={onNavigateToCalendar}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#0B1D52] transition-colors"
          >
            ← Voltar ao Calendário
          </button>
        </div>

        {/* Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: 5 cols */}
          <div className="lg:col-span-5 space-y-4 bg-white p-5 rounded-2xl border border-[#E6EFFB] shadow-xs">
            <h3 className="font-bold text-[15px] text-[#0B1D52] flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-[#0867E8]" />
              <span>Parâmetros de Geração</span>
            </h3>

            {/* Content Pillar */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0B1D52]">
                Pilar de Conteúdo
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'dicas', label: 'Dicas de Estilo' },
                  { id: 'produto', label: 'Foco no Produto' },
                  { id: 'vendas', label: 'Oferta / Promoção' },
                  { id: 'bastidores', label: 'Bastidores / Marca' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setThemePillar(p.id as any)}
                    className={`px-3 py-2 rounded-xl text-left border text-[12px] transition-all ${
                      themePillar === p.id
                        ? 'border-[#0867E8] bg-[#EDF4FF] text-[#0867E8] font-bold'
                        : 'border-[#E6EFFB] bg-[#F7FAFF] text-[#64748B] hover:text-[#0B1D52]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topic input */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0B1D52]">
                Tema ou Título do Post
              </label>
              <textarea
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] text-[13px] text-[#0B1D52] outline-none focus:border-[#0867E8] transition-colors"
                placeholder="Ex: 3 formas de usar a polo no dia a dia..."
              />
            </div>

            {/* Linked Product */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0B1D52] flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#0867E8]" />
                <span>Produto Vinculado</span>
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] text-[13px] text-[#0B1D52] outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ''} — R${' '}
                    {((p.price_cents || 0) / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Slide Count */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[#0B1D52] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0867E8]" />
                <span>Quantidade de Slides</span>
              </label>
              <div className="flex gap-2">
                {[1, 3, 5, 7].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSlideCount(num)}
                    className={`flex-1 py-1.5 rounded-xl border text-[12px] font-semibold transition-all ${
                      slideCount === num
                        ? 'border-[#0867E8] bg-[#0867E8] text-white'
                        : 'border-[#E6EFFB] bg-[#F7FAFF] text-[#64748B]'
                    }`}
                  >
                    {num === 1 ? '1 (Único)' : `${num} slides`}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Schedule Date & Time */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E6EFFB]">
              <div className="space-y-1">
                <label className="text-[11.5px] font-semibold text-[#0B1D52] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#0867E8]" />
                  <span>Data de Agendamento</span>
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] text-[12px] text-[#0B1D52] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11.5px] font-semibold text-[#0B1D52] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#0867E8]" />
                  <span>Horário</span>
                </label>
                <select
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] text-[12px] text-[#0B1D52] outline-none"
                >
                  {['07:00', '08:00', '09:00', '10:00', '11:00', '14:00', '16:00', '18:00', '20:00'].map(
                    (h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateDraft}
              disabled={isGenerating}
              className="w-full py-2.5 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white font-bold text-[13.5px] flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Compilando carrossel...' : 'Gerar rascunho do post'}</span>
            </button>
          </div>

          {/* Right Preview: 7 cols */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-[#E6EFFB] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#E6EFFB]">
                <h3 className="font-bold text-[15px] text-[#0B1D52]">
                  Prévia do Post Compilado
                </h3>
                {generatedDraft && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#24A677] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Pronto para o calendário</span>
                  </span>
                )}
              </div>

              {generatedDraft ? (
                <div className="space-y-4 pt-4">
                  {/* Title & metadata */}
                  <div>
                    <h4 className="font-bold text-[16px] text-[#0B1D52]">
                      {generatedDraft.title}
                    </h4>
                    <p className="text-[12px] text-[#64748B]">
                      Agendado para: <strong>{generatedDraft.date} às {generatedDraft.time}</strong> ·{' '}
                      {generatedDraft.slides.length} slides
                    </p>
                  </div>

                  {/* Slides list preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {generatedDraft.slides.map((s, idx) => (
                      <div
                        key={s.id}
                        className="p-3 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] space-y-1 text-left"
                      >
                        <div className="flex items-center justify-between text-[11px] text-[#0867E8] font-bold">
                          <span>Slide {idx + 1}</span>
                          <span className="text-[10px] text-[#64748B] font-mono">{s.template}</span>
                        </div>
                        <div className="font-semibold text-[12px] text-[#0B1D52] line-clamp-2">
                          {s.headline}
                        </div>
                        <div className="text-[11px] text-[#64748B] line-clamp-2">{s.body}</div>
                      </div>
                    ))}
                  </div>

                  {/* Caption preview */}
                  <div className="p-3 rounded-xl border border-[#E6EFFB] bg-[#FDFEFE] space-y-1">
                    <span className="text-[11.5px] font-bold text-[#64748B] uppercase">
                      Legenda do Instagram
                    </span>
                    <p className="text-[12px] text-[#0B1D52] whitespace-pre-line leading-relaxed">
                      {generatedDraft.caption}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-[#64748B] space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#F7FAFF] border border-[#E6EFFB] text-[#0867E8] flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-[15px] text-[#0B1D52]">
                    Nenhum post gerado ainda
                  </h4>
                  <p className="text-[12.5px] max-w-sm mx-auto">
                    Preencha os parâmetros ao lado e clique em <strong>Gerar rascunho do post</strong> para ver a estrutura dos slides e a legenda.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Action Button */}
            {generatedDraft && (
              <div className="pt-4 border-t border-[#E6EFFB] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSchedule}
                  className="px-6 py-2.5 rounded-xl bg-[#24A677] hover:bg-[#1E8A63] text-white font-bold text-[13.5px] flex items-center gap-2 shadow-xs transition-colors"
                >
                  <span>Inserir no Calendário e Abrir no Editor</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
