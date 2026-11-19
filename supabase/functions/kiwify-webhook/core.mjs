export const PLAN_CREDITS = Object.freeze({
  "0USJqo5": 2500,
  "7fBDYu4": 100,
  "O0ueDhe": 300,
});

export const PLAN_CREDITS_BY_AMOUNT_CENTS = Object.freeze({
  10000: 2500,
  990: 100,
  2490: 300,
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function hmacSha1Hex(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function sha256Hex(text) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function readPath(value, path) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

export function firstString(event, paths) {
  for (const path of paths) {
    const value = readPath(event, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function resolveCredits(event) {
  const planCode = firstString(event, [
    ["Subscription", "plan", "checkout_code"],
    ["Subscription", "plan", "checkout_link"],
    ["Subscription", "plan", "id"],
    ["Product", "checkout_code"],
    ["product", "checkout_code"],
    ["checkout_code"],
  ]);
  if (planCode && PLAN_CREDITS[planCode] !== undefined) {
    return { credits: PLAN_CREDITS[planCode], planCode, via: "plan_code" };
  }

  const planName = firstString(event, [
    ["Subscription", "plan", "name"],
    ["Product", "name"],
    ["product", "name"],
  ]);
  if (/profissional/i.test(planName)) {
    return { credits: 2500, planCode: planCode || planName, via: "plan_name" };
  }
  if (/r[aá]pida/i.test(planName)) {
    return { credits: 100, planCode: planCode || planName, via: "plan_name" };
  }
  if (/intermedi[aá]ria/i.test(planName)) {
    return { credits: 300, planCode: planCode || planName, via: "plan_name" };
  }

  const amount = Number(readPath(event, ["Commissions", "charge_amount"]));
  if (Number.isFinite(amount) && PLAN_CREDITS_BY_AMOUNT_CENTS[amount] !== undefined) {
    return {
      credits: PLAN_CREDITS_BY_AMOUNT_CENTS[amount],
      planCode: planCode || String(amount),
      via: "amount_cents",
    };
  }
  return null;
}

export function generateAccessCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const pick = (index) => CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  return `AI10-${pick(0)}${pick(1)}${pick(2)}${pick(3)}-${pick(4)}${pick(5)}${pick(6)}${pick(7)}`;
}

export function maskAccessCode(code) {
  const suffix = code.split("-").at(-1) ?? "****";
  return `AI10-****-${suffix}`;
}

export function classifyKiwifyError(errorMessage = "", httpStatus = 0) {
  const msg = String(errorMessage || "").toLowerCase();
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /signature|hmac|unauthorized|forbidden|auth|token/i.test(msg)
  ) {
    return "AUTH";
  }
  if (
    /unknown_plan|missing_customer_email|original_credit_not_found|invalid_format|permanent|bad request|22023|missing_access_code/i.test(
      msg,
    ) ||
    httpStatus === 400 ||
    httpStatus === 404
  ) {
    return "PERMANENT";
  }
  return "TRANSIENT";
}
