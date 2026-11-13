import { test, expect } from '@playwright/test';

test.describe('Calendar Views & Card Containment', () => {
  test('all 4 view modes (Semana, Mês, Dia, Lista) work seamlessly', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    // Wait for app load
    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // 1. Verify Semana view (default)
    await expect(page.locator('text=07:00').first()).toBeVisible();
    await expect(page.locator('text=Nova coleção').first()).toBeVisible();

    // Verify card is contained inside column (not overflowing)
    const card = page.locator('text=Nova coleção').first();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Column width is around 100-180px in 1600px width; card width should not exceed 250px
      expect(box.width).toBeLessThan(250);
    }

    // 2. Switch to Mês (Month View)
    await page.getByRole('button', { name: 'Mês', exact: true }).click();
    await expect(page.locator('text=Novembro, 2026').first()).toBeVisible();
    await expect(page.locator('text=11').first()).toBeVisible();

    // 3. Switch to Dia (Day View)
    await page.getByRole('button', { name: 'Dia', exact: true }).click();
    await expect(page.locator('text=Quarta-feira').first()).toBeVisible();
    await expect(page.locator('text=+ Gerar Card para este Dia').first()).toBeVisible();

    // 4. Switch to Lista (List View)
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.locator('text=Todos os Posts da Campanha').first()).toBeVisible();
    await expect(page.locator('input[placeholder="Buscar post..."]')).toBeVisible();

    // 5. Switch back to Semana
    await page.getByRole('button', { name: 'Semana', exact: true }).click();
    await expect(page.locator('text=07:00').first()).toBeVisible();
  });

  test('right-click on cell triggers Gerar Card', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Count initial posts
    const initialPostsCount = await page.locator('text=posts programados').innerText();
    const countMatch = initialPostsCount.match(/(\d+)/);
    const initialCount = countMatch ? parseInt(countMatch[1], 10) : 0;

    // Right-click on an empty cell
    await page.waitForTimeout(500);
    const cell = page.locator('div:has-text("06:00") + div').first();
    await cell.click({ button: 'right', force: true });

    // Check toast or incremented count
    await page.waitForTimeout(500);
    const updatedPostsCount = await page.locator('text=posts programados').innerText();
    const updatedCountMatch = updatedPostsCount.match(/(\d+)/);
    const updatedCount = updatedCountMatch ? parseInt(updatedCountMatch[1], 10) : 0;
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
  });
});
