import * as React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  Eye,
  Image as ImageIcon,
  MessageSquare,
  Package,
  Percent,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { formatCurrencyBRL, type CatalogProduct } from '@/schemas/profile.schema';
import { ActionButton, ModalContainer, useToast } from '@/components/ui';
import { copyTextToClipboard, type PublishBlocker } from './storefront-utils';

/* -------------------------------------------------------------------------- */
/* TELA 18: Confirmar Exclusão de Produto (role="alertdialog")                */
/* -------------------------------------------------------------------------- */

export interface DeleteProductConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogProduct | null;
  onConfirm: (product: CatalogProduct) => void | Promise<void>;
  isDeleting?: boolean;
}

export function DeleteProductConfirmModal({
  open,
  onOpenChange,
  product,
  onConfirm,
  isDeleting = false,
}: DeleteProductConfirmModalProps) {
  const cancelBtnRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <ModalContainer
      open={open && Boolean(product)}
      onOpenChange={onOpenChange}
      role="alertdialog"
      initialFocus="cancel"
      cancelRef={cancelBtnRef}
      preventCloseWhileSubmitting={isDeleting}
      maxWidth="sm"
      mobileHeight="auto"
      title={
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#EF4444]">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <span>Excluir Produto?</span>
        </span>
      }
      description="Você poderá desfazer esta remoção nos próximos 5 segundos após confirmar."
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            ref={cancelBtnRef}
            variant="secondary"
            size={44}
            data-modal-cancel="true"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ActionButton>
          <ActionButton
            variant="danger"
            size={44}
            leftIcon={<Trash2 className="size-4" />}
            isLoading={isDeleting}
            loadingText="Excluindo..."
            onClick={() => {
              if (product) {
                void onConfirm(product);
              }
            }}
          >
            Sim, Excluir Definitivamente
          </ActionButton>
        </div>
      }
    >
      {product ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p className="leading-relaxed">
            Tem certeza que deseja remover{' '}
            <strong className="font-semibold text-[#EF4444]">“{product.name}”</strong> do catálogo?
          </p>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
            Este produto sairá imediatamente da vitrine pública e das respostas automáticas do WhatsApp.
            Pedidos antigos que incluíam este item permanecem intactos no histórico.
          </div>
        </div>
      ) : null}
    </ModalContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* TELA 19: Descartar Alterações Não Salvas (role="alertdialog")              */
/* -------------------------------------------------------------------------- */

export interface DiscardChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDiscard: () => void;
}

export function DiscardChangesModal({
  open,
  onOpenChange,
  onConfirmDiscard,
}: DiscardChangesModalProps) {
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
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#F59E0B]">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <span>Descartar alterações?</span>
        </span>
      }
      description="As modificações feitas neste produto ainda não foram salvas."
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            ref={cancelBtnRef}
            variant="secondary"
            size={44}
            data-modal-cancel="true"
            onClick={() => onOpenChange(false)}
          >
            Continuar editando
          </ActionButton>
          <ActionButton
            variant="danger"
            size={44}
            onClick={() => {
              onOpenChange(false);
              onConfirmDiscard();
            }}
          >
            Descartar alterações
          </ActionButton>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Se sair agora, o formulário voltará ao estado anterior e nenhum dado será alterado na vitrine.
      </p>
    </ModalContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* TELA 20: Bloqueio ao Publicar (WhatsApp / Preço / Foto / Catálogo Vazio)   */
/* -------------------------------------------------------------------------- */

export interface PublishBlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blockers: PublishBlocker[];
  onResolveBlocker?: (blocker: PublishBlocker) => void;
  onAutoFixMissingPhotos?: () => Promise<void>;
  fixingPhotos?: boolean;
}

const BLOCKER_ICON: Record<PublishBlocker['id'], React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageSquare,
  empty_catalog: Package,
  invalid_price: Tag,
  missing_photo: ImageIcon,
};

