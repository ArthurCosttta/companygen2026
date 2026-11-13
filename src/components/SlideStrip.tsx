import React, { useEffect, useRef } from 'react';
import type { PostSceneIR, Asset } from '@/compiler/types';
import type { StudioSlide } from '@/compiler/build-post-ir';
import { renderSceneToCanvas } from '@/compiler/render-post';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlideThumbnailProps {
  scene?: PostSceneIR;
  assetMap: Map<string, Asset>;
  slide: StudioSlide;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}

const SlideThumbnail: React.FC<SlideThumbnailProps> = ({
  scene,
  assetMap,
  slide,
  index,
  isActive,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !scene) return;
    renderSceneToCanvas(scene, canvasRef.current, assetMap, {
      showSafeMarginGuide: false,
    }).catch(() => {});
  }, [scene, assetMap]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative shrink-0 w-[54px] aspect-[4/5] rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-white group',
        isActive
          ? 'border-[#0867E8] ring-2 ring-[#0867E8]/20 shadow-sm'
          : 'border-[#E6EFFB] hover:border-[#94A3B8]'
      )}
      title={`Slide ${index + 1}: ${slide.headline}`}
    >
      <canvas
        ref={canvasRef}
        width={1080}
        height={1350}
        className="w-full h-full object-cover"
      />
      <div
        className={cn(
          'absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[9px] font-bold',
          isActive ? 'bg-[#0867E8] text-white' : 'bg-black/60 text-white'
        )}
      >
        {index + 1}
      </div>
    </button>
  );
};

interface SlideStripProps {
  slides: StudioSlide[];
  scenes: PostSceneIR[];
  assetMap: Map<string, Asset>;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (index: number) => void;
  onDeleteSlide: (index: number) => void;
}

export const SlideStrip: React.FC<SlideStripProps> = ({
  slides,
  scenes,
  assetMap,
  currentIndex,
  onSelectIndex,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
}) => {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between text-[12px] font-medium text-[#64748B]">
        <span>Slides ({slides.length})</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateSlide(currentIndex)}
            className="p-1 rounded hover:bg-[#EDF4FF] hover:text-[#0867E8] text-[#64748B] transition-colors"
            title="Duplicar slide atual"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {slides.length > 1 && (
            <button
              onClick={() => onDeleteSlide(currentIndex)}
              className="p-1 rounded hover:bg-[#FEF2F2] hover:text-[#D94C4C] text-[#64748B] transition-colors"
              title="Excluir slide atual"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {slides.length < 10 && (
            <button
              onClick={onAddSlide}
              className="p-1 rounded hover:bg-[#EDF4FF] hover:text-[#0867E8] text-[#64748B] transition-colors"
              title="Adicionar slide"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 cg-scroll">
        {slides.map((s, idx) => (
          <SlideThumbnail
            key={s.id}
            slide={s}
            scene={scenes[idx]}
            assetMap={assetMap}
            index={idx}
            isActive={currentIndex === idx}
            onSelect={() => onSelectIndex(idx)}
          />
        ))}

        {slides.length < 10 && (
          <button
            onClick={onAddSlide}
            className="shrink-0 w-[54px] aspect-[4/5] rounded-lg border-2 border-dashed border-[#E6EFFB] hover:border-[#0867E8] text-[#64748B] hover:text-[#0867E8] flex flex-col items-center justify-center gap-0.5 transition-colors bg-[#F7FAFF]"
            title="Adicionar slide"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[9px] font-semibold">Novo</span>
          </button>
        )}
      </div>
    </div>
  );
};
