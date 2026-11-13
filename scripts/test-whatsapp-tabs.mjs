import { chromium } from 'playwright';

async function testTabs() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);
  
  // Click on WhatsApp in sidebar
  await page.locator('button:has-text("WhatsApp")').first().click();
  await page.waitForTimeout(1000);

  // Click on Simulador de Atendimento
  await page.locator('button:has-text("Simulador de Atendimento")').click();
  await page.waitForTimeout(500);
  
  const screenshotPath = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-whatsapp-simulator.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Simulator screenshot saved to:', screenshotPath);
  await browser.close();
}

testTabs();
