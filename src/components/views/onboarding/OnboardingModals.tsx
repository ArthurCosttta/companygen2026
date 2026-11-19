import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Check,
  Copy,
  Download,
  HelpCircle,
  Monitor,
  PartyPopper,
  QrCode,
  Share2,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';
import { renderQrPngDataUrl } from '@/utils/qrPng';
import { contrastRatio } from '@/utils/logoColorExtractor';
import {
  buildPublicStoreShareUrl,
  type ExpressFichaDraft,
  type OnboardingHelpTopic,
} from './onboarding-helpers';

/* ============================================================================
 * TELA 09: Salvar e sair / Rascunho
 * ========================================================================== */

export interface SaveDraftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftSummary?: Partial<
    Pick<ExpressFichaDraft, 'businessName' | 'phoneInput' | 'productName' | 'pixKey'>
  >;
  isSaving?: boolean;
  onSaveDraftAndExit: () => Promise<void> | void;
  onContinueEditing: () => void;
  onRequestDiscard: () => void;
}

export function SaveDraftModal({
  open,
  onOpenChange,
  draftSummary,
  isSaving = false,
  onSaveDraftAndExit,
  onContinueEditing,
  onRequestDiscard,
}: SaveDraftModalProps) {
  const { showToast } = useToast();

  const filledItems = React.useMemo(() => {
    const items: string[] = [];
    if (draftSummary?.businessName?.trim()) {
      items.push(`Nome da loja: ${draftSummary.businessName.trim()}`);
    }
    if (draftSummary?.phoneInput?.trim()) {
      items.push(`WhatsApp: ${draftSummary.phoneInput.trim()}`);
    }
    if (draftSummary?.productName?.trim()) {
      items.push(`Produto: ${draftSummary.productName.trim()}`);
    }
    if (draftSummary?.pixKey?.trim()) {
      items.push('Chave Pix preenchida');
    }
    return items;
  }, [draftSummary]);

  const handleSaveAndExit = async () => {
    await onSaveDraftAndExit();
    showToast({
      type: 'success',
      title: 'Rascunho salvo com segurança',
      message: 'Você pode retomar sua configuração de onde parou a qualquer momento.',
      durationMs: 3000,
    });
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="sm"
      mobileHeight="auto"
      preventCloseWhileSubmitting={isSaving}
      title={
        <span className="inline-flex items-center gap-2">
          <BookmarkCheck className="size-5 text-[#2563EB]" aria-hidden="true" />
          <span>Salvar progresso e sair?</span>
        </span>
      }
      description="Guarde o que você já preencheu para continuar depois sem perder nenhum dado."
      footer={
        <div className="flex flex-col gap-2">
          <ActionButton
            variant="primary"
            size={48}
            fullWidth
            isLoading={isSaving}
            loadingText="Salvando rascunho..."
            onClick={handleSaveAndExit}
          >
            Salvar Rascunho e Sair
          </ActionButton>
          <ActionButton
            variant="secondary"
            size={44}
            fullWidth
            disabled={isSaving}
            onClick={onContinueEditing}
          >
            Continuar Editando
          </ActionButton>
          <button
            type="button"
            disabled={isSaving}
            onClick={onRequestDiscard}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl text-sm font-semibold text-[#DC2626] transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444] disabled:opacity-50"
          >
            Sair sem salvar alterações
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p className="leading-relaxed">
          Seu rascunho fica guardado neste navegador e você poderá retomar exatamente desta etapa pelo painel inicial.
        </p>

        {filledItems.length > 0 ? (
          <div className="rounded-xl border border-blue-100 bg-[#EFF6FF] p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">
              Itens que serão preservados
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-[#0F172A]">
              {filledItems.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
                  <span className="truncate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ModalContainer>
  );
}

/* ============================================================================
 * TELA 10: Confirmar saída (Descarte)
 * ========================================================================== */

export interface ConfirmExitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelExit: () => void;
  onConfirmExit: () => void;
}

export function ConfirmExitModal({
  open,
  onOpenChange,
  onCancelExit,
  onConfirmExit,
}: ConfirmExitModalProps) {
  const cancelBtnRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      initialFocus="cancel"
      cancelRef={cancelBtnRef}
      maxWidth="sm"
      mobileHeight="auto"
      title={
        <span className="inline-flex items-center gap-2 text-[#0F172A]">
          <AlertTriangle className="size-5 text-[#F59E0B]" aria-hidden="true" />
          <span>Sair sem salvar alterações?</span>
        </span>
      }
      description="As informações digitadas nesta janela que ainda não foram salvas serão descartadas."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton
            ref={cancelBtnRef}
            data-modal-cancel="true"
            variant="secondary"
            size={44}
            onClick={onCancelExit}
          >
            Continuar Preenchendo
          </ActionButton>
          <ActionButton
            variant="danger"
            size={44}
            onClick={onConfirmExit}
          >
            Descartar e Sair
          </ActionButton>
        </div>
      }
    >
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm leading-relaxed text-amber-950">
        <p>
          Os dados que já foram salvos antes continuam seguros. Apenas as edições pendentes desta tela serão perdidas.
        </p>
      </div>
    </ModalContainer>
  );
}

/* ============================================================================
 * TELA 11: Ajuda contextual
 * ========================================================================== */

interface HelpTopicContent {
  title: string;
  subtitle: string;
  tips: Array<{ heading: string; body: string }>;
}

const HELP_CONTENT_BY_TOPIC: Record<OnboardingHelpTopic, HelpTopicContent> = {
  general: {
    title: 'Como funciona a configuração rápida',
    subtitle: 'Em poucos minutos sua vitrine fica online e pronta para receber pedidos.',
    tips: [
      {
        heading: '1. Dados da loja e WhatsApp',
        body: 'Informe o nome da sua loja, o número de WhatsApp com DDD que vai receber os pedidos e se você faz entregas ou retirada.',
      },
      {
        heading: '2. Primeiro produto',
        body: 'Cadastre pelo menos um produto com nome e preço. Se ainda não tiver foto, colocamos uma imagem provisória elegante para você publicar agora.',
      },
      {
        heading: '3. Pagamento e publicação',
        body: 'Adicione sua chave Pix se quiser receber por Pix e publique sua vitrine. Depois você pode editar tudo com calma.',
      },
    ],
  },
  ficha: {
    title: 'Ajuda: Nome, WhatsApp e Entrega',
    subtitle: 'Esses dados aparecem no cabeçalho e no botão de pedido da sua loja.',
    tips: [
      {
        heading: 'WhatsApp com DDD válido',
        body: 'Digite o DDD e o número completo do celular (ex.: (11) 98765-4321). É para esse número que os clientes vão enviar os pedidos.',
      },
      {
        heading: 'Entrega ou Retirada',
        body: 'Ative as opções que sua loja oferece. Se cobrar taxa fixa de entrega, informe o valor em reais; deixe 0,00 para combinar depois.',
      },
      {
        heading: 'Posso mudar depois?',
        body: 'Sim! Nome, ramo, telefone e regras de entrega podem ser alterados a qualquer momento em Configurações.',
      },
    ],
  },
  product: {
    title: 'Ajuda: Primeiro Produto',
    subtitle: 'Você só precisa de um item para liberar a criação da sua vitrine.',
    tips: [
      {
        heading: 'Preço em reais',
        body: 'Digite normalmente com vírgula, como 49,90 ou 120,00. O sistema calcula tudo automaticamente.',
      },
      {
        heading: 'Foto do produto',
        body: 'Você pode enviar uma foto agora ou deixar sem foto: criamos uma imagem limpa do produto para sua loja publicar sem bloqueios.',
      },
      {
        heading: 'Catálogo completo depois',
        body: 'Assim que terminar, você terá acesso à área de Vitrine & Catálogo para cadastrar quantos produtos quiser ou importar planilha.',
      },
    ],
  },
  pix: {
    title: 'Ajuda: Chave Pix e Pagamento',
    subtitle: 'Facilite o pagamento dos seus clientes logo na finalização do pedido.',
    tips: [
      {
        heading: 'Qual chave usar?',
        body: 'Você pode usar CPF, CNPJ, e-mail, celular ou chave aleatória — exatamente a mesma que usa no seu banco.',
      },
      {
        heading: 'Desconto no Pix (opcional)',
        body: 'Se quiser incentivar pagamentos à vista, escolha uma porcentagem como 5% ou 10%. Caso contrário, deixe em 0%.',
      },
      {
        heading: 'E se eu não quiser informar agora?',
        body: 'Sem problemas! Você pode deixar em branco e adicionar sua chave Pix depois nas Configurações da Loja.',
      },
    ],
  },
  publish: {
    title: 'Ajuda: Publicação e WhatsApp',
    subtitle: 'Sua loja funciona imediatamente com link direto de pedidos.',
    tips: [
      {
        heading: 'Link direto no WhatsApp',
        body: 'Mesmo antes de conectar o WhatsApp via QR Code, seus clientes já conseguem montar a sacola na vitrine e enviar o pedido direto para o seu número.',
      },
      {
        heading: 'Conexão com QR Code',
        body: 'Quando quiser ativar o atendimento conectado no painel, basta escanear o QR Code na aba WhatsApp.',
      },
    ],
  },
};

export interface ContextualHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic?: OnboardingHelpTopic;
}

export function ContextualHelpModal({
  open,
  onOpenChange,
  topic = 'general',
}: ContextualHelpModalProps) {
  const content = HELP_CONTENT_BY_TOPIC[topic] ?? HELP_CONTENT_BY_TOPIC.general;

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="lg"
      mobileHeight="90%"
      title={
        <span className="inline-flex items-center gap-2">
          <HelpCircle className="size-5 text-[#2563EB]" aria-hidden="true" />
          <span>{content.title}</span>
        </span>
      }
      description={content.subtitle}
      footer={
        <ActionButton
          variant="primary"
          size={46}
          fullWidth
          onClick={() => onOpenChange(false)}
        >
          Entendi, voltar
        </ActionButton>
      }
    >
      <div className="space-y-3">
        {content.tips.map((tip) => (
          <div
            key={tip.heading}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <h4 className="text-sm font-semibold text-[#0F172A]">{tip.heading}</h4>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{tip.body}</p>
          </div>
        ))}

        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-[#EFF6FF] p-3.5 text-xs leading-relaxed text-[#1D4ED8]">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Dica: todas as informações da loja podem ser ajustadas a qualquer momento na aba <strong>Configurações</strong>.
          </span>
        </div>
      </div>
    </ModalContainer>
  );
}

/* ============================================================================
 * TELA 12: Parabéns loja criada!
 * ========================================================================== */

export interface StoreCreatedSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  publicSlug?: string;
  ownerId?: string;
  storeUrl?: string;
  whatsappConnected?: boolean;
  productsCount?: number;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  onOpenStorefront: () => void;
  onSimulateFirstOrder?: () => void;
  onConnectWhatsapp?: () => void;
  onContinueToPanel?: () => void;
}

const STUCK_REASON_OPTIONS: ReadonlyArray<{ id: string; label: string; step: number }> = [
  { id: 'whatsapp', label: 'WhatsApp', step: 1 },
  { id: 'catalogo', label: 'Catálogo / Excel', step: 2 },
  { id: 'fotos', label: 'Fotos / Cores', step: 2 },
  { id: 'outro', label: 'Outro', step: 3 },
];

export function StoreCreatedSuccessModal({
  open,
  onOpenChange,
  storeName,
  publicSlug,
  ownerId,
  storeUrl,
  whatsappConnected = false,
  productsCount = 1,
  primaryColor = '#0867E8',
  accentColor = '#24A677',
  logoUrl,
  onOpenStorefront,
  onSimulateFirstOrder,
  onConnectWhatsapp,
  onContinueToPanel,
}: StoreCreatedSuccessModalProps) {
  const [previewDevice, setPreviewDevice] = React.useState<'desktop' | 'mobile'>('desktop');
  const [thermometerRating, setThermometerRating] = React.useState<'easy' | 'medium' | 'stuck' | null>(null);
  const [stuckPickerOpen, setStuckPickerOpen] = React.useState(false);
  const [stuckReasonLabel, setStuckReasonLabel] = React.useState('');
  const [sendingFeedback, setSendingFeedback] = React.useState(false);

  const resolvedUrl = React.useMemo(() => {
    if (storeUrl) return storeUrl;
    return buildPublicStoreShareUrl(publicSlug, ownerId);
  }, [storeUrl, publicSlug, ownerId]);

  const statusShareText = React.useMemo(() => {
    const clean = storeName.trim() || 'minha loja';
    return `Novidade no ar! Confira o catálogo atualizado da ${clean} e peça direto pelo WhatsApp: ${resolvedUrl}`;
  }, [storeName, resolvedUrl]);

  const qrPngUrl = React.useMemo(() => {
    if (!resolvedUrl) return '';
    return renderQrPngDataUrl(resolvedUrl, 220);
  }, [resolvedUrl]);

  React.useEffect(() => {
    if (!open) {
      setThermometerRating(null);
      setStuckPickerOpen(false);
      setStuckReasonLabel('');
      setSendingFeedback(false);
    }
  }, [open]);

  const miniHeaderBg = primaryColor || '#0867E8';
  const miniHeaderFg = contrastRatio(miniHeaderBg, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A';
  const miniAccentBg = accentColor || '#24A677';
  const miniAccentFg = contrastRatio(miniAccentBg, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A';

  const handleRateOnboarding = async (
    rating: 'easy' | 'medium' | 'stuck',
    meta?: { stepStopped?: number; comment?: string },
  ) => {
    if (sendingFeedback) return;
    setThermometerRating(rating);
    setStuckPickerOpen(false);
    if (meta?.comment) setStuckReasonLabel(meta.comment);
    setSendingFeedback(true);
    try {
      await authenticatedFetch(
        '/api/onboarding/feedback',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            ...(meta?.stepStopped ? { stepStopped: meta.stepStopped } : {}),
            ...(meta?.comment ? { comment: meta.comment } : {}),
          }),
        },
        ownerId,
      );
    } catch {
      // Optimistic UX per C20
    } finally {
      setSendingFeedback(false);
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="lg"
      mobileHeight="90%"
      title={
        <span className="inline-flex items-center gap-2 text-[#0F172A]">
          <PartyPopper className="size-5 text-[#16A34A]" aria-hidden="true" />
          <span>Parabéns! Sua loja foi criada</span>
        </span>
      }
      description="Tudo está pronto para você divulgar sua vitrine e receber pedidos pelo WhatsApp."
      footer={
        <div className="flex flex-col gap-2.5">
          <ActionButton
            variant="success"
            size={52}
            fullWidth
            rightIcon={<ArrowRight className="size-4" aria-hidden="true" />}
            onClick={onOpenStorefront}
          >
            Abrir Minha Vitrine e Painel
          </ActionButton>

          {!whatsappConnected && onConnectWhatsapp ? (
            <ActionButton
              variant="softBlue"
              size={46}
              fullWidth
              leftIcon={<QrCode className="size-4" aria-hidden="true" />}
              onClick={onConnectWhatsapp}
            >
              Conectar WhatsApp Agora (Opcional)
            </ActionButton>
          ) : null}

          {onContinueToPanel ? (
            <ActionButton
              variant="secondary"
              size={44}
              fullWidth
              onClick={onContinueToPanel}
            >
              Continuar gerenciando produtos
            </ActionButton>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-sm">
            <Store className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[#0F172A]">
              {storeName.trim() || 'Sua Loja'}
            </p>
            <p className="text-sm text-emerald-900">
              {productsCount} {productsCount === 1 ? 'produto pronto' : 'produtos prontos'} · Pedidos liberados no WhatsApp
            </p>
          </div>
        </div>

        {resolvedUrl ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-[#16A34A]" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Vitrine Online Publicada · Pronta para compartilhar
                </span>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  data-testid="victory-preview-desktop-btn"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                    previewDevice === 'desktop' ? 'bg-[#0F172A] text-white' : 'text-slate-600'
                  }`}
                >
                  <Monitor className="size-3" />
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  data-testid="victory-preview-mobile-btn"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                    previewDevice === 'mobile' ? 'bg-[#0F172A] text-white' : 'text-slate-600'
                  }`}
                >
                  <Smartphone className="size-3" />
                  <span>Celular</span>
                </button>
              </div>
            </div>

            {/* Kit de 1ª Divulgação (Copiar Link + Texto Status + QR PNG + Simular Pedido) */}
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="secondary"
                size={44}
                copyText={resolvedUrl}
                copySuccessLabel="Copiado"
                data-testid="victory-copy-link-btn"
                leftIcon={<Copy className="size-4" aria-hidden="true" />}
              >
                Copiar Link da Vitrine
              </ActionButton>

              <ActionButton
                variant="softBlue"
                size={44}
                copyText={statusShareText}
                copySuccessLabel="Copiado"
                data-testid="victory-copy-status-btn"
                leftIcon={<Share2 className="size-4" aria-hidden="true" />}
              >
                Copiar Texto p/ Status
              </ActionButton>

              <ActionButton
                variant="primary"
                size={44}
                data-testid="victory-simulate-first-order-btn"
                leftIcon={<ShoppingBag className="size-4" aria-hidden="true" />}
                onClick={onSimulateFirstOrder ?? onOpenStorefront}
              >
                Simular meu 1º pedido agora
              </ActionButton>
            </div>

            {/* Prévia fiel responsiva + QR Code offline PNG */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-stretch">
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-2.5 sm:col-span-6">
                <div
                  data-testid="victory-mini-preview-card"
                  className={`mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xs transition-all ${
                    previewDevice === 'mobile' ? 'max-w-[175px] w-full' : 'w-full'
                  }`}
                >
                  <div
                    className="flex items-center justify-between gap-1.5 px-2.5 py-1.5"
                    style={{ backgroundColor: miniHeaderBg, color: miniHeaderFg }}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={storeName.trim() || 'Sua Loja'}
                          className="size-4 shrink-0 rounded bg-white p-0.5 object-contain"
                        />
                      ) : null}
                      <span className="truncate text-[11px] font-extrabold">
                        {storeName.trim() || 'Sua Loja'}
                      </span>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: miniAccentBg, color: miniAccentFg }}
                    >
                      {productsCount} {productsCount === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-[#F8FAFC] px-2.5 py-1.5">
                    <span className="text-[10px] font-semibold text-slate-600">
                      {previewDevice === 'mobile' ? 'Mobile 390px' : 'Desktop 1440px'}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: miniAccentBg, color: miniAccentFg }}
                    >
                      Pedir
                    </span>
                  </div>
                </div>
              </div>
              {qrPngUrl ? (
                <div className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 sm:col-span-6">
                  <img
                    src={qrPngUrl}
                    alt="QR Code da loja"
                    data-testid="victory-qr-img"
                    className="size-12 shrink-0 rounded-lg border border-slate-100"
                  />
                  <a
                    href={qrPngUrl}
                    download={`qrcode-${(publicSlug || 'loja').replace(/[^a-z0-9-]/gi, '')}.png`}
                    data-testid="victory-download-qr-btn"
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-slate-50 px-3 text-[11px] font-bold text-[#0F172A] hover:bg-slate-100"
                  >
                    <Download className="size-3.5 shrink-0" />
                    <span>Baixar QR Code (.png)</span>
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Termômetro de 1 Clique + Submotivo acionável em "Travou algo" */}
        <div
          data-testid="onboarding-thermometer"
          className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-[#182034]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-[#0F172A] dark:text-white">
              Como foi configurar sua loja agora?
            </p>
            {thermometerRating ? (
              <p
                data-testid="thermometer-thanks"
                className="font-bold text-emerald-700 dark:text-emerald-300"
              >
                Obrigado pelo retorno ✓{stuckReasonLabel ? ` (${stuckReasonLabel})` : ''}
              </p>
            ) : !stuckPickerOpen ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid="thermometer-rate-easy"
                  onClick={() => void handleRateOnboarding('easy')}
                  className="inline-flex min-h-[32px] items-center rounded-xl border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  Fácil
                </button>
                <button
                  type="button"
                  data-testid="thermometer-rate-medium"
                  onClick={() => void handleRateOnboarding('medium')}
                  className="inline-flex min-h-[32px] items-center rounded-xl border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:border-amber-500 hover:bg-amber-50 hover:text-amber-800"
                >
                  Médio
                </button>
                <button
                  type="button"
                  data-testid="thermometer-rate-stuck"
                  onClick={() => setStuckPickerOpen(true)}
                  className="inline-flex min-h-[32px] items-center rounded-xl border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-800"
                >
                  Travou algo
                </button>
              </div>
            ) : null}
          </div>
          {stuckPickerOpen && !thermometerRating ? (
            <div data-testid="thermometer-stuck-reasons" className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mr-1">
                Onde travou?
              </span>
              {STUCK_REASON_OPTIONS.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  data-testid={`thermometer-stuck-reason-${reason.id}`}
                  onClick={() =>
                    void handleRateOnboarding('stuck', {
                      stepStopped: reason.step,
                      comment: reason.label,
                    })
                  }
                  className="inline-flex min-h-[30px] items-center rounded-lg border border-rose-200 bg-white px-2.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                >
                  {reason.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Trilha de lançamento 3 passos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
          <p className="font-bold text-[#0F172A] mb-1.5">Próximos 3 passos para vender hoje</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-semibold text-emerald-900">
              1. Página no ar ✓
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              2. Testar 3 msgs da Sofia
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              3. Baixar App Windows (.exe)
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">
          {whatsappConnected
            ? 'Seu WhatsApp está conectado e pronto para atender seus clientes.'
            : 'Seus clientes já podem finalizar compras enviando o pedido direto para o WhatsApp da loja. Se quiser, conecte também o WhatsApp automático quando preferir.'}
        </p>
      </div>
    </ModalContainer>
  );
}
