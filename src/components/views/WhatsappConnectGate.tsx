import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/services/supabase-client';
import { sanitizePhoneE164 } from '@/schemas/profile.schema';
import { Check, Loader2, RefreshCw, Smartphone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface WhatsappDadosState {
  conectado?: boolean;
  status?: string;
  qr?: string;
  numeroBot?: string;
  perfil?: {
    nome?: string;
    numero?: string;
    telefoneFormatado?: string;
    jid?: string;
    fotoUrl?: string;
  } | null;
}

interface WhatsappConnectGateProps {
  onConfirmAccount: (info: {
    jid: string;
    phoneE164: string;
    displayPhone: string;
    profileName: string;
    profilePhotoUrl: string;
  }) => Promise<void>;
  onReloadWhatsapp?: () => Promise<void>;
}

export function WhatsappConnectGate({ onConfirmAccount, onReloadWhatsapp }: WhatsappConnectGateProps) {
  const [data, setData] = useState<WhatsappDadosState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function fetchStatus(triggerConnect = false) {
    try {
      if (triggerConnect) {
        await authenticatedFetch('/api/whatsapp/api/sessao/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
      }
      const res = await authenticatedFetch('/api/whatsapp/api/dados');
      if (!res.ok) throw new Error('Falha ao consultar sessão do WhatsApp.');
      const json = await res.json();
      let perfil = json.perfil || null;
      if (json.conectado && !perfil) {
        const pRes = await authenticatedFetch('/api/whatsapp/api/whatsapp/perfil').catch(() => null);
        if (pRes?.ok) {
          const pJson = await pRes.json().catch(() => null);
          if (pJson?.ok) perfil = pJson;
        }
      }
      setData({ ...json, perfil });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar ao serviço WhatsApp.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus(false);
    const timer = window.setInterval(() => {
      void fetchStatus(false);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleGenerateQr() {
    setBusy(true);
    setError('');
    try {
      await fetchStatus(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetAccount() {
    setBusy(true);
    setError('');
    try {
      const res = await authenticatedFetch('/api/whatsapp/api/sessao/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error('Não foi possível desconectar a conta atual.');
      await fetchStatus(true);
      await onReloadWhatsapp?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao trocar conta.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const rawNum = data?.perfil?.numero || data?.numeroBot || data?.perfil?.jid?.split('@')[0] || '';
    const phoneE164 = sanitizePhoneE164(rawNum);
    if (!phoneE164) {
      setError('Aguarde a leitura completa do número do WhatsApp conectado.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirmAccount({
        jid: data?.perfil?.jid || `${phoneE164}@s.whatsapp.net`,
        phoneE164,
        displayPhone: data?.perfil?.telefoneFormatado || data?.perfil?.numero || `+${phoneE164}`,
        profileName: data?.perfil?.nome || 'Minha Loja',
        profilePhotoUrl: data?.perfil?.fotoUrl || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar a conta.');
    } finally {
      setBusy(false);
    }
  }

  const qrSrc = data?.qr && data.qr.startsWith('data:image/') ? data.qr : '';
  const connected = Boolean(data?.conectado && (data?.perfil?.numero || data?.numeroBot));

  return (
    <div className="min-h-screen bg-[#F7FAFF] text-[#0B1D52] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white border border-[#E0EAF8] rounded-3xl shadow-[0_14px_40px_rgba(11,29,82,0.08)] p-8">
        <div className="flex items-center justify-between gap-4 border-b border-[#E0EAF8] pb-5 mb-6">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0867E8] bg-[#EAF2FF] px-3 py-1 rounded-full">
              <Smartphone className="w-3.5 h-3.5" /> Passo 1 de 2 · WhatsApp Oficial
            </span>
            <h1 className="text-2xl font-extrabold mt-2 tracking-tight">
              {connected ? 'Confirme a conta do WhatsApp conectada' : 'Conecte seu WhatsApp para começar'}
            </h1>
            <p className="text-sm text-[#64748B] mt-1">
              {connected
                ? 'Já capturamos o número verificado e a foto do perfil. Esse número será usado nos botões de checkout da loja.'
                : 'Conecte o WhatsApp da loja primeiro via Baileys. Assim sua loja já nasce com o número real verificado.'}
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 ${
            connected ? 'bg-[#DFFBE6] text-[#008E2D]' : 'bg-[#EAF2FF] text-[#0867E8]'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#008E2D]' : 'bg-[#0867E8] animate-pulse'}`} />
            {connected ? 'Conectado' : data?.status || 'Aguardando leitura'}
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {connected ? (
          <div className="bg-[#F3F7FD] border border-[#DCE8F7] rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-white border-2 border-[#0867E8] flex items-center justify-center shrink-0 shadow-sm">
              {data?.perfil?.fotoUrl ? (
                <img src={data.perfil.fotoUrl} alt={data.perfil.nome || 'WhatsApp'} className="w-full h-full object-cover" />
              ) : (
                <Smartphone className="w-10 h-10 text-[#0867E8]" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008E2D] bg-[#DFFBE6] px-2.5 py-0.5 rounded-full mb-2">
                <ShieldCheck className="w-3.5 h-3.5" /> Origem verificada (Baileys)
              </div>
              <h2 className="text-xl font-extrabold text-[#0B1D52]">{data?.perfil?.nome || 'Conta comercial'}</h2>
              <p className="text-base font-semibold text-[#0867E8] mt-0.5">{data?.perfil?.numero}</p>
              <p className="text-xs text-[#64748B] mt-2">
                A logo sugerida da loja e o link de checkout <code className="bg-white px-1.5 py-0.5 rounded border">wa.me</code> serão preenchidos automaticamente.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={handleResetAccount} disabled={busy}>
                Não é esta conta
              </Button>
              <Button
                type="button"
                className="bg-[#0867E8] hover:bg-[#0652BC] text-white font-bold gap-2"
                onClick={handleConfirm}
                disabled={busy}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                É esta · Ir para Ficha
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-[260px_1fr] gap-8 items-center">
            <div className="w-[260px] h-[260px] mx-auto rounded-2xl border-2 border-[#DCE8F7] bg-[#F3F7FD] flex items-center justify-center p-3 overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-xs text-[#64748B]">
                  <Loader2 className="w-7 h-7 animate-spin text-[#0867E8]" />
                  <span>Iniciando sessão Baileys...</span>
                </div>
              ) : qrSrc ? (
                <img
                  src={qrSrc}
                  alt="QR Code real do WhatsApp"
                  data-testid="baileys-qr-image"
                  className="w-full h-full object-contain rounded-xl bg-white p-1"
                />
              ) : (
                <div className="text-center px-4">
                  <p className="text-xs text-[#64748B] mb-3">
                    Clique abaixo para gerar um novo QR Code real pelo Baileys.
                  </p>
                  <Button type="button" size="sm" onClick={handleGenerateQr} disabled={busy} className="gap-2 bg-[#0867E8] text-white">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Gerar QR Code
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <ol className="space-y-3 text-sm text-[#0B1D52]">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EAF2FF] text-[#0867E8] font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                  <span>Abra o <strong>WhatsApp</strong> no celular da sua loja.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EAF2FF] text-[#0867E8] font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                  <span>Toque em <strong>Mais opções ⋮</strong> ou <strong>Configurações</strong> → <strong>Aparelhos conectados</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EAF2FF] text-[#0867E8] font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                  <span>Aponte a câmera para o QR Code ao lado. Assim que parear, avançaremos para a Ficha da Empresa.</span>
                </li>
              </ol>

              <div className="pt-2 flex flex-wrap gap-3">
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateQr} disabled={busy} className="gap-2">
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Atualizar QR
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
