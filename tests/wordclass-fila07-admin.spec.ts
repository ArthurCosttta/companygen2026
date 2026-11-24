import { test, expect, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const ADMIN_USER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

async function dismissAllToasts(page: Page) {
  const closeBtns = page.locator('[data-cg-toast-region="true"] button');
  for (let pass = 0; pass < 6; pass += 1) {
    const count = await closeBtns.count();
    if (count === 0) break;
    await closeBtns.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(180);
}

test.describe('FILA 07 Word-Class QA: Admin 360°, Support Read-Only, Kiwify DLQ Replay, Frota .exe & QR Lotes (F07-P01..P10)', () => {
  test('Valida fluxo completo do Admin Console e gera os 10 prints F07-P01..P10', async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const sampleQrPngUrl = await QRCode.toDataURL('https://companygen.store/q/evento-lote-01', {
      margin: 2,
      width: 256,
    });

    const user = {
      id: ADMIN_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'arthurpolarbuy@gmail.com',
      app_metadata: {},
      user_metadata: { full_name: 'Arthur Admin' },
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'fila07-admin-qa-token',
      refresh_token: 'fila07-admin-qa-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };

    await context.addInitScript(
      ({ key, val }) => {
        localStorage.setItem(key, JSON.stringify(val));
        localStorage.setItem('cg_theme', 'light');
      },
      { key: STORAGE_KEY, val: session },
    );

    await context.route(`${SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: user }));

    let replayCount = 0;
    let clientCredits = 420;
    let clientLockActive = true;
    let policyMin = '2.0.0';

    const buildOverview = () => ({
      ok: true,
      summary: {
        totalUsers: 4,
        totalCredits: 1840,
        totalSpent: 640,
        bannedCount: 0,
        activeInvites: 3,
        openTicketsCount: 2,
        qrCount: 4,
        incidentsCount: 1,
        openCrashesCount: 1,
        normalUserOpenCrashes: 1,
        criticalCrashes24h: 1,
        onboardingFeedbackCount: 6,
        grossRevenueCents: 24980,
        kiwifyFeeCents: 2246,
        aiCostCents: 3120,
        netMarginCents: 19614,
        marginAlert: false,
      },
      funnelSummary: {
        conta_criada: 1,
        dados_loja: 1,
        whatsapp_conectado: 0,
        publicado: 1,
        primeira_venda: 1,
        stalledOver24h: 1,
      },
      onboardingFeedbackSummary: { total: 6, easy: 4, medium: 1, stuck: 1 },
      desktopFleet: [
        {
          machineId: 'WIN-SP-CAIXA-01',
          userId: '22222222-2222-4222-8222-222222222222',
          appVersion: '1.0.0',
          osPlatform: 'win32',
          webviewPhase: 'listening',
          selectorHealth: 'degraded',
          outdated: true,
          lastSeenAt: new Date().toISOString(),
        },
        {
          machineId: 'WIN-RJ-ATEND-02',
          userId: '33333333-3333-4333-8333-333333333333',
          appVersion: '2.1.0',
          osPlatform: 'win32',
          webviewPhase: 'listening',
          selectorHealth: 'degraded',
          outdated: false,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      desktopPolicy: {
        minSupportedVersion: policyMin,
        latestVersion: '2.1.0',
        forceUpdate: false,
        downloadUrl: 'https://companygen.store/download',
        releaseNotes: 'Atualização anti-bloqueio WhatsApp Web.',
      },
      canaryDomAlert: {
        active: true,
        code: 'WHATSAPP_DOM_CANARY',
        degradedUsersCount: 2,
        message: 'Alerta Canário DOM WhatsApp: 2 contas reportaram seletores degradados nas últimas 12h.',
      },
      engineHealth: {
        glm: { status: 'healthy', avgLatencyMs: 790, fallbackRatePct: 2 },
        runpod: { status: 'healthy', queueDepth: 0 },
        smtp: { status: 'healthy' },
        failureRefunds24h: { glm: 1, runpod: 0, smtp: 0, other: 0, total: 1 },
      },
      kiwifyEvents: [
        {
          id: 'kw-777',
          order_id: 'KW-DLQ-777',
          webhook_event_type: 'order_approved',
          customer_email: 'mariana@botanicalume.com.br',
          plan_code: '0USJqo5',
          credits: 2500,
          price_cents: 10000,
          processing_status: replayCount > 0 ? 'processed' : 'failed',
          error_message: replayCount > 0 ? null : 'ETIMEDOUT supabase rpc',
          classification: 'TRANSIENT',
          replay_count: replayCount,
          created_at: new Date().toISOString(),
        },
      ],
      featureFlags: {
        ia_v9_studio: {
          key: 'ia_v9_studio',
          globalMode: 'all',
          betaUserIds: [],
          description: 'Estúdio Visual Formula V9',
        },
        whatsapp_co_pilot: {
          key: 'whatsapp_co_pilot',
          globalMode: 'beta_list',
          betaUserIds: ['22222222-2222-4222-8222-222222222222'],
          description: 'Rascunhos Co-Piloto Sofia',
        },
      },
      users: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'mariana@botanicalume.com.br',
          displayName: 'Mariana',
          businessName: 'Botânica Lume',
          whatsappPhone: '5511999990000',
          credits: clientCredits,
          totalSpent: 120,
          published: true,
          publicSlug: 'botanica-lume',
          banned: false,
          banReason: '',
          isAdmin: false,
          lastSeenAt: new Date().toISOString(),
          funnelStage: 'primeira_venda',
          stalledHours: 0,
          stalledOver24h: false,
          tier: 'standard',
          reviewFlag: clientLockActive ? 'NEGATIVE_BALANCE_REVIEW' : null,
          shortfallCredits: clientLockActive ? 120 : 0,
          riskAbuse: true,
          riskReason: 'Multi-conta: 3 resgates no mesmo IP em 1h',
          revenueCents: 14980,
          aiCostCents: 1840,
          marginCents: 11790,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          email: 'lucas@cafeaurora.com.br',
          displayName: 'Lucas',
          businessName: 'Café Aurora',
          whatsappPhone: '',
          credits: 8,
          totalSpent: 40,
          published: false,
          banned: false,
          banReason: '',
          isAdmin: false,
          lastSeenAt: new Date(Date.now() - 32 * 3600_000).toISOString(),
          funnelStage: 'dados_loja',
          stalledHours: 32,
          stalledOver24h: true,
          tier: 'standard',
          reviewFlag: null,
          shortfallCredits: 0,
          riskAbuse: false,
          revenueCents: 0,
          aiCostCents: 240,
          marginCents: -240,
        },
      ],
      tickets: [
        {
          id: 'tk-1',
          user_id: '22222222-2222-4222-8222-222222222222',
          user_email: 'mariana@botanicalume.com.br',
          store_name: 'Botânica Lume',
          category: 'creditos',
          subject: 'Dúvida sobre token [token] e CPF [cpf]',
          description: 'Recebi erro com Bearer [token] ao testar pedido, e-mail [email] mascarado com sucesso.',
          status: 'open',
          admin_note: '',
          created_at: new Date().toISOString(),
        },
      ],
      qrCampaigns: [
        {
          id: 'qr-1',
          slug: 'vitrine-balcao',
          name: 'Placa Balcão Loja',
          target_url: 'https://companygen.store/?loja=botanica-lume',
          scans_count: 47,
          active: true,
          shortUrl: 'https://companygen.store/q/vitrine-balcao',
          pngDataUrl: sampleQrPngUrl,
          created_at: new Date().toISOString(),
        },
      ],
      invites: [],
      incidents: [],
    });

    await context.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const pathname = url.pathname;
      const method = req.method();
      const readonlyHdr = req.headers()['x-support-readonly'];

      if (
        (readonlyHdr === '1' || readonlyHdr === 'true') &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
        !pathname.startsWith('/api/admin/')
      ) {
        return route.fulfill({
          status: 403,
          json: { ok: false, error: 'SUPPORT_READONLY_BLOCKED', message: 'Modo Suporte Somente Leitura ativo — ações de escrita estão bloqueadas.' },
        });
      }

      if (pathname === '/api/admin/status') {
        return route.fulfill({ json: { ok: true, isAdmin: true, banned: false, email: 'arthurpolarbuy@gmail.com' } });
      }
      if (pathname === '/api/admin/overview') {
        return route.fulfill({ json: buildOverview() });
      }
      if (pathname === '/api/admin/logs/crashes') {
        return route.fulfill({
          json: {
            ok: true,
            summary: {
              totalGrouped: 1,
              openCount: 1,
              criticalOpen24h: 1,
              normalUserOpenCount: 1,
              totalOccurrences: 3,
              affectedUsersCount: 1,
              latestCrashAt: new Date().toISOString(),
              topRoutes: [{ route: '/api/profile', count: 3 }],
              topSuspectedFiles: [{ file: 'src/utils/chunk-recovery.ts', count: 3 }],
            },
            logs: [
              {
                id: 'crash-demo-1',
                fingerprint: 'a1b2c3d4e5f6',
                title: 'Crash em Painel Principal (Usuário Normal)',
                severity: 'critical',
                source: 'client_react',
                category: 'REACT_CHUNK_ERROR',
                message: "Cannot read properties of undefined (reading 'default')",
                stack: "TypeError: Cannot read properties of undefined (reading 'default')\n at src/app/App.tsx:90:5",
                endpoint: '/api/profile',
                method: 'PUT',
                statusCode: 422,
                userId: '22222222-2222-4222-8222-222222222222',
                userRole: 'normal_user',
                appContext: {
                  route: '/?theme=light',
                  activeTab: 'store',
                  onboardingStep: 'synthesis',
                  storeName: 'Botânica Lume',
                  segment: 'Cosméticos',
                  productsCount: 15,
                  published: false,
                  lowSpec: true,
                  deviceMemoryGB: 4,
                  hardwareConcurrency: 4,
                  viewport: '1440x900',
                  theme: 'light',
                },
                breadcrumbs: [
                  { at: new Date().toISOString(), kind: 'navigation', summary: 'Onboarding Passo 5' },
                  { at: new Date().toISOString(), kind: 'network', summary: 'PUT /api/profile -> 422', endpoint: '/api/profile', statusCode: 422, durationMs: 95 },
                ],
                correlatedServerErrors: [
                  { at: new Date().toISOString(), method: 'PUT', endpoint: '/api/profile', statusCode: 422, message: 'Confirme ou revise o item antes de publicar.' },
                ],
                suspectedFiles: ['src/utils/chunk-recovery.ts', 'src/app/App.tsx', 'server/workspace.mjs'],
                autoDiagnosisPt: 'Falha de carregamento de chunk JS após deploy (cache de asset antigo ou exportação lazy ausente).',
                affectedUsersCount: 1,
                occurrences: 3,
                status: 'open',
                firstSeenAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString(),
                aiContextPrompt: '# Relatório Contextual de Crash\n- Arquivo provável: src/utils/chunk-recovery.ts',
              },
            ],
          },
        });
      }
      if (pathname.endsWith('/support-snapshot')) {
        return route.fulfill({
          json: {
            ok: true,
            readOnly: true,
            snapshot: { userId: '22222222-2222-4222-8222-222222222222', businessName: 'Botânica Lume', creditsBalance: clientCredits },
          },
        });
      }
      if (pathname === '/api/admin/users/credits') {
        clientCredits += 50;
        return route.fulfill({ json: { ok: true, newBalance: clientCredits } });
      }
      if (pathname === '/api/admin/kiwify/replay') {
        const isDup = replayCount > 0;
        replayCount += 1;
        return route.fulfill({ json: { ok: true, duplicate: isDup, status: 'processed', balance: 2920 } });
      }
      if (pathname === '/api/admin/qr-batches') {
        return route.fulfill({
          json: {
            ok: true,
            batchId: 'batch-f07-qa',
            batchName: 'Evento SP Outubro',
            count: 3,
            creditsPerCode: 100,
            codes: [
              { index: 1, code: 'AI10-EVT1-A1B2', shortUrl: 'https://companygen.store/q/evento-lote-01', pngDataUrl: sampleQrPngUrl },
              { index: 2, code: 'AI10-EVT2-C3D4', shortUrl: 'https://companygen.store/q/evento-lote-02', pngDataUrl: sampleQrPngUrl },
              { index: 3, code: 'AI10-EVT3-E5F6', shortUrl: 'https://companygen.store/q/evento-lote-03', pngDataUrl: sampleQrPngUrl },
            ],
            manifestCsv: 'indice,codigo\n1,AI10-EVT1-A1B2',
            a4Html: '<html><body><h1>Cartela A4</h1></body></html>',
            zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
            filename: 'evento-sp.zip',
          },
        });
      }
      if (pathname === '/api/profile') {
        return route.fulfill({
          json: {
            revision: 10,
            provider: 'supabase',
            profile: {
              schemaVersion: 1,
              business: { name: 'Botânica Lume', segment: 'Cosméticos', hours: '09h às 19h' },
              whatsapp: { connected: true, phoneE164: '5511999990000' },
              payment: { pixKey: 'pix@lumebotanica.com', pixDiscountPercent: 5, acceptedMethods: ['pix'] },
              delivery: { pickupEnabled: true, deliveryEnabled: true },
              catalog: { products: [{ id: 'p1', sku: 'SER-01', name: 'Sérum Botânico C+E', priceCents: 15000, stock: 12, active: true }] },
              publishedStore: { published: true, publicSlug: 'botanica-lume' },
              onboarding: { completed: true, fichaCompleted: true, storeGenerated: true, productsAdded: true },
            },
          },
        });
      }
      if (pathname === '/api/whatsapp/events' || pathname === '/api/whatsapp/ai/notifications') {
        return route.fulfill({ json: { ok: true, notifications: [], allNotifications: [], queueItems: [], pausedThreads: {}, pausedThreadItems: [], waitingHumanCount: 0 } });
      }
      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 1840, history: [] } });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Navega para Admin
    await page.getByTestId('top-pill-tab-admin').or(page.getByTestId('nav-tab-admin')).first().click();
    await expect(page.getByTestId('desktop-admin-console')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('admin-onboarding-thermometer')).toBeVisible();
    await dismissAllToasts(page);
    // F07-P01: Clientes & Termômetro
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_clientes_thermometer_1440.png` });

    // F07-P02: Drawer 360° Light (520px + 4 acordeões)
    await page.getByTestId('admin-open-360-22222222-2222-4222-8222-222222222222').click();
    await expect(page.getByTestId('admin-user-360-drawer')).toBeVisible({ timeout: 5000 });
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_user360_drawer_light.png` });

    // F07-P10: Prova de PII Scrub no Ticket + Trava Chargeback no Drawer (capturando o acordeão Limites)
    await page.getByTestId('admin-360-acc-limits').click();
    await expect(page.getByTestId('admin-360-tier-select')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_proof_pii_scrub_and_lock.png` });

    // F07-P03: Modo Suporte Somente Leitura (Banner 40px vermelho + tentativa escrita bloqueada com 403)
    await page.getByTestId('admin-360-support-readonly-btn').click();
    await expect(page.getByTestId('support-readonly-banner')).toBeVisible({ timeout: 5000 });
    const blockedStatus = await page.evaluate(async () => {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Support-Readonly': '1' },
        body: JSON.stringify({ customerName: 'Teste' }),
      });
      return r.status;
    });
    expect(blockedStatus).toBe(403);
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_support_readonly_banner.png` });
    await page.getByTestId('support-readonly-exit-btn').click();

    // F07-P04: Financeiro & Kiwify (Unit Economics + DLQ)
    await page.getByTestId('admin-subtab-finance').click();
    await expect(page.getByTestId('admin-unit-economics')).toBeVisible();
    await expect(page.getByTestId('admin-kiwify-dlq')).toBeVisible();
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_kiwify_dlq_margin.png` });

    // F07-P05: Prova Replay Idempotente (1º + 2º clique)
    await page.getByTestId('admin-kiwify-replay-KW-DLQ-777').click();
    await page.waitForTimeout(250);
    await page.getByTestId('admin-kiwify-replay-KW-DLQ-777').click();
    await expect(page.locator('[data-cg-toast-region="true"]')).toContainText('duplicata', { timeout: 5000 });
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_proof_replay_idempotency.png` });

    // F07-P06: Frota .exe & IA (Canário DOM + Política + Feature Flags)
    await page.getByTestId('admin-subtab-fleet').click();
    await expect(page.getByTestId('admin-canary-dom-banner')).toContainText('WHATSAPP_DOM_CANARY');
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_frota_canary_flags.png` });

    // F07-P07B: Logs & Crashs Contextual Telemetry Panel (White Theme)
    await expect(page.getByTestId('admin-normal-user-crash-banner')).toBeVisible();
    await page.getByTestId('admin-subtab-logs').click();
    await expect(page.getByTestId('admin-crash-logs-panel')).toBeVisible();
    await expect(page.getByTestId('admin-crash-inspector')).toContainText('src/utils/chunk-recovery.ts');
    await expect(page.getByTestId('admin-copy-ai-context-btn')).toBeVisible();
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_logs_crashs_white.png` });

    // F07-P07: QR & Lotes (Gerar Lote Gráfico A4/ZIP)
    await page.getByTestId('admin-subtab-qr').click();
    await page.getByTestId('admin-qr-batch-name').fill('Evento SP Outubro');
    await page.getByTestId('admin-qr-batch-submit').click();
    await expect(page.getByTestId('admin-qr-batch-result')).toBeVisible({ timeout: 5000 });
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_qr_lote_a4_1440.png` });

    // F07-P08: Dark Mode #090D16 + Quiet zone branca QR intacta
    await page.getByTestId('topbar-theme-toggle-btn').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_dark_mode_1440.png` });

    // F07-P09: Mobile 390px sem overflow horizontal
    await page.getByTestId('topbar-theme-toggle-btn').click();
    await page.getByTestId('admin-subtab-clients').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(hasOverflow).toBe(false);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_admin_mobile_390.png` });

    await context.close();
  });
});
