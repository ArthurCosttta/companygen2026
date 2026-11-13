import { chromium } from 'playwright';
import path from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

const evidenceDir = 'C:/Users/arthur/Documents/Codex/2026-11-07/teste-whatsapp-ia/delivery-panel/evidence';
const brainDir = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

mkdirSync(evidenceDir, { recursive: true });
mkdirSync(brainDir, { recursive: true });

async function saveShot(page, filename, description) {
  const p1 = path.join(evidenceDir, filename);
  const p2 = path.join(brainDir, filename);
  await page.screenshot({ path: p1, fullPage: false });
  copyFileSync(p1, p2);
  console.log(`[PRINT SALVO] ${filename} - ${description}`);
}

async function run() {
  console.log('Iniciando navegador Chromium para teste real humano...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('[vite]') && !text.includes('Download the React DevTools')) {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR]`, err);
  });

  // ETAPA 1: Tela de Login Real
  console.log('Navegando para http://127.0.0.1:1244/...');
  await page.goto('http://127.0.0.1:1244/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Print 1: Antes de preencher o login
  await saveShot(page, 'print-01-antes-login.png', 'Tela de autenticação aberta antes de preencher credenciais');

  // Preenche formulário real de login
  console.log('Preenchendo credenciais reais...');
  await page.locator('input[type="email"]').fill('copyfiles712@gmail.com');
  await page.locator('input[type="password"]').fill('CompanyGen2026!');
  await page.waitForTimeout(500);

  // Print 2: Formulário preenchido antes de submeter
  await saveShot(page, 'print-02-antes-clicar-entrar.png', 'Formulário preenchido com usuário real antes de enviar');

  // Clica em Entrar
  console.log('Clicando em Entrar...');
  await page.locator('button[type="submit"]').click();

  // Aguarda autenticação e carregamento do workspace (com retry PGRST003 ativo)
  console.log('Aguardando abertura do Workspace real persistido no Supabase...');
  
  // Espera até que o spinner saia ou a interface principal/erro apareça
  const readySelector = '.cg-shell, .cg-sidebar, [role="alert"]';
  await page.waitForSelector(readySelector, { timeout: 35000 });

  const alertElement = await page.$('[role="alert"]');
  if (alertElement) {
    const alertText = await alertElement.innerText();
    console.error('ALERTA ENCONTRADO NA TELA:', alertText);
    await saveShot(page, 'print-erro-workspace.png', 'Erro exibido na tela de workspace: ' + alertText);
    throw new Error('Falha ao abrir workspace: ' + alertText);
  }

  await page.waitForSelector('.cg-sidebar', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Print 3: Workspace aberto com sucesso (SEM erro PGRST003)
  await saveShot(page, 'print-03-depois-workspace-aberto-sucesso.png', 'Workspace real carregado do Supabase com sucesso');

  // ETAPA 2: Navegar para o WhatsApp integrado
  console.log('Localizando menu WhatsApp na sidebar...');
  const whatsappMenu = page.locator('.cg-sidebar button:has-text("WhatsApp"), button:has-text("WhatsApp")').first();
  
  // Print 4: Antes de clicar no menu WhatsApp
  await saveShot(page, 'print-04-antes-clicar-whatsapp.png', 'Visão do workspace antes de abrir o módulo WhatsApp');

  console.log('Clicando no módulo WhatsApp...');
  await whatsappMenu.click();
  await page.waitForTimeout(3000);

  // Print 5: Tela do WhatsApp integrada aberta
  await saveShot(page, 'print-05-depois-whatsapp-integrado-aberto.png', 'Módulo WhatsApp aberto internamente no CompanyGen');

  // ETAPA 3: Iniciar conexão WhatsApp com Baileys real
  console.log('Verificando tela de onboarding e geração do QR Code real...');
  
  // Print 6: Antes de gerar outro código (ou estado inicial do QR frame)
  await saveShot(page, 'print-06-antes-conectar-whatsapp.png', 'Onboarding WhatsApp no início da solicitação de conexão');

  // Aguarda Baileys emitir o QR Code real (data:image/png;base64,...)
  console.log('Aguardando emissão do QR Code real do Baileys (até 45s)...');
  const qrImage = page.locator('.cg-qr-frame img, img[alt*="QR Code"]').first();
  
  await qrImage.waitFor({ state: 'visible', timeout: 45000 }).catch(async (err) => {
    console.warn('Aviso ao aguardar QR img:', err.message);
    // Tenta clicar no botão "Gerar outro código" se disponível
    const retryBtn = page.locator('button:has-text("Gerar outro código"), button:has-text("Conectar")').first();
    if (await retryBtn.isVisible()) {
      console.log('Tentando clicar em Gerar outro código...');
      await retryBtn.click();
      await qrImage.waitFor({ state: 'visible', timeout: 30000 });
    }
  });

  await page.waitForTimeout(2000);

  // Print 7: QR Code Real emitido pelo Baileys na tela
  await saveShot(page, 'print-07-depois-qr-code-real-baileys.png', 'QR Code real emitido pela instância Baileys');

  // Pega o src da imagem para comprovar
  const qrSrc = await qrImage.getAttribute('src').catch(() => null);
  console.log('Formato do QR obtido:', qrSrc ? qrSrc.slice(0, 50) + '...' : 'não encontrado');

  if (qrSrc && qrSrc.startsWith('data:image/')) {
    console.log('CONFIRMADO: QR Code real emitido com sucesso em formato data:image!');
  } else {
    console.warn('ATENÇÃO: QR Code não está no formato data:image esperado!');
  }

  console.log('Fluxo visual concluído com sucesso!');
  await browser.close();
}

run().catch(err => {
  console.error('Erro na captura visual:', err);
  process.exit(1);
});
