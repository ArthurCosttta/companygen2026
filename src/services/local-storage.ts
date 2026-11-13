import type { CampaignSpec } from '@/schemas/campaign.schema';
import type { Asset } from '@/compiler/types';
import type { StudioPost, StudioSlide } from '@/compiler/build-post-ir';
import { authenticatedFetch } from './supabase-client';

type Workspace = {
  campaigns?: CampaignSpec[];
  activeCampaign?: string;
  assets?: Asset[];
  store?: Record<string, unknown>;
  workflows?: { objective: string; notes: string };
};

type Snapshot = { revision: number; provider: 'supabase' | 'servidor'; data: Workspace };
const pending = new Map<string, Promise<unknown>>();
let activeUserId = '';

export function setWorkspaceUser(userId: string) {
  activeUserId = userId;
}

export function workspaceUser() {
  if (!activeUserId) throw new Error('Entre na sua conta para acessar o workspace.');
  return activeUserId;
}

export async function loadWorkspace(owner = workspaceUser()): Promise<Snapshot> {
  const response = await authenticatedFetch('/api/workspace', undefined, owner);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Não foi possível abrir o workspace.');
  }
  return response.json();
}

export function updateWorkspace(change: (data: Workspace) => void, owner = workspaceUser()): Promise<void> {
  const job = (pending.get(owner) || Promise.resolve()).catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { revision, data } = await loadWorkspace(owner);
      change(data);
      const response = await authenticatedFetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, data }),
      }, owner);
      if (response.ok) return;
      if (response.status !== 409) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Não foi possível salvar.');
      }
    }
    throw new Error('Houve edições concorrentes. Tente salvar novamente.');
  });
  pending.set(owner, job);
  return job.finally(() => {
    if (pending.get(owner) === job) pending.delete(owner);
  });
}

export async function saveCampaignSpec(spec: CampaignSpec, owner = workspaceUser()) {
  await updateWorkspace(data => {
    data.campaigns = [...(data.campaigns || []).filter(c => c.campaign.id !== spec.campaign.id), spec];
    data.activeCampaign = spec.campaign.id;
  }, owner);
}

export function getActiveCampaign(data: Workspace) {
  return data.campaigns?.find(c => c.campaign.id === data.activeCampaign) || data.campaigns?.at(-1);
}

export async function updateCampaign(id: string, initial: CampaignSpec, edit: (draft: CampaignSpec) => void, owner = workspaceUser()) {
  let saved!: CampaignSpec;
  await updateWorkspace(data => {
    const campaigns = data.campaigns ??= [];
    let campaign = campaigns.find(item => item.campaign.id === id);
    if (!campaign) {
      campaign = structuredClone(initial);
      campaigns.push(campaign);
    }
    edit(campaign);
    data.activeCampaign = id;
    saved = campaign;
  }, owner);
  return saved;
}

export function editPost(campaign: CampaignSpec, id: string, patch: Partial<StudioPost>) {
  const post = campaign.posts.find(item => item.id === id);
  if (!post) throw new Error('Publicação não encontrada.');
  Object.assign(post, patch);
}

export function editSlide(campaign: CampaignSpec, postId: string, slideId: string, patch: Partial<StudioSlide>) {
  const slide = campaign.posts.find(p => p.id === postId)?.slides.find(s => s.id === slideId);
  if (!slide) throw new Error('Slide não encontrado.');
  Object.assign(slide, patch);
}

export async function saveAssets(assets: Asset[], owner = workspaceUser()) {
  await updateWorkspace(data => {
    const byId = new Map((data.assets || []).map(asset => [asset.asset_id, asset]));
    for (const asset of assets) byId.set(asset.asset_id, asset);
    data.assets = [...byId.values()];
  }, owner);
}

export async function getAllAssets(owner = workspaceUser()) {
  return (await loadWorkspace(owner)).data.assets || [];
}
