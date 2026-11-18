import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const TEST_USER_ID = '44444444-4444-4444-8444-444444444444';

async function setupAuthenticatedShell(
  page: Page,
  options: { isAdmin?: boolean; initialTheme?: 'light' | 'dark' } = {},
) {
  const isAdmin = Boolean(options.isAdmin);
  const initialTheme = options.initialTheme ?? 'light';

  const user = {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: isAdmin ? 'arthurpolarbuy@gmail.com' : 'lojista.fila01@example.invalid',
    app_metadata: {},
    user_metadata: { company_name: 'Studio Aura' },
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: 'fila01-shell-token',
    refresh_token: 'fila01-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await page.addInitScript(
    ({ key, val, theme }) => {
      localStorage.setItem(key, JSON.stringify(val));
      localStorage.setItem('cg_theme', theme);
      localStorage.removeItem('cg_sidebar_collapsed');
      if (document.documentElement) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
      }
    },
    { key: SUPABASE_STORAGE_KEY, val: session, theme: initialTheme },
  );

  await page.route('https://irahjajgudbdkgggffum.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ json: user }),
  );

  let capturedSupportPayload: Record<string, unknown> | null = null;

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;

    if (pathname === '/api/profile') {
      return route.fulfill({
        json: {
          revision: 3,
          provider: 'local',
          profile: {
            schemaVersion: 1,
            business: {
              name: 'Studio Aura',
              segment: 'Moda & Acessórios',
              businessModel: 'produtos',
              description: 'Curadoria autoral com envio rápido.',
            },
            brand: {
              instagram: '@studioaura',
              primaryColor: '#0867E8',
              accentColor: '#24A677',
            },
            whatsapp: {
              connected: true,
              phoneE164: '5511999998888',
              displayPhone: '+55 (11) 99999-8888',
            },
            payment: {
              pixKey: 'pix@studioaura.com.br',
            },
            catalog: {
              products: [
                {
                  id: 'prod-1',
                  sku: 'SKU-001',
                  name: 'Camiseta Tech Minimal',
                  category: 'Vestuário',
                  description: 'Algodão pima respirável',
                  priceCents: 12900,
                  stock: 15,
                  active: true,
                },
                {
                  id: 'prod-2',
                  sku: 'SKU-002',
                  name: 'Bolsa Tote Linho',
                  category: 'Acessórios',
                  description: 'Linho natural estruturado',
                  priceCents: 18900,
                  stock: 8,
                  active: true,
                },
              ],
            },
            publishedStore: {
              published: true,
              publicSlug: 'studio-aura',
              sourceRevision: 3,
            },
          },
        },
      });
    }

    if (pathname === '/api/admin/status') {
      return route.fulfill({ json: { ok: true, isAdmin } });
    }

    if (pathname === '/api/credits/balance') {
      return route.fulfill({
        json: { ok: true, balance: 450, isAdmin, banned: false },
      });
    }

    if (pathname === '/api/whatsapp/api/dados') {
      return route.fulfill({
        json: {
          conectado: true,
          status: 'CONECTADO',
          numeroBot: '5511999998888',
          templates: [],
          conversas: [],
          documentos: [],
        },
      });
    }

    if (pathname === '/api/whatsapp/notifications') {
      return route.fulfill({
        json: {
          ok: true,
          notifications: [],
          waitingHumanCount: 0,
          d1Funnel: { conversations: 12, quotes: 5, sales: 3 },
        },
      });
    }

    if (pathname === '/api/dashboard') {
      return route.fulfill({
        json: { ok: true, recentOrders: [], totalOrders: 3, revenueCents: 34500 },
      });
    }

    if (pathname === '/api/runtime-status') {
      return route.fulfill({ json: { ok: true, mode: 'local', healthy: true } });
    }

    if (pathname === '/api/support/tickets') {
      if (req.method() === 'POST') {
        capturedSupportPayload = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
        return route.fulfill({
          json: {
            ok: true,
            ticket: {
              id: 'ticket-001',
              category: capturedSupportPayload.category || 'vitrine',
              subject: capturedSupportPayload.subject || 'Chamado teste',
              description: capturedSupportPayload.description || 'Descrição',
              attachment_url: capturedSupportPayload.attachmentDataUrl || null,
              status: 'open',
              created_at: new Date().toISOString(),
            },
          },
        });
      }
      return route.fulfill({ json: { ok: true, tickets: [] } });
    }

    return route.fulfill({ json: { ok: true } });
  });

  return {
    getCapturedSupportPayload: () => capturedSupportPayload,
  };
}

