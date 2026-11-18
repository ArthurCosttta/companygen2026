import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  LifeBuoy,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { ActionButton, useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';

interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  businessName: string;
  whatsappPhone: string;
  credits: number;
  totalSpent?: number;
  totalPurchased?: number;
  published?: boolean;
  publicSlug?: string;
  storeUrl?: string;
  source?: string;
  banned: boolean;
  banReason: string;
  bannedAt: string | null;
  isAdmin: boolean;
  lastSeenAt: string | null;
}

interface AdminSiteRow {
  userId: string;
  email: string;
  businessName: string;
  published: boolean;
  publicSlug: string;
  storeUrl: string;
  updatedAt: string | null;
}

interface AdminTicketRow {
  id: string;
  user_id: string;
  user_email: string;
  store_name: string;
  category: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  admin_note: string;
  created_at: string;
}

interface AdminQrCampaignRow {
  id: string;
  slug: string;
  name: string;
  target_url: string;
  scans_count: number;
  active: boolean;
  shortUrl?: string;
  svg?: string;
  pngDataUrl?: string;
  created_at: string;
}

interface AdminInviteRow {
  code: string | null;
  masked: string;
  credits: number;
  maxRedemptions: number;
  redemptionCount: number;
  status: string;
  createdAt: string | null;
  note: string;
  inviteUrl: string | null;
}

interface AdminIncidentRow {
  id: string;
  type: string;
  endpoint: string;
  detail: string;
  userId?: string;
  createdAt: string;
}

interface AdminOverviewData {
  summary: {
    totalUsers: number;
    totalCredits: number;
    totalSpent?: number;
    bannedCount: number;
    activeInvites: number;
    openTicketsCount?: number;
    qrCount?: number;
    incidentsCount?: number;
  };
  users: AdminUserRow[];
  sites?: AdminSiteRow[];
  tickets?: AdminTicketRow[];
  qrCampaigns?: AdminQrCampaignRow[];
  invites: AdminInviteRow[];
  incidents?: AdminIncidentRow[];
}

type AdminSectionTab = 'users' | 'sites' | 'tickets' | 'qr_codes';

