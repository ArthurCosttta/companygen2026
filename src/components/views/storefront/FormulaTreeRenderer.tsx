import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Gift,
  Heart,
  ImagePlus,
  MapPin,
  MessageCircle,
  Package,
  Palette,
  PawPrint,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Stethoscope,
  Utensils,
} from 'lucide-react';
import {
  evaluateInteractiveExperience,
  type AtomControl,
  type FormulaV9Document,
  type SectionNode,
} from '@/schemas/formula-v9.schema';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { cn } from '@/lib/utils';
import { safeHref } from './storefront-utils';
import * as composerSchema from '../../../../shared/formula-ir/composer-schema.mjs';

const sanitizeSafeAssetUrl: (raw: unknown, fallback?: string) => string =
  (
    composerSchema as unknown as {
      sanitizeSafeAssetUrl?: (raw: unknown, fallback?: string) => string;
    }
  ).sanitizeSafeAssetUrl ??
  ((raw: unknown, fallback = '') => {
    const clean = String(raw ?? '').trim();
    if (!clean) return fallback;
    if (/^(?:javascript|vbscript|data:image\/svg\+xml):?/i.test(clean) || /^\/\//.test(clean)) {
      return fallback;
    }
    return clean;
  });

export interface FormulaTreeRendererProps {
  formulaV9: FormulaV9Document;
  profile: BusinessProfile;
  products: CatalogProduct[];
  cartCount: number;
  editable?: boolean;
  selectedSectionId?: string | null;
  previewViewport?: 'desktop' | 'tablet' | 'mobile';
  onSelectSection?: (sectionId: string) => void;
  onOpenSectionMediaPopover?: (sectionId: string) => void;
  onOpenWebPhotoSearch?: (product?: CatalogProduct) => void;
  onOpenCart: () => void;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
  onSelectProductDetail?: (product: CatalogProduct) => void;
  onDirectWhatsappSend?: (message: string) => void;
}

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  ShieldCheck,
  Clock,
  MessageCircle,
  Heart,
  Package,
  Calendar,
  Stethoscope,
  PawPrint,
  Utensils,
  Smartphone,
  Gift,
  Palette,
  MapPin,
  Star,
  ShoppingBag,
};

function renderWhitelistedIcon(name?: string, className = 'size-4') {
  const IconComp = (name && ICON_COMPONENTS[name]) || ShieldCheck;
  return <IconComp className={className} />;
}

function getHeadingFontFamily(fontStyle?: string) {
  if (fontStyle === 'editorial_serif') return "'Georgia', 'Times New Roman', serif";
  if (fontStyle === 'clean_geometric') return "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif";
  return "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
}

function isMediaSection(sec: SectionNode): boolean {
  return (
    sec.type === 'HeroSection' ||
    sec.type === 'InteractiveExperience' ||
    sec.type === 'EditorialMediaSplit' ||
    sec.type === 'ClosingScheduleSplit'
  );
}

