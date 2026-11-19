import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '66666666-6666-4666-8666-666666666666';

async function dismissAllToasts(page: Page) {
  const closeBtns = page.locator('[data-cg-toast-region="true"] button');
  for (let pass = 0; pass < 6; pass += 1) {
    const count = await closeBtns.count();
    if (count === 0) break;
    await closeBtns.first().click().catch(() => {});
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(220);
}

test.describe('FILA 06 Word-Class QA: Pedidos Kanban, CRM, Ajustes 4 Sub-abas & Checkout Simulador (12 Prints)', () => {
  test('Executa fluxo completo FILA 06 e captura F06-P01..P12', async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const now = Date.now();
    let forceOrderPatchError500 = false;
    let profileRevision = 9;
    let desktopPrefs = {
      minimizeToTray: true,
      soundNewOrder: true,
      soundHumanAlert: true,
      lowCreditEmailAlert: true,
      offlineEmailAlert: true,
    };

    const ordersList = [
      {
        id: 'o-new-delay',
        order_ref: 'PED-AGE1',
        customer_jid: '5511999990001@s.whatsapp.net',
        customer_name: 'Maria Clara',
        items: [{ sku: 'SER-01', name: 'Sérum Botânico C+E', variation: '30ml', quantity: 2, unitPriceCents: 15000, lineTotalCents: 30000 }],
        subtotal_cents: 30000,
        shipping_cents: 0,
        total_cents: 30000,
        payment_method: 'pix',
        delivery_address: { street: 'Rua das Flores, 120', city: 'São Paulo' },
        status: 'aguardando_dados',
        source_channel: 'whatsapp_purchase_message',
        source_revision: 9,
        created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'o-sim-1',
        order_ref: 'CG-SIM9',
        customer_jid: '5511999990099',
        customer_name: 'Pedido Simulação Teste',
        items: [{ sku: 'KIT-03', name: 'Kit Rotina Completa', variation: '3 Passos', quantity: 1, unitPriceCents: 99900, lineTotalCents: 99900 }],
        subtotal_cents: 99900,
        shipping_cents: 0,
        total_cents: 99900,
        payment_method: 'pix',
        delivery_address: {},
        status: 'aguardando_dados',
        isSimulation: true,
        source_revision: 9,
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 10 * 60 * 1000).toISOString(),
      },
      {
        id: 'o-wait-pay',
        order_ref: 'CG-2002',
        customer_jid: '5511999990001@s.whatsapp.net',
        customer_name: 'Maria Clara',
        items: [{ sku: 'KIT-03', name: 'Kit Rotina Completa', variation: '3 Passos', quantity: 1, unitPriceCents: 28000, lineTotalCents: 28000 }],
        subtotal_cents: 28000,
        shipping_cents: 0,
        total_cents: 28000,
        payment_method: 'pix',
        delivery_address: {},
        status: 'aguardando_pagamento',
        source_channel: 'vitrine_storefront',
        source_revision: 9,
        created_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 20 * 60 * 1000).toISOString(),
      },
      {
        id: 'o-paid-1',
        order_ref: 'CG-3003',
        customer_jid: '5511988882222@s.whatsapp.net',
        customer_name: 'Lucas Ribeiro',
        items: [{ sku: 'SER-01', name: 'Sérum Botânico C+E', variation: '30ml', quantity: 1, unitPriceCents: 15000, lineTotalCents: 15000 }],
        subtotal_cents: 15000,
        shipping_cents: 1500,
        total_cents: 16500,
        payment_method: 'credit_card',
        delivery_address: {},
        status: 'confirmado',
        source_channel: 'vitrine_storefront',
        source_revision: 9,
        created_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const ledgerEntries = [
      {
        id: 'led-1',
        delta: -30,
        balance_after: 120,
        operation_type: 'generate_storefront',
        created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'led-2',
        delta: -2,
        balance_after: 118,
        operation_type: 'whatsapp_reply_consumed',
        created_at: new Date(now - 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'led-3',
        delta: 100,
        balance_after: 218,
        operation_type: 'purchase_kiwify',
        created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const user = {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'fila06-qa@example.invalid',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const session = {
      access_token: 'fila06-qa-token',
      refresh_token: 'fila06-qa-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };

    await context.addInitScript(
      ({ key, val }) => localStorage.setItem(key, JSON.stringify(val)),
      { key: STORAGE_KEY, val: session },
    );

    await context.route(`${SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: user }));

    const buildDashboardPayload = (days: string | number = 7) => {
      const cutoff =
        days === 'all' ? 0 : now - (Number(days) || 7) * 24 * 60 * 60 * 1000;
      const inRange = ordersList.filter((o) => !cutoff || Date.parse(o.created_at) >= cutoff);
      const valid = inRange.filter((o) => o.status !== 'cancelado' && !o.isSimulation);
      const totalRev = valid.reduce((s, o) => s + o.total_cents, 0);
      return {
        sourceRevision: profileRevision,
        periodDays: days === 'all' ? 'all' : Number(days) || 7,
        businessName: 'Botânica Lume',
        whatsappConnected: true,
        displayPhone: '+55 (11) 99999-0000',
        visitsTotal: 84,
        visitsByDay: {},
        ordersCount: valid.length,
        salesCents: totalRev,
        messagesCount: 12,
        catalogCount: 2,
        stockUnits: 25,
        recentOrders: inRange,
        crmSummary: {
          totalRevenueCents: totalRev,
          orderCount: valid.length,
          avgTicketCents: valid.length > 0 ? Math.round(totalRev / valid.length) : 0,
          byChannel: {
            storefront: valid.filter((o) => o.source_channel === 'vitrine_storefront').length,
            whatsapp: valid.filter((o) => o.source_channel === 'whatsapp_purchase_message').length,
            counter: 0,
          },
          topProducts: [
            { sku: 'SER-01', name: 'Sérum Botânico C+E', storefrontQty: 1, whatsappQty: 2, counterQty: 0, totalQty: 3, revenueCents: 45000 },
            { sku: 'KIT-03', name: 'Kit Rotina Completa', storefrontQty: 1, whatsappQty: 0, counterQty: 0, totalQty: 1, revenueCents: 28000 },
          ],
          repeatCustomers: [
            { customerKey: '5511999990001', customerName: 'Maria Clara', phone: '5511999990001', orderCount: 2, totalCents: 58000, lastOrderAt: ordersList[0].created_at },
            { customerKey: '5511988882222', customerName: 'Lucas Ribeiro', phone: '5511988882222', orderCount: 1, totalCents: 16500, lastOrderAt: ordersList[3].created_at },
          ],
        },
      };
    };

    const sampleZipForTest = new JSZip();
    const payloadString = JSON.stringify({ schemaVersion: 1, profile: { business: { name: 'Botânica Lume' }, catalog: { products: [] } } });
    sampleZipForTest.file('manifest.json', JSON.stringify({ schemaVersion: 1, sha256: 'abc123'.padEnd(64, '0') }));
    sampleZipForTest.file('payload.json', payloadString);
    const exportZipBase64 = await sampleZipForTest.generateAsync({ type: 'base64' });

    await context.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const pathname = url.pathname;
      const method = req.method();

      if (pathname === '/api/profile') {
        if (method === 'PUT' || method === 'PATCH') {
          const body = req.postDataJSON() || {};
          if (body?.profile?.desktopPrefs) {
            desktopPrefs = body.profile.desktopPrefs;
          }
          profileRevision += 1;
        }
        return route.fulfill({
          json: {
            revision: profileRevision,
            provider: 'supabase',
            profile: {
              schemaVersion: 1,
              business: { name: 'Botânica Lume', segment: 'Skincare', hours: 'Seg a Sáb · 09h às 19h', address: 'Rua das Flores, 420' },
              whatsapp: { connected: true, phoneE164: '5511999990000', displayPhone: '+55 (11) 99999-0000' },
              payment: { pixKey: 'pix@lumebotanica.com', pixDiscountPercent: 5, acceptedMethods: ['pix', 'credit_card'] },
              delivery: { pickupEnabled: true, deliveryEnabled: true, areas: ['Centro'], defaultFeeCents: 1500, pickupHours: '09h-18h' },
              desktopPrefs,
              catalog: {
                products: [
                  { id: 'p1', sku: 'SER-01', name: 'Sérum Botânico C+E', category: 'Rosto', priceCents: 15000, stock: 12, active: true },
                  { id: 'p2', sku: 'KIT-03', name: 'Kit Rotina Completa', category: 'Combos', priceCents: 28000, stock: 13, active: true },
                ],
              },
              publishedStore: { published: true, publicSlug: 'botanica-lume', sourceRevision: profileRevision },
              onboarding: { completed: true, fichaCompleted: true, storeGenerated: true, productsAdded: true },
            },
          },
        });
      }

      if (pathname === '/api/dashboard') {
        const days = url.searchParams.get('days') || url.searchParams.get('period') || '7';
        return route.fulfill({ json: { dashboard: buildDashboardPayload(days) } });
      }

      if (pathname === '/api/orders') {
        if (method === 'PATCH') {
          if (forceOrderPatchError500) {
            return route.fulfill({
              status: 500,
              json: { ok: false, error: 'Erro temporário ao salvar etapa no servidor.' },
            });
          }
          const body = req.postDataJSON() || {};
          const found = ordersList.find((o) => o.order_ref === body.orderRef);
          if (found && body.status) {
            found.status = body.status;
            found.updated_at = new Date().toISOString();
          }
          return route.fulfill({ json: { order: found } });
        }
        return route.fulfill({ json: { ok: true, orders: ordersList } });
      }

      if (pathname === '/api/whatsapp/events' || pathname === '/api/whatsapp/ai/notifications') {
        return route.fulfill({ json: { ok: true, notifications: [], allNotifications: [], queueItems: [], pausedThreads: {}, pausedThreadItems: [], waitingHumanCount: 0 } });
      }

      if (pathname === '/api/credits/costs') {
        return route.fulfill({
          json: {
            ok: true,
            costs: {
              glm_whatsapp: 2,
              generate_full_storefront: 30,
              generate_image_schnell: 5,
              edit_block: 3,
            },
          },
        });
      }

      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 218, history: ledgerEntries } });
      }

      if (pathname === '/api/checkout/plans') {
        return route.fulfill({
          json: {
            ok: true,
            plans: [
              { id: 'plan_10_brl', slug: 'micro-100', name: 'Inicial', credits: 100, priceCents: 990, priceFormatted: 'R$ 9,90', pricePerCredit: 'R$ 0,10', savingsPercent: null, popular: false, description: 'Ideal para validar sua primeira loja.' },
              { id: 'plan_25_brl', slug: 'crescimento-300', name: 'Crescimento', credits: 300, priceCents: 2490, priceFormatted: 'R$ 24,90', pricePerCredit: 'R$ 0,08', savingsPercent: '17%', popular: false, description: 'Para lojas com atendimento diário ativo.' },
              { id: 'plan_100_brl', slug: 'pro-2500', name: 'Profissional', credits: 2500, priceCents: 10000, priceFormatted: 'R$ 100,00', pricePerCredit: 'R$ 0,04', savingsPercent: '60%', popular: true, description: 'Melhor custo-benefício em escala.' },
            ],
          },
        });
      }

      if (pathname === '/api/workspace/backup-export') {
        return route.fulfill({
          json: {
            ok: true,
            sha256: 'abc123def456'.padEnd(64, '0'),
            filename: 'companygen-backup-teste.zip',
            zipBase64: exportZipBase64,
            sizeBytes: Buffer.from(exportZipBase64, 'base64').length,
          },
        });
      }

      if (pathname === '/api/workspace/backup-restore') {
        return route.fulfill({
          status: 400,
          json: { ok: false, error: 'Checksum SHA-256 inválido ou arquivo adulterado.' },
        });
      }

      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // ─── F06-P01: Pedidos Kanban (Totais reais excluem CG-SIM9 + badge ⏰ >2h) ───
    await page.getByTestId('nav-tab-dashboard').click();
    await expect(page.getByTestId('kanban-col-header-aguardando_dados')).toContainText('Novos · 1 · R$ 300,00', { timeout: 10_000 });
    await expect(page.getByTestId('kanban-delay-badge-PED-AGE1')).toBeVisible();
    await expect(page.getByTestId('kanban-sim-badge-CG-SIM9')).toBeVisible();
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_orders_kanban_1440.png` });

    // ─── F06-P02: Optimistic rollback 0ms + HumanErrorCard retry quando backend retorna HTTP 500 ───
    forceOrderPatchError500 = true;
    await page.getByTestId('kanban-advance-btn-PED-AGE1').click();
    await expect(page.getByTestId('orders-optimistic-error-card')).toBeVisible({ timeout: 6000 });
    // Card voltou para a coluna aguardando_dados (soma segue R$ 300,00)
    await expect(page.getByTestId('kanban-col-aguardando_dados').getByTestId('kanban-card-PED-AGE1')).toBeVisible();
    await expect(page.getByTestId('orders-optimistic-error-card')).toContainText('Tentar novamente');
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_orders_optimistic_rollback.png` });
    forceOrderPatchError500 = false;

    // ─── F06-P03: CRM Enxuto (Resumo de Vendas & Clientes + 30 dias) ───
    await page.getByTestId('orders-subtab-crm').click();
    await page.getByTestId('period-filter-30').click();
    await expect(page.getByTestId('crm-total-revenue')).toContainText('745,00', { timeout: 6000 });
    await expect(page.getByTestId('crm-order-count')).toContainText('3');
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_orders_crm_resumo_1440.png` });

    // ─── F06-P04: CRM Mobile 390×844 sem overflow ───
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('crm-resumo-panel').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const crmMobOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(crmMobOverflow).toBeLessThanOrEqual(1);
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_orders_crm_mobile_390.png` });

    // ─── F06-P05: OrderDetailsModal @media print limpa ───
    await page.setViewportSize({ width: 800, height: 900 });
    await page.getByTestId('orders-subtab-kanban').click();
    await page.getByTestId('kanban-card-PED-AGE1').click();
    await expect(page.getByTestId('order-details-print-btn')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_order_comanda_print_preview.png` });
    await page.emulateMedia({ media: 'screen' });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });

    // ─── F06-P06 & F06-P07: Ajustes 4 Sub-abas (Light + Dark) & F06-P12 Backup Tampered 400 ───
    await page.getByTestId('nav-tab-settings').click();
    await page.getByTestId('settings-subtab-desktop').click();
    await expect(page.getByTestId('settings-panel-desktop')).toBeVisible();
    await page.getByTestId('settings-save-desktop-prefs-btn').click();
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_settings_desktop_4tabs.png` });

    // Sub-aba Dados da Loja no Dark Mode (F06-P07)
    await page.getByTestId('settings-subtab-store').click();
    await page.getByRole('button', { name: /modo escuro|modo claro/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_settings_dark_1440.png` });
    await page.getByRole('button', { name: /modo escuro|modo claro/i }).click(); // retorna Light

    // F06-P12: Backup Export + Tampered Restore => HTTP 400 humano
    await page.getByTestId('settings-subtab-backup').click();
    await page.getByTestId('settings-export-backup-zip-btn').click();
    const tamperedZip = new JSZip();
    tamperedZip.file('manifest.json', JSON.stringify({ sha256: 'deadbeef'.repeat(8) }));
    tamperedZip.file('payload.json', JSON.stringify({ tampered: true }));
    const tamperedBytes = await tamperedZip.generateAsync({ type: 'nodebuffer' });
    await page.getByTestId('settings-restore-file-input').setInputFiles({
      name: 'backup-adulterado.zip',
      mimeType: 'application/zip',
      buffer: tamperedBytes,
    });
    await expect(page.getByTestId('settings-restore-error-alert')).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId('settings-restore-error-alert')).toContainText(/SHA-256|adulterado/i);
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_proof_restore_tampered_400.png` });

    // ─── F06-P08..P11: CheckoutPlansView (Simulador Light & Dark + Extrato Drill-Down + Mobile 390) ───
    await page.getByTestId('settings-subtab-credits').click();
    await page.getByTestId('settings-open-checkout-btn').click();
    await expect(page.getByTestId('credit-duration-simulator')).toBeVisible({ timeout: 8000 });

    // Move slider WhatsApp/dia para 80 msgs/dia -> seleciona pacote 2.500 cr (Profissional)
    const slider = page.getByTestId('sim-whatsapp-slider');
    await slider.fill('80');
    await slider.dispatchEvent('change');
    await expect(page.getByTestId('sim-whatsapp-value')).toContainText('80 msgs/dia');
    await expect(page.getByTestId('simulator-recommended-plan')).toContainText('Profissional');
    await dismissAllToasts(page);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_checkout_simulator_light.png` });

    // F06-P09: Checkout Dark Mode
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_checkout_simulator_dark.png` });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(180);

    // F06-P10: Extrato & Consumo Drill-Down + Tooltip Camada 2 + [Limpar filtro]
    await page.getByTestId('checkout-tab-ledger').click();
    const chartBar = page.getByTestId('checkout-chart-bar-generate_storefront');
    await expect(chartBar).toBeVisible();
    await chartBar.click();
    await expect(page.getByTestId('checkout-clear-ledger-filter')).toBeVisible();
    await expect(page.getByTestId('checkout-ledger-row-generate_storefront')).toBeVisible();
    await expect(page.getByTestId('checkout-ledger-row-purchase_kiwify')).toHaveCount(0);
    await page.getByTestId('checkout-ledger-row-generate_storefront').focus();
    await expect(page.getByTestId('checkout-ledger-tooltip')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_checkout_extrato_drilldown.png` });

    // F06-P11: Checkout Mobile 390×844 Light
    await page.getByTestId('checkout-tab-plans').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const checkoutMobOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(checkoutMobOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila06_checkout_mobile_390.png` });

    await context.close();
  });
});
