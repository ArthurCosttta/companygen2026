import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import JSZip from 'jszip';

import {
  buildXlsxUint8Array,
  parsePriceToCents,
  parseUniversalSpreadsheet,
} from '../src/utils/xlsx-io.ts';
import { handleSpreadsheetRoutes } from '../server/ai-spreadsheet-engine.mjs';

function makeMockReq(method, url, bodyObj) {
  const payload = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
  const stream = Readable.from(payload ? [Buffer.from(payload, 'utf8')] : []);
  stream.method = method;
  stream.url = url;
  return stream;
}

function makeMockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
  };
}

function createRouteDeps(directory, profileData) {
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    user: { id: 'demo-user-01', bearer: 'test-token' },
    directory,
    async readJson(req, maxBytes = 10 * 1024 * 1024) {
      const chunks = [];
      let total = 0;
      for await (const c of req) {
        total += c.length;
        if (total > maxBytes) throw new ApiError(413, 'Payload too large');
        chunks.push(c);
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      return raw ? JSON.parse(raw) : {};
    },
    send(res, status, data) {
      res.statusCode = status;
      res.body = data;
    },
    async loadProfileState() {
      return {
        current: {
          revision: 3,
          data: profileData || { business: { name: 'Casa da Serra' } },
        },
      };
    },
    async readJsonFile(filePath, fallback) {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        return fallback;
      }
    },
  };
}

