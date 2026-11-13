import { SearchIntentPayload } from './types';

export class SemanticQueryBuilder {
  private static readonly CLOTHING_SYNONYMS: Record<string, string[]> = {
    camisa: ['camisa', 'shirt', 'packshot', 'lookbook'],
    vestido: ['vestido', 'dress', 'packshot', 'modelo'],
    calça: ['calça', 'calca', 'pants', 'trousers', 'packshot'],
    linho: ['linho puro', 'tecido linho', 'linho misto'],
    polo: ['camisa polo', 'gola polo', 'polo shirt'],
    jeans: ['calça jeans', 'jeans denim', 'denim'],
  };

  private static readonly UNIVERSAL_NEGATIVES = [
    'meme',
    'desenho',
    'molde',
    'croqui',
    'vetor',
    'printscreen',
    'shopee_baixo_padrao',
    'mercado_livre_logo',
    'logo_marca_dagua',
  ];

  public static getSynonymsFor(term: string): string[] {
    const key = term.toLowerCase().trim();
    return SemanticQueryBuilder.CLOTHING_SYNONYMS[key] || [];
  }

  public static buildQuery(intent: SearchIntentPayload): string {
    const brandTerm = intent.brand.brandName ? `"${intent.brand.brandName}"` : '';
    const productTerm = `"${intent.productName}"`;
    const colorTerm = intent.colorVariant ? `"${intent.colorVariant}"` : '';
    const styleModifiers = intent.filters.preferPackshot
      ? '("fundo branco" OR "packshot" OR "studio shot")'
      : '("lookbook" OR "modelo")';

    const negativeTerms = [
      ...SemanticQueryBuilder.UNIVERSAL_NEGATIVES,
      ...intent.filters.negativeKeywords,
    ]
      .map((term) => `-${term}`)
      .join(' ');

    return `${brandTerm} ${productTerm} ${colorTerm} ${styleModifiers} ${negativeTerms}`.trim();
  }
}
