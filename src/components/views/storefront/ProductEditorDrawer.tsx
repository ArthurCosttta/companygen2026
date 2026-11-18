import * as React from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  buildDefaultMensagemMolde,
  formatCurrencyBRL,
  type CatalogItemType,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { searchWebAssets, type WebAsset } from '@/services/image-search';
import {
  ActionButton,
  DrawerContainer,
  useToast,
} from '@/components/ui';
import { DiscardChangesModal } from './CatalogGuardModals';
import {
  buildProductPlaceholderDataUri,
  formatCentsForInput,
  generateInternalProductCodes,
  parseBRLInputToCents,
  resolveProductImageUrl,
} from './storefront-utils';

export interface ProductEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogProduct | null;
  existingCategories?: string[];
  brandPrimaryColor?: string;
  owner?: string;
  onSaved?: (snap: ProfileSnapshot, savedProduct: CatalogProduct, isEdit: boolean) => void;
}

interface ProductFormState {
  name: string;
  priceText: string;
  category: string;
  variation: string;
  stockText: string;
  description: string;
  imageUrl: string;
  itemType: CatalogItemType;
  prazoOuDuracao: string;
  mensagemMolde: string;
  active: boolean;
}

function createInitialForm(product: CatalogProduct | null): ProductFormState {
  if (!product) {
    return {
      name: '',
      priceText: '',
      category: 'Geral',
      variation: 'Padrão',
      stockText: '10',
      description: '',
      imageUrl: '',
      itemType: 'produto_fisico',
      prazoOuDuracao: '',
      mensagemMolde: '',
      active: true,
    };
  }
  const itemType = product.itemType || 'produto_fisico';
  return {
    name: product.name || '',
    priceText: formatCentsForInput(product.priceCents),
    category: product.category || 'Geral',
    variation: product.variation || 'Padrão',
    stockText: String(Number.isFinite(product.stock) ? product.stock : 0),
    description: product.description || '',
    imageUrl: product.imageUrl || '',
    itemType,
    prazoOuDuracao: product.prazoOuDuracao || '',
    mensagemMolde: product.mensagemMolde || buildDefaultMensagemMolde(product),
    active: product.active !== false,
  };
}

