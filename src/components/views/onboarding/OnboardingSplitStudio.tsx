import * as React from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileSpreadsheet,
  ImagePlus,
  MessageCircle,
  Package,
  Rocket,
  RotateCcw,
  Send,
  Sparkles,
  Store,
  Upload,
  X,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  buildDefaultMensagemMolde,
  formatCurrencyBRL,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
  type CatalogProduct,
} from '@/schemas/profile.schema';
import { sanitizeFormulaV9Document } from '@/schemas/formula-v9.schema';
import { buildNeutralFallbackV9Document } from '../../../../shared/formula-ir/neutral-fallback-v9.mjs';
import {
  analyzeInstagramProfile,
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { authenticatedFetch } from '@/services/supabase-client';
import { FormulaTreeRenderer } from '@/components/views/storefront/FormulaTreeRenderer';
import { UniversalCatalogXlsxModal } from '@/components/views/storefront/UniversalCatalogXlsxModal';
import { extractBrandPalette, contrastRatio } from '@/utils/logoColorExtractor';
import {
  findModelTemplateForSegment,
  getVariationPresetsForCategory,
  parseQuickPastedCatalogText,
} from '@/utils/variationPresets';
import {
  buildDraftFromProfile,
  clearExpressFichaDraft,
  createProductPlaceholderSvgDataUri,
  formatBrazilPhoneDisplay,
  formatCentsToInputBrl,
  parsePriceBrlToCents,
  readExpressFichaDraft,
  SEGMENT_OPTIONS,
  writeExpressFichaDraft,
  type ExpressFichaDraft,
  type OnboardingDeliveryMode,
  type OnboardingFontStyle,
  type OnboardingPaymentPolicy,
  type OnboardingVisualMood,
  type OnboardingWizardStep,
} from './onboarding-helpers';

export interface OnboardingSplitStudioProps {
  profile: BusinessProfile;
  owner?: string;
  onStorePublished?: (snap: ProfileSnapshot) => void;
  onConnectWhatsapp?: () => void;
  onOpenExpressWizard?: (step?: OnboardingWizardStep) => void;
}

const VISUAL_MOOD_OPTIONS: ReadonlyArray<{
  id: OnboardingVisualMood;
  label: string;
  subtitle: string;
  fontStyle: OnboardingFontStyle;
  tone: 'consultivo' | 'direto' | 'proximo';
}> = [
  {
    id: 'boutique',
    label: 'Boutique Limpa',
    subtitle: 'Editorial elegante e respirável',
    fontStyle: 'editorial_serif',
    tone: 'consultivo',
  },
  {
    id: 'direct',
    label: 'Oferta Direta',
    subtitle: 'Foco em preço e conversão rápida',
    fontStyle: 'clean_geometric',
    tone: 'direto',
  },
  {
    id: 'warm',
    label: 'Artesanal Acolhedor',
    subtitle: 'Calor humano e proximidade',
    fontStyle: 'modern_sans',
    tone: 'proximo',
  },
];

const DELIVERY_PILLS: ReadonlyArray<{ id: OnboardingDeliveryMode; label: string }> = [
  { id: 'pickup', label: 'Retirada no local' },
  { id: 'local', label: 'Entrega local' },
  { id: 'national', label: 'Correios / Brasil' },
];

const PAYMENT_POLICY_PILLS: ReadonlyArray<{ id: OnboardingPaymentPolicy; label: string }> = [
  { id: 'pix_discount', label: 'Pix com desconto' },
  { id: 'on_delivery', label: 'Paga na entrega' },
  { id: 'deposit_50', label: 'Sinal 50% encomenda' },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
}

function splitToWizardStep(step: 1 | 2 | 3): OnboardingWizardStep {
  if (step === 2) return 7;
  if (step === 3) return 8;
  return 1;
}

export function OnboardingSplitStudio({
  profile,
  owner,
  onStorePublished,
  onConnectWhatsapp,
}: OnboardingSplitStudioProps) {
  const { showToast } = useToast();

  const [draft, setDraft] = React.useState<ExpressFichaDraft>(() => {
    const saved = readExpressFichaDraft(owner);
    if (saved) return saved;
    return buildDraftFromProfile(profile, 1);
  });

  const activeStep: 1 | 2 | 3 =
    draft.splitStep === 2 || draft.splitStep === 3 ? draft.splitStep : 1;

  const [previewTab, setPreviewTab] = React.useState<'vitrine' | 'sofia'>('vitrine');
  const [mobilePreviewOpen, setMobilePreviewOpen] = React.useState(false);
  const [xlsxModalOpen, setXlsxModalOpen] = React.useState(false);
  const [pastePanelOpen, setPastePanelOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState('');
  const [pasteBusy, setPasteBusy] = React.useState(false);
  const [phoneError, setPhoneError] = React.useState('');
  const [lastTestOiUrl, setLastTestOiUrl] = React.useState('');
  const [greetingsOpen, setGreetingsOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [editingQuickIdx, setEditingQuickIdx] = React.useState(0);
  const isSelfWritingRef = React.useRef(false);

  // Estado do Simulador da Sofia no Painel Direito
  const [sofiaInput, setSofiaInput] = React.useState('');
  const [sofiaSending, setSofiaSending] = React.useState(false);
  const [sofiaMessages, setSofiaMessages] = React.useState<
    Array<{ id: string; role: 'customer' | 'sofia'; text: string }>
  >([
    {
      id: 'welcome-bot',
      role: 'sofia',
      text: 'Oi! Sou a Sofia da sua loja. Teste abaixo uma das 3 perguntas comuns para ver como respondo seus clientes.',
    },
  ]);

  const updateDraft = React.useCallback(
    (updater: (prev: ExpressFichaDraft) => ExpressFichaDraft) => {
      setDraft((prev) => {
        const next = updater(prev);
        isSelfWritingRef.current = true;
        try {
          writeExpressFichaDraft(next, owner);
        } finally {
          isSelfWritingRef.current = false;
        }
        return next;
      });
    },
    [owner],
  );

  // Ressincroniza quando outro componente (WelcomeModal ou ExpressFichaWizardModal legado) atualizar o rascunho
  React.useEffect(() => {
    const handleExternalSync = (ev: Event) => {
      if (isSelfWritingRef.current) return;
      const custom = ev as CustomEvent<{ owner?: string }>;
      if (custom?.detail?.owner && (owner || 'default') !== custom.detail.owner) return;
      const fresh = readExpressFichaDraft(owner);
      if (fresh) {
        setDraft(fresh);
      }
    };
    window.addEventListener('companygen:ficha-draft-updated', handleExternalSync);
    return () => {
      window.removeEventListener('companygen:ficha-draft-updated', handleExternalSync);
    };
  }, [owner]);

  const updateCatalogPrimaryFields = React.useCallback(
    (
      fieldPatch: Partial<
        Pick<
          ExpressFichaDraft,
          | 'productName'
          | 'productPriceInput'
          | 'productCategory'
          | 'productVariation'
          | 'productImageUrl'
          | 'photoMode'
        >
      >,
    ) => {
      updateDraft((prev) => {
        const next: ExpressFichaDraft = { ...prev, ...fieldPatch };
        const currentQuick = Array.isArray(prev.quickProducts) ? [...prev.quickProducts] : [];
        if (currentQuick.length > 0) {
          const safeIdx =
            editingQuickIdx >= 0 && editingQuickIdx < currentQuick.length ? editingQuickIdx : 0;
          const target = currentQuick[safeIdx];
          currentQuick[safeIdx] = {
            ...target,
            name: next.productName,
            priceInput: next.productPriceInput,
            category: next.productCategory,
            variation: next.productVariation,
            imageUrl:
              fieldPatch.productImageUrl !== undefined
                ? fieldPatch.productImageUrl
                : target.imageUrl,
          };
          next.quickProducts = currentQuick;
        }
        return next;
      });
    },
    [editingQuickIdx, updateDraft],
  );

  const setStep = (nextStep: 1 | 2 | 3) => {
    updateDraft((prev) => ({
      ...prev,
      splitStep: nextStep,
      currentStep: splitToWizardStep(nextStep),
    }));
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const palette = await extractBrandPalette(dataUrl);
      updateDraft((prev) => ({
        ...prev,
        logoUrl: dataUrl,
        generateAiLogo: false,
        primaryColor: palette.primaryHex,
        accentColor: palette.accentHex,
        palettePrimaryFromLogo: palette.primaryHex,
        paletteAccentFromLogo: palette.accentHex,
      }));
      showToast({
        type: 'success',
        message: palette.fallbackUsed
          ? 'Logo aplicada com paleta acessível padrão!'
          : `Paleta extraída da sua logo (${palette.primaryHex} / ${palette.accentHex}).`,
        durationMs: 2500,
      });
    } catch {
      showToast({ type: 'error', message: 'Não foi possível ler essa imagem de logo.' });
    }
  };

  const handleProductPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateCatalogPrimaryFields({
        photoMode: 'upload',
        productImageUrl: dataUrl,
      });
      showToast({
        type: 'success',
        message: 'Foto real aplicada ao produto na vitrine ao vivo!',
        durationMs: 2200,
      });
    } catch {
      showToast({ type: 'error', message: 'Não foi possível carregar essa foto.' });
    }
  };

  const handleSelectQuickProduct = (idx: number) => {
    const list = draft.quickProducts ?? [];
    const target = list[idx];
    if (!target) return;
    setEditingQuickIdx(idx);
    updateDraft((prev) => ({
      ...prev,
      productName: target.name,
      productPriceInput: target.priceInput,
      productCategory: target.category,
      productVariation: target.variation || 'Padrão',
      productImageUrl: target.imageUrl || '',
      photoMode:
        target.imageUrl && !target.imageUrl.startsWith('data:image/svg+xml') ? 'upload' : 'draft',
    }));
  };

  const handleRemoveQuickProduct = (idx: number) => {
    const current = draft.quickProducts ?? [];
    const remaining = current.filter((_, i) => i !== idx);
    const nextIdx = remaining.length > 0 ? Math.min(idx, remaining.length - 1) : 0;
    const replacement = remaining[nextIdx];
    setEditingQuickIdx(nextIdx);
    updateDraft((prev) => ({
      ...prev,
      quickProducts: remaining,
      productName: replacement?.name || '',
      productPriceInput: replacement?.priceInput || '',
      productCategory: replacement?.category || prev.productCategory,
      productVariation: replacement?.variation || 'Padrão',
      productImageUrl: replacement?.imageUrl || '',
      photoMode:
        replacement?.imageUrl && !replacement.imageUrl.startsWith('data:image/svg+xml')
          ? 'upload'
          : 'draft',
    }));
  };

  const handleTestOi = () => {
    const cleanE164 = sanitizePhoneE164(draft.phoneInput);
    if (!isValidProductionPhone(cleanE164)) {
      setPhoneError('Digite DDD + 9 dígitos válidos antes de testar (ex.: (11) 99999-8888).');
      return;
    }
    setPhoneError('');
    const store = draft.businessName.trim() || 'Minha Loja';
    const msg = encodeURIComponent(
      `Oi! Estou testando o recebimento de pedidos da loja ${store} pelo CompanyGen.`,
    );
    const url = `https://wa.me/${cleanE164}?text=${msg}`;
    setLastTestOiUrl(url);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const toggleDeliveryMode = (modeId: OnboardingDeliveryMode) => {
    updateDraft((prev) => {
      const current = prev.deliveryModes ?? ['pickup', 'local'];
      const exists = current.includes(modeId);
      const next = exists
        ? current.length > 1
          ? current.filter((m) => m !== modeId)
          : current
        : [...current, modeId];
      return {
        ...prev,
        deliveryModes: next,
        pickupEnabled: next.includes('pickup'),
        deliveryEnabled: next.includes('local') || next.includes('national'),
      };
    });
  };

  const handleApplyModelStore = () => {
    const template = findModelTemplateForSegment(draft.segment);
    const mapped = template.products.map((p, idx) => ({
      id: `model-${idx + 1}`,
      name: p.name,
      priceInput: formatCentsToInputBrl(p.priceCents),
      category: p.category,
      variation: p.variation,
      description: p.description,
      imageUrl: createProductPlaceholderSvgDataUri(p.name, p.category),
    }));
    const first = mapped[0];
    setEditingQuickIdx(0);
    updateDraft((prev) => ({
      ...prev,
      productName: first?.name || prev.productName,
      productCategory: first?.category || prev.productCategory,
      productVariation: first?.variation || 'Padrão',
      productPriceInput: first?.priceInput || prev.productPriceInput,
      productDescription: first?.description || prev.productDescription,
      productImageUrl: first?.imageUrl || '',
      photoMode: 'draft',
      quickProducts: mapped,
    }));
    showToast({
      type: 'success',
      message: `${template.products.length} itens de modelo carregados com 0 créditos.`,
      durationMs: 2500,
    });
  };

  const handleApplyPastedList = async () => {
    const raw = pasteText.trim();
    if (!raw || pasteBusy) return;
    setPasteBusy(true);
    try {
      if (raw.startsWith('@') && !raw.includes('\n')) {
        const cleanHandle = raw.replace(/^@+/, '').trim();
        const ig = await analyzeInstagramProfile(cleanHandle, owner);
        const template = findModelTemplateForSegment(ig.category || draft.segment);
        const mapped = template.products.map((p, idx) => ({
          id: `ig-${idx + 1}`,
          name: p.name,
          priceInput: formatCentsToInputBrl(p.priceCents),
          category: ig.category || p.category,
          variation: p.variation,
          description: p.description,
          imageUrl: createProductPlaceholderSvgDataUri(p.name, ig.category || p.category),
        }));
        const first = mapped[0];
        setEditingQuickIdx(0);
        updateDraft((prev) => ({
          ...prev,
          instagramHandle: `@${cleanHandle}`,
          businessName: ig.fullName || prev.businessName,
          businessDescription: ig.bio || prev.businessDescription,
          segment: ig.category || prev.segment,
          logoUrl: ig.logoUrl || prev.logoUrl,
          phoneInput: ig.phone ? formatBrazilPhoneDisplay(ig.phone) : prev.phoneInput,
          businessAddress: ig.address || prev.businessAddress,
          businessHours: ig.hours || prev.businessHours,
          productName: first?.name || prev.productName,
          productPriceInput: first?.priceInput || prev.productPriceInput,
          productCategory: first?.category || prev.productCategory,
          productVariation: first?.variation || 'Padrão',
          productImageUrl: first?.imageUrl || '',
          quickProducts: mapped,
        }));
        setPastePanelOpen(false);
        showToast({
          type: 'success',
          message: `Instagram @${cleanHandle} analisado (${mapped.length} itens sugeridos)!`,
          durationMs: 2500,
        });
        return;
      }

      const parsed = parseQuickPastedCatalogText(raw, draft.productCategory || 'Geral');
      if (parsed.length === 0) {
        showToast({
          type: 'error',
          message: 'Digite pelo menos 1 linha como "Nome do Produto - 49,90".',
        });
        return;
      }
      const mapped = parsed.map((p, idx) => ({
        id: `paste-${idx + 1}`,
        name: p.name,
        priceInput: formatCentsToInputBrl(p.priceCents),
        category: p.category,
        variation: p.variation,
        description: p.description,
        imageUrl: createProductPlaceholderSvgDataUri(p.name, p.category),
      }));
      const first = mapped[0];
      setEditingQuickIdx(0);
      updateDraft((prev) => ({
        ...prev,
        productName: first.name,
        productPriceInput: first.priceInput,
        productCategory: first.category,
        productVariation: first.variation,
        productImageUrl: first.imageUrl,
        photoMode: 'draft',
        quickProducts: mapped,
      }));
      setPastePanelOpen(false);
      showToast({
        type: 'success',
        message: `${mapped.length} itens importados instantaneamente para o catálogo!`,
        durationMs: 2500,
      });
    } finally {
      setPasteBusy(false);
    }
  };

  // Monta catálogo e perfil sintético em memória (< 16ms) com SSOT (quickProducts priorizado para nunca duplicar fantasma)
  const syntheticProducts = React.useMemo<CatalogProduct[]>(() => {
    const items: CatalogProduct[] = [];
    const seenNames = new Set<string>();
    const storeLabel = draft.businessName.trim() || profile.business?.name || 'Minha Loja';

    const pushProduct = (
      id: string,
      name: string,
      priceInput: string,
      category: string,
      variation: string,
      description: string,
      imageUrl: string,
    ) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      const key = cleanName.toLowerCase();
      if (seenNames.has(key)) return;
      seenNames.add(key);
      const priceCents = Math.max(0, parsePriceBrlToCents(priceInput)) || 4990;
      const finalImg =
        imageUrl || createProductPlaceholderSvgDataUri(cleanName, category || 'Geral');
      items.push({
        id,
        sku: `SKU-${String(items.length + 1).padStart(3, '0')}`,
        name: cleanName,
        category: category || 'Geral',
        description,
        priceCents,
        variation: variation || 'Padrão',
        stock: Math.max(1, Number(draft.productStockInput) || 10),
        active: true,
        imageUrl: finalImg,
        approvedAsset: true,
        mensagemMolde: buildDefaultMensagemMolde(
          { name: cleanName, priceCents, variation: variation || 'Padrão' },
          storeLabel,
        ),
        updatedAt: new Date().toISOString(),
      });
    };

    const quickList = draft.quickProducts ?? [];
    if (quickList.length > 0) {
      for (const qp of quickList) {
        pushProduct(
          qp.id,
          qp.name,
          qp.priceInput,
          qp.category,
          qp.variation,
          qp.description,
          qp.imageUrl,
        );
      }
    } else if (draft.productName.trim()) {
      pushProduct(
        'draft-primary',
        draft.productName,
        draft.productPriceInput || '49,90',
        draft.productCategory,
        draft.productVariation,
        draft.productDescription,
        draft.productImageUrl,
      );
    }

    for (const existing of profile.catalog?.products ?? []) {
      pushProduct(
        existing.id,
        existing.name,
        formatCentsToInputBrl(existing.priceCents),
        existing.category,
        existing.variation,
        existing.description,
        existing.imageUrl,
      );
    }

    return items;
  }, [draft, profile.business?.name, profile.catalog?.products]);

  const syntheticProfile = React.useMemo<BusinessProfile>(() => {
    const cleanPhone = sanitizePhoneE164(draft.phoneInput || profile.whatsapp?.phoneE164 || '');
    const selectedMood = VISUAL_MOOD_OPTIONS.find((m) => m.id === (draft.visualMood || 'boutique'));
    return {
      ...profile,
      business: {
        ...profile.business,
        name: draft.businessName.trim() || profile.business?.name || 'Sua Loja Online',
        segment: draft.segment || profile.business?.segment || 'Geral',
        businessModel: draft.businessModel,
        description:
          draft.businessDescription.trim() ||
          `${draft.businessName.trim() || 'Nossa Loja'} — Atendimento rápido no WhatsApp.`,
        address: draft.businessAddress || profile.business?.address || '',
        hours: draft.businessHours || profile.business?.hours || 'Seg a Sáb · 09h às 19h',
        deliveryModes: draft.deliveryModes ?? ['pickup', 'local'],
      },
      whatsapp: {
        ...profile.whatsapp,
        phoneE164: cleanPhone,
        displayPhone: draft.phoneInput || cleanPhone,
      },
      payment: {
        ...profile.payment,
        pixKey: draft.pixKey,
        pixDiscountPercent: draft.pixDiscountPercent,
        acceptedMethods: draft.acceptedMethods,
        paymentPolicy: draft.paymentPolicy ?? 'pix_discount',
      },
      brand: {
        ...profile.brand,
        logoUrl: draft.logoUrl,
        primaryColor: draft.primaryColor || '#0867E8',
        accentColor: draft.accentColor || '#24A677',
        fontStyle: selectedMood?.fontStyle ?? draft.fontStyle,
        visualMood: draft.visualMood ?? 'boutique',
      },
      catalog: {
        products: syntheticProducts,
      },
    };
  }, [draft, profile, syntheticProducts]);

  const liveFormulaIr = React.useMemo(() => {
    const rawIr = buildNeutralFallbackV9Document(syntheticProfile);
    return sanitizeFormulaV9Document(rawIr, syntheticProfile);
  }, [syntheticProfile]);

  const syncFaqAndBrainSilently = async () => {
    const selectedMood = VISUAL_MOOD_OPTIONS.find((m) => m.id === (draft.visualMood || 'boutique'));
    const rules = [
      {
        title: 'Cartão e Parcelamento',
        triggers: ['cartao', 'parcelamento', 'credito', 'debito', 'pix'],
        reply:
          draft.faqCardAnswer?.trim() ||
          'Aceitamos Pix, cartões de crédito e débito com envio rápido do comprovante.',
      },
      {
        title: 'Valor e Prazo de Entrega',
        triggers: ['entrega', 'frete', 'taxa', 'prazo', 'retirar'],
        reply:
          draft.faqDeliveryAnswer?.trim() ||
          'Realizamos entregas locais combinadas no WhatsApp e retirada gratuita no local.',
      },
      {
        title: 'Endereço e Ponto de Referência',
        triggers: ['onde', 'endereco', 'referencia', 'local', 'horario'],
        reply:
          draft.faqLocationAnswer?.trim() ||
          `Atendemos no horário ${draft.businessHours || 'comercial'} e enviamos localização exata no atendimento.`,
      },
    ];

    try {
      const existingRes = await authenticatedFetch('/api/whatsapp/ai/templates', { method: 'GET' }, owner);
      const existingJson = await existingRes.json().catch(() => null);
      const existingByTitle = new Map<string, { id?: string; reply: string }>();
      if (Array.isArray(existingJson?.templates)) {
        for (const t of existingJson.templates as Array<{
          id?: string;
          titulo?: string;
          title?: string;
          resposta?: string;
          body?: string;
        }>) {
          const titleKey = String(t?.titulo || t?.title || '').trim().toLowerCase();
          if (titleKey) {
            existingByTitle.set(titleKey, {
              id: t.id ? String(t.id) : undefined,
              reply: String(t?.resposta || t?.body || '').trim(),
            });
          }
        }
      }

      for (const r of rules) {
        const existing = existingByTitle.get(r.title.toLowerCase());
        if (existing && existing.reply === r.reply.trim()) continue;
        await authenticatedFetch(
          '/api/whatsapp/ai/templates',
          {
            method: existing?.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(existing?.id ? { id: existing.id } : {}),
              titulo: r.title,
              gatilhos: r.triggers,
              resposta: r.reply,
              category: 'Setup Inicial',
            }),
          },
          owner,
        ).catch(() => {});
      }

      await authenticatedFetch(
        '/api/whatsapp/ai/brain',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brain: {
              tone:
                selectedMood?.tone === 'direto'
                  ? 'Direta'
                  : selectedMood?.tone === 'proximo'
                    ? 'Acolhedora'
                    : 'Consultiva',
              welcomeGreeting:
                draft.welcomeGreeting?.trim() ||
                `Olá! Seja bem-vindo à ${draft.businessName.trim() || 'nossa loja'}! Como posso ajudar?`,
              afterHoursMessage:
                draft.nightNotice?.trim() ||
                'Nosso atendimento humano retorna pela manhã, mas você já pode escolher seus itens na vitrine!',
            },
          }),
        },
        owner,
      ).catch(() => {});
    } catch {
      // Silencioso: nunca trava publicação da loja caso templates/brain oscilem
    }
  };

  const handlePublishAndFinish = async () => {
    if (publishing) return;
    if (draft.businessName.trim().length < 2) {
      setStep(1);
      showToast({ type: 'error', message: 'Informe o nome da sua loja no Passo 1.' });
      return;
    }
    const e164 = sanitizePhoneE164(draft.phoneInput);
    if (!isValidProductionPhone(e164)) {
      setStep(1);
      setPhoneError('Informe um número WhatsApp válido com DDD antes de publicar.');
      return;
    }
    if (syntheticProducts.length === 0) {
      setStep(2);
      showToast({
        type: 'error',
        message: 'Cadastre pelo menos 1 produto (ou aplique uma Loja Modelo no Passo 2).',
      });
      return;
    }

    setPublishing(true);
    try {
      const selectedMood = VISUAL_MOOD_OPTIONS.find((m) => m.id === (draft.visualMood || 'boutique'));
      const snap = await updateBusinessProfile(
        (target) => {
          target.onboarding = {
            ...target.onboarding,
            fichaCompleted: true,
            storeGenerated: true,
          };
          target.business = {
            ...target.business,
            name: draft.businessName.trim(),
            segment: draft.segment || 'Geral',
            businessModel: draft.businessModel,
            description:
              draft.businessDescription.trim() ||
              `${draft.businessName.trim()} — Atendimento direto via vitrine e WhatsApp.`,
            hours: draft.businessHours || 'Seg a Sáb · 09h às 19h',
            address: draft.businessAddress.trim(),
            deliveryModes: draft.deliveryModes ?? ['pickup', 'local'],
          };
          target.whatsapp = {
            ...target.whatsapp,
            phoneE164: e164,
            displayPhone: formatBrazilPhoneDisplay(e164),
          };
          target.delivery = {
            ...target.delivery,
            pickupEnabled: (draft.deliveryModes ?? ['pickup', 'local']).includes('pickup'),
            deliveryEnabled:
              (draft.deliveryModes ?? ['pickup', 'local']).includes('local') ||
              (draft.deliveryModes ?? ['pickup', 'local']).includes('national'),
            defaultFeeCents: parsePriceBrlToCents(draft.deliveryFeeInput),
          };
          target.payment = {
            ...target.payment,
            pixKey: draft.pixKey.trim(),
            pixDiscountPercent: draft.pixDiscountPercent,
            acceptedMethods: draft.acceptedMethods,
            paymentPolicy: draft.paymentPolicy ?? 'pix_discount',
          };
          target.brand = {
            ...target.brand,
            instagram: draft.instagramHandle.trim(),
            logoUrl: draft.logoUrl,
            primaryColor: draft.primaryColor || '#0867E8',
            accentColor: draft.accentColor || '#24A677',
            fontStyle: selectedMood?.fontStyle ?? draft.fontStyle,
            visualMood: draft.visualMood ?? 'boutique',
          };
          target.agent = {
            ...target.agent,
            tone: selectedMood?.tone ?? 'proximo',
            welcomeMessage: draft.welcomeGreeting?.trim() || '',
          };
          target.catalog = {
            products: syntheticProducts,
          };
          target.publishedStore = {
            ...target.publishedStore,
            published: true,
            publishedAt: new Date().toISOString(),
          };
          target.storeLayout = {
            ...target.storeLayout,
            formulasIr: liveFormulaIr,
          };
        },
        { publish: true },
        owner,
      );

      await syncFaqAndBrainSilently();
      clearExpressFichaDraft(owner);
      showToast({
        type: 'success',
        message: 'Vitrine publicada e Sofia configurada em menos de 3 min!',
        durationMs: 3500,
      });
      onStorePublished?.(snap);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível concluir a publicação agora.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const normalizeFaqQuery = (raw: string): string =>
    String(raw || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const CARD_FAQ_RE = /cart|pix|pag|parcel|debito|credito/;
  const DELIVERY_FAQ_RE = /entreg|frete|taxa|envio|prazo|retir/;
  const LOCATION_FAQ_RE = /onde|ender|local|referen|horar|abre|funcion/;

  const resolveLocalFallbackSofiaReply = (question: string): string => {
    const q = normalizeFaqQuery(question);
    const store = draft.businessName.trim() || 'nossa loja';
    if (CARD_FAQ_RE.test(q)) {
      return (
        draft.faqCardAnswer?.trim() ||
        `Na ${store}, aceitamos Pix (${draft.pixKey ? `chave ${draft.pixKey}` : 'pronto no checkout'}) e cartões com atendimento direto aqui no WhatsApp.`
      );
    }
    if (DELIVERY_FAQ_RE.test(q)) {
      return (
        draft.faqDeliveryAnswer?.trim() ||
        `Fazemos entrega combinada pelo WhatsApp e retirada gratuita para os clientes da ${store}.`
      );
    }
    if (LOCATION_FAQ_RE.test(q)) {
      return (
        draft.faqLocationAnswer?.trim() ||
        `Atendemos de ${draft.businessHours || 'Seg a Sáb · 09h às 19h'}${draft.businessAddress ? ` (${draft.businessAddress})` : ''}.`
      );
    }
    if (syntheticProducts.length > 0) {
      const top = syntheticProducts[0];
      return `Temos ${top.name} disponível (${top.variation}) na ${store}! Quer que eu já separe seu pedido?`;
    }
    return `Oi! Na ${store} estamos prontos para atender você. Sobre qual produto você gostaria de saber?`;
  };

  const handleSendSofiaTest = async (overrideText?: string) => {
    const text = (overrideText ?? sofiaInput).trim();
    if (!text || sofiaSending) return;
    setSofiaSending(true);
    if (!overrideText) setSofiaInput('');
    setSofiaMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'customer', text },
    ]);

    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/ai/simulate-or-reply',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'simulator',
            messageText: text,
            customerName: 'Teste Lojista',
          }),
        },
        owner,
      );
      const json = await res.json().catch(() => null);
      const serverReply = String(json?.replyText || json?.reply || '').trim();
      const normalizedQ = normalizeFaqQuery(text);
      const hasCustomCard = Boolean(draft.faqCardAnswer?.trim()) && CARD_FAQ_RE.test(normalizedQ);
      const hasCustomDeliv = Boolean(draft.faqDeliveryAnswer?.trim()) && DELIVERY_FAQ_RE.test(normalizedQ);
      const hasCustomLoc = Boolean(draft.faqLocationAnswer?.trim()) && LOCATION_FAQ_RE.test(normalizedQ);

      const finalReply =
        hasCustomCard || hasCustomDeliv || hasCustomLoc || !serverReply
          ? resolveLocalFallbackSofiaReply(text)
          : serverReply;

      setSofiaMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: 'sofia', text: finalReply },
      ]);
    } catch {
      setSofiaMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: 'sofia', text: resolveLocalFallbackSofiaReply(text) },
      ]);
    } finally {
      setSofiaSending(false);
    }
  };

  const variationPresets = React.useMemo(
    () => getVariationPresetsForCategory(draft.productCategory, draft.segment),
    [draft.productCategory, draft.segment],
  );

  const headerPrimaryHex = draft.primaryColor || '#0867E8';
  const headerAccentHex = draft.accentColor || '#24A677';
  const headerContrastText =
    contrastRatio(headerPrimaryHex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A';
  const accentContrastText =
    contrastRatio(headerAccentHex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A';

  const renderSmartphoneMockup = () => (
    <div
      data-testid="split-smartphone-frame"
      className="mx-auto w-full max-w-[340px] rounded-[32px] border-[6px] border-slate-900 bg-[var(--cg-surface)] shadow-2xl overflow-hidden dark:border-slate-700"
    >
      {/* Notch & Alternador Vitrine <-> Testar Sofia */}
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-[#182034]">
        <div className="mx-auto mb-2 h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/80 p-1 dark:bg-slate-900/80">
          <button
            type="button"
            data-testid="split-preview-tab-vitrine"
            onClick={() => setPreviewTab('vitrine')}
            className={cn(
              'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors',
              previewTab === 'vitrine'
                ? 'bg-white text-[#0B1D52] shadow-xs dark:bg-[#111726] dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400',
            )}
          >
            <Store className="size-3.5" />
            <span>Vitrine</span>
          </button>
          <button
            type="button"
            data-testid="split-preview-tab-sofia"
            onClick={() => setPreviewTab('sofia')}
            className={cn(
              'inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors',
              previewTab === 'sofia'
                ? 'bg-white text-[#0B1D52] shadow-xs dark:bg-[#111726] dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400',
            )}
          >
            <MessageCircle className="size-3.5 text-emerald-500" />
            <span>Testar Sofia</span>
          </button>
        </div>
      </div>

      {/* Corpo do Smartphone */}
      {previewTab === 'vitrine' ? (
        <div
          data-testid="split-live-vitrine-preview"
          style={{ backgroundColor: '#ffffff', color: '#0F172A' }}
          className="cg-light-preview h-[520px] overflow-y-auto bg-white text-[#0F172A]"
        >
          {/* Cabeçalho ao vivo da marca no celular com contraste WCAG AA dinâmico */}
          <div
            data-testid="split-live-brand-header"
            className="flex items-center justify-between gap-2 px-3.5 py-3"
            style={{ backgroundColor: headerPrimaryHex, color: headerContrastText }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {draft.logoUrl ? (
                <img
                  src={draft.logoUrl}
                  alt={syntheticProfile.business.name}
                  className="size-8 shrink-0 rounded-lg bg-white p-0.5 object-contain"
                />
              ) : null}
              <div className="min-w-0">
                <p
                  data-testid="split-live-brand-title"
                  className="truncate text-sm font-extrabold"
                  style={{ color: headerContrastText }}
                >
                  {syntheticProfile.business.name}
                </p>
                <p
                  className="truncate text-[10px] opacity-90"
                  style={{ color: headerContrastText }}
                >
                  {draft.segment || 'Vitrine Online'}
                </p>
              </div>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: headerAccentHex, color: accentContrastText }}
            >
              Ao vivo
            </span>
          </div>

          {/* Barra viva de regras (Entrega + Pagamento) */}
          <div
            data-testid="split-live-rules-strip"
            className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-700"
          >
            {(draft.deliveryModes ?? ['pickup', 'local']).map((mode) => (
              <span
                key={mode}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[#0F172A]"
              >
                {mode === 'pickup' ? 'Retirada' : mode === 'local' ? 'Entrega local' : 'Correios'}
              </span>
            ))}
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
              {draft.paymentPolicy === 'on_delivery'
                ? 'Paga na entrega'
                : draft.paymentPolicy === 'deposit_50'
                  ? 'Sinal 50%'
                  : 'Pix com desconto'}
            </span>
          </div>

          {/* Catálogo Ao Vivo acima da dobra dentro do Smartphone */}
          <div
            data-testid="split-live-catalog-strip"
            className="border-b border-slate-200 bg-white px-3 py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#0F172A]">
                Catálogo na Vitrine ({syntheticProducts.length})
              </p>
              <span className="text-[10px] font-semibold text-slate-500">
                {VISUAL_MOOD_OPTIONS.find((m) => m.id === (draft.visualMood || 'boutique'))?.label ||
                  'Boutique Limpa'}
              </span>
            </div>
            {syntheticProducts.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {syntheticProducts.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="size-11 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#0F172A]">{item.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="cg-tabular text-xs font-extrabold text-[#16A34A]">
                          {formatCurrencyBRL(item.priceCents)}
                        </span>
                        {item.variation ? (
                          <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {item.variation}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold"
                      style={{ backgroundColor: headerAccentHex, color: accentContrastText }}
                    >
                      Pedir
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-[11px] text-slate-500">
                Seus produtos do Passo 2 aparecem aqui em tempo real.
              </div>
            )}
          </div>

          <div className="pointer-events-none origin-top scale-[0.94] px-1 pt-1">
            <FormulaTreeRenderer
              formulaV9={liveFormulaIr}
              profile={syntheticProfile}
              products={syntheticProducts}
              cartCount={0}
              previewViewport="mobile"
              onOpenCart={() => {}}
              onAddToCart={() => {}}
            />
          </div>
        </div>
      ) : (
        <div
          data-testid="split-live-sofia-preview"
          className="flex h-[520px] flex-col bg-[#F1F5F9] dark:bg-[#090D16]"
        >
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#111726]">
            {['Aceita cartão?', 'Qual valor da entrega?', 'Onde fica a loja?'].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void handleSendSofiaTest(prompt)}
                className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-[#182034] dark:text-slate-200"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {sofiaMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-xs',
                  msg.role === 'customer'
                    ? 'ml-auto bg-[#2563EB] text-white rounded-br-xs'
                    : 'bg-white text-[#0F172A] border border-slate-200 rounded-bl-xs dark:bg-[#182034] dark:text-white dark:border-slate-700',
                )}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendSofiaTest();
            }}
            className="flex items-center gap-1.5 border-t border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#111726]"
          >
            <input
              type="text"
              data-testid="split-sofia-chat-input"
              value={sofiaInput}
              onChange={(e) => setSofiaInput(e.target.value)}
              placeholder="Pergunte como um cliente..."
              className="min-h-[40px] flex-1 rounded-xl border border-slate-300 px-3 text-xs outline-none focus:border-[#2563EB]"
            />
            <ActionButton
              type="submit"
              variant="primary"
              size={44}
              isLoading={sofiaSending}
              data-testid="split-sofia-chat-send"
              aria-label="Testar resposta da Sofia"
              className="min-w-[44px] px-3"
            >
              <Send className="size-4" />
            </ActionButton>
          </form>
        </div>
      )}
    </div>
  );

  return (
    <div
      data-testid="onboarding-split-studio"
      className="grid gap-6 min-[1024px]:grid-cols-12 min-[1024px]:items-start"
    >
      {/* Coluna Esquerda (55% = 7/12): Formulário Express 3 Passos */}
      <div className="min-[1024px]:col-span-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-[#111726]">
        {/* Header de Progresso 4px */}
        <div className="space-y-2.5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-[#0867E8] dark:text-[#38BDF8]">
                Passo {activeStep} de 3 · ~90s
              </span>
              {(draft.preferredTrack || profile.onboarding?.preferredTrack) === 'store_first' ? (
                <span
                  data-testid="split-track-badge"
                  className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[10px] font-bold text-[#1D4ED8] dark:bg-blue-500/20 dark:text-blue-200"
                >
                  Trilha: Vitrine IA Primeiro
                </span>
              ) : null}
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Rascunho salvo automaticamente
            </span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[var(--cg-primary)] transition-all duration-300"
              style={{ width: `${Math.round((activeStep / 3) * 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[
              { id: 1 as const, label: '1. Identidade' },
              { id: 2 as const, label: '2. Catálogo' },
              { id: 3 as const, label: '3. Pix & Sofia' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`split-step-tab-${tab.id}`}
                onClick={() => setStep(tab.id)}
                className={cn(
                  'min-h-[38px] rounded-xl border px-2 text-xs font-bold transition-colors',
                  activeStep === tab.id
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                    : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* PASSO 1: Identidade, Logo 2 Cores, 3 Climas, WhatsApp Testar Oi & Pílulas */}
        {activeStep === 1 ? (
          <div data-testid="split-step1-panel" className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="split-store-name"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Nome da sua loja *
                </label>
                <input
                  id="split-store-name"
                  data-testid="split-step1-store-name"
                  type="text"
                  value={draft.businessName}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, businessName: e.target.value }))
                  }
                  placeholder="Ex.: Atelier Lumina"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="split-segment"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Ramo principal
                </label>
                <select
                  id="split-segment"
                  data-testid="split-step1-segment"
                  value={draft.segment}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, segment: e.target.value }))
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  {SEGMENT_OPTIONS.map((seg) => (
                    <option key={seg} value={seg}>
                      {seg}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Upload de Logo + Apenas 2 Bolinhas de Cor */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#182034]/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {draft.logoUrl ? (
                    <img
                      src={draft.logoUrl}
                      alt="Logo da loja"
                      className="size-12 rounded-xl border border-slate-200 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400">
                      <ImagePlus className="size-5" />
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-[#0F172A] dark:text-white">
                      Logo e Paleta Automática
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Extraímos 2 cores acessíveis da sua logo na hora.
                    </p>
                  </div>
                </div>

                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0F172A] hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111726] dark:text-white">
                  <Upload className="size-3.5 text-[#2563EB]" />
                  <span>{draft.logoUrl ? 'Trocar Logo' : 'Enviar Logo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    data-testid="split-step1-logo-input"
                    className="sr-only"
                    onChange={handleLogoFileChange}
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Cores da marca:
                </span>
                <label
                  data-testid="split-step1-color-primary"
                  title={`Escolher cor principal (${draft.primaryColor})`}
                  className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-sm ring-1 ring-slate-300"
                  style={{ backgroundColor: draft.primaryColor }}
                >
                  <input
                    type="color"
                    data-testid="split-step1-color-primary-input"
                    aria-label={`Cor principal ${draft.primaryColor}`}
                    value={draft.primaryColor || '#0867E8'}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        primaryColor: e.target.value.toUpperCase(),
                      }))
                    }
                    className="sr-only"
                  />
                </label>
                <label
                  data-testid="split-step1-color-accent"
                  title={`Escolher cor de destaque (${draft.accentColor || '#24A677'})`}
                  className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-sm ring-1 ring-slate-300"
                  style={{ backgroundColor: draft.accentColor || '#24A677' }}
                >
                  <input
                    type="color"
                    data-testid="split-step1-color-accent-input"
                    aria-label={`Cor de destaque ${draft.accentColor || '#24A677'}`}
                    value={draft.accentColor || '#24A677'}
                    onChange={(e) =>
                      updateDraft((prev) => ({
                        ...prev,
                        accentColor: e.target.value.toUpperCase(),
                      }))
                    }
                    className="sr-only"
                  />
                </label>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {draft.primaryColor} · {draft.accentColor || '#24A677'}
                </span>
                <button
                  type="button"
                  data-testid="split-swap-colors-btn"
                  onClick={() =>
                    updateDraft((prev) => ({
                      ...prev,
                      primaryColor: prev.accentColor || '#24A677',
                      accentColor: prev.primaryColor || '#0867E8',
                    }))
                  }
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111726] dark:text-slate-300"
                >
                  <ArrowLeftRight className="size-3" />
                  <span>Inverter</span>
                </button>
                {draft.palettePrimaryFromLogo &&
                (draft.primaryColor !== draft.palettePrimaryFromLogo ||
                  draft.accentColor !== draft.paletteAccentFromLogo) ? (
                  <button
                    type="button"
                    data-testid="split-restore-logo-colors-btn"
                    onClick={() =>
                      updateDraft((prev) => ({
                        ...prev,
                        primaryColor: prev.palettePrimaryFromLogo || prev.primaryColor,
                        accentColor: prev.paletteAccentFromLogo || prev.accentColor,
                      }))
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-blue-200 bg-[#EFF6FF] px-2 text-[11px] font-semibold text-[#1D4ED8] hover:bg-blue-100"
                  >
                    <RotateCcw className="size-3" />
                    <span>Da logo</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* 3 Climas Visuais */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                Clima visual da sua loja e da Sofia
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {VISUAL_MOOD_OPTIONS.map((mood) => {
                  const selected = (draft.visualMood || 'boutique') === mood.id;
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      data-testid={`split-mood-${mood.id}`}
                      onClick={() =>
                        updateDraft((prev) => ({
                          ...prev,
                          visualMood: mood.id,
                          fontStyle: mood.fontStyle,
                        }))
                      }
                      className={cn(
                        'rounded-2xl border p-3 text-left transition-all',
                        selected
                          ? 'border-[#2563EB] bg-[#EFF6FF] ring-2 ring-[#2563EB]/25 dark:border-blue-500 dark:bg-[#182034]'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40',
                      )}
                    >
                      <p className="text-xs font-bold text-[#0F172A] dark:text-white">
                        {mood.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {mood.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* WhatsApp + Botão Testar Oi */}
            <div>
              <label
                htmlFor="split-phone"
                className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
              >
                WhatsApp de pedidos (DDD + número) *
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="split-phone"
                  data-testid="split-step1-phone"
                  type="tel"
                  value={draft.phoneInput}
                  onChange={(e) => {
                    setPhoneError('');
                    updateDraft((prev) => ({
                      ...prev,
                      phoneInput: formatBrazilPhoneDisplay(e.target.value),
                    }));
                  }}
                  placeholder="(11) 99999-8888"
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 px-3.5 text-sm"
                />
                <ActionButton
                  variant="secondary"
                  size={44}
                  data-testid="split-step1-test-oi-btn"
                  data-whatsapp-url={lastTestOiUrl || undefined}
                  leftIcon={<MessageCircle className="size-4 text-emerald-600" />}
                  onClick={handleTestOi}
                >
                  Testar Oi
                </ActionButton>
              </div>
              {phoneError ? (
                <p role="alert" className="mt-1.5 text-xs font-semibold text-[var(--cg-error)]">
                  {phoneError}
                </p>
              ) : null}
              {lastTestOiUrl ? (
                <p
                  data-testid="split-test-oi-confirmed"
                  className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                >
                  Link wa.me validado e pronto para receber pedidos reais.
                </p>
              ) : null}
            </div>

            {/* 2 Linhas de Pílulas: Entrega e Cobrança */}
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Como o cliente recebe
                </p>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_PILLS.map((pill) => {
                    const active = (draft.deliveryModes ?? ['pickup', 'local']).includes(pill.id);
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        data-testid={`split-delivery-pill-${pill.id}`}
                        onClick={() => toggleDeliveryMode(pill.id)}
                        className={cn(
                          'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                          active
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : null}
                        <span>{pill.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Regra de cobrança padrão
                </p>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_POLICY_PILLS.map((pill) => {
                    const active = (draft.paymentPolicy ?? 'pix_discount') === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        data-testid={`split-payment-pill-${pill.id}`}
                        onClick={() =>
                          updateDraft((prev) => ({
                            ...prev,
                            paymentPolicy: pill.id,
                            pixDiscountPercent:
                              pill.id === 'pix_discount' && prev.pixDiscountPercent === 0
                                ? 5
                                : pill.id !== 'pix_discount' && prev.pixDiscountPercent === 5
                                  ? 0
                                  : prev.pixDiscountPercent,
                          }))
                        }
                        className={cn(
                          'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                          active
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
                        )}
                      >
                        {active ? <Check className="size-3.5" /> : null}
                        <span>{pill.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {onConnectWhatsapp ? (
                <button
                  type="button"
                  onClick={onConnectWhatsapp}
                  className="text-xs font-semibold text-slate-500 underline underline-offset-4 hover:text-[#2563EB]"
                >
                  Prefiro parear WhatsApp antes →
                </button>
              ) : (
                <span />
              )}
              <ActionButton
                variant="primaryGradient"
                size={46}
                data-testid="split-step1-next-btn"
                rightIcon={<ArrowRight className="size-4" />}
                onClick={() => setStep(2)}
              >
                Avançar para Catálogo
              </ActionButton>
            </div>
          </div>
        ) : null}

        {/* PASSO 2: Barra Expressa 3 Vias + 1º Produto com Chips + Foto Gentil */}
        {activeStep === 2 ? (
          <div data-testid="split-step2-panel" className="mt-5 space-y-5">
            {/* Barra Segmentada 3 Vias Expressas */}
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-[#182034]/60">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Preenchimento Expresso de Catálogo
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  data-testid="split-express-xlsx-btn"
                  onClick={() => setXlsxModalOpen(true)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111726] dark:text-white"
                >
                  <FileSpreadsheet className="size-3.5 text-emerald-600" />
                  <span>Subir Excel .xlsx</span>
                </button>
                <button
                  type="button"
                  data-testid="split-express-paste-btn"
                  onClick={() => setPastePanelOpen((prev) => !prev)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111726] dark:text-white"
                >
                  <Sparkles className="size-3.5 text-[#2563EB]" />
                  <span>Colar Lista / @IG</span>
                </button>
                <button
                  type="button"
                  data-testid="split-express-model-btn"
                  onClick={handleApplyModelStore}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111726] dark:text-white"
                >
                  <Package className="size-3.5 text-amber-500" />
                  <span>Loja Modelo (0 cr)</span>
                </button>
              </div>

              {pastePanelOpen ? (
                <div className="mt-2 space-y-2 rounded-xl border border-blue-200 bg-white p-3 dark:border-blue-500/30 dark:bg-[#111726]">
                  <textarea
                    rows={3}
                    data-testid="split-express-paste-input"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={'Cole 1 item por linha (ex.: "Sérum Vitamina C - 119,90") ou digite @instagram'}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <ActionButton
                      variant="primary"
                      size={44}
                      isLoading={pasteBusy}
                      data-testid="split-express-paste-apply"
                      onClick={handleApplyPastedList}
                    >
                      Aplicar ao Catálogo
                    </ActionButton>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Chips de Itens do Catálogo (Edição Direta & Remoção SSOT) */}
            {Array.isArray(draft.quickProducts) && draft.quickProducts.length > 0 ? (
              <div data-testid="split-catalog-chips" className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Itens no catálogo ({draft.quickProducts.length}) — clique para editar ou × para remover:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.quickProducts.map((qp, idx) => {
                    const isSelected = editingQuickIdx === idx;
                    return (
                      <div
                        key={qp.id}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 text-xs font-semibold transition-colors',
                          isSelected
                            ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                            : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200',
                        )}
                      >
                        <button
                          type="button"
                          data-testid={`split-select-product-${idx}`}
                          onClick={() => handleSelectQuickProduct(idx)}
                          className="max-w-[170px] truncate text-left"
                        >
                          {qp.name || `Item ${idx + 1}`}
                        </button>
                        <button
                          type="button"
                          data-testid={`split-remove-product-${idx}`}
                          aria-label={`Remover ${qp.name || 'item'}`}
                          onClick={() => handleRemoveQuickProduct(idx)}
                          className="inline-flex size-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-800"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* 1º Produto / Item Selecionado + Chips de Variação por Categoria */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="split-prod-name"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  {draft.quickProducts && draft.quickProducts.length > 0
                    ? `Nome do item #${editingQuickIdx + 1} *`
                    : 'Nome do 1º item *'}
                </label>
                <input
                  id="split-prod-name"
                  data-testid="split-step2-product-name"
                  type="text"
                  value={draft.productName}
                  onChange={(e) =>
                    updateCatalogPrimaryFields({ productName: e.target.value })
                  }
                  placeholder="Ex.: Sérum Vitamina C"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="split-prod-price"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Preço em Reais *
                </label>
                <input
                  id="split-prod-price"
                  data-testid="split-step2-product-price"
                  type="text"
                  value={draft.productPriceInput}
                  onChange={(e) =>
                    updateCatalogPrimaryFields({ productPriceInput: e.target.value })
                  }
                  placeholder="Ex.: 119,90"
                  className="cg-tabular min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="split-prod-cat"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Categoria
                </label>
                <input
                  id="split-prod-cat"
                  data-testid="split-step2-product-category"
                  type="text"
                  value={draft.productCategory}
                  onChange={(e) =>
                    updateCatalogPrimaryFields({ productCategory: e.target.value })
                  }
                  placeholder="Ex.: Cosméticos, Roupas, Calçados..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="split-prod-var"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Variação / Tamanho / Volume
                </label>
                <input
                  id="split-prod-var"
                  data-testid="split-step2-product-variation"
                  type="text"
                  value={draft.productVariation}
                  onChange={(e) =>
                    updateCatalogPrimaryFields({ productVariation: e.target.value })
                  }
                  placeholder="Ex.: 30ml ou M"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>
            </div>

            {/* Chips sugeridos sob demanda pela categoria */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {variationPresets.label}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variationPresets.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    data-testid={`split-variation-chip-${chip}`}
                    onClick={() => updateCatalogPrimaryFields({ productVariation: chip })}
                    className={cn(
                      'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors',
                      draft.productVariation === chip
                        ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Caixa Foto 96x96 Honesta: Upload Real + Capa Automática (sem stub falso) */}
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#182034]/60">
              <div className="size-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
                <img
                  data-testid="split-step2-photo-preview"
                  src={
                    draft.productImageUrl ||
                    createProductPlaceholderSvgDataUri(
                      draft.productName || 'Item',
                      draft.productCategory,
                    )
                  }
                  alt="Prévia do item"
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-bold text-[#0F172A] dark:text-white">
                  Foto do item (upload real ou capa limpa gratuita)
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="split-photo-mode-draft"
                    onClick={() =>
                      updateCatalogPrimaryFields({
                        photoMode: 'draft',
                        productImageUrl: createProductPlaceholderSvgDataUri(
                          draft.productName || 'Item',
                          draft.productCategory,
                        ),
                      })
                    }
                    className={cn(
                      'inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold',
                      (draft.photoMode || 'draft') === 'draft'
                        ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#111726] dark:text-white'
                        : 'border-slate-300 bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300',
                    )}
                  >
                    Capa automática (0 cr)
                  </button>
                  <label
                    data-testid="split-step2-photo-upload-label"
                    className={cn(
                      'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold',
                      draft.photoMode === 'upload'
                        ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:bg-[#111726] dark:text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                    )}
                  >
                    <Upload className="size-3.5 text-[#2563EB]" />
                    <span>Enviar foto real</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      data-testid="split-step2-photo-upload"
                      className="sr-only"
                      onChange={handleProductPhotoUpload}
                    />
                  </label>
                </div>
              </div>
            </div>

            {syntheticProducts.length > 0 ? (
              <p
                data-testid="split-step2-catalog-count"
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-300"
              >
                ✓ {syntheticProducts.length}{' '}
                {syntheticProducts.length === 1 ? 'item pronto' : 'itens prontos'} na prévia ao vivo
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <ActionButton
                variant="secondary"
                size={44}
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={() => setStep(1)}
              >
                Voltar
              </ActionButton>
              <ActionButton
                variant="primaryGradient"
                size={46}
                data-testid="split-step2-next-btn"
                rightIcon={<ArrowRight className="size-4" />}
                onClick={() => setStep(3)}
              >
                Avançar para Pix & Sofia
              </ActionButton>
            </div>
          </div>
        ) : null}

        {/* PASSO 3: Chave Pix + 3 Perguntas Comuns + Saudação / Noturno */}
        {activeStep === 3 ? (
          <div data-testid="split-step3-panel" className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="split-pix-key"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                >
                  Chave Pix da loja (opcional)
                </label>
                <input
                  id="split-pix-key"
                  data-testid="split-step3-pix-key"
                  type="text"
                  value={draft.pixKey}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, pixKey: e.target.value }))
                  }
                  placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Desconto no Pix
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 5, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() =>
                        updateDraft((prev) => ({
                          ...prev,
                          pixDiscountPercent: pct,
                          paymentPolicy:
                            pct > 0
                              ? 'pix_discount'
                              : prev.paymentPolicy === 'pix_discount'
                                ? 'on_delivery'
                                : prev.paymentPolicy,
                        }))
                      }
                      className={cn(
                        'min-h-[44px] rounded-xl border text-xs font-bold',
                        draft.pixDiscountPercent === pct
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] dark:border-blue-500 dark:bg-[#182034] dark:text-white'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900',
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bloco 3 Perguntas Comuns */}
            <div
              data-testid="split-step3-faq-block"
              className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#182034]/60"
            >
              <div>
                <p className="text-xs font-bold text-[#0F172A] dark:text-white">
                  3 Perguntas Comuns que a Sofia responde sozinha
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Preencha com suas palavras — já ativamos no WhatsApp ao publicar.
                </p>
              </div>

              <div className="space-y-2.5">
                <input
                  type="text"
                  data-testid="split-faq-card"
                  value={draft.faqCardAnswer ?? ''}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, faqCardAnswer: e.target.value }))
                  }
                  placeholder="1. Aceita cartão? (Ex.: Sim, em até 3x sem juros ou Pix com 5%)"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
                <input
                  type="text"
                  data-testid="split-faq-delivery"
                  value={draft.faqDeliveryAnswer ?? ''}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, faqDeliveryAnswer: e.target.value }))
                  }
                  placeholder="2. Valor e prazo de entrega? (Ex.: R$ 10 na cidade no mesmo dia)"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
                <input
                  type="text"
                  data-testid="split-faq-location"
                  value={draft.faqLocationAnswer ?? ''}
                  onChange={(e) =>
                    updateDraft((prev) => ({ ...prev, faqLocationAnswer: e.target.value }))
                  }
                  placeholder="3. Ponto de referência / horário? (Ex.: Rua das Flores, 120 · Seg-Sáb 9h-19h)"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs"
                />
              </div>
            </div>

            {/* Mini-acordeão saudação & aviso noturno */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                data-testid="split-step3-greetings-toggle"
                onClick={() => setGreetingsOpen((prev) => !prev)}
                className="flex w-full min-h-[44px] items-center justify-between px-4 text-xs font-semibold text-[#0F172A] dark:text-slate-200"
              >
                <span>Personalizar saudação e aviso noturno (opcional)</span>
                {greetingsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              {greetingsOpen ? (
                <div className="space-y-2.5 border-t border-slate-200 p-4 dark:border-slate-800">
                  <input
                    type="text"
                    value={draft.welcomeGreeting ?? ''}
                    onChange={(e) =>
                      updateDraft((prev) => ({ ...prev, welcomeGreeting: e.target.value }))
                    }
                    placeholder="Saudação inicial (ex.: Olá! Seja bem-vindo à nossa loja!)"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs"
                  />
                  <input
                    type="text"
                    value={draft.nightNotice ?? ''}
                    onChange={(e) =>
                      updateDraft((prev) => ({ ...prev, nightNotice: e.target.value }))
                    }
                    placeholder="Aviso noturno (ex.: Respondemos pela manhã, mas sua sacola já fica salva)"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-xs"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <ActionButton
                variant="secondary"
                size={44}
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={() => setStep(2)}
              >
                Voltar
              </ActionButton>
              <ActionButton
                variant="success"
                size={48}
                isLoading={publishing}
                loadingText="Publicando loja..."
                data-testid="split-publish-finish-btn"
                leftIcon={<Rocket className="size-4" />}
                onClick={handlePublishAndFinish}
              >
                Publicar Minha Loja e Ativar Sofia
              </ActionButton>
            </div>
          </div>
        ) : null}
      </div>

      {/* Coluna Direita (45% = 5/12): Celular Ao Vivo Desktop (>= 1024px) */}
      <aside
        aria-label="Prévia ao vivo em celular"
        className="hidden min-[1024px]:flex min-[1024px]:col-span-5 flex-col items-center rounded-3xl border border-slate-200 bg-[var(--cg-surface-elevated)] p-5 dark:border-slate-800 dark:bg-[#111726]/80"
      >
        {renderSmartphoneMockup()}
      </aside>

      {/* Mobile (<= 1023px): Botão Flutuante "Ver prévia ao vivo" */}
      <div className="fixed bottom-20 right-4 z-30 min-[1024px]:hidden">
        <ActionButton
          variant="dark"
          size={44}
          data-testid="onboarding-mobile-preview-btn"
          leftIcon={<Eye className="size-4" />}
          onClick={() => setMobilePreviewOpen(true)}
          className="rounded-full shadow-xl"
        >
          Ver prévia ao vivo
        </ActionButton>
      </div>

      <ModalContainer
        open={mobilePreviewOpen}
        onOpenChange={setMobilePreviewOpen}
        maxWidth="md"
        mobileHeight="90%"
        title="Prévia ao vivo"
      >
        {renderSmartphoneMockup()}
      </ModalContainer>

      <UniversalCatalogXlsxModal
        open={xlsxModalOpen}
        onOpenChange={setXlsxModalOpen}
        ownerUser={owner}
        businessModel={draft.businessModel}
        onImportProducts={(imported) => {
          const mapped = imported.slice(0, 30).map((item, idx) => ({
            id: item.id || `xlsx-${idx + 1}`,
            name: item.name,
            priceInput: formatCentsToInputBrl(item.priceCents),
            category: item.category || 'Geral',
            variation: item.variation || 'Padrão',
            description: item.description || '',
            imageUrl:
              item.imageUrl ||
              createProductPlaceholderSvgDataUri(item.name, item.category || 'Geral'),
          }));
          const first = mapped[0];
          setEditingQuickIdx(0);
          updateDraft((prev) => ({
            ...prev,
            productName: first?.name || prev.productName,
            productPriceInput: first?.priceInput || prev.productPriceInput,
            productCategory: first?.category || prev.productCategory,
            productVariation: first?.variation || 'Padrão',
            productImageUrl: first?.imageUrl || '',
            quickProducts: mapped,
          }));
          setXlsxModalOpen(false);
        }}
      />
    </div>
  );
}
