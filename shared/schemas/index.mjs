import { z } from 'zod';

export const CreditAdjustmentInputSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(['add', 'set']).default('add'),
  amount: z.number().int(),
  reasonCode: z.enum(['bonus', 'refund_fix', 'support_comp', 'chargeback_adjust', 'manual_audit']),
  note: z.string().trim().min(5, 'Justificativa deve ter pelo menos 5 caracteres').max(200),
  idempotencyKey: z.string().max(80).optional(),
  notifyByEmail: z.boolean().optional(),
});

export const UserLimitTierInputSchema = z.object({
  userId: z.string().min(1),
  tier: z.enum(['standard', 'vip', 'restricted']),
  note: z.string().trim().min(3).max(200),
  clearNegativeLock: z.boolean().optional(),
});

export const DesktopHeartbeatSchema = z.object({
  machineId: z.string().trim().min(2).max(64),
  appVersion: z.string().trim().min(1).max(24),
  osPlatform: z.string().trim().min(1).max(24).optional(),
  webviewPhase: z.string().trim().max(32).optional(),
  selectorHealth: z.enum(['healthy', 'degraded', 'offline']).default('healthy'),
});

export const FeatureFlagRuleSchema = z.object({
  key: z.string().trim().min(1).max(48),
  globalMode: z.enum(['off', 'admin_only', 'beta_list', 'all']),
  betaUserIds: z.array(z.string()).default([]),
  description: z.string().max(140).optional(),
});
