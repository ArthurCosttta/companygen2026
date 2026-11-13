import * as React from 'react';
import { Check, Copy, MessageSquareText, Plus, Search, Sparkles } from 'lucide-react';
import {
  ActionButton,
  EmptyStateCard,
  ModalContainer,
  SkeletonBlock,
  useToast,
} from '@/components/ui';
import type { BusinessProfile } from '@/schemas/profile.schema';
import { authenticatedFetch } from '@/services/supabase-client';

export interface QuickReplyTemplate {
  id: string;
  titulo?: string;
  title?: string;
  category?: string;
  gatilhos?: string[];
  resposta?: string;
  body?: string;
}

export interface NormalizedQuickReply {
  id: string;
  title: string;
  category: string;
  body: string;
  triggers: string[];
  isFallback?: boolean;
}

export interface FriendlyVariableChip {
  token: string;
  label: string;
}

export const FRIENDLY_VARIABLE_CHIPS: FriendlyVariableChip[] = [
  { token: '{nome_cliente}', label: 'Nome do cliente' },
  { token: '{nome_loja}', label: 'Nome da loja' },
  { token: '{chave_pix}', label: 'Chave Pix' },
  { token: '{numero_pedido}', label: 'Número do pedido' },
  { token: '{codigo_rastreio}', label: 'Código de rastreio' },
];

export const DEFAULT_QUICK_REPLIES: QuickReplyTemplate[] = [
  {
    id: 'default-boas-vindas',
    title: 'Boas-vindas',
    category: 'Atendimento inicial',
    gatilhos: ['oi', 'olá', 'bom dia', 'boa tarde'],
    body: 'Olá {nome_cliente}! Seja bem-vindo(a) à {nome_loja}. Como posso ajudar você hoje?',
  },
  {
    id: 'default-chave-pix',
    title: 'Chave Pix da Loja',
    category: 'Pagamentos',
    gatilhos: ['pix', 'pagamento', 'pagar', 'chave'],
    body: 'Para finalizar seu pagamento na {nome_loja}, utilize nossa chave Pix: {chave_pix}. Assim que enviar o comprovante por aqui, já confirmamos seu pedido!',
  },
  {
    id: 'default-rastreio',
    title: 'Código de Rastreio',
    category: 'Entrega e acompanhamento',
    gatilhos: ['rastreio', 'entrega', 'envio', 'acompanhar'],
    body: 'Seu pedido {numero_pedido} já está a caminho! Você pode acompanhar a entrega com o código: {codigo_rastreio}.',
  },
];

const FRIENDLY_TOKEN_DISPLAY: Record<string, string> = {
  '{nome_cliente}': 'Nome do cliente',
  '{nome_loja}': 'Nome da loja',
  '{chave_pix}': 'Chave Pix',
  '{numero_pedido}': 'Número do pedido',
  '{codigo_rastreio}': 'Código de rastreio',
  '{NOME_PRODUTO}': 'Nome do produto',
  '{PRECO}': 'Preço',
  '{VARIACAO}': 'Opção escolhida',
  '{ESTOQUE}': 'Disponibilidade',
  '{QUANTIDADE}': 'Quantidade',
  '{SUBTOTAL}': 'Subtotal',
  '{VALOR_TOTAL}': 'Valor total',
  '{VALOR_FINAL}': 'Valor final',
  '{NUMERO_PEDIDO}': 'Número do pedido',
  '{CODIGO_RASTREIO}': 'Código de rastreio',
  '{LINK_CATALOGO}': 'Link da loja',
  '{LISTA_ITENS}': 'Itens do pedido',
  '{LISTA_DE_PRODUTOS}': 'Produtos do pedido',
};

