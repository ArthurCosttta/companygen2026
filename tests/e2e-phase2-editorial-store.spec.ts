import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ARTIFACT_PRINTS_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_phase2';
const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '77777777-7777-4777-8777-777777777777';

function loadValidPngAssetBuffer(): Buffer {
  const realAsset = path.resolve(
    process.cwd(),
    'public/brand/illustrations/cg-illustration-welcome-001.png',
  );
  if (fs.existsSync(realAsset)) {
    return fs.readFileSync(realAsset);
  }
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=',
    'base64',
  );
}

function buildRichFormulaV9Doc(storeName: string, heroUrl: string) {
  return {
    version: '9.0',
    storeIdentityId: 'papelaria-editorial',
    generatedBy: 'glm-atomic-v3',
    modelUsed: 'zai-org/GLM-5.3',
    designTokens: {
      accent: '#2563EB',
      accentDeep: '#1D4ED8',
      surface: '#FFFFFF',
      surfaceAlt: '#F8FAFC',
      card: '#FFFFFF',
      ink: '#09090B',
      inkMuted: '#475569',
      footerBg: '#09090B',
      fontStyle: 'editorial_serif',
      radiusPx: 14,
    },
    sections: [
      {
        id: 'sec_header',
        type: 'HeaderNav',
        config: {
          ctaLabel: 'Falar no WhatsApp',
          showSearch: true,
          showBag: true,
          links: [
            { label: 'Catálogo', href: '#catalogo' },
            { label: 'Destaques', href: '#destaques' },
          ],
        },
      },
      {
        id: 'sec_hero',
        type: 'HeroSection',
        imageSlotId: 'hero_main',
        config: {
          variant: 'split',
          eyebrow: 'EDICAO ARTESANAL',
          title: `${storeName} · Cestas & Presentes com Entrega Hoje`,
          subtitle:
            'Kits presenteáveis, cadernos em papel pólen 90g e cestas de café da manhã com pagamento instantâneo no Pix.',
          primaryCta: { label: 'Explorar Catálogo', href: '#catalogo' },
          secondaryCta: { label: 'Chamar no WhatsApp', action: 'whatsapp.send_summary' },
          imageUrl: heroUrl,
          imageFit: 'cover',
        },
      },
      {
        id: 'sec_highlights',
        type: 'HighlightsGrid',
        config: {
          title: 'Mais Pedidos',
          subtitle: 'Curadoria pronta para envio imediato.',
          columns: 2,
          cards: [
            {
              eyebrow: 'KITS & CESTAS',
              title: 'Cesta Café Artesanal Manhã',
              description: 'Café especial, bloco kraft e fita natural.',
              ctaLabel: 'Ver Kit',
              href: '#catalogo',
              imageUrl: heroUrl,
            },
            {
              eyebrow: 'CADERNOS',
              title: 'Caderno Espiral Capa Kraft A5',
              description: 'Papel pólen 90g de alta gramatura.',
              ctaLabel: 'Ver Caderno',
              href: '#catalogo',
              imageUrl: heroUrl,
            },
          ],
        },
      },
      {
        id: 'sec_catalog',
        type: 'CatalogGrid',
        config: {
          title: 'Catálogo Completo',
          subtitle: 'Monte sua sacola e finalize direto no WhatsApp.',
          itemActionLabel: 'Adicionar',
          emptyImageMode: 'neutral_gray',
        },
      },
      {
        id: 'sec_faq',
        type: 'ContextualFaq',
        config: {
          title: 'Dúvidas Frequentes',
          items: [
            {
              q: 'Aceita pagamento no Pix?',
              a: 'Sim, código Pix copia-e-cola gerado automaticamente ao fechar a sacola.',
            },
          ],
        },
      },
      {
        id: 'sec_closing',
        type: 'ClosingScheduleSplit',
        config: {
          eyebrow: 'ATENDIMENTO',
          title: 'Atendimento direto no WhatsApp',
          subtitle: 'Tire dúvidas e combine sua entrega.',
          slots: ['Manhã (09h–12h)', 'Tarde (13h–18h)'],
          whatsappHeading: 'Atendimento imediato',
          whatsappSubtext: 'Confirmação automática e chave Pix.',
          ctaLabel: 'Falar no WhatsApp',
          whatsappMessageTemplate: 'Olá! Gostaria de finalizar meu pedido.',
          imageUrl: heroUrl,
        },
      },
    ],
    footer: {
      columns: [],
      copyright: `${storeName} · Todos os direitos reservados`,
    },
  };
}

