import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flag,
  KeyRound,
  LifeBuoy,
  Monitor,
  Package,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { ActionButton, useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';
import {
  AdminUser360Drawer,
  type AdminFeatureFlagDef,
  type AdminKiwifyEventRow,
  type AdminUser360Target,
} from './AdminUser360Drawer';

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
  id?: string;
  code: string | null;
  masked: string;
  codeType?: 'invite_only' | 'user_recharge';
  credits: number;
  maxRedemptions: number;
  redemptionCount: number;
  status: string;
  statusLabel?: string;
  createdAt: string | null;
  createdBy?: string | null;
  note: string;
  lastRedeemedByEmail?: string | null;
  lastRedeemedAt?: string | null;
  inviteUrl: string | null;
  redeemUrl?: string | null;
}

interface AdminIncidentRow {
  id: string;
  type: string;
  endpoint: string;
  detail: string;
  userId?: string;
  createdAt: string;
}

interface DesktopFleetRow {
  machineId: string;
  userId: string;
  appVersion: string;
  osPlatform: string;
  webviewPhase: string;
  selectorHealth: 'healthy' | 'degraded' | 'offline';
  outdated?: boolean;
  lastSeenAt: string;
}

interface DesktopPolicyData {
  minSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes: string;
}

interface QrBatchResponse {
  batchId: string;
  batchName: string;
  count: number;
  creditsPerCode: number;
  codes: Array<{ index: number; code: string; shortUrl: string; pngDataUrl: string }>;
  manifestCsv: string;
  a4Html: string;
  zipBase64: string;
  filename: string;
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
    onboardingFeedbackCount?: number;
    grossRevenueCents?: number;
    kiwifyFeeCents?: number;
    aiCostCents?: number;
    netMarginCents?: number;
    marginAlert?: boolean;
  };
  funnelSummary?: {
    conta_criada: number;
    dados_loja: number;
    whatsapp_conectado: number;
    publicado: number;
    primeira_venda: number;
    stalledOver24h: number;
  };
  onboardingFeedbackSummary?: {
    total: number;
    easy: number;
    medium: number;
    stuck: number;
  };
  desktopFleet?: DesktopFleetRow[];
  desktopPolicy?: DesktopPolicyData;
  canaryDomAlert?: {
    active: boolean;
    code: string;
    degradedUsersCount: number;
    message: string;
  };
  engineHealth?: {
    glm: { status: string; avgLatencyMs: number; fallbackRatePct: number };
    runpod: { status: string; queueDepth: number };
    smtp: { status: string };
    failureRefunds24h: { glm: number; runpod: number; smtp: number; other: number; total: number };
  };
  kiwifyEvents?: AdminKiwifyEventRow[];
  featureFlags?: Record<string, AdminFeatureFlagDef>;
  auditLog?: Array<{
    id: string;
    action: string;
    targetUserId?: string;
    reasonCode?: string;
    note?: string;
    by?: string;
    at?: string;
  }>;
  users: AdminUser360Target[];
  tickets?: AdminTicketRow[];
  qrCampaigns?: AdminQrCampaignRow[];
  invites: AdminInviteRow[];
  incidents?: AdminIncidentRow[];
}

type AdminSectionTab = 'clients' | 'finance' | 'fleet' | 'qr_batches';
type ClientFilterChip = 'all' | 'stalled' | 'low_balance' | 'chargeback' | 'risk';

