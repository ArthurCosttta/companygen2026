import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:1244/', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('copyfiles712@gmail.com');
  await page.locator('input[type="password"]').fill('CompanyGen2026!');
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/debug-01-preenchido.png' });

  console.log('Submetendo form...');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  const text = await page.evaluate(() => document.body.innerText);
  console.log('PAGE CONTENT AFTER 3S:\n', text);

  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/debug-02-pos-submit.png' });

  await page.waitForTimeout(3000);
  const text2 = await page.evaluate(() => document.body.innerText);
  console.log('PAGE CONTENT AFTER 6S:\n', text2);

  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/debug-03-pos-6s.png' });

  await browser.close();
}

test();
