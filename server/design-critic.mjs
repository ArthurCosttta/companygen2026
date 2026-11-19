/**
 * Design Critic — Avaliador Determinístico Local (0 cr, < 10ms)
 * Retorna até 2 dicas acionáveis em português humano baseadas exclusivamente
 * nos dados reais de `profile` e `formulaIr` (BUG-F04-09: zero alucinação).
 */
import { contrastRatio } from '../shared/formula-ir/composer-schema.mjs';

export function runDesignCritic(profile = {}, formulaIr = {}) {
  const tips = [];
  const products = Array.isArray(profile?.catalog?.products)
    ? profile.catalog.products.filter((p) => p && p.active !== false)
    : [];
  const sections = Array.isArray(formulaIr?.sections) ? formulaIr.sections : [];
  const tokens = formulaIr?.designTokens || {};

  // 1. Contraste WCAG real dos tokens da vitrine
  if (tokens.ink && tokens.surface && contrastRatio(tokens.ink, tokens.surface) < 4.5) {
    tips.push({
      id: 'critic_wcag_contrast',
      severity: 'warning',
      title: 'Contraste de leitura abaixo do ideal',
      message: 'Use o botão "Corrigir contraste em 1 clique" para garantir leitura nítida no celular.',
      actionType: 'fix_wcag',
    });
  }

  // 2. Fold Budget mobile do Hero (título > 58 chars ou subtítulo > 115 chars)
  const hero = sections.find((s) => s?.type === 'HeroSection');
  if (hero?.config) {
    const titleLen = String(hero.config.title || '').length;
    const subLen = String(hero.config.subtitle || '').length;
    if (titleLen > 58 || subLen > 115) {
      tips.push({
        id: 'critic_fold_budget',
        severity: 'info',
        title: 'Capa principal longa para tela de celular (390px)',
        message: 'Enxugue o título da Capa Principal para manter a foto e o botão visíveis sem rolar.',
        actionType: 'select_hero',
      });
    }
  }

  // 3. Produtos sem foto real (usando placeholder SVG ou vazio)
  const withoutCustomPhoto = products.filter(
    (p) => !p.imageUrl || String(p.imageUrl).startsWith('data:image/svg+xml'),
  );
  if (tips.length < 2 && products.length > 0 && withoutCustomPhoto.length > 0) {
    tips.push({
      id: 'critic_missing_photos',
      severity: 'info',
      title: `${withoutCustomPhoto.length} ${withoutCustomPhoto.length === 1 ? 'item sem foto real' : 'itens sem foto real'}`,
      message: `Adicione fotos reais ou busque imagens grátis (0 cr) para ${withoutCustomPhoto[0].name}.`,
      actionType: 'open_photo_search',
    });
  }

  // 4. Frete/Entrega: SOMENTE sugere configurar frete se NÃO houver taxa nem frete grátis configurados (BUG-F04-09)
  const hasFixedShipping =
    Number(profile?.shipping?.fixedFeeCents ?? profile?.delivery?.defaultFeeCents ?? 0) > 0;
  const hasFreeThreshold = Number(profile?.shipping?.freeShippingThresholdCents ?? 0) > 0;
  const isServicesOnly = String(profile?.business?.businessModel || '') === 'servicos';
  if (tips.length < 2 && !isServicesOnly && !hasFixedShipping && !hasFreeThreshold) {
    tips.push({
      id: 'critic_shipping_unset',
      severity: 'info',
      title: 'Frete grátis ou taxa local ainda não informados',
      message: 'Defina uma meta de Frete Grátis na aba Catálogo para aumentar o valor médio da sacola.',
      actionType: 'check_shipping',
    });
  }

  // 5. Itens sem variação especificada ("Padrão" ou vazia)
  const genericVariationCount = products.filter(
    (p) => !p.variation || String(p.variation).trim() === '' || String(p.variation).trim() === 'Padrão',
  ).length;
  if (tips.length < 2 && products.length >= 2 && genericVariationCount === products.length) {
    tips.push({
      id: 'critic_variations',
      severity: 'info',
      title: 'Especifique tamanhos ou volumes nos itens',
      message: 'Informar variações como "30ml", "500g" ou "M/G" reduz dúvidas no WhatsApp.',
      actionType: 'check_catalog',
    });
  }

  // 6. Combos "Combine e Economize" ausentes quando há >= 2 produtos
  const hasBundlesSection = sections.some((s) => s?.type === 'ComplementaryBundles');
  if (tips.length < 2 && products.length >= 2 && !hasBundlesSection) {
    tips.push({
      id: 'critic_add_bundles',
      severity: 'info',
      title: 'Sugira combos "Combine e Economize"',
      message: 'Com 2 ou mais produtos ativos, adicionar a seção de Combos estimula compras conjuntas.',
      actionType: 'add_bundles',
    });
  }

  return tips.slice(0, 2);
}
