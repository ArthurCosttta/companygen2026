import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { scrubObject, scrubPii } from './pii-scrubber.mjs';
import { serializeCreditOp } from './access-and-checkout.mjs';
import { BoundedTtlMap } from './middleware/bounded-map.mjs';
import { sendEmail } from './email-mailer.mjs';

const MAX_CRASH_RECORDS = 200;
const MAX_BREADCRUMBS = 25;
const CRASH_LOG_FILENAME = '_crash_telemetry_logs.json';
const ADMIN_ALERT_EMAIL = String(process.env.CG_ADMIN_EMAIL || 'arthurpolarbuy@gmail.com').trim();

// Recent backend errors per user (5 min TTL) for automatic client<->server correlation
const recentServerErrorsByUser = new BoundedTtlMap({ maxEntries: 400, defaultTtlMs: 5 * 60_000 });
// Rate limit notifications to Admin email (1 per fingerprint per 30 min)
const emailedFingerprintCooldown = new BoundedTtlMap({ maxEntries: 200, defaultTtlMs: 30 * 60_000 });

const MODULE_HINT_RULES = [
  {
    match: /reading ['"]default['"]|Loading chunk|dynamically imported module|Unable to preload CSS|Importing a module script/i,
    files: [
      'src/utils/chunk-recovery.ts',
      'src/app/App.tsx',
      'firebase.json',
    ],
    diagnosis: 'Falha de carregamento de chunk JS após deploy (cache de asset antigo ou exportação lazy ausente).',
  },
  {
    match: /\/api\/store-molde|analyze-brief|generate-full|patch-section|ensure-pack|molde/i,
    files: [
      'server/storefront-molde-fs.mjs',
      'server/glm-architect-prompt.mjs',
      'shared/formula-ir/composer-schema.mjs',
    ],
    diagnosis: 'Erro na arquitetura, briefing ou geração da vitrine pelo motor Formula V9 / LLM.',
  },
  {
    match: /\/api\/ai\/spreadsheet|transform-catalog|xlsx|planilha|NO_CATALOG_ITEMS_FOUND/i,
    files: [
      'server/ai-spreadsheet-engine.mjs',
      'shared/formula-ir/spreadsheet-intelligence.mjs',
      'src/utils/xlsx-io.ts',
    ],
    diagnosis: 'Erro ao interpretar, normalizar ou classificar nicho de planilha de catálogo.',
  },
  {
    match: /approvedAsset|Confirme ou revise|\/api\/profile|normalizeProfile/i,
    files: [
      'server/workspace.mjs',
      'server/sync-engine.mjs',
      'src/components/views/onboarding/OnboardingSynthesisStage.tsx',
    ],
    diagnosis: 'Falha de validação/persistência do perfil da loja ao salvar ou publicar.',
  },
  {
    match: /storefront-zip-builder|buildFaithfulStorefrontZip|JSZip|Baixar Loja|\.zip/i,
    files: [
      'src/components/views/storefront/storefront-zip-builder.ts',
      'src/components/views/storefront/EditorialStoreControlView.tsx',
    ],
    diagnosis: 'Falha ao empacotar arquivos estáticos/imagens no pacote .ZIP da vitrine.',
  },
  {
    match: /Onboarding|Ignition|Synthesis|analyze-brief/i,
    files: [
      'src/components/views/onboarding/OnboardingIgnitionView.tsx',
      'src/components/views/onboarding/OnboardingSynthesisStage.tsx',
      'src/components/views/onboarding/PreBuildPagesCartStep.tsx',
    ],
    diagnosis: 'Erro durante o fluxo guiado de criação de loja (Onboarding).',
  },
  {
    match: /\/api\/whatsapp|whatsapp|ai-sofia|webview|useWebviewWhatsappResponder/i,
    files: [
      'server/ai-sofia-local.mjs',
      'src/hooks/useWebviewWhatsappResponder.ts',
      'src/components/views/whatsapp/WhatsAppConnectionView.tsx',
      'shared/whatsapp-webview-script.mjs',
    ],
    diagnosis: 'Falha na automação, sessão ou resposta multimodal do WhatsApp.',
  },
  {
    match: /\/api\/orders|OrdersKanban|import-batch|ai-modify/i,
    files: [
      'src/components/views/orders/OrdersKanbanView.tsx',
      'src/components/views/orders/orders-spreadsheet-import.ts',
      'server/workspace.mjs',
    ],
    diagnosis: 'Erro na importação ou gerenciamento de pedidos / Kanban.',
  },
  {
    match: /FormulaTreeRenderer|AtomicSectionRenderers|ReferenceComponentsPack|CustomerStorefront/i,
    files: [
      'src/components/views/storefront/FormulaTreeRenderer.tsx',
      'src/components/views/storefront/AtomicSectionRenderers.tsx',
      'src/components/views/storefront/ReferenceComponentsPack.tsx',
    ],
    diagnosis: 'Erro de renderização na árvore visual da vitrine ou nos blocos interativos.',
  },
  {
    match: /\/api\/ai\/global|GlobalAiAssistant|global-agent/i,
    files: [
      'server/ai-global-agent.mjs',
      'src/components/ui/GlobalAiAssistantWidget.tsx',
    ],
    diagnosis: 'Erro na execução de comando da IA Global.',
  },
  {
    match: /\/api\/admin\/|AdminConsole/i,
    files: [
      'server/admin-console.mjs',
      'src/components/views/admin/AdminConsoleView.tsx',
    ],
    diagnosis: 'Erro em operação ou consulta administrativa.',
  },
];

function normalizeMessageForFingerprint(message = '') {
  return String(message || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
    .replace(/"[^"]{2,60}"/g, '"<STR>"')
    .replace(/\b\d{4,}\b/g, '<NUM>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function extractSourcePathsFromStack(stack = '', componentStack = '') {
  const combined = `${String(stack || '')}\n${String(componentStack || '')}`;
  const matches = combined.match(/\b(?:src|server|shared|desktop)\/[A-Za-z0-9_./-]+\.(?:tsx?|mjs|jsx?|css)/g) || [];
  return Array.from(new Set(matches)).slice(0, 8);
}

/**
 * Infere os arquivos prováveis do repositório e um diagnóstico inicial em PT-BR
 * para evitar análise manual de centenas de arquivos durante depuração.
 */
export function inferSuspectedFilesAndCause({
  category = '',
  message = '',
  stack = '',
  componentStack = '',
  endpoint = '',
  route = '',
  breadcrumbs = [],
} = {}) {
  const breadcrumbText = (Array.isArray(breadcrumbs) ? breadcrumbs : [])
    .slice(-10)
    .map((b) => `${b?.summary || ''} ${b?.endpoint || ''}`)
    .join(' ');
  const corpus = [category, endpoint, route, message, stack, componentStack, breadcrumbText].join('\n');

  const files = new Set(extractSourcePathsFromStack(stack, componentStack));
  const diagnoses = [];

  for (const rule of MODULE_HINT_RULES) {
    if (rule.match.test(corpus)) {
      for (const f of rule.files) files.add(f);
      diagnoses.push(rule.diagnosis);
    }
  }

  return {
    suspectedFiles: Array.from(files).slice(0, 8),
    autoDiagnosisPt:
      diagnoses[0] ||
      (endpoint
        ? `Falha ocorrida durante chamada a ${endpoint}. Verifique validação de payload, contrato de resposta e estado anterior nos breadcrumbs.`
        : 'Exceção de execução no cliente/servidor. Consulte o stack trace e a sequência de ações imediatamente anteriores.'),
  };
}

function normalizeBreadcrumb(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    at: String(raw.at || new Date().toISOString()).slice(0, 40),
    kind: String(raw.kind || 'action').slice(0, 24),
    summary: scrubPii(String(raw.summary || '')).slice(0, 220),
    ...(raw.endpoint ? { endpoint: String(raw.endpoint).slice(0, 140) } : {}),
    ...(Number.isFinite(Number(raw.statusCode)) ? { statusCode: Number(raw.statusCode) } : {}),
    ...(Number.isFinite(Number(raw.durationMs)) ? { durationMs: Math.round(Number(raw.durationMs)) } : {}),
  };
}

/**
 * Monta bloco Markdown estruturado pronto para colar em sessão de IA e depurar com 100% de contexto.
 */
export function buildAiContextPrompt(record) {
  const lines = [
    `# Relatório Contextual de Crash — ${record.title}`,
    `- **Fingerprint**: \`${record.fingerprint}\` | **Severidade**: \`${record.severity}\` | **Origem**: \`${record.source}\` | **Ocorrências**: ${record.occurrences} (${record.affectedUsersCount} usuário(s))`,
    `- **Primeiro / Último registro**: ${record.firstSeenAt} -> ${record.lastSeenAt}`,
    `- **Erro**: \`${record.message}\``,
    ...(record.endpoint ? [`- **Endpoint / Status HTTP**: \`${record.method || 'GET'} ${record.endpoint}\` -> \`${record.statusCode || 'erro'}\``] : []),
    `- **Diagnóstico Automático**: ${record.autoDiagnosisPt}`,
    `- **Arquivos Prováveis no Repositório**:`,
    ...(record.suspectedFiles?.length
      ? record.suspectedFiles.map((f) => `  - \`${f}\``)
      : ['  - (nenhum arquivo específico extraído do stack; checar breadcrumbs abaixo)']),
    '',
    `## Estado da Loja & Ambiente do Usuário`,
    `- **User ID**: \`${record.userId || 'public-visitor'}\` (${record.userRole || 'normal_user'})`,
    ...(record.appContext && Object.keys(record.appContext).length > 0
      ? [
          `- **Rota / Aba / Passo**: \`${record.appContext.route || '/'}\` · Aba: \`${record.appContext.activeTab || '-'}\` · Passo Onboarding: \`${record.appContext.onboardingStep || '-'}\``,
          `- **Loja**: \`${record.appContext.storeName || '-'}\` · Segmento: \`${record.appContext.segment || '-'}\` · Produtos: \`${record.appContext.productsCount ?? '-'}\` · Publicada: \`${record.appContext.published ?? '-'}\``,
          `- **Hardware / UI**: Theme \`${record.appContext.theme || 'light'}\` · LowSpec \`${record.appContext.lowSpec ?? '-'}\` · RAM \`${record.appContext.deviceMemoryGB ?? '?'}GB\` · CPU \`${record.appContext.hardwareConcurrency ?? '?'} cores\` · Viewport \`${record.appContext.viewport || '-'}\``,
        ]
      : []),
    ...(Array.isArray(record.correlatedServerErrors) && record.correlatedServerErrors.length > 0
      ? [
          '',
          `## Erros Correlacionados no Backend (±5min)`,
          ...record.correlatedServerErrors.map(
            (se) => `- [${se.at}] \`${se.method} ${se.endpoint}\` -> HTTP ${se.statusCode}: ${se.message}`,
          ),
        ]
      : []),
    '',
    `## Linha do Tempo Contextual (Últimas ações & chamadas API antes do crash)`,
    ...(Array.isArray(record.breadcrumbs) && record.breadcrumbs.length > 0
      ? record.breadcrumbs.map((b, i) => {
          const apiMeta = b.endpoint ? ` [${b.endpoint}${b.statusCode ? ` -> ${b.statusCode}` : ''}${b.durationMs ? ` (${b.durationMs}ms)` : ''}]` : '';
          return `${i + 1}. \`${b.at}\` (${b.kind})${apiMeta}: ${b.summary}`;
        })
      : ['1. (sem breadcrumbs registrados antes do evento)']),
    ...(record.stack
      ? ['', '## Stack Trace', '```', String(record.stack).slice(0, 1800), '```']
      : []),
    ...(record.componentStack
      ? ['', '## React Component Stack', '```', String(record.componentStack).slice(0, 1000), '```']
      : []),
  ];
  return lines.join('\n');
}

export function rememberServerErrorForCorrelation({
  userId = '',
  method = 'GET',
  endpoint = '',
  statusCode = 500,
  message = '',
  stack = '',
}) {
  const key = String(userId || '').trim();
  if (!key || key === 'public-visitor') return;
  const existing = recentServerErrorsByUser.get(key) || [];
  const next = [
    ...existing,
    {
      at: new Date().toISOString(),
      method: String(method || 'GET').slice(0, 10),
      endpoint: String(endpoint || '').slice(0, 140),
      statusCode: Number(statusCode || 500),
      message: scrubPii(String(message || '')).slice(0, 240),
      stack: scrubPii(String(stack || '')).slice(0, 800),
    },
  ].slice(-12);
  recentServerErrorsByUser.set(key, next);
}

async function notifyAdminCrashIfCritical({ record, root, readJsonFile, atomicWriteJson }) {
  if (!record || record.userRole === 'admin') return;
  if (record.severity !== 'critical') return;

  // Registra também em incidents do registry para visibilidade no Digest e Engine Health
  const registryPath = path.join(root, '_admin_registry.json');
  try {
    await serializeCreditOp(registryPath, async () => {
      const raw = (await readJsonFile(registryPath, null)) || {};
      const incidents = Array.isArray(raw.incidents) ? [...raw.incidents] : [];
      incidents.push({
        id: record.id || randomUUID(),
        type: `USER_CRASH:${record.category || 'RUNTIME'}`,
        endpoint: record.endpoint || record.appContext?.route || '',
        userId: record.userId || 'normal-user',
        detail: `${record.title} — ${record.message}`.slice(0, 240),
        createdAt: record.lastSeenAt,
      });
      raw.incidents = incidents.slice(-150);
      raw.updatedAt = new Date().toISOString();
      await atomicWriteJson(registryPath, raw);
    });
  } catch {
    // Telemetry notification must never break primary request
  }

  // E-mail proativo com throttling de 30 min por fingerprint (quando SMTP está configurado)
  if (ADMIN_ALERT_EMAIL && !emailedFingerprintCooldown.get(record.fingerprint)) {
    emailedFingerprintCooldown.set(record.fingerprint, true);
    const subject = `[CompanyGen CRASH ${record.severity.toUpperCase()}] ${record.title}`.slice(0, 110);
    const bodyText = record.aiContextPrompt || `${record.title}\n${record.message}`;
    const html = `<div style="font-family:sans-serif;max-width:680px;line-height:1.5">
      <h2 style="color:#B91C1C">Alerta Automático de Erro em Usuário Normal</h2>
      <p><strong>${record.title}</strong> (${record.occurrences}x · ${record.affectedUsersCount} usuário(s))</p>
      <pre style="background:#F8FAFC;border:1px solid #E2E8F0;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px">${bodyText.replace(/</g, '&lt;')}</pre>
    </div>`;
    void sendEmail({ to: ADMIN_ALERT_EMAIL, subject, html, text: bodyText }).catch(() => {});
  }
}

export async function recordCrashTelemetry({
  root,
  source = 'client_react',
  severity = 'error',
  category = 'RUNTIME_ERROR',
  title = '',
  message = '',
  stack = '',
  componentStack = '',
  endpoint = '',
  method = '',
  statusCode = 0,
  userId = '',
  userRole = 'normal_user',
  storeName = '',
  appContext = {},
  breadcrumbs = [],
  extra = {},
  readJsonFile,
  atomicWriteJson,
}) {
  if (!root || !readJsonFile || !atomicWriteJson) return null;

  const cleanMsg = scrubPii(String(message || title || 'Erro sem mensagem')).trim().slice(0, 500);
  const cleanEndpoint = String(endpoint || '').slice(0, 140);
  const cleanStack = scrubPii(String(stack || '')).slice(0, 3500);
  const cleanCompStack = scrubPii(String(componentStack || '')).slice(0, 2000);
  const cleanCategory = String(category || 'RUNTIME_ERROR').slice(0, 48);
  const cleanSource = ['client_react', 'client_window', 'client_api', 'server_api', 'server_runtime', 'desktop_exe'].includes(source)
    ? source
    : 'client_react';
  const cleanSeverity = ['critical', 'error', 'warning'].includes(severity) ? severity : 'error';

  const normalizedBreadcrumbs = (Array.isArray(breadcrumbs) ? breadcrumbs : [])
    .slice(-MAX_BREADCRUMBS)
    .map(normalizeBreadcrumb)
    .filter(Boolean);

  const safeContext = scrubObject({
    ...(appContext && typeof appContext === 'object' ? appContext : {}),
    ...(storeName && !appContext?.storeName ? { storeName } : {}),
  });

  const safeExtra = scrubObject(extra && typeof extra === 'object' ? extra : {});

  const { suspectedFiles, autoDiagnosisPt } = inferSuspectedFilesAndCause({
    category: cleanCategory,
    message: cleanMsg,
    stack: cleanStack,
    componentStack: cleanCompStack,
    endpoint: cleanEndpoint,
    route: safeContext.route || '',
    breadcrumbs: normalizedBreadcrumbs,
  });

  const fpBasis = `${cleanSource}|${cleanCategory}|${cleanEndpoint}|${normalizeMessageForFingerprint(cleanMsg)}`;
  const fingerprint = createHash('sha1').update(fpBasis).digest('hex').slice(0, 14);
  const now = new Date().toISOString();
  const cleanUserId = String(userId || 'public-visitor').slice(0, 64);

  const correlatedServerErrors =
    cleanUserId && cleanUserId !== 'public-visitor'
      ? (recentServerErrorsByUser.get(cleanUserId) || []).slice(-6)
      : [];

  if (cleanSource.startsWith('server_')) {
    rememberServerErrorForCorrelation({
      userId: cleanUserId,
      method,
      endpoint: cleanEndpoint,
      statusCode,
      message: cleanMsg,
      stack: cleanStack,
    });
  }

  const logPath = path.join(root, CRASH_LOG_FILENAME);
  let savedRecord = null;

  await serializeCreditOp(logPath, async () => {
    const raw = await readJsonFile(logPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    const existingIdx = list.findIndex((item) => item?.fingerprint === fingerprint);
    const derivedTitle = scrubPii(
      String(title || (cleanEndpoint ? `${cleanCategory} em ${cleanEndpoint}` : cleanMsg.slice(0, 88))),
    ).slice(0, 120);

    if (existingIdx >= 0) {
      const prev = list[existingIdx];
      const affected = new Set(Array.isArray(prev.affectedUserIds) ? prev.affectedUserIds : []);
      affected.add(cleanUserId);
      const affectedList = Array.from(affected).slice(-25);
      const nextStatus = prev.status === 'resolved' && userRole !== 'admin' ? 'open' : prev.status || 'open';

      savedRecord = {
        ...prev,
        title: derivedTitle,
        severity: prev.severity === 'critical' || cleanSeverity === 'critical' ? 'critical' : cleanSeverity,
        source: cleanSource,
        category: cleanCategory,
        message: cleanMsg,
        stack: cleanStack || prev.stack || '',
        componentStack: cleanCompStack || prev.componentStack || '',
        endpoint: cleanEndpoint || prev.endpoint || '',
        method: String(method || prev.method || '').slice(0, 10),
        statusCode: Number(statusCode || prev.statusCode || 0),
        userId: cleanUserId,
        userRole: userRole === 'admin' ? prev.userRole || 'admin' : 'normal_user',
        appContext: Object.keys(safeContext).length > 0 ? safeContext : prev.appContext || {},
        breadcrumbs: normalizedBreadcrumbs.length > 0 ? normalizedBreadcrumbs : prev.breadcrumbs || [],
        correlatedServerErrors:
          correlatedServerErrors.length > 0 ? correlatedServerErrors : prev.correlatedServerErrors || [],
        suspectedFiles: suspectedFiles.length > 0 ? suspectedFiles : prev.suspectedFiles || [],
        autoDiagnosisPt,
        extra: Object.keys(safeExtra).length > 0 ? safeExtra : prev.extra || {},
        affectedUserIds: affectedList,
        affectedUsersCount: affected.size,
        occurrences: Number(prev.occurrences || 1) + 1,
        status: nextStatus,
        lastSeenAt: now,
      };
      savedRecord.aiContextPrompt = buildAiContextPrompt(savedRecord);
      list[existingIdx] = savedRecord;
    } else {
      savedRecord = {
        id: randomUUID(),
        fingerprint,
        title: derivedTitle,
        severity: cleanSeverity,
        source: cleanSource,
        category: cleanCategory,
        message: cleanMsg,
        stack: cleanStack,
        componentStack: cleanCompStack,
        endpoint: cleanEndpoint,
        method: String(method || '').slice(0, 10),
        statusCode: Number(statusCode || 0),
        userId: cleanUserId,
        userRole: userRole === 'admin' ? 'admin' : 'normal_user',
        appContext: safeContext,
        breadcrumbs: normalizedBreadcrumbs,
        correlatedServerErrors,
        suspectedFiles,
        autoDiagnosisPt,
        extra: safeExtra,
        affectedUserIds: [cleanUserId],
        affectedUsersCount: 1,
        occurrences: 1,
        status: 'open',
        firstSeenAt: now,
        lastSeenAt: now,
      };
      savedRecord.aiContextPrompt = buildAiContextPrompt(savedRecord);
      list.push(savedRecord);
    }

    list.sort((a, b) => new Date(a?.lastSeenAt || 0).getTime() - new Date(b?.lastSeenAt || 0).getTime());
    await atomicWriteJson(logPath, list.slice(-MAX_CRASH_RECORDS));
  });

  if (savedRecord && userRole !== 'admin') {
    await notifyAdminCrashIfCritical({ record: savedRecord, root, readJsonFile, atomicWriteJson });
  }

  return savedRecord;
}

export async function queryCrashTelemetryLogs({
  root,
  severity = '',
  status = '',
  source = '',
  q = '',
  limit = 100,
  readJsonFile,
}) {
  if (!root || !readJsonFile) {
    return {
      summary: {
        totalGrouped: 0,
        openCount: 0,
        criticalOpen24h: 0,
        normalUserOpenCount: 0,
        totalOccurrences: 0,
        affectedUsersCount: 0,
        latestCrashAt: null,
        topRoutes: [],
        topSuspectedFiles: [],
      },
      logs: [],
    };
  }
  const raw = await readJsonFile(path.join(root, CRASH_LOG_FILENAME), []);
  const all = (Array.isArray(raw) ? raw : []).slice().sort(
    (a, b) => new Date(b?.lastSeenAt || 0).getTime() - new Date(a?.lastSeenAt || 0).getTime(),
  );

  const dayAgoMs = Date.now() - 24 * 60 * 60_000;
  const routeCounts = new Map();
  const fileCounts = new Map();
  const uniqueUsers = new Set();

  let openCount = 0;
  let criticalOpen24h = 0;
  let normalUserOpenCount = 0;
  let totalOccurrences = 0;

  for (const item of all) {
    if (!item) continue;
    totalOccurrences += Number(item.occurrences || 1);
    for (const uid of item.affectedUserIds || []) {
      if (uid && uid !== 'public-visitor') uniqueUsers.add(uid);
    }
    const isOpen = (item.status || 'open') !== 'resolved';
    if (isOpen) {
      openCount += 1;
      if (item.userRole !== 'admin') normalUserOpenCount += 1;
      if (item.severity === 'critical' && new Date(item.lastSeenAt || 0).getTime() >= dayAgoMs) {
        criticalOpen24h += 1;
      }
    }
    const routeKey = item.endpoint || item.appContext?.route || '';
    if (routeKey) {
      routeCounts.set(routeKey, (routeCounts.get(routeKey) || 0) + Number(item.occurrences || 1));
    }
    for (const file of item.suspectedFiles || []) {
      fileCounts.set(file, (fileCounts.get(file) || 0) + Number(item.occurrences || 1));
    }
  }

  const needle = String(q || '').trim().toLowerCase();
  const filtered = all.filter((item) => {
    if (!item) return false;
    if (severity && item.severity !== severity) return false;
    if (status && (item.status || 'open') !== status) return false;
    if (source && item.source !== source) return false;
    if (needle) {
      const hay = [
        item.title,
        item.message,
        item.endpoint,
        item.fingerprint,
        item.appContext?.storeName,
        item.appContext?.route,
        ...(item.suspectedFiles || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const topRoutes = Array.from(routeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, count]) => ({ route, count }));
  const topSuspectedFiles = Array.from(fileCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file, count]) => ({ file, count }));

  return {
    summary: {
      totalGrouped: all.length,
      openCount,
      criticalOpen24h,
      normalUserOpenCount,
      totalOccurrences,
      affectedUsersCount: uniqueUsers.size,
      latestCrashAt: all[0]?.lastSeenAt || null,
      topRoutes,
      topSuspectedFiles,
    },
    logs: filtered.slice(0, Math.max(1, Math.min(200, Number(limit) || 100))),
  };
}

export async function updateCrashTelemetryStatus({
  root,
  id = '',
  fingerprint = '',
  status = 'resolved',
  adminNote = '',
  actor = 'admin',
  readJsonFile,
  atomicWriteJson,
}) {
  if (!root || !readJsonFile || !atomicWriteJson) return null;
  const nextStatus = ['open', 'acknowledged', 'resolved'].includes(status) ? status : 'resolved';
  const logPath = path.join(root, CRASH_LOG_FILENAME);
  let updated = null;

  await serializeCreditOp(logPath, async () => {
    const raw = await readJsonFile(logPath, []);
    const list = Array.isArray(raw) ? [...raw] : [];
    const idx = list.findIndex(
      (item) => (id && item?.id === id) || (fingerprint && item?.fingerprint === fingerprint),
    );
    if (idx < 0) return;
    updated = {
      ...list[idx],
      status: nextStatus,
      adminNote: scrubPii(String(adminNote || list[idx].adminNote || '')).slice(0, 300),
      updatedBy: String(actor || 'admin').slice(0, 80),
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    await atomicWriteJson(logPath, list);
  });

  return updated;
}
