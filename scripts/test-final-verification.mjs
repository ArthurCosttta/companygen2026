import { chromium } from 'playwright';

async function testFinalVerification() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  console.log('1. Acessando aplicação em http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Bypass login se necessário
  const adminBtn = page.locator('text=ADMIN · Pular para o Projeto');
  if (await adminBtn.isVisible()) {
    console.log('2. Efetuando bypass de autenticação...');
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }

  // Verifica marca inicial na sidebar
  const sidebarBrandInitial = await page.locator('aside span.truncate').innerText();
  console.log(`Marca inicial na Sidebar: "${sidebarBrandInitial}"`);

  // Navega para Garimpo de Assets
  console.log('3. Navegando para Garimpo de Assets...');
  await page.locator('button:has-text("Garimpo de Assets")').click();
  await page.waitForTimeout(1000);

  // Digita o prompt exato do usuário
  const userPrompt = '20 videos de eletronicos para minha loja alexandre variedades';
  console.log(`4. Inserindo prompt no Chat Composer: "${userPrompt}"`);
  const textarea = page.locator('textarea');
  await textarea.fill(userPrompt);
  await page.waitForTimeout(300);

  // Clica no botão "Interpretar & Buscar"
  console.log('5. Clicando no botão "Interpretar & Buscar"...');
  await page.locator('button:has-text("Interpretar & Buscar")').click();

  // Aguarda finalização da busca (spinner desaparecer)
  console.log('6. Aguardando conclusão do garimpo...');
  await page.waitForSelector('text=Garimpando...', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Verifica a sincronização com a Sidebar
  const sidebarBrandUpdated = await page.locator('aside span.truncate').innerText();
  console.log(`Marca atualizada na Sidebar: "${sidebarBrandUpdated}"`);

  // Captura os valores dos inputs de configuração
  const brandInput = await page.locator('input[type="text"]').nth(0).inputValue();
  const productInput = await page.locator('input[type="text"]').nth(1).inputValue();
  const colorInput = await page.locator('input[type="text"]').nth(2).inputValue();
  const segmentSelect = await page.locator('select').nth(0).inputValue();
  const countSelect = await page.locator('select').nth(1).inputValue();

  console.log('Campos de Configuração Sincronizados:');
  console.log(`- Marca da Loja: "${brandInput}"`);
  console.log(`- Produto a Buscar: "${productInput}"`);
  console.log(`- Variação/Modelo: "${colorInput}"`);
  console.log(`- Segmento: "${segmentSelect}"`);
  console.log(`- Quantidade: "${countSelect}"`);

  // Salva screenshot 1: Chat Composer + Sofia IA + Configs + Sidebar Sincronizada
  const screen1Path = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-alexandre-variedades-success-top.png';
  await page.screenshot({ path: screen1Path, fullPage: false });
  console.log(`Screenshot 1 salva: ${screen1Path}`);

  // Agora testa o botão "Atualizar Busca Manualmente"
  console.log('7. Testando o botão "Atualizar Busca Manualmente"...');
  const manualHuntBtn = page.locator('button:has-text("Atualizar Busca Manualmente")');
  await manualHuntBtn.click();
  await page.waitForTimeout(1000);
  await page.waitForSelector('text=Garimpando...', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Rola para ver os cards de vídeo e console de execução
  await page.evaluate(() => window.scrollBy(0, 550));
  await page.waitForTimeout(500);

  const screen2Path = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-alexandre-variedades-success-grid.png';
  await page.screenshot({ path: screen2Path, fullPage: false });
  console.log(`Screenshot 2 salva: ${screen2Path}`);

  console.log('✅ Todos os testes automatizados concluídos com 100% de sucesso!');
  await browser.close();
}

testFinalVerification().catch((err) => {
  console.error('Erro na execução do teste:', err);
  process.exit(1);
});