export function PublishBlockModal({
  open,
  onOpenChange,
  blockers,
  onResolveBlocker,
  onAutoFixMissingPhotos,
  fixingPhotos = false,
}: PublishBlockModalProps) {
  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="md"
      mobileHeight="85%"
      preventCloseWhileSubmitting={fixingPhotos}
      title={
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#F59E0B]">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <span>Falta pouco para publicar sua loja</span>
        </span>
      }
      description="Resolva os itens abaixo para liberar sua vitrine online com segurança."
      footer={
        <div className="flex justify-end">
          <ActionButton
            variant="secondary"
            size={44}
            disabled={fixingPhotos}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-3">
        {blockers.map((blocker) => {
          const Icon = BLOCKER_ICON[blocker.id] ?? AlertTriangle;
          const isPhotoAutoFix = blocker.id === 'missing_photo' && Boolean(onAutoFixMissingPhotos);
          return (
            <div
              key={blocker.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-xs border border-slate-200">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-[#0F172A]">{blocker.title}</h4>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{blocker.description}</p>
                </div>
              </div>

              {isPhotoAutoFix ? (
                <ActionButton
                  variant="primary"
                  size={44}
                  isLoading={fixingPhotos}
                  loadingText="Aplicando..."
                  leftIcon={<Sparkles className="size-4" />}
                  onClick={() => {
                    void onAutoFixMissingPhotos?.();
                  }}
                >
                  {blocker.actionLabel}
                </ActionButton>
              ) : onResolveBlocker ? (
                <ActionButton
                  variant="softBlue"
                  size={44}
                  onClick={() => {
                    onOpenChange(false);
                    onResolveBlocker(blocker);
                  }}
                >
                  {blocker.actionLabel}
                </ActionButton>
              ) : null}
            </div>
          );
        })}
      </div>
    </ModalContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* TELA 21: Loja Publicada com Sucesso                                        */
/* -------------------------------------------------------------------------- */

export interface StorePublishedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  publicUrl: string;
  onViewStorefront?: () => void;
}

export function StorePublishedModal({
  open,
  onOpenChange,
  storeName,
  publicUrl,
  onViewStorefront,
}: StorePublishedModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  async function handleCopy() {
    const ok = await copyTextToClipboard(publicUrl);
    if (ok) {
      setCopied(true);
      showToast({
        type: 'success',
        message: 'Link da loja copiado! Agora é só divulgar para seus clientes.',
        durationMs: 2500,
      });
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="md"
      mobileHeight="auto"
      title={
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#16A34A]">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </span>
          <span>Loja publicada com sucesso!</span>
        </span>
      }
      description={`A vitrine de ${storeName || 'sua loja'} já está pronta para receber pedidos pelo WhatsApp.`}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            variant="secondary"
            size={44}
            onClick={() => onOpenChange(false)}
          >
            Continuar no Painel
          </ActionButton>
          {onViewStorefront ? (
            <ActionButton
              variant="primary"
              size={48}
              leftIcon={<Eye className="size-4" />}
              onClick={() => {
                onOpenChange(false);
                onViewStorefront();
              }}
            >
              Ver Vitrine como Cliente
            </ActionButton>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-relaxed text-emerald-950">
          Compartilhe o link abaixo no seu Instagram, grupos e status do WhatsApp para seus clientes
          escolherem produtos e fecharem pedidos direto com você.
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Link público da sua vitrine
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={publicUrl}
              aria-label="Link público da sua vitrine"
              onClick={(e) => e.currentTarget.select()}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <ActionButton
              variant={copied ? 'success' : 'softBlue'}
              size={44}
              leftIcon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => void handleCopy()}
            >
              {copied ? 'Copiado!' : 'Copiar Link'}
            </ActionButton>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal Complementar: Reajuste de Preços em Lote (%)                         */
/* -------------------------------------------------------------------------- */

export interface BatchPriceAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productsCount: number;
  onApply: (mode: 'increase' | 'decrease', percent: number) => Promise<void>;
}

export function BatchPriceAdjustModal({
  open,
  onOpenChange,
  productsCount,
  onApply,
}: BatchPriceAdjustModalProps) {
  const [mode, setMode] = React.useState<'increase' | 'decrease'>('increase');
  const [percentText, setPercentText] = React.useState('10');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMode('increase');
      setPercentText('10');
      setSubmitting(false);
    }
  }, [open]);

  const parsedPercent = Number(percentText.replace(',', '.'));
  const validPercent =
    Number.isFinite(parsedPercent) &&
    parsedPercent > 0 &&
    (mode === 'increase' ? parsedPercent <= 500 : parsedPercent < 100);

  const simulatedCents = validPercent
    ? Math.max(
        1,
        Math.round(
          10000 * (mode === 'increase' ? 1 + parsedPercent / 100 : 1 - parsedPercent / 100),
        ),
      )
    : 10000;

  async function handleSubmit() {
    if (!validPercent || productsCount === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onApply(mode, parsedPercent);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      role="dialog"
      maxWidth="md"
      mobileHeight="auto"
      preventCloseWhileSubmitting={submitting}
      title={
        <span className="flex items-center gap-2.5 text-[#0F172A]">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
            <Percent className="size-4" aria-hidden="true" />
          </span>
          <span>Reajuste de Preços em Massa</span>
        </span>
      }
      description={`Esta alteração será aplicada aos ${productsCount} ${productsCount === 1 ? 'produto' : 'produtos'} do catálogo.`}
      footer={
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <ActionButton
            variant="secondary"
            size={44}
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ActionButton>
          <ActionButton
            variant="primary"
            size={46}
            isLoading={submitting}
            loadingText="Aplicando..."
            disabled={!validPercent || productsCount === 0}
            rightIcon={<CheckCheck className="size-4" />}
            onClick={() => void handleSubmit()}
          >
            Aplicar Porcentagem a Todos os Produtos
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Tipo de reajuste">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'increase'}
            onClick={() => setMode('increase')}
            className={`min-h-[46px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
              mode === 'increase'
                ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            (+) Aumentar preços
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'decrease'}
            onClick={() => setMode('decrease')}
            className={`min-h-[46px] rounded-xl border px-3 text-sm font-semibold transition-colors ${
              mode === 'decrease'
                ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            (-) Reduzir preços
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="batch-percent-input" className="block text-sm font-medium text-[#0F172A]">
            Porcentagem (%)
          </label>
          <input
            id="batch-percent-input"
            type="text"
            inputMode="decimal"
            value={percentText}
            onChange={(e) => setPercentText(e.target.value)}
            placeholder="Ex: 10"
            className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
          <p className="text-xs text-slate-500">
            {mode === 'increase'
              ? 'Informe um valor entre 0,1% e 500%.'
              : 'Informe um desconto entre 0,1% e 99%.'}
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-[#EFF6FF]/70 px-4 py-3 text-sm text-[#0F172A]">
          Simulação: um produto de <strong>R$ 100,00</strong> passará a custar{' '}
          <strong className="text-[#2563EB]">{formatCurrencyBRL(simulatedCents)}</strong>.
        </div>
      </div>
    </ModalContainer>
  );
}
