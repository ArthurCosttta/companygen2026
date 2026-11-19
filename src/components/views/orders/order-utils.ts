import {
  sanitizePhoneE164,
  type BusinessOrder,
} from '@/schemas/profile.schema';
import {
  ORDER_STATUS_META,
  ORDER_STATUS_UI_MAP,
  resolveBackendOrderStatus,
  type BackendOrderStatus,
} from '@/services/profile-service';

export const ORDER_STATUS_LIST: BackendOrderStatus[] = [
  'aguardando_dados',
  'aguardando_pagamento',
  'confirmado',
  'concluido',
  'cancelado',
];

const LEGACY_STATUS_ALIASES: Record<string, BackendOrderStatus> = {
  pendente: 'aguardando_pagamento',
  pago: 'confirmado',
  entregue: 'concluido',
  novo: 'aguardando_dados',
};

/**
 * Reconciles backend status values and legacy/PT-BR aliases into canonical BackendOrderStatus.
 */
export function normalizeOrderStatus(raw: string | undefined | null): BackendOrderStatus {
  const value = String(raw || '').trim();
  if (value in ORDER_STATUS_UI_MAP) {
    return value as BackendOrderStatus;
  }
  const lower = value.toLowerCase();
  if (lower in LEGACY_STATUS_ALIASES) {
    return LEGACY_STATUS_ALIASES[lower];
  }
  return resolveBackendOrderStatus(value) ?? 'aguardando_dados';
}

export function getOrderStatusMeta(rawStatus: string | undefined | null) {
  const normalized = normalizeOrderStatus(rawStatus);
  return ORDER_STATUS_META[normalized];
}

export function extractCustomerPhone(order: Pick<BusinessOrder, 'customer_jid' | 'delivery_address'>): string {
  const fromJid = String(order.customer_jid || '').split('@')[0];
  const fromAddress =
    order.delivery_address?.phone ||
    order.delivery_address?.whatsapp ||
    order.delivery_address?.telefone ||
    '';
  const digits = sanitizePhoneE164(fromJid || fromAddress);
  return digits.length >= 10 ? digits : '';
}

export function formatPhoneBR(rawDigits: string): string {
  const digits = String(rawDigits || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return rawDigits;
}

export function formatOrderDateTime(iso: string | undefined | null): {
  date: string;
  time: string;
  full: string;
} {
  if (!iso) return { date: '--/--', time: '--:--', full: 'Horário indisponível' };
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '--/--', time: '--:--', full: 'Horário indisponível' };
  }
  const date = parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = parsed.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { date, time, full: `${date} às ${time}` };
}

/**
 * Parses currency strings like "29,90", "1.250,50", or "29.90" into integer cents.
 */
export function parseBRLInputToCents(raw: string): number {
  const cleaned = String(raw || '')
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return 0;
  // M4: bloqueia notação científica (1e5), múltiplos separadores decimais (12,34,56) e negativos
  if (/[eE\-+]/.test(cleaned)) return 0;
  if ((cleaned.match(/,/g) || []).length > 1) return 0;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    return 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function isSimulationOrder(order: Pick<BusinessOrder, 'isSimulation' | 'is_simulation' | 'order_ref'>): boolean {
  return Boolean(order?.isSimulation || order?.is_simulation || String(order?.order_ref || '').startsWith('CG-SIM'));
}

export function isOrderDelayedOver2Hours(
  order: Pick<BusinessOrder, 'status' | 'updated_at' | 'created_at' | 'isSimulation' | 'is_simulation' | 'order_ref'>,
  nowMs: number = Date.now(),
): boolean {
  if (isSimulationOrder(order)) return false;
  const st = normalizeOrderStatus(order.status);
  if (st === 'concluido' || st === 'cancelado') return false;
  const ts = Date.parse(order.updated_at || order.created_at || '');
  return Number.isFinite(ts) && nowMs - ts > 7_200_000;
}

export function formatCentsForInput(cents: number): string {
  const safe = Number.isFinite(cents) && cents > 0 ? cents : 0;
  return (safe / 100).toFixed(2).replace('.', ',');
}

export function buildWhatsAppOrderUrl(
  phoneDigits: string,
  order: BusinessOrder,
  businessName?: string,
): string {
  const normalizedPhone = sanitizePhoneE164(phoneDigits);
  const storeLabel = businessName?.trim() || 'nossa loja';
  const statusLabel = ORDER_STATUS_UI_MAP[normalizeOrderStatus(order.status)];
  const greeting = `Olá, ${order.customer_name}! Aqui é da ${storeLabel}. Sobre seu pedido #${order.order_ref} (status: ${statusLabel}):`;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(greeting)}`;
}

export function isManualOrder(order: BusinessOrder): boolean {
  return (
    order.order_ref.startsWith('PED-') ||
    order.items.some(item => item.variation === 'Balcão')
  );
}
