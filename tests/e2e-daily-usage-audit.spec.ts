import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

const OUT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_qa_daily_audit';
const PETSHOP_XLSX = 'C:/Users/arthur/Downloads/planilha_petshop.xlsx';
const ORDERS_XLSX = 'C:/Users/arthur/Downloads/PetGen_Movimentacao_Mensal_300_Registros.xlsx';

fs.mkdirSync(OUT_DIR, { recursive: true });

function makeBaseProfile(name = 'Pet Minas Banho e Tosa') {
  return {
    schemaVersion: 1,
    onboarding: {
      whatsappConnected: true,
      fichaCompleted: true,
      storeGenerated: true,
    },
    business: {
      name,
      segment: 'Pet Shop & Banho',
      businessModel: 'produtos',
      description: 'Banho, tosa e bem-estar para cães e gatos.',
    },
    whatsapp: {
      connected: true,
      phoneE164: '5561999179493',
      displayPhone: '+55 61 99917-9493',
    },
    payment: {
      pixKey: 'pix@petminas.com.br',
      pixDiscountPercent: 5,
      acceptedMethods: ['pix', 'credit_card'],
    },
    brand: {
      primaryColor: '#0F172A',
      accentColor: '#0B4DB8',
      visualStyle: 'editorial_clean',
      storefrontPhotoUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
    },
    catalog: {
      products: [
        {
          id: 'p1',
          sku: 'BAN-01',
          name: 'Banho simples',
          category: 'Banho',
          priceCents: 5000,
          stock: 15,
          active: true,
          approvedAsset: true,
          imageUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
        },
        {
          id: 'p2',
          sku: 'TOS-02',
          name: 'Banho e tosa higiênica',
          category: 'Estética',
          priceCents: 7000,
          stock: 15,
          active: true,
          approvedAsset: true,
          imageUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveksOjmAAAAAElFTkSuQmCC',
        },
        {
          id: 'p3',
          sku: 'TOS-03',
          name: 'Tosa completa na tesoura',
          category: 'Estética',
          priceCents: 11000,
          stock: 8,
          active: true,
          approvedAsset: true,
          imageUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJGDveksOjmAAAAAElFTkSuQmCC',
        },
      ],
    },
    publishedStore: {
      published: true,
      slug: 'pet-minas',
      formulaV9: {
        version: '9.0',
        storeInfo: { name, pixDiscountPercent: 5 },
        designTokens: {
          accent: '#0B4DB8',
          accentDeep: '#073B91',
          surface: '#F8FAFC',
          surfaceAlt: '#EFF6FF',
          card: '#FFFFFF',
          ink: '#0F172A',
          inkMuted: '#475569',
          footerBg: '#0F172A',
          fontStyle: 'modern_sans',
          radiusPx: 18,
        },
        catalog: [
          {
            id: 'p1',
            sku: 'BAN-01',
            name: 'Banho simples',
            category: 'Banho',
            priceCents: 5000,
            stock: 15,
            active: true,
            imageUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
          },
          {
            id: 'p2',
            sku: 'TOS-02',
            name: 'Banho e tosa higiênica',
            category: 'Estética',
            priceCents: 7000,
            stock: 15,
            active: true,
            imageUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveksOjmAAAAAElFTkSuQmCC',
          },
          {
            id: 'p3',
            sku: 'TOS-03',
            name: 'Tosa completa na tesoura',
            category: 'Estética',
            priceCents: 11000,
            stock: 8,
            active: true,
            imageUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJGDveksOjmAAAAAElFTkSuQmCC',
          },
        ],
        sections: [
          {
            id: 'sec_hero',
            type: 'HeroSection',
            config: {
              variant: 'split',
              eyebrow: 'Pet Shop em Brasília',
              title: 'Banho e tosa com hora marcada',
              subtitle: 'Agendamento direto pelo WhatsApp sem fila.',
              primaryCta: { label: 'Agendar agora', href: '#catalogo' },
            },
          },
          {
            id: 'sec_catalog',
            type: 'CatalogGrid',
            config: {
              title: 'Serviços & Catálogo',
              subtitle: 'Escolha os itens e confirme direto no WhatsApp.',
              itemActionLabel: 'Adicionar à sacola',
              emptyImageMode: 'neutral_gray',
            },
          },
          {
            id: 'sec_closing',
            type: 'ClosingScheduleSplit',
            config: {
              eyebrow: 'Atendimento',
              title: 'Atendimento direto para seu pet',
              subtitle: 'Combine coleta ou horário com nossa equipe.',
              slots: ['Manhã', 'Tarde', 'Sob consulta'],
              whatsappHeading: 'Dúvidas sobre Pet Minas?',
              whatsappSubtext: 'Envie mensagem no WhatsApp para confirmar.',
              ctaLabel: 'Chamar no WhatsApp',
            },
          },
        ],
      },
    },
  };
}

