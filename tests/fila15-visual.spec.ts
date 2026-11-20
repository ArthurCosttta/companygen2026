import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const DOWNLOAD_HTML_PATH =
  'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/download/index.html';

const EXPECTED_CMD = 'irm https://companygen.store/install.ps1 | iex';

test('QA15-03 Visual Proof: Página /download minimalista com comando único em 1440x900 e 390x844', async ({ browser }) => {
  const htmlContent = await readFile(DOWNLOAD_HTML_PATH, 'utf8');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  await context.route('https://companygen.store/download', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: htmlContent }),
  );
  await context.route('https://companygen.store/download/manifest.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: '1.1.0', sha256: 'A'.repeat(64) }),
    }),
  );

  const page = await context.newPage();
  await page.goto('https://companygen.store/download');

  await expect(page.getByTestId('install-command-box')).toContainText(EXPECTED_CMD);
  await expect(page.getByTestId('version-tag').or(page.locator('#version-tag'))).toContainText('v1.1.0');

  // Garante que NÃO existe nenhum botão de download direto de .exe
  await expect(page.locator('a[href$=".exe"]')).toHaveCount(0);

  // Clica em Copiar Comando e confere área de transferência
  await page.getByTestId('copy-install-cmd-btn').click();
  await expect(page.getByTestId('copy-install-cmd-btn')).toContainText(/Comando copiado/i);
  const copiedText = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedText).toBe(EXPECTED_CMD);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fila15_download_cmd_1440.png`, fullPage: false });

  // Viewport mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('install-command-box')).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila15_download_cmd_390.png`, fullPage: false });

  await context.close();
});
