import { useState } from 'react';
import type { BrandSpec } from '@/schemas/campaign.schema';
import { supabase } from '@/services/supabase-client';

interface SettingsViewProps {
  brand: BrandSpec;
  isDarkMode: boolean;
  onBrandUpdate?: (name: string) => Promise<boolean>;
  onLogout?: () => void;
  onEditFicha?: () => void;
  onOpenConnect?: () => void;
}

export function SettingsView({ brand, onBrandUpdate, onLogout, onEditFicha, onOpenConnect }: SettingsViewProps) {
  const [name, setName] = useState(brand.name);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="cg-wa-panels">
    <section className="cg-panel">
      <h2>Loja do Studio</h2>
      <form className="cg-form" onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        const ok = await onBrandUpdate?.(name);
        setStatus(ok ? 'Nome salvo.' : 'Não foi possível salvar o nome.');
        setBusy(false);
      }}>
        <label>Nome da loja<input className="cg-field" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <button className="cg-primary" disabled={busy}>Salvar nome</button>
      </form>
      <div className="cg-inline" style={{ marginTop: 12 }}>
        {onEditFicha && (
          <button type="button" className="cg-secondary" onClick={onEditFicha}>
            Editar Ficha & Produtos
          </button>
        )}
        {onOpenConnect && (
          <button type="button" className="cg-secondary" onClick={onOpenConnect}>
            Gerenciar / Reconectar WhatsApp
          </button>
        )}
      </div>
      <p>Configure a identidade do atendimento, os documentos e a conexão na área WhatsApp.</p>
    </section>
    <section className="cg-panel">
      <h2>Acesso à conta</h2>
      <form className="cg-form" onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setStatus(error ? 'Não foi possível atualizar a senha. Entre novamente e tente de novo.' : 'Senha atualizada.');
        if (!error) setPassword('');
        setBusy(false);
      }}>
        <label>Nova senha<input className="cg-field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="cg-primary" disabled={busy}>Atualizar senha</button>
      </form>
      <button className="cg-secondary" onClick={onLogout}>Sair desta conta</button>
    </section>
    {status && <p role="status" className="cg-wa-notice">{status}</p>}
  </main>;
}
