import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  generateAccessCode,
  hmacSha1Hex,
  maskAccessCode,
  resolveCredits,
  sha256Hex,
  timingSafeEqual,
} from '../supabase/functions/kiwify-webhook/core.mjs';

const migrationUrl = new URL(
  '../supabase/migrations/20261114000100_cg_access_codes_and_credits.sql',
  import.meta.url,
);
const functionUrl = new URL(
  '../supabase/functions/kiwify-webhook/index.ts',
  import.meta.url,
);

test('confere o vetor oficial HMAC-SHA1 da Kiwify', async () => {
  const body = '{"order_id":"9b1c2d3e-0000-4000-8000-000000000001","order_status":"paid","webhook_event_type":"order_approved"}';
  const signature = await hmacSha1Hex('kiwify-token-de-teste', body);
  assert.equal(signature, 'bf18f352a4f981b91dfa3f6d8742a81080ab8c86');
  assert.equal(timingSafeEqual(signature, signature), true);
  assert.equal(timingSafeEqual(signature, `0${signature.slice(1)}`), false);
});

test('alterar o corpo invalida a assinatura', async () => {
  const original = await hmacSha1Hex('segredo', '{"credits":100}');
  const changed = await hmacSha1Hex('segredo', '{"credits":300}');
  assert.notEqual(original, changed);
});

test('resolve planos reais e rejeita o plano fictício', () => {
  assert.deepEqual(
    resolveCredits({ Subscription: { plan: { checkout_code: '7fBDYu4' } } }),
    { credits: 100, planCode: '7fBDYu4', via: 'plan_code' },
  );
  assert.deepEqual(
    resolveCredits({ Subscription: { plan: { checkout_code: 'O0ueDhe' } } }),
    { credits: 300, planCode: 'O0ueDhe', via: 'plan_code' },
  );
  assert.deepEqual(
    resolveCredits({ Commissions: { charge_amount: 10000 } }),
    { credits: 2500, planCode: '10000', via: 'amount_cents' },
  );
  assert.equal(resolveCredits({ Commissions: { charge_amount: 3223 } }), null);
});

test('gera código de uso único e mantém hash compatível com o resgate', async () => {
  const code = generateAccessCode();
  assert.match(code, /^AI10-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.match(maskAccessCode(code), /^AI10-\*{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(
    await sha256Hex('AI10-ABCD-EFGH'),
    await sha256Hex('ai10-abcd-efgh'),
  );
});

test('migration exige idempotência no banco e restringe RPC privilegiada', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /unique index[^;]+kiwify_webhooks_order_event_key[\s\S]+order_id, webhook_event_type/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /reference_id text not null unique/i);
  assert.match(sql, /already_reversed/i);
  assert.match(sql, /original_credit_amount_not_found/i);
  assert.match(sql, /grant execute on function public\.cg_process_kiwify_event[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /to anon\s*,\s*authenticated[\s\S]+cg_process_kiwify_event/i);
});

test('Edge Function lê corpo RAW antes do JSON e usa RPC transacional', async () => {
  const source = await readFile(functionUrl, 'utf8');
  assert.ok(source.indexOf('const rawBody = await req.text()') < source.indexOf('JSON.parse(rawBody)'));
  assert.match(source, /timingSafeEqual\(signature, expectedSignature\)/);
  assert.match(source, /supabase\.rpc\("cg_process_kiwify_event"/);
  assert.match(source, /result\.status === "failed"/);
  assert.doesNotMatch(source, /\.from\("cg_credit_ledger"\)\.insert/);
  assert.doesNotMatch(source, /auth\.admin\.listUsers/);
});
