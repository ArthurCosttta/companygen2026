/**
 * Transcrição segura de áudio (Whisper/STT) & Sugestão visual para anexos WhatsApp (C62 / BUG-F05-05)
 * Nunca inventa texto quando áudio é >4MB, >60s, corrompido ou STT indisponível.
 */

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 60;
export const DEFAULT_STT_TIMEOUT_MS = 8000;
export const AUDIO_FALLBACK_MESSAGE =
  'Não consegui ouvir seu áudio agora — pode mandar rapidinho por texto?';

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
  sttApiKey = process.env.WHISPER_API_KEY || process.env.GLM_API_KEY || '',
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

  const cleanEndpoint = String(sttEndpointUrl || '').trim();
  if (!cleanEndpoint) {
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
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const headers = {};
    if (sttApiKey) {
      headers.Authorization = `Bearer ${sttApiKey}`;
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
