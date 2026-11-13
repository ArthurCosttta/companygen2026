/**
 * Tipagens e Contratos para o Motor de Garimpo de Assets (AssetHunterEngine)
 */

export interface BrandContext {
  tenantId: string;
  brandName: string;
  segment: string;
  officialColors?: {
    primary: string;
    secondary: string;
    background: string;
  };
}

export interface SearchFilterSpec {
  minWidth: number;
  minHeight: number;
  preferPackshot: boolean;
  isolateBackground: boolean;
  targetAspectRatio: '1:1' | '4:5' | '9:16' | 'any';
  negativeKeywords: string[];
  mediaType?: 'all' | 'image' | 'video';
}

export interface SearchIntentPayload {
  requestId: string;
  brand: BrandContext;
  productName: string;
  productSlug: string;
  colorVariant?: string;
  desiredCount: number;
  filters: SearchFilterSpec;
  mediaType?: 'all' | 'image' | 'video';
  createdAt: string;
}

export interface CandidateRawAsset {
  rawUrl: string;
  sourceDomain: string;
  titleSnippet: string;
  declaredWidth: number;
  declaredHeight: number;
  formatHint?: 'jpg' | 'png' | 'webp' | 'mp4';
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  durationSec?: number;
}

export interface QualityMetricScores {
  semanticSimilarity: number;  // 0.0 a 1.0 (relevância do produto e marca)
  resolutionScore: number;      // 0.0 a 1.0 (comparado a 1080p)
  aspectRatioScore: number;     // 0.0 a 1.0 (aderência a 1:1, 4:5 ou 9:16)
  brandFitScore: number;        // 0.0 a 1.0 (packshot/fundo limpo)
  totalScore: number;           // Média ponderada final (>= 0.70 aprovado)
}

export interface RankedCandidate {
  candidateId: string;
  rawUrl: string;
  thumbnailUrl?: string;
  title: string;
  width: number;
  height: number;
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  durationSec?: number;
  scores: QualityMetricScores;
  isApproved: boolean;
  roleSuggestion: 'hero_packshot' | 'detail_close' | 'lifestyle_model' | 'reels_clip' | 'product_video';
}

export interface ProcessedAssetArtifact {
  assetId: string;
  productId: string;
  tenantId: string;
  sha256: string;
  localPath: string;
  publicStorageUrl?: string;
  transparentVariantUrl?: string;
  dimensions: { width: number; height: number };
  scores: QualityMetricScores;
}
