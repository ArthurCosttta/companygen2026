import React from 'react';
import type { Asset, Product } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { MediaFrame } from '../base/MediaFrame';

export type KitOptionCardProps = {
  product: Product;
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  isSelected?: boolean;
  onSelect: (sku: string) => void;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
};

export const KitOptionCard: React.FC<KitOptionCardProps> = ({
  product,
  asset,
  override,
  isSelected = false,
  onSelect,
  mode = 'studio',
  onAssetClick
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`kit-option ${isSelected ? 'is-active kit-option--selected' : ''}`}
      onClick={() => onSelect(product.sku)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(product.sku);
        }
      }}
      aria-label={`Opção ${product.name} por ${money(product.priceCents)}`}
    >
      <div className="kit-option-image kit-option__image">
        <MediaFrame
          asset={asset}
          override={override}
          role="product_cutout"
          fit="contain"
          aspectRatio="1:1"
          maxBlockPx={130}
          mode={mode}
          onAssetClick={onAssetClick}
          alt={product.name}
        />
      </div>
      <strong>{product.name}</strong>
      <span>{money(product.priceCents)}</span>
    </div>
  );
};
