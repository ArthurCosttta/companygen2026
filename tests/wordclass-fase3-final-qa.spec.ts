import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '88888888-8888-4888-8888-888888888888';

interface QaHarnessState {
  revision: number;
  putCount: number;
  failNextOrderWith422: boolean;
  profile: Record<string, any>;
}

function createQaState(): QaHarnessState {
  return {
    revision: 6,
    putCount: 0,
    failNextOrderWith422: false,
    profile: {
      schemaVersion: 1,
      onboarding: {
        whatsappConnected: true,
        whatsappConfirmed: true,
        fichaCompleted: true,
        storeGenerated: true,
        preferredTrack: 'store_first',
        completedFirstSimulatedOrder: true,
      },
      business: {
        name: 'Botânica Lume Skincare',
        segment: 'Beleza & Skincare',
        businessModel: 'produtos',
        description: 'Fórmulas botânicas puras para pele radiante.',
        experienceGoal: 'Rotina diária de hidratação e vitamina C',
        differentials: ['Vegano', 'Cruelty-free'],
        address: 'Rua Oscar Freire, 420',
        hours: 'Seg a Sáb · 09h às 19h',
        deliveryModes: ['pickup', 'local'],
      },
      whatsapp: {
        connected: true,
        phoneE164: '5511988887777',
        displayPhone: '+55 (11) 98888-7777',
      },
      payment: {
        pixKey: 'pix@botanicalume.com.br',
        pixDiscountPercent: 5,
        acceptedMethods: ['pix', 'credit_card'],
        paymentPolicy: 'pix_discount',
      },
      delivery: {
        pickupEnabled: true,
        deliveryEnabled: true,
        areas: ['Jardins'],
        defaultFeeCents: 1500,
        pickupHours: '09h às 18h',
      },
      shipping: {
        fixedFeeCents: 1500,
        freeShippingThresholdCents: 15000,
        pickupAvailable: true,
      },
      coupons: [
        {
          code: 'PRIMEIRA10',
          discountPercent: 10,
          active: true,
          expiresAt: null,
          usageCount: 2,
        },
      ],
      brand: {
        instagram: '@botanicalume',
        primaryColor: '#0867E8',
        accentColor: '#24A677',
        fontStyle: 'modern_sans',
        themePreset: 'minimal-luxury',
      },
      publishedStore: {
        published: true,
        publicSlug: 'botanica-lume',
        sourceRevision: 6,
      },
      catalog: {
        products: [
          {
            id: 'prod-serum',
            sku: 'SER-30',
            name: 'Sérum Facial Botânico Concentrado Vitamina C 20% + Ácido Hialurônico Vegano',
            category: 'Séruns',
            description: 'Antioxidante de alta absorção',
            priceCents: 11990,
            variation: '30ml',
            stock: 12,
            lowStockThreshold: 3,
            imageFocalPoint: { x: 50, y: 50 },
            active: true,
            approvedAsset: true,
            itemType: 'produto_fisico',
          },
          {
            id: 'prod-creme',
            sku: 'CREME-LAV',
            name: 'Creme Hidratante Lavanda Calmante',
            category: 'Hidratantes',
            description: 'Última unidade de lote especial',
            priceCents: 6990,
            variation: '200ml',
            stock: 1,
            lowStockThreshold: 3,
            imageFocalPoint: { x: 50, y: 50 },
            active: true,
            approvedAsset: true,
            itemType: 'produto_fisico',
          },
        ],
      },
    },
  };
}

