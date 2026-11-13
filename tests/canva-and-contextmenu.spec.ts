import { test, expect } from '@playwright/test';

test.describe('Canva Studio & Context Menu & Video Scripts', () => {
  test('right-click opens context menu asking to create post', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Right-click on empty cell
    await page.waitForTimeout(500);
    const cell = page.locator('div:has-text("06:00") + div').first();
    await cell.click({ button: 'right', force: true });

    // Context menu should appear
    await expect(page.locator('text=O que deseja criar neste horário?')).toBeVisible();
    await expect(page.locator('text=Novo Post em Branco')).toBeVisible();
    await expect(page.locator('text=Gerar com IA')).toBeVisible();

    // Click on Novo Post em Branco
    await page.click('text=Novo Post em Branco');
    await expect(page.locator('text=O que deseja criar neste horário?')).not.toBeVisible();
  });

  test('clicking post shows simplified inspector and Canva button opens Canva Studio', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Click on a post card
    const postCard = page.locator('text=Nova coleção').first();
    await expect(postCard).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
    await postCard.click();

    // Check simplified inspector
    await expect(page.locator('button:has-text("Abrir no Canva")')).toBeVisible();
    await expect(page.locator('text=Legenda do Post')).toBeVisible();

    // Click "Abrir no Canva"
    await page.click('button:has-text("Abrir no Canva")');

    // Canva Studio modal should open
    await expect(page.locator('text=Canva Studio')).toBeVisible();
    await expect(page.locator('text=Banco de Imagens da Marca')).toBeVisible();
    await expect(page.locator('button:has-text("Concluir e Salvar")')).toBeVisible();

    // Switch tool inside Canva to "Texto"
    await page.locator('button[data-tool="text"]').click();
    await expect(page.locator('text=Título Principal (Headline)')).toBeVisible();

    // Switch tool inside Canva to "Legenda"
    await page.locator('button[data-tool="caption"]').click();
    await expect(page.locator('text=Legenda do Instagram')).toBeVisible();

    // Close Canva Studio
    await page.click('button:has-text("Concluir e Salvar")');
    await expect(page.locator('text=Canva Studio')).not.toBeVisible();
  });

  test('sidebar Roteiros de Vídeo displays scene by scene studio', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=CompanyGen')).toBeVisible({ timeout: 15000 });

    // Click "Roteiros de Vídeo" in sidebar
    await page.click('button:has-text("Roteiros de Vídeo")');

    // Check Video Scripts Studio
    await expect(page.locator('text=Roteiros de Vídeo Cena a Cena')).toBeVisible();
    await expect(page.locator('text=Cena 1')).toBeVisible();
    await expect(page.locator('text=Ação Visual & Enquadramento').first()).toBeVisible();
    await expect(page.locator('text=Fala / Narração (Locução)').first()).toBeVisible();
    await expect(page.locator('button:has-text("Copiar Roteiro")')).toBeVisible();
  });
});
