import type { Asset } from '@/compiler/types';
import { getAllAssets, saveAssets, workspaceUser } from './local-storage';
import { authenticatedFetch } from './supabase-client';

export type WebAsset = {
  rawUrl: string;
  thumbnailUrl?: string;
  titleSnippet?: string;
  sourceDomain?: string;
  declaredWidth?: number;
  declaredHeight?: number;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  durationSec?: number;
};

export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function searchWebAssets(query: string, count = 5, mediaType = 'image', owner = workspaceUser()) {
  const response = await authenticatedFetch('/api/hunt', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count, mediaType }),
  }, owner);
  const data = await response.json();
  if (!response.ok || !data.success || !Array.isArray(data.items)) {
    throw new Error(data.error || 'A busca de imagens está indisponível.');
  }
  return (data.items as WebAsset[]).filter(item => isWebUrl(item?.rawUrl));
}

export async function checkImageApiStatus() {
  try {
    const res = await authenticatedFetch('/api/images/status');
    if (res.ok) return await res.json();
  } catch {}
  return { available: false, provider: 'ddgs', pexels_key_configured: false };
}

export async function acquireImagesForCampaign(campaignId: string, queries: string[], targetCount = 20) {
  const owner = workspaceUser();
  const assets = new Map<string, Asset>();
  const errors: string[] = [];
  for (const query of [...new Set(queries)].slice(0, 12)) {
    if (assets.size >= targetCount) break;
    try {
      for (const item of await searchWebAssets(query, Math.min(6, targetCount - assets.size), 'image', owner)) {
        if (assets.has(item.rawUrl)) continue;
        assets.set(item.rawUrl, {
          asset_id: 'web_' + crypto.randomUUID(),
          provider: 'asset-hunter',
          collection: campaignId,
          source_url: item.rawUrl,
          title: item.titleSnippet || query,
          photographer: item.sourceDomain || 'Busca web',
          license: 'Verificar na origem',
          local_path: item.rawUrl,
          width: Number(item.declaredWidth) || 1080,
          height: Number(item.declaredHeight) || 1080,
          query,
          tags: [query],
          stock_photo: false,
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Busca indisponível.');
    }
  }
  if (assets.size) await saveAssets([...assets.values()], owner);
  return { provider: 'ddgs', added: assets.size, total: (await getAllAssets(owner)).length, errors };
}

export async function registerUploadedImage(file: File): Promise<Asset> {
  const owner = workspaceUser();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Selecione uma imagem JPG, PNG, WebP ou GIF de até 5 MB.');
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = url;
  await image.decode();
  const asset: Asset = {
    asset_id: 'upload_' + crypto.randomUUID(), provider: 'upload', collection: 'user_uploads',
    source_url: null, photographer: 'Upload do usuário', license: 'Arquivo próprio', title: file.name,
    local_path: url, width: image.naturalWidth, height: image.naturalHeight, tags: ['upload'], stock_photo: false,
  };
  await saveAssets([asset], owner);
  return asset;
}
