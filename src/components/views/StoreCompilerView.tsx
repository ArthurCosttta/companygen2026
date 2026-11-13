import { useEffect, useRef, useState } from 'react';
import type { BrandSpec } from '@/schemas/campaign.schema';
import type { Asset } from '@/compiler/types';
import { generateStoreRawTables, analyzePromptAndGenerateQuestions } from '@/services/store-prompt-generator';
import { loadWorkspace, updateWorkspace, workspaceUser } from '@/services/local-storage';
import { authenticatedFetch } from '@/services/supabase-client';

interface Props { brand: BrandSpec; assets: Asset[]; isDarkMode: boolean }

export function StoreCompilerView({ brand, assets, isDarkMode }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const owner = workspaceUser();

  useEffect(() => {
    const host = window as unknown as Record<string, unknown>;
    const engine = {
      brandName: brand.name,
      generateStoreRawTables,
      analyzePromptAndGenerateQuestions,
      getConnectedNumber: async () => {
        const response = await authenticatedFetch('/api/whatsapp/api/dados', undefined, owner);
        if (!response.ok) return '';
        const data = await response.json();
        return typeof data.numeroBot === 'string' ? data.numeroBot.replace(/\D/g, '') : '';
      },
      saveDraft: async (raw: Record<string, unknown>) => {
        try {
          await updateWorkspace(data => { data.store = raw; }, owner);
          setStatus('Rascunho salvo.');
        } catch {
          setStatus('Não foi possível salvar o rascunho. Tente importar a planilha novamente.');
        }
      },
      publishCatalog: async (skus: unknown[], nomeLoja: string) => {
        if (!window.confirm('Atualizar o catálogo do seu WhatsApp com os produtos desta loja?')) return false;
        const response = await authenticatedFetch('/api/whatsapp/api/skus/sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus, configLoja: { nomeLoja } }),
        }, owner);
        if (!response.ok) throw new Error('Falha ao sincronizar o catálogo.');
        setStatus('Catálogo sincronizado com o WhatsApp desta conta.');
        return true;
      },
    };
    host.__CG_STORE_ENGINE__ = engine;
    return () => { if (host.__CG_STORE_ENGINE__ === engine) delete host.__CG_STORE_ENGINE__; };
  }, [owner, brand.name]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    loadWorkspace(owner).then(({ data }) => {
      if (active && data.store) iframe.current?.contentWindow?.postMessage({
        type: 'RESTORE_STORE_DRAFT', raw: data.store,
      }, window.location.origin);
    }).catch(() => { if (active) setStatus('Não foi possível recuperar o rascunho salvo.'); });
    return () => { active = false; };
  }, [ready, owner]);

  useEffect(() => {
    if (!ready) return;
    const win = iframe.current?.contentWindow;
    win?.postMessage({ type: 'SET_DARK_MODE', isDark: isDarkMode }, window.location.origin);
    win?.postMessage({ type: 'INJECT_STUDIO_ASSETS', assets }, window.location.origin);
  }, [ready, isDarkMode, assets, brand]);

  return (
    <section className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      {status && <p role="status" className="cg-wa-notice">{status}</p>}
      <iframe ref={iframe} id="store-compiler-frame" src="/store-compiler/index.html"
        title="CompanyGen Loja Virtual" className="w-full flex-1 min-h-0 border-0"
        onLoad={() => setReady(true)} />
    </section>
  );
}
