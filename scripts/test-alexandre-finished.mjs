import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  
  console.log('1. Acessando localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  const adminBtn = page.locator('text=ADMIN · Pular para o Projeto');
  if (await adminBtn.isVisible()) {
    console.log('2. Bypassing auth with Admin button...');
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('3. Indo para tela Garimpo de Assets...');
  await page.locator('button:has-text("Garimpo de Assets")').click();
  await page.waitForTimeout(1000);

  console.log('4. Digitando prompt exato do usuário...');
  const textarea = page.locator('textarea');
  await textarea.fill('20 videos de eletronicos para minha loja alexandre variedades');
  await page.waitForTimeout(500);

  console.log('5. Clicando em Interpretar & Buscar...');
  await page.locator('button:has-text("Interpretar")').click();

  console.log('6. Aguardando finalização da busca (até 15s)...');
  await page.waitForSelector('text=Garimpando...', { state: 'detached', timeout: 15000 }).catch(() => {
    console.log('Timeout aguardando detach, continuando...');
  });
  await page.waitForTimeout(1000);

  // Conta os cards de candidatos renderizados no grid
  const cards = await page.locator('[data-candidate-id], .group.relative.rounded-2xl').count();
  console.log(`Cards encontrados no grid: ${cards}`);

  const logBox = await page.locator('pre, .font-mono').innerText().catch(() => '');
  console.log('Últimos logs:\n', logBox.slice(-300));

  const screenshotPath = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-alexandre-variedades-final.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot salva em: ${screenshotPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
