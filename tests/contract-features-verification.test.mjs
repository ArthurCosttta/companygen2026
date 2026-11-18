import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGaussianReadDelay,
  computeTypingDurationMs,
  isOffHours,
  ACOLHEDOR_GREETINGS,
  getRandomGreeting,
  classifyAndRespondWithLocalAi,
  buildDeterministicSofiaReply,
  classifyWhatsappMessage,
} from '../server/ai-sofia-local.mjs';
import {
  CREDIT_PLANS,
  computeSha256,
  generateFakePixPayload,
} from '../server/access-and-checkout.mjs';

test('Anti-Ban: Gaussian Read Delay stays strictly within 1500ms and 4000ms', () => {
  for (let i = 0; i < 50; i += 1) {
    const delay = computeGaussianReadDelay(1500, 4000);
    assert.ok(delay >= 1500, `Delay ${delay} should be >= 1500`);
    assert.ok(delay <= 4000, `Delay ${delay} should be <= 4000`);
  }
});

test('Anti-Ban: Typing Duration scales with character count and respects clamps', () => {
  const shortText = 'Olá!';
  const shortDuration = computeTypingDurationMs(shortText);
  assert.ok(shortDuration >= 1200, 'Short text should meet minimum typing duration of 1200ms');

  const longText = 'Este é um texto longo com detalhes sobre o pedido, produtos em estoque, formas de pagamento e opções de entrega na loja.';
  const longDuration = computeTypingDurationMs(longText);
  assert.ok(longDuration >= shortDuration, 'Longer text should take longer to type');
  assert.ok(longDuration <= 8000, 'Typing duration should be capped at 8000ms max');
});

test('Anti-Ban: Varied greetings avoid repetitive templates', () => {
  assert.ok(ACOLHEDOR_GREETINGS.length >= 4, 'Should have at least 4 varied greetings');
  const sampled = new Set();
  for (let i = 0; i < 30; i += 1) {
    sampled.add(getRandomGreeting());
  }
  assert.ok(sampled.size > 1, 'Should rotate greetings dynamically');
});

test('Triple Fallback Cascade: Falls back to Level 4 Deterministic Rules when Ollama is unavailable', async () => {
  const mockProfile = {
    business: { name: 'Empório do Café' },
    catalog: {
      products: [
        {
          id: 'p1',
          name: 'Café Especial Torrado',
          sku: 'CAFE-ESP',
          priceCents: 3500,
          stock: 10,
          active: true,
        },
      ],
    },
    delivery: { defaultFeeCents: 800, deliveryEnabled: true },
  };

  const outcome = await classifyAndRespondWithLocalAi({
    messageText: 'Quanto custa o Café Especial Torrado?',
    customerName: 'Mariana',
    profile: mockProfile,
    diskSkus: mockProfile.catalog.products,
    brainConfig: { enabled: true, modelName: 'qwen2.5:0.5b' },
    ragDocuments: [],
    skipOllama: true, // Força contingência
  });

  assert.equal(outcome.usedFallback, true);
  assert.equal(outcome.fallbackLevel, 4);
  assert.ok(outcome.replyText.includes('Café Especial Torrado'));
  assert.ok(outcome.replyText.includes('35,00'));
  assert.ok(outcome.readDelayMs >= 1500 && outcome.readDelayMs <= 4000);
  assert.ok(outcome.typingTimeMs >= 1200);
});

test('Triple Fallback Cascade: Falls back to Level 3 RAG router when document matches', async () => {
  const mockProfile = {
    business: { name: 'Ateliê dos Doces' },
    catalog: { products: [] },
  };

  const mockDocs = [
    {
      id: 'doc-1',
      title: 'Política de Estacionamento',
      content: 'Temos convênio com o estacionamento Estapar na rua lateral com 1 hora grátis para clientes.',
    },
  ];

  const outcome = await classifyAndRespondWithLocalAi({
    messageText: 'Tem estacionamento no local?',
    customerName: 'Carlos',
    profile: mockProfile,
    diskSkus: [],
    brainConfig: { enabled: true, modelName: 'qwen2.5:0.5b' },
    ragDocuments: mockDocs,
    skipOllama: true,
  });

  assert.equal(outcome.fallbackLevel, 3);
  assert.equal(outcome.modelUsed, 'local-rag-router');
  assert.ok(outcome.replyText.includes('Política de Estacionamento'));
  assert.ok(outcome.replyText.includes('Estapar'));
});

test('Checkout Plans: Main tier is R$ 100,00 for 2,500 credits and popular is true', () => {
  const mainPlan = CREDIT_PLANS.find((p) => p.id === 'plan_100_brl');
  assert.ok(mainPlan, 'Main plan should exist');
  assert.equal(mainPlan.priceCents, 10000, 'Should be 10000 cents (R$ 100,00)');
  assert.equal(mainPlan.credits, 2500, 'Should provide 2,500 credits');
  assert.equal(mainPlan.popular, true, 'Should be highlighted as popular');
  assert.equal(mainPlan.priceFormatted, 'R$ 100,00');

  const pixPayload = generateFakePixPayload(mainPlan.priceCents, 'TEST-1234');
  assert.ok(pixPayload.includes('br.gov.bcb.pix'));
  assert.ok(pixPayload.includes('100.00'));
});

test('Access Code Validation: SHA-256 hash matching and format enforcement', () => {
  const rawCode = 'AI10-A7K9-P2XM';
  const computed = computeSha256(rawCode);
  assert.equal(typeof computed, 'string');
  assert.equal(computed.length, 64);

  // Case insensitivity
  assert.equal(computeSha256('ai10-a7k9-p2xm'), computed);
});
