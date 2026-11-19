import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const USER_ID = '66666666-6666-4666-8666-666666666666';

test.describe('Trailer Cena 3: WhatsApp Simulador & Sofia Motor Local (F07-T3)', () => {
  test('Captura F07-T3 simulador WhatsApp respondendo produto real', async ({ browser }) => {
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
      access_token: 'trailer-cena3-token',
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
      if (p === '/api/whatsapp/ai/brain') {
        return route.fulfill({
          json: {
            ok: true,
            cloudAiAvailable: true,
            creditBalance: 248,
            ollamaOnline: true,
            availableModels: ['qwen3:4b-instruct'],
            brain: { enabled: true, safeTestMode: false, autonomyMode: 'misto', systemPrompt: '', ragDocuments: [] },
            escalations: [],
            customTemplates: [],
          },
        });
      }
      if (p === '/api/whatsapp/ai/simulate-or-reply') {
        const reply = 'Olá! O Sérum Botânico C+E está disponível em estoque por R$ 150,00 (com 5% no Pix fica R$ 142,50). Quer reservar o seu?';
        return route.fulfill({
          json: {
            ok: true,
            intent: 'PRODUCT_QUESTION',
            replyText: reply,
            replyParts: [reply],
            modelUsed: 'qwen3:4b-instruct',
            readDelayMs: 1200,
            creditsCharged: 0,
            orderCreated: { orderRef: 'CG-801', totalCents: 14250 },
          },
        });
      }
      if (p === '/api/whatsapp/events' || p === '/api/whatsapp/ai/notifications') {
        return route.fulfill({ json: { ok: true, notifications: [], allNotifications: [], queueItems: [], pausedThreads: {}, pausedThreadItems: [], waitingHumanCount: 0 } });
      }
      if (p === '/api/credits/balance') return route.fulfill({ json: { ok: true, balance: 248, history: [] } });
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('nav-tab-whatsapp').click();
    await page.getByTestId('wpp-mode-simulator-btn').click();
    await page.getByTestId('wpp-sofia-test-input').fill('Oi, quanto custa 1 Sérum Botânico C+E no Pix?');
    await page.getByTestId('wpp-sofia-test-send').click();
    await expect(page.getByTestId('wpp-sofia-test-output')).toContainText('R$ 142,50', { timeout: 6000 });
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila07_trailer_cena3_whatsapp_sofia_1440.png` });
    await context.close();
  });
});