const FUNNEL_STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  conta_criada: {
    label: 'Conta Criada',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  dados_loja: {
    label: 'Dados da Loja',
    cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  },
  whatsapp_conectado: {
    label: 'WhatsApp Conectado',
    cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  },
  publicado: {
    label: 'Vitrine Publicada',
    cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  },
  primeira_venda: {
    label: '1ª Venda ✓',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
};

function formatBrl(cents = 0): string {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function AdminConsoleView({
  userId,
  onEnterSupportMode,
}: {
  userId: string;
  onEnterSupportMode?: (snapshot: Record<string, unknown>, target: AdminUser360Target) => void;
}) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminSectionTab>('clients');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<ClientFilterChip>('all');
  const [drawerUser, setDrawerUser] = useState<AdminUser360Target | null>(null);

  // Invites & Support Tickets
  const [inviteCredits, setInviteCredits] = useState('20');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [inviteCodeType, setInviteCodeType] = useState<'invite_only' | 'user_recharge'>('invite_only');
  const [inviteNote, setInviteNote] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [codeFilter, setCodeFilter] = useState<'all' | 'active' | 'used' | 'invite_only' | 'user_recharge'>('all');
  const [codeSearch, setCodeSearch] = useState('');
  const [revokingCodeId, setRevokingCodeId] = useState<string | null>(null);
  const [ticketReplyDrafts, setTicketReplyDrafts] = useState<Record<string, string>>({});

  // Kiwify DLQ search/replay
  const [kwQuery, setKwQuery] = useState('');
  const [kwStatus, setKwStatus] = useState('');
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Desktop Policy
  const [minVersion, setMinVersion] = useState('1.0.0');
  const [latestVersion, setLatestVersion] = useState('1.0.0');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // QR Campaigns & Batch A4/ZIP
  const [qrName, setQrName] = useState('');
  const [qrTargetUrl, setQrTargetUrl] = useState('https://companygen.store/');
  const [qrFilter, setQrFilter] = useState('');
  const [creatingQr, setCreatingQr] = useState(false);
  const [batchName, setBatchName] = useState('Panfleto Lançamento');
  const [batchCount, setBatchCount] = useState('6');
  const [batchCredits, setBatchCredits] = useState('100');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [lastBatch, setLastBatch] = useState<QrBatchResponse | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
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
      const typed = json as AdminOverviewData;
      setData(typed);
      if (typed.desktopPolicy) {
        setMinVersion(typed.desktopPolicy.minSupportedVersion || '1.0.0');
        setLatestVersion(typed.desktopPolicy.latestVersion || '1.0.0');
        setForceUpdate(Boolean(typed.desktopPolicy.forceUpdate));
      }
      setDrawerUser((prev) =>
        prev ? typed.users.find((u) => u.id === prev.id) || prev : null,
      );
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

  const ticketsByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data?.tickets || []) {
      if (t.status !== 'resolved' && t.user_id) {
        map.set(t.user_id, (map.get(t.user_id) || 0) + 1);
      }
    }
    return map;
  }, [data?.tickets]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (data?.users || []).filter((u) => {
      if (filterChip === 'stalled' && !u.stalledOver24h) return false;
      if (filterChip === 'low_balance' && u.credits >= 15) return false;
      if (filterChip === 'chargeback' && u.reviewFlag !== 'NEGATIVE_BALANCE_REVIEW') return false;
      if (filterChip === 'risk' && !u.riskAbuse) return false;
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.businessName.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
      );
    });
  }, [data?.users, filterChip, searchQuery]);

  const filteredKiwifyEvents = useMemo(() => {
    const q = kwQuery.trim().toLowerCase();
    return (data?.kiwifyEvents || []).filter((ev) => {
      if (kwStatus && String(ev.processing_status || '').toLowerCase() !== kwStatus) return false;
      if (!q) return true;
      return `${ev.order_id} ${ev.customer_email || ''} ${ev.plan_code || ''} ${ev.error_message || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.kiwifyEvents, kwQuery, kwStatus]);

  const filteredQrs = useMemo(() => {
    const q = qrFilter.trim().toLowerCase();
    return (data?.qrCampaigns || []).filter((item) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.target_url.toLowerCase().includes(q)
      );
    });
  }, [data?.qrCampaigns, qrFilter]);

  const handleCopyText = (key: string, text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopiedCode(key);
    showToast({ type: 'success', message: 'Copiado para a área de transferência!' });
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateInvite = async (e: FormEvent) => {
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
            credits: Number(inviteCredits) || 20,
            maxRedemptions: Number(inviteMaxUses) || 1,
            codeType: inviteCodeType,
            note: inviteNote,
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao criar código.');
      const toCopy =
        inviteCodeType === 'user_recharge'
          ? json.invite?.code || json.invite?.redeemUrl
          : json.invite?.inviteUrl || json.invite?.code;
      if (toCopy) void navigator.clipboard?.writeText(toCopy).catch(() => {});
      showToast({
        type: 'success',
        message:
          inviteCodeType === 'user_recharge'
            ? `Código de recarga criado (${json.invite?.code}) e copiado!`
            : `Convite criado (${json.invite?.code}) e link copiado!`,
      });
      setInviteNote('');
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao criar código.' });
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (row: AdminInviteRow) => {
    const key = row.id || row.masked;
    if (revokingCodeId) return;
    setRevokingCodeId(key);
    try {
      const res = await authenticatedFetch(
        '/api/admin/invites/revoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, code: row.code, masked: row.masked }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao revogar código.');
      showToast({ type: 'success', message: `Código ${row.code || row.masked} revogado.` });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao revogar código.' });
    } finally {
      setRevokingCodeId(null);
    }
  };

  const filteredInvites = useMemo(() => {
    const list = data?.invites || [];
    const q = codeSearch.trim().toLowerCase();
    return list.filter((row) => {
      const isUsed = row.redemptionCount > 0 || row.status === 'depleted' || row.status === 'used_partial';
      const isAvail = row.status === 'active' && row.redemptionCount < row.maxRedemptions;
      if (codeFilter === 'active' && !isAvail) return false;
      if (codeFilter === 'used' && !isUsed) return false;
      if (codeFilter === 'invite_only' && (row.codeType || 'invite_only') !== 'invite_only') return false;
      if (codeFilter === 'user_recharge' && row.codeType !== 'user_recharge') return false;
      if (!q) return true;
      return `${row.code || ''} ${row.masked} ${row.note || ''} ${row.lastRedeemedByEmail || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.invites, codeFilter, codeSearch]);

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

  const handleReplayKiwify = async (ev: AdminKiwifyEventRow) => {
    const key = `${ev.order_id}-${ev.webhook_event_type}`;
    setReplayingId(key);
    try {
      const res = await authenticatedFetch(
        '/api/admin/kiwify/replay',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: ev.order_id,
            eventType: ev.webhook_event_type || 'order_approved',
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha no replay.');
      showToast({
        type: 'success',
        message: json.duplicate
          ? `Pedido ${ev.order_id}: replay idempotente ignorou duplicata.`
          : `Pedido ${ev.order_id} reprocessado com sucesso!`,
      });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro no replay.' });
    } finally {
      setReplayingId(null);
    }
  };

  const handleSaveDesktopPolicy = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/desktop-policy',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            minSupportedVersion: minVersion.trim(),
            latestVersion: latestVersion.trim(),
            forceUpdate,
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar política.');
      showToast({ type: 'success', message: 'Política de versão mínima .exe salva!' });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar política.' });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleUpdateFlagMode = async (flag: AdminFeatureFlagDef, nextMode: AdminFeatureFlagDef['globalMode']) => {
    try {
      const res = await authenticatedFetch(
        '/api/admin/feature-flags',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: flag.key,
            globalMode: nextMode,
            betaUserIds: flag.betaUserIds,
            description: flag.description || '',
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Erro ao atualizar flag.');
      showToast({ type: 'success', message: `Flag "${flag.key}" -> ${nextMode}` });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao atualizar flag.' });
    }
  };

  const handleCreateQr = async (e: FormEvent) => {
    e.preventDefault();
    if (creatingQr) return;
    setCreatingQr(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/qr-campaigns',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: qrName.trim(), targetUrl: qrTargetUrl.trim() }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Não foi possível criar QR.');
      setQrName('');
      showToast({ type: 'success', message: `QR "${json.campaign?.name}" criado!` });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao criar QR.' });
    } finally {
      setCreatingQr(false);
    }
  };

  const handleDeleteQr = async (id: string) => {
    try {
      const res = await authenticatedFetch(
        '/api/admin/qr-campaigns',
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) },
        userId,
      );
      if (!res.ok) throw new Error('Falha ao remover QR.');
      showToast({ type: 'success', message: 'QR Code removido.' });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao remover QR.' });
    }
  };

  const handleCreateQrBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (creatingBatch) return;
    setCreatingBatch(true);
    try {
      const res = await authenticatedFetch(
        '/api/admin/qr-batches',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchName: batchName.trim() || 'Lote Campanha',
            count: Number(batchCount) || 6,
            credits: Number(batchCredits) || 100,
          }),
        },
        userId,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao gerar lote gráfico.');
      setLastBatch(json as QrBatchResponse);
      showToast({
        type: 'success',
        message: `Lote A4/ZIP gerado com ${json.count} cartelas e códigos AI10!`,
      });
      await loadOverview();
    } catch (err) {
      showToast({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao gerar lote.' });
    } finally {
      setCreatingBatch(false);
    }
  };

  const downloadBase64Zip = (batch: QrBatchResponse) => {
    const bin = atob(batch.zipBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = batch.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openPrintA4 = (batch: QrBatchResponse) => {
    const blob = new Blob([batch.a4Html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const summary = data?.summary;
  const openTickets = (data?.tickets || []).filter((t) => t.status !== 'resolved');

  return (
    <div data-testid="desktop-admin-console" className="min-w-0 space-y-5 pb-10">
      {/* Cabeçalho + 4 KPIs principais */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0F172A] text-white dark:bg-[#2563EB]">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-[#0F172A] dark:text-slate-100">
                Console Admin 360° — CompanyGen
              </h2>
              <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                Suporte Somente Leitura, Reconciliador Kiwify, Frota Desktop .exe e Lotes QR A4.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {summary?.marginAlert ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertTriangle className="size-3.5" /> Margem Negativa Detectada
              </span>
            ) : null}
            <ActionButton
              type="button"
              size={44}
              variant="secondary"
              data-testid="admin-refresh-btn"
              isLoading={loading}
              onClick={() => void loadOverview()}
              leftIcon={<RefreshCw className="size-4" />}
            >
              Atualizar
            </ActionButton>
          </div>
        </div>

        {/* 4 KPIs Estritos */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090D16]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <Users className="size-3.5 text-[#2563EB]" /> Lojas Cadastradas
            </div>
            <div data-testid="admin-kpi-users" className="cg-tabular mt-1 text-xl font-extrabold text-[#0F172A] dark:text-slate-100">
              {summary?.totalUsers ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090D16]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <Zap className="size-3.5 text-amber-500" /> Créditos Ativos
            </div>
            <div data-testid="admin-kpi-credits" className="cg-tabular mt-1 text-xl font-extrabold text-[#0F172A] dark:text-slate-100">
              {(summary?.totalCredits ?? 0).toLocaleString('pt-BR')} cr
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090D16]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <TrendingUp className="size-3.5 text-emerald-500" /> Margem Líquida
            </div>
            <div
              data-testid="admin-kpi-margin"
              className={`cg-tabular mt-1 text-xl font-extrabold ${(summary?.netMarginCents ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {formatBrl(summary?.netMarginCents ?? 0)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090D16]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <LifeBuoy className="size-3.5 text-rose-500" /> Tickets / Alertas
            </div>
            <div data-testid="admin-kpi-alerts" className="cg-tabular mt-1 text-xl font-extrabold text-[#0F172A] dark:text-slate-100">
              {openTickets.length} / {summary?.incidentsCount ?? 0}
            </div>
          </div>
        </div>

        {/* 4 Sub-abas Enxutas */}
        <div role="tablist" aria-label="Seções do Console Admin" className="flex flex-wrap gap-2 pt-1">
          {[
            { id: 'clients', label: 'Clientes & Suporte', testId: 'admin-subtab-clients' },
            { id: 'finance', label: 'Financeiro & Kiwify', testId: 'admin-subtab-finance' },
            { id: 'fleet', label: 'Frota .exe & IA', testId: 'admin-subtab-fleet' },
            { id: 'qr_batches', label: 'QR & Lotes', testId: 'admin-subtab-qr' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                data-testid={tab.testId}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminSectionTab)}
                className={`min-h-[40px] rounded-xl px-4 text-xs font-bold transition-all ${
                  active
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* SUB-ABA 1: CLIENTES & SUPORTE */}
      {activeTab === 'clients' ? (
        <div className="space-y-5">
          {/* Termômetro de Onboarding */}
          <section
            data-testid="admin-onboarding-thermometer"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#111726]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Termômetro de Onboarding
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="cg-tabular rounded-full bg-amber-50 px-2.5 py-0.5 font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  {data?.funnelSummary?.stalledOver24h ?? 0} travado(s) &gt;24h
                </span>
                <span className="cg-tabular rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Feedback: {data?.onboardingFeedbackSummary?.easy ?? 0} Fácil ·{' '}
                  {data?.onboardingFeedbackSummary?.stuck ?? 0} Travou
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { key: 'conta_criada', label: '1. Conta Criada', val: data?.funnelSummary?.conta_criada ?? 0 },
                { key: 'dados_loja', label: '2. Dados Loja', val: data?.funnelSummary?.dados_loja ?? 0 },
                { key: 'whatsapp_conectado', label: '3. WhatsApp', val: data?.funnelSummary?.whatsapp_conectado ?? 0 },
                { key: 'publicado', label: '4. Publicado', val: data?.funnelSummary?.publicado ?? 0 },
                { key: 'primeira_venda', label: '5. 1ª Venda', val: data?.funnelSummary?.primeira_venda ?? 0 },
              ].map((step) => (
                <div
                  key={step.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-center dark:border-slate-800 dark:bg-[#090D16]"
                >
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{step.label}</div>
                  <div className="cg-tabular mt-0.5 text-lg font-extrabold text-[#0F172A] dark:text-slate-100">
                    {step.val}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tabela estrita de 5 colunas + Filtros */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'stalled', label: 'Travou >24h' },
                  { id: 'low_balance', label: 'Saldo Baixo (<15)' },
                  { id: 'chargeback', label: 'Chargeback' },
                  { id: 'risk', label: '⚠ Risco' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    data-testid={`admin-filter-${chip.id}`}
                    onClick={() => setFilterChip(chip.id as ClientFilterChip)}
                    className={`min-h-[34px] rounded-full px-3 text-[11px] font-bold transition ${
                      filterChip === chip.id
                        ? 'bg-[#0F172A] text-white dark:bg-[#2563EB]'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#090D16] dark:text-slate-300'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[220px] flex-1 max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="admin-client-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar loja ou e-mail..."
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-xs text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table data-testid="admin-clients-table" className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2.5 pr-3">Loja / E-mail</th>
                    <th className="py-2.5 px-3">Etapa Setup</th>
                    <th className="py-2.5 px-3">Saldo / Margem</th>
                    <th className="py-2.5 px-3">Saúde / Tickets</th>
                    <th className="py-2.5 pl-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const st = FUNNEL_STAGE_BADGE[u.funnelStage || 'conta_criada'] || FUNNEL_STAGE_BADGE.conta_criada;
                    const tCount = ticketsByUser.get(u.id) || 0;
                    return (
                      <tr
                        key={u.id}
                        data-testid={`admin-user-row-${u.id}`}
                        className="hover:bg-slate-50/70 dark:hover:bg-[#090D16]/70"
                      >
                        <td className="py-3 pr-3">
                          <div className="font-bold text-[#0F172A] dark:text-slate-100">
                            {u.businessName || 'Sem nome'}
                          </div>
                          <div className="truncate max-w-[220px] text-[11px] text-slate-500 dark:text-slate-400">
                            {u.email || u.id}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>
                            {st.label}
                          </span>
                          {u.stalledOver24h ? (
                            <div className="mt-1 text-[10px] font-semibold text-amber-600">
                              Travou há {u.stalledHours}h
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-3">
                          <div className="cg-tabular font-extrabold text-[#0F172A] dark:text-slate-100">
                            {u.credits.toLocaleString('pt-BR')} cr
                          </div>
                          <div
                            className={`cg-tabular text-[11px] font-semibold ${(u.marginCents || 0) < 0 ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}`}
                          >
                            Margem {formatBrl(u.marginCents || 0)}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {u.banned ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                Banido
                              </span>
                            ) : u.reviewFlag === 'NEGATIVE_BALANCE_REVIEW' ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                Chargeback Lock
                              </span>
                            ) : u.riskAbuse ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                ⚠ Risco
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                Saudável
                              </span>
                            )}
                            {tCount > 0 ? (
                              <span className="cg-tabular rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                {tCount} ticket(s)
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <ActionButton
                              type="button"
                              size={44}
                              variant="softBlue"
                              data-testid={`admin-view-store-${u.id}`}
                              leftIcon={<ExternalLink className="size-3.5" />}
                              onClick={() => {
                                const target = `/?view=store&u=${encodeURIComponent(u.id)}&adminPreview=1`;
                                window.open(target, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Ver Loja
                            </ActionButton>
                            <ActionButton
                              type="button"
                              size={44}
                              variant="secondary"
                              data-testid={`admin-open-360-${u.id}`}
                              onClick={() => setDrawerUser(u)}
                            >
                              Abrir 360° →
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Nenhuma conta encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* Fila de Suporte & Convites Rápidos */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 dark:border-slate-800 dark:bg-[#111726]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-slate-100">
                <LifeBuoy className="size-4 text-rose-500" /> Chamados de Suporte ({openTickets.length} abertos)
              </h3>
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {(data?.tickets || []).slice(0, 12).map((tk) => (
                  <div
                    key={tk.id}
                    className="rounded-xl border border-slate-200 p-3 text-xs space-y-2 dark:border-slate-800 dark:bg-[#090D16]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#0F172A] dark:text-slate-100">{tk.subject}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          tk.status === 'resolved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {tk.status === 'resolved' ? 'Resolvido' : 'Aberto'}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{tk.description}</p>
                    {tk.status !== 'resolved' ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Nota de resolução..."
                          value={ticketReplyDrafts[tk.id] || ''}
                          onChange={(e) =>
                            setTicketReplyDrafts((prev) => ({ ...prev, [tk.id]: e.target.value }))
                          }
                          className="min-h-[34px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs dark:border-slate-700 dark:bg-[#111726] dark:text-slate-100"
                        />
                        <ActionButton
                          type="button"
                          size={44}
                          variant="primary"
                          onClick={() => void handleResolveTicket(tk)}
                        >
                          Resolver
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>
                ))}
                {(data?.tickets || []).length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum chamado registrado.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 dark:border-slate-800 dark:bg-[#111726]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-slate-100">
                <KeyRound className="size-4 text-[#2563EB]" /> Gerador de Códigos Especiais (AI10 · RC10)
              </h3>
              <form onSubmit={handleCreateInvite} className="grid grid-cols-2 gap-2.5">
                <select
                  value={inviteCodeType}
                  onChange={(e) =>
                    setInviteCodeType(e.target.value === 'user_recharge' ? 'user_recharge' : 'invite_only')
                  }
                  data-testid="admin-code-type-select"
                  aria-label="Tipo de código"
                  className="col-span-2 min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                >
                  <option value="invite_only">Convite — Apenas Nova Conta (AI10)</option>
                  <option value="user_recharge">Recarga — Usuário Já Cadastrado (RC10 · máx. 3/conta)</option>
                </select>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={inviteCredits}
                  onChange={(e) => setInviteCredits(e.target.value)}
                  placeholder="Créditos"
                  data-testid="admin-code-credits-input"
                  className="cg-tabular min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
                <input
                  type="number"
                  min="1"
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(e.target.value)}
                  placeholder="Usos máx."
                  data-testid="admin-code-maxuses-input"
                  className="cg-tabular min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
                <input
                  type="text"
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder={
                    inviteCodeType === 'user_recharge'
                      ? 'Observação da recarga (ex.: Campanha Instagram)'
                      : 'Observação do convite (ex.: Parceiro Brasília)'
                  }
                  data-testid="admin-code-note-input"
                  className="col-span-2 min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
                <ActionButton
                  type="submit"
                  size={44}
                  variant="primary"
                  isLoading={creatingInvite}
                  data-testid="admin-code-create-btn"
                  className="col-span-2"
                  leftIcon={<Plus className="size-4" />}
                >
                  {inviteCodeType === 'user_recharge'
                    ? 'Gerar & Copiar Código de Recarga (RC10)'
                    : 'Gerar & Copiar Link de Convite (AI10)'}
                </ActionButton>
              </form>
            </section>
          </div>

          {/* Tabela Completa de Códigos Gerados (Disponíveis, Usados, Convite vs Recarga) */}
          <section
            data-testid="admin-codes-table"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-slate-100">
                  <KeyRound className="size-4 text-[#2563EB]" /> Códigos Gerados ({filteredInvites.length} de{' '}
                  {(data?.invites || []).length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhe códigos disponíveis e utilizados em tempo real. Ao ser usado, a tag muda automaticamente.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  placeholder="Buscar código, e-mail ou nota..."
                  data-testid="admin-codes-search"
                  className="min-h-[38px] w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'active', label: '🟢 Disponíveis' },
                  { id: 'used', label: '⚪ Usados / Esgotados' },
                  { id: 'invite_only', label: 'Convite (AI10)' },
                  { id: 'user_recharge', label: 'Recarga (RC10)' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  data-testid={`admin-code-filter-${chip.id}`}
                  onClick={() => setCodeFilter(chip.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    codeFilter === chip.id
                      ? 'bg-[#2563EB] text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-300'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2.5 pr-3">Código</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Créditos</th>
                    <th className="py-2.5 px-3">Usos / Status</th>
                    <th className="py-2.5 px-3">Último Uso</th>
                    <th className="py-2.5 pl-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredInvites.slice(0, 60).map((row) => {
                    const rowKey = row.id || row.masked;
                    const displayCode = row.code || row.masked;
                    const isRecharge = row.codeType === 'user_recharge';
                    const isDepleted = row.status === 'depleted' || row.redemptionCount >= row.maxRedemptions;
                    const isRevoked = row.status === 'revoked';
                    const isExpired = row.status === 'expired';
                    const isPartial = !isDepleted && !isRevoked && !isExpired && row.redemptionCount > 0;
                    const statusLabel =
                      row.statusLabel ||
                      (isRevoked
                        ? 'Revogado'
                        : isExpired
                          ? 'Expirado'
                          : isDepleted
                            ? row.maxRedemptions === 1
                              ? 'Utilizado (1/1)'
                              : `Esgotado (${row.redemptionCount}/${row.maxRedemptions})`
                            : isPartial
                              ? `Usado (${row.redemptionCount}/${row.maxRedemptions})`
                              : 'Disponível');
                    const statusBadgeCls = isRevoked || isExpired
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                      : isDepleted
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : isPartial
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
                    return (
                      <tr key={rowKey} data-testid={`admin-code-row-${rowKey}`}>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#0F172A] dark:text-slate-100">
                              {displayCode}
                            </span>
                            {row.code ? (
                              <button
                                type="button"
                                onClick={() => handleCopyText(`code-${rowKey}`, row.code || '')}
                                title="Copiar código"
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-[#2563EB] dark:hover:bg-slate-800"
                              >
                                {copiedCode === `code-${rowKey}` ? (
                                  <Check className="size-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </button>
                            ) : null}
                          </div>
                          {row.note ? (
                            <p className="truncate max-w-[200px] text-[11px] text-slate-500">{row.note}</p>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isRecharge
                                ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                            }`}
                          >
                            {isRecharge ? 'Recarga (Usuário)' : 'Convite (Novo)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 cg-tabular font-bold text-[#0F172A] dark:text-slate-100">
                          {Number(row.credits || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cr
                          <span className="block text-[10px] font-normal text-slate-500">
                            ~{Math.floor((Number(row.credits || 0) + 1e-9) / 0.1).toLocaleString('pt-BR')} msgs
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            data-testid={`admin-code-status-${rowKey}`}
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadgeCls}`}
                          >
                            {statusLabel}
                          </span>
                          <span className="ml-1.5 cg-tabular text-[11px] text-slate-500">
                            {row.redemptionCount}/{row.maxRedemptions}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-400">
                          {row.lastRedeemedByEmail ? (
                            <div>
                              <span className="font-medium text-[#0F172A] dark:text-slate-200">
                                {row.lastRedeemedByEmail}
                              </span>
                              {row.lastRedeemedAt ? (
                                <span className="block text-[10px] text-slate-500">
                                  {new Date(row.lastRedeemedAt).toLocaleString('pt-BR', {
                                    timeZone: 'America/Sao_Paulo',
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {row.inviteUrl || row.redeemUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyText(`link-${rowKey}`, row.inviteUrl || row.redeemUrl || '')
                                }
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {copiedCode === `link-${rowKey}` ? 'Copiado!' : 'Copiar link'}
                              </button>
                            ) : null}
                            {!isRevoked && !isDepleted && !isExpired ? (
                              <button
                                type="button"
                                disabled={revokingCodeId === rowKey}
                                onClick={() => void handleRevokeInvite(row)}
                                data-testid={`admin-code-revoke-${rowKey}`}
                                className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                Revogar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvites.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                        Nenhum código encontrado para este filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {/* SUB-ABA 2: FINANCEIRO & KIWIFY */}
      {activeTab === 'finance' ? (
        <div className="space-y-5">
          {/* Unit Economics */}
          <section
            data-testid="admin-unit-economics"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]"
          >
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
              Economia Real por Crédito (Kiwify × GLM × RunPod)
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#090D16]">
                <div className="text-[11px] text-slate-500">Receita Bruta Kiwify</div>
                <div className="cg-tabular text-lg font-extrabold text-[#0F172A] dark:text-slate-100">
                  {formatBrl(summary?.grossRevenueCents)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#090D16]">
                <div className="text-[11px] text-slate-500">Taxa Kiwify Estimada</div>
                <div className="cg-tabular text-lg font-extrabold text-amber-600">
                  -{formatBrl(summary?.kiwifyFeeCents)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#090D16]">
                <div className="text-[11px] text-slate-500">Custo Estimado IA</div>
                <div className="cg-tabular text-lg font-extrabold text-slate-700 dark:text-slate-300">
                  -{formatBrl(summary?.aiCostCents)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#090D16]">
                <div className="text-[11px] text-slate-500">Margem Líquida</div>
                <div
                  className={`cg-tabular text-lg font-extrabold ${(summary?.netMarginCents ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                >
                  {formatBrl(summary?.netMarginCents)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold">Estornos automáticos 24h (failure_refund):</span>
              <span className="cg-tabular rounded-lg bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                GLM: {data?.engineHealth?.failureRefunds24h.glm ?? 0}
              </span>
              <span className="cg-tabular rounded-lg bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                RunPod: {data?.engineHealth?.failureRefunds24h.runpod ?? 0}
              </span>
              <span className="cg-tabular rounded-lg bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                SMTP: {data?.engineHealth?.failureRefunds24h.smtp ?? 0}
              </span>
            </div>
          </section>

          {/* Reconciliador Kiwify Event Bus & DLQ */}
          <section
            data-testid="admin-kiwify-dlq"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
                Reconciliador Kiwify &amp; DLQ Replay Idempotente
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  data-testid="admin-kiwify-search"
                  type="search"
                  value={kwQuery}
                  onChange={(e) => setKwQuery(e.target.value)}
                  placeholder="Buscar order_id ou e-mail..."
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
                <select
                  value={kwStatus}
                  onChange={(e) => setKwStatus(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                >
                  <option value="">Todos Status</option>
                  <option value="failed">Falha (DLQ)</option>
                  <option value="needs_review">Em Revisão</option>
                  <option value="processed">Processado</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredKiwifyEvents.map((ev) => {
                const evKey = `${ev.order_id}-${ev.webhook_event_type}`;
                return (
                  <div
                    key={evKey}
                    data-testid={`admin-kiwify-event-${ev.order_id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 dark:bg-[#090D16]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#0F172A] dark:text-slate-100">
                          {ev.order_id}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ev.webhook_event_type}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            ev.processing_status === 'processed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {ev.processing_status || 'processed'}
                        </span>
                        {ev.classification ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            {ev.classification}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">
                        {ev.customer_email || 'Sem e-mail'} · {ev.credits ?? 0} cr
                        {ev.error_message ? ` · Erro: ${ev.error_message}` : ''}
                      </p>
                    </div>
                    <ActionButton
                      type="button"
                      size={44}
                      variant="secondary"
                      data-testid={`admin-kiwify-replay-${ev.order_id}`}
                      isLoading={replayingId === evKey}
                      onClick={() => void handleReplayKiwify(ev)}
                      leftIcon={<RefreshCw className="size-3.5" />}
                    >
                      Replay Idempotente
                    </ActionButton>
                  </div>
                );
              })}
              {filteredKiwifyEvents.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">
                  Nenhum evento Kiwify registrado no filtro atual.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {/* SUB-ABA 3: FROTA .EXE & IA */}
      {activeTab === 'fleet' ? (
        <div className="space-y-5">
          {/* Canário DOM WhatsApp */}
          <div
            data-testid="admin-canary-dom-banner"
            className={`flex items-center gap-3 rounded-2xl border p-4 text-xs font-semibold ${
              data?.canaryDomAlert?.active
                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-950/35 dark:text-emerald-200'
            }`}
          >
            {data?.canaryDomAlert?.active ? (
              <ShieldAlert className="size-5 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            )}
            <div>
              <p className="font-bold">
                {data?.canaryDomAlert?.active
                  ? 'WHATSAPP_DOM_CANARY — Seletores Degradados Detectados'
                  : 'Seletores DOM WhatsApp Web — Frota Saudável'}
              </p>
              <p className="opacity-85">{data?.canaryDomAlert?.message}</p>
            </div>
          </div>

          {/* Saúde dos Motores */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111726]">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <Activity className="size-4 text-[#2563EB]" /> GLM-5.3 Arquitetura
              </div>
              <div className="cg-tabular mt-1 text-lg font-extrabold text-[#0F172A] dark:text-slate-100">
                {data?.engineHealth?.glm.avgLatencyMs ?? 840} ms
              </div>
              <p className="cg-tabular text-[11px] text-slate-500">
                Fallback 24h: {data?.engineHealth?.glm.fallbackRatePct ?? 0}%
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111726]">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <Zap className="size-4 text-violet-500" /> RunPod Imagens
              </div>
              <div className="mt-1 text-lg font-extrabold uppercase text-emerald-600">
                {data?.engineHealth?.runpod.status ?? 'healthy'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#111726]">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <Monitor className="size-4 text-emerald-500" /> Máquinas Desktop Ativas
              </div>
              <div className="cg-tabular mt-1 text-lg font-extrabold text-[#0F172A] dark:text-slate-100">
                {data?.desktopFleet?.length ?? 0}
              </div>
            </div>
          </section>

          {/* Política de Versão Mínima + Frota */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]">
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
              Política de Versão Mínima Desktop (.exe)
            </h3>
            <form onSubmit={handleSaveDesktopPolicy} className="grid gap-3 sm:grid-cols-4 items-end">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Versão Mínima</label>
                <input
                  data-testid="admin-desktop-min-version"
                  type="text"
                  value={minVersion}
                  onChange={(e) => setMinVersion(e.target.value)}
                  className="cg-tabular min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Última Release</label>
                <input
                  type="text"
                  value={latestVersion}
                  onChange={(e) => setLatestVersion(e.target.value)}
                  className="cg-tabular min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
              <label className="flex min-h-[38px] items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={forceUpdate}
                  onChange={(e) => setForceUpdate(e.target.checked)}
                />
                Forçar atualização
              </label>
              <ActionButton type="submit" size={44} variant="primary" isLoading={savingPolicy}>
                Salvar Política
              </ActionButton>
            </form>

            <div className="space-y-2 pt-2">
              {(data?.desktopFleet || []).map((m) => (
                <div
                  key={m.machineId}
                  data-testid={`admin-fleet-row-${m.machineId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 dark:bg-[#090D16]"
                >
                  <div>
                    <span className="font-bold text-[#0F172A] dark:text-slate-100">{m.machineId}</span>
                    <span className="ml-2 text-slate-500">
                      v{m.appVersion} · {m.osPlatform} · {m.webviewPhase}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.outdated ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                        Desatualizado
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        m.selectorHealth === 'degraded'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {m.selectorHealth}
                    </span>
                  </div>
                </div>
              ))}
              {(data?.desktopFleet || []).length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma máquina Desktop enviou heartbeat ainda.</p>
              ) : null}
            </div>
          </section>

          {/* Feature Flags Globais */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 dark:border-slate-800 dark:bg-[#111726]">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-slate-100">
              <Flag className="size-4 text-violet-600" /> Feature Flags Dinâmicas
            </h3>
            <div className="space-y-2">
              {Object.values(data?.featureFlags || {}).map((flag) => (
                <div
                  key={flag.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 dark:bg-[#090D16]"
                >
                  <div>
                    <p className="font-bold text-[#0F172A] dark:text-slate-100">{flag.key}</p>
                    <p className="text-[11px] text-slate-500">{flag.description}</p>
                  </div>
                  <select
                    value={flag.globalMode}
                    onChange={(e) =>
                      void handleUpdateFlagMode(flag, e.target.value as AdminFeatureFlagDef['globalMode'])
                    }
                    className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold dark:border-slate-700 dark:bg-[#111726] dark:text-slate-100"
                  >
                    <option value="off">Desligada (off)</option>
                    <option value="admin_only">Somente Admin</option>
                    <option value="beta_list">Lista Beta ({flag.betaUserIds.length})</option>
                    <option value="all">Liberada para Todos</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {/* SUB-ABA 4: QR & LOTES */}
      {activeTab === 'qr_batches' ? (
        <div className="space-y-5">
          {/* Gerador de Lotes Gráficos A4/ZIP */}
          <section
            data-testid="admin-qr-batch-generator"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]"
          >
            <div className="flex items-center gap-2">
              <Package className="size-5 text-[#2563EB]" />
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
                  Gerador de Lotes Gráficos A4 / ZIP
                </h3>
                <p className="text-xs text-slate-500">
                  Cria até 50 códigos AI10 + QR Codes rastreáveis em PNG + manifest.csv + cartela A4 para gráfica.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateQrBatch} className="grid gap-3 sm:grid-cols-4 items-end">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Nome do Lote</label>
                <input
                  data-testid="admin-qr-batch-name"
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Qtd (1–50)</label>
                <input
                  data-testid="admin-qr-batch-count"
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={(e) => setBatchCount(e.target.value)}
                  className="cg-tabular min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500">Créditos / QR</label>
                <input
                  data-testid="admin-qr-batch-credits"
                  type="number"
                  min={10}
                  value={batchCredits}
                  onChange={(e) => setBatchCredits(e.target.value)}
                  className="cg-tabular min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
                />
              </div>
              <ActionButton
                type="submit"
                size={44}
                variant="primary"
                data-testid="admin-qr-batch-submit"
                isLoading={creatingBatch}
                className="sm:col-span-4"
                leftIcon={<QrCode className="size-4" />}
              >
                Gerar Lote Gráfico A4/ZIP
              </ActionButton>
            </form>

            {lastBatch ? (
              <div
                data-testid="admin-qr-batch-result"
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3 dark:border-emerald-500/35 dark:bg-emerald-950/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      {lastBatch.batchName} — {lastBatch.count} códigos AI10 prontos ({lastBatch.creditsPerCode} cr cada)
                    </p>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300">
                      ZIP com manifest.csv + {lastBatch.count} PNGs + Cartela A4 imprimível
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      type="button"
                      size={44}
                      variant="primary"
                      data-testid="admin-qr-batch-download-zip"
                      onClick={() => downloadBase64Zip(lastBatch)}
                      leftIcon={<Download className="size-4" />}
                    >
                      Baixar ZIP
                    </ActionButton>
                    <ActionButton
                      type="button"
                      size={44}
                      variant="secondary"
                      data-testid="admin-qr-batch-print-a4"
                      onClick={() => openPrintA4(lastBatch)}
                      leftIcon={<Printer className="size-4" />}
                    >
                      Cartela A4
                    </ActionButton>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {lastBatch.codes.slice(0, 3).map((item) => (
                    <div
                      key={item.code}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-[#111726]"
                    >
                      <div className="shrink-0 rounded-lg bg-[#FFFFFF] p-3 border border-slate-200">
                        <img src={item.pngDataUrl} alt={item.code} className="size-14 object-contain" />
                      </div>
                      <div className="min-w-0 text-[11px]">
                        <div className="font-mono font-bold text-[#0F172A] dark:text-slate-100">
                          {item.code}
                        </div>
                        <div className="truncate text-slate-500">/q/{item.code.split('-')[2].toLowerCase()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* Criar QR Individual + Listagem com Quiet Zone #FFFFFF p-3 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#111726]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
                Campanhas QR Individuais (/q/:slug Auto-Healing)
              </h3>
              <input
                type="search"
                value={qrFilter}
                onChange={(e) => setQrFilter(e.target.value)}
                placeholder="Filtrar campanhas..."
                className="min-h-[36px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
              />
            </div>

            <form onSubmit={handleCreateQr} className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={qrName}
                onChange={(e) => setQrName(e.target.value)}
                placeholder="Nome da campanha"
                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
              />
              <input
                type="url"
                value={qrTargetUrl}
                onChange={(e) => setQrTargetUrl(e.target.value)}
                placeholder="https://companygen.store/..."
                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
              />
              <ActionButton type="submit" size={44} variant="secondary" isLoading={creatingQr}>
                Criar QR Rastreado
              </ActionButton>
            </form>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredQrs.slice(0, 12).map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-[#090D16]"
                >
                  {q.pngDataUrl ? (
                    <div className="shrink-0 rounded-lg bg-[#FFFFFF] p-3 border border-slate-200">
                      <img src={q.pngDataUrl} alt={q.name} className="size-14 object-contain" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1 text-xs">
                    <div className="truncate font-bold text-[#0F172A] dark:text-slate-100">{q.name}</div>
                    <div className="cg-tabular text-[11px] font-semibold text-[#2563EB]">
                      /q/{q.slug} · {q.scans_count} acesso(s)
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyText(q.id, q.shortUrl || `/q/${q.slug}`)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-[#2563EB] dark:text-slate-300"
                      >
                        {copiedCode === q.id ? <Check className="size-3" /> : <Copy className="size-3" />}
                        Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteQr(q.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline"
                      >
                        <Trash2 className="size-3" /> Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <AdminUser360Drawer
        open={Boolean(drawerUser)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDrawerUser(null);
        }}
        adminUserId={userId}
        targetUser={drawerUser}
        featureFlags={data?.featureFlags || {}}
        kiwifyEvents={data?.kiwifyEvents || []}
        onRefreshOverview={loadOverview}
        onEnterSupportMode={onEnterSupportMode}
      />
    </div>
  );
}
