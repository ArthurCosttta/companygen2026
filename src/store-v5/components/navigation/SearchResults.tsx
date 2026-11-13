import React from 'react';
import type { Product } from '../../compiler/types';
import { money } from '../../compiler/compile';

export type SearchResultsProps = {
  isOpen: boolean;
  query: string;
  results: Product[];
  selectedIndex: number;
  onSelectProduct: (product: Product) => void;
  onClose: () => void;
  onClear: () => void;
  categoryNames?: Record<string, string>;
};

export const SearchResults: React.FC<SearchResultsProps> = ({
  isOpen,
  query,
  results,
  selectedIndex,
  onSelectProduct,
  onClear,
  categoryNames = {}
}) => {
  if (!isOpen || !query.trim()) return null;

  return (
    <div
      className="search-results-popover"
      role="listbox"
      aria-label="Resultados da busca"
    >
      <div className="search-results-popover__header">
        <span className="search-results-popover__count">
          {results.length === 1 ? '1 produto encontrado' : `${results.length} produtos encontrados`}
        </span>
        <button
          type="button"
          className="search-results-popover__clear-btn"
          onClick={onClear}
        >
          Limpar busca
        </button>
      </div>

      {results.length === 0 ? (
        <div className="search-results-popover__empty">
          <p>Nenhum produto encontrado para "{query}".</p>
        </div>
      ) : (
        <ul className="search-results-popover__list">
          {results.map((product, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={product.sku}
                id={`search-item-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`search-results-popover__item ${
                  isSelected ? 'search-results-popover__item--selected' : ''
                }`}
                onClick={() => onSelectProduct(product)}
              >
                <div className="search-results-popover__item-details">
                  <span className="search-results-popover__item-name">
                    {product.name}
                  </span>
                  <span className="search-results-popover__item-meta">
                    {categoryNames[product.categoryId] || product.categoryId}
                  </span>
                </div>
                <strong className="search-results-popover__item-price">
                  {money(product.priceCents)}
                </strong>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
