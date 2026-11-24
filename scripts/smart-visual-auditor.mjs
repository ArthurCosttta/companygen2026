import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { FIVE_SHOWCASE_STORES } from '../shared/formula-ir/showcase-five-pages.mjs';
import { CLICHE_PHRASES_BLACKLIST } from '../server/atomic-visual-critic.mjs';

const WORKDIR = path.resolve('.');
const DEFAULT_OUT =
  'C:/Users/arthur/.gemini/antigravity/brain/11169f73-159b-4308-91e9-7ace60c123e1/prints_5pages_final';

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, () => resolve());
      req.on('error', () => {
        retries += 1;
        if (retries > 40) reject(new Error(`Vite preview timeout on port ${port}`));
        else setTimeout(check, 250);
      });
    };
    check();
  });
}

async function waitForVisibleImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((res) => {
          const timer = setTimeout(res, 4500);
          img.addEventListener('load', () => { clearTimeout(timer); res(); }, { once: true });
          img.addEventListener('error', () => { clearTimeout(timer); res(); }, { once: true });
        });
      }),
    );
  });
  await page.waitForTimeout(450);
}

async function runAudit() {
  fs.mkdirSync(DEFAULT_OUT, { recursive: true });
  const port = 5212;
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

  const reports = [];
  const foldImagesB64 = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/?virtual_tuple_harness=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="virtual-tuple-harness-root"]', { timeout: 10000 });

    for (let i = 0; i < FIVE_SHOWCASE_STORES.length; i += 1) {
      const s = FIVE_SHOWCASE_STORES[i];
      const slug = s.publicSlug;
      const bp = s.profile.storeLayout.formulasIr.atomicBlueprint;
      const colors = bp.brandTokens.colors;

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(
        ({ store, blueprint, cols }) => {
          window.__setVirtualHarnessPayload({
            clause: '5pages_audit',
            caseId: store.publicSlug,
            label: `${store.accessCode} · ${store.profile.business.name}`,
            canvasMode: 'pure_white',
            hideBanner: true,
            primaryColor: cols.primary,
            accentColor: cols.accent,
            groundMode: blueprint.engineSeed.groundMode || 'warm_linen',
            engineSeed: blueprint.engineSeed,
            storeName: store.profile.business.name,
            products: store.profile.catalog.products,
            sections: blueprint.sections,
          });
        },
        { store: s, blueprint: bp, cols: colors },
      );

      await waitForVisibleImages(page);

      // Telemetria deterministica zero-token
      const metrics = await page.evaluate((cliches) => {
        const root = document.querySelector('[data-testid="virtual-tuple-harness-root"]') || document.body;
        const h1 = root.querySelector('h1');
        const h1Px = h1 ? parseFloat(getComputedStyle(h1).fontSize || '0') : 0;
        const imgs = Array.from(root.querySelectorAll('img'));
        const brokenImgs = imgs.filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.src);
        const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const textLower = (root.textContent || '').toLowerCase();
        const clicheHits = cliches.filter((p) => textLower.includes(p));
        return {
          h1Px: Math.round(h1Px),
          imgCount: imgs.length,
          brokenImgs,
          overflowPx,
          clicheHits,
        };
      }, CLICHE_PHRASES_BLACKLIST);

      const foldPath = path.join(DEFAULT_OUT, `page_${i + 1}_${slug}_fold.png`);
      const fullPath = path.join(DEFAULT_OUT, `page_${i + 1}_${slug}_full.png`);
      const foldBuf = await page.screenshot({ path: foldPath, fullPage: false });
      await page.screenshot({ path: fullPath, fullPage: true });
      foldImagesB64.push({
        label: `${s.accessCode} · ${s.profile.business.name}`,
        dataUri: `data:image/png;base64,${foldBuf.toString('base64')}`,
      });

      // Mobile audit 390x844
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      const mobileOverflowPx = await page.evaluate(
        () => Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      );
      const mobilePath = path.join(DEFAULT_OUT, `page_${i + 1}_${slug}_mobile.png`);
      await page.screenshot({ path: mobilePath, fullPage: false });

      reports.push({
        index: i + 1,
        accessCode: s.accessCode,
        storeName: s.profile.business.name,
        slug,
        desktopH1Px: metrics.h1Px,
        imgCount: metrics.imgCount,
        brokenImgsCount: metrics.brokenImgs.length,
        desktopOverflowPx: metrics.overflowPx,
        mobileOverflowPx,
        clicheHitsCount: metrics.clicheHits.length,
        passed: metrics.brokenImgs.length === 0 && metrics.clicheHits.length === 0 && mobileOverflowPx <= 2,
        files: { foldPath, fullPath, mobilePath },
      });
    }

    // Gera Folha-Contato Compacta Unificada (5 páginas em 1 única imagem para economizar tokens)
    await page.setViewportSize({ width: 1500, height: 1120 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#0F172A;padding:24px;font-family:system-ui,sans-serif;color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <strong style="font-size:18px">AUDITORIA ECONÔMICA · 5 CÓDIGOS ADMIN & 5 PÁGINAS DISTINTAS</strong>
          <span style="font-size:12px;color:#94A3B8">Modo Contact Sheet (1 frame)</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
          ${foldImagesB64
            .map(
              (item) => `<div style="background:#1E293B;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.12)">
                <div style="padding:8px 12px;font-size:11px;font-weight:700;color:#E2E8F0">${item.label}</div>
                <img src="${item.dataUri}" style="width:100%;display:block;aspect-ratio:16/10;object-fit:cover;object-position:top" />
              </div>`,
            )
            .join('')}
        </div>
      </body></html>`,
      { waitUntil: 'load' },
    );
    await page.waitForTimeout(250);
    const sheetPath = path.join(DEFAULT_OUT, 'contact_sheet_5pages.jpg');
    await page.screenshot({ path: sheetPath, type: 'jpeg', quality: 84, fullPage: true });

    const outJson = {
      ok: reports.every((r) => r.passed),
      contactSheet: sheetPath,
      pagesCount: reports.length,
      reports,
    };
    fs.writeFileSync(path.join(DEFAULT_OUT, 'audit_5pages_report.json'), JSON.stringify(outJson, null, 2), 'utf8');
    console.log(JSON.stringify(outJson, null, 2));
  } finally {
    await browser.close();
    preview.kill();
  }
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
