import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Product } from '../../compiler/types';
import { folded } from '../../compiler/compile';
import { SearchResults } from './SearchResults';

export type SearchInputProps = {
  products: Product[];
  categoryNames?: Record<string, string>;
  onSelectProduct: (product: Product) => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
};

export const SearchInput: React.FC<SearchInputProps> = ({
  products,
  categoryNames = {},
  onSelectProduct,
  initialQuery = '',
  onQueryChange
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce de 150 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      if (onQueryChange) onQueryChange(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, onQueryChange]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ranking de busca normalizada:
  // nome prefixado → nome parcial → categoria → SKU
  const filteredResults = useMemo(() => {
    const q = folded(debouncedQuery.trim());
    if (!q) return [];

    const prefixMatch: Product[] = [];
    const nameMatch: Product[] = [];
    const catMatch: Product[] = [];
    const skuMatch: Product[] = [];

    for (const p of products) {
      const pName = folded(p.name);
      const catName = folded(categoryNames[p.categoryId] || '');
      const pSku = folded(p.sku);
      const attrVals = Object.values(p.attributes || {})
        .map(folded)
        .join(' ');

      if (pName.startsWith(q)) {
        prefixMatch.push(p);
      } else if (pName.includes(q)) {
        nameMatch.push(p);
      } else if (catName.includes(q)) {
        catMatch.push(p);
      } else if (pSku.includes(q) || attrVals.includes(q)) {
        skuMatch.push(p);
      }
    }

    return [...prefixMatch, ...nameMatch, ...catMatch, ...skuMatch].slice(0, 8);
  }, [debouncedQuery, products, categoryNames]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== 'Escape') {
      setIsOpen(true);
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (filteredResults.length ? (prev + 1) % filteredResults.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev =>
        filteredResults.length ? (prev - 1 + filteredResults.length) % filteredResults.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults.length > 0 && filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelect = (product: Product) => {
    setIsOpen(false);
    onSelectProduct(product);
  };

  const handleClear = () => {
    setQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="search-input-container" ref={containerRef}>
      <label className="search-input-field">
        <span className="sr-only">Buscar produtos</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={isOpen && Boolean(debouncedQuery.trim())}
          aria-autocomplete="list"
          aria-controls="search-results-list"
          placeholder="Buscar produtos..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <span className="search-input-icon" aria-hidden="true">
          ⌕
        </span>
      </label>

      <SearchResults
        isOpen={isOpen}
        query={debouncedQuery}
        results={filteredResults}
        selectedIndex={selectedIndex}
        onSelectProduct={handleSelect}
        onClose={() => setIsOpen(false)}
        onClear={handleClear}
        categoryNames={categoryNames}
      />
    </div>
  );
};
