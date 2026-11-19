import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '77777777-7777-4777-8777-777777777777';

interface StudioHarnessState {
  revision: number;
  creditBalance: number;
  simulatePatchError: boolean;
  experienceMode: 'quiz_recommendation' | 'dosage_calculator';
  profile: Record<string, any>;
  formulasIr: Record<string, any>;
}

async function dismissAllToasts(page: Page) {
  const closeBtns = page.locator('[data-testid="toast-region"] button');
  for (let pass = 0; pass < 6; pass += 1) {
    const count = await closeBtns.count();
    if (count === 0) break;
    await closeBtns.first().click().catch(() => {});
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(320);
}

function buildInitialFormulaV9(experienceMode: 'quiz_recommendation' | 'dosage_calculator' = 'quiz_recommendation') {
  const isDosage = experienceMode === 'dosage_calculator';
  return {
    version: '9.0',
    visualDirection: 'editorial_light',
    layoutGrid: 'editorial_split',
    artDirectionBible: {
      lighting: 'soft natural morning sunlight',
      surfaceMaterial: 'matte white ceramic and linen',
      backdropTone: 'warm alabaster',
      cameraFraming: '45 degree editorial product hero',
    },
    analysis: {
      factsConfirmed: ['Catálogo real conectado'],
      dependencies: [],
      mainExperienceSummary: isDosage ? 'Calculadora de reposição' : 'Quiz guiado 3 etapas',
    },
    designTokens: {
      accent: '#0B4DB8',
      accentDeep: '#07377F',
      surface: '#F7FAFF',
      surfaceAlt: '#EAF2FF',
      card: '#FFFFFF',
      ink: '#10233F',
      inkMuted: '#475569',
      onPrimary: '#FFFFFF',
      badgeText: '#065F46',
      footerBg: '#081A33',
      fontStyle: 'modern_sans',
      radiusPx: 18,
    },
    imagePlan: [],
    storeInfo: {
      name: 'Botânica Lume',
      description: 'Skincare botânico artesanal',
      pixDiscountPercent: 10,
      whatsappE164: '5511988887777',
    },
    sections: [
      {
        id: 'sec_header',
        type: 'HeaderNav',
        config: { ctaLabel: 'Sacola', showSearch: false, showBag: true, links: [] },
      },
      {
        id: 'sec_hero',
        type: 'HeroSection',
        config: {
          variant: 'split',
          eyebrow: 'Fórmulas Puras',
          title: 'Botânica pura na sua rotina diária',
          subtitle: 'Séruns e cremes preparados em pequenos lotes com 10% no Pix.',
          primaryCta: { label: 'Descobrir fórmula ideal', href: '#experiencia' },
          secondaryCta: { label: 'Falar no WhatsApp', action: 'whatsapp.send_summary' },
        },
      },
      {
        id: 'sec_exp',
        type: 'InteractiveExperience',
        config: {
          eyebrow: 'Experiência Guiada',
          title: isDosage ? 'Calcule sua reposição mensal' : 'Monte sua rotina em 3 passos',
          subtitle: isDosage
            ? 'Escolha quantos dias de uso e veja as unidades recomendadas.'
            : 'Responda 3 escolhas rápidas e veja o sérum exato para sua pele.',
          experienceMode,
          recommendedSkus: ['SER-01'],
          layoutVariant: 'workbench_split',
          stateDefaults: isDosage
            ? { dias: 30 }
            : { pele: 'mista', momento: 'manha', meta: 'luminosidade' },
          controls: isDosage
            ? [
                {
                  id: 'ctrl_dias',
                  atomType: 'slider_range',
                  stateKey: 'dias',
                  label: 'Unidades para o período',
                  min: 1,
                  max: 6,
                  step: 1,
                  unitLabel: 'frascos',
                  pricePerUnitCents: 1999,
                  skuRef: 'HID-03',
                },
              ]
            : [
                {
                  id: 'ctrl_pele',
                  atomType: 'tabs_selector',
                  stateKey: 'pele',
                  label: '1. Tipo de pele',
                  options: [
                    { value: 'mista', label: 'Mista' },
                    { value: 'seca', label: 'Seca' },
                  ],
                },
                {
                  id: 'ctrl_momento',
                  atomType: 'tabs_selector',
                  stateKey: 'momento',
                  label: '2. Momento de uso',
                  options: [
                    { value: 'manha', label: 'Manhã' },
                    { value: 'noite', label: 'Noite' },
                  ],
                },
                {
                  id: 'ctrl_meta',
                  atomType: 'option_cards',
                  stateKey: 'meta',
                  label: '3. Objetivo principal',
                  options: [
                    { value: 'luminosidade', label: 'Sérum Vitamina C 30ml', skuRef: 'SER-01', note: 'Brilho uniforme' },
                    { value: 'calma', label: 'Creme Calmante 50g', skuRef: 'CRE-02', note: 'Barreira suave' },
                  ],
                },
              ],
          calcRule: {
            mode: isDosage ? 'per_unit_slider' : 'base_plus_addons',
            pixDiscountPercent: 10,
            summaryTitle: 'Resumo da sua seleção',
            limitNote: 'Preços oficiais direto do catálogo.',
          },
          primaryAction: { type: 'cart.add_selected', label: 'Adicionar à Sacola' },
          secondaryAction: { type: 'whatsapp.send_summary', label: 'Enviar no WhatsApp' },
        },
      },
      {
        id: 'sec_bundles',
        type: 'ComplementaryBundles',
        config: {
          title: 'Combine e Economize',
          subtitle: 'Duplas prontas para rotina completa em 1 clique.',
          items: [
            {
              id: 'combo_rotina',
              title: 'Dupla Vitamina C + Calmante',
              description: 'Proteção diurna e hidratação noturna',
              skuIds: ['SER-01', 'CRE-02'],
            },
          ],
        },
      },
      {
        id: 'sec_cat',
        type: 'CatalogGrid',
        config: {
          title: 'Catálogo Oficial',
          subtitle: 'Selecione os itens disponíveis agora',
          itemActionLabel: 'Adicionar à sacola',
          emptyImageMode: 'neutral_gray',
        },
      },
      {
        id: 'sec_faq',
        type: 'ContextualFaq',
        config: {
          title: 'Dúvidas Frequentes',
          subtitle: 'Informações oficiais sobre entrega e pagamento.',
          items: [
            {
              q: 'Qual o prazo de envio e retirada?',
              a: 'Pedidos confirmados saem no próximo dia útil ou ficam prontos para retirada na loja.',
            },
            {
              q: 'Como funciona o desconto no Pix?',
              a: 'Você garante 10% de desconto automático ao escolher Pix na sacola.',
            },
          ],
        },
      },
      {
        id: 'sec_footer',
        type: 'RichFooter',
        config: { tagline: 'Botânica Lume · Atendimento humano via WhatsApp', showNewsletter: false },
      },
    ],
  };
}

function createInitialState(): StudioHarnessState {
  const formulasIr = buildInitialFormulaV9('quiz_recommendation');
  return {
    revision: 3,
    creditBalance: 65,
    simulatePatchError: false,
    experienceMode: 'quiz_recommendation',
    formulasIr,
    profile: {
      business: {
        name: 'Botânica Lume',
        segment: 'Skincare Artesanal',
        businessModel: 'produtos',
        description: 'Fórmulas botânicas puras com entrega rápida.',
        address: 'Rua Harmonia, 240 — São Paulo',
        hours: 'Seg a Sáb 09h–18h',
      },
      brand: {
        primaryColor: '#0B4DB8',
        fontStyle: 'modern_sans',
      },
      whatsapp: {
        connected: true,
        phoneE164: '5511988887777',
        displayPhone: '+55 11 98888-7777',
      },
      payment: {
        pixKey: 'pix@botanicalume.com.br',
        pixDiscountPercent: 10,
        acceptedMethods: ['pix', 'credit_card'],
      },
      shipping: {
        fixedFeeCents: 1200,
        freeShippingThresholdCents: 18000,
        pickupAvailable: true,
      },
      catalog: {
        products: [
          {
            id: 'prod-1',
            sku: 'SER-01',
            name: 'Sérum Vitamina C',
            category: 'Séruns',
            description: 'Antioxidante iluminador diário.',
            priceCents: 12000,
            variation: '30ml',
            stock: 10,
            active: true,
            approvedAsset: true,
          },
          {
            id: 'prod-2',
            sku: 'CRE-02',
            name: 'Creme Calmante Camomila',
            category: 'Hidratantes',
            description: 'Hidratação suave para pele sensível.',
            priceCents: 8000,
            variation: '50g',
            stock: 8,
            active: true,
            approvedAsset: true,
          },
          {
            id: 'prod-3',
            sku: 'HID-03',
            name: 'Bruma Termal Botânica',
            category: 'Hidratantes',
            description: 'Refrescância imediata.',
            priceCents: 1999,
            variation: '60ml',
            stock: 15,
            active: true,
            approvedAsset: true,
          },
        ],
      },
      publishedStore: {
        published: true,
        isPublished: true,
        publicSlug: 'botanica-lume',
        sourceRevision: 3,
        publishedAt: new Date().toISOString(),
      },
      onboarding: {
        welcomeSeen: true,
        completed: true,
        whatsappConnected: true,
        whatsappConfirmed: true,
        fichaCompleted: true,
        storeGenerated: true,
        preferredTrack: 'store_first',
        completedFirstSimulatedOrder: true,
      },
      storeLayout: {
        formulasIr,
      },
    },
  };
}

async function setupStudioHarness(page: Page, state: StudioHarnessState) {
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fila04.studio@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Botânica Lume' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'fila04-session-token',
    refresh_token: 'fila04-refresh-token',
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

    if (pathname.startsWith('/api/public/store/')) {
      return route.fulfill({
        json: {
          ok: true,
          profile: {
            ...state.profile,
            storeLayout: { formulasIr: state.formulasIr },
          },
        },
      });
    }

    if (pathname === '/api/profile') {
      if (req.method() === 'GET') {
        return route.fulfill({
          json: {
            revision: state.revision,
            provider: 'local',
            profile: {
              ...state.profile,
              storeLayout: { formulasIr: state.formulasIr },
            },
          },
        });
      }
      if (req.method() === 'PUT') {
        const body = JSON.parse(req.postData() || '{}');
        state.revision += 1;
        state.profile = {
          ...(body.profile || state.profile),
          publishedStore: {
            ...state.profile.publishedStore,
            isPublished: true,
          },
        };
        if (body.profile?.storeLayout?.formulasIr) {
          state.formulasIr = body.profile.storeLayout.formulasIr;
        }
        return route.fulfill({
          json: { revision: state.revision, provider: 'local', profile: state.profile },
        });
      }
    }

    if (pathname === '/api/store-molde/state') {
      return route.fulfill({
        json: {
          ok: true,
          formulasIr: state.formulasIr,
          imageJobs: [],
          generatedAssets: {},
          balance: state.creditBalance,
        },
      });
    }

    if (pathname === '/api/store-molde/save-ir') {
      const body = JSON.parse(req.postData() || '{}');
      if (body.formulasIr) state.formulasIr = body.formulasIr;
      return route.fulfill({ json: { ok: true, formulasIr: state.formulasIr } });
    }

    if (pathname === '/api/store-molde/patch-section') {
      const body = JSON.parse(req.postData() || '{}');
      if (state.simulatePatchError) {
        return route.fulfill({
          status: 502,
          json: {
            ok: false,
            error: 'Falha momentânea no motor IA ao ajustar a seção. Seus 5 créditos foram estornados automaticamente.',
            refunded: true,
            balanceAfter: state.creditBalance,
          },
        });
      }
      state.creditBalance = Math.max(0, state.creditBalance - 5);
      const nextSections = (state.formulasIr.sections || []).map((s: any) =>
        s.id === body.sectionId
          ? {
              ...s,
              config: {
                ...s.config,
                title: 'Botânica direta na sua rotina',
                subtitle: body.instruction,
              },
            }
          : s,
      );
      state.formulasIr = { ...state.formulasIr, sections: nextSections };
      return route.fulfill({
        json: {
          ok: true,
          section: nextSections.find((s: any) => s.id === body.sectionId),
          formulasIr: state.formulasIr,
          debited: 5,
          balanceAfter: state.creditBalance,
          criticTips: [
            {
              id: 'critic_missing_photos',
              severity: 'info',
              title: '3 itens sem foto real',
              message: 'Adicione fotos reais ou busque imagens grátis (0 cr) para Sérum Vitamina C.',
              actionType: 'open_photo_search',
            },
          ],
        },
      });
    }

    if (pathname === '/api/access/me') {
      return route.fulfill({ json: { ok: true, credits: state.creditBalance, isAdmin: false } });
    }

    if (pathname === '/api/credits/balance') {
      return route.fulfill({ json: { ok: true, balance: state.creditBalance } });
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
            ordersCount: 2,
            salesCents: 20000,
            messagesCount: 8,
            catalogCount: 3,
            stockUnits: 33,
            recentOrders: [],
          },
        },
      });
    }

    return route.fulfill({ json: { ok: true } });
  });
}

