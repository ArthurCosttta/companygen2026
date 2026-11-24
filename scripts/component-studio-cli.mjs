import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { compileSectionPropertiesToTuples } from '../server/section-property-prompts.mjs';
import { auditAndRepairAtomicBlueprint } from '../server/atomic-visual-critic.mjs';
import { resolveSectionSurfaceTokens } from '../shared/formula-ir/atomic-grammar.mjs';
import {
  evaluateTelemetryAgainstGates,
  buildEvolutionCriticPrompt,
  recordEvolutionRound,
  checkEvolutionStoppingCriteria,
} from '../server/self-evolution-engine.mjs';

const WORKDIR = path.resolve('.');
const DEFAULT_OUT_DIR =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/studio_extremes_round1';

function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const clean = token.replace(/^--/, '');
    const eq = clean.indexOf('=');
    if (eq > 0) {
      args[clean.slice(0, eq)] = clean.slice(eq + 1);
    } else if (clean) {
      args[clean] = 'true';
    }
  }
  return args;
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, () => resolve());
      req.on('error', () => {
        retries += 1;
        if (retries > 40) reject(new Error(`Preview server timeout on port ${port}`));
        else setTimeout(check, 250);
      });
    };
    check();
  });
}

function hydrateRawSections(rawSections = [], { primaryColor = '#18181B', accentColor = '#D8A848', groundMode = 'warm_linen', products = [] } = {}) {
  let prevIsDark = null;
  const hydrated = rawSections.map((sec, idx) => {
    const surfaceTokens = resolveSectionSurfaceTokens({
      primaryHex: primaryColor,
      accentHex: accentColor,
      surfaceStr: String(sec.surface || ''),
      sectionIndex: idx,
      prevIsDark,
      groundMode,
    });
    prevIsDark = Boolean(surfaceTokens.isDark);
    return {
      ...sec,
      surfaceTokens,
      boundProducts: Array.isArray(sec.boundProducts) ? sec.boundProducts : products,
    };
  });
  return hydrated;
}

