/**
 * The parsers, given files written to hurt them (§16).
 *
 * These read bytes a stranger uploaded, inside the process that holds the API credential. That makes
 * them the highest-value target in the product and — until this file existed — the only substantial
 * body of code in it with no tests at all. Correct output on a good workbook says nothing about any
 * of that: the property that matters is what happens on a bad one, and the answer must always be the
 * same shape — **a refusal that names the reason, never a hang, a crash, or a partial read presented
 * as a whole one.**
 *
 * Each case below is a real attack class rather than a mutation for its own sake, and the assertions
 * are on behaviour a caller depends on: a thrown, typed error; a bounded amount of work; a
 * completeness flag that admits what was not read.
 */
import { describe, expect, it } from 'vitest';
import { ByteLimitExceeded, MalformedInput } from '@platform/bytes';
import {
  DEFAULT_TABULAR_BUDGET, ZipArchive, detectFormat, parseCsv, parsePdf, parseXlsx,
} from '@platform/parse';
import { buildPdf, buildXlsx } from '../../../scripts/fixtures/office.js';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Assembles a minimal ZIP so a test can put a deliberately hostile value in one header field. */
function zip(entries: readonly {
  name: string; data: Uint8Array; method?: number; flags?: number;
}[], overrides: { declaredEntryCount?: number; uncompressedSize?: number } = {}): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(entry.flags ?? 0, 6);
    head.writeUInt16LE(entry.method ?? 0, 8);
    head.writeUInt32LE(entry.data.length, 18);
    head.writeUInt32LE(overrides.uncompressedSize ?? entry.data.length, 22);
    head.writeUInt16LE(name.length, 26);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(entry.flags ?? 0, 8);
    dir.writeUInt16LE(entry.method ?? 0, 10);
    dir.writeUInt32LE(entry.data.length, 20);
    dir.writeUInt32LE(overrides.uncompressedSize ?? entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);

    local.push(head, name, Buffer.from(entry.data));
    central.push(dir, name);
    offset += head.length + name.length + entry.data.length;
  }
  const localBlock = Buffer.concat(local);
  const centralBlock = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(overrides.declaredEntryCount ?? entries.length, 8);
  eocd.writeUInt16LE(overrides.declaredEntryCount ?? entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  return new Uint8Array(Buffer.concat([localBlock, centralBlock, eocd]));
}