test('FILA 04 Estúdio Visual (F04-P01..P07 & F04-P12): 30/70, 390px Fold, Patch, Ctrl+Z, Diff, WCAG 1-clique, Dark & Refund', async ({ page }) => {
  const state = createInitialState();
  await setupStudioHarness(page, state);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?tab=store');

  // Fecha dialog de boas-vindas se aparecer
  const closeWelcome = page.getByRole('button', { name: /Explorar o painel primeiro|Fechar janela/i }).first();
  if (await closeWelcome.isVisible({ timeout: 2500 }).catch(() => false)) {
    await closeWelcome.click();
  }

  // Navega para Estúdio Visual -> Editor
  await page.getByTestId('store-subtab-estudio').click();
  await page.getByTestId('open-visual-editor-btn').click();

  const studio = page.getByTestId('tela-34-archetype-composer');
  await expect(studio).toBeVisible();

  // P4: Zero jargão técnico visível ao lojista
  const studioVisibleText = await studio.innerText();
  expect(studioVisibleText).not.toMatch(/HeroSection|sec_diff|Formula-IR|SEC_HERO_V9|index\.html/);
  expect(studioVisibleText).toContain('Capa Principal');
  expect(studioVisibleText).toContain('Simulador Interativo');

  // CTA verde Publicar largura fixa
  const publishBtn = page.getByTestId('editor-save-plan-btn');
  const boxBefore = await publishBtn.boundingBox();
  expect(boxBefore?.width).toBeGreaterThanOrEqual(130);

  // F04-P01: Print Estúdio 30%/70% Desktop
  await dismissAllToasts(page);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_desktop_1440.png` });

  // F04-P02: Switch 390px e verificação do Fold Budget (<h1> + imagem + CTA nos primeiros 820px do frame)
  await page.getByTestId('editor-viewport-mobile').click();
  const frame = page.getByTestId('editor-canvas-dropzone');
  await expect
    .poll(async () => Math.round((await frame.boundingBox())?.width ?? 999), { timeout: 3000 })
    .toBeLessThanOrEqual(392);
  const frameBox = await frame.boundingBox();
  expect(frameBox?.width).toBeLessThanOrEqual(392);

  const heroHeading = frame.locator('h1').first();
  const heroCta = frame.getByTestId('v9-hero-primary-cta');
  const h1Box = await heroHeading.boundingBox();
  const ctaBox = await heroCta.boundingBox();
  expect(h1Box && frameBox ? h1Box.y - frameBox.y : 999).toBeLessThan(820);
  expect(ctaBox && frameBox ? ctaBox.y + ctaBox.height - frameBox.y : 999).toBeLessThan(820);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_mobile_frame_390.png` });

  // Volta ao Desktop para testar Patch Cirúrgico (-5 cr) + Design Critic
  await page.getByTestId('editor-viewport-desktop').click();

  // Seleciona Capa Principal e aplica Patch Cirúrgico
  await page.getByTestId('editor-section-row-sec_hero').click();
  const aiInput = page.getByTestId('editor-ai-command-input');
  await aiInput.fill('Deixar título mais direto');
  await page.getByTestId('editor-ai-command-submit').click();

  await expect(frame.locator('h1').first()).toHaveText('Botânica direta na sua rotina');
  await expect(page.getByTestId('editor-credit-balance-badge')).toContainText('Saldo: 60 cr');
  await expect(page.getByTestId('editor-design-critic-bar')).toBeVisible();
  // Irmã preservada
  await expect(frame.getByTestId('v9-complementary-bundles')).toBeVisible();

  await dismissAllToasts(page);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_patch_and_critic.png` });

  // F04-P04 + BUG-F04-05: Ctrl+Z dentro do input NÃO desfaz o canvas; Ctrl+Z fora do input desfaz canvas
  await aiInput.focus();
  await aiInput.fill('texto em rascunho');
  await page.keyboard.press('Control+z');
  // Título do canvas permanece intacto enquanto foco está no input!
  await expect(frame.locator('h1').first()).toHaveText('Botânica direta na sua rotina');

  // Clique fora de inputs e pressione Ctrl+Z -> desfaz canvas em 0ms e habilita Refazer
  await frame.locator('h1').first().click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await expect(frame.locator('h1').first()).toHaveText('Botânica pura na sua rotina diária');
  await expect(page.getByTestId('editor-redo-btn')).toBeEnabled();

  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_undo_ctrl_z.png` });

  // Refaz com Ctrl+Y e abre Modal Diff (F04-P05)
  await page.keyboard.press('Control+y');
  await expect(frame.locator('h1').first()).toHaveText('Botânica direta na sua rotina');

  await page.getByTestId('editor-diff-pill').click();
  const diffBody = page.getByTestId('editor-diff-modal-body');
  await expect(diffBody).toBeVisible();
  const diffText = await diffBody.innerText();
  expect(diffText).toContain('Capa Principal: título alterado');
  expect(diffText).not.toMatch(/sec_hero|HeroSection|JSON/);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_diff_modal.png` });
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // F04-P06: Guardião WCAG AA Warning Banner + Corrigir em 1 clique
  await page.getByTestId('editor-left-tab-theme').click();
  await page.getByTestId('editor-color-picker-ink').evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '#F1F5F9');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const wcagBanner = page.getByTestId('editor-wcag-warning-banner');
  await expect(wcagBanner).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_wcag_warning_fix.png` });

  await page.getByTestId('editor-wcag-fix-btn').click();
  await expect(wcagBanner).toHaveCount(0);

  // F04-P12: Falha simulada no Patch Cirúrgico -> HumanErrorCard + estorno mantido (60 cr)
  await page.getByTestId('editor-left-tab-layers').click();
  state.simulatePatchError = true;
  await page.getByTestId('editor-ai-command-input').fill('Testar falha GLM');
  await page.getByTestId('editor-ai-command-submit').click();

  await expect(page.getByTestId('editor-patch-error-card')).toBeVisible();
  await expect(page.getByTestId('editor-credit-balance-badge')).toContainText('Saldo: 60 cr');
  await dismissAllToasts(page);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_proof_patch_error_refund.png` });

  // F04-P07: Modo Dark no Estúdio Visual
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('cg_theme', 'dark');
  });
  await dismissAllToasts(page);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_studio_dark_mode.png` });
});

