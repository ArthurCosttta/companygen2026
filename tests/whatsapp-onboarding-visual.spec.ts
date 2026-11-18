import { test, expect } from '@playwright/test';

const evidenceDir =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/swarm_e2e_screenshots_v2';
const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const storageKey = 'sb-irahjajgudbdkgggffum-auth-token';
const userId = '33333333-3333-4333-8333-333333333333';

test('aba WhatsApp exibe IA Nuvem, Mensagens Rápidas, Modo Teste Seguro e layout mobile sem overflow', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'onboarding@example.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: 'visual-onboarding-token',
    refresh_token: 'visual-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
  await context.addInitScript(
    ({ key, val }) => localStorage.setItem(key, JSON.stringify(val)),
    { key: storageKey, val: session },
  );
  await context.route(`${supabaseUrl}/auth/v1/**`, (route) => route.fulfill({ json: user }));

  let customTemplates: Array<{ id: string; trigger: string; reply: string }> = [
    { id: 'qr-1', trigger: 'horario', reply: 'Atendemos de segunda a sábado, 9h às 18h.' },
  ];

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/profile') {
      return route.fulfill({
        json: {
          revision: 1,
          provider: 'supabase',
          profile: {
            schemaVersion: 1,
            business: { name: 'Loja Alfa Oficial', segment: 'Moda' },
            whatsapp: { connected: true, phoneE164: '5561999990000', displayPhone: '+55 (61) 99999-0000' },
            catalog: { products: [] },
            publishedStore: { published: true, publicSlug: 'loja-alfa', sourceRevision: 1 },
          },
        },
      });
    }
    if (pathname === '/api/credits/balance') {
      return route.fulfill({ json: { ok: true, balance: 120 } });
    }
    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({
        json: {
          conectado: true,
          status: 'CONECTADO',
          numeroBot: '5561999990000',
          templates: [],
          conversas: [],
          documentos: [],
        },
      });
    }
    if (pathname === '/api/whatsapp/ai/brain') {
      return route.fulfill({
        json: {
          ok: true,
          cloudAiAvailable: true,
          creditBalance: 120,
          ollamaOnline: false,
          brain: {
            enabled: true,
            safeTestMode: false,
            safeTestPhone: '5561999990000',
            tone: 'Consultiva',
            systemPrompt: 'Atender clientes com cordialidade.',
          },
          escalations: [],
          customTemplates,
        },
      });
    }
    if (pathname === '/api/whatsapp/ai/templates') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() || {};
        const created = {
          id: `qr-${Date.now()}`,
          trigger: String(body.trigger || 'pix'),
          reply: String(body.reply || 'Aceitamos Pix com 5% de desconto.'),
        };
        customTemplates = [...customTemplates, created];
        return route.fulfill({ json: { ok: true, template: created, templates: customTemplates } });
      }
      return route.fulfill({ json: { ok: true, templates: customTemplates } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  const page = await context.newPage();
  await page.goto('/');

  const exploreBtn = page.getByRole('button', { name: /Explorar o painel primeiro/i });
  await exploreBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await exploreBtn.isVisible().catch(() => false)) {
    await exploreBtn.click();
    await exploreBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  await page.getByTestId('nav-tab-whatsapp').click();
  await expect(page.getByTestId('wpp-ai-connection-pill')).toContainText(/IA Nuvem Ativa/i, { timeout: 10000 });
  await expect(page.getByTestId('wpp-download-windows-exe-btn')).toBeVisible();

  // Abre gaveta de Mensagens Rápidas e cria gatilho 0 cr
  await page.getByTestId('wpp-drawer-quick-replies-btn').click();
  await expect(page.getByText('Mensagens Rápidas (0 cr por gatilho)')).toBeVisible();
  await page.getByTestId('wpp-safe-test-mode-toggle').waitFor({ state: 'visible' });

  await page.screenshot({ path: `${evidenceDir}/08_whatsapp_aba_ia_nuvem_desktop.png` });

  // Verifica viewport mobile 390px sem overflow horizontal
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await context.close();
});
