import type { FormulaV9Document, SectionNode } from '../schemas/formula-v9.schema';

export const FRIENDLY_SECTION_LABELS: Record<string, string> = {
  HeaderNav: 'Cabeçalho',
  HeroSection: 'Capa Principal',
  DifferentialsStrip: 'Diferenciais da Loja',
  InteractiveExperience: 'Simulador Interativo',
  EditorialMediaSplit: 'História & Apresentação',
  StepsTimeline: 'Passo a Passo',
  HighlightsGrid: 'Coleções em Destaque',
  ComplementaryBundles: 'Combos Complementares',
  ContextualFaq: 'Perguntas Frequentes',
  FaqAccordion: 'Perguntas Frequentes',
  CatalogGrid: 'Catálogo de Produtos',
  ClosingScheduleSplit: 'Horários & Contato',
  RichFooter: 'Rodapé',
};

export function friendlySectionName(type: string): string {
  return FRIENDLY_SECTION_LABELS[type] || 'Seção da Loja';
}

export interface HumanFormulaDiffEntry {
  key: string;
  sectionLabel: string;
  description: string;
  kind: 'theme' | 'order' | 'added' | 'removed' | 'updated';
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim();
}

function getSectionConfigSummary(section: SectionNode): Record<string, unknown> {
  return (section.config || {}) as Record<string, unknown>;
}

/**
 * Compares draft vs published FormulaV9Document and emits strictly human-readable PT-BR labels
 * with zero internal technical keys, section IDs, or JSON field names (BUG-F04-08).
 */
export function computeHumanFormulaDiff(
  draftIr: FormulaV9Document,
  publishedIr: FormulaV9Document,
): HumanFormulaDiffEntry[] {
  const entries: HumanFormulaDiffEntry[] = [];

  // 1. Visual theme & typography comparison
  const dTokens = draftIr?.designTokens || ({} as FormulaV9Document['designTokens']);
  const pTokens = publishedIr?.designTokens || ({} as FormulaV9Document['designTokens']);
  if (
    dTokens.accent !== pTokens.accent ||
    dTokens.surface !== pTokens.surface ||
    dTokens.card !== pTokens.card ||
    dTokens.ink !== pTokens.ink
  ) {
    entries.push({
      key: 'theme-colors',
      sectionLabel: 'Cores da Marca',
      description: 'Cores da Marca: paleta ou contraste visual ajustado',
      kind: 'theme',
    });
  }
  if (dTokens.fontStyle && pTokens.fontStyle && dTokens.fontStyle !== pTokens.fontStyle) {
    entries.push({
      key: 'theme-font',
      sectionLabel: 'Tipografia',
      description: 'Tipografia: estilo das fontes atualizado',
      kind: 'theme',
    });
  }

  // 2. Section comparison without exposing raw IDs
  const draftSections = Array.isArray(draftIr?.sections) ? draftIr.sections : [];
  const pubSections = Array.isArray(publishedIr?.sections) ? publishedIr.sections : [];

  const pubById = new Map(pubSections.map((s) => [s.id, s]));
  const draftById = new Map(draftSections.map((s) => [s.id, s]));

  // Order comparison on shared sections
  const sharedPubOrder = pubSections.filter((s) => draftById.has(s.id)).map((s) => s.id);
  const sharedDraftOrder = draftSections.filter((s) => pubById.has(s.id)).map((s) => s.id);
  if (
    sharedPubOrder.length > 1 &&
    sharedPubOrder.some((id, idx) => sharedDraftOrder[idx] !== id)
  ) {
    entries.push({
      key: 'sections-order',
      sectionLabel: 'Organização da Página',
      description: 'Ordem das seções na vitrine atualizada',
      kind: 'order',
    });
  }

  for (const dSec of draftSections) {
    const label = friendlySectionName(dSec.type);
    const pSec = pubById.get(dSec.id);
    if (!pSec) {
      entries.push({
        key: `added-${dSec.id}`,
        sectionLabel: label,
        description: `${label}: nova seção adicionada`,
        kind: 'added',
      });
      continue;
    }

    const dCfg = getSectionConfigSummary(dSec);
    const pCfg = getSectionConfigSummary(pSec);

    if (normalizedText(dCfg.title) !== normalizedText(pCfg.title)) {
      entries.push({
        key: `title-${dSec.id}`,
        sectionLabel: label,
        description: `${label}: título alterado`,
        kind: 'updated',
      });
    }

    const dSub = normalizedText(dCfg.subtitle ?? dCfg.body ?? dCfg.tagline);
    const pSub = normalizedText(pCfg.subtitle ?? pCfg.body ?? pCfg.tagline);
    if (dSub !== pSub) {
      entries.push({
        key: `subtitle-${dSec.id}`,
        sectionLabel: label,
        description: `${label}: texto de apoio atualizado`,
        kind: 'updated',
      });
    }

    if (normalizedText(dCfg.imageUrl) !== normalizedText(pCfg.imageUrl)) {
      entries.push({
        key: `image-${dSec.id}`,
        sectionLabel: label,
        description: `${label}: foto da seção trocada`,
        kind: 'updated',
      });
    }

    if (dSec.type === 'FaqAccordion' || dSec.type === 'ContextualFaq') {
      const dItems = Array.isArray(dCfg.items) ? dCfg.items : [];
      const pItems = Array.isArray(pCfg.items) ? pCfg.items : [];
      if (JSON.stringify(dItems) !== JSON.stringify(pItems)) {
        const delta = dItems.length - pItems.length;
        const msg =
          delta > 0
            ? `${label}: ${delta} ${delta === 1 ? 'pergunta adicionada' : 'perguntas adicionadas'}`
            : `${label}: perguntas frequentes atualizadas`;
        entries.push({
          key: `faq-${dSec.id}`,
          sectionLabel: label,
          description: msg,
          kind: 'updated',
        });
      }
    } else if (JSON.stringify(dCfg) !== JSON.stringify(pCfg)) {
      const alreadyLoggedForSection = entries.some((e) => e.key.endsWith(`-${dSec.id}`));
      if (!alreadyLoggedForSection) {
        entries.push({
          key: `cfg-${dSec.id}`,
          sectionLabel: label,
          description: `${label}: conteúdo da seção ajustado`,
          kind: 'updated',
        });
      }
    }
  }

  for (const pSec of pubSections) {
    if (!draftById.has(pSec.id)) {
      const label = friendlySectionName(pSec.type);
      entries.push({
        key: `removed-${pSec.id}`,
        sectionLabel: label,
        description: `${label}: seção removida`,
        kind: 'removed',
      });
    }
  }

  // Subpages difference without file paths
  const dPages = Array.isArray(draftIr?.pages) ? draftIr.pages.length : 0;
  const pPages = Array.isArray(publishedIr?.pages) ? publishedIr.pages.length : 0;
  if (dPages > pPages) {
    const added = dPages - pPages;
    entries.push({
      key: 'subpages-added',
      sectionLabel: 'Páginas Extras',
      description: `Páginas Extras: ${added} ${added === 1 ? 'nova página criada' : 'novas páginas criadas'}`,
      kind: 'added',
    });
  }

  return entries;
}
