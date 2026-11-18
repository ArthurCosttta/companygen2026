import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { _electron: electron } = require('playwright');
const { createWorkspaceApi } = await import('../server/workspace.mjs');

const ARTIFACT_DIR =
  process.env.CG_ARTIFACT_DIR ||
  'C:\\Users\\arthur\\.gemini\\antigravity\\brain\\11169f73-159b-4308-91e9-7ace60c123e1';

function createTestJwt(userId, email = 'desktop-wpp@test.local') {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, email, role: 'authenticated', aud: 'authenticated', exp: nowSec + 3600 }),
  ).toString('base64url');
  const sig = createHmac('sha256', 'desktop-wpp-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

test('Desktop Electron REAL (<webview> OOP + IPC + Sofia IA): responde 1x sem triplicar texto mesmo após pause em Meu numero', async (t) => {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cg-electron-wpp-'));
  const userDataDir = path.join(tempDir, 'electron-userdata');
  const dataDir = path.join(tempDir, 'workspaces');
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const userId = '11111111-1111-4111-8111-111111111111';
  const authJwt = createTestJwt(userId);
  const partition = `persist:companygen-wa-${userId}`;

  const workspaceApi = createWorkspaceApi({
    root: dataDir,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/auth/v1/user')) {
        const hdrs = new Headers(init?.headers);
        const token = (hdrs.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (token === authJwt) {
          return Response.json(
            { id: userId, email: 'desktop-wpp@test.local', role: 'authenticated', aud: 'authenticated' },
            { status: 200 },
          );
        }
        return Response.json({ error: 'invalid' }, { status: 401 });
      }
      if (url.includes('/rest/v1/')) {
        return Response.json({ code: 'PGRST205' }, { status: 404 });
      }
      return globalThis.fetch(input, init);
    },
  });

  const distRoot = path.resolve(process.cwd(), 'dist');
  const httpServer = http.createServer(async (req, res) => {
    const cleanPath = (req.url || '/').split('?')[0] || '/';
    if (cleanPath.startsWith('/api/')) {
      await workspaceApi.handler(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
      });
      return;
    }
    const relPath = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
    const filePath = path.resolve(distRoot, relPath);
    if (!filePath.startsWith(distRoot)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.js' ? 'application/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.woff2' ? 'font/woff2'
        : 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.end(data);
    } catch {
      const html = await fs.readFile(path.join(distRoot, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    }
  });

  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  const origin = `http://127.0.0.1:${port}`;

  // Pre-seed catálogo e pausa antiga no self-chat (cenário real que bloqueava Meu numero!)
  const userWsDir = path.join(dataDir, userId);
  await fs.mkdir(userWsDir, { recursive: true });
  const initRes = await fetch(`${origin}/api/profile`, {
    headers: { Authorization: `Bearer ${authJwt}` },
  });
  const initJson = await initRes.json();
  const seededProfile = {
    ...initJson.profile,
    business: { ...initJson.profile.business, name: 'Loja Desktop Teste' },
    catalog: {
      ...initJson.profile.catalog,
      products: [
        {
          id: 'p1',
          sku: 'GAN-100',
          name: 'Carregador GaN Pro 100W',
          priceCents: 18990,
          variation: 'Preto',
          stock: 15,
          active: true,
          category: 'Eletrônicos',
        },
      ],
    },
  };
  await fetch(`${origin}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authJwt}` },
    body: JSON.stringify({ revision: initJson.revision, profile: seededProfile }),
  });
  await fetch(`${origin}/api/whatsapp/ai/brain`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authJwt}` },
    body: JSON.stringify({
      enabled: true,
      autoReplyWhenConnected: true,
      modelName: 'qwen2.5:0.5b',
      systemPrompt: 'Responda objetivamente com o preço do catálogo.',
    }),
  });
  // Simula escalada anterior em Meu numero que travava self-chat no passado
  await fetch(`${origin}/api/whatsapp/ai/classify-and-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authJwt}` },
    body: JSON.stringify({
      customerName: 'Meu numero:',
      customerPhone: '556193742091',
      customerJid: '556193742091@s.whatsapp.net',
      messageText: 'Quero falar com atendente',
      mode: 'live_whatsapp',
    }),
  });

  await fs.mkdir(path.join(dataDir, userId), { recursive: true });
  await fs.writeFile(
    path.join(dataDir, userId, 'credits_ledger.json'),
    JSON.stringify([{ id: 'init-1', user_id: userId, delta: 100, balance_after: 100, operation_type: 'welcome_invite', created_at: new Date().toISOString() }], null, 2),
  );
  const electronApp = await electron.launch({
    args: [path.resolve('desktop/main.mjs')],
    env: {
      ...process.env,
      COMPANYGEN_URL: `${origin}/`,
      COMPANYGEN_USER_DATA: userDataDir,
    },
  });

  try {
    // Intercepta https://web.whatsapp.com/ na partição isolada real do Electron <webview>
    const mockWhatsappHtml = `<!doctype html>
