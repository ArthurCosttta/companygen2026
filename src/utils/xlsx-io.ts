import JSZip from 'jszip';

export type XlsxCellValue = string | number;

export interface XlsxSheetInput {
  name: string;
  headers: string[];
  rows: XlsxCellValue[][];
}

export interface ParsedSpreadsheetSheet {
  name: string;
  headers: string[];
  rows: string[][];
  imagesByRow?: Record<number, string>;
}

export type SpreadsheetFormat = 'xlsx' | 'xls-xml' | 'xls-html' | 'csv' | 'tsv';

export interface ParsedSpreadsheetResult {
  format: SpreadsheetFormat;
  sheets: ParsedSpreadsheetSheet[];
}

function escapeXml(raw: unknown): string {
  const cleaned = String(raw ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function sanitizeSheetName(raw: string, fallbackIndex: number, used: Set<string>): string {
  const base = (raw || `Planilha_${fallbackIndex}`)
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

function indexToColLetter(colIndex: number): string {
  let n = colIndex + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colRefToIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, '').toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

export async function buildXlsxUint8Array(sheets: XlsxSheetInput[]): Promise<Uint8Array> {
  const effectiveSheets: XlsxSheetInput[] =
    sheets.length > 0 ? sheets : [{ name: 'Dados', headers: ['Coluna'], rows: [] }];

  const zip = new JSZip();
  const sharedStrings: string[] = [];
  const sharedIndexMap = new Map<string, number>();

  const registerSharedString = (value: string): number => {
    const existing = sharedIndexMap.get(value);
    if (existing !== undefined) return existing;
    const idx = sharedStrings.length;
    sharedStrings.push(value);
    sharedIndexMap.set(value, idx);
    return idx;
  };

  const usedNames = new Set<string>();
  const normalizedSheets = effectiveSheets.map((sheet, idx) => ({
    name: sanitizeSheetName(sheet.name, idx + 1, usedNames),
    headers: sheet.headers.map(h => String(h ?? '')),
    rows: sheet.rows || [],
  }));

  // Pre-register strings and build each worksheet XML
  const worksheetXmls: string[] = [];
  for (const sheet of normalizedSheets) {
    const colCount = Math.max(
      sheet.headers.length,
      ...sheet.rows.map(r => r.length),
      1
    );
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

    const rowXmlParts: string[] = [];

    // Header row (row 1, style s="1")
    const headerCells = sheet.headers.map((headerText, colIdx) => {
      const ref = `${indexToColLetter(colIdx)}1`;
      const sIdx = registerSharedString(headerText);
      return `<c r="${ref}" t="s" s="1"><v>${sIdx}</v></c>`;
    });
    rowXmlParts.push(`<row r="1" ht="24" customHeight="1">${headerCells.join('')}</row>`);

    // Data rows (row 2+)
    sheet.rows.forEach((row, rowIdx) => {
      const excelRowNum = rowIdx + 2;
      const cellParts: string[] = [];
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

  // [Content_Types].xml
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

  // _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  // xl/workbook.xml
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

  // xl/_rels/workbook.xml.rels
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

  // xl/styles.xml (style 0 = body, style 1 = bold dark header fill)
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

  // xl/sharedStrings.xml
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

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseSharedStringsXml(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1].replace(/<rPh[\s\S]*?<\/rPh>/gi, '');
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
    let text = '';
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += unescapeEntities(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

function parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrString)) !== null) {
    attrs[m[1]] = unescapeEntities(m[2] ?? m[3] ?? '');
  }
  return attrs;
}

function rowsToSheet(
  name: string,
  matrix: string[][],
  rawRowNums?: number[],
): (ParsedSpreadsheetSheet & { _headerExcelRowZero?: number; _excelRowByDataRow?: number[] }) | null {
  const indexedRows = matrix
    .map((row, idx) => ({
      cells: row.map(cell => String(cell ?? '').trim()),
      excelRowZero: rawRowNums && Number.isInteger(rawRowNums[idx]) ? rawRowNums[idx] : idx,
    }))
    .filter(item => item.cells.some(cell => cell.length > 0));
  if (!indexedRows.length) return null;

  // Smart header detection: skip single-cell title banner rows when a richer multi-column header exists in top 5 rows
  let headerIdx = 0;
  const countNonEmpty = (r: string[]) => r.filter(Boolean).length;
  if (indexedRows.length >= 2 && countNonEmpty(indexedRows[0].cells) === 1) {
    const better = indexedRows.slice(1, 5).findIndex(it => countNonEmpty(it.cells) >= 2);
    if (better >= 0) headerIdx = better + 1;
  }

  const sliceRows = indexedRows.slice(headerIdx);
  const maxCols = Math.max(...sliceRows.map(r => r.cells.length), 1);
  const pad = (row: string[]) =>
    Array.from({ length: maxCols }, (_, idx) => row[idx] ?? '');

  const [headerItem, ...dataItems] = sliceRows;
  const paddedHeaders = pad(headerItem.cells).map((h, idx) => h || `Coluna_${idx + 1}`);
  return {
    name,
    headers: paddedHeaders,
    rows: dataItems.map(d => pad(d.cells)),
    _headerExcelRowZero: headerItem.excelRowZero,
    _excelRowByDataRow: dataItems.map(d => d.excelRowZero),
  };
}

function parseWorksheetXml(
  xml: string,
  sharedStrings: string[],
  sheetName: string,
): (ParsedSpreadsheetSheet & { _headerExcelRowZero?: number; _excelRowByDataRow?: number[] }) | null {
  const matrix: string[][] = [];
  const rawRowNums: number[] = [];
  const rowRegex = /<row(\s[^>]*)?>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  let seqRowZero = 0;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowAttrs = parseAttrs(rowMatch[1] || '');
    const explicitRowNum = rowAttrs.r ? Number(rowAttrs.r) - 1 : seqRowZero;
    const rowZero = Number.isFinite(explicitRowNum) && explicitRowNum >= 0 ? explicitRowNum : seqRowZero;
    seqRowZero = rowZero + 1;

    const rowBody = rowMatch[2];
    const rowCells: string[] = [];
    const cellRegex = /<c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/gi;
    let cellMatch: RegExpExecArray | null;
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
        const tParts: string[] = [];
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi;
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(body)) !== null) {
          tParts.push(unescapeEntities(tm[1]));
        }
        value = tParts.join('');
      } else {
        const vMatch = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i);
        if (vMatch) {
          value = unescapeEntities(vMatch[1].trim());
          if (type === 'b') {
            value = value === '1' ? 'TRUE' : 'FALSE';
          }
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

function guessImageMimeFromPath(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return null;
}

async function extractWorksheetEmbeddedImages(
  zip: JSZip,
  sheetPath: string,
): Promise<Map<number, string>> {
  const byExcelRowZero = new Map<number, string>();
  const normalizedSheetPath = sheetPath.replace(/^\/+/, '');
  const sheetDir = normalizedSheetPath.split('/').slice(0, -1).join('/');
  const sheetFile = normalizedSheetPath.split('/').pop() || '';
  const sheetRelsPath = `${sheetDir}/_rels/${sheetFile}.rels`;

  const drawingPaths: string[] = [];
  const sheetRelsFile = zip.file(sheetRelsPath);
  if (sheetRelsFile) {
    const relsXml = await sheetRelsFile.async('string');
    const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
    let rm: RegExpExecArray | null;
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
    const embedToMedia = new Map<string, string>();
    if (drawingRelsFile) {
      const dRelsXml = await drawingRelsFile.async('string');
      const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
      let rm: RegExpExecArray | null;
      while ((rm = relRegex.exec(dRelsXml)) !== null) {
        const attrs = parseAttrs(rm[1]);
        if (attrs.Id && attrs.Target) {
          const clean = attrs.Target.replace(/^\.\.\//, 'xl/').replace(/^\/+/, '');
          embedToMedia.set(attrs.Id, clean.startsWith('xl/') ? clean : `xl/${clean}`);
        }
      }
    }

    const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/gi;
    let am: RegExpExecArray | null;
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

async function parseXlsxArchive(bytes: Uint8Array): Promise<ParsedSpreadsheetResult> {
  const zip = await JSZip.loadAsync(bytes);
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? parseSharedStringsXml(await sharedStringsFile.async('string'))
    : [];

  const relsMap = new Map<string, string>();
  const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (workbookRelsFile) {
    const relsXml = await workbookRelsFile.async('string');
    const relRegex = /<Relationship\s+([^>]+?)\/?>/gi;
    let relMatch: RegExpExecArray | null;
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

  const orderedEntries: Array<{ name: string; path: string }> = [];
  const workbookFile = zip.file('xl/workbook.xml');
  if (workbookFile) {
    const wbXml = await workbookFile.async('string');
    const sheetTagRe = /<sheet\s+([^>]+?)\/?>/gi;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sheetTagRe.exec(wbXml)) !== null) {
      const attrs = parseAttrs(sMatch[1]);
      const rId = attrs['r:id'] || '';
      const resolvedPath = relsMap.get(rId);
      if (resolvedPath && zip.file(resolvedPath)) {
        orderedEntries.push({ name: attrs.name || `Planilha_${orderedEntries.length + 1}`, path: resolvedPath });
      }
    }
  }

  if (!orderedEntries.length) {
    const sheetPaths = Object.keys(zip.files)
      .filter(p => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sheetPaths.forEach((p, idx) => orderedEntries.push({ name: `Planilha_${idx + 1}`, path: p }));
  }

  const sheets: ParsedSpreadsheetSheet[] = [];
  for (const entry of orderedEntries) {
    const file = zip.file(entry.path);
    if (!file) continue;
    const xml = await file.async('string');
    const parsed = parseWorksheetXml(xml, sharedStrings, entry.name);
    if (!parsed) continue;
    const embeddedMap = await extractWorksheetEmbeddedImages(zip, entry.path);
    const imagesByRow: Record<number, string> = {};
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

function parseSpreadsheetMlXml(text: string): ParsedSpreadsheetResult {
  const sheets: ParsedSpreadsheetSheet[] = [];
  const wsRegex = /<Worksheet(?:\s([^>]*))?>([\s\S]*?)<\/Worksheet>/gi;
  let wsMatch: RegExpExecArray | null;
  let sheetCount = 0;

  while ((wsMatch = wsRegex.exec(text)) !== null) {
    sheetCount += 1;
    const wsAttrs = parseAttrs(wsMatch[1] || '');
    const wsBody = wsMatch[2];
    const matrix: string[][] = [];
    const rowRe = /<Row(?:\s[^>]*)?>([\s\S]*?)<\/Row>/gi;
    let rMatch: RegExpExecArray | null;

    while ((rMatch = rowRe.exec(wsBody)) !== null) {
      const rowCells: string[] = [];
      const cellRe = /<Cell(?:\s([^>]*))?(?:\/>|>([\s\S]*?)<\/Cell>)/gi;
      let cMatch: RegExpExecArray | null;
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

    const parsed = rowsToSheet(wsAttrs['ss:Name'] || wsAttrs.Name || `Planilha_${sheetCount}`, matrix);
    if (parsed) sheets.push(parsed);
  }

  return { format: 'xls-xml', sheets };
}

function parseHtmlTableXls(text: string): ParsedSpreadsheetResult {
  const cleanedHtml = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  const tables = cleanedHtml.match(/<table[\s\S]*?<\/table>/gi) || [cleanedHtml];
  const sheets: ParsedSpreadsheetSheet[] = [];

  tables.forEach((tableHtml, tableIdx) => {
    const matrix: string[][] = [];
    const trRe = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      const rowCells: string[] = [];
      const cellRe = /<(?:th|td)(?:\s[^>]*)?>([\s\S]*?)<\/(?:th|td)>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
        const plain = unescapeEntities(cellMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        rowCells.push(plain);
      }
      if (rowCells.some(c => c.length > 0)) matrix.push(rowCells);
    }
    const parsed = rowsToSheet(`Planilha_${tableIdx + 1}`, matrix);
    if (parsed) sheets.push(parsed);
  });

  return { format: 'xls-html', sheets };
}

function detectDelimiter(text: string, filename?: string): ';' | '\t' | ',' {
  if (filename?.toLowerCase().endsWith('.tsv')) return '\t';
  const sampleLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 5);
  const candidates: Array<';' | '\t' | ','> = [';', '\t', ','];
  let best: ';' | '\t' | ',' = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sampleLines.map(line => {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === delim && !inQuotes) count += 1;
      }
      return count;
    });
    const minCount = counts.length ? Math.min(...counts) : 0;
    const total = counts.reduce((a, b) => a + b, 0);
    const score = (minCount > 0 ? 100 : 0) + total;
    if (score > bestScore && total > 0) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function parseDelimitedText(text: string, filename?: string): ParsedSpreadsheetResult {
  const cleanText = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleanText, filename);
  const format: SpreadsheetFormat = delimiter === '\t' ? 'tsv' : 'csv';

  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    if (ch === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && cleanText[i + 1] === '\n') i += 1;
      currentRow.push(currentCell);
      if (currentRow.some(c => c.trim().length > 0)) {
        matrix.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some(c => c.trim().length > 0)) {
      matrix.push(currentRow);
    }
  }

  const parsed = rowsToSheet('Dados', matrix);
  return {
    format,
    sheets: parsed ? [parsed] : [],
  };
}

export async function parseUniversalSpreadsheet(
  input: Uint8Array | ArrayBuffer | string,
  filename?: string
): Promise<ParsedSpreadsheetResult> {
  if (typeof input !== 'string') {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const isPkZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (isPkZip || filename?.toLowerCase().endsWith('.xlsx')) {
      return parseXlsxArchive(bytes);
    }
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return parseUniversalSpreadsheet(decoded, filename);
  }

  const trimmed = input.trim();
  if (
    trimmed.startsWith('UEsDB') ||
    /^data:application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet;base64,/i.test(trimmed)
  ) {
    const bytes = decodeBase64ToUint8Array(trimmed);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return parseXlsxArchive(bytes);
    }
  }

  const cleanText = input.replace(/^\uFEFF/, '');
  if (/<Workbook[\s>]/i.test(cleanText) && /<Row[\s>]/i.test(cleanText)) {
    return parseSpreadsheetMlXml(cleanText);
  }
  if (/<table[\s>]/i.test(cleanText) && /<tr[\s>]/i.test(cleanText)) {
    return parseHtmlTableXls(cleanText);
  }
  return parseDelimitedText(cleanText, filename);
}

/**
 * Parses currency strings in BRL or US/numeric formats accurately to integer cents.
 * Examples:
 * - "R$ 1.290,50" -> 129050
 * - "1290.50" -> 129050
 * - "49,90" -> 4990
 */
export function parsePriceToCents(raw: unknown): number {
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
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // BRL/EU format: "1.290,50"
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: "1,290.50"
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(',', '.');
    }
  } else if (hasDot) {
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned) && !/^0\.\d+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}
