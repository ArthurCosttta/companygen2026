import { expect, test, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174';
const TRAILER_PRINTS_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_trailer_takes';
const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '99999999-9999-4999-8999-999999999999';

const ASSET_ROOT = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const TRAILER_STUDIO_ASSETS: Record<string, string> = {
  'hero_main': path.join(ASSET_ROOT, 'hero_main_1795290430001.jpg'),
  'prod_1': path.join(ASSET_ROOT, 'prod_1_1795290432018.jpg'),
  'prod_2': path.join(ASSET_ROOT, 'prod_2_1795290442359.jpg'),
  'prod_3': path.join(ASSET_ROOT, 'prod_3_1795290453091.jpg'),
  'prod_4': path.join(ASSET_ROOT, 'prod_4_1795290500306.jpg'),
  'prod_5': path.join(ASSET_ROOT, 'prod_5_1795290439877.jpg'),
  'prod_6': path.join(ASSET_ROOT, 'prod_6_1795290450007.jpg'),
};

function loadStudioAssetBuffer(pathname: string): { buffer: Buffer; contentType: string } {
  for (const [key, filePath] of Object.entries(TRAILER_STUDIO_ASSETS)) {
    if (pathname.includes(key) && fs.existsSync(filePath)) {
      return { buffer: fs.readFileSync(filePath), contentType: 'image/jpeg' };
    }
  }
  const fallback = TRAILER_STUDIO_ASSETS.hero_main;
  if (fs.existsSync(fallback)) {
    return { buffer: fs.readFileSync(fallback), contentType: 'image/jpeg' };
  }
  return {
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=',
      'base64',
    ),
    contentType: 'image/png',
  };
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
              imageUrl: `/api/store-molde/${TEST_USER_ID}/assets/generated/prod_1.jpg`,
            },
            {
              eyebrow: 'ESCRITA',
              title: 'Kit Escrita Executiva Preto Matte',
              description: 'Caneta rollerball metálica com estojo rígido.',
              ctaLabel: 'Ver Kit',
              href: '#catalogo',
              imageUrl: `/api/store-molde/${TEST_USER_ID}/assets/generated/prod_3.jpg`,
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
    ],
    footer: {
      columns: [],
      copyright: `${storeName} · Todos os direitos reservados`,
    },
  };
}

function buildProductsList() {
  const assetBase = `/api/store-molde/${TEST_USER_ID}/assets/generated`;
  return [
    {
      id: 'prod_1',
      sku: 'PAP-001',
      name: 'Cesta Café Artesanal Manhã',
      category: 'Kits & Cestas',
      description: 'Cesta matinal com caneca cerâmica, drip coffee e caderno de notas.',
      priceCents: 18990,
      variation: 'Completa',
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
  ];
}

function buildInitialMockProfile() {
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
      products: [],
    },
    publishedStore: {
      published: false,
      publicSlug: 'papelaria',
      sourceRevision: 1,
    },
  };
}

function buildReadyMockProfile() {
  const heroUrl = `/api/store-molde/${TEST_USER_ID}/assets/generated/hero_main.png`;
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
    brand: {
      logoUrl: '',
      heroImageUrl: heroUrl,
      primaryColor: '#09090B',
      accentColor: '#2563EB',
      fontStyle: 'editorial_serif',
      visualMood: 'boutique',
    },
    catalog: { products: buildProductsList() },
    publishedStore: {
      published: true,
      publicSlug: 'papelaria',
      sourceRevision: 12,
    },
    storeLayout: {
      formulasIr: buildRichFormulaV9Doc('Papelaria', heroUrl),
    },
  };
}

