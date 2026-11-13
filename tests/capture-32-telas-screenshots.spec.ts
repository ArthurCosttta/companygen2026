import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const ARTIFACT_DIR =
  'C:\\Users\\arthur\\.gemini\\antigravity\\brain\\11169f73-159b-4308-91e9-7ace60c123e1';

const supabaseUrl = 'https://irahjajgudbdkgggffum.supabase.co';
const storageKey = 'sb-irahjajgudbdkgggffum-auth-token';
const userId = '44444444-4444-4444-4444-444444444444';

function buildSampleQrDataUri(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
      <rect width="180" height="180" fill="#FFFFFF"/>
      <rect x="14" y="14" width="44" height="44" rx="6" fill="none" stroke="#0F172A" stroke-width="8"/>
      <rect x="27" y="27" width="18" height="18" rx="3" fill="#0F172A"/>
      <rect x="122" y="14" width="44" height="44" rx="6" fill="none" stroke="#0F172A" stroke-width="8"/>
      <rect x="135" y="27" width="18" height="18" rx="3" fill="#0F172A"/>
      <rect x="14" y="122" width="44" height="44" rx="6" fill="none" stroke="#0F172A" stroke-width="8"/>
      <rect x="27" y="135" width="18" height="18" rx="3" fill="#0F172A"/>
      <rect x="74" y="22" width="12" height="12" fill="#0F172A"/>
      <rect x="94" y="22" width="12" height="12" fill="#0F172A"/>
      <rect x="74" y="42" width="32" height="12" fill="#0F172A"/>
      <rect x="22" y="74" width="16" height="12" fill="#0F172A"/>
      <rect x="46" y="74" width="24" height="16" fill="#0F172A"/>
      <rect x="78" y="74" width="24" height="24" rx="4" fill="#2563EB"/>
      <rect x="110" y="74" width="20" height="14" fill="#0F172A"/>
      <rect x="138" y="74" width="24" height="14" fill="#0F172A"/>
      <rect x="22" y="96" width="34" height="14" fill="#0F172A"/>
      <rect x="114" y="98" width="48" height="12" fill="#0F172A"/>
      <rect x="74" y="114" width="18" height="24" fill="#0F172A"/>
      <rect x="102" y="122" width="26" height="16" fill="#0F172A"/>
      <rect x="138" y="122" width="24" height="40" fill="#0F172A"/>
      <rect x="74" y="146" width="52" height="16" fill="#0F172A"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function shotPath(index: number): string {
  const padded = String(index).padStart(2, '0');
  return path.join(ARTIFACT_DIR, `print_tela_${padded}.png`);
}

async function capture(page: Page, index: number) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: shotPath(index), fullPage: false });
}

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
        segment: 'Moda Feminina',
        address: 'Rua das Flores, 240 - Centro',
        hours: 'Seg a Sáb · 09h às 19h',
        cnpj: '',
      },
      whatsapp: {
        connected: false,
        phoneE164: '',
        displayPhone: '',
        attendantName: 'Clara',
        welcomeMessage: 'Olá! Seja bem-vindo(a) ao Ateliê Aurora. Como posso ajudar?',
      },
      payment: {
        pixKey: '',
        pixDiscountPercent: 5,
        acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
      },
      delivery: {
        pickupEnabled: true,
        deliveryEnabled: true,
        defaultFeeCents: 1200,
        freeOverCents: 25000,
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
        publicSlug: 'atelie-aurora',
        sourceRevision: 1,
      },
    },
  };
}

