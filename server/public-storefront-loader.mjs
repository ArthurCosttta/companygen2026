import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveSupabaseAdminConfig } from './access-and-checkout.mjs';
import { getStorefrontMoldeDir } from './storefront-molde-fs.mjs';
import { downloadStorefrontFileFromStorage, isCloudStorageEnabled } from './supabase-storage-sync.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugCache = new Map();
const SLUG_CACHE_TTL_MS = 60_000;

export function normalizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function sanitizePublicStoreProfile(rawProfile) {
  const src = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  const business = src.business && typeof src.business === 'object' ? src.business : {};
  const brand = src.brand && typeof src.brand === 'object' ? src.brand : {};
  const whatsapp = src.whatsapp && typeof src.whatsapp === 'object' ? src.whatsapp : {};
  const payment = src.payment && typeof src.payment === 'object' ? src.payment : {};
  const delivery = src.delivery && typeof src.delivery === 'object' ? src.delivery : {};
  const shipping = src.shipping && typeof src.shipping === 'object' ? src.shipping : {};
  const catalog = src.catalog && typeof src.catalog === 'object' ? src.catalog : {};
  const publishedStore = src.publishedStore && typeof src.publishedStore === 'object' ? src.publishedStore : {};

  const safeProducts = Array.isArray(catalog.products)
    ? catalog.products
        .filter((p) => p && typeof p === 'object' && p.active !== false)
        .map((p) => ({
          id: String(p.id || ''),
          sku: String(p.sku || p.id || 'SKU'),
          name: String(p.name || 'Produto'),
          description: String(p.description || ''),
          category: String(p.category || 'Geral'),
          priceCents: Math.max(0, Number(p.priceCents || 0)),
          originalPriceCents: p.originalPriceCents ? Math.max(0, Number(p.originalPriceCents)) : undefined,
          imageUrl: String(p.imageUrl || ''),
          stock: typeof p.stock === 'number' && Number.isFinite(p.stock) ? p.stock : undefined,
          stockQty: typeof p.stockQty === 'number' && Number.isFinite(p.stockQty)
            ? p.stockQty
            : (typeof p.stock === 'number' && Number.isFinite(p.stock) ? p.stock : undefined),
          trackStock: Boolean(p.trackStock),
          autoPausedOutOfStock: Boolean(p.autoPausedOutOfStock),
          active: true,
          variants: Array.isArray(p.variants) ? p.variants : undefined,
        }))
    : [];

  return {
    business: {
      name: String(business.name || 'Vitrine Online'),
      segment: String(business.segment || 'Geral'),
      businessModel: String(business.businessModel || 'hibrido'),
      description: String(business.description || ''),
      address: String(business.address || ''),
      city: String(business.city || ''),
      neighborhood: String(business.neighborhood || ''),
      hours: String(business.hours || ''),
      mapsUrl: String(business.mapsUrl || ''),
      instagram: String(business.instagram || ''),
      // Nunca expor email, cpf/cnpj privado ou tokens
    },
    brand: {
      logoUrl: String(brand.logoUrl || ''),
      storefrontPhotoUrl: String(brand.storefrontPhotoUrl || ''),
      primaryColor: String(brand.primaryColor || '#2563EB'),
      accentColor: String(brand.accentColor || '#0EA5E9'),
    },
    whatsapp: {
      connected: Boolean(whatsapp.connected || whatsapp.phoneE164),
      phoneE164: String(whatsapp.phoneE164 || ''),
      displayPhone: String(whatsapp.displayPhone || whatsapp.phoneE164 || ''),
    },
    payment: {
      pixDiscountPercent: Math.max(0, Number(payment.pixDiscountPercent || 0)),
      acceptsPix: payment.acceptsPix !== false,
      acceptsCard: payment.acceptsCard !== false,
      acceptsCash: payment.acceptsCash !== false,
      ...(payment.showPixPublicly === true && payment.pixKey ? { pixKey: String(payment.pixKey) } : {}),
    },
    delivery: {
      deliveryEnabled: delivery.deliveryEnabled !== false,
      pickupEnabled: delivery.pickupEnabled !== false,
      defaultFeeCents: Math.max(0, Number(delivery.defaultFeeCents ?? shipping.fixedFeeCents ?? 0)),
      freeShippingOverCents: Math.max(0, Number(delivery.freeShippingOverCents ?? shipping.freeOverCents ?? 0)),
      etaLabel: String(delivery.etaLabel || ''),
    },
    catalog: {
      products: safeProducts,
    },
    publishedStore: {
      published: Boolean(publishedStore.published),
      publicSlug: String(publishedStore.publicSlug || ''),
    },
    ...(src.storeLayout && typeof src.storeLayout === 'object'
      ? {
          storeLayout: {
            activePageSlug: String(src.storeLayout.activePageSlug || 'home'),
            ...(src.storeLayout.formulasIr ? { formulasIr: src.storeLayout.formulasIr } : {}),
            ...(Array.isArray(src.storeLayout.pages) ? { pages: src.storeLayout.pages.slice(0, 24) } : {}),
          },
        }
      : {}),
  };
}

