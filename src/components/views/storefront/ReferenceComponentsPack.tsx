import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { m } from 'motion/react';
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  FileCheck2,
  MapPin,
  MessageCircle,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Ticket,
} from 'lucide-react';
import { formatCurrencyBRL, type CatalogProduct } from '@/schemas/profile.schema';
import { ensureSafeAccentContrast, ensureSafeInkContrast, renderHighlightedCopy } from './AtomicGrammarCompiler';

const MONO_FONT = "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace";
const CONDENSED_FONT = "'Big Shoulders Display', 'Archivo', Impact, sans-serif";
const EDITORIAL_ARCHIVO = "'Archivo', ui-sans-serif, system-ui, sans-serif";
const SERIF_FONT = "'Fraunces', Georgia, serif";

export function FlipCountdownMatrix({
  label = 'ENCERRA EM',
  accentColor = '#EF4444',
  darkBg = '#0C1A13',
  targetHours = 18,
  variant = 'gold_glow',
}: {
  label?: string;
  accentColor?: string;
  darkBg?: string;
  targetHours?: number;
  variant?: 'gold_glow' | 'industrial_bf';
}) {
  const [remainingSec, setRemainingSec] = useState(Math.max(3600, Math.round(targetHours * 3600) + 1423));

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemainingSec((s) => (s > 1 ? s - 1 : targetHours * 3600));
    }, 1000);
    return () => window.clearInterval(id);
  }, [targetHours]);

  const days = Math.floor(remainingSec / 86400);
  const hours = Math.floor((remainingSec % 86400) / 3600);
  const mins = Math.floor((remainingSec % 3600) / 60);
  const secs = remainingSec % 60;

  const units = [
    { v: String(days).padStart(2, '0'), k: 'DIAS' },
    { v: String(hours).padStart(2, '0'), k: 'HRS' },
    { v: String(mins).padStart(2, '0'), k: 'MIN' },
    { v: String(secs).padStart(2, '0'), k: 'SEG' },
  ];

  const safeAccent = ensureSafeAccentContrast(accentColor, darkBg, 4.5);
  const isBf = variant === 'industrial_bf';

  return (
    <div
      className={isBf ? 'inline-flex flex-col gap-2 border border-white/15 bg-[#12100E] p-3.5' : 'inline-flex flex-col gap-1.5'}
      style={{ fontFamily: MONO_FONT }}
    >
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: safeAccent }}>
        <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: safeAccent }} />
        <span>{label}</span>
      </span>
      <div className="flex items-center gap-2">
        {units.map((u) => (
          <div key={u.k} className="flex flex-col items-center gap-1">
            <div
              className={`relative flex items-center justify-center overflow-hidden border tabular-nums text-white ${
                isBf
                  ? 'h-14 w-13 rounded-sm border-white/20 bg-[#1B1916] text-2xl font-black'
                  : 'h-14 w-12 rounded-md border-[#C9A24A]/45 bg-[#08130D]/90 text-2xl font-black'
              }`}
              style={{
                boxShadow: isBf
                  ? 'inset 0 1px 0 rgba(255,255,255,0.12)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 18px -6px rgba(0,0,0,0.65)',
              }}
            >
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/70" />
              <span className="relative z-10">{u.v}</span>
            </div>
            <span className="text-[9px] font-semibold tracking-[0.18em] text-zinc-400">{u.k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Ticket / Cupom Rasgavel interativo (Vert Club).
 */
export function InteractiveTearCouponBib({
  storeName,
  code,
  discountPercent,
  accentColor = '#B3262E',
  darkBg: _darkBg = '#12261C',
  onReveal,
}: {
  storeName: string;
  code: string;
  discountPercent: number;
  accentColor?: string;
  darkBg?: string;
  onReveal: (code: string, discountPercent: number) => void;
}) {
  const [torn, setTorn] = useState(false);
  const safeAccent = ensureSafeAccentContrast(accentColor, '#F8F7F4', 4.5);

  const handleTear = () => {
    if (torn) return;
    setTorn(true);
    onReveal(code, discountPercent);
  };

  return (
    <m.div
      initial={{ opacity: 0, rotate: -3.2, y: 14 }}
      whileInView={{ opacity: 1, rotate: -2.2, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-sm border border-stone-900/20 bg-[#F7F4EC] p-5 text-slate-900 shadow-[0_24px_55px_-12px_rgba(0,0,0,0.62)]"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      {/* 4 Ilhoses escuros nos cantos */}
      <span aria-hidden="true" className="absolute left-2.5 top-2.5 size-2.5 rounded-full bg-zinc-900 ring-2 ring-zinc-300" />
      <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-zinc-900 ring-2 ring-zinc-300" />
      <span aria-hidden="true" className="absolute bottom-2.5 left-2.5 size-2.5 rounded-full bg-zinc-900 ring-2 ring-zinc-300" />
      <span aria-hidden="true" className="absolute bottom-2.5 right-2.5 size-2.5 rounded-full bg-zinc-900 ring-2 ring-zinc-300" />

      {/* Ornamento discreto no canto superior direito */}
      <svg aria-hidden="true" viewBox="0 0 42 42" className="pointer-events-none absolute -right-2 -top-2 size-11 drop-shadow">
        <path d="M22 18 C16 6, 4 10, 8 22 C13 20, 18 19, 22 18 Z" fill="#166534" />
        <path d="M22 18 C28 6, 39 10, 34 22 C29 20, 25 19, 22 18 Z" fill="#15803D" />
        <circle cx="20" cy="20" r="3.5" fill="#B91C1C" />
        <circle cx="25" cy="22" r="3" fill="#DC2626" />
      </svg>

      <div className="space-y-3 px-3 py-1">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT, color: '#1F2937' }}>
          <span>{storeName} · PASSE OFICIAL</span>
          <Ticket className="size-3.5" style={{ color: safeAccent }} aria-hidden="true" />
        </div>

        <div className="flex items-center gap-3">
          <span
            className="text-5xl font-black tracking-tight text-[#12261C] tabular-nums sm:text-6xl"
            style={{ fontFamily: EDITORIAL_ARCHIVO, lineHeight: 0.9 }}
          >
            {discountPercent}%
          </span>
          <div className="flex flex-col text-sm font-black uppercase leading-tight" style={{ color: safeAccent }}>
            <span>OFF NA</span>
            <span>SACOLA TODA</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500" style={{ fontFamily: MONO_FONT }}>
          <span>LOTE DE TEMPORADA</span>
          <span>USO IMEDIATO</span>
        </div>

        <div className="border-t-2 border-dashed border-stone-400/70 pt-3">
          {!torn ? (
            <m.button
              type="button"
              onClick={handleTear}
              whileHover={{ scale: 1.02, x: 3 }}
              whileTap={{ scale: 0.97 }}
              className="flex min-h-[48px] w-full items-center justify-center rounded-sm px-4 text-xs font-extrabold uppercase tracking-[0.16em] shadow-sm"
              style={{
                fontFamily: MONO_FONT,
                backgroundImage: `repeating-linear-gradient(-45deg, ${safeAccent}, ${safeAccent} 12px, #F7F4EC 12px, #F7F4EC 24px)`,
                border: `1.5px solid ${safeAccent}`,
              }}
            >
              <span className="bg-white px-3 py-1.5 text-[11px] font-black text-slate-950 shadow">
                CLIQUE PARA RASGAR →
              </span>
            </m.button>
          ) : (
            <m.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-between gap-2 rounded-sm border border-emerald-700/35 bg-emerald-50 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2">
                <Check className="size-4 text-emerald-700" aria-hidden="true" />
                <span className="text-xs font-bold text-emerald-950">Cupom liberado:</span>
              </div>
              <code
                className="rounded-sm bg-emerald-800 px-2.5 py-1 text-xs font-black tracking-widest text-white"
                style={{ fontFamily: MONO_FONT }}
              >
                {code}
              </code>
            </m.div>
          )}
        </div>
      </div>
    </m.div>
  );
}

/**
 * 1B. ChristmasKnitHeroStage (Vert Club Fidelity: H1 ~115px em moldura tricotada natalina + FlipClock + Cupom Rasgavel)
 */
export function ChristmasKnitHeroStage({
  testId,
  storeName,
  headline,
  subheadline,
  eyebrowDate = 'EDIÇÃO LIMITADA · ENTREGA PROGRAMADA',
  ctaLabel = 'APROVEITAR CAMPANHA',
  heroImageUrl,
  couponCode = 'NATAL20',
  discountPercent = 20,
  bgHex = '#0C1A13',
  accentHex = '#B3262E',
  goldHex = '#C9A24A',
  products = [],
  onApplyCoupon,
}: {
  testId?: string;
  storeName: string;
  headline: string;
  subheadline?: string;
  eyebrowDate?: string;
  ctaLabel?: string;
  heroImageUrl?: string;
  couponCode?: string;
  discountPercent?: number;
  bgHex?: string;
  accentHex?: string;
  goldHex?: string;
  products?: CatalogProduct[];
  onApplyCoupon: (code: string, pct: number) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const ink = ensureSafeInkContrast('#F5F1E8', bgHex, 4.6);

  return (
    <section
      data-testid={testId}
      data-atomic-role="campaign_christmas_hero"
      className="relative flex min-h-[680px] w-full items-center overflow-hidden py-16 lg:min-h-[820px]"
      style={{ backgroundColor: bgHex, color: ink }}
    >
      {heroImageUrl && !imgErr ? (
        <img
          src={heroImageUrl}
          alt={storeName}
          onError={() => setImgErr(true)}
          className="absolute inset-0 size-full object-cover object-center opacity-55"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,19,13,0.92) 0%, rgba(12,26,19,0.72) 52%, rgba(12,26,19,0.38) 100%)',
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-end gap-10 px-4 sm:px-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.26em]" style={{ fontFamily: MONO_FONT, color: goldHex }}>
            {storeName.toUpperCase()} · {eyebrowDate}
          </p>

          {/* Moldura natalina estilo sueter tricotado com motivo geometrico */}
          <div
            className="relative p-3 sm:p-4"
            style={{
              backgroundColor: accentHex,
              backgroundImage: `
                repeating-linear-gradient(45deg, rgba(245,241,232,0.22) 0 4px, transparent 4px 10px),
                repeating-linear-gradient(-45deg, rgba(12,26,19,0.42) 0 4px, transparent 4px 10px)
              `,
              boxShadow: '0 22px 60px -15px rgba(0,0,0,0.7)',
            }}
          >
            <div className="border-2 border-[#C9A24A]/65 bg-[#0E2117] px-5 py-6 sm:px-8 sm:py-8">
              <h1
                className="font-black uppercase tracking-[-0.025em]"
                style={{
                  fontFamily: EDITORIAL_ARCHIVO,
                  fontSize: 'clamp(3rem, 7.1vw, 6.9rem)',
                  lineHeight: 0.86,
                  color: '#F5F1E8',
                }}
              >
                {headline}
              </h1>
            </div>
          </div>

          {subheadline ? (
            <p className="max-w-lg text-sm leading-relaxed text-stone-200/90 sm:text-base">{subheadline}</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-5 pt-1">
            <FlipCountdownMatrix
              label="ENCERRA EM BREVE"
              accentColor={goldHex}
              darkBg={bgHex}
              variant="gold_glow"
            />
            <a
              href="#catalogo"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-sm border px-7 text-xs font-black uppercase tracking-[0.18em] shadow-lg transition-transform hover:-translate-y-0.5"
              style={{
                fontFamily: EDITORIAL_ARCHIVO,
                backgroundColor: accentHex,
                borderColor: goldHex,
                color: '#F5F1E8',
              }}
            >
              <span>{ctaLabel}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="flex flex-col items-end justify-end lg:col-span-5">
          <div className="w-full max-w-sm">
            <InteractiveTearCouponBib
              storeName={storeName}
              code={couponCode}
              discountPercent={discountPercent}
              accentColor={accentHex}
              darkBg={bgHex}
              onReveal={onApplyCoupon}
            />
          </div>
          {products[0] ? (
            <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-300/80" style={{ fontFamily: MONO_FONT }}>
              Destaque do passe: {products[0].name}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * 2. CheckpointJourneyStrip (Vert Club "FOUR CHECKPOINTS TO THE SOLSTICE")
 */
export function CheckpointJourneyStrip({
  heading = 'QUATRO PARADAS',
  accentHeading = 'DA TEMPORADA',
  products,
  bgHex = '#12261C',
  accentHex = '#C9A24A',
  pinHex = '#D9483B',
  testId,
  atomicRole = 'campaign_christmas_checkpoints',
  onAddToCart,
}: {
  heading?: string;
  accentHeading?: string;
  products: CatalogProduct[];
  bgHex?: string;
  accentHex?: string;
  pinHex?: string;
  testId?: string;
  atomicRole?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const items = products.slice(0, 4);
  const ink = ensureSafeInkContrast('#F5F1E8', bgHex, 4.6);
  const accent = ensureSafeAccentContrast(accentHex, bgHex, 4.5);
  const btnInk = ensureSafeInkContrast('#111827', accent, 4.6);

  useEffect(() => {
    if (!gridRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cards = gridRef.current.querySelectorAll('[data-cp-card="true"]');
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.09, ease: 'power3.out', clearProps: 'transform' },
      );
    }, gridRef);
    return () => ctx.revert();
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <section
      data-testid={testId}
      data-atomic-role={atomicRole}
      className="relative w-full overflow-hidden py-20 lg:py-24"
      style={{
        backgroundColor: bgHex,
        color: ink,
        backgroundImage:
          'repeating-radial-gradient(at 14% 26%, transparent 0px, transparent 28px, rgba(201,162,74,0.06) 29px, transparent 30px)',
      }}
    >
      <div ref={gridRef} className="relative z-10 mx-auto max-w-7xl space-y-10 px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2
            className="max-w-3xl font-black uppercase tracking-[-0.025em]"
            style={{ fontFamily: EDITORIAL_ARCHIVO, fontSize: 'clamp(2.4rem, 5.2vw, 4.25rem)', lineHeight: 0.9 }}
          >
            <span className="block" style={{ color: ink }}>{heading}</span>
            <span className="block" style={{ color: accent }}>{accentHeading}</span>
          </h2>
          <a
            href="#catalogo"
            className="text-xs font-bold uppercase tracking-[0.2em] hover:underline"
            style={{ fontFamily: MONO_FONT, color: ink }}
          >
            VER SELEÇÃO COMPLETA →
          </a>
        </div>

        <div className="hidden items-center gap-3 lg:flex" style={{ fontFamily: MONO_FONT }}>
          {items.map((it, idx) => (
            <React.Fragment key={it.id}>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold" style={{ color: accent }}>
                <MapPin className="size-3.5" style={{ color: pinHex }} aria-hidden="true" />
                <span>CP {idx + 1}</span>
              </span>
              {idx < items.length - 1 ? (
                <div className="h-px flex-1 border-t border-dashed opacity-40" style={{ borderColor: accent }} />
              ) : null}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, idx) => {
            const origPrice = Math.round(item.priceCents * 1.25);
            return (
              <article
                key={item.id}
                data-cp-card="true"
                className={`group flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1.5 ${
                  idx % 2 === 1 ? 'lg:mt-10' : ''
                }`}
              >
                <div className="space-y-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT, color: accent }}>
                    <MapPin className="size-3" style={{ color: pinHex }} aria-hidden="true" />
                    <span>CP {idx + 1} · {item.category}</span>
                  </span>
                  {item.imageUrl ? (
                    <div className="aspect-[4/5] w-full overflow-hidden rounded-sm bg-[#F5F1E8]">
                      <img src={item.imageUrl} alt={item.name} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </div>
                  ) : null}
                  <h3 className="text-lg font-black uppercase leading-tight tracking-tight" style={{ fontFamily: EDITORIAL_ARCHIVO, color: ink }}>
                    {item.name}
                  </h3>
                  {item.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-stone-300/80">{item.description}</p>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-baseline gap-2" style={{ fontFamily: MONO_FONT }}>
                    <span className="text-sm font-black tabular-nums" style={{ color: accent }}>
                      {formatCurrencyBRL(item.priceCents)}
                    </span>
                    <span className="text-xs line-through opacity-50 tabular-nums">
                      {formatCurrencyBRL(origPrice)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddToCart(item)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-sm px-3 text-[11px] font-extrabold uppercase tracking-wider shadow-sm active:scale-95"
                    style={{ fontFamily: MONO_FONT, backgroundColor: accent, color: btnInk }}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    <span>Adicionar</span>
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

/**
 * 3. BlackFridayMassiveHero (Northpaw Fidelity: H1 180px Big Shoulders Display + Carimbo -30% + Ticker diagonal + Early Access)
 */
export function BlackFridayMassiveHero({
  testId,
  storeName,
  cityTag = 'EDIÇÃO LIMITADA',
  headlineTop = 'BLACK',
  headlineBottom = 'FRIDAY',
  subheadline = 'TRÊS OFERTAS. LOTE CONTADO.',
  description = 'Descontos reais direto no Pix e estoque contado por lote.',
  stampText = '-30%',
  stampSub = 'OFERTA ÂNCORA · LOTE LIMITADO',
  heroImageUrl,
  bgHex = '#0B0A09',
  accentHex = '#FF5B14',
  products = [],
  onDirectWhatsappSend,
}: {
  testId?: string;
  storeName: string;
  cityTag?: string;
  headlineTop?: string;
  headlineBottom?: string;
  subheadline?: string;
  description?: string;
  stampText?: string;
  stampSub?: string;
  heroImageUrl?: string;
  bgHex?: string;
  accentHex?: string;
  products?: CatalogProduct[];
  onDirectWhatsappSend?: (msg: string) => void;
}) {
  const [vipContact, setVipContact] = useState('');
  const [vipSent, setVipSent] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const safeAccentInk = ensureSafeInkContrast('#111827', accentHex, 4.6);
  const darkText = ensureSafeInkContrast('#EFE8DC', bgHex, 4.6);

  return (
    <section
      data-testid={testId}
      data-atomic-role="campaign_blackfriday_hero"
      className="relative w-full overflow-hidden pb-14"
      style={{ backgroundColor: bgHex, color: darkText }}
    >
      {/* Faixa Hazard laranja e preta no topo absoluto */}
      <div
        aria-hidden="true"
        className="h-3 w-full"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, ${accentHex} 0 10px, ${bgHex} 10px 20px)`,
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-8 sm:px-8">
        {/* Linha breadcrumb com pill branca invertida */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT }}>
          <span className="bg-[#EFE8DC] px-2.5 py-0.5 text-[#0B0A09]">{storeName.toUpperCase()}</span>
          <span style={{ color: accentHex }}>{cityTag} · TRÊS LOTES OFICIAIS</span>
        </div>

        <div className="relative mt-4 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {/* DISPLAY GIGANTE ESTILO NORTHPAW (Big Shoulders Display) */}
            <h1
              className="font-black uppercase tracking-[-0.025em]"
              style={{
                fontFamily: CONDENSED_FONT,
                fontSize: 'clamp(4.8rem, 12.2vw, 11.4rem)',
                lineHeight: 0.82,
                color: accentHex,
              }}
            >
              <span className="block">{headlineTop}</span>
              <span className="block">{headlineBottom}</span>
            </h1>

            <div className="flex flex-wrap items-center gap-6">
              <FlipCountdownMatrix
                label="PORTAS ABREM EM"
                accentColor={accentHex}
                darkBg={bgHex}
                targetHours={102}
                variant="industrial_bf"
              />
              <div className="max-w-sm space-y-2">
                <h2
                  className="text-2xl font-black uppercase leading-none sm:text-3xl"
                  style={{ fontFamily: CONDENSED_FONT, color: darkText }}
                >
                  {subheadline}
                </h2>
                <p className="text-sm leading-relaxed text-[#EFE8DC]/75">{description}</p>
              </div>
            </div>

            {/* Bloco Lista VIP Antecipada */}
            <div className="max-w-xl pt-2">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#EFE8DC]/65" style={{ fontFamily: MONO_FONT }}>
                UM CAMPO. PRIMEIRO DA FILA QUANDO O LOTE ABRIR.
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!vipContact.trim()) return;
                  setVipSent(true);
                  onDirectWhatsappSend?.(`Quero acesso antecipado Black Friday (${storeName}): ${vipContact}`);
                }}
                className="flex flex-col border border-white/25 bg-[#12100E] sm:flex-row"
              >
                <input
                  type="text"
                  value={vipContact}
                  onChange={(e) => setVipContact(e.target.value)}
                  placeholder="seu-whatsapp ou email@loja.com"
                  className="h-12 flex-1 bg-transparent px-4 text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                  style={{ fontFamily: MONO_FONT }}
                />
                <button
                  type="submit"
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 px-6 text-sm font-black uppercase tracking-wider transition-brightness hover:brightness-110"
                  style={{ fontFamily: CONDENSED_FONT, backgroundColor: accentHex, color: safeAccentInk }}
                >
                  <span>{vipSent ? 'LISTA CONFIRMADA ✓' : 'ACESSO ANTECIPADO →'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Imagem limpa em destaque + Carimbo texturizado inclinado sem caixa branca */}
          <div className="relative flex min-h-[340px] items-center justify-center lg:col-span-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-4 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: accentHex }}
            />
            {heroImageUrl && !imgErr ? (
              <img
                src={heroImageUrl}
                alt={storeName}
                onError={() => setImgErr(true)}
                className="relative z-10 max-h-[430px] w-full object-contain drop-shadow-[0_32px_48px_rgba(0,0,0,0.85)]"
              />
            ) : null}

            {/* Carimbo retangular vazado inclinado -8deg */}
            <div
              className="relative z-20 -ml-10 -rotate-6 select-none border-4 px-5 py-3 shadow-2xl lg:absolute lg:left-0 lg:top-6"
              style={{
                borderColor: accentHex,
                backgroundColor: 'rgba(11,10,9,0.72)',
                color: accentHex,
              }}
            >
              <span className="block text-5xl font-black leading-none tracking-tight sm:text-6xl" style={{ fontFamily: CONDENSED_FONT }}>
                {stampText}
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: MONO_FONT }}>
                {stampSub}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ticker diagonal laranja cortando a tela toda na base */}
      <div
        className="mt-10 w-[104%] -ml-[2%] -rotate-[1.4deg] border-y border-black/40 py-2.5 shadow-xl"
        style={{ backgroundColor: accentHex, color: safeAccentInk }}
      >
        <div className="flex items-center justify-center gap-8 overflow-hidden whitespace-nowrap px-4">
          {(products.length > 0 ? products.slice(0, 3) : [{ id: 'd1', name: storeName, priceCents: 18900 } as CatalogProduct]).map((p, idx) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="text-lg font-black uppercase tracking-wide" style={{ fontFamily: CONDENSED_FONT }}>
                {p.name}
              </span>
              <span className="text-base font-black" style={{ fontFamily: MONO_FONT }}>
                {formatCurrencyBRL(p.priceCents)}
              </span>
              <span className="bg-[#0B0A09] px-2 py-0.5 text-[10px] font-bold uppercase" style={{ fontFamily: MONO_FONT, color: accentHex }}>
                -{idx === 0 ? 30 : 25}%
              </span>
              <span className="opacity-45">◆</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 4. SlantedStampAndFeatureSplit (Northpaw "THE CARD": H2 130px + 50/50 Main Event + Undercard 2 Colunas)
 */
export function SlantedStampAndFeatureSplit({
  product,
  secondaryProducts = [],
  sectionTitle = 'OS LOTES',
  sectionEyebrow = '',
  stampLabel = 'SAVE 30%',
  accentColor = '#FF5B14',
  darkBg = '#0B0A09',
  onAddToCart,
}: {
  product: CatalogProduct;
  secondaryProducts?: CatalogProduct[];
  sectionTitle?: string;
  sectionEyebrow?: string;
  stampLabel?: string;
  accentColor?: string;
  darkBg?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const safeAccentInk = ensureSafeInkContrast('#111827', accentColor, 4.6);
  const darkText = ensureSafeInkContrast('#EFE8DC', darkBg, 4.6);
  const darkAccent = ensureSafeAccentContrast(accentColor, darkBg, 4.5);
  const cardText = ensureSafeInkContrast('#EFE8DC', '#141210', 4.6);
  const cardAccent = ensureSafeAccentContrast(accentColor, '#141210', 4.5);
  const undercards = secondaryProducts.filter((p) => p.id !== product.id).slice(0, 2);
  const origMain = Math.round(product.priceCents * 1.42);

  return (
    <div className="space-y-8" style={{ color: darkText }}>
      {/* Header gigante estilo THE CARD */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {sectionEyebrow ? (
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT, color: darkAccent }}>
              {sectionEyebrow}
            </span>
          ) : null}
          <h2
            className="mt-1 font-black uppercase tracking-[-0.02em]"
            style={{ fontFamily: CONDENSED_FONT, fontSize: 'clamp(3.6rem, 8.5vw, 7.8rem)', lineHeight: 0.86, color: darkText }}
          >
            {sectionTitle}
          </h2>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-[#EFE8DC]/70" style={{ fontFamily: MONO_FONT }}>
          Um item principal em destaque e duas seleções paralelas com estoque limitado por lote.
        </p>
      </div>

      {/* Main Event Split 50/50 */}
      <div className="grid grid-cols-1 overflow-hidden border border-[#FF5B14]/45 lg:grid-cols-12" style={{ backgroundColor: '#141210' }}>
        <div
          className="relative flex min-h-[340px] flex-col items-center justify-center p-8 lg:col-span-6"
          style={{ backgroundColor: accentColor, color: safeAccentInk }}
        >
          <span
            className="absolute left-4 top-4 bg-[#0B0A09] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{ fontFamily: MONO_FONT, color: accentColor }}
          >
            LOTE PRINCIPAL
          </span>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="max-h-72 w-auto object-contain drop-shadow-[0_24px_38px_rgba(0,0,0,0.45)]" />
          ) : (
            <div className="flex size-36 items-center justify-center border-2 text-3xl font-black" style={{ borderColor: safeAccentInk }}>
              {product.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-6 p-6 sm:p-10 lg:col-span-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="h-2.5 w-14"
                style={{
                  backgroundImage: `repeating-linear-gradient(-45deg, ${accentColor} 0 6px, transparent 6px 12px)`,
                }}
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT, color: cardAccent }}>
                {product.category}
              </span>
              <span
                className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest"
                style={{ fontFamily: MONO_FONT, backgroundColor: accentColor, color: safeAccentInk }}
              >
                {stampLabel}
              </span>
            </div>

            <h3
              className="font-black uppercase tracking-tight"
              style={{ fontFamily: CONDENSED_FONT, fontSize: 'clamp(2.4rem, 4.4vw, 3.6rem)', lineHeight: 0.9, color: cardText }}
            >
              {product.name}
            </h3>

            <p className="text-sm leading-relaxed text-[#EFE8DC]/80">
              {product.description || product.variation || 'Edição limitada de Black Friday com envio prioritário.'}
            </p>

            <div className="flex items-baseline gap-3">
              <span
                className="font-black tabular-nums"
                style={{ fontFamily: CONDENSED_FONT, fontSize: 'clamp(2.4rem, 4vw, 3.4rem)', color: cardAccent }}
              >
                {formatCurrencyBRL(product.priceCents)}
              </span>
              <span className="text-xl font-bold text-zinc-500 line-through tabular-nums" style={{ fontFamily: CONDENSED_FONT }}>
                {formatCurrencyBRL(origMain)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 border-y border-white/15 py-3 text-xs" style={{ fontFamily: MONO_FONT }}>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-400">ALOCAÇÃO</span>
                <strong style={{ color: cardText }}>{Math.max(12, Number(product.stock || 24))} UNIDADES</strong>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-400">ESTOQUE AO VIVO</span>
                <strong style={{ color: cardAccent }}>● DISPONÍVEL NO PIX</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 border-2 border-[#EFE8DC]/45 bg-transparent px-6 text-xs font-extrabold uppercase tracking-[0.2em] text-[#EFE8DC] transition-colors hover:border-[#FF5B14] hover:bg-[#FF5B14] hover:text-[#111827]"
              style={{ fontFamily: MONO_FONT }}
            >
              <span>GARANTIR LOTE AGORA</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Undercard 2 Colunas abaixo (exatamente como no Northpaw) */}
      {undercards.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {undercards.map((item, idx) => {
            const origSub = Math.round(item.priceCents * 1.33);
            return (
              <article
                key={item.id}
                className="relative flex flex-col justify-between border border-white/12 bg-[#141210] p-6"
              >
                <span
                  className="absolute right-4 top-4 z-10 rotate-3 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider"
                  style={{ fontFamily: MONO_FONT, backgroundColor: accentColor, color: safeAccentInk }}
                >
                  SAVE 25%
                </span>

                <div className="space-y-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400" style={{ fontFamily: MONO_FONT }}>
                    UNDERCARD · 0{idx + 1}
                  </span>

                  {item.imageUrl ? (
                    <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-black/40 p-4">
                      <img src={item.imageUrl} alt={item.name} className="max-h-full w-auto object-contain" />
                    </div>
                  ) : null}

                  <div className="flex items-start justify-between gap-4">
                    <h3
                      className="text-2xl font-black uppercase leading-none sm:text-3xl"
                      style={{ fontFamily: CONDENSED_FONT, color: cardText }}
                    >
                      {item.name}
                    </h3>
                    <div className="shrink-0 text-right">
                      <span className="block text-2xl font-black tabular-nums leading-none" style={{ fontFamily: CONDENSED_FONT, color: cardAccent }}>
                        {formatCurrencyBRL(item.priceCents)}
                      </span>
                      <span className="text-xs text-zinc-500 line-through tabular-nums" style={{ fontFamily: MONO_FONT }}>
                        {formatCurrencyBRL(origSub)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-[#EFE8DC]/75">
                    {item.description || item.variation || 'Oferta de lote promocional disponível por tempo limitado.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onAddToCart(item)}
                  className="mt-6 inline-flex min-h-[46px] w-full items-center justify-center border border-white/30 text-xs font-extrabold uppercase tracking-[0.2em] text-[#EFE8DC] transition-colors hover:border-[#FF5B14] hover:bg-[#FF5B14] hover:text-[#111827]"
                  style={{ fontFamily: MONO_FONT }}
                >
                  ADICIONAR À SACOLA →
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 5. BlackFridayFinePrintBand (Northpaw "THE FINE PRINT": Barra zebra + 4 colunas mono + Watermark gigante)
 */
export function BlackFridayFinePrintBand({
  testId,
  storeName,
  bgHex = '#0B0A09',
  accentHex = '#FF5B14',
}: {
  testId?: string;
  storeName: string;
  bgHex?: string;
  accentHex?: string;
}) {
  const darkText = ensureSafeInkContrast('#EFE8DC', bgHex, 4.6);
  return (
    <section
      data-testid={testId}
      data-atomic-role="campaign_blackfriday_terms"
      className="relative w-full overflow-hidden border-t-2"
      style={{ backgroundColor: bgHex, borderColor: accentHex, color: darkText }}
    >
      <div
        aria-hidden="true"
        className="h-3 w-full"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, ${accentHex} 0 10px, ${bgHex} 10px 20px)`,
        }}
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-6 px-4 py-10 sm:px-8 lg:grid-cols-12">
        <h3
          className="font-black uppercase lg:col-span-3"
          style={{ fontFamily: CONDENSED_FONT, fontSize: 'clamp(2rem, 3.6vw, 3rem)', lineHeight: 0.9, color: accentHex }}
        >
          REGRAS DO LOTE
        </h3>
        <div className="grid grid-cols-2 gap-6 text-[11px] sm:grid-cols-4 lg:col-span-9" style={{ fontFamily: MONO_FONT }}>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">ABERTURA</span>
            <strong className="mt-1 block text-xs uppercase text-[#EFE8DC]">IMEDIATA NO PIX</strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">ENCERRAMENTO</span>
            <strong className="mt-1 block text-xs uppercase text-[#EFE8DC]">ATÉ DURAR O LOTE</strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">LIMITE</span>
            <strong className="mt-1 block text-xs uppercase text-[#EFE8DC]">PREÇO DE LOTE ÚNICO</strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">DESPACHO</span>
            <strong className="mt-1 block text-xs uppercase text-[#EFE8DC]">ENVIO PRIORITÁRIO</strong>
          </div>
        </div>
      </div>

      {/* Watermark gigante da marca no rodape */}
      <div aria-hidden="true" className="select-none overflow-hidden px-4 pb-2 text-center">
        <span
          className="block font-black uppercase tracking-[-0.03em] text-white/[0.04]"
          style={{ fontFamily: CONDENSED_FONT, fontSize: 'clamp(4.5rem, 16vw, 13rem)', lineHeight: 0.82 }}
        >
          {storeName.toUpperCase()}
        </span>
      </div>
    </section>
  );
}

/**
 * 6. ClinicEditorialHeroAndStrip (Motion Physio Fidelity: Fraunces 58px + sublinhado coral + card flutuante + faixa 01..04)
 */
export function ClinicEditorialHeroAndStrip({
  testId,
  storeName,
  eyebrow = '',
  headlineLead = 'Em cada consulta, você',
  headlineAccent = 'vê o progresso.',
  subheadline,
  ctaLabel = 'Agende a primeira consulta',
  secondaryLinkLabel = 'Qual é a sua necessidade? Explore o mapa abaixo',
  reassuranceNote = 'Avaliação completa sem encaminhamento. Plano escrito entregue no primeiro atendimento.',
  heroImageUrl,
  featuredProduct,
  groundHex = '#F6F0E6',
  pineHex = '#1E3530',
  accentHex = '#C65D3B',
  nodeStyles,
  sectionStyle,
}: {
  testId?: string;
  storeName: string;
  eyebrow?: string;
  headlineLead?: string;
  headlineAccent?: string;
  subheadline?: string;
  ctaLabel?: string;
  secondaryLinkLabel?: string;
  reassuranceNote?: string;
  heroImageUrl?: string;
  featuredProduct?: CatalogProduct;
  groundHex?: string;
  pineHex?: string;
  accentHex?: string;
  nodeStyles?: {
    hiddenNodes?: string[];
    nodes?: Record<string, { fontSizePx?: number; textAlign?: 'left' | 'center' | 'right'; textColor?: string; bgColor?: string }>;
  };
  sectionStyle?: React.CSSProperties;
}) {
  const [imgErr, setImgErr] = useState(false);
  const ink = ensureSafeInkContrast(pineHex, groundHex, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, groundHex, 4.5);
  const btnInk = ensureSafeInkContrast('#FFFFFF', safeAccent, 4.6);
  const isDarkGround = /^#(?:18181b|0f172a|09090b|111827|121215)/i.test(groundHex);
  const cardSurface = '#FAF6EE';
  const cardInk = '#1E3530';
  const cardAccent = ensureSafeAccentContrast(accentHex, cardSurface, 4.5);

  const resolveClinicNode = (path: string) => {
    const hidden = Array.isArray(nodeStyles?.hiddenNodes) && nodeStyles!.hiddenNodes.includes(path);
    const ovr = nodeStyles?.nodes?.[path];
    const style: React.CSSProperties = {};
    if (typeof ovr?.fontSizePx === 'number') style.fontSize = `${ovr.fontSizePx}px`;
    if (ovr?.textAlign) style.textAlign = ovr.textAlign;
    if (ovr?.textColor) style.color = ovr.textColor;
    if (ovr?.bgColor) style.backgroundColor = ovr.bgColor;
    return { hidden, style };
  };

  const titleNode = resolveClinicNode('hero.title');
  const subNode = resolveClinicNode('hero.subtitle');
  const ctaNode = resolveClinicNode('hero.cta');
  const imgNode = resolveClinicNode('hero.image');
  const stripTags = (s: string) => s.replace(/<\/?accent>/gi, '');

  return (
    <section
      data-testid={testId}
      data-atomic-role="clinic_editorial_hero"
      className="w-full"
      style={{ backgroundColor: groundHex, color: ink, ...sectionStyle }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-12 lg:py-16">
        <div className="space-y-6 lg:col-span-6">
          {eyebrow ? (
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: MONO_FONT, color: safeAccent }}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: safeAccent }} />
              <span>{stripTags(eyebrow)}</span>
            </div>
          ) : null}

          {!titleNode.hidden ? (
            <h1
              data-node-path="hero.title"
              data-node-label="Título principal"
              data-edit-props="text,fontSize,textAlign,textColor,visibility"
              className="font-semibold tracking-[-0.015em]"
              style={{
                fontFamily: SERIF_FONT,
                fontSize: 'clamp(2.45rem, 4.4vw, 3.75rem)',
                lineHeight: 1.12,
                color: ink,
                ...titleNode.style,
              }}
            >
              {stripTags(headlineLead)}{' '}
              {headlineAccent ? (
                <span className="relative inline-block" style={{ color: safeAccent }}>
                  <span>{stripTags(headlineAccent)}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 220 14"
                    className="pointer-events-none absolute -bottom-2 left-0 w-full"
                    fill="none"
                  >
                    <path d="M4 10 C 65 2, 145 2, 216 9" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                  </svg>
                </span>
              ) : null}
            </h1>
          ) : null}

          {subheadline && !subNode.hidden ? (
            <p
              data-node-path="hero.subtitle"
              data-node-label="Subtítulo"
              data-edit-props="text,fontSize,textAlign,textColor,visibility"
              className="max-w-lg text-base leading-relaxed opacity-85"
              style={subNode.style}
            >
              {stripTags(subheadline)}
            </p>
          ) : null}

          <div className="space-y-3 pt-1">
            {!ctaNode.hidden ? (
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#catalogo"
                  data-node-path="hero.cta"
                  data-node-label="Botão CTA"
                  data-edit-props="text,bgColor,textColor,visibility"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-full px-7 text-sm font-bold shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: safeAccent, color: btnInk, ...ctaNode.style }}
                >
                  <span>{ctaLabel}{featuredProduct ? ` · ${formatCurrencyBRL(featuredProduct.priceCents)}` : ''}</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
            ) : null}
            <div>
              <a
                href="#mapa-clinico"
                className="inline-block border-b pb-0.5 text-sm font-semibold hover:opacity-80"
                style={{ borderColor: safeAccent, color: ink }}
              >
                {secondaryLinkLabel}
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2.5 pt-2 text-xs leading-relaxed opacity-75">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: safeAccent }} aria-hidden="true" />
            <span>{reassuranceNote}</span>
          </div>
        </div>

        {/* Foto editorial com arco decorativo + Card Flutuante Translúcido */}
        <div className="relative lg:col-span-6">
          <svg
            aria-hidden="true"
            viewBox="0 0 90 70"
            className="pointer-events-none absolute -right-4 -top-5 z-10 w-24 opacity-80"
            fill="none"
            style={{ color: safeAccent }}
          >
            <path d="M6 10 Q 56 4 76 58" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="76" cy="58" r="3" fill="currentColor" />
          </svg>

          {!imgNode.hidden ? (
            <div
              data-node-path="hero.image"
              data-node-label="Imagem da capa"
              data-edit-props="image,visibility"
              className="relative aspect-[5/4] w-full overflow-hidden rounded-[28px] bg-[#E8DFCE] shadow-2xl"
            >
              {heroImageUrl && !imgErr ? (
                <img src={heroImageUrl} alt={storeName} onError={() => setImgErr(true)} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center p-8 text-center">
                  <span className="text-2xl font-semibold opacity-40" style={{ fontFamily: SERIF_FONT, color: cardInk }}>
                    {storeName}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {featuredProduct ? (
            <div
              className="mt-4 rounded-2xl border border-stone-900/15 p-5 shadow-xl sm:absolute sm:-bottom-5 sm:-left-6 sm:mt-0 sm:max-w-xs"
              style={{ backgroundColor: cardSurface, color: cardInk }}
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT, color: cardAccent }}>
                {featuredProduct.category.toUpperCase()}
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <strong className="text-3xl font-semibold tabular-nums" style={{ fontFamily: SERIF_FONT, color: cardInk }}>
                  {formatCurrencyBRL(featuredProduct.priceCents)}
                </strong>
                <span className="text-xs opacity-75" style={{ color: cardInk }}>{featuredProduct.variation || '/ sessão'}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed opacity-85" style={{ color: cardInk }}>{featuredProduct.name}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Strip horizontal 4 Passos (Motion Physio 01..04) */}
      <div
        className="border-t"
        style={{
          borderColor: isDarkGround ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
          backgroundColor: isDarkGround ? 'rgba(255,255,255,0.06)' : 'rgba(239,231,216,0.75)',
        }}
      >
        <div
          className="mx-auto grid max-w-7xl grid-cols-2 divide-x px-4 sm:grid-cols-4 sm:px-8"
          style={{ borderColor: isDarkGround ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)' }}
        >
          {[
            { n: '01', t: 'Avaliar', d: '60 minutos para localizar a causa real' },
            { n: '02', t: 'Planejar', d: 'Marcos mensuráveis e prazo realista' },
            { n: '03', t: 'Tratar', d: 'Acompanhamento individual do início ao fim' },
            { n: '04', t: 'Consolidar', d: 'Evolução medida a cada retorno' },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-3 px-4 py-5">
              <span className="text-xl font-semibold leading-none opacity-45" style={{ fontFamily: SERIF_FONT, color: safeAccent }}>
                {s.n}
              </span>
              <div>
                <strong className="block text-sm font-bold" style={{ color: ink }}>{s.t}</strong>
                <span className="mt-0.5 block text-xs leading-snug opacity-75">{s.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 7. InteractiveSymptomOrNeedMap (Motion Physio Fidelity — Silhueta Anatomica SVG Refinada + Painel Completo 3 Fases)
 */
export function InteractiveSymptomOrNeedMap({
  chapterNumber = '01',
  heading = 'Onde dói? Toque para ver como tratamos.',
  products,
  darkBg = '#1E3530',
  accentHex = '#C65D3B',
  testId,
  atomicRole = 'clinic_symptom_map',
  onAddToCart,
  onDirectWhatsappSend,
}: {
  chapterNumber?: string;
  heading?: string;
  products: CatalogProduct[];
  darkBg?: string;
  accentHex?: string;
  testId?: string;
  atomicRole?: string;
  onAddToCart: (p: CatalogProduct) => void;
  onDirectWhatsappSend?: (msg: string) => void;
}) {
  const categories = Array.from(
    new Set(products.map((p) => String(p.category || '').trim()).filter(Boolean)),
  ).slice(0, 6);
  const tabs = categories.length > 0 ? categories : products.slice(0, 4).map((p) => p.name);
  const [activeTab, setActiveTab] = useState(tabs[0] || '');
  const activeProd =
    products.find((p) => p.category?.trim() === activeTab || p.name === activeTab) || products[0];

  const ink = ensureSafeInkContrast('#F6F0E6', darkBg, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, darkBg, 4.5);
  const cardAccent = ensureSafeAccentContrast(accentHex, '#FFFFFF', 4.5);
  const cardBtnInk = ensureSafeInkContrast('#FFFFFF', cardAccent, 4.6);

  // Hotspots anatomicos elegantes ao longo de silhueta organica
  const hotspots = [
    { x: 110, y: 54 }, // cervical / topo
    { x: 76, y: 78 },  // ombro
    { x: 146, y: 114 }, // cotovelo / punho
    { x: 110, y: 132 }, // lombar
    { x: 93, y: 204 },  // joelho
    { x: 125, y: 248 }, // tornozelo
  ];

  const benefitBullets = activeProd?.description
    ? activeProd.description
        .split(/[.;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 4)
        .slice(0, 3)
    : ['Avaliação individual detalhada', 'Métricas claras de evolução', 'Orientações práticas para rotina'];

  return (
    <section
      id="mapa-clinico"
      data-testid={testId}
      data-atomic-role={atomicRole}
      className="relative w-full overflow-hidden py-20"
      style={{ backgroundColor: darkBg, color: ink }}
    >
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-5">
            <span className="text-5xl font-bold opacity-20 sm:text-6xl" style={{ fontFamily: SERIF_FONT }}>
              {chapterNumber}
            </span>
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em] opacity-70" style={{ fontFamily: MONO_FONT }}>
                MAPA INTERATIVO · PROTOCOLO DIRECIONADO
              </span>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: ink }}>
                {renderHighlightedCopy(heading, accentHex)}
              </h2>
            </div>
          </div>
          <p className="max-w-xs text-xs leading-relaxed opacity-75">
            Toque em uma região ou especialidade para visualizar as indicações e o plano completo.
          </p>
        </div>

        {/* Pills horizontais */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="rounded-full border px-4 py-2 text-xs font-bold transition-all"
                style={{
                  backgroundColor: active ? safeAccent : 'transparent',
                  color: active ? cardBtnInk : ink,
                  borderColor: active ? safeAccent : 'rgba(246,240,230,0.22)',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Silhueta anatomica estilizada continua + linhas guias sutis */}
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/15 p-6 lg:col-span-4">
            <svg viewBox="0 0 220 280" className="h-72 w-auto" aria-hidden="true">
              {/* Reticulo medico sutil */}
              <line x1="110" y1="16" x2="110" y2="265" stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 4" />
              <line x1="42" y1="78" x2="178" y2="78" stroke="currentColor" strokeOpacity="0.10" strokeDasharray="3 4" />
              <line x1="56" y1="145" x2="164" y2="145" stroke="currentColor" strokeOpacity="0.10" strokeDasharray="3 4" />

              {/* Silhueta organica continua limpa */}
              <path
                d="M110 20 C99 20, 92 28, 92 38 C92 47, 98 53, 102 56 L102 62 C86 65, 70 72, 65 88 L56 138 C55 144, 62 146, 65 140 L76 96 L82 142 L78 248 C78 255, 91 256, 92 248 L104 162 L116 162 L128 248 C129 256, 142 255, 142 248 L138 142 L144 96 L155 140 C158 146, 165 144, 164 138 L155 88 C150 72, 134 65, 118 62 L118 56 C122 53, 128 47, 128 38 C128 28, 121 20, 110 20 Z"
                fill="rgba(246,240,230,0.12)"
                stroke="rgba(246,240,230,0.42)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />

              {tabs.slice(0, hotspots.length).map((t, i) => {
                const pt = hotspots[i];
                const isSel = activeTab === t;
                return (
                  <g key={t} className="cursor-pointer" onClick={() => setActiveTab(t)}>
                    {isSel ? (
                      <>
                        <circle cx={pt.x} cy={pt.y} r="15" fill={safeAccent} fillOpacity="0.28" />
                        <circle cx={pt.x} cy={pt.y} r="10" stroke={safeAccent} strokeWidth="1.2" fill="none" />
                      </>
                    ) : null}
                    <circle cx={pt.x} cy={pt.y} r={isSel ? '5.5' : '4'} fill={isSel ? safeAccent : '#F6F0E6'} />
                  </g>
                );
              })}
            </svg>
            <span className="mt-2 text-xs font-semibold opacity-85" style={{ fontFamily: MONO_FONT }}>
              Região / Foco ativo: <strong style={{ color: safeAccent }}>{activeTab}</strong>
            </span>
          </div>

          {/* Card Completo Direita */}
          <div className="space-y-6 rounded-3xl bg-[#FBF8F2] p-6 text-slate-900 shadow-2xl sm:p-8 lg:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <h3 className="text-2xl font-semibold text-slate-950 sm:text-3xl" style={{ fontFamily: SERIF_FONT }}>
                  {activeProd?.name || activeTab}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {activeProd?.description || activeProd?.variation || ''}
                </p>
              </div>
              {activeProd ? (
                <div className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-800" style={{ fontFamily: MONO_FONT }}>
                  {activeProd.variation || 'Atendimento completo'} · {formatCurrencyBRL(activeProd.priceCents)}
                </div>
              ) : null}
            </div>

            {/* Condicoes / Indicacoes & Como Atuamos */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                  PRINCIPAIS INDICAÇÕES
                </span>
                <div className="flex flex-wrap gap-2">
                  {[activeTab, activeProd?.variation || 'Avaliação completa', 'Prevenção e retorno'].map((tag) => (
                    <span key={tag} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                  COMO ATENDEMOS
                </span>
                <ul className="space-y-1.5">
                  {benefitBullets.map((b, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Plano em 3 Fases */}
            <div>
              <span className="mb-2.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                ROTEIRO DE EVOLUÇÃO EM 3 FASES
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { n: '1', label: 'Inicial', span: 'Sessões 1–3', text: 'Alívio da queixa aguda e mapeamento funcional completo.' },
                  { n: '2', label: 'Fortalecer', span: 'Sessões 4–8', text: 'Ganho progressivo de estabilidade, carga e confiança.' },
                  { n: '3', label: 'Retorno', span: 'Semana 8+', text: 'Autonomia plena na rotina e metas esportivas alcançadas.' },
                ].map((ph) => (
                  <div key={ph.n} className="rounded-2xl border border-stone-200 bg-[#F4EFE4] p-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: cardAccent }}
                      >
                        {ph.n}
                      </span>
                      <strong className="text-xs font-extrabold text-slate-900">{ph.label}</strong>
                      <span className="text-[10px] text-slate-500">{ph.span}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{ph.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
              {activeProd ? (
                <button
                  type="button"
                  onClick={() => onAddToCart(activeProd)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-6 text-xs font-bold shadow-md transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: cardAccent, color: cardBtnInk }}
                >
                  <span>Agendar {activeProd.name.split(/\s+/).slice(0, 2).join(' ')}</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onDirectWhatsappSend?.(`Olá! Gostaria de agendar atendimento para ${activeTab} (${activeProd?.name || ''}).`)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-stone-300 bg-white px-5 text-xs font-bold text-slate-800 hover:bg-stone-50"
              >
                <MessageCircle className="size-3.5" style={{ color: cardAccent }} aria-hidden="true" />
                <span>Tirar dúvida no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 8. ClinicSpecialistsDeck (Motion Physio "02 Três fisioterapeutas. Um deles com você...")
 */
export function ClinicSpecialistsDeck({
  chapterNumber = '02',
  heading = 'Especialistas dedicados. Um profissional acompanha você do início à alta.',
  subcopy = 'Mantemos equipe enxuta de propósito: quem avalia você na primeira sessão conduz toda a evolução até o resultado final.',
  specialists = [],
  groundHex = '#F6F0E6',
  pineHex = '#1E3530',
  accentHex = '#C65D3B',
  testId,
  onDirectWhatsappSend,
}: {
  chapterNumber?: string;
  heading?: string;
  subcopy?: string;
  specialists?: Array<{
    name: string;
    role: string;
    years: string;
    quote: string;
    imageUrl?: string;
    tags: string[];
  }>;
  groundHex?: string;
  pineHex?: string;
  accentHex?: string;
  testId?: string;
  onDirectWhatsappSend?: (msg: string) => void;
}) {
  const groundInk = ensureSafeInkContrast(pineHex, groundHex, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, groundHex, 4.5);

  if (specialists.length === 0) return null;

  return (
    <section
      data-testid={testId}
      data-atomic-role="clinic_specialists_deck"
      className="w-full py-16"
      style={{ backgroundColor: groundHex, color: groundInk }}
    >
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-baseline gap-5">
            <span className="text-5xl font-bold opacity-20 sm:text-6xl" style={{ fontFamily: SERIF_FONT }}>
              {chapterNumber}
            </span>
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT, color: safeAccent }}>
                CORPO CLÍNICO
              </span>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: groundInk }}>
                {renderHighlightedCopy(heading, safeAccent)}
              </h2>
            </div>
          </div>
          <p className="max-w-sm text-xs leading-relaxed opacity-80">{subcopy}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {specialists.slice(0, 3).map((sp) => (
            <article key={sp.name} className="flex flex-col justify-between overflow-hidden rounded-3xl border border-stone-900/10 bg-[#FBF8F2] shadow-sm">
              <div>
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#D8D0C0]">
                  {sp.imageUrl ? (
                    <img src={sp.imageUrl} alt={sp.name} className="size-full object-cover" />
                  ) : null}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-slate-900 shadow-sm">
                    {sp.years}
                  </span>
                  <p className="absolute bottom-4 left-4 right-4 text-sm italic leading-snug text-white">
                    “{sp.quote}”
                  </p>
                </div>

                <div className="space-y-3 p-6">
                  <div>
                    <h3 className="text-2xl font-semibold text-slate-950" style={{ fontFamily: SERIF_FONT }}>
                      {sp.name}
                    </h3>
                    <span className="text-xs font-semibold" style={{ color: safeAccent }}>
                      {sp.role}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sp.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-stone-200 px-6 py-3.5 text-xs">
                <span className="text-slate-500">Presencial & Teleorientação</span>
                <button
                  type="button"
                  onClick={() => onDirectWhatsappSend?.(`Olá! Gostaria de agendar com ${sp.name}.`)}
                  className="font-bold hover:underline"
                  style={{ color: safeAccent }}
                >
                  Agende comigo →
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 9. NumberedEditorialPricingTiers (Motion Physio "03 Preços claros" + Quadro 2x2 de Garantias/Reembolso)
 */
export function NumberedEditorialPricingTiers({
  chapterNumber = '03',
  heading = 'Preços claros. Sem surpresas na conta.',
  products,
  groundHex = '#F6F0E6',
  anchorDarkBg = '#1E3530',
  accentHex = '#C65D3B',
  testId,
  atomicRole = 'clinic_pricing_tiers',
  onAddToCart,
}: {
  chapterNumber?: string;
  heading?: string;
  products: CatalogProduct[];
  groundHex?: string;
  anchorDarkBg?: string;
  accentHex?: string;
  testId?: string;
  atomicRole?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const tiers = products.slice(0, 3);
  const groundInk = ensureSafeInkContrast('#1E3530', groundHex, 4.6);
  const darkInk = ensureSafeInkContrast('#FFFFFF', anchorDarkBg, 4.6);
  const darkMuted = ensureSafeInkContrast('#CBD5E1', anchorDarkBg, 4.5);
  const featuredAccent = ensureSafeAccentContrast(accentHex, anchorDarkBg, 4.5);
  const featuredBtnInk = ensureSafeInkContrast('#FFFFFF', featuredAccent, 4.6);
  const lightAccent = ensureSafeAccentContrast(accentHex, '#FFFFFF', 4.5);

  if (tiers.length === 0) return null;

  const firstTier = tiers[0];
  const secondaryTiers = tiers.slice(1);

  return (
    <section
      data-testid={testId}
      data-atomic-role={atomicRole}
      className="w-full py-16"
      style={{ backgroundColor: groundHex, color: groundInk }}
    >
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-8">
        <div className="flex items-baseline gap-5">
          <span className="text-5xl font-bold opacity-20 sm:text-6xl" style={{ fontFamily: SERIF_FONT }}>
            {chapterNumber}
          </span>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT, color: accentHex }}>
              PREÇOS E CONDIÇÕES
            </span>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: groundInk }}>
              {heading}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Card Esquerdo Destaque Escuro ("Comece por aqui") */}
          <article
            className="flex flex-col justify-between rounded-3xl border border-white/10 p-7 shadow-2xl lg:col-span-4"
            style={{ backgroundColor: anchorDarkBg, color: darkInk }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold"
                  style={{ backgroundColor: featuredAccent, color: featuredBtnInk }}
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  <span>Comece por aqui</span>
                </span>
                <span className="text-xs opacity-70" style={{ fontFamily: MONO_FONT }}>
                  {firstTier.variation || '60 min'}
                </span>
              </div>

              <h3 className="text-2xl font-semibold" style={{ fontFamily: SERIF_FONT }}>{firstTier.name}</h3>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tabular-nums" style={{ fontFamily: SERIF_FONT }}>
                  {formatCurrencyBRL(firstTier.priceCents)}
                </span>
                <span className="text-xs opacity-70">/ sessão</span>
              </div>

              <p className="border-t border-white/15 pt-4 text-sm leading-relaxed" style={{ color: darkMuted }}>
                {firstTier.description}
              </p>

              <ul className="space-y-2 text-xs" style={{ color: darkMuted }}>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Histórico completo e avaliação objetiva</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Plano por escrito com estimativa de prazo</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Suporte e acompanhamento pelo WhatsApp</span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => onAddToCart(firstTier)}
              className="mt-7 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: featuredAccent, color: featuredBtnInk }}
            >
              <span>Agendar {firstTier.name.split(/\s+/).slice(0, 2).join(' ')}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </article>

          {/* Direita: Planos Secundarios + Quadro 2x2 Garantias */}
          <div className="flex flex-col justify-between gap-6 lg:col-span-8">
            <div className={`grid grid-cols-1 gap-6 ${secondaryTiers.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {secondaryTiers.map((tier) => (
                <article
                  key={tier.id}
                  className="flex flex-col justify-between rounded-3xl border border-stone-900/10 bg-[#FBF8F2] p-6 text-slate-900 shadow-sm"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xl font-semibold text-slate-950" style={{ fontFamily: SERIF_FONT }}>{tier.name}</h3>
                      <span className="text-xs text-slate-500" style={{ fontFamily: MONO_FONT }}>{tier.variation}</span>
                    </div>
                    <span className="block text-3xl font-semibold tabular-nums text-slate-950" style={{ fontFamily: SERIF_FONT }}>
                      {formatCurrencyBRL(tier.priceCents)}
                    </span>
                    <p className="border-t border-stone-200 pt-3 text-xs leading-relaxed text-slate-600">{tier.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddToCart(tier)}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold hover:underline"
                    style={{ color: lightAccent }}
                  >
                    <span>Agendar {tier.name.split(/\s+/).slice(0, 3).join(' ')} →</span>
                  </button>
                </article>
              ))}
            </div>

            {/* Bloco Garantias & Reembolso 2x2 fiel ao Motion Physio */}
            <div className="rounded-3xl border border-stone-900/10 bg-[#FBF8F2] p-6 text-slate-900 shadow-sm">
              <strong className="mb-4 block text-sm font-bold text-slate-950">Garantias, convênios e pagamento transparente</strong>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { icon: ShieldCheck, title: 'Reembolso de plano de saúde', text: 'Emitimos nota fiscal e relatório técnico completo no mesmo dia para reembolso.' },
                  { icon: Receipt, title: 'Sem taxas ocultas', text: 'Valor fechado por sessão ou programa, incluindo acompanhamento via WhatsApp.' },
                  { icon: CalendarCheck2, title: 'Remarcação flexível', text: 'Alteração sem custo com até 24h de antecedência pelo próprio atendimento.' },
                  { icon: FileCheck2, title: 'Pix ou cartão facilitado', text: 'Desconto direto no Pix à vista ou parcelamento claro antes de confirmar.' },
                ].map((g) => (
                  <div key={g.title} className="flex items-start gap-3">
                    <g.icon className="mt-0.5 size-4 shrink-0" style={{ color: lightAccent }} aria-hidden="true" />
                    <div>
                      <strong className="block text-xs font-bold text-slate-900">{g.title}</strong>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{g.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 10. RecoveryCaseScoreboard (Motion Physio "04 Não é só melhorar um pouco. Os números melhoram.")
 */
export function RecoveryCaseScoreboard({
  chapterNumber = '04',
  heading = 'Não é só melhorar um pouco. Os números melhoram.',
  groundHex = '#F6F0E6',
  accentHex = '#C65D3B',
  products,
  customCases = [],
  testId,
  atomicRole = 'clinic_case_scoreboard',
  onAddToCart,
}: {
  chapterNumber?: string;
  heading?: string;
  groundHex?: string;
  accentHex?: string;
  products: CatalogProduct[];
  customCases?: Array<{
    badge: string;
    title: string;
    before: string;
    after: string;
    problem: string;
    solution: string;
    outcome: string;
  }>;
  testId?: string;
  atomicRole?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const groundInk = ensureSafeInkContrast('#1E3530', groundHex, 4.6);
  const cardAccent = ensureSafeAccentContrast(accentHex, '#FBF8F2', 4.5);

  const cases =
    customCases.length > 0
      ? customCases
      : products.slice(0, 2).map((p, idx) => ({
          badge: `${String(p.category || 'CASO REAL').toUpperCase()} · RESULTADO`,
          title: `Evolução completa com ${p.name}`,
          before: idx === 0 ? '62%' : '7/10',
          after: idx === 0 ? '95%' : '1/10',
          problem: `Queixa inicial recorrente relacionada a ${p.category || 'mobilidade'} limitando atividades diárias.`,
          solution: p.description || `Protocolo completo de ${p.name} com marcos semanais definidos desde o dia 1.`,
          outcome: 'Retorno seguro à rotina e autonomia mantida nas revisões seguintes.',
        }));

  return (
    <section
      data-testid={testId}
      data-atomic-role={atomicRole}
      className="w-full py-16"
      style={{ backgroundColor: groundHex, color: groundInk }}
    >
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-8">
        <div className="flex items-baseline gap-5">
          <span className="text-5xl font-bold opacity-20 sm:text-6xl" style={{ fontFamily: SERIF_FONT }}>
            {chapterNumber}
          </span>
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT, color: accentHex }}>
              HISTÓRIAS DE EVOLUÇÃO
            </span>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: groundInk }}>
              {heading}
            </h2>
          </div>
        </div>

        <div className="space-y-4">
          {cases.map((c, idx) => (
            <article
              key={idx}
              className="grid grid-cols-1 gap-6 rounded-3xl border border-stone-900/10 bg-[#FBF8F2] p-6 text-slate-900 shadow-sm lg:grid-cols-12"
            >
              <div className="flex flex-col justify-between border-b border-stone-200 pb-4 lg:col-span-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT, color: cardAccent }}>
                  {c.badge}
                </span>
                <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-950" style={{ fontFamily: SERIF_FONT }}>
                  {c.title}
                </h3>
                <div className="mt-4 rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xl font-bold text-slate-400 line-through" style={{ fontFamily: SERIF_FONT }}>
                      {c.before}
                    </span>
                    <ArrowRight className="size-4 text-slate-400" aria-hidden="true" />
                    <span className="text-4xl font-semibold leading-none" style={{ fontFamily: SERIF_FONT, color: cardAccent }}>
                      {c.after}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 lg:col-span-3">
                <strong className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                  01 · O PROBLEMA
                </strong>
                <p className="text-xs leading-relaxed text-slate-700">{c.problem}</p>
              </div>
              <div className="space-y-1.5 lg:col-span-3">
                <strong className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                  02 · A CONDUTA
                </strong>
                <p className="text-xs leading-relaxed text-slate-700">{c.solution}</p>
              </div>
              <div className="flex flex-col justify-between space-y-2 lg:col-span-2">
                <div>
                  <strong className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500" style={{ fontFamily: MONO_FONT }}>
                    03 · RESULTADO
                  </strong>
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-900">{c.outcome}</p>
                </div>
                {products[0] ? (
                  <button
                    type="button"
                    onClick={() => onAddToCart(products[0])}
                    className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
                    style={{ color: cardAccent }}
                  >
                    <span>Agendar avaliação →</span>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export interface DirectionHotspot {
  id: string;
  xPct: number;
  yPct: number;
  pinLabel: string;
  headline: string;
  description: string;
  linkedSkuId?: string;
}

/**
 * 11. InteractiveImageTextStage (DOC 04: Co-Direcao Imagem + Texto c/ Hotspots e Zoom Focal)
 */
export function InteractiveImageTextStage({
  testId,
  heading = 'Explore cada detalhe do conjunto',
  eyebrow = '',
  imageUrl,
  hotspots = [],
  textAnchor = 'right',
  products = [],
  bgHex = '#FAF5EC',
  darkHex = '#2B1B17',
  accentHex = '#C8843C',
  onAddToCart,
}: {
  testId?: string;
  heading?: string;
  eyebrow?: string;
  imageUrl?: string;
  hotspots?: DirectionHotspot[];
  textAnchor?: 'left' | 'right' | 'center' | 'bottom_left';
  products?: CatalogProduct[];
  bgHex?: string;
  darkHex?: string;
  accentHex?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const effectiveSpots: DirectionHotspot[] =
    hotspots.length > 0
      ? hotspots
      : products.slice(0, 3).map((p, idx) => ({
          id: `spot_${p.id || idx}`,
          xPct: [28, 62, 48][idx] ?? 50,
          yPct: [38, 42, 72][idx] ?? 50,
          pinLabel: `0${idx + 1}`,
          headline: p.name,
          description: p.description || `${p.category} · ${p.variation || 'Seleção especial'}`,
          linkedSkuId: p.id,
        }));

  const [activeId, setActiveId] = useState(effectiveSpots[0]?.id || '');
  const [imgErr, setImgErr] = useState(false);
  const activeSpot = effectiveSpots.find((s) => s.id === activeId) || effectiveSpots[0];
  const linkedProd =
    products.find((p) => p.id === activeSpot?.linkedSkuId || p.sku === activeSpot?.linkedSkuId) || products[0];

  const ink = ensureSafeInkContrast(darkHex, bgHex, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, bgHex, 4.5);
  const btnInk = ensureSafeInkContrast('#FFFFFF', safeAccent, 4.6);
  const reverseCols = textAnchor === 'left';

  if (effectiveSpots.length === 0) return null;

  return (
    <section
      data-testid={testId}
      data-atomic-role="interactive_image_text_stage"
      className="w-full py-16"
      style={{ backgroundColor: bgHex, color: ink }}
    >
      <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow ? (
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: MONO_FONT, color: safeAccent }}>
                {eyebrow}
              </span>
            ) : null}
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: ink }}>
              {renderHighlightedCopy(heading, safeAccent)}
            </h2>
          </div>
          <span className="text-xs opacity-70" style={{ fontFamily: MONO_FONT }}>
            Clique nos pontos numerados da cena
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Quadro de Imagem com Zoom Focal Dinamico & Pinos */}
          <div
            className={`relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-stone-900/12 bg-stone-900/5 shadow-xl lg:col-span-7 ${
              reverseCols ? 'lg:order-2' : 'lg:order-1'
            }`}
          >
            {imageUrl && !imgErr ? (
              <img
                src={imageUrl}
                alt={activeSpot?.headline || heading}
                onError={() => setImgErr(true)}
                className="size-full object-cover transition-transform duration-700 ease-out"
                style={{
                  transform: activeSpot ? 'scale(1.12)' : 'scale(1)',
                  transformOrigin: activeSpot ? `${activeSpot.xPct}% ${activeSpot.yPct}%` : 'center center',
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-[#EFE7D8] p-8 text-center">
                <span className="text-xl font-semibold opacity-50" style={{ fontFamily: SERIF_FONT }}>
                  {String(activeSpot?.headline || heading).replace(/<\/?accent>/gi, '')}
                </span>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

            {effectiveSpots.map((sp) => {
              const isActive = sp.id === activeSpot?.id;
              return (
                <button
                  key={sp.id}
                  type="button"
                  data-testid={`hotspot-pin-${sp.pinLabel}`}
                  onClick={() => setActiveId(sp.id)}
                  aria-label={`Explorar ${sp.headline}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border-2 px-2.5 text-xs font-black shadow-xl transition-all ${
                    isActive ? 'scale-115 ring-4 ring-white/40' : 'opacity-90 hover:scale-105'
                  }`}
                  style={{
                    left: `${sp.xPct}%`,
                    top: `${sp.yPct}%`,
                    backgroundColor: isActive ? safeAccent : '#111827',
                    borderColor: '#FFFFFF',
                    color: isActive ? btnInk : '#FFFFFF',
                    fontFamily: MONO_FONT,
                  }}
                >
                  {sp.pinLabel}
                </button>
              );
            })}
          </div>

          {/* Coluna Editorial Sincronizada */}
          <div className={`space-y-5 lg:col-span-5 ${reverseCols ? 'lg:order-1' : 'lg:order-2'}`}>
            <div className="flex flex-wrap gap-2">
              {effectiveSpots.map((sp) => {
                const isActive = sp.id === activeSpot?.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setActiveId(sp.id)}
                    className="rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all"
                    style={{
                      fontFamily: MONO_FONT,
                      backgroundColor: isActive ? safeAccent : 'transparent',
                      color: isActive ? btnInk : ink,
                      borderColor: isActive ? safeAccent : 'rgba(15,23,42,0.2)',
                    }}
                  >
                    {sp.pinLabel}
                  </button>
                );
              })}
            </div>

            {activeSpot ? (
              <m.div
                key={activeSpot.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="space-y-4 rounded-3xl border border-stone-900/10 bg-white/95 p-6 text-slate-900 shadow-lg"
              >
                <span className="block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: MONO_FONT, color: safeAccent }}>
                  PONTO SELECIONADO · {activeSpot.pinLabel}
                </span>
                <h3 className="text-2xl font-semibold leading-snug text-slate-950" style={{ fontFamily: SERIF_FONT }}>
                  {activeSpot.headline}
                </h3>
                <p className="text-sm leading-relaxed text-slate-600">{activeSpot.description}</p>
                {linkedProd ? (
                  <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                    <span className="text-2xl font-bold tabular-nums text-slate-950" style={{ fontFamily: SERIF_FONT }}>
                      {formatCurrencyBRL(linkedProd.priceCents)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddToCart(linkedProd)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-xs font-bold shadow-md transition-transform hover:-translate-y-0.5"
                      style={{ backgroundColor: safeAccent, color: btnInk }}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      <span>Adicionar à Sacola</span>
                    </button>
                  </div>
                ) : null}
              </m.div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 12. BundleBuilderCalculator (DOC 09 M2: Montador Progressivo de Combo em Centavos Exatos)
 */
export function BundleBuilderCalculator({
  testId,
  heading = 'Monte seu Combo com Desconto Progressivo',
  products,
  bgHex = '#F6F0E6',
  darkHex = '#1E3530',
  accentHex = '#C65D3B',
  onAddToCart,
}: {
  testId?: string;
  heading?: string;
  products: CatalogProduct[];
  bgHex?: string;
  darkHex?: string;
  accentHex?: string;
  onAddToCart: (p: CatalogProduct) => void;
}) {
  const pool = products.slice(0, 4);
  const [selectedIds, setSelectedIds] = useState<string[]>(pool.slice(0, 2).map((p) => p.id));

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const chosen = pool.filter((p) => selectedIds.includes(p.id));
  const rawCents = chosen.reduce((acc, p) => acc + Math.max(0, Number(p.priceCents || 0)), 0);
  const discountPct = chosen.length >= 4 ? 20 : chosen.length === 3 ? 15 : chosen.length === 2 ? 10 : 0;
  const finalCents = Math.round(rawCents * ((100 - discountPct) / 100));

  const ink = ensureSafeInkContrast(darkHex, bgHex, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, bgHex, 4.5);
  const btnInk = ensureSafeInkContrast('#FFFFFF', safeAccent, 4.6);

  if (pool.length < 2) return null;

  return (
    <section
      data-testid={testId}
      data-atomic-role="bundle_builder_calculator"
      className="w-full py-14"
      style={{ backgroundColor: bgHex, color: ink }}
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: SERIF_FONT, color: ink }}>
              {renderHighlightedCopy(heading, safeAccent)}
            </h2>
          </div>
          <div className="rounded-full border border-stone-900/15 bg-white px-4 py-1.5 text-xs font-bold text-slate-900" style={{ fontFamily: MONO_FONT }}>
            {chosen.length} selecionado(s) · <span style={{ color: safeAccent }}>{discountPct}% OFF liberado</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-8">
            {pool.map((p) => {
              const picked = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleItem(p.id)}
                  className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all"
                  style={{
                    backgroundColor: picked ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                    borderColor: picked ? safeAccent : 'rgba(15,23,42,0.12)',
                    boxShadow: picked ? '0 10px 26px -12px rgba(0,0,0,0.22)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="size-14 rounded-xl object-cover" />
                    ) : null}
                    <div>
                      <strong className="block text-sm font-bold text-slate-950">{p.name}</strong>
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{formatCurrencyBRL(p.priceCents)}</span>
                    </div>
                  </div>
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                    style={{
                      backgroundColor: picked ? safeAccent : 'transparent',
                      borderColor: picked ? safeAccent : '#CBD5E1',
                      color: picked ? btnInk : '#64748B',
                    }}
                  >
                    {picked ? <Check className="size-4" /> : <Plus className="size-4" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="flex flex-col justify-between rounded-3xl p-6 text-white shadow-2xl lg:col-span-4"
            style={{ backgroundColor: darkHex }}
          >
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-300" style={{ fontFamily: MONO_FONT }}>
                RESUMO DO COMBO
              </span>
              <div className="flex items-baseline gap-3">
                <strong className="text-4xl font-semibold tabular-nums" style={{ fontFamily: SERIF_FONT }}>
                  {formatCurrencyBRL(finalCents)}
                </strong>
                {discountPct > 0 ? (
                  <span className="text-sm text-stone-400 line-through tabular-nums">{formatCurrencyBRL(rawCents)}</span>
                ) : null}
              </div>
              <p className="text-xs text-stone-300">
                {chosen.length < 2
                  ? 'Selecione mais 1 item para destravar 10% OFF.'
                  : chosen.length < 4
                    ? `Adicione mais ${4 - chosen.length} para chegar a 20% OFF no Pix.`
                    : 'Desconto máximo de 20% OFF desbloqueado!'}
              </p>
            </div>

            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => chosen.forEach((item) => onAddToCart(item))}
              className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-6 text-xs font-bold shadow-lg disabled:opacity-40"
              style={{ backgroundColor: safeAccent, color: btnInk }}
            >
              <span>Adicionar Combo ({chosen.length} itens)</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 13. CalendarDeliverySlotsBand (DOC 09 M3: Agenda & Janelas de Encomenda)
 */
export function CalendarDeliverySlotsBand({
  testId,
  heading = 'Reserve seu horário ou data de entrega',
  bgHex = '#FFFFFF',
  darkHex = '#111827',
  accentHex = '#2563EB',
  onDirectWhatsappSend,
}: {
  testId?: string;
  heading?: string;
  bgHex?: string;
  darkHex?: string;
  accentHex?: string;
  onDirectWhatsappSend?: (msg: string) => void;
}) {
  const slots = [
    { id: 's1', day: 'Hoje · Tarde', window: '14:00 – 18:00', left: '2 vagas' },
    { id: 's2', day: 'Amanhã · Manhã', window: '09:00 – 12:00', left: '3 vagas' },
    { id: 's3', day: 'Amanhã · Tarde', window: '14:00 – 18:00', left: '4 vagas' },
    { id: 's4', day: 'Sábado · Especial', window: '09:00 – 13:00', left: 'Última vaga' },
  ];
  const [picked, setPicked] = useState(slots[0]);
  const ink = ensureSafeInkContrast(darkHex, bgHex, 4.6);
  const safeAccent = ensureSafeAccentContrast(accentHex, bgHex, 4.5);
  const btnInk = ensureSafeInkContrast('#FFFFFF', safeAccent, 4.6);

  return (
    <section
      data-testid={testId}
      data-atomic-role="calendar_delivery_slots"
      className="w-full py-12"
      style={{ backgroundColor: bgHex, color: ink }}
    >
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 rounded-3xl border border-stone-900/10 bg-[#F8FAFC] p-6 sm:p-8 lg:flex-row lg:items-center">
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: MONO_FONT, color: safeAccent }}>
            DISPONIBILIDADE AO VIVO
          </span>
          <h3 className="text-2xl font-bold text-slate-950">{renderHighlightedCopy(heading, accentHex)}</h3>
          <div className="flex flex-wrap gap-2 pt-2">
            {slots.map((s) => {
              const active = picked.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPicked(s)}
                  className="rounded-xl border px-3.5 py-2 text-left text-xs transition-all"
                  style={{
                    backgroundColor: active ? safeAccent : '#FFFFFF',
                    color: active ? btnInk : '#0F172A',
                    borderColor: active ? safeAccent : '#CBD5E1',
                  }}
                >
                  <strong className="block">{s.day}</strong>
                  <span className="opacity-80">{s.window} · {s.left}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDirectWhatsappSend?.(`Olá! Gostaria de reservar a janela: ${picked.day} (${picked.window}).`)}
          className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-xs font-bold shadow-md"
          style={{ backgroundColor: safeAccent, color: btnInk }}
        >
          <CalendarCheck2 className="size-4" />
          <span>Confirmar {picked.day} no WhatsApp</span>
        </button>
      </div>
    </section>
  );
}
