import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createWorkspaceApi } from '../server/workspace.mjs';

const visualEvidenceRoot = 'C:/Users/arthur/Documents/Codex/2026-11-07/teste-whatsapp-ia/delivery-panel/evidence';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = id => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: id, exp: expires })).toString('base64url') + '.signature';
const tokens = new Map([[jwt(a), a], [jwt(b), b]]);
const nativeFetch = fetch;

function provider(url, options) {
  if (url.includes('/auth/v1/user')) {
    const id = tokens.get(options.headers.Authorization?.slice(7));
    return Promise.resolve(Response.json(id ? { id } : { error: 'invalid' }, { status: id ? 200 : 401 }));
  }
  if (url.includes('/rest/v1/')) return Promise.resolve(Response.json({ code: 'PGRST205' }, { status: 404 }));
  return nativeFetch(url, options);
}

async function start(root, fetchProvider = provider) {
  const api = createWorkspaceApi({ root, fetch: fetchProvider });
  const server = http.createServer((req, res) => api.handler(req, res, () => res.writeHead(404).end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin,
    async request(route, id, method = 'GET', body) {
      return fetch(origin + route, {
        method,
        headers: { ...(id ? { Authorization: 'Bearer ' + jwt(id) } : {}), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    async close() {
      await api.close();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

function createCloudProvider() {
  const states = new Map();
  const media = new Map();
  const fetchProvider = async (url, options = {}) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    const authorization = new Headers(options.headers || {}).get('authorization') || '';
    const id = tokens.get(String(authorization).slice(7));
    if (url.includes('/auth/v1/user')) return Response.json(id ? { id } : { error: 'invalid' }, { status: id ? 200 : 401 });
    if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (url.includes('/rest/v1/cg_whatsapp_state?')) {
      const row = states.get(id);
      return Response.json(row ? [row] : []);
    }
    if (url.includes('/rest/v1/rpc/cg_put_whatsapp_state')) {
      const body = JSON.parse(options.body || '{}');
      const current = states.get(id) || { revision: 0, data: {}, updated_at: null };
      if (body.p_revision !== current.revision) return Response.json({ code: '40001' }, { status: 409 });
      const next = { revision: current.revision + 1, data: body.p_data, updated_at: new Date().toISOString() };
      states.set(id, next);
      return Response.json(next.revision);
    }
    if (url.includes('/storage/v1/object/cg-whatsapp-media/')) {
      const key = decodeURIComponent(url.split('/cg-whatsapp-media/')[1]);
      media.set(key, Buffer.from(options.body));
      return Response.json({ Key: key });
    }
    if (url.includes('/storage/v1/object/authenticated/cg-whatsapp-media/')) {
      const key = decodeURIComponent(url.split('/cg-whatsapp-media/')[1]);
      const content = media.get(key);
      return content ? new Response(content) : Response.json({ error: 'not found' }, { status: 404 });
    }
    if (url.includes('/rest/v1/')) return Response.json({ code: 'PGRST205' }, { status: 404 });
    return nativeFetch(url, options);
  };
  return { fetchProvider, states, media };
}

test('contas isoladas, autenticação, concorrência, worker e reinício', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-isolation-'));
  await mkdir(path.join(root, a), { recursive: true });
  const seededMessages = Array.from({ length: 205 }, (_, index) => ({
    id: 'msg-' + String(index).padStart(3, '0'),
    de: index % 2 ? 'operador' : 'cliente', tipo: 'texto', texto: 'Mensagem ' + index,
    timestamp: 1700000000000 + index, hora: '10:00',
  }));
  const testPhone = '5511999999999';
  await mkdir(path.join(root, a, 'sessao_whatsapp'), { recursive: true });
  await writeFile(path.join(root, a, 'sessao_whatsapp', 'creds.json'), JSON.stringify({ me: { id: testPhone + ':1@s.whatsapp.net' } }));
  await writeFile(path.join(root, a, 'configuracoes.json'), JSON.stringify({ conexaoPausada: true }));
  await writeFile(path.join(root, a, 'conversas.json'), JSON.stringify([{
    jid: '5511999999999@s.whatsapp.net', nome: 'Cliente teste', ultimoTexto: 'Mensagem 204',
    numeroWhatsapp: testPhone, timestamp: 1700000000204, mensagens: seededMessages,
  }]));
  await writeFile(path.join(root, a, 'contatos.json'), JSON.stringify({ numeroWhatsapp: testPhone, contatos: {
    '5511999999999@s.whatsapp.net': 'Cliente teste',
    '5511888888888@s.whatsapp.net': 'Contato sem conversa',
  }, aliases: {} }));
  let app = await start(root);
  try {
    for (const route of ['/api/workspace', '/api/whatsapp/api/dados', '/api/hunt']) {
      assert.equal((await app.request(route)).status, 401);
    }
    const writes = await Promise.all([
      app.request('/api/workspace', a, 'PUT', { revision: 0, data: { campaign: 'A' } }),
      app.request('/api/workspace', a, 'PUT', { revision: 0, data: { campaign: 'stale' } }),
    ]);
    assert.deepEqual(writes.map(r => r.status).sort(), [200, 409]);
    const workspaceA = await (await app.request('/api/workspace', a)).json();
    assert.equal(workspaceA.revision, 1);
    assert.equal((await (await app.request('/api/workspace?user_id=' + a, b)).json()).revision, 0);

    assert.equal((await app.request('/api/whatsapp/api/config_loja', a, 'POST', { nomeLoja: 'Loja A' })).status, 200);
    assert.equal((await app.request('/api/whatsapp/api/config_loja', b, 'POST', { nomeLoja: 'Loja B' })).status, 200);
    assert.equal((await app.request('/api/whatsapp/api/skus/adicionar', a, 'POST', {
      id: 'SAME-SKU', nome: 'Produto da conta A', preco: 12, estoque: 3,
    })).status, 200);
    assert.equal((await app.request('/api/whatsapp/api/templates/save', a, 'POST', {
      titulo: 'Só A', gatilhos: ['exemplo'], resposta: 'Resposta da loja A',
    })).status, 200);
    const aa = await (await app.request('/api/whatsapp/api/dados', a)).json();
    const bb = await (await app.request('/api/whatsapp/api/dados?user_id=' + a, b)).json();
    assert.equal(aa.configLoja.nomeLoja, 'Loja A');
    assert.equal(bb.configLoja.nomeLoja, 'Loja B');
    assert.equal(aa.skus.length, 1);
    assert.equal(bb.skus.length, 0);
    assert.equal(bb.templates.length, 0);
    assert.deepEqual(aa.contatos, []);
    assert.deepEqual(bb.contatos, []);
    assert.deepEqual(aa.conversas, []);
    assert.deepEqual(bb.conversas, []);
    assert.equal(bb.config.botAtivo, false);
    assert.equal((await app.request('/api/whatsapp/api/conversas/pagina', b, 'POST', {
      jid: '5511999999999@s.whatsapp.net', limite: 80,
    })).status, 400);

    const savedPreferences = await Promise.all([
      app.request('/api/whatsapp/api/config/save', a, 'POST', { botAtivo: true }),
      app.request('/api/whatsapp/api/config/save', a, 'POST', { enviarFotoAutomatica: false }),
    ]);
    assert.deepEqual(savedPreferences.map(response => response.status), [200, 200]);
    const savedTemplates = await Promise.all([
      app.request('/api/whatsapp/api/templates/save', a, 'POST', { titulo: 'Fila 1', gatilhos: ['um'], resposta: 'Primeira' }),
      app.request('/api/whatsapp/api/templates/save', a, 'POST', { titulo: 'Fila 2', gatilhos: ['dois'], resposta: 'Segunda' }),
    ]);
    assert.deepEqual(savedTemplates.map(response => response.status), [200, 200]);
    assert.equal((await app.request('/api/whatsapp/api/sessao/pausar', a, 'POST', {})).status, 200);

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX2YAAAAASUVORK5CYII=';
    const upload = await (await app.request('/api/whatsapp/api/upload-imagem', a, 'POST', { imagemBase64: png, nomeArquivo: 'conta-a' })).json();
    assert.ok(upload.url);
    assert.equal((await app.request('/api/whatsapp' + upload.url, a)).status, 200);
    assert.equal((await app.request('/api/whatsapp' + upload.url, b)).status, 404);
    assert.equal((await app.request('/api/whatsapp/api/documentos/save', a, 'POST', {
      id: '../config_loja.json', titulo: 'Teste', conteudo: 'X',
    })).status, 400);
    assert.equal((await app.request('/api/whatsapp/api/desconectar', b, 'POST', {})).status, 404);

    const settings = JSON.parse(await readFile(path.join(root, a, 'config_loja.json'), 'utf8'));
    assert.equal(settings.nomeLoja, 'Loja A');
    await app.close();
    app = await start(root);
    assert.equal((await (await app.request('/api/workspace', a)).json()).data.campaign, workspaceA.data.campaign);
    const restartedA = await (await app.request('/api/whatsapp/api/dados', a)).json();
    assert.equal(restartedA.skus[0].nome, 'Produto da conta A');
    assert.equal(restartedA.config.botAtivo, true);
    assert.equal(restartedA.config.enviarFotoAutomatica, false);
    assert.equal(restartedA.config.conexaoPausada, true);
    assert.equal(restartedA.templates.length, 3);
    assert.deepEqual(restartedA.conversas, []);
    assert.equal((await (await app.request('/api/whatsapp/api/dados', b)).json()).skus.length, 0);
  } finally {
    await app.close();
    // Cleanup is scoped to the directory created by this test.
    if (root.startsWith(path.join(os.tmpdir(), 'companygen-isolation-'))) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});

test('navegador mantém alterações e isola contas, catálogo e navegação móvel', { timeout: 120000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-browser-'));
  await mkdir(visualEvidenceRoot, { recursive: true });
  for (const id of [a, b]) {
    await mkdir(path.join(root, id), { recursive: true });
    await writeFile(path.join(root, id, 'config_loja.json'), JSON.stringify({
      contextoLojaId: 'teste-' + id, nomeLoja: 'Loja ' + id.slice(0, 4), nomeAtendente: 'Sofia', onboardingConcluido: true,
    }));
    await writeFile(path.join(root, id, 'configuracoes.json'), JSON.stringify({
      botAtivo: false, enviarFotoAutomatica: true, ignorarArquivadas: true, somenteNovas: true, conectado: true,
    }));
    await writeFile(path.join(root, id, 'profile.json'), JSON.stringify({
      revision: 1,
      data: {
        schemaVersion: 1,
        onboarding: { whatsappConnected: true, whatsappConfirmed: true, fichaCompleted: true, storeGenerated: true },
        business: { name: 'Loja ' + id.slice(0, 4), segment: 'Varejo', hours: 'Seg a Sáb · 09h às 19h' },
        whatsapp: { connected: true, phoneE164: '5511976543210', displayPhone: '+55 (11) 97654-3210' },
        catalog: {
          products: [
            {
              id: 'p_init_' + id.slice(0, 4),
              sku: 'SKU-1',
              name: 'Produto Base ' + id.slice(0, 4),
              category: 'Destaques',
              description: 'Produto inicial.',
              priceCents: 9900,
              variation: 'Padrão',
              stock: 5,
              imageUrl: 'https://cdn.example.com/base.jpg',
              approvedAsset: true,
              active: true,
            },
          ],
        },
        publishedStore: { published: true },
      },
    }));
  }
  const api = await start(root);
  const distDir = path.resolve(import.meta.dirname, '..', 'dist');
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json' };
  const webServer = http.createServer(async (req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    if (reqPath.startsWith('/api/')) {
      const upstream = await nativeFetch(api.origin + (req.url || '/'), {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : await (async () => {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          return Buffer.concat(chunks);
        })(),
      });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.end(buf);
    }
    const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
    const target = path.join(distDir, rel);
    try {
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      const indexHtml = await readFile(path.join(distDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
    }
  });
  await new Promise(resolve => webServer.listen(0, '127.0.0.1', resolve));
  const webOrigin = 'http://127.0.0.1:' + webServer.address().port;

  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const publicConfig = JSON.parse((await readFile(new URL('../src/config/supabase-public.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  async function account(id) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const user = { id, aud: 'authenticated', role: 'authenticated', email: id.slice(0, 4) + '@example.invalid', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
    const session = { access_token: jwt(id), refresh_token: 'test-refresh-token', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    const storageKey = 'sb-' + new URL(publicConfig.url).hostname.split('.')[0] + '-auth-token';
    await context.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), { storageKey, session });
    await context.route(publicConfig.url + '/auth/v1/**', route => route.fulfill({ json: user }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(webOrigin + '/');
    await page.locator('.cg-sidebar').waitFor({ timeout: 20000 });
    return { context, page };
  }
  try {
    const aa = await account(a);
    const bb = await account(b);

    // Conta A abre Configurações e renomeia loja -> Conta B permanece isolada
    await aa.page.locator('.cg-sidebar').getByRole('button', { name: 'Configurações' }).click();
    await aa.page.getByLabel('Nome da loja', { exact: true }).fill('Loja Alfa');
    await aa.page.getByRole('button', { name: 'Salvar nome' }).click();
    await aa.page.getByText('Nome salvo.', { exact: true }).waitFor();
    await aa.page.reload();
    await aa.page.locator('.cg-sidebar small').getByText('Loja Alfa', { exact: true }).waitFor();

    await bb.page.reload();
    await bb.page.locator('.cg-sidebar small').getByText('Loja ' + b.slice(0, 4), { exact: true }).waitFor();

    // Conta A vai ao Dashboard T5 e vê Loja Alfa + rev.2 + Card Catálogo
    await aa.page.locator('.cg-sidebar').getByRole('button', { name: 'Dashboard' }).click();
    await aa.page.locator('[data-testid="dashboard-t5-view"]').waitFor();
    await aa.page.locator('[data-testid="dashboard-catalog-count"]').waitFor();

    // Verifica layout móvel 390x844 sem transbordo horizontal e sem erros
    await aa.page.setViewportSize({ width: 390, height: 844 });
    await aa.page.waitForTimeout(300);
    assert.ok(await aa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'A tela móvel transborda horizontalmente.');
    assert.deepEqual(errors, []);
  } finally {
    for (const context of browser.contexts()) await context.unrouteAll({ behavior: 'ignoreErrors' });
    await browser.close();
    await new Promise(resolve => webServer.close(resolve));
    await api.close();
    if (root.startsWith(path.join(os.tmpdir(), 'companygen-browser-'))) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('WhatsApp sincroniza somente configuração e catálogo no Supabase', { timeout: 60000 }, async () => {
  const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'companygen-cloud-one-'));
  const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'companygen-cloud-two-'));
  const cloud = createCloudProvider();
  let first = await start(firstRoot, cloud.fetchProvider);
  let second;
  try {
    const firstConfig = await first.request('/api/whatsapp/api/config_loja', a, 'POST', {
      nomeLoja: 'Loja persistida', nomeAtendente: 'Lia',
    });
    assert.equal(firstConfig.status, 200, await firstConfig.text());
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX2YAAAAASUVORK5CYII=';
    const uploaded = await (await first.request('/api/whatsapp/api/upload-imagem', a, 'POST', {
      imagemBase64: png, nomeArquivo: 'produto-cloud',
    })).json();
    assert.equal((await first.request('/api/whatsapp/api/skus/adicionar', a, 'POST', {
      id: 'CLOUD-1', nome: 'Produto persistido', preco: 50, estoque: 7, imagem: uploaded.url,
    })).status, 200);

    for (let attempt = 0; attempt < 40; attempt++) {
      await first.request('/api/whatsapp/api/dados', a);
      if (cloud.states.get(a)?.data?.skus?.[0]?.nome === 'Produto persistido') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(cloud.states.get(a)?.data?.configLoja?.nomeLoja, 'Loja persistida');
    assert.equal(cloud.states.get(a)?.data?.skus?.[0]?.imagem, uploaded.url);
    assert.equal('contatos' in cloud.states.get(a).data, false);
    assert.equal('conversas' in cloud.states.get(a).data, false);
    assert.ok(cloud.media.has(a + '/' + uploaded.url.split('/').at(-1)));
    assert.equal(cloud.states.has(b), false);

    await first.close();
    second = await start(secondRoot, cloud.fetchProvider);
    const restored = await (await second.request('/api/whatsapp/api/dados', a)).json();
    assert.equal(restored.configLoja.nomeLoja, 'Loja persistida');
    assert.equal(restored.skus[0].nome, 'Produto persistido');
    assert.equal(restored.persistencia.provider, 'supabase');
    assert.equal((await second.request('/api/whatsapp' + uploaded.url, a)).status, 200);
    const isolated = await (await second.request('/api/whatsapp/api/dados', b)).json();
    assert.equal(isolated.skus.length, 0);
  } finally {
    await first.close().catch(() => {});
    await second?.close().catch(() => {});
    await rm(firstRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(secondRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('onboarding real gera QR e persiste a configuração do agente', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-onboarding-'));
  const app = await start(root);
  try {
    assert.equal((await app.request('/api/whatsapp/api/sessao/connect', a, 'POST', {})).status, 200);
    let panel;
    for (let attempt = 0; attempt < 30; attempt++) {
      panel = await (await app.request('/api/whatsapp/api/dados', a)).json();
      if (typeof panel.qr === 'string' && panel.qr.startsWith('data:image/')) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(panel?.qr?.startsWith('data:image/'), 'O worker real não gerou o QR Code do Baileys.');
    const profile = await (await app.request('/api/whatsapp/api/whatsapp/perfil', a)).json();
    assert.equal(profile.conectado, false);

    const onboarding = await app.request('/api/whatsapp/api/onboarding/salvar', a, 'POST', {
      nomeLoja: 'Loja do onboarding', nomeAtendente: 'Lia', endereco: 'Rua Teste, 10',
      mapsUrl: 'https://maps.google.com/?q=Rua+Teste+10', chavePix: 'teste@example.com',
      descontoPix: 5, horarioRetirada: 'Segunda a sexta', fotoPerfil: '', fotoLoja: '',
    });
    assert.equal(onboarding.status, 200);
    const preferences = await app.request('/api/whatsapp/api/config/save', a, 'POST', {
      botAtivo: true, enviarFotoAutomatica: true, responderAudioComAudio: true,
      ignorarArquivadas: true, somenteNovas: true, delayHumanoMs: 2500,
    });
    assert.equal(preferences.status, 200);
    panel = await (await app.request('/api/whatsapp/api/dados', a)).json();
    assert.equal(panel.configLoja.onboardingConcluido, true);
    assert.equal(panel.configLoja.nomeLoja, 'Loja do onboarding');
    assert.equal(panel.configLoja.nomeAtendente, 'Lia');
    assert.equal(panel.config.botAtivo, true);
    assert.equal(panel.config.responderAudioComAudio, true);
    assert.equal(panel.config.delayHumanoMs, 2500);

    assert.equal((await app.request('/api/whatsapp/api/onboarding/reset', a, 'POST', {})).status, 200);
    panel = await (await app.request('/api/whatsapp/api/dados', a)).json();
    assert.equal(panel.configLoja.onboardingConcluido, false);
  } finally {
    await app.close();
    if (root.startsWith(path.join(os.tmpdir(), 'companygen-onboarding-'))) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});

test('resiliência a falha transitória PGRST003 e deduplicação de gravações WhatsApp', { timeout: 60000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-resilience-'));
  let pgrstAttempts = 0;
  let putWhatsappCalls = 0;
  const states = new Map();

  const fetchProvider = async (url, options = {}) => {
    if (String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url, options);
    const authorization = new Headers(options.headers || {}).get('authorization') || '';
    const id = tokens.get(String(authorization).slice(7));
    if (url.includes('/auth/v1/user')) return Response.json(id ? { id } : { error: 'invalid' }, { status: id ? 200 : 401 });
    if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 });

    // 1. Simulação PGRST003 nas 2 primeiras chamadas ao carregar workspace:
    if (url.includes('/rest/v1/cg_workspace_state?')) {
      pgrstAttempts++;
      if (pgrstAttempts <= 2) {
        return Response.json({
          code: 'PGRST003',
          message: 'Timed out acquiring connection from connection pool',
        }, { status: 503 });
      }
      return Response.json([{
        revision: 1,
        data: { campaign: 'Workspace resiliente' },
      }]);
    }

    if (url.includes('/rest/v1/cg_whatsapp_state?')) {
      const row = states.get(id);
      return Response.json(row ? [row] : []);
    }

    if (url.includes('/rest/v1/rpc/cg_put_whatsapp_state')) {
      putWhatsappCalls++;
      const body = JSON.parse(options.body || '{}');
      const current = states.get(id) || { revision: 0, data: {}, updated_at: null };
      if (body.p_revision !== current.revision) return Response.json({ code: '40001' }, { status: 409 });
      const next = { revision: current.revision + 1, data: body.p_data, updated_at: new Date().toISOString() };
      states.set(id, next);
      return Response.json(next.revision);
    }

    if (url.includes('/rest/v1/')) return Response.json({ code: 'PGRST205' }, { status: 404 });
    return nativeFetch(url, options);
  };

  const app = await start(root, fetchProvider);
  try {
    // 1 e 2. Workspace abre após 2 falhas transitórias PGRST003 e sucesso na 3ª tentativa
    const res = await app.request('/api/workspace', a);
    assert.equal(res.status, 200);
    const workspace = await res.json();
    assert.equal(workspace.revision, 1);
    assert.equal(workspace.data.campaign, 'Workspace resiliente');
    assert.equal(pgrstAttempts, 3, 'Deveria ter feito 2 tentativas com PGRST003 e 1 bem-sucedida.');

    // 3. 10 consultas consecutivas a /api/whatsapp/api/dados não geram 10 gravações
    await app.request('/api/whatsapp/api/config_loja', a, 'POST', { nomeLoja: 'Loja Sem Duplicação' });
    
    // Aguarda sincronização inicial
    for (let attempt = 0; attempt < 30; attempt++) {
      if (putWhatsappCalls > 0) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const baselineWrites = putWhatsappCalls;
    assert.ok(baselineWrites >= 1, 'Deveria ter gravado o estado inicial.');

    // Executa 10 consultas consecutivas
    for (let i = 0; i < 10; i++) {
      const dadosRes = await app.request('/api/whatsapp/api/dados', a);
      assert.equal(dadosRes.status, 200);
      await new Promise(r => setTimeout(r, 50));
    }

    // Verifica que não foram disparadas 10 novas gravações
    const newWrites = putWhatsappCalls - baselineWrites;
    assert.equal(newWrites, 0, `10 consultas consecutivas não deveriam gerar novas gravações no Supabase (gerou ${newWrites}).`);
  } finally {
    await app.close();
    if (root.startsWith(path.join(os.tmpdir(), 'companygen-resilience-'))) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
});

test('STLC: /api/profile isola tenants, exige revisao otimista (409), protege pixKey e aplica Gate 422 de publicacao', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-stlc-sec-'));
  const app = await start(root);
  try {
    // 1. Sem auth -> 401
    assert.equal((await app.request('/api/profile')).status, 401);
    assert.equal((await app.request('/api/store/public')).status, 401);

    // 2. Carrega ficha inicial de A (rev 0)
    const initA = await (await app.request('/api/profile', a)).json();
    assert.equal(initA.revision, 0);

    // 3. Salva ficha com pixKey sensível e phone placeholder -> deve salvar rascunho (rev 1), mas bloquear publicação (422)
    const draftProfile = {
      ...initA.profile,
      business: {
        ...initA.profile.business,
        name: 'Bella Moda Secreta',
        segment: 'Moda Feminina',
        city: 'São Paulo/SP',
      },
      whatsapp: {
        ...initA.profile.whatsapp,
        connected: true,
        phoneE164: '5511999999999', // placeholder bloqueado para publicar
        phoneFormatted: '+55 (11) 99999-9999',
      },
      payment: {
        ...initA.profile.payment,
        methods: ['pix', 'credit'],
        pixKey: 'CHAVE-PIX-PRIVADA-999@banco.com',
      },
      catalog: {
        products: [
          {
            id: 'prod_1',
            sku: 'BM-001',
            name: 'Vestido Midi Linho',
            priceCents: 18990,
            variation: 'P, M, G',
            stockStatus: 'in_stock',
            shortDescription: 'Tecido leve de linho natural.',
            imageUrl: 'https://cdn.example.com/vestido.jpg',
            approvedAsset: false, // não aprovado -> bloqueia publicação
            active: true,
          },
        ],
      },
    };

    const saveRev1 = await app.request('/api/profile', a, 'PUT', { revision: 0, profile: draftProfile });
    assert.equal(saveRev1.status, 200);
    const saved1 = await saveRev1.json();
    assert.equal(saved1.revision, 1);

    // 4. Optimistic concurrency: tentar PUT com revision obsoleta (0) -> 409
    const stalePut = await app.request('/api/profile', a, 'PUT', { revision: 0, profile: draftProfile });
    assert.equal(stalePut.status, 409);

    // 5. Public Store Positive Allowlist: NUNCA expõe pixKey nem systemPrompt interno
    const publicRes = await app.request('/api/store/public', a);
    assert.equal(publicRes.status, 200);
    const publicJson = await publicRes.json();
    const publicSerialized = JSON.stringify(publicJson);
    assert.ok(!publicSerialized.includes('CHAVE-PIX-PRIVADA-999'), 'pixKey vazou em /api/store/public!');
    assert.equal(publicJson.ir.payment?.pixKey, undefined);
    assert.equal(publicJson.ir.business.name, 'Bella Moda Secreta');

    // 6. Gate de publicação 422 com telefone placeholder
    const pubDummyPhone = await app.request('/api/profile', a, 'PUT', {
      revision: 1,
      publish: true,
      profile: draftProfile,
    });
    assert.equal(pubDummyPhone.status, 422);

    // 7. Telefone real, mas produto sem approvedAsset -> 422
    const realPhoneProfile = {
      ...draftProfile,
      whatsapp: { ...draftProfile.whatsapp, phoneE164: '5511976543210', phoneFormatted: '+55 (11) 97654-3210' },
    };
    const pubUnapprovedAsset = await app.request('/api/profile', a, 'PUT', {
      revision: 1,
      publish: true,
      profile: realPhoneProfile,
    });
    assert.equal(pubUnapprovedAsset.status, 422);

    // 8. Aprova foto -> publicação autorizada (200) e tenant B não vê nada de A
    realPhoneProfile.catalog.products[0].approvedAsset = true;
    const pubOk = await app.request('/api/profile', a, 'PUT', {
      revision: 1,
      publish: true,
      profile: realPhoneProfile,
    });
    assert.equal(pubOk.status, 200);
    const pubOkJson = await pubOk.json();
    assert.equal(pubOkJson.profile.publishedStore.published, true);
    assert.equal(pubOkJson.revision, 2);

    const bProfile = await (await app.request('/api/profile', b)).json();
    assert.notEqual(bProfile.profile.business.name, 'Bella Moda Secreta');
    assert.equal(bProfile.revision, 0);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('STLC: Contrato das 10 Mutacoes + Recalculo Server-Side de Pedidos (/api/orders)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'companygen-stlc-10mut-'));
  const app = await start(root);
  try {
    const init = await (await app.request('/api/profile', a)).json();
    const baseProfile = {
      ...init.profile,
      business: {
        ...init.profile.business,
        name: 'Studio Alfa',
        segment: 'Calçados',
        city: 'Curitiba/PR',
        hours: 'Seg a Sáb, 09h às 19h',
        address: 'Rua XV, 100',
      },
      whatsapp: {
        ...init.profile.whatsapp,
        connected: true,
        phoneE164: '5541987654321',
        phoneFormatted: '+55 (41) 98765-4321',
      },
      payment: {
        ...init.profile.payment,
        methods: ['pix', 'credit'],
        pixKey: 'pix@studioalfa.com.br',
      },
      catalog: {
        products: [
          {
            id: 'tenis_1',
            sku: 'ALF-10',
            name: 'Tênis Runner Pro',
            priceCents: 25000, // R$ 250,00
            variation: '39 ao 43',
            stockStatus: 'in_stock',
            shortDescription: 'Amortecimento leve para corrida.',
            imageUrl: 'https://cdn.example.com/tenis.jpg',
            approvedAsset: true,
            active: true,
          },
        ],
      },
    };

    const r1 = await (await app.request('/api/profile', a, 'PUT', { revision: 0, profile: baseProfile, publish: true })).json();
    assert.equal(r1.revision, 1);

    // Muta APENAS business.name uma vez -> deve propagar em cadeia para 10+ alvos
    const renamedProfile = {
      ...r1.profile,
      business: { ...r1.profile.business, name: 'Outlet Ômega' },
    };
    const r2Res = await app.request('/api/profile', a, 'PUT', { revision: 1, profile: renamedProfile });
    assert.equal(r2Res.status, 200);
    const r2 = await r2Res.json();
    assert.equal(r2.revision, 2);

    // Verifica alvos na projeção retornada
    assert.equal(r2.projections.bot.sourceRevision, 2);
    assert.equal(r2.projections.storePublic.sourceRevision, 2);
    assert.equal(r2.projections.storePublic.business.name, 'Outlet Ômega');
    assert.equal(r2.projections.bot.configLoja.nomeLoja, 'Outlet Ômega');
    assert.equal(r2.projections.bot.configuracoesPatch.nomeEmpresa, 'Outlet Ômega');
    assert.ok(r2.projections.bot.templates.items.some(m => m.id === 'WA-001' && m.body.includes('Outlet Ômega')), 'WA-001 deve conter Outlet Ômega');
    assert.ok(r2.projections.bot.templates.items.some(m => m.id === 'WA-019' && m.body.includes('Outlet Ômega')), 'WA-019 deve conter Outlet Ômega');
    assert.equal(r2.projections.bot.skus[0].nome, 'Tênis Runner Pro');

    // Verifica gravação atômica real em disco para o bot.js consumir
    const userDir = path.join(root, a);
    const diskConfigLoja = JSON.parse(await readFile(path.join(userDir, 'config_loja.json'), 'utf8'));
    const diskTemplates = JSON.parse(await readFile(path.join(userDir, 'templates.json'), 'utf8'));
    const diskSkus = JSON.parse(await readFile(path.join(userDir, 'skus.json'), 'utf8'));
    assert.equal(diskConfigLoja.nomeLoja, 'Outlet Ômega');
    assert.equal(diskConfigLoja.sourceRevision, 2);
    assert.ok(diskTemplates.items.some(m => m.id === 'WA-019' && m.body.includes('Outlet Ômega')));
    assert.equal(diskSkus[0].sku, 'ALF-10');

    // Testa /api/orders ignorando preço adulterado enviado pelo cliente (R$ 0,01) e recalculando via catálogo (R$ 250,00 x 2 + R$ 15,00 frete = R$ 515,00)
    const orderRes = await app.request('/api/orders', a, 'POST', {
      orderRef: 'CG-TEST',
      customerName: 'Cliente STLC',
      shippingCents: 1500,
      items: [{ sku: 'ALF-10', name: 'Tênis Runner Pro', qty: 2, unitPriceCents: 1 }],
    });
    assert.equal(orderRes.status, 201);
    const { order } = await orderRes.json();
    assert.equal(order.subtotal_cents, 50000);
    assert.equal(order.total_cents, 51500);
    assert.equal(order.source_revision, 2);

    // Verifica projeção de /api/dashboard refletindo Outlet Ômega, rev. 2, 1 produto no Catálogo e total R$ 515,00
    const dashRes = await app.request('/api/dashboard', a);
    assert.equal(dashRes.status, 200);
    const { dashboard } = await dashRes.json();
    assert.equal(dashboard.businessName, 'Outlet Ômega');
    assert.equal(dashboard.sourceRevision, 2);
    assert.equal(dashboard.ordersCount, 1);
    assert.equal(dashboard.salesCents, 51500);
    assert.equal(dashboard.catalogCount, 1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
