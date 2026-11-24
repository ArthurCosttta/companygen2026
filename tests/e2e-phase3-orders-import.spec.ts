import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174';
const PRINTS_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_phase3';
const TRAILER_PRINTS_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_trailer_takes';
const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '88888888-8888-4888-8888-888888888888';

const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAASElEQVR4nO3PQREAMAgAoL9/27s4g4M3J3b27g4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgBwfZAAG4n43UAAAAAElFTkSuQmCC',
  'base64',
);

const INITIAL_PRODUCTS = [
  {
    id: 'prod-1',
    sku: 'PAP-001',
    name: 'Cesta Café Artesanal Manhã',
    category: 'Kits & Cestas',
    description: 'Cesta artesanal com pães de fermentação natural, geleia e café especial.',
    priceCents: 18990,
    variation: 'Padrão',
    stock: 10,
    active: true,
    itemType: 'kit_combo',
    imageUrl: '/brand/illustrations/illustration-kpi-analytics.svg',
    approvedAsset: true,
  },
  {
    id: 'prod-2',
    sku: 'PAP-002',
    name: 'Caderno Espiral Capa Dura Linho',
    category: 'Cadernos',
    description: 'Caderno A5 com papel pólen 90g pontilhado e acabamento em linho.',
    priceCents: 4990,
    variation: 'A5',
    stock: 24,
    active: true,
    itemType: 'produto_fisico',
    imageUrl: '/brand/illustrations/illustration-kpi-analytics.svg',
    approvedAsset: true,
  },
];

function buildFormulaIrDocument() {
  return {
    version: '9.0',
    archetype: 'EDITORIAL_ATELIER',
    nicheId: 'papelaria_presentes',
    tokens: {
      bgPrimary: '#FAF8F5',
      bgSecondary: '#F3EFEA',
      surface: '#FFFFFF',
      textPrimary: '#141413',
      textSecondary: '#57534E',
      accent: '#2563EB',
      accentContrast: '#FFFFFF',
      border: '#E7E5E4',
      fontHeading: 'Fraunces',
      fontBody: 'Plus Jakarta Sans',
      radiusPx: 20,
    },
    sections: [
      {
        id: 'sec-topbar',
        type: 'announcement_bar',
        role: 'topbar',
        visible: true,
        props: {
          text: 'Entrega Expressa + 5% OFF no Pix Automático',
          ctaLabel: 'Atendimento WhatsApp',
        },
      },
      {
        id: 'sec-hero',
        type: 'hero_editorial',
        role: 'hero',
        visible: true,
        props: {
          eyebrow: 'ATELIÊ & PAPELARIA FINA',
          headline: 'Papelaria & Presentes com Curadoria Artesanal',
          subheadline: 'Cadernos em linho, cestas especiais e kits executivos.',
          ctaPrimary: 'Explorar Coleção',
          heroImageUrl: '/brand/illustrations/illustration-kpi-analytics.svg',
        },
      },
      {
        id: 'sec-catalog',
        type: 'product_grid',
        role: 'catalog',
        visible: true,
        props: {
          title: 'Destaques da Coleção',
          subtitle: 'Peças selecionadas com estoque imediato',
          columns: 4,
        },
      },
      {
        id: 'sec-trust',
        type: 'trust_badges',
        role: 'trust',
        visible: true,
        props: {
          title: 'Compra Direta & Segura',
          items: [
            { title: 'Pix Copia-e-Cola', description: 'Confirmação instantânea' },
            { title: 'Atendimento Direto', description: 'Suporte rápido via WhatsApp' },
          ],
        },
      },
      {
        id: 'sec-footer',
        type: 'footer_minimal',
        role: 'footer',
        visible: true,
        props: {
          copyrightText: '© 2026 Papelaria. Todos os direitos reservados.',
        },
      },
    ],
  };
}

