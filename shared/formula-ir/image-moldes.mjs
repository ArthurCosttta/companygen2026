/**
 * Prompts-Moldes de Imagem Encaixada (DOC 01).
 * Garante que toda imagem gerada pela IA receba valores explícitos de enquadramento,
 * zona de respiro para texto, paleta hex da loja e exclusões negativas anti-genérico.
 */

export const IMAGE_SLOT_MOLDES = Object.freeze({
  HERO_RIGHT_FOCAL_DARK_STAGE: {
    id: 'HERO_RIGHT_FOCAL_DARK_STAGE',
    aspectRatio: '16:9',
    width: 1344,
    height: 768,
    negativeSpaceZone: 'LEFT 48% uninterrupted dark matte backdrop matching ${surfaceHex} so massive headline achieves >=7:1 contrast',
    focalZone: 'RIGHT 46% sharp sculptural subject silhouette illuminated by ${accentHex} rim light',
    defaultMedium: 'stylized tactile studio illustration & clean gouache shading',
  },
  HERO_WARM_EDITORIAL_CARD_FRAME: {
    id: 'HERO_WARM_EDITORIAL_CARD_FRAME',
    aspectRatio: '16:9',
    width: 1344,
    height: 768,
    negativeSpaceZone: 'LOWER-LEFT 30% calm warm softly blurred surface ${surfaceHex} to host a floating card without collision',
    focalZone: 'UPPER-RIGHT & CENTER-RIGHT 65% sunlit refined architectural scene in ${primaryHex} and ${accentHex}',
    defaultMedium: 'warm editorial illustration & tactile gouache artwork',
  },
  SPLIT_50_VIBRANT_CUTOUT: {
    id: 'SPLIT_50_VIBRANT_CUTOUT',
    aspectRatio: '4:3',
    width: 1152,
    height: 896,
    negativeSpaceZone: 'outer 25% margin solid smooth ${accentHex} backdrop without harsh white box',
    focalZone: 'centered hero object occupying inner 68% with subtle studio floor shadow only',
    defaultMedium: 'clean crisp editorial object illustration with matte shading',
  },
  CHECKPOINT_STAGGER_PORTRAIT_4X5: {
    id: 'CHECKPOINT_STAGGER_PORTRAIT_4X5',
    aspectRatio: '4:5',
    width: 896,
    height: 1120,
    negativeSpaceZone: 'top 14% and bottom 14% clean warm stone cream #F5F1E8 backdrop for card crop',
    focalZone: 'center object framed cleanly with subtle seasonal botanical/prop accent in ${accentHex}',
    defaultMedium: 'stylized clean studio artwork on warm mineral paper',
  },
  EDITORIAL_STORY_DIPTYCH: {
    id: 'EDITORIAL_STORY_DIPTYCH',
    aspectRatio: '4:3',
    width: 1152,
    height: 896,
    negativeSpaceZone: 'balanced quiet corners free of small objects',
    focalZone: 'craft tools, natural ingredients or architectural worktable of ${storeName} in ${primaryHex}/${accentHex}',
    defaultMedium: 'editorial risograph & gouache illustration',
  },
  SPECIALIST_STYLIZED_PORTRAIT_3X4: {
    id: 'SPECIALIST_STYLIZED_PORTRAIT_3X4',
    aspectRatio: '3:4',
    width: 896,
    height: 1152,
    negativeSpaceZone: 'LOWER 28% subtly darkened vignette for white quote legibility >=4.5:1',
    focalZone: 'upper-center stylized magazine portrait silhouette in refined modern editorial art style (NOT hyperreal skin)',
    defaultMedium: 'stylized editorial magazine illustration portrait',
  },
  BANNER_TEXTURE_RIBBON_BG: {
    id: 'BANNER_TEXTURE_RIBBON_BG',
    aspectRatio: '16:9',
    width: 1344,
    height: 768,
    negativeSpaceZone: 'CENTER 55% quiet tonal texture so countdown and tear-off coupon sit cleanly without visual noise',
    focalZone: 'peripheral atmospheric accents around outer edges in ${accentHex}',
    defaultMedium: 'atmospheric matte layered illustration with fine grain',
  },
  INTERACTIVE_DIAGRAM_SCENE: {
    id: 'INTERACTIVE_DIAGRAM_SCENE',
    aspectRatio: '16:9',
    width: 1280,
    height: 720,
    negativeSpaceZone: 'even spatial separation between elements so 3 to 5 interactive hotspots sit cleanly apart',
    focalZone: 'isometric or studio flat-lay arrangement of distinct components for ${storeName}',
    defaultMedium: 'crisp clean editorial technical/botanical gouache illustration',
  },
});

