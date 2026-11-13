// Server-side (Node) image acquisition. NEVER imported by browser code.
// Provider order: Pexels (when PEXELS_API_KEY is set) -> Openverse (anonymous API,
// only licenses that allow commercial use + modification).
// Downloads the authorised files to public/assets/images and maintains manifest.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const UA = 'CompanyGenPostStudio/1.0 (local prototype; image acquisition)';

export function activeProvider() {
  return process.env.PEXELS_API_KEY ? 'pexels' : 'openverse';
}

/** Parse width/height from JPEG, PNG or WebP bytes. Returns null if not decodable. */
export function imageSize(buf) {
  if (buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length - 9) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      }
      o += 2 + len;
    }
    return null;
  }
  // WebP (VP8X / VP8 / VP8L)
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { type: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { type: 'webp', width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
  }
  return null;
}

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9à-ú]+/i)
    .filter((t) => t.length > 2);
}

async function searchPexels(query, perPage) {
  const { createClient } = await import('pexels');
  const client = createClient(process.env.PEXELS_API_KEY);
  const res = await client.photos.search({ query, per_page: perPage, orientation: 'portrait' });
  if (!res || !Array.isArray(res.photos)) throw new Error(`Pexels search failed for "${query}"`);
  return res.photos.map((p) => ({
    provider: 'pexels',
    provider_id: String(p.id),
    source_url: p.url,
    download_url: p.src.large2x || p.src.original,
    photographer: p.photographer,
    photographer_url: p.photographer_url,
    license: 'Pexels License',
    license_url: 'https://www.pexels.com/license/',
    width: p.width,
    height: p.height,
    title: p.alt || query,
    tags: tokens(`${query} ${p.alt || ''}`).slice(0, 10),
    query,
  }));
}

