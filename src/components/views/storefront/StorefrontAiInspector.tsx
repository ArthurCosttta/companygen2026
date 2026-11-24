import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUUpLeft,
  Check,
  Crosshair,
  EyeSlash,
  Image as ImageIcon,
  PencilSimple,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import type { BusinessProfile } from '@/schemas/profile.schema';
import type { FormulaV9Document } from '@/schemas/formula-v9.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import { useToast } from '@/components/ui';
import { CAMPAIGN_COMPONENTS_CATALOG } from './CampaignBlocksCatalog';
import type { NodeStyleOverride, NodeStylesConfig } from './AtomicSectionRenderers';

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface AncestorChainItem {
  id: string;
  nodePath?: string;
  label: string;
  editableProps: string[];
  currentImageUrl?: string;
  currentText?: string;
  rect: RectBox;
}

interface TargetRect extends RectBox {
  id: string;
  nodePath?: string;
  label: string;
  ancestorChain: AncestorChainItem[];
  editableProps: string[];
  currentImageUrl?: string;
  currentText?: string;
}

type InspectorTab = 'text' | 'image' | 'direction' | 'component';

interface PropPatchPayload {
  nodePath?: string;
  inlineText?: string;
  style?: NodeStyleOverride;
  hideNodePath?: string;
  unhideAll?: boolean;
  surfacePreset?: 'light' | 'cream' | 'dark';
  moveDirection?: 'up' | 'down';
  groupDisplayMode?: 'only_selected' | 'prioritize';
  selectedSkuIds?: string[];
}

const ROLE_LABELS_PT: Record<string, string> = {
  hero_stage: 'Capa em Tela Cheia',
  hero_split: 'Capa Editorial Split',
  hero_centered: 'Capa Centralizada',
  kinetic_ribbon: 'Faixa Animada (Provas)',
  bento_spotlight: 'Destaques Bento',
  split_story: 'História & Diferenciais',
  dark_glass_vault: 'Cofre Exclusivo Escuro',
  sticky_lookbook: 'Lookbook Editorial',
  coupled_media_grid: 'Portais de Categorias',
  split_curtain_portals: 'Portais de Categorias',
  embedded_banner: 'Banner & Ticket Cupom',
  scratch_reward: 'Ticket Cupom Interativo',
  open_columns_strip: 'Colunas de Confiança',
  catalog_full_grid: 'Grade do Catálogo',
  anchor_footer: 'Rodapé da Loja',
  campaign_christmas_hero: 'Hero Natal + Cupom',
  campaign_christmas_checkpoints: 'Trilha Checkpoints',
  campaign_blackfriday_hero: 'Hero Black Friday',
  campaign_blackfriday_drop: 'Drop Black Friday',
  campaign_blackfriday_terms: 'Regras do Lote',
  clinic_editorial_hero: 'Hero Consultório',
  clinic_symptom_map: 'Mapa Interativo',
  clinic_specialists_deck: 'Equipe de Especialistas',
  clinic_pricing_tiers: 'Planos Numerados',
  clinic_case_scoreboard: 'Placar Antes e Depois',
  interactive_image_text_stage: 'Palco Imagem + Texto',
  bundle_builder_calculator: 'Montador de Combo',
  calendar_delivery_slots: 'Agenda / Entregas',
  HeroSection: 'Capa da Loja',
  DifferentialsStrip: 'Faixa de Diferenciais',
  EditorialMediaSplit: 'História & Mídia',
  StepsTimeline: 'Etapas / Linha do Tempo',
  HighlightsGrid: 'Grade de Destaques',
  CatalogGrid: 'Catálogo Completo',
  InteractiveExperience: 'Simulador / Experiência',
  TestimonialsCarousel: 'Depoimentos',
  FaqAccordion: 'Perguntas Frequentes',
  ContextualFaq: 'Perguntas Frequentes',
  ComplementaryBundles: 'Kits Complementares',
  ClosingScheduleSplit: 'Horários & Atendimento',
  RichFooter: 'Rodapé',
};

const SECTION_DEFAULT_PROPS = ['bgColor', 'textAlign', 'columns', 'sectionMove', 'sectionDelete'];

