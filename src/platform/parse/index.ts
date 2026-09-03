/**
 * Public surface — platform/parse.
 *
 * First-party, dependency-free, bounded readers for the three formats Phase 13 ingests: XLSX, CSV
 * and PDF (ADR-0036 §2). Together with `platform/bytes` these are the only place in the product
 * where bytes chosen by someone else are interpreted.
 *
 * They live in platform for the same reason `bytes` does — Node builtins and numeric coercion are
 * confined here by `ARCH-006` and `G-FLOAT` — and they were written rather than installed for the
 * reason ADR-0032 §4 gives: this code runs in the process that holds the API credential, and a
 * transitive dependency tree there is a supply-chain surface the POC neither needs nor could review.
 *
 * What that buys, concretely: no formula is ever evaluated, no XML entity is ever resolved, no PDF
 * action is ever followed, no archive member is ever written to disk, and every entry point has a
 * budget it fails closed against.
 */
export {
  type ZipBudget, type ZipEntry, DEFAULT_ZIP_BUDGET, ZipArchive,
} from './zip.js';

export {
  type TabularRow, type TabularSheet, type TabularBudget, type ColumnProfile,
  DEFAULT_TABULAR_BUDGET, neutraliseFormula, parseCsv, profile, isDateLike, toIsoDate,
} from './tabular.js';

export { type XlsxWorkbook, isXlsx, parseXlsx, decodeXml } from './xlsx.js';

export {
  type PdfBudget, type PdfPage, type PdfDocument,
  DEFAULT_PDF_BUDGET, isPdf, parsePdf, extractText,
} from './pdf.js';

/**
 * What a file claims to be, decided by its bytes.
 *
 * Filenames are not trusted (§80). An `.xlsx` that is really a PDF, or a `.csv` that is really a ZIP,
 * is a routine mistake and an obvious attack, and either way the correct behaviour is to read what
 * it is or refuse — never to hand it to the parser its name suggested.
 */
export type DetectedFormat = 'XLSX' | 'PDF' | 'TEXT' | 'UNKNOWN';

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
    && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'PDF';
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'XLSX';
  // Text is decided by absence of control bytes rather than by presence of anything, because CSV
  // has no signature. A NUL byte in the first kilobyte means this is not the text file it claims.
  const window = bytes.subarray(0, 1024);
  for (const b of window) {
    if (b === 0) return 'UNKNOWN';
  }
  return window.length === 0 ? 'UNKNOWN' : 'TEXT';
}

export const PARSE_STATE: string =
  'First-party bounded readers for XLSX, CSV and PDF. No formula evaluation, no XML entity '
  + 'resolution, no PDF action resolution, no third-party parser (ADR-0032 §4, ADR-0036 §2).';
