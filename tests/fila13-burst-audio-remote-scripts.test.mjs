import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import {
  transcribeWhatsappAudio,
  AUDIO_FALLBACK_MESSAGE,
} from '../server/media-transcribe.mjs';
import {
  getWebviewScriptsBundle,
  WEBVIEW_SCRIPTS_VERSION,
} from '../shared/whatsapp-webview-script.mjs';
import {
  signWebviewScriptsPayload,
  verifyWebviewScriptsPayload,
} from '../shared/webview-scripts-signer.mjs';
import { handleWhatsappAiRoutes } from '../server/ai-sofia-local.mjs';
import { debitCredits, getCreditBalance, CREDIT_ACTION_COSTS } from '../server/access-and-checkout.mjs';
import { createBurstDebounceAccumulator } from '../shared/sofia/debounce-accumulator.mjs';

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createMockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(code, h = {}) { this.statusCode = code; Object.assign(this.headers, h); this.headersSent = true; },
    end(chunk) { this.body = chunk ? JSON.parse(String(chunk)) : null; this.headersSent = true; },
  };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

test('QA13-01 & QA13-02: Burst accumulator agrupa 10 mensagens em 1 única rajada sem perder nenhuma', async () => {
  const flushes = [];
  const acc = createBurstDebounceAccumulator({
    debounceMs: 60,
    maxWaitMs: 300,
    onFlush: (chatKey, mergedText, meta) => {
      flushes.push({ chatKey, mergedText, meta });
    },
  });

  for (let i = 1; i <= 10; i += 1) {
    acc.enqueue('5561999990001', `Mensagem parte ${i}`, { idx: i });
  }

  await new Promise((r) => setTimeout(r, 140));
  assert.equal(flushes.length, 1, '10 balões devem gerar 1 único flush');
  for (let i = 1; i <= 10; i += 1) {
    assert.ok(flushes[0].mergedText.includes(`Mensagem parte ${i}`), `Parte ${i} perdida na rajada`);
  }
});

