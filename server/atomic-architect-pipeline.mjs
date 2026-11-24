import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveOklchPaletteSystem } from '../shared/formula-ir/visual-math-engine.mjs';
import { compileImagePromptFromMolde } from '../shared/formula-ir/image-moldes.mjs';
import {
  buildPropertyDrivenSectionPrompt,
  compileSectionPropertiesToTuples,
  resolveLayoutArchetype,
  stripDashesText,
} from './section-property-prompts.mjs';

const __PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUNT_SCRIPT_PATH = path.resolve(__PIPELINE_DIR, '..', 'scripts', 'hunt-product-assets.py');

const VECTOR_ARCHITECT_SYSTEM =
  'Você é Diretor de Arte e Arquiteto de Sistemas Visuais para e-commerce PT-BR. Responda APENAS JSON válido seguindo estritamente as propriedades campo:valor especificadas. PROIBIDO usar duplo hífen ou travessão.';

function deepStripDashes(val) {
  if (typeof val === 'string') return stripDashesText(val);
  if (Array.isArray(val)) return val.map(deepStripDashes);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = deepStripDashes(v);
    }
    return out;
  }
  return val;
}

function hasValidRasterImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;
  if (/^data:image\/svg\+xml/i.test(raw)) return false;
  if (/^(?:javascript|vbscript):/i.test(raw)) return false;
  return /^(?:https?:\/\/|\/|data:image\/(?:png|jpe?g|webp|gif|avif);base64,)/i.test(raw);
}

function sanitizeSkuSlotKey(raw, fallbackIdx) {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44);
  return clean ? `sku_${clean}` : `sku_item_${fallbackIdx + 1}`;
}

export function buildImagePlanForStore(dossier, palette = {}, profile = {}, options = {}) {
  const categories = Array.isArray(dossier?.catalogSummary?.categories)
    ? dossier.catalogSummary.categories.slice(0, 3)
    : [];
  const storeName = stripDashesText(dossier?.brand?.name || 'Loja');
  const segment = stripDashesText(dossier?.brand?.segment || 'Produtos e Atendimento');
  const flagship = stripDashesText(dossier?.flagshipProduct?.name || '');
  const archetype = resolveLayoutArchetype({
    layoutArchetype: options?.layoutArchetype,
    dossier,
    profile,
  });
  const heroItems = categories
    .map((c) => {
      const sample = (c.sampleSkus || []).slice(0, 2).map((s) => stripDashesText(s.name)).filter(Boolean).join(' and ');
      return sample ? `${stripDashesText(c.name)}: ${sample}` : stripDashesText(c.name);
    })
    .join('; ');

  const primaryHex = palette.anchorDarkBg || '#0F172A';
  const accentHex = palette.accentHex || '#C65D3B';
  const neutralHex = palette.groundBg || '#F6F0E6';

  const heroMolde = compileImagePromptFromMolde({
    role: archetype.heroRole,
    storeName,
    segment,
    subject: `minimalist architectural geometric brand atmosphere for ${storeName} (${segment}), abstract clean lighting, strictly zero random products, zero cosmetics bottles, zero unrelated objects`,
    surfaceHex: archetype.heroAtmosphere === 'warm_linen' ? neutralHex : primaryHex,
    primaryHex,
    accentHex,
    neutralHex,
    textAnchor: archetype.heroTextAnchor,
  });

  const editorialRequests = [
    {
      slotId: 'img_hero_main',
      targetSectionId: 'sec_hero',
      moldeId: heroMolde.moldeId,
      aspectRatio: heroMolde.aspectRatio,
      width: heroMolde.width,
      height: heroMolde.height,
      source: 'ai_generate',
      prompt: heroMolde.prompt,
      negativePrompt: `${heroMolde.negativePrompt || ''}, skincare bottle, serum dropper, random unrelated product`.trim(),
    },
  ];

  categories.forEach((cat, idx) => {
    const cleanCat = stripDashesText(cat.name);
    const catMolde = compileImagePromptFromMolde({
      moldeId: 'CHECKPOINT_STAGGER_PORTRAIT_4X5',
      storeName,
      segment,
      subject: `minimalist geometric conceptual category emblem symbolizing "${cleanCat}" in ${segment}, clean vector-inspired studio shape composition, strictly no photorealistic retail products`,
      surfaceHex: neutralHex,
      primaryHex,
      accentHex,
      neutralHex,
    });
    editorialRequests.push({
      slotId: `img_cat_${idx + 1}`,
      targetSectionId: `cat:${cleanCat}`,
      moldeId: catMolde.moldeId,
      aspectRatio: catMolde.aspectRatio,
      width: catMolde.width,
      height: catMolde.height,
      source: 'ai_generate',
      prompt: catMolde.prompt,
      negativePrompt: `${catMolde.negativePrompt || ''}, photorealistic product, smartphone mockup, retail packaging`.trim(),
    });
  });

  // Regra rígida: NUNCA gerar fotos de produtos com IA nem inventar fotos genéricas de catálogo.
  return editorialRequests.slice(0, 4);
}

