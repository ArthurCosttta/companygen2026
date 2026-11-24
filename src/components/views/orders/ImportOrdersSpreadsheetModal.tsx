import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { formatCurrencyBRL, type BusinessOrder } from '@/schemas/profile.schema';
import { parseUniversalSpreadsheet, type ParsedSpreadsheetSheet } from '@/utils/xlsx-io';
import {
  buildSampleOrdersCsv,
  parseOrdersWorkbookSheets,
  parsePastedOrdersText,
  updateParsedOrderRowField,
  type ImportedKanbanStatus,
  type ParsedOrderRow,
} from './orders-spreadsheet-import';

export interface ImportOrdersSpreadsheetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingOrders: BusinessOrder[];
  onImportOrders: (validRows: ParsedOrderRow[]) => Promise<void>;
}

const STATUS_SELECT_OPTIONS: Array<{ value: ImportedKanbanStatus; label: string }> = [
  { value: 'aguardando_dados', label: 'Novo' },
  { value: 'aguardando_pagamento', label: 'Aguardando Pagto' },
  { value: 'confirmado', label: 'Preparo / Pago' },
  { value: 'concluido', label: 'Entregue' },
];

export function ImportOrdersSpreadsheetModal({
  open,
  onOpenChange,
  onImportOrders,
}: ImportOrdersSpreadsheetModalProps) {
  const { showToast } = useToast();

  const [pasteText, setPasteText] = React.useState('');
  const [rows, setRows] = React.useState<ParsedOrderRow[]>([]);
  const [workbookSheets, setWorkbookSheets] = React.useState<ParsedSpreadsheetSheet[]>([]);
  const [selectedSheetIdx, setSelectedSheetIdx] = React.useState<number>(0);
  const [sourceFilename, setSourceFilename] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [showAllPreviewRows, setShowAllPreviewRows] = React.useState(false);
  const cancelledRef = React.useRef(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setSubmitError('');
  }, [open]);

  const activeRows = React.useMemo(
    () => rows.filter((r) => !r.ignored),
    [rows],
  );
  const validRows = React.useMemo(
    () => activeRows.filter((r) => r.valid),
    [activeRows],
  );
  const invalidRows = React.useMemo(
    () => activeRows.filter((r) => !r.valid),
    [activeRows],
  );
  const totalValidCents = React.useMemo(
    () => validRows.reduce((sum, r) => sum + (Number(r.totalCents) || 0), 0),
    [validRows],
  );

  const handlePasteTextChange = (nextText: string) => {
    setPasteText(nextText);
    setSourceFilename('');
    setSubmitError('');
    if (!nextText.trim()) {
      setRows([]);
      return;
    }
    const parsed = parsePastedOrdersText(nextText);
    setRows(parsed);
  };

  const handleFileUpload = async (file: File | null | undefined) => {
    if (!file) return;
    setIsParsing(true);
    setSubmitError('');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseUniversalSpreadsheet(new Uint8Array(buffer), file.name);
      if (!parsed.sheets.length) {
        setSubmitError('A planilha enviada parece estar vazia.');
        return;
      }
      const workbookRes = parseOrdersWorkbookSheets(parsed.sheets);
      setWorkbookSheets(parsed.sheets);
      setSelectedSheetIdx(workbookRes.selectedSheetIdx);
      setRows(workbookRes.rows);
      setSourceFilename(`${file.name}${workbookRes.sheetNames.length > 1 ? ` · Aba: ${workbookRes.selectedSheetName}` : ''}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível ler este arquivo. Verifique se é .xlsx ou .csv.',
      );
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCellEdit = (
    rowIndex: number,
    field: 'customerName' | 'customerPhone' | 'itemsSummary' | 'rawPriceInput' | 'status',
    value: string,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.rowIndex === rowIndex ? updateParsedOrderRowField(row, field, value) : row,
      ),
    );
  };

  const handleToggleIgnoreRow = (rowIndex: number) => {
    setRows((prev) =>
      prev.map((row) =>
        row.rowIndex === rowIndex ? { ...row, ignored: !row.ignored } : row,
      ),
    );
  };

  const handleDownloadSampleCsv = () => {
    const csvContent = buildSampleOrdersCsv();
    try {
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo-pedidos-companygen.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Fallback: populate textarea with sample CSV
    }
    if (rows.length === 0) {
      handlePasteTextChange(csvContent);
    }
    showToast({
      type: 'neutral',
      message: 'Modelo de pedidos carregado pronto para revisão!',
      durationMs: 2500,
    });
  };

  const handleConfirmImport = async () => {
    if (isSubmitting || validRows.length === 0) return;
    cancelledRef.current = false;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onImportOrders(validRows);
      if (cancelledRef.current) return;
      setPasteText('');
      setRows([]);
      setSourceFilename('');
      onOpenChange(false);
    } catch (err) {
      if (cancelledRef.current) return;
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a importação dos pedidos.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={(next) => {
        if (!next && isSubmitting) {
          cancelledRef.current = true;
          setIsSubmitting(false);
        }
        onOpenChange(next);
      }}
      title="Importar Pedidos via Planilha (.xlsx / .csv)"
      description="Suba sua planilha ou cole linhas direto do Excel. Células incompletas podem ser corrigidas na tabela abaixo sem perder o lote."
      role="dialog"
      maxWidth="xl"
      mobileHeight="90%"
      preventCloseWhileSubmitting={false}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            data-testid="orders-import-summary"
            className="cg-tabular flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            {rows.length === 0 ? (
              <span>Aguardando arquivo ou colagem de linhas...</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 font-bold text-[#15803D] dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5" />
                  {validRows.length} válido(s) · {formatCurrencyBRL(totalValidCents)}
                </span>
                {invalidRows.length > 0 ? (
                  <span
                    data-testid="orders-import-invalid-badge"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 font-bold text-amber-800 dark:text-amber-300"
                  >
                    <AlertCircle className="size-3.5" />
                    {invalidRows.length} pendente(s) de ajuste inline
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <ActionButton
              variant="secondary"
              size={44}
              onClick={() => {
                if (isSubmitting) {
                  cancelledRef.current = true;
                  setIsSubmitting(false);
                }
                onOpenChange(false);
              }}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="success"
              size={44}
              data-testid="orders-confirm-import-btn"
              isSubmitting={isSubmitting}
              loadingText="Importando pedidos..."
              disabled={validRows.length === 0 || isSubmitting}
              onClick={() => void handleConfirmImport()}
            >
              Confirmar Importação ({validRows.length})
            </ActionButton>
          </div>
        </div>
      }
    >
      <div data-testid="orders-import-modal" className="space-y-4">
        {submitError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700"
          >
            {submitError}
          </div>
        ) : null}

        {/* Passo 1: Dropzone + Botão Modelo CSV + Textarea de Colagem */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          <div
            data-testid="orders-file-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer?.files?.[0];
              void handleFileUpload(file);
            }}
            className={`flex flex-col items-center justify-center justify-between rounded-2xl border-2 border-dashed p-4 text-center transition ${
              isDragging
                ? 'border-[#2563EB] bg-[#EFF6FF]'
                : 'border-slate-300 bg-slate-50/80 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              data-testid="orders-file-input"
              accept=".xlsx,.xls,.csv,.tsv"
              className="sr-only"
              onChange={(e) => void handleFileUpload(e.target.files?.[0])}
            />
            <div className="space-y-1.5 py-2">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-2xs">
                <FileSpreadsheet className="size-5" />
              </div>
              <p className="text-xs font-bold text-[#0F172A]">
                {sourceFilename
                  ? `Arquivo carregado: ${sourceFilename}`
                  : isParsing
                    ? 'Lendo planilha...'
                    : 'Arraste sua planilha (.xlsx ou .csv)'}
              </p>
              <p className="text-[11px] text-slate-500">
                Reconhece automaticamente colunas Cliente, WhatsApp, Produto, Valor e Status.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#09090B] px-3.5 text-xs font-semibold text-white hover:bg-[#1E293B] transition"
              >
                <Upload className="size-3.5" />
                <span>Escolher Arquivo</span>
              </button>

              <button
                type="button"
                data-testid="orders-download-sample-btn"
                onClick={handleDownloadSampleCsv}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                <Download className="size-3.5 text-[#2563EB]" />
                <span>Carregar Exemplo CSV</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="orders-paste-textarea"
                className="text-xs font-bold text-[#0F172A]"
              >
                Ou cole linhas do Excel / Google Sheets (Ctrl+V)
              </label>
              {rows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setPasteText('');
                    setRows([]);
                    setSourceFilename('');
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600"
                >
                  Limpar grade
                </button>
              ) : null}
            </div>
            <textarea
              id="orders-paste-textarea"
              data-testid="orders-paste-textarea"
              rows={4}
              value={pasteText}
              onChange={(e) => handlePasteTextChange(e.target.value)}
              placeholder={
                'Cliente\tWhatsApp\tProduto\tValor\tStatus\nMariana Costa\t11987654321\tRação Premium 10kg\tR$ 189,90\tPago'
              }
              className="w-full flex-1 rounded-2xl border border-slate-300 bg-white p-3 font-mono text-xs text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        </div>

        {/* Seletor de Abas quando o Excel possui múltiplas planilhas */}
        {workbookSheets.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-bold text-slate-600">Abas da planilha:</span>
            {workbookSheets.map((sh, sIdx) => (
              <button
                key={sh.name + sIdx}
                type="button"
                onClick={() => {
                  const next = parseOrdersWorkbookSheets(workbookSheets, sIdx);
                  setSelectedSheetIdx(sIdx);
                  setRows(next.rows);
                }}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedSheetIdx === sIdx
                    ? 'bg-[#09090B] text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                {sh.name || `Aba ${sIdx + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        {/* Passo 2 e 3: Preview com Auto-Mapeamento e Edição Inline de Células */}
        {rows.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                <Sparkles className="size-3.5 text-[#2563EB]" />
                Pré-visualização &amp; Correção Inline ({activeRows.length} linha(s))
              </span>
              <span className="text-[11px] text-slate-500">
                Edite diretamente qualquer célula destacada para corrigir valores antes de importar
              </span>
            </div>

            <div className="max-h-[320px] overflow-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10.5px] font-bold uppercase text-slate-600">
                  <tr>
                    <th className="w-[32px] px-2 py-2">#</th>
                    <th className="w-[22%] px-1.5 py-2">Cliente *</th>
                    <th className="w-[17%] px-1.5 py-2">WhatsApp</th>
                    <th className="w-[25%] px-1.5 py-2">Produto / Resumo</th>
                    <th className="w-[14%] px-1.5 py-2">Valor (R$) *</th>
                    <th className="w-[16%] px-1.5 py-2">Etapa Kanban</th>
                    <th className="w-[36px] px-1.5 py-2 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(showAllPreviewRows ? rows : rows.slice(0, 80)).map((row) => {
                    const hasNameError = Boolean(row.fieldErrors.customerName);
                    const hasPriceError = Boolean(row.fieldErrors.totalCents);
                    return (
                      <tr
                        key={row.rowIndex}
                        data-testid={`orders-preview-row-${row.rowIndex}`}
                        className={
                          row.ignored
                            ? 'bg-slate-100/70 opacity-50'
                            : !row.valid
                              ? 'bg-red-50/50'
                              : 'hover:bg-slate-50/80'
                        }
                      >
                        <td className="cg-tabular px-2 py-2 font-mono text-[11px] text-slate-500">
                          {row.rowIndex + 1}
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="text"
                            data-testid={`orders-preview-cell-${row.rowIndex}-customerName`}
                            aria-label={`Nome do cliente linha ${row.rowIndex + 1}`}
                            disabled={row.ignored}
                            value={row.customerName}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'customerName', e.target.value)
                            }
                            placeholder="Nome obrigatório"
                            className={`min-h-[32px] w-full rounded-lg border px-2 text-xs font-semibold ${
                              hasNameError
                                ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-600'
                                : 'border-slate-200 bg-white text-[#0F172A] focus:border-[#2563EB]'
                            }`}
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="text"
                            data-testid={`orders-preview-cell-${row.rowIndex}-customerPhone`}
                            aria-label={`Telefone linha ${row.rowIndex + 1}`}
                            disabled={row.ignored}
                            value={row.customerPhone}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'customerPhone', e.target.value)
                            }
                            placeholder="(11) 99999-9999"
                            className="cg-tabular min-h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-[#2563EB]"
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="text"
                            data-testid={`orders-preview-cell-${row.rowIndex}-itemsSummary`}
                            aria-label={`Produto linha ${row.rowIndex + 1}`}
                            disabled={row.ignored}
                            value={row.itemsSummary}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'itemsSummary', e.target.value)
                            }
                            placeholder="Produto vendido"
                            className="min-h-[32px] w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-[#2563EB]"
                          />
                        </td>

                        <td className="px-1.5 py-1.5">
                          <input
                            type="text"
                            data-testid={`orders-preview-cell-${row.rowIndex}-totalCents`}
                            aria-label={`Valor R$ linha ${row.rowIndex + 1}`}
                            disabled={row.ignored}
                            value={row.rawPriceInput}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'rawPriceInput', e.target.value)
                            }
                            placeholder="Ex: 99,90"
                            className={`cg-tabular min-h-[32px] w-full rounded-lg border px-2 text-xs font-bold ${
                              hasPriceError
                                ? 'border-red-400 bg-red-50 text-red-900 placeholder:text-red-400 focus:border-red-600'
                                : 'border-slate-200 bg-white text-[#0F172A] focus:border-[#16A34A]'
                            }`}
                          />
                          {hasPriceError ? (
                            <span className="mt-0.5 block truncate text-[10px] font-semibold text-red-600">
                              {row.fieldErrors.totalCents}
                            </span>
                          ) : null}
                        </td>

                        <td className="px-1.5 py-1.5">
                          <select
                            data-testid={`orders-preview-cell-${row.rowIndex}-status`}
                            aria-label={`Status linha ${row.rowIndex + 1}`}
                            disabled={row.ignored}
                            value={row.status}
                            onChange={(e) =>
                              handleCellEdit(row.rowIndex, 'status', e.target.value)
                            }
                            className="min-h-[32px] w-full rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-[#0F172A] focus:border-[#2563EB]"
                          >
                            {STATUS_SELECT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            data-testid={`orders-preview-ignore-${row.rowIndex}`}
                            onClick={() => handleToggleIgnoreRow(row.rowIndex)}
                            title={row.ignored ? 'Incluir linha' : 'Ignorar linha'}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 80 && !showAllPreviewRows ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>Mostrando as primeiras 80 de {rows.length} linhas para manter a tela rápida.</span>
                <button
                  type="button"
                  onClick={() => setShowAllPreviewRows(true)}
                  className="font-bold text-[#2563EB] hover:underline"
                >
                  Mostrar todas ({rows.length})
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalContainer>
  );
}
