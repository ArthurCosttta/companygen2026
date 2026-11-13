import React, { useState, useMemo } from 'react';
import {
  DndContext,
  useDroppable,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { StudioPost } from '@/compiler/build-post-ir';
import type { PostSceneIR, Asset } from '@/compiler/types';
import { CalendarPostCard } from './CalendarPostCard';
import { ContextMenu } from './ContextMenu';
import { CampaignBanner, type Promotion } from './CampaignBanner';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Clock,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { InstagramIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

interface CalendarGridProps {
  posts: StudioPost[];
  coverScenes: Map<string, PostSceneIR>;
  assetMap: Map<string, Asset>;
  selectedPostId: string | null;
  onSelectPost: (postId: string) => void;
  onMovePost: (postId: string, newDate: string, newTime: string) => void;
  onCreatePostAt: (date: string, time: string) => void;
  onDeletePost?: (postId: string) => void;
  startDateStr: string;
}

const HOURS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
  '20:00', '21:00', '22:00', '23:00',
];

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_FULL = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

const DEFAULT_PROMOTIONS: Promotion[] = [
  {
    id: 'promo_01',
    name: 'Semana das Polos Clássicas',
    startDate: '2026-11-09',
    endDate: '2026-11-12',
    discount: '20% OFF',
    color: 'blue',
  },
  {
    id: 'promo_02',
    name: 'Queima de Estoque Fim de Semana',
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    discount: 'Frete Grátis',
    color: 'amber',
  },
];

/** Droppable cell strictly contained within its column */
const DroppableCell: React.FC<{
  dateStr: string;
  timeStr: string;
  isToday: boolean;
  children?: React.ReactNode;
  onAddClick: () => void;
  onRightClick: (x: number, y: number) => void;
}> = ({ dateStr, timeStr, children, onAddClick, onRightClick }) => {
  const cellId = `${dateStr}_${timeStr}`;
  const { isOver, setNodeRef } = useDroppable({
    id: cellId,
    data: { date: dateStr, time: timeStr },
  });

  return (
    <div
      ref={setNodeRef}
      onContextMenu={(e) => {
        // Right-click opens context menu asking if user wants to make a new post!
        e.preventDefault();
        e.stopPropagation();
        onRightClick(e.clientX, e.clientY);
      }}
      className={cn(
        'relative min-h-[58px] p-1 border-b border-r border-[#E6EFFB] transition-colors flex flex-col gap-1 group min-w-0 max-w-full overflow-hidden box-border',
        isOver ? 'bg-[#EDF4FF]' : 'hover:bg-[#F7FAFF]/80 bg-white'
      )}
    >
      {children}

      {/* Explicit button on hover / right-click hint */}
      {!children && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddClick();
          }}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#0867E8]/5 cursor-pointer text-[#64748B] hover:text-[#0867E8]"
          title={`Botão direito para menu de criação ou clique aqui para Gerar Card em ${dateStr} às ${timeStr}`}
        >
          <span className="text-[10px] font-bold flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#CBD5E1] shadow-2xs hover:border-[#0867E8] hover:text-[#0867E8] transition-colors">
            + Gerar Card
          </span>
        </button>
      )}
    </div>
  );
};

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  posts,
  coverScenes,
  assetMap,
  selectedPostId,
  onSelectPost,
  onMovePost,
  onCreatePostAt,
  onDeletePost,
  startDateStr,
}) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [currentWeekOffset, setCurrentWeekOffset] = useState<number>(0);
  const [currentDayOffset, setCurrentDayOffset] = useState<number>(2); // Default to Wednesday Nov 11
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>(DEFAULT_PROMOTIONS);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    dateStr: string;
    timeStr: string;
  } | null>(null);

  const handleOpenContextMenu = (x: number, y: number, dateStr: string, timeStr: string) => {
    setContextMenu({
      isOpen: true,
      x,
      y,
      dateStr,
      timeStr,
    });
  };

  const handleAddPromotion = (newPromo: Omit<Promotion, 'id'>) => {
    const promo: Promotion = {
      ...newPromo,
      id: `promo_${Date.now()}`,
    };
    setPromotions((prev) => [...prev, promo]);
    showToast(`🏷️ Campanha "${promo.name}" adicionada com sucesso!`);
  };

  const handleRemovePromotion = (id: string) => {
    setPromotions((prev) => prev.filter((p) => p.id !== id));
    showToast('Promoção removida.');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Calculate days of the currently viewed week
  const weekDays = useMemo(() => {
    const base = new Date(startDateStr ? `${startDateStr}T12:00:00` : '2026-11-09T12:00:00');
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    base.setDate(base.getDate() + diffToMonday + currentWeekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthShort = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
      days.push({
        iso,
        dayName: WEEKDAY_NAMES[i],
        dayNum,
        monthShort,
        isToday: i === 2, // Highlight Wednesday in sample week matching visual reference
      });
    }
    return days;
  }, [startDateStr, currentWeekOffset]);

  // Selected Day for 'day' view
  const currentDayInfo = useMemo(() => {
    const base = new Date(startDateStr ? `${startDateStr}T12:00:00` : '2026-11-09T12:00:00');
    const day = base.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    base.setDate(base.getDate() + diffToMonday + currentDayOffset);
    const iso = base.toISOString().split('T')[0];
    const dayNum = String(base.getDate()).padStart(2, '0');
    const dayOfWeek = (base.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const dayName = WEEKDAY_FULL[dayOfWeek] || 'Quarta-feira';
    return {
      iso,
      title: `${dayName}, ${dayNum} de Nov de 2026`,
      dayNum,
    };
  }, [startDateStr, currentDayOffset]);

  // Days for 'month' view (November 2026 - 30 days)
  const monthDays = useMemo(() => {
    type MonthDayItem =
      | { isPad: true; key: string }
      | { isPad: false; key: string; iso: string; dayNum: string; isToday: boolean };

    const days: MonthDayItem[] = [];
    // Nov 2026 starts on Sunday (day 0) or offset relative to Monday
    // Nov 01, 2026 was Sunday. So Mon to Sat preceding days: 6 padding empty slots
    for (let pad = 0; pad < 6; pad++) {
      days.push({ isPad: true, key: `pad_${pad}` });
    }
    for (let dayNum = 1; dayNum <= 30; dayNum++) {
      const dayStr = String(dayNum).padStart(2, '0');
      const iso = `2026-11-${dayStr}`;
      days.push({
        isPad: false,
        key: iso,
        iso,
        dayNum: dayStr,
        isToday: dayNum === 11,
      });
    }
    return days;
  }, []);

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchCaption = p.caption.toLowerCase().includes(q);
        if (!matchTitle && !matchCaption) return false;
      }
      return true;
    });
  }, [posts, statusFilter, typeFilter, searchQuery]);

  // Index posts by "date_hour"
  const postsBySlot = useMemo(() => {
    const map = new Map<string, StudioPost[]>();
    for (const post of filteredPosts) {
      const hourPart = post.time.split(':')[0] + ':00';
      const key = `${post.date}_${hourPart}`;
      const list = map.get(key) || [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [filteredPosts]);

  // Index posts by "date"
  const postsByDate = useMemo(() => {
    const map = new Map<string, StudioPost[]>();
    for (const post of filteredPosts) {
      const list = map.get(post.date) || [];
      list.push(post);
      map.set(post.date, list);
    }
    return map;
  }, [filteredPosts]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const postId = active.id as string;
    const overData = over.data.current as { date: string; time: string } | undefined;
    if (overData) {
      onMovePost(postId, overData.date, overData.time);
    }
  };

  const handleGenerateCard = (date: string, time: string) => {
    onCreatePostAt(date, time);
    showToast(`✨ Card gerado com sucesso para ${date} às ${time}!`);
  };

  const currentRangeLabel = useMemo(() => {
    if (viewMode === 'month') {
      return 'Novembro, 2026';
    }
    if (viewMode === 'day') {
      return currentDayInfo.title;
    }
    if (viewMode === 'list') {
      return `Todos os Posts (${filteredPosts.length})`;
    }
    if (!weekDays.length) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    return `${first.dayNum} – ${last.dayNum} de Nov, 2026`;
  }, [viewMode, currentDayInfo, weekDays, filteredPosts.length]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7FAFF] overflow-hidden select-none relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B1D52] text-white text-[12.5px] font-semibold px-4 py-2 rounded-xl shadow-lg border border-white/20 animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#24A677]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Calendar Top Toolbar */}
      <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EFFB] bg-white shrink-0">
        {/* View Switcher: Mês / Semana / Dia / Lista */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
          {(['month', 'week', 'day', 'list'] as CalendarViewMode[]).map((mode) => {
            const labels: Record<CalendarViewMode, string> = {
              month: 'Mês',
              week: 'Semana',
              day: 'Dia',
              list: 'Lista',
            };
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer',
                  isActive
                    ? 'bg-[#0867E8] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#0B1D52] hover:bg-white/60'
                )}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (viewMode === 'day') {
                setCurrentDayOffset((prev) => prev - 1);
              } else {
                setCurrentWeekOffset((prev) => prev - 1);
              }
            }}
            className="w-8 h-8 rounded-lg border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] flex items-center justify-center text-[#64748B] hover:text-[#0B1D52] transition-colors cursor-pointer"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-bold text-[14px] text-[#0B1D52] px-2 min-w-[180px] text-center">
            {currentRangeLabel}
          </span>

          <button
            onClick={() => {
              if (viewMode === 'day') {
                setCurrentDayOffset((prev) => prev + 1);
              } else {
                setCurrentWeekOffset((prev) => prev + 1);
              }
            }}
            className="w-8 h-8 rounded-lg border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] flex items-center justify-center text-[#64748B] hover:text-[#0B1D52] transition-colors cursor-pointer"
            title="Próximo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setCurrentWeekOffset(0);
              setCurrentDayOffset(2);
            }}
            className="ml-2 px-3 py-1.5 rounded-lg border border-[#E6EFFB] bg-white hover:bg-[#EDF4FF] text-[13px] font-semibold text-[#0B1D52] transition-colors cursor-pointer"
          >
            Hoje
          </button>
        </div>

        {/* Filter dropdowns & Search */}
        <div className="flex items-center gap-2">
          {viewMode === 'list' && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Buscar post..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 rounded-lg border border-[#E6EFFB] bg-[#F7FAFF] text-[12px] text-[#0B1D52] focus:border-[#0867E8] outline-none w-36"
              />
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#F7FAFF] border border-[#E6EFFB] rounded-lg px-2 py-1 text-[12px] text-[#0B1D52] outline-none cursor-pointer"
            >
              <option value="all">Status: Todos</option>
              <option value="draft">Rascunhos</option>
              <option value="approved">Aprovados</option>
              <option value="planned">Agendados</option>
              <option value="published">Publicados</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#F7FAFF] border border-[#E6EFFB] rounded-lg px-2 py-1 text-[12px] text-[#0B1D52] outline-none cursor-pointer"
            >
              <option value="all">Tipo: Todos</option>
              <option value="carousel">Carrossel</option>
              <option value="single">Foto única</option>
            </select>
          </div>
        </div>
      </div>

      {/* Campaign & Promotions Timeline Ribbon */}
      <CampaignBanner
        promotions={promotions}
        weekDates={weekDays.map((d) => d.iso)}
        onAddPromotion={handleAddPromotion}
        onRemovePromotion={handleRemovePromotion}
      />

      {/* ========================================================= */}
      {/* 1. MODO SEMANA (WEEK VIEW) - Grade de 7 Colunas Contidas */}
      {/* ========================================================= */}
      {viewMode === 'week' && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-y-auto cg-scroll">
            <div className="w-full min-w-[720px] border-b border-[#E6EFFB] bg-white">
              {/* Header Columns with minmax(0, 1fr) so columns NEVER expand */}
              <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-[#E6EFFB] sticky top-0 bg-white z-20 shadow-xs">
                <div className="p-3 text-[12px] font-bold text-[#64748B] flex items-center justify-center border-r border-[#E6EFFB]">
                  Horário
                </div>
                {weekDays.map((d) => (
                  <div
                    key={d.iso}
                    className={cn(
                      'p-2 text-center border-r border-[#E6EFFB] transition-colors min-w-0 overflow-hidden',
                      d.isToday ? 'bg-[#EDF4FF]/70' : 'bg-white'
                    )}
                  >
                    <div
                      className={cn(
                        'text-[12px] font-bold tracking-tight truncate',
                        d.isToday ? 'text-[#0867E8]' : 'text-[#64748B]'
                      )}
                    >
                      {d.dayName}
                    </div>
                    <div
                      className={cn(
                        'text-[11px] font-medium mt-0.5 truncate',
                        d.isToday ? 'text-[#0867E8] font-bold' : 'text-[#94A3B8]'
                      )}
                    >
                      {d.dayNum} {d.monthShort}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hourly Grid Rows with minmax(0, 1fr) */}
              <div className="divide-y divide-[#E6EFFB]">
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] min-w-0">
                    {/* Time label */}
                    <div className="p-2 text-[12px] font-semibold text-[#64748B] flex items-start justify-center border-r border-[#E6EFFB] bg-[#FDFEFE]">
                      {hour}
                    </div>

                    {/* 7 Days Cells strictly bounded */}
                    {weekDays.map((d) => {
                      const slotPosts = postsBySlot.get(`${d.iso}_${hour}`) || [];
                      return (
                        <DroppableCell
                          key={`${d.iso}_${hour}`}
                          dateStr={d.iso}
                          timeStr={hour}
                          isToday={d.isToday}
                          onAddClick={() => handleGenerateCard(d.iso, hour)}
                          onRightClick={(x, y) => handleOpenContextMenu(x, y, d.iso, hour)}
                        >
                          {slotPosts.map((p) => (
                            <CalendarPostCard
                              key={p.id}
                              post={p}
                              coverScene={coverScenes.get(p.id)}
                              assetMap={assetMap}
                              isSelected={selectedPostId === p.id}
                              onSelect={() => onSelectPost(p.id)}
                            />
                          ))}
                        </DroppableCell>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {/* ========================================================= */}
      {/* 2. MODO MÊS (MONTH VIEW) - Grade Mensal de 30 Dias        */}
      {/* ========================================================= */}
      {viewMode === 'month' && (
        <div className="flex-1 overflow-y-auto cg-scroll p-4">
          <div className="bg-white rounded-2xl border border-[#E6EFFB] overflow-hidden shadow-xs">
            {/* Header: Dias da Semana */}
            <div className="grid grid-cols-7 border-b border-[#E6EFFB] bg-[#F8FAFC]">
              {WEEKDAY_NAMES.map((name) => (
                <div key={name} className="py-2.5 text-center text-[12px] font-bold text-[#64748B]">
                  {name}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-[#E6EFFB]">
              {monthDays.map((d) => {
                if (d.isPad) {
                  return <div key={d.key} className="min-h-[110px] bg-[#F8FAFC]/50 p-2" />;
                }
                const dayPosts = postsByDate.get(d.iso) || [];
                return (
                  <div
                    key={d.key}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleOpenContextMenu(e.clientX, e.clientY, d.iso, '09:00');
                    }}
                    className={cn(
                      'min-h-[110px] p-2 transition-all flex flex-col justify-between group min-w-0 overflow-hidden',
                      d.isToday ? 'bg-[#EDF4FF]/30 ring-1 ring-inset ring-[#0867E8]/40' : 'bg-white hover:bg-[#F8FAFC]'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={cn(
                            'text-[12px] font-bold w-6 h-6 rounded-full flex items-center justify-center',
                            d.isToday ? 'bg-[#0867E8] text-white' : 'text-[#0B1D52]'
                          )}
                        >
                          {d.dayNum}
                        </span>
                        {dayPosts.length > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EDF4FF] text-[#0867E8]">
                            {dayPosts.length} post{dayPosts.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Post Chips */}
                      <div className="space-y-1">
                        {dayPosts.slice(0, 2).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => onSelectPost(p.id)}
                            className={cn(
                              'w-full text-left p-1 rounded-md text-[11px] font-medium truncate flex items-center gap-1 transition-all',
                              selectedPostId === p.id
                                ? 'bg-[#0867E8] text-white'
                                : 'bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0B1D52]'
                            )}
                            title={`${p.time} - ${p.title}`}
                          >
                            <span className="text-[9.5px] opacity-75 shrink-0">{p.time}</span>
                            <span className="truncate">{p.title}</span>
                          </button>
                        ))}
                        {dayPosts.length > 2 && (
                          <div className="text-[10px] text-[#64748B] font-semibold pl-1">
                            +{dayPosts.length - 2} mais...
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Add Button */}
                    <button
                      onClick={() => handleGenerateCard(d.iso, '09:00')}
                      className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 w-full py-1 rounded-lg border border-dashed border-[#CBD5E1] hover:border-[#0867E8] hover:bg-[#EDF4FF] text-[10.5px] font-semibold text-[#0867E8] flex items-center justify-center gap-1 cursor-pointer"
                      title="Botão direito do mouse ou clique aqui para Gerar Card"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Gerar Card</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. MODO DIA (DAY VIEW) - Timeline Detalhada por Hora      */}
      {/* ========================================================= */}
      {viewMode === 'day' && (
        <div className="flex-1 overflow-y-auto cg-scroll p-4">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-[#E6EFFB] overflow-hidden shadow-xs divide-y divide-[#E6EFFB]">
            <div className="p-4 bg-[#F8FAFC] flex items-center justify-between border-b border-[#E6EFFB]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#0867E8]" />
                <h3 className="font-bold text-[16px] text-[#0B1D52]">{currentDayInfo.title}</h3>
              </div>
              <button
                onClick={() => handleGenerateCard(currentDayInfo.iso, '09:00')}
                className="px-3 py-1.5 rounded-xl bg-[#0867E8] text-white text-[12.5px] font-semibold flex items-center gap-1.5 shadow-xs hover:bg-[#064BB8] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Gerar Card para este Dia</span>
              </button>
            </div>

            {HOURS.map((hour) => {
              const slotPosts = postsBySlot.get(`${currentDayInfo.iso}_${hour}`) || [];
              return (
                <div
                  key={hour}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenContextMenu(e.clientX, e.clientY, currentDayInfo.iso, hour);
                  }}
                  className="flex items-start p-3 gap-4 hover:bg-[#F8FAFC] transition-colors group"
                >
                  <div className="w-16 shrink-0 text-center">
                    <span className="text-[13px] font-bold text-[#64748B]">{hour}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {slotPosts.length > 0 ? (
                      <div className="space-y-2">
                        {slotPosts.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => onSelectPost(p.id)}
                            className={cn(
                              'p-3 rounded-xl border flex items-center justify-between gap-4 cursor-pointer transition-all shadow-xs',
                              selectedPostId === p.id
                                ? 'border-[#0867E8] ring-2 ring-[#0867E8]/20 bg-[#F7FAFF]'
                                : 'border-[#E6EFFB] bg-white hover:border-[#BFDBFE]'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-12 rounded-lg bg-slate-100 border overflow-hidden shrink-0">
                                {coverScenes.get(p.id) ? (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#0867E8] bg-[#EDF4FF]">
                                    4:5
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                                    IMG
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-[14px] text-[#0B1D52] truncate">
                                  {p.title}
                                </h4>
                                <p className="text-[12px] text-[#64748B] truncate max-w-xl">
                                  {p.caption}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[12px] font-semibold text-[#0867E8] bg-[#EDF4FF] px-2.5 py-1 rounded-lg">
                                {p.slides.length} slides
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectPost(p.id);
                                }}
                                className="px-3 py-1.5 rounded-lg border border-[#E6EFFB] hover:border-[#0867E8] text-[12px] font-semibold text-[#0B1D52] hover:text-[#0867E8] bg-white"
                              >
                                Editar no Inspector
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-10 flex items-center justify-between">
                        <span className="text-[12px] text-slate-400 font-medium italic">
                          Horário livre
                        </span>
                        <button
                          onClick={() => handleGenerateCard(currentDayInfo.iso, hour)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded-lg border border-[#E2E8F0] hover:border-[#0867E8] bg-white text-[11px] font-bold text-[#0867E8] flex items-center gap-1 cursor-pointer"
                          title="Botão direito do mouse ou clique aqui para Gerar Card"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Gerar Card ({hour})</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. MODO LISTA (LIST VIEW) - Agenda e Feed Completo        */}
      {/* ========================================================= */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto cg-scroll p-4">
          <div className="bg-white rounded-2xl border border-[#E6EFFB] overflow-hidden shadow-xs">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E6EFFB] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[15px] text-[#0B1D52]">Todos os Posts da Campanha</h3>
                <p className="text-[12px] text-[#64748B]">
                  {filteredPosts.length} post{filteredPosts.length > 1 ? 's' : ''} ordenados cronologicamente
                </p>
              </div>

              <button
                onClick={() => handleGenerateCard('2026-11-16', '10:00')}
                className="px-3.5 py-2 rounded-xl bg-[#0867E8] text-white text-[12.5px] font-bold flex items-center gap-1.5 shadow-xs hover:bg-[#064BB8] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Gerar Card</span>
              </button>
            </div>

            <div className="divide-y divide-[#E6EFFB]">
              {filteredPosts.map((p) => {
                const isSel = selectedPostId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPost(p.id)}
                    className={cn(
                      'p-4 flex items-center justify-between gap-4 transition-colors cursor-pointer',
                      isSel ? 'bg-[#EDF4FF]/50' : 'hover:bg-[#F8FAFC]'
                    )}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Date Pill */}
                      <div className="w-24 text-center shrink-0">
                        <div className="text-[13px] font-bold text-[#0B1D52]">
                          {p.date.split('-').slice(1).reverse().join('/')}
                        </div>
                        <div className="text-[11px] font-semibold text-[#64748B] flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{p.time}</span>
                        </div>
                      </div>

                      {/* Format Badge */}
                      <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] border flex items-center justify-center text-[#E1306C] shrink-0">
                        <InstagramIcon className="w-4 h-4" />
                      </div>

                      {/* Title & Caption */}
                      <div className="min-w-0 max-w-lg">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[13.5px] text-[#0B1D52] truncate">
                            {p.title}
                          </h4>
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#EDF4FF] text-[#0867E8]">
                            {p.slides.length} slides
                          </span>
                        </div>
                        <p className="text-[12px] text-[#64748B] truncate mt-0.5">
                          {p.caption}
                        </p>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={cn(
                          'text-[11px] font-bold px-2.5 py-1 rounded-full capitalize',
                          p.status === 'published' && 'bg-[#24A677]/10 text-[#24A677]',
                          p.status === 'approved' && 'bg-[#0867E8]/10 text-[#0867E8]',
                          p.status === 'planned' && 'bg-[#0867E8]/10 text-[#0867E8]',
                          p.status === 'draft' && 'bg-[#E8A23F]/10 text-[#E8A23F]'
                        )}
                      >
                        {p.status === 'published' ? 'Publicado' : p.status === 'draft' ? 'Rascunho' : 'Agendado'}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPost(p.id);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[#E6EFFB] hover:border-[#0867E8] text-[12px] font-semibold text-[#0B1D52] hover:text-[#0867E8] bg-white flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      {onDeletePost && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePost(p.id);
                          }}
                          className="p-1.5 rounded-lg border border-transparent hover:border-red-200 text-[#94A3B8] hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Excluir post"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Bottom Legend matching reference */}
      <div className="px-6 py-2.5 bg-white border-t border-[#E6EFFB] flex items-center justify-between text-[12px] text-[#64748B] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#24A677]" />
            <span>Publicado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0867E8]" />
            <span>Agendado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E8A23F]" />
            <span>Rascunho</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#CBD5E1]" />
            <span>Vazio</span>
          </div>
        </div>
        <div className="font-semibold text-[#0B1D52]">
          {filteredPosts.length} posts programados
        </div>
      </div>

      {/* Floating Context Menu on Right Click */}
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          x={contextMenu.x}
          y={contextMenu.y}
          dateStr={contextMenu.dateStr}
          timeStr={contextMenu.timeStr}
          onClose={() => setContextMenu(null)}
          onCreatePost={(date, time) => handleGenerateCard(date, time)}
          onGenerateAIPost={(date, time) => {
            handleGenerateCard(date, time);
            showToast('✨ Post gerado com inteligência artificial!');
          }}
          onAddPromotion={() => {
            showToast('Clique no botão "+ Promoção" acima para configurar a campanha.');
          }}
        />
      )}
    </div>
  );
};
