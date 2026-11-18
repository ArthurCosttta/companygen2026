import * as React from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  DownloadCloud,
  Edit3,
  Eye,
  FileSpreadsheet,
  ImagePlus,
  LayoutGrid,
  Monitor,
  Package,
  Percent,
  Plus,
  QrCode,
  Rocket,
  Search,
  Smartphone,
  Sparkles,
  Store as StoreIcon,
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
import { ProductEditorDrawer } from './ProductEditorDrawer';
import { CustomerStorefrontView } from './CustomerStorefrontView';
import { UniversalCatalogXlsxModal } from './UniversalCatalogXlsxModal';

import { buildFaithfulStorefrontZip } from './storefront-zip-builder';
import {
  buildProductPlaceholderDataUri,
  buildStorePublicUrl,
  copyTextToClipboard,
  getPublishBlockers,
  readImageFileAsDataUrl,
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
  LIVE_READY: 'border-emerald-200 bg-emerald-50 text-[#16A34A]',
  QR_PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  STORE_NUMBER_ONLY: 'border-blue-200 bg-[#EFF6FF] text-[#1D4ED8]',
  DISCONNECTED: 'border-slate-200 bg-slate-100 text-slate-700',
};

const ITEM_TYPE_OPTIONS: Array<{ value: CatalogItemType; label: string }> = [
  { value: 'produto_fisico', label: 'Produto Físico' },
  { value: 'servico_agendado', label: 'Serviço Agendado' },
  { value: 'kit_combo', label: 'Kit / Combo' },
  { value: 'sob_medida', label: 'Sob Medida' },
];

interface ProductMoldeInputProps {
  product: CatalogProduct;
  brandName: string;
  isSaving: boolean;
  testId?: string;
  ariaLabel: string;
  className: string;
  onSave: (product: CatalogProduct, nextMolde: string) => void | Promise<void>;
}

const ProductMoldeInput = React.memo(function ProductMoldeInput({
  product,
  brandName,
  isSaving,
  testId,
  ariaLabel,
  className,
  onSave,
}: ProductMoldeInputProps) {
  const defaultValue = React.useMemo(
    () => product.mensagemMolde?.trim() || buildDefaultMensagemMolde(product, brandName),
    [product, brandName],
  );
  const [value, setValue] = React.useState(defaultValue);

  React.useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        data-testid={testId}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => void onSave(product, e.target.value)}
        className={className}
      />
      {isSaving ? (
        <span className="text-[11px] font-medium text-[#2563EB]">...</span>
      ) : null}
    </div>
  );
});

interface DesktopProductRowProps {
  product: CatalogProduct;
  brandName: string;
  brandPrimaryColor: string;
  isSelected: boolean;
  isUploading: boolean;
  isSavingMold: boolean;
  isToggling: boolean;
  onToggleSelect: (id: string) => void;
  onUploadPhoto: (product: CatalogProduct, file: File | null) => void;
  onZoomPhoto: (item: { id: string; name: string; imageUrl: string }) => void;
  onUpdateItemType: (product: CatalogProduct, nextType: CatalogItemType) => void;
  onSaveMolde: (product: CatalogProduct, nextMolde: string) => Promise<void>;
  onToggleActive: (product: CatalogProduct) => void;
  onEdit: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}