function buildReadyProfile() {
  return {
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
      name: 'Papelaria',
      segment: 'Papelaria & Presentes',
      businessModel: 'produtos',
      description: 'Papelaria fina, presentes criativos e kits artesanais.',
      hours: 'Seg a Sáb · 09h às 19h',
      deliveryModes: ['pickup', 'local'],
    },
    brand: {
      instagram: '@papelaria',
      primaryColor: '#09090B',
      accentColor: '#2563EB',
      logoUrl: '',
      heroImageUrl: '/brand/illustrations/illustration-kpi-analytics.svg',
      fontStyle: 'editorial_serif',
      visualMood: 'boutique',
    },
    whatsapp: {
      connected: true,
      phoneE164: '5511987654321',
      displayPhone: '(11) 98765-4321',
    },
    payment: {
      pixKey: 'financeiro@papelaria.com.br',
      pixDiscountPercent: 5,
      acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
      paymentPolicy: 'pix_discount',
    },
    delivery: {
      pickupEnabled: true,
      deliveryEnabled: true,
      defaultFeeCents: 1200,
    },
    catalog: {
      products: INITIAL_PRODUCTS,
    },
    storeLayout: {
      formulasIr: buildFormulaIrDocument(),
    },
    publishedStore: {
      published: true,
      publicSlug: 'papelaria',
      sourceRevision: 12,
    },
  };
}

