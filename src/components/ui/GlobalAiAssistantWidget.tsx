import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  LifeBuoy,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/services/supabase-client';

export interface GlobalAiAssistantWidgetProps {
  userId?: string;
  activeTab: string;
  isOnboarding?: boolean;
  storeName?: string;
  creditBalance: number;
  onOpenSupport: () => void;
  onNavigateTab: (tab: 'store' | 'whatsapp' | 'dashboard' | 'settings' | 'admin') => void;
  onRefreshData?: () => void;
}

interface GlobalChatMessage {
  role: 'assistant' | 'user';
  text: string;
  costNote?: string;
  steps?: string[];
  attachmentName?: string;
}

const CONTEXTUAL_CHIPS: Record<string, string[]> = {
  onboarding: [
    'Preencher minha loja de eletrônicos no onboarding',
    'Subir 3 produtos de exemplo no meu catálogo',
    'Explicar como funciona o WhatsApp automático',
  ],
  store: [
    'Adicionar novo produto iPhone 15 R$ 4.500',
    'Atualizar endereço e horário da loja',
    'Ir para Pedidos ou WhatsApp',
  ],
  whatsapp: [
    'Criar 10 respostas personalizadas dos meus produtos',
    'Quanto custa cada resposta da Sofia?',
    'Como devolver uma conversa para a IA?',
  ],
  dashboard: [
    'Subir 1 pedido para João Silva R$ 120 via Pix',
    'Excluir pedidos de teste da loja',
    'Como exportar pedidos (.xlsx)?',
  ],
  settings: [
    'Atualizar minha chave Pix e horário de atendimento',
    'Quanto custa cada alteração no Editor?',
    'Abrir chamado de suporte',
  ],
};

