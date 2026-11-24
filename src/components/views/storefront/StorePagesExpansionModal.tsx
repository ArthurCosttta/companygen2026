import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from '@phosphor-icons/react';
import type { BusinessProfile } from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';
import { useToast } from '@/components/ui';
import {
  buildRecommendedPagesForProfile,
  type RecommendedPageOption,
} from '../../../../shared/formula-ir/spreadsheet-intelligence.mjs';
import { DynamicBriefQuestionsModal, type BriefQuestionsJson } from './DynamicBriefQuestionsModal';

export interface ExpansionScreenTemplate {
  id: string;
  campaignTheme: 'natal' | 'black_friday' | 'consultorio' | 'evergreen';
  title: string;
  defaultSlug: string;
  description: string;
  baseCostCredits: number;
}

// Mantido apenas como fallback de compatibilidade; a UI prioriza buildRecommendedPagesForProfile()
export const EXPANSION_SCREEN_TEMPLATES: ExpansionScreenTemplate[] = [
  {
    id: 'tpl_destaque',
    campaignTheme: 'evergreen',
    title: 'Página Destaque com Detalhes na Foto',
    defaultSlug: 'destaque',
    description: 'Título grande centralizado, pontos explicativos sobre a foto e combo.',
    baseCostCredits: 3,
  },
];

/**
 * Modal Branco Minimalista para Criar Nova Tela (1 Ação / 1 Estado por Tela)
 * Sem jargões internos, sem ícones decorativos, preservando Saldo e recomendações personalizadas do negócio.
 */
