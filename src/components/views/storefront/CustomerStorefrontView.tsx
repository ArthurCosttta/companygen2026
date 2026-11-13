import * as React from 'react';
import {
  ArrowLeft,
  Check,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessOrder,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  ActionButton,
  DrawerContainer,
  EmptyStateCard,
  ModalContainer,
  SkeletonBlock,
  useToast,
} from '@/components/ui';
import {
  buildProductPlaceholderDataUri,
  buildWhatsappDirectUrl,
  copyTextToClipboard,
  resolveProductImageUrl,
  sanitizeProductForCustomerDisplay,
} from './storefront-utils';

export interface StoreCartItem {
  productId: string;
  sku: string;
  name: string;
  variation: string;
  priceCents: number;
  imageUrl: string;
  category: string;
  quantity: number;
  maxStock: number;
}

export interface CustomerStorefrontViewProps {
  profile: BusinessProfile;
  ownerId?: string;
  mode?: 'preview' | 'public';
  isLoading?: boolean;
  onBackToAdmin?: () => void;
  onOrderCreated?: (order: BusinessOrder) => void;
}

function getCartStorageKey(profile: BusinessProfile, ownerId?: string): string {
  const key = ownerId || profile.publishedStore?.publicSlug || 'loja';
  return `cart_items_${key}`;
}

function loadPersistedCart(storageKey: string): StoreCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoreCartItem =>
        Boolean(item) &&
        typeof item.productId === 'string' &&
        typeof item.name === 'string' &&
        Number.isFinite(item.priceCents) &&
        Number.isFinite(item.quantity) &&
        item.quantity >= 1,
    );
  } catch {
    return [];
  }
}