function buildEditorialProfileState() {
  const assetBase = `/api/store-molde/${TEST_USER_ID}/assets/generated`;
  const heroUrl = `${assetBase}/hero_main.png`;
  const products = [
    {
      id: 'prod_1',
      sku: 'PAP-001',
      name: 'Cesta Café Artesanal Manhã',
      category: 'Kits & Cestas',
      description: 'Cesta artesanal com café especial e bloco kraft.',
      priceCents: 18990,
      variation: 'Padrão',
      stock: 10,
      stockQty: 10,
      active: true,
      imageUrl: `${assetBase}/prod_1.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_2',
      sku: 'PAP-002',
      name: 'Caderno Espiral Capa Kraft A5',
      category: 'Cadernos',
      description: 'Papel pólen 90g pontilhado.',
      priceCents: 4990,
      variation: 'A5',
      stock: 24,
      stockQty: 24,
      active: true,
      imageUrl: `${assetBase}/prod_2.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_3',
      sku: 'PAP-003',
      name: 'Kit Escrita Executiva Preto Matte',
      category: 'Escrita',
      description: 'Caneta metálica e estojo rígido.',
      priceCents: 8900,
      variation: 'Preto Matte',
      stock: 15,
      stockQty: 15,
      active: true,
      imageUrl: `${assetBase}/prod_3.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_4',
      sku: 'PAP-004',
      name: 'Planner Semanal Mesa Minimalista',
      category: 'Organização',
      description: '52 semanas datáveis para foco diário.',
      priceCents: 6490,
      variation: '52 Folhas',
      stock: 18,
      stockQty: 18,
      active: true,
      imageUrl: `${assetBase}/prod_4.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_5',
      sku: 'PAP-005',
      name: 'Caixa Presente Lacrada + Fita',
      category: 'Embalagens',
      description: 'Caixa rígida revestida com fita crua.',
      priceCents: 3490,
      variation: 'Média',
      stock: 30,
      stockQty: 30,
      active: true,
      imageUrl: `${assetBase}/prod_5.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_6',
      sku: 'PAP-006',
      name: 'Conjunto Blocos Adesivos Terracota',
      category: 'Papelaria Fina',
      description: 'Papel 120g de alta aderência.',
      priceCents: 3990,
      variation: 'Pack 4 un.',
      stock: 28,
      stockQty: 28,
      active: true,
      imageUrl: `${assetBase}/prod_6.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod_7',
      sku: 'PAP-007',
      name: 'Carimbo Personalizado Madeira',
      category: 'Sob Encomenda',
      description: 'Gravação a laser para embalagens.',
      priceCents: 7500,
      variation: '6x4cm',
      stock: 0,
      stockQty: 0,
      active: false,
      imageUrl: `${assetBase}/prod_7.png`,
      approvedAsset: true,
      updatedAt: new Date().toISOString(),
    },
  ];

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
      description: 'Papelaria criativa e presentes artesanais.',
      hours: 'Seg a Sáb · 09h às 19h',
      deliveryModes: ['pickup', 'local'],
    },
    whatsapp: {
      connected: false,
      phoneE164: '5511987654321',
      displayPhone: '(11) 98765-4321',
    },
    payment: {
      pixKey: 'vendas@papelaria.com.br',
      pixDiscountPercent: 5,
      acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
      paymentPolicy: 'pix_discount',
    },
    delivery: {
      pickupEnabled: true,
      deliveryEnabled: true,
      defaultFeeCents: 1200,
    },
    brand: {
      logoUrl: '',
      heroImageUrl: heroUrl,
      primaryColor: '#09090B',
      accentColor: '#2563EB',
      fontStyle: 'editorial_serif',
      visualMood: 'boutique',
    },
    catalog: { products },
    publishedStore: {
      published: true,
      publicSlug: 'papelaria',
      sourceRevision: 4,
    },
    storeLayout: {
      formulasIr: buildRichFormulaV9Doc('Papelaria', heroUrl),
    },
  };
}

