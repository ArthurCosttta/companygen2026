import type {
  DetectedOrderItem,
  NotificationSeverityLevel,
  SofiaBrainConfig,
  SofiaRagDocument,
  WhatsappIncomingClassification,
} from '@/schemas/ai-whatsapp-intent.schema';
import type { BusinessProfile, CatalogProduct } from '@/schemas/profile.schema';

function formatBRL(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safe / 100);
}

export function normalizeForMatch(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanWhatsappReply(text: string): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\(\s*SKU[:\s-]*[A-Za-z0-9_.-]+\s*\)/gi, '')
    .replace(/\bSKU[:\s#-]*[A-Za-z0-9_.-]+\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STOPWORDS = new Set([
  'com',
  'para',
  'sem',
  'que',
  'uma',
  'uns',
  'umas',
  'dos',
  'das',
  'ele',
  'ela',
  'dele',
  'dela',
  'quero',
  'comprar',
  'pedir',
  'levar',
  'preco',
  'valor',
  'quanto',
  'custa',
  'tem',
  'disponivel',
  'entrega',
  'prazo',
]);

export function findBestCatalogProduct(
  queryText: string,
  products: CatalogProduct[] = [],
): CatalogProduct | null {
  const activeProducts = products.filter((p) => p && p.active !== false);
  const normQuery = normalizeForMatch(queryText);
  if (!normQuery || activeProducts.length === 0) return null;

  const queryTokens = new Set(normQuery.match(/[\p{L}\d]+/gu) || []);
  let bestProduct: CatalogProduct | null = null;
  let bestScore = 0;

  for (const product of activeProducts) {
    const normName = normalizeForMatch(product.name);
    const normSku = normalizeForMatch(product.sku);
    const normId = normalizeForMatch(product.id);

    if (normSku && queryTokens.has(normSku)) return product;
    if (normId && queryTokens.has(normId)) return product;
    if (normName && normQuery.includes(normName)) {
      const score = 100 + normName.length;
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
      continue;
    }

    const nameTokens = (normName.match(/[\p{L}\d]+/gu) || []).filter(
      (t) => t.length >= 3 && !STOPWORDS.has(t),
    );
    if (nameTokens.length === 0) continue;

    let hits = 0;
    for (const token of nameTokens) {
      if (queryTokens.has(token)) {
        hits += 1;
      } else if (token.endsWith('s') && queryTokens.has(token.slice(0, -1))) {
        hits += 0.9;
      } else if (queryTokens.has(`${token}s`)) {
        hits += 0.9;
      }
    }

    const ratio = hits / nameTokens.length;
    if (hits >= 1 && (ratio >= 0.5 || hits >= 2)) {
      const score = hits * 10 + ratio;
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }
  }

  return bestProduct;
}

