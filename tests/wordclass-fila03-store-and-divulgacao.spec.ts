import { test, expect, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '77777777-7777-4777-8777-777777777777';

// Valid 4x4 RGBA PNG (valid magic bytes, dimensions < 500px to test low-resolution warning & focal crop)
function createSmallValidPngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=',
    'base64',
  );
}

interface CatalogHarnessState {
  revision: number;
  profile: Record<string, any>;
}

async function setupFila03Harness(page: Page, state: CatalogHarnessState) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fila03.lojista@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Botânica Lume' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'fila03-session-token',
    refresh_token: 'fila03-refresh-token',
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

  const lastOrderBodies: Array<Record<string, any>> = [];

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
          publish?: boolean;
        };
        if (body.revision !== state.revision) {
          return route.fulfill({
            status: 409,
            json: { ok: false, error: 'A ficha foi atualizada em outra aba.' },
          });
        }
        state.revision += 1;
        state.profile = {
          ...(body.profile || state.profile),
          publishedStore: {
            ...(body.profile?.publishedStore || state.profile.publishedStore),
            ...(body.publish ? { published: true, publishedAt: new Date().toISOString() } : {}),
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
      const target =
        url.searchParams.get('target') ||
        (req.method() === 'POST' ? JSON.parse(req.postData() || '{}').target : 'store') ||
        'store';
      const sku = (url.searchParams.get('sku') || '').replace(/[^A-Za-z0-9_-]/g, '');
      const label = (url.searchParams.get('label') || '').replace(/[^A-Za-z0-9_-]/g, '');
      const targetObj = new URL('http://127.0.0.1:4173/?view=store&loja=botanica-lume');
      if (sku) targetObj.searchParams.set('item', sku);
      if (label) targetObj.searchParams.set('origem', label);
      const pngDataUrl = await QRCode.toDataURL(targetObj.toString(), { margin: 2, width: 512 });
      return route.fulfill({
        json: {
          ok: true,
          target,
          sku,
          label,
          targetUrl: targetObj.toString(),
          pngDataUrl,
        },
      });
    }

    if (pathname === '/api/orders') {
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}') as Record<string, any>;
        lastOrderBodies.push(body);
        const order = {
          id: `ord-${Date.now()}`,
          order_ref: 'CG-801',
          customer_jid: '',
          customer_name: body.customerName || 'Cliente Vitrine',
          items: body.items || [],
          subtotal_cents: 16990,
          shipping_cents: 0,
          discount_cents: 3260,
          coupon_code: body.couponCode || undefined,
          total_cents: 13730,
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
            visitsTotal: 42,
            visitsByDay: {},
            ordersCount: 3,
            salesCents: 38900,
            messagesCount: 14,
            catalogCount: state.profile.catalog.products.filter((p: any) => p.active !== false).length,
            stockUnits: 29,
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
    if (pathname === '/api/support/tickets' || pathname === '/api/onboarding/feedback') {
      return route.fulfill({ json: { ok: true, items: [], tickets: [] } });
    }

    return route.fulfill({ json: { ok: true } });
  });

  return { lastOrderBodies };
}

function createInitialCatalogState(): CatalogHarnessState {
  return {
    revision: 4,
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
        acceptedMethods: ['pix', 'credit_card', 'debit_card'],
        paymentPolicy: 'pix_discount',
      },
      delivery: {
        pickupEnabled: true,
        deliveryEnabled: true,
        areas: ['Jardins', 'Pinheiros'],
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
          usageCount: 4,
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
        sourceRevision: 4,
      },
      catalog: {
        products: [
          {
            id: 'prod-serum',
            sku: 'SER-30',
            name: 'Sérum Facial Vitamina C Pura Iluminadora',
            category: 'Séruns',
            description: 'Antioxidante de alta absorção',
            priceCents: 11990,
            variation: '30ml',
            stock: 15,
            lowStockThreshold: 3,
            imageFocalPoint: { x: 50, y: 50 },
            active: true,
            approvedAsset: true,
            itemType: 'produto_fisico',
          },
          {
            id: 'prod-creme',
            sku: 'CRE-200',
            name: 'Creme Hidratante Lavanda Calmante',
            category: 'Hidratantes',
            description: 'Nutrição prolongada',
            priceCents: 6990,
            variation: '200ml',
            stock: 2,
            lowStockThreshold: 3,
            imageFocalPoint: { x: 50, y: 50 },
            active: true,
            approvedAsset: true,
            itemType: 'produto_fisico',
          },
          {
            id: 'prod-kit',
            sku: 'KIT-GLOW',
            name: 'Kit Glow Botânico Completo',
            category: 'Kits',
            description: 'Rotina dia e noite',
            priceCents: 16990,
            variation: '2 itens',
            stock: 8,
            lowStockThreshold: 3,
            imageFocalPoint: { x: 50, y: 50 },
            active: true,
            approvedAsset: true,
            itemType: 'kit_combo',
          },
          {
            id: 'prod-zerado',
            sku: 'ESP-ZERO',
            name: 'Óleo Facial Rosa Mosqueta Rare',
            category: 'Óleos',
            description: 'Lote esgotado temporariamente',
            priceCents: 8990,
            variation: '15ml',
            stock: 0,
            lowStockThreshold: 2,
            autoPausedOutOfStock: true,
            imageFocalPoint: { x: 50, y: 50 },
            active: false,
            approvedAsset: true,
            itemType: 'produto_fisico',
          },
        ],
      },
    },
  };
}

