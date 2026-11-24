import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  Gift,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  X,
  Zap,
} from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { formatCurrencyBRL, type BusinessProfile, type CatalogProduct } from '@/schemas/profile.schema';
import { cn } from '@/lib/utils';
import {
  compileAtomicSectionDesign,
  computeStaggerDelaySec,
  ensureSafeAccentContrast,
  ensureSafeInkContrast,
  renderHighlightedCopy,
  type CompiledSectionDesign,
  type OrnamentSignature,
} from './AtomicGrammarCompiler';
import {
  BlackFridayFinePrintBand,
  BlackFridayMassiveHero,
  BundleBuilderCalculator,
  CalendarDeliverySlotsBand,
  CheckpointJourneyStrip,
  ChristmasKnitHeroStage,
  ClinicEditorialHeroAndStrip,
  ClinicSpecialistsDeck,
  FlipCountdownMatrix,
  InteractiveImageTextStage,
  InteractiveSymptomOrNeedMap,
  InteractiveTearCouponBib,
  NumberedEditorialPricingTiers,
  RecoveryCaseScoreboard,
  SlantedStampAndFeatureSplit,
} from './LazyReferencePacks';

export const CURATED_ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  sparkles: Sparkles,
  shield: ShieldCheck,
  truck: Truck,
  zap: Zap,
  gift: Gift,
  map_pin: MapPin,
  clock: Clock,
  check: Check,
  message_circle: MessageCircle,
  star: Star,
};

