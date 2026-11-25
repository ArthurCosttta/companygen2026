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
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  FilePlus2,
  GitCompareArrows,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Monitor,
  Palette,
  Plus,
  Redo2,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { ActionButton, HumanErrorCard, ModalContainer, useToast } from '../../ui';
import type { BusinessProfile, CatalogProduct } from '../../../schemas/profile.schema';
import {
  contrastRatio,
  deriveThemeTokensFromHex,
  type FormulaV9Document,
  type SectionNode,
} from '../../../schemas/formula-v9.schema';
import {
  loadBusinessProfile,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '../../../services/profile-service';
import { authenticatedFetch } from '../../../services/supabase-client';
import { readImageFileAsDataUrl } from '../storefront/storefront-utils';
import { buildFaithfulStorefrontZip } from '../storefront/storefront-zip-builder';
import { BatchImageSearchModal } from '../storefront/BatchImageSearchModal';
import { FormulaTreeRenderer } from '../storefront/FormulaTreeRenderer';
import { CreditCostPreview } from './CreditCostPreview';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';
import { runDesignCritic } from '../../../../server/design-critic.mjs';
import { useFormulaUndoHistory } from '../../../hooks/useFormulaUndoHistory';
import { computeHumanFormulaDiff, friendlySectionName } from '../../../utils/formulaDiff';

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
  title: string;
  description: string;
  category: 'Estrutura & Capa' | 'Conversão & Simulador' | 'Catálogo & Dúvidas';
  defaultCopy?: { title?: string; subtitle?: string };
}

interface CriticTipItem {
  id: string;
  severity: 'warning' | 'info';
  title: string;
  message: string;
  actionType?: string;
}

