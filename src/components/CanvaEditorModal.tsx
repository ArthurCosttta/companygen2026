import React, { useState } from 'react';
import type { StudioPost, StudioSlide } from '@/compiler/build-post-ir';
import type { PostSceneIR, Asset } from '@/compiler/types';
import { PostCanvas } from './PostCanvas';
import { downloadSlidePng } from '@/services/export-zip';
import {
  X,
  Download,
  Image as ImageIcon,
  Type,
  Palette,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CanvaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: StudioPost;
  currentSlideIndex: number;
  onSelectSlideIndex: (idx: number) => void;
  scenes: PostSceneIR[];
  assetMap: Map<string, Asset>;
  allAssets: Asset[];
  onUpdateSlide: (slideIdx: number, updates: Partial<StudioSlide>) => void;
  onUpdatePost: (updates: Partial<StudioPost>) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (slideIdx: number) => void;
  onDeleteSlide: (slideIdx: number) => void;
}

export const CanvaEditorModal: React.FC<CanvaEditorModalProps> = ({
  isOpen,
  onClose,
  post,
  currentSlideIndex,
  onSelectSlideIndex,
  scenes,
  assetMap,
  allAssets,
  onUpdateSlide,
  onUpdatePost,
  onAddSlide,
  onDuplicateSlide: _onDuplicateSlide,
  onDeleteSlide: _onDeleteSlide,
}) => {
  const [activeTool, setActiveTool] = useState<'image' | 'text' | 'caption' | 'style'>('image');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSavedRecently, setIsSavedRecently] = useState(false);

  if (!isOpen) return null;

  const currentSlide = post.slides?.[currentSlideIndex] || post.slides?.[0];
  const currentScene = scenes[currentSlideIndex] || scenes[0];

  const handleSelectAsset = (assetId: string) => {
    onUpdateSlide(currentSlideIndex, { image_asset_id: assetId });
    flashSaved();
  };

  const flashSaved = () => {
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2000);
  };

  const filteredAssets = allAssets.filter((a) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      (a.title && a.title.toLowerCase().includes(q)) ||
      (a.photographer && a.photographer.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1D52]/80 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200">
      {/* 1. Canva Top Header Bar */}
      <header className="h-16 px-6 bg-[#0B1D52] text-white flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#0867E8] to-[#00D2FF] flex items-center justify-center font-black text-white shadow-md">
              C
            </div>
            <div>
              <div className="font-extrabold text-[15px] tracking-tight flex items-center gap-1.5">
                <span>Canva Studio</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-white/15 text-[#00D2FF]">
                  Open Model
                </span>
              </div>
              <div className="text-[11.5px] text-white/60 truncate max-w-sm">
                {post.title} · Slide {currentSlideIndex + 1} de {post.slides.length}
              </div>
            </div>
          </div>
        </div>

        {/* Slide navigation controls */}
        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => onSelectSlideIndex(Math.max(0, currentSlideIndex - 1))}
            disabled={currentSlideIndex === 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 disabled:opacity-30 transition-colors cursor-pointer"
            title="Slide anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 px-1">
            {post.slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSlideIndex(idx)}
                className={cn(
                  'w-7 h-7 rounded-lg text-[12px] font-bold transition-all cursor-pointer',
                  currentSlideIndex === idx
                    ? 'bg-[#0867E8] text-white shadow-xs scale-105'
                    : 'text-white/70 hover:bg-white/10'
                )}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => onSelectSlideIndex(Math.min(post.slides.length - 1, currentSlideIndex + 1))}
            disabled={currentSlideIndex === post.slides.length - 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 disabled:opacity-30 transition-colors cursor-pointer"
            title="Próximo slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={onAddSlide}
            className="ml-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
            title="Adicionar novo slide ao carrossel"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Slide</span>
          </button>
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-3">
          {isSavedRecently && (
            <span className="text-[12px] font-bold text-emerald-400 flex items-center gap-1">
              <Check className="w-4 h-4" /> Salvo!
            </span>
          )}

          {currentScene && (
            <button
              onClick={() => {
                downloadSlidePng(currentScene, assetMap, `${post.id}_slide_${currentSlideIndex + 1}.png`);
              }}
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[12.5px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
              title="Baixar imagem em resolução 1080x1350"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PNG</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[12.5px] font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Concluir e Salvar</span>
          </button>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-white/70 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar Canva"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Canva Body (Left Toolbar + Center Canvas Preview) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Vertical Icon Bar */}
        <div className="w-18 bg-[#071336] border-r border-white/10 flex flex-col items-center py-4 gap-3 shrink-0">
          <button
            data-tool="image"
            onClick={() => setActiveTool('image')}
            className={cn(
              'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all cursor-pointer',
              activeTool === 'image'
                ? 'bg-[#0867E8] text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <ImageIcon className="w-5 h-5" />
            <span>Foto</span>
          </button>

          <button
            data-tool="text"
            onClick={() => setActiveTool('text')}
            className={cn(
              'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all cursor-pointer',
              activeTool === 'text'
                ? 'bg-[#0867E8] text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Type className="w-5 h-5" />
            <span>Texto</span>
          </button>

          <button
            data-tool="caption"
            onClick={() => setActiveTool('caption')}
            className={cn(
              'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all cursor-pointer',
              activeTool === 'caption'
                ? 'bg-[#0867E8] text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <FileText className="w-5 h-5" />
            <span>Legenda</span>
          </button>

          <button
            data-tool="style"
            onClick={() => setActiveTool('style')}
            className={cn(
              'w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all cursor-pointer',
              activeTool === 'style'
                ? 'bg-[#0867E8] text-white shadow-lg'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Palette className="w-5 h-5" />
            <span>Estilo</span>
          </button>
        </div>

        {/* Left Sub-Panel with Tools */}
        <aside className="w-80 bg-white border-r border-[#E6EFFB] flex flex-col shrink-0 overflow-y-auto cg-scroll">
          {/* TAB 1: IMAGENS */}
          {activeTool === 'image' && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-bold text-[14px] text-[#0B1D52]">Banco de Imagens da Marca</h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Clique em qualquer foto autorizada para aplicar no slide instantaneamente.
                </p>
              </div>

              <input
                type="text"
                placeholder="Buscar foto por estilo ou termo..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-[12px] outline-none focus:border-[#0867E8]"
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                {filteredAssets.map((asset) => {
                  const isCurrent = currentSlide?.image_asset_id === asset.asset_id;
                  const thumb = asset.local_path.startsWith('blob:') || asset.local_path.startsWith('data:')
                    ? asset.local_path
                    : `./${asset.local_path.replace(/^\.?\//, '')}`;
                  return (
                    <div
                      key={asset.asset_id}
                      onClick={() => handleSelectAsset(asset.asset_id)}
                      className={cn(
                        'aspect-[4/5] rounded-xl overflow-hidden border relative cursor-pointer group transition-all',
                        isCurrent
                          ? 'border-[#0867E8] ring-3 ring-[#0867E8]/30 shadow-md'
                          : 'border-[#E2E8F0] hover:border-[#0867E8]'
                      )}
                    >
                      <img
                        src={thumb}
                        alt={asset.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                      {isCurrent && (
                        <div className="absolute top-1.5 right-1.5 bg-[#0867E8] text-white p-1 rounded-full shadow-xs">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent text-[10px] text-white truncate font-medium">
                        {asset.title || 'Foto de Estilo'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: TEXTO */}
          {activeTool === 'text' && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-bold text-[14px] text-[#0B1D52]">Texto do Slide</h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Edite título, subtítulo e chamada com atualização ao vivo no Canvas.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11.5px] font-bold text-[#0B1D52] mb-1">
                    Título Principal (Headline)
                  </label>
                  <textarea
                    rows={3}
                    value={currentSlide?.headline || ''}
                    onChange={(e) => {
                      onUpdateSlide(currentSlideIndex, { headline: e.target.value });
                      flashSaved();
                    }}
                    placeholder="Digite o título do slide..."
                    className="w-full p-2.5 rounded-xl border border-[#E2E8F0] text-[13px] font-semibold text-[#0B1D52] outline-none focus:border-[#0867E8]"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-bold text-[#0B1D52] mb-1">
                    Subtítulo / Descrição
                  </label>
                  <textarea
                    rows={4}
                    value={currentSlide?.body || ''}
                    onChange={(e) => {
                      onUpdateSlide(currentSlideIndex, { body: e.target.value });
                      flashSaved();
                    }}
                    placeholder="Digite o texto de apoio..."
                    className="w-full p-2.5 rounded-xl border border-[#E2E8F0] text-[12.5px] text-[#0B1D52] outline-none focus:border-[#0867E8]"
                  />
                </div>

                {currentSlide?.template === 'cta' && (
                  <div>
                    <label className="block text-[11.5px] font-bold text-[#0B1D52] mb-1">
                      Botão de Ação (CTA)
                    </label>
                    <input
                      type="text"
                      value={currentSlide?.cta_label || ''}
                      onChange={(e) => {
                        onUpdateSlide(currentSlideIndex, { cta_label: e.target.value });
                        flashSaved();
                      }}
                      placeholder="Ex: Salve este Post, Compre Agora..."
                      className="w-full p-2.5 rounded-xl border border-[#E2E8F0] text-[12.5px] text-[#0B1D52] outline-none focus:border-[#0867E8]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LEGENDA */}
          {activeTool === 'caption' && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-bold text-[14px] text-[#0B1D52]">Legenda do Instagram</h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Personalize a legenda que acompanha os slides desta publicação.
                </p>
              </div>

              <div>
                <textarea
                  rows={12}
                  value={post.caption}
                  onChange={(e) => {
                    onUpdatePost({ caption: e.target.value });
                    flashSaved();
                  }}
                  placeholder="Escreva a legenda com emojis, hashtags e detalhes..."
                  className="w-full p-3 rounded-xl border border-[#E2E8F0] text-[13px] leading-relaxed text-[#0B1D52] outline-none focus:border-[#0867E8] font-sans"
                />
                <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-1.5">
                  <span>Recomendado: 100 a 300 caracteres</span>
                  <span>{post.caption.length} / 2.200</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ESTILO */}
          {activeTool === 'style' && (
            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-bold text-[14px] text-[#0B1D52]">Modelo de Composição</h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Alterne o layout estrutural deste slide.
                </p>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'cover', name: 'Capa de Impacto', desc: 'Foto em destaque com título sobreposto' },
                  { id: 'editorial_split', name: 'Editorial Dividido', desc: '50% foto e 50% conteúdo' },
                  { id: 'product_focus', name: 'Foco no Produto', desc: 'Vitrine com tag de detalhes' },
                  { id: 'minimal_quote', name: 'Tipografia Editorial', desc: 'Foco no texto persuasivo' },
                  { id: 'cta', name: 'Chamada para Ação', desc: 'Slide final para engajamento' },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      onUpdateSlide(currentSlideIndex, { template: tpl.id as any });
                      flashSaved();
                    }}
                    className={cn(
                      'w-full p-3 rounded-xl border text-left transition-all cursor-pointer',
                      currentSlide?.template === tpl.id
                        ? 'border-[#0867E8] bg-[#EDF4FF]'
                        : 'border-[#E2E8F0] hover:border-[#0867E8] bg-white'
                    )}
                  >
                    <div className="font-bold text-[12.5px] text-[#0B1D52]">{tpl.name}</div>
                    <div className="text-[11px] text-[#64748B]">{tpl.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Center Canvas Preview Workspace */}
        <main className="flex-1 bg-[#1A264E] flex items-center justify-center p-6 overflow-hidden relative">
          <div className="h-full max-h-[82vh] aspect-[4/5] bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/20 relative">
            {currentScene ? (
              <PostCanvas
                scene={currentScene}
                assetMap={assetMap}
                showSafeMargin={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50">
                Carregando Canvas 4:5...
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