async function searchOpenverse(query, perPage) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('license_type', 'commercial,modification');
  url.searchParams.set('page_size', String(perPage));
  url.searchParams.set('mature', 'false');
  url.searchParams.set('category', 'photograph');
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Openverse HTTP ${r.status} for "${query}"`);
  const json = await r.json();
  return (json.results || []).map((p) => ({
    provider: `openverse:${p.source}`,
    provider_id: p.id,
    source_url: p.foreign_landing_url,
    download_url: p.url,
    photographer: p.creator || 'Autor não informado',
    photographer_url: p.creator_url || null,
    license: `${p.license === 'cc0' || p.license === 'pdm' ? p.license.toUpperCase() : 'CC ' + p.license.toUpperCase()} ${p.license_version || ''}`.trim(),
    license_url: p.license_url,
    attribution: p.attribution || null,
    width: p.width || 0,
    height: p.height || 0,
    title: p.title || query,
    tags: [...new Set([...tokens(query), ...(p.tags || []).map((t) => t.name).flatMap(tokens)])].slice(0, 12),
    query,
  }));
}

function score(c) {
  const w = c.width || 0;
  const h = c.height || 0;
  const minSide = Math.min(w, h);
  const ratio = h / Math.max(1, w); // 1.25 == 4:5 portrait
  let s = Math.min(minSide, 2000) / 2000;
  s += ratio >= 1 ? 0.5 : ratio >= 0.7 ? 0.25 : 0;
  return s;
}

async function readManifest(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return { version: 1, generated_at: null, assets: [] };
  }
}

/**
 * Acquire up to targetCount distinct images for a collection.
 * @returns {Promise<{provider:string, added:object[], skipped:object[], errors:string[], total:number}>}
 */
export async function acquireImages({ queries, targetCount = 20, collection = 'default', outDir, log = console.log }) {
  const provider = activeProvider();
  await fs.mkdir(outDir, { recursive: true });
  const manifest = await readManifest(outDir);
  const errors = [];
  const skipped = [];
  const added = [];

  const existingForCollection = manifest.assets.filter((a) => a.collection === collection);
  const needed = Math.max(0, targetCount - existingForCollection.length);
  if (needed === 0) {
    log(`[images] collection "${collection}" already has ${existingForCollection.length} images`);
    return { provider, added, skipped, errors, total: existingForCollection.length };
  }

  // 1-3. search + metadata
  const perQuery = [];
  for (const q of queries) {
    try {
      const search = (term) => (provider === 'pexels' ? searchPexels(term, 20) : searchOpenverse(term, 20));
      let list = await search(q);
      // Openverse matches all words; relax long queries progressively (keeps the original query recorded).
      const words = q.split(/\s+/);
      for (let n = words.length - 1; list.length < 6 && n >= 2; n--) {
        const relaxed = words.slice(words.length - n).join(' ');
        const extra = await search(relaxed);
        list = list.concat(extra.map((c) => ({ ...c, query: q, relaxed_query: relaxed })));
      }
      log(`[images] ${provider} "${q}" -> ${list.length} results`);
      perQuery.push(list.filter((c) => c.download_url).sort((a, b) => score(b) - score(a)));
    } catch (e) {
      errors.push(String(e.message || e));
      perQuery.push([]);
    }
  }

  // 4-6. dedupe, check dimensions/proportion, round-robin across queries for diversity
  const seenIds = new Set(manifest.assets.map((a) => `${a.provider}:${a.provider_id}`));
  const seenUrls = new Set(manifest.assets.map((a) => a.download_url));
  const seenHashes = new Set(manifest.assets.map((a) => a.sha256));
  const candidates = [];
  let idx = 0;
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const list of perQuery) {
      const c = list[idx];
      if (!c) continue;
      progressed = true;
      const key = `${c.provider}:${c.provider_id}`;
      if (seenIds.has(key) || seenUrls.has(c.download_url)) { skipped.push({ key, reason: 'duplicate' }); continue; }
      if (Math.min(c.width, c.height) < 600) { skipped.push({ key, reason: `low resolution ${c.width}x${c.height}` }); continue; }
      const ratio = c.height / c.width;
      if (ratio < 0.55 || ratio > 2.2) { skipped.push({ key, reason: `aspect ratio ${ratio.toFixed(2)}` }); continue; }
      seenIds.add(key);
      seenUrls.add(c.download_url);
      candidates.push(c);
    }
    idx++;
  }

  // 7-9. download, verify, register
  let next = manifest.assets.reduce((m, a) => Math.max(m, Number(String(a.asset_id).replace(/\D/g, '')) || 0), 0) + 1;
  for (const c of candidates) {
    if (added.length >= needed) break;
    try {
      const r = await fetch(c.download_url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const size = imageSize(buf);
      if (!size) throw new Error('arquivo não decodificável');
      if (Math.min(size.width, size.height) < 600) throw new Error(`resolução real ${size.width}x${size.height}`);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      if (seenHashes.has(sha256)) { skipped.push({ key: c.provider_id, reason: 'duplicate bytes' }); continue; }
      seenHashes.add(sha256);
      const asset_id = `img_${String(next++).padStart(3, '0')}`;
      const file = `${asset_id}.${size.type}`;
      await fs.writeFile(path.join(outDir, file), buf);
      const entry = {
        asset_id,
        collection,
        provider: c.provider,
        provider_id: c.provider_id,
        source_url: c.source_url,
        download_url: c.download_url,
        photographer: c.photographer,
        photographer_url: c.photographer_url,
        license: c.license,
        license_url: c.license_url,
        attribution: c.attribution || `${c.title} — ${c.photographer} (${c.license})`,
        title: c.title,
        local_path: `assets/images/${file}`,
        width: size.width,
        height: size.height,
        bytes: buf.length,
        sha256,
        tags: c.tags,
        query: c.query,
        retrieved_at: new Date().toISOString(),
        stock_photo: true,
      };
      manifest.assets.push(entry);
      added.push(entry);
      log(`[images] + ${asset_id} ${size.width}x${size.height} ${c.provider} "${c.query}"`);
    } catch (e) {
      errors.push(`${c.download_url}: ${e.message || e}`);
    }
  }

  manifest.generated_at = new Date().toISOString();
  manifest.provider_note =
    provider === 'pexels'
      ? 'Imagens obtidas pela API oficial do Pexels.'
      : 'PEXELS_API_KEY ausente: imagens obtidas pela API pública do Openverse, filtradas por licenças que permitem uso comercial e modificação.';
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const total = manifest.assets.filter((a) => a.collection === collection).length;
  return { provider, added, skipped, errors, total };
}
