import { test, expect } from '@playwright/test';

test.describe('AI Question Cards & Unified Top Bar Store Creation', () => {
  test('single top bar, central AI chat composer with question cards, and store compilation', async ({ page }) => {
    // 1. Open app
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    // 2. Click on 'Loja' menu in sidebar
    const storeMenuBtn = page.getByRole('button', { name: 'Loja', exact: true });
    await expect(storeMenuBtn).toBeVisible();
    await storeMenuBtn.click();

    // 3. Verify single unified top header in App
    const appHeader = page.locator('header');
    await expect(appHeader.locator('h1')).toContainText('Criar Loja Virtual');
    await expect(appHeader.getByText('Conectado')).toBeVisible();

    // Verify top bar demo buttons exist
    await expect(appHeader.getByRole('button', { name: /Moda/ })).toBeVisible();
    await expect(appHeader.getByRole('button', { name: 'Eletrônicos' })).toBeVisible();
    await expect(appHeader.getByRole('button', { name: 'Casa' })).toBeVisible();
    await expect(appHeader.getByRole('button', { name: 'Ver Loja' })).toBeVisible();
    await expect(appHeader.getByRole('button', { name: 'Baixar ZIP' })).toBeVisible();

    // 4. Locate compiler iframe
    const storeIframe = page.frameLocator('iframe#store-compiler-frame');

    // 5. Verify the central AI Composer box is inside the card
    const aiBox = storeIframe.locator('#ai-central-box');
    await expect(aiBox).toBeVisible({ timeout: 10000 });
    await expect(aiBox.locator('#ai-prompt-input')).toBeVisible();

    // 6. Test typing the user's prompt (electronic chargers)
    const promptInput = aiBox.locator('#ai-prompt-input');
    await promptInput.fill('Loja de eletronicos que vende carregadores');

    // 7. Click Analisar & Especificar Opções
    const analyzeBtn = aiBox.locator('#ai-analyze-btn');
    await analyzeBtn.click();

    // 8. Verify Question Cards are revealed
    const questionsWrapper = aiBox.locator('#ai-questions-wrapper');
    await expect(questionsWrapper).toBeVisible();
    await expect(questionsWrapper.locator('#ai-detected-niche-text')).toContainText('Eletrônicos');

    // Verify pricing cards and SKU list
    await expect(questionsWrapper.locator('#qcard-pricing')).toBeVisible();
    await expect(questionsWrapper.locator('#qcard-skus')).toBeVisible();
    await expect(questionsWrapper.locator('#sku-options-list')).toContainText('Carregador Turbo GaN');

    // Check default standard price
    const skuPrice = questionsWrapper.locator('#price-sku-1');
    await expect(skuPrice).toContainText('R$ 159,90');

    // Click "Premium" tier pill -> price should increase live
    const premiumPill = questionsWrapper.locator('button[data-tier="high"]');
    await premiumPill.click();
    await expect(skuPrice).toContainText('R$ 231,86');

    // Click "Econômico" tier pill -> price should decrease live
    const ecoPill = questionsWrapper.locator('button[data-tier="eco"]');
    await ecoPill.click();
    await expect(skuPrice).toContainText('R$ 119,93');

    // Switch back to "Custo-Benefício"
    const midPill = questionsWrapper.locator('button[data-tier="mid"]');
    await midPill.click();
    await expect(skuPrice).toContainText('R$ 159,90');

    // 9. Click "Criar Minha Loja com Esses Valores →"
    const compileBtn = questionsWrapper.locator('#ai-compile-custom-btn');
    await compileBtn.click();

    // 10. Verify preview screen appears
    await expect(storeIframe.locator('#screen-result')).toBeVisible({ timeout: 12000 });

    // Verify store rendered inside #store-frame
    const previewFrame = storeIframe.frameLocator('#store-frame');
    await expect(previewFrame.locator('.cg-logo')).toContainText('VoltCharge Tech');
    await expect(previewFrame.locator('text=Carregador Turbo GaN').first()).toBeVisible();

    // 11. Test cart functionality
    const firstAddBtn = previewFrame.locator('.cg-add').first();
    await expect(firstAddBtn).toBeVisible();
    await firstAddBtn.click();

    const cartCounter = previewFrame.locator('.cg-cart-icon span');
    await expect(cartCounter).toHaveText('1');

    // 12. Take screenshot of the new UI with single header and live store
    await page.screenshot({
      path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-ai-question-cards-store.png',
      fullPage: true,
    });
  });

  test('top bar demo buttons trigger store preview successfully', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    // Go to store
    await page.getByRole('button', { name: 'Loja', exact: true }).click();

    // Click on top bar 'Eletrônicos' demo button
    const appHeader = page.locator('header');
    await appHeader.getByRole('button', { name: 'Eletrônicos' }).click();

    const storeIframe = page.frameLocator('iframe#store-compiler-frame');
    await expect(storeIframe.locator('#validation-summary')).toBeVisible({ timeout: 10000 });
    await expect(storeIframe.locator('#store-name-text')).toContainText('EvoTech');

    // Click "Ver Loja" from the top bar
    await appHeader.getByRole('button', { name: 'Ver Loja' }).click();
    await expect(storeIframe.locator('#screen-result')).toBeVisible({ timeout: 12000 });

    const previewFrame = storeIframe.frameLocator('#store-frame');
    await expect(previewFrame.locator('.cg-logo')).toContainText('EvoTech');
  });
});
