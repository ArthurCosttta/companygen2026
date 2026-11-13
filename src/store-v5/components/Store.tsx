import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, CartLine, Product, SiteIR, Variant } from '../compiler/types';
import { money } from '../compiler/compile';
import { addLine, total } from '../capabilities/cart';
import { productMessage, supportMessage } from '../whatsapp/messages';
import { responsiveStyle } from '../genome/gene-registry';
import { runViewTransition } from '../motion/motion-runner';
import type { Override } from '../assets/export';
import { ProductDetail } from './ProductDetail';
import { Booking, KitBuilder, Recommendations } from './CampaignSections';
import { ProductCard } from './commerce/ProductCard';
import { CategoryTile } from './commerce/CategoryTile';
import { CartDialog } from './commerce/CartDialog';
import { Header } from './navigation/Header';
import { Hero } from './navigation/Hero';
import { FeatureBand } from './campaign/FeatureBand';
import { Announcement } from './campaign/Announcement';
import { EditorialSection } from './campaign/EditorialSection';
import { FAQ } from './campaign/FAQ';
import { Testimonials } from './campaign/Testimonials';
import { Footer } from './campaign/Footer';

export type StoreProps = {
  site: SiteIR;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  overrides: Record<string, Override>;
  onAsset: (a: Asset) => void;
  onComponent?: (id: string) => void;
  mode?: 'studio' | 'standalone';
  onSimulateCheckout?: (message: string, cart: CartLine[]) => void;
};

