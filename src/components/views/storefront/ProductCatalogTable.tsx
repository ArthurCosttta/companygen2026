import * as React from 'react';
import JSZip from 'jszip';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  DownloadCloud,
  Edit3,
  Eye,
  FileSpreadsheet,
  Package,
  Percent,
  Plus,
  Rocket,
  Search,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { analyzePromptAndGenerateQuestions } from '@/services/store-prompt-generator';
import { synthesizeStoreFromProfile } from '@/store-v5/profile-adapter';
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
import {
  buildProductPlaceholderDataUri,
  buildStorePublicUrl,
  copyTextToClipboard,
  getPublishBlockers,
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
}

const PHASE_BADGE_CLASS: Record<string, string> = {
  LIVE_READY: 'border-emerald-200 bg-emerald-50 text-[#16A34A]',
  QR_PENDING: 'border-amber-200 bg-amber-50 text-amber-800',
  STORE_NUMBER_ONLY: 'border-blue-200 bg-[#EFF6FF] text-[#1D4ED8]',
  DISCONNECTED: 'border-slate-200 bg-slate-100 text-slate-700',
};

export function ProductCatalogTable({
  profile,
  revision,
  owner,
  runtimeStatus,
  isLoading = false,
  onProfileUpdated,
  onOpenCustomerPreview,
  onOpenSettings,
  onOpenWhatsApp,
}: ProductCatalogTableProps) {
  const { showToast } = useToast();
  const phaseInfo = useConnectionPhaseInfo(profile, runtimeStatus);

  // Filters & search
  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('Todas');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'paused'>('all');

  // Optimistic states
  const [pendingDeletedIds, setPendingDeletedIds] = React.useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Drawers & Modals
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<CatalogProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CatalogProduct | null>(null);
  const [batchModalOpen, setBatchModalOpen] = React.useState(false);

  // Publish modals (TELA 20 & TELA 21)
  const [publishing, setPublishing] = React.useState(false);
  const [publishBlockers, setPublishBlockers] = React.useState<PublishBlocker[]>([]);
  const [publishBlockModalOpen, setPublishBlockModalOpen] = React.useState(false);
  const [fixingPhotos, setFixingPhotos] = React.useState(false);
  const [publishedModalOpen, setPublishedModalOpen] = React.useState(false);

  // Preview Drawer (when onOpenCustomerPreview is not externally controlled)
  const [internalPreviewOpen, setInternalPreviewOpen] = React.useState(false);

  // AI Prompts Modal & ZIP Export Modal
  const [promptsModalOpen, setPromptsModalOpen] = React.useState(false);
  const [selectedPromptProductId, setSelectedPromptProductId] = React.useState<string>('');
  const [promptCopied, setPromptCopied] = React.useState(false);
  const [zipModalOpen, setZipModalOpen] = React.useState(false);
  const [zipGenerating, setZipGenerating] = React.useState(false);
  const [zipProgress, setZipProgress] = React.useState(0);

  // TELA 08: Modal Importar Planilha (.CSV / .XLSX)
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [importFileName, setImportFileName] = React.useState('');
  const [importRawText, setImportRawText] = React.useState('');
  const [importMode, setImportMode] = React.useState<'update' | 'skip'>('update');
  const [importError, setImportError] = React.useState('');
  const [importSubmitting, setImportSubmitting] = React.useState(false);

  const brandName = profile.business?.name?.trim() || 'Minha Loja';
  const brandPrimaryColor = profile.brand?.primaryColor || '#2563EB';
  const publicUrl = React.useMemo(() => buildStorePublicUrl(profile, owner), [profile, owner]);

  const allProducts = React.useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => !pendingDeletedIds[p.id]),
    [profile.catalog?.products, pendingDeletedIds],
  );

  const activeProducts = React.useMemo(
    () => allProducts.filter((p) => p.active !== false),
    [allProducts],
  );

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
        (p.variation || '').toLowerCase().includes(query)
      );
    });
  }, [allProducts, searchQuery, categoryFilter, statusFilter]);

  const hasPendingRepublish =
    Boolean(profile.publishedStore?.published) &&
    Number(profile.publishedStore?.sourceRevision || 0) !== revision;

  const isFiltered =
    searchQuery.trim().length > 0 || categoryFilter !== 'Todas' || statusFilter !== 'all';

  async function handleCopyStoreLink() {
    const ok = await copyTextToClipboard(publicUrl);
    if (ok) {
      setCopiedLink(true);
      showToast({
        type: 'success',
        message: 'Link da vitrine copiado!',
        durationMs: 2500,
      });
      window.setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  function handleOpenNewProduct() {
    setEditingProduct(null);
    setEditorOpen(true);
  }

  function handleOpenEditProduct(product: CatalogProduct) {
    setEditingProduct(product);
    setEditorOpen(true);
  }

  function handleOpenPreview() {
    if (onOpenCustomerPreview) {
      onOpenCustomerPreview();
    } else {
      setInternalPreviewOpen(true);
    }
  }

  async function handleToggleActive(product: CatalogProduct) {
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
  }

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

  // Deterministic AI Image Prompt generator (offline)
  const promptPreviewText = React.useMemo(() => {
    const selectedProduct =
      allProducts.find((p) => p.id === selectedPromptProductId) || allProducts[0] || null;
    const analysis = analyzePromptAndGenerateQuestions(
      `${brandName} ${profile.business?.segment || ''} ${selectedProduct?.name || ''}`,
    );
    const nicheStyle =
      analysis.niche === 'fashion'
        ? 'editorial fashion photography, soft studio rim light, minimal architectural background'
        : analysis.niche === 'tech'
          ? 'clean industrial product photography, matte slate surface, soft cyan accent glow'
          : analysis.niche === 'fitness'
            ? 'high contrast commercial studio shot, energetic clean backdrop, crisp label focus'
            : analysis.niche === 'food'
              ? 'warm natural morning light, artisanal tabletop presentation, shallow depth of field'
              : 'modern e-commerce studio photography, soft diffused daylight, neutral warm backdrop';

    if (selectedProduct) {
      return `Commercial studio product photo of "${selectedProduct.name}" (${selectedProduct.category || 'product'}), ${nicheStyle}, centered composition, 4k sharp focus, clean framing for ${brandName} online storefront, no text overlay, no watermark.`;
    }
    return `Hero banner product composition for "${brandName}" (${profile.business?.segment || 'retail store'}), ${nicheStyle}, curated collection display, ultra crisp 4k resolution, no text, no watermark.`;
  }, [allProducts, selectedPromptProductId, brandName, profile.business?.segment]);

  async function handleCopyAiPrompt() {
    const ok = await copyTextToClipboard(promptPreviewText);
    if (ok) {
      setPromptCopied(true);
      showToast({
        type: 'purple',
        message: 'Prompt copiado com sucesso! Agora é só colar no seu gerador de imagens.',
        durationMs: 3000,
      });
      window.setTimeout(() => setPromptCopied(false), 1500);
    }
  }

  async function handleDownloadZip() {
    if (zipGenerating) return;
    setZipGenerating(true);
    setZipProgress(15);
    try {
      const compiled = synthesizeStoreFromProfile(profile, revision);
      const zip = new JSZip();
      setZipProgress(45);

      const publicJson = compiled.publicStore?.publicJsonString || JSON.stringify({
        business: profile.business,
        products: activeProducts.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          priceCents: p.priceCents,
          variation: p.variation,
          stock: p.stock,
          description: p.description,
        })),
      }, null, 2);

      zip.file('catalog.json', publicJson);

      const htmlDoc = [
        '<!doctype html>',
        '<html lang="pt-BR">',
        '<head>',
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width,initial-scale=1" />',
        `<title>${brandName}</title>`,
        '<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}main{max-width:960px;margin:0 auto}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px}.price{font-weight:700;font-size:18px;margin:8px 0}</style>',
        '</head>',
        '<body><main>',
        `<h1>${brandName}</h1>`,
        `<p>${profile.business?.description || 'Catálogo oficial'}</p>`,
        '<div class="grid">',
        ...activeProducts.map(
          (p) =>
            `<article class="card"><h3>${p.name}</h3><p class="price">${formatCurrencyBRL(p.priceCents)}</p><small>${p.category} · ${p.variation}</small></article>`,
        ),
        '</div></main></body></html>',
      ].join('\n');

      zip.file('index.html', htmlDoc);
      for (const file of compiled.publicStore?.filesToZip ?? []) {
        zip.file(file.path, file.data, { base64: file.isBase64 });
      }

      setZipProgress(80);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'loja_completa.zip';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setZipProgress(100);
      showToast({
        type: 'success',
        message: 'Download de loja_completa.zip iniciado com sucesso!',
        durationMs: 3000,
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

  function handleDownloadSampleCsv() {
    const csvContent = [
      'Nome;Preco;Categoria;Estoque',
      'Vestido Linho Natural;249,90;Vestidos;8',
      'Bolsa Couro Caramelo;189,50;Bolsas;5',
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_produtos_companygen.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSelectImportFile(file: File | null) {
    setImportError('');
    if (!file) {
      setImportFileName('');
      setImportRawText('');
      return;
    }
    setImportFileName(file.name);
    try {
      const text = await file.text();
      setImportRawText(text);
    } catch {
      setImportError('Não foi possível ler o arquivo selecionado.');
    }
  }

  async function handleProcessSpreadsheetImport() {
    if (!importRawText.trim() || importSubmitting) return;
    setImportSubmitting(true);
    setImportError('');
    try {
      const lines = importRawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setImportError("Planilha sem colunas 'Nome' e 'Preço'. Baixe o modelo oficial.");
        return;
      }

      const sep = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0]
        .split(sep)
        .map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const nameIdx = headers.findIndex((h) => h.includes('nome'));
      const priceIdx = headers.findIndex((h) => h.includes('preco') || h.includes('valor'));
      const catIdx = headers.findIndex((h) => h.includes('categoria'));
      const stockIdx = headers.findIndex((h) => h.includes('estoque'));

      if (nameIdx === -1 || priceIdx === -1) {
        setImportError("Planilha sem colunas 'Nome' e 'Preço'. Baixe o modelo oficial.");
        return;
      }

      const parsedRows = lines.slice(1).map((line, idx) => {
        const cols = line.split(sep).map((c) => c.trim());
        const name = cols[nameIdx] || '';
        const rawPrice = (cols[priceIdx] || '0').replace(/[^\d.,]/g, '').replace(',', '.');
        const priceCents = Math.round(Number.parseFloat(rawPrice) * 100);
        const category = catIdx >= 0 && cols[catIdx] ? cols[catIdx] : 'Geral';
        const stockParsed = stockIdx >= 0 ? Number.parseInt(cols[stockIdx] || '5', 10) : 5;
        return {
          idx,
          name,
          priceCents: Number.isFinite(priceCents) ? priceCents : 0,
          category,
          stock: Number.isFinite(stockParsed) && stockParsed >= 0 ? stockParsed : 5,
        };
      }).filter((row) => row.name.length >= 2 && row.priceCents > 0);

      if (parsedRows.length === 0) {
        setImportError('Nenhum produto válido encontrado (verifique Nome e Preço > 0).');
        return;
      }

      const snap = await updateBusinessProfile(
        (target) => {
          const existing = [...(target.catalog?.products ?? [])];
          let nextSeq = existing.length + 101;
          for (const row of parsedRows) {
            const matchIdx = existing.findIndex(
              (p) => p.name.trim().toLowerCase() === row.name.toLowerCase(),
            );
            if (matchIdx >= 0) {
              if (importMode === 'update') {
                existing[matchIdx] = {
                  ...existing[matchIdx],
                  priceCents: row.priceCents,
                  category: row.category,
                  stock: row.stock,
                  active: true,
                };
              }
            } else {
              existing.push({
                id: `prod_${Date.now()}_${row.idx}`,
                sku: `SKU-${nextSeq++}`,
                name: row.name,
                category: row.category,
                description: `${row.name} — ${row.category}`,
                priceCents: row.priceCents,
                variation: 'Padrão',
                stock: row.stock,
                imageUrl: buildProductPlaceholderDataUri(row.name, row.category, brandPrimaryColor),
                approvedAsset: true,
                active: true,
                updatedAt: new Date().toISOString(),
              });
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
        message: `${parsedRows.length} produtos importados com sucesso!`,
        durationMs: 3000,
      });
      setImportModalOpen(false);
    } catch {
      setImportError('Não foi possível importar a planilha agora. Tente novamente.');
    } finally {
      setImportSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* TELA 13: Hub Minha Loja */}
      <section
        aria-label="Painel da Minha Loja"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
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
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-[#16A34A]">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Vitrine Online
                </span>
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
              {profile.publishedStore?.published
                ? 'Sua loja está online! Compartilhe o link abaixo no Instagram, WhatsApp e redes sociais.'
                : 'Revise seus produtos abaixo e clique em Publicar Loja para liberar o link aos clientes.'}
            </p>

            {hasPendingRepublish ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
                <AlertTriangle className="size-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                <span>Vitrine possui alterações pendentes de atualização.</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <ActionButton
              variant="primary"
              size={44}
              leftIcon={<Eye className="size-4" />}
              onClick={handleOpenPreview}
            >
              Ver Vitrine como Cliente
            </ActionButton>
            <ActionButton
              variant="success"
              size={44}
              isLoading={publishing}
              loadingText="Publicando..."
              leftIcon={<Rocket className="size-4" />}
              onClick={() => void handlePublishClick()}
            >
              {profile.publishedStore?.published ? 'Atualizar Vitrine' : 'Publicar Loja'}
            </ActionButton>
          </div>
        </div>

        {/* Link Público + Atalhos Secundários */}
        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={publicUrl}
              aria-label="Link público da loja"
              onClick={(e) => e.currentTarget.select()}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
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
            <ActionButton
              variant="purple"
              size={44}
              leftIcon={<Sparkles className="size-4" />}
              onClick={() => {
                setSelectedPromptProductId(allProducts[0]?.id || '');
                setPromptsModalOpen(true);
              }}
            >
              Estúdio de Prompts IA
            </ActionButton>
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={<DownloadCloud className="size-4" />}
              onClick={() => setZipModalOpen(true)}
            >
              Baixar Loja ZIP
            </ActionButton>
          </div>
        </div>
      </section>

      {/* Catálogo de Produtos (TELAS 14, 15, 16) */}
      <section
        aria-label="Catálogo de Produtos"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-5"
      >
        {/* Cabeçalho do Catálogo */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">
              Catálogo de Produtos ({activeProducts.length}{' '}
              {activeProducts.length === 1 ? 'ativo' : 'ativos'})
            </h2>
            <p className="text-xs text-slate-600 sm:text-sm">
              Cada ajuste de preço ou estoque atualiza a vitrine e o atendimento no WhatsApp na hora.
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
              data-testid="open-import-spreadsheet"
              leftIcon={<FileSpreadsheet className="size-4 text-[#16A34A]" />}
              onClick={() => {
                setImportError('');
                setImportModalOpen(true);
              }}
            >
              Importar Planilha (.CSV)
            </ActionButton>
            <ActionButton
              variant="primary"
              size={44}
              leftIcon={<Plus className="size-4" />}
              onClick={handleOpenNewProduct}
            >
              Cadastrar Novo Produto
            </ActionButton>
          </div>
        </div>

        {/* Filtros e Busca (quando há produtos) */}
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
                placeholder="Buscar por nome ou categoria..."
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

        {/* Conteúdo: Skeleton / TELA 14 Vazio / TELA 15 Busca Vazia / TELA 16 Tabela & Cards */}
        {isLoading ? (
          <SkeletonTableRows rows={4} columns={4} />
        ) : allProducts.length === 0 ? (
          <EmptyStateCard
            icon={<Package className="size-7" />}
            title="Seu catálogo ainda está vazio"
            description="Cadastre seu primeiro produto com nome e preço para liberar sua vitrine online e começar a vender."
            ctaLabel="Cadastrar Meu Primeiro Produto"
            ctaIcon={<Plus className="size-5" />}
            ctaSize={56}
            onCta={handleOpenNewProduct}
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyStateCard
            icon={<Search className="size-7" />}
            title="Nenhum produto encontrado"
            description={
              isFiltered
                ? 'Não encontramos itens com esse filtro ou busca. Limpe os filtros para ver todo o catálogo.'
                : 'Nenhum produto disponível no momento.'
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
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table role="table" className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pr-4">Produto</th>
                    <th className="px-4 py-3">Preço</th>
                    <th className="px-4 py-3">Estoque</th>
                    <th className="px-4 py-3">Na Vitrine</th>
                    <th className="py-3 pl-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((product) => {
                    const isActive = product.active !== false;
                    const imgSrc = resolveProductImageUrl(
                      product.imageUrl,
                      product.name,
                      product.category,
                      brandPrimaryColor,
                    );
                    return (
                      <tr key={product.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={imgSrc}
                              alt={product.name}
                              className="size-12 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0F172A]">
                                {product.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {product.category || 'Geral'}
                                {product.variation && product.variation !== 'Padrão'
                                  ? ` · ${product.variation}`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-[#0F172A]">
                          {formatCurrencyBRL(product.priceCents)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              product.stock > 0
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {product.stock > 0 ? `${product.stock} un.` : 'Sem estoque'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isActive}
                            aria-label={`Alternar visibilidade de ${product.name}`}
                            disabled={togglingId === product.id}
                            onClick={() => void handleToggleActive(product)}
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
                              onClick={() => handleOpenEditProduct(product)}
                            >
                              Editar
                            </ActionButton>
                            <button
                              type="button"
                              aria-label={`Excluir ${product.name}`}
                              onClick={() => setDeleteTarget(product)}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-[#EF4444] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards (390px safe) */}
            <div className="space-y-3 md:hidden">
              {filteredProducts.map((product) => {
                const isActive = product.active !== false;
                const imgSrc = resolveProductImageUrl(
                  product.imageUrl,
                  product.name,
                  product.category,
                  brandPrimaryColor,
                );
                return (
                  <article
                    key={product.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={imgSrc}
                        alt={product.name}
                        className="size-16 shrink-0 rounded-xl border border-slate-200 bg-slate-50 object-cover"
                      />
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
                        disabled={togglingId === product.id}
                        onClick={() => void handleToggleActive(product)}
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

                    <div className="flex items-center gap-2">
                      <ActionButton
                        variant="secondary"
                        size={44}
                        fullWidth
                        leftIcon={<Edit3 className="size-4" />}
                        onClick={() => handleOpenEditProduct(product)}
                      >
                        Editar Produto
                      </ActionButton>
                      <button
                        type="button"
                        aria-label={`Excluir ${product.name}`}
                        onClick={() => setDeleteTarget(product)}
                        className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-[#EF4444]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
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

      {/* Modais de Segurança (TELAS 18, 20, 21 + Lote) */}
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

      {/* Drawer Interno de Preview da Vitrine (TELA 22) */}
      <DrawerContainer
        open={internalPreviewOpen}
        onOpenChange={setInternalPreviewOpen}
        size="full"
        title={`Vitrine de ${brandName}`}
        description="Prévia interativa exatamente como seus clientes navegam e compram."
        contentClassName="p-0"
      >
        <CustomerStorefrontView
          profile={profile}
          ownerId={owner}
          mode="preview"
          onBackToAdmin={() => setInternalPreviewOpen(false)}
        />
      </DrawerContainer>

      {/* Modal Estúdio de Prompts IA */}
      <ModalContainer
        open={promptsModalOpen}
        onOpenChange={setPromptsModalOpen}
        maxWidth="lg"
        mobileHeight="85%"
        title="Estúdio de Prompts para Fotos IA"
        description="Copie o comando em inglês abaixo e cole no Gemini, Midjourney ou Leonardo AI para gerar fotos profissionais."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              onClick={() => setPromptsModalOpen(false)}
            >
              Fechar
            </ActionButton>
            <ActionButton
              variant={promptCopied ? 'success' : 'purple'}
              size={44}
              leftIcon={promptCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void handleCopyAiPrompt()}
            >
              {promptCopied ? 'Prompt Copiado!' : 'Copiar Prompt de Foto de Produto'}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {allProducts.length > 0 ? (
            <div className="space-y-1.5">
              <label htmlFor="ai-prompt-product-select" className="block text-sm font-medium text-[#0F172A]">
                Escolha um produto para personalizar o prompt
              </label>
              <select
                id="ai-prompt-product-select"
                value={selectedPromptProductId}
                onChange={(e) => setSelectedPromptProductId(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                {allProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatCurrencyBRL(p.priceCents)})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div
            role="region"
            aria-label="Gerador de Prompts IA"
            className="rounded-xl bg-[#0F172A] p-4 font-mono text-xs leading-relaxed text-slate-100 select-all"
          >
            {promptPreviewText}
          </div>
        </div>
      </ModalContainer>

      {/* Modal Baixar Loja em ZIP */}
      <ModalContainer
        open={zipModalOpen}
        onOpenChange={setZipModalOpen}
        maxWidth="md"
        mobileHeight="auto"
        preventCloseWhileSubmitting={zipGenerating}
        title="Baixar Loja em Arquivo ZIP"
        description="Exporte os arquivos estáticos da sua vitrine para hospedar em qualquer servidor ou guardar como cópia."
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
              Baixar Arquivo loja_completa.zip Agora
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {hasPendingRepublish ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              Recomendamos clicar em <strong>Atualizar Vitrine</strong> antes de baixar para incluir
              suas alterações mais recentes.
            </div>
          ) : null}

          <p className="text-sm leading-relaxed text-slate-600">
            O pacote inclui página inicial (<code className="text-xs font-semibold">index.html</code>),
            catálogo de produtos (<code className="text-xs font-semibold">catalog.json</code>) e imagens
            otimizadas prontas para publicação.
          </p>

          {zipGenerating ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-slate-600">
                <span>Compactando arquivos HTML, CSS e imagens...</span>
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

      {/* TELA 08: Modal Importar Planilha de Produtos (.CSV / .XLSX) */}
      <ModalContainer
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        maxWidth="md"
        mobileHeight="auto"
        preventCloseWhileSubmitting={importSubmitting}
        title="Importar Planilha de Produtos"
        description="Arraste sua planilha Excel ou clique para selecionar. Formatos aceitos: .xlsx e .csv."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              disabled={importSubmitting}
              onClick={() => setImportModalOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="success"
              size={46}
              disabled={!importFileName && !importRawText}
              isLoading={importSubmitting}
              loadingText="Importando..."
              leftIcon={<UploadCloud className="size-4" />}
              onClick={() => void handleProcessSpreadsheetImport()}
            >
              Processar e Importar Planilha
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <label
            htmlFor="spreadsheet-file-input"
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#16A34A] bg-emerald-50/50 p-6 text-center transition-colors hover:bg-emerald-50"
          >
            <FileSpreadsheet className="mb-2 size-8 text-[#16A34A]" aria-hidden="true" />
            <span className="text-sm font-semibold text-[#0F172A]">
              {importFileName ? importFileName : 'Selecionar arquivo .CSV ou .XLSX'}
            </span>
            <span className="mt-1 text-xs text-slate-600">
              Colunas esperadas: Nome, Preço, Categoria e Estoque
            </span>
            <input
              id="spreadsheet-file-input"
              type="file"
              accept=".csv,.xlsx,.txt"
              onChange={(e) => void handleSelectImportFile(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </label>

          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="font-semibold text-[#2563EB] underline underline-offset-4 hover:text-[#1D4ED8]"
            >
              Baixar modelo oficial (.CSV)
            </button>
            <span className="text-slate-500">Validação automática antes de salvar</span>
          </div>

          <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <legend className="px-1 text-xs font-semibold text-[#0F172A]">
              Se encontrar produto com o mesmo nome:
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
              <input
                type="radio"
                name="spreadsheet-conflict-mode"
                checked={importMode === 'update'}
                onChange={() => setImportMode('update')}
                className="accent-[#16A34A]"
              />
              <span>Atualizar produtos existentes</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A]">
              <input
                type="radio"
                name="spreadsheet-conflict-mode"
                checked={importMode === 'skip'}
                onChange={() => setImportMode('skip')}
                className="accent-[#16A34A]"
              />
              <span>Pular existentes</span>
            </label>
          </fieldset>

          {importError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {importError}
            </p>
          ) : null}
        </div>
      </ModalContainer>
    </div>
  );
}