export const ROLE_TO_IMAGE_MOLDE_ID = Object.freeze({
  hero_stage: 'HERO_RIGHT_FOCAL_DARK_STAGE',
  campaign_christmas_hero: 'HERO_RIGHT_FOCAL_DARK_STAGE',
  campaign_blackfriday_hero: 'HERO_RIGHT_FOCAL_DARK_STAGE',
  clinic_editorial_hero: 'HERO_WARM_EDITORIAL_CARD_FRAME',
  hero_split: 'HERO_WARM_EDITORIAL_CARD_FRAME',
  hero_centered: 'SPLIT_50_VIBRANT_CUTOUT',
  campaign_blackfriday_drop: 'SPLIT_50_VIBRANT_CUTOUT',
  bento_spotlight: 'SPLIT_50_VIBRANT_CUTOUT',
  campaign_christmas_checkpoints: 'CHECKPOINT_STAGGER_PORTRAIT_4X5',
  coupled_media_grid: 'CHECKPOINT_STAGGER_PORTRAIT_4X5',
  split_story: 'EDITORIAL_STORY_DIPTYCH',
  clinic_specialists_deck: 'SPECIALIST_STYLIZED_PORTRAIT_3X4',
  embedded_banner: 'BANNER_TEXTURE_RIBBON_BG',
  scratch_reward: 'BANNER_TEXTURE_RIBBON_BG',
  interactive_image_text_stage: 'INTERACTIVE_DIAGRAM_SCENE',
});

/**
 * Compila prompt + negativePrompt altamente encaixados no slot e na paleta da loja.
 */
export function compileImagePromptFromMolde({
  role = 'hero_stage',
  moldeId,
  storeName = 'Loja',
  segment = 'Comércio Local',
  subject = '',
  seasonalProp = 'clean botanical accent',
  surfaceHex = '#0C1A13',
  primaryHex = '#111827',
  accentHex = '#C65D3B',
  neutralHex = '#F6F0E6',
  textAnchor = 'left',
} = {}) {
  const chosenId =
    (moldeId && IMAGE_SLOT_MOLDES[moldeId] ? moldeId : ROLE_TO_IMAGE_MOLDE_ID[role]) ||
    'HERO_RIGHT_FOCAL_DARK_STAGE';
  const spec = IMAGE_SLOT_MOLDES[chosenId];

  const cleanSubject = String(subject || '').trim() || `signature items for ${segment}`;
  const flippedClear =
    textAnchor === 'right'
      ? `RIGHT 48% uninterrupted matte surface ${surfaceHex}, focal artwork framed on LEFT 46%`
      : spec.negativeSpaceZone
          .replace(/\$\{surfaceHex\}/g, surfaceHex)
          .replace(/\$\{accentHex\}/g, accentHex)
          .replace(/\$\{primaryHex\}/g, primaryHex);

  const focal = spec.focalZone
    .replace(/\$\{surfaceHex\}/g, surfaceHex)
    .replace(/\$\{accentHex\}/g, accentHex)
    .replace(/\$\{primaryHex\}/g, primaryHex)
    .replace(/\$\{storeName\}/g, storeName);

  const prompt = [
    `COMPOSITION BLUEPRINT [${chosenId}]:`,
    `A cohesive ${spec.defaultMedium} crafted for "${storeName}" (${segment}), depicting ${cleanSubject}.`,
    `SPATIAL ANCHORING: Negative clear space = ${flippedClear}. Focal composition = ${focal}. Subtle tactile prop = ${seasonalProp}.`,
    `PALETTE LOCK: Dominant surface ${surfaceHex}, structural ink ${primaryHex}, vibrant accent ${accentHex}, highlight ${neutralHex}. Risograph paper grain, sharp silhouette contrast, NOT photorealistic.`,
    `HARD EXCLUSIONS: zero text, zero letters, zero prices, zero badges, zero watermarks, zero white box frames, zero uncanny hyperreal faces.`,
  ]
    .join(' ')
    .slice(0, 750);

  const negativePrompt =
    'text, words, letters, typography, price tag, watermark, logo stamp, white square border, busy stock collage, distorted faces, hyperrealistic plastic skin, blurry clutter';

  return {
    moldeId: chosenId,
    aspectRatio: spec.aspectRatio,
    width: spec.width,
    height: spec.height,
    prompt,
    negativePrompt,
  };
}

export function validateNonGenericImagePrompt(promptText = '') {
  const txt = String(promptText || '').toLowerCase();
  const hasPaletteHex = /#[0-9a-f]{6}/i.test(txt);
  const hasSpatialRule = /left|right|center|lower|negative|backdrop|space/.test(txt);
  const isGenericOnly = /^\s*(a nice|store product|generic photo|beautiful background)\s*$/i.test(txt);
  return {
    valid: txt.length >= 45 && !isGenericOnly && (hasPaletteHex || hasSpatialRule),
    hasPaletteHex,
    hasSpatialRule,
  };
}
