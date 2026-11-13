import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { execFile, fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import {
  normalizeProfile,
  diffProfile,
  buildBotProjections,
  buildPublicStoreProjection,
  buildDashboardProjection,
  recalculateOrderTotals,
  isValidProductionPhone,
  computeDigest,
} from './sync-engine.mjs';

const execFileAsync = promisify(execFile);
const app = fileURLToPath(new URL('../', import.meta.url));
const cloud = JSON.parse((await readFile(path.join(app, 'src/config/supabase-public.json'), 'utf8')).replace(/^\uFEFF/, ''));
const routes = new Map([
  ['/api/dados', 'GET'],
  ['/api/whatsapp/perfil', 'GET'],
  ['/api/conversas/pagina', 'POST'],
  ['/api/sessao/connect', 'POST'],
  ['/api/sessao/pausar', 'POST'],
  ['/api/sessao/reset', 'POST'],
  ['/api/onboarding/salvar', 'POST'],
  ['/api/onboarding/reset', 'POST'],
  ['/api/config/save', 'POST'],
  ['/api/config_loja', 'POST'],
  ['/api/chat/new', 'POST'],
  ['/api/chat/send', 'POST'],
  ['/api/chat/modo-atendimento', 'POST'],
  ['/api/fluxo/simular', 'POST'],
  ['/api/skus/adicionar', 'POST'],
  ['/api/skus/sync', 'POST'],
  ['/api/skus/remover', 'POST'],
  ['/api/catalogo/foto', 'POST'],
  ['/api/templates/save', 'POST'],
  ['/api/documentos/save', 'POST'],
  ['/api/documentos/delete', 'POST'],
  ['/api/upload-imagem', 'POST'],
  ['/api/importar-imagem', 'POST'],
]);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req, max = 24 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      throw new ApiError(413, 'Arquivo ou solicitação grande demais.');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ApiError(400, 'Dados inválidos.');
  }
}

function privateFile(name) {
  return /^[\w-]+\.(png|jpe?g|webp|gif|ogg|opus|mp3|wav)$/i.test(name);
}