export interface SafeCatalogImageProps {
  src?: string;
  alt: string;
  category?: string;
  primaryColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SafeCatalogImage({
  src,
  alt,
  category = 'Loja',
  primaryColor = '#18181B',
  className,
  style,
}: SafeCatalogImageProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const cleanSrc = typeof src === 'string' ? src.trim() : '';
  const showFallback = !cleanSrc || broken || /^data:image\/svg\+xml/i.test(cleanSrc);

  if (showFallback) {
    const initials = (alt || category || 'CG')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'CG';

    return (
      <div
        data-testid="v9-neutral-gray-thumb"
        className={cn(
          'flex size-full flex-col items-center justify-center gap-1.5 bg-[#FBF6EE] p-3 text-center text-slate-700',
          className,
        )}
        style={style}
      >
        <span
          className="flex size-10 items-center justify-center rounded-xl border border-slate-300/60 bg-white text-sm font-extrabold tracking-tight text-slate-900 shadow-2xs"
          style={{ borderBottom: `3px solid ${primaryColor}` }}
        >
          {initials}
        </span>
        {category ? (
          <span className="max-w-full truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {category}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={cleanSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0) setBroken(true);
      }}
      className={cn('size-full object-cover', className)}
      style={style}
    />
  );
}

function CornerSparksSvg({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className="ml-1.5 inline-block -translate-y-2 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 11L9 4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 14L18 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M10 19L20 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function PaperGrainOverlay({ opacity }: { opacity: number }) {
  if (!opacity || opacity <= 0) return null;
  return (
    <div
      data-atomic-grain="true"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
      style={{
        opacity,
        backgroundImage:
          'radial-gradient(rgba(15,23,42,0.45) 0.5px, transparent 0.5px), radial-gradient(rgba(255,255,255,0.35) 0.5px, transparent 0.5px)',
        backgroundSize: '12px 12px',
        backgroundPosition: '0 0, 6px 6px',
      }}
    />
  );
}

export interface NodeStyleOverride {
  fontSizePx?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  bgColor?: string;
  columns?: 1 | 2 | 3 | 4;
}

export interface NodeStylesConfig {
  hiddenNodes?: string[];
  nodes?: Record<string, NodeStyleOverride>;
  fontSizePx?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  bgColor?: string;
  columns?: 1 | 2 | 3 | 4;
  [key: string]: unknown;
}

export function isNodeHidden(nodeStyles: NodeStylesConfig | undefined, nodePath: string): boolean {
  if (!nodeStyles || !Array.isArray(nodeStyles.hiddenNodes)) return false;
  return nodeStyles.hiddenNodes.includes(nodePath);
}

export function resolveNodeStyle(
  nodeStyles: NodeStylesConfig | undefined,
  nodePath: string,
): { hidden: boolean; style: React.CSSProperties; columns?: 1 | 2 | 3 | 4 } {
  const hidden = isNodeHidden(nodeStyles, nodePath);
  if (!nodeStyles || typeof nodeStyles !== 'object') {
    return { hidden, style: {} };
  }
  const directCandidate = nodeStyles[nodePath];
  const nodeMapCandidate = nodeStyles.nodes?.[nodePath];
  const rawOverride =
    (nodeMapCandidate && typeof nodeMapCandidate === 'object' ? nodeMapCandidate : undefined) ||
    (directCandidate && typeof directCandidate === 'object' && !Array.isArray(directCandidate)
      ? (directCandidate as NodeStyleOverride)
      : undefined);

  const fontSizePx =
    typeof rawOverride?.fontSizePx === 'number'
      ? rawOverride.fontSizePx
      : nodePath === 'section' && typeof nodeStyles.fontSizePx === 'number'
        ? nodeStyles.fontSizePx
        : undefined;
  const textAlign =
    rawOverride?.textAlign ||
    (nodePath === 'section' ? nodeStyles.textAlign : undefined);
  const textColor =
    rawOverride?.textColor ||
    (nodePath === 'section' ? nodeStyles.textColor : undefined);
  const bgColor =
    rawOverride?.bgColor ||
    (nodePath === 'section' ? nodeStyles.bgColor : undefined);
  const fontFamily =
    rawOverride?.fontFamily ||
    (nodePath === 'section' ? nodeStyles.fontFamily : undefined);
  const fontWeight =
    rawOverride?.fontWeight ??
    (nodePath === 'section' ? nodeStyles.fontWeight : undefined);
  const columns =
    rawOverride?.columns ||
    (nodePath === 'section' || nodePath.endsWith('.grid') ? nodeStyles.columns : undefined);

  const style: React.CSSProperties = {};
  if (typeof fontSizePx === 'number' && fontSizePx > 0) style.fontSize = `${fontSizePx}px`;
  if (typeof fontFamily === 'string' && fontFamily.trim()) style.fontFamily = fontFamily.trim();
  if (fontWeight !== undefined) style.fontWeight = fontWeight;
  if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') style.textAlign = textAlign;
  if (typeof textColor === 'string' && textColor.trim()) style.color = textColor.trim();
  if (typeof bgColor === 'string' && bgColor.trim()) style.backgroundColor = bgColor.trim();

  return { hidden, style, columns };
}

export function resolveGridColumnsClass(columns: number | undefined, fallbackClass: string): string {
  if (columns === 1) return 'grid-cols-1';
  if (columns === 2) return 'grid-cols-2 sm:grid-cols-2';
  if (columns === 3) return 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3';
  if (columns === 4) return 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4';
  return fallbackClass;
}

function SectionHeadingOrnament({
  title,
  subtitle,
  ornamentKind,
  inkHex,
  accentHex,
  mutedHex,
  hairlineColor,
  h2Style,
  nodeStyles,
  titlePath = 'section.title',
  subtitlePath = 'section.subtitle',
  titleLabel = 'Título da seção',
  subtitleLabel = 'Subtítulo da seção',
}: {
  title: string;
  subtitle?: string;
  ornamentKind: OrnamentSignature;
  inkHex: string;
  accentHex: string;
  mutedHex: string;
  hairlineColor: string;
  h2Style: React.CSSProperties;
  nodeStyles?: NodeStylesConfig;
  titlePath?: string;
  subtitlePath?: string;
  titleLabel?: string;
  subtitleLabel?: string;
}) {
  if (!title) return null;
  const titleOverride = resolveNodeStyle(nodeStyles, titlePath);
  const subtitleOverride = resolveNodeStyle(nodeStyles, subtitlePath);
  const showTitle = !titleOverride.hidden;
  const showSubtitle = Boolean(subtitle) && !subtitleOverride.hidden;
  if (!showTitle && !showSubtitle) return null;

  const mergedH2Style: React.CSSProperties = { ...h2Style, color: inkHex, ...titleOverride.style };
  const mergedSubStyle: React.CSSProperties = { color: mutedHex, ...subtitleOverride.style };

  if (ornamentKind === 'flanked_lines') {
    return (
      <div className="space-y-2 text-center">
        {showTitle ? (
          <div className="flex items-center gap-4">
            <div className="h-px flex-1" style={{ backgroundColor: hairlineColor }} />
            <h2
              data-node-path={titlePath}
              data-node-label={titleLabel}
              data-edit-props="text,fontSize,textAlign,textColor,visibility"
              className="shrink-0 font-bold"
              style={mergedH2Style}
            >
              {renderHighlightedCopy(title, accentHex)}
            </h2>
            <div className="h-px flex-1" style={{ backgroundColor: hairlineColor }} />
          </div>
        ) : null}
        {showSubtitle ? (
          <p
            data-node-path={subtitlePath}
            data-node-label={subtitleLabel}
            data-edit-props="text,fontSize,textAlign,textColor,visibility"
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={mergedSubStyle}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    );
  }

  if (ornamentKind === 'slanted_bar') {
    return (
      <div className="space-y-1.5">
        {showTitle ? (
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-[1em] w-2 shrink-0 -skew-x-12 rounded-xs"
              style={{ backgroundColor: accentHex }}
              aria-hidden="true"
            />
            <h2
              data-node-path={titlePath}
              data-node-label={titleLabel}
              data-edit-props="text,fontSize,textAlign,textColor,visibility"
              className="font-extrabold"
              style={mergedH2Style}
            >
              {renderHighlightedCopy(title, accentHex)}
            </h2>
          </div>
        ) : null}
        {showSubtitle ? (
          <p
            data-node-path={subtitlePath}
            data-node-label={subtitleLabel}
            data-edit-props="text,fontSize,textAlign,textColor,visibility"
            className="pl-5 text-sm"
            style={mergedSubStyle}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    );
  }

  if (ornamentKind === 'corner_sparks') {
    return (
      <div className="space-y-1.5">
        {showTitle ? (
          <h2
            data-node-path={titlePath}
            data-node-label={titleLabel}
            data-edit-props="text,fontSize,textAlign,textColor,visibility"
            className="font-extrabold"
            style={mergedH2Style}
          >
            {renderHighlightedCopy(title, accentHex)}
            <CornerSparksSvg color={accentHex} />
          </h2>
        ) : null}
        {showSubtitle ? (
          <p
            data-node-path={subtitlePath}
            data-node-label={subtitleLabel}
            data-edit-props="text,fontSize,textAlign,textColor,visibility"
            className="text-sm"
            style={mergedSubStyle}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    );
  }

  // trailing_line (default editorial signature)
  return (
    <div className="space-y-1.5">
      {showTitle ? (
        <div className="flex items-center gap-4">
          <h2
            data-node-path={titlePath}
            data-node-label={titleLabel}
            data-edit-props="text,fontSize,textAlign,textColor,visibility"
            className="shrink-0 font-bold"
            style={mergedH2Style}
          >
            {renderHighlightedCopy(title, accentHex)}
          </h2>
          <div className="h-px flex-1" style={{ backgroundColor: hairlineColor }} />
        </div>
      ) : null}
      {showSubtitle ? (
        <p
          data-node-path={subtitlePath}
          data-node-label={subtitleLabel}
          data-edit-props="text,fontSize,textAlign,textColor,visibility"
          className="text-sm"
          style={mergedSubStyle}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export interface ScratchCouponCanvasProps {
  code: string;
  discountPercent: number;
  accentColor?: string;
  accentInk?: string;
  onReveal?: (code: string, discountPercent: number) => void;
}

export function ScratchCouponCanvas({
  code,
  discountPercent,
  accentColor = '#D8A848',
  accentInk = '#0F172A',
  onReveal,
}: ScratchCouponCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const moveCountRef = useRef(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(0.5, '#F8FAFC');
    grad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#18181B';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Raspe aqui para revelar seu cupom', canvas.width / 2, canvas.height / 2);
  }, [revealed]);

  const revealNow = () => {
    if (revealed) return;
    setRevealed(true);
    onReveal?.(code, discountPercent);
  };

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    moveCountRef.current += 1;
    if (moveCountRef.current % 8 === 0) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let cleared = 0;
      let sampled = 0;
      for (let i = 3; i < imgData.length; i += 4 * 16) {
        sampled += 1;
        if (imgData[i] < 64) cleared += 1;
      }
      if (sampled > 0 && cleared / sampled >= 0.4) {
        revealNow();
      }
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-3">
      <div className="relative h-[96px] w-full overflow-hidden rounded-xl border border-dashed border-slate-300 bg-[#FBF6EE]">
        <div className="flex size-full flex-col items-center justify-center gap-1 px-4 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Cupom desbloqueado
          </span>
          <span className="font-mono text-2xl font-black tracking-wider text-slate-950">
            {code}
          </span>
          <span
            className="rounded-full px-3 py-0.5 text-xs font-bold"
            style={{ backgroundColor: accentColor, color: accentInk }}
          >
            -{discountPercent}% no pedido
          </span>
        </div>
        {!revealed ? (
          <canvas
            ref={canvasRef}
            width={280}
            height={96}
            aria-label="Área de raspadinha do cupom"
            onPointerDown={(e) => {
              drawingRef.current = true;
              scratchAt(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (drawingRef.current) scratchAt(e.clientX, e.clientY);
            }}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerLeave={() => {
              drawingRef.current = false;
            }}
            className="absolute inset-0 size-full cursor-crosshair touch-none"
          />
        ) : null}
      </div>
      {!revealed ? (
        <button
          type="button"
          onClick={revealNow}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-xs font-bold shadow-xs transition-transform active:scale-[0.98]"
          style={{ backgroundColor: accentColor, color: accentInk }}
        >
          <Gift className="size-4" aria-hidden="true" />
          <span>Revelar cupom -{discountPercent}%</span>
        </button>
      ) : (
        <p className="text-center text-xs font-bold text-emerald-700">
          Cupom {code} aplicado (-{discountPercent}% na sacola)!
        </p>
      )}
    </div>
  );
}

/**
 * Componente Workbench Interativo de Dominio Bipartido (Every Layout Sidebar + Attached Contrast Rail):
 * Permite montar uma selecao com slots pontilhados/preenchidos, abas animadas com layoutId e trilho resumo acoplado.
 */
function DomainWorkbenchSection({
  section,
  compiled,
  products,
  storeName,
  primaryColor,
  onAddToCart,
  onDirectWhatsappSend,
}: {
  section: Record<string, any>;
  compiled: CompiledSectionDesign;
  products: CatalogProduct[];
  storeName: string;
  primaryColor: string;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
  onDirectWhatsappSend?: (message: string) => void;
}) {
  const st = (section.surfaceTokens as Record<string, any>) || {};
  const bgHex = String(st.bgHex || '#FBF6EE');
  const inkHex = ensureSafeInkContrast(String(st.inkHex || ''), bgHex, 4.6);
  const mutedHex = ensureSafeInkContrast(String(st.mutedHex || ''), bgHex, 4.0);
  const hairline = String(st.borderColor || 'rgba(15,23,42,0.11)');
  const accentHex = ensureSafeAccentContrast(String(st.accentHex || '#D8A848'), bgHex, 4.5);
  const anchorDarkBg = String(st.anchorDarkBg || '#18181B');
  const wbCardInk = '#0F172A';
  const wbCardMuted = '#475569';
  const wbAnchorInk = ensureSafeInkContrast('#FFFFFF', anchorDarkBg, 4.6);
  const wbAnchorMuted = ensureSafeInkContrast('#CBD5E1', anchorDarkBg, 4.6);
  const wbRailAccent = ensureSafeAccentContrast(accentHex, anchorDarkBg, 4.5);
  const wbRailAccentInk = ensureSafeInkContrast('#111827', wbRailAccent, 4.6);

  const categories = useMemo(() => {
    const set = Array.from(new Set(products.map((p) => String(p.category || 'Geral').trim() || 'Geral')));
    return set.slice(0, 5);
  }, [products]);

  const [selectedCat, setSelectedCat] = useState<string>(() => categories[0] || 'Geral');
  const [slotMap, setSlotMap] = useState<Record<string, { product: CatalogProduct; qty: number }>>(() => {
    const init: Record<string, { product: CatalogProduct; qty: number }> = {};
    if (categories[0]) {
      const first = products.find((p) => (p.category || 'Geral').trim() === categories[0]);
      if (first) init[categories[0]] = { product: first, qty: 1 };
    }
    return init;
  });
  const [slotsRef] = useAutoAnimate<HTMLDivElement>();
  const [optionsRef] = useAutoAnimate<HTMLDivElement>();

  const targetSlotCats = categories.length > 0 ? categories.slice(0, 3) : ['Seleção 1', 'Seleção 2', 'Seleção 3'];
  const selectedEntries = Object.values(slotMap);
  const totalCents = selectedEntries.reduce((sum, entry) => sum + Number(entry.product.priceCents || 0) * entry.qty, 0);
  const optionsForTab = products
    .filter((p) => String(p.category || 'Geral').trim() === selectedCat)
    .slice(0, 6);

  const textSlots: Array<{ micro?: string[] }> = Array.isArray(section.textSlots) ? section.textSlots : [];
  const headingText = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Monte sua <accent>seleção</accent>';
  const captionText = textSlots.find((t) => t.micro?.[1] === 'caption')?.micro?.[2] || '';

  const pickProductForCat = (prod: CatalogProduct) => {
    const catKey = String(prod.category || selectedCat).trim() || selectedCat;
    setSlotMap((prev) => ({
      ...prev,
      [catKey]: { product: prod, qty: prev[catKey]?.qty || 1 },
    }));
  };

  const updateSlotQty = (catKey: string, delta: number) => {
    setSlotMap((prev) => {
      const cur = prev[catKey];
      if (!cur) return prev;
      const nextQty = cur.qty + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[catKey];
        return copy;
      }
      return { ...prev, [catKey]: { ...cur, qty: Math.min(20, nextQty) } };
    });
  };

  const addAllSelectionToBag = () => {
    selectedEntries.forEach(({ product, qty }) => onAddToCart(product, qty));
  };

  return (
    <section
      id="workbench"
      data-testid={`atomic-sec-${section.tuple?.[0] || 'sec_workbench'}`}
      data-atomic-role="domain_workbench"
      className="relative w-full"
      style={{ backgroundColor: bgHex, paddingTop: `${compiled.paddingY}px`, paddingBottom: `${compiled.paddingY}px` }}
    >
      <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
      <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
        <SectionHeadingOrnament
          title={headingText}
          subtitle={captionText}
          ornamentKind={compiled.ornamentKind}
          inkHex={inkHex}
          accentHex={accentHex}
          mutedHex={mutedHex}
          hairlineColor={hairline}
          h2Style={compiled.h2Style}
        />

        {/* Container Unico com Trilho Contrastante Acoplado (Attached Contrast Rail + Radius Nesting Law) */}
        <div
          className="overflow-hidden border bg-white text-slate-900"
          style={{
            borderRadius: `${compiled.outerRadiusPx}px`,
            borderColor: 'rgba(15,23,42,0.12)',
            boxShadow: compiled.shadowCss,
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Esquerda/Centro: Area de Montagem + Opcoes */}
            <div className="space-y-6 p-5 sm:p-6 lg:col-span-8">
              {/* Slots pontilhados vs preenchidos */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider" style={{ color: wbCardMuted }}>
                  <span>Sua combinação ({selectedEntries.length} de {targetSlotCats.length})</span>
                  {/* Nodes conectados ✓ —— ● —— ○ */}
                  <div className="flex items-center gap-1.5">
                    {targetSlotCats.map((cat, idx) => {
                      const filled = Boolean(slotMap[cat]);
                      return (
                        <React.Fragment key={cat}>
                          <span
                            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors"
                            style={{
                              backgroundColor: filled ? anchorDarkBg : 'transparent',
                              color: filled ? wbAnchorInk : wbCardMuted,
                              border: `1.5px solid ${filled ? anchorDarkBg : 'rgba(15,23,42,0.18)'}`,
                            }}
                          >
                            {filled ? <Check className="size-3" /> : idx + 1}
                          </span>
                          {idx < targetSlotCats.length - 1 ? (
                            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: filled ? anchorDarkBg : 'rgba(15,23,42,0.16)' }} />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <div ref={slotsRef} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {targetSlotCats.map((cat) => {
                    const entry = slotMap[cat];
                    const cleanImg = entry?.product.imageUrl && !/^data:image\/svg\+xml/i.test(entry.product.imageUrl)
                      ? entry.product.imageUrl
                      : '';
                    if (!entry) {
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCat(cat)}
                          className="flex min-h-[118px] flex-col items-center justify-center gap-2 border-2 border-dashed p-3 text-center transition-colors hover:bg-[#FBF6EE]/60"
                          style={{
                            borderRadius: `${compiled.innerRadiusPx}px`,
                            borderColor: selectedCat === cat ? anchorDarkBg : 'rgba(15,23,42,0.18)',
                          }}
                        >
                          <span
                            className="flex size-8 items-center justify-center rounded-full border bg-[#FBF6EE]"
                            style={{ borderColor: 'rgba(15,23,42,0.15)', color: wbCardInk }}
                          >
                            <Plus className="size-4" aria-hidden="true" />
                          </span>
                          <span className="text-xs font-bold" style={{ color: wbCardMuted }}>
                            Escolher {cat}
                          </span>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={cat}
                        className="relative flex min-h-[118px] flex-col justify-between border bg-[#FBF6EE]/65 p-3"
                        style={{
                          borderRadius: `${compiled.innerRadiusPx}px`,
                          borderColor: anchorDarkBg,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => updateSlotQty(cat, -entry.qty)}
                          aria-label={`Remover ${entry.product.name}`}
                          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-xs hover:text-red-600"
                        >
                          <X className="size-3.5" />
                        </button>
                        <div className="flex items-start gap-2.5 pr-6">
                          {cleanImg ? (
                            <img src={cleanImg} alt={entry.product.name} className="size-11 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-extrabold shadow-2xs"
                              style={{ borderBottom: `2px solid ${primaryColor}`, color: wbCardInk }}
                            >
                              {cat.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: wbCardMuted }}>
                              {cat}
                            </span>
                            <p className="line-clamp-2 text-xs font-bold leading-snug" style={{ color: wbCardInk }}>
                              {entry.product.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs font-extrabold tabular-nums" style={{ color: wbCardInk }}>
                            {formatCurrencyBRL(entry.product.priceCents * entry.qty)}
                          </span>
                          <div className="inline-flex items-center gap-1 rounded-full border bg-white px-1.5 py-0.5" style={{ borderColor: hairline }}>
                            <button
                              type="button"
                              onClick={() => updateSlotQty(cat, -1)}
                              aria-label="Diminuir quantidade"
                              className="flex size-5 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                            >
                              <Minus className="size-3" />
                            </button>
                            <span className="min-w-[16px] text-center text-xs font-bold tabular-nums">{entry.qty}</span>
                            <button
                              type="button"
                              onClick={() => updateSlotQty(cat, 1)}
                              aria-label="Aumentar quantidade"
                              className="flex size-5 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Abas com layoutId compartilhado */}
              <div className="space-y-3 border-t pt-4" style={{ borderColor: 'rgba(15,23,42,0.12)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold" style={{ color: wbCardInk }}>
                    Escolha um item por linha
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => {
                      const active = selectedCat === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCat(cat)}
                          className="relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors"
                          style={{ color: active ? wbAnchorInk : wbCardInk }}
                        >
                          {active ? (
                            <m.span
                              layoutId="wb-cat-tab"
                              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                              className="absolute inset-0 rounded-full"
                              style={{ backgroundColor: anchorDarkBg }}
                            />
                          ) : (
                            <span
                              className="absolute inset-0 rounded-full border bg-white"
                              style={{ borderColor: 'rgba(15,23,42,0.16)' }}
                            />
                          )}
                          <span className="relative z-10">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div ref={optionsRef} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {optionsForTab.map((prod) => {
                    const isPicked = slotMap[String(prod.category || selectedCat).trim()]?.product.id === prod.id;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => pickProductForCat(prod)}
                        className="relative flex flex-col justify-between border p-3 text-left transition-all hover:shadow-xs"
                        style={{
                          borderRadius: `${compiled.innerRadiusPx}px`,
                          borderColor: isPicked ? anchorDarkBg : 'rgba(15,23,42,0.12)',
                          backgroundColor: isPicked ? '#FBF6EE' : '#FFFFFF',
                        }}
                      >
                        {isPicked ? (
                          <span
                            className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full"
                            style={{ backgroundColor: anchorDarkBg, color: wbAnchorInk }}
                          >
                            <Check className="size-3" />
                          </span>
                        ) : null}
                        <div className="pr-6">
                          <p className="line-clamp-2 text-xs font-bold leading-snug" style={{ color: wbCardInk }}>
                            {prod.name}
                          </p>
                          {prod.variation && prod.variation !== 'Padrão' ? (
                            <span className="mt-1 inline-block text-[11px]" style={{ color: wbCardMuted }}>
                              {prod.variation}
                            </span>
                          ) : null}
                        </div>
                        <span className="mt-2.5 block text-sm font-extrabold tabular-nums" style={{ color: wbCardInk }}>
                          {formatCurrencyBRL(prod.priceCents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Direita: Trilho Resumo Contrastante Acoplado (Sem fresta!) */}
            <div
              className="flex flex-col justify-between gap-5 p-6 lg:col-span-4"
              style={{ backgroundColor: anchorDarkBg, color: wbAnchorInk }}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <span className="text-sm font-bold tracking-tight" style={{ color: wbAnchorInk }}>Resumo da seleção</span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ backgroundColor: wbRailAccent, color: wbRailAccentInk }}
                  >
                    {selectedEntries.reduce((s, e) => s + e.qty, 0)} un.
                  </span>
                </div>

                {selectedEntries.length > 0 ? (
                  <ul className="space-y-2.5 text-xs">
                    {selectedEntries.map(({ product, qty }) => (
                      <li key={product.id} className="flex items-start justify-between gap-2" style={{ color: wbAnchorMuted }}>
                        <span className="line-clamp-2">
                          <strong style={{ color: wbAnchorInk }}>{qty}×</strong> {product.name}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums" style={{ color: wbAnchorInk }}>
                          {formatCurrencyBRL(product.priceCents * qty)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs leading-relaxed" style={{ color: wbAnchorMuted }}>
                    Toque nos itens ao lado para montar seu kit personalizado e calcular o total na hora.
                  </p>
                )}
              </div>

              <div className="space-y-3 border-t border-white/15 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider" style={{ color: wbAnchorMuted }}>Total estimado</span>
                  <span className="text-2xl font-black tabular-nums" style={{ color: wbAnchorInk }}>
                    {formatCurrencyBRL(totalCents)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={selectedEntries.length === 0}
                  onClick={addAllSelectionToBag}
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                  style={{ backgroundColor: wbRailAccent, color: wbRailAccentInk }}
                >
                  <ShoppingBag className="size-4" aria-hidden="true" />
                  <span>Adicionar seleção à sacola</span>
                </button>
                <button
                  type="button"
                  disabled={selectedEntries.length === 0}
                  onClick={() => {
                    const summary = selectedEntries
                      .map((e) => `${e.qty}x ${e.product.name} (${formatCurrencyBRL(e.product.priceCents * e.qty)})`)
                      .join(', ');
                    onDirectWhatsappSend?.(`Olá ${storeName}! Montei minha seleção: ${summary}. Total: ${formatCurrencyBRL(totalCents)}.`);
                  }}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors hover:bg-white/10 disabled:opacity-40"
                  style={{ borderColor: wbAnchorInk === '#FFFFFF' ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.25)', color: wbAnchorInk }}
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  <span>Enviar seleção direto no WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export interface HeroCtaClusterProps {
  primaryHref: string;
  primaryLabel: string;
  resolvedAccent: string;
  accentInk: string;
  isDarkSurface: boolean;
  centered?: boolean;
  nodeStyles?: NodeStylesConfig;
  onWhatsappClick: () => void;
}

function HeroCtaCluster({
  primaryHref,
  primaryLabel,
  resolvedAccent,
  accentInk,
  isDarkSurface,
  centered = false,
  nodeStyles,
  onWhatsappClick,
}: HeroCtaClusterProps) {
  const safePrimaryInk = ensureSafeInkContrast(accentInk, resolvedAccent, 4.6);
  const secondaryClasses = isDarkSurface
    ? 'border-white/25 bg-white/10 text-white hover:bg-white/18 hover:border-white/40'
    : 'border-slate-900/20 bg-white/95 text-slate-900 hover:bg-slate-100 hover:border-slate-900/35';
  const primaryCtaOverride = resolveNodeStyle(nodeStyles, 'hero.cta');
  const secondaryCtaOverride = resolveNodeStyle(nodeStyles, 'hero.secondaryCta');
  if (primaryCtaOverride.hidden && secondaryCtaOverride.hidden) return null;

  return (
    <m.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-wrap items-center gap-3 pt-2', centered && 'justify-center')}
    >
      {!primaryCtaOverride.hidden ? (
        <m.a
          href={primaryHref}
          data-atomic-primary-cta="true"
          data-node-path="hero.cta"
          data-node-label="Botão CTA"
          data-edit-props="text,bgColor,textColor,visibility"
          whileHover={{ y: -2, scale: 1.015 }}
          whileTap={{ scale: 0.965 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.8 }}
          className="group relative inline-flex min-h-[48px] items-center gap-2.5 overflow-hidden rounded-xl px-6 text-sm font-bold tracking-tight transition-[filter] hover:brightness-105"
          style={{
            backgroundColor: resolvedAccent,
            color: safePrimaryInk,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 28px -8px ${resolvedAccent}75`,
            ...primaryCtaOverride.style,
          }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-[340%]"
          />
          <span className="relative z-10">{primaryLabel}</span>
          <ArrowRight className="relative z-10 size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </m.a>
      ) : null}

      {!secondaryCtaOverride.hidden ? (
        <m.button
          type="button"
          data-atomic-secondary-cta="true"
          data-node-path="hero.secondaryCta"
          data-node-label="Botão WhatsApp"
          data-edit-props="text,visibility"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          onClick={onWhatsappClick}
          className={cn(
            'inline-flex min-h-[48px] items-center gap-2 rounded-xl border px-5 text-sm font-semibold transition-colors shadow-2xs',
            secondaryClasses,
          )}
          style={secondaryCtaOverride.style}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          <span>WhatsApp</span>
        </m.button>
      ) : null}
    </m.div>
  );
}

export interface AtomicSectionRenderProps {
  section: Record<string, any>;
  index: number;
  storeName: string;
  logoUrl?: string;
  profile?: BusinessProfile;
  engineSeed?: Record<string, any>;
  products: CatalogProduct[];
  primaryColor: string;
  accentColor: string;
  externalCategoryFilter?: string | null;
  onSelectCategoryFilter?: (cat: string) => void;
  appliedCoupon: { code: string; discountPercent: number } | null;
  onApplyCoupon: (code: string, discountPercent: number) => void;
  onAddToCart: (product: CatalogProduct, qty?: number) => void;
  onSelectProductDetail?: (product: CatalogProduct) => void;
  onDirectWhatsappSend?: (message: string) => void;
}

export function AtomicSectionRenderer({
  section,
  index,
  storeName,
  logoUrl,
  profile,
  engineSeed,
  products,
  primaryColor,
  externalCategoryFilter,
  onSelectCategoryFilter,
  onApplyCoupon,
  onAddToCart,
  onSelectProductDetail,
  onDirectWhatsappSend,
}: AtomicSectionRenderProps) {
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('Todas');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [gridAnimRef] = useAutoAnimate<HTMLDivElement>();

  useEffect(() => {
    if (externalCategoryFilter) setActiveCat(externalCategoryFilter);
  }, [externalCategoryFilter]);

  const tuple = Array.isArray(section.tuple) ? section.tuple : [`sec_${index}`, 'coupled_media_grid', 'ESTADO_1'];
  const role = String(tuple[1] || 'coupled_media_grid');
  const compiled: CompiledSectionDesign = compileAtomicSectionDesign(section, engineSeed);
  const nodeStyles = (section.nodeStyles || section.content?.nodeStyles || section.config?.nodeStyles) as
    | NodeStylesConfig
    | undefined;
  const sectionNodeOverride = resolveNodeStyle(nodeStyles, 'section');

  const st = (section.surfaceTokens as Record<string, any>) || {};
  const bgHex = sectionNodeOverride.style.backgroundColor
    ? String(sectionNodeOverride.style.backgroundColor)
    : String(st.bgHex || '#FBF6EE');
  const isDarkBgOverride = /^#(?:18181b|0f172a|09090b|111827|121215)/i.test(bgHex);
  const inkHex = sectionNodeOverride.style.color
    ? String(sectionNodeOverride.style.color)
    : ensureSafeInkContrast(String(st.inkHex || ''), bgHex, 4.6);
  const mutedHex = ensureSafeInkContrast(String(st.mutedHex || ''), bgHex, 4.0);
  const hairline = isDarkBgOverride ? 'rgba(255,255,255,0.14)' : String(st.borderColor || 'rgba(15,23,42,0.11)');
  const resolvedAccent = ensureSafeAccentContrast(String(st.accentHex || '#D8A848'), bgHex, 4.5);
  const accentInk = ensureSafeInkContrast(String(st.accentInkHex || ''), resolvedAccent, 4.6);
  const anchorDarkBg = String(st.anchorDarkBg || '#18181B');
  const whiteCardInk = '#0F172A';
  const whiteCardMuted = '#475569';
  const whiteCardAccent = ensureSafeAccentContrast(resolvedAccent, '#FFFFFF', 4.5);
  const anchorBtnInk = ensureSafeInkContrast('#FFFFFF', anchorDarkBg, 4.6);
  const footerInk = ensureSafeInkContrast('#F8FAFC', anchorDarkBg, 4.6);
  const footerMuted = ensureSafeInkContrast('#CBD5E1', anchorDarkBg, 4.6);
  const footerAccent = ensureSafeAccentContrast(resolvedAccent, anchorDarkBg, 4.5);
  const creamBadgeInk = ensureSafeInkContrast('#0F172A', '#FBF6EE', 4.6);

  const textSlots: Array<{ micro?: string[]; mediaPick?: string }> = Array.isArray(section.textSlots)
    ? section.textSlots
    : [];
  const resolvedImg = String(section.resolvedMedia?.imageUrl || '');
  const categoryImages: Record<string, string> = (section.resolvedMedia?.categoryImages as Record<string, string>) || {};
  const resolveProductImage = (prod: CatalogProduct, _idx: number): string => {
    const direct = typeof prod.imageUrl === 'string' ? prod.imageUrl.trim() : '';
    if (direct && !/^data:image\/svg\+xml/i.test(direct)) return direct;
    // Regra rígida: nunca reutilizar foto de outro produto/categoria em SKU sem foto real.
    return '';
  };

  const selectedSkuIds: string[] = Array.isArray((section.content as any)?.selectedSkuIds)
    ? ((section.content as any).selectedSkuIds as string[])
    : [];
  const groupDisplayMode = ((section.content as any)?.groupDisplayMode ||
    (section as any)?.groupDisplayMode ||
    'prioritize') as 'only_selected' | 'prioritize';
  const rawBoundProducts: CatalogProduct[] =
    Array.isArray(section.boundProducts) && section.boundProducts.length > 0
      ? (section.boundProducts as CatalogProduct[])
      : products;
  const boundProducts: CatalogProduct[] =
    selectedSkuIds.length > 0
      ? groupDisplayMode === 'only_selected'
        ? rawBoundProducts.filter((p) => selectedSkuIds.includes(p.id) || selectedSkuIds.includes(p.sku))
        : [
            ...rawBoundProducts.filter((p) => selectedSkuIds.includes(p.id) || selectedSkuIds.includes(p.sku)),
            ...rawBoundProducts.filter((p) => !selectedSkuIds.includes(p.id) && !selectedSkuIds.includes(p.sku)),
          ]
      : rawBoundProducts;

  useEffect(() => {
    setHeroImgFailed(false);
    setBannerImgFailed(false);
  }, [resolvedImg]);

  const handleAdd = (prod: CatalogProduct) => {
    onAddToCart(prod, 1);
    setAddedIds((prev) => ({ ...prev, [prod.id]: true }));
    window.setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [prod.id]: false }));
    }, 1100);
  };

  return (
    <LazyMotion features={domAnimation}>
      {(() => {
        // 1. HERO STAGE / HERO CENTERED / HERO SPLIT (3 Layouts Distintos + Contraste WCAG Dinamico)
        if (role === 'hero_stage' || role === 'hero_split' || role === 'hero_centered') {
          const displayText =
            textSlots.find((t) => t.micro?.[1] === 'display')?.micro?.[2] ||
            textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] ||
            storeName;
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || '';
          const heroTitleOverride = resolveNodeStyle(nodeStyles, 'hero.title');
          const heroSubOverride = resolveNodeStyle(nodeStyles, 'hero.subtitle');
          const heroImgOverride = resolveNodeStyle(nodeStyles, 'hero.image');
          const showHeroPhoto = Boolean(resolvedImg && !heroImgFailed && !heroImgOverride.hidden);
          const isDarkSurface = isDarkBgOverride || Boolean(st.isDark);
          const primaryTargetHref = '#catalogo';
          const ctaPrimaryLabel = String(section.content?.ctaPrimaryLabel || '').trim();

          if (role === 'hero_centered') {
            return (
              <section
                key={tuple[0]}
                data-testid={`atomic-sec-${tuple[0]}`}
                data-atomic-role="hero_centered"
                className="relative w-full overflow-hidden"
                style={{
                  backgroundColor: bgHex,
                  color: inkHex,
                  paddingTop: `${compiled.paddingY}px`,
                  paddingBottom: `${compiled.paddingY}px`,
                  ...sectionNodeOverride.style,
                }}
              >
                <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
                <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center space-y-6 px-4 text-center sm:px-6">
                  {!heroTitleOverride.hidden ? (
                    <h1
                      data-node-path="hero.title"
                      data-node-label="Título principal"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="font-extrabold"
                      style={{ ...compiled.displayStyle, color: inkHex, textAlign: 'center', ...heroTitleOverride.style }}
                    >
                      {renderHighlightedCopy(displayText, resolvedAccent)}
                      {compiled.ornamentKind === 'corner_sparks' ? <CornerSparksSvg color={resolvedAccent} /> : null}
                    </h1>
                  ) : null}
                  {bodyText && !heroSubOverride.hidden ? (
                    <p
                      data-node-path="hero.subtitle"
                      data-node-label="Subtítulo"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="max-w-[46ch] text-base leading-relaxed"
                      style={{ color: mutedHex, ...heroSubOverride.style }}
                    >
                      {bodyText}
                    </p>
                  ) : null}
                  <HeroCtaCluster
                    primaryHref={primaryTargetHref}
                    primaryLabel={ctaPrimaryLabel || 'Explorar coleção'}
                    resolvedAccent={resolvedAccent}
                    accentInk={accentInk}
                    isDarkSurface={isDarkSurface}
                    centered
                    nodeStyles={nodeStyles}
                    onWhatsappClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                  />
                  {showHeroPhoto ? (
                    <div
                      data-node-path="hero.image"
                      data-node-label="Imagem da capa"
                      data-edit-props="image,visibility"
                      className="mt-4 aspect-[16/7] w-full max-w-4xl overflow-hidden border"
                      style={{
                        borderRadius: `${compiled.outerRadiusPx}px`,
                        borderColor: hairline,
                        boxShadow: compiled.shadowCss,
                      }}
                    >
                      <img
                        src={resolvedImg}
                        alt={storeName}
                        onError={() => setHeroImgFailed(true)}
                        onLoad={(e) => {
                          if (e.currentTarget.naturalWidth === 0) setHeroImgFailed(true);
                        }}
                        className={`size-full ${compiled.heroFit === 'contain' ? 'object-contain bg-black/10 p-4' : 'object-cover'}`}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            );
          }

          if (role === 'hero_split') {
            const splitCardBg = isDarkSurface ? '#18181B' : '#FFFFFF';
            const splitCardInk = ensureSafeInkContrast(inkHex, splitCardBg, 4.6);
            const splitCardAccent = ensureSafeAccentContrast(resolvedAccent, splitCardBg, 4.5);
            const heroCentered = section.direction?.textAnchor === 'center';
            const heroTextRight = section.direction?.textAnchor === 'right';
            const heroSpots = Array.isArray(section.direction?.hotspots) ? section.direction.hotspots : [];

            if (heroCentered) {
              return (
                <section
                  key={tuple[0]}
                  data-testid={`atomic-sec-${tuple[0]}`}
                  data-atomic-role="hero_split"
                  data-text-anchor="center"
                  className="relative w-full overflow-hidden"
                  style={{
                    backgroundColor: bgHex,
                    color: inkHex,
                    paddingTop: `${compiled.paddingY}px`,
                    paddingBottom: `${compiled.paddingY}px`,
                    ...sectionNodeOverride.style,
                  }}
                >
                  <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
                  <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center space-y-6 px-4 text-center sm:px-6">
                    {!heroTitleOverride.hidden ? (
                      <h1
                        data-node-path="hero.title"
                        data-node-label="Título principal"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="font-extrabold"
                        style={{ ...compiled.displayStyle, color: inkHex, textAlign: 'center', ...heroTitleOverride.style }}
                      >
                        {renderHighlightedCopy(displayText, resolvedAccent)}
                      </h1>
                    ) : null}
                    {bodyText && !heroSubOverride.hidden ? (
                      <p
                        data-node-path="hero.subtitle"
                        data-node-label="Subtítulo"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="max-w-[52ch] text-base leading-relaxed"
                        style={{ color: mutedHex, ...heroSubOverride.style }}
                      >
                        {bodyText}
                      </p>
                    ) : null}
                    <HeroCtaCluster
                      primaryHref={primaryTargetHref}
                      primaryLabel={ctaPrimaryLabel || 'Ver catálogo'}
                      resolvedAccent={resolvedAccent}
                      accentInk={accentInk}
                      isDarkSurface={isDarkSurface}
                      centered
                      nodeStyles={nodeStyles}
                      onWhatsappClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                    />
                    {showHeroPhoto ? (
                      <div
                        data-node-path="hero.image"
                        data-node-label="Imagem da capa"
                        data-edit-props="image,visibility"
                        className="relative mt-2 aspect-[16/8] w-full max-w-4xl overflow-hidden border"
                        style={{
                          borderRadius: `${compiled.outerRadiusPx}px`,
                          borderColor: hairline,
                          boxShadow: compiled.shadowCss,
                        }}
                      >
                        <img
                          src={resolvedImg}
                          alt={storeName}
                          onError={() => setHeroImgFailed(true)}
                          onLoad={(e) => {
                            if (e.currentTarget.naturalWidth === 0) setHeroImgFailed(true);
                          }}
                          className="size-full object-cover"
                        />
                        {heroSpots.map((sp: any) => (
                          <div
                            key={sp.id}
                            data-testid={`hero-hotspot-${sp.pinLabel}`}
                            className="group absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${sp.xPct}%`, top: `${sp.yPct}%` }}
                          >
                            <span
                              className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full border-2 border-white px-2 text-[10px] font-black shadow-lg"
                              style={{ backgroundColor: resolvedAccent, color: accentInk }}
                            >
                              {sp.pinLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              );
            }

            return (
              <section
                key={tuple[0]}
                data-testid={`atomic-sec-${tuple[0]}`}
                data-atomic-role="hero_split"
                className="relative w-full overflow-hidden"
                style={{
                  backgroundColor: bgHex,
                  color: inkHex,
                  paddingTop: `${compiled.paddingY}px`,
                  paddingBottom: `${compiled.paddingY}px`,
                  ...sectionNodeOverride.style,
                }}
              >
                <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
                <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
                  <m.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    className={`space-y-5 lg:col-span-6 ${heroTextRight ? 'lg:order-2' : 'lg:order-1'}`}
                  >
                    {!heroTitleOverride.hidden ? (
                      <h1
                        data-node-path="hero.title"
                        data-node-label="Título principal"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="font-extrabold"
                        style={{ ...compiled.displayStyle, color: inkHex, ...heroTitleOverride.style }}
                      >
                        {renderHighlightedCopy(displayText, resolvedAccent)}
                        {compiled.ornamentKind === 'corner_sparks' ? <CornerSparksSvg color={resolvedAccent} /> : null}
                      </h1>
                    ) : null}
                    {bodyText && !heroSubOverride.hidden ? (
                      <p
                        data-node-path="hero.subtitle"
                        data-node-label="Subtítulo"
                        data-edit-props="text,fontSize,textAlign,textColor,visibility"
                        className="max-w-[46ch] text-base leading-relaxed"
                        style={{ color: mutedHex, ...heroSubOverride.style }}
                      >
                        {bodyText}
                      </p>
                    ) : null}
                    <HeroCtaCluster
                      primaryHref={primaryTargetHref}
                      primaryLabel={ctaPrimaryLabel || 'Ver catálogo'}
                      resolvedAccent={resolvedAccent}
                      accentInk={accentInk}
                      isDarkSurface={isDarkSurface}
                      nodeStyles={nodeStyles}
                      onWhatsappClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                    />
                  </m.div>

                  <div className={`lg:col-span-6 ${heroTextRight ? 'lg:order-1' : 'lg:order-2'}`}>
                    {showHeroPhoto ? (
                      <div
                        data-node-path="hero.image"
                        data-node-label="Imagem da capa"
                        data-edit-props="image,visibility"
                        className="relative aspect-[4/3] w-full overflow-hidden border"
                        style={{
                          borderRadius: `${compiled.outerRadiusPx}px`,
                          borderColor: hairline,
                          boxShadow: compiled.shadowCss,
                        }}
                      >
                        <m.img
                          initial={{ scale: 1.05, opacity: 0.88 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                          src={resolvedImg}
                          alt={storeName}
                          onError={() => setHeroImgFailed(true)}
                          onLoad={(e) => {
                            if (e.currentTarget.naturalWidth === 0) setHeroImgFailed(true);
                          }}
                          className={`size-full ${compiled.heroFit === 'contain' ? 'object-contain bg-black/5 p-4' : 'object-cover'}`}
                        />
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            background: `linear-gradient(to top, ${bgHex}38 0%, transparent 38%)`,
                          }}
                        />
                        {heroSpots.map((sp: any) => (
                          <div
                            key={sp.id}
                            data-testid={`hero-hotspot-${sp.pinLabel}`}
                            title={sp.headline}
                            className="group absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${sp.xPct}%`, top: `${sp.yPct}%` }}
                          >
                            <span
                              className="flex min-h-[28px] min-w-[28px] cursor-pointer items-center justify-center rounded-full border-2 border-white px-2 text-[10px] font-black shadow-lg"
                              style={{ backgroundColor: resolvedAccent, color: accentInk }}
                            >
                              {sp.pinLabel}
                            </span>
                            <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 hidden w-44 -translate-x-1/2 rounded-xl bg-black/90 p-2.5 text-[11px] text-white shadow-xl group-hover:block">
                              <strong className="block font-bold">{sp.headline}</strong>
                              <span className="text-zinc-300">{sp.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {products.slice(0, 4).map((p) => (
                          <div
                            key={p.id}
                            className="border p-4"
                            style={{
                              borderRadius: `${compiled.innerRadiusPx}px`,
                              borderColor: hairline,
                              backgroundColor: splitCardBg,
                              boxShadow: compiled.shadowCss,
                            }}
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: splitCardAccent }}>
                              {p.category || 'Oferta'}
                            </span>
                            <p className="mt-1 line-clamp-2 text-xs font-bold" style={{ color: splitCardInk }}>{p.name}</p>
                            <p className="mt-2 text-sm font-extrabold tabular-nums" style={{ color: splitCardInk }}>
                              {formatCurrencyBRL(p.priceCents)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          }

          const stageCardBg = isDarkSurface ? '#1E293B' : '#FFFFFF';
          const stageCardInk = ensureSafeInkContrast(inkHex, stageCardBg, 4.6);
          const stageCardAccent = ensureSafeAccentContrast(resolvedAccent, stageCardBg, 4.5);

          const heroStageCentered =
            section.direction?.textAnchor === 'center' || heroTitleOverride.style.textAlign === 'center';

          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="hero_stage"
              data-text-anchor={heroStageCentered ? 'center' : undefined}
              className="relative flex w-full items-center overflow-hidden"
              style={{
                backgroundColor: bgHex,
                color: inkHex,
                minHeight: compiled.heroMinHeightCss,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              {showHeroPhoto ? (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `radial-gradient(52% 68% at 74% 48%, ${resolvedAccent}33 0%, transparent 72%)`,
                    }}
                  />
                  <m.img
                    data-node-path="hero.image"
                    data-node-label="Imagem da capa"
                    data-edit-props="image,visibility"
                    initial={{ scale: 1.07, opacity: 0.84 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    src={resolvedImg}
                    alt={storeName}
                    onError={() => setHeroImgFailed(true)}
                    onLoad={(e) => {
                      if (e.currentTarget.naturalWidth === 0) setHeroImgFailed(true);
                    }}
                    className={`absolute inset-0 size-full ${
                      compiled.heroFit === 'contain' ? 'object-contain object-right p-4' : 'object-cover object-[70%_center]'
                    }`}
                    style={{ filter: 'contrast(1.03) saturate(1.05)' }}
                  />
                </>
              ) : null}

              {/* Scrim cubico multi-stop + ponte de grain sobre foto e fundo */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: showHeroPhoto
                    ? compiled.scrimCss
                    : `radial-gradient(65% 85% at 78% 35%, ${resolvedAccent}2b 0%, transparent 72%)`,
                }}
              />
              {showHeroPhoto && isDarkSurface ? (
                <div
                  className="pointer-events-none absolute inset-0 lg:hidden"
                  style={{ background: `linear-gradient(to top, ${bgHex}e6 0%, ${bgHex}99 55%, ${bgHex}40 100%)` }}
                />
              ) : null}
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />

              <div
                className={cn(
                  'relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6',
                  heroStageCentered
                    ? 'flex flex-col items-center text-center'
                    : 'grid grid-cols-1 items-center gap-8 lg:grid-cols-12',
                )}
              >
                <m.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'space-y-5',
                    heroStageCentered ? 'mx-auto flex max-w-4xl flex-col items-center text-center' : 'lg:col-span-6',
                  )}
                >
                  {!heroTitleOverride.hidden ? (
                    <h1
                      data-node-path="hero.title"
                      data-node-label="Título principal"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="font-extrabold"
                      style={{ ...compiled.displayStyle, color: inkHex, ...heroTitleOverride.style }}
                    >
                      {renderHighlightedCopy(displayText, resolvedAccent)}
                      {compiled.ornamentKind === 'corner_sparks' ? <CornerSparksSvg color={resolvedAccent} /> : null}
                    </h1>
                  ) : null}
                  {bodyText && !heroSubOverride.hidden ? (
                    <m.p
                      data-node-path="hero.subtitle"
                      data-node-label="Subtítulo"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.09, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      className="max-w-[44ch] text-base leading-relaxed sm:text-[17px]"
                      style={{ color: mutedHex, ...heroSubOverride.style }}
                    >
                      {bodyText}
                    </m.p>
                  ) : null}
                  <HeroCtaCluster
                    primaryHref={primaryTargetHref}
                    primaryLabel={ctaPrimaryLabel || 'Explorar coleção'}
                    resolvedAccent={resolvedAccent}
                    accentInk={accentInk}
                    isDarkSurface={isDarkSurface}
                    centered={heroStageCentered}
                    nodeStyles={nodeStyles}
                    onWhatsappClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                  />
                </m.div>

                {!showHeroPhoto && !heroStageCentered ? (
                  <div className="hidden justify-end lg:col-span-6 lg:flex">
                    <div className="grid max-w-md grid-cols-2 gap-3">
                      {products.slice(0, 4).map((p) => (
                        <div
                          key={p.id}
                          className="rounded-2xl border p-3.5"
                          style={{
                            borderColor: hairline,
                            backgroundColor: stageCardBg,
                            boxShadow: compiled.shadowCss,
                          }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: stageCardAccent }}>
                            {p.category || 'Oferta'}
                          </span>
                          <p className="mt-1 line-clamp-2 text-xs font-bold" style={{ color: stageCardInk }}>{p.name}</p>
                          <p className="mt-2 text-sm font-extrabold tabular-nums" style={{ color: stageCardInk }}>
                            {formatCurrencyBRL(p.priceCents)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          );
        }

        // 2. DOMAIN WORKBENCH (Painel Interativo Bipartido com Trilho Acoplado)
        if (role === 'domain_workbench') {
          return (
            <DomainWorkbenchSection
              key={tuple[0]}
              section={section}
              compiled={compiled}
              products={products}
              storeName={storeName}
              primaryColor={primaryColor}
              onAddToCart={onAddToCart}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />
          );
        }

        // 3. KINETIC RIBBON
        if (role === 'kinetic_ribbon') {
          const items = textSlots.map((s) => s.micro?.[2]).filter(Boolean) as string[];
          const list = items.length > 0 ? items : [storeName, 'Entrega rápida', 'Atendimento direto no WhatsApp'];
          const loop = [...list, ...list, ...list, ...list];
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="kinetic_ribbon"
              className="group relative w-full overflow-hidden border-y py-3"
              style={{ backgroundColor: anchorDarkBg, color: '#FFFFFF', borderColor: hairline }}
            >
              <style>{`
                @keyframes cgRibbonSlide { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
                .cg-ribbon-track { display: flex; width: max-content; animation: cgRibbonSlide ${compiled.marqueeSpeedSec}s linear infinite; }
                .group:hover .cg-ribbon-track { animation-play-state: paused; }
                @media (prefers-reduced-motion: reduce) { .cg-ribbon-track { animation: none; flex-wrap: wrap; width: 100%; justify-content: center; } }
              `}</style>
              <div className="cg-ribbon-track gap-8 text-[11px] font-bold uppercase tracking-[0.16em]">
                {loop.map((item, i) => (
                  <span key={i} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
                    <Sparkles className="size-3.5" style={{ color: resolvedAccent }} aria-hidden="true" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </section>
          );
        }

        // 4A. BENTO SPOTLIGHT (Grid Compacto 6/6 com Miniaturas Reais em Todos os Cards)
        if (role === 'bento_spotlight') {
          const featured = boundProducts.slice(0, 4);
          const lead = featured[0];
          const rest = featured.slice(1, 4);
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Destaques selecionados';
          const bentoGridOverride = resolveNodeStyle(nodeStyles, 'highlights.grid');
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="bento_spotlight"
              className="relative w-full"
              style={{
                backgroundColor: bgHex,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
              <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
                <SectionHeadingOrnament
                  title={title}
                  ornamentKind={compiled.ornamentKind}
                  inkHex={inkHex}
                  accentHex={resolvedAccent}
                  mutedHex={mutedHex}
                  hairlineColor={hairline}
                  h2Style={compiled.h2Style}
                  nodeStyles={nodeStyles}
                  titlePath="highlights.title"
                  subtitlePath="highlights.subtitle"
                  titleLabel="Título dos destaques"
                  subtitleLabel="Subtítulo dos destaques"
                />
                <div
                  data-node-path="highlights.grid"
                  data-node-label="Grade de destaques"
                  data-edit-props="columns,groupFilter,bgColor"
                  className={cn(
                    'grid items-start gap-6',
                    bentoGridOverride.columns ? resolveGridColumnsClass(bentoGridOverride.columns, 'grid-cols-1 lg:grid-cols-12') : 'grid-cols-1 lg:grid-cols-12',
                  )}
                >
                  {lead && !isNodeHidden(nodeStyles, 'highlights.card.0') ? (
                    <article
                      data-node-path="highlights.card.0"
                      data-node-label={`Destaque · ${lead.name}`}
                      data-edit-props="bgColor,visibility"
                      className={cn(
                        'flex flex-col justify-between overflow-hidden border bg-white text-slate-900',
                        !bentoGridOverride.columns && 'lg:col-span-6',
                      )}
                      style={{
                        borderRadius: `${compiled.outerRadiusPx}px`,
                        borderColor: hairline,
                        boxShadow: compiled.shadowCss,
                        ...resolveNodeStyle(nodeStyles, 'highlights.card.0').style,
                      }}
                    >
                      {!isNodeHidden(nodeStyles, 'highlights.card.0.image') ? (
                        <div
                          data-node-path="highlights.card.0.image"
                          data-node-label={`Foto · ${lead.name}`}
                          data-edit-props="image,visibility"
                          onClick={() => onSelectProductDetail?.(lead)}
                          className="aspect-[16/10] w-full cursor-pointer overflow-hidden bg-[#F3EFE6]"
                        >
                          <SafeCatalogImage src={resolveProductImage(lead, 0)} alt={lead.name} category={lead.category} primaryColor={primaryColor} />
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div className="min-w-0 flex-1 space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: whiteCardAccent }}>
                            Carro-chefe · {lead.category}
                          </span>
                          <h3
                            data-node-path="highlights.card.0.title"
                            data-node-label={`Nome · ${lead.name}`}
                            data-edit-props="fontSize,textColor,visibility"
                            className="text-lg font-extrabold leading-snug"
                            style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, 'highlights.card.0.title').style }}
                          >
                            {lead.name}
                          </h3>
                          {lead.description ? (
                            <p className="line-clamp-2 text-xs text-slate-500">{lead.description}</p>
                          ) : null}
                          <p
                            data-node-path="highlights.card.0.price"
                            data-node-label={`Preço · ${lead.name}`}
                            data-edit-props="fontSize,textColor"
                            className="pt-0.5 text-sm font-extrabold tabular-nums"
                            style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, 'highlights.card.0.price').style }}
                          >
                            {formatCurrencyBRL(lead.priceCents)}
                          </p>
                        </div>
                        <button
                          type="button"
                          data-node-path="highlights.card.0.cta"
                          data-node-label={`Botão · ${lead.name}`}
                          data-edit-props="bgColor,textColor"
                          onClick={() => handleAdd(lead)}
                          className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                          style={{ backgroundColor: anchorDarkBg, color: anchorBtnInk, ...resolveNodeStyle(nodeStyles, 'highlights.card.0.cta').style }}
                        >
                          <Plus className="size-4" aria-hidden="true" />
                          <span>Adicionar destaque</span>
                        </button>
                      </div>
                    </article>
                  ) : null}
                  <div className={cn('flex flex-col gap-3', !bentoGridOverride.columns && 'lg:col-span-6')}>
                    {rest.map((item, rIdx) => {
                      const cardPath = `highlights.card.${rIdx + 1}`;
                      if (isNodeHidden(nodeStyles, cardPath)) return null;
                      const thumbUrl = resolveProductImage(item, rIdx + 1);
                      return (
                        <div
                          key={item.id}
                          data-node-path={cardPath}
                          data-node-label={`Destaque · ${item.name}`}
                          data-edit-props="bgColor,visibility"
                          className="flex items-center justify-between gap-3.5 border bg-white p-3.5 text-slate-900 transition-shadow hover:shadow-md"
                          style={{
                            borderRadius: `${compiled.innerRadiusPx}px`,
                            borderColor: hairline,
                            boxShadow: compiled.shadowCss,
                            ...resolveNodeStyle(nodeStyles, cardPath).style,
                          }}
                        >
                          <div
                            onClick={() => onSelectProductDetail?.(item)}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5"
                          >
                            <div
                              data-node-path={`${cardPath}.image`}
                              data-node-label={`Foto · ${item.name}`}
                              data-edit-props="image,visibility"
                              className="size-[72px] shrink-0 overflow-hidden rounded-xl bg-[#F3EFE6]"
                            >
                              <SafeCatalogImage src={thumbUrl} alt={item.name} category={item.category} primaryColor={primaryColor} />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: whiteCardAccent }}>
                                {item.category}
                              </span>
                              <h4
                                data-node-path={`${cardPath}.title`}
                                data-node-label={`Nome · ${item.name}`}
                                data-edit-props="fontSize,textColor"
                                className="truncate text-sm font-bold"
                                style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.title`).style }}
                              >
                                {item.name}
                              </h4>
                              {item.description ? (
                                <p className="line-clamp-1 text-[11px] text-slate-500">{item.description}</p>
                              ) : null}
                              <p
                                data-node-path={`${cardPath}.price`}
                                data-node-label={`Preço · ${item.name}`}
                                data-edit-props="fontSize,textColor"
                                className="text-xs font-extrabold tabular-nums"
                                style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.price`).style }}
                              >
                                {formatCurrencyBRL(item.priceCents)}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-node-path={`${cardPath}.cta`}
                            data-node-label={`Botão · ${item.name}`}
                            data-edit-props="bgColor,textColor"
                            onClick={() => handleAdd(item)}
                            className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl px-3.5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                            style={{ backgroundColor: anchorDarkBg, color: anchorBtnInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.cta`).style }}
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        }

        // 4B. COUPLED MEDIA GRID / SPLIT CURTAIN PORTALS
        if (role === 'coupled_media_grid' || role === 'split_curtain_portals') {
          const catMap = new Map<string, { count: number; minCents: number }>();
          for (const p of products) {
            const c = String(p.category || 'Geral').trim() || 'Geral';
            const cur = catMap.get(c) || { count: 0, minCents: p.priceCents };
            cur.count += 1;
            cur.minCents = Math.min(cur.minCents, p.priceCents);
            catMap.set(c, cur);
          }
          const catEntries = Array.from(catMap.entries()).slice(0, 4);
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Explorar por categoria';
          const portalsGridOverride = resolveNodeStyle(nodeStyles, 'highlights.grid');

          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role={role}
              className="relative w-full"
              style={{
                backgroundColor: bgHex,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
              <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
                <SectionHeadingOrnament
                  title={title}
                  ornamentKind={compiled.ornamentKind === 'trailing_line' ? 'flanked_lines' : compiled.ornamentKind}
                  inkHex={inkHex}
                  accentHex={resolvedAccent}
                  mutedHex={mutedHex}
                  hairlineColor={hairline}
                  h2Style={compiled.h2Style}
                  nodeStyles={nodeStyles}
                  titlePath="section.title"
                  subtitlePath="section.subtitle"
                />

                <div
                  data-node-path="highlights.grid"
                  data-node-label="Grade de categorias"
                  data-edit-props="columns,bgColor"
                  className={cn('grid', resolveGridColumnsClass(portalsGridOverride.columns, 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3'))}
                  style={{ gap: `${compiled.gapPx}px` }}
                >
                  {catEntries.map(([catName, meta], idx) => {
                    const catImg = categoryImages[catName.toLowerCase()] || '';
                    return (
                      <m.a
                        key={catName}
                        href="#catalogo"
                        data-node-path={`highlights.card.${idx}`}
                        data-node-label={`Categoria · ${catName}`}
                        data-edit-props="bgColor,visibility"
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ delay: computeStaggerDelaySec(idx, 60), duration: 0.35 }}
                        onClick={() => onSelectCategoryFilter?.(catName)}
                        className="group flex flex-col overflow-hidden border bg-white transition-transform hover:-translate-y-0.5"
                        style={{
                          borderRadius: `${compiled.outerRadiusPx}px`,
                          borderColor: hairline,
                          boxShadow: compiled.shadowCss,
                        }}
                      >
                        <div
                          data-node-path={`highlights.card.${idx}.image`}
                          data-node-label={`Imagem · ${catName}`}
                          data-edit-props="image"
                          className="relative aspect-[16/10] w-full overflow-hidden bg-[#F3EFE6]"
                        >
                          {catImg ? (
                            <SafeCatalogImage
                              src={catImg}
                              alt={catName}
                              category={catName}
                              primaryColor={primaryColor}
                              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div
                              className="flex size-full flex-col items-center justify-center gap-2 p-6 text-white"
                              style={{
                                background: `radial-gradient(circle at 80% 20%, ${resolvedAccent}40, ${anchorDarkBg} 75%)`,
                              }}
                            >
                              <Sparkles className="size-7" style={{ color: resolvedAccent }} aria-hidden="true" />
                              <span className="text-xs font-semibold tracking-wide text-zinc-200">
                                {catName} · Ver seleção
                              </span>
                            </div>
                          )}
                          <span
                            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold"
                            style={{ backgroundColor: 'rgba(9, 13, 22, 0.92)', color: '#FFFFFF' }}
                          >
                            {meta.count === 1 ? '1 item' : `${meta.count} itens`} · desde {formatCurrencyBRL(meta.minCents)}
                          </span>
                        </div>
                        {/* Barra solida acoplada sem gap */}
                        <div
                          className="flex min-h-[50px] items-center justify-between px-4 py-2.5"
                          style={{
                            backgroundColor: compiled.barToneLight ? '#F8FAFC' : anchorDarkBg,
                            color: compiled.barToneLight ? '#0F172A' : anchorBtnInk,
                          }}
                        >
                          <span className="flex items-center gap-2.5 text-sm font-bold">
                            <ShoppingBag
                              className="size-4"
                              style={{ color: compiled.barToneLight ? whiteCardAccent : footerAccent }}
                              aria-hidden="true"
                            />
                            <span>{catName}</span>
                          </span>
                          <ArrowRight
                            className="size-4 transition-transform group-hover:translate-x-1"
                            style={{ color: compiled.barToneLight ? whiteCardAccent : footerAccent }}
                            aria-hidden="true"
                          />
                        </div>
                      </m.a>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }

        // 4C. SPLIT STORY (Manifesto + Métricas + Foto Lateral Enquadrada)
        if (role === 'split_story') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || `A curadoria ${storeName}`;
          const paragraphs = Array.isArray(section.content?.storyParagraphs)
            ? (section.content.storyParagraphs as string[])
            : [textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || profile?.business?.description || 'Produção autoral com acabamento impecável.'];
          const metrics = Array.isArray(section.content?.metrics)
            ? (section.content.metrics as Array<{ label: string; value: string }>)
            : [
                { label: 'Atendimento', value: 'WhatsApp Direto' },
                { label: 'Pagamento', value: 'Pix Confirmado' },
              ];
          const storyBodyOverride = resolveNodeStyle(nodeStyles, 'editorial.body');
          const storyImgOverride = resolveNodeStyle(nodeStyles, 'editorial.image');
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="split_story"
              className="relative w-full"
              style={{
                backgroundColor: bgHex,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
              <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-12">
                <div className="space-y-5 lg:col-span-6">
                  <SectionHeadingOrnament
                    title={title}
                    ornamentKind={compiled.ornamentKind}
                    inkHex={inkHex}
                    accentHex={resolvedAccent}
                    mutedHex={mutedHex}
                    hairlineColor={hairline}
                    h2Style={compiled.h2Style}
                    nodeStyles={nodeStyles}
                    titlePath="editorial.title"
                    subtitlePath="editorial.subtitle"
                    titleLabel="Título da história"
                  />
                  {!storyBodyOverride.hidden ? (
                    <div
                      data-node-path="editorial.body"
                      data-node-label="Texto da história"
                      data-edit-props="text,fontSize,textAlign,textColor,visibility"
                      className="space-y-3"
                      style={storyBodyOverride.style}
                    >
                      {paragraphs.map((p, idx) => (
                        <p key={idx} className="text-sm leading-relaxed sm:text-base" style={{ color: storyBodyOverride.style.color || mutedHex }}>
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {metrics.slice(0, 4).map((m, idx) => (
                      <div key={idx} className="border bg-white/95 p-3.5 text-slate-900" style={{ borderRadius: `${compiled.innerRadiusPx}px`, borderColor: 'rgba(15,23,42,0.12)' }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: whiteCardMuted }}>{m.label}</span>
                        <p className="mt-0.5 text-sm font-extrabold" style={{ color: whiteCardInk }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {!storyImgOverride.hidden ? (
                  <div className="lg:col-span-6">
                    <div
                      data-node-path="editorial.image"
                      data-node-label="Imagem editorial"
                      data-edit-props="image,visibility"
                      className="aspect-[4/3] w-full overflow-hidden border bg-[#F3EFE6]"
                      style={{
                        borderRadius: `${compiled.outerRadiusPx}px`,
                        borderColor: hairline,
                        boxShadow: compiled.shadowCss,
                      }}
                    >
                      <SafeCatalogImage src={resolvedImg || products[0]?.imageUrl} alt={title} category={storeName} primaryColor={primaryColor} />
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          );
        }

        // 4D. DARK GLASS VAULT (Cofre de Edições Limitadas / Alta Conversão)
        if (role === 'dark_glass_vault') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Seleção Exclusiva do Cofre';
          const vaultItems = boundProducts.slice(0, 3);
          const vaultText = footerInk;
          const vaultMuted = footerMuted;
          const vaultAccent = footerAccent;
          const vaultCtaInk = ensureSafeInkContrast('#111827', vaultAccent, 4.6);
          const vaultGridOverride = resolveNodeStyle(nodeStyles, 'catalog.grid');
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="dark_glass_vault"
              className="relative w-full overflow-hidden"
              style={{
                backgroundColor: sectionNodeOverride.style.backgroundColor || anchorDarkBg,
                backgroundImage: `radial-gradient(75% 85% at 50% 0%, ${vaultAccent}26 0%, transparent 72%)`,
                color: vaultText,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
              <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
                <SectionHeadingOrnament
                  title={title}
                  ornamentKind={compiled.ornamentKind}
                  inkHex={vaultText}
                  accentHex={vaultAccent}
                  mutedHex={vaultMuted}
                  hairlineColor="rgba(255,255,255,0.16)"
                  h2Style={compiled.h2Style}
                  nodeStyles={nodeStyles}
                  titlePath="section.title"
                  subtitlePath="section.subtitle"
                />
                <div
                  data-node-path="catalog.grid"
                  data-node-label="Grade do cofre"
                  data-edit-props="columns,groupFilter"
                  className={cn('grid', resolveGridColumnsClass(vaultGridOverride.columns, 'grid-cols-1 md:grid-cols-3'))}
                  style={{ gap: `${compiled.gapPx}px` }}
                >
                  {vaultItems.map((item) => {
                    const cardPath = `catalog.card.${item.sku || item.id}`;
                    if (isNodeHidden(nodeStyles, cardPath)) return null;
                    return (
                    <article
                      key={item.id}
                      data-node-path={cardPath}
                      data-node-label={`Card · ${item.name}`}
                      data-edit-props="bgColor,visibility"
                      className="flex flex-col justify-between border border-white/15 bg-white/10 p-5"
                      style={{ borderRadius: `${compiled.outerRadiusPx}px`, ...resolveNodeStyle(nodeStyles, cardPath).style }}
                    >
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: vaultAccent }}>
                          <Sparkles className="size-3" aria-hidden="true" />
                          <span>{item.category}</span>
                        </span>
                        <h3
                          data-node-path={`${cardPath}.title`}
                          data-node-label={`Nome · ${item.name}`}
                          data-edit-props="fontSize,textColor"
                          className="text-base font-extrabold"
                          style={{ color: vaultText, ...resolveNodeStyle(nodeStyles, `${cardPath}.title`).style }}
                        >
                          {item.name}
                        </h3>
                        <p className="line-clamp-2 text-xs" style={{ color: vaultMuted }}>{item.description || item.variation}</p>
                      </div>
                      <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-4">
                        <span
                          data-node-path={`${cardPath}.price`}
                          data-node-label={`Preço · ${item.name}`}
                          data-edit-props="fontSize,textColor"
                          className="text-base font-extrabold tabular-nums"
                          style={{ color: vaultText, ...resolveNodeStyle(nodeStyles, `${cardPath}.price`).style }}
                        >
                          {formatCurrencyBRL(item.priceCents)}
                        </span>
                        <button
                          type="button"
                          data-node-path={`${cardPath}.cta`}
                          data-node-label={`Botão · ${item.name}`}
                          data-edit-props="bgColor,textColor"
                          onClick={() => handleAdd(item)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                          style={{ backgroundColor: vaultAccent, color: vaultCtaInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.cta`).style }}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          <span>Reservar</span>
                        </button>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }

        // 4E. STICKY LOOKBOOK (Lateral Fixa de Curadoria + Pilha Vertical Editorial)
        if (role === 'sticky_lookbook') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Lookbook da Temporada';
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || 'Combinações prontas com envio imediato.';
          const looks = boundProducts.slice(0, 4);
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="sticky_lookbook"
              className="relative w-full"
              style={{
                backgroundColor: bgHex,
                paddingTop: `${compiled.paddingY}px`,
                paddingBottom: `${compiled.paddingY}px`,
                ...sectionNodeOverride.style,
              }}
            >
              <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
              <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 lg:grid-cols-12">
                <div className="space-y-4 lg:sticky lg:top-20 lg:col-span-5">
                  <SectionHeadingOrnament
                    title={title}
                    subtitle={bodyText}
                    ornamentKind={compiled.ornamentKind}
                    inkHex={inkHex}
                    accentHex={resolvedAccent}
                    mutedHex={mutedHex}
                    hairlineColor={hairline}
                    h2Style={compiled.h2Style}
                    nodeStyles={nodeStyles}
                    titlePath="section.title"
                    subtitlePath="section.subtitle"
                  />
                  <button
                    type="button"
                    data-node-path="section.cta"
                    data-node-label="Botão WhatsApp"
                    data-edit-props="bgColor,textColor,visibility"
                    onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Quero ajuda para escolher do Lookbook.`)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                    style={{ backgroundColor: anchorDarkBg, color: anchorBtnInk, ...resolveNodeStyle(nodeStyles, 'section.cta').style }}
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    <span>Pedir curadoria no WhatsApp</span>
                  </button>
                </div>
                <div className="space-y-4 lg:col-span-7">
                  {looks.map((item, lIdx) => {
                    const cardPath = `catalog.card.${item.sku || item.id}`;
                    if (isNodeHidden(nodeStyles, cardPath)) return null;
                    return (
                    <article
                      key={item.id}
                      data-node-path={cardPath}
                      data-node-label={`Card · ${item.name}`}
                      data-edit-props="bgColor,visibility"
                      className="grid grid-cols-1 overflow-hidden border bg-white text-slate-900 sm:grid-cols-12"
                      style={{
                        borderRadius: `${compiled.outerRadiusPx}px`,
                        borderColor: hairline,
                        boxShadow: compiled.shadowCss,
                        ...resolveNodeStyle(nodeStyles, cardPath).style,
                      }}
                    >
                      <div
                        data-node-path={`${cardPath}.image`}
                        data-node-label={`Foto · ${item.name}`}
                        data-edit-props="image,visibility"
                        className="aspect-[4/3] w-full bg-[#FBF6EE] sm:col-span-5"
                      >
                        <SafeCatalogImage src={resolveProductImage(item, lIdx)} alt={item.name} category={item.category} primaryColor={primaryColor} />
                      </div>
                      <div className="flex flex-col justify-between p-5 sm:col-span-7">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: whiteCardAccent }}>{item.category}</span>
                          <h3
                            data-node-path={`${cardPath}.title`}
                            data-node-label={`Nome · ${item.name}`}
                            data-edit-props="fontSize,textColor"
                            className="text-base font-extrabold"
                            style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.title`).style }}
                          >
                            {item.name}
                          </h3>
                          <p className="text-xs" style={{ color: whiteCardMuted }}>{item.description || item.variation}</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between pt-3">
                          <span
                            data-node-path={`${cardPath}.price`}
                            data-node-label={`Preço · ${item.name}`}
                            data-edit-props="fontSize,textColor"
                            className="text-base font-extrabold tabular-nums"
                            style={{ color: whiteCardInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.price`).style }}
                          >
                            {formatCurrencyBRL(item.priceCents)}
                          </span>
                          <button
                            type="button"
                            data-node-path={`${cardPath}.cta`}
                            data-node-label={`Botão · ${item.name}`}
                            data-edit-props="bgColor,textColor"
                            onClick={() => handleAdd(item)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                            style={{ backgroundColor: anchorDarkBg, color: anchorBtnInk, ...resolveNodeStyle(nodeStyles, `${cardPath}.cta`).style }}
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                            <span>Adicionar</span>
                          </button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }

        // 5. EMBEDDED BANNER / SCRATCH REWARD (Foto Sangrando + Mini-Card Branco Embutido à Direita)
        if (role === 'embedded_banner' || role === 'scratch_reward') {
          const couponCode = String(section.content?.couponCode || 'BEMVINDO10');
          const discountPct = Number(section.content?.discountPercent || 10);
          const headingText = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Raspe e ganhe benefício';
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || 'Use seu cupom direto na sacola.';
          const bannerTitleOverride = resolveNodeStyle(nodeStyles, 'section.title');
          const bannerSubOverride = resolveNodeStyle(nodeStyles, 'section.subtitle');
          const showBannerPhoto = Boolean(resolvedImg && !bannerImgFailed && !isNodeHidden(nodeStyles, 'hero.image'));

          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role={role}
              className="relative w-full"
              style={{ backgroundColor: sectionNodeOverride.style.backgroundColor || st.groundBg || '#FBF6EE', paddingTop: '24px', paddingBottom: '40px' }}
            >
              <div className="mx-auto max-w-6xl px-4 sm:px-6">
                <div
                  className="relative overflow-hidden text-white"
                  style={{
                    backgroundColor: anchorDarkBg,
                    borderRadius: `${compiled.outerRadiusPx}px`,
                    boxShadow: compiled.shadowCss,
                  }}
                >
                  {showBannerPhoto ? (
                    <img
                      data-node-path="hero.image"
                      data-node-label="Imagem do banner"
                      data-edit-props="image,visibility"
                      src={resolvedImg}
                      alt={storeName}
                      onError={() => setBannerImgFailed(true)}
                      className="absolute inset-0 size-full object-cover opacity-45"
                    />
                  ) : null}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: compiled.scrimCss }}
                  />
                  <div className="relative z-10 grid grid-cols-1 items-center gap-8 p-6 sm:p-10 lg:grid-cols-12">
                    <div className="space-y-4 lg:col-span-7">
                      {!bannerTitleOverride.hidden ? (
                        <h2
                          data-node-path="section.title"
                          data-node-label="Título do banner"
                          data-edit-props="text,fontSize,textAlign,textColor,visibility"
                          className="font-extrabold"
                          style={{ ...compiled.h2Style, color: footerInk, ...bannerTitleOverride.style }}
                        >
                          {renderHighlightedCopy(headingText, footerAccent)}
                          <CornerSparksSvg color={footerAccent} />
                        </h2>
                      ) : null}
                      {!bannerSubOverride.hidden ? (
                        <p
                          data-node-path="section.subtitle"
                          data-node-label="Texto do banner"
                          data-edit-props="text,fontSize,textAlign,textColor,visibility"
                          className="max-w-md text-sm leading-relaxed"
                          style={{ color: footerMuted, ...bannerSubOverride.style }}
                        >
                          {bodyText}
                        </p>
                      ) : null}
                      <FlipCountdownMatrix
                        label="CONDIÇÃO POR TEMPO LIMITADO"
                        accentColor={footerAccent}
                        darkBg={anchorDarkBg}
                      />
                    </div>
                    <div className="lg:col-span-5">
                      <InteractiveTearCouponBib
                        storeName={storeName}
                        code={couponCode}
                        discountPercent={discountPct}
                        accentColor={resolvedAccent}
                        darkBg={anchorDarkBg}
                        onReveal={onApplyCoupon}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        }

        // 6. OPEN COLUMNS STRIP (Colunas Sem Caixa Separadas por Divisor Vertical 1px)
        if (role === 'open_columns_strip') {
          const callouts = textSlots.filter((t) => t.micro?.[1] === 'stat_callout' || t.micro?.[1] === 'body');
          const items = (callouts.length >= 2 ? callouts : textSlots).slice(0, 3);
          const diffGridOverride = resolveNodeStyle(nodeStyles, 'differentials.grid');
          const defaultColClass = items.length === 2 ? 'sm:grid-cols-2' : items.length <= 1 ? 'sm:grid-cols-1' : 'sm:grid-cols-3';
          const colClass = diffGridOverride.columns
            ? resolveGridColumnsClass(diffGridOverride.columns, defaultColClass)
            : defaultColClass;
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="open_columns_strip"
              className="relative w-full border-y"
              style={{ backgroundColor: bgHex, borderColor: hairline, ...sectionNodeOverride.style }}
            >
              <div
                data-node-path="differentials.grid"
                data-node-label="Faixa de diferenciais"
                data-edit-props="columns,bgColor"
                className={cn('mx-auto grid max-w-6xl grid-cols-1 divide-y px-4 sm:divide-x sm:divide-y-0 sm:px-6', colClass)}
                style={{ borderColor: hairline, ...diffGridOverride.style }}
              >
                {items.map((slot, i) => {
                  const itemPath = `differentials.item.${i}`;
                  const itemOverride = resolveNodeStyle(nodeStyles, itemPath);
                  if (itemOverride.hidden) return null;
                  const iconKey = String(slot.micro?.[4] || 'icon:check').replace(/^icon:/, '');
                  const IconComp = CURATED_ICON_MAP[iconKey] || Check;
                  return (
                    <div
                      key={i}
                      data-node-path={itemPath}
                      data-node-label={`Diferencial ${i + 1}`}
                      data-edit-props="text,fontSize,textColor,bgColor,visibility"
                      className="flex items-center justify-center gap-3 px-4 py-5 text-sm font-semibold"
                      style={{ color: inkHex, ...itemOverride.style }}
                    >
                      <IconComp className="size-5 shrink-0" style={{ color: resolvedAccent }} aria-hidden="true" />
                      <span>{renderHighlightedCopy(String(slot.micro?.[2] || ''), resolvedAccent)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }

        // 7. ANCHOR FOOTER (4 Colunas Reais + Marca D'agua + Copyright)
        if (role === 'anchor_footer') {
          const cats = Array.from(new Set(products.map((p) => (p.category || 'Geral').trim() || 'Geral'))).slice(0, 4);
          const footerCtaInk = ensureSafeInkContrast('#111827', footerAccent, 4.6);
          const footerTagOverride = resolveNodeStyle(nodeStyles, 'footer.tagline');
          return (
            <footer
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="anchor_footer"
              className="relative w-full overflow-hidden"
              style={{ backgroundColor: sectionNodeOverride.style.backgroundColor || anchorDarkBg, color: footerInk, paddingTop: '52px', paddingBottom: '28px', ...sectionNodeOverride.style }}
            >
              {/* Watermark SVG discreto no canto */}
              <svg
                className="pointer-events-none absolute -bottom-6 right-4 size-44 opacity-10"
                viewBox="0 0 120 120"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="70" cy="70" r="46" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="70" cy="70" r="28" stroke="currentColor" strokeWidth="1.5" />
              </svg>

              <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
                <div className="grid grid-cols-1 gap-8 pb-10 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      {logoUrl ? (
                        <img src={logoUrl} alt={storeName} className="size-9 rounded-lg object-cover" />
                      ) : null}
                      <strong className="text-base font-extrabold" style={{ color: footerInk }}>{storeName}</strong>
                    </div>
                    {!footerTagOverride.hidden ? (
                      <p
                        data-node-path="footer.tagline"
                        data-node-label="Descrição do rodapé"
                        data-edit-props="fontSize,textColor,visibility"
                        className="text-xs leading-relaxed"
                        style={{ color: footerMuted, ...footerTagOverride.style }}
                      >
                        {profile?.business?.description?.slice(0, 120) || 'Atendimento direto e seleção real de produtos da loja.'}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <p className="font-bold uppercase tracking-wider" style={{ color: footerAccent }}>Catálogo</p>
                    <ul className="space-y-1.5">
                      {cats.map((c) => (
                        <li key={c}>
                          <a href="#catalogo" onClick={() => onSelectCategoryFilter?.(c)} className="hover:underline" style={{ color: footerMuted }}>
                            {c}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <p className="font-bold uppercase tracking-wider" style={{ color: footerAccent }}>Atendimento</p>
                    <div className="space-y-1.5" style={{ color: footerMuted }}>
                      {profile?.business?.hours ? (
                        <p className="flex items-center gap-2"><Clock className="size-3.5" /> {profile.business.hours}</p>
                      ) : null}
                      {profile?.business?.address ? (
                        <p className="flex items-center gap-2"><MapPin className="size-3.5" /> {profile.business.address}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <p className="font-bold uppercase tracking-wider" style={{ color: footerAccent }}>Pedido Direto</p>
                    <button
                      type="button"
                      onClick={() => onDirectWhatsappSend?.(`Olá ${storeName}! Gostaria de atendimento.`)}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                      style={{ backgroundColor: footerAccent, color: footerCtaInk }}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      <span>Chamar no WhatsApp</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-5 text-[11px]" style={{ color: footerMuted }}>
                  <span>© {new Date().getFullYear()} {storeName}</span>
                  {profile?.brand?.instagram ? <span>{profile.brand.instagram}</span> : null}
                </div>
              </div>
            </footer>
          );
        }

        // 7B. NOVOS COMPONENTES REUTILIZÁVEIS DE CAMPANHA & CONSULTÓRIO (Vert Club, Motion Physio, Northpaw)
        if (role === 'campaign_christmas_hero') {
          const displayText =
            textSlots.find((t) => t.micro?.[1] === 'display')?.micro?.[2] ||
            textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] ||
            'A NOITE DE NATAL';
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || '';
          const couponCode = String(section.content?.couponCode || 'NATAL20');
          const discountPct = Number(section.content?.discountPercent || 20);
          return (
            <ChristmasKnitHeroStage
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              storeName={storeName}
              headline={displayText}
              subheadline={bodyText}
              ctaLabel={String(section.content?.ctaPrimaryLabel || 'COMPRAR A CAMPANHA')}
              heroImageUrl={resolvedImg}
              couponCode={couponCode}
              discountPercent={discountPct}
              bgHex={anchorDarkBg}
              accentHex={resolvedAccent}
              products={boundProducts.length > 0 ? boundProducts : products}
              onApplyCoupon={onApplyCoupon}
            />
          );
        }

        if (role === 'campaign_christmas_checkpoints') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'QUATRO PARADAS';
          const accentSub = String(section.content?.accentHeading || 'PARA O FIM DE ANO');
          return (
            <CheckpointJourneyStrip
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              atomicRole="campaign_christmas_checkpoints"
              heading={title}
              accentHeading={accentSub}
              products={boundProducts.length > 0 ? boundProducts : products}
              bgHex={anchorDarkBg}
              accentHex={String(section.content?.goldHex || '#C9A24A')}
              onAddToCart={(p) => handleAdd(p)}
            />
          );
        }

        if (role === 'campaign_blackfriday_hero') {
          const headlineRaw =
            textSlots.find((t) => t.micro?.[1] === 'display')?.micro?.[2] || 'BLACK|FRIDAY';
          const [topLine, botLine] = headlineRaw.includes('|')
            ? headlineRaw.split('|')
            : [headlineRaw.split(' ')[0] || 'BLACK', headlineRaw.split(' ').slice(1).join(' ') || 'FRIDAY'];
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2] || '';
          return (
            <BlackFridayMassiveHero
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              storeName={storeName}
              cityTag={String(section.content?.cityTag || 'EDIÇÃO LIMITADA')}
              headlineTop={topLine}
              headlineBottom={botLine}
              subheadline={String(section.content?.subheadline || 'TRÊS OFERTAS. LOTE CONTADO.')}
              description={bodyText}
              stampText={String(section.content?.stampText || '-30%')}
              stampSub={String(section.content?.stampSub || 'OFERTA ÂNCORA · LOTE LIMITADO')}
              heroImageUrl={resolvedImg || products[0]?.imageUrl}
              bgHex={anchorDarkBg}
              accentHex={resolvedAccent}
              products={boundProducts.length > 0 ? boundProducts : products}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />
          );
        }

        if (role === 'campaign_blackfriday_drop') {
          const pool = boundProducts.length > 0 ? boundProducts : products;
          const featured = pool[0];
          if (!featured) return null;
          const secTitle = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'OS LOTES';
          return (
            <section
              key={tuple[0]}
              data-testid={`atomic-sec-${tuple[0]}`}
              data-atomic-role="campaign_blackfriday_drop"
              className="w-full"
              style={{ backgroundColor: bgHex, paddingTop: `${compiled.paddingY}px`, paddingBottom: `${compiled.paddingY}px` }}
            >
              <div className="mx-auto max-w-7xl px-4 sm:px-8">
                <SlantedStampAndFeatureSplit
                  product={featured}
                  secondaryProducts={pool.slice(1)}
                  sectionTitle={secTitle}
                  stampLabel={String(section.content?.stampLabel || 'SAVE 30%')}
                  accentColor={resolvedAccent}
                  darkBg={bgHex}
                  onAddToCart={(p) => handleAdd(p)}
                />
              </div>
            </section>
          );
        }

        if (role === 'campaign_blackfriday_terms') {
          return (
            <BlackFridayFinePrintBand
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              storeName={storeName}
              bgHex={anchorDarkBg}
              accentHex={resolvedAccent}
            />
          );
        }

        if (role === 'clinic_editorial_hero') {
          const rawDisplay =
            textSlots.find((t) => t.micro?.[1] === 'display')?.micro?.[2] || 'Em cada consulta, você vê o progresso.';
          const accentTagMatch = rawDisplay.match(/<accent>([\s\S]*?)<\/accent>/i);
          const cleanedDisplay = rawDisplay.replace(/<\/?accent>/gi, '').replace(/\s+/g, ' ').trim();
          let lead = cleanedDisplay;
          let accentPart = '';
          if (accentTagMatch) {
            const taggedText = accentTagMatch[1].replace(/<\/?accent>/gi, '').trim();
            const idx = accentTagMatch.index ?? 0;
            const beforeTag = rawDisplay.slice(0, idx).replace(/<\/?accent>/gi, '').trim();
            const afterTag = rawDisplay.slice(idx + accentTagMatch[0].length).replace(/<\/?accent>/gi, '').trim();
            lead = beforeTag || cleanedDisplay.split(' ').slice(0, -2).join(' ');
            accentPart = afterTag ? `${taggedText} ${afterTag}` : taggedText;
          } else {
            const parts = cleanedDisplay.split('|');
            lead = parts.length > 1 ? parts[0].trim() : cleanedDisplay.split(' ').slice(0, -2).join(' ');
            accentPart = parts.length > 1 ? parts[1].trim() : cleanedDisplay.split(' ').slice(-2).join(' ');
          }
          const bodyText = textSlots.find((t) => t.micro?.[1] === 'body')?.micro?.[2]?.replace(/<\/?accent>/gi, '') || '';
          const sectionGround = String(sectionNodeOverride.style?.backgroundColor || bgHex);
          return (
            <ClinicEditorialHeroAndStrip
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              storeName={storeName}
              eyebrow={String(section.content?.eyebrow || '')}
              headlineLead={lead}
              headlineAccent={accentPart}
              subheadline={bodyText}
              ctaLabel={String(section.content?.ctaPrimaryLabel || 'Agende a primeira consulta')}
              secondaryLinkLabel={String(section.content?.secondaryLinkLabel || 'Onde dói? Explore o mapa corporal')}
              heroImageUrl={resolvedImg}
              featuredProduct={boundProducts[0] || products[0]}
              groundHex={sectionGround}
              pineHex={anchorDarkBg}
              accentHex={resolvedAccent}
              nodeStyles={nodeStyles}
              sectionStyle={sectionNodeOverride.style}
            />
          );
        }

        if (role === 'clinic_symptom_map') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Onde dói? Toque para ver como tratamos.';
          return (
            <InteractiveSymptomOrNeedMap
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              atomicRole="clinic_symptom_map"
              heading={title}
              products={boundProducts.length > 0 ? boundProducts : products}
              darkBg={anchorDarkBg}
              accentHex={resolvedAccent}
              onAddToCart={(p) => handleAdd(p)}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />
          );
        }

        if (role === 'clinic_specialists_deck') {
          const title =
            textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] ||
            'Especialistas dedicados. Um profissional acompanha você do início à alta.';
          const specs = Array.isArray(section.content?.specialists) ? section.content.specialists : [];
          return (
            <ClinicSpecialistsDeck
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              heading={title}
              specialists={specs}
              groundHex={bgHex}
              pineHex={anchorDarkBg}
              accentHex={resolvedAccent}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />
          );
        }

        if (role === 'clinic_pricing_tiers') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Preços claros. Sem surpresas na conta.';
          return (
            <NumberedEditorialPricingTiers
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              atomicRole="clinic_pricing_tiers"
              heading={title}
              products={boundProducts.length > 0 ? boundProducts : products}
              groundHex={bgHex}
              anchorDarkBg={anchorDarkBg}
              accentHex={resolvedAccent}
              onAddToCart={(p) => handleAdd(p)}
            />
          );
        }

        if (role === 'clinic_case_scoreboard') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Não é só melhorar um pouco. Os números melhoram.';
          const customCases = Array.isArray(section.content?.cases) ? section.content.cases : [];
          return (
            <RecoveryCaseScoreboard
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              atomicRole="clinic_case_scoreboard"
              heading={title}
              groundHex={bgHex}
              accentHex={resolvedAccent}
              products={boundProducts.length > 0 ? boundProducts : products}
              customCases={customCases}
              onAddToCart={(p) => handleAdd(p)}
            />
          );
        }

        if (role === 'interactive_image_text_stage') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Explore cada detalhe';
          const spots = Array.isArray(section.direction?.hotspots)
            ? section.direction.hotspots
            : Array.isArray(section.content?.hotspots)
              ? section.content.hotspots
              : [];
          return (
            <InteractiveImageTextStage
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              heading={title}
              eyebrow={String(section.content?.eyebrow || '')}
              imageUrl={resolvedImg}
              hotspots={spots}
              textAnchor={section.direction?.textAnchor || 'right'}
              products={boundProducts.length > 0 ? boundProducts : products}
              bgHex={bgHex}
              darkHex={anchorDarkBg}
              accentHex={resolvedAccent}
              onAddToCart={(p) => handleAdd(p)}
            />
          );
        }

        if (role === 'bundle_builder_calculator') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Monte seu Combo com Desconto';
          return (
            <BundleBuilderCalculator
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              heading={title}
              products={boundProducts.length > 0 ? boundProducts : products}
              bgHex={bgHex}
              darkHex={anchorDarkBg}
              accentHex={resolvedAccent}
              onAddToCart={(p) => handleAdd(p)}
            />
          );
        }

        if (role === 'calendar_delivery_slots') {
          const title = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Reserve seu horário ou data de entrega';
          return (
            <CalendarDeliverySlotsBand
              key={tuple[0]}
              testId={`atomic-sec-${tuple[0]}`}
              heading={title}
              bgHex={bgHex}
              darkHex={anchorDarkBg}
              accentHex={resolvedAccent}
              onDirectWhatsappSend={onDirectWhatsappSend}
            />
          );
        }

        // 8. CATALOG FULL GRID (AutoAnimate + Responsive Grid + Badge Pix + Spec Cards)
        const catCounts = new Map<string, number>();
        for (const p of boundProducts) {
          const c = (p.category || 'Geral').trim() || 'Geral';
          catCounts.set(c, (catCounts.get(c) || 0) + 1);
        }
        const cats = ['Todas', ...Array.from(catCounts.keys())];
        const filtered = boundProducts.filter((p) => {
          const matchCat = activeCat === 'Todas' || (p.category || 'Geral').trim() === activeCat;
          const matchQuery = !search.trim() || `${p.name} ${p.category || ''} ${p.variation || ''}`.toLowerCase().includes(search.trim().toLowerCase());
          return matchCat && matchQuery;
        });
        const headingTitle = textSlots.find((t) => t.micro?.[1] === 'heading')?.micro?.[2] || 'Catálogo completo';
        const captionText = textSlots.find((t) => t.micro?.[1] === 'caption')?.micro?.[2] || '';
        const pixDiscountPct = Math.max(0, Number(profile?.payment?.pixDiscountPercent || 0));
        const catalogGridOverride = resolveNodeStyle(nodeStyles, 'catalog.grid');

        const mobColsCls = compiled.gridColsMobile === 1 ? 'grid-cols-1' : 'grid-cols-2';
        const tabColsCls = compiled.gridColsTablet === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
        const deskColsCls =
          compiled.gridColsDesktop === 4
            ? 'lg:grid-cols-4'
            : compiled.gridColsDesktop === 2
              ? 'lg:grid-cols-2'
              : 'lg:grid-cols-3';
        const gridColsCls = catalogGridOverride.columns
          ? resolveGridColumnsClass(catalogGridOverride.columns, cn(mobColsCls, tabColsCls, deskColsCls))
          : cn(mobColsCls, tabColsCls, deskColsCls);

        return (
          <section
            id="catalogo"
            key={tuple[0]}
            data-testid={`atomic-sec-${tuple[0]}`}
            data-atomic-role="catalog_full_grid"
            className="relative w-full"
            style={{
              backgroundColor: bgHex,
              paddingTop: `${compiled.paddingY}px`,
              paddingBottom: `${compiled.paddingY}px`,
              ...sectionNodeOverride.style,
            }}
          >
            <PaperGrainOverlay opacity={compiled.paperGrainOpacity} />
            <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 sm:px-6">
              <SectionHeadingOrnament
                title={headingTitle}
                subtitle={captionText}
                ornamentKind={compiled.ornamentKind}
                inkHex={inkHex}
                accentHex={resolvedAccent}
                mutedHex={mutedHex}
                hairlineColor={hairline}
                h2Style={compiled.h2Style}
                nodeStyles={nodeStyles}
                titlePath="catalog.title"
                subtitlePath="catalog.subtitle"
                titleLabel="Título do catálogo"
                subtitleLabel="Subtítulo do catálogo"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {cats.map((cat) => {
                    const count = cat === 'Todas' ? boundProducts.length : catCounts.get(cat) || 0;
                    const active = activeCat === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCat(cat)}
                        className="relative min-h-[38px] rounded-full px-4 text-xs font-bold transition-colors"
                        style={{
                          backgroundColor: active ? anchorDarkBg : '#FFFFFF',
                          color: active ? anchorBtnInk : whiteCardInk,
                        }}
                      >
                        {active ? (
                          <m.span
                            layoutId="cat-filter-pill"
                            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                            className="pointer-events-none absolute inset-0 rounded-full"
                            style={{ backgroundColor: anchorDarkBg }}
                          />
                        ) : (
                          <span className="pointer-events-none absolute inset-0 rounded-full border" style={{ borderColor: 'rgba(15,23,42,0.16)' }} />
                        )}
                        <span className="relative z-10">{cat} ({count})</span>
                      </button>
                    );
                  })}
                </div>
                <label className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3.5 size-4 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto ou variação..."
                    className="h-10 w-full rounded-full border bg-white pl-10 pr-4 text-xs text-slate-900 shadow-2xs focus:outline-none sm:w-64"
                    style={{ borderColor: hairline }}
                  />
                </label>
              </div>

              <div
                ref={gridAnimRef}
                data-testid="v9-atomic-catalog-grid"
                data-node-path="catalog.grid"
                data-node-label="Grade do catálogo"
                data-edit-props="columns,groupFilter,bgColor"
                className={cn('grid', gridColsCls)}
                style={{ gap: `${compiled.gapPx}px`, ...catalogGridOverride.style }}
              >
                {filtered.map((prod, idx) => {
                  const skuKey = prod.sku || prod.id;
                  const cardPath = `catalog.card.${skuKey}`;
                  const cardOverride = resolveNodeStyle(nodeStyles, cardPath);
                  if (cardOverride.hidden) return null;
                  const imgOverride = resolveNodeStyle(nodeStyles, `${cardPath}.image`);
                  const titleOverride = resolveNodeStyle(nodeStyles, `${cardPath}.title`);
                  const priceOverride = resolveNodeStyle(nodeStyles, `${cardPath}.price`);
                  const ctaOverride = resolveNodeStyle(nodeStyles, `${cardPath}.cta`);

                  const cleanUrl = resolveProductImage(prod, idx);
                  const hasRealPhoto = Boolean(cleanUrl && !/^data:image\/svg\+xml/i.test(cleanUrl));
                  const isAdded = Boolean(addedIds[prod.id]);
                  const initials = (prod.name || 'CG')
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() || '')
                    .join('') || 'CG';

                  return (
                    <article
                      key={prod.id}
                      data-testid={`v9-catalog-card-${skuKey}`}
                      data-node-path={cardPath}
                      data-node-label={`Card · ${prod.name}`}
                      data-edit-props="bgColor,visibility"
                      className="flex flex-col justify-between overflow-hidden border bg-white text-slate-900 transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{
                        borderRadius: `${compiled.outerRadiusPx}px`,
                        borderColor: 'rgba(15,23,42,0.12)',
                        boxShadow: compiled.shadowCss,
                        ...cardOverride.style,
                      }}
                    >
                      {hasRealPhoto ? (
                        <div>
                          {!imgOverride.hidden ? (
                            <div
                              data-node-path={`${cardPath}.image`}
                              data-node-label={`Foto · ${prod.name}`}
                              data-edit-props="image,visibility"
                              onClick={() => onSelectProductDetail?.(prod)}
                              className="aspect-[4/3] w-full cursor-pointer overflow-hidden bg-[#FBF6EE]"
                            >
                              <SafeCatalogImage
                                src={cleanUrl}
                                alt={prod.name}
                                category={prod.category}
                                primaryColor={primaryColor}
                              />
                            </div>
                          ) : null}
                          <div className="space-y-1 p-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: whiteCardAccent }}>
                              {prod.category || 'Produto'}
                            </span>
                            {!titleOverride.hidden ? (
                              <h3
                                data-node-path={`${cardPath}.title`}
                                data-node-label={`Nome · ${prod.name}`}
                                data-edit-props="fontSize,textColor,visibility"
                                className="line-clamp-2 text-sm font-bold leading-snug"
                                style={{ color: whiteCardInk, ...titleOverride.style }}
                              >
                                {prod.name}
                              </h3>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        /* Card Tecnico Denso (sem caixa cinza morta quando nao ha foto) */
                        <div
                          onClick={() => onSelectProductDetail?.(prod)}
                          className="cursor-pointer space-y-2.5 p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="truncate rounded-full bg-[#FBF6EE] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: creamBadgeInk }}
                            >
                              {prod.category || 'Produto'}
                            </span>
                            <span
                              className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-[#FBF6EE] text-[11px] font-extrabold"
                              style={{ borderColor: 'rgba(15,23,42,0.12)', borderBottom: `2px solid ${anchorDarkBg}`, color: creamBadgeInk }}
                            >
                              {initials}
                            </span>
                          </div>
                          {!titleOverride.hidden ? (
                            <h3
                              data-node-path={`${cardPath}.title`}
                              data-node-label={`Nome · ${prod.name}`}
                              data-edit-props="fontSize,textColor,visibility"
                              className="line-clamp-2 text-sm font-bold leading-snug"
                              style={{ color: whiteCardInk, ...titleOverride.style }}
                            >
                              {prod.name}
                            </h3>
                          ) : null}
                          {(prod.variation || prod.description) ? (
                            <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: whiteCardMuted }}>
                              {[prod.variation && prod.variation !== 'Padrão' ? prod.variation : '', prod.description]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      )}

                      <div
                        className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5 sm:px-4 sm:py-3"
                        style={{ borderColor: 'rgba(15,23,42,0.1)' }}
                      >
                        <div className="flex flex-col">
                          {!priceOverride.hidden ? (
                            <span
                              data-node-path={`${cardPath}.price`}
                              data-node-label={`Preço · ${prod.name}`}
                              data-edit-props="fontSize,textColor,visibility"
                              className="text-sm font-extrabold tabular-nums sm:text-base"
                              style={{ color: whiteCardInk, ...priceOverride.style }}
                            >
                              {prod.priceCents > 0 ? formatCurrencyBRL(prod.priceCents) : 'Sob consulta'}
                            </span>
                          ) : null}
                          {(compiled.showPixBadge || pixDiscountPct > 0) && prod.priceCents > 0 ? (
                            <span className="text-[10px] font-bold text-emerald-700">
                              {pixDiscountPct > 0 ? `-${pixDiscountPct}% no Pix` : 'Pix imediato'}
                            </span>
                          ) : null}
                        </div>
                        {!ctaOverride.hidden ? (
                          <button
                            type="button"
                            data-node-path={`${cardPath}.cta`}
                            data-node-label={`Botão · ${prod.name}`}
                            data-edit-props="bgColor,textColor,visibility"
                            onClick={() => handleAdd(prod)}
                            aria-label={`Adicionar ${prod.name}`}
                            className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[11px] font-bold whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-all hover:-translate-y-0.5 active:scale-[0.96] sm:text-xs"
                            style={{
                              backgroundColor: isAdded ? '#059669' : anchorDarkBg,
                              color: isAdded ? '#FFFFFF' : anchorBtnInk,
                              ...ctaOverride.style,
                            }}
                          >
                            {isAdded ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                            <span>{isAdded ? 'Na sacola' : 'Adicionar'}</span>
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}
    </LazyMotion>
  );
}
