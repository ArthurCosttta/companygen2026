import { authenticatedFetch } from './supabase-client';

type Workspace = {
  activeCampaign?: string;
  store?: Record<string, unknown>;
  workflows?: { objective: string; notes: string };
  [key: string]: unknown;
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
