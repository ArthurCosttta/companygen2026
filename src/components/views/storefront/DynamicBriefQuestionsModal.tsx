import React, { useMemo, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import { formatCurrencyBRL, type CatalogProduct } from '@/schemas/profile.schema';

export interface BriefQuestionOption {
  id: string;
  label: string;
  hint?: string;
  badge?: string;
}

export interface BriefQuestionItem {
  id: string;
  order: number;
  type:
    | 'single_choice_cards'
    | 'multi_select_chips'
    | 'short_text_input'
    | 'anchor_sku_picker'
    | 'metric_pair_input';
  maxSelections?: number;
  title: string;
  helperText?: string;
  placeholder?: string;
  recommendedDefault?: unknown;
  options?: BriefQuestionOption[];
  optionsFromCatalog?: boolean;
  fields?: Array<{ key: string; label: string; default?: string }>;
  mapsToTarget: string;
}

export interface BriefQuestionsJson {
  schemaVersion?: string;
  detectedNiche: string;
  recommendedCampaignTheme: string;
  contextSummaryPt: string;
  questions: BriefQuestionItem[];
  source?: 'glm' | 'fallback' | string;
  fallbackUsed?: boolean;
  modelUsed?: string;
}

/**
 * Modal Branco Minimalista (1 Pergunta por Tela · 1 Ação por Estado)
 */
export function DynamicBriefQuestionsModal({
  open,
  questionsJson,
  catalogProducts = [],
  submitting = false,
  confirmLabel = 'Gerar página',
  onClose,
  onConfirm,
}: {
  open: boolean;
  questionsJson: BriefQuestionsJson | null;
  catalogProducts?: CatalogProduct[];
  submitting?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (answers: Record<string, unknown>) => void;
}) {
  const questions = useMemo(() => (questionsJson?.questions || []).slice(0, 5), [questionsJson]);

  const initialAnswers = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const q of questions) {
      if (q.type === 'metric_pair_input' && Array.isArray(q.fields)) {
        const obj: Record<string, string> = {};
        for (const f of q.fields) obj[f.key] = f.default || '';
        map[q.id] = obj;
      } else if (q.recommendedDefault !== undefined) {
        map[q.id] = q.recommendedDefault;
      } else if (q.type === 'multi_select_chips') {
        map[q.id] = [];
      } else {
        map[q.id] = '';
      }
    }
    return map;
  }, [questions]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [stepIdx, setStepIdx] = useState(0);

  React.useEffect(() => {
    setAnswers(initialAnswers);
    setStepIdx(0);
  }, [initialAnswers, open]);

  if (!open || !questionsJson || questions.length === 0) return null;

  const safeIdx = Math.min(Math.max(0, stepIdx), questions.length - 1);
  const currentQ = questions[safeIdx];
  const isLastStep = safeIdx >= questions.length - 1;
  const val = answers[currentQ.id];
  const progressPct = Math.round(((safeIdx + 1) / questions.length) * 100);
  const isGlmSource =
    questionsJson.source === 'glm' ||
    questionsJson.fallbackUsed === false ||
    (typeof questionsJson.modelUsed === 'string' && questionsJson.modelUsed.toLowerCase().includes('glm'));

  const toggleChip = (qId: string, label: string, maxSel = 4) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qId]) ? (prev[qId] as string[]) : [];
      if (cur.includes(label)) return { ...prev, [qId]: cur.filter((x) => x !== label) };
      if (cur.length >= maxSel) return { ...prev, [qId]: [...cur.slice(1), label] };
      return { ...prev, [qId]: [...cur, label] };
    });
  };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        <div
          data-testid="dynamic-brief-questions-modal"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2 }}
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 opacity-100 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)]"
          >
            {/* Barra de progresso minimalista */}
            <div className="h-1 w-full bg-slate-100">
              <div
                className="h-full bg-slate-900 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Header limpo: 1 estado por vez */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Pergunta {safeIdx + 1} de {questions.length}
                  </span>
                  <span
                    data-testid="brief-source-badge"
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      isGlmSource
                        ? 'border-blue-200 bg-[#EFF6FF] text-[#1D4ED8]'
                        : 'border-slate-200 bg-[#F8FAFC] text-slate-600'
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        isGlmSource ? 'bg-[#2563EB]' : 'bg-slate-400'
                      }`}
                    />
                    {isGlmSource ? 'IA CompanyGen' : 'Briefing contextual'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{questionsJson.contextSummaryPt}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Fechar perguntas"
              >
                <X className="size-4" weight="regular" />
              </button>
            </div>

            {/* Única pergunta ativa na tela */}
            <div className="px-6 py-6" data-testid={`brief-q-${currentQ.id}`}>
              <h2 className="text-lg font-bold tracking-tight text-slate-950">{currentQ.title}</h2>
              {currentQ.helperText ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{currentQ.helperText}</p>
              ) : null}

              <div className="mt-5">
                {currentQ.type === 'single_choice_cards' && Array.isArray(currentQ.options) ? (
                  <div className="space-y-2">
                    {currentQ.options.map((opt) => {
                      const active = val === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: opt.id }))}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${
                            active
                              ? 'border-slate-950 bg-slate-50 text-slate-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <strong className="block text-sm font-semibold text-slate-950">{opt.label}</strong>
                            {opt.hint ? <span className="mt-0.5 block text-xs text-slate-500">{opt.hint}</span> : null}
                          </div>
                          {active ? <Check className="size-4 shrink-0 text-slate-950" weight="bold" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {currentQ.type === 'multi_select_chips' && Array.isArray(currentQ.options) ? (
                  <div className="flex flex-wrap gap-2">
                    {currentQ.options.map((opt) => {
                      const list = Array.isArray(val) ? (val as string[]) : [];
                      const active = list.includes(opt.label);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleChip(currentQ.id, opt.label, currentQ.maxSelections || 4)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
                            active
                              ? 'border-slate-950 bg-slate-950 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                          }`}
                        >
                          {active ? <Check className="size-3.5" weight="bold" /> : null}
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {currentQ.type === 'short_text_input' ? (
                  <textarea
                    rows={3}
                    value={typeof val === 'string' ? val : ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))}
                    placeholder={currentQ.placeholder || 'Digite com suas palavras...'}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-slate-950 focus:outline-none"
                  />
                ) : null}

                {currentQ.type === 'anchor_sku_picker' ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {catalogProducts.slice(0, 6).map((prod) => {
                      const skuVal = String(prod.sku || prod.id);
                      const active = val === skuVal;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [currentQ.id]: skuVal }))}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs transition-all ${
                            active
                              ? 'border-slate-950 bg-slate-50 text-slate-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span className="truncate font-semibold">{prod.name}</span>
                          <span className="shrink-0 font-mono text-[11px] text-slate-500">
                            {formatCurrencyBRL(prod.priceCents)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {currentQ.type === 'metric_pair_input' && Array.isArray(currentQ.fields) ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {currentQ.fields.map((f) => {
                      const curObj = (val && typeof val === 'object' ? val : {}) as Record<string, string>;
                      return (
                        <label key={f.key} className="space-y-1.5 text-xs">
                          <span className="block font-semibold text-slate-700">{f.label}</span>
                          <input
                            type="text"
                            value={curObj[f.key] ?? f.default ?? ''}
                            onChange={(e) =>
                              setAnswers((prev) => ({
                                ...prev,
                                [currentQ.id]: { ...curObj, [f.key]: e.target.value },
                              }))
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-950 focus:outline-none"
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Footer 1 ação principal */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-[#F8FAFC] px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  if (safeIdx > 0) setStepIdx((s) => Math.max(0, s - 1));
                  else onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="size-3.5" weight="regular" />
                <span>{safeIdx > 0 ? 'Anterior' : 'Fechar'}</span>
              </button>

              {!isLastStep ? (
                <button
                  type="button"
                  data-testid="brief-next-btn"
                  onClick={() => setStepIdx((s) => Math.min(questions.length - 1, s + 1))}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-950 px-5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <span>Próxima</span>
                  <ArrowRight className="size-3.5" weight="regular" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  data-testid="brief-confirm-release-btn"
                  onClick={() => onConfirm(answers)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-slate-950 px-5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  <span>{submitting ? 'Gerando...' : confirmLabel}</span>
                </button>
              )}
            </div>
          </m.div>
        </div>
      </AnimatePresence>
    </LazyMotion>
  );
}
