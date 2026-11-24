import { Suspense } from 'react';
import { lazyNamed } from '@/utils/chunk-recovery';
import type * as Pack from './ReferenceComponentsPack';

function wrapLazyPack<K extends keyof typeof Pack>(exportName: K): (typeof Pack)[K] {
  const LazyComp = lazyNamed(() => import('./ReferenceComponentsPack'), exportName);
  const Wrapped = (props: Record<string, unknown>) => (
    <Suspense fallback={<div className="my-4 min-h-[140px] w-full rounded-2xl bg-slate-100/60" />}>
      {/* @ts-expect-error Dynamic pack union props forwarded cleanly at runtime */}
      <LazyComp {...props} />
    </Suspense>
  );
  return Wrapped as unknown as (typeof Pack)[K];
}

export const BlackFridayFinePrintBand = wrapLazyPack('BlackFridayFinePrintBand');
export const BlackFridayMassiveHero = wrapLazyPack('BlackFridayMassiveHero');
export const BundleBuilderCalculator = wrapLazyPack('BundleBuilderCalculator');
export const CalendarDeliverySlotsBand = wrapLazyPack('CalendarDeliverySlotsBand');
export const CheckpointJourneyStrip = wrapLazyPack('CheckpointJourneyStrip');
export const ChristmasKnitHeroStage = wrapLazyPack('ChristmasKnitHeroStage');
export const ClinicEditorialHeroAndStrip = wrapLazyPack('ClinicEditorialHeroAndStrip');
export const ClinicSpecialistsDeck = wrapLazyPack('ClinicSpecialistsDeck');
export const FlipCountdownMatrix = wrapLazyPack('FlipCountdownMatrix');
export const InteractiveImageTextStage = wrapLazyPack('InteractiveImageTextStage');
export const InteractiveSymptomOrNeedMap = wrapLazyPack('InteractiveSymptomOrNeedMap');
export const InteractiveTearCouponBib = wrapLazyPack('InteractiveTearCouponBib');
export const NumberedEditorialPricingTiers = wrapLazyPack('NumberedEditorialPricingTiers');
export const RecoveryCaseScoreboard = wrapLazyPack('RecoveryCaseScoreboard');
export const SlantedStampAndFeatureSplit = wrapLazyPack('SlantedStampAndFeatureSplit');