export function ProductEditorDrawer({
  open,
  onOpenChange,
  product,
  existingCategories = [],
  brandPrimaryColor = '#2563EB',
  owner,
  onSaved,
}: ProductEditorDrawerProps) {
  const { showToast } = useToast();
  const isEdit = Boolean(product);

  const [form, setForm] = React.useState<ProductFormState>(() => createInitialForm(product));
  const [baseline, setBaseline] = React.useState<ProductFormState>(() => createInitialForm(product));
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showDiscardModal, setShowDiscardModal] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [touchedPrice, setTouchedPrice] = React.useState(false);
  const [touchedName, setTouchedName] = React.useState(false);

  const [searchingImages, setSearchingImages] = React.useState(false);
  const [imageResults, setImageResults] = React.useState<WebAsset[]>([]);
  const [showImageSearch, setShowImageSearch] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      const initial = createInitialForm(product);
      setForm(initial);
      setBaseline(initial);
      setIsSubmitting(false);
      setShowDiscardModal(false);
      setSubmitError('');
      setTouchedPrice(false);
      setTouchedName(false);
      setImageResults([]);
      setShowImageSearch(false);
    }
  }, [open, product]);

  const isDirty = React.useMemo(
    () =>
      form.name !== baseline.name ||
      form.priceText !== baseline.priceText ||
      form.category !== baseline.category ||
      form.variation !== baseline.variation ||
      form.stockText !== baseline.stockText ||
      form.description !== baseline.description ||
      form.imageUrl !== baseline.imageUrl ||
      form.itemType !== baseline.itemType ||
      form.prazoOuDuracao !== baseline.prazoOuDuracao ||
      form.mensagemMolde !== baseline.mensagemMolde ||
      form.active !== baseline.active,
    [form, baseline],
  );

  const cleanName = form.name.trim();
  const parsedPriceCents = parseBRLInputToCents(form.priceText);
  const parsedStock = Math.max(0, Number.parseInt(form.stockText.replace(/\D/g, ''), 10) || 0);

  const isNameValid = cleanName.length >= 2;
  const isPriceValid = parsedPriceCents > 0;
  const canSubmit = isNameValid && isPriceValid && !isSubmitting;

  const priceChangedInEdit =
    isEdit &&
    product !== null &&
    isPriceValid &&
    parsedPriceCents !== product.priceCents;

  const previewUrl = resolveProductImageUrl(
    form.imageUrl,
    cleanName || 'Produto',
    form.category || 'Catálogo',
    brandPrimaryColor,
  );

  const uniqueCategorySuggestions = React.useMemo(() => {
    const merged = new Set<string>(['Geral', 'Destaques', 'Lançamentos', ...existingCategories]);
    return [...merged].filter(Boolean).slice(0, 8);
  }, [existingCategories]);

  function handleAttemptClose(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (isSubmitting) return;
    if (isDirty) {
      setShowDiscardModal(true);
      return;
    }
    onOpenChange(false);
  }

  function handleLocalFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      showToast({
        type: 'error',
        message: 'Escolha uma imagem JPG, PNG, WebP ou GIF.',
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast({
        type: 'error',
        message: 'A imagem deve ter no máximo 2 MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        setForm((prev) => ({ ...prev, imageUrl: result }));
      }
    };
    reader.onerror = () => {
      showToast({
        type: 'error',
        message: 'Não foi possível ler o arquivo selecionado.',
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleSearchPhotos() {
    const query = cleanName || form.category.trim();
    if (query.length < 2) {
      showToast({
        type: 'amber',
        message: 'Digite o nome do produto antes de buscar fotos.',
      });
      return;
    }
    setShowImageSearch(true);
    setSearchingImages(true);
    try {
      const items = await searchWebAssets(query, 6, 'image', owner);
      setImageResults(items);
      if (items.length === 0) {
        showToast({
          type: 'neutral',
          message: 'Nenhuma foto encontrada para esse nome. Você pode enviar uma do dispositivo.',
        });
      }
    } catch {
      showToast({
        type: 'amber',
        message: 'Busca de fotos indisponível agora. Você pode enviar do dispositivo ou usar a capa padrão.',
      });
    } finally {
      setSearchingImages(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouchedName(true);
    setTouchedPrice(true);
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError('');

    const finalCategory = form.category.trim() || 'Geral';
    const finalVariation = form.variation.trim() || 'Padrão';
    const finalDescription = form.description.trim();
    const trimmedImg = form.imageUrl.trim();
    const finalImageUrl =
      trimmedImg || buildProductPlaceholderDataUri(cleanName, finalCategory, brandPrimaryColor);

    const internalCodes = product
      ? { id: product.id, sku: product.sku }
      : generateInternalProductCodes(cleanName);

    const resolvedMolde =
      form.mensagemMolde.trim() ||
      buildDefaultMensagemMolde({
        name: cleanName,
        priceCents: parsedPriceCents,
        variation: finalVariation,
        itemType: form.itemType,
        prazoOuDuracao: form.prazoOuDuracao.trim(),
      });

    const nextProduct: CatalogProduct = {
      id: internalCodes.id,
      sku: internalCodes.sku,
      name: cleanName,
      category: finalCategory,
      description: finalDescription,
      priceCents: parsedPriceCents,
      variation: finalVariation,
      stock: parsedStock,
      active: form.active,
      imageUrl: finalImageUrl,
      approvedAsset: true,
      itemType: form.itemType,
      prazoOuDuracao: form.prazoOuDuracao.trim(),
      itensInclusosKit: product?.itensInclusosKit || [],
      mensagemMolde: resolvedMolde,
      updatedAt: new Date().toISOString(),
    };

    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          const currentProducts = draft.catalog?.products ?? [];
          if (isEdit && product) {
            const idx = currentProducts.findIndex((p) => p.id === product.id);
            if (idx >= 0) {
              currentProducts[idx] = nextProduct;
            } else {
              currentProducts.unshift(nextProduct);
            }
          } else {
            currentProducts.unshift(nextProduct);
          }
          draft.catalog = { ...draft.catalog, products: currentProducts };
        },
        undefined,
        owner,
      );

      showToast({
        type: 'success',
        message: isEdit
          ? 'Produto atualizado na vitrine e no WhatsApp!'
          : 'Produto publicado no catálogo e na vitrine!',
        durationMs: 2500,
      });

      onSaved?.(snap, nextProduct, isEdit);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível salvar o produto. Tente novamente.';
      setSubmitError(message);
      showToast({
        type: 'error',
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DrawerContainer
        open={open}
        onOpenChange={handleAttemptClose}
        preventCloseWhileSubmitting={isSubmitting}
        size="wide"
        title={isEdit ? `Editar ${product?.name || 'Produto'}` : 'Adicionar Novo Produto'}
        description={
          isEdit
            ? 'Altere preço, estoque ou foto. Tudo é atualizado na vitrine e no WhatsApp.'
            : 'Preencha os dados comerciais abaixo para exibir este item na sua loja.'
        }
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              disabled={isSubmitting}
              onClick={() => handleAttemptClose(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              form="storefront-product-editor-form"
              variant="primary"
              size={46}
              isLoading={isSubmitting}
              loadingText="Salvando..."
              disabled={!canSubmit}
              leftIcon={<Check className="size-4" />}
            >
              {isEdit ? 'Salvar Alterações' : 'Salvar e Publicar no Catálogo'}
            </ActionButton>
          </div>
        }
      >
        <form
          id="storefront-product-editor-form"
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-5"
          noValidate
        >
          {submitError ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#EF4444]" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          ) : null}

          {priceChangedInEdit && product ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
              <span>
                Você alterou o preço de <strong>{formatCurrencyBRL(product.priceCents)}</strong> para{' '}
                <strong>{formatCurrencyBRL(parsedPriceCents)}</strong>.
              </span>
            </div>
          ) : null}

          {/* Foto do Produto */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <img
                src={previewUrl}
                alt={cleanName || 'Prévia do produto'}
                className="size-24 shrink-0 rounded-xl border border-slate-200 bg-white object-cover shadow-xs"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Foto do Produto</p>
                  <p className="text-xs text-slate-600">
                    Envie uma foto real ou deixe a capa padrão automática da sua loja.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleLocalFileChange}
                    className="hidden"
                  />
                  <ActionButton
                    variant="secondary"
                    size={44}
                    leftIcon={<Upload className="size-4" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Enviar Foto
                  </ActionButton>
                  <ActionButton
                    variant="softBlue"
                    size={44}
                    isLoading={searchingImages}
                    leftIcon={<Search className="size-4" />}
                    onClick={() => void handleSearchPhotos()}
                  >
                    Buscar Foto
                  </ActionButton>
                  {form.imageUrl ? (
                    <ActionButton
                      variant="secondary"
                      size={44}
                      leftIcon={<Sparkles className="size-4" />}
                      onClick={() => setForm((prev) => ({ ...prev, imageUrl: '' }))}
                    >
                      Usar Capa Padrão
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            </div>

            {showImageSearch && imageResults.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 sm:grid-cols-6">
                {imageResults.map((asset) => (
                  <button
                    key={asset.rawUrl}
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, imageUrl: asset.rawUrl }));
                      setShowImageSearch(false);
                    }}
                    className="group relative min-h-[64px] overflow-hidden rounded-xl border border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    title={asset.titleSnippet || 'Selecionar foto'}
                  >
                    <img
                      src={asset.thumbnailUrl || asset.rawUrl}
                      alt={asset.titleSnippet || 'Sugestão de foto'}
                      className="h-16 w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-1">
              <label htmlFor="product-image-url" className="block text-xs font-medium text-slate-600">
                Ou cole o link de uma imagem (opcional)
              </label>
              <div className="relative">
                <ImagePlus
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="product-image-url"
                  type="url"
                  value={form.imageUrl.startsWith('data:image/') ? '' : form.imageUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white pr-3.5 pl-9 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>
          </div>

          {/* Nome do Produto */}
          <div className="space-y-1.5">
            <label htmlFor="product-name-input" className="block text-sm font-medium text-[#0F172A]">
              Nome do Produto <span className="text-[#EF4444]">*</span>
            </label>
            <input
              id="product-name-input"
              type="text"
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              onBlur={() => setTouchedName(true)}
              placeholder="Ex: Camiseta Algodão Premium Preta"
              className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            {touchedName && !isNameValid ? (
              <p className="text-xs font-medium text-[#EF4444]">
                Informe um nome com pelo menos 2 letras.
              </p>
            ) : null}
          </div>

          {/* Preço & Estoque */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="product-price-input" className="block text-sm font-medium text-[#0F172A]">
                Preço de Venda (R$) <span className="text-[#EF4444]">*</span>
              </label>
              <input
                id="product-price-input"
                type="text"
                inputMode="decimal"
                required
                value={form.priceText}
                onChange={(e) => setForm((prev) => ({ ...prev, priceText: e.target.value }))}
                onBlur={() => setTouchedPrice(true)}
                placeholder="Ex: 89,90"
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              {touchedPrice && !isPriceValid ? (
                <p className="text-xs font-medium text-[#EF4444]">
                  Informe um valor de venda maior que zero.
                </p>
              ) : isPriceValid ? (
                <p className="text-xs text-slate-500">
                  Será exibido como {formatCurrencyBRL(parsedPriceCents)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-stock-input" className="block text-sm font-medium text-[#0F172A]">
                Quantidade em Estoque
              </label>
              <input
                id="product-stock-input"
                type="text"
                inputMode="numeric"
                value={form.stockText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, stockText: e.target.value.replace(/\D/g, '') }))
                }
                placeholder="10"
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              <p className="text-xs text-slate-500">Unidades disponíveis para pronta entrega.</p>
            </div>
          </div>

          {/* Categoria & Variação */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="product-category-input" className="block text-sm font-medium text-[#0F172A]">
                Categoria
              </label>
              <input
                id="product-category-input"
                type="text"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Ex: Destaques, Calçados, Bebidas"
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {uniqueCategorySuggestions.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, category: cat }))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      form.category.trim().toLowerCase() === cat.toLowerCase()
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-variation-input" className="block text-sm font-medium text-[#0F172A]">
                Tamanho ou Opção
              </label>
              <input
                id="product-variation-input"
                type="text"
                value={form.variation}
                onChange={(e) => setForm((prev) => ({ ...prev, variation: e.target.value }))}
                placeholder="Ex: Padrão, P / M / G, 500ml"
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          {/* Tipo do Item & Prazo/Duração */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="product-itemtype-select" className="block text-sm font-medium text-[#0F172A]">
                Tipo do Item
              </label>
              <select
                id="product-itemtype-select"
                value={form.itemType}
                onChange={(e) => {
                  const nextType = e.target.value as CatalogItemType;
                  setForm((prev) => ({
                    ...prev,
                    itemType: nextType,
                    mensagemMolde: buildDefaultMensagemMolde({
                      name: prev.name || 'Item',
                      priceCents: parseBRLInputToCents(prev.priceText),
                      variation: prev.variation,
                      itemType: nextType,
                      prazoOuDuracao: prev.prazoOuDuracao,
                    }),
                  }));
                }}
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="produto_fisico">Produto Físico</option>
                <option value="servico_agendado">Serviço Agendado</option>
                <option value="kit_combo">Kit / Combo</option>
                <option value="sob_medida">Sob Medida / Orçamento</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="product-prazo-input" className="block text-sm font-medium text-[#0F172A]">
                Prazo ou Duração (opcional)
              </label>
              <input
                id="product-prazo-input"
                type="text"
                value={form.prazoOuDuracao}
                onChange={(e) => setForm((prev) => ({ ...prev, prazoOuDuracao: e.target.value }))}
                placeholder="Ex: Entrega 40 min / Sessão 1h / 3 dias"
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>
          </div>

          {/* Mensagem Molde Pré-carregada do WhatsApp */}
          <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="product-molde-input" className="block text-sm font-semibold text-[#0F172A]">
                Mensagem Molde do WhatsApp
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    mensagemMolde: buildDefaultMensagemMolde({
                      name: prev.name || 'Item',
                      priceCents: parseBRLInputToCents(prev.priceText),
                      variation: prev.variation,
                      itemType: prev.itemType,
                      prazoOuDuracao: prev.prazoOuDuracao,
                    }),
                  }))
                }
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-xs hover:bg-emerald-100"
              >
                Gerar Molde Padrão
              </button>
            </div>
            <textarea
              id="product-molde-input"
              rows={3}
              value={form.mensagemMolde}
              onChange={(e) => setForm((prev) => ({ ...prev, mensagemMolde: e.target.value }))}
              placeholder="Mensagem automática quando o cliente clicar em Pedir no WhatsApp..."
              className="w-full rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
            />
            <div className="flex flex-wrap gap-1.5">
              {['{nomeProduto}', '{preco}', '{variacao}', '{prazo}'].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      mensagemMolde: `${prev.mensagemMolde}${prev.mensagemMolde ? ' ' : ''}${tag}`,
                    }))
                  }
                  className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-mono text-emerald-800 hover:bg-emerald-100"
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <label htmlFor="product-description-input" className="block text-sm font-medium text-[#0F172A]">
              Descrição para o Cliente (opcional)
            </label>
            <textarea
              id="product-description-input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Conte os diferenciais, material, sabor ou forma de entrega..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>

          {/* Visibilidade na Vitrine */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">Exibir na vitrine online</p>
              <p className="text-xs text-slate-600">
                Quando pausado, o item fica oculto para clientes sem perder os dados.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              aria-label="Exibir produto na vitrine online"
              onClick={() => setForm((prev) => ({ ...prev, active: !prev.active }))}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                form.active ? 'bg-[#16A34A]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block size-6 rounded-full bg-white shadow-sm transition-transform ${
                  form.active ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </form>
      </DrawerContainer>

      <DiscardChangesModal
        open={showDiscardModal}
        onOpenChange={setShowDiscardModal}
        onConfirmDiscard={() => {
          setShowDiscardModal(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