test('Capture all 32 screens (print_tela_01..32.png) at 1440x900', async ({ browser }) => {
  test.setTimeout(120000);

  // =========================================================================
  // PART 1: TELAS 01..03 (AuthFlowView — Unauthenticated ESTADO_0)
  // =========================================================================
  const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const authPage = await authContext.newPage();
  await authPage.goto('/');

  // TELA 01: Login
  await expect(authPage.getByRole('heading', { name: 'Entrar no CompanyGen' })).toBeVisible({
    timeout: 15000,
  });
  await capture(authPage, 1);

  // TELA 02: Cadastro
  await authPage.getByRole('button', { name: 'Criar conta da minha loja' }).click();
  await expect(
    authPage.getByRole('heading', { name: 'Comece a Vender Online em Minutos' }),
  ).toBeVisible();
  await capture(authPage, 2);

  // TELA 03: Recuperar Senha (ModalContainer)
  await authPage.getByRole('button', { name: /Já tenho conta/i }).click();
  await expect(authPage.getByRole('heading', { name: 'Entrar no CompanyGen' })).toBeVisible();
  await authPage.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(authPage.getByRole('heading', { name: 'Recuperar Acesso à Conta' })).toBeVisible();
  await authPage.locator('#reset-password-email').fill('lojista@atelieaurora.com.br');
  await capture(authPage, 3);
  await authContext.close();

  // =========================================================================
  // PART 2: TELAS 04..32 (Authenticated Funnel E1 -> E4 & All Tabs/Modals)
  // =========================================================================
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'lojista@atelieaurora.com.br',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Ana Souza' },
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

  let profileState = createInitialProfileState();
  const orders: Array<Record<string, unknown>> = [];
  let templates = [
    {
      id: 'tpl-1',
      titulo: 'Boas-vindas com Link da Vitrine',
      mensagem: 'Olá {cliente}, seja bem-vindo(a)! Confira nossas peças: {link}',
    },
    {
      id: 'tpl-2',
      titulo: 'Envio de Chave Pix',
      mensagem: 'Segue nossa chave Pix para pagamento rápido: {pix}',
    },
    {
      id: 'tpl-3',
      titulo: 'Pedido Pronto para Retirada',
      mensagem: 'Seu pedido na {loja} já está separado e pronto para retirada!',
    },
  ];

  const qrSvgUri = buildSampleQrDataUri();
  const whatsappState = {
    conectado: false,
    status: 'Aguardando leitura do QR Code',
    numeroBot: '',
    qr: qrSvgUri,
    persistencia: { provider: 'supabase' },
    configLoja: { nomeLoja: 'Ateliê Aurora', nomeAtendente: 'Clara', onboardingConcluido: true },
    config: {
      botAtivo: false,
      enviarFotoAutomatica: true,
      ignorarArquivadas: true,
      somenteNovas: true,
      responderAudioComAudio: true,
      delayHumanoMs: 2000,
    },
    conversas: [],
    contatos: [],
    skus: [],
    documentos: [],
    templates,
  };

  function buildDashboard() {
    const validOrders = orders.filter((o) => o.status !== 'cancelado');
    const salesCents = validOrders.reduce((acc, o) => acc + Number(o.total_cents || 0), 0);
    return {
      sourceRevision: profileState.revision,
      businessName: profileState.profile.business.name || 'Ateliê Aurora',
      whatsappConnected: profileState.profile.whatsapp.connected,
      displayPhone: profileState.profile.whatsapp.displayPhone,
      visitsTotal: 42,
      visitsByDay: {},
      ordersCount: validOrders.length,
      salesCents,
      messagesCount: 8,
      catalogCount: profileState.profile.catalog.products.length,
      stockUnits: profileState.profile.catalog.products.reduce(
        (acc, p) => acc + Number(p.stock || 0),
        0,
      ),
      recentOrders: orders,
    };
  }

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/workspace') {
      return route.fulfill({
        json:
          request.method() === 'GET'
            ? { revision: 0, data: { campaigns: [] }, provider: 'supabase' }
            : { revision: 1, provider: 'supabase' },
      });
    }
    if (pathname === '/api/profile') {
      if (request.method() === 'GET') {
        return route.fulfill({ json: profileState });
      }
      const body = request.postDataJSON() as {
        revision: number;
        profile: typeof profileState.profile;
        publish?: boolean;
      };
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
        const totalCents = Number(payload.totalCents || 14990);
        const order = {
          id: `ord-${orders.length + 1}`,
          order_ref: `PED-${100 + orders.length + 1}`,
          customer_jid: String(payload.customerJid || ''),
          customer_name: String(payload.customerName || 'Cliente'),
          items:
            Array.isArray(payload.items) && payload.items.length > 0
              ? (payload.items as Array<Record<string, unknown>>).map((it) => ({
                  sku: String(it.sku || 'AVULSO'),
                  name: String(it.name || it.customItemName || 'Item'),
                  variation: String(it.variation || 'Padrão'),
                  quantity: Number(it.quantity || it.qty || 1),
                  unitPriceCents: Number(it.unitPriceCents || 14990),
                  lineTotalCents:
                    Number(it.unitPriceCents || 14990) * Number(it.quantity || it.qty || 1),
                }))
              : [
                  {
                    sku: 'AVULSO',
                    name: String(payload.customItemName || 'Venda Manual'),
                    variation: 'Padrão',
                    quantity: 1,
                    unitPriceCents: totalCents,
                    lineTotalCents: totalCents,
                  },
                ],
          subtotal_cents: totalCents,
          shipping_cents: 0,
          total_cents: totalCents,
          payment_method: String(payload.paymentMethod || 'pix'),
          delivery_address: {},
          status: String(
            payload.status || (payload.markAsPaid ? 'confirmado' : 'aguardando_pagamento'),
          ),
          source_revision: profileState.revision,
          created_at: now,
          updated_at: now,
        };
        orders.unshift(order);
        return route.fulfill({ status: 201, json: { ok: true, order } });
      }
      if (request.method() === 'PATCH') {
        const payload = request.postDataJSON() as { orderRef: string; status: string };
        const target = orders.find((o) => o.order_ref === payload.orderRef);
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
      const item = {
        id: `tpl-${templates.length + 1}`,
        titulo: body.titulo,
        mensagem: body.mensagem,
      };
      templates = [...templates, item];
      return route.fulfill({ json: { ok: true, templates } });
    }
    if (pathname === '/api/whatsapp/api/sessao/connect' || pathname === '/api/whatsapp/api/sessao/reset') {
      return route.fulfill({ json: { ok: true, qr: qrSvgUri } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  const page = await context.newPage();
  await page.goto('/');

  // TELA 04: WelcomeModal (ESTADO_1)
  await expect(page.getByText('Boas-vindas ao CompanyGen!')).toBeVisible({ timeout: 15000 });
  await capture(page, 4);

  // TELA 05: Wizard Express · Passo 1
  await page.getByRole('button', { name: /Configurar Minha Loja Agora/i }).click();
  await page.getByLabel('Nome da Sua Loja *').fill('Ateliê Aurora');
  await page.getByLabel('WhatsApp de Pedidos (com DDD) *').fill('11987654321');
  await capture(page, 5);

  // Avança para Passo 2 para salvar Identidade da Loja e então fechar rascunho para capturar ESTADO_2
  await page.getByRole('button', { name: 'Salvar e Ir para Produto' }).click();
  await expect(page.getByLabel('Nome do Produto *')).toBeVisible();
  await page.getByLabel('Nome do Produto *').fill('Vestido Linho Midi');
  await page.getByLabel('Preço de Venda (R$) *').fill('149,90');

  // TELA 07: Wizard Express · Passo 2 (preenchido)
  await capture(page, 7);

  // Fecha via Escape -> Salvar Rascunho e Sair -> ESTADO_2 (TELA 06)
  await page.keyboard.press('Escape');
  const saveDraftBtn = page.getByRole('button', { name: 'Salvar Rascunho e Sair' });
  if (await saveDraftBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveDraftBtn.click();
  }
  await expect(page.getByRole('button', { name: 'Cadastrar Primeiro Produto' })).toBeVisible({
    timeout: 10000,
  });
  await capture(page, 6);

  // Reabre Passo 2 para salvar o 1º produto e ir ao Passo 3
  await page.getByRole('button', { name: 'Cadastrar Primeiro Produto' }).click();
  await expect(page.getByLabel('Nome do Produto *')).toBeVisible();
  await page.getByLabel('Nome do Produto *').fill('Vestido Linho Midi');
  await page.getByLabel('Preço de Venda (R$) *').fill('149,90');
  await page.getByRole('button', { name: 'Salvar Produto e Continuar' }).click();

  // TELA 09: Wizard Express · Passo 3 (Pix e Publicação)
  await expect(page.getByLabel('Chave Pix da Loja (opcional)')).toBeVisible();
  await page.getByLabel('Chave Pix da Loja (opcional)').fill('11987654321');
  await capture(page, 9);

  // Fecha Wizard na Etapa 3 -> ESTADO_3 Checklist Guiado (TELA 10)
  await page.keyboard.press('Escape');
  if (await page.getByRole('button', { name: 'Salvar Rascunho e Sair' }).isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole('button', { name: 'Salvar Rascunho e Sair' }).click();
  }
  await expect(page.getByTestId('open-compile-progress')).toBeVisible({ timeout: 10000 });
  await capture(page, 10);

  // TELA 11: Modal Compilação e Geração V5
  await page.getByTestId('open-compile-progress').click();
  await expect(page.getByRole('heading', { name: 'Compilando sua Vitrine Online' })).toBeVisible();
  await capture(page, 11);

  // TELA 12: Parabéns! Sua loja foi criada
  await page.getByRole('button', { name: 'Avançar para Ativação' }).click();
  await expect(page.getByText('Parabéns! Sua loja foi criada')).toBeVisible({ timeout: 10000 });
  await capture(page, 12);

  // Avança para o Catálogo (ESTADO_4)
  await page.getByRole('button', { name: 'Continuar gerenciando produtos' }).click();
  await expect(page.getByText('Vestido Linho Midi').first()).toBeVisible();

  // TELA 20: Drawer Cadastrar Novo Produto (+ adiciona 2º produto para enriquecer a tabela)
  await page.getByRole('button', { name: 'Cadastrar Novo Produto' }).click();
  await expect(page.locator('#product-name-input')).toBeVisible();
  await page.locator('#product-name-input').fill('Bolsa Transversal Couro');
  await page.locator('#product-price-input').fill('189,90');
  await capture(page, 20);
  await page.getByRole('button', { name: 'Salvar e Publicar no Catálogo' }).click();
  await expect(page.getByText('Bolsa Transversal Couro').first()).toBeVisible({ timeout: 10000 });

  // TELA 13: Catálogo Hub Principal ESTADO_4 (com 2 produtos e KPIs)
  await capture(page, 13);

  // TELA 08: Modal Importar Planilha de Produtos (.CSV)
  await page.getByTestId('open-import-spreadsheet').click();
  await expect(page.getByRole('heading', { name: 'Importar Planilha de Produtos' })).toBeVisible();
  await capture(page, 8);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // TELA 15: Estúdio de Prompts IA
  await page.getByRole('button', { name: 'Estúdio de Prompts IA' }).click();
  await expect(
    page.getByRole('heading', { name: 'Estúdio de Prompts para Fotos IA' }),
  ).toBeVisible();
  await capture(page, 15);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  // TELA 16: Baixar Loja ZIP
  await page.getByRole('button', { name: 'Baixar Loja ZIP' }).click();
  await expect(
    page.getByRole('button', { name: /Baixar Arquivo loja_completa\.zip Agora/i }),
  ).toBeVisible();
  await capture(page, 16);
  await page.keyboard.press('Escape');

  // TELA 17: Busca Sem Resultados no Catálogo (Empty State)
  const searchInput = page.getByLabel('Buscar produtos no catálogo');
  await searchInput.fill('Produto Inexistente XYZ');
  await expect(page.getByText('Nenhum produto encontrado')).toBeVisible();
  await capture(page, 17);
  await searchInput.fill('');

  // TELA 21: Editar Produto existente (ProductEditorDrawer)
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await expect(page.locator('#product-name-input')).toBeVisible();
  await capture(page, 21);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  if (await page.getByRole('button', { name: /Descartar/i }).isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.getByRole('button', { name: /Descartar/i }).click();
  }

  // TELA 22: Modal Confirmar Exclusão de Produto
  await page.locator('button[aria-label^="Excluir "]').first().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await capture(page, 22);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click();

  // TELA 23: Reajuste de Preços em Massa
  await page.getByRole('button', { name: 'Reajustar Preços' }).click();
  await expect(page.getByRole('heading', { name: 'Reajuste de Preços em Massa' })).toBeVisible();
  await capture(page, 23);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // TELA 14, 18, 19: Preview da Vitrine Pública, Detalhe do Produto e Sacola/Checkout
  await page.getByTestId('topbar-preview-vitrine').click();
  await expect(page.getByText('Vestido Linho Midi').first()).toBeVisible();
  await capture(page, 14);

  // TELA 18: Detalhe do Produto na Vitrine
  await page.getByRole('button', { name: 'Comprar' }).first().click();
  await expect(page.getByRole('button', { name: /Adicionar à Sacola/i })).toBeVisible();
  await capture(page, 18);

  // TELA 19: Sacola de Compras & Checkout
  await page.getByRole('button', { name: /Adicionar à Sacola/i }).click();
  await expect(page.getByRole('dialog', { name: /Sua Sacola de Compras/i })).toBeVisible();
  await page.locator('#checkout-customer-name').fill('Marina Silva');
  await page.locator('#checkout-customer-phone').fill('(11) 99988-7766');
  await capture(page, 19);

  // Submete pedido para alimentar TELA 27/29 e retorna ao painel
  await page.getByRole('button', { name: /Finalizar Pedido e Enviar no WhatsApp/i }).click();
  await expect(page.getByRole('button', { name: 'Voltar ao Painel' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Voltar ao Painel' }).click();

  // Navegação por abas
  const desktopNav = page.getByRole('navigation', { name: 'Navegação principal' });

  // TELA 24, 25, 26: Aba WhatsApp
  await desktopNav.getByRole('button', { name: 'WhatsApp' }).click();
  await expect(page.getByText('Conecte o WhatsApp da sua empresa')).toBeVisible({ timeout: 10000 });
  if (await page.getByText('QR Code expirado').isVisible({ timeout: 500 }).catch(() => false)) {
    await page.getByRole('button', { name: /QR Expirado\. Clique para renovar/i }).click();
  }
  await capture(page, 24);

  await page.getByRole('button', { name: /Ver Respostas Rápidas da Loja/i }).click();
  await expect(page.getByText('Boas-vindas com Link da Vitrine').first()).toBeVisible();
  await capture(page, 25);

  await page.getByRole('button', { name: 'Criar nova mensagem' }).click();
  await expect(page.getByRole('heading', { name: 'Nova Resposta Rápida' })).toBeVisible();
  await page.locator('#qr-title').fill('Chave Pix com 5% de Desconto');
  await page
    .locator('#qr-body')
    .fill('Olá {cliente}! Pagando no Pix ({pix}) você garante 5% de desconto na {loja}.');
  await capture(page, 26);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar painel' }).click();

  // TELA 27, 28, 29: Aba Pedidos e Vendas
  await desktopNav.getByRole('button', { name: 'Pedidos' }).click();
  await expect(page.getByText('Marina Silva').first()).toBeVisible({ timeout: 10000 });
  await capture(page, 27);

  await page.getByRole('button', { name: /Registrar Venda Manual/i }).first().click();
  await page.locator('#manual-sale-customer-name').fill('Maria Balcão');
  await page.locator('#manual-sale-amount').fill('110,00');
  await capture(page, 28);
  await page.getByRole('button', { name: /Salvar Venda e Atualizar Faturamento/i }).click();
  await expect(page.getByText('Maria Balcão').first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Detalhes', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capture(page, 29);
  await page.keyboard.press('Escape');

  // TELA 30, 31, 32: Aba Ajustes
  await desktopNav.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes da Loja' })).toBeVisible();
  await capture(page, 30);

  await page.getByRole('button', { name: 'Alterar Senha' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Alterar Senha' }).click();
  await expect(page.locator('#pwd-current')).toBeVisible();
  await capture(page, 31);
  await page.getByRole('button', { name: 'Fechar janela' }).click();

  await page.getByRole('button', { name: 'Sair da Conta' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Sair da Conta' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await capture(page, 32);

  await context.close();
});
