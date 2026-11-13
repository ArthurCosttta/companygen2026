import React from 'react';
import type { Asset, Product, Section, SiteIR } from '../../compiler/types';
import { MediaFrame } from '../base/MediaFrame';
import { SearchInput } from './SearchInput';

export type HeaderProps = {
  section: Section;
  site: SiteIR;
  cartCount: number;
  onOpenCart: () => void;
  onSelectProduct: (product: Product) => void;
  onNavigateHome: () => void;
  onJumpSection?: (sectionId: string) => void;
  mode?: 'studio' | 'standalone';
  overrides?: Record<string, { url?: string; alt?: string; approved?: boolean }>;
  onAssetClick?: (asset: Asset) => void;
  style?: React.CSSProperties;
};

export const Header: React.FC<HeaderProps> = ({
  section,
  site,
  cartCount,
  onOpenCart,
  onSelectProduct,
  onNavigateHome,
  onJumpSection,
  mode = 'studio',
  overrides = {},
  onAssetClick,
  style
}) => {
  const logoAsset = site.assets.find(
    a => (a.role === 'brand_logo' || a.kind === 'brand.logo') && a.ownerRef === 'header'
  ) || site.assets.find(a => a.role === 'brand_logo' || a.kind === 'brand.logo');

  const resolvedLogoUrl = (logoAsset ? overrides[logoAsset.assetId]?.url : undefined) || logoAsset?.url || logoAsset?.path;
  const monogram = (site.business.name || 'CG')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || 'CG';

  const categoryNames = Object.fromEntries(site.categories.map(c => [c.id, c.name]));

  return (
    <header
      id={section.id}
      className={`shop-header shop-header--${section.variant || 'classic'}`}
      style={style}
    >
      <div className="brand shop-header__brand" onClick={onNavigateHome} style={{ cursor: 'pointer' }}>
        <div className="brand-asset shop-header__logo-box">
          {resolvedLogoUrl ? (
            <MediaFrame
              asset={logoAsset}
              override={logoAsset ? overrides[logoAsset.assetId] : undefined}
              role="brand_logo"
              fit="contain"
              height={42}
              compact={true}
              mode={mode}
              onAssetClick={onAssetClick}
              alt={`Logo da ${site.business.name}`}
            />
          ) : (
            <button
              type="button"
              className="brand-monogram"
              onClick={e => {
                if (logoAsset && onAssetClick && mode === 'studio') {
                  e.stopPropagation();
                  onAssetClick(logoAsset);
                }
              }}
              title={mode === 'studio' ? 'Clique para adicionar logo ou puxar do Instagram' : site.business.name}
            >
              {monogram}
            </button>
          )}
        </div>
        <div className="shop-header__brand-info">
          <strong className="shop-header__brand-name">{site.business.name}</strong>
          <span className="shop-header__brand-desc">
            {site.business.segment || site.business.description}
          </span>
        </div>
      </div>

      {section.navItems && section.navItems.length > 0 && (
        <nav className="campaign-nav shop-header__nav" aria-label="Navegação da loja">
          {section.navItems.map(item => (
            <button
              key={item.target}
              type="button"
              className="campaign-nav-btn shop-header__nav-link"
              onClick={() => onJumpSection && onJumpSection(item.target)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div className="shop-search shop-header__search-area">
        <SearchInput
          products={site.products}
          categoryNames={categoryNames}
          onSelectProduct={onSelectProduct}
        />
      </div>

      <div className="shop-header__actions">
        <button
          type="button"
          className="shop-cart shop-header__cart-btn"
          onClick={onOpenCart}
          aria-label={`Ver carrinho com ${cartCount} itens`}
        >
          <span className="shop-header__cart-icon" aria-hidden="true">
            🛒
          </span>
          <b className="shop-header__cart-badge">{cartCount}</b>
        </button>
      </div>
    </header>
  );
};
