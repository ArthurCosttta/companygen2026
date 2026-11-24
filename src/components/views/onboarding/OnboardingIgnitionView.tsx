import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';
import { readImageFileAsDataUrl } from '@/components/views/storefront';
import type { BriefQuestionsJson, BriefQuestionItem } from '@/components/views/storefront/DynamicBriefQuestionsModal';
import { cn } from '@/lib/utils';
import { extractBrandPalette } from '@/utils/logoColorExtractor';
import {
  clearStoredDraft,
  readStoredDraft,
  useDraftAutoSave,
} from '@/hooks/useDraftAutoSave';
import {
  PreBuildPagesCartStep,
  type PreBuildRecommendedPage,
} from './PreBuildPagesCartStep';
import {
  isValidProductionPhone,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import {
  analyzeInstagramProfile,
  parseSpreadsheetReactive,
  type ReactiveSpreadsheetParseResult,
} from '@/services/profile-service';
import { formatBrazilPhoneDisplay } from './onboarding-helpers';
import { classifyBusinessArchetype } from '../../../../shared/formula-ir/spreadsheet-intelligence.mjs';
import { recordTelemetryBreadcrumb, updateTelemetryAppContext } from '@/utils/crash-telemetry';
import {
  buildCatalogProductsFromNiche,
  buildDefaultSeedProductsForStore,
  detectPixKeyType,
  extractInstagramHandle,
  IGNITION_NICHE_PRESETS,
  normalizeBrazilWhatsAppE164,
  type IgnitionNichePreset,
  type PixKeyType,
} from './onboarding-niche-presets';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Celular',
  random: 'Aleatória',
};

export type LayoutArchetypeId =
  | 'editorial_gigante'
  | 'lookbook_boutique'
  | 'clinica_agenda'
  | 'oferta_direta';

export interface IgnitionAddonsSelection {
  webCatalogPhotos: boolean;
  aiPhotoPack: boolean;
  dailySchedule: boolean;
  interactiveSimulator: boolean;
  whatsappFlows: boolean;
}

export interface IgnitionExtraPageItem {
  slug: string;
  title: string;
  description?: string;
  campaignTheme?: string;
  creditsCost: number;
}

export interface IgnitionSubmissionPayload {
  clientJobId: string;
  businessName: string;
  segment: string;
  description: string;
  address?: string;
  goalText?: string;
  storefrontPhotoUrl?: string;
  instagramHandle?: string;
  selectedNicheId?: IgnitionNichePreset['id'];
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  whatsappDigits: string;
  whatsappDisplay: string;
  pixKey: string;
  pixKeyType?: PixKeyType | null;
  importedProducts: CatalogProduct[];
  sourceType: 'xlsx' | 'csv' | 'pdf' | 'images' | 'niche' | 'manual';
  nicheSearchQuery?: string;
  layoutArchetype?: LayoutArchetypeId;
  addons?: IgnitionAddonsSelection;
  extraPages?: IgnitionExtraPageItem[];
  briefAnswers?: Record<string, unknown>;
  questionsJson?: BriefQuestionsJson | null;
  estimatedCredits?: number;
  marketingConcept?: {
    brandVoice: 'editorial_minimal' | 'warm_artisan' | 'bold_modern' | 'consultive_prestige';
    coreProductSku: string;
    buyerPersona: string;
    mainObjection: string;
    buyingTrigger: string;
    growthGoal: 'raise_ticket' | 'fast_pix_turnover' | 'lead_booking';
    heroLayout: 'hero_stage' | 'hero_centered' | 'hero_split';
    showcaseLayout: 'bento_spotlight' | 'coupled_media_grid' | 'sticky_lookbook';
    gridDensity: '2' | '3' | '4';
  };
}

export interface OnboardingIgnitionViewProps {
  profile: BusinessProfile;
  ownerId: string;
  userEmail?: string;
  creditBalance?: number;
  initialValues?: Partial<IgnitionSubmissionPayload> | null;
  onStartSynthesis: (payload: IgnitionSubmissionPayload) => Promise<void> | void;
  onLogout?: () => void;
  onOpenLogin?: () => void;
  onCancelToStore?: () => void;
}

interface ImportedCatalogState {
  label: string;
  sourceType: 'xlsx' | 'csv' | 'pdf' | 'images';
  products: CatalogProduct[];
}

const QUESTION_LOADING_MESSAGES = [
  'Lendo sua planilha e produtos reais...',
  'Identificando categorias, preços e diferenciais da loja...',
  'Preparando recomendações de telas e seções exclusivas...',
  'Organizando suas 5 perguntas personalizadas...',
  'Quase pronto! Finalizando diagnóstico inicial da sua vitrine...',
];

const DEFAULT_PLANNED_SECTIONS = [
  { id: 'hero', title: 'Capa de Destaque da Loja', role: 'Apresenta sua proposta e botão de ação' },
  { id: 'diffs', title: 'Diferenciais & Garantias', role: 'Reforça confiança e atendimento no WhatsApp' },
  { id: 'categories', title: 'Portais de Categorias', role: 'Organiza seus produtos ou serviços por linha' },
  { id: 'catalog', title: 'Catálogo com Sacola Direta', role: 'Permite escolher itens e finalizar no Pix' },
  { id: 'faq', title: 'Dúvidas Frequentes', role: 'Responde prazos, entregas e trocas na hora' },
];

const DEFAULT_CART_EXTRA_PAGES: PreBuildRecommendedPage[] = [
  {
    slug: 'ofertas-kits',
    title: 'Combos & Ofertas Especiais',
    description: 'Página focada em kits promocionais e ticket médio maior.',
    campaignTheme: 'evergreen',
    creditsCost: 3,
    selected: false,
  },
  {
    slug: 'sobre-atendimento',
    title: 'Sobre a Loja & Localização',
    description: 'História da marca, horários Seg a Dom, endereço e canais diretos.',
    campaignTheme: 'consultorio',
    creditsCost: 3,
    selected: false,
  },
];

