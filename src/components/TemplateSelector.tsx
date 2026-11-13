import React from 'react';
import { listTemplates, getTemplate } from '@/compiler/template-registry';
import { LayoutTemplate, Layers } from 'lucide-react';

interface TemplateSelectorProps {
  currentTemplateId: string;
  currentVariant: string;
  onSelectTemplate: (templateId: string, defaultVariant: string) => void;
  onSelectVariant: (variantId: string) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  currentTemplateId,
  currentVariant,
  onSelectTemplate,
  onSelectVariant,
}) => {
  const allTemplates = listTemplates();
  const currentTemplate = getTemplate(currentTemplateId) || allTemplates[0];

  return (
    <div className="space-y-3">
      {/* Template Select */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold text-[#0B1D52] flex items-center gap-1.5">
          <LayoutTemplate className="w-3.5 h-3.5 text-[#0867E8]" />
          <span>Modelo de Composição (Template)</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {allTemplates.map((t) => {
            const isSelected = t.id === currentTemplateId;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTemplate(t.id, t.defaultVariant)}
                className={`px-2.5 py-2 rounded-xl text-left border text-[12px] transition-all ${
                  isSelected
                    ? 'border-[#0867E8] bg-[#EDF4FF] text-[#0867E8] font-bold shadow-xs'
                    : 'border-[#E6EFFB] bg-white text-[#64748B] hover:border-[#BFDBFE] hover:text-[#0B1D52]'
                }`}
              >
                <div className="truncate">{t.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Variant Select */}
      {currentTemplate.variants.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-[12px] font-semibold text-[#0B1D52] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#0867E8]" />
            <span>Variante de Layout</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {currentTemplate.variants.map((v) => {
              const isSelected = v.id === currentVariant;
              return (
                <button
                  key={v.id}
                  onClick={() => onSelectVariant(v.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] border transition-all ${
                    isSelected
                      ? 'border-[#0867E8] bg-[#0867E8] text-white font-semibold shadow-xs'
                      : 'border-[#E6EFFB] bg-white text-[#64748B] hover:border-[#BFDBFE] hover:text-[#0B1D52]'
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
