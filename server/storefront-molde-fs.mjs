import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  FORMULA_V9_VERSION,
  FormulaV9DocumentSchema,
  SectionNodeSchema,
  deriveThemeTokensFromHex,
  safeCssHex,
  sanitizeFormulaV9Document,
  sanitizeSafeAssetUrl,
  sanitizeSafeHref,
} from '../shared/formula-ir/composer-schema.mjs';
import { validateFormulaIrDocument } from '../shared/formula-ir/schema.mjs';
import {
  CREDIT_ACTION_COSTS,
  debitCredits,
  getCreditBalance,
  refundCredits,
} from './access-and-checkout.mjs';
import {
  EXPERIENCE_MATRIX,
  auditCopyConversion,
  computeStoreIdentityId,
  pickExperienceCombo,
  sanitizeCustomHtmlBlock,
} from './storefront-experience-matrix.mjs';
import { recordSystemIncident } from './admin-console.mjs';
import { runDesignCritic } from './design-critic.mjs';
import { generateRunPodImage } from './runpod-media.mjs';
import {
  isCloudStorageEnabled,
  uploadStorefrontFileToStorage,
} from './supabase-storage-sync.mjs';
import {
  buildDeterministicOnboardingAutofill,
  buildGlmArchitectMessages,
  buildNeutralFallbackV9Document,
  buildOnboardingAutofillMessages,
} from './glm-architect-prompt.mjs';
import {
  buildMoldeAppJs,
  buildMoldeStylesCss,
  renderMoldeHtmlPage,
} from './molde-html-emitter.mjs';

export function getStorefrontMoldeDir(directory) {
  return path.join(directory, 'storefront-molde');
}

async function atomicWriteText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

async function atomicWriteBuffer(filePath, buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmp, buffer);
  await rename(tmp, filePath);
}

const moldeMutationQueues = new Map();
function serializeMoldeMutation(directory, job) {
  const key = path.resolve(directory);
  const prev = moldeMutationQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  moldeMutationQueues.set(key, next);
  return next.finally(() => {
    if (moldeMutationQueues.get(key) === next) moldeMutationQueues.delete(key);
  });
}

const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BASE64_CHARS = Math.ceil((MAX_UPLOAD_IMAGE_BYTES * 4) / 3) + 64;

function resolveValidatedSlotKey(rawSlotId, fallbackPrefix, ApiError) {
  const hasExplicit = rawSlotId !== undefined && rawSlotId !== null;
  const raw = hasExplicit ? String(rawSlotId) : `${fallbackPrefix}_${Date.now().toString(36)}`;
  const slotKey = raw.replace(/[^a-z0-9_-]/gi, '');
  if (!slotKey) {
    throw new ApiError(400, 'slotId inválido após sanitização.');
  }
  return slotKey;
}

function detectImageMagicExt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (buffer.length >= 6) {
    const hdr6 = buffer.subarray(0, 6).toString('ascii');
    if (hdr6 === 'GIF87a' || hdr6 === 'GIF89a') return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export async function callGlm53Json({
  systemPrompt,
  userPrompt,
  messages,
  maxTokens = 2800,
  timeoutMs = 55000,
  enableThinking = false,
  fetchImpl = fetch,
} = {}) {
  const apiKey = String(process.env.GLM_API_KEY || '').trim();
  const baseEndpoint = String(process.env.GLM_ENDPOINT_URL || '').trim().replace(/\/$/, '');
  const model = String(process.env.GLM_MODEL || 'zai-org/GLM-5.3').trim() || 'zai-org/GLM-5.3';
  if (!apiKey || !baseEndpoint) {
    return { ok: false, data: null, error: 'GLM_NOT_CONFIGURED' };
  }

  const chatUrl = baseEndpoint.endsWith('/chat/completions')
    ? baseEndpoint
    : `${baseEndpoint}/chat/completions`;
  const effectiveTimeout = Math.max(Number(process.env.GLM_TIMEOUT_MS || 0), timeoutMs, 30000);
  const msgList = Array.isArray(messages) && messages.length > 0
    ? messages
    : [
        { role: 'system', content: systemPrompt || 'Respond only with valid JSON.' },
        { role: 'user', content: userPrompt || '{}' },
      ];

  try {
    const res = await fetchImpl(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: maxTokens,
        chat_template_kwargs: { enable_thinking: Boolean(enableThinking) },
        messages: msgList,
      }),
      signal: AbortSignal.timeout(effectiveTimeout),
    });
    if (!res.ok) {
      return { ok: false, data: null, error: `GLM_HTTP_${res.status}` };
    }
    const json = await res.json();
    const raw = String(json?.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) {
      return { ok: false, data: null, error: 'GLM_NO_JSON' };
    }
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return { ok: true, data: parsed, model };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : 'GLM_ERR' };
  }
}

function dimensionsForAspect(aspect) {
  if (aspect === '16:9') return { width: 1280, height: 720 };
  if (aspect === '1:1') return { width: 1024, height: 1024 };
  return { width: 1024, height: 768 };
}

function cleanImageUrlForIr(url) {
  const raw = String(url || '').trim();
  if (!raw || /^data:image\/svg\+xml/i.test(raw)) return '';
  return sanitizeSafeAssetUrl(raw, '');
}

function stripSvgPlaceholdersInDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const cloned = JSON.parse(JSON.stringify(doc));
  if (cloned.storeInfo && typeof cloned.storeInfo === 'object') {
    for (const k of ['logoUrl', 'storefrontPhotoUrl']) {
      if (typeof cloned.storeInfo[k] === 'string' && /^data:image\/svg\+xml/i.test(cloned.storeInfo[k].trim())) {
        cloned.storeInfo[k] = '';
      }
    }
  }
  if (Array.isArray(cloned.catalog)) {
    cloned.catalog = cloned.catalog.map((item) =>
      item && typeof item === 'object' && typeof item.imageUrl === 'string' && /^data:image\/svg\+xml/i.test(item.imageUrl.trim())
        ? { ...item, imageUrl: '' }
        : item,
    );
  }
  const cleanSections = (list) =>
    Array.isArray(list)
      ? list.map((sec) => {
          if (!sec || typeof sec !== 'object' || !sec.config || typeof sec.config !== 'object') return sec;
          const nextCfg = { ...sec.config };
          if (typeof nextCfg.imageUrl === 'string' && /^data:image\/svg\+xml/i.test(nextCfg.imageUrl.trim())) {
            nextCfg.imageUrl = '';
          }
          if (Array.isArray(nextCfg.cards)) {
            nextCfg.cards = nextCfg.cards.map((c) =>
              c && typeof c === 'object' && typeof c.imageUrl === 'string' && /^data:image\/svg\+xml/i.test(c.imageUrl.trim())
                ? { ...c, imageUrl: '' }
                : c,
            );
          }
          return { ...sec, config: nextCfg };
        })
      : list;
  if (Array.isArray(cloned.sections)) cloned.sections = cleanSections(cloned.sections);
  if (Array.isArray(cloned.pages)) {
    cloned.pages = cloned.pages.map((p) => (p && typeof p === 'object' ? { ...p, sections: cleanSections(p.sections) } : p));
  }
  return cloned;
}

function sanitizeLegacyV8Config(value) {
  if (Array.isArray(value)) return value.map(sanitizeLegacyV8Config);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') {
      if (/^(?:href|ctaHref|url)$/i.test(k)) {
        out[k] = sanitizeSafeHref(v, '#');
      } else if (/^(?:imageUrl|logoUrl|heroImageUrl|heroBackgroundUrl|pageBackgroundUrl|storefrontPhotoUrl)$/i.test(k)) {
        out[k] = cleanImageUrlForIr(v);
      } else {
        out[k] = v;
      }
    } else {
      out[k] = sanitizeLegacyV8Config(v);
    }
  }
  return out;
}

function sanitizeLegacyV8Document(rawDoc, ApiError) {
  const cloned = JSON.parse(JSON.stringify(rawDoc));
  if (cloned.designTokens && typeof cloned.designTokens === 'object') {
    for (const colorKey of ['accent', 'accentDeep', 'surface', 'surfaceAlt', 'card', 'ink', 'inkMuted', 'footerBg', 'accentText']) {
      if (typeof cloned.designTokens[colorKey] === 'string') {
        cloned.designTokens[colorKey] = safeCssHex(cloned.designTokens[colorKey]);
      }
    }
  }
  if (cloned.themeTokens && typeof cloned.themeTokens === 'object') {
    for (const colorKey of ['accent', 'accentDeep', 'surface', 'surfaceAlt', 'card', 'ink', 'inkMuted', 'footerBg', 'accentText']) {
      if (typeof cloned.themeTokens[colorKey] === 'string') {
        cloned.themeTokens[colorKey] = safeCssHex(cloned.themeTokens[colorKey]);
      }
    }
  }
  for (const page of cloned.pages || []) {
    const fn = String(page?.filename || '').replace(/^\/+/, '');
    if (!fn || fn.includes('..') || fn.includes('\\') || !/^[a-z0-9._/-]+\.html$/i.test(fn)) {
      throw new ApiError(400, `Filename inválido na página: ${page?.filename || ''}`);
    }
    page.filename = fn;
    page.blocks = Array.isArray(page.blocks)
      ? page.blocks.map((blk) => ({
          ...blk,
          ...(blk?.config && typeof blk.config === 'object' ? { config: sanitizeLegacyV8Config(blk.config) } : {}),
        }))
      : [];
  }
  if (Array.isArray(cloned.catalog)) {
    cloned.catalog = cloned.catalog.map((item) =>
      item && typeof item === 'object'
        ? {
            ...item,
            ...(typeof item.href === 'string' ? { href: sanitizeSafeHref(item.href, '#catalogo') } : {}),
            ...(typeof item.url === 'string' ? { url: sanitizeSafeHref(item.url, '#catalogo') } : {}),
            ...(typeof item.imageUrl === 'string' ? { imageUrl: cleanImageUrlForIr(item.imageUrl) } : {}),
          }
        : item,
    );
  }
  return cloned;
}

