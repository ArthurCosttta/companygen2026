import { workspaceUser } from './local-storage';
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
