import crypto from 'node:crypto';

export const DEFAULT_OLLAMA_ENDPOINT =
  process.env.CG_OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';

export const MODEL_PREFERENCE_ORDER = [
  'qwen3:4b-instruct',
  'qwen3.5:4b',
  'qwen3.5:2b',
  'qwen3:1.7b',
  'gemma3:1b',
  'qwen2.5:0.5b',
];

export const WHATSAPP_FAST_MODELS = [
  'qwen3:1.7b',
  'gemma3:1b',
  'qwen2.5:0.5b',
];

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;
const CPU_FALLBACK_COOLDOWN_MS = 10 * 60 * 1000;

/** @type {Map<string, { expiresAt: number; payload: any }>} */
const synthesisCache = new Map();

let preferCpuUntil = 0;

export function shouldPreferOllamaCpu() {
  return process.env.CG_OLLAMA_CPU_ONLY === '1' || Date.now() < preferCpuUntil;
}

export function markOllamaPreferCpu(ttlMs = CPU_FALLBACK_COOLDOWN_MS) {
  preferCpuUntil = Date.now() + Math.max(1000, ttlMs);
}

let activeLocalJobs = 0;
/** @type {Array<() => void>} */
const waitQueue = [];

/**
 * Local GPU concurrency semaphore (concurrency = 1 by default) to prevent
 * multiple simultaneous Ollama inference calls from thrashing VRAM / CPU.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export async function withLocalAiSemaphore(task) {
  if (activeLocalJobs >= 1) {
    await new Promise(resolve => waitQueue.push(resolve));
  }
  activeLocalJobs += 1;
  try {
    return await task();
  } finally {
    activeLocalJobs = Math.max(0, activeLocalJobs - 1);
    const next = waitQueue.shift();
    if (next) next();
  }
}

export function buildSynthesisCacheKey(parts) {
  const canonical = JSON.stringify(parts);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function getCachedSynthesis(cacheKey) {
  const entry = synthesisCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    synthesisCache.delete(cacheKey);
    return null;
  }
  return entry.payload;
}

export function setCachedSynthesis(cacheKey, payload, ttlMs = CACHE_TTL_MS) {
  if (synthesisCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = synthesisCache.keys().next().value;
    if (oldestKey) synthesisCache.delete(oldestKey);
  }
  synthesisCache.set(cacheKey, {
    expiresAt: Date.now() + Math.max(1000, ttlMs),
    payload,
  });
}

export function clearAiBudgetCache() {
  synthesisCache.clear();
  preferCpuUntil = 0;
}

export function choosePreferredOllamaModel(installedModels = [], requestedModel = '') {
  const list = Array.isArray(installedModels)
    ? installedModels.map(m => String(m || '').trim()).filter(Boolean)
    : [];

  if (requestedModel && list.includes(requestedModel)) {
    return requestedModel;
  }

  for (const preferred of MODEL_PREFERENCE_ORDER) {
    if (list.includes(preferred)) {
      return preferred;
    }
  }

  const nonEmbed = list.find(m => !m.toLowerCase().includes('embed'));
  return nonEmbed || requestedModel || MODEL_PREFERENCE_ORDER[0];
}

export async function fetchAvailableOllamaModels(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  timeoutMs = 1500
) {
  const cleanEndpoint = String(endpoint || DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, '');
  try {
    const response = await fetch(`${cleanEndpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        available: false,
        endpoint: cleanEndpoint,
        models: [],
        preferredModel: null,
      };
    }
    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models
          .map(entry => String(entry?.name || entry?.model || '').trim())
          .filter(Boolean)
      : [];
    const preferredModel = choosePreferredOllamaModel(models);
    return {
      available: models.length > 0,
      endpoint: cleanEndpoint,
      models,
      preferredModel: models.length > 0 ? preferredModel : null,
    };
  } catch {
    return {
      available: false,
      endpoint: cleanEndpoint,
      models: [],
      preferredModel: null,
    };
  }
}

export function logAiTelemetry({
  requestId,
  user,
  archetypeId,
  modelUsed,
  usedFallback,
  cacheHit = false,
  durationMs,
  status = 'ok',
  reason,
}) {
  const payload = {
    scope: 'ai-art-director',
    requestId,
    user: user ? `${String(user).slice(0, 6)}...` : 'anon',
    archetypeId,
    modelUsed,
    usedFallback: Boolean(usedFallback),
    cacheHit: Boolean(cacheHit),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    status,
    ...(reason ? { reason: String(reason).slice(0, 120) } : {}),
    ts: new Date().toISOString(),
  };
  if (process.env.CG_SILENT_AI_LOG !== '1') {
    console.info(JSON.stringify(payload));
  }
  return payload;
}

export async function warmOllamaModels(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  models = ['nomic-embed-text:latest', 'qwen3:1.7b'],
) {
  const cleanEndpoint = String(endpoint || DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, '');
  for (const model of models) {
    try {
      const isEmbed = String(model).toLowerCase().includes('embed');
      await fetch(`${cleanEndpoint}/api/${isEmbed ? 'embed' : 'generate'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEmbed
            ? { model, input: 'warmup', keep_alive: '10m' }
            : { model, prompt: 'ok', stream: false, think: false, keep_alive: '10m', options: { num_predict: 1 } },
        ),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // Melhor esforço: não bloqueia boot se Ollama estiver ocupado ou offline
    }
  }
}
