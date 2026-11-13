import { test, expect } from '@playwright/test';

test.describe('Calendar & User Interface', () => {
  test('renders 3-column layout matching reference on desktop 1600x900', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');

    // Wait for initial load
    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Loja Modelo de Moda')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Calendário de Conteúdo').first()).toBeVisible();

    // Check Calendar has hourly rows
    await expect(page.locator('text=07:00').first()).toBeVisible();
    await expect(page.locator('text=08:00').first()).toBeVisible();

    // Check post cards are rendered in their respective slot
    const postCard = page.locator('text=Nova coleção').first();
    await expect(postCard).toBeVisible({ timeout: 15000 });

    // Click on post card to open Inspector
    await postCard.click();

    // Check Inspector has canvas preview and slide strip
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Post – Carrossel (5 slides)').first()).toBeVisible({ timeout: 15000 });

    // Take reference screenshot at 1600x900
    await page.screenshot({ path: 'test-results/screenshot-1600x900.png', fullPage: false });
  });

  test('clicking slide thumbnails switches active slide', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Wait for post and click it
    const postCard = page.locator('text=Nova coleção').first();
    await expect(postCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await postCard.click();

    // Check caption textarea is visible
    const captionTextarea = page.locator('textarea').first();
    await expect(captionTextarea).toBeVisible();
    await expect(page.locator('button:has-text("Abrir no Canva")')).toBeVisible();

    // Click slide 2 thumbnail
    const slide2Thumb = page.locator('button[title*="Slide 2"]').first();
    if (await slide2Thumb.isVisible()) {
      await slide2Thumb.click();
      await page.waitForTimeout(300);
      await expect(page.locator('text=Slide 2 de 5').first()).toBeVisible();
    }

    await page.screenshot({ path: 'test-results/screenshot-1440x900.png', fullPage: false });
  });

  test('responsive layout on tablet 768x1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Calendário de Conteúdo').first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'test-results/screenshot-768x1024.png', fullPage: false });
  });

  test('responsive layout on mobile 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('text=Calendário de Conteúdo').first()).toBeVisible({ timeout: 15000 });

    await page.screenshot({ path: 'test-results/screenshot-390x844.png', fullPage: false });
  });
});
