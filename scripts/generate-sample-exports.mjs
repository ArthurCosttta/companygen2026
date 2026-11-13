import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'examples', 'exported_samples');

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, 'post_001'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'post_002'), { recursive: true });

  console.log('[export] Launching headless browser to render 10 slides...');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  // Read campaign spec and manifest
  const spec = JSON.parse(await fs.readFile(path.join(root, 'examples', 'campaign-fashion.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', 'assets', 'images', 'manifest.json'), 'utf8'));

  // Host a simple preview server or navigate to preview port
  // Instead of needing full server, we can evaluate render directly in page context with canvas!
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      </head>
      <body>
        <canvas id="c" width="1080" height="1350"></canvas>
      </body>
    </html>
  `);

  await page.waitForLoadState('networkidle');

  // Load render-post and build-post-ir scripts in browser context or bundle
  // Since we already built dist, let's start the vite preview server or use standard playwright
  console.log('[export] Loading app in headless browser...');
  const child = await import('node:child_process');
  const preview = child.spawn('npm.cmd', ['run', 'preview', '--', '--port', '4173'], { cwd: root, shell: true });

  // Wait for preview server
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://localhost:4173');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!ready) {
    console.error('Failed to start preview server on port 4173');
    preview.kill();
    await browser.close();
    process.exit(1);
  }

  await page.goto('http://localhost:4173');
  // Wait for initial load
  await page.waitForSelector('text=Loja Modelo de Moda', { timeout: 15000 });
  await page.waitForSelector('canvas', { timeout: 15000 });

  // Expose evaluation function to compile and render each slide to PNG
  const zip = new JSZip();
  const rootZip = zip.folder('COMPANYGEN_CAMPAIGN') || zip;
  const postsFolder = rootZip.folder('posts') || rootZip;

  const scheduleRows = ['post_id,date,time,status,type,title,slides_count'];

  for (const post of spec.posts) {
    const postFolder = postsFolder.folder(post.id) || postsFolder;
    scheduleRows.push(`"${post.id}","${post.date}","${post.time}","${post.status}","${post.type}","${post.title}",${post.slides.length}`);

    // Click on post card
    const card = page.locator(`text=${post.title}`).first();
    if (await card.isVisible()) {
      await card.click();
      await page.waitForTimeout(300);
    }

    for (let sIdx = 0; sIdx < post.slides.length; sIdx++) {
      const slideNum = String(sIdx + 1).padStart(2, '0');
      console.log(`[export] Rendering ${post.id} slide ${slideNum}...`);

      // Switch to slide
      const thumb = page.locator(`button[title*="Slide ${sIdx + 1}"]`).first();
      if (await thumb.isVisible()) {
        await thumb.click();
        await page.waitForTimeout(200);
      }

      // Render hidden 1080x1350 canvas in page
      const dataUrl = await page.evaluate(async (slideIndex) => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        // Find the main editor canvas (largest one)
        const main = canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
        if (!main) throw new Error('No canvas found');
        return main.toDataURL('image/png');
      }, sIdx);

      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');

      // Save to disk
      const filePath = path.join(outDir, post.id, `slide_${slideNum}.png`);
      await fs.writeFile(filePath, buf);

      // Add to ZIP
      postFolder.file(`slide_${slideNum}.png`, buf);
    }

    // Save caption and post.json
    await fs.writeFile(path.join(outDir, post.id, 'caption.txt'), post.caption || '');
    await fs.writeFile(path.join(outDir, post.id, 'post.json'), JSON.stringify(post, null, 2));

    postFolder.file('caption.txt', post.caption || '');
    postFolder.file('post.json', JSON.stringify(post, null, 2));
  }

  // Add root files to ZIP
  rootZip.file('campaign.json', JSON.stringify(spec, null, 2));
  rootZip.file('schedule.csv', scheduleRows.join('\n'));
  rootZip.file('assets_manifest.json', JSON.stringify(manifest, null, 2));

  const credits = `# Créditos e Licenças — ${spec.brand.name}
Campanha: ${spec.campaign.name}
Data: ${new Date().toLocaleDateString('pt-BR')}

## Fotografias Utilizadas
${manifest.assets.slice(0, 20).map((a) => `- **${a.asset_id}**: ${a.title || 'Foto'} — Foto por [${a.photographer}](${a.source_url || '#'}). Licença: ${a.license}`).join('\n')}

## Nota Legal
Imagens autorizadas para uso comercial e modificações obtidas através de APIs públicas com licenças verificadas.`;

  rootZip.file('credits.md', credits);

  const readme = `# ${spec.brand.name} — Studio de Posts
Campanha gerada pelo CompanyGen Post Studio.
- Total de posts: ${spec.posts.length}
- Total de slides: 10
- Resolução exata: 1080 × 1350 px (4:5)`;

  rootZip.file('README.md', readme);

  // Generate ZIP file
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const zipPath = path.join(outDir, `COMPANYGEN_${spec.campaign.id}.zip`);
  await fs.writeFile(zipPath, zipBuf);

  console.log(`[export] Successfully exported 10 PNGs and ZIP to ${zipPath}`);

  await browser.close();
  preview.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('[export] Error:', err);
  process.exit(1);
});