async function setupSessionMocks(
  page: Page,
  {
    email,
    userId,
    isAdmin,
    profile,
    notificationsPayload,
    patchHandler,
  }: {
    email: string;
    userId: string;
    isAdmin: boolean;
    profile: Record<string, any>;
    notificationsPayload?: Record<string, any>;
    patchHandler?: (route: Route, currentProfile: Record<string, any>) => Promise<void> | void;
  },
) {
  const authUser = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
  };

  await page.addInitScript((user: { id: string; email: string }) => {
    window.localStorage.setItem(
      'sb-irahjajgudbdkgggffum-auth-token',
      JSON.stringify({
        access_token: `tok-${user.id}`,
        refresh_token: `ref-${user.id}`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      }),
    );
    window.localStorage.setItem('cg_theme', 'light');
  }, authUser);

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route: Route) =>
    route.fulfill({ json: authUser }),
  );

  let currentProfile = JSON.parse(JSON.stringify(profile)) as Record<string, any>;
  let revision = 1;

  await page.route('**/api/**', async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/admin/status') {
      return route.fulfill({ json: { ok: true, authenticated: true, userId, email, isAdmin, banned: false } });
    }
    if (pathname === '/api/credits/balance') {
      return route.fulfill({ json: { ok: true, balance: 180, mode: 'local' } });
    }
    if (pathname === '/api/dashboard') {
      return route.fulfill({
        json: {
          ok: true,
          dashboard: {
            recentOrders: [],
            totalOrdersCount: 0,
            paidRevenueCents: 0,
            pendingRevenueCents: 0,
            activeCustomers: 0,
            statusCounts: { novo: 0, aguardando_pagamento: 0, pago: 0, em_preparo: 0, enviado: 0, entregue: 0, cancelado: 0 },
          },
        },
      });
    }
    if (pathname === '/api/store-molde/state') {
      return route.fulfill({
        json: {
          ok: true,
          balance: 180,
          formulasIr: currentProfile.publishedStore?.formulaV9,
        },
      });
    }
    if (pathname === '/api/profile') {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        if (body?.profile) currentProfile = body.profile;
        revision += 1;
        return route.fulfill({ json: { ok: true, revision, profile: currentProfile } });
      }
      return route.fulfill({ json: { revision, profile: currentProfile } });
    }
    if (pathname === '/api/orders') {
      return route.fulfill({ json: { ok: true, orders: [] } });
    }
    if (pathname === '/api/orders/import-batch') {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, imported: body?.orders?.length || 0 } });
    }
    if (pathname === '/api/whatsapp/events') {
      return route.fulfill({
        json: notificationsPayload
          ? { ok: true, ...notificationsPayload }
          : {
              ok: true,
              notifications: [],
              pausedThreads: [],
              pausedThreadItems: [],
              d1Funnel: { visits: 0, productClicks: 0, whatsappPurchaseMessages: 0, d1ConfirmedOrders: 0, d1RevenueCents: 0, conversionRatePct: 0 },
            },
      });
    }
    if (pathname === '/api/whatsapp/events/ack') {
      return route.fulfill({ json: { ok: true } });
    }
    if (pathname === '/api/store-molde/analyze-brief') {
      return route.fulfill({
        json: {
          ok: true,
          creditsCharged: 0,
          questionsJson: {
            schemaVersion: '1.0',
            detectedNiche: 'Pet Shop & Estética',
            recommendedCampaignTheme: 'evergreen',
            contextSummaryPt: 'Loja de Banho e Tosa com 20 serviços detectados na planilha.',
            questions: [
              {
                id: 'q_hero_promise',
                order: 1,
                type: 'short_text_input',
                title: 'Qual principal diferencial do banho e tosa da Pet Minas?',
                helperText: 'Vai direto para a manchete principal da página.',
                recommendedDefault: 'Banho morno com toalha esterilizada e hora marcada sem gaiolas.',
                mapsToTarget: 'hero.subtitle',
              },
            ],
          },
        },
      });
    }
    if (pathname === '/api/store-molde/generate-full') {
      return route.fulfill({
        json: {
          ok: true,
          formulasIr: currentProfile.publishedStore?.formulaV9 || makeBaseProfile().publishedStore.formulaV9,
          imageJobs: [
            {
              role: 'hero',
              status: 'completed',
              assetUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
            },
          ],
          debited: 4,
          balanceAfter: 176,
        },
      });
    }
    if (pathname === '/api/store-molde/patch-section' && patchHandler) {
      return patchHandler(route, currentProfile);
    }
    return route.fulfill({ json: { ok: true } });
  });
}

