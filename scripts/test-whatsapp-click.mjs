import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);
  
  // Click on WhatsApp in sidebar
  await page.locator('button:has-text("WhatsApp")').first().click();
  await page.waitForTimeout(2000);

  const iframeEl = page.locator('iframe');
  console.log('Iframe count:', await iframeEl.count());
  if (await iframeEl.count() > 0) {
    console.log('Iframe bbox:', await iframeEl.boundingBox());
    const frame = page.frameLocator('iframe');
    console.log('Frame text length:', (await frame.locator('body').innerText()).length);
  }
  
  const screenshotPath = 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-whatsapp-view.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);
  await browser.close();
}

test();
