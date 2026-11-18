import {
  ActionBindingSchema,
  AnalysisSchema,
  AtomControlSchema,
  AtomOptionSchema,
  CalcRuleSchema,
  DesignTokensSchema,
  FORMULA_V9_VERSION,
  FormulaV9DocumentSchema,
  FormulaV9PageSchema,
  ImagePlanItemSchema,
  SectionNodeSchema,
  WHITELISTED_ICONS,
  deriveThemeTokensFromHex,
  evaluateInteractiveExperience,
  normalizeSpreadsheetItemType,
  sanitizeFormulaV9Document,
} from '../../shared/formula-ir/composer-schema.mjs';

export {
  ActionBindingSchema,
  AnalysisSchema,
  AtomControlSchema,
  AtomOptionSchema,
  CalcRuleSchema,
  DesignTokensSchema,
  FORMULA_V9_VERSION,
  FormulaV9DocumentSchema,
  FormulaV9PageSchema,
  ImagePlanItemSchema,
  SectionNodeSchema,
  WHITELISTED_ICONS,
  deriveThemeTokensFromHex,
  evaluateInteractiveExperience,
  normalizeSpreadsheetItemType,
  sanitizeFormulaV9Document,
};

export interface AtomOption {
  value: string;
  label: string;
  skuRef?: string;
  priceCents?: number;
  priceDeltaCents?: number;
  note?: string;
}

export type AtomControl =
  | { id: string; atomType: 'tabs_selector'; stateKey: string; label: string; options: AtomOption[] }
  | { id: string; atomType: 'option_cards'; stateKey: string; label: string; options: AtomOption[] }
  | { id: string; atomType: 'checklist_addons'; stateKey: string; label: string; options: AtomOption[] }
  | {
      id: string;
      atomType: 'slider_range';
      stateKey: string;
      label: string;
      min: number;
      max: number;
      step: number;
      unitLabel: string;
      pricePerUnitCents: number;
      skuRef?: string;
    }
  | { id: string; atomType: 'slot_time_picker'; stateKey: string; label: string; slots: string[] };

export interface CalcRule {
  mode: 'base_plus_addons' | 'sum_selected' | 'per_unit_slider' | 'schedule_summary';
  pixDiscountPercent: number;
  summaryTitle: string;
  limitNote: string;
}

export interface ActionBinding {
  type: 'cart.add_selected' | 'whatsapp.send_summary' | 'catalog.filter';
  label: string;
}

export interface ImagePlanItem {
  slotId: string;
  targetSectionId: string;
  role: 'hero' | 'section_illustration' | 'lifestyle_banner' | 'detail_card' | 'brand_logo';
  tier: 'flux-dev' | 'flux-schnell';
  aspect: '16:9' | '4:3' | '1:1';
  promptEn: string;
  assetUrl?: string;
  relativePath?: string;
  filename?: string;
  modelUsed?: string;
  elapsedMs?: number;
  status?: 'pending' | 'completed' | 'error';
}

export interface DesignTokens {
  accent: string;
  accentDeep: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  ink: string;
  inkMuted: string;
  footerBg: string;
  fontStyle: 'modern_sans' | 'editorial_serif' | 'clean_geometric';
  radiusPx: number;
}

export type SectionNode =
  | {
      id: string;
      type: 'HeaderNav';
      config: { ctaLabel: string; showSearch: boolean; showBag: boolean; links: Array<{ label: string; href: string }> };
    }
  | {
      id: string;
      type: 'HeroSection';
      imageSlotId?: string;
      config: {
        variant: 'split' | 'full_bleed';
        eyebrow: string;
        title: string;
        subtitle: string;
        primaryCta: { label: string; href: string };
        secondaryCta?: { label: string; action: 'whatsapp.send_summary' | 'scroll' };
        imageUrl?: string;
      };
    }
  | {
      id: string;
      type: 'DifferentialsStrip';
      config: { items: Array<{ icon: string; title: string; text: string }> };
    }
  | {
      id: string;
      type: 'InteractiveExperience';
      imageSlotId?: string;
      config: {
        eyebrow: string;
        title: string;
        subtitle: string;
        layoutVariant: 'workbench_split' | 'stacked_cards' | 'compact_panel';
        stateDefaults: Record<string, string | number | string[]>;
        controls: AtomControl[];
        calcRule: CalcRule;
        primaryAction: ActionBinding;
        secondaryAction?: ActionBinding;
        imageUrl?: string;
      };
    }
  | {
      id: string;
      type: 'EditorialMediaSplit';
      imageSlotId?: string;
      config: {
        variant: 'media_left' | 'media_right';
        eyebrow: string;
        title: string;
        body: string;
        bullets: string[];
        ctaLabel?: string;
        ctaHref?: string;
        imageUrl?: string;
      };
    }
  | {
      id: string;
      type: 'StepsTimeline';
      imageSlotId?: string;
      config: {
        title: string;
        subtitle: string;
        tabs: Array<{ id: string; label: string; steps: Array<{ time: string; title: string; detail: string }> }>;
        imageUrl?: string;
      };
    }
  | {
      id: string;
      type: 'HighlightsGrid';
      config: {
        title: string;
        subtitle: string;
        columns: 2 | 3;
        cards: Array<{
          eyebrow: string;
          title: string;
          description: string;
          ctaLabel: string;
          href: string;
          imageSlotId?: string;
          imageUrl?: string;
        }>;
      };
    }
  | {
      id: string;
      type: 'FaqAccordion';
      config: { title: string; items: Array<{ q: string; a: string }> };
    }
  | {
      id: string;
      type: 'CatalogGrid';
      config: { title: string; subtitle: string; itemActionLabel: string; emptyImageMode: 'neutral_gray' };
    }
  | {
      id: string;
      type: 'ClosingScheduleSplit';
      imageSlotId?: string;
      config: {
        eyebrow: string;
        title: string;
        subtitle: string;
        slots: string[];
        whatsappHeading: string;
        whatsappSubtext: string;
        ctaLabel: string;
        imageUrl?: string;
      };
    }
  | {
      id: string;
      type: 'RichFooter';
      config: { tagline: string; showNewsletter: boolean };
    };

export interface AnalysisSummary {
  factsConfirmed: string[];
  dependencies: string[];
  mainExperienceSummary: string;
}

export interface FormulaV9Page {
  id: string;
  slug: string;
  filename: string;
  title: string;
  isHome: boolean;
  sections: SectionNode[];
}

export interface FormulaV9Document {
  version: '9.0';
  generatedAt?: string;
  generatedBy?: string;
  modelUsed?: string;
  analysis: AnalysisSummary;
  designTokens: DesignTokens;
  imagePlan: ImagePlanItem[];
  sections: SectionNode[];
  pages?: FormulaV9Page[];
  storeInfo?: Record<string, any>;
  catalog?: Array<Record<string, any>>;
}
