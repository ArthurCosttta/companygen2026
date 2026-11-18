import { resolveSupabaseAdminConfig } from './access-and-checkout.mjs';

const STORAGE_BUCKET = 'cg-storefronts';

export function isCloudStorageEnabled() {
  if (process.env.CG_PERSISTENCE === 'local') return false;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  return Boolean(url && serviceRoleKey);
}

function normalizeObjectKey(userId, relativePath) {
  const safeUid = encodeURIComponent(String(userId || '').trim());
  const cleanRel = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  if (!safeUid || !cleanRel) return '';
  return `${safeUid}/${cleanRel}`;
}

function guessContentType(relativePath) {
  const lower = String(relativePath || '').toLowerCase();
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

export async function uploadStorefrontFileToStorage({
  userId,
  relativePath,
  bytes,
  contentType,
  fetchImpl = globalThis.fetch,
}) {
  if (!isCloudStorageEnabled()) return false;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  const objectKey = normalizeObjectKey(userId, relativePath);
  if (!url || !serviceRoleKey || !objectKey || !bytes) return false;

  try {
    const res = await fetchImpl(`${url}/storage/v1/object/${STORAGE_BUCKET}/${objectKey}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': contentType || guessContentType(relativePath),
        'x-upsert': 'true',
      },
      body: bytes,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function downloadStorefrontFileFromStorage({
  userId,
  relativePath,
  fetchImpl = globalThis.fetch,
}) {
  if (!isCloudStorageEnabled()) return null;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  const objectKey = normalizeObjectKey(userId, relativePath);
  if (!url || !serviceRoleKey || !objectKey) return null;

  try {
    const res = await fetchImpl(`${url}/storage/v1/object/${STORAGE_BUCKET}/${objectKey}`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export async function fetchCloudPublishedFlag({ userId, fetchImpl = globalThis.fetch }) {
  if (!isCloudStorageEnabled()) return false;
  const { url, serviceRoleKey } = resolveSupabaseAdminConfig();
  const uid = String(userId || '').trim();
  if (!url || !serviceRoleKey || !uid) return false;

  try {
    const res = await fetchImpl(
      `${url}/rest/v1/cg_business_profile?user_id=eq.${encodeURIComponent(uid)}&select=published&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return false;
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows[0]?.published === true;
  } catch {
    return false;
  }
}
