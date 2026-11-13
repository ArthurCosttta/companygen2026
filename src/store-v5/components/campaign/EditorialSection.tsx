import React from 'react';
import type { Asset, Section, SiteIR } from '../../compiler/types';
import { MediaFrame } from '../base/MediaFrame';

export type EditorialSectionProps = {
  section: Section;
  site: SiteIR;
  onCtaClick?: () => void;
  mode?: 'studio' | 'standalone';
  overrides?: Record<string, { url?: string; alt?: string; approved?: boolean }>;
  onAssetClick?: (asset: Asset) => void;
  style?: React.CSSProperties;
};

export const EditorialSection: React.FC<EditorialSectionProps> = ({
  section,
  site,
  onCtaClick,
  mode = 'studio',
  overrides = {},
  onAssetClick,
  style
}) => {
  const asset = section.assetId ? site.assetIndex[section.assetId] : undefined;

  return (
    <section
      id={section.id}
      className={`editorial-section editorial-section--${section.variant || 'split'}`}
      style={style}
    >
      <div className="editorial-section__container">
        {asset && (
          <div className="editorial-section__media">
            <MediaFrame
              asset={asset}
              override={asset ? overrides[asset.assetId] : undefined}
              role="full_scene"
              fit="cover"
              aspectRatio="4:3"
              mode={mode}
              onAssetClick={onAssetClick}
              alt={section.title || 'Imagem da seção'}
            />
          </div>
        )}

        <div className="editorial-section__copy">
          {section.eyebrow && (
            <span className="editorial-section__eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="editorial-section__title">{section.title}</h2>
          {section.description && (
            <p className="editorial-section__desc">{section.description}</p>
          )}
          {section.cta && onCtaClick && (
            <button
              type="button"
              className="editorial-section__cta-btn"
              onClick={onCtaClick}
            >
              {section.cta} →
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
