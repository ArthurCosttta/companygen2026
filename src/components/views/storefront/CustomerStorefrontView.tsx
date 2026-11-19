import * as React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  MessageCircle,
  Minus,
  Plus,
  Send,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildDefaultMensagemMolde,
  formatCurrencyBRL,
  hydrateMensagemMolde,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessOrder,
  type BusinessProfile,
  type CatalogProduct,
  type StoreCoupon,
} from '@/schemas/profile.schema';
import type { WhatsappRuntimeStatus } from '@/hooks/useConnectionPhase';
import { FormulaTreeRenderer } from './FormulaTreeRenderer';
import {
  sanitizeFormulaV9Document,
  type FormulaV9Document,
} from '@/schemas/formula-v9.schema';
import { ensureFormulaV9 } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import {
  ActionButton,
  DrawerContainer,
  EmptyStateCard,
  ModalContainer,
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
  hidePreviewBanner?: boolean;
  isLoading?: boolean;
  runtimeStatus?: WhatsappRuntimeStatus | null;
  onBackToAdmin?: () => void;
  onGoToOrders?: () => void;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
  onOrderCreated?: (order: BusinessOrder) => void;
  onUploadProductImage?: (productId: string, file: File) => void | Promise<void>;
  onUploadBrandAsset?: (slot: string, file: File) => void | Promise<void>;
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
  hidePreviewBanner = false,
  runtimeStatus,
  onBackToAdmin,
  onGoToOrders,
  onProfileUpdated,
  onOrderCreated,
}: CustomerStorefrontViewProps) {
  const { showToast } = useToast();
  const storageKey = getCartStorageKey(profile, ownerId);

  const [cart, setCart] = React.useState<StoreCartItem[]>(() => loadPersistedCart(storageKey));
  const [detailProduct, setDetailProduct] = React.useState<CatalogProduct | null>(null);
  const [detailQty, setDetailQty] = React.useState(1);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [lastDirectWaUrl, setLastDirectWaUrl] = React.useState<string>('');
  const [lastSimulatedOrderRef, setLastSimulatedOrderRef] = React.useState<string>('');

  // Checkout fields
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [deliveryType, setDeliveryType] = React.useState<'entrega' | 'retirada'>('entrega');
  const [deliveryNotes, setDeliveryNotes] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'pix' | 'credit_card' | 'cash'>('pix');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [simulatingOrder, setSimulatingOrder] = React.useState(false);
  const [brokenImages, setBrokenImages] = React.useState<Record<string, boolean>>({});
  const [couponExpanded, setCouponExpanded] = React.useState(false);
  const [couponInput, setCouponInput] = React.useState('');
  const [appliedCoupon, setAppliedCoupon] = React.useState<StoreCoupon | null>(null);
  const [couponError, setCouponError] = React.useState('');
  const [checkoutError422, setCheckoutError422] = React.useState('');
  const [localStockBySku, setLocalStockBySku] = React.useState<Record<string, number>>({});
  const initialSkuHandledRef = React.useRef(false);

  const qrOriginTag = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    const raw =
      new URLSearchParams(window.location.search).get('origem') ||
      new URLSearchParams(window.location.search).get('qr') ||
      '';
    return raw.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  }, []);

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

  const activeFormulaV9 = React.useMemo<FormulaV9Document>(
    () => sanitizeFormulaV9Document(ensureFormulaV9(profile), profile) as FormulaV9Document,
    [profile],
  );

  const brandName = profile.business?.name?.trim() || 'Minha Loja';
  const brandColor = profile.brand?.primaryColor || '#0B4DB8';
  const storePhone = sanitizePhoneE164(
    runtimeStatus?.numeroBot ||
      runtimeStatus?.phoneE164 ||
      profile.whatsapp?.phoneE164 ||
      profile.whatsapp?.displayPhone ||
      '',
  );
  const hasStorePhone = isValidProductionPhone(storePhone) || storePhone.length >= 10;

  const activeProducts = React.useMemo(
    () =>
      (profile.catalog?.products ?? [])
        .filter((p) => p.active !== false || p.autoPausedOutOfStock === true)
        .map((p) => {
          const override = localStockBySku[p.sku.toUpperCase()];
          if (override === undefined) return p;
          return {
            ...p,
            stock: override,
            active: override > 0 ? p.active : false,
            autoPausedOutOfStock: override <= 0 ? true : p.autoPausedOutOfStock,
          };
        }),
    [localStockBySku, profile.catalog?.products],
  );

  React.useEffect(() => {
    if (initialSkuHandledRef.current || typeof window === 'undefined') return;
    const itemParam = new URLSearchParams(window.location.search)
      .get('item')
      ?.trim()
      .toUpperCase();
    if (!itemParam || activeProducts.length === 0) return;
    const matched = activeProducts.find((p) => p.sku.toUpperCase() === itemParam);
    if (matched) {
      initialSkuHandledRef.current = true;
      setDetailProduct(matched);
      setDetailQty(1);
    }
  }, [activeProducts]);

  const activeCoupons = React.useMemo(
    () =>
      (Array.isArray(profile.coupons) ? profile.coupons : []).filter(
        (c) =>
          c &&
          c.active !== false &&
          (!c.expiresAt || !Number.isFinite(Date.parse(c.expiresAt)) || Date.parse(c.expiresAt) >= Date.now()),
      ),
    [profile.coupons],
  );

  React.useEffect(() => {
    if (appliedCoupon) {
      const stillValid = activeCoupons.find((c) => c.code === appliedCoupon.code);
      if (!stillValid) setAppliedCoupon(null);
      else if (stillValid.discountPercent !== appliedCoupon.discountPercent) {
        setAppliedCoupon(stillValid);
      }
    }
  }, [activeCoupons, appliedCoupon]);

  const totalItemsCount = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const totalCents = React.useMemo(
    () => cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [cart],
  );

  const couponDiscountCents = React.useMemo(() => {
    if (!appliedCoupon || totalCents <= 0) return 0;
    return Math.round((totalCents * Math.min(90, Math.max(1, appliedCoupon.discountPercent))) / 100);
  }, [appliedCoupon, totalCents]);

  const afterCouponCents = Math.max(0, totalCents - couponDiscountCents);

  const shippingFixedFeeCents = Math.max(
    0,
    Number(profile.shipping?.fixedFeeCents ?? profile.delivery?.defaultFeeCents ?? 0),
  );
  const shippingFreeThresholdCents = Math.max(
    0,
    Number(profile.shipping?.freeShippingThresholdCents ?? 0),
  );
  const pickupAvailable =
    profile.shipping?.pickupAvailable !== undefined
      ? Boolean(profile.shipping.pickupAvailable)
      : profile.delivery?.pickupEnabled !== false;

  React.useEffect(() => {
    if (!pickupAvailable && deliveryType === 'retirada') {
      setDeliveryType('entrega');
    }
  }, [pickupAvailable, deliveryType]);

  const qualifiesForFreeShipping =
    deliveryType === 'entrega' &&
    shippingFreeThresholdCents > 0 &&
    afterCouponCents >= shippingFreeThresholdCents;

  const activeShippingCents = React.useMemo(() => {
    if (deliveryType !== 'entrega' || profile.delivery?.deliveryEnabled === false) return 0;
    if (qualifiesForFreeShipping) return 0;
    return shippingFixedFeeCents;
  }, [deliveryType, profile.delivery?.deliveryEnabled, qualifiesForFreeShipping, shippingFixedFeeCents]);

  const pixDiscountPercent = Math.max(0, Number(profile.payment?.pixDiscountPercent || 0));
  const pixDiscountCents =
    paymentMethod === 'pix' && pixDiscountPercent > 0
      ? Math.round((afterCouponCents * pixDiscountPercent) / 100)
      : 0;
  const grandTotalCents = Math.max(0, afterCouponCents - pixDiscountCents) + activeShippingCents;

  function handleApplyCoupon() {
    const clean = couponInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!clean) {
      setCouponError('Digite o código do cupom.');
      return;
    }
    const found = activeCoupons.find((c) => c.code === clean);
    if (!found) {
      setCouponError('Cupom inválido, pausado ou expirado.');
      return;
    }
    setCouponError('');
    setAppliedCoupon(found);
    setCouponInput('');
    showToast({
      type: 'success',
      message: `Cupom ${found.code} (-${found.discountPercent}%) aplicado na sacola!`,
      durationMs: 2600,
    });
  }

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
    if (Number(product.stock ?? 10) <= 0) {
      showToast({
        type: 'amber',
        message: `"${product.name}" está esgotado no momento.`,
        durationMs: 2600,
      });
      return;
    }
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

    const wasDetailOpen = Boolean(detailProduct);
    setDetailProduct(null);
    if (wasDetailOpen) {
      setCartOpen(true);
    }
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
  // GATE SUPREMO: nunca bloquear envio ao WhatsApp por falta de nome/telefone/endereço
  const isCheckoutReady = cart.length > 0 && !isSubmitting;

  function buildOrderWhatsappText(orderRef?: string): string {
    const firstCart = cart[0];
    const matchedFirst = firstCart
      ? activeProducts.find((p) => p.id === firstCart.productId)
      : undefined;
    const baseTemplate =
      cart.length === 1 && matchedFirst
        ? hydrateMensagemMolde(
            matchedFirst.mensagemMolde || buildDefaultMensagemMolde(matchedFirst, brandName),
            matchedFirst,
            { quantity: firstCart.quantity, storeName: brandName },
          )
        : '';

    const lines = [
      baseTemplate || `Olá, *${brandName}*! Gostaria de fazer um pedido:`,
      orderRef ? `Pedido: *#${orderRef}*` : '',
      ...(cart.length > 1
        ? [
            '',
            ...cart.map(
              (item) =>
                `• ${item.quantity}x ${item.name}${item.variation && item.variation !== 'Padrão' ? ` (${item.variation})` : ''} — ${formatCurrencyBRL(item.priceCents * item.quantity)}`,
            ),
            activeShippingCents > 0 ? `Taxa de entrega local: ${formatCurrencyBRL(activeShippingCents)}` : '',
            '',
            `*Total: ${formatCurrencyBRL(grandTotalCents)}*`,
          ]
        : [
            activeShippingCents > 0 ? `Taxa de entrega local: ${formatCurrencyBRL(activeShippingCents)}` : '',
            `Total: *${formatCurrencyBRL(grandTotalCents)}*`,
          ]),
      cleanCustomerName ? `Nome: ${cleanCustomerName}` : '',
      customerPhone.trim() ? `WhatsApp: ${customerPhone.trim()}` : '',
      `Recebimento: ${deliveryType === 'retirada' ? 'Retirar na loja' : 'Entrega'}`,
      deliveryNotes.trim() ? `Obs/Endereço: ${deliveryNotes.trim()}` : '',
      `Pagamento: ${paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'credit_card' ? 'Cartão' : 'Dinheiro'}`,
      appliedCoupon ? `Cupom aplicado: ${appliedCoupon.code} (-${appliedCoupon.discountPercent}%)` : '',
      qrOriginTag ? `Origem QR: ${qrOriginTag}` : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  function openWhatsappSync(text: string): string {
    if (hasStorePhone) {
      const waUrl = buildWhatsappDirectUrl(storePhone, text);
      if (waUrl) {
        setLastDirectWaUrl(waUrl);
        if (typeof window !== 'undefined') {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        }
        return waUrl;
      }
    }
    return '';
  }

  async function handleSubmitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!isCheckoutReady) return;

    // 1) GATE SUPREMO: Dispara link wa.me SINCRONAMENTE no gesto do cliente, sem bloquear por endereço/cadastro
    const immediateMessage = buildOrderWhatsappText();
    const waUrl = openWhatsappSync(immediateMessage);
    if (!waUrl) {
      await copyTextToClipboard(immediateMessage);
    }

    setCheckoutError422('');
    setIsSubmitting(true);
    try {
      const response = await authenticatedFetch(
        '/api/orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: cleanCustomerName || 'Cliente Vitrine',
            customerPhone: cleanCustomerPhoneDigits ? sanitizePhoneE164(cleanCustomerPhoneDigits) : '',
            paymentMethod,
            deliveryAddress: {
              mode: deliveryType,
              notes: deliveryNotes.trim(),
            },
            deliveryType,
            couponCode: appliedCoupon?.code || undefined,
            shippingCents: activeShippingCents,
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
      if (response.status === 422) {
        const errMsg = String(
          raw?.error || 'Verifique a disponibilidade dos itens ou o cupom aplicado.',
        );
        setCheckoutError422(errMsg);
        showToast({
          type: 'error',
          message: errMsg,
          durationMs: 4200,
        });
        return;
      }
      if (!response.ok || !raw.order) {
        throw new Error(raw.error || 'Falha ao enviar pedido.');
      }

      const createdOrder = raw.order as BusinessOrder;
      onOrderCreated?.(createdOrder);

      const nextStockPatch: Record<string, number> = {};
      for (const ordered of cart) {
        const skuUpper = String(ordered.sku || '').trim().toUpperCase();
        if (!skuUpper) continue;
        const matchedProd = activeProducts.find((p) => p.sku.toUpperCase() === skuUpper);
        const currentQty = Number.isFinite(matchedProd?.stock) ? Number(matchedProd!.stock) : 10;
        nextStockPatch[skuUpper] = Math.max(0, currentQty - ordered.quantity);
      }
      if (Object.keys(nextStockPatch).length > 0) {
        setLocalStockBySku((prev) => ({ ...prev, ...nextStockPatch }));
      }

      setCart([]);
      setAppliedCoupon(null);
      setCheckoutError422('');
      setCartOpen(false);
      showToast({
        type: 'success',
        message: waUrl
          ? `Pedido #${createdOrder.order_ref} salvo e link wa.me aberto para o WhatsApp conectado!`
          : `Pedido #${createdOrder.order_ref} salvo com sucesso!`,
        durationMs: 4000,
      });
    } catch {
      showToast({
        type: 'amber',
        message: waUrl
          ? 'Link do WhatsApp gerado! Pedido salvo em modo offline para atendimento direto.'
          : 'Resumo do pedido copiado para você enviar no WhatsApp!',
        durationMs: 4000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const detailSanitized = detailProduct ? sanitizeProductForCustomerDisplay(detailProduct) : null;
  const activeThemeMode = 'light';
  const isCarbonDark = false;
  const isOwnerQueryPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('ownerPreview') === '1';
  const showOwnerPreviewBar = (mode === 'preview' || isOwnerQueryPreview) && !hidePreviewBanner;

  const publicStoreLink = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    u.search = '';
    u.searchParams.set('view', 'store');
    if (ownerId) u.searchParams.set('u', ownerId);
    else if (profile.publishedStore?.publicSlug) {
      u.searchParams.set('loja', profile.publishedStore.publicSlug);
    }
    return u.toString();
  }, [ownerId, profile.publishedStore?.publicSlug]);

  const handleSimulateFirstOrder = async () => {
    if (simulatingOrder) return;
    const sample = activeProducts[0];
    if (!sample) {
      showToast({ type: 'amber', message: 'Adicione ao menos 1 produto para simular o pedido.' });
      return;
    }
    setSimulatingOrder(true);
    try {
      const response = await authenticatedFetch(
        '/api/orders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isSimulation: true,
            customerName: 'Pedido de Teste (Simulação)',
            paymentMethod: 'pix',
            deliveryAddress: { mode: 'retirada', notes: 'Simulação guiada do lojista' },
            shippingCents: 0,
            items: [
              {
                sku: sample.sku,
                name: sample.name,
                variation: sample.variation || 'Padrão',
                qty: 1,
              },
            ],
          }),
        },
        ownerId,
      );
      const raw = await response.json().catch(() => ({}));
      if (response.ok && raw.order) {
        const orderRef = String(raw.order.order_ref || 'SIM-1');
        setLastSimulatedOrderRef(orderRef);
        onOrderCreated?.(raw.order as BusinessOrder);
        if (ownerId) {
          updateBusinessProfile(
            (draft) => {
              draft.onboarding = {
                ...draft.onboarding,
                completedFirstSimulatedOrder: true,
              };
            },
            undefined,
            ownerId,
          )
            .then((snap) => onProfileUpdated?.(snap))
            .catch(() => {});
        }
        showToast({
          type: 'success',
          message: `1º Pedido simulado (#${orderRef}) criado! Confira na aba Pedidos.`,
          durationMs: 4000,
        });
      }
    } finally {
      setSimulatingOrder(false);
    }
  };

  return (
    <div
      data-testid="tela-40-v5-storefront"
      data-theme-mode={activeThemeMode}
      className={
        isCarbonDark
          ? 'min-h-full bg-[#09090B] text-white'
          : 'min-h-full bg-[#F8FAFC] text-[#0F172A]'
      }
      style={
        isCarbonDark
          ? { backgroundColor: '#09090B', color: '#FFFFFF' }
          : undefined
      }
    >
      {/* Faixa Modo Preview do Lojista (40px+ compacta com copiar link + simular 1º pedido) */}
      {showOwnerPreviewBar ? (
        <div
          data-testid="storefront-owner-preview-bar"
          className={
            isCarbonDark
              ? 'relative z-40 min-h-[40px] border-b border-[#27272A] bg-[#121215] px-4 py-1.5 text-white'
              : 'relative z-40 min-h-[40px] border-b border-blue-200 bg-[#EFF6FF] px-4 py-1.5'
          }
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <div
              className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${
                isCarbonDark ? 'text-[#F4F4F5]' : 'text-[#1D4ED8]'
              }`}
            >
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Prévia da sua loja</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {publicStoreLink ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  copyText={publicStoreLink}
                  data-testid="owner-preview-copy-link"
                  leftIcon={<Copy className="size-3.5" />}
                >
                  Copiar link
                </ActionButton>
              ) : null}
              <ActionButton
                variant="primary"
                size={44}
                isLoading={simulatingOrder}
                loadingText="Simulando..."
                data-testid="owner-preview-simulate-order-btn"
                leftIcon={<ShoppingBag className="size-3.5" />}
                onClick={() => void handleSimulateFirstOrder()}
              >
                Simular 1º Pedido (Teste)
              </ActionButton>
              {lastSimulatedOrderRef ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="owner-preview-simulated-badge"
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-100 px-2.5 text-xs font-bold text-emerald-900"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>#{lastSimulatedOrderRef} criado</span>
                  </span>
                  {onGoToOrders ? (
                    <ActionButton
                      variant="success"
                      size={44}
                      data-testid="owner-preview-open-orders-btn"
                      onClick={onGoToOrders}
                    >
                      Ver Pedido nos Pedidos →
                    </ActionButton>
                  ) : null}
                </div>
              ) : null}
              {onBackToAdmin ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<ArrowLeft className="size-4" />}
                  onClick={onBackToAdmin}
                  className={
                    isCarbonDark
                      ? '!border-[#27272A] !bg-[#18181B] !text-white hover:!bg-[#27272A]'
                      : undefined
                  }
                >
                  Voltar ao Painel
                </ActionButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Faixa Banner de Link WhatsApp Gerado (GATE SUPREMO) */}
      {lastDirectWaUrl ? (
        <div
          data-testid="storefront-wa-direct-banner"
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-950"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold sm:text-sm">
              Mensagem pronta para o WhatsApp conectado da loja:
            </span>
            <a
              data-testid="storefront-wa-direct-link"
              href={lastDirectWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 text-xs font-bold text-white hover:bg-[#15803D]"
            >
              <MessageCircle className="size-4" />
              Abrir no WhatsApp (wa.me)
            </a>
          </div>
        </div>
      ) : null}

      {/* Grade de Produtos & Seções Modulares v9.0 */}
      <main role="region" aria-label="Catálogo da Vitrine" className="w-full pb-24">
        <FormulaTreeRenderer
          formulaV9={activeFormulaV9}
          profile={profile}
          products={activeProducts}
          cartCount={totalItemsCount}
          onOpenCart={() => setCartOpen(true)}
          onAddToCart={(product, qty = 1) => handleAddToCart(product, qty)}
          onSelectProductDetail={(product) => handleOpenDetail(product)}
          onDirectWhatsappSend={(message) => {
            const url = openWhatsappSync(message);
            if (!url) {
              void copyTextToClipboard(message);
              showToast({
                type: 'amber',
                message: 'Mensagem copiada! Conecte o número do WhatsApp nos Ajustes/WhatsApp.',
                durationMs: 3200,
              });
            } else {
              showToast({
                type: 'success',
                message: 'Link wa.me gerado para o WhatsApp conectado da loja!',
                durationMs: 3200,
              });
            }
          }}
        />
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
            Ver Sacola ({totalItemsCount}) · {formatCurrencyBRL(grandTotalCents)}
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
                    const msg = hydrateMensagemMolde(
                      detailProduct.mensagemMolde || buildDefaultMensagemMolde(detailProduct, brandName),
                      detailProduct,
                      { quantity: detailQty, storeName: brandName },
                    );
                    openWhatsappSync(msg);
                  }}
                >
                  Enviar no WhatsApp
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
        onOpenChange={(next) => {
          setCartOpen(next);
          if (!next) setCheckoutError422('');
        }}
        preventCloseWhileSubmitting={isSubmitting}
        size="default"
        className="max-[640px]:rounded-t-3xl"
        title="Sua Sacola de Compras"
        description={
          cart.length > 0
            ? `${totalItemsCount} ${totalItemsCount === 1 ? 'item selecionado' : 'itens selecionados'} · Total ${formatCurrencyBRL(grandTotalCents)}`
            : 'Adicione produtos da loja para finalizar no WhatsApp.'
        }
        footer={
          cart.length > 0 ? (
            <div className="space-y-2">
              {qualifiesForFreeShipping ? (
                <div
                  data-testid="cart-free-shipping-badge"
                  className="flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
                >
                  <span>Entrega na sua região</span>
                  <span>✓ Frete Grátis</span>
                </div>
              ) : activeShippingCents > 0 ? (
                <div className="cg-tabular flex items-center justify-between text-xs text-slate-600">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrencyBRL(activeShippingCents)}</span>
                </div>
              ) : null}
              {couponDiscountCents > 0 && appliedCoupon ? (
                <div
                  data-testid="cart-coupon-discount-row"
                  className="cg-tabular flex items-center justify-between rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-[#1D4ED8]"
                >
                  <span className="flex items-center gap-1.5">
                    Cupom {appliedCoupon.code} (-{appliedCoupon.discountPercent}%)
                    <button
                      type="button"
                      aria-label="Remover cupom"
                      onClick={() => setAppliedCoupon(null)}
                      className="rounded-full p-0.5 hover:bg-blue-100"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                  <span>-{formatCurrencyBRL(couponDiscountCents)}</span>
                </div>
              ) : null}
              {pixDiscountCents > 0 ? (
                <div
                  data-testid="cart-pix-discount-row"
                  className="cg-tabular flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-extrabold text-emerald-700"
                >
                  <span>Desconto Pix (-{pixDiscountPercent}% Pix)</span>
                  <span>-{formatCurrencyBRL(pixDiscountCents)}</span>
                </div>
              ) : null}
              {checkoutError422 ? (
                <div
                  data-testid="cart-checkout-error-card"
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-[#991B1B]"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#DC2626]" aria-hidden="true" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-bold text-[#7F1D1D]">
                        Não foi possível concluir o pedido
                      </p>
                      <p className="leading-snug">{checkoutError422}</p>
                      <button
                        type="button"
                        onClick={() => setCheckoutError422('')}
                        className="mt-1 inline-flex rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#991B1B] hover:bg-red-100"
                      >
                        Entendi / Revisar sacola
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Total do Pedido</span>
                <strong
                  data-testid="cart-grand-total"
                  className="cg-tabular text-xl font-bold text-[#0F172A]"
                >
                  {formatCurrencyBRL(grandTotalCents)}
                </strong>
              </div>
              <ActionButton
                type="submit"
                form="storefront-checkout-form"
                variant="success"
                size={52}
                fullWidth
                className="min-h-[54px] py-2.5 leading-tight"
                isSubmitting={isSubmitting}
                loadingText="Enviando pedido..."
                disabled={!isCheckoutReady}
                rightIcon={<Send className="size-4" />}
              >
                Finalizar Pedido e Enviar no WhatsApp
              </ActionButton>
              {hasStorePhone ? (
                <a
                  data-testid="checkout-wa-direct-link"
                  href={buildWhatsappDirectUrl(storePhone, buildOrderWhatsappText())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-[#15803D] transition-colors hover:bg-emerald-100"
                >
                  <MessageCircle className="size-4" />
                  Enviar direto para wa.me/{sanitizePhoneE164(storePhone)}
                </a>
              ) : null}
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
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-[#0F172A]">{item.name}</p>
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
                  Seu Nome <span className="text-xs font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="checkout-customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: Maria Clara (pode deixar vazio)"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="checkout-customer-phone" className="block text-sm font-medium text-[#0F172A]">
                  Seu WhatsApp com DDD <span className="text-xs font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="checkout-customer-phone"
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ex: (11) 99988-7766 (pode deixar vazio)"
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <p className="text-xs text-slate-500">
                  Você já pode enviar o pedido agora mesmo sem preencher endereço ou cadastro.
                </p>
              </div>

              <div className={`grid ${pickupAvailable ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
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
                {pickupAvailable ? (
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
                ) : null}
              </div>

              {/* Cupom de Desconto Colapsável */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <button
                  type="button"
                  data-testid="cart-coupon-toggle"
                  onClick={() => setCouponExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-semibold text-[#1D4ED8]"
                >
                  <span className="flex items-center gap-1.5">
                    <Tag className="size-3.5" aria-hidden="true" />
                    {appliedCoupon
                      ? `Cupom ${appliedCoupon.code} aplicado (-${appliedCoupon.discountPercent}%)`
                      : 'Possui cupom de desconto?'}
                  </span>
                  <span>{couponExpanded ? 'Fechar' : 'Aplicar'}</span>
                </button>
                {couponExpanded ? (
                  <div className="mt-2.5 space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        data-testid="cart-coupon-input"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(
                            e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20),
                          );
                          setCouponError('');
                        }}
                        placeholder="Ex: PRIMEIRA10"
                        className="h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs font-bold text-[#0F172A] uppercase focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                      />
                      <ActionButton
                        variant="primary"
                        size={44}
                        data-testid="cart-coupon-apply-btn"
                        onClick={handleApplyCoupon}
                      >
                        Aplicar
                      </ActionButton>
                    </div>
                    {couponError ? (
                      <p data-testid="cart-coupon-error" className="text-[11px] font-medium text-[#D94C4C]">
                        {couponError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
