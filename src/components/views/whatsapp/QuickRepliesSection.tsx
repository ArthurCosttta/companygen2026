import * as React from 'react';
import { Check, Copy, MessageSquareText, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
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
  mediaUrl?: string;
}

export interface NormalizedQuickReply {
  id: string;
  title: string;
  category: string;
  body: string;
  rawDisplayBody: string;
  triggers: string[];
  mediaUrl?: string;
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

function normalizeQuickSearch(rawText: string): string {
  return String(rawText || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanTemplateBody(
  rawText: string,
  profile?: Partial<BusinessProfile> | null,
  keepBoldMarkers = false,
): string {
  const storeName = profile?.business?.name?.trim();
  const pixKey = profile?.payment?.pixKey?.trim();
  let text = String(rawText || '')
    .replace(/\*\*/g, '*')
    .replace(/\(\s*SKU[^)]*\)/gi, '')
    .replace(/\bSKU[:\s#-]*[A-Za-z0-9_.-]+\b/gi, '')
    .trim();
  if (!keepBoldMarkers) {
    text = text.replace(/\*/g, '');
  }

  if (storeName) {
    text = text.replace(/\{nome_loja\}/gi, storeName);
  }
  if (pixKey) {
    text = text.replace(/\{chave_pix\}/gi, pixKey);
  }
  return text;
}

/**
 * BUG-F05-07: Parser AST seguro em React para *negrito* de WhatsApp e /atalhos em --cg-primary
 * Sem dangerouslySetInnerHTML e sem executar HTML/XSS do usuário.
 */
function renderSafeBoldWhatsappText(text: string): React.ReactNode[] {
  const tokenRegex = /(\*[^*\n]{1,120}\*|(?:^|\s)\/[a-z0-9_-]{2,28})/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      parts.push(
        <strong key={`qr-b-${keyIdx++}`} className="font-bold text-[#0F172A] dark:text-[#F8FAFC]">
          {token.slice(1, -1)}
        </strong>,
      );
    } else {
      const leadingSpace = token.startsWith(' ') ? ' ' : '';
      const slashCmd = token.trimStart();
      if (leadingSpace) parts.push(leadingSpace);
      parts.push(
        <span
          key={`qr-cmd-${keyIdx++}`}
          className="inline-flex items-center rounded bg-[#2563EB]/10 px-1 font-semibold text-[#2563EB] dark:bg-blue-500/20 dark:text-blue-400"
        >
          {slashCmd}
        </span>,
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
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

  // Create/Edit message modal state
  const [localTemplates, setLocalTemplates] = React.useState<QuickReplyTemplate[] | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newTriggers, setNewTriggers] = React.useState('');
  const [newBody, setNewBody] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const bodyTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const loadLocalTemplates = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/whatsapp/ai/templates', { method: 'GET' }, owner);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.templates)) {
        setLocalTemplates(data.templates);
      }
    } catch {
      // Fall back to passed prop or defaults.
    }
  }, [owner]);

  React.useEffect(() => {
    void loadLocalTemplates();
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, [loadLocalTemplates]);

  const effectiveTemplates = localTemplates !== null ? localTemplates : templates;
  const hasCustomTemplates = Boolean(effectiveTemplates && effectiveTemplates.length > 0);
  const sourceList = hasCustomTemplates ? effectiveTemplates! : DEFAULT_QUICK_REPLIES;

  const normalizedList = React.useMemo<NormalizedQuickReply[]>(() => {
    return sourceList.map((item, idx) => {
      const sourceBody = item.body || item.resposta || '';
      return {
        id: item.id || `modelo-${idx + 1}`,
        title: (item.title || item.titulo || `Modelo ${idx + 1}`).trim(),
        category: (item.category || 'Atendimento rápido').trim(),
        body: cleanTemplateBody(sourceBody, profile, false),
        rawDisplayBody: cleanTemplateBody(sourceBody, profile, true),
        triggers: Array.isArray(item.gatilhos) ? item.gatilhos : [],
        mediaUrl: typeof item.mediaUrl === 'string' && item.mediaUrl.trim() ? item.mediaUrl.trim() : undefined,
        isFallback: !hasCustomTemplates,
      };
    });
  }, [hasCustomTemplates, profile, sourceList]);

  const query = normalizeQuickSearch(searchQuery);
  const filteredList = React.useMemo(() => {
    if (!query) return normalizedList;
    const tokens = query.split(/\s+/).filter(Boolean);
    return normalizedList.filter(item => {
      const haystack = normalizeQuickSearch(
        `${item.title} ${item.category} ${item.rawDisplayBody} ${item.triggers.join(' ')}`,
      );
      return tokens.every(tok => haystack.includes(tok));
    });
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
    setEditingId(null);
    setNewTitle('');
    setNewTriggers('');
    setNewBody('');
    setFormError('');
    setCreateOpen(true);
  };

  const handleOpenEdit = (item: NormalizedQuickReply) => {
    setEditingId(item.isFallback ? null : item.id);
    setNewTitle(item.title);
    setNewTriggers(item.triggers.join(', '));
    setNewBody(item.body);
    setFormError('');
    setCreateOpen(true);
  };

  const handleDeleteTemplate = async (item: NormalizedQuickReply) => {
    if (item.isFallback || deletingId) return;
    setDeletingId(item.id);
    try {
      const res = await authenticatedFetch(
        `/api/whatsapp/ai/templates/${encodeURIComponent(item.id)}`,
        { method: 'DELETE' },
        owner,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.erro || data.error || 'Não foi possível excluir a mensagem.');
      }
      if (Array.isArray(data.templates)) setLocalTemplates(data.templates);
      showToast({ type: 'success', message: 'Mensagem excluída.', durationMs: 2200 });
      await onTemplateSaved?.();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro ao excluir mensagem.',
        durationMs: 3200,
      });
    } finally {
      setDeletingId(null);
    }
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
        '/api/whatsapp/ai/templates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId || '',
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
      if (Array.isArray(data.templates)) {
        setLocalTemplates(data.templates);
      }