function InteractiveExperienceBlock({
  section,
  products,
  storeName,
  onAddToCart,
  onDirectWhatsappSend,
}: {
  section: Extract<SectionNode, { type: 'InteractiveExperience' }>;
  products: CatalogProduct[];
  storeName: string;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
  onDirectWhatsappSend?: (message: string) => void;
}) {
  const cfg = section.config;
  const [state, setState] = useState<Record<string, unknown>>(() => ({
    ...(cfg.stateDefaults || {}),
  }));
  const [addedFlash, setAddedFlash] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);

  const evalResult = useMemo(
    () =>
      evaluateInteractiveExperience({
        controls: cfg.controls,
        state,
        calcRule: cfg.calcRule,
        catalog: products,
      }),
    [cfg.controls, cfg.calcRule, state, products],
  );

  const prevTotalRef = React.useRef<number | null>(null);
  const flashTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (prevTotalRef.current !== null && prevTotalRef.current !== evalResult.totalCents) {
      setTotalPulse(true);
      const t = window.setTimeout(() => setTotalPulse(false), 250);
      prevTotalRef.current = evalResult.totalCents;
      return () => window.clearTimeout(t);
    }
    prevTotalRef.current = evalResult.totalCents;
  }, [evalResult.totalCents]);

  const flashAdded = () => {
    setAddedFlash(true);
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      setAddedFlash(false);
    }, 1200);
  };

  const handleAction = (actionType: string) => {
    if (actionType === 'whatsapp.send_summary') {
      const msg = [
        `Olá ${storeName}! Monte sua solicitação pelo simulador:`,
        ...evalResult.chosenSummaryLines.map((l) => `- ${l}`),
        evalResult.totalCents > 0
          ? `Valor estimado: ${formatCurrencyBRL(evalResult.totalCents)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      onDirectWhatsappSend?.(msg);
      return;
    }

    if (evalResult.selectedProducts.length > 0) {
      for (const item of evalResult.selectedProducts) {
        onAddToCart(item as CatalogProduct, 1);
      }
      flashAdded();
      return;
    }

    const customBundle: CatalogProduct = {
      id: `bundle-${section.id}`,
      sku: `EXP-${section.id.toUpperCase().slice(0, 12)}`,
      name: `${cfg.title} (${evalResult.chosenSummaryLines.slice(0, 2).join(' · ') || 'Seleção'})`,
      category: 'Experiência',
      description: evalResult.chosenSummaryLines.join(' | '),
      priceCents: Math.max(0, evalResult.totalCents),
      variation: 'Montado na página',
      stock: 50,
      active: true,
      imageUrl: '',
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    };
    onAddToCart(customBundle, 1);
    flashAdded();
  };

  const renderControl = (ctrl: AtomControl) => {
    const curVal = state[ctrl.stateKey];

    if (ctrl.atomType === 'tabs_selector') {
      return (
        <div key={ctrl.id} className="space-y-2.5">
          <span className="block text-sm font-bold text-[var(--cg-ink)]">{ctrl.label}</span>
          <div className="flex flex-wrap gap-2">
            {ctrl.options.map((opt) => {
              const active = curVal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`atom-tab-${ctrl.stateKey}-${opt.value}`}
                  onClick={() => setState((prev) => ({ ...prev, [ctrl.stateKey]: opt.value }))}
                  className={cn(
                    'min-h-[40px] rounded-full border px-4 py-2 text-xs font-bold transition-all',
                    active
                      ? 'border-[var(--cg-accent)] bg-[var(--cg-accent)] text-white shadow-sm'
                      : 'border-slate-200 bg-white text-[var(--cg-ink)] hover:border-slate-300',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (ctrl.atomType === 'option_cards') {
      return (
        <div key={ctrl.id} className="space-y-2.5">
          <span className="block text-sm font-bold text-[var(--cg-ink)]">{ctrl.label}</span>
          <div className="grid grid-cols-1 gap-2.5 @min-[640px]/formula:grid-cols-2">
            {ctrl.options.map((opt) => {
              const active = curVal === opt.value;
              const matched = opt.skuRef
                ? products.find((p) => p.sku === opt.skuRef || p.id === opt.skuRef)
                : undefined;
              const priceCents = matched?.priceCents ?? opt.priceCents;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`atom-card-${ctrl.stateKey}-${opt.value}`}
                  onClick={() => setState((prev) => ({ ...prev, [ctrl.stateKey]: opt.value }))}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all',
                    active
                      ? 'border-[var(--cg-accent)] bg-[var(--cg-surface-alt)] ring-2 ring-[var(--cg-accent)]/20'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <span className="text-sm font-bold text-[var(--cg-ink)]">{matched?.name || opt.label}</span>
                  {opt.note ? <span className="text-xs text-[var(--cg-ink-muted)]">{opt.note}</span> : null}
                  {typeof priceCents === 'number' && priceCents > 0 ? (
                    <span className="mt-0.5 text-xs font-extrabold text-[var(--cg-accent)]">
                      {formatCurrencyBRL(priceCents)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (ctrl.atomType === 'checklist_addons') {
      const selectedList = Array.isArray(curVal) ? (curVal as string[]) : [];
      return (
        <div key={ctrl.id} className="space-y-2.5">
          <span className="block text-sm font-bold text-[var(--cg-ink)]">{ctrl.label}</span>
          <div className="grid gap-2">
            {ctrl.options.map((opt) => {
              const checked = selectedList.includes(opt.value);
              const matched = opt.skuRef
                ? products.find((p) => p.sku === opt.skuRef || p.id === opt.skuRef)
                : undefined;
              const addPrice = matched?.priceCents ?? opt.priceDeltaCents ?? opt.priceCents ?? 0;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors',
                    checked
                      ? 'border-[var(--cg-accent)] bg-[var(--cg-surface-alt)]'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-[var(--cg-ink)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? selectedList.filter((x) => x !== opt.value)
                          : [...selectedList, opt.value];
                        setState((prev) => ({ ...prev, [ctrl.stateKey]: next }));
                      }}
                      className="size-4 rounded border-slate-300"
                    />
                    <span>{matched?.name || opt.label}</span>
                  </span>
                  {addPrice > 0 ? (
                    <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[var(--cg-accent)]">
                      + {formatCurrencyBRL(addPrice)}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    if (ctrl.atomType === 'slider_range') {
      const qty = typeof curVal === 'number' ? curVal : Number(curVal ?? ctrl.min);
      return (
        <div key={ctrl.id} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between text-sm font-bold text-[var(--cg-ink)]">
            <span>{ctrl.label}</span>
            <span className="text-[var(--cg-accent)]">
              {qty} {ctrl.unitLabel}
            </span>
          </div>
          <input
            type="range"
            min={ctrl.min}
            max={ctrl.max}
            step={ctrl.step}
            value={qty}
            onChange={(e) => setState((prev) => ({ ...prev, [ctrl.stateKey]: Number(e.target.value) }))}
            className="w-full cursor-pointer accent-[var(--cg-accent)]"
          />
        </div>
      );
    }

    if (ctrl.atomType === 'slot_time_picker') {
      return (
        <div key={ctrl.id} className="space-y-2.5">
          <span className="block text-sm font-bold text-[var(--cg-ink)]">{ctrl.label}</span>
          <div className="flex flex-wrap gap-2">
            {ctrl.slots.map((slot) => {
              const active = curVal === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setState((prev) => ({ ...prev, [ctrl.stateKey]: slot }))}
                  className={cn(
                    'min-h-[38px] rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                    active
                      ? 'border-[var(--cg-accent)] bg-[var(--cg-accent)] text-white'
                      : 'border-slate-200 bg-white text-[var(--cg-ink)] hover:border-slate-300',
                  )}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <section id="experiencia" data-testid="v9-interactive-experience" className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
      <div className="rounded-3xl border border-slate-200/80 bg-[var(--cg-card)] p-6 shadow-sm @min-[640px]/formula:p-8">
        {cfg.eyebrow ? (
          <span className="mb-2 inline-block text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
            {cfg.eyebrow}
          </span>
        ) : null}
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--cg-ink)] @min-[640px]/formula:text-3xl">{cfg.title}</h2>
        {cfg.subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-[var(--cg-ink-muted)]">{cfg.subtitle}</p> : null}

        <div className="mt-6 grid grid-cols-1 gap-8 @min-[900px]/formula:grid-cols-12">
          <div className="space-y-6 @min-[900px]/formula:col-span-7">{cfg.controls.map(renderControl)}</div>

          <aside className="flex flex-col justify-between gap-5 rounded-2xl border border-slate-200/70 bg-[var(--cg-surface-alt)] p-5 @min-[900px]/formula:col-span-5">
            <div className="space-y-3">
              {(() => {
                const safeExpImg = sanitizeSafeAssetUrl(cfg.imageUrl, '');
                return safeExpImg ? (
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100">
                    <img src={safeExpImg} alt={cfg.title} className="size-full object-cover" />
                  </div>
                ) : null;
              })()}

              <h3 className="text-sm font-extrabold uppercase tracking-wide text-[var(--cg-ink)]">
                {cfg.calcRule?.summaryTitle || 'Resumo da sua seleção'}
              </h3>

              <ul className="space-y-1.5 text-sm text-[var(--cg-ink)]" data-testid="v9-exp-summary-lines">
                {evalResult.chosenSummaryLines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--cg-accent)]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-slate-200/80 pt-3">
                <div
                  className={cn(
                    'origin-left whitespace-nowrap text-2xl font-black text-[var(--cg-ink)] transition-all duration-200',
                    totalPulse && 'scale-[1.04] text-[var(--cg-accent)]',
                  )}
                  data-testid="v9-exp-total"
                >
                  {evalResult.totalCents > 0 ? formatCurrencyBRL(evalResult.totalCents) : 'Sob consulta'}
                </div>
                {evalResult.pixDiscountPercent > 0 && evalResult.totalCents > 0 ? (
                  <p className="mt-0.5 text-xs font-bold text-emerald-700">
                    No Pix ({evalResult.pixDiscountPercent}% OFF): {formatCurrencyBRL(evalResult.pixTotalCents)}
                  </p>
                ) : null}
                {cfg.calcRule?.limitNote ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--cg-ink-muted)]">{cfg.calcRule.limitNote}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <button
                type="button"
                data-testid="v9-exp-primary-btn"
                onClick={() => handleAction(cfg.primaryAction?.type || 'cart.add_selected')}
                className={cn(
                  'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-center text-sm font-bold leading-tight text-white transition-colors',
                  addedFlash ? 'bg-emerald-600' : 'bg-[var(--cg-accent)] hover:bg-[var(--cg-accent-deep)]',
                )}
              >
                {addedFlash ? (
                  <>
                    <Check className="size-4" />
                    <span>Adicionado à sacola</span>
                  </>
                ) : (
                  <span>{cfg.primaryAction?.label || 'Adicionar à sacola'}</span>
                )}
              </button>

              {cfg.secondaryAction ? (
                <button
                  type="button"
                  data-testid="v9-exp-secondary-btn"
                  onClick={() => handleAction(cfg.secondaryAction?.type || 'whatsapp.send_summary')}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-xs font-bold text-[var(--cg-ink)] hover:bg-slate-50"
                >
                  <MessageCircle className="size-4 text-emerald-600" />
                  <span>{cfg.secondaryAction.label}</span>
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function FormulaTreeRenderer({
  formulaV9,
  profile,
  products,
  cartCount,
  editable = false,
  selectedSectionId = null,
  previewViewport = 'desktop',
  onSelectSection,
  onOpenSectionMediaPopover,
  onOpenWebPhotoSearch,
  onOpenCart,
  onAddToCart,
  onSelectProductDetail,
  onDirectWhatsappSend,
}: FormulaTreeRendererProps) {
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [timelineTabIndex, setTimelineTabIndex] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const addedTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    return () => {
      Object.values(addedTimersRef.current).forEach((t) => window.clearTimeout(t));
      addedTimersRef.current = {};
    };
  }, []);

  const catalogCategories = useMemo(() => {
    const cats = Array.from(
      new Set(products.map((p) => (p.category || 'Geral').trim() || 'Geral')),
    );
    return ['Todas', ...cats];
  }, [products]);

  const tokens = formulaV9.designTokens;
  const storeName = profile.business?.name || 'Minha Loja';
  const logoUrl = sanitizeSafeAssetUrl(
    profile.brand?.logoUrl || (formulaV9.storeInfo as { logoUrl?: string } | undefined)?.logoUrl || '',
    '',
  );
  const hasHeader = formulaV9.sections.some((s) => s.type === 'HeaderNav');
  const sectionsToRender: SectionNode[] = hasHeader
    ? formulaV9.sections
    : [
        {
          id: 'auto_hdr',
          type: 'HeaderNav',
          config: { ctaLabel: 'Sacola', showSearch: false, showBag: true, links: [] },
        },
        ...formulaV9.sections,
      ];

  const handleCardAdd = (prod: CatalogProduct) => {
    onAddToCart(prod, 1);
    setAddedIds((prev) => ({ ...prev, [prod.id]: true }));
    if (addedTimersRef.current[prod.id]) {
      window.clearTimeout(addedTimersRef.current[prod.id]);
    }
    addedTimersRef.current[prod.id] = window.setTimeout(() => {
      delete addedTimersRef.current[prod.id];
      setAddedIds((prev) => ({ ...prev, [prod.id]: false }));
    }, 1200);
  };

  const styleVars = {
    '--cg-accent': tokens.accent || '#0B4DB8',
    '--cg-accent-deep': tokens.accentDeep || '#073B91',
    '--cg-surface': tokens.surface || '#F8FAFC',
    '--cg-surface-alt': tokens.surfaceAlt || '#EFF6FF',
    '--cg-card': tokens.card || '#FFFFFF',
    '--cg-ink': tokens.ink || '#0F172A',
    '--cg-ink-muted': tokens.inkMuted || '#475569',
    '--cg-footer-bg': tokens.footerBg || '#0F172A',
    '--cg-heading-font': getHeadingFontFamily(tokens.fontStyle),
  } as React.CSSProperties;

  const wrapEditable = (sec: SectionNode, content: React.ReactNode) => {
    if (!editable) return <React.Fragment key={sec.id}>{content}</React.Fragment>;
    const isSelected = selectedSectionId === sec.id;
    return (
      <div
        key={sec.id}
        onClick={() => onSelectSection?.(sec.id)}
        className={cn(
          'group relative transition-all',
          isSelected ? 'ring-2 ring-[#2563EB] ring-offset-2' : 'hover:ring-1 hover:ring-[#93C5FD]',
        )}
      >
        {isSelected && isMediaSection(sec) && onOpenSectionMediaPopover ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSectionMediaPopover(sec.id);
            }}
            className="absolute right-4 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-white shadow-md hover:bg-[#1E293B]"
          >
            <ImagePlus className="size-3.5" />
            <span>Imagem desta seção</span>
          </button>
        ) : null}
        {content}
      </div>
    );
  };

  return (
    <div
      style={styleVars}
      data-preview-viewport={previewViewport}
      className="@container/formula min-h-screen min-w-0 overflow-x-clip bg-[var(--cg-surface)] text-[var(--cg-ink)] antialiased"
      data-formula-version="9.0"
    >
      {sectionsToRender.map((sec) => {
        if (sec.type === 'HeaderNav') {
          return wrapEditable(
            sec,
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 @min-[640px]/formula:px-6">
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={storeName}
                      className="h-10 w-auto max-w-[140px] rounded-lg object-contain"
                    />
                  ) : (
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[var(--cg-accent)] text-sm font-black text-white">
                      {storeName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span
                    className="text-base font-extrabold tracking-tight text-[var(--cg-ink)]"
                    style={{ fontFamily: 'var(--cg-heading-font)' }}
                  >
                    {storeName}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <a href="#catalogo" className="hidden text-sm font-semibold text-[var(--cg-ink-muted)] hover:text-[var(--cg-accent)] @min-[640px]/formula:inline">
                    Catálogo
                  </a>
                  <button
                    type="button"
                    data-testid="v9-header-bag-btn"
                    onClick={onOpenCart}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[var(--cg-accent)] px-4 text-xs font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                  >
                    <ShoppingBag className="size-4" />
                    <span>{sec.config.ctaLabel || 'Sacola'}</span>
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]">{cartCount}</span>
                  </button>
                </div>
              </div>
            </header>,
          );
        }

        if (sec.type === 'HeroSection') {
          const heroImg = sanitizeSafeAssetUrl(sec.config.imageUrl, '');
          const isBleed = sec.config.variant === 'full_bleed' && Boolean(heroImg);
          if (isBleed) {
            return wrapEditable(
              sec,
              <section className="mx-auto max-w-6xl px-4 pt-6 @min-[640px]/formula:px-6">
                <div className="relative flex min-h-[380px] items-end overflow-hidden rounded-3xl bg-slate-900 text-white">
                  <img src={heroImg} alt={sec.config.title} className="absolute inset-0 size-full object-cover opacity-55" />
                  <div className="relative z-10 max-w-2xl p-8 @min-[640px]/formula:p-10">
                    {sec.config.eyebrow ? (
                      <span className="mb-2 inline-block text-xs font-bold uppercase tracking-wider text-slate-200">
                        {sec.config.eyebrow}
                      </span>
                    ) : null}
                    <h1 className="text-3xl font-black leading-tight @min-[640px]/formula:text-5xl" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                      {sec.config.title}
                    </h1>
                    {sec.config.subtitle ? <p className="mt-3 text-base text-slate-100">{sec.config.subtitle}</p> : null}
                    <div className="mt-6 flex flex-wrap gap-3">
                      <a
                        href={safeHref(sec.config.primaryCta?.href, '#experiencia')}
                        className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--cg-accent)] px-6 text-sm font-bold text-white"
                      >
                        {sec.config.primaryCta?.label || 'Começar'}
                      </a>
                    </div>
                  </div>
                </div>
              </section>,
            );
          }

          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6 @min-[900px]/formula:py-14">
              <div className="grid grid-cols-1 items-center gap-8 @min-[900px]/formula:grid-cols-12">
                <div className="space-y-4 @min-[900px]/formula:col-span-6">
                  {sec.config.eyebrow ? (
                    <span className="inline-block rounded-full bg-[var(--cg-surface-alt)] px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
                      {sec.config.eyebrow}
                    </span>
                  ) : null}
                  <h1
                    className="text-3xl font-black leading-[1.08] tracking-tight text-[var(--cg-ink)] @min-[640px]/formula:text-5xl"
                    style={{ fontFamily: 'var(--cg-heading-font)' }}
                  >
                    {sec.config.title}
                  </h1>
                  {sec.config.subtitle ? (
                    <p className="max-w-xl text-base leading-relaxed text-[var(--cg-ink-muted)]">{sec.config.subtitle}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <a
                      href={safeHref(sec.config.primaryCta?.href, '#experiencia')}
                      className="inline-flex min-h-[46px] items-center rounded-full bg-[var(--cg-accent)] px-6 text-sm font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                    >
                      {sec.config.primaryCta?.label || 'Simular agora'}
                    </a>
                    {sec.config.secondaryCta ? (
                      <button
                        type="button"
                        onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Vim pela vitrine.`)}
                        className="inline-flex min-h-[46px] items-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-bold text-[var(--cg-ink)] hover:bg-slate-50"
                      >
                        <MessageCircle className="size-4 text-emerald-600" />
                        <span>{sec.config.secondaryCta.label}</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="@min-[900px]/formula:col-span-6">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-[#F1F5F9]">
                    {heroImg ? (
                      <img src={heroImg} alt={sec.config.title} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm font-semibold text-slate-400">
                        {storeName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>,
          );
        }

        if (sec.type === 'DifferentialsStrip') {
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-4 @min-[640px]/formula:px-6">
              <div className="grid grid-cols-1 gap-3 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-4">
                {sec.config.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cg-surface-alt)] text-[var(--cg-accent)]">
                      {renderWhitelistedIcon(item.icon)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--cg-ink)]">{item.title}</p>
                      {item.text ? <p className="mt-0.5 text-xs text-[var(--cg-ink-muted)]">{item.text}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>,
          );
        }

        if (sec.type === 'InteractiveExperience') {
          return wrapEditable(
            sec,
            <InteractiveExperienceBlock
              section={sec}
              products={products}
              storeName={storeName}
              onAddToCart={onAddToCart}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />,
          );
        }

        if (sec.type === 'EditorialMediaSplit') {
          const mediaUrl = sanitizeSafeAssetUrl(sec.config.imageUrl, '');
          const mediaSide = (
            <div className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-[#F1F5F9]">
              {mediaUrl ? (
                <img src={mediaUrl} alt={sec.config.title} className="size-full object-cover" />
              ) : null}
            </div>
          );
          const textSide = (
            <div className="space-y-4">
              {sec.config.eyebrow ? (
                <span className="inline-block text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
                  {sec.config.eyebrow}
                </span>
              ) : null}
              <h2 className="text-2xl font-extrabold text-[var(--cg-ink)] @min-[640px]/formula:text-3xl" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                {sec.config.title}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--cg-ink-muted)] @min-[640px]/formula:text-base">{sec.config.body}</p>
              {sec.config.bullets?.length ? (
                <ul className="space-y-1.5 text-sm text-[var(--cg-ink)]">
                  {sec.config.bullets.map((b, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="size-4 text-[var(--cg-accent)]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <div className="grid grid-cols-1 items-center gap-8 @min-[900px]/formula:grid-cols-2">
                {sec.config.variant === 'media_left' ? (
                  <>
                    {mediaUrl ? mediaSide : null}
                    {textSide}
                  </>
                ) : (
                  <>
                    {textSide}
                    {mediaUrl ? mediaSide : null}
                  </>
                )}
              </div>
            </section>,
          );
        }

        if (sec.type === 'StepsTimeline') {
          const activeTabIdx = timelineTabIndex[sec.id] ?? 0;
          const activeTab = sec.config.tabs[activeTabIdx] || sec.config.tabs[0];
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                {sec.config.title}
              </h2>
              {sec.config.subtitle ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{sec.config.subtitle}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {sec.config.tabs.map((tab, idx) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimelineTabIndex((prev) => ({ ...prev, [sec.id]: idx }))}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-xs font-bold',
                      idx === activeTabIdx
                        ? 'border-[var(--cg-accent)] bg-[var(--cg-accent)] text-white'
                        : 'border-slate-200 bg-white text-[var(--cg-ink)]',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 @min-[640px]/formula:grid-cols-3">
                {(activeTab?.steps || []).map((st, idx) => (
                  <div key={idx} className="rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-5">
                    <span className="text-xs font-extrabold uppercase text-[var(--cg-accent)]">{st.time}</span>
                    <h3 className="mt-1 text-base font-bold text-[var(--cg-ink)]">{st.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--cg-ink-muted)]">{st.detail}</p>
                  </div>
                ))}
              </div>
            </section>,
          );
        }

        if (sec.type === 'HighlightsGrid') {
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                {sec.config.title}
              </h2>
              {sec.config.subtitle ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{sec.config.subtitle}</p> : null}
              <div className={cn('mt-6 grid grid-cols-1 gap-4', sec.config.columns === 3 ? '@min-[640px]/formula:grid-cols-3' : '@min-[640px]/formula:grid-cols-2')}>
                {sec.config.cards.map((c, idx) => {
                  const cardImg = sanitizeSafeAssetUrl(c.imageUrl, '');
                  return (
                  <div key={idx} className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-5">
                    <div>
                      {cardImg ? (
                        <div className="mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-[#F1F5F9]">
                          <img src={cardImg} alt={c.title} className="size-full object-cover" />
                        </div>
                      ) : null}
                      {c.eyebrow ? (
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">{c.eyebrow}</span>
                      ) : null}
                      <h3 className="mt-1 text-lg font-bold text-[var(--cg-ink)]">{c.title}</h3>
                      {c.description ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{c.description}</p> : null}
                    </div>
                    <a
                      href={safeHref(c.href, '#catalogo')}
                      className="mt-4 inline-flex w-fit items-center rounded-full border border-slate-300 px-4 py-1.5 text-xs font-bold text-[var(--cg-ink)] hover:bg-slate-50"
                    >
                      {c.ctaLabel || 'Ver detalhes'}
                    </a>
                  </div>
                  );
                })}
              </div>
            </section>,
          );
        }

        if (sec.type === 'FaqAccordion') {
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                {sec.config.title}
              </h2>
              <div className="mt-5 max-w-3xl space-y-2.5">
                {sec.config.items.map((it, idx) => (
                  <details key={idx} className="rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] px-5 py-3.5">
                    <summary className="cursor-pointer text-sm font-bold text-[var(--cg-ink)]">{it.q}</summary>
                    <p className="mt-2 text-sm text-[var(--cg-ink-muted)]">{it.a}</p>
                  </details>
                ))}
              </div>
            </section>,
          );
        }

        if (sec.type === 'CatalogGrid') {
          const activeCategory = catalogCategories.includes(selectedCategory)
            ? selectedCategory
            : 'Todas';
          const filtered = products.filter((p) => {
            const cat = (p.category || 'Geral').trim() || 'Geral';
            if (activeCategory !== 'Todas' && cat !== activeCategory) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
              p.name.toLowerCase().includes(q) ||
              cat.toLowerCase().includes(q)
            );
          });

          return wrapEditable(
            sec,
            <section id="catalogo" data-testid="v9-catalog-grid" className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-[var(--cg-ink)] @min-[640px]/formula:text-3xl" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                    {sec.config.title || 'Catálogo'}
                  </h2>
                  {sec.config.subtitle ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{sec.config.subtitle}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar no catálogo..."
                      className="h-10 rounded-full border border-slate-200 bg-white pl-9 pr-4 text-xs text-[var(--cg-ink)] focus:border-[var(--cg-accent)] focus:outline-none"
                    />
                  </div>
                  {editable && onOpenWebPhotoSearch ? (
                    <button
                      type="button"
                      data-testid="v9-catalog-search-photos-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenWebPhotoSearch();
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0F172A] hover:bg-slate-50"
                    >
                      <ImagePlus className="size-3.5 text-[#2563EB]" />
                      <span>Buscar fotos grátis (0 cr)</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {catalogCategories.length > 1 ? (
                <div
                  data-testid="v9-catalog-category-chips"
                  className="mt-4 flex flex-wrap items-center gap-2"
                >
                  {catalogCategories.map((cat) => {
                    const isActiveCat = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'min-h-[36px] shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                          isActiveCat
                            ? 'border-[var(--cg-accent)] bg-[var(--cg-accent)] text-white shadow-xs'
                            : 'border-slate-200 bg-white text-[var(--cg-ink)] hover:border-slate-300',
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-6 grid grid-cols-1 gap-4 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-4">
                {filtered.map((prod) => {
                  const isAdded = Boolean(addedIds[prod.id]);
                  const safeProdImg = sanitizeSafeAssetUrl(prod.imageUrl, '');
                  const hasRealImg = Boolean(safeProdImg && !safeProdImg.startsWith('data:image/svg+xml'));
                  return (
                    <article
                      key={prod.id}
                      data-testid={`v9-catalog-card-${prod.sku}`}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] transition-shadow hover:shadow-md"
                    >
                      <div>
                        {/* Cinza neutro #F1F5F9 quando SKU ainda sem foto */}
                        <div
                          onClick={() => onSelectProductDetail?.(prod)}
                          className="relative aspect-square w-full cursor-pointer overflow-hidden bg-[#F1F5F9]"
                        >
                          {hasRealImg ? (
                            <img src={safeProdImg} alt={prod.name} className="size-full object-cover" />
                          ) : (
                            <div
                              data-testid="v9-neutral-gray-thumb"
                              className="flex size-full flex-col items-center justify-center gap-2 bg-[#F1F5F9] p-4 text-center text-slate-600"
                            >
                              <span
                                className="flex size-12 items-center justify-center rounded-2xl border border-slate-300/70 bg-white/80 text-base font-extrabold tracking-tight text-slate-700 shadow-2xs"
                                style={{ borderBottom: '3px solid var(--cg-accent)' }}
                              >
                                {(prod.name || 'CG')
                                  .trim()
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((w) => w[0]?.toUpperCase() || '')
                                  .join('') || 'CG'}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                {prod.category || 'Catálogo'}
                              </span>
                            </div>
                          )}

                          {editable && !hasRealImg && onOpenWebPhotoSearch ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenWebPhotoSearch(prod);
                              }}
                              className="absolute bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-[#0F172A] shadow-sm hover:bg-white"
                            >
                              Pesquisar foto (0 cr)
                            </button>
                          ) : null}
                        </div>

                        <div className="p-4">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--cg-ink-muted)]">
                            {prod.category || 'Geral'}
                          </span>
                          <h3
                            onClick={() => onSelectProductDetail?.(prod)}
                            className="mt-1 cursor-pointer text-sm font-extrabold text-[var(--cg-ink)] hover:text-[var(--cg-accent)]"
                          >
                            {prod.name}
                          </h3>
                          {prod.variation && prod.variation !== 'Padrão' ? (
                            <p className="mt-0.5 text-xs text-[var(--cg-ink-muted)]">{prod.variation}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2.5 px-4 pb-4">
                        <div className="whitespace-nowrap text-lg font-black text-[var(--cg-ink)]">
                          {formatCurrencyBRL(prod.priceCents)}
                        </div>
                        <button
                          type="button"
                          data-testid={`v9-add-cart-${prod.sku}`}
                          onClick={() => handleCardAdd(prod)}
                          className={cn(
                            'inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-3 text-center text-xs font-bold leading-tight text-white transition-colors',
                            isAdded
                              ? 'bg-emerald-600'
                              : 'bg-[var(--cg-accent)] hover:bg-[var(--cg-accent-deep)]',
                          )}
                        >
                          {isAdded ? (
                            <>
                              <Check className="size-3.5" />
                              <span>Adicionado</span>
                            </>
                          ) : (
                            <span>{sec.config.itemActionLabel || 'Adicionar à sacola'}</span>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>,
          );
        }

        if (sec.type === 'ClosingScheduleSplit') {
          const closingImg = sanitizeSafeAssetUrl(
            sec.config.imageUrl || profile.brand?.storefrontPhotoUrl || '',
            '',
          );
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-slate-200/80 bg-[var(--cg-card)] p-6 @min-[640px]/formula:p-8 @min-[900px]/formula:grid-cols-2">
                <div className="space-y-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
                    {sec.config.eyebrow || 'Atendimento'}
                  </span>
                  <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
                    {sec.config.title}
                  </h2>
                  {sec.config.subtitle ? <p className="text-sm text-[var(--cg-ink-muted)]">{sec.config.subtitle}</p> : null}
                  {sec.config.slots?.length ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {sec.config.slots.map((sl, i) => (
                        <span key={i} className="rounded-full bg-[var(--cg-surface-alt)] px-3 py-1 text-xs font-bold text-[var(--cg-ink)]">
                          {sl}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {closingImg ? (
                    <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-[#F1F5F9]">
                      <img src={closingImg} alt={storeName} className="size-full object-cover" />
                    </div>
                  ) : null}
                  <h3 className="text-lg font-extrabold text-[var(--cg-ink)]">{sec.config.whatsappHeading}</h3>
                  {sec.config.whatsappSubtext ? (
                    <p className="text-sm text-[var(--cg-ink-muted)]">{sec.config.whatsappSubtext}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--cg-accent)] px-6 text-sm font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                  >
                    <MessageCircle className="size-4" />
                    <span>{sec.config.ctaLabel || 'Chamar no WhatsApp'}</span>
                  </button>
                </div>
              </div>
            </section>,
          );
        }

        if (sec.type === 'RichFooter') {
          return wrapEditable(
            sec,
            <footer className="mt-8 bg-[var(--cg-footer-bg)] py-10 text-slate-200">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 @min-[640px]/formula:px-6">
                <div>
                  <strong className="text-base font-extrabold text-white">{storeName}</strong>
                  {sec.config.tagline ? <p className="mt-1 text-xs text-slate-300">{sec.config.tagline}</p> : null}
                </div>
                <div className="text-xs text-slate-400">
                  {profile.business?.address ? <div>{profile.business.address}</div> : null}
                  {profile.business?.hours ? <div>{profile.business.hours}</div> : null}
                </div>
              </div>
            </footer>,
          );
        }

        return null;
      })}
    </div>
  );
}
