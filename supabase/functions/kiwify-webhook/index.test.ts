import {
  assertEquals,
  assertNotEquals,
} from "jsr:@std/assert@1.0.14";
import {
  generateAccessCode,
  hmacSha1Hex,
  maskAccessCode,
  resolveCredits,
  sha256Hex,
  timingSafeEqual,
} from "./index.ts";

Deno.test("confere o vetor oficial HMAC-SHA1 da Kiwify", async () => {
  const body = '{"order_id":"9b1c2d3e-0000-4000-8000-000000000001","order_status":"paid","webhook_event_type":"order_approved"}';
  const signature = await hmacSha1Hex("kiwify-token-de-teste", body);
  assertEquals(signature, "bf18f352a4f981b91dfa3f6d8742a81080ab8c86");
  assertEquals(timingSafeEqual(signature, signature), true);
  assertEquals(timingSafeEqual(signature, `0${signature.slice(1)}`), false);
});

Deno.test("alterar o corpo invalida a assinatura", async () => {
  const original = await hmacSha1Hex("segredo", '{"credits":100}');
  const changed = await hmacSha1Hex("segredo", '{"credits":300}');
  assertNotEquals(original, changed);
});

Deno.test("resolve os três planos por código e por valor", () => {
  assertEquals(
    resolveCredits({ Subscription: { plan: { checkout_code: "7fBDYu4" } } }),
    { credits: 100, planCode: "7fBDYu4", via: "plan_code" },
  );
  assertEquals(
    resolveCredits({ Subscription: { plan: { checkout_code: "O0ueDhe" } } }),
    { credits: 300, planCode: "O0ueDhe", via: "plan_code" },
  );
  assertEquals(
    resolveCredits({ Commissions: { charge_amount: 10000 } }),
    { credits: 2500, planCode: "10000", via: "amount_cents" },
  );
  assertEquals(resolveCredits({ Commissions: { charge_amount: 3223 } }), null);
});

Deno.test("código de acesso usa formato seguro e hash normalizado", async () => {
  const code = generateAccessCode();
  assertEquals(/^AI10-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), true);
  assertEquals(/^AI10-\*{4}-[A-HJ-NP-Z2-9]{4}$/.test(maskAccessCode(code)), true);
  assertEquals(await sha256Hex(code.toLowerCase()), await sha256Hex(code.toLowerCase()));
  assertNotEquals(
    await sha256Hex("AI10-ABCD-EFGH"),
    await sha256Hex("ai10-abcd-efgh"),
  );
});
