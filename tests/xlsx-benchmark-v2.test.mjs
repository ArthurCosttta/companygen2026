import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { transformCatalogData } from '../server/ai-spreadsheet-engine.mjs';
import { handleWhatsappAiRoutes } from '../server/ai-sofia-local.mjs';

const BENCHMARK_DIR = path.resolve('tests/fixtures/benchmark_v2');

test('DOC C03 + DOC C04: 10 planilhas multi-nicho geram arquétipos, componentes e fluxos WhatsApp distintos', async () => {
  const cases = [
    { file: '01_clinica_estetica_facial.xlsx', expectedArchetype: 'saude_clinica', expectComp: 'clinic_symptom_map' },
    { file: '02_oficina_assistencia_apple.xlsx', expectedArchetype: 'assistencia_tecnica', expectComp: 'clinic_symptom_map' },
    { file: '03_atacado_camisetas_drops.xlsx', expectedArchetype: 'atacado_b2b', expectComp: 'bundle_builder_calculator' },
    { file: '04_confeitaria_sob_encomenda.xlsx', expectedArchetype: 'gastronomia_encomendas', expectComp: 'interactive_image_text_stage' },
    { file: '05_petshop_banho_creche.xlsx', expectedArchetype: 'pet_cuidados', expectComp: 'bundle_builder_calculator' },
    { file: '06_marcenaria_moveis_planejados.xlsx', expectedArchetype: 'arquitetura_marcenaria', expectComp: 'hero_centered' },
    { file: '07_marmitas_fitness_semanal.xlsx', expectedArchetype: 'gastronomia_encomendas', expectComp: 'calendar_delivery_slots' },
    { file: '08_locacao_equipamentos_eventos.xlsx', expectedArchetype: 'locacao_eventos', expectComp: 'calendar_delivery_slots' },
    { file: '09_academia_studio_pilates.xlsx', expectedArchetype: 'educacao_mentorias', expectComp: 'calendar_delivery_slots' },
    { file: '10_joalheria_prata_artesanal.xlsx', expectedArchetype: 'joalheria_artesanal', expectComp: 'hero_centered' },
  ];

  const distinctArchetypes = new Set();
  for (const c of cases) {
    const buf = await readFile(path.join(BENCHMARK_DIR, c.file));
    const result = await transformCatalogData({
      base64Content: buf.toString('base64'),
      filename: c.file,
      storeName: c.file.replace(/\.xlsx$/, ''),
    });

    assert.equal(result.ok, true, `${c.file} deve importar ok`);
    assert.ok(result.products.length >= 3, `${c.file} deve extrair >= 3 itens`);
    assert.ok(result.spreadsheetSignals, `${c.file} deve retornar spreadsheetSignals`);
    assert.equal(
      result.spreadsheetSignals.archetype,
      c.expectedArchetype,
      `${c.file} esperava arquétipo ${c.expectedArchetype}, recebeu ${result.spreadsheetSignals.archetype}`,
    );
    assert.ok(
      result.spreadsheetSignals.recommendedComponents.includes(c.expectComp),
      `${c.file} deve recomendar componente ${c.expectComp} (recebeu ${result.spreadsheetSignals.recommendedComponents.join(', ')})`,
    );
    assert.ok(Array.isArray(result.recommendedSubpages) && result.recommendedSubpages.length >= 2);
    assert.ok(Array.isArray(result.whatsappMessageFlows) && result.whatsappMessageFlows.length >= 3);
    distinctArchetypes.add(result.spreadsheetSignals.archetype);
  }

  assert.ok(distinctArchetypes.size >= 8, `Esperava >= 8 arquétipos distintos nas 10 planilhas, recebeu ${distinctArchetypes.size}`);
});

test('DOC C05: API /api/whatsapp/ai/message-flows aprova, edita e gera mais mensagens com custo 0.5 cr', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cg-wpp-flows-'));
  try {
    await writeFile(
      path.join(dir, 'profile.json'),
      JSON.stringify({
        revision: 1,
        data: {
          business: { name: 'Confeitaria Aurora', segment: 'Confeitaria Artesanal' },
          payment: { pixKey: 'pix@aurora.com.br' },
          catalog: {
            products: [
              { id: 'bolo_1', sku: 'BOLO-70', name: 'Bolo Belga 70%', priceCents: 19800, active: true },
              { id: 'caixa_2', sku: 'CX-16', name: 'Caixa 16 Doces', priceCents: 8900, active: true },
            ],
          },
        },
      }),
    );
    await writeFile(
      path.join(dir, 'credits_ledger.json'),
      JSON.stringify([{ id: 'seed', ts: new Date().toISOString(), action: 'seed', delta: 10, balance_after: 10 }]),
    );

    const readJsonFile = async (fp, fallback) => {
      try {
        return JSON.parse(await readFile(fp, 'utf8'));
      } catch {
        return fallback;
      }
    };
    const atomicWriteJson = async (fp, data) => writeFile(fp, JSON.stringify(data, null, 2), 'utf8');

    const callRoute = async (method, urlPath, bodyObj = null) => {
      let statusCode = 200;
      let payload = null;
      const req = {
        method,
        url: urlPath,
        headers: {},
        async *[Symbol.asyncIterator]() {
          if (bodyObj) yield Buffer.from(JSON.stringify(bodyObj), 'utf8');
        },
      };
      const res = { statusCode: 200 };
      const send = (_res, code, data) => {
        statusCode = code;
        payload = data;
      };
      const readJson = async () => bodyObj || {};
      class ApiError extends Error {
        constructor(code, msg) {
          super(msg);
          this.statusCode = code;
        }
      }
      const handled = await handleWhatsappAiRoutes(req, res, {
        user: { id: 'u-flows', email: 'flows@test.local' },
        directory: dir,
        readJson,
        send,
        ApiError,
        readJsonFile,
        atomicWriteJson,
        skipOllama: true,
      });
      return { handled, statusCode, payload };
    };

    const getRes = await callRoute('GET', '/api/whatsapp/ai/message-flows');
    assert.equal(getRes.handled, true);
    assert.equal(getRes.statusCode, 200);
    assert.ok(getRes.payload.flows.length >= 4);

    const secondFlowId = getRes.payload.flows[1].id;
    const approveRes = await callRoute('POST', '/api/whatsapp/ai/message-flows/action', {
      flowId: secondFlowId,
      action: 'approve',
    });
    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.payload.flows[1].status, 'approved');

    const moreRes = await callRoute('POST', '/api/whatsapp/ai/message-flows/generate-more', { focus: 'objecao' });
    assert.equal(moreRes.statusCode, 200);
    assert.equal(moreRes.payload.debited, 0.5);
    assert.equal(moreRes.payload.balanceAfter, 9.5);
    assert.ok(moreRes.payload.flows.length > getRes.payload.flows.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