test('QA13-03, QA13-04, QA13-05: Segurança STT (spoofing .exe, 15MB DoS, áudio 120s, STT offline/timeout)', async () => {
  // QA13-03: arquivo .exe renomeado como audio.ogg (MZ header)
  const exeBuf = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00'), Buffer.alloc(64, 0x41)]);
  const spoofRes = await transcribeWhatsappAudio({
    audioBuffer: exeBuf,
    mimeType: 'audio/ogg',
    durationSeconds: 5,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
  });
  assert.equal(spoofRes.ok, false);
  assert.equal(spoofRes.reason, 'unsupported_audio_magic');
  assert.equal(spoofRes.fallbackMessage, AUDIO_FALLBACK_MESSAGE);

  // QA13-04a: DoS de áudio gigante 5MB (>4MB)
  const hugeOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(5 * 1024 * 1024, 0x01)]);
  const hugeRes = await transcribeWhatsappAudio({
    audioBuffer: hugeOgg,
    mimeType: 'audio/ogg',
    durationSeconds: 10,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
  });
  assert.equal(hugeRes.ok, false);
  assert.equal(hugeRes.reason, 'audio_too_large');
  assert.equal(hugeRes.fallbackMessage, AUDIO_FALLBACK_MESSAGE);

  // QA13-04b: Áudio longo 120s (>60s)
  const validOgg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(128, 0x02)]);
  const longRes = await transcribeWhatsappAudio({
    audioBuffer: validOgg,
    mimeType: 'audio/ogg',
    durationSeconds: 120,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
  });
  assert.equal(longRes.ok, false);
  assert.equal(longRes.reason, 'audio_too_long');

  // QA13-05a: STT HTTP 503 fora do ar
  const downRes = await transcribeWhatsappAudio({
    audioBuffer: validOgg,
    mimeType: 'audio/ogg',
    durationSeconds: 8,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
    fetchImpl: async () => new Response('Service Unavailable', { status: 503 }),
  });
  assert.equal(downRes.ok, false);
  assert.equal(downRes.reason, 'stt_http_503');
  assert.equal(downRes.fallbackMessage, AUDIO_FALLBACK_MESSAGE);

  // QA13-05b: STT Timeout
  const timeoutRes = await transcribeWhatsappAudio({
    audioBuffer: validOgg,
    mimeType: 'audio/ogg',
    durationSeconds: 8,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
    fetchImpl: async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    },
  });
  assert.equal(timeoutRes.ok, false);
  assert.equal(timeoutRes.reason, 'stt_timeout');

  // Sucesso com transcrição real
  const okRes = await transcribeWhatsappAudio({
    audioBuffer: validOgg,
    mimeType: 'audio/ogg',
    durationSeconds: 8,
    sttEndpointUrl: 'https://stt.fake/v1/audio/transcriptions',
    sttApiKey: 'test-token',
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      return new Response(JSON.stringify({ text: 'Quero dois hidratantes no Pix' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.transcript, 'Quero dois hidratantes no Pix');
});

test('QA13-08: Falha no envio WhatsApp estorna exatamente 0,1 cr com idempotência', async () => {
  const prevPersistence = process.env.CG_PERSISTENCE;
  process.env.CG_PERSISTENCE = 'local';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cg-fila13-refund-'));
  try {
    const user = { id: 'u-fila13-refund' };
    await atomicWriteJson(path.join(dir, 'credits_ledger.json'), [
      { id: 'seed-1', user_id: user.id, delta: 10, balance_after: 10, operation_type: 'admin_grant', created_at: new Date().toISOString() },
    ]);

    const debited = await debitCredits({
      user,
      directory: dir,
      action: 'glm_whatsapp',
      metadata: { test: true },
      readJsonFile,
      atomicWriteJson,
    });
    assert.equal(debited.ok, true);
    assert.equal(debited.debited, CREDIT_ACTION_COSTS.glm_whatsapp);
    assert.equal(debited.balanceAfter, 9.9);

    const refId = debited.entry.id;
    const req1 = { method: 'POST', url: '/api/whatsapp/ai/refund-failed-send', headers: {} };
    const res1 = createMockRes();
    const handled1 = await handleWhatsappAiRoutes(req1, res1, {
      user,
      directory: dir,
      readJson: async () => ({ referenceId: refId, amount: 0.1, reason: 'webview_offline' }),
      send,
      ApiError,
      readJsonFile,
      atomicWriteJson,
      loadProfileState: async () => ({ current: { data: {} } }),
    });
    assert.equal(handled1, true);
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.body.ok, true);
    assert.equal(res1.body.refunded, 0.1);
    assert.equal(res1.body.balanceAfter, 10);

    // Tentativa de estorno duplicado (ataque replay) -> não pode creditar 2x!
    const res2 = createMockRes();
    await handleWhatsappAiRoutes(req1, res2, {
      user,
      directory: dir,
      readJson: async () => ({ referenceId: refId, amount: 0.1, reason: 'replay_attack' }),
      send,
      ApiError,
      readJsonFile,
      atomicWriteJson,
      loadProfileState: async () => ({ current: { data: {} } }),
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.body.duplicate, true);
    assert.equal(res2.body.refunded, 0);
    const finalBal = await getCreditBalance({ user, directory: dir, readJsonFile });
    assert.equal(finalBal, 10);
  } finally {
    process.env.CG_PERSISTENCE = prevPersistence;
    await rm(dir, { recursive: true, force: true });
  }
});

test('QA13-10: Assinatura Ed25519 de scripts remotos aceita íntegro e bloqueia 1 byte adulterado', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  const bundle = getWebviewScriptsBundle();
  assert.equal(bundle.version, WEBVIEW_SCRIPTS_VERSION);

  const signed = signWebviewScriptsPayload(bundle, privPem);
  assert.equal(signed.signed, true);
  assert.ok(signed.signature.length > 20);

  // Íntegro -> aceito
  const okCheck = verifyWebviewScriptsPayload(signed, pubPem);
  assert.equal(okCheck.ok, true);
  assert.equal(okCheck.version, WEBVIEW_SCRIPTS_VERSION);

  // MITM tampering de 1 byte no script -> rejeitado
  const tampered = {
    ...signed,
    scripts: {
      ...signed.scripts,
      pollScript: signed.scripts.pollScript + ' ',
    },
  };
  const tamperCheck = verifyWebviewScriptsPayload(tampered, pubPem);
  assert.equal(tamperCheck.ok, false);
  assert.equal(tamperCheck.reason, 'sha256_mismatch');

  // MITM recalculando sha256 mas mantendo assinatura antiga -> rejeitado pelo Ed25519
  const tamperedSha = signWebviewScriptsPayload(tampered, '');
  tamperedSha.signature = signed.signature;
  const sigCheck = verifyWebviewScriptsPayload(tamperedSha, pubPem);
  assert.equal(sigCheck.ok, false);
  assert.equal(sigCheck.reason, 'invalid_ed25519_signature');

  // Sem assinatura -> rejeitado
  const unsigned = signWebviewScriptsPayload(bundle, '');
  assert.equal(verifyWebviewScriptsPayload(unsigned, pubPem).ok, false);
});
