export const TEMPLATE_IDS = ['cover', 'product_focus', 'editorial_split', 'detail', 'cta'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
