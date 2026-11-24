import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ARTIFACT_PRINTS_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_phase1';
const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '66666666-6666-4666-8666-666666666666';

function samplePngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=',
    'base64',
  );
}

function buildRichFormulaV9Fixture(storeName: string, heroUrl: string) {
  return {
    version: '9.0',
    storeIdentityId: 'papelaria-test',
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
      fontStyle: 'modern_sans',
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
          eyebrow: 'COLEÇÃO ATUALIZADA',
          title: `${storeName} · Kits & Presentes Artesanais`,
          subtitle:
            'Cestas de café, cadernos em papel pólen e presentes prontos para envio com pagamento direto no Pix.',
          primaryCta: { label: 'Ver Catálogo', href: '#catalogo' },
          secondaryCta: { label: 'Pedir pelo WhatsApp', action: 'whatsapp.send_summary' },
          imageUrl: heroUrl,
          imageFit: 'cover',
        },
      },
      {
        id: 'sec_highlights',
        type: 'HighlightsGrid',
        config: {
          title: 'Mais Pedidos da Semana',
          subtitle: 'Seleção de alta procura pronta para entrega.',
          columns: 2,
          cards: [
            {
              eyebrow: 'KITS & CESTAS',
              title: 'Cesta Café Artesanal Manhã',
              description: 'Café especial, bloco kraft e acabamento artesanal.',
              ctaLabel: 'Ver Kit',
              href: '#catalogo',
              imageUrl: heroUrl,
            },
            {
              eyebrow: 'ESCRITA',
              title: 'Kit Escrita Executiva Preto Matte',
              description: 'Caneta rollerball metálica com estojo rígido.',
              ctaLabel: 'Ver Kit',
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
          subtitle: 'Adicione à sacola e finalize diretamente no WhatsApp.',
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
              q: 'Como funciona o pagamento no Pix?',
              a: 'Você gera o código copia-e-cola ao fechar a sacola e recebe confirmação automática no WhatsApp.',
            },
            {
              q: 'Qual o prazo de envio?',
              a: 'Pedidos confirmados até 15h seguem no mesmo dia útil.',
            },
          ],
        },
      },
      {
        id: 'sec_closing',
        type: 'ClosingScheduleSplit',
        config: {
          eyebrow: 'ATENDIMENTO DIRETO',
          title: 'Fale com nossa equipe no WhatsApp',
          subtitle: 'Tire dúvidas sobre personalização, kits corporativos e entregas expressas.',
          slots: ['Manhã (09h–12h)', 'Tarde (13h–18h)'],
          whatsappHeading: 'Atendimento em tempo real',
          whatsappSubtext: 'Resposta rápida com catálogo e chave Pix.',
          ctaLabel: 'Chamar no WhatsApp',
          whatsappMessageTemplate: 'Olá! Vim pela vitrine e gostaria de finalizar meu pedido.',
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

function createInitialMockProfile() {
  return {
    schemaVersion: 1,
    onboarding: {
      whatsappConnected: false,
      whatsappConfirmed: false,
      fichaCompleted: false,
      storeGenerated: false,
      preferredTrack: 'full_guided',
      completedFirstSimulatedOrder: false,
    },
    business: {
      name: '',
      segment: 'Geral',
      businessModel: 'produtos',
      description: '',
      hours: 'Seg a Sáb · 09h às 19h',
      deliveryModes: ['pickup', 'local'],
    },
    whatsapp: {
      connected: false,
      phoneE164: '',
      displayPhone: '',
    },
    payment: {
      pixKey: '',
      pixDiscountPercent: 0,
      acceptedMethods: ['pix', 'credit_card', 'debit_card', 'cash'],
      paymentPolicy: 'pix_discount',
    },
    delivery: {
      pickupEnabled: true,
      deliveryEnabled: true,
      defaultFeeCents: 0,
    },
    brand: {
      logoUrl: '',
      primaryColor: '#09090B',
      accentColor: '#2563EB',
      fontStyle: 'modern_sans',
      visualMood: 'boutique',
    },
    catalog: {
      products: [] as Array<Record<string, unknown>>,
    },
    publishedStore: {
      published: false,
      publicSlug: 'papelaria-criativa',
      sourceRevision: 1,
    },
    storeLayout: {},
  };
}

async function setupSessionAndRoutes(
  page: import('@playwright/test').Page,
  options: {
    generateFullMode: 'success' | 'credits_402';
  },
) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'phase1.e2e@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Nova Loja' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'phase1-token',
    refresh_token: 'phase1-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  let savedProfile = createInitialMockProfile();
  let revision = 1;
  const generateFullRequests: Array<Record<string, unknown>> = [];
  const jobPolls: string[] = [];
  let pollCounter = 0;

  const jobStages = [
    { stage: 'reading_catalog', label: 'Lendo catálogo' },
    { stage: 'designing_experience', label: 'Desenhando experiência' },
    { stage: 'generating_images', label: 'Criando fotos' },
    { stage: 'hydrating_blueprint', label: 'Montando seções atômicas' },
    { stage: 'publishing', label: 'Publicando página' },
    { stage: 'completed', label: 'Página no ar' },
  ];

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
        body: samplePngBuffer(),
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

    if (pathname === '/api/credits/balance') {
      return route.fulfill({
        json: {
          ok: true,
          balance: options.generateFullMode === 'credits_402' ? 5 : 250,
          isAdmin: false,
          banned: false,
        },
      });
    }

    if (pathname.startsWith('/api/store-molde/job/')) {
      const jobId = decodeURIComponent(pathname.slice('/api/store-molde/job/'.length));
      jobPolls.push(jobId);
      const current = jobStages[Math.min(pollCounter, jobStages.length - 1)];
      pollCounter += 1;
      return route.fulfill({
        json: {
          jobId,
          stage: current.stage,
          label: current.label,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    if (pathname === '/api/store-molde/generate-full' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
      generateFullRequests.push(body);

      if (options.generateFullMode === 'credits_402') {
        return route.fulfill({
          status: 402,
          json: {
            ok: false,
            status: 402,
            error: 'Créditos insuficientes para gerar sua vitrine completa (30 cr necessários).',
          },
        });
      }

      await new Promise((r) => setTimeout(r, 900));
      const heroAssetUrl = `/api/store-molde/${TEST_USER_ID}/assets/generated/hero_main.png`;
      const richDoc = buildRichFormulaV9Fixture(
        String((body.profile as { business?: { name?: string } })?.business?.name || 'Papelaria'),
        heroAssetUrl,
      );

      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          formulasIr: richDoc,
          imageJobs: [
            {
              slotId: 'hero_main',
              targetSectionId: 'sec_hero',
              role: 'hero',
              status: 'completed',
              assetUrl: heroAssetUrl,
            },
          ],
          writtenFiles: ['index.html', 'styles.css', 'app.js'],
          creditsCharged: 30,
          balanceAfter: 220,
          modelUsed: 'zai-org/GLM-5.3',
          generatedBy: 'glm-atomic-v3',
        },
      });
    }

    if (pathname === '/api/hunt') {
      return route.fulfill({ json: { success: true, items: [] } });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({ json: { conectado: false, status: 'Desconectado', templates: [] } });
    }

    if (pathname === '/api/whatsapp/notifications') {
      return route.fulfill({ json: { ok: true, notifications: [], waitingHumanCount: 0 } });
    }

    return route.fulfill({ json: { ok: true } });
  });

  return {
    getSavedProfile: () => savedProfile,
    getGenerateFullRequests: () => generateFullRequests,
    getJobPolls: () => jobPolls,
  };
}

