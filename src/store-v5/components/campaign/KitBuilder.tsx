import React, { useState, useEffect } from 'react';
import type { Asset, CartLine, Product, Section, SiteIR } from '../../compiler/types';
import { money } from '../../compiler/compile';
import { addLine } from '../../capabilities/cart';
import { MediaFrame } from '../base/MediaFrame';
import { KitSlot } from './KitSlot';
import { KitOptionCard } from './KitOptionCard';

export type KitBuilderProps = {
  section: Section;
  site: SiteIR;
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  overrides?: Record<string, { url?: string; alt?: string; approved?: boolean }>;
  mode?: 'studio' | 'standalone';
  onAssetClick?: (asset: Asset) => void;
  onOpenCart?: () => void;
  onMessage?: (message: string) => void;
};

export const KitBuilder: React.FC<KitBuilderProps> = ({
  section,
  site,
  setCart,
  overrides = {},
  mode = 'studio',
  onAssetClick,
  onOpenCart
}) => {
  const slots = section.kit?.slots || [];
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(slots.map(s => [s.id, s.defaultSku || '']))
  );
  const [activeSlotId, setActiveSlotId] = useState<string>(() =>
    slots.find(s => !s.defaultSku)?.id || slots[0]?.id || ''
  );

  useEffect(() => {
    setChosen(Object.fromEntries(slots.map(s => [s.id, s.defaultSku || ''])));
    setActiveSlotId(slots.find(s => !s.defaultSku)?.id || slots[0]?.id || '');
  }, [section.id, site.business.name]);

  const activeSlot = slots.find(s => s.id === activeSlotId) || slots[0];
  const selectedProducts = slots
    .map(s => site.productIndex[chosen[s.id]])
    .filter((x): x is Product => Boolean(x));

  const totalCents = selectedProducts.reduce((sum, p) => sum + p.priceCents, 0);

  const handleAddKitToCart = () => {
    if (selectedProducts.length === 0) return;
    setCart(lines => {
      let current = lines;
      for (const p of selectedProducts) {
        current = addLine(current, p, undefined, 1, site.rules?.maxPerItem || p.stock);
      }
      return current;
    });
    if (onOpenCart) {
      onOpenCart();
    }
  };

  const petAsset = section.pet?.assetId ? site.assetIndex[section.pet.assetId] : undefined;

  return (
    <section id={section.id} className="kit-builder">
      <div className="kit-heading kit-builder__heading">
        <h2 className="kit-builder__title">{section.title || 'Monte o kit'}</h2>
        {section.pet && (
          <div className="kit-pet kit-builder__pet">
            <div className="kit-pet-image kit-builder__pet-avatar">
              <MediaFrame
                asset={petAsset}
                override={petAsset ? overrides[petAsset.assetId] : undefined}
                role="portrait"
                fit="contain"
                aspectRatio="1:1"
                width={60}
                height={60}
                compact={true}
                mode={mode}
                onAssetClick={onAssetClick}
                alt={section.pet.name}
              />
            </div>
            <strong>{section.pet.name}</strong>
            <span>{section.pet.species}</span>
            <span>{section.pet.age}</span>
            <span>{section.pet.size}</span>
          </div>
        )}
      </div>

      <div className="kit-columns kit-builder__columns">
        <div className="kit-builder__selected-col">
          <h3>Seu kit</h3>
          <div className="kit-selected kit-builder__slots-grid">
            {slots.map(slot => {
              const product = site.productIndex[chosen[slot.id]];
              const asset = product?.media[0]?.assetId
                ? site.assetIndex[product.media[0].assetId]
                : undefined;
              return (
                <KitSlot
                  key={slot.id}
                  slotId={slot.id}
                  label={slot.label}
                  product={product}
                  asset={asset}
                  override={asset ? overrides[asset.assetId] : undefined}
                  isActive={slot.id === activeSlotId}
                  onActivate={setActiveSlotId}
                  mode={mode}
                  onAssetClick={onAssetClick}
                />
              );
            })}
          </div>
        </div>

        <div className="kit-builder__options-col">
          <h3>Escolha um item para o kit</h3>
          <div className="kit-tabs kit-builder__tabs" role="tablist" aria-label="Categorias do kit">
            {slots.map(slot => (
              <button
                key={slot.id}
                type="button"
                role="tab"
                aria-selected={slot.id === activeSlotId}
                className={slot.id === activeSlotId ? 'is-active kit-builder__tab--active' : ''}
                onClick={() => setActiveSlotId(slot.id)}
              >
                {slot.label}
              </button>
            ))}
          </div>

          <div className="kit-options kit-builder__options-grid">
            {activeSlot?.productSkus.map(sku => {
              const product = site.productIndex[sku];
              if (!product) return null;
              const asset = product.media[0]?.assetId
                ? site.assetIndex[product.media[0].assetId]
                : undefined;
              return (
                <KitOptionCard
                  key={sku}
                  product={product}
                  asset={asset}
                  override={asset ? overrides[asset.assetId] : undefined}
                  isSelected={chosen[activeSlot.id] === sku}
                  onSelect={chosenSku =>
                    setChosen(prev => ({ ...prev, [activeSlot.id]: chosenSku }))
                  }
                  mode={mode}
                  onAssetClick={onAssetClick}
                />
              );
            })}
          </div>

          {chosen[activeSlot?.id || ''] && (
            <button
              type="button"
              className="kit-clear kit-builder__remove-item-btn"
              onClick={() =>
                setChosen(prev => ({ ...prev, [activeSlot.id]: '' }))
              }
            >
              Remover item de {activeSlot.label}
            </button>
          )}
        </div>
      </div>

      <div className="kit-summary kit-builder__summary">
        <strong>Seu kit do {section.pet?.name || 'Pet'}</strong>
        <span>{selectedProducts.length} de {slots.length} itens selecionados</span>
        <div>
          Total do kit <b>{money(totalCents)}</b>
        </div>
        <button
          type="button"
          className="kit-builder__add-to-cart-btn"
          disabled={selectedProducts.length === 0}
          onClick={handleAddKitToCart}
        >
          {section.cta || 'Adicionar à sacola'}
        </button>
      </div>
    </section>
  );
};
