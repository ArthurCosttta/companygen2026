import {
  FileText,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Store,
} from 'lucide-react';
import type { BrandSpec } from '@/schemas/campaign.schema';

export const menuTitles: Record<string, string> = {
  store: 'Loja',
  whatsapp: 'WhatsApp',
  messages: 'Mensagens personalizadas',
  dual: 'Loja e WhatsApp',
  dashboard: 'Dashboard',
  ficha: 'Ficha & Produtos',
  connect: 'Conectar WhatsApp',
  settings: 'Configurações',
};

export function Sidebar({
  brand,
  activeMenu,
  onSelectMenu,
  whatsappConnected,
  onboardingCompleted = false,
}: {
  brand: BrandSpec;
  activeMenu: string;
  onSelectMenu: (menu: string) => void;
  postCount?: number;
  whatsappConnected: boolean;
  onboardingCompleted?: boolean;
}) {
  const operationItems = [
    ['store', 'Loja', Store] as const,
    ['whatsapp', 'WhatsApp', MessageSquare] as const,
    ['messages', 'Mensagens', Sparkles] as const,
    ['dashboard', 'Dashboard', LayoutDashboard] as const,
    ...(!onboardingCompleted
      ? ([
          ['ficha', 'Ficha & Produtos', FileText],
        ] as const)
      : []),
  ];

  const groups = [
    { label: 'Operação', items: operationItems },
    { label: 'Conta', items: [['settings', 'Configurações', Settings] as const] },
  ];

  return (
    <aside className="cg-sidebar">
      <div className="cg-sidebar-brand">
        <span aria-hidden="true">CG</span>
        <div><strong>CompanyGen</strong><small title={brand.name}>{brand.name}</small></div>
      </div>
      <nav aria-label="Navegação do CompanyGen">
        {groups.map(group => (
          <div className="cg-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-current={id === activeMenu ? 'page' : undefined}
                onClick={() => onSelectMenu(id)}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
                {id === 'whatsapp' && (
                  <small aria-hidden="true" title={whatsappConnected ? 'Conectado' : 'Desconectado'}>
                    {whatsappConnected ? 'online' : 'off'}
                  </small>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
