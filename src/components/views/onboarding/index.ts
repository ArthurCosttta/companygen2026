export {
  WelcomeModal,
  type WelcomeModalProps,
  type OnboardingPreferredTrack,
} from './WelcomeModal';

export {
  OnboardingSplitStudio,
  type OnboardingSplitStudioProps,
} from './OnboardingSplitStudio';

export {
  GuidedChecklistCard,
  type GuidedChecklistCardProps,
} from './GuidedChecklistCard';

export {
  ExpressFichaWizardModal,
  type ExpressFichaWizardModalProps,
} from './ExpressFichaWizardModal';

export {
  SaveDraftModal,
  ConfirmExitModal,
  ContextualHelpModal,
  StoreCreatedSuccessModal,
  type SaveDraftModalProps,
  type ConfirmExitModalProps,
  type ContextualHelpModalProps,
  type StoreCreatedSuccessModalProps,
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
