import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type WebviewScriptModule = {
  buildWebviewIdentityScript: () => string;
  buildWebviewPollScript: () => string;
  buildWebviewSendScript: (opts: { chatTitle?: string; text?: string }) => string;
};

type PollOutcome = {
  connected?: boolean;
  loggedIn?: boolean;
  phoneE164?: string;
  action?: string;
  isSelfChat?: boolean;
  chatTitle?: string;
  chatPhone?: string;
  text?: string;
  selectorHealth?: 'ok' | 'degraded';
  missingSelector?: string;
  ok?: boolean;
};

const SUPABASE_PROJECT_REF = 'irahjajgudbdkgggffum';
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_EMAIL = 'webview-responder@companygen.local';

function createTestJwt(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email: TEST_USER_EMAIL, role: 'authenticated', aud: 'authenticated', exp }),
  ).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

test.describe('Opção 1 — WhatsApp WebView Auto-Responder (DOM + Ponte Electron + Sofia Local)', () => {
  test('1. Scripts WebView ignoram backlog antigo, abrem nova não lida, evitam loop e enviam resposta via Lexical/Paste', async ({
    page,
  }) => {
    const scriptMod = (await import(
      pathToFileURL(path.resolve(process.cwd(), 'desktop', 'whatsapp-webview-script.mjs')).href
    )) as WebviewScriptModule;
    const { buildWebviewIdentityScript, buildWebviewPollScript, buildWebviewSendScript } = scriptMod;

    await page.route('https://web.whatsapp.com/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `
      <!doctype html>
      <html>
        <body>
          <div id="app">
            <div id="pane-side">
              <div role="listitem" data-chat="WhatsApp Business">
                <span title="WhatsApp Business" dir="auto">WhatsApp Business</span>
                <span aria-label="1 mensagem não lida">1</span>
                <span>07/11/2026 Facilite os pagamentos</span>
              </div>
              <div role="listitem" data-chat="Meu numero:">
                <span title="Meu numero:" dir="auto">Meu numero:</span>
                <span aria-label="6 mensagens não lidas">6</span>
                <span>00:15 Ola</span>
              </div>
            </div>
            <div id="main">
              <header>
                <span title="Meu numero:" dir="auto">Meu numero:</span>
              </header>
              <div id="messages">
                <div data-id="true_556193742091@c.us_OLD1" class="message-out">
                  <span class="selectable-text">Ola</span>
                </div>
              </div>
              <footer>
                <div contenteditable="true" data-lexical-editor="true" data-tab="10" role="textbox" id="composer"></div>
                <button type="button" aria-label="Enviar" id="send-btn">Enviar</button>
              </footer>
            </div>
          </div>
          <script>
            localStorage.setItem('last-wid-md', '"556193742091:22@c.us"');
            window.__sentMessages = [];
            const composer = document.getElementById('composer');
            composer.addEventListener('paste', (e) => {
              e.preventDefault();
              const txt = e.clipboardData.getData('text/plain');
              composer.textContent = txt;
            });
            document.getElementById('send-btn').addEventListener('click', () => {
              const txt = composer.textContent.trim();
              if (!txt) return;
              window.__sentMessages.push(txt);
              const div = document.createElement('div');
              div.setAttribute('data-id', 'true_556193742091@c.us_BOT_' + window.__sentMessages.length);
              div.className = 'message-out';
              const span = document.createElement('span');
              span.className = 'selectable-text';
              span.textContent = txt;
              div.appendChild(span);
              document.getElementById('messages').appendChild(div);
              composer.textContent = '';
            });
          </script>
        </body>
      </html>
        `,
      });
    });
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

    const identity = (await page.evaluate(buildWebviewIdentityScript())) as PollOutcome;
    expect(identity.connected).toBe(true);
    expect(identity.loggedIn).toBe(true);
    expect(identity.phoneE164).toBe('556193742091');

    // 1a chamada: baseline — deve ignorar backlog antigo ("WhatsApp Business", "Ola")
    const basePoll = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(basePoll.action).toBe('baseline');

    // 2a chamada sem mensagens novas: idle
    const idlePoll = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(idlePoll.action).toBe('idle');

    // Simula usuario enviando nova mensagem no auto-chat "Meu numero:"
    await page.evaluate(() => {
      const div = document.createElement('div');
      div.setAttribute('data-id', 'true_556193742091@c.us_NEW1');
      div.className = 'message-out';
      const span = document.createElement('span');
      span.className = 'selectable-text';
      span.textContent = 'Qual o preço do carregador?';
      div.appendChild(span);
      document.getElementById('messages')!.appendChild(div);
    });

    const selfChatIncoming = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(selfChatIncoming.action).toBe('incoming');
    expect(selfChatIncoming.isSelfChat).toBe(true);
    expect(selfChatIncoming.text).toBe('Qual o preço do carregador?');

    // Envia resposta do bot para "Meu numero:" e confirma zero auto-loop na próxima leitura
    const sendRes = (await page.evaluate(
      buildWebviewSendScript({
        chatTitle: 'Meu numero:',
        text: 'Olá! O Carregador GaN sai por *R$ 189,90*. Posso enviar?',
      }),
    )) as PollOutcome;
    expect(sendRes.ok).toBe(true);
    const sentList = await page.evaluate(() => (window as unknown as { __sentMessages: string[] }).__sentMessages);
    expect(sentList).toHaveLength(1);
    expect(sentList[0]).toContain('189,90');

    // Próximo poll NÃO deve responder à própria resposta do bot
    const noLoopPoll = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(noLoopPoll.action).toBe('idle');

    // Chegada de mensagem não lida em conversa de cliente externo na sidebar (#pane-side)
    await page.evaluate(() => {
      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <span title="Cliente Novo" dir="auto">Cliente Novo</span>
        <span aria-label="1 mensagem não lida">1</span>
        <span>Agora Quero comprar</span>
      `;
      row.addEventListener('click', () => {
        const hdr = document.querySelector('#main header span[title]')!;
        hdr.setAttribute('title', 'Cliente Novo');
        hdr.textContent = 'Cliente Novo';
        const msgs = document.getElementById('messages')!;
        msgs.innerHTML = `
          <div data-id="false_551199887766@c.us_CUST1" class="message-in">
            <span class="selectable-text">Quero comprar 2 carregadores via PIX</span>
          </div>
        `;
      });
      document.getElementById('pane-side')!.prepend(row);
    });

    const openedRow = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(openedRow.action).toBe('opened_unread_chat');
    expect(openedRow.chatTitle).toBe('Cliente Novo');

    const incomingExt = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(incomingExt.action).toBe('incoming');
    expect(incomingExt.isSelfChat).toBe(false);
    expect(incomingExt.chatPhone).toBe('551199887766');
    expect(incomingExt.text).toBe('Quero comprar 2 carregadores via PIX');
  });

  test('3. DOM real WhatsApp Web 2026: linhas duplicadas no baseline, header direto, cell-frame-container e tail-in sem .message-in', async ({
    page,
  }) => {
    const scriptMod = (await import(
      pathToFileURL(path.resolve(process.cwd(), 'desktop', 'whatsapp-webview-script.mjs')).href
    )) as WebviewScriptModule;
    const { buildWebviewPollScript, buildWebviewSendScript } = scriptMod;

    await page.route('https://web.whatsapp.com/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `
      <!doctype html>
      <html>
        <body>
          <div id="app">
            <div id="pane-side">
              <div role="row" data-testid="list-item-0">
                <div role="gridcell" tabindex="0">
                  <div data-testid="cell-frame-container">
                    <span data-testid="cell-frame-title"><span title="Meu numero:" dir="auto">Meu numero:</span></span>
                    <span title="Ola">Ola</span>
                  </div>
                </div>
              </div>
              <div role="row" data-testid="list-item-1">
                <div role="gridcell" tabindex="0">
                  <div data-testid="cell-frame-container">
                    <span data-testid="cell-frame-title"><span title="Minha Claro" dir="auto">Minha Claro</span></span>
                    <span data-testid="icon-unread-count" aria-label="2 mensagens não lidas">2</span>
                    <span>Aviso antigo</span>
                  </div>
                </div>
              </div>
              <div role="row" data-testid="list-item-2">
                <div role="gridcell" tabindex="0">
                  <div data-testid="cell-frame-container">
                    <span data-testid="cell-frame-title"><span title="Minha Claro" dir="auto">Minha Claro</span></span>
                    <span data-testid="icon-unread-count" aria-label="11 mensagens não lidas">11</span>
                    <span>Alerta antigo</span>
                  </div>
                </div>
              </div>
            </div>
            <div id="main">
              <header>
                <span data-testid="conversation-info-header-chat-title" dir="auto">Meu numero:</span>
                <span data-testid="selectable-text" title="clique para mostrar os dados do contato">clique para mostrar os dados do contato</span>
              </header>
              <div id="messages">
                <div tabindex="-1" data-id="3AD47C420583936C7B09" data-testid="conv-msg-3AD47C420583936C7B09">
                  <div data-testid="msg-container">
                    <span data-testid="selectable-text">Ola</span>
                  </div>
                </div>
              </div>
              <footer>
                <div contenteditable="true" data-lexical-editor="true" role="textbox" id="composer"></div>
                <button type="button" aria-label="Mensagem de voz" id="voice-btn">Voz</button>
              </footer>
            </div>
          </div>
          <script>
            localStorage.setItem('last-wid-md', '"556193742091:22@c.us"');
            window.__sent2026 = [];
            const footer = document.querySelector('#main footer');
            const comp = document.getElementById('composer');
            comp.addEventListener('paste', (e) => {
              e.preventDefault();
              comp.textContent = e.clipboardData.getData('text/plain');
              const mic = document.getElementById('voice-btn');
              if (mic) {
                mic.setAttribute('aria-label', 'Enviar');
                mic.textContent = 'ic-send-filled';
                mic.onclick = () => {
                  window.__sent2026.push(comp.textContent.trim());
                  comp.textContent = '';
                };
              }
            });
          </script>
        </body>
      </html>
        `,
      });
    });
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

    expect(((await page.evaluate(buildWebviewPollScript())) as PollOutcome).action).toBe('baseline');
    // Não pode confundir as duas linhas "Minha Claro" após baseline
    expect(((await page.evaluate(buildWebviewPollScript())) as PollOutcome).action).toBe('idle');

    // Usuário manda nova mensagem no self-chat "Meu numero:" mesmo com span distrator no header
    await page.evaluate(() => {
      const m = document.createElement('div');
      m.setAttribute('data-id', '3ANEWSELF2026');
      m.setAttribute('data-testid', 'conv-msg-3ANEWSELF2026');
      m.innerHTML = `<div data-testid="msg-container"><span data-testid="selectable-text">Quero 1 produto</span></div>`;
      document.getElementById('messages')!.appendChild(m);
    });
    const selfEvt = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(selfEvt.action).toBe('incoming');
    expect(selfEvt.chatTitle).toBe('Meu numero:');
    expect(selfEvt.isSelfChat).toBe(true);
    expect(selfEvt.text).toBe('Quero 1 produto');

    const sent = (await page.evaluate(
      buildWebviewSendScript({ chatTitle: 'Meu numero:', text: 'Oi! Já te passo o valor.' }),
    )) as PollOutcome;
    expect(sent.ok).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __sent2026: string[] }).__sent2026)).toEqual([
      'Oi! Já te passo o valor.',
    ]);

    // Nova conversa de cliente chega na sidebar com cell-frame-container e tail-in (sem .message-in)
    await page.evaluate(() => {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.setAttribute('data-testid', 'list-item-new');
      row.innerHTML = `
        <div role="gridcell" tabindex="0">
          <div data-testid="cell-frame-container">
            <span data-testid="cell-frame-title"><span title="+55 61 9372-3576" dir="auto">+55 61 9372-3576</span></span>
            <span data-testid="icon-unread-count" aria-label="1 mensagem não lida">1</span>
            <span>Agora Boa tarde</span>
          </div>
        </div>
      `;
      row.querySelector('[data-testid="cell-frame-container"]')!.addEventListener('click', () => {
        const hdr = document.querySelector('[data-testid="conversation-info-header-chat-title"]')!;
        hdr.textContent = '+55 61 9372-3576';
        document.getElementById('messages')!.innerHTML = `
          <div data-id="AC495CDF82AB" data-testid="conv-msg-AC495CDF82AB">
            <div data-testid="msg-container">
              <span data-testid="tail-in" data-icon="tail-in"></span>
              <span data-testid="selectable-text">Boa tarde, tem estoque?</span>
            </div>
          </div>
        `;
      });
      document.getElementById('pane-side')!.prepend(row);
    });

    const opened = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(opened.action).toBe('opened_unread_chat');
    expect(opened.chatTitle).toBe('+55 61 9372-3576');

    const incomingCustomer = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(incomingCustomer.action).toBe('incoming');
    expect(incomingCustomer.isSelfChat).toBe(false);
    expect(incomingCustomer.chatPhone).toBe('556193723576');
    expect(incomingCustomer.text).toBe('Boa tarde, tem estoque?');
  });

  test('2. Renderer + Desktop Bridge respondem mensagem recebida no WebView usando catálogo local + Sofia IA', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-webview-bridge-'));
    const authJwt = createTestJwt(TEST_USER_ID);
    const workspaceModPath = path.resolve(process.cwd(), 'server', 'workspace.mjs');
    const { createWorkspaceApi } = (await import(pathToFileURL(workspaceModPath).href)) as {
      createWorkspaceApi: (opts: { root: string; fetch?: typeof globalThis.fetch }) => {
        handler: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => Promise<void>;
        close: () => Promise<void>;
      };
    };

    const nativeFetch = globalThis.fetch;
    const workspaceApi = createWorkspaceApi({
      root: tempDir,
      fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/auth/v1/user')) {
          return Response.json(
            { id: TEST_USER_ID, email: TEST_USER_EMAIL, role: 'authenticated', aud: 'authenticated' },
            { status: 200 },
          );
        }
        if (url.includes('/rest/v1/')) {
          return Response.json({ code: 'PGRST205' }, { status: 404 });
        }
        return nativeFetch(input, init);
      },
    });

    const distRoot = path.resolve(process.cwd(), 'dist');
    const httpServer = http.createServer(async (req, res) => {
      const cleanPath = (req.url || '/').split('?')[0] || '/';
      if (cleanPath.startsWith('/api/')) {
        await workspaceApi.handler(req, res, () => {
          if (!res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
          }
        });
        return;
      }
      const rel = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
      const candidate = path.resolve(distRoot, rel);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
          res.end(await fs.readFile(candidate));
          return;
        }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await fs.readFile(path.join(distRoot, 'index.html')));
    });

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Bind error');
    const origin = `http://127.0.0.1:${addr.port}`;

    try {
      // Garante saldo de créditos no workspace temporário para o caminho GLM ao vivo em .env
      const redeemRes = await fetch(`${origin}/api/access/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authJwt}` },
        body: JSON.stringify({ code: 'AI10-DEMO-SOF1' }),
      });
      expect(redeemRes.status).toBe(200);

      await fetch(`${origin}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authJwt}` },
        body: JSON.stringify({
          revision: 0,
          profile: {
            schemaVersion: 1,
            onboarding: {
              whatsappConnected: false,
              whatsappConfirmed: true,
              fichaCompleted: true,
              storeGenerated: true,
            },
            business: {
              name: 'VoltTech WebView',
              segment: 'Eletronicos',
              description: 'Loja oficial',
              address: 'Av. Paulista, 900',
              mapsUrl: '',
              hours: '09h-18h',
              email: 'oi@volttech.local',
            },
            whatsapp: {
              connected: false,
              jid: '556193742091@s.whatsapp.net',
              phoneE164: '556193742091',
              displayPhone: '(61) 9374-2091',
              profileName: 'VoltTech',
              profilePhotoUrl: '',
              verifiedOrigin: 'manual',
            },
            payment: {
              pixKey: 'pix@volttech.local',
              pixDiscountPercent: 5,
              acceptedMethods: ['pix', 'credit_card'],
            },
            delivery: {
              pickupEnabled: true,
              deliveryEnabled: true,
              areas: ['São Paulo'],
              defaultFeeCents: 1500,
              pickupHours: '09h-18h',
            },
            agent: { name: 'Sofia', tone: 'proximo', autoReplyEnabled: true, welcomeMessage: '' },
            brand: { instagram: '', logoUrl: '', primaryColor: '#111827', accentColor: '#10b981', themePreset: 'clean-commerce' },
            catalog: {
              products: [
                {
                  id: 'p1',
                  sku: 'GAN-65',
                  name: 'Carregador GaN 65W',
                  category: 'Carregadores',
                  description: 'Carregador rápido USB-C',
                  priceCents: 18990,
                  variation: 'Preto',
                  stock: 10,
                  active: true,
                  imageUrl: '',
                  approvedAsset: true,
                },
              ],
            },
            storeLayout: { published: true, publishedAt: new Date().toISOString(), widgets: [] },
          },
        }),
      });

      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.addInitScript(
        ({ key, userId, email, token }) => {
          localStorage.setItem(
            key,
            JSON.stringify({
              access_token: token,
              refresh_token: 'refresh',
              token_type: 'bearer',
              expires_in: 86400,
              expires_at: Math.floor(Date.now() / 1000) + 86400,
              user: { id: userId, email, role: 'authenticated' },
            }),
          );
          let pollCount = 0;
          const sentReplies: Array<{ chatTitle?: string; text: string }> = [];
          (window as unknown as Record<string, unknown>).__sentWebviewReplies = sentReplies;
          (window as unknown as Record<string, unknown>).companygenDesktop = {
            isDesktop: true,
            openWhatsAppExternal: async () => true,
            readWhatsAppIdentity: async () => ({ connected: true, loggedIn: true, phoneE164: '556193742091' }),
            pollWhatsAppInbox: async () => {
              pollCount += 1;
              if (pollCount === 1) {
                return {
                  loggedIn: true,
                  connected: true,
                  phoneE164: '556193742091',
                  action: 'incoming',
                  chatTitle: 'Joana Silva',
                  chatPhone: '5511988881111',
                  isSelfChat: false,
                  msgKey: 'msg-joana-1',
                  text: 'Qual o valor do Carregador GaN 65W?',
                };
              }
              return { loggedIn: true, connected: true, phoneE164: '556193742091', action: 'idle' };
            },
            sendWhatsAppReply: async (payload: { chatTitle?: string; text: string }) => {
              sentReplies.push(payload);
              return { ok: true, method: 'send_button' };
            },
            logoutWhatsAppWebview: async () => ({ ok: true }),
          };
        },
        { key: SUPABASE_STORAGE_KEY, userId: TEST_USER_ID, email: TEST_USER_EMAIL, token: authJwt },
      );

      await context.route('https://**/*', async (route) => {
        const url = route.request().url();
        if (url.includes('/auth/v1/user')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: TEST_USER_ID, email: TEST_USER_EMAIL, role: 'authenticated' }),
          });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      const page = await context.newPage();
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('nav-tab-whatsapp').click();

      // Barra superior deve mostrar estado verde "WhatsApp conectado e respondendo" (e não mais azul "Link direto ativo")
      await expect(page.getByText('WhatsApp conectado e respondendo').first()).toBeVisible({ timeout: 15_000 });

      // Aguarda o ciclo automático do WebView Responder chamar Sofia IA + enviar resposta no WebView
      await expect
        .poll(
          async () =>
            page.evaluate(
              () => ((window as unknown as Record<string, unknown>).__sentWebviewReplies as Array<{ text: string }>).length,
            ),
          { timeout: 45_000 },
        )
        .toBeGreaterThan(0);

      const replies = await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__sentWebviewReplies as Array<{ chatTitle?: string; text: string }>,
      );
      expect(replies[0].chatTitle).toBe('Joana Silva');
      expect(replies[0].text).toMatch(/189,90|GaN|Carregador/i);

      await context.close();
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await workspaceApi.close().catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('5. Sessão WebView 2026 sem localStorage last-wid-md (apenas #pane-side + window.Store.Conn.wid) continua detectada como conectada', async ({
    page,
  }) => {
    const scriptMod = (await import(
      pathToFileURL(path.resolve(process.cwd(), 'desktop', 'whatsapp-webview-script.mjs')).href
    )) as WebviewScriptModule;
    const { buildWebviewIdentityScript, buildWebviewPollScript } = scriptMod;

    await page.route('https://web.whatsapp.com/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `
          <!doctype html>
          <html>
            <body>
              <div id="app">
                <div id="pane-side">
                  <div role="listitem">
                    <span title="Cliente IndexedDB" dir="auto">Cliente IndexedDB</span>
                    <span aria-label="1 mensagem não lida">1</span>
                    <span>Boa tarde</span>
                  </div>
                </div>
              </div>
              <script>
                window.Store = { Conn: { wid: { user: '5511977776655' } } };
              </script>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    const identity = (await page.evaluate(buildWebviewIdentityScript())) as PollOutcome;
    expect(identity.loggedIn).toBe(true);
    expect(identity.connected).toBe(true);
    expect(identity.phoneE164).toBe('5511977776655');

    const baseline = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(baseline.connected).toBe(true);
    expect(baseline.loggedIn).toBe(true);
  });

  test('6. WebView sinaliza selectorHealth=degraded após 3 polls sem linhas/composer quando #pane-side existe', async ({
    page,
  }) => {
    const scriptMod = (await import(
      pathToFileURL(path.resolve(process.cwd(), 'desktop', 'whatsapp-webview-script.mjs')).href
    )) as WebviewScriptModule;
    const { buildWebviewPollScript } = scriptMod;

    await page.route('https://web.whatsapp.com/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `
          <!doctype html>
          <html>
            <body>
              <div data-testid="chat-list"></div>
              <script>window.Store = { Conn: { wid: { user: '5511977776655' } } };</script>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    const p1 = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    const p2 = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    const p3 = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    const p4 = (await page.evaluate(buildWebviewPollScript())) as PollOutcome;
    expect(p1.loggedIn).toBe(true);
    expect(p2.selectorHealth).toBe('ok');
    expect(p3.selectorHealth).toBe('ok');
    expect(p4.selectorHealth).toBe('degraded');
    expect(p4.missingSelector).toBe('sidebar_rows');
  });
});
