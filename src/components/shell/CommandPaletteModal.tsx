import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Compass,
  Eye,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Moon,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
} from 'lucide-react';
import { ModalContainer } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { SidebarTab } from './Sidebar';

export interface CommandPaletteProductItem {
  id: string;
  name: string;
  priceCents?: number;
}

export interface CommandPaletteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  isDarkMode: boolean;
  isCatalogEmpty: boolean;
  products: CommandPaletteProductItem[];
  onSelectTab: (tab: SidebarTab) => void;
  onOpenCheckout: () => void;
  onOpenPreview: () => void;
  onOpenSupport: () => void;
  onToggleDarkMode: () => void;
  onOpenTour: () => void;
  onLogout?: () => void;
}

interface PaletteEntry {
  id: string;
  group: 'Navegação' | 'Ações Rápidas' | 'Produtos do Catálogo';
  label: string;
  hint: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

function normalizeSearch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function CommandPaletteModal({
  open,
  onOpenChange,
  isAdmin,
  isDarkMode,
  isCatalogEmpty,
  products,
  onSelectTab,
  onOpenCheckout,
  onOpenPreview,
  onOpenSupport,
  onToggleDarkMode,
  onOpenTour,
  onLogout,
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const navEntries: PaletteEntry[] = [
      {
        id: 'nav-store',
        group: 'Navegação',
        label: 'Minha Loja · Catálogo e Vitrine',
        hint: 'Aba Principal',
        keywords: 'minha loja catalogo produtos vitrine estudio',
        icon: Store,
        run: () => onSelectTab('store'),
      },
      {
        id: 'nav-whatsapp',
        group: 'Navegação',
        label: 'WhatsApp · Atendimento Sofia IA',
        hint: 'Conexão & QR',
        keywords: 'whatsapp sofia atendimento qr code conversas',
        icon: MessageSquare,
        run: () => onSelectTab('whatsapp'),
      },
      {
        id: 'nav-dashboard',
        group: 'Navegação',
        label: 'Pedidos & Métricas',
        hint: 'Kanban & Caixa',
        keywords: 'pedidos dashboard vendas kanban caixa entregas',
        icon: ShoppingBag,
        run: () => onSelectTab('dashboard'),
      },
      {
        id: 'nav-settings',
        group: 'Navegação',
        label: 'Ajustes da Conta',
        hint: 'Pix, Horários & Marca',
        keywords: 'ajustes configuracoes pix horario endereco suporte',
        icon: Settings,
        run: () => onSelectTab('settings'),
      },
    ];

    if (isAdmin) {
      navEntries.push({
        id: 'nav-admin',
        group: 'Navegação',
        label: 'Admin · Console Operacional',
        hint: 'Restrito Admin',
        keywords: 'admin chamados kiwify qr frota usuarios',
        icon: ShieldCheck,
        run: () => onSelectTab('admin'),
      });
    }

    const actionEntries: PaletteEntry[] = [
      {
        id: 'action-checkout',
        group: 'Ações Rápidas',
        label: 'Planos IA & Extrato de Créditos',
        hint: 'Recarga Kiwify',
        keywords: 'creditos planos saldo kiwify recarga extrato',
        icon: Sparkles,
        run: onOpenCheckout,
      },
      {
        id: 'action-support',
        group: 'Ações Rápidas',
        label: 'Reportar Problema / Suporte',
        hint: 'Ctrl+V para print',
        keywords: 'suporte ajuda chamado problema bug erro ticket',
        icon: LifeBuoy,
        run: onOpenSupport,
      },
      {
        id: 'action-theme',
        group: 'Ações Rápidas',
        label: isDarkMode ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro',
        hint: 'Aparência',
        keywords: 'tema dark light escuro claro aparencia',
        icon: isDarkMode ? Sun : Moon,
        run: onToggleDarkMode,
      },
      {
        id: 'action-tour',
        group: 'Ações Rápidas',
        label: 'Rever Tour de Boas-vindas',
        hint: 'Guia rápido',
        keywords: 'tour boas vindas onboarding ajuda inicial',
        icon: Compass,
        run: onOpenTour,
      },
      ...(onLogout
        ? [
            {
              id: 'action-logout',
              group: 'Ações Rápidas' as const,
              label: 'Sair da Conta (Logout)',
              hint: 'Encerrar sessão',
              keywords: 'sair logout desconectar conta trocar usuario',
              icon: LogOut,
              run: onLogout,
            },
          ]
        : []),
    ];

    if (!isCatalogEmpty) {
      actionEntries.unshift({
        id: 'action-preview',
        group: 'Ações Rápidas',
        label: 'Ver Vitrine Pública',
        hint: 'Preview da Loja',
        keywords: 'ver vitrine loja publica preview visualizacao',
        icon: Eye,
        run: onOpenPreview,
      });
    }

    const productEntries: PaletteEntry[] = products.slice(0, 40).map((p) => ({
      id: `product-${p.id}`,
      group: 'Produtos do Catálogo',
      label: p.name,
      hint:
        typeof p.priceCents === 'number' && p.priceCents > 0
          ? `R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')}`
          : 'Produto',
      keywords: `produto ${p.name}`,
      icon: Package,
      run: () => {
        onSelectTab('store');
        try {
          window.dispatchEvent(
            new CustomEvent('companygen:focus-product', { detail: { productId: p.id, name: p.name } }),
          );
        } catch {
          // Ignore custom event errors
        }
      },
    }));

    return [...navEntries, ...actionEntries, ...productEntries];
  }, [
    isAdmin,
    isDarkMode,
    isCatalogEmpty,
    products,
    onSelectTab,
    onOpenCheckout,
    onOpenPreview,
    onOpenSupport,
    onToggleDarkMode,
    onOpenTour,
  ]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return entries.slice(0, 14);
    return entries
      .filter((entry) => {
        const hay = normalizeSearch(`${entry.label} ${entry.keywords} ${entry.group}`);
        return hay.includes(q);
      })
      .slice(0, 14);
  }, [entries, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  const executeEntry = (entry?: PaletteEntry) => {
    if (!entry) return;
    onOpenChange(false);
    entry.run();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      executeEntry(filtered[selectedIndex] ?? filtered[0]);
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      maxWidth="lg"
      title="Paleta de Comandos"
      description="Navegue entre módulos, produtos e ações rápidas pelo teclado."
    >
      <div data-testid="command-palette-modal" className="space-y-3">
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border px-3',
            isDarkMode
              ? 'border-slate-700 bg-[#182034] text-white'
              : 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[#0B1D52]',
          )}
        >
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Digite um comando, aba ou nome de produto..."
            aria-label="Buscar comandos, abas ou produtos"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex rounded border border-slate-500/30 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            ESC
          </kbd>
        </div>

        {filtered.length === 0 ? (
          <p
            data-testid="command-palette-empty"
            className="py-6 text-center text-xs text-slate-500 dark:text-slate-400"
          >
            Nenhum comando ou produto encontrado para "{query}".
          </p>
        ) : (
          <ul
            role="listbox"
            aria-label="Resultados de comandos"
            className="max-h-80 space-y-1 overflow-y-auto pr-1"
          >
            {filtered.map((entry, idx) => {
              const Icon = entry.icon;
              const isHighlighted = idx === selectedIndex;
              return (
                <li key={entry.id} role="option" aria-selected={isHighlighted}>
                  <button
                    type="button"
                    data-testid={`command-palette-item-${entry.id}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => executeEntry(entry)}
                    className={cn(
                      'flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                      isHighlighted
                        ? isDarkMode
                          ? 'bg-[#2563EB]/25 text-white ring-1 ring-[#3B82F6]/50'
                          : 'bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#BFDBFE]'
                        : isDarkMode
                          ? 'text-slate-200 hover:bg-slate-800/80'
                          : 'text-[#0B1D52] hover:bg-slate-100',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold">{entry.label}</span>
                        <span className="block truncate text-[11px] opacity-70">{entry.group}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold opacity-75">
                      <span>{entry.hint}</span>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalContainer>
  );
}
