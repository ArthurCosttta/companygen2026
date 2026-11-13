import { chromium } from 'playwright';

async function testAssetHunter() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navegando para http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Se estiver no onboarding, clica no Admin bypass
  const adminBtn = page.locator('text=ADMIN · Pular para o Projeto');
  if (await adminBtn.isVisible()) {
    console.log('Bypassing admin login...');
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }

  // Clica no menu Garimpo de Assets na Sidebar
  console.log('Clicando em Garimpo de Assets...');
  const hunterMenu = page.locator('button:has-text("Garimpo de Assets")');
  await hunterMenu.click();
  await page.waitForTimeout(1000);

  // Valida que o título está visível
  const title = await page.locator('h1:has-text("Garimpo de Assets por Marca")').isVisible();
  console.log('Título Garimpo de Assets visível:', title);

  // Clica no botão Disparar Garimpo Massivo
  console.log('Clicando em Disparar Garimpo Massivo...');
  const huntBtn = page.locator('button:has-text("Disparar Garimpo Massivo")');
  await huntBtn.click();
  await page.waitForTimeout(2000);

  // Tira screenshot do resultado
  await page.screenshot({
    path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-garimpo-assets-marca.png',
    fullPage: false,
  });
  console.log('Screenshot salva com sucesso em screenshot-garimpo-assets-marca.png!');

  // Valida presença de cards e scores
  const cardsCount = await page.locator('text=% Match').count();
  console.log('Quantidade de fotos com Match Score encontradas:', cardsCount);

  await browser.close();
}

testAssetHunter().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
