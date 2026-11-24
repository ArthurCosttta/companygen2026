export type {
  IgnitionExtraPageItem,
  IgnitionSubmissionPayload,
  OnboardingIgnitionViewProps,
} from './OnboardingIgnitionView';

export type {
  GenerateFullImageJobResult,
  GenerateFullStorefrontResponse,
  OnboardingSynthesisStageProps,
  StoreMoldeJobStage,
} from './OnboardingSynthesisStage';

export type {
  PreBuildCartSummaryProps,
  PreBuildRecommendedPage,
} from './PreBuildPagesCartStep';

export {
  IGNITION_NICHE_PRESETS,
  buildCatalogProductsFromNiche,
  buildDefaultSeedProductsForStore,
  detectPixKeyType,
  extractInstagramHandle,
  normalizeBrazilWhatsAppE164,
  type IgnitionNichePreset,
  type IgnitionPresetProductSeed,
  type PixKeyType,
} from './onboarding-niche-presets';

export {
  ContextualHelpModal,
  type ContextualHelpModalProps,
} from './OnboardingModals';

export {
  SEGMENT_OPTIONS,
  readExpressFichaDraft,
  writeExpressFichaDraft,
  clearExpressFichaDraft,
  buildDraftFromProfile,
  formatBrazilPhoneDisplay,
  parsePriceBrlToCents,
  formatCentsToInputBrl,
  validatePixKeyInput,
  createProductPlaceholderSvgDataUri,
  buildPublicStoreShareUrl,
  type OnboardingWizardStep,
  type OnboardingHelpTopic,
  type AcceptedPaymentMethod,
  type ExpressFichaDraft,
} from './onboarding-helpers';
