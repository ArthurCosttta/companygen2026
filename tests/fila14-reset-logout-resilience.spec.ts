import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const USER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

function buildSession(token = 'fila14-qa-token') {
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'loja@farmacialume.com.br',
    app_metadata: {},
    user_metadata: { full_name: 'Lojista Lume' },
    created_at: new Date().toISOString(),
  };
  return {
    user,
    session: {
      access_token: token,
      refresh_token: 'fila14-qa-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    },
  };
}

test('QA14-01, QA14-03, QA14-05, QA14-08: Reset sem tela preta (com WhatsApp LIVE_READY), Sair da Conta no topo sem scroll, 401 refresh e Mobile 390 Dark', async ({ browser }) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const { user, session } = buildSession('expired-token-1');

  await context.addInitScript(
    ({ key, val }) => {
      if (!localStorage.getItem('__fila14_logged_out')) {
        localStorage.setItem(key, JSON.stringify(val));
      }
      localStorage.setItem('cg_theme', 'dark');
    },
    { key: STORAGE_KEY, val: session },
  );

  let currentProfile: Record<string, unknown> = {
    onboarding: { fichaCompleted: true, storeGenerated: true, welcomeDismissed: true },
    business: { name: 'Farmácia Lume', segment: 'Farmácia', businessModel: 'produtos', whatsapp: '+5561999990001' },
    whatsapp: { connected: true, phoneE164: '+5561999990001' },
    catalog: { products: [{ id: 'p1', sku: 'HID-01', name: 'Hidratante Facial 50g', priceCents: 6990, active: true }] },
    publishedStore: { published: true, publicSlug: 'farmacia-lume' },
  };
  let revision = 5;
  let refreshCalls = 0;
  let balanceCalls = 0;

  await context.route(`${SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: user }));
  await context.route(`${SUPABASE_URL}/auth/v1/logout**`, (route) => route.fulfill({ status: 204, body: '' }));
  await context.route(`${SUPABASE_URL}/auth/v1/token**`, (route) => {
    refreshCalls += 1;
    return route.fulfill({
      status: 200,
      json: {
        ...session,
        access_token: 'fresh-refreshed-token-2',
      },
    });
  });

  await context.route('**/api/admin/status', (route) => route.fulfill({ json: { ok: true, isAdmin: false } }));
  await context.route('**/api/credits/**', (route) =>
    route.fulfill({ json: { success: true, ok: true, balance: 55, costs: { glm_whatsapp: 0.1 }, history: [], used: 0, limit: 3, remaining: 3 } }),
  );
  await context.route('**/api/credits/balance', (route) => {
    balanceCalls += 1;
    const authHeader = route.request().headers()['authorization'] || '';
    // QA14-05: 1ª chamada retorna 401 simulando JWT expirado -> authenticatedFetch deve renovar e reenviar!
    if (balanceCalls === 1 && authHeader.includes('expired-token-1')) {
      return route.fulfill({ status: 401, json: { error: 'JWT expired' } });
    }
    return route.fulfill({ json: { ok: true, balance: 55, costs: { glm_whatsapp: 0.1 } } });
  });
  await context.route('**/api/profile', async (route) => {
    if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { profile?: Record<string, unknown> } | null;
      if (body?.profile) {
        currentProfile = body.profile;
        revision += 1;
      }
      return route.fulfill({ json: { revision, profile: currentProfile } });
    }
    return route.fulfill({ json: { revision, profile: currentProfile } });
  });
  await context.route('**/api/orders**', (route) => route.fulfill({ json: { orders: [] } }));
  await context.route('**/api/dashboard**', (route) =>
    route.fulfill({ json: { ok: true, visits_total: 12, orders_total: 0, revenue_cents: 0, recent_orders: [] } }),
  );
  await context.route('**/api/whatsapp/**', (route) =>
    route.fulfill({
      json: {
        ok: true,
        conectado: true,
        connected: true,
        phase: 'LIVE_READY',
        numeroBot: '5561999990001',
        messages: [],
        alerts: [],
        notifications: [],
        queueItems: [],
        templates: [],
      },
    }),
  );
  await context.route('**/api/desktop/release-policy', (route) =>
    route.fulfill({ json: { minSupportedVersion: '1.0.0', latestVersion: '1.1.0', forceUpdate: false } }),
  );

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // QA14-05: Verifica que 401 renovou token silenciosamente e saldo 55 cr carregou na Topbar
  await expect(page.getByTestId('topbar-open-checkout-btn')).toContainText(/55\s*cr/, { timeout: 15_000 });
  expect(refreshCalls).toBeGreaterThanOrEqual(1);

  // QA14-08 (1366x768): Abrir Ajustes e confirmar "Sair da Conta" visível SEM rolar
  await page.getByTestId('nav-tab-settings').click();
  const topLogoutBtn = page.getByTestId('settings-top-logout-btn');
  await expect(topLogoutBtn).toBeVisible({ timeout: 10_000 });
  const logoutBox = await topLogoutBtn.boundingBox();
  expect(logoutBox).toBeTruthy();
  expect(logoutBox!.y + logoutBox!.height).toBeLessThanOrEqual(768);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila14_settings_top_logout_1366.png`, fullPage: false });

  // QA14-01: Resetar dados da loja com WhatsApp LIVE_READY
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('settings-subtab-backup').click();
  await page.getByTestId('settings-open-reset-btn').click();
  await page.getByRole('button', { name: /Continuar para Confirmação/i }).click();
  await page.getByPlaceholder(/Digite RESETAR/i).fill('RESETAR');
  await page.getByRole('button', { name: /Confirmar Reset da Loja/i }).click();

  // Deve abrir imediatamente o Wizard / Configurador sem tela preta!
  await expect(page.getByTestId('express-ficha-wizard').or(page.getByRole('dialog'))).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila14_reset_wizard_1440.png`, fullPage: false });

  // Hard reload (F5) mantendo WhatsApp LIVE_READY e catálogo vazio -> NUNCA pode mostrar "Sua loja no ar" nem tela preta!
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('guided-next-step')).toHaveCount(0);
  // Fecha WelcomeModal se abrir automaticamente em ESTADO_1 e valida o checklist de configuração visível
  await page.keyboard.press('Escape');
  await expect(page.getByText(/Configure o nome, cores e WhatsApp|Configurar minha loja|Criar minha loja|Assistente/i).first()).toBeVisible({ timeout: 15_000 });

  // QA14-08 Mobile 390x844 Dark Mode: Verificar Ajustes + botão Sair da Conta visível sem rolagem
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('nav-tab-settings-mobile').click();
  await expect(page.getByTestId('settings-top-logout-btn')).toBeVisible({ timeout: 10_000 });
  const mobileLogoutBox = await page.getByTestId('settings-top-logout-btn').boundingBox();
  expect(mobileLogoutBox).toBeTruthy();
  expect(mobileLogoutBox!.y + mobileLogoutBox!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila14_mobile_390_dark.png`, fullPage: false });

  // QA14-03: Logout real limpa sessão e vai para tela de acesso (sem volta)
  await page.evaluate(() => localStorage.setItem('__fila14_logged_out', '1'));
  await page.getByTestId('settings-top-logout-btn').click();
  await page.getByRole('button', { name: /Sair agora|Sim, sair da conta|Sair da conta/i }).last().click();
  await expect(page.getByText(/Entrar|Criar conta|Código de acesso|Acesse sua conta/i).first()).toBeVisible({ timeout: 15_000 });

  expect(consoleErrors.filter((e) => !e.includes('401') && !e.includes('Failed to load resource'))).toEqual([]);
  await context.close();
});
