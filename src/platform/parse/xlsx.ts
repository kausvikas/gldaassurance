/**
 * A first-party XLSX reader (ADR-0036 §2).
 *
 * OOXML is a ZIP of XML, and the subset a data-ingestion pipeline needs is small: the workbook part
 * for sheet names, the relationship part to find each sheet's XML, the shared string table, and the
 * sheet itself. That is what this reads, and nothing else.
 *
 * **Formulas are never evaluated.** A cell is read from its cached `<v>` element only. A cell with an
 * `<f>` and no `<v>` — a workbook saved by a tool that did not calculate, or one where the value was
 * deliberately stripped — is reported as `uncachedFormula` and becomes a `FORMULA_CELL_REJECTED`
 * finding. It is never treated as empty and never as zero, because "the source did not tell us" and
 * "the source told us nothing was there" are different facts (ADR-0027).
 *
 * **XML is read by a scanner, not by a general parser**, and the scanner never resolves an entity it
 * did not define. XXE and the billion-laughs expansion are properties of a parser that resolves
 * external and recursive entities; this one resolves five named entities and numeric character
 * references, and treats a `<!DOCTYPE>` as text it skips. That is the whole mitigation.
 *
 * ## Dates
 *
 * Excel stores a date as a serial number with a style, so a date cell is indistinguishable from a
 * number without reading the style table. This reader **does not** read the style table: it returns
 * the serial. The mapping layer decides whether a column is a date, and the receipt records the
 * decision, so a period is never silently invented from a number that happened to look like one.
 */
import { structuralInt, toDecimalString } from '@platform/bytes';
import type { TabularBudget, TabularRow, TabularSheet } from './tabular.js';
import { DEFAULT_TABULAR_BUDGET, neutraliseFormula } from './tabular.js';
import { DEFAULT_ZIP_BUDGET, ZipArchive } from './zip.js';
import type { ZipBudget } from './zip.js';

export interface XlsxWorkbook {
  readonly sheets: readonly TabularSheet[];
  /** Parts present in the archive. Rendered on the receipt so a reader can see what was read. */
  readonly partsRead: readonly string[];
  readonly notes: readonly string[];
}

export function isXlsx(bytes: Uint8Array): boolean {
  // The ZIP local-file-header signature. A file claiming .xlsx that does not start with it is not
  // one, whatever the extension says — filenames are not trusted (§80).
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
}

export function parseXlsx(
  bytes: Uint8Array,
  budget: TabularBudget = DEFAULT_TABULAR_BUDGET,
  zipBudget: ZipBudget = DEFAULT_ZIP_BUDGET,
): XlsxWorkbook {
  const zip = ZipArchive.open(bytes, zipBudget);
  const partsRead: string[] = [];
  const notes: string[] = [];

  const sharedStrings = readSharedStrings(zip, partsRead);
  const sheetRefs = readSheetRefs(zip, partsRead, notes);

  const sheets: TabularSheet[] = [];
  for (const ref of sheetRefs) {
    const xml = zip.readText(ref.part);
    if (xml === null) { notes.push(`Sheet part "${ref.part}" is declared but absent from the archive.`); continue; }
    partsRead.push(ref.part);
    sheets.push(readSheet(ref.name, xml, sharedStrings, budget));
  }
  if (sheets.length === 0) notes.push('No worksheet part could be read from this workbook.');
  return { sheets, partsRead, notes };
}

interface SheetRef { readonly name: string; readonly part: string }

/**
 * Resolves sheet name → sheet part through the relationship table.
 *
 * Going through the relationships rather than assuming `xl/worksheets/sheet1.xml` matters: sheet
 * order in the workbook is not sheet-file order on disk, and a workbook that has had sheets deleted
 * and re-added routinely has `sheet3.xml` first. Assuming the filename reads the wrong sheet, and
 * reads it successfully, which is the failure mode nobody notices.
 */
function readSheetRefs(zip: ZipArchive, partsRead: string[], notes: string[]): readonly SheetRef[] {
  const workbook = zip.readText('xl/workbook.xml');
  if (workbook === null) { notes.push('xl/workbook.xml is absent; this is not a readable workbook.'); return []; }
  partsRead.push('xl/workbook.xml');

  const rels = zip.readText('xl/_rels/workbook.xml.rels') ?? '';
  if (rels !== '') partsRead.push('xl/_rels/workbook.xml.rels');
  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    if (id === null || target === null) continue;
    relTargets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }

  const out: SheetRef[] = [];
  let ordinal = 0;
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    ordinal += 1;
    const tag = m[0];
    const name = decodeXml(attr(tag, 'name') ?? `Sheet${String(ordinal)}`);
    const rid = attr(tag, 'r:id') ?? attr(tag, 'id');
    const part = rid === null ? null : relTargets.get(rid) ?? null;
    if (part !== null) { out.push({ name, part }); continue; }
    const guess = `xl/worksheets/sheet${String(ordinal)}.xml`;
    if (zip.has(guess)) {
      notes.push(`Sheet "${name}" had no readable relationship; matched by position to ${guess}.`);
      out.push({ name, part: guess });
    } else {
      notes.push(`Sheet "${name}" could not be located in the archive.`);
    }
  }
  return out;
}

