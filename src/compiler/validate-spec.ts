import type { z } from 'zod';
import { makeCampaignSchema, type CampaignSpec } from '@/schemas/campaign.schema';

export interface SpecIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; spec: CampaignSpec; warnings: SpecIssue[] }
  | { ok: false; errors: SpecIssue[]; warnings: SpecIssue[] };

/** posts[1].slides[3].template */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${String(seg)}` : String(seg);
  }
  return out || '(raiz)';
}

function flatten(issues: z.core.$ZodIssue[]): SpecIssue[] {
  const out: SpecIssue[] = [];
  for (const i of issues) {
    if (i.code === 'unrecognized_keys') {
      for (const k of i.keys) out.push({ path: formatPath([...i.path, k]), message: 'Campo desconhecido' });
    } else if (i.code === 'invalid_union' && 'errors' in i) {
      out.push({ path: formatPath(i.path), message: i.message });
    } else {
      out.push({ path: formatPath(i.path), message: i.message });
    }
  }
  return out;
}

const looseSchema = makeCampaignSchema(false);
const strictSchema = makeCampaignSchema(true);

/** Validate raw JSON text or object. Never throws; never touches persisted data. */
export function validateSpec(input: unknown): ValidationResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      const msg = (e as Error).message;
      return { ok: false, errors: [{ path: '(arquivo)', message: `JSON malformado: ${msg}` }], warnings: [] };
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ path: '(raiz)', message: 'O arquivo deve conter um objeto JSON' }], warnings: [] };
  }
  if (!('schema_version' in raw)) {
    return { ok: false, errors: [{ path: 'schema_version', message: 'schema_version obrigatório' }], warnings: [] };
  }
  const policy = ((raw as Record<string, unknown>).schema_policy as { unknown_fields?: string } | undefined)?.unknown_fields === 'error' ? 'error' : 'warn';

  const strict = strictSchema.safeParse(raw);
  if (strict.success) return { ok: true, spec: strict.data, warnings: [] };

  const unknown = strict.error.issues.filter((i) => i.code === 'unrecognized_keys');
  const others = strict.error.issues.filter((i) => i.code !== 'unrecognized_keys');
  const unknownIssues = flatten(unknown);

  if (policy === 'error' && unknownIssues.length) {
    return { ok: false, errors: [...flatten(others), ...unknownIssues], warnings: [] };
  }
  if (others.length) {
    return { ok: false, errors: flatten(others), warnings: unknownIssues };
  }
  const loose = looseSchema.safeParse(raw);
  if (!loose.success) return { ok: false, errors: flatten(loose.error.issues), warnings: unknownIssues };
  return { ok: true, spec: loose.data, warnings: unknownIssues.map((w) => ({ ...w, message: 'Campo desconhecido ignorado' })) };
}
