import * as React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, Check, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { ActionButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { FormulaV9Document } from '@/schemas/formula-v9.schema';
import {
  formatCurrencyBRL,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { updateBusinessProfile, type ProfileSnapshot } from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';

export type StoreMoldeJobStage =
  | 'reading_catalog'
  | 'designing_experience'
  | 'generating_images'
  | 'hydrating_blueprint'
  | 'publishing'
  | 'completed'
  | 'error';

export interface GenerateFullImageJobResult {
  slotId?: string;
  role?: string;
  assetUrl?: string;
  status?: string;
}

export interface GenerateFullStorefrontResponse {
  ok?: boolean;
  status?: number;
  error?: string;
  formulasIr?: FormulaV9Document;
  imageJobs?: GenerateFullImageJobResult[];
  writtenFiles?: string[];
  creditsCharged?: number;
  balanceAfter?: number;
  modelUsed?: string;
  generatedBy?: string;
}

export interface OnboardingSynthesisStageProps {
  ownerId: string;
  clientJobId: string;
  initialProfile: BusinessProfile;
  seedProducts: CatalogProduct[];
  nicheSearchQuery?: string;
  onCompleted: (snap: ProfileSnapshot, result: GenerateFullStorefrontResponse) => void;
  onBackToIgnition: () => void;
  onOpenCheckout: () => void;
}

const ORDERED_STAGES: Array<{ stage: Exclude<StoreMoldeJobStage, 'error'>; label: string }> = [
  { stage: 'reading_catalog', label: 'Lendo catálogo e dados da loja' },
  { stage: 'designing_experience', label: 'Desenhando identidade visual e experiência' },
  { stage: 'generating_images', label: 'Criando fotos e ativos da vitrine' },
  { stage: 'hydrating_blueprint', label: 'Montando seções atômicas de alta conversão' },
  { stage: 'publishing', label: 'Publicando página e vinculando canais' },
  { stage: 'completed', label: 'Página no ar' },
];

const STAGE_BASE_PROGRESS: Record<StoreMoldeJobStage, number> = {
  reading_catalog: 12,
  designing_experience: 34,
  generating_images: 58,
  hydrating_blueprint: 80,
  publishing: 92,
  completed: 100,
  error: 0,
};

interface StoredSynthesisOptions {
  layoutArchetype?: string;
  addons?: Record<string, boolean>;
  briefAnswers?: Record<string, unknown>;
  questionsJson?: unknown;
  estimatedCredits?: number;
  extraPages?: Array<{ slug: string; title: string; campaignTheme?: string; creditsCost?: number }>;
}

function readStoredSynthesisOptions(jobId: string): StoredSynthesisOptions | null {
  try {
    const raw = window.sessionStorage.getItem(`cg_ignition_opts_${jobId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSynthesisOptions;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function stageIndexOf(stage: StoreMoldeJobStage): number {
  const idx = ORDERED_STAGES.findIndex((s) => s.stage === stage);
  return idx >= 0 ? idx : 0;
}

export function OnboardingSynthesisStage({
  ownerId,
  clientJobId,
  initialProfile,
  seedProducts,
  nicheSearchQuery,
  onCompleted,
  onBackToIgnition,
  onOpenCheckout,
}: OnboardingSynthesisStageProps) {
  const [activeJobId, setActiveJobId] = React.useState(clientJobId);
  const [currentStage, setCurrentStage] = React.useState<StoreMoldeJobStage>('reading_catalog');
  const [progressPct, setProgressPct] = React.useState<number>(8);
  const [microSteps, setMicroSteps] = React.useState<Array<{ stage?: string; text: string; at?: string }>>([]);
  const [errorState, setErrorState] = React.useState<{
    kind: 'credits' | 'error';
    status?: number;
    message: string;
  } | null>(null);
  const [displayProducts, setDisplayProducts] = React.useState<CatalogProduct[]>(() =>
    seedProducts.slice(0, 6),
  );

  const startedJobRef = React.useRef<string>('');
  const completedRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    setActiveJobId(clientJobId);
    completedRef.current = false;
    setErrorState(null);
    setCurrentStage('reading_catalog');
    setProgressPct(8);
  }, [clientJobId]);

  React.useEffect(() => {
    if (errorState) return;
    if (currentStage === 'completed') {
      setProgressPct(100);
      return;
    }
    const base = STAGE_BASE_PROGRESS[currentStage] ?? 12;
    setProgressPct((prev) => Math.max(prev, base));
    const ceiling = Math.min(96, base + 14);
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setProgressPct((prev) => (prev < ceiling ? prev + 1 : prev));
    }, 350);
    return () => window.clearInterval(timer);
  }, [currentStage, errorState]);

  React.useEffect(() => {
    if (!activeJobId || startedJobRef.current === activeJobId || completedRef.current) return;
    startedJobRef.current = activeJobId;

    let cancelled = false;
    const synthesisOpts = readStoredSynthesisOptions(activeJobId);

    const pollJob = async () => {
      try {
        const res = await authenticatedFetch(
          `/api/store-molde/job/${encodeURIComponent(activeJobId)}`,
          { method: 'GET' },
          ownerId,
        );
        if (!res.ok || cancelled) return;
        const raw = (await res.json().catch(() => null)) as
          | {
              job?: {
                stage?: StoreMoldeJobStage;
                progressPct?: number;
                microSteps?: Array<{ stage?: string; text: string; at?: string }>;
              };
              stage?: StoreMoldeJobStage;
              progressPct?: number;
              microSteps?: Array<{ stage?: string; text: string; at?: string }>;
            }
          | null;
        const jobData = raw && typeof raw === 'object' && raw.job ? raw.job : raw;
        if (jobData?.stage && !cancelled) {
          setCurrentStage((prev) => {
            if (jobData.stage === 'error') return 'error';
            return stageIndexOf(jobData.stage!) >= stageIndexOf(prev) ? jobData.stage! : prev;
          });
        }
        if (typeof jobData?.progressPct === 'number' && !cancelled) {
          const clamped = Math.max(0, Math.min(100, Math.round(jobData.progressPct)));
          setProgressPct((prev) => Math.max(prev, clamped));
        }
        if (Array.isArray(jobData?.microSteps) && !cancelled) {
          setMicroSteps(jobData.microSteps);
        }
      } catch {
        // Polling silencioso; resultado final é garantido pela requisição principal
      }
    };

    const pollTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void pollJob();
    }, 900);

    const run = async () => {
      // Sem busca automática de imagens na web ao criar a loja — preserva fotos reais do lojista
      const fetchedByProductId = new Map<string, string>();
      const fetchedPhotos: string[] = [];

      try {
        const res = await authenticatedFetch(
          '/api/store-molde/generate-full',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile: initialProfile,
              useGlm: true,
              generateImages: Boolean(synthesisOpts?.addons?.aiPhotoPack),
              includeArtPack: Boolean(synthesisOpts?.addons?.aiPhotoPack),
              maxImages: synthesisOpts?.addons?.aiPhotoPack ? 5 : 0,
              clientJobId: activeJobId,
              ...(synthesisOpts?.layoutArchetype
                ? { layoutArchetype: synthesisOpts.layoutArchetype }
                : {}),
              ...(synthesisOpts?.addons ? { addons: synthesisOpts.addons } : {}),
              ...(synthesisOpts?.briefAnswers &&
              Object.keys(synthesisOpts.briefAnswers).length > 0
                ? { briefAnswers: synthesisOpts.briefAnswers }
                : {}),
              ...(synthesisOpts?.questionsJson
                ? { questionsJson: synthesisOpts.questionsJson }
                : {}),
            }),
          },
          ownerId,
        );

        const data = (await res.json().catch(() => null)) as GenerateFullStorefrontResponse | null;
        if (cancelled) return;

        window.clearInterval(pollTimer);

        if (res.status === 402 || data?.status === 402) {
          setCurrentStage('error');
          setErrorState({
            kind: 'credits',
            status: 402,
            message:
              data?.error ||
              'Créditos insuficientes para gerar sua vitrine completa com IA.',
          });
          return;
        }

        const sections = data?.formulasIr?.sections;
        if (!res.ok || !data?.ok || !data?.formulasIr || !Array.isArray(sections) || sections.length < 4) {
          setCurrentStage('error');
          setErrorState({
            kind: 'error',
            status: res.status,
            message:
              data?.error ||
              'Não foi possível concluir a geração completa da sua página. Seus dados continuam salvos.',
          });
          return;
        }

        const heroJob = (data.imageJobs || []).find((j) => j.role === 'hero' && j.assetUrl);
        const editorialJob = (data.imageJobs || []).find(
          (j) => j.role === 'lifestyle_banner' && j.assetUrl,
        );
        const logoJob = (data.imageJobs || []).find((j) => j.role === 'brand_logo' && j.assetUrl);

        // Pool combinado de imagens reais: fotos encontradas + artes geradas por categoria/secao
        const generatedSlotAssets = (data.imageJobs || [])
          .filter((j) => j.assetUrl && j.role !== 'brand_logo')
          .map((j) => String(j.assetUrl));
        const mediaPool = Array.from(new Set([...fetchedPhotos, ...generatedSlotAssets])).filter(Boolean);

        const resolveFallbackProductPhoto = (prod: CatalogProduct, idx: number): string => {
          if (prod.imageUrl) return prod.imageUrl;
          const directFetched = fetchedByProductId.get(prod.id);
          if (directFetched) return directFetched;
          const catLower = String(prod.category || '').toLowerCase();
          const catJob = (data.imageJobs || []).find((j) => {
            const targetSec = String(
              (j as { targetSectionId?: string }).targetSectionId || '',
            ).toLowerCase();
            return Boolean(j.assetUrl && catLower && targetSec.includes(catLower));
          });
          if (catJob?.assetUrl) return String(catJob.assetUrl);
          if (mediaPool.length > 0) return mediaPool[idx % mediaPool.length];
          return '';
        };

        const enrichedCatalogProducts = seedProducts.map((item, idx) => ({
          ...item,
          imageUrl: resolveFallbackProductPhoto(item, idx),
          approvedAsset: true,
          active: true,
        }));

        let finalFormulasIr = data.formulasIr;
        const requestedExtraPages = Array.isArray(synthesisOpts?.extraPages)
          ? synthesisOpts.extraPages.filter((p) => p && p.slug && p.title)
          : [];
        if (requestedExtraPages.length > 0) {
          setMicroSteps((prev) => [
            ...prev,
            { text: `Gerando ${requestedExtraPages.length} tela(s) extra(s) em paralelo...`, at: new Date().toISOString() },
          ]);
          const packRes = await authenticatedFetch(
            '/api/store-molde/ensure-pack',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pages: requestedExtraPages,
                useGlm: true,
                briefAnswers: synthesisOpts?.briefAnswers || {},
              }),
            },
            ownerId,
          ).catch(() => null);
          const packData = packRes && packRes.ok
            ? ((await packRes.json().catch(() => null)) as { formulasIr?: FormulaV9Document } | null)
            : null;
          if (packData?.formulasIr && Array.isArray(packData.formulasIr.pages)) {
            finalFormulasIr = packData.formulasIr;
          }
        }

        setDisplayProducts(enrichedCatalogProducts.slice(0, 6));

        const publishedSnap = await updateBusinessProfile(
          (draft) => {
            draft.onboarding = {
              ...draft.onboarding,
              fichaCompleted: true,
              storeGenerated: true,
            };
            draft.publishedStore = {
              ...draft.publishedStore,
              published: true,
              publishedAt: new Date().toISOString(),
            };
            draft.storeLayout = {
              ...draft.storeLayout,
              formulasIr: finalFormulasIr,
              updatedAt: new Date().toISOString(),
            };
            draft.brand = {
              ...draft.brand,
              ...(heroJob?.assetUrl ? { heroImageUrl: heroJob.assetUrl } : {}),
              ...(editorialJob?.assetUrl ? { heroBackgroundUrl: editorialJob.assetUrl } : {}),
              ...(logoJob?.assetUrl && !draft.brand?.logoUrl ? { logoUrl: logoJob.assetUrl } : {}),
            };
            if (Array.isArray(draft.catalog?.products) && draft.catalog.products.length > 0) {
              draft.catalog.products = draft.catalog.products.map((prod, idx) => ({
                ...prod,
                imageUrl: resolveFallbackProductPhoto(prod, idx),
                approvedAsset: true,
                active: prod.active !== false,
              }));
            }
          },
          { publish: true },
          ownerId,
        );

        if (cancelled) return;
        completedRef.current = true;
        setProgressPct(100);
        setCurrentStage('completed');
        try {
          window.sessionStorage.removeItem(`cg_ignition_opts_${activeJobId}`);
        } catch {}

        window.setTimeout(() => {
          if (!cancelled) {
            onCompleted(publishedSnap, data);
          }
        }, 300);
      } catch (err) {
        window.clearInterval(pollTimer);
        if (cancelled) return;
        setCurrentStage('error');
        setErrorState({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Falha de conexão ao gerar sua loja. Tente novamente sem perder seus dados.',
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
    };
  }, [activeJobId, initialProfile, nicheSearchQuery, onCompleted, ownerId, seedProducts]);

  const handleRetry = () => {
    const nextJob = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const prevOpts = window.sessionStorage.getItem(`cg_ignition_opts_${activeJobId}`);
      if (prevOpts) {
        window.sessionStorage.setItem(`cg_ignition_opts_${nextJob}`, prevOpts);
      }
    } catch {}
    completedRef.current = false;
    setErrorState(null);
    setCurrentStage('reading_catalog');
    setProgressPct(8);
    setActiveJobId(nextJob);
  };

  const activeIdx = stageIndexOf(currentStage);

  return (
    <div
      data-testid="synthesis-stage"
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#F8FAFC] px-6 py-12 text-[#09090B]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.05) 0%, transparent 55%)',
      }}
    >
      <div className="w-full max-w-[680px]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.08)] sm:p-8"
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#2563EB]">
                Preparando vitrine de produção
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-[#09090B]">
                {initialProfile.business?.name || 'Minha Loja'}
              </h1>
            </div>
            {errorState ? (
              <AlertCircle className="size-5 shrink-0 text-[#EF4444]" aria-hidden="true" />
            ) : currentStage === 'completed' ? (
              <Check className="size-5 shrink-0 text-[#09090B]" aria-hidden="true" />
            ) : (
              <Loader2 className="size-5 shrink-0 animate-spin text-[#09090B]" aria-hidden="true" />
            )}
          </div>

          {/* Barra de Progresso Numérica (0% -> 100%) */}
          <div className="mb-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[#475569]">Progresso da construção</span>
              <span
                data-testid="synthesis-progress-pct"
                className="font-mono tabular-nums text-[#09090B]"
              >
                {progressPct}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              data-testid="synthesis-progress-bar"
              className="h-2.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]"
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  errorState
                    ? 'bg-[#EF4444]'
                    : currentStage === 'completed'
                      ? 'bg-[#10B981]'
                      : 'bg-[#2563EB]',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* 6 Estágios Reais do Servidor (STORE_MOLDE_JOBS) */}
          <div className="space-y-2.5">
            {ORDERED_STAGES.map((step, idx) => {
              const isDone = currentStage === 'completed' || (!errorState && idx < activeIdx);
              const isCurrent = !errorState && currentStage !== 'completed' && idx === activeIdx;
              return (
                <div
                  key={step.stage}
                  data-testid={`synthesis-stage-${step.stage}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] transition-colors',
                    isCurrent
                      ? 'bg-[#EFF6FF] font-semibold text-[#09090B]'
                      : isDone
                        ? 'text-[#09090B]'
                        : 'text-[#94A3B8]',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]',
                      isDone
                        ? 'bg-[#10B981] text-white'
                        : isCurrent
                          ? 'bg-[#2563EB] text-white'
                          : 'border border-[#CBD5E1] bg-white text-[#94A3B8]',
                    )}
                  >
                    {isDone ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* Banner de Erro Transparente (HTTP 402 ou Erro de API: Nunca Mock Falso) */}
          {errorState ? (
            <div
              role="alert"
              data-testid="synthesis-error-banner"
              className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 p-4"
            >
              <p className="text-[14px] font-semibold text-red-900">{errorState.message}</p>
              <p className="mt-1 text-[12px] text-red-700">
                Nenhuma página fictícia foi publicada. Você pode tentar novamente ou ajustar seus dados.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {errorState.kind === 'credits' ? (
                  <ActionButton
                    variant="primary"
                    size={44}
                    data-testid="synthesis-recharge-btn"
                    leftIcon={<CreditCard className="size-4" />}
                    onClick={onOpenCheckout}
                  >
                    Recarregar Créditos
                  </ActionButton>
                ) : (
                  <ActionButton
                    variant="primary"
                    size={44}
                    data-testid="synthesis-retry-btn"
                    leftIcon={<RefreshCw className="size-4" />}
                    onClick={handleRetry}
                  >
                    Tentar Novamente
                  </ActionButton>
                )}
                <ActionButton
                  variant="secondary"
                  size={44}
                  data-testid="synthesis-back-btn"
                  leftIcon={<ArrowLeft className="size-4" />}
                  onClick={onBackToIgnition}
                >
                  Voltar aos dados
                </ActionButton>
              </div>
            </div>
          ) : null}

          {/* Feed Ao Vivo do Construtor (Micro-respostas em tempo real + Ativos) */}
          {!errorState && microSteps.length > 0 ? (
            <div
              data-testid="synthesis-micro-feed"
              className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
            >
              <p className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Construtor ao vivo ({microSteps.length} entregas)
              </p>
              <div className="max-h-28 space-y-1.5 overflow-y-auto text-xs text-slate-700">
                {microSteps.map((ms, idx) => (
                  <div key={`${ms.text}-${idx}`} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{ms.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Mini-cards dos Produtos Reais em Fila */}
          {!errorState && displayProducts.length > 0 ? (
            <div className="mt-6 border-t border-[#F1F5F9] pt-5">
              <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                Produtos sendo preparados ({displayProducts.length})
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {displayProducts.map((prod, idx) => (
                  <motion.div
                    key={prod.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.08 }}
                    className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-[#09090B]">
                        {prod.name}
                      </p>
                      <p className="truncate text-[11px] text-[#64748B]">{prod.category}</p>
                    </div>
                    <p className="mt-2 font-mono text-[12px] font-bold tabular-nums text-[#09090B]">
                      {formatCurrencyBRL(prod.priceCents)}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