async function setupFase3QaHarness(page: Page, state: QaHarnessState) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'qa.fase3@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Botânica Lume' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'fase3-qa-session-token',
    refresh_token: 'fase3-qa-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await page.addInitScript(
    ({ key, val }) => {
      localStorage.setItem(key, JSON.stringify(val));
      localStorage.setItem('cg_theme', 'light');
      localStorage.setItem('cg_sidebar_collapsed', 'false');
      document.documentElement?.classList.remove('dark');
    },
    { key: SUPABASE_STORAGE_KEY, val: session },
  );

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: user }),
  );

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;

    if (pathname === '/api/profile') {
      if (req.method() === 'GET') {
        return route.fulfill({
          json: {
            revision: state.revision,
            provider: 'local',
            profile: state.profile,
          },
        });
      }
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}') as {
          revision?: number;
          profile?: Record<string, any>;
        };
        if (body.revision !== state.revision) {
          return route.fulfill({
            status: 409,
            json: { ok: false, error: 'A ficha foi atualizada em outra aba.' },
          });
        }
        state.revision += 1;
        state.putCount += 1;
        state.profile = {
          ...(body.profile || state.profile),
          publishedStore: {
            ...(body.profile?.publishedStore || state.profile.publishedStore),
            sourceRevision: state.revision,
          },
        };
        return route.fulfill({
          json: {
            revision: state.revision,
            provider: 'local',
            profile: state.profile,
          },
        });
      }
    }

    if (pathname === '/api/store/public') {
      return route.fulfill({
        json: {
          revision: state.revision,
          ir: {
            ...state.profile,
            products: state.profile.catalog?.products || [],
            paymentPublic: {
              pixDiscountPercent: state.profile.payment?.pixDiscountPercent || 0,
              acceptedMethods: state.profile.payment?.acceptedMethods || ['pix', 'credit_card'],
            },
          },
        },
      });
    }

    if (pathname === '/api/store/qr-code') {
      const targetUrl = 'https://botanica-lume.companygen.store/?view=store';
      const pngDataUrl = await QRCode.toDataURL(targetUrl, { margin: 2, width: 512 });
      return route.fulfill({
        json: { ok: true, target: 'store', targetUrl, pngDataUrl },
      });
    }

    if (pathname === '/api/orders') {
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}') as Record<string, any>;
        if (state.failNextOrderWith422) {
          state.failNextOrderWith422 = false;
          return route.fulfill({
            status: 422,
            json: {
              ok: false,
              error: 'Estoque insuficiente para Creme Hidratante Lavanda Calmante (disponível: 1).',
            },
          });
        }

        const products = state.profile.catalog?.products || [];
        for (const ordered of body.items || []) {
          const skuUpper = String(ordered.sku || '').toUpperCase();
          const match = products.find((p: any) => String(p.sku || '').toUpperCase() === skuUpper);
          if (match) {
            match.stock = Math.max(0, Number(match.stock || 0) - Number(ordered.qty || 1));
            if (match.stock === 0) {
              match.active = false;
              match.autoPausedOutOfStock = true;
            }
          }
        }

        const order = {
          id: `ord-qa-${Date.now()}`,
          order_ref: 'CG-902',
          customer_jid: '',
          customer_name: body.customerName || 'Cliente Vitrine',
          items: body.items || [],
          subtotal_cents: 6990,
          shipping_cents: 1500,
          discount_cents: 0,
          total_cents: 8140,
          payment_method: body.paymentMethod || 'pix',
          delivery_address: body.deliveryAddress || {},
          status: 'aguardando_dados',
          isSimulation: Boolean(body.isSimulation),
          source_revision: state.revision,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return route.fulfill({ status: 201, json: { order, unmatchedItems: [] } });
      }
      return route.fulfill({ json: { orders: [] } });
    }

    if (pathname === '/api/dashboard') {
      return route.fulfill({
        json: {
          dashboard: {
            sourceRevision: state.revision,
            businessName: state.profile.business.name,
            whatsappConnected: true,
            displayPhone: '+55 11 98888-7777',
            visitsTotal: 25,
            visitsByDay: {},
            ordersCount: 2,
            salesCents: 18980,
            messagesCount: 8,
            catalogCount: state.profile.catalog.products.filter((p: any) => p.active !== false).length,
            stockUnits: 13,
            recentOrders: [],
          },
        },
      });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({ json: { conectado: true, skus: [], templates: [] } });
    }
    if (pathname === '/api/access/me') {
      return route.fulfill({ json: { ok: true, credits: 120, isAdmin: false } });
    }

    return route.fulfill({ json: { ok: true } });
  });
}

