import type { Asset, SiteIR } from '../compiler/types';

export function promptFor(a: Asset, s: SiteIR) {
  const prompt = s.promptIndex[a.assetId];
  if (!prompt) throw new Error(`Prompt ausente: ${a.assetId}`);
  const p = a.ownerRef ? s.productIndex[a.ownerRef] : undefined;
  const values: Record<string, string> = {
    'asset.id': a.assetId,
    'asset.kind': a.kind || '',
    'asset.ratio': a.ratio || '1:1',
    'business.name': s.business.name,
    'business.description': s.business.description,
    'product.name': p?.name || 'REQUIRED_INPUT',
    'product.sku': p?.sku || 'REQUIRED_INPUT',
    'category.name': s.categories.find(c => c.id === a.ownerRef)?.name || 'REQUIRED_INPUT'
  };
  const fill = (t: string) => t.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => values[k] || 'REQUIRED_INPUT');
  return `Asset: ${a.assetId}\nSlot: ${a.kind || 'product.cutout'} · ${a.ratio || '1:1'} · ${prompt.width}×${prompt.height} px\nEscopo: ${prompt.generationScope || 'não especificado'}\n\n${fill(prompt.text)}\n\nRestrições: ${fill(prompt.negative || '')}`;
}
