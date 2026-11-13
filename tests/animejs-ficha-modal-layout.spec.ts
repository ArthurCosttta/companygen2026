import { test, expect } from '@playwright/test';

const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const storageKey = 'sb-irahjajgudbdkgggffum-auth-token';
const userId = '44444444-4444-4444-4444-444444444444';

function createE1ProfileState() {
  return {
    revision: 1,
    provider: 'supabase' as const,
    profile: {
      schemaVersion: 1,
      onboarding: {
        whatsappConnected: false,
        whatsappConfirmed: false,
        fichaCompleted: false,
        storeGenerated: false,
      },
      business: {
        name: '',
        segment: 'Geral',
        address: '',
        hours: 'Seg a Sáb · 09h às 19h',
        cnpj: '',
      },
      whatsapp: {
        connected: false,
        phoneE164: '',
        displayPhone: '',
        attendantName: 'Atendente',
        welcomeMessage: 'Olá!',
      },
      payment: {
        pixKey: '',
        pixDiscountPercent: 0,
        acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
      },
      delivery: {
        pickupEnabled: true,
        deliveryEnabled: true,
        defaultFeeCents: 0,
        freeOverCents: 0,
        areas: [],
        pickupHours: 'Seg a Sáb · 09h às 18h',
      },
      brand: {
        primaryColor: '#2563EB',
        logoDataUrl: '',
      },
      catalog: { products: [] },
      publishedStore: {
        published: false,
        publicSlug: 'loja-teste',
        sourceRevision: 1,
      },
    },
  };
}

test('Anime.js v4 createLayout animates "Preencher Dados da Loja" card into ExpressFichaWizardModal cleanly', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'lojista@example.invalid',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: 'e2e-audit-token',
    refresh_token: 'e2e-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
  await context.route(supabaseUrl + '/auth/v1/**', (route) => route.fulfill({ json: user }));

  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/profile') {
      return route.fulfill({ json: createE1ProfileState() });
    }
    if (pathname === '/api/workspace') {
      return route.fulfill({
        json: { revision: 0, data: { campaigns: [] }, provider: 'supabase' },
      });
    }
    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({
        json: {
          conectado: false,
          status: 'Desconectado',
          numeroBot: '',
          qr: '',
          templates: [],
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });

  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  // Dismiss WelcomeModal to land directly on GuidedChecklistCard Step 1
  await expect(page.getByText('Boas-vindas ao CompanyGen!')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Explorar o painel primeiro' }).click();

  // Source card must hold data-layout-id="ficha-store-dialog" before click
  const fillStoreBtn = page.getByTestId('btn-preencher-dados-loja');
  await expect(fillStoreBtn).toBeVisible();
  const sourceCard = page.locator('[data-layout-id="ficha-store-dialog"]');
  await expect(sourceCard).toHaveCount(1);
  const cardBox = await sourceCard.boundingBox();
  expect(cardBox).not.toBeNull();

  // Trigger FLIP open via Anime.js createLayout
  await fillStoreBtn.click();

  const modalContent = page.getByRole('dialog');
  await expect(modalContent).toBeAttached();
  await expect(modalContent).toHaveAttribute('data-layout-id', 'ficha-store-dialog');
  await expect(page.getByText('Configuração Express da Loja')).toBeVisible();

  // Confirm active Anime.js AutoLayout FLIP state immediately after open
  const midSnapshot = await modalContent.evaluate((el) => {
    const style = el.style;
    const rect = el.getBoundingClientRect();
    return {
      isAnimated: document.body.classList.contains('is-animated'),
      inlineTranslate: style.translate,
      inlineWidth: style.width,
      inlinePosition: style.position,
      width: rect.width,
    };
  });
  expect(
    midSnapshot.isAnimated ||
      Boolean(midSnapshot.inlineTranslate) ||
      Boolean(midSnapshot.inlineWidth),
  ).toBe(true);

  // Screenshot mid-transition and settled state for visual confirmation
  await page.screenshot({
    path: 'C:\\Users\\arthur\\.gemini\\antigravity\\brain\\11169f73-159b-4308-91e9-7ace60c123e1\\animejs_modal_mid.png',
  });

  // Wait for 420ms Anime.js FLIP transition to settle and verify centered bounds on 1440x900
  await page.waitForTimeout(550);
  await expect
    .poll(() =>
      page.evaluate(() => document.body.classList.contains('is-animated')),
    )
    .toBe(false);

  await page.screenshot({
    path: 'C:\\Users\\arthur\\.gemini\\antigravity\\brain\\11169f73-159b-4308-91e9-7ace60c123e1\\animejs_modal_settled.png',
  });
  const box = await modalContent.boundingBox();
  expect(box).not.toBeNull();
  if (box && cardBox) {
    // Source card (~838px) differs from settled modal width (512px) and FLIP starts larger than settled
    expect(Math.abs(cardBox.width - box.width)).toBeGreaterThan(50);
    expect(midSnapshot.width).toBeGreaterThan(box.width + 5);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    expect(Math.abs(centerX - 720)).toBeLessThan(8);
    expect(Math.abs(centerY - 450)).toBeLessThan(8);
  }

  // Close modal via Escape -> confirms FLIP layout returns data-layout-id back to source card
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(450);
  await expect(fillStoreBtn).toBeVisible();
  await expect(page.locator('[data-layout-id="ficha-store-dialog"]')).toHaveCount(1);

  expect(pageErrors).toEqual([]);
  await context.close();
});