async function setupEditorialRoutes(page: import('@playwright/test').Page) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'phase2.e2e@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Papelaria' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'phase2-token',
    refresh_token: 'phase2-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  let savedProfile = buildEditorialProfileState();
  let revision = 4;
  const pngBuffer = loadValidPngAssetBuffer();

  await page.addInitScript(
    ({ key, val }) => {
      localStorage.setItem(key, JSON.stringify(val));
      localStorage.setItem('cg_theme', 'light');
    },
    { key: SUPABASE_STORAGE_KEY, val: session },
  );

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: user }),
  );

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;

    if (pathname.startsWith('/api/store-molde/') && pathname.includes('/assets/')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pngBuffer,
      });
    }

    if (pathname === '/api/profile') {
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}') as { profile?: typeof savedProfile };
        if (body.profile) {
          savedProfile = {
            ...savedProfile,
            ...body.profile,
          };
        }
        revision += 1;
      }
      return route.fulfill({ json: { revision, provider: 'local', profile: savedProfile } });
    }

    if (pathname === '/api/dashboard') {
      return route.fulfill({
        json: {
          ok: true,
          dashboard: {
            sourceRevision: revision,
            businessName: savedProfile.business.name,
            whatsappConnected: false,
            displayPhone: '(11) 98765-4321',
            visitsTotal: 142,
            visitsByDay: {},
            ordersCount: 12,
            salesCents: 227880,
            messagesCount: 38,
            catalogCount: savedProfile.catalog.products.length,
            stockUnits: 125,
            recentOrders: [],
          },
        },
      });
    }

    if (pathname === '/api/credits/balance') {
      return route.fulfill({ json: { ok: true, balance: 250, isAdmin: false, banned: false } });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({ json: { conectado: false, status: 'Desconectado', templates: [] } });
    }

    if (pathname === '/api/whatsapp/notifications') {
      return route.fulfill({ json: { ok: true, notifications: [], waitingHumanCount: 0 } });
    }

    return route.fulfill({ json: { ok: true } });
  });
}

