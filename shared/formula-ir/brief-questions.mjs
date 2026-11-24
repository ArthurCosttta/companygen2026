import { z } from 'zod';
import { classifyBusinessArchetype } from './spreadsheet-intelligence.mjs';

/**
 * Motor de Perguntas Dinamicas em JSON (DOC 02).
 * O GLM analisa pedido + catalogo + Instagram e emite ate 5 perguntas ricas tipadas.
 * Cada pergunta carrega `mapsToTarget` indicando onde a resposta ancora na pagina final.
 */

export const BriefQuestionOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  hint: z.string().max(120).optional(),
  badge: z.string().max(32).optional(),
});

export const BriefQuestionItemSchema = z.object({
  id: z.string().min(2).max(64),
  order: z.number().int().min(1).max(5).default(1),
  type: z.enum([
    'single_choice_cards',
    'multi_select_chips',
    'short_text_input',
    'anchor_sku_picker',
    'metric_pair_input',
  ]),
  maxSelections: z.number().int().min(1).max(6).optional(),
  title: z.string().min(6).max(160),
  helperText: z.string().max(220).default(''),
  placeholder: z.string().max(140).optional(),
  recommendedDefault: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  options: z.array(BriefQuestionOptionSchema).max(8).optional(),
  optionsFromCatalog: z.boolean().optional(),
  fields: z
    .array(
      z.object({
        key: z.string().min(1).max(40),
        label: z.string().min(1).max(50),
        default: z.string().max(80).default(''),
      }),
    )
    .max(3)
    .optional(),
  mapsToTarget: z.string().min(3).max(120),
});

export const BriefQuestionsJsonSchema = z.object({
  schemaVersion: z.string().default('1.0'),
  detectedNiche: z.string().min(2).max(80),
  recommendedCampaignTheme: z.enum(['evergreen', 'natal', 'black_friday', 'consultorio']).default('evergreen'),
  contextSummaryPt: z.string().min(10).max(320),
  questions: z.array(BriefQuestionItemSchema).min(1).max(5),
});

/**
 * Gera um .json contextualizado (1..5 perguntas) quando o GLM esta indisponivel ou como seed para o analisador.
 */