function extractRect(el: HTMLElement): RectBox {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function extractReadableText(el: HTMLElement): string {
  if (el.tagName === 'IMG' || el.querySelector(':scope > img')) {
    return '';
  }
  const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return raw.slice(0, 220);
}

function parseEditProps(raw: string | null): string[] {
  if (!raw) return ['text', 'fontSize', 'textColor'];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function findInspectableTarget(
  startNode: Element | null,
  rootEl: HTMLElement | null,
): TargetRect | null {
  if (!startNode || !rootEl) return null;
  if (startNode.closest('[data-ai-inspector-hud="true"]')) return null;

  const nodeElements: Array<{
    el: HTMLElement;
    nodePath: string;
    label: string;
    editableProps: string[];
    currentImageUrl?: string;
    currentText?: string;
  }> = [];

  let sectionEl: HTMLElement | null = null;
  let sectionId = '';
  let sectionLabel = '';

  let cur: Element | null = startNode;
  while (cur && cur !== rootEl) {
    if (cur instanceof HTMLElement) {
      const atomicTestId = cur.getAttribute('data-testid') || '';
      const atomicRole = cur.getAttribute('data-atomic-role') || '';
      if (atomicTestId.startsWith('atomic-sec-')) {
        sectionEl = cur;
        sectionId = atomicTestId.replace(/^atomic-sec-/, '');
        sectionLabel = ROLE_LABELS_PT[atomicRole] || atomicRole || sectionId;
        break;
      }
      const inspectId = cur.getAttribute('data-inspect-section');
      if (inspectId) {
        const rawType = cur.getAttribute('data-inspect-type') || inspectId;
        if (rawType === 'HeaderNav') {
          cur = cur.parentElement;
          continue;
        }
        sectionEl = cur;
        sectionId = inspectId;
        sectionLabel = ROLE_LABELS_PT[rawType] || rawType;
        break;
      }

      const nodePath = cur.getAttribute('data-node-path');
      if (nodePath) {
        const nodeLabel = cur.getAttribute('data-node-label') || nodePath;
        const editProps = parseEditProps(cur.getAttribute('data-edit-props'));
        const imgEl = cur.tagName === 'IMG' ? (cur as HTMLImageElement) : cur.querySelector('img');
        const imgUrl = imgEl?.getAttribute('src') || undefined;
        nodeElements.push({
          el: cur,
          nodePath,
          label: nodeLabel,
          editableProps: editProps,
          currentImageUrl: imgUrl,
          currentText: extractReadableText(cur),
        });
      }
    }
    cur = cur.parentElement;
  }

  if (!sectionEl || !sectionId) return null;

  const sectionFirstImg = sectionEl.querySelector('img')?.getAttribute('src') || undefined;
  const sectionItem: AncestorChainItem = {
    id: sectionId,
    label: sectionLabel,
    editableProps: SECTION_DEFAULT_PROPS,
    currentImageUrl: sectionFirstImg,
    rect: extractRect(sectionEl),
  };

  // nodeElements was collected deepest -> outermost; reverse so chain goes Section -> Card -> Element
  const orderedNodes = [...nodeElements].reverse().map((n) => ({
    id: sectionId,
    nodePath: n.nodePath,
    label: n.label,
    editableProps: n.editableProps,
    currentImageUrl: n.currentImageUrl ?? sectionFirstImg,
    currentText: n.currentText,
    rect: extractRect(n.el),
  }));

  const ancestorChain: AncestorChainItem[] = [sectionItem, ...orderedNodes];
  const deepest = ancestorChain[ancestorChain.length - 1];

  return {
    id: sectionId,
    nodePath: deepest.nodePath,
    label: deepest.label,
    ancestorChain,
    editableProps: deepest.editableProps,
    currentImageUrl: deepest.currentImageUrl,
    currentText: deepest.currentText,
    ...deepest.rect,
  };
}

function deepCloneDoc(doc: FormulaV9Document): FormulaV9Document {
  return JSON.parse(JSON.stringify(doc)) as FormulaV9Document;
}

function syncSubpageIntoPages(
  doc: FormulaV9Document,
  pageFilename?: string,
): FormulaV9Document {
  if (!pageFilename || !Array.isArray(doc.pages)) return doc;
  return {
    ...doc,
    pages: doc.pages.map((pg) =>
      pg.filename === pageFilename
        ? {
            ...pg,
            sections: doc.sections,
            ...(doc.atomicBlueprint ? { atomicBlueprint: doc.atomicBlueprint } : {}),
          }
        : pg,
    ),
  };
}

function applyNodeStyleMerge(
  prevStyles: NodeStylesConfig | undefined,
  nodePath: string,
  stylePatch?: NodeStyleOverride,
  hideNodePath?: string,
  unhideAll?: boolean,
): NodeStylesConfig {
  const next: NodeStylesConfig = prevStyles ? { ...prevStyles } : {};
  const prevNodes = (next.nodes && typeof next.nodes === 'object' ? { ...next.nodes } : {}) as Record<
    string,
    NodeStyleOverride
  >;

  if (stylePatch && Object.keys(stylePatch).length > 0) {
    const existing = prevNodes[nodePath] || {};
    prevNodes[nodePath] = { ...existing, ...stylePatch };
    next.nodes = prevNodes;
  }

  let hiddenList = Array.isArray(next.hiddenNodes) ? [...next.hiddenNodes] : [];
  if (unhideAll) {
    hiddenList = [];
  } else if (hideNodePath && !hiddenList.includes(hideNodePath)) {
    hiddenList.push(hideNodePath);
  }
  next.hiddenNodes = hiddenList;
  return next;
}

function applyInlineTextToClassicConfig(
  cfg: Record<string, any>,
  nodePath: string | undefined,
  text: string,
): Record<string, any> {
  const next = { ...cfg };
  if (!nodePath || nodePath === 'hero.title' || nodePath === 'catalog.title' || nodePath === 'highlights.title' || nodePath === 'editorial.title' || nodePath === 'schedule.title') {
    next.title = text;
    return next;
  }
  if (nodePath === 'hero.subtitle' || nodePath === 'catalog.subtitle' || nodePath === 'highlights.subtitle' || nodePath === 'schedule.subtitle') {
    next.subtitle = text;
    return next;
  }
  if (nodePath === 'editorial.body') {
    next.body = text;
    return next;
  }
  if (nodePath === 'footer.tagline') {
    next.tagline = text;
    return next;
  }
  if (nodePath === 'schedule.eyebrow') {
    next.eyebrow = text;
    return next;
  }
  if (nodePath === 'schedule.whatsappHeading') {
    next.whatsappHeading = text;
    return next;
  }
  if (nodePath === 'schedule.cta') {
    next.ctaLabel = text;
    return next;
  }
  if (nodePath === 'hero.cta') {
    next.primaryCta = { ...(next.primaryCta || { href: '#catalogo' }), label: text };
    return next;
  }
  if (nodePath === 'hero.secondaryCta') {
    next.secondaryCta = { ...(next.secondaryCta || { action: 'whatsapp.send_summary' }), label: text };
    return next;
  }
  if (nodePath.startsWith('schedule.slot.') && Array.isArray(next.slots)) {
    const idx = Number(nodePath.split('.').pop());
    if (!Number.isNaN(idx) && idx >= 0 && idx < next.slots.length) {
      next.slots = next.slots.map((s: string, i: number) => (i === idx ? text : s));
    }
    return next;
  }
  if (nodePath.startsWith('differentials.item.') && Array.isArray(next.items)) {
    const parts = nodePath.split('.');
    const idx = Number(parts[2]);
    const field = parts[3];
    if (!Number.isNaN(idx) && next.items[idx]) {
      next.items = next.items.map((it: any, i: number) =>
        i === idx ? { ...it, [field === 'text' ? 'text' : 'title']: text } : it,
      );
    }
    return next;
  }
  if (nodePath.startsWith('highlights.card.') && Array.isArray(next.cards)) {
    const parts = nodePath.split('.');
    const idx = Number(parts[2]);
    const field = parts[3];
    if (!Number.isNaN(idx) && next.cards[idx]) {
      next.cards = next.cards.map((c: any, i: number) =>
        i === idx
          ? {
              ...c,
              [field === 'cta' ? 'ctaLabel' : field === 'description' ? 'description' : 'title']: text,
            }
          : c,
      );
    }
    return next;
  }
  if (nodePath.startsWith('catalog.card.') && nodePath.endsWith('.cta')) {
    next.itemActionLabel = text;
    return next;
  }
  return next;
}

function applyInlineTextToAtomicSection(
  sec: Record<string, any>,
  nodePath: string | undefined,
  text: string,
): Record<string, any> {
  const next = { ...sec };
  const slots = Array.isArray(next.textSlots) ? [...next.textSlots] : [];

  if (nodePath === 'hero.cta' || nodePath === 'section.cta') {
    next.content = { ...(next.content || {}), ctaPrimaryLabel: text.slice(0, 48) };
    return next;
  }

  if (nodePath?.startsWith('differentials.item.')) {
    const idx = Number(nodePath.split('.').pop());
    if (!Number.isNaN(idx) && slots[idx]?.micro) {
      const m = [...slots[idx].micro];
      m[2] = text;
      slots[idx] = { ...slots[idx], micro: m };
      next.textSlots = slots;
    }
    return next;
  }

  const isSubTarget =
    nodePath === 'hero.subtitle' ||
    nodePath === 'section.subtitle' ||
    nodePath === 'catalog.subtitle' ||
    nodePath === 'highlights.subtitle' ||
    nodePath === 'editorial.body';

  if (nodePath === 'editorial.body' && Array.isArray(next.content?.storyParagraphs)) {
    next.content = {
      ...(next.content || {}),
      storyParagraphs: [text, ...next.content.storyParagraphs.slice(1)],
    };
  }

  let updated = false;
  next.textSlots = slots.map((slot) => {
    const m = Array.isArray(slot?.micro) ? [...slot.micro] : null;
    if (!m) return slot;
    if (!isSubTarget && (m[1] === 'display' || m[1] === 'heading')) {
      m[2] = text.slice(0, 140);
      updated = true;
    } else if (isSubTarget && (m[1] === 'body' || m[1] === 'caption')) {
      m[2] = text.slice(0, 240);
      updated = true;
    }
    return { ...slot, micro: m };
  });

  if (!updated && !isSubTarget) {
    next.textSlots = [
      { micro: ['top_left', 'heading', text.slice(0, 140), 'ui:sz=32 wt=800', 'icon:none'], mediaPick: 'none' },
      ...next.textSlots,
    ];
  }
  return next;
}

const SURFACE_PRESETS = [
  { id: 'light' as const, label: 'Claro', bgHex: '#FFFFFF', inkHex: '#0F172A', mutedHex: '#475569', isDark: false },
  { id: 'cream' as const, label: 'Creme', bgHex: '#FBF6EE', inkHex: '#0F172A', mutedHex: '#475569', isDark: false },
  { id: 'dark' as const, label: 'Escuro', bgHex: '#18181B', inkHex: '#F8FAFC', mutedHex: '#CBD5E1', isDark: true },
];

export interface StorefrontAiInspectorProps {
  menuOpen: boolean;
  onCloseMenu: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  profile: BusinessProfile;
  formulaV9: FormulaV9Document;
  pageFilename?: string;
  creditBalance?: number | null;
  onCreditsChanged?: (balanceAfter: number) => void;
  onFormulaUpdated: (nextDoc: FormulaV9Document) => void;
}

export function StorefrontAiInspector({
  menuOpen,
  onCloseMenu,
  containerRef,
  profile,
  formulaV9,
  pageFilename,
  creditBalance = null,
  onCreditsChanged,
  onFormulaUpdated,
}: StorefrontAiInspectorProps) {
  const { showToast } = useToast();
  const [inspectActive, setInspectActive] = useState(false);
  const [hovered, setHovered] = useState<TargetRect | null>(null);
  const [selected, setSelected] = useState<TargetRect | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>('text');
  const [microTarget, setMicroTarget] = useState<'block' | 'title' | 'subtitle' | 'cta' | 'schedule' | 'group_items'>('block');
  const [selectedGroupSkus, setSelectedGroupSkus] = useState<string[]>([]);
  const [groupDisplayMode, setGroupDisplayMode] = useState<'only_selected' | 'prioritize'>('prioritize');
  const [inlineText, setInlineText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [dirTextAnchor, setDirTextAnchor] = useState<'left' | 'right' | 'center'>('left');
  const [spotLabel, setSpotLabel] = useState('01');
  const [spotHeadline, setSpotHeadline] = useState('');
  const [spotDesc, setSpotDesc] = useState('');
  const [spotX, setSpotX] = useState(38);
  const [spotY, setSpotY] = useState(44);
  const [submitting, setSubmitting] = useState(false);
  const [undoStack, setUndoStack] = useState<FormulaV9Document[]>([]);
  const [liveBalance, setLiveBalance] = useState<number | null>(creditBalance);
  const [dockSide, setDockSide] = useState<'right' | 'left'>('right');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof creditBalance === 'number') setLiveBalance(creditBalance);
  }, [creditBalance]);

  useEffect(() => {
    const onBalanceEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ balanceAfter?: number; balance?: number }>).detail;
      const next =
        typeof detail?.balanceAfter === 'number'
          ? detail.balanceAfter
          : typeof detail?.balance === 'number'
            ? detail.balance
            : null;
      if (next !== null) setLiveBalance(next);
    };
    window.addEventListener('companygen:credits-updated', onBalanceEvent);
    return () => window.removeEventListener('companygen:credits-updated', onBalanceEvent);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setInspectActive(false);
      setHovered(null);
      setSelected(null);
      return;
    }
    if (liveBalance === null) {
      authenticatedFetch('/api/credits/balance')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.balance === 'number') setLiveBalance(d.balance);
        })
        .catch(() => null);
    }
  }, [menuOpen, liveBalance]);

  const currentSectionNodeStyles = useMemo<NodeStylesConfig | undefined>(() => {
    if (!selected) return undefined;
    const atomicSec = formulaV9.atomicBlueprint?.sections?.find((s: any) => s?.tuple?.[0] === selected.id);
    if (atomicSec) {
      return (atomicSec.nodeStyles || atomicSec.content?.nodeStyles || atomicSec.config?.nodeStyles) as
        | NodeStylesConfig
        | undefined;
    }
    const classicSec = formulaV9.sections.find((s) => s.id === selected.id);
    return (classicSec?.config as { nodeStyles?: NodeStylesConfig } | undefined)?.nodeStyles;
  }, [formulaV9, selected]);

  // Sincroniza estados locais quando um novo alvo e selecionado
  useEffect(() => {
    if (!selected) return;
    setInlineText(selected.currentText || '');
    setImageUrlInput(selected.currentImageUrl || '');
    const atomicSec = formulaV9.atomicBlueprint?.sections?.find((s: any) => s?.tuple?.[0] === selected.id);
    const classicSec = formulaV9.sections.find((s) => s.id === selected.id);
    const savedSkus =
      (atomicSec?.content?.selectedSkuIds as string[] | undefined) ||
      ((classicSec?.config as { selectedSkuIds?: string[] } | undefined)?.selectedSkuIds) ||
      [];
    if (Array.isArray(savedSkus)) setSelectedGroupSkus(savedSkus);
    const savedMode =
      (atomicSec?.content?.groupDisplayMode as 'only_selected' | 'prioritize' | undefined) ||
      ((classicSec?.config as { groupDisplayMode?: 'only_selected' | 'prioritize' } | undefined)?.groupDisplayMode) ||
      'prioritize';
    setGroupDisplayMode(savedMode);

    if (selected.editableProps.includes('image') && !selected.editableProps.includes('text')) {
      setActiveTab('image');
    } else if (selected.editableProps.includes('groupFilter') && !selected.editableProps.includes('text')) {
      setActiveTab('text');
      setMicroTarget('group_items');
    }
  }, [selected?.id, selected?.nodePath]);

  // Mantem retangulo roxo alinhado apos mudancas de fonte/colunas/scroll
  useEffect(() => {
    if (!menuOpen || !selected || !containerRef.current) return;
    const syncRect = () => {
      const root = containerRef.current;
      if (!root) return;
      const secEl =
        root.querySelector(`[data-testid="atomic-sec-${selected.id}"]`) ||
        root.querySelector(`[data-inspect-section="${selected.id}"]`);
      if (!secEl) return;
      const targetEl = selected.nodePath
        ? secEl.querySelector(`[data-node-path="${CSS.escape(selected.nodePath)}"]`)
        : secEl;
      if (!(targetEl instanceof HTMLElement)) return;
      const r = targetEl.getBoundingClientRect();
      setSelected((prev) =>
        prev
          ? { ...prev, top: r.top, left: r.left, width: r.width, height: r.height }
          : null,
      );
    };
    const raf = window.requestAnimationFrame(syncRect);
    window.addEventListener('scroll', syncRect, true);
    window.addEventListener('resize', syncRect);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', syncRect, true);
      window.removeEventListener('resize', syncRect);
    };
  }, [menuOpen, formulaV9, selected?.id, selected?.nodePath, containerRef]);

  useEffect(() => {
    if (!menuOpen || !inspectActive) {
      setHovered(null);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const target = findInspectableTarget(e.target as Element | null, containerRef.current);
      setHovered(target);
    };

    const onClickCapture = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest('[data-ai-inspector-hud="true"]')) return;
      const target = findInspectableTarget(el, containerRef.current);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(target);
      setInspectActive(false);
      setHovered(null);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('click', onClickCapture, true);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [menuOpen, inspectActive, containerRef]);

  const notifyCreditsUpdated = (balanceAfter?: number) => {
    if (typeof balanceAfter !== 'number') return;
    setLiveBalance(balanceAfter);
    onCreditsChanged?.(balanceAfter);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('companygen:credits-updated', {
          detail: { balanceAfter, balance: balanceAfter },
        }),
      );
    }
  };

  const pushUndoSnapshot = (prevDoc: FormulaV9Document) => {
    setUndoStack((prev) => [...prev.slice(-19), deepCloneDoc(prevDoc)]);
  };

  const selectAncestorAt = (idx: number) => {
    if (!selected || idx < 0 || idx >= selected.ancestorChain.length) return;
    const item = selected.ancestorChain[idx];
    setSelected({
      id: item.id,
      nodePath: item.nodePath,
      label: item.label,
      ancestorChain: selected.ancestorChain.slice(0, idx + 1),
      editableProps: item.editableProps,
      currentImageUrl: item.currentImageUrl,
      currentText: item.currentText,
      ...item.rect,
    });
  };

  const stepUpLevel = () => {
    if (!selected || selected.ancestorChain.length <= 1) return;
    selectAncestorAt(selected.ancestorChain.length - 2);
  };

  const applyLocalPropPatch = (patch: PropPatchPayload): FormulaV9Document => {
    if (!selected) return formulaV9;
    const targetPath = patch.nodePath || selected.nodePath || 'section';
    const nextDoc = deepCloneDoc(formulaV9);
    const atomicSections = nextDoc.atomicBlueprint?.sections;

    // 1. Mover seção para cima / baixo (0 cr)
    if (patch.moveDirection) {
      if (Array.isArray(atomicSections) && nextDoc.atomicBlueprint) {
        const idx = atomicSections.findIndex((s: any) => s?.tuple?.[0] === selected.id);
        const swapIdx = patch.moveDirection === 'up' ? idx - 1 : idx + 1;
        if (idx >= 0 && swapIdx >= 0 && swapIdx < atomicSections.length) {
          const copy = [...atomicSections];
          [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
          nextDoc.atomicBlueprint = { ...nextDoc.atomicBlueprint, sections: copy };
        }
      } else if (Array.isArray(nextDoc.sections)) {
        const idx = nextDoc.sections.findIndex((s) => s.id === selected.id);
        const swapIdx = patch.moveDirection === 'up' ? idx - 1 : idx + 1;
        if (idx >= 0 && swapIdx >= 0 && swapIdx < nextDoc.sections.length) {
          if (nextDoc.sections[swapIdx]?.type !== 'HeaderNav') {
            const copy = [...nextDoc.sections];
            [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
            nextDoc.sections = copy;
          }
        }
      }
      return syncSubpageIntoPages(nextDoc, pageFilename);
    }

    const preset = patch.surfacePreset
      ? SURFACE_PRESETS.find((p) => p.id === patch.surfacePreset)
      : undefined;

    // 2. Atualizar secao atomica (se existir)
    if (Array.isArray(atomicSections) && nextDoc.atomicBlueprint) {
      nextDoc.atomicBlueprint = {
        ...nextDoc.atomicBlueprint,
        sections: atomicSections.map((s: any) => {
          if (s?.tuple?.[0] !== selected.id) return s;
          let updated = { ...s };
          const curStyles = (updated.nodeStyles || updated.content?.nodeStyles) as NodeStylesConfig | undefined;
          const styleToApply = preset ? { ...(patch.style || {}), bgColor: preset.bgHex, textColor: preset.inkHex } : patch.style;
          const mergedStyles = applyNodeStyleMerge(
            curStyles,
            targetPath,
            styleToApply,
            patch.hideNodePath,
            patch.unhideAll,
          );
          updated.nodeStyles = mergedStyles;
          updated.content = {
            ...(updated.content || {}),
            nodeStyles: mergedStyles,
            ...(patch.groupDisplayMode ? { groupDisplayMode: patch.groupDisplayMode } : {}),
            ...(Array.isArray(patch.selectedSkuIds) ? { selectedSkuIds: patch.selectedSkuIds } : {}),
          };
          if (preset) {
            updated.surfaceTokens = {
              ...(updated.surfaceTokens || {}),
              bgHex: preset.bgHex,
              inkHex: preset.inkHex,
              mutedHex: preset.mutedHex,
              isDark: preset.isDark,
            };
          }
          if (typeof patch.inlineText === 'string') {
            updated = applyInlineTextToAtomicSection(updated, selected.nodePath, patch.inlineText);
          }
          return updated;
        }),
      };
    }

    // 3. Atualizar secao classica
    nextDoc.sections = nextDoc.sections.map((s) => {
      if (s.id !== selected.id) return s;
      let cfg = { ...(s.config || {}) } as Record<string, any>;
      const styleToApply = preset ? { ...(patch.style || {}), bgColor: preset.bgHex, textColor: preset.inkHex } : patch.style;
      cfg.nodeStyles = applyNodeStyleMerge(
        cfg.nodeStyles as NodeStylesConfig | undefined,
        targetPath,
        styleToApply,
        patch.hideNodePath,
        patch.unhideAll,
      );
      if (patch.groupDisplayMode) cfg.groupDisplayMode = patch.groupDisplayMode;
      if (Array.isArray(patch.selectedSkuIds)) cfg.selectedSkuIds = patch.selectedSkuIds;
      if (typeof patch.inlineText === 'string') {
        cfg = applyInlineTextToClassicConfig(cfg, selected.nodePath, patch.inlineText);
      }
      return { ...s, config: cfg } as typeof s;
    });

    return syncSubpageIntoPages(nextDoc, pageFilename);
  };

  const applyLocalMutation = (
    payload: {
      action: 'patch' | 'delete' | 'change_image' | 'switch_component' | 'co_direction';
      imageUrl?: string;
      targetRole?: string;
      direction?: {
        textAnchor?: 'left' | 'right' | 'center';
        interactionMode?: string;
        hotspots?: Array<Record<string, unknown>>;
      };
    },
  ): FormulaV9Document => {
    if (!selected) return formulaV9;
    const nextDoc = deepCloneDoc(formulaV9);
    const atomicSections = nextDoc.atomicBlueprint?.sections;

    if (payload.action === 'co_direction' && payload.direction) {
      if (Array.isArray(atomicSections) && nextDoc.atomicBlueprint) {
        nextDoc.atomicBlueprint = {
          ...nextDoc.atomicBlueprint,
          sections: atomicSections.map((s: any) =>
            s?.tuple?.[0] === selected.id
              ? {
                  ...s,
                  direction: { ...(s.direction || {}), ...payload.direction },
                  ...(Array.isArray(payload.direction?.hotspots)
                    ? { content: { ...(s.content || {}), hotspots: payload.direction.hotspots } }
                    : {}),
                }
              : s,
          ),
        };
        return syncSubpageIntoPages(nextDoc, pageFilename);
      }
      const secObj = nextDoc.sections.find((s) => s.id === selected.id);
      const cfg = (secObj?.config || {}) as Record<string, any>;
      nextDoc.atomicBlueprint = {
        engineSeed: { groundMode: 'warm_linen', displayVoice: 'archivo', bodyVoice: 'manrope' },
        brandTokens: {
          archetype: 'co_directed',
          paletteSource: 'logo_extracted',
          colors: {
            primary: profile.brand?.primaryColor || '#111827',
            accent: profile.brand?.accentColor || '#C65D3B',
            neutral: '#F6F0E6',
          },
          fontPairing: 'archivo',
        },
        imageRequests: [],
        sections: nextDoc.sections.map((s) => {
          const c = (s.config || {}) as Record<string, any>;
          const isTarget = s.id === selected.id;
          return {
            tuple: [
              s.id,
              isTarget && (payload.direction?.hotspots?.length || 0) > 0
                ? 'interactive_image_text_stage'
                : s.type === 'HeroSection'
                  ? 'hero_split'
                  : 'catalog_full_grid',
              'ESTADO_2',
            ],
            surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
            layout: 'cols=12 py=56 px=24 gap=20 radOut=20',
            ...(isTarget ? { direction: payload.direction } : {}),
            textSlots: [
              { micro: ['top_left', 'heading', String(c.title || cfg.title || profile.business?.name || 'Seleção'), 'ui:sz=36 wt=800', 'icon:none'] },
              ...(c.subtitle ? [{ micro: ['top_left', 'body', String(c.subtitle), 'ui:sz=16 wt=400', 'icon:none'] }] : []),
            ],
            resolvedMedia: { imageUrl: String(c.imageUrl || selected.currentImageUrl || '') },
            content: isTarget && Array.isArray(payload.direction?.hotspots) ? { hotspots: payload.direction.hotspots } : {},
          };
        }),
      };
      return syncSubpageIntoPages(nextDoc, pageFilename);
    }

    if (payload.action === 'delete') {
      if (Array.isArray(atomicSections) && atomicSections.length > 2 && nextDoc.atomicBlueprint) {
        nextDoc.atomicBlueprint = {
          ...nextDoc.atomicBlueprint,
          sections: atomicSections.filter((s: any) => s?.tuple?.[0] !== selected.id),
        };
      } else {
        nextDoc.sections = nextDoc.sections.filter((s) => s.id !== selected.id);
      }
      return syncSubpageIntoPages(nextDoc, pageFilename);
    }

    if (payload.action === 'change_image' && payload.imageUrl) {
      const nextUrl = payload.imageUrl;
      if (Array.isArray(atomicSections) && nextDoc.atomicBlueprint) {
        nextDoc.atomicBlueprint = {
          ...nextDoc.atomicBlueprint,
          sections: atomicSections.map((s: any) =>
            s?.tuple?.[0] === selected.id
              ? { ...s, resolvedMedia: { ...(s.resolvedMedia || {}), imageUrl: nextUrl } }
              : s,
          ),
        };
      }
      nextDoc.sections = nextDoc.sections.map((s) => {
        if (s.id !== selected.id) return s;
        const cfg = { ...(s.config || {}) } as Record<string, any>;
        if (Array.isArray(cfg.cards)) {
          const cardMatch = selected.nodePath?.match(/highlights\.card\.(\d+)/);
          const cardIdx = cardMatch ? Number(cardMatch[1]) : 0;
          cfg.cards = cfg.cards.map((c: any, idx: number) => (idx === cardIdx ? { ...c, imageUrl: nextUrl } : c));
        } else {
          cfg.imageUrl = nextUrl;
        }
        return { ...s, config: cfg } as typeof s;
      });
      return syncSubpageIntoPages(nextDoc, pageFilename);
    }

    if (payload.action === 'switch_component' && payload.targetRole) {
      const targetRole = payload.targetRole;
      if (Array.isArray(atomicSections) && nextDoc.atomicBlueprint) {
        nextDoc.atomicBlueprint = {
          ...nextDoc.atomicBlueprint,
          sections: atomicSections.map((s: any) =>
            s?.tuple?.[0] === selected.id
              ? { ...s, tuple: [selected.id, targetRole, s?.tuple?.[2] || 'ESTADO_2'] }
              : s,
          ),
        };
        return syncSubpageIntoPages(nextDoc, pageFilename);
      }
      nextDoc.atomicBlueprint = {
        engineSeed: { groundMode: 'warm_linen', displayVoice: 'archivo', bodyVoice: 'manrope' },
        brandTokens: {
          archetype: 'campaign_morphed',
          paletteSource: 'logo_extracted',
          colors: {
            primary: profile.brand?.primaryColor || '#18181B',
            accent: profile.brand?.accentColor || '#C65D3B',
            neutral: '#F6F0E6',
          },
          fontPairing: 'geometric_bold',
        },
        imageRequests: [],
        sections: (
          nextDoc.sections.length > 0
            ? nextDoc.sections.map((s) => {
                const cfg = (s.config || {}) as Record<string, any>;
                const isTarget = s.id === selected.id;
                return {
                  tuple: [
                    s.id,
                    isTarget ? targetRole : s.type === 'HeroSection' ? 'hero_stage' : 'catalog_grid',
                    'ESTADO_2',
                  ],
                  surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
                  layout: 'cols=12 py=56 px=24 gap=20 radOut=20',
                  textSlots: [
                    {
                      micro: [
                        'top_left',
                        'heading',
                        String(cfg.title || (isTarget ? ROLE_LABELS_PT[targetRole] : profile.business?.name) || 'Seleção Especial'),
                        'ui:sz=32 wt=800',
                        'icon:none',
                      ],
                    },
                    ...(cfg.subtitle
                      ? [{ micro: ['top_left', 'body', String(cfg.subtitle), 'ui:sz=16 wt=400', 'icon:none'] }]
                      : []),
                  ],
                  resolvedMedia: { imageUrl: String(cfg.imageUrl || '') },
                  content: { couponCode: 'NATAL20', discountPercent: 20 },
                };
              })
            : [
                {
                  tuple: [selected.id, targetRole, 'ESTADO_2'],
                  surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
                  layout: 'cols=12 py=56 px=24 gap=20 radOut=20',
                  textSlots: [
                    {
                      micro: ['top_left', 'heading', `${ROLE_LABELS_PT[targetRole] || 'Seleção Especial'}`, 'ui:sz=30 wt=800', 'icon:none'],
                    },
                  ],
                  content: { couponCode: 'NATAL20', discountPercent: 20 },
                },
              ]
        ),
      };
      return syncSubpageIntoPages(nextDoc, pageFilename);
    }

    return nextDoc;
  };

  const dispatchPropPatch = async (patch: PropPatchPayload, successMsg = 'Ajuste visual aplicado (0 cr · Grátis)!') => {
    if (!selected || submitting) return;
    const prevSnapshot = deepCloneDoc(formulaV9);
    const localDoc = applyLocalPropPatch(patch);
    pushUndoSnapshot(prevSnapshot);
    onFormulaUpdated(localDoc);
    showToast({ type: 'success', message: successMsg });

    if (patch.hideNodePath && patch.hideNodePath === selected.nodePath) {
      stepUpLevel();
    }

    // Sincronizacao gratuita (0 cr) com backend sem bloquear o preview
    try {
      const targetSec = localDoc.sections.find((s) => s.id === selected.id);
      const targetAtomic = localDoc.atomicBlueprint?.sections?.find((s: any) => s?.tuple?.[0] === selected.id);
      await authenticatedFetch('/api/store-molde/patch-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: selected.id,
          action: 'prop_patch',
          costCredits: 0,
          pageFilename,
          nodePath: patch.nodePath || selected.nodePath,
          propPatch: patch,
          config: targetSec?.config,
          nodeStyles: targetAtomic?.nodeStyles || targetSec?.config && (targetSec.config as Record<string, unknown>).nodeStyles,
          groupDisplayMode: patch.groupDisplayMode,
          selectedSkuIds: patch.selectedSkuIds,
          profile,
        }),
      }).catch(() => null);
    } catch {
      // Persistencia local ja aplicada com 0 cr
    }
  };

  const dispatchAction = async (
    action: 'patch' | 'delete' | 'change_image' | 'switch_component' | 'co_direction' | 'group_items',
    extra?: {
      imageUrl?: string;
      targetRole?: string;
      imagePrompt?: string;
      microTarget?: string;
      selectedSkuIds?: string[];
      groupDisplayMode?: 'only_selected' | 'prioritize';
      costCredits?: number;
      direction?: {
        textAnchor?: 'left' | 'right' | 'center';
        typoScale?: 'refined_lg' | 'editorial_xxl' | 'poster_mega';
        interactionMode?: string;
        hotspots?: Array<Record<string, unknown>>;
      };
    },
  ) => {
    if (!selected || submitting) return;
    if (action === 'patch' && !instruction.trim()) {
      showToast({ type: 'amber', message: 'Descreva o que deseja alterar neste elemento.' });
      return;
    }
    if (action === 'group_items' && (!extra?.selectedSkuIds || extra.selectedSkuIds.length === 0)) {
      showToast({ type: 'amber', message: 'Marque pelo menos 1 item para destacar neste bloco.' });
      return;
    }
    if (action === 'change_image' && !extra?.imageUrl && !extra?.imagePrompt) {
      showToast({ type: 'amber', message: 'Envie uma imagem, cole uma URL ou descreva a arte para a IA.' });
      return;
    }

    const isAiImageGen = action === 'change_image' && !extra?.imageUrl && Boolean(extra?.imagePrompt);
    const isMicroAi = action === 'patch' && (Boolean(selected.nodePath) || (extra?.microTarget || microTarget) !== 'block');
    const resolvedCost =
      typeof extra?.costCredits === 'number'
        ? extra.costCredits
        : action === 'delete' || action === 'group_items' || (action === 'change_image' && Boolean(extra?.imageUrl)) || action === 'co_direction'
          ? 0
          : isAiImageGen
            ? 1
            : action === 'switch_component'
              ? 1.5
              : isMicroAi
                ? 0.5
                : 1;

    const prevSnapshot = deepCloneDoc(formulaV9);
    setSubmitting(true);
    try {
      const res = await authenticatedFetch('/api/store-molde/patch-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: selected.id,
          action,
          costCredits: resolvedCost,
          pageFilename,
          nodePath: selected.nodePath,
          microTarget: extra?.microTarget || microTarget,
          selectedSkuIds: extra?.selectedSkuIds,
          groupDisplayMode: extra?.groupDisplayMode || groupDisplayMode,
          instruction: instruction.trim(),
          imageUrl: extra?.imageUrl,
          imagePrompt: extra?.imagePrompt,
          targetRole: extra?.targetRole,
          direction: extra?.direction,
          profile,
        }),
      });
      const data = await res.json().catch(() => null);
      if (typeof data?.balanceAfter === 'number') {
        notifyCreditsUpdated(data.balanceAfter);
      }
      if (!res.ok) {
        throw new Error(String(data?.error || data?.message || 'Não foi possível aplicar a edição agora.'));
      }
      if (isAiImageGen && !data?.imageUrl && !data?.formulasIr && !data?.formulaIr) {
        throw new Error('O motor de imagem não retornou uma URL válida. Seus créditos não foram cobrados.');
      }

      let nextDoc = (data?.formulasIr || data?.formulaIr) as FormulaV9Document | undefined;
      if (nextDoc && action === 'group_items') {
        // Garante groupDisplayMode sincronizado mesmo se backend persistiu apenas selectedSkuIds
        const modeToApply = extra?.groupDisplayMode || groupDisplayMode;
        const cloned = deepCloneDoc(nextDoc);
        cloned.sections = cloned.sections.map((s) =>
          s.id === selected.id ? { ...s, config: { ...(s.config || {}), groupDisplayMode: modeToApply } as any } : s,
        );
        if (cloned.atomicBlueprint?.sections) {
          cloned.atomicBlueprint.sections = cloned.atomicBlueprint.sections.map((s: any) =>
            s?.tuple?.[0] === selected.id
              ? { ...s, content: { ...(s.content || {}), groupDisplayMode: modeToApply } }
              : s,
          );
        }
        nextDoc = syncSubpageIntoPages(cloned, pageFilename);
      }

      if (nextDoc) {
        pushUndoSnapshot(prevSnapshot);
        onFormulaUpdated(nextDoc);
      } else if (!isAiImageGen && action !== 'patch') {
        const localDoc =
          action === 'group_items'
            ? applyLocalPropPatch({ selectedSkuIds: extra?.selectedSkuIds, groupDisplayMode: extra?.groupDisplayMode || groupDisplayMode })
            : applyLocalMutation({ action, imageUrl: extra?.imageUrl, targetRole: extra?.targetRole, direction: extra?.direction });
        pushUndoSnapshot(prevSnapshot);
        onFormulaUpdated(localDoc);
      }

      showToast({
        type: 'success',
        message:
          action === 'delete'
            ? 'Bloco removido com sucesso (0 cr · Grátis)!'
            : action === 'change_image'
              ? isAiImageGen
                ? `Arte conceitual aplicada (${data?.debited ?? 1} cr)!`
                : 'Imagem atualizada na vitrine (0 cr · Grátis)!'
              : action === 'co_direction'
                ? 'Direção imagem + texto sincronizada (0 cr · Grátis)!'
                : action === 'group_items'
                  ? `Grupo de ${extra?.selectedSkuIds?.length || 0} item(ns) aplicado (0 cr · Grátis)!`
                  : action === 'switch_component'
                    ? `Componente transformado ao vivo (${data?.debited ?? 1.5} cr)!`
                    : `Alteração aplicada pela IA (${data?.debited ?? resolvedCost} cr)!`,
      });
      if (action === 'delete') setSelected(null);
      if (action === 'patch') setInstruction('');
      if (isAiImageGen) setImagePrompt('');
    } catch (err) {
      if (action === 'patch' || isAiImageGen || action === 'switch_component') {
        // Nunca fingir grafico ou texto quando IA falha; 0 cr cobrado
        showToast({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Não foi possível concluir a operação via IA. Seus créditos não foram cobrados.',
        });
      } else {
        const localDoc =
          action === 'group_items'
            ? applyLocalPropPatch({ selectedSkuIds: extra?.selectedSkuIds, groupDisplayMode: extra?.groupDisplayMode || groupDisplayMode })
            : applyLocalMutation({ action, imageUrl: extra?.imageUrl, targetRole: extra?.targetRole, direction: extra?.direction });
        pushUndoSnapshot(prevSnapshot);
        onFormulaUpdated(localDoc);
        showToast({
          type: 'success',
          message:
            action === 'delete'
              ? 'Bloco removido nesta prévia (0 cr · Grátis)!'
              : action === 'change_image'
                ? 'Imagem aplicada na prévia (0 cr · Grátis)!'
                : action === 'group_items'
                  ? 'Grupo de itens aplicado na prévia (0 cr · Grátis)!'
                  : 'Direção aplicada na prévia (0 cr · Grátis)!',
        });
        if (action === 'delete') setSelected(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || submitting) return;
    const prevDoc = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    onFormulaUpdated(syncSubpageIntoPages(prevDoc, pageFilename));
    showToast({ type: 'success', message: 'Última alteração desfeita (0 cr · Grátis).' });
    try {
      await authenticatedFetch('/api/store-molde/patch-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: selected?.id || prevDoc.sections?.[0]?.id || 'undo',
          action: 'restore_snapshot',
          costCredits: 0,
          pageFilename,
          snapshot: prevDoc,
          profile,
        }),
      }).catch(() => null);
    } catch {
      // Rollback local ja concluido sem custo
    }
  };

  const handleLocalFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrlInput(reader.result);
        void dispatchAction('change_image', { imageUrl: reader.result, costCredits: 0 });
      }
    };
    reader.readAsDataURL(file);
  };

  const activeBox = hovered || selected;
  const activeNodePath = selected?.nodePath || 'section';
  const currentNodeStyle = (currentSectionNodeStyles?.nodes?.[activeNodePath] || {}) as NodeStyleOverride;
  const hiddenCount = Array.isArray(currentSectionNodeStyles?.hiddenNodes)
    ? currentSectionNodeStyles.hiddenNodes.length
    : 0;
  const isMicroAiContext = Boolean(selected?.nodePath) || microTarget !== 'block';
  const aiTextCost = isMicroAiContext ? 0.5 : 1;
  const canStepUp = Boolean(selected && selected.ancestorChain.length > 1);
  const canInlineText = Boolean(selected?.editableProps.includes('text') || selected?.currentText);
  const showColumnsControl = Boolean(
    selected?.editableProps.includes('columns') ||
      selected?.nodePath?.endsWith('.grid') ||
      !selected?.nodePath,
  );

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {menuOpen && activeBox ? (
          <m.div
            key={`aura-${activeBox.id}-${activeBox.nodePath || 'sec'}`}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-none fixed z-[75] overflow-hidden rounded-xl"
            style={{
              top: `${Math.max(4, activeBox.top)}px`,
              left: `${Math.max(4, activeBox.left)}px`,
              width: `${Math.max(24, activeBox.width)}px`,
              height: `${Math.max(24, activeBox.height)}px`,
              border: '2.5px solid #A855F7',
              backgroundColor: 'rgba(168, 85, 247, 0.09)',
              boxShadow:
                '0 0 0 4px rgba(168, 85, 247, 0.24), 0 0 40px rgba(147, 51, 234, 0.55), inset 0 0 28px rgba(192, 132, 252, 0.2)',
            }}
          >
            <m.div
              animate={{ x: ['-100%', '220%'] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-purple-400/20 to-transparent"
            />
            <span
              className={`pointer-events-none absolute left-0 z-20 inline-flex max-w-[92vw] items-center gap-1.5 truncate bg-[#7E22CE] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm ${
                activeBox.top > 28 ? '-top-6 rounded-t-lg' : '-bottom-6 rounded-b-lg'
              }`}
            >
              <span className="truncate">
                {selected
                  ? `Selecionado · ${activeBox.ancestorChain.map((c) => c.label).join(' › ')}`
                  : `Inspecionar: ${activeBox.ancestorChain.map((c) => c.label).join(' › ')}`}
              </span>
            </span>
          </m.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen ? (
          <m.aside
            key="ai-inspector-hud"
            data-ai-inspector-hud="true"
            data-testid="ai-inspector-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-4 z-[85] max-h-[82vh] w-[372px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22)] ${
              dockSide === 'left' ? 'left-4 sm:left-5' : 'right-4 sm:right-5'
            }`}
          >
            {/* Header com Saldo ao Vivo + Trocar Lado + Desfazer */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-slate-950">Editor visual</p>
                  {typeof liveBalance === 'number' ? (
                    <span
                      data-testid="ai-inspector-balance-pill"
                      className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-800"
                    >
                      Saldo: {liveBalance} cr
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-500">Clique em qualquer elemento, card ou seção</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="ai-inspector-flip-side-btn"
                  onClick={() => setDockSide((s) => (s === 'right' ? 'left' : 'right'))}
                  title="Alternar lado do editor na tela"
                  className="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {dockSide === 'right' ? '← Esq' : 'Dir →'}
                </button>
                <button
                  type="button"
                  data-testid="ai-inspector-undo-btn"
                  disabled={undoStack.length === 0 || submitting}
                  onClick={() => void handleUndo()}
                  title="Desfazer última alteração (0 cr · Grátis)"
                  className="inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-45"
                >
                  <ArrowUUpLeft className="size-3.5 shrink-0" />
                  <span>Desfazer</span>
                  <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">0 cr</span>
                </button>
                <button
                  type="button"
                  onClick={onCloseMenu}
                  aria-label="Fechar painel de IA"
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="size-4" weight="regular" />
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <button
                type="button"
                data-testid="ai-inspector-toggle-btn"
                onClick={() => {
                  setSelected(null);
                  setInspectActive((v) => !v);
                }}
                className={`flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-all ${
                  inspectActive
                    ? 'bg-purple-700 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Crosshair className="size-4" weight="regular" aria-hidden="true" />
                <span>{inspectActive ? 'Clique no elemento da página' : 'Inspecionar elemento na tela'}</span>
              </button>

              {inspectActive && !selected ? (
                <p className="rounded-xl border border-purple-200 bg-purple-50/70 px-3 py-2 text-[11px] leading-relaxed text-purple-950">
                  Passe o cursor sobre títulos, imagens, cards, botões ou seções inteiras e clique para editar propriedades grátis (0 cr) ou usar IA.
                </p>
              ) : null}

              {selected ? (
                <div
                  data-testid="ai-inspector-selected-card"
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  {/* Breadcrumb de ancestrais + Subir nivel */}
                  <div className="space-y-1.5">
                    <div
                      data-testid="ai-inspector-breadcrumb"
                      className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-slate-500"
                    >
                      {selected.ancestorChain.map((crumb, idx) => {
                        const isLast = idx === selected.ancestorChain.length - 1;
                        return (
                          <React.Fragment key={`${crumb.id}-${crumb.nodePath || 'sec'}`}>
                            {idx > 0 ? <span className="text-slate-400">›</span> : null}
                            <button
                              type="button"
                              onClick={() => selectAncestorAt(idx)}
                              className={`rounded px-1 py-0.5 transition-colors ${
                                isLast
                                  ? 'bg-purple-100 text-purple-900 font-bold'
                                  : 'hover:bg-slate-200 hover:text-slate-900'
                              }`}
                            >
                              {crumb.label}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {canStepUp ? (
                          <button
                            type="button"
                            data-testid="ai-inspector-step-up-btn"
                            onClick={stepUpLevel}
                            className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-2 py-1 text-[10px] font-semibold text-purple-800 hover:bg-purple-50"
                          >
                            <span>↑ Subir nível (Bloco/Seção)</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(null);
                            setInspectActive(true);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-950"
                        >
                          Trocar alvo
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {selected.nodePath ? (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              void dispatchPropPatch(
                                { hideNodePath: selected.nodePath },
                                'Elemento ocultado (0 cr · Grátis).',
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <EyeSlash className="size-3" />
                            <span>Ocultar · 0 cr</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          data-testid="ai-inspector-delete-btn"
                          disabled={submitting}
                          onClick={() => void dispatchAction('delete', { costCredits: 0 })}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash className="size-3" weight="regular" />
                          <span>Excluir · 0 cr</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Abas */}
                  <div className="grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    {[
                      { id: 'text' as const, label: 'Texto', icon: PencilSimple },
                      { id: 'image' as const, label: 'Imagem', icon: ImageIcon },
                      { id: 'direction' as const, label: 'Estilo', icon: SlidersHorizontal },
                      { id: 'component' as const, label: 'Bloco', icon: SquaresFour },
                    ].map((t) => {
                      const Icon = t.icon;
                      const active = activeTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-testid={`ai-inspector-tab-${t.id}`}
                          onClick={() => setActiveTab(t.id)}
                          className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                            active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'
                          }`}
                        >
                          <Icon className="size-3.5" weight="regular" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {activeTab === 'text' ? (
                    <div className="space-y-3">
                      {canInlineText && microTarget !== 'group_items' ? (
                        <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                              Edição direta do texto
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              0 cr · Grátis
                            </span>
                          </div>
                          <input
                            type="text"
                            data-testid="ai-inspector-prop-text-input"
                            value={inlineText}
                            onChange={(e) => setInlineText(e.target.value)}
                            placeholder="Digite o texto exato para aplicar na hora..."
                            className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-2.5 text-xs text-slate-950 focus:border-emerald-600 focus:outline-none"
                          />
                          <button
                            type="button"
                            data-testid="ai-inspector-prop-text-btn"
                            disabled={submitting || !inlineText.trim()}
                            onClick={() =>
                              void dispatchPropPatch(
                                { nodePath: selected.nodePath, inlineText: inlineText.trim() },
                                'Texto atualizado direto na página (0 cr · Grátis)!',
                              )
                            }
                            className="inline-flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check className="size-3.5" weight="bold" />
                            <span>Salvar texto direto · 0 cr · Grátis</span>
                          </button>
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Alvo ou grupo da seção
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              ['block', 'Bloco todo'],
                              ['title', 'Título'],
                              ['subtitle', 'Subtítulo'],
                              ['cta', 'Botão CTA'],
                              ['schedule', 'Horários / Dias'],
                              ['group_items', 'Selecionar Itens (Grupo)'],
                            ] as const
                          ).map(([targetKey, targetLabel]) => (
                            <button
                              key={targetKey}
                              type="button"
                              data-testid={`ai-inspector-micro-${targetKey}`}
                              onClick={() => setMicroTarget(targetKey)}
                              className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                                microTarget === targetKey
                                  ? 'bg-slate-950 text-white'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                              }`}
                            >
                              {targetLabel}
                            </button>
                          ))}
                        </div>
                      </div>

                      {microTarget === 'group_items' ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-800">
                              Grupo de itens ({selectedGroupSkus.length} selecionados)
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupSkus([])}
                              className="text-[10px] font-semibold text-slate-500 hover:text-slate-950"
                            >
                              Limpar
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                              type="button"
                              data-testid="ai-group-mode-only-selected"
                              onClick={() => {
                                setGroupDisplayMode('only_selected');
                                if (selectedGroupSkus.length > 0) {
                                  void dispatchPropPatch(
                                    { groupDisplayMode: 'only_selected', selectedSkuIds: selectedGroupSkus },
                                    'Mostrando somente os itens selecionados (0 cr · Grátis).',
                                  );
                                }
                              }}
                              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                                groupDisplayMode === 'only_selected'
                                  ? 'bg-slate-950 text-white'
                                  : 'text-slate-600 hover:text-slate-950'
                              }`}
                            >
                              Mostrar somente selecionados
                            </button>
                            <button
                              type="button"
                              data-testid="ai-group-mode-prioritize"
                              onClick={() => {
                                setGroupDisplayMode('prioritize');
                                if (selectedGroupSkus.length > 0) {
                                  void dispatchPropPatch(
                                    { groupDisplayMode: 'prioritize', selectedSkuIds: selectedGroupSkus },
                                    'Itens selecionados destacados no topo (0 cr · Grátis).',
                                  );
                                }
                              }}
                              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                                groupDisplayMode === 'prioritize'
                                  ? 'bg-slate-950 text-white'
                                  : 'text-slate-600 hover:text-slate-950'
                              }`}
                            >
                              Destacar no topo
                            </button>
                          </div>

                          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                            {(Array.isArray(profile.catalog?.products) ? profile.catalog.products : []).map((prod, idx) => {
                              const skuKey = String(prod.id || prod.sku || prod.name || idx);
                              const checked = selectedGroupSkus.includes(skuKey);
                              return (
                                <label
                                  key={skuKey}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                                    checked
                                      ? 'border-slate-950 bg-slate-50 text-slate-950'
                                      : 'border-slate-200/80 bg-white text-slate-600'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setSelectedGroupSkus((prev) =>
                                        prev.includes(skuKey)
                                          ? prev.filter((item) => item !== skuKey)
                                          : [...prev, skuKey],
                                      )
                                    }
                                    className="h-3.5 w-3.5 rounded accent-slate-950"
                                  />
                                  <span className="truncate font-medium">{prod.name}</span>
                                </label>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            data-testid="ai-inspector-apply-group-btn"
                            disabled={submitting || selectedGroupSkus.length === 0}
                            onClick={() =>
                              void dispatchAction('group_items', {
                                selectedSkuIds: selectedGroupSkus,
                                groupDisplayMode,
                                costCredits: 0,
                              })
                            }
                            className="inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            <span>{submitting ? 'Aplicando...' : 'Aplicar Grupo Selecionado'}</span>
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              0 cr · Grátis
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {isMicroAiContext ? 'Reescrita rápida com IA' : 'Reestruturação completa com IA'}
                            </span>
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                              {aiTextCost} cr
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            data-testid="ai-inspector-prompt-input"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="Ex: Mostrar dia a dia (Seg a Dom), deixar título direto ou destacar garantia..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-950 placeholder:text-slate-400 focus:border-slate-950 focus:outline-none"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              'Centralizar texto + fonte chamativa',
                              'Colocar componente mais avançado',
                              'Mostrar dia a dia (Seg a Dom)',
                              'Enfatizar Pix à vista',
                            ].map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => setInstruction(chip)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:border-slate-400 hover:text-slate-950"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Aviso: esta ação com IA consome {aiTextCost} cr somente após sucesso (0 cr se falhar).
                          </p>
                          <button
                            type="button"
                            data-testid="ai-inspector-apply-btn"
                            disabled={submitting}
                            onClick={() => void dispatchAction('patch', { costCredits: aiTextCost })}
                            className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Sparkle className="size-3.5" weight="fill" />
                            <span>{submitting ? 'Aplicando...' : `Aplicar com IA · ${aiTextCost} cr`}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === 'image' ? (
                    <div className="space-y-2.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        data-testid="ai-inspector-image-file-input"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLocalFileUpload(f);
                          e.target.value = '';
                        }}
                      />
                      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                            Enviar foto ou link direto
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            0 cr · Grátis
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <UploadSimple className="size-3.5" weight="regular" />
                          <span>Enviar foto do computador · 0 cr · Grátis</span>
                        </button>
                        <input
                          type="url"
                          data-testid="ai-inspector-image-url-input"
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          placeholder="Ou cole o link da imagem..."
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-950 placeholder:text-slate-400 focus:border-slate-950 focus:outline-none"
                        />
                        {imageUrlInput.trim() ? (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              void dispatchAction('change_image', {
                                imageUrl: imageUrlInput.trim(),
                                costCredits: 0,
                              })
                            }
                            className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check className="size-3.5" weight="bold" />
                            <span>Aplicar imagem · 0 cr · Grátis</span>
                          </button>
                        ) : null}
                      </div>

                      <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/40 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-purple-900">
                            Gerar arte conceitual de categoria com IA
                          </span>
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                            1 cr
                          </span>
                        </div>
                        <input
                          type="text"
                          data-testid="ai-inspector-image-prompt-input"
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                          placeholder="Descreva a arte conceitual ou cena da loja..."
                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-950 placeholder:text-slate-400 focus:border-slate-950 focus:outline-none"
                        />
                        <p className="text-[10px] text-slate-500">
                          Aviso: gerar arte conceitual por IA consome 1 cr após sucesso (0 cr em caso de erro).
                        </p>
                        <button
                          type="button"
                          data-testid="ai-inspector-apply-image-btn"
                          disabled={submitting}
                          onClick={() =>
                            void dispatchAction('change_image', {
                              imageUrl: imagePrompt.trim() ? undefined : imageUrlInput.trim() || undefined,
                              imagePrompt: imagePrompt.trim() || undefined,
                              costCredits: imagePrompt.trim() ? 1 : 0,
                            })
                          }
                          className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Sparkle className="size-3.5" weight="fill" />
                          <span>
                            {submitting
                              ? 'Aplicando...'
                              : imagePrompt.trim()
                                ? 'Gerar arte com IA · 1 cr'
                                : 'Aplicar imagem · 0 cr · Grátis'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'direction' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5">
                        <span className="text-[10px] font-bold text-emerald-900">
                          Propriedades visuais diretas
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700">0 cr · Grátis</span>
                      </div>

                      {/* Tamanho da fonte P / M / G / GG */}
                      <div>
                        <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">
                          Tamanho da fonte · 0 cr · Grátis
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              { label: 'P', px: 14 },
                              { label: 'M', px: 18 },
                              { label: 'G', px: 28 },
                              { label: 'GG', px: 40 },
                            ] as const
                          ).map((sz) => (
                            <button
                              key={sz.label}
                              type="button"
                              onClick={() =>
                                void dispatchPropPatch(
                                  { nodePath: activeNodePath, style: { fontSizePx: sz.px } },
                                  `Tamanho ${sz.label} (${sz.px}px) aplicado (0 cr · Grátis)!`,
                                )
                              }
                              className={`rounded-lg border py-1.5 text-[11px] font-bold transition ${
                                currentNodeStyle.fontSizePx === sz.px
                                  ? 'border-slate-950 bg-slate-950 text-white'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                              }`}
                            >
                              {sz.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Alinhamento Left / Center / Right */}
                      <div>
                        <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">
                          Alinhamento · 0 cr · Grátis
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'left', label: 'Esquerda' },
                              { id: 'center', label: 'Centro' },
                              { id: 'right', label: 'Direita' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`ai-direction-anchor-${opt.id}`}
                              onClick={() => {
                                setDirTextAnchor(opt.id);
                                if (selected.nodePath) {
                                  void dispatchPropPatch(
                                    { nodePath: activeNodePath, style: { textAlign: opt.id } },
                                    `Alinhamento ${opt.label} aplicado (0 cr · Grátis)!`,
                                  );
                                } else {
                                  void dispatchPropPatch(
                                    { nodePath: 'section', style: { textAlign: opt.id } },
                                    `Alinhamento ${opt.label} aplicado (0 cr · Grátis)!`,
                                  );
                                  void dispatchAction('co_direction', { direction: { textAnchor: opt.id }, costCredits: 0 });
                                }
                              }}
                              className={`rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${
                                (currentNodeStyle.textAlign || dirTextAnchor) === opt.id
                                  ? 'border-slate-950 bg-slate-950 text-white'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Colunas 1-4 */}
                      {showColumnsControl ? (
                        <div>
                          <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">
                            Colunas na grade · 0 cr · Grátis
                          </span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {([1, 2, 3, 4] as const).map((cols) => (
                              <button
                                key={cols}
                                type="button"
                                onClick={() =>
                                  void dispatchPropPatch(
                                    {
                                      nodePath: selected.nodePath?.endsWith('.grid')
                                        ? selected.nodePath
                                        : 'catalog.grid',
                                      style: { columns: cols },
                                    },
                                    `Grade ajustada para ${cols} coluna(s) (0 cr · Grátis)!`,
                                  )
                                }
                                className={`rounded-lg border py-1.5 text-[11px] font-bold transition ${
                                  currentNodeStyle.columns === cols
                                    ? 'border-slate-950 bg-slate-950 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                                }`}
                              >
                                {cols} col
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Superficie Claro / Creme / Escuro */}
                      <div>
                        <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">
                          Superfície da seção · 0 cr · Grátis
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {SURFACE_PRESETS.map((surf) => (
                            <button
                              key={surf.id}
                              type="button"
                              onClick={() =>
                                void dispatchPropPatch(
                                  { nodePath: 'section', surfacePreset: surf.id },
                                  `Superfície ${surf.label} aplicada (0 cr · Grátis)!`,
                                )
                              }
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-800 hover:border-slate-950"
                            >
                              <span
                                className="size-3 shrink-0 rounded-full border border-slate-400/70 shadow-xs"
                                style={{ backgroundColor: surf.bgHex }}
                              />
                              <span>{surf.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mover secao para cima / baixo + restaurar ocultos */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchPropPatch(
                              { moveDirection: 'up' },
                              'Seção movida para cima (0 cr · Grátis)!',
                            )
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-950"
                        >
                          <ArrowUp className="size-3.5" />
                          <span>Mover ↑ · 0 cr</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchPropPatch(
                              { moveDirection: 'down' },
                              'Seção movida para baixo (0 cr · Grátis)!',
                            )
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-950"
                        >
                          <ArrowDown className="size-3.5" />
                          <span>Mover ↓ · 0 cr</span>
                        </button>
                      </div>

                      {hiddenCount > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchPropPatch(
                              { unhideAll: true },
                              'Elementos ocultos restaurados (0 cr · Grátis)!',
                            )
                          }
                          className="w-full rounded-lg border border-amber-200 bg-amber-50 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Mostrar {hiddenCount} elemento(s) oculto(s) · 0 cr · Grátis
                        </button>
                      ) : null}

                      {/* Tamanho tipografico editorial + Pontos clicaveis */}
                      <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                        <span className="block text-[11px] font-semibold text-slate-600">
                          Escala editorial · 0 cr · Grátis
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'refined_lg', label: 'Padrão' },
                              { id: 'editorial_xxl', label: 'Grande' },
                              { id: 'poster_mega', label: 'Gigante' },
                            ] as const
                          ).map((sc) => (
                            <button
                              key={sc.id}
                              type="button"
                              data-testid={`ai-direction-scale-${sc.id}`}
                              onClick={() =>
                                void dispatchAction('co_direction', { direction: { typoScale: sc.id }, costCredits: 0 })
                              }
                              className="rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-950 hover:text-slate-950"
                            >
                              {sc.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                        <span className="block text-[11px] font-semibold text-slate-600">
                          Adicionar ponto clicável na foto · 0 cr · Grátis
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          <input
                            type="text"
                            data-testid="ai-hotspot-label-input"
                            value={spotLabel}
                            onChange={(e) => setSpotLabel(e.target.value.slice(0, 8))}
                            placeholder="01"
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-950"
                          />
                          <input
                            type="number"
                            min={10}
                            max={90}
                            value={spotX}
                            onChange={(e) => setSpotX(Number(e.target.value))}
                            placeholder="X%"
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-950"
                          />
                          <input
                            type="number"
                            min={10}
                            max={90}
                            value={spotY}
                            onChange={(e) => setSpotY(Number(e.target.value))}
                            placeholder="Y%"
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-950"
                          />
                        </div>
                        <input
                          type="text"
                          data-testid="ai-hotspot-headline-input"
                          value={spotHeadline}
                          onChange={(e) => setSpotHeadline(e.target.value)}
                          placeholder="Título do ponto (ex: Costura dupla)"
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-950 placeholder:text-slate-400"
                        />
                        <input
                          type="text"
                          data-testid="ai-hotspot-desc-input"
                          value={spotDesc}
                          onChange={(e) => setSpotDesc(e.target.value)}
                          placeholder="Descrição curta ao clicar..."
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-950 placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          data-testid="ai-add-hotspot-btn"
                          onClick={() => {
                            const nextSpot = {
                              id: `spot_${Date.now().toString(36)}`,
                              xPct: Math.max(10, Math.min(90, spotX)),
                              yPct: Math.max(10, Math.min(90, spotY)),
                              pinLabel: spotLabel.trim() || '01',
                              headline: spotHeadline.trim() || 'Detalhe em destaque',
                              description: spotDesc.trim() || 'Especificação destacada sobre a imagem.',
                              linkedSkuId: profile.catalog?.products?.[0]?.id,
                            };
                            const curSec = formulaV9.atomicBlueprint?.sections?.find((s: any) => s?.tuple?.[0] === selected.id);
                            const prevSpots = Array.isArray(curSec?.direction?.hotspots) ? curSec.direction.hotspots : [];
                            void dispatchAction('co_direction', {
                              costCredits: 0,
                              direction: {
                                textAnchor: dirTextAnchor,
                                interactionMode: 'hotspot_zoom_sync',
                                hotspots: [...prevSpots, nextSpot],
                              },
                            });
                            setSpotHeadline('');
                            setSpotDesc('');
                          }}
                          className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          <span>Fixar ponto na imagem · 0 cr · Grátis</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'component' ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5">
                        <span className="text-[10px] font-semibold text-purple-900">
                          Transformação de componente via IA
                        </span>
                        <span className="rounded-full bg-purple-200/70 px-2 py-0.5 text-[10px] font-bold text-purple-900">
                          1,5 cr
                        </span>
                      </div>
                      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                        {CAMPAIGN_COMPONENTS_CATALOG.map((comp) => (
                          <button
                            key={comp.roleId}
                            type="button"
                            data-testid={`ai-morph-${comp.roleId}`}
                            disabled={submitting}
                            onClick={() =>
                              void dispatchAction('switch_component', {
                                targetRole: comp.roleId,
                                costCredits: 1.5,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all hover:border-slate-950"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-950">{comp.name}</span>
                              <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                                1,5 cr
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{comp.mechanicSummary}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </m.aside>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}
