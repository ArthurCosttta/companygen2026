import { test, expect } from '@playwright/test';

const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const storageKey = 'sb-irahjajgudbdkgggffum-auth-token';
const userId = '44444444-4444-4444-4444-444444444444';

function createInitialProfileState() {
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
        welcomeMessage: 'Olá! Como posso ajudar?',
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
      catalog: {
        products: [] as Array<Record<string, unknown>>,
      },
      publishedStore: {
        published: false,
        publicSlug: 'loja-teste',
        sourceRevision: 1,
      },
    },
  };
}

test.describe('STLC 31-Screen & 8-Invariant E2E Audit', () => {
  test('ESTADO_0 renders AuthFlowView without dead states or sidebar', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no CompanyGen' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('Full funnel E1 -> E4, F5 persistence, 4 tabs, storefront, orders INV-08, settings & mobile 390x844', async ({ browser }) => {
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
    await context.route(supabaseUrl + '/auth/v1/**', route => route.fulfill({ json: user }));

    let profileState = createInitialProfileState();
    const orders: Array<Record<string, unknown>> = [];
    let templates = [
      { id: 'tpl-1', titulo: 'Boas-vindas', mensagem: 'Olá {cliente}, seja bem-vindo!' },
    ];
    const whatsappState = {
      conectado: false,
      status: 'Desconectado',
      numeroBot: '',
      qr: '',
      persistencia: { provider: 'supabase' },
      configLoja: { nomeLoja: '', nomeAtendente: 'Atendente', onboardingConcluido: false },
      config: { botAtivo: false, enviarFotoAutomatica: true, ignorarArquivadas: true, somenteNovas: true, responderAudioComAudio: true, delayHumanoMs: 2000 },
      conversas: [],
      contatos: [],
      skus: [],
      documentos: [],
      templates,
    };

    function buildDashboard() {
      const validOrders = orders.filter(o => o.status !== 'cancelado');
      const salesCents = validOrders.reduce((acc, o) => acc + Number(o.total_cents || 0), 0);
      return {
        sourceRevision: profileState.revision,
        businessName: profileState.profile.business.name || 'Minha Loja',
        whatsappConnected: profileState.profile.whatsapp.connected,
        displayPhone: profileState.profile.whatsapp.displayPhone,
        visitsTotal: 1,
        visitsByDay: {},
        ordersCount: validOrders.length,
        salesCents,
        messagesCount: 0,
        catalogCount: profileState.profile.catalog.products.length,
        stockUnits: profileState.profile.catalog.products.reduce((acc, p) => acc + Number(p.stock || 0), 0),
        recentOrders: orders,
      };
    }

    await context.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;

      if (pathname === '/api/workspace') {
        return route.fulfill({
          json: request.method() === 'GET' ? { revision: 0, data: { campaigns: [] }, provider: 'supabase' } : { revision: 1, provider: 'supabase' },
        });
      }
      if (pathname === '/api/profile') {
        if (request.method() === 'GET') {
          return route.fulfill({ json: profileState });
        }
        const body = request.postDataJSON() as { revision: number; profile: typeof profileState.profile; publish?: boolean };
        if (body.revision !== profileState.revision) {
          return route.fulfill({ status: 409, json: { error: 'A ficha foi atualizada em outra aba.' } });
        }
        profileState = {
          revision: profileState.revision + 1,
          provider: 'supabase',
          profile: {
            ...body.profile,
            publishedStore: {
              ...body.profile.publishedStore,
              published: body.publish ? true : body.profile.publishedStore.published,
              sourceRevision: profileState.revision + 1,
            },
          },
        };
        return route.fulfill({ json: profileState });
      }
      if (pathname === '/api/dashboard') {
        return route.fulfill({ json: { dashboard: buildDashboard() } });
      }
      if (pathname === '/api/orders') {
        if (request.method() === 'GET') {
          return route.fulfill({ json: { orders } });
        }
        if (request.method() === 'POST') {
          const payload = request.postDataJSON() as Record<string, unknown>;
          const now = new Date().toISOString();
          const totalCents = Number(payload.totalCents || 10000);
          const order = {
            id: `ord-${orders.length + 1}`,
            order_ref: `PED-${100 + orders.length + 1}`,
            customer_jid: String(payload.customerJid || ''),
            customer_name: String(payload.customerName || 'Cliente'),
            items: Array.isArray(payload.items) && payload.items.length > 0
              ? (payload.items as Array<Record<string, unknown>>).map(it => ({
                  sku: String(it.sku || 'AVULSO'),
                  name: String(it.name || it.customItemName || 'Item'),
                  variation: 'Padrão',
                  quantity: Number(it.quantity || it.qty || 1),
                  unitPriceCents: Number(it.unitPriceCents || totalCents),
                  lineTotalCents: Number(it.unitPriceCents || totalCents) * Number(it.quantity || it.qty || 1),
                }))
              : [{ sku: 'AVULSO', name: String(payload.customItemName || 'Venda Manual'), variation: 'Padrão', quantity: 1, unitPriceCents: totalCents, lineTotalCents: totalCents }],
            subtotal_cents: totalCents,
            shipping_cents: 0,
            total_cents: totalCents,
            payment_method: String(payload.paymentMethod || 'pix'),
            delivery_address: {},
            status: String(payload.status || (payload.markAsPaid ? 'confirmado' : 'aguardando_pagamento')),
            source_revision: profileState.revision,
            created_at: now,
            updated_at: now,
          };
          orders.unshift(order);
          return route.fulfill({ status: 201, json: { ok: true, order } });
        }
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON() as { orderRef: string; status: string };
          const target = orders.find(o => o.order_ref === payload.orderRef);
          if (!target) return route.fulfill({ status: 404, json: { error: 'Pedido não encontrado' } });
          target.status = payload.status;
          target.updated_at = new Date().toISOString();
          return route.fulfill({ json: { ok: true, order: target } });
        }
      }
      if (pathname === '/api/store/visit') {
        return route.fulfill({ json: { ok: true } });
      }
      if (pathname === '/api/whatsapp/api/dados') {
        return route.fulfill({ json: { ...whatsappState, templates } });
      }
      if (pathname === '/api/whatsapp/api/templates/save') {
        const body = request.postDataJSON() as { titulo: string; mensagem: string };
        const item = { id: `tpl-${templates.length + 1}`, titulo: body.titulo, mensagem: body.mensagem };
        templates = [...templates, item];
        return route.fulfill({ json: { ok: true, templates } });
      }
      if (pathname === '/api/whatsapp/api/sessao/connect') {
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { ok: true } });
    });

    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/');

    // TELA 01: WelcomeModal opens automatically in ESTADO_1
    await expect(page.getByText('Boas-vindas ao CompanyGen!')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Configurar Minha Loja Agora/i }).click();

    // TELA 06: Express Wizard Passo 1
    await page.getByLabel('Nome da Sua Loja *').fill('Ateliê Aurora');
    await page.getByLabel('WhatsApp de Pedidos (com DDD) *').fill('11987654321');
    await page.getByRole('button', { name: 'Salvar e Ir para Produto' }).click();

    // TELA 07: Express Wizard Passo 2 (without photo -> auto SVG placeholder)
    await page.getByLabel('Nome do Produto *').fill('Vestido Linho');
    await page.getByLabel('Preço de Venda (R$) *').fill('129,90');
    await page.getByRole('button', { name: 'Salvar Produto e Continuar' }).click();

    // TELA 08: Express Wizard Passo 3 (Pix + Publish independent of WhatsApp QR - INV-03)
    await page.getByLabel('Chave Pix da Loja (opcional)').fill('11987654321');
    await page.getByRole('button', { name: 'Concluir e Criar Minha Loja' }).click();

    // TELA 12: StoreCreatedSuccessModal
    await expect(page.getByText('Parabéns! Sua loja foi criada')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Continuar gerenciando produtos' }).click();

    // ESTADO_4: Catalog table visible with Vestido Linho
    await expect(page.getByText('Vestido Linho').first()).toBeVisible();

    // INV-02: F5 reload preserves ESTADO_4 cleanly
    await page.reload();
    await expect(page.getByText('Vestido Linho').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Boas-vindas ao CompanyGen!')).toHaveCount(0);

    // Dead states must NOT exist
    await expect(page.getByText('Os dois navegadores foram recolhidos')).toHaveCount(0);
    await expect(page.getByText('Estúdio & 30 dias')).toHaveCount(0);

    // Strictly 4 desktop tabs in Sidebar
    const desktopNav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(desktopNav.getByRole('button')).toHaveCount(4);

    // TELA 22 & 23: Storefront Preview + ProductDetail + Add to Cart + Checkout
    await page.getByTestId('topbar-preview-vitrine').click();
    await expect(page.getByText('Vestido Linho').first()).toBeVisible();
    await page.getByRole('button', { name: 'Comprar' }).first().click();
    await page.getByRole('button', { name: /Adicionar à Sacola/i }).click();
    await expect(page.getByRole('dialog', { name: /Sua Sacola de Compras/i })).toBeVisible();
    await page.locator('#checkout-customer-name').fill('Cliente Web');
    await page.locator('#checkout-customer-phone').fill('(11) 99988-7766');
    await page.getByRole('button', { name: /Finalizar Pedido e Enviar no WhatsApp/i }).click();
    await expect(page.getByRole('button', { name: 'Voltar ao Painel' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Voltar ao Painel' }).click();

    // TAB 2: WhatsApp (TELAS 24..26) - no technical jargon
    await desktopNav.getByRole('button', { name: 'WhatsApp' }).click();
    await expect(page.getByText(/WPPConnect|Baileys|CONNECTIONPHASE/i)).toHaveCount(0);
    await page.getByRole('button', { name: /Ver Respostas Rápidas da Loja/i }).click();
    await expect(page.getByText('Boas-vindas').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // TAB 3: Pedidos (TELAS 27..29) + Manual Sale + INV-08
    await desktopNav.getByRole('button', { name: 'Pedidos' }).click();
    await page.getByRole('button', { name: /Registrar Venda Manual/i }).first().click();
    await page.locator('#manual-sale-customer-name').fill('Maria Balcão');
    await page.locator('#manual-sale-amount').fill('100,00');
    await page.getByRole('button', { name: /Salvar Venda e Atualizar Faturamento/i }).click();
    await expect(page.getByText('Maria Balcão').first()).toBeVisible({ timeout: 10000 });

    // INV-08: Cancel order excludes from Vendas no período; reverting restores it
    await expect(page.getByText('R$ 200,00').first()).toBeVisible();
    await page.getByRole('button', { name: 'Detalhes', exact: true }).first().click();
    const detailsDialog = page.getByRole('dialog');
    await detailsDialog.getByRole('button', { name: 'Cancelado', exact: true }).click();
    const cancelDialog = page.getByRole('alertdialog');
    await expect(cancelDialog).toBeVisible();
    await expect(cancelDialog.getByRole('button', { name: 'Manter Pedido' })).toBeFocused();
    await cancelDialog.getByRole('button', { name: 'Sim, Cancelar Pedido' }).click();
    await expect(page.getByText('R$ 100,00').first()).toBeVisible();
    await detailsDialog.getByRole('button', { name: 'Pago', exact: true }).click();
    await expect(page.getByText('R$ 200,00').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // TAB 4: Ajustes (TELAS 30..32) + alertdialog initialFocus="cancel"
    await desktopNav.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.getByRole('heading', { name: 'Ajustes da Loja' })).toBeVisible();
    await page.getByRole('button', { name: 'Sair da Conta' }).click();
    const logoutDialog = page.getByRole('alertdialog');
    await expect(logoutDialog).toBeVisible();
    await expect(logoutDialog.getByRole('button', { name: 'Continuar no Painel' })).toBeFocused();
    await logoutDialog.getByRole('button', { name: 'Continuar no Painel' }).click();

    // Mobile 390x844 check (INV-04): Bottom Tab Bar 64px, zero horizontal overflow across all 4 tabs
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNav = page.getByRole('navigation', { name: 'Navegação inferior' });
    await expect(mobileNav).toBeVisible();
    const tabButtons = mobileNav.getByRole('button');
    await expect(tabButtons).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      const btn = tabButtons.nth(i);
      const box = await btn.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await btn.click();
      await page.waitForTimeout(150);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(fits).toBe(true);
    }

    expect(pageErrors).toEqual([]);
    await context.close();
  });
});
