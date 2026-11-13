import type { CartLine, Product, Site, Variant } from '../compiler/types';
import { money } from '../compiler/compile';
import { subtotal, total } from '../capabilities/cart';

export function cleanCustomerMessage(message: string) {
  return message
    .replace(/\*/g, '')
    .replace(/\s*\(\s*SKU[^)]*\)/gi, '')
    .replace(/\bSKU\s*[:#-]?\s*[A-Za-z0-9_.-]+\b/gi, '')
    .replace(/\bSKU\b/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function interpolate(t: string, values: Record<string, string | number>) {
  return cleanCustomerMessage(t.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => String(values[k] ?? 'REQUIRED_INPUT')));
}

function template(s: Site, id: string) {
  const t = s.messages.templates.find(x => x.id === id);
  if (!t) throw new Error(`Template ausente: ${id}`);
  return t.text;
}

export function productMessage(s: Site, p: Product, v: Variant | undefined, quantity: number) {
  return interpolate(
    template(s, p.whatsappTemplateId || s.whatsapp.defaultTemplateId || ''),
    {
      'product.name': p.name,
      'product.sku': v?.sku || p.sku,
      quantity,
      unitPrice: money(v?.priceCents ?? p.priceCents),
      'business.name': s.business.name,
      'variant.label': v?.label || ''
    }
  );
}

export function cartMessage(s: Site, lines: CartLine[]) {
  const items = lines
    .map(
      x =>
        `• ${x.quantity}x ${x.name}${x.variantLabel && x.variantLabel !== 'Padrão' ? ` (${x.variantLabel})` : ''} — ${money(x.priceCents * x.quantity)}`
    )
    .join('\n');
  const id =
    (s.rules?.checkoutMode === 'whatsapp_quote'
      ? s.whatsapp.quoteTemplateId
      : s.whatsapp.checkoutTemplateId) ||
    s.whatsapp.checkoutTemplateId ||
    s.whatsapp.defaultTemplateId ||
    'cart-checkout';
  return interpolate(template(s, id), {
    'business.name': s.business.name,
    items,
    subtotal: money(subtotal(lines)),
    discount: money(s.rules?.discountCents || 0),
    shipping: money(s.rules?.shippingCents || 0),
    total: money(total(lines, s.rules))
  });
}

export function supportMessage(s: Site, subject: string) {
  return interpolate(
    template(s, s.whatsapp.supportTemplateId || s.whatsapp.defaultTemplateId || 'support'),
    { 'business.name': s.business.name, subject }
  );
}

export function bookingMessage(
  s: Site,
  templateId: string,
  petName: string,
  serviceName: string,
  date: string,
  time: string
) {
  return interpolate(template(s, templateId), {
    'business.name': s.business.name,
    'pet.name': petName,
    'service.name': serviceName,
    'booking.date': date,
    'booking.time': time
  });
}

export function waUrl(phone: string, message: string) {
  const clean = cleanCustomerMessage(message);
  if (!/^[0-9]{10,15}$/.test(phone) || !clean) throw new Error('Número ou mensagem inválida');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(clean)}`;
  if (url.length > 8000) throw new Error('Mensagem extensa; reduza o pedido.');
  return url;
}