async function renderKineticCard(
  page: Page,
  options: {
    bg: string;
    headline: string;
    subheadline?: string;
    ctaPill?: string;
    textColor?: string;
    outPath: string;
  },
) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px;
    height: 1080px;
    background: ${options.bg};
    color: ${options.textColor || '#09090B'};
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 140px;
    overflow: hidden;
    position: relative;
  }
  .grid-bg {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(${options.textColor === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.06)'} 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }
  .headline {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 88px;
    font-weight: 800;
    line-height: 1.04;
    letter-spacing: -0.04em;
    max-width: 1380px;
    z-index: 1;
  }
  .subheadline {
    margin-top: 28px;
    font-size: 28px;
    font-weight: 500;
    line-height: 1.45;
    max-width: 980px;
    opacity: 0.86;
    z-index: 1;
  }
  .cta {
    margin-top: 48px;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    background: ${options.textColor === '#FFFFFF' ? '#FFFFFF' : '#09090B'};
    color: ${options.textColor === '#FFFFFF' ? '#09090B' : '#FFFFFF'};
    font-size: 24px;
    font-weight: 800;
    padding: 22px 44px;
    border-radius: 999px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.22);
    z-index: 1;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #10B981;
    box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.25);
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <h1 class="headline">${options.headline}</h1>
  ${options.subheadline ? `<p class="subheadline">${options.subheadline}</p>` : ''}
  ${options.ctaPill ? `<div class="cta"><span class="dot"></span><span>${options.ctaPill}</span></div>` : ''}
</body>
</html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: options.outPath, fullPage: false });
}

async function render4NichesMosaic(page: Page, outPath: string) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px;
    height: 1080px;
    background: #09090B;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    padding: 36px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 28px;
    overflow: hidden;
  }
  .card {
    border-radius: 28px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 36px;
    position: relative;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 24px 60px rgba(0,0,0,0.35);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 8px 16px;
    border-radius: 999px;
    width: fit-content;
  }
  .title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 42px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.03em;
    margin-top: 16px;
  }
  .sub {
    font-size: 17px;
    margin-top: 10px;
    opacity: 0.82;
    max-width: 560px;
  }
  .products {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 24px;
  }
  .p-item {
    border-radius: 18px;
    padding: 16px;
    background: rgba(255,255,255,0.92);
    color: #09090B;
    box-shadow: 0 8px 20px rgba(0,0,0,0.06);
  }
  .p-cat { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748B; }
  .p-name { font-size: 15px; font-weight: 800; margin-top: 4px; }
  .p-price { font-size: 16px; font-weight: 800; color: #15803D; margin-top: 8px; }
</style>
</head>
<body>
  <div class="card" style="background: #FAF8F5; color: #141413;">
    <div>
      <div class="badge" style="background: #09090B; color: #FFFFFF;">● ARCHETYPE · EDITORIAL ATELIER</div>
      <div class="title">Papelaria &amp; Presentes</div>
      <div class="sub">Cadernos em linho, cestas artesanais e kits executivos com Pix 5% OFF.</div>
    </div>
    <div class="products">
      <div class="p-item"><div class="p-cat">Kits &amp; Cestas</div><div class="p-name">Cesta Café Artesanal</div><div class="p-price">R$ 189,90</div></div>
      <div class="p-item"><div class="p-cat">Cadernos</div><div class="p-name">Caderno Linho A5</div><div class="p-price">R$ 49,90</div></div>
      <div class="p-item"><div class="p-cat">Escrita</div><div class="p-name">Kit Escrita Matte</div><div class="p-price">R$ 89,00</div></div>
    </div>
  </div>
  <div class="card" style="background: #1C1917; color: #FAFAF9;">
    <div>
      <div class="badge" style="background: #D97706; color: #FFFFFF;">● ARCHETYPE · ARTISAN ROASTERY</div>
      <div class="title">Empório &amp; Torrefação</div>
      <div class="sub">Grãos especiais microlote, métodos de extração e assinatura mensal pelo WhatsApp.</div>
    </div>
    <div class="products">
      <div class="p-item"><div class="p-cat">Microlote 88pts</div><div class="p-name">Bourbon Amarelo 250g</div><div class="p-price">R$ 54,00</div></div>
      <div class="p-item"><div class="p-cat">Kits Degustação</div><div class="p-name">Trio Origens Brasil</div><div class="p-price">R$ 148,00</div></div>
      <div class="p-item"><div class="p-cat">Acessórios</div><div class="p-name">Prensa Francesa Inox</div><div class="p-price">R$ 129,90</div></div>
    </div>
  </div>
  <div class="card" style="background: #F8FAFC; color: #0F172A;">
    <div>
      <div class="badge" style="background: #2563EB; color: #FFFFFF;">● ARCHETYPE · MINIMAL BOUTIQUE</div>
      <div class="title">Studio Linho &amp; Alfaiataria</div>
      <div class="sub">Peças autorais em linho puro com tabela de medidas e prova rápida em casa.</div>
    </div>
    <div class="products">
      <div class="p-item"><div class="p-cat">Alfaiataria</div><div class="p-name">Blazer Linho Cru</div><div class="p-price">R$ 389,00</div></div>
      <div class="p-item"><div class="p-cat">Vestidos</div><div class="p-name">Vestido Midi Terracota</div><div class="p-price">R$ 298,00</div></div>
      <div class="p-item"><div class="p-cat">Conjuntos</div><div class="p-name">Set Camisa + Calça</div><div class="p-price">R$ 449,00</div></div>
    </div>
  </div>
  <div class="card" style="background: #ECFDF5; color: #064E3B;">
    <div>
      <div class="badge" style="background: #059669; color: #FFFFFF;">● ARCHETYPE · BOTANICAL LAB</div>
      <div class="title">Botânica &amp; Dermocosméticos</div>
      <div class="sub">Fórmulas veganas de alta performance com recomendação personalizada no chat.</div>
    </div>
    <div class="products">
      <div class="p-item"><div class="p-cat">Séruns</div><div class="p-name">Sérum Vitamina C 15%</div><div class="p-price">R$ 134,90</div></div>
      <div class="p-item"><div class="p-cat">Rotina Completa</div><div class="p-name">Kit Glow Botânico</div><div class="p-price">R$ 279,00</div></div>
      <div class="p-item"><div class="p-cat">Hidratação</div><div class="p-name">Creme Barreira Ceramidas</div><div class="p-price">R$ 112,00</div></div>
    </div>
  </div>
</body>
</html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outPath, fullPage: false });
}

