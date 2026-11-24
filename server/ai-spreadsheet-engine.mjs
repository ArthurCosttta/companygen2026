import path from 'node:path';
import JSZip from 'jszip';
import { buildDefaultMensagemMoldeServer } from './sync-engine.mjs';
import { callGlm53Json } from './storefront-molde-fs.mjs';
import { normalizeSpreadsheetItemType } from '../shared/formula-ir/composer-schema.mjs';
import {
  buildRecommendedPagesForProfile,
  buildWorkspaceWhatsappFlows,
  classifyBusinessArchetype,
  extractSpreadsheetSignals,
} from '../shared/formula-ir/spreadsheet-intelligence.mjs';

function inferItemTypeForSpreadsheetRow({
  rawType = '',
  name = '',
  category = '',
  description = '',
  defaultBusinessModel = 'produtos',
  sourceHint = '',
}) {
  return normalizeSpreadsheetItemType({
    rawType,
    name,
    category,
    description,
    defaultBusinessModel,
    sourceHint,
  });
}

function escapeXml(raw) {
  const cleaned = String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeEntities(raw) {
  return String(raw ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function sanitizeSheetName(raw, fallbackIndex, used) {
  const base =
    (String(raw || '') || `Planilha_${fallbackIndex}`)
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || `Planilha_${fallbackIndex}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const tag = `_${suffix}`;
    candidate = `${base.slice(0, 31 - tag.length)}${tag}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function indexToColLetter(colIndex) {
  let n = colIndex + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colRefToIndex(ref) {
  const letters = String(ref || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

function parseAttrs(attrString) {
  const attrs = {};
  const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = attrRe.exec(attrString)) !== null) {
    attrs[m[1]] = unescapeEntities(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

function rowsToSheet(name, matrix, rawRowNums) {
  const indexedRows = matrix
    .map((row, idx) => ({
      cells: row.map(cell => String(cell ?? '').trim()),
      excelRowZero: rawRowNums && Number.isInteger(rawRowNums[idx]) ? rawRowNums[idx] : idx,
    }))
    .filter(item => item.cells.some(cell => cell.length > 0));
  if (!indexedRows.length) return null;

  let headerIdx = 0;
  const countNonEmpty = r => r.filter(Boolean).length;
  if (indexedRows.length >= 2 && countNonEmpty(indexedRows[0].cells) === 1) {
    const better = indexedRows.slice(1, 5).findIndex(it => countNonEmpty(it.cells) >= 2);
    if (better >= 0) headerIdx = better + 1;
  }

  const sliceRows = indexedRows.slice(headerIdx);
  const maxCols = Math.max(...sliceRows.map(r => r.cells.length), 1);
  const pad = row => Array.from({ length: maxCols }, (_, idx) => row[idx] ?? '');
  const [headerItem, ...dataItems] = sliceRows;
  return {
    name,
    headers: pad(headerItem.cells).map((h, idx) => h || `Coluna_${idx + 1}`),
    rows: dataItems.map(d => pad(d.cells)),
    _excelRowByDataRow: dataItems.map(d => d.excelRowZero),
  };
}

export async function buildXlsxUint8Array(sheets) {
  const effectiveSheets =
    Array.isArray(sheets) && sheets.length > 0 ? sheets : [{ name: 'Dados', headers: ['Coluna'], rows: [] }];

  const zip = new JSZip();
  const sharedStrings = [];
  const sharedIndexMap = new Map();

  const registerSharedString = value => {
    const existing = sharedIndexMap.get(value);
    if (existing !== undefined) return existing;
    const idx = sharedStrings.length;
    sharedStrings.push(value);
    sharedIndexMap.set(value, idx);
    return idx;
  };

  const usedNames = new Set();
  const normalizedSheets = effectiveSheets.map((sheet, idx) => ({
    name: sanitizeSheetName(sheet.name, idx + 1, usedNames),
    headers: (sheet.headers || []).map(h => String(h ?? '')),
    rows: sheet.rows || [],
  }));

  const worksheetXmls = [];
  for (const sheet of normalizedSheets) {
    const colCount = Math.max(sheet.headers.length, ...sheet.rows.map(r => r.length), 1);
    const colWidths = Array.from({ length: colCount }, (_, colIdx) => {
      const headerLen = (sheet.headers[colIdx] || '').length;
      const maxRowLen = sheet.rows.reduce(
        (max, row) => Math.max(max, String(row[colIdx] ?? '').length),
        8
      );
      return Math.min(48, Math.max(12, Math.max(headerLen, maxRowLen) + 4));
    });

    const colsXml = `<cols>${colWidths
      .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
      .join('')}</cols>`;

    const rowXmlParts = [];
    const headerCells = sheet.headers.map((headerText, colIdx) => {
      const ref = `${indexToColLetter(colIdx)}1`;
      const sIdx = registerSharedString(headerText);
      return `<c r="${ref}" t="s" s="1"><v>${sIdx}</v></c>`;
    });
    rowXmlParts.push(`<row r="1" ht="24" customHeight="1">${headerCells.join('')}</row>`);

    sheet.rows.forEach((row, rowIdx) => {
      const excelRowNum = rowIdx + 2;
      const cellParts = [];
      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const val = row[colIdx];
        if (val === undefined || val === null || val === '') continue;
        const ref = `${indexToColLetter(colIdx)}${excelRowNum}`;
        if (typeof val === 'number' && Number.isFinite(val)) {
          cellParts.push(`<c r="${ref}" s="0"><v>${val}</v></c>`);
        } else {
          const sIdx = registerSharedString(String(val));
          cellParts.push(`<c r="${ref}" t="s" s="0"><v>${sIdx}</v></c>`);
        }
      }
      if (cellParts.length > 0) {
        rowXmlParts.push(`<row r="${excelRowNum}">${cellParts.join('')}</row>`);
      }
    });

    const lastColLetter = indexToColLetter(Math.max(0, colCount - 1));
    const lastRowNum = Math.max(1, sheet.rows.length + 1);
    worksheetXmls.push(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<dimension ref="A1:${lastColLetter}${lastRowNum}"/>` +
        `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        colsXml +
        `<sheetData>${rowXmlParts.join('')}</sheetData>` +
        `</worksheet>`
    );
  }

  const sheetOverrides = normalizedSheets
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
      sheetOverrides +
      `</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  const workbookSheetsXml = normalizedSheets
    .map(
      (sheet, idx) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('');

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${workbookSheetsXml}</sheets>` +
      `</workbook>`
  );

  const sheetRelsXml = normalizedSheets
    .map(
      (_, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('');
  const stylesRelId = `rId${normalizedSheets.length + 1}`;
  const stringsRelId = `rId${normalizedSheets.length + 2}`;

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheetRelsXml +
      `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="${stringsRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
      `</Relationships>`
  );

  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2">` +
      `<font><sz val="11"/><color rgb="FF18181B"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF18181B"/><bgColor indexed="64"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="2">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="FF27272A"/></bottom><diagonal/></border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
      `</cellXfs>` +
      `</styleSheet>`
  );

  const siXml = sharedStrings
    .map(str => {
      const escaped = escapeXml(str);
      const needsPreserve = /^\s|\s$/.test(str);
      return `<si><t${needsPreserve ? ' xml:space="preserve"' : ''}>${escaped}</t></si>`;
    })
    .join('');

  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
      siXml +
      `</sst>`
  );

  worksheetXmls.forEach((xml, idx) => {
    zip.file(`xl/worksheets/sheet${idx + 1}.xml`, xml);
  });

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function parseSharedStringsXml(xml) {
  const strings = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1].replace(/<rPh[\s\S]*?<\/rPh>/gi, '');
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
    let text = '';
    let tMatch;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += unescapeEntities(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

function parseWorksheetXml(xml, sharedStrings, sheetName) {
  const matrix = [];
  const rawRowNums = [];
  const rowRegex = /<row(\s[^>]*)?>([\s\S]*?)<\/row>/gi;
  let rowMatch;
  let seqRowZero = 0;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowAttrs = parseAttrs(rowMatch[1] || '');
    const explicitRowNum = rowAttrs.r ? Number(rowAttrs.r) - 1 : seqRowZero;
    const rowZero = Number.isFinite(explicitRowNum) && explicitRowNum >= 0 ? explicitRowNum : seqRowZero;
    seqRowZero = rowZero + 1;
    const rowBody = rowMatch[2];
    const rowCells = [];
    const cellRegex = /<c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/gi;
    let cellMatch;
    let seqCol = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = parseAttrs(cellMatch[1] || '');
      const body = cellMatch[2] || '';
      const colIdx = attrs.r ? colRefToIndex(attrs.r) : seqCol;
      seqCol = colIdx + 1;

      const type = attrs.t || '';
      let value = '';
      if (type === 's') {
        const vMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i);
        const sIdx = vMatch ? Number(vMatch[1].trim()) : -1;
        value = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
      } else if (type === 'inlineStr') {
        const tParts = [];
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
        let tm;
        while ((tm = tRe.exec(body)) !== null) {
          tParts.push(unescapeEntities(tm[1]));
        }
        value = tParts.join('');
      } else {
        const vMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i);
        if (vMatch) {
          value = unescapeEntities(vMatch[1].trim());
          if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        }
      }

      while (rowCells.length <= colIdx) rowCells.push('');
      rowCells[colIdx] = value;
    }

    if (rowCells.some(c => c.trim().length > 0)) {
      matrix.push(rowCells);
      rawRowNums.push(rowZero);
    }
  }

  return rowsToSheet(sheetName, matrix, rawRowNums);
}

function guessImageMimeFromPath(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return null;
}

async function extractWorksheetEmbeddedImages(zip, sheetPath) {
  const byExcelRowZero = new Map();
  const normalizedSheetPath = String(sheetPath || '').replace(/^\/+/, '');
  const sheetDir = normalizedSheetPath.split('/').slice(0, -1).join('/');
  const sheetFile = normalizedSheetPath.split('/').pop() || '';
  const sheetRelsPath = `${sheetDir}/_rels/${sheetFile}.rels`;

  const drawingPaths = [];
  const sheetRelsFile = zip.file(sheetRelsPath);
  if (sheetRelsFile) {
    const relsXml = await sheetRelsFile.async('string');
    const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
    let rm;
    while ((rm = relRegex.exec(relsXml)) !== null) {
      const attrs = parseAttrs(rm[1]);
      if (attrs.Target && /drawing/i.test(attrs.Target)) {
        const clean = attrs.Target.replace(/^\.\.\//, 'xl/').replace(/^\/+/, '');
        drawingPaths.push(clean.startsWith('xl/') ? clean : `xl/${clean}`);
      }
    }
  }

  for (const drawingPath of drawingPaths) {
    const drawingFile = zip.file(drawingPath);
    if (!drawingFile) continue;
    const drawingXml = await drawingFile.async('string');
    const drawingDir = drawingPath.split('/').slice(0, -1).join('/');
    const drawingName = drawingPath.split('/').pop() || '';
    const drawingRelsFile = zip.file(`${drawingDir}/_rels/${drawingName}.rels`);
    const embedToMedia = new Map();
    if (drawingRelsFile) {
      const dRelsXml = await drawingRelsFile.async('string');
      const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
      let rm;
      while ((rm = relRegex.exec(dRelsXml)) !== null) {
        const attrs = parseAttrs(rm[1]);
        if (attrs.Id && attrs.Target) {
          const clean = attrs.Target.replace(/^\.\.\//, 'xl/').replace(/^\/+/, '');
          embedToMedia.set(attrs.Id, clean.startsWith('xl/') ? clean : `xl/${clean}`);
        }
      }
    }

    const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/gi;
    let am;
    while ((am = anchorRe.exec(drawingXml)) !== null) {
      const block = am[1];
      const rowMatch = block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/i);
      const blipMatch = block.match(/<a:blip[^>]*r:embed=["']([^"']+)["']/i);
      if (!rowMatch || !blipMatch) continue;
      const excelRowZero = Number(rowMatch[1]);
      const mediaPath = embedToMedia.get(blipMatch[1]);
      if (!mediaPath) continue;
      const mediaFile = zip.file(mediaPath);
      const mime = guessImageMimeFromPath(mediaPath);
      if (!mediaFile || !mime) continue;
      const b64 = await mediaFile.async('base64');
      if (b64 && !byExcelRowZero.has(excelRowZero)) {
        byExcelRowZero.set(excelRowZero, `data:${mime};base64,${b64}`);
      }
    }
  }

  return byExcelRowZero;
}

export async function parseUniversalSpreadsheet(input, filename) {
  if (typeof input !== 'string') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const isPkZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (isPkZip || (filename || '').toLowerCase().endsWith('.xlsx')) {
      const zip = await JSZip.loadAsync(bytes);
      const sharedStringsFile = zip.file('xl/sharedStrings.xml');
      const sharedStrings = sharedStringsFile
        ? parseSharedStringsXml(await sharedStringsFile.async('string'))
        : [];

      const relsMap = new Map();
      const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');
      if (workbookRelsFile) {
        const relsXml = await workbookRelsFile.async('string');
        const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
        let relMatch;
        while ((relMatch = relRegex.exec(relsXml)) !== null) {
          const attrs = parseAttrs(relMatch[1]);
          if (attrs.Id && attrs.Target) {
            const normalizedTarget = attrs.Target.replace(/^\/+/, '');
            relsMap.set(
              attrs.Id,
              normalizedTarget.startsWith('xl/') ? normalizedTarget : `xl/${normalizedTarget}`
            );
          }
        }
      }

      const orderedEntries = [];
      const workbookFile = zip.file('xl/workbook.xml');
      if (workbookFile) {
        const wbXml = await workbookFile.async('string');
        const sheetTagRe = /<sheet\s+([^>]+?)\/?>/gi;
        let sMatch;
        while ((sMatch = sheetTagRe.exec(wbXml)) !== null) {
          const attrs = parseAttrs(sMatch[1]);
          const resolvedPath = relsMap.get(attrs['r:id'] || '');
          if (resolvedPath && zip.file(resolvedPath)) {
            orderedEntries.push({
              name: attrs.name || `Planilha_${orderedEntries.length + 1}`,
              path: resolvedPath,
            });
          }
        }
      }

      if (!orderedEntries.length) {
        Object.keys(zip.files)
          .filter(p => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .forEach((p, idx) => orderedEntries.push({ name: `Planilha_${idx + 1}`, path: p }));
      }

      const sheets = [];
      for (const entry of orderedEntries) {
        const file = zip.file(entry.path);
        if (!file) continue;
        const parsed = parseWorksheetXml(await file.async('string'), sharedStrings, entry.name);
        if (!parsed) continue;
        const embeddedMap = await extractWorksheetEmbeddedImages(zip, entry.path);
        const imagesByRow = {};
        if (embeddedMap.size > 0 && Array.isArray(parsed._excelRowByDataRow)) {
          parsed._excelRowByDataRow.forEach((excelRowZero, dataIdx) => {
            const uri = embeddedMap.get(excelRowZero);
            if (uri) imagesByRow[dataIdx] = uri;
          });
        }
        sheets.push({
          name: parsed.name,
          headers: parsed.headers,
          rows: parsed.rows,
          ...(Object.keys(imagesByRow).length > 0 ? { imagesByRow } : {}),
        });
      }
      return { format: 'xlsx', sheets };
    }

    return parseUniversalSpreadsheet(Buffer.from(bytes).toString('utf8'), filename);
  }

  const trimmed = input.trim();
  if (
    trimmed.startsWith('UEsDB') ||
    /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/i.test(trimmed)
  ) {
    const cleanB64 = trimmed.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    const bytes = new Uint8Array(Buffer.from(cleanB64, 'base64'));
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return parseUniversalSpreadsheet(bytes, filename);
    }
  }

  const cleanText = input.replace(/^\uFEFF/, '');
  if (/<Workbook[\s>]/i.test(cleanText) && /<Row[\s>]/i.test(cleanText)) {
    const sheets = [];
    const wsRegex = /<Worksheet(?:\s([^>]*))?>([\s\S]*?)<\/Worksheet>/gi;
    let wsMatch;
    let count = 0;
    while ((wsMatch = wsRegex.exec(cleanText)) !== null) {
      count += 1;
      const wsAttrs = parseAttrs(wsMatch[1] || '');
      const matrix = [];
      const rowRe = /<Row(?:\s[^>]*)?>([\s\S]*?)<\/Row>/gi;
      let rMatch;
      while ((rMatch = rowRe.exec(wsMatch[2])) !== null) {
        const rowCells = [];
        const cellRe = /<Cell(?:\s([^>]*))?(?:\/>|>([\s\S]*?)<\/Cell>)/gi;
        let cMatch;
        let seqCol = 0;
        while ((cMatch = cellRe.exec(rMatch[1])) !== null) {
          const attrs = parseAttrs(cMatch[1] || '');
          const explicitIdx = attrs['ss:Index'] || attrs.Index;
          const colIdx = explicitIdx ? Math.max(0, Number(explicitIdx) - 1) : seqCol;
          seqCol = colIdx + 1;
          const dataMatch = (cMatch[2] || '').match(/<Data(?:\s[^>]*)?>([\s\S]*?)<\/Data>/i);
          const val = dataMatch ? unescapeEntities(dataMatch[1].replace(/<[^>]+>/g, '')) : '';
          while (rowCells.length <= colIdx) rowCells.push('');
          rowCells[colIdx] = val;
        }
        if (rowCells.some(c => c.trim().length > 0)) matrix.push(rowCells);
      }
      const parsed = rowsToSheet(wsAttrs['ss:Name'] || wsAttrs.Name || `Planilha_${count}`, matrix);
      if (parsed) sheets.push(parsed);
    }
    return { format: 'xls-xml', sheets };
  }

  if (/<table[\s>]/i.test(cleanText) && /<tr[\s>]/i.test(cleanText)) {
    const html = cleanText
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [html];
    const sheets = [];
    tables.forEach((tbl, idx) => {
      const matrix = [];
      const trRe = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRe.exec(tbl)) !== null) {
        const rowCells = [];
        const cellRe = /<(?:th|td)(?:\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
        let cMatch;
        while ((cMatch = cellRe.exec(trMatch[1])) !== null) {
          rowCells.push(unescapeEntities(cMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
        }
        if (rowCells.some(c => c.length > 0)) matrix.push(rowCells);
      }
      const parsed = rowsToSheet(`Planilha_${idx + 1}`, matrix);
      if (parsed) sheets.push(parsed);
    });
    return { format: 'xls-html', sheets };
  }

  // CSV / TSV delimited fallback
  const sampleLines = cleanText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 5);
  let delim = (filename || '').toLowerCase().endsWith('.tsv') ? '\t' : ',';
  if (!(filename || '').toLowerCase().endsWith('.tsv')) {
    let bestScore = -1;
    for (const candidate of [';', '\t', ',']) {
      const counts = sampleLines.map(line => {
        let inQuotes = false;
        let cnt = 0;
        for (let i = 0; i < line.length; i += 1) {
          if (line[i] === '"') inQuotes = !inQuotes;
          else if (line[i] === candidate && !inQuotes) cnt += 1;
        }
        return cnt;
      });
      const total = counts.reduce((a, b) => a + b, 0);
      const min = counts.length ? Math.min(...counts) : 0;
      const score = (min > 0 ? 100 : 0) + total;
      if (score > bestScore && total > 0) {
        bestScore = score;
        delim = candidate;
      }
    }
  }

  const matrix = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    if (ch === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && cleanText[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some(c => c.trim().length > 0)) matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some(c => c.trim().length > 0)) matrix.push(row);
  }
  const sheet = rowsToSheet('Dados', matrix);
  return {
    format: delim === '\t' ? 'tsv' : 'csv',
    sheets: sheet ? [sheet] : [],
  };
}

export function parsePriceToCents(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.round(raw * 100);
  }
  const str = String(raw ?? '').trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^\d.,-]/g, '');
  if (!cleaned || cleaned === '-') return 0;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;

  if (hasComma && hasDot) {
    normalized =
      cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned) && !/^0\.\d+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function formatBRL(cents) {
  const safe = Number.isFinite(cents) ? cents : 0;
  return `R$ ${(safe / 100).toFixed(2).replace('.', ',')}`;
}

function normalizeHeaderKey(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function fuzzyMatchCatalogColumns(headers) {
  const normalized = headers.map(normalizeHeaderKey);
  const findCol = patterns => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex(h => pattern.test(h));
      if (idx >= 0) return headers[idx];
    }
    return null;
  };

  return {
    nameCol: findCol([
      /\b(nome|produto|titulo|mercadoria|servico|cardapio|prato|name|title|product)\b/,
      /^(?!.*\b(id|cod|codigo|ref|sku)\b).*\b(peca|item|desc)\b/,
    ]),
    priceCol: findCol([/\b(preco|valor|price|unit|custo|venda|vlr|r)\b/]),
    categoryCol: findCol([/\b(categoria|grupo|departamento|linha|colecao|secao|category)\b/]),
    descriptionCol: findCol([/\b(descricao|detalhes|resumo|obs|observacao|especificacao|ingredientes|porcao|composicao|description)\b/]),
    variationCol: findCol([/\b(variacao|variacoes|tamanho|cor|sabor|modelo|grade|opcao|opcoes|peso|medida|variant)\b/]),
    skuCol: findCol([/\b(sku|codigo|cod|ref|referencia|ean|barcode)\b/, /\b(id_item|id)\b/]),
    stockCol: findCol([/\b(estoque|qtd|quantidade|saldo|disponivel|stock|qty)\b/]),
    imageCol: findCol([/\b(foto|imagem|image|thumb|miniatura|url_imagem|foto_url|link_foto|img)\b/]),
  };
}

const MAX_CATALOG_BATCH_ITEMS = 120;

function classifyNonCatalogHeaders(headers, deterministicCols) {
  const joined = headers.map(normalizeHeaderKey).join(' | ');
  const looksFinancial =
    /\b(receita|despesa|saldo|extrato|dre|contas a pagar|contas a receber|boleto|vencimento|fluxo de caixa|folha|imposto|irpf|pix enviado)\b/.test(
      joined,
    );
  const hasCatalogAnchor = Boolean(deterministicCols.nameCol && deterministicCols.priceCol);
  if (looksFinancial && !hasCatalogAnchor) {
    return {
      isNonCatalog: true,
      reactiveCode: 'NON_CATALOG_FINANCIAL_SHEET',
      message:
        'Identificamos uma planilha financeira/fluxo de caixa com colunas como [' +
        headers.slice(0, 4).join(', ') +
        '] e sem lista de produtos. Por favor, envie sua tabela de catálogo com Nome e Preço.',
    };
  }
  if (!deterministicCols.nameCol && !deterministicCols.priceCol) {
    return {
      isNonCatalog: true,
      reactiveCode: 'NO_CATALOG_ITEMS_FOUND',
      message:
        'Não encontramos colunas reconhecíveis de Nome do Produto e Preço nos cabeçalhos [' +
        headers.slice(0, 5).join(', ') +
        ']. Envie uma planilha de catálogo ou renomeie as colunas.',
    };
  }
  return { isNonCatalog: false };
}

function classifyImageCandidate(raw) {
  const val = String(raw || '').trim();
  if (!val) return { status: 'empty', url: '' };
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(val)) {
    return { status: 'embedded', url: val };
  }
  if (/^https?:\/\/[^\s"'<>]+/i.test(val)) {
    return { status: 'public_url', url: val };
  }
  if (/^(file:\/\/|[a-z]:\\|\/users\/|fakepath)/i.test(val) || /\.(png|jpe?g|webp)$/i.test(val)) {
    return { status: 'invalid_local_path', url: '' };
  }
  return { status: 'empty', url: '' };
}

function normalizeTextValue(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function buildSkuFromName(name, rowIndex) {
  const base = normalizeHeaderKey(name).replace(/\s+/g, '-').slice(0, 18).toUpperCase();
  return `${base || 'ITEM'}-${String(rowIndex + 1).padStart(3, '0')}`;
}

function findFirstPriceLikeColumnIndex(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows) || !rows.length) return -1;
  const sample = rows.slice(0, 10);
  for (let col = 0; col < headers.length; col += 1) {
    let priceHits = 0;
    for (const r of sample) {
      const cell = String(r?.[col] ?? '').trim();
      if (!cell) continue;
      if (/^(?:r\$\s*)?\d{1,6}(?:[.,]\d{2})?$/i.test(cell) || /r\$\s*\d+/i.test(cell)) {
        priceHits += 1;
      }
    }
    if (priceHits >= Math.max(1, Math.floor(sample.length / 2))) {
      return col;
    }
  }
  return -1;
}

async function inferCatalogMappingWithGlm({
  headers = [],
  sampleRows = [],
  storeName = '',
  filename = '',
  deterministicCols = {},
}) {
  if (!headers.length || !sampleRows.length) return null;
  const validHeader = (col) => (col && headers.includes(String(col)) ? String(col) : null);
  const compactSample = sampleRows.slice(0, 6).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      const val = String(row?.[i] ?? '').trim();
      if (val) obj[h] = val.slice(0, 80);
    });
    return obj;
  });

  const hasStrongDeterministic = Boolean(deterministicCols.nameCol && deterministicCols.priceCol);
  const timeoutMs = hasStrongDeterministic ? 9000 : 18000;

  try {
    const glm = await callGlm53Json({
      systemPrompt:
        'Você é Especialista em Engenharia de Dados e Catálogo de Lojas BR. Sua missão é ler cabeçalhos e amostras reais de QUALQUER planilha de produtos/serviços (inclusive planilhas desorganizadas de farmácias, oficinas, lojas, clínicas, distribuidoras ou restaurantes) e mapear exatamente para o esquema padrão do sistema. Retorne APENAS JSON válido.',
      userPrompt: JSON.stringify({
        filename: String(filename || '').slice(0, 80),
        storeName: String(storeName || '').slice(0, 80),
        headers,
        sampleRows: compactSample,
        instruction:
          'Responda JSON: {"isCatalogSheet":boolean,"rejectionReasonPt":string,"detectedNicheLabel":string,"columnMapping":{"nameCol":string|null,"priceCol":string|null,"categoryCol":string|null,"descriptionCol":string|null,"variationCol":string|null,"skuCol":string|null,"stockCol":string|null,"imageCol":string|null},"suggestedCategoryFixes":{}}. Use SOMENTE nomes exatos presentes em `headers` (ou null se ausente). Só marque isCatalogSheet=false se for claramente extrato financeiro, RH ou contas a pagar sem itens vendáveis.',
      }),
      maxTokens: 650,
      timeoutMs,
    });
    if (!glm?.ok || !glm?.data || typeof glm.data !== 'object') return null;
    const cm = glm.data.columnMapping && typeof glm.data.columnMapping === 'object' ? glm.data.columnMapping : {};
    const rawFixes =
      glm.data.suggestedCategoryFixes && typeof glm.data.suggestedCategoryFixes === 'object'
        ? glm.data.suggestedCategoryFixes
        : {};
    const cleanFixes = {};
    for (const [k, v] of Object.entries(rawFixes)) {
      if (k && typeof v === 'string' && v.trim()) cleanFixes[String(k)] = v.trim().slice(0, 48);
    }
    return {
      isCatalogSheet: glm.data.isCatalogSheet !== false,
      rejectionReasonPt: String(glm.data.rejectionReasonPt || '').trim(),
      detectedNicheLabel: String(glm.data.detectedNicheLabel || '').trim().slice(0, 80),
      columnMapping: {
        nameCol: validHeader(cm.nameCol),
        priceCol: validHeader(cm.priceCol),
        categoryCol: validHeader(cm.categoryCol),
        descriptionCol: validHeader(cm.descriptionCol),
        variationCol: validHeader(cm.variationCol),
        skuCol: validHeader(cm.skuCol),
        stockCol: validHeader(cm.stockCol),
        imageCol: validHeader(cm.imageCol),
      },
      suggestedCategoryFixes: cleanFixes,
    };
  } catch {
    return null;
  }
}

export async function transformCatalogData({
  filename,
  base64Content,
  rawText,
  headers: directHeaders,
  rows: directRows,
  businessModel = 'produtos',
  storeName = '',
  segment = '',
}) {
  let headers = Array.isArray(directHeaders) ? directHeaders.map(h => String(h ?? '').trim()) : [];
  let rows = Array.isArray(directRows)
    ? directRows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : []))
    : [];
  let imagesByRow = {};
  let extraSheets = [];
  let detectedFormat = 'csv';

  if ((!headers.length || !rows.length) && (base64Content || rawText)) {
    const source = base64Content
      ? new Uint8Array(
          Buffer.from(String(base64Content).replace(/^data:[^;]+;base64,/, ''), 'base64')
        )
      : String(rawText || '');
    const parsed = await parseUniversalSpreadsheet(source, filename);
    detectedFormat = parsed.format;
    if (parsed.sheets.length > 0) {
      headers = parsed.sheets[0].headers;
      rows = parsed.sheets[0].rows;
      imagesByRow = parsed.sheets[0].imagesByRow || {};
      extraSheets = parsed.sheets[1] ? parsed.sheets.slice(1) : [];
    }
  }

  if (!headers.length || !rows.length) {
    return {
      ok: false,
      reactiveCode: 'EMPTY_OR_UNREADABLE',
      error: 'Planilha vazia ou sem linhas de produtos legíveis. Verifique se a aba principal possui cabeçalho e itens.',
    };
  }

  const deterministicCols = fuzzyMatchCatalogColumns(headers);
  const nonCatalogCheck = classifyNonCatalogHeaders(headers, deterministicCols);
  if (nonCatalogCheck.isNonCatalog && nonCatalogCheck.reactiveCode === 'NON_CATALOG_FINANCIAL_SHEET') {
    return {
      ok: false,
      reactiveCode: nonCatalogCheck.reactiveCode,
      detectedHeaders: headers,
      error: nonCatalogCheck.message,
    };
  }

  const glmMapping = await inferCatalogMappingWithGlm({
    headers,
    sampleRows: rows.slice(0, 6),
    storeName,
    filename,
    deterministicCols,
  });

  if (glmMapping && glmMapping.isCatalogSheet === false && !deterministicCols.nameCol && !deterministicCols.priceCol) {
    return {
      ok: false,
      reactiveCode: 'NON_CATALOG_SHEET',
      detectedHeaders: headers,
      error:
        glmMapping.rejectionReasonPt ||
        nonCatalogCheck.message ||
        'A planilha enviada não parece conter um catálogo de produtos ou serviços.',
    };
  }

  const gCols = glmMapping?.columnMapping || {};
  const fallbackPriceIdx = !deterministicCols.priceCol && !gCols.priceCol ? findFirstPriceLikeColumnIndex(headers, rows) : -1;

  const finalMap = {
    nameCol: gCols.nameCol || deterministicCols.nameCol || null,
    priceCol: gCols.priceCol || deterministicCols.priceCol || (fallbackPriceIdx >= 0 ? headers[fallbackPriceIdx] : null),
    categoryCol: gCols.categoryCol || deterministicCols.categoryCol || null,
    descriptionCol: gCols.descriptionCol || deterministicCols.descriptionCol || null,
    variationCol: gCols.variationCol || deterministicCols.variationCol || null,
    skuCol: gCols.skuCol || deterministicCols.skuCol || null,
    stockCol: gCols.stockCol || deterministicCols.stockCol || null,
    imageCol: gCols.imageCol || deterministicCols.imageCol || null,
    suggestedCategoryFixes: glmMapping?.suggestedCategoryFixes || {},
  };

  if (!finalMap.nameCol && !finalMap.priceCol && headers.length >= 2) {
    // Última tentativa apenas se houver ao menos um nome de item claro na coluna 0
    const nonEmptyTextRows = rows.slice(0, 5).filter((r) => /[a-zA-ZÀ-ÿ]{3,}/.test(String(r?.[0] || '')));
    if (nonEmptyTextRows.length === 0) {
      return {
        ok: false,
        reactiveCode: nonCatalogCheck.reactiveCode || 'NO_CATALOG_ITEMS_FOUND',
        detectedHeaders: headers,
        error: nonCatalogCheck.message,
      };
    }
  }

  if (!finalMap.nameCol && headers.length > 0) {
    finalMap.nameCol = headers.find((h) => h !== finalMap.priceCol) || headers[0];
  }

  const idxOf = colName => (colName ? headers.indexOf(colName) : -1);
  const nameIdx = idxOf(finalMap.nameCol);
  const priceIdx = idxOf(finalMap.priceCol);
  const categoryIdx = idxOf(finalMap.categoryCol);
  const descriptionIdx = idxOf(finalMap.descriptionCol);
  const variationIdx = idxOf(finalMap.variationCol);
  const skuIdx = idxOf(finalMap.skuCol);
  const stockIdx = idxOf(finalMap.stockCol);
  const imageIdx = idxOf(finalMap.imageCol);
  const typeIdx = headers.findIndex(h => /^(tipo|item_?type|modalidade|formato)$/i.test(String(h || '').trim()));
  const durationIdx = headers.findIndex(h => /^(prazo|duracao|dura[cç][aã]o|tempo|entrega)$/i.test(String(h || '').trim()));

  const mappingUsedGlm = Boolean(glmMapping && Object.values(gCols).some(Boolean));
  const mappings = [
    { targetField: 'name', sourceColumn: finalMap.nameCol },
    { targetField: 'price', sourceColumn: finalMap.priceCol },
    { targetField: 'category', sourceColumn: finalMap.categoryCol },
    { targetField: 'description', sourceColumn: finalMap.descriptionCol },
    { targetField: 'variation', sourceColumn: finalMap.variationCol },
    { targetField: 'sku', sourceColumn: finalMap.skuCol },
    { targetField: 'stock', sourceColumn: finalMap.stockCol },
    { targetField: 'image', sourceColumn: finalMap.imageCol },
  ].map(entry => ({
    ...entry,
    sourceIndex: entry.sourceColumn ? headers.indexOf(entry.sourceColumn) : -1,
    detectedBy: mappingUsedGlm && Object.values(gCols).includes(entry.sourceColumn) ? 'ai-semantic' : 'deterministic',
  }));

  const validRowCount = rows.filter(r => {
    const nm = normalizeTextValue(nameIdx >= 0 ? r[nameIdx] : '');
    return Boolean(nm && !/^[-=_*]+$/.test(nm));
  }).length;
  const exceedsBatchLimit = validRowCount > MAX_CATALOG_BATCH_ITEMS;
  const rowsToProcess = rows.slice(0, MAX_CATALOG_BATCH_ITEMS);

  let embeddedImagesCount = 0;
  let publicImageUrlsCount = 0;
  let invalidImageUrlsCount = 0;

  const products = [];
  rowsToProcess.forEach((row, rowIdx) => {
    const name = normalizeTextValue(nameIdx >= 0 ? row[nameIdx] : '');
    if (!name || /^[-=_*]+$/.test(name)) return;

    const rawPrice = priceIdx >= 0 ? row[priceIdx] : '';
    const priceCents = parsePriceToCents(rawPrice);
    const rawCat = normalizeTextValue(categoryIdx >= 0 ? row[categoryIdx] : '');
    const fixedCat =
      (rawCat && finalMap.suggestedCategoryFixes[rawCat]) || rawCat || 'Geral';
    const description = normalizeTextValue(descriptionIdx >= 0 ? row[descriptionIdx] : '') || name;
    const rawVar = normalizeTextValue(variationIdx >= 0 ? row[variationIdx] : '');
    const variants = rawVar
      ? rawVar
          .split(/[,;|/]+/)
          .map(v => v.trim())
          .filter(Boolean)
      : [];
    const sku = normalizeTextValue(skuIdx >= 0 ? row[skuIdx] : '') || buildSkuFromName(name, rowIdx);
    const stockRaw = normalizeTextValue(stockIdx >= 0 ? row[stockIdx] : '');
    const stockParsed = stockRaw ? parseInt(stockRaw.replace(/\D/g, ''), 10) : NaN;
    const stockQty = Number.isFinite(stockParsed) ? stockParsed : 10;

    // Extract embedded .xlsx image or public cell image URL
    let resolvedImageUrl = '';
    if (imagesByRow[rowIdx]) {
      resolvedImageUrl = imagesByRow[rowIdx];
      embeddedImagesCount += 1;
    } else {
      const candidateCell =
        imageIdx >= 0
          ? row[imageIdx]
          : row.find(c => /^https?:\/\/[^\s"'<>]+/i.test(String(c || '').trim())) || '';
      const imgCheck = classifyImageCandidate(candidateCell);
      if (imgCheck.status === 'public_url') {
        resolvedImageUrl = imgCheck.url;
        publicImageUrlsCount += 1;
      } else if (imgCheck.status === 'embedded') {
        resolvedImageUrl = imgCheck.url;
        embeddedImagesCount += 1;
      } else if (imgCheck.status === 'invalid_local_path') {
        invalidImageUrlsCount += 1;
      }
    }

    const rawTypeVal = normalizeTextValue(typeIdx >= 0 ? row[typeIdx] : '');
    const prazoOuDuracao = normalizeTextValue(durationIdx >= 0 ? row[durationIdx] : '');
    const itemType = inferItemTypeForSpreadsheetRow({
      rawType: rawTypeVal,
      name,
      category: fixedCat,
      description,
      defaultBusinessModel: businessModel,
      sourceHint: filename,
    });
    const variationLabel = variants.length ? variants.join(' / ') : 'Padrão';
    const mensagemMolde = buildDefaultMensagemMoldeServer({
      name,
      variation: variationLabel,
      priceCents,
      itemType,
      prazoOuDuracao,
    });

    products.push({
      id: `${sku}-${rowIdx + 1}`.toLowerCase().replace(/[^a-z0-9-_]+/g, '-'),
      sku,
      name,
      category: fixedCat,
      price_cents: priceCents,
      priceCents,
      price_brl: formatBRL(priceCents),
      description,
      variants,
      variation: variationLabel,
      stock_qty: stockQty,
      stock: stockQty,
      itemType,
      prazoOuDuracao,
      itensInclusosKit: [],
      mensagemMolde,
      ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
      approvedAsset: true,
      active: true,
    });
  });

  if (products.length === 0) {
    return {
      ok: false,
      reactiveCode: 'NO_CATALOG_ITEMS_FOUND',
      detectedHeaders: headers,
      error: 'Nenhum produto válido foi extraído da planilha. Confira se os nomes não estão vazios.',
    };
  }

  const clarifyingQuestions = [
    {
      id: 'flagship_sku',
      question: `Dos ${products.length} itens importados, qual é o seu produto carro-chefe para destacarmos no topo?`,
      options: products.slice(0, 3).map(p => ({ label: p.name, value: p.sku })),
    },
    ...(embeddedImagesCount + publicImageUrlsCount === 0
      ? [
          {
            id: 'missing_photos',
            question:
              invalidImageUrlsCount > 0
                ? `Encontramos ${invalidImageUrlsCount} caminhos locais de arquivo (que não abrem na web). Deseja buscar fotos públicas ou gerar capas com IA?`
                : 'Sua planilha não trouxe links de imagens ou fotos embutidas. Como prefere ilustrar a vitrine?',
            options: [
              { label: 'Manter vitrine minimalista e subir fotos depois', value: 'clean_minimal' },
              { label: 'Gerar fotos de estúdio com IA sob demanda', value: 'generate_ai' },
            ],
          },
        ]
      : []),
    {
      id: 'brand_voice',
      question: 'Qual clima visual combina mais com o seu cliente?',
      options: [
        { label: 'Editorial & Minimalista', value: 'editorial_minimal' },
        { label: 'Artesanal & Acolhedor', value: 'warm_artisan' },
        { label: 'Direto & Alta Rotatividade Pix', value: 'bold_modern' },
      ],
    },
  ];

  const xlsxBytes = await buildXlsxUint8Array([
    {
      name: 'Catalogo_Padronizado',
      headers: [
        'SKU',
        'Nome',
        'Tipo_Item',
        'Categoria',
        'Preco_BRL',
        'Preco_Centavos',
        'Descricao',
        'Variacoes',
        'Estoque',
        'Prazo_Duracao',
        'Mensagem_Molde',
        'Ativo',
      ],
      rows: products.map(p => [
        p.sku,
        p.name,
        p.itemType,
        p.category,
        p.price_brl,
        p.price_cents,
        p.description,
        p.variants.join(', '),
        p.stock_qty,
        p.prazoOuDuracao,
        p.mensagemMolde,
        p.active ? 'Sim' : 'Não',
      ]),
    },
  ]);

  const productArchetype = classifyBusinessArchetype({
    segment: glmMapping?.detectedNicheLabel || segment || '',
    storeName: String(storeName || ''),
    headers,
    products,
  });
  const spreadsheetSignals = extractSpreadsheetSignals({
    headers,
    rows: rowsToProcess,
    products,
    extraSheets,
    business: { segment: String(glmMapping?.detectedNicheLabel || productArchetype.nicheLabel || segment || ''), name: String(storeName || '') },
  });
  const resolvedNicheLabel =
    productArchetype.archetype !== 'varejo_geral'
      ? productArchetype.nicheLabel
      : glmMapping?.detectedNicheLabel || spreadsheetSignals.nicheLabel;
  const simulatedProfile = {
    business: { name: String(storeName || 'Sua Loja'), segment: resolvedNicheLabel },
    catalog: { products },
  };
  const recommendedSubpages = buildRecommendedPagesForProfile(simulatedProfile).pages;
  const whatsappMessageFlows = buildWorkspaceWhatsappFlows({ profile: simulatedProfile });

  return {
    ok: true,
    reactiveCode: exceedsBatchLimit ? 'EXCEEDS_BATCH_LIMIT' : 'CATALOG_READY',
    ...(exceedsBatchLimit
      ? {
          warning: `Sua planilha possui ${validRowCount} itens, acima do limite de ${MAX_CATALOG_BATCH_ITEMS} por lote. Importamos os primeiros ${MAX_CATALOG_BATCH_ITEMS} itens para abrir a vitrine instantaneamente.`,
          totalRowsInSheet: validRowCount,
          truncatedCount: validRowCount - MAX_CATALOG_BATCH_ITEMS,
        }
      : { totalRowsInSheet: validRowCount, truncatedCount: 0 }),
    imageStats: {
      embeddedImagesCount,
      publicImageUrlsCount,
      invalidImageUrlsCount,
    },
    clarifyingQuestions,
    spreadsheetSignals,
    detectedSegment: resolvedNicheLabel,
    recommendedSubpages,
    whatsappMessageFlows,
    modelUsed: mappingUsedGlm ? 'zai-org/GLM-5.3' : 'deterministic-fuzzy-mapper',
    usedFallback: !mappingUsedGlm,
    format: detectedFormat,
    columnMapping: {
      ...finalMap,
      mappings,
    },
    totalRows: products.length,
    products,
    xlsxBase64: Buffer.from(xlsxBytes).toString('base64'),
    filename: 'catalogo_padronizado_companygen.xlsx',
  };
}

const ORDER_STATUS_LABEL = {
  aguardando: 'Aguardando',
  aguardando_dados: 'Aguardando dados',
  aguardando_pagamento: 'Aguardando pagamento',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  saiu_para_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function classifyOrderChannel(order) {
  const channelHints = `${order.channel || ''} ${order.source || ''} ${order.origin || ''} ${order.order_ref || ''}`;
  const jid = String(order.customer_jid || '');

  if (order.counted_in_d1 === false && /balc[aã]o|manual|pdv/i.test(channelHints)) {
    return { canalOrigem: 'Balcão Manual', contaNoD1: false };
  }
  if (/balc[aã]o|manual|pdv|presencial/i.test(channelHints)) {
    return { canalOrigem: 'Balcão Manual', contaNoD1: false };
  }
  if (
    order.counted_in_d1 === true ||
    /d1|whatsapp|wpp|bot/i.test(channelHints) ||
    /@(s\.whatsapp\.net|lid)/i.test(jid)
  ) {
    return { canalOrigem: 'WhatsApp D1', contaNoD1: true };
  }
  if (/site|vitrine|web|checkout/i.test(channelHints)) {
    return { canalOrigem: 'Vitrine Web', contaNoD1: false };
  }
  if (jid.replace(/\D/g, '').length >= 8) {
    return { canalOrigem: 'WhatsApp D1', contaNoD1: true };
  }
  return { canalOrigem: 'Balcão Manual', contaNoD1: false };
}

function deterministicOrderInsight(order, totalCents, canalOrigem) {
  const items = Array.isArray(order.items) ? order.items : [];
  const qtyTotal = items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 1), 0);
  const firstNames = items.map(i => String(i.name || '')).join(' ').toLowerCase();

  let categoriaIA = 'Pedido Padrão';
  if (/kit|combo|box|cesta/i.test(firstNames)) categoriaIA = 'Kit / Combo';
  else if (/consulta|agendamento|sessao|servico|atendimento|reserva/i.test(firstNames)) categoriaIA = 'Serviço / Agendamento';
  else if (totalCents >= 30_000) categoriaIA = 'Ticket Alto';
  else if (canalOrigem === 'Balcão Manual') categoriaIA = 'Venda Balcão';
  else if (canalOrigem === 'WhatsApp D1') categoriaIA = 'Conversão WhatsApp D1';

  let prioridadeIA = 'Baixa';
  if (order.status === 'cancelado') prioridadeIA = 'Baixa';
  else if (totalCents >= 25_000 || qtyTotal >= 4 || String(order.status || '').startsWith('aguardando')) prioridadeIA = 'Alta';
  else if (totalCents >= 8_000 || qtyTotal >= 2) prioridadeIA = 'Média';

  const itemDesc = items.map(i => `${Number(i.quantity ?? i.qty ?? 1)}x ${i.name}`).join(', ') || 'Item avulso';
  const resumoIA = `${canalOrigem}: ${itemDesc} (${formatBRL(totalCents)})`;
  return { categoriaIA, prioridadeIA, resumoIA };
}

export function computeOrdersDreSummary(orders = []) {
  const toCents = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  let grossRevenueCents = 0;
  let cmvCents = 0;
  let feesCents = 0;
  let lossesCents = 0;

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== 'object') continue;
    const status = String(order.status || '').toLowerCase();
    const orderTotalCents =
      typeof order.total_cents === 'number'
        ? Math.round(order.total_cents)
        : toCents(order.total ?? order.amount ?? 0);

    const isCancelled = status === 'cancelled' || status === 'cancelado';
    if (!isCancelled && !order.isOperationalLoss) {
      grossRevenueCents += Math.max(0, orderTotalCents);
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
          const unitCostCents =
            typeof item?.unit_cost_cents === 'number'
              ? Math.round(item.unit_cost_cents)
              : toCents(item?.unitCost ?? 0);
          cmvCents += Math.max(0, unitCostCents) * qty;
        }
      } else if (typeof order.cmv_cents === 'number' || order.unitCost !== undefined) {
        cmvCents += typeof order.cmv_cents === 'number' ? Math.round(order.cmv_cents) : toCents(order.unitCost);
      }
      feesCents +=
        typeof order.fee_cents === 'number' ? Math.max(0, Math.round(order.fee_cents)) : Math.max(0, toCents(order.feeAmount));
    }

    const explicitLossCents =
      typeof order.loss_cents === 'number' ? Math.max(0, Math.round(order.loss_cents)) : Math.max(0, toCents(order.lossAmount));
    lossesCents += explicitLossCents;
  }

  const netProfitCents = grossRevenueCents - cmvCents - feesCents - lossesCents;
  const marginPercent =
    grossRevenueCents > 0 ? Number(((netProfitCents / grossRevenueCents) * 100).toFixed(1)) : 0;

  return {
    grossRevenueCents,
    cmvCents,
    feesCents,
    lossesCents,
    netProfitCents,
    marginPercent,
  };
}

export async function catalogOrdersData(orders, profile) {
  const list = Array.isArray(orders) ? orders : [];
  const compactForAi = list.slice(0, 25).map((o, idx) => ({
    idx,
    ref: o.order_ref || o.id,
    status: o.status,
    total_cents: o.total_cents,
    items: (o.items || []).map(i => `${Number(i.quantity ?? i.qty ?? 1)}x ${i.name}`).join(', '),
  }));

  const businessName = profile?.business?.name || 'Loja CompanyGen';
  let glmOrdersMap = {};
  let glmOrdersModel = null;
  if (compactForAi.length > 0) {
    try {
      const glmRes = await callGlm53Json({
        systemPrompt:
          'Você é analista de pedidos e DRE de e-commerce BR. Para cada pedido enviado, classifique categoriaIA, prioridadeIA ("Alta"|"Média"|"Baixa") e resumoIA curto em Português. Retorne APENAS JSON válido.',
        userPrompt: JSON.stringify({
          storeName: businessName,
          orders: compactForAi,
          instruction:
            'Responda JSON no formato: { "classifications": { "<idx>": { "categoriaIA": string, "prioridadeIA": "Alta"|"Média"|"Baixa", "resumoIA": string } } }',
        }),
        maxTokens: 700,
        timeoutMs: 14000,
      });
      if (glmRes?.ok && glmRes?.data?.classifications && typeof glmRes.data.classifications === 'object') {
        glmOrdersMap = glmRes.data.classifications;
        glmOrdersModel = glmRes.model || 'zai-org/GLM-5.3';
      }
    } catch {}
  }

  const productStats = new Map();
  let faturamentoLiquidoCents = 0;
  let pedidosCancelados = 0;
  let conversoesD1Wpp = 0;
  let balcaoManual = 0;
  let vitrineWeb = 0;

  const catalogedOrders = list.map((order, idx) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const totalCents =
      Number.isFinite(Number(order.total_cents))
        ? Number(order.total_cents)
        : items.reduce(
            (sum, i) =>
              sum + Number(i.unitPriceCents ?? i.unit_price_cents ?? 0) * Number(i.quantity ?? i.qty ?? 1),
            0
          ) + Number(order.shipping_cents || 0);

    const { canalOrigem, contaNoD1 } = classifyOrderChannel(order);
    const statusKey = String(order.status || 'aguardando');
    const statusLabel = ORDER_STATUS_LABEL[statusKey] || statusKey;
    const isCancelled = statusKey === 'cancelado';

    if (isCancelled) {
      pedidosCancelados += 1;
    } else {
      faturamentoLiquidoCents += totalCents;
      if (contaNoD1) conversoesD1Wpp += 1;
      else if (canalOrigem === 'Balcão Manual') balcaoManual += 1;
      else vitrineWeb += 1;
    }

    if (!isCancelled) {
      for (const item of items) {
        const key = String(item.name || item.sku || 'Produto').trim();
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const rev = Number(item.unitPriceCents ?? item.unit_price_cents ?? 0) * qty;
        const curr = productStats.get(key) || { name: key, qty: 0, revenueCents: 0, orders: 0 };
        curr.qty += qty;
        curr.revenueCents += rev;
        curr.orders += 1;
        productStats.set(key, curr);
      }
    }

    const fallback = deterministicOrderInsight(order, totalCents, canalOrigem);
    const aiRow = glmOrdersMap[String(idx)];
    const rawPhone = String(order.customer_jid || '').replace(/@.*$/, '');

    return {
      orderRef: String(order.order_ref || order.id || `PED-${idx + 1}`),
      createdAt: String(order.created_at || new Date().toISOString()),
      customerName: String(order.customer_name || 'Cliente'),
      customerPhone: rawPhone || 'Sem telefone',
      itemsSummary: items.map(i => `${Number(i.quantity ?? i.qty ?? 1)}x ${i.name}`).join(' | ') || 'Sem itens',
      totalCents,
      totalBRL: formatBRL(totalCents),
      statusLabel,
      canalOrigem,
      contaNoD1,
      categoriaIA:
        typeof aiRow?.categoriaIA === 'string' && aiRow.categoriaIA.trim()
          ? aiRow.categoriaIA.trim()
          : fallback.categoriaIA,
      prioridadeIA:
        aiRow?.prioridadeIA === 'Alta' || aiRow?.prioridadeIA === 'Média' || aiRow?.prioridadeIA === 'Baixa'
          ? aiRow.prioridadeIA
          : fallback.prioridadeIA,
      resumoIA:
        typeof aiRow?.resumoIA === 'string' && aiRow.resumoIA.trim()
          ? aiRow.resumoIA.trim()
          : fallback.resumoIA,
    };
  });

  const activeCount = Math.max(1, catalogedOrders.length - pedidosCancelados);
  const summary = {
    totalPedidos: catalogedOrders.length,
    pedidosCancelados,
    faturamentoLiquidoCents,
    faturamentoLiquidoBRL: formatBRL(faturamentoLiquidoCents),
    conversoesD1Wpp,
    balcaoManual,
    vitrineWeb,
    ticketMedioBRL: formatBRL(Math.round(faturamentoLiquidoCents / activeCount)),
  };

  const topProducts = [...productStats.values()].sort((a, b) => b.revenueCents - a.revenueCents);
  const dreSummary = computeOrdersDreSummary(orders);

  const xlsxBytes = await buildXlsxUint8Array([
    {
      name: 'Pedidos_Catalogados',
      headers: [
        'Ref_Pedido',
        'Data',
        'Cliente',
        'Telefone',
        'Itens',
        'Valor_BRL',
        'Status',
        'Canal_Origem',
        'Conta_no_D1',
        'Categoria_IA',
        'Prioridade_IA',
        'Resumo_IA',
      ],
      rows: catalogedOrders.map(o => [
        o.orderRef,
        o.createdAt,
        o.customerName,
        o.customerPhone,
        o.itemsSummary,
        o.totalBRL,
        o.statusLabel,
        o.canalOrigem,
        o.contaNoD1 ? 'Sim' : 'Não',
        o.categoriaIA,
        o.prioridadeIA,
        o.resumoIA,
      ]),
    },
    {
      name: 'Resumo_D1_e_Canais',
      headers: ['Indicador', 'Valor', 'Observacao'],
      rows: [
        ['Total de Pedidos', summary.totalPedidos, 'Inclui todos os registros avaliados'],
        ['Pedidos Cancelados', summary.pedidosCancelados, 'Excluídos do faturamento líquido'],
        ['Faturamento Líquido', summary.faturamentoLiquidoBRL, 'Soma de pedidos ativos'],
        ['Conversões D1 WPP', summary.conversoesD1Wpp, 'Pedidos contabilizados no funil WhatsApp D1'],
        ['Balcão Manual', summary.balcaoManual, 'Pedidos manuais/PDV fora do funil D1'],
        ['Vitrine Web', summary.vitrineWeb, 'Checkout web direto'],
        ['Ticket Médio Líquido', summary.ticketMedioBRL, 'Por pedido não cancelado'],
      ],
    },
    {
      name: 'Produtos_Mais_Vendidos',
      headers: ['Produto', 'Quantidade_Vendida', 'Receita_BRL', 'Pedidos'],
      rows: topProducts.map(item => [
        item.name,
        item.qty,
        formatBRL(item.revenueCents),
        item.orders,
      ]),
    },
    {
      name: 'DRE_Financeiro',
      headers: ['Linha_DRE', 'Valor_BRL', 'Observacao'],
      rows: [
        ['Faturamento Bruto', formatBRL(dreSummary.grossRevenueCents), 'Pedidos válidos (não cancelados)'],
        ['(-) CMV / Custo dos Produtos', formatBRL(dreSummary.cmvCents), 'Custo unitário x quantidade'],
        ['(-) Taxas', formatBRL(dreSummary.feesCents), 'Taxas de gateway, Pix e entrega'],
        ['(-) Prejuízos / Estornos', formatBRL(dreSummary.lossesCents), 'Avarias, perdas ou estornos registrados'],
        ['(=) Lucro Líquido', formatBRL(dreSummary.netProfitCents), 'Faturamento - CMV - Taxas - Prejuízos'],
        ['Margem Líquida (%)', `${dreSummary.marginPercent.toFixed(1)}%`, 'Sobre o faturamento bruto'],
      ],
    },
  ]);

  return {
    ok: true,
    modelUsed: glmOrdersModel || 'deterministic-order-classifier',
    usedFallback: !glmOrdersModel,
    summary,
    dreSummary,
    catalogedOrders,
    xlsxBase64: Buffer.from(xlsxBytes).toString('base64'),
    filename: 'pedidos_catalogados_companygen.xlsx',
  };
}

export async function handleSpreadsheetRoutes(
  req,
  res,
  { user, directory, readJson, send, ApiError, loadProfileState, readJsonFile }
) {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/ai/spreadsheet/')) return false;

  if (!user?.id) {
    throw new ApiError(401, 'Sessão autenticada necessária para usar a engine de planilhas.');
  }

  if (req.method === 'POST' && pathname === '/api/ai/spreadsheet/transform-catalog') {
    const body = await readJson(req, 15 * 1024 * 1024);
    const profileState = await loadProfileState(user, directory).catch(() => null);
    const fallbackModel = profileState?.current?.data?.business?.businessModel || 'produtos';
    const result = await transformCatalogData({
      filename: body?.filename,
      base64Content: body?.base64Content,
      rawText: body?.rawText,
      headers: body?.headers,
      rows: body?.rows,
      businessModel: body?.businessModel || fallbackModel,
      storeName: body?.storeName || profileState?.current?.data?.business?.name || '',
      segment: body?.segment || '',
    });
    if (!result.ok) {
      throw new ApiError(400, result.error || 'Não foi possível transformar a planilha.');
    }
    send(res, 200, result);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/ai/spreadsheet/catalog-orders') {
    let body = {};
    try {
      body = await readJson(req, 5 * 1024 * 1024);
    } catch {
      body = {};
    }
    const profileState = await loadProfileState(user, directory);
    const profile = profileState?.current?.data || {};
    const storedOrders = await readJsonFile(path.join(directory, 'orders.json'), []);
    const orders = Array.isArray(body?.ordersOverride) ? body.ordersOverride : storedOrders;

    const result = await catalogOrdersData(orders, profile);
    send(res, 200, result);
    return true;
  }

  return false;
}
