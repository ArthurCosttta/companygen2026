/**
 * Transcrição segura de áudio (Whisper/STT) & Sugestão visual para anexos WhatsApp (C62 / BUG-F05-05)
 * Nunca inventa texto quando áudio é >4MB, >60s, corrompido ou STT indisponível.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 60;
export const DEFAULT_STT_TIMEOUT_MS = 8000;
export const AUDIO_FALLBACK_MESSAGE =
  'Não consegui ouvir seu áudio agora, pode mandar rapidinho por texto?';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_WHISPER_SCRIPT = path.resolve(SCRIPT_DIR, '..', 'scripts', 'transcribe_audio.py');
let localServerProcess = null;
let localServerStartingPromise = null;
let localServerUnsupported = false;

function readDotEnvSttKeys() {
  const keys = {};
  try {
    const localEnvPath = path.resolve(process.cwd(), '.env');
    const repoEnvPath = path.resolve(SCRIPT_DIR, '..', '.env');
    const envPath = existsSync(localEnvPath) ? localEnvPath : repoEnvPath;
    if (!existsSync(envPath)) return keys;
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      keys[k] = v;
    }
  } catch {}
  return keys;
}

function getPythonCandidates() {
  const explicit = String(process.env.PYTHON_BIN || '').trim();
  const base = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  return explicit ? [explicit, ...base.filter((c) => c !== explicit)] : base;
}

function runPythonWhisperOnce({ tmpPath, timeoutMs = 15000 }) {
  const candidates = getPythonCandidates();
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= candidates.length) {
        resolve({ ok: false, reason: 'python_not_found' });
        return;
      }
      const bin = candidates[idx++];
      const args = bin === 'py'
        ? ['-3', LOCAL_WHISPER_SCRIPT, tmpPath, '--json', '--language', 'pt']
        : [LOCAL_WHISPER_SCRIPT, tmpPath, '--json', '--language', 'pt'];
      let stdout = '';
      let stderr = '';
      let settled = false;
      let child;
      try {
        child = spawn(bin, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        tryNext();
        return;
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch {}
        resolve({ ok: false, reason: 'stt_timeout' });
      }, Math.min(25000, Math.max(4000, Number(timeoutMs) || 15000)));

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (err?.code === 'ENOENT') {
          tryNext();
        } else {
          resolve({ ok: false, reason: 'python_spawn_error' });
        }
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (code !== 0) {
          resolve({ ok: false, reason: `python_exit_${code}`, stderr: stderr.slice(0, 200) });
          return;
        }
        const lines = stdout.trim().split(/\r?\n/).reverse();
        for (const line of lines) {
          const clean = line.trim();
          if (!clean.startsWith('{')) continue;
          try {
            const parsed = JSON.parse(clean);
            const text = String(parsed?.text || '').replace(/\s+/g, ' ').trim();
            if (text) {
              resolve({ ok: true, transcript: text });
              return;
            }
          } catch {}
        }
        resolve({ ok: false, reason: 'empty_transcript' });
      });
    };
    tryNext();
  });
}

let activeLocalSttBaseUrl = '';

async function isOurWhisperHealth(fetchImpl, baseUrl) {
  try {
    const ping = await fetchImpl(`${baseUrl}/health`, { signal: AbortSignal.timeout(450) });
    if (!ping.ok) return false;
    const body = await ping.json().catch(() => null);
    return Boolean(body && body.ok === true && (body.service === 'companygen_stt' || typeof body.model === 'string'));
  } catch {
    return false;
  }
}

async function ensureLocalWhisperServer(fetchImpl) {
  if (!existsSync(LOCAL_WHISPER_SCRIPT)) return '';
  if (activeLocalSttBaseUrl && (await isOurWhisperHealth(fetchImpl, activeLocalSttBaseUrl))) {
    return `${activeLocalSttBaseUrl}/v1/audio/transcriptions`;
  }

  const preferredPort = Number(process.env.LOCAL_STT_PORT || 8785);
  const candidatePorts = [...new Set([preferredPort, 8785, 8786, 8787])];
  for (const p of candidatePorts) {
    if (await isOurWhisperHealth(fetchImpl, `http://127.0.0.1:${p}`)) {
      activeLocalSttBaseUrl = `http://127.0.0.1:${p}`;
      return `${activeLocalSttBaseUrl}/v1/audio/transcriptions`;
    }
  }

  if (localServerUnsupported) return '';
  if (localServerStartingPromise) return localServerStartingPromise;

  localServerStartingPromise = (async () => {
    for (const port of candidatePorts) {
      const baseUrl = `http://127.0.0.1:${port}`;
      for (const bin of getPythonCandidates()) {
        const args = bin === 'py'
          ? ['-3', LOCAL_WHISPER_SCRIPT, '--serve', '--host', '127.0.0.1', '--port', String(port)]
          : [LOCAL_WHISPER_SCRIPT, '--serve', '--host', '127.0.0.1', '--port', String(port)];
        let exitedEarly = false;
        try {
          localServerProcess = spawn(bin, args, {
            windowsHide: true,
            stdio: 'ignore',
            detached: false,
          });
          localServerProcess.unref?.();
          localServerProcess.on('exit', () => {
            exitedEarly = true;
            localServerProcess = null;
          });
          localServerProcess.on('error', () => {
            exitedEarly = true;
            localServerProcess = null;
          });
        } catch {
          continue;
        }

        const deadline = Date.now() + 25000;
        while (Date.now() < deadline && !exitedEarly) {
          await new Promise((r) => setTimeout(r, 350));
          if (await isOurWhisperHealth(fetchImpl, baseUrl)) {
            activeLocalSttBaseUrl = baseUrl;
            return `${baseUrl}/v1/audio/transcriptions`;
          }
        }
        if (exitedEarly) break;
      }
    }
    return '';
  })().finally(() => {
    localServerStartingPromise = null;
  });

  return localServerStartingPromise;
}

export async function describeWhatsappImage({
  imageBase64 = '',
  question = '',
  timeoutMs = 45000,
  fetchImpl = fetch,
} = {}) {
  const rawImg = String(imageBase64 || '').trim();
  if (!rawImg || !existsSync(LOCAL_WHISPER_SCRIPT)) {
    return { ok: false, reason: 'vision_local_unavailable', description: '' };
  }
  const cleanB64 = rawImg.replace(/^data:image\/[^;]+;base64,/i, '').trim();
  const buf = Buffer.from(cleanB64, 'base64');
  if (!buf || buf.length < 32) {
    return { ok: false, reason: 'empty_image', description: '' };
  }
  const sttEndpoint = await ensureLocalWhisperServer(fetchImpl);
  if (!sttEndpoint) {
    return { ok: false, reason: 'local_vision_server_down', description: '' };
  }
  const visionUrl = sttEndpoint.replace(/\/v1\/audio\/transcriptions$/i, '/v1/vision/describe');
  try {
    const formData = new FormData();
    formData.append('file', new Blob([buf], { type: 'image/jpeg' }), 'whatsapp_photo.jpg');
    if (question) formData.append('question', String(question).slice(0, 120));
    const res = await fetchImpl(visionUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(Math.max(10000, Number(timeoutMs) || 28000)),
    });
    if (!res.ok) return { ok: false, reason: `local_vision_${res.status}`, description: '' };
    const payload = await res.json().catch(() => null);
    const description = String(payload?.description || '').replace(/\s+/g, ' ').trim();
    if (!description) return { ok: false, reason: 'empty_caption', description: '' };
    return { ok: true, description, model: String(payload?.model || 'blip-local') };
  } catch (err) {
    return { ok: false, reason: err?.message || 'local_vision_failed', description: '' };
  }
}

async function transcribeWithLocalPython({ buf, ext, mimeType, timeoutMs, fetchImpl }) {
  if (!existsSync(LOCAL_WHISPER_SCRIPT)) {
    return { ok: false, reason: 'stt_not_configured' };
  }

  const localEndpoint = await ensureLocalWhisperServer(fetchImpl);
  if (localEndpoint) {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([buf], { type: mimeType }), `whatsapp_voice.${ext}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');
      const res = await fetchImpl(localEndpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(Math.min(18000, Math.max(4000, Number(timeoutMs) || 12000))),
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const text = String(payload?.text || '').replace(/\s+/g, ' ').trim();
        if (text) return { ok: true, transcript: text, provider: 'local_python_server' };
      }
    } catch {}
  }

  const tmpPath = path.join(os.tmpdir(), `cg-wa-stt-${randomUUID()}.${ext}`);
  try {
    await writeFile(tmpPath, buf);
    const cliRes = await runPythonWhisperOnce({ tmpPath, timeoutMs });
    if (cliRes.ok && cliRes.transcript) {
      return { ok: true, transcript: cliRes.transcript, provider: 'local_python_cli' };
    }
    return { ok: false, reason: cliRes.reason || 'stt_not_configured' };
  } finally {
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}

/**
 * Checks magic bytes for common WhatsApp/browser audio formats (.ogg/.opus, .mp3, .wav, .m4a/.mp4/.webm).
 */