test('FILA 04 Vitrine Pública 390x844 (F04-P08..P11): Quiz 3 passos, Combine & Economize, Dosage Slider & FAQ 200ms', async ({ page }) => {
  const state = createInitialState();
  await setupStudioHarness(page, state);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/?loja=botanica-lume');
  await expect(page.getByTestId('v9-interactive-experience')).toBeVisible();

  // Zero overflow horizontal
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX).toBeLessThanOrEqual(1);

  // F04-P08: Quiz 3 etapas revelando SKU real + Adicionar à Sacola
  await page.getByTestId('quiz-next-step-btn').click();
  await page.getByTestId('quiz-next-step-btn').click();
  const recCard = page.getByTestId('v9-quiz-recommended-card');
  await expect(recCard).toBeVisible();
  await recCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_storefront_quiz_result_390.png` });

  await page.getByTestId('v9-exp-primary-btn').click();
  await expect(page.getByTestId('v9-header-bag-btn')).toContainText('1');

  // F04-P09: Combine e Economize (soma real R$ 200,00 em tabular-nums + 1 pill Pix + adiciona múltiplos SKUs)
  const bundlesSec = page.getByTestId('v9-complementary-bundles');
  await bundlesSec.scrollIntoViewIfNeeded();
  await expect(bundlesSec).toContainText('R$');
  await expect(bundlesSec).toContainText('200,00');
  await expect(bundlesSec).toContainText('no Pix');
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_storefront_bundle_390.png` });

  await page.getByTestId('v9-add-bundle-0').click();
  await expect(page.getByTestId('v9-header-bag-btn')).toContainText('3');

  // F04-P11: ContextualFaq 200ms sem layout shift
  const faqSec = page.getByTestId('v9-contextual-faq');
  await faqSec.scrollIntoViewIfNeeded();
  await page.getByTestId('faq-toggle-1').click();
  await page.waitForTimeout(220);
  await expect(faqSec).toContainText('10% de desconto');
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_storefront_faq_accordion.png` });

  // F04-P10: Recarrega no modo dosage_calculator com slider inteiro (19.99 * 3 = R$ 59,97 sem ponto flutuante!)
  state.formulasIr = buildInitialFormulaV9('dosage_calculator');
  await page.goto('/?loja=botanica-lume');
  const expSec = page.getByTestId('v9-interactive-experience');
  await expect(expSec).toBeVisible();
  const rangeInput = expSec.locator('input[type="range"]');
  await rangeInput.fill('3');
  await rangeInput.dispatchEvent('input');
  await expect(page.getByTestId('v9-exp-total')).toHaveText('R$\u00a059,97');
  await expSec.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila04_storefront_dosage_calc_390.png` });
  await page.getByTestId('v9-exp-primary-btn').click();
  await expect(page.getByTestId('v9-header-bag-btn')).toContainText('6');
});
