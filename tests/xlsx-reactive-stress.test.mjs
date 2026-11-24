import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  buildXlsxUint8Array,
  parseUniversalSpreadsheet,
} from '../src/utils/xlsx-io.ts';
import { transformCatalogData } from '../server/ai-spreadsheet-engine.mjs';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAJklEQVR42mNgYmD4z8DAwMQABIz///9nYGRkZGBkAAHGBkZGhgEAAQYFAwE26jUAAAAASUVORK5CYII=';

async function buildXlsxWithEmbeddedImage() {
  const baseBytes = await buildXlsxUint8Array([
    {
      name: 'Produtos_Fotos',
      headers: ['SKU', 'Produto', 'Preço', 'Categoria'],
      rows: [
        ['PAP-10', 'Caderno Capa Couro A5', 'R$ 79,90', 'Cadernos'],
        ['PAP-20', 'Caneta Tinteiro Dourada', 'R$ 129,00', 'Escrita'],
      ],
    },
  ]);

  const zip = await JSZip.loadAsync(baseBytes);
  zip.file('xl/media/image1.png', Buffer.from(TINY_PNG_B64, 'base64'));
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdDraw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
    </Relationships>`,
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
    </Relationships>`,
  );
  zip.file(
    'xl/drawings/drawing1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/spreadsheetml/2006/drawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <xdr:twoCellAnchor>
        <xdr:from><xdr:col>0</xdr:col><xdr:row>1</xdr:row></xdr:from>
        <xdr:to><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:to>
        <xdr:pic>
          <xdr:blipFill><a:blip r:embed="rIdImg1"/></xdr:blipFill>
        </xdr:pic>
      </xdr:twoCellAnchor>
    </xdr:wsDr>`,
  );

  return zip.generateAsync({ type: 'uint8array' });
}

describe('Reactive Spreadsheet Stress Suite (Failure Cases, Batching & Embedded Media)', () => {
  it('1. Rejects completely empty or separator-only spreadsheet with EMPTY_OR_UNREADABLE', async () => {
    const res = await transformCatalogData({
      filename: 'vazia.csv',
      rawText: '\n\n   \n',
    });
    assert.equal(res.ok, false);
    assert.equal(res.reactiveCode, 'EMPTY_OR_UNREADABLE');
  });

  it('2. Detects financial DRE / cashflow spreadsheet cleanly with NON_CATALOG_FINANCIAL_SHEET', async () => {
    const res = await transformCatalogData({
      filename: 'fluxo_caixa_novembro.csv',
      rawText: [
        'Data;Descricao_Lancamento;Receita;Despesa;Saldo;Boleto_Ref',
        '01/11/2026;Aluguel Loja;;3500,00;-3500,00;BOL-01',
        '02/11/2026;Energia Eletrica;;420,00;-3920,00;BOL-02',
      ].join('\n'),
    });
    assert.equal(res.ok, false);
    assert.equal(res.reactiveCode, 'NON_CATALOG_FINANCIAL_SHEET');
    assert.match(res.error, /financeira\/fluxo de caixa/i);
  });

  it('3. Detects arbitrary non-catalog columns with NO_CATALOG_ITEMS_FOUND', async () => {
    const res = await transformCatalogData({
      filename: 'funcionarios.csv',
      rawText: 'Matricula;Colaborador;Cargo;Setor\n101;Ana Silva;Atendente;Balcao\n102;Joao Lima;Gerente;Loja',
    });
    assert.equal(res.ok, false);
    assert.equal(res.reactiveCode, 'NO_CATALOG_ITEMS_FOUND');
  });

  it('4. Warns and caps batch at 120 items with EXCEEDS_BATCH_LIMIT when sheet has 250 items', async () => {
    const lines = ['Produto;Categoria;Preco'];
    for (let i = 1; i <= 250; i += 1) {
      lines.push(`Item Catalogo ${i};Geral;${(19 + (i % 50)).toFixed(2).replace('.', ',')}`);
    }
    const res = await transformCatalogData({
      filename: 'catalogo_grande.csv',
      rawText: lines.join('\n'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.reactiveCode, 'EXCEEDS_BATCH_LIMIT');
    assert.equal(res.totalRowsInSheet, 250);
    assert.equal(res.products.length, 120);
    assert.equal(res.truncatedCount, 130);
    assert.match(res.warning, /250 itens/);
  });

  it('5. Extracts embedded binary .xlsx images (xl/media + xl/drawings) in BOTH client xlsx-io & server engine', async () => {
    const xlsxBytes = await buildXlsxWithEmbeddedImage();
    const clientParsed = await parseUniversalSpreadsheet(xlsxBytes, 'catalogo_com_fotos.xlsx');
    assert.equal(clientParsed.sheets.length, 1);
    assert.ok(clientParsed.sheets[0].imagesByRow?.[0]?.startsWith('data:image/png;base64,'));

    const serverRes = await transformCatalogData({
      filename: 'catalogo_com_fotos.xlsx',
      base64Content: Buffer.from(xlsxBytes).toString('base64'),
    });
    assert.equal(serverRes.ok, true);
    assert.equal(serverRes.imageStats.embeddedImagesCount, 1);
    assert.ok(serverRes.products[0].imageUrl.startsWith('data:image/png;base64,'));
    assert.equal(serverRes.products[0].approvedAsset, true);
  });

  it('6. Accepts public HTTPS image URLs while rejecting unsafe local desktop paths', async () => {
    const csv = [
      'Produto;Preco;Foto_URL',
      'Cesta Cafe Premium;189,90;https://cdn.example.com/cesta.jpg',
      'Caderno Polido;49,90;C:\\Users\\arthur\\Desktop\\caderno.png',
      'Planner Desk;64,90;file:///C:/fotos/planner.webp',
    ].join('\n');

    const res = await transformCatalogData({ filename: 'fotos_links.csv', rawText: csv });
    assert.equal(res.ok, true);
    assert.equal(res.imageStats.publicImageUrlsCount, 1);
    assert.equal(res.imageStats.invalidImageUrlsCount, 2);
    assert.equal(res.products[0].imageUrl, 'https://cdn.example.com/cesta.jpg');
    assert.equal(res.products[1].imageUrl, undefined);
    assert.equal(res.products[2].imageUrl, undefined);
  });

  it('7. Skips single-cell decorative title row above real table headers', async () => {
    const bytes = await buildXlsxUint8Array([
      {
        name: 'Tabela_Fornecedor',
        headers: ['TABELA ATACADO NOVEMBRO 2026', '', ''],
        rows: [
          ['Produto', 'Categoria', 'Preco_Venda'],
          ['Vela Lavanda 180g', 'Aromas', '59,90'],
          ['Difusor Bamboo 200ml', 'Aromas', '74,90'],
        ],
      },
    ]);

    const res = await transformCatalogData({
      filename: 'fornecedor_banner.xlsx',
      base64Content: Buffer.from(bytes).toString('base64'),
    });
    assert.equal(res.ok, true);
    assert.equal(res.products.length, 2);
    assert.equal(res.products[0].name, 'Vela Lavanda 180g');
    assert.equal(res.products[0].priceCents, 5990);
  });

  it('8. Generates contextual post-analysis clarifyingQuestions tailored to catalog & missing photos', async () => {
    const res = await transformCatalogData({
      filename: 'sem_fotos.csv',
      rawText: 'Produto;Categoria;Valor\nKit Lavanda;Presentes;99,90\nSabonete Argila;Banho;24,90',
    });
    assert.equal(res.ok, true);
    assert.ok(Array.isArray(res.clarifyingQuestions));
    const ids = res.clarifyingQuestions.map(q => q.id);
    assert.ok(ids.includes('flagship_sku'));
    assert.ok(ids.includes('missing_photos'));
    assert.ok(ids.includes('brand_voice'));
  });
});
