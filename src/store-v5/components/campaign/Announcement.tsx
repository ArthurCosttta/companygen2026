import React from 'react';
import type { Section, SiteIR } from '../../compiler/types';

export type AnnouncementProps = {
  section: Section;
  site: SiteIR;
  onCtaClick?: () => void;
  style?: React.CSSProperties;
};

export const Announcement: React.FC<AnnouncementProps> = ({
  section,
  onCtaClick,
  style
}) => {
  return (
    <section
      id={section.id}
      className={`announcement-strip announcement-strip--${section.variant || 'strip'}`}
      style={style}
    >
      <div className="announcement-strip__container">
        {section.eyebrow && (
          <span className="announcement-strip__eyebrow">{section.eyebrow}</span>
        )}
        <h2 className="announcement-strip__title">{section.title}</h2>
        {section.description && (
          <p className="announcement-strip__desc">{section.description}</p>
        )}
        {section.cta && onCtaClick && (
          <button
            type="button"
            className="announcement-strip__cta-btn"
            onClick={onCtaClick}
          >
            {section.cta} →
          </button>
        )}
      </div>
    </section>
  );
};
