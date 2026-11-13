import React, { useMemo } from 'react';
import type { StudioPost, StudioSlide } from '@/compiler/build-post-ir';
import type { PostSceneIR, Asset } from '@/compiler/types';
import type { ProductSpec, PostStatus } from '@/schemas/campaign.schema';
import { PostCanvas } from './PostCanvas';
import { SlideStrip } from './SlideStrip';
import { InstagramIcon } from '@/components/ui/icons';
import {
  X,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorInspectorProps {
  post: StudioPost;
  currentSlideIndex: number;
  onSelectSlideIndex: (index: number) => void;
  scenes: PostSceneIR[];
  assetMap: Map<string, Asset>;
  allAssets: Asset[];
  products: ProductSpec[];
  onUpdateSlide: (slideIndex: number, updates: Partial<StudioSlide>) => void;
  onUpdatePost: (updates: Partial<StudioPost>) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (slideIndex: number) => void;
  onDeleteSlide: (slideIndex: number) => void;
  onDeletePost: (postId: string) => void;
  onClose: () => void;
  onOpenCanva?: () => void;
  saveStatus: 'saving' | 'saved' | 'error';
}

export const EditorInspector: React.FC<EditorInspectorProps> = ({
  post,
  currentSlideIndex,
  onSelectSlideIndex,
  scenes,
  assetMap,
  products,
  onUpdatePost,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onDeletePost,
  onClose,
  onOpenCanva,
  saveStatus,
}) => {
  const currentSlide = post.slides?.[currentSlideIndex] || post.slides?.[0];
  const currentScene = scenes[currentSlideIndex] || scenes[0];

  if (!currentSlide) {
    return (
      <aside className="w-[430px] shrink-0 border-l border-[#E6EFFB] bg-white flex flex-col h-screen sticky top-0 p-4">
        <p className="text-sm text-slate-500">Nenhum slide disponível.</p>
      </aside>
    );
  }

  // Format date and time for header: "Qua, 11 Nov · 09:00"
  const formattedDateTime = useMemo(() => {
    try {
      const [year, month, day] = post.date.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const dayNum = String(day).padStart(2, '0');
      const monthStr = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayNum} ${monthStr} · ${post.time}`;
    } catch {
      return `${post.date} · ${post.time}`;
    }
  }, [post.date, post.time]);

  // Find linked product if any
  const linkedProduct = products.find((p) => post.product_ids?.includes(p.id));

  return (
    <aside className="w-[430px] shrink-0 border-l border-[#E6EFFB] bg-white flex flex-col h-screen sticky top-0 z-10 select-none shadow-xs">
      {/* 1. Header with DateTime and Status */}
      <div className="h-14 px-5 border-b border-[#E6EFFB] flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[14px] text-[#0B1D52]">
            {formattedDateTime}
          </span>
          {saveStatus === 'saving' && (
            <span className="text-[10px] text-slate-400 animate-pulse font-medium">Salvando...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Salvo localmente" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status Dropdown */}
          <select
            value={post.status}
            onChange={(e) => onUpdatePost({ status: e.target.value as PostStatus })}
            className={cn(
              'text-[12px] font-bold px-2.5 py-1 rounded-full border outline-none cursor-pointer',
              post.status === 'published' && 'bg-[#24A677]/10 text-[#24A677] border-[#24A677]/20',
              post.status === 'approved' && 'bg-[#0867E8]/10 text-[#0867E8] border-[#0867E8]/20',
              post.status === 'planned' && 'bg-[#0867E8]/10 text-[#0867E8] border-[#0867E8]/20',
              post.status === 'draft' && 'bg-[#E8A23F]/10 text-[#E8A23F] border-[#E8A23F]/20'
            )}
          >
            <option value="draft">Rascunho</option>
            <option value="approved">Aprovado</option>
            <option value="planned">Agendado</option>
            <option value="published">Publicado</option>
          </select>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar inspetor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Scrollable Body: Ultra Clean and Simple */}
      <div className="flex-1 overflow-y-auto cg-scroll p-4 space-y-4">
        {/* Post Type & Title */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#0B1D52]">
            <InstagramIcon className="w-4 h-4 text-[#E1306C]" />
            <span>Post – Carrossel ({post.slides.length} slides)</span>
          </div>

          <span className="text-[11px] font-bold text-[#64748B]">
            Slide {currentSlideIndex + 1} de {post.slides.length}
          </span>
        </div>

        {/* Canvas Preview Container (4:5) */}
        <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden border border-[#E6EFFB] shadow-md bg-[#F1F5F9] group">
          {currentScene ? (
            <PostCanvas
              scene={currentScene}
              assetMap={assetMap}
              showSafeMargin={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              Carregando preview...
            </div>
          )}

          {/* Quick previous/next navigation buttons over canvas */}
          {currentSlideIndex > 0 && (
            <button
              onClick={() => onSelectSlideIndex(currentSlideIndex - 1)}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#0B1D52] shadow-md flex items-center justify-center transition-all cursor-pointer"
              title="Slide anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {currentSlideIndex < post.slides.length - 1 && (
            <button
              onClick={() => onSelectSlideIndex(currentSlideIndex + 1)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#0B1D52] shadow-md flex items-center justify-center transition-all cursor-pointer"
              title="Próximo slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Slide Strip: Thumbnails */}
        <SlideStrip
          slides={post.slides}
          scenes={scenes}
          assetMap={assetMap}
          currentIndex={currentSlideIndex}
          onSelectIndex={onSelectSlideIndex}
          onAddSlide={onAddSlide}
          onDuplicateSlide={onDuplicateSlide}
          onDeleteSlide={onDeleteSlide}
        />

        {/* PROMINENT BUTTON: ABRIR NO CANVA */}
        <button
          onClick={onOpenCanva}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#0867E8] to-[#064BB8] hover:from-[#064BB8] hover:to-[#0867E8] text-white font-bold text-[13.5px] shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer group active:scale-99"
        >
          <Palette className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          <span>Abrir no Canva (Editar Imagem e Texto)</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
        </button>

        {/* Simple Caption Editor */}
        <div className="space-y-1.5 pt-1">
          <label className="block text-[12px] font-bold text-[#0B1D52]">
            Legenda do Post
          </label>
          <textarea
            rows={4}
            value={post.caption}
            onChange={(e) => onUpdatePost({ caption: e.target.value })}
            placeholder="Escreva a legenda que será publicada com este post..."
            className="w-full p-3 rounded-xl border border-[#E6EFFB] hover:border-[#0867E8] focus:border-[#0867E8] bg-[#F7FAFF] text-[12.5px] text-[#0B1D52] leading-relaxed outline-none transition-colors"
          />
          <div className="flex items-center justify-between text-[11px] text-[#64748B]">
            <span>{post.caption.length} / 2.200 caracteres</span>
            <span>Instagram Feed</span>
          </div>
        </div>

        {/* Linked Product Card (Optional) */}
        {linkedProduct && (
          <div className="p-2.5 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white border border-[#E6EFFB] flex items-center justify-center text-[#0867E8] shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h5 className="font-bold text-[12px] text-[#0B1D52] truncate">
                  {linkedProduct.name}
                </h5>
                <span className="text-[10.5px] text-[#64748B]">
                  SKU: {linkedProduct.id} · R$ {linkedProduct.price_cents ? (linkedProduct.price_cents / 100).toFixed(2) : '0,00'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onUpdatePost({ product_ids: [] })}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
              title="Desvincular produto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Footer Action Buttons */}
      <div className="p-4 border-t border-[#E6EFFB] bg-white flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={() => onDeletePost(post.id)}
          className="w-10 h-10 rounded-xl border border-[#E6EFFB] hover:border-red-300 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
          title="Excluir este post"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 justify-end">
          <button
            onClick={() => onUpdatePost({ status: 'draft' })}
            className="px-3.5 py-2.5 rounded-xl border border-[#E6EFFB] hover:border-[#0867E8] bg-white text-[12.5px] font-semibold text-[#0B1D52] hover:bg-[#F7FAFF] transition-all cursor-pointer"
          >
            Salvar rascunho
          </button>

          <button
            onClick={() => onUpdatePost({ status: 'approved' })}
            className="px-4 py-2.5 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] text-white text-[12.5px] font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-98"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Aprovar post</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
