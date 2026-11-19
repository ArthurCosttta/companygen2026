import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const USER_ID = '66666666-6666-4666-8666-666666666666';

test.describe('Trailer Cena 1: Onboarding Express -> Vitrine Publicada (F07-T1)', () => {
  test('Captura F07-T1 onboarding completo e vitrine pronta', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const user = {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'trailer@botanicalume.com.br',
      app_metadata: {},
      user_metadata: { full_name: 'Mariana Lume' },
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'trailer-cena1-token',
      refresh_token: 'trailer-refresh',
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
    await context.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/api/profile') {
        return route.fulfill({
          json: {
            revision: 3,
            provider: 'supabase',
            profile: {
              schemaVersion: 1,
              business: { name: 'Botânica Lume', segment: 'Skincare Botânico', hours: '09h às 19h' },
              whatsapp: { connected: true, phoneE164: '5511999990000' },
              payment: { pixKey: 'pix@botanicalume.com.br', pixDiscountPercent: 5, acceptedMethods: ['pix'] },
              delivery: { pickupEnabled: true, deliveryEnabled: true },
              catalog: {
                products: [
                  { id: 'p1', sku: 'SER-01', name: 'Sérum Botânico C+E', priceCents: 15000, stock: 12, active: true },
                  { id: 'p2', sku: 'KIT-03', name: 'Kit Rotina Completa', priceCents: 28000, stock: 8, active: true },
                ],
              },
              publishedStore: { published: true, publicSlug: 'botanica-lume' },
              onboarding: { completed: true, fichaCompleted: true, storeGenerated: true, productsAdded: true },
            },
          },
        });
      }
      if (p === '/api/credits/balance') return route.fulfill({ json: { ok: true, balance: 250, history: [] } });
      if (p === '/api/whatsapp/events' || p === '/api/whatsapp/ai/notifications') {
        return route.fulfill({ json: { ok: true, notifications: [], allNotifications: [], queueItems: [], pausedThreads: {}, pausedThreadItems: [], waitingHumanCount: 0 } });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Botânica Lume').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_trailer_cena1_onboarding_1440.png` });
    await context.close();
  });
});
