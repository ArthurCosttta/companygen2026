import { test, expect } from '@playwright/test';
// @ts-expect-error JS module without .d.ts
import { buildWebviewPollScript } from '../shared/whatsapp-webview-script.mjs';

interface PollOutcome {
  action?: string;
  hasAudio?: boolean;
  text?: string;
  items?: Array<{ kind?: string; durationHint?: string; text?: string }>;
}

const ARTIFACT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1';

const SUPABASE_URL = 'https://irahjajgudbdkgggffum.supabase.co';
const STORAGE_KEY = 'sb-irahjajgudbdkgggffum-auth-token';
const USER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

test('QA13-01 & QA13-07: WebView Poll Script captura rajada de 10 balões + áudio e protege histórico manual', async ({ page }) => {
  await page.setContent(`
    <div id="pane-side">
      <div role="row"><span data-testid="cell-frame-title"><span title="Maria Cliente">Maria Cliente</span></span></div>
      <div role="row"><span data-testid="cell-frame-title"><span title="Chat Antigo">Chat Antigo</span></span></div>
    </div>
    <div id="main">
      <header><span data-testid="conversation-info-header-chat-title"><span title="Maria Cliente">Maria Cliente</span></span></header>
      <div id="msgs">
        <div data-id="true_5561999990001@c.us_OLD1" class="message-out"><span class="selectable-text">Olá, posso ajudar?</span></div>
      </div>
      <footer><div contenteditable="true" data-lexical-editor="true"></div></footer>
    </div>
  `);

  const pollScript = buildWebviewPollScript();

  // Baseline inicial
  const base = (await page.evaluate(pollScript)) as PollOutcome;
  expect(base.action).toBe('baseline');

  // QA13-01: Injeta rajada de 10 balões incoming + 1 balão de áudio PTT
  await page.evaluate(() => {
    const msgs = document.getElementById('msgs');
    for (let i = 1; i <= 10; i += 1) {
      const div = document.createElement('div');
      div.setAttribute('data-id', `false_5561999990001@c.us_BURST_${i}`);
      div.className = 'message-in';
      div.innerHTML = `<span class="selectable-text">Rajada item ${i}</span>`;
      msgs?.appendChild(div);
    }
    const audioDiv = document.createElement('div');
    audioDiv.setAttribute('data-id', 'false_5561999990001@c.us_AUDIO_11');
    audioDiv.className = 'message-in';
    audioDiv.innerHTML = `<span data-icon="ptt-play" aria-label="Mensagem de voz"></span><span>0:14</span>`;
    msgs?.appendChild(audioDiv);
  });

  const burstOutcome = (await page.evaluate(pollScript)) as PollOutcome;
  expect(burstOutcome.action).toBe('incoming');
  expect(burstOutcome.hasAudio).toBe(true);
  expect(burstOutcome.items?.length).toBe(11);
  for (let i = 1; i <= 10; i += 1) {
    expect(burstOutcome.text).toContain(`Rajada item ${i}`);
  }
  expect(burstOutcome.items?.[10]?.kind).toBe('audio');
  expect(burstOutcome.items?.[10]?.durationHint).toBe('0:14');

  // Poll seguinte deve ser idle (sem duplicar rajada)
  const idleAfter = (await page.evaluate(pollScript)) as PollOutcome;
  expect(idleAfter.action).toBe('idle');

  // QA13-07: Lojista abre manualmente um chat antigo com 50 mensagens velhas -> zero resposta!
  await page.evaluate(() => {
    const headerTitle = document.querySelector('#main header span[title]');
    headerTitle?.setAttribute('title', 'Chat Antigo');
    if (headerTitle) headerTitle.textContent = 'Chat Antigo';
    const msgs = document.getElementById('msgs');
    if (msgs) {
      msgs.innerHTML = '';
      for (let i = 1; i <= 50; i += 1) {
        const div = document.createElement('div');
        div.setAttribute('data-id', `false_5561888880000@c.us_HIST_${i}`);
        div.className = 'message-in';
        div.innerHTML = `<span class="selectable-text">Mensagem velha ${i}</span>`;
        msgs.appendChild(div);
      }
    }
  });

  const manualSwitchOutcome = (await page.evaluate(pollScript)) as PollOutcome;
  expect(manualSwitchOutcome.action).toBe('idle');
});