function cleanTemplateBody(rawText: string, profile?: Partial<BusinessProfile> | null): string {
  const storeName = profile?.business?.name?.trim();
  const pixKey = profile?.payment?.pixKey?.trim();
  let text = String(rawText || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\(\s*SKU[^)]*\)/gi, '')
    .replace(/\bSKU[:\s#-]*[A-Za-z0-9_.-]+\b/gi, '')
    .trim();

  if (storeName) {
    text = text.replace(/\{nome_loja\}/gi, storeName);
  }
  if (pixKey) {
    text = text.replace(/\{chave_pix\}/gi, pixKey);
  }
  return text;
}

function extractFriendlyChipsFromBody(body: string): string[] {
  const matches = body.match(/\{[A-Za-z0-9_]+\}/g) || [];
  const labels: string[] = [];
  for (const token of matches) {
    const exact = FRIENDLY_TOKEN_DISPLAY[token] || FRIENDLY_TOKEN_DISPLAY[token.toLowerCase()];
    const label =
      exact ||
      token
        .replace(/[{}]/g, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, c => c.toUpperCase());
    if (!labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

async function copyTextOfflineSafe(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted clipboard contexts.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export interface QuickRepliesSectionProps {
  templates?: QuickReplyTemplate[];
  profile?: Partial<BusinessProfile> | null;
  owner?: string;
  loading?: boolean;
  onTemplateSaved?: () => Promise<void> | void;
  onCopyTemplate?: (template: NormalizedQuickReply) => void;
  compact?: boolean;
}

export function QuickRepliesSection({
  templates,
  profile,
  owner,
  loading = false,
  onTemplateSaved,
  onCopyTemplate,
  compact = false,
}: QuickRepliesSectionProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create new message modal state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newTriggers, setNewTriggers] = React.useState('');
  const [newBody, setNewBody] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const bodyTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const hasCustomTemplates = Boolean(templates && templates.length > 0);
  const sourceList = hasCustomTemplates ? templates! : DEFAULT_QUICK_REPLIES;

  const normalizedList = React.useMemo<NormalizedQuickReply[]>(() => {
    return sourceList.map((item, idx) => ({
      id: item.id || `modelo-${idx + 1}`,
      title: (item.title || item.titulo || `Modelo ${idx + 1}`).trim(),
      category: (item.category || 'Atendimento rápido').trim(),
      body: cleanTemplateBody(item.body || item.resposta || '', profile),
      triggers: Array.isArray(item.gatilhos) ? item.gatilhos : [],
      isFallback: !hasCustomTemplates,
    }));
  }, [hasCustomTemplates, profile, sourceList]);

  const query = searchQuery.trim().toLowerCase();
  const filteredList = React.useMemo(() => {
    if (!query) return normalizedList;
    return normalizedList.filter(
      item =>
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.body.toLowerCase().includes(query),
    );
  }, [normalizedList, query]);

  const handleCopy = async (item: NormalizedQuickReply) => {
    const copied = await copyTextOfflineSafe(item.body);
    if (!copied) {
      showToast({
        type: 'error',
        message: 'Não foi possível copiar o texto automaticamente.',
        durationMs: 2500,
      });
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore unsupported vibration.
      }
    }

    setCopiedId(item.id);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedId(current => (current === item.id ? null : current));
    }, 1200);

    onCopyTemplate?.(item);
  };

  const insertVariableChip = (token: string) => {
    const el = bodyTextareaRef.current;
    if (!el) {
      setNewBody(prev => (prev ? `${prev} ${token}` : token));
      return;
    }
    const start = el.selectionStart ?? newBody.length;
    const end = el.selectionEnd ?? newBody.length;
    const nextValue = newBody.slice(0, start) + token + newBody.slice(end);
    setNewBody(nextValue);
    requestAnimationFrame(() => {
      el.focus();
      const nextPos = start + token.length;
      el.setSelectionRange(nextPos, nextPos);
    });
  };

  const handleOpenCreate = () => {
    setFormError('');
    setCreateOpen(true);
  };

  const handleSaveNewTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;

    const cleanTitle = newTitle.trim();
    const cleanBody = newBody.trim();
    if (!cleanTitle || !cleanBody) {
      setFormError('Digite o título e o texto da mensagem antes de salvar.');
      return;
    }

    const parsedTriggers = newTriggers
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const triggersToSend =
      parsedTriggers.length > 0
        ? parsedTriggers
        : cleanTitle
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length >= 2)
            .slice(0, 3);

    setIsSaving(true);
    setFormError('');
    try {
      const res = await authenticatedFetch(
        '/api/whatsapp/api/templates/save',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '',
            titulo: cleanTitle,
            gatilhos: triggersToSend.length > 0 ? triggersToSend : ['atendimento'],
            resposta: cleanBody,
          }),
        },
        owner,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.erro || data.error || 'Não foi possível salvar o modelo.');
      }

      setNewTitle('');
      setNewTriggers('');
      setNewBody('');
      setCreateOpen(false);
      showToast({
        type: 'success',
        message: 'Resposta rápida adicionada à biblioteca!',
        durationMs: 2500,
      });
      await onTemplateSaved?.();
    } catch (error) {
      showToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar o modelo. Tente novamente.',
        durationMs: 3500,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      role="region"
      aria-label="Biblioteca de Respostas Rápidas"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar resposta rápida..."
            aria-label="Buscar resposta rápida"
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50/70 pr-3.5 pl-10 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <ActionButton
          variant="primary"
          size={44}
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={handleOpenCreate}
          className="shrink-0"
        >
          Criar nova mensagem
        </ActionButton>
      </div>

      {!hasCustomTemplates && !loading && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-2.5 text-xs text-[#1D4ED8]">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
          <span>
            Exibindo 3 modelos prontos da loja (Boas-vindas, Chave Pix e Rastreio). Copie em um
            clique ou crie novas mensagens personalizadas.
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando respostas rápidas">
          <SkeletonBlock height={116} rounded="xl" />
          <SkeletonBlock height={116} rounded="xl" />
          <SkeletonBlock height={116} rounded="xl" />
        </div>
      ) : filteredList.length === 0 ? (
        <EmptyStateCard
          icon={<MessageSquareText className="size-6" />}
          title="Nenhuma resposta encontrada"
          description={`Não encontramos modelos para "${searchQuery}".`}
          ctaLabel="Limpar busca"
          ctaVariant="secondary"
          ctaSize={44}
          onCta={() => setSearchQuery('')}
        />
      ) : (
        <div
          className={
            compact
              ? 'flex flex-col gap-3'
              : 'grid grid-cols-1 gap-3 md:grid-cols-2'
          }
        >
          {filteredList.map(item => {
            const isCopied = copiedId === item.id;
            const variableLabels = extractFriendlyChipsFromBody(item.body);

            return (
              <article
                key={item.id}
                data-testid={`quick-reply-${item.id}`}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="inline-block rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#1D4ED8]">
                        {item.category}
                      </span>
                      <h3 className="mt-1.5 text-sm font-bold text-[#0F172A]">{item.title}</h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopy(item)}
                      className={`inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all duration-[100ms] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                        isCopied
                          ? 'border border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]'
                          : 'bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0]'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3.5" aria-hidden="true" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" aria-hidden="true" />
                          <span>Copiar Texto</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
                    {item.body}
                  </p>

                  {variableLabels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-medium text-slate-500">Campos:</span>
                      {variableLabels.map(label => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ModalContainer
        open={createOpen}
        onOpenChange={setCreateOpen}
        role="dialog"
        maxWidth="md"
        mobileHeight="90%"
        preventCloseWhileSubmitting={isSaving}
        title="Nova Resposta Rápida"
        description="Crie um atalho de mensagem para copiar no atendimento ou usar nas respostas da loja."
        footer={
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <ActionButton
              variant="secondary"
              size={44}
              disabled={isSaving}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              form="quick-reply-create-form"
              variant="primary"
              size={44}
              isLoading={isSaving}
              loadingText="Salvando..."
              disabled={newTitle.trim().length === 0 || newBody.trim().length === 0}
              rightIcon={<Check className="size-4" aria-hidden="true" />}
            >
              Salvar Mensagem na Biblioteca
            </ActionButton>
          </div>
        }
      >
        <form id="quick-reply-create-form" onSubmit={handleSaveNewTemplate} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="qr-title" className="block text-sm font-semibold text-[#0F172A]">
              Título do Modelo (Ex: Chave Pix com Desconto)
            </label>
            <input
              id="qr-title"
              type="text"
              required
              maxLength={80}
              value={newTitle}
              onChange={e => {
                setNewTitle(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="Ex: Chave Pix com Desconto"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qr-triggers" className="block text-sm font-semibold text-[#0F172A]">
              Palavras que ativam esta resposta (opcional)
            </label>
            <input
              id="qr-triggers"
              type="text"
              maxLength={120}
              value={newTriggers}
              onChange={e => setNewTriggers(e.target.value)}
              placeholder="Ex: pix, desconto, pagamento"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="qr-body" className="block text-sm font-semibold text-[#0F172A]">
                Texto Completo da Mensagem
              </label>
              <span className="text-xs text-slate-500">{newBody.length} caracteres</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Inserir campo:</span>
              {FRIENDLY_VARIABLE_CHIPS.map(chip => (
                <button
                  key={chip.token}
                  type="button"
                  onClick={() => insertVariableChip(chip.token)}
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-xs font-semibold text-[#1D4ED8] transition-all active:scale-[0.97] hover:bg-[#DBEAFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  + {chip.label}
                </button>
              ))}
            </div>

            <textarea
              ref={bodyTextareaRef}
              id="qr-body"
              required
              rows={5}
              maxLength={1200}
              value={newBody}
              onChange={e => {
                setNewBody(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="Escreva a mensagem que deseja salvar na sua biblioteca..."
              className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-[#0F172A] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs font-semibold text-[#EF4444]">
              {formError}
            </p>
          )}
        </form>
      </ModalContainer>
    </section>
  );
}
