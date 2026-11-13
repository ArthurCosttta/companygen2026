import React, { useEffect, useRef } from 'react';
import { Plus, Sparkles, Tag, X, Calendar } from 'lucide-react';

export interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  dateStr: string;
  timeStr: string;
  onClose: () => void;
  onCreatePost: (date: string, time: string) => void;
  onGenerateAIPost: (date: string, time: string) => void;
  onAddPromotion?: (date: string) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  x,
  y,
  dateStr,
  timeStr,
  onClose,
  onCreatePost,
  onGenerateAIPost,
  onAddPromotion,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format date readable: "Qua, 11 Nov"
  const formattedDate = (() => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const dayNum = String(day).padStart(2, '0');
      const monthStr = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dayNum} ${monthStr}`;
    } catch {
      return dateStr;
    }
  })();

  // Boundary adjustment to prevent overflowing viewport
  const menuWidth = 240;
  const menuHeight = 220;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 16);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 16);

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-50 w-60 bg-white rounded-2xl border border-[#E6EFFB] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-[#F8FAFC] border-b border-[#E6EFFB] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0B1D52]">
          <Calendar className="w-3.5 h-3.5 text-[#0867E8]" />
          <span>{formattedDate} · {timeStr}</span>
        </div>
        <button
          onClick={onClose}
          className="text-[#94A3B8] hover:text-[#0B1D52] p-0.5 rounded-md hover:bg-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Question prompt */}
      <div className="px-3.5 py-2 bg-[#EDF4FF]/40 border-b border-[#E6EFFB]">
        <p className="text-[11.5px] font-semibold text-[#0B1D52]">
          O que deseja criar neste horário?
        </p>
      </div>

      {/* Menu Actions */}
      <div className="p-1.5 space-y-1">
        <button
          onClick={() => {
            onCreatePost(dateStr, timeStr);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#0B1D52] hover:bg-[#EDF4FF] hover:text-[#0867E8] transition-colors text-left cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-[#EDF4FF] text-[#0867E8] flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <div className="leading-tight">Novo Post em Branco</div>
            <div className="text-[10px] text-[#64748B] font-normal">Criar e editar no Canvas</div>
          </div>
        </button>

        <button
          onClick={() => {
            onGenerateAIPost(dateStr, timeStr);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#0B1D52] hover:bg-[#EDF4FF] hover:text-[#0867E8] transition-colors text-left cursor-pointer"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0867E8] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="leading-tight text-[#0867E8]">Criar publicação</div>
            <div className="text-[10px] text-[#64748B] font-normal">Copy + 5 slides prontos</div>
          </div>
        </button>

        {onAddPromotion && (
          <button
            onClick={() => {
              onAddPromotion(dateStr);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12.5px] font-semibold text-[#0B1D52] hover:bg-[#F8FAFC] transition-colors text-left cursor-pointer border-t border-[#F1F5F9] pt-2"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <div className="leading-tight">Adicionar Promoção</div>
              <div className="text-[10px] text-[#64748B] font-normal">Campanha no período</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};