export function GlobalAiAssistantWidget({
  userId,
  activeTab,
  isOnboarding = false,
  storeName,
  creditBalance,
  onOpenSupport,
  onNavigateTab,
  onRefreshData,
}: GlobalAiAssistantWidgetProps) {
  const storageKey = `cg_global_ai_msgs_${userId || 'anon'}`;
  const [open, setOpen] = useState(false);
  const [dockSide, setDockSide] = useState<'left' | 'right'>('left');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; textSnippet: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<GlobalChatMessage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-12) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-12)));
    } catch {
      // Ignore storage quota restrictions
    }
  }, [messages, storageKey]);

  // Ctrl+J toggle global em qualquer tela
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const greetingText = `IA Unificada ativa em todas as telas${storeName ? ` (${storeName})` : ''}. Posso preencher onboarding, cadastrar itens, subir ou limpar pedidos e gerar mensagens no WhatsApp (0 cr dúvidas · 0,5 cr ações). Saldo: ${creditBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr.`;

  const chipKey = isOnboarding ? 'onboarding' : activeTab;
  const chips = useMemo(() => CONTEXTUAL_CHIPS[chipKey] || CONTEXTUAL_CHIPS.store, [chipKey]);

  const handleAttachFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const isTextLike = /\.(csv|txt|json|md|tsv|xml|html)$/i.test(file.name) || file.type.startsWith('text/');
      const snippet = isTextLike
        ? (await file.text()).slice(0, 1200)
        : `Arquivo ${file.name} (${Math.round(file.size / 1024)} KB, tipo ${file.type || 'binário'})`;
      setAttachedFile({ name: file.name, textSnippet: snippet });
    } catch {
      setAttachedFile({ name: file.name, textSnippet: `Arquivo ${file.name}` });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAsk = async (raw: string) => {
    const q = raw.trim();
    if ((!q && !attachedFile) || busy) return;
    if (/^(?:abrir\s+)?(?:chamado|suporte)$/i.test(q)) {
      setOpen(false);
      onOpenSupport();
      return;
    }

    const currentAttachment = attachedFile;
    setMessages((prev) => [
      ...prev.slice(-11),
      { role: 'user', text: q || `Analisar arquivo: ${currentAttachment?.name}`, attachmentName: currentAttachment?.name },
    ]);
    setInput('');
    setAttachedFile(null);
    setBusy(true);
    try {
      const res = await authenticatedFetch(
        '/api/ai/global-command',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: q || `Analisar anexo ${currentAttachment?.name}`,
            activeTab: chipKey,
            ...(currentAttachment ? { attachments: [currentAttachment] } : {}),
          }),
        },
        userId,
      );
      const data = await res.json().catch(() => null);
      if (typeof data?.balanceAfter === 'number') {
        try {
          window.dispatchEvent(
            new CustomEvent('companygen:credits-updated', { detail: { balance: data.balanceAfter } }),
          );
        } catch {}
      }
      if (!res.ok || !data?.ok) {
        throw new Error(String(data?.message || data?.error || 'A IA não conseguiu executar agora.'));
      }

      const events = Array.isArray(data.clientEvents) ? data.clientEvents : [];
      for (const ev of events) {
        if (ev?.type === 'onboarding-fill' && ev.payload) {
          window.dispatchEvent(new CustomEvent('companygen:onboarding-fill', { detail: ev.payload }));
        } else if (ev?.type === 'navigate-tab' && ev.tab) {
          onNavigateTab(ev.tab);
        } else if (ev?.type === 'refresh-profile' || ev?.type === 'refresh-orders') {
          onRefreshData?.();
        }
      }

      const costLabel =
        Number(data.debited || 0) > 0
          ? `-${data.debited} cr${typeof data.balanceAfter === 'number' ? ` · Saldo: ${data.balanceAfter} cr` : ''}`
          : '0 cr (grátis)';
      const steps = Array.isArray(data.stepsExecuted) ? (data.stepsExecuted as string[]) : undefined;
      setMessages((prev) => [
        ...prev.slice(-11),
        {
          role: 'assistant',
          text: String(data.assistantMessage || 'Ação concluída!'),
          costNote: costLabel,
          ...(steps && steps.length > 0 ? { steps } : {}),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(-11),
        {
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Erro ao executar comando (0 cr cobrados).',
          costNote: '0 cr',
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-20 z-40 md:bottom-5',
        dockSide === 'right' ? 'right-4 md:right-5' : 'left-4 md:left-5',
      )}
    >
      {open ? (
        <div
          data-testid="global-ai-assistant-panel"
          className="mb-3 flex w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white text-[#09090B] shadow-2xl sm:w-[390px]"
        >
          <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#09090B]" aria-hidden="true" />
              <span className="text-xs font-extrabold tracking-tight text-[#09090B]">
                IA Global · Ctrl+J
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475569]">
                {creditBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr
              </span>
              <button
                type="button"
                data-testid="global-ai-flip-side-btn"
                title="Mudar IA de lado na tela"
                onClick={() => setDockSide((s) => (s === 'left' ? 'right' : 'left'))}
                className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#09090B]"
              >
                <ArrowLeftRight className="size-3.5" />
              </button>
              {messages.length > 0 ? (
                <button
                  type="button"
                  title="Limpar histórico da conversa"
                  onClick={() => setMessages([])}
                  className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Minimizar IA Global"
                className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#09090B]"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-64 space-y-2.5 overflow-y-auto bg-[#F8FAFC] p-3 text-xs">
            <div className="mr-4 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 leading-relaxed text-[#09090B]">
              <p>{greetingText}</p>
            </div>
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-xl px-3 py-2.5 leading-relaxed',
                  m.role === 'user'
                    ? 'ml-6 bg-[#09090B] text-white'
                    : 'mr-4 border border-[#E2E8F0] bg-white text-[#09090B]',
                )}
              >
                {m.attachmentName ? (
                  <span className="mb-1 inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px]">
                    <Paperclip className="size-2.5" />
                    {m.attachmentName}
                  </span>
                ) : null}
                <p>{m.text}</p>
                {m.steps && m.steps.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1 text-[10.5px] text-emerald-700">
                    {m.steps.map((st, sIdx) => (
                      <li key={sIdx}>✓ {st}</li>
                    ))}
                  </ul>
                ) : null}
                {m.costNote ? (
                  <span className="mt-1 inline-block text-[10px] font-semibold text-[#64748B]">
                    {m.costNote}
                  </span>
                ) : null}
              </div>
            ))}
            {busy ? (
              <div
                data-testid="global-ai-running-log"
                className="mr-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#64748B]"
              >
                <Loader2 className="size-3.5 animate-spin text-[#09090B]" />
                <span>Executando comando na tela ({chipKey})...</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-[#E2E8F0] bg-white px-3 py-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy}
                onClick={() => void handleAsk(chip)}
                className="rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-[10.5px] font-medium text-[#475569] hover:border-[#09090B]/30 hover:text-[#09090B]"
              >
                {chip}
              </button>
            ))}
          </div>

          {attachedFile ? (
            <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#EFF6FF] px-3 py-1.5 text-[11px] font-semibold text-[#1D4ED8]">
              <span className="truncate">Anexo: {attachedFile.name}</span>
              <button type="button" onClick={() => setAttachedFile(null)} className="ml-2 text-xs font-bold">
                Remover
              </button>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAsk(input);
            }}
            className="flex items-center gap-1.5 border-t border-[#E2E8F0] bg-white p-2.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void handleAttachFile(e.target.files?.[0])}
            />
            <button
              type="button"
              data-testid="global-ai-attach-btn"
              title="Anexar planilha ou arquivo para a IA ler"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] hover:text-[#09090B]"
            >
              <Paperclip className="size-3.5" />
            </button>
            <input
              type="text"
              data-testid="global-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Peça qualquer ação nesta tela..."
              className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#09090B] placeholder:text-[#94A3B8] focus:border-[#09090B] focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              aria-label="Executar comando na IA Global"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#09090B] text-white hover:bg-[#18181B] disabled:opacity-50"
            >
              <Send className="size-3.5" />
            </button>
            <button
              type="button"
              title="Abrir suporte humano"
              onClick={() => {
                setOpen(false);
                onOpenSupport();
              }}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC] hover:text-[#09090B]"
            >
              <LifeBuoy className="size-3.5" />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="global-ai-assistant-btn"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#09090B] bg-[#09090B] px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:bg-[#18181B]"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        <span>IA Global</span>
      </button>
    </div>
  );
}
