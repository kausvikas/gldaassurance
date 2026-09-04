import { isExternalDate, readExternalDate } from '@platform/time';

/**
 * The tabular record shape every structured parser produces, and the CSV reader (ADR-0036 §2).
 *
 * XLSX and CSV land on the same structure so that everything downstream — profiling, mapping,
 * identity resolution, validation, quarantine — is written once. A pipeline with two shapes has two
 * validators, and the second one is always the weaker.
 *
 * ## Formula safety, stated precisely
 *
 * Two different hazards get confused under one name, and this module answers both explicitly.
 *
 *   - **Nothing here evaluates a formula.** The XLSX reader takes cached values only; a cell holding
 *     a formula with no cached value is a validation finding, not a zero. There is no expression
 *     evaluator in this product, so a workbook cannot compute anything on ingestion.
 *   - **A value that *looks* like a formula is neutralised on the way out.** A cell containing
 *     `=cmd|' /c calc'!A0` is inert here and becomes an injection the moment this data is exported
 *     to CSV and opened in a spreadsheet. Because the product can export, the leading character is
 *     escaped at the boundary, and `formulaLike` records that it happened so the receipt can say so.
 */

/** One parsed row. Values are strings; nothing is coerced before the mapping stage. */
export interface TabularRow {
  /** 1-based, as a spreadsheet user counts, including the header row. */
  readonly rowNumber: number;
  readonly cells: Readonly<Record<string, string>>;
  /** Columns whose value began with a spreadsheet execution character and was neutralised. */
  readonly formulaLike: readonly string[];
  /** Columns holding a formula with no cached value. These become validation findings. */
  readonly uncachedFormula: readonly string[];
}

export interface TabularSheet {
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly TabularRow[];
  /** Rows the budget cut off. Non-zero means the file was larger than the pipeline accepts. */
  readonly rowsTruncated: number;
}

export interface TabularBudget {
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCellChars: number;
}

export const DEFAULT_TABULAR_BUDGET: TabularBudget = {
  maxRows: 20_000,
  maxColumns: 256,
  maxCellChars: 4_000,
};

/** The characters a spreadsheet treats as the start of an expression. */
const EXECUTION_PREFIX = /^[=+\-@\t\r]/;

/**
 * Makes a cell safe to re-export.
 *
 * Prefixed with an apostrophe, which every spreadsheet reads as "this is text". Deliberately *not*
 * done by stripping the character: a negative number legitimately starts with `-`, and silently
 * removing it would turn a cost of -50,000 into 50,000, which is a far worse outcome than a quoted
 * string. So negatives that parse as numbers are left exactly as they are.
 */
export function neutraliseFormula(value: string): { readonly value: string; readonly changed: boolean } {
  if (!EXECUTION_PREFIX.test(value)) return { value, changed: false };
  /*
   * A signed number is left alone — but only when the **whole** value is one.
   *
   * The exemption used to be `^[+-]?\d`, which asks whether the value *starts* like a number. That
   * let `+1+cmd|'/c calc'!A1` through untouched: it begins `+1`, so it was read as a negative-signed
   * figure, and Excel reads it as a formula. The prefix test and the exemption were answering
   * different questions, and the gap between them was the payload. Requiring the entire value to be
   * digits, separators and spaces closes it while still leaving `-4820000` and `-1,234.00` as the
   * numbers a finance export means them to be.
   */
  if (/^[+-][\d,. ]*\d[\d,. ]*$/.test(value)) return { value, changed: false };
  return { value: `'${value}`, changed: true };
}

/**
 * RFC 4180 CSV, with the tolerances a real export needs and none it does not.
 *
 * Handles quoted fields, doubled quotes inside them, embedded newlines and CRLF. Rejects nothing
 * silently: a row with fewer cells than the header yields empty strings for the missing columns and
 * those become `MISSING_REQUIRED_FIELD` findings downstream, where the mapping knows which columns
 * were required. A parser that dropped short rows would be hiding exactly the defect a data-quality
 * report exists to show.
 */
export function parseCsv(
  text: string, sheetName = 'CSV', budget: TabularBudget = DEFAULT_TABULAR_BUDGET,
): TabularSheet {
  const records = splitRecords(text, budget);
  const headerRecord = records[0];
  if (headerRecord === undefined) {
    return { name: sheetName, headers: [], rows: [], rowsTruncated: 0 };
  }
  const headers = headerRecord
    .slice(0, budget.maxColumns)
    .map((h, i) => (h.trim() === '' ? `column_${String(i + 1)}` : h.trim()));

  const rows: TabularRow[] = [];
  let truncated = 0;
  for (let i = 1; i < records.length; i += 1) {
    if (rows.length >= budget.maxRows) { truncated = records.length - i; break; }
    const record = records[i];
    if (record === undefined) continue;
    if (record.length === 1 && (record[0] ?? '').trim() === '') continue;
    const cells: Record<string, string> = {};
    const formulaLike: string[] = [];
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      if (header === undefined) continue;
      const raw = (record[c] ?? '').slice(0, budget.maxCellChars);
      const { value, changed } = neutraliseFormula(raw);
      cells[header] = value;
      if (changed) formulaLike.push(header);
    }
    rows.push({ rowNumber: i + 1, cells, formulaLike, uncachedFormula: [] });
  }
  return { name: sheetName, headers, rows, rowsTruncated: truncated };
}

function splitRecords(text: string, budget: TabularBudget): string[][] {
  const out: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { record.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') {
      record.push(field); field = '';
      out.push(record); record = [];
      if (out.length > budget.maxRows + 1) break;
      continue;
    }
    field += ch;
  }
  if (field !== '' || record.length > 0) { record.push(field); out.push(record); }
  return out;
}

/** Column-level profile used to suggest mappings and to report data quality (§47 PROFILE). */
export interface ColumnProfile {
  readonly column: string;
  readonly populated: number;
  readonly blank: number;
  readonly distinct: number;
  readonly inferredType: 'number' | 'date' | 'boolean' | 'text' | 'empty';
  readonly samples: readonly string[];
}

export function profile(sheet: TabularSheet): readonly ColumnProfile[] {
  return sheet.headers.map((column) => {
    const values = sheet.rows.map((r) => (r.cells[column] ?? '').trim());
    const populated = values.filter((v) => v !== '');
    const distinct = new Set(populated).size;
    return {
      column,
      populated: populated.length,
      blank: values.length - populated.length,
      distinct,
      inferredType: inferType(populated),
      samples: [...new Set(populated)].slice(0, 3),
    };
  });
}

function inferType(values: readonly string[]): ColumnProfile['inferredType'] {
  if (values.length === 0) return 'empty';
  const numeric = values.filter((v) => /^[(+-]?[\p{Sc}]?\s*[\d,]+(\.\d+)?\)?%?$/u.test(v)).length;
  if (numeric / values.length >= 0.9) return 'number';
  const dated = values.filter((v) => isDateLike(v)).length;
  if (dated / values.length >= 0.9) return 'date';
  const bool = values.filter((v) => /^(true|false|yes|no|y|n)$/i.test(v)).length;
  if (bool / values.length >= 0.9) return 'boolean';
  return 'text';
}

/**
 * Date handling delegates to `platform/time`, which is the one module permitted to parse a date.
 *
 * Re-exported here so an ingestion caller has one import, and implemented there so there is one
 * definition of what this product will accept as a date.
 */
export function isDateLike(value: string): boolean {
  return isExternalDate(value);
}

export function toIsoDate(value: string): string | null {
  return readExternalDate(value);
}

