import React, { useState } from 'react';
import type { Asset, Product, Variant } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { MediaFrame } from '../base/MediaFrame';
import { QuantityControl } from '../base/QuantityControl';

export type ProductCardProps = {
  product: Product;
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  containerWidth?: number;
  categoryName?: string;
  onOpenProduct: (sku: string) => void;
  onAddToCart: (product: Product, variant?: Variant, quantity?: number) => void;
  onDirectMessage?: (product: Product, variant?: Variant, quantity?: number) => void;
  onComponentConfig?: (id: string) => void;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
  quantityStep?: number;
  maxPerItem?: number;
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  asset,
  override,
  containerWidth = 320,
  categoryName,
  onOpenProduct,
  onAddToCart,
  onDirectMessage,
  onComponentConfig,
  mode = 'studio',
  onAssetClick,
  quantityStep = 1,
  maxPerItem = 20
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = product.variants?.find(v => v.optionId === selectedVariantId);
  const effectivePriceCents = selectedVariant?.priceCents ?? product.priceCents;
  const effectiveStock = selectedVariant?.stock ?? product.stock;
  const maxAllowed = Math.min(effectiveStock, maxPerItem || effectiveStock);

  // Variantes por containerWidth
  const variant = containerWidth < 220 ? 'compact' : containerWidth >= 360 ? 'detailed' : 'standard';

  return (
    <article
      className={`product product-card product-card--${variant}`}
      data-sku={product.sku}
    >
      <div className="product-card__media">
        <MediaFrame
          asset={asset}
          override={override}
          role="product_cutout"
          fit="contain"
          aspectRatio="1:1"
          mode={mode}
          onAssetClick={onAssetClick}
          alt={product.name}
        />
      </div>

      <div className="product-body product-card__body">
        {mode === 'studio' && onComponentConfig && (
          <button
            type="button"
            className="product-config product-card__config-btn"
            title="Configurar componente"
            aria-label={`Configurar ${product.name}`}
            onClick={() => onComponentConfig('product:' + product.sku)}
          >
            ⚙
          </button>
        )}

        {categoryName && (
          <span className="eyebrow product-card__category">{categoryName}</span>
        )}

        <h3
          className="product-card__title"
          onClick={() => onOpenProduct(product.sku)}
          title={product.name}
          style={{ cursor: 'pointer' }}
        >
          {product.name}
        </h3>

        {variant === 'detailed' && product.description && (
          <p className="product-card__desc">{product.description}</p>
        )}

        {product.variants && product.variants.length > 0 && (
          <div className="variant product-card__variants">
            <label className="product-card__variant-label">
              <span>Opção</span>
              <select
                value={selectedVariantId}
                onChange={e => {
                  setSelectedVariantId(e.target.value);
                  setQuantity(1);
                }}
              >
                <option value="">Padrão</option>
                {product.variants.map(v => (
                  <option key={v.optionId} value={v.optionId}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="price-line product-card__price-line">
          <strong className="product-card__price">{money(effectivePriceCents)}</strong>
          <span className="product-card__stock">
            {effectiveStock > 0 ? `${effectiveStock} em estoque` : 'Indisponível'}
          </span>
        </div>

        <div className="product-actions product-card__actions">
          {variant !== 'compact' && effectiveStock > 0 && (
            <QuantityControl
              value={quantity}
              max={maxAllowed}
              step={quantityStep}
              onChange={setQuantity}
            />
          )}

          <button
            type="button"
            className="button product-add product-card__add-btn"
            disabled={effectiveStock <= 0}
            onClick={() => onAddToCart(product, selectedVariant, quantity)}
            title={`Adicionar ${product.name} à sacola`}
          >
            + Carrinho
          </button>
        </div>

        <button
          type="button"
          className="text-button product-detail-link"
          onClick={() => onOpenProduct(product.sku)}
        >
          Ver produto e opções →
        </button>

        {onDirectMessage && (
          <button
            type="button"
            className="text-button product-message"
            disabled={effectiveStock <= 0}
            onClick={() => onDirectMessage(product, selectedVariant, quantity)}
          >
            Pedir este produto pelo WhatsApp ↗
          </button>
        )}
      </div>
    </article>
  );
};
