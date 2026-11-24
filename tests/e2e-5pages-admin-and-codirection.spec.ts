import { test, expect } from '@playwright/test';
import { FIVE_SHOWCASE_STORES } from '../shared/formula-ir/showcase-five-pages.mjs';

const OUT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_plan10';

test.describe('Plano 10 Docs — Fluxo JSON 5 Perguntas, Modais Multi-Telas, Page Switcher & Co-Direção', () => {
  test('1. Onboarding -> Perguntas JSON (<=5) -> Salvar Contexto', async ({ page }) => {
    const authUser = {
      id: '77777777-7777-4777-8777-777777777777',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'plan10.brief@companygen.test',
    };

    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'sb-irahjajgudbdkgggffum-auth-token',
        JSON.stringify({
          access_token: 'tok-plan10',
          refresh_token: 'ref-plan10',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
      window.localStorage.setItem('cg_theme', 'light');
    }, authUser);

    await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
      route.fulfill({ json: authUser }),
    );

    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/profile') {
        return route.fulfill({
          json: {
            revision: 1,
            profile: {
              schemaVersion: 1,
              onboarding: { whatsappConnected: false, fichaCompleted: false, storeGenerated: false },
              business: { name: '', segment: 'Geral', businessModel: 'produtos' },
              catalog: { products: [] },
              publishedStore: { published: false },
            },
          },
        });
      }
      if (pathname === '/api/store-molde/analyze-brief') {
        return route.fulfill({
          json: {
            ok: true,
            creditsCharged: 0,
            questionsJson: {
              schemaVersion: '1.0',
              detectedNiche: 'Confeitaria Artesanal',
              recommendedCampaignTheme: 'evergreen',
              contextSummaryPt: 'Loja focada em bolos artesanais com 3 itens reais e entrega no mesmo dia.',
              questions: [
                {
                  id: 'q_campaign_angle',
                  order: 1,
                  type: 'single_choice_cards',
                  title: 'Qual gancho principal deve abrir a sua página?',
                  helperText: 'Define a manchete principal e estilo do botão.',
                  recommendedDefault: 'beneficio_pix_prazo',
                  options: [
                    { id: 'beneficio_pix_prazo', label: 'Assado na hora + Vantagem no Pix', hint: 'Conversão imediata' },
                    { id: 'presente_autoral', label: 'Caixa Presenteável de Luxo', hint: 'Foco em ticket maior' },
                  ],
                  mapsToTarget: 'sections[hero].headlineAngle',
                },
                {
                  id: 'q_main_objection',
                  order: 2,
                  type: 'short_text_input',
                  title: 'Qual diferencial concreto destaca sua produção?',
                  helperText: 'Aparece na primeira dobra sem frases genéricas.',
                  recommendedDefault: 'Massa de fermentação natural 24h entregue ainda fresca na sua janela escolhida.',
                  mapsToTarget: 'sections[hero].subheadline',
                },
              ],
            },
          },
        });
      }
      return route.fulfill({ json: { ok: true, balance: 120 } });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('ignition-analyze-brief-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('ignition-niche-pill-papelaria').click();
    await page.getByTestId('ignition-analyze-brief-btn').click();

    await expect(page.getByTestId('dynamic-brief-questions-modal')).toBeVisible();
    await expect(page.getByTestId('brief-q-q_campaign_angle')).toBeVisible();
    await expect(page.getByTestId('dynamic-brief-questions-modal')).not.toContainText('sections[hero]');
    await page.screenshot({ path: `${OUT_DIR}/flow_brief_questions_modal.png` });

    // Avança pergunta 1 -> pergunta 2 no stepper minimalista 1-por-vez
    await page.getByTestId('brief-next-btn').click();
    await expect(page.getByTestId('brief-q-q_main_objection')).toBeVisible();
    await page.getByTestId('brief-confirm-release-btn').click();
    await expect(page.getByTestId('dynamic-brief-questions-modal')).toHaveCount(0);
    await expect(page.getByTestId('ignition-analyze-brief-btn')).toContainText('Briefing IA calibrado');
  });

  test('2. Prévia Multi-Telas: Modal Expansão -> Nova Tela -> Page Switcher -> Magia Roxa Co-Direção Hotspot', async ({ page }) => {
    const seedStore = FIVE_SHOWCASE_STORES[3]; // Atelier Baunilha & Mel (tem InteractiveImageTextStage!)
    const authUser = {
      id: seedStore.userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'atelie@companygen.test',
    };

    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'sb-irahjajgudbdkgggffum-auth-token',
        JSON.stringify({
          access_token: 'tok-atelier',
          refresh_token: 'ref-atelier',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
      window.localStorage.setItem('cg_theme', 'light');
    }, authUser);

    await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
      route.fulfill({ json: authUser }),
    );

    const baseFormula = seedStore.profile.storeLayout.formulasIr;

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;

      if (pathname === '/api/profile') {
        return route.fulfill({ json: { revision: 1, provider: 'local', profile: seedStore.profile } });
      }
      if (pathname === '/api/credits/balance') {
        return route.fulfill({ json: { ok: true, balance: 100, isAdmin: false } });
      }
      if (pathname === '/api/store-molde/analyze-brief') {
        return route.fulfill({
          json: {
            ok: true,
            creditsCharged: 0,
            questionsJson: {
              schemaVersion: '1.0',
              detectedNiche: 'Confeitaria Natalina',
              recommendedCampaignTheme: 'natal',
              contextSummaryPt: 'Subpágina de Natal para Atelier Baunilha & Mel.',
              questions: [
                {
                  id: 'q_hero_promise',
                  order: 1,
                  type: 'short_text_input',
                  title: 'Promessa da Ceia & Kits de Natal:',
                  recommendedDefault: 'Encomendas frescas para entrega em 24/12 até as 15h.',
                  mapsToTarget: 'sections[hero].subheadline',
                },
              ],
            },
          },
        });
      }
      if (pathname === '/api/store-molde/create-page') {
        const natalPage = {
          id: 'page_natal',
          slug: 'natal',
          filename: 'pages/natal.html',
          title: 'Especial de Natal & Presentes',
          campaignTheme: 'natal',
          isHome: false,
          sections: [{ id: 'sec_n_cat', type: 'CatalogGrid', config: { title: 'Natal' } }],
          atomicBlueprint: {
            engineSeed: { groundMode: 'warm_linen', displayVoice: 'archivo', bodyVoice: 'manrope' },
            brandTokens: { archetype: 'natal', paletteSource: 'modal', colors: { primary: '#0C1A13', accent: '#B3262E', neutral: '#F5F1E8' } },
            imageRequests: [],
            sections: [
              {
                tuple: ['sec_natal_hero', 'campaign_christmas_hero', 'ESTADO_2'],
                surface: 'ui:bg=#0C1A13 lum=0.06',
                resolvedMedia: { imageUrl: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=1400&q=80' },
                textSlots: [
                  { micro: ['left_col', 'display', 'CEIA DE NATAL', 'ui:sz=92 wt=900', 'icon:none'] },
                  { micro: ['left_col', 'body', 'Encomendas frescas para entrega em 24/12 até as 15h.', 'ui:sz=16', 'icon:none'] },
                ],
                content: { couponCode: 'NATAL20', discountPercent: 20, ctaPrimaryLabel: 'VER CAIXAS DE NATAL' },
              },
            ],
          },
        };
        const updatedIr = { ...baseFormula, pages: [natalPage] };
        return route.fulfill({
          json: { ok: true, debited: 5, balanceAfter: 95, page: natalPage, formulasIr: updatedIr },
        });
      }
      if (pathname === '/api/store-molde/patch-section') {
        return route.fulfill({ status: 500, body: '{}' }); // exerce fallback ao vivo instantâneo
      }
      return route.fulfill({ json: { ok: true } });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?preview=vitrine');
    await expect(page.getByTestId('vitrine-overlay-persistent')).toBeVisible({ timeout: 10000 });

    // 1) Testa interatividade Hotspot Imagem + Texto na página principal
    await page.getByTestId('hotspot-pin-02').click();
    await expect(page.locator('[data-atomic-role="interactive_image_text_stage"]')).toContainText('Ganache 70% Origem');
    await page.screenshot({ path: `${OUT_DIR}/flow_interactive_hotspot_sync.png` });

    // 2) Abre Modal branco minimalista de Nova Tela -> Saldo visivel, sem termos internos -> Passo 1 -> Passo 2 -> Pergunta JSON -> Subpagina
    await page.getByTestId('open-expansion-modal-btn').click();
    const expModal = page.getByTestId('store-pages-expansion-modal');
    await expect(expModal).toBeVisible();
    await expect(page.getByTestId('modal-credit-balance-pill')).toContainText('Saldo: 100 cr');
    await expect(expModal).not.toContainText('EXPANSÃO MODULAR DA VITRINE');
    await expect(expModal).not.toContainText('Vert Club');
    await page.screenshot({ path: `${OUT_DIR}/flow_expansion_modal.png` });

    await page.getByTestId('expansion-continue-btn').click();
    await page.getByTestId('expansion-generate-btn').click();
    await expect(page.getByTestId('dynamic-brief-questions-modal')).toBeVisible();
    await page.getByTestId('brief-confirm-release-btn').click();

    // 3) Confirma Page Switcher na subpágina Natal recém-gerada e alternância de volta para Principal
    await expect(page.getByTestId('page-switch-natal')).toBeVisible();
    await expect(page.getByTestId('atomic-sec-sec_natal_hero')).toContainText('CEIA DE NATAL');
    await page.screenshot({ path: `${OUT_DIR}/flow_page_switcher_subpage.png` });

    await page.getByTestId('page-switch-home').click();
    await expect(page.locator('[data-atomic-role="interactive_image_text_stage"]')).toBeVisible();

    // 4) Editor branco -> aba Direção -> Centralizado + Fonte Gigante + adiciona hotspot na Hero
    await page.getByTestId('open-ai-inspector-btn').first().click();
    await page.getByTestId('ai-inspector-toggle-btn').click();
    const heroSec = page.getByTestId('atomic-sec-sec_doce_hero');
    const hBox = await heroSec.boundingBox();
    expect(hBox).toBeTruthy();
    if (hBox) {
      await page.mouse.click(hBox.x + 150, hBox.y + 100);
    }
    await page.getByTestId('ai-inspector-tab-direction').click();
    await page.getByTestId('ai-direction-anchor-center').click();
    await expect(heroSec).toHaveAttribute('data-text-anchor', 'center');
    await page.getByTestId('ai-direction-scale-poster_mega').click();
    await page.getByTestId('ai-hotspot-label-input').fill('04');
    await page.getByTestId('ai-hotspot-headline-input').fill('Cobertura Artesanal');
    await page.getByTestId('ai-add-hotspot-btn').click();
    await expect(page.getByTestId('hero-hotspot-04')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/flow_magia_roxa_direction_hotspot.png` });
  });

  test('3. Fluxos-Molde de Mensagens WhatsApp Minimalista -> Aprovar & Gerar mais mensagens', async ({ page }) => {
    const seedStore = FIVE_SHOWCASE_STORES[3]; // Atelier Baunilha & Mel
    const authUser = {
      id: seedStore.userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'atelie.wpp@companygen.test',
    };

    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'sb-irahjajgudbdkgggffum-auth-token',
        JSON.stringify({
          access_token: 'tok-wpp-flows',
          refresh_token: 'ref-wpp-flows',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
      window.localStorage.setItem('cg_theme', 'light');
    }, authUser);

    await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
      route.fulfill({ json: authUser }),
    );

    const flowsState = [
      {
        id: 'flow_boas_vindas_triagem',
        title: 'Boas-vindas & Encomendas do Dia',
        intentTag: 'greeting_triage',
        status: 'approved',
        enabledInBot: true,
        sampleCustomerTrigger: 'Oi, quero encomendar um bolo para sexta.',
        steps: [
          {
            stepOrder: 1,
            role: 'assistant',
            label: 'Abertura direta',
            body: 'Olá! Aqui é da Atelier Baunilha & Mel. Temos Bolo Chocolate Belga 70% pronto para sexta com 8% OFF no Pix.',
          },
        ],
      },
      {
        id: 'flow_orcamento_pix_combo',
        title: 'Orçamento de Combo + Vantagem Pix',
        intentTag: 'bundle_pix_quote',
        status: 'pending_review',
        enabledInBot: true,
        sampleCustomerTrigger: 'Quanto fica 2 caixas para presente?',
        steps: [
          {
            stepOrder: 1,
            role: 'assistant',
            label: 'Cálculo rápido',
            body: 'Levando 2 itens na mesma entrega você já libera 10% OFF automático no Pix.',
          },
        ],
      },
    ];

    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/profile') {
        return route.fulfill({ json: { revision: 1, provider: 'local', profile: seedStore.profile } });
      }
      if (pathname === '/api/whatsapp/dados') {
        return route.fulfill({
          json: {
            ok: true,
            conectado: true,
            status: 'connected',
            numeroBot: '+5511999998888',
            config: { botAtivo: true, enviarFotoAutomatica: true },
          },
        });
      }
      if (pathname === '/api/whatsapp/ai/message-flows') {
        return route.fulfill({ json: { ok: true, flows: flowsState } });
      }
      if (pathname === '/api/whatsapp/ai/message-flows/action') {
        flowsState[1] = { ...flowsState[1], status: 'approved' };
        return route.fulfill({ json: { ok: true, flows: flowsState } });
      }
      if (pathname === '/api/whatsapp/ai/message-flows/generate-more') {
        const extra = {
          id: 'flow_objecao_garantia',
          title: 'Dúvida de Prazo & Conservação',
          intentTag: 'objection_handling',
          status: 'pending_review',
          enabledInBot: true,
          sampleCustomerTrigger: 'Quanto tempo antes preciso encomendar?',
          steps: [
            {
              stepOrder: 1,
              role: 'assistant',
              label: 'Explicação clara',
              body: 'Trabalhamos com janela de 24h de antecedência para assar tudo fresco na manhã da retirada.',
            },
          ],
        };
        return route.fulfill({ json: { ok: true, flows: [...flowsState, extra], addedCount: 1 } });
      }
      return route.fulfill({ json: { ok: true, templates: [] } });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: /^WhatsApp/ }).first().click();
    await page.getByTestId('wpp-drawer-quick-replies-btn').click();
    await expect(page.getByTestId('whatsapp-message-flows-panel')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('wpp-flow-item-flow_orcamento_pix_combo').click();
    await page.getByTestId('wpp-flow-approve-btn').click();
    await expect(page.getByTestId('wpp-flow-approve-btn')).toContainText('Fluxo aprovado');

    await page.getByTestId('wpp-generate-more-flows-btn').click();
    await expect(page.getByTestId('wpp-flow-item-flow_objecao_garantia')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/flow_whatsapp_message_flows.png` });

    // Simula a Conversa Fake do WhatsApp
    await page.getByTestId('wpp-simulate-fake-chat-btn').click();
    await expect(page.getByTestId('wpp-fake-chat-simulator')).toBeVisible();
    await expect(page.getByTestId('fake-chat-bubble-customer')).toBeVisible();
    await page.getByTestId('fake-chat-instant-btn').click();
    await expect(page.getByTestId('fake-chat-bubble-sofia-0')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/flow_fake_chat_simulation.png` });

    // Testa abertura do modal direto pela Vitrine
    await page.goto('/?preview=vitrine');
    await expect(page.getByTestId('open-whatsapp-flows-btn')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('open-whatsapp-flows-btn').click();
    await expect(page.getByTestId('postgen-whatsapp-modal')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/modal_whatsapp_post_generation.png` });
  });
});
