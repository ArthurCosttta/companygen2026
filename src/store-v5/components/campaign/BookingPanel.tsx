import React, { useState, useEffect } from 'react';
import type { Asset, Section, SiteIR } from '../../compiler/types';
import { bookingMessage } from '../../whatsapp/messages';
import { MediaFrame } from '../base/MediaFrame';

export type BookingPanelProps = {
  section: Section;
  site: SiteIR;
  onComposeMessage: (message: string) => void;
  mode?: 'studio' | 'standalone';
  overrides?: Record<string, { url?: string; alt?: string; approved?: boolean }>;
  onAssetClick?: (asset: Asset) => void;
};

export const BookingPanel: React.FC<BookingPanelProps> = ({
  section,
  site,
  onComposeMessage,
  mode = 'studio',
  overrides = {},
  onAssetClick
}) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const booking = section.booking;
  const dateOptions = booking?.dateOptions || [];
  const timeOptions = booking?.timeOptions || [];

  useEffect(() => {
    if (dateOptions[0]) setDate(dateOptions[0]);
    if (timeOptions[0]) setTime(timeOptions[0]);
  }, [section.id]);

  const petName =
    site.layout.sections.find(s => s.type === 'kitBuilder')?.pet?.name || 'meu pet';

  const handleConsult = () => {
    const templateId = booking?.templateId || 'booking-interest';
    const msg = bookingMessage(
      site,
      templateId,
      petName,
      section.title || 'banho e tosa',
      date,
      time
    );
    onComposeMessage(msg);
  };

  const sceneAsset = section.assetId ? site.assetIndex[section.assetId] : undefined;

  return (
    <section id={section.id} className="booking-scene booking-panel">
      <div className="booking-background booking-panel__media-bg">
        <MediaFrame
          asset={sceneAsset}
          override={sceneAsset ? overrides[sceneAsset.assetId] : undefined}
          role="full_scene"
          fit="cover"
          aspectRatio="16:9"
          mode={mode}
          onAssetClick={onAssetClick}
          alt={section.title || 'Agendamento de serviço'}
        />
      </div>

      <div className="booking-copy booking-panel__copy">
        <h2 className="booking-panel__title">{section.title}</h2>
        {section.description && (
          <p className="booking-panel__desc">{section.description}</p>
        )}
      </div>

      <div className="booking-form booking-panel__form">
        <h3 className="booking-panel__form-title">
          {section.cta || 'Agende o banho e tosa'}
        </h3>
        <div>
          <label className="booking-panel__label">
            <span>Dia</span>
            <select
              value={date}
              onChange={e => setDate(e.target.value)}
              aria-label="Dia do agendamento"
            >
              {dateOptions.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="booking-panel__label">
            <span>Horário</span>
            <select
              value={time}
              onChange={e => setTime(e.target.value)}
              aria-label="Horário do agendamento"
            >
              {timeOptions.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="button primary booking-panel__submit-btn"
          onClick={handleConsult}
        >
          Ver horários →
        </button>

        <small className="booking-panel__disclaimer">
          Disponibilidade confirmada pela loja no WhatsApp.
        </small>
      </div>
    </section>
  );
};
