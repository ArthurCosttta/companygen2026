import { test, expect } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '55555555-5555-4555-8555-555555555555';

// PNG 4x4 válido azul + dourado para Canvas getImageData no Extrator de Cores
function createSampleLogoPngBuffer(): Buffer {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

test.describe('FILA 02 — Onboarding Split-Screen (< 3 min), C11–C20 & Provas Visuais Completas', () => {
  test('C11 & C12: AccessCodeView tolera espaços/minúsculas, traduz créditos e AuthFlowView mostra diagrama 5s sem overflow', async ({
    page,
  }) => {
    await page.route('**/api/access/validate', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}') as { code?: string };
      if (body.code === 'AI10-FARM-LUME') {
        return route.fulfill({
          json: { ok: true, valid: true, credits: 100 },
        });
      }
      return route.fulfill({ status: 400, json: { valid: false, error: 'Código inválido' } });
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?route=access&qr=panfleto-centro');

    const codeInput = page.getByTestId('access-code-input');
    await expect(codeInput).toBeVisible({ timeout: 15000 });

    // Simula colagem suja com espaços e minúsculas -> normaliza AI10-FARM-LUME
    await codeInput.fill('');
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="access-code-input"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', '  ai10  farm  lume ');
      el.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }),
      );
    });
    await expect(codeInput).toHaveValue('AI10-FARM-LUME');

    // Tradução concreta de saldo
    await expect(page.getByTestId('access-credits-translation-card')).toContainText(
      '~80 atendimentos no WhatsApp',
      { timeout: 5000 },
    );
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_01_access_code_normalized.png` });

    // Transição para login preserva QR/código em storage + exibe diagrama de 5s
    await page.getByTestId('access-go-to-login-btn').click();
    await expect(page.getByTestId('auth-flow-5s-diagram')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('auth-flow-5s-diagram')).toContainText('Vitrine 24h Web');
    await expect(page.getByTestId('auth-flow-5s-diagram')).toContainText('Sofia no PC (.exe)');
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_02_auth_5s_diagram.png` });

    // Mobile 390x844 sem corte horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('C13–C20: Roteador Welcome -> Setup Split 55/45 -> Catálogo Ao Vivo -> Dark Mode -> Sofia -> Vitória sem http:// -> Simular 1º Pedido', async ({
    page,
  }) => {
    const user = {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'onboarding.fila02@example.invalid',
      app_metadata: {},
      user_metadata: { company_name: 'Nova Loja' },
      created_at: new Date().toISOString(),
    };

    const session = {
      access_token: 'fila02-token',
      refresh_token: 'fila02-refresh',
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
        publicSlug: 'atelier-lumina',
        sourceRevision: 1,
      },
    };

    let revision = 1;
    let feedbackRequestPayload: { rating?: string } = {};
    let feedbackStatus = 0;
    let simulatedOrderIsSimulation = false;

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
            savedProfile = {
              ...savedProfile,
              ...body.profile,
            };
          }
          revision += 1;
          return route.fulfill({ json: { revision, provider: 'local', profile: savedProfile } });
        }
        return route.fulfill({ json: { revision, provider: 'local', profile: savedProfile } });
      }

      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 150, isAdmin: false, banned: false } });
      }

      if (pathname === '/api/whatsapp/ai/templates') {
        return route.fulfill({ json: { ok: true, templates: [] } });
      }

      if (pathname === '/api/whatsapp/ai/brain') {
        return route.fulfill({ json: { ok: true, brain: {} } });
      }

      if (pathname === '/api/whatsapp/ai/simulate-or-reply') {
        const body = JSON.parse(req.postData() || '{}') as { messageText?: string };
        return route.fulfill({
          json: {
            ok: true,
            replyText: `Resposta ao vivo para: ${body.messageText || 'seu pedido'}.`,
          },
        });
      }

      if (pathname === '/api/onboarding/feedback') {
        feedbackRequestPayload = JSON.parse(req.postData() || '{}') as { rating?: string };
        feedbackStatus = 200;
        return route.fulfill({
          json: {
            ok: true,
            feedback: { id: 'fb-1', ...feedbackRequestPayload },
          },
        });
      }

      if (pathname === '/api/orders' && req.method() === 'POST') {
        const body = JSON.parse(req.postData() || '{}') as { isSimulation?: boolean };
        simulatedOrderIsSimulation = Boolean(body?.isSimulation);
        return route.fulfill({
          json: {
            ok: true,
            order: {
              id: 'ord-sim-1',
              order_ref: 'CG-1001',
              isSimulation: simulatedOrderIsSimulation,
            },
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

    // C13: WelcomeModal exibe 3 trilhas e direciona para Split Studio
    await expect(page.getByTestId('welcome-track-full_guided')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('welcome-track-store_first')).toBeVisible();
    await expect(page.getByTestId('welcome-track-whatsapp_first')).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_03_welcome_3_tracks.png` });
    await page.getByTestId('welcome-start-track-btn').click();

    await expect(page.getByTestId('onboarding-split-studio')).toBeVisible();
    await expect(page.getByTestId('split-step1-panel')).toBeVisible();

    // C14, C15, C16 — Passo 1: Nome, Logo PNG 2 cores, Mood, WhatsApp Testar Oi e Pílulas
    await page.getByTestId('split-step1-store-name').fill('Atelier Lumina');
    await expect(page.getByTestId('split-live-vitrine-preview')).toContainText('Atelier Lumina');

    await page.getByTestId('split-step1-logo-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: createSampleLogoPngBuffer(),
    });
    await expect(page.getByTestId('split-step1-color-primary')).toBeVisible();
    await expect(page.getByTestId('split-step1-color-accent')).toBeVisible();

    await page.getByTestId('split-mood-boutique').click();
    await page.getByTestId('split-step1-phone').fill('11998765432');
    await page.getByTestId('split-step1-test-oi-btn').click();
    await expect(page.getByTestId('split-test-oi-confirmed')).toBeVisible();

    await page.getByTestId('split-delivery-pill-national').click();
    await page.getByTestId('split-payment-pill-pix_discount').click();
    await expect(page.getByTestId('split-live-rules-strip')).toContainText('Correios');
    await expect(page.getByTestId('split-live-rules-strip')).toContainText('Pix com desconto');

    // Proof 04: Passo 1 completo em Light Mode (Logo + 2 Cores + Testar Oi + Pílulas refletidas no Smartphone)
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_onboarding_split_1440_light.png` });

    // Avança ao Passo 2 e testa Colar Lista + Chips de Variação + Catálogo Ao Vivo
    await page.getByTestId('split-step1-next-btn').click();
    await expect(page.getByTestId('split-step2-panel')).toBeVisible();

    // Proof 05: Gaveta "Colar Lista / @IG" aberta com texto colado
    await page.getByTestId('split-express-paste-btn').click();
    await page
      .getByTestId('split-express-paste-input')
      .fill('Sérum Vitamina C - 119,90\nCreme Lavanda - 69,90');
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_05_step2_paste_drawer.png` });

    await page.getByTestId('split-express-paste-apply').click();
    await expect(page.getByTestId('split-step2-catalog-count')).toContainText('2 itens prontos');

    await page.getByTestId('split-step2-product-category').fill('Cosméticos');
    await page.getByTestId('split-variation-chip-30ml').click();
    await expect(page.getByTestId('split-step2-product-variation')).toHaveValue('30ml');
    await page.getByTestId('split-photo-mode-draft').click();

    // Proof 06: Produtos + Preços + Chip 30ml refletidos ao vivo na faixa de catálogo do Smartphone
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('Sérum Vitamina C');
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('Creme Lavanda');
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('30ml');
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_06_step2_catalog_and_30ml_live.png` });

    // Proof 08 (Dark Mode Bug Fixed): Alterna Dark Mode e valida contraste real no Smartphone
    await page.getByTestId('topbar-theme-toggle-btn').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect
      .poll(() =>
        page
          .getByTestId('split-live-vitrine-preview')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(255, 255, 255)');
    const previewHeaderBg = await page
      .locator('[data-testid="split-live-vitrine-preview"] header')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(previewHeaderBg).toBe('rgb(255, 255, 255)');
    const previewHeaderTitleColor = await page
      .locator('[data-testid="split-live-vitrine-preview"] header')
      .getByText('Atelier Lumina')
      .evaluate((el) => getComputedStyle(el).color);
    // Garante que o título no sticky header da vitrine tem contraste escuro nítido sobre fundo branco
    const rgbMatch = previewHeaderTitleColor.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
    expect(rgbMatch.length).toBeGreaterThanOrEqual(3);
    expect(rgbMatch[0]).toBeLessThan(60);
    expect(rgbMatch[1]).toBeLessThan(60);
    expect(rgbMatch[2]).toBeLessThan(60);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_onboarding_split_1440_dark.png` });

    // Volta para Light Mode
    await page.getByTestId('topbar-theme-toggle-btn').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.waitForTimeout(220);

    // Proof 07: Botão "Loja Modelo (0 cr)" preenche itens curados instantaneamente
    await page.getByTestId('split-express-model-btn').click();
    await expect(page.getByTestId('split-live-catalog-strip')).toContainText('Kit');
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_07_step2_model_store_0cr.png` });

    // Reaplica os 2 itens exatos do fluxo do usuário para o teste de resiliência F5
    await page.getByTestId('split-express-paste-btn').click();
    await page
      .getByTestId('split-express-paste-input')
      .fill('Sérum Vitamina C - 119,90\nCreme Lavanda - 69,90');
    await page.getByTestId('split-express-paste-apply').click();
    await page.getByTestId('split-variation-chip-30ml').click();

    // Mobile 390x844 sem corte horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[aria-live="polite"] button[aria-label="Fechar notificação"]').evaluateAll((btns) => {
      btns.forEach((b) => (b as HTMLButtonElement).click());
    }).catch(() => {});
    await page.waitForTimeout(220);
    await expect(page.getByTestId('onboarding-mobile-preview-btn')).toBeVisible();
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_onboarding_mobile_390_light.png` });

    // Retorna para 1440x900 e testa F5 no meio do Passo 2 -> retoma no Passo 2 com estado preservado
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByTestId('onboarding-split-studio')).toBeVisible({ timeout: 15000 });
    const exploreBtn = page.getByRole('button', { name: /Explorar o painel primeiro/i });
    if (await exploreBtn.isVisible().catch(() => false)) {
      await exploreBtn.click();
    }
    await expect(page.getByTestId('split-step2-panel')).toBeVisible();
    await expect(page.getByTestId('split-step2-product-name')).toHaveValue('Sérum Vitamina C');

    // Avança ao Passo 3 -> Pix + 3 Perguntas + Simulador Sofia ao vivo
    await page.getByTestId('split-step2-next-btn').click();
    await expect(page.getByTestId('split-step3-panel')).toBeVisible();

    await page.getByTestId('split-step3-pix-key').fill('pix@atelierlumina.com.br');
    await page.getByTestId('split-faq-card').fill('Aceitamos cartão em até 3x sem juros!');
    await page.getByTestId('split-faq-delivery').fill('Frete fixo R$ 10 na cidade no mesmo dia.');
    await page.getByTestId('split-faq-location').fill('Rua das Acácias, 45 - Centro.');

    // Proof 09: Alterna smartphone para "Testar Sofia" e envia 2 perguntas de cliente
    await page.getByTestId('split-preview-tab-sofia').click();
    await expect(page.getByTestId('split-live-sofia-preview')).toBeVisible();
    await page.getByTestId('split-sofia-chat-input').fill('Aceita cartão?');
    await page.getByTestId('split-sofia-chat-send').click();
    await expect(page.getByTestId('split-live-sofia-preview')).toContainText(
      'Aceitamos cartão em até 3x sem juros!',
    );
    await page.getByRole('button', { name: 'Qual valor da entrega?' }).click();
    await expect(page.getByTestId('split-live-sofia-preview')).toContainText(
      'Frete fixo R$ 10 na cidade no mesmo dia.',
    );
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_09_step3_sofia_chat_simulator.png` });

    // Publica loja -> Abre Kit 1ª Divulgação (SEM nenhum link http:// visível) + Termômetro
    await page.getByTestId('split-publish-finish-btn').click();
    await expect(page.getByTestId('victory-copy-link-btn')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('victory-download-qr-btn')).toBeVisible();
    await expect(page.getByTestId('victory-copy-status-btn')).toBeVisible();
    await expect(page.getByTestId('victory-simulate-first-order-btn')).toBeVisible();

    // Verifica que nenhum link http:// cru está visível no modal de vitória
    const victoryDialog = page.getByRole('dialog');
    const victoryDialogText = await victoryDialog.innerText();
    expect(victoryDialogText).not.toMatch(/https?:\/\//i);
    expect(await victoryDialog.locator('input').count()).toBe(0);

    // Clica "Copiar Link da Vitrine" -> estado visual "✓ Copiado" e clica Termômetro "Fácil"
    await page.getByTestId('victory-copy-link-btn').click();
    await expect(page.getByTestId('victory-copy-link-btn')).toContainText('Copiado');

    await page.getByTestId('thermometer-rate-easy').click();
    await expect(page.getByTestId('thermometer-thanks')).toBeVisible();
    expect(feedbackStatus).toBe(200);
    expect(feedbackRequestPayload?.rating).toBe('easy');

    // Fecha toast para não encobrir topo do modal no print da Vitória
    await page.locator('button[aria-label="Fechar notificação"]').evaluateAll((btns) => {
      btns.forEach((b) => (b as HTMLButtonElement).click());
    }).catch(() => {});
    await page.waitForTimeout(220);

    await page
      .locator('[data-slot="modal-content"] > div:nth-of-type(3)')
      .evaluate((el) => {
        el.scrollTop = 0;
      })
      .catch(() => {});

    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_onboarding_victory_1440.png` });

    // Proof 10: Clica "Simular meu 1º pedido agora" -> abre vitrine com Barra Preview + simula 1º pedido
    await page.getByTestId('victory-simulate-first-order-btn').click();
    await expect(page.getByTestId('storefront-owner-preview-bar')).toBeVisible({ timeout: 10000 });
    await page.locator('button[aria-label="Fechar notificação"]').evaluateAll((btns) => {
      btns.forEach((b) => (b as HTMLButtonElement).click());
    }).catch(() => {});
    await page.getByTestId('owner-preview-simulate-order-btn').click();
    await expect(page.getByText(/1º Pedido simulado \(#CG-1001\) criado/i)).toBeVisible({
      timeout: 10000,
    });
    expect(simulatedOrderIsSimulation).toBe(true);
    await page.waitForTimeout(320);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila02_proof_10_simulated_first_order.png` });

    // Volta ao painel -> confirma card "Próximo Ganho" e ZERO inputs com http:// exposto
    await page.getByRole('button', { name: 'Voltar ao Painel' }).click();
    await expect(page.getByTestId('guided-next-step')).toBeVisible({ timeout: 10000 });
    const rawHttpInputs = await page
      .locator('input[value^="http://"], input[value^="https://"]')
      .count();
    expect(rawHttpInputs).toBe(0);
  });
});