async function setupPhase3MockEnvironment(page: Page) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'phase3.e2e@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Papelaria' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'phase3-token',
    refresh_token: 'phase3-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await page.addInitScript(
    ({ key, val }) => {
      window.localStorage.setItem(key, JSON.stringify(val));
      window.localStorage.setItem('cg_theme', 'light');
    },
    { key: SUPABASE_STORAGE_KEY, val: session },
  );

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: user }),
  );

  const currentProfile = buildReadyProfile();
  let currentRevision = 12;
  let storedOrders: Array<Record<string, unknown>> = [];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const method = req.method();

    if (pathname.includes('/assets/')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: SAMPLE_PNG_BUFFER,
      });
    }

    if (pathname === '/api/profile' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          revision: currentRevision,
          provider: 'servidor',
          profile: currentProfile,
        }),
      });
    }

    if (pathname === '/api/orders' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders: storedOrders }),
      });
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const now = new Date().toISOString();
      const totalCents = Number(body.totalCents) || 0;
      const orderRef =
        body.orderRef || `PED-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const newOrder = {
        id: `ord-${Date.now()}-${storedOrders.length + 1}`,
        order_ref: orderRef,
        customer_jid: body.customerJid || (body.customerPhone ? `${body.customerPhone}@s.whatsapp.net` : ''),
        customer_name: body.customerName || 'Cliente',
        items: Array.isArray(body.items) && body.items.length > 0
          ? body.items.map((it: Record<string, unknown>, idx: number) => ({
              sku: String(it.sku || `ITEM-${idx + 1}`),
              name: String(it.name || body.customItemName || 'Pedido Planilha'),
              variation: 'Balcão',
              quantity: Number(it.quantity) || 1,
              unitPriceCents: Number(it.overrideTotalCents ?? totalCents),
              lineTotalCents: Number(it.overrideTotalCents ?? totalCents),
            }))
          : [
              {
                sku: 'PLANILHA-1',
                name: body.customItemName || 'Pedido Planilha',
                variation: 'Balcão',
                quantity: 1,
                unitPriceCents: totalCents,
                lineTotalCents: totalCents,
              },
            ],
        subtotal_cents: totalCents,
        shipping_cents: 0,
        discount_cents: 0,
        total_cents: totalCents,
        payment_method: body.paymentMethod || 'Pix',
        delivery_address: {},
        status: body.status || 'confirmado',
        isSimulation: false,
        is_simulation: false,
        source_revision: currentRevision,
        created_at: now,
        updated_at: now,
      };
      storedOrders = [newOrder, ...storedOrders.filter((o) => o.order_ref !== orderRef)];
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ order: newOrder, unmatchedItems: [] }),
      });
    }

    if (pathname === '/api/orders' && method === 'DELETE') {
      const body = JSON.parse(req.postData() || '{}');
      const refs = new Set<string>(Array.isArray(body.orderRefs) ? body.orderRefs : [body.orderRef]);
      const beforeLen = storedOrders.length;
      storedOrders = storedOrders.filter((o) => !refs.has(String(o.order_ref)));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          removedCount: beforeLen - storedOrders.length,
          orders: storedOrders,
        }),
      });
    }

    if (pathname === '/api/dashboard') {
      const totalSales = storedOrders.reduce(
        (sum, o) => sum + (Number(o.total_cents) || 0),
        0,
      );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dashboard: {
            visitsTotal: 142,
            ordersCount: storedOrders.length,
            salesCents: totalSales,
            pendingCount: storedOrders.filter(
              (o) => o.status === 'aguardando_dados' || o.status === 'aguardando_pagamento',
            ).length,
            paidCount: storedOrders.filter(
              (o) => o.status === 'confirmado' || o.status === 'concluido',
            ).length,
            recentOrders: storedOrders,
            d1StrictConversion: {
              visits: 142,
              productClicks: 38,
              whatsappPurchaseMessages: 15,
              d1ConfirmedOrders: storedOrders.length,
              d1RevenueCents: totalSales,
              conversionRatePct: 8.5,
            },
          },
        }),
      });
    }

    if (pathname === '/api/credits/balance') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, balance: 250 }),
      });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conectado: true,
          status: 'Conectado',
          numeroBot: '5511987654321',
        }),
      });
    }

    if (pathname === '/api/whatsapp/ai/brain') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ollamaOnline: true,
          cloudAiAvailable: true,
          creditBalance: 250,
          availableModels: ['qwen3:4b-instruct'],
          brain: {
            enabled: true,
            modelName: 'qwen3:4b-instruct',
            systemPrompt: 'Atenda com cordialidade, informe valores do catálogo e envie a chave Pix.',
            ragDocuments: [],
            safeTestMode: false,
            autonomyMode: 'misto',
          },
        }),
      });
    }

    if (pathname === '/api/whatsapp/ai/templates') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, templates: [] }),
      });
    }

    if (pathname === '/api/whatsapp/ai/simulate-or-reply') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          replyText:
            'Olá! Temos a Cesta Café Artesanal Manhã em estoque por R$ 189,90. Para confirmar agora via Pix, use a chave: financeiro@papelaria.com.br',
          replyParts: [
            'Olá! Temos a Cesta Café Artesanal Manhã em estoque por R$ 189,90 (entrega expressa em 45 min).',
            'Para confirmar agora via Pix Copia-e-Cola, use a chave: financeiro@papelaria.com.br — assim que enviar o comprovante já separamos seu pedido!',
          ],
          modelUsed: 'glm-4.6v',
          intent: 'BUY_INTENT',
          readDelayMs: 2100,
        }),
      });
    }

    if (pathname === '/api/whatsapp/events') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          notifications: [],
          waitingHumanCount: 0,
          d1Funnel: {
            visits: 142,
            productClicks: 38,
            whatsappPurchaseMessages: 15,
            d1ConfirmedOrders: storedOrders.length,
            d1RevenueCents: 0,
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

test.describe('Fase 3 — TELA 05 (Importação de Pedidos via Planilha no Kanban & Limpeza WhatsApp)', () => {
  test('1. Importação de lote misto com correção inline, soma no Kanban, persistência após reload e Desfazer (Undo)', async ({
    page,
  }) => {
    fs.mkdirSync(PRINTS_DIR, { recursive: true });
    fs.mkdirSync(TRAILER_PRINTS_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupPhase3MockEnvironment(page);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('editorial-top-pill')).toBeVisible({ timeout: 15000 });

    // Navega para a aba Pedidos usando a FloatingTopPill
    await page.getByTestId('top-pill-tab-dashboard').click();
    await expect(page.getByTestId('orders-kanban-view')).toBeVisible();
    await expect(page.getByTestId('editorial-top-pill')).toBeVisible();

    // Abre o modal de importação de planilha
    await page.getByTestId('orders-import-spreadsheet-btn').click();
    await expect(page.getByTestId('orders-import-modal')).toBeVisible();

    // Cola 4 linhas válidas + 1 linha com valor inválido ("")
    const mixedBatch = [
      'Cliente\tWhatsApp\tProduto\tValor\tStatus',
      'Mariana Costa\t11987654321\tCesta Café Artesanal Manhã\tR$ 189,90\tPago',
      'Rafael Almeida\t11976543210\tCaderno Espiral Capa Dura\tR$ 49,90\tEm Preparo',
      'Juliana Ribeiro\t21998123344\tPlanner Semanal Minimalista\tR$ 64,90\tNovo',
      'Lucas Ferreira\t31991234567\tCaixa Organizadora Linho\tR$ 119,00\tEntregue',
      'Beatriz Mendes\t11912345678\tKit Escrita Executiva\t\tPago',
    ].join('\n');

    await page.getByTestId('orders-paste-textarea').fill(mixedBatch);

    // Verifica que 4 estão válidos e 1 está pendente de ajuste inline (sem rejeitar o lote!)
    await expect(page.getByTestId('orders-import-summary')).toContainText('4 válido(s)');
    await expect(page.getByTestId('orders-import-invalid-badge')).toContainText(
      '1 pendente(s) de ajuste inline',
    );

    // Corrige inline a célula destacada (linha índice 4) para R$ 99,90
    const cellPrice4 = page.getByTestId('orders-preview-cell-4-totalCents');
    await cellPrice4.fill('R$ 99,90');

    // Agora todos os 5 pedidos são válidos (189,90 + 49,90 + 64,90 + 119,00 + 99,90 = R$ 523,60)
    await expect(page.getByTestId('orders-import-summary')).toContainText('5 válido(s)');
    await expect(page.getByTestId('orders-import-summary')).toContainText('523,60');

    await page.screenshot({
      path: path.join(PRINTS_DIR, 'phase3_orders_import_modal.png'),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(TRAILER_PRINTS_DIR, 'take_13_orders_spreadsheet_modal.png'),
      fullPage: false,
    });

    // Confirma a importação
    await page.getByTestId('orders-confirm-import-btn').click();
    await expect(page.getByTestId('orders-import-modal')).toBeHidden();

    // Verifica banner de auditoria pós-importação e soma de faturamento no Kanban
    await expect(page.getByTestId('orders-import-audit-banner')).toBeVisible();
    await expect(page.getByTestId('orders-import-audit-banner')).toContainText('5 pedido(s)');
    await expect(page.getByTestId('dashboard-sales-total')).toContainText('523,60');
    await expect(page.getByTestId('dashboard-sales-total')).toContainText('5 válido(s)');

    // Verifica os cards nas colunas do Kanban
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Mariana Costa');
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Rafael Almeida');
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Juliana Ribeiro');
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Lucas Ferreira');
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Beatriz Mendes');

    await page.screenshot({
      path: path.join(PRINTS_DIR, 'phase3_orders_kanban_desktop.png'),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(TRAILER_PRINTS_DIR, 'take_14_orders_kanban_populated.png'),
      fullPage: false,
    });

    // Testa Desfazer (Undo) antes do reload
    await page.getByTestId('orders-undo-import-btn').click();
    await expect(page.getByTestId('orders-import-audit-banner')).toBeHidden();
    await expect(page.getByTestId('dashboard-sales-total')).toContainText('0 válido(s)');

    // Re-importa e executa page.reload() para comprovar persistência real no servidor/storage
    await page.getByTestId('orders-import-spreadsheet-btn').click();
    await page.getByTestId('orders-download-sample-btn').click();
    await expect(page.getByTestId('orders-import-summary')).toContainText('4 válido(s)');
    await page.getByTestId('orders-confirm-import-btn').click();
    await expect(page.getByTestId('dashboard-sales-total')).toContainText('4 válido(s)');

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('top-pill-tab-dashboard').click();
    await expect(page.getByTestId('dashboard-sales-total')).toContainText('4 válido(s)');
    await expect(page.getByTestId('orders-kanban-board')).toContainText('Mariana Costa');
  });

  test('2. Aba WhatsApp limpa sob a FloatingTopPill: zero "Sofia", zero overflow horizontal e simulação real com Pix', async ({
    page,
  }) => {
    fs.mkdirSync(PRINTS_DIR, { recursive: true });
    fs.mkdirSync(TRAILER_PRINTS_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupPhase3MockEnvironment(page);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByTestId('top-pill-tab-whatsapp').click();

    await expect(page.getByTestId('editorial-top-pill')).toBeVisible();
    await expect(page.getByTestId('wpp-channel-section')).toBeVisible();

    const visibleText = await page.evaluate(() => document.body.innerText);
    expect(visibleText).not.toContain('Sofia');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(overflow).toBe(true);

    // Simula atendimento de compra com Pix Copia-e-Cola para capturar os takes 10, 11 e 12 do trailer
    await page.getByTestId('wpp-mode-simulator-btn').click();
    await page.screenshot({
      path: path.join(TRAILER_PRINTS_DIR, 'take_10_whatsapp_catalog_trigger.png'),
      fullPage: false,
    });

    await page.getByTestId('wpp-sofia-test-input').fill('Oi! Tem a Cesta Café Artesanal para entrega hoje no Pix?');
    await page.getByTestId('wpp-sofia-test-send').click();
    await expect(page.getByTestId('wpp-sofia-test-output')).toBeVisible();
    await expect(page.getByTestId('wpp-sofia-test-output')).toContainText('R$ 189,90');
    await expect(page.getByTestId('wpp-sofia-test-output')).toContainText('financeiro@papelaria.com.br');

    await page.screenshot({
      path: path.join(PRINTS_DIR, 'phase3_whatsapp_clean.png'),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(TRAILER_PRINTS_DIR, 'take_11_whatsapp_pix_reply.png'),
      fullPage: false,
    });
  });
});