async function dismissAllToasts(page: Page) {
  const dismissBtns = page.locator('[data-cg-toast-region="true"] [aria-label="Fechar notificação"]');
  while ((await dismissBtns.count()) > 0) {
    await dismissBtns.first().click();
  }
}

test.describe('FASE 3 FINAL TEST — QA Adversário contra BUG-F03-01..12 & QA01..04', () => {
  test('BUG-F03-04, BUG-F03-05, BUG-F03-08 & P6 Pós-F5: Inline Guards, Esc sem Blur-Commit, Edição Rápida Multi-Linha & F5', async ({
    page,
  }) => {
    const state = createQaState();
    await setupFase3QaHarness(page, state);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?tab=store');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toBeVisible({ timeout: 15000 });

    // 1. Guard: negativo e vírgulas múltiplas devem ser rejeitados mantendo R$ 119,90
    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    await page.getByTestId('inline-price-input-prod-serum').fill('-50');
    await page.getByTestId('inline-price-input-prod-serum').press('Enter');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('119,90');

    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    await page.getByTestId('inline-price-input-prod-serum').fill('12,34,56');
    await page.getByTestId('inline-price-input-prod-serum').press('Enter');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('119,90');

    // 2. Escape deve cancelar sem disparar onBlur commit fantasma
    const putsBeforeEsc = state.putCount;
    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    await page.getByTestId('inline-price-input-prod-serum').fill('999,00');
    await page.getByTestId('inline-price-input-prod-serum').press('Escape');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('119,90');
    await page.waitForTimeout(380);
    expect(state.putCount).toBe(putsBeforeEsc);

    // 3. Space dentro de input não dispara @dnd-kit; edição rápida de 2 linhas em < 150ms acumula ambas
    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    const priceInput = page.getByTestId('inline-price-input-prod-serum');
    await priceInput.fill('12 9,90');
    await expect(priceInput).toHaveValue('12 9,90');
    await priceInput.fill('129,90');
    await priceInput.press('Enter');

    await page.getByTestId('inline-stock-trigger-prod-creme').dblclick();
    const stockInput = page.getByTestId('inline-stock-input-prod-creme');
    await stockInput.fill('2');
    await stockInput.press('Enter');

    await expect.poll(() => state.profile.catalog.products[0].priceCents).toBe(12990);
    await expect.poll(() => state.profile.catalog.products[1].stock).toBe(2);

    // 4. ShippingQuickCard + Reload Pós-F5 (P6)
    await page.getByTestId('shipping-quick-card-toggle').click();
    await page.getByTestId('shipping-fixed-fee-input').fill('18,00');
    await page.getByTestId('shipping-save-btn').click();
    await expect.poll(() => state.profile.shipping.fixedFeeCents).toBe(1800);

    await page.reload();
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('129,90', {
      timeout: 15000,
    });
    await expect(page.getByTestId('inline-stock-trigger-prod-creme')).toContainText('2');
    await expect(page.getByTestId('shipping-quick-summary')).toContainText('18,00');

    await dismissAllToasts(page);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fase3_final_01_inline_guards_and_f5_persistence.png`,
    });
  });

  test('BUG-F03-03 & BUG-F03-07: Magic Bytes bloqueia SVGXSS disfarçado + Exportação Real Feed 1080x1080 e Story 1080x1920', async ({
    page,
  }) => {
    const state = createQaState();
    await setupFase3QaHarness(page, state);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?tab=store');
    await expect(page.getByTestId('catalog-edit-btn-prod-serum')).toBeVisible({ timeout: 15000 });

    // 1. Tentativa XSS SVG disfarçado de .png dentro do ProductEditorDrawer
    await page.getByTestId('catalog-edit-btn-prod-serum').click();
    const fakeSvgPng = Buffer.from('<svg onload="alert(1)"><script>evil()</script></svg>', 'utf8');
    await page.getByTestId('drawer-photo-file-input').setInputFiles({
      name: 'xss-exploit.png',
      mimeType: 'image/png',
      buffer: fakeSvgPng,
    });
    await expect(page.locator('[data-cg-toast-region="true"]')).toContainText(
      /inválido|não permitido|SVG|PNG/i,
      { timeout: 6000 },
    );

    await page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /Cancelar|Fechar/i })
      .first()
      .click();
    await expect(page.locator('[data-slot="drawer-overlay"]')).toHaveCount(0);

    // 2. Gera e extrai PNGs reais 1080x1080 e 1080x1920 com nome de 76 caracteres
    await page.getByTestId('store-subtab-divulgacao').click();
    await expect(page.getByTestId('social-preview-feed')).toHaveAttribute('src', /^data:image\/png;base64,/, {
      timeout: 15000,
    });
    await expect(page.getByTestId('social-preview-story')).toHaveAttribute('src', /^data:image\/png;base64,/, {
      timeout: 15000,
    });

    const [feedSrc, storySrc] = await Promise.all([
      page.getByTestId('social-preview-feed').getAttribute('src'),
      page.getByTestId('social-preview-story').getAttribute('src'),
    ]);

    const feedDims = await page.getByTestId('social-preview-feed').evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
    const storyDims = await page.getByTestId('social-preview-story').evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
    expect(feedDims).toEqual({ w: 1080, h: 1080 });
    expect(storyDims).toEqual({ w: 1080, h: 1920 });

    const feedBuf = Buffer.from(String(feedSrc).split(',')[1], 'base64');
    const storyBuf = Buffer.from(String(storySrc).split(',')[1], 'base64');
    expect(feedBuf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(storyBuf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(feedBuf.length).toBeGreaterThan(5000);
    expect(storyBuf.length).toBeGreaterThan(5000);

    fs.writeFileSync(`${ARTIFACT_DIR}/fila03_proof_generated_feed_1080.png`, feedBuf);
    fs.writeFileSync(`${ARTIFACT_DIR}/fila03_proof_generated_story_1080x1920.png`, storyBuf);
  });

  test('BUG-F03-01, BUG-F03-09 & P7 Mobile 390px: HTTP 422 HumanErrorCard na Sacola + Botão Esgotado após última unidade', async ({
    page,
  }) => {
    const state = createQaState();
    state.failNextOrderWith422 = true;
    await setupFase3QaHarness(page, state);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?view=store&u=${TEST_USER_ID}`);
    await expect(page.getByTestId('v9-add-cart-CREME-LAV')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('v9-add-cart-CREME-LAV').click();
    await page.getByRole('button', { name: /Ver Sacola/i }).click();

    // 1. Primeira tentativa recebe 422 do servidor -> HumanErrorCard inline na Sacola
    await page.getByRole('button', { name: /Finalizar Pedido e Enviar no WhatsApp/i }).click();
    const errCard = page.getByTestId('cart-checkout-error-card');
    await expect(errCard).toBeVisible({ timeout: 8000 });
    await expect(errCard).toContainText('Não foi possível concluir o pedido');
    await expect(errCard).toContainText('Estoque insuficiente');

    await dismissAllToasts(page);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_proof_stock_422_and_zero.png`,
    });

    // 2. Fecha alerta e conclui última unidade (201) -> produto muda imediatamente para Esgotado
    await page.getByRole('button', { name: /Entendi \/ Revisar sacola/i }).click();
    await expect(errCard).toHaveCount(0);

    await page.getByRole('button', { name: /Finalizar Pedido e Enviar no WhatsApp/i }).click();
    await expect(page.getByTestId('v9-add-cart-CREME-LAV')).toBeDisabled({ timeout: 8000 });
    await expect(page.getByTestId('v9-add-cart-CREME-LAV')).toContainText('Esgotado');

    await page.getByTestId('v9-catalog-card-CREME-LAV').scrollIntoViewIfNeeded();
    await dismissAllToasts(page);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fase3_final_02_storefront_esgotado_after_last_unit.png`,
    });
  });
});
