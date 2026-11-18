import { z } from 'zod';

export const WhatsappIntentEnum = z.enum([
  'PURCHASE_ORDER',
  'HUMAN_ESCALATION',
  'PRODUCT_QUESTION',
  'GENERAL_CHAT',
]);

export type WhatsappIntent = z.infer<typeof WhatsappIntentEnum>;

export const NotificationSeverityLevelEnum = z.enum([
  'HUMAN_ESCALATION',
  'PURCHASE_MESSAGE_ARRIVED',
  'NEW_MESSAGE_WAITING',
]);

export type NotificationSeverityLevel = z.infer<typeof NotificationSeverityLevelEnum>;

export const HIGH_SATURATION_COLORS = {
  HUMAN_ESCALATION: {
    hex: '#FF2E54' as const,
    hoverHex: '#E11D48' as const,
    textHex: '#FFFFFF' as const,
    label: 'PRECISA DE HUMANO AGORA',
  },
  PURCHASE_MESSAGE_ARRIVED: {
    hex: '#10B981' as const,
    hoverHex: '#059669' as const,
    textHex: '#FFFFFF' as const,
    label: 'NOVA COMPRA NO WHATSAPP — D1',
  },
  NEW_MESSAGE_WAITING: {
    hex: '#F59E0B' as const,
    hoverHex: '#D97706' as const,
    textHex: '#FFFFFF' as const,
    label: 'NOVA MENSAGEM AGUARDANDO',
  },
} as const;

export const DetectedOrderItemSchema = z.object({
  productId: z.string().optional(),
  sku: z.string().default(''),
  name: z.string().min(1),
  variation: z.string().default('Padrão'),
  quantity: z.number().int().min(1).default(1),
  unitPriceCents: z.number().int().min(0).default(0),
  lineTotalCents: z.number().int().min(0).default(0),
  imageUrl: z.string().default(''),
});

export type DetectedOrderItem = z.infer<typeof DetectedOrderItemSchema>;

export const WhatsappIncomingClassificationSchema = z.object({
  intent: WhatsappIntentEnum,
  orderRef: z.string().optional(),
  itemsDetected: z.array(DetectedOrderItemSchema).default([]),
  totalCents: z.number().int().min(0).default(0),
  confidence: z.number().min(0).max(1).default(0.9),
  requiresHuman: z.boolean().default(false),
  escalationReason: z.string().optional(),
  suggestedReply: z.string().default(''),
  source: z
    .enum(['vitrine_checkout', 'whatsapp_direct', 'simulator', 'live_whatsapp'])
    .default('whatsapp_direct'),
  sourceComponent: z.string().default('WhatsApp Direto'),
  matchedKeywords: z.array(z.string()).default([]),
  isD1Purchase: z.boolean().default(false),
});

export type WhatsappIncomingClassification = z.infer<
  typeof WhatsappIncomingClassificationSchema
>;

export const WhatsappNotificationEventSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  level: NotificationSeverityLevelEnum,
  intent: WhatsappIntentEnum,
  colorHex: z.enum(['#FF2E54', '#10B981', '#F59E0B']),
  title: z.string(),
  message: z.string(),
  customerName: z.string(),
  customerPhone: z.string().default(''),
  customerJid: z.string().default(''),
  orderRef: z.string().optional(),
  totalCents: z.number().int().min(0).default(0),
  sourceComponent: z.string().default('WhatsApp Direto'),
  mode: z.enum(['simulator', 'live_whatsapp']).default('simulator'),
  acknowledged: z.boolean().default(false),
  resolved: z.boolean().default(false),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable().default(null),
});

export type WhatsappNotificationEvent = z.infer<
  typeof WhatsappNotificationEventSchema
>;

