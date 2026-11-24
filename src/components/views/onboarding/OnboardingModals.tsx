import { HelpCircle, Sparkles } from 'lucide-react';
import { ActionButton, ModalContainer } from '@/components/ui';
import type { OnboardingHelpTopic } from './onboarding-helpers';

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
