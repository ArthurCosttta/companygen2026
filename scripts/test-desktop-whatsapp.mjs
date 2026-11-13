import { _electron as electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = process.argv[2] || path.join(projectRoot, 'print-stlc-desktop-whatsapp-integrated.png');
const userData = await mkdtemp(path.join(os.tmpdir(), 'companygen-electron-stlc-'));
const executablePath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

const application = await electron.launch({
  executablePath,
  args: [path.join(projectRoot, 'desktop', 'main.mjs')],
  env: {
    ...process.env,
    COMPANYGEN_URL: 'http://127.0.0.1:1245/',
    COMPANYGEN_USER_DATA: userData,
  },
});

try {
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  const email = page.locator('input[type="email"]');
  if (await email.isVisible().catch(() => false)) {
    await email.fill(process.env.CG_STLC_EMAIL || 'copyfiles712@gmail.com');
    await page.locator('input[type="password"]').fill(process.env.CG_STLC_PASSWORD || 'CompanyGen2026!');
    await page.getByRole('button', { name: /^Entrar/ }).click();
  }

  await page.locator('.cg-shell').waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByTestId('real-whatsapp-web').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(12_000);
  await page.screenshot({ path: output });

  const visibleSidebar = await page.locator('.cg-nav-wrap').isVisible();
  const embeddedBrowserCount = await page.evaluate(() => document.querySelector('.cg-real-whatsapp-host')?.childElementCount || 0);
  if (!visibleSidebar || embeddedBrowserCount !== 1) {
    throw new Error(`Integração incompleta: sidebar=${visibleSidebar}; navegadores=${embeddedBrowserCount}`);
  }
  console.log(JSON.stringify({ ok: true, output, visibleSidebar, embeddedBrowserCount }, null, 2));
} finally {
  await application.close();
}
