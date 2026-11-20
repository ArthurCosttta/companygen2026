import path from 'node:path';
import JSZip from 'jszip';
import { buildDefaultMensagemMoldeServer } from './sync-engine.mjs';
import { normalizeSpreadsheetItemType } from '../shared/formula-ir/composer-schema.mjs';

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

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const PREFERRED_OLLAMA_MODELS = ['qwen3:4b-instruct', 'qwen3.5:4b'];
const OLLAMA_TIMEOUT_MS = 30_000;

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

function rowsToSheet(name, matrix) {
  const nonEmptyRows = matrix
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(cell => cell.length > 0));
  if (!nonEmptyRows.length) return null;

  const maxCols = Math.max(...nonEmptyRows.map(r => r.length), 1);
  const pad = row => Array.from({ length: maxCols }, (_, idx) => row[idx] ?? '');
  const [headerRow, ...dataRows] = nonEmptyRows;
  return {
    name,
    headers: pad(headerRow).map((h, idx) => h || `Coluna_${idx + 1}`),
    rows: dataRows.map(pad),
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
  const rowRegex = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowBody = rowMatch[1];
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

    if (rowCells.some(c => c.trim().length > 0)) matrix.push(rowCells);
  }

  return rowsToSheet(sheetName, matrix);
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
        if (parsed) sheets.push(parsed);
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
  };
}

async function callOllamaJson(prompt) {
  if (typeof fetch !== 'function') return { parsed: null, modelUsed: null };
  for (const model of PREFERRED_OLLAMA_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          keep_alive: '10m',
          options: { temperature: 0.15, num_predict: 260 },
        }),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const body = await response.json();
      const rawText = String(body?.response || '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        return { parsed, modelUsed: model };
      }
    } catch {
      // Fall back cleanly if Ollama is offline, refused, or timed out
    } finally {
      clearTimeout(timer);
    }
  }
  return { parsed: null, modelUsed: null };
}