test.describe('FILA 01 — Design Tokens v2, Brand Kit, Shell Retrátil, Topbar 3 Zonas e Guardas', () => {
  test('C01–C10: tokens Light/Dark, logos dinâmicos, sidebar retrátil persistente, Ctrl+K, Help/Ctrl+V e banner offline', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { getCapturedSupportPayload } = await setupAuthenticatedShell(page, {
      isAdmin: false,
      initialTheme: 'light',
    });

    await page.goto('/');
    await expect(page.getByTestId('app-topbar')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('desktop-sidebar')).toBeVisible();

    const exploreBtn = page.getByRole('button', { name: /Explorar o painel primeiro/i });
    if (await exploreBtn.isVisible().catch(() => false)) {
      await exploreBtn.click();
      await expect(exploreBtn).toBeHidden();
    }

    // C01: Light mode CSS tokens
    const lightTokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        bg: s.getPropertyValue('--cg-background').trim().toLowerCase(),
        surface: s.getPropertyValue('--cg-surface').trim().toLowerCase(),
        urgent: s.getPropertyValue('--cg-urgent-human').trim().toLowerCase(),
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(lightTokens.bg).toBe('#f7faff');
    expect(['#fff', '#ffffff']).toContain(lightTokens.surface);
    expect(lightTokens.urgent).toBe('#ff2e54');
    expect(lightTokens.overflowX).toBeLessThanOrEqual(0);

    // C02 & C06: Light logo no Sidebar expandido (240px) + non-admin sem tab admin
    await expect(page.getByTestId('nav-tab-admin')).toHaveCount(0);
    const expandedBox = await page.getByTestId('desktop-sidebar').boundingBox();
    expect(Math.round(expandedBox?.width ?? 0)).toBe(240);

    const lightLogoSrc = await page.getByTestId('sidebar-brand-logo').getAttribute('src');
    expect(lightLogoSrc).toContain('/brand/logo-horizontal-clara.webp');
    const logoLoaded = await page
      .getByTestId('sidebar-brand-logo')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(logoLoaded).toBe(true);

    // Screenshot 1440 Light
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila01_shell_1440_light.png` });

    // C07: Topbar 3 zonas & .cg-tabular no saldo
    await expect(page.getByTestId('topbar-breadcrumb')).toContainText('Vitrine & Estúdio');
    await expect(page.getByTestId('topbar-command-palette-btn')).toBeVisible();
    await expect(page.getByTestId('topbar-open-checkout-btn')).toContainText('450 cr');
    const tabularSetting = await page
      .getByTestId('topbar-open-checkout-btn')
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(tabularSetting).toContain('tabular-nums');

    // C01 & C02: Alternar Dark Mode via Topbar
    await page.getByTestId('topbar-theme-toggle-btn').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const darkTokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        bg: s.getPropertyValue('--cg-background').trim().toLowerCase(),
        surface: s.getPropertyValue('--cg-surface').trim().toLowerCase(),
        muted: s.getPropertyValue('--cg-text-muted').trim().toLowerCase(),
      };
    });
    expect(darkTokens.bg).toBe('#090d16');
    expect(darkTokens.surface).toBe('#111726');
    expect(darkTokens.muted).toBe('#94a3b8');
    await expect(page.getByTestId('sidebar-brand-logo')).toHaveAttribute(
      'src',
      /logo-horizontal-escura\.webp/,
    );
    await expect
      .poll(async () =>
        page.getByTestId('app-topbar').evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(17, 23, 38)');
    await page.waitForTimeout(220);

    // Screenshot 1440 Dark
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila01_shell_1440_dark.png` });

    // C06: Recolher Sidebar para 64px -> logo vira símbolo branco -> persiste em localStorage
    await page.getByTestId('sidebar-collapse-toggle').click();
    await expect(page.getByTestId('desktop-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await expect
      .poll(async () =>
        Math.round((await page.getByTestId('desktop-sidebar').boundingBox())?.width ?? 0),
      )
      .toBe(64);
    await expect(page.getByTestId('sidebar-brand-logo')).toHaveAttribute(
      'src',
      /simbolo-branco\.webp/,
    );

    // Verifica persistência real em localStorage após reload (removendo only removeItem do initScript via evaluate não precisa — vamos testar localStorage.getItem)
    const persistedFlag = await page.evaluate(() => localStorage.getItem('cg_sidebar_collapsed'));
    expect(persistedFlag).toBe('1');

    // Expande de volta
    await page.getByTestId('sidebar-collapse-toggle').click();
    await expect(page.getByTestId('desktop-sidebar')).toHaveAttribute('data-collapsed', 'false');

    // C08: Command Palette Ctrl+K (busca produto + navegação por teclado)
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette-modal')).toBeVisible();
    await expect(page.getByTestId('command-palette-input')).toBeFocused();
    await page.getByTestId('command-palette-input').fill('Camiseta');
    await expect(page.getByTestId('command-palette-item-product-prod-1')).toBeVisible();

    await page.getByTestId('command-palette-input').fill('Ajustes');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('command-palette-modal')).toBeHidden();
    await expect(page.getByTestId('topbar-active-title')).toContainText('Conta & Integrações');

    // C09: Menu Ajuda (?) -> Suporte -> Ctrl+V print -> Envio
    await page.getByTestId('topbar-help-menu-btn').click();
    await expect(page.getByTestId('topbar-help-popover')).toBeVisible();
    await page.getByTestId('topbar-help-open-support').click();
    await expect(page.getByTestId('support-ticket-subject')).toBeVisible();

    await page.getByTestId('support-ticket-subject').fill('Teste print Ctrl+V');
    await page.getByTestId('support-ticket-description').fill('Descrição detalhada do print.');

    // Simula Ctrl+V com arquivo PNG real na área de descrição
    await page.evaluate(() => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      );
      const file = new File([bytes], 'print.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-testid="support-ticket-description"]');
      const evt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      target?.dispatchEvent(evt);
    });

    await expect(page.getByTestId('support-ticket-attachment-preview')).toBeVisible();
    await page.getByTestId('support-ticket-submit').click();
    await expect
      .poll(() => String(getCapturedSupportPayload()?.attachmentDataUrl || ''))
      .toMatch(/^data:image\/(png|webp);base64,/);

    // Fecha modal de suporte explicitamente antes do check offline/mobile
    await page.locator('[data-slot="modal-content"] button[aria-label="Fechar janela"]').click();
    await expect(page.getByTestId('support-ticket-subject')).toBeHidden();

    // C10: Banner Offline não-destrutivo
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('companygen:network-status', { detail: { offline: true } }),
      );
    });
    await expect(page.getByTestId('network-offline-banner')).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('companygen:network-status', { detail: { offline: false } }),
      );
    });
    await expect(page.getByTestId('network-offline-banner')).toBeHidden();

    // Responsividade Mobile 390x844 (Dark & Light) com zero overflow horizontal
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDarkOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileDarkOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila01_shell_390_dark.png` });

    await page.getByTestId('topbar-theme-toggle-btn').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect
      .poll(async () =>
        page.getByTestId('app-topbar').evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(255, 255, 255)');
    await page.waitForTimeout(220);
    const mobileLightOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(mobileLightOverflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${ARTIFACT_DIR}/fila01_shell_390_light.png` });
  });

  test('C01 & C02: AccessCodeView (/route=access) adapta tema e troca logo sem caixa branca', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem('cg_theme', 'light');
    });

    await page.goto('/?route=access');
    await expect(page.getByTestId('access-brand-logo')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('access-brand-logo')).toHaveAttribute(
      'src',
      /logo-horizontal-clara\.webp/,
    );

    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cg_theme', 'dark');
    });
    await expect(page.getByTestId('access-brand-logo')).toHaveAttribute(
      'src',
      /logo-horizontal-escura\.webp/,
    );
  });
});
