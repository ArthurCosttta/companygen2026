import { chromium } from '@playwright/test';
import { generateStoreRawTables } from '../src/services/store-prompt-generator.js';

async function testGenerator() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/store-compiler/index.html');

  // Test 1: Suplementos custom prompt with specific items & prices
  const prompt1 = "Quero uma loja de suplementos com Whey Protein Isolado por 149.90 e Creatina Creapure por 89.90";
  const gen1 = generateStoreRawTables(prompt1);
  console.log(`Generated store 1: ${gen1.summary.siteName}, ${gen1.summary.productCount} products, ${gen1.summary.categoryCount} categories`);

  const res1 = await page.evaluate((raw) => {
    return window.CompanyGenCompilerTestAPI.validate(raw);
  }, gen1.raw);

  console.log('Test 1 Issues count:', res1.issues.length);
  const errors1 = res1.issues.filter(i => i.severity === 'ERROR');
  console.log('Test 1 Errors:', errors1);

  // Test 2: Free form prompt
  const prompt2 = "Loja de joias e anéis em ouro 18k e prata 925";
  const gen2 = generateStoreRawTables(prompt2);
  const res2 = await page.evaluate((raw) => {
    return window.CompanyGenCompilerTestAPI.validate(raw);
  }, gen2.raw);
  const errors2 = res2.issues.filter(i => i.severity === 'ERROR');
  console.log('Test 2 Errors:', errors2);

  await browser.close();

  if (errors1.length === 0 && errors2.length === 0) {
    console.log('SUCCESS! Both generated stores passed validation with 0 errors!');
    process.exit(0);
  } else {
    console.error('Validation failed!');
    process.exit(1);
  }
}

testGenerator().catch(console.error);