export function CustomerStorefrontView({
  profile,
  ownerId,
  mode = 'public',
  isLoading = false,
  onBackToAdmin,
  onOrderCreated,
}: CustomerStorefrontViewProps) {
  const { showToast } = useToast();
  const storageKey = getCartStorageKey(profile, ownerId);

  const [cart, setCart] = React.useState<StoreCartItem[]>(() => loadPersistedCart(storageKey));
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('Todas');
  const [detailProduct, setDetailProduct] = React.useState<CatalogProduct | null>(null);
  const [detailQty, setDetailQty] = React.useState(1);
  const [cartOpen, setCartOpen] = React.useState(false);

  // Checkout fields
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [deliveryType, setDeliveryType] = React.useState<'entrega' | 'retirada'>('entrega');
  const [deliveryNotes, setDeliveryNotes] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'pix' | 'credit_card' | 'cash'>('pix');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [brokenImages, setBrokenImages] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setCart(loadPersistedCart(storageKey));
  }, [storageKey]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart, storageKey]);

  const brandName = profile.business?.name?.trim() || 'Minha Loja';
  const brandColor = profile.brand?.primaryColor || '#2563EB';
  const storePhone = profile.whatsapp?.phoneE164 || '';
  const hasStorePhone = isValidProductionPhone(storePhone);

  const activeProducts = React.useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => p.active !== false),
    [profile.catalog?.products],
  );

  const categories = React.useMemo(() => {
    const set = new Set<string>(['Todas']);
    for (const p of activeProducts) {
      set.add((p.category || 'Geral').trim() || 'Geral');
    }
    return [...set];
  }, [activeProducts]);

  const filteredProducts = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      const cat = (p.category || 'Geral').trim() || 'Geral';
      const matchesCat = selectedCategory === 'Todas' || cat === selectedCategory;
      if (!matchesCat) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        cat.toLowerCase().includes(query) ||
        (p.description || '').toLowerCase().includes(query)
      );
    });
  }, [activeProducts, searchQuery, selectedCategory]);

  const totalItemsCount = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const totalCents = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [cart],
  );

  function getImageSrc(product: { id: string; imageUrl?: string; name: string; category?: string }) {
    if (brokenImages[product.id]) {
      return buildProductPlaceholderDataUri(product.name, product.category || 'Loja', brandColor);
    }
    return resolveProductImageUrl(
      product.imageUrl,
      product.name,
      product.category || 'Loja',
      brandColor,
    );
  }

  function handleOpenDetail(product: CatalogProduct) {
    setDetailProduct(product);
    setDetailQty(1);
  }

  function handleAddToCart(product: CatalogProduct, quantity: number) {
    const cleanQty = Math.max(1, quantity);
    const display = sanitizeProductForCustomerDisplay(product);
    setCart((prev) => {
      const idx = prev.findIndex((item) => item.productId === product.id);
      if (idx >= 0) {
        const next = [...prev];
        const max = Math.max(1, product.stock || 99);
        next[idx] = {
          ...next[idx],
          quantity: Math.min(max, next[idx].quantity + cleanQty),
        };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: display.name,
          variation: display.variation,
          priceCents: display.priceCents,
          imageUrl: display.imageUrl,
          category: display.category,
          quantity: cleanQty,
          maxStock: Math.max(1, product.stock || 99),
        },
      ];
    });

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch {}
    }

    setDetailProduct(null);
    setCartOpen(true);
    showToast({
      type: 'success',
      message: `${product.name} adicionado à sacola!`,
      durationMs: 2200,
    });
  }

  function handleUpdateCartQty(productId: string, nextQty: number) {
    if (nextQty < 1) return;
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(item.maxStock || 99, nextQty) }
          : item,
      ),
    );
  }

  function handleRemoveCartItem(itemToRemove: StoreCartItem) {
    setCart((prev) => prev.filter((item) => item.productId !== itemToRemove.productId));
    showToast({
      type: 'amber',
      message: `"${itemToRemove.name}" removido da sacola.`,
      durationMs: 5000,
      actionLabel: 'Desfazer',
      onUndo: () => {
        setCart((prev) => {
          if (prev.some((i) => i.productId === itemToRemove.productId)) return prev;
          return [...prev, itemToRemove];
        });
      },
    });
  }

  const cleanCustomerName = customerName.trim();
  const cleanCustomerPhoneDigits = customerPhone.replace(/\D/g, '');
  const isCheckoutReady =
    cart.length > 0 &&
    cleanCustomerName.length > 0 &&
    cleanCustomerPhoneDigits.length >= 10 &&
    !isSubmitting;

  function buildOrderWhatsappText(orderRef?: string): string {
    const lines = [
      `Olá, *${brandName}*! Gostaria de fazer um pedido:`,
      orderRef ? `Pedido: *#${orderRef}*` : '',
      '',
      ...cart.map(
        (item) =>
          `• ${item.quantity}x ${item.name}${item.variation && item.variation !== 'Padrão' ? ` (${item.variation})` : ''} — ${formatCurrencyBRL(item.priceCents * item.quantity)}`,
      ),
      '',
      `*Total: ${formatCurrencyBRL(totalCents)}*`,
      `Nome: ${cleanCustomerName}`,
      `WhatsApp: ${customerPhone}`,
      `Recebimento: ${deliveryType === 'retirada' ? 'Retirar na loja' : 'Entrega'}`,
      deliveryNotes.trim() ? `Obs/Endereço: ${deliveryNotes.trim()}` : '',
      `Pagamento: ${paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'credit_card' ? 'Cartão' : 'Dinheiro'}`,
    ].filter(Boolean);
    return lines.join('\n');
  }

  async function openWhatsappFallback(text: string) {
    if (hasStorePhone) {
      const waUrl = buildWhatsappDirectUrl(storePhone, text);
      if (waUrl) {
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        return true;
      }
    }
    await copyTextToClipboard(text);
    return false;
  }

  async function handleSubmitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!isCheckoutReady) return;

    setIsSubmitting(true);
    try {
      const response = await authenticatedFetch(
        '/api/orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: cleanCustomerName,
            customerPhone: sanitizePhoneE164(cleanCustomerPhoneDigits),
            paymentMethod,
            deliveryAddress: {
              mode: deliveryType,
              notes: deliveryNotes.trim(),
            },
            shippingCents: 0,
            items: cart.map((item) => ({
              sku: item.sku,
              name: item.name,
              variation: item.variation,
              qty: item.quantity,
            })),
          }),
        },
        ownerId,
      );

      const raw = await response.json().catch(() => ({}));
      if (!response.ok || !raw.order) {
        throw new Error(raw.error || 'Falha ao enviar pedido.');
      }

      const createdOrder = raw.order as BusinessOrder;
      onOrderCreated?.(createdOrder);

      const messageText = buildOrderWhatsappText(createdOrder.order_ref);
      const openedWa = await openWhatsappFallback(messageText);

      setCart([]);
      setCartOpen(false);
      showToast({
        type: 'success',
        message: openedWa
          ? `Pedido #${createdOrder.order_ref} gerado! Abrindo WhatsApp...`
          : `Pedido #${createdOrder.order_ref} salvo com sucesso!`,
        durationMs: 3500,
      });
    } catch {
      const fallbackText = buildOrderWhatsappText();
      const openedWa = await openWhatsappFallback(fallbackText);
      showToast({
        type: 'amber',
        message: openedWa
          ? 'Sem conexão com o servidor. Abrindo seu pedido diretamente no WhatsApp!'
          : 'Sem conexão agora. Resumo do pedido copiado para você enviar no WhatsApp!',
        durationMs: 4000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const detailSanitized = detailProduct ? sanitizeProductForCustomerDisplay(detailProduct) : null;

  return (
    <div className="min-h-full bg-[#F8FAFC] text-[#0F172A]">
      {/* Faixa Modo Preview do Lojista */}
      {mode === 'preview' ? (
        <div className="sticky top-0 z-30 border-b border-blue-200 bg-[#EFF6FF] px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1D4ED8] sm:text-sm">
              <Sparkles className="size-4 shrink-0" aria-hidden="true" />
              <span>Visualização de como seus clientes veem a loja</span>
            </div>
            {onBackToAdmin ? (
              <ActionButton
                variant="secondary"
                size={44}
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={onBackToAdmin}
              >
                Voltar ao Painel
              </ActionButton>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Cabeçalho da Vitrine */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {profile.brand?.logoUrl ? (
                <img
                  src={profile.brand.logoUrl}
                  alt={brandName}
                  className="size-12 shrink-0 rounded-2xl border border-slate-200 object-cover"
                />
              ) : (
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-xs"
                  style={{ backgroundColor: brandColor }}
                  aria-hidden="true"
                >
                  {brandName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold tracking-tight text-[#0F172A] sm:text-xl">
                  {brandName}
                </h1>
                <p className="truncate text-xs text-slate-600 sm:text-sm">
                  {profile.business?.description ||
                    profile.business?.hours ||
                    'Escolha seus produtos e finalize direto pelo WhatsApp'}
                </p>
              </div>
            </div>

            <ActionButton
              variant="primary"
              size={44}
              leftIcon={<ShoppingBag className="size-4" />}
              onClick={() => setCartOpen(true)}
              aria-label={`Abrir sacola com ${totalItemsCount} itens`}
            >
              <span>Sacola</span>
              {totalItemsCount > 0 ? (
                <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-[#2563EB]">
                  {totalItemsCount}
                </span>
              ) : null}
            </ActionButton>
          </div>

          {profile.business?.address ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {profile.business.address}
              </span>
              {profile.business?.hours ? <span>{profile.business.hours}</span> : null}
            </div>
          ) : null}

          {/* Busca + Categorias */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="O que você procura hoje?"
                aria-label="Buscar produtos na loja"
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3.5 pl-10 text-sm text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => {
                const selected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[44px] shrink-0 rounded-xl px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                      selected
                        ? 'bg-[#0F172A] text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Grade de Produtos (TELA 22) */}
      <main
        role="region"
        aria-label="Catálogo da Vitrine"
        className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6"
      >
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
                <SkeletonBlock className="aspect-square w-full" rounded="xl" />
                <SkeletonBlock className="h-4 w-3/4" />
                <SkeletonBlock className="h-5 w-1/2" />
                <SkeletonBlock className="h-11 w-full" />
              </div>
            ))}
          </div>
        ) : activeProducts.length === 0 ? (
          <EmptyStateCard
            icon={<ShoppingBag className="size-7" />}
            title="Vitrine em preparação"
            description="Esta loja ainda está organizando seus produtos. Volte em instantes ou fale no WhatsApp."
            ctaLabel={hasStorePhone ? 'Falar no WhatsApp' : undefined}
            onCta={
              hasStorePhone
                ? () => {
                    const url = buildWhatsappDirectUrl(
                      storePhone,
                      `Olá, ${brandName}! Gostaria de saber sobre os produtos disponíveis.`,
                    );
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }
                : undefined
            }
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyStateCard
            icon={<Search className="size-7" />}
            title="Nenhum produto encontrado para sua pesquisa"
            description="Tente buscar por outro termo ou limpe os filtros para ver todo o catálogo."
            ctaLabel="Limpar Filtros"
            ctaVariant="secondary"
            onCta={() => {
              setSearchQuery('');
              setSelectedCategory('Todas');
            }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const display = sanitizeProductForCustomerDisplay(product);
              const outOfStock = display.stock <= 0;
              return (
                <article
                  key={product.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(product)}
                    className="group relative aspect-square w-full overflow-hidden bg-slate-50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    <img
                      src={getImageSrc(display)}
                      alt={display.name}
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [product.id]: true }))
                      }
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {outOfStock ? (
                      <span className="absolute top-2.5 left-2.5 rounded-lg bg-slate-900/85 px-2.5 py-1 text-[11px] font-semibold text-white">
                        Sob consulta
                      </span>
                    ) : null}
                  </button>

                  <div className="flex flex-1 flex-col justify-between gap-3 p-3 sm:p-4">
                    <div className="space-y-1">
                      <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {display.category}
                      </span>
                      <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-[#0F172A] sm:text-base">
                        {display.name}
                      </h2>
                      <p className="pt-1 text-base font-bold text-[#0F172A] sm:text-lg">
                        {formatCurrencyBRL(display.priceCents)}
                      </p>
                      {display.priceCents >= 3000 ? (
                        <p className="text-[11px] text-slate-500">
                          em até 3x sem juros · Pix ou Cartão
                        </p>
                      ) : null}
                    </div>

                    <ActionButton
                      variant="dark"
                      size={44}
                      fullWidth
                      rightIcon={<ShoppingBag className="size-4" />}
                      onClick={() => handleOpenDetail(product)}
                    >
                      Comprar
                    </ActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Barra Flutuante Mobile da Sacola */}
      {totalItemsCount > 0 ? (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-md md:hidden">
          <ActionButton
            variant="success"
            size={50}
            fullWidth
            leftIcon={<ShoppingBag className="size-5" />}
            onClick={() => setCartOpen(true)}
          >
            Ver Sacola ({totalItemsCount}) · {formatCurrencyBRL(totalCents)}
          </ActionButton>
        </div>
      ) : null}

      {/* Modal de Detalhes do Produto */}
      <ModalContainer
        open={Boolean(detailProduct)}
        onOpenChange={(open) => {
          if (!open) setDetailProduct(null);
        }}
        maxWidth="lg"
        mobileHeight="90%"
        title={detailSanitized?.name || 'Detalhes do Produto'}
        description={detailSanitized ? `${detailSanitized.category} · ${detailSanitized.variation}` : undefined}
        footer={
          detailProduct ? (
            <div className="flex flex-col gap-2.5 sm:flex-row">
              {hasStorePhone ? (
                <ActionButton
                  variant="secondary"
                  size={48}
                  leftIcon={<MessageCircle className="size-4 text-[#16A34A]" />}
                  onClick={() => {
                    const url = buildWhatsappDirectUrl(
                      storePhone,
                      `Olá, ${brandName}! Tenho uma dúvida sobre "${detailProduct.name}" (${formatCurrencyBRL(detailProduct.priceCents)}).`,
                    );
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Tirar Dúvida
                </ActionButton>
              ) : null}
              <ActionButton
                variant="primary"
                size={50}
                className="flex-1 min-w-0"
                disabled={detailQty < 1}
                rightIcon={<ShoppingBag className="size-4" />}
                onClick={() => handleAddToCart(detailProduct, detailQty)}
              >
                Adicionar à Sacola · {formatCurrencyBRL(detailProduct.priceCents * detailQty)}
              </ActionButton>
            </div>
          ) : null
        }
      >
        {detailProduct && detailSanitized ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img
                src={getImageSrc(detailSanitized)}
                alt={detailSanitized.name}
                onError={() =>
                  setBrokenImages((prev) => ({ ...prev, [detailProduct.id]: true }))
                }
                className="aspect-square max-h-72 w-full object-cover"
              />
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-2xl font-bold text-[#0F172A]">
                  {formatCurrencyBRL(detailSanitized.priceCents)}
                </p>
                <p className="text-xs text-slate-600">
                  Pagamento no Pix, Cartão ou na entrega
                </p>
              </div>
              <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Opção: {detailSanitized.variation}
              </span>
            </div>

            {detailSanitized.description ? (
              <p className="text-sm leading-relaxed text-slate-600">
                {detailSanitized.description}
              </p>
            ) : null}

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-[#0F172A]">Quantidade</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  disabled={detailQty <= 1}
                  onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                  className="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F172A] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <Minus className="size-4" />
                </button>
                <span className="min-w-[32px] text-center text-base font-bold text-[#0F172A]">
                  {detailQty}
                </span>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() =>
                    setDetailQty((q) => Math.min(Math.max(1, detailSanitized.stock || 99), q + 1))
                  }
                  className="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ModalContainer>

      {/* TELA 23: Carrinho & Finalizar no WhatsApp */}
      <DrawerContainer
        open={cartOpen}
        onOpenChange={setCartOpen}
        preventCloseWhileSubmitting={isSubmitting}
        size="default"
        title="Sua Sacola de Compras"
        description={
          cart.length > 0
            ? `${totalItemsCount} ${totalItemsCount === 1 ? 'item selecionado' : 'itens selecionados'} · Total ${formatCurrencyBRL(totalCents)}`
            : 'Adicione produtos da loja para finalizar no WhatsApp.'
        }
        footer={
          cart.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Total do Pedido</span>
                <strong className="text-xl font-bold text-[#0F172A]">
                  {formatCurrencyBRL(totalCents)}
                </strong>
              </div>
              <ActionButton
                type="submit"
                form="storefront-checkout-form"
                variant="success"
                size={52}
                fullWidth
                isSubmitting={isSubmitting}
                loadingText="Enviando pedido..."
                disabled={!isCheckoutReady}
                rightIcon={<Send className="size-4" />}
              >
                Finalizar Pedido e Enviar no WhatsApp
              </ActionButton>
            </div>
          ) : undefined
        }
      >
        {cart.length === 0 ? (
          <EmptyStateCard
            icon={<ShoppingBag className="size-7" />}
            title="Sua sacola está vazia"
            description="Escolha os produtos desejados na vitrine para fechar seu pedido direto no WhatsApp."
            ctaLabel="Escolher Produtos na Loja"
            onCta={() => setCartOpen(false)}
          />
        ) : (
          <div className="space-y-6">
            {/* Itens do Carrinho */}
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <img
                    src={getImageSrc({
                      id: item.productId,
                      imageUrl: item.imageUrl,
                      name: item.name,
                      category: item.category,
                    })}
                    alt={item.name}
                    className="size-14 shrink-0 rounded-xl border border-slate-100 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0F172A]">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.variation} · {formatCurrencyBRL(item.priceCents)}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        disabled={item.quantity <= 1}
                        onClick={() => handleUpdateCartQty(item.productId, item.quantity - 1)}
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[#0F172A] disabled:opacity-40"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="min-w-[24px] text-center text-xs font-bold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        onClick={() => handleUpdateCartQty(item.productId, item.quantity + 1)}
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[#0F172A]"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-[#0F172A]">
                      {formatCurrencyBRL(item.priceCents * item.quantity)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${item.name} da sacola`}
                      onClick={() => handleRemoveCartItem(item)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-[#EF4444]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Formulário de Finalização */}
            <form
              id="storefront-checkout-form"
              onSubmit={(e) => void handleSubmitOrder(e)}
              className="space-y-4 border-t border-slate-200 pt-4"
            >
              <div className="space-y-1.5">
                <label htmlFor="checkout-customer-name" className="block text-sm font-medium text-[#0F172A]">
                  Seu Nome Completo <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="checkout-customer-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: Maria Clara"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="checkout-customer-phone" className="block text-sm font-medium text-[#0F172A]">
                  WhatsApp com DDD para entrega <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="checkout-customer-phone"
                  type="tel"
                  inputMode="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ex: (11) 99988-7766"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <p className="text-xs text-slate-500">
                  Usado apenas pela loja para combinar a entrega.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType('entrega')}
                  className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    deliveryType === 'entrega'
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Entrega
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType('retirada')}
                  className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    deliveryType === 'retirada'
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Retirar na loja
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="checkout-delivery-notes" className="block text-xs font-medium text-slate-600">
                  {deliveryType === 'entrega' ? 'Endereço ou ponto de referência (opcional)' : 'Observação (opcional)'}
                </label>
                <input
                  id="checkout-delivery-notes"
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={deliveryType === 'entrega' ? 'Rua, número, bairro...' : 'Ex: Retiro hoje às 16h'}
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-600">Forma de Pagamento</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pix' as const, label: 'Pix' },
                    { id: 'credit_card' as const, label: 'Cartão' },
                    { id: 'cash' as const, label: 'Dinheiro' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold transition-colors ${
                        paymentMethod === opt.id
                          ? 'border-[#16A34A] bg-emerald-50 text-[#16A34A]'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {paymentMethod === opt.id ? <Check className="size-3.5" /> : null}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        )}
      </DrawerContainer>
    </div>
  );
}
