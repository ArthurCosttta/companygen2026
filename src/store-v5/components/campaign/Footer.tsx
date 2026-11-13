import React from 'react';
import type { Section, SiteIR } from '../../compiler/types';
import { supportMessage } from '../../whatsapp/messages';

export type FooterProps = {
  section: Section;
  site: SiteIR;
  onSupportClick: (message: string) => void;
  style?: React.CSSProperties;
  mode?: 'studio' | 'standalone';
};

export const Footer: React.FC<FooterProps> = ({
  section,
  site,
  onSupportClick,
  style,
  mode = 'studio'
}) => {
  const isPublic = mode === 'standalone';

  return (
    <footer
      id={section.id}
      className={`shop-footer shop-footer--${section.variant || 'standard'}`}
      style={style}
    >
      <div className="shop-footer__container">
        <div className="shop-footer__brand-col">
          <strong className="shop-footer__brand-name">{site.business.name}</strong>
          {site.business.description && (
            <p className="shop-footer__desc">{site.business.description}</p>
          )}
        </div>

        <div className="shop-footer__contact-col">
          <button
            type="button"
            className="shop-footer__support-btn"
            onClick={() => onSupportClick(supportMessage(site, 'atendimento'))}
          >
            Falar com a loja pelo WhatsApp ↗
          </button>
          <div className="shop-footer__meta">
            <span>
              {site.business.address.city} · {site.business.address.state}
            </span>
            {!isPublic && site.whatsapp.recipientLabel && (
              <small className="shop-footer__recipient-label">
                {site.whatsapp.recipientLabel}
              </small>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
