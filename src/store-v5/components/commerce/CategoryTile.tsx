import React from 'react';
import type { Asset, Category } from '../../compiler/types';
import { MediaFrame } from '../base/MediaFrame';

export type CategoryTileProps = {
  category: Category;
  asset?: Asset;
  override?: { url?: string; alt?: string; approved?: boolean };
  onSelect: (categoryId: string) => void;
  isSelected?: boolean;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
};

export const CategoryTile: React.FC<CategoryTileProps> = ({
  category,
  asset,
  override,
  onSelect,
  isSelected = false,
  mode = 'studio',
  onAssetClick
}) => {
  return (
    <div className={`category-tile ${isSelected ? 'category-tile--selected' : ''}`}>
      <div className="category-thumb">
        <MediaFrame
          asset={asset}
          override={override}
          role="category_tile"
          fit="contain"
          aspectRatio="1:1"
          mode={mode}
          compact={true}
          onAssetClick={onAssetClick}
          alt={category.name}
        />
      </div>
      <button
        type="button"
        className="category-tile__label-btn"
        onClick={() => onSelect(category.id)}
        aria-pressed={isSelected}
      >
        {category.name} →
      </button>
    </div>
  );
};
