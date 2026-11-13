import { z } from 'zod';
import { TEMPLATE_IDS } from '@/templates/ids';

export const SCHEMA_VERSION = '1.0.0';
export const POST_STATUSES = ['idea', 'draft', 'generating', 'ready_for_review', 'approved', 'planned', 'published', 'failed'] as const;
export const POST_TYPES = ['carousel', 'single'] as const;
export const MAX_POSTS = 30;
export const MAX_SLIDES = 10;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[A-Za-z0-9_\-.]{1,64}$/;

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz.includes('/') && tz !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const id = () => z.string().regex(ID, 'ID inválido (use letras, números, _ - .)');
const hex = () => z.string().regex(HEX, 'Cor hexadecimal inválida (ex.: #0867E8)');
const isoDate = () => z.string().refine(isValidIsoDate, 'Data ISO inválida (AAAA-MM-DD)');

/** Builds the campaign schema. strict=true rejects unknown keys (used to detect them). */
export function makeCampaignSchema(strict: boolean) {
  const obj = <T extends z.ZodRawShape>(shape: T) => (strict ? z.strictObject(shape) : z.object(shape));

  const colors = obj({
    primary: hex(),
    background: hex(),
    text: hex(),
    accent: hex().optional(),
  });

  const brand = obj({
    id: id(),
    name: z.string().min(1).max(80),
    segment: z.string().min(1).max(60),
    colors,
    tone: z.string().max(40).optional(),
    logo_asset_id: z.string().nullable().optional(),
  });

  const campaign = obj({
    id: id(),
    name: z.string().min(1).max(120),
    duration_days: z.number().int().min(1).max(90),
    start_date: isoDate(),
    timezone: z.string().refine(isValidTimezone, 'Fuso horário IANA inválido (ex.: America/Sao_Paulo)'),
    platform: z.enum(['instagram']),
  });

  const imageSearch = obj({
    enabled: z.boolean(),
    provider: z.enum(['pexels', 'openverse', 'local']),
    target_count: z.number().int().min(0).max(20),
    queries: z.array(z.string().min(2).max(80)).max(12),
  });

  const product = obj({
    id: id(),
    name: z.string().min(1).max(80),
    sku: z.string().max(40).optional(),
    price_cents: z.number().int().min(0).nullable().optional(),
    image_asset_id: z.string().nullable().optional(),
  });

  const slide = obj({
    id: id(),
    template: z.string().refine((t) => (TEMPLATE_IDS as readonly string[]).includes(t), {
      message: `Template não registrado. Disponíveis: ${TEMPLATE_IDS.join(', ')}`,
    }),
    variant: z.string().max(40).optional(),
    headline: z.string().min(1).max(160),
    body: z.string().max(400).optional(),
    cta_label: z.string().max(40).optional(),
    show_price: z.boolean().optional(),
    image_query: z.string().max(120).optional(),
    image_asset_id: z.string().nullable().optional(),
    /** editor adjustments persisted per layer id (exported by the studio, re-importable) */
    layer_overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  });

  const post = obj({
    id: id(),
    date: isoDate(),
    time: z.string().regex(TIME, 'Horário inválido (HH:mm)'),
    type: z.enum(POST_TYPES),
    status: z.enum(POST_STATUSES),
    title: z.string().min(1).max(120),
    product_ids: z.array(z.string()).default([]),
    slides: z.array(slide).min(1, 'O post precisa de pelo menos 1 slide').max(MAX_SLIDES, `Máximo de ${MAX_SLIDES} slides por post`),
    caption: z.string().max(2200).default(''),
  });

  return obj({
    schema_version: z.string().regex(/^1\.\d+\.\d+$/, `schema_version incompatível (esperado 1.x.x)`),
    schema_policy: obj({ unknown_fields: z.enum(['warn', 'error']) }).optional(),
    brand,
    campaign,
    image_search: imageSearch.optional(),
    products: z.array(product).default([]),
    posts: z.array(post).min(1, 'Informe pelo menos 1 post').max(MAX_POSTS, `Máximo de ${MAX_POSTS} posts por importação`),
  }).superRefine((spec, ctx) => {
    const postIds = new Map<string, number>();
    const productIds = new Set(spec.products.map((p) => p.id));
    const seenProducts = new Map<string, number>();
    spec.products.forEach((p, i) => {
      if (seenProducts.has(p.id)) ctx.addIssue({ code: 'custom', path: ['products', i, 'id'], message: `ID de produto duplicado "${p.id}"` });
      seenProducts.set(p.id, i);
    });
    spec.posts.forEach((p, i) => {
      if (postIds.has(p.id)) ctx.addIssue({ code: 'custom', path: ['posts', i, 'id'], message: `ID de post duplicado "${p.id}" (já usado em posts[${postIds.get(p.id)}])` });
      postIds.set(p.id, i);
      const slideIds = new Map<string, number>();
      p.slides.forEach((s, j) => {
        if (slideIds.has(s.id)) ctx.addIssue({ code: 'custom', path: ['posts', i, 'slides', j, 'id'], message: `ID de slide duplicado "${s.id}" no post "${p.id}"` });
        slideIds.set(s.id, j);
      });
      p.product_ids.forEach((pid, k) => {
        if (!productIds.has(pid)) ctx.addIssue({ code: 'custom', path: ['posts', i, 'product_ids', k], message: `Produto "${pid}" não existe em products` });
      });
      if (p.type === 'single' && p.slides.length > 1) {
        ctx.addIssue({ code: 'custom', path: ['posts', i, 'slides'], message: 'Post do tipo "single" deve ter exatamente 1 slide' });
      }
    });
  });
}

export const CampaignSchema = makeCampaignSchema(false);
export type CampaignSpec = z.infer<typeof CampaignSchema>;
export type BrandSpec = CampaignSpec['brand'];
export type CampaignInfo = CampaignSpec['campaign'];
export type ProductSpec = CampaignSpec['products'][number];
export type PostSpec = CampaignSpec['posts'][number];
export type SlideSpec = PostSpec['slides'][number];
export type PostStatus = (typeof POST_STATUSES)[number];
export type PostType = (typeof POST_TYPES)[number];
