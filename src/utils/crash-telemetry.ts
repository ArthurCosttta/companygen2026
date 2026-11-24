/**
 * Coletor leve de telemetria contextual de crashs e breadcrumbs no cliente.
 * Mantem buffer circular em memoria (25 eventos, zero polling) para enviar contexto rico
 * ao Painel Admin sem exigir inspecao manual de centenas de arquivos.
 */

export type TelemetryBreadcrumbKind = 'navigation' | 'action' | 'network' | 'error' | 'lifecycle';

export interface TelemetryBreadcrumb {
  at: string;
  kind: TelemetryBreadcrumbKind;
  summary: string;
  endpoint?: string;
  statusCode?: number;
  durationMs?: number;
}

export interface TelemetryAppContext {
  route?: string;
  activeTab?: string;
  onboardingStep?: string | number;
  storeName?: string;
  segment?: string;
  productsCount?: number;
  onboardingCompleted?: boolean;
  published?: boolean;
  whatsappConnected?: boolean;
  theme?: 'light' | 'dark';
  lowSpec?: boolean;
  deviceMemoryGB?: number;
  hardwareConcurrency?: number;
  viewport?: string;
  userAgentShort?: string;
}

export interface CrashReportInput {
  severity?: 'critical' | 'error' | 'warning';
  source?: 'client_react' | 'client_window' | 'client_api' | 'desktop_exe';
  category?: string;
  title?: string;
  message: string;
  stack?: string;
  componentStack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  extra?: Record<string, unknown>;
  force?: boolean;
}

const MAX_BREADCRUMBS = 25;
const DEDUPE_COOLDOWN_MS = 8000;
const LOCAL_SHOWCASE_KEY = 'cg_local_showcase_session_v1';

const breadcrumbRing: TelemetryBreadcrumb[] = [];
const recentFingerprints = new Map<string, number>();

let currentAppContext: TelemetryAppContext = {
  route: '/',
  theme: 'light',
};

let listenersInstalled = false;

function scrubClientText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g, '[REDACTED_JWT]');
}

function collectHardwareContext(): Partial<TelemetryAppContext> {
  if (typeof window === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  const html = document.documentElement;
  return {
    route: `${window.location.pathname}${window.location.search}`.slice(0, 120),
    theme: html.classList.contains('dark') ? 'dark' : 'light',
    lowSpec: html.classList.contains('cg-low-spec'),
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgentShort: navigator.userAgent.slice(0, 140),
  };
}

function resolveQuickAuthHeader(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawShowcase =
      window.sessionStorage.getItem(LOCAL_SHOWCASE_KEY) ||
      window.localStorage.getItem(LOCAL_SHOWCASE_KEY);
    if (rawShowcase) {
      const parsed = JSON.parse(rawShowcase) as { token?: string };
      if (parsed?.token) return `Bearer ${parsed.token}`;
    }
  } catch {}
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || '';
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as { access_token?: string };
        if (parsed?.access_token) return `Bearer ${parsed.access_token}`;
      }
    }
  } catch {}
  return null;
}

export function updateTelemetryAppContext(partial: Partial<TelemetryAppContext>): void {
  currentAppContext = {
    ...currentAppContext,
    ...partial,
  };
}

export function recordTelemetryBreadcrumb(
  kind: TelemetryBreadcrumbKind,
  summary: string,
  meta?: { endpoint?: string; statusCode?: number; durationMs?: number },
): void {
  const entry: TelemetryBreadcrumb = {
    at: new Date().toISOString(),
    kind,
    summary: scrubClientText(summary).slice(0, 220),
    ...(meta?.endpoint ? { endpoint: scrubClientText(meta.endpoint).slice(0, 140) } : {}),
    ...(typeof meta?.statusCode === 'number' ? { statusCode: meta.statusCode } : {}),
    ...(typeof meta?.durationMs === 'number' ? { durationMs: Math.round(meta.durationMs) } : {}),
  };
  breadcrumbRing.push(entry);
  if (breadcrumbRing.length > MAX_BREADCRUMBS) {
    breadcrumbRing.shift();
  }
}

