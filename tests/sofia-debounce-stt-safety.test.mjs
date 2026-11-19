import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createBurstDebounceAccumulator } from '../shared/sofia/debounce-accumulator.mjs';
import { splitReplyIntoBubbles } from '../server/ai-sofia-local.mjs';
import {
  AUDIO_FALLBACK_MESSAGE,
  MAX_AUDIO_BYTES,
  matchProductImageSuggestion,
  transcribeWhatsappAudio,
} from '../server/media-transcribe.mjs';

test('C61 / BUG-F05-04: Debounce acumula 4 mensagens picadas e garante teto maxWaitMs (sem loop infinito)', async () => {
  const flushes = [];
  const acc = createBurstDebounceAccumulator({
    debounceMs: 140,
    maxWaitMs: 320,
    onFlush: (key, merged) => {
      flushes.push({ key, merged });
    },
  });

  // 4 mensagens picadas espaçadas em 70ms (4 * 70 = 280ms -> teto 320ms dispara mesmo com rajada contínua)
  acc.enqueue('5511988880001', 'Oi', {});
  await delay(75);
  acc.enqueue('5511988880001', 'tudo bem?', {});
  await delay(75);
  acc.enqueue('5511988880001', 'quanto custa', {});
  await delay(75);
  acc.enqueue('5511988880001', 'o sérum vitamina c?', {});

  await delay(260);
  acc.clearAll();

  assert.equal(flushes.length, 1);
  assert.equal(flushes[0].key, '5511988880001');
  assert.equal(flushes[0].merged, 'Oi\ntudo bem?\nquanto custa\no sérum vitamina c?');
});

test('C62: splitReplyIntoBubbles divide respostas longas ou com parágrafos em no máximo 2 balões', () => {
  const longText =
    'Olá Maria! Temos o Sérum Vitamina C 30ml por R$ 119,90 pronta entrega.\n\nNo Pix com 10% OFF sai R$ 107,91!\n\nQuer que eu separe para entrega hoje ou retirada na loja?';
  const parts = splitReplyIntoBubbles(longText, [{ url: '/media/serum.webp' }]);
  assert.ok(parts.length >= 1 && parts.length <= 2);
  assert.match(parts[0], /Sérum Vitamina C/);
  assert.match(parts.join(' '), /Pix/);

  const shortParts = splitReplyIntoBubbles('Oi! Tudo bem?');
  assert.equal(shortParts.length, 1);
});

test('BUG-F05-05 / C62: STT rejeita >4MB, >60s, bytes inválidos e falha/timeout sem inventar texto', async () => {
  // 1. Áudio > 4 MB
  const bigBuffer = Buffer.alloc(MAX_AUDIO_BYTES + 128, 0);
  bigBuffer.write('OggS', 0, 'ascii');
  const overSize = await transcribeWhatsappAudio({
    audioBuffer: bigBuffer,
    durationSeconds: 12,
    sttEndpointUrl: 'http://127.0.0.1:9999/whisper',
  });
  assert.equal(overSize.ok, false);
  assert.equal(overSize.reason, 'audio_too_large');
  assert.equal(overSize.transcript, '');
  assert.equal(overSize.fallbackMessage, AUDIO_FALLBACK_MESSAGE);

  // 2. Duração > 60s
  const validOggHeader = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.alloc(64, 1)]);
  const overDuration = await transcribeWhatsappAudio({
    audioBuffer: validOggHeader,
    durationSeconds: 75,
    sttEndpointUrl: 'http://127.0.0.1:9999/whisper',
  });
  assert.equal(overDuration.ok, false);
  assert.equal(overDuration.reason, 'audio_too_long');
  assert.equal(overDuration.transcript, '');

  // 3. Magic bytes corrompidos / executável disfarçado
  const spoofExe = Buffer.from('MZ\x90\x00ThisIsAnExecutableDisguisedAsAudio', 'ascii');
  const spoofedRes = await transcribeWhatsappAudio({
    audioBuffer: spoofExe,
    durationSeconds: 5,
    sttEndpointUrl: 'http://127.0.0.1:9999/whisper',
  });
  assert.equal(spoofedRes.ok, false);
  assert.equal(spoofedRes.reason, 'unsupported_audio_magic');

  // 4. Timeout no STT não inventa transcrição
  const timeoutRes = await transcribeWhatsappAudio({
    audioBuffer: validOggHeader,
    durationSeconds: 8,
    sttEndpointUrl: 'https://stt.local.invalid/v1/audio/transcriptions',
    timeoutMs: 1000,
    fetchImpl: async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    },
  });
  assert.equal(timeoutRes.ok, false);
  assert.equal(timeoutRes.reason, 'stt_timeout');
  assert.equal(timeoutRes.transcript, '');
  assert.equal(timeoutRes.fallbackMessage, AUDIO_FALLBACK_MESSAGE);

  // 5. Transcrição bem-sucedida com Whisper mockado
  const okRes = await transcribeWhatsappAudio({
    audioBuffer: validOggHeader,
    durationSeconds: 6,
    sttEndpointUrl: 'https://stt.local.invalid/v1/audio/transcriptions',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ text: 'Quero dois séruns de vitamina C no Pix' }),
    }),
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.transcript, 'Quero dois séruns de vitamina C no Pix');
});

test('Sugestão visual de imagem identifica SKU oficial ou retorna matched=false sem inventar', () => {
  const catalog = [
    { id: 'p1', sku: 'SER-01', name: 'Sérum Facial Vitamina C', category: 'Séruns', priceCents: 11990, active: true },
    { id: 'p2', sku: 'CRE-02', name: 'Creme Calmante Lavanda', category: 'Hidratantes', priceCents: 6990, active: true },
  ];
  const hit = matchProductImageSuggestion({
    caption: 'Tem esse sérum vitamina c aí?',
    filename: 'foto-serum.jpg',
    catalog,
  });
  assert.equal(hit.matched, true);
  assert.equal(hit.candidate.sku, 'SER-01');

  const miss = matchProductImageSuggestion({
    caption: 'Vocês consertam geladeira?',
    filename: 'img123.jpg',
    catalog,
  });
  assert.equal(miss.matched, false);
});
