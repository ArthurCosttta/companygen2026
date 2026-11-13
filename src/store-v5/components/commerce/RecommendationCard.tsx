import React from 'react';
import type { Asset, Product } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { MediaFrame } from '../base/MediaFrame';

export type RecommendationCardProps = {
  product: Product;
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  containerWidth?: number;
  onOpenProduct: (sku: string) => void;
  onAddToCart: (product: Product) => void;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
};

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  product,
  asset,
  override,
  containerWidth = 280,
  onOpenProduct,
  onAddToCart,
  mode = 'studio',
  onAssetClick
}) => {
  // Variantes por largura do contêiner:
  // <220px: listCompact; 220-359px: standard; >=360px: detailed
  const variant = containerWidth < 220 ? 'compact' : containerWidth >= 360 ? 'detailed' : 'standard';

  return (
    <article
      className={`recommendation-card recommendation-card--${variant}`}
      data-sku={product.sku}
    >
      <div className="recommendation-card__media">
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

      <div className="recommendation-card__body">
        <button
          type="button"
          className="recommendation-card__title"
          onClick={() => onOpenProduct(product.sku)}
          title={product.name}
        >
          {product.name}
        </button>

        <div className="recommendation-card__price">
          <strong className="recommendation-card__price-val">{money(product.priceCents)}</strong>
          {product.stock <= 0 && (
            <span className="recommendation-card__stock-status">Indisponível</span>
          )}
        </div>

        <div className="recommendation-card__actions">
          <button
            type="button"
            className="recommendation-card__open-btn"
            onClick={() => onOpenProduct(product.sku)}
            aria-label={`Ver produto ${product.name}`}
          >
            Ver produto
          </button>
          <button
            type="button"
            className="recommendation-card__add-btn"
            disabled={product.stock <= 0}
            onClick={() => onAddToCart(product)}
            aria-label={`Adicionar ${product.name} à sacola`}
          >
            + Sacola
          </button>
        </div>
      </div>
    </article>
  );
};
