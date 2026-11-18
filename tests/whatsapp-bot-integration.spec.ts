import { test, expect } from '@playwright/test';

const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const storageKey = 'sb-irahjajgudbdkgggffum-auth-token';
const userId = '55555555-5555-4555-8555-555555555555';

test.describe('WhatsApp integrado ao CompanyGen', () => {
  test('abre dentro do mesmo app, na mesma conta e mostra persistência e IA Nuvem ativa', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const user = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'wpp-integ@example.invalid',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'wpp-integ-token',
      refresh_token: 'wpp-integ-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };

    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: storageKey, value: session },
    );
    await context.route(`${supabaseUrl}/auth/v1/**`, (route) => route.fulfill({ json: user }));

    await context.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/profile') {
        return route.fulfill({
          json: {
            revision: 1,
            provider: 'supabase',
            profile: {
              schemaVersion: 1,
              business: { name: 'Loja Integração', segment: 'Geral' },
              whatsapp: { connected: false, attendantName: 'Sofia' },
              catalog: { products: [] },
              publishedStore: { published: false, publicSlug: 'loja-integ', sourceRevision: 1 },
            },
          },
        });
      }
      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 200 } });
      }
      if (pathname === '/api/whatsapp/api/dados') {
        return route.fulfill({
          json: {
            conectado: false,
            status: 'Desconectado',
            numeroBot: '',
            qr: '',
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
            creditBalance: 200,
            ollamaOnline: false,
            brain: {
              enabled: true,
              safeTestMode: false,
              safeTestPhone: '',
              tone: 'Consultiva',
              systemPrompt: 'Atenda com clareza.',
            },
            escalations: [],
            customTemplates: [],
          },
        });
      }
      if (pathname === '/api/whatsapp/ai/templates') {
        return route.fulfill({ json: { ok: true, templates: [] } });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/');

    // Fecha WelcomeModal caso abra na entrada inicial
    const exploreBtn = page.getByRole('button', { name: /Explorar o painel primeiro/i });
    await exploreBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await exploreBtn.isVisible().catch(() => false)) {
      await exploreBtn.click();
      await exploreBtn.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    const navWpp = page.getByTestId('nav-tab-whatsapp');
    await expect(navWpp).toBeVisible({ timeout: 10000 });
    await navWpp.click();

    await expect(page.getByTestId('wpp-ai-connection-pill')).toContainText(/IA Nuvem Ativa/i, { timeout: 10000 });
    await expect(page.getByTestId('real-whatsapp-fallback')).toBeVisible();
    await expect(page.getByTestId('wpp-download-windows-exe-btn')).toBeVisible();

    // Garante que não existem links residuais para painel separado em porta 3333
    await expect(page.locator('a[href*="localhost:3333"], a[href*="127.0.0.1:3333"]')).toHaveCount(0);

    await context.close();
  });
});
