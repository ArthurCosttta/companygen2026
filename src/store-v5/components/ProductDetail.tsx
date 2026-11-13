import React, { useEffect, useState } from 'react';
import type { Asset, CartLine, Product, SiteIR } from '../compiler/types';
import type { Override } from '../assets/export';
import { addLine } from '../capabilities/cart';
import { money } from '../compiler/compile';
import { productMessage } from '../whatsapp/messages';
import { MediaFrame } from './base/MediaFrame';

export type ProductDetailProps = {
  product: Product;
  site: SiteIR;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  overrides: Record<string, Override>;
  onAsset: (a: Asset) => void;
  onMessage: (s: string) => void;
  onBack: () => void;
  onCart: () => void;
  mode?: 'studio' | 'standalone';
};

export function ProductDetail({
  product: p,
  site,
  cart,
  setCart,
  overrides,
  onAsset,
  onMessage,
  onBack,
  onCart,
  mode = 'studio'
}: ProductDetailProps) {
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [mediaId, setMediaId] = useState(p.media[0]?.assetId || '');

  useEffect(() => {
    setVariantId('');
    setQuantity(1);
    setMediaId(p.media[0]?.assetId || '');
  }, [p.sku]);

  const variant = p.variants?.find(v => v.optionId === variantId);
  const stock = variant?.stock ?? p.stock;
  const max = Math.min(stock, site.rules?.maxPerItem || stock);
  const key = p.sku + '::' + (variant?.sku || '');
  const inCart = cart.find(x => x.key === key)?.quantity || 0;

  const currentAsset = site.assetIndex[mediaId] || site.assets.find(a => a.assetId === mediaId);

  return (
    <main className="product-screen" data-product-screen={p.sku}>
      <div className="store-breadcrumb">
        <button type="button" onClick={onBack}>
          ← Voltar à loja
        </button>
        <span>
          {site.categories.find(c => c.id === p.categoryId)?.name} / {p.name}
        </span>
      </div>

      <div className="product-detail-layout">
        <div className="product-gallery">
          <div className="product-main-image">
            <MediaFrame
              asset={currentAsset}
              override={overrides[mediaId]}
              role="product_cutout"
              fit="contain"
              aspectRatio="1:1"
              mode={mode}
              onAssetClick={onAsset}
              alt={p.name}
              priority
            />
          </div>

          {p.media.length > 1 && (
            <div className="product-thumbnails">
              {p.media.map(media => {
                const thumbAsset = site.assetIndex[media.assetId] || site.assets.find(a => a.assetId === media.assetId);
                return (
                  <button
                    key={media.assetId}
                    type="button"
                    className={`thumb-btn ${mediaId === media.assetId ? 'selected' : ''}`}
                    onClick={() => setMediaId(media.assetId)}
                    aria-label={`Ver imagem ${media.assetId}`}
                  >
                    <MediaFrame
                      asset={thumbAsset}
                      override={overrides[media.assetId]}
                      role="product_cutout"
                      fit="contain"
                      aspectRatio="1:1"
                      width={60}
                      height={60}
                      mode={mode}
                      onAssetClick={onAsset}
                      alt={p.name}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="product-detail-info">
          <small>
            {site.business.name}
          </small>
          <h1>{p.name}</h1>
          {p.description && <p>{p.description}</p>}

          <strong className="product-detail-price">
            {money(variant?.priceCents ?? p.priceCents)}
          </strong>

          <span className="stock-note">
            {stock > 0
              ? mode === 'standalone'
                ? `${stock} unidades em estoque`
                : `${stock} unidades disponíveis no JSON`
              : 'Indisponível'}
          </span>

          {p.variants && p.variants.length > 0 && (
            <label className="detail-variant">
              <span>Opção</span>
              <select
                aria-label="Opção"
                value={variantId}
                onChange={e => {
                  setVariantId(e.target.value);
                  setQuantity(1);
                }}
              >
                <option value="">Padrão</option>
                {p.variants.map(v => (
                  <option value={v.optionId} key={v.optionId}>
                    {v.label} · {money(v.priceCents)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {Object.keys(p.attributes || {}).length > 0 && (
            <dl className="detail-attributes">
              {Object.entries(p.attributes || {}).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <label className="detail-quantity">
            <span>Quantidade</span>
            <input
              aria-label="Quantidade do produto"
              type="number"
              min="1"
              max={Math.max(1, max - inCart)}
              step={site.rules?.quantityStep || 1}
              value={quantity}
              onChange={e =>
                setQuantity(
                  Math.max(1, Math.min(max - inCart || 1, Number(e.target.value) || 1))
                )
              }
            />
          </label>

          <button
            type="button"
            className="detail-add"
            disabled={!stock || inCart >= max}
            onClick={() =>
              setCart(lines =>
                addLine(lines, p, variant, quantity, site.rules?.maxPerItem || stock)
              )
            }
          >
            Adicionar à sacola · {money((variant?.priceCents ?? p.priceCents) * quantity)}
          </button>

          <button type="button" className="detail-cart" onClick={onCart}>
            Ver sacola ({cart.reduce((n, l) => n + l.quantity, 0)}) →
          </button>

          <button
            type="button"
            className="detail-whatsapp"
            disabled={!stock}
            onClick={() => onMessage(productMessage(site, p, variant, quantity))}
          >
            Consultar este produto no WhatsApp ↗
          </button>

          <small className="detail-disclaimer">
            Preço e disponibilidade sujeitos à confirmação da loja.
          </small>
        </div>
      </div>
    </main>
  );
}