<html>
  <body style="font-family:sans-serif;padding:16px;background:#efeae2">
    <div id="app">
      <div id="pane-side">
        <div role="row" data-testid="list-item-0">
          <div role="gridcell" tabindex="0">
            <div data-testid="cell-frame-container">
              <span data-testid="cell-frame-title"><span title="Meu numero:" dir="auto">Meu numero:</span></span>
              <span>Ola</span>
            </div>
          </div>
        </div>
      </div>
      <div id="main">
        <header>
          <span data-testid="conversation-info-header-chat-title" dir="auto">Meu numero:</span>
        </header>
        <div id="messages">
          <div data-id="false_556193742091@c.us_OLD1" data-testid="conv-msg-OLD1">
            <div data-testid="msg-container"><span data-testid="selectable-text">Ola</span></div>
          </div>
        </div>
        <footer>
          <div contenteditable="true" data-lexical-editor="true" role="textbox" id="composer" style="min-height:36px;border:1px solid #ccc;padding:6px;background:#fff"></div>
          <button type="button" aria-label="Enviar" data-testid="compose-btn-send" id="send-btn" style="display:none">Enviar</button>
        </footer>
      </div>
    </div>
    <script>
      localStorage.setItem('last-wid-md', '"556193742091:22@c.us"');
      window.__sentElectronReplies = [];
      const composer = document.getElementById('composer');
      const sendBtn = document.getElementById('send-btn');
      const syncBtn = () => {
        sendBtn.style.display = (composer.innerText || composer.textContent || '').trim() ? 'inline-block' : 'none';
      };
      composer.addEventListener('input', syncBtn);
      composer.addEventListener('paste', (e) => {
        e.preventDefault();
        const txt = e.clipboardData.getData('text/plain');
        composer.textContent = (composer.textContent || '') + txt;
        syncBtn();
      });
      sendBtn.addEventListener('click', () => {
        const val = (composer.innerText || composer.textContent || '').trim();
        if (!val) return;
        window.__sentElectronReplies.push(val);
        composer.textContent = '';
        syncBtn();
        const out = document.createElement('div');
        out.setAttribute('data-id', 'true_556193742091@c.us_BOT_' + Date.now());
        out.innerHTML = '<div data-testid="msg-container"><span data-testid="selectable-text">' + val + '</span></div>';
        document.getElementById('messages').appendChild(out);
      });
      new MutationObserver(syncBtn).observe(composer, { childList: true, characterData: true, subtree: true });
    </script>
  </body>