export function StorePagesExpansionModal({
  open,
  profile,
  creditBalance,
  onClose,
  onPageCreated,
  onNeedCredits,
}: {
  open: boolean;
  profile: BusinessProfile;
  creditBalance: number | null;
  onClose: () => void;
  onPageCreated: (nextFormula: unknown, createdSlug: string) => void;
  onNeedCredits?: () => void;
}) {
  const { showToast } = useToast();
  const recommendationPacket = useMemo(
    () => buildRecommendedPagesForProfile(profile as unknown as Record<string, unknown>),
    [profile],
  );
  const recommendedList: RecommendedPageOption[] = recommendationPacket.pages;

  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [selectedPage, setSelectedPage] = useState<RecommendedPageOption>(recommendedList[0]);
  const [customTitle, setCustomTitle] = useState(recommendedList[0]?.title || 'Nova página');
  const [centerHero, setCenterHero] = useState(true);
  const [includeArtPack, setIncludeArtPack] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [questionsJson, setQuestionsJson] = useState<BriefQuestionsJson | null>(null);
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [lowBalanceMsg, setLowBalanceMsg] = useState('');

  useEffect(() => {
    if (open) {
      setStep('pick');
      setLowBalanceMsg('');
      const first = recommendedList[0];
      if (first) {
        setSelectedPage(first);
        setCustomTitle(first.title);
      }
      setCenterHero(recommendationPacket.recommendedAlignments?.defaultHeroAlignment === 'center' || true);
    }
  }, [open, recommendedList, recommendationPacket.recommendedAlignments?.defaultHeroAlignment]);

  if (!open) return null;

  const totalCost = includeArtPack ? 8 : selectedPage?.baseCostCredits || 3;

  const handleAnalyzeAndAsk = async () => {
    setLowBalanceMsg('');
    setAnalyzing(true);
    try {
      const res = await authenticatedFetch('/api/store-molde/analyze-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          campaignTheme: selectedPage.campaignTheme,
          pageGoal: selectedPage.slug,
          userPrompt: `${customTitle}: ${selectedPage.summary}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.questionsJson) {
          setQuestionsJson(data.questionsJson);
          setQuestionsModalOpen(true);
          return;
        }
      }
      await handleCreateWithAnswers({});
    } catch {
      await handleCreateWithAnswers({});
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateWithAnswers = async (briefAnswers: Record<string, unknown>) => {
    setCreating(true);
    setLowBalanceMsg('');
    try {
      const res = await authenticatedFetch('/api/store-molde/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim() || selectedPage.title,
          slug: selectedPage.slug,
          campaignTheme: selectedPage.campaignTheme,
          textAnchor: centerHero ? 'center' : 'left',
          typoScale: centerHero ? 'editorial_xxl' : 'refined_lg',
          includeArtPack,
          briefAnswers,
          questionsJson,
          prompt: `${customTitle}: ${selectedPage.summary}`,
          profile,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setQuestionsModalOpen(false);
        setLowBalanceMsg(
          String(
            data?.error ||
              `Saldo insuficiente (${creditBalance ?? 0} cr disponíveis, necessário ${totalCost} cr).`,
          ),
        );
        return;
      }
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.error || 'Não foi possível criar esta tela agora.'));
      }
      setQuestionsModalOpen(false);
      showToast({
        type: 'success',
        message: `Página "${customTitle}" pronta (-${data.debited ?? totalCost} cr).`,
      });
      onPageCreated(data.formulasIr, data.page?.slug || selectedPage.slug);
      onClose();
    } catch (err) {
      showToast({
        type: 'amber',
        message: err instanceof Error ? err.message : 'Erro ao criar página.',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          <div
            data-testid="store-pages-expansion-modal"
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4"
          >
            <m.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.18)]"
            >
              {/* Cabeçalho branco minimalista */}
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
                <div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {recommendationPacket.nicheLabel}
                  </span>
                  <h2 className="text-base font-bold text-slate-950">
                    {step === 'pick' ? 'Adicionar nova tela' : 'Ajustar página'}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  {creditBalance !== null ? (
                    <span
                      data-testid="modal-credit-balance-pill"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800"
                    >
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span>Saldo: {creditBalance} cr</span>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fechar"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="size-4" weight="regular" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {lowBalanceMsg ? (
                  <div
                    data-testid="expansion-402-banner"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950"
                  >
                    <span>{lowBalanceMsg}</span>
                    {onNeedCredits ? (
                      <button
                        type="button"
                        onClick={onNeedCredits}
                        className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Recarregar
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {step === 'pick' ? (
                  <div className="space-y-2.5">
                    {recommendedList.map((pageOpt) => {
                      const active = selectedPage?.id === pageOpt.id;
                      return (
                        <button
                          key={pageOpt.id}
                          type="button"
                          data-testid={`expansion-tpl-${pageOpt.id}`}
                          onClick={() => {
                            setSelectedPage(pageOpt);
                            setCustomTitle(pageOpt.title);
                          }}
                          className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition-all ${
                            active
                              ? 'border-slate-950 bg-slate-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <strong className="block text-sm font-semibold text-slate-950">
                              {pageOpt.title}
                            </strong>
                            <p className="text-xs leading-relaxed text-slate-500">{pageOpt.summary}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {pageOpt.baseCostCredits} cr
                            </span>
                            {active ? <Check className="size-4 text-slate-950" weight="bold" /> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Nome na barra de navegação da loja
                      </label>
                      <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-950 focus:outline-none"
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-xs">
                      <input
                        type="checkbox"
                        checked={centerHero}
                        onChange={(e) => setCenterHero(e.target.checked)}
                        className="mt-0.5 accent-slate-950"
                      />
                      <div>
                        <strong className="block font-semibold text-slate-950">
                          Texto centralizado com título grande
                        </strong>
                        <span className="text-slate-500">
                          Abertura simétrica limpa com destaque tipográfico maior no centro.
                        </span>
                      </div>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-xs">
                      <input
                        type="checkbox"
                        checked={includeArtPack}
                        onChange={(e) => setIncludeArtPack(e.target.checked)}
                        className="mt-0.5 accent-slate-950"
                      />
                      <div>
                        <strong className="block font-semibold text-slate-950">
                          Gerar ilustrações novas para esta tela (+{8 - (selectedPage?.baseCostCredits || 3)} cr)
                        </strong>
                        <span className="text-slate-500">
                          Mantém unidade visual com o estilo das fotos atuais da sua loja.
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Footer — 1 ação principal */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                {step === 'pick' ? (
                  <>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      data-testid="expansion-continue-btn"
                      onClick={() => setStep('configure')}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-950 px-5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <span>Continuar</span>
                      <ArrowRight className="size-3.5" weight="regular" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setStep('pick')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ArrowLeft className="size-3.5" weight="regular" />
                      <span>Voltar</span>
                    </button>
                    <button
                      type="button"
                      disabled={analyzing || creating}
                      data-testid="expansion-generate-btn"
                      onClick={() => void handleAnalyzeAndAsk()}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-slate-950 px-5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <span>
                        {analyzing
                          ? 'Preparando perguntas...'
                          : creating
                            ? 'Criando...'
                            : `Criar página · ${totalCost} cr`}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </m.div>
          </div>
        </AnimatePresence>
      </LazyMotion>

      <DynamicBriefQuestionsModal
        open={questionsModalOpen}
        questionsJson={questionsJson}
        catalogProducts={profile.catalog?.products || []}
        submitting={creating}
        confirmLabel={`Criar página · ${totalCost} cr`}
        onClose={() => setQuestionsModalOpen(false)}
        onConfirm={(ans) => void handleCreateWithAnswers(ans)}
      />
    </>
  );
}
