import { chromium } from '@playwright/test';
import { generateStoreRawTables } from '../src/services/store-prompt-generator.js';

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/store-compiler/index.html');

  const prompt = 'Loja chamada ProFit Suplementos com Whey Protein Isolado por 149.90 e Creatina Creapure por 89.90';
  const gen = generateStoreRawTables(prompt);
  console.log('Site Name:', gen.summary.siteName);
  console.log('Product Count:', gen.summary.productCount);
  console.log('Category Count:', gen.summary.categoryCount);

  const res = await page.evaluate((raw) => {
    return window.CompanyGenCompilerTestAPI.validate(raw);
  }, gen.raw);

  console.log('Issues:', JSON.stringify(res.issues, null, 2));
  await browser.close();
}

check().catch(console.error);
