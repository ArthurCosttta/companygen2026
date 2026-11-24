import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_URLS = [
  'https://vertclub-fahykjsz.manus.space/',
  'https://motionphysio-zrymjtfm.manus.space/?locale=pt',
  'https://northpaw-bx3rfpmp.manus.space/',
];

const DEFAULT_OUT =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/ref_sites';

function parseArgs(argv) {
  const args = {};
  for (const token of argv.slice(2)) {
    const clean = token.replace(/^--/, '');
    const eq = clean.indexOf('=');
    if (eq > 0) args[clean.slice(0, eq)] = clean.slice(eq + 1);
    else if (clean) args[clean] = 'true';
  }
  return args;
}

function slugFromUrl(raw) {
  try {
    const u = new URL(raw);
    return u.hostname.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  } catch {
    return 'site';
  }
}

async function analyzeSite(page, url, siteDir) {
  fs.mkdirSync(siteDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1400);

  const foldPath = path.join(siteDir, 'fold_1440.png');
  await page.screenshot({ path: foldPath, fullPage: false });

  // Scroll smoothly down so scroll-revealed animations trigger before full-page inspection
  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 500; y < Math.min(docHeight, 6000); y += 600) {
    await page.evaluate((pos) => window.scrollTo(0, pos), y);
    await page.waitForTimeout(260);
  }
  await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.4)));
  await page.waitForTimeout(350);
  const midPath = path.join(siteDir, 'scrolled_mid.png');
  await page.screenshot({ path: midPath, fullPage: false });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const fullPath = path.join(siteDir, 'full_page.png');
  await page.screenshot({ path: fullPath, fullPage: true });

  // Download full rendered HTML & bundled CSS
  const html = await page.content();
  fs.writeFileSync(path.join(siteDir, 'index.rendered.html'), html, 'utf-8');

  const cssDump = await page.evaluate(async () => {
    const sheets = [];
    for (const s of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(s.cssRules || []).map((r) => r.cssText);
        sheets.push(`/* ${s.href || 'inline'} */\n` + rules.join('\n'));
      } catch {
        if (s.href) {
          try {
            const resp = await fetch(s.href);
            if (resp.ok) sheets.push(`/* fetched ${s.href} */\n` + (await resp.text()));
          } catch {}
        }
      }
    }
    return sheets.join('\n\n');
  });
  fs.writeFileSync(path.join(siteDir, 'styles.css'), cssDump, 'utf-8');

  const analysis = await page.evaluate(() => {
    const fontsLoaded = Array.from(document.fonts)
      .filter((f) => f.status === 'loaded')
      .map((f) => ({ family: f.family, weight: f.weight, style: f.style }));

    const uniqueFonts = Array.from(new Set(fontsLoaded.map((f) => f.family)));

    const styleOf = (el) => (el ? getComputedStyle(el) : null);
    const h1 = document.querySelector('h1');
    const h2 = document.querySelector('h2');
    const bodyCs = styleOf(document.body);
    const h1Cs = styleOf(h1);
    const h2Cs = styleOf(h2);

    // Keyframes & animation classes
    const keyframes = [];
    for (const s of Array.from(document.styleSheets)) {
      try {
        for (const r of Array.from(s.cssRules || [])) {
          if (r.type === CSSRule.KEYFRAMES_RULE) {
            keyframes.push(r.name);
          }
        }
      } catch {}
    }

    // Tech stack heuristics
    const htmlStr = document.documentElement.innerHTML;
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src'));
    const links = Array.from(document.querySelectorAll('link[href]')).map((l) => l.getAttribute('href'));
    const hasSvgs = document.querySelectorAll('svg').length;
    const imgSamples = Array.from(document.querySelectorAll('img')).slice(0, 12).map((img) => ({
      src: img.currentSrc || img.getAttribute('src') || '',
      alt: img.alt || '',
      w: Math.round(img.getBoundingClientRect().width),
      h: Math.round(img.getBoundingClientRect().height),
    }));

    const stackSignals = {
      googleFontsLinks: links.filter((l) => String(l).includes('fonts.googleapis')),
      hasFramerOrMotion: /data-framer|framer-motion|will-change:\s*transform/i.test(htmlStr) || Boolean(document.querySelector('[style*="transform"]')),
      hasLenisSmoothScroll: /lenis/i.test(htmlStr + scripts.join(' ')),
      hasGsap: /gsap|scrolltrigger/i.test(htmlStr + scripts.join(' ')),
      hasTailwind: /--tw-/.test(htmlStr) || Array.from(document.styleSheets).some((s) => {
        try { return Array.from(s.cssRules).some((r) => r.cssText.includes('--tw-')); } catch { return false; }
      }),
      inlineSvgCount: hasSvgs,
      keyframesFound: Array.from(new Set(keyframes)).slice(0, 30),
    };

    // Sections top-to-bottom breakdown
    const topSections = Array.from(document.querySelectorAll('header, nav, main > section, main > div > section, section, footer'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 30 && r.width > 200;
      })
      .slice(0, 16)
      .map((el, idx) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const heading = el.querySelector('h1, h2, h3')?.textContent?.trim()?.slice(0, 80) || '';
        const imgs = el.querySelectorAll('img').length;
        const svgs = el.querySelectorAll('svg').length;
        const btns = Array.from(el.querySelectorAll('button, a')).slice(0, 4).map((b) => {
          const bcs = getComputedStyle(b);
          return {
            text: b.textContent?.trim()?.slice(0, 35) || '',
            bg: bcs.backgroundColor,
            color: bcs.color,
            radius: bcs.borderRadius,
            border: bcs.border,
          };
        });
        return {
          order: idx + 1,
          tag: el.tagName,
          id: el.id || '',
          classes: String(el.className || '').slice(0, 120),
          heightPx: Math.round(r.height),
          bgColor: cs.backgroundColor,
          bgImage: cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage.slice(0, 80) : '',
          heading,
          imgsCount: imgs,
          svgsCount: svgs,
          sampleButtons: btns,
        };
      });

    return {
      title: document.title,
      url: window.location.href,
      uniqueFonts,
      typography: {
        body: bodyCs ? { font: bodyCs.fontFamily, size: bodyCs.fontSize, bg: bodyCs.backgroundColor, color: bodyCs.color } : null,
        h1: h1Cs ? { text: h1.textContent?.trim().slice(0, 80), font: h1Cs.fontFamily, size: h1Cs.fontSize, weight: h1Cs.fontWeight, letterSpacing: h1Cs.letterSpacing, lineHeight: h1Cs.lineHeight, color: h1Cs.color } : null,
        h2: h2Cs ? { text: h2.textContent?.trim().slice(0, 80), font: h2Cs.fontFamily, size: h2Cs.fontSize, weight: h2Cs.fontWeight, letterSpacing: h2Cs.letterSpacing } : null,
      },
      stackSignals,
      topSections,
      imgSamples,
    };
  });

  // Mobile pass screenshot
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const mobilePath = path.join(siteDir, 'mobile_375.png');
  await page.screenshot({ path: mobilePath, fullPage: false });

  const out = {
    ...analysis,
    files: { foldPath, midPath, fullPath, mobilePath },
  };
  fs.writeFileSync(path.join(siteDir, 'analysis.json'), JSON.stringify(out, null, 2), 'utf-8');
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const urls = args.urls ? args.urls.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_URLS;
  const outDir = path.resolve(args.out || DEFAULT_OUT);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const summary = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const url of urls) {
      const slug = slugFromUrl(url);
      console.log(`Downloading & inspecting ${url} -> ${slug}...`);
      try {
        const res = await analyzeSite(page, url, path.join(outDir, slug));
        summary.push({
          slug,
          url,
          title: res.title,
          fonts: res.uniqueFonts,
          h1Font: res.typography?.h1,
          bodyFont: res.typography?.body,
          sectionsCount: res.topSections.length,
          keyframesCount: res.stackSignals.keyframesFound.length,
          hasMotion: res.stackSignals.hasFramerOrMotion,
          files: res.files,
        });
      } catch (err) {
        summary.push({ slug, url, error: err?.message || String(err) });
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
