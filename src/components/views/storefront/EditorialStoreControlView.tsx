import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  ImagePlus,
  ListFilter,
  Loader2,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import type { SidebarTab } from '@/components/shell/Sidebar';
import { FloatingTopPill } from '@/components/shell/FloatingTopPill';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogProduct,
  type DashboardMetricsProjection,
} from '@/schemas/profile.schema';
import { updateBusinessProfile, type ProfileSnapshot } from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';
import { attemptOneTimeChunkReload, isChunkLoadError, lazyNamed } from '@/utils/chunk-recovery';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';
import {
  deriveEditorialMetrics,
  EDITORIAL_COMMAND_IDS,
  filterEditorialProducts,
  fuzzySubsequenceMatch,
  nextEditorialFilter,
  type EditorialCatalogFilter,
} from './editorial-store-helpers';

const ProductEditorDrawer = lazyNamed(() => import('./ProductEditorDrawer'), 'ProductEditorDrawer');
const UniversalCatalogXlsxModal = lazyNamed(
  () => import('./UniversalCatalogXlsxModal'),
  'UniversalCatalogXlsxModal',
);
const MyLibraryDockModal = lazyNamed(() => import('./MyLibraryDockModal'), 'MyLibraryDockModal');
const StorePagesExpansionModal = lazyNamed(
  () => import('./StorePagesExpansionModal'),
  'StorePagesExpansionModal',
);

export interface EditorialStoreControlViewProps {
  profile: BusinessProfile;
  dashboard: DashboardMetricsProjection | null;
  ownerId: string;
  whatsappConnected: boolean;
  pendingOrdersCount?: number;
  waitingHumanCount?: number;
  creditBalance?: number;
  hideTopPill?: boolean;
  isAdmin?: boolean;
  onSelectTab: (tab: SidebarTab) => void;
  onOpenVitrine: () => void;
  onOpenArchetypeComposer: () => void;
  onOpenCheckout: () => void;
  onRedoOnboarding: () => void;
  onProfileUpdated: (snap: ProfileSnapshot) => void;
  onLogout?: () => void;
}

const FILTER_LABELS: Record<EditorialCatalogFilter, string> = {
  active: 'Ativos',
  paused: 'Pausados',
  all: 'Todos',
};

