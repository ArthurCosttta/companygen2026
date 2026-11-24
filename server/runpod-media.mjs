/**
 * Formula-IR v9.0 · RunPod Media Generator (FLUX.1-dev / FLUX.1-schnell / Qwen-Image-Edit)
 * Extracted from legacy ai-art-director.mjs with zero duplicated logic.
 */
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { writeFile, readFile, rm } from 'node:fs/promises';

export function detectImageTypeFromBuffer(buf) {
  if (!buf || buf.length < 12) return { ext: 'png', mimeType: 'image/png' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mimeType: 'image/png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  }
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return { ext: 'webp', mimeType: 'image/webp' };
  }
  return { ext: 'png', mimeType: 'image/png' };
}

export function extractRunPodOutputMedia(output) {
  if (!output) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return extractRunPodOutputMedia(output[0]);
  if (typeof output === 'object') {
    if (typeof output.result === 'string') return output.result;
    if (typeof output.image_url === 'string') return output.image_url;
    if (typeof output.url === 'string') return output.url;
    if (typeof output.image === 'string') return output.image;
    if (Array.isArray(output.images) && output.images.length > 0) {
      return extractRunPodOutputMedia(output.images[0]);
    }
  }
  return '';
}

export async function tryConvertBufferToWebp(buffer, currentExt) {
  if (!buffer || buffer.length < 1024 || currentExt === 'webp') {
    return {
      buffer,
      ext: currentExt,
      mimeType: currentExt === 'webp' ? 'image/webp' : currentExt === 'jpg' ? 'image/jpeg' : 'image/png',
    };
  }
  const tmpId = `cg-webp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const inPath = path.join(os.tmpdir(), `${tmpId}.${currentExt || 'png'}`);
  const outPath = path.join(os.tmpdir(), `${tmpId}.webp`);
  try {
    await writeFile(inPath, buffer);
    await new Promise((resolve, reject) => {
      execFile(
        process.platform === 'win32' ? 'python' : 'python3',
        ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=82, method=6)', inPath, outPath],
        { timeout: 12000 },
        (err) => (err ? reject(err) : resolve(true)),
      );
    });
    const webpBuf = await readFile(outPath);
    if (webpBuf.length > 512) {
      return { buffer: webpBuf, ext: 'webp', mimeType: 'image/webp' };
    }
  } catch {
    // Python/PIL optional: safely keep original PNG/JPG if unavailable
  } finally {
    await rm(inPath, { force: true }).catch(() => null);
    await rm(outPath, { force: true }).catch(() => null);
  }
  return {
    buffer,
    ext: currentExt,
    mimeType: currentExt === 'jpg' ? 'image/jpeg' : 'image/png',
  };
}

export function applyArtDirectionBibleToPrompt(prompt, artDirectionBible) {
  const basePrompt = String(
    prompt ||
      'Stylized modern editorial gouache and graphic illustration representing the brand universe, bold clean geometry, tactile paper grain, zero photorealism',
  ).trim();
  const styleDirective =
    'stylized editorial illustration, flat gouache and risograph graphic design art representation, clean negative space, zero photorealism, zero uncanny human faces, zero messy stock photo clutter, no text or watermarks';
  if (!artDirectionBible || typeof artDirectionBible !== 'object') {
    return `${basePrompt}, ${styleDirective}`.slice(0, 1200);
  }
  const parts = [
    artDirectionBible.visualStyle ? `Style: ${String(artDirectionBible.visualStyle).trim()}` : 'Style: stylized_editorial_illustration',
    artDirectionBible.lighting ? `Lighting: ${String(artDirectionBible.lighting).trim()}` : '',
    artDirectionBible.surfaceMaterial ? `Surface: ${String(artDirectionBible.surfaceMaterial).trim()}` : '',
    artDirectionBible.backdropTone ? `Backdrop: ${String(artDirectionBible.backdropTone).trim()}` : '',
    artDirectionBible.cameraFraming ? `Composition: ${String(artDirectionBible.cameraFraming).trim()}` : '',
  ].filter(Boolean);
  return `[Art Direction Bible — ${parts.join(' | ')}] ${basePrompt}, ${styleDirective}`.slice(0, 1200);
}

export async function generateRunPodImage({
  prompt,
  artDirectionBible = null,
  kind = 'schnell',
  width = 1024,
  height = 1024,
  sourceImageBase64 = '',
  timeoutMs = 90000,
  fetchImpl = fetch,
} = {}) {
  const apiKey = String(process.env.IMAGE_API_KEY || process.env.GLM_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('IMAGE_API_KEY/GLM_API_KEY não configurada para geração RunPod.');
  }

  const normalizedKind = kind === 'hero_dev' || kind === 'dev' ? 'hero_dev' : kind === 'edit' || kind === 'qwen_edit' ? 'edit' : 'schnell';
  const endpointUrl =
    normalizedKind === 'hero_dev'
      ? String(process.env.IMAGE_HERO_ENDPOINT_URL || process.env.IMAGE_ENDPOINT_URL || 'https://api.runpod.ai/v2/black-forest-labs-flux-1-dev/run').trim()
      : normalizedKind === 'edit'
        ? String(process.env.IMAGE_EDIT_ENDPOINT_URL || process.env.IMAGE_ENDPOINT_URL || 'https://api.runpod.ai/v2/qwen-image-edit/run').trim()
        : String(process.env.IMAGE_ENDPOINT_URL || 'https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/run').trim();

  const modelName =
    normalizedKind === 'hero_dev'
      ? process.env.IMAGE_HERO_MODEL || 'flux-dev'
      : normalizedKind === 'edit'
        ? process.env.IMAGE_EDIT_MODEL || 'qwen-image-edit'
        : process.env.IMAGE_MODEL || 'flux-schnell';

  const effectiveTimeout = Math.max(60000, Number(timeoutMs) || 90000);
  const inputPayload = {
    prompt: applyArtDirectionBibleToPrompt(prompt, artDirectionBible),
    width: Math.max(256, Math.min(1536, Number(width) || 1024)),
    height: Math.max(256, Math.min(1536, Number(height) || 1024)),
    output_format: 'webp',
  };
  if (arguments[0]?.negativePrompt) {
    inputPayload.negative_prompt = String(arguments[0].negativePrompt).slice(0, 400);
  }
  if (normalizedKind === 'edit' && sourceImageBase64) {
    inputPayload.image = sourceImageBase64;
    inputPayload.image_url = sourceImageBase64;
  }

  const startedAt = Date.now();
  const runRes = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: inputPayload }),
    signal: AbortSignal.timeout(Math.min(30000, effectiveTimeout)),
  });

  if (!runRes.ok) {
    const errBody = await runRes.text().catch(() => '');
    throw new Error(`RunPod /run HTTP ${runRes.status}: ${errBody.slice(0, 200)}`);
  }

  let jobData = await runRes.json();
  const statusBase = endpointUrl.replace(/\/run\/?$/i, '');

  if (jobData?.status !== 'COMPLETED' && jobData?.id) {
    while (Date.now() - startedAt < effectiveTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const pollRes = await fetchImpl(`${statusBase}/status/${encodeURIComponent(jobData.id)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);

      if (!pollRes) continue;
      if ([429, 500, 502, 503, 504].includes(pollRes.status)) continue;
      if (!pollRes.ok) {
        const errTxt = await pollRes.text().catch(() => '');
        throw new Error(`RunPod /status HTTP ${pollRes.status}: ${errTxt.slice(0, 180)}`);
      }
      jobData = await pollRes.json();
      if (jobData?.status === 'COMPLETED') break;
      if (jobData?.status === 'FAILED' || jobData?.status === 'CANCELLED') {
        throw new Error(`RunPod job ${jobData.status}: ${JSON.stringify(jobData.error || 'unknown')}`);
      }
    }
  }

  if (jobData?.status !== 'COMPLETED') {
    throw new Error(`RunPod timeout após ${Date.now() - startedAt}ms (status=${jobData?.status || 'unknown'}).`);
  }

  const mediaRef = extractRunPodOutputMedia(jobData.output);
  if (!mediaRef) {
    throw new Error('RunPod COMPLETED sem mídia no output.');
  }

  let buffer;
  if (/^data:image\//i.test(mediaRef)) {
    const b64 = mediaRef.replace(/^data:image\/[^;]+;base64,/i, '');
    buffer = Buffer.from(b64, 'base64');
  } else if (/^https?:\/\//i.test(mediaRef)) {
    const imgRes = await fetchImpl(mediaRef, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem gerada HTTP ${imgRes.status}.`);
    buffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    buffer = Buffer.from(mediaRef, 'base64');
  }

  const detected = detectImageTypeFromBuffer(buffer);
  const finalAsset = await tryConvertBufferToWebp(buffer, detected.ext);
  if (!finalAsset.buffer || finalAsset.buffer.length < 1024) {
    throw new Error(`RunPod retornou imagem vazia ou corrompida (${finalAsset.buffer?.length || 0} bytes).`);
  }
  return {
    ok: true,
    buffer: finalAsset.buffer,
    ext: finalAsset.ext,
    mimeType: finalAsset.mimeType,
    costUsd: Number(jobData?.output?.cost || 0),
    model: modelName,
    jobId: String(jobData?.id || ''),
    elapsedMs: Date.now() - startedAt,
  };
}