describe('Real OpenXML .XLSX & Universal Spreadsheet Parser (src/utils/xlsx-io.ts)', () => {
  it('parses BRL, US decimal and mixed currency strings accurately to integer cents', () => {
    assert.equal(parsePriceToCents('R$ 1.290,50'), 129050);
    assert.equal(parsePriceToCents('1290.50'), 129050);
    assert.equal(parsePriceToCents('49,90'), 4990);
    assert.equal(parsePriceToCents(199.9), 19990);
    assert.equal(parsePriceToCents('R$ 1.500'), 150000);
    assert.equal(parsePriceToCents('Sob consulta'), 0);
  });

  it('round-trips multi-sheet .xlsx with UTF-8 accents, XML escapes and numbers', async () => {
    const bytes = await buildXlsxUint8Array([
      {
        name: 'Catálogo & Preços [Loja]',
        headers: ['SKU', 'Produto', 'Preço (R$)', 'Estoque'],
        rows: [
          ['CAF-01', 'Açaí & Mel <Orgânico> "500g"', 'R$ 1.290,50', 12],
          ['VEL-02', 'Vela Lavanda Atenção', 49.9, 30],
        ],
      },
      {
        name: 'Resumo Canal',
        headers: ['Canal', 'Total'],
        rows: [['WhatsApp D1', 15]],
      },
    ]);

    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);

    const parsed = await parseUniversalSpreadsheet(bytes, 'teste.xlsx');
    assert.equal(parsed.format, 'xlsx');
    assert.equal(parsed.sheets.length, 2);
    assert.deepEqual(parsed.sheets[0].headers, ['SKU', 'Produto', 'Preço (R$)', 'Estoque']);
    assert.equal(parsed.sheets[0].rows[0][1], 'Açaí & Mel <Orgânico> "500g"');
    assert.equal(parsed.sheets[0].rows[0][2], 'R$ 1.290,50');
    assert.equal(parsed.sheets[0].rows[1][2], '49.9');
    assert.equal(parsed.sheets[1].rows[0][0], 'WhatsApp D1');
  });

  it('resolves sparse cell refs (A1, C1), t="inlineStr", rich sharedStrings, and skips empty sheet1', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vazia" sheetId="1" r:id="rId1"/><sheet name="Produtos" sheetId="2" r:id="rId2"/></sheets></workbook>`
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
    );
    zip.file(
      'xl/sharedStrings.xml',
      `<sst><si><r><t>Nome </t></r><r><t>Composto</t></r></si><si><t>Kit Café Premium</t></si></sst>`
    );
    zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData/></worksheet>`);
    zip.file(
      'xl/worksheets/sheet2.xml',
      `<worksheet><sheetData>
        <row r="1">
          <c r="A1" t="s"><v>0</v></c>
          <c r="C1" t="inlineStr"><is><t>Valor</t></is></c>
        </row>
        <row r="2">
          <c r="A2" t="s"><v>1</v></c>
          <c r="B2" t="inlineStr"><is><t>Categoria Esparsa</t></is></c>
          <c r="C2"><v>189.9</v></c>
        </row>
      </sheetData></worksheet>`
    );

    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const parsed = await parseUniversalSpreadsheet(bytes, 'esparso.xlsx');
    assert.equal(parsed.format, 'xlsx');
    assert.equal(parsed.sheets.length, 1);
    assert.equal(parsed.sheets[0].name, 'Produtos');
    assert.equal(parsed.sheets[0].headers[0], 'Nome Composto');
    assert.equal(parsed.sheets[0].headers[2], 'Valor');
    assert.equal(parsed.sheets[0].rows[0][0], 'Kit Café Premium');
    assert.equal(parsed.sheets[0].rows[0][1], 'Categoria Esparsa');
    assert.equal(parsed.sheets[0].rows[0][2], '189.9');
  });

  it('parses SpreadsheetML 2003 .xls XML, ERP HTML .xls, CSV (; with BOM & quotes) and TSV', async () => {
    const xml2003 = `<?xml version="1.0"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="ERP_2003">
          <Table>
            <Row><Cell><Data ss:Type="String">Produto</Data></Cell><Cell ss:Index="3"><Data ss:Type="String">Preço</Data></Cell></Row>
            <Row><Cell><Data ss:Type="String">Caneca</Data></Cell><Cell ss:Index="3"><Data ss:Type="Number">79.50</Data></Cell></Row>
          </Table>
        </Worksheet>
      </Workbook>`;
    const parsedXml = await parseUniversalSpreadsheet(xml2003, 'relatorio.xls');
    assert.equal(parsedXml.format, 'xls-xml');
    assert.equal(parsedXml.sheets[0].headers[2], 'Preço');
    assert.equal(parsedXml.sheets[0].rows[0][2], '79.50');

    const htmlXls = `<html><head><style>td{color:#000}</style></head><body><table>
      <tr><th>SKU</th><th>Descrição Item</th><th>Valor Unit.</th></tr>
      <tr><td>ERP-1</td><td>Pão &amp; Queijo Artesanal</td><td>R$ 49,90</td></tr>
    </table></body></html>`;
    const parsedHtml = await parseUniversalSpreadsheet(htmlXls, 'export_erp.xls');
    assert.equal(parsedHtml.format, 'xls-html');
    assert.deepEqual(parsedHtml.sheets[0].headers, ['SKU', 'Descrição Item', 'Valor Unit.']);
    assert.equal(parsedHtml.sheets[0].rows[0][1], 'Pão & Queijo Artesanal');
    assert.equal(parsedHtml.sheets[0].rows[0][2], 'R$ 49,90');

    const csvText = `\uFEFFNome;Categoria;Preço\r\n"Bolo; ""Especial""";Doces;49,90\r\n\r\nCafé;Bebidas;1.290,50`;
    const parsedCsv = await parseUniversalSpreadsheet(csvText, 'fornecedor.csv');
    assert.equal(parsedCsv.format, 'csv');
    assert.deepEqual(parsedCsv.sheets[0].headers, ['Nome', 'Categoria', 'Preço']);
    assert.equal(parsedCsv.sheets[0].rows[0][0], 'Bolo; "Especial"');
    assert.equal(parsedCsv.sheets[0].rows[1][2], '1.290,50');

    const tsvText = `Cod\tTitulo\tValor\nT1\tQuadro\t320.00`;
    const parsedTsv = await parseUniversalSpreadsheet(tsvText, 'lista.tsv');
    assert.equal(parsedTsv.format, 'tsv');
    assert.equal(parsedTsv.sheets[0].rows[0][1], 'Quadro');
  });
});

describe('Local AI Spreadsheet Engine (server/ai-spreadsheet-engine.mjs)', () => {
  it('POST /api/ai/spreadsheet/transform-catalog transforms messy supplier .xlsx with deterministic fallback & emits valid .xlsx', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-xls-engine-'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Ollama offline');
    };

    try {
      const messyBytes = await buildXlsxUint8Array([
        {
          name: 'Bruto',
          headers: [
            'Cod Ref',
            'Nome do Produto',
            'Categoria',
            'Valor Unit. (R$)',
            'Tamanho / Variação',
            'Observação',
            'Qtd Estoque',
          ],
          rows: [
            ['SKU-9', 'Mesa Madeira Nobre', 'Móveis', 'R$ 1.290,50', '160cm / 200cm', 'Acabamento fosco', 4],
            ['SKU-10', 'Vela Lavanda', 'Aromas', '49,90', '220g', 'Cera vegetal', 25],
            ['SKU-11', 'Suporte Ferro', 'Decoração', '1290.50', 'Preto', 'Pintura eletrostática', 9],
          ],
        },
      ]);

      const deps = createRouteDeps(tmpDir);
      const req = makeMockReq('POST', '/api/ai/spreadsheet/transform-catalog', {
        filename: 'fornecedor.xlsx',
        base64Content: Buffer.from(messyBytes).toString('base64'),
      });
      const res = makeMockRes();

      const handled = await handleSpreadsheetRoutes(req, res, deps);
      assert.equal(handled, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.usedFallback, true);
      assert.equal(res.body.totalRows, 3);
      assert.equal(res.body.filename, 'catalogo_padronizado_companygen.xlsx');
      assert.equal(res.body.columnMapping.nameCol, 'Nome do Produto');
      assert.equal(res.body.columnMapping.priceCol, 'Valor Unit. (R$)');
      assert.equal(res.body.products[0].price_cents, 129050);
      assert.equal(res.body.products[1].price_cents, 4990);
      assert.equal(res.body.products[2].price_cents, 129050);
      assert.deepEqual(res.body.products[0].variants, ['160cm', '200cm']);

      const generatedXlsx = Buffer.from(res.body.xlsxBase64, 'base64');
      const reparsed = await parseUniversalSpreadsheet(new Uint8Array(generatedXlsx), res.body.filename);
      assert.equal(reparsed.format, 'xlsx');
      assert.equal(reparsed.sheets[0].name, 'Catalogo_Padronizado');
      assert.equal(reparsed.sheets[0].rows.length, 3);
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('POST /api/ai/spreadsheet/catalog-orders classifies D1 WPP vs Balcão Manual and generates 3-sheet .xlsx', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-orders-engine-'));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Ollama offline');
    };

    try {
      const sampleOrders = [
        {
          id: 'ord-1',
          order_ref: 'D1-101',
          customer_jid: '5511999991111@s.whatsapp.net',
          customer_name: 'Maria Clara',
          channel: 'whatsapp_d1',
          items: [{ sku: 'KIT-1', name: 'Kit Café Especial', qty: 2, unit_price_cents: 15000 }],
          shipping_cents: 1500,
          total_cents: 31500,
          status: 'confirmado',
          created_at: '2026-11-10T14:20:00Z',
        },
        {
          id: 'ord-2',
          order_ref: 'BALCAO-02',
          customer_jid: '',
          customer_name: 'Balcão João',
          channel: 'balcao',
          items: [{ sku: 'CAF-2', name: 'Café Moído 250g', qty: 1, unit_price_cents: 4990 }],
          shipping_cents: 0,
          total_cents: 4990,
          status: 'entregue',
          created_at: '2026-11-11T09:10:00Z',
        },
        {
          id: 'ord-3',
          order_ref: 'D1-103',
          customer_jid: '5511888882222@s.whatsapp.net',
          customer_name: 'Pedro Cancelado',
          channel: 'whatsapp_d1',
          items: [{ sku: 'KIT-1', name: 'Kit Café Especial', qty: 1, unit_price_cents: 15000 }],
          shipping_cents: 0,
          total_cents: 15000,
          status: 'cancelado',
          created_at: '2026-11-11T11:00:00Z',
        },
      ];
      fs.writeFileSync(path.join(tmpDir, 'orders.json'), JSON.stringify(sampleOrders, null, 2), 'utf8');

      const deps = createRouteDeps(tmpDir, { business: { name: 'Torrefação Serra' } });
      const req = makeMockReq('POST', '/api/ai/spreadsheet/catalog-orders', {});
      const res = makeMockRes();

      const handled = await handleSpreadsheetRoutes(req, res, deps);
      assert.equal(handled, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.summary.totalPedidos, 3);
      assert.equal(res.body.summary.pedidosCancelados, 1);
      assert.equal(res.body.summary.conversoesD1Wpp, 1);
      assert.equal(res.body.summary.balcaoManual, 1);
      assert.equal(res.body.summary.faturamentoLiquidoCents, 36490);
      assert.equal(res.body.catalogedOrders[0].contaNoD1, true);
      assert.equal(res.body.catalogedOrders[0].prioridadeIA, 'Alta');
      assert.equal(res.body.catalogedOrders[1].contaNoD1, false);
      assert.equal(res.body.catalogedOrders[1].canalOrigem, 'Balcão Manual');

      const multiSheetBytes = Buffer.from(res.body.xlsxBase64, 'base64');
      const parsed = await parseUniversalSpreadsheet(new Uint8Array(multiSheetBytes), res.body.filename);
      assert.equal(parsed.format, 'xlsx');
      assert.deepEqual(
        parsed.sheets.map(s => s.name),
        ['Pedidos_Catalogados', 'Resumo_D1_e_Canais', 'Produtos_Mais_Vendidos']
      );
      assert.equal(parsed.sheets[0].rows.length, 3);
      assert.equal(parsed.sheets[2].rows[0][0], 'Kit Café Especial');
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
