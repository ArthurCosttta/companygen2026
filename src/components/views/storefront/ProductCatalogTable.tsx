import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Archive,
  Check,
  CheckCircle2,
  Copy,
  Download,
  DownloadCloud,
  Edit3,
  Eye,
  FileSpreadsheet,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Megaphone,
  Monitor,
  Package,
  Palette,
  Pause,
  Percent,
  Play,
  Plus,
  QrCode,
  Rocket,
  Search,
  Smartphone,
  Sparkles,
  Store as StoreIcon,
  Tags,
  Trash2,
  Wand2,
  CheckSquare,
  Square,
  ZoomIn,
} from 'lucide-react';
import {
  BatchImageSearchModal,
} from '@/components/views/storefront/BatchImageSearchModal';
import {
  ProductImageDetailModal,
} from '@/components/views/storefront/ProductImageDetailModal';
import {
  buildDefaultMensagemMolde,
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogItemType,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { matchesProductQuery } from '@/utils/fuzzySearch';
import { validateAndOptimizeImageFile } from '@/utils/imageOptimize';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import {
  loadBusinessProfile,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  ActionButton,
  DrawerContainer,
  EmptyStateCard,
  ModalContainer,
  SkeletonTableRows,
  useToast,
} from '@/components/ui';
import {
  BatchPriceAdjustModal,
  DeleteProductConfirmModal,
  PublishBlockModal,
  StorePublishedModal,
} from './CatalogGuardModals';
import { MarketingHubTab } from './MarketingHubTab';
import { ProductEditorDrawer } from './ProductEditorDrawer';
import { ShippingQuickCard } from './ShippingQuickCard';
import { CustomerStorefrontView } from './CustomerStorefrontView';
import { UniversalCatalogXlsxModal } from './UniversalCatalogXlsxModal';

import { buildFaithfulStorefrontZip } from './storefront-zip-builder';
import {
  buildProductPlaceholderDataUri,
  buildStorePublicUrl,
  copyTextToClipboard,
  formatCentsForInput,
  getPublishBlockers,
  parseBRLInputToCents,
  resolveProductImageUrl,
  type PublishBlocker,
} from './storefront-utils';

export interface ProductCatalogTableProps {
  profile: BusinessProfile;
  revision: number;
  owner?: string;
  runtimeStatus?: WhatsappRuntimeStatus | null;
  isLoading?: boolean;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
  onOpenCustomerPreview?: () => void;
  onOpenSettings?: () => void;
  onOpenWhatsApp?: () => void;
  onOpenArchetypeComposer?: () => void;
}

const PHASE_BADGE_CLASS: Record<string, string> = {
  LIVE_READY: 'border-emerald-200 bg-emerald-50 text-[#24A677]',
  QR_PENDING: 'border-amber-200 bg-amber-50 text-[#92400E] dark:text-[#FBBF24]',
  STORE_NUMBER_ONLY: 'border-blue-200 bg-[var(--cg-hover)] text-[var(--cg-primary)]',
  DISCONNECTED: 'border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)]',
};

type CatalogDensity = 'comfortable' | 'compact';
type StoreSubTab = 'catalogo' | 'estudio' | 'divulgacao';
type InlineEditField = 'price' | 'stock';

const CATALOG_DENSITY_KEY = 'cg_catalog_density';

function loadCatalogDensity(): CatalogDensity {
  if (typeof window === 'undefined') return 'comfortable';
  try {
    return window.localStorage.getItem(CATALOG_DENSITY_KEY) === 'compact'
      ? 'compact'
      : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function reorderList<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return list;
  next.splice(toIndex, 0, moved);
  return next;
}

interface DesktopProductRowProps {
  product: CatalogProduct;
  brandPrimaryColor: string;
  density: CatalogDensity;
  isSelected: boolean;
  isUploading: boolean;
  canReorder: boolean;
  editingField: InlineEditField | null;
  inlineDraft: string;
  onStartInlineEdit: (field: InlineEditField, product: CatalogProduct) => void;
  onInlineDraftChange: (value: string) => void;
  onCommitInlineEdit: (fromBlur?: boolean) => void;
  onCancelInlineEdit: () => void;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onUploadPhoto: (product: CatalogProduct, file: File | null) => void;
  onZoomPhoto: (item: { id: string; name: string; imageUrl: string }) => void;
  onToggleActive: (product: CatalogProduct) => void;
  onEdit: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}

const DesktopProductRow = React.memo(function DesktopProductRow({
  product,
  brandPrimaryColor,
  density,
  isSelected,
  isUploading,
  canReorder,
  editingField,
  inlineDraft,
  onStartInlineEdit,
  onInlineDraftChange,
  onCommitInlineEdit,
  onCancelInlineEdit,
  onToggleSelect,
  onUploadPhoto,
  onZoomPhoto,
  onToggleActive,
  onEdit,
  onDelete,
}: DesktopProductRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: product.id, disabled: !canReorder });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: product.id,
    disabled: !canReorder,
  });

  const setRowRef = React.useCallback(
    (node: HTMLTableRowElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const isActive = product.active !== false;
  const lowThreshold = Math.max(0, Number(product.lowStockThreshold ?? 3));
  const isOutOfStock = product.stock === 0;
  const isLowStock = product.stock > 0 && product.stock <= lowThreshold;
  const focalX = product.imageFocalPoint?.x ?? 50;
  const focalY = product.imageFocalPoint?.y ?? 50;

  const imgSrc = resolveProductImageUrl(
    product.imageUrl,
    product.name,
    product.category,
    brandPrimaryColor,
  );
  const hasCustomPhoto = Boolean(
    product.imageUrl && !product.imageUrl.startsWith('data:image/svg+xml'),
  );

  const cellPad = density === 'compact' ? 'py-2' : 'py-4';
  const thumbSize = density === 'compact' ? 'size-9' : 'size-12';

  return (
    <tr
      ref={setRowRef}
      data-testid={`catalog-row-${product.id}`}
      data-density={density}
      className={`group align-middle transition-colors ${
        isOver ? 'border-t-2 border-t-[var(--cg-primary)]' : ''
      } ${isDragging ? 'opacity-40' : ''} ${
        isSelected ? 'bg-[var(--cg-hover)]/70' : 'hover:bg-[var(--cg-hover)]/45'
      }`}
    >
      {/* Sinal 1: Alça Drag + Checkbox + Foto 1:1 fixa */}
      <td className={`${cellPad} pl-4 pr-2`}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`catalog-drag-handle-${product.id}`}
            aria-label={`Arrastar para reordenar ${product.name}`}
            disabled={!canReorder}
            {...(canReorder ? attributes : {})}
            {...(canReorder ? listeners : {})}
            className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-[var(--cg-text-muted)] opacity-45 transition-opacity hover:bg-[var(--cg-surface-elevated)] hover:text-[var(--cg-text)] group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-20"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            data-testid={`catalog-select-row-${product.id}`}
            aria-label={`Selecionar ${product.name}`}
            onClick={(e) => onToggleSelect(product.id, e.shiftKey)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] hover:bg-[var(--cg-hover)]"
          >
            {isSelected ? (
              <CheckSquare className="size-4 text-[var(--cg-primary)]" />
            ) : (
              <Square className="size-4 text-[var(--cg-text-muted)]" />
            )}
          </button>

          <div className="relative shrink-0">
            <label
              data-testid={`product-upload-photo-${product.id}`}
              title="Clique para enviar foto JPG, PNG ou WebP"
              className={`group/img relative flex ${thumbSize} aspect-square shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)] transition-colors hover:border-[var(--cg-primary)]`}
            >
              {hasCustomPhoto ? (
                <img
                  src={imgSrc}
                  alt={product.name}
                  style={{ objectPosition: `${focalX}% ${focalY}%` }}
                  className="size-full object-cover"
                />
              ) : (
                <ImagePlus className="size-4" aria-hidden="true" />
              )}
              {isUploading ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-bold text-white">
                  ...
                </span>
              ) : null}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  e.target.value = '';
                  onUploadPhoto(product, f);
                }}
              />
            </label>
            {hasCustomPhoto && imgSrc && density === 'comfortable' ? (
              <button
                type="button"
                data-testid={`product-zoom-photo-${product.id}`}
                title="Ampliar foto"
                aria-label={`Ampliar foto de ${product.name}`}
                onClick={() =>
                  onZoomPhoto({
                    id: product.id,
                    name: product.name,
                    imageUrl: imgSrc,
                  })
                }
                className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)] shadow-xs group-hover:flex hover:text-[var(--cg-primary)]"
              >
                <ZoomIn className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      </td>

      {/* Sinal 2: Título + Variação / Categoria */}
      <td className={`${cellPad} px-3 max-w-[320px]`}>
        <button
          type="button"
          onClick={() => onEdit(product)}
          className="text-left group/title block w-full min-w-0 focus-visible:outline-none"
        >
          <p className="truncate text-sm font-semibold text-[var(--cg-text)] group-hover/title:text-[var(--cg-primary)]">
            {product.name}
          </p>
          <p className="truncate text-xs text-[var(--cg-text-muted)]">
            {product.category || 'Geral'}
            {product.variation && product.variation !== 'Padrão'
              ? ` · ${product.variation}`
              : ''}
            {!isActive && !isOutOfStock ? ' · Pausado manualmente' : ''}
          </p>
        </button>
      </td>

      {/* Sinal 3: Preço Inline Editar (36px, tabular-nums, Zero CLS) */}
      <td className={`${cellPad} px-3 whitespace-nowrap`}>
        {editingField === 'price' ? (
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            data-testid={`inline-price-input-${product.id}`}
            aria-label={`Editar preço de ${product.name}`}
            value={inlineDraft}
            onChange={(e) => onInlineDraftChange(e.target.value)}
            onBlur={() => onCommitInlineEdit(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitInlineEdit(false);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelInlineEdit();
              }
            }}
            className="cg-tabular h-[36px] w-28 rounded-lg border border-[var(--cg-primary)] bg-[var(--cg-surface)] px-2.5 text-[14px] font-bold text-[var(--cg-text)] ring-2 ring-[var(--cg-focus-ring)] focus:outline-none"
          />
        ) : (
          <button
            type="button"
            data-testid={`inline-price-trigger-${product.id}`}
            title="Duplo clique para editar preço"
            onDoubleClick={() => onStartInlineEdit('price', product)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                onStartInlineEdit('price', product);
              }
            }}
            className="cg-tabular inline-flex h-[36px] min-w-[92px] items-center rounded-lg px-2 text-[14px] font-bold text-[var(--cg-text)] transition-colors hover:bg-[var(--cg-hover)]"
          >
            {formatCurrencyBRL(product.priceCents)}
          </button>
        )}
      </td>

      {/* Sinal 4: Estoque Inline + Pílula condicional Baixo / Pausado */}
      <td className={`${cellPad} px-3 whitespace-nowrap`}>
        <div className="flex items-center gap-2">
          {editingField === 'stock' ? (
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              data-testid={`inline-stock-input-${product.id}`}
              aria-label={`Editar estoque de ${product.name}`}
              value={inlineDraft}
              onChange={(e) => onInlineDraftChange(e.target.value)}
              onBlur={() => onCommitInlineEdit(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitInlineEdit(false);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelInlineEdit();
                }
              }}
              className="cg-tabular h-[36px] w-20 rounded-lg border border-[var(--cg-primary)] bg-[var(--cg-surface)] px-2.5 text-sm font-semibold text-[var(--cg-text)] ring-2 ring-[var(--cg-focus-ring)] focus:outline-none"
            />
          ) : (
            <button
              type="button"
              data-testid={`inline-stock-trigger-${product.id}`}
              title="Duplo clique para editar estoque"
              onDoubleClick={() => onStartInlineEdit('stock', product)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'F2') {
                  e.preventDefault();
                  onStartInlineEdit('stock', product);
                }
              }}
              className="cg-tabular inline-flex h-[36px] min-w-[44px] items-center rounded-lg px-2 text-sm font-semibold text-[var(--cg-text)] transition-colors hover:bg-[var(--cg-hover)]"
            >
              {product.stock}
            </button>
          )}

          {isOutOfStock ? (
            <span
              data-testid={`stock-badge-paused-${product.id}`}
              className="inline-flex rounded-full bg-[var(--cg-surface-elevated)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cg-text-muted)]"
            >
              Pausado
            </span>
          ) : isLowStock ? (
            <span
              data-testid={`stock-badge-low-${product.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--cg-warning)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#92400E] dark:text-[#FBBF24]"
            >
              ⚠ Baixo
            </span>
          ) : null}
        </div>
      </td>

      {/* Ações sob clique discreto (gaveta completa / pausar / excluir) */}
      <td className={`${cellPad} pl-2 pr-4 text-right whitespace-nowrap`}>
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            data-testid={`catalog-toggle-active-${product.id}`}
            aria-label={`${isActive ? 'Pausar' : 'Reativar'} ${product.name}`}
            title={isActive ? 'Pausar na vitrine' : 'Ativar na vitrine'}
            onClick={() => onToggleActive(product)}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-secondary)] transition-colors hover:bg-[var(--cg-hover)]"
          >
            {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5 text-[var(--cg-success)]" />}
          </button>
          <button
            type="button"
            data-testid={`catalog-edit-btn-${product.id}`}
            aria-label={`Editar ${product.name}`}
            onClick={() => onEdit(product)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-3 text-xs font-semibold text-[var(--cg-text)] transition-colors hover:bg-[var(--cg-hover)]"
          >
            <Edit3 className="size-3.5" />
            Editar
          </button>
          <button
            type="button"
            aria-label={`Excluir ${product.name}`}
            onClick={() => onDelete(product)}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-muted)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-[#D94C4C]"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});

interface MobileProductCardProps {
  product: CatalogProduct;
  brandPrimaryColor: string;
  isSelected: boolean;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  onUploadPhoto: (product: CatalogProduct, file: File | null) => void;
  onToggleActive: (product: CatalogProduct) => void;
  onEdit: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}

const MobileProductCard = React.memo(function MobileProductCard({
  product,
  brandPrimaryColor,
  isSelected,
  onToggleSelect,
  onUploadPhoto,
  onToggleActive,
  onEdit,
  onDelete,
}: MobileProductCardProps) {
  const isActive = product.active !== false;
  const lowThreshold = Math.max(0, Number(product.lowStockThreshold ?? 3));
  const isOutOfStock = product.stock === 0;
  const isLowStock = product.stock > 0 && product.stock <= lowThreshold;
  const focalX = product.imageFocalPoint?.x ?? 50;
  const focalY = product.imageFocalPoint?.y ?? 50;

  const imgSrc = resolveProductImageUrl(
    product.imageUrl,
    product.name,
    product.category,
    brandPrimaryColor,
  );
  const hasCustomPhoto = Boolean(
    product.imageUrl && !product.imageUrl.startsWith('data:image/svg+xml'),
  );

  return (
    <article
      data-testid={`catalog-mobile-card-${product.id}`}
      className="rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Selecionar ${product.name}`}
          onClick={(e) => onToggleSelect(product.id, e.shiftKey)}
          className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)]"
        >
          {isSelected ? (
            <CheckSquare className="size-4 text-[var(--cg-primary)]" />
          ) : (
            <Square className="size-4 text-[var(--cg-text-muted)]" />
          )}
        </button>

        <label className="relative flex size-14 aspect-square shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-muted)]">
          {hasCustomPhoto ? (
            <img
              src={imgSrc}
              alt={product.name}
              style={{ objectPosition: `${focalX}% ${focalY}%` }}
              className="size-full object-cover"
            />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.target.value = '';
              onUploadPhoto(product, f);
            }}
          />
        </label>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--cg-text)]">{product.name}</p>
          <p className="text-xs text-[var(--cg-text-muted)]">
            {product.category || 'Geral'}
            {product.variation && product.variation !== 'Padrão' ? ` · ${product.variation}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="cg-tabular text-sm font-bold text-[var(--cg-text)]">
              {formatCurrencyBRL(product.priceCents)}
            </span>
            <span className="cg-tabular text-xs font-medium text-[var(--cg-text-secondary)]">
              · {product.stock} un.
            </span>
            {isOutOfStock ? (
              <span className="rounded-full bg-[var(--cg-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cg-text-muted)]">
                Pausado
              </span>
            ) : isLowStock ? (
              <span className="rounded-full bg-[var(--cg-warning)]/15 px-2 py-0.5 text-[10px] font-semibold text-[#92400E] dark:text-[#FBBF24]">
                ⚠ Baixo
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ActionButton
            variant="secondary"
            size={44}
            fullWidth
            leftIcon={<Edit3 className="size-4" />}
            onClick={() => onEdit(product)}
          >
            Editar Produto
          </ActionButton>
        </div>
        <button
          type="button"
          aria-label={`${isActive ? 'Pausar' : 'Ativar'} ${product.name}`}
          onClick={() => onToggleActive(product)}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)]"
        >
          {isActive ? <Pause className="size-4" /> : <Play className="size-4 text-[var(--cg-success)]" />}
        </button>
        <button
          type="button"
          aria-label={`Excluir ${product.name}`}
          onClick={() => onDelete(product)}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface)] text-[var(--cg-text-muted)] hover:bg-red-50 hover:text-[#D94C4C]"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </article>
  );
});

export function ProductCatalogTable({
  profile,
  revision: _revision,
  owner,
  runtimeStatus,
  isLoading = false,
  onProfileUpdated,
  onOpenCustomerPreview,
  onOpenSettings,
  onOpenWhatsApp,
  onOpenArchetypeComposer,
}: ProductCatalogTableProps) {
  const { showToast } = useToast();
  const phaseInfo = useConnectionPhaseInfo(profile, runtimeStatus);

  // Sub-tab, density & filters
  const [storeSubTab, setStoreSubTab] = React.useState<StoreSubTab>('catalogo');
  const [density, setDensity] = React.useState<CatalogDensity>(() => loadCatalogDensity());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('Todas');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'paused'>('all');

  // Optimistic, inline edit, batch & DnD states
  const [pendingDeletedIds, setPendingDeletedIds] = React.useState<Record<string, boolean>>({});
  const [optimisticProducts, setOptimisticProducts] = React.useState<CatalogProduct[] | null>(null);
  const [inlineEditing, setInlineEditing] = React.useState<{
    id: string;
    field: InlineEditField;
  } | null>(null);
  const [inlineDraft, setInlineDraft] = React.useState('');
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [batchCategoryOpen, setBatchCategoryOpen] = React.useState(false);
  const [batchCategoryInput, setBatchCategoryInput] = React.useState('');

  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [uploadingProductId, setUploadingProductId] = React.useState<string | null>(null);
  const [mobileInlinePreviewOpen, setMobileInlinePreviewOpen] = React.useState(false);

  const savedInlineTimerRef = React.useRef<number | null>(null);
  const inlineSaveDebounceRef = React.useRef<number | null>(null);
  const inlineIgnoreBlurRef = React.useRef(false);
  const pendingInlineUpdatesRef = React.useRef<
    Map<string, { updater: (p: CatalogProduct) => CatalogProduct; toastMessage: string }>
  >(new Map());
  const lastSelectedIdRef = React.useRef<string | null>(null);
  const copiedLinkTimerRef = React.useRef<number | null>(null);
  const zipRevokeTimerRef = React.useRef<number | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  React.useEffect(() => {
    setOptimisticProducts(null);
  }, [profile.catalog?.products]);

  React.useEffect(() => {
    return () => {
      if (savedInlineTimerRef.current !== null) {
        window.clearTimeout(savedInlineTimerRef.current);
      }
      if (inlineSaveDebounceRef.current !== null) {
        window.clearTimeout(inlineSaveDebounceRef.current);
      }
      if (copiedLinkTimerRef.current !== null) {
        window.clearTimeout(copiedLinkTimerRef.current);
      }
      if (zipRevokeTimerRef.current !== null) {
        window.clearTimeout(zipRevokeTimerRef.current);
      }
    };
  }, []);

  function handleChangeDensity(nextDensity: CatalogDensity) {
    setDensity(nextDensity);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(CATALOG_DENSITY_KEY, nextDensity);
      } catch {}
    }
  }

  // Drawers & Modals (ultra-simplificado)
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<CatalogProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogProduct | null>(null);
  const [batchModalOpen, setBatchModalOpen] = React.useState(false);
  const [universalXlsxOpen, setUniversalXlsxOpen] = React.useState(false);
  const [internalPreviewOpen, setInternalPreviewOpen] = React.useState(false);
  const [selectedProductIds, setSelectedProductIds] = React.useState<Set<string>>(new Set());
  const [batchImageModalOpen, setBatchImageModalOpen] = React.useState(false);
  const [catalogZoomItem, setCatalogZoomItem] = React.useState<{
    id: string;
    name: string;
    imageUrl: string;
  } | null>(null);

  // Publish modals (TELA 20 & TELA 21)
  const [publishing, setPublishing] = React.useState(false);
  const [publishBlockers, setPublishBlockers] = React.useState<PublishBlocker[]>([]);
  const [publishBlockModalOpen, setPublishBlockModalOpen] = React.useState(false);
  const [fixingPhotos, setFixingPhotos] = React.useState(false);
  const [publishedModalOpen, setPublishedModalOpen] = React.useState(false);

  // ZIP Export Modal
  const [zipModalOpen, setZipModalOpen] = React.useState(false);
  const [zipGenerating, setZipGenerating] = React.useState(false);
  const [zipProgress, setZipProgress] = React.useState(0);

  // Caixa única da IA para montar a vitrine composicional (Formula-IR v9.0)
  const [storePrompt, setStorePrompt] = React.useState<string>(
    () => profile.storeLayout?.storePrompt || '',
  );
  const [aiComposing, setAiComposing] = React.useState(false);
  const [inlinePreviewDevice, setInlinePreviewDevice] = React.useState<'desktop' | 'mobile'>('desktop');
  const [storeQrOpen, setStoreQrOpen] = React.useState(false);
  const [storeQrPng, setStoreQrPng] = React.useState('');
  const [storeQrLoading, setStoreQrLoading] = React.useState(false);

  React.useEffect(() => {
    if (profile.storeLayout?.storePrompt && !storePrompt) {
      setStorePrompt(profile.storeLayout.storePrompt);
    }
  }, [profile.storeLayout?.storePrompt]);

  const brandName = profile.business?.name?.trim() || 'Minha Loja';
  const brandPrimaryColor = profile.brand?.primaryColor || '#2563EB';
  const publicUrl = React.useMemo(() => buildStorePublicUrl(profile, owner), [profile, owner]);

  const handleOpenStoreQr = React.useCallback(async () => {
    setStoreQrOpen(true);
    if (storeQrPng) return;
    setStoreQrLoading(true);
    try {
      const res = await authenticatedFetch(
        '/api/store/qr-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUrl: publicUrl }),
        },
        owner,
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.pngDataUrl) {
        setStoreQrPng(String(json.pngDataUrl));
      }
    } catch {
      showToast({ type: 'error', message: 'Não foi possível gerar o QR Code da loja.' });
    } finally {
      setStoreQrLoading(false);
    }
  }, [owner, publicUrl, showToast, storeQrPng]);

  const baseProducts = optimisticProducts ?? profile.catalog?.products ?? [];

  const allProducts = React.useMemo(
    () => baseProducts.filter((p) => !pendingDeletedIds[p.id]),
    [baseProducts, pendingDeletedIds],
  );

  const activeProducts = React.useMemo(
    () => allProducts.filter((p) => p.active !== false),
    [allProducts],
  );

  const formulaV9SectionsCount = React.useMemo(
    () => ensureFormulaV9(profile).sections.length,
    [profile],
  );
  const [savedInlineId, setSavedInlineId] = React.useState<string | null>(null);
  const markInlineSaved = React.useCallback((id: string) => {
    setSavedInlineId(id);
    if (savedInlineTimerRef.current !== null) {
      window.clearTimeout(savedInlineTimerRef.current);
    }
    savedInlineTimerRef.current = window.setTimeout(() => {
      savedInlineTimerRef.current = null;
      setSavedInlineId((curr) => (curr === id ? null : curr));
    }, 1800);
  }, []);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      set.add((p.category || 'Geral').trim() || 'Geral');
    }
    return [...set];
  }, [allProducts]);

  const filteredProducts = React.useMemo(() => {
    return allProducts.filter((p) => {
      const cat = (p.category || 'Geral').trim() || 'Geral';
      if (categoryFilter !== 'Todas' && cat !== categoryFilter) return false;
      if (statusFilter === 'active' && p.active === false) return false;
      if (statusFilter === 'paused' && p.active !== false) return false;
      return matchesProductQuery(p, searchQuery);
    });
  }, [allProducts, searchQuery, categoryFilter, statusFilter]);

  const isFiltered =
    searchQuery.trim().length > 0 || categoryFilter !== 'Todas' || statusFilter !== 'all';
  const canReorder = !isFiltered && allProducts.length > 1;
  const draggingProduct = React.useMemo(
    () => (activeDragId ? allProducts.find((p) => p.id === activeDragId) || null : null),
    [activeDragId, allProducts],
  );

  async function handleGenerateStoreWithAi() {
    if (aiComposing) return;
    const promptToUse =
      storePrompt.trim() ||
      profile.business?.experienceGoal?.trim() ||
      profile.business?.description?.trim() ||
      `Vitrine exclusiva para ${brandName}`;

    setAiComposing(true);
    try {
      // 1. Persiste o novo objetivo/prompt digitado no perfil (preservando todo catálogo e uploads 0 cr)
      const savedSnap = await updateBusinessProfile(
        (draft) => {
          draft.business = {
            ...draft.business,
            experienceGoal: promptToUse,
            description: draft.business?.description?.trim() ? draft.business.description : promptToUse,
          };
          draft.storeLayout = {
            ...(draft.storeLayout || {}),
            storePrompt: promptToUse,
            updatedAt: new Date().toISOString(),
          };
        },
        undefined,
        owner,
      );

      // 2. Executa o motor oficial Formula-IR v9.0 (GLM-5.3 + RunPod WebP até 5 imagens)
      const res = await authenticatedFetch(
        '/api/store-molde/generate-full',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: savedSnap.profile,
            prompt: promptToUse,
            forceRegenerate: true,
            useGlm: true,
            generateImages: true,
            maxImages: 5,
          }),
        },
        owner,
      );

      const data = await res.json().catch(() => null);
      if (res.status === 402) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('companygen:insufficient-credits', {
              detail: data || { required: 30, balance: 0 },
            }),
          );
        }
        return;
      }

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Não foi possível gerar a vitrine com IA agora.');
      }

      const freshSnap = await loadBusinessProfile(owner);
      onProfileUpdated?.(freshSnap);

      const imagesCount = Array.isArray(data.imageJobs)
        ? data.imageJobs.filter((j: { status?: string }) => j.status === 'completed').length
        : 0;
      const sectionsCount = Array.isArray(data.formulasIr?.sections)
        ? data.formulasIr.sections.length
        : 0;

      showToast({
        type: 'success',
        message: `Vitrine v9.0 gerada com ${sectionsCount} seções e ${imagesCount} imagem(ns) WebP (-30 cr)!`,
        durationMs: 3600,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível gerar a vitrine agora.',
      });
    } finally {
      setAiComposing(false);
    }
  }

  const handleQuickUploadProductPhoto = React.useCallback(async (product: CatalogProduct, file: File | null) => {
    if (!file) return;
    setUploadingProductId(product.id);
    try {
      const optimized = await validateAndOptimizeImageFile(file, {
        maxDimension: 1200,
        quality: 0.82,
        minRecommendedPx: 500,
      });
      const snap = await updateBusinessProfile(
        (draft) => {
          const target = draft.catalog?.products?.find((p) => p.id === product.id);
          if (target) {
            target.imageUrl = optimized.dataUrl;
            target.imageLowRes = optimized.lowResolution;
            target.approvedAsset = true;
            target.updatedAt = new Date().toISOString();
          }
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      markInlineSaved(product.id);
      showToast({
        type: optimized.lowResolution ? 'amber' : 'success',
        message: optimized.lowResolution
          ? `Foto de "${product.name}" salva (${optimized.originalWidth}×${optimized.originalHeight}px — resolução baixa).`
          : `Foto de "${product.name}" atualizada!`,
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Formato de imagem inválido ou não permitido. Envie JPG, PNG ou WebP real.',
      });
    } finally {
      setUploadingProductId(null);
    }
  }, [markInlineSaved, onProfileUpdated, owner, showToast]);

  async function handleUploadBrandAsset(slot: string, file: File) {
    try {
      const optimized = await validateAndOptimizeImageFile(file, {
        maxDimension: slot === 'logoUrl' ? 512 : 1400,
        quality: 0.84,
      });
      const dataUrl = optimized.dataUrl;
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.brand = {
            instagram: draft.brand?.instagram || '',
            logoUrl: draft.brand?.logoUrl || '',
            storefrontPhotoUrl: draft.brand?.storefrontPhotoUrl || '',
            heroImageUrl: draft.brand?.heroImageUrl || '',
            heroBackgroundUrl: draft.brand?.heroBackgroundUrl || '',
            pageBackgroundUrl: draft.brand?.pageBackgroundUrl || '',
            sectionBackgrounds: { ...(draft.brand?.sectionBackgrounds || {}) },
            primaryColor: draft.brand?.primaryColor || '#111827',
            accentColor: draft.brand?.accentColor || '#10b981',
            fontStyle: draft.brand?.fontStyle || 'modern_sans',
            generateAiLogo: Boolean(draft.brand?.generateAiLogo),
            themePreset: draft.brand?.themePreset || 'minimal-luxury',
          };
          if (slot === 'logoUrl') draft.brand.logoUrl = dataUrl;
          else if (slot === 'heroImageUrl') draft.brand.heroImageUrl = dataUrl;
          else if (slot === 'heroBackgroundUrl') draft.brand.heroBackgroundUrl = dataUrl;
          else if (slot === 'pageBackgroundUrl') draft.brand.pageBackgroundUrl = dataUrl;
          else if (slot.startsWith('section:')) {
            draft.brand.sectionBackgrounds[slot.slice('section:'.length)] = dataUrl;
          }
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: 'Imagem aplicada na vitrine e pronta para o ZIP!',
        durationMs: 2600,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao enviar imagem da vitrine.',
      });
    }
  }

  const startInlineEdit = React.useCallback((field: InlineEditField, product: CatalogProduct) => {
    inlineIgnoreBlurRef.current = false;
    setInlineEditing({ id: product.id, field });
    setInlineDraft(
      field === 'price'
        ? formatCentsForInput(product.priceCents)
        : String(Number.isFinite(product.stock) ? product.stock : 0),
    );
  }, []);

  const cancelInlineEdit = React.useCallback(() => {
    inlineIgnoreBlurRef.current = true;
    setInlineEditing(null);
    setInlineDraft('');
  }, []);

  const flushPendingInlineMutations = React.useCallback(
    async (previousListSnapshot: CatalogProduct[]) => {
      const pendingEntries = Array.from(pendingInlineUpdatesRef.current.entries());
      pendingInlineUpdatesRef.current.clear();
      if (pendingEntries.length === 0) return;
      const updatesById = new Map(pendingEntries.map(([id, entry]) => [id, entry.updater]));
      const toastMsg =
        pendingEntries.length === 1
          ? pendingEntries[0][1].toastMessage
          : `${pendingEntries.length} alterações do catálogo salvas!`;

      try {
        const snap = await updateBusinessProfile(
          (draft) => {
            const list = draft.catalog?.products ?? [];
            draft.catalog = {
              ...draft.catalog,
              products: list.map((p) => {
                const fn = updatesById.get(p.id);
                return fn ? fn(p) : p;
              }),
            };
          },
          undefined,
          owner,
        );
        onProfileUpdated?.(snap);
        for (const [id] of pendingEntries) {
          markInlineSaved(id);
        }
        showToast({ type: 'success', message: toastMsg, durationMs: 2200 });
      } catch (err) {
        setOptimisticProducts(previousListSnapshot);
        showToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Falha ao salvar alteração. Valor restaurado.',
        });
      }
    },
    [markInlineSaved, onProfileUpdated, owner, showToast],
  );

  const scheduleInlineProductUpdate = React.useCallback(
    (
      productId: string,
      updater: (p: CatalogProduct) => CatalogProduct,
      optimisticUpdatedList: CatalogProduct[],
      toastMessage: string,
      previousSnapshot: CatalogProduct[],
    ) => {
      const existing = pendingInlineUpdatesRef.current.get(productId);
      const composedUpdater = existing
        ? (p: CatalogProduct) => updater(existing.updater(p))
        : updater;
      pendingInlineUpdatesRef.current.set(productId, {
        updater: composedUpdater,
        toastMessage,
      });
      setOptimisticProducts(optimisticUpdatedList);
      if (inlineSaveDebounceRef.current !== null) {
        window.clearTimeout(inlineSaveDebounceRef.current);
      }
      inlineSaveDebounceRef.current = window.setTimeout(() => {
        inlineSaveDebounceRef.current = null;
        void flushPendingInlineMutations(previousSnapshot);
      }, 300);
    },
    [flushPendingInlineMutations],
  );

  const commitInlineEdit = React.useCallback(
    (fromBlur = false) => {
      if (fromBlur && inlineIgnoreBlurRef.current) {
        inlineIgnoreBlurRef.current = false;
        return;
      }
      if (!fromBlur) {
        inlineIgnoreBlurRef.current = true;
      }
      if (!inlineEditing) return;

      const { id, field } = inlineEditing;
      const target = allProducts.find((p) => p.id === id);
      const rawDraft = inlineDraft.trim();
      setInlineEditing(null);
      setInlineDraft('');
      if (!target) return;

      const previousSnapshot = baseProducts;

      if (field === 'price') {
        const nextCents = parseBRLInputToCents(rawDraft);
        if (!rawDraft || nextCents <= 0 || rawDraft.startsWith('-')) {
          showToast({
            type: 'error',
            message: 'Preço inválido. Informe um valor maior que R$ 0,00.',
          });
          return;
        }
        if (nextCents === target.priceCents) return;

        const nowIso = new Date().toISOString();
        const updatedList = baseProducts.map((p) =>
          p.id === id ? { ...p, priceCents: nextCents, updatedAt: nowIso } : p,
        );
        scheduleInlineProductUpdate(
          id,
          (p) => ({ ...p, priceCents: nextCents, updatedAt: nowIso }),
          updatedList,
          `Preço de "${target.name}" atualizado para ${formatCurrencyBRL(nextCents)}.`,
          previousSnapshot,
        );
        return;
      }

      if (!/^\d+$/.test(rawDraft)) {
        showToast({
          type: 'error',
          message: 'Estoque inválido. Informe um número inteiro igual ou maior que zero.',
        });
        return;
      }
      const nextStock = Math.max(0, Number.parseInt(rawDraft, 10));
      if (nextStock === target.stock) return;
      const autoPaused = nextStock === 0;
      const nextActive = autoPaused ? false : target.autoPausedOutOfStock ? true : target.active;
      const nowIso = new Date().toISOString();

      const updatedList = baseProducts.map((p) =>
        p.id === id
          ? {
              ...p,
              stock: nextStock,
              active: nextActive,
              autoPausedOutOfStock: autoPaused,
              updatedAt: nowIso,
            }
          : p,
      );
      scheduleInlineProductUpdate(
        id,
        (p) => ({
          ...p,
          stock: nextStock,
          active: autoPaused ? false : p.autoPausedOutOfStock ? true : p.active,
          autoPausedOutOfStock: autoPaused,
          updatedAt: nowIso,
        }),
        updatedList,
        autoPaused
          ? `"${target.name}" zerou o estoque e foi pausado na vitrine.`
          : `Estoque de "${target.name}" atualizado para ${nextStock}.`,
        previousSnapshot,
      );
    },
    [allProducts, baseProducts, inlineDraft, inlineEditing, scheduleInlineProductUpdate, showToast],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = baseProducts.findIndex((p) => p.id === String(active.id));
    const toIdx = baseProducts.findIndex((p) => p.id === String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;

    const previous = baseProducts;
    const reordered = reorderList(baseProducts, fromIdx, toIdx);
    setOptimisticProducts(reordered);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.catalog = { ...draft.catalog, products: reordered };
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: 'Ordem da vitrine salva!',
        durationMs: 2000,
      });
    } catch {
      setOptimisticProducts(previous);
      showToast({
        type: 'error',
        message: 'Não foi possível salvar a nova ordem agora.',
      });
    }
  }

  async function handleUniversalImportProducts(incoming: CatalogProduct[]) {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const snap = await updateBusinessProfile(
      (target) => {
        const existing = [...(target.catalog?.products ?? [])];
        let nextSeq = existing.length + 101;
        const now = new Date().toISOString();
        for (const item of incoming) {
          const cleanName = item.name?.trim() || 'Produto';
          const cleanCat = item.category?.trim() || 'Geral';
          const itemType: CatalogItemType = item.itemType || 'produto_fisico';
          const safeImageUrl = item.imageUrl?.trim()
            ? item.imageUrl.trim()
            : buildProductPlaceholderDataUri(cleanName, cleanCat, brandPrimaryColor);
          const draftItem: CatalogProduct = {
            id: item.id?.trim() || `prod_${Date.now()}_${nextSeq}`,
            sku: item.sku?.trim() || `SKU-${nextSeq++}`,
            name: cleanName,
            category: cleanCat,
            itemType,
            description: item.description?.trim() || `${cleanName} — ${cleanCat}`,
            priceCents: Math.max(0, Math.round(Number(item.priceCents) || 0)),
            variation: item.variation?.trim() || 'Padrão',
            stock: Math.max(0, Math.round(Number(item.stock) || 0)),
            prazoOuDuracao: item.prazoOuDuracao?.trim() || '',
            itensInclusosKit: Array.isArray(item.itensInclusosKit) ? item.itensInclusosKit : [],
            mensagemMolde:
              item.mensagemMolde?.trim() ||
              buildDefaultMensagemMolde(
                {
                  name: cleanName,
                  variation: item.variation?.trim() || 'Padrão',
                  priceCents: Math.max(0, Math.round(Number(item.priceCents) || 0)),
                  itemType,
                  prazoOuDuracao: item.prazoOuDuracao?.trim() || '',
                },
                brandName,
              ),
            imageUrl: safeImageUrl,
            approvedAsset: true,
            active: item.active !== false,
            updatedAt: now,
          };

          const matchIdx = existing.findIndex(
            (p) =>
              (item.sku && p.sku?.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
              p.name.trim().toLowerCase() === cleanName.toLowerCase(),
          );
          if (matchIdx >= 0) {
            existing[matchIdx] = {
              ...existing[matchIdx],
              ...draftItem,
              id: existing[matchIdx].id,
              imageUrl: existing[matchIdx].imageUrl?.trim() ? existing[matchIdx].imageUrl : safeImageUrl,
            };
          } else {
            existing.push(draftItem);
          }
        }
        target.catalog = { ...target.catalog, products: existing };
      },
      undefined,
      owner,
    );
    onProfileUpdated?.(snap);
    showToast({
      type: 'success',
      message: `${incoming.length} item(ns) importado(s) e analisado(s) com mensagem molde pronta!`,
      durationMs: 3500,
    });
  }

  const handleApplyBatchImages = async (
    updates: Array<{ productId: string; imageUrl: string }>,
  ) => {
    const updateMap = new Map(updates.map((u) => [u.productId, u.imageUrl]));
    const snap = await updateBusinessProfile(
      (target) => {
        const list = target.catalog?.products || [];
        target.catalog = {
          ...target.catalog,
          products: list.map((p) => {
            const nextImg = updateMap.get(p.id);
            if (nextImg) {
              return { ...p, imageUrl: nextImg, approvedAsset: true, updatedAt: new Date().toISOString() };
            }
            return p;
          }),
        };
      },
      undefined,
      owner,
    );
    onProfileUpdated?.(snap);
    setSelectedProductIds(new Set());
  };

  const toggleSelectProduct = React.useCallback(
    (id: string, shiftKey = false) => {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedIdRef.current) {
          const orderedIds = filteredProducts.map((p) => p.id);
          const startIdx = orderedIds.indexOf(lastSelectedIdRef.current);
          const endIdx = orderedIds.indexOf(id);
          if (startIdx >= 0 && endIdx >= 0) {
            const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = lo; i <= hi; i += 1) {
              next.add(orderedIds[i]);
            }
            lastSelectedIdRef.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastSelectedIdRef.current = id;
        return next;
      });
    },
    [filteredProducts],
  );

  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
      lastSelectedIdRef.current = null;
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
      lastSelectedIdRef.current = filteredProducts[filteredProducts.length - 1]?.id ?? null;
    }
  };

  async function handleBatchToggleActive(nextActive: boolean) {
    const ids = new Set(selectedProductIds);
    if (ids.size === 0) return;
    const prevSnapshot = baseProducts;
    const prevActiveMap = new Map(baseProducts.map((p) => [p.id, p.active !== false]));
    const updated = baseProducts.map((p) =>
      ids.has(p.id)
        ? {
            ...p,
            active: nextActive,
            autoPausedOutOfStock: nextActive && p.stock === 0 ? true : false,
            updatedAt: new Date().toISOString(),
          }
        : p,
    );
    setOptimisticProducts(updated);
    setSelectedProductIds(new Set());
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.catalog = {
            ...draft.catalog,
            products: (draft.catalog?.products ?? []).map((p) =>
              ids.has(p.id)
                ? {
                    ...p,
                    active: nextActive,
                    autoPausedOutOfStock: nextActive && p.stock === 0 ? true : false,
                    updatedAt: new Date().toISOString(),
                  }
                : p,
            ),
          };
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'amber',
        message: nextActive
          ? `${ids.size} produto(s) reativado(s) na vitrine.`
          : `${ids.size} produto(s) pausado(s) na vitrine.`,
        durationMs: 5000,
        actionLabel: 'Desfazer',
        onUndo: () => {
          setOptimisticProducts(prevSnapshot);
          void updateBusinessProfile(
            (draft) => {
              draft.catalog = {
                ...draft.catalog,
                products: (draft.catalog?.products ?? []).map((p) =>
                  prevActiveMap.has(p.id)
                    ? { ...p, active: prevActiveMap.get(p.id)!, updatedAt: new Date().toISOString() }
                    : p,
                ),
              };
            },
            undefined,
            owner,
          ).then((restored) => onProfileUpdated?.(restored));
        },
      });
    } catch {
      setOptimisticProducts(prevSnapshot);
      showToast({ type: 'error', message: 'Não foi possível atualizar os itens selecionados.' });
    }
  }

  async function handleBatchApplyCategory(rawCategory: string) {
    const cleanCat = rawCategory.trim();
    const ids = new Set(selectedProductIds);
    if (!cleanCat || ids.size === 0) return;
    const prevSnapshot = baseProducts;
    const updated = baseProducts.map((p) =>
      ids.has(p.id) ? { ...p, category: cleanCat, updatedAt: new Date().toISOString() } : p,
    );
    setOptimisticProducts(updated);
    setBatchCategoryOpen(false);
    setBatchCategoryInput('');
    setSelectedProductIds(new Set());
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.catalog = {
            ...draft.catalog,
            products: (draft.catalog?.products ?? []).map((p) =>
              ids.has(p.id) ? { ...p, category: cleanCat, updatedAt: new Date().toISOString() } : p,
            ),
          };
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: `Categoria "${cleanCat}" aplicada a ${ids.size} item(ns)!`,
        durationMs: 2800,
      });
    } catch {
      setOptimisticProducts(prevSnapshot);
      showToast({ type: 'error', message: 'Erro ao trocar categoria em lote.' });
    }
  }

  function handleBatchArchive() {
    const ids = [...selectedProductIds];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setPendingDeletedIds((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
    setSelectedProductIds(new Set());
    setBatchCategoryOpen(false);

    showToast({
      type: 'amber',
      message: `${ids.length} item(ns) arquivado(s) do catálogo.`,
      durationMs: 5000,
      actionLabel: 'Desfazer',
      onUndo: () => {
        setPendingDeletedIds((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
        showToast({
          type: 'neutral',
          message: `Arquivamento cancelado. ${ids.length} item(ns) restaurado(s).`,
          durationMs: 2200,
        });
      },
      onExpire: async () => {
        try {
          const snap = await updateBusinessProfile(
            (draft) => {
              draft.catalog = {
                ...draft.catalog,
                products: (draft.catalog?.products ?? []).filter((p) => !idSet.has(p.id)),
              };
            },
            undefined,
            owner,
          );
          setPendingDeletedIds((prev) => {
            const next = { ...prev };
            for (const id of ids) delete next[id];
            return next;
          });
          onProfileUpdated?.(snap);
        } catch {
          setPendingDeletedIds((prev) => {
            const next = { ...prev };
            for (const id of ids) delete next[id];
            return next;
          });
          showToast({ type: 'error', message: 'Falha ao arquivar itens. Itens restaurados.' });
        }
      },
    });
  }

  async function handleCopyStoreLink() {
    const ok = await copyTextToClipboard(publicUrl);
    if (ok) {
      setCopiedLink(true);
      showToast({
        type: 'success',
        message: 'Link da vitrine copiado!',
        durationMs: 2500,
      });
      if (copiedLinkTimerRef.current !== null) {
        window.clearTimeout(copiedLinkTimerRef.current);
      }
      copiedLinkTimerRef.current = window.setTimeout(() => {
        copiedLinkTimerRef.current = null;
        setCopiedLink(false);
      }, 2500);
    }
  }

  function handleOpenNewProduct() {
    setEditingProduct(null);
    setEditorOpen(true);
  }

  const handleOpenEditProduct = React.useCallback((product: CatalogProduct) => {
    setEditingProduct(product);
    setEditorOpen(true);
  }, []);

  function handleOpenPreview() {
    if (onOpenCustomerPreview) {
      onOpenCustomerPreview();
    } else {
      setInternalPreviewOpen(true);
    }
  }

  const handleToggleActive = React.useCallback(async (product: CatalogProduct) => {
    if (togglingId) return;
    const nextActive = product.active === false;
    setTogglingId(product.id);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          const target = draft.catalog?.products?.find((p) => p.id === product.id);
          if (target) {
            target.active = nextActive;
            target.updatedAt = new Date().toISOString();
          }
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: nextActive
          ? `"${product.name}" voltou para a vitrine.`
          : `"${product.name}" foi pausado na vitrine.`,
        durationMs: 2500,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível atualizar o status do produto.',
      });
    } finally {
      setTogglingId(null);
    }
  }, [onProfileUpdated, owner, showToast, togglingId]);

  function handleConfirmDelete(product: CatalogProduct) {
    setDeleteTarget(null);
    setPendingDeletedIds((prev) => ({ ...prev, [product.id]: true }));

    showToast({
      type: 'amber',
      message: `"${product.name}" removido do catálogo.`,
      durationMs: 5000,
      actionLabel: 'Desfazer',
      onUndo: () => {
        setPendingDeletedIds((prev) => {
          const next = { ...prev };
          delete next[product.id];
          return next;
        });
        showToast({
          type: 'neutral',
          message: `Exclusão cancelada. "${product.name}" foi mantido.`,
          durationMs: 2200,
        });
      },
      onExpire: async () => {
        try {
          const snap = await updateBusinessProfile(
            (draft) => {
              draft.catalog = {
                ...draft.catalog,
                products: (draft.catalog?.products ?? []).filter((p) => p.id !== product.id),
              };
            },
            undefined,
            owner,
          );
          setPendingDeletedIds((prev) => {
            const next = { ...prev };
            delete next[product.id];
            return next;
          });
          onProfileUpdated?.(snap);
        } catch (err) {
          setPendingDeletedIds((prev) => {
            const next = { ...prev };
            delete next[product.id];
            return next;
          });
          showToast({
            type: 'error',
            message: err instanceof Error ? err.message : 'Falha ao remover produto. Item restaurado.',
          });
        }
      },
    });
  }

  async function executePublish() {
    setPublishing(true);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.publishedStore = {
            ...draft.publishedStore,
            published: true,
          };
        },
        { publish: true },
        owner,
      );
      onProfileUpdated?.(snap);
      setPublishedModalOpen(true);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível publicar a loja agora.',
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handlePublishClick() {
    const blockers = getPublishBlockers(profile);
    if (blockers.length > 0) {
      setPublishBlockers(blockers);
      setPublishBlockModalOpen(true);
      return;
    }
    await executePublish();
  }

  async function handleAutoFixMissingPhotos() {
    setFixingPhotos(true);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.catalog = {
            ...draft.catalog,
            products: (draft.catalog?.products ?? []).map((p) => {
              if (p.active !== false && (!p.imageUrl || !p.approvedAsset)) {
                return {
                  ...p,
                  imageUrl:
                    p.imageUrl ||
                    buildProductPlaceholderDataUri(p.name, p.category || 'Geral', brandPrimaryColor),
                  approvedAsset: true,
                  updatedAt: new Date().toISOString(),
                };
              }
              return p;
            }),
          };
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      const remaining = getPublishBlockers(snap.profile);
      if (remaining.length === 0) {
        setPublishBlockModalOpen(false);
        await executePublish();
      } else {
        setPublishBlockers(remaining);
      }
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível aplicar as capas padrão.',
      });
    } finally {
      setFixingPhotos(false);
    }
  }

  function handleResolveBlocker(blocker: PublishBlocker) {
    if (blocker.id === 'whatsapp') {
      if (onOpenSettings) onOpenSettings();
      else if (onOpenWhatsApp) onOpenWhatsApp();
      return;
    }
    if (blocker.id === 'empty_catalog') {
      handleOpenNewProduct();
      return;
    }
    if (blocker.id === 'invalid_price' && blocker.productIds?.[0]) {
      const prod = allProducts.find((p) => p.id === blocker.productIds?.[0]);
      if (prod) handleOpenEditProduct(prod);
    }
  }

  async function handleBatchPriceApply(mode: 'increase' | 'decrease', percent: number) {
    const factor = mode === 'increase' ? 1 + percent / 100 : 1 - percent / 100;
    const snap = await updateBusinessProfile(
      (draft) => {
        draft.catalog = {
          ...draft.catalog,
          products: (draft.catalog?.products ?? []).map((p) => ({
            ...p,
            priceCents: Math.max(1, Math.round(p.priceCents * factor)),
            updatedAt: new Date().toISOString(),
          })),
        };
      },
      undefined,
      owner,
    );
    onProfileUpdated?.(snap);
    showToast({
      type: 'success',
      message: `Preços de ${snap.profile.catalog.products.length} produtos reajustados com sucesso!`,
      durationMs: 3000,
    });
  }

  async function handleDownloadZip() {
    if (zipGenerating) return;
    setZipGenerating(true);
    setZipProgress(10);
    try {
      const { blob, filename, fileCount } = await buildFaithfulStorefrontZip({
        profile,
        runtimeStatus,
        owner,
        onProgress: setZipProgress,
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (zipRevokeTimerRef.current !== null) {
        window.clearTimeout(zipRevokeTimerRef.current);
      }
      zipRevokeTimerRef.current = window.setTimeout(() => {
        zipRevokeTimerRef.current = null;
        URL.revokeObjectURL(url);
      }, 4000);

      showToast({
        type: 'success',
        message: `Pacote fiel "${filename}" (${fileCount} arquivos + assets) baixado com sucesso!`,
        durationMs: 3400,
      });
      setZipModalOpen(false);
    } catch {
      showToast({
        type: 'error',
        message: 'Não foi possível gerar o pacote ZIP da loja. Tente novamente.',
      });
    } finally {
      setZipGenerating(false);
      setZipProgress(0);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Cabeçalho Consolidado & Navegação por Sub-abas de Minha Loja */}
      <section
        aria-label="Painel da Minha Loja"
        className="rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-5 shadow-xs sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[var(--cg-hover)] text-[var(--cg-primary)]">
                <StoreIcon className="size-5" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[var(--cg-text)] sm:text-2xl">
                {brandName}
              </h1>
              {profile.publishedStore?.published ? (
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-[#24A677] transition-colors hover:bg-emerald-100"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Vitrine Online
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--cg-text-secondary)]">
                  Rascunho
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  PHASE_BADGE_CLASS[phaseInfo.phase] || PHASE_BADGE_CLASS.DISCONNECTED
                }`}
              >
                {phaseInfo.labelPT}
              </span>
            </div>

            <p className="text-sm text-[var(--cg-text-secondary)]">
              Catálogo com edição inline, regras de frete, divulgação via QR Code &amp; cupons e vitrine ao vivo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant={copiedLink ? 'success' : 'softBlue'}
              size={44}
              leftIcon={copiedLink ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void handleCopyStoreLink()}
            >
              {copiedLink ? 'Copiado!' : 'Copiar Link'}
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              data-testid="open-store-preview-topbar-btn"
              leftIcon={<Eye className="size-4" />}
              onClick={handleOpenPreview}
            >
              Ver Vitrine
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              data-testid="open-zip-modal-btn"
              leftIcon={<DownloadCloud className="size-4 text-[#24A677]" />}
              onClick={() => setZipModalOpen(true)}
            >
              Baixar ZIP
            </ActionButton>
            {!profile.publishedStore?.published ? (
              <ActionButton
                variant="success"
                size={44}
                isLoading={publishing}
                loadingText="Publicando..."
                leftIcon={<Rocket className="size-4" />}
                onClick={() => void handlePublishClick()}
              >
                Publicar Loja
              </ActionButton>
            ) : null}
          </div>
        </div>

        {/* Sub-abas Estritas: Catálogo · Estúdio Visual · Divulgação & QRs */}
        <nav
          data-testid="minha-loja-subtabs"
          aria-label="Sub-abas de Minha Loja"
          className="flex flex-wrap items-center gap-2 border-t border-[var(--cg-border)] pt-4"
        >
          <button
            type="button"
            data-testid="store-subtab-catalogo"
            aria-current={storeSubTab === 'catalogo' ? 'page' : undefined}
            onClick={() => setStoreSubTab('catalogo')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
              storeSubTab === 'catalogo'
                ? 'bg-[var(--cg-primary)] text-white shadow-xs'
                : 'border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)] hover:text-[var(--cg-text)]'
            }`}
          >
            <Package className="size-4" aria-hidden="true" />
            <span>Catálogo ({allProducts.length})</span>
          </button>

          <button
            type="button"
            data-testid="store-subtab-estudio"
            aria-current={storeSubTab === 'estudio' ? 'page' : undefined}
            onClick={() => setStoreSubTab('estudio')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
              storeSubTab === 'estudio'
                ? 'bg-[var(--cg-primary)] text-white shadow-xs'
                : 'border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)] hover:text-[var(--cg-text)]'
            }`}
          >
            <Palette className="size-4" aria-hidden="true" />
            <span>Estúdio Visual</span>
          </button>

          <button
            type="button"
            data-testid="store-subtab-divulgacao"
            aria-current={storeSubTab === 'divulgacao' ? 'page' : undefined}
            onClick={() => setStoreSubTab('divulgacao')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
              storeSubTab === 'divulgacao'
                ? 'bg-[var(--cg-primary)] text-white shadow-xs'
                : 'border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)] hover:text-[var(--cg-text)]'
            }`}
          >
            <Megaphone className="size-4" aria-hidden="true" />
            <span>Divulgação &amp; QRs</span>
          </button>
        </nav>
      </section>

      {storeSubTab === 'estudio' ? (
        <div className="space-y-5">
          <section
            data-testid="minha-loja-ai-studio"
            className="rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-5 space-y-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label
                  htmlFor="minha-loja-ai-prompt-input"
                  className="flex items-center gap-2 text-base font-bold text-[var(--cg-text)]"
                >
                  <Wand2 className="size-4 text-[var(--cg-primary)]" aria-hidden="true" />
                  O que você quer criar na sua loja?
                </label>
                <p className="mt-0.5 text-xs text-[var(--cg-text-secondary)]">
                  Descreva sua empresa, estilo e experiência desejada. A IA monta os blocos e o catálogo ao vivo abaixo.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onOpenArchetypeComposer ? (
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="open-visual-editor-btn"
                    leftIcon={<LayoutGrid className="size-4 text-[var(--cg-primary)]" />}
                    onClick={onOpenArchetypeComposer}
                  >
                    Editor Visual &amp; Widgets
                  </ActionButton>
                ) : null}
                <ActionButton
                  variant="secondary"
                  size={44}
                  data-testid="open-store-qr-btn"
                  leftIcon={<QrCode className="size-4 text-[var(--cg-primary)]" />}
                  onClick={() => void handleOpenStoreQr()}
                >
                  QR Code Rápido
                </ActionButton>
              </div>
            </div>

            <textarea
              id="minha-loja-ai-prompt-input"
              data-testid="minha-loja-ai-prompt-input"
              rows={4}
              value={storePrompt}
              onChange={(e) => setStorePrompt(e.target.value)}
              placeholder="Ex: Quero uma loja moderna de chocolates artesanais onde o cliente monta a própria caixa de 9 doces e fecha direto no WhatsApp..."
              className="min-h-[120px] w-full rounded-2xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-4 py-3 text-sm leading-relaxed text-[var(--cg-text)] shadow-xs focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
            />

            <div className="flex flex-wrap items-center justify-end gap-3">
              <ActionButton
                variant="primary"
                size={44}
                data-testid="minha-loja-ai-generate-btn"
                isLoading={aiComposing}
                loadingText="Criando vitrine com IA..."
                leftIcon={<Sparkles className="size-4" />}
                onClick={() => void handleGenerateStoreWithAi()}
              >
                Gerar Vitrine com IA (-30 cr)
              </ActionButton>
            </div>
          </section>

          <section
            data-testid="minha-loja-inline-preview"
            className="overflow-hidden rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cg-border)] bg-[var(--cg-surface)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="text-xs font-bold text-[var(--cg-text)]">Preview da Loja ao Vivo</span>
                <span className="hidden truncate text-[11px] text-[var(--cg-text-muted)] sm:inline">
                  ({activeProducts.length} itens · {formulaV9SectionsCount} seções{savedInlineId ? ' · Salvo ✓' : ''})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMobileInlinePreviewOpen((v) => !v)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-xs font-semibold text-[var(--cg-text)] md:hidden"
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  <span>{mobileInlinePreviewOpen ? 'Ocultar Preview' : 'Mostrar Preview'}</span>
                </button>

                <div className="hidden rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] p-0.5 md:inline-flex">
                  <button
                    type="button"
                    onClick={() => setInlinePreviewDevice('desktop')}
                    aria-label="Preview desktop"
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      inlinePreviewDevice === 'desktop'
                        ? 'bg-[var(--cg-surface)] text-[var(--cg-text)] shadow-xs'
                        : 'text-[var(--cg-text-secondary)] hover:text-[var(--cg-text)]'
                    }`}
                  >
                    <Monitor className="size-3.5" aria-hidden="true" />
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlinePreviewDevice('mobile')}
                    aria-label="Preview mobile"
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      inlinePreviewDevice === 'mobile'
                        ? 'bg-[var(--cg-surface)] text-[var(--cg-text)] shadow-xs'
                        : 'text-[var(--cg-text-secondary)] hover:text-[var(--cg-text)]'
                    }`}
                  >
                    <Smartphone className="size-3.5" aria-hidden="true" />
                    Mobile
                  </button>
                </div>

                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<Eye className="size-3.5" />}
                  onClick={handleOpenPreview}
                >
                  Tela Cheia
                </ActionButton>
              </div>
            </div>

            <div className={`${mobileInlinePreviewOpen ? 'flex' : 'hidden md:flex'} justify-center p-3 sm:p-4`}>
              <div
                className={`cg-light-preview h-[560px] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm transition-all ${
                  inlinePreviewDevice === 'mobile' ? 'max-w-[390px] rounded-[28px]' : 'max-w-full'
                }`}
              >
                <CustomerStorefrontView
                  profile={profile}
                  ownerId={owner || 'default'}
                  mode="preview"
                  hidePreviewBanner={true}
                  runtimeStatus={runtimeStatus}
                  onBackToAdmin={handleOpenPreview}
                  onUploadBrandAsset={handleUploadBrandAsset}
                  onUploadProductImage={(productId, file) => {
                    const target = allProducts.find((p) => p.id === productId);
                    if (target) return handleQuickUploadProductPhoto(target, file);
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      ) : storeSubTab === 'divulgacao' ? (
        <MarketingHubTab
          profile={profile}
          owner={owner}
          onProfileUpdated={onProfileUpdated}
        />
      ) : (
        <div className="space-y-5">
          {/* Card Colapsável de Regras Rápidas de Entrega & Frete */}
          <ShippingQuickCard
            profile={profile}
            owner={owner}
            onProfileUpdated={onProfileUpdated}
          />

          {/* Catálogo Inteligente (4 Sinais em Repouso · Edição Inline · DnD · Barra Lote) */}
          <section
            aria-label="Catálogo de Produtos"
            className="rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-5 shadow-xs sm:p-6 space-y-5"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[var(--cg-text)]">
                  Catálogo de Itens ({activeProducts.length}{' '}
                  {activeProducts.length === 1 ? 'ativo' : 'ativos'})
                </h2>
                <p className="text-xs text-[var(--cg-text-secondary)] sm:text-sm">
                  Duplo clique no preço ou estoque para editar na hora. Arraste ⋮⋮ para reordenar na vitrine.
                </p>
              </div>

              <div className="flex flex-wrap shrink-0 items-center gap-2 sm:flex-nowrap">
                {allProducts.length > 0 ? (
                  <ActionButton
                    variant="secondary"
                    size={44}
                    leftIcon={<Percent className="size-4" />}
                    onClick={() => setBatchModalOpen(true)}
                  >
                    Reajustar Preços
                  </ActionButton>
                ) : null}
                <ActionButton
                  variant="secondary"
                  size={44}
                  data-testid="open-tela-08-xls-universal"
                  leftIcon={<FileSpreadsheet className="size-4 text-[#24A677]" />}
                  onClick={() => setUniversalXlsxOpen(true)}
                >
                  Planilha (IA)
                </ActionButton>
                <ActionButton
                  variant="primary"
                  size={44}
                  data-testid="catalog-add-product-btn"
                  leftIcon={<Plus className="size-4" />}
                  onClick={handleOpenNewProduct}
                >
                  Novo Produto
                </ActionButton>
              </div>
            </div>

            {/* Busca Tolerante a Acentos & Typos + Filtro + Densidade Visual */}
            {allProducts.length > 0 ? (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1 lg:max-w-sm">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--cg-text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    data-testid="catalog-fuzzy-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar produto (aceita sem acento)..."
                    aria-label="Buscar produtos no catálogo"
                    className="h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] pr-3.5 pl-10 text-sm text-[var(--cg-text)] focus:bg-[var(--cg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filtrar por categoria"
                    data-testid="catalog-category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-[44px] rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-3 text-sm font-medium text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  >
                    <option value="Todas">Todas as categorias</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>

                  <div className="flex rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] p-1">
                    {(
                      [
                        { id: 'all', label: 'Todos' },
                        { id: 'active', label: 'Ativos' },
                        { id: 'paused', label: 'Pausados' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStatusFilter(item.id)}
                        className={`min-h-[34px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                          statusFilter === item.id
                            ? 'bg-[var(--cg-surface)] text-[var(--cg-primary)] shadow-xs'
                            : 'text-[var(--cg-text-secondary)] hover:text-[var(--cg-text)]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Seletor Segmentado de Densidade Visual (Confortável | Compacto) */}
                  <div
                    role="group"
                    aria-label="Densidade da tabela do catálogo"
                    data-testid="catalog-density-toggle"
                    className="hidden h-[36px] items-center rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] p-0.5 md:inline-flex"
                  >
                    <button
                      type="button"
                      data-testid="density-comfortable-btn"
                      aria-pressed={density === 'comfortable'}
                      onClick={() => handleChangeDensity('comfortable')}
                      className={`h-[30px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                        density === 'comfortable'
                          ? 'bg-[var(--cg-surface)] text-[var(--cg-primary)] shadow-xs'
                          : 'text-[var(--cg-text-secondary)] hover:text-[var(--cg-text)]'
                      }`}
                    >
                      Confortável
                    </button>
                    <button
                      type="button"
                      data-testid="density-compact-btn"
                      aria-pressed={density === 'compact'}
                      onClick={() => handleChangeDensity('compact')}
                      className={`h-[30px] rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                        density === 'compact'
                          ? 'bg-[var(--cg-surface)] text-[var(--cg-primary)] shadow-xs'
                          : 'text-[var(--cg-text-secondary)] hover:text-[var(--cg-text)]'
                      }`}
                    >
                      Compacto
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Conteúdo */}
            {isLoading ? (
              <SkeletonTableRows rows={4} columns={4} />
            ) : allProducts.length === 0 ? (
              <EmptyStateCard
                icon={<Package className="size-7" />}
                title="Seu catálogo ainda está vazio"
                description="Cadastre seu primeiro item ou importe qualquer planilha (.XLS, .XLSX, .CSV) com nossa IA."
                ctaLabel="Cadastrar Meu Primeiro Item"
                ctaIcon={<Plus className="size-5" />}
                ctaSize={56}
                onCta={handleOpenNewProduct}
              />
            ) : filteredProducts.length === 0 ? (
              <EmptyStateCard
                icon={<Search className="size-7" />}
                title="Nenhum item encontrado"
                description={
                  isFiltered
                    ? 'Não encontramos itens com esse filtro ou busca. Limpe os filtros para ver todo o catálogo.'
                    : 'Nenhum item disponível no momento.'
                }
                ctaLabel="Limpar Filtros"
                ctaVariant="secondary"
                ctaSize={44}
                onCta={() => {
                  setSearchQuery('');
                  setCategoryFilter('Todas');
                  setStatusFilter('all');
                }}
              />
            ) : (
              <>
                {/* Desktop Sticky Header Table inside DndContext */}
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={(ev) => void handleDragEnd(ev)}
                >
                  <div className="hidden max-h-[560px] overflow-auto rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] md:block">
                    <table role="table" className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-[var(--cg-surface-elevated)] text-[12px] font-semibold uppercase tracking-wide text-[var(--cg-text-muted)] shadow-[inset_0_-1px_0_var(--cg-border)]">
                        <tr>
                          <th className="py-3 pl-4 pr-2 w-28">
                            <div className="flex items-center gap-2 pl-9">
                              <button
                                type="button"
                                data-testid="catalog-select-all-checkbox"
                                aria-label="Selecionar todos os produtos"
                                onClick={toggleSelectAll}
                                className="flex size-6 items-center justify-center rounded-md border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] hover:bg-[var(--cg-hover)]"
                              >
                                {selectedProductIds.size > 0 &&
                                selectedProductIds.size === filteredProducts.length ? (
                                  <CheckSquare className="size-4 text-[var(--cg-primary)]" />
                                ) : (
                                  <Square className="size-4 text-[var(--cg-text-muted)]" />
                                )}
                              </button>
                              <span>Foto</span>
                            </div>
                          </th>
                          <th className="px-3 py-3">Produto</th>
                          <th className="px-3 py-3">Preço (duplo clique)</th>
                          <th className="px-3 py-3">Estoque</th>
                          <th className="pl-2 pr-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--cg-border)]">
                        {filteredProducts.map((product) => (
                          <DesktopProductRow
                            key={product.id}
                            product={product}
                            brandPrimaryColor={brandPrimaryColor}
                            density={density}
                            isSelected={selectedProductIds.has(product.id)}
                            isUploading={uploadingProductId === product.id}
                            canReorder={canReorder}
                            editingField={
                              inlineEditing?.id === product.id ? inlineEditing.field : null
                            }
                            inlineDraft={inlineEditing?.id === product.id ? inlineDraft : ''}
                            onStartInlineEdit={startInlineEdit}
                            onInlineDraftChange={setInlineDraft}
                            onCommitInlineEdit={commitInlineEdit}
                            onCancelInlineEdit={cancelInlineEdit}
                            onToggleSelect={toggleSelectProduct}
                            onUploadPhoto={handleQuickUploadProductPhoto}
                            onZoomPhoto={setCatalogZoomItem}
                            onToggleActive={handleToggleActive}
                            onEdit={handleOpenEditProduct}
                            onDelete={setDeleteTarget}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <DragOverlay>
                    {draggingProduct ? (
                      <div className="flex items-center gap-3 rounded-2xl border-2 border-[var(--cg-primary)] bg-[var(--cg-surface)] px-4 py-3 shadow-2xl">
                        <GripVertical className="size-4 text-[var(--cg-primary)]" />
                        <span className="text-sm font-bold text-[var(--cg-text)]">
                          {draggingProduct.name}
                        </span>
                        <span className="cg-tabular text-xs font-semibold text-[var(--cg-text-secondary)]">
                          {formatCurrencyBRL(draggingProduct.priceCents)}
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>

                {/* Mobile Stacked Cards (390px Dark & Light safe) */}
                <div className="space-y-3 md:hidden">
                  {filteredProducts.map((product) => (
                    <MobileProductCard
                      key={product.id}
                      product={product}
                      brandPrimaryColor={brandPrimaryColor}
                      isSelected={selectedProductIds.has(product.id)}
                      onToggleSelect={toggleSelectProduct}
                      onUploadPhoto={handleQuickUploadProductPhoto}
                      onToggleActive={handleToggleActive}
                      onEdit={handleOpenEditProduct}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Barra Flutuante Inferior de Lote (100% invisível em repouso quando selectedProductIds.size === 0) */}
          {selectedProductIds.size > 0 ? (
            <div
              data-testid="catalog-floating-batch-bar"
              role="region"
              aria-label="Ações em lote para produtos selecionados"
              className="fixed bottom-6 left-1/2 z-30 w-[min(94vw,760px)] -translate-x-1/2 rounded-2xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-4 py-3 shadow-2xl transition-all duration-200 ease-[var(--cg-ease)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="cg-tabular flex size-7 items-center justify-center rounded-lg bg-[var(--cg-primary)] text-xs font-bold text-white">
                    {selectedProductIds.size}
                  </span>
                  <span className="text-sm font-bold text-[var(--cg-text)]">
                    {selectedProductIds.size} selecionado(s)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="batch-pause-btn"
                    leftIcon={<Pause className="size-3.5" />}
                    onClick={() => void handleBatchToggleActive(false)}
                  >
                    Pausar
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="batch-activate-btn"
                    leftIcon={<Play className="size-3.5 text-[var(--cg-success)]" />}
                    onClick={() => void handleBatchToggleActive(true)}
                  >
                    Reativar
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="batch-category-btn"
                    leftIcon={<Tags className="size-3.5" />}
                    onClick={() => setBatchCategoryOpen((v) => !v)}
                  >
                    Trocar Categoria
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="batch-search-images-btn"
                    leftIcon={<Sparkles className="size-3.5" />}
                    onClick={() => setBatchImageModalOpen(true)}
                  >
                    Fotos em Massa
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size={44}
                    data-testid="batch-archive-btn"
                    leftIcon={<Archive className="size-3.5 text-[#D94C4C]" />}
                    onClick={handleBatchArchive}
                  >
                    Arquivar
                  </ActionButton>
                </div>
              </div>

              {batchCategoryOpen ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--cg-border)] pt-3">
                  <input
                    type="text"
                    data-testid="batch-category-input"
                    value={batchCategoryInput}
                    onChange={(e) => setBatchCategoryInput(e.target.value)}
                    placeholder="Nova categoria (ex: Ofertas)"
                    className="h-[44px] flex-1 min-w-[180px] rounded-lg border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-3 text-xs text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  />
                  <ActionButton
                    variant="primary"
                    size={44}
                    data-testid="batch-category-apply-btn"
                    onClick={() => void handleBatchApplyCategory(batchCategoryInput)}
                  >
                    Aplicar Categoria
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Drawer de Adicionar / Editar Produto (TELA 17) */}
      <ProductEditorDrawer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        product={editingProduct}
        existingCategories={categories}
        brandPrimaryColor={brandPrimaryColor}
        owner={owner}
        onSaved={(snap) => {
          onProfileUpdated?.(snap);
        }}
      />

      {/* Modais de Segurança */}
      <DeleteProductConfirmModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        product={deleteTarget}
        onConfirm={handleConfirmDelete}
      />

      <PublishBlockModal
        open={publishBlockModalOpen}
        onOpenChange={setPublishBlockModalOpen}
        blockers={publishBlockers}
        onResolveBlocker={handleResolveBlocker}
        onAutoFixMissingPhotos={
          publishBlockers.some((b) => b.id === 'missing_photo')
            ? handleAutoFixMissingPhotos
            : undefined
        }
        fixingPhotos={fixingPhotos}
      />

      <StorePublishedModal
        open={publishedModalOpen}
        onOpenChange={setPublishedModalOpen}
        storeName={brandName}
        publicUrl={publicUrl}
        onViewStorefront={handleOpenPreview}
      />

      <BatchPriceAdjustModal
        open={batchModalOpen}
        onOpenChange={setBatchModalOpen}
        productsCount={allProducts.length}
        onApply={handleBatchPriceApply}
      />

      {/* Drawer Interno de Preview Fiel com Upload Inline nos Blocos Cinzas */}
      <DrawerContainer
        open={internalPreviewOpen}
        onOpenChange={setInternalPreviewOpen}
        size="full"
        title={`Preview de ${brandName}`}
        description="Clique nos blocos cinzas para subir imagens e teste o envio direto para o WhatsApp."
        contentClassName="p-0"
      >
        <CustomerStorefrontView
          profile={profile}
          ownerId={owner}
          mode="preview"
          runtimeStatus={runtimeStatus}
          onBackToAdmin={() => setInternalPreviewOpen(false)}
          onUploadProductImage={(productId, file) => {
            const target = allProducts.find((p) => p.id === productId);
            if (target) return handleQuickUploadProductPhoto(target, file);
          }}
          onUploadBrandAsset={handleUploadBrandAsset}
        />
      </DrawerContainer>

      {/* Modal Baixar Loja em ZIP Fiel */}
      <ModalContainer
        open={zipModalOpen}
        onOpenChange={setZipModalOpen}
        maxWidth="md"
        mobileHeight="auto"
        preventCloseWhileSubmitting={zipGenerating}
        title="Baixar Loja em Arquivo ZIP"
        description="Exporta a versão fiel da sua loja (index.html, styles.css, app.js, catalog.json e fotos em assets/) pronta para publicar."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              disabled={zipGenerating}
              onClick={() => setZipModalOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="success"
              size={50}
              isLoading={zipGenerating}
              loadingText="Compactando..."
              leftIcon={<DownloadCloud className="size-5" />}
              onClick={() => void handleDownloadZip()}
            >
              Baixar loja_completa.zip Agora
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Inclui design fiel dos widgets ativos (<code className="text-xs font-semibold">index.html</code> +{' '}
            <code className="text-xs font-semibold">styles.css</code> +{' '}
            <code className="text-xs font-semibold">app.js</code>), catálogo{' '}
            <code className="text-xs font-semibold">catalog.json</code> com suas mensagens molde e link{' '}
            <code className="text-xs font-semibold">wa.me</code> conectado.
          </p>

          {zipGenerating ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-slate-600">
                <span>Empacotando vitrine e imagens locais...</span>
                <span>{zipProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-[#16A34A] transition-all duration-200"
                  style={{ width: `${zipProgress}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </ModalContainer>

      {/* Modal Procurar Imagens em Massa */}
      <BatchImageSearchModal
        open={batchImageModalOpen}
        onOpenChange={setBatchImageModalOpen}
        selectedProducts={allProducts.filter((p) => selectedProductIds.has(p.id))}
        owner={owner}
        onApplyImages={handleApplyBatchImages}
      />

      {/* Modal de Inspeção / Zoom de Foto no Catálogo */}
      <ProductImageDetailModal
        open={Boolean(catalogZoomItem)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCatalogZoomItem(null);
        }}
        productName={catalogZoomItem?.name || 'Produto'}
        image={
          catalogZoomItem
            ? {
                rawUrl: catalogZoomItem.imageUrl,
                thumbnailUrl: catalogZoomItem.imageUrl,
                sourceDomain: 'catalogo-local',
              }
            : null
        }
        onSetOfficialPhoto={async (imageUrl) => {
          if (catalogZoomItem) {
            await handleApplyBatchImages([{ productId: catalogZoomItem.id, imageUrl }]);
          }
        }}
      />

      {/* TELA 08-XLS: Planilha Universal IA (.XLS / .XLSX / .CSV) */}
      <UniversalCatalogXlsxModal
        open={universalXlsxOpen}
        onOpenChange={setUniversalXlsxOpen}
        ownerUser={owner}
        onImportProducts={handleUniversalImportProducts}
      />

      <ModalContainer
        open={storeQrOpen}
        onOpenChange={setStoreQrOpen}
        maxWidth="md"
        title="QR Code da Sua Loja"
        description="Imprima no balcão, sacolas ou cartões para seus clientes abrirem o catálogo direto."
      >
        <div className="flex flex-col items-center gap-4 text-center">
          {storeQrLoading ? (
            <p className="py-10 text-xs text-slate-500">Gerando QR Code...</p>
          ) : storeQrPng ? (
            <img
              src={storeQrPng}
              alt="QR Code da vitrine"
              className="size-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs"
            />
          ) : null}
          <p className="text-xs font-medium text-slate-600">
            Aponte a câmera do celular para abrir a vitrine instantaneamente ou copie o link abaixo.
          </p>
          <div className="flex flex-wrap justify-center gap-2 w-full">
            {storeQrPng ? (
              <a
                href={storeQrPng}
                download={`qrcode-${profile.publishedStore?.publicSlug || 'minha-loja'}.png`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white hover:bg-[#1D4ED8]"
              >
                <Download className="size-4" />
                Baixar PNG
              </a>
            ) : null}
            <ActionButton
              variant="secondary"
              size={44}
              onClick={() => void handleCopyStoreLink()}
            >
              Copiar Link
            </ActionButton>
          </div>
        </div>
      </ModalContainer>
    </div>
  );
}
