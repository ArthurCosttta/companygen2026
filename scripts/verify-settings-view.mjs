import { chromium } from 'playwright';

async function testSettings() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('Navegando para http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Se estiver na tela de login, clica no botão Admin para pular
  const adminBtn = page.locator('text=ADMIN · Pular para o Projeto');
  if (await adminBtn.isVisible()) {
    console.log('Clicando em ADMIN...');
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }

  // Clica no menu Configurações na Sidebar
  console.log('Navegando para Configurações...');
  const settingsMenu = page.locator('button:has-text("Configurações")');
  await settingsMenu.click();
  await page.waitForTimeout(1000);

  // Valida que estamos na tela de configurações da loja
  const title = await page.locator('h1:has-text("Configurações da Minha Loja")').isVisible();
  console.log('Título Configurações visível:', title);

  // Tira screenshot da aba 1 (Dados da Loja)
  await page.screenshot({
    path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-configuracoes-cliente-normal.png',
    fullPage: false,
  });
  console.log('Screenshot salva com sucesso!');

  // Clica na aba Atendimento Sofia IA
  const sofiaTab = page.locator('button:has-text("Atendimento Sofia IA")');
  await sofiaTab.click();
  await page.waitForTimeout(600);

  // Tira screenshot da aba 2 (Sofia IA)
  await page.screenshot({
    path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-configuracoes-sofia-ia.png',
    fullPage: false,
  });
  console.log('Screenshot Sofia salva com sucesso!');

  // Valida que NÃO existem menções a Webhooks Kiwify, RPC mocks ou Fila de Espera Admin
  const kiwifyCheckout = await page.locator('text=ASSINAR STARTER NA KIWIFY').isVisible();
  const webhookUrl = await page.locator('text=process_kiwify_webhook').isVisible();
  const waitlistAdmin = await page.locator('text=EXPORTAR LEADS DA WAITLIST').isVisible();

  console.log('Presença de Checkout Kiwify (deve ser false):', kiwifyCheckout);
  console.log('Presença de Webhook URL (deve ser false):', webhookUrl);
  console.log('Presença de Waitlist Admin (deve ser false):', waitlistAdmin);

  await browser.close();
}

testSettings().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});
