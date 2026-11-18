import React from 'react';
import {
  X,
  Search,
  CheckCheck,
  RefreshCw,
  Image as ImageIcon,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { useToast } from '@/components/ui/ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';
import type { CatalogProduct } from '@/schemas/profile.schema';
import { ProductImageDetailModal } from './ProductImageDetailModal';

export interface CandidateImage {
  url: string;
  previewUrl: string;
  sourceTitle?: string;
  declaredWidth?: number;
  declaredHeight?: number;
  sourceDomain?: string;
}

export interface BatchImageItemResult {
  product: CatalogProduct;
  status: 'pending' | 'searching' | 'found' | 'not_found' | 'error';
  selectedImageUrl: string | null;
  selectedCandidate?: CandidateImage;
  candidates: CandidateImage[];
  error?: string;
}

export interface BatchImageSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: CatalogProduct[];
  owner?: string;
  onApplyImages: (updates: Array<{ productId: string; imageUrl: string }>) => Promise<void>;
}

export function BatchImageSearchModal({
  open,
  onOpenChange,
  selectedProducts,
  owner,
  onApplyImages,
}: BatchImageSearchModalProps) {
  const { showToast } = useToast();
  const [items, setItems] = React.useState<BatchImageItemResult[]>([]);
  const [isSearchingAll, setIsSearchingAll] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);

  // Estado para o Modal de Inspeção em Alta Resolução / Zoom
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [detailImage, setDetailImage] = React.useState<{
    rawUrl: string;
    thumbnailUrl?: string;
    declaredWidth?: number;
    declaredHeight?: number;
    sourceDomain?: string;
    titleSnippet?: string;
    productIndex?: number;
  } | null>(null);
  const [detailProductName, setDetailProductName] = React.useState('');

  const wasOpenRef = React.useRef(false);
  const lastSelectionKeyRef = React.useRef('');

  React.useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      lastSelectionKeyRef.current = '';
      return;
    }
    const selectionKey = selectedProducts.map((p) => p.id).join('|');
    if (wasOpenRef.current && lastSelectionKeyRef.current === selectionKey) {
      return;
    }
    wasOpenRef.current = true;
    lastSelectionKeyRef.current = selectionKey;

    const initial: BatchImageItemResult[] = selectedProducts.map((p) => {
      const currentUrl = p.imageUrl?.trim() || null;
      const initialCandidate: CandidateImage | undefined = currentUrl
        ? { url: currentUrl, previewUrl: currentUrl, sourceTitle: 'Atual' }
        : undefined;
      return {
        product: p,
        status: 'pending',
        selectedImageUrl: currentUrl,
        selectedCandidate: initialCandidate,
        candidates: initialCandidate ? [initialCandidate] : [],
      };
    });
    setItems(initial);
  }, [open, selectedProducts]);

  const runHuntQuery = async (queryText: string) => {
    const res = await authenticatedFetch(
      '/api/hunt',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, count: 6, mediaType: 'image' }),
      },
      owner,
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error || `Erro HTTP ${res.status} ao buscar imagens.`);
    }
    return Array.isArray(json?.items) ? json.items : [];
  };

  const searchSingleProduct = async (
    item: BatchImageItemResult,
  ): Promise<BatchImageItemResult> => {
    const targetId = item.product.id;
    setItems((prev) =>
      prev.map((it) => (it.product.id === targetId ? { ...it, status: 'searching', error: undefined } : it)),
    );

    const primaryQuery = item.product.name.replace(/\s+/g, ' ').trim();
    const shortWords = primaryQuery
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .slice(0, 4)
      .join(' ');
    const fallbackQuery = `${shortWords} ${item.product.category || ''}`.replace(/\s+/g, ' ').trim();

    try {
      let rawItems = await runHuntQuery(primaryQuery);
      if (rawItems.length === 0 && fallbackQuery && fallbackQuery !== primaryQuery) {
        rawItems = await runHuntQuery(fallbackQuery);
      }

      if (rawItems.length === 0) {
        const updated: BatchImageItemResult = {
          ...item,
          status: 'not_found',
          error: 'Nenhuma imagem encontrada para este produto.',
        };
        setItems((prev) => prev.map((it) => (it.product.id === targetId ? updated : it)));
        return updated;
      }

      const candidates: CandidateImage[] = rawItems
        .map((raw: {
          rawUrl?: string;
          url?: string;
          thumbnailUrl?: string;
          thumbnail?: string;
          titleSnippet?: string;
          title?: string;
          sourceDomain?: string;
          source?: string;
          declaredWidth?: number;
          declaredHeight?: number;
          width?: number;
          height?: number;
        }) => {
          const fullUrl = raw.rawUrl || raw.url || raw.thumbnailUrl || raw.thumbnail || '';
          const thumbUrl = raw.thumbnailUrl || raw.thumbnail || raw.rawUrl || raw.url || '';
          return {
            url: fullUrl,
            previewUrl: thumbUrl,
            sourceTitle: raw.titleSnippet || raw.title || 'Imagem encontrada',
            declaredWidth: raw.declaredWidth || raw.width || 0,
            declaredHeight: raw.declaredHeight || raw.height || 0,
            sourceDomain: raw.sourceDomain || raw.source || '',
          };
        })
        .filter((c: CandidateImage) => Boolean(c.url));

      const firstCand = candidates[0];
      const updated: BatchImageItemResult = {
        ...item,
        status: candidates.length > 0 ? 'found' : 'not_found',
        selectedImageUrl: firstCand?.url || item.selectedImageUrl,
        selectedCandidate: firstCand || item.selectedCandidate,
        candidates,
      };
      setItems((prev) => prev.map((it) => (it.product.id === targetId ? updated : it)));
      return updated;
    } catch (err) {
      const updated: BatchImageItemResult = {
        ...item,
        status: 'error',
        error: err instanceof Error ? err.message : 'Falha ao buscar imagens.',
      };
      setItems((prev) => prev.map((it) => (it.product.id === targetId ? updated : it)));
      return updated;
    }
  };

  const handleStartSearchAll = async () => {
    if (isSearchingAll) return;
    const snapshot = [...items];
    if (snapshot.length === 0) return;
    setIsSearchingAll(true);
    let foundAny = 0;
    try {
      for (let i = 0; i < snapshot.length; i += 1) {
        const result = await searchSingleProduct(snapshot[i]);
        if (result.status === 'found') foundAny += 1;
        await new Promise((r) => setTimeout(r, 150));
      }
      showToast({
        type: foundAny > 0 ? 'success' : 'error',
        message:
          foundAny > 0
            ? `Busca concluída: ${foundAny} de ${snapshot.length} produto(s) com imagens prontas!`
            : 'Nenhuma nova imagem encontrada para os produtos selecionados.',
        durationMs: 3500,
      });
    } finally {
      setIsSearchingAll(false);
    }
  };

  const handleApplyAll = async () => {
    const validUpdates = items
      .filter((it) => it.selectedImageUrl && it.selectedImageUrl.trim())
      .map((it) => ({
        productId: it.product.id,
        imageUrl: it.selectedImageUrl as string,
      }));

    if (validUpdates.length === 0) {
      showToast({
        type: 'error',
        message: 'Nenhuma imagem selecionada para aplicar ao catálogo.',
        durationMs: 3000,
      });
      return;
    }

    setIsApplying(true);
    try {
      await onApplyImages(validUpdates);
      showToast({
        type: 'success',
        message: `${validUpdates.length} imagem(ns) vinculada(s) aos produtos com sucesso!`,
        durationMs: 4000,
      });
      onOpenChange(false);
    } catch {
      showToast({
        type: 'error',
        message: 'Falha ao salvar as imagens no catálogo.',
        durationMs: 4000,
      });
    } finally {
      setIsApplying(false);
    }
  };

  const openZoomDetail = (
    cand: CandidateImage,
    productName: string,
    productIndex: number,
  ) => {
    setDetailProductName(productName);
    setDetailImage({
      rawUrl: cand.url,
      thumbnailUrl: cand.previewUrl,
      declaredWidth: cand.declaredWidth,
      declaredHeight: cand.declaredHeight,
      sourceDomain: cand.sourceDomain,
      titleSnippet: cand.sourceTitle,
      productIndex,
    });
    setDetailModalOpen(true);
  };

  const handleSetOfficialFromDetail = (imageUrl: string) => {
    if (detailImage?.productIndex !== undefined) {
      const idx = detailImage.productIndex;
      setItems((prev) =>
        prev.map((it, i) =>
          i === idx
            ? {
                ...it,
                selectedImageUrl: imageUrl,
                selectedCandidate: it.candidates.find((c) => c.url === imageUrl),
              }
            : it,
        ),
      );
      showToast({
        type: 'success',
        message: 'Imagem selecionada como foto oficial deste SKU!',
        durationMs: 2500,
      });
    }
  };

  if (!open) return null;

  const foundCount = items.filter((it) => it.selectedImageUrl).length;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-image-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      >
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h2 id="batch-image-title" className="text-base font-bold text-[#0F172A]">
                  Procurar Imagens em Massa na Web
                </h2>
                <p className="text-xs text-slate-500">
                  {items.length} produto(s) selecionado(s) · {foundCount} com imagem pronta para aplicar
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Toolbar superior */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-3">
            <span className="text-xs font-semibold text-slate-600">
              A IA busca fotos comerciais limpas correspondentes a cada SKU ou título do item.
            </span>
            <ActionButton
              data-testid="batch-search-start-btn"
              variant="primary"
              size={44}
              isLoading={isSearchingAll}
              loadingText="Buscando na Web..."
              leftIcon={<Search className="size-4" />}
              onClick={() => void handleStartSearchAll()}
            >
              Iniciar Busca Automática ({items.length})
            </ActionButton>
          </div>

          {/* Lista de Produtos / Resultados */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((item, index) => {
                const currentImg = item.selectedImageUrl;
                const activeCand =
                  item.selectedCandidate ||
                  item.candidates.find((c) => c.url === currentImg) ||
                  (currentImg ? { url: currentImg, previewUrl: currentImg } : null);

                return (
                  <div
                    key={item.product.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      {/* Preview da Imagem com botão de Zoom */}
                      <div
                        data-testid={`batch-candidate-zoom-${item.product.id}`}
                        className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 cursor-pointer"
                        onClick={() => {
                          if (activeCand) {
                            openZoomDetail(activeCand, item.product.name, index);
                          }
                        }}
                        title="Clique para inspecionar em alta resolução"
                      >
                        {currentImg ? (
                          <>
                            <img
                              src={activeCand?.previewUrl || currentImg}
                              alt={item.product.name}
                              onError={(e) => {
                                const imgEl = e.currentTarget;
                                if (currentImg && imgEl.src !== currentImg) {
                                  imgEl.src = currentImg;
                                }
                              }}
                              className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Maximize2 className="size-5 text-white drop-shadow" />
                            </div>
                          </>
                        ) : (
                          <div className="flex size-full flex-col items-center justify-center text-slate-400">
                            <ImageIcon className="size-6" />
                            <span className="text-[10px]">Sem foto</span>
                          </div>
                        )}
                        {item.status === 'searching' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-2xs">
                            <RefreshCw className="size-5 animate-spin text-white" />
                          </div>
                        )}
                      </div>

                      {/* Dados do Produto */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#0F172A]">{item.product.name}</p>
                        <p className="text-xs text-slate-500">
                          {item.product.category || 'Sem categoria'} · SKU: {item.product.sku || 'N/A'}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                              item.status === 'found'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'searching'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : item.status === 'not_found' || item.status === 'error'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.status === 'found'
                              ? 'Imagem Encontrada'
                              : item.status === 'searching'
                                ? 'Buscando...'
                                : item.status === 'not_found'
                                  ? 'Sem resultado'
                                  : item.status === 'error'
                                    ? 'Erro na busca'
                                    : 'Aguardando busca'}
                          </span>

                          {activeCand?.declaredWidth && activeCand?.declaredHeight ? (
                            <span className="text-[10px] font-mono text-slate-400">
                              {activeCand.declaredWidth}×{activeCand.declaredHeight}
                            </span>
                          ) : null}
                        </div>
                        {item.error ? (
                          <p className="mt-1 text-[11px] text-amber-700">{item.error}</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Seleção de Alternativas encontradas */}
                    {item.candidates.length > 1 && (
                      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400">Opções:</span>
                        {item.candidates.map((cand, ci) => (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => {
                              setItems((prev) =>
                                prev.map((it, idx) =>
                                  idx === index
                                    ? {
                                        ...it,
                                        selectedImageUrl: cand.url,
                                        selectedCandidate: cand,
                                      }
                                    : it,
                                ),
                              );
                            }}
                            onDoubleClick={() => openZoomDetail(cand, item.product.name, index)}
                            title={
                              cand.sourceDomain
                                ? `${cand.sourceDomain} (Duplo clique para zoom)`
                                : 'Duplo clique para zoom'
                            }
                            className={`relative size-8 shrink-0 overflow-hidden rounded-lg border transition-all ${
                              item.selectedImageUrl === cand.url
                                ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                                : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={cand.previewUrl} alt="" className="size-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rodapé com Ações */}
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/50">
            <span className="text-xs text-slate-500">
              {foundCount} de {items.length} itens com imagem definida. Clique na miniatura para zoom em alta resolução.
            </span>
            <div className="flex items-center gap-2">
              <ActionButton
                variant="secondary"
                size={44}
                onClick={() => onOpenChange(false)}
                disabled={isApplying}
              >
                Cancelar
              </ActionButton>
              <ActionButton
                data-testid="batch-search-apply-btn"
                variant="success"
                size={44}
                isLoading={isApplying}
                loadingText="Aplicando..."
                leftIcon={<CheckCheck className="size-4" />}
                onClick={() => void handleApplyAll()}
                disabled={foundCount === 0}
              >
                Aplicar Imagens ({foundCount})
              </ActionButton>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Detalhe e Nitidez / Zoom em Alta Resolução */}
      <ProductImageDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        productName={detailProductName}
        image={detailImage}
        onSetOfficialPhoto={handleSetOfficialFromDetail}
      />
    </>
  );
}