function buildAdversarialExtremeScenarios() {
  const heroPhoto1 = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&q=85';
  const heroPhoto2 = 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1400&q=85';

  const makeProducts = (count = 6) =>
    Array.from({ length: count }).map((_, i) => ({
      id: `ext_p_${i + 1}`,
      sku: `EXT-${i + 1}`,
      name:
        i === 0
          ? 'Jaqueta Técnica Impermeável Urbano 3L'
          : i === 1
            ? 'Overshirt Sarja Japonesa Lavada'
            : `Peça Curadoria Série ${i + 1} Edição Limitada`,
      category: ['Alfaiataria', 'Casacos', 'Camisaria', 'Acessórios', 'Calçados', 'Kits'][i % 6],
      description: 'Acabamento reforçado com envio expresso e garantia direta.',
      priceCents: 18990 + i * 7500,
      variation: i % 2 === 0 ? 'Preto Carvão · M' : 'Areia Cru · G',
      stock: 10,
      stockQty: 10,
      active: true,
      imageUrl: i < 2 ? 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=700&q=80' : '',
      approvedAsset: true,
      updatedAt: '2026-11-22T21:00:00.000Z',
    }));

  // Cenário 1: Preto no Preto + Seção escura envolvendo cards brancos & pílulas (Extreme Contrast Collision)
  const dossier1 = {
    brand: { name: 'Obsidian Atelier', segment: 'Moda Urbana', brandVoice: 'editorial_minimal', pixDiscountPercent: 8 },
    flagshipProduct: { name: 'Jaqueta Técnica Impermeável Urbano 3L' },
    targetAudience: { mainObjection: 'caimento sem prova presencial' },
    catalogSummary: {
      totalSkus: 8,
      categories: [{ name: 'Alfaiataria' }, { name: 'Casacos' }, { name: 'Acessórios' }],
    },
    growthStrategy: { tupleMultipliers: { heroLayout: 'hero_stage', showcaseLayout: 'bento_spotlight', gridDensity: 3 } },
  };
  const props1 = {
    sec_hero: {
      role: 'hero_stage',
      eyebrow: 'TAG PROIBIDA QUE DEVE SUMIR',
      headline: 'Alfaiataria urbana pensada para durar <accent>o dia inteiro.</accent>',
      subheadline: 'Tecidos respiráveis com troca facilitada e saída no mesmo dia.',
      ctaPrimaryLabel: 'Explorar peças',
      atmosphere: 'anchor_dark',
      fullScreenHero: true,
    },
    sec_ribbon: { role: 'kinetic_ribbon', items: ['Troca em 30 dias', 'Tecido técnico 3 camadas', 'Pix com 8% OFF'] },
    sec_flagship: { role: 'dark_glass_vault', heading: 'Cofre <accent>Obsidian</accent>' },
    sec_editorial_story: { role: 'split_story', heading: 'Sem estoque genérico de <accent>marketplace</accent>', storyParagraphs: ['Costura selada e aviamento metálico.', 'Atendimento direto com consultor de medidas.'] },
    sec_categories: { role: 'coupled_media_grid', heading: 'Linhas <accent>principais</accent>' },
    sec_catalog: { role: 'catalog_full_grid', heading: 'Catálogo completo', cardsPerRowDesktop: 3 },
  };
  const compiled1 = compileSectionPropertiesToTuples(props1, dossier1).map((s) => ({
    ...s,
    surface: 'ui:bg=anchor_dark lum=0.06 | ux:<auto_wcag:4.5>',
    resolvedMedia: s.tuple?.[0] === 'sec_hero' ? { slotId: 'img_hero_main', imageUrl: heroPhoto1, categoryImages: {} } : undefined,
  }));
  const repaired1 = auditAndRepairAtomicBlueprint(
    { sections: hydrateRawSections(compiled1, { primaryColor: '#050507', accentColor: '#18181B', groundMode: 'warm_linen', products: makeProducts(8) }), imageRequests: [] },
    { catalog: { products: makeProducts(8) } },
  ).data;

  // Cenário 2: Amarelo Neon no Fundo Branco Claro (Opposite Extreme Theme)
  const dossier2 = {
    brand: { name: 'Casa Lumina Botânica', segment: 'Arranjos & Perfumaria', brandVoice: 'warm_artisan', pixDiscountPercent: 5 },
    flagshipProduct: { name: 'Vela Botânica Âmbar 280g' },
    targetAudience: { mainObjection: 'aroma que some rápido' },
    catalogSummary: {
      totalSkus: 6,
      categories: [{ name: 'Velas' }, { name: 'Difusores' }],
    },
    growthStrategy: { tupleMultipliers: { heroLayout: 'hero_stage', showcaseLayout: 'bento_spotlight', gridDensity: 3 } },
  };
  const props2 = {
    sec_hero: {
      role: 'hero_stage',
      headline: 'Perfumaria botânica em cera pura para <accent>rituais reais.</accent>',
      subheadline: 'Queima limpa por 55 horas com óleos essenciais prensados a frio.',
      ctaPrimaryLabel: 'Ver fragrâncias',
      atmosphere: 'warm_linen',
      fullScreenHero: true,
    },
    sec_flagship: { role: 'bento_spotlight', heading: 'Destaques da <accent>oficina</accent>' },
    sec_catalog: { role: 'catalog_full_grid', heading: 'Seleção botânica', cardsPerRowDesktop: 3 },
  };
  const compiled2 = compileSectionPropertiesToTuples(props2, dossier2).map((s) => ({
    ...s,
    resolvedMedia: s.tuple?.[0] === 'sec_hero' ? { slotId: 'img_hero_main', imageUrl: heroPhoto2, categoryImages: {} } : undefined,
  }));
  const repaired2 = auditAndRepairAtomicBlueprint(
    { sections: hydrateRawSections(compiled2, { primaryColor: '#FFFFFF', accentColor: '#FDE047', groundMode: 'pure_gallery', products: makeProducts(6) }), imageRequests: [] },
    { catalog: { products: makeProducts(6) } },
  ).data;

  // Cenário 3: Estresse Tipográfico Nome 44 chars + Instrument Serif + 4 Colunas
  const dossier3 = {
    brand: { name: 'Espaço Arquitetônico Contemporâneo Paulista', segment: 'Luminárias & Design', brandVoice: 'consultive_pro', pixDiscountPercent: 10 },
    flagshipProduct: { name: 'Pendente Latão Escovado Ø45cm' },
    catalogSummary: { totalSkus: 12, categories: [{ name: 'Pendentes' }, { name: 'Arandelas' }, { name: 'Mesa' }] },
    growthStrategy: { tupleMultipliers: { heroLayout: 'hero_split', showcaseLayout: 'sticky_lookbook', gridDensity: 4 } },
  };
  const props3 = {
    sec_hero: {
      role: 'hero_split',
      headline: 'Iluminação arquitetônica esculpida em <accent>latão maciço.</accent>',
      subheadline: 'Peças numeradas com driver dimerizável bivolt e envio assegurado.',
      ctaPrimaryLabel: 'Explorar luminárias',
      atmosphere: 'anchor_dark',
    },
    sec_flagship: { role: 'sticky_lookbook', heading: 'Projetos em <accent>destaque</accent>' },
    sec_catalog: { role: 'catalog_full_grid', heading: 'Linha completa', cardsPerRowDesktop: 4 },
  };
  const compiled3 = compileSectionPropertiesToTuples(props3, dossier3).map((s) => ({
    ...s,
    resolvedMedia: s.tuple?.[0] === 'sec_hero' ? { slotId: 'img_hero_main', imageUrl: heroPhoto1, categoryImages: {} } : undefined,
  }));
  const repaired3 = auditAndRepairAtomicBlueprint(
    { sections: hydrateRawSections(compiled3, { primaryColor: '#1E293B', accentColor: '#C59B43', groundMode: 'cool_mist', products: makeProducts(12) }), imageRequests: [] },
    { catalog: { products: makeProducts(12) } },
  ).data;

  // Cenário 4: Mídia 404 Quebrada + Catálogo 1 Único Produto
  const oneProd = makeProducts(1);
  const compiled4 = compileSectionPropertiesToTuples(
    {
      sec_hero: {
        role: 'hero_stage',
        headline: 'Peça exclusiva pronta para <accent>envio imediato.</accent>',
        subheadline: 'Produção controlada em lote pequeno com garantia direta.',
        ctaPrimaryLabel: 'Garantir unidade',
        atmosphere: 'anchor_dark',
        fullScreenHero: true,
      },
      sec_catalog: { role: 'catalog_full_grid', heading: 'Lote disponível', cardsPerRowDesktop: 2 },
    },
    { brand: { name: 'Studio Monolito' }, catalogSummary: { totalSkus: 1, categories: [{ name: 'Alfaiataria' }] } },
  ).map((s) => ({
    ...s,
    resolvedMedia: s.tuple?.[0] === 'sec_hero' ? { slotId: 'img_hero_main', imageUrl: 'https://invalid.local/broken-hero-404.jpg', categoryImages: {} } : undefined,
  }));
  const repaired4 = auditAndRepairAtomicBlueprint(
    { sections: hydrateRawSections(compiled4, { primaryColor: '#111827', accentColor: '#38BDF8', groundMode: 'warm_linen', products: oneProd }), imageRequests: [] },
    { catalog: { products: oneProd } },
  ).data;

  return [
    {
      caseId: 'EXT_01_COLLISION_DARK_CARDS',
      label: 'Dark collision (#050507 + white cards + filter pills)',
      themeTag: 'dark_collision',
      requireFullHero: true,
      payload: {
        clause: 'extremes',
        caseId: 'EXT_01_COLLISION_DARK_CARDS',
        label: 'EXT_01 Dark Collision',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#050507',
        accentColor: '#18181B',
        groundMode: 'warm_linen',
        engineSeed: { displayVoice: 'syne', bodyVoice: 'plus_jakarta' },
        storeName: 'Obsidian Atelier',
        products: makeProducts(8),
        sections: repaired1.sections,
      },
    },
    {
      caseId: 'EXT_02_BRIGHT_YELLOW_ON_WHITE',
      label: 'Light collision (#FFFFFF + neon yellow accent)',
      themeTag: 'light_neon_yellow',
      requireFullHero: true,
      payload: {
        clause: 'extremes',
        caseId: 'EXT_02_BRIGHT_YELLOW_ON_WHITE',
        label: 'EXT_02 Yellow on White',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#FFFFFF',
        accentColor: '#FDE047',
        groundMode: 'pure_gallery',
        engineSeed: { displayVoice: 'bricolage', bodyVoice: 'plus_jakarta' },
        storeName: 'Casa Lumina Botânica',
        products: makeProducts(6),
        sections: repaired2.sections,
      },
    },
    {
      caseId: 'EXT_03_TYPO_STRESS_LONG_STORE',
      label: '44-char store name + Instrument Serif + 4 cols',
      themeTag: 'editorial_serif_long',
      requireFullHero: false,
      payload: {
        clause: 'extremes',
        caseId: 'EXT_03_TYPO_STRESS_LONG_STORE',
        label: 'EXT_03 Long Store Serif',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#1E293B',
        accentColor: '#C59B43',
        groundMode: 'cool_mist',
        engineSeed: { displayVoice: 'instrument_serif', bodyVoice: 'plus_jakarta' },
        storeName: 'Espaço Arquitetônico Contemporâneo Paulista',
        products: makeProducts(12),
        sections: repaired3.sections,
      },
    },
    {
      caseId: 'EXT_04_BROKEN_HERO_404_MIN_CATALOG',
      label: 'Broken 404 Hero URL + 1 product graceful fallback',
      themeTag: 'broken_media_graceful',
      requireFullHero: false,
      payload: {
        clause: 'extremes',
        caseId: 'EXT_04_BROKEN_HERO_404_MIN_CATALOG',
        label: 'EXT_04 Broken 404 Hero',
        canvasMode: 'pure_white',
        hideBanner: true,
        primaryColor: '#111827',
        accentColor: '#38BDF8',
        groundMode: 'warm_linen',
        engineSeed: { displayVoice: 'space_grotesk', bodyVoice: 'inter' },
        storeName: 'Studio Monolito',
        products: oneProd,
        sections: repaired4.sections,
      },
    },
  ];
}

