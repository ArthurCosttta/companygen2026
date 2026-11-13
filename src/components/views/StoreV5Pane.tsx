import { useMemo, useState } from 'react';
import type { BusinessProfile } from '@/schemas/profile.schema';
import { synthesizeStoreFromProfile } from '@/store-v5/profile-adapter';
import { Store } from '@/store-v5/components/Store';
import type { CartLine } from '@/store-v5/compiler/types';
import type { Override } from '@/store-v5/assets/export';
import '@/store-v5/styles/store-preview.css';
import { Globe, MessageCircle, Monitor, Rocket, Smartphone, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StoreV5PaneProps {
  profile: BusinessProfile;
  revision: number;
  whatsappConnected: boolean;
  onConnectWhatsapp: () => void;
  onClosePane: () => void;
  onPublishStore: () => Promise<void>;
  onSimulateCheckout: (message: string, cart: CartLine[]) => Promise<void>;
  onEditFicha: () => void;
}

export function StoreV5Pane({
  profile,
  revision,
  whatsappConnected,
  onConnectWhatsapp,
  onClosePane,
  onPublishStore,
  onSimulateCheckout,
  onEditFicha,
}: StoreV5PaneProps) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const compiled = useMemo(
    () => synthesizeStoreFromProfile(profile, revision),
    [profile, revision],
  );

  const overrides = useMemo<Record<string, Override>>(() => ({}), []);

  async function handlePublish() {
    setPublishing(true);
    setPublishFeedback(null);
    try {
      await onPublishStore();
      setPublishFeedback({ type: 'ok', text: `Loja publicada na revisão ${revision + 1} ✓` });
    } catch (err) {
      setPublishFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Não foi possível publicar a loja.',
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      data-testid="dual-pane-store"
      className="flex flex-col h-full bg-white border border-[#DCE8F7] rounded-2xl overflow-hidden shadow-[0_7px_23px_rgba(11,29,82,0.06)]"
    >
      {/* Browser 1 Chrome */}
      <div className="px-3.5 py-2.5 bg-[#F3F7FD] border-b border-[#DCE8F7] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-4 h-4 text-[#0867E8] shrink-0" />
          <span className="text-xs font-extrabold text-[#0B1D52] truncate">
            NAVEGADOR 1 · Site Gerado ({profile.business.name || 'Loja'})
          </span>
          <span className="text-[11px] font-mono bg-white border border-[#DCE8F7] text-[#0867E8] px-2 py-0.5 rounded-full shrink-0">
            rev.{revision}
          </span>
          {profile.publishedStore.published && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#DFFBE6] text-[#008E2D] px-2 py-0.5 rounded-full shrink-0">
              <CheckCircle2 className="w-3 h-3" /> Publicada
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex border border-[#DCE8F7] rounded-lg bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewport === 'desktop' ? 'bg-[#EAF2FF] text-[#0867E8]' : 'text-[#64748B]'
              }`}
              title="Visualização Desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                viewport === 'mobile' ? 'bg-[#EAF2FF] text-[#0867E8]' : 'text-[#64748B]'
              }`}
              title="Visualização Mobile"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={handlePublish}
            disabled={publishing || !whatsappConnected}
            title={!whatsappConnected ? 'Conecte o WhatsApp antes de publicar a loja.' : 'Publicar loja'}
            className="h-8 text-xs font-bold bg-[#0867E8] hover:bg-[#0652BC] text-white gap-1.5"
          >
            <Rocket className="w-3.5 h-3.5" />
            {publishing ? 'Validando...' : 'Publicar loja'}
          </Button>

          <button
            type="button"
            onClick={onClosePane}
            aria-label="Fechar navegador da Loja"
            data-testid="close-store-pane"
            className="w-8 h-8 rounded-lg border border-[#DCE8F7] bg-white hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-[#64748B] font-bold"
            title="Fechar navegador da Loja (expande WhatsApp para 100%)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {profile.onboarding.storeGenerated && !whatsappConnected && (
        <div className="cg-store-whatsapp-prompt" data-testid="store-connect-whatsapp-prompt">
          <div>
            <MessageCircle size={19} aria-hidden="true" />
            <p><strong>Sua loja está pronta.</strong><span>Conecte o WhatsApp para receber pedidos e ativar as mensagens do catálogo.</span></p>
          </div>
          <button type="button" onClick={onConnectWhatsapp} data-testid="store-connect-whatsapp-cta">
            Conectar WhatsApp agora
          </button>
        </div>
      )}

      {publishFeedback && (
        <div
          className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b ${
            publishFeedback.type === 'ok'
              ? 'bg-[#DFFBE6] text-[#008E2D] border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          {publishFeedback.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{publishFeedback.text}</span>
        </div>
      )}

      {/* Store Preview Scroller */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#E8EEF7] p-3 preview-scroller">
        {compiled.site ? (
          <div
            className="mx-auto bg-white shadow-sm rounded-xl overflow-hidden transition-all"
            style={{ width: viewport === 'mobile' ? '390px' : '100%', maxWidth: '1200px' }}
          >
            <Store
              site={compiled.site}
              cart={cart}
              setCart={setCart}
              overrides={overrides}
              onAsset={() => onEditFicha()}
              mode="studio"
              onSimulateCheckout={(message, items) => {
                void onSimulateCheckout(message, items);
              }}
            />
          </div>
        ) : (
          <div className="p-6 bg-white rounded-xl border border-red-200 text-red-700 text-sm">
            <strong>Não foi possível compilar a loja a partir da Ficha:</strong>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {compiled.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
