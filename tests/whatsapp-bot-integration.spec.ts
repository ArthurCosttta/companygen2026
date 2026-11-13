import { test, expect } from '@playwright/test';

test.describe('WhatsApp integrado ao CompanyGen', () => {
  test('abre dentro do mesmo app, na mesma conta e mostra persistência', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const login = page.getByRole('heading', { name: 'Entrar no CompanyGen' });
    if (await login.isVisible()) {
      await expect(page.getByText('Atenda pelo WhatsApp da sua conta')).toBeVisible();
      await expect(page.locator('a[href*="localhost:3333"], a[href*="127.0.0.1:3333"]')).toHaveCount(0);
      test.skip(true, 'A integração autenticada é coberta pelo teste de segurança com duas contas isoladas.');
    }

    const headerButton = page.locator('header').getByRole('button', { name: /WhatsApp/i });
    await expect(headerButton).toBeVisible({ timeout: 10000 });
    await headerButton.click();

    await expect(page.getByRole('navigation', { name: 'Áreas do WhatsApp' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'WhatsApp', exact: true })).toBeVisible();
    await expect(page.getByText(/Dados no Supabase|Dados neste servidor/)).toBeVisible();
    await expect(page.getByLabel('Buscar contato ou mensagem')).toBeVisible();

    // O painel antigo e separado deixou de ser parte da navegação.
    await expect(page.locator('a[href*="localhost:3333"]')).toHaveCount(0);
    await expect(page.locator('a[href*="127.0.0.1:3333"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Conexão', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Conexão da conta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Identidade da loja' })).toBeVisible();
  });
});