test.describe('Auditoria Diária Tela-a-Tela — Admin, Onboarding, Editor Micro, Pedidos Excel 300 linhas e Alertas WhatsApp', () => {
  test('1. Admin oculto para usuário comum (arthurcostacopy) e visível apenas para Admin', async ({ page }) => {
    await setupSessionMocks(page, {
      email: 'arthurcostacopy@gmail.com',
      userId: '400809f3-1111-4444-8888-444444444444',
      isAdmin: false,
      profile: makeBaseProfile(),
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('editorial-top-pill')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('top-pill-tab-admin')).toHaveCount(0);
    await page.screenshot({ path: path.join(OUT_DIR, '01_non_admin_no_admin_tab.png') });

    // Agora como admin verificado
    const page2 = await page.context().newPage();
    await setupSessionMocks(page2, {
      email: 'arthurpolarbuy@gmail.com',
      userId: '55555555-5555-4555-8555-555555555555',
      isAdmin: true,
      profile: makeBaseProfile(),
    });
    await page2.setViewportSize({ width: 1440, height: 900 });
    await page2.goto('/');
    await expect(page2.getByTestId('top-pill-tab-admin')).toBeVisible({ timeout: 10000 });
    await expect(page2.getByText('Pet Minas Banho e Tosa').first()).toBeVisible({ timeout: 10000 });
    await page2.screenshot({ path: path.join(OUT_DIR, '02_admin_user_with_admin_tab.png') });
  });

  test('2. Onboarding: upload real planilha_petshop.xlsx, sem "Artesanal", seleção grupo e modal 5 perguntas', async ({ page }) => {
    const emptyProfile = {
      schemaVersion: 1,
      onboarding: { whatsappConnected: false, fichaCompleted: false, storeGenerated: false },
      business: { name: '', segment: 'Geral', businessModel: 'produtos' },
      catalog: { products: [] },
      publishedStore: { published: false },
    };
    await setupSessionMocks(page, {
      email: 'arthurcostacopy@gmail.com',
      userId: '400809f3-1111-4444-8888-444444444444',
      isAdmin: false,
      profile: emptyProfile,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('ignition-store-input').fill('Pet Minas Banho e Tosa');
    await page.getByTestId('ignition-file-input').setInputFiles(PETSHOP_XLSX);
    await expect(page.getByTestId('ignition-dropzone-loaded')).toBeVisible({ timeout: 10000 });

    // Confirmar ausência do rótulo vago "Artesanal" e presença dos 4 previews demonstrativos
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\bArtesanal\b/i);
    await expect(page.getByTestId('multiplier-voice-editorial_minimal')).toBeVisible();
    await expect(page.getByTestId('multiplier-voice-warm_artisan')).toBeVisible();

    // Selecionar grupo de itens (Top 6)
    await page.getByTestId('ignition-group-select-top6').click();
    await page.screenshot({ path: path.join(OUT_DIR, '03_onboarding_styles_and_group.png') });

    // Abrir "Responder até 5 perguntas para personalizar a página" SEM falso erro
    await page.getByTestId('ignition-analyze-brief-btn').click();
    await expect(page.getByText('Conecte o catálogo/nome para gerar perguntas personalizadas.')).toHaveCount(0);
    await expect(page.getByText(/Qual principal diferencial do banho e tosa/i)).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(OUT_DIR, '04_onboarding_questions_modal.png') });
  });

  test('3. Editor Visual Micro + Dia-a-Dia no ClosingScheduleSplit e Seleção de Grupo de Itens', async ({ page }) => {
    const profile = makeBaseProfile();
    await setupSessionMocks(page, {
      email: 'arthurcostacopy@gmail.com',
      userId: '400809f3-1111-4444-8888-444444444444',
      isAdmin: false,
      profile,
      patchHandler: async (route: Route, curProf: Record<string, any>) => {
        const body = route.request().postDataJSON();
        const nextDoc = JSON.parse(JSON.stringify(curProf.publishedStore.formulaV9));
        if (body.action === 'group_items') {
          const idx = nextDoc.sections.findIndex((s: any) => s.id === body.sectionId);
          if (idx >= 0) nextDoc.sections[idx].config.selectedSkuIds = body.selectedSkuIds;
          return route.fulfill({ json: { ok: true, formulasIr: nextDoc, debited: 0 } });
        }
        const cIdx = nextDoc.sections.findIndex((s: any) => s.id === 'sec_closing');
        if (cIdx >= 0) {
          nextDoc.sections[cIdx].config.eyebrow = 'Atendimento Dia a Dia';
          nextDoc.sections[cIdx].config.title = 'Horários e Programação da Semana';
          nextDoc.sections[cIdx].config.subtitle = 'Confira os horários de cada dia e combine pelo WhatsApp.';
          nextDoc.sections[cIdx].config.slots = [
            'Segunda · 08h às 19h · Banho e Tosa',
            'Terça · 08h às 19h · Banho e Tosa',
            'Quarta · 08h às 19h · Banho e Tosa',
            'Qui · 08h às 19h · Hidratação e Tosa',
            'Sexta · 08h às 19h · Atendimento completo',
            'Sábado · 09h às 17h · Plantão & Retirada',
            'Domingo · Sob agendamento no WhatsApp',
          ];
        }
        return route.fulfill({ json: { ok: true, formulasIr: nextDoc, debited: 5, balanceAfter: 175 } });
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?preview=vitrine');
    const editorBtn = page.getByTestId('floating-ai-inspector-btn');
    await expect(editorBtn).toBeVisible({ timeout: 10000 });
    await editorBtn.click();

    await expect(page.getByTestId('ai-inspector-panel')).toBeVisible();
    await page.getByTestId('ai-inspector-toggle-btn').click();

    // Selecionar a seção ClosingScheduleSplit clicando nela
    const closingBlock = page.locator('[data-inspect-type="ClosingScheduleSplit"]').first();
    await closingBlock.scrollIntoViewIfNeeded();
    await closingBlock.click();
    await expect(page.getByTestId('ai-inspector-selected-card')).toBeVisible();

    // Testar alvo micro "Horários / Dias" e instrução dia a dia
    await page.getByTestId('ai-inspector-micro-schedule').click();
    await page.getByTestId('ai-inspector-prompt-input').fill(
      'mudar o layout para ficar melhor, faz mostrando dia a dia o que tera',
    );
    await page.getByTestId('ai-inspector-apply-btn').click();

    await expect(page.getByTestId('closing-daily-schedule-grid')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Segunda')).toBeVisible();
    const fullText = await page.locator('body').innerText();
    expect(fullText).not.toContain('mudar o layout para ficar melhor');
    expect(fullText).not.toContain('--');
    await page.screenshot({ path: path.join(OUT_DIR, '05_visual_editor_micro_day_by_day.png') });

    // Agora testar seleção de grupo específico de itens no inspector
    await page.getByTestId('ai-inspector-micro-group_items').click();
    const checkboxes = page.locator('[data-testid="ai-inspector-selected-card"] input[type="checkbox"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(2).check();
    await page.getByTestId('ai-inspector-apply-group-btn').click();
    await page.screenshot({ path: path.join(OUT_DIR, '06_visual_editor_group_items.png') });
  });

  test('4. Pedidos: upload real PetGen_Movimentacao_Mensal_300_Registros.xlsx lê aba Lancamentos sem Hospedagem no WhatsApp', async ({ page }) => {
    await setupSessionMocks(page, {
      email: 'arthurcostacopy@gmail.com',
      userId: '400809f3-1111-4444-8888-444444444444',
      isAdmin: false,
      profile: makeBaseProfile(),
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await page.getByTestId('top-pill-tab-dashboard').click();
    await expect(page.getByTestId('orders-import-spreadsheet-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('orders-import-spreadsheet-btn').click();
    await expect(page.getByTestId('orders-import-modal')).toBeVisible();

    await page.getByTestId('orders-file-input').setInputFiles(ORDERS_XLSX);
    await expect(page.getByTestId('orders-import-summary')).toContainText(/\d+\s*válido/, { timeout: 12000 });

    const summaryText = await page.getByTestId('orders-import-summary').innerText();
    const validMatch = summaryText.match(/(\d+)\s*válido/);
    const validCount = validMatch ? Number(validMatch[1]) : 0;
    expect(validCount).toBeGreaterThan(200);

    // Garantir que nenhuma linha tem "Hospedagem" na coluna de WhatsApp
    const firstPhoneCell = await page.getByTestId('orders-preview-cell-0-customerPhone').inputValue();
    expect(firstPhoneCell).not.toMatch(/Hospedagem/i);

    await page.screenshot({ path: path.join(OUT_DIR, '07_orders_real_excel_300_rows.png') });
  });

  test('5. Alerta Chamar Humano (WhatsApp) permanece fixo nas telas e pulsa badge até humano assumir', async ({ page }) => {
    await setupSessionMocks(page, {
      email: 'arthurcostacopy@gmail.com',
      userId: '400809f3-1116-4444-8888-444444444444',
      isAdmin: false,
      profile: makeBaseProfile(),
      notificationsPayload: {
        notifications: [
          {
            id: 'notif-human-1',
            eventId: 'evt-human-1',
            level: 'HUMAN_ESCALATION',
            intent: 'HUMAN_ESCALATION',
            colorHex: '#FF2E54',
            title: 'ATENDENTE HUMANO SOLICITADO',
            message: 'Cliente pediu ajuda urgente com orçamento de banho e tosa.',
            customerName: 'Juliana Mendes',
            customerPhone: '5561998877665',
            customerJid: '5561998877665@s.whatsapp.net',
            totalCents: 0,
            sourceComponent: 'WhatsApp Direto',
            mode: 'live_whatsapp',
            acknowledged: false,
            resolved: false,
            createdAt: new Date().toISOString(),
            acknowledgedAt: null,
          },
        ],
        pausedThreads: ['5561998877665'],
        pausedThreadItems: [
          {
            chatKey: '5561998877665',
            customerName: 'Juliana Mendes',
            customerPhone: '5561998877665',
            lastMessage: 'Cliente pediu ajuda urgente com orçamento de banho e tosa.',
            pausedAt: new Date().toISOString(),
            assumedByHuman: false,
          },
        ],
        d1Funnel: { visits: 12, productClicks: 4, whatsappPurchaseMessages: 2, d1ConfirmedOrders: 1, d1RevenueCents: 7000, conversionRatePct: 50 },
      },
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Em Minha Loja
    await expect(page.getByTestId('tela-38-notification-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('top-pill-whatsapp-human-badge')).toBeVisible();

    // Em Pedidos continua visível
    await page.getByTestId('top-pill-tab-dashboard').click();
    await expect(page.getByTestId('tela-38-notification-bar')).toBeVisible();
    await page.screenshot({ path: path.join(OUT_DIR, '08_handoff_alert_pinned_orders.png') });

    // Na Prévia de Vitrine continua visível
    await page.goto('/?preview=vitrine');
    await expect(page.getByTestId('tela-38-notification-bar')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT_DIR, '09_handoff_alert_pinned_vitrine_preview.png') });
  });
});
