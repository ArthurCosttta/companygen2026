import { useMemo, useState } from 'react';
import { Bot, LifeBuoy, Send, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GlobalAiAssistantWidgetProps {
  activeTab: string;
  storeName?: string;
  creditBalance: number;
  onOpenSupport: () => void;
  onNavigateTab: (tab: 'store' | 'whatsapp' | 'dashboard' | 'settings' | 'admin') => void;
}

const CONTEXTUAL_CHIPS: Record<string, string[]> = {
  store: [
    'Como melhorar minha capa?',
    'Por que um produto está esgotado?',
    'Como editar cores e seções?',
  ],
  whatsapp: [
    'Quanto custa cada resposta?',
    'A Sofia desconecta ao trocar de aba?',
    'Como acionar um atendente humano?',
  ],
  dashboard: [
    'Como exportar pedidos (.xlsx)?',
    'Como ver lucro e DRE dos pedidos?',
    'O que é conversão D1?',
  ],
  settings: [
    'Como ver meu gasto de créditos?',
    'Onde recarregar créditos?',
    'Abrir chamado de suporte',
  ],
};

function resolveStudioHelp(question: string, storeName?: string): { answer: string; actionLabel?: string; actionType?: 'support' | 'whatsapp' | 'store' | 'dashboard' } {
  const q = question.toLowerCase();
  if (/cr[eé]dito|gasto|quanto custa|saldo|0,1|recarreg/.test(q)) {
    return {
      answer:
        'Cada resposta automática da Sofia no WhatsApp consome 0,1 cr; criar subpáginas custa 2 cr; gerar vitrine completa custa 4 cr. Edições manuais de texto/imagem são gratuitas (0 cr). O último gasto aparece no topo da tela.',
    };
  }
  if (/whatsapp|desconect|sofia|atendente|paus/.test(q)) {
    return {
      answer:
        'O WhatsApp Web permanece ativo em segundo plano mesmo quando você muda para Minha Loja ou Pedidos. Se precisar assumir uma conversa, basta responder manualmente ou usar o gatilho de atendente.',
      actionLabel: 'Ir para WhatsApp',
      actionType: 'whatsapp',
    };
  }
  if (/esgotado|capa|cor|se[cç][aã]o|vitrine|editor/.test(q)) {
    return {
      answer: `Na aba Minha Loja (${storeName || 'sua vitrine'}), abra o Editor Visual para ajustar cores, biblioteca de blocos e imagens sem gastar créditos. Produtos só ficam esgotados se o controle de estoque estiver ligado com saldo 0.`,
      actionLabel: 'Ver Minha Loja',
      actionType: 'store',
    };
  }
  if (/pedido|xlsx|planilha|lucro|dre|d1|cont[aá]bil/.test(q)) {
    return {
      answer:
        'Em Pedidos você pode catalogar vendas WhatsApp D1 vs Balcão Manual, registrar custos/taxas/prejuízos e baixar a planilha .XLSX com aba DRE_Financeiro.',
      actionLabel: 'Ir para Pedidos',
      actionType: 'dashboard',
    };
  }
  return {
    answer:
      'Posso te ajudar a navegar pelo painel sem gastar créditos (0 cr). Se for um bug ou dúvida específica da sua conta, abra um chamado direto com nossa equipe.',
    actionLabel: 'Abrir Chamado de Suporte',
    actionType: 'support',
  };
}

export function GlobalAiAssistantWidget({
  activeTab,
  storeName,
  creditBalance,
  onOpenSupport,
  onNavigateTab,
}: GlobalAiAssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user'; text: string; actionLabel?: string; actionType?: 'support' | 'whatsapp' | 'store' | 'dashboard' }>>([
    {
      role: 'assistant',
      text: `Olá! Sou o Assistente CompanyGen (0 cr para dúvidas do painel). Seu saldo atual é ${creditBalance.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr.`,
    },
  ]);

  const chips = useMemo(() => CONTEXTUAL_CHIPS[activeTab] || CONTEXTUAL_CHIPS.store, [activeTab]);

  const handleAsk = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    if (/chamado|suporte/.test(q.toLowerCase())) {
      setOpen(false);
      onOpenSupport();
      return;
    }
    const res = resolveStudioHelp(q, storeName);
    setMessages((prev) => [
      ...prev.slice(-6),
      { role: 'user', text: q },
      { role: 'assistant', text: res.answer, actionLabel: res.actionLabel, actionType: res.actionType },
    ]);
    setInput('');
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-5 md:right-5">
      {open ? (
        <div
          data-testid="global-ai-assistant-panel"
          className="mb-3 flex w-[320px] sm:w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#111726]"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B4DB8] px-4 py-3 text-white dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Bot className="size-4" />
              <span className="text-xs font-extrabold">Assistente IA · Painel (0 cr)</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente IA"
              className="rounded-lg p-1 hover:bg-white/15"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-64 space-y-2.5 overflow-y-auto p-3 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-xl px-3 py-2 leading-relaxed',
                  m.role === 'user'
                    ? 'ml-6 bg-[#EFF6FF] text-[#0F172A] dark:bg-blue-950/60 dark:text-slate-100'
                    : 'mr-4 border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
                )}
              >
                <p>{m.text}</p>
                {m.actionLabel && m.actionType ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (m.actionType === 'support') {
                        setOpen(false);
                        onOpenSupport();
                      } else {
                        onNavigateTab(m.actionType!);
                        setOpen(false);
                      }
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#0B4DB8] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#083B9A]"
                  >
                    <span>{m.actionLabel}</span>
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleAsk(chip)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 p-2.5 dark:border-slate-700"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre qualquer tela..."
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              aria-label="Enviar pergunta"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-[#0B4DB8] text-white hover:bg-[#083B9A]"
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
              className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200"
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
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0B4DB8] px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-blue-900/25 transition hover:bg-[#083B9A]"
      >
        <Sparkles className="size-4" />
        <span>Assistente IA</span>
      </button>
    </div>
  );
}
