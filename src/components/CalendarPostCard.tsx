import React, { useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { PostSceneIR, Asset } from '@/compiler/types';
import { renderSceneToCanvas } from '@/compiler/render-post';
import { CheckCircle2, Clock, Edit3, Sparkles } from 'lucide-react';
import { InstagramIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface CalendarPostCardProps {
  post: StudioPost;
  coverScene?: PostSceneIR;
  assetMap: Map<string, Asset>;
  isSelected: boolean;
  onSelect: () => void;
}

export const CalendarPostCard: React.FC<CalendarPostCardProps> = ({
  post,
  coverScene,
  assetMap,
  isSelected,
  onSelect,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !coverScene) return;
    renderSceneToCanvas(coverScene, canvasRef.current, assetMap, {
      showSafeMarginGuide: false,
    }).catch(() => {});
  }, [coverScene, assetMap]);

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  // Status icon and color
  const getStatusBadge = () => {
    switch (post.status) {
      case 'published':
        return (
          <span title="Publicado" className="text-[#24A677] flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 fill-[#24A677]/20 text-[#24A677]" />
          </span>
        );
      case 'approved':
      case 'planned':
      case 'ready_for_review':
        return (
          <span title="Agendado / Planejado" className="text-[#E8A23F] flex items-center">
            <Clock className="w-3.5 h-3.5 text-[#E8A23F]" />
          </span>
        );
      case 'generating':
        return (
          <span title="Gerando" className="text-[#0867E8] flex items-center animate-spin">
            <Sparkles className="w-3.5 h-3.5 text-[#0867E8]" />
          </span>
        );
      case 'draft':
      case 'idea':
      default:
        return (
          <span title="Rascunho" className="text-[#0867E8] flex items-center">
            <Edit3 className="w-3.5 h-3.5 text-[#0867E8]" />
          </span>
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={(e) => {
        // Prevent creating another card when right-clicking an existing post
        e.stopPropagation();
      }}
      className={cn(
        'group relative w-full max-w-full min-w-0 p-1.5 rounded-xl border bg-white flex items-center gap-1.5 cursor-pointer transition-all select-none shadow-xs hover:shadow-md overflow-hidden box-border',
        isSelected
          ? 'border-[#0867E8] ring-2 ring-[#0867E8]/20 bg-[#F7FAFF]'
          : 'border-[#E6EFFB] hover:border-[#BFDBFE] hover:bg-[#F7FAFF]',
        isDragging && 'opacity-60 shadow-xl scale-105 pointer-events-none'
      )}
    >
      {/* Thumbnail 4:5 strictly sized */}
      <div className="w-[30px] sm:w-[34px] aspect-[4/5] shrink-0 rounded-md overflow-hidden bg-[#F1F5F9] border border-[#E2E8F0]">
        {coverScene ? (
          <canvas
            ref={canvasRef}
            width={1080}
            height={1350}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] text-[#94A3B8]">
            4:5
          </div>
        )}
      </div>

      {/* Info strictly truncated to never overflow column */}
      <div className="flex-1 min-w-0 overflow-hidden pr-0.5">
        <h4 className="font-semibold text-[11px] leading-tight text-[#0B1D52] truncate block w-full" title={post.title}>
          {post.title}
        </h4>
        <div className="flex items-center justify-between gap-1 mt-1 min-w-0">
          <div className="flex items-center gap-1 text-[10.5px] text-[#E1306C] shrink-0">
            <InstagramIcon className="w-3 h-3 shrink-0" />
            {post.type === 'carousel' && (
              <span className="text-[9.5px] text-[#64748B] font-medium">
                {post.slides.length}s
              </span>
            )}
          </div>
          <div className="shrink-0">{getStatusBadge()}</div>
        </div>
      </div>
    </div>
  );
};
