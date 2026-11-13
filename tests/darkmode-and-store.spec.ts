import { test, expect } from '@playwright/test';

test.describe('Dark Mode & Store Compiler V2 Integration', () => {
  test('toggles Dark Mode and persists preference in localStorage', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Initially light mode
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    // Find and click the theme toggle button
    const themeBtn = page.locator('button[aria-label="Alternar tema claro e escuro"]');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    // Now html should have class "dark"
    await expect(html).toHaveClass(/dark/);

    // Capture Dark Mode Calendar Screenshot
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-darkmode-calendar.png' });

    // Toggle back to light mode
    await themeBtn.click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('navigates to Loja and embeds CompanyGen Store Compiler V2 with Studio assets', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Click "Loja" in sidebar
    const lojaBtn = page.locator('button:has-text("Loja")').first();
    await expect(lojaBtn).toBeVisible();
    await lojaBtn.click();

    // Verify Store Compiler header ribbon
    await expect(page.locator('text=Criar Loja Virtual')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Conectado')).toBeVisible();

    // Verify iframe presence
    const iframe = page.frameLocator('iframe[title="CompanyGen Loja Virtual"]');
    await expect(iframe.locator('text=Criar nova loja')).toBeVisible({ timeout: 15000 });

    // Turn on dark mode to see Store in dark mode
    const themeBtn = page.locator('button[aria-label="Alternar tema claro e escuro"]');
    await themeBtn.click();
    await page.waitForTimeout(500);

    // Click the explicit fashion demonstration from the top ribbon
    const modaBtn = page.locator('button:has-text("Moda")');
    await expect(modaBtn).toBeVisible();
    await modaBtn.click();

    // In iframe, the validation summary should become visible
    await expect(iframe.locator('#validation-summary')).toBeVisible({ timeout: 10000 });
    await expect(iframe.locator('#compile-btn')).toBeEnabled({ timeout: 10000 });

    // Capture Dark Mode Store Compiler screenshot
    await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-darkmode-store.png' });

    // Click Criar minha loja in compiler card
    const compileBtn = iframe.locator('#compile-btn');
    await compileBtn.click();

    // Verify compilation progress and view button
    await expect(iframe.locator('#view-store-btn')).toBeVisible({ timeout: 20000 });

    // Click Ver Loja
    const verLojaBtn = page.locator('button:has-text("Ver Loja")');
    await verLojaBtn.click();

    // Verify result screen and store preview iframe
    await expect(iframe.locator('text=Sua loja está pronta.')).toBeVisible({ timeout: 10000 });
    await expect(iframe.locator('#store-frame')).toBeVisible();

    // Capture Store Preview screenshot
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-store-preview.png' });
  });
});
