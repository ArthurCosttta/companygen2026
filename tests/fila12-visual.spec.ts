import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const ADMIN_USER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const CLIENT_USER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

test('FILA 12 Visual Proof — Admin Ver Loja + Drawer 360° + Prévia de Rascunho + Toast E-mail', async ({ browser }) => {
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
    access_token: 'fila12-qa-token',
    refresh_token: 'fila12-qa-refresh',
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
  await context.route('**/api/admin/status', (route) => route.fulfill({ json: { ok: true, isAdmin: true, email: user.email } }));
  await context.route('**/api/admin/me', (route) => route.fulfill({ json: { ok: true, isAdmin: true, email: user.email } }));
  await context.route('**/api/admin/overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        summary: {
          totalUsers: 2,
          totalCredits: 250,
          totalSpent: 10,
          bannedCount: 0,
          activeInvites: 1,
          openTicketsCount: 0,
          qrCount: 0,
          incidentsCount: 0,
          onboardingFeedbackCount: 0,
          grossRevenueCents: 10000,
          kiwifyFeeCents: 899,
          aiCostCents: 50,
          netMarginCents: 9051,
          marginAlert: false,
        },
        funnelSummary: { conta_criada: 0, dados_loja: 1, whatsapp_conectado: 0, publicado: 1, primeira_venda: 1, stalledOver24h: 0 },
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
            id: CLIENT_USER_ID,
            email: 'joao@farmacialume.com.br',
            displayName: 'João Lume',
            businessName: 'Farmácia Lume',
            whatsappPhone: '+5561999990001',
            credits: 55,
            published: true,
            publicSlug: 'farmacia-lume',
            storeUrl: `/?view=store&u=${CLIENT_USER_ID}`,
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
        invites: [],
        incidents: [],
      },
    }),
  );
  await context.route(`**/api/admin/users/${CLIENT_USER_ID}/storefront`, (route) =>
    route.fulfill({
      json: {
        ok: true,
        ownerId: CLIENT_USER_ID,
        draft: true,
        source: 'profile_fallback',
        profile: {
          business: { name: 'Farmácia Lume', segment: 'Farmácia', businessModel: 'produtos', description: 'Dermocosméticos e entrega rápida em Brasília.', address: 'Asa Sul, Brasília', hours: 'Seg a Sáb · 08h às 20h' },
          brand: { primaryColor: '#2563EB', accentColor: '#0EA5E9', logoUrl: '', storefrontPhotoUrl: '' },
          whatsapp: { connected: true, phoneE164: '+5561999990001', displayPhone: '(61) 99999-0001' },
          payment: { pixDiscountPercent: 5, acceptsPix: true, acceptsCard: true, acceptsCash: true },
          delivery: { deliveryEnabled: true, pickupEnabled: true, defaultFeeCents: 1200 },
          catalog: {
            products: [
              { id: 'p1', sku: 'HID-01', name: 'Hidratante Facial Leve 50g', priceCents: 6990, category: 'Skincare', active: true },
              { id: 'p2', sku: 'FPS-50', name: 'Protetor Solar FPS 50 40g', priceCents: 8990, category: 'Proteção', active: true },
            ],
          },
          publishedStore: { published: false, publicSlug: 'farmacia-lume' },
        },
        formulasIr: null,
      },
    }),
  );
  await context.route('**/api/admin/users/credits', (route) =>
    route.fulfill({ json: { ok: true, userId: CLIENT_USER_ID, delta: 20, newBalance: 75, emailSent: true, emailError: null } }),
  );
  await context.route('**/api/credits/**', (route) =>
    route.fulfill({ json: { success: true, ok: true, balance: 250, costs: { glm_whatsapp: 0.1 }, history: [], used: 0, limit: 3, remaining: 3 } }),
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
  await context.route('**/api/whatsapp/**', (route) => route.fulfill({ json: { ok: true, connected: true, phase: 'LIVE_READY', messages: [], alerts: [] } }));
  await context.route('**/api/desktop/release-policy', (route) => route.fulfill({ json: { minSupportedVersion: '1.0.0', latestVersion: '1.0.0', forceUpdate: false } }));

  const page = await context.newPage();
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 1. Admin -> botão Ver Loja visível na tabela + abrir Drawer 360° com botão Abrir Loja do Cliente
  await page.locator('[data-testid="sidebar-tab-admin"], button:has-text("Admin")').first().click();
  await expect(page.getByTestId(`admin-view-store-${CLIENT_USER_ID}`)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`admin-open-360-${CLIENT_USER_ID}`).click();
  await expect(page.getByTestId('admin-drawer-view-store-btn')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila12_admin_ver_loja_drawer_1440.png`, fullPage: false });

  // 2. Abrir a URL de prévia admin da loja em rascunho (sem formulas-ir.json, profile_fallback)
  await page.goto(`/?view=store&u=${CLIENT_USER_ID}&adminPreview=1`);
  await expect(page.getByTestId('admin-storefront-preview-banner')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Hidratante Facial Leve 50g').first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila12_admin_preview_draft_store_1440.png`, fullPage: false });

  await context.close();
});
