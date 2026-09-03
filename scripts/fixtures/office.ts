/**
 * Builders for the synthetic XLSX and PDF fixtures Phase 13 ingests.
 *
 * These live in `scripts/` rather than `src/` deliberately. They are **demo-data generators**, not
 * product code: nothing in the running product writes a spreadsheet or a PDF, and putting a writer
 * next to the reader would give the reader a same-shaped writer to be accidentally validated
 * against. The readers in `src/platform/parse` are proven against these files the way they will be
 * proven against a real export — by reading bytes they did not produce a moment earlier.
 *
 * Everything produced here is **DEMO — SYNTHETIC DATA**. The SOW text is written for this POC and
 * describes no real GlobalLogic engagement, client or commercial term.
 */
import { deflateRawSync, deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// ZIP writing (for XLSX)
// ---------------------------------------------------------------------------

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipMember { readonly name: string; readonly bytes: Uint8Array }

function zip(members: readonly ZipMember[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const name = Buffer.from(member.name, 'utf8');
    const raw = Buffer.from(member.bytes);
    const deflated = deflateRawSync(raw);
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(member.bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([Buffer.concat(locals), centralBytes, eocd]));
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

export interface SheetSpec {
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Cells to emit as a formula with no cached value, as `row,column` zero-based data indices. */
  readonly uncachedFormulaCells?: readonly (readonly [number, number])[];
}

const xmlEscape = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (index: number): string => {
  let n = index;
  let out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
};

/** A minimal but genuinely valid workbook: shared strings, relationships, one part per sheet. */
export function buildXlsx(sheets: readonly SheetSpec[]): Uint8Array {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const intern = (value: string): number => {
    const existing = stringIndex.get(value);
    if (existing !== undefined) return existing;
    const index = strings.length;
    strings.push(value);
    stringIndex.set(value, index);
    return index;
  };

  const sheetParts = sheets.map((sheet, sheetOrdinal) => {
    const uncached = new Set((sheet.uncachedFormulaCells ?? []).map(([r, c]) => `${String(r)}:${String(c)}`));
    const rowsXml: string[] = [];

    const headerCells = sheet.headers
      .map((h, i) => `<c r="${columnName(i)}1" t="s"><v>${String(intern(h))}</v></c>`)
      .join('');
    rowsXml.push(`<row r="1">${headerCells}</row>`);

    sheet.rows.forEach((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const ref = `${columnName(columnIndex)}${String(rowIndex + 2)}`;
        if (uncached.has(`${String(rowIndex)}:${String(columnIndex)}`)) {
          // A formula with no cached <v>. The reader must report it, never evaluate it.
          return `<c r="${ref}"><f>SUM(A1:A2)</f></c>`;
        }
        if (value === '') return '';
        if (/^-?\d+(\.\d+)?$/.test(value)) return `<c r="${ref}"><v>${value}</v></c>`;
        return `<c r="${ref}" t="s"><v>${String(intern(value))}</v></c>`;
      }).join('');
      rowsXml.push(`<row r="${String(rowIndex + 2)}">${cells}</row>`);
    });

    return {
      name: `xl/worksheets/sheet${String(sheetOrdinal + 1)}.xml`,
      xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + `<sheetData>${rowsXml.join('')}</sheetData></worksheet>`,
    };
  });

  const sharedStringsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${String(strings.length)}" uniqueCount="${String(strings.length)}">`
    + strings.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('')
    + '</sst>';

  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`).join('')
    + '</sheets></workbook>';

  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, i) => `<Relationship Id="rId${String(i + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`).join('')
    + `<Relationship Id="rId${String(sheets.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`
    + '</Relationships>';

  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${String(i + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + '</Types>';

  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const enc = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'utf8'));
  return zip([
    { name: '[Content_Types].xml', bytes: enc(contentTypes) },
    { name: '_rels/.rels', bytes: enc(rootRels) },
    { name: 'xl/workbook.xml', bytes: enc(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', bytes: enc(workbookRels) },
    { name: 'xl/sharedStrings.xml', bytes: enc(sharedStringsXml) },
    ...sheetParts.map((p) => ({ name: p.name, bytes: enc(p.xml) })),
  ]);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface PdfPageSpec {
  /** Lines of text. Blank entries become paragraph breaks, which the chunker reads as boundaries. */
  readonly lines: readonly string[];
}

const pdfEscape = (s: string): string => s.replace(/[\\()]/g, (c) => `\\${c}`);

/**
 * A genuinely structured PDF: catalogue, page tree, per-page Flate-compressed content streams.
 *
 * Structured rather than flat so that the reader's page-tree walk and Flate path are both exercised
 * by the fixture. A fixture that only worked because the reader fell back to object order would
 * prove the fallback and nothing else.
 */
export function buildPdf(pages: readonly PdfPageSpec[], title: string): Uint8Array {
  const objects: string[] = [];
  const binaryObjects = new Map<number, Buffer>();

  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  // 1 catalogue, 2 pages node, 3 font, then two objects per page.
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(4 + i * 2);
    contentObjectIds.push(5 + i * 2);
  }
  const infoId = 4 + pages.length * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  pages.forEach((page, i) => {
    const pageId = pageObjectIds[i] ?? 0;
    const contentId = contentObjectIds[i] ?? 0;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${String(contentId)} 0 R >>`;

    const body = ['BT', '/F1 11 Tf', '14 TL', '54 738 Td'];
    for (const line of page.lines) {
      body.push(line.trim() === '' ? 'T*' : `(${pdfEscape(line)}) Tj`, 'T*');
    }
    body.push('ET');
    const stream = deflateSync(Buffer.from(body.join('\n'), 'latin1'));
    objects[contentId] = `<< /Length ${String(stream.length)} /Filter /FlateDecode >>`;
    binaryObjects.set(contentId, stream);
  });

  objects[infoId] = `<< /Title (${pdfEscape(title)}) /Producer (GLDI synthetic fixture builder) >>`;

  const chunks: Buffer[] = [Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1')];
  const offsets: number[] = [];
  let position = chunks[0]?.length ?? 0;

  for (let id = 1; id <= infoId; id += 1) {
    const dict = objects[id];
    if (dict === undefined) { offsets[id] = 0; continue; }
    offsets[id] = position;
    const head = Buffer.from(`${String(id)} 0 obj\n${dict}\n`, 'latin1');
    const stream = binaryObjects.get(id);
    const parts = stream === undefined
      ? [head, Buffer.from('endobj\n', 'latin1')]
      : [head, Buffer.from('stream\n', 'latin1'), stream, Buffer.from('\nendstream\nendobj\n', 'latin1')];
    for (const part of parts) { chunks.push(part); position += part.length; }
  }

  const xrefAt = position;
  const xrefLines = ['xref', `0 ${String(infoId + 1)}`, '0000000000 65535 f '];
  for (let id = 1; id <= infoId; id += 1) {
    xrefLines.push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n `);
  }
  chunks.push(Buffer.from(
    `${xrefLines.join('\n')}\ntrailer\n<< /Size ${String(infoId + 1)} /Root 1 0 R /Info ${String(infoId)} 0 R >>\n`
    + `startxref\n${String(xrefAt)}\n%%EOF\n`,
    'latin1',
  ));

  return new Uint8Array(Buffer.concat(chunks));
}
