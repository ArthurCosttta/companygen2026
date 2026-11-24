import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMULA_V9_VERSION,
  FormulaV9DocumentSchema,
  SectionNodeSchema,
  deriveThemeTokensFromHex,
  safeCssHex,
  sanitizeFormulaV9Document,
  sanitizeSafeAssetUrl,
  sanitizeSafeHref,
  stripAiDashFlags,
} from '../shared/formula-ir/composer-schema.mjs';
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
import { buildArchitectInputPacket } from './store-semantic-dossier.mjs';
import { resolveSectionSurfaceTokens } from '../shared/formula-ir/atomic-grammar.mjs';
import { compileImagePromptFromMolde } from '../shared/formula-ir/image-moldes.mjs';
import {
  generateContextualBriefQuestions,
  parseOrRepairBriefQuestionsJson,
} from '../shared/formula-ir/brief-questions.mjs';
import {
  buildRecommendedPagesForProfile,
  classifyBusinessArchetype,
  extractSpreadsheetSignals,
} from '../shared/formula-ir/spreadsheet-intelligence.mjs';
import { hydrateAndValidateBlueprint } from './atomic-hydrator.mjs';
import {
  enrichCatalogProductsMedia,
  runMultiPhaseAtomicArchitecture,
} from './atomic-architect-pipeline.mjs';
import { auditAndRepairAtomicBlueprint } from './atomic-visual-critic.mjs';
import {
  resolveLayoutArchetype,
  stripDashesText,
} from './section-property-prompts.mjs';
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

