import type { BusinessProfile } from '../../src/schemas/profile.schema';
import type { FormulaV9Document } from '../../src/schemas/formula-v9.schema';

export function buildNeutralFallbackV9Document(profile?: Partial<BusinessProfile>): FormulaV9Document;
export function ensureFormulaV9(profile?: Partial<BusinessProfile>): FormulaV9Document;
