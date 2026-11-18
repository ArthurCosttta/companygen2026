import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  FilePlus2,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { ActionButton, useToast } from '../../ui';
import type { BusinessProfile, CatalogProduct } from '../../../schemas/profile.schema';
import type { FormulaV9Document, SectionNode } from '../../../schemas/formula-v9.schema';
import {
  loadBusinessProfile,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '../../../services/profile-service';
import { authenticatedFetch } from '../../../services/supabase-client';
import { readImageFileAsDataUrl } from '../storefront/storefront-utils';

const FRIENDLY_SECTION_LABELS: Record<string, string> = {
  HeaderNav: 'Cabeçalho',
  HeroSection: 'Capa Principal',
  DifferentialsStrip: 'Diferenciais',
  InteractiveExperience: 'Experiência Interativa',
  EditorialMediaSplit: 'Texto & Foto',
  CatalogGrid: 'Catálogo de Produtos',
  HighlightsGrid: 'Destaques',
  ClosingScheduleSplit: 'Horários & Contato',
  RichFooter: 'Rodapé',
};

function friendlySectionName(type: string): string {
  return FRIENDLY_SECTION_LABELS[type] || type;
}
import { buildFaithfulStorefrontZip } from '../storefront/storefront-zip-builder';
import { BatchImageSearchModal } from '../storefront/BatchImageSearchModal';
import { FormulaTreeRenderer } from '../storefront/FormulaTreeRenderer';
import { CreditCostPreview } from './CreditCostPreview';
import { deriveThemeTokensFromHex } from '../../../../shared/formula-ir/composer-schema.mjs';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';

export interface ArchetypeComposerViewProps {
  profile: BusinessProfile;
  ownerId?: string;
  creditBalance?: number;
  onCreditBalanceChange?: (nextBalance: number) => void;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
  onBackToDashboard?: () => void;
  onOpenPreviewScreen?: () => void;
}

interface LibraryComponentItem {
  taxonomy: string;
  formulaBlockType: SectionNode['type'];
  widgetRef: string;
  title: string;
  description: string;
  category: 'Estrutura & Hero' | 'Conversão & Interativo' | 'Catálogo & Marca';
  defaultCopy?: { title?: string; subtitle?: string; badgeLabel?: string };
}

const DRAG_DROP_COMPONENT_LIBRARY: LibraryComponentItem[] = [
  {
    taxonomy: 'SEC_HERO_V9',
    formulaBlockType: 'HeroSection',
    widgetRef: 'HeroSection',
    title: 'Capa Editorial',
    description: 'Cabeçalho principal com chamada, botões de ação e foto em alta definição.',
    category: 'Estrutura & Hero',
    defaultCopy: { title: 'Bem-vindo à loja' },
  },
  {
    taxonomy: 'SEC_INTERACTIVE_V9',
    formulaBlockType: 'InteractiveExperience',
    widgetRef: 'InteractiveExperience',
    title: 'Experiência Interativa',
    description: 'Simulador ou configurador com cálculo em tempo real conectado ao catálogo.',
    category: 'Conversão & Interativo',
  },
  {
    taxonomy: 'SEC_HIGHLIGHTS_V9',
    formulaBlockType: 'HighlightsGrid',
    widgetRef: 'HighlightsGrid',
    title: 'Grade de Destaques',
    description: 'Cartões com os principais diferenciais, linhas ou coleções do negócio.',
    category: 'Estrutura & Hero',
  },
  {
    taxonomy: 'SEC_CATALOG_V9',
    formulaBlockType: 'CatalogGrid',
    widgetRef: 'CatalogGrid',
    title: 'Catálogo de Itens',
    description: 'Lista filtrável com preços oficiais e adição direta na sacola.',
    category: 'Catálogo & Marca',
  },
  {
    taxonomy: 'SEC_FAQ_V9',
    formulaBlockType: 'FaqAccordion',
    widgetRef: 'FaqAccordion',
    title: 'Perguntas Frequentes',
    description: 'Respostas objetivas para prazos, entrega, garantias e atendimento.',
    category: 'Catálogo & Marca',
  },
  {
    taxonomy: 'SEC_CLOSING_V9',
    formulaBlockType: 'ClosingScheduleSplit',
    widgetRef: 'ClosingScheduleSplit',
    title: 'Fechamento & WhatsApp',
    description: 'Bloco final com horário de atendimento e atalho direto para o WhatsApp.',
    category: 'Conversão & Interativo',
  },
];

const V9_DNA_PALETTES: Record<
  string,
  {
    label: string;
    mood: string;
    accent: string;
    accentDeep: string;
    surface: string;
    surfaceAlt: string;
    card: string;
    ink: string;
    inkMuted: string;
    footerBg: string;
    radiusPx: number;
    fontStyle: 'modern_sans' | 'editorial_serif' | 'clean_geometric';
  }
> = {
  AzulConfiança: { label: 'Azul Confiança', mood: 'Tecnologia & serviços', accent: '#0B4DB8', accentDeep: '#07377F', surface: '#F7FAFF', surfaceAlt: '#EAF2FF', card: '#FFFFFF', ink: '#10233F', inkMuted: '#52657D', footerBg: '#081A33', radiusPx: 18, fontStyle: 'modern_sans' },
  VerdeBotânico: { label: 'Verde Botânico', mood: 'Natural & acolhedor', accent: '#2F6F4E', accentDeep: '#204D37', surface: '#F8FAF4', surfaceAlt: '#E9F1E5', card: '#FFFFFF', ink: '#20352A', inkMuted: '#607066', footerBg: '#193126', radiusPx: 20, fontStyle: 'editorial_serif' },
  TerracotaArte: { label: 'Terracota Editorial', mood: 'Autoral & artesanal', accent: '#B4532A', accentDeep: '#803A20', surface: '#FFF9F4', surfaceAlt: '#F6E7DA', card: '#FFFCF9', ink: '#3D2A22', inkMuted: '#7C665C', footerBg: '#34231C', radiusPx: 14, fontStyle: 'editorial_serif' },
  GrafiteExecutivo: { label: 'Grafite Executivo', mood: 'Sólido & premium', accent: '#334155', accentDeep: '#0F172A', surface: '#F8FAFC', surfaceAlt: '#E2E8F0', card: '#FFFFFF', ink: '#0F172A', inkMuted: '#64748B', footerBg: '#0B1120', radiusPx: 12, fontStyle: 'clean_geometric' },
  VioletaStudio: { label: 'Violeta Studio', mood: 'Criativo & digital', accent: '#6D28D9', accentDeep: '#4C1D95', surface: '#FCFAFF', surfaceAlt: '#F1EAFE', card: '#FFFFFF', ink: '#291447', inkMuted: '#746484', footerBg: '#21113A', radiusPx: 22, fontStyle: 'modern_sans' },
  OuroMostarda: { label: 'Ouro Mostarda', mood: 'Solar & gastronômico', accent: '#CA8A04', accentDeep: '#8A5C02', surface: '#FFFCF3', surfaceAlt: '#FFF1C2', card: '#FFFFFF', ink: '#3A2A0E', inkMuted: '#7C6B47', footerBg: '#352408', radiusPx: 16, fontStyle: 'clean_geometric' },
  MarfimLuxo: { label: 'Marfim Luxo', mood: 'Leve & sofisticado', accent: '#8A6A3B', accentDeep: '#5D4728', surface: '#FBF8F0', surfaceAlt: '#EFE7D6', card: '#FFFEFA', ink: '#29251E', inkMuted: '#716B60', footerBg: '#24211B', radiusPx: 10, fontStyle: 'editorial_serif' },
  RosaAtelier: { label: 'Rosa Atelier', mood: 'Delicado & contemporâneo', accent: '#C24173', accentDeep: '#8F2850', surface: '#FFF8FB', surfaceAlt: '#FBE7EF', card: '#FFFFFF', ink: '#421D2D', inkMuted: '#836575', footerBg: '#351522', radiusPx: 22, fontStyle: 'editorial_serif' },
  OceanoTurquesa: { label: 'Oceano Turquesa', mood: 'Fresco & confiável', accent: '#0F8B8D', accentDeep: '#086164', surface: '#F4FBFB', surfaceAlt: '#DDF3F2', card: '#FFFFFF', ink: '#123739', inkMuted: '#577476', footerBg: '#0B3032', radiusPx: 18, fontStyle: 'modern_sans' },
  CafeArtesanal: { label: 'Café Artesanal', mood: 'Quente & sensorial', accent: '#8B5E3C', accentDeep: '#5F3D27', surface: '#FCF8F3', surfaceAlt: '#EFE1D3', card: '#FFFFFF', ink: '#35271E', inkMuted: '#75675E', footerBg: '#2B2019', radiusPx: 16, fontStyle: 'editorial_serif' },
  LimaVibrante: { label: 'Lima Vibrante', mood: 'Jovem & energético', accent: '#65A30D', accentDeep: '#3F6F07', surface: '#FAFDF3', surfaceAlt: '#EAF7CC', card: '#FFFFFF', ink: '#22310E', inkMuted: '#65734E', footerBg: '#1D2B0C', radiusPx: 20, fontStyle: 'clean_geometric' },
  NoitePremium: { label: 'Noite Premium', mood: 'Luxo & alto contraste', accent: '#D4A853', accentDeep: '#A77B2C', surface: '#121418', surfaceAlt: '#1D2128', card: '#252A32', ink: '#F7F2E8', inkMuted: '#B8B2A8', footerBg: '#08090B', radiusPx: 12, fontStyle: 'modern_sans' },
};

function DraggableLibraryCard({
  item,
  alreadyActive,
  onQuickAdd,
}: {
  item: LibraryComponentItem;
  alreadyActive: boolean;
  onQuickAdd: (item: LibraryComponentItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib:${item.taxonomy}`,
    data: {
      source: 'library',
      taxonomy: item.taxonomy,
      formulaBlockType: item.formulaBlockType,
      defaultCopy: item.defaultCopy,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`library-widget-${item.taxonomy}`}
      className={`group rounded-xl border p-2.5 transition ${
        isDragging
          ? 'border-[#2563EB] bg-blue-50 shadow-lg'
          : alreadyActive
            ? 'border-emerald-200 bg-emerald-50/40'
            : 'border-slate-200 bg-white hover:border-[#2563EB]/60 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...listeners}
          {...attributes}
          className="flex min-w-0 flex-1 cursor-grab items-start gap-2 active:cursor-grabbing"
          title="Arraste para o preview da loja"
        >
          <GripVertical className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {item.widgetRef}
              </span>
              <span className="truncate text-xs font-bold text-[#0F172A]">{item.title}</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{item.description}</p>
          </div>
        </div>
        <button
          type="button"
          data-testid={`add-library-${item.taxonomy}`}
          onClick={() => onQuickAdd(item)}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
            alreadyActive
              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
              : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
          }`}
        >
          {alreadyActive ? <Check className="size-3" /> : <Plus className="size-3" />}
          <span>{alreadyActive ? 'Na página' : 'Inserir'}</span>
        </button>
      </div>
    </div>
  );
}

function DroppableCanvasFrame({
  children,
  previewDevice,
}: {
  children: React.ReactNode;
  previewDevice: 'desktop' | 'tablet' | 'mobile';
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'editor-canvas-dropzone',
  });

  const widthClass =
    previewDevice === 'mobile'
      ? 'max-w-[390px]'
      : previewDevice === 'tablet'
        ? 'max-w-[768px]'
        : 'max-w-full';

  return (
    <div
      ref={setNodeRef}
      data-testid="editor-canvas-dropzone"
      data-viewport={previewDevice}
      className={`@container/formula-frame relative mx-auto w-full min-w-0 transition-all duration-150 ${widthClass} ${
        isOver
          ? 'rounded-2xl ring-4 ring-[#2563EB]/45 ring-offset-2'
          : 'rounded-2xl border border-slate-200 shadow-sm'
      } overflow-hidden bg-white`}
    >
      {isOver ? (
        <div className="sticky top-0 z-40 bg-[#2563EB] px-4 py-2 text-center text-xs font-bold text-white">
          Solte aqui para adicionar o componente à sua vitrine
        </div>
      ) : null}
      {children}
    </div>
  );
}

export const ArchetypeComposerView: React.FC<ArchetypeComposerViewProps> = ({
  profile,
  ownerId = 'default',
  creditBalance: propCreditBalance,
  onCreditBalanceChange,
  onProfileUpdated,
  onBackToDashboard,
  onOpenPreviewScreen,
}) => {
  const { showToast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [localBalance, setLocalBalance] = useState<number>(propCreditBalance ?? 0);
  const effectiveBalance = typeof propCreditBalance === 'number' ? propCreditBalance : localBalance;

  const updateBalance = (next: number) => {
    setLocalBalance(next);
    onCreditBalanceChange?.(next);
  };

  const initialFormulaIr = useMemo<FormulaV9Document>(() => {
    return ensureFormulaV9(profile) as FormulaV9Document;
  }, [profile]);

  const [formulasIr, setFormulasIr] = useState<FormulaV9Document>(initialFormulaIr);
  const [activePageFilename, setActivePageFilename] = useState<string>('index.html');
  const [selectedBlockId, setSelectedBlockId] = useState<string>(() => {
    return initialFormulaIr.sections[1]?.id || initialFormulaIr.sections[0]?.id || 'sec_hero';
  });
  const [searchTargetProducts, setSearchTargetProducts] = useState<CatalogProduct[] | null>(null);

  // Undo (5s) state & auto-save debounce timers
  const [undoSnapshot, setUndoSnapshot] = useState<FormulaV9Document | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number>(0);
  const undoTimerRef = useRef<number | null>(null);
  const saveIrDebounceTimerRef = useRef<number | null>(null);
  const pendingSaveIrRef = useRef<{ ir: FormulaV9Document; pageFilename: string } | null>(null);
  const zipRevokeTimerRef = useRef<number | null>(null);

  // Modals / Popovers for Cláusula 4
  const [newPageModalOpen, setNewPageModalOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPagePrompt, setNewPagePrompt] = useState('');
  const [creatingPage, setCreatingPage] = useState(false);

  const [addBlockType, setAddBlockType] = useState<SectionNode['type']>('HighlightsGrid');
  const [addingBlock, setAddingBlock] = useState(false);

  const [aiCommandText, setAiCommandText] = useState('');
  const [runningAiCommand, setRunningAiCommand] = useState(false);

  const [mediaPopoverBlockId, setMediaPopoverBlockId] = useState<string | null>(null);
  const [mediaPromptInput, setMediaPromptInput] = useState('');
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [http402Error, setHttp402Error] = useState<{ required: number; balance: number } | null>(null);
  const [exportingZip, setExportingZip] = useState(false);

  const [dnaId, setDnaId] = useState<string>(() => {
    const curAccent = String(profile.brand?.primaryColor || '').toUpperCase();
    const matched = Object.entries(V9_DNA_PALETTES).find(
      ([, pal]) => pal.accent.toUpperCase() === curAccent,
    );
    return matched ? matched[0] : 'AzulConfiança';
  });

  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [searchQuery] = useState('');
  const [selectedCategory] = useState('Todas');
  const [saving, setSaving] = useState(false);
  const [leftTab, setLeftTab] = useState<'layers' | 'library'>('layers');
  const [mobileEditorTab, setMobileEditorTab] = useState<'canvas' | 'layers' | 'edit'>('canvas');

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
      if (saveIrDebounceTimerRef.current) window.clearTimeout(saveIrDebounceTimerRef.current);
      if (zipRevokeTimerRef.current) window.clearTimeout(zipRevokeTimerRef.current);
    };
  }, []);

  // Sync initial Molde state + credit balance from server
  useEffect(() => {
    let active = true;
    async function loadMoldeAndBalance() {
      try {
        const res = await authenticatedFetch('/api/store-molde/state', { method: 'GET' }, ownerId);
        if (res.ok && active) {
          const data = await res.json().catch(() => null);
          if (data?.formulasIr && (data.formulasIr.version === '9.0' || data.formulasIr.pages?.length)) {
            setFormulasIr(data.formulasIr);
          }
          if (typeof data?.balance === 'number') {
            updateBalance(data.balance);
          }
        }
      } catch (err) {
        console.warn('[ArchetypeComposerView] Falha ao carregar molde e saldo:', err);
      }
    }
    void loadMoldeAndBalance();
    return () => {
      active = false;
    };
  }, [ownerId]);

  const registerUndoPoint = (previousIr: FormulaV9Document) => {
    setUndoSnapshot(JSON.parse(JSON.stringify(previousIr)));
    setUndoCountdown(5);
    if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
    undoTimerRef.current = window.setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const syncProfileFromServer = async () => {
    try {
      const fresh = await loadBusinessProfile(ownerId);
      onProfileUpdated?.(fresh);
    } catch (err) {
      console.warn('[ArchetypeComposerView] Falha ao recarregar perfil após mutação:', err);
    }
  };

  const persistIrToServer = async (
    irToSave: FormulaV9Document,
    pageFile = activePageFilename,
  ) => {
    const res = await authenticatedFetch(
      '/api/store-molde/save-ir',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulasIr: irToSave, pageFilename: pageFile }),
      },
      ownerId,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || 'Não foi possível salvar as alterações da vitrine.');
    }
    return data;
  };

  const flushPendingSaveIr = async () => {
    if (saveIrDebounceTimerRef.current) {
      window.clearTimeout(saveIrDebounceTimerRef.current);
      saveIrDebounceTimerRef.current = null;
    }
    const pending = pendingSaveIrRef.current;
    if (!pending) return;
    pendingSaveIrRef.current = null;
    try {
      await persistIrToServer(pending.ir, pending.pageFilename);
      await syncProfileFromServer();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao salvar alterações no servidor.',
      });
    }
  };

  const handleUndoLastChange = async () => {
    if (!undoSnapshot) return;
    if (saveIrDebounceTimerRef.current) {
      window.clearTimeout(saveIrDebounceTimerRef.current);
      saveIrDebounceTimerRef.current = null;
    }
    pendingSaveIrRef.current = null;
    const restored = undoSnapshot;
    setFormulasIr(restored);
    setUndoSnapshot(null);
    setUndoCountdown(0);
    if (undoTimerRef.current) window.clearInterval(undoTimerRef.current);
    try {
      await persistIrToServer(restored, activePageFilename);
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: 'Alteração desfeita com sucesso (0 cr)!',
        durationMs: 2500,
      });
    } catch (err) {
      console.warn('[ArchetypeComposerView] Falha ao persistir reversão no servidor:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível sincronizar o desfazer com o servidor.',
      });
    }
  };

  const formulaV9 = useMemo<FormulaV9Document>(() => {
    const candidate = formulasIr as unknown as FormulaV9Document | undefined;
    if (candidate?.version === '9.0' && Array.isArray(candidate.sections) && candidate.sections.length > 0) {
      return candidate;
    }
    return ensureFormulaV9(profile) as FormulaV9Document;
  }, [formulasIr, profile]);

  const activePageSections = useMemo<SectionNode[]>(() => {
    if (activePageFilename === 'index.html') {
      return formulaV9.sections;
    }
    const page = formulaV9.pages?.find((p) => p.filename === activePageFilename);
    return Array.isArray(page?.sections) && page.sections.length > 0
      ? page.sections
      : formulaV9.sections;
  }, [formulaV9, activePageFilename]);

  const activePageFormulaV9 = useMemo<FormulaV9Document>(
    () => ({ ...formulaV9, sections: activePageSections }),
    [formulaV9, activePageSections],
  );

  useEffect(() => {
    if (activePageSections.length > 0 && !activePageSections.some((s) => s.id === selectedBlockId)) {
      setSelectedBlockId(activePageSections[0].id);
    }
  }, [activePageSections, selectedBlockId]);

  const withActivePageSections = (
    doc: FormulaV9Document,
    nextSections: SectionNode[],
  ): FormulaV9Document => {
    if (activePageFilename === 'index.html') {
      return { ...doc, sections: nextSections };
    }
    const pages = Array.isArray(doc.pages) ? doc.pages : [];
    if (!pages.some((p) => p.filename === activePageFilename)) {
      return { ...doc, sections: nextSections };
    }
    return {
      ...doc,
      pages: pages.map((p) =>
        p.filename === activePageFilename ? { ...p, sections: nextSections } : p,
      ),
    };
  };

  const activeV9Section = useMemo<SectionNode | null>(() => {
    return (
      activePageSections.find((s) => s.id === selectedBlockId) ||
      activePageSections[0] ||
      null
    );
  }, [activePageSections, selectedBlockId]);

  const activeProducts = useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => p.active !== false),
    [profile.catalog?.products],
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (selectedCategory !== 'Todas' && (p.category || 'Geral') !== selectedCategory) return false;
      if (!q) return true;
      return `${p.name} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q);
    });
  }, [activeProducts, selectedCategory, searchQuery]);

  const handleOpenRechargePlans = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('route', 'checkout');
      window.history.pushState({}, '', url.toString());
    } catch {}
    window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
  };

  // Criar Nova Subpágina (-15 cr)
  const handleCreateSubpage = async () => {
    const title = newPageTitle.trim() || 'Ofertas da Semana';
    setCreatingPage(true);
    setHttp402Error(null);
    const prevIr = formulasIr;
    try {
      const res = await authenticatedFetch(
        '/api/store-molde/create-page',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            prompt: newPagePrompt.trim(),
            profile,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        setHttp402Error({ required: data?.required || 15, balance: data?.balance ?? effectiveBalance });
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data || { required: 15, balance: effectiveBalance } }));
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao criar subpágina.');
      }
      registerUndoPoint(prevIr);
      if (data.formulasIr) setFormulasIr(data.formulasIr);
      if (data.page?.filename) setActivePageFilename(data.page.filename);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      setNewPageModalOpen(false);
      setNewPageTitle('');
      setNewPagePrompt('');
      showToast({
        type: 'success',
        message: `Subpágina "${data.page?.title || title}" criada (-15 cr)!`,
        durationMs: 3200,
      });
      const fresh = await loadBusinessProfile(ownerId).catch(() => null);
      if (fresh) onProfileUpdated?.(fresh);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao criar página.',
      });
    } finally {
      setCreatingPage(false);
    }
  };

  // + Adicionar Bloco (-3 cr)
  const handlePaidAddBlock = async (blockTypeOverride?: SectionNode['type']) => {
    const targetType = blockTypeOverride || addBlockType;
    setAddingBlock(true);
    setHttp402Error(null);
    const prevIr = formulasIr;
    try {
      const res = await authenticatedFetch(
        '/api/store-molde/edit-block',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'add',
            pageFilename: activePageFilename,
            blockType: targetType,
            instruction: aiCommandText.trim(),
            profile,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        setHttp402Error({ required: data?.required || 3, balance: data?.balance ?? effectiveBalance });
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data || { required: 3, balance: effectiveBalance } }));
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao adicionar bloco.');
      }
      registerUndoPoint(prevIr);
      if (data.formulasIr) setFormulasIr(data.formulasIr);
      if (data.block?.id) setSelectedBlockId(data.block.id);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: `Bloco "${targetType}" adicionado (-3 cr)! Você pode desfazer em até 5s.`,
        durationMs: 3500,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao adicionar bloco.',
      });
    } finally {
      setAddingBlock(false);
    }
  };

  // Comando de IA na seção selecionada (-3 cr)
  const handleRunAiCommand = async () => {
    if (!aiCommandText.trim() || !activeV9Section) return;
    setRunningAiCommand(true);
    setHttp402Error(null);
    const prevIr = formulasIr;
    try {
      const res = await authenticatedFetch(
        '/api/store-molde/edit-block',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'edit',
            pageFilename: activePageFilename,
            blockId: activeV9Section.id,
            instruction: aiCommandText.trim(),
            profile,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        setHttp402Error({ required: data?.required || 3, balance: data?.balance ?? effectiveBalance });
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data || { required: 3, balance: effectiveBalance } }));
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao aplicar comando IA.');
      }
      registerUndoPoint(prevIr);
      if (data.formulasIr) setFormulasIr(data.formulasIr);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      setAiCommandText('');
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: 'Seção atualizada com IA (-3 cr)!',
        durationMs: 3000,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao executar comando IA.',
      });
    } finally {
      setRunningAiCommand(false);
    }
  };

  // Popover de Mídia Contextual: Upload Grátis (0 cr)
  const handleUploadSectionPhotoFree = async (file: File) => {
    const targetBlockId = mediaPopoverBlockId || activeV9Section?.id || 'sec_hero';
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const res = await authenticatedFetch(
        '/api/store-molde/upload-asset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl,
            slotId: `upload_${targetBlockId}`,
            pageFilename: activePageFilename,
            blockId: targetBlockId,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao enviar foto local.');
      }
      if (data.formulasIr) {
        setFormulasIr(data.formulasIr);
      }
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: 'Foto enviada e aplicada gratuitamente (0 cr)!',
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao enviar foto local.',
      });
    }
  };

  // Popover de Mídia Contextual: Gerar / Editar IA (-5 cr / -10 cr)
  const handleGenerateSectionMediaPaid = async (kind: 'schnell' | 'hero_dev' | 'edit') => {
    const targetBlockId = mediaPopoverBlockId || activeV9Section?.id || 'sec_hero';
    setGeneratingMedia(true);
    setHttp402Error(null);
    const prevIr = formulasIr;
    try {
      const prompt =
        mediaPromptInput.trim() ||
        `Clean commercial photography for ${profile.business?.name || 'store'}, natural daylight, high detail, no text`;
      const res = await authenticatedFetch(
        '/api/store-molde/generate-image',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            prompt,
            slotId: `ia_${targetBlockId}_${Date.now().toString(36)}`,
            pageFilename: activePageFilename,
            blockId: targetBlockId,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        const reqCost = kind === 'schnell' ? 5 : 10;
        setHttp402Error({ required: data?.required || reqCost, balance: data?.balance ?? effectiveBalance });
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data || { required: reqCost, balance: effectiveBalance } }));
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha na geração de imagem IA.');
      }
      registerUndoPoint(prevIr);
      if (data.formulasIr) setFormulasIr(data.formulasIr);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      setMediaPopoverBlockId(null);
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: `Imagem gerada na Pasta Molde (-${data.debited} cr)!`,
        durationMs: 3200,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao gerar imagem IA.',
      });
    } finally {
      setGeneratingMedia(false);
    }
  };

  // Reordenar / Remover / Editar texto manualmente (0 cr — grátis)
  const moveIrBlock = (blockId: string, delta: -1 | 1) => {
    const prevIr = formulaV9;
    const sections = [...activePageSections];
    const idx = sections.findIndex((s) => s.id === blockId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= sections.length) return;
    const [moved] = sections.splice(idx, 1);
    sections.splice(targetIdx, 0, moved);
    const nextIr = withActivePageSections(formulaV9, sections);
    registerUndoPoint(prevIr);
    setFormulasIr(nextIr);
    void persistIrToServer(nextIr, activePageFilename)
      .then(() => syncProfileFromServer())
      .catch((err) => {
        showToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Falha ao salvar reordenação da seção.',
        });
      });
  };

  const removeIrBlock = (blockId: string) => {
    const prevIr = formulaV9;
    const nextSections = activePageSections.filter((s) => s.id !== blockId);
    const nextIr = withActivePageSections(formulaV9, nextSections);
    registerUndoPoint(prevIr);
    setFormulasIr(nextIr);
    void persistIrToServer(nextIr, activePageFilename)
      .then(() => syncProfileFromServer())
      .catch((err) => {
        showToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Falha ao remover seção no servidor.',
        });
      });
  };

  const scheduleAutoSaveIr = (nextIr: FormulaV9Document) => {
    pendingSaveIrRef.current = { ir: nextIr, pageFilename: activePageFilename };
    if (saveIrDebounceTimerRef.current) {
      window.clearTimeout(saveIrDebounceTimerRef.current);
    }
    saveIrDebounceTimerRef.current = window.setTimeout(() => {
      saveIrDebounceTimerRef.current = null;
      void flushPendingSaveIr();
    }, 600);
  };

  const updateSelectedBlockConfigFree = (field: string, value: string) => {
    if (!activeV9Section) return;
    const nextSections = activePageSections.map((s) =>
      s.id !== activeV9Section.id
        ? s
        : ({ ...s, config: { ...(s.config as Record<string, unknown>), [field]: value } } as SectionNode),
    );
    const nextIr = withActivePageSections(formulaV9, nextSections);
    setFormulasIr(nextIr);
    scheduleAutoSaveIr(nextIr);
  };

  const handleSelectDnaPalette = (key: string) => {
    setDnaId(key);
    const pal = V9_DNA_PALETTES[key];
    if (!pal) return;
    const nextTokens = {
      ...deriveThemeTokensFromHex(pal.accent, pal.fontStyle),
      accentDeep: pal.accentDeep,
      surface: pal.surface,
      surfaceAlt: pal.surfaceAlt,
      card: pal.card,
      ink: pal.ink,
      inkMuted: pal.inkMuted,
      footerBg: pal.footerBg,
      radiusPx: pal.radiusPx,
    };
    const nextIr: FormulaV9Document = {
      ...formulaV9,
      designTokens: nextTokens,
    };
    setFormulasIr(nextIr);
    scheduleAutoSaveIr(nextIr);
  };

  const handleManualPaletteColor = (field: 'accent' | 'accentDeep' | 'surface' | 'card', value: string) => {
    setDnaId('Personalizada');
    const nextIr: FormulaV9Document = {
      ...formulaV9,
      designTokens: { ...formulaV9.designTokens, [field]: value },
    };
    setFormulasIr(nextIr);
    scheduleAutoSaveIr(nextIr);
  };

  // Exportar .ZIP (0 cr — grátis)
  const handleExportZip = async () => {
    setExportingZip(true);
    try {
      await flushPendingSaveIr();
      const { blob, filename, fileCount } = await buildFaithfulStorefrontZip({
        profile: {
          ...profile,
          storeLayout: {
            ...(profile.storeLayout || {}),
            formulasIr,
          },
        },
        owner: ownerId,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (zipRevokeTimerRef.current) window.clearTimeout(zipRevokeTimerRef.current);
      zipRevokeTimerRef.current = window.setTimeout(() => {
        zipRevokeTimerRef.current = null;
        URL.revokeObjectURL(url);
      }, 5000);
      showToast({
        type: 'success',
        message: `Pacote .ZIP exportado com ${fileCount} arquivo(s) da Pasta Molde (0 cr)!`,
        durationMs: 3500,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao exportar .ZIP.',
      });
    } finally {
      setExportingZip(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || over.id !== 'editor-canvas-dropzone') return;
    const data = active.data.current as
      | { source?: string; formulaBlockType?: SectionNode['type'] }
      | undefined;
    if (data?.source === 'library' && data.formulaBlockType) {
      void handlePaidAddBlock(data.formulaBlockType);
    }
  };

  const handleSaveToStore = async () => {
    setSaving(true);
    try {
      if (saveIrDebounceTimerRef.current) {
        window.clearTimeout(saveIrDebounceTimerRef.current);
        saveIrDebounceTimerRef.current = null;
      }
      pendingSaveIrRef.current = null;

      const tokens = formulaV9.designTokens;
      const nextIr: FormulaV9Document = {
        ...formulaV9,
        designTokens: tokens,
      };
      await persistIrToServer(nextIr, activePageFilename);
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.brand = {
            ...draft.brand,
            primaryColor: tokens.accent,
            fontStyle: tokens.fontStyle,
          };
          draft.storeLayout = {
            ...(draft.storeLayout || {}),
            formulasIr: nextIr as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          };
        },
        undefined,
        ownerId,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: 'Vitrine e Pasta Molde salvas gratuitamente (0 cr)!',
        durationMs: 3200,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao salvar alterações da vitrine.',
      });
    } finally {
      setSaving(false);
    }
  };

  const lightDnaKeys = Object.keys(V9_DNA_PALETTES);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        data-testid="tela-34-archetype-composer"
        className="flex h-full min-h-[82vh] flex-col bg-[#F8FAFC] text-[#0F172A]"
      >
        {/* Topbar Superior Fiel (Cláusula 4) */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            {onBackToDashboard ? (
              <ActionButton
                variant="secondary"
                size={44}
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={onBackToDashboard}
              >
                Voltar
              </ActionButton>
            ) : null}

            {/* Seletor de páginas da Pasta Molde */}
            <select
              data-testid="editor-page-selector"
              aria-label="Selecionar página da vitrine"
              value={activePageFilename}
              onChange={(e) => setActivePageFilename(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-extrabold text-[#0A2540] focus:border-[#0B4DB8] focus:outline-none"
            >
              <option value="index.html">index.html ({profile.business?.name || 'Home'})</option>
              {((formulaV9 as FormulaV9Document & { pages?: Array<{ filename: string; title: string }> }).pages || []).map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.filename} ({p.title})
                </option>
              ))}
            </select>

            {/* + Nova Página (-15 cr) */}
            <button
              type="button"
              data-testid="editor-create-page-btn"
              onClick={() => setNewPageModalOpen((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0B4DB8] px-3.5 text-xs font-extrabold text-white shadow-xs hover:bg-[#083B9A] transition"
            >
              <FilePlus2 className="size-3.5" />
              <span>+ Nova Página (-15 cr)</span>
            </button>

            {/* Desfazer (5s) */}
            <button
              type="button"
              data-testid="editor-undo-5s-btn"
              disabled={!undoSnapshot}
              onClick={() => void handleUndoLastChange()}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                undoSnapshot
                  ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="size-3.5" />
              <span>Desfazer {undoCountdown > 0 ? `(${undoCountdown}s)` : '(5s)'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de Viewport: Desktop | Tablet | Mobile 390px */}
            <div className="hidden rounded-xl border border-slate-200 bg-slate-100 p-1 lg:inline-flex">
              <button
                type="button"
                data-testid="editor-viewport-desktop"
                onClick={() => setPreviewDevice('desktop')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  previewDevice === 'desktop' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600'
                }`}
              >
                <Monitor className="size-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                data-testid="editor-viewport-tablet"
                onClick={() => setPreviewDevice('tablet')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  previewDevice === 'tablet' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600'
                }`}
              >
                <Tablet className="size-3.5" />
                <span>Tablet</span>
              </button>
              <button
                type="button"
                data-testid="editor-viewport-mobile"
                onClick={() => setPreviewDevice('mobile')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                  previewDevice === 'mobile' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-slate-600'
                }`}
              >
                <Smartphone className="size-3.5" />
                <span>Mobile 390px</span>
              </button>
            </div>

            {/* Badge verde ao vivo Saldo: X cr */}
            <div
              data-testid="editor-credit-balance-badge"
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-extrabold ${
                effectiveBalance > 0
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>Saldo: {effectiveBalance} cr</span>
            </div>

            {/* Exportar .ZIP */}
            <button
              type="button"
              data-testid="editor-export-zip-btn"
              disabled={exportingZip}
              onClick={() => void handleExportZip()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-[#0A2540] hover:bg-slate-50 transition"
            >
              <Download className="size-3.5 text-[#0B4DB8]" />
              <span>{exportingZip ? 'Exportando...' : 'Exportar .ZIP'}</span>
            </button>

            {onOpenPreviewScreen ? (
              <ActionButton variant="secondary" size={44} onClick={onOpenPreviewScreen}>
                Tela Cheia
              </ActionButton>
            ) : null}

            <ActionButton
              variant="primary"
              size={44}
              data-testid="editor-save-plan-btn"
              isLoading={saving}
              loadingText="Salvando..."
              leftIcon={<Save className="size-4" />}
              onClick={() => void handleSaveToStore()}
            >
              Salvar na Loja
            </ActionButton>
          </div>
        </header>

        {/* Banner de Bloqueio HTTP 402 quando saldo zerado / insuficiente */}
        {http402Error ? (
          <div
            data-testid="editor-http-402-banner"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-6 py-3 text-xs font-bold text-rose-900"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-rose-600" />
              <span>
                Bloqueio HTTP 402 (INSUFFICIENT_CREDITS): ação requer {http402Error.required} cr, mas seu saldo atual é {http402Error.balance} cr. Edições manuais, upload de foto e exportação .ZIP continuam gratuitos (0 cr).
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="editor-402-open-plans-btn"
                onClick={handleOpenRechargePlans}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-rose-700"
              >
                Recarregar Créditos
              </button>
              <button
                type="button"
                onClick={() => setHttp402Error(null)}
                className="rounded-lg p-1 text-rose-600 hover:bg-rose-100"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Barra/Modal inline de + Nova Página (-15 cr) */}
        {newPageModalOpen ? (
          <div
            data-testid="editor-new-page-panel"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200 bg-[#EFF6FF] px-6 py-3"
          >
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <input
                type="text"
                data-testid="editor-new-page-title-input"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                placeholder="Título da subpágina (ex.: Kit Pele Sensível)"
                className="min-h-[38px] min-w-[220px] rounded-xl border border-blue-300 bg-white px-3 text-xs font-semibold text-[#0A2540]"
              />
              <input
                type="text"
                data-testid="editor-new-page-prompt-input"
                value={newPagePrompt}
                onChange={(e) => setNewPagePrompt(e.target.value)}
                placeholder="Descrição curta para o GLM-5.3 montar a página"
                className="min-h-[38px] flex-1 min-w-[220px] rounded-xl border border-blue-300 bg-white px-3 text-xs text-[#0A2540]"
              />
              <CreditCostPreview
                cost={15}
                balance={effectiveBalance}
                label="Nova Subpágina"
                onOpenRecharge={handleOpenRechargePlans}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="editor-confirm-create-page-btn"
                disabled={creatingPage}
                onClick={() => void handleCreateSubpage()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B4DB8] px-4 text-xs font-extrabold text-white hover:bg-[#083B9A]"
              >
                <Sparkles className="size-3.5" />
                <span>{creatingPage ? 'Gerando...' : 'Criar Subpágina (-15 cr)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setNewPageModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {/* Abas Mobile (< lg): Canvas | Camadas | Editar */}
        <div className="flex gap-1.5 border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          {(
            [
              { id: 'canvas', label: 'Canvas' },
              { id: 'layers', label: 'Camadas' },
              { id: 'edit', label: 'Editar' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileEditorTab(tab.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                mobileEditorTab === tab.id
                  ? 'bg-[#0B4DB8] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Área Principal 3 Colunas */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          {/* Coluna Esquerda: Seções da Página + Adicionar Bloco (-3 cr) + Comando de IA */}
          <aside
            className={`${
              mobileEditorTab === 'layers' ? 'flex' : 'hidden lg:flex'
            } flex-col border-b border-slate-200 bg-white lg:border-r lg:border-b-0`}
          >
            <div className="flex border-b border-slate-200 p-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLeftTab('layers')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  leftTab === 'layers' ? 'bg-[#0B4DB8] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Seções da Página ({activePageSections.length})
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('library')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  leftTab === 'library' ? 'bg-[#0B4DB8] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Biblioteca
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
              {leftTab === 'layers' ? (
                <>
                  <div className="space-y-1.5">
                    {activePageSections.map((blk, idx, arr) => {
                      const isSelected = selectedBlockId === blk.id;
                      const blkCfg = (blk.config || {}) as { title?: string; brandName?: string };
                      const blkZone = (blk as { zone?: string }).zone;
                      return (
                        <div
                          key={blk.id}
                          data-testid={`editor-section-row-${blk.id}`}
                          onClick={() => setSelectedBlockId(blk.id)}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                            isSelected ? 'border-[#0B4DB8] bg-blue-50/70' : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-extrabold text-[#0A2540]">
                              {blkZone ? `${blkZone} · ` : ''}{friendlySectionName(blk.type)}
                            </div>
                            <div className="truncate text-[10px] text-slate-500">
                              {blkCfg.title || blkCfg.brandName || 'Bloco da loja'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Imagem desta seção"
                              data-testid={`section-media-btn-${blk.id}`}
                              onClick={() => {
                                setSelectedBlockId(blk.id);
                                setMediaPopoverBlockId(blk.id);
                              }}
                              className="rounded p-1 text-[#0B4DB8] hover:bg-blue-100"
                            >
                              <ImageIcon className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveIrBlock(blk.id, -1)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                              aria-label="Subir seção"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === arr.length - 1}
                              onClick={() => moveIrBlock(blk.id, 1)}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                              aria-label="Descer seção"
                            >
                              <ArrowDown className="size-3.5" />
                            </button>
                            {blk.type !== 'HeaderNav' && blk.type !== 'RichFooter' ? (
                              <button
                                type="button"
                                onClick={() => removeIrBlock(blk.id)}
                                className="rounded p-1 text-rose-500 hover:bg-rose-50"
                                aria-label="Remover seção"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* + Adicionar Bloco (-3 cr) */}
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[11px] font-extrabold text-[#0A2540]">Adicionar Bloco</span>
                      <CreditCostPreview
                        cost={3}
                        balance={effectiveBalance}
                        onOpenRecharge={handleOpenRechargePlans}
                      />
                    </div>
                    <select
                      data-testid="editor-add-block-type-select"
                      value={addBlockType}
                      onChange={(e) => setAddBlockType(e.target.value as SectionNode['type'])}
                      className="min-h-[36px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0A2540]"
                    >
                      <option value="HighlightsGrid">HighlightsGrid (Destaques)</option>
                      <option value="EditorialMediaSplit">EditorialMediaSplit (Mídia &amp; Texto)</option>
                      <option value="InteractiveExperience">InteractiveExperience (Simulador / Guia)</option>
                      <option value="BenefitsRow">BenefitsRow (Faixa de Benefícios)</option>
                      <option value="CatalogGrid">CatalogGrid (Catálogo de Itens)</option>
                      <option value="FaqAccordion">FaqAccordion (Perguntas Frequentes)</option>
                      <option value="ClosingScheduleSplit">ClosingScheduleSplit (Fechamento &amp; WhatsApp)</option>
                    </select>
                    <button
                      type="button"
                      data-testid="editor-add-block-btn"
                      disabled={addingBlock}
                      onClick={() => void handlePaidAddBlock()}
                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B4DB8] px-3 text-xs font-extrabold text-white hover:bg-[#083B9A] transition"
                    >
                      <Plus className="size-3.5" />
                      <span>{addingBlock ? 'Adicionando...' : 'Adicionar Bloco (-3 cr)'}</span>
                    </button>
                  </div>

                  {/* Caixa Comando de IA (-3 cr) */}
                  <div className="space-y-2 rounded-2xl border border-blue-200 bg-[#EFF6FF]/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px] font-extrabold text-[#0B4DB8]">
                        <Wand2 className="size-3.5" />
                        Comando de IA
                      </span>
                      <span className="text-[10px] font-bold text-[#0B4DB8]">-3 cr</span>
                    </div>
                    <textarea
                      rows={2}
                      data-testid="editor-ai-command-input"
                      value={aiCommandText}
                      onChange={(e) => setAiCommandText(e.target.value)}
                      placeholder="Ex.: Destacar entrega expressa e cuidado com pele sensível..."
                      className="w-full rounded-xl border border-blue-200 bg-white p-2 text-xs text-[#0A2540]"
                    />
                    <button
                      type="button"
                      data-testid="editor-ai-command-submit"
                      disabled={runningAiCommand || !aiCommandText.trim()}
                      onClick={() => void handleRunAiCommand()}
                      className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B4DB8] px-3 text-xs font-extrabold text-white hover:bg-[#083B9A] disabled:opacity-50"
                    >
                      <Sparkles className="size-3.5" />
                      <span>{runningAiCommand ? 'Aplicando IA...' : 'Aplicar Comando IA (-3 cr)'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-medium text-slate-500">
                    Arraste qualquer componente sobre a vitrine à direita ou clique em <strong>Inserir (-3 cr)</strong>.
                  </p>
                  {(['Estrutura & Hero', 'Conversão & Interativo', 'Catálogo & Marca'] as const).map((cat) => (
                    <div key={cat} className="space-y-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        {cat}
                      </div>
                      {DRAG_DROP_COMPONENT_LIBRARY.filter((c) => c.category === cat).map((item) => (
                        <DraggableLibraryCard
                          key={item.taxonomy}
                          item={item}
                          alreadyActive={activePageSections.some((b) => b.type === item.formulaBlockType)}
                          onQuickAdd={(it) => void handlePaidAddBlock(it.formulaBlockType)}
                        />
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>

          {/* Coluna Central: Canvas Live Formula-IR v9.0 + Popover de Mídia Contextual */}
          <main
            className={`${
              mobileEditorTab === 'canvas' ? 'block' : 'hidden lg:block'
            } relative overflow-y-auto bg-slate-100 p-4 sm:p-6`}
          >
            {/* Popover Contextual "Imagem desta seção" */}
            {mediaPopoverBlockId ? (
              <div
                data-testid="editor-media-popover"
                className="sticky top-2 z-40 mx-auto mb-4 max-w-xl rounded-2xl border border-blue-200 bg-white p-4 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-[#0B4DB8]" />
                    <strong className="text-xs font-extrabold text-[#0A2540]">
                      Imagem desta seção ({mediaPopoverBlockId})
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaPopoverBlockId(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {/* 1. Subir minha foto (0 cr) */}
                  <label
                    data-testid="media-popover-upload-btn"
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
                  >
                    <span className="flex items-center gap-1.5">
                      <Upload className="size-3.5 text-emerald-700" />
                      <span>Subir minha foto</span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                      0 cr
                    </span>
                    <input
                      type="file"
                      data-testid="media-popover-file-input"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void handleUploadSectionPhotoFree(f);
                      }}
                    />
                  </label>

                  {/* 2. Pesquisar na internet (0 cr) */}
                  <button
                    type="button"
                    data-testid="media-popover-search-btn"
                    onClick={() => setSearchModalOpen(true)}
                    className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
                  >
                    <span className="flex items-center gap-1.5">
                      <Search className="size-3.5 text-emerald-700" />
                      <span>Pesquisar na internet</span>
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                      0 cr
                    </span>
                  </button>
                </div>

                {/* 3. Gerar / Editar fundo IA (-5 cr / -10 cr) */}
                <div className="mt-3 space-y-2 rounded-xl border border-blue-100 bg-[#F3F8FE] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-[#0A2540]">
                      Gerar / Editar fundo IA (RunPod)
                    </span>
                    <CreditCostPreview
                      cost={5}
                      balance={effectiveBalance}
                      label="Schnell"
                      onOpenRecharge={handleOpenRechargePlans}
                    />
                  </div>
                  <input
                    type="text"
                    data-testid="media-popover-prompt-input"
                    value={mediaPromptInput}
                    onChange={(e) => setMediaPromptInput(e.target.value)}
                    placeholder="Descreva a cena ou fundo desejado..."
                    className="min-h-[36px] w-full rounded-lg border border-blue-200 bg-white px-3 text-xs text-[#0A2540]"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      data-testid="media-popover-generate-schnell-btn"
                      disabled={generatingMedia}
                      onClick={() => void handleGenerateSectionMediaPaid('schnell')}
                      className="rounded-lg bg-[#0B4DB8] px-2.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#083B9A]"
                    >
                      {generatingMedia ? 'Gerando...' : 'Gerar IA Schnell (-5 cr)'}
                    </button>
                    <button
                      type="button"
                      data-testid="media-popover-generate-hero-btn"
                      disabled={generatingMedia}
                      onClick={() => void handleGenerateSectionMediaPaid('hero_dev')}
                      className="rounded-lg bg-[#083B9A] px-2.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#062E78]"
                    >
                      {generatingMedia ? 'Gerando...' : 'Gerar Hero Dev (-10 cr)'}
                    </button>
                    <button
                      type="button"
                      data-testid="media-popover-edit-qwen-btn"
                      disabled={generatingMedia}
                      onClick={() => void handleGenerateSectionMediaPaid('edit')}
                      className="rounded-lg border border-[#0B4DB8] bg-white px-2.5 py-2 text-[11px] font-extrabold text-[#0B4DB8] hover:bg-blue-50"
                    >
                      {generatingMedia ? 'Editando...' : 'Editar IA Qwen (-10 cr)'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <DroppableCanvasFrame previewDevice={previewDevice}>
              <FormulaTreeRenderer
                formulaV9={activePageFormulaV9}
                previewViewport={previewDevice}
                profile={profile}
                products={filteredProducts}
                cartCount={0}
                editable
                selectedSectionId={selectedBlockId}
                onSelectSection={(sid) => setSelectedBlockId(sid)}
                onOpenSectionMediaPopover={(sid) => setMediaPopoverBlockId(sid)}
                onOpenWebPhotoSearch={(prod) => {
                  setSearchTargetProducts(prod ? [prod] : activeProducts);
                  setSearchModalOpen(true);
                }}
                onOpenCart={() => {}}
                onAddToCart={() => {}}
              />
            </DroppableCanvasFrame>
          </main>

          {/* Coluna Direita: Inspetor da Seção Selecionada (Edição Manual 0 cr) + Mídia */}
          <aside
            className={`${
              mobileEditorTab === 'edit' ? 'block' : 'hidden lg:block'
            } space-y-5 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:border-t-0 lg:border-l`}
          >
            {activeV9Section ? (
              (() => {
                const inspectorItem = activeV9Section;
                const inspectorCfg = (inspectorItem.config || {}) as {
                  title?: string;
                  brandName?: string;
                  subtitle?: string;
                  tagline?: string;
                  body?: string;
                };
                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-1.5 text-[11px] font-extrabold uppercase leading-tight tracking-wider text-slate-500">
                        <Layers className="size-3.5 text-[#0B4DB8]" />
                        <span className="break-words">Seção: {friendlySectionName(inspectorItem.type)}</span>
                      </div>
                      <CreditCostPreview cost={0} balance={effectiveBalance} />
                    </div>

                    <button
                      type="button"
                      data-testid="editor-open-media-popover-btn"
                      onClick={() => setMediaPopoverBlockId(inspectorItem.id)}
                      className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-[#EFF6FF] px-3 text-center text-xs font-extrabold leading-tight text-[#0B4DB8] hover:bg-blue-100"
                    >
                      <ImageIcon className="size-3.5" />
                      <span>Imagem desta seção (0 / -5 / -10 cr)</span>
                    </button>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-slate-600">Título (Edição manual · 0 cr)</span>
                      <input
                        type="text"
                        data-testid="editor-manual-title-input"
                        value={inspectorCfg.title ?? inspectorCfg.brandName ?? ''}
                        onChange={(e) => updateSelectedBlockConfigFree('title', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B4DB8]"
                      />
                    </label>

                    <label className="block space-y-1 text-xs">
                      <span className="font-semibold text-slate-600">Subtítulo / Texto (Edição manual · 0 cr)</span>
                      <textarea
                        rows={5}
                        data-testid="editor-manual-subtitle-input"
                        value={inspectorCfg.subtitle ?? inspectorCfg.body ?? inspectorCfg.tagline ?? ''}
                        onChange={(e) => updateSelectedBlockConfigFree(inspectorCfg.body !== undefined ? 'body' : 'subtitle', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B4DB8]"
                      />
                    </label>
                  </div>
                );
              })()
            ) : null}

            <div className="space-y-2 border-t border-slate-200 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                <Palette className="size-3.5 text-[#0B4DB8]" />
                Paleta DNA da Vitrine
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Escolha um clima completo ou ajuste as cores principais abaixo.</p>
              <div className="grid grid-cols-1 gap-2">
                {lightDnaKeys.map((key) => {
                  const pal = V9_DNA_PALETTES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectDnaPalette(key)}
                      title={pal.label}
                      className={`overflow-hidden rounded-xl border p-2.5 text-left transition ${
                        dnaId === key ? 'border-[#0B4DB8] bg-blue-50/40 ring-2 ring-[#0B4DB8]/25' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-xs font-extrabold text-slate-800">{pal.label}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">{pal.mood}</span>
                      <span className="mt-2 flex h-7 overflow-hidden rounded-lg border border-black/10">
                        {[pal.accent, pal.accentDeep, pal.surface, pal.card, pal.ink].map((color, i) => (
                          <span key={`${color}-${i}`} className="h-full flex-1" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span className="mt-1.5 grid grid-cols-5 text-center text-[8px] font-semibold text-slate-500">
                        <span>Principal</span><span>Destaque</span><span>Fundo</span><span>Card</span><span>Texto</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                {([
                  ['accent', 'Principal'],
                  ['accentDeep', 'Destaque'],
                  ['surface', 'Fundo'],
                  ['card', 'Card'],
                ] as const).map(([field, label]) => (
                  <label key={field} className="flex items-center gap-2 rounded-lg bg-white p-2 text-[10px] font-bold text-slate-600">
                    <input
                      type="color"
                      aria-label={`Cor ${label}`}
                      value={formulaV9.designTokens[field]}
                      onChange={(event) => handleManualPaletteColor(field, event.target.value)}
                      className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Modal Pesquisar na Internet (0 cr) */}
        <BatchImageSearchModal
          open={searchModalOpen}
          onOpenChange={(next) => {
            setSearchModalOpen(next);
            if (!next) setSearchTargetProducts(null);
          }}
          selectedProducts={searchTargetProducts || activeProducts}
          owner={ownerId}
          onApplyImages={async (updates) => {
            if (updates.length > 0 && mediaPopoverBlockId) {
              updateSelectedBlockConfigFree('imageUrl', updates[0].imageUrl);
            }
            if (updates.length > 0) {
              const mapById = new Map(updates.map((u) => [u.productId, u.imageUrl]));
              const snap = await updateBusinessProfile(
                (target) => {
                  target.catalog.products = target.catalog.products.map((p) =>
                    mapById.has(p.id) ? { ...p, imageUrl: mapById.get(p.id)!, approvedAsset: true } : p,
                  );
                },
                undefined,
                ownerId,
              ).catch(() => null);
              if (snap) onProfileUpdated?.(snap);
              setSearchTargetProducts(null);
            }
          }}
        />
      </div>
    </DndContext>
  );
};
