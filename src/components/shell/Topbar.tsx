import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Eye,
  HelpCircle,
  Keyboard,
  LifeBuoy,
  Moon,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import { ActionButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { SidebarTab } from './Sidebar';

const TAB_BREADCRUMB_MAP: Record<SidebarTab, { root: string; section: string }> = {
  store: { root: 'Minha Loja', section: 'Vitrine & Estúdio' },
  whatsapp: { root: 'WhatsApp', section: 'Atendimento Sofia' },
  dashboard: { root: 'Pedidos', section: 'Visão Geral' },
  settings: { root: 'Ajustes', section: 'Conta & Integrações' },
  admin: { root: 'Admin', section: 'Operação & Suporte' },
};

export interface TopbarProps {
  storeName: string;
  activeTab: SidebarTab;
  creditBalance: number;
  isCatalogEmpty: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenCheckout: () => void;
  onOpenPreview: () => void;
  onOpenCommandPalette: () => void;
  onOpenSupport: () => void;
  onOpenTour: () => void;
}

export function Topbar({
  storeName,
  activeTab,
  creditBalance,
  isCatalogEmpty,
  isDarkMode,
  onToggleDarkMode,
  onOpenCheckout,
  onOpenPreview,
  onOpenCommandPalette,
  onOpenSupport,
  onOpenTour,
}: TopbarProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpContainerRef = useRef<HTMLDivElement | null>(null);

  // Count-up suave de 350ms no saldo da Topbar (hidratação inicial instantânea)
  const [displayBalance, setDisplayBalance] = useState<number>(creditBalance);
  const [lastSpent, setLastSpent] = useState<{ debited: number; label: string } | null>(null);
  const prevBalanceRef = useRef<number>(creditBalance);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let clearTimer: number | undefined;
    const onCreditSpent = (event: Event) => {
      const detail = (event as CustomEvent<{ debited?: number; action?: string }>)?.detail;
      const debited = Number(detail?.debited || 0);
      if (!(debited > 0)) return;
      const rawAction = String(detail?.action || '');
      const label = /whatsapp|sofia/i.test(rawAction)
        ? 'WhatsApp'
        : /create-page|subpage/i.test(rawAction)
          ? 'Subpágina'
          : /generate-full|storefront/i.test(rawAction)
            ? 'Vitrine IA'
            : 'IA';
      setLastSpent({ debited, label });
      if (clearTimer) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setLastSpent(null), 8000);
    };
    window.addEventListener('companygen:credit-spent', onCreditSpent);
    return () => {
      window.removeEventListener('companygen:credit-spent', onCreditSpent);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, []);
  const hasHydratedBalanceRef = useRef<boolean>(creditBalance > 0);

  useEffect(() => {
    const startValue = prevBalanceRef.current;
    const targetValue = creditBalance;
    prevBalanceRef.current = targetValue;

    if (!hasHydratedBalanceRef.current) {
      if (targetValue !== 0) {
        hasHydratedBalanceRef.current = true;
      }
      setDisplayBalance(targetValue);
      return;
    }

    if (startValue === targetValue) {
      setDisplayBalance(targetValue);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setDisplayBalance(targetValue);
      return;
    }

    const duration = 350;
    const startAt = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round((startValue + (targetValue - startValue) * eased) * 100) / 100;
      setDisplayBalance(next);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [creditBalance]);

  useEffect(() => {
    if (!helpOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!helpContainerRef.current?.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [helpOpen]);

  const crumb = TAB_BREADCRUMB_MAP[activeTab] || TAB_BREADCRUMB_MAP.store;
  const cleanStoreName = storeName.trim() || 'Minha Loja';

  return (
    <header
      data-testid="app-topbar"
      className={cn(
        'cg-topbar relative z-20 flex h-16 shrink-0 items-center justify-between gap-2 sm:gap-3 border-b px-3 sm:px-6 transition-colors',
        isDarkMode
          ? 'border-slate-800 bg-[#111726]'
          : 'border-[var(--cg-border)] bg-[var(--cg-surface)]',
      )}
    >
      {/* Zona 1 (Esquerda): Breadcrumb contextual + Contexto */}
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <nav
          aria-label="Breadcrumb"
          data-testid="topbar-breadcrumb"
          className="flex min-w-0 items-center gap-1 text-xs sm:text-sm"
        >
          {cleanStoreName.toLowerCase() !== crumb.root.toLowerCase() ? (
            <>
              <span
                className={cn(
                  'hidden md:inline truncate max-w-[140px] font-medium',
                  isDarkMode ? 'text-slate-400' : 'text-[var(--cg-text-muted)]',
                )}
                title={cleanStoreName}
              >
                {cleanStoreName}
              </span>
              <ChevronRight
                className={cn(
                  'hidden md:inline size-3.5 shrink-0',
                  isDarkMode ? 'text-slate-600' : 'text-slate-400',
                )}
                aria-hidden="true"
              />
            </>
          ) : null}
          <span
            className={cn(
              'hidden min-[431px]:inline truncate font-semibold',
              isDarkMode ? 'text-slate-300' : 'text-[var(--cg-text-secondary)]',
            )}
          >
            {crumb.root}
          </span>
          <ChevronRight
            className={cn(
              'hidden min-[431px]:inline size-3.5 shrink-0',
              isDarkMode ? 'text-slate-600' : 'text-slate-400',
            )}
            aria-hidden="true"
          />
          <h1
            data-testid="topbar-active-title"
            className={cn(
              'truncate text-sm sm:text-base font-bold tracking-tight',
              isDarkMode ? 'text-white' : 'text-[#0B1D52]',
            )}
          >
            <span className="min-[431px]:hidden">{crumb.root}</span>
            <span className="hidden min-[431px]:inline">{crumb.section}</span>
          </h1>
        </nav>
      </div>

      {/* Zona 2 (Centro): Command Palette Trigger (Ctrl+K) */}
      <div className="flex flex-none sm:flex-1 items-center justify-center min-w-0 sm:max-w-xs">
        <button
          type="button"
          data-testid="topbar-command-palette-btn"
          onClick={onOpenCommandPalette}
          aria-label="Buscar ou executar comando (Ctrl+K)"
          className={cn(
            'inline-flex h-10 w-10 sm:w-full items-center justify-center sm:justify-between gap-2 rounded-xl border sm:px-3 text-xs transition-colors',
            isDarkMode
              ? 'border-slate-700/80 bg-[#182034] text-slate-300 hover:border-slate-600 hover:text-white'
              : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)] hover:bg-[var(--cg-hover)] hover:text-[#0B1D52]',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="size-4 sm:size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline truncate">Buscar ou comando...</span>
          </span>
          <kbd
            className={cn(
              'hidden md:inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold',
              isDarkMode
                ? 'border-slate-600 bg-slate-800 text-slate-200'
                : 'border-slate-300 bg-white text-slate-600',
            )}
          >
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Zona 3 (Direita): Saldo Tabular, Ver Vitrine, Tema e Menu Ajuda (?) */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          data-testid="topbar-open-checkout-btn"
          onClick={onOpenCheckout}
          className={cn(
            'cg-tabular flex min-h-[40px] shrink-0 whitespace-nowrap items-center gap-1 sm:gap-1.5 rounded-full border px-2 sm:px-3 py-1 text-xs font-bold transition shadow-xs',
            isDarkMode
              ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          )}
          title="Abrir Central de Planos e Créditos de IA (Plano de R$ 100,00)"
        >
          <Sparkles className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          <span className="sm:hidden">
            {displayBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr
          </span>
          <span className="hidden sm:inline">
            Planos IA · {displayBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr
          </span>
          {lastSpent ? (
            <span
              data-testid="topbar-last-credit-spent"
              className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300"
            >
              -{lastSpent.debited.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr ({lastSpent.label})
            </span>
          ) : null}
        </button>

        {!isCatalogEmpty ? (
          <ActionButton
            variant="softBlue"
            size={44}
            leftIcon={<Eye className="size-4" />}
            onClick={onOpenPreview}
            data-testid="topbar-preview-vitrine"
            className="shrink-0 whitespace-nowrap min-h-[40px]! sm:min-h-[44px]! px-2.5 sm:px-4 text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Ver Vitrine</span>
            <span className="sm:hidden">Vitrine</span>
          </ActionButton>
        ) : null}

        <button
          type="button"
          data-testid="topbar-theme-toggle-btn"
          onClick={onToggleDarkMode}
          aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={isDarkMode ? 'Modo claro' : 'Modo escuro'}
          className={cn(
            'inline-flex min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors',
            isDarkMode
              ? 'border-slate-700 bg-[#182034] text-amber-300 hover:bg-slate-800 hover:text-amber-200'
              : 'border-[var(--cg-border)] bg-[var(--cg-surface)] text-slate-600 hover:bg-[var(--cg-hover)] hover:text-[#0B1D52]',
          )}
        >
          {isDarkMode ? (
            <Sun className="size-[18px]" aria-hidden="true" />
          ) : (
            <Moon className="size-[18px]" aria-hidden="true" />
          )}
        </button>

        {/* Menu de Ajuda (?) */}
        <div ref={helpContainerRef} className="relative">
          <button
            type="button"
            data-testid="topbar-help-menu-btn"
            aria-label="Ajuda e Suporte"
            aria-expanded={helpOpen}
            aria-haspopup="menu"
            onClick={() => setHelpOpen((prev) => !prev)}
            className={cn(
              'inline-flex min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] shrink-0 items-center justify-center rounded-xl border transition-colors',
              isDarkMode
                ? 'border-slate-700 bg-[#182034] text-slate-200 hover:bg-slate-800 hover:text-white'
                : 'border-[var(--cg-border)] bg-[var(--cg-surface)] text-slate-600 hover:bg-[var(--cg-hover)] hover:text-[#0B1D52]',
            )}
          >
            <HelpCircle className="size-[18px]" aria-hidden="true" />
          </button>

          {helpOpen ? (
            <div
              role="menu"
              data-testid="topbar-help-popover"
              className={cn(
                'absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border p-1.5 shadow-2xl',
                isDarkMode
                  ? 'border-slate-700 bg-[#182034] text-slate-100'
                  : 'border-[var(--cg-border)] bg-white text-[#0B1D52]',
              )}
            >
              <button
                type="button"
                role="menuitem"
                data-testid="topbar-help-open-support"
                onClick={() => {
                  setHelpOpen(false);
                  onOpenSupport();
                }}
                className={cn(
                  'flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition-colors',
                  isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-[var(--cg-hover)]',
                )}
              >
                <LifeBuoy className="size-4 text-[#2563EB]" aria-hidden="true" />
                <span>Reportar Problema / Suporte</span>
              </button>

              <button
                type="button"
                role="menuitem"
                data-testid="topbar-help-open-shortcuts"
                onClick={() => {
                  setHelpOpen(false);
                  onOpenCommandPalette();
                }}
                className={cn(
                  'flex w-full min-h-[44px] items-center justify-between gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition-colors',
                  isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-[var(--cg-hover)]',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Keyboard className="size-4 text-slate-500" aria-hidden="true" />
                  <span>Atalhos de Teclado</span>
                </span>
                <kbd className="rounded border border-slate-500/30 px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+K
                </kbd>
              </button>

              <button
                type="button"
                role="menuitem"
                data-testid="topbar-help-open-tour"
                onClick={() => {
                  setHelpOpen(false);
                  onOpenTour();
                }}
                className={cn(
                  'flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition-colors',
                  isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-[var(--cg-hover)]',
                )}
              >
                <Compass className="size-4 text-emerald-500" aria-hidden="true" />
                <span>Rever Tour Rápido</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
