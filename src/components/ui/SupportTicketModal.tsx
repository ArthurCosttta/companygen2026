import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LifeBuoy, Send } from 'lucide-react';
import { ActionButton } from './ActionButton';
import { ModalContainer } from './ModalContainer';
import { useToast } from './ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';

export interface SupportTicketItem {
  id: string;
  category: 'vitrine' | 'whatsapp' | 'creditos' | 'outro';
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  admin_note?: string;
  created_at: string;
}

export interface SupportTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string;
  storeName?: string;
}

export function SupportTicketModal({
  open,
  onOpenChange,
  userId,
  storeName,
}: SupportTicketModalProps) {
  const { showToast } = useToast();
  const [category, setCategory] = useState<'vitrine' | 'whatsapp' | 'creditos' | 'outro'>('vitrine');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const loadMyTickets = useCallback(async () => {
    if (!userId) return;
    setLoadingTickets(true);
    try {
      const res = await authenticatedFetch('/api/support/tickets', { method: 'GET' }, userId);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.tickets)) {
        setTickets(json.tickets as SupportTicketItem[]);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoadingTickets(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      void loadMyTickets();
    }
  }, [loadMyTickets, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || sending) return;
    if (subject.trim().length < 3 || description.trim().length < 6) {
      showToast({ type: 'error', message: 'Informe um título e descreva brevemente o problema.' });
      return;
    }

    setSending(true);
    try {
      const res = await authenticatedFetch(
        '/api/support/tickets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            subject: subject.trim(),
            description: description.trim(),
            storeName: storeName || '',
            contextMeta: {
              route: typeof window !== 'undefined' ? window.location.pathname : '',
              viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
            },
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível enviar o chamado.');
      }
      setSubject('');
      setDescription('');
      showToast({
        type: 'success',
        message: 'Chamado enviado! Nossa equipe recebeu e responderá em breve.',
      });
      await loadMyTickets();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao enviar problema.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalContainer
      open={open}
      onOpenChange={onOpenChange}
      maxWidth="lg"
      title="Reportar Problema ou Pedir Ajuda"
      description="Envie diretamente para o administrador com os detalhes da sua loja."
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5">
          <img
            src="/brand/illustrations/illustration-support-hero.svg"
            alt="Suporte CompanyGen"
            className="h-14 w-16 shrink-0 rounded-xl bg-white p-1 object-contain"
          />
          <p className="text-xs leading-relaxed text-slate-700">
            Descreva o que aconteceu na sua vitrine, WhatsApp ou saldo de créditos. O administrador acompanha todos os chamados em tempo real.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="support-cat" className="mb-1 block text-xs font-semibold text-slate-700">
                Área do problema
              </label>
              <select
                id="support-cat"
                data-testid="support-ticket-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportTicketItem['category'])}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A]"
              >
                <option value="vitrine">Vitrine / Produtos</option>
                <option value="whatsapp">WhatsApp / Sofia IA</option>
                <option value="creditos">Créditos / Kiwify</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="support-subj" className="mb-1 block text-xs font-semibold text-slate-700">
                Título curto
              </label>
              <input
                id="support-subj"
                data-testid="support-ticket-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Produto não aparece na vitrine ou WhatsApp desconectou"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-[#0F172A]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="support-desc" className="mb-1 block text-xs font-semibold text-slate-700">
              O que aconteceu?
            </label>
            <textarea
              id="support-desc"
              data-testid="support-ticket-description"
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Conte com suas palavras em que tela você estava e o que esperava que acontecesse..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-[#0F172A]"
            />
          </div>

          <div className="flex justify-end">
            <ActionButton
              type="submit"
              variant="primary"
              size={44}
              data-testid="support-ticket-submit"
              isLoading={sending}
              loadingText="Enviando..."
              leftIcon={<Send className="size-4" />}
            >
              Enviar Chamado ao Suporte
            </ActionButton>
          </div>
        </form>

        {/* Histórico dos meus chamados */}
        <div className="border-t border-slate-200 pt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
            <LifeBuoy className="size-4 text-[#2563EB]" />
            <span>Seus chamados recentes ({tickets.length})</span>
          </div>
          {loadingTickets ? (
            <p className="text-xs text-slate-500">Carregando chamados...</p>
          ) : tickets.length === 0 ? (
            <p className="text-xs text-slate-500">Você ainda não enviou nenhum chamado.</p>
          ) : (
            <ul className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {tickets.map((t) => (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#0F172A] truncate">{t.subject}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        t.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status === 'resolved' ? <CheckCircle2 className="size-3" /> : null}
                      {t.status === 'resolved' ? 'Resolvido' : 'Aberto'}
                    </span>
                  </div>
                  <p className="text-slate-600">{t.description}</p>
                  {t.admin_note ? (
                    <p className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-emerald-800 border border-emerald-200">
                      <strong>Resposta do suporte:</strong> {t.admin_note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalContainer>
  );
}