      setEditingId(null);
      setNewTitle('');
      setNewTriggers('');
      setNewBody('');
      setCreateOpen(false);
      showToast({
        type: 'success',
        message: editingId ? 'Resposta rápida atualizada!' : 'Resposta rápida adicionada à biblioteca!',
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
      <div className={compact ? 'flex flex-col gap-2.5' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
        <div className="relative flex-1 min-w-0">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar resposta rápida ou /atalho..."
            aria-label="Buscar resposta rápida"
            className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50/70 dark:bg-[#090D16] pr-3.5 pl-10 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white dark:focus:bg-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <ActionButton
          variant="primary"
          size={44}
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={handleOpenCreate}
          className={compact ? 'w-full justify-center' : 'shrink-0'}
        >
          Criar nova mensagem
        </ActionButton>
      </div>

      {!hasCustomTemplates && !loading && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#BFDBFE] dark:border-blue-500/30 bg-[#EFF6FF] dark:bg-blue-500/10 px-3.5 py-2.5 text-xs text-[#1D4ED8] dark:text-blue-300">
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
                className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200 dark:border-[#1E293B] bg-white dark:bg-[#111726] p-4 shadow-sm transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="space-y-2 min-w-0">
                  <div className={compact ? 'flex flex-col gap-2 min-w-0' : 'flex items-start justify-between gap-2 min-w-0'}>
                    <div className="min-w-0 flex-1">
                      <span className="inline-block whitespace-nowrap rounded-full bg-[#EFF6FF] dark:bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#1D4ED8] dark:text-blue-300">
                        {item.category}
                      </span>
                      <h3 className="mt-1.5 break-words text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                        {renderSafeBoldWhatsappText(item.title)}
                      </h3>
                    </div>

                    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'flex shrink-0 items-center gap-1.5'}>
                      {!item.isFallback && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            aria-label={`Editar ${item.title}`}
                            data-testid={`quick-reply-edit-${item.id}`}
                            className="inline-flex min-h-[44px] w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1E293B] hover:text-[#2563EB]"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDeleteTemplate(item)}
                            aria-label={`Excluir ${item.title}`}
                            data-testid={`quick-reply-delete-${item.id}`}
                            className="inline-flex min-h-[44px] w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-600 disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCopy(item)}
                        className={`inline-flex min-h-[44px] min-w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all duration-[100ms] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                          isCopied
                            ? 'border border-[#86EFAC] bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300'
                            : 'bg-[#F1F5F9] dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] hover:bg-[#E2E8F0] dark:hover:bg-[#334155]'
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
                  </div>

                  {item.mediaUrl && (
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-100 dark:bg-[#090D16]">
                      <img
                        src={item.mediaUrl}
                        alt={item.title}
                        loading="lazy"
                        className="aspect-[4/3] w-full max-h-40 object-cover"
                      />
                    </div>
                  )}

                  <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-100 dark:border-[#1E293B] bg-slate-50 dark:bg-[#090D16] px-3 py-2.5 text-xs leading-relaxed text-slate-700 dark:text-[#CBD5E1]">
                    {renderSafeBoldWhatsappText(item.rawDisplayBody)}
                  </p>

                  {item.triggers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-[#94A3B8]">Atalhos:</span>
                      {item.triggers.map(tr => (
                        <span
                          key={tr}
                          className="inline-flex items-center rounded-full bg-[#2563EB]/10 dark:bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-[#2563EB] dark:text-blue-400"
                        >
                          /{tr.replace(/^\/+/, '')}
                        </span>
                      ))}
                    </div>
                  )}

                  {variableLabels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-[#94A3B8]">Campos:</span>
                      {variableLabels.map(label => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
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
        title={editingId ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
        description="Crie um atalho de mensagem para copiar no atendimento ou usar por palavra-gatilho (0 créditos)."
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
            <label htmlFor="qr-title" className="block text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
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
              className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] px-3.5 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="qr-triggers" className="block text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              Palavras que ativam esta resposta (opcional)
            </label>
            <input
              id="qr-triggers"
              type="text"
              maxLength={120}
              value={newTriggers}
              onChange={e => setNewTriggers(e.target.value)}
              placeholder="Ex: pix, desconto, pagamento"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] px-3.5 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="qr-body" className="block text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                Texto Completo da Mensagem
              </label>
              <span className="cg-tabular text-xs text-slate-500 dark:text-[#94A3B8]">{newBody.length} caracteres</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-[#94A3B8]">Inserir campo:</span>
              {FRIENDLY_VARIABLE_CHIPS.map(chip => (
                <button
                  key={chip.token}
                  type="button"
                  onClick={() => insertVariableChip(chip.token)}
                  className="inline-flex min-h-[36px] items-center rounded-full border border-[#BFDBFE] dark:border-blue-500/30 bg-[#EFF6FF] dark:bg-blue-500/15 px-3 py-1 text-xs font-semibold text-[#1D4ED8] dark:text-blue-300 transition-all active:scale-[0.97] hover:bg-[#DBEAFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
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
              placeholder="Escreva a mensagem que deseja salvar na sua biblioteca... (*use asteriscos para negrito*)"
              className="w-full rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#090D16] p-3.5 text-sm leading-relaxed text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
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
