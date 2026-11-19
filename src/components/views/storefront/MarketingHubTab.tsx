import * as React from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  QrCode,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import type { BusinessProfile, CatalogProduct, StoreCoupon } from '@/schemas/profile.schema';
import { updateBusinessProfile, type ProfileSnapshot } from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';
import { renderCatalogSocialPostDataUrl } from '@/utils/socialPostRenderer';
import { ActionButton, useToast } from '@/components/ui';
import { buildStorePublicUrl } from './storefront-utils';

export interface MarketingHubTabProps {
  profile: BusinessProfile;
  owner?: string;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
}

function triggerDownloadDataUrl(dataUrl: string, filename: string) {
  if (!dataUrl || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function MarketingHubTab({
  profile,
  owner,
  onProfileUpdated,
}: MarketingHubTabProps) {
  const { showToast } = useToast();
  const products = React.useMemo(
    () => (profile.catalog?.products ?? []).filter((p) => p && p.name),
    [profile.catalog?.products],
  );
  const storeName = profile.business?.name?.trim() || 'Minha Loja';
  const primaryColor = profile.brand?.primaryColor || '#0867E8';
  const accentColor = profile.brand?.accentColor || '#24A677';
  const pixDiscountPercent = Math.max(0, Number(profile.payment?.pixDiscountPercent || 0));

  // Card 1: QR Code state
  const [qrTarget, setQrTarget] = React.useState<'store' | 'product' | 'custom'>('store');
  const [qrSku, setQrSku] = React.useState(() => products[0]?.sku || '');
  const [qrCustomLabel, setQrCustomLabel] = React.useState('Balcao-01');
  const [qrPngUrl, setQrPngUrl] = React.useState('');
  const [qrTargetUrl, setQrTargetUrl] = React.useState(() => buildStorePublicUrl(profile, owner));
  const [qrLoading, setQrLoading] = React.useState(false);

  React.useEffect(() => {
    if (!qrSku && products[0]?.sku) {
      setQrSku(products[0].sku);
    }
  }, [products, qrSku]);

  React.useEffect(() => {
    let cancelled = false;
    const baseStoreUrl = buildStorePublicUrl(profile, owner);
    const cleanSku = qrSku.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const cleanLabel = qrCustomLabel.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

    const parsedFallback = new URL(baseStoreUrl, 'https://companygen.store');
    if (qrTarget === 'product' && cleanSku) {
      parsedFallback.searchParams.set('item', cleanSku);
    }
    if (qrTarget === 'custom' && cleanLabel) {
      parsedFallback.searchParams.set('origem', cleanLabel);
    }
    const localTargetUrl = parsedFallback.toString();

    async function loadQr() {
      setQrLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('target', qrTarget);
        params.set('targetUrl', baseStoreUrl);
        if (qrTarget === 'product' && cleanSku) params.set('sku', cleanSku);
        if (qrTarget === 'custom' && cleanLabel) params.set('label', cleanLabel);

        const res = await authenticatedFetch(
          `/api/store/qr-code?${params.toString()}`,
          { method: 'GET' },
          owner,
        );
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.pngDataUrl) {
          setQrPngUrl(String(data.pngDataUrl));
          setQrTargetUrl(String(data.targetUrl || localTargetUrl));
          setQrLoading(false);
          return;
        }
      } catch {
        // Fallback to local QR generator when offline/headless without server route
      }

      try {
        const dataUrl = await QRCode.toDataURL(localTargetUrl, { margin: 2, width: 512 });
        if (!cancelled) {
          setQrPngUrl(dataUrl);
          setQrTargetUrl(localTargetUrl);
        }
      } catch {
        if (!cancelled) {
          setQrPngUrl('');
          setQrTargetUrl(localTargetUrl);
        }
      } finally {
        if (!cancelled) setQrLoading(false);
      }
      if (!cancelled) setQrLoading(false);
    }

    void loadQr();
    return () => {
      cancelled = true;
    };
  }, [profile, owner, qrTarget, qrSku, qrCustomLabel]);

  // Card 2: Coupons state
  const coupons = React.useMemo<StoreCoupon[]>(
    () => (Array.isArray(profile.coupons) ? profile.coupons : []),
    [profile.coupons],
  );
  const [couponFormOpen, setCouponFormOpen] = React.useState(false);
  const [newCouponCode, setNewCouponCode] = React.useState('');
  const [newCouponPercent, setNewCouponPercent] = React.useState('10');
  const [newCouponExpiresAt, setNewCouponExpiresAt] = React.useState('');
  const [couponSaving, setCouponSaving] = React.useState(false);

  async function saveCouponsList(nextCoupons: StoreCoupon[], toastMsg: string) {
    setCouponSaving(true);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          draft.coupons = nextCoupons;
        },
        undefined,
        owner,
      );
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: toastMsg,
        durationMs: 2800,
      });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao atualizar cupons.',
      });
    } finally {
      setCouponSaving(false);
    }
  }

  async function handleCreateCoupon(event: React.FormEvent) {
    event.preventDefault();
    if (couponSaving) return;
    const cleanCode = newCouponCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 20);
    const pct = Math.round(Number(newCouponPercent) || 0);
    if (cleanCode.length < 3) {
      showToast({
        type: 'error',
        message: 'Informe um código com pelo menos 3 caracteres (ex: PRIMEIRA10).',
      });
      return;
    }
    if (pct < 1 || pct > 90) {
      showToast({
        type: 'error',
        message: 'O desconto do cupom deve ficar entre 1% e 90%.',
      });
      return;
    }
    const existing = coupons.filter((c) => c.code !== cleanCode);
    const nextCoupon: StoreCoupon = {
      code: cleanCode,
      discountPercent: pct,
      active: true,
      expiresAt: newCouponExpiresAt.trim() || null,
      usageCount: 0,
    };
    await saveCouponsList([nextCoupon, ...existing], `Cupom ${cleanCode} (${pct}% OFF) criado!`);
    setNewCouponCode('');
    setNewCouponPercent('10');
    setNewCouponExpiresAt('');
    setCouponFormOpen(false);
  }

  // Card 3: Social Post & Story Canvas Renderer (0 cr)
  const [socialProductId, setSocialProductId] = React.useState(() => products[0]?.id || '');
  const selectedSocialProduct: CatalogProduct | undefined = React.useMemo(
    () => products.find((p) => p.id === socialProductId) || products[0],
    [products, socialProductId],
  );
  const [feedDataUrl, setFeedDataUrl] = React.useState('');
  const [storyDataUrl, setStoryDataUrl] = React.useState('');
  const [socialRendering, setSocialRendering] = React.useState(false);

  React.useEffect(() => {
    if (!socialProductId && products[0]?.id) {
      setSocialProductId(products[0].id);
    }
  }, [products, socialProductId]);

  React.useEffect(() => {
    if (!selectedSocialProduct) {
      setFeedDataUrl('');
      setStoryDataUrl('');
      return;
    }
    let cancelled = false;
    setSocialRendering(true);
    Promise.all([
      renderCatalogSocialPostDataUrl({
        product: selectedSocialProduct,
        storeName,
        primaryColor,
        accentColor,
        logoUrl: profile.brand?.logoUrl,
        pixDiscountPercent,
        format: '1080x1080',
      }),
      renderCatalogSocialPostDataUrl({
        product: selectedSocialProduct,
        storeName,
        primaryColor,
        accentColor,
        logoUrl: profile.brand?.logoUrl,
        pixDiscountPercent,
        format: '1080x1920',
      }),
    ])
      .then(([feedUrl, storyUrl]) => {
        if (!cancelled) {
          setFeedDataUrl(feedUrl);
          setStoryDataUrl(storyUrl);
        }
      })
      .finally(() => {
        if (!cancelled) setSocialRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedSocialProduct,
    storeName,
    primaryColor,
    accentColor,
    profile.brand?.logoUrl,
    pixDiscountPercent,
  ]);

  const sanitizedCustomBadge = qrCustomLabel.trim().replace(/[^A-Za-z0-9_-]/g, '') || 'Balcao';

  return (
    <div
      data-testid="marketing-hub-tab"
      className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6"
    >
      {/* Card 1 — QR Code Próprio da Vitrine, Produto & Mesa */}
      <section
        data-testid="marketing-card-qr"
        aria-label="Gerador de QR Code da Loja"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--cg-text)]">
                <QrCode className="size-4 text-[var(--cg-primary)]" aria-hidden="true" />
                QR Code da Vitrine &amp; Mesa
              </h2>
              <p className="mt-0.5 text-xs text-[var(--cg-text-secondary)]">
                Imprima para balcão, embalagem ou cartão com leitura garantida.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--cg-success)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D] dark:text-[#34D399]">
              0 cr
            </span>
          </div>

          <div className="space-y-2.5">
            <label
              htmlFor="qr-target-select"
              className="block text-xs font-semibold text-[var(--cg-text)]"
            >
              Destino do QR
            </label>
            <select
              id="qr-target-select"
              data-testid="qr-target-select"
              value={qrTarget}
              onChange={(e) => setQrTarget(e.target.value as 'store' | 'product' | 'custom')}
              className="h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm font-medium text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
            >
              <option value="store">Loja Inteira</option>
              <option value="product" disabled={products.length === 0}>
                Produto Específico
              </option>
              <option value="custom">Mesa / Vendedor</option>
            </select>

            {qrTarget === 'product' && products.length > 0 ? (
              <select
                aria-label="Escolher produto para o QR Code"
                data-testid="qr-product-select"
                value={qrSku}
                onChange={(e) => setQrSku(e.target.value)}
                className="h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.sku}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            ) : null}

            {qrTarget === 'custom' ? (
              <input
                type="text"
                data-testid="qr-custom-label-input"
                aria-label="Identificação da mesa ou vendedor"
                value={qrCustomLabel}
                onChange={(e) =>
                  setQrCustomLabel(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32))
                }
                placeholder="Ex: Mesa-04 ou Vendedor-Ana"
                className="h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
              />
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-2 py-2">
            <div
              data-testid="qr-white-quiet-zone"
              style={{ backgroundColor: '#FFFFFF' }}
              className="inline-flex size-44 items-center justify-center rounded-2xl border border-slate-200 bg-[#FFFFFF] p-3 shadow-xs"
            >
              {qrLoading && !qrPngUrl ? (
                <div className="size-36 animate-pulse rounded-lg bg-slate-200" />
              ) : qrPngUrl ? (
                <img
                  src={qrPngUrl}
                  alt={`QR Code de ${storeName}`}
                  data-testid="qr-code-preview-img"
                  className="size-full object-contain"
                />
              ) : null}
            </div>
            <span
              data-testid="qr-target-friendly-label"
              className="rounded-full bg-[var(--cg-surface-elevated)] px-3 py-1 text-[11px] font-semibold text-[var(--cg-text-secondary)]"
            >
              {qrTarget === 'product'
                ? `Destino: Produto ${qrSku || 'SKU'}`
                : qrTarget === 'custom'
                  ? `Destino: Origem ${sanitizedCustomBadge}`
                  : 'Destino: Vitrine Pública Completa'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <ActionButton
            variant="primary"
            size={44}
            data-testid="qr-download-png-btn"
            leftIcon={<Download className="size-4" />}
            disabled={!qrPngUrl}
            onClick={() =>
              triggerDownloadDataUrl(
                qrPngUrl,
                `qrcode-${profile.publishedStore?.publicSlug || 'loja'}.png`,
              )
            }
          >
            Baixar PNG
          </ActionButton>
          <ActionButton
            variant="secondary"
            size={44}
            data-testid="qr-copy-link-btn"
            copyText={qrTargetUrl}
            copySuccessLabel="Copiado"
            leftIcon={<Copy className="size-4" />}
          >
            Copiar Link
          </ActionButton>
        </div>
      </section>

      {/* Card 2 — Gestor Simples de Cupons (Vitrine + Sofia) */}
      <section
        data-testid="marketing-card-coupons"
        aria-label="Gestor Simples de Cupons"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--cg-text)]">
                <Tag className="size-4 text-[var(--cg-primary)]" aria-hidden="true" />
                Cupons de Desconto
              </h2>
              <p className="mt-0.5 text-xs text-[var(--cg-text-secondary)]">
                Crie códigos promocionais sem sair do catálogo.
              </p>
            </div>
            <ActionButton
              variant="secondary"
              size={44}
              data-testid="coupon-new-toggle-btn"
              leftIcon={<Plus className="size-3.5" />}
              onClick={() => setCouponFormOpen((v) => !v)}
            >
              Novo Cupom
            </ActionButton>
          </div>

          {couponFormOpen ? (
            <form
              data-testid="coupon-inline-form"
              onSubmit={(e) => void handleCreateCoupon(e)}
              className="space-y-3 rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] p-3.5"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label
                    htmlFor="coupon-code-input"
                    className="block text-[11px] font-semibold text-[var(--cg-text)]"
                  >
                    Código
                  </label>
                  <input
                    id="coupon-code-input"
                    data-testid="coupon-code-input"
                    type="text"
                    value={newCouponCode}
                    onChange={(e) =>
                      setNewCouponCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20),
                      )
                    }
                    placeholder="PRIMEIRA10"
                    className="h-[40px] w-full rounded-lg border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-2.5 font-mono text-xs font-bold text-[var(--cg-text)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="coupon-percent-input"
                    className="block text-[11px] font-semibold text-[var(--cg-text)]"
                  >
                    Desconto (%)
                  </label>
                  <input
                    id="coupon-percent-input"
                    data-testid="coupon-percent-input"
                    type="text"
                    inputMode="numeric"
                    value={newCouponPercent}
                    onChange={(e) => setNewCouponPercent(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    placeholder="10"
                    className="cg-tabular h-[40px] w-full rounded-lg border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-2.5 text-xs font-bold text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor="coupon-expires-input"
                    className="block text-[11px] font-semibold text-[var(--cg-text)]"
                  >
                    Validade (opcional)
                  </label>
                  <input
                    id="coupon-expires-input"
                    data-testid="coupon-expires-input"
                    type="date"
                    value={newCouponExpiresAt}
                    onChange={(e) => setNewCouponExpiresAt(e.target.value)}
                    className="h-[40px] w-full rounded-lg border border-[var(--cg-border-strong)] bg-[var(--cg-surface)] px-2.5 text-xs text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
                  />
                </div>
                <ActionButton
                  type="submit"
                  variant="primary"
                  size={44}
                  isLoading={couponSaving}
                  data-testid="coupon-save-btn"
                >
                  Salvar
                </ActionButton>
              </div>
            </form>
          ) : null}

          {coupons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] p-4 text-center space-y-2.5">
              <p className="text-xs text-[var(--cg-text-secondary)]">
                Nenhum cupom ativo ainda. Crie um código para converter mais vendas.
              </p>
              <ActionButton
                variant="softBlue"
                size={44}
                data-testid="coupon-quick-seed-btn"
                isLoading={couponSaving}
                onClick={() =>
                  void saveCouponsList(
                    [
                      {
                        code: 'PRIMEIRA10',
                        discountPercent: 10,
                        active: true,
                        expiresAt: null,
                        usageCount: 0,
                      },
                    ],
                    'Cupom PRIMEIRA10 (10% OFF) ativado!',
                  )
                }
              >
                Ativar PRIMEIRA10 (10% OFF)
              </ActionButton>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--cg-border)]">
              {coupons.slice(0, 4).map((coupon) => {
                const isActive = coupon.active !== false;
                return (
                  <li
                    key={coupon.code}
                    data-testid={`coupon-row-${coupon.code}`}
                    className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold tracking-wider text-[var(--cg-text)]">
                          {coupon.code}
                        </span>
                        <span className="cg-tabular text-xs font-bold text-[var(--cg-primary)]">
                          {coupon.discountPercent}% OFF
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isActive
                              ? 'bg-[var(--cg-success)]/15 text-[#15803D] dark:text-[#34D399]'
                              : 'bg-[var(--cg-surface-subtle)] text-[var(--cg-text-muted)]'
                          }`}
                        >
                          {isActive ? 'Ativo' : 'Pausado'}
                        </span>
                      </div>
                      <p className="cg-tabular text-[11px] text-[var(--cg-text-muted)]">
                        {coupon.usageCount || 0} uso(s)
                        {coupon.expiresAt ? ` · Até ${coupon.expiresAt}` : ' · Sem expiração'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`${isActive ? 'Pausar' : 'Ativar'} cupom ${coupon.code}`}
                        data-testid={`coupon-toggle-${coupon.code}`}
                        disabled={couponSaving}
                        onClick={() =>
                          void saveCouponsList(
                            coupons.map((c) =>
                              c.code === coupon.code ? { ...c, active: !isActive } : c,
                            ),
                            isActive
                              ? `Cupom ${coupon.code} pausado.`
                              : `Cupom ${coupon.code} reativado!`,
                          )
                        }
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--cg-border)] text-[var(--cg-text-secondary)] hover:bg-[var(--cg-hover)]"
                      >
                        {isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir cupom ${coupon.code}`}
                        data-testid={`coupon-delete-${coupon.code}`}
                        disabled={couponSaving}
                        onClick={() =>
                          void saveCouponsList(
                            coupons.filter((c) => c.code !== coupon.code),
                            `Cupom ${coupon.code} removido.`,
                          )
                        }
                        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--cg-border)] text-[var(--cg-text-muted)] hover:border-red-300 hover:bg-red-50 hover:text-[#D94C4C]"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p
          data-testid="coupons-sync-footer"
          className="flex items-center gap-1.5 border-t border-[var(--cg-border)] pt-3 text-xs font-medium text-[var(--cg-text-muted)]"
        >
          <CheckCircle2 className="size-3.5 shrink-0 text-[var(--cg-success)]" aria-hidden="true" />
          Ativo na Vitrine Pública e na Sofia WhatsApp
        </p>
      </section>

      {/* Card 3 — Criador Rápido de Posts & Stories (1080x1080 / 1080x1920, 0 cr) */}
      <section
        data-testid="marketing-card-social"
        aria-label="Criador Rápido de Posts e Stories"
        className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--cg-border)] bg-[var(--cg-surface)] p-6"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--cg-text)]">
                <Sparkles className="size-4 text-[var(--cg-primary)]" aria-hidden="true" />
                Posts &amp; Stories Prontos
              </h2>
              <p className="mt-0.5 text-xs text-[var(--cg-text-secondary)]">
                Artes 1080px montadas com foto, preço e logo da loja.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--cg-success)]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D] dark:text-[#34D399]">
              0 cr
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="social-product-select"
              className="block text-xs font-semibold text-[var(--cg-text)]"
            >
              Escolher produto
            </label>
            <select
              id="social-product-select"
              data-testid="social-product-select"
              value={selectedSocialProduct?.id || ''}
              onChange={(e) => setSocialProductId(e.target.value)}
              disabled={products.length === 0}
              className="h-[44px] w-full rounded-xl border border-[var(--cg-border-strong)] bg-[var(--cg-surface-elevated)] px-3 text-sm font-medium text-[var(--cg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--cg-primary)]"
            >
              {products.length === 0 ? (
                <option value="">Cadastre 1 item no Catálogo primeiro</option>
              ) : (
                products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedSocialProduct ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <div className="aspect-square w-full overflow-hidden rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)]">
                  {feedDataUrl ? (
                    <img
                      src={feedDataUrl}
                      alt={`Arte Feed ${selectedSocialProduct.name}`}
                      data-testid="social-preview-feed"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-[var(--cg-text-muted)]">
                      {socialRendering ? 'Gerando...' : 'Feed 1:1'}
                    </div>
                  )}
                </div>
                <p className="text-center text-[11px] font-semibold text-[var(--cg-text-secondary)]">
                  Feed 1080×1080
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="mx-auto aspect-[9/16] max-h-40 overflow-hidden rounded-xl border border-[var(--cg-border)] bg-[var(--cg-surface-elevated)]">
                  {storyDataUrl ? (
                    <img
                      src={storyDataUrl}
                      alt={`Arte Story ${selectedSocialProduct.name}`}
                      data-testid="social-preview-story"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-[var(--cg-text-muted)]">
                      {socialRendering ? 'Gerando...' : 'Story 9:16'}
                    </div>
                  )}
                </div>
                <p className="text-center text-[11px] font-semibold text-[var(--cg-text-secondary)]">
                  Story 1080×1920
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <ActionButton
            variant="secondary"
            size={44}
            data-testid="social-download-feed-btn"
            disabled={!feedDataUrl || !selectedSocialProduct}
            leftIcon={<Download className="size-4" />}
            onClick={() =>
              triggerDownloadDataUrl(
                feedDataUrl,
                `post-feed-${selectedSocialProduct?.sku || 'produto'}.png`,
              )
            }
          >
            Baixar Feed
          </ActionButton>
          <ActionButton
            variant="primary"
            size={44}
            data-testid="social-download-story-btn"
            disabled={!storyDataUrl || !selectedSocialProduct}
            leftIcon={<Download className="size-4" />}
            onClick={() =>
              triggerDownloadDataUrl(
                storyDataUrl,
                `post-story-${selectedSocialProduct?.sku || 'produto'}.png`,
              )
            }
          >
            Baixar Story
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
