import type { Asset } from '@/compiler/types';
import type { CandidateRawAsset, RankedCandidate, SearchIntentPayload } from './types';
import { VisualScorer } from './VisualScorer';
import { isWebUrl, searchWebAssets } from '../image-search';

export class AssetHunterEngine {
  public static async huntCandidates(
    intent: SearchIntentPayload,
    onLog?: (msg: string) => void
  ): Promise<RankedCandidate[]> {
    const log = onLog || console.log;

    log(`[Nó 1] Processando intent: Marca="${intent.brand.brandName}", Produto="${intent.productName}", Mídia=${intent.mediaType || 'all'}, Meta=${intent.desiredCount}`);

    // 1. Gera a query semântica
    const compiledQuery = [intent.productName.trim(), intent.colorVariant?.trim()].filter(Boolean).join(' ');
    log(`[Nó 2] Query Booleana: ${compiledQuery}`);

    const rawCandidates: CandidateRawAsset[] = (await searchWebAssets(
      compiledQuery, intent.desiredCount, intent.mediaType || 'image',
    )).map(item => ({
      rawUrl: item.rawUrl,
      thumbnailUrl: isWebUrl(item.thumbnailUrl) ? item.thumbnailUrl : item.rawUrl,
      titleSnippet: item.titleSnippet || '',
      sourceDomain: item.sourceDomain || new URL(item.rawUrl).hostname,
      declaredWidth: Number(item.declaredWidth) || 0,
      declaredHeight: Number(item.declaredHeight) || 0,
      formatHint: item.mediaType === 'video' ? 'mp4' : 'jpg',
      mediaType: item.mediaType || 'image',
      videoUrl: isWebUrl(item.videoUrl) ? item.videoUrl : undefined,
      durationSec: item.durationSec,
    }));
    log(rawCandidates.length + ' resultados da busca web.');

    // 3. Aplica o VisualScorer matemático em cada um
    log(`[Nó 4] Calculando scores matemáticos ponderados (Resolução, AR, Semântica e Marca)...`);
    const ranked: RankedCandidate[] = rawCandidates.map((c, index) => {
      const scores = VisualScorer.scoreCandidate(c, intent);
      let role: 'hero_packshot' | 'detail_close' | 'lifestyle_model' | 'reels_clip' = 'hero_packshot';
      if (c.mediaType === 'video') {
        role = 'reels_clip';
      } else if (index % 3 === 1) {
        role = 'detail_close';
      } else if (index % 3 === 2) {
        role = 'lifestyle_model';
      }

      return {
        candidateId: `cand_${intent.brand.tenantId || 'store'}_${Date.now()}_${index}`,
        rawUrl: c.rawUrl,
        thumbnailUrl: c.thumbnailUrl || c.rawUrl,
        title: c.titleSnippet,
        width: c.declaredWidth,
        height: c.declaredHeight,
        mediaType: c.mediaType || 'image',
        videoUrl: c.videoUrl,
        durationSec: c.durationSec,
        scores,
        isApproved: scores.totalScore >= 0.65,
        roleSuggestion: role,
      };
    });

    // Ordena pelo score decrescente
    ranked.sort((a, b) => b.scores.totalScore - a.scores.totalScore);
    const approvedCount = ranked.filter(r => r.isApproved).length;
    log(`[Nó 4] Scoring concluído: ${approvedCount} aprovados com alta qualidade visual!`);

    return ranked.slice(0, intent.desiredCount);
  }

  /**
   * Converte os candidatos selecionados para o formato oficial Asset do CompanyGen
   */
  public static convertToStudioAssets(
    candidates: RankedCandidate[],
    intent: SearchIntentPayload,
    onLog?: (msg: string) => void
  ): Asset[] {
    const log = onLog || console.log;
    log(`[Nó 6 & 7] Ingerindo ${candidates.length} assets no catálogo da loja "${intent.brand.brandName}"...`);

    return candidates.map((cand, idx) => {
      const assetId = 'asset_' + crypto.randomUUID();
      return {
        asset_id: assetId,
        provider: 'asset-hunter',
        collection: intent.productSlug,
        source_url: cand.rawUrl,
        download_url: cand.rawUrl,
        photographer: intent.brand.brandName,
        license: 'Verificar na origem',
        title: `${intent.brand.brandName} - ${intent.productName} #${idx + 1}`,
        local_path: cand.rawUrl,
        width: cand.width,
        height: cand.height,
        tags: [
          intent.brand.brandName,
          intent.productName,
          intent.brand.segment,
          cand.roleSuggestion,
          cand.mediaType || 'image',
        ],
        query: intent.productName,
        stock_photo: false,
      };
    });
  }
}