export function buildCatalogImageSearchQuery(product = {}, { segment = '' } = {}) {
  const name = stripDashesText(product.name || '')
    .replace(/\b\d+\s*(?:ml|g|kg|un|und|l|cm|mm)\b/gi, '')
    .trim();
  const category = stripDashesText(product.category || '').trim();
  const cleanSeg = stripDashesText(segment || '').trim();
  return [name, category, cleanSeg].filter(Boolean).join(' ').slice(0, 120);
}

async function runPythonProductHunt(query, count = 3) {
  return new Promise((resolve) => {
    execFile(
      process.env.CG_HUNT_PYTHON || 'python',
      [HUNT_SCRIPT_PATH, '--query', query, '--count', String(count), '--media-type', 'image'],
      {
        timeout: 8000,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const items = JSON.parse(stdout);
          return resolve(Array.isArray(items) ? items : []);
        } catch {
          return resolve([]);
        }
      },
    );
  });
}

async function huntWikimediaCommons(query, fetchImpl = fetch) {
  if (!query) return [];
  try {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=800&format=json`;
    const res = await fetchImpl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'CompanyGenPostStudio/1.0' },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const pages = Object.values(data?.query?.pages || {});
    return pages
      .map((pg) => {
        const info = Array.isArray(pg?.imageinfo) ? pg.imageinfo[0] : null;
        const mime = String(info?.mime || '').toLowerCase();
        if (mime.includes('svg') || mime.includes('pdf')) return null;
        const url = info?.thumburl || info?.url || '';
        if (!/^https?:\/\//i.test(url) || /\.svg(?:$|\?)/i.test(url)) return null;
        return { rawUrl: url, thumbnailUrl: info?.thumburl || url, source: 'wikimedia' };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function huntCatalogProductImage({
  product = {},
  segment = '',
  fetchImpl = fetch,
  queryCache = null,
} = {}) {
  const primaryQuery = buildCatalogImageSearchQuery(product, { segment });
  const broadQuery = [stripDashesText(product.category || ''), stripDashesText(segment || '')]
    .filter(Boolean)
    .join(' ')
    .trim();

  const tryQuery = async (q) => {
    if (!q) return null;
    const cacheKey = q.toLowerCase();
    if (queryCache && queryCache.has(cacheKey)) {
      return queryCache.get(cacheKey);
    }
    let found = null;
    const ddgsItems = await runPythonProductHunt(q, 5);
    const isCleanPhotoUrl = (urlStr) => {
      const s = String(urlStr || '').toLowerCase();
      if (!/^https?:\/\//i.test(s) || /\.svg(?:$|\?)/i.test(s)) return false;
      const banned = [
        'istockphoto',
        'shutterstock',
        'gettyimages',
        'alamy',
        'depositphotos',
        'dreamstime',
        '123rf',
        'vecteezy',
        'cleanpng',
        'pngtree',
        'watermark',
        'infographic',
        'how-to-brush',
        'wikimedia.org/wiki/file:',
      ];
      return !banned.some((b) => s.includes(b));
    };
    const ddgsMatch = ddgsItems.find(
      (it) => isCleanPhotoUrl(it?.rawUrl || it?.thumbnailUrl),
    );
    if (ddgsMatch) {
      found = { url: isCleanPhotoUrl(ddgsMatch.rawUrl) ? ddgsMatch.rawUrl : ddgsMatch.thumbnailUrl, source: 'ddgs' };
    } else {
      const wikiItems = await huntWikimediaCommons(q, fetchImpl);
      const wikiClean = wikiItems.find((w) => isCleanPhotoUrl(w.thumbnailUrl || w.rawUrl));
      if (wikiClean) {
        found = { url: wikiClean.thumbnailUrl || wikiClean.rawUrl, source: 'wikimedia' };
      }
    }
    if (queryCache && found) {
      queryCache.set(cacheKey, found);
    }
    return found;
  };

  const direct = await tryQuery(primaryQuery);
  return direct || null;
}

/**
 * Busca apenas fotos reais exatas na web quando o SKU não trouxe foto própria.
 * NUNCA gera foto de produto com RunPod nem copia foto de um produto para outro SKU sem foto.
 */
export async function enrichCatalogProductsMedia({
  products = [],
  segment = '',
  generateImages = true,
  fetchImpl = fetch,
  onItemDone = null,
} = {}) {
  const list = Array.isArray(products) ? products.map((p) => (p && typeof p === 'object' ? { ...p } : p)) : [];
  const missingIndices = [];
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i];
    if (p && p.active !== false && !hasValidRasterImageUrl(p.imageUrl)) {
      missingIndices.push(i);
    }
  }
  if (missingIndices.length === 0 || !generateImages) {
    return { products: list, enrichedCount: 0, runpodCount: 0, webHuntCount: 0, fallbackAssetCount: 0 };
  }

  let webHuntCount = 0;
  const queryCache = new Map();
  for (let i = 0; i < missingIndices.length; i += 4) {
    const chunk = missingIndices.slice(i, i + 4);
    await Promise.all(
      chunk.map(async (prodIdx) => {
        const prod = list[prodIdx];
        const found = await huntCatalogProductImage({
          product: prod,
          segment,
          fetchImpl,
          queryCache,
        });
        if (found?.url) {
          list[prodIdx].imageUrl = found.url;
          list[prodIdx].imageSource = found.source;
          webHuntCount += 1;
          if (typeof onItemDone === 'function') {
            onItemDone({ index: prodIdx, product: list[prodIdx], source: found.source });
          }
        }
      }),
    );
  }

  return {
    products: list,
    enrichedCount: webHuntCount,
    runpodCount: 0,
    webHuntCount,
    fallbackAssetCount: 0,
  };
}

/**
 * Pipeline atômico dirigido por propriedades (GLM-5.3 + Ficha de Conceito Enriquecida + Respostas Contextuais + 4 Arquiteturas).
 */
export async function runMultiPhaseAtomicArchitecture({
  dossier,
  profile = {},
  briefAnswers = {},
  questionsJson = null,
  layoutArchetype = '',
  selectedAddons = [],
  callGlm53Json,
}) {
  const rawPrimary = String(profile?.brand?.primaryColor || dossier?.brand?.logoColorsHex?.[0] || '#1E293B').trim();
  const rawAccent = String(profile?.brand?.accentColor || dossier?.brand?.logoColorsHex?.[1] || '#D8A848').trim();
  const archetype = resolveLayoutArchetype({ layoutArchetype, dossier, profile });
  const sys = deriveOklchPaletteSystem({
    brandHex: rawPrimary,
    accentHex: rawAccent,
    groundMode: archetype.groundMode,
  });
  const fallbackReqs = buildImagePlanForStore(
    dossier,
    {
      anchorDarkBg: sys.anchorDarkBg,
      accentHex: rawAccent,
      groundBg: sys.groundBg,
    },
    profile,
    { layoutArchetype: archetype.id },
  );
  const isConsultive =
    archetype.id === 'clinic_agenda_steps' ||
    /servi|saúde|advoc|clínic|nutri|estétic|fisio/i.test(String(dossier?.brand?.segment || ''));

  const userPrompt = buildPropertyDrivenSectionPrompt(dossier, {
    briefAnswers,
    questionsJson,
    layoutArchetype: archetype.id,
    selectedAddons,
    profile,
  });

  const phase1 = await callGlm53Json({
    systemPrompt: VECTOR_ARCHITECT_SYSTEM,
    userPrompt,
    maxTokens: 2800,
    timeoutMs: 75000,
  });

  if (!phase1.ok || !phase1.data) {
    return { ok: false, error: phase1.error || 'GLM_ARCHITECTURE_FAILED' };
  }

  const p1Data = deepStripDashes(phase1.data);
  const sections = p1Data.sectionsByProperty
    ? compileSectionPropertiesToTuples(p1Data.sectionsByProperty, dossier, {
        layoutArchetype: archetype.id,
        profile,
      })
    : Array.isArray(p1Data.sections)
      ? p1Data.sections
      : [];

  if (sections.length < 2) {
    return { ok: false, error: 'GLM_RETURNED_EMPTY_SECTIONS' };
  }

  const seed = {
    groundMode: archetype.groundMode,
    displayVoice: archetype.displayVoice,
    bodyVoice: 'manrope',
    scaleRatio: 1.333,
    signatureOrnament: archetype.signatureOrnament,
    headerMode: 'anchor_dark_center_nav',
    footerMode: 'anchor_dark_4col_watermark',
    ...(p1Data.engineSeed && typeof p1Data.engineSeed === 'object' ? p1Data.engineSeed : {}),
  };

  const glmPrompts = Array.isArray(p1Data.imagePrompts)
    ? p1Data.imagePrompts
    : Array.isArray(p1Data.imageRequests)
      ? p1Data.imageRequests
      : [];

  const mergedReqs = fallbackReqs.map((canonical, idx) => {
    if (canonical.source === 'catalog_sku') {
      return canonical;
    }
    const match = glmPrompts.find((g) => g?.slotId === canonical.slotId) || glmPrompts[idx];
    const resolvedPrompt =
      match?.prompt && String(match.prompt).trim().length >= 12
        ? stripDashesText(String(match.prompt)).slice(0, 720)
        : canonical.prompt;
    return {
      ...canonical,
      prompt: resolvedPrompt,
      negativePrompt: match?.negativePrompt
        ? stripDashesText(String(match.negativePrompt)).slice(0, 380)
        : canonical.negativePrompt,
    };
  });

  return {
    ok: true,
    modelUsed: phase1.model || 'zai-org/GLM-5.3',
    layoutArchetype: archetype.id,
    layoutGrid: archetype.layoutGrid,
    visualDirection: archetype.visualDirection,
    artDirectionBible: p1Data.artDirectionBible || null,
    blueprint: {
      engineSeed: seed,
      brandTokens: {
        archetype: archetype.id,
        layoutArchetype: archetype.id,
        buyingMode: String(dossier?.catalogSummary?.buyingMode || 'multi_category_retail'),
        paletteSource: 'logo_extracted_oklch',
        colors: {
          primary: sys.anchorDarkBg,
          accent: sys.accentFill,
          neutral: sys.groundBg,
        },
        fontPairing: isConsultive ? 'editorial_serif' : 'geometric_bold',
      },
      imageRequests: mergedReqs,
      sections,
    },
  };
}
