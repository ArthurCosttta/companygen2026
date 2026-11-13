import { test } from '@playwright/test';

test('capture store chat composer', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  // Click Loja
  await page.click('button:has-text("Loja")');
  await page.waitForTimeout(1000);

  // Light mode screenshot
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-chat-composer-light.png' });

  // Dark mode toggle
  await page.click('button[aria-label="Alternar tema claro e escuro"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-chat-composer-dark.png' });
});
