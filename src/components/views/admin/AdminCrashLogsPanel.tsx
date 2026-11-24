import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCrash,
  Terminal,
  UserCheck,
} from 'lucide-react';
import { ActionButton, useToast } from '@/components/ui';
import { authenticatedFetch } from '@/services/supabase-client';

export interface CrashTelemetryBreadcrumb {
  at: string;
  kind: string;
  summary: string;
  endpoint?: string;
  statusCode?: number;
  durationMs?: number;
}

export interface CrashTelemetryLogRow {
  id: string;
  fingerprint: string;
  title: string;
  severity: 'critical' | 'error' | 'warning';
  source: string;
  category: string;
  message: string;
  stack?: string;
  componentStack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  userRole?: string;
  appContext?: Record<string, unknown>;
  breadcrumbs?: CrashTelemetryBreadcrumb[];
  correlatedServerErrors?: Array<{
    at: string;
    method: string;
    endpoint: string;
    statusCode: number;
    message: string;
  }>;
  suspectedFiles?: string[];
  autoDiagnosisPt?: string;
  extra?: Record<string, unknown>;
  affectedUserIds?: string[];
  affectedUsersCount: number;
  occurrences: number;
  status: 'open' | 'acknowledged' | 'resolved';
  firstSeenAt: string;
  lastSeenAt: string;
  aiContextPrompt?: string;
}

