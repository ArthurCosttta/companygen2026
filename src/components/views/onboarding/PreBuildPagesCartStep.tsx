import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  LayoutGrid,
  Loader2,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PreBuildRecommendedPage {
  slug: string;
  title: string;
  description: string;
  campaignTheme?: string;
  creditsCost: number;
  selected?: boolean;
  isCustom?: boolean;
}

export interface PreBuildCartSummaryProps {
  businessName: string;
  detectedNiche: string;
  priceRange: string;
  totalActiveSkus: number;
  flagshipProduct?: string;
  businessGoal?: string;
  recommendedSections: Array<{ id: string; title: string; role: string }>;
  cartPages: PreBuildRecommendedPage[];
  includeAiArtPack: boolean;
  onToggleIncludeAiArtPack: (next: boolean) => void;
  onTogglePage: (slug: string) => void;
  onAddCustomPage: (title: string) => void;
  onRemoveCustomPage: (slug: string) => void;
  onBack: () => void;
  onConfirmBuild: () => void;
  submitting?: boolean;
  creditBalance?: number;
}

export function PreBuildPagesCartStep({
  businessName,
  detectedNiche,
  priceRange,
  totalActiveSkus,
  flagshipProduct,
  businessGoal,
  recommendedSections,
  cartPages,
  includeAiArtPack,
  onToggleIncludeAiArtPack,
  onTogglePage,
  onAddCustomPage,
  onRemoveCustomPage,
  onBack,
  onConfirmBuild,
  submitting = false,
  creditBalance,
}: PreBuildCartSummaryProps) {
  const [customTitle, setCustomTitle] = React.useState('');

  const selectedExtras = cartPages.filter((p) => p.selected);
  const extrasCost = selectedExtras.reduce((sum, p) => sum + Number(p.creditsCost || 0), 0);
  const baseCost = 10;
  const artPackCost = includeAiArtPack ? 5 : 0;
  const totalCost = baseCost + extrasCost + artPackCost;

  const handleAddCustom = () => {
    const clean = customTitle.trim();
    if (clean.length < 2) return;
    onAddCustomPage(clean.slice(0, 48));
    setCustomTitle('');
  };

  return (
    <section
      data-testid="pre-build-pages-cart-step"
      className="space-y-5 rounded-[18px] border border-[#E2E8F0] bg-white p-5 shadow-xs sm:p-6"
    >
      {/* Bloco 1: O que entendi da loja */}
      <div className="space-y-3 border-b border-[#F1F5F9] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
            <Sparkles className="size-3" aria-hidden="true" />
            <span>Diagnóstico da sua loja pronto</span>
          </span>
          {typeof creditBalance === 'number' ? (
            <span className="text-xs font-semibold text-[#64748B]">
              Saldo disponível: <strong className="text-[#09090B]">{creditBalance} cr</strong>
            </span>
          ) : null}
        </div>

        <p className="text-[13.5px] leading-relaxed text-[#334155]">
          Entendi que <strong className="text-[#09090B]">{businessName}</strong> atua em{' '}
          <strong className="text-[#09090B]">{detectedNiche || 'Comércio Local'}</strong> com{' '}
          <strong className="text-[#09090B]">{totalActiveSkus} item(ns)</strong> ({priceRange || 'valores no catálogo'})
          {flagshipProduct ? (
            <>
              {' '}
              e destaque em <strong className="text-[#09090B]">{flagshipProduct}</strong>
            </>
          ) : null}
          {businessGoal ? ` · foco em: ${businessGoal}` : ''}.
        </p>
      </div>

      {/* Bloco 2: Seções que serão criadas na Página Principal */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <LayoutGrid className="size-4 text-[#09090B]" aria-hidden="true" />
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[#09090B]">
            Seções planejadas para sua Página Principal (incluso)
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recommendedSections.map((sec) => (
            <div
              key={sec.id}
              className="flex items-start gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-bold text-[#09090B]">{sec.title}</p>
                <p className="truncate text-[11px] text-[#64748B]">{sec.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bloco 3: Carrinho de Telas Extras (Multi-IA Paralela) */}
      <div className="space-y-3 border-t border-[#F1F5F9] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-[#09090B]" aria-hidden="true" />
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-[#09090B]">
              Carrinho de Telas Extras da Loja
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-[#64748B]">
            Tela Principal inclusa · adicione mais telas se quiser
          </span>
        </div>

        <div className="space-y-2">
          {cartPages.map((pg) => {
            const active = Boolean(pg.selected);
            return (
              <div
                key={pg.slug}
                data-testid={`prebuild-cart-page-${pg.slug}`}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors',
                  active
                    ? 'border-[#09090B] bg-[#F8FAFC]'
                    : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]',
                )}
              >
                <button
                  type="button"
                  onClick={() => onTogglePage(pg.slug)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-white',
                      active ? 'border-[#09090B] bg-[#09090B]' : 'border-[#CBD5E1] bg-white',
                    )}
                  >
                    {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#09090B]">{pg.title}</p>
                    <p className="text-[11.5px] text-[#64748B]">{pg.description}</p>
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#09090B]">
                    +{pg.creditsCost} cr
                  </span>
                  {pg.isCustom ? (
                    <button
                      type="button"
                      onClick={() => onRemoveCustomPage(pg.slug)}
                      aria-label={`Remover tela ${pg.title}`}
                      className="rounded-lg p-1 text-[#94A3B8] hover:text-[#EF4444]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Adicionar tela personalizada no carrinho */}
        <div className="flex flex-wrap gap-2 pt-1">
          <input
            type="text"
            value={customTitle}
            maxLength={48}
            onChange={(e) => setCustomTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="Adicionar outra tela (ex: Dia das Mães, Trocas, Atacado)"
            className="h-10 min-w-[200px] flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs text-[#09090B] focus:border-[#2563EB] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={customTitle.trim().length < 2}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-bold text-[#09090B] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Adicionar Tela</span>
          </button>
        </div>

        {/* Opção explícita de Artes IA (+5 cr, desligada por padrão) */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-3.5 py-2.5">
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={includeAiArtPack}
              onChange={(e) => onToggleIncludeAiArtPack(e.target.checked)}
              className="mt-1 size-4 accent-[#09090B]"
            />
            <div>
              <p className="text-xs font-bold text-[#09090B]">
                Criar artes de ambiente por IA para categorias e capa (opcional)
              </p>
              <p className="text-[11px] text-[#64748B]">
                Desligado por padrão: nunca criamos imagens de produto sem você pedir.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#09090B]">
            {includeAiArtPack ? '+5 cr' : '0 cr'}
          </span>
        </label>
      </div>

      {/* Resumo Financeiro Transparente + Ação */}
      <div className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-[#475569]">
            <Layers className="size-3.5" aria-hidden="true" />
            1 Tela Principal ({baseCost} cr)
            {selectedExtras.length > 0 ? ` + ${selectedExtras.length} tela(s) extra(s) (+${extrasCost} cr)` : ''}
            {includeAiArtPack ? ' + Artes IA (+5 cr)' : ''}
          </span>
          <span className="text-sm font-extrabold text-[#09090B]" data-testid="prebuild-total-credits">
            Total: {totalCost} cr · 0 cr se falhar
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="inline-flex h-12 items-center gap-1.5 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#475569] hover:text-[#09090B] disabled:opacity-50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Voltar</span>
          </button>

          <button
            type="button"
            data-testid="prebuild-confirm-build-btn"
            disabled={submitting}
            onClick={onConfirmBuild}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white hover:bg-[#18181B] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Iniciando construção...</span>
              </>
            ) : (
              <>
                <span>Construir Minha Loja ({totalCost} cr)</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
