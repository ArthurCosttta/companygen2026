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

  console.log('4. Digitando prompt exato do usuário no Chat Composer...');
  const textarea = page.locator('textarea');
  await textarea.fill('20 videos de eletronicos para minha loja alexandre variedades');
  await page.waitForTimeout(500);

  console.log('5. Clicando em Interpretar & Buscar...');
  await page.locator('button:has-text("Interpretar")').click();
  
  console.log('6. Aguardando processamento e busca...');
  await page.waitForTimeout(4000);

  // Captura os valores dos inputs de configuração na tela
  const inputs = await page.locator('input[type="text"]').all();
  for (let i = 0; i < inputs.length; i++) {
    const val = await inputs[i].inputValue();
    console.log(`Input ${i}: ${val}`);
  }

  // Verifica o select de Segmento e Quantidade
  const selects = await page.locator('select').all();
  for (let i = 0; i < selects.length; i++) {
    const val = await selects[i].inputValue();
    console.log(`Select ${i}: ${val}`);
  }

  // Captura mensagem da IA
  const aiBox = page.locator('text=Sofia IA');
  console.log('Sofia IA visível:', await aiBox.isVisible());

  // Salva screenshot
  const screenshotPath = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-alexandre-variedades-real.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot salva em: ${screenshotPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
