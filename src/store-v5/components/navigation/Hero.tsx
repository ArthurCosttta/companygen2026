import React from 'react';
import type { Asset, Section, SiteIR } from '../../compiler/types';
import { MediaFrame } from '../base/MediaFrame';

export type HeroProps = {
  section: Section;
  site: SiteIR;
  onCtaClick: () => void;
  mode?: 'studio' | 'standalone';
  overrides?: Record<string, { url?: string; alt?: string; approved?: boolean }>;
  onAssetClick?: (asset: Asset) => void;
  containerWidth?: number;
  style?: React.CSSProperties;
};

export const Hero: React.FC<HeroProps> = ({
  section,
  site,
  onCtaClick,
  mode = 'studio',
  overrides = {},
  onAssetClick,
  containerWidth = 1200,
  style
}) => {
  const heroAsset = section.assetId ? site.assetIndex[section.assetId] : undefined;
  const isPhotoFull = section.variant === 'photoFull';

  return (
    <section
      id={section.id}
      className={`shop-hero shop-hero--${section.variant || 'split'}`}
      style={style}
    >
      <div className="hero-copy shop-hero__copy">
        <span className="eyebrow shop-hero__eyebrow">
          {section.eyebrow || `${site.business.address.city} · ${site.business.address.state}`}
        </span>
        <h1 className="shop-hero__title">
          {section.title || site.business.tagline || site.business.name}
        </h1>
        {section.description && (
          <p className="shop-hero__desc">{section.description}</p>
        )}
        <button
          type="button"
          className="hero-cta shop-hero__cta-btn"
          onClick={onCtaClick}
        >
          <span>{section.cta || 'Ver produtos'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="hero-media shop-hero__media">
        <MediaFrame
          asset={heroAsset}
          override={heroAsset ? overrides[heroAsset.assetId] : undefined}
          role={isPhotoFull ? 'full_scene' : (heroAsset?.role || 'full_scene')}
          fit={isPhotoFull ? 'cover' : 'contain'}
          aspectRatio={isPhotoFull ? undefined : '16:9'}
          maxBlockPx={isPhotoFull ? 480 : 340}
          minBlockPx={isPhotoFull ? 320 : 188}
          mode={mode}
          onAssetClick={onAssetClick}
          containerWidth={containerWidth}
          alt={section.title || 'Destaque'}
          priority
        />
      </div>
    </section>
  );
};