export function AdminConsoleView({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminSectionTab>('users');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [inviteCredits, setInviteCredits] = useState('250');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [inviteNote, setInviteNote] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  const [qrName, setQrName] = useState('');
  const [qrTargetUrl, setQrTargetUrl] = useState('https://companygen.store/');
  const [qrFilter, setQrFilter] = useState('');
  const [creatingQr, setCreatingQr] = useState(false);

  const [ticketReplyDrafts, setTicketReplyDrafts] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch('/api/admin/overview', { method: 'GET' }, userId);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível carregar o console admin.');
      }
      setData(json as AdminOverviewData);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao carregar dados administrativos.',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, userId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = data?.users || [];
    if (!q) return list;
    return list.filter(
      (u) =>
        u.id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.businessName.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q),
    );
  }, [data?.users, searchQuery]);

  const filteredQrs = useMemo(() => {
    const q = qrFilter.trim().toLowerCase();
    const list = data?.qrCampaigns || [];
    if (!q) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.target_url.toLowerCase().includes(q),
    );
  }, [data?.qrCampaigns, qrFilter]);

  const handleUpdateCredits = async (targetUser: AdminUserRow, mode: 'add' | 'set', explicitAmount?: number) => {
    const raw = explicitAmount !== undefined ? String(explicitAmount) : creditDrafts[targetUser.id] ?? '';
    const amount = Math.round(Number(raw));
    if (!Number.isFinite(amount)) {
      showToast({ type: 'error', message: 'Informe um número válido de créditos.' });
      return;
    }
    setBusyUserId(targetUser.id);
    try {
      const res = await authenticatedFetch(
        '/api/admin/users/credits',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser.id,
            mode,
            amount,
            note: mode === 'add' ? 'Ajuste rápido pelo admin' : 'Definição direta pelo admin',
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao atualizar créditos.');
      }
      showToast({
        type: 'success',
        message: `Saldo atualizado para ${Number(json.newBalance).toLocaleString('pt-BR')} créditos.`,
      });
      setCreditDrafts((prev) => ({ ...prev, [targetUser.id]: '' }));
      await loadOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao ajustar créditos.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleBan = async (targetUser: AdminUserRow) => {
    setBusyUserId(targetUser.id);
    try {
      const nextBanned = !targetUser.banned;
      const res = await authenticatedFetch(
        '/api/admin/users/ban',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUser.id,
            banned: nextBanned,
            reason: nextBanned ? 'Suspenso pelo administrador no Painel Admin.' : '',
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao atualizar status da conta.');
      }
      showToast({
        type: 'success',
        message: nextBanned ? 'Usuário banido e bloqueado imediatamente.' : 'Usuário reativado.',
      });
      await loadOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao alterar banimento.',
      });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingInvite) return;
    setCreatingInvite(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/invites',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credits: Number(inviteCredits) || 250,
            maxRedemptions: Number(inviteMaxUses) || 1,
            note: inviteNote,
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao criar convite.');
      }
      if (json.invite?.inviteUrl && navigator.clipboard) {
        void navigator.clipboard.writeText(json.invite.inviteUrl).catch(() => {});
      }
      showToast({
        type: 'success',
        message: `Link de convite criado (${json.invite?.code}) e copiado!`,
      });
      setInviteNote('');
      await loadOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao gerar link de convite.',
      });
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (invite: AdminInviteRow) => {
    try {
      const res = await authenticatedFetch(
        '/api/admin/invites/revoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: invite.code, masked: invite.masked }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao revogar convite.');
      showToast({ type: 'success', message: 'Convite revogado.' });
      await loadOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao revogar convite.',
      });
    }
  };

  const handleCreateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingQr) return;
    setCreatingQr(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/qr-campaigns',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: qrName.trim(),
            targetUrl: qrTargetUrl.trim(),
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível criar o QR Code.');
      }
      setQrName('');
      showToast({
        type: 'success',
        message: `QR Code "${json.campaign?.name}" criado com link rastreável!`,
      });
      await loadOverview();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao criar QR Code.',
      });
    } finally {
      setCreatingQr(false);
    }
  };

  const handleDeleteQr = async (id: string) => {
    try {
      const res = await authenticatedFetch(
        '/api/admin/qr-campaigns',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        },
        userId,
      );
      if (!res.ok) throw new Error('Falha ao excluir QR Code.');
      showToast({ type: 'success', message: 'QR Code removido.' });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao remover QR.' });
    }
  };

  const handleResolveTicket = async (ticket: AdminTicketRow) => {
    const note = ticketReplyDrafts[ticket.id] || ticket.admin_note || 'Resolvido pela equipe CompanyGen.';
    try {
      const res = await authenticatedFetch(
        '/api/admin/tickets/resolve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ticket.id, status: 'resolved', adminNote: note }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao atualizar chamado.');
      showToast({ type: 'success', message: 'Chamado marcado como resolvido!' });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao resolver chamado.' });
    }
  };

  const handleCopyText = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopiedCode(key);
    showToast({ type: 'success', message: 'Copiado para a área de transferência!' });
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopiedCode(null), 2000);
  };

  const sitesList = data?.sites || [];
  const ticketsList = data?.tickets || [];

  return (
    <div data-testid="desktop-admin-console" className="min-w-0 space-y-6 pb-10">
      {/* Cabeçalho & Métricas Globais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[#0F172A] text-white">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#0F172A]">Console Admin Cloud — CompanyGen</h2>
              <p className="text-xs text-slate-600">
                Visão global de clientes, gastos, sites gerados, chamados de suporte e QR Codes rastreáveis.
              </p>
            </div>
          </div>

          <ActionButton
            variant="secondary"
            size={44}
            isLoading={loading}
            loadingText="Atualizando..."
            leftIcon={<RefreshCw className="size-4" />}
            onClick={() => void loadOverview()}
          >
            Atualizar dados
          </ActionButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Users className="size-3.5 text-blue-600" />
              Clientes
            </span>
            <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{data?.summary.totalUsers ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Zap className="size-3.5 text-emerald-600" />
              Saldo em circulação
            </span>
            <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">
              {(data?.summary.totalCredits ?? 0).toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <Globe className="size-3.5 text-indigo-600" />
              Sites criados
            </span>
            <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{sitesList.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <LifeBuoy className="size-3.5 text-amber-600" />
              Problemas abertos
            </span>
            <p className="mt-1 text-2xl font-extrabold text-[#B45309]">
              {data?.summary.openTicketsCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
              <QrCode className="size-3.5 text-violet-600" />
              QR Codes ativos
            </span>
            <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{data?.summary.qrCount ?? 0}</p>
          </div>
        </div>

        {/* Navegação de Abas Internas do Admin */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {(
            [
              ['users', `Clientes & Gastos (${filteredUsers.length})`, Users],
              ['sites', `Sites Criados (${sitesList.length})`, Globe],
              ['tickets', `Problemas & Alertas (${ticketsList.length + (data?.incidents?.length || 0)})`, AlertTriangle],
              ['qr_codes', `QR Codes & Códigos (${filteredQrs.length})`, QrCode],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              data-testid={`admin-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition ${
                activeTab === id
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ABA 1: Clientes, Créditos & Gastos */}
      {activeTab === 'users' && (
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">
                Usuários, Saldos & Consumo ({filteredUsers.length})
              </h3>
              <p className="text-xs text-slate-500">
                Total consumido histórico: {(data?.summary.totalSpent ?? 0).toLocaleString('pt-BR')} créditos.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por email, loja ou ID..."
                className="w-full min-h-[40px] rounded-xl border border-slate-200 pl-9 pr-3 text-xs"
              />
            </div>
          </div>

          {/* Mobile Stacked Cards (< 768px) */}
          <div className="space-y-3 md:hidden">
            {filteredUsers.map((u) => {
              const isBusy = busyUserId === u.id;
              return (
                <article
                  key={u.id}
                  data-testid={`admin-user-card-${u.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0F172A]">{u.businessName}</p>
                      <p className="truncate text-xs text-slate-600">{u.email || u.displayName || 'Sem email'}</p>
                      <p className="text-[11px] text-slate-500">
                        Gasto total: {(u.totalSpent ?? 0).toLocaleString('pt-BR')} cr
                      </p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {u.isAdmin ? (
                        <span className="inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-white">
                          ADMIN
                        </span>
                      ) : u.banned ? (
                        <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700">
                          BANIDO
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          Ativo
                        </span>
                      )}
                      <p className="text-xs font-extrabold text-[#0F172A]">
                        {u.credits.toLocaleString('pt-BR')} cr
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      placeholder="Qtd"
                      value={creditDrafts[u.id] ?? ''}
                      onChange={(e) => setCreditDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="min-w-[72px] flex-1 min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleUpdateCredits(u, 'add')}
                      className="min-h-[38px] shrink-0 rounded-lg bg-blue-50 border border-blue-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      +Somar
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleUpdateCredits(u, 'set')}
                      className="min-h-[38px] shrink-0 rounded-lg bg-slate-100 border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      Definir
                    </button>
                  </div>

                  {!u.isAdmin ? (
                    <ActionButton
                      variant={u.banned ? 'success' : 'secondary'}
                      size={44}
                      fullWidth
                      isLoading={isBusy}
                      loadingText="..."
                      leftIcon={u.banned ? <UserCheck className="size-3.5" /> : <Ban className="size-3.5 text-red-600" />}
                      onClick={() => void handleToggleBan(u)}
                    >
                      {u.banned ? 'Reativar' : 'Banir usuário'}
                    </ActionButton>
                  ) : null}
                </article>
              );
            })}
          </div>

          {/* Desktop Table (>= 768px) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Usuário / Loja</th>
                  <th className="py-2 px-3 font-semibold">Saldo Atual</th>
                  <th className="py-2 px-3 font-semibold">Gasto Histórico</th>
                  <th className="py-2 px-3 font-semibold">Ajustar Saldo</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 pl-3 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isBusy = busyUserId === u.id;
                  return (
                    <tr key={u.id} data-testid={`admin-user-row-${u.id}`}>
                      <td className="py-3 pr-3 align-middle">
                        <p className="font-bold text-[#0F172A]">{u.businessName}</p>
                        <p className="text-[11px] text-slate-600">{u.email || u.displayName || 'Sem email'}</p>
                        <p className="font-mono text-[10px] text-slate-400">{u.id}</p>
                      </td>
                      <td className="py-3 px-3 align-middle font-extrabold text-[#0F172A]">
                        {u.credits.toLocaleString('pt-BR')} cr
                      </td>
                      <td className="py-3 px-3 align-middle font-semibold text-slate-600">
                        {(u.totalSpent ?? 0).toLocaleString('pt-BR')} cr
                      </td>
                      <td className="py-3 px-3 align-middle">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            placeholder="Qtd"
                            value={creditDrafts[u.id] ?? ''}
                            onChange={(e) => setCreditDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                            className="w-20 min-h-[34px] rounded-lg border border-slate-200 px-2 text-xs"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUpdateCredits(u, 'add')}
                            className="min-h-[34px] rounded-lg bg-blue-50 border border-blue-200 px-2 font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            +Somar
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUpdateCredits(u, 'set')}
                            className="min-h-[34px] rounded-lg bg-slate-100 border border-slate-200 px-2 font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            Definir
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-middle">
                        {u.isAdmin ? (
                          <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-white">
                            ADMIN
                          </span>
                        ) : u.banned ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700">
                            BANIDO
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-3 align-middle text-right">
                        {!u.isAdmin ? (
                          <ActionButton
                            variant={u.banned ? 'success' : 'secondary'}
                            size={44}
                            isLoading={isBusy}
                            loadingText="..."
                            leftIcon={u.banned ? <UserCheck className="size-3.5" /> : <Ban className="size-3.5 text-red-600" />}
                            onClick={() => void handleToggleBan(u)}
                          >
                            {u.banned ? 'Reativar' : 'Banir'}
                          </ActionButton>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ABA 2: Sites / Vitrines Criadas pelos Usuários */}
      {activeTab === 'sites' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">Sites & Vitrines Criadas ({sitesList.length})</h3>
            <p className="text-xs text-slate-500">
              Inspecione o endereço público das lojas configuradas pelos usuários no Supabase.
            </p>
          </div>
          {sitesList.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
              Nenhuma vitrine configurada ainda pelos usuários.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sitesList.map((site) => (
                <article
                  key={site.userId}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate font-bold text-[#0F172A] text-sm">{site.businessName}</h4>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          site.published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {site.published ? 'Publicada' : 'Rascunho'}
                      </span>
                    </div>
                    <p className="truncate text-slate-600">{site.email || site.userId}</p>
                    {site.publicSlug ? (
                      <p className="font-mono text-[11px] text-slate-500">/{site.publicSlug}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={site.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-3 font-bold text-white hover:bg-[#1D4ED8]"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir Vitrine
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyText(site.userId, `${window.location.origin}${site.storeUrl}`)}
                      className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ABA 3: Problemas Enviados pelos Clientes + Incidentes do Sistema */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">
                Chamados de Suporte dos Clientes ({ticketsList.length})
              </h3>
              <p className="text-xs text-slate-500">
                Problemas enviados diretamente pelos usuários pela tela Ajustes → Reportar Problema.
              </p>
            </div>
            {ticketsList.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                Nenhum chamado aberto pelos clientes até o momento.
              </p>
            ) : (
              <div className="space-y-3">
                {ticketsList.map((ticket) => (
                  <article
                    key={ticket.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="mr-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-800">
                          {ticket.category}
                        </span>
                        <span className="font-bold text-sm text-[#0F172A]">{ticket.subject}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          ticket.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ticket.status === 'resolved' ? <CheckCircle2 className="size-3" /> : null}
                        {ticket.status === 'resolved' ? 'Resolvido' : 'Aberto'}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{ticket.description}</p>
                    <p className="text-[11px] text-slate-500">
                      Cliente: <strong>{ticket.store_name || ticket.user_email || ticket.user_id}</strong> ·{' '}
                      {new Date(ticket.created_at).toLocaleString('pt-BR')}
                    </p>
                    {ticket.status !== 'resolved' ? (
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                        <input
                          type="text"
                          value={ticketReplyDrafts[ticket.id] ?? ''}
                          onChange={(e) =>
                            setTicketReplyDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                          }
                          placeholder="Resposta curta para o cliente (opcional)..."
                          className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs"
                        />
                        <ActionButton
                          variant="success"
                          size={44}
                          onClick={() => void handleResolveTicket(ticket)}
                        >
                          Marcar como Resolvido
                        </ActionButton>
                      </div>
                    ) : ticket.admin_note ? (
                      <p className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[11px] text-emerald-800">
                        <strong>Nota registrada:</strong> {ticket.admin_note}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4" data-testid="admin-incidents-section">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">
                Incidentes Automáticos do Sistema ({data?.incidents?.length || 0})
              </h3>
              <p className="text-xs text-slate-500">
                Webhooks Kiwify com pendência, falhas de e-mail, bloqueios HTTP 402 e fallbacks de IA.
              </p>
            </div>
            {(data?.incidents?.length || 0) === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Nenhum incidente crítico registrado até o momento.
              </p>
            ) : (
              <div className="space-y-2">
                {(data?.incidents || []).slice(0, 20).map((inc) => (
                  <article key={inc.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-[#0F172A] truncate">{inc.type}</span>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {inc.createdAt ? new Date(inc.createdAt).toLocaleString('pt-BR') : '-'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-600 break-all">{inc.endpoint}</div>
                    <p className="text-slate-700">{inc.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ABA 4: Gerador & Rastreador Simples de QR Codes + Links de Convite */}
      {activeTab === 'qr_codes' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <QrCode className="size-4 text-[#2563EB]" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Campanhas de QR Code com Nome & Link Rastreável
                  </h3>
                  <p className="text-xs text-slate-500">
                    Crie QR Codes com nome curto (ex.: Panfleto Centro, Cartão Mesa) apontando para qualquer URL.
                  </p>
                </div>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={qrFilter}
                  onChange={(e) => setQrFilter(e.target.value)}
                  placeholder="Filtrar QR por nome..."
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 pl-9 pr-3 text-xs"
                />
              </div>
            </div>

            <form onSubmit={handleCreateQr} className="grid gap-3 sm:grid-cols-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nome do QR Code
                </label>
                <input
                  type="text"
                  required
                  data-testid="admin-qr-name-input"
                  value={qrName}
                  onChange={(e) => setQrName(e.target.value)}
                  placeholder="Ex: Panfleto Centro"
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Link de destino
                </label>
                <input
                  type="text"
                  required
                  data-testid="admin-qr-target-input"
                  value={qrTargetUrl}
                  onChange={(e) => setQrTargetUrl(e.target.value)}
                  placeholder="https://companygen.store/..."
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-xs"
                />
              </div>
              <ActionButton
                type="submit"
                variant="primary"
                size={44}
                data-testid="admin-qr-create-btn"
                isLoading={creatingQr}
                loadingText="Gerando QR..."
                leftIcon={<Plus className="size-4" />}
              >
                Criar QR Code
              </ActionButton>
            </form>

            {filteredQrs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                Nenhum QR Code encontrado. Crie o primeiro acima para baixar e imprimir.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredQrs.map((qr) => (
                  <article
                    key={qr.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      {qr.pngDataUrl ? (
                        <img
                          src={qr.pngDataUrl}
                          alt={`QR ${qr.name}`}
                          className="size-20 shrink-0 rounded-xl border border-slate-200 bg-white p-1"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 space-y-1">
                        <h4 className="truncate text-sm font-bold text-[#0F172A]">{qr.name}</h4>
                        <p className="font-mono text-[11px] text-blue-700 truncate">/q/{qr.slug}</p>
                        <p className="truncate text-[11px] text-slate-500" title={qr.target_url}>
                          → {qr.target_url}
                        </p>
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {Number(qr.scans_count || 0)} acessos
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {qr.pngDataUrl ? (
                        <a
                          href={qr.pngDataUrl}
                          download={`qr-${qr.slug}.png`}
                          className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="size-3.5" />
                          PNG
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCopyText(qr.id, qr.shortUrl || `${window.location.origin}/q/${qr.slug}`)}
                        className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <Copy className="size-3.5" />
                        Link
                      </button>
                      <button
                        type="button"
                        aria-label={`Remover QR ${qr.name}`}
                        onClick={() => void handleDeleteQr(qr.id)}
                        className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Gerador de Links de Convite */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-[#2563EB]" />
              <h3 className="text-sm font-bold text-[#0F172A]">Links de Convite & Créditos Iniciais</h3>
            </div>

            <form onSubmit={handleCreateInvite} className="grid gap-3 sm:grid-cols-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Créditos iniciais
                </label>
                <input
                  type="number"
                  min={10}
                  max={100000}
                  value={inviteCredits}
                  onChange={(e) => setInviteCredits(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Limite de ativações
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder="Ex: Cliente VIP"
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <ActionButton
                type="submit"
                variant="primary"
                size={44}
                data-testid="admin-create-invite-btn"
                isLoading={creatingInvite}
                loadingText="Gerando..."
                leftIcon={<Plus className="size-4" />}
              >
                Criar Link de Convite
              </ActionButton>
            </form>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pt-1">
              {(data?.invites || []).map((inv, idx) => (
                <div
                  key={`${inv.masked}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#0F172A]">
                        {inv.code || inv.masked}
                      </span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        +{inv.credits} créditos
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          inv.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {inv.status} ({inv.redemptionCount}/{inv.maxRedemptions})
                      </span>
                      {inv.note ? <span className="text-slate-500">· {inv.note}</span> : null}
                    </div>
                    {inv.inviteUrl ? (
                      <p className="truncate text-[11px] font-mono text-slate-500">{inv.inviteUrl}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {inv.inviteUrl && inv.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handleCopyText(inv.masked + idx, inv.inviteUrl || '')}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {copiedCode === inv.masked + idx ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        Copiar link
                      </button>
                    ) : null}
                    {inv.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleRevokeInvite(inv)}
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Revogar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