test.describe('FASE 2 — Minha Loja Editorial (Imagem 1) + Paleta Cmd+K + Vitrine Real', () => {
  test.beforeAll(() => {
    fs.mkdirSync(path.resolve(ARTIFACT_PRINTS_DIR), { recursive: true });
  });

  test('1. Layout Imagem 1 sem Sidebar/Sofia, métricas reais, 5 colunas, imagens carregadas e zero overflow', async ({
    page,
  }) => {
    await setupEditorialRoutes(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('store-editorial-view')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('editorial-top-pill')).toBeVisible();
    await expect(page.getByTestId('top-pill-tab-admin')).toBeVisible();
    await page.getByTestId('editorial-top-pill').screenshot({
      path: `${ARTIFACT_PRINTS_DIR}/top_pill_with_admin_button.png`,
    });
    await expect(page.getByTestId('editorial-hero-strip')).toBeVisible();
    await expect(page.getByTestId('editorial-store-title')).toHaveText('Papelaria');
    await expect(page.getByTestId('editorial-store-status')).toContainText('Online');
    await expect(page.getByTestId('editorial-metric-visitas')).toContainText('142');
    await expect(page.getByTestId('editorial-metric-cliques')).toContainText('38');
    await expect(page.getByTestId('editorial-metric-pedidos')).toContainText('12');
    await expect(page.getByTestId('editorial-bottom-dock')).toBeVisible();

    // Ausência absoluta de Sidebar, simulador fake e "Sofia"
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.getByTestId('split-smartphone-frame')).toHaveCount(0);
    const bodyText = await page.locator('body').innerText();
    expect(/\bSofia\b/i.test(bodyText)).toBe(false);

    // 5 colunas no desktop 1440px e 6 produtos ativos visíveis
    const colCount = await page.getByTestId('editorial-product-grid').evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    expect(colCount).toBe(5);
    await expect(page.locator('[data-testid^="editorial-product-card-"]')).toHaveCount(6);

    // Todas as imagens visíveis carregadas (naturalWidth > 0)
    await expect
      .poll(async () => {
        return page.getByTestId('editorial-product-grid').locator('img').evaluateAll((imgs) =>
          imgs.every((img) => {
            const el = img as HTMLImageElement;
            return el.complete && el.naturalWidth > 0;
          }),
        );
      })
      .toBe(true);

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(desktopOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase2_editorial_desktop.png` });

    // Mobile 390x844 sem corte horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase2_editorial_mobile.png` });
  });

  test('2. Paleta Combobox ⌘K sem roubo de foco (fuzzy matching) + Ciclo Ativos/Pausados/Todos no dock', async ({
    page,
  }) => {
    await setupEditorialRoutes(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('store-editorial-view')).toBeVisible({ timeout: 15000 });

    // Abre ⌘K / Ctrl+K e garante foco no input Combobox
    await page.keyboard.press('Control+k');
    const cmdInput = page.getByTestId('editorial-cmd-input');
    await expect(cmdInput).toBeVisible();
    await expect(cmdInput).toBeFocused();

    // Digita query fuzzy e navega por teclado mantendo DOM focus no input
    await cmdInput.fill('cesta caf');
    await expect(page.getByTestId('editorial-cmd-list')).toContainText(
      'Cesta Café Artesanal Manhã',
    );
    const prevActive = await cmdInput.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    await expect(cmdInput).toBeFocused();
    const nextActive = await cmdInput.getAttribute('aria-activedescendant');
    expect(nextActive).not.toBe(prevActive);

    // Fecha por Escape
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('editorial-cmd-dialog')).toHaveCount(0);

    // Ciclo de filtro do dock: Ativos (6) -> Pausados (1) -> Todos (7) -> Ativos (6)
    const filterBtn = page.getByTestId('dock-filter-toggle');
    await expect(filterBtn).toContainText('Ativos');
    await expect(page.locator('[data-testid^="editorial-product-card-"]')).toHaveCount(6);

    await filterBtn.click();
    await expect(filterBtn).toContainText('Pausados');
    await expect(page.locator('[data-testid^="editorial-product-card-"]')).toHaveCount(1);

    await filterBtn.click();
    await expect(filterBtn).toContainText('Todos');
    await expect(page.locator('[data-testid^="editorial-product-card-"]')).toHaveCount(7);
  });

  test('3. Edição inline do título da loja persiste após page.reload()', async ({ page }) => {
    await setupEditorialRoutes(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('editorial-store-title')).toHaveText('Papelaria', {
      timeout: 15000,
    });

    await page.getByTestId('editorial-store-title').click();
    const titleInput = page.getByTestId('editorial-store-title-input');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Papelaria Criativa');

    const savePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/profile' && res.request().method() === 'PUT',
    );
    await titleInput.press('Enter');
    await savePromise;

    await expect(page.getByTestId('editorial-store-title')).toHaveText('Papelaria Criativa');

    await page.reload();
    await expect(page.getByTestId('editorial-store-title')).toHaveText('Papelaria Criativa', {
      timeout: 15000,
    });
  });

  test('4. Visual Quality Gate TELA 04: Ver Vitrine abre página real v4 (>= 4 seções + imagens OK) e retorna à TELA 03', async ({
    page,
  }) => {
    await setupEditorialRoutes(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('top-pill-open-vitrine')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('top-pill-open-vitrine').click();
    const vitrine = page.getByTestId('vitrine-overlay-persistent');
    await expect(vitrine).toBeVisible({ timeout: 10000 });
    await expect(vitrine).toContainText('Papelaria · Cestas & Presentes com Entrega Hoje');
    expect(await vitrine.locator('section').count()).toBeGreaterThanOrEqual(4);

    await expect
      .poll(async () => {
        return vitrine.locator('img').evaluateAll((imgs) =>
          imgs.length > 0 &&
          imgs.every((img) => {
            const el = img as HTMLImageElement;
            return el.complete && el.naturalWidth > 0;
          }),
        );
      })
      .toBe(true);

    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase2_vitrine_v4.png` });

    // Retorno para TELA 03
    await vitrine.getByRole('button', { name: /Voltar ao Painel/i }).click();
    await expect(page.getByTestId('editorial-hero-strip')).toBeVisible({ timeout: 8000 });
  });
});
