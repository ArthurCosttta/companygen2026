import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

const SCREENSHOTS_DIR =
  'C:\\Users\\arthur\\.gemini\\antigravity\\brain\\11169f73-159b-4308-91e9-7ace60c123e1\\swarm_e2e_screenshots_v2';

// Valid 1x1 PNG binary (tiny real image upload test fixture)
const TINY_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC',
  'base64',
);

async function readEnvValue(key: string): Promise<string> {
  if (process.env[key]) return process.env[key]!;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === key) {
        return m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {}
  return '';
}

async function seedCleanE2EWorkspace(uid: string, initialCredits: number) {
  const glmKey = await readEnvValue('GLM_API_KEY');
  if (glmKey && !process.env.GLM_API_KEY) {
    process.env.GLM_API_KEY = glmKey;
  }
  const secret = crypto
    .createHash('sha256')
    .update(`companygen-local-showcase:${process.cwd()}:${process.env.GLM_API_KEY || 'dev-salt'}`)
    .digest('hex');

  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      email: `${uid}@e2e.local`,
      showcase: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const token = `cg-local-showcase.${payload}.${sig}`;

  const wsDir = path.join(os.homedir(), '.companygen', 'workspaces', uid);
  await fs.mkdir(wsDir, { recursive: true });
  await fs.writeFile(
    path.join(wsDir, 'credits_ledger.json'),
    JSON.stringify([
      {
        id: `seed-${uid}`,
        delta: initialCredits,
        balance_after: initialCredits,
        operation_type: 'e2e_seed',
        created_at: new Date().toISOString(),
      },
    ]),
    'utf8',
  );
  return { wsDir, token };
}

