import { useCallback, useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { CheckCircle2, ImagePlus, LifeBuoy, Send, Trash2 } from 'lucide-react';
import { ActionButton } from './ActionButton';
import { ModalContainer } from './ModalContainer';
import { useToast } from './ToastProvider';
import { authenticatedFetch } from '@/services/supabase-client';

const MAX_ATTACHMENT_DATA_URL_CHARS = 2_200_000;
const ALLOWED_ATTACHMENT_RE = /^data:image\/(webp|png|jpeg);base64,/i;

function readBlobAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem colada.'));
    reader.readAsDataURL(file);
  });
}

async function compressClipboardImageToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readBlobAsDataUrl(file);
  if (typeof document === 'undefined') return rawDataUrl;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Decode falhou'));
      el.src = rawDataUrl;
    });
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || 480) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      const webpUrl = canvas.toDataURL('image/webp', 0.84);
      if (ALLOWED_ATTACHMENT_RE.test(webpUrl)) {
        return webpUrl;
      }
    }
  } catch {
    // Headless or SVG/minimal mock image fallback uses original data URL if valid MIME
  }
  return rawDataUrl;
}

export interface SupportTicketItem {
  id: string;
  category: 'vitrine' | 'whatsapp' | 'creditos' | 'outro';
  subject: string;
  description: string;
  attachment_url?: string | null;
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
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const attachImageFile = useCallback(async (file: File) => {
    setAttachmentError('');
    try {
      const encoded = await compressClipboardImageToDataUrl(file);
      if (!ALLOWED_ATTACHMENT_RE.test(encoded)) {
        setAttachmentError('Use uma imagem PNG, JPEG ou WebP.');
        return;
      }
      if (encoded.length > MAX_ATTACHMENT_DATA_URL_CHARS) {
        setAttachmentError('O print ficou acima de 1,5 MB. Recorte uma área menor e cole novamente.');
        return;
      }
      setAttachmentDataUrl(encoded);
    } catch {
      setAttachmentError('Não foi possível processar o print colado.');
    }
  }, []);

  const handlePaste = (e: ClipboardEvent<HTMLElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void attachImageFile(file);
          return;
        }
      }
    }
  };

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

  const handleSubmit = async (e: FormEvent) => {
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
            attachmentDataUrl: attachmentDataUrl || undefined,
            contextMeta: {
              route: typeof window !== 'undefined' ? window.location.pathname : '',
              viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
              hasAttachment: Boolean(attachmentDataUrl),
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
      setAttachmentDataUrl(null);
      setAttachmentError('');
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
        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 dark:border-blue-500/30 dark:bg-blue-950/35">
          <img
            src="/brand/illustrations/illustration-support-hero.svg"
            alt="Suporte CompanyGen"
            className="h-14 w-16 shrink-0 rounded-xl bg-white p-1 object-contain"
          />
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            Descreva o que aconteceu na sua vitrine, WhatsApp ou saldo de créditos. O administrador acompanha todos os chamados em tempo real.
          </p>
        </div>

        <form onSubmit={handleSubmit} onPaste={handlePaste} className="space-y-3">
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
              onPaste={handlePaste}
              placeholder="Conte com suas palavras o que aconteceu (dica: pressione Ctrl+V para colar um print da tela)..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-[#0F172A]"
            />
          </div>

          {/* Captura / Preview de Print via Ctrl+V */}
          <div
            data-testid="support-ticket-paste-zone"
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-xs text-slate-600"
          >
            {attachmentDataUrl ? (
              <div
                data-testid="support-ticket-attachment-preview"
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={attachmentDataUrl}
                    alt="Print anexado ao chamado"
                    className="h-14 w-20 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0F172A]">Print anexado com sucesso</p>
                    <p className="text-[11px] text-slate-500">
                      Será enviado junto com sua mensagem para o administrador.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="support-ticket-attachment-remove"
                  onClick={() => {
                    setAttachmentDataUrl(null);
                    setAttachmentError('');
                  }}
                  aria-label="Remover print anexado"
                  className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ImagePlus className="size-4 shrink-0 text-[#2563EB]" aria-hidden="true" />
                  <span>
                    Dica: pressione <kbd className="rounded border px-1 py-0.5 font-mono text-[10px]">Ctrl+V</kbd> neste formulário para colar um print da tela.
                  </span>
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                  <span>Ou escolher imagem</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void attachImageFile(f);
                    }}
                  />
                </label>
              </div>
            )}
            {attachmentError ? (
              <p className="mt-2 text-[11px] font-semibold text-rose-600" role="alert">
                {attachmentError}
              </p>
            ) : null}
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
