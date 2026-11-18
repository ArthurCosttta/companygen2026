import {
  MessageSquare,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionPhaseInfo } from '@/hooks/useConnectionPhase';

export type SidebarTab = 'store' | 'whatsapp' | 'dashboard' | 'settings' | 'admin';

export interface SidebarNavItem {
  id: SidebarTab;
  label: string;
  icon: LucideIcon;
  testId: string;
}

export const SIDEBAR_TABS: readonly SidebarNavItem[] = [
  { id: 'store', label: 'Minha Loja', icon: Store, testId: 'nav-tab-store' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, testId: 'nav-tab-whatsapp' },
  { id: 'dashboard', label: 'Pedidos', icon: ShoppingBag, testId: 'nav-tab-dashboard' },
  { id: 'settings', label: 'Ajustes', icon: Settings, testId: 'nav-tab-settings' },
] as const;

export const ADMIN_SIDEBAR_TAB: SidebarNavItem = {
  id: 'admin',
  label: 'Admin',
  icon: ShieldCheck,
  testId: 'nav-tab-admin',
};

export const SIDEBAR_TITLES: Record<SidebarTab, string> = {
  store: 'Minha Loja',
  whatsapp: 'WhatsApp',
  dashboard: 'Pedidos',
  settings: 'Ajustes',
  admin: 'Admin',
};

export interface SidebarProps {
  storeName: string;
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  connectionPhaseInfo?: ConnectionPhaseInfo;
  pendingOrdersCount?: number;
  waitingHumanCount?: number;
  isAdmin?: boolean;
}

export function Sidebar({
  storeName,
  activeTab,
  onSelectTab,
  connectionPhaseInfo,
  pendingOrdersCount = 0,
  waitingHumanCount = 0,
  isAdmin = false,
}: SidebarProps) {
  const cleanStoreName = storeName.trim() || 'Minha Loja';
  const visibleTabs = isAdmin ? [...SIDEBAR_TABS, ADMIN_SIDEBAR_TAB] : SIDEBAR_TABS;

  const renderTabBadge = (tabId: SidebarTab, compact = false) => {
    if (tabId === 'dashboard' && pendingOrdersCount > 0) {
      return (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-[#2563EB] font-bold text-white',
            compact
              ? 'absolute top-1 right-2.5 min-w-[18px] h-[18px] px-1 text-[10px]'
              : 'ml-auto min-w-[22px] h-[22px] px-1.5 text-[11px]',
          )}
          aria-label={`${pendingOrdersCount} pedidos aguardando`}
        >
          {pendingOrdersCount > 99 ? '99+' : pendingOrdersCount}
        </span>
      );
    }

    if (tabId === 'whatsapp') {
      if (waitingHumanCount > 0) {
        return (
          <span
            aria-label={`${waitingHumanCount} cliente aguardando humano`}
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-[#FF2E54] font-bold text-white animate-pulse ring-2 ring-[#FF2E54]/40',
              compact
                ? 'absolute top-1 right-2.5 min-w-[18px] h-[18px] px-1 text-[10px]'
                : 'ml-auto min-w-[22px] h-[22px] px-1.5 text-[11px]',
            )}
          >
            {waitingHumanCount > 9 ? '9+' : waitingHumanCount}
          </span>
        );
      }
      if (connectionPhaseInfo) {
        return (
          <span
            aria-hidden="true"
            className={cn(
              'rounded-full shrink-0',
              compact ? 'absolute top-1.5 right-3 size-2' : 'ml-auto size-2.5',
            )}
            style={{ backgroundColor: connectionPhaseInfo.colorHex }}
          />
        );
      }
    }

    return null;
  };

  return (
    <>
      {/* Desktop Left Sidebar (240px) */}
      <aside
        aria-label="Menu principal"
        className="cg-sidebar hidden min-[769px]:flex w-[240px]! shrink-0 flex-col justify-between border-r border-slate-200 bg-white px-3 py-5 select-none"
      >
        <div className="space-y-6">
          {/* Brand / Store Identity */}
          <div className="flex items-center gap-3 px-2">
            <img
              src="/brand/simbolo-colorido.webp"
              alt="CompanyGen"
              className="size-10 shrink-0 object-contain drop-shadow-xs"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold tracking-tight text-[#0F172A]">
                CompanyGen
              </p>
              <small
                className="block truncate text-xs font-medium text-slate-500"
                title={cleanStoreName}
              >
                {cleanStoreName}
              </small>
            </div>
          </div>

          {/* Strictly 4 Clean Navigation Tabs */}
          <nav aria-label="Navegação principal" className="space-y-1.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={tab.testId}
                  aria-label={
                    tab.id === 'dashboard'
                      ? 'Pedidos · Dashboard'
                      : tab.id === 'settings'
                        ? 'Ajustes · Configurações'
                        : tab.label
                  }
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectTab(tab.id)}
                  className={cn(
                    'flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-[120ms]',
                    'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1',
                    isActive
                      ? 'border border-[#BFDBFE] bg-[#EFF6FF] font-bold text-[#1D4ED8] shadow-xs'
                      : 'border border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0',
                      isActive ? 'text-[#2563EB]' : 'text-slate-500',
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{tab.label}</span>
                  {renderTabBadge(tab.id, false)}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile Fixed Bottom Bar (<= 768px, 64px height) */}
      <nav
        aria-label="Navegação inferior"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 grid h-16 items-center gap-1 border-t border-slate-200 bg-white/95 px-2 backdrop-blur-md min-[769px]:hidden',
          isAdmin ? 'grid-cols-5' : 'grid-cols-4',
        )}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`${tab.testId}-mobile`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'relative flex min-h-[44px] h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] transition-all duration-[120ms]',
                'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]',
                isActive
                  ? 'bg-[#EFF6FF] font-bold text-[#1D4ED8]'
                  : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]',
              )}
            >
              <Icon
                className={cn(
                  'size-[18px] shrink-0',
                  isActive ? 'text-[#2563EB]' : 'text-slate-500',
                )}
                aria-hidden="true"
              />
              <span className="truncate max-w-full leading-none">{tab.label}</span>
              {renderTabBadge(tab.id, true)}
            </button>
          );
        })}
      </nav>
    </>
  );
}