</html>`;

    await electronApp.evaluate(async ({ session, net }, { part, html }) => {
      const ses = session.fromPartition(part);
      ses.protocol.handle('https', (request) => {
        if (new URL(request.url).origin === 'https://web.whatsapp.com') {
          return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return net.fetch(request);
      });
    }, { part: partition, html: mockWhatsappHtml });

    const win = await electronApp.firstWindow();
    const SUPABASE_PROJECT_REF = 'irahjajgudbdkgggffum';
    const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
    const userObj = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'desktop-wpp@test.local',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Operador Desktop' },
    };
    const sessionObj = {
      access_token: authJwt,
      refresh_token: 'desktop-refresh',
      expires_in: 36000,
      expires_at: Math.floor(Date.now() / 1000) + 36000,
      token_type: 'bearer',
      user: userObj,
    };

    await win.context().route(`https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/**`, async (route) => {
      const url = route.request().url();
      if (url.includes('/user')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(userObj) });
      }
      if (url.includes('/token')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionObj) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await win.evaluate(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: SUPABASE_STORAGE_KEY, session: sessionObj });
    await win.reload({ waitUntil: 'domcontentloaded' });

    // Vai para aba WhatsApp e garante que responde mesmo com histórico antigo de atendente em Meu numero
    await win.waitForTimeout(2500);
    await win.evaluate(() => {
      const btns = [...document.querySelectorAll('[data-testid="nav-tab-whatsapp"], [data-testid="nav-tab-whatsapp-mobile"]')];
      const vis = btns.find((b) => b.getBoundingClientRect().width > 0) || btns[0];
      vis?.click();
    });

    // Aguarda atendente Desktop ativo rápido (<15s)
    const statusLocator = win.locator('[data-testid="wpp-desktop-live-responder-status"]');
    await statusLocator.waitFor({ state: 'visible', timeout: 15_000 });
    const deadlineActive = Date.now() + 18_000;
    while (Date.now() < deadlineActive) {
      const txt = await statusLocator.innerText().catch(() => '');
      if (/Atendente Desktop ativo/i.test(txt)) break;
      await win.waitForTimeout(500);
    }
    const activeStatusText = await statusLocator.innerText();
    assert.match(activeStatusText, /Atendente Desktop ativo/i);

    // Aguarda baseline rodar (1 ciclo)
    await win.waitForTimeout(2500);

    // Injeta mensagem do cliente dentro do OOP <webview> real do Electron em "Meu numero:"
    await electronApp.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && !c.isDestroyed());
      if (!guest) throw new Error('Electron <webview> guest not found');
      await guest.executeJavaScript(`(() => {
        const m = document.createElement('div');
        m.setAttribute('data-id', 'false_556193742091@c.us_LIVE_' + Date.now());
        m.setAttribute('data-testid', 'conv-msg-LIVE1');
        m.innerHTML = '<div data-testid="msg-container"><span data-testid="selectable-text">Quanto custa o Carregador GaN Pro 100W?</span></div>';
        document.getElementById('messages').appendChild(m);
      })()`, true);
    });

    // Aguarda resposta enviada DENTRO DO <webview> OOP (sem duplicar 3x!)
    let sentReplies = [];
    const deadlineReply = Date.now() + 45_000;
    while (Date.now() < deadlineReply) {
      sentReplies = await electronApp.evaluate(async ({ webContents }) => {
        const guest = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && !c.isDestroyed());
        if (!guest) return [];
        return await guest.executeJavaScript('window.__sentElectronReplies || []', true);
      });
      if (sentReplies.length > 0) break;
      await win.waitForTimeout(800);
    }

    assert.equal(sentReplies.length, 1, `Esperava exatamente 1 envio no WebView Electron, obteve ${sentReplies.length}: ${JSON.stringify(sentReplies)}`);
    assert.match(sentReplies[0], /189,90|Carregador|GaN/i);

    // Garante que NÃO repetiu a frase concatenada (ex: R$ 189,90 aparecendo 3x seguidas)
    const priceMatches = sentReplies[0].match(/189,90/g) || [];
    assert.ok(priceMatches.length <= 2, `Resposta parecia duplicada no composer: ${sentReplies[0]}`);

    await win.waitForTimeout(600);
    await win.screenshot({ path: path.join(ARTIFACT_DIR, 'desktop_electron_wpp_prova.png') });
  } finally {
    await electronApp.close().catch(() => {});
    await new Promise((resolve) => httpServer.close(() => resolve()));
    await workspaceApi.close().catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