test.describe('FASE 1 — Onboarding Ignição Limpa + Síntese Real Anti-Mock', () => {
  test.beforeAll(() => {
    fs.mkdirSync(path.resolve(ARTIFACT_PRINTS_DIR), { recursive: true });
  });

  test('1. TELA 01 Limpa sem Sidebar/Celular Fake/Sofia + Screenshots Desktop e Mobile', async ({
    page,
  }) => {
    await setupSessionAndRoutes(page, { generateFullMode: 'success' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('ignition-stage')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('ignition-store-input')).toBeVisible();
    await expect(page.getByTestId('ignition-dropzone')).toBeVisible();
    await expect(page.getByTestId('ignition-niche-pill-papelaria')).toBeVisible();
    await expect(page.getByTestId('ignition-whatsapp-input')).toBeVisible();
    await expect(page.getByTestId('ignition-pix-input')).toBeVisible();
    await expect(page.getByTestId('ignition-submit-btn')).toBeVisible();

    // Ausência absoluta do simulador antigo, WelcomeModal, Sidebar e "Sofia"
    await expect(page.getByTestId('split-smartphone-frame')).toHaveCount(0);
    await expect(page.getByTestId('welcome-track-full_guided')).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    const bodyText = await page.locator('body').innerText();
    expect(/\bSofia\b/i.test(bodyText)).toBe(false);

    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(desktopOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase1_ignition_desktop.png` });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase1_ignition_mobile.png` });
  });

  test('2. Bloqueia WhatsApp placeholder (PLACEHOLDER_PHONES) com feedback inline e zero chamadas à API', async ({
    page,
  }) => {
    const tracker = await setupSessionAndRoutes(page, { generateFullMode: 'success' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ignition-niche-pill-papelaria').click();
    await expect(page.getByTestId('ignition-store-input')).toHaveValue('Papelaria');

    await page.getByTestId('ignition-whatsapp-input').fill('11999999999');
    await page.getByTestId('ignition-submit-btn').click();

    await expect(page.getByTestId('ignition-whatsapp-error')).toContainText(
      'Informe um WhatsApp real com DDD',
    );
    expect(tracker.getGenerateFullRequests().length).toBe(0);
  });

  test('3. Fluxo Real Anti-Mock: dispara generate-full + polling /job/:clientJobId e abre Vitrine v4 completa', async ({
    page,
  }) => {
    const tracker = await setupSessionAndRoutes(page, { generateFullMode: 'success' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ignition-niche-pill-papelaria').click();
    await page.getByTestId('ignition-whatsapp-input').fill('11987654321');
    await expect(page.getByTestId('ignition-whatsapp-valid')).toBeVisible();

    await page.getByTestId('ignition-pix-input').fill('vendas@papelaria.com.br');
    await expect(page.getByTestId('ignition-pix-type-badge')).toContainText('E-mail');

    await page.getByTestId('ignition-submit-btn').click();

    // TELA 02 entra com os 6 estágios reais de STORE_MOLDE_JOBS
    await expect(page.getByTestId('synthesis-stage')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('synthesis-stage-reading_catalog')).toBeVisible();
    await expect(page.getByTestId('synthesis-stage-completed')).toBeVisible();

    // Hand-off automático direto para a Vitrine Pública Real (TELA 04)
    await expect(page.getByTestId('vitrine-overlay-persistent')).toBeVisible({ timeout: 15000 });

    const reqs = tracker.getGenerateFullRequests();
    expect(reqs.length).toBe(1);
    expect(reqs[0].useGlm).toBe(true);
    expect(reqs[0].generateImages).toBe(true);
    expect(reqs[0].maxImages).toBe(5);
    expect(typeof reqs[0].clientJobId).toBe('string');
    expect(String(reqs[0].clientJobId).length).toBeGreaterThan(5);

    expect(tracker.getJobPolls().length).toBeGreaterThanOrEqual(1);
    expect(tracker.getJobPolls()[0]).toBe(reqs[0].clientJobId);

    const saved = tracker.getSavedProfile();
    expect(saved.publishedStore.published).toBe(true);
    const savedIr = saved.storeLayout as { formulasIr?: { sections?: unknown[] } };
    expect(Array.isArray(savedIr.formulasIr?.sections)).toBe(true);
    expect((savedIr.formulasIr?.sections || []).length).toBeGreaterThanOrEqual(4);

    // Confirma renderização real da página gerada (não fallback neutro "Monte sua seleção")
    const vitrine = page.getByTestId('vitrine-overlay-persistent');
    await expect(vitrine).toContainText('Papelaria · Kits & Presentes Artesanais');
    await expect(vitrine.locator('section')).toHaveCount(5);
    await expect
      .poll(async () =>
        vitrine.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);

    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/phase1_vitrine_opened.png` });
  });

  test('4. HTTP 402 sem Mock Falso: exibe recarga e não publica página falsa', async ({ page }) => {
    const tracker = await setupSessionAndRoutes(page, { generateFullMode: 'credits_402' });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ignition-niche-pill-papelaria').click();
    await page.getByTestId('ignition-whatsapp-input').fill('11987654321');
    await page.getByTestId('ignition-submit-btn').click();

    await expect(page.getByTestId('synthesis-error-banner')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('synthesis-recharge-btn')).toBeVisible();
    await expect(page.getByTestId('vitrine-overlay-persistent')).toHaveCount(0);

    const saved = tracker.getSavedProfile();
    expect(saved.publishedStore.published).toBe(false);
    expect(saved.onboarding.storeGenerated).toBe(false);
  });

  test('5. Ver Vitrine -> Modificar com IA -> Inspecionar ilumina bloco em roxo e permite editar/excluir', async ({ page }) => {
    await setupSessionAndRoutes(page, { generateFullMode: 'success' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ignition-niche-pill-papelaria').click();
    await page.getByTestId('ignition-whatsapp-input').fill('11987654321');
    await page.getByTestId('ignition-submit-btn').click();

    const vitrine = page.getByTestId('vitrine-overlay-persistent');
    await expect(vitrine).toBeVisible({ timeout: 10000 });

    await page.getByTestId('open-ai-inspector-btn').first().click();
    await expect(page.getByTestId('ai-inspector-panel')).toBeVisible();
    await page.getByTestId('ai-inspector-toggle-btn').click();

    // Hover e clique no primeiro bloco editável da vitrine (excluindo HeaderNav) para ativar a seleção roxa
    const heroBlock = vitrine.locator('[data-inspect-section]:not([data-inspect-type="HeaderNav"]), [data-atomic-role]').first();
    const box = await heroBlock.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(120, box.height / 2));
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(120, box.height / 2));
    }

    await expect(page.getByTestId('ai-inspector-selected-card')).toBeVisible();
    await page.getByTestId('ai-inspector-prompt-input').fill('Deixar título mais direto e focado no Pix');
    await page.screenshot({ path: `${ARTIFACT_PRINTS_DIR}/ai_inspector_purple_magic.png` });
  });
});
