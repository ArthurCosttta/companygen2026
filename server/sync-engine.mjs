import { createHash } from 'node:crypto';

export const PLACEHOLDER_PHONES = new Set([
  '5511999999999',
  '5500000000000',
  '5511000000000',
  '5511111111111',
  '0000000000000',
]);

export function sanitizePhoneE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidProductionPhone(raw) {
  const digits = sanitizePhoneE164(raw);
  if (digits.length < 12 || digits.length > 13) return false;
  if (PLACEHOLDER_PHONES.has(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function formatBRL(cents) {
  const safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safe / 100);
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableSortValue(value[key]);
    return out;
  }
  return value;
}

export function computeDigest(value) {
  return createHash('sha256').update(JSON.stringify(stableSortValue(value))).digest('hex');
}

export function normalizeCatalogProduct(raw, index = 0) {
  const id = String(raw?.id || raw?.sku || `prod-${index + 1}`).trim();
  const sku = String(raw?.sku || id).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
  const priceCents = Number.isFinite(Number(raw?.priceCents))
    ? Math.max(0, Math.round(Number(raw.priceCents)))
    : Math.max(0, Math.round((Number(raw?.preco || raw?.price || 0)) * 100));
  const stock = Number.isFinite(Number(raw?.stock ?? raw?.estoque))
    ? Math.max(0, Math.round(Number(raw?.stock ?? raw?.estoque)))
    : 0;
  const imageUrl = String(raw?.imageUrl || raw?.fotoUrl || raw?.foto || '').trim();
  return {
    id,
    sku: sku || `SKU-${index + 1}`,
    name: String(raw?.name || raw?.nome || `Produto ${index + 1}`).trim(),
    category: String(raw?.category || raw?.categoria || 'Geral').trim() || 'Geral',
    description: String(raw?.description || raw?.descricao || '').trim(),
    priceCents,
    variation: String(raw?.variation || raw?.variacao || 'Padrão').trim() || 'Padrão',
    stock,
    active: raw?.active !== false && raw?.ativo !== false,
    imageUrl,
    approvedAsset: Boolean(raw?.approvedAsset ?? Boolean(imageUrl)),
    updatedAt: String(raw?.updatedAt || new Date().toISOString()),
  };
}

export function normalizeProfile(raw = {}) {
  const safe = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const business = safe.business && typeof safe.business === 'object' ? safe.business : {};
  const whatsapp = safe.whatsapp && typeof safe.whatsapp === 'object' ? safe.whatsapp : {};
  const payment = safe.payment && typeof safe.payment === 'object' ? safe.payment : {};
  const delivery = safe.delivery && typeof safe.delivery === 'object' ? safe.delivery : {};
  const agent = safe.agent && typeof safe.agent === 'object' ? safe.agent : {};
  const brand = safe.brand && typeof safe.brand === 'object' ? safe.brand : {};
  const onboarding = safe.onboarding && typeof safe.onboarding === 'object' ? safe.onboarding : {};
  const catalog = safe.catalog && typeof safe.catalog === 'object' ? safe.catalog : {};
  const publishedStore = safe.publishedStore && typeof safe.publishedStore === 'object' ? safe.publishedStore : {};

  const productsRaw = Array.isArray(catalog.products) ? catalog.products : [];
  const seenSkus = new Set();
  const products = [];
  for (let i = 0; i < productsRaw.length; i++) {
    const normalized = normalizeCatalogProduct(productsRaw[i], i);
    if (seenSkus.has(normalized.sku)) continue;
    seenSkus.add(normalized.sku);
    products.push(normalized);
  }

  const rawPhone = sanitizePhoneE164(whatsapp.phoneE164 || '');
  const methodsRaw = Array.isArray(payment.acceptedMethods) ? payment.acceptedMethods : ['pix', 'credit_card', 'debit_card', 'cash'];
  const allowedMethods = new Set(['pix', 'credit_card', 'debit_card', 'cash']);
  const acceptedMethods = methodsRaw.filter(m => allowedMethods.has(m));

  const toneAllowed = new Set(['proximo', 'formal', 'direto', 'consultivo']);
  const tone = toneAllowed.has(agent.tone) ? agent.tone : 'proximo';

  return {
    schemaVersion: 1,
    onboarding: {
      whatsappConnected: Boolean(onboarding.whatsappConnected),
      whatsappConfirmed: Boolean(onboarding.whatsappConfirmed),
      fichaCompleted: Boolean(onboarding.fichaCompleted),
      storeGenerated: Boolean(onboarding.storeGenerated),
    },
    business: {
      name: String(business.name || '').trim().slice(0, 120),
      segment: String(business.segment || 'Geral').trim().slice(0, 80) || 'Geral',
      description: String(business.description || '').trim().slice(0, 500),
      address: String(business.address || '').trim().slice(0, 240),
      mapsUrl: String(business.mapsUrl || '').trim().slice(0, 300),
      hours: String(business.hours || 'Seg a Sáb · 09h às 19h').trim().slice(0, 140),
      email: String(business.email || '').trim().slice(0, 140),
    },
    whatsapp: {
      connected: Boolean(whatsapp.connected),
      jid: String(whatsapp.jid || '').trim().slice(0, 120),
      phoneE164: rawPhone,
      displayPhone: String(whatsapp.displayPhone || rawPhone).trim().slice(0, 40),
      profileName: String(whatsapp.profileName || '').trim().slice(0, 120),
      profilePhotoUrl: String(whatsapp.profilePhotoUrl || '').trim().slice(0, 500),
      verifiedOrigin: whatsapp.verifiedOrigin === 'manual' ? 'manual' : 'baileys',
    },
    payment: {
      pixKey: String(payment.pixKey || '').trim().slice(0, 160),
      pixDiscountPercent: Math.min(90, Math.max(0, Number(payment.pixDiscountPercent) || 0)),
      acceptedMethods: acceptedMethods.length > 0 ? acceptedMethods : ['pix', 'credit_card', 'debit_card', 'cash'],
    },
    delivery: {
      pickupEnabled: delivery.pickupEnabled !== false,
      deliveryEnabled: delivery.deliveryEnabled !== false,
      areas: Array.isArray(delivery.areas)
        ? delivery.areas.map(a => String(a).trim()).filter(Boolean).slice(0, 40)
        : [],
      defaultFeeCents: Math.max(0, Math.round(Number(delivery.defaultFeeCents) || 0)),
      pickupHours: String(delivery.pickupHours || 'Seg a Sáb · 09h às 18h').trim().slice(0, 140),
    },
    agent: {
      name: String(agent.name || 'Sofia').trim().slice(0, 80) || 'Sofia',
      tone,
      autoReplyEnabled: agent.autoReplyEnabled !== false,
      welcomeMessage: String(agent.welcomeMessage || '').trim().slice(0, 400),
    },
    brand: {
      instagram: String(brand.instagram || '').trim().slice(0, 80),
      logoUrl: String(brand.logoUrl || '').trim().slice(0, 500),
      primaryColor: /^#[0-9a-f]{3,8}$/i.test(String(brand.primaryColor || '')) ? String(brand.primaryColor) : '#111827',
      accentColor: /^#[0-9a-f]{3,8}$/i.test(String(brand.accentColor || '')) ? String(brand.accentColor) : '#10b981',
      themePreset: String(brand.themePreset || 'minimal-luxury').trim().slice(0, 60) || 'minimal-luxury',
    },
    catalog: {
      products,
    },
    publishedStore: {
      published: Boolean(publishedStore.published),
      publishedAt: publishedStore.publishedAt ? String(publishedStore.publishedAt) : null,
      publicSlug: String(publishedStore.publicSlug || '').trim().slice(0, 100),
      sourceRevision: Math.max(0, Math.round(Number(publishedStore.sourceRevision) || 0)),
    },
  };
}

export function diffProfile(prevRaw, nextRaw) {
  const prev = normalizeProfile(prevRaw);
  const next = normalizeProfile(nextRaw);
  const changedPaths = [];
  const targets = new Set();

  function walk(prefix, a, b) {
    if (a === b) return;
    if (Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object' || !a || !b) {
      if (JSON.stringify(a) !== JSON.stringify(b)) changedPaths.push(prefix);
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      walk(nextPrefix, a[key], b[key]);
    }
  }

  walk('', prev, next);

  for (const changed of changedPaths) {
    if (changed.startsWith('business.') || changed.startsWith('whatsapp.') || changed.startsWith('catalog.')) {
      targets.add('store');
      targets.add('bot');
      targets.add('dashboard');
    } else if (changed === 'payment.pixKey') {
      targets.add('bot');
    } else if (changed.startsWith('payment.') || changed.startsWith('delivery.')) {
      targets.add('store');
      targets.add('bot');
    } else if (changed.startsWith('agent.')) {
      targets.add('bot');
    } else if (changed.startsWith('brand.')) {
      targets.add('store');
      targets.add('dashboard');
    } else if (changed.startsWith('onboarding.') || changed.startsWith('publishedStore.')) {
      targets.add('store');
      targets.add('dashboard');
    }
  }

  return { changedPaths, targets: [...targets] };
}

export function buildWhatsappTemplateCatalog(profileRaw, sourceRevision = 0) {
  const profile = normalizeProfile(profileRaw);
  const storeName = profile.business.name || 'Nossa Loja';
  const agentName = profile.agent.name || 'Sofia';
  const hours = profile.business.hours || 'Seg a Sáb · 09h às 19h';
  const storeAddress = profile.business.address || 'Consulte nosso endereço pelo atendimento';
  const pickupHours = profile.delivery.pickupHours || hours;
  const pixKey = profile.payment.pixKey || '(Chave Pix não configurada)';

  const molds = [
    {
      id: 'WA-001',
      category: '01. Acolhimento e triagem',
      title: 'Saudação inicial',
      body: `Olá! 👋 Bem-vindo(a) à ${storeName}.\n\nSou ${agentName}, consultor(a) de atendimento. Como posso ajudar?\n\n1️⃣ Ver produtos  \n2️⃣ Consultar pedido  \n3️⃣ Entrega e retirada  \n4️⃣ Falar com atendente`,
    },
    { id: 'WA-002', category: '01. Acolhimento e triagem', title: 'Escolher categoria', body: 'Claro! Qual categoria você procura?\n\n{LISTA_CATEGORIAS}\n\nResponda com o número ou nome da categoria.' },
    { id: 'WA-003', category: '01. Acolhimento e triagem', title: 'Entender o que o cliente procura', body: 'Qual produto você está procurando?\n\nSe souber, informe a marca, o tamanho ou o modelo para encontrarmos a melhor opção.' },
    { id: 'WA-004', category: '01. Acolhimento e triagem', title: 'Horário de atendimento', body: `🕒 Nosso horário de atendimento é:\n\n${hours}\n\nPrecisa falar com nossa equipe?` },
    { id: 'WA-005', category: '01. Acolhimento e triagem', title: 'Transferir para atendente', body: '✅ Vou encaminhar sua conversa para um atendente.\n\nProtocolo: {PROTOCOLO_ATENDIMENTO}\n\nNossa equipe dará continuidade ao seu atendimento.' },
    { id: 'WA-006', category: '02. Catálogo e vitrine', title: 'Enviar catálogo', body: '📚 Confira nosso catálogo:\n\n{LINK_CATALOGO}\n\nSe preferir, posso mostrar os produtos aqui mesmo.' },
    { id: 'WA-007', category: '02. Catálogo e vitrine', title: 'Enviar foto de um produto', body: '📸 {NOME_PRODUTO}\n\n💰 Valor: {PRECO}\n\nGostaria de adicionar ao carrinho?' },
    { id: 'WA-008', category: '02. Catálogo e vitrine', title: 'Enviar várias fotos do produto', body: '📷 Separei {QUANTIDADE_FOTOS} fotos de {NOME_PRODUTO} para você conferir.\n\nQuer saber mais sobre ele?' },
    { id: 'WA-009', category: '02. Catálogo e vitrine', title: 'Mostrar produtos de uma categoria', body: '✨ Confira alguns produtos de {NOME_CATEGORIA}:\n\n{LISTA_PRODUTOS_RESUMIDA}\n\nQual deles chamou sua atenção?' },
    {
      id: 'WA-010',
      category: '02. Catálogo e vitrine',
      title: 'Enviar ficha do produto (Fluxo B)',
      body: '📦 {NOME_PRODUTO}\n\n{DESCRICAO_CURTA}\n\n💰 Preço: {PRECO}\n📏 Tamanho/Modelo: {VARIACAO}\n✅ Disponibilidade: {ESTOQUE}\n\n📸 Confira a foto do produto!\n\nGostaria de adicionar ao carrinho ou saber mais alguma coisa?',
    },
    { id: 'WA-011', category: '03. Preços e disponibilidade', title: 'Informar preço', body: '💰 {NOME_PRODUTO}\n\nValor: {PRECO} por {UNIDADE_VENDA}.\n\nQuantas unidades deseja?' },
    { id: 'WA-012', category: '03. Preços e disponibilidade', title: 'Produto disponível', body: '✅ Temos {NOME_PRODUTO} disponível!\n\nVariação: {VARIACAO}\n\nQuer adicionar ao seu carrinho?' },
    { id: 'WA-013', category: '03. Preços e disponibilidade', title: 'Produto indisponível', body: 'No momento, {NOME_PRODUTO} está indisponível.\n\nDeseja conhecer alternativas semelhantes?' },
    { id: 'WA-014', category: '03. Preços e disponibilidade', title: 'Sugerir alternativa', body: 'Uma opção semelhante é:\n\n📦 {PRODUTO_ALTERNATIVO}\n\n💰 {PRECO_ALTERNATIVO}\n\nPosso enviar uma foto?' },
    { id: 'WA-015', category: '03. Preços e disponibilidade', title: 'Comparar produtos', body: '🔍 Confira as diferenças:\n\n{PRODUTO_A} — {PRECO_A}\n{DIFERENCIAL_A}\n\n{PRODUTO_B} — {PRECO_B}\n{DIFERENCIAL_B}\n\nQual você prefere?' },
    { id: 'WA-016', category: '04. Carrinho e checkout', title: 'Item adicionado', body: '🛒 Adicionei ao carrinho:\n\n{QUANTIDADE}x {NOME_PRODUTO}\n\nSubtotal: {SUBTOTAL}\n\nQuer continuar comprando ou finalizar?' },
    { id: 'WA-017', category: '04. Carrinho e checkout', title: 'Resumo do carrinho', body: '🛒 Seu carrinho\n\n{LISTA_ITENS}\n\n💰 Total dos produtos: {TOTAL_PRODUTOS}\n\nDeseja finalizar seu pedido?' },
    { id: 'WA-018', category: '04. Carrinho e checkout', title: 'Conferência dos produtos', body: 'Confira seu pedido:\n\n{LISTA_ITENS}\n\n💰 Total dos produtos: {TOTAL_PRODUTOS}\n\nEstá tudo certo? Responda SIM para continuar.' },
    {
      id: 'WA-019',
      category: '04. Carrinho e checkout',
      title: 'Recebemos seu pedido — Endereço e Pagamento (Fluxo A)',
      body: `✅ Recebemos seu pedido!\n\nOlá! Obrigado por comprar na ${storeName}! 🛍️\n\n📦 Resumo: {QUANTIDADE_ITENS} itens\n💰 Total dos produtos: {VALOR_TOTAL}\n\nPara continuarmos, precisamos de duas informações:\n\n📍 1. Endereço de entrega\n• Rua e número:\n• Bairro:\n• Cidade/UF:\n• CEP:\n• Complemento (se houver):\n\n💳 2. Forma de pagamento\nQual você prefere?\n\n1️⃣ Pix\n2️⃣ Cartão de crédito\n3️⃣ Cartão de débito\n4️⃣ Dinheiro\n\nResponda com seu endereço e a opção de pagamento desejada.\n\nAssim que recebermos essas informações, confirmaremos a disponibilidade, o frete e o valor final do pedido. ✅`,
    },
    { id: 'WA-020', category: '04. Carrinho e checkout', title: 'Dados recebidos', body: '✅ Recebemos suas informações!\n\nUm atendente irá conferir seu pedido e entrar em contato para confirmar o valor final.\n\nProtocolo: {PROTOCOLO_PEDIDO}' },
    { id: 'WA-021', category: '05. Endereço, frete e retirada', title: 'Solicitar endereço', body: '📍 Informe seu endereço de entrega:\n\n• Rua e número\n• Bairro\n• Cidade/UF\n• CEP\n• Complemento (se houver)' },
    { id: 'WA-022', category: '05. Endereço, frete e retirada', title: 'Endereço incompleto', body: 'Falta apenas uma informação do seu endereço:\n\n📍 {CAMPO_ENDERECO_FALTANTE}\n\nPode me enviar, por favor?' },
    { id: 'WA-023', category: '05. Endereço, frete e retirada', title: 'Solicitar CEP', body: '🚚 Qual é seu CEP?\n\nVamos verificar as opções de entrega disponíveis para sua região.' },
    { id: 'WA-024', category: '05. Endereço, frete e retirada', title: 'Frete calculado', body: '🚚 Opção de entrega\n\nFrete: {VALOR_FRETE}\nPrazo estimado: {PRAZO_ENTREGA}\n\n💰 Total previsto: {VALOR_FINAL}\n\nDeseja solicitar a confirmação?' },
    { id: 'WA-025', category: '05. Endereço, frete e retirada', title: 'Retirada na loja', body: `🏬 Também oferecemos retirada:\n\n📍 ${storeAddress}\n🕒 ${pickupHours}\n\nPrefere retirar ou receber em casa?` },
    { id: 'WA-026', category: '06. Pagamentos', title: 'Escolher forma de pagamento', body: '💳 Como prefere pagar?\n\n1️⃣ Pix\n2️⃣ Cartão de crédito\n3️⃣ Cartão de débito\n4️⃣ Dinheiro\n\nResponda com uma opção disponível.' },
    { id: 'WA-027', category: '06. Pagamentos', title: 'Pagamento Pix (uso privado do bot)', body: `💠 Pagamento via Pix\n\nPedido: #{NUMERO_PEDIDO}\nValor: {VALOR_FINAL}\n\nChave Pix da loja (${storeName}):\n${pixKey}\n\nO pagamento será confirmado após a identificação pela loja.` },
    { id: 'WA-028', category: '06. Pagamentos', title: 'Pagamento com cartão', body: '💳 Para pagar {VALOR_FINAL} com cartão, utilize o link seguro:\n\n{LINK_PAGAMENTO}\n\nNão envie os dados do seu cartão por mensagem.' },
    { id: 'WA-029', category: '06. Pagamentos', title: 'Pagamento em dinheiro', body: '💵 Você escolheu pagar em dinheiro.\n\nVai precisar de troco?\n\nSe sim, para qual valor?' },
    { id: 'WA-030', category: '06. Pagamentos', title: 'Pagamento em análise', body: '⏳ O pagamento do pedido #{NUMERO_PEDIDO} está aguardando confirmação.\n\nAssim que for identificado, avisaremos você por aqui.' },
    { id: 'WA-031', category: '07. Confirmação e pós-venda', title: 'Pedido confirmado', body: `🎉 Pedido #{NUMERO_PEDIDO} confirmado na ${storeName}!\n\nJá estamos preparando tudo com carinho.` },
    { id: 'WA-032', category: '07. Confirmação e pós-venda', title: 'Pedido em separação', body: '📦 Seu pedido #{NUMERO_PEDIDO} está sendo separado no estoque.' },
    { id: 'WA-033', category: '07. Confirmação e pós-venda', title: 'Pedido saiu para entrega', body: '🛵 Boas notícias! Seu pedido #{NUMERO_PEDIDO} saiu para entrega.' },
    { id: 'WA-034', category: '07. Confirmação e pós-venda', title: 'Código de rastreio', body: '🔎 Rastreio do pedido #{NUMERO_PEDIDO}:\n\n{CODIGO_RASTREIO}' },
    { id: 'WA-035', category: '07. Confirmação e pós-venda', title: 'Pronto para retirada', body: `🏬 Seu pedido #{NUMERO_PEDIDO} já está pronto para retirada em:\n\n📍 ${storeAddress}` },
    { id: 'WA-036', category: '07. Confirmação e pós-venda', title: 'Pedido entregue', body: `✅ Pedido #{NUMERO_PEDIDO} entregue! Muito obrigado por comprar na ${storeName}.` },
    { id: 'WA-037', category: '07. Confirmação e pós-venda', title: 'Pesquisa de satisfação', body: `⭐ Como foi sua experiência com a ${storeName}?\n\nDe 1 a 5, qual nota você daria para nosso atendimento?` },
    { id: 'WA-038', category: '08. Suporte e trocas', title: 'Política de troca', body: '🔄 Você pode solicitar troca ou devolução em até 7 dias corridos após o recebimento, mantendo o produto sem uso.' },
    { id: 'WA-039', category: '08. Suporte e trocas', title: 'Abrir solicitação de troca', body: '🔄 Para agilizar sua troca, informe o número do pedido #{NUMERO_PEDIDO} e o motivo.' },
    { id: 'WA-040', category: '08. Suporte e trocas', title: 'Problema com produto', body: '😕 Sentimos muito pelo ocorrido. Pode nos enviar uma foto do item para resolvermos rápido?' },
    { id: 'WA-041', category: '08. Suporte e trocas', title: 'Pedido cancelado', body: '❌ O pedido #{NUMERO_PEDIDO} foi cancelado conforme solicitado.' },
    { id: 'WA-042', category: '08. Suporte e trocas', title: 'Status de atendimento', body: '📋 Seu chamado {PROTOCOLO_ATENDIMENTO} está em andamento com nossa equipe.' },
    { id: 'WA-043', category: '09. Follow-up e reengajamento', title: 'Carrinho aguardando resposta', body: `Oi! 👋 Notamos que você demonstrou interesse em produtos da ${storeName}. Posso ajudar a concluir seu pedido?` },
    { id: 'WA-044', category: '09. Follow-up e reengajamento', title: 'Produto voltou ao estoque', body: `🔔 Boa notícia da ${storeName}: {NOME_PRODUTO} voltou ao estoque!` },
    { id: 'WA-045', category: '09. Follow-up e reengajamento', title: 'Confirmação de horário', body: `🕒 Confirmando seu atendimento na ${storeName} dentro do horário: ${hours}.` },
    { id: 'WA-046', category: '09. Follow-up e reengajamento', title: 'Oferta especial Pix', body: profile.payment.pixDiscountPercent > 0 ? `💠 Pagando via Pix você garante ${profile.payment.pixDiscountPercent}% de desconto na ${storeName}!` : `💠 Aceitamos Pix, cartão e dinheiro na ${storeName}!` },
    { id: 'WA-047', category: '10. Mensagens institucionais e segurança', title: 'Link oficial da loja', body: `🌐 Acesse o catálogo oficial da ${storeName}:\n\n{LINK_CATALOGO}` },
    { id: 'WA-048', category: '10. Mensagens institucionais e segurança', title: 'Redes sociais oficiais', body: profile.brand.instagram ? `📱 Siga a ${storeName} no Instagram: ${profile.brand.instagram}` : `📱 Obrigado por acompanhar a ${storeName}!` },
    { id: 'WA-049', category: '10. Mensagens institucionais e segurança', title: 'Aviso anti-fraude', body: `🔒 Segurança ${storeName}: nunca solicitamos senha bancária ou código de verificação por WhatsApp.` },
    { id: 'WA-050', category: '10. Mensagens institucionais e segurança', title: 'Encerramento cordial', body: `✨ Obrigado por falar com a ${storeName}! Sempre que precisar, é só chamar.` },
    {
      id: 'cart-checkout',
      category: '04. Carrinho e checkout',
      title: 'Mensagem inicial enviada pela loja (Fluxo A)',
      body: `🛒 NOVO PEDIDO — ${storeName}\n\nOlá! Gostaria de finalizar meu pedido.\n\n📦 Itens do carrinho:\n{LISTA_DE_PRODUTOS}\n\n💰 Total: {VALOR_TOTAL}\n\nGostaria de confirmar a disponibilidade e combinar a entrega ou retirada. Obrigado!`,
    },
  ];

  return {
    sourceRevision,
    businessName: storeName,
    molds,
  };
}

export function buildBotProjections(profileRaw, sourceRevision = 0) {
  const profile = normalizeProfile(profileRaw);
  const templateCatalog = buildWhatsappTemplateCatalog(profile, sourceRevision);

  const toneInstruction = {
    proximo: 'Use tom próximo, educado, claro e acolhedor.',
    formal: 'Use tom formal, objetivo e respeitoso.',
    direto: 'Use respostas curtas, práticas e diretas ao ponto.',
    consultivo: 'Ajude o cliente a comparar opções e escolher a melhor variação.',
  }[profile.agent.tone];

  const promptGuardrail = [
    `Você é ${profile.agent.name}, assistente oficial da loja ${profile.business.name || 'Loja'} (revisão ${sourceRevision}).`,
    toneInstruction,
    profile.business.hours ? `Horário de funcionamento: ${profile.business.hours}.` : '',
    profile.business.address ? `Endereço da loja: ${profile.business.address}.` : '',
    `Formas de pagamento aceitas: ${profile.payment.acceptedMethods.join(', ')}.`,
    profile.payment.pixDiscountPercent > 0 ? `Desconto à vista no Pix: ${profile.payment.pixDiscountPercent}%.` : '',
    'Nunca invente preços ou estoque fora do catálogo oficial (skus.json).',
    'Ao detectar 🛒 NOVO PEDIDO, confirme os itens recalculados pelo catálogo oficial e peça endereço completo + forma de pagamento antes de informar a chave Pix. Nunca envie asteriscos ou códigos SKU ao cliente.',
  ].filter(Boolean).join('\n');

  const configLoja = {
    schemaVersion: 1,
    sourceRevision,
    onboardingConcluido: Boolean(profile.onboarding.whatsappConfirmed || profile.onboarding.fichaCompleted),
    nome: profile.business.name || 'Loja CompanyGen',
    nomeLoja: profile.business.name || 'Loja CompanyGen',
    segmento: profile.business.segment,
    descricao: profile.business.description,
    endereco: profile.business.address,
    mapsUrl: profile.business.mapsUrl,
    horario: profile.business.hours,
    email: profile.business.email,
    telefoneWhatsapp: profile.whatsapp.phoneE164,
    chavePix: profile.payment.pixKey,
    descontoPix: profile.payment.pixDiscountPercent,
    formasPagamento: profile.payment.acceptedMethods,
    retiradaAtiva: profile.delivery.pickupEnabled,
    entregaAtiva: profile.delivery.deliveryEnabled,
    regioesEntrega: profile.delivery.areas,
    fretePadraoCentavos: profile.delivery.defaultFeeCents,
    horarioRetirada: profile.delivery.pickupHours,
    instagram: profile.brand.instagram,
    logoUrl: profile.brand.logoUrl,
    atendenteNome: profile.agent.name,
    atendenteTom: profile.agent.tone,
    saudacaoInicial: profile.agent.welcomeMessage,
  };

  const configuracoesPatch = {
    sourceRevision,
    nomeEmpresa: profile.business.name || 'Loja CompanyGen',
    nomeAtendente: profile.agent.name,
    tomVoz: profile.agent.tone,
    iaAtiva: profile.agent.autoReplyEnabled,
    botAtivo: profile.agent.autoReplyEnabled,
    somenteNovas: true,
    promptPersonalizado: promptGuardrail,
    telefoneConectado: profile.whatsapp.phoneE164,
  };

  const skus = profile.catalog.products.map(product => ({
    id: product.id,
    sku: product.sku,
    nome: product.name,
    categoria: product.category,
    descricao: product.description,
    preco: Number((product.priceCents / 100).toFixed(2)),
    priceCents: product.priceCents,
    variacao: product.variation,
    estoque: product.stock,
    ativo: product.active,
    imagem: product.imageUrl,
    fotoUrl: product.imageUrl,
    approvedAsset: product.approvedAsset,
    sourceRevision,
  }));

  return {
    sourceRevision,
    digest: computeDigest({ configLoja, configuracoesPatch, skus, templates: templateCatalog }),
    configLoja,
    configuracoesPatch,
    skus,
    templates: {
      sourceRevision,
      items: templateCatalog.molds,
    },
  };
}

export function buildPublicStoreProjection(profileRaw, sourceRevision = 0) {
  const profile = normalizeProfile(profileRaw);
  // Positive allowlist ONLY: never emits payment.pixKey, agent internal prompts, or operator credentials.
  return {
    schemaVersion: 1,
    sourceRevision,
    business: {
      name: profile.business.name || 'Minha Loja',
      segment: profile.business.segment,
      description: profile.business.description,
      address: profile.business.address,
      mapsUrl: profile.business.mapsUrl,
      hours: profile.business.hours,
    },
    whatsapp: {
      connected: profile.whatsapp.connected,
      phoneE164: profile.whatsapp.phoneE164,
      displayPhone: profile.whatsapp.displayPhone,
      phoneValid: isValidProductionPhone(profile.whatsapp.phoneE164),
    },
    paymentPublic: {
      pixDiscountPercent: profile.payment.pixDiscountPercent,
      acceptedMethods: profile.payment.acceptedMethods,
    },
    delivery: {
      pickupEnabled: profile.delivery.pickupEnabled,
      deliveryEnabled: profile.delivery.deliveryEnabled,
      areas: profile.delivery.areas,
      defaultFeeCents: profile.delivery.defaultFeeCents,
      pickupHours: profile.delivery.pickupHours,
    },
    brand: {
      instagram: profile.brand.instagram,
      logoUrl: profile.brand.logoUrl,
      primaryColor: profile.brand.primaryColor,
      accentColor: profile.brand.accentColor,
      themePreset: profile.brand.themePreset,
    },
    products: profile.catalog.products
      .filter(p => p.active)
      .map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        description: p.description,
        priceCents: p.priceCents,
        variation: p.variation,
        stock: p.stock,
        imageUrl: p.imageUrl,
        approvedAsset: p.approvedAsset,
      })),
  };
}

