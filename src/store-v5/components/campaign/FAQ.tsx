import React from 'react';
import type { Section, SiteIR } from '../../compiler/types';

export type FAQProps = {
  section: Section;
  site: SiteIR;
  style?: React.CSSProperties;
};

export const FAQ: React.FC<FAQProps> = ({ section, style }) => {
  const items = section.items || [];

  return (
    <section
      id={section.id}
      className={`faq-section faq-section--${section.variant || 'accordion'}`}
      style={style}
    >
      <div className="faq-section__container">
        <header className="faq-section__header">
          {section.eyebrow && (
            <span className="faq-section__eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="faq-section__title">{section.title || 'Dúvidas Frequentes'}</h2>
        </header>

        <div className="faq-section__items">
          {items.map((item, i) => (
            <details key={i} className="faq-section__item">
              <summary className="faq-section__summary">{item.title}</summary>
              <div className="faq-section__body">
                <p>{item.body}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
