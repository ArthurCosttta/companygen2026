import { test } from '@playwright/test';

test('capture feature screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(1000);

  // 1. Right click context menu
  const cell = page.locator('div:has-text("06:00") + div').first();
  await cell.click({ button: 'right', force: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-context-menu.png' });

  // Close context menu by clicking elsewhere
  await page.click('body', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(400);

  // 2. Click a post card to show simplified inspector
  const postCard = page.locator('text=Nova coleção').first();
  await postCard.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-inspector-simplificado.png' });

  // 3. Open Canva Studio
  await page.click('button:has-text("Abrir no Canva")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-canva-modal.png' });

  // Close Canva Studio
  await page.click('button:has-text("Concluir e Salvar")');
  await page.waitForTimeout(400);

  // 4. Navigate to Roteiros de Vídeo
  await page.click('button:has-text("Roteiros de Vídeo")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/screenshot-roteiros-video.png' });
});