export function recalculateOrderTotals(rawItems = [], skus = [], shippingCents = 0) {
  const normalizedSkus = Array.isArray(skus) ? skus : [];
  const bySku = new Map();
  const byName = new Map();
  for (const item of normalizedSkus) {
    const skuKey = String(item?.sku || '').trim().toUpperCase();
    const nameKey = String(item?.name || item?.nome || '').trim().toLowerCase();
    const priceCents = Number.isFinite(Number(item?.priceCents))
      ? Math.max(0, Math.round(Number(item.priceCents)))
      : Math.max(0, Math.round(Number(item?.preco || 0) * 100));
    const entry = {
      sku: skuKey || String(item?.id || ''),
      name: String(item?.name || item?.nome || '').trim(),
      variation: String(item?.variation || item?.variacao || 'Padrão').trim(),
      unitPriceCents: priceCents,
      active: item?.active !== false && item?.ativo !== false,
    };
    if (skuKey) bySku.set(skuKey, entry);
    if (nameKey) byName.set(nameKey, entry);
  }

  const verifiedItems = [];
  const unmatchedItems = [];
  let subtotalCents = 0;

  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const quantity = Math.max(1, Math.min(999, Math.round(Number(raw?.quantity || raw?.qty || 1))));
    const skuLookup = String(raw?.sku || '').trim().toUpperCase();
    const nameLookup = String(raw?.name || raw?.nome || '').trim().toLowerCase();
    let matched = (skuLookup && bySku.get(skuLookup)) || (nameLookup && byName.get(nameLookup));
    if (!matched && nameLookup) {
      for (const [candidateName, entry] of byName.entries()) {
        if (nameLookup.includes(candidateName) || candidateName.includes(nameLookup)) {
          matched = entry;
          break;
        }
      }
    }
    if (!matched || !matched.active) {
      unmatchedItems.push(String(raw?.name || raw?.sku || 'item desconhecido'));
      continue;
    }
    const lineTotalCents = matched.unitPriceCents * quantity;
    subtotalCents += lineTotalCents;
    verifiedItems.push({
      sku: matched.sku,
      name: matched.name,
      variation: matched.variation,
      quantity,
      unitPriceCents: matched.unitPriceCents,
      lineTotalCents,
    });
  }

  const safeShipping = Math.max(0, Math.round(Number(shippingCents) || 0));
  return {
    verifiedItems,
    unmatchedItems,
    subtotalCents,
    shippingCents: safeShipping,
    totalCents: subtotalCents + safeShipping,
  };
}