export interface CrashTelemetrySummary {
  totalGrouped: number;
  openCount: number;
  criticalOpen24h: number;
  normalUserOpenCount: number;
  totalOccurrences: number;
  affectedUsersCount: number;
  latestCrashAt: string | null;
  topRoutes: Array<{ route: string; count: number }>;
  topSuspectedFiles: Array<{ file: string; count: number }>;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60',
  error: 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60',
  warning: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const SOURCE_LABELS: Record<string, string> = {
  client_react: 'UI / React',
  client_window: 'JS / Asset Global',
  client_api: 'API no Navegador',
  server_api: 'Backend / API',
  server_runtime: 'Node Runtime',
  desktop_exe: 'Desktop .exe',
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function AdminCrashLogsPanel({
  userId,
  initialSummary,
  initialLogs,
  onInspectUser,
  onStatusChanged,
}: {
  userId: string;
  initialSummary?: CrashTelemetrySummary;
  initialLogs?: CrashTelemetryLogRow[];
  onInspectUser?: (targetUserId: string) => void;
  onStatusChanged?: () => void;
}) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<CrashTelemetryLogRow[]>(initialLogs || []);
  const [summary, setSummary] = useState<CrashTelemetrySummary | undefined>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>(initialLogs?.[0]?.id || '');
  const [copiedKey, setCopiedKey] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (severityFilter) qs.set('severity', severityFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (sourceFilter) qs.set('source', sourceFilter);
      if (query.trim()) qs.set('q', query.trim());
      qs.set('limit', '120');

      const res = await authenticatedFetch(
        `/api/admin/logs/crashes?${qs.toString()}`,
        { method: 'GET' },
        userId,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao carregar telemetria de crashs.');
      }
      const nextLogs = Array.isArray(data.logs) ? (data.logs as CrashTelemetryLogRow[]) : [];
      setLogs(nextLogs);
      if (data.summary) setSummary(data.summary as CrashTelemetrySummary);
      if (nextLogs.length > 0 && !nextLogs.some((l) => l.id === selectedId)) {
        setSelectedId(nextLogs[0].id);
      }
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao buscar logs de telemetria.',
      });
    } finally {
      setLoading(false);
    }
  }, [query, selectedId, severityFilter, showToast, sourceFilter, statusFilter, userId]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const selectedLog = useMemo(
    () => logs.find((l) => l.id === selectedId) || logs[0] || null,
    [logs, selectedId],
  );

  const handleCopyPrompt = async (log: CrashTelemetryLogRow) => {
    const text =
      log.aiContextPrompt ||
      `# Crash: ${log.title}\nMensagem: ${log.message}\nEndpoint: ${log.endpoint || '-'}\nArquivos: ${(log.suspectedFiles || []).join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(log.id);
      window.setTimeout(() => setCopiedKey(''), 2000);
      showToast({
        type: 'success',
        message: 'Contexto rico copiado! Cole diretamente para a IA analisar e corrigir.',
      });
    } catch {
      showToast({ type: 'error', message: 'Não foi possível copiar para a área de transferência.' });
    }
  };

  const handleDownloadJson = (log: CrashTelemetryLogRow) => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crash-${log.fingerprint}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleSetStatus = async (log: CrashTelemetryLogRow, nextStatus: 'open' | 'resolved') => {
    setUpdatingId(log.id);
    try {
      const res = await authenticatedFetch(
        '/api/admin/logs/crashes/status',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: log.id,
            fingerprint: log.fingerprint,
            status: nextStatus,
          }),
        },
        userId,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha ao atualizar status.');
      }
      showToast({
        type: 'success',
        message: nextStatus === 'resolved' ? 'Crash marcado como resolvido.' : 'Crash reaberto para análise.',
      });
      await loadLogs();
      onStatusChanged?.();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao atualizar crash.',
      });
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div data-testid="admin-crash-logs-panel" className="space-y-4">
      {/* KPIs de Telemetria de Crashs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111726]">
          <div className="text-[11px] font-semibold text-slate-500">Crashs Abertos</div>
          <div className="cg-tabular mt-1 text-xl font-extrabold text-rose-600">
            {summary?.openCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            {summary?.normalUserOpenCount ?? 0} em usuários normais
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111726]">
          <div className="text-[11px] font-semibold text-slate-500">Críticos (24h)</div>
          <div className="cg-tabular mt-1 text-xl font-extrabold text-[#0F172A] dark:text-slate-100">
            {summary?.criticalOpen24h ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            Último: {formatDateTime(summary?.latestCrashAt)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111726]">
          <div className="text-[11px] font-semibold text-slate-500">Ocorrências Totais</div>
          <div className="cg-tabular mt-1 text-xl font-extrabold text-[#0F172A] dark:text-slate-100">
            {summary?.totalOccurrences ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            {summary?.affectedUsersCount ?? 0} conta(s) impactada(s)
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111726]">
          <div className="text-[11px] font-semibold text-slate-500">Arquivo Mais Crítico</div>
          <div className="mt-1 truncate font-mono text-xs font-bold text-[#2563EB]">
            {summary?.topSuspectedFiles?.[0]?.file || 'Nenhum pendente'}
          </div>
          <div className="text-[11px] text-slate-500">
            {summary?.topRoutes?.[0]?.route ? `Rota: ${summary.topRoutes[0].route}` : 'Sistema estável'}
          </div>
        </div>
      </div>

      {/* Filtros & Busca */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#111726]">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              data-testid="admin-logs-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar erro, rota, arquivo provável ou nome da loja..."
              className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-xs text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'resolved')}
            data-testid="admin-logs-status-filter"
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
          >
            <option value="open">Abertos</option>
            <option value="resolved">Resolvidos</option>
            <option value="all">Todos Status</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
          >
            <option value="">Todas Severidades</option>
            <option value="critical">Críticos</option>
            <option value="error">Erros</option>
            <option value="warning">Avisos</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0F172A] dark:border-slate-700 dark:bg-[#090D16] dark:text-slate-100"
          >
            <option value="">Todas Origens</option>
            <option value="client_react">UI / React</option>
            <option value="client_api">API no Navegador</option>
            <option value="client_window">JS / Assets</option>
            <option value="server_api">Backend / API</option>
          </select>

          <ActionButton
            type="button"
            size={44}
            variant="secondary"
            isLoading={loading}
            onClick={() => void loadLogs()}
            leftIcon={<RefreshCw className="size-3.5" />}
          >
            Atualizar
          </ActionButton>
        </div>
      </section>

      {/* Split Master-Detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Lista Agrupada por Fingerprint */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs lg:col-span-5 dark:border-slate-800 dark:bg-[#111726]">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Crashs Agrupados ({logs.length})
            </span>
          </div>
          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {logs.map((item) => {
              const active = selectedLog?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`admin-crash-item-${item.fingerprint}`}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-[#2563EB] bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-[#090D16] dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-xs font-bold text-[#0F172A] dark:text-slate-100">
                      {item.title}
                    </span>
                    <span className="cg-tabular shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-extrabold text-white dark:bg-slate-700">
                      {item.occurrences}x
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${SEVERITY_BADGE[item.severity] || SEVERITY_BADGE.error}`}>
                      {item.severity.toUpperCase()}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {SOURCE_LABELS[item.source] || item.source}
                    </span>
                    {item.userRole !== 'admin' ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                        Usuário Normal
                      </span>
                    ) : null}
                    <span className="ml-auto text-slate-500">{formatDateTime(item.lastSeenAt)}</span>
                  </div>
                  {item.suspectedFiles?.[0] ? (
                    <div className="mt-1.5 truncate font-mono text-[10.5px] text-slate-600 dark:text-slate-400">
                      {item.suspectedFiles[0]}
                    </div>
                  ) : null}
                </button>
              );
            })}
            {logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <CheckCircle2 className="mx-auto mb-2 size-7 text-emerald-500" />
                Nenhum crash encontrado para o filtro selecionado.
              </div>
            ) : null}
          </div>
        </section>

        {/* Inspetor Contextual Completo */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7 dark:border-slate-800 dark:bg-[#111726]">
          {selectedLog ? (
            <div data-testid="admin-crash-inspector" className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${SEVERITY_BADGE[selectedLog.severity] || SEVERITY_BADGE.error}`}>
                      {selectedLog.severity.toUpperCase()}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-500">
                      #{selectedLog.fingerprint}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {selectedLog.occurrences}x · {selectedLog.affectedUsersCount} usuário(s)
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-[#0F172A] dark:text-slate-100">
                    {selectedLog.title}
                  </h3>
                  <p className="font-mono text-xs text-rose-700 dark:text-rose-300">
                    {selectedLog.message}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    type="button"
                    size={44}
                    variant="primary"
                    data-testid="admin-copy-ai-context-btn"
                    onClick={() => void handleCopyPrompt(selectedLog)}
                    leftIcon={copiedKey === selectedLog.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  >
                    {copiedKey === selectedLog.id ? 'Copiado p/ IA!' : 'Copiar Contexto p/ IA'}
                  </ActionButton>
                  <ActionButton
                    type="button"
                    size={44}
                    variant="secondary"
                    onClick={() => handleDownloadJson(selectedLog)}
                    leftIcon={<Download className="size-3.5" />}
                  >
                    JSON
                  </ActionButton>
                  {selectedLog.status !== 'resolved' ? (
                    <ActionButton
                      type="button"
                      size={44}
                      variant="secondary"
                      data-testid="admin-resolve-crash-btn"
                      isLoading={updatingId === selectedLog.id}
                      onClick={() => void handleSetStatus(selectedLog, 'resolved')}
                      leftIcon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
                    >
                      Resolver
                    </ActionButton>
                  ) : (
                    <ActionButton
                      type="button"
                      size={44}
                      variant="secondary"
                      isLoading={updatingId === selectedLog.id}
                      onClick={() => void handleSetStatus(selectedLog, 'open')}
                      leftIcon={<RotateCcw className="size-3.5" />}
                    >
                      Reabrir
                    </ActionButton>
                  )}
                </div>
              </div>

              {/* Diagnóstico Automático + Arquivos Prováveis */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-2 dark:border-blue-900/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200">
                  <Bug className="size-4" /> Diagnóstico Automático &amp; Arquivos Prováveis
                </div>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  {selectedLog.autoDiagnosisPt}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(selectedLog.suspectedFiles || []).map((file) => (
                    <span
                      key={file}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2 py-1 font-mono text-[11px] font-semibold text-[#0F172A] dark:border-blue-800 dark:bg-[#090D16] dark:text-slate-100"
                    >
                      <FileCode2 className="size-3 text-[#2563EB]" />
                      {file}
                    </span>
                  ))}
                </div>
              </div>

              {/* Contexto da Loja + Ambiente */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1 dark:border-slate-800 dark:bg-[#090D16]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0F172A] dark:text-slate-100">Estado da Loja / Rota</span>
                    {selectedLog.userId && selectedLog.userId !== 'public-visitor' && selectedLog.userId !== 'unauthenticated' && onInspectUser ? (
                      <button
                        type="button"
                        onClick={() => onInspectUser(String(selectedLog.userId))}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB] hover:underline"
                      >
                        <UserCheck className="size-3" /> Ver Usuário 360°
                      </button>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Loja: <strong>{String(selectedLog.appContext?.storeName || '-')}</strong> ({String(selectedLog.appContext?.segment || '-')})
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Rota: <code>{String(selectedLog.appContext?.route || selectedLog.endpoint || '/')}</code> · Aba:{' '}
                    <code>{String(selectedLog.appContext?.activeTab || '-')}</code> · Passo:{' '}
                    <code>{String(selectedLog.appContext?.onboardingStep || '-')}</code>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Catálogo: {String(selectedLog.appContext?.productsCount ?? '-')} item(ns) · Publicada: {String(selectedLog.appContext?.published ?? '-')}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1 dark:border-slate-800 dark:bg-[#090D16]">
                  <div className="font-bold text-[#0F172A] dark:text-slate-100">Hardware &amp; Sessão</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    RAM: {String(selectedLog.appContext?.deviceMemoryGB ?? '?')} GB · CPU: {String(selectedLog.appContext?.hardwareConcurrency ?? '?')} cores · LowSpec:{' '}
                    {String(selectedLog.appContext?.lowSpec ?? '-')}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    Viewport: {String(selectedLog.appContext?.viewport || '-')} · Tema: {String(selectedLog.appContext?.theme || 'light')}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-slate-500">
                    UID: {selectedLog.userId || 'public-visitor'}
                  </div>
                </div>
              </div>

              {/* Erros Correlacionados no Backend */}
              {Array.isArray(selectedLog.correlatedServerErrors) && selectedLog.correlatedServerErrors.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <ServerCrash className="size-4" /> Erros Correlacionados no Backend (±5 min)
                  </div>
                  {selectedLog.correlatedServerErrors.map((se, i) => (
                    <div key={`${se.at}-${i}`} className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                      [{formatDateTime(se.at)}] {se.method} {se.endpoint} -&gt; HTTP {se.statusCode}: {se.message}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Linha do Tempo Contextual (Breadcrumbs) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-slate-100">
                  <Terminal className="size-4 text-slate-500" />
                  Linha do Tempo Antes do Erro ({selectedLog.breadcrumbs?.length || 0} eventos)
                </div>
                <div className="max-h-[210px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] dark:border-slate-800 dark:bg-[#090D16]">
                  {(selectedLog.breadcrumbs || []).map((b, idx) => (
                    <div key={`${b.at}-${idx}`} className="flex flex-wrap items-baseline gap-2 border-b border-slate-200/70 pb-1 last:border-0 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400">{formatDateTime(b.at)}</span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        {b.kind}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{b.summary}</span>
                      {b.durationMs !== undefined ? (
                        <span className="ml-auto text-[10px] text-slate-400">{b.durationMs}ms</span>
                      ) : null}
                    </div>
                  ))}
                  {!selectedLog.breadcrumbs?.length ? (
                    <span className="text-slate-500">Evento gerado diretamente no servidor sem breadcrumbs de navegação UI.</span>
                  ) : null}
                </div>
              </div>

              {/* Stack Trace */}
              {selectedLog.stack || selectedLog.componentStack ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] dark:text-slate-100">
                    <AlertTriangle className="size-4 text-rose-500" /> Stack Trace Completo
                  </div>
                  <pre className="max-h-[220px] overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                    {selectedLog.stack || ''}
                    {selectedLog.componentStack ? `\n\n--- React Component Stack ---\n${selectedLog.componentStack}` : ''}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-slate-500">
              Selecione um crash na coluna ao lado para abrir o contexto completo, arquivos suspeitos e timeline.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