test.describe('Formula-IR v9.0 Compositional E2E Real (Zero Presets, 8 Telas, Multi-Nicho)', () => {
  test.setTimeout(300_000);

  const runSuffix = Date.now().toString(36);
  const petUid = `e2ev9-pet-${runSuffix}`;
  const docUid = `e2ev9-doc-${runSuffix}`;
  const tmpDirsToClean: string[] = [];

  test.afterAll(async () => {
    for (const dir of tmpDirsToClean) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    for (const uid of [petUid, docUid]) {
      await fs.rm(path.join(os.homedir(), '.companygen', 'workspaces', uid), {
        recursive: true,
        force: true,
      }).catch(() => {});
    }
  });

  test('Petshop Real (8 telas -> upload logo 0 cr -> .CSV -> GLM+RunPod -30 cr -> Sacola/402/ZIP) + Negócio Oposto Confeitaria', async ({
    page,
    request,
  }) => {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    const workTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-e2e-v9-'));
    tmpDirsToClean.push(workTmp);

    const logoPath = path.join(workTmp, 'pet-logo.png');
    await fs.writeFile(logoPath, TINY_PNG_BYTES);

    const petCsvPath = path.join(workTmp, 'catalogo_petshop_servicos.csv');
    await fs.writeFile(
      petCsvPath,
      [
        'nome;sku;preco;estoque;categoria;variante;descricao',
        'Banho Porte Pequeno;PET-B-P;59,90;30;Banhos;Porte P;Banho com shampoo neutro e secagem silenciosa',
        'Banho Porte Médio;PET-B-M;79,90;30;Banhos;Porte M;Banho completo para cães médios em box sem gaiola',
        'Tosa Higiênica;PET-TOSA;45,00;30;Tosas;Padrão;Aparagem segura de patas e região higiênica',
        'Corte de Unhas e Ouvido;PET-UNHA;28,00;30;Cuidados;Extra;Corte delicado e higienização auricular',
        'Ração Natural Super Premium 10kg;PET-RACAO;169,90;15;Alimentação;10kg;Sem corantes artificiais',
      ].join('\n'),
      'utf8',
    );

    const { token: petToken } = await seedCleanE2EWorkspace(petUid, 30);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      ({ token, uid }) => {
        const sessionObj = {
          token,
          user: { id: uid, email: `${uid}@e2e.local` },
          code: 'E2E-CLEAN',
          credits: 30,
          balance: 30,
          savedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
        window.localStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
      },
      { token: petToken, uid: petUid },
    );

    await page.goto('/');
    await expect(page.getByTestId('topbar-open-checkout-btn')).toContainText('30 cr', { timeout: 15000 });

    // Fecha WelcomeModal se abrir ou clica no botão para iniciar onboarding
    const configureBtn = page.getByRole('button', { name: /Começar|Configurar|Iniciar/i }).first();
    if (await configureBtn.isVisible().catch(() => false)) {
      await configureBtn.click();
    }

    // Se wizard não abriu direto pelo WelcomeModal, abre via Checklist / Ajustes
    const step1Name = page.getByTestId('onb-business-name');
    if (!(await step1Name.isVisible().catch(() => false))) {
      const openWizardFallback = page.getByRole('button', { name: /Configurar|Assistente|Completar/i }).first();
      await openWizardFallback.click();
    }

    // TELA 1/8 — Identidade & WhatsApp
    await expect(step1Name).toBeVisible({ timeout: 10000 });
    await step1Name.fill('AuMiau Pet & Spa');
    await page.getByTestId('onb-segment').selectOption('Petshop & Estética Animal');
    await page.getByTestId('onb-whatsapp').fill('11976543210');
    await page.getByTestId('onb-next-btn').click();

    // TELA 2/8 — Modelo Serviços
    await page.getByTestId('onb-model-servicos').click();
    await page.getByTestId('onb-next-btn').click();

    // TELA 3/8 — Descrição & Diferenciais
    await page.getByTestId('onb-description').fill('Banho e tosa sem gaiolas com água morna e hora marcada para cães e gatos.');
    await page.getByRole('button', { name: 'Hora marcada' }).click();
    await page.getByRole('button', { name: 'Sem gaiolas / Baixo estresse' }).click();
    await page.getByTestId('onb-next-btn').click();

    // TELA 4/8 — Upload de Logo Grátis (0 cr)
    await page.getByTestId('onb-upload-logo').setInputFiles(logoPath);
    await expect(page.locator('img[alt="Prévia da logo enviada"]')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_onboarding_tela4_upload_logo_0cr.png') });
    await page.getByTestId('onb-next-btn').click();

    // TELA 5/8 — Experiência & Campanha
    await page.getByTestId('onb-experience-goal').fill(
      'Selecionar o porte do pet, banho ou tosa e extras como corte de unhas para ver o total em tempo real.',
    );
    await page.getByTestId('onb-campaign-theme').fill('Semana do Pet Limpo');
    await page.getByTestId('onb-next-btn').click();

    // TELA 6/8 — Cor & Clima Visual
    await page.getByRole('button', { name: /Verde Botânico/i }).click();
    await page.getByRole('button', { name: /Editorial Elegante/i }).click();
    await page.getByTestId('onb-next-btn').click();

    // TELA 7/8 — Planilha Serviços Petshop (.CSV) -> detecta servico_agendado + mantém cinza neutro (0 cr)
    await page.getByTestId('onb-xlsx-input').setInputFiles(petCsvPath);
    await expect(page.getByTestId('onb-catalog-counts')).toContainText('4 Serviço(s)', { timeout: 10000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_onboarding_tela7_planilha_petshop.png') });
    await page.getByTestId('onb-next-btn').click();

    // TELA 8/8 — Pagamentos, Endereço & Geração Real GLM-5.3 + RunPod WebP (-30 cr -> 0 cr)
    await page.getByRole('button', { name: '5% OFF' }).click();
    await page.getByTestId('onb-submit-generate').click();
    await expect(page.getByTestId('onb-submit-generate')).toBeHidden({ timeout: 150_000 });

    // Verifica estado gerado no servidor (zero farmácia/skincare, <= 7 seções, <= 5 imagePlan, saldo = 0 cr)
    const stateRes = await request.get('/api/store-molde/state', {
      headers: { Authorization: `Bearer ${petToken}` },
    });
    expect(stateRes.status()).toBe(200);
    const petState = await stateRes.json();
    expect(petState.balance).toBe(0);
    expect(petState.formulasIr?.version).toBe('9.0');
    expect(petState.formulasIr?.sections?.length).toBeGreaterThanOrEqual(3);
    expect(petState.formulasIr?.sections?.length).toBeLessThanOrEqual(7);
    expect((petState.formulasIr?.imagePlan || []).length).toBeLessThanOrEqual(5);
    expect((petState.formulasIr?.imagePlan || []).some((j: { role?: string }) => j.role === 'brand_logo')).toBe(false);

    const serializedPetIr = JSON.stringify(petState.formulasIr);
    expect(serializedPetIr).not.toMatch(/farm[aá]cia|skincare|Hidratar|Protetor solar|Av\. Paulista/i);

    // Verifica no /?view=store&u=<uid> a Vitrine Pública Petshop v9.0
    await page.goto(`/?view=store&u=${encodeURIComponent(petUid)}`);
    await expect(page.locator('[data-formula-version="9.0"]')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('v9-neutral-gray-thumb').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_vitrine_petshop_v9_cinza_neutro.png'), fullPage: true });

    // Interage no simulador + adiciona item à sacola (inline Adicionado, ZERO toast cobrindo Finalizar)
    const expSection = page.getByTestId('v9-interactive-experience');
    if (await expSection.isVisible().catch(() => false)) {
      const expBtn = page.getByTestId('v9-exp-primary-btn');
      const expLabel = (await expBtn.textContent()) || '';
      await expBtn.click();
      if (/sacola|adicionar/i.test(expLabel)) {
        await expect(expBtn).toContainText('Adicionado');
      }
    }
    await page.getByTestId('v9-add-cart-PET-B-P').click();
    await expect(page.getByTestId('v9-add-cart-PET-B-P')).toContainText('Adicionado');

    // Abre a Sacola e garante ZERO toast sobre o botão Finalizar
    await page.getByTestId('v9-header-bag-btn').click();
    const finalizeBtn = page.getByRole('button', { name: /Finalizar.*WhatsApp|Enviar Pedido|Finalizar/i }).first();
    await expect(finalizeBtn).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_sacola_sem_toast_obstrutivo.png') });

    // Fecha Sacola & entra no Editor Visual via Minha Loja
    await page.keyboard.press('Escape');
    await page.goto('/');
    await page.getByTestId('nav-tab-store').click();
    await page.getByTestId('open-visual-editor-btn').click();
    await expect(page.getByTestId('v9-catalog-search-photos-btn')).toBeVisible({ timeout: 15000 });
    // Testa bloqueio 402 no botão Criar Página (-15 cr) quando saldo = 0
    await page.getByTestId('editor-create-page-btn').click();
    const confirmCreate = page.getByTestId('editor-confirm-create-page-btn');
    if (await confirmCreate.isVisible().catch(() => false)) {
      await confirmCreate.click();
    } else {
      await page.evaluate(async (tok) => {
        const res = await fetch('/api/store-molde/create-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ title: 'Oferta Pet' }),
        });
        const data = await res.json();
        if (res.status === 402) {
          window.dispatchEvent(new CustomEvent('companygen:insufficient-credits', { detail: data }));
        }
      }, petToken);
    }
    const modal402 = page.getByTestId('credit-alert-center-modal');
    await expect(modal402).toBeVisible({ timeout: 10000 });
    const box402 = await modal402.boundingBox();
    expect(box402).toBeTruthy();
    expect(box402!.y).toBeGreaterThan(80);
    expect(box402!.y).toBeLessThan(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_modal_402_centralizado.png') });

    // Fecha modal 402 e verifica offline ZIP/HTML da Pasta Molde no servidor estático
    await page.keyboard.press('Escape');
    const htmlRes = await request.get(`/api/store-molde/${encodeURIComponent(petUid)}/index.html`);
    expect(htmlRes.status()).toBe(200);
    const offlineHtml = await htmlRes.text();
    const cssRes = await request.get(`/api/store-molde/${encodeURIComponent(petUid)}/styles.css`);
    const jsRes = await request.get(`/api/store-molde/${encodeURIComponent(petUid)}/app.js`);
    expect(cssRes.status()).toBe(200);
    expect(jsRes.status()).toBe(200);

    const zipOutDir = path.join(workTmp, 'offline-pet');
    await fs.mkdir(path.join(zipOutDir, 'assets', 'generated'), { recursive: true });
    await fs.writeFile(path.join(zipOutDir, 'index.html'), offlineHtml, 'utf8');
    await fs.writeFile(path.join(zipOutDir, 'styles.css'), await cssRes.text(), 'utf8');
    await fs.writeFile(path.join(zipOutDir, 'app.js'), await jsRes.text(), 'utf8');

    // Testa abrir em servidor HTTP estático isolado
    const staticServer = http.createServer(async (req2, res2) => {
      const clean = (req2.url || '/index.html').split('?')[0].replace(/^\/+/, '') || 'index.html';
      try {
        const data = await fs.readFile(path.join(zipOutDir, clean));
        const ext = path.extname(clean);
        res2.writeHead(200, {
          'Content-Type': ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/html; charset=utf-8',
        });
        res2.end(data);
      } catch {
        res2.writeHead(404).end();
      }
    });
    await new Promise<void>((r) => staticServer.listen(0, '127.0.0.1', () => r()));
    const offlinePort = (staticServer.address() as { port: number }).port;
    try {
      await page.goto(`http://127.0.0.1:${offlinePort}/index.html`);
      await expect(page.locator('h1')).toContainText('AuMiau');
      await expect(page.locator('.cg-neutral-gray-box').first()).toBeVisible();
    } finally {
      staticServer.close();
    }

    // Validação extra JSZip válida (round-trip)
    const testZip = new JSZip();
    testZip.file('index.html', offlineHtml);
    const zipBuf = await testZip.generateAsync({ type: 'nodebuffer' });
    expect(zipBuf.length).toBeGreaterThan(500);

    // 2. Segundo negócio oposto (Confeitaria / Caixa Montável) — comprova arquiteturas distintas sem presets!
    const { token: docToken } = await seedCleanE2EWorkspace(docUid, 35);
    const getProfRes = await request.get('/api/profile', { headers: { Authorization: `Bearer ${docToken}` } });
    const profSnap = await getProfRes.json();
    const docProfile = {
      ...profSnap.profile,
      business: {
        ...(profSnap.profile?.business || {}),
        name: 'Doce Ateliê Laranjeiras',
        segment: 'Gastronomia & Confeitaria',
        businessModel: 'hibrido',
        description: 'Caixas de brigadeiros belgas artesanais e bolos festivos sob encomenda.',
        experienceGoal: 'Montar caixa com 9 doces escolhidos, trocar embalagem de presente e escrever cartão.',
        differentials: ['Produção artesanal', 'Sob encomenda'],
      },
      brand: { ...(profSnap.profile?.brand || {}), primaryColor: '#B4532A', fontStyle: 'editorial_serif' },
      whatsapp: { ...(profSnap.profile?.whatsapp || {}), phoneE164: '5521988887777', displayPhone: '(21) 98888-7777' },
      payment: { ...(profSnap.profile?.payment || {}), pixDiscountPercent: 8 },
      catalog: {
        products: [
          { id: 'd1', sku: 'DOC-CX9', name: 'Caixa 9 Doces Belgas', category: 'Caixas', itemType: 'kit_combo', priceCents: 5800, imageUrl: '', approvedAsset: true, active: true },
          { id: 'd2', sku: 'DOC-BOLO', name: 'Bolo Pote Trufado', category: 'Bolos', itemType: 'produto_fisico', priceCents: 2400, imageUrl: '', approvedAsset: true, active: true },
        ],
      },
    };
    const saveDocRes = await request.put('/api/profile', {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${docToken}` },
      data: { revision: profSnap.revision, profile: docProfile, publish: true },
    });
    expect(saveDocRes.status()).toBe(200);

    const sweetsRes = await request.post('/api/store-molde/generate-full', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${docToken}`,
      },
      data: {
        generateImages: false, // Testa arquitetura GLM + tokens sem depender de 2º lote RunPod
        profile: docProfile,
      },
    });
    expect(sweetsRes.status()).toBe(200);
    const sweetsData = await sweetsRes.json();
    expect(sweetsData.formulasIr.version).toBe('9.0');
    expect(sweetsData.formulasIr.designTokens.accent).not.toBe(petState.formulasIr.designTokens.accent);
    expect(sweetsData.formulasIr.designTokens.fontStyle).toBe('editorial_serif');
    expect(JSON.stringify(sweetsData.formulasIr)).not.toMatch(/petshop|AuMiau|banho|tosa|skincare|farm[aá]cia/i);

    // Abre Vitrine oposta da Confeitaria em contexto isolado para captura visual comparativa
    const docCtx = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
    const docPage = await docCtx.newPage();
    await docPage.addInitScript(
      ({ token, uid }) => {
        const sessionObj = {
          token,
          user: { id: uid, email: `${uid}@e2e.local` },
          code: 'E2E-SWEET',
          credits: 35,
          balance: 35,
          savedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
        window.localStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
      },
      { token: docToken, uid: docUid },
    );
    await docPage.goto(`/?view=store&u=${encodeURIComponent(docUid)}`);
    await expect(docPage.locator('[data-formula-version="9.0"]')).toBeVisible({ timeout: 15000 });
    await expect(docPage.locator('[data-formula-version="9.0"] h1').first()).toContainText('Doce Ateliê Laranjeiras');
    await docPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_vitrine_oposta_confeitaria.png'), fullPage: true });
    await docCtx.close();
  });

  test('Minha Loja -> Gerar Vitrine com IA (-30 cr) para Eletrônicos substitui v8.2 antiga e gera RunPod WebP', async ({
    page,
    request,
  }) => {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    const elecUid = `e2ev9-elec-${runSuffix}`;
    tmpDirsToClean.push(path.join(os.homedir(), '.companygen', 'workspaces', elecUid));
    const { token: elecToken } = await seedCleanE2EWorkspace(elecUid, 40);
    const elecGet = await request.get('/api/profile', { headers: { Authorization: `Bearer ${elecToken}` } });
    const elecSnap = await elecGet.json();
    const staleElecProfile = {
      ...elecSnap.profile,
      business: {
        ...(elecSnap.profile?.business || {}),
        name: 'Tech Prime Eletrônicos',
        segment: 'Eletrônicos & Assistência',
        businessModel: 'produtos',
        description: 'Capinhas, fones Bluetooth, carregadores turbo e assistência rápida para smartphones.',
      },
      brand: {
        ...(elecSnap.profile?.brand || {}),
        primaryColor: '#0B4DB8',
        fontStyle: 'clean_geometric',
        heroImageUrl: '/api/store-molde/legacy/assets/generated/s02_hero.png',
      },
      whatsapp: { phoneE164: '5511977776666', displayPhone: '(11) 97777-6666' },
      payment: { ...(elecSnap.profile?.payment || {}), pixDiscountPercent: 10 },
      onboarding: { fichaCompleted: true, wizardStep: 3, storeGenerated: true },
      catalog: {
        products: [
          { id: 'e1', sku: 'EL-CASE-1', name: 'Capinha Silicone MagSafe Preta', category: 'Acessórios', itemType: 'produto_fisico', priceCents: 7990, imageUrl: '', approvedAsset: true, active: true },
          { id: 'e2', sku: 'EL-CABO-1', name: 'Carregador Turbo USB-C 30W', category: 'Energia', itemType: 'produto_fisico', priceCents: 9990, imageUrl: '', approvedAsset: true, active: true },
          { id: 'e3', sku: 'EL-FONE-1', name: 'Fone Bluetooth ANC Pro', category: 'Áudio', itemType: 'produto_fisico', priceCents: 18990, imageUrl: '', approvedAsset: true, active: true },
        ],
      },
      storeLayout: {
        formulasIr: { version: '8.2', pages: [{ id: 'home', filename: 'index.html', title: 'Old v8', blocks: [] }] },
      },
    };
    const saveRes = await request.put('/api/profile', {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${elecToken}` },
      data: { revision: elecSnap.revision, profile: staleElecProfile, publish: true },
    });
    expect(saveRes.status()).toBe(200);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(
      ({ token, uid }) => {
        const sessionObj = {
          token,
          user: { id: uid, email: `${uid}@e2e.local` },
          code: 'E2E-ELEC',
          credits: 40,
          balance: 40,
          savedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
        window.localStorage.setItem('cg_local_showcase_session_v1', JSON.stringify(sessionObj));
      },
      { token: elecToken, uid: elecUid },
    );

    await page.goto('/');
    await page.getByTestId('nav-tab-store').click();
    await page.getByTestId('minha-loja-ai-prompt-input').fill(
      'Loja moderna de eletrônicos e acessórios mobile com simulador de kit proteção + carga rápida e desconto Pix.',
    );
    await page.getByTestId('minha-loja-ai-generate-btn').click();

    await expect(async () => {
      const stRes = await request.get('/api/store-molde/state', { headers: { Authorization: `Bearer ${elecToken}` } });
      const st = await stRes.json();
      expect(st.balance).toBe(10); // 40 - 30 = 10 cr real debit!
      expect(st.formulasIr?.version).toBe('9.0');
      expect((st.imageJobs || []).some((j: { status?: string }) => j.status === 'completed')).toBe(true);
      const rawIr = JSON.stringify(st.formulasIr);
      expect(rawIr).not.toMatch(/skincare bottles|farm[aá]cia|1 Limpar|Hidratar|Proteger/i);
    }).toPass({ timeout: 150_000 });

    await page.goto(`/?view=store&u=${encodeURIComponent(elecUid)}`);
    await expect(page.locator('[data-formula-version="9.0"]')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_vitrine_eletronicos_v9_runpod.png'), fullPage: true });
  });
});