export function buildDashboardProjection(profileRaw, sourceRevision, orders = [], metrics = {}, whatsappData = {}, options = {}) {
  const profile = normalizeProfile(profileRaw);
  const safeOrders = Array.isArray(orders) ? orders : [];
  const rawDays = options?.days;
  const isAll = rawDays === 'all' || rawDays === 'todos' || rawDays === null;
  const parsedDays = Number(rawDays);
  const periodDays = isAll ? 'all' : (Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7);

  let filteredOrders = safeOrders;
  if (periodDays !== 'all') {
    const cutoffMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    filteredOrders = safeOrders.filter(order => {
      if (!order?.created_at) return true;
      const ts = new Date(order.created_at).getTime();
      return !Number.isFinite(ts) || ts >= cutoffMs;
    });
  }

  const conversas = Array.isArray(whatsappData?.conversas) ? whatsappData.conversas : [];

  let messagesCount = 0;
  for (const conv of conversas) {
    if (Array.isArray(conv?.mensagens)) messagesCount += conv.mensagens.length;
    else if (Number.isFinite(Number(conv?.totalMensagens))) messagesCount += Number(conv.totalMensagens);
  }

  const activeProducts = profile.catalog.products.filter(p => p.active);
  const stockUnits = activeProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const salesCents = filteredOrders
    .filter(order => order?.status !== 'cancelado')
    .reduce((sum, order) => sum + (Number(order?.total_cents) || 0), 0);

  return {
    sourceRevision,
    periodDays,
    businessName: profile.business.name || 'Minha Loja',
    whatsappConnected: profile.whatsapp.connected || Boolean(whatsappData?.conectado),
    displayPhone: profile.whatsapp.displayPhone || profile.whatsapp.phoneE164 || '',
    visitsTotal: Number(metrics?.visits_total || 0),
    visitsByDay: metrics?.visits_by_day && typeof metrics.visits_by_day === 'object' ? metrics.visits_by_day : {},
    ordersCount: filteredOrders.length,
    salesCents,
    messagesCount,
    catalogCount: activeProducts.length,
    stockUnits,
    recentOrders: filteredOrders.slice(0, 50),
  };
}