async function collectDomTelemetry(page) {
  return page.evaluate(() => {
    function parseRgb(str) {
      if (!str || str === 'transparent') return [0, 0, 0, 0];
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
      if (!m) return [0, 0, 0, 0];
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    }
    function relLum([r, g, b]) {
      const lin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
    function wcag(c1, c2) {
      const l1 = relLum(c1);
      const l2 = relLum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function blendOver(fg, bg) {
      const a = fg[3];
      return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a)),
        1,
      ];
    }
    function getEffectiveBgRgb(el) {
      const layers = [];
      let cur = el;
      while (cur && cur.nodeType === 1) {
        const st = getComputedStyle(cur);
        const bg = parseRgb(st.backgroundColor);
        if (bg[3] > 0.01) layers.push(bg);
        if (bg[3] >= 0.99) break;
        cur = cur.parentElement;
      }
      let base = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) {
        base = blendOver(layers[i], base);
      }
      return base;
    }

    const stage = document.querySelector('[data-testid="virtual-harness-stage"]');
    const contrastViolations = [];
    let checkedTextNodes = 0;
    const textEls = stage ? Array.from(stage.querySelectorAll('h1, h2, h3, h4, p, a, button, span')) : [];
    for (const el of textEls) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Ignore animated background pill spans
      if (el.tagName === 'SPAN' && el.children.length === 0 && !el.textContent?.trim()) continue;
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent?.trim() || '')
        .join('');
      if (!directText) continue;

      const cs = getComputedStyle(el);
      const fg = parseRgb(cs.color);
      const bg = getEffectiveBgRgb(el);
      const ratio = wcag(fg, bg);
      const fontSize = parseFloat(cs.fontSize || '14');
      const fontWeight = parseFloat(cs.fontWeight || '400');
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minReq = isLarge ? 3.0 : 4.5;
      checkedTextNodes += 1;
      if (ratio < minReq) {
        contrastViolations.push({
          tag: el.tagName,
          text: directText.slice(0, 40),
          ratio: Number(ratio.toFixed(2)),
          minReq,
          fg: cs.color,
          bg: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
        });
      }
    }

    // Check hero eyebrow tags above H1
    const heroSec = stage?.querySelector('[data-atomic-role^="hero_"]');
    const h1 = heroSec?.querySelector('h1');
    let eyebrowTagsAboveH1 = 0;
    const eyebrowOffenders = [];
    if (heroSec && h1) {
      const h1Top = h1.getBoundingClientRect().top;
      const candidates = Array.from(heroSec.querySelectorAll('span, div'));
      for (const cand of candidates) {
        if (cand.contains(h1) || h1.contains(cand)) continue;
        const r = cand.getBoundingClientRect();
        const txt = cand.textContent?.trim() || '';
        if (r.height > 0 && r.height < 42 && r.bottom <= h1Top + 2 && txt.length > 0 && txt.length < 45) {
          eyebrowTagsAboveH1 += 1;
          eyebrowOffenders.push(txt);
        }
      }
    }

    // Check buttons (exclude pure footer/category card links that are not CTA buttons)
    const buttons = stage ? Array.from(stage.querySelectorAll('button, a[data-atomic-primary-cta], a[data-atomic-secondary-cta]')) : [];
    const buttonViolations = [];
    let checkedButtons = 0;
    for (const btn of buttons) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      checkedButtons += 1;
      const isHeroBtn = btn.getAttribute('data-atomic-primary-cta') === 'true' || btn.getAttribute('data-atomic-secondary-cta') === 'true';
      const minH = isHeroBtn ? 44 : 34;
      if (r.height < minH) {
        buttonViolations.push({ text: btn.textContent?.trim().slice(0, 30), issue: `height ${r.height.toFixed(1)} < ${minH}` });
      }
    }

    const h1Style = h1 ? getComputedStyle(h1) : null;
    const h1FontSizePx = h1Style ? parseFloat(h1Style.fontSize || '0') : 0;
    const rawTracking = h1Style?.letterSpacing || '0px';
    const h1LetterSpacingPx = rawTracking === 'normal' ? 0 : parseFloat(rawTracking);

    const brokenImgs = Array.from(stage?.querySelectorAll('img') || []).filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (!img.complete || img.naturalWidth === 0);
    });

    const heroHeightViewportRatio = heroSec ? heroSec.getBoundingClientRect().height / window.innerHeight : 0;
    const loadedFontsCount = Array.from(document.fonts).filter((f) => f.status === 'loaded').length;

    return {
      heroRole: heroSec?.getAttribute('data-atomic-role') || '',
      heroHasPhoto: Boolean(heroSec?.querySelector('img')),
      heroHeightViewportRatio: Number(heroHeightViewportRatio.toFixed(3)),
      eyebrowTagsAboveH1,
      eyebrowOffenders,
      displayFontLoaded: loadedFontsCount > 0,
      loadedFontsCount,
      h1FontFamily: h1Style?.fontFamily || '',
      h1FontSizePx,
      h1LetterSpacingPx,
      checkedTextNodes,
      contrastViolations,
      checkedButtons,
      buttonViolations,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      brokenImagesCount: brokenImgs.length,
    };
  });
}

