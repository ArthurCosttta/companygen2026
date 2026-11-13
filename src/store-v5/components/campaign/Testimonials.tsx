import React from 'react';
import type { Section, SiteIR } from '../../compiler/types';

export type TestimonialsProps = {
  section: Section;
  site: SiteIR;
  style?: React.CSSProperties;
};

export const Testimonials: React.FC<TestimonialsProps> = ({ section, style }) => {
  const items = section.items || [];

  return (
    <section
      id={section.id}
      className={`testimonials-section testimonials-section--${section.variant || 'cards'}`}
      style={style}
    >
      <div className="testimonials-section__container">
        <header className="testimonials-section__header">
          {section.eyebrow && (
            <span className="testimonials-section__eyebrow">{section.eyebrow}</span>
          )}
          <h2 className="testimonials-section__title">{section.title || 'Depoimentos'}</h2>
        </header>

        <div className="testimonials-section__grid">
          {items.map((item, i) => (
            <blockquote key={i} className="testimonials-section__card">
              <p className="testimonials-section__quote">“{item.body}”</p>
              <footer className="testimonials-section__author">
                {item.author || item.title}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
};
