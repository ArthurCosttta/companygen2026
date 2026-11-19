import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import {
  classifyKiwifyError,
  firstString,
  generateAccessCode,
  hmacSha1Hex,
  maskAccessCode,
  readPath,
  resolveCredits,
  sha256Hex,
  timingSafeEqual,
} from "./core.mjs";

export {
  classifyKiwifyError,
  generateAccessCode,
  hmacSha1Hex,
  maskAccessCode,
  resolveCredits,
  sha256Hex,
  timingSafeEqual,
} from "./core.mjs";

const APPROVED_EVENTS = new Set(["order_approved", "subscription_renewed"]);
const REFUNDED_EVENTS = new Set(["order_refunded", "chargeback"]);
const APP_URL = Deno.env.get("APP_URL") ?? "https://companygen.store";

type JsonRecord = Record<string, unknown>;
type NotifyKind = "new_code" | "credits_added" | "refund";
type NotifyResult = { sent: boolean; error?: string };
type ProcessResult = {
  success: boolean;
  duplicate?: boolean;
  status?: string;
  action?: string;
  error?: string;
  credits_delta?: number;
  balance?: number | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}


function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function customerEmail(event: unknown): string | null {
  return normalizeEmail(
    readPath(event, ["Customer", "email"]) ??
      readPath(event, ["customer", "email"]),
  );
}

