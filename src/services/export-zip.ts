import JSZip from 'jszip';
import type { CampaignSpec } from '@/schemas/campaign.schema';
import type { Asset, PostSceneIR } from '@/compiler/types';
import type { StudioPost } from '@/compiler/build-post-ir';
import { PostCompositionEngine } from '@/compiler/build-post-ir';
import { getCanvasMeasurer } from '@/compiler/layout-engine';
import { exportSceneToBlob } from '@/compiler/render-post';

export interface ProgressCallback {
  (step: string, current: number, total: number, message: string): void;
}

/** Validates PNG blob dimensions and decodability */
export async function validatePngBlob(blob: Blob): Promise<{ ok: boolean; width: number; height: number; error?: string }> {
  if (blob.size < 100) return { ok: false, width: 0, height: 0, error: 'Arquivo PNG corrompido ou vazio' };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (w === 1080 && h === 1350) {
        resolve({ ok: true, width: w, height: h });
      } else {
        resolve({ ok: false, width: w, height: h, error: `Dimensões incorretas: ${w}x${h} (esperado 1080x1350)` });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, width: 0, height: 0, error: 'Falha ao decodificar imagem PNG' });
    };
    img.src = url;
  });
}

/** Export a single slide as PNG download */
export async function downloadSlidePng(
  scene: PostSceneIR,
  assetMap: Map<string, Asset>,
  filename = 'slide.png'
): Promise<void> {
  const blob = await exportSceneToBlob(scene, assetMap);
  const validation = await validatePngBlob(blob);
  if (!validation.ok) throw new Error(validation.error || 'Erro na validação do PNG');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export a single post (all its slides + caption + post.json) as ZIP */
export async function downloadPostZip(
  post: StudioPost,
  campaignSpec: CampaignSpec,
  assets: Asset[],
  onProgress?: ProgressCallback
): Promise<void> {
  const zip = new JSZip();
  const assetMap = new Map(assets.map((a) => [a.asset_id, a]));
  const engine = new PostCompositionEngine(getCanvasMeasurer());

  const scenes = engine.compilePost({
    brand: campaignSpec.brand,
    campaign: campaignSpec.campaign,
    post,
    products: campaignSpec.products,
    assets,
  });

  const postFolder = zip.folder(post.id) || zip;

  for (let i = 0; i < scenes.length; i++) {
    const slideNumber = String(i + 1).padStart(2, '0');
    onProgress?.('Renderizando slides', i + 1, scenes.length, `Renderizando slide ${i + 1}/${scenes.length}`);
    const blob = await exportSceneToBlob(scenes[i], assetMap);
    const validation = await validatePngBlob(blob);
    if (!validation.ok) {
      console.warn(`Aviso de validação no slide ${i + 1}:`, validation.error);
    }
    postFolder.file(`slide_${slideNumber}.png`, blob);
  }

  postFolder.file('caption.txt', post.caption || '');
  postFolder.file('post.json', JSON.stringify(post, null, 2));

  onProgress?.('Compactando ZIP', scenes.length, scenes.length, 'Gerando arquivo ZIP...');
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${campaignSpec.campaign.id}_${post.id}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export entire campaign as ZIP */
export async function downloadCampaignZip(
  campaignSpec: CampaignSpec,
  posts: StudioPost[],
  assets: Asset[],
  onProgress?: ProgressCallback
): Promise<void> {
  const zip = new JSZip();
  const rootFolder = zip.folder('COMPANYGEN_CAMPAIGN') || zip;
  const postsFolder = rootFolder.folder('posts') || rootFolder;

  const assetMap = new Map(assets.map((a) => [a.asset_id, a]));
  const engine = new PostCompositionEngine(getCanvasMeasurer());

  // Count total slides
  let totalSlides = 0;
  posts.forEach((p) => (totalSlides += p.slides.length));

  let completedSlides = 0;
  const scheduleRows = ['post_id,date,time,status,type,title,slides_count'];

  for (const post of posts) {
    const postSubfolder = postsFolder.folder(post.id) || postsFolder;
    const scenes = engine.compilePost({
      brand: campaignSpec.brand,
      campaign: campaignSpec.campaign,
      post,
      products: campaignSpec.products,
      assets,
    });

    for (let i = 0; i < scenes.length; i++) {
      completedSlides++;
      const slideNumber = String(i + 1).padStart(2, '0');
      onProgress?.(
        'Renderizando slides',
        completedSlides,
        totalSlides,
        `Post ${post.id}: slide ${i + 1}/${scenes.length} (${completedSlides}/${totalSlides})`
      );

      const blob = await exportSceneToBlob(scenes[i], assetMap);
      const val = await validatePngBlob(blob);
      if (!val.ok) console.warn(`Aviso no post ${post.id} slide ${i + 1}:`, val.error);

      postSubfolder.file(`slide_${slideNumber}.png`, blob);
    }

    postSubfolder.file('caption.txt', post.caption || '');
    postSubfolder.file('post.json', JSON.stringify(post, null, 2));

    scheduleRows.push(
      `"${post.id}","${post.date}","${post.time}","${post.status}","${post.type}","${post.title.replace(/"/g, '""')}",${post.slides.length}`
    );
  }

  // Root files
  rootFolder.file('campaign.json', JSON.stringify(campaignSpec, null, 2));
  rootFolder.file('schedule.csv', scheduleRows.join('\n'));

  // Assets manifest
  rootFolder.file(
    'assets_manifest.json',
    JSON.stringify(
      {
        campaign_id: campaignSpec.campaign.id,
        exported_at: new Date().toISOString(),
        assets_count: assets.length,
        assets: assets.map((a) => ({
          asset_id: a.asset_id,
          provider: a.provider,
          source_url: a.source_url,
          photographer: a.photographer,
          license: a.license,
          license_url: a.license_url,
          attribution: a.attribution,
          local_path: a.local_path,
          width: a.width,
          height: a.height,
        })),
      },
      null,
      2
    )
  );

  // Credits
  const creditsContent = [
    `# Créditos e Licenças — ${campaignSpec.brand.name}`,
    '',
    `Campanha: ${campaignSpec.campaign.name} (${campaignSpec.campaign.id})`,
    `Data de Exportação: ${new Date().toLocaleDateString('pt-BR')}`,
    '',
    '## Fotografias Utilizadas',
    ...assets.map(
      (a) =>
        `- **${a.asset_id}**: ${a.title || 'Foto'} — Foto por [${a.photographer}](${a.photographer_url || a.source_url || '#'}). Licença: ${a.license}. [Origem](${a.source_url || '#'})`
    ),
    '',
    '## Nota Legal',
    'As fotografias de estoque foram obtidas de fontes autorizadas com licenças que permitem uso comercial e modificações. Elas ilustram composições conceituais de estilo e não devem ser atribuídas como fotos oficiais de produtos específicos a menos que explicitamente indicado.',
  ].join('\n');
  rootFolder.file('credits.md', creditsContent);

  // README
  const readmeContent = [
    `# ${campaignSpec.brand.name} — Studio de Posts`,
    '',
    `Campanha gerada pelo CompanyGen Post Studio.`,
    `- Total de posts: ${posts.length}`,
    `- Total de slides: ${totalSlides}`,
    `- Plataforma: ${campaignSpec.campaign.platform}`,
    `- Fuso horário: ${campaignSpec.campaign.timezone}`,
    '',
    '## Estrutura da Pasta',
    '- `posts/`: Cada post possui seus slides numerados (1080x1350 PNG), legenda (`caption.txt`) e metadados (`post.json`).',
    '- `schedule.csv`: Cronograma resumido para importação ou consulta rápida.',
    '- `campaign.json`: Arquivo de especificação completo da campanha.',
    '- `assets_manifest.json` e `credits.md`: Rastreabilidade de cada fotografia e licença aplicada.',
  ].join('\n');
  rootFolder.file('README.md', readmeContent);

  onProgress?.('Compactando ZIP', totalSlides, totalSlides, 'Compactando todos os arquivos da campanha...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `COMPANYGEN_${campaignSpec.campaign.id}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