export const WhatsappQueueItemSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  intent: WhatsappIntentEnum,
  priority: z.number().int().min(1).max(3).default(2),
  colorHex: z.enum(['#FF2E54', '#10B981', '#F59E0B']),
  customerName: z.string(),
  customerPhone: z.string().default(''),
  customerJid: z.string().default(''),
  messageText: z.string(),
  replyText: z.string().default(''),
  escalationReason: z.string().optional(),
  orderRef: z.string().optional(),
  orderStatus: z.string().optional(),
  whatsappPurchaseConfirmed: z.boolean().default(false),
  pausedForHuman: z.boolean().default(false),
  pinnedHumanHandoff: z.boolean().default(false),
  itemsDetected: z.array(DetectedOrderItemSchema).default([]),
  totalCents: z.number().int().min(0).default(0),
  sourceComponent: z.string().default('WhatsApp Direto'),
  mode: z.enum(['simulator', 'live_whatsapp']).default('simulator'),
  status: z
    .enum(['pending', 'human_assumed', 'confirmed', 'resolved'])
    .default('pending'),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WhatsappQueueItem = z.infer<typeof WhatsappQueueItemSchema>;

export const SimulatorMessageSchema = z.object({
  id: z.string().min(1),
  sender: z.enum(['customer', 'sofia', 'human']),
  customerName: z.string().default(''),
  customerPhone: z.string().default(''),
  text: z.string(),
  intent: WhatsappIntentEnum.optional(),
  mode: z.enum(['simulator', 'live_whatsapp']).default('simulator'),
  modelUsed: z.string().optional(),
  usedFallback: z.boolean().optional(),
  orderRef: z.string().optional(),
  createdAt: z.string(),
});

export type SimulatorMessage = z.infer<typeof SimulatorMessageSchema>;

export const D1FunnelMetricsSchema = z.object({
  visits: z.number().int().min(0).default(0),
  productClicks: z.number().int().min(0).default(0),
  whatsappPurchaseMessages: z.number().int().min(0).default(0),
  d1ConfirmedOrders: z.number().int().min(0).default(0),
  d1RevenueCents: z.number().int().min(0).default(0),
  conversionRatePct: z.number().min(0).default(0),
});

export type D1FunnelMetrics = z.infer<typeof D1FunnelMetricsSchema>;

export const SofiaRagDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().default('Política da Loja'),
  updatedAt: z.string().optional(),
});

export type SofiaRagDocument = z.infer<typeof SofiaRagDocumentSchema>;

export const DEFAULT_ESCALATION_KEYWORDS = [
  'atendente',
  'humano',
  'vendedor',
  'gerente',
  'desconto',
  'negociar',
  'reclamação',
  'reembolso',
  'estorno',
  'defeito',
  'orçamento personalizado',
];

export const SofiaBrainConfigSchema = z.object({
  enabled: z.boolean().default(true),
  modelName: z.string().default('qwen2.5:0.5b'),
  autoReplyWhenConnected: z.boolean().default(true),
  tone: z.enum(['proximo', 'formal', 'direto', 'consultivo']).default('proximo'),
  workingHoursNotice: z.string().default('Seg a Sáb · 09h às 19h'),
  escalationKeywords: z.array(z.string()).default(DEFAULT_ESCALATION_KEYWORDS),
  escalateOnDiscount: z.boolean().default(true),
  escalateOnComplaintOrRefund: z.boolean().default(true),
  escalateOnOutOfCatalogDoubt: z.boolean().default(true),
  escalateOnHighTicketCustom: z.boolean().default(true),
  ragDocuments: z.array(SofiaRagDocumentSchema).default([]),
  updatedAt: z.string().nullable().default(null),
});

export type SofiaBrainConfig = z.infer<typeof SofiaBrainConfigSchema>;

export const WhatsappEventsResponseSchema = z.object({
  ok: z.boolean(),
  notifications: z.array(WhatsappNotificationEventSchema).default([]),
  queueItems: z.array(WhatsappQueueItemSchema).default([]),
  simulatorMessages: z.array(SimulatorMessageSchema).default([]),
  d1Funnel: D1FunnelMetricsSchema,
  liveResponderActive: z.boolean().default(false),
  botConnected: z.boolean().default(false),
  pausedThreads: z.array(z.string()).default([]),
});

export type WhatsappEventsResponse = z.infer<typeof WhatsappEventsResponseSchema>;
