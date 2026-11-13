import React, { useState } from 'react';
import { validateSpec, type ValidationResult } from '@/compiler/validate-spec';
import type { CampaignSpec } from '@/schemas/campaign.schema';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  FileJson,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSpec: (spec: CampaignSpec) => Promise<void>;
  onLoadExample: (examplePath: string) => Promise<void>;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  onImportSpec,
  onLoadExample,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      const res = validateSpec(content);
      setValidation(res);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setJsonText(val);
    if (!val.trim()) {
      setValidation(null);
      return;
    }
    const res = validateSpec(val);
    setValidation(res);
  };

  const handleConfirmImport = async () => {
    if (!validation || !validation.ok) return;
    setIsProcessing(true);
    try {
      await onImportSpec(validation.spec);
      onClose();
    } catch (err) {
      console.error('Import error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl bg-white border border-[#E6EFFB]">
        <DialogHeader className="pb-3 border-b border-[#E6EFFB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EDF4FF] text-[#0867E8] flex items-center justify-center font-bold">
              <FileJson className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-[17px] font-bold text-[#0B1D52]">
                Importar Campanha JSON
              </DialogTitle>
              <p className="text-[12px] text-[#64748B]">
                Contrato schema v1.0.0 com validação de posts, slides, paleta e templates.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4 cg-scroll">
          {/* Quick examples loader */}
          <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#E6EFFB] space-y-2">
            <span className="text-[11.5px] font-bold text-[#64748B] uppercase tracking-wide">
              Exemplos Prontos de Campanha
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onLoadExample('examples/campaign-fashion.json');
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg border border-[#E6EFFB] bg-white hover:bg-[#EDF4FF] text-[12px] font-semibold text-[#0B1D52] transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#0867E8]" />
                <span>Exemplo: Moda & Vestuário</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await onLoadExample('examples/campaign-electronics.json');
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg border border-[#E6EFFB] bg-white hover:bg-[#EDF4FF] text-[12px] font-semibold text-[#0B1D52] transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#0867E8]" />
                <span>Volt Eletrônicos (Tecnologia)</span>
              </button>
            </div>
          </div>

          {/* File Picker or Paste JSON */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-semibold text-[#0B1D52]">
                Selecione o arquivo .json ou cole o conteúdo:
              </label>
              <label className="cursor-pointer text-[12px] font-semibold text-[#0867E8] hover:underline flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" />
                <span>Escolher arquivo</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <textarea
              rows={8}
              value={jsonText}
              onChange={handleTextChange}
              placeholder='Cole aqui o JSON no schema 1.0.0 (ex: { "schema_version": "1.0.0", "brand": { ... }, "posts": [ ... ] })'
              className="w-full p-3 rounded-xl border border-[#E6EFFB] bg-[#F7FAFF] font-mono text-[11.5px] text-[#0B1D52] outline-none focus:border-[#0867E8] transition-colors"
            />
          </div>

          {/* Validation Feedback */}
          {validation && (
            <div className="space-y-2">
              {validation.ok ? (
                <div className="p-3 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] space-y-1.5">
                  <div className="flex items-center gap-2 text-[#24A677] font-bold text-[13px]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>JSON válido! Pronto para compilação.</span>
                  </div>
                  <div className="text-[12px] text-[#0B1D52] grid grid-cols-2 gap-1 pl-6">
                    <div>
                      <strong>Marca:</strong> {validation.spec.brand.name}
                    </div>
                    <div>
                      <strong>Campanha:</strong> {validation.spec.campaign.name}
                    </div>
                    <div>
                      <strong>Posts:</strong> {validation.spec.posts.length}
                    </div>
                    <div>
                      <strong>Produtos:</strong> {validation.spec.products.length}
                    </div>
                  </div>
                  {validation.warnings.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#A7F3D0] text-[11px] text-[#B45309]">
                      <div className="flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Avisos de campos não reconhecidos:</span>
                      </div>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {validation.warnings.map((w, i) => (
                          <li key={i}>
                            <code>{w.path}</code>: {w.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] space-y-2">
                  <div className="flex items-center gap-2 text-[#D94C4C] font-bold text-[13px]">
                    <AlertCircle className="w-4 h-4" />
                    <span>Erros de validação encontrados no JSON:</span>
                  </div>
                  <p className="text-[11.5px] text-[#64748B]">
                    Nenhum dado existente foi alterado. Corrija os caminhos indicados abaixo:
                  </p>
                  <ul className="list-disc pl-5 text-[11.5px] text-[#B91C1C] space-y-1 max-h-36 overflow-y-auto font-mono">
                    {validation.errors.map((err, i) => (
                      <li key={i}>
                        <strong className="text-[#0B1D52]">{err.path}:</strong> {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-[#E6EFFB] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#E6EFFB] bg-white hover:bg-[#F7FAFF] text-[13px] font-semibold text-[#64748B] transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!validation || !validation.ok || isProcessing}
            onClick={handleConfirmImport}
            className="px-5 py-2 rounded-xl bg-[#0867E8] hover:bg-[#064BB8] disabled:opacity-50 text-white text-[13px] font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isProcessing ? 'Importando...' : 'Importar e Preencher Calendário'}</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
