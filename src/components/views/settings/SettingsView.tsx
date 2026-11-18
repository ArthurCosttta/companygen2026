import * as React from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ActionButton, ModalContainer, SupportTicketModal, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  useConnectionPhaseInfo,
  type WhatsappRuntimeStatus,
} from '@/hooks/useConnectionPhase';
import {
  createEmptyProfile,
  isValidProductionPhone,
  sanitizePhoneE164,
  type BusinessProfile,
} from '@/schemas/profile.schema';
import {
  updateBusinessProfile,
  type ProfileSnapshot,
} from '@/services/profile-service';
import { supabase } from '@/services/supabase-client';
import {
  clearExpressFichaDraft,
  formatBrazilPhoneDisplay,
  formatCentsToInputBrl,
  parsePriceBrlToCents,
  SEGMENT_OPTIONS,
  validatePixKeyInput,
  type OnboardingHelpTopic,
  type OnboardingWizardStep,
} from '@/components/views/onboarding';
import { copyTextToClipboard } from '@/components/views/storefront/storefront-utils';

export interface SettingsViewProps {
  profile: BusinessProfile;
  owner?: string;
  ownerEmail?: string;
  runtimeStatus?: WhatsappRuntimeStatus | null;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onProfileUpdated: (snap: ProfileSnapshot) => void;
  onLogout: () => void;
  onOpenExpressWizard?: (step?: OnboardingWizardStep) => void;
  onOpenWhatsApp?: () => void;
  onOpenPreview?: () => void;
  onOpenWelcome?: () => void;
  onOpenHelp?: (topic?: OnboardingHelpTopic) => void;
}

type HelpCategory = 'all' | 'store' | 'whatsapp' | 'orders';

interface HelpFaqItem {
  id: string;
  category: Exclude<HelpCategory, 'all'>;
  question: string;
  answer: string;
  steps: string[];
}

const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'publish-without-bot',
    category: 'store',
    question: 'Posso publicar minha vitrine antes de conectar o WhatsApp automático?',
    answer:
      'Sim! Assim que sua loja tiver nome, número de WhatsApp válido e pelo menos 1 produto ativo, você já pode publicar a vitrine.',
    steps: [
      'Seus clientes montam a sacola e enviam o pedido pronto direto para o seu WhatsApp pelo link direto.',
      'Quando quiser atender com o painel integrado, basta conectar o QR Code na aba WhatsApp.',
    ],
  },
  {
    id: 'product-without-photo',
    category: 'store',
    question: 'Como cadastrar produtos se eu ainda não tiver foto?',
    answer:
      'Você não precisa esperar pelas fotos para começar a vender. Se não enviar imagem, criamos uma capa limpa automaticamente.',
    steps: [
      'Abra Minha Loja e clique em Cadastrar Novo Produto.',
      'Informe nome e preço em reais; a imagem padrão já fica pronta para publicação.',
      'Depois você pode trocar pela foto real ou copiar um prompt de foto IA.',
    ],
  },
  {
    id: 'pix-key-setup',
    category: 'orders',
    question: 'Como configurar minha Chave Pix para recebimento?',
    answer:
      'Sua chave Pix informada nesta tela é exibida aos clientes e sugerida nas respostas rápidas de pagamento.',
    steps: [
      'Preencha seu CPF, CNPJ, e-mail, celular ou chave aleatória no bloco Chave Pix.',
      'Se preferir, clique em "Usar meu WhatsApp como Pix" e salve os dados da loja.',
    ],
  },
  {
    id: 'whatsapp-qr-expired',
    category: 'whatsapp',
    question: 'O que fazer se o QR Code expirar ou o WhatsApp desconectar?',
    answer:
      'Por segurança, o QR Code tem validade de 45 segundos. Se vencer ou o aparelho desconectar, gere um novo código em um clique.',
    steps: [
      'Acesse a aba WhatsApp no menu.',
      'Clique em "Gerar novo QR Code" e aponte a câmera em Aparelhos Conectados no celular.',
      'Mesmo enquanto desconectado, sua vitrine online continua funcionando com link direto.',
    ],
  },
  {
    id: 'manual-sale-balance',
    category: 'orders',
    question: 'Como lançar uma venda de balcão e corrigir um status cancelado?',
    answer:
      'Na aba Pedidos você registra vendas presenciais ou do Instagram e alterna o status de qualquer pedido sem perder o histórico.',
    steps: [
      'Clique em "Registrar Venda Manual" na aba Pedidos e escolha o item ou valor avulso.',
      'Para ajustar ou reverter um pedido cancelado, clique em "Ver Detalhes" e selecione o novo status.',
    ],
  },
  {
    id: 'offline-zip-backup',
    category: 'store',
    question: 'Como salvar uma cópia da minha vitrine ou usar o guia sem internet?',
    answer:
      'Você pode baixar um pacote ZIP completo da vitrine na aba Minha Loja e consultar esta Central de Ajuda mesmo offline.',
    steps: [
      'Na aba Minha Loja, clique em "Baixar Loja (.ZIP)" para exportar páginas e catálogo.',
      'Esta Central de Ajuda permanece 100% disponível no navegador mesmo sem conexão.',
    ],
  },
];