function readFallbackDotEnv() {
  const out = {};
  try {
    const envPath = fileURLToPath(new URL('../.env', import.meta.url));
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }
  } catch {}
  return out;
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
  const dotEnv = (!process.env.GLM_API_KEY || !process.env.GLM_ENDPOINT_URL) ? readFallbackDotEnv() : {};
  const apiKey = String(process.env.GLM_API_KEY || dotEnv.GLM_API_KEY || '').trim();
  const baseEndpoint = String(process.env.GLM_ENDPOINT_URL || dotEnv.GLM_ENDPOINT_URL || '').trim().replace(/\/$/, '');
  const model = String(process.env.GLM_MODEL || dotEnv.GLM_MODEL || 'zai-org/GLM-5.3').trim() || 'zai-org/GLM-5.3';
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
  if (aspect === '16:9') return { width: 1344, height: 768 };
  if (aspect === '16:10') return { width: 1280, height: 800 };
  if (aspect === '4:3') return { width: 1152, height: 896 };
  if (aspect === '4:5') return { width: 896, height: 1152 };
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

  const existingCatalogImages = new Map();
  if (Array.isArray(doc?.catalog)) {
    for (const item of doc.catalog) {
      if (!item || typeof item !== 'object') continue;
      const url = cleanImageUrlForIr(item.imageUrl);
      if (!url) continue;
      if (item.id) existingCatalogImages.set(String(item.id), url);
      if (item.sku) existingCatalogImages.set(String(item.sku).toUpperCase(), url);
    }
  }

  const activeCatalog = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products
        .filter((p) => p && p.active !== false)
        .map((p) => ({
          ...p,
          imageUrl:
            cleanImageUrlForIr(p.imageUrl) ||
            existingCatalogImages.get(String(p.id || '')) ||
            existingCatalogImages.get(String(p.sku || '').toUpperCase()) ||
            '',
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

  // Persiste URLs reais enriquecidas do catalogo de volta no perfil quando produto estava sem foto
  if (Array.isArray(baseData?.catalog?.products) && Array.isArray(formulasIr?.catalog)) {
    const byKey = new Map();
    for (const item of formulasIr.catalog) {
      if (!item || typeof item !== 'object') continue;
      const url = cleanImageUrlForIr(item.imageUrl);
      if (!url) continue;
      if (item.id) byKey.set(String(item.id), url);
      if (item.sku) byKey.set(String(item.sku).toUpperCase(), url);
    }
    baseData.catalog.products = baseData.catalog.products.map((prod) => {
      if (!prod || typeof prod !== 'object' || cleanImageUrlForIr(prod.imageUrl)) return prod;
      const found = byKey.get(String(prod.id || '')) || byKey.get(String(prod.sku || '').toUpperCase());
      return found ? { ...prod, imageUrl: found } : prod;
    });
  }

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
const STORE_MOLDE_STAGE_PCT = {
  reading_catalog: 15,
  designing_experience: 40,
  generating_media: 72,
  generating_images: 72,
  hydrating_blueprint: 82,
  publishing: 92,
  completed: 100,
  error: 0,
};

function setStoreMoldeJobStage(clientJobId, stage, label, extra = {}) {
  const key = String(clientJobId || '').trim();
  if (!key) return;
  if (STORE_MOLDE_JOBS.size >= MAX_STORED_JOBS && !STORE_MOLDE_JOBS.has(key)) {
    const oldest = STORE_MOLDE_JOBS.keys().next().value;
    if (oldest) STORE_MOLDE_JOBS.delete(oldest);
  }
  const prev = STORE_MOLDE_JOBS.get(key);
  const prevSteps = Array.isArray(prev?.microSteps) ? prev.microSteps : [];
  const nextSteps =
    extra?.microMessage
      ? [
          ...prevSteps.filter((m) => m.text !== extra.microMessage),
          { stage, text: String(extra.microMessage), at: new Date().toISOString() },
        ].slice(-10)
      : prevSteps;
  const rawPct =
    extra?.progressPct !== undefined ? Number(extra.progressPct) : STORE_MOLDE_STAGE_PCT[stage] ?? 0;
  const progressPct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, Math.round(rawPct))) : 0;
  STORE_MOLDE_JOBS.set(key, {
    jobId: key,
    stage,
    label,
    progressPct,
    updatedAt: new Date().toISOString(),
    ...(prev || {}),
    ...extra,
    progressPct,
    microSteps: nextSteps,
  });
}

function isMetaCommandInstruction(text = '') {
  return /\b(?:mudar|alterar|melhorar|trocar|deixar|fazer|faz\b|mostrando|layout|ficar\s+melhor|componente|centraliz|alinha|t[ií]tulo\s+mais|destacar\s+prazo|enfatizar)\b/i.test(
    String(text || ''),
  );
}

function buildDailyScheduleSlots() {
  return [
    'Segunda · 08h às 19h · Atendimento completo',
    'Terça · 08h às 19h · Atendimento completo',
    'Quarta · 08h às 19h · Atendimento completo',
    'Quinta · 08h às 19h · Atendimento completo',
    'Sexta · 08h às 19h · Atendimento completo',
    'Sábado · 09h às 17h · Plantão & Retirada',
    'Domingo · Sob agendamento pelo WhatsApp',
  ];
}

function extractExplicitReplacementCopy(instruction = '') {
  const quoted = String(instruction || '').match(/["“]([^"”]{3,160})["”]/);
  if (quoted?.[1]) return stripAiDashFlags(quoted[1].trim());
  const afterColon = String(instruction || '').match(/(?:para|por|como|em)\s*:\s*(.+)$/i);
  if (afterColon?.[1]) return stripAiDashFlags(afterColon[1].trim());
  return '';
}

export async function generateFullStorefrontMolde({
  user,
  directory,
  profile,
  useGlm = true,
  generateImages = false,
  maxImages = 5,
  includeArtPack = false,
  layoutArchetype = '',
  selectedAddons = [],
  chargeCredits = true,
  clientJobId = '',
  briefAnswers = {},
  questionsJson = null,
  isAborted = null,
  root = '',
  readJsonFile,
  atomicWriteJson,
  loadProfileState,
  saveProfileFn,
} = {}) {
  setStoreMoldeJobStage(clientJobId, 'reading_catalog', 'Lendo catálogo');
  const selectedAddonsList = Array.isArray(selectedAddons)
    ? selectedAddons.map((x) => String(typeof x === 'object' ? x?.id || '' : x).trim()).filter(Boolean)
    : [];
  const effectiveIncludeArtPack = Boolean(includeArtPack) || selectedAddonsList.includes('art_pack');
  const actionKey = effectiveIncludeArtPack ? 'generate_full_storefront_with_art' : 'generate_full_storefront';
  const fullCost = CREDIT_ACTION_COSTS[actionKey] || (effectiveIncludeArtPack ? 15 : 10);
  let creditResult = null;
  if (chargeCredits) {
    const currentBal = await getCreditBalance({
      user,
      bearer: user?.bearer,
      directory,
      readJsonFile,
    });
    if (currentBal < fullCost) {
      const insufficient = {
        ok: false,
        status: 402,
        error: 'CREDITS_INSUFFICIENT',
        message: `Saldo insuficiente (${currentBal} cr disponíveis, necessário ${fullCost} cr).`,
        balance: currentBal,
        required: fullCost,
      };
      setStoreMoldeJobStage(clientJobId, 'error', 'Créditos insuficientes', { status: 402 });
      void recordSystemIncident({
        root,
        type: 'credit_blocked_402',
        userId: user?.id,
        detail: `${actionKey} bloqueado por saldo insuficiente`,
        readJsonFile,
        atomicWriteJson,
      });
      return insufficient;
    }
  }

  try {
    let doc = null;
    let rawAtomicBlueprint = null;
    let generatedBy = 'neutral-v9-fallback';
    let modelUsed = 'structural-fallback';
    const dossier = buildArchitectInputPacket(profile);
    const resolvedArch = resolveLayoutArchetype({ layoutArchetype, dossier, profile });
    let resolvedArchetypeId = resolvedArch.id;

    let glmAttemptedAndFailed = false;
    setStoreMoldeJobStage(clientJobId, 'designing_experience', 'Desenhando experiência', {
      microMessage: `Analisando ${Array.isArray(profile?.catalog?.products) ? profile.catalog.products.length : 0} itens de ${profile?.business?.name || 'sua loja'} e estruturando seções`,
    });
    if (useGlm) {
      const storeIdentityId =
        profile?.brand?.storeIdentityId ||
        computeStoreIdentityId({
          slug: profile?.publishedStore?.slug || profile?.business?.name || '',
          niche: profile?.business?.segment || '',
          name: profile?.business?.name || '',
        });
      setStoreMoldeJobStage(clientJobId, 'designing_experience', 'Desenhando experiência', {
        microMessage: `Dossiê montado: carro-chefe "${dossier?.flagshipProduct?.name || 'Catálogo Principal'}" · arquitetura ${resolvedArch.label}`,
      });
      const archRes = await runMultiPhaseAtomicArchitecture({
        dossier,
        profile,
        briefAnswers,
        questionsJson,
        layoutArchetype: resolvedArch.id,
        selectedAddons: selectedAddonsList,
        callGlm53Json,
      });
      if (archRes.ok && archRes.blueprint) {
        resolvedArchetypeId = archRes.layoutArchetype || resolvedArch.id;
        setStoreMoldeJobStage(clientJobId, 'designing_experience', 'Desenhando experiência', {
          microMessage: `GLM entregou ${(archRes.blueprint.sections || []).length} seções exclusivas para ${profile?.business?.name || 'a loja'}`,
        });
        const d = archRes.blueprint;
        const baseDoc = buildNeutralFallbackV9Document(profile);
        if (Array.isArray(d.sections) && d.sections.length >= 2) {
          const preCheck = hydrateAndValidateBlueprint({ blueprint: d, profile, generatedImagesBySlot: {} });
          if (preCheck.ok) {
            const auditedPre = auditAndRepairAtomicBlueprint(preCheck.data, profile);
            rawAtomicBlueprint = auditedPre.data || preCheck.data;
            const brandPrimaryHex = safeCssHex(
              profile?.brand?.primaryColor || preCheck.data?.brandTokens?.colors?.primary || baseDoc.designTokens?.accent,
              baseDoc.designTokens?.accent || '#18181B',
            );
            const brandDesignTokens = deriveThemeTokensFromHex(brandPrimaryHex, baseDoc.designTokens);
            const editorialReqs = Array.isArray(d.imageRequests)
              ? d.imageRequests.filter((r) => r?.source !== 'catalog_sku').slice(0, 5)
              : [];
            const mappedImagePlan = editorialReqs.map((req, idx) => ({
              slotId: String(req?.slotId || `img_slot_${idx + 1}`),
              targetSectionId: String(req?.targetSectionId || 'sec_hero'),
              role:
                idx === 0 || req?.slotId === 'img_hero_main'
                  ? 'hero'
                  : String(req?.slotId || '').includes('banner')
                    ? 'lifestyle_banner'
                    : 'section_illustration',
              aspect:
                req?.aspectRatio === '4:3' || req?.aspectRatio === '4:5' || req?.aspectRatio === '1:1' || req?.aspectRatio === '16:10'
                  ? req.aspectRatio
                  : '16:9',
              tier: idx === 0 ? 'flux-dev' : 'flux-schnell',
              promptEn: stripDashesText(String(req?.prompt || '')).slice(0, 1000),
              negativePrompt: stripDashesText(String(req?.negativePrompt || '')).slice(0, 350),
              status: 'pending',
            }));
            doc = sanitizeFormulaV9Document(
              {
                ...baseDoc,
                layoutGrid: archRes.layoutGrid || resolvedArch.layoutGrid,
                visualDirection: archRes.visualDirection || resolvedArch.visualDirection,
                ...(archRes.artDirectionBible ? { artDirectionBible: archRes.artDirectionBible } : {}),
                designTokens: brandDesignTokens,
                storeIdentityId,
                imagePlan: mappedImagePlan.length > 0 ? mappedImagePlan : baseDoc.imagePlan,
                generatedBy: 'glm-atomic-v3',
                modelUsed: archRes.modelUsed || 'zai-org/GLM-5.3',
              },
              profile,
            );
            generatedBy = 'glm-atomic-v3';
            modelUsed = archRes.modelUsed || 'zai-org/GLM-5.3';
          } else {
            glmAttemptedAndFailed = true;
          }
        } else {
          glmAttemptedAndFailed = true;
        }
      } else if (archRes.error && archRes.error !== 'GLM_NOT_CONFIGURED') {
        glmAttemptedAndFailed = true;
      }
    }

    if (!doc) {
      doc = buildNeutralFallbackV9Document(profile);
      doc.layoutGrid = resolvedArch.layoutGrid;
      doc.visualDirection = resolvedArch.visualDirection;
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

    const editorialCap = effectiveIncludeArtPack
      ? Math.min(5, Math.max(0, maxImages))
      : Math.min(2, Math.max(0, maxImages));
    const imageJobs = Array.isArray(doc.imagePlan) ? doc.imagePlan.slice(0, editorialCap) : [];
    const apiKey = String(process.env.IMAGE_API_KEY || process.env.GLM_API_KEY || '').trim();

    const generatedImagesBySlot = {};
    const categoryGeneratedAssets = {};
    setStoreMoldeJobStage(clientJobId, 'generating_media', 'Criando e buscando fotos', {
      progressPct: 72,
      microMessage: 'Preparando artes principais e fotos do catálogo',
    });

    if (generateImages && imageJobs.length > 0 && apiKey) {
      for (let i = 0; i < imageJobs.length; i += 3) {
        const chunk = imageJobs.slice(i, i + 3);
        await Promise.all(
          chunk.map(async (job) => {
            try {
              const dims = dimensionsForAspect(job.aspect);
              const runpodKind = job.tier === 'flux-dev' ? 'hero_dev' : 'schnell';
              let generated;
              try {
                generated = await generateRunPodImage({
                  prompt: job.promptEn,
                  negativePrompt: job.negativePrompt || '',
                  artDirectionBible: doc.artDirectionBible,
                  kind: runpodKind,
                  width: dims.width,
                  height: dims.height,
                  timeoutMs: 90000,
                });
              } catch {
                generated = await generateRunPodImage({
                  prompt: job.promptEn,
                  negativePrompt: job.negativePrompt || '',
                  artDirectionBible: doc.artDirectionBible,
                  kind: 'schnell',
                  width: dims.width,
                  height: dims.height,
                  timeoutMs: 90000,
                });
              }
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
              generatedImagesBySlot[job.slotId] = job.assetUrl;
              const catHint = String(job.targetSectionId || '').replace(/^cat:/i, '').trim().toLowerCase();
              if (catHint && !catHint.startsWith('sec_')) {
                categoryGeneratedAssets[catHint] = job.assetUrl;
              }
              doc = bindImageUrlToDoc(doc, job, job.assetUrl);
              setStoreMoldeJobStage(clientJobId, 'generating_media', 'Criando e buscando fotos', {
                progressPct: 72,
                microMessage: `Imagem salva (${Object.keys(generatedImagesBySlot).length}/${imageJobs.length}): ${job.role || job.slotId}`,
              });
            } catch (err) {
              job.status = 'error';
              job.error = err instanceof Error ? err.message : 'IMAGE_ERR';
            }
          }),
        );
      }
    }

    // Enriquece TODOS os SKUs ativos sem foto (RunPod em lote para carros-chefe + busca web fallback)
    let profileForHydration = profile;
    if (Array.isArray(profile?.catalog?.products) && profile.catalog.products.length > 0) {
      const mediaRes = await enrichCatalogProductsMedia({
        products: profile.catalog.products,
        dossier,
        artDirectionBible: doc.artDirectionBible,
        storeName: profile?.business?.name || 'Loja',
        segment: profile?.business?.segment || 'Comércio Local',
        userId: user?.id || 'visitor',
        moldeDir,
        apiKey,
        generateImages,
        includeArtPack: effectiveIncludeArtPack,
        runpodGenerator: generateRunPodImage,
        writeBufferFn: atomicWriteBuffer,
        uploadStorageFn: isCloudStorageEnabled()
          ? ({ userId: uid, relativePath, bytes }) =>
              uploadStorefrontFileToStorage({ userId: uid, relativePath, bytes })
          : null,
        categoryImages: categoryGeneratedAssets,
      }).catch(() => null);
      if (mediaRes?.products) {
        profileForHydration = {
          ...profile,
          catalog: { ...(profile.catalog || {}), products: mediaRes.products },
        };
        doc = attachStoreSnapshotToDoc(doc, profileForHydration);
        if (mediaRes.enrichedCount > 0) {
          setStoreMoldeJobStage(clientJobId, 'generating_media', 'Criando e buscando fotos', {
            progressPct: 76,
            microMessage: `Catálogo ilustrado: ${mediaRes.enrichedCount} produto(s) com foto real`,
          });
        }
      }
    }

    if (rawAtomicBlueprint) {
      setStoreMoldeJobStage(clientJobId, 'hydrating_blueprint', 'Montando seções atômicas');
      const hydrated = hydrateAndValidateBlueprint({
        blueprint: rawAtomicBlueprint,
        profile: profileForHydration,
        generatedImagesBySlot,
      });
      if (hydrated.ok) {
        const finalAudit = auditAndRepairAtomicBlueprint(hydrated.data, profileForHydration);
        doc.atomicBlueprint = finalAudit.data || hydrated.data;
        if (doc.atomicBlueprint?.brandTokens) {
          doc.atomicBlueprint.brandTokens.layoutArchetype = resolvedArchetypeId;
          doc.atomicBlueprint.brandTokens.archetype = resolvedArchetypeId;
        }
        const heroSec = doc.atomicBlueprint.sections.find(
          (s) => s.tuple[1] === 'hero_split' || s.tuple[1] === 'hero_centered' || s.tuple[0].includes('hero'),
        );
        if (heroSec) {
          const getSlot = (role) => heroSec.textSlots.find((t) => t.micro?.[1] === role)?.micro?.[2];
          doc.sections = (doc.sections || []).map((sec) => {
            if (sec.type === 'HeroSection') {
              return {
                ...sec,
                config: {
                  ...sec.config,
                  eyebrow: '',
                  title: getSlot('display') || getSlot('heading') || sec.config?.title,
                  subtitle: getSlot('body') || sec.config?.subtitle,
                  imageUrl: heroSec.resolvedMedia?.imageUrl || sec.config?.imageUrl,
                },
              };
            }
            return sec;
          });
        }
      }
    }

    // Guardrail estético minimalista pós-geração: remove eyebrows decorativos acima dos títulos
    if (Array.isArray(doc.sections)) {
      doc.sections = doc.sections.map((sec) => {
        if (!sec?.config || typeof sec.config !== 'object') return sec;
        const nextConfig = { ...sec.config };
        if ('eyebrow' in nextConfig) nextConfig.eyebrow = '';
        if (Array.isArray(nextConfig.cards)) {
          nextConfig.cards = nextConfig.cards.map((c) =>
            c && typeof c === 'object' ? { ...c, eyebrow: '' } : c,
          );
        }
        return { ...sec, config: nextConfig };
      });
    }

    doc.storeInfo = {
      ...(doc.storeInfo || {}),
      layoutArchetype: resolvedArchetypeId,
      selectedAddons: selectedAddonsList,
      includeArtPack: effectiveIncludeArtPack,
    };
    doc.imagePlan = imageJobs;
    setStoreMoldeJobStage(clientJobId, 'publishing', 'Publicando página');

    if (typeof isAborted === 'function' && isAborted()) {
      setStoreMoldeJobStage(clientJobId, 'error', 'Geração cancelada pelo cliente', { progressPct: 0 });
      return {
        ok: false,
        aborted: true,
        debited: 0,
        creditsCharged: 0,
      };
    }

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

    const fellBackToStructural =
      glmAttemptedAndFailed &&
      generatedBy !== 'glm-architect-v9' &&
      generatedBy !== 'glm-atomic-v3';

    let debitedAmount = 0;
    let finalBalanceAfter = await getCreditBalance({
      user,
      bearer: user?.bearer,
      directory,
      readJsonFile,
    });

    if (typeof isAborted === 'function' && isAborted()) {
      setStoreMoldeJobStage(clientJobId, 'error', 'Conexão encerrada antes da cobrança', { progressPct: 0 });
      return {
        ok: false,
        aborted: true,
        debited: 0,
        creditsCharged: 0,
        balanceAfter: finalBalanceAfter,
      };
    }

    if (chargeCredits && fellBackToStructural) {
      void recordSystemIncident({
        root,
        type: 'glm_fallback_triggered',
        userId: user?.id,
        detail: `generateFullStorefrontMolde caiu em structural-fallback e não cobrou ${fullCost} cr`,
        readJsonFile,
        atomicWriteJson,
      });
    } else if (chargeCredits) {
      creditResult = await debitCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: actionKey,
        amount: fullCost,
        metadata: {
          version: FORMULA_V9_VERSION,
          generatedBy,
          layoutArchetype: resolvedArchetypeId,
          includeArtPack: effectiveIncludeArtPack,
          selectedAddons: selectedAddonsList,
          phase: 'commit',
        },
        readJsonFile,
        atomicWriteJson,
      });
      if (!creditResult.ok) {
        setStoreMoldeJobStage(clientJobId, 'error', 'Créditos insuficientes', { status: 402 });
        return creditResult;
      }
      debitedAmount = creditResult.debited || fullCost;
      finalBalanceAfter = creditResult.balanceAfter ?? finalBalanceAfter;
    }

    setStoreMoldeJobStage(clientJobId, 'completed', 'Página no ar', {
      modelUsed,
      generatedBy,
      layoutArchetype: resolvedArchetypeId,
    });

    return {
      ok: true,
      formulasIr: doc,
      imageJobs,
      writtenFiles,
      layoutArchetype: resolvedArchetypeId,
      includeArtPack: effectiveIncludeArtPack,
      selectedAddons: selectedAddonsList,
      debited: debitedAmount,
      creditsCharged: debitedAmount,
      balanceAfter: finalBalanceAfter,
      modelUsed,
      generatedBy,
    };
  } catch (err) {
    if (chargeCredits && creditResult?.ok && creditResult?.debited) {
      await refundCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: actionKey,
        amount: creditResult.debited,
        metadata: {
          reason: err instanceof Error ? err.message : 'generation_failed',
          referenceId: creditResult?.entry?.id,
        },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
    }
    setStoreMoldeJobStage(clientJobId, 'error', 'Erro ao gerar loja', { progressPct: 0 });
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

const ALLOWED_GROUP_DISPLAY_MODES = new Set(['grid', 'carousel', 'list', 'compact', 'bento', 'cards']);
const ALLOWED_TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);

function sanitizeNodeStylesPatch(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const patch = {};
  if (src.fontSizePx !== undefined && src.fontSizePx !== null && src.fontSizePx !== '') {
    const n = Math.round(Number(src.fontSizePx));
    if (Number.isFinite(n)) patch.fontSizePx = Math.max(10, Math.min(140, n));
  }
  if (typeof src.textAlign === 'string' && ALLOWED_TEXT_ALIGNS.has(src.textAlign.trim())) {
    patch.textAlign = src.textAlign.trim();
  }
  if (typeof src.textColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(src.textColor.trim())) {
    patch.textColor = safeCssHex(src.textColor.trim(), '#0F172A');
  }
  if (typeof src.bgColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(src.bgColor.trim())) {
    patch.bgColor = safeCssHex(src.bgColor.trim(), '#FFFFFF');
  }
  if (src.columns !== undefined && src.columns !== null && src.columns !== '') {
    const c = Math.round(Number(src.columns));
    if (Number.isFinite(c)) patch.columns = Math.max(1, Math.min(4, c));
  }
  if (typeof src.hidden === 'boolean') {
    patch.hidden = src.hidden;
  }
  if (typeof src.ctaLabel === 'string') {
    patch.ctaLabel = stripDashesText(stripAiDashFlags(src.ctaLabel)).slice(0, 60);
  }
  if (typeof src.directText === 'string') {
    patch.directText = stripDashesText(stripAiDashFlags(src.directText)).slice(0, 600);
  }
  if (typeof src.imageUrl === 'string') {
    const safeUrl = sanitizeSafeAssetUrl(src.imageUrl, '');
    if (safeUrl || src.imageUrl === '') patch.imageUrl = safeUrl;
  }
  if (typeof src.groupDisplayMode === 'string' && ALLOWED_GROUP_DISPLAY_MODES.has(src.groupDisplayMode.trim())) {
    patch.groupDisplayMode = src.groupDisplayMode.trim();
  }
  return patch;
}

function resolveActivePageContext(formulasIr, isSubpage, pageFilename) {
  const pagesList = Array.isArray(formulasIr?.pages) ? formulasIr.pages.map((p) => ({ ...p })) : [];
  const pageIdx = isSubpage ? pagesList.findIndex((p) => p?.filename === pageFilename) : -1;
  if (isSubpage && pageIdx < 0) {
    return { found: false, pageIdx: -1, pagesList, pageObj: null, sections: [], atomicBlueprint: null, atomicSections: [] };
  }
  const pageObj = isSubpage ? pagesList[pageIdx] : null;
  const sections = isSubpage
    ? (Array.isArray(pageObj?.sections) ? [...pageObj.sections] : [])
    : (Array.isArray(formulasIr?.sections) ? [...formulasIr.sections] : []);
  const atomicBlueprint = isSubpage ? (pageObj?.atomicBlueprint || null) : (formulasIr?.atomicBlueprint || null);
  const atomicSections = Array.isArray(atomicBlueprint?.sections) ? [...atomicBlueprint.sections] : [];
  return { found: true, pageIdx, pagesList, pageObj, sections, atomicBlueprint, atomicSections };
}

function writeBackActivePageContext(formulasIr, isSubpage, pageIdx, pagesList, { nextSections, nextAtomicBlueprint } = {}) {
  const nowIso = new Date().toISOString();
  if (isSubpage) {
    const updatedPages = pagesList.map((p, idx) => {
      if (idx !== pageIdx) return p;
      return {
        ...p,
        ...(nextSections !== undefined ? { sections: nextSections } : {}),
        ...(nextAtomicBlueprint !== undefined ? { atomicBlueprint: nextAtomicBlueprint } : {}),
      };
    });
    return { ...formulasIr, pages: updatedPages, updatedAt: nowIso };
  }
  return {
    ...formulasIr,
    ...(nextSections !== undefined ? { sections: nextSections } : {}),
    ...(nextAtomicBlueprint !== undefined ? { atomicBlueprint: nextAtomicBlueprint } : {}),
    updatedAt: nowIso,
  };
}

function buildActivePagePayload(ir, isSubpage, pageFilename) {
  if (isSubpage) {
    const pg = Array.isArray(ir?.pages) ? ir.pages.find((p) => p?.filename === pageFilename) : null;
    if (pg) return pg;
  }
  return {
    id: 'home',
    slug: 'home',
    filename: 'index.html',
    title: ir?.storeInfo?.name || 'Início',
    isHome: true,
    sections: Array.isArray(ir?.sections) ? ir.sections : [],
    ...(ir?.atomicBlueprint ? { atomicBlueprint: ir.atomicBlueprint } : {}),
  };
}

async function pushStoreMoldeSnapshot(directory, formulasIr, meta = {}) {
  if (!formulasIr || typeof formulasIr !== 'object') return;
  const snapPath = path.join(getStorefrontMoldeDir(directory), 'data', 'snapshots.json');
  let list = [];
  try {
    const parsed = JSON.parse(await readFile(snapPath, 'utf8'));
    if (Array.isArray(parsed)) list = parsed;
  } catch {}
  list.push({
    id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...meta,
    formulasIr,
  });
  await atomicWriteText(snapPath, JSON.stringify(list.slice(-8)));
}

async function readStoreMoldeSnapshot(directory, snapshotId = '') {
  const snapPath = path.join(getStorefrontMoldeDir(directory), 'data', 'snapshots.json');
  try {
    const list = JSON.parse(await readFile(snapPath, 'utf8'));
    if (!Array.isArray(list) || list.length === 0) return null;
    if (snapshotId) {
      return list.find((s) => s?.id === snapshotId) || null;
    }
    return list[list.length - 1] || null;
  } catch {
    return null;
  }
}

function applyPropPatchToAtomicSection(sec, { nodePath = 'root', stylePatch = {}, profile = {}, sectionIndex = 0, groundMode = 'warm_linen' }) {
  const cloned = JSON.parse(JSON.stringify(sec));
  const content = cloned.content && typeof cloned.content === 'object' ? { ...cloned.content } : {};
  const isRoot = !nodePath || nodePath === 'root' || nodePath === 'section';

  if (isRoot) {
    content.nodeStyles = { ...(content.nodeStyles && typeof content.nodeStyles === 'object' ? content.nodeStyles : {}), ...stylePatch };
  }
  content.nodeStylesByPath = {
    ...(content.nodeStylesByPath && typeof content.nodeStylesByPath === 'object' ? content.nodeStylesByPath : {}),
    [nodePath || 'root']: {
      ...(content.nodeStylesByPath?.[nodePath || 'root'] || {}),
      ...stylePatch,
    },
  };

  if (stylePatch.hidden !== undefined) content.hidden = stylePatch.hidden;
  if (stylePatch.columns !== undefined) {
    content.columns = stylePatch.columns;
    const curLayout = String(cloned.layout || 'cols=3 py=56 px=24');
    cloned.layout = /cols=\d+/.test(curLayout) ? curLayout.replace(/cols=\d+/, `cols=${stylePatch.columns}`) : `cols=${stylePatch.columns} ${curLayout}`;
    cloned.responsive = `mob:1|tab:2|desk:${stylePatch.columns}`;
  }
  if (stylePatch.groupDisplayMode) content.groupDisplayMode = stylePatch.groupDisplayMode;
  if (stylePatch.ctaLabel !== undefined) content.ctaPrimaryLabel = stylePatch.ctaLabel;
  if (stylePatch.textAlign && ['left', 'center', 'right'].includes(stylePatch.textAlign)) {
    cloned.direction = { ...(cloned.direction || {}), textAnchor: stylePatch.textAlign };
  }
  if (stylePatch.bgColor) {
    cloned.surface = `ui:bg=${stylePatch.bgColor} | ux:<auto_wcag:4.5>`;
    cloned.surfaceTokens = resolveSectionSurfaceTokens({
      primaryHex: profile?.brand?.primaryColor || '#18181B',
      accentHex: profile?.brand?.accentColor || '#D8A848',
      surfaceStr: cloned.surface,
      sectionIndex,
      groundMode,
    });
  }
  if (stylePatch.textColor) {
    cloned.surfaceTokens = { ...(cloned.surfaceTokens || {}), inkHex: stylePatch.textColor };
  }
  if (stylePatch.imageUrl !== undefined) {
    cloned.resolvedMedia = { ...(cloned.resolvedMedia || {}), imageUrl: stylePatch.imageUrl };
  }
  if (stylePatch.directText !== undefined) {
    content.directText = stylePatch.directText;
    const lowerPath = String(nodePath || '').toLowerCase();
    const targetsTitle = /title|heading|headline|display/.test(lowerPath);
    const targetsEyebrow = /eyebrow/.test(lowerPath);
    const slots = Array.isArray(cloned.textSlots) ? cloned.textSlots : [];
    let matchedSlot = false;
    cloned.textSlots = slots.map((slot) => {
      const m = Array.isArray(slot?.micro) ? [...slot.micro] : null;
      if (!m) return slot;
      if (targetsEyebrow && m[1] === 'eyebrow') {
        m[2] = stylePatch.directText.slice(0, 80);
        matchedSlot = true;
      } else if (targetsTitle && (m[1] === 'display' || m[1] === 'heading')) {
        m[2] = stylePatch.directText.slice(0, 140);
        matchedSlot = true;
      } else if (!targetsTitle && !targetsEyebrow && (m[1] === 'body' || m[1] === 'caption')) {
        m[2] = stylePatch.directText.slice(0, 240);
        matchedSlot = true;
      }
      return { ...slot, micro: m };
    });
    if (!matchedSlot && stylePatch.directText) {
      cloned.textSlots.push({
        micro: ['left_col', targetsTitle ? 'heading' : 'body', stylePatch.directText.slice(0, 220), 'ui:sz=16 wt=500', 'icon:none'],
        mediaPick: 'none',
      });
    }
  }

  cloned.content = content;
  return cloned;
}

function applyPropPatchToClassicSection(sec, { nodePath = 'root', stylePatch = {} }) {
  const cloned = JSON.parse(JSON.stringify(sec));
  cloned.config = cloned.config || {};
  const lowerPath = String(nodePath || '').toLowerCase();
  const cardMatch = /^cards\[(\d+)\]/i.exec(String(nodePath || ''));

  if (cardMatch && Array.isArray(cloned.config.cards)) {
    const cIdx = Number(cardMatch[1]);
    if (cloned.config.cards[cIdx]) {
      const card = { ...cloned.config.cards[cIdx] };
      if (stylePatch.imageUrl !== undefined) card.imageUrl = stylePatch.imageUrl;
      if (stylePatch.ctaLabel !== undefined) card.ctaLabel = stylePatch.ctaLabel.slice(0, 40);
      if (stylePatch.directText !== undefined) {
        if (lowerPath.includes('title')) card.title = stylePatch.directText.slice(0, 80);
        else card.description = stylePatch.directText.slice(0, 200);
      }
      cloned.config.cards[cIdx] = card;
    }
  } else {
    if (stylePatch.columns !== undefined && cloned.type === 'HighlightsGrid') {
      cloned.config.columns = stylePatch.columns === 3 ? 3 : 2;
    }
    if (stylePatch.imageUrl !== undefined && cloned.type !== 'HighlightsGrid' && cloned.type !== 'CatalogGrid') {
      cloned.config.imageUrl = stylePatch.imageUrl;
    }
    if (stylePatch.ctaLabel !== undefined) {
      const lbl = stylePatch.ctaLabel.slice(0, 44);
      if (cloned.config.primaryCta && typeof cloned.config.primaryCta === 'object') {
        cloned.config.primaryCta = { ...cloned.config.primaryCta, label: lbl };
      } else if (cloned.config.primaryAction && typeof cloned.config.primaryAction === 'object') {
        cloned.config.primaryAction = { ...cloned.config.primaryAction, label: lbl };
      } else if ('ctaLabel' in cloned.config) {
        cloned.config.ctaLabel = lbl;
      } else if ('itemActionLabel' in cloned.config) {
        cloned.config.itemActionLabel = lbl.slice(0, 36);
      }
    }
    if (stylePatch.directText !== undefined) {
      const txt = stylePatch.directText;
      if (/eyebrow/.test(lowerPath) && 'eyebrow' in cloned.config) {
        cloned.config.eyebrow = txt.slice(0, 58);
      } else if (/title|heading|headline/.test(lowerPath) && 'title' in cloned.config) {
        cloned.config.title = txt.slice(0, cloned.type === 'HeroSection' ? 58 : 95);
      } else if (/body/.test(lowerPath) && 'body' in cloned.config) {
        cloned.config.body = txt.slice(0, 440);
      } else if (/tagline/.test(lowerPath) && 'tagline' in cloned.config) {
        cloned.config.tagline = txt.slice(0, 220);
      } else if ('subtitle' in cloned.config) {
        cloned.config.subtitle = txt.slice(0, cloned.type === 'HeroSection' ? 115 : 190);
      } else if ('body' in cloned.config) {
        cloned.config.body = txt.slice(0, 440);
      } else if ('title' in cloned.config) {
        cloned.config.title = txt.slice(0, 95);
      }
    }
  }
  return cloned;
}

export async function handleStorefrontMoldeRoutes(req, res, ctx) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const { user, root = '', directory, readJson, send, ApiError, readJsonFile, atomicWriteJson, loadProfileState, saveProfileState } = ctx;

  // 0. GET /api/store-molde/job/:clientJobId (Progresso em etapas da criacao com progressPct 0..100)
  if (pathname.startsWith('/api/store-molde/job/')) {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const clientJobId = decodeURIComponent(pathname.slice('/api/store-molde/job/'.length)).trim();
    const job = STORE_MOLDE_JOBS.get(clientJobId) || {
      jobId: clientJobId,
      stage: 'reading_catalog',
      label: 'Lendo catálogo',
      progressPct: 15,
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

  // 1b. POST /api/store-molde/analyze-brief (0 cr, Analisa pedido e top 12 SKUs, retorna understandingSummary + perguntas personalizadas)
  if (pathname === '/api/store-molde/analyze-brief') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 1024 * 1024);
    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const campaignTheme = String(body?.campaignTheme || 'evergreen');
    const userPrompt = stripDashesText(String(body?.userPrompt || '').slice(0, 500));
    const pageGoal = String(body?.pageGoal || 'home').slice(0, 80);

    const dossier = buildArchitectInputPacket(profile);
    const activeProducts = Array.isArray(profile?.catalog?.products)
      ? profile.catalog.products.filter((p) => p && p.active !== false)
      : [];
    const top12Skus = [];
    const seenCats = new Set();
    for (const p of activeProducts) {
      if (top12Skus.length >= 12) break;
      const cat = String(p.category || 'Geral').toLowerCase();
      if (!seenCats.has(cat)) {
        seenCats.add(cat);
        top12Skus.push(p);
      }
    }
    for (const p of activeProducts) {
      if (top12Skus.length >= 12) break;
      if (!top12Skus.includes(p)) top12Skus.push(p);
    }
    const topSkusPayload = top12Skus.map((p) => ({
      sku: String(p.sku || p.id || '').slice(0, 48),
      name: stripDashesText(p.name || 'Item').slice(0, 80),
      category: stripDashesText(p.category || 'Geral').slice(0, 48),
      itemType: String(p.itemType || 'produto_fisico'),
      priceCents: Math.max(0, Math.round(Number(p.priceCents || 0))),
      priceBRL:
        Number(p.priceCents || 0) > 0
          ? `R$ ${(Math.round(Number(p.priceCents)) / 100).toFixed(2).replace('.', ',')}`
          : 'Sob consulta',
      variation: stripDashesText(p.variation || 'Padrão').slice(0, 40),
    }));

    const validPrices = activeProducts
      .map((p) => Math.max(0, Math.round(Number(p.priceCents || 0))))
      .filter((c) => c > 0);
    const minPriceCents = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPriceCents = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const avgPriceCents =
      validPrices.length > 0 ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length) : 0;
    const formatBrlSimple = (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
    const priceRange =
      maxPriceCents > 0
        ? minPriceCents === maxPriceCents
          ? formatBrlSimple(maxPriceCents)
          : `${formatBrlSimple(minPriceCents)} a ${formatBrlSimple(maxPriceCents)}`
        : 'Sob consulta';
    const missingPhotosCount = activeProducts.filter((p) => !cleanImageUrlForIr(p.imageUrl)).length;
    const recommendedArchetype = resolveLayoutArchetype({ dossier, profile });
    const isConsultiveBrief =
      recommendedArchetype.id === 'clinic_agenda_steps' ||
      String(profile?.business?.businessModel || '') === 'servicos';

    const recommendedAddons = [
      {
        id: 'art_pack',
        label: 'Pacote de Artes Profissionais (+5 cr)',
        description: 'Gera imagens exclusivas de capa, categorias e carros-chefe em estúdio IA',
        creditsCost: 5,
        recommended: true,
      },
      isConsultiveBrief
        ? {
            id: 'agenda_slots',
            label: 'Agenda de Turnos & Horários',
            description: 'Facilita seleção de horários e envio do agendamento no WhatsApp',
            creditsCost: 0,
            recommended: true,
          }
        : {
            id: 'combo_builder',
            label: 'Montador de Kits & Combos',
            description: 'Permite combinar itens reais do catálogo com soma automática na hora',
            creditsCost: 0,
            recommended: activeProducts.length >= 4,
          },
      {
        id: 'whatsapp_closer',
        label: 'Fechamento Direto no WhatsApp',
        description: 'Envia sacola e dúvidas formatadas direto para o WhatsApp da loja',
        creditsCost: 0,
        recommended: true,
      },
    ];
    if (Number(profile?.payment?.pixDiscountPercent || 0) > 0) {
      recommendedAddons.push({
        id: 'pix_badge',
        label: `Selo ${Number(profile.payment.pixDiscountPercent)}% off no Pix`,
        description: 'Destaca o valor com desconto Pix nos cards e resumo da sacola',
        creditsCost: 0,
        recommended: true,
      });
    }

    const strictGlm = body?.strictGlm === true;
    const storeAddress = stripDashesText(String(body?.storeAddress || profile?.business?.address || '').slice(0, 220));
    const hasStorefrontPhoto = Boolean(body?.hasStorefrontPhoto || profile?.brand?.storefrontPhotoUrl);
    const productsText = stripDashesText(String(body?.productsText || '').slice(0, 600));
    const businessGoal = stripDashesText(String(body?.businessGoal || profile?.business?.experienceGoal || '').slice(0, 240));
    let parsedRes = null;

    if (body?.useGlm !== false) {
      const glm = await callGlm53Json({
        systemPrompt:
          'Você é Estrategista de E-commerce PT-BR. Analise os SKUs reais, preços, categorias, descrição digitada pelo lojista, endereço e foto de fachada quando houver. Retorne APENAS JSON válido no formato BriefQuestionsJsonSchema com EXATAMENTE 5 perguntas genuinamente específicas para este negócio e opções customizadas citando produtos, categorias e diferenciais reais. NUNCA use perguntas genéricas padrão. PROIBIDO usar duplo hífen ou travessão.',
        userPrompt: `Dossiê: ${JSON.stringify({
          brand: dossier.brand,
          flagship: dossier.flagshipProduct?.name,
          priceRange,
          storeAddress,
          hasStorefrontPhoto,
          productsText,
          businessGoal,
          categories: dossier.catalogSummary?.categories?.slice(0, 6).map((c) => `${c.name} (${c.count})`),
          topSkus: topSkusPayload.slice(0, 8),
          userPrompt,
        })}. Responda JSON conciso: {schemaVersion:"1.0",detectedNiche,recommendedCampaignTheme,contextSummaryPt,questions:[{id,order,type:"single_choice_cards|multi_select_chips|short_text_input",title,helperText,recommendedDefault,options:[{id,label,hint}],mapsToTarget}]}. Cite produtos/serviços ou endereço reais. Gere exatamente 5 perguntas curtas (order 1..5, máximo 3 opções cada).`,
        maxTokens: 1100,
        timeoutMs: 65000,
      });
      if (glm.ok && glm.data) {
        parsedRes = parseOrRepairBriefQuestionsJson(glm.data, { profile, campaignTheme, userPrompt, pageGoal });
      }
    }

    if (!parsedRes) {
      if (strictGlm) {
        throw new ApiError(
          502,
          'A inteligência CompanyGen não respondeu agora para gerar suas 5 perguntas personalizadas. Nenhum crédito foi cobrado — tente novamente.',
        );
      }
      parsedRes = {
        valid: true,
        usedFallback: true,
        data: generateContextualBriefQuestions({ profile, campaignTheme, userPrompt, pageGoal }),
      };
    }

    const cleanedQuestions = sanitizeFormulaV9Document
      ? stripAiDashFlags
      : (v) => stripDashesText(v);
    const cleanTree = (val) => {
      if (typeof val === 'string') return stripDashesText(cleanedQuestions(val));
      if (Array.isArray(val)) return val.map(cleanTree);
      if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) out[k] = cleanTree(v);
        return out;
      }
      return val;
    };
    const finalQuestionsJson = cleanTree(parsedRes.data);

    const productEvidenceArchetype = classifyBusinessArchetype({
      segment: dossier?.brand?.segment || '',
      storeName: dossier?.brand?.name || '',
      products: activeProducts,
    });
    const detectedNiche = stripDashesText(
      productEvidenceArchetype.archetype !== 'varejo_geral'
        ? productEvidenceArchetype.nicheLabel
        : finalQuestionsJson?.detectedNiche || dossier?.brand?.segment || 'Comércio Autoral',
    );
    if (finalQuestionsJson && productEvidenceArchetype.archetype !== 'varejo_geral') {
      finalQuestionsJson.detectedNiche = detectedNiche;
    }
    const flagshipProductName = stripDashesText(
      dossier?.flagshipProduct?.name || topSkusPayload[0]?.name || '',
    );

    const recommendedSectionsPreview = [
      { id: 'hero', title: 'Capa Editorial de Abertura', role: `${detectedNiche} com chamada principal e CTA` },
      { id: 'categories', title: 'Portais de Categorias', role: 'Navegação rápida por linha de produto/serviço' },
      { id: 'catalog', title: 'Catálogo com Sacola Direta', role: `${activeProducts.length || 1} item(ns) com pedido no WhatsApp/Pix` },
      ...(isConsultiveBrief
        ? [{ id: 'schedule', title: 'Agenda Semanal Seg a Dom', role: 'Horários e reserva de atendimento' }]
        : [{ id: 'bundles', title: 'Sugestão de Kits & Destaques', role: 'Combinações para elevar o pedido médio' }]),
      { id: 'faq', title: 'Perguntas & Garantias', role: 'Entrega, retirada e formas de pagamento' },
    ];

    const recommendedExtraPages = [
      {
        slug: 'ofertas-kits',
        title: isConsultiveBrief ? 'Planos & Pacotes' : 'Combos & Ofertas Especiais',
        description: isConsultiveBrief
          ? 'Página para comparar pacotes mensais e sessões.'
          : 'Página focada em combos e promoções de giro rápido.',
        campaignTheme: 'evergreen',
        creditsCost: 3,
        selected: false,
      },
      {
        slug: 'sobre-atendimento',
        title: 'Sobre Nós & Localização',
        description: 'História da marca, horários Seg a Dom, endereço e canais diretos.',
        campaignTheme: isConsultiveBrief ? 'consultorio' : 'evergreen',
        creditsCost: 3,
        selected: false,
      },
    ];

    return send(res, 200, {
      ok: true,
      questionsJson: finalQuestionsJson,
      understandingSummary: {
        detectedNiche,
        flagshipProduct: flagshipProductName,
        flagshipItem: dossier?.flagshipProduct || null,
        priceRange,
        avgPriceCents,
        minPriceCents,
        maxPriceCents,
        totalActiveSkus: activeProducts.length,
        missingPhotosCount,
        recommendedLayoutArchetype: recommendedArchetype.id,
        recommendedAddons,
        recommendedSectionsPreview,
        recommendedExtraPages,
      },
      fallbackUsed: parsedRes.usedFallback,
      creditsCharged: 0,
    });
  }

  // 1c. POST /api/store-molde/onboarding-assist (0 cr — organiza texto livre + sugere SKUs iniciais com GLM)
  if (pathname === '/api/store-molde/onboarding-assist') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 512 * 1024);
    const storeName = stripDashesText(String(body?.storeName || 'Minha Loja').trim().slice(0, 90));
    const segmentHint = stripDashesText(String(body?.segment || '').trim().slice(0, 80));
    const catalogSample = stripDashesText(String(body?.catalogSample || '').trim().slice(0, 500));
    const rawNotes = stripDashesText(String(body?.rawNotes || '').trim().slice(0, 900));
    const goalText = stripDashesText(String(body?.goalText || '').trim().slice(0, 260));
    if (!rawNotes && !catalogSample && !storeName) {
      throw new ApiError(400, 'Conte brevemente o que sua loja vende para a IA organizar.');
    }
    const glm = await callGlm53Json({
      systemPrompt:
        'Você ajuda um lojista brasileiro a organizar os dados da loja em PT-BR. Priorize EXCLUSIVAMENTE o ramo real indicado em `catalogSample` e `segmentHint` — nunca invente produtos de outros nichos. Responda APENAS JSON válido com: {"segment":"...","description":"descrição comercial limpa de 1 a 2 frases","goalSuggestion":"objetivo comercial objetivo","products":[{"name":"...","category":"...","priceCents":9900,"description":"..."}]}. Máximo 6 produtos plausíveis caso não haja lista prévia. PROIBIDO usar duplo hífen ou travessão.',
      userPrompt: JSON.stringify({ storeName, segmentHint, catalogSample, rawNotes, goalText }),
      maxTokens: 900,
      timeoutMs: 22000,
    });
    if (!glm.ok || !glm.data || typeof glm.data !== 'object') {
      throw new ApiError(502, 'A IA não conseguiu organizar seus dados agora. Tente novamente (0 cr).');
    }
    const items = Array.isArray(glm.data.products)
      ? glm.data.products.slice(0, 6).map((p, idx) => ({
          id: `ai_seed_${idx + 1}_${Date.now().toString(36)}`,
          sku: `IA-${String(idx + 1).padStart(3, '0')}`,
          name: stripDashesText(String(p?.name || `Item ${idx + 1}`)).slice(0, 80),
          category: stripDashesText(String(p?.category || glm.data.segment || 'Geral')).slice(0, 48),
          description: stripDashesText(String(p?.description || '')).slice(0, 220),
          priceCents: Math.max(0, Math.round(Number(p?.priceCents || 0))),
          variation: 'Padrão',
          stock: 15,
          stockQty: 15,
          trackStock: true,
          active: true,
          approvedAsset: true,
          itemType: 'produto_fisico',
        }))
      : [];
    return send(res, 200, {
      ok: true,
      segment: stripDashesText(String(glm.data.segment || 'Comércio Local')).slice(0, 60),
      description: stripDashesText(String(glm.data.description || rawNotes)).slice(0, 320),
      goalSuggestion: stripDashesText(String(glm.data.goalSuggestion || goalText)).slice(0, 180),
      products: items,
    });
  }

  // 1b. GET /api/store-molde/recommended-pages (Sugestões personalizadas para o negócio sem templates genéricos)
  if (pathname === '/api/store-molde/recommended-pages') {
    if (req.method !== 'GET') throw new ApiError(405, 'Método indisponível.');
    const { current } = await loadProfileState(user, directory);
    const profile = current?.data || {};
    const recommendations = buildRecommendedPagesForProfile(profile);
    return send(res, 200, { ok: true, ...recommendations });
  }

  // 2. POST /api/store-molde/generate-full (10 cr base, 15 cr com pacote de artes)
  if (pathname === '/api/store-molde/generate-full') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 2 * 1024 * 1024);
    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    let clientAborted = false;
    const onClose = () => {
      if (!res.writableEnded) clientAborted = true;
    };
    req.on?.('close', onClose);
    try {
      const result = await generateFullStorefrontMolde({
        user,
        root,
        directory,
        profile,
        useGlm: body?.useGlm !== false,
        generateImages: Boolean(body?.generateImages),
        maxImages: Number.isFinite(Number(body?.maxImages)) ? Number(body.maxImages) : 5,
        includeArtPack: Boolean(body?.includeArtPack),
        layoutArchetype: String(body?.layoutArchetype || '').trim(),
        selectedAddons: Array.isArray(body?.selectedAddons) ? body.selectedAddons : [],
        chargeCredits: true,
        clientJobId: String(body?.clientJobId || ''),
        briefAnswers: body?.briefAnswers && typeof body.briefAnswers === 'object' ? body.briefAnswers : {},
        questionsJson: body?.questionsJson && typeof body.questionsJson === 'object' ? body.questionsJson : null,
        isAborted: () => clientAborted || res.destroyed || res.writableEnded,
        readJsonFile,
        atomicWriteJson,
        loadProfileState,
        saveProfileFn: saveProfileState,
      });
      if (result.aborted) {
        return;
      }
      if (!result.ok && result.status === 402) {
        return send(res, 402, result);
      }
      return send(res, 200, result);
    } finally {
      req.off?.('close', onClose);
    }
  }

  // 3. POST /api/store-molde/create-page (3 cr base · 5 cr campanha · 8 cr c/ artes)
  if (pathname === '/api/store-molde/create-page') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 2 * 1024 * 1024);

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const pageTitle = String(body?.title || 'Coleção Especial').trim().slice(0, 60);
    const slug = slugifyTitle(body?.slug || pageTitle);
    const campaignTheme = String(body?.campaignTheme || 'evergreen');
    const includeArtPack = Boolean(body?.includeArtPack);
    const briefAnswers = body?.briefAnswers && typeof body.briefAnswers === 'object' ? body.briefAnswers : {};
    const pagePrompt = String(body?.prompt || `Subpágina ${pageTitle} para ${profile?.business?.name || 'a loja'}.`).trim();
    const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey).slice(0, 120) : undefined;

    const actionKey = includeArtPack
      ? 'create_subpage_with_art'
      : campaignTheme !== 'evergreen'
        ? 'create_subpage_campaign'
        : 'create_subpage';
    const subpageCost = CREDIT_ACTION_COSTS[actionKey] || CREDIT_ACTION_COSTS.create_subpage;

    const currentBalance = await getCreditBalance({
      user,
      bearer: user?.bearer,
      directory,
      readJsonFile,
    });
    if (currentBalance < subpageCost) {
      return send(res, 402, {
        ok: false,
        status: 402,
        error: 'CREDITS_INSUFFICIENT',
        message: `Saldo insuficiente (${currentBalance} cr disponíveis, necessário ${subpageCost} cr).`,
        balance: currentBalance,
        required: subpageCost,
      });
    }

    let clientAborted = false;
    const onClose = () => {
      if (!res.writableEnded) clientAborted = true;
    };
    req.on?.('close', onClose);

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
          systemPrompt: 'Responda apenas JSON válido PT-BR para arquitetar subpágina completa de loja. PROIBIDO usar duplo hífen ou travessão no texto.',
          userPrompt: `Loja: ${profile?.business?.name || 'Loja'}. Subpágina: "${pageTitle}". Pedido: "${pagePrompt}". JSON: {"heroTitle":"...","heroSubtitle":"...","seoTitle":"...","seoDescription":"...","benefits":[{"title":"...","text":"..."}]}`,
          timeoutMs: 35000,
        });
        if (glm.ok && glm.data) {
          if (glm.data.heroTitle) heroTitle = stripAiDashFlags(String(glm.data.heroTitle)).slice(0, 90);
          if (glm.data.heroSubtitle) heroSubtitle = stripAiDashFlags(String(glm.data.heroSubtitle)).slice(0, 180);
          if (glm.data.seoTitle) seoTitle = stripAiDashFlags(String(glm.data.seoTitle)).slice(0, 80);
          if (glm.data.seoDescription) seoDescription = stripAiDashFlags(String(glm.data.seoDescription)).slice(0, 160);
          if (Array.isArray(glm.data.benefits) && glm.data.benefits.length >= 2) {
            benefitsList = glm.data.benefits.slice(0, 3).map((b) => ({
              icon: 'sparkles',
              title: stripAiDashFlags(String(b?.title || 'Destaque')).slice(0, 50),
              text: stripAiDashFlags(String(b?.text || '')).slice(0, 120),
            }));
          }
        }
      }
      if (clientAborted || res.destroyed || res.writableEnded) {
        return;
      }

      const storeIdentityId =
        profile?.brand?.storeIdentityId ||
        computeStoreIdentityId({
          slug: profile?.publishedStore?.slug || slug,
          niche: profile?.business?.segment || '',
          name: profile?.business?.name || '',
        });
      const combo = pickExperienceCombo(storeIdentityId);

      const themePalette =
        campaignTheme === 'natal'
          ? { primary: '#0C1A13', accent: '#B3262E', neutral: '#F5F1E8', displayVoice: 'archivo' }
          : campaignTheme === 'black_friday'
            ? { primary: '#0B0A09', accent: '#FF5B14', neutral: '#EFE8DC', displayVoice: 'big_shoulders' }
            : campaignTheme === 'consultorio'
              ? { primary: '#1E3530', accent: '#C65D3B', neutral: '#F6F0E6', displayVoice: 'fraunces' }
              : { primary: profile?.brand?.primaryColor || '#111827', accent: profile?.brand?.accentColor || '#0B4DB8', neutral: '#F8FAFC', displayVoice: 'archivo' };

      const promoDeadline = String(briefAnswers?.q_promo_mechanic?.deadlineLabel || 'Oferta de Temporada');
      const promoDiscount = Math.max(5, Math.min(60, Number(briefAnswers?.q_promo_mechanic?.discountPercent || (campaignTheme === 'black_friday' ? 30 : 20))));
      const promiseSub = String(briefAnswers?.q_hero_promise || briefAnswers?.q_main_objection || heroSubtitle || pagePrompt).slice(0, 200);
      const signals = extractSpreadsheetSignals({
        products: Array.isArray(profile?.catalog?.products) ? profile.catalog.products : [],
        business: profile?.business || {},
      });
      const wantsCentered =
        body?.textAnchor === 'center' ||
        briefAnswers?.q_layout_direction === 'centered_editorial' ||
        signals?.recommendedAlignments?.defaultHeroAlignment === 'center';
      const chosenTypoScale =
        body?.typoScale ||
        (wantsCentered ? 'editorial_xxl' : signals?.recommendedAlignments?.defaultTypoScale || 'refined_lg');

      const atomicSectionsForTheme =
        campaignTheme === 'natal'
          ? [
              {
                tuple: [`sec_${slug}_hero`, 'campaign_christmas_hero', 'ESTADO_2'],
                surface: 'ui:bg=#0C1A13 lum=0.06',
                direction: { textAnchor: wantsCentered ? 'center' : 'left', typoScale: chosenTypoScale },
                textSlots: [
                  { micro: ['left_col', 'display', heroTitle.toUpperCase(), 'ui:sz=92 wt=900', 'icon:none'] },
                  { micro: ['left_col', 'body', promiseSub, 'ui:sz=16 wt=400', 'icon:none'] },
                ],
                content: { ctaPrimaryLabel: 'APROVEITAR SELEÇÃO', couponCode: 'NATAL20', discountPercent: promoDiscount, deadlineLabel: promoDeadline },
              },
              {
                tuple: [`sec_${slug}_checkpoints`, 'campaign_christmas_checkpoints', 'ESTADO_2'],
                surface: 'ui:bg=#12261C lum=0.08',
                textSlots: [{ micro: ['top_left', 'heading', 'SELEÇÃO EM ETAPAS', 'ui:sz=48 wt=900', 'icon:none'] }],
                content: { accentHeading: 'DA TEMPORADA', goldHex: '#C9A24A' },
              },
            ]
          : campaignTheme === 'black_friday'
            ? [
                {
                  tuple: [`sec_${slug}_hero`, 'campaign_blackfriday_hero', 'ESTADO_2'],
                  surface: 'ui:bg=#0B0A09 lum=0.04',
                  direction: { textAnchor: wantsCentered ? 'center' : 'left', typoScale: 'poster_mega' },
                  textSlots: [
                    { micro: ['left_col', 'display', `${heroTitle.split(' ').slice(0, 2).join('|').toUpperCase()}`, 'ui:sz=130 wt=900', 'icon:none'] },
                    { micro: ['left_col', 'body', promiseSub, 'ui:sz=16 wt=400', 'icon:none'] },
                  ],
                  content: { subheadline: promoDeadline.toUpperCase(), stampText: `-${promoDiscount}%`, stampSub: 'LOTE PROMOCIONAL' },
                },
                {
                  tuple: [`sec_${slug}_drop`, 'campaign_blackfriday_drop', 'ESTADO_2'],
                  surface: 'ui:bg=#0B0A09 lum=0.04',
                  textSlots: [{ micro: ['top_left', 'heading', 'OS LOTES', 'ui:sz=92 wt=900', 'icon:none'] }],
                  content: { stampLabel: `SAVE ${promoDiscount}%` },
                },
              ]
            : campaignTheme === 'consultorio'
              ? [
                  {
                    tuple: [`sec_${slug}_hero`, 'clinic_editorial_hero', 'ESTADO_2'],
                    surface: 'ui:bg=#F6F0E6 lum=0.95',
                    direction: { textAnchor: wantsCentered ? 'center' : 'left', typoScale: chosenTypoScale },
                    textSlots: [
                      { micro: ['left_col', 'display', heroTitle, 'ui:sz=54 wt=600', 'icon:none'] },
                      { micro: ['left_col', 'body', promiseSub, 'ui:sz=16 wt=400', 'icon:none'] },
                    ],
                    content: { ctaPrimaryLabel: 'Agendar atendimento' },
                  },
                  {
                    tuple: [`sec_${slug}_map`, 'clinic_symptom_map', 'ESTADO_2'],
                    surface: 'ui:bg=#1E3530 lum=0.14',
                    textSlots: [{ micro: ['top_left', 'heading', 'Qual é a sua necessidade? Toque para ver.', 'ui:sz=36 wt=600', 'icon:none'] }],
                  },
                  {
                    tuple: [`sec_${slug}_tiers`, 'clinic_pricing_tiers', 'ESTADO_2'],
                    surface: 'ui:bg=#FBF8F2 lum=0.97',
                    textSlots: [{ micro: ['top_left', 'heading', 'Valores e condições transparentes.', 'ui:sz=36 wt=600', 'icon:none'] }],
                  },
                ]
              : [
                  {
                    tuple: [`sec_${slug}_hero`, wantsCentered ? 'hero_centered' : 'hero_split', 'ESTADO_2'],
                    surface: wantsCentered ? 'ui:bg=#FFFFFF lum=0.98' : 'ui:bg=anchor_dark lum=0.14',
                    direction: { textAnchor: wantsCentered ? 'center' : 'left', typoScale: chosenTypoScale },
                    textSlots: [
                      { micro: [wantsCentered ? 'hero_center' : 'left_col', 'display', heroTitle, `ui:sz=${wantsCentered ? 76 : 56} wt=800`, 'icon:none'] },
                      { micro: [wantsCentered ? 'hero_center' : 'left_col', 'body', promiseSub, 'ui:sz=16 wt=400', 'icon:none'] },
                    ],
                  },
                  {
                    tuple: [`sec_${slug}_cat`, 'catalog_full_grid', 'ESTADO_2'],
                    surface: 'ui:bg=ground lum=0.98',
                    textSlots: [{ micro: ['top_left', 'heading', pageTitle, 'ui:sz=30 wt=800', 'icon:none'] }],
                  },
                ];

      const subAtomicBlueprint = {
        engineSeed: { groundMode: 'warm_linen', displayVoice: themePalette.displayVoice, bodyVoice: 'manrope' },
        brandTokens: {
          archetype: campaignTheme,
          paletteSource: 'campaign_subpage_builder',
          colors: { primary: themePalette.primary, accent: themePalette.accent, neutral: themePalette.neutral },
          fontPairing: themePalette.displayVoice,
        },
        imageRequests: [],
        sections: [
          ...atomicSectionsForTheme,
          {
            tuple: [`sec_${slug}_catalog`, 'catalog_full_grid', 'ESTADO_2'],
            surface: 'ui:bg=ground lum=0.97',
            textSlots: [{ micro: ['top_left', 'heading', `Seleção · ${pageTitle}`, 'ui:sz=30 wt=800', 'icon:none'] }],
          },
        ],
      };

      const newPage = {
        id: `page_${slug}`,
        slug,
        filename: `pages/${slug}.html`,
        title: pageTitle,
        campaignTheme,
        seoTitle,
        seoDescription,
        storeIdentityId,
        experienceCombo: combo,
        isHome: false,
        atomicBlueprint: subAtomicBlueprint,
        sections: [
          {
            id: `sec_hero_${slug}`,
            type: 'HeroSection',
            config: {
              variant: 'split',
              eyebrow: '',
              title: heroTitle,
              subtitle: promiseSub,
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

      if (clientAborted || res.destroyed || res.writableEnded) {
        return;
      }

      const debit = await debitCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: actionKey,
        amount: subpageCost,
        idempotencyKey,
        metadata: { pageFilename: `pages/${slug}.html`, pageTitle, campaignTheme, includeArtPack, phase: 'commit' },
        readJsonFile,
        atomicWriteJson,
      });
      if (!debit.ok) return send(res, 402, debit);

      let nextIr;
      try {
        nextIr = await serializeMoldeMutation(directory, async () => {
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
      } catch (persistErr) {
        await refundCredits({
          user,
          directory,
          action: actionKey,
          amount: debit.debited || subpageCost,
          metadata: { pageFilename: `pages/${slug}.html`, reason: persistErr instanceof Error ? persistErr.message : 'create_page_persist_failed', referenceId: debit?.entry?.id },
          readJsonFile,
          atomicWriteJson,
        }).catch(() => {});
        throw persistErr;
      }

      return send(res, 200, {
        ok: true,
        page: newPage,
        formulasIr: nextIr,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } finally {
      req.off?.('close', onClose);
    }
  }

  // 3b. POST /api/store-molde/ensure-pack — Multi-IA paralelo para gerar várias telas extras em lote
  if (pathname === '/api/store-molde/ensure-pack') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 2 * 1024 * 1024);
    const requestedPages = Array.isArray(body?.pages) ? body.pages.slice(0, 6) : [];
    if (requestedPages.length === 0) {
      throw new ApiError(400, 'Selecione ao menos 1 tela extra para gerar.');
    }

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const briefAnswers = body?.briefAnswers && typeof body.briefAnswers === 'object' ? body.briefAnswers : {};
    const storeIdentityId =
      profile?.brand?.storeIdentityId ||
      computeStoreIdentityId({
        slug: profile?.publishedStore?.slug || 'loja',
        niche: profile?.business?.segment || '',
        name: profile?.business?.name || '',
      });
    const combo = pickExperienceCombo(storeIdentityId);

    const buildOnePageTask = async (spec) => {
      const pageTitle = stripDashesText(String(spec?.title || 'Nova Tela').trim().slice(0, 60));
      const slug = slugifyTitle(spec?.slug || pageTitle);
      const campaignTheme = String(spec?.campaignTheme || 'evergreen');
      const pagePrompt = stripDashesText(
        String(spec?.description || spec?.prompt || `Subpágina ${pageTitle} para ${profile?.business?.name || 'a loja'}.`).trim(),
      );

      let heroTitle = pageTitle;
      let heroSubtitle = pagePrompt.slice(0, 180);
      let seoTitle = `${pageTitle} · ${profile?.business?.name || 'Loja'}`;
      let seoDescription = pagePrompt.slice(0, 155);
      let benefitsList = [
        { icon: 'sparkles', title: 'Seleção Exclusiva', text: 'Itens escolhidos para esta página.' },
        { icon: 'shield', title: 'Atendimento Direto', text: 'Fale com a loja no WhatsApp.' },
        { icon: 'truck', title: 'Entrega ou Retirada', text: 'Escolha a forma ideal no checkout.' },
      ];

      if (body?.useGlm !== false) {
        const ai = await callGlm53Json({
          systemPrompt: 'Responda apenas JSON válido PT-BR para arquitetar subpágina de vitrine. PROIBIDO usar duplo hífen ou travessão.',
          userPrompt: `Loja: ${profile?.business?.name || 'Loja'} (${profile?.business?.segment || 'Comércio'}). Tela extra: "${pageTitle}". Objetivo: "${pagePrompt}". JSON: {"heroTitle":"...","heroSubtitle":"...","seoTitle":"...","seoDescription":"...","benefits":[{"title":"...","text":"..."}]}`,
          timeoutMs: 32000,
        }).catch(() => ({ ok: false }));

        if (ai.ok && ai.data) {
          if (ai.data.heroTitle) heroTitle = stripDashesText(String(ai.data.heroTitle)).slice(0, 90);
          if (ai.data.heroSubtitle) heroSubtitle = stripDashesText(String(ai.data.heroSubtitle)).slice(0, 180);
          if (ai.data.seoTitle) seoTitle = stripDashesText(String(ai.data.seoTitle)).slice(0, 80);
          if (ai.data.seoDescription) seoDescription = stripDashesText(String(ai.data.seoDescription)).slice(0, 160);
          if (Array.isArray(ai.data.benefits) && ai.data.benefits.length >= 2) {
            benefitsList = ai.data.benefits.slice(0, 3).map((b) => ({
              icon: 'sparkles',
              title: stripDashesText(String(b?.title || 'Destaque')).slice(0, 50),
              text: stripDashesText(String(b?.text || '')).slice(0, 120),
            }));
          }
        }
      }

      const cost = CREDIT_ACTION_COSTS.create_subpage || 3;
      const newPage = {
        id: `page_${slug}`,
        slug,
        filename: `pages/${slug}.html`,
        title: pageTitle,
        campaignTheme,
        seoTitle,
        seoDescription,
        storeIdentityId,
        experienceCombo: combo,
        isHome: false,
        atomicBlueprint: {
          engineSeed: { groundMode: 'warm_linen', displayVoice: 'archivo', bodyVoice: 'manrope' },
          brandTokens: {
            archetype: campaignTheme,
            paletteSource: 'ensure_pack_parallel',
            colors: {
              primary: profile?.brand?.primaryColor || '#111827',
              accent: profile?.brand?.accentColor || '#2563EB',
              neutral: '#F8FAFC',
            },
          },
          imageRequests: [],
          sections: [
            {
              tuple: [`sec_${slug}_hero`, 'hero_centered', 'ESTADO_2'],
              surface: 'ui:bg=#FFFFFF lum=0.98',
              direction: { textAnchor: 'center', typoScale: 'editorial_xxl' },
              textSlots: [
                { micro: ['hero_center', 'display', heroTitle, 'ui:sz=64 wt=800', 'icon:none'] },
                { micro: ['hero_center', 'body', heroSubtitle, 'ui:sz=16 wt=400', 'icon:none'] },
              ],
            },
            {
              tuple: [`sec_${slug}_cat`, 'catalog_full_grid', 'ESTADO_2'],
              surface: 'ui:bg=ground lum=0.98',
              textSlots: [{ micro: ['top_left', 'heading', pageTitle, 'ui:sz=30 wt=800', 'icon:none'] }],
            },
          ],
        },
        sections: [
          {
            id: `sec_hero_${slug}`,
            type: 'HeroSection',
            config: {
              variant: briefAnswers?.q_layout_direction === 'centered_editorial' ? 'centered' : 'split',
              eyebrow: '',
              title: heroTitle,
              subtitle: heroSubtitle,
              primaryCta: { label: 'Explorar seleção', href: '#catalogo' },
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
              subtitle: 'Itens disponíveis nesta página.',
              itemActionLabel: 'Adicionar à sacola',
              emptyImageMode: 'neutral_gray',
            },
          },
        ],
      };

      return { page: newPage, cost };
    };

    // Limite de concorrência = 3 chamadas paralelas
    const builtResults = [];
    for (let i = 0; i < requestedPages.length; i += 3) {
      const batch = requestedPages.slice(i, i + 3);
      const settled = await Promise.allSettled(batch.map((item) => buildOnePageTask(item)));
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value?.page) {
          builtResults.push(s.value);
        }
      }
    }

    if (builtResults.length === 0) {
      throw new ApiError(502, 'Não foi possível gerar as telas extras agora (0 créditos cobrados).');
    }

    const totalCost = builtResults.reduce((acc, r) => acc + r.cost, 0);
    const debit = await debitCredits({
      user,
      bearer: user?.bearer,
      directory,
      action: 'ensure_pack_pages',
      amount: totalCost,
      metadata: { slugs: builtResults.map((r) => r.page.slug) },
      readJsonFile,
      atomicWriteJson,
    });
    if (!debit.ok) return send(res, 402, debit);

    let nextIr;
    try {
      nextIr = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
        const builtSlugs = new Set(builtResults.map((r) => r.page.filename));
        const keptPages = (Array.isArray(formulasIr.pages) ? formulasIr.pages : []).filter(
          (p) => p && !builtSlugs.has(p.filename),
        );
        const updatedIr = attachStoreSnapshotToDoc(
          {
            ...formulasIr,
            pages: [...keptPages, ...builtResults.map((r) => r.page)],
            updatedAt: new Date().toISOString(),
          },
          profile,
        );
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
    } catch (persistErr) {
      await refundCredits({
        user,
        directory,
        action: 'ensure_pack_pages',
        amount: debit.debited || totalCost,
        metadata: { reason: persistErr instanceof Error ? persistErr.message : 'ensure_pack_persist_failed' },
        readJsonFile,
        atomicWriteJson,
      }).catch(() => {});
      throw persistErr;
    }

    return send(res, 200, {
      ok: true,
      pagesAdded: builtResults.map((r) => r.page),
      formulasIr: nextIr,
      debited: debit.debited,
      balanceAfter: debit.balanceAfter,
    });
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

    const editCost = CREDIT_ACTION_COSTS.edit_block || 3;
    const currentBal = await getCreditBalance({
      user,
      bearer: user?.bearer,
      directory,
      readJsonFile,
    });
    if (currentBal < editCost) {
      return send(res, 402, {
        ok: false,
        status: 402,
        error: 'CREDITS_INSUFFICIENT',
        message: `Saldo insuficiente (${currentBal} cr disponíveis, necessário ${editCost} cr).`,
        balance: currentBal,
        required: editCost,
      });
    }

    let clientAborted = false;
    const onClose = () => {
      clientAborted = true;
    };
    req.on?.('close', onClose);

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
            systemPrompt: 'Responda JSON curto PT-BR com título e subtítulo fiéis ao pedido. PROIBIDO usar duplo hífen ou travessão.',
            userPrompt: `Loja: ${profile?.business?.name || 'Loja'}. Seção: ${sectionType}. Pedido: "${instruction}". JSON: {"title":"...","subtitle":"..."}`,
            timeoutMs: 25000,
          });
        }
      } else {
        const sIdx = baseSections.findIndex((s) => s.id === targetId);
        if (sIdx < 0) throw new ApiError(404, 'Seção não encontrada nesta página.');
        existingBeforeEdit = baseSections[sIdx];
        if (instruction && body?.useGlm !== false) {
          glmResult = await callGlm53Json({
            systemPrompt: 'Ajuste título e subtítulo da seção em JSON PT-BR sem alterar preços. PROIBIDO usar duplo hífen ou travessão.',
            userPrompt: `Seção: ${existingBeforeEdit.type}. Título atual: "${existingBeforeEdit.config?.title || ''}". Pedido: "${instruction}". JSON: {"title":"...","subtitle":"..."}`,
            timeoutMs: 25000,
          });
        }
      }

      if (clientAborted || res.destroyed || res.writableEnded) {
        return;
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
          let title = stripAiDashFlags(String(cfg.title || 'Nova seção')).slice(0, 90);
          let subtitle = stripAiDashFlags(String(cfg.subtitle || (!isMetaCommandInstruction(instruction) ? instruction : '') || '')).slice(0, 180);
          if (glmResult?.ok && glmResult.data) {
            if (glmResult.data.title) title = stripAiDashFlags(String(glmResult.data.title)).slice(0, 90);
            if (glmResult.data.subtitle) subtitle = stripAiDashFlags(String(glmResult.data.subtitle)).slice(0, 180);
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
              if (glmResult.data.title) existing.config.title = stripAiDashFlags(String(glmResult.data.title)).slice(0, 90);
              if (glmResult.data.subtitle) existing.config.subtitle = stripAiDashFlags(String(glmResult.data.subtitle)).slice(0, 180);
            } else {
              const extracted = extractExplicitReplacementCopy(instruction);
              if (extracted && 'subtitle' in existing.config) {
                existing.config.subtitle = extracted.slice(0, 180);
              } else {
                throw new ApiError(502, 'A IA não conseguiu responder agora. Seus créditos não foram cobrados.');
              }
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
          if (JSON.stringify(existingBeforeEdit) === JSON.stringify(updatedSection)) {
            throw new ApiError(422, 'A alteração não modificou o bloco — nenhum crédito foi cobrado.');
          }
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

      const debit = await debitCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: 'edit_block',
        amount: editCost,
        metadata: { mode, sectionType, targetId, pageFilename: pageFilename || 'index.html', phase: 'commit' },
        readJsonFile,
        atomicWriteJson,
      });
      if (!debit.ok) return send(res, 402, debit);

      return send(res, 200, {
        ok: true,
        section: resultingSection,
        block: resultingSection,
        formulasIr: nextIr,
        debited: debit.debited,
        balanceAfter: debit.balanceAfter,
      });
    } finally {
      req.off?.('close', onClose);
    }
  }

  // 4b. POST /api/store-molde/patch-section (Patch Cirúrgico, Prop Patch 0 cr, Reorder 0 cr, Restore Snapshot 0 cr, Add Section 0/1 cr, Subpages)
  if (pathname === '/api/store-molde/patch-section') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 4 * 1024 * 1024);

    const { current } = await loadProfileState(user, directory);
    const profile = body?.profile || current?.data || {};
    const targetId = String(body?.sectionId || body?.blockId || '').trim();
    const instruction = String(body?.instruction || '').trim();
    const experienceMode = body?.experienceMode;
    const pageFilename = String(body?.pageFilename || '').trim().replace(/^\/+/, '');
    if (pageFilename && (pageFilename.includes('..') || pageFilename.includes('\\'))) {
      throw new ApiError(400, 'pageFilename inválido.');
    }
    const allowedActions = new Set([
      'patch',
      'prop_patch',
      'reorder_section',
      'restore_snapshot',
      'add_section',
      'delete',
      'change_image',
      'switch_component',
      'co_direction',
      'group_items',
    ]);
    const targetAction = allowedActions.has(body?.action) ? body.action : 'patch';
    const microTarget = String(body?.microTarget || 'block').trim();
    const selectedSkuIds = Array.isArray(body?.selectedSkuIds)
      ? body.selectedSkuIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 24)
      : [];

    if (!targetId && targetAction !== 'restore_snapshot' && targetAction !== 'add_section') {
      throw new ApiError(400, 'Informe a seção que deseja ajustar.');
    }
    if (
      targetAction === 'patch' &&
      !instruction &&
      !experienceMode &&
      !body?.config &&
      !body?.nodeStyles
    ) {
      throw new ApiError(400, 'Descreva o ajuste desejado para esta seção.');
    }
    if (targetAction === 'group_items' && selectedSkuIds.length === 0) {
      throw new ApiError(400, 'Selecione pelo menos 1 item para aplicar ao bloco.');
    }
    if (targetAction === 'reorder_section') {
      const dir = String(body?.direction || '').toLowerCase();
      if (dir !== 'up' && dir !== 'down') {
        throw new ApiError(400, 'Informe direction: "up" ou "down" para reordenar.');
      }
    }

    const isSubpage = Boolean(pageFilename && pageFilename !== 'index.html');
    const pageOverrideKey = isSubpage ? pageFilename : 'index.html';
    const isAddWithAi = targetAction === 'add_section' && Boolean(instruction) && body?.useGlm !== false;
    const isFreeAction =
      targetAction === 'prop_patch' ||
      targetAction === 'reorder_section' ||
      targetAction === 'restore_snapshot' ||
      targetAction === 'delete' ||
      targetAction === 'group_items' ||
      (targetAction === 'add_section' && !isAddWithAi) ||
      (targetAction === 'change_image' && Boolean(body?.imageUrl)) ||
      (targetAction === 'co_direction' && !instruction && !body?.regenerateImage);

    const rawRequestedCost = Number(body?.costCredits);
    const defaultCost =
      targetAction === 'switch_component'
        ? 1.5
        : microTarget !== 'block'
          ? 0.5
          : 1;
    const cost = isFreeAction
      ? 0
      : isAddWithAi
        ? Math.max(0.5, Number(CREDIT_ACTION_COSTS.edit_block || 1))
        : Number.isFinite(rawRequestedCost) && rawRequestedCost >= 0
          ? Math.min(5, Math.round(rawRequestedCost * 100) / 100)
          : defaultCost;

    if (!isFreeAction) {
      const currentBal = await getCreditBalance({
        user,
        bearer: user?.bearer,
        directory,
        readJsonFile,
      });
      if (currentBal < cost) {
        return send(res, 402, {
          ok: false,
          status: 402,
          error: 'CREDITS_INSUFFICIENT',
          message: `Saldo insuficiente (${currentBal} cr disponíveis, necessário ${cost} cr).`,
          balance: currentBal,
          required: cost,
        });
      }
    }

    let clientAborted = false;
    const onClose = () => {
      clientAborted = true;
    };
    req.on?.('close', onClose);

    const commitPatchDebit = async () => {
      if (isFreeAction || cost <= 0) {
        return { ok: true, debited: 0, balanceAfter: undefined };
      }
      if (clientAborted || res.destroyed || res.writableEnded) {
        throw new ApiError(499, 'Requisição encerrada antes da cobrança.');
      }
      const d = await debitCredits({
        user,
        bearer: user?.bearer,
        directory,
        action: isAddWithAi ? 'edit_block' : 'patch_section',
        amount: cost,
        metadata: {
          sectionId: targetId,
          action: targetAction,
          microTarget,
          instruction: instruction.slice(0, 120),
          pageFilename: pageFilename || 'index.html',
          phase: 'commit',
        },
        readJsonFile,
        atomicWriteJson,
      });
      if (!d.ok) return d;
      return d;
    };

    try {
      if (body?.simulateGlmFailure === true) {
        throw new Error('O motor visual IA não respondeu a tempo (timeout simulado).');
      }

      // Restore Snapshot (0 cr)
      if (targetAction === 'restore_snapshot') {
        const { nextIr, restoredId } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          let snapshotPayload =
            body?.snapshot && typeof body.snapshot === 'object'
              ? body.snapshot
              : body?.formulasIr && typeof body.formulasIr === 'object'
                ? body.formulasIr
                : body?.formulaIr && typeof body.formulaIr === 'object'
                  ? body.formulaIr
                  : null;
          let usedSnapId = String(body?.snapshotId || '');
          if (!snapshotPayload) {
            const diskSnap = await readStoreMoldeSnapshot(directory, usedSnapId);
            if (diskSnap?.formulasIr) {
              snapshotPayload = diskSnap.formulasIr;
              usedSnapId = diskSnap.id || usedSnapId;
            }
          }
          if (!snapshotPayload || typeof snapshotPayload !== 'object') {
            throw new ApiError(400, 'Nenhum snapshot disponível para restaurar.');
          }
          const currentIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          const candidateIr =
            snapshotPayload.version === FORMULA_V9_VERSION
              ? snapshotPayload
              : {
                  ...currentIr,
                  ...(Array.isArray(snapshotPayload.sections) ? { sections: snapshotPayload.sections } : {}),
                  ...(snapshotPayload.atomicBlueprint ? { atomicBlueprint: snapshotPayload.atomicBlueprint } : {}),
                  ...(Array.isArray(snapshotPayload.pages) ? { pages: snapshotPayload.pages } : {}),
                  ...(snapshotPayload.designTokens ? { designTokens: snapshotPayload.designTokens } : {}),
                };
          const updatedIr = attachStoreSnapshotToDoc({ ...candidateIr, updatedAt: new Date().toISOString() }, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({
            user,
            directory,
            formulasIr: updatedIr,
            imageJobs: state.imageJobs,
            loadProfileState,
            saveProfileFn: saveProfileState,
          }).catch(() => null);
          return { nextIr: updatedIr, restoredId: usedSnapId || 'client_snapshot' };
        });
        const balAfter = await getCreditBalance({ user, bearer: user?.bearer, directory, readJsonFile }).catch(() => undefined);
        return send(res, 200, {
          ok: true,
          restored: true,
          snapshotId: restoredId,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: 0,
          balanceAfter: balAfter,
        });
      }

      // Add Section (0 cr bloco padrão, 1 cr com copy IA)
      if (targetAction === 'add_section') {
        const sectionType = String(body?.sectionType || body?.blockType || 'HighlightsGrid').trim();
        let glmAddRes = null;
        if (isAddWithAi) {
          glmAddRes = await callGlm53Json({
            systemPrompt:
              'Responda JSON curto PT-BR com título e subtítulo para nova seção da loja. PROIBIDO usar duplo hífen ou travessão.',
            userPrompt: `Loja: ${profile?.business?.name || 'Loja'}. Tipo de bloco: ${sectionType}. Pedido: "${instruction}". JSON: {"title":"...","subtitle":"..."}`,
            timeoutMs: 22000,
          });
          if (!glmAddRes.ok && glmAddRes.error && glmAddRes.error !== 'GLM_NOT_CONFIGURED') {
            throw new ApiError(502, 'A IA não respondeu a tempo para criar o texto da nova seção. Seus créditos não foram cobrados.');
          }
        }
        if (clientAborted || res.destroyed || res.writableEnded) {
          return;
        }

        const { resultingSection, nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'add_section', pageFilename: pageOverrideKey }).catch(() => {});

          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          const cfg = body?.config && typeof body.config === 'object' ? { ...body.config } : {};
          let title = stripDashesText(stripAiDashFlags(String(cfg.title || 'Destaque da Loja'))).slice(0, 90);
          let subtitle = stripDashesText(stripAiDashFlags(String(cfg.subtitle || (!isMetaCommandInstruction(instruction) ? instruction : '') || 'Confira os detalhes e fale conosco no WhatsApp.'))).slice(0, 180);
          if (glmAddRes?.ok && glmAddRes.data) {
            if (glmAddRes.data.title) title = stripDashesText(stripAiDashFlags(String(glmAddRes.data.title))).slice(0, 90);
            if (glmAddRes.data.subtitle) subtitle = stripDashesText(stripAiDashFlags(String(glmAddRes.data.subtitle))).slice(0, 180);
          }

          const newId = `sec_${sectionType.toLowerCase().replace(/[^a-z0-9]+/g, '')}_${Date.now().toString(36)}`;
          const candidate =
            sectionType === 'FaqAccordion' || sectionType === 'ContextualFaq'
              ? {
                  id: newId,
                  type: sectionType === 'ContextualFaq' ? 'ContextualFaq' : 'FaqAccordion',
                  config: {
                    title,
                    ...(sectionType === 'ContextualFaq' ? { subtitle } : {}),
                    items: Array.isArray(cfg.items) && cfg.items.length > 0
                      ? cfg.items
                      : [{ q: 'Como funciona o atendimento e envio?', a: 'Atendemos diretamente pelo WhatsApp com prazos claros.' }],
                  },
                }
              : sectionType === 'ComplementaryBundles'
                ? {
                    id: newId,
                    type: 'ComplementaryBundles',
                    config: {
                      title: title || 'Combine e Economize',
                      subtitle,
                      items: Array.isArray(cfg.items) && cfg.items.length > 0
                        ? cfg.items
                        : [
                            {
                              id: 'combo_1',
                              title: 'Seleção Combinada',
                              description: subtitle,
                              skuIds: (profile?.catalog?.products || [])
                                .filter((p) => p && p.active !== false)
                                .slice(0, 2)
                                .map((p) => String(p.sku || p.id)),
                              totalCents: 0,
                            },
                          ],
                    },
                  }
                : sectionType === 'DifferentialsStrip'
                  ? {
                      id: newId,
                      type: 'DifferentialsStrip',
                      config: {
                        items: Array.isArray(cfg.items) && cfg.items.length > 0
                          ? cfg.items
                          : [
                              { icon: 'ShieldCheck', title: title.slice(0, 50), text: subtitle.slice(0, 100) },
                              { icon: 'MessageCircle', title: 'Atendimento Direto', text: 'Fale com a equipe no WhatsApp.' },
                              { icon: 'Clock', title: 'Agilidade', text: 'Retorno rápido em horário comercial.' },
                            ],
                      },
                    }
                  : sectionType === 'EditorialMediaSplit'
                    ? {
                        id: newId,
                        type: 'EditorialMediaSplit',
                        config: {
                          variant: cfg.variant === 'media_left' ? 'media_left' : 'media_right',
                          eyebrow: stripDashesText(String(cfg.eyebrow || 'Destaque')).slice(0, 50),
                          title,
                          body: subtitle || title,
                          bullets: Array.isArray(cfg.bullets) ? cfg.bullets : [],
                        },
                      }
                    : {
                        id: newId,
                        type: 'HighlightsGrid',
                        config: {
                          title,
                          subtitle,
                          columns: cfg.columns === 3 ? 3 : 2,
                          cards: Array.isArray(cfg.cards) && cfg.cards.length > 0
                            ? cfg.cards
                            : [{ eyebrow: 'Destaque', title, description: subtitle, ctaLabel: 'Ver catálogo', href: '#catalogo' }],
                        },
                      };

          const sanitizedDoc = sanitizeFormulaV9Document({ ...formulasIr, sections: [candidate] }, profile);
          const checkNode = SectionNodeSchema.safeParse(sanitizedDoc.sections[0] || candidate);
          if (!checkNode.success) {
            throw new ApiError(400, checkNode.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' '));
          }
          const createdSection = checkNode.data;
          const nextSections = [...ctxPage.sections];
          const insertIdx = Number.isInteger(Number(body?.insertIndex))
            ? Math.max(0, Math.min(nextSections.length, Number(body.insertIndex)))
            : -1;
          const afterIdx = body?.afterSectionId ? nextSections.findIndex((s) => s?.id === body.afterSectionId) : -1;
          if (insertIdx >= 0) {
            nextSections.splice(insertIdx, 0, createdSection);
          } else if (afterIdx >= 0) {
            nextSections.splice(afterIdx + 1, 0, createdSection);
          } else {
            const footerIdx = nextSections.findIndex((s) => s?.type === 'RichFooter');
            if (footerIdx >= 0) nextSections.splice(footerIdx, 0, createdSection);
            else nextSections.push(createdSection);
          }

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          if (ctxPage.atomicBlueprint && Array.isArray(ctxPage.atomicBlueprint.sections)) {
            const atomicRole =
              sectionType === 'EditorialMediaSplit'
                ? 'split_story'
                : sectionType === 'DifferentialsStrip'
                  ? 'open_columns_strip'
                  : sectionType === 'ComplementaryBundles'
                    ? 'bundle_builder_calculator'
                    : 'coupled_media_grid';
            const newAtomicTuple = {
              tuple: [createdSection.id, atomicRole, 'ESTADO_2'],
              surface: 'ui:bg=ground lum=0.97 | ux:<auto_wcag:4.5>',
              layout: 'cols=3 py=56 px=24 gap=20 radOut=18',
              type: 'k=2.4 wt=800',
              media: 'none',
              catalog: 'ui:mode=none take=0 per_cat=0',
              textSlots: [
                { micro: ['top_left', 'heading', title, 'ui:sz=28 wt=800', 'icon:none'], mediaPick: 'none' },
                { micro: ['top_left', 'body', subtitle, 'ui:sz=15 wt=400', 'icon:none'], mediaPick: 'none' },
              ],
              content: {},
            };
            const nextAtomicSecs = [...ctxPage.atomicSections];
            const footerAtomicIdx = nextAtomicSecs.findIndex((s) => s?.tuple?.[1] === 'anchor_footer');
            if (footerAtomicIdx >= 0) nextAtomicSecs.splice(footerAtomicIdx, 0, newAtomicTuple);
            else nextAtomicSecs.push(newAtomicTuple);
            const auditedBp = auditAndRepairAtomicBlueprint({ ...ctxPage.atomicBlueprint, sections: nextAtomicSecs }, profile);
            nextAtomicBlueprint = auditedBp.data || { ...ctxPage.atomicBlueprint, sections: nextAtomicSecs };
          }

          const nextDocBase = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDocBase, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { resultingSection: createdSection, nextIr: updatedIr };
        });

        const finalDebit = await commitPatchDebit();
        if (!finalDebit.ok) return send(res, 402, finalDebit);
        return send(res, 200, {
          ok: true,
          section: resultingSection,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: finalDebit.debited,
          balanceAfter: finalDebit.balanceAfter,
        });
      }

      const stateSnapshot = await readStorefrontMoldeState(directory);
      const baseIr = stateSnapshot.formulasIr || buildNeutralFallbackV9Document(profile);
      const basePageCtx = resolveActivePageContext(baseIr, isSubpage, pageFilename);
      if (!basePageCtx.found) {
        throw new ApiError(404, 'Página não encontrada nesta loja.');
      }
      const baseSections = basePageCtx.sections;
      const baseAtomicSections = basePageCtx.atomicSections;

      const sIdx = baseSections.findIndex((s) => s.id === targetId);
      const atomicIdx = baseAtomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
      if (sIdx < 0 && atomicIdx < 0) {
        throw new ApiError(404, 'Seção não encontrada na página atual.');
      }

      // Reorder Section (0 cr)
      if (targetAction === 'reorder_section') {
        const dir = String(body?.direction || 'up').toLowerCase();
        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'reorder_section', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          const moveInList = (list, matchFn, fixedFirstFn, fixedLastFn) => {
            const arr = [...list];
            const idx = arr.findIndex(matchFn);
            if (idx < 0) return arr;
            const targetPos = dir === 'up' ? idx - 1 : idx + 1;
            if (targetPos < 0 || targetPos >= arr.length) return arr;
            if (fixedFirstFn(arr[targetPos]) || fixedLastFn(arr[targetPos])) return arr;
            if (fixedFirstFn(arr[idx]) || fixedLastFn(arr[idx])) return arr;
            const [item] = arr.splice(idx, 1);
            arr.splice(targetPos, 0, item);
            return arr;
          };

          const nextSections = moveInList(
            ctxPage.sections,
            (s) => s?.id === targetId,
            (s) => s?.type === 'HeaderNav',
            (s) => s?.type === 'RichFooter',
          );
          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          if (ctxPage.atomicBlueprint && Array.isArray(ctxPage.atomicBlueprint.sections)) {
            const nextAtomicSecs = moveInList(
              ctxPage.atomicSections,
              (s) => s?.tuple?.[0] === targetId,
              () => false,
              (s) => s?.tuple?.[1] === 'anchor_footer',
            );
            nextAtomicBlueprint = { ...ctxPage.atomicBlueprint, sections: nextAtomicSecs };
          }

          const nextDocBase = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDocBase, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        return send(res, 200, {
          ok: true,
          reorderedId: targetId,
          direction: dir,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: 0,
        });
      }

      // Direct Property & Style Patch (0 cr — nodePath + nodeStyles)
      if (targetAction === 'prop_patch') {
        const nodePath = String(body?.nodePath || 'root').trim();
        const rawStyles =
          body?.nodeStyles && typeof body.nodeStyles === 'object'
            ? body.nodeStyles
            : body?.styles && typeof body.styles === 'object'
              ? body.styles
              : body?.props && typeof body.props === 'object'
                ? body.props
                : {};
        const stylePatch = sanitizeNodeStylesPatch({
          ...rawStyles,
          ...(body?.fontSizePx !== undefined ? { fontSizePx: body.fontSizePx } : {}),
          ...(body?.textAlign !== undefined ? { textAlign: body.textAlign } : {}),
          ...(body?.textColor !== undefined ? { textColor: body.textColor } : {}),
          ...(body?.bgColor !== undefined ? { bgColor: body.bgColor } : {}),
          ...(body?.columns !== undefined ? { columns: body.columns } : {}),
          ...(body?.hidden !== undefined ? { hidden: body.hidden } : {}),
          ...(body?.ctaLabel !== undefined ? { ctaLabel: body.ctaLabel } : {}),
          ...(body?.directText !== undefined ? { directText: body.directText } : {}),
          ...(body?.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
          ...(body?.groupDisplayMode !== undefined ? { groupDisplayMode: body.groupDisplayMode } : {}),
        });

        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'prop_patch', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curAtomicIdx >= 0 && ctxPage.atomicBlueprint) {
            const groundMode = ctxPage.atomicBlueprint?.engineSeed?.groundMode || 'warm_linen';
            const nextAtomicSecs = ctxPage.atomicSections.map((s, idx) =>
              idx === curAtomicIdx
                ? applyPropPatchToAtomicSection(s, {
                    nodePath,
                    stylePatch,
                    profile,
                    sectionIndex: idx,
                    groundMode,
                  })
                : s,
            );
            const auditedBp = auditAndRepairAtomicBlueprint({ ...ctxPage.atomicBlueprint, sections: nextAtomicSecs }, profile);
            nextAtomicBlueprint = auditedBp.data || { ...ctxPage.atomicBlueprint, sections: nextAtomicSecs };
          }

          let nextSections = ctxPage.sections;
          const curSIdx = ctxPage.sections.findIndex((s) => s?.id === targetId);
          if (curSIdx >= 0) {
            const patchedClassic = applyPropPatchToClassicSection(ctxPage.sections[curSIdx], { nodePath, stylePatch });
            const sanitizedSingle = sanitizeFormulaV9Document({ ...formulasIr, sections: [patchedClassic] }, profile);
            const checkNode = SectionNodeSchema.safeParse(sanitizedSingle.sections[0] || patchedClassic);
            nextSections = ctxPage.sections.map((s, idx) => (idx === curSIdx && checkNode.success ? checkNode.data : s));
          }

          const curOverrides = formulasIr?.storeInfo?.sectionOverrides && typeof formulasIr.storeInfo.sectionOverrides === 'object'
            ? formulasIr.storeInfo.sectionOverrides
            : {};
          const pageOv = curOverrides[pageOverrideKey] && typeof curOverrides[pageOverrideKey] === 'object'
            ? curOverrides[pageOverrideKey]
            : {};
          const prevSecOv = pageOv[targetId] && typeof pageOv[targetId] === 'object' ? pageOv[targetId] : {};
          const isRootPath = !nodePath || nodePath === 'root' || nodePath === 'section';
          const nextSecOv = {
            ...prevSecOv,
            ...(isRootPath ? stylePatch : {}),
            nodeStylesByPath: {
              ...(prevSecOv.nodeStylesByPath || {}),
              [nodePath || 'root']: { ...(prevSecOv.nodeStylesByPath?.[nodePath || 'root'] || {}), ...stylePatch },
            },
          };

          const withPage = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          withPage.storeInfo = {
            ...(withPage.storeInfo || {}),
            sectionOverrides: {
              ...curOverrides,
              [pageOverrideKey]: { ...pageOv, [targetId]: nextSecOv },
            },
          };

          const updatedIr = attachStoreSnapshotToDoc(withPage, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });

        return send(res, 200, {
          ok: true,
          nodePath,
          nodeStyles: stylePatch,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: 0,
        });
      }

      // Co-Direcao Interativa Imagem + Texto (DOC 04 — funciona em Home e Subpáginas)
      if (targetAction === 'co_direction') {
        const directionPatch = body?.direction && typeof body.direction === 'object' ? body.direction : {};
        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'co_direction', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curAtomicIdx >= 0 && ctxPage.atomicBlueprint) {
            const nextAtomicSecs = ctxPage.atomicSections.map((s) => {
              if (s?.tuple?.[0] !== targetId) return s;
              return {
                ...s,
                direction: { ...(s.direction || {}), ...directionPatch },
                ...(Array.isArray(directionPatch.hotspots) && directionPatch.hotspots.length > 0
                  ? { content: { ...(s.content || {}), hotspots: directionPatch.hotspots } }
                  : {}),
              };
            });
            nextAtomicBlueprint = { ...ctxPage.atomicBlueprint, sections: nextAtomicSecs };
          }

          let nextSections = ctxPage.sections;
          const curSIdx = ctxPage.sections.findIndex((s) => s?.id === targetId);
          if (curSIdx >= 0) {
            nextSections = ctxPage.sections.map((s, idx) => {
              if (idx !== curSIdx) return s;
              const cfg = { ...(s.config || {}) };
              if (s.type === 'EditorialMediaSplit' && (directionPatch.textAnchor === 'left' || directionPatch.textAnchor === 'right')) {
                cfg.variant = directionPatch.textAnchor === 'left' ? 'media_right' : 'media_left';
              }
              return { ...s, config: cfg };
            });
          }

          const curOverrides = formulasIr?.storeInfo?.sectionOverrides && typeof formulasIr.storeInfo.sectionOverrides === 'object'
            ? formulasIr.storeInfo.sectionOverrides
            : {};
          const pageOv = curOverrides[pageOverrideKey] && typeof curOverrides[pageOverrideKey] === 'object'
            ? curOverrides[pageOverrideKey]
            : {};
          const prevSecOv = pageOv[targetId] && typeof pageOv[targetId] === 'object' ? pageOv[targetId] : {};

          const nextDoc = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          nextDoc.storeInfo = {
            ...(nextDoc.storeInfo || {}),
            sectionOverrides: {
              ...curOverrides,
              [pageOverrideKey]: {
                ...pageOv,
                [targetId]: { ...prevSecOv, direction: { ...(prevSecOv.direction || {}), ...directionPatch } },
              },
            },
          };

          const updatedIr = attachStoreSnapshotToDoc(nextDoc, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        const finalDebit = await commitPatchDebit();
        if (!finalDebit.ok) return send(res, 402, finalDebit);
        return send(res, 200, {
          ok: true,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: finalDebit.debited,
          balanceAfter: finalDebit.balanceAfter,
        });
      }

      // Selecionar grupo específico de itens para este bloco (0 cr — Home e Subpáginas)
      if (targetAction === 'group_items') {
        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curAtomicIdx >= 0 && ctxPage.atomicBlueprint) {
            nextAtomicBlueprint = {
              ...ctxPage.atomicBlueprint,
              sections: ctxPage.atomicSections.map((s) =>
                s?.tuple?.[0] === targetId
                  ? {
                      ...s,
                      content: {
                        ...(s.content && typeof s.content === 'object' ? s.content : {}),
                        selectedSkuIds,
                        featuredIds: selectedSkuIds,
                      },
                    }
                  : s,
              ),
            };
          }
          const nextSections = ctxPage.sections.map((s) =>
            s?.id === targetId ? { ...s, config: { ...(s.config || {}), selectedSkuIds } } : s,
          );
          const nextDoc = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDoc, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        return send(res, 200, {
          ok: true,
          selectedSkuIds,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: 0,
        });
      }

      // Troca cirúrgica de imagem (URL enviada/upload OU nova ilustração gerada via RunPod — Home e Subpáginas)
      if (targetAction === 'change_image') {
        let nextImageUrl = sanitizeSafeAssetUrl(String(body?.imageUrl || '').trim(), '');
        if (!nextImageUrl) {
          const moldeSpec = compileImagePromptFromMolde({
            role: String(body?.role || 'hero_stage'),
            moldeId: body?.moldeId,
            storeName: profile?.business?.name || 'Loja',
            segment: profile?.business?.segment || 'Comércio Local',
            subject: String(body?.imagePrompt || instruction || profile?.catalog?.products?.[0]?.name || ''),
            surfaceHex: profile?.brand?.primaryColor || '#0F172A',
            primaryHex: profile?.brand?.primaryColor || '#0F172A',
            accentHex: profile?.brand?.accentColor || '#C65D3B',
          });
          const gen = await generateRunPodImage({
            prompt: moldeSpec.prompt,
            negativePrompt: moldeSpec.negativePrompt,
            artDirectionBible: { visualStyle: 'stylized_editorial_illustration' },
            width: moldeSpec.width || 1152,
            height: moldeSpec.height || 768,
          }).catch(() => ({ ok: false }));
          if (gen?.buffer) {
            const ext = gen.ext || 'webp';
            const slotKey = `patch_${Date.now().toString(36)}`;
            const relPath = `assets/generated/${slotKey}.${ext}`;
            await atomicWriteBuffer(path.join(getStorefrontMoldeDir(directory), relPath), gen.buffer);
            nextImageUrl = `/api/store-molde/${encodeURIComponent(user.id)}/${relPath}`;
          } else if (gen?.ok && gen?.url) {
            nextImageUrl = String(gen.url);
          }
        }
        if (!nextImageUrl) {
          throw new ApiError(400, 'Informe uma imagem ou habilite a geração via RunPod.');
        }

        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'change_image', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curAtomicIdx >= 0 && ctxPage.atomicBlueprint) {
            nextAtomicBlueprint = {
              ...ctxPage.atomicBlueprint,
              sections: ctxPage.atomicSections.map((s) =>
                s?.tuple?.[0] === targetId
                  ? { ...s, resolvedMedia: { ...(s.resolvedMedia || {}), imageUrl: nextImageUrl } }
                  : s,
              ),
            };
          }
          const nextSections = ctxPage.sections.map((s) =>
            s?.id === targetId
              ? { ...s, config: { ...(s.config || {}), imageUrl: nextImageUrl } }
              : s,
          );
          const nextDoc = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDoc, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        const finalDebit = await commitPatchDebit();
        if (!finalDebit.ok) return send(res, 402, finalDebit);
        return send(res, 200, {
          ok: true,
          imageUrl: nextImageUrl,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: finalDebit.debited,
          balanceAfter: finalDebit.balanceAfter,
        });
      }

      // Conversão ao vivo de componente / mecânica de campanha no bloco atômico selecionado (Home e Subpáginas)
      if (targetAction === 'switch_component') {
        const nextRole = String(body?.targetRole || '').trim();
        if (!nextRole) throw new ApiError(400, 'Informe o componente de destino.');
        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'switch_component', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curAtomicIdx < 0 || !ctxPage.atomicBlueprint) {
            throw new ApiError(400, 'Troca de componente disponível nos blocos modulares da vitrine.');
          }
          const nextAtomicSecs = ctxPage.atomicSections.map((s) => {
            if (s?.tuple?.[0] !== targetId) return s;
            const cloned = JSON.parse(JSON.stringify(s));
            cloned.tuple = [targetId, nextRole, cloned.tuple?.[2] || 'ESTADO_2'];
            if (body?.heading) {
              cloned.textSlots = [
                { micro: ['top_left', 'heading', stripDashesText(String(body.heading)).slice(0, 100), 'ui:sz=30 wt=800', 'icon:none'], mediaPick: 'none' },
                ...(Array.isArray(cloned.textSlots) ? cloned.textSlots.filter((t) => t?.micro?.[1] !== 'heading') : []),
              ];
            }
            return cloned;
          });
          const audited = auditAndRepairAtomicBlueprint({ ...ctxPage.atomicBlueprint, sections: nextAtomicSecs }, profile);
          const nextAtomicBlueprint = audited.data || { ...ctxPage.atomicBlueprint, sections: nextAtomicSecs };
          const nextDoc = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDoc, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        const finalDebit = await commitPatchDebit();
        if (!finalDebit.ok) return send(res, 402, finalDebit);
        return send(res, 200, {
          ok: true,
          targetRole: nextRole,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: finalDebit.debited,
          balanceAfter: finalDebit.balanceAfter,
        });
      }

      // Exclusão segura de seção selecionada pelo usuário (0 cr — Home e Subpáginas)
      if (targetAction === 'delete') {
        const { nextIr } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'delete', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');

          let nextAtomicBlueprint = ctxPage.atomicBlueprint;
          let nextSections = ctxPage.sections;
          const curAtomicIdx = ctxPage.atomicSections.findIndex((s) => s?.tuple?.[0] === targetId);
          const curSIdx = ctxPage.sections.findIndex((s) => s?.id === targetId);

          if (curAtomicIdx >= 0 && ctxPage.atomicBlueprint) {
            if (ctxPage.atomicSections.length <= 2) {
              throw new ApiError(400, 'A vitrine precisa manter pelo menos 2 blocos principais.');
            }
            nextAtomicBlueprint = {
              ...ctxPage.atomicBlueprint,
              sections: ctxPage.atomicSections.filter((s) => s?.tuple?.[0] !== targetId),
            };
          }
          if (curSIdx >= 0) {
            if (ctxPage.sections.length <= 2) {
              throw new ApiError(400, 'A vitrine precisa manter pelo menos 2 blocos principais.');
            }
            nextSections = ctxPage.sections.filter((s) => s?.id !== targetId);
          }

          const nextDoc = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextSections,
            nextAtomicBlueprint,
          });
          const updatedIr = attachStoreSnapshotToDoc(nextDoc, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: updatedIr, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: updatedIr, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { nextIr: updatedIr };
        });
        return send(res, 200, {
          ok: true,
          deletedId: targetId,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: 0,
        });
      }

      // Patch cirúrgico em seção do atomicBlueprint (Home e Subpáginas — tem precedência quando rendered via atomicBlueprint)
      if (atomicIdx >= 0) {
        const atomicBefore = baseAtomicSections[atomicIdx];
        const wantsDailySchedule = /(?:dia\s*a\s*dia|cada\s+dia|mostrar.*dia|seg(?:unda)?\s*(?:a|até)\s*dom|semana|programaç[aã]o)/i.test(
          instruction,
        );
        let glmAtomicRes = null;
        if (instruction && body?.useGlm !== false) {
          glmAtomicRes = await callGlm53Json({
            systemPrompt:
              'Você executa um Patch Estrutural, Tipográfico e de Conteúdo em UMA seção atômica da vitrine em PT-BR. Responda APENAS JSON válido combinando textos E mudanças visuais quando pedidas: {"headline":"...","subheadline":"...","ctaPrimaryLabel":"...","surfaceBgHex":"#FFFFFF","textAlign":"left|center|right","fontFamily":"Georgia, serif|Impact, Haettenschweiler, sans-serif|Playfair Display, serif|Space Grotesk, sans-serif","fontSizePx":52,"typoScale":"refined_lg|editorial_xxl|poster_mega","upgradeRole":"hero_centered|hero_stage|hero_split|bento_spotlight|sticky_lookbook|bundle_builder_calculator|interactive_image_text_stage|catalog_full_grid","columns":2,"storyParagraphs":["..."]}. Só inclua campos que façam sentido para o pedido. Se o usuário pedir para centralizar, coloque textAlign:"center" (e hero_centered se for capa). Se pedir fonte mais chamativa/marcante, preencha fontFamily + typoScale:"poster_mega" + fontSizePx >= 48. Se pedir componente mais avançado, mude upgradeRole para bento_spotlight, sticky_lookbook ou bundle_builder_calculator. PROIBIDO usar duplo hífen ou travessão.',
            userPrompt: JSON.stringify({
              loja: profile?.business?.name || 'Loja',
              sectionId: targetId,
              role: atomicBefore?.tuple?.[1],
              alvoMicro: microTarget,
              direction: atomicBefore?.direction,
              nodeStyles: atomicBefore?.nodeStyles,
              textSlots: atomicBefore?.textSlots,
              content: atomicBefore?.content,
              instrucaoDoLojista: instruction,
            }),
            timeoutMs: 26000,
          });
        }
        if (clientAborted || res.destroyed || res.writableEnded) {
          return;
        }
        const d =
          glmAtomicRes?.ok && glmAtomicRes.data && typeof glmAtomicRes.data === 'object'
            ? glmAtomicRes.data
            : null;
        if (!d && instruction && body?.useGlm !== false && !wantsDailySchedule && isMetaCommandInstruction(instruction)) {
          throw new ApiError(502, 'A IA não respondeu a tempo para aplicar esse ajuste. Seus créditos não foram cobrados.');
        }

        const { resultingSection, nextIr, patchChanged } = await serializeMoldeMutation(directory, async () => {
          const state = await readStorefrontMoldeState(directory);
          const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
          await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'patch_atomic', targetId, pageFilename: pageOverrideKey }).catch(() => {});
          const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
          if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');
          const nextAtomicSecs = [...ctxPage.atomicSections];
          const curIdx = nextAtomicSecs.findIndex((s) => s?.tuple?.[0] === targetId);
          if (curIdx < 0) throw new ApiError(404, 'Seção atômica não encontrada.');
          const beforeStr = JSON.stringify(nextAtomicSecs[curIdx]);
          const sec = JSON.parse(beforeStr);

          let headlinePatch =
            typeof d?.headline === 'string' && d.headline.trim() ? stripDashesText(stripAiDashFlags(d.headline.trim())) : '';
          let subPatch =
            typeof d?.subheadline === 'string' && d.subheadline.trim()
              ? stripDashesText(stripAiDashFlags(d.subheadline.trim()))
              : '';

          if (!d && wantsDailySchedule) {
            headlinePatch = 'Programação & Horários Dia a Dia';
            subPatch = 'Veja o atendimento de segunda a domingo e combine pelo WhatsApp.';
            sec.content = {
              ...(sec.content && typeof sec.content === 'object' ? sec.content : {}),
              slots: buildDailyScheduleSlots(),
            };
          } else if (!d && instruction && !isMetaCommandInstruction(instruction)) {
            if (microTarget === 'title') headlinePatch = stripDashesText(stripAiDashFlags(instruction.slice(0, 100)));
            else if (microTarget === 'cta') {
              sec.content = {
                ...(sec.content && typeof sec.content === 'object' ? sec.content : {}),
                ctaPrimaryLabel: stripDashesText(stripAiDashFlags(instruction.slice(0, 40))),
              };
            } else {
              subPatch = stripDashesText(stripAiDashFlags(instruction.slice(0, 140)));
            }
          }

          const slots = Array.isArray(sec.textSlots) ? sec.textSlots : [];
          let hitHeadline = false;
          sec.textSlots = slots.map((slot) => {
            const m = Array.isArray(slot?.micro) ? [...slot.micro] : null;
            if (!m) return slot;
            if ((m[1] === 'display' || m[1] === 'heading') && headlinePatch && microTarget !== 'subtitle') {
              m[2] = headlinePatch.slice(0, 120);
              hitHeadline = true;
            } else if ((m[1] === 'body' || m[1] === 'caption') && subPatch && microTarget !== 'title') {
              m[2] = subPatch.slice(0, 220);
            }
            return { ...slot, micro: m };
          });
          if (!hitHeadline && headlinePatch) {
            sec.textSlots.unshift({ micro: ['left_col', 'heading', headlinePatch.slice(0, 120), 'ui:sz=30 wt=800', 'icon:none'], mediaPick: 'none' });
          }

          // Mutações reais de layout, alinhamento, tipografia e upgrade de componente
          const wantsCenter = d?.textAlign === 'center' || /\bcentraliz|\bno\s+meio\b/i.test(instruction);
          const wantsRight = d?.textAlign === 'right';
          const wantsLeft = d?.textAlign === 'left';
          const resolvedAlign = wantsCenter ? 'center' : wantsRight ? 'right' : wantsLeft ? 'left' : undefined;

          if (resolvedAlign || d?.typoScale) {
            sec.direction = {
              ...(sec.direction && typeof sec.direction === 'object' ? sec.direction : {}),
              ...(resolvedAlign ? { textAnchor: resolvedAlign } : {}),
              ...(typeof d?.typoScale === 'string' && ['refined_lg', 'editorial_xxl', 'poster_mega'].includes(d.typoScale)
                ? { typoScale: d.typoScale }
                : {}),
            };
          }

          const prevNs = sec.nodeStyles && typeof sec.nodeStyles === 'object' ? sec.nodeStyles : {};
          const prevNodes = prevNs.nodes && typeof prevNs.nodes === 'object' ? prevNs.nodes : {};
          const nextNodes = { ...prevNodes };
          const isHeroRole = String(sec.tuple?.[1] || '').startsWith('hero_');
          const titleKey = isHeroRole ? 'hero.title' : 'section.title';
          const subKey = isHeroRole ? 'hero.subtitle' : 'section.subtitle';

          if (resolvedAlign) {
            nextNodes.section = { ...(nextNodes.section || {}), textAlign: resolvedAlign };
            nextNodes[titleKey] = { ...(nextNodes[titleKey] || {}), textAlign: resolvedAlign };
            nextNodes[subKey] = { ...(nextNodes[subKey] || {}), textAlign: resolvedAlign };
          }
          if (typeof d?.fontFamily === 'string' && d.fontFamily.trim()) {
            const ff = d.fontFamily.trim().slice(0, 120);
            nextNodes[titleKey] = { ...(nextNodes[titleKey] || {}), fontFamily: ff };
          }
          if (Number.isFinite(Number(d?.fontSizePx)) && Number(d.fontSizePx) >= 18 && Number(d.fontSizePx) <= 96) {
            nextNodes[titleKey] = { ...(nextNodes[titleKey] || {}), fontSizePx: Math.round(Number(d.fontSizePx)) };
          }
          if (Number.isFinite(Number(d?.columns)) && [1, 2, 3, 4].includes(Number(d.columns))) {
            nextNodes['highlights.grid'] = { ...(nextNodes['highlights.grid'] || {}), columns: Number(d.columns) };
            nextNodes['catalog.grid'] = { ...(nextNodes['catalog.grid'] || {}), columns: Number(d.columns) };
          }
          sec.nodeStyles = {
            ...prevNs,
            ...(resolvedAlign ? { textAlign: resolvedAlign } : {}),
            ...(Number.isFinite(Number(d?.columns)) && [1, 2, 3, 4].includes(Number(d.columns)) ? { columns: Number(d.columns) } : {}),
            nodes: nextNodes,
          };

          const ALLOWED_UPGRADE_ROLES = new Set([
            'hero_centered',
            'hero_stage',
            'hero_split',
            'bento_spotlight',
            'sticky_lookbook',
            'coupled_media_grid',
            'bundle_builder_calculator',
            'interactive_image_text_stage',
            'catalog_full_grid',
            'open_columns_strip',
          ]);
          if (typeof d?.upgradeRole === 'string' && ALLOWED_UPGRADE_ROLES.has(d.upgradeRole.trim()) && Array.isArray(sec.tuple)) {
            sec.tuple = [sec.tuple[0], d.upgradeRole.trim(), sec.tuple[2] || 'ESTADO_3'];
          } else if (resolvedAlign === 'center' && sec.tuple?.[1] === 'hero_split') {
            sec.tuple = [sec.tuple[0], 'hero_centered', sec.tuple[2] || 'ESTADO_3'];
          }

          sec.content = {
            ...(sec.content && typeof sec.content === 'object' ? sec.content : {}),
            ...(typeof d?.ctaPrimaryLabel === 'string' && d.ctaPrimaryLabel.trim()
              ? { ctaPrimaryLabel: stripDashesText(stripAiDashFlags(d.ctaPrimaryLabel.trim())).slice(0, 40) }
              : {}),
            ...(Array.isArray(d?.storyParagraphs) && d.storyParagraphs.length > 0
              ? { storyParagraphs: d.storyParagraphs.slice(0, 3).map((p) => stripDashesText(stripAiDashFlags(String(p)))) }
              : {}),
          };
          if (typeof d?.surfaceBgHex === 'string' && /^#[0-9a-f]{6}$/i.test(d.surfaceBgHex.trim())) {
            sec.surface = `ui:bg=${d.surfaceBgHex.trim()} | ux:<auto_wcag:4.5>`;
            sec.surfaceTokens = resolveSectionSurfaceTokens({
              primaryHex: profile?.brand?.primaryColor || '#18181B',
              accentHex: profile?.brand?.accentColor || '#D8A848',
              surfaceStr: sec.surface,
              sectionIndex: curIdx,
              groundMode: ctxPage.atomicBlueprint?.engineSeed?.groundMode || 'warm_linen',
            });
          }
          const changed = JSON.stringify(sec) !== beforeStr;
          nextAtomicSecs[curIdx] = sec;
          const nextBp = { ...(ctxPage.atomicBlueprint || {}), sections: nextAtomicSecs };
          const auditedBp = auditAndRepairAtomicBlueprint(nextBp, profile).data || nextBp;
          const patchedSec = auditedBp?.sections?.[curIdx] || sec;
          const patchedHeadline = patchedSec?.textSlots?.find((sl) => sl?.micro?.[1] === 'display' || sl?.micro?.[1] === 'heading')?.micro?.[2];
          const patchedSub = patchedSec?.textSlots?.find((sl) => sl?.micro?.[1] === 'body')?.micro?.[2];
          const nextClassicSections = Array.isArray(ctxPage.sections)
            ? ctxPage.sections.map((cs) => {
                if (cs?.id !== targetId) return cs;
                const nextCfg = { ...(cs.config || {}) };
                if (patchedHeadline) nextCfg.title = patchedHeadline;
                if (patchedSub) nextCfg.subtitle = patchedSub;
                if (patchedSec?.content?.ctaPrimaryLabel) nextCfg.ctaLabel = patchedSec.content.ctaPrimaryLabel;
                if (typeof d?.surfaceBgHex === 'string' && /^#[0-9a-f]{6}$/i.test(d.surfaceBgHex.trim())) {
                  nextCfg.surfaceBgHex = d.surfaceBgHex.trim();
                }
                if (resolvedAlign) nextCfg.textAlign = resolvedAlign;
                return { ...cs, config: nextCfg };
              })
            : ctxPage.sections;
          const nextDocBase = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
            nextAtomicBlueprint: auditedBp,
            nextSections: nextClassicSections,
          });
          const nextDoc = attachStoreSnapshotToDoc(nextDocBase, profile);
          await writeStorefrontMoldeToDisk({ directory, formulasIr: nextDoc, imageJobs: state.imageJobs });
          await persistIrIntoProfile({ user, directory, formulasIr: nextDoc, imageJobs: state.imageJobs, loadProfileState, saveProfileFn: saveProfileState }).catch(() => null);
          return { resultingSection: sec, nextIr: nextDoc, patchChanged: changed };
        });
        const finalDebit = patchChanged ? await commitPatchDebit() : { ok: true, debited: 0, balanceAfter: undefined };
        if (!finalDebit.ok) return send(res, 402, finalDebit);
        return send(res, 200, {
          ok: true,
          section: resultingSection,
          formulaIr: nextIr,
          formulasIr: nextIr,
          activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
          debited: finalDebit.debited,
          balanceAfter: finalDebit.balanceAfter,
        });
      }

      const existingBeforeEdit = baseSections[sIdx];
      const wantsDailySchedule =
        microTarget === 'schedule' ||
        /(?:dia\s*a\s*dia|cada\s+dia|mostrar.*dia|seg(?:unda)?\s*(?:a|até)\s*dom|semana|programaç[aã]o|hor[aá]rios)/i.test(
          instruction,
        );

      let glmResult = null;
      if (instruction && body?.useGlm !== false) {
        glmResult = await callGlm53Json({
          systemPrompt:
            'Você realiza um Patch Cirúrgico em UMA única seção Formula-IR v9.0 em Português do Brasil. Responda APENAS JSON válido com os campos atualizados (title, subtitle, eyebrow, body, ctaLabel, slots) respeitando o Fold Budget mobile (title <= 58 chars, subtitle <= 115 chars) e sem alterar preços do catálogo. NUNCA copie o pedido do lojista literalmente como texto do site; reescreva em copy comercial real. Quando pedir dia a dia ou horários, preencha "slots" como array de 3 a 7 strings no formato "Dia · Horário · Detalhe". PROIBIDO usar duplo hífen ou travessão.',
          userPrompt: JSON.stringify({
            loja: profile?.business?.name || 'Minha Loja',
            secaoAlvo: existingBeforeEdit.type,
            alvoMicro: microTarget,
            configAtual: existingBeforeEdit.config,
            instrucaoDoLojista: instruction,
          }),
          timeoutMs: 25000,
        });
        if (!glmResult.ok && glmResult.error && glmResult.error !== 'GLM_NOT_CONFIGURED' && body?.strictGlm === true) {
          throw new Error(`Falha no motor GLM (${glmResult.error}).`);
        }
      }

      if (clientAborted || res.destroyed || res.writableEnded) {
        return;
      }

      const { resultingSection, nextIr, criticTips } = await serializeMoldeMutation(directory, async () => {
        const state = await readStorefrontMoldeState(directory);
        const formulasIr = state.formulasIr || buildNeutralFallbackV9Document(profile);
        await pushStoreMoldeSnapshot(directory, formulasIr, { action: 'patch', targetId, pageFilename: pageOverrideKey }).catch(() => {});
        const ctxPage = resolveActivePageContext(formulasIr, isSubpage, pageFilename);
        if (!ctxPage.found) throw new ApiError(404, 'Página não encontrada nesta loja.');
        const sections = [...ctxPage.sections];

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
            if (typeof d.title === 'string' && d.title.trim() && microTarget !== 'subtitle') {
              existing.config.title = stripDashesText(stripAiDashFlags(d.title.trim())).slice(0, existing.type === 'HeroSection' ? 58 : 95);
            }
            if (typeof d.subtitle === 'string' && d.subtitle.trim() && microTarget !== 'title') {
              existing.config.subtitle = stripDashesText(stripAiDashFlags(d.subtitle.trim())).slice(0, existing.type === 'HeroSection' ? 115 : 190);
            }
            if (typeof d.eyebrow === 'string' && d.eyebrow.trim() && 'eyebrow' in existing.config) {
              existing.config.eyebrow = stripDashesText(stripAiDashFlags(d.eyebrow.trim())).slice(0, 58);
            }
            if (typeof d.body === 'string' && d.body.trim() && 'body' in existing.config) {
              existing.config.body = stripDashesText(stripAiDashFlags(d.body.trim())).slice(0, 440);
            }
            if (typeof d.ctaLabel === 'string' && d.ctaLabel.trim() && 'ctaLabel' in existing.config) {
              existing.config.ctaLabel = stripDashesText(stripAiDashFlags(d.ctaLabel.trim())).slice(0, 44);
            }
            if (Array.isArray(d.slots) && d.slots.length > 0 && 'slots' in existing.config) {
              existing.config.slots = d.slots.slice(0, 7).map((sl) => stripDashesText(stripAiDashFlags(String(sl || ''))).slice(0, 78)).filter(Boolean);
            } else if (wantsDailySchedule && 'slots' in existing.config) {
              existing.config.slots = buildDailyScheduleSlots();
            }
          } else if (wantsDailySchedule && existing.type === 'ClosingScheduleSplit') {
            existing.config.eyebrow = 'Atendimento Dia a Dia';
            existing.config.title = 'Horários e Programação da Semana';
            existing.config.subtitle = 'Confira os horários de cada dia e combine seu atendimento pelo WhatsApp.';
            existing.config.slots = buildDailyScheduleSlots();
          } else {
            const explicitCopy = extractExplicitReplacementCopy(instruction);
            const isMeta = isMetaCommandInstruction(instruction);
            if (isMeta && !explicitCopy && body?.useGlm !== false) {
              throw new ApiError(502, 'A IA não respondeu a tempo para interpretar este ajuste. Seus créditos não foram cobrados.');
            }
            const cleanInst = stripDashesText(
              stripAiDashFlags((explicitCopy || instruction).slice(0, existing.type === 'HeroSection' ? 115 : 180)),
            );
            if (
              (microTarget === 'title' || /t[ií]tulo|chamada|headline/i.test(instruction)) &&
              'title' in existing.config
            ) {
              const extracted = instruction
                .replace(/^(?:mudar|alterar|deixar|trocar)\s+(?:o\s+)?(?:t[ií]tulo|chamada|headline)\s*(?:para|:)?\s*/i, '')
                .trim();
              existing.config.title = stripDashesText(stripAiDashFlags(extracted || cleanInst)).slice(
                0,
                existing.type === 'HeroSection' ? 58 : 95,
              );
            } else if (microTarget === 'cta' && 'ctaLabel' in existing.config) {
              existing.config.ctaLabel = cleanInst.slice(0, 44);
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

        const nextDocBase = writeBackActivePageContext(formulasIr, isSubpage, ctxPage.pageIdx, ctxPage.pagesList, {
          nextSections: sections,
        });

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

      const finalDebit = await commitPatchDebit();
      if (!finalDebit.ok) return send(res, 402, finalDebit);

      return send(res, 200, {
        ok: true,
        section: resultingSection,
        formulaIr: nextIr,
        formulasIr: nextIr,
        activePage: buildActivePagePayload(nextIr, isSubpage, pageFilename),
        criticTips,
        debited: finalDebit.debited,
        balanceAfter: finalDebit.balanceAfter,
      });
    } catch (err) {
      const currentBalAfter = await getCreditBalance({
        user,
        bearer: user?.bearer,
        directory,
        readJsonFile,
      }).catch(() => 0);
      const status = err && typeof err.status === 'number' ? err.status : 502;
      return send(res, status, {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir o ajuste com IA agora.',
        refunded: true,
        refundedCredits: 0,
        balanceAfter: currentBalAfter,
      });
    } finally {
      req.off?.('close', onClose);
    }
  }

  // 5. POST /api/store-molde/generate-image (-5 cr schnell, -10 cr hero_dev / edit)
  if (pathname === '/api/store-molde/generate-image') {
    if (req.method !== 'POST') throw new ApiError(405, 'Método indisponível.');
    const body = await readJson(req, 12 * 1024 * 1024);
    const kind = body?.kind === 'hero_dev' ? 'hero_dev' : body?.kind === 'edit' ? 'edit' : 'schnell';
    const actionName =
      kind === 'hero_dev' ? 'generate_hero_dev' : kind === 'edit' ? 'edit_image_qwen' : 'generate_image_schnell';
    const cost = Number(CREDIT_ACTION_COSTS[actionName] ?? (kind === 'schnell' ? 1.5 : 2.5));

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
      const prompt = body?.moldeId || body?.role
        ? compileImagePromptFromMolde({
            role: body?.role || 'hero_stage',
            moldeId: body?.moldeId,
            storeName: String(body?.storeName || 'Loja'),
            segment: String(body?.segment || 'Comércio Local'),
            subject: String(body?.prompt || ''),
            surfaceHex: String(body?.surfaceHex || '#0F172A'),
            accentHex: String(body?.accentHex || '#C65D3B'),
          }).prompt
        : String(body?.prompt || 'Stylized tactile editorial gouache illustration, clean composition, zero photorealism').trim();
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

  // 6. POST /api/store-molde/upload-asset | /api/store-molde/media/upload (0 cr — grátis)
  if (pathname === '/api/store-molde/upload-asset' || pathname === '/api/store-molde/media/upload') {
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
      throw new ApiError(400, 'Versão Formula-IR legada não suportada. Utilize Formula-IR 9.0.');
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