export function generateContextualBriefQuestions({
  profile = {},
  campaignTheme = 'evergreen',
  userPrompt = '',
  pageGoal = 'home',
} = {}) {
  const businessName = String(profile?.business?.name || 'Sua Loja').trim();
  const segment = String(profile?.business?.segment || '').trim();
  const products = Array.isArray(profile?.catalog?.products) ? profile.catalog.products.filter((p) => p?.active !== false) : [];
  const cats = Array.from(new Set(products.map((p) => String(p.category || '').trim()).filter(Boolean))).slice(0, 6);
  const firstSku = products[0];
  const inferredArchetype = classifyBusinessArchetype({ segment, storeName: businessName, products });
  const resolvedNiche =
    inferredArchetype.archetype !== 'varejo_geral'
      ? inferredArchetype.nicheLabel
      : segment || inferredArchetype.nicheLabel || 'Comércio Autoral';
  const isClinic =
    campaignTheme === 'consultorio' ||
    inferredArchetype.archetype === 'saude_clinica' ||
    (/fisio|clínic|clinica|estétic|estetica|odonto|psic|consult/i.test(`${segment} ${userPrompt} ${businessName}`) &&
      inferredArchetype.archetype !== 'farmacia_drogaria');
  const isChristmas = campaignTheme === 'natal' || /natal|fim de ano|dezembro|cesta/i.test(`${userPrompt} ${pageGoal}`);
  const isBlackFriday = campaignTheme === 'black_friday' || /black|drop|queima|lote/i.test(`${userPrompt} ${pageGoal}`);

  const detectedTheme = isClinic ? 'consultorio' : isChristmas ? 'natal' : isBlackFriday ? 'black_friday' : 'evergreen';

  if (isClinic) {
    const defaultAreas = cats.length >= 2 ? cats.slice(0, 4) : ['Joelho & Ligamentos', 'Coluna & Lombar', 'Ombro', 'Tornozelo'];
    return BriefQuestionsJsonSchema.parse({
      schemaVersion: '1.0',
      detectedNiche: segment || 'Atendimento Clínico & Especializado',
      recommendedCampaignTheme: 'consultorio',
      contextSummaryPt: `${businessName}: página consultiva com mapa interativo de queixas, especialistas e placar de resultados.`,
      questions: [
        {
          id: 'q_focus_areas',
          order: 1,
          type: 'multi_select_chips',
          maxSelections: 4,
          title: 'Quais 3 a 4 queixas ou áreas mais procuradas devem abrir o mapa interativo?',
          helperText: 'Cada chip selecionado vira uma região clicável com roteiro em 3 fases.',
          recommendedDefault: defaultAreas,
          options: defaultAreas.map((a, idx) => ({ id: `area_${idx + 1}`, label: a, badge: idx === 0 ? 'Principal' : undefined })),
          mapsToTarget: 'sections[clinic_symptom_map].tabs',
        },
        {
          id: 'q_hero_promise',
          order: 2,
          type: 'short_text_input',
          title: 'Qual promessa concreta diferencia o primeiro atendimento na clínica?',
          helperText: 'Substitui qualquer frase genérica no subtítulo de abertura e card de avaliação.',
          placeholder: 'Ex: 60 min de avaliação funcional com plano por escrito no mesmo dia',
          recommendedDefault: 'Avaliação funcional de 60 minutos com laudo claro e plano escrito em fases.',
          mapsToTarget: 'sections[hero].subheadline',
        },
        ...(products.length > 0
          ? [
              {
                id: 'q_anchor_service',
                order: 3,
                type: 'anchor_sku_picker',
                title: 'Qual atendimento abre no card escuro "Comece por aqui"?',
                helperText: 'Ficará em destaque tanto na Hero quanto na tabela de preços.',
                recommendedDefault: String(firstSku?.sku || firstSku?.id || ''),
                optionsFromCatalog: true,
                mapsToTarget: 'dossier.flagshipProduct',
              },
            ]
          : []),
        {
          id: 'q_case_numbers',
          order: products.length > 0 ? 4 : 3,
          type: 'metric_pair_input',
          title: 'Qual evolução real em números podemos destacar no placar Antes → Depois?',
          helperText: 'Ex.: amplitude de movimento, escala de dor ou taxa de retorno.',
          fields: [
            { key: 'beforeLabel', label: 'Antes', default: 'Dor 7/10 nos treinos' },
            { key: 'afterLabel', label: 'Depois', default: 'Retorno completo em 8 sem.' },
          ],
          mapsToTarget: 'sections[clinic_case_scoreboard].cases[0]',
        },
        {
          id: 'q_booking_policy',
          order: products.length > 0 ? 5 : 4,
          type: 'single_choice_cards',
          title: 'Qual facilidade de pagamento ou convênio destacar abaixo dos planos?',
          helperText: 'Alimenta o quadro 2×2 de garantias para eliminar objeção de preço.',
          recommendedDefault: 'nota_reembolso',
          options: [
            { id: 'nota_reembolso', label: 'Nota fiscal para reembolso no convênio', hint: 'Ideal para atendimentos particulares premium' },
            { id: 'pix_pacote', label: 'Desconto direto no Pix à vista', hint: 'Incentiva fechamento imediato do programa' },
            { id: 'remarcacao_livre', label: 'Remarcação flexível em até 24h', hint: 'Reduz hesitação no primeiro agendamento' },
          ],
          mapsToTarget: 'sections[clinic_pricing_tiers].guaranteeFocus',
        },
      ],
    });
  }

  const campaignNameLabel =
    detectedTheme === 'natal'
      ? 'Campanha de Natal & Fim de Ano'
      : detectedTheme === 'black_friday'
        ? 'Campanha Black Friday / Drop Relâmpago'
        : 'Vitrine Principal & Conversão';

  return BriefQuestionsJsonSchema.parse({
    schemaVersion: '1.0',
    detectedNiche: resolvedNiche,
    recommendedCampaignTheme: detectedTheme,
    contextSummaryPt: `${businessName} (${products.length} itens no catálogo) configurada para ${campaignNameLabel}.`,
    questions: [
      {
        id: 'q_campaign_angle',
        order: 1,
        type: 'single_choice_cards',
        title: `Qual enfoque principal abre ${campaignNameLabel}?`,
        helperText: 'Define o título em destaque e a chamada de abertura da página.',
        recommendedDefault: detectedTheme === 'black_friday' ? 'lote_limitado' : 'beneficio_pix_prazo',
        options: [
          { id: 'lote_limitado', label: 'Lote limitado com estoque contado', hint: 'Urgência clara com regra e prazo' },
          { id: 'beneficio_pix_prazo', label: 'Entrega ágil + Vantagem no Pix', hint: 'Foco em decisão rápida no carrinho' },
          { id: 'presente_autoral', label: 'Seleção sob encomenda / presente', hint: 'Enfatiza cuidado, acabamento e janela' },
        ],
        mapsToTarget: 'sections[hero].headlineAngle',
      },
      {
        id: 'q_layout_direction',
        order: 2,
        type: 'single_choice_cards',
        title: 'Como prefere organizar a abertura da página?',
        helperText: 'Você também pode alternar depois direto no editor visual.',
        recommendedDefault: products.length <= 6 ? 'centered_editorial' : 'split_showcase',
        options: [
          { id: 'centered_editorial', label: 'Texto centralizado e título grande', hint: 'Minimalista, direto e limpo em destaque no centro' },
          { id: 'split_showcase', label: 'Texto ao lado da imagem principal', hint: 'Leitura clássica dividida em duas colunas' },
        ],
        mapsToTarget: 'sections[hero].direction.textAnchor',
      },
      ...(products.length > 0
        ? [
            {
              id: 'q_anchor_sku',
              order: 3,
              type: 'anchor_sku_picker',
              title: 'Qual item do catálogo abre a página em destaque?',
              helperText: 'Guia a imagem principal e o bloco de oferta prioritária.',
              recommendedDefault: String(firstSku?.sku || firstSku?.id || ''),
              optionsFromCatalog: true,
              mapsToTarget: 'dossier.flagshipProduct',
            },
          ]
        : []),
      {
        id: 'q_promo_mechanic',
        order: products.length > 0 ? 4 : 3,
        type: 'metric_pair_input',
        title: 'Existe alguma vantagem numérica ou condição principal?',
        helperText: 'Opcional: aparece de forma discreta no resumo ou na condição de compra.',
        fields: [
          { key: 'discountPercent', label: 'Desconto (%)', default: detectedTheme === 'black_friday' ? '30' : '15' },
          { key: 'deadlineLabel', label: 'Prazo ou lote', default: detectedTheme === 'natal' ? 'Pedidos até 24/12' : 'Condição da semana' },
        ],
        mapsToTarget: 'sections[promo].terms',
      },
      {
        id: 'q_main_objection',
        order: products.length > 0 ? 5 : 4,
        type: 'short_text_input',
        title: 'Qual a principal dúvida do cliente antes de fechar no WhatsApp?',
        helperText: 'Respondemos de forma clara logo abaixo do título principal.',
        placeholder: 'Ex: Qual o prazo para entrega na região ou como funciona a encomenda?',
        recommendedDefault: `Envio programado com vantagem no Pix e atendimento direto pelo WhatsApp de ${businessName}.`,
        mapsToTarget: 'sections[hero].subheadline',
      },
    ],
  });
}

