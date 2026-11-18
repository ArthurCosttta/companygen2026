import { useEffect, useState } from 'react';
import {
  Activity,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConnectionPhaseInfo } from '@/hooks/useConnectionPhase';
import {
  getBrandHorizontalLogo,
  getBrandSymbolLogo,
  useDocumentDarkMode,
} from '@/utils/themeLogos';

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

export interface ElectronHealthInfo {
  isDesktop?: boolean;
  trayActive?: boolean;
  soundEnabled?: boolean;
  lastPollMs?: number;
}

export interface SidebarProps {
  storeName: string;
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  connectionPhaseInfo?: ConnectionPhaseInfo;
  pendingOrdersCount?: number;
  waitingHumanCount?: number;
  isAdmin?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  electronHealth?: ElectronHealthInfo;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'cg_sidebar_collapsed';

function readInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar({
  storeName,
  activeTab,
  onSelectTab,
  connectionPhaseInfo,
  pendingOrdersCount = 0,
  waitingHumanCount = 0,
  isAdmin = false,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  electronHealth,
}: SidebarProps) {
  const isDark = useDocumentDarkMode();
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() =>
    readInitialSidebarCollapsed(),
  );
  const collapsed = controlledCollapsed ?? internalCollapsed;

  useEffect(() => {
    if (controlledCollapsed === undefined) return;
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        controlledCollapsed ? '1' : '0',
      );
    } catch {
      // Ignore storage access errors
    }
  }, [controlledCollapsed]);

  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
      return;
    }
    setInternalCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

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
      {/* Desktop Left Sidebar (240px <-> 64px retrátil) */}
      <aside
        aria-label="Menu principal"
        data-testid="desktop-sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'cg-sidebar hidden min-[769px]:flex shrink-0 flex-col justify-between border-r select-none transition-[width] duration-200 ease-out',
          collapsed ? 'w-[64px] px-2 py-4' : 'w-[240px] px-3 py-5',
          isDark
            ? 'border-slate-800 bg-[#111726]'
            : 'border-[var(--cg-border)] bg-[var(--cg-surface)]',
        )}
      >
        <div className="space-y-6">
          {/* Brand / Store Identity + Collapse Toggle */}
          <div
            className={cn(
              'flex items-center gap-2',
              collapsed ? 'flex-col justify-center gap-2.5' : 'justify-between px-1.5',
            )}
          >
            <div
              className={cn(
                'flex items-center gap-2.5 min-w-0',
                collapsed && 'justify-center',
              )}
              title={collapsed ? `CompanyGen · ${cleanStoreName}` : cleanStoreName}
            >
              <img
                src={collapsed ? getBrandSymbolLogo(isDark) : getBrandHorizontalLogo(isDark)}
                alt="CompanyGen"
                data-testid="sidebar-brand-logo"
                className={cn(
                  'shrink-0 object-contain bg-transparent',
                  collapsed ? 'size-8' : 'h-7 w-auto max-w-[144px]',
                )}
              />
            </div>

            <button
              type="button"
              data-testid="sidebar-collapse-toggle"
              onClick={handleToggleCollapse}
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                isDark
                  ? 'border-slate-700/80 bg-[#182034] text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'border-[var(--cg-border)] bg-[var(--cg-surface-elevated)] text-slate-600 hover:bg-[var(--cg-hover)] hover:text-[#0B1D52]',
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {!collapsed ? (
            <div className="px-2 -mt-3">
              <small
                className={cn(
                  'block truncate text-xs font-medium',
                  isDark ? 'text-slate-400' : 'text-[var(--cg-text-muted)]',
                )}
                title={cleanStoreName}
              >
                {cleanStoreName}
              </small>
            </div>
          ) : null}

          {/* Strictly 4 Clean Navigation Tabs (+ Admin condicional) */}
          <nav aria-label="Navegação principal" className="space-y-1.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={tab.testId}
                  title={collapsed ? tab.label : undefined}
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
                    'relative flex w-full min-h-[44px] items-center rounded-xl transition-all duration-[120ms]',
                    collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3.5 py-2.5 text-sm',
                    'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1',
                    isActive
                      ? isDark
                        ? 'border border-blue-500/40 bg-[#182034] font-bold text-white shadow-xs'
                        : 'border border-[#BFDBFE] bg-[#EFF6FF] font-bold text-[#1D4ED8] shadow-xs'
                      : isDark
                        ? 'border border-transparent font-medium text-slate-300 hover:bg-[#182034] hover:text-white'
                        : 'border border-transparent font-medium text-slate-600 hover:bg-slate-100 hover:text-[#0F172A]',
                  )}
                >
                  <Icon
                    className={cn(
                      'shrink-0',
                      collapsed ? 'size-5' : 'size-[18px]',
                      isActive
                        ? isDark
                          ? 'text-[#3B82F6]'
                          : 'text-[#2563EB]'
                        : isDark
                          ? 'text-slate-400'
                          : 'text-slate-500',
                    )}
                    aria-hidden="true"
                  />
                  {collapsed ? (
                    <span className="sr-only">{tab.label}</span>
                  ) : (
                    <span className="truncate">{tab.label}</span>
                  )}
                  {renderTabBadge(tab.id, collapsed)}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Desktop .exe Health Footer (only when running inside Electron) */}
        {electronHealth?.isDesktop ? (
          <div
            data-testid="sidebar-exe-health"
            title={`App Desktop · Bandeja ${electronHealth.trayActive !== false ? 'Ativa' : 'Inativa'}${typeof electronHealth.lastPollMs === 'number' ? ` · Sync ${electronHealth.lastPollMs}ms` : ''}`}
            className={cn(
              'mt-4 rounded-xl border p-2.5 text-[11px]',
              collapsed ? 'flex justify-center p-2' : 'space-y-1',
              isDark
                ? 'border-emerald-500/25 bg-emerald-950/20 text-emerald-200'
                : 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
            )}
          >
            {collapsed ? (
              <Activity className="size-4 text-emerald-500" aria-hidden="true" />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 font-bold">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    App Desktop
                  </span>
                  <span className="cg-tabular opacity-80">
                    {typeof electronHealth.lastPollMs === 'number'
                      ? `${electronHealth.lastPollMs}ms`
                      : 'Ativo'}
                  </span>
                </div>
                <p className="truncate text-[10px] opacity-80">
                  Bandeja {electronHealth.trayActive !== false ? 'ativa' : 'pausada'} · Som{' '}
                  {electronHealth.soundEnabled !== false ? 'ligado' : 'mudo'}
                </p>
              </>
            )}
          </div>
        ) : null}
      </aside>

      {/* Mobile Fixed Bottom Bar (<= 768px, 64px height) */}
      <nav
        aria-label="Navegação inferior"
        className={cn(
          'cg-sidebar fixed inset-x-0 bottom-0 z-40 grid h-16 items-center gap-1 border-t px-2 backdrop-blur-md min-[769px]:hidden',
          isDark
            ? 'border-slate-800 bg-[#111726]/95'
            : 'border-[var(--cg-border)] bg-white/95',
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