function customerPhone(event: unknown): string | null {
  const value = readPath(event, ["Customer", "phone"]) ??
    readPath(event, ["Customer", "cellphone"]) ??
    readPath(event, ["customer", "phone"]);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function notifyBuyer(
  supabase: ReturnType<typeof createClient>,
  email: string,
  kind: NotifyKind,
  context: { code?: string; credits: number; balance: number | null },
): Promise<NotifyResult> {
  const params = new URLSearchParams();
  if (context.code) params.set("code", context.code);
  params.set("credits", String(context.credits));
  if (context.balance !== null) params.set("balance", String(context.balance));
  if (kind === "refund") params.set("refund", "1");
  const redirectTo = `${APP_URL}/?${params.toString()}`;

  try {
    if (kind === "new_code") {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (!error) return { sent: true };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (error) throw error;
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("notifyBuyer falhou", { kind, error: message });
    return { sent: false, error: message };
  }
}

export async function handleKiwifyRequest(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return json({ ok: true, service: "kiwify-webhook", version: 2 });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  const signature = url.searchParams.get("signature") ?? "";
  const rawBody = await req.text();
  const token = Deno.env.get("KIWIFY_WEBHOOK_TOKEN") ?? "";
  if (!token) {
    console.error("KIWIFY_WEBHOOK_TOKEN não configurado");
    return json({ ok: false, error: "webhook_token_not_configured" }, 500);
  }

  const expectedSignature = await hmacSha1Hex(token, rawBody);
  if (!signature || !timingSafeEqual(signature, expectedSignature)) {
    console.warn("assinatura inválida", { prefix: signature.slice(0, 8) });
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let event: JsonRecord;
  try {
    event = JSON.parse(rawBody) as JsonRecord;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const orderId = String(event.order_id ?? "").trim();
  const orderStatus = String(event.order_status ?? "").trim();
  const eventType = String(event.webhook_event_type ?? "").trim();
  if (!orderId || !eventType) {
    return json({ ok: false, error: "missing_event_identity" }, 400);
  }

  const email = customerEmail(event);
  const hit = resolveCredits(event);
  const isApproved = APPROVED_EVENTS.has(eventType);
  const generatedCode = isApproved && hit && email ? generateAccessCode() : null;
  const generatedCodeHash = generatedCode
    ? await sha256Hex(generatedCode.toLowerCase())
    : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await supabase.rpc("cg_process_kiwify_event", {
    p_order_id: orderId,
    p_event_type: eventType,
    p_order_status: orderStatus,
    p_customer_email: email,
    p_customer_phone: customerPhone(event),
    p_plan_code: hit?.planCode ?? firstString(event, [["Subscription", "plan", "id"]]),
    p_credits: hit?.credits ?? null,
    p_payload: event,
    p_access_code_hash: generatedCodeHash,
    p_access_code_masked: generatedCode ? maskAccessCode(generatedCode) : null,
  });

  if (error) {
    const classification = classifyKiwifyError(error.message, 500);
    await supabase
      .from("cg_webhook_dlq")
      .upsert(
        {
          order_id: orderId,
          webhook_event_type: eventType,
          classification,
          error_message: error.message,
          payload: event as JsonRecord,
        },
        { onConflict: "order_id,webhook_event_type" },
      )
      .then(() => undefined, () => undefined);
    console.error("cg_process_kiwify_event falhou", {
      orderId,
      eventType,
      classification,
      error: error.message,
    });
    return json({ ok: false, error: "processing_failed", classification }, 500);
  }

  const result = (data ?? {}) as ProcessResult;
  if (result.status === "needs_review") {
    const classification = classifyKiwifyError(result.error || "needs_review", 400);
    await supabase
      .from("cg_webhook_dlq")
      .upsert(
        {
          order_id: orderId,
          webhook_event_type: eventType,
          classification,
          error_message: result.error || "needs_review",
          payload: event as JsonRecord,
        },
        { onConflict: "order_id,webhook_event_type" },
      )
      .then(() => undefined, () => undefined);
    console.error("evento requer revisão", { orderId, eventType, classification, error: result.error });
    return json({ ok: true, order_id: orderId, classification, ...result });
  }
  if (!result.success || result.status === "failed") {
    const classification = classifyKiwifyError(result.error || "failed", 500);
    await supabase
      .from("cg_webhook_dlq")
      .upsert(
        {
          order_id: orderId,
          webhook_event_type: eventType,
          classification,
          error_message: result.error || "failed",
          payload: event as JsonRecord,
        },
        { onConflict: "order_id,webhook_event_type" },
      )
      .then(() => undefined, () => undefined);
    console.error("evento falhou e poderá ser retentado", {
      orderId,
      eventType,
      classification,
      error: result.error,
    });
    return json({ ok: false, order_id: orderId, classification, ...result }, 500);
  }
  if (result.duplicate || result.action === "noop") {
    return json({ ok: true, order_id: orderId, ...result });
  }

  let notification: NotifyResult = { sent: false, error: "notification_not_required" };
  if (email && result.action === "access_code_created" && generatedCode && hit) {
    notification = await notifyBuyer(supabase, email, "new_code", {
      code: generatedCode,
      credits: hit.credits,
      balance: null,
    });
  } else if (email && result.action === "account_credited" && hit) {
    notification = await notifyBuyer(supabase, email, "credits_added", {
      credits: hit.credits,
      balance: result.balance ?? null,
    });
  } else if (
    email &&
    hit &&
    (result.action === "account_debited" || result.action === "access_code_revoked")
  ) {
    notification = await notifyBuyer(supabase, email, "refund", {
      credits: hit.credits,
      balance: result.balance ?? null,
    });
  }

  if (notification.sent) {
    await supabase
      .from("kiwify_webhooks")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .eq("webhook_event_type", eventType);
  } else if (notification.error !== "notification_not_required") {
    await supabase
      .from("kiwify_webhooks")
      .update({ error_message: `email_error: ${notification.error}` })
      .eq("order_id", orderId)
      .eq("webhook_event_type", eventType);
  }

  console.log("evento processado", {
    orderId,
    eventType,
    action: result.action,
    creditsDelta: result.credits_delta,
    balance: result.balance,
    emailSent: notification.sent,
  });
  return json({
    ok: true,
    order_id: orderId,
    ...result,
    email_sent: notification.sent,
  });
}

if (import.meta.main) {
  Deno.serve(handleKiwifyRequest);
}