const VALID_Q_TYPES = new Set([
  'single_choice_cards',
  'multi_select_chips',
  'short_text_input',
  'anchor_sku_picker',
  'metric_pair_input',
]);
const VALID_THEMES = new Set(['evergreen', 'natal', 'black_friday', 'consultorio']);

export function parseOrRepairBriefQuestionsJson(rawData, fallbackContext = {}) {
  const direct = BriefQuestionsJsonSchema.safeParse(rawData);
  if (direct.success) {
    return { valid: true, usedFallback: false, data: direct.data };
  }

  if (rawData && typeof rawData === 'object' && Array.isArray(rawData.questions) && rawData.questions.length > 0) {
    const cleanedQuestions = rawData.questions
      .slice(0, 5)
      .map((q, idx) => {
        if (!q || typeof q !== 'object') return null;
        const title = String(q.title || '').trim().slice(0, 160);
        if (title.length < 4) return null;
        const rawType = String(q.type || 'single_choice_cards').trim();
        const opts = Array.isArray(q.options)
          ? q.options
              .slice(0, 8)
              .map((o, oIdx) => {
                if (typeof o === 'string') {
                  const lbl = o.trim().slice(0, 80);
                  return lbl ? { id: `opt_${idx + 1}_${oIdx + 1}`, label: lbl } : null;
                }
                if (!o || typeof o !== 'object') return null;
                const label = String(o.label || o.title || o.id || '').trim().slice(0, 80);
                if (!label) return null;
                const optId = String(o.id || `opt_${idx + 1}_${oIdx + 1}`).trim().slice(0, 64) || `opt_${idx + 1}_${oIdx + 1}`;
                const hint = typeof o.hint === 'string' && o.hint.trim() ? o.hint.trim().slice(0, 120) : undefined;
                const badge = typeof o.badge === 'string' && o.badge.trim() ? o.badge.trim().slice(0, 32) : undefined;
                return { id: optId, label, ...(hint ? { hint } : {}), ...(badge ? { badge } : {}) };
              })
              .filter(Boolean)
          : [];
        const safeType = VALID_Q_TYPES.has(rawType)
          ? rawType
          : opts.length > 0
            ? 'single_choice_cards'
            : 'short_text_input';
        const qId = String(q.id || `glm_q_${idx + 1}`).trim().slice(0, 64);
        const mapsToTarget = String(q.mapsToTarget || 'hero.subtitle').trim().slice(0, 120);
        return {
          id: qId.length >= 2 ? qId : `glm_q_${idx + 1}`,
          order: Math.min(5, Math.max(1, Number.isInteger(q.order) ? q.order : idx + 1)),
          type: safeType,
          ...(q.maxSelections ? { maxSelections: Math.min(6, Math.max(1, Math.round(Number(q.maxSelections)))) } : {}),
          title: title.length >= 6 ? title : `${title} (?)`,
          helperText: String(q.helperText || '').trim().slice(0, 220),
          ...(typeof q.placeholder === 'string' && q.placeholder.trim() ? { placeholder: q.placeholder.trim().slice(0, 140) } : {}),
          ...(q.recommendedDefault !== undefined ? { recommendedDefault: typeof q.recommendedDefault === 'string' ? q.recommendedDefault : opts[0]?.label || '' } : {}),
          ...(opts.length > 0 ? { options: opts } : {}),
          mapsToTarget: mapsToTarget.length >= 3 ? mapsToTarget : 'hero.subtitle',
        };
      })
      .filter(Boolean);

    if (cleanedQuestions.length > 0) {
      const storeLabel = String(fallbackContext?.profile?.business?.name || 'Loja').trim();
      const rawNiche = String(rawData.detectedNiche || fallbackContext?.profile?.business?.segment || 'Negócio Local').trim().slice(0, 80);
      const rawTheme = String(rawData.recommendedCampaignTheme || '').trim();
      const rawSummary = String(rawData.contextSummaryPt || '').trim().slice(0, 320);
      const repairedCandidate = {
        schemaVersion: '1.0',
        detectedNiche: rawNiche.length >= 2 ? rawNiche : 'Comércio Local',
        recommendedCampaignTheme: VALID_THEMES.has(rawTheme) ? rawTheme : 'evergreen',
        contextSummaryPt:
          rawSummary.length >= 10
            ? rawSummary
            : `Perguntas personalizadas para ${storeLabel} com foco em conversão.`,
        questions: cleanedQuestions,
      };
      const repaired = BriefQuestionsJsonSchema.safeParse(repairedCandidate);
      if (repaired.success) {
        return { valid: true, usedFallback: false, data: repaired.data };
      }
    }
  }

  return {
    valid: false,
    usedFallback: true,
    data: generateContextualBriefQuestions(fallbackContext),
    issues: direct.error.issues.slice(0, 4),
  };
}

export function formatBriefAnswersForPrompt(answers = {}, questionsJson = null) {
  const entries = Object.entries(answers || {}).filter(([, val]) => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  });
  if (entries.length === 0) return '';

  const qById = new Map((questionsJson?.questions || []).map((q) => [q.id, q]));
  const lines = entries.map(([qId, val]) => {
    const q = qById.get(qId);
    const serialized = typeof val === 'string' ? val : JSON.stringify(val);
    return `  <answer id="${qId}" target="${q?.mapsToTarget || 'general'}">${serialized}</answer>`;
  });

  return `<enriched_merchant_brief>\n${lines.join('\n')}\n</enriched_merchant_brief>`;
}
