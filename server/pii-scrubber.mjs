/**
 * Sanitizador deterministico de PII, tokens JWT e credenciais sensiveis.
 * Usado por:
 * - FILA 06 (Diagnostico tecnico em SettingsView & Export/Restore de Backup .zip)
 * - FILA 07 (Console Admin 360 & Relatorios de Telemetria)
 */

const SECRET_KEY_RE = /^(?:access_token|refresh_token|authorization|bearer|jwt|token|secret|api_?key|service_?role|password|senha|private_?key|webhook_?secret)$/i;

export function scrubPii(input) {
  if (input === null || input === undefined) return '';
  let text = String(input);

  // 1. Bearer / JWT tokens (eyJ...)
  text = text.replace(/\bBearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g, '[REDACTED_JWT]');

  // 2. Supabase keys & common API prefixes
  text = text.replace(/\b(?:sb_[a-z]+_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{12,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|glm_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9_-]{8,})\b/g, '[REDACTED_KEY]');

  // 3. CPF / CNPJ formatados
  text = text.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**');
  text = text.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '**.***.***/****-**');

  // 4. E-mails (preserva inicial + dominio parcial sem expor inbox inteiro em diagnosticos)
  text = text.replace(/\b([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, (_m, first, rest, domain) => {
    const stars = rest.length > 0 ? '***' : '*';
    return `${first}${stars}${domain}`;
  });

  // 5. Telefones E.164 brasileiros (ex: +55 11 98888-7777 -> +55 (**)...7777)
  text = text.replace(/(\+?55[\s-]?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?)(\d{4})\b/g, (_m, _prefix, last4) => `+55 (**)...${last4}`);

  return text;
}

export function stripSecretKeys(value, { maskStrings = false, depth = 0 } = {}) {
  if (depth > 20 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return maskStrings ? scrubPii(value) : value
      .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g, '[REDACTED_JWT]')
      .replace(/\b(?:sb_[a-z]+_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{12,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|glm_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9_-]{8,})\b/g, '[REDACTED_KEY]');
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretKeys(item, { maskStrings, depth: depth + 1 }));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) continue;
      out[k] = stripSecretKeys(v, { maskStrings, depth: depth + 1 });
    }
    return out;
  }
  return value;
}

export function scrubObject(value) {
  return stripSecretKeys(value, { maskStrings: true });
}