function normalizeTextValue(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function buildSkuFromName(name, rowIndex) {
  const base = normalizeHeaderKey(name).replace(/\s+/g, '-').slice(0, 18).toUpperCase();
  return `${base || 'ITEM'}-${String(rowIndex + 1).padStart(3, '0')}`;
}

export async function transformCatalogData({
  filename,
  base64Content,
  rawText,
  headers: directHeaders,
  rows: directRows,
  businessModel = 'produtos',
}) {
  let headers = Array.isArray(directHeaders) ? directHeaders.map(h => String(h ?? '').trim()) : [];
  let rows = Array.isArray(directRows)
    ? directRows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : []))
    : [];
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
    }
  }

  if (!headers.length) {
    return { ok: false, error: 'Planilha vazia ou sem cabeçalho legível.' };
  }

  const deterministicCols = fuzzyMatchCatalogColumns(headers);
  const sampleRows = rows.slice(0, 5);

  const aiPrompt = [
    'Você é um engenheiro de dados de catálogo e-commerce.',
    'Mapeie EXATAMENTE os nomes de colunas fornecidos para o esquema semântico JSON:',
    '{ "nameCol": string|null, "priceCol": string|null, "categoryCol": string|null, "descriptionCol": string|null, "variationCol": string|null, "skuCol": string|null, "stockCol": string|null, "suggestedCategoryFixes": Record<string,string> }',
    `Cabeçalhos exatos: ${JSON.stringify(headers)}`,
    `Amostra (5 linhas): ${JSON.stringify(sampleRows)}`,
    'Responda apenas JSON válido sem explicações.',
  ].join('\n');

  const ollamaResult = await callOllamaJson(aiPrompt);
  const aiCols = ollamaResult.parsed || {};
  const validHeaderSet = new Set(headers);
  const pickHeader = (aiCandidate, deterministicCandidate) =>
    typeof aiCandidate === 'string' && validHeaderSet.has(aiCandidate)
      ? aiCandidate
      : deterministicCandidate;

  const finalMap = {
    nameCol: pickHeader(aiCols.nameCol, deterministicCols.nameCol),
    priceCol: pickHeader(aiCols.priceCol, deterministicCols.priceCol),
    categoryCol: pickHeader(aiCols.categoryCol, deterministicCols.categoryCol),
    descriptionCol: pickHeader(aiCols.descriptionCol, deterministicCols.descriptionCol),
    variationCol: pickHeader(aiCols.variationCol, deterministicCols.variationCol),
    skuCol: pickHeader(aiCols.skuCol, deterministicCols.skuCol),
    stockCol: pickHeader(aiCols.stockCol, deterministicCols.stockCol),
    suggestedCategoryFixes:
      aiCols.suggestedCategoryFixes && typeof aiCols.suggestedCategoryFixes === 'object'
        ? aiCols.suggestedCategoryFixes
        : {},
  };

  // Fallback: if nameCol still missing, pick first non-empty text column
  if (!finalMap.nameCol && headers.length > 0) {
    finalMap.nameCol = headers[0];
  }

  const idxOf = colName => (colName ? headers.indexOf(colName) : -1);
  const nameIdx = idxOf(finalMap.nameCol);
  const priceIdx = idxOf(finalMap.priceCol);
  const categoryIdx = idxOf(finalMap.categoryCol);
  const descriptionIdx = idxOf(finalMap.descriptionCol);
  const variationIdx = idxOf(finalMap.variationCol);
  const skuIdx = idxOf(finalMap.skuCol);
  const stockIdx = idxOf(finalMap.stockCol);
  const typeIdx = headers.findIndex(h => /^(tipo|item_?type|modalidade|formato)$/i.test(String(h || '').trim()));
  const durationIdx = headers.findIndex(h => /^(prazo|duracao|dura[cç][aã]o|tempo|entrega)$/i.test(String(h || '').trim()));

  const mappings = [
    { targetField: 'name', sourceColumn: finalMap.nameCol },
    { targetField: 'price', sourceColumn: finalMap.priceCol },
    { targetField: 'category', sourceColumn: finalMap.categoryCol },
    { targetField: 'description', sourceColumn: finalMap.descriptionCol },
    { targetField: 'variation', sourceColumn: finalMap.variationCol },
    { targetField: 'sku', sourceColumn: finalMap.skuCol },
    { targetField: 'stock', sourceColumn: finalMap.stockCol },
  ].map(entry => ({
    ...entry,
    sourceIndex: entry.sourceColumn ? headers.indexOf(entry.sourceColumn) : -1,
    detectedBy:
      ollamaResult.modelUsed && aiCols[`${entry.targetField}Col`] === entry.sourceColumn
        ? 'ollama'
        : 'deterministic',
  }));

  const products = [];
  rows.forEach((row, rowIdx) => {
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
      active: true,
    });
  });

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

  return {
    ok: true,
    modelUsed: ollamaResult.modelUsed || 'deterministic-fuzzy-mapper',
    usedFallback: !ollamaResult.modelUsed,
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
  const aiPrompt = compactForAi.length
    ? [
        `Negócio: ${businessName}.`,
        'Para cada pedido abaixo, classifique categoriaIA, prioridadeIA ("Alta"|"Média"|"Baixa") e resumoIA curto.',
        'Responda JSON no formato: { "classifications": { "<idx>": { "categoriaIA": string, "prioridadeIA": "Alta"|"Média"|"Baixa", "resumoIA": string } } }',
        JSON.stringify(compactForAi),
      ].join('\n')
    : '';

  const ollamaResult = aiPrompt ? await callOllamaJson(aiPrompt) : { parsed: null, modelUsed: null };
  const aiMap = ollamaResult.parsed?.classifications || {};

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
    const aiRow = aiMap[String(idx)];
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
    modelUsed: ollamaResult.modelUsed || 'deterministic-order-classifier',
    usedFallback: !ollamaResult.modelUsed,
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
