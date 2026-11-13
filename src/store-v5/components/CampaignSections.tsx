import React from 'react';
import type { Asset, CartLine, Section, SiteIR } from '../compiler/types';
import type { Override } from '../assets/export';
import { addLine } from '../capabilities/cart';
import { RecommendationCard } from './commerce/RecommendationCard';
import { KitBuilder as KitBuilderComponent } from './campaign/KitBuilder';
import { BookingPanel as BookingPanelComponent } from './campaign/BookingPanel';

export type CampaignProps = {
  section: Section;
  site: SiteIR;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  overrides: Record<string, Override>;
  onAsset: (a: Asset) => void;
  onMessage: (m: string) => void;
  onOpenProduct?: (sku: string) => void;
  onOpenCart?: () => void;
  mode?: 'studio' | 'standalone';
};

export function KitBuilder(props: CampaignProps) {
  return (
    <KitBuilderComponent
      section={props.section}
      site={props.site}
      cart={props.cart}
      setCart={props.setCart}
      overrides={props.overrides}
      mode={props.mode}
      onAssetClick={props.onAsset}
      onOpenCart={props.onOpenCart}
    />
  );
}

export function Booking(props: CampaignProps) {
  return (
    <BookingPanelComponent
      section={props.section}
      site={props.site}
      onComposeMessage={props.onMessage}
      mode={props.mode}
      overrides={props.overrides}
      onAssetClick={props.onAsset}
    />
  );
}

export function Recommendations({
  section,
  site,
  setCart,
  overrides,
  onAsset,
  onOpenProduct,
  onOpenCart,
  mode
}: CampaignProps) {
  return (
    <section className="recommendations" id={section.id}>
      <h2>{section.title}</h2>
      <div className="recommendation-row">
        {section.productSkus?.map(sku => {
          const p = site.productIndex[sku];
          if (!p) return null;
          const asset = site.assetIndex[p.media[0]?.assetId || ''];
          return (
            <RecommendationCard
              key={sku}
              product={p}
              asset={asset}
              override={asset ? overrides[asset.assetId] : undefined}
              onOpenProduct={onOpenProduct || (() => {})}
              onAddToCart={prod => {
                setCart(lines =>
                  addLine(lines, prod, undefined, 1, site.rules?.maxPerItem || prod.stock)
                );
                if (onOpenCart) onOpenCart();
              }}
              mode={mode}
              onAssetClick={onAsset}
            />
          );
        })}
      </div>
    </section>
  );
}