export function OnboardingIgnitionView({
  profile,
  ownerId,
  userEmail,
  creditBalance,
  initialValues,
  onStartSynthesis,
  onLogout,
  onOpenLogin,
  onCancelToStore,
}: OnboardingIgnitionViewProps) {
  const { showToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const storefrontPhotoInputRef = React.useRef<HTMLInputElement>(null);

  const draftStorageKey = React.useMemo(
    () => `cg_ignition_wizard_draft_${ownerId || 'anon'}`,
    [ownerId],
  );
  const savedDraft = React.useMemo(
    () =>
      readStoredDraft<{
        storeInput?: string;
        businessDescription?: string;
        goalText?: string;
        storeAddress?: string;
        phoneInput?: string;
        pixKey?: string;
        segmentDetected?: string;
        step?: 1 | 2 | 3 | 4 | 5;
      }>(draftStorageKey),
    [draftStorageKey],
  );
  const [hasDraftNotice, setHasDraftNotice] = React.useState<boolean>(() =>
    Boolean(savedDraft?.storeInput || savedDraft?.businessDescription),
  );

  // 1 (Loja & Planilha) -> 2 (Produtos & Objetivo) -> 3 (Endereço, Fachada, WhatsApp & Pix) -> 4 (5 Perguntas) -> 5 (Pré-Carrinho de Telas)
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [loadingProgressPct, setLoadingProgressPct] = React.useState(8);
  const [loadingMessageIdx, setLoadingMessageIdx] = React.useState(0);
  const [briefCustomTextNotes, setBriefCustomTextNotes] = React.useState<Record<string, string>>({});
  const [understandingSummary, setUnderstandingSummary] = React.useState<Record<string, unknown> | null>(null);
  const [cartPages, setCartPages] = React.useState<PreBuildRecommendedPage[]>(DEFAULT_CART_EXTRA_PAGES);
  const [includeAiArtPack, setIncludeAiArtPack] = React.useState(false);

  const [storeInput, setStoreInput] = React.useState<string>(() => {
    if (initialValues?.businessName) return initialValues.businessName;
    if (initialValues?.instagramHandle) return initialValues.instagramHandle;
    if (savedDraft?.storeInput) return savedDraft.storeInput;
    return profile.business?.name?.trim() || profile.brand?.instagram?.trim() || '';
  });
  const [businessDescription, setBusinessDescription] = React.useState<string>(
    () => initialValues?.description || savedDraft?.businessDescription || profile.business?.description?.trim() || '',
  );
  const [goalText, setGoalText] = React.useState<string>(
    () => initialValues?.goalText || savedDraft?.goalText || profile.business?.experienceGoal?.trim() || '',
  );
  const [storeAddress, setStoreAddress] = React.useState<string>(
    () => initialValues?.address || savedDraft?.storeAddress || profile.business?.address?.trim() || '',
  );
  const [storefrontPhotoUrl, setStorefrontPhotoUrl] = React.useState<string>(
    () => initialValues?.storefrontPhotoUrl || profile.brand?.storefrontPhotoUrl || '',
  );
  const [brandColors, setBrandColors] = React.useState<{
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
  }>(() => ({
    primaryColor: initialValues?.primaryColor || profile.brand?.primaryColor,
    accentColor: initialValues?.accentColor || profile.brand?.accentColor,
    logoUrl: initialValues?.logoUrl || profile.brand?.logoUrl,
  }));
  const [instagramConnectedHandle, setInstagramConnectedHandle] = React.useState<string>(
    () => initialValues?.instagramHandle || profile.brand?.instagram || '',
  );
  const [selectedNicheId, setSelectedNicheId] = React.useState<IgnitionNichePreset['id'] | undefined>(
    initialValues?.selectedNicheId,
  );
  const [importedCatalog, setImportedCatalog] = React.useState<ImportedCatalogState | null>(() => {
    if (
      initialValues?.importedProducts?.length &&
      initialValues.sourceType &&
      initialValues.sourceType !== 'niche' &&
      initialValues.sourceType !== 'manual'
    ) {
      return {
        label: `${initialValues.importedProducts.length} produtos carregados`,
        sourceType: initialValues.sourceType,
        products: initialValues.importedProducts,
      };
    }
    if (profile.catalog?.products?.length) {
      return {
        label: `${profile.catalog.products.length} produtos do catálogo atual`,
        sourceType: 'xlsx',
        products: profile.catalog.products,
      };
    }
    return null;
  });

  const [phoneInput, setPhoneInput] = React.useState<string>(() => {
    const raw =
      initialValues?.whatsappDigits ||
      savedDraft?.phoneInput ||
      profile.whatsapp?.displayPhone ||
      profile.whatsapp?.phoneE164 ||
      '';
    return raw ? formatBrazilPhoneDisplay(raw) : '';
  });
  const [pixKey, setPixKey] = React.useState<string>(
    () => initialValues?.pixKey ?? savedDraft?.pixKey ?? profile.payment?.pixKey ?? '',
  );

  const [parsingFile, setParsingFile] = React.useState(false);
  const [analyzingInstagram, setAnalyzingInstagram] = React.useState(false);
  const [assistingAi, setAssistingAi] = React.useState(false);
  const [loadingQuestions, setLoadingQuestions] = React.useState(false);
  const [questionsError, setQuestionsError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [whatsappError, setWhatsappError] = React.useState('');
  const [spreadsheetAlert, setSpreadsheetAlert] = React.useState<{
    type: 'error' | 'info';
    title: string;
    detail: string;
  } | null>(null);

  const [briefQuestionsJson, setBriefQuestionsJson] = React.useState<BriefQuestionsJson | null>(null);
  const [briefAnswers, setBriefAnswers] = React.useState<Record<string, string | string[]>>({});
  const [segmentDetected, setSegmentDetected] = React.useState<string>(
    () => profile.business?.segment || '',
  );

  const selectedPreset = React.useMemo(
    () => IGNITION_NICHE_PRESETS.find((p) => p.id === selectedNicheId),
    [selectedNicheId],
  );
  const detectedHandle = React.useMemo(() => extractInstagramHandle(storeInput), [storeInput]);
  const phoneE164 = React.useMemo(() => normalizeBrazilWhatsAppE164(phoneInput), [phoneInput]);
  const phoneIsValid = React.useMemo(() => isValidProductionPhone(phoneE164), [phoneE164]);
  const pixKeyType = React.useMemo(() => detectPixKeyType(pixKey), [pixKey]);

  // Auto-save leve em localStorage para evitar perda de rascunho durante onboarding
  useDraftAutoSave(
    draftStorageKey,
    {
      storeInput,
      businessDescription,
      goalText,
      storeAddress,
      phoneInput,
      pixKey,
      segmentDetected,
    },
    Boolean(storeInput.trim() || businessDescription.trim() || phoneInput.trim()),
  );

  // Barra de carregamento assintotica até 80% + mensagens rotativas enquanto analisa o catálogo
  React.useEffect(() => {
    updateTelemetryAppContext({ onboardingStep: `step_${step}`, segment: segmentDetected || selectedPreset?.segment || '' });
    recordTelemetryBreadcrumb('navigation', `Onboarding Passo ${step}`);
  }, [selectedPreset?.segment, segmentDetected, step]);

  React.useEffect(() => {
    if (!loadingQuestions) {
      setLoadingProgressPct(8);
      setLoadingMessageIdx(0);
      return;
    }
    setLoadingProgressPct(12);
    const barTimer = window.setInterval(() => {
      setLoadingProgressPct((prev) => {
        if (prev >= 80) return 80;
        const stepJump = prev < 45 ? 6 : prev < 68 ? 3 : 1;
        return Math.min(80, prev + stepJump);
      });
    }, 550);
    const msgTimer = window.setInterval(() => {
      setLoadingMessageIdx((i) => (i + 1) % QUESTION_LOADING_MESSAGES.length);
    }, 1850);
    return () => {
      window.clearInterval(barTimer);
      window.clearInterval(msgTimer);
    };
  }, [loadingQuestions]);

  // Suporte à IA Global preenchendo o onboarding ao vivo via evento customizado
  React.useEffect(() => {
    const onAiFill = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail || {};
      if (typeof detail.businessName === 'string' && detail.businessName.trim()) {
        setStoreInput(detail.businessName.trim());
      }
      if (typeof detail.description === 'string' && detail.description.trim()) {
        setBusinessDescription(detail.description.trim());
      }
      if (typeof detail.goalText === 'string' && detail.goalText.trim()) {
        setGoalText(detail.goalText.trim());
      }
      if (typeof detail.address === 'string' && detail.address.trim()) {
        setStoreAddress(detail.address.trim());
      }
      if (typeof detail.whatsapp === 'string' && detail.whatsapp.trim()) {
        setPhoneInput(formatBrazilPhoneDisplay(detail.whatsapp));
      }
      if (typeof detail.pixKey === 'string') {
        setPixKey(detail.pixKey.trim());
      }
      if (Array.isArray(detail.products) && detail.products.length > 0) {
        setImportedCatalog({
          label: `${detail.products.length} itens adicionados pela IA`,
          sourceType: 'xlsx',
          products: detail.products as CatalogProduct[],
        });
      }
    };
    window.addEventListener('companygen:onboarding-fill', onAiFill);
    return () => window.removeEventListener('companygen:onboarding-fill', onAiFill);
  }, []);

  const handlePasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard?.readText()) || '';
      const trimmed = text.trim();
      if (!trimmed) {
        showToast({ type: 'amber', message: 'Sua área de transferência está vazia.' });
        return;
      }
      setStoreInput(trimmed);
    } catch {
      showToast({ type: 'amber', message: 'Permita acesso à área de transferência ou cole direto.' });
    }
  };

  const handleAnalyzeInstagram = async () => {
    const handle = extractInstagramHandle(storeInput);
    if (!handle || analyzingInstagram) return;
    setAnalyzingInstagram(true);
    try {
      const res = await analyzeInstagramProfile(handle);
      setInstagramConnectedHandle(handle);
      if (res?.fullName && !storeInput.startsWith('@')) {
        setStoreInput(res.fullName);
      }
      if (res?.bio && !businessDescription.trim()) {
        setBusinessDescription(res.bio);
      }
      showToast({ type: 'success', message: `Perfil @${handle} conectado ao onboarding.` });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível consultar esse @ do Instagram agora.',
      });
    } finally {
      setAnalyzingInstagram(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      showToast({ type: 'error', message: `O arquivo "${oversized.name}" ultrapassa 25MB.` });
      return;
    }

    setParsingFile(true);
    setSpreadsheetAlert(null);
    try {
      const first = files[0];
      const ext = first.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'txt') {
        const guessedStore =
          storeInput.trim() ||
          first.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        let apiProducts: CatalogProduct[] | null = null;
        let apiImageCount = 0;
        let apiDetectedSegment = '';
        let apiModelUsed = '';
        try {
          const isText = ext === 'csv' || ext === 'txt';
          let payloadBody: Record<string, unknown> = {
            filename: first.name,
            storeName: guessedStore,
            businessModel: profile.business?.businessModel || 'produtos',
          };
          if (isText) {
            payloadBody.rawText = await first.text();
          } else {
            const ab = await first.arrayBuffer();
            const bytes = new Uint8Array(ab);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 8192) {
              bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            payloadBody.base64Content = btoa(bin);
          }
          const aiRes = await authenticatedFetch('/api/ai/spreadsheet/transform-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadBody),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json().catch(() => null);
            if (aiData?.ok && Array.isArray(aiData.products) && aiData.products.length > 0) {
              apiProducts = aiData.products;
              apiImageCount =
                Number(aiData.imageStats?.embeddedImagesCount || 0) +
                Number(aiData.imageStats?.publicImageUrlsCount || 0);
              apiDetectedSegment = String(aiData.detectedSegment || '');
              apiModelUsed = String(aiData.modelUsed || '');
            }
          }
        } catch {
          // Fallback local transparente caso endpoint esteja indisponível
        }

        let normalized: CatalogProduct[] = [];
        let photoCount = apiImageCount;
        if (apiProducts && apiProducts.length > 0) {
          normalized = apiProducts.map((p) => ({
            ...p,
            active: true,
            approvedAsset: true,
          }));
        } else {
          const res: ReactiveSpreadsheetParseResult = await parseSpreadsheetReactive(first);
          if (!res.ok) {
            setSpreadsheetAlert({
              type: 'error',
              title: 'Planilha não reconhecida como catálogo',
              detail: res.error || 'Suba uma planilha com coluna de Nome e Preço dos itens.',
            });
            return;
          }
          normalized = res.products.map((p) => ({
            ...p,
            active: true,
            approvedAsset: true,
          }));
          photoCount = res.imageStats.embeddedImagesCount + res.imageStats.publicImageUrlsCount;
        }

        const nicheMeta = classifyBusinessArchetype({
          segment: apiDetectedSegment || '',
          storeName: guessedStore,
          products: normalized,
        });
        const detectedLabel =
          nicheMeta.archetype !== 'varejo_geral'
            ? nicheMeta.nicheLabel
            : apiDetectedSegment || nicheMeta.nicheLabel;
        if (detectedLabel) {
          setSegmentDetected(detectedLabel);
          setSelectedNicheId(undefined);
        }

        const topCats = Array.from(
          new Set(normalized.map((p) => String(p.category || '').trim()).filter((c) => c && c.toLowerCase() !== 'geral')),
        ).slice(0, 3);
        const topNames = normalized.slice(0, 2).map((p) => p.name).filter(Boolean);
        const prevProfileDesc = String(profile.business?.description || '').trim();
        if (!businessDescription.trim() || businessDescription.trim() === prevProfileDesc) {
          const storeTitle = guessedStore || storeInput.trim() || 'Nossa loja';
          const catsPart = topCats.length > 0 ? topCats.join(', ') : detectedLabel || 'nosso catálogo';
          const itemsPart = topNames.length > 0 ? ` com destaques como ${topNames.join(' e ')}` : '';
          setBusinessDescription(
            `${storeTitle} (${detectedLabel || 'Comércio Local'}): ${catsPart}${itemsPart}, com pedido organizado direto pelo WhatsApp.`,
          );
        }

        setImportedCatalog({
          label: `${first.name} · ${normalized.length} ${normalized.length === 1 ? 'item' : 'itens'}`,
          sourceType: ext === 'csv' || ext === 'txt' ? 'csv' : 'xlsx',
          products: normalized,
        });
        setSpreadsheetAlert({
          type: 'info',
          title: `${normalized.length} itens importados${detectedLabel ? ` · ${detectedLabel}` : ''} (${photoCount} fotos na planilha)`,
          detail:
            apiModelUsed === 'ai-semantic-mapper'
              ? 'Colunas e categorias interpretadas pela inteligência semântica e convertidas para o formato do catálogo.'
              : photoCount > 0
                ? 'As fotos encontradas na planilha foram vinculadas. Itens sem foto exibirão ícones limpos da categoria.'
                : 'Itens sem foto exibirão ícones limpos da categoria na vitrine (você pode subir fotos reais em Minha Loja depois).',
        });
        if (!storeInput.trim() && guessedStore.length >= 2) {
          setStoreInput(guessedStore);
        }
        return;
      }

      if (files.every((f) => f.type.startsWith('image/'))) {
        const subset = files.slice(0, 10);
        const now = new Date().toISOString();
        const products: CatalogProduct[] = [];
        for (let i = 0; i < subset.length; i += 1) {
          const imgFile = subset[i];
          const dataUrl = await readImageFileAsDataUrl(imgFile);
          const title = imgFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || `Produto ${i + 1}`;
          products.push({
            id: `img_prod_${i + 1}_${Date.now().toString(36)}`,
            sku: `FOTO-${String(i + 1).padStart(3, '0')}`,
            name: title.slice(0, 60),
            category: selectedPreset?.segment || 'Catálogo',
            description: `${title} disponível pelo WhatsApp.`,
            priceCents: 9990,
            variation: 'Padrão',
            stock: 10,
            stockQty: 10,
            trackStock: true,
            lowStockThreshold: 3,
            autoPausedOutOfStock: false,
            imageFocalPoint: { x: 50, y: 50 },
            imageLowRes: false,
            active: true,
            imageUrl: dataUrl,
            approvedAsset: true,
            itemType: 'produto_fisico',
            updatedAt: now,
          });
        }
        setImportedCatalog({
          label: `${products.length} fotos reais carregadas`,
          sourceType: 'images',
          products,
        });
        return;
      }

      showToast({ type: 'error', message: 'Use planilha (.xlsx / .csv) ou fotos reais.' });
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao ler arquivo.' });
    } finally {
      setParsingFile(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const extracted = await extractBrandPalette(dataUrl).catch(() => null);
      setBrandColors({
        logoUrl: dataUrl,
        primaryColor: extracted?.primaryHex || '#09090B',
        accentColor: extracted?.accentHex || '#2563EB',
      });
      showToast({ type: 'success', message: 'Logo carregada!' });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível ler essa imagem de logo.',
      });
    }
  };

  const handleStorefrontPhotoUpload = async (file: File) => {
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setStorefrontPhotoUrl(dataUrl);
      showToast({ type: 'success', message: 'Foto da frente da loja adicionada!' });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível carregar a foto da loja.',
      });
    }
  };

  const handleSelectNiche = (preset: IgnitionNichePreset) => {
    if (selectedNicheId === preset.id) {
      setSelectedNicheId(undefined);
      return;
    }
    setSelectedNicheId(preset.id);
    if (!storeInput.trim()) setStoreInput(preset.defaultBusinessName);
    if (!businessDescription.trim()) setBusinessDescription(preset.description);
    setSegmentDetected(preset.segment);
  };

  const handleAiAssistNotes = async () => {
    const cleanName = storeInput.trim().replace(/^@/, '') || 'Minha Loja';
    const catalogSample = (importedCatalog?.products || [])
      .slice(0, 6)
      .map((p) => `${p.name} (${p.category || 'Geral'})`)
      .join(', ');
    if (!businessDescription.trim() && !goalText.trim() && !catalogSample) {
      showToast({ type: 'amber', message: 'Escreva algumas palavras sobre o que vende para a IA organizar.' });
      return;
    }
    setAssistingAi(true);
    try {
      const res = await authenticatedFetch('/api/store-molde/onboarding-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: cleanName,
          segment: segmentDetected || selectedPreset?.segment || '',
          catalogSample,
          rawNotes: businessDescription.trim() || catalogSample,
          goalText: goalText.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.message || 'A IA não respondeu agora.');
      }
      if (data.segment) setSegmentDetected(String(data.segment));
      if (data.description) setBusinessDescription(String(data.description));
      if (data.goalSuggestion && !goalText.trim()) setGoalText(String(data.goalSuggestion));
      if (!importedCatalog?.products?.length && Array.isArray(data.products) && data.products.length > 0) {
        setImportedCatalog({
          label: `${data.products.length} itens estruturados pela IA`,
          sourceType: 'xlsx',
          products: data.products,
        });
      }
      showToast({ type: 'success', message: 'IA organizou sua descrição e catálogo inicial (0 cr).' });
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Falha ao organizar com IA.',
      });
    } finally {
      setAssistingAi(false);
    }
  };

  const buildCurrentProductsList = (cleanName: string): CatalogProduct[] => {
    if (importedCatalog?.products?.length) return importedCatalog.products;
    if (selectedPreset) return buildCatalogProductsFromNiche(selectedPreset);
    return buildDefaultSeedProductsForStore(cleanName);
  };

  const fetchPersonalizedFiveQuestions = async () => {
    const cleanName = storeInput.trim().replace(/^@/, '');
    const products = buildCurrentProductsList(cleanName);
    const inferredArchetype = classifyBusinessArchetype({
      segment: segmentDetected || selectedPreset?.segment || '',
      storeName: cleanName,
      products,
    });
    const resolvedSegmentForBrief =
      inferredArchetype.archetype !== 'varejo_geral'
        ? inferredArchetype.nicheLabel
        : segmentDetected || selectedPreset?.segment || 'Comércio Local';
    setSegmentDetected(resolvedSegmentForBrief);
    void import('./OnboardingSynthesisStage').catch(() => null);
    setLoadingQuestions(true);
    setQuestionsError('');
    setStep(4);
    try {
      const res = await authenticatedFetch('/api/store-molde/analyze-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strictGlm: false,
          useGlm: true,
          storeAddress: storeAddress.trim(),
          hasStorefrontPhoto: Boolean(storefrontPhotoUrl),
          productsText: businessDescription.trim(),
          businessGoal: goalText.trim(),
          userPrompt: `${businessDescription.trim()} ${goalText.trim()}`.trim() || cleanName,
          profile: {
            ...profile,
            business: {
              ...(profile.business || {}),
              name: cleanName,
              segment: resolvedSegmentForBrief,
              description: businessDescription.trim(),
              address: storeAddress.trim(),
              experienceGoal: goalText.trim(),
            },
            brand: {
              ...(profile.brand || {}),
              storefrontPhotoUrl,
            },
            catalog: { products },
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.questionsJson?.questions?.length) {
        throw new Error(
          String(
            data?.message ||
              data?.error ||
              'A inteligência CompanyGen não respondeu agora para gerar suas 5 perguntas personalizadas.',
          ),
        );
      }
      const qJson = data.questionsJson as BriefQuestionsJson;
      if (inferredArchetype.archetype !== 'varejo_geral') {
        // Classificação determinística baseada no catálogo real (ex.: Farmácia/Dipirona) sempre prevalece sobre suposição textual
        setSegmentDetected(inferredArchetype.nicheLabel);
      } else if (qJson.detectedNiche && qJson.detectedNiche.trim()) {
        setSegmentDetected(qJson.detectedNiche.trim());
      }
      const defaults: Record<string, string | string[]> = {};
      for (const q of qJson.questions) {
        if (q.type === 'multi_select_chips') {
          defaults[q.id] = q.options?.[0]?.label ? [q.options[0].label] : [];
        } else if (q.type === 'single_choice_cards') {
          const recStr = typeof q.recommendedDefault === 'string' ? q.recommendedDefault : '';
          defaults[q.id] = recStr || q.options?.[0]?.label || '';
        } else {
          defaults[q.id] = typeof q.recommendedDefault === 'string' ? q.recommendedDefault : '';
        }
      }
      setBriefQuestionsJson(qJson);
      setBriefAnswers(defaults);
      setQuestionIndex(0);
      if (data.understandingSummary && typeof data.understandingSummary === 'object') {
        setUnderstandingSummary(data.understandingSummary as Record<string, unknown>);
        const apiExtra = (data.understandingSummary as { recommendedExtraPages?: PreBuildRecommendedPage[] })
          .recommendedExtraPages;
        if (Array.isArray(apiExtra) && apiExtra.length > 0) {
          setCartPages(apiExtra.map((pg) => ({ ...pg, selected: Boolean(pg.selected) })));
        }
      }
    } catch (err) {
      setQuestionsError(
        err instanceof Error
          ? err.message
          : 'Erro ao preparar suas perguntas personalizadas. Tente novamente (0 cr).',
      );
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleStartCreationFlow = (event?: React.FormEvent) => {
    event?.preventDefault();
    const cleanName = storeInput.trim().replace(/^@/, '');
    if (cleanName.length < 2) {
      setStep(1);
      showToast({ type: 'error', message: 'Digite o nome da sua loja primeiro.' });
      return;
    }
    if (!phoneIsValid) {
      setWhatsappError('Informe um WhatsApp real com DDD');
      return;
    }
    setWhatsappError('');
    void fetchPersonalizedFiveQuestions();
  };

  const handleFinalizeWithAnswers = async () => {
    if (submitting) return;
    const cleanName = storeInput.trim().replace(/^@/, '');
    const products = buildCurrentProductsList(cleanName);
    const clientJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSubmitting(true);
    try {
      const normalizedAnswers: Record<string, string> = {};
      for (const q of briefQuestionsJson?.questions || []) {
        const val = briefAnswers[q.id];
        const baseAns = Array.isArray(val) ? val.join(', ') : String(val || '');
        const customNote = String(briefCustomTextNotes[q.id] || '').trim();
        normalizedAnswers[q.id] = customNote
          ? baseAns
            ? `${baseAns} · Nota do lojista: ${customNote}`
            : customNote
          : baseAns;
      }
      const chosenExtraPages: IgnitionExtraPageItem[] = cartPages
        .filter((pg) => pg.selected)
        .map((pg) => ({
          slug: pg.slug,
          title: pg.title,
          description: pg.description,
          campaignTheme: pg.campaignTheme || 'evergreen',
          creditsCost: pg.creditsCost,
        }));
      const totalEstimated =
        10 +
        chosenExtraPages.reduce((s, p) => s + Number(p.creditsCost || 0), 0) +
        (includeAiArtPack ? 5 : 0);

      clearStoredDraft(draftStorageKey);
      setHasDraftNotice(false);

      await onStartSynthesis({
        clientJobId,
        businessName: cleanName,
        segment: briefQuestionsJson?.detectedNiche || segmentDetected || selectedPreset?.segment || 'Comércio Local',
        description:
          businessDescription.trim() ||
          `${cleanName} — atendimento direto pelo WhatsApp.`,
        address: storeAddress.trim(),
        goalText: goalText.trim(),
        storefrontPhotoUrl,
        instagramHandle: instagramConnectedHandle || detectedHandle || undefined,
        selectedNicheId: selectedPreset?.id,
        primaryColor: brandColors.primaryColor || selectedPreset?.primaryColor || '#09090B',
        accentColor: brandColors.accentColor || selectedPreset?.accentColor || '#2563EB',
        logoUrl: brandColors.logoUrl || profile.brand?.logoUrl || '',
        whatsappDigits: phoneE164,
        whatsappDisplay: formatBrazilPhoneDisplay(phoneE164),
        pixKey: pixKey.trim(),
        pixKeyType,
        importedProducts: products,
        sourceType: importedCatalog ? importedCatalog.sourceType : selectedPreset ? 'niche' : 'manual',
        nicheSearchQuery: selectedPreset?.searchQuery || cleanName,
        layoutArchetype: 'editorial_gigante',
        addons: {
          webCatalogPhotos: false,
          aiPhotoPack: includeAiArtPack,
          dailySchedule: true,
          interactiveSimulator: false,
          whatsappFlows: true,
        },
        extraPages: chosenExtraPages,
        briefAnswers: normalizedAnswers,
        questionsJson: briefQuestionsJson,
        estimatedCredits: totalEstimated,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const questionsList: BriefQuestionItem[] = briefQuestionsJson?.questions || [];
  const currentQ = questionsList[questionIndex];
  const exitAction = onLogout || onOpenLogin;

  return (
    <div
      data-testid="ignition-stage"
      className="min-h-dvh w-full overflow-y-auto bg-[#F8FAFC] text-[#09090B]"
    >
      {/* Topo Minimalista com saída/desconexão garantida */}
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/simbolo-colorido.webp"
            alt="CompanyGen"
            className="size-7 rounded-lg object-contain"
          />
          <span className="text-[15px] font-bold tracking-tight text-[#09090B]">CompanyGen</span>
          {userEmail ? (
            <span className="hidden text-[12px] text-[#64748B] sm:inline">· {userEmail}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {onCancelToStore ? (
            <button
              type="button"
              data-testid="ignition-back-to-store-btn"
              onClick={onCancelToStore}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#09090B] hover:bg-[#F1F5F9]"
            >
              <span>Voltar para Minha Loja</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}

          {exitAction ? (
            <button
              type="button"
              data-testid="ignition-logout-btn"
              onClick={exitAction}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#475569] transition-colors hover:border-[#09090B]/25 hover:text-[#09090B]"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              <span>Sair / Desconectar conta</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-col px-5 pt-6 pb-20 sm:px-6 sm:pt-10">
        {/* Cabeçalho Editorial Minimalista */}
        <div className="mb-6 flex items-end justify-between gap-4 border-b border-[#E2E8F0] pb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
              {step < 4
                ? `Passo ${step} de 3 · Configuração Inicial`
                : step === 4
                  ? `Pergunta ${Math.min(questionIndex + 1, Math.max(1, questionsList.length))} de ${Math.max(5, questionsList.length)} · Inteligência CompanyGen`
                  : 'Resumo & Carrinho de Telas antes de criar'}
            </p>
            <h1 className="mt-1 font-serif text-[34px] font-extrabold leading-[0.98] tracking-[-0.03em] text-[#09090B] sm:text-[42px]">
              {step === 1 && 'Nome e Planilha da Loja'}
              {step === 2 && 'O que Você Vende'}
              {step === 3 && 'Endereço, Fachada e WhatsApp'}
              {step === 4 && 'Personalização Inteligente'}
              {step === 5 && 'Telas & Plano de Criação'}
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5" aria-label="Progresso do cadastro">
              {[1, 2, 3, 4, 5].map((idx) => (
                <span
                  key={idx}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    step === idx ? 'w-7 bg-[#09090B]' : step > idx ? 'w-3 bg-[#10B981]' : 'w-3 bg-[#E2E8F0]',
                  )}
                />
              ))}
            </div>
            {hasDraftNotice && step <= 3 ? (
              <button
                type="button"
                data-testid="ignition-clear-draft-btn"
                onClick={() => {
                  clearStoredDraft(draftStorageKey);
                  setHasDraftNotice(false);
                  showToast({ type: 'success', message: 'Rascunho automático limpo.' });
                }}
                className="text-[11px] font-semibold text-[#64748B] underline-offset-2 hover:text-[#09090B] hover:underline"
              >
                Rascunho recuperado · limpar
              </button>
            ) : null}
          </div>
        </div>

        {/* Inputs ocultos */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,image/*"
          data-testid="ignition-file-input"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          data-testid="ignition-logo-input"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleLogoUpload(f);
            e.target.value = '';
          }}
        />
        <input
          ref={storefrontPhotoInputRef}
          type="file"
          accept="image/*"
          data-testid="ignition-storefront-photo-input"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleStorefrontPhotoUpload(f);
            e.target.value = '';
          }}
        />

        <AnimatePresence mode="wait">
          {/* PASSO 1: NOME DA LOJA + SUBIR PLANILHA + LOGO */}
          {step === 1 ? (
            <motion.section
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className="space-y-5 rounded-[18px] border border-[#E2E8F0] bg-white p-6 shadow-xs"
            >
              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#09090B]">
                  Nome da loja ou @ do Instagram
                </label>
                <div className="relative">
                  <input
                    type="text"
                    data-testid="ignition-store-input"
                    value={storeInput}
                    onChange={(e) => setStoreInput(e.target.value)}
                    placeholder="Ex: Alexandre Variedades ou @sualoja"
                    className="h-12 w-full rounded-[12px] border border-[#E2E8F0] bg-white pl-3.5 pr-28 text-[14px] font-medium text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center">
                    {!storeInput.trim() ? (
                      <button
                        type="button"
                        data-testid="ignition-paste-btn"
                        onClick={() => void handlePasteFromClipboard()}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs font-semibold text-[#475569] hover:text-[#09090B]"
                      >
                        <ClipboardPaste className="size-3.5" aria-hidden="true" />
                        <span>Colar</span>
                      </button>
                    ) : detectedHandle ? (
                      <button
                        type="button"
                        data-testid="ignition-instagram-fetch-btn"
                        disabled={analyzingInstagram}
                        onClick={() => void handleAnalyzeInstagram()}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-xs font-semibold text-[#09090B] hover:bg-[#F1F5F9]"
                      >
                        {analyzingInstagram ? <Loader2 className="size-3.5 animate-spin" /> : <AtSign className="size-3.5" />}
                        <span>Puxar @</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Botão explícito de Subir Planilha */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#09090B]">
                    Planilha de produtos (.xlsx ou .csv)
                  </label>
                  <button
                    type="button"
                    data-testid="ignition-upload-spreadsheet-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:underline"
                  >
                    <Upload className="size-3.5" aria-hidden="true" />
                    <span>Subir planilha</span>
                  </button>
                </div>

                {importedCatalog ? (
                  <div
                    data-testid="ignition-dropzone-loaded"
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileSpreadsheet className="size-4 shrink-0 text-[#09090B]" aria-hidden="true" />
                      <span className="truncate text-[13px] font-semibold text-[#09090B]">
                        {importedCatalog.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-semibold text-[#2563EB] hover:underline"
                      >
                        Trocar
                      </button>
                      <button
                        type="button"
                        data-testid="ignition-dropzone-clear"
                        onClick={() => {
                          setImportedCatalog(null);
                          setSpreadsheetAlert(null);
                        }}
                        aria-label="Remover planilha"
                        className="inline-flex size-7 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#E2E8F0]"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="ignition-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      if (e.dataTransfer?.files?.length) void handleFilesSelected(e.dataTransfer.files);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[12px] border border-dashed px-4 py-4 text-left transition-colors',
                      isDragOver
                        ? 'border-[#2563EB] bg-[#EFF6FF]'
                        : 'border-[#CBD5E1] bg-white hover:border-[#09090B]/40 hover:bg-[#F8FAFC]',
                    )}
                  >
                    {parsingFile ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-[#09090B]" aria-hidden="true" />
                    ) : (
                      <FileSpreadsheet className="size-4 shrink-0 text-[#475569]" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#09090B]">
                        {parsingFile ? 'Lendo planilha...' : 'Subir planilha (.xlsx, .csv) ou fotos reais'}
                      </p>
                      <p className="text-[12px] text-[#64748B]">
                        As perguntas da IA serão geradas diretamente sobre esses produtos.
                      </p>
                    </div>
                  </button>
                )}

                {spreadsheetAlert ? (
                  <p
                    className={cn(
                      'mt-2 rounded-lg border px-3 py-2 text-xs',
                      spreadsheetAlert.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]',
                    )}
                  >
                    <strong className="text-[#09090B]">{spreadsheetAlert.title}:</strong> {spreadsheetAlert.detail}
                  </p>
                ) : null}
              </div>

              {/* Logo opcional minimalista */}
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  {brandColors.logoUrl ? (
                    <img src={brandColors.logoUrl} alt="Logo" className="size-8 rounded-lg border border-[#E2E8F0] object-cover" />
                  ) : (
                    <ImagePlus className="size-4 text-[#475569]" aria-hidden="true" />
                  )}
                  <span className="text-xs font-medium text-[#475569]">
                    {brandColors.logoUrl ? 'Logo carregada' : 'Logo da marca (opcional)'}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="ignition-upload-logo-btn"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#09090B] hover:bg-[#F1F5F9]"
                >
                  {brandColors.logoUrl ? 'Trocar' : 'Enviar Logo'}
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  data-testid="onboarding-step1-next"
                  onClick={() => {
                    if (storeInput.trim().replace(/^@/, '').length < 2) {
                      showToast({ type: 'error', message: 'Digite o nome da sua loja para continuar.' });
                      return;
                    }
                    setStep(2);
                  }}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white transition-colors hover:bg-[#18181B]"
                >
                  <span>Continuar</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </motion.section>
          ) : null}

          {/* PASSO 2: DIGITAR O QUE VENDE + PRODUTOS + OBJETIVO + BOTÃO GERAR COM IA */}
          {step === 2 ? (
            <motion.section
              key="step-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className="space-y-4 rounded-[18px] border border-[#E2E8F0] bg-white p-6 shadow-xs"
            >
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#09090B]">
                    O que você vende e principais produtos
                  </label>
                  <button
                    type="button"
                    data-testid="onboarding-ai-assist-btn"
                    disabled={assistingAi}
                    onClick={() => void handleAiAssistNotes()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#09090B] hover:bg-[#F1F5F9] disabled:opacity-60"
                  >
                    {assistingAi ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-3.5" aria-hidden="true" />
                    )}
                    <span>{assistingAi ? 'Organizando...' : 'Gerar com IA'}</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  data-testid="ignition-description-input"
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="Ex: Vendo eletrônicos, smartphones Samsung e Apple, carregadores turbo, caixas de som e películas 3D com entrega no mesmo dia..."
                  className="w-full rounded-[12px] border border-[#E2E8F0] bg-white p-3.5 text-[14px] text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-[#09090B]">
                  Qual o objetivo principal da sua loja agora?
                </label>
                <input
                  type="text"
                  data-testid="ignition-goal-input"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="Ex: Aumentar pedidos no WhatsApp e agilizar orçamento no Pix"
                  className="h-12 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3.5 text-[14px] text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex h-12 items-center gap-1.5 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#475569] hover:text-[#09090B]"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  <span>Voltar</span>
                </button>
                <button
                  type="button"
                  data-testid="onboarding-step2-next"
                  onClick={() => setStep(3)}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white hover:bg-[#18181B]"
                >
                  <span>Continuar</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </motion.section>
          ) : null}

          {/* PASSO 3: ENDEREÇO + FOTO DA FRENTE DA LOJA + WHATSAPP + PIX + BOTÃO CRIAR */}
          {step === 3 ? (
            <motion.form
              key="step-3"
              onSubmit={handleStartCreationFlow}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className="space-y-4 rounded-[18px] border border-[#E2E8F0] bg-white p-6 shadow-xs"
            >
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#09090B]">
                  <MapPin className="size-3.5 text-[#475569]" aria-hidden="true" />
                  <span>Endereço completo da loja (ou atendimento online / bairro)</span>
                </label>
                <input
                  type="text"
                  data-testid="ignition-address-input"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Ex: Rua das Flores, 326 - Centro, Belo Horizonte"
                  className="h-12 w-full rounded-[12px] border border-[#E2E8F0] bg-white px-3.5 text-[14px] text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              {/* Foto da Frente da Loja */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-[#09090B]">
                    Foto da frente da loja (opcional)
                  </label>
                  {storefrontPhotoUrl ? (
                    <button
                      type="button"
                      onClick={() => setStorefrontPhotoUrl('')}
                      className="text-xs font-medium text-[#64748B] hover:text-[#EF4444]"
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>

                {storefrontPhotoUrl ? (
                  <div className="flex items-center gap-3 rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                    <img
                      src={storefrontPhotoUrl}
                      alt="Frente da loja"
                      className="h-16 w-24 rounded-lg border border-[#E2E8F0] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#09090B]">Fachada anexada</p>
                      <p className="text-[11px] text-[#64748B]">Será exibida na seção institucional e endereço.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => storefrontPhotoInputRef.current?.click()}
                      className="rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-[#09090B]"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="ignition-storefront-photo-btn"
                    onClick={() => storefrontPhotoInputRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-[#CBD5E1] bg-white px-4 py-3 text-left hover:border-[#09090B]/40 hover:bg-[#F8FAFC]"
                  >
                    <ImagePlus className="size-4 shrink-0 text-[#475569]" aria-hidden="true" />
                    <span className="text-[13px] font-medium text-[#475569]">
                      Subir foto da fachada da sua loja
                    </span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#09090B]">
                    WhatsApp de vendas
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    data-testid="ignition-whatsapp-input"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(formatBrazilPhoneDisplay(e.target.value));
                      if (whatsappError) setWhatsappError('');
                    }}
                    placeholder="(11) 99999-9999"
                    className={cn(
                      'h-12 w-full rounded-[12px] border bg-white px-3.5 text-[14px] font-medium tabular-nums text-[#09090B] placeholder:text-[#94A3B8] focus:outline-none',
                      whatsappError ? 'border-[#EF4444]' : 'border-[#E2E8F0] focus:border-[#2563EB]',
                    )}
                  />
                  {whatsappError ? (
                    <p role="alert" className="mt-1 text-xs font-medium text-[#EF4444]">
                      {whatsappError}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-[#09090B]">
                    Chave Pix (opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      data-testid="ignition-pix-input"
                      value={pixKey}
                      onChange={(e) => setPixKey(e.target.value)}
                      placeholder="CPF, e-mail ou celular"
                      className="h-12 w-full rounded-[12px] border border-[#E2E8F0] bg-white pl-3.5 pr-20 text-[14px] font-medium text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                    />
                    {pixKeyType ? (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#475569]">
                        {PIX_TYPE_LABELS[pixKeyType]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex h-12 items-center gap-1.5 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#475569] hover:text-[#09090B]"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  <span>Voltar</span>
                </button>
                <button
                  type="submit"
                  data-testid="ignition-submit-btn"
                  disabled={loadingQuestions || submitting}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white hover:bg-[#18181B] disabled:opacity-60"
                >
                  <span>Criar Minha Loja Agora</span>
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>
            </motion.form>
          ) : null}

          {/* PASSO 4: 5 PERGUNTAS OBRIGATÓRIAS GERADAS PELO GLM (1 POR TELA + CONTINUAR) */}
          {step === 4 ? (
            <motion.section
              key="step-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
              className="space-y-5 rounded-[18px] border border-[#E2E8F0] bg-white p-6 shadow-xs"
              data-testid="ignition-glm-questions-stage"
            >
              {loadingQuestions ? (
                <div className="flex flex-col items-center justify-center gap-4 py-10 text-center" data-testid="ignition-loading-bar-80">
                  <Loader2 className="size-6 animate-spin text-[#09090B]" aria-hidden="true" />
                  <div className="w-full max-w-sm space-y-2">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div
                        className="h-full rounded-full bg-[#09090B] transition-all duration-500 ease-out"
                        style={{ width: `${loadingProgressPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#64748B]">
                      <span>Analisando catálogo</span>
                      <span className="cg-tabular">{loadingProgressPct}%</span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-[#09090B]">
                    {QUESTION_LOADING_MESSAGES[loadingMessageIdx]}
                  </p>
                  <p className="max-w-sm text-xs text-[#64748B]">
                    Personalizamos perguntas e telas conforme seus produtos reais (0 créditos nesta etapa).
                  </p>
                </div>
              ) : questionsError ? (
                <div className="space-y-4 py-6 text-center">
                  <p className="text-sm font-semibold text-[#EF4444]">{questionsError}</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="rounded-[10px] border border-[#E2E8F0] bg-white px-4 py-2 text-xs font-semibold text-[#475569]"
                    >
                      Voltar e revisar dados
                    </button>
                    <button
                      type="button"
                      onClick={() => void fetchPersonalizedFiveQuestions()}
                      className="rounded-[10px] bg-[#09090B] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Gerar perguntas novamente
                    </button>
                  </div>
                </div>
              ) : currentQ ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentQ.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                    className="space-y-4"
                  >
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB]">
                        Pergunta {questionIndex + 1} de {questionsList.length}
                      </span>
                      <h2 className="mt-1 text-lg font-bold leading-snug text-[#09090B]">
                        {currentQ.title}
                      </h2>
                      {currentQ.helperText ? (
                        <p className="mt-1 text-xs text-[#64748B]">{currentQ.helperText}</p>
                      ) : null}
                    </div>

                    {currentQ.type === 'short_text_input' || !currentQ.options?.length ? (
                      <textarea
                        rows={3}
                        value={String(briefAnswers[currentQ.id] || '')}
                        onChange={(e) =>
                          setBriefAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                        }
                        placeholder="Digite sua resposta..."
                        className="w-full rounded-[12px] border border-[#E2E8F0] bg-white p-3.5 text-sm text-[#09090B] focus:border-[#2563EB] focus:outline-none"
                      />
                    ) : (
                      <div className="space-y-2.5">
                        {currentQ.options.map((opt) => {
                          const curVal = briefAnswers[currentQ.id];
                          const isMulti = currentQ.type === 'multi_select_chips';
                          const selected = isMulti
                            ? Array.isArray(curVal) && curVal.includes(opt.label)
                            : curVal === opt.label;
                          return (
                            <button
                              key={opt.id || opt.label}
                              type="button"
                              onClick={() => {
                                setBriefAnswers((prev) => {
                                  if (!isMulti) return { ...prev, [currentQ.id]: opt.label };
                                  const arr = Array.isArray(prev[currentQ.id]) ? (prev[currentQ.id] as string[]) : [];
                                  const next = arr.includes(opt.label)
                                    ? arr.filter((x) => x !== opt.label)
                                    : [...arr, opt.label];
                                  return { ...prev, [currentQ.id]: next };
                                });
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors',
                                selected
                                  ? 'border-[#09090B] bg-[#F8FAFC]'
                                  : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]',
                              )}
                            >
                              <div className="min-w-0">
                                <span className="block text-[13.5px] font-semibold text-[#09090B]">
                                  {opt.label}
                                </span>
                                {opt.hint ? (
                                  <span className="mt-0.5 block text-[12px] text-[#64748B]">{opt.hint}</span>
                                ) : null}
                              </div>
                              {selected ? <Check className="size-4 shrink-0 text-[#09090B]" /> : null}
                            </button>
                          );
                        })}

                        <div className="pt-1">
                          <label
                            htmlFor={`brief-custom-note-${currentQ.id}`}
                            className="mb-1 block text-[11.5px] font-semibold text-[#475569]"
                          >
                            Ou escreva sua própria resposta com suas palavras (opcional)
                          </label>
                          <textarea
                            id={`brief-custom-note-${currentQ.id}`}
                            data-testid={`ignition-q-custom-text-${questionIndex}`}
                            rows={2}
                            maxLength={280}
                            value={String(briefCustomTextNotes[currentQ.id] || '')}
                            onChange={(e) =>
                              setBriefCustomTextNotes((prev) => ({
                                ...prev,
                                [currentQ.id]: e.target.value,
                              }))
                            }
                            placeholder="Complemente ou explique como preferir..."
                            className="w-full rounded-[12px] border border-[#E2E8F0] bg-[#FAFAFA] px-3 py-2 text-xs text-[#09090B] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (questionIndex > 0) setQuestionIndex((i) => i - 1);
                          else setStep(3);
                        }}
                        className="inline-flex h-12 items-center gap-1.5 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#475569] hover:text-[#09090B]"
                      >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        <span>Voltar</span>
                      </button>

                      {questionIndex < questionsList.length - 1 ? (
                        <button
                          type="button"
                          data-testid="ignition-glm-next-btn"
                          onClick={() => setQuestionIndex((i) => i + 1)}
                          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white hover:bg-[#18181B]"
                        >
                          <span>Continuar</span>
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="ignition-glm-finish-btn"
                          onClick={() => setStep(5)}
                          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#09090B] text-[14px] font-semibold text-white hover:bg-[#18181B]"
                        >
                          <span>Ver Resumo &amp; Carrinho de Telas</span>
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              ) : null}
            </motion.section>
          ) : null}

          {step === 5 ? (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
            >
              <PreBuildPagesCartStep
                businessName={storeInput.trim().replace(/^@/, '') || 'Sua Loja'}
                detectedNiche={(() => {
                  const cleanNm = storeInput.trim().replace(/^@/, '');
                  const curItems = buildCurrentProductsList(cleanNm);
                  const det = classifyBusinessArchetype({
                    segment: briefQuestionsJson?.detectedNiche || segmentDetected || selectedPreset?.segment || '',
                    storeName: cleanNm,
                    products: curItems,
                  });
                  if (det.archetype !== 'varejo_geral') return det.nicheLabel;
                  return (
                    briefQuestionsJson?.detectedNiche ||
                    segmentDetected ||
                    selectedPreset?.segment ||
                    'Comércio Local'
                  );
                })()}
                priceRange={String(understandingSummary?.priceRange || 'Sob consulta')}
                totalActiveSkus={
                  Number(understandingSummary?.totalActiveSkus) ||
                  buildCurrentProductsList(storeInput.trim().replace(/^@/, '')).length
                }
                flagshipProduct={String(understandingSummary?.flagshipProduct || '')}
                businessGoal={goalText.trim()}
                recommendedSections={
                  Array.isArray(understandingSummary?.recommendedSectionsPreview) &&
                  understandingSummary.recommendedSectionsPreview.length > 0
                    ? (understandingSummary.recommendedSectionsPreview as Array<{
                        id: string;
                        title: string;
                        role: string;
                      }>)
                    : DEFAULT_PLANNED_SECTIONS
                }
                cartPages={cartPages}
                includeAiArtPack={includeAiArtPack}
                onToggleIncludeAiArtPack={setIncludeAiArtPack}
                onTogglePage={(slug) =>
                  setCartPages((prev) =>
                    prev.map((pg) => (pg.slug === slug ? { ...pg, selected: !pg.selected } : pg)),
                  )
                }
                onAddCustomPage={(title) => {
                  const slug = title
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 32) || `tela-${Date.now()}`;
                  setCartPages((prev) => {
                    if (prev.some((p) => p.slug === slug)) return prev;
                    return [
                      ...prev,
                      {
                        slug,
                        title,
                        description: 'Tela extra personalizada criada em paralelo pela IA.',
                        campaignTheme: 'evergreen',
                        creditsCost: 3,
                        selected: true,
                        isCustom: true,
                      },
                    ];
                  });
                }}
                onRemoveCustomPage={(slug) =>
                  setCartPages((prev) => prev.filter((pg) => pg.slug !== slug))
                }
                onBack={() => setStep(4)}
                onConfirmBuild={() => void handleFinalizeWithAnswers()}
                submitting={submitting}
                creditBalance={creditBalance}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Pílulas discretas de segmento para teste rápido apenas na Etapa 1 */}
        {step === 1 ? (
          <div className="mt-6 text-center">
            <p className="mb-2.5 text-[12px] font-medium text-[#64748B]">
              Ou preencha um exemplo rápido para testar
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {IGNITION_NICHE_PRESETS.map((preset) => {
                const active = selectedNicheId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`ignition-niche-pill-${preset.id}`}
                    onClick={() => handleSelectNiche(preset)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                      active
                        ? 'border-[#09090B] bg-[#09090B] text-white'
                        : 'border-[#E2E8F0] bg-white text-[#475569] hover:text-[#09090B]',
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
