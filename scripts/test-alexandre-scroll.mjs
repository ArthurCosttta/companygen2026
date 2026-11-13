import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  const adminBtn = page.locator('text=ADMIN · Pular para o Projeto');
  if (await adminBtn.isVisible()) {
    await adminBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.locator('button:has-text("Garimpo de Assets")').click();
  await page.waitForTimeout(1000);

  const textarea = page.locator('textarea');
  await textarea.fill('20 videos de eletronicos para minha loja alexandre variedades');
  await page.waitForTimeout(500);

  await page.locator('button:has-text("Interpretar")').click();

  await page.waitForSelector('text=Garimpando...', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Scroll down to grid
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(500);

  const screenshotPath = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-alexandre-grid-scroll.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot salva em: ${screenshotPath}`);

  await browser.close();
}

run();
