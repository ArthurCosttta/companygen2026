import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import legacySchema from '../schemas/site.schema.json' with { type: 'json' };
import projectV2Schema from '../schemas/project-v2.schema.json' with { type: 'json' };
import slotRegistry from '../assets/slot-registry.json' with { type: 'json' };
import { imageRequirements } from '../assets/requirements';
import { geneStyle } from '../genome/gene-registry';
import { migrateToV2, buildSiteIR } from './migrate';
import type { ProjectSpecV2, Section, Site, SiteIR } from './types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateLegacy = ajv.compile<Site>(legacySchema);
const validateV2 = ajv.compile<ProjectSpecV2>(projectV2Schema);

const unique = (a: string[]) => new Set(a).size === a.length;

const safeUrl = (v: string) => {
  if (v.startsWith('assets/') || v.startsWith('/assets/') || v.startsWith('./assets/') || v.startsWith('/api/whatsapp/media/')) return true;
  if (/^\/api\/brand-logo\/[A-Za-z0-9_-]{4,80}\/[A-Za-z0-9._-]+_logo\.(?:jpg|png|webp|gif)(?:\?v=\d+)?$/i.test(v)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 15000000) return true;
  try {
    const proto = new URL(v).protocol;
    return proto === 'https:' || proto === 'http:';
  } catch {
    return false;
  }
};

const templateVars = new Set([
  'business.name',
  'product.name',
  'product.sku',
  'quantity',
  'unitPrice',
  'variant.label',
  'items',
  'subtotal',
  'discount',
  'shipping',
  'total',
  'subject',
  'pet.name',
  'booking.date',
  'booking.time',
  'service.name'
]);

export const sectionVariants: Record<string, string[]> = {
  header: ['classic', 'compact', 'centered', 'campaign'],
  hero: ['split', 'immersive', 'centered', 'minimal', 'aside', 'photoFull'],
  features: ['band', 'cards', 'steps', 'trust'],
  categoryTiles: ['tiles', 'pills', 'rail'],
  catalog: ['grid', 'compact', 'list', 'mosaic'],
  cart: ['summary'],
  footer: ['standard'],
  story: ['split', 'reverse', 'wide'],
  faq: ['accordion', 'columns'],
  testimonials: ['cards', 'quote'],
  announcement: ['strip', 'panel'],
  contact: ['panel', 'inline'],
  kitBuilder: ['threeSlots'],
  booking: ['photoPanel'],
  recommendations: ['rail']
};