const DRAG_DROP_COMPONENT_LIBRARY: LibraryComponentItem[] = [
  {
    taxonomy: 'SEC_HERO_V9',
    formulaBlockType: 'HeroSection',
    title: 'Capa Principal',
    description: 'Chamada principal com título, botão de ação e imagem de destaque.',
    category: 'Estrutura & Capa',
    defaultCopy: { title: 'Bem-vindo à loja' },
  },
  {
    taxonomy: 'SEC_INTERACTIVE_V9',
    formulaBlockType: 'InteractiveExperience',
    title: 'Simulador Interativo',
    description: 'Quiz, calculadora ou montador conectado diretamente aos itens da loja.',
    category: 'Conversão & Simulador',
  },
  {
    taxonomy: 'SEC_BUNDLES_V9',
    formulaBlockType: 'ComplementaryBundles',
    title: 'Combine e Economize',
    description: 'Sugestões prontas de kits e combos com soma real e botão de compra única.',
    category: 'Conversão & Simulador',
  },
  {
    taxonomy: 'SEC_HIGHLIGHTS_V9',
    formulaBlockType: 'HighlightsGrid',
    title: 'Coleções em Destaque',
    description: 'Cartões para destacar categorias, linhas ou entregas da loja.',
    category: 'Estrutura & Capa',
  },
  {
    taxonomy: 'SEC_CATALOG_V9',
    formulaBlockType: 'CatalogGrid',
    title: 'Catálogo de Produtos',
    description: 'Grade pesquisável com preços oficiais e adição direta na sacola.',
    category: 'Catálogo & Dúvidas',
  },
  {
    taxonomy: 'SEC_FAQ_V9',
    formulaBlockType: 'ContextualFaq',
    title: 'Perguntas Frequentes',
    description: 'Respostas diretas sobre prazos, entrega, retirada e pagamento.',
    category: 'Catálogo & Dúvidas',
  },
  {
    taxonomy: 'SEC_CLOSING_V9',
    formulaBlockType: 'ClosingScheduleSplit',
    title: 'Horários & Contato',
    description: 'Bloco final com horário de atendimento e atalho direto para o WhatsApp.',
    category: 'Conversão & Simulador',
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
  AzulConfiança: { label: 'Azul Confiança', mood: 'Tecnologia & serviços', accent: '#0B4DB8', accentDeep: '#07377F', surface: '#F7FAFF', surfaceAlt: '#EAF2FF', card: '#FFFFFF', ink: '#10233F', inkMuted: '#475569', footerBg: '#081A33', radiusPx: 18, fontStyle: 'modern_sans' },
  VerdeBotânico: { label: 'Verde Botânico', mood: 'Natural & acolhedor', accent: '#2F6F4E', accentDeep: '#204D37', surface: '#F8FAF4', surfaceAlt: '#E9F1E5', card: '#FFFFFF', ink: '#20352A', inkMuted: '#4E5D54', footerBg: '#193126', radiusPx: 20, fontStyle: 'editorial_serif' },
  TerracotaArte: { label: 'Terracota Editorial', mood: 'Autoral & artesanal', accent: '#B4532A', accentDeep: '#803A20', surface: '#FFF9F4', surfaceAlt: '#F6E7DA', card: '#FFFCF9', ink: '#3D2A22', inkMuted: '#5C4A42', footerBg: '#34231C', radiusPx: 14, fontStyle: 'editorial_serif' },
  GrafiteExecutivo: { label: 'Grafite Executivo', mood: 'Sólido & premium', accent: '#334155', accentDeep: '#0F172A', surface: '#F8FAFC', surfaceAlt: '#E2E8F0', card: '#FFFFFF', ink: '#0F172A', inkMuted: '#475569', footerBg: '#0B1120', radiusPx: 12, fontStyle: 'clean_geometric' },
  VioletaStudio: { label: 'Violeta Studio', mood: 'Criativo & digital', accent: '#6D28D9', accentDeep: '#4C1D95', surface: '#FCFAFF', surfaceAlt: '#F1EAFE', card: '#FFFFFF', ink: '#291447', inkMuted: '#5B4D6A', footerBg: '#21113A', radiusPx: 22, fontStyle: 'modern_sans' },
  OuroMostarda: { label: 'Ouro Mostarda', mood: 'Solar & gastronômico', accent: '#9A6700', accentDeep: '#6E4800', surface: '#FFFCF3', surfaceAlt: '#FFF1C2', card: '#FFFFFF', ink: '#3A2A0E', inkMuted: '#5F5134', footerBg: '#352408', radiusPx: 16, fontStyle: 'clean_geometric' },
  OceanoTurquesa: { label: 'Oceano Turquesa', mood: 'Fresco & confiável', accent: '#0C6E70', accentDeep: '#084D4F', surface: '#F4FBFB', surfaceAlt: '#DDF3F2', card: '#FFFFFF', ink: '#123739', inkMuted: '#435C5E', footerBg: '#0B3032', radiusPx: 18, fontStyle: 'modern_sans' },
  RosaAtelier: { label: 'Rosa Atelier', mood: 'Delicado & contemporâneo', accent: '#B02A5E', accentDeep: '#821D44', surface: '#FFF8FB', surfaceAlt: '#FBE7EF', card: '#FFFFFF', ink: '#421D2D', inkMuted: '#654958', footerBg: '#351522', radiusPx: 22, fontStyle: 'editorial_serif' },
};

function cloneIrDoc(doc: FormulaV9Document): FormulaV9Document {
  return JSON.parse(JSON.stringify(doc)) as FormulaV9Document;
}

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
          ? 'border-[#2563EB] bg-blue-50 shadow-xs dark:bg-blue-950/40'
          : alreadyActive
            ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/20'
            : 'border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] hover:border-[#2563EB]/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...listeners}
          {...attributes}
          className="flex min-w-0 flex-1 cursor-grab items-start gap-2 active:cursor-grabbing"
          title="Arraste para a vitrine"
        >
          <GripVertical className="mt-0.5 size-4 shrink-0 text-[var(--cg-ink-muted)]" aria-hidden="true" />
          <div className="min-w-0">
            <span className="block truncate text-xs font-bold text-[var(--cg-ink)]">{item.title}</span>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--cg-ink-muted)]">{item.description}</p>
          </div>
        </div>
        <button
          type="button"
          data-testid={`add-library-${item.taxonomy}`}
          onClick={() => onQuickAdd(item)}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
            alreadyActive
              ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-200'
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
  previewDevice: 'desktop' | 'mobile';
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'editor-canvas-dropzone',
  });

  const isMobileFrame = previewDevice === 'mobile';

  return (
    <div
      ref={setNodeRef}
      data-testid="editor-canvas-dropzone"
      data-viewport={previewDevice}
      className={`cg-light-preview @container/formula-frame relative mx-auto w-full min-w-0 overflow-hidden bg-white transition-all duration-200 ${
        isMobileFrame
          ? 'max-w-[390px] rounded-[32px] border-[6px] border-slate-900 shadow-2xl dark:border-slate-700'
          : 'max-w-full rounded-2xl border border-[var(--cg-border)] shadow-sm'
      } ${isOver ? 'ring-4 ring-[#2563EB]/45 ring-offset-2' : ''}`}
    >
      {isMobileFrame ? (
        <div
          aria-hidden="true"
          className="flex items-center justify-center bg-slate-900 py-1.5 dark:bg-slate-800"
        >
          <span className="h-1.5 w-16 rounded-full bg-slate-700 dark:bg-slate-600" />
        </div>
      ) : null}
      {isOver ? (
        <div className="sticky top-0 z-40 bg-[#2563EB] px-4 py-2 text-center text-xs font-bold text-white">
          Solte aqui para inserir na vitrine
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
  const [publishedBaselineIr, setPublishedBaselineIr] = useState<FormulaV9Document>(() =>
    cloneIrDoc(initialFormulaIr),
  );

  const saveIrDebounceTimerRef = useRef<number | null>(null);
  const pendingSaveIrRef = useRef<{ ir: FormulaV9Document; pageFilename: string } | null>(null);
  const zipRevokeTimerRef = useRef<number | null>(null);
  const inlineIgnoreBlurRef = useRef(false);

  const [activePageFilename, setActivePageFilename] = useState<string>('index.html');
  const [selectedBlockId, setSelectedBlockId] = useState<string>(() => {
    return initialFormulaIr.sections[1]?.id || initialFormulaIr.sections[0]?.id || 'sec_hero';
  });

  const syncProfileFromServer = async () => {
    try {
      const fresh = await loadBusinessProfile(ownerId);
      onProfileUpdated?.(fresh);
    } catch (err) {
      console.warn('[ArchetypeComposerView] Falha ao recarregar perfil:', err);
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

  const scheduleAutoSaveIr = (nextIr: FormulaV9Document) => {
    pendingSaveIrRef.current = { ir: nextIr, pageFilename: activePageFilename };
    if (saveIrDebounceTimerRef.current) {
      window.clearTimeout(saveIrDebounceTimerRef.current);
    }
    saveIrDebounceTimerRef.current = window.setTimeout(() => {
      saveIrDebounceTimerRef.current = null;
      void flushPendingSaveIr();
    }, 550);
  };

  // M4 + BUG-F04-05: 25-step immutable Undo/Redo history with keyboard shortcut guard
  const history = useFormulaUndoHistory(initialFormulaIr, {
    enableKeyboardShortcuts: true,
    onRestore: (restoredDoc) => {
      setFormulasIr(restoredDoc);
      scheduleAutoSaveIr(restoredDoc);
    },
  });

  const commitDraftIr = (nextIr: FormulaV9Document, { pushHistory = true, autoSave = true } = {}) => {
    setFormulasIr(nextIr);
    if (pushHistory) {
      history.push(nextIr);
    } else {
      history.replaceCurrent(nextIr);
    }
    if (autoSave) {
      scheduleAutoSaveIr(nextIr);
    }
  };

  const [searchTargetProducts, setSearchTargetProducts] = useState<CatalogProduct[] | null>(null);

  const [newPageModalOpen, setNewPageModalOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPagePrompt, setNewPagePrompt] = useState('');
  const [creatingPage, setCreatingPage] = useState(false);

  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [addingBlock, setAddingBlock] = useState(false);

  const [aiCommandText, setAiCommandText] = useState('');
  const [runningAiCommand, setRunningAiCommand] = useState(false);
  const [patchErrorMessage, setPatchErrorMessage] = useState<string | null>(null);
  const [criticDismissed, setCriticDismissed] = useState(false);
  const [serverCriticTips, setServerCriticTips] = useState<CriticTipItem[] | null>(null);

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

  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [leftTab, setLeftTab] = useState<'layers' | 'theme' | 'library'>('layers');

  // Inline manual draft fields (M4: inlineIgnoreBlurRef)
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubtitle, setDraftSubtitle] = useState('');

  useEffect(() => {
    return () => {
      if (saveIrDebounceTimerRef.current) window.clearTimeout(saveIrDebounceTimerRef.current);
      if (zipRevokeTimerRef.current) window.clearTimeout(zipRevokeTimerRef.current);
    };
  }, []);

  // Load initial server Molde state & credit balance
  useEffect(() => {
    let active = true;
    async function loadMoldeAndBalance() {
      try {
        const res = await authenticatedFetch('/api/store-molde/state', { method: 'GET' }, ownerId);
        if (res.ok && active) {
          const data = await res.json().catch(() => null);
          if (data?.formulasIr && (data.formulasIr.version === '9.0' || data.formulasIr.pages?.length)) {
            setFormulasIr(data.formulasIr);
            setPublishedBaselineIr(cloneIrDoc(data.formulasIr));
            history.reset(data.formulasIr);
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
        message: err instanceof Error ? err.message : 'Falha ao salvar alterações.',
      });
    }
  };

  const handleToolbarUndo = () => {
    const restored = history.undo();
    if (restored) {
      showToast({
        type: 'success',
        message: 'Alteração desfeita (0 cr).',
        durationMs: 2000,
      });
    }
  };

  const handleToolbarRedo = () => {
    const restored = history.redo();
    if (restored) {
      showToast({
        type: 'success',
        message: 'Alteração refeita (0 cr).',
        durationMs: 2000,
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

  useEffect(() => {
    if (!activeV9Section) return;
    const cfg = (activeV9Section.config || {}) as Record<string, unknown>;
    setDraftTitle(String(cfg.title ?? cfg.brandName ?? ''));
    setDraftSubtitle(String(cfg.subtitle ?? cfg.body ?? cfg.tagline ?? ''));
  }, [activeV9Section?.id, activeV9Section?.config]);

  const activeProducts = useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => p.active !== false),
    [profile.catalog?.products],
  );

  // Human-readable diff against published baseline (BUG-F04-08)
  const diffEntries = useMemo(
    () => computeHumanFormulaDiff(formulaV9, publishedBaselineIr),
    [formulaV9, publishedBaselineIr],
  );

  // Deterministic WCAG Contrast Guardian (BUG-F04-02 + P5)
  const wcagIssue = useMemo(() => {
    const t = formulaV9.designTokens;
    const textBgRatio = contrastRatio(t.ink || '#0F172A', t.surface || '#FFFFFF');
    const textCardRatio = contrastRatio(t.ink || '#0F172A', t.card || '#FFFFFF');
    const accentCardRatio = contrastRatio(t.accent || '#0B4DB8', t.card || '#FFFFFF');
    const worstRatio = Math.min(textBgRatio, textCardRatio, accentCardRatio);
    if (worstRatio >= 4.5) return null;
    return {
      ratio: worstRatio,
      message: `Contraste atual (${worstRatio.toFixed(1)}:1) está abaixo de 4,5:1 e dificulta a leitura.`,
    };
  }, [formulaV9.designTokens]);

  // Deterministic Design Critic (BUG-F04-09)
  const criticTips = useMemo<CriticTipItem[]>(() => {
    if (serverCriticTips && serverCriticTips.length > 0) {
      return serverCriticTips.slice(0, 2);
    }
    return runDesignCritic(profile, formulaV9) as CriticTipItem[];
  }, [profile, formulaV9, serverCriticTips]);

  const handleOneClickWcagFix = () => {
    const fixedTokens = deriveThemeTokensFromHex(
      formulaV9.designTokens.accent || '#0B4DB8',
      formulaV9.designTokens.fontStyle || 'modern_sans',
    );
    const nextIr: FormulaV9Document = {
      ...formulaV9,
      designTokens: fixedTokens,
    };
    commitDraftIr(nextIr);
    showToast({
      type: 'success',
      message: 'Contraste corrigido automaticamente para leitura nítida (0 cr)!',
      durationMs: 2400,
    });
  };

  const handleOpenRechargePlans = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('route', 'checkout');
      window.history.pushState({}, '', url.toString());
    } catch {}
    window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
  };

  // + Nova Subpágina (-15 cr)
  const handleCreateSubpage = async () => {
    const title = newPageTitle.trim() || 'Coleção Especial';
    setCreatingPage(true);
    setHttp402Error(null);
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
        throw new Error(data?.error || 'Falha ao criar página extra.');
      }
      if (data.formulasIr) {
        commitDraftIr(data.formulasIr, { pushHistory: true, autoSave: false });
      }
      if (data.page?.filename) setActivePageFilename(data.page.filename);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      setNewPageModalOpen(false);
      setNewPageTitle('');
      setNewPagePrompt('');
      showToast({
        type: 'success',
        message: `Página "${data.page?.title || title}" criada (-15 cr)!`,
        durationMs: 3000,
      });
      await syncProfileFromServer();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao criar página.',
      });
    } finally {
      setCreatingPage(false);
    }
  };

  // + Inserir Seção da Biblioteca (-3 cr)
  const handlePaidAddBlock = async (blockType: SectionNode['type']) => {
    setAddingBlock(true);
    setHttp402Error(null);
    try {
      const res = await authenticatedFetch(
        '/api/store-molde/edit-block',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'add',
            pageFilename: activePageFilename,
            blockType,
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
        throw new Error(data?.error || 'Falha ao adicionar seção.');
      }
      if (data.formulasIr) {
        commitDraftIr(data.formulasIr, { pushHistory: true, autoSave: false });
      }
      if (data.block?.id) setSelectedBlockId(data.block.id);
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: `${friendlySectionName(blockType)} adicionada (-3 cr)!`,
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao adicionar seção.',
      });
    } finally {
      setAddingBlock(false);
    }
  };

  // Surgical AI Patch on Selected Section (-5 cr via POST /api/store-molde/patch-section)
  const handleSurgicalPatch = async () => {
    if (!aiCommandText.trim() || !activeV9Section) return;
    setRunningAiCommand(true);
    setPatchErrorMessage(null);
    setHttp402Error(null);
    try {
      const res = await authenticatedFetch(
        '/api/store-molde/patch-section',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId: activeV9Section.id,
            pageFilename: activePageFilename,
            instruction: aiCommandText.trim(),
            costCredits: 5,
            profile,
          }),
        },
        ownerId,
      );
      const data = await res.json().catch(() => null);
      if (typeof data?.balanceAfter === 'number') {
        updateBalance(data.balanceAfter);
      }
      if (res.status === 402) {
        setHttp402Error({ required: data?.required || 5, balance: data?.balance ?? effectiveBalance });
        window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data || { required: 5, balance: effectiveBalance } }));
        return;
      }
      if (!res.ok || !data?.ok) {
        // Refresh balance in case backend refunded -5 cr on GLM failure (BUG-F04-03 / F04-P12)
        const stateRes = await authenticatedFetch('/api/store-molde/state', { method: 'GET' }, ownerId).catch(() => null);
        if (stateRes?.ok) {
          const st = await stateRes.json().catch(() => null);
          if (typeof st?.balance === 'number') updateBalance(st.balance);
        }
        throw new Error(
          data?.error ||
            'Não conseguimos aplicar o ajuste na seção agora. Seus 5 créditos foram estornados automaticamente.',
        );
      }
      if (data.formulasIr) {
        commitDraftIr(data.formulasIr, { pushHistory: true, autoSave: false });
      }
      if (Array.isArray(data.criticTips)) {
        setServerCriticTips(data.criticTips as CriticTipItem[]);
        setCriticDismissed(false);
      }
      setAiCommandText('');
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: `${friendlySectionName(activeV9Section.type)} ajustada com IA (-5 cr)!`,
        durationMs: 2800,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao ajustar seção. Seus créditos permanecem protegidos.';
      setPatchErrorMessage(msg);
      showToast({ type: 'error', message: msg });
    } finally {
      setRunningAiCommand(false);
    }
  };

  // Free Photo Upload (0 cr)
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
        commitDraftIr(data.formulasIr, { pushHistory: true, autoSave: false });
      }
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: 'Foto aplicada gratuitamente (0 cr)!',
        durationMs: 2600,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao enviar foto local.',
      });
    }
  };

  // AI Image Gen (-5 cr / -10 cr)
  const handleGenerateSectionMediaPaid = async (kind: 'schnell' | 'hero_dev' | 'edit') => {
    const targetBlockId = mediaPopoverBlockId || activeV9Section?.id || 'sec_hero';
    setGeneratingMedia(true);
    setHttp402Error(null);
    try {
      const prompt =
        mediaPromptInput.trim() ||
        `Clean commercial photography for ${profile.business?.name || 'store'}, natural daylight, crisp framing, no text`;
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
        throw new Error(data?.error || 'Falha ao gerar imagem.');
      }
      if (data.formulasIr) {
        commitDraftIr(data.formulasIr, { pushHistory: true, autoSave: false });
      }
      if (typeof data.balanceAfter === 'number') updateBalance(data.balanceAfter);
      setMediaPopoverBlockId(null);
      await syncProfileFromServer();
      showToast({
        type: 'success',
        message: `Imagem atualizada na seção (-${data.debited} cr)!`,
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao gerar imagem.',
      });
    } finally {
      setGeneratingMedia(false);
    }
  };

  // Layer reorder / delete (0 cr)
  const moveIrBlock = (blockId: string, delta: -1 | 1) => {
    const sections = [...activePageSections];
    const idx = sections.findIndex((s) => s.id === blockId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= sections.length) return;
    const [moved] = sections.splice(idx, 1);
    sections.splice(targetIdx, 0, moved);
    const nextIr = withActivePageSections(formulaV9, sections);
    commitDraftIr(nextIr);
  };

  const removeIrBlock = (blockId: string) => {
    const nextSections = activePageSections.filter((s) => s.id !== blockId);
    const nextIr = withActivePageSections(formulaV9, nextSections);
    commitDraftIr(nextIr);
  };

  const applyManualSectionPatch = (field: string, value: string, { pushSnapshot }: { pushSnapshot: boolean }) => {
    if (!activeV9Section) return;
    const currentCfg = activeV9Section.config as Record<string, unknown>;
    if (String(currentCfg[field] ?? '') === value && !pushSnapshot) return;
    const nextSections = activePageSections.map((s) =>
      s.id !== activeV9Section.id
        ? s
        : ({ ...s, config: { ...(s.config as Record<string, unknown>), [field]: value } } as SectionNode),
    );
    const nextIr = withActivePageSections(formulaV9, nextSections);
    commitDraftIr(nextIr, { pushHistory: pushSnapshot, autoSave: pushSnapshot });
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
    commitDraftIr({
      ...formulaV9,
      designTokens: nextTokens,
    });
  };

  const handleManualPaletteColor = (
    field: 'accent' | 'accentDeep' | 'surface' | 'card' | 'ink',
    value: string,
  ) => {
    setDnaId('Personalizada');
    commitDraftIr({
      ...formulaV9,
      designTokens: { ...formulaV9.designTokens, [field]: value },
    });
  };

  // Export .ZIP (0 cr)
  const handleExportZip = async () => {
    setExportingZip(true);
    try {
      await flushPendingSaveIr();
      const { blob, filename, fileCount } = await buildFaithfulStorefrontZip({
        profile: {
          ...profile,
          storeLayout: {
            ...(profile.storeLayout || {}),
            formulasIr: formulaV9,
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
        message: `Pacote da loja exportado (${fileCount} arquivos · 0 cr)!`,
        durationMs: 3200,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao exportar loja.',
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
      setPublishedBaselineIr(cloneIrDoc(nextIr));
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: 'Vitrine publicada gratuitamente (0 cr)!',
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao publicar alterações.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCriticAction = (actionType?: string) => {
    if (actionType === 'fix_wcag') {
      handleOneClickWcagFix();
      return;
    }
    if (actionType === 'select_hero') {
      const heroSec = activePageSections.find((s) => s.type === 'HeroSection');
      if (heroSec) {
        setSelectedBlockId(heroSec.id);
        setLeftTab('layers');
      }
      return;
    }
    if (actionType === 'open_photo_search') {
      setSearchTargetProducts(activeProducts);
      setSearchModalOpen(true);
      return;
    }
    if (actionType === 'add_bundles') {
      void handlePaidAddBlock('ComplementaryBundles');
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        data-testid="tela-34-archetype-composer"
        className="flex h-[calc(100dvh-64px)] min-h-[580px] flex-col overflow-hidden bg-[var(--cg-surface)] text-[var(--cg-ink)]"
      >
        {/* Topbar Unificada */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
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

            {/* Seletor de páginas em PT-BR sem expor extensão .html */}
            <select
              data-testid="editor-page-selector"
              aria-label="Selecionar página da loja"
              value={activePageFilename}
              onChange={(e) => setActivePageFilename(e.target.value)}
              className="min-h-[40px] rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 text-xs font-bold text-[var(--cg-ink)] focus:border-[var(--cg-accent)] focus:outline-none"
            >
              <option value="index.html">Página Principal ({profile.business?.name || 'Loja'})</option>
              {(formulaV9.pages || []).map((p) => (
                <option key={p.filename} value={p.filename}>
                  {p.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="editor-create-page-btn"
              onClick={() => setNewPageModalOpen((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 text-xs font-bold text-[var(--cg-ink)] hover:border-[var(--cg-accent)] transition"
            >
              <FilePlus2 className="size-3.5 text-[var(--cg-accent)]" />
              <span>+ Página (-15 cr)</span>
            </button>

            {/* Undo / Redo (25 snapshots + Ctrl+Z / Ctrl+Y) */}
            <div className="inline-flex items-center rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-0.5">
              <button
                type="button"
                data-testid="editor-undo-btn"
                title="Desfazer (Ctrl+Z)"
                aria-label="Desfazer última alteração"
                disabled={!history.canUndo}
                onClick={handleToolbarUndo}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[var(--cg-ink)] hover:bg-[var(--cg-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Undo2 className="size-3.5" />
                <span className="hidden sm:inline">Desfazer</span>
              </button>
              <button
                type="button"
                data-testid="editor-redo-btn"
                title="Refazer (Ctrl+Y)"
                aria-label="Refazer alteração"
                disabled={!history.canRedo}
                onClick={handleToolbarRedo}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[var(--cg-ink)] hover:bg-[var(--cg-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Redo2 className="size-3.5" />
                <span className="hidden sm:inline">Refazer</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Switch Desktop | 390px */}
            <div className="inline-flex rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-1">
              <button
                type="button"
                data-testid="editor-viewport-desktop"
                onClick={() => setPreviewDevice('desktop')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  previewDevice === 'desktop'
                    ? 'bg-[var(--cg-surface-elevated)] text-[var(--cg-ink)] shadow-2xs'
                    : 'text-[var(--cg-ink-muted)] hover:text-[var(--cg-ink)]'
                }`}
              >
                <Monitor className="size-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                data-testid="editor-viewport-mobile"
                onClick={() => setPreviewDevice('mobile')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  previewDevice === 'mobile'
                    ? 'bg-[var(--cg-surface-elevated)] text-[var(--cg-ink)] shadow-2xs'
                    : 'text-[var(--cg-ink-muted)] hover:text-[var(--cg-ink)]'
                }`}
              >
                <Smartphone className="size-3.5" />
                <span>390px</span>
              </button>
            </div>

            {/* Pílula Rascunho Local • Ver Diff */}
            <button
              type="button"
              data-testid="editor-diff-pill"
              onClick={() => setDiffModalOpen(true)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ${
                diffEntries.length > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200'
                  : 'border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-ink-muted)] hover:text-[var(--cg-ink)]'
              }`}
            >
              <GitCompareArrows className="size-3.5" />
              <span>
                {diffEntries.length > 0
                  ? `Rascunho Local • Ver Diff (${diffEntries.length})`
                  : 'Publicado • Ver Diff'}
              </span>
            </button>

            <div
              data-testid="editor-credit-balance-badge"
              className={`cg-tabular inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold ${
                effectiveBalance > 0
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>Saldo: {effectiveBalance} cr</span>
            </div>

            <button
              type="button"
              data-testid="editor-export-zip-btn"
              disabled={exportingZip}
              onClick={() => void handleExportZip()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 text-xs font-bold text-[var(--cg-ink)] hover:border-[var(--cg-accent)] transition"
            >
              <Download className="size-3.5 text-[var(--cg-accent)]" />
              <span>{exportingZip ? 'Exportando...' : 'Exportar .ZIP'}</span>
            </button>

            {onOpenPreviewScreen ? (
              <ActionButton variant="secondary" size={44} onClick={onOpenPreviewScreen}>
                Tela Cheia
              </ActionButton>
            ) : null}

            {/* CTA Verde Publicar com largura constante */}
            <button
              type="button"
              data-testid="editor-save-plan-btn"
              disabled={saving}
              onClick={() => void handleSaveToStore()}
              className="inline-flex min-h-[40px] min-w-[132px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#16A34A] px-4 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#15803D] disabled:opacity-60"
            >
              <Check className="size-4 shrink-0" />
              <span>{saving ? 'Publicando...' : 'Publicar'}</span>
            </button>
          </div>
        </header>

        {/* Micro-banner WCAG quando contraste < 4.5:1 (P5 + F04-P06) */}
        {wcagIssue ? (
          <div
            data-testid="editor-wcag-warning-banner"
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2.5 text-xs font-bold text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-100"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <span>{wcagIssue.message}</span>
            </div>
            <button
              type="button"
              data-testid="editor-wcag-fix-btn"
              onClick={handleOneClickWcagFix}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-extrabold text-white hover:bg-amber-700"
            >
              <Wand2 className="size-3.5" />
              <span>Corrigir contraste em 1 clique</span>
            </button>
          </div>
        ) : null}

        {/* Banner HTTP 402 */}
        {http402Error ? (
          <div
            data-testid="editor-http-402-banner"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-6 py-3 text-xs font-bold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-100"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-300" />
              <span>
                Saldo insuficiente: esta ação consome {http402Error.required} cr e você tem {http402Error.balance} cr. Edições manuais, upload de fotos e exportação .ZIP continuam gratuitos (0 cr).
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
                className="rounded-lg p-1 text-rose-600 hover:bg-rose-100 dark:text-rose-300"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Barra + Nova Página (-15 cr) */}
        {newPageModalOpen ? (
          <div
            data-testid="editor-new-page-panel"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-6 py-3"
          >
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <input
                type="text"
                data-testid="editor-new-page-title-input"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                placeholder="Nome da página (ex.: Kit Presente)"
                className="min-h-[38px] min-w-[200px] rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 text-xs font-semibold text-[var(--cg-ink)]"
              />
              <input
                type="text"
                data-testid="editor-new-page-prompt-input"
                value={newPagePrompt}
                onChange={(e) => setNewPagePrompt(e.target.value)}
                placeholder="Descreva o objetivo desta página..."
                className="min-h-[38px] flex-1 min-w-[220px] rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 text-xs text-[var(--cg-ink)]"
              />
              <CreditCostPreview
                cost={2}
                balance={effectiveBalance}
                label="Nova Página"
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
                <span>{creatingPage ? 'Criando...' : 'Criar Página (-2 cr)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setNewPageModalOpen(false)}
                className="rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] px-3 py-2 text-xs font-bold text-[var(--cg-ink-muted)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {/* Área Principal 30% / 70% */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(310px,30%)_minmax(0,70%)]">
          {/* Coluna Esquerda 30%: Camadas PT-BR + Ajuste Cirúrgico + Editor Manual + Cores */}
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] lg:border-r lg:border-b-0">
            <div className="flex gap-1.5 border-b border-[var(--cg-border)] p-2">
              {(
                [
                  { id: 'layers', label: `Camadas (${activePageSections.length})` },
                  { id: 'theme', label: 'Cores' },
                  { id: 'library', label: 'Biblioteca' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`editor-left-tab-${tab.id}`}
                  onClick={() => setLeftTab(tab.id)}
                  className={`flex-1 rounded-lg px-2.5 py-2 text-xs font-bold transition ${
                    leftTab === tab.id
                      ? 'bg-[#0B4DB8] text-white'
                      : 'bg-[var(--cg-surface)] text-[var(--cg-ink-muted)] hover:text-[var(--cg-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3.5 pb-8">
              {leftTab === 'layers' ? (
                <>
                  {/* 1. Campo Único de Patch Cirúrgico (-5 cr) */}
                  <div className="space-y-2 rounded-2xl border border-blue-200/80 bg-blue-50/60 p-3 dark:border-blue-800/60 dark:bg-blue-950/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B4DB8] dark:text-blue-300">
                        <Wand2 className="size-3.5" />
                        <span>
                          Ajustar {activeV9Section ? friendlySectionName(activeV9Section.type) : 'Vitrine'}
                        </span>
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#0B4DB8] dark:bg-slate-900 dark:text-blue-300">
                        Consome 5 cr
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      data-testid="editor-ai-command-input"
                      value={aiCommandText}
                      onChange={(e) => {
                        setAiCommandText(e.target.value);
                        if (patchErrorMessage) setPatchErrorMessage(null);
                      }}
                      placeholder="Pedir ajuste na vitrine... (ex.: Deixar título mais direto)"
                      className="w-full rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] p-2.5 text-xs text-[var(--cg-ink)] focus:border-[#0B4DB8] focus:outline-none"
                    />
                    <button
                      type="button"
                      data-testid="editor-ai-command-submit"
                      disabled={runningAiCommand || !aiCommandText.trim()}
                      onClick={() => void handleSurgicalPatch()}
                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#0B4DB8] px-3 text-xs font-extrabold text-white transition hover:bg-[#083B9A] disabled:opacity-50"
                    >
                      <Sparkles className="size-3.5" />
                      <span>{runningAiCommand ? 'Aplicando ajuste...' : 'Aplicar ajuste cirúrgico (-5 cr)'}</span>
                    </button>

                    {patchErrorMessage ? (
                      <div data-testid="editor-patch-error-card" className="min-w-0">
                        <HumanErrorCard
                          status={502}
                          fallbackMessage={patchErrorMessage}
                          actionLabel="Tentar novamente"
                          onAction={() => void handleSurgicalPatch()}
                          className="!flex-col !items-stretch"
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* 2. Lista de Camadas PT-BR sem jargão técnico */}
                  <div className="space-y-1.5">
                    {activePageSections.map((blk, idx, arr) => {
                      const isSelected = selectedBlockId === blk.id;
                      const blkCfg = (blk.config || {}) as { title?: string; brandName?: string };
                      return (
                        <div
                          key={blk.id}
                          data-testid={`editor-section-row-${blk.id}`}
                          onClick={() => setSelectedBlockId(blk.id)}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 transition ${
                            isSelected
                              ? 'border-[#0B4DB8] bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                              : 'border-[var(--cg-border)] bg-[var(--cg-surface)] hover:border-slate-400'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-xs font-extrabold text-[var(--cg-ink)]">
                              {friendlySectionName(blk.type)}
                            </div>
                            <div className="truncate text-[11px] text-[var(--cg-ink-muted)]">
                              {blkCfg.title || blkCfg.brandName || 'Bloco da vitrine'}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Foto desta seção"
                              data-testid={`section-media-btn-${blk.id}`}
                              onClick={() => {
                                setSelectedBlockId(blk.id);
                                setMediaPopoverBlockId(blk.id);
                              }}
                              className="rounded p-1 text-[#0B4DB8] hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50"
                            >
                              <ImageIcon className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveIrBlock(blk.id, -1)}
                              className="rounded p-1 text-[var(--cg-ink-muted)] hover:bg-[var(--cg-surface-elevated)] disabled:opacity-30"
                              aria-label="Subir seção"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === arr.length - 1}
                              onClick={() => moveIrBlock(blk.id, 1)}
                              className="rounded p-1 text-[var(--cg-ink-muted)] hover:bg-[var(--cg-surface-elevated)] disabled:opacity-30"
                              aria-label="Descer seção"
                            >
                              <ArrowDown className="size-3.5" />
                            </button>
                            {blk.type !== 'HeaderNav' && blk.type !== 'RichFooter' ? (
                              <button
                                type="button"
                                onClick={() => removeIrBlock(blk.id)}
                                className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
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

                  {/* 3. Edição Manual Gratuita (0 cr) da Camada Selecionada */}
                  {activeV9Section ? (
                    <div className="space-y-3 rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--cg-ink-muted)]">
                          <Layers className="size-3.5 text-[#0B4DB8] dark:text-blue-400" />
                          <span>{friendlySectionName(activeV9Section.type)}</span>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Grátis (0 cr)
                        </span>
                      </div>

                      <button
                        type="button"
                        data-testid="editor-open-media-popover-btn"
                        onClick={() => setMediaPopoverBlockId(activeV9Section.id)}
                        className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 text-xs font-bold text-[#0B4DB8] hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      >
                        <ImageIcon className="size-3.5" />
                        <span>Trocar foto desta seção</span>
                      </button>

                      <label className="block space-y-1 text-xs">
                        <span className="font-semibold text-[var(--cg-ink-muted)]">Título principal</span>
                        <input
                          type="text"
                          data-testid="editor-manual-title-input"
                          value={draftTitle}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftTitle(val);
                            applyManualSectionPatch('title', val, { pushSnapshot: false });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              inlineIgnoreBlurRef.current = true;
                              const cfg = (activeV9Section.config || {}) as Record<string, unknown>;
                              setDraftTitle(String(cfg.title ?? cfg.brandName ?? ''));
                              (e.currentTarget as HTMLInputElement).blur();
                              window.setTimeout(() => {
                                inlineIgnoreBlurRef.current = false;
                              }, 0);
                            } else if (e.key === 'Enter') {
                              applyManualSectionPatch('title', draftTitle, { pushSnapshot: true });
                            }
                          }}
                          onBlur={() => {
                            if (inlineIgnoreBlurRef.current) return;
                            applyManualSectionPatch('title', draftTitle, { pushSnapshot: true });
                          }}
                          className="w-full rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-3 py-2 text-xs text-[var(--cg-ink)] focus:border-[#0B4DB8] focus:outline-none"
                        />
                      </label>

                      <label className="block space-y-1 text-xs">
                        <span className="font-semibold text-[var(--cg-ink-muted)]">Subtítulo / Texto de apoio</span>
                        <textarea
                          rows={3}
                          data-testid="editor-manual-subtitle-input"
                          value={draftSubtitle}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftSubtitle(val);
                            const cfg = (activeV9Section.config || {}) as Record<string, unknown>;
                            const targetField = cfg.body !== undefined ? 'body' : 'subtitle';
                            applyManualSectionPatch(targetField, val, { pushSnapshot: false });
                          }}
                          onBlur={() => {
                            if (inlineIgnoreBlurRef.current) return;
                            const cfg = (activeV9Section.config || {}) as Record<string, unknown>;
                            const targetField = cfg.body !== undefined ? 'body' : 'subtitle';
                            applyManualSectionPatch(targetField, draftSubtitle, { pushSnapshot: true });
                          }}
                          className="w-full rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-3 py-2 text-xs text-[var(--cg-ink)] focus:border-[#0B4DB8] focus:outline-none"
                        />
                      </label>
                    </div>
                  ) : null}
                </>
              ) : leftTab === 'theme' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[var(--cg-ink-muted)]">
                    <Palette className="size-3.5 text-[#0B4DB8] dark:text-blue-400" />
                    <span>Paleta e Contraste WCAG AA</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--cg-ink-muted)]">
                    Escolha uma paleta pronta ou ajuste manualmente com proteção de leitura.
                  </p>

                  <div className="grid grid-cols-1 gap-2">
                    {Object.keys(V9_DNA_PALETTES).map((key) => {
                      const pal = V9_DNA_PALETTES[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleSelectDnaPalette(key)}
                          className={`overflow-hidden rounded-xl border p-2.5 text-left transition ${
                            dnaId === key
                              ? 'border-[#0B4DB8] bg-blue-50/40 ring-2 ring-[#0B4DB8]/25 dark:bg-blue-950/30'
                              : 'border-[var(--cg-border)] bg-[var(--cg-surface)] hover:border-slate-400'
                          }`}
                        >
                          <span className="block text-xs font-extrabold text-[var(--cg-ink)]">{pal.label}</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--cg-ink-muted)]">{pal.mood}</span>
                          <span className="mt-2 flex h-5 overflow-hidden rounded-lg border border-black/10">
                            {[pal.accent, pal.accentDeep, pal.surface, pal.card, pal.ink].map((color, i) => (
                              <span key={`${color}-${i}`} className="h-full flex-1" style={{ backgroundColor: color }} />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-2.5">
                    {([
                      ['accent', 'Principal'],
                      ['accentDeep', 'Destaque'],
                      ['surface', 'Fundo'],
                      ['card', 'Card'],
                      ['ink', 'Texto'],
                    ] as const).map(([field, label]) => (
                      <label
                        key={field}
                        className="flex items-center gap-2 rounded-lg bg-[var(--cg-surface-elevated)] p-2 text-[11px] font-bold text-[var(--cg-ink)]"
                      >
                        <input
                          type="color"
                          data-testid={`editor-color-picker-${field}`}
                          aria-label={`Cor ${label}`}
                          value={formulaV9.designTokens[field]}
                          onChange={(event) => handleManualPaletteColor(field, event.target.value)}
                          className="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] font-medium text-[var(--cg-ink-muted)]">
                    Arraste para a vitrine ou clique em <strong>Inserir (-3 cr)</strong>.
                  </p>
                  {(['Estrutura & Capa', 'Conversão & Simulador', 'Catálogo & Dúvidas'] as const).map((cat) => (
                    <div key={cat} className="space-y-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--cg-ink-muted)]">
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
                  {addingBlock ? (
                    <div className="text-center text-xs font-bold text-[#0B4DB8]">Inserindo seção...</div>
                  ) : null}
                </div>
              )}
            </div>
          </aside>

          {/* Coluna Direita 70%: Palco Central + Popover Mídia + Barra Design Critic */}
          <main className="relative flex min-h-0 flex-col bg-slate-100/90 dark:bg-[#090D16]">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {mediaPopoverBlockId ? (
                <div
                  data-testid="editor-media-popover"
                  className="sticky top-2 z-40 mx-auto mb-4 max-w-xl rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] p-4 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-[var(--cg-border)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-[#0B4DB8] dark:text-blue-400" />
                      <strong className="text-xs font-extrabold text-[var(--cg-ink)]">
                        Imagem de {friendlySectionName(activePageSections.find((s) => s.id === mediaPopoverBlockId)?.type || '')}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaPopoverBlockId(null)}
                      className="rounded-lg p-1 text-[var(--cg-ink-muted)] hover:bg-[var(--cg-surface)]"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label
                      data-testid="media-popover-upload-btn"
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      <span className="flex items-center gap-1.5">
                        <Upload className="size-3.5 text-emerald-700 dark:text-emerald-300" />
                        <span>Subir minha foto</span>
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-slate-900 dark:text-emerald-300">
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

                    <button
                      type="button"
                      data-testid="media-popover-search-btn"
                      onClick={() => setSearchModalOpen(true)}
                      className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      <span className="flex items-center gap-1.5">
                        <Search className="size-3.5 text-emerald-700 dark:text-emerald-300" />
                        <span>Pesquisar na internet</span>
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-slate-900 dark:text-emerald-300">
                        0 cr
                      </span>
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-[var(--cg-ink)]">
                        Gerar ou editar foto sob medida com IA
                      </span>
                      <CreditCostPreview
                        cost={5}
                        balance={effectiveBalance}
                        label="Foto IA"
                        onOpenRecharge={handleOpenRechargePlans}
                      />
                    </div>
                    <input
                      type="text"
                      data-testid="media-popover-prompt-input"
                      value={mediaPromptInput}
                      onChange={(e) => setMediaPromptInput(e.target.value)}
                      placeholder="Descreva a cena ou fundo desejado..."
                      className="min-h-[36px] w-full rounded-lg border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-3 text-xs text-[var(--cg-ink)]"
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        data-testid="media-popover-generate-schnell-btn"
                        disabled={generatingMedia}
                        onClick={() => void handleGenerateSectionMediaPaid('schnell')}
                        className="rounded-lg bg-[#0B4DB8] px-2.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#083B9A]"
                      >
                        {generatingMedia ? 'Gerando...' : 'Foto Rápida (-5 cr)'}
                      </button>
                      <button
                        type="button"
                        data-testid="media-popover-generate-hero-btn"
                        disabled={generatingMedia}
                        onClick={() => void handleGenerateSectionMediaPaid('hero_dev')}
                        className="rounded-lg bg-[#083B9A] px-2.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#062E78]"
                      >
                        {generatingMedia ? 'Gerando...' : 'Capa HD (-10 cr)'}
                      </button>
                      <button
                        type="button"
                        data-testid="media-popover-edit-qwen-btn"
                        disabled={generatingMedia}
                        onClick={() => void handleGenerateSectionMediaPaid('edit')}
                        className="rounded-lg border border-[#0B4DB8] bg-[var(--cg-surface-elevated)] px-2.5 py-2 text-[11px] font-extrabold text-[#0B4DB8] dark:text-blue-300"
                      >
                        {generatingMedia ? 'Editando...' : 'Editar Foto (-10 cr)'}
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
                  products={activeProducts}
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
            </div>

            {/* Barra Fina Dispensável Design Critic no rodapé do preview */}
            {!criticDismissed && criticTips.length > 0 ? (
              <div
                data-testid="editor-design-critic-bar"
                className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] px-4 py-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                    <Lightbulb className="size-3.5" />
                    <span>Design Critic</span>
                  </span>
                  {criticTips.map((tip) => (
                    <div key={tip.id} className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--cg-ink)]">{tip.title}:</span>
                      <span className="text-[var(--cg-ink-muted)]">{tip.message}</span>
                      {tip.actionType && tip.actionType !== 'check_shipping' && tip.actionType !== 'check_catalog' ? (
                        <button
                          type="button"
                          onClick={() => handleCriticAction(tip.actionType)}
                          className="rounded-md bg-[var(--cg-surface)] px-2 py-0.5 text-[11px] font-bold text-[#0B4DB8] hover:underline dark:text-blue-300"
                        >
                          Corrigir agora
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid="editor-critic-dismiss-btn"
                  aria-label="Fechar recomendações"
                  onClick={() => setCriticDismissed(true)}
                  className="rounded-lg p-1 text-[var(--cg-ink-muted)] hover:bg-[var(--cg-surface)]"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
          </main>
        </div>

        {/* Modal Diff Legível em PT-BR (M1: __cgToastOrigin protegido via ModalContainer) */}
        <ModalContainer
          open={diffModalOpen}
          onOpenChange={setDiffModalOpen}
          title="Alterações no Rascunho"
          description="Resumo legível do que mudou na sua vitrine desde a última publicação."
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <ActionButton variant="secondary" size={44} onClick={() => setDiffModalOpen(false)}>
                Fechar
              </ActionButton>
              <button
                type="button"
                onClick={() => {
                  setDiffModalOpen(false);
                  void handleSaveToStore();
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 text-xs font-extrabold text-white hover:bg-[#15803D]"
              >
                <Check className="size-3.5" />
                <span>Publicar agora</span>
              </button>
            </div>
          }
        >
          <div data-testid="editor-diff-modal-body" className="space-y-2.5">
            {diffEntries.length === 0 ? (
              <p className="rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-4 text-sm text-[var(--cg-ink-muted)]">
                Nenhuma diferença pendente — sua vitrine publicada já está idêntica a este rascunho.
              </p>
            ) : (
              <ul className="space-y-2">
                {diffEntries.map((entry) => (
                  <li
                    key={entry.key}
                    data-testid="editor-diff-entry"
                    className="flex items-start gap-2.5 rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-3 text-sm text-[var(--cg-ink)]"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-[#16A34A]" />
                    <span>{entry.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ModalContainer>

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
              applyManualSectionPatch('imageUrl', updates[0].imageUrl, { pushSnapshot: true });
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
