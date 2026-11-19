import type { z } from 'zod';

export declare const FORMULA_V9_VERSION: '9.0';
export declare const WHITELISTED_ICONS: string[];

export declare const AtomOptionSchema: z.ZodObject<{
  value: z.ZodString;
  label: z.ZodString;
  skuRef: z.ZodOptional<z.ZodString>;
  priceCents: z.ZodOptional<z.ZodNumber>;
  priceDeltaCents: z.ZodOptional<z.ZodNumber>;
  note: z.ZodOptional<z.ZodString>;
}>;

export declare const AtomControlSchema: z.ZodType<any>;
export declare const CalcRuleSchema: z.ZodObject<{
  mode: z.ZodEnum<{ base_plus_addons: 'base_plus_addons'; sum_selected: 'sum_selected'; per_unit_slider: 'per_unit_slider'; schedule_summary: 'schedule_summary' }>;
  pixDiscountPercent: z.ZodDefault<z.ZodNumber>;
  summaryTitle: z.ZodDefault<z.ZodString>;
  limitNote: z.ZodDefault<z.ZodString>;
}>;
export declare const ActionBindingSchema: z.ZodObject<{
  type: z.ZodEnum<{ 'cart.add_selected': 'cart.add_selected'; 'whatsapp.send_summary': 'whatsapp.send_summary'; 'catalog.filter': 'catalog.filter' }>;
  label: z.ZodString;
}>;
export declare const ImagePlanItemSchema: z.ZodObject<any>;
export declare const DesignTokensSchema: z.ZodObject<any>;
export declare const SectionNodeSchema: z.ZodType<any>;
export declare const AnalysisSchema: z.ZodObject<{
  factsConfirmed: z.ZodDefault<z.ZodArray<z.ZodString>>;
  dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
  mainExperienceSummary: z.ZodDefault<z.ZodString>;
}>;
export declare const ArtDirectionBibleSchema: z.ZodObject<any>;
export declare const FormulaV9PageSchema: z.ZodObject<any>;
export declare const FormulaV9DocumentSchema: z.ZodObject<any>;

export declare function relativeLuminance(hex: string): number;
export declare function contrastRatio(fgHex: string, bgHex: string): number;

export declare function deriveThemeTokensFromHex(primaryHex?: string, fontStyle?: string): {
  accent: string;
  accentDeep: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  ink: string;
  inkMuted: string;
  onPrimary: string;
  badgeText: string;
  footerBg: string;
  fontStyle: 'modern_sans' | 'editorial_serif' | 'clean_geometric';
  radiusPx: number;
};

export declare function normalizeSpreadsheetItemType(params?: {
  rawType?: string;
  name?: string;
  category?: string;
  description?: string;
  defaultBusinessModel?: 'produtos' | 'servicos' | 'hibrido' | string;
  sourceHint?: string;
}): 'produto_fisico' | 'servico_agendado' | 'kit_combo' | 'sob_medida';

export declare function evaluateInteractiveExperience(params?: {
  controls?: any[];
  state?: Record<string, any>;
  calcRule?: any;
  catalog?: any[];
}): {
  totalCents: number;
  pixTotalCents: number;
  pixDiscountPercent: number;
  chosenSummaryLines: string[];
  selectedProducts: any[];
};

export declare function sanitizeFormulaV9Document(rawDoc: any, profile?: any): {
  version: '9.0';
  generatedAt: string;
  generatedBy: string;
  modelUsed: string;
  analysis: { factsConfirmed: string[]; dependencies: string[]; mainExperienceSummary: string };
  designTokens: ReturnType<typeof deriveThemeTokensFromHex>;
  imagePlan: any[];
  sections: any[];
};
