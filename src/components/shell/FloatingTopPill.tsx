import * as React from 'react';
import { motion } from 'motion/react';
import { ClipboardList, Coins, LogOut, MessageCircle, Settings, ShieldCheck } from 'lucide-react';
import type { SidebarTab } from './Sidebar';
import { cn } from '@/lib/utils';

export interface FloatingTopPillProps {
  activeTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  onOpenVitrine: () => void;
  isOnline?: boolean;
  isAdmin?: boolean;
  pendingOrdersCount?: number;
  waitingHumanCount?: number;
  creditBalance?: number;
  onOpenCheckout?: () => void;
  onLogout?: () => void;
}

export function FloatingTopPill({
  activeTab,
  onSelectTab,
  onOpenVitrine,
  isOnline = true,
  isAdmin = false,
  pendingOrdersCount = 0,
  waitingHumanCount = 0,
  creditBalance,
  onOpenCheckout,
  onLogout,
}: FloatingTopPillProps) {
  const tabs: Array<{
    id: SidebarTab;
    testId: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: number;
    urgentBadge?: number;
  }> = [
    {
      id: 'store',
      testId: 'top-pill-tab-store',
      label: 'Minha Loja',
    },
    {
      id: 'whatsapp',
      testId: 'top-pill-tab-whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      urgentBadge: waitingHumanCount > 0 ? waitingHumanCount : undefined,
    },
    {
      id: 'dashboard',
      testId: 'top-pill-tab-dashboard',
      label: 'Pedidos',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
    },
    {
      id: 'settings',
      testId: 'top-pill-tab-settings',
      label: 'Ajustes',
      icon: Settings,
    },
  ];

  const showRightUtilities = typeof creditBalance === 'number' || Boolean(onLogout);
  const formattedCredits =
    typeof creditBalance === 'number'
      ? Number.isInteger(creditBalance)
        ? String(creditBalance)
        : creditBalance.toFixed(1).replace('.', ',')
      : '0';

  return (
    <div className="sticky top-0 z-40 mx-auto w-full max-w-[1360px] px-2 pt-3 pb-1 sm:px-6 sm:pt-4">
      <div className="flex flex-wrap items-center justify-center gap-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="hidden lg:block" aria-hidden="true" />

        <nav
          aria-label="Navegação principal"
          data-testid="editorial-top-pill"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-[#E2E8F0] bg-white/95 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.testId}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] transition-colors sm:px-3.5 sm:text-[13px]',
                  isActive
                    ? 'font-semibold text-white'
                    : 'font-medium text-[#334155] hover:bg-[#F1F5F9] hover:text-[#09090B]',
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="editorial-top-pill-active"
                    className="absolute inset-0 rounded-full bg-[#09090B]"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  />
                ) : null}
                {Icon ? (
                  <Icon
                    className={cn(
                      'relative z-10 hidden size-3.5 sm:inline-block',
                      isActive ? 'text-white' : 'text-current',
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative z-10">{tab.label}</span>
                {typeof tab.urgentBadge === 'number' && tab.urgentBadge > 0 ? (
                  <span
                    data-testid="top-pill-whatsapp-human-badge"
                    className="relative z-10 inline-flex items-center gap-1 rounded-full bg-[#FF2E54] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white animate-pulse"
                  >
                    {tab.urgentBadge}
                  </span>
                ) : typeof tab.badge === 'number' && tab.badge > 0 ? (
                  <span
                    className={cn(
                      'relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[#2563EB]/10 text-[#2563EB]',
                    )}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          <span className="mx-0.5 h-4 w-px shrink-0 bg-[#E2E8F0] sm:mx-1" aria-hidden="true" />

          <button
            type="button"
            data-testid="top-pill-open-vitrine"
            onClick={onOpenVitrine}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-[11.5px] font-semibold text-[#09090B] transition-colors hover:bg-[#EFF6FF] hover:text-[#2563EB] sm:gap-2 sm:px-3.5 sm:text-[13px]"
          >
            <span
              className={cn(
                'size-2 rounded-full sm:size-2.5',
                isOnline ? 'bg-[#10B981]' : 'bg-[#2563EB]',
              )}
              style={{
                boxShadow: isOnline
                  ? '0 0 0 3px rgba(16, 185, 129, 0.20)'
                  : '0 0 0 3px rgba(37, 99, 235, 0.20)',
              }}
            />
            <span className="sm:hidden">Vitrine</span>
            <span className="hidden sm:inline">Ver Vitrine</span>
          </button>

          {isAdmin ? (
            <>
              <span className="mx-0.5 h-4 w-px shrink-0 bg-[#E2E8F0] sm:mx-1" aria-hidden="true" />

              <button
                type="button"
                data-testid="top-pill-tab-admin"
                aria-current={activeTab === 'admin' ? 'page' : undefined}
                onClick={() => onSelectTab('admin')}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] transition-colors sm:px-3.5 sm:text-[13px]',
                  activeTab === 'admin'
                    ? 'font-semibold text-white'
                    : 'font-semibold text-[#334155] hover:bg-[#EFF6FF] hover:text-[#2563EB]',
                )}
                title="Acessar Painel Admin"
              >
                {activeTab === 'admin' ? (
                  <motion.span
                    layoutId="editorial-top-pill-active"
                    className="absolute inset-0 rounded-full bg-[#09090B]"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  />
                ) : null}
                <ShieldCheck
                  className={cn(
                    'relative z-10 size-3.5',
                    activeTab === 'admin' ? 'text-white' : 'text-[#2563EB]',
                  )}
                  aria-hidden="true"
                />
                <span className="relative z-10">Admin</span>
              </button>
            </>
          ) : null}
        </nav>

        {showRightUtilities ? (
          <div className="flex items-center justify-end gap-1.5">
            {typeof creditBalance === 'number' ? (
              <button
                type="button"
                data-testid="top-pill-credits-btn"
                onClick={onOpenCheckout}
                title="Saldo de créditos IA · Clique para recarregar"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold tabular-nums text-[#09090B] shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-colors hover:border-[#2563EB]/40 hover:bg-[#EFF6FF] hover:text-[#2563EB]"
              >
                <Coins className="size-3.5 text-[#2563EB]" aria-hidden="true" />
                <span>{formattedCredits} cr</span>
              </button>
            ) : null}

            {onLogout ? (
              <button
                type="button"
                data-testid="top-pill-logout-btn"
                onClick={onLogout}
                title="Sair da conta"
                aria-label="Sair da conta"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-colors hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#09090B]"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="hidden lg:block" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