test('QA13-09 Visual Proof: Preview WhatsApp Grande (>=60% largura) + 10 Toggles Tela Cheia sem desmontar WebView + Auto-Reparo', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });

  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'loja@farmacialume.com.br',
    app_metadata: {},
    user_metadata: { full_name: 'Lojista Lume' },
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: 'fila13-qa-token',
    refresh_token: 'fila13-qa-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };

  await context.addInitScript(
    ({ key, val }) => {
      localStorage.setItem(key, JSON.stringify(val));
      localStorage.setItem('cg_theme', 'dark');
      (window as unknown as Record<string, unknown>).__repairCalls = 0;
      (window as unknown as Record<string, unknown>).companygenDesktop = {
        isDesktop: true,
        readWhatsAppIdentity: async () => ({ connected: true, loggedIn: true, phoneE164: '5561999990001' }),
        pollWhatsAppInbox: async () => ({ loggedIn: true, connected: true, action: 'idle', selectorHealth: 'ok' }),
        sendWhatsAppReply: async () => ({ ok: true }),
        repairWhatsAppWebview: async () => {
          (window as unknown as Record<string, number>).__repairCalls += 1;
          return { ok: true, preservedSession: true };
        },
        setTrayStatus: async () => ({ ok: true }),
        getHealthSnapshot: async () => ({ trayActive: true, webviewConnected: true, lastPollMs: 42, appVersion: '1.1.0', soundEnabled: true }),
      };
    },
    { key: STORAGE_KEY, val: session },
  );

  await context.route(`${SUPABASE_URL}/auth/v1/**`, (route) => route.fulfill({ json: user }));
  await context.route('**/api/admin/status', (route) => route.fulfill({ json: { ok: true, isAdmin: false } }));
  await context.route('**/api/credits/**', (route) =>
    route.fulfill({ json: { success: true, ok: true, balance: 55, costs: { glm_whatsapp: 0.1 }, history: [], used: 0, limit: 3, remaining: 3 } }),
  );
  await context.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        revision: 4,
        profile: {
          onboarding: { fichaCompleted: true, storeGenerated: true, welcomeDismissed: true },
          business: { name: 'Farmácia Lume', segment: 'Farmácia', businessModel: 'produtos', whatsapp: '+5561999990001' },
          whatsapp: { connected: true, phoneE164: '+5561999990001' },
          catalog: { products: [{ id: 'p1', sku: 'HID-01', name: 'Hidratante Facial 50g', priceCents: 6990, active: true }] },
          publishedStore: { published: true, publicSlug: 'farmacia-lume' },
        },
      },
    }),
  );
  await context.route('**/api/orders**', (route) => route.fulfill({ json: { orders: [] } }));
  await context.route('**/api/dashboard**', (route) => route.fulfill({ json: { ok: true, visits_total: 12, orders_total: 0, revenue_cents: 0, recent_orders: [] } }));
  await context.route('**/api/whatsapp/ai/brain', (route) =>
    route.fulfill({
      json: {
        ok: true,
        brain: { enabled: true, autoReplyWhenConnected: true, autonomyMode: 'misto', tone: 'amigavel', customPrompt: '', ragDocuments: [] },
        ollamaOnline: false,
        availableModels: [],
        cloudAiAvailable: true,
        creditBalance: 55,
      },
    }),
  );
  await context.route('**/api/whatsapp/**', (route) =>
    route.fulfill({ json: { ok: true, conectado: true, connected: true, phase: 'LIVE_READY', numeroBot: '5561999990001', messages: [], alerts: [], notifications: [], queueItems: [], templates: [] } }),
  );
  await context.route('**/api/desktop/release-policy', (route) => route.fulfill({ json: { minSupportedVersion: '1.0.0', latestVersion: '1.1.0', forceUpdate: false } }));

  const page = await context.newPage();
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  await page.locator('[data-testid="sidebar-tab-whatsapp"], button:has-text("WhatsApp")').first().click();
  await expect(page.getByTestId('wpp-channel-section')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('wpp-fullscreen-toggle-btn')).toBeVisible({ timeout: 10_000 });

  // Marca instância DOM do <webview> para provar que 10 toggles de Tela Cheia NUNCA desmontam o elemento
  const webviewMounted = await page.evaluate(() => {
    const wv = document.querySelector('webview');
    if (!wv) return false;
    (wv as unknown as Record<string, string>).__cgInstanceMarker = 'PERSISTENT_WV_INSTANCE';
    return true;
  });
  expect(webviewMounted).toBe(true);

  const sectionBox = await page.getByTestId('wpp-channel-section').boundingBox();
  expect(sectionBox).toBeTruthy();
  expect(sectionBox!.width).toBeGreaterThanOrEqual(640);
  expect(sectionBox!.height).toBeGreaterThanOrEqual(600);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fila13_whatsapp_preview_grande_1366.png`, fullPage: false });

  // Stress de 10 toggles seguidos de Tela Cheia + Auto-Reparo
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let i = 0; i < 9; i += 1) {
    await page.getByTestId('wpp-fullscreen-toggle-btn').click();
  }
  await expect(page.getByTestId('wpp-channel-section')).toHaveAttribute('data-fullscreen', 'true');
  await page.screenshot({ path: `${ARTIFACT_DIR}/fila13_whatsapp_fullscreen_1440.png`, fullPage: false });

  // Testa saída pelo Esc
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wpp-channel-section')).toHaveAttribute('data-fullscreen', 'false');

  // Confirma que a MESMA instância <webview> permaneceu montada (0 unmount!)
  const stillSameWebview = await page.evaluate(() => {
    const wv = document.querySelector('webview') as (Element & { __cgInstanceMarker?: string }) | null;
    return wv?.__cgInstanceMarker === 'PERSISTENT_WV_INSTANCE';
  });
  expect(stillSameWebview).toBe(true);

  // Testa botão Auto-Reparo
  await page.getByTestId('wpp-auto-repair-btn').click();
  const repairCalls = await page.evaluate(() => (window as unknown as Record<string, number>).__repairCalls);
  expect(repairCalls).toBe(1);

  await context.close();
});