const DesktopProductRow = React.memo(function DesktopProductRow({
  product,
  brandName,
  brandPrimaryColor,
  isSelected,
  isUploading,
  isSavingMold,
  isToggling,
  onToggleSelect,
  onUploadPhoto,
  onZoomPhoto,
  onUpdateItemType,
  onSaveMolde,
  onToggleActive,
  onEdit,
  onDelete,
}: DesktopProductRowProps) {
  const isActive = product.active !== false;
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
    <tr className={`align-top transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}`}>
      <td className="py-3.5 pr-2">
        <button
          type="button"
          data-testid={`catalog-select-row-${product.id}`}
          aria-label={`Selecionar ${product.name}`}
          onClick={() => onToggleSelect(product.id)}
          className="flex size-6 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-100"
        >
          {isSelected ? (
            <CheckSquare className="size-4 text-[#2563EB]" />
          ) : (
            <Square className="size-4 text-slate-400" />
          )}
        </button>
      </td>
      <td className="py-3.5 pr-4">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <label
              data-testid={`product-upload-photo-${product.id}`}
              title="Clique para subir foto real do item"
              className="group relative flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 text-slate-500 transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
            >
              {hasCustomPhoto ? (
                <>
                  <img
                    src={imgSrc}
                    alt={product.name}
                    className="size-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-0.5 text-center text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Trocar
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus className="size-4" aria-hidden="true" />
                  <span className="mt-0.5 text-[10px] font-semibold">
                    {isUploading ? '...' : '+ Foto'}
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  e.target.value = '';
                  onUploadPhoto(product, f);
                }}
              />
            </label>
            {hasCustomPhoto && imgSrc ? (
              <button
                type="button"
                data-testid={`product-zoom-photo-${product.id}`}
                title="Ampliar e inspecionar nitidez da foto"
                aria-label={`Ampliar foto de ${product.name}`}
                onClick={() =>
                  onZoomPhoto({
                    id: product.id,
                    name: product.name,
                    imageUrl: imgSrc,
                  })
                }
                className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-blue-50 hover:text-[#2563EB]"
              >
                <ZoomIn className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="min-w-0">
            <p className="truncate font-semibold text-[#0F172A]">{product.name}</p>
            <p className="text-xs text-slate-500">
              {product.category || 'Geral'}
              {product.variation && product.variation !== 'Padrão'
                ? ` · ${product.variation}`
                : ''}
              {product.prazoOuDuracao ? ` · ${product.prazoOuDuracao}` : ''}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3.5 min-w-[260px] space-y-2">
        <select
          aria-label={`Tipo de ${product.name}`}
          data-testid={`product-type-select-${product.id}`}
          value={product.itemType || 'produto_fisico'}
          onChange={(e) =>
            onUpdateItemType(
              product,
              e.target.value as CatalogItemType,
            )
          }
          className="min-h-[34px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        >
          {ITEM_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <ProductMoldeInput
          product={product}
          brandName={brandName}
          isSaving={isSavingMold}
          testId={`product-molde-input-${product.id}`}
          ariaLabel={`Mensagem molde de ${product.name}`}
          className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          onSave={onSaveMolde}
        />
      </td>

      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="font-bold text-[#0F172A]">
          {formatCurrencyBRL(product.priceCents)}
        </p>
        <span
          className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${
            product.stock > 0
              ? 'bg-slate-100 text-slate-700'
              : 'bg-amber-50 text-amber-800'
          }`}
        >
          {product.stock > 0 ? `${product.stock} un.` : 'Sob consulta'}
        </span>
      </td>

      <td className="px-4 py-3.5">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={`Alternar visibilidade de ${product.name}`}
          disabled={isToggling}
          onClick={() => onToggleActive(product)}
          className={`relative inline-flex h-8 w-14 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] disabled:opacity-50 ${
            isActive ? 'bg-[#16A34A]' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block size-6 rounded-full bg-white shadow-xs transition-transform ${
              isActive ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </td>

      <td className="py-3.5 pl-4 text-right">
        <div className="inline-flex items-center justify-end gap-2">
          <ActionButton
            variant="secondary"
            size={44}
            leftIcon={<Edit3 className="size-4" />}
            onClick={() => onEdit(product)}
          >
            Editar
          </ActionButton>
          <button
            type="button"
            aria-label={`Excluir ${product.name}`}
            onClick={() => onDelete(product)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-[#EF4444] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

interface MobileProductCardProps {
  product: CatalogProduct;
  brandName: string;
  brandPrimaryColor: string;
  isSavingMold: boolean;
  isToggling: boolean;
  onUploadPhoto: (product: CatalogProduct, file: File | null) => void;
  onSaveMolde: (product: CatalogProduct, nextMolde: string) => Promise<void>;
  onToggleActive: (product: CatalogProduct) => void;
  onEdit: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}

const MobileProductCard = React.memo(function MobileProductCard({
  product,
  brandName,
  brandPrimaryColor,
  isSavingMold,
  isToggling,
  onUploadPhoto,
  onSaveMolde,
  onToggleActive,
  onEdit,
  onDelete,
}: MobileProductCardProps) {
  const isActive = product.active !== false;
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
    <article className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <label className="relative flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 text-slate-500">
          {hasCustomPhoto ? (
            <img src={imgSrc} alt={product.name} className="size-full object-cover" />
          ) : (
            <>
              <ImagePlus className="size-4" aria-hidden="true" />
              <span className="mt-0.5 text-[10px] font-semibold">+ Foto</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.target.value = '';
              onUploadPhoto(product, f);
            }}
          />
        </label>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0F172A]">{product.name}</p>
          <p className="text-xs text-slate-500">
            {product.category || 'Geral'} · {product.stock} un.
          </p>
          <p className="mt-1 text-base font-bold text-[#0F172A]">
            {formatCurrencyBRL(product.priceCents)}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={`Alternar visibilidade de ${product.name}`}
          disabled={isToggling}
          onClick={() => onToggleActive(product)}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${
            isActive ? 'bg-[#16A34A]' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block size-6 rounded-full bg-white shadow-xs transition-transform ${
              isActive ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <ProductMoldeInput
        product={product}
        brandName={brandName}
        isSaving={isSavingMold}
        ariaLabel={`Mensagem molde móvel de ${product.name}`}
        className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700"
        onSave={onSaveMolde}
      />

      <div className="flex items-center gap-2">
        <ActionButton
          variant="secondary"
          size={44}
          fullWidth
          leftIcon={<Edit3 className="size-4" />}
          onClick={() => onEdit(product)}
        >
          Editar Produto
        </ActionButton>
        <button
          type="button"
          aria-label={`Excluir ${product.name}`}
          onClick={() => onDelete(product)}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-[#EF4444]"
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

  // Filters & search
  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('Todas');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'paused'>('all');

  // Optimistic & inline edit states
  const [pendingDeletedIds, setPendingDeletedIds] = React.useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [uploadingProductId, setUploadingProductId] = React.useState<string | null>(null);
  const [savingMoldId, setSavingMoldId] = React.useState<string | null>(null);
  const [mobileInlinePreviewOpen, setMobileInlinePreviewOpen] = React.useState(false);

  const savedInlineTimerRef = React.useRef<number | null>(null);
  const copiedLinkTimerRef = React.useRef<number | null>(null);
  const zipRevokeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (savedInlineTimerRef.current !== null) {
        window.clearTimeout(savedInlineTimerRef.current);
      }
      if (copiedLinkTimerRef.current !== null) {
        window.clearTimeout(copiedLinkTimerRef.current);
      }
      if (zipRevokeTimerRef.current !== null) {
        window.clearTimeout(zipRevokeTimerRef.current);
      }
    };
  }, []);

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

  const allProducts = React.useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => !pendingDeletedIds[p.id]),
    [profile.catalog?.products, pendingDeletedIds],
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
    const query = searchQuery.trim().toLowerCase();
    return allProducts.filter((p) => {
      const cat = (p.category || 'Geral').trim() || 'Geral';
      if (categoryFilter !== 'Todas' && cat !== categoryFilter) return false;
      if (statusFilter === 'active' && p.active === false) return false;
      if (statusFilter === 'paused' && p.active !== false) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        cat.toLowerCase().includes(query) ||
        (p.variation || '').toLowerCase().includes(query) ||
        (p.sku || '').toLowerCase().includes(query)
      );
    });
  }, [allProducts, searchQuery, categoryFilter, statusFilter]);

  const isFiltered =
    searchQuery.trim().length > 0 || categoryFilter !== 'Todas' || statusFilter !== 'all';

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
      const dataUrl = await readImageFileAsDataUrl(file);
      const snap = await updateBusinessProfile(
        (draft) => {
          const target = draft.catalog?.products?.find((p) => p.id === product.id);
          if (target) {
            target.imageUrl = dataUrl;
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
        type: 'success',
        message: `Foto de "${product.name}" atualizada!`,
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao subir a imagem.',
      });
    } finally {
      setUploadingProductId(null);
    }
  }, [markInlineSaved, onProfileUpdated, owner, showToast]);

  async function handleUploadBrandAsset(slot: string, file: File) {
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
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

  const handleUpdateProductItemType = React.useCallback(async (product: CatalogProduct, nextType: CatalogItemType) => {
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          const target = draft.catalog?.products?.find((p) => p.id === product.id);
          if (target) {
            target.itemType = nextType;
            if (!target.mensagemMolde?.trim()) {
              target.mensagemMolde = buildDefaultMensagemMolde(
                { ...target, itemType: nextType },
                brandName,
              );
            }
            target.updatedAt = new Date().toISOString();
          }
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: `Tipo de "${product.name}" alterado para ${ITEM_TYPE_OPTIONS.find((o) => o.value === nextType)?.label}.`,
        durationMs: 2500,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao atualizar tipo do item.',
      });
    }
  }, [brandName, onProfileUpdated, owner, showToast]);

  const handleSaveInlineMolde = React.useCallback(async (product: CatalogProduct, nextMolde: string) => {
    const clean = nextMolde.trim() || buildDefaultMensagemMolde(product, brandName);
    if (clean === (product.mensagemMolde || '').trim()) return;
    setSavingMoldId(product.id);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          const target = draft.catalog?.products?.find((p) => p.id === product.id);
          if (target) {
            target.mensagemMolde = clean;
            target.updatedAt = new Date().toISOString();
          }
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: `Mensagem molde de "${product.name}" salva!`,
        durationMs: 2400,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao salvar mensagem molde.',
      });
    } finally {
      setSavingMoldId(null);
    }
  }, [brandName, onProfileUpdated, owner, showToast]);

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

  const toggleSelectProduct = React.useCallback((id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = () => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

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
    <div className="space-y-6 pb-8">
      {/* TELA 13: Hub Minha Loja (Ultra-Simplificado) */}
      <section
        aria-label="Painel da Minha Loja"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <StoreIcon className="size-5" aria-hidden="true" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
                {brandName}
              </h1>
              {profile.publishedStore?.published ? (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-[#16A34A] transition-colors hover:bg-emerald-100"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Vitrine Online
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
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

            <p className="text-sm text-slate-600">
              Suba fotos direto nos produtos, peça à IA o visual da vitrine, pré-visualize ou baixe o ZIP completo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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

        {/* Link Público + Ações Essenciais (sem botões duplicados) */}
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 min-h-[44px]">
              <span className="shrink-0 text-xs font-bold text-slate-500">Link público:</span>
              <input
                type="text"
                readOnly
                value={publicUrl}
                aria-label="Link público da loja"
                onClick={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-[#0F172A] focus:outline-none"
              />
            </div>
            <ActionButton
              variant={copiedLink ? 'success' : 'softBlue'}
              size={44}
              leftIcon={copiedLink ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void handleCopyStoreLink()}
            >
              {copiedLink ? 'Copiado!' : 'Copiar Link'}
            </ActionButton>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenArchetypeComposer ? (
              <ActionButton
                variant="secondary"
                size={44}
                data-testid="open-visual-editor-btn"
                leftIcon={<LayoutGrid className="size-4 text-[#2563EB]" />}
                onClick={onOpenArchetypeComposer}
              >
                Editor Visual &amp; Widgets
              </ActionButton>
            ) : null}
            <ActionButton
              variant="secondary"
              size={44}
              data-testid="open-zip-modal-btn"
              leftIcon={<DownloadCloud className="size-4 text-[#16A34A]" />}
              onClick={() => setZipModalOpen(true)}
            >
              Baixar Loja ZIP
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              data-testid="open-store-qr-btn"
              leftIcon={<QrCode className="size-4 text-violet-600" />}
              onClick={() => void handleOpenStoreQr()}
            >
              QR Code da Loja
            </ActionButton>
          </div>
        </div>

        {/* Chat Gigante Único para Criar a Loja + Preview Visual ao Vivo */}
        <div
          data-testid="minha-loja-ai-studio"
          className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label
                htmlFor="minha-loja-ai-prompt-input"
                className="flex items-center gap-2 text-base font-bold text-[#0F172A]"
              >
                <Wand2 className="size-4 text-[#2563EB]" aria-hidden="true" />
                O que você quer criar na sua loja?
              </label>
              <p className="mt-0.5 text-xs text-slate-600">
                Descreva sua empresa, estilo e experiência desejada. A IA monta os blocos e o catálogo ao vivo abaixo.
              </p>
            </div>
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={<FileSpreadsheet className="size-4 text-[#16A34A]" />}
              onClick={() => setUniversalXlsxOpen(true)}
            >
              Anexar Planilha
            </ActionButton>
          </div>

          <textarea
            id="minha-loja-ai-prompt-input"
            data-testid="minha-loja-ai-prompt-input"
            rows={4}
            value={storePrompt}
            onChange={(e) => setStorePrompt(e.target.value)}
            placeholder="Ex: Quero uma loja moderna de chocolates artesanais onde o cliente monta a própria caixa de 9 doces e fecha direto no WhatsApp..."
            className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-[#0F172A] shadow-xs focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
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
        </div>

        {/* Preview Visual ao Vivo embutido */}
        <div
          data-testid="minha-loja-inline-preview"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="text-xs font-bold text-[#0F172A]">Preview da Loja ao Vivo</span>
              <span className="hidden truncate text-[11px] text-slate-500 sm:inline">
                ({activeProducts.length} itens • {formulaV9SectionsCount} seções{savedInlineId ? ' · Salvo ✓' : ''})
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMobileInlinePreviewOpen((v) => !v)}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-[#0F172A] md:hidden"
              >
                <Eye className="size-3.5" aria-hidden="true" />
                <span>{mobileInlinePreviewOpen ? 'Ocultar Preview' : 'Mostrar Preview'}</span>
              </button>

              <div className="hidden rounded-xl border border-slate-200 bg-slate-50 p-0.5 md:inline-flex">
                <button
                  type="button"
                  onClick={() => setInlinePreviewDevice('desktop')}
                  aria-label="Preview desktop"
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    inlinePreviewDevice === 'desktop'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
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
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
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
              className={`h-[560px] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
                inlinePreviewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-full'
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
        </div>
      </section>

      {/* Catálogo de Produtos — 1 botão único de Planilha + upload cinza inline + Mensagem Molde */}
      <section
        aria-label="Catálogo de Produtos"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">
              Catálogo de Itens ({activeProducts.length}{' '}
              {activeProducts.length === 1 ? 'ativo' : 'ativos'})
            </h2>
            <p className="text-xs text-slate-600 sm:text-sm">
              Clique no bloco cinza para subir a foto e ajuste a mensagem molde pronta de cada item.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
              leftIcon={<FileSpreadsheet className="size-4 text-[#16A34A]" />}
              onClick={() => setUniversalXlsxOpen(true)}
            >
              Importar Planilha (IA)
            </ActionButton>
            <ActionButton
              variant="primary"
              size={44}
              leftIcon={<Plus className="size-4" />}
              onClick={handleOpenNewProduct}
            >
              Cadastrar Novo Item
            </ActionButton>
          </div>
        </div>

        {/* Filtros e Busca */}
        {allProducts.length > 0 ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1 md:max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, SKU ou categoria..."
                aria-label="Buscar produtos no catálogo"
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3.5 pl-10 text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filtrar por categoria"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="Todas">Todas as categorias</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
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
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors ${
                      statusFilter === item.id
                        ? 'bg-white text-[#2563EB] shadow-xs'
                        : 'text-slate-600 hover:text-[#0F172A]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
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
            {/* Barra Flutuante de Seleção Múltipla & Busca de Imagens em Massa */}
            {selectedProductIds.size > 0 && (
              <div
                data-testid="catalog-batch-actions-bar"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/90 px-4 py-3 shadow-md"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-[#2563EB] text-xs font-bold text-white">
                    {selectedProductIds.size}
                  </span>
                  <span className="text-sm font-bold text-[#0F172A]">
                    {selectedProductIds.size} item(ns) selecionado(s)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    variant="primary"
                    size={44}
                    data-testid="batch-search-images-btn"
                    leftIcon={<Sparkles className="size-4" />}
                    onClick={() => setBatchImageModalOpen(true)}
                  >
                    Procurar Imagens em Massa ({selectedProductIds.size})
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    size={44}
                    onClick={() => setSelectedProductIds(new Set())}
                  >
                    Limpar Seleção
                  </ActionButton>
                </div>
              </div>
            )}

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table role="table" className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-2 w-10">
                      <button
                        type="button"
                        data-testid="catalog-select-all-checkbox"
                        aria-label="Selecionar todos os produtos"
                        onClick={toggleSelectAll}
                        className="flex size-6 items-center justify-center rounded-md border border-slate-300 hover:bg-slate-100"
                      >
                        {selectedProductIds.size > 0 && selectedProductIds.size === filteredProducts.length ? (
                          <CheckSquare className="size-4 text-[#2563EB]" />
                        ) : (
                          <Square className="size-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 pr-4">Foto + Item</th>
                    <th className="px-4 py-3">Tipo & Mensagem Molde</th>
                    <th className="px-4 py-3">Preço / Estoque</th>
                    <th className="px-4 py-3">Na Vitrine</th>
                    <th className="py-3 pl-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => (
                    <DesktopProductRow
                      key={product.id}
                      product={product}
                      brandName={brandName}
                      brandPrimaryColor={brandPrimaryColor}
                      isSelected={selectedProductIds.has(product.id)}
                      isUploading={uploadingProductId === product.id}
                      isSavingMold={savingMoldId === product.id}
                      isToggling={togglingId === product.id}
                      onToggleSelect={toggleSelectProduct}
                      onUploadPhoto={handleQuickUploadProductPhoto}
                      onZoomPhoto={setCatalogZoomItem}
                      onUpdateItemType={handleUpdateProductItemType}
                      onSaveMolde={handleSaveInlineMolde}
                      onToggleActive={handleToggleActive}
                      onEdit={handleOpenEditProduct}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards (390px safe) */}
            <div className="space-y-3 md:hidden">
              {filteredProducts.map((product) => (
                <MobileProductCard
                  key={product.id}
                  product={product}
                  brandName={brandName}
                  brandPrimaryColor={brandPrimaryColor}
                  isSavingMold={savingMoldId === product.id}
                  isToggling={togglingId === product.id}
                  onUploadPhoto={handleQuickUploadProductPhoto}
                  onSaveMolde={handleSaveInlineMolde}
                  onToggleActive={handleToggleActive}
                  onEdit={handleOpenEditProduct}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </>
        )}
      </section>

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
          <p className="w-full break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
            {publicUrl}
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