test.describe('FILA 03 & FASE 3 FINAL TEST — Catálogo Vivo, Estoque, Divulgação & Vitrine (F03-P01..P12)', () => {
  test('Parte 1 (F03-P01 a F03-P06): Catálogo 4 Sinais, Densidade, Busca Fuzzy, Inline Edit, Lote Desfazer 5s, Drawer Focal Crop & Frete', async ({
    page,
  }) => {
    const state = createInitialCatalogState();
    await setupFila03Harness(page, state);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?tab=store');

    await expect(page.getByTestId('store-subtab-catalogo')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('catalog-row-prod-serum')).toBeVisible();

    // F03-P01: Zero input aberto em repouso, floating bar 100% invisível, summary card Frete, zero raw http://
    await expect(page.locator('[data-testid^="inline-price-input-"]')).toHaveCount(0);
    await expect(page.getByTestId('catalog-floating-batch-bar')).toHaveCount(0);
    await expect(page.getByTestId('shipping-quick-summary')).toContainText(
      'Entrega fixa R$ 15,00 · Grátis acima de R$ 150,00 · Retirada OK',
    );
    await expect(page.getByTestId('stock-badge-low-prod-creme')).toContainText('⚠ Baixo');
    await expect(page.getByTestId('stock-badge-paused-prod-zerado')).toContainText('Pausado');
    const bodyTextRest = await page.locator('main').innerText();
    expect(bodyTextRest).not.toMatch(/https?:\/\//i);

    await page.screenshot({ path: `${ARTIFACT_DIR}/fila03_p01_catalog_rest_1440_light.png` });

    // F03-P02: Densidade Compacto persistida + Busca tolerante a acento e variação
    await page.getByTestId('density-compact-btn').click();
    await expect(page.getByTestId('catalog-row-prod-serum')).toHaveAttribute(
      'data-density',
      'compact',
    );
    await page.reload();
    await expect(page.getByTestId('catalog-row-prod-serum')).toHaveAttribute(
      'data-density',
      'compact',
    );

    await page.getByTestId('catalog-fuzzy-search-input').fill('serum 30ml');
    await expect(page.getByTestId('catalog-row-prod-serum')).toBeVisible();
    await expect(page.getByTestId('catalog-row-prod-creme')).toHaveCount(0);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p02_catalog_compact_fuzzy_1440_light.png`,
    });

    await page.getByTestId('catalog-fuzzy-search-input').fill('');
    await page.getByTestId('density-comfortable-btn').click();
    await expect(page.getByTestId('catalog-row-prod-creme')).toBeVisible();

    // F03-P03 & BUG-F03-04 & BUG-F03-08: Edição inline 36px, Space não aciona DnD, negativo reverte, Esc descarta, Enter salva
    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    const priceInput = page.getByTestId('inline-price-input-prod-serum');
    await expect(priceInput).toBeVisible();
    const inputBox = await priceInput.boundingBox();
    expect(Math.round(inputBox?.height || 0)).toBe(36);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p03_catalog_inline_edit_active_1440_light.png`,
    });

    await priceInput.fill('-15 ');
    await priceInput.press('Enter');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('119,90');

    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    await page.getByTestId('inline-price-input-prod-serum').fill('88,00');
    await page.getByTestId('inline-price-input-prod-serum').press('Escape');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('119,90');

    await page.getByTestId('inline-price-trigger-prod-serum').dblclick();
    await page.getByTestId('inline-price-input-prod-serum').fill('124,90');
    await page.getByTestId('inline-price-input-prod-serum').press('Enter');
    await expect(page.getByTestId('inline-price-trigger-prod-serum')).toContainText('124,90');

    // F03-P04 & BUG-F03-05: Shift+Clique multi-seleção -> Barra flutuante -> Arquivar com Desfazer 5s
    await page.getByTestId('catalog-select-row-prod-serum').click();
    await page.getByTestId('catalog-select-row-prod-kit').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('catalog-floating-batch-bar')).toBeVisible();
    await expect(page.getByTestId('catalog-floating-batch-bar')).toContainText('3 selecionado(s)');

    await page.getByTestId('batch-archive-btn').click();
    await expect(page.getByTestId('catalog-row-prod-serum')).toHaveCount(0);
    const undoBtn = page.getByRole('button', { name: 'Desfazer' });
    await expect(undoBtn).toBeVisible();
    await page.getByTestId('catalog-select-row-prod-zerado').click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p04_catalog_batch_bar_and_undo_toast_1440_light.png`,
    });
    await undoBtn.click();
    await expect(page.getByTestId('catalog-row-prod-serum')).toBeVisible();
    await page.getByTestId('catalog-select-row-prod-zerado').click();

    // F03-P05 & BUG-F03-03: Drawer lateral com upload malicioso SVG rejeitado + PNG <500px alerta + Mira Focal
    await page.getByTestId('catalog-edit-btn-prod-serum').click();
    await expect(page.getByTestId('drawer-focal-point-box')).toBeVisible();

    await page.getByTestId('drawer-photo-file-input').setInputFiles({
      name: 'evil-xss.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await expect(page.locator('[data-cg-toast-region="true"]')).toContainText(/Formato de imagem inválido/i);

    await page.getByTestId('drawer-photo-file-input').setInputFiles({
      name: 'tiny-sample.png',
      mimeType: 'image/png',
      buffer: createSmallValidPngBuffer(),
    });
    await expect(page.getByTestId('drawer-low-res-warning')).toBeVisible();

    // Dispensa todos os toasts para deixar o preview do Drawer e selo de baixa resolução 100% livres
    const dismissBtns = page.locator('[data-cg-toast-region="true"] [aria-label="Fechar notificação"]');
    while ((await dismissBtns.count()) > 0) {
      await dismissBtns.first().click();
    }
    await page.waitForTimeout(260);
    await page.getByTestId('drawer-focal-point-box').click({ position: { x: 84, y: 28 } });
    await expect(page.getByTestId('drawer-focal-point-reticle')).toHaveAttribute(
      'style',
      /left:\s*7[456]%.*top:\s*2[456]%/,
    );
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p05_drawer_focal_crop_and_lowres_1440_light.png`,
    });
    await page.getByRole('button', { name: /Salvar Alterações/i }).click();
    await expect(page.getByTestId('drawer-focal-point-box')).toHaveCount(0);

    // F03-P06 & BUG-F03-11: Card Rápido de Frete expandido e sincronizado
    await page.getByTestId('shipping-quick-card-toggle').click();
    await page.getByTestId('shipping-fixed-fee-input').fill('18,00');
    await page.getByTestId('shipping-free-threshold-input').fill('120,00');
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p06_shipping_quick_card_expanded_1440_light.png`,
    });
    await page.getByTestId('shipping-save-btn').click();
    await expect(page.getByTestId('shipping-quick-summary')).toContainText(
      'Entrega fixa R$ 18,00 · Grátis acima de R$ 120,00 · Retirada OK',
    );
  });

  test('Parte 2 (F03-P07 a F03-P12): Sub-aba Divulgação Light & Dark (#FFFFFF QR), Cupons, Posts Canvas 1080px, Vitrine & Mobile Dark', async ({
    page,
  }) => {
    const state = createInitialCatalogState();
    const { lastOrderBodies } = await setupFila03Harness(page, state);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?tab=store');
    await expect(page.getByTestId('store-subtab-divulgacao')).toBeVisible({ timeout: 15000 });

    // F03-P07: Sub-aba Divulgação Light Mode — 3 Cartões Simétricos + QR + Cupom + Posts 0 cr
    await page.getByTestId('store-subtab-divulgacao').click();
    await expect(page.getByTestId('marketing-card-qr')).toBeVisible();
    await expect(page.getByTestId('marketing-card-coupons')).toBeVisible();
    await expect(page.getByTestId('marketing-card-social')).toBeVisible();
    await expect(page.getByTestId('qr-code-preview-img')).toBeVisible();
    await expect(page.getByTestId('social-preview-feed')).toBeVisible();
    await expect(page.getByTestId('social-preview-story')).toBeVisible();
    const divulgacaoText = await page.getByTestId('marketing-hub-tab').innerText();
    expect(divulgacaoText).not.toMatch(/https?:\/\//i);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p07_divulgacao_3cards_1440_light.png`,
    });

    // F03-P08 & BUG-F03-06: Modo Escuro preserva fundo #FFFFFF sólido ao redor do QR Code
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cg_theme', 'dark');
    });
    await page.waitForTimeout(250);
    const qrQuietBg = await page
      .getByTestId('qr-white-quiet-zone')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(qrQuietBg).toBe('rgb(255, 255, 255)');
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p08_divulgacao_3cards_1440_dark.png`,
    });

    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('cg_theme', 'light');
    });
    await page.waitForTimeout(200);

    // F03-P09: Novo cupom VERAO15 criado inline
    await page.getByTestId('coupon-new-toggle-btn').click();
    await page.getByTestId('coupon-code-input').fill('VERAO15');
    await page.getByTestId('coupon-percent-input').fill('15');
    await page.getByTestId('coupon-save-btn').click();
    await expect(page.getByTestId('coupon-row-VERAO15')).toBeVisible();
    await expect(page.getByTestId('coupons-sync-footer')).toContainText(
      'Ativo na Vitrine Pública e na Sofia WhatsApp',
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p09_divulgacao_coupon_created_1440_light.png`,
    });

    // F03-P10 & BUG-F03-07: QR Mesa-04 + Canvas Feed 1080x1080 e Story 1080x1920 para produto título longo
    await page.getByTestId('qr-target-select').selectOption('custom');
    await page.getByTestId('qr-custom-label-input').fill('Mesa-04');
    await expect(page.getByTestId('qr-target-friendly-label')).toContainText('Mesa-04');
    await page.getByTestId('social-product-select').selectOption('prod-serum');
    await expect(page.getByTestId('social-preview-feed')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.getByTestId('social-preview-story')).toHaveAttribute('src', /^data:image\/png/);

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
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p10_divulgacao_social_post_story_preview_1440_light.png`,
    });

    // F03-P12: Mobile Dark Mode 390x844 na sub-aba Catálogo
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('store-subtab-catalogo').click();
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cg_theme', 'dark');
    });
    await page.waitForTimeout(250);
    await expect(page.getByTestId('catalog-mobile-card-prod-serum')).toBeVisible();
    await page.getByTestId('catalog-mobile-card-prod-serum').scrollIntoViewIfNeeded();
    const mobileOverflowDark = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflowDark).toBeLessThanOrEqual(0);
    const mobileToastDismiss = page.locator('[data-cg-toast-region="true"] [aria-label="Fechar notificação"]');
    while ((await mobileToastDismiss.count()) > 0) {
      await mobileToastDismiss.first().click();
    }
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p12_catalog_mobile_cards_390_dark.png`,
    });

    // F03-P11: Vitrine Pública Mobile 390x844 Light Mode com item via QR + Cupom + Frete Grátis
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('cg_theme', 'light');
    });
    await page.goto(`/?view=store&u=${TEST_USER_ID}&origem=Mesa-04`);
    await expect(page.getByTestId('v9-add-cart-KIT-GLOW')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('v9-add-cart-KIT-GLOW').click();

    await page.getByRole('button', { name: /Ver Sacola/i }).click();
    await page.getByTestId('cart-coupon-toggle').click();
    // 1) Verifica que VERAO15 (-15% sobre R$ 169,90 = R$ 144,41) cai abaixo do limite de R$ 150,00 e cobra frete (BUG-F03-11!)
    await page.getByTestId('cart-coupon-input').fill('VERAO15');
    await page.getByTestId('cart-coupon-apply-btn').click();
    await expect(page.getByTestId('cart-coupon-discount-row')).toContainText('-15%');
    await expect(page.getByTestId('cart-free-shipping-badge')).toHaveCount(0);

    // 2) Troca para PRIMEIRA10 (-10% = R$ 152,91 >= R$ 150,00) -> libera Frete Grátis + Pix 5% (R$ 145,26)!
    await page.getByTestId('cart-coupon-input').fill('PRIMEIRA10');
    await page.getByTestId('cart-coupon-apply-btn').click();
    await expect(page.getByTestId('cart-coupon-discount-row')).toContainText('-10%');
    await expect(page.getByTestId('cart-free-shipping-badge')).toContainText('Frete Grátis');
    await expect(page.getByTestId('cart-grand-total')).toContainText('145,26');
    const mobileOverflowPublic = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflowPublic).toBeLessThanOrEqual(0);

    // Dispensa toasts no topo para inspecionar cupom + rodapé da sacola 390px sem obstrução
    const cartToastDismiss = page.locator('[data-cg-toast-region="true"] [aria-label="Fechar notificação"]');
    while ((await cartToastDismiss.count()) > 0) {
      await cartToastDismiss.first().click();
    }
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fila03_p11_storefront_mobile_cart_coupon_390_light.png`,
    });

    await page.getByRole('button', { name: /Finalizar Pedido e Enviar no WhatsApp/i }).click();
    await expect.poll(() => lastOrderBodies.length).toBe(1);
    expect(lastOrderBodies[0].couponCode).toBe('PRIMEIRA10');
  });
});
