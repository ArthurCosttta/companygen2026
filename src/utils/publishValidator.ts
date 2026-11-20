import type { BusinessProfile } from '@/schemas/profile.schema';

export interface PublishValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateStoreBeforePublish(profile: Partial<BusinessProfile> | null | undefined): PublishValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const products = Array.isArray(profile?.catalog?.products) ? profile.catalog.products.filter((p) => p && p.active !== false) : [];
  if (products.length === 0) {
    errors.push('Cadastre pelo menos 1 produto ou serviço ativo antes de publicar.');
  } else {
    const zeroPriceProducts = products.filter((p) => !(Number(p.priceCents) > 0));
    if (zeroPriceProducts.length > 0) {
      warnings.push(`${zeroPriceProducts.length} item(ns) estão com preço R$ 0,00.`);
    }
  }

  const rawPhone = String(profile?.whatsapp?.phoneE164 || '').replace(/\D/g, '');
  if (rawPhone.length < 10) {
    errors.push('Informe um número de WhatsApp válido com DDD para receber pedidos.');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