test('FASE 4 — Gera todos os 17 Prints Visuais Nota a Nota do Trailer (1920x1080)', async ({
  page,
}) => {
  test.setTimeout(90000);
  fs.mkdirSync(TRAILER_PRINTS_DIR, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Takes Tipográficos (sem tags acima dos títulos, copy cirúrgica PT-BR) + Mosaico
  await renderKineticCard(page, {
    bg: '#FFFFFF',
    headline: 'Sua vitrine online e seu WhatsApp vendendo juntos.',
    subheadline: 'Suba sua planilha. Em segundos sua loja está no ar com atendimento e Pix prontos.',
    textColor: '#09090B',
    outPath: path.join(TRAILER_PRINTS_DIR, 'take_01_kinetic_opening.png'),
  });

  await renderKineticCard(page, {
    bg: '#2563EB',
    headline: 'Suba seus produtos. A loja se monta sozinha.',
    subheadline: 'Layout editorial, catálogo organizado e atendente no WhatsApp configurados em um passo.',
    textColor: '#FFFFFF',
    outPath: path.join(TRAILER_PRINTS_DIR, 'take_03_kinetic_upload_prompt.png'),
  });

  await render4NichesMosaic(
    page,
    path.join(TRAILER_PRINTS_DIR, 'take_09_mosaic_4_niches_2x2.png'),
  );

  await renderKineticCard(page, {
    bg: '#2563EB',
    headline: 'Loja publicada. Atendimento 24 horas no WhatsApp.',
    subheadline: 'Responde dúvidas em segundos, envia o Pix e organiza cada pedido no painel.',
    textColor: '#FFFFFF',
    outPath: path.join(TRAILER_PRINTS_DIR, 'take_16_kinetic_closing_headline.png'),
  });

  await renderKineticCard(page, {
    bg: '#09090B',
    headline: 'Coloque sua loja no ar hoje.',
    subheadline: 'Da planilha ao primeiro pedido no WhatsApp em menos de um minuto.',
    ctaPill: 'Acessar agora → companygen.store',
    textColor: '#FFFFFF',
    outPath: path.join(TRAILER_PRINTS_DIR, 'take_17_kinetic_cta_final.png'),
  });

  // Configura sessão autenticada e rotas para os takes reais do app
  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'trailer.e2e@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Papelaria' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'trailer-token',
    refresh_token: 'trailer-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  let savedProfile: Record<string, unknown> = buildInitialMockProfile();
  let revision = 1;
  let storedOrders: Array<Record<string, unknown>> = [];
  let jobPollCount = 0;

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
      window.localStorage.setItem(key, JSON.stringify(val));
      window.localStorage.setItem('cg_theme', 'light');
    },
    { key: SUPABASE_STORAGE_KEY, val: session },
  );

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: user }),
  );

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    const method = req.method();

    if (pathname.includes('/assets/')) {
      const asset = loadStudioAssetBuffer(pathname);
      return route.fulfill({
        status: 200,
        contentType: asset.contentType,
        body: asset.buffer,
      });
    }

    if (pathname === '/api/profile') {
      if (method === 'PUT') {
        const body = JSON.parse(req.postData() || '{}') as { profile?: Record<string, unknown> };
        if (body.profile) {
          savedProfile = { ...savedProfile, ...body.profile };
        }
        revision += 1;
      }
      return route.fulfill({
        json: { revision, provider: 'local', profile: savedProfile },
      });
    }

    if (pathname.startsWith('/api/store-molde/job/')) {
      const jobId = decodeURIComponent(pathname.slice('/api/store-molde/job/'.length));
      const current = jobStages[Math.min(jobPollCount, jobStages.length - 1)];
      jobPollCount += 1;
      return route.fulfill({
        json: {
          jobId,
          stage: current.stage,
          label: current.label,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    if (pathname === '/api/store-molde/generate-full' && method === 'POST') {
      await new Promise((r) => setTimeout(r, 2200));
      const ready = buildReadyMockProfile();
      savedProfile = ready;
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          formulasIr: ready.storeLayout.formulasIr,
          imageJobs: [
            {
              slotId: 'hero_main',
              targetSectionId: 'sec_hero',
              role: 'hero',
              status: 'completed',
              assetUrl: `/api/store-molde/${TEST_USER_ID}/assets/generated/hero_main.png`,
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

    if (pathname === '/api/orders' && method === 'GET') {
      return route.fulfill({ json: { orders: storedOrders } });
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
        customer_jid:
          body.customerJid || (body.customerPhone ? `${body.customerPhone}@s.whatsapp.net` : ''),
        customer_name: body.customerName || 'Cliente',
        items: [
          {
            sku: 'PLANILHA-1',
            name:
              (Array.isArray(body.items) && body.items[0]?.name) ||
              body.customItemName ||
              'Cesta Café Artesanal Manhã',
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
        delivery_address: { phone: body.customerPhone || '5511987654321' },
        status: body.status || 'confirmado',
        isSimulation: false,
        is_simulation: false,
        source_revision: revision,
        created_at: now,
        updated_at: now,
      };
      storedOrders = [newOrder, ...storedOrders.filter((o) => o.order_ref !== orderRef)];
      return route.fulfill({ status: 201, json: { order: newOrder, unmatchedItems: [] } });
    }

    if (pathname === '/api/dashboard') {
      const totalSales = storedOrders.reduce((s, o) => s + (Number(o.total_cents) || 0), 0);
      return route.fulfill({
        json: {
          ok: true,
          dashboard: {
            visitsTotal: 142,
            ordersCount: storedOrders.length || 12,
            salesCents: totalSales || 184900,
            pendingCount: 2,
            paidCount: storedOrders.length || 10,
            recentOrders: storedOrders,
            d1StrictConversion: {
              visits: 142,
              productClicks: 38,
              whatsappPurchaseMessages: 18,
              d1ConfirmedOrders: 12,
              d1RevenueCents: totalSales || 184900,
              conversionRatePct: 8.5,
            },
          },
        },
      });
    }

    if (pathname === '/api/whatsapp/events') {
      return route.fulfill({
        json: {
          ok: true,
          notifications: [],
          waitingHumanCount: 0,
          d1Funnel: {
            visits: 142,
            productClicks: 38,
            whatsappPurchaseMessages: 18,
            d1ConfirmedOrders: 12,
            d1RevenueCents: 184900,
            conversionRatePct: 8.5,
          },
        },
      });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({
        json: {
          conectado: true,
          status: 'Conectado',
          numeroBot: '5511987654321',
        },
      });
    }

    if (pathname === '/api/whatsapp/ai/brain') {
      return route.fulfill({
        json: {
          ok: true,
          ollamaOnline: true,
          cloudAiAvailable: true,
          creditBalance: 220,
          availableModels: ['qwen3:4b-instruct'],
          brain: {
            enabled: true,
            modelName: 'qwen3:4b-instruct',
            systemPrompt:
              'Atenda com cordialidade, confirme estoque do catálogo e envie a chave Pix Copia-e-Cola.',
            ragDocuments: [],
            safeTestMode: false,
            autonomyMode: 'misto',
          },
        },
      });
    }

    if (pathname === '/api/whatsapp/ai/simulate-or-reply') {
      return route.fulfill({
        json: {
          ok: true,
          replyText:
            'Olá! Temos a Cesta Café Artesanal Manhã em estoque por R$ 189,90. Chave Pix: financeiro@papelaria.com.br',
          replyParts: [
            'Olá! Temos a Cesta Café Artesanal Manhã pronta para envio hoje por R$ 189,90 (com 5% OFF no Pix fica R$ 180,40).',
            'Chave Pix Copia-e-Cola: financeiro@papelaria.com.br — assim que enviar o comprovante por aqui, seu pedido já sai para entrega!',
          ],
          modelUsed: 'glm-4.6v',
          intent: 'BUY_INTENT',
          readDelayMs: 2100,
        },
      });
    }

    if (pathname === '/api/credits/balance') {
      return route.fulfill({ json: { ok: true, balance: 220 } });
    }

    return route.fulfill({ json: { ok: true } });
  });

  // 6. TAKE 04 (00:07 - 00:10): TELA 01 Ignição preenchida com Papelaria + WhatsApp + Pix
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('ignition-stage')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('ignition-niche-pill-papelaria').click();
  await page.getByTestId('ignition-store-input').fill('Papelaria');
  await page.getByTestId('ignition-whatsapp-input').fill('11987654321');
  await page.getByTestId('ignition-pix-input').fill('financeiro@papelaria.com.br');
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_04_tela01_ignition_filled.png'),
    fullPage: false,
  });

  // 7. TAKE 05 (00:10 - 00:13): TELA 02 Síntese Real com os 6 estágios de STORE_MOLDE_JOBS
  await page.getByTestId('ignition-submit-btn').click();
  await expect(page.getByTestId('synthesis-stage')).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_05_tela02_synthesis_6_stages.png'),
    fullPage: false,
  });

  // 8. TAKE 02 (00:02 - 00:05) & TAKE 08 (00:21 - 00:24): TELA 04 Vitrine Pública v4 no ar
  const vitrine = page.getByTestId('vitrine-overlay-persistent');
  await expect(vitrine).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  const toastCloseBtn = page.locator('[aria-label="Fechar notificação"]').first();
  if (await toastCloseBtn.isVisible().catch(() => false)) {
    await toastCloseBtn.click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_02_vitrine_v4_live_hero.png'),
    fullPage: false,
  });
  await page.evaluate(() => window.scrollBy(0, 620));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_08_vitrine_v4_catalog_pix.png'),
    fullPage: false,
  });

  // Volta para TELA 03 (Centro de Controle Editorial - Imagem 1)
  await vitrine.getByRole('button', { name: /Voltar ao Painel/i }).click();
  await expect(page.getByTestId('store-editorial-view')).toBeVisible({ timeout: 8000 });

  // 9. TAKE 06 (00:13 - 00:17): TELA 03 Minha Loja Editorial (Imagem 1 exata)
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_06_tela03_editorial_store_imagem1.png'),
    fullPage: false,
  });

  // 10. TAKE 07 (00:17 - 00:21): TELA 03 com Paleta Combobox ⌘K aberta
  await page.getByTestId('dock-search-trigger').click();
  await expect(page.getByTestId('editorial-cmd-dialog')).toBeVisible();
  await page.getByTestId('editorial-cmd-input').fill('Cesta Café');
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_07_tela03_cmdk_combobox.png'),
    fullPage: false,
  });
  await page.keyboard.press('Escape');

  // 11. TAKE 10 (00:27 - 00:31): Aba WhatsApp com pergunta do cliente digitada
  await page.getByTestId('top-pill-tab-whatsapp').click();
  await expect(page.getByTestId('wpp-channel-section')).toBeVisible();
  await page.getByTestId('wpp-mode-simulator-btn').click();
  await page
    .getByTestId('wpp-sofia-test-input')
    .fill('Oi! Tem a Cesta Café Artesanal para entrega hoje no Pix?');
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_10_whatsapp_customer_question.png'),
    fullPage: false,
  });

  // 12. TAKE 11 (00:31 - 00:35): Resposta em 2,1s com Estoque + Chave Pix Copia-e-Cola
  await page.getByTestId('wpp-sofia-test-send').click();
  await expect(page.getByTestId('wpp-sofia-test-output')).toBeVisible();
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_11_whatsapp_ai_pix_reply_2s.png'),
    fullPage: false,
  });

  // 13. TAKE 12 & TAKE 13: Aba Pedidos + Modal Importar Planilha
  await page.getByTestId('top-pill-tab-dashboard').click();
  await expect(page.getByTestId('orders-kanban-view')).toBeVisible();
  await page.getByTestId('orders-import-spreadsheet-btn').click();
  await expect(page.getByTestId('orders-import-modal')).toBeVisible();

  const mixedBatch = [
    'Cliente\tWhatsApp\tProduto\tValor\tStatus',
    'Mariana Costa\t11987654321\tCesta Café Artesanal Manhã\tR$ 189,90\tPago',
    'Rafael Almeida\t11976543210\tCaderno Espiral Capa Dura\tR$ 49,90\tEm Preparo',
    'Juliana Ribeiro\t21998123344\tPlanner Semanal Minimalista\tR$ 64,90\tNovo',
    'Lucas Ferreira\t31991234567\tCaixa Organizadora Linho\tR$ 119,00\tEntregue',
    'Beatriz Mendes\t11912345678\tKit Escrita Executiva\t\tPago',
  ].join('\n');
  await page.getByTestId('orders-paste-textarea').fill(mixedBatch);

  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_12_orders_spreadsheet_inline_error_highlight.png'),
    fullPage: false,
  });

  await page.getByTestId('orders-preview-cell-4-totalCents').fill('R$ 99,90');
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_13_orders_spreadsheet_inline_fixed.png'),
    fullPage: false,
  });

  // 14. TAKE 14: Kanban populado com os 5 pedidos + Banner de Auditoria
  await page.getByTestId('orders-confirm-import-btn').click();
  await expect(page.getByTestId('orders-import-modal')).toBeHidden({ timeout: 8000 });
  await expect(page.getByTestId('orders-import-audit-banner')).toBeVisible();
  await page.waitForTimeout(400);
  const toastCloseBtn2 = page.locator('[aria-label="Fechar notificação"]').first();
  if (await toastCloseBtn2.isVisible().catch(() => false)) {
    await toastCloseBtn2.click();
    await page.waitForTimeout(250);
  }
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_14_orders_kanban_populated.png'),
    fullPage: false,
  });

  // 15. TAKE 15: Comanda detalhada aberta
  await page.locator('[data-testid^="kanban-card-"]').first().click();
  await expect(page.getByTestId('order-details-whatsapp-btn')).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(TRAILER_PRINTS_DIR, 'take_15_orders_comanda_details.png'),
    fullPage: false,
  });
});