export async function resolveStoreOwnerId({
  lookupKey,
  root,
  readJsonFile,
  fetchImpl = globalThis.fetch,
}) {
  const clean = String(lookupKey || '').trim();
  if (!clean || clean.includes('..') || clean.includes('/') || clean.includes('\\')) return null;
  if (UUID_REGEX.test(clean)) return clean;

  const targetSlug = normalizeSlug(clean);
  if (!targetSlug) return null;

  const cached = slugCache.get(targetSlug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  // 1. Tenta resolver no Supabase (cg_business_profile.public_slug)
  const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
  if (process.env.CG_PERSISTENCE !== 'local' && sbUrl && serviceRoleKey) {
    try {
      const res = await fetchImpl(
        `${sbUrl}/rest/v1/cg_business_profile?public_slug=eq.${encodeURIComponent(targetSlug)}&select=user_id&limit=1`,
        {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]?.user_id) {
          slugCache.set(targetSlug, { userId: rows[0].user_id, expiresAt: Date.now() + SLUG_CACHE_TTL_MS });
          return rows[0].user_id;
        }
      }
    } catch {}
  }

  // 2. Fallback local: varre diretórios em root/*/profile.json
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
      const profRaw = await readJsonFile(path.join(root, ent.name, 'profile.json'), null);
      const data = profRaw?.data || profRaw?.profile || profRaw;
      if (!data || typeof data !== 'object') continue;
      const slug = normalizeSlug(data?.publishedStore?.publicSlug || data?.business?.name || '');
      if (slug && slug === targetSlug) {
        slugCache.set(targetSlug, { userId: ent.name, expiresAt: Date.now() + SLUG_CACHE_TTL_MS });
        return ent.name;
      }
    }
  } catch {}

  return null;
}

export async function loadStorefrontSnapshot({
  lookupKey,
  allowDraft = false,
  root,
  readJsonFile,
  fetchImpl = globalThis.fetch,
}) {
  const ownerId = await resolveStoreOwnerId({ lookupKey, root, readJsonFile, fetchImpl });
  if (!ownerId) {
    return { ok: false, status: 404, error: 'Loja não encontrada.' };
  }

  // Carrega profile local e/ou Supabase
  let profileData = null;
  const localSnap = await readJsonFile(path.join(root, ownerId, 'profile.json'), null);
  if (localSnap && typeof localSnap === 'object') {
    profileData = localSnap.data || localSnap.profile || localSnap;
  }

  const { url: sbUrl, serviceRoleKey } = resolveSupabaseAdminConfig();
  if (!profileData && process.env.CG_PERSISTENCE !== 'local' && sbUrl && serviceRoleKey && UUID_REGEX.test(ownerId)) {
    try {
      const res = await fetchImpl(
        `${sbUrl}/rest/v1/cg_business_profile?user_id=eq.${encodeURIComponent(ownerId)}&select=data,store_name,published,public_slug,whatsapp_phone&limit=1`,
        {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
          signal: AbortSignal.timeout(4500),
        },
      );
      if (res.ok) {
        const rows = await res.json().catch(() => []);
        if (Array.isArray(rows) && rows[0]) {
          const row = rows[0];
          const blob = row.data && typeof row.data === 'object' ? row.data : {};
          profileData = {
            ...blob,
            business: { ...(blob.business || {}), name: blob?.business?.name || row.store_name || 'Vitrine Online' },
            whatsapp: { ...(blob.whatsapp || {}), phoneE164: blob?.whatsapp?.phoneE164 || row.whatsapp_phone || '' },
            publishedStore: {
              ...(blob.publishedStore || {}),
              published: Boolean(blob?.publishedStore?.published ?? row.published),
              publicSlug: blob?.publishedStore?.publicSlug || row.public_slug || '',
            },
          };
        }
      }
    } catch {}
  }

  // Carrega formulas-ir.json do disco ou Supabase Storage
  let formulasIr = null;
  try {
    const irPath = path.join(getStorefrontMoldeDir(path.join(root, ownerId)), 'data', 'formulas-ir.json');
    const rawIr = await readFile(irPath, 'utf8');
    formulasIr = JSON.parse(rawIr);
  } catch {
    if (isCloudStorageEnabled()) {
      try {
        const buf = await downloadStorefrontFileFromStorage({
          userId: ownerId,
          relativePath: 'data/formulas-ir.json',
          fetchImpl,
        });
        if (buf) formulasIr = JSON.parse(buf.toString('utf8'));
      } catch {}
    }
  }

  if (!profileData && !formulasIr) {
    return { ok: false, status: 404, error: 'Loja não encontrada ou ainda sem dados cadastrados.' };
  }

  const isPublished = Boolean(profileData?.publishedStore?.published);
  if (!allowDraft && !isPublished) {
    return { ok: false, status: 403, error: 'Esta loja ainda está em configuração e não foi publicada.' };
  }

  const safeProfile = sanitizePublicStoreProfile(profileData || {});
  if (!safeProfile.publishedStore.publicSlug && formulasIr?.storeInfo?.name) {
    safeProfile.publishedStore.publicSlug = normalizeSlug(formulasIr.storeInfo.name);
  }

  return {
    ok: true,
    status: 200,
    ownerId,
    draft: !isPublished,
    source: formulasIr ? 'formulas_ir' : 'profile_fallback',
    profile: safeProfile,
    formulasIr,
  };
}