export function getTelemetrySnapshot(): {
  appContext: TelemetryAppContext;
  breadcrumbs: TelemetryBreadcrumb[];
} {
  return {
    appContext: {
      ...collectHardwareContext(),
      ...currentAppContext,
    },
    breadcrumbs: [...breadcrumbRing],
  };
}

export async function captureAndReportCrash(input: CrashReportInput): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const endpoint = String(input.endpoint || '');
  if (endpoint.includes('/api/telemetry/crash')) return false;

  const cleanMsg = scrubClientText(input.message || 'Erro desconhecido').slice(0, 480);
  const fpKey = `${input.source || 'client_react'}|${input.category || 'ERR'}|${endpoint}|${cleanMsg.slice(0, 100)}`;
  const now = Date.now();
  const prevAt = recentFingerprints.get(fpKey) || 0;
  if (!input.force && now - prevAt < DEDUPE_COOLDOWN_MS) {
    return false;
  }
  recentFingerprints.set(fpKey, now);
  if (recentFingerprints.size > 60) {
    const firstKey = recentFingerprints.keys().next().value;
    if (firstKey) recentFingerprints.delete(firstKey);
  }

  recordTelemetryBreadcrumb('error', `${input.category || 'CRASH'}: ${cleanMsg}`, {
    endpoint: endpoint || undefined,
    statusCode: input.statusCode,
  });

  const snapshot = getTelemetrySnapshot();
  const payload = {
    severity: input.severity || 'error',
    source: input.source || 'client_react',
    category: input.category || 'RUNTIME_ERROR',
    title: scrubClientText(input.title || cleanMsg.slice(0, 88)),
    message: cleanMsg,
    stack: scrubClientText(input.stack || '').slice(0, 3200),
    componentStack: scrubClientText(input.componentStack || '').slice(0, 1800),
    endpoint: endpoint.slice(0, 140),
    method: input.method || '',
    statusCode: Number(input.statusCode || 0),
    appContext: snapshot.appContext,
    breadcrumbs: snapshot.breadcrumbs,
    extra: input.extra || {},
  };

  try {
    const authHeader = resolveQuickAuthHeader();
    const res = await fetch('/api/telemetry/crash', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function installGlobalCrashListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  recordTelemetryBreadcrumb('lifecycle', 'App iniciado');

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown as HTMLElement) && ('src' in target || 'href' in target)) {
        const assetUrl = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || '';
        if (assetUrl) {
          void captureAndReportCrash({
            severity: 'critical',
            source: 'client_window',
            category: 'ASSET_LOAD_ERROR',
            title: `Falha ao carregar recurso ${assetUrl.split('/').pop() || assetUrl}`,
            message: `Recurso bloqueado ou inexistente: ${assetUrl}`,
            endpoint: assetUrl,
          });
        }
        return;
      }

      const err = event.error instanceof Error ? event.error : null;
      void captureAndReportCrash({
        severity: 'critical',
        source: 'client_window',
        category: 'WINDOW_UNCAUGHT_ERROR',
        title: err?.name ? `${err.name}: ${err.message}` : event.message || 'Erro não capturado na janela',
        message: err?.message || event.message || 'Erro global de execução',
        stack: err?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
      });
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason || 'Promise rejeitada sem tratamento').slice(0, 300);
    if (/AbortError|aborted|The operation was aborted/i.test(msg)) return;
    void captureAndReportCrash({
      severity: 'error',
      source: 'client_window',
      category: 'UNHANDLED_REJECTION',
      title: `Promise rejeitada: ${msg.slice(0, 72)}`,
      message: msg,
      stack: reason instanceof Error ? reason.stack || '' : '',
    });
  });
}
