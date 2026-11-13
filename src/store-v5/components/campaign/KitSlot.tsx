import React from 'react';
import type { Asset, Product } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { MediaFrame } from '../base/MediaFrame';

export type KitSlotProps = {
  slotId: string;
  label: string;
  product?: Product;
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  isActive?: boolean;
  onActivate: (slotId: string) => void;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
};

export const KitSlot: React.FC<KitSlotProps> = ({
  slotId,
  label,
  product,
  asset,
  override,
  isActive = false,
  onActivate,
  mode = 'studio',
  onAssetClick
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`kit-slot ${product ? '' : 'kit-slot--empty'} ${
        isActive ? 'kit-slot--active is-active' : ''
      }`}
      onClick={() => onActivate(slotId)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(slotId);
        }
      }}
      aria-label={`Slot ${label}: ${product ? product.name : 'Vazio'}`}
    >
      {product ? (
        <>
          <div className="kit-slot-image kit-slot__image">
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
          <small>{money(product.priceCents)}</small>
        </>
      ) : (
        <>
          <span className="kit-plus" aria-hidden="true">
            ＋
          </span>
          <strong>{label}</strong>
        </>
      )}
    </div>
  );
};