const PIX_DISCOUNT_PRESETS = [0, 5, 10] as const;

function evaluatePasswordStrength(password: string): {
  level: 'weak' | 'medium' | 'strong';
  label: string;
  barClass: string;
  widthClass: string;
} {
  if (!password) {
    return { level: 'weak', label: 'Digite sua nova senha', barClass: 'bg-slate-200', widthClass: 'w-0' };
  }
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (password.length < 6 || score <= 2) {
    return { level: 'weak', label: 'Senha fraca', barClass: 'bg-[#EF4444]', widthClass: 'w-1/3' };
  }
  if (score <= 3) {
    return { level: 'medium', label: 'Senha média', barClass: 'bg-[#F59E0B]', widthClass: 'w-2/3' };
  }
  return { level: 'strong', label: 'Senha forte', barClass: 'bg-[#16A34A]', widthClass: 'w-full' };
}

export function SettingsView({
  profile,
  owner,
  ownerEmail,
  runtimeStatus,
  onProfileUpdated,
  onLogout,
  onOpenExpressWizard,
  onOpenWhatsApp,
  onOpenPreview,
  onOpenWelcome,
  onOpenHelp,
}: SettingsViewProps) {
  const { showToast } = useToast();
  const phaseInfo = useConnectionPhaseInfo(profile, runtimeStatus);
  const [supportModalOpen, setSupportModalOpen] = React.useState(false);

  // TELA 30: Dados da Loja & Pix
  const [businessName, setBusinessName] = React.useState(profile.business?.name ?? '');
  const [segment, setSegment] = React.useState(profile.business?.segment || 'Geral');
  const [phoneInput, setPhoneInput] = React.useState(() =>
    formatBrazilPhoneDisplay(profile.whatsapp?.phoneE164 || profile.whatsapp?.displayPhone || ''),
  );
  const [address, setAddress] = React.useState(profile.business?.address ?? '');
  const [hours, setHours] = React.useState(profile.business?.hours || 'Seg a Sáb · 09h às 19h');
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(profile.delivery?.deliveryEnabled !== false);
  const [pickupEnabled, setPickupEnabled] = React.useState(profile.delivery?.pickupEnabled !== false);
  const [deliveryFeeInput, setDeliveryFeeInput] = React.useState(() =>
    formatCentsToInputBrl(profile.delivery?.defaultFeeCents ?? 0),
  );
  const [deliveryAreasText, setDeliveryAreasText] = React.useState(() =>
    (profile.delivery?.areas ?? []).join(', '),
  );
  const [pickupHours, setPickupHours] = React.useState(
    profile.delivery?.pickupHours || 'Seg a Sáb · 09h às 18h',
  );
  const [pixKey, setPixKey] = React.useState(profile.payment?.pixKey ?? '');
  const [pixDiscountPercent, setPixDiscountPercent] = React.useState(
    profile.payment?.pixDiscountPercent ?? 0,
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [savedStoreNotice, setSavedStoreNotice] = React.useState(false);

  // Sync form when profile updates externally (e.g., wizard or reset)
  React.useEffect(() => {
    setBusinessName(profile.business?.name ?? '');
    setSegment(profile.business?.segment || 'Geral');
    setPhoneInput(
      formatBrazilPhoneDisplay(profile.whatsapp?.phoneE164 || profile.whatsapp?.displayPhone || ''),
    );
    setAddress(profile.business?.address ?? '');
    setHours(profile.business?.hours || 'Seg a Sáb · 09h às 19h');
    setDeliveryEnabled(profile.delivery?.deliveryEnabled !== false);
    setPickupEnabled(profile.delivery?.pickupEnabled !== false);
    setDeliveryFeeInput(formatCentsToInputBrl(profile.delivery?.defaultFeeCents ?? 0));
    setDeliveryAreasText((profile.delivery?.areas ?? []).join(', '));
    setPickupHours(profile.delivery?.pickupHours || 'Seg a Sáb · 09h às 18h');
    setPixKey(profile.payment?.pixKey ?? '');
    setPixDiscountPercent(profile.payment?.pixDiscountPercent ?? 0);
  }, [profile]);

  // Security Modals: Alterar Senha & Confirmar Saída
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showCurrentPwd, setShowCurrentPwd] = React.useState(false);
  const [showNewPwd, setShowNewPwd] = React.useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = React.useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = React.useState(false);

  const [logoutModalOpen, setLogoutModalOpen] = React.useState(false);
  const logoutCancelRef = React.useRef<HTMLButtonElement | null>(null);

  // TELA 31: Resetar Dados da Loja (Dupla Confirmação alertdialog + initialFocus="cancel")
  const [resetStep1Open, setResetStep1Open] = React.useState(false);
  const [resetStep2Open, setResetStep2Open] = React.useState(false);
  const [resetConfirmText, setResetConfirmText] = React.useState('');
  const [isResetting, setIsResetting] = React.useState(false);
  const resetStep1CancelRef = React.useRef<HTMLButtonElement | null>(null);
  const resetStep2CancelRef = React.useRef<HTMLButtonElement | null>(null);

  // TELA 32: Central de Ajuda & Suporte Offline-Capable
  const [isOnline, setIsOnline] = React.useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [helpSearch, setHelpSearch] = React.useState('');
  const [helpCategory, setHelpCategory] = React.useState<HelpCategory>('all');
  const [openFaqIds, setOpenFaqIds] = React.useState<Record<string, boolean>>({
    'publish-without-bot': true,
  });
  const [copiedDiagnostic, setCopiedDiagnostic] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  React.useEffect(() => {
    if (!copiedDiagnostic) return;
    const t = window.setTimeout(() => setCopiedDiagnostic(false), 2500);
    return () => window.clearTimeout(t);
  }, [copiedDiagnostic]);

  // Validations (TELA 30)
  const cleanName = businessName.trim();
  const isNameValid = cleanName.length >= 2;
  const phoneE164 = sanitizePhoneE164(phoneInput);
  const isPhoneValid = isValidProductionPhone(phoneE164);
  const pixCheck = validatePixKeyInput(pixKey);
  const hasDeliveryMethod = deliveryEnabled || pickupEnabled;
  const canSaveStore =
    isNameValid && isPhoneValid && pixCheck.valid && hasDeliveryMethod && !isSaving;

  async function handleSaveStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveStore) return;
    setIsSaving(true);
    try {
      const feeCents = parsePriceBrlToCents(deliveryFeeInput);
      const areas = deliveryAreasText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const snap = await updateBusinessProfile(
        (draft) => {
          draft.business = {
            ...draft.business,
            name: cleanName,
            segment: segment.trim() || 'Geral',
            address: address.trim(),
            hours: hours.trim() || 'Seg a Sáb · 09h às 19h',
          };
          draft.whatsapp = {
            ...draft.whatsapp,
            phoneE164,
            displayPhone: formatBrazilPhoneDisplay(phoneE164),
          };
          draft.delivery = {
            ...draft.delivery,
            deliveryEnabled,
            pickupEnabled,
            defaultFeeCents: feeCents,
            areas,
            pickupHours: pickupHours.trim() || 'Seg a Sáb · 09h às 18h',
          };
          draft.payment = {
            ...draft.payment,
            pixKey: pixKey.trim(),
            pixDiscountPercent,
          };
        },
        undefined,
        owner,
      );

      onProfileUpdated(snap);
      setSavedStoreNotice(true);
      showToast({
        type: 'success',
        message: 'Configurações salvas com sucesso!',
        durationMs: 3000,
      });
    } catch {
      showToast({
        type: 'error',
        message: 'Não foi possível salvar as configurações. Tente novamente.',
        durationMs: 4000,
      });
    } finally {
      setIsSaving(false);
    }
  }

  // Password Change (Security Modal)
  const passwordStrength = evaluatePasswordStrength(newPassword);
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmitPassword =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword &&
    !isUpdatingPassword;

  async function handleSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPassword) return;
    setIsUpdatingPassword(true);
    try {
      if (ownerEmail) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: currentPassword,
        });
        if (verifyError) {
          showToast({
            type: 'error',
            message: 'Senha atual incorreta. Verifique e tente novamente.',
            durationMs: 3500,
          });
          setIsUpdatingPassword(false);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        showToast({
          type: 'error',
          message: 'Não foi possível alterar a senha agora. Tente novamente.',
          durationMs: 3500,
        });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordModalOpen(false);
      showToast({
        type: 'success',
        message: 'Senha de acesso alterada com sucesso!',
        durationMs: 3000,
      });
    } catch {
      showToast({
        type: 'error',
        message: 'Senha atual incorreta. Verifique e tente novamente.',
        durationMs: 3500,
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  function handleConfirmLogout() {
    setLogoutModalOpen(false);
    showToast({
      type: 'neutral',
      message: 'Sessão encerrada com segurança.',
      durationMs: 2000,
    });
    onLogout();
  }

  // TELA 31: Double confirmation reset
  const isResetWordMatch = resetConfirmText.trim().toUpperCase() === 'RESETAR';

  async function handleExecuteStoreReset() {
    if (!isResetWordMatch || isResetting) return;
    setIsResetting(true);
    try {
      const snap = await updateBusinessProfile(
        (draft) => {
          const fresh = createEmptyProfile();
          draft.onboarding = fresh.onboarding;
          draft.business = fresh.business;
          draft.whatsapp = fresh.whatsapp;
          draft.payment = fresh.payment;
          draft.delivery = fresh.delivery;
          draft.brand = fresh.brand;
          draft.catalog = fresh.catalog;
          draft.publishedStore = fresh.publishedStore;
        },
        { publish: false },
        owner,
      );
      clearExpressFichaDraft(owner);
      setResetStep2Open(false);
      setResetStep1Open(false);
      setResetConfirmText('');
      onProfileUpdated(snap);
      showToast({
        type: 'neutral',
        title: 'Loja reiniciada',
        message: 'Todos os dados da loja foram zerados. Você pode configurar tudo do zero.',
        durationMs: 3500,
      });
    } catch {
      showToast({
        type: 'error',
        message: 'Não foi possível resetar os dados agora. Tente novamente.',
        durationMs: 4000,
      });
    } finally {
      setIsResetting(false);
    }
  }

  // TELA 32: Offline FAQ filtering & diagnostic summary copy
  const filteredFaqs = React.useMemo(() => {
    const q = helpSearch.trim().toLowerCase();
    return HELP_FAQ_ITEMS.filter((item) => {
      if (helpCategory !== 'all' && item.category !== helpCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.steps.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [helpSearch, helpCategory]);

  async function handleCopyDiagnostic() {
    const activeCount = (profile.catalog?.products ?? []).filter((p) => p.active !== false).length;
    const summary = [
      `Resumo da Loja — CompanyGen`,
      `Loja: ${profile.business?.name?.trim() || 'Não informado'}`,
      `Produtos ativos: ${activeCount}`,
      `Vitrine publicada: ${profile.publishedStore?.published ? 'Sim' : 'Não'}`,
      `Atendimento WhatsApp: ${phaseInfo.labelPT}`,
      `Entrega: ${profile.delivery?.deliveryEnabled ? 'Ativa' : 'Desativada'} | Retirada: ${profile.delivery?.pickupEnabled ? 'Ativa' : 'Desativada'}`,
      `Chave Pix configurada: ${profile.payment?.pixKey?.trim() ? 'Sim' : 'Não'}`,
      `Status de rede: ${isOnline ? 'Online' : 'Offline'}`,
    ].join('\n');

    const ok = await copyTextToClipboard(summary);
    if (ok) {
      setCopiedDiagnostic(true);
      showToast({
        type: 'success',
        message: 'Resumo da loja copiado! Envie para o suporte quando precisar.',
        durationMs: 3000,
      });
    }
  }

  const toggleFaq = (id: string) => {
    setOpenFaqIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 pb-24 sm:p-6 min-[769px]:pb-10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Ajustes da Loja
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Atualize dados comerciais, entrega, chave Pix, segurança e suporte da sua loja.
          </p>
        </div>
      </header>

      {/* ====================================================================
       * TELA 30: Dados da Loja, Entrega/Retirada & Chave Pix
       * ================================================================== */}
      <form
        role="form"
        aria-label="Configurações da Loja"
        onSubmit={handleSaveStore}
        className="space-y-6"
      >
        {/* Bloco 1: Dados da Empresa */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <Store className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">Dados da Loja</h2>
                <p className="text-xs text-slate-500">
                  Nome, WhatsApp de pedidos, cidade/bairro e horário de funcionamento.
                </p>
              </div>
            </div>

            {onOpenExpressWizard ? (
              <ActionButton
                variant="softBlue"
                size={44}
                leftIcon={<Sparkles className="size-4" />}
                onClick={() => onOpenExpressWizard(1)}
              >
                Abrir Assistente Guiado
              </ActionButton>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-store-name"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Nome da loja *
              </label>
              <input
                id="settings-store-name"
                aria-label="Nome da loja"
                type="text"
                required
                maxLength={80}
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  setSavedStoreNotice(false);
                }}
                placeholder="Ex: Atelier Bella Vista"
                className={cn(
                  'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                  !isNameValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                )}
              />
              {!isNameValid ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  Informe pelo menos 2 letras para o nome da loja.
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="settings-store-segment"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Ramo de atividade
              </label>
              <select
                id="settings-store-segment"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                {segment && !SEGMENT_OPTIONS.includes(segment as (typeof SEGMENT_OPTIONS)[number]) ? (
                  <option value={segment}>{segment}</option>
                ) : null}
                {SEGMENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-store-whatsapp"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                WhatsApp da loja (com DDD) *
              </label>
              <input
                id="settings-store-whatsapp"
                type="tel"
                inputMode="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(formatBrazilPhoneDisplay(e.target.value))}
                placeholder="(11) 98765-4321"
                className={cn(
                  'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                  !isPhoneValid
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                )}
              />
              {!isPhoneValid ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  Informe um celular com DDD válido (10 ou 11 dígitos).
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="settings-store-hours"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Horário de atendimento
              </label>
              <input
                id="settings-store-hours"
                type="text"
                maxLength={100}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: Seg a Sáb · 09h às 19h"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="settings-store-address"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[#0F172A]"
              >
                <MapPin className="size-4 text-slate-500" aria-hidden="true" />
                <span>Cidade / Bairro / Endereço</span>
              </label>
              <input
                id="settings-store-address"
                type="text"
                maxLength={180}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Centro, Campinas - SP (ou endereço para retirada)"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          </div>

          {/* Entrega e Retirada */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-[#2563EB]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#0F172A]">Entrega e Retirada</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={deliveryEnabled}
                  onChange={(e) => setDeliveryEnabled(e.target.checked)}
                  className="size-4 accent-[#2563EB]"
                />
                <span className="text-sm font-semibold text-[#0F172A]">
                  Faço entregas (motoboy / correio)
                </span>
              </label>

              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={pickupEnabled}
                  onChange={(e) => setPickupEnabled(e.target.checked)}
                  className="size-4 accent-[#2563EB]"
                />
                <span className="text-sm font-semibold text-[#0F172A]">
                  Cliente pode retirar no local
                </span>
              </label>
            </div>

            {!hasDeliveryMethod ? (
              <p role="alert" className="text-xs font-medium text-red-600">
                Selecione pelo menos uma opção: entrega ou retirada no local.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label
                  htmlFor="settings-delivery-fee"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  Taxa de entrega padrão (R$)
                </label>
                <input
                  id="settings-delivery-fee"
                  type="text"
                  inputMode="decimal"
                  disabled={!deliveryEnabled}
                  value={deliveryFeeInput}
                  onChange={(e) => setDeliveryFeeInput(e.target.value)}
                  placeholder="0,00"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A] disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="settings-delivery-areas"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  Bairros atendidos (separados por vírgula)
                </label>
                <input
                  id="settings-delivery-areas"
                  type="text"
                  disabled={!deliveryEnabled}
                  value={deliveryAreasText}
                  onChange={(e) => setDeliveryAreasText(e.target.value)}
                  placeholder="Centro, Jardins, Zona Sul"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A] disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-pickup-hours"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  Horário de retirada
                </label>
                <input
                  id="settings-pickup-hours"
                  type="text"
                  disabled={!pickupEnabled}
                  value={pickupHours}
                  onChange={(e) => setPickupHours(e.target.value)}
                  placeholder="Seg a Sáb · 09h às 18h"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A] disabled:bg-slate-100 disabled:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Bloco 2: Chave Pix para Recebimento */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-[#16A34A]">
                <CreditCard className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0F172A]">Chave Pix para Recebimento</h2>
                <p className="text-xs text-slate-500">
                  Sua chave Pix cadastrada aqui será sugerida automaticamente aos clientes no WhatsApp quando eles finalizarem um pedido.
                </p>
              </div>
            </div>

            {isPhoneValid ? (
              <button
                type="button"
                onClick={() => setPixKey(phoneE164.replace(/^55/, ''))}
                className="min-h-[44px] rounded-xl border border-blue-200 bg-[#EFF6FF] px-3.5 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                Usar WhatsApp como Pix
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-pix-key"
                className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
              >
                Chave Pix (CPF, CNPJ, E-mail, Celular ou Aleatória)
              </label>
              <input
                id="settings-pix-key"
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Informe sua chave Pix"
                className={cn(
                  'min-h-[48px] w-full rounded-xl border bg-white px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                  !pixCheck.valid
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                )}
              />
              {!pixCheck.valid ? (
                <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                  Informe uma chave Pix válida (CNPJ, CPF, E-mail ou Telefone)
                </p>
              ) : null}
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-[#0F172A]">
                Desconto à vista no Pix
              </span>
              <div className="flex flex-wrap gap-2">
                {PIX_DISCOUNT_PRESETS.map((pct) => {
                  const selected = pixDiscountPercent === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPixDiscountPercent(pct)}
                      className={cn(
                        'min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition-colors',
                        selected
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {pct === 0 ? 'Sem desconto' : `${pct}% OFF`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-2">
              {onOpenWhatsApp ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<MessageSquare className="size-4" />}
                  onClick={onOpenWhatsApp}
                >
                  Gerenciar WhatsApp
                </ActionButton>
              ) : null}
              {onOpenPreview ? (
                <ActionButton
                  variant="secondary"
                  size={44}
                  leftIcon={<Eye className="size-4" />}
                  onClick={onOpenPreview}
                >
                  Ver Vitrine
                </ActionButton>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto sm:justify-end">
              {savedStoreNotice ? (
                <span className="text-xs font-semibold text-emerald-700">Nome salvo.</span>
              ) : null}
              <ActionButton
                type="submit"
                variant="primary"
                size={46}
                aria-label="Salvar Dados da Loja · Salvar nome"
                disabled={!canSaveStore}
                isLoading={isSaving}
                loadingText="Salvando..."
                leftIcon={<Save className="size-[17px]" />}
                className="w-full sm:w-auto sm:min-w-[220px]"
              >
                Salvar Dados da Loja
              </ActionButton>
            </div>
          </div>
        </section>
      </form>

      {/* ====================================================================
       * Segurança da Conta (Alterar Senha & Logout Seguro)
       * ================================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-[#0F172A]">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">Segurança da Conta</h2>
            <p className="text-xs text-slate-500">
              {ownerEmail ? `Conectado como ${ownerEmail}` : 'Gerencie sua senha e acesso ao painel.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActionButton
            variant="secondary"
            size={44}
            leftIcon={<KeyRound className="size-4" />}
            onClick={() => setPasswordModalOpen(true)}
          >
            Alterar Senha
          </ActionButton>

          <ActionButton
            variant="danger"
            size={44}
            leftIcon={<LogOut className="size-4" />}
            onClick={() => setLogoutModalOpen(true)}
          >
            Sair da Conta
          </ActionButton>
        </div>
      </section>

      {/* ====================================================================
       * TELA 32: Central de Ajuda & Suporte (100% Offline-Capable)
       * ================================================================== */}
      <section
        aria-label="Central de Ajuda e Suporte"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <LifeBuoy className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Central de Ajuda e Suporte</h2>
              <p className="text-xs text-slate-500">
                Guia prático disponível a qualquer momento, mesmo se você estiver sem internet.
              </p>
            </div>
          </div>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
              isOnline
                ? 'border-emerald-200 bg-emerald-50 text-[#16A34A]'
                : 'border-amber-200 bg-amber-50 text-amber-800',
            )}
          >
            {isOnline ? (
              <Wifi className="size-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="size-3.5" aria-hidden="true" />
            )}
            <span>{isOnline ? 'Guia Offline + Online Ativo' : 'Modo Offline — Guia Disponível'}</span>
          </span>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={helpSearch}
              onChange={(e) => setHelpSearch(e.target.value)}
              placeholder="Buscar dúvida (ex: Pix, QR Code, entrega, catálogo)..."
              aria-label="Buscar na Central de Ajuda"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pr-3.5 pl-10 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'Tudo'],
                ['store', 'Minha Loja'],
                ['whatsapp', 'WhatsApp'],
                ['orders', 'Pedidos & Pix'],
              ] as const
            ).map(([cat, label]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setHelpCategory(cat)}
                className={cn(
                  'min-h-[44px] rounded-xl border px-3.5 text-xs font-semibold transition-colors',
                  helpCategory === cat
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-2.5">
          {filteredFaqs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
              Nenhuma dúvida encontrada para “{helpSearch}”.{' '}
              <button
                type="button"
                onClick={() => {
                  setHelpSearch('');
                  setHelpCategory('all');
                }}
                className="font-semibold text-[#2563EB] underline underline-offset-4"
              >
                Limpar busca
              </button>
            </div>
          ) : (
            filteredFaqs.map((item) => {
              const expanded = Boolean(openFaqIds[item.id]);
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleFaq(item.id)}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[#0F172A] hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    <span>{item.question}</span>
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-slate-500 transition-transform duration-200',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded ? (
                    <div className="border-t border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600 space-y-2">
                      <p className="leading-relaxed text-[#0F172A]">{item.answer}</p>
                      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
                        {item.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Support Actions */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
          <ActionButton
            variant="primary"
            size={44}
            data-testid="settings-open-support-ticket-btn"
            leftIcon={<LifeBuoy className="size-4" />}
            onClick={() => setSupportModalOpen(true)}
          >
            Reportar Problema / Suporte
          </ActionButton>

          <ActionButton
            variant="softBlue"
            size={44}
            leftIcon={<CreditCard className="size-4" />}
            onClick={() => {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set('route', 'checkout');
                url.searchParams.set('tab', 'ledger');
                window.history.pushState({}, '', url.toString());
              } catch {}
              window.dispatchEvent(new CustomEvent('companygen:open-checkout'));
            }}
          >
            Extrato & Consumo de Créditos
          </ActionButton>

          <ActionButton
            variant={copiedDiagnostic ? 'success' : 'secondary'}
            size={44}
            leftIcon={copiedDiagnostic ? <Check className="size-4" /> : <Copy className="size-4" />}
            onClick={() => void handleCopyDiagnostic()}
          >
            {copiedDiagnostic ? 'Resumo Copiado!' : 'Copiar Resumo para Suporte'}
          </ActionButton>

          {onOpenWelcome ? (
            <ActionButton
              variant="secondary"
              size={44}
              leftIcon={<Sparkles className="size-4 text-[#2563EB]" />}
              onClick={onOpenWelcome}
            >
              Rever Boas-vindas da Loja
            </ActionButton>
          ) : null}

          {onOpenHelp ? (
            <ActionButton
              variant="softBlue"
              size={44}
              leftIcon={<HelpCircle className="size-4" />}
              onClick={() => onOpenHelp('general')}
            >
              Guia Rápido Passo a Passo
            </ActionButton>
          ) : null}
        </div>
      </section>

      {/* ====================================================================
       * TELA 31: Resetar Dados / Loja (Dupla Confirmação)
       * ================================================================== */}
      <section
        aria-label="Reiniciar dados da loja"
        className="rounded-2xl border border-red-200 bg-red-50/40 p-5 sm:p-6 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-[#DC2626]">
              <RotateCcw className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">Resetar Dados da Loja</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Apaga configurações da loja, catálogo atual e despublica a vitrine para recomeçar do zero.
              </p>
            </div>
          </div>

          <ActionButton
            variant="danger"
            size={44}
            leftIcon={<RotateCcw className="size-4" />}
            onClick={() => {
              setResetConfirmText('');
              setResetStep1Open(true);
            }}
            data-testid="settings-open-reset-btn"
          >
            Resetar Dados da Loja
          </ActionButton>
        </div>
      </section>

      {/* ====================================================================
       * TELA 31 — Confirmação 1 de 2 (alertdialog + initialFocus="cancel")
       * ================================================================== */}
      <ModalContainer
        open={resetStep1Open}
        onOpenChange={setResetStep1Open}
        role="alertdialog"
        initialFocus="cancel"
        cancelRef={resetStep1CancelRef}
        maxWidth="sm"
        mobileHeight="auto"
        title={
          <span className="flex items-center gap-2 text-[#0F172A]">
            <AlertTriangle className="size-5 text-[#EF4444]" aria-hidden="true" />
            <span>Resetar dados da sua loja?</span>
          </span>
        }
        description="Esta ação limpa os dados comerciais e produtos configurados para você recomeçar do zero."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              ref={resetStep1CancelRef}
              data-modal-cancel="true"
              variant="secondary"
              size={44}
              onClick={() => setResetStep1Open(false)}
            >
              Cancelar e Manter Loja
            </ActionButton>
            <ActionButton
              variant="danger"
              size={44}
              onClick={() => {
                setResetStep1Open(false);
                setResetConfirmText('');
                setResetStep2Open(true);
              }}
            >
              Continuar para Confirmação
            </ActionButton>
          </div>
        }
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-950">
          Sua vitrine ficará fora do ar até que você conclua a nova configuração inicial. Pedidos já registrados permanecem no histórico.
        </div>
      </ModalContainer>

      {/* ====================================================================
       * TELA 31 — Confirmação 2 de 2 (Dupla confirmação alertdialog + initialFocus="cancel")
       * ================================================================== */}
      <ModalContainer
        open={resetStep2Open}
        onOpenChange={(next) => {
          if (!isResetting) setResetStep2Open(next);
        }}
        role="alertdialog"
        initialFocus="cancel"
        cancelRef={resetStep2CancelRef}
        preventCloseWhileSubmitting={isResetting}
        maxWidth="sm"
        mobileHeight="auto"
        title={
          <span className="flex items-center gap-2 text-[#0F172A]">
            <AlertTriangle className="size-5 text-[#EF4444]" aria-hidden="true" />
            <span>Confirmação final de reset</span>
          </span>
        }
        description="Digite RESETAR abaixo para confirmar que deseja limpar os dados atuais da loja."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              ref={resetStep2CancelRef}
              data-modal-cancel="true"
              variant="secondary"
              size={44}
              disabled={isResetting}
              onClick={() => setResetStep2Open(false)}
            >
              Cancelar, Não Resetar
            </ActionButton>
            <ActionButton
              variant="danger"
              size={44}
              disabled={!isResetWordMatch}
              isLoading={isResetting}
              loadingText="Resetando..."
              onClick={() => void handleExecuteStoreReset()}
            >
              Confirmar Reset da Loja
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-3">
          <label
            htmlFor="reset-confirm-input"
            className="block text-sm font-semibold text-[#0F172A]"
          >
            Escreva <span className="font-mono text-[#DC2626]">RESETAR</span> para liberar
          </label>
          <input
            id="reset-confirm-input"
            type="text"
            autoComplete="off"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="Digite RESETAR"
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-[#0F172A] focus:border-[#EF4444] focus:outline-none focus:ring-2 focus:ring-red-200"
          />
        </div>
      </ModalContainer>

      {/* ====================================================================
       * Modal Alterar Senha
       * ================================================================== */}
      <ModalContainer
        open={passwordModalOpen}
        onOpenChange={(next) => {
          if (!isUpdatingPassword) setPasswordModalOpen(next);
        }}
        role="dialog"
        maxWidth="sm"
        mobileHeight="85%"
        preventCloseWhileSubmitting={isUpdatingPassword}
        title="Alterar Senha"
        description="Atualize a senha de acesso ao painel da sua loja."
        footer={
          <ActionButton
            type="submit"
            form="settings-change-password-form"
            variant="primary"
            size={44}
            fullWidth
            disabled={!canSubmitPassword}
            isLoading={isUpdatingPassword}
            loadingText="Atualizando..."
            rightIcon={<Check className="size-[17px]" />}
          >
            Confirmar Nova Senha
          </ActionButton>
        }
      >
        <form
          id="settings-change-password-form"
          onSubmit={handleSubmitPassword}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="pwd-current"
              className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
            >
              Senha Atual
            </label>
            <div className="relative">
              <input
                id="pwd-current"
                type={showCurrentPwd ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pr-12 pl-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <button
                type="button"
                aria-label={showCurrentPwd ? 'Ocultar senha atual' : 'Mostrar senha atual'}
                onClick={() => setShowCurrentPwd((v) => !v)}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                {showCurrentPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="pwd-new"
              className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
            >
              Nova Senha (Mínimo 6 caracteres)
            </label>
            <div className="relative">
              <input
                id="pwd-new"
                type={showNewPwd ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white pr-12 pl-3.5 text-sm text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <button
                type="button"
                aria-label={showNewPwd ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                onClick={() => setShowNewPwd((v) => !v)}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                {showNewPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    'h-full transition-all duration-200',
                    passwordStrength.barClass,
                    passwordStrength.widthClass,
                  )}
                />
              </div>
              <p className="text-xs font-medium text-slate-600">{passwordStrength.label}</p>
            </div>
          </div>

          <div>
            <label
              htmlFor="pwd-confirm"
              className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
            >
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <input
                id="pwd-confirm"
                type={showConfirmPwd ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={cn(
                  'min-h-[48px] w-full rounded-xl border bg-white pr-12 pl-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2',
                  passwordsMismatch
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : 'border-slate-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20',
                )}
              />
              <button
                type="button"
                aria-label={showConfirmPwd ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                onClick={() => setShowConfirmPwd((v) => !v)}
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                {showConfirmPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {passwordsMismatch ? (
              <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                As novas senhas não coincidem
              </p>
            ) : null}
          </div>
        </form>
      </ModalContainer>

      {/* ====================================================================
       * Modal Confirmar Saída / Logout (alertdialog + initialFocus="cancel")
       * ================================================================== */}
      <ModalContainer
        open={logoutModalOpen}
        onOpenChange={setLogoutModalOpen}
        role="alertdialog"
        initialFocus="cancel"
        cancelRef={logoutCancelRef}
        maxWidth="md"
        mobileHeight="auto"
        title="Deseja Sair da Sua Loja?"
        description="Você poderá entrar novamente a qualquer momento com seu e-mail e senha."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
            <ActionButton
              ref={logoutCancelRef}
              data-modal-cancel="true"
              variant="secondary"
              size={44}
              onClick={() => setLogoutModalOpen(false)}
            >
              Continuar no Painel
            </ActionButton>
            <ActionButton
              variant="danger"
              size={44}
              leftIcon={<LogOut className="size-4" />}
              onClick={handleConfirmLogout}
            >
              Sim, Sair da Conta Agora
            </ActionButton>
          </div>
        }
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm leading-relaxed text-emerald-950">
          Sua loja online continua no ar recebendo pedidos de clientes normalmente.
        </div>
      </ModalContainer>

      <SupportTicketModal
        open={supportModalOpen}
        onOpenChange={setSupportModalOpen}
        userId={owner}
        storeName={profile.business?.name}
      />
    </div>
  );
}
