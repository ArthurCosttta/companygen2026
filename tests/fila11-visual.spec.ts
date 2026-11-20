import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const ADMIN_USER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

test('FILA 11 Visual Proof — Admin Códigos (tags), Resgate Usuário (máx. 3) e Planos 20/55/250', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

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
    access_token: 'fila11-qa-token',
    refresh_token: 'fila11-qa-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await context.addInitScript(
    ({ key, val }) => {
      localStorage.setItem(key, JSON.stringify(val));
      localStorage.setItem('cg_theme', 'dark');
    },
    { key: STORAGE_KEY, val: session },
  );

  await context.route(`${SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: user }));

  let balance = 495.9;
  let quotaUsed = 1;
  const invites = [
    {
      id: 'c1',
      code: 'RC10-7KQ2-M9XA',
      masked: 'RC10-****-M9XA',
      codeType: 'user_recharge',
      credits: 20,
      maxRedemptions: 1,
      redemptionCount: 0,
      status: 'active',
      statusLabel: 'Disponível',
      createdAt: new Date().toISOString(),
      note: 'Bônus Lançamento',
      lastRedeemedByEmail: null,
      lastRedeemedAt: null,
      inviteUrl: null,
      redeemUrl: 'https://companygen.store/?route=settings&redeem=RC10-7KQ2-M9XA',
    },
    {
      id: 'c2',
      code: 'RC10-USED-9911',
      masked: 'RC10-****-9911',
      codeType: 'user_recharge',
      credits: 55,
      maxRedemptions: 1,
      redemptionCount: 1,
      status: 'depleted',
      statusLabel: 'Utilizado (1/1)',
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      note: 'Campanha Parceiro',
      lastRedeemedByEmail: 'joao@farmacialume.com.br',
      lastRedeemedAt: new Date(Date.now() - 1200_000).toISOString(),
      inviteUrl: null,
      redeemUrl: null,
    },
    {
      id: 'c3',
      code: 'AI10-CONV-4422',
      masked: 'AI10-****-4422',
      codeType: 'invite_only',
      credits: 20,
      maxRedemptions: 1,
      redemptionCount: 0,
      status: 'active',
      statusLabel: 'Disponível',
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
      note: 'Convite Nova Loja',
      lastRedeemedByEmail: null,
      lastRedeemedAt: null,
      inviteUrl: 'https://companygen.store/?route=access&code=AI10-CONV-4422',
      redeemUrl: null,
    },
  ];

  await context.route('**/api/admin/me', (route) =>
    route.fulfill({ json: { ok: true, isAdmin: true, email: user.email } }),
  );
  await context.route('**/api/admin/status', (route) =>
    route.fulfill({ json: { ok: true, isAdmin: true, email: user.email } }),
  );
  await context.route('**/api/admin/overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        summary: {
          totalUsers: 2,
          totalCredits: 515.9,
          totalSpent: 12.4,
          bannedCount: 0,
          activeInvites: 2,
          openTicketsCount: 0,
          qrCount: 0,
          incidentsCount: 0,
          onboardingFeedbackCount: 0,
          grossRevenueCents: 10000,
          kiwifyFeeCents: 899,
          aiCostCents: 120,
          netMarginCents: 8981,
          marginAlert: false,
        },
        funnelSummary: { conta_criada: 0, dados_loja: 0, whatsapp_conectado: 0, publicado: 2, primeira_venda: 1, stalledOver24h: 0 },
        onboardingFeedbackSummary: { total: 0, easy: 0, medium: 0, stuck: 0 },
        desktopFleet: [],
        desktopPolicy: { minSupportedVersion: '1.0.0', latestVersion: '1.0.0', forceUpdate: false, downloadUrl: '', releaseNotes: '' },
        canaryDomAlert: false,
        engineHealth: { glm: { status: 'healthy', avgLatencyMs: 620, fallbackRatePct: 0 }, runpod: { status: 'healthy', queueDepth: 0 }, smtp: { status: 'healthy' }, failureRefunds24h: { glm: 0, runpod: 0, smtp: 0, other: 0, total: 0 } },
        unitEconomics: {},
        kiwifyEvents: [],
        featureFlags: {},
        tierLimits: {},
        auditLog: [],
        users: [
          {
            id: 'bbbbbbbb-2222-4222-8222-222222222222',
            email: 'joao@farmacialume.com.br',
            displayName: 'João Lume',
            businessName: 'Farmácia Lume',
            whatsappPhone: '+5561999990001',
            credits: 20,
            published: true,
            publicSlug: 'farmacia-lume',
            storeUrl: '/?view=store&u=bbbbbbbb-2222-4222-8222-222222222222',
            banned: false,
            banReason: '',
            isAdmin: false,
            lastSeenAt: new Date().toISOString(),
            funnelStage: 'publicado',
          },
        ],
        sites: [],
        tickets: [],
        qrCampaigns: [],
        onboardingFeedback: [],
        invites,
        incidents: [],
      },
    }),
  );
  await context.route('**/api/credits/balance', (route) =>
    route.fulfill({ json: { success: true, balance, costs: { glm_whatsapp: 0.1, generate_full_storefront: 4 }, history: [] } }),
  );
  await context.route('**/api/credits/costs', (route) =>
    route.fulfill({ json: { ok: true, costs: { glm_whatsapp: 0.1, edit_block: 0.5, generate_image_schnell: 1, generate_hero_dev: 2, create_subpage: 2, generate_full_storefront: 4 } } }),
  );
  await context.route('**/api/credits/redemption-quota', (route) =>
    route.fulfill({ json: { ok: true, used: quotaUsed, limit: 3, remaining: Math.max(0, 3 - quotaUsed) } }),
  );
  await context.route('**/api/credits/redeem-code', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.code === 'RC10-7KQ2-M9XA') {
      balance = Math.round((balance + 20) * 100) / 100;
      quotaUsed += 1;
      invites[0].redemptionCount = 1;
      invites[0].status = 'depleted';
      invites[0].statusLabel = 'Utilizado (1/1)';
      invites[0].lastRedeemedByEmail = user.email;
      invites[0].lastRedeemedAt = new Date().toISOString();
      return route.fulfill({
        json: {
          success: true,
          creditsAdded: 20,
          newBalance: balance,
          codeMasked: 'RC10-****-M9XA',
          redemptionsUsed: quotaUsed,
          redemptionsRemaining: Math.max(0, 3 - quotaUsed),
          limit: 3,
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: 'Código não encontrado.' } });
  });
  await context.route('**/api/checkout/plans', (route) =>
    route.fulfill({
      json: {
        success: true,
        plans: [
          { id: 'plan_micro_10', slug: 'plan_micro_10', name: 'Recarga Entrada', credits: 20, priceCents: 990, priceFormatted: 'R$ 9,90', pricePerCredit: 'R$ 0,50', savingsPercent: null, popular: false, description: '20 créditos: até 200 respostas da Sofia.' },
          { id: 'plan_growth_25', slug: 'plan_growth_25', name: 'Recarga Crescimento', credits: 55, priceCents: 2490, priceFormatted: 'R$ 24,90', pricePerCredit: 'R$ 0,45', savingsPercent: '10%', popular: false, description: '55 créditos: até 550 respostas da Sofia.' },
          { id: 'plan_100_brl', slug: 'plan_100_brl', name: 'Plano Profissional IA', credits: 250, priceCents: 10000, priceFormatted: 'R$ 100,00', pricePerCredit: 'R$ 0,40', savingsPercent: '20%', popular: true, description: '250 créditos: até 2.500 respostas da Sofia.' },
        ],
      },
    }),
  );
  await context.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        revision: 3,
        profile: {
          onboarding: { fichaCompleted: true, storeGenerated: true, welcomeDismissed: true },
          business: { name: 'Farmácia Lume', segment: 'Farmácia', businessModel: 'produtos', whatsapp: '+5561999990001' },
          whatsapp: { connected: true, phoneE164: '+5561999990001' },
          catalog: { products: [{ id: 'p1', sku: 'HID-01', name: 'Hidratante', priceCents: 6990, active: true }] },
          publishedStore: { published: true, publicSlug: 'farmacia-lume' },
        },
      },
    }),
  );
  await context.route('**/api/orders**', (route) => route.fulfill({ json: { orders: [] } }));
  await context.route('**/api/whatsapp/**', (route) => route.fulfill({ json: { ok: true, connected: true, phoneE164: '+5561999990001', phase: 'LIVE_READY', messages: [], alerts: [] } }));
  await context.route('**/api/desktop/release-policy', (route) => route.fulfill({ json: { minSupportedVersion: '1.0.0', latestVersion: '1.0.0', forceUpdate: false } }));

  const page = await context.newPage();
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 1. Verificar saldo decimal na Topbar (495,9 cr)
  await expect(page.getByTestId('topbar-open-checkout-btn')).toContainText('495,9 cr', { timeout: 15_000 });

  // 2. Ir para Admin e validar Tabela de Códigos + Tags
  await page.locator('[data-testid="sidebar-tab-admin"], button:has-text("Admin")').first().click();
  await expect(page.getByTestId('admin-codes-table')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('admin-code-status-c1')).toHaveText('Disponível');
  await expect(page.getByTestId('admin-code-status-c2')).toHaveText('Utilizado (1/1)');
  await page.getByTestId('admin-codes-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila11_admin_codes_table_1440.png`, fullPage: false });

  // 3. Ir para Ajustes -> testar resgate real de código RC10-7KQ2-M9XA
  await page.locator('[data-testid="sidebar-tab-settings"], button:has-text("Ajustes")').first().click();
  await expect(page.getByTestId('redeem-credit-code-card')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('redeem-code-input').fill('RC10-7KQ2-M9XA');
  await page.getByTestId('redeem-code-submit').click();
  await expect(page.getByTestId('redeem-code-success')).toContainText('+20 créditos');
  await expect(page.getByTestId('redeem-quota-badge')).toContainText('2 de 3');
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila11_user_redeem_settings_1440.png`, fullPage: false });

  // 4. Voltar para Admin e provar que c1 mudou tag para Utilizado (1/1)!
  await page.locator('[data-testid="sidebar-tab-admin"], button:has-text("Admin")').first().click();
  await expect(page.getByTestId('admin-code-status-c1')).toHaveText('Utilizado (1/1)', { timeout: 10_000 });

  // 5. Abrir Planos IA em mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('topbar-open-checkout-btn').click();
  await expect(page.getByText(/250\s*cr/).first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila11_plans_20_55_250_390.png`, fullPage: false });

  await context.close();
});
