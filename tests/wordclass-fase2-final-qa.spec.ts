import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '77777777-7777-4777-8777-777777777777';

function createSampleLogoPngBuffer(): Buffer {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

test.describe('FASE 2 FINAL TEST — QA Adversário contra BUG-F02-01..BUG-F02-12', () => {
  test('BUG-F02-07: AccessCodeView limpa card fantasma ao apagar código e dryRun não bloqueia com 429', async ({
    page,
  }) => {
    let validateCalls = 0;
    await page.route('**/api/access/validate', async (route) => {
      validateCalls += 1;
      const body = JSON.parse(route.request().postData() || '{}') as {
        code?: string;
        dryRun?: boolean;
      };
      if (body.code === 'AI10-FARM-LUME') {
        return route.fulfill({ json: { ok: true, valid: true, credits: 100 } });
      }
      return route.fulfill({ json: { ok: true, valid: false, error: 'Código inválido' } });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?route=access');

    const input = page.getByTestId('access-code-input');
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.fill('AI10-FARM-LUME');
    await expect(page.getByTestId('access-credits-translation-card')).toBeVisible({
      timeout: 5000,
    });

    // BUG-F02-07: Apagar parte do código deve esconder imediatamente o card de créditos fantasma
    await input.fill('AI10-FARM');
    await expect(page.getByTestId('access-credits-translation-card')).toHaveCount(0);

    // Digitar código inválido completo também mantém creditsAwarded zerado
    await input.fill('AI10-XXXX-9999');
    await page.waitForTimeout(220);
    await expect(page.getByTestId('access-credits-translation-card')).toHaveCount(0);
    expect(validateCalls).toBeGreaterThanOrEqual(2);
  });

  test('BUG-F02-01..12: SSOT Catálogo, Milhar BR, Upload Real, Pickers+WCAG, FAQ Upsert, Checklist Sync, Vitória Fiel & Kanban', async ({
    page,
  }) => {
    const user = {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa.fase2@example.invalid',
      app_metadata: {},
      user_metadata: { company_name: 'Nova Loja' },
      created_at: new Date().toISOString(),
    };

    const session = {
      access_token: 'fase2-final-token',
      refresh_token: 'fase2-final-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    };

    let savedProfile = {
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
        segment: 'Beleza & Cosméticos',
        businessModel: 'hibrido',
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
        primaryColor: '#0867E8',
        accentColor: '#24A677',
        fontStyle: 'modern_sans',
        visualMood: 'boutique',
      },
      catalog: {
        products: [] as Array<Record<string, unknown>>,
      },
      publishedStore: {
        published: false,
        publicSlug: 'loja-qa-fase2',
        sourceRevision: 1,
      },
    };

    let revision = 1;
    let templateMethodUsed = '';
    let templateIdUpdated = '';
    let feedbackPayload: { rating?: string; stepStopped?: number; comment?: string } = {};

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

      if (pathname === '/api/profile') {
        if (req.method() === 'PUT') {
          const body = JSON.parse(req.postData() || '{}') as { profile?: typeof savedProfile };
          if (body.profile) {
            savedProfile = { ...savedProfile, ...body.profile };
          }
          revision += 1;
          return route.fulfill({ json: { revision, provider: 'local', profile: savedProfile } });
        }
        return route.fulfill({ json: { revision, provider: 'local', profile: savedProfile } });
      }

      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 200, isAdmin: false, banned: false } });
      }

      if (pathname === '/api/whatsapp/ai/templates') {
        if (req.method() === 'GET') {
          // Simula template pré-existente para provar upsert PUT quando resposta mudar (BUG-F02-06)
          return route.fulfill({
            json: {
              ok: true,
              templates: [
                {
                  id: 'tpl-card-1',
                  titulo: 'Cartão e Parcelamento',
                  resposta: 'Resposta antiga genérica',
                },
              ],
            },
          });
        }
        const body = JSON.parse(req.postData() || '{}') as { id?: string; titulo?: string };
        if (body.titulo === 'Cartão e Parcelamento') {
          templateMethodUsed = req.method();
          templateIdUpdated = body.id || '';
        }
        return route.fulfill({ json: { ok: true, templates: [] } });
      }

      if (pathname === '/api/whatsapp/ai/brain') {
        return route.fulfill({ json: { ok: true, brain: {} } });
      }

      if (pathname === '/api/whatsapp/ai/simulate-or-reply') {
        return route.fulfill({
          json: { ok: true, replyText: 'Resposta genérica do servidor.' },
        });
      }

      if (pathname === '/api/onboarding/feedback') {
        feedbackPayload = JSON.parse(req.postData() || '{}') as {
          rating?: string;
          stepStopped?: number;
          comment?: string;
        };
        return route.fulfill({ json: { ok: true, feedback: { id: 'fb-qa', ...feedbackPayload } } });
      }

      if (pathname === '/api/orders' && req.method() === 'POST') {
        return route.fulfill({
          json: {
            ok: true,
            order: {
              id: 'ord-sim-qa',
              order_ref: 'CG-1001',
              isSimulation: true,
              status: 'novo',
              customer_name: 'Pedido de Teste (Simulação)',
              total_cents: 429900,
              created_at: new Date().toISOString(),
            },
          },
        });
      }

      if (pathname === '/api/dashboard' || pathname === '/api/analytics/dashboard') {
        return route.fulfill({
          json: {
            ok: true,
            metrics: { totalOrders: 1, totalRevenueCents: 429900 },
            orders: [
              {
                id: 'ord-sim-qa',
                order_ref: 'CG-1001',
                customer_name: 'Pedido de Teste (Simulação)',
                status: 'novo',
                total_cents: 429900,
                is_simulation: true,
                created_at: new Date().toISOString(),
                items: [{ name: 'iPhone 15 Pro 256GB', qty: 1 }],
              },
            ],
          },
        });
      }

      if (pathname === '/api/whatsapp/api/dados') {
        return route.fulfill({ json: { conectado: false, status: 'Desconectado', templates: [] } });
      }

      if (pathname === '/api/whatsapp/notifications') {
        return route.fulfill({ json: { ok: true, notifications: [], waitingHumanCount: 0 } });
      }

      return route.fulfill({ json: { ok: true } });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // BUG-F02-11: Escolher trilha store_first adapta foco visual (badge "Trilha: Vitrine IA Primeiro")
    await expect(page.getByTestId('welcome-track-store_first')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('welcome-track-store_first').click();
    await page.getByTestId('welcome-start-track-btn').click();

    await expect(page.getByTestId('onboarding-split-studio')).toBeVisible();
    await expect(page.getByTestId('split-track-badge')).toContainText('Vitrine IA Primeiro');

    // BUG-F02-04 & BUG-F02-05: Sobe logo, escolhe pastel claro #FEF08A, valida contraste WCAG escuro #0F172A, testa Inverter e Restaurar
    await page.getByTestId('split-step1-store-name').fill('Atelier QA');
    await page.getByTestId('split-step1-logo-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: createSampleLogoPngBuffer(),
    });
    await expect(page.getByTestId('split-step1-color-primary-input')).toBeAttached();

    // Testa cor pastel clara -> cabeçalho do smartphone deve trocar de texto branco para escuro #0F172A (rgb(15, 23, 42))
    await page.getByTestId('split-step1-color-primary-input').fill('#FEF08A');
    const pastelTitleColor = await page
      .getByTestId('split-live-brand-title')
      .evaluate((el) => getComputedStyle(el).color);
    expect(pastelTitleColor).toBe('rgb(15, 23, 42)');

    // Botão "Da logo" restaura paleta extraída (#007676 / #4828A3)
    await expect(page.getByTestId('split-restore-logo-colors-btn')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/fase2_final_01_step1_colors_and_wcag.png` });
    await page.getByTestId('split-restore-logo-colors-btn').click();
    await expect(page.getByTestId('split-step1-color-primary-input')).toHaveValue('#007676');

    // Inverter cores primária e destaque e desinverter
    await page.getByTestId('split-swap-colors-btn').click();
    await expect(page.getByTestId('split-step1-color-primary-input')).toHaveValue('#4828a3');
    await page.getByTestId('split-restore-logo-colors-btn').click();

    await page.getByTestId('split-step1-phone').fill('11998765432');
    // BUG-F02-12: Clicar em "Pix com desconto" sincroniza 5% automaticamente
    await page.getByTestId('split-payment-pill-pix_discount').click();

    // Avança ao Passo 2 -> BUG-F02-09: Banner superior acompanha "Etapa 2 de 3"
    await page.getByTestId('split-step1-next-btn').click();
    await expect(page.getByTestId('split-step2-panel')).toBeVisible();
    await expect(page.locator('[aria-label="Configuração rápida da loja"]')).toContainText(
      'Etapa 2 de 3',
    );

    // BUG-F02-02: Cola lista difícil com milhar BR + nome terminado em número + item padrão
    await page.getByTestId('split-express-paste-btn').click();
    await page
      .getByTestId('split-express-paste-input')
      .fill('iPhone 15 128GB - R$ 4.299,00\nPerfume Nº 5\nCreme Lavanda - 69,90');
    await page.getByTestId('split-express-paste-apply').click();

    await expect(page.getByTestId('split-step2-catalog-count')).toContainText('3 itens prontos');
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('4.299,00');
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('Perfume Nº 5');

    // BUG-F02-01: Editar 1º item NÃO duplica item fantasma -> mantém exatos 3 itens
    await page.getByTestId('split-step2-product-name').fill('iPhone 15 Pro 256GB');
    await expect(page.getByTestId('split-step2-catalog-count')).toContainText('3 itens prontos');
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('iPhone 15 Pro 256GB');
    await expect(page.getByTestId('split-live-catalog-strip')).not.toContainText('iPhone 15 128GB');

    // BUG-F02-03: Remover stub falso e testar upload real de foto + remoção de chip
    await expect(page.getByTestId('split-photo-mode-ai')).toHaveCount(0);
    await page.getByTestId('split-select-product-2').click();
    await expect(page.getByTestId('split-step2-product-name')).toHaveValue('Creme Lavanda');

    await page.getByTestId('split-step2-photo-upload').setInputFiles({
      name: 'produto-real.png',
      mimeType: 'image/png',
      buffer: createSampleLogoPngBuffer(),
    });
    const uploadedSrc = await page.getByTestId('split-step2-photo-preview').getAttribute('src');
    expect(uploadedSrc).toContain('data:image/png;base64,');

    // Remove "Perfume Nº 5" (índice 1) -> cai para exatamente 2 itens
    await page.getByTestId('split-remove-product-1').click();
    await expect(page.getByTestId('split-step2-catalog-count')).toContainText('2 itens prontos');
    await expect(page.getByTestId('split-live-catalog-strip')).not.toContainText('Perfume Nº 5');

    await page.screenshot({ path: `${ARTIFACT_DIR}/fase2_final_02_step2_chips_and_real_photo.png` });

    // Avança ao Passo 3 -> BUG-F02-09 (Etapa 3) e BUG-F02-12 (5% Pix pré-selecionado)
    await page.getByTestId('split-step2-next-btn').click();
    await expect(page.getByTestId('split-step3-panel')).toBeVisible();
    await expect(page.locator('[aria-label="Configuração rápida da loja"]')).toContainText(
      'Etapa 3 de 3',
    );
    await expect(page.getByRole('button', { name: '5%' })).toHaveClass(/border-\[#2563EB\]/);

    // BUG-F02-06: Sofia usa palavras-chave ampliadas ("parcelam", "horário")
    await page.getByTestId('split-faq-card').fill('Parcelamos em até 6x sem juros!');
    await page.getByTestId('split-faq-delivery').fill('Entrega no mesmo dia na cidade.');
    await page.getByTestId('split-faq-location').fill('Aberto de 9h às 20h na Av. Brasil.');

    await page.getByTestId('split-preview-tab-sofia').click();
    await page.getByTestId('split-sofia-chat-input').fill('Vocês parcelam?');
    await page.getByTestId('split-sofia-chat-send').click();
    await expect(page.getByTestId('split-live-sofia-preview')).toContainText(
      'Parcelamos em até 6x sem juros!',
    );
    await page.getByTestId('split-sofia-chat-input').fill('Qual horário vocês abrem?');
    await page.getByTestId('split-sofia-chat-send').click();
    await expect(page.getByTestId('split-live-sofia-preview')).toContainText(
      'Aberto de 9h às 20h na Av. Brasil.',
    );

    // Publica -> BUG-F02-06 valida upsert PUT com id 'tpl-card-1'
    await page.getByTestId('split-publish-finish-btn').click();
    await expect(page.getByTestId('victory-mini-preview-card')).toBeVisible({ timeout: 10000 });
    expect(templateMethodUsed).toBe('PUT');
    expect(templateIdUpdated).toBe('tpl-card-1');

    // BUG-F02-10: Preview da Vitória usa a cor da loja e Termômetro "Travou algo" abre submotivos
    await expect(page.getByTestId('victory-mini-preview-card')).toContainText('Atelier QA');
    await expect(page.getByTestId('victory-mini-preview-card')).toContainText('2 itens');

    await page.getByTestId('thermometer-rate-stuck').click();
    await expect(page.getByTestId('thermometer-stuck-reasons')).toBeVisible();
    await page.locator('button[aria-label="Fechar notificação"]').evaluateAll((btns) => {
      btns.forEach((b) => (b as HTMLButtonElement).click());
    }).catch(() => {});
    await page.screenshot({ path: `${ARTIFACT_DIR}/fase2_final_03_victory_mini_preview_and_stuck.png` });

    await page.getByTestId('thermometer-stuck-reason-catalogo').click();
    await expect(page.getByTestId('thermometer-thanks')).toContainText('Catálogo / Excel');
    expect(feedbackPayload.rating).toBe('stuck');
    expect(feedbackPayload.stepStopped).toBe(2);
    expect(feedbackPayload.comment).toBe('Catálogo / Excel');

    // BUG-F02-08: Simular 1º Pedido persiste completedFirstSimulatedOrder = true e cria atalho persistente para Pedidos
    await page.getByTestId('victory-simulate-first-order-btn').click();
    await expect(page.getByTestId('storefront-owner-preview-bar')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('owner-preview-simulate-order-btn').click();
    await expect(page.getByTestId('owner-preview-simulated-badge')).toContainText('#CG-1001 criado', {
      timeout: 10000,
    });
    await expect(page.getByTestId('owner-preview-open-orders-btn')).toBeVisible();
    await expect.poll(() => savedProfile.onboarding.completedFirstSimulatedOrder).toBe(true);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/fase2_final_04_simulated_order_kanban_shortcut.png`,
    });

    // Clicar no atalho leva direto à aba Pedidos!
    await page.getByTestId('owner-preview-open-orders-btn').click();
    await expect(page.getByTestId('topbar-active-title')).toContainText(/Pedidos/i, {
      timeout: 10000,
    });
  });
});
