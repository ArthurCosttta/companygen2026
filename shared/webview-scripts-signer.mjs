import crypto from 'node:crypto';

/**
 * Verificador e assinador Ed25519 para scripts remotos do WebView WhatsApp (FILA 13).
 * - Servidor assina com chave privada via env `CG_WEBVIEW_SCRIPTS_PRIVATE_KEY_PEM` (nunca commitada).
 * - Electron verifica com chave pública embutida (ou env `CG_WEBVIEW_SCRIPTS_PUBLIC_KEY_PEM`).
 * - Qualquer alteração de 1 byte ou assinatura ausente/inválida é rejeitada imediatamente.
 */

export const DEFAULT_WEBVIEW_SCRIPTS_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAvG8R7h3w4mN1q9zX2kP5sL8tU0vW3yA6cE9fH2jK4mQ=
-----END PUBLIC KEY-----`;

export function canonicalizeScriptsPayload(payload) {
  const version = String(payload?.version || '');
  const scripts = payload?.scripts && typeof payload.scripts === 'object' ? payload.scripts : {};
  const sortedKeys = Object.keys(scripts).sort();
  const normalizedScripts = {};
  for (const key of sortedKeys) {
    normalizedScripts[key] = String(scripts[key] || '');
  }
  return JSON.stringify({ version, scripts: normalizedScripts });
}

export function computeScriptsSha256(payload) {
  return crypto.createHash('sha256').update(canonicalizeScriptsPayload(payload), 'utf8').digest('hex');
}

export function signWebviewScriptsPayload(payload, privateKeyPem = process.env.CG_WEBVIEW_SCRIPTS_PRIVATE_KEY_PEM || '') {
  const canonical = canonicalizeScriptsPayload(payload);
  const sha256 = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  const cleanPem = String(privateKeyPem || '').replace(/\\n/g, '\n').trim();
  if (!cleanPem) {
    return {
      version: String(payload?.version || ''),
      scripts: payload?.scripts || {},
      sha256,
      signature: '',
      signed: false,
    };
  }
  const keyObj = crypto.createPrivateKey(cleanPem);
  const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), keyObj);
  return {
    version: String(payload?.version || ''),
    scripts: payload?.scripts || {},
    sha256,
    signature: sigBuf.toString('base64'),
    signed: true,
  };
}

export function verifyWebviewScriptsPayload(
  bundle,
  publicKeyPem = process.env.CG_WEBVIEW_SCRIPTS_PUBLIC_KEY_PEM || DEFAULT_WEBVIEW_SCRIPTS_PUBLIC_KEY_PEM,
) {
  if (!bundle || typeof bundle !== 'object') {
    return { ok: false, reason: 'invalid_bundle' };
  }
  const version = String(bundle.version || '').trim();
  const scripts = bundle.scripts;
  const declaredSha = String(bundle.sha256 || '').trim().toLowerCase();
  const signatureB64 = String(bundle.signature || '').trim();
  if (!version || !scripts || typeof scripts !== 'object' || !declaredSha || !signatureB64) {
    return { ok: false, reason: 'missing_fields_or_signature' };
  }

  const canonical = canonicalizeScriptsPayload({ version, scripts });
  const actualSha = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  if (actualSha !== declaredSha) {
    return { ok: false, reason: 'sha256_mismatch' };
  }

  const cleanPub = String(publicKeyPem || '').replace(/\\n/g, '\n').trim();
  if (!cleanPub) {
    return { ok: false, reason: 'missing_public_key' };
  }

  try {
    const pubKey = crypto.createPublicKey(cleanPub);
    const sigBuf = Buffer.from(signatureB64, 'base64');
    const verified = crypto.verify(null, Buffer.from(canonical, 'utf8'), pubKey, sigBuf);
    if (!verified) {
      return { ok: false, reason: 'invalid_ed25519_signature' };
    }
    return { ok: true, version, sha256: actualSha, scripts };
  } catch (err) {
    return { ok: false, reason: `verify_error:${err?.message || 'unknown'}` };
  }
}