function resolveBrandTokensForDoc(doc, brand, prevProfile) {
  const prevBrand = prevProfile?.brand || {};
  const hasPrev = Boolean(prevProfile && typeof prevProfile === 'object');
  const brandChanged =
    hasPrev &&
    (prevBrand.primaryColor !== brand.primaryColor ||
      prevBrand.accentColor !== brand.accentColor ||
      prevBrand.fontStyle !== brand.fontStyle);
  const accentOnlyChanged =
    hasPrev &&
    prevBrand.accentColor !== brand.accentColor &&
    prevBrand.primaryColor === brand.primaryColor &&
    brand.accentColor &&
    brand.accentColor !== '#10b981';

  const preferredHex = accentOnlyChanged
    ? brand.accentColor
    : (brand.primaryColor && brand.primaryColor !== '#111827' ? brand.primaryColor : '') ||
      (brand.accentColor && brand.accentColor !== '#10b981' ? brand.accentColor : '') ||
      doc?.designTokens?.accent ||
      '#0B4DB8';
  const preferredFont = brand.fontStyle || doc?.designTokens?.fontStyle || 'modern_sans';

  if (brandChanged || !doc?.designTokens) {
    return deriveThemeTokensFromHex(preferredHex, preferredFont);
  }
  return doc.designTokens;
}

function syncHeroImageOnSections(sections, cleanHeroImg, heroChanged) {
  if (!Array.isArray(sections)) return sections;
  return sections.map((sec) => {
    if (!sec || sec.type !== 'HeroSection') return sec;
    const cfg = { ...(sec.config || {}) };
    if (cleanHeroImg && (heroChanged || !cfg.imageUrl)) {
      cfg.imageUrl = cleanHeroImg;
    } else if (heroChanged && !cleanHeroImg) {
      cfg.imageUrl = '';
    }
    return { ...sec, config: cfg };
  });
}

function attachStoreSnapshotToDoc(doc, profile, prevProfile = null) {
  const business = profile?.business || {};
  const brand = profile?.brand || {};
  const payment = profile?.payment || {};
  const whatsapp = profile?.whatsapp || {};
  const prevBrand = prevProfile?.brand || {};
  const hasPrev = Boolean(prevProfile && typeof prevProfile === 'object');

  const activeCatalog = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products
        .filter((p) => p && p.active !== false)
        .map((p) => ({
          ...p,
          imageUrl: cleanImageUrlForIr(p.imageUrl),
        }))
    : [];

  const cleanLogo = cleanImageUrlForIr(brand.logoUrl);
  const cleanStorefront = cleanImageUrlForIr(brand.storefrontPhotoUrl);
  const cleanHero = cleanImageUrlForIr(brand.heroImageUrl);
  const heroChanged = hasPrev && prevBrand.heroImageUrl !== brand.heroImageUrl;
  const logoChanged = hasPrev && prevBrand.logoUrl !== brand.logoUrl;
  const storefrontChanged = hasPrev && prevBrand.storefrontPhotoUrl !== brand.storefrontPhotoUrl;

  const storeInfo = {
    name: String(business.name || doc?.storeInfo?.name || 'Minha Loja'),
    segment: String(business.segment || 'Geral'),
    businessModel: String(business.businessModel || 'hibrido'),
    description: String(business.description || ''),
    address: String(business.address || ''),
    hours: String(business.hours || ''),
    logoUrl: logoChanged ? cleanLogo : cleanLogo || cleanImageUrlForIr(doc?.storeInfo?.logoUrl),
    storefrontPhotoUrl: storefrontChanged
      ? cleanStorefront
      : cleanStorefront || cleanImageUrlForIr(doc?.storeInfo?.storefrontPhotoUrl),
    whatsappE164: String(whatsapp.phoneE164 || ''),
    pixDiscountPercent: Math.max(0, Math.min(90, Number(payment.pixDiscountPercent || 0))),
  };

  const isV9 = doc?.version === FORMULA_V9_VERSION || Array.isArray(doc?.sections);
  const nowIso = new Date().toISOString();
  if (!isV9) {
    return {
      ...doc,
      storeInfo,
      catalog: activeCatalog,
      updatedAt: nowIso,
    };
  }

  const nextDesignTokens = resolveBrandTokensForDoc(doc, brand, prevProfile);
  const syncedRootSections = syncHeroImageOnSections(doc.sections || [], cleanHero, heroChanged);
  const sanitizedRoot = sanitizeFormulaV9Document(
    {
      ...doc,
      designTokens: nextDesignTokens,
      sections: syncedRootSections,
      catalog: activeCatalog,
    },
    profile,
  );

  const sanitizedPages = Array.isArray(doc.pages)
    ? doc.pages.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const pageSections = syncHeroImageOnSections(p.sections || [], cleanHero, heroChanged);
        const sanitizedPageDoc = sanitizeFormulaV9Document(
          { ...doc, designTokens: nextDesignTokens, sections: pageSections },
          profile,
        );
        return {
          ...p,
          sections: sanitizedPageDoc.sections,
        };
      })
    : undefined;

  return {
    ...sanitizedRoot,
    ...(sanitizedPages ? { pages: sanitizedPages } : {}),
    storeInfo,
    catalog: activeCatalog,
    updatedAt: nowIso,
  };
}

function bindImageUrlToDoc(doc, job, assetUrl) {
  if (!doc || !assetUrl) return doc;
  const next = { ...doc };
  if (job.role === 'brand_logo') {
    next.storeInfo = { ...(next.storeInfo || {}), logoUrl: assetUrl };
  }
  next.sections = (next.sections || []).map((sec) => {
    const updatedSec = { ...sec, config: { ...(sec.config || {}) } };
    if (updatedSec.id === job.targetSectionId || updatedSec.imageSlotId === job.slotId) {
      if (updatedSec.type !== 'HighlightsGrid') {
        updatedSec.config.imageUrl = assetUrl;
      }
    }
    if (updatedSec.type === 'HighlightsGrid' && Array.isArray(updatedSec.config.cards)) {
      updatedSec.config.cards = updatedSec.config.cards.map((card) =>
        card?.imageSlotId === job.slotId ? { ...card, imageUrl: assetUrl } : card,
      );
    }
    return updatedSec;
  });
  return next;
}

export async function writeStorefrontMoldeToDisk({ directory, formulasIr, imageJobs }) {
  const moldeDir = getStorefrontMoldeDir(directory);
  await mkdir(path.join(moldeDir, 'pages'), { recursive: true });
  await mkdir(path.join(moldeDir, 'data'), { recursive: true });
  await mkdir(path.join(moldeDir, 'assets', 'generated'), { recursive: true });

  await atomicWriteText(path.join(moldeDir, 'data', 'formulas-ir.json'), JSON.stringify(formulasIr, null, 2));
  if (Array.isArray(imageJobs)) {
    await atomicWriteText(path.join(moldeDir, 'data', 'image-jobs.json'), JSON.stringify(imageJobs, null, 2));
  }
  const tokens = formulasIr?.designTokens || formulasIr?.themeTokens || {};
  await atomicWriteText(path.join(moldeDir, 'styles.css'), buildMoldeStylesCss(tokens));
  await atomicWriteText(path.join(moldeDir, 'app.js'), buildMoldeAppJs());

  const writtenFiles = ['data/formulas-ir.json', 'data/image-jobs.json', 'styles.css', 'app.js'];

  const homeSections = Array.isArray(formulasIr?.sections) ? formulasIr.sections : null;
  if (homeSections && homeSections.length > 0) {
    const homeHtml = renderMoldeHtmlPage({
      page: {
        filename: 'index.html',
        title: formulasIr?.storeInfo?.name || 'Vitrine',
        sections: homeSections,
      },
      formulasIr,
    });
    await atomicWriteText(path.join(moldeDir, 'index.html'), homeHtml);
    writtenFiles.push('index.html');
  }

  for (const page of formulasIr?.pages || []) {
    const cleanRel = String(page.filename || 'index.html').replace(/^\/+/, '');
    if (cleanRel.includes('..') || cleanRel.includes('\\') || !/^[a-z0-9._/-]+\.html$/i.test(cleanRel)) continue;
    if (cleanRel === 'index.html' && homeSections && homeSections.length > 0) continue;
    const target = path.resolve(moldeDir, cleanRel);
    if (!target.startsWith(path.resolve(moldeDir) + path.sep)) continue;
    await atomicWriteText(target, renderMoldeHtmlPage({ page, formulasIr }));
    writtenFiles.push(cleanRel);
  }

  if (isCloudStorageEnabled()) {
    const storageUid = path.basename(path.resolve(directory));
    if (storageUid && storageUid !== 'public-visitor') {
      void Promise.allSettled(
        writtenFiles.map(async (rel) => {
          const buf = await readFile(path.join(moldeDir, rel));
          await uploadStorefrontFileToStorage({
            userId: storageUid,
            relativePath: rel,
            bytes: buf,
          });
        }),
      );
    }
  }

  return { moldeDir, writtenFiles };
}