describe('the ZIP reader refuses hostile archives', () => {
  it('refuses an entry whose name would traverse out of the archive', () => {
    /*
     * Nothing here writes to disk, so this cannot become a written file — and the archive is still
     * refused rather than sanitised. A name like this is not a mistake anyone makes; it is evidence
     * about the file, and continuing past evidence of hostility is how the *next* reader of this
     * code inherits a vulnerability the archive already announced.
     */
    for (const name of ['../../etc/passwd', '/etc/passwd', 'C:\\windows\\system32', 'a/../../b']) {
      expect(() => ZipArchive.open(zip([{ name, data: utf8('x') }])))
        .toThrow(MalformedInput);
    }
  });

  it('refuses an encrypted member rather than handing noise to an XML reader', () => {
    expect(() => ZipArchive.open(zip([{ name: 'x.xml', data: utf8('x'), flags: 0x0001 }])))
      .toThrow(/Encrypted/);
  });

  it('refuses an archive declaring more entries than the ceiling', () => {
    expect(() => ZipArchive.open(zip([{ name: 'a.xml', data: utf8('x') }],
      { declaredEntryCount: 60_000 }))).toThrow(/entries/);
  });

  it('refuses an entry that claims to expand beyond the per-entry ceiling', () => {
    // The declared uncompressed size is checked *before* anything is inflated, so a lie about
    // expansion costs nothing to catch — this is the cheap half of zip-bomb defence.
    expect(() => ZipArchive.open(zip([{ name: 'a.xml', data: utf8('x') }],
      { uncompressedSize: 900 * 1024 * 1024 }))).toThrow(ByteLimitExceeded);
  });

  it('refuses a compression method it does not implement', () => {
    const archive = ZipArchive.open(zip([{ name: 'a.xml', data: utf8('x'), method: 14 }]));
    expect(() => archive.read('a.xml')).toThrow(/compression method/);
  });

  it('refuses a file that is not an archive at all', () => {
    expect(() => ZipArchive.open(utf8('this is just some text'))).toThrow(/end-of-central-directory/);
  });

  it('does not become quadratic on a file made entirely of near-miss signatures', () => {
    // The backward scan for the end-of-central-directory record is windowed. Without that bound, a
    // large file of decoys is a denial of service that looks like a slow upload.
    const decoys = new Uint8Array(4 * 1024 * 1024);
    for (let i = 0; i < decoys.length - 4; i += 4) {
      decoys[i] = 0x50; decoys[i + 1] = 0x4b; decoys[i + 2] = 0x05; decoys[i + 3] = 0x07;
    }
    const started = Date.now();
    expect(() => ZipArchive.open(decoys)).toThrow(MalformedInput);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('the workbook reader', () => {
  it('never resolves an XML entity, so external-entity expansion is unavailable', () => {
    /*
     * The classic XXE payload, delivered where a sheet name is read. The scanner knows five named
     * entities and treats everything else — including the DOCTYPE that declares this one — as
     * literal text, so the only way this could leak a file is if someone replaced the scanner with a
     * general XML parser. The assertion is on the *absence of resolution*, which is what would break
     * if that happened.
     */
    const hostile = '<?xml version="1.0"?>'
      + '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
      + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1">'
      + '<si><t>&xxe;</t></si></sst>';
    const workbook = zip([
      { name: '[Content_Types].xml', data: utf8('<Types/>') },
      { name: 'xl/workbook.xml', data: utf8('<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/sharedStrings.xml', data: utf8(hostile) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>') },
    ]);
    const parsed = parseXlsx(workbook);
    const cell = parsed.sheets[0]?.headers[0] ?? '';
    expect(cell).not.toContain('root:');
    expect(cell).toContain('&xxe;');
  });

  it('reads a cached value and never evaluates a formula', () => {
    // A workbook is evidence of what someone's spreadsheet computed, not a program to run. A cell
    // whose cached value is absent is reported as uncached rather than recomputed.
    const bytes = buildXlsx([{
      name: 'F', headers: ['a', 'b'], rows: [['1', '2']], uncachedFormulaCells: [[0, 1]],
    }]);
    const sheet = parseXlsx(bytes).sheets[0];
    expect(sheet).toBeDefined();
    expect(sheet?.rows[0]?.cells['b']).toBe('');
    // Named, not silently blank: an uncached formula becomes a validation finding downstream, and a
    // cell that merely looked empty would be quietly accepted as "no value supplied".
    expect(sheet?.rows[0]?.uncachedFormula).toContain('b');
  });

  it('refuses a workbook whose bytes are not a workbook', () => {
    expect(() => parseXlsx(utf8('%PDF-1.4 not a workbook'))).toThrow();
  });
});

describe('delimited text', () => {
  it('neutralises a cell that a spreadsheet would execute', () => {
    /*
     * CSV injection. The value is preserved — losing it would be its own defect, since the point of
     * ingesting evidence is to keep what it said — and it is prefixed so that a spreadsheet opening
     * an export of this data treats it as text.
     */
    const sheet = parseCsv(
      'id,note\n1,"=cmd|\'/c calc\'!A1"\n2,"+1+cmd|\'/c calc\'!A1"\n3,@SUM(A1)\n4,-4820000\n',
      'x.csv',
    );
    for (const row of sheet.rows.slice(0, 3)) {
      const cell = row.cells['note'] ?? '';
      expect(/^[=+\-@]/.test(cell)).toBe(false);
      expect(row.formulaLike).toContain('note');
    }
    // Neutralised, not discarded: the point of ingesting evidence is to keep what it said.
    expect(sheet.rows[0]?.cells['note']).toContain('cmd');
    /*
     * `+1+cmd|...` is the case the previous rule missed. The exemption asked whether a value
     * *started* like a signed number, so a payload that opened with a digit was waved through — and
     * Excel reads the whole cell as a formula regardless of how it starts.
     */
    expect(sheet.rows[1]?.cells['note']).toMatch(/^'/);
    // A real signed figure is still a figure. Neutralising `-4820000` would be a different defect:
    // finance exports are full of leading-minus numbers and they must survive untouched.
    expect(sheet.rows[3]?.cells['note']).toBe('-4820000');
    expect(sheet.rows[3]?.formulaLike).not.toContain('note');
  });

  it('truncates rather than growing without bound, and says that it truncated', () => {
    const many = `id\n${'1\n'.repeat(DEFAULT_TABULAR_BUDGET.maxRows + 500)}`;
    const sheet = parseCsv(many, 'x.csv');
    expect(sheet.rows.length).toBeLessThanOrEqual(DEFAULT_TABULAR_BUDGET.maxRows);
    // The count is what makes truncation honest: a silently short read is indistinguishable from a
    // short file, and every count downstream would be wrong by an unknowable amount.
    expect(sheet.rowsTruncated).toBeGreaterThan(0);
  });

  it('caps columns and cell length', () => {
    const wide = `${Array.from({ length: 1_000 }, (_, i) => `c${String(i)}`).join(',')}\n`;
    expect(parseCsv(wide, 'x.csv').headers.length)
      .toBeLessThanOrEqual(DEFAULT_TABULAR_BUDGET.maxColumns);
    const long = `a\n"${'x'.repeat(50_000)}"\n`;
    expect((parseCsv(long, 'x.csv').rows[0]?.cells[0] ?? '').length)
      .toBeLessThanOrEqual(DEFAULT_TABULAR_BUDGET.maxCellChars);
  });

  it('terminates on an unclosed quote instead of consuming the file as one cell', () => {
    const sheet = parseCsv('a,b\n1,"unterminated\n2,3\n', 'x.csv');
    expect(sheet.rows.length).toBeGreaterThan(0);
  });
});

describe('the PDF reader', () => {
  it('reports what it could not read rather than presenting a partial document as whole', () => {
    /*
     * The single most consequential property in the document pipeline. A page that failed to
     * decompress and a page that was blank look identical in the extracted text, and an assistant
     * that cannot tell them apart will answer "the contract says nothing about acceptance" when the
     * truth is "I could not read the page acceptance is on".
     */
    const good = buildPdf([{ lines: ['Acceptance is on delivery.'] }], 'T');
    const corrupted = new Uint8Array(good);
    const marker = Buffer.from(good).indexOf('stream');
    expect(marker).toBeGreaterThan(0);
    for (let i = marker + 8; i < Math.min(marker + 40, corrupted.length); i += 1) {
      corrupted[i] = 0xff;
    }
    const parsed = parsePdf(corrupted);
    expect(parsed.complete === false || parsed.unreadable.length > 0).toBe(true);
  });

  it('refuses a document larger than its ceiling before doing any work', () => {
    const huge = new Uint8Array(26 * 1024 * 1024);
    huge.set(utf8('%PDF-1.4'), 0);
    expect(() => parsePdf(huge)).toThrow(/ceiling/);
  });

  it('does not follow a page tree that references itself', () => {
    // A cyclic /Kids is a two-line file and an infinite loop in a naive reader.
    const cyclic = utf8([
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [2 0 R] /Count 1 >> endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
    ].join('\n'));
    const started = Date.now();
    const parsed = parsePdf(cyclic);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(parsed.pages.length).toBeLessThanOrEqual(1);
  });

  it('treats a file with no readable page as unreadable rather than as an empty document', () => {
    const parsed = parsePdf(utf8('%PDF-1.4\nthere is nothing here\n%%EOF'));
    expect(parsed.pages.length).toBe(0);
    expect(parsed.unreadable.length).toBeGreaterThan(0);
  });
});

describe('format detection reads bytes, never names', () => {
  it('identifies a PDF renamed as a workbook, and a workbook renamed as a PDF', () => {
    expect(detectFormat(buildPdf([{ lines: ['x'] }], 'T'))).toBe('PDF');
    expect(detectFormat(buildXlsx([{ name: 'S', headers: ['a'], rows: [['1']] }]))).toBe('XLSX');
    expect(detectFormat(utf8('a,b\n1,2\n'))).toBe('TEXT');
  });

  it('does not claim a format for bytes that are none of them', () => {
    expect(detectFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]))).toBe('UNKNOWN');
  });
});