export function extractItemsFromWhatsappText(
  messageText: string,
  products: CatalogProduct[] = [],
): DetectedOrderItem[] {
  const activeProducts = products.filter((p) => p && p.active !== false);
  const lines = String(messageText || '').split(/\r?\n/);
  const itemsBySku = new Map<string, DetectedOrderItem>();

  const pushMatchedItem = (product: CatalogProduct, qty: number) => {
    const safeQty = Math.max(1, Math.min(999, Math.round(qty || 1)));
    const unitPriceCents = Math.max(0, Math.round(Number(product.priceCents) || 0));
    const key = String(product.sku || product.id || product.name);
    const existing = itemsBySku.get(key);
    if (existing) {
      const nextQty = Math.min(999, existing.quantity + safeQty);
      existing.quantity = nextQty;
      existing.lineTotalCents = unitPriceCents * nextQty;
      return;
    }
    itemsBySku.set(key, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      variation: product.variation || 'Padrão',
      quantity: safeQty,
      unitPriceCents,
      lineTotalCents: unitPriceCents * safeQty,
      imageUrl: product.imageUrl || '',
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const skuMatch = line.match(/\bSKU[:\s#-]*([A-Za-z0-9_-]+)/i);
    const qtyPrefix = line.match(
      /^(?:[•*\-]\s*)?(\d+)\s*(?:[x×]|unidades?|un\b|kits?|pe[çc]as?)\s*(?:de\s+)?(.+)$/i,
    );
    const qtyInline = line.match(
      /(\d+)\s*(?:[x×]|unidades?|un\b|kits?|pe[çc]as?)\s*(?:de\s+)?([^\r\n.,;!?]+)/i,
    );
    const qtyVerb = line.match(
      /\b(?:quero|comprar|pedir|levar|vou\s+(?:querer|levar)|manda|envia|separa)\s+(\d{1,3})(?!\s*(?:reais|%|\$))\s+(?:(?:[x×]|unidades?|un\b|kits?|pe[çc]as?)\s+)?(?:de\s+)?([^\r\n.,;!?]+)/i,
    );

    const qty = qtyPrefix
      ? Number(qtyPrefix[1])
      : qtyInline
        ? Number(qtyInline[1])
        : qtyVerb
          ? Number(qtyVerb[1])
          : 1;

    let matched: CatalogProduct | null = null;
    if (skuMatch) {
      const code = skuMatch[1].toUpperCase();
      matched =
        activeProducts.find((p) => String(p.sku || '').toUpperCase() === code) ??
        null;
    }

    if (!matched) {
      const candidateText = (qtyPrefix?.[2] || qtyInline?.[2] || qtyVerb?.[2] || line)
        .split(/\s+[—–-]\s+R\$/i)[0]
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .trim();
      matched = findBestCatalogProduct(candidateText, activeProducts);
    }

    if (matched) {
      pushMatchedItem(matched, qty);
    }
  }

  if (itemsBySku.size === 0) {
    const wholeMatch = findBestCatalogProduct(messageText, activeProducts);
    if (wholeMatch) {
      const inlineQty = String(messageText || '').match(
        /\b(\d+)\s*(?:[x×]|unidades?|un\b|kits?|pe[çc]as?)\b/i,
      );
      pushMatchedItem(wholeMatch, inlineQty ? Number(inlineQty[1]) : 1);
    }
  }

  return Array.from(itemsBySku.values());
}

function detectSourceComponent(
  messageText: string,
  isCheckoutFormat: boolean,
): string {
  const norm = normalizeForMatch(messageText);
  if (/montador de kit|monte seu kit|\bkit\b/.test(norm)) {
    return 'Montador de Kits';
  }
  if (/agendar|agendamento|horario marcado|consulta|banho e tosa/.test(norm)) {
    return 'Painel de Agendamento';
  }
  if (isCheckoutFormat || /sacola|carrinho|vitrine|novo pedido/.test(norm)) {
    return 'Sacola da Vitrine';
  }
  return 'WhatsApp Direto';
}

export interface ClassifyWhatsappMessageParams {
  messageText: string;
  products?: CatalogProduct[];
  brainConfig?: Partial<SofiaBrainConfig> | null;
  source?: 'vitrine_checkout' | 'whatsapp_direct' | 'simulator' | 'live_whatsapp';
  customerName?: string;
}

export function classifyWhatsappMessage({
  messageText,
  products = [],
  brainConfig,
  source = 'whatsapp_direct',
}: ClassifyWhatsappMessageParams): WhatsappIncomingClassification {
  const raw = String(messageText || '').trim();
  const norm = normalizeForMatch(raw);

  const isVitrineCheckout =
    source === 'vitrine_checkout' ||
    /\bnov[oa]\s+(?:pedido|compra)\b/.test(norm) ||
    (raw.includes('🛒') &&
      (/\b(?:itens|total|carrinho|pedido|subtotal)\b/.test(norm) ||
        /\d+\s*[x×]/.test(norm))) ||
    /\bref:\s*cg-[a-z0-9]{3,}/i.test(raw);

  const refMatch = raw.match(/\bRef:\s*(CG-[A-Z0-9-]{3,12})/i);
  const orderRef = refMatch ? refMatch[1].toUpperCase() : undefined;

  const itemsDetected = extractItemsFromWhatsappText(raw, products);
  const totalCents = itemsDetected.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );

  // 1. Check HUMAN_ESCALATION signals (ignoring generic checkout footers)
  const escalateOnDiscount = brainConfig?.escalateOnDiscount !== false;
  const escalateOnComplaint = brainConfig?.escalateOnComplaintOrRefund !== false;
  const escalateOnHighTicket = brainConfig?.escalateOnHighTicketCustom !== false;
  const escalateOnDoubt = brainConfig?.escalateOnOutOfCatalogDoubt !== false;

  const matchedKeywords: string[] = [];
  let escalationReason = '';

  const explicitHumanRegex =
    /\b(?:falar com (?:um |uma )?(?:atendente|humano|vendedor|gerente|pessoa|alguem)|atendimento humano|preciso de (?:um )?(?:atendente|humano)|quero (?:um )?(?:humano|atendente)|chamar? (?:um )?(?:atendente|humano)|transfer(?:ir|e) (?:para )?(?:um )?(?:atendente|humano)|falar com gente)\b/;
  const discountRegex =
    /\b(?:desconto|negociar|negociacao|abaixar|mais barato|preco menor|condicao especial|valor menor|cupom|atacado|revenda)\b/;
  const complaintRefundRegex =
    /\b(?:reclamacao|reclamar|procon|defeito|estragou|quebrou|rasgou|veio errado|nao chegou|atrasado|reembolso|estorno|devolucao|cancelar pedido|garantia|insatisfeito|pessimo|horrivel)\b/;
  const highTicketRegex =
    /\b(?:orcamento personalizado|sob medida|projeto especial|pedido grande|encomenda especial|corporativo)\b/;
  const unresolvedDoubtRegex =
    /\b(?:nao entendi|duvida fora do catalogo|ninguem responde|nao resolveu|caso especifico|problema complexo)\b/;

  // Guard against false-positive "desconto" inside auto-generated checkout footer ("desconto pix")
  const normWithoutAutoFooter = isVitrineCheckout
    ? norm.replace(/desconto\s+(?:no\s+|a\s+vista\s+)?pix/g, '')
    : norm;

  if (explicitHumanRegex.test(norm)) {
    matchedKeywords.push('atendimento humano');
    escalationReason = 'Cliente solicitou atendimento humano direto';
  } else if (escalateOnComplaint && complaintRefundRegex.test(norm)) {
    matchedKeywords.push('reclamação/reembolso');
    escalationReason = 'Reclamação, defeito ou solicitação de reembolso/troca';
  } else if (escalateOnDiscount && discountRegex.test(normWithoutAutoFooter)) {
    matchedKeywords.push('negociação/desconto');
    escalationReason = 'Cliente solicitou desconto ou negociação comercial';
  } else if (escalateOnHighTicket && highTicketRegex.test(norm)) {
    matchedKeywords.push('orçamento high-ticket');
    escalationReason = 'Solicitação de orçamento personalizado ou pedido especial';
  } else if (escalateOnDoubt && unresolvedDoubtRegex.test(norm)) {
    matchedKeywords.push('dúvida não resolvida');
    escalationReason = 'Dúvida técnica ou situação fora do catálogo padrão';
  } else if (Array.isArray(brainConfig?.escalationKeywords)) {
    for (const kw of brainConfig.escalationKeywords) {
      const cleanKw = normalizeForMatch(kw);
      if (!cleanKw || cleanKw.length < 3) continue;
      if (isVitrineCheckout && cleanKw === 'desconto') continue;
      if (norm.includes(cleanKw)) {
        matchedKeywords.push(kw.trim());
        escalationReason = `Gatilho configurado detectado: "${kw.trim()}"`;
        break;
      }
    }
  }

  if (escalationReason) {
    return {
      intent: 'HUMAN_ESCALATION',
      orderRef,
      itemsDetected,
      totalCents,
      confidence: 0.96,
      requiresHuman: true,
      escalationReason,
      suggestedReply: '',
      source: isVitrineCheckout ? 'vitrine_checkout' : source,
      sourceComponent: detectSourceComponent(raw, isVitrineCheckout),
      matchedKeywords,
      isD1Purchase: false,
    };
  }

  // 2. Check PURCHASE_ORDER (Strict D1 rule: ONLY real WhatsApp purchase message or checkout)
  const isQuestionPhrase =
    /\b(?:qual (?:e |é )?o preco|quanto custa|quanto e|quanto sai|quanto fica|qual valor|tem tamanho|voce tem|voces tem|como funciona|qual o prazo|aceita pix|aceitam pix|onde fica|endereco)\b/.test(
      norm,
    ) || (raw.includes('?') && !/\b(?:manda o pix|fechar pedido|finalizar|quero comprar|vou levar)\b/.test(norm));

  const explicitPurchaseVerb =
    /\b(?:quero comprar|vou comprar|vou levar|quero levar|quero pedir|fechar pedido|fechar a compra|finalizar pedido|finalizar compra|fazer pedido|fazer um pedido|pode separar|quero encomendar|confirmar compra|confirmar pedido|quero reservar|quero agendar)\b/.test(
      norm,
    );
  const explicitQtyMatch =
    /\b\d+\s*(?:[x×]|unidades?|un\b|kits?|pe[çc]as?)\b/.test(norm);
  const checkoutSignals =
    isVitrineCheckout ||
    (explicitPurchaseVerb && (itemsDetected.length > 0 || explicitQtyMatch)) ||
    (explicitPurchaseVerb && /\b(?:manda o pix|chave pix|pagamento|entrega)\b/.test(norm));

  if (checkoutSignals && (!isQuestionPhrase || isVitrineCheckout || explicitPurchaseVerb)) {
    return {
      intent: 'PURCHASE_ORDER',
      orderRef,
      itemsDetected,
      totalCents,
      confidence: isVitrineCheckout ? 0.99 : 0.92,
      requiresHuman: false,
      suggestedReply: '',
      source: isVitrineCheckout ? 'vitrine_checkout' : source,
      sourceComponent: detectSourceComponent(raw, isVitrineCheckout),
      matchedKeywords: isVitrineCheckout ? ['checkout vitrine'] : ['intenção de compra'],
      isD1Purchase: true,
    };
  }

  // 3. Check PRODUCT_QUESTION
  const isProductOrStoreQuestion =
    itemsDetected.length > 0 ||
    /\b(?:preco|valor|quanto|catalogo|produto|produtos|servico|servicos|tamanho|cor|estoque|disponivel|entrega|frete|prazo|retirada|endereco|horario|pix|cartao|pagamento|foto|fotos|imagem)\b/.test(
      norm,
    );

  if (isProductOrStoreQuestion) {
    return {
      intent: 'PRODUCT_QUESTION',
      itemsDetected,
      totalCents,
      confidence: 0.9,
      requiresHuman: false,
      suggestedReply: '',
      source,
      sourceComponent: detectSourceComponent(raw, false),
      matchedKeywords: itemsDetected.map((i) => i.name),
      isD1Purchase: false,
    };
  }

  // 4. Fallback GENERAL_CHAT
  return {
    intent: 'GENERAL_CHAT',
    itemsDetected: [],
    totalCents: 0,
    confidence: 0.85,
    requiresHuman: false,
    suggestedReply: '',
    source,
    sourceComponent: 'WhatsApp Direto',
    matchedKeywords: [],
    isD1Purchase: false,
  };
}

export function detectNotificationLevel(
  classification: Pick<WhatsappIncomingClassification, 'intent' | 'requiresHuman'>,
): NotificationSeverityLevel {
  if (classification.intent === 'HUMAN_ESCALATION' || classification.requiresHuman) {
    return 'HUMAN_ESCALATION';
  }
  if (classification.intent === 'PURCHASE_ORDER') {
    return 'PURCHASE_MESSAGE_ARRIVED';
  }
  return 'NEW_MESSAGE_WAITING';
}

export interface BuildDeterministicReplyParams {
  classification: WhatsappIncomingClassification;
  profile?: Partial<BusinessProfile> | null;
  brainConfig?: Partial<SofiaBrainConfig> | null;
  customerName?: string;
  ragDocuments?: SofiaRagDocument[];
  messageText?: string;
}

export function buildDeterministicSofiaReply({
  classification,
  profile,
  brainConfig,
  customerName,
  ragDocuments = [],
  messageText = '',
}: BuildDeterministicReplyParams): string {
  const storeName = profile?.business?.name?.trim() || 'nossa loja';
  const agentName = profile?.agent?.name?.trim() || 'Sofia';
  const clientGreeting =
    customerName && customerName.trim() && customerName !== 'Cliente WhatsApp'
      ? `, ${customerName.trim().split(' ')[0]}`
      : '';
  const products = (profile?.catalog?.products || []).filter(
    (p) => p && p.active !== false,
  );
  const deliveryFeeCents = Math.max(
    0,
    Number(profile?.delivery?.defaultFeeCents) || 0,
  );
  const pickupEnabled = profile?.delivery?.pickupEnabled !== false;
  const deliveryEnabled = profile?.delivery?.deliveryEnabled !== false;
  const hours =
    brainConfig?.workingHoursNotice?.trim() ||
    profile?.business?.hours?.trim() ||
    'Seg a Sáb · 09h às 19h';

  if (classification.intent === 'HUMAN_ESCALATION') {
    return cleanWhatsappReply(
      `Entendido${clientGreeting}! Já sinalizei nossa equipe da ${storeName} com prioridade (${classification.escalationReason || 'atendimento humano'}) e um atendente vai assumir sua conversa aqui agora mesmo.`,
    );
  }

  if (classification.intent === 'PURCHASE_ORDER') {
    const items = classification.itemsDetected;
    const itemsSummary =
      items.length > 0
        ? items
            .map(
              (item) =>
                `• ${item.quantity}x ${item.name} (${formatBRL(item.lineTotalCents)})`,
            )
            .join('\n')
        : '• Pedido recebido conforme sua mensagem';

    const subtotal = items.reduce((s, item) => s + item.lineTotalCents, 0);
    const total = subtotal > 0 ? subtotal + deliveryFeeCents : 0;
    const totalLine =
      total > 0
        ? deliveryFeeCents > 0
          ? `Total com entrega: ${formatBRL(total)} (produtos ${formatBRL(subtotal)} + entrega ${formatBRL(deliveryFeeCents)})`
          : `Total dos produtos: ${formatBRL(total)}`
        : 'Nosso time vai confirmar os valores finais em instantes';

    const deliveryPrompt = deliveryEnabled
      ? pickupEnabled
        ? 'Informe seu endereço completo (ou se prefere retirada na loja) e a forma de pagamento (Pix, Cartão ou Dinheiro).'
        : 'Informe seu endereço completo de entrega e a forma de pagamento (Pix, Cartão ou Dinheiro).'
      : 'Informe a forma de pagamento (Pix, Cartão ou Dinheiro) para confirmarmos sua retirada na loja.';

    return cleanWhatsappReply(
      `Recebemos seu pedido na ${storeName}${clientGreeting}!\n\n${itemsSummary}\n${totalLine}\n\nPara concluir, ${deliveryPrompt}`,
    );
  }

  if (classification.intent === 'PRODUCT_QUESTION') {
    const normMsg = normalizeForMatch(messageText);

    // Check RAG docs for relevant policy/FAQ answer
    const relevantDoc = ragDocuments.find((doc) => {
      const tokens = normalizeForMatch(doc.title + ' ' + doc.content)
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
      return tokens.some((t) => normMsg.includes(t));
    });

    if (classification.itemsDetected.length > 0) {
      const item = classification.itemsDetected[0];
      const fullProd = products.find(
        (p) => p.id === item.productId || p.sku === item.sku,
      );
      const stockText =
        fullProd && fullProd.stock > 0
          ? `${fullProd.stock} unidade(s) pronta entrega`
          : 'disponibilidade sob consulta';
      const deliverySnippet = deliveryEnabled
        ? deliveryFeeCents > 0
          ? `Entrega padrão por ${formatBRL(deliveryFeeCents)}${pickupEnabled ? ' ou retirada na loja' : ''}.`
          : `Fazemos entrega${pickupEnabled ? ' e retirada na loja' : ''}.`
        : pickupEnabled
          ? `Retirada disponível em nosso endereço (${hours}).`
          : '';
      const docSnippet = relevantDoc
        ? ` ${relevantDoc.content.slice(0, 140).trim()}`
        : '';

      return cleanWhatsappReply(
        `${item.name} está saindo por ${formatBRL(item.unitPriceCents)} (${item.variation}, ${stockText}). ${deliverySnippet}${docSnippet} Se quiser garantir o seu, é só me confirmar a quantidade!`.trim(),
      );
    }

    if (/\b(?:entrega|frete|prazo|retirada|endereco|onde fica)\b/.test(normMsg)) {
      const addr = profile?.business?.address?.trim()
        ? `Nosso endereço é ${profile.business.address.trim()}. `
        : '';
      const fee =
        deliveryEnabled && deliveryFeeCents > 0
          ? `Taxa de entrega padrão: ${formatBRL(deliveryFeeCents)}. `
          : deliveryEnabled
            ? 'Realizamos entregas na região. '
            : '';
      const docSnippet = relevantDoc
        ? relevantDoc.content.slice(0, 160).trim()
        : '';
      return cleanWhatsappReply(
        `${addr}${fee}Horário de atendimento: ${hours}. ${docSnippet}`.trim(),
      );
    }

    if (relevantDoc) {
      return cleanWhatsappReply(
        `Sobre ${relevantDoc.title} na ${storeName}: ${relevantDoc.content.slice(0, 240).trim()}`,
      );
    }

    if (products.length > 0) {
      const topList = products
        .slice(0, 3)
        .map((p) => `${p.name} (${formatBRL(p.priceCents)})`)
        .join(', ');
      return cleanWhatsappReply(
        `Aqui na ${storeName} trabalhamos com: ${topList}. Qual desses itens você gostaria de conferir ou pedir?`,
      );
    }

    return cleanWhatsappReply(
      `Olá${clientGreeting}! Aqui é ${agentName} da ${storeName} (${hours}). Me diga qual produto ou informação você procura que já verifico para você!`,
    );
  }

  // GENERAL_CHAT
  const welcome = profile?.agent?.welcomeMessage?.trim();
  if (welcome) {
    return cleanWhatsappReply(welcome);
  }

  const catalogHint =
    products.length > 0
      ? ` Posso te mostrar os detalhes de ${products
          .slice(0, 2)
          .map((p) => `${p.name} (${formatBRL(p.priceCents)})`)
          .join(' ou ')}!`
      : '';

  return cleanWhatsappReply(
    `Olá${clientGreeting}! Aqui é ${agentName} da ${storeName}. Atendimento ${hours}. Como posso te ajudar hoje?${catalogHint}`,
  );
}