async function safeCrop(page, selector, outPath, pad = 20) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  const box = await loc.boundingBox();
  if (!box || box.width < 4 || box.height < 4) return null;
  const vw = page.viewportSize()?.width || 1440;
  const vh = page.viewportSize()?.height || 900;
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  if (x >= vw || y >= vh) return null;
  const width = Math.min(vw - x, Math.ceil(box.width + pad * 2));
  const height = Math.min(vh - y, Math.max(40, Math.ceil(box.height + pad * 2)));
  if (width < 10 || height < 10) return null;
  await page.screenshot({ path: outPath, clip: { x, y, width, height } });
  return outPath;
}

async function runCli() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(args.out || DEFAULT_OUT_DIR);
  const port = Number(args.port || 5199);
  const roundNum = Number(args.round || 1);
  fs.mkdirSync(outDir, { recursive: true });

  let scenarios = [];
  if (args.spec) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(args.spec), 'utf-8'));
    scenarios = Array.isArray(raw) ? raw : [raw];
  } else {
    scenarios = buildAdversarialExtremeScenarios();
  }

  const viteBin = path.join(WORKDIR, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: WORKDIR,
    stdio: 'ignore',
  });

  const browser = await (async () => {
    try {
      await waitForServer(port);
      return await chromium.launch({ headless: true });
    } catch (err) {
      preview.kill();
      throw err;
    }
  })();

  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/?virtual_tuple_harness=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="virtual-tuple-harness-root"]', { timeout: 10000 });

    for (const sc of scenarios) {
      const caseDir = path.join(outDir, sc.caseId);
      fs.mkdirSync(caseDir, { recursive: true });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate((payload) => {
        window.__setVirtualHarnessPayload(payload);
      }, sc.payload);

      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(950);

      // Replay filmstrip on EXT_01
      const filmstripPaths = [];
      if (sc.caseId === 'EXT_01_COLLISION_DARK_CARDS' || args.filmstrip === 'true') {
        await page.evaluate(() => window.__REPLAY_STUDIO_SPEC());
        for (const ms of [0, 180, 520]) {
          if (ms > 0) await page.waitForTimeout(ms);
          const fp = path.join(caseDir, `filmstrip_${ms}ms.png`);
          await page.screenshot({ path: fp, fullPage: false });
          filmstripPaths.push(fp);
        }
        await page.waitForTimeout(550);
      }

      const desktopFold = path.join(caseDir, 'desktop_fold.png');
      await page.screenshot({ path: desktopFold, fullPage: false });

      const desktopFull = path.join(caseDir, 'full_page.png');
      await page.screenshot({ path: desktopFull, fullPage: true });

      // Surgical crops
      const heroCrop = await safeCrop(page, '[data-atomic-role^="hero_"]', path.join(caseDir, 'crop_hero.png'), 0);
      const btnIdleCrop = await safeCrop(page, '[data-atomic-primary-cta="true"]', path.join(caseDir, 'crop_btn_idle.png'), 24);
      let btnHoverCrop = null;
      const ctaLoc = page.locator('[data-atomic-primary-cta="true"]').first();
      if ((await ctaLoc.count()) > 0) {
        const box = await ctaLoc.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
          await page.waitForTimeout(260);
          btnHoverCrop = await safeCrop(page, '[data-atomic-primary-cta="true"]', path.join(caseDir, 'crop_btn_hover.png'), 24);
        }
      }
      const catalogCardCrop = await safeCrop(page, '[data-testid^="v9-catalog-card-"]', path.join(caseDir, 'crop_catalog_card.png'), 18);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
      const desktopTelemetry = await collectDomTelemetry(page);

      // Mobile pass 375x812
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(350);
      const mobileFold = path.join(caseDir, 'mobile_fold.png');
      await page.screenshot({ path: mobileFold, fullPage: false });
      const mobileTelemetry = await collectDomTelemetry(page);

      const gateEvalDesktop = evaluateTelemetryAgainstGates(desktopTelemetry, {
        role: desktopTelemetry.heroRole,
        requireFullHero: Boolean(sc.requireFullHero),
      });
      const gateEvalMobile = evaluateTelemetryAgainstGates(mobileTelemetry, {
        role: mobileTelemetry.heroRole,
        requireFullHero: false,
      });

      results.push({
        caseId: sc.caseId,
        label: sc.label,
        themeTag: sc.themeTag || sc.caseId,
        passedAllHardGates: gateEvalDesktop.passedAllHardGates && gateEvalMobile.passedAllHardGates,
        desktopGates: gateEvalDesktop,
        mobileGates: gateEvalMobile,
        desktopTelemetry,
        mobileTelemetry,
        screenshots: {
          desktopFold,
          desktopFull,
          mobileFold,
          heroCrop,
          btnIdleCrop,
          btnHoverCrop,
          catalogCardCrop,
          filmstripPaths,
        },
      });
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const allPassed = results.every((r) => r.passedAllHardGates);
  const minDetScore = Math.min(...results.map((r) => r.desktopGates.deterministicScore));
  const bundle = {
    round: roundNum,
    allPassed,
    minDetScore,
    results,
  };
  fs.writeFileSync(path.join(outDir, 'bundle.json'), JSON.stringify(bundle, null, 2), 'utf-8');

  const historyPath = path.join(outDir, 'evolution_history.json');
  const history = await recordEvolutionRound(historyPath, {
    round: roundNum,
    passedAllHardGates: allPassed,
    hardGatesFailed: results.reduce((s, r) => s + r.desktopGates.hardGatesFailed + r.mobileGates.hardGatesFailed, 0),
    deterministicScore: minDetScore,
    themesVerified: results.filter((r) => r.passedAllHardGates).map((r) => r.themeTag),
  });

  if (!allPassed) {
    const promptXml = buildEvolutionCriticPrompt({
      roundNumber: roundNum,
      telemetryEvaluation: results.map((r) => ({ caseId: r.caseId, desktop: r.desktopGates, mobile: r.mobileGates })),
      visualCrops: results.map((r) => ({ caseId: r.caseId, screenshots: r.screenshots })),
      history,
    });
    fs.writeFileSync(path.join(outDir, 'evolution_critic_prompt.xml'), promptXml, 'utf-8');
  }

  const stopCheck = checkEvolutionStoppingCriteria(history);
  console.log(JSON.stringify({ allPassed, minDetScore, stopCheck, cases: results.map((r) => ({ caseId: r.caseId, pass: r.passedAllHardGates, dFail: r.desktopGates.failedGates.map((g) => g.id), mFail: r.mobileGates.failedGates.map((g) => g.id) })) }, null, 2));
}

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
