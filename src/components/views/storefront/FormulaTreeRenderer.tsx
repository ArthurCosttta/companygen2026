import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  ChevronDown,
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
import { matchesProductQuery } from '@/utils/fuzzySearch';
import { cn } from '@/lib/utils';
import { safeHref } from './storefront-utils';
import { resolveFontVoices } from './AtomicGrammarCompiler';
import {
  AtomicSectionRenderer,
  SafeCatalogImage,
  resolveNodeStyle,
  type NodeStylesConfig,
} from './AtomicSectionRenderers';
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
  pixDiscountPercent = 0,
  onAddToCart,
  onDirectWhatsappSend,
}: {
  section: Extract<SectionNode, { type: 'InteractiveExperience' }>;
  products: CatalogProduct[];
  storeName: string;
  pixDiscountPercent?: number;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
  onDirectWhatsappSend?: (message: string) => void;
}) {
  const cfg = section.config;
  const [state, setState] = useState<Record<string, unknown>>(() => ({
    ...(cfg.stateDefaults || {}),
  }));
  const [quizStep, setQuizStep] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);

  const effectiveCalcRule = useMemo(
    () => ({
      ...cfg.calcRule,
      pixDiscountPercent:
        pixDiscountPercent > 0 ? pixDiscountPercent : Number(cfg.calcRule?.pixDiscountPercent || 0),
    }),
    [cfg.calcRule, pixDiscountPercent],
  );

  const evalResult = useMemo(
    () =>
      evaluateInteractiveExperience({
        controls: cfg.controls,
        state,
        calcRule: effectiveCalcRule,
        catalog: products,
      }),
    [cfg.controls, effectiveCalcRule, state, products],
  );

  const recommendedProduct = useMemo(() => {
    const recSkus = Array.isArray(cfg.recommendedSkus) ? cfg.recommendedSkus : [];
    for (const ref of recSkus) {
      const found = products.find((p) => p.sku === ref || p.id === ref);
      if (found) return found;
    }
    if (evalResult.selectedProducts.length > 0) {
      return evalResult.selectedProducts[0] as CatalogProduct;
    }
    return products[0];
  }, [cfg.recommendedSkus, products, evalResult.selectedProducts]);

  const isQuizMode = cfg.experienceMode === 'quiz_recommendation';
  const totalQuizSteps = isQuizMode ? Math.max(1, Math.min(3, cfg.controls.length || 1)) : 1;

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
        const qty = Math.max(1, Math.round(Number((item as { quantity?: number }).quantity || 1)));
        onAddToCart(item as CatalogProduct, qty);
      }
      flashAdded();
      return;
    }

    if (isQuizMode && recommendedProduct) {
      onAddToCart(recommendedProduct, 1);
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
          <div className="space-y-6 @min-[900px]/formula:col-span-7">
            {isQuizMode && cfg.controls.length > 1 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5" role="tablist" aria-label="Etapas do simulador">
                    {cfg.controls.slice(0, 3).map((ctrl, idx) => (
                      <button
                        key={ctrl.id}
                        type="button"
                        data-testid={`quiz-step-tab-${idx}`}
                        onClick={() => {
                          setQuizStep(idx);
                          if (idx >= totalQuizSteps - 1) setQuizCompleted(true);
                        }}
                        className={cn(
                          'min-h-[34px] rounded-full border px-3 py-1 text-xs font-extrabold transition-colors',
                          quizStep === idx
                            ? 'border-[var(--cg-accent)] bg-[var(--cg-accent)] text-white'
                            : 'border-slate-200 bg-white text-[var(--cg-ink-muted)] hover:border-slate-300',
                        )}
                      >
                        Etapa {idx + 1}
                      </button>
                    ))}
                  </div>
                  <span className="cg-tabular text-xs font-bold text-[var(--cg-ink-muted)]">
                    Passo {Math.min(quizStep + 1, totalQuizSteps)} de {totalQuizSteps}
                  </span>
                </div>

                {cfg.controls[quizStep] ? renderControl(cfg.controls[quizStep]) : null}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={quizStep === 0}
                    onClick={() => setQuizStep((s) => Math.max(0, s - 1))}
                    className="min-h-[38px] rounded-full border border-slate-300 bg-white px-4 text-xs font-bold text-[var(--cg-ink)] disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  {quizStep < totalQuizSteps - 1 ? (
                    <button
                      type="button"
                      data-testid="quiz-next-step-btn"
                      onClick={() => {
                        const next = Math.min(totalQuizSteps - 1, quizStep + 1);
                        setQuizStep(next);
                        if (next === totalQuizSteps - 1) setQuizCompleted(true);
                      }}
                      className="min-h-[38px] rounded-full bg-[var(--cg-accent)] px-5 text-xs font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                    >
                      Próxima etapa
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="quiz-reveal-btn"
                      onClick={() => setQuizCompleted(true)}
                      className="min-h-[38px] rounded-full bg-[var(--cg-accent)] px-5 text-xs font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                    >
                      Ver recomendação ideal
                    </button>
                  )}
                </div>
              </div>
            ) : (
              cfg.controls.map(renderControl)
            )}
          </div>

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

              {isQuizMode && recommendedProduct && (quizCompleted || cfg.controls.length <= 1 || quizStep >= totalQuizSteps - 1) ? (
                <div
                  data-testid="v9-quiz-recommended-card"
                  className="rounded-xl border border-[var(--cg-accent)]/30 bg-[var(--cg-card)] p-3.5 shadow-2xs"
                >
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
                    Recomendação para sua seleção
                  </span>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-[var(--cg-ink)]">
                        {recommendedProduct.name}
                      </div>
                      <div className="text-xs text-[var(--cg-ink-muted)]">
                        {recommendedProduct.category || 'Catálogo oficial'}
                      </div>
                    </div>
                    <span className="cg-tabular shrink-0 text-sm font-black text-[var(--cg-ink)]">
                      {formatCurrencyBRL(recommendedProduct.priceCents)}
                    </span>
                  </div>
                </div>
              ) : null}

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
                    'cg-tabular origin-left whitespace-nowrap text-2xl font-black text-[var(--cg-ink)] transition-all duration-200',
                    totalPulse && 'scale-[1.04] text-[var(--cg-accent)]',
                  )}
                  data-testid="v9-exp-total"
                >
                  {evalResult.totalCents > 0 ? formatCurrencyBRL(evalResult.totalCents) : 'Sob consulta'}
                </div>
                {evalResult.pixDiscountPercent > 0 && evalResult.totalCents > 0 ? (
                  <p className="cg-tabular mt-0.5 text-xs font-bold text-emerald-700">
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

function ContextualFaqBlock({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ q: string; a: string }>;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <section data-testid="v9-contextual-faq" className="mx-auto max-w-6xl px-4 py-8 @min-[640px]/formula:px-6">
      <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
        {title || 'Perguntas frequentes'}
      </h2>
      {subtitle ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{subtitle}</p> : null}
      <div className="mt-5 max-w-3xl space-y-2.5">
        {items.map((it, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              style={{ borderColor: isOpen ? 'var(--cg-accent)' : 'var(--cg-border, rgba(15,23,42,0.12))' }}
              className="rounded-2xl border bg-[var(--cg-card)] transition-colors duration-200"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                data-testid={`faq-toggle-${idx}`}
                onClick={() => setOpenIdx((prev) => (prev === idx ? null : idx))}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-bold text-[var(--cg-ink)]"
              >
                <span>{it.q}</span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-[var(--cg-ink-muted)] transition-transform duration-200',
                    isOpen && 'rotate-180 text-[var(--cg-accent)]',
                  )}
                />
              </button>
              <div
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm leading-relaxed text-[var(--cg-ink-muted)]">{it.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComplementaryBundlesBlock({
  title,
  subtitle,
  items,
  products,
  pixDiscountPercent,
  onAddToCart,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ id?: string; title: string; description?: string; skuIds: string[] }>;
  products: CatalogProduct[];
  pixDiscountPercent: number;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
}) {
  const [addedBundleIdx, setAddedBundleIdx] = useState<number | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const resolvedBundles = useMemo(() => {
    return items
      .map((bundle, idx) => {
        const matched = (Array.isArray(bundle.skuIds) ? bundle.skuIds : [])
          .map((ref) => products.find((p) => p.sku === ref || p.id === ref))
          .filter((p): p is CatalogProduct => Boolean(p && p.active !== false));
        if (matched.length === 0) return null;
        const totalCents = matched.reduce((acc, p) => acc + Math.round(Number(p.priceCents || 0)), 0);
        const pixSaveCents = pixDiscountPercent > 0 ? Math.round((totalCents * pixDiscountPercent) / 100) : 0;
        return { idx, bundle, matched, totalCents, pixSaveCents };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [items, products, pixDiscountPercent]);

  if (resolvedBundles.length === 0) return null;

  return (
    <section id="combos" data-testid="v9-complementary-bundles" className="mx-auto max-w-6xl px-4 py-8 @min-[640px]/formula:px-6">
      <h2 className="text-2xl font-extrabold text-[var(--cg-ink)]" style={{ fontFamily: 'var(--cg-heading-font)' }}>
        {title || 'Combine e Economize'}
      </h2>
      {subtitle ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{subtitle}</p> : null}

      <div className="mt-5 grid grid-cols-1 gap-4 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-3">
        {resolvedBundles.map(({ idx, bundle, matched, totalCents, pixSaveCents }) => {
          const isAdded = addedBundleIdx === idx;
          return (
            <article
              key={bundle.id || idx}
              data-testid={`v9-bundle-card-${idx}`}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-5 shadow-2xs"
            >
              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-[var(--cg-ink)]">{bundle.title}</h3>
                <p className="text-xs font-medium text-[var(--cg-ink-muted)]">
                  {matched.map((m) => m.name).join(' + ')}
                </p>
                {bundle.description ? (
                  <p className="text-xs text-[var(--cg-ink-muted)]">{bundle.description}</p>
                ) : null}
              </div>

              <div className="space-y-2.5">
                {pixSaveCents > 0 ? (
                  <span className="cg-tabular inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                    Economize {formatCurrencyBRL(pixSaveCents)} no Pix
                  </span>
                ) : null}
                <div className="cg-tabular text-xl font-black text-[var(--cg-ink)]">
                  {formatCurrencyBRL(totalCents)}
                </div>
                <button
                  type="button"
                  data-testid={`v9-add-bundle-${idx}`}
                  onClick={() => {
                    for (const item of matched) {
                      onAddToCart(item, 1);
                    }
                    setAddedBundleIdx(idx);
                    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
                    timerRef.current = window.setTimeout(() => setAddedBundleIdx(null), 1200);
                  }}
                  className={cn(
                    'inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition-colors',
                    isAdded ? 'bg-emerald-600' : 'bg-[var(--cg-accent)] hover:bg-[var(--cg-accent-deep)]',
                  )}
                >
                  {isAdded ? (
                    <>
                      <Check className="size-3.5" />
                      <span>Combo adicionado</span>
                    </>
                  ) : (
                    <span>Adicionar Combo</span>
                  )}
                </button>
              </div>
            </article>
          );
        })}
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
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
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
  const pixDiscountPercent = Math.max(
    0,
    Math.min(90, Number(profile.payment?.pixDiscountPercent || (formulaV9.storeInfo as { pixDiscountPercent?: number } | undefined)?.pixDiscountPercent || 0)),
  );
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

  const atomicPrimaryColor = (
    formulaV9.atomicBlueprint?.brandTokens as { colors?: { primary?: string; accent?: string } } | undefined
  )?.colors?.primary;
  const atomicPaletteSys = formulaV9.atomicBlueprint?.paletteSystem as Record<string, string> | undefined;
  const atomicSeed = formulaV9.atomicBlueprint?.engineSeed as Record<string, any> | undefined;
  const { bodyFontFamily } = resolveFontVoices(atomicSeed);
  const resolvedHeaderAccent = atomicPaletteSys?.anchorDarkBg || atomicPrimaryColor || profile.brand?.primaryColor || tokens.accent || '#18181B';
  const hasAtomicBlueprint =
    Array.isArray(formulaV9.atomicBlueprint?.sections) &&
    formulaV9.atomicBlueprint.sections.length >= 1;

  const styleVars = {
    '--cg-accent': resolvedHeaderAccent,
    '--cg-accent-deep': atomicPaletteSys?.anchorDarkBg || atomicPrimaryColor || profile.brand?.primaryColor || tokens.accentDeep || '#09090B',
    '--cg-surface': hasAtomicBlueprint && atomicPaletteSys?.groundBg ? atomicPaletteSys.groundBg : (tokens.surface || '#FFFFFF'),
    '--cg-surface-alt': tokens.surfaceAlt || '#EFF6FF',
    '--cg-card': tokens.card || '#FFFFFF',
    '--cg-ink': tokens.ink || '#0F172A',
    '--cg-ink-muted': tokens.inkMuted || '#475569',
    '--cg-footer-bg': tokens.footerBg || '#0F172A',
    '--cg-heading-font': getHeadingFontFamily(tokens.fontStyle),
    ...(hasAtomicBlueprint ? { fontFamily: bodyFontFamily } : {}),
  } as React.CSSProperties;

  const getSecNodeStyles = (sec: SectionNode): NodeStylesConfig | undefined =>
    (sec.config as { nodeStyles?: NodeStylesConfig } | undefined)?.nodeStyles;

  const getSectionWrapperStyle = (sec: SectionNode): React.CSSProperties | undefined => {
    const secOverride = resolveNodeStyle(getSecNodeStyles(sec), 'section');
    const bg = secOverride.style.backgroundColor ? String(secOverride.style.backgroundColor) : undefined;
    const fg = secOverride.style.color ? String(secOverride.style.color) : undefined;
    const isDarkBg = Boolean(bg && /^#(?:18181b|0f172a|09090b|111827|121215)/i.test(bg));
    if (!bg && !fg && !secOverride.style.textAlign) return undefined;
    return {
      ...secOverride.style,
      ...(isDarkBg
        ? ({
            '--cg-ink': fg || '#F8FAFC',
            '--cg-ink-muted': '#CBD5E1',
            '--cg-card': '#27272A',
            '--cg-surface': bg,
            '--cg-surface-alt': '#27272A',
            color: fg || '#F8FAFC',
          } as React.CSSProperties)
        : {}),
    };
  };

  const resolveClassicGridCols = (columns: number | undefined, fallback: string) => {
    if (columns === 1) return 'grid-cols-1';
    if (columns === 2) return 'grid-cols-1 @min-[640px]/formula:grid-cols-2';
    if (columns === 3) return 'grid-cols-1 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-3';
    if (columns === 4) return 'grid-cols-2 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-4';
    return fallback;
  };

  const wrapEditable = (sec: SectionNode, content: React.ReactNode) => {
    const wrapperStyle = getSectionWrapperStyle(sec);
    const cvClass = sec.type === 'HeaderNav' ? 'sticky top-0 z-30' : 'cg-cv-auto';
    if (!editable) {
      return (
        <div key={sec.id} data-inspect-section={sec.id} data-inspect-type={sec.type} className={cvClass} style={wrapperStyle}>
          {content}
        </div>
      );
    }
    const isSelected = selectedSectionId === sec.id;
    return (
      <div
        key={sec.id}
        data-inspect-section={sec.id}
        data-inspect-type={sec.type}
        style={wrapperStyle}
        onClick={() => onSelectSection?.(sec.id)}
        className={cn(
          'group relative',
          cvClass,
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
      className={cn(
        'cg-light-preview @container/formula min-w-0 overflow-x-clip bg-[var(--cg-surface)] text-[var(--cg-ink)] antialiased',
        editable ? 'min-h-full' : 'min-h-screen',
      )}
      data-formula-version="9.0"
    >
      {sectionsToRender.map((sec) => {
        if (hasAtomicBlueprint && sec.type !== 'HeaderNav') {
          return null;
        }
        if (sec.type === 'HeaderNav') {
          if (hasAtomicBlueprint) {
            const isLightDivided = atomicSeed?.headerMode === 'light_divided_bar';
            const hdrBg = isLightDivided ? '#FFFFFF' : (atomicPaletteSys?.anchorDarkBg || '#0D1B2A');
            const hdrInk = isLightDivided ? (atomicPaletteSys?.inkOnLight || '#111827') : '#FFFFFF';
            const hdrAccent = isLightDivided
              ? (atomicPaletteSys?.anchorDarkBg || '#18181B')
              : (atomicPaletteSys?.accentOnDark || '#D8A848');
            const ctaBg = isLightDivided
              ? (atomicPaletteSys?.anchorDarkBg || '#18181B')
              : (atomicPaletteSys?.accentFill || '#D8A848');
            const ctaInk = isLightDivided ? '#FFFFFF' : (atomicPaletteSys?.accentInk || '#111827');
            const topCats = catalogCategories.filter((c) => c !== 'Todas').slice(0, 3);

            return wrapEditable(
              sec,
              <header
                className="sticky top-0 z-30 border-b"
                style={{
                  backgroundColor: hdrBg,
                  color: hdrInk,
                  borderColor: isLightDivided ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 @min-[640px]/formula:px-6">
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-0.5 ring-1 ring-black/10 shadow-2xs">
                        <img
                          src={logoUrl}
                          alt={storeName}
                          className="size-full rounded-lg object-contain"
                        />
                      </span>
                    ) : (
                      <span
                        className="inline-flex size-9 items-center justify-center rounded-xl text-sm font-black shadow-xs"
                        style={{ backgroundColor: ctaBg, color: ctaInk }}
                      >
                        {storeName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="text-base font-extrabold tracking-tight">{storeName}</span>
                    {isLightDivided && profile.business?.address ? (
                      <span className="hidden border-l border-slate-300 pl-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 @min-[700px]/formula:inline">
                        {profile.business.address}
                      </span>
                    ) : null}
                  </div>

                  <nav className="hidden items-center gap-5 text-xs font-semibold @min-[700px]/formula:flex">
                    <a
                      href="#workbench"
                      className="border-b-2 pb-0.5 transition-opacity hover:opacity-100"
                      style={{ borderColor: hdrAccent }}
                    >
                      Seleção
                    </a>
                    {topCats.map((cat) => (
                      <a
                        key={cat}
                        href="#catalogo"
                        onClick={() => setSelectedCategory(cat)}
                        className="opacity-85 transition-opacity hover:opacity-100"
                      >
                        {cat}
                      </a>
                    ))}
                  </nav>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="v9-header-bag-btn"
                      onClick={onOpenCart}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-bold shadow-xs transition-transform active:scale-[0.97]"
                      style={{ backgroundColor: ctaBg, color: ctaInk }}
                    >
                      <ShoppingBag className="size-4" />
                      <span>{sec.config.ctaLabel || 'Sacola'}</span>
                      <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[11px] tabular-nums">{cartCount}</span>
                    </button>
                  </div>
                </div>
              </header>,
            );
          }

          return wrapEditable(
            sec,
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95">
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
          const ns = getSecNodeStyles(sec);
          const heroImg = sanitizeSafeAssetUrl(sec.config.imageUrl, '');
          const heroTitleOvr = resolveNodeStyle(ns, 'hero.title');
          const heroSubOvr = resolveNodeStyle(ns, 'hero.subtitle');
          const heroCtaOvr = resolveNodeStyle(ns, 'hero.cta');
          const heroSecCtaOvr = resolveNodeStyle(ns, 'hero.secondaryCta');
          const heroImgOvr = resolveNodeStyle(ns, 'hero.image');
          const isBleed = sec.config.variant === 'full_bleed' && Boolean(heroImg);
          if (isBleed) {
            return wrapEditable(
              sec,
              <section className="mx-auto max-w-6xl px-4 pt-6 @min-[640px]/formula:px-6">
                <div className="relative flex min-h-[72vh] items-end overflow-hidden rounded-3xl bg-slate-950 text-white">
                  {!heroImgOvr.hidden ? (
                    <img
                      data-node-path="hero.image"
                      data-node-label="Imagem da capa"
                      data-edit-props="image,visibility"
                      src={heroImg}
                      alt={sec.config.title}
                      className="absolute inset-0 size-full object-cover opacity-65"
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent" />
                  <div className="relative z-10 max-w-2xl p-8 @min-[640px]/formula:p-10">
                    {!heroTitleOvr.hidden ? (
                      <h1
                        data-node-path="hero.title"
                        data-node-label="Título principal"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="text-3xl font-black leading-[1.04] tracking-tight @min-[640px]/formula:text-5xl"
                        style={{ fontFamily: 'var(--cg-heading-font)', textWrap: 'balance', ...heroTitleOvr.style }}
                      >
                        {sec.config.title}
                      </h1>
                    ) : null}
                    {sec.config.subtitle && !heroSubOvr.hidden ? (
                      <p
                        data-node-path="hero.subtitle"
                        data-node-label="Subtítulo"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="mt-3 max-w-[46ch] text-base text-slate-100"
                        style={heroSubOvr.style}
                      >
                        {sec.config.subtitle}
                      </p>
                    ) : null}
                    {!heroCtaOvr.hidden ? (
                      <div className="mt-6 flex flex-wrap gap-3">
                        <a
                          href={safeHref(sec.config.primaryCta?.href, '#experiencia')}
                          data-node-path="hero.cta"
                          data-node-label="Botão CTA"
                          data-edit-props="text,bgColor,textColor,visibility"
                          className="inline-flex min-h-[46px] items-center rounded-xl bg-[var(--cg-accent)] px-6 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:-translate-y-0.5 hover:brightness-105"
                          style={heroCtaOvr.style}
                        >
                          {sec.config.primaryCta?.label || 'Explorar'}
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>,
            );
          }

          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-6 @min-[640px]/formula:px-6 @min-[700px]/formula:py-12">
              <div className="grid grid-cols-1 items-center gap-6 @min-[640px]/formula:gap-8 @min-[700px]/formula:grid-cols-12">
                <div className="space-y-4 @min-[700px]/formula:col-span-6">
                  {!heroTitleOvr.hidden ? (
                    <h1
                      data-node-path="hero.title"
                      data-node-label="Título principal"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="text-[clamp(1.75rem,4.5vw,3.1rem)] font-black leading-[1.05] tracking-[-0.03em] text-[var(--cg-ink)]"
                      style={{ fontFamily: 'var(--cg-heading-font)', textWrap: 'balance', ...heroTitleOvr.style }}
                    >
                      {sec.config.title}
                    </h1>
                  ) : null}
                  {sec.config.subtitle && !heroSubOvr.hidden ? (
                    <p
                      data-node-path="hero.subtitle"
                      data-node-label="Subtítulo"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="max-w-[48ch] text-sm leading-relaxed text-[var(--cg-ink-muted)] @min-[640px]/formula:text-base"
                      style={heroSubOvr.style}
                    >
                      {sec.config.subtitle}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-3 pt-1 @min-[640px]/formula:pt-2">
                    {!heroCtaOvr.hidden ? (
                      <a
                        href={safeHref(sec.config.primaryCta?.href, '#experiencia')}
                        data-testid="v9-hero-primary-cta"
                        data-node-path="hero.cta"
                        data-node-label="Botão CTA"
                        data-edit-props="text,bgColor,textColor,visibility"
                        className="inline-flex min-h-[46px] items-center rounded-xl bg-[var(--cg-accent)] px-6 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[var(--cg-accent-deep)]"
                        style={heroCtaOvr.style}
                      >
                        {sec.config.primaryCta?.label || 'Ver coleção'}
                      </a>
                    ) : null}
                    {sec.config.secondaryCta && !heroSecCtaOvr.hidden ? (
                      <button
                        type="button"
                        data-node-path="hero.secondaryCta"
                        data-node-label="Botão WhatsApp"
                        data-edit-props="text,visibility"
                        onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Vim pela vitrine.`)}
                        className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-900/15 bg-white px-5 text-sm font-bold text-[var(--cg-ink)] shadow-2xs transition-all hover:-translate-y-0.5 hover:bg-slate-50"
                        style={heroSecCtaOvr.style}
                      >
                        <MessageCircle className="size-4 text-emerald-600" />
                        <span>{sec.config.secondaryCta.label}</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {!heroImgOvr.hidden ? (
                  <div className="@min-[700px]/formula:col-span-6">
                    <div
                      data-node-path="hero.image"
                      data-node-label="Imagem da capa"
                      data-edit-props="image,visibility"
                      className="aspect-[16/10] max-h-[240px] w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-[#F1F5F9] @min-[640px]/formula:aspect-[4/3] @min-[640px]/formula:max-h-[340px]"
                    >
                      {heroImg ? (
                        <img
                          src={heroImg}
                          alt={sec.config.title}
                          className={cn(
                            'size-full',
                            sec.config.imageFit === 'cover' ? 'object-cover' : 'object-contain',
                          )}
                        />
                      ) : (() => {
                        const featured = products
                          .filter((p) => {
                            const u = sanitizeSafeAssetUrl(p.imageUrl, '');
                            return Boolean(u && !u.startsWith('data:image/svg+xml'));
                          })
                          .slice(0, 4);
                        if (featured.length > 0) {
                          return (
                            <div
                              data-testid="v9-hero-bento-collage"
                              className="grid size-full grid-cols-2 gap-2 p-2.5 bg-white/80"
                            >
                              {featured.map((item) => (
                                <div
                                  key={item.id}
                                  onClick={() => onSelectProductDetail?.(item)}
                                  className="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-1.5"
                                >
                                  <SafeCatalogImage
                                    src={sanitizeSafeAssetUrl(item.imageUrl, '')}
                                    alt={item.name}
                                    category={item.category}
                                    primaryColor={profile.brand?.primaryColor || '#0B4DB8'}
                                    className="size-full object-contain transition-transform duration-200 group-hover:scale-105"
                                  />
                                  <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-lg bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white">
                                    {formatCurrencyBRL(item.priceCents)} · {item.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <div className="flex size-full items-center justify-center text-sm font-semibold text-slate-400">
                            {storeName}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>,
          );
        }

        if (sec.type === 'DifferentialsStrip') {
          const ns = getSecNodeStyles(sec);
          const diffGridOvr = resolveNodeStyle(ns, 'differentials.grid');
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-4 @min-[640px]/formula:px-6">
              <div
                data-node-path="differentials.grid"
                data-node-label="Grade de diferenciais"
                data-edit-props="columns,bgColor"
                className={cn(
                  'grid gap-3',
                  resolveClassicGridCols(diffGridOvr.columns, 'grid-cols-1 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-4'),
                )}
                style={diffGridOvr.style}
              >
                {sec.config.items.map((item, idx) => {
                  const itemPath = `differentials.item.${idx}`;
                  const itemOvr = resolveNodeStyle(ns, itemPath);
                  if (itemOvr.hidden) return null;
                  const titleOvr = resolveNodeStyle(ns, `${itemPath}.title`);
                  const textOvr = resolveNodeStyle(ns, `${itemPath}.text`);
                  return (
                    <div
                      key={idx}
                      data-node-path={itemPath}
                      data-node-label={`Diferencial ${idx + 1}`}
                      data-edit-props="bgColor,visibility"
                      className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-4"
                      style={itemOvr.style}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cg-surface-alt)] text-[var(--cg-accent)]">
                        {renderWhitelistedIcon(item.icon)}
                      </div>
                      <div>
                        <p
                          data-node-path={`${itemPath}.title`}
                          data-node-label={`Título · ${item.title}`}
                          data-edit-props="text,fontSize,textColor"
                          className="text-sm font-bold text-[var(--cg-ink)]"
                          style={titleOvr.style}
                        >
                          {item.title}
                        </p>
                        {item.text ? (
                          <p
                            data-node-path={`${itemPath}.text`}
                            data-node-label={`Descrição · ${item.title}`}
                            data-edit-props="text,fontSize,textColor"
                            className="mt-0.5 text-xs text-[var(--cg-ink-muted)]"
                            style={textOvr.style}
                          >
                            {item.text}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
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
              pixDiscountPercent={pixDiscountPercent}
              onAddToCart={onAddToCart}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />,
          );
        }

        if (sec.type === 'EditorialMediaSplit') {
          const ns = getSecNodeStyles(sec);
          const mediaUrl = sanitizeSafeAssetUrl(sec.config.imageUrl, '');
          const imgOvr = resolveNodeStyle(ns, 'editorial.image');
          const titleOvr = resolveNodeStyle(ns, 'editorial.title');
          const bodyOvr = resolveNodeStyle(ns, 'editorial.body');
          const mediaSide = !imgOvr.hidden ? (
            <div
              data-node-path="editorial.image"
              data-node-label="Imagem editorial"
              data-edit-props="image,visibility"
              className="aspect-[4/3] w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-[#F1F5F9]"
            >
              {mediaUrl ? (
                <img src={mediaUrl} alt={sec.config.title} className="size-full object-cover" />
              ) : null}
            </div>
          ) : null;
          const textSide = (
            <div className="space-y-4">
              {sec.config.eyebrow ? (
                <span className="inline-block text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">
                  {sec.config.eyebrow}
                </span>
              ) : null}
              {!titleOvr.hidden ? (
                <h2
                  data-node-path="editorial.title"
                  data-node-label="Título da história"
                  data-edit-props="text,fontSize,textAlign,textColor,visibility"
                  className="text-2xl font-extrabold text-[var(--cg-ink)] @min-[640px]/formula:text-3xl"
                  style={{ fontFamily: 'var(--cg-heading-font)', ...titleOvr.style }}
                >
                  {sec.config.title}
                </h2>
              ) : null}
              {!bodyOvr.hidden ? (
                <p
                  data-node-path="editorial.body"
                  data-node-label="Texto da história"
                  data-edit-props="text,fontSize,textAlign,textColor,visibility"
                  className="text-sm leading-relaxed text-[var(--cg-ink-muted)] @min-[640px]/formula:text-base"
                  style={bodyOvr.style}
                >
                  {sec.config.body}
                </p>
              ) : null}
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
          const ns = getSecNodeStyles(sec);
          const hlTitleOvr = resolveNodeStyle(ns, 'highlights.title');
          const hlSubOvr = resolveNodeStyle(ns, 'highlights.subtitle');
          const hlGridOvr = resolveNodeStyle(ns, 'highlights.grid');
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              {!hlTitleOvr.hidden ? (
                <h2
                  data-node-path="highlights.title"
                  data-node-label="Título dos destaques"
                  data-edit-props="text,fontSize,textAlign,textColor,visibility"
                  className="text-2xl font-extrabold text-[var(--cg-ink)]"
                  style={{ fontFamily: 'var(--cg-heading-font)', ...hlTitleOvr.style }}
                >
                  {sec.config.title}
                </h2>
              ) : null}
              {sec.config.subtitle && !hlSubOvr.hidden ? (
                <p
                  data-node-path="highlights.subtitle"
                  data-node-label="Subtítulo dos destaques"
                  data-edit-props="text,fontSize,textAlign,textColor,visibility"
                  className="mt-1 text-sm text-[var(--cg-ink-muted)]"
                  style={hlSubOvr.style}
                >
                  {sec.config.subtitle}
                </p>
              ) : null}
              <div
                data-node-path="highlights.grid"
                data-node-label="Grade de destaques"
                data-edit-props="columns,bgColor"
                className={cn(
                  'mt-6 grid gap-4',
                  resolveClassicGridCols(
                    hlGridOvr.columns,
                    cn('grid-cols-1', sec.config.columns === 3 ? '@min-[640px]/formula:grid-cols-3' : '@min-[640px]/formula:grid-cols-2'),
                  ),
                )}
                style={hlGridOvr.style}
              >
                {sec.config.cards.map((c, idx) => {
                  const cardPath = `highlights.card.${idx}`;
                  const cardOvr = resolveNodeStyle(ns, cardPath);
                  if (cardOvr.hidden) return null;
                  const cardImgOvr = resolveNodeStyle(ns, `${cardPath}.image`);
                  const cardTitleOvr = resolveNodeStyle(ns, `${cardPath}.title`);
                  const cardCtaOvr = resolveNodeStyle(ns, `${cardPath}.cta`);
                  const cardImg = sanitizeSafeAssetUrl(c.imageUrl, '');
                  return (
                  <div
                    key={idx}
                    data-node-path={cardPath}
                    data-node-label={`Card ${idx + 1} · ${c.title}`}
                    data-edit-props="bgColor,visibility"
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] p-5"
                    style={cardOvr.style}
                  >
                    <div>
                      {cardImg && !cardImgOvr.hidden ? (
                        <div
                          data-node-path={`${cardPath}.image`}
                          data-node-label={`Imagem Card ${idx + 1}`}
                          data-edit-props="image,visibility"
                          className="mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-[#F1F5F9]"
                        >
                          <img src={cardImg} alt={c.title} className="size-full object-cover" />
                        </div>
                      ) : null}
                      {c.eyebrow ? (
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--cg-accent)]">{c.eyebrow}</span>
                      ) : null}
                      {!cardTitleOvr.hidden ? (
                        <h3
                          data-node-path={`${cardPath}.title`}
                          data-node-label={`Título Card ${idx + 1}`}
                          data-edit-props="text,fontSize,textColor,visibility"
                          className="mt-1 text-lg font-bold text-[var(--cg-ink)]"
                          style={cardTitleOvr.style}
                        >
                          {c.title}
                        </h3>
                      ) : null}
                      {c.description ? <p className="mt-1 text-sm text-[var(--cg-ink-muted)]">{c.description}</p> : null}
                    </div>
                    {!cardCtaOvr.hidden ? (
                      <a
                        href={safeHref(c.href, '#catalogo')}
                        data-node-path={`${cardPath}.cta`}
                        data-node-label={`Botão Card ${idx + 1}`}
                        data-edit-props="text,bgColor,textColor,visibility"
                        className="mt-4 inline-flex w-fit items-center rounded-full border border-slate-300 px-4 py-1.5 text-xs font-bold text-[var(--cg-ink)] hover:bg-slate-50"
                        style={cardCtaOvr.style}
                      >
                        {c.ctaLabel || 'Ver detalhes'}
                      </a>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </section>,
          );
        }

        if (sec.type === 'FaqAccordion' || sec.type === 'ContextualFaq') {
          return wrapEditable(
            sec,
            <ContextualFaqBlock
              title={sec.config.title}
              subtitle={sec.config.subtitle}
              items={sec.config.items}
            />,
          );
        }

        if (sec.type === 'ComplementaryBundles') {
          return wrapEditable(
            sec,
            <ComplementaryBundlesBlock
              title={sec.config.title}
              subtitle={sec.config.subtitle}
              items={sec.config.items}
              products={products}
              pixDiscountPercent={pixDiscountPercent}
              onAddToCart={onAddToCart}
            />,
          );
        }

        if (sec.type === 'CatalogGrid') {
          const ns = getSecNodeStyles(sec);
          const catTitleOvr = resolveNodeStyle(ns, 'catalog.title');
          const catSubOvr = resolveNodeStyle(ns, 'catalog.subtitle');
          const catGridOvr = resolveNodeStyle(ns, 'catalog.grid');
          const activeCategory = catalogCategories.includes(selectedCategory)
            ? selectedCategory
            : 'Todas';
          const rawSelectedSkuIds = (sec.config as { selectedSkuIds?: string[] }).selectedSkuIds;
          const groupDisplayMode = (sec.config as { groupDisplayMode?: 'only_selected' | 'prioritize' }).groupDisplayMode || 'prioritize';
          const selectedSkuSet = new Set(
            Array.isArray(rawSelectedSkuIds)
              ? rawSelectedSkuIds.map((id: string) => String(id).trim()).filter(Boolean)
              : [],
          );
          const filteredRaw = products.filter((p) => {
            const cat = (p.category || 'Geral').trim() || 'Geral';
            if (activeCategory !== 'Todas' && cat !== activeCategory) return false;
            return matchesProductQuery(p, searchQuery);
          });
          const filtered =
            selectedSkuSet.size > 0
              ? groupDisplayMode === 'only_selected'
                ? filteredRaw.filter((p) => selectedSkuSet.has(String(p.id)) || selectedSkuSet.has(String(p.sku)))
                : [
                    ...filteredRaw.filter((p) => selectedSkuSet.has(String(p.id)) || selectedSkuSet.has(String(p.sku))),
                    ...filteredRaw.filter((p) => !selectedSkuSet.has(String(p.id)) && !selectedSkuSet.has(String(p.sku))),
                  ]
              : filteredRaw;

          return wrapEditable(
            sec,
            <section id="catalogo" data-testid="v9-catalog-grid" className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  {!catTitleOvr.hidden ? (
                    <h2
                      data-node-path="catalog.title"
                      data-node-label="Título do catálogo"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="text-2xl font-extrabold text-[var(--cg-ink)] @min-[640px]/formula:text-3xl"
                      style={{ fontFamily: 'var(--cg-heading-font)', ...catTitleOvr.style }}
                    >
                      {sec.config.title || 'Catálogo'}
                    </h2>
                  ) : null}
                  {sec.config.subtitle && !catSubOvr.hidden ? (
                    <p
                      data-node-path="catalog.subtitle"
                      data-node-label="Subtítulo do catálogo"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="mt-1 text-sm text-[var(--cg-ink-muted)]"
                      style={catSubOvr.style}
                    >
                      {sec.config.subtitle}
                    </p>
                  ) : null}
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

              <div
                data-node-path="catalog.grid"
                data-node-label="Grade do catálogo"
                data-edit-props="columns,groupFilter,bgColor"
                className={cn(
                  'mt-6 grid gap-2.5 @min-[640px]/formula:gap-4',
                  resolveClassicGridCols(catGridOvr.columns, 'grid-cols-2 @min-[640px]/formula:grid-cols-2 @min-[900px]/formula:grid-cols-4'),
                )}
                style={catGridOvr.style}
              >
                {filtered.map((prod) => {
                  const skuKey = prod.sku || prod.id;
                  const cardPath = `catalog.card.${skuKey}`;
                  const cardOvr = resolveNodeStyle(ns, cardPath);
                  if (cardOvr.hidden) return null;
                  const imgOvr = resolveNodeStyle(ns, `${cardPath}.image`);
                  const titleOvr = resolveNodeStyle(ns, `${cardPath}.title`);
                  const priceOvr = resolveNodeStyle(ns, `${cardPath}.price`);
                  const ctaOvr = resolveNodeStyle(ns, `${cardPath}.cta`);

                  const isAdded = Boolean(addedIds[prod.id]);
                  const safeProdImg = sanitizeSafeAssetUrl(prod.imageUrl, '');
                  const hasRealImg = Boolean(safeProdImg && !safeProdImg.startsWith('data:image/svg+xml'));
                  return (
                    <article
                      key={prod.id}
                      data-testid={`v9-catalog-card-${prod.sku}`}
                      data-node-path={cardPath}
                      data-node-label={`Card · ${prod.name}`}
                      data-edit-props="bgColor,visibility"
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-[var(--cg-card)] transition-shadow hover:shadow-md"
                      style={cardOvr.style}
                    >
                      <div>
                        {/* Cinza neutro #F1F5F9 quando SKU ainda sem foto */}
                        {!imgOvr.hidden ? (
                          <div
                            data-node-path={`${cardPath}.image`}
                            data-node-label={`Foto · ${prod.name}`}
                            data-edit-props="image,visibility"
                            onClick={() => onSelectProductDetail?.(prod)}
                            className="relative aspect-square w-full cursor-pointer overflow-hidden bg-[#F1F5F9]"
                          >
                            {hasRealImg ? (
                              <SafeCatalogImage
                                src={safeProdImg}
                                alt={prod.name}
                                category={prod.category}
                                primaryColor={profile.brand?.primaryColor || '#0B4DB8'}
                                style={{
                                  objectPosition: `${prod.imageFocalPoint?.x ?? 50}% ${prod.imageFocalPoint?.y ?? 50}%`,
                                }}
                                className="size-full object-cover"
                              />
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
                        ) : null}

                        <div className="p-4">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--cg-ink-muted)]">
                            {prod.category || 'Geral'}
                          </span>
                          {!titleOvr.hidden ? (
                            <h3
                              data-node-path={`${cardPath}.title`}
                              data-node-label={`Nome · ${prod.name}`}
                              data-edit-props="fontSize,textColor,visibility"
                              onClick={() => onSelectProductDetail?.(prod)}
                              className="mt-1 cursor-pointer text-sm font-extrabold text-[var(--cg-ink)] hover:text-[var(--cg-accent)]"
                              style={titleOvr.style}
                            >
                              {prod.name}
                            </h3>
                          ) : null}
                          {prod.variation && prod.variation !== 'Padrão' ? (
                            <p className="mt-0.5 text-xs text-[var(--cg-ink-muted)]">{prod.variation}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2.5 px-4 pb-4">
                        {pixDiscountPercent > 0 ? (
                          <span
                            data-testid={`v9-card-pix-pill-${prod.sku}`}
                            className="cg-tabular inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800"
                          >
                            Economize {formatCurrencyBRL(Math.round((prod.priceCents * pixDiscountPercent) / 100))} no Pix
                          </span>
                        ) : null}
                        {!priceOvr.hidden ? (
                          <div
                            data-node-path={`${cardPath}.price`}
                            data-node-label={`Preço · ${prod.name}`}
                            data-edit-props="fontSize,textColor,visibility"
                            className="cg-tabular whitespace-nowrap text-lg font-black text-[var(--cg-ink)]"
                            style={priceOvr.style}
                          >
                            {formatCurrencyBRL(prod.priceCents)}
                          </div>
                        ) : null}
                        {(() => {
                          const effectiveStock = typeof prod.stock === 'number' ? prod.stock : prod.stockQty;
                          const isOutOfStock =
                            prod.autoPausedOutOfStock === true ||
                            (Boolean(prod.trackStock) && Number(effectiveStock ?? 0) <= 0);
                          if (ctaOvr.hidden) return null;
                          return isOutOfStock ? (
                          <button
                            type="button"
                            disabled
                            data-testid={`v9-add-cart-${prod.sku}`}
                            data-node-path={`${cardPath}.cta`}
                            data-node-label={`Botão · ${prod.name}`}
                            data-edit-props="text,bgColor,textColor,visibility"
                            className="inline-flex min-h-[40px] w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-200 px-2 text-center text-[11px] font-bold text-slate-500 @min-[640px]/formula:min-h-[44px] @min-[640px]/formula:px-3 @min-[640px]/formula:text-xs"
                            style={ctaOvr.style}
                          >
                            Esgotado
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-testid={`v9-add-cart-${prod.sku}`}
                            data-node-path={`${cardPath}.cta`}
                            data-node-label={`Botão · ${prod.name}`}
                            data-edit-props="text,bgColor,textColor,visibility"
                            onClick={() => handleCardAdd(prod)}
                            className={cn(
                              'inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-2 text-center text-[11px] font-bold leading-tight text-white transition-colors @min-[640px]/formula:min-h-[44px] @min-[640px]/formula:px-3 @min-[640px]/formula:text-xs',
                              isAdded
                                ? 'bg-emerald-600'
                                : 'bg-[var(--cg-accent)] hover:bg-[var(--cg-accent-deep)]',
                            )}
                            style={ctaOvr.style}
                          >
                            {isAdded ? (
                              <>
                                <Check className="size-3.5 shrink-0" />
                                <span>Adicionado</span>
                              </>
                            ) : (
                              <span>{sec.config.itemActionLabel || 'Adicionar à sacola'}</span>
                            )}
                          </button>
                        );
                        })()}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>,
          );
        }

        if (sec.type === 'ClosingScheduleSplit') {
          const ns = getSecNodeStyles(sec);
          const closingImg = sanitizeSafeAssetUrl(
            sec.config.imageUrl || profile.brand?.storefrontPhotoUrl || '',
            '',
          );
          const eyebrowOvr = resolveNodeStyle(ns, 'schedule.eyebrow');
          const titleOvr = resolveNodeStyle(ns, 'schedule.title');
          const subOvr = resolveNodeStyle(ns, 'schedule.subtitle');
          const slotsOvr = resolveNodeStyle(ns, 'schedule.slots');
          const imgOvr = resolveNodeStyle(ns, 'schedule.image');
          const waHeadingOvr = resolveNodeStyle(ns, 'schedule.whatsappHeading');
          const ctaOvr = resolveNodeStyle(ns, 'schedule.cta');
          return wrapEditable(
            sec,
            <section className="mx-auto max-w-6xl px-4 py-10 @min-[640px]/formula:px-6">
              <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-slate-200/80 bg-[var(--cg-card)] p-6 @min-[640px]/formula:p-8 @min-[900px]/formula:grid-cols-2">
                <div className="space-y-3">
                  {sec.config.eyebrow && !eyebrowOvr.hidden ? (
                    <span
                      data-node-path="schedule.eyebrow"
                      data-node-label="Selo de atendimento"
                      data-edit-props="text,textColor,visibility"
                      className="text-xs font-extrabold uppercase tracking-wider text-[var(--cg-accent)]"
                      style={eyebrowOvr.style}
                    >
                      {sec.config.eyebrow}
                    </span>
                  ) : null}
                  {!titleOvr.hidden ? (
                    <h2
                      data-node-path="schedule.title"
                      data-node-label="Título de horários"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="text-2xl font-extrabold text-[var(--cg-ink)]"
                      style={{ fontFamily: 'var(--cg-heading-font)', ...titleOvr.style }}
                    >
                      {sec.config.title}
                    </h2>
                  ) : null}
                  {sec.config.subtitle && !subOvr.hidden ? (
                    <p
                      data-node-path="schedule.subtitle"
                      data-node-label="Subtítulo de horários"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="text-sm text-[var(--cg-ink-muted)]"
                      style={subOvr.style}
                    >
                      {sec.config.subtitle}
                    </p>
                  ) : null}
                  {sec.config.slots?.length && !slotsOvr.hidden ? (
                    sec.config.slots.some((sl) => /(seg|ter|qua|qui|sex|s[aá]b|dom|dia)/i.test(sl)) ? (
                      <div
                        data-node-path="schedule.slots"
                        data-node-label="Grade de horários"
                        data-edit-props="columns,bgColor,visibility"
                        className={cn(
                          'grid gap-2 pt-2',
                          resolveClassicGridCols(slotsOvr.columns, 'grid-cols-1 sm:grid-cols-2'),
                        )}
                        data-testid="closing-daily-schedule-grid"
                        style={slotsOvr.style}
                      >
                        {sec.config.slots.map((sl, i) => {
                          const slotPath = `schedule.slot.${i}`;
                          const slotOvr = resolveNodeStyle(ns, slotPath);
                          if (slotOvr.hidden) return null;
                          const [dayPart, ...restParts] = sl.split('·').map((x) => x.trim());
                          const detailPart = restParts.join(' · ');
                          return (
                            <div
                              key={i}
                              data-node-path={slotPath}
                              data-node-label={`Horário · ${dayPart}`}
                              data-edit-props="text,bgColor,textColor,visibility"
                              className="flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-[var(--cg-surface)] px-3.5 py-2.5"
                              style={slotOvr.style}
                            >
                              <span className="text-xs font-extrabold text-[var(--cg-ink)]">{dayPart}</span>
                              {detailPart ? (
                                <span className="mt-0.5 text-[11px] font-medium text-[var(--cg-ink-muted)]">
                                  {detailPart}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        data-node-path="schedule.slots"
                        data-node-label="Horários e dias"
                        data-edit-props="bgColor,visibility"
                        className="flex flex-wrap gap-2 pt-1"
                        style={slotsOvr.style}
                      >
                        {sec.config.slots.map((sl, i) => {
                          const slotPath = `schedule.slot.${i}`;
                          const slotOvr = resolveNodeStyle(ns, slotPath);
                          if (slotOvr.hidden) return null;
                          return (
                            <span
                              key={i}
                              data-node-path={slotPath}
                              data-node-label={`Horário ${i + 1}`}
                              data-edit-props="text,bgColor,textColor,visibility"
                              className="rounded-full bg-[var(--cg-surface-alt)] px-3 py-1 text-xs font-bold text-[var(--cg-ink)]"
                              style={slotOvr.style}
                            >
                              {sl}
                            </span>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                </div>

                <div className="space-y-4">
                  {closingImg && !imgOvr.hidden ? (
                    <div
                      data-node-path="schedule.image"
                      data-node-label="Foto do atendimento"
                      data-edit-props="image,visibility"
                      className="aspect-[16/9] overflow-hidden rounded-2xl bg-[#F1F5F9]"
                    >
                      <img src={closingImg} alt={storeName} className="size-full object-cover" />
                    </div>
                  ) : null}
                  {!waHeadingOvr.hidden ? (
                    <h3
                      data-node-path="schedule.whatsappHeading"
                      data-node-label="Chamada WhatsApp"
                      data-edit-props="text,fontSize,textColor,visibility"
                      className="text-lg font-extrabold text-[var(--cg-ink)]"
                      style={waHeadingOvr.style}
                    >
                      {sec.config.whatsappHeading}
                    </h3>
                  ) : null}
                  {sec.config.whatsappSubtext ? (
                    <p className="text-sm text-[var(--cg-ink-muted)]">{sec.config.whatsappSubtext}</p>
                  ) : null}
                  {!ctaOvr.hidden ? (
                    <button
                      type="button"
                      data-node-path="schedule.cta"
                      data-node-label="Botão WhatsApp"
                      data-edit-props="text,bgColor,textColor,visibility"
                      onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--cg-accent)] px-6 text-sm font-bold text-white hover:bg-[var(--cg-accent-deep)]"
                      style={ctaOvr.style}
                    >
                      <MessageCircle className="size-4" />
                      <span>{sec.config.ctaLabel || 'Chamar no WhatsApp'}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </section>,
          );
        }

        if (sec.type === 'RichFooter') {
          const ns = getSecNodeStyles(sec);
          const tagOvr = resolveNodeStyle(ns, 'footer.tagline');
          return wrapEditable(
            sec,
            <footer className="mt-8 bg-[var(--cg-footer-bg)] py-10 text-slate-200">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 @min-[640px]/formula:px-6">
                <div>
                  <strong className="text-base font-extrabold text-white">{storeName}</strong>
                  {sec.config.tagline && !tagOvr.hidden ? (
                    <p
                      data-node-path="footer.tagline"
                      data-node-label="Frase do rodapé"
                      data-edit-props="text,fontSize,textColor,visibility"
                      className="mt-1 text-xs text-slate-300"
                      style={tagOvr.style}
                    >
                      {sec.config.tagline}
                    </p>
                  ) : null}
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

      {Array.isArray(formulaV9.atomicBlueprint?.sections) &&
      formulaV9.atomicBlueprint.sections.length >= 1 ? (
        <div
          data-testid="v9-atomic-blueprint-root"
          className="w-full"
        >
          {appliedCoupon ? (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs font-semibold text-emerald-900">
              Cupom <strong>{appliedCoupon.code}</strong> ativo (-{appliedCoupon.discountPercent}% no pedido)
            </div>
          ) : null}
          {formulaV9.atomicBlueprint.sections.map((atomicSec, idx) => (
            <AtomicSectionRenderer
              key={String(atomicSec?.tuple?.[0] || idx)}
              section={atomicSec}
              index={idx}
              storeName={storeName}
              logoUrl={logoUrl}
              profile={profile}
              engineSeed={atomicSeed}
              products={products}
              primaryColor={profile.brand?.primaryColor || '#18181B'}
              accentColor={profile.brand?.accentColor || '#D8A848'}
              externalCategoryFilter={selectedCategory}
              onSelectCategoryFilter={(cat) => setSelectedCategory(cat)}
              appliedCoupon={appliedCoupon}
              onApplyCoupon={(code, discountPercent) => setAppliedCoupon({ code, discountPercent })}
              onAddToCart={onAddToCart}
              onSelectProductDetail={onSelectProductDetail}
              onDirectWhatsappSend={(msg) => {
                const couponNote = appliedCoupon
                  ? `\nCupom aplicado: ${appliedCoupon.code} (-${appliedCoupon.discountPercent}%)`
                  : '';
                onDirectWhatsappSend?.(`${msg}${couponNote}`);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