export async function syncStorefrontMoldeFromProfile({
  user: _user,
  directory,
  prevProfile = null,
  nextProfile = {},
  overrideIr = null,
} = {}) {
  if (!directory) return null;
  return serializeMoldeMutation(directory, async () => {
    const state = await readStorefrontMoldeState(directory);
    const hasExistingMolde = Boolean(state?.formulasIr);
    const hasProfileIr = Boolean(nextProfile?.storeLayout?.formulasIr);
    const isStoreActive = Boolean(
      nextProfile?.onboarding?.storeGenerated || nextProfile?.publishedStore?.published,
    );
    if (!hasExistingMolde && !hasProfileIr && !overrideIr && !isStoreActive) {
      return null;
    }

    const rawBase =
      overrideIr ||
      nextProfile?.storeLayout?.formulasIr ||
      state?.formulasIr ||
      buildNeutralFallbackV9Document(nextProfile);

    const syncedIr = attachStoreSnapshotToDoc(rawBase, nextProfile, prevProfile);
    await writeStorefrontMoldeToDisk({
      directory,
      formulasIr: syncedIr,
      imageJobs: Array.isArray(state?.imageJobs) ? state.imageJobs : [],
    });
    return syncedIr;
  });
}

export async function readStorefrontMoldeState(directory) {
  const moldeDir = getStorefrontMoldeDir(directory);
  let formulasIr = null;
  let imageJobs = [];
  let generatedAssets = [];
  try {
    formulasIr = JSON.parse(await readFile(path.join(moldeDir, 'data', 'formulas-ir.json'), 'utf8'));
  } catch {}
  try {
    imageJobs = JSON.parse(await readFile(path.join(moldeDir, 'data', 'image-jobs.json'), 'utf8'));
  } catch {}
  try {
    const entries = await readdir(path.join(moldeDir, 'assets', 'generated'));
    generatedAssets = entries.map((f) => `assets/generated/${f}`);
  } catch {}
  return { moldeDir, formulasIr, imageJobs, generatedAssets };
}

async function persistIrIntoProfile({
  user,
  directory,
  formulasIr,
  imageJobs,
  loadProfileState,
  saveProfileFn,
  forceOverwriteHero = false,
}) {
  if (typeof loadProfileState !== 'function' || typeof saveProfileFn !== 'function') return null;
  const { current } = await loadProfileState(user, directory);
  const baseData = current?.data && typeof current.data === 'object' ? JSON.parse(JSON.stringify(current.data)) : {};

  baseData.brand = baseData.brand || {};
  const heroJob = (imageJobs || []).find((j) => j.role === 'hero' && j.assetUrl);
  const logoJob = (imageJobs || []).find((j) => j.role === 'brand_logo' && j.assetUrl);
  if (heroJob?.assetUrl && (forceOverwriteHero || !baseData.brand.heroImageUrl)) {
    baseData.brand.heroImageUrl = heroJob.assetUrl;
  }
  if (forceOverwriteHero) {
    const editorialJob = (imageJobs || []).find((j) => j.role === 'lifestyle_banner' && j.assetUrl);
    baseData.brand.heroBackgroundUrl = editorialJob?.assetUrl || '';
  }
  if (logoJob?.assetUrl && !baseData.brand.logoUrl) {
    baseData.brand.logoUrl = logoJob.assetUrl;
  }

  // NUNCA reciclar imageUrl da Hero para SKUs do catálogo (produtos sem foto permanecem em cinza neutro)
  baseData.storeLayout = {
    ...(baseData.storeLayout || {}),
    formulasIr,
    updatedAt: new Date().toISOString(),
  };

  return saveProfileFn(user, directory, Number(current?.revision || 0), baseData, {
    preserveRevision: true,
  });
}

const STORE_MOLDE_JOBS = new Map();
const MAX_STORED_JOBS = 100;

function setStoreMoldeJobStage(clientJobId, stage, label, extra = {}) {
  const key = String(clientJobId || '').trim();
  if (!key) return;
  if (STORE_MOLDE_JOBS.size >= MAX_STORED_JOBS && !STORE_MOLDE_JOBS.has(key)) {
    const oldest = STORE_MOLDE_JOBS.keys().next().value;
    if (oldest) STORE_MOLDE_JOBS.delete(oldest);
  }
  STORE_MOLDE_JOBS.set(key, {
    jobId: key,
    stage,
    label,
    updatedAt: new Date().toISOString(),
    ...extra,
  });
}

