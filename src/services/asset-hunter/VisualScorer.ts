import { CandidateRawAsset, QualityMetricScores, SearchIntentPayload } from './types';

export class VisualScorer {
  // Pesos matemáticos calibrados
  private static readonly W_SEM = 0.40;
  private static readonly W_RES = 0.30;
  private static readonly W_AR  = 0.15;
  private static readonly W_BRD = 0.15;

  public static scoreCandidate(
    candidate: CandidateRawAsset,
    intent: SearchIntentPayload
  ): QualityMetricScores {
    // 1. Resolução (compara com 1080x1080)
    const targetPixels = 1080 * 1080;
    const actualPixels = (candidate.declaredWidth || 800) * (candidate.declaredHeight || 800);
    const resolutionScore = Math.min(1.0, Math.sqrt(actualPixels) / Math.sqrt(targetPixels));

    // Descarte imediato de miniatura se < 400px
    if ((candidate.declaredWidth && candidate.declaredWidth < 400) ||
        (candidate.declaredHeight && candidate.declaredHeight < 400)) {
      return {
        semanticSimilarity: 0,
        resolutionScore: 0,
        aspectRatioScore: 0,
        brandFitScore: 0,
        totalScore: 0,
      };
    }

    // 2. Aspect Ratio (1:1 = 1.0, 4:5 = 0.8, 9:16 = 0.5625)
    const width = candidate.declaredWidth || 1080;
    const height = candidate.declaredHeight || 1080;
    const ar = width / height;
    const deltaAr = Math.min(
      Math.abs(ar - 1.0),
      Math.abs(ar - 0.80),
      Math.abs(ar - 0.5625)
    );
    const aspectRatioScore = Math.exp(-3.0 * deltaAr);

    // 3. Similaridade Semântica Simples
    const titleLower = (candidate.titleSnippet || '').toLowerCase();
    const productLower = intent.productName.toLowerCase();
    
    let hasProduct = 0.2;
    if (titleLower.includes(productLower)) {
      hasProduct = 0.6;
    } else {
      // Check partial words
      const words = productLower.split(' ').filter(w => w.length > 3);
      const matches = words.filter(w => titleLower.includes(w)).length;
      if (words.length > 0) {
        hasProduct = 0.2 + (matches / words.length) * 0.4;
      }
    }

    const hasColor = intent.colorVariant && titleLower.includes(intent.colorVariant.toLowerCase()) ? 0.4 : 0.0;
    const semanticSimilarity = Math.min(1.0, hasProduct + hasColor);

    // 4. Marca e Fundo
    const brandName = (intent.brand.brandName || '').toLowerCase();
    const hasBrand = brandName && titleLower.includes(brandName) ? 0.5 : 0.1;
    const hasPackshotKeyword =
      titleLower.includes('branco') ||
      titleLower.includes('packshot') ||
      titleLower.includes('studio') ||
      titleLower.includes('foto')
        ? 0.5
        : 0.2;
    const brandFitScore = Math.min(1.0, hasBrand + hasPackshotKeyword);

    // 5. Total Composto
    const totalScore =
      VisualScorer.W_SEM * semanticSimilarity +
      VisualScorer.W_RES * resolutionScore +
      VisualScorer.W_AR * aspectRatioScore +
      VisualScorer.W_BRD * brandFitScore;

    return {
      semanticSimilarity: Number(semanticSimilarity.toFixed(2)),
      resolutionScore: Number(resolutionScore.toFixed(2)),
      aspectRatioScore: Number(aspectRatioScore.toFixed(2)),
      brandFitScore: Number(brandFitScore.toFixed(2)),
      totalScore: Number(totalScore.toFixed(2)),
    };
  }
}