export function createWorkspaceApi(options = {}) {
  const url = (process.env.CG_SUPABASE_URL || process.env.VITE_SUPABASE_URL || cloud.url).replace(/\/$/, '');
  const key = process.env.CG_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || cloud.publishableKey;
  const root = path.resolve(options.root || process.env.CG_DATA_DIR || path.join(os.homedir(), '.companygen', 'workspaces'));
  const bot = path.resolve(options.bot || process.env.CG_WHATSAPP_BOT || path.join(
    os.homedir(), 'Documents', 'Codex', '2026-11-07', 'teste-whatsapp-ia', 'bot.js'
  ));
  const request = options.fetch || fetch;
  const workers = new Map();
  const writes = new Map();
  const sessions = new Map();
  const whatsappCloud = new Map();
  const recentOrderDedupe = new Map();
  let activeSearches = 0;

  async function cloudFetch(route, token, init) {
    const method = (init?.method || 'GET').toUpperCase();
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(url + route, {
          ...init, signal: AbortSignal.timeout(8000), redirect: 'error',
          headers: { apikey: key, Authorization: 'Bearer ' + token, ...init?.headers },
        });
        if (attempt === 2 || response.ok) return response;
        const payload = await response.clone().json().catch(() => null);
        const connectionBusy = payload?.code === 'PGRST003';
        const safeReadRetry = method === 'GET' && [429, 500, 502, 503, 504].includes(response.status);
        if (!connectionBusy && !safeReadRetry) return response;
      } catch (error) {
        lastError = error;
        if (method !== 'GET' || attempt === 2) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 200 * (2 ** attempt)));
    }
    throw lastError || new Error('Supabase indisponível.');
  }

  function stateDigest(data) {
    return createHash('sha256').update(JSON.stringify(data || {})).digest('hex');
  }

  async function identify(req) {
    const bearer = /^Bearer ([\w.-]{20,8192})$/i.exec(req.headers.authorization || '')?.[1];
    if (!bearer) throw new ApiError(401, 'Entre na sua conta.');
    const digest = createHash('sha256').update(bearer).digest('hex');
    const now = Date.now();
    for (const [id, session] of sessions) if (session.until <= now) sessions.delete(id);
    const cached = sessions.get(digest);
    if (cached) return { id: cached.id, bearer };
    const res = await cloudFetch('/auth/v1/user', bearer).catch(() => null);
    if (!res || res.status >= 500 || res.status === 429) throw new ApiError(503, 'Validação da conta indisponível.');
    if (!res.ok) throw new ApiError(401, 'Sessão expirada. Entre de novo.');
    const { id } = await res.json();
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(401, 'Conta inválida.');
    }
    const exp = JSON.parse(Buffer.from(bearer.split('.')[1] || '', 'base64url').toString('utf8')).exp;
    if (typeof exp !== 'number' || exp * 1000 <= now) throw new ApiError(401, 'Sessão expirada.');
    if (sessions.size < 500) sessions.set(digest, { id, until: Math.min(exp * 1000, now + 15000) });
    return { id, bearer };
  }

  function queue(id, job) {
    const promise = (writes.get(id) || Promise.resolve()).catch(() => {}).then(job);
    writes.set(id, promise);
    return promise.finally(() => {
      if (writes.get(id) === promise) writes.delete(id);
    });
  }

  async function localState(directory) {
    try {
      return JSON.parse(await readFile(path.join(directory, 'studio.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { revision: 0, data: {} };
      throw error;
    }
  }

  async function atomicWriteJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temp = filePath + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
      await rename(temp, filePath);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  async function readJsonFile(filePath, fallback) {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async function cloudProfile(id, bearer) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_business_profile?select=revision,data,updated_at&user_id=eq.' + id, bearer);
    const payload = await res.json();
    if (res.status === 404 && ['PGRST205', '42P01'].includes(payload?.code)) return null;
    if (!res.ok) throw new ApiError(503, 'Não foi possível carregar a ficha no Supabase.');
    return payload[0] || { revision: 0, data: {}, updated_at: null };
  }

  async function cloudSaveProfile(bearer, revision, data) {
    const result = await cloudFetch('/rest/v1/rpc/cg_put_business_profile', bearer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_revision: revision, p_data: data }),
    });
    const value = await result.json();
    if (value?.code === '40001') throw new ApiError(409, 'A ficha foi atualizada em outra aba.');
    if (!result.ok || !Number.isSafeInteger(value)) throw new ApiError(503, 'Não foi possível salvar a ficha no Supabase.');
    return value;
  }

  async function cloudOrders(id, bearer) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_orders?select=*&user_id=eq.' + id + '&order=created_at.desc&limit=100', bearer);
    const payload = await res.json();
    if (res.status === 404 && ['PGRST205', '42P01'].includes(payload?.code)) return null;
    if (!res.ok) return null;
    return Array.isArray(payload) ? payload : [];
  }

  async function cloudUpsertOrder(bearer, order) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_orders?on_conflict=user_id,order_ref', bearer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        order_ref: order.order_ref,
        customer_jid: order.customer_jid || '',
        customer_name: order.customer_name || '',
        items: order.items || [],
        subtotal_cents: order.subtotal_cents || 0,
        shipping_cents: order.shipping_cents || 0,
        total_cents: order.total_cents || 0,
        payment_method: order.payment_method || 'pendente',
        delivery_address: order.delivery_address || {},
        status: order.status || 'aguardando_dados',
        source_revision: order.source_revision || 0,
      }),
    });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    return Array.isArray(payload) ? payload[0] : payload;
  }

  async function cloudMetrics(id, bearer) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_store_metrics?select=visits_total,visits_by_day&user_id=eq.' + id, bearer);
    const payload = await res.json();
    if (res.status === 404 && ['PGRST205', '42P01'].includes(payload?.code)) return null;
    if (!res.ok) return null;
    return payload[0] || { visits_total: 0, visits_by_day: {} };
  }

  async function writeBotProjectionFiles(directory, projections) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await atomicWriteJson(path.join(directory, 'config_loja.json'), projections.configLoja);
    await atomicWriteJson(path.join(directory, 'skus.json'), projections.skus);
    await atomicWriteJson(path.join(directory, 'templates.json'), projections.templates);
    const currentConfig = await readJsonFile(path.join(directory, 'configuracoes.json'), {});
    const mergedConfig = {
      ...currentConfig,
      ...projections.configuracoesPatch,
    };
    await atomicWriteJson(path.join(directory, 'configuracoes.json'), mergedConfig);
  }

  async function notifyWorkerProfile(userId, projections) {
    const workerPromise = workers.get(userId);
    if (!workerPromise) return false;
    try {
      const worker = await workerPromise;
      if (worker?.child && !worker.child.killed && worker.child.connected) {
        worker.child.send({ type: 'profile:updated', projections });
        return true;
      }
    } catch {}
    return false;
  }

  async function cloudState(id, bearer) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_workspace_state?select=revision,data&user_id=eq.' + id, bearer);
    const payload = await res.json();
    if (res.status === 404 && ['PGRST205', '42P01'].includes(payload.code)) return null;
    if (!res.ok) throw new ApiError(503, 'Não foi possível carregar o workspace no Supabase.');
    return payload[0] || { revision: 0, data: {} };
  }

  async function cloudSave(bearer, revision, data) {
    const result = await cloudFetch('/rest/v1/rpc/cg_put_workspace', bearer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_revision: revision, p_data: data }),
    });
    const value = await result.json();
    if (value?.code === '40001') throw new ApiError(409, 'O workspace foi atualizado em outra aba.');
    if (!result.ok || !Number.isSafeInteger(value)) throw new ApiError(503, 'Não foi possível salvar no Supabase.');
    return value;
  }

  function catalogOnlyWhatsappState(data) {
    const source = data && typeof data === 'object' ? data : {};
    return {
      schemaVersion: 1,
      config: source.config && typeof source.config === 'object' ? source.config : {},
      configLoja: source.configLoja && typeof source.configLoja === 'object' ? source.configLoja : {},
      skus: Array.isArray(source.skus) ? source.skus : [],
      templates: Array.isArray(source.templates) || Array.isArray(source.templates?.items) ? source.templates : [],
      documentos: Array.isArray(source.documentos) ? source.documentos : [],
    };
  }

  async function cloudWhatsappState(id, bearer) {
    if (process.env.CG_PERSISTENCE === 'local') return null;
    const res = await cloudFetch('/rest/v1/cg_whatsapp_state?select=revision,data,updated_at&user_id=eq.' + id, bearer);
    const payload = await res.json();
    if (res.status === 404 && ['PGRST205', '42P01'].includes(payload.code)) return null;
    if (!res.ok) throw new ApiError(503, 'Não foi possível carregar o WhatsApp no Supabase.');
    const row = payload[0];
    return row ? { ...row, data: catalogOnlyWhatsappState(row.data) } : { revision: 0, data: catalogOnlyWhatsappState({}), updated_at: null };
  }

  async function cloudSaveWhatsapp(bearer, revision, data) {
    const result = await cloudFetch('/rest/v1/rpc/cg_put_whatsapp_state', bearer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_revision: revision, p_data: data }),
    });
    const value = await result.json();
    if (value?.code === '40001') throw new ApiError(409, 'O WhatsApp foi atualizado em outro servidor.');
    if (!result.ok || !Number.isSafeInteger(value)) throw new ApiError(503, 'Não foi possível salvar o WhatsApp no Supabase.');
    return value;
  }

  function mediaNames(data) {
    const found = new Set();
    const text = JSON.stringify(data || {});
    for (const match of text.matchAll(/\/media\/([\w-]+\.(?:png|jpe?g|webp|gif|ogg|opus|mp3|wav))/gi)) found.add(match[1]);
    return [...found];
  }

  function mediaType(name) {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.wav') return 'audio/wav';
    return 'audio/ogg';
  }

  async function uploadWhatsappMedia(id, bearer, directory, data, uploaded) {
    const mediaDir = path.join(directory, 'media');
    for (const name of mediaNames(data)) {
      if (uploaded.has(name)) continue;
      let content;
      try { content = await readFile(path.join(mediaDir, name)); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const response = await cloudFetch('/storage/v1/object/cg-whatsapp-media/' + id + '/' + encodeURIComponent(name), bearer, {
        method: 'POST',
        headers: { 'Content-Type': mediaType(name), 'x-upsert': 'true' },
        body: content,
      });
      if (!response.ok) throw new ApiError(503, 'Não foi possível salvar uma mídia do WhatsApp no Supabase.');
      uploaded.add(name);
    }
  }

  async function downloadWhatsappMedia(id, bearer, directory, data) {
    const mediaDir = path.join(directory, 'media');
    await mkdir(mediaDir, { recursive: true, mode: 0o700 });
    for (const name of mediaNames(data)) {
      const destination = path.join(mediaDir, name);
      try { await stat(destination); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const response = await cloudFetch('/storage/v1/object/authenticated/cg-whatsapp-media/' + id + '/' + encodeURIComponent(name), bearer);
      if (!response.ok) continue;
      const content = Buffer.from(await response.arrayBuffer());
      if (content.length <= 15 * 1024 * 1024) await writeFile(destination, content, { mode: 0o600 });
    }
  }

  async function writeWhatsappSnapshot(directory, snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const entries = [
      ['configuracoes.json', snapshot.config],
      ['config_loja.json', snapshot.configLoja],
      ['skus.json', snapshot.skus],
      ['templates.json', snapshot.templates],
    ];
    for (const [name, value] of entries) {
      if (value === undefined) continue;
      const temp = path.join(directory, randomUUID() + '.tmp');
      await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
      await rename(temp, path.join(directory, name));
    }
    const docs = path.join(directory, 'contexto', 'documentos');
    await mkdir(docs, { recursive: true, mode: 0o700 });
    for (const document of Array.isArray(snapshot.documentos) ? snapshot.documentos : []) {
      if (/^[\w-]{1,100}\.(txt|md)$/.test(document?.id || '') && typeof document.conteudo === 'string') {
        await writeFile(path.join(docs, document.id), document.conteudo, { mode: 0o600 });
      }
    }
  }

  async function hydrateWhatsapp(user, directory) {
    const remote = await cloudWhatsappState(user.id, user.bearer);
    if (!remote) {
      whatsappCloud.set(user.id, { available: false, revision: 0, uploaded: new Set(), lastSync: 0, error: 'Migração pendente.' });
      return;
    }
    const markerFile = path.join(directory, 'supabase-whatsapp.json');
    let marker = { revision: 0 };
    try { marker = JSON.parse(await readFile(markerFile, 'utf8')); } catch {}
    let localExists = true;
    try { await stat(path.join(directory, 'configuracoes.json')); } catch { localExists = false; }
    if (remote.revision > 0 && (!localExists || remote.revision > (marker.revision || 0))) {
      await writeWhatsappSnapshot(directory, remote.data);
      await downloadWhatsappMedia(user.id, user.bearer, directory, remote.data);
      await writeFile(markerFile, JSON.stringify({ revision: remote.revision, syncedAt: remote.updated_at }), { mode: 0o600 });
    }
    whatsappCloud.set(user.id, {
      available: true, revision: remote.revision, uploaded: new Set(mediaNames(remote.data)),
      lastSync: 0, syncedAt: remote.updated_at, error: '',
      lastDigest: remote.revision > 0 ? stateDigest(remote.data) : '',
    });
  }

  async function storage(req, res, user, directory) {
    if (!['GET', 'PUT'].includes(req.method)) throw new ApiError(405, 'Método indisponível.');
    const body = req.method === 'PUT' ? await readJson(req) : null;
    await queue(user.id, async () => {
      const remote = await cloudState(user.id, user.bearer);
      const provider = remote ? 'supabase' : 'servidor';
      let current = remote || await localState(directory);

      if (req.method === 'GET') {
        if (remote?.revision === 0) {
          const local = await localState(directory);
          if (local.revision > 0) {
            try {
              current = { data: local.data, revision: await cloudSave(user.bearer, 0, local.data) };
            } catch (error) {
              if (error.status !== 409) throw error;
              current = await cloudState(user.id, user.bearer);
            }
          }
        }
        send(res, 200, { ...current, provider });
        return;
      }

      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
          !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
        throw new ApiError(400, 'Dados de workspace inválidos.');
      }
      if (body.revision !== current.revision) throw new ApiError(409, 'O workspace foi atualizado em outra aba.');
      const next = { revision: current.revision + 1, data: body.data };
      if (remote) {
        next.revision = await cloudSave(user.bearer, current.revision, body.data);
      } else {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temp = path.join(directory, randomUUID() + '.tmp');
        try {
          await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
          await rename(temp, path.join(directory, 'studio.json'));
        } finally {
          await rm(temp, { force: true });
        }
      }
      send(res, 200, { revision: next.revision, provider });
    });
  }

  async function acquireWorkerLock(file, lease) {
    try {
      await writeFile(file, JSON.stringify({ pid: process.pid, lease }), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let old;
      try { old = JSON.parse(await readFile(file, 'utf8')); } catch {
        throw new ApiError(409, 'A conexão está sendo iniciada por outra instância.');
      }
      if (!Number.isInteger(old.pid)) throw new ApiError(409, 'Confira a conexão em uso no servidor.');
      try {
        process.kill(old.pid, 0);
        throw new ApiError(409, 'Esta conta já está aberta em outra instância do serviço.');
      } catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
      }
      await rm(file);
      await writeFile(file, JSON.stringify({ pid: process.pid, lease }), { flag: 'wx', mode: 0o600 });
    }
  }

  async function releaseWorkerLock(file, lease) {
    try {
      const current = JSON.parse(await readFile(file, 'utf8'));
      if (current.lease === lease) await rm(file);
    } catch {}
  }

  async function startWorker(user, directory) {
    const id = user.id;
    if (workers.has(id)) return workers.get(id);
    if (workers.size >= 16) throw new ApiError(503, 'Limite de conexões simultâneas do servidor.');
    const worker = (async () => {
      await stat(bot).catch(() => { throw new ApiError(503, 'O serviço WhatsApp precisa ser configurado neste servidor.'); });
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await hydrateWhatsapp(user, directory);
      const lock = path.join(directory, 'worker.lock');
      const lease = randomUUID();
      await acquireWorkerLock(lock, lease);
      const secret = randomUUID() + randomUUID();
      const child = fork(bot, [], {
        cwd: directory, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([name]) =>
            /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|LOCALAPPDATA|APPDATA|WHATSAPP_HUNT_PYTHON)$/i.test(name))),
          COMPANYGEN_WORKER_TOKEN: secret,
        },
      });
      const closed = new Promise(resolve => {
        const finish = () => {
          workers.delete(id);
          void releaseWorkerLock(lock, lease).finally(resolve);
        };
        child.once('exit', finish);
        child.once('error', finish);
      });
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill();
          reject(new ApiError(503, 'WhatsApp demorou para iniciar.'));
        }, 15000);
        const fail = () => {
          clearTimeout(timer);
          reject(new ApiError(503, 'WhatsApp indisponível.'));
        };
        child.once('error', fail);
        child.once('exit', fail);
        child.on('message', msg => {
          if (!Number.isInteger(msg?.port) || msg.port < 1 || msg.port > 65535) return;
          clearTimeout(timer);
          child.off('exit', fail);
          resolve(msg.port);
        });
      });
      return { child, port, secret, closed };
    })();
    workers.set(id, worker);
    worker.catch(() => { if (workers.get(id) === worker) workers.delete(id); });
    return worker;
  }

  async function exportWhatsapp(worker) {
    const response = await request('http://127.0.0.1:' + worker.port + '/api/estado/exportar', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'X-CompanyGen-Worker': worker.secret },
    });
    if (!response.ok) throw new ApiError(503, 'Não foi possível preparar a sincronização do WhatsApp.');
    return response.json();
  }

  async function syncWhatsapp(user, directory, worker, force = false) {
    const state = whatsappCloud.get(user.id);
    if (!state?.available) return state;
    if (!force && Date.now() - state.lastSync < 5000) return state;
    if (state.syncing) {
      if (force) state.dirty = true;
      return state.syncing;
    }
    state.syncing = (async () => {
      try {
        const snapshot = catalogOnlyWhatsappState(await exportWhatsapp(worker));
        const digest = stateDigest(snapshot);
        if (digest === state.lastDigest) {
          state.lastSync = Date.now();
          state.error = '';
          return state;
        }
        await uploadWhatsappMedia(user.id, user.bearer, directory, snapshot, state.uploaded);
        state.revision = await cloudSaveWhatsapp(user.bearer, state.revision, snapshot);
        state.lastDigest = digest;
        state.lastSync = Date.now();
        state.syncedAt = new Date().toISOString();
        state.error = '';
        await writeFile(path.join(directory, 'supabase-whatsapp.json'), JSON.stringify({
          revision: state.revision, syncedAt: state.syncedAt,
        }), { mode: 0o600 });
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Falha na sincronização.';
        if (error.status === 409) {
          const remote = await cloudWhatsappState(user.id, user.bearer).catch(() => null);
          if (remote) state.revision = remote.revision;
        }
      } finally {
        state.syncing = null;
        if (state.dirty) {
          state.dirty = false;
          queueMicrotask(() => { void syncWhatsapp(user, directory, worker, true); });
        }
      }
      return state;
    })();
    return state.syncing;
  }

  async function loadProfileState(user, directory) {
    const remote = await cloudProfile(user.id, user.bearer);
    const provider = remote ? 'supabase' : 'servidor';
    let current = remote || await readJsonFile(path.join(directory, 'profile.json'), { revision: 0, data: {} });
    if (remote?.revision === 0) {
      const local = await readJsonFile(path.join(directory, 'profile.json'), { revision: 0, data: {} });
      if (local.revision > 0) {
        try {
          const rev = await cloudSaveProfile(user.bearer, 0, local.data);
          current = { revision: rev, data: local.data };
        } catch (error) {
          if (error.status !== 409) throw error;
          current = await cloudProfile(user.id, user.bearer);
        }
      }
    }
    return { current: current || { revision: 0, data: {} }, remote, provider };
  }

  async function syncLocalOrders(user, directory) {
    const localOrders = await readJsonFile(path.join(directory, 'orders.json'), []);
    const remoteOrders = await cloudOrders(user.id, user.bearer);
    const byRef = new Map();
    if (Array.isArray(remoteOrders)) {
      for (const ord of remoteOrders) {
        if (ord?.order_ref) byRef.set(ord.order_ref, ord);
      }
    }
    if (Array.isArray(localOrders)) {
      for (const ord of localOrders) {
        if (!ord?.order_ref) continue;
        const existing = byRef.get(ord.order_ref);
        if (!existing || new Date(ord.updated_at || 0).getTime() > new Date(existing.updated_at || 0).getTime()) {
          byRef.set(ord.order_ref, ord);
          if (remoteOrders !== null) await cloudUpsertOrder(user.bearer, ord).catch(() => null);
        }
      }
    }
    return [...byRef.values()].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }

  async function profileHandler(req, res, user, directory) {
    if (!['GET', 'PUT'].includes(req.method)) throw new ApiError(405, 'Método indisponível.');
    const body = req.method === 'PUT' ? await readJson(req) : null;
    await queue(user.id + ':profile', async () => {
      const { current, remote, provider } = await loadProfileState(user, directory);
      const currentProfile = normalizeProfile(current.data);
      if (req.method === 'GET') {
        const bot = buildBotProjections(currentProfile, current.revision);
        const storePublic = buildPublicStoreProjection(currentProfile, current.revision);
        return send(res, 200, {
          revision: current.revision,
          provider,
          profile: currentProfile,
          projections: { bot, storePublic },
        });
      }

      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
          !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
        throw new ApiError(400, 'Dados da ficha inválidos.');
      }
      if (body.revision !== current.revision) throw new ApiError(409, 'A ficha foi atualizada em outra aba.');

      const nextProfile = normalizeProfile(body.profile);
      const wantsPublish = Boolean(body.publish) || (!currentProfile.publishedStore.published && nextProfile.publishedStore.published);
      if (wantsPublish) {
        if (!isValidProductionPhone(nextProfile.whatsapp.phoneE164)) {
          throw new ApiError(422, 'Conecte um número de WhatsApp real e confirmado (não placeholder) antes de publicar a loja.');
        }
        const activeProducts = nextProfile.catalog.products.filter(p => p.active);
        if (activeProducts.length === 0) {
          throw new ApiError(422, 'Cadastre pelo menos 1 produto ativo antes de publicar a loja.');
        }
        const missingAsset = activeProducts.find(p => !p.imageUrl || !p.approvedAsset);
        if (missingAsset) {
          throw new ApiError(422, `Aprove a foto do produto "${missingAsset.name}" antes de publicar a loja.`);
        }
        nextProfile.publishedStore = {
          ...nextProfile.publishedStore,
          published: true,
          publishedAt: new Date().toISOString(),
          publicSlug: nextProfile.publishedStore.publicSlug ||
            (nextProfile.business.name || 'loja').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
            'minha-loja',
          sourceRevision: current.revision + 1,
        };
      }

      const prevDigest = computeDigest(currentProfile);
      const nextDigest = computeDigest(nextProfile);
      const diff = diffProfile(currentProfile, nextProfile);

      let nextRevision = current.revision;
      if (prevDigest !== nextDigest || current.revision === 0) {
        if (remote) {
          nextRevision = await cloudSaveProfile(user.bearer, current.revision, nextProfile);
        } else {
          nextRevision = current.revision + 1;
        }
        await atomicWriteJson(path.join(directory, 'profile.json'), { revision: nextRevision, data: nextProfile });
      }

      const bot = buildBotProjections(nextProfile, nextRevision);
      const storePublic = buildPublicStoreProjection(nextProfile, nextRevision);
      await writeBotProjectionFiles(directory, bot);
      await notifyWorkerProfile(user.id, bot);

      send(res, 200, {
        revision: nextRevision,
        provider,
        profile: nextProfile,
        diff,
        projections: { bot, storePublic },
      });
    });
  }

  async function storePublicHandler(req, res, user, directory) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const { current } = await loadProfileState(user, directory);
    const ir = buildPublicStoreProjection(current.data, current.revision);
    send(res, 200, { revision: current.revision, ir });
  }

  async function storeVisitHandler(req, res, user, directory) {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    await queue(user.id + ':metrics', async () => {
      const day = new Date().toISOString().slice(0, 10);
      const metricsFile = path.join(directory, 'store_metrics.json');
      const local = await readJsonFile(metricsFile, { visits_total: 0, visits_by_day: {} });
      const nextLocal = {
        visits_total: (Number(local.visits_total) || 0) + 1,
        visits_by_day: {
          ...(local.visits_by_day || {}),
          [day]: (Number(local.visits_by_day?.[day]) || 0) + 1,
        },
      };
      await atomicWriteJson(metricsFile, nextLocal);
      if (process.env.CG_PERSISTENCE !== 'local') {
        const remoteRes = await cloudFetch('/rest/v1/rpc/cg_increment_store_visit', user.bearer, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_day: day }),
        }).catch(() => null);
        if (remoteRes?.ok) {
          const remoteMetrics = await remoteRes.json().catch(() => null);
          if (remoteMetrics) {
            await atomicWriteJson(metricsFile, remoteMetrics);
            return send(res, 200, { metrics: remoteMetrics });
          }
        }
      }
      send(res, 200, { metrics: nextLocal });
    });
  }

  function buildManualOrderComputation(body, catalogProducts) {
    const products = Array.isArray(catalogProducts) ? catalogProducts : [];
    const byId = new Map();
    const bySku = new Map();
    const byName = new Map();
    for (const prod of products) {
      if (prod?.id) byId.set(String(prod.id).trim(), prod);
      if (prod?.sku) bySku.set(String(prod.sku).trim().toUpperCase(), prod);
      if (prod?.name) byName.set(String(prod.name).trim().toLowerCase(), prod);
    }

    const resolveProduct = (candidate) => {
      const idKey = String(candidate?.productId || '').trim();
      const skuKey = String(candidate?.sku || '').trim().toUpperCase();
      const nameKey = String(candidate?.name || candidate?.customItemName || '').trim().toLowerCase();
      return (idKey && byId.get(idKey)) || (skuKey && bySku.get(skuKey)) || (nameKey && byName.get(nameKey)) || null;
    };

    const items = [];
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length > 0) {
      for (const raw of rawItems) {
        const matched = resolveProduct(raw);
        const quantity = Math.max(1, Math.min(999, Math.round(Number(raw?.quantity || raw?.qty || 1))));
        let unitPriceCents = 0;
        let lineTotalCents = 0;
        if (raw?.overrideTotalCents !== undefined && raw?.overrideTotalCents !== null && Number.isFinite(Number(raw.overrideTotalCents))) {
          lineTotalCents = Math.max(0, Math.round(Number(raw.overrideTotalCents)));
          unitPriceCents = Math.round(lineTotalCents / quantity);
        } else if (raw?.unitPriceCents !== undefined && raw?.unitPriceCents !== null && Number.isFinite(Number(raw.unitPriceCents))) {
          unitPriceCents = Math.max(0, Math.round(Number(raw.unitPriceCents)));
          lineTotalCents = unitPriceCents * quantity;
        } else if (matched) {
          unitPriceCents = Math.max(0, Math.round(Number(matched.priceCents) || 0));
          lineTotalCents = unitPriceCents * quantity;
        }
        items.push({
          sku: matched?.sku || String(raw?.sku || 'AVULSO').trim().toUpperCase() || 'AVULSO',
          name: matched?.name || String(raw?.customItemName || raw?.name || 'Venda avulsa').trim() || 'Venda avulsa',
          variation: matched?.variation || String(raw?.variation || 'Balcão').trim() || 'Balcão',
          quantity,
          unitPriceCents,
          lineTotalCents,
        });
      }
    } else {
      const matched = resolveProduct(body);
      const explicitTotal = Number(body.overrideTotalCents ?? body.totalCents);
      const lineTotalCents = Number.isFinite(explicitTotal)
        ? Math.max(0, Math.round(explicitTotal))
        : Math.max(0, Math.round(Number(matched?.priceCents) || 0));
      items.push({
        sku: matched?.sku || String(body.sku || 'AVULSO').trim().toUpperCase() || 'AVULSO',
        name: matched?.name || String(body.customItemName || 'Venda manual').trim() || 'Venda manual',
        variation: matched?.variation || 'Balcão',
        quantity: 1,
        unitPriceCents: lineTotalCents,
        lineTotalCents,
      });
    }

    const rawSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const discountCents = Math.max(0, Math.round(Number(body.discountCents) || 0));
    const deliveryCents = Math.max(0, Math.round(Number(body.deliveryCents ?? body.shippingCents) || 0));
    const subtotalCents = Math.max(0, rawSubtotal - discountCents);
    const totalCents = subtotalCents + deliveryCents;
    return { items, subtotalCents, shippingCents: deliveryCents, totalCents };
  }

  async function ordersHandler(req, res, user, directory) {
    const allowedStatuses = new Set(['aguardando_dados', 'aguardando_pagamento', 'confirmado', 'cancelado', 'concluido']);
    if (req.method === 'GET') {
      const orders = await syncLocalOrders(user, directory);
      return send(res, 200, { orders });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      return await queue(user.id + ':orders', async () => {
        const isManual = body?.manual === true;
        const nowMs = Date.now();
        for (const [k, entry] of recentOrderDedupe.entries()) {
          if (entry.expiresAt <= nowMs) recentOrderDedupe.delete(k);
        }

        const dedupePhone = String(body.customerPhone || body.customerJid || body.customerName || '').trim().toLowerCase();
        const dedupeSignature = createHash('sha256')
          .update(JSON.stringify({
            userId: user.id,
            manual: isManual,
            orderRef: body.orderRef || '',
            customer: dedupePhone,
            items: body.items || [],
            productId: body.productId || '',
            customItemName: body.customItemName || '',
            totalCents: body.totalCents ?? null,
          }))
          .digest('hex');
        const cachedDup = recentOrderDedupe.get(dedupeSignature);
        if (cachedDup && cachedDup.expiresAt > nowMs) {
          return send(res, 200, { order: cachedDup.order, deduplicated: true, unmatchedItems: [] });
        }

        const { current } = await loadProfileState(user, directory);
        const profile = normalizeProfile(current.data);

        let verifiedItems = [];
        let unmatchedItems = [];
        let subtotalCents = 0;
        let shippingCents = 0;
        let totalCents = 0;
        let initialStatus = 'aguardando_dados';

        if (isManual) {
          const customerName = String(body.customerName || '').trim();
          if (!customerName) {
            throw new ApiError(400, 'Informe o nome do cliente para registrar a venda.');
          }
          const manualCalc = buildManualOrderComputation(body, profile.catalog.products);
          if (manualCalc.totalCents <= 0) {
            throw new ApiError(400, 'O valor da venda precisa ser maior que zero.');
          }
          verifiedItems = manualCalc.items;
          subtotalCents = manualCalc.subtotalCents;
          shippingCents = manualCalc.shippingCents;
          totalCents = manualCalc.totalCents;
          if (body.status && allowedStatuses.has(body.status)) {
            initialStatus = body.status;
          } else {
            initialStatus = body.markAsPaid === false ? 'aguardando_pagamento' : 'confirmado';
          }
        } else {
          const calc = recalculateOrderTotals(body.items || [], profile.catalog.products, Number(body.shippingCents) || 0);
          if (calc.verifiedItems.length === 0) {
            throw new ApiError(400, 'Nenhum produto válido do catálogo encontrado no pedido.');
          }
          verifiedItems = calc.verifiedItems;
          unmatchedItems = calc.unmatchedItems;
          subtotalCents = calc.subtotalCents;
          shippingCents = calc.shippingCents;
          totalCents = calc.totalCents;
        }

        const now = new Date().toISOString();
        const order = {
          id: randomUUID(),
          order_ref: String(body.orderRef || ((isManual ? 'PED-' : 'CG-') + randomUUID().slice(0, 4).toUpperCase())),
          customer_jid: String(body.customerJid || body.customerPhone || ''),
          customer_name: String(body.customerName || 'Cliente').trim() || 'Cliente',
          items: verifiedItems,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          payment_method: String(body.paymentMethod || 'pendente'),
          delivery_address: body.deliveryAddress && typeof body.deliveryAddress === 'object' ? body.deliveryAddress : {},
          status: initialStatus,
          source_revision: current.revision,
          created_at: now,
          updated_at: now,
        };
        const localOrders = await readJsonFile(path.join(directory, 'orders.json'), []);
        const filtered = localOrders.filter(o => o.order_ref !== order.order_ref);
        await atomicWriteJson(path.join(directory, 'orders.json'), [order, ...filtered]);
        await cloudUpsertOrder(user.bearer, order);
        recentOrderDedupe.set(dedupeSignature, { expiresAt: nowMs + 10000, order });
        return send(res, 201, { order, unmatchedItems });
      });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const orderRef = String(body.orderRef || '').trim();
      if (!orderRef) throw new ApiError(400, 'orderRef obrigatório.');
      if (body.status !== undefined && !allowedStatuses.has(body.status)) {
        throw new ApiError(400, 'Status de pedido inválido.');
      }
      return await queue(user.id + ':orders', async () => {
        const localOrders = await readJsonFile(path.join(directory, 'orders.json'), []);
        const target = localOrders.find(o => o.order_ref === orderRef || o.id === orderRef);
        if (!target) throw new ApiError(404, 'Pedido não encontrado.');
        if (body.status && allowedStatuses.has(body.status)) target.status = body.status;
        if (typeof body.paymentMethod === 'string' && body.paymentMethod.trim()) target.payment_method = body.paymentMethod.trim();
        if (body.deliveryAddress && typeof body.deliveryAddress === 'object') target.delivery_address = body.deliveryAddress;
        target.updated_at = new Date().toISOString();
        await atomicWriteJson(path.join(directory, 'orders.json'), localOrders);
        await cloudUpsertOrder(user.bearer, target);
        return send(res, 200, { order: target });
      });
    }
    throw new ApiError(405, 'Método indisponível.');
  }

  async function dashboardHandler(req, res, user, directory) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const parsedUrl = new URL(req.url || '/api/dashboard', 'http://localhost');
    const rawDays = parsedUrl.searchParams.get('days');
    const days = rawDays === 'all' || rawDays === 'todos'
      ? 'all'
      : Number.isFinite(Number(rawDays)) && Number(rawDays) > 0
        ? Number(rawDays)
        : 7;

    const { current } = await loadProfileState(user, directory);
    const orders = await syncLocalOrders(user, directory);
    const localMetrics = await readJsonFile(path.join(directory, 'store_metrics.json'), { visits_total: 0, visits_by_day: {} });
    const remoteMetrics = await cloudMetrics(user.id, user.bearer);
    const metrics = (remoteMetrics && Number(remoteMetrics.visits_total) >= Number(localMetrics.visits_total)) ? remoteMetrics : localMetrics;
    const conversas = await readJsonFile(path.join(directory, 'conversas.json'), []);
    const config = await readJsonFile(path.join(directory, 'configuracoes.json'), {});
    const dashboard = buildDashboardProjection(current.data, current.revision, orders, metrics, {
      conversas,
      conectado: Boolean(config?.conectado),
    }, { days });
    send(res, 200, { dashboard });
  }

  async function whatsapp(req, res, user, directory, pathname) {
    const target = pathname.slice('/api/whatsapp'.length);
    const media = target.startsWith('/media/') && privateFile(target.slice('/media/'.length));
    const allowedMethod = media ? 'GET' : routes.get(target);
    if (!allowedMethod) throw new ApiError(404, 'Rota indisponível.');
    if (req.method !== allowedMethod) throw new ApiError(405, 'Método indisponível.');
    const body = req.method === 'POST' ? await readJson(req, 15 * 1024 * 1024) : undefined;
    if (target === '/api/chat/send' && body.imagemUrl && !/^\/media\/[\w.-]+$/.test(body.imagemUrl)) {
      throw new ApiError(400, 'Anexe a imagem antes de enviar.');
    }
    const worker = await startWorker(user, directory);
    const { port, secret } = worker;
    const upstream = await request('http://127.0.0.1:' + port + target, {
      method: req.method, redirect: 'error', signal: AbortSignal.timeout(45000),
      headers: { 'X-CompanyGen-Worker': secret, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    if (target === '/api/dados' && upstream.ok) {
      const data = await upstream.json();
      const cloudState = whatsappCloud.get(user.id);
      void syncWhatsapp(user, directory, worker);
      return send(res, 200, {
        ...data,
        persistencia: {
          provider: cloudState?.available ? 'supabase' : 'servidor',
          syncedAt: cloudState?.syncedAt || null,
          error: cloudState?.error || null,
        },
      });
    }
    res.writeHead(upstream.status, {
      'Content-Type': type, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', ...(media ? { 'Content-Security-Policy': "default-src 'none'" } : {}),
    });
    if (upstream.body) await pipeline(upstream.body, res);
    else res.end();
    if (req.method === 'POST' && upstream.ok) void syncWhatsapp(user, directory, worker, true);
  }

  async function hunt(req, res) {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const { query, count, mediaType = 'image' } = await readJson(req, 8192);
    if (typeof query !== 'string' || !query.trim() || query.length > 300 ||
        !['image', 'video', 'all'].includes(mediaType)) throw new ApiError(400, 'Busca inválida.');
    if (activeSearches >= 4) throw new ApiError(429, 'Busca ocupada. Tente novamente em instantes.');
    activeSearches++;
    try {
      const { stdout } = await execFileAsync(process.env.CG_HUNT_PYTHON || 'python', [
        path.join(app, 'scripts', 'hunt-product-assets.py'), '--query=' + query.trim(),
        '--count', String(Math.min(20, Math.max(1, Number.parseInt(count, 10) || 5))), '--media-type', mediaType,
      ], { timeout: 35000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      const items = JSON.parse(stdout);
      if (!Array.isArray(items)) throw new Error('Invalid result');
      send(res, 200, { success: true, items });
    } catch {
      throw new ApiError(502, 'O pesquisador de imagens está indisponível.');
    } finally {
      activeSearches--;
    }
  }

  async function analyzeInstagram(req, res, user, directory) {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const { handle } = await readJson(req, 4096);
    const cleaned = String(handle || '').trim();
    if (!cleaned || cleaned.length > 120) throw new ApiError(400, 'Informe um @usuario válido do Instagram.');
    const logoDir = path.join(directory, 'brand-logos');
    await mkdir(logoDir, { recursive: true });
    try {
      const { stdout } = await execFileAsync(process.env.CG_HUNT_PYTHON || 'python', [
        path.join(app, 'scripts', 'analyze-instagram.py'),
        '--handle', cleaned,
        '--output-dir', logoDir,
      ], { timeout: 30000, maxBuffer: 512 * 1024, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      const parsed = JSON.parse(stdout || '{}');
      const photoFile = String(parsed.photoFile || '');
      const safeFile = /^[A-Za-z0-9._-]+_logo\.(jpg|png|webp|gif)$/i.test(photoFile) ? photoFile : '';
      const logoUrl = safeFile ? `/api/brand-logo/${encodeURIComponent(user.id)}/${encodeURIComponent(safeFile)}?v=${Date.now()}` : '';
      return send(res, 200, {
        ok: Boolean(parsed.ok),
        handle: parsed.handle || cleaned,
        fullName: String(parsed.fullName || ''),
        bio: String(parsed.bio || ''),
        category: String(parsed.category || ''),
        logoUrl,
        source: String(parsed.source || ''),
        error: parsed.error ? String(parsed.error) : '',
      });
    } catch {
      throw new ApiError(502, 'Não foi possível analisar este perfil do Instagram no momento.');
    }
  }

  async function serveBrandLogo(req, res, pathname) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const match = /^\/api\/brand-logo\/([A-Za-z0-9_-]{4,80})\/([A-Za-z0-9._-]+_logo\.(jpg|png|webp|gif))$/i.exec(pathname);
    if (!match) throw new ApiError(404, 'Logo não encontrada.');
    const [, uid, filename, ext] = match;
    const baseDir = path.resolve(root, uid, 'brand-logos');
    const filePath = path.resolve(baseDir, filename);
    if (!filePath.startsWith(baseDir + path.sep)) throw new ApiError(403, 'Acesso negado.');
    try {
      const bytes = await readFile(filePath);
      const mimeMap = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
      res.writeHead(200, {
        'Content-Type': mimeMap[ext.toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(bytes);
    } catch {
      throw new ApiError(404, 'Logo não encontrada.');
    }
  }

  async function handler(req, res, next) {
    const pathname = req.url?.split('?')[0] || '';
    if (pathname.startsWith('/api/brand-logo/')) {
      try {
        return await serveBrandLogo(req, res, pathname);
      } catch (error) {
        if (!res.headersSent) send(res, error.status || 404, { ok: false, error: error.message || 'Logo não encontrada.' });
        return;
      }
    }
    const owned = [
      '/api/workspace',
      '/api/profile',
      '/api/store/public',
      '/api/store/visit',
      '/api/orders',
      '/api/dashboard',
      '/api/hunt',
      '/api/instagram/analyze',
      '/api/images/status',
      '/api/images/acquire',
    ].includes(pathname) || pathname.startsWith('/api/whatsapp/');
    if (!owned) return next();
    try {
      const user = await identify(req);
      const directory = path.join(root, user.id);
      if (pathname === '/api/workspace') return await storage(req, res, user, directory);
      if (pathname === '/api/profile') return await profileHandler(req, res, user, directory);
      if (pathname === '/api/store/public') return await storePublicHandler(req, res, user, directory);
      if (pathname === '/api/store/visit') return await storeVisitHandler(req, res, user, directory);
      if (pathname === '/api/orders') return await ordersHandler(req, res, user, directory);
      if (pathname === '/api/dashboard') return await dashboardHandler(req, res, user, directory);
      if (pathname === '/api/hunt') return await hunt(req, res);
      if (pathname === '/api/instagram/analyze') return await analyzeInstagram(req, res, user, directory);
      if (pathname === '/api/images/status') {
        return send(res, 200, { available: true, provider: 'ddgs', pexels_key_configured: false });
      }
      if (pathname === '/api/images/acquire') throw new ApiError(410, 'Use a busca de imagens do workspace.');
      return await whatsapp(req, res, user, directory, pathname);
    } catch (error) {
      console.error('[CompanyGen API]', req.method, pathname, error instanceof Error ? error.message : error);
      if (!res.headersSent) send(res, error.status || 503, { ok: false, error: error.status ? error.message : 'Serviço indisponível. Tente novamente.' });
      else if (!res.writableEnded) res.destroy();
    }
  }

  return {
    handler,
    async close() {
      await Promise.allSettled([...workers.values()].map(async promise => {
        const { child, closed } = await promise;
        child.kill();
        await closed;
      }));
    },
  };
}