export function compile(raw: string): {
  site?: SiteIR;
  specV2?: ProjectSpecV2;
  errors: string[];
} {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { errors: ['JSON: ' + (e as Error).message] };
  }

  if (typeof data !== 'object' || data === null) {
    return { errors: ['JSON deve ser um objeto.'] };
  }

  const schemaVersion = String(data.schemaVersion || '1.0.0');

  // 1. Validação de Schema estrutural
  if (schemaVersion === '2.0.0') {
    if (!validateV2(data)) {
      return {
        errors: (validateV2.errors || []).map(
          e => `${e.instancePath || '/'} ${e.message}`
        )
      };
    }
  } else {
    if (!validateLegacy(data)) {
      return {
        errors: (validateLegacy.errors || []).map(
          e => `${e.instancePath || '/'} ${e.message}`
        )
      };
    }
  }

  // 2. Adaptação / Migração para ProjectSpecV2 e SiteIR
  const rawSections: Section[] = ((data as any).layout?.sections || (data as any).screens?.home?.sections || []) as Section[];
  const { spec, originalVersion } = migrateToV2(data);
  const s = buildSiteIR(spec, rawSections, originalVersion);
  const errors: string[] = [];

  // Regra de versão da V3: kit, agendamento e recomendações em schema 1.0.0
  if (schemaVersion === '1.0.0') {
    if (rawSections.some(x => ['kitBuilder', 'booking', 'recommendations'].includes(x.type))) {
      errors.push('/schemaVersion: kit, agendamento e recomendações exigem 1.1.0');
    }
  }

  const check = (list: string[], path: string) => {
    if (!unique(list)) errors.push(`${path}: identificador duplicado`);
  };

  check(
    [
      ...s.products.map(x => x.sku),
      ...s.products.flatMap(x => x.variants?.map(v => v.sku) || [])
    ],
    '/products/sku'
  );
  check(s.assets.map(x => x.assetId), '/assets/assetId');
  check(s.categories.map(x => x.id), '/categories/id');
  check(s.layout.sections.map(x => x.id), '/layout/sections/id');
  check(s.messages.templates.map(x => x.id), '/messages/templates/id');
  check(s.prompts?.assets?.map(x => x.assetId) || [], '/prompts/assets/assetId');

  const cats = new Set(s.categories.map(x => x.id));
  const assets = new Set(s.assets.map(x => x.assetId));
  const templates = new Set(s.messages.templates.map(x => x.id));
  const prompts = new Set(s.prompts?.assets?.map(x => x.assetId) || []);

  s.products.forEach((p, i) => {
    try {
      geneStyle(p.genes);
      Object.values(p.responsive || {}).forEach(g => geneStyle(g));
    } catch (e) {
      errors.push(`/products/${i}/genes: ${String(e)}`);
    }
    if (!cats.has(p.categoryId)) {
      errors.push(`/products/${i}/categoryId: categoria inexistente`);
    }
    if (!p.media.length) {
      errors.push(`/products/${i}/media: pelo menos um slot de imagem é necessário`);
    }
    p.media.forEach(m => {
      if (!assets.has(m.assetId)) {
        errors.push(`/products/${i}/media: assetId inexistente ${m.assetId}`);
      }
    });
    if (!templates.has(p.whatsappTemplateId || s.whatsapp.defaultTemplateId || '')) {
      errors.push(`/products/${i}/whatsappTemplateId: template de produto obrigatório ausente`);
    }
    check((p.variants || []).map(v => v.optionId), `/products/${i}/variants`);
  });

  s.categories.forEach((c, i) => {
    if (c.assetId && !assets.has(c.assetId)) {
      errors.push(`/categories/${i}/assetId: asset inexistente`);
    }
  });

  s.layout.sections.forEach((x, i) => {
    try {
      geneStyle(x.genes);
      Object.values(x.responsive || {}).forEach(g => geneStyle(g));
    } catch (e) {
      errors.push(`/layout/sections/${i}/genes: ${String(e)}`);
    }
    if (x.variant && !sectionVariants[x.type]?.includes(x.variant)) {
      errors.push(`/layout/sections/${i}/variant: variante inválida para ${x.type}`);
    }
    if (['faq', 'testimonials'].includes(x.type) && !x.items?.length) {
      errors.push(`/layout/sections/${i}/items: pelo menos um item obrigatório`);
    }
    if (x.type === 'kitBuilder') {
      if (!x.pet?.name || !x.kit?.slots?.length) {
        errors.push(`/layout/sections/${i}: pet e kit.slots obrigatórios`);
      }
      for (const slot of x.kit?.slots || []) {
        if (!cats.has(slot.categoryId)) {
          errors.push(`/layout/sections/${i}/kit/${slot.id}: categoria inexistente`);
        }
        if (
          !slot.productSkus.length ||
          slot.productSkus.some(sku => !s.products.some(p => p.sku === sku && p.categoryId === slot.categoryId))
        ) {
          errors.push(`/layout/sections/${i}/kit/${slot.id}: produto incompatível ou inexistente`);
        }
        if (slot.defaultSku && !slot.productSkus.includes(slot.defaultSku)) {
          errors.push(`/layout/sections/${i}/kit/${slot.id}: defaultSku fora das opções`);
        }
      }
    }
    if (
      x.type === 'recommendations' &&
      (!x.productSkus?.length || x.productSkus.some(sku => !s.products.some(p => p.sku === sku)))
    ) {
      errors.push(`/layout/sections/${i}/productSkus: produtos inexistentes`);
    }
    if (x.type === 'booking') {
      if (!x.booking?.dateOptions?.length || !x.booking?.timeOptions?.length || !x.booking.templateId) {
        errors.push(`/layout/sections/${i}/booking: datas, horários e template obrigatórios`);
      } else if (!templates.has(x.booking.templateId)) {
        errors.push(`/layout/sections/${i}/booking/templateId: template inexistente`);
      }
    }
    if (x.assetId && !assets.has(x.assetId)) {
      errors.push(`/layout/sections/${i}/assetId: asset inexistente`);
    }
  });

  s.assets.forEach((a, i) => {
    if (a.kind && !(a.kind in slotRegistry)) {
      errors.push(`/assets/${i}/kind: tipo de slot não registrado`);
    }
    if (!prompts.has(a.assetId)) {
      errors.push(`/assets/${i}/assetId: prompt obrigatório ausente`);
    }
    if (a.status === 'ready' && (!a.url || !a.approved || !a.alt?.trim())) {
      errors.push(`/assets/${i}: mídia ready exige URL, alt e approved`);
    }
    if (a.url && !safeUrl(a.url)) {
      errors.push(`/assets/${i}/url: somente HTTPS, caminho local relativo ou data:image permitida`);
    }
    if (a.sourceUrl && !safeUrl(a.sourceUrl)) {
      errors.push(`/assets/${i}/sourceUrl: somente HTTPS`);
    }
  });

  s.prompts.assets.forEach((p, i) => {
    if (!assets.has(p.assetId)) {
      errors.push(`/prompts/assets/${i}/assetId: asset inexistente`);
    }
  });

  s.assets.forEach(a => {
    if (
      ['hero.banner', 'service.photo'].includes(a.kind || '') &&
      s.prompts.assets.find(p => p.assetId === a.assetId)?.generationScope !== 'full_scene'
    ) {
      errors.push(`/prompts/assets/${a.assetId}: fundo exige generationScope full_scene`);
    }
  });

  imageRequirements(s).forEach(r => {
    const a = r.assetId && s.assets.find(x => x.assetId === r.assetId);
    if (!a) {
      errors.push(`${r.path}: slot ${r.kind} obrigatório ausente`);
    } else if (r.kind && a.kind && (a.kind !== r.kind || a.ownerRef !== r.ownerRef)) {
      errors.push(`${r.path}: asset ${r.assetId} exige kind ${r.kind} e ownerRef ${r.ownerRef}`);
    }
  });

  for (const key of ['defaultTemplateId', 'checkoutTemplateId', 'quoteTemplateId', 'supportTemplateId'] as const) {
    const id = s.whatsapp[key];
    if (id && !templates.has(id)) {
      errors.push(`/whatsapp/${key}: template inexistente`);
    }
  }

  s.messages.templates.forEach((t, i) => {
    if (!t.text.trim()) errors.push(`/messages/templates/${i}/text: mensagem vazia`);
    for (const [, v] of t.text.matchAll(/{{\s*([^{}]+)\s*}}/g)) {
      if (!templateVars.has(v.trim())) {
        errors.push(`/messages/templates/${i}: variável não permitida ${v.trim()}`);
      }
    }
  });

  const requiredVars = (id: string, vars: string[], context: string) => {
    const t = s.messages.templates.find(x => x.id === id);
    if (t) {
      for (const v of vars) {
        if (!t.text.includes(`{{${v}}}`)) {
          errors.push(`${context}: template ${id} precisa de {{${v}}}`);
        }
      }
    }
  };

  for (const p of s.products) {
    requiredVars(
      p.whatsappTemplateId || s.whatsapp.defaultTemplateId || '',
      ['product.name', 'quantity', 'unitPrice'],
      `/products/${p.sku}/whatsappTemplateId`
    );
  }
  requiredVars(s.whatsapp.checkoutTemplateId, ['business.name', 'items', 'total'], '/whatsapp/checkoutTemplateId');
  if (s.whatsapp.quoteTemplateId) {
    requiredVars(s.whatsapp.quoteTemplateId, ['business.name', 'items', 'total'], '/whatsapp/quoteTemplateId');
  }
  s.layout.sections
    .filter(x => x.type === 'booking' && x.booking)
    .forEach(x =>
      requiredVars(
        x.booking!.templateId,
        ['business.name', 'pet.name', 'booking.date', 'booking.time'],
        '/layout/sections/' + x.id + '/booking/templateId'
      )
    );

  if (errors.length) return { errors };

  return { errors: [], site: s, specV2: spec };
}

export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export const folded = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
