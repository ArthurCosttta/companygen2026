import React from 'react';
import type { Section, SiteIR } from '../../compiler/types';

export type FeatureBandProps = {
  section: Section;
  site: SiteIR;
  style?: React.CSSProperties;
};

export const FeatureBand: React.FC<FeatureBandProps> = ({ section, site, style }) => {
  const features = site.business.features || [];

  return (
    <section
      id={section.id}
      className={`features-band features-band--${section.variant || 'band'}`}
      style={style}
    >
      <div className="features-band__container">
        {features.map((f, i) => (
          <div key={i} className="features-band__item">
            <span className="features-band__number">0{i + 1}</span>
            <div className="features-band__text">
              <strong className="features-band__title">{f.title}</strong>
              <p className="features-band__desc">{f.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
