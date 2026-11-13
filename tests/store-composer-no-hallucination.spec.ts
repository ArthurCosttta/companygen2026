import { test, expect } from '@playwright/test';

const evidenceRoot = 'C:/Users/arthur/Documents/Codex/2026-11-07/teste-whatsapp-ia/delivery-panel/evidence';

test.describe('Compositor de loja sem dados inventados', () => {
  test('aceita somente produtos e preços informados', async ({ page }) => {
    await page.goto('/store-compiler/index.html');
    await page.screenshot({ path: `${evidenceRoot}/16-antes-catalogo-informado.png`, fullPage: false });
    const prompt = page.locator('#ai-prompt-input');
    await prompt.fill('Loja Minha Real; Caneca Azul - R$ 49,90; Miniatura Carro - R$ 79,90');
    await page.locator('#ai-analyze-btn').click();

    await expect(page.locator('#sku-options-list')).toContainText('Caneca Azul');
    await expect(page.locator('#sku-options-list')).toContainText('Miniatura Carro');
    await expect(page.locator('#sku-options-list')).toContainText('Foto pendente');
    await expect(page.locator('#sku-options-list')).not.toContainText('VoltCharge');
    await expect(page.locator('#ai-compile-custom-btn')).toBeEnabled();
    await page.screenshot({ path: `${evidenceRoot}/17-depois-somente-produtos-informados.png`, fullPage: false });
  });

  test('não cria catálogo quando faltam produtos confirmados', async ({ page }) => {
    await page.goto('/store-compiler/index.html');
    await page.screenshot({ path: `${evidenceRoot}/18-antes-ideia-generica-sem-produtos.png`, fullPage: false });
    await page.locator('#ai-prompt-input').fill('Quero uma loja de eletrônicos moderna');
    await page.locator('#ai-analyze-btn').click();

    await expect(page.locator('#ai-engine-status')).toContainText('Informe pelo menos um produto com preço');
    await expect(page.locator('#sku-options-list')).toBeEmpty();
    await expect(page.locator('#ai-compile-custom-btn')).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('VoltCharge Tech');
    await page.screenshot({ path: `${evidenceRoot}/19-depois-ideia-generica-rejeitada.png`, fullPage: false });
  });
});
