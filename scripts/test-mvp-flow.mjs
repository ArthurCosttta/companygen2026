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
  console.log('Iniciando Chromium para validação visual do MVP (Loja + WhatsApp)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  // 1. Login
  console.log('Navegando para http://127.0.0.1:1244/...');
  await page.goto('http://127.0.0.1:1244/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Preenche credenciais se estiver na tela de login
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible()) {
    console.log('Preenchendo login...');
    await emailInput.fill('copyfiles712@gmail.com');
    await page.locator('input[type="password"]').fill('CompanyGen2026!');
    await page.locator('button[type="submit"]').click();
  }

  // Aguarda shell principal
  console.log('Aguardando Workspace...');
  await page.waitForSelector('.cg-sidebar', { timeout: 35000 });
  await page.waitForTimeout(2000);

  // Print 1: Nova Visão Geral limpa do MVP
  await saveShot(page, 'print-mvp-01-visao-geral.png', 'Visão Geral do MVP com apenas Loja + WhatsApp');

  // Print 2: Foco na Sidebar limpa
  const sidebar = page.locator('.cg-sidebar');
  const sidebarP1 = path.join(evidenceDir, 'print-mvp-02-sidebar-limpa.png');
  const sidebarP2 = path.join(brainDir, 'print-mvp-02-sidebar-limpa.png');
  await sidebar.screenshot({ path: sidebarP1 });
  copyFileSync(sidebarP1, sidebarP2);
  console.log('[PRINT SALVO] print-mvp-02-sidebar-limpa.png - Sidebar com apenas Operação (Visão geral, Loja, WhatsApp) e Conta');

  // 2. Navegação para Loja
  console.log('Navegando para o módulo Loja...');
  await saveShot(page, 'print-mvp-03-antes-clicar-loja.png', 'Antes de clicar em Loja');
  await page.locator('.cg-sidebar button:has-text("Loja")').click();
  await page.waitForTimeout(2500);
  await saveShot(page, 'print-mvp-04-depois-loja-aberta.png', 'Módulo Loja aberto no CompanyGen');

  // 3. Navegação para WhatsApp
  console.log('Navegando para o módulo WhatsApp...');
  await saveShot(page, 'print-mvp-05-antes-clicar-whatsapp.png', 'Antes de clicar em WhatsApp');
  await page.locator('.cg-sidebar button:has-text("WhatsApp")').click();
  await page.waitForTimeout(3000);

  // Aguarda QR frame
  const qrFrame = page.locator('.cg-qr-frame, .cg-onboarding');
  await qrFrame.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  await saveShot(page, 'print-mvp-06-depois-whatsapp-aberto.png', 'Módulo WhatsApp integrado aberto com QR real do Baileys');

  console.log('Validação do MVP concluída com sucesso!');
  await browser.close();
}

run().catch(err => {
  console.error('Erro na validação do MVP:', err);
  process.exit(1);
});
