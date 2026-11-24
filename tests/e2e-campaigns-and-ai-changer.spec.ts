import { test, expect } from '@playwright/test';

const OUT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_campaigns';

const PNG_SWATCH_BLUE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR42mNk+M8ABYwMjIwwBgAJAAH/8o9IAAAAAABJRU5ErkJggg==';

const SAMPLE_PRODUCTS = [
  {
    id: 'n_1',
    sku: 'NAT-01',
    name: 'Boné Trail Pinho Five-Panel',
    category: 'Presentes',
    description: 'Tecido respirável com emblema bordado em edição limitada de inverno.',
    priceCents: 14900,
    variation: 'Tamanho único',
    stock: 18,
    stockQty: 18,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0771/4544/0352/files/paaRZIkMLFTRQPNP.jpg?v=1793772454&width=800&height=1000&crop=center',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'n_2',
    sku: 'NAT-02',
    name: 'Boné Trucker Solstício Chumbo',
    category: 'Kits',
    description: 'Patch tecido de alta densidade com traseira ventilada para trilha.',
    priceCents: 16900,
    variation: 'Edição Dezembro',
    stock: 14,
    stockQty: 14,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0771/4544/0352/files/CyNMMhVTpgVYFuap.jpg?v=1793773192&width=800&height=1000&crop=center',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'n_3',
    sku: 'NAT-03',
    name: 'Camiseta Merino Trail Noturna',
    category: 'Vestuário',
    description: 'Lã merino térmica leve com secagem rápida para clima frio.',
    priceCents: 25900,
    variation: 'P ao GG',
    stock: 9,
    stockQty: 9,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0771/4544/0352/files/HbqFzxXBtknZSbJn.jpg?v=1793772455&width=800&height=1000&crop=center',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'n_4',
    sku: 'NAT-04',
    name: 'Kit 2 Pares Meia Tricô Montanha',
    category: 'Presentes',
    description: 'Par bordô e verde pinho embrulhados para presente de Natal.',
    priceCents: 9900,
    variation: 'Kit com 2 pares',
    stock: 25,
    stockQty: 25,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/0771/4544/0352/files/GROImkdwsUTtToic.jpg?v=1793772454&width=800&height=1000&crop=center',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
];

const BF_PRODUCTS = [
  {
    id: 'bf_1',
    sku: 'BF-01',
    name: 'Kit Coador Vidro + Bule Bico Fino',
    category: 'Lote Principal',
    description: 'Tudo para a extração perfeita: coador cerâmico, jarra com colar de cortiça, chaleira gooseneck, balança e 100 filtros.',
    priceCents: 38900,
    variation: '40 kits no lote',
    stock: 40,
    stockQty: 40,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/1009/9854/5688/files/LPtxmhbpOhrnsSZw.png?v=1792513892&width=1200',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'bf_2',
    sku: 'BF-02',
    name: 'Café Espresso Torra Escura 340g',
    category: 'Torra Fresca',
    description: 'Notas intensas de chocolate amargo e melaço, corpo encorpado ideal para espresso e moka.',
    priceCents: 6800,
    variation: 'Grãos ou moído na hora',
    stock: 60,
    stockQty: 60,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/1009/9854/5688/files/MDETooilbheMgIGs.png?v=1792513890&width=900',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'bf_3',
    sku: 'BF-03',
    name: 'Café Origem Única Serra Alta 340g',
    category: 'Microlote',
    description: 'Torra clara a média com doçura de frutas amarelas, caramelo e finalização limpa para coados.',
    priceCents: 7900,
    variation: 'Microlote sazonal',
    stock: 35,
    stockQty: 35,
    active: true,
    imageUrl: 'https://cdn.shopify.com/s/files/1/1009/9854/5688/files/qAofgfGEELpufLmB.png?v=1792513891&width=900',
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
];

const CLINIC_PRODUCTS = [
  {
    id: 'cl_1',
    sku: 'AVAL-60',
    name: 'Avaliação Inicial & Mapeamento',
    category: 'Joelho',
    description: 'Histórico clínico completo, testes funcionais em carga, primeira sessão de alívio e plano escrito em fases.',
    priceCents: 24000,
    variation: '60 min · Presencial',
    stock: 15,
    stockQty: 15,
    active: true,
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'cl_2',
    sku: 'ACOMP-45',
    name: 'Sessão de Reabilitação Individual',
    category: 'Lombar',
    description: 'Terapia manual direcionada, fortalecimento supervisionado sem fila e ajuste semanal de carga.',
    priceCents: 19000,
    variation: '45 min · Individual',
    stock: 20,
    stockQty: 20,
    active: true,
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
  {
    id: 'cl_3',
    sku: 'POS-OP-8',
    name: 'Programa Pós-Operatório (8 Sessões)',
    category: 'Ombro',
    description: 'Protocolo contínuo para LCA, menisco ou manguito rotador com metas objetivas de retorno ao esporte.',
    priceCents: 136000,
    variation: '6–8 semanas',
    stock: 10,
    stockQty: 10,
    active: true,
    approvedAsset: true,
    updatedAt: '2026-11-23T08:00:00.000Z',
  },
];

test.describe('Campanhas (Natal, Black Friday, Consultório) + Troca de Imagem & Morph IA', () => {
  test('1. Renderiza Natal, Black Friday e Consultório no palco CLI branco com screenshots reais', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?virtual_tuple_harness=1', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="virtual-tuple-harness-root"]');

    // A) NATAL (Vert Club Fidelity: Hero moldura tricotada 115px + Cupom Rasgavel + 4 Checkpoints)
    await page.evaluate((products) => {
      (window as any).__setVirtualHarnessPayload({
        clause: 'campaign',
        caseId: 'natal',
        label: 'Campanha Natal',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#0C1A13',
        accentColor: '#B3262E',
        groundMode: 'warm_linen',
        engineSeed: { displayVoice: 'archivo', bodyVoice: 'manrope' },
        storeName: 'Vert Clube Brasil',
        products,
        sections: [
          {
            tuple: ['sec_hero', 'campaign_christmas_hero', 'ESTADO_2'],
            surface: 'ui:bg=#0C1A13 lum=0.06',
            resolvedMedia: {
              imageUrl: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=1400&q=80',
            },
            textSlots: [
              { micro: ['left_col', 'display', 'A NOITE DE NATAL', 'ui:sz=96 wt=900', 'icon:none'] },
              { micro: ['left_col', 'body', '20% OFF em toda a linha de inverno e presentes de trilha. Rasgue o passe ao lado para liberar seu código.', 'ui:sz=16 wt=400', 'icon:none'] },
            ],
            content: {
              ctaPrimaryLabel: 'COMPRAR A COLEÇÃO',
              couponCode: 'NATAL20',
              discountPercent: 20,
            },
          },
          {
            tuple: ['sec_checkpoints', 'campaign_christmas_checkpoints', 'ESTADO_2'],
            surface: 'ui:bg=#12261C lum=0.08',
            textSlots: [
              { micro: ['top_left', 'heading', 'QUATRO PARADAS', 'ui:sz=56 wt=900', 'icon:none'] },
            ],
            content: { accentHeading: 'ATÉ O SOLSTÍCIO', goldHex: '#C9A24A' },
          },
        ],
      });
    }, SAMPLE_PRODUCTS);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('atomic-sec-sec_checkpoints')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/campaign_natal_full.png`, fullPage: true });

    // B) BLACK FRIDAY (Northpaw Fidelity: H1 180px Big Shoulders + Carimbo -30% + Ticker Diagonal + THE CARD + Regras)
    await page.evaluate((products) => {
      (window as any).__setVirtualHarnessPayload({
        clause: 'campaign',
        caseId: 'blackfriday',
        label: 'Campanha Black Friday',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#0B0A09',
        accentColor: '#FF5B14',
        groundMode: 'warm_linen',
        engineSeed: { displayVoice: 'big_shoulders', bodyVoice: 'manrope' },
        storeName: 'Norte Torra Café',
        products,
        sections: [
          {
            tuple: ['sec_bf_hero', 'campaign_blackfriday_hero', 'ESTADO_2'],
            surface: 'ui:bg=#0B0A09 lum=0.04',
            resolvedMedia: {
              imageUrl: 'https://cdn.shopify.com/s/files/1/1009/9854/5688/files/LPtxmhbpOhrnsSZw.png?v=1792513892&width=1400',
            },
            textSlots: [
              { micro: ['left_col', 'display', 'BLACK|FRIDAY', 'ui:sz=140 wt=900', 'icon:none'] },
              { micro: ['left_col', 'body', 'Até 30% OFF em microlotes de café torrado na semana e no kit completo de preparo.', 'ui:sz=16 wt=400', 'icon:none'] },
            ],
            content: {
              cityTag: 'TORREFAÇÃO ARTESANAL',
              subheadline: 'TRÊS OFERTAS. 40 KITS. SEM REPETIÇÃO.',
              stampText: '-30%',
              stampSub: 'LOTE PRINCIPAL · 40 KITS',
            },
          },
          {
            tuple: ['sec_bf_drop', 'campaign_blackfriday_drop', 'ESTADO_2'],
            surface: 'ui:bg=#0B0A09 lum=0.04',
            textSlots: [{ micro: ['top_left', 'heading', 'OS LOTES', 'ui:sz=96 wt=900', 'icon:none'] }],
            content: { stampLabel: 'SAVE 30%' },
          },
          {
            tuple: ['sec_bf_terms', 'campaign_blackfriday_terms', 'ESTADO_2'],
            surface: 'ui:bg=#0B0A09 lum=0.04',
            content: {},
          },
        ],
      });
    }, BF_PRODUCTS);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('atomic-sec-sec_bf_drop')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/campaign_blackfriday_full.png`, fullPage: true });

    // C) CONSULTÓRIO / CLÍNICA (Motion Physio Fidelity: Hero Editorial + Mapa Anatômico SVG + Equipe + Preços c/ Garantias + Placar Evolução)
    await page.evaluate((products) => {
      (window as any).__setVirtualHarnessPayload({
        clause: 'campaign',
        caseId: 'consultorio',
        label: 'Consultório',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#1E3530',
        accentColor: '#C65D3B',
        groundMode: 'warm_linen',
        engineSeed: { displayVoice: 'fraunces', bodyVoice: 'manrope' },
        storeName: 'Instituto Motion Fisio',
        products,
        sections: [
          {
            tuple: ['sec_clinic_hero', 'clinic_editorial_hero', 'ESTADO_2'],
            surface: 'ui:bg=#F6F0E6 lum=0.95',
            resolvedMedia: {
              imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&q=80',
            },
            textSlots: [
              { micro: ['left_col', 'display', 'Em cada consulta, você|vê o progresso.', 'ui:sz=58 wt=600', 'icon:none'] },
              { micro: ['left_col', 'body', 'Três fisioterapeutas especialistas em lesões esportivas e reabilitação pós-operatória. Plano mensurável desde a primeira avaliação.', 'ui:sz=16 wt=400', 'icon:none'] },
            ],
            content: {
              eyebrow: 'LESÕES ESPORTIVAS · REABILITAÇÃO PÓS-OPERATÓRIA',
              ctaPrimaryLabel: 'Agende a primeira consulta',
            },
          },
          {
            tuple: ['sec_clinic_map', 'clinic_symptom_map', 'ESTADO_2'],
            surface: 'ui:bg=#1E3530 lum=0.14',
            textSlots: [
              { micro: ['top_left', 'heading', 'Onde dói? Toque para ver como tratamos.', 'ui:sz=38 wt=600', 'icon:none'] },
            ],
          },
          {
            tuple: ['sec_clinic_team', 'clinic_specialists_deck', 'ESTADO_2'],
            surface: 'ui:bg=#F6F0E6 lum=0.95',
            textSlots: [
              { micro: ['top_left', 'heading', 'Três especialistas. Um profissional com você do início à alta.', 'ui:sz=36 wt=600', 'icon:none'] },
            ],
            content: {
              specialists: [
                {
                  name: "Yi'an Lin",
                  role: 'Diretor clínico · Reabilitação pós-operatória',
                  years: '12 anos de experiência clínica',
                  quote: 'Cada semana após a cirurgia tem uma meta clara. Você nunca precisa adivinhar o que vem depois.',
                  imageUrl: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=700&q=80',
                  tags: ['Pós-reconstrução de LCA', 'Reparo do manguito rotador', 'Artroplastia de joelho'],
                },
                {
                  name: 'Zack Zhou',
                  role: 'Lesões esportivas · Retorno ao esporte',
                  years: '8 anos de experiência clínica',
                  quote: 'Não tratamos você apenas para sair da dor. Treinamos para voltar ao jogo.',
                  imageUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=700&q=80',
                  tags: ['Joelho de corredor', 'Entorse de tornozelo', 'Retorno à corrida'],
                },
                {
                  name: 'Emma Hart',
                  role: 'Coluna · Terapia manual',
                  years: '9 anos de experiência clínica',
                  quote: 'Primeiro descobrimos por que dói. Depois decidimos como treinar.',
                  imageUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=700&q=80',
                  tags: ['Dor lombar persistente', 'Cervicalgia e tensão', 'Mobilização articular'],
                },
              ],
            },
          },
          {
            tuple: ['sec_clinic_tiers', 'clinic_pricing_tiers', 'ESTADO_2'],
            surface: 'ui:bg=#FBF8F2 lum=0.97',
            textSlots: [
              { micro: ['top_left', 'heading', 'Preços claros. Sem surpresas na conta.', 'ui:sz=38 wt=600', 'icon:none'] },
            ],
          },
          {
            tuple: ['sec_clinic_cases', 'clinic_case_scoreboard', 'ESTADO_2'],
            surface: 'ui:bg=#F6F0E6 lum=0.95',
            textSlots: [
              { micro: ['top_left', 'heading', 'Não é só melhorar um pouco. Os números evoluem.', 'ui:sz=38 wt=600', 'icon:none'] },
            ],
            content: {
              cases: [
                {
                  badge: 'PÓS-OPERATÓRIO · JOELHO',
                  title: 'De volta ao campo 9 meses após reconstrução de LCA',
                  before: '62%',
                  after: '95%',
                  problem: 'Rompimento de LCA em partida e insegurança para retornar a mudanças rápidas de direção.',
                  solution: 'Controle progressivo de carga isométrica, força excêntrica de quadríceps e testes de salto.',
                  outcome: 'Aprovado em todos os testes de simetria lateral com retorno competitivo seguro.',
                },
                {
                  badge: 'LESÃO ESPORTIVA · CORREDOR',
                  title: 'De dor aos 3 km a uma meia maratona sem dor',
                  before: '7/10',
                  after: '1/10',
                  problem: 'Dor patelofemoral recorrente que interrompia treinos semanais acima de 3 km.',
                  solution: 'Ajuste de cadência em +8%, fortalecimento de glúteo médio e controle gradual de rodagem.',
                  outcome: 'Completou 21 km em 11 semanas sem desconforto pós-prova.',
                },
              ],
            },
          },
        ],
      });
    }, CLINIC_PRODUCTS);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('atomic-sec-sec_clinic_map')).toBeVisible();
    await expect(page.getByTestId('atomic-sec-sec_clinic_team')).toBeVisible();
    await expect(page.getByTestId('atomic-sec-sec_clinic_tiers')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/campaign_consultorio_full.png`, fullPage: true });
  });

  test('2. Inspetor Magia Roxa troca imagem ao vivo E converte seção para componente de campanha', async ({ page }) => {
    const authUser = {
      id: '66666666-6666-4666-8666-666666666666',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa@companygen.test',
      user_metadata: { company_name: 'Vitrine Teste IA' },
    };

    await page.addInitScript((user) => {
      window.localStorage.setItem(
        'sb-irahjajgudbdkgggffum-auth-token',
        JSON.stringify({
          access_token: 'tok-test',
          refresh_token: 'ref-test',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
      window.localStorage.setItem('cg_theme', 'light');
    }, authUser);

    await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authUser) });
    });

    const mockFormula = {
      version: '9.0',
      sections: [
        {
          id: 'sec_hero',
          type: 'HeroSection',
          config: {
            variant: 'split',
            eyebrow: '',
            title: 'Vitrine Teste IA',
            subtitle: 'Troque imagem ou transforme qualquer componente ao vivo.',
            imageUrl: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&q=80',
            primaryCta: { label: 'Explorar', href: '#catalogo' },
          },
        },
        {
          id: 'sec_highlights',
          type: 'HighlightsGrid',
          config: {
            title: 'Destaques',
            columns: 2,
            cards: [
              { title: 'Item 1', description: 'Desc 1', imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80' },
            ],
          },
        },
      ],
    };

    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;

      if (pathname === '/api/store-molde/patch-section') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return;
      }

      if (pathname === '/api/credits/balance') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, balance: 250, isAdmin: false, banned: false }),
        });
        return;
      }

      if (pathname === '/api/profile') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            revision: 1,
            provider: 'local',
            profile: {
              schemaVersion: 1,
              onboarding: { whatsappConnected: true, whatsappConfirmed: true, fichaCompleted: true, storeGenerated: true },
              business: { name: 'Vitrine Teste IA', segment: 'Moda', businessModel: 'produtos', description: 'Loja teste' },
              brand: { primaryColor: '#1E3530', accentColor: '#C65D3B' },
              catalog: {
                products: [
                  { id: '1', sku: 'SKU-1', name: 'Produto Alpha', category: 'Destaques', priceCents: 12900, active: true, stock: 5 },
                  { id: '2', sku: 'SKU-2', name: 'Produto Beta', category: 'Consultório', priceCents: 19900, active: true, stock: 5 },
                ],
              },
              whatsapp: { phoneE164: '5511987654321' },
              payment: { pixKey: '11987654321', pixDiscountPercent: 5, acceptedMethods: ['pix'] },
              publishedStore: { published: true, publicSlug: 'vitrine-teste-ia', sourceRevision: 1 },
              storeLayout: { formulasIr: mockFormula },
              storefrontFormula: mockFormula,
            },
          }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?preview=vitrine');
    await expect(page.getByTestId('vitrine-overlay-persistent')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('open-ai-inspector-btn').first()).toBeVisible({ timeout: 10000 });

    await page.getByTestId('open-ai-inspector-btn').first().click();
    await page.getByTestId('ai-inspector-toggle-btn').click();

    // Selecionar a HeroSection com clique no brilho roxo
    const heroSec = page.locator('[data-inspect-section="sec_hero"]').first();
    const hBox = await heroSec.boundingBox();
    expect(hBox).toBeTruthy();
    if (hBox) {
      await page.mouse.move(hBox.x + 180, hBox.y + 120);
      await page.mouse.click(hBox.x + 180, hBox.y + 120);
    }
    await expect(page.getByTestId('ai-inspector-selected-card')).toBeVisible();

    // 1) TESTE DE TROCA REAL DE IMAGEM
    await page.getByTestId('ai-inspector-tab-image').click();
    await page.getByTestId('ai-inspector-image-url-input').fill(PNG_SWATCH_BLUE);
    await page.getByTestId('ai-inspector-apply-image-btn').click();
    await expect.poll(async () => heroSec.locator('img').first().getAttribute('src')).toBe(PNG_SWATCH_BLUE);
    await page.screenshot({ path: `${OUT_DIR}/inspector_image_changed.png` });

    // 2) TESTE DE CONVERSÃO DE COMPONENTE PARA MAPA DE CONSULTÓRIO
    await page.getByTestId('ai-inspector-tab-component').click();
    await page.getByTestId('ai-morph-clinic_symptom_map').click();
    await expect(page.getByTestId('atomic-sec-sec_hero')).toBeVisible();
    await expect(page.locator('[data-atomic-role="clinic_symptom_map"]')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/inspector_component_morphed.png` });
  });
});
