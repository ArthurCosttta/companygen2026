export interface ExtendedCatalogColumns {
  durationCol: string | null;
  returnDaysCol: string | null;
  professionalCol: string | null;
  symptomOrNeedCol: string | null;
  contraindicationCol: string | null;
  warrantyCol: string | null;
  batchQtyCol: string | null;
  bundleDiscountCol: string | null;
  leadTimeCol: string | null;
  materialOrNotesCol: string | null;
  hotspotCol: string | null;
  modalityOrPetCol: string | null;
}

export interface RecommendedPageOption {
  id: string;
  slug: string;
  campaignTheme: 'evergreen' | 'natal' | 'black_friday' | 'consultorio';
  title: string;
  summary: string;
  baseCostCredits: number;
  recommendedComponents: string[];
}

export interface WhatsappFlowStep {
  stepOrder: number;
  role: 'assistant' | 'customer';
  label: string;
  body: string;
}

export interface WhatsappMessageFlow {
  id: string;
  title: string;
  intentTag: string;
  status: 'approved' | 'pending_review';
  enabledInBot: boolean;
  sampleCustomerTrigger: string;
  steps: WhatsappFlowStep[];
}

export function detectExtendedCatalogColumns(headers?: string[]): ExtendedCatalogColumns;
export function classifyBusinessArchetype(input?: {
  segment?: string;
  storeName?: string;
  headers?: string[];
  products?: unknown[];
}): {
  archetype: string;
  nicheLabel: string;
  fontPairing: string;
  displayVoice: string;
  bodyVoice: string;
};
export function extractSpreadsheetSignals(input?: {
  headers?: string[];
  rows?: unknown[];
  products?: unknown[];
  business?: Record<string, unknown>;
  extraSheets?: unknown[];
}): Record<string, unknown>;
export function buildRecommendedPagesForProfile(profile?: Record<string, unknown>): {
  archetype: string;
  nicheLabel: string;
  recommendedAlignments: Record<string, unknown>;
  pages: RecommendedPageOption[];
};
export function buildWorkspaceWhatsappFlows(input?: {
  profile?: Record<string, unknown>;
  focus?: string;
  existingTitles?: string[];
}): WhatsappMessageFlow[];
