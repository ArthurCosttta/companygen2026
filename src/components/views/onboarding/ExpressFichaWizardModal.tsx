import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  FileSpreadsheet,
  HelpCircle,
  ImagePlus,
  Layers,
  MapPin,
  Package,
  Palette,
  Plus,
  Rocket,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { FICHA_MODAL_LAYOUT_ID } from '@/utils/fichaModalLayout';
import { normalizeSpreadsheetItemType } from '@/schemas/formula-v9.schema';
import {
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type CatalogItemType,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import {
  analyzeInstagramProfile,
  loadBusinessProfile,
  parseSpreadsheetProducts,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  ConfirmExitModal,
  ContextualHelpModal,
  SaveDraftModal,
} from './OnboardingModals';
import {
  buildDraftFromProfile,
  clampOnboardingStep,
  clearExpressFichaDraft,
  formatBrazilPhoneDisplay,
  ONBOARDING_COLOR_SWATCHES,
  ONBOARDING_DIFFERENTIAL_CHIPS,
  ONBOARDING_EXPERIENCE_PRESETS,
  parsePriceBrlToCents,
  readExpressFichaDraft,
  SEGMENT_OPTIONS,
  validatePixKeyInput,
  writeExpressFichaDraft,
  type AcceptedPaymentMethod,
  type ExpressFichaDraft,
  type OnboardingBusinessModel,
  type OnboardingFontStyle,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from './onboarding-helpers';

export interface ExpressFichaWizardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BusinessProfile | null;
  owner?: string;
  initialStep?: OnboardingWizardStep;
  onProfileUpdated?: (snap: ProfileSnapshot) => void;
  onCompleted?: (
    snap: ProfileSnapshot,
    meta: { published: boolean },
  ) => void;
}

const PAYMENT_METHOD_OPTIONS: Array<{
  id: AcceptedPaymentMethod;
  label: string;
}> = [
  { id: 'pix', label: 'Pix' },
  { id: 'credit_card', label: 'Cartão de Crédito' },
  { id: 'debit_card', label: 'Cartão de Débito' },
  { id: 'cash', label: 'Dinheiro' },
];

const PIX_DISCOUNT_PRESETS = [0, 5, 10] as const;

const BUSINESS_MODEL_OPTIONS: Array<{
  id: OnboardingBusinessModel;
  title: string;
  subtitle: string;
  badge: string;
}> = [
  {
    id: 'produtos',
    title: 'Produtos Físicos',
    subtitle: 'Cliente escolhe itens, coloca na sacola e envia o pedido.',
    badge: 'Vitrine & Sacola',
  },
  {
    id: 'servicos',
    title: 'Serviços & Agendamento',
    subtitle: 'Cliente entende o serviço, simula porte/opções e solicita horário.',
    badge: 'Agenda & Atendimento',
  },
  {
    id: 'hibrido',
    title: 'Misto / Kits & Sob Medida',
    subtitle: 'Combos, caixas montáveis, serviços com produtos ou encomendas.',
    badge: 'Experiência Completa',
  },
];

const FONT_STYLE_OPTIONS: Array<{
  id: OnboardingFontStyle;
  label: string;
  hint: string;
}> = [
  { id: 'modern_sans', label: 'Limpo & Acolhedor', hint: 'Leitura leve para dia a dia' },
  { id: 'editorial_serif', label: 'Editorial Elegante', hint: 'Sofisticado e autoral' },
  { id: 'clean_geometric', label: 'Moderno Geométrico', hint: 'Direto e técnico' },
];

const STEP_LABELS: Record<OnboardingWizardStep, string> = {
  1: 'Identidade',
  2: 'Modelo',
  3: 'Diferenciais',
  4: 'Logo & Fachada',
  5: 'Experiência',
  6: 'Visual',
  7: 'Catálogo',
  8: 'Finalizar',
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao ler arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

export function ExpressFichaWizardModal({
  open,
  onOpenChange,
  profile,
  owner,
  initialStep,
  onProfileUpdated,
  onCompleted,
}: ExpressFichaWizardModalProps) {
  const { showToast } = useToast();

  const [draft, setDraft] = React.useState<ExpressFichaDraft>(() =>
    buildDraftFromProfile(profile, clampOnboardingStep(initialStep ?? 1)),
  );
  const [isDirty, setIsDirty] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadingSlot, setUploadingSlot] = React.useState<'logo' | 'storefront' | null>(null);
  const [stepError, setStepError] = React.useState('');
  const [customDiffInput, setCustomDiffInput] = React.useState('');
  const [quickItemType, setQuickItemType] = React.useState<CatalogItemType>('produto_fisico');
  const [autofilling, setAutofilling] = React.useState(false);
  const [instagramAnalyzing, setInstagramAnalyzing] = React.useState(false);
  const [instagramSuggestion, setInstagramSuggestion] = React.useState<Awaited<ReturnType<typeof analyzeInstagramProfile>> | null>(null);
  const [aiSuggestedBadge, setAiSuggestedBadge] = React.useState(false);
  const [jobProgress, setJobProgress] = React.useState<{ stage: string; label: string } | null>(null);

  const [saveDraftModalOpen, setSaveDraftModalOpen] = React.useState(false);
  const [confirmExitModalOpen, setConfirmExitModalOpen] = React.useState(false);
  const [helpTopic, setHelpTopic] = React.useState<OnboardingHelpTopic | null>(null);

  const wasOpenRef = React.useRef(false);
  const savedProductInSessionRef = React.useRef(false);
  const draftWriteTimerRef = React.useRef<number | null>(null);
  const pollTimerRef = React.useRef<number | null>(null);

  const cancelPendingDraftWrite = React.useCallback(() => {
    if (draftWriteTimerRef.current !== null) {
      window.clearTimeout(draftWriteTimerRef.current);
      draftWriteTimerRef.current = null;
    }
  }, []);

  const scheduleDraftWrite = React.useCallback(
    (nextDraft: ExpressFichaDraft) => {
      cancelPendingDraftWrite();
      draftWriteTimerRef.current = window.setTimeout(() => {
        draftWriteTimerRef.current = null;
        writeExpressFichaDraft(nextDraft, owner);
      }, 250);
    },
    [cancelPendingDraftWrite, owner],
  );

  React.useEffect(() => {
    return () => {
      cancelPendingDraftWrite();
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [cancelPendingDraftWrite]);

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      savedProductInSessionRef.current = false;
      const savedDraft = readExpressFichaDraft(owner);
      const base = buildDraftFromProfile(profile, clampOnboardingStep(initialStep ?? 1));
      if (savedDraft) {
        setDraft({
          ...base,
          ...savedDraft,
          currentStep: clampOnboardingStep(initialStep ?? savedDraft.currentStep),
        });
        setIsDirty(true);
      } else {
        setDraft(base);
        setIsDirty(false);
      }
      setStepError('');
      setCustomDiffInput('');
      setQuickItemType(base.businessModel === 'servicos' ? 'servico_agendado' : 'produto_fisico');
    }
    wasOpenRef.current = open;
  }, [open, profile, owner, initialStep]);

  const updateDraft = React.useCallback(
    (patch: Partial<ExpressFichaDraft>) => {
      setStepError('');
      setIsDirty(true);
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        scheduleDraftWrite(next);
        return next;
      });
    },
    [scheduleDraftWrite],
  );

  const handleAnalyzeInstagram = React.useCallback(async () => {
    if (!draft.instagramHandle.trim()) return;
    setInstagramAnalyzing(true);
    setStepError('');
    try {
      const result = await analyzeInstagramProfile(draft.instagramHandle.trim(), owner);
      if (!result.ok) throw new Error(result.error || 'O Instagram limitou a leitura deste perfil público.');
      setInstagramSuggestion(result);
    } catch (error) {
      setInstagramSuggestion(null);
      setStepError(error instanceof Error ? error.message : 'Não foi possível analisar o Instagram agora.');
    } finally {
      setInstagramAnalyzing(false);
    }
  }, [draft.instagramHandle, owner]);

  const applyInstagramSuggestion = React.useCallback(() => {
    if (!instagramSuggestion) return;
    updateDraft({
      instagramHandle: instagramSuggestion.handle || draft.instagramHandle,
      businessName: draft.businessName.trim() || instagramSuggestion.fullName,
      businessDescription: draft.businessDescription.trim() || instagramSuggestion.bio,
      segment: draft.segment && draft.segment !== 'Geral' ? draft.segment : (instagramSuggestion.category || 'Geral'),
      phoneInput: draft.phoneInput.trim() || formatBrazilPhoneDisplay(instagramSuggestion.phone || ''),
      businessAddress: draft.businessAddress.trim() || instagramSuggestion.address || '',
      businessHours: draft.businessHours.trim() || instagramSuggestion.hours || '',
      logoUrl: draft.logoUrl.trim() || instagramSuggestion.logoUrl || '',
      differentials: draft.differentials.length > 0 ? draft.differentials : (instagramSuggestion.differentials || []).slice(0, 3),
    });
    setInstagramSuggestion(null);
    showToast({ type: 'success', message: 'Sugestões do Instagram aplicadas. Revise antes de salvar.' });
  }, [draft, instagramSuggestion, showToast, updateDraft]);

  const activeProducts = React.useMemo(
    () => (profile?.catalog?.products ?? []).filter((p) => p.active !== false),
    [profile],
  );

  const catalogBreakdown = React.useMemo(() => {
    let services = 0;
    let kits = 0;
    let products = 0;
    for (const item of activeProducts) {
      const kind =
        item.itemType ||
        normalizeSpreadsheetItemType({
          name: item.name,
          category: item.category,
          description: item.description,
          defaultBusinessModel: draft.businessModel,
        });
      if (kind === 'servico_agendado') services += 1;
      else if (kind === 'kit_combo' || kind === 'sob_medida') kits += 1;
      else products += 1;
    }
    return { services, kits, products, total: activeProducts.length };
  }, [activeProducts, draft.businessModel]);

  const phoneE164 = sanitizePhoneE164(draft.phoneInput);
  const phoneValid = isValidProductionPhone(phoneE164);
  const businessNameValid = draft.businessName.trim().length >= 2;
  const deliveryValid = draft.deliveryEnabled || draft.pickupEnabled;
  const pixCheck = validatePixKeyInput(draft.pixKey);

  const productPriceCents = parsePriceBrlToCents(draft.productPriceInput);
  const productNameValid = draft.productName.trim().length >= 2;
  const quickProductValid = productNameValid && productPriceCents > 0;

  const canAdvanceCurrentStep = React.useMemo(() => {
    switch (draft.currentStep) {
      case 1:
        return businessNameValid && phoneValid;
      case 2:
        return true;
      case 3:
        return draft.businessDescription.trim().length >= 5 || draft.differentials.length > 0;
      case 4:
      case 5:
      case 6:
        return true;
      case 7:
        return activeProducts.length > 0 || quickProductValid;
      case 8:
        return businessNameValid && phoneValid && deliveryValid && pixCheck.valid;
      default:
        return true;
    }
  }, [
    draft.currentStep,
    businessNameValid,
    phoneValid,
    draft.businessDescription,
    draft.differentials.length,
    activeProducts.length,
    quickProductValid,
    deliveryValid,
    pixCheck.valid,
  ]);

  const handleRequestClose = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (submitting || uploadingSlot) return;
    if (isDirty) {
      setSaveDraftModalOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const applyDraftFieldsToTarget = (target: BusinessProfile) => {
    const feeCents = parsePriceBrlToCents(draft.deliveryFeeInput);
    const areas = draft.deliveryAreasText
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    target.business.name = draft.businessName.trim();
    target.business.segment = draft.segment.trim() || 'Geral';
    target.business.businessModel = draft.businessModel;
    target.business.differentials = [...draft.differentials].slice(0, 3);
    target.business.experienceGoal = draft.experienceGoal.trim();
    target.business.campaignTheme = draft.campaignTheme.trim();
    if (draft.businessDescription.trim()) {
      target.business.description = draft.businessDescription.trim();
    }
    if (!draft.noPhysicalLocation) {
      target.business.address = draft.businessAddress.trim();
      target.business.hours = draft.businessHours.trim();
    } else {
      target.business.address = '';
    }

    target.brand.primaryColor = draft.primaryColor || '#0B4DB8';
    target.brand.fontStyle = draft.fontStyle || 'modern_sans';
    target.brand.instagram = draft.instagramHandle.trim();
    if (draft.logoUrl.trim()) {
      target.brand.logoUrl = draft.logoUrl.trim();
      target.brand.generateAiLogo = false;
    } else {
      target.brand.logoUrl = '';
      target.brand.generateAiLogo = Boolean(draft.generateAiLogo);
    }
    target.brand.storefrontPhotoUrl = draft.noPhysicalLocation ? '' : draft.storefrontPhotoUrl.trim();

    if (phoneValid) {
      target.whatsapp.phoneE164 = phoneE164;
      target.whatsapp.displayPhone = formatBrazilPhoneDisplay(phoneE164);
    }

    target.delivery.deliveryEnabled = draft.deliveryEnabled;
    target.delivery.pickupEnabled = draft.pickupEnabled;
    target.delivery.defaultFeeCents = feeCents;
    target.delivery.areas = areas;

    target.payment.pixKey = draft.pixKey.trim();
    target.payment.pixDiscountPercent = draft.pixDiscountPercent;
    target.payment.acceptedMethods =
      draft.acceptedMethods.length > 0
        ? draft.acceptedMethods
        : ['pix', 'credit_card', 'debit_card', 'cash'];
    target.onboarding.fichaCompleted = true;
  };

  const handleToggleDifferential = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    if (draft.differentials.includes(clean)) {
      updateDraft({ differentials: draft.differentials.filter((item) => item !== clean) });
      return;
    }
    if (draft.differentials.length >= 3) {
      setStepError('Escolha até 3 diferenciais principais para manter a página objetiva.');
      return;
    }
    updateDraft({ differentials: [...draft.differentials, clean] });
  };

  const handleAddCustomDifferential = () => {
    const clean = customDiffInput.trim();
    if (!clean) return;
    if (draft.differentials.length >= 3) {
      setStepError('Você já selecionou 3 diferenciais. Remova um para adicionar outro.');
      return;
    }
    if (!draft.differentials.includes(clean)) {
      updateDraft({ differentials: [...draft.differentials, clean] });
    }
    setCustomDiffInput('');
  };

  const handleUploadFreeAsset = async (
    slot: 'logo' | 'storefront',
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 4_000_000) {
      setStepError('Escolha uma imagem de até 4 MB.');
      return;
    }

    setUploadingSlot(slot);
    setStepError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const slotId = slot === 'logo' ? 'brand_logo' : 'storefront_front';
      let finalUrl = dataUrl;

      const res = await authenticatedFetch(
        '/api/store-molde/upload-asset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, slotId }),
        },
        owner,
      );
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.assetUrl) {
          finalUrl = String(json.assetUrl);
        }
      }

      if (slot === 'logo') {
        updateDraft({ logoUrl: finalUrl, generateAiLogo: false });
      } else {
        updateDraft({ storefrontPhotoUrl: finalUrl, noPhysicalLocation: false });
      }

      if (profile) {
        const snap = await updateBusinessProfile(
          (target) => {
            if (slot === 'logo') {
              target.brand.logoUrl = finalUrl;
              target.brand.generateAiLogo = false;
            } else {
              target.brand.storefrontPhotoUrl = finalUrl;
            }
          },
          undefined,
          owner,
        );
        onProfileUpdated?.(snap);
      }

      showToast({
        type: 'success',
        message:
          slot === 'logo'
            ? 'Logo enviada grátis (0 créditos)!'
            : 'Foto da frente da loja salva grátis (0 créditos)!',
        durationMs: 2500,
      });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleXlsxFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSubmitting(true);
    setStepError('');
    try {
      const parsed = await parseSpreadsheetProducts(file);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setStepError('Nenhum item válido encontrado na planilha.');
        return;
      }

      const snap = await updateBusinessProfile(
        (target) => {
          applyDraftFieldsToTarget(target);
          const imported: CatalogProduct[] = parsed.map((p, idx) => ({
            ...p,
            id: p.id || `item-${Date.now().toString(36)}-${idx + 1}`,
            sku: p.sku || `ITEM-${idx + 1}`,
            itemType: normalizeSpreadsheetItemType({
              rawType: p.itemType,
              name: p.name,
              category: p.category,
              description: p.description,
              defaultBusinessModel: draft.businessModel,
              sourceHint: 'xlsx-onboarding',
            }),
            // Sem imagem importada = mantém vazio (#F1F5F9 cinza neutro no renderer, 0 cr)
            imageUrl: p.imageUrl && p.imageUrl.trim() ? p.imageUrl.trim() : '',
            approvedAsset: true,
            active: true,
            updatedAt: new Date().toISOString(),
          }));
          target.catalog.products = imported;
        },
        undefined,
        owner,
      );
      savedProductInSessionRef.current = true;
      onProfileUpdated?.(snap);
      showToast({
        type: 'success',
        message: `${parsed.length} item(ns) importado(s) de "${file.name}".`,
        durationMs: 2800,
      });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Falha ao importar planilha.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddQuickCatalogItem = async () => {
    if (!productNameValid) {
      setStepError('Informe o nome do produto ou serviço (mínimo 2 letras).');
      return;
    }
    if (productPriceCents <= 0) {
      setStepError('Informe um preço maior que zero (ex.: 65,00).');
      return;
    }

    setSubmitting(true);
    setStepError('');
    try {
      const trimmedName = draft.productName.trim();
      const trimmedCategory = draft.productCategory.trim() || 'Geral';
      const stockNum = Number.parseInt(draft.productStockInput.replace(/\D/g, ''), 10);

      const snap = await updateBusinessProfile(
        (target) => {
          applyDraftFieldsToTarget(target);
          const nextIndex = target.catalog.products.length + 1;
          const internalCode = `ITEM-${nextIndex}-${Date.now().toString(36).toUpperCase()}`;
          const newProduct: CatalogProduct = {
            id: `item-${Date.now().toString(36)}-${nextIndex}`,
            sku: internalCode,
            name: trimmedName,
            category: trimmedCategory,
            description:
              draft.productDescription.trim() ||
              `${trimmedName} com atendimento direto pelo WhatsApp.`,
            priceCents: productPriceCents,
            variation: draft.productVariation.trim() || 'Padrão',
            stock: Number.isFinite(stockNum) ? Math.max(0, stockNum) : 20,
            active: true,
            itemType: quickItemType,
            imageUrl: draft.productImageUrl.trim(),
            approvedAsset: true,
            updatedAt: new Date().toISOString(),
          };
          target.catalog.products.push(newProduct);
        },
        undefined,
        owner,
      );
      savedProductInSessionRef.current = true;
      onProfileUpdated?.(snap);
      updateDraft({
        productName: '',
        productPriceInput: '',
        productDescription: '',
        productImageUrl: '',
      });
      showToast({
        type: 'success',
        message: `"${trimmedName}" adicionado!`,
        durationMs: 2200,
      });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Falha ao salvar item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepNext = async () => {
    setStepError('');
    if (draft.currentStep === 1) {
      if (!businessNameValid) {
        setStepError('Informe o nome da loja (pelo menos 2 letras).');
        return;
      }
      if (!phoneValid) {
        setStepError('Informe um WhatsApp válido com DDD (ex.: (11) 98765-4321).');
        return;
      }
    }
    if (draft.currentStep === 2) {
      setQuickItemType(draft.businessModel === 'servicos' ? 'servico_agendado' : 'produto_fisico');
    }
    if (draft.currentStep === 3 && !draft.businessDescription.trim() && draft.differentials.length === 0) {
      setStepError('Descreva em uma frase o que você faz ou marque pelo menos 1 diferencial.');
      return;
    }
    if (draft.currentStep === 7 && activeProducts.length === 0) {
      if (!quickProductValid) {
        setStepError('Importe sua planilha .XLSX/.CSV ou cadastre pelo menos 1 item acima.');
        return;
      }
      await handleAddQuickCatalogItem();
    }
    if (draft.currentStep < 8) {
      updateDraft({ currentStep: (draft.currentStep + 1) as OnboardingWizardStep });
    }
  };

  const handleAiAutofill = async () => {
    if (!businessNameValid) {
      setStepError('Digite o nome da sua loja primeiro para preencher com IA.');
      return;
    }
    setAutofilling(true);
    setStepError('');
    try {
      const res = await authenticatedFetch(
        '/api/onboarding/ai-autofill',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: draft.businessName.trim(),
            segment: draft.segment,
            productsSample: activeProducts.slice(0, 8).map((p) => ({
              name: p.name,
              category: p.category,
              priceCents: p.priceCents,
            })),
          }),
        },
        owner,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.suggestion) {
        throw new Error(data?.error || 'Não foi possível preencher com IA agora.');
      }
      const s = data.suggestion;
      updateDraft({
        businessModel: s.businessModel || draft.businessModel,
        businessDescription: s.businessDescription || draft.businessDescription,
        differentials: Array.isArray(s.differentials) && s.differentials.length > 0 ? s.differentials.slice(0, 3) : draft.differentials,
        experienceGoal: s.experienceGoal || draft.experienceGoal,
        primaryColor: s.primaryColor || draft.primaryColor,
        fontStyle: (s.fontStyle as OnboardingFontStyle) || draft.fontStyle,
      });
      setAiSuggestedBadge(true);
      showToast({
        type: 'success',
        message: 'Sugestões preenchidas com IA (0 créditos)! Revise conforme seu negócio.',
        durationMs: 3200,
      });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Erro ao preencher com IA.');
    } finally {
      setAutofilling(false);
    }
  };

  const handleCompleteWizard = async () => {
    if (!businessNameValid || !phoneValid) {
      setStepError('Revise o nome da loja e o WhatsApp no Passo 1.');
      updateDraft({ currentStep: 1 });
      return;
    }
    if (!deliveryValid) {
      setStepError('Ative pelo menos Entrega ou Retirada na loja.');
      return;
    }
    if (!pixCheck.valid) {
      setStepError(pixCheck.reason || 'Chave Pix inválida.');
      return;
    }

    setSubmitting(true);
    setStepError('');
    const clientJobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setJobProgress({ stage: 'reading_catalog', label: 'Lendo catálogo' });

    let pollInFlight = false;
    let pollingStopped = false;
    const pollTimer =
      typeof window !== 'undefined'
        ? window.setInterval(async () => {
            if (pollInFlight || pollingStopped) return;
            pollInFlight = true;
            try {
              const pRes = await authenticatedFetch(`/api/store-molde/job/${encodeURIComponent(clientJobId)}`, { method: 'GET' }, owner);
              if (!pollingStopped && pRes.ok) {
                const pData = await pRes.json().catch(() => null);
                if (pData?.job?.stage) {
                  setJobProgress({ stage: String(pData.job.stage), label: String(pData.job.label || '') });
                }
              }
            } catch {} finally {
              pollInFlight = false;
            }
          }, 650)
        : null;
    pollTimerRef.current = pollTimer;

    try {
      const totalActiveAfter = activeProducts.length;
      const canPublishNow =
        draft.publishOnComplete &&
        (totalActiveAfter >= 1 || savedProductInSessionRef.current) &&
        phoneValid;

      const snap = await updateBusinessProfile(
        (target) => {
          applyDraftFieldsToTarget(target);
          target.onboarding.storeGenerated = true;
          target.catalog.products = target.catalog.products.map((item) => ({
            ...item,
            itemType:
              item.itemType ||
              normalizeSpreadsheetItemType({
                name: item.name,
                category: item.category,
                description: item.description,
                defaultBusinessModel: draft.businessModel,
              }),
            approvedAsset: true,
          }));
          if (canPublishNow) {
            target.publishedStore.published = true;
          }
        },
        canPublishNow ? { publish: true } : undefined,
        owner,
      );

      let finalSnap = snap;
      const genRes = await authenticatedFetch(
        '/api/store-molde/generate-full',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: snap.profile, forceRegenerate: true, clientJobId }),
        },
        owner,
      );

      if (genRes.status === 402) {
        cancelPendingDraftWrite();
        writeExpressFichaDraft(draft, owner);
        const errPayload = await genRes.json().catch(() => ({
          error: 'Saldo de créditos insuficiente para gerar a página com IA.',
          required: 30,
        }));
        onProfileUpdated?.(snap);
        setStepError(
          errPayload?.error ||
            'Sua ficha e uploads grátis foram salvos, mas seu saldo de créditos não atingiu os 30 cr da geração com IA.',
        );
        return;
      }

      if (!genRes.ok) {
        const errPayload = await genRes.json().catch(() => null);
        const errMsg =
          errPayload?.error ||
          'Não foi possível gerar sua vitrine agora. Seus dados continuam salvos — tente novamente.';
        cancelPendingDraftWrite();
        writeExpressFichaDraft(draft, owner);
        onProfileUpdated?.(snap);
        setStepError(errMsg);
        showToast({
          type: 'error',
          title: 'Falha ao gerar vitrine',
          message: errMsg,
          durationMs: 4500,
        });
        return;
      }

      finalSnap = await loadBusinessProfile(owner);

      cancelPendingDraftWrite();
      clearExpressFichaDraft(owner);
      setIsDirty(false);
      onProfileUpdated?.(finalSnap);

      const published = Boolean(finalSnap.profile.publishedStore.published);
      showToast({
        type: 'success',
        title: published ? 'Vitrine exclusiva criada!' : 'Configuração concluída!',
        message: 'Sua página interativa, catálogo e Pasta Molde foram gerados.',
        durationMs: 3200,
      });

      onOpenChange(false);
      onCompleted?.(finalSnap, { published });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a criação. Tente novamente.';
      setStepError(message);
    } finally {
      pollingStopped = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (pollTimerRef.current === pollTimer) {
        pollTimerRef.current = null;
      }
      setJobProgress(null);
      setSubmitting(false);
    }
  };

  const togglePaymentMethod = (method: AcceptedPaymentMethod) => {
    const exists = draft.acceptedMethods.includes(method);
    const next = exists
      ? draft.acceptedMethods.filter((m) => m !== method)
      : [...draft.acceptedMethods, method];
    if (next.length === 0) return;
    updateDraft({ acceptedMethods: next });
  };

  const activeHelpTopic: OnboardingHelpTopic =
    draft.currentStep <= 6 ? 'ficha' : draft.currentStep === 7 ? 'product' : 'pix';

  return (
    <>
      <ModalContainer
        open={open}
        onOpenChange={handleRequestClose}
        role="dialog"
        maxWidth="lg"
        mobileHeight="95%"
        layoutId={open ? FICHA_MODAL_LAYOUT_ID : undefined}
        preventCloseWhileSubmitting={submitting || uploadingSlot !== null}
        title={
          <div className="flex flex-wrap items-center justify-between gap-2 pr-2">
            <span>Configurar Experiência da Loja</span>
            <button
              type="button"
              onClick={() => setHelpTopic(activeHelpTopic)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <HelpCircle className="size-4" aria-hidden="true" />
              <span>Ajuda</span>
            </button>
          </div>
        }
        description={`Passo ${draft.currentStep} de 8 · ${STEP_LABELS[draft.currentStep]} · Seus dados ficam salvos enquanto você avança.`}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {draft.currentStep > 1 ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  disabled={submitting || uploadingSlot !== null}
                  leftIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
                  onClick={() =>
                    updateDraft({
                      currentStep: (draft.currentStep - 1) as OnboardingWizardStep,
                    })
                  }
                >
                  Voltar
                </ActionButton>
              ) : null}

              <ActionButton
                variant="secondary"
                size={44}
                disabled={submitting || uploadingSlot !== null}
                onClick={() => setSaveDraftModalOpen(true)}
              >
                Salvar e sair
              </ActionButton>
            </div>

            {draft.currentStep < 8 ? (
              <ActionButton
                variant="primaryGradient"
                size={48}
                disabled={!canAdvanceCurrentStep || submitting || uploadingSlot !== null}
                isLoading={submitting}
                loadingText="Salvando..."
                rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
                onClick={handleStepNext}
                data-testid="onb-next-btn"
                className="w-full sm:w-auto"
              >
                Continuar
              </ActionButton>
            ) : (
              <ActionButton
                variant="success"
                size={48}
                disabled={!canAdvanceCurrentStep || submitting || uploadingSlot !== null}
                isLoading={submitting}
                loadingText="Criando página exclusiva..."
                leftIcon={<Rocket className="size-4" aria-hidden="true" />}
                onClick={handleCompleteWizard}
                data-testid="onb-submit-generate"
                className="w-full sm:w-auto whitespace-nowrap"
              >
                Criar Minha Loja (-30 cr)
              </ActionButton>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          {/* Progress indicator across 8 micro-screens */}
          <div className="space-y-2" aria-label="Progresso em 8 passos">
            <div className="grid grid-cols-8 gap-1.5">
              {([1, 2, 3, 4, 5, 6, 7, 8] as OnboardingWizardStep[]).map((stepNum) => {
                const isActive = draft.currentStep === stepNum;
                const isDone = draft.currentStep > stepNum;
                return (
                  <button
                    key={stepNum}
                    type="button"
                    disabled={submitting || uploadingSlot !== null}
                    onClick={() => {
                      if (stepNum <= draft.currentStep || (businessNameValid && phoneValid)) {
                        updateDraft({ currentStep: stepNum });
                      }
                    }}
                    title={`${stepNum}. ${STEP_LABELS[stepNum]}`}
                    className={cn(
                      'group flex min-w-0 w-full flex-col items-start gap-1 overflow-hidden rounded-lg px-1 py-1 text-left transition-colors',
                      isActive ? 'text-[#1E3A8A]' : 'text-[#64748B]',
                    )}
                  >
                    <span
                      className={cn(
                        'h-2 w-full rounded-full transition-colors',
                        isActive
                          ? 'bg-[#2563EB]'
                          : isDone
                            ? 'bg-[#059669]'
                            : 'bg-[#E2E8F0]',
                      )}
                    />
                    <span className="hidden w-full truncate text-[10px] font-semibold sm:block">
                      {stepNum}. {STEP_LABELS[stepNum]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {stepError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800"
            >
              {stepError}
            </div>
          ) : null}

          {submitting && jobProgress ? (
            <div
              data-testid="onb-4stage-progress"
              className="rounded-2xl border border-blue-200 bg-[#EFF6FF] p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs font-bold text-[#1E3A8A]">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-4 animate-pulse" />
                  <span>{jobProgress.label || 'Gerando sua vitrine...'}</span>
                </span>
                <span>4 etapas</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-[11px] font-semibold">
                {[
                  { id: 'reading_catalog', title: '1. Catálogo' },
                  { id: 'designing_experience', title: '2. Experiência' },
                  { id: 'generating_images', title: '3. Imagens' },
                  { id: 'publishing', title: '4. Publicando' },
                ].map((st, idx, arr) => {
                  const order = arr.findIndex((x) => x.id === jobProgress.stage);
                  const reached = jobProgress.stage === 'completed' || (order >= 0 && idx <= order);
                  return (
                    <div
                      key={st.id}
                      className={cn(
                        'rounded-lg px-2 py-1 text-center transition-colors',
                        reached ? 'bg-[#2563EB] text-white' : 'bg-white text-slate-500 border border-blue-100',
                      )}
                    >
                      {st.title}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* TELA 1/8: Identidade & WhatsApp */}
          {draft.currentStep === 1 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Qual é o nome e o WhatsApp da sua loja?</h3>
                <p className="text-sm text-[#64748B]">
                  Vamos usar essas informações para identificar sua marca e receber seus pedidos.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">Nome da loja *</span>
                  <input
                    type="text"
                    data-testid="onb-business-name"
                    value={draft.businessName}
                    onChange={(e) => updateDraft({ businessName: e.target.value })}
                    placeholder="Ex.: AuMiau Pet Estética, Doce Ateliê, Studio Leme"
                    className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">Segmento principal *</span>
                  <select
                    data-testid="onb-segment"
                    value={draft.segment}
                    onChange={(e) => updateDraft({ segment: e.target.value })}
                    className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {SEGMENT_OPTIONS.map((seg) => (
                      <option key={seg} value={seg}>
                        {seg}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">WhatsApp com DDD *</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    data-testid="onb-whatsapp"
                    value={draft.phoneInput}
                    onChange={(e) =>
                      updateDraft({ phoneInput: formatBrazilPhoneDisplay(e.target.value) })
                    }
                    placeholder="(11) 98765-4321"
                    className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 p-3.5">
                <div className="flex items-center gap-2">
                  <ImagePlus className="size-4 text-fuchsia-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">Preencher a partir do Instagram</p>
                    <p className="text-xs text-[#64748B]">Lemos apenas informações públicas e mostramos sugestões antes de aplicar.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    data-testid="onb-instagram-input"
                    value={draft.instagramHandle}
                    onChange={(event) => updateDraft({ instagramHandle: event.target.value })}
                    placeholder="@sualoja ou instagram.com/sualoja"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-fuchsia-200 bg-white px-3.5 text-sm text-[#0F172A] focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                  />
                  <ActionButton
                    type="button"
                    variant="softBlue"
                    size={44}
                    data-testid="onb-instagram-analyze-btn"
                    disabled={!draft.instagramHandle.trim() || instagramAnalyzing}
                    isLoading={instagramAnalyzing}
                    loadingText="Analisando..."
                    onClick={() => void handleAnalyzeInstagram()}
                  >
                    Analisar Instagram
                  </ActionButton>
                </div>
                {instagramSuggestion ? (
                  <div data-testid="onb-instagram-suggestions" className="rounded-xl border border-fuchsia-200 bg-white p-3 text-xs text-slate-600">
                    <p className="font-bold text-slate-900">Sugestões encontradas para {instagramSuggestion.handle}</p>
                    <p className="mt-1 line-clamp-3">{instagramSuggestion.fullName || 'Nome não informado'} · {instagramSuggestion.bio || 'Bio não disponível'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={applyInstagramSuggestion} className="rounded-lg bg-fuchsia-700 px-3 py-2 font-bold text-white">Aplicar sugestões</button>
                      <button type="button" onClick={() => setInstagramSuggestion(null)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-700">Descartar</button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Atalho opcional na Tela 1: Planilha (.XLSX/.CSV) + Preencher tudo com IA (0 cr) */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0F172A] hover:bg-slate-100">
                  <FileSpreadsheet className="size-4 text-[#0B4DB8]" aria-hidden="true" />
                  <span>Importar .XLSX/.CSV agora (opcional)</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    data-testid="onb-step1-xlsx-input"
                    onChange={handleXlsxFileSelect}
                    className="sr-only"
                  />
                </label>

                <ActionButton
                  type="button"
                  variant="softBlue"
                  size={44}
                  data-testid="onb-ai-autofill-btn"
                  disabled={!businessNameValid || autofilling || submitting}
                  isLoading={autofilling}
                  loadingText="Sugerindo..."
                  leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
                  onClick={() => void handleAiAutofill()}
                >
                  Preencher tudo com IA (0 cr)
                </ActionButton>
              </div>
              {aiSuggestedBadge ? (
                <p className="text-xs font-semibold text-emerald-700" data-testid="onb-ai-suggested-banner">
                  ✓ Campos iniciais preenchidos com base no seu negócio — sinta-se à vontade para ajustar nas próximas telas.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* TELA 2/8: Modelo de Venda / Atendimento */}
          {draft.currentStep === 2 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Como seus clientes compram com você?</h3>
                <p className="text-sm text-[#64748B]">
                  Isso orienta o jeito da página funcionar: carrinho rápido, agendador de serviço ou montador de combo.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {BUSINESS_MODEL_OPTIONS.map((opt) => {
                  const selected = draft.businessModel === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`onb-model-${opt.id}`}
                      onClick={() => updateDraft({ businessModel: opt.id })}
                      className={cn(
                        'flex flex-col justify-between rounded-2xl border p-4 text-left transition-all',
                        selected
                          ? 'border-[#2563EB] bg-[#EFF6FF] shadow-sm ring-2 ring-[#2563EB]/20'
                          : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]',
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#334155]">
                            {opt.badge}
                          </span>
                          {selected ? (
                            <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#2563EB] text-white">
                              <Check className="size-3.5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-bold text-[#0F172A]">{opt.title}</p>
                        <p className="text-xs leading-relaxed text-[#475569]">{opt.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* TELA 3/8: Proposta & Diferenciais Reais */}
          {draft.currentStep === 3 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">O que torna seu atendimento especial?</h3>
                <p className="text-sm text-[#64748B]">
                  Conte com suas palavras — sem textos genéricos. A IA usa apenas o que você confirmar aqui.
                </p>
              </div>

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between gap-2 text-sm font-semibold text-[#0F172A]">
                  <span>Em uma frase simples, o que você faz? *</span>
                  {aiSuggestedBadge && draft.businessDescription.trim() ? (
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
                      Sugerido pela IA
                    </span>
                  ) : null}
                </span>
                <textarea
                  rows={3}
                  data-testid="onb-description"
                  value={draft.businessDescription}
                  onChange={(e) => updateDraft({ businessDescription: e.target.value })}
                  placeholder="Ex.: Banho e tosa sem gaiolas para cães e gatos, com hora marcada e água morna."
                  className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0F172A]">
                    Escolha até 3 diferenciais reais ({draft.differentials.length}/3)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ONBOARDING_DIFFERENTIAL_CHIPS.map((chip) => {
                    const active = draft.differentials.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => handleToggleDifferential(chip)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                          active
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC]',
                        )}
                      >
                        {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                        <span>{chip}</span>
                      </button>
                    );
                  })}
                  {draft.differentials
                    .filter((d) => !(ONBOARDING_DIFFERENTIAL_CHIPS as readonly string[]).includes(d))
                    .map((custom) => (
                      <button
                        key={custom}
                        type="button"
                        onClick={() => handleToggleDifferential(custom)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#2563EB] bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#1D4ED8]"
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        <span>{custom}</span>
                      </button>
                    ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    data-testid="onb-differential-custom"
                    value={customDiffInput}
                    onChange={(e) => setCustomDiffInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomDifferential();
                      }
                    }}
                    placeholder="Outro diferencial seu (ex.: Atendimento bilíngue, Taxa zero)..."
                    className="h-10 flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                  />
                  <ActionButton
                    variant="secondary"
                    size={44}
                    leftIcon={<Plus className="size-4" aria-hidden="true" />}
                    onClick={handleAddCustomDifferential}
                  >
                    Adicionar
                  </ActionButton>
                </div>
              </div>
            </div>
          ) : null}

          {/* TELA 4/8: Logo & Foto da Frente da Loja (0 créditos!) */}
          {draft.currentStep === 4 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-[#0F172A]">Envie sua logo e a foto do espaço</h3>
                  <p className="text-sm text-[#64748B]">
                    Subir suas fotos reais custa <strong className="text-[#059669]">0 créditos</strong> e economiza créditos de imagem da IA.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Upload 0 cr · Grátis
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Slot Esquerdo: Logo */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#0F172A]">1. Logo da Marca</span>
                      <span className="text-[11px] font-semibold text-[#059669]">0 cr</span>
                    </div>

                    <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-white p-3">
                      {draft.logoUrl ? (
                        <img
                          src={draft.logoUrl}
                          alt="Prévia da logo enviada"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-xs text-[#64748B]">
                          <ImagePlus className="mx-auto mb-1.5 size-7 text-[#94A3B8]" aria-hidden="true" />
                          <span>PNG ou JPG da sua logo</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9]">
                        <Upload className="size-3.5" aria-hidden="true" />
                        <span>{uploadingSlot === 'logo' ? 'Enviando...' : draft.logoUrl ? 'Trocar logo' : 'Enviar logo (0 cr)'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          data-testid="onb-upload-logo"
                          className="sr-only"
                          disabled={uploadingSlot !== null}
                          onChange={(e) => handleUploadFreeAsset('logo', e)}
                        />
                      </label>
                      {draft.logoUrl ? (
                        <button
                          type="button"
                          onClick={() => updateDraft({ logoUrl: '' })}
                          className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          <span>Remover</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[#E2E8F0] bg-white p-2.5 text-xs text-[#334155]">
                    <input
                      type="checkbox"
                      checked={draft.generateAiLogo && !draft.logoUrl}
                      disabled={Boolean(draft.logoUrl)}
                      onChange={(e) => updateDraft({ generateAiLogo: e.target.checked })}
                      className="mt-0.5 size-4 rounded border-[#CBD5E1] text-[#2563EB]"
                    />
                    <span>Não tenho logo ainda — gerar emblema minimalista no conjunto inicial</span>
                  </label>
                </div>

                {/* Slot Direito: Foto da Frente da Loja */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#0F172A]">2. Frente da Loja / Espaço</span>
                      <span className="text-[11px] font-semibold text-[#059669]">0 cr</span>
                    </div>

                    <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#CBD5E1] bg-white">
                      {draft.storefrontPhotoUrl && !draft.noPhysicalLocation ? (
                        <img
                          src={draft.storefrontPhotoUrl}
                          alt="Prévia da frente da loja"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="p-3 text-center text-xs text-[#64748B]">
                          <Building2 className="mx-auto mb-1.5 size-7 text-[#94A3B8]" aria-hidden="true" />
                          <span>
                            {draft.noPhysicalLocation
                              ? 'Atendimento online selecionado'
                              : 'Fachada, bancada ou ambiente real'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F1F5F9]">
                        <Upload className="size-3.5" aria-hidden="true" />
                        <span>
                          {uploadingSlot === 'storefront'
                            ? 'Enviando...'
                            : draft.storefrontPhotoUrl
                              ? 'Trocar foto'
                              : 'Enviar foto (0 cr)'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          data-testid="onb-upload-storefront"
                          className="sr-only"
                          disabled={uploadingSlot !== null}
                          onChange={(e) => handleUploadFreeAsset('storefront', e)}
                        />
                      </label>
                      {draft.storefrontPhotoUrl ? (
                        <button
                          type="button"
                          onClick={() => updateDraft({ storefrontPhotoUrl: '' })}
                          className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          <span>Remover</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[#E2E8F0] bg-white p-2.5 text-xs text-[#334155]">
                    <input
                      type="checkbox"
                      checked={draft.noPhysicalLocation}
                      onChange={(e) => updateDraft({ noPhysicalLocation: e.target.checked })}
                      className="mt-0.5 size-4 rounded border-[#CBD5E1] text-[#2563EB]"
                    />
                    <span>Atendo só online / não tenho loja física aberta ao público</span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {/* TELA 5/8: Experiência Interativa & Campanha */}
          {draft.currentStep === 5 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">O que ajuda seu cliente antes de chamar no WhatsApp?</h3>
                <p className="text-sm text-[#64748B]">
                  A IA cria um bloco interativo real com preços da sua planilha (simulador, montador de combo ou comparador).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {ONBOARDING_EXPERIENCE_PRESETS.map((preset) => {
                  const isChosen = draft.experienceGoal.trim() === preset.prompt;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => updateDraft({ experienceGoal: preset.prompt })}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all',
                        isChosen
                          ? 'border-[#2563EB] bg-[#EFF6FF] ring-2 ring-[#2563EB]/20'
                          : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]',
                      )}
                    >
                      <p className="text-xs font-bold text-[#0F172A]">{preset.title}</p>
                      <p className="mt-1 text-xs text-[#64748B]">{preset.prompt}</p>
                    </button>
                  );
                })}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">
                  Descreva ou personalize o comportamento desejado
                </span>
                <textarea
                  rows={2}
                  data-testid="onb-experience-goal"
                  value={draft.experienceGoal}
                  onChange={(e) => updateDraft({ experienceGoal: e.target.value })}
                  placeholder="Ex.: Escolher o porte do pet (P/M/G), marcar extras como corte de unha e ver valor na hora."
                  className="w-full rounded-xl border border-[#CBD5E1] bg-white p-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">
                  Campanha ou destaque atual (opcional)
                </span>
                <input
                  type="text"
                  data-testid="onb-campaign-theme"
                  value={draft.campaignTheme}
                  onChange={(e) => updateDraft({ campaignTheme: e.target.value })}
                  placeholder="Ex.: Semana do Pet Limpo, Natal, Volta às Aulas (ou deixe vazio)"
                  className="h-11 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:outline-none"
                />
              </label>
            </div>
          ) : null}

          {/* TELA 6/8: Cor & Clima Visual */}
          {draft.currentStep === 6 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Qual a cor principal e o estilo da marca?</h3>
                <p className="text-sm text-[#64748B]">
                  Usamos essa paleta na página ao vivo e na Pasta Molde baixável para manter identidade própria.
                </p>
              </div>

              <div className="space-y-2.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[#0F172A]">
                  <Palette className="size-4 text-[#2563EB]" aria-hidden="true" />
                  <span>Cor de destaque</span>
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {ONBOARDING_COLOR_SWATCHES.map((swatch) => {
                    const active = draft.primaryColor.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => updateDraft({ primaryColor: swatch.hex })}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                          active
                            ? 'border-[#0F172A] bg-[#F8FAFC] ring-2 ring-[#0F172A]/15'
                            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]',
                        )}
                      >
                        <span
                          className="size-4 rounded-full border border-black/10"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <span>{swatch.label}</span>
                      </button>
                    );
                  })}

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155]">
                    <input
                      type="color"
                      data-testid="onb-color-picker"
                      value={draft.primaryColor}
                      onChange={(e) => updateDraft({ primaryColor: e.target.value })}
                      className="size-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="font-mono">{draft.primaryColor.toUpperCase()}</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-[#0F172A]">Estilo de leitura e acabamento</span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {FONT_STYLE_OPTIONS.map((font) => {
                    const active = draft.fontStyle === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => updateDraft({ fontStyle: font.id })}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-all',
                          active
                            ? 'border-[#2563EB] bg-[#EFF6FF] ring-2 ring-[#2563EB]/20'
                            : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]',
                        )}
                      >
                        <p className="text-xs font-bold text-[#0F172A]">{font.label}</p>
                        <p className="mt-0.5 text-[11px] text-[#64748B]">{font.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* TELA 7/8: Planilha .XLSX ou Item Manual (Cinza Neutro #F1F5F9) */}
          {draft.currentStep === 7 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Suba sua planilha .XLSX/.CSV ou adicione um item</h3>
                <p className="text-sm text-[#64748B]">
                  Produtos sem foto própria aparecem com cartão em <strong>cinza neutro (0 créditos)</strong> para você buscar fotos reais na internet depois, sem desperdiçar IA.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#0F172A]">Importar planilha do seu negócio</p>
                  <p className="text-xs text-[#64748B]">
                    Aceita .XLSX, .XLS ou .CSV · Separa automaticamente serviços e produtos.
                  </p>
                </div>

                <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0F172A] px-4 text-xs font-bold text-white hover:bg-[#1E293B]">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  <span>Selecionar Planilha</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    data-testid="onb-xlsx-input"
                    className="sr-only"
                    disabled={submitting}
                    onChange={handleXlsxFileSelect}
                  />
                </label>
              </div>

              {catalogBreakdown.total > 0 ? (
                <div
                  data-testid="onb-catalog-counts"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-semibold text-emerald-950"
                >
                  <span>
                    Catálogo carregado: <strong>{catalogBreakdown.total}</strong> item(ns) ·{' '}
                    {catalogBreakdown.services} Serviço(s) · {catalogBreakdown.products} Produto(s) ·{' '}
                    {catalogBreakdown.kits} Kit(s)/Sob Medida
                  </span>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#475569]">
                  {catalogBreakdown.total > 0 ? 'Ou adicionar mais um item rápido' : 'Ou cadastre 1 item rápido agora'}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs font-semibold text-[#334155]">Nome do produto ou serviço</span>
                    <input
                      type="text"
                      data-testid="onb-quick-item-name"
                      value={draft.productName}
                      onChange={(e) => updateDraft({ productName: e.target.value })}
                      placeholder="Ex.: Banho Porte Médio"
                      className="h-10 w-full rounded-xl border border-[#CBD5E1] px-3 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#334155]">Preço (R$)</span>
                    <input
                      type="text"
                      data-testid="onb-quick-item-price"
                      value={draft.productPriceInput}
                      onChange={(e) => updateDraft({ productPriceInput: e.target.value })}
                      placeholder="75,00"
                      className="h-10 w-full rounded-xl border border-[#CBD5E1] px-3 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#334155]">Tipo do item</span>
                    <select
                      value={quickItemType}
                      onChange={(e) => setQuickItemType(e.target.value as CatalogItemType)}
                      className="h-10 w-full rounded-xl border border-[#CBD5E1] bg-white px-2.5 text-sm text-[#0F172A]"
                    >
                      <option value="produto_fisico">Produto físico</option>
                      <option value="servico_agendado">Serviço / Atendimento</option>
                      <option value="kit_combo">Kit / Combo</option>
                      <option value="sob_medida">Sob medida / Encomenda</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-[#334155]">Categoria</span>
                    <input
                      type="text"
                      value={draft.productCategory}
                      onChange={(e) => updateDraft({ productCategory: e.target.value })}
                      placeholder="Geral"
                      className="h-10 w-full rounded-xl border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
                    />
                  </label>
                  <div className="flex items-end">
                    <ActionButton
                      variant="secondary"
                      size={44}
                      fullWidth
                      disabled={!quickProductValid || submitting}
                      onClick={handleAddQuickCatalogItem}
                      leftIcon={<Plus className="size-4" aria-hidden="true" />}
                      className="whitespace-nowrap px-3"
                    >
                      Adicionar item
                    </ActionButton>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* TELA 8/8: Pagamentos, Local & Gerar Página (-30 cr) */}
          {draft.currentStep === 8 ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Pagamento, entrega e revisão final</h3>
                <p className="text-sm text-[#64748B]">
                  Ao clicar em criar, a IA monta um layout inédito, escreve os textos reais do seu catálogo e gera no máximo 5 imagens WebP exclusivas.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                    <CreditCard className="size-3.5 text-[#2563EB]" aria-hidden="true" />
                    <span>Chave Pix (opcional)</span>
                  </span>
                  <input
                    type="text"
                    data-testid="onb-pix-key"
                    value={draft.pixKey}
                    onChange={(e) => updateDraft({ pixKey: e.target.value })}
                    placeholder="E-mail, celular, CPF/CNPJ ou aleatória"
                    className="h-10 w-full rounded-xl border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-xs font-bold text-[#0F172A]">Desconto no Pix</span>
                  <div className="flex gap-2">
                    {PIX_DISCOUNT_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => updateDraft({ pixDiscountPercent: pct })}
                        className={cn(
                          'h-10 flex-1 rounded-xl border text-xs font-bold',
                          draft.pixDiscountPercent === pct
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                            : 'border-[#CBD5E1] bg-white text-[#334155]',
                        )}
                      >
                        {pct === 0 ? 'Sem desc.' : `${pct}% OFF`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHOD_OPTIONS.map((m) => {
                  const checked = draft.acceptedMethods.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => togglePaymentMethod(m.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold',
                        checked
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'border-[#CBD5E1] bg-white text-[#475569]',
                      )}
                    >
                      {checked ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#E2E8F0] p-3">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                    <Truck className="size-3.5 text-[#2563EB]" aria-hidden="true" />
                    <span>Como o cliente recebe?</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft({ deliveryEnabled: !draft.deliveryEnabled })}
                      className={cn(
                        'flex-1 rounded-lg border px-2.5 py-2 text-xs font-semibold',
                        draft.deliveryEnabled
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'border-[#CBD5E1] bg-white text-[#475569]',
                      )}
                    >
                      Entrega
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraft({ pickupEnabled: !draft.pickupEnabled })}
                      className={cn(
                        'flex-1 rounded-lg border px-2.5 py-2 text-xs font-semibold',
                        draft.pickupEnabled
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'border-[#CBD5E1] bg-white text-[#475569]',
                      )}
                    >
                      Retirada / No local
                    </button>
                  </div>
                </div>

                {!draft.noPhysicalLocation ? (
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                      <MapPin className="size-3.5 text-[#2563EB]" aria-hidden="true" />
                      <span>Endereço e Horário</span>
                    </span>
                    <input
                      type="text"
                      value={draft.businessAddress}
                      onChange={(e) => updateDraft({ businessAddress: e.target.value })}
                      placeholder="Rua, número e bairro"
                      className="mb-2 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-xs text-[#0F172A]"
                    />
                    <input
                      type="text"
                      value={draft.businessHours}
                      onChange={(e) => updateDraft({ businessHours: e.target.value })}
                      placeholder="Seg a Sáb · 09h às 18h"
                      className="h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-xs text-[#0F172A]"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                      <CalendarClock className="size-3.5 text-[#2563EB]" aria-hidden="true" />
                      <span>Horário de atendimento</span>
                    </span>
                    <input
                      type="text"
                      value={draft.businessHours}
                      onChange={(e) => updateDraft({ businessHours: e.target.value })}
                      placeholder="Seg a Sex · 09h às 19h"
                      className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-xs text-[#0F172A]"
                    />
                  </label>
                )}
              </div>

              {/* Compact Summary Card */}
              <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF]/60 p-3.5 text-xs text-[#1E293B]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#1E3A8A]">
                    <Sparkles className="size-4" aria-hidden="true" />
                    <span>Resumo para a IA Compositora ({draft.businessName})</span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 font-semibold"
                    style={{ color: draft.primaryColor }}
                  >
                    <Layers className="size-3" aria-hidden="true" />
                    <span>{draft.businessModel}</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#475569]">
                  <span>
                    <Package className="mr-1 inline size-3" aria-hidden="true" />
                    {catalogBreakdown.total} itens no catálogo ({catalogBreakdown.services} serv. / {catalogBreakdown.products} prod.)
                  </span>
                  <span>·</span>
                  <span>
                    <Store className="mr-1 inline size-3" aria-hidden="true" />
                    Logo: {draft.logoUrl ? 'Enviada (0 cr)' : draft.generateAiLogo ? 'Gerar com IA' : 'Não'}
                  </span>
                  <span>·</span>
                  <span>Fachada: {draft.storefrontPhotoUrl ? 'Enviada (0 cr)' : draft.noPhysicalLocation ? 'Online' : 'IA gera ambiente'}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </ModalContainer>

      <SaveDraftModal
        open={saveDraftModalOpen}
        onOpenChange={setSaveDraftModalOpen}
        draftSummary={draft}
        isSaving={submitting}
        onSaveDraftAndExit={() => {
          cancelPendingDraftWrite();
          writeExpressFichaDraft(draft, owner);
          setSaveDraftModalOpen(false);
          onOpenChange(false);
        }}
        onContinueEditing={() => setSaveDraftModalOpen(false)}
        onRequestDiscard={() => {
          setSaveDraftModalOpen(false);
          setConfirmExitModalOpen(true);
        }}
      />

      <ConfirmExitModal
        open={confirmExitModalOpen}
        onOpenChange={setConfirmExitModalOpen}
        onConfirmExit={() => {
          cancelPendingDraftWrite();
          clearExpressFichaDraft(owner);
          setConfirmExitModalOpen(false);
          onOpenChange(false);
        }}
        onCancelExit={() => setConfirmExitModalOpen(false)}
      />

      <ContextualHelpModal
        open={helpTopic !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setHelpTopic(null);
        }}
        topic={helpTopic ?? 'general'}
      />
    </>
  );
}