export function Store({
  site,
  cart,
  setCart,
  overrides,
  onAsset,
  onComponent,
  mode = 'studio',
  onSimulateCheckout
}: StoreProps) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [filter, setFilter] = useState('');
  const [available, setAvailable] = useState(false);
  const [view, setView] = useState<'home' | 'product'>('home');
  const [selectedSku, setSelectedSku] = useState(site.products[0]?.sku || '');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartInitialStep, setCartInitialStep] = useState<'cart' | 'review'>('cart');
  const [directMessage, setDirectMessage] = useState('');

  // Medir largura real do contêiner para Container Queries / variantes
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  // Resetar estados locais ao mudar de site
  useEffect(() => {
    setFilter('');
    setAvailable(false);
    setView('home');
    setIsCartOpen(false);
    setDirectMessage('');
  }, [site]);

  // Sincronizar rota simples pelo path da URL ou hash
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const hash = window.location.hash;
      const match = pathname.match(/\/produto\/([^/]+)/) || hash.match(/#\/produto\/([^/]+)/);
      if (match) {
        const slug = match[1];
        const p = site.slugIndex?.[slug] || site.products.find(x => x.sku === slug || x.slug === slug);
        if (p) {
          setSelectedSku(p.sku);
          setView('product');
          return;
        }
      }
      setView('home');
    };

    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, [site]);

  // Rolagem suave ao trocar de tela
  useEffect(() => {
    const scroller = container.current?.closest('.preview-scroller');
    if (scroller && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: 0 });
    }
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
    }
  }, [view, selectedSku]);

  const style = (s: SiteIR['layout']['sections'][number]) =>
    responsiveStyle(s, width) as React.CSSProperties;

  const products = useMemo(
    () =>
      site.products.filter(
        p => (!filter || p.categoryId === filter) && (!available || p.stock > 0)
      ),
    [site, filter, available]
  );

  const jump = (id: string) => {
    if (view !== 'home') {
      runViewTransition(() => {
        setView('home');
      });
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openProduct = (sku: string) => {
    runViewTransition(() => {
      setSelectedSku(sku);
      setView('product');
      const p = site.productIndex[sku];
      if (p?.slug && typeof window !== 'undefined' && window.history?.pushState) {
        window.history.pushState({}, '', `/produto/${p.slug}`);
      }
    });
  };

  const navigateHome = () => {
    runViewTransition(() => {
      setView('home');
      if (typeof window !== 'undefined' && window.history?.pushState) {
        window.history.pushState({}, '', '/');
      }
    });
  };

  const handleAddToCart = (product: Product, variant?: Variant, quantity = 1) => {
    setCart(lines =>
      addLine(lines, product, variant, quantity, site.rules?.maxPerItem || product.stock)
    );
  };

  const handleOpenReview = (messageText: string) => {
    setDirectMessage(messageText);
    setCartInitialStep('review');
    setIsCartOpen(true);
  };

  const handleOpenCart = () => {
    setDirectMessage('');
    setCartInitialStep('cart');
    setIsCartOpen(true);
  };

  const handleRemoveItem = (key: string) => {
    setCart(lines => lines.filter(l => l.key !== key));
  };

  const handleUpdateQuantity = (key: string, qty: number) => {
    setCart(lines => lines.map(l => (l.key === key ? { ...l, quantity: qty } : l)));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const totalItems = cart.reduce((n, l) => n + l.quantity, 0);
  const pendingAssets = site.assets.filter(a => a.status !== 'ready' && !overrides[a.assetId]).length;
  const currentProduct = site.productIndex[selectedSku] || site.products[0];

  return (
    <div
      className={`store store--${mode}`}
      ref={container}
      style={
        {
          '--primary': site.theme.primary,
          '--accent': site.theme.accent || '#FFD96B',
          '--paper': site.theme.background,
          '--ink': site.theme.text,
          '--radius': `${site.theme.radius}px`,
          '--display-font':
            site.theme.fontFamily === 'serif'
              ? 'Georgia, Cambria, serif'
              : 'Inter, ui-sans-serif, system-ui, sans-serif'
        } as React.CSSProperties
      }
    >
      {/* 1. Header Fixo / Comum */}
      {(() => {
        const headerSection = site.layout.sections.find(s => s.type === 'header') || {
          id: 'header',
          type: 'header' as const
        };
        return (
          <Header
            section={headerSection}
            site={site}
            cartCount={totalItems}
            onOpenCart={handleOpenCart}
            onSelectProduct={p => openProduct(p.sku)}
            onNavigateHome={navigateHome}
            onJumpSection={jump}
            mode={mode}
            overrides={overrides}
            onAssetClick={onAsset}
            style={style(headerSection)}
          />
        );
      })()}

      {/* 2. Visualização de Detalhe de Produto (/produto/:slug) */}
      {view === 'product' && currentProduct && (
        <ProductDetail
          key={currentProduct.sku}
          product={currentProduct}
          site={site}
          cart={cart}
          setCart={setCart}
          overrides={overrides}
          onAsset={onAsset}
          onMessage={handleOpenReview}
          onBack={navigateHome}
          onCart={() => {
            setView('home');
            handleOpenCart();
          }}
          mode={mode}
        />
      )}

      {/* 3. Visualização da Home (todas as seções exceto header, footer e cart) */}
      {view === 'home' &&
        site.layout.sections.map(section => {
          if (['header', 'cart', 'footer'].includes(section.type)) return null;

          switch (section.type) {
            case 'hero':
              return (
                <Hero
                  key={section.id}
                  section={section}
                  site={site}
                  onCtaClick={() =>
                    jump(section.variant === 'photoFull' ? 'kit-builder' : 'catalog-heading')
                  }
                  mode={mode}
                  overrides={overrides}
                  onAssetClick={onAsset}
                  containerWidth={width}
                  style={style(section)}
                />
              );

            case 'kitBuilder':
              return (
                <KitBuilder
                  key={section.id}
                  section={section}
                  site={site}
                  cart={cart}
                  setCart={setCart}
                  overrides={overrides}
                  mode={mode}
                  onAsset={onAsset}
                  onMessage={handleOpenReview}
                  onOpenCart={handleOpenCart}
                />
              );

            case 'booking':
              return (
                <Booking
                  key={section.id}
                  section={section}
                  site={site}
                  cart={cart}
                  setCart={setCart}
                  overrides={overrides}
                  onAsset={onAsset}
                  onMessage={handleOpenReview}
                  mode={mode}
                />
              );

            case 'recommendations':
              return (
                <Recommendations
                  key={section.id}
                  section={section}
                  site={site}
                  cart={cart}
                  setCart={setCart}
                  overrides={overrides}
                  onAsset={onAsset}
                  onMessage={handleOpenReview}
                  onOpenProduct={openProduct}
                  onOpenCart={handleOpenCart}
                  mode={mode}
                />
              );

            case 'features':
              return (
                <FeatureBand
                  key={section.id}
                  section={section}
                  site={site}
                  style={style(section)}
                />
              );

            case 'categoryTiles':
              return (
                <section
                  key={section.id}
                  id={section.id}
                  className={`category-tiles category-tiles--${section.variant || 'tiles'}`}
                  style={style(section)}
                >
                  <div className="section-title">
                    <h2>{section.title || 'Categorias'}</h2>
                    <span>{site.categories.length} categorias</span>
                  </div>
                  <div className="category-row">
                    {site.categories.map(c => {
                      const cAsset = site.assetIndex[c.assetId || ''];
                      return (
                        <CategoryTile
                          key={c.id}
                          category={c}
                          asset={cAsset}
                          override={cAsset ? overrides[cAsset.assetId] : undefined}
                          onSelect={catId => {
                            setFilter(catId);
                            jump('catalog-heading');
                          }}
                          isSelected={filter === c.id}
                          mode={mode}
                          onAssetClick={onAsset}
                        />
                      );
                    })}
                  </div>
                </section>
              );

            case 'catalog':
              return (
                <section
                  key={section.id}
                  id={section.id}
                  className={`catalog catalog--${section.variant || 'grid'}`}
                  style={style(section)}
                >
                  <div className="section-title">
                    <div>
                      {mode === 'studio' && (
                        <span className="eyebrow">
                          CATÁLOGO · {pendingAssets} IMAGENS PENDENTES
                        </span>
                      )}
                      <h2 id="catalog-heading">{section.title || 'Produtos'}</h2>
                    </div>
                    <span>
                      {products.length} de {site.products.length} produtos
                    </span>
                  </div>

                  <div className="filters">
                    <button
                      type="button"
                      className={!filter ? 'selected' : ''}
                      onClick={() => setFilter('')}
                    >
                      Todos
                    </button>
                    {site.categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={filter === c.id ? 'selected' : ''}
                        onClick={() => setFilter(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={available}
                        onChange={e => setAvailable(e.target.checked)}
                      />{' '}
                      Em estoque
                    </label>
                  </div>

                  {products.length > 0 ? (
                    <div className="product-grid">
                      {products.map(p => {
                        const pAsset = site.assetIndex[p.media[0]?.assetId || ''];
                        return (
                          <ProductCard
                            key={p.sku}
                            product={p}
                            asset={pAsset}
                            override={pAsset ? overrides[pAsset.assetId] : undefined}
                            containerWidth={width > 768 ? width / 3 : width}
                            categoryName={site.categories.find(c => c.id === p.categoryId)?.name}
                            onOpenProduct={openProduct}
                            onAddToCart={handleAddToCart}
                            onDirectMessage={(prod, variant, qty) =>
                              handleOpenReview(productMessage(site, prod, variant, qty || 1))
                            }
                            onComponentConfig={onComponent}
                            mode={mode}
                            onAssetClick={onAsset}
                            quantityStep={site.rules?.quantityStep}
                            maxPerItem={site.rules?.maxPerItem}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty">
                      Nenhum produto encontrado.{' '}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setFilter('');
                          setAvailable(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    </div>
                  )}
                </section>
              );

            case 'announcement':
              return (
                <Announcement
                  key={section.id}
                  section={section}
                  site={site}
                  onCtaClick={() => jump('catalog-heading')}
                  style={style(section)}
                />
              );

            case 'story':
            case 'contact':
              return (
                <EditorialSection
                  key={section.id}
                  section={section}
                  site={site}
                  onCtaClick={() =>
                    section.type === 'contact'
                      ? handleOpenReview(supportMessage(site, section.title || 'atendimento'))
                      : jump('catalog-heading')
                  }
                  mode={mode}
                  overrides={overrides}
                  onAssetClick={onAsset}
                  style={style(section)}
                />
              );

            case 'faq':
              return <FAQ key={section.id} section={section} site={site} style={style(section)} />;

            case 'testimonials':
              return (
                <Testimonials
                  key={section.id}
                  section={section}
                  site={site}
                  style={style(section)}
                />
              );

            default:
              return null;
          }
        })}

      {/* 4. Footer Fixo */}
      {(() => {
        const footerSection = site.layout.sections.find(s => s.type === 'footer') || {
          id: 'footer',
          type: 'footer' as const
        };
        return (
          <Footer
            section={footerSection}
            site={site}
            onSupportClick={msg => handleOpenReview(msg)}
            style={style(footerSection)}
            mode={mode}
          />
        );
      })()}

      {/* 5. Barra Inferior de Checkout (Home e Detalhe) */}
      <div className="checkout-bar">
        <div>
          <span className="cart-icon">▣</span>
          <div>
            <strong>
              {totalItems} {totalItems === 1 ? 'item na sacola' : 'itens na sacola'}
            </strong>
            <small>Total: {money(total(cart, site.rules))}</small>
          </div>
        </div>
        <button
          type="button"
          className="cart-link"
          onClick={handleOpenCart}
        >
          Ver carrinho
        </button>
        <button
          type="button"
          className="checkout-wa"
          disabled={!cart.length}
          onClick={handleOpenCart}
        >
          ◉ &nbsp; Ir para a sacola <span>→</span>
        </button>
      </div>

      {/* 6. Único Modal Central de Carrinho e Revisão (CartDialog) */}
      <CartDialog
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        site={site}
        initialStep={cartInitialStep}
        initialMessage={directMessage}
        onSimulateCheckout={onSimulateCheckout}
      />
    </div>
  );
}
