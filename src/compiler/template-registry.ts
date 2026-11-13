import type { TemplateDefinition } from './types';
import { coverTemplate } from '@/templates/cover';
import { productFocusTemplate } from '@/templates/product-focus';
import { editorialSplitTemplate } from '@/templates/editorial-split';
import { detailTemplate } from '@/templates/detail';
import { ctaTemplate } from '@/templates/cta';
import { TEMPLATE_IDS, type TemplateId } from '@/templates/ids';

const registry = new Map<string, TemplateDefinition>();

export function registerTemplate(def: TemplateDefinition) {
  if (!def.variants.some((v) => v.id === def.defaultVariant)) throw new Error(`Template ${def.id}: variante padrão inexistente`);
  registry.set(def.id, def);
}

[coverTemplate, productFocusTemplate, editorialSplitTemplate, detailTemplate, ctaTemplate].forEach(registerTemplate);

// Registry and schema must agree.
for (const id of TEMPLATE_IDS) if (!registry.has(id)) throw new Error(`Template "${id}" declarado no schema mas não registrado`);

export function getTemplate(id: string): TemplateDefinition | undefined {
  return registry.get(id);
}

export function listTemplates(): TemplateDefinition[] {
  return [...registry.values()];
}

export function isTemplateId(id: string): id is TemplateId {
  return registry.has(id);
}
