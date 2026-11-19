import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const USER_ID = '66666666-6666-4666-8666-666666666666';

test.describe('Trailer Cena 4: Pedidos Kanban + Simulador Checkout Créditos (F07-T4)', () => {
  test('Captura F07-T4 simulador dual-slider checkout + extrato', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const user = {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'trailer@botanicalume.com.br',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'trailer-cena4-token',
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
            revision: 4,
            provider: 'supabase',
            profile: {
              schemaVersion: 1,
              business: { name: 'Botânica Lume', segment: 'Skincare', hours: '09h às 19h' },
              whatsapp: { connected: true, phoneE164: '5511999990000' },
              payment: { pixKey: 'pix@botanicalume.com.br', pixDiscountPercent: 5, acceptedMethods: ['pix'] },
              delivery: { pickupEnabled: true, deliveryEnabled: true },
              catalog: { products: [{ id: 'p1', sku: 'SER-01', name: 'Sérum Botânico C+E', priceCents: 15000, stock: 12, active: true }] },
              publishedStore: { published: true, publicSlug: 'botanica-lume' },
              onboarding: { completed: true, fichaCompleted: true, storeGenerated: true, productsAdded: true },
            },
          },
        });
      }
      if (p === '/api/credits/costs') {
        return route.fulfill({ json: { ok: true, costs: { glm_whatsapp: 2, generate_full_storefront: 30, generate_image_schnell: 5, edit_block: 3 } } });
      }
      if (p === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 218, history: [{ id: 'l1', delta: 100, balance_after: 218, operation_type: 'purchase_kiwify', created_at: new Date().toISOString() }] } });
      }
      if (p === '/api/checkout/plans') {
        return route.fulfill({
          json: {
            ok: true,
            plans: [
              { id: 'plan_10_brl', slug: 'micro-100', name: 'Inicial', credits: 100, priceCents: 990, priceFormatted: 'R$ 9,90', pricePerCredit: 'R$ 0,10', savingsPercent: null, popular: false, description: 'Ideal para validar sua primeira loja.' },
              { id: 'plan_100_brl', slug: 'pro-2500', name: 'Profissional', credits: 2500, priceCents: 10000, priceFormatted: 'R$ 100,00', pricePerCredit: 'R$ 0,04', savingsPercent: '60%', popular: true, description: 'Melhor custo-benefício.' },
            ],
          },
        });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/?route=checkout', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Profissional').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_trailer_cena4_pedidos_checkout_1440.png` });
    await context.close();
  });
});