function readSharedStrings(zip: ZipArchive, partsRead: string[]): readonly string[] {
  const xml = zip.readText('xl/sharedStrings.xml');
  if (xml === null) return [];
  partsRead.push('xl/sharedStrings.xml');
  const out: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const body = si[1] ?? '';
    // A shared string may be split across several runs; concatenating every <t> is what keeps
    // "Atlas Modernisation" from arriving as "Atlas" when a user has bolded one word.
    let text = '';
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1] ?? '';
    out.push(decodeXml(text));
  }
  return out;
}

function readSheet(
  name: string, xml: string, shared: readonly string[], budget: TabularBudget,
): TabularSheet {
  interface Cell { readonly column: string; readonly value: string; readonly uncachedFormula: boolean }
  const raw = new Map<number, Cell[]>();
  let maxRow = 0;

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowMatch[1] ?? '';
    const body = rowMatch[2] ?? '';
    const rowNumber = structuralInt(attr(`<row ${rowAttrs}>`, 'r') ?? '') ?? maxRow + 1;
    maxRow = Math.max(maxRow, rowNumber);
    const cells: Cell[] = [];
    for (const cellMatch of body.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttrs = `<c ${cellMatch[1] ?? ''}>`;
      const inner = cellMatch[2] ?? '';
      const reference = attr(cellAttrs, 'r') ?? '';
      const column = /^[A-Z]+/.exec(reference)?.[0] ?? '';
      if (column === '') continue;
      const type = attr(cellAttrs, 't') ?? 'n';
      const hasFormula = /<f\b/.test(inner);
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? null;

      if (type === 'inlineStr') {
        let text = '';
        for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1] ?? '';
        cells.push({ column, value: decodeXml(text), uncachedFormula: false });
        continue;
      }
      if (v === null) {
        // A formula with no cached value. Recorded, never inferred, never evaluated.
        if (hasFormula) cells.push({ column, value: '', uncachedFormula: true });
        continue;
      }
      if (type === 's') {
        const index = structuralInt(v);
        const text = index === null ? '' : shared[index] ?? '';
        cells.push({ column, value: text, uncachedFormula: false });
        continue;
      }
      if (type === 'b') {
        cells.push({ column, value: v === '1' ? 'TRUE' : 'FALSE', uncachedFormula: false });
        continue;
      }
      if (type === 'e') {
        // A spreadsheet error code. Kept verbatim so it becomes an explicit finding rather than a
        // silent blank that would read as "the source said nothing".
        cells.push({ column, value: decodeXml(v), uncachedFormula: false });
        continue;
      }
      // Numeric, date-serial or string-typed. `toDecimalString` normalises a numeric; anything it
      // rejects is carried through as text for the mapping layer to judge.
      cells.push({ column, value: toDecimalString(v) ?? decodeXml(v), uncachedFormula: false });
    }
    raw.set(rowNumber, cells);
  }

  const rowNumbers = [...raw.keys()].sort((a, b) => a - b);
  const headerRowNumber = rowNumbers[0];
  if (headerRowNumber === undefined) {
    return { name, headers: [], rows: [], rowsTruncated: 0 };
  }
  const headerCells = raw.get(headerRowNumber) ?? [];
  const columnLetters = headerCells.map((c) => c.column).slice(0, budget.maxColumns);
  const headers = columnLetters.map((letter, i) => {
    const text = (headerCells.find((c) => c.column === letter)?.value ?? '').trim();
    return text === '' ? `column_${String(i + 1)}` : text;
  });

  const rows: TabularRow[] = [];
  let truncated = 0;
  for (const rowNumber of rowNumbers.slice(1)) {
    if (rows.length >= budget.maxRows) { truncated += 1; continue; }
    const cellsForRow = raw.get(rowNumber) ?? [];
    if (cellsForRow.length === 0) continue;
    const cells: Record<string, string> = {};
    const formulaLike: string[] = [];
    const uncachedFormula: string[] = [];
    for (let i = 0; i < columnLetters.length; i += 1) {
      const letter = columnLetters[i];
      const header = headers[i];
      if (letter === undefined || header === undefined) continue;
      const cell = cellsForRow.find((c) => c.column === letter);
      const rawValue = (cell?.value ?? '').slice(0, budget.maxCellChars);
      const { value, changed } = neutraliseFormula(rawValue);
      cells[header] = value;
      if (changed) formulaLike.push(header);
      if (cell?.uncachedFormula === true) uncachedFormula.push(header);
    }
    if (Object.values(cells).every((v) => v.trim() === '') && uncachedFormula.length === 0) continue;
    rows.push({ rowNumber, cells, formulaLike, uncachedFormula });
  }
  return { name, headers, rows, rowsTruncated: truncated };
}

function attr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`\\b${escaped}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m?.[1] ?? null;
}

/**
 * Resolves the five predefined XML entities and numeric character references. Nothing else.
 *
 * An entity this function does not know is left as literal text rather than resolved, which is what
 * makes external-entity expansion structurally unavailable rather than merely disabled.
 */
export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => codePoint(globalThis.Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(globalThis.Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function codePoint(value: number): string {
  if (!globalThis.Number.isFinite(value) || value < 0 || value > 0x10ffff) return '';
  return String.fromCodePoint(value);
}