interface PaletteCommandOption {
  id: string;
  group: 'Produtos do Catálogo' | 'Ações Rápidas' | 'Navegação';
  label: string;
  subLabel?: string;
  thumbnailUrl?: string;
  hint?: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

export function EditorialStoreControlView({
  profile,
  dashboard,
  ownerId,
  whatsappConnected,
  pendingOrdersCount = 0,
  waitingHumanCount = 0,
  creditBalance,
  hideTopPill = false,
  isAdmin = false,
  onSelectTab,
  onOpenVitrine,
  onOpenArchetypeComposer,
  onOpenCheckout,
  onRedoOnboarding,
  onProfileUpdated,
  onLogout,
}: EditorialStoreControlViewProps) {
  const { showToast } = useToast();

  const [filterMode, setFilterMode] = React.useState<EditorialCatalogFilter>('active');
  const [gridQuery, setGridQuery] = React.useState('');
  const [exportingZip, setExportingZip] = React.useState(false);

  const handleDownloadStoreZip = React.useCallback(async () => {
    if (exportingZip) return;
    setExportingZip(true);
    try {
      const mod = await import('./storefront-zip-builder');
      const res = await mod.buildFaithfulStorefrontZip({ profile, owner: ownerId });
      if (!res?.blob || res.blob.size === 0) {
        throw new Error('O pacote .ZIP gerado veio vazio. Tente novamente.');
      }
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'vitrine-loja.zip';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast({
        type: 'success',
        message: `Vitrine exportada (${res.filename} · ${res.fileCount} arquivos)!`,
      });
    } catch (err) {
      if (isChunkLoadError(err) || err instanceof TypeError) {
        attemptOneTimeChunkReload('zip_builder_import');
      }
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao gerar arquivo .ZIP da vitrine.',
      });
    } finally {
      setExportingZip(false);
    }
  }, [exportingZip, ownerId, profile, showToast]);

  // Inline editable store title state
  const storeTitle = profile.business?.name?.trim() || 'Minha Loja';
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(storeTitle);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editingTitle) {
      setTitleDraft(storeTitle);
    }
  }, [editingTitle, storeTitle]);

  React.useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  // Drawers & Modals
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<CatalogProduct | null>(null);
  const [xlsxModalOpen, setXlsxModalOpen] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [expansionModalOpen, setExpansionModalOpen] = React.useState(false);
  const [simulatingOrder, setSimulatingOrder] = React.useState(false);

  const storePagesList = React.useMemo(() => {
    const rawPages = (
      profile.storeLayout?.formulasIr as {
        pages?: Array<{ id: string; slug: string; title: string; isHome?: boolean; campaignTheme?: string }>;
      } | undefined
    )?.pages;
    if (Array.isArray(rawPages)) {
      return rawPages.filter((p) => p && !p.isHome);
    }
    const formula = ensureFormulaV9(profile) as { pages?: Array<{ id: string; slug: string; title: string; isHome?: boolean; campaignTheme?: string }> };
    return Array.isArray(formula?.pages) ? formula.pages.filter((p) => p && !p.isHome) : [];
  }, [profile]);

  const handleSimulateOrderFromStore = React.useCallback(async () => {
    if (simulatingOrder) return;
    const sample = (profile.catalog?.products || []).find((p) => p.active !== false) || profile.catalog?.products?.[0];
    if (!sample) {
      showToast({ type: 'amber', message: 'Adicione ao menos 1 produto para simular um pedido.' });
      return;
    }
    setSimulatingOrder(true);
    try {
      const res = await authenticatedFetch(
        '/api/orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isSimulation: true,
            customerName: 'Pedido Simulado (Minha Loja)',
            paymentMethod: 'pix',
            deliveryAddress: { mode: 'retirada', notes: 'Teste rápido do painel Minha Loja' },
            shippingCents: 0,
            items: [{ sku: sample.sku, name: sample.name, variation: sample.variation || 'Padrão', qty: 1 }],
          }),
        },
        ownerId,
      );
      const raw = await res.json().catch(() => ({}));
      if (!res.ok || !raw?.order) {
        throw new Error(String(raw?.error || 'Não foi possível criar pedido simulado.'));
      }
      showToast({
        type: 'success',
        message: `Pedido simulado #${raw.order.order_ref} criado! Confira na aba Pedidos.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao simular pedido.',
      });
    } finally {
      setSimulatingOrder(false);
    }
  }, [ownerId, profile.catalog?.products, showToast, simulatingOrder]);

  // Command Palette Combobox (⌘K / Ctrl+K)
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [paletteQuery, setPaletteQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const cmdInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  React.useEffect(() => {
    if (paletteOpen) {
      setActiveIndex(0);
      const id = window.requestAnimationFrame(() => {
        cmdInputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [paletteOpen]);

  const metrics = React.useMemo(
    () => deriveEditorialMetrics(profile, dashboard),
    [profile, dashboard],
  );

  const allProducts = React.useMemo(
    () => (Array.isArray(profile.catalog?.products) ? profile.catalog.products : []),
    [profile.catalog?.products],
  );

  const visibleProducts = React.useMemo(
    () => filterEditorialProducts(allProducts, filterMode, gridQuery),
    [allProducts, filterMode, gridQuery],
  );

  const existingCategories = React.useMemo(
    () =>
      Array.from(
        new Set(allProducts.map((p) => (p.category || '').trim()).filter(Boolean)),
      ),
    [allProducts],
  );

  const commitInlineTitle = async () => {
    const clean = titleDraft.trim();
    setEditingTitle(false);
    if (!clean || clean === storeTitle) {
      setTitleDraft(storeTitle);
      return;
    }
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.business.name = clean;
        },
        undefined,
        ownerId,
      );
      onProfileUpdated(snap);
      showToast({
        type: 'success',
        message: 'Nome da loja atualizado',
        durationMs: 2200,
      });
    } catch (err) {
      setTitleDraft(storeTitle);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível salvar o nome.',
      });
    }
  };

  const handleOpenNewProduct = React.useCallback(() => {
    setEditingProduct(null);
    setEditorOpen(true);
  }, []);

  const handleEditProduct = React.useCallback((product: CatalogProduct) => {
    setEditingProduct(product);
    setEditorOpen(true);
  }, []);

  const handleImportXlsxProducts = async (imported: CatalogProduct[]) => {
    const normalized = imported.map((item) => ({
      ...item,
      active: item.active !== false,
      approvedAsset: true,
    }));
    const snap = await updateBusinessProfile(
      (draft) => {
        const current = Array.isArray(draft.catalog?.products) ? draft.catalog.products : [];
        draft.catalog = {
          products: [...normalized, ...current],
        };
      },
      undefined,
      ownerId,
    );
    onProfileUpdated(snap);
    showToast({
      type: 'success',
      message: `${normalized.length} ${normalized.length === 1 ? 'produto importado' : 'produtos importados'} para o catálogo`,
      durationMs: 2800,
    });
  };

  const commandOptions = React.useMemo<PaletteCommandOption[]>(() => {
    const q = paletteQuery.trim();
    const productMatches = filterEditorialProducts(allProducts, 'all', q)
      .slice(0, 8)
      .map<PaletteCommandOption>((prod) => {
        const rawImg = String(prod.imageUrl || '').trim();
        const thumb =
          rawImg && !rawImg.startsWith('data:image/svg+xml') ? rawImg : undefined;
        return {
          id: `product.${prod.id}`,
          group: 'Produtos do Catálogo',
          label: prod.name,
          subLabel: prod.category || 'Geral',
          thumbnailUrl: thumb,
          hint: formatCurrencyBRL(prod.priceCents),
          keywords: `${prod.name} ${prod.category} ${prod.sku}`,
          icon: Pencil,
          run: () => {
            setPaletteOpen(false);
            handleEditProduct(prod);
          },
        };
      });

    if (q) {
      productMatches.unshift({
        id: `${EDITORIAL_COMMAND_IDS.SEARCH}.apply`,
        group: 'Produtos do Catálogo',
        label: `Filtrar grade por "${q}"`,
        hint: 'Aplicar na grade',
        keywords: q,
        icon: Search,
        run: () => {
          setGridQuery(q);
          setPaletteOpen(false);
        },
      });
    }

    const actions: PaletteCommandOption[] = [
      {
        id: EDITORIAL_COMMAND_IDS.CREATE_PRODUCT,
        group: 'Ações Rápidas',
        label: 'Novo Produto',
        hint: 'Catálogo',
        keywords: 'novo produto criar item cadastrar',
        icon: Plus,
        run: () => {
          setPaletteOpen(false);
          handleOpenNewProduct();
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.IMPORT_XLSX,
        group: 'Ações Rápidas',
        label: 'Importar Planilha (.xlsx / .csv)',
        hint: 'Em lote',
        keywords: 'importar planilha excel csv catalogo lote',
        icon: FileSpreadsheet,
        run: () => {
          setPaletteOpen(false);
          setXlsxModalOpen(true);
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.OPEN_VITRINE,
        group: 'Ações Rápidas',
        label: 'Ver Vitrine Pública',
        hint: 'Loja no ar',
        keywords: 'ver vitrine loja publica preview cliente',
        icon: Eye,
        run: () => {
          setPaletteOpen(false);
          onOpenVitrine();
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.OPEN_STUDIO,
        group: 'Ações Rápidas',
        label: 'Abrir Estúdio Visual da Vitrine',
        hint: 'Seções IA',
        keywords: 'estudio visual composicao secoes ia',
        icon: Sparkles,
        run: () => {
          setPaletteOpen(false);
          onOpenArchetypeComposer();
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.CYCLE_FILTER,
        group: 'Ações Rápidas',
        label: `Alternar filtro do catálogo (${FILTER_LABELS[filterMode]})`,
        hint: 'Ativos / Pausados / Todos',
        keywords: 'filtro ativos pausados todos catalogo',
        icon: ListFilter,
        run: () => {
          setFilterMode((prev) => nextEditorialFilter(prev));
          setPaletteOpen(false);
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.REDO_ONBOARDING,
        group: 'Ações Rápidas',
        label: 'Reconfigurar loja no Onboarding',
        hint: 'Reiniciar etapa inicial',
        keywords: 'onboarding configuracao inicial refazer',
        icon: RotateCcw,
        run: () => {
          setPaletteOpen(false);
          onRedoOnboarding();
        },
      },
    ];

    const nav: PaletteCommandOption[] = [
      {
        id: EDITORIAL_COMMAND_IDS.NAV_WHATSAPP,
        group: 'Navegação',
        label: 'WhatsApp · Atendimento Automático',
        hint: whatsappConnected ? 'Conectado' : 'Conectar',
        keywords: 'whatsapp atendimento qr code conexao mensagens',
        icon: MessageCircle,
        run: () => {
          setPaletteOpen(false);
          onSelectTab('whatsapp');
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.NAV_ORDERS,
        group: 'Navegação',
        label: 'Pedidos',
        hint: `${metrics.ordersCount} registrados`,
        keywords: 'pedidos kanban vendas planilha caixa',
        icon: ClipboardList,
        run: () => {
          setPaletteOpen(false);
          onSelectTab('dashboard');
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.NAV_SETTINGS,
        group: 'Navegação',
        label: 'Ajustes',
        hint: 'Pix & Conta',
        keywords: 'ajustes configuracoes pix conta',
        icon: Settings,
        run: () => {
          setPaletteOpen(false);
          onSelectTab('settings');
        },
      },
      {
        id: EDITORIAL_COMMAND_IDS.OPEN_CHECKOUT,
        group: 'Navegação',
        label: 'Planos & Créditos',
        hint: 'Recarga',
        keywords: 'creditos planos recarga pix assinatura',
        icon: CreditCard,
        run: () => {
          setPaletteOpen(false);
          onOpenCheckout();
        },
      },
    ];

    if (isAdmin) {
      nav.push({
        id: EDITORIAL_COMMAND_IDS.OPEN_ADMIN,
        group: 'Navegação',
        label: 'Console Admin',
        hint: 'Operação',
        keywords: 'admin suporte sistema',
        icon: ShieldCheck,
        run: () => {
          setPaletteOpen(false);
          onSelectTab('admin');
        },
      });
    }

    if (onLogout) {
      nav.push({
        id: EDITORIAL_COMMAND_IDS.LOGOUT,
        group: 'Navegação',
        label: 'Sair da conta',
        keywords: 'logout sair conta',
        icon: LogOut,
        run: () => {
          setPaletteOpen(false);
          onLogout();
        },
      });
    }

    const filteredActions = q
      ? actions.filter((a) => fuzzySubsequenceMatch(q, `${a.label} ${a.keywords}`))
      : actions;
    const filteredNav = q
      ? nav.filter((n) => fuzzySubsequenceMatch(q, `${n.label} ${n.keywords}`))
      : nav;

    return [...productMatches, ...filteredActions, ...filteredNav];
  }, [
    allProducts,
    filterMode,
    handleEditProduct,
    handleOpenNewProduct,
    isAdmin,
    metrics.ordersCount,
    onLogout,
    onOpenArchetypeComposer,
    onOpenCheckout,
    onOpenVitrine,
    onRedoOnboarding,
    onSelectTab,
    paletteQuery,
    whatsappConnected,
  ]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [paletteQuery]);

  const handlePaletteInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setPaletteOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) =>
        commandOptions.length === 0 ? 0 : (prev + 1) % commandOptions.length,
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) =>
        commandOptions.length === 0
          ? 0
          : (prev - 1 + commandOptions.length) % commandOptions.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = commandOptions[activeIndex];
      if (target) {
        target.run();
      }
    }
  };

  const isOnline = Boolean(profile.publishedStore?.published);
  const groupedCommands = React.useMemo(() => {
    const groups: Array<{
      name: PaletteCommandOption['group'];
      items: Array<{ opt: PaletteCommandOption; flatIdx: number }>;
    }> = [
      { name: 'Produtos do Catálogo', items: [] },
      { name: 'Ações Rápidas', items: [] },
      { name: 'Navegação', items: [] },
    ];
    commandOptions.forEach((opt, flatIdx) => {
      const bucket = groups.find((g) => g.name === opt.group);
      if (bucket) bucket.items.push({ opt, flatIdx });
    });
    return groups.filter((g) => g.items.length > 0);
  }, [commandOptions]);

  return (
    <div
      data-testid="store-editorial-view"
      className="min-h-dvh w-full bg-[#F8FAFC] text-[#09090B]"
    >
      {/* 1. FloatingTopPill */}
      {!hideTopPill ? (
        <FloatingTopPill
          activeTab="store"
          onSelectTab={onSelectTab}
          onOpenVitrine={onOpenVitrine}
          isOnline={isOnline}
          isAdmin={isAdmin}
          pendingOrdersCount={pendingOrdersCount}
          waitingHumanCount={waitingHumanCount}
          creditBalance={creditBalance}
          onOpenCheckout={onOpenCheckout}
          onLogout={onLogout}
        />
      ) : null}

      {/* 2. StoreHeroStrip (Faixa Editorial Aberta) */}
      <header
        data-testid="editorial-hero-strip"
        className="mx-auto flex w-full max-w-[1360px] flex-wrap items-end justify-between gap-6 px-5 pt-7 pb-6 sm:px-8"
      >
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          {/* Título da Loja Editável Inline */}
          <div className="flex items-center gap-4">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                data-testid="editorial-store-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void commitInlineTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitInlineTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setTitleDraft(storeTitle);
                    setEditingTitle(false);
                  }
                }}
                aria-label="Editar nome da loja"
                className="max-w-[360px] border-b-2 border-[#2563EB] bg-transparent font-serif text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] text-[#09090B] focus:outline-none sm:text-[54px]"
              />
            ) : (
              <button
                type="button"
                data-testid="editorial-store-title"
                title="Clique para editar o nome da loja"
                onClick={() => setEditingTitle(true)}
                className="group inline-flex items-baseline gap-2 text-left font-serif text-[40px] font-extrabold leading-[0.95] tracking-[-0.03em] text-[#09090B] transition-opacity hover:opacity-80 sm:text-[54px]"
              >
                <span>{storeTitle}</span>
              </button>
            )}

            <div
              data-testid="editorial-store-status"
              className="flex flex-col items-center gap-0.5"
            >
              <span
                className={cn(
                  'size-3.5 rounded-full',
                  isOnline ? 'bg-[#10B981]' : 'bg-amber-500',
                )}
                style={{
                  boxShadow: isOnline
                    ? '0 0 0 4px rgba(16, 185, 129, 0.16)'
                    : '0 0 0 4px rgba(245, 158, 11, 0.16)',
                }}
              />
              <span
                className={cn(
                  'text-[11px] font-semibold',
                  isOnline ? 'text-[#10B981]' : 'text-amber-600',
                )}
              >
                {isOnline ? 'Online' : 'Rascunho'}
              </span>
            </div>
          </div>

          {/* Métricas Tabulares Reais */}
          <div className="flex items-center gap-7 sm:gap-9">
            <div data-testid="editorial-metric-visitas" className="flex flex-col">
              <span className="text-[28px] font-bold leading-none tabular-nums tracking-tight text-[#09090B] sm:text-[34px]">
                {metrics.visitsTotal}
              </span>
              <span className="mt-1 text-[12px] font-medium text-[#64748B]">visitas</span>
            </div>

            <div data-testid="editorial-metric-cliques" className="flex flex-col">
              <span className="text-[28px] font-bold leading-none tabular-nums tracking-tight text-[#09090B] sm:text-[34px]">
                {metrics.clicksTotal}
              </span>
              <span className="mt-1 text-[12px] font-medium text-[#64748B]">cliques</span>
            </div>

            <div data-testid="editorial-metric-pedidos" className="flex flex-col">
              <span className="text-[28px] font-bold leading-none tabular-nums tracking-tight text-[#09090B] sm:text-[34px]">
                {metrics.ordersCount}
              </span>
              <span className="mt-1 text-[12px] font-medium text-[#64748B]">pedidos</span>
            </div>
          </div>
        </div>

        {/* CTAs Principais à Direita */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="editorial-download-zip-btn"
            disabled={exportingZip}
            onClick={() => void handleDownloadStoreZip()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-xs font-bold text-[#09090B] shadow-2xs transition hover:bg-[#F1F5F9] disabled:opacity-60"
          >
            {exportingZip ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-3.5" aria-hidden="true" />
            )}
            <span>{exportingZip ? 'Empacotando .ZIP...' : 'Baixar Loja (.ZIP)'}</span>
          </button>

          {!whatsappConnected ? (
            <button
              type="button"
              data-testid="editorial-hero-cta"
              onClick={() => onSelectTab('whatsapp')}
              className="text-[15px] font-semibold text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
            >
              Conectar WhatsApp →
            </button>
          ) : (
            <button
              type="button"
              data-testid="editorial-hero-cta"
              onClick={onOpenVitrine}
              className="text-[15px] font-semibold text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
            >
              Ver Vitrine Online →
            </button>
          )}
        </div>
      </header>

      {/* Sugestões Proativas Contínuas Pós-Onboarding */}
      {(() => {
        const missingPhotosCount = (profile.catalog?.products ?? []).filter(
          (p) => p.active !== false && (!p.imageUrl || p.imageUrl.startsWith('data:image/svg+xml')),
        ).length;
        const suggestions: Array<{ id: string; label: string; actionLabel: string; onClick: () => void }> = [];
        if (!whatsappConnected) {
          suggestions.push({
            id: 'sug-wpp',
            label: 'Conecte seu WhatsApp para a IA Sofia atender clientes e fechar pedidos automaticamente.',
            actionLabel: 'Conectar WhatsApp',
            onClick: () => onSelectTab('whatsapp'),
          });
        }
        if (missingPhotosCount > 0) {
          suggestions.push({
            id: 'sug-photos',
            label: `${missingPhotosCount} itens usam ícone da categoria. Suba fotos reais desses produtos se quiser destacar mais.`,
            actionLabel: 'Revisar Catálogo',
            onClick: () => setFilterMode('active'),
          });
        }
        suggestions.push({
          id: 'sug-editor',
          label: 'Ajuste alinhamentos, fontes ou crie novas subpáginas usando o Editor Visual.',
          actionLabel: 'Abrir Editor Visual',
          onClick: onOpenVitrine,
        });
        return suggestions.length > 0 ? (
          <section
            data-testid="editorial-post-onboarding-suggestions"
            className="mx-auto mb-6 w-full max-w-[1360px] px-5 sm:px-8"
          >
            <div className="rounded-[14px] border border-[#E2E8F0] bg-white px-4 py-3.5">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                <Sparkles className="size-3.5 text-[#09090B]" aria-hidden="true" />
                <span>Sugestões da IA para sua loja</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={s.onClick}
                    className="flex w-full sm:w-auto max-w-full min-w-0 items-center justify-between sm:justify-start gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-left text-xs text-[#09090B] transition-colors hover:border-[#09090B]/30 hover:bg-white"
                  >
                    <span className="min-w-0 flex-1 sm:flex-initial sm:max-w-[320px] truncate text-[#475569]">{s.label}</span>
                    <span className="shrink-0 whitespace-nowrap font-bold text-[#2563EB]">{s.actionLabel} →</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null;
      })()}

      {/* Multi-Páginas da Loja (+ Nova Tela) + Simular 1º Pedido consolidado em Minha Loja */}
      <section
        data-testid="editorial-multipage-control-panel"
        className="mx-auto mb-6 w-full max-w-[1360px] px-5 sm:px-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E2E8F0] bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Telas da sua Vitrine ({1 + storePagesList.length}):
            </span>
            <button
              type="button"
              onClick={onOpenVitrine}
              className="rounded-full border border-[#09090B] bg-[#09090B] px-3 py-1 text-xs font-bold text-white"
            >
              Principal
            </button>
            {storePagesList.map((pg) => (
              <button
                key={pg.slug}
                type="button"
                onClick={onOpenVitrine}
                className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1 text-xs font-semibold text-[#09090B] hover:bg-slate-100"
              >
                {pg.title}
              </button>
            ))}
            <button
              type="button"
              data-testid="editorial-add-page-btn"
              onClick={() => setExpansionModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#2563EB]/60 bg-[#EFF6FF] px-3 py-1 text-xs font-bold text-[#1D4ED8] hover:bg-blue-100/70"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Nova Tela</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="editorial-simulate-order-btn"
              disabled={simulatingOrder}
              onClick={() => void handleSimulateOrderFromStore()}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#09090B] hover:bg-white disabled:opacity-60"
            >
              <ShoppingBag className="size-3.5 text-[#16A34A]" aria-hidden="true" />
              <span>{simulatingOrder ? 'Simulando...' : 'Simular 1º Pedido'}</span>
            </button>
            <button
              type="button"
              data-testid="editorial-open-library-btn"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-xs font-semibold text-[#09090B] hover:bg-white"
            >
              <FolderOpen className="size-3.5 text-[#475569]" aria-hidden="true" />
              <span>Minha Biblioteca</span>
            </button>
          </div>
        </div>
      </section>

      {/* Faixa Discreta de Busca / Filtro Aplicado */}
      {gridQuery.trim() || filterMode !== 'active' ? (
        <div className="mx-auto mb-4 flex w-full max-w-[1360px] flex-wrap items-center gap-2 px-5 sm:px-8">
          {filterMode !== 'active' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-[#334155]">
              Exibindo: {FILTER_LABELS[filterMode]}
            </span>
          ) : null}
          {gridQuery.trim() ? (
            <button
              type="button"
              data-testid="editorial-clear-query-btn"
              onClick={() => setGridQuery('')}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#2563EB] hover:bg-[#DBEAFE]"
            >
              <span>Busca: &ldquo;{gridQuery}&rdquo;</span>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 3. EditorialProductGrid (Grade Pura em 5 Colunas) */}
      <main className="mx-auto w-full max-w-[1360px] px-5 pb-28 sm:px-8">
        {visibleProducts.length === 0 ? (
          <div
            data-testid="editorial-empty-grid"
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-6 py-14 text-center"
          >
            <p className="text-[15px] font-semibold text-[#09090B]">
              {gridQuery.trim()
                ? `Nenhum item encontrado para "${gridQuery}"`
                : filterMode === 'paused'
                  ? 'Nenhum produto pausado no momento'
                  : 'Seu catálogo ainda está vazio'}
            </p>
            <p className="mt-1 text-[13px] text-[#64748B]">
              {gridQuery.trim()
                ? 'Limpe o filtro de busca ou adicione um novo item pelo botão abaixo.'
                : 'Adicione produtos manualmente ou importe sua planilha pelo comando + Novo Produto.'}
            </p>
            {gridQuery.trim() ? (
              <button
                type="button"
                onClick={() => setGridQuery('')}
                className="mt-4 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#F1F5F9]"
              >
                Limpar busca
              </button>
            ) : null}
          </div>
        ) : (
          <div
            data-testid="editorial-product-grid"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {visibleProducts.map((product) => {
              const rawImg = String(product.imageUrl || '').trim();
              const hasRealImage = Boolean(
                rawImg && !rawImg.startsWith('data:image/svg+xml'),
              );
              const stockCount = Number.isFinite(Number(product.stockQty ?? product.stock))
                ? Math.max(0, Number(product.stockQty ?? product.stock))
                : 0;

              return (
                <article
                  key={product.id}
                  data-testid={`editorial-product-card-${product.id}`}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '260px' }}
                  onClick={() => handleEditProduct(product)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEditProduct(product);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={cn(
                    'group relative flex cursor-pointer flex-col overflow-hidden rounded-[16px] border border-[#E2E8F0] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgba(15,23,42,0.10)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30',
                    product.active === false && 'opacity-70',
                  )}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F1F5F9]">
                    {hasRealImage ? (
                      <>
                        <img
                          src={rawImg}
                          alt={product.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fb = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = 'flex';
                          }}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          style={{
                            objectPosition: `${product.imageFocalPoint?.x ?? 50}% ${product.imageFocalPoint?.y ?? 50}%`,
                          }}
                        />
                        <div className="hidden size-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] text-[#64748B]">
                          <ImagePlus className="size-5" aria-hidden="true" />
                          <span className="text-[11px] font-medium">Adicionar foto</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] text-[#64748B]">
                        <ImagePlus className="size-5" aria-hidden="true" />
                        <span className="text-[11px] font-medium opacity-0 transition-opacity group-hover:opacity-100">
                          Adicionar foto
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-2 p-3.5">
                    <div className="min-w-0">
                      <h2 className="truncate text-[14px] font-semibold leading-snug text-[#09090B]">
                        {product.name}
                      </h2>
                      <p className="mt-0.5 truncate text-[12px] text-[#64748B]">
                        {product.category || 'Geral'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[15px] font-bold tabular-nums text-[#09090B]">
                        {formatCurrencyBRL(product.priceCents)}
                      </span>

                      <span className="inline-flex shrink-0 items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#475569] group-hover:hidden">
                        {stockCount} un.
                      </span>
                      <span className="hidden shrink-0 items-center rounded-full border border-[#E2E8F0] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#09090B] group-hover:inline-flex">
                        Editar •••
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* 4. BottomActionDock */}
      <div
        data-testid="editorial-bottom-dock"
        className="fixed bottom-4 sm:bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-0.5 sm:gap-1 overflow-hidden rounded-full border border-[#E2E8F0] bg-white/95 p-1 sm:p-1.5 shadow-[0_12px_36px_-8px_rgba(15,23,42,0.14)]"
      >
        <button
          type="button"
          data-testid="dock-search-trigger"
          onClick={() => setPaletteOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-full px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-[13px] font-medium text-[#475569] transition-colors hover:bg-[#F1F5F9] hover:text-[#09090B]"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span>Buscar</span>
          <kbd className="hidden sm:inline rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#64748B]">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          data-testid="dock-filter-toggle"
          onClick={() => setFilterMode((prev) => nextEditorialFilter(prev))}
          className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-[13px] font-medium text-[#09090B] transition-colors hover:bg-[#F1F5F9]"
        >
          <ListFilter className="size-3.5 text-[#475569]" aria-hidden="true" />
          <span>{FILTER_LABELS[filterMode]}</span>
        </button>

        <button
          type="button"
          data-testid="dock-library-btn"
          onClick={() => setLibraryOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-[13px] font-medium text-[#09090B] transition-colors hover:bg-[#F1F5F9]"
        >
          <FolderOpen className="size-3.5 text-[#475569]" aria-hidden="true" />
          <span className="hidden sm:inline">Biblioteca</span>
        </button>

        <button
          type="button"
          data-testid="dock-new-product-btn"
          onClick={handleOpenNewProduct}
          className="inline-flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-full bg-[#09090B] px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-[13px] font-semibold text-white transition-colors hover:bg-[#18181B]"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span>Novo Produto</span>
        </button>
      </div>

      {/* 5. Paleta Combobox ⌘K Padrão Linear / Raycast */}
      <AnimatePresence>
        {paletteOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-[#09090B]/20 px-4 pt-[11vh]"
            onClick={() => setPaletteOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.985, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.985, y: -6 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              data-testid="editorial-cmd-dialog"
              className="w-full max-w-[600px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_28px_70px_-14px_rgba(15,23,42,0.28),0_0_0_1px_rgba(15,23,42,0.03)]"
            >
              <div className="flex items-center gap-3 border-b border-[#E2E8F0]/80 px-4 py-3.5">
                <Search className="size-4 shrink-0 text-[#64748B]" aria-hidden="true" />
                <input
                  ref={cmdInputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="editorial-cmd-list"
                  aria-activedescendant={
                    commandOptions[activeIndex]
                      ? `cmd-opt-${commandOptions[activeIndex].id}`
                      : undefined
                  }
                  data-testid="editorial-cmd-input"
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  onKeyDown={handlePaletteInputKeyDown}
                  placeholder="Buscar produtos, comandos ou telas..."
                  className="cg-no-focus-ring w-full border-0 bg-transparent text-[14.5px] font-medium text-[#09090B] placeholder:text-[#94A3B8] outline-none ring-0 focus:outline-none focus-visible:outline-none"
                />
                {paletteQuery ? (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    onClick={() => {
                      setPaletteQuery('');
                      cmdInputRef.current?.focus();
                    }}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#09090B]"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                <kbd className="shrink-0 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#64748B]">
                  ESC
                </kbd>
              </div>

              <div
                id="editorial-cmd-list"
                role="listbox"
                data-testid="editorial-cmd-list"
                className="max-h-[370px] overflow-y-auto p-2"
              >
                {commandOptions.length === 0 ? (
                  <p className="px-3 py-10 text-center text-[13px] text-[#64748B]">
                    Nenhum produto ou comando correspondente.
                  </p>
                ) : (
                  groupedCommands.map((grp) => (
                    <div key={grp.name} className="mb-2.5 last:mb-0">
                      <p className="px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        {grp.name}
                      </p>
                      <div className="space-y-0.5">
                        {grp.items.map(({ opt, flatIdx }) => {
                          const Icon = opt.icon;
                          const isActive = flatIdx === activeIndex;
                          return (
                            <button
                              key={opt.id}
                              id={`cmd-opt-${opt.id}`}
                              role="option"
                              aria-selected={isActive}
                              type="button"
                              data-testid={`editorial-cmd-item-${opt.id}`}
                              onMouseEnter={() => setActiveIndex(flatIdx)}
                              onClick={() => opt.run()}
                              className={cn(
                                'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                                isActive
                                  ? 'bg-[#09090B] text-white'
                                  : 'text-[#0F172A] hover:bg-[#F8FAFC]',
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                {opt.thumbnailUrl ? (
                                  <img
                                    src={opt.thumbnailUrl}
                                    alt={opt.label}
                                    className="size-9 shrink-0 rounded-lg border border-[#E2E8F0]/70 bg-[#F8FAFC] object-cover"
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                                      isActive
                                        ? 'border-white/15 bg-white/10 text-white'
                                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]',
                                    )}
                                  >
                                    <Icon className="size-4" />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate text-[13.5px] font-semibold leading-snug">
                                    {opt.label}
                                  </span>
                                  {opt.subLabel ? (
                                    <span
                                      className={cn(
                                        'block truncate text-[11px]',
                                        isActive ? 'text-white/65' : 'text-[#64748B]',
                                      )}
                                    >
                                      {opt.subLabel}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                              {opt.hint ? (
                                <span
                                  className={cn(
                                    'shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums',
                                    isActive
                                      ? 'bg-white/15 text-white'
                                      : 'bg-[#F1F5F9] text-[#334155]',
                                  )}
                                >
                                  {opt.hint}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[#F1F5F9] bg-[#F8FAFC] px-4 py-2 text-[11px] text-[#64748B]">
                <span className="flex items-center gap-3">
                  <span><kbd className="rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd> navegar</span>
                  <span><kbd className="rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-mono text-[10px]">↵</kbd> abrir</span>
                </span>
                <span><kbd className="rounded border border-[#E2E8F0] bg-white px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd> comando rápido</span>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 6. Drawer de Criação/Edição de Produto (carregado sob demanda) */}
      {editorOpen ? (
        <React.Suspense fallback={null}>
          <ProductEditorDrawer
            open={editorOpen}
            onOpenChange={setEditorOpen}
            product={editingProduct}
            existingCategories={existingCategories}
            brandPrimaryColor={profile.brand?.primaryColor}
            owner={ownerId}
            onSaved={(snap) => onProfileUpdated(snap)}
          />
        </React.Suspense>
      ) : null}

      {/* 7. Modal Universal de Planilha (.xlsx / .csv) */}
      {xlsxModalOpen ? (
        <React.Suspense fallback={null}>
          <UniversalCatalogXlsxModal
            open={xlsxModalOpen}
            onOpenChange={setXlsxModalOpen}
            ownerUser={ownerId}
            businessModel={profile.business?.businessModel || 'produtos'}
            onImportProducts={handleImportXlsxProducts}
          />
        </React.Suspense>
      ) : null}

      {/* 8. Dock Minha Biblioteca & Ativos */}
      {libraryOpen ? (
        <React.Suspense fallback={null}>
          <MyLibraryDockModal
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
            profile={profile}
            ownerId={ownerId}
          />
        </React.Suspense>
      ) : null}

      {/* 9. Modal + Nova Tela diretamente de Minha Loja */}
      {expansionModalOpen ? (
        <React.Suspense fallback={null}>
          <StorePagesExpansionModal
            open={expansionModalOpen}
            profile={profile}
            creditBalance={creditBalance ?? null}
            onClose={() => setExpansionModalOpen(false)}
            onNeedCredits={onOpenCheckout}
            onPageCreated={(nextFormula) => {
              setExpansionModalOpen(false);
              void updateBusinessProfile(
                (draft) => {
                  draft.storeLayout = {
                    ...draft.storeLayout,
                    formulasIr: nextFormula,
                    updatedAt: new Date().toISOString(),
                  };
                },
                undefined,
                ownerId,
              ).then((snap) => onProfileUpdated(snap));
            }}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}