export async function generateFullStorefrontMolde({
  user,
  directory,
  profile,
  useGlm = true,
  generateImages = true,
  maxImages = 5,
  chargeCredits = true,
  clientJobId = '',
  root = '',
  readJsonFile,
  atomicWriteJson,
  loadProfileState,
  saveProfileFn,
} = {}) {
  setStoreMoldeJobStage(clientJobId, 'reading_catalog', 'Lendo catálogo');
  let creditResult = null;
  if (chargeCredits) {
    creditResult = await debitCredits({
      user,
      directory,
      action: 'generate_full_storefront',
      amount: CREDIT_ACTION_COSTS.generate_full_storefront,
      metadata: {
        version: FORMULA_V9_VERSION,
        phase: 'reserve',
      },
      readJsonFile,
      atomicWriteJson,
    });
    if (!creditResult.ok) {
      setStoreMoldeJobStage(clientJobId, 'error', 'Créditos insuficientes', { status: 402 });
      void recordSystemIncident({
        root,
        type: 'credit_blocked_402',
        userId: user?.id,
        detail: 'generate_full_storefront bloqueado por saldo insuficiente',
        readJsonFile,
        atomicWriteJson,
      });
      return creditResult;
    }
  }

  try {
    let doc = null;
    let generatedBy = 'neutral-v9-fallback';
    let modelUsed = 'structural-fallback';

    let glmAttemptedAndFailed = false;
    setStoreMoldeJobStage(clientJobId, 'designing_experience', 'Desenhando experiência');
    if (useGlm) {
      const storeIdentityId =
        profile?.brand?.storeIdentityId ||
        computeStoreIdentityId({
          slug: profile?.publishedStore?.slug || profile?.business?.name || '',
          niche: profile?.business?.segment || '',
          name: profile?.business?.name || '',
        });
      const allProds = Array.isArray(profile?.catalog?.products) ? profile.catalog.products : [];
      const catStats = new Map();
      for (const p of allProds) {
        const cat = String(p?.category || 'Geral').trim() || 'Geral';
        const price = Number(p?.priceCents || 0) / 100;
        const cur = catStats.get(cat) || { count: 0, min: price, max: price, sample: [] };
        cur.count += 1;
        if (price > 0) {
          cur.min = cur.min > 0 ? Math.min(cur.min, price) : price;
          cur.max = Math.max(cur.max, price);
        }
        if (cur.sample.length < 2 && p?.name) cur.sample.push(p.name);
        catStats.set(cat, cur);
      }
      const categorySummary = Array.from(catStats.entries())
        .map(([cat, st]) => `${cat} (${st.count} itens, R$ ${st.min.toFixed(2)}–R$ ${st.max.toFixed(2)}; ex: ${st.sample.join(', ')})`)
        .join(' | ');
      const instaHandle = String(profile?.brand?.instagram || profile?.business?.instagram || '').trim();
      const bizDesc = String(profile?.business?.description || '').trim();
      const comboPrompt = [
        `Loja: "${profile?.business?.name || 'Loja'}", Ramo: "${profile?.business?.segment || 'Geral'}"${instaHandle ? `, Instagram: "${instaHandle}"` : ''}.`,
        bizDesc ? `Contexto/Bio: "${bizDesc.slice(0, 280)}".` : '',
        categorySummary ? `Categorias do catálogo (${allProds.length} SKUs): ${categorySummary}.` : '',
        `Escolha 1 combinação da matriz:`,
        `heroVariant: ${EXPERIENCE_MATRIX.heroVariants.join('|')}`,
        `cardVariant: ${EXPERIENCE_MATRIX.cardVariants.join('|')}`,
        `rhythm: ${EXPERIENCE_MATRIX.rhythmVariants.join('|')}`,
        `Responda APENAS JSON válido PT-BR compacto que represente TODAS as categorias principais da loja:`,
        `{"experienceCombo":{"heroVariant":"...","cardVariant":"...","rhythm":"..."},"hero":{"eyebrow":"...","title":"...","subtitle":"...","ctaLabel":"..."},"differentials":[{"title":"...","text":"..."},{"title":"...","text":"..."},{"title":"...","text":"..."}],"closingTitle":"...","closingSubtitle":"..."}`,
      ].filter(Boolean).join('\n');

      const glmRes = await callGlm53Json({
        systemPrompt: 'Arquiteto de vitrines e-commerce PT-BR. Responda apenas JSON válido e conciso.',
        userPrompt: comboPrompt,
        maxTokens: 900,
        timeoutMs: 35000,
      });
      if (glmRes.ok && glmRes.data) {
        const baseDoc = buildNeutralFallbackV9Document(profile);
        const combo = pickExperienceCombo(storeIdentityId, glmRes.data.experienceCombo || {});
        const d = glmRes.data;
        const mergedSections = baseDoc.sections.map((sec) => {
          if (sec.type === 'HeroSection' && d.hero) {
            return {
              ...sec,
              config: {
                ...sec.config,
                eyebrow: String(d.hero.eyebrow || sec.config.eyebrow).slice(0, 60),
                title: String(d.hero.title || sec.config.title).slice(0, 90),
                subtitle: String(d.hero.subtitle || sec.config.subtitle).slice(0, 180),
                primaryCta: {
                  ...sec.config.primaryCta,
                  label: String(d.hero.ctaLabel || sec.config.primaryCta?.label || 'Ver catálogo').slice(0, 36),
                },
              },
            };
          }
          if (sec.type === 'DifferentialsStrip' && Array.isArray(d.differentials) && d.differentials.length >= 2) {
            return {
              ...sec,
              config: {
                items: d.differentials.slice(0, 3).map((item, idx) => ({
                  icon: sec.config.items?.[idx]?.icon || 'sparkles',
                  title: String(item?.title || 'Diferencial').slice(0, 50),
                  text: String(item?.text || '').slice(0, 120),
                })),
              },
            };
          }
          if (sec.type === 'ClosingScheduleSplit' && (d.closingTitle || d.closingSubtitle)) {
            return {
              ...sec,
              config: {
                ...sec.config,
                title: String(d.closingTitle || sec.config.title).slice(0, 90),
                subtitle: String(d.closingSubtitle || sec.config.subtitle).slice(0, 180),
              },
            };
          }
          return sec;
        });

        const sanitized = sanitizeFormulaV9Document(
          {
            ...baseDoc,
            storeIdentityId,
            experienceCombo: combo,
            sections: mergedSections,
            generatedBy: 'glm-combinatorial-v9',
            modelUsed: glmRes.model || 'zai-org/GLM-5.3',
          },
          profile,
        );
        if (sanitized.sections.length >= 4) {
          doc = sanitized;
          generatedBy = 'glm-combinatorial-v9';
          modelUsed = glmRes.model || 'zai-org/GLM-5.3';
        } else {
          glmAttemptedAndFailed = true;
        }
      } else if (glmRes.error && glmRes.error !== 'GLM_NOT_CONFIGURED') {
        glmAttemptedAndFailed = true;
      }
    }

    if (!doc) {
      doc = buildNeutralFallbackV9Document(profile);
    }

    doc = attachStoreSnapshotToDoc(doc, profile);

    const moldeDir = getStorefrontMoldeDir(directory);
    await mkdir(path.join(moldeDir, 'assets', 'generated'), { recursive: true });
    // Remove artefatos antigos v8.2 antes de gerar v9.0 (mantendo uploads reais brand_logo / storefront_front)
    for (const stale of [
      'assets/generated/s02_hero.png',
      'assets/generated/s03_thumb.png',
      'assets/generated/s04_banner.png',
      'assets/generated/s05_feat.png',
      'assets/generated/s06_map.png',
      'pages/rotina.html',
      'pages/catalogo.html',
      'pages/contato.html',
    ]) {
      await rm(path.join(moldeDir, stale), { force: true }).catch(() => {});
    }

    const imageJobs = Array.isArray(doc.imagePlan) ? doc.imagePlan.slice(0, Math.min(5, Math.max(0, maxImages))) : [];
    const apiKey = String(process.env.IMAGE_API_KEY || process.env.GLM_API_KEY || '').trim();

    if (generateImages && imageJobs.length > 0 && apiKey) {
      setStoreMoldeJobStage(clientJobId, 'generating_images', 'Criando fotos');
      for (let i = 0; i < imageJobs.length; i += 3) {
        const chunk = imageJobs.slice(i, i + 3);
        await Promise.all(
          chunk.map(async (job) => {
            try {
              const dims = dimensionsForAspect(job.aspect);
              const runpodKind = job.tier === 'flux-dev' ? 'hero_dev' : 'schnell';
              const generated = await generateRunPodImage({
                prompt: job.promptEn,
                artDirectionBible: doc.artDirectionBible,
                kind: runpodKind,
                width: dims.width,
                height: dims.height,
                timeoutMs: 90000,
              });
              const ext = generated.ext || 'webp';
              const fileName = `${job.slotId}.${ext}`;
              const relPath = `assets/generated/${fileName}`;
              await atomicWriteBuffer(path.join(moldeDir, relPath), generated.buffer);
              job.filename = fileName;
              job.relativePath = relPath;
              job.assetUrl = `/api/store-molde/${encodeURIComponent(user.id)}/${relPath}`;
              job.status = 'completed';
              job.modelUsed = generated.model;
              job.elapsedMs = generated.elapsedMs;
              doc = bindImageUrlToDoc(doc, job, job.assetUrl);
            } catch (err) {
              job.status = 'error';
              job.error = err instanceof Error ? err.message : 'IMAGE_ERR';
            }
          }),
        );
      }
    }

    doc.imagePlan = imageJobs;
    setStoreMoldeJobStage(clientJobId, 'publishing', 'Publicando página');

    const { writtenFiles } = await serializeMoldeMutation(directory, async () => {
      const writeRes = await writeStorefrontMoldeToDisk({
        directory,
        formulasIr: doc,
        imageJobs,
      });
      await persistIrIntoProfile({
        user,
        directory,
        formulasIr: doc,
        imageJobs,
        loadProfileState,
        saveProfileFn,
        forceOverwriteHero: true,
      }).catch(() => null);
      return writeRes;
    });

    let debitedAmount = creditResult?.debited || 0;
    let finalBalanceAfter =
      creditResult?.balanceAfter ?? (await getCreditBalance({ user, bearer: user?.bearer, directory, readJsonFile }));
    if (chargeCredits && creditResult?.ok && glmAttemptedAndFailed && generatedBy !== 'glm-architect-v9') {
      const refundRes = await refundCredits({
        user,
        directory,
        action: 'generate_full_storefront',
        amount: CREDIT_ACTION_COSTS.generate_full_storefront,
        metadata: {
          reason: 'glm_fallback_no_charge',
          referenceId: creditResult?.entry?.id,
        },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => null);
      if (refundRes?.ok) {
        debitedAmount = 0;
        finalBalanceAfter = refundRes.balanceAfter ?? finalBalanceAfter;
      }
      void recordSystemIncident({
        root,
        type: 'glm_fallback_triggered',
        userId: user?.id,
        detail: `generateFullStorefrontMolde caiu em structural-fallback e estornou ${CREDIT_ACTION_COSTS.generate_full_storefront} cr`,
        readJsonFile,
        atomicWriteJson,
      });
    }

    setStoreMoldeJobStage(clientJobId, 'completed', 'Página no ar', {
      modelUsed,
      generatedBy,
    });

    return {
      ok: true,
      formulasIr: doc,
      imageJobs,
      writtenFiles,
      debited: debitedAmount,
      creditsCharged: debitedAmount,
      balanceAfter: finalBalanceAfter,
      modelUsed,
      generatedBy,
    };
  } catch (err) {
    if (chargeCredits && creditResult?.ok) {
      await refundCredits({
        user,
        directory,
        action: 'generate_full_storefront',
        amount: 30,
        metadata: {
          reason: err instanceof Error ? err.message : 'generation_failed',
          referenceId: creditResult?.entry?.id,
        },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
    }
    throw err;
  }
}

function slugifyTitle(title, fallback = 'pagina') {
  return (
    String(title || fallback)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

const AUTOFILL_RATE_MAP = new Map();
function checkAutofillRateLimit(bucketKey) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxAttempts = 10;
  if (AUTOFILL_RATE_MAP.size > 500) {
    for (const [k, v] of AUTOFILL_RATE_MAP.entries()) {
      if (v.resetAt <= now) AUTOFILL_RATE_MAP.delete(k);
    }
  }
  const entry = AUTOFILL_RATE_MAP.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count += 1;
  }
  AUTOFILL_RATE_MAP.set(bucketKey, entry);
  return {
    allowed: entry.count <= maxAttempts,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export async function handleStorefrontMoldeRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const { user, root = '', directory, readJson, send, ApiError, readJsonFile, atomicWriteJson, loadProfileState, saveProfileState } = ctx;

  // 0. GET /api/store-molde/job/:clientJobId (Progresso em 4 etapas da criacao)
  if (pathname.startsWith('/api/store-molde/job/')) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const clientJobId = decodeURIComponent(pathname.slice('/api/store-molde/job/'.length)).trim();
    const job = STORE_MOLDE_JOBS.get(clientJobId) || {
      jobId: clientJobId,
      stage: 'reading_catalog',
      label: 'Lendo catálogo',
    };
    return send(res, 200, { ok: true, job });
  }

  // 0b. POST /api/onboarding/ai-autofill (0 cr — preenchimento inicial por GLM ou fallback neutro)
  if (pathname === '/api/onboarding/ai-autofill') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const clientIp = req.socket?.remoteAddress || '127.0.0.1';
    const rate = checkAutofillRateLimit(`autofill:${user?.id || 'anon'}:${clientIp}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      throw new ApiError(429, `Muitas solicitações. Aguarde ${rate.retryAfterSeconds} segundos.`);
    }
    const body = await readJson(req, 512 * 1024);
    const businessName = String(body?.businessName || '').trim().slice(0, 80);
    const segment = String(body?.segment || 'Geral').trim().slice(0, 60) || 'Geral';
    const productsSample = Array.isArray(body?.productsSample) ? body.productsSample.slice(0, 8) : [];

    const fallback = buildDeterministicOnboardingAutofill({ businessName, segment, productsSample });
    const { systemPrompt, userPrompt } = buildOnboardingAutofillMessages({
      businessName,
      segment,
      productsSample,
    });
    const glmRes = await callGlm53Json({
      systemPrompt,
      userPrompt,
      maxTokens: 220,
      timeoutMs: 12000,
      enableThinking: false,
    });

    let suggestion = fallback;
    let modelUsed = 'deterministic-autofill';
    if (glmRes.ok && glmRes.data && typeof glmRes.data === 'object') {
      const d = glmRes.data;
      const allowedModels = new Set(['produtos', 'servicos', 'hibrido']);
      const allowedActions = new Set(['cart_add', 'schedule_slot', 'kit_builder', 'quote_request']);
      const allowedColors = new Set(['#0B4DB8', '#2F6F4E', '#B4532A', '#0F172A', '#6D28D9', '#CA8A04']);
      const allowedFonts = new Set(['modern_sans', 'editorial_serif', 'clean_geometric']);
      const allowedTones = new Set(['proximo', 'formal', 'direto']);
      suggestion = {
        businessModel: allowedModels.has(d.businessModel) ? d.businessModel : fallback.businessModel,
        businessDescription:
          typeof d.businessDescription === 'string' && d.businessDescription.trim()
            ? d.businessDescription.trim().slice(0, 180)
            : fallback.businessDescription,
        differentials:
          Array.isArray(d.differentials) && d.differentials.length > 0
            ? d.differentials.map((x) => String(x || '').trim().slice(0, 45)).filter(Boolean).slice(0, 3)
            : fallback.differentials,
        conversionAction: allowedActions.has(d.conversionAction) ? d.conversionAction : fallback.conversionAction,
        experienceGoal:
          typeof d.experienceGoal === 'string' && d.experienceGoal.trim()
            ? d.experienceGoal.trim().slice(0, 140)
            : fallback.experienceGoal,
        activeFilters:
          Array.isArray(d.activeFilters) && d.activeFilters.length > 0
            ? d.activeFilters.map((x) => String(x || '').trim().slice(0, 24)).filter(Boolean).slice(0, 3)
            : fallback.activeFilters,
        primaryColor: allowedColors.has(d.primaryColor) ? d.primaryColor : fallback.primaryColor,
        fontStyle: allowedFonts.has(d.fontStyle) ? d.fontStyle : fallback.fontStyle,
        sofiaTone: allowedTones.has(d.sofiaTone) ? d.sofiaTone : fallback.sofiaTone,
        sofiaRules:
          Array.isArray(d.sofiaRules) && d.sofiaRules.length > 0
            ? d.sofiaRules.map((x) => String(x || '').trim().slice(0, 90)).filter(Boolean).slice(0, 3)
            : fallback.sofiaRules,
      };
      modelUsed = glmRes.model || 'zai-org/GLM-5.3';
    }

    return send(res, 200, {
      ok: true,
      suggestion,
      modelUsed,
      creditsCharged: 0,
    });
  }

  // 1. GET /api/store-molde/state
  if (pathname === '/api/store-molde/state') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const state = await readStorefrontMoldeState(directory);
    const balance = await getCreditBalance({ user, bearer: user?.bearer, directory, readJsonFile });
    return send(res, 200, {
      ok: true,
      formulasIr: state.formulasIr,
      imageJobs: state.imageJobs,
      generatedAssets: state.generatedAssets,
      balance,
    });
  }

  // 2. POST /api/store-molde/generate-full (-30 cr)
  if (pathname === '/api/store-molde/generate-full') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 2 * 1024 * 1024);
    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const result = await generateFullStorefrontMolde({
      user,
      root,
      directory,
      profile,
      useGlm: body?.useGlm !== false,
      generateImages: body?.generateImages !== false,
      maxImages: Number.isFinite(Number(body?.maxImages)) ? Number(body.maxImages) : 5,
      chargeCredits: true,
      clientJobId: String(body?.clientJobId || ''),
      readJsonFile,
      atomicWriteJson,
      loadProfileState,
      saveProfileFn: saveProfileState,
    });
    if (!result.ok && result.status === 402) {
      return send(res, 402, result);
    }
    return send(res, 200, result);
  }

  // 3. POST /api/store-molde/create-page (-2 cr · subpage_full_architect)
  if (pathname === '/api/store-molde/create-page') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 1024 * 1024);

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const pageTitle = String(body?.title || 'Coleção Especial').trim().slice(0, 60);
    const slug = slugifyTitle(body?.slug || pageTitle);
    const pagePrompt = String(body?.prompt || `Subpágina ${pageTitle} para ${profile?.business?.name || 'a loja'}.`).trim();
    const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey).slice(0, 120) : undefined;

    const debit = await debitCredits({
      user,
      directory,
      action: 'create_subpage',
      amount: CREDIT_ACTION_COSTS.create_subpage,
      idempotencyKey,
      metadata: { pageFilename: `pages/${slug}.html`, pageTitle, phase: 'reserve' },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debit.ok) return send(res, 402, debit);

    try {
      let heroSubtitle = pagePrompt.slice(0, 180);
      let heroTitle = pageTitle;
      let seoTitle = `${pageTitle} · ${profile?.business?.name || 'Loja'}`;
      let seoDescription = pagePrompt.slice(0, 155);
      let benefitsList = [
        { icon: 'sparkles', title: 'Seleção Exclusiva', text: 'Itens escolhidos para esta campanha.' },
        { icon: 'shield', title: 'Atendimento Direto', text: 'Tire dúvidas e finalize pelo WhatsApp.' },
        { icon: 'truck', title: 'Entrega ou Retirada', text: 'Combinamos a melhor opção para você.' },
      ];
      if (body?.useGlm !== false) {
        const glm = await callGlm53Json({
          systemPrompt: 'Responda apenas JSON válido PT-BR para arquitetar subpágina completa de loja.',
          userPrompt: `Loja: ${profile?.business?.name || 'Loja'}. Subpágina: "${pageTitle}". Pedido: "${pagePrompt}". JSON: {"heroTitle":"...","heroSubtitle":"...","seoTitle":"...","seoDescription":"...","benefits":[{"title":"...","text":"..."}]}`,
          timeoutMs: 25000,
        });
        if (glm.ok && glm.data) {
          if (glm.data.heroTitle) heroTitle = String(glm.data.heroTitle).slice(0, 90);
          if (glm.data.heroSubtitle) heroSubtitle = String(glm.data.heroSubtitle).slice(0, 180);
          if (glm.data.seoTitle) seoTitle = String(glm.data.seoTitle).slice(0, 80);
          if (glm.data.seoDescription) seoDescription = String(glm.data.seoDescription).slice(0, 160);
          if (Array.isArray(glm.data.benefits) && glm.data.benefits.length >= 2) {
            benefitsList = glm.data.benefits.slice(0, 3).map((b) => ({
              icon: 'sparkles',
              title: String(b?.title || 'Destaque').slice(0, 50),
              text: String(b?.text || '').slice(0, 120),
            }));
          }
        }
      }

      const storeIdentityId =
        profile?.brand?.storeIdentityId ||
        computeStoreIdentityId({
          slug: profile?.publishedStore?.slug || slug,
          niche: profile?.business?.segment || '',
          name: profile?.business?.name || '',
        });
      const combo = pickExperienceCombo(storeIdentityId);

      const newPage = {
        id: `page_${slug}`,
        slug,
        filename: `pages/${slug}.html`,
        title: pageTitle,
        seoTitle,
        seoDescription,
        storeIdentityId,
        experienceCombo: combo,
        isHome: false,
        sections: [
          {
            id: `sec_hero_${slug}`,
            type: 'HeroSection',
            config: {
              variant: 'split',
              eyebrow: pageTitle,
              title: heroTitle,
              subtitle: heroSubtitle,
              primaryCta: { label: 'Explorar catálogo', href: '#catalogo' },
            },
          },
          {
            id: `sec_diff_${slug}`,
            type: 'DifferentialsStrip',
            config: { items: benefitsList },
          },
          {
            id: `sec_cat_${slug}`,
            type: 'CatalogGrid',
            config: {
              title: pageTitle,
              subtitle: 'Itens disponíveis nesta seleção.',
              itemActionLabel: 'Adicionar à sacola',
              emptyImageMode: 'neutral_gray',
            },
          },
        ],
      };

      const nextIr = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
        const existingPages = Array.isArray(formulasIr.pages) ? formulasIr.pages.filter((p) => p.filename !== newPage.filename) : [];
        const nextPages = [...existingPages, newPage];
        const updatedIr = attachStoreSnapshotToDoc({ ...formulasIr, pages: nextPages, updatedAt: new Date().toISOString() }, profile);

        await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
        await persistIrIntoProfile({
          user,
          directory,
          formulasIr: updatedIr,
          imageJobs: state.imageJobs,
          loadProfileState,
          saveProfileFn: saveProfileState,
        }).catch(() => null);
        return updatedIr;
      });

      return send(res, 200, {
        ok: true,
        page: newPage,
        formulasIr: nextIr,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } catch (err) {
      await refundCredits({
        user,
        directory,
        action: 'create_subpage',
        amount: debit.debited || CREDIT_ACTION_COSTS.create_subpage,
        metadata: { pageFilename: `pages/${slug}.html`, reason: err instanceof Error ? err.message : 'create_page_failed', referenceId: debit?.entry?.id },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
      throw err;
    }
  }

  // 4. POST /api/store-molde/edit-block (-3 cr) — supports v9.0 sections[] and pageFilename
  if (pathname === '/api/store-molde/edit-block') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 1024 * 1024);

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const mode = body?.mode === 'add' ? 'add' : 'edit';
    const sectionType = String(body?.sectionType || body?.blockType || 'HighlightsGrid');
    const instruction = String(body?.instruction || '').trim();
    const targetId = String(body?.sectionId || body?.blockId || '');
    const pageFilename = String(body?.pageFilename || '').trim().replace(/^\/+/, '');
    if (pageFilename && (pageFilename.includes('..') || pageFilename.includes('\\'))) {
      throw new ApiError(400, 'pageFilename inválido.');
    }
    const isSubpage = Boolean(pageFilename && pageFilename !== 'index.html');

    const debit = await debitCredits({
      user,
      directory,
      action: 'edit_block',
      amount: 3,
      metadata: { mode, sectionType, targetId, pageFilename: pageFilename || 'index.html', phase: 'reserve' },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debit.ok) return send(res, 402, debit);

    try {
      const stateSnapshot = await readStorefrontMoldeState(directory);
      const baseIr = stateSnapshot.formulasIr || buildNeutralFallbackV9Document(profile);
      const targetPageSnapshot = isSubpage
        ? (Array.isArray(baseIr.pages) ? baseIr.pages.find((p) => p?.filename === pageFilename) : null)
        : null;
      if (isSubpage && !targetPageSnapshot) {
        throw new ApiError(404, 'Página não encontrada nesta loja.');
      }
      const baseSections = isSubpage
        ? Array.isArray(targetPageSnapshot.sections)
          ? [...targetPageSnapshot.sections]
          : []
        : Array.isArray(baseIr.sections)
          ? [...baseIr.sections]
          : [];

      let glmResult = null;
      let existingBeforeEdit = null;
      if (mode === 'add') {
        if (instruction && body?.useGlm !== false) {
          glmResult = await callGlm53Json({
            systemPrompt: 'Responda JSON curto PT-BR com título e subtítulo fiéis ao pedido.',
            userPrompt: `Loja: ${profile?.business?.name || 'Loja'}. Seção: ${sectionType}. Pedido: "${instruction}". JSON: {"title":"...","subtitle":"..."}`,
            timeoutMs: 20000,
          });
        }
      } else {
        const sIdx = baseSections.findIndex((s) => s.id === targetId);
        if (sIdx < 0) throw new ApiError(404, 'Seção não encontrada nesta página.');
        existingBeforeEdit = baseSections[sIdx];
        if (instruction && body?.useGlm !== false) {
          glmResult = await callGlm53Json({
            systemPrompt: 'Ajuste título e subtítulo da seção em JSON PT-BR sem alterar preços.',
            userPrompt: `Seção: ${existingBeforeEdit.type}. Título atual: "${existingBeforeEdit.config?.title || ''}". Pedido: "${instruction}". JSON: {"title":"...","subtitle":"..."}`,
            timeoutMs: 20000,
          });
        }
      }

      const { resultingSection, nextIr } = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
        const pagesList = Array.isArray(formulasIr.pages) ? formulasIr.pages.map((p) => ({ ...p })) : [];
        const pageIdx = isSubpage ? pagesList.findIndex((p) => p?.filename === pageFilename) : -1;
        if (isSubpage && pageIdx < 0) throw new ApiError(404, 'Página não encontrada nesta loja.');
        const sections = isSubpage
          ? Array.isArray(pagesList[pageIdx].sections)
            ? [...pagesList[pageIdx].sections]
            : []
          : Array.isArray(formulasIr.sections)
            ? [...formulasIr.sections]
            : [];

        let updatedSection = null;
        if (mode === 'add') {
          const cfg = body?.config && typeof body.config === 'object' ? { ...body.config } : {};
          let title = String(cfg.title || 'Nova seção').slice(0, 90);
          let subtitle = String(cfg.subtitle || instruction || '').slice(0, 180);
          if (glmResult?.ok && glmResult.data) {
            if (glmResult.data.title) title = String(glmResult.data.title).slice(0, 90);
            if (glmResult.data.subtitle) subtitle = String(glmResult.data.subtitle).slice(0, 180);
          }

          const candidate =
            sectionType === 'FaqAccordion' || sectionType === 'ContextualFaq'
              ? {
                  id: `sec_faq_${Date.now().toString(36)}`,
                  type: sectionType === 'ContextualFaq' ? 'ContextualFaq' : 'FaqAccordion',
                  config: {
                    title,
                    ...(sectionType === 'ContextualFaq' ? { subtitle } : {}),
                    items: cfg.items || [{ q: subtitle || 'Como funciona o atendimento?', a: 'Envie sua dúvida direta pelo WhatsApp.' }],
                  },
                }
              : sectionType === 'ComplementaryBundles'
                ? {
                    id: `sec_bundles_${Date.now().toString(36)}`,
                    type: 'ComplementaryBundles',
                    config: {
                      title: title || 'Combine e Economize',
                      subtitle: subtitle || 'Seleções do catálogo prontas para adicionar juntas.',
                      items:
                        Array.isArray(cfg.items) && cfg.items.length > 0
                          ? cfg.items
                          : [
                              {
                                id: 'combo_1',
                                title: 'Combo Recomendado',
                                description: 'Seleção completa da loja.',
                                skuIds: (profile?.catalog?.products || [])
                                  .filter((p) => p && p.active !== false)
                                  .slice(0, 2)
                                  .map((p) => String(p.sku || p.id)),
                                totalCents: 0,
                              },
                            ],
                    },
                  }
                : {
                    id: `sec_${sectionType.toLowerCase()}_${Date.now().toString(36)}`,
                    type: sectionType === 'EditorialMediaSplit' ? 'EditorialMediaSplit' : 'HighlightsGrid',
                    config:
                      sectionType === 'EditorialMediaSplit'
                        ? {
                            variant: 'media_right',
                            eyebrow: 'Destaque',
                            title,
                            body: subtitle || title,
                            bullets: [],
                          }
                        : {
                            title,
                            subtitle,
                            columns: 2,
                            cards: cfg.cards || [{ eyebrow: 'Destaque', title, description: subtitle, ctaLabel: 'Ver catálogo', href: '#catalogo' }],
                          },
                  };

          const sanitizedDoc = sanitizeFormulaV9Document({ ...formulasIr, sections: [candidate] }, profile);
          const checkNode = SectionNodeSchema.safeParse(sanitizedDoc.sections[0] || candidate);
          if (!checkNode.success) {
            throw new ApiError(400, checkNode.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' '));
          }
          updatedSection = checkNode.data;
          const footerIdx = sections.findIndex((s) => s.type === 'RichFooter');
          if (footerIdx >= 0) sections.splice(footerIdx, 0, updatedSection);
          else sections.push(updatedSection);
        } else {
          const sIdx = sections.findIndex((s) => s.id === targetId);
          if (sIdx < 0) throw new ApiError(404, 'Seção não encontrada nesta página.');
          const existing = { ...sections[sIdx], config: { ...(sections[sIdx].config || {}) } };
          if (instruction && body?.useGlm !== false) {
            if (glmResult?.ok && glmResult.data) {
              if (glmResult.data.title) existing.config.title = String(glmResult.data.title).slice(0, 90);
              if (glmResult.data.subtitle) existing.config.subtitle = String(glmResult.data.subtitle).slice(0, 180);
            } else if ('subtitle' in existing.config) {
              existing.config.subtitle = instruction.slice(0, 180);
            }
          } else if (body?.config && typeof body.config === 'object') {
            existing.config = { ...existing.config, ...body.config };
          }
          const sanitizedDoc = sanitizeFormulaV9Document({ ...formulasIr, sections: [existing] }, profile);
          const checkNode = SectionNodeSchema.safeParse(sanitizedDoc.sections[0] || existing);
          if (!checkNode.success) {
            throw new ApiError(400, checkNode.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' '));
          }
          updatedSection = checkNode.data;
          sections[sIdx] = updatedSection;
        }

        const nextDocBase = isSubpage
          ? {
              ...formulasIr,
              pages: pagesList.map((p, idx) => (idx === pageIdx ? { ...p, sections } : p)),
              updatedAt: new Date().toISOString(),
            }
          : { ...formulasIr, sections, updatedAt: new Date().toISOString() };

        const updatedIr = attachStoreSnapshotToDoc(nextDocBase, profile);
        await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
        await persistIrIntoProfile({
          user,
          directory,
          formulasIr: updatedIr,
          imageJobs: state.imageJobs,
          loadProfileState,
          saveProfileFn: saveProfileState,
        }).catch(() => null);

        return { resultingSection: updatedSection, nextIr: updatedIr };
      });

      return send(res, 200, {
        ok: true,
        section: resultingSection,
        block: resultingSection,
        formulasIr: nextIr,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } catch (err) {
      await refundCredits({
        user,
        directory,
        action: 'edit_block',
        amount: 3,
        metadata: { mode, sectionType, targetId, reason: err instanceof Error ? err.message : 'edit_block_failed', referenceId: debit?.entry?.id },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
      throw err;
    }
  }

  // 4b. POST /api/store-molde/patch-section (-5 cr — Patch Cirúrgico isolado na seção alvo + Design Critic)
  if (pathname === '/api/store-molde/patch-section') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 1024 * 1024);

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const targetId = String(body?.sectionId || body?.blockId || '').trim();
    const instruction = String(body?.instruction || '').trim();
    const experienceMode = body?.experienceMode;
    const cost = Math.max(1, Math.min(20, Math.round(Number(body?.costCredits ?? 5))));
    const pageFilename = String(body?.pageFilename || '').trim().replace(/^\/+/, '');
    if (pageFilename && (pageFilename.includes('..') || pageFilename.includes('\\'))) {
      throw new ApiError(400, 'pageFilename inválido.');
    }
    if (!targetId) {
      throw new ApiError(400, 'Informe a seção que deseja ajustar.');
    }
    if (!instruction && !experienceMode && !body?.config) {
      throw new ApiError(400, 'Descreva o ajuste desejado para esta seção.');
    }

    const isSubpage = Boolean(pageFilename && pageFilename !== 'index.html');
    const debit = await debitCredits({
      user,
      bearer: user?.bearer,
      directory,
      action: 'patch_section',
      amount: cost,
      metadata: {
        sectionId: targetId,
        instruction: instruction.slice(0, 120),
        pageFilename: pageFilename || 'index.html',
        phase: 'reserve',
      },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debit.ok) return send(res, 402, debit);

    try {
      if (body?.simulateGlmFailure === true) {
        throw new Error('O motor visual IA não respondeu a tempo (timeout simulado).');
      }

      const stateSnapshot = await readStorefrontMoldeState(directory);
      const baseIr = stateSnapshot.formulasIr || buildNeutralFallbackV9Document(profile);
      const baseSections = isSubpage
        ? Array.isArray(baseIr.pages?.find((p) => p?.filename === pageFilename)?.sections)
          ? [...baseIr.pages.find((p) => p?.filename === pageFilename).sections]
          : []
        : Array.isArray(baseIr.sections)
          ? [...baseIr.sections]
          : [];

      const sIdx = baseSections.findIndex((s) => s.id === targetId);
      if (sIdx < 0) {
        throw new ApiError(404, 'Seção não encontrada na página atual.');
      }
      const existingBeforeEdit = baseSections[sIdx];

      let glmResult = null;
      if (instruction && body?.useGlm !== false) {
        glmResult = await callGlm53Json({
          systemPrompt:
            'Você realiza um Patch Cirúrgico em UMA única seção Formula-IR v9.0 em Português do Brasil. Responda APENAS JSON válido com os campos atualizados (title, subtitle, eyebrow, body) respeitando o Fold Budget mobile (title <= 58 chars, subtitle <= 115 chars) e sem alterar preços do catálogo.',
          userPrompt: JSON.stringify({
            loja: profile?.business?.name || 'Minha Loja',
            secaoAlvo: existingBeforeEdit.type,
            configAtual: existingBeforeEdit.config,
            instrucaoDoLojista: instruction,
          }),
          timeoutMs: 22000,
        });
        if (!glmResult.ok && glmResult.error && glmResult.error !== 'GLM_NOT_CONFIGURED' && body?.strictGlm === true) {
          throw new Error(`Falha no motor GLM (${glmResult.error}).`);
        }
      }

      const { resultingSection, nextIr, criticTips } = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
        const pagesList = Array.isArray(formulasIr.pages) ? formulasIr.pages.map((p) => ({ ...p })) : [];
        const pageIdx = isSubpage ? pagesList.findIndex((p) => p?.filename === pageFilename) : -1;
        if (isSubpage && pageIdx < 0) throw new ApiError(404, 'Página não encontrada nesta loja.');
        const sections = isSubpage
          ? Array.isArray(pagesList[pageIdx].sections)
            ? [...pagesList[pageIdx].sections]
            : []
          : Array.isArray(formulasIr.sections)
            ? [...formulasIr.sections]
            : [];

        const idx = sections.findIndex((s) => s.id === targetId);
        if (idx < 0) throw new ApiError(404, 'Seção não encontrada na página atual.');

        const existing = JSON.parse(JSON.stringify(sections[idx]));
        existing.config = existing.config || {};

        if (body?.config && typeof body.config === 'object') {
          existing.config = { ...existing.config, ...body.config };
        }
        if (
          existing.type === 'InteractiveExperience' &&
          ['quiz_recommendation', 'dosage_calculator', 'bundle_builder'].includes(experienceMode)
        ) {
          existing.config.experienceMode = experienceMode;
        }

        if (instruction) {
          if (glmResult?.ok && glmResult.data && typeof glmResult.data === 'object') {
            const d = glmResult.data.config && typeof glmResult.data.config === 'object'
              ? glmResult.data.config
              : glmResult.data;
            if (typeof d.title === 'string' && d.title.trim()) {
              existing.config.title = d.title.trim().slice(0, existing.type === 'HeroSection' ? 58 : 95);
            }
            if (typeof d.subtitle === 'string' && d.subtitle.trim()) {
              existing.config.subtitle = d.subtitle.trim().slice(0, existing.type === 'HeroSection' ? 115 : 190);
            }
            if (typeof d.eyebrow === 'string' && d.eyebrow.trim() && 'eyebrow' in existing.config) {
              existing.config.eyebrow = d.eyebrow.trim().slice(0, 58);
            }
            if (typeof d.body === 'string' && d.body.trim() && 'body' in existing.config) {
              existing.config.body = d.body.trim().slice(0, 440);
            }
          } else {
            // Deterministic intelligent patch when GLM is offline or useGlm=false
            const cleanInst = instruction.slice(0, existing.type === 'HeroSection' ? 115 : 180);
            if (/t[ií]tulo|chamada|headline/i.test(instruction) && 'title' in existing.config) {
              const extracted = instruction
                .replace(/^(?:mudar|alterar|deixar|trocar)\s+(?:o\s+)?(?:t[ií]tulo|chamada|headline)\s*(?:para|:)?\s*/i, '')
                .trim();
              existing.config.title = (extracted || cleanInst).slice(
                0,
                existing.type === 'HeroSection' ? 58 : 95,
              );
            } else if ('subtitle' in existing.config) {
              existing.config.subtitle = cleanInst;
            } else if ('body' in existing.config) {
              existing.config.body = cleanInst;
            } else if ('tagline' in existing.config) {
              existing.config.tagline = cleanInst;
            } else if ('title' in existing.config) {
              existing.config.title = cleanInst.slice(0, 58);
            }
          }
        }

        const sanitizedSingle = sanitizeFormulaV9Document({ ...formulasIr, sections: [existing] }, profile);
        const checkNode = SectionNodeSchema.safeParse(sanitizedSingle.sections[0] || existing);
        if (!checkNode.success) {
          throw new ApiError(
            400,
            checkNode.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' '),
          );
        }

        const updatedSection = checkNode.data;
        // Merge cirúrgico: preserva 100% das outras seções intactas (BUG-F04-04)
        sections[idx] = updatedSection;

        const nextDocBase = isSubpage
          ? {
              ...formulasIr,
              pages: pagesList.map((p, pIdx) => (pIdx === pageIdx ? { ...p, sections } : p)),
              updatedAt: new Date().toISOString(),
            }
          : { ...formulasIr, sections, updatedAt: new Date().toISOString() };

        const updatedIr = attachStoreSnapshotToDoc(nextDocBase, profile);
        await writeStorefrontMoldeToDisk({
          directory,
          formulasIr: updatedIr,
          imageJobs: state.imageJobs,
        });
        await persistIrIntoProfile({
          user,
          directory,
          formulasIr: updatedIr,
          imageJobs: state.imageJobs,
          loadProfileState,
          saveProfileFn: saveProfileState,
        }).catch(() => null);

        const tips = runDesignCritic(profile, updatedIr);
        return { resultingSection: updatedSection, nextIr: updatedIr, criticTips: tips };
      });

      return send(res, 200, {
        ok: true,
        section: resultingSection,
        formulaIr: nextIr,
        formulasIr: nextIr,
        criticTips,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } catch (err) {
      const refunded = await refundCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: 'patch_section',
        amount: cost,
        metadata: {
          sectionId: targetId,
          reason: err instanceof Error ? err.message : 'patch_section_failed',
          referenceId: debit?.entry?.id,
        },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => null);

      const balanceAfterRefund =
        refunded?.balanceAfter ??
        (await getCreditBalance({ user, bearer: user?.bearer, directory, readJsonFile }).catch(
          () => debit.balanceAfter + cost,
        ));
      const status = err && typeof err.status === 'number' ? err.status : 502;
      return send(res, status, {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir o ajuste com IA agora.',
        refunded: true,
        refundedCredits: cost,
        balanceAfter: balanceAfterRefund,
      });
    }
  }

  // 5. POST /api/store-molde/generate-image (-5 cr schnell, -10 cr hero_dev / edit)
  if (pathname === '/api/store-molde/generate-image') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 12 * 1024 * 1024);
    const kind = body?.kind === 'hero_dev' ? 'hero_dev' : body?.kind === 'edit' ? 'edit' : 'schnell';
    const actionName =
      kind === 'hero_dev' ? 'generate_hero_dev' : kind === 'edit' ? 'edit_image_qwen' : 'generate_image_schnell';
    const cost = kind === 'schnell' ? 5 : 10;

    const slotKey = resolveValidatedSlotKey(body?.slotId, 'custom', ApiError);
    const sourceImageBase64 = String(body?.sourceImageBase64 || '');
    if (sourceImageBase64 && sourceImageBase64.length > MAX_UPLOAD_BASE64_CHARS + 64) {
      throw new ApiError(413, 'Imagem base excede o limite de 10 MB.');
    }

    const debit = await debitCredits({
      user,
      bearer: user?.bearer,
      directory,
      action: actionName,
      amount: cost,
      metadata: { slotKey, kind, phase: 'reserve' },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debit.ok) return send(res, 402, debit);

    try {
      const prompt = String(body?.prompt || 'Minimalist commercial studio photo, natural light, clean background').trim();
      const generated = await generateRunPodImage({
        prompt,
        kind,
        width: Number(body?.width) || 1024,
        height: Number(body?.height) || 768,
        sourceImageBase64,
        timeoutMs: 90000,
      });

      const ext = generated.ext || 'webp';
      const fileName = `${slotKey}.${ext}`;
      const relPath = `assets/generated/${fileName}`;
      const moldeDir = getStorefrontMoldeDir(directory);
      await atomicWriteBuffer(path.join(moldeDir, relPath), generated.buffer);
      if (isCloudStorageEnabled()) {
        void uploadStorefrontFileToStorage({
          userId: user.id,
          relativePath: relPath,
          bytes: generated.buffer,
        });
      }
      const assetUrl = `/api/store-molde/${encodeURIComponent(user.id)}/${relPath}`;
      const targetSecId = String(body?.sectionId || body?.blockId || '');

      const formulasIr = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const { current } = await loadProfileState(user, directory);
        const updatedIr = state.formulasIr || buildNeutralFallbackV9Document(current?.data || {});

        if (targetSecId && Array.isArray(updatedIr.sections)) {
          updatedIr.sections = updatedIr.sections.map((sec) =>
            sec.id === targetSecId || sec.imageSlotId === slotKey
              ? { ...sec, config: { ...(sec.config || {}), imageUrl: assetUrl } }
              : sec,
          );
        }

        const nextJobs = Array.isArray(state.imageJobs) ? [...state.imageJobs] : [];
        nextJobs.push({
          slotId: slotKey,
          targetSectionId: targetSecId || slotKey,
          role: 'section_illustration',
          filename: fileName,
          relativePath: relPath,
          assetUrl,
          kind,
          promptEn: prompt,
          status: 'completed',
          modelUsed: generated.model,
          createdAt: new Date().toISOString(),
        });

        await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: nextJobs });
        await persistIrIntoProfile({
          user,
          directory,
          formulasIr: updatedIr,
          imageJobs: nextJobs,
          loadProfileState,
          saveProfileFn: saveProfileState,
        }).catch(() => null);
        return updatedIr;
      });

      return send(res, 200, {
        ok: true,
        assetUrl,
        relativePath: relPath,
        formulasIr,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } catch (err) {
      await refundCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: actionName,
        amount: cost,
        metadata: { slotKey, kind, reason: err instanceof Error ? err.message : 'generate_image_failed', referenceId: debit?.entry?.id },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
      throw err;
    }
  }

  // 6. POST /api/store-molde/upload-asset (0 cr — grátis)
  if (pathname === '/api/store-molde/upload-asset') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 15 * 1024 * 1024);
    const slotKey = resolveValidatedSlotKey(body?.slotId, 'upload', ApiError);
    const dataUrl = String(body?.dataUrl || '').trim();
    const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
    if (!match) throw new ApiError(400, 'Envie uma imagem PNG, JPG, WEBP ou GIF válida.');
    const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
    const cleanBase64 = match[2].replace(/\s+/g, '');
    if (!cleanBase64 || cleanBase64.length > MAX_UPLOAD_BASE64_CHARS) {
      throw new ApiError(413, 'Imagem excede o limite de 10 MB.');
    }
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
      throw new ApiError(400, 'Imagem inválida ou acima de 10 MB.');
    }
    const detectedExt = detectImageMagicExt(buffer);
    if (!detectedExt || detectedExt !== ext) {
      throw new ApiError(400, 'Conteúdo da imagem não corresponde a PNG, JPEG, WEBP ou GIF válido.');
    }

    const fileName = `${slotKey}.${detectedExt}`;
    const relPath = `assets/generated/${fileName}`;
    const moldeDir = getStorefrontMoldeDir(directory);
    await atomicWriteBuffer(path.join(moldeDir, relPath), buffer);
    if (isCloudStorageEnabled()) {
      void uploadStorefrontFileToStorage({
        userId: user.id,
        relativePath: relPath,
        bytes: buffer,
      });
    }
    const assetUrl = `/api/store-molde/${encodeURIComponent(user.id)}/${relPath}`;

    const resultIr = await serializeMoldeMutation(directory, async () => {
      const state = await readStorefrontMoldeState(directory);
      if (!state.formulasIr) {
        return null;
      }
      const formulasIr = { ...state.formulasIr };
      const targetSecId = String(body?.sectionId || body?.blockId || '');
      if (slotKey === 'brand_logo') {
        formulasIr.storeInfo = { ...(formulasIr.storeInfo || {}), logoUrl: assetUrl };
      } else if (slotKey === 'storefront_front') {
        formulasIr.storeInfo = { ...(formulasIr.storeInfo || {}), storefrontPhotoUrl: assetUrl };
      }
      if (targetSecId && Array.isArray(formulasIr.sections)) {
        formulasIr.sections = formulasIr.sections.map((sec) =>
          sec.id === targetSecId || sec.imageSlotId === slotKey
            ? { ...sec, config: { ...(sec.config || {}), imageUrl: assetUrl } }
            : sec,
        );
      }

      await writeStorefrontMoldeToDisk({ directory, formulasIr, imageJobs: state.imageJobs });
      await persistIrIntoProfile({
        user,
        directory,
        formulasIr,
        imageJobs: state.imageJobs,
        loadProfileState,
        saveProfileFn: saveProfileState,
      }).catch(() => null);
      return formulasIr;
    });

    if (!resultIr) {
      // Onboarding Screen 4 uploads occur BEFORE /generate-full; do not create premature IR
      return send(res, 200, {
        ok: true,
        assetUrl,
        relativePath: relPath,
        debited: 0,
      });
    }

    return send(res, 200, {
      ok: true,
      assetUrl,
      relativePath: relPath,
      formulasIr: resultIr,
      debited: 0,
    });
  }

  // 7. POST /api/store-molde/save-ir (0 cr — grátis)
  if (pathname === '/api/store-molde/save-ir') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 4 * 1024 * 1024);
    const nextIr = body?.formulasIr;
    const isV9 = nextIr?.version === FORMULA_V9_VERSION;

    const { current } = await loadProfileState(user, directory);
    const profile = current?.data || {};
    let finalIr = nextIr;
    if (isV9) {
      const cleanedSvgIr = stripSvgPlaceholdersInDoc(nextIr);
      const checkV9 = FormulaV9DocumentSchema.safeParse(cleanedSvgIr);
      if (!checkV9.success) {
        throw new ApiError(400, checkV9.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' '));
      }
      const sanitizedDoc = sanitizeFormulaV9Document(checkV9.data, profile);
      const sanitizedPages = Array.isArray(checkV9.data.pages)
        ? checkV9.data.pages.map((p) => ({
            ...p,
            sections: sanitizeFormulaV9Document({ ...checkV9.data, sections: p.sections }, profile).sections,
          }))
        : undefined;
      finalIr = attachStoreSnapshotToDoc(
        {
          ...sanitizedDoc,
          ...(sanitizedPages ? { pages: sanitizedPages } : {}),
        },
        profile,
      );
    } else {
      const checkLegacy = validateFormulaIrDocument(nextIr);
      if (!checkLegacy.ok) throw new ApiError(400, checkLegacy.errors.join(' '));
      const sanitizedLegacy = sanitizeLegacyV8Document(nextIr, ApiError);
      finalIr = attachStoreSnapshotToDoc(sanitizedLegacy, profile);
    }

    await serializeMoldeMutation(directory, async () => {
      const state = await readStorefrontMoldeState(directory);
      await writeStorefrontMoldeToDisk({ directory, formulasIr: finalIr, imageJobs: state.imageJobs });
      await persistIrIntoProfile({
        user,
        directory,
        formulasIr: finalIr,
        imageJobs: state.imageJobs,
        loadProfileState,
        saveProfileFn: saveProfileState,
      }).catch(() => null);
    });

    return send(res, 200, {
      ok: true,
      formulasIr: finalIr,
      debited: 0,
    });
  }

  return false;
}
