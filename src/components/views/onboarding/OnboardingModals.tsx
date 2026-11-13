import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  Check,
  Copy,
  HelpCircle,
  PartyPopper,
  QrCode,
  Sparkles,
  Store,
} from 'lucide-react';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
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
      maxWidth="md"
      mobileHeight="85%"
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
  onOpenStorefront: () => void;
  onConnectWhatsapp?: () => void;
  onContinueToPanel?: () => void;
}

export function StoreCreatedSuccessModal({
  open,
  onOpenChange,
  storeName,
  publicSlug,
  ownerId,
  storeUrl,
  whatsappConnected = false,
  productsCount = 1,
  onOpenStorefront,
  onConnectWhatsapp,
  onContinueToPanel,
}: StoreCreatedSuccessModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const resolvedUrl = React.useMemo(() => {
    if (storeUrl) return storeUrl;
    return buildPublicStoreShareUrl(publicSlug, ownerId);
  }, [storeUrl, publicSlug, ownerId]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyLink = async () => {
    if (!resolvedUrl) return;
    try {
      await navigator.clipboard.writeText(resolvedUrl);
      setCopied(true);
      showToast({
        type: 'success',
        message: 'Link da vitrine copiado! Compartilhe com seus clientes.',
        durationMs: 2500,
      });
    } catch {
      showToast({
        type: 'amber',
        message: 'Selecione e copie o endereço exibido no campo acima.',
        durationMs: 3000,
      });
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="md"
      mobileHeight="85%"
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
      <div className="space-y-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
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
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label
              htmlFor="onboarding-store-link"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Link da sua vitrine online
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="onboarding-store-link"
                type="text"
                readOnly
                value={resolvedUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
              <ActionButton
                variant={copied ? 'success' : 'secondary'}
                size={44}
                leftIcon={
                  copied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )
                }
                onClick={handleCopyLink}
              >
                {copied ? 'Copiado!' : 'Copiar Link'}
              </ActionButton>
            </div>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-slate-500">
          {whatsappConnected
            ? 'Seu WhatsApp está conectado e pronto para atender seus clientes.'
            : 'Seus clientes já podem finalizar compras enviando o pedido direto para o WhatsApp da loja. Se quiser, conecte também o WhatsApp automático quando preferir.'}
        </p>
      </div>
    </ModalContainer>
  );
}