export function detectAudioMagicFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return { ext: 'ogg', mime: 'audio/ogg' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return { ext: 'wav', mime: 'audio/wav' };
  }
  if (
    (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) ||
    (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return { ext: 'mp3', mime: 'audio/mpeg' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: 'webm', mime: 'audio/webm' };
  }
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') {
    return { ext: 'm4a', mime: 'audio/mp4' };
  }
  return null;
}

export async function transcribeWhatsappAudio({
  audioBase64 = '',
  audioBuffer = null,
  mimeType = 'audio/ogg',
  durationSeconds = 0,
  sttEndpointUrl = process.env.WHISPER_ENDPOINT_URL || '',
  sttApiKey = process.env.WHISPER_API_KEY || '',
  timeoutMs = DEFAULT_STT_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  let buf = Buffer.isBuffer(audioBuffer) ? audioBuffer : null;
  if (!buf && typeof audioBase64 === 'string' && audioBase64.trim()) {
    const cleanB64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/i, '').trim();
    buf = Buffer.from(cleanB64, 'base64');
  }

  if (!buf || buf.length < 16) {
    return {
      ok: false,
      reason: 'empty_or_corrupt_audio',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
    };
  }

  if (buf.length > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      reason: 'audio_too_large',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
      sizeBytes: buf.length,
    };
  }

  const dur = Number(durationSeconds || 0);
  if (Number.isFinite(dur) && dur > MAX_AUDIO_DURATION_SECONDS) {
    return {
      ok: false,
      reason: 'audio_too_long',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
      durationSeconds: dur,
    };
  }

  const magic = detectAudioMagicFormat(buf);
  if (!magic) {
    return {
      ok: false,
      reason: 'unsupported_audio_magic',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
    };
  }

  let cleanEndpoint = String(sttEndpointUrl || '').trim();
  let effectiveApiKey = String(sttApiKey || '').trim();
  let sttModel = 'whisper-1';

  if (!cleanEndpoint) {
    const envKeys = fetchImpl === fetch ? readDotEnvSttKeys() : {};
    const envWhisperUrl = String(process.env.WHISPER_ENDPOINT_URL || envKeys.WHISPER_ENDPOINT_URL || '').trim();
    const groqKey = String(process.env.GROQ_API_KEY || envKeys.GROQ_API_KEY || '').trim();
    const openaiKey = String(process.env.OPENAI_API_KEY || envKeys.OPENAI_API_KEY || '').trim();
    if (envWhisperUrl) {
      cleanEndpoint = envWhisperUrl;
      effectiveApiKey = effectiveApiKey || String(process.env.WHISPER_API_KEY || envKeys.WHISPER_API_KEY || '').trim();
    } else if (groqKey) {
      cleanEndpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
      effectiveApiKey = groqKey;
      sttModel = 'whisper-large-v3-turbo';
    } else if (openaiKey) {
      cleanEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
      effectiveApiKey = openaiKey;
      sttModel = 'whisper-1';
    }
  }

  if (!cleanEndpoint) {
    if (fetchImpl === fetch) {
      const localRes = await transcribeWithLocalPython({
        buf,
        ext: magic.ext,
        mimeType: mimeType || magic.mime,
        timeoutMs,
        fetchImpl,
      });
      if (localRes.ok && localRes.transcript) {
        return {
          ok: true,
          transcript: localRes.transcript,
          format: magic.ext,
          sizeBytes: buf.length,
          provider: localRes.provider || 'local_python',
        };
      }
    }
    return {
      ok: false,
      reason: 'stt_not_configured',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
    };
  }

  try {
    const formData = new FormData();
    const blob = new Blob([buf], { type: mimeType || magic.mime });
    formData.append('file', blob, `whatsapp_voice.${magic.ext}`);
    formData.append('model', sttModel);
    formData.append('language', 'pt');

    const headers = {};
    if (effectiveApiKey) {
      headers.Authorization = `Bearer ${effectiveApiKey}`;
    }

    const res = await fetchImpl(cleanEndpoint, {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(Math.min(12000, Math.max(1000, Number(timeoutMs) || DEFAULT_STT_TIMEOUT_MS))),
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: `stt_http_${res.status}`,
        transcript: '',
        fallbackMessage: AUDIO_FALLBACK_MESSAGE,
      };
    }

    const payload = await res.json().catch(() => null);
    const text = String(payload?.text || payload?.transcript || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return {
        ok: false,
        reason: 'empty_transcript',
        transcript: '',
        fallbackMessage: AUDIO_FALLBACK_MESSAGE,
      };
    }

    return {
      ok: true,
      transcript: text,
      format: magic.ext,
      sizeBytes: buf.length,
    };
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || /timeout|aborted/i.test(String(err?.message || ''));
    return {
      ok: false,
      reason: isTimeout ? 'stt_timeout' : 'stt_error',
      transcript: '',
      fallbackMessage: AUDIO_FALLBACK_MESSAGE,
    };
  }
}

/**
 * Matches an incoming WhatsApp product photo/caption against real catalog items.
 */
export function matchProductImageSuggestion({
  caption = '',
  filename = '',
  catalog = [],
} = {}) {
  const query = `${caption || ''} ${String(filename || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ')}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const activeCatalog = (Array.isArray(catalog) ? catalog : []).filter((p) => p && p.active !== false);
  if (!query || activeCatalog.length === 0) {
    return { matched: false, candidate: null };
  }

  const tokens = query.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) {
    return { matched: false, candidate: null };
  }

  let best = null;
  let bestScore = 0;
  for (const prod of activeCatalog) {
    const hay = `${prod.name || ''} ${prod.category || ''} ${prod.variation || ''} ${prod.sku || ''}`
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    let score = 0;
    for (const tk of tokens) {
      if (hay.includes(tk)) score += tk.length >= 5 ? 3 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = prod;
    }
  }

  if (!best || bestScore < 2) {
    return { matched: false, candidate: null };
  }

  return {
    matched: true,
    candidate: {
      sku: best.sku || best.id,
      name: best.name,
      variation: best.variation || 'Padrão',
      priceCents: Math.round(Number(best.priceCents || 0)),
    },
  };
}
