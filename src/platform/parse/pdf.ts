/**
 * A first-party, bounded PDF **text** extractor (ADR-0036 §2, §53).
 *
 * Scope is deliberately narrow: it recovers the text of a page-structured PDF, preserving page
 * boundaries, so that a citation can name a page the reader will actually find the sentence on. It
 * is not a rendering engine and does not try to be.
 *
 * ## What makes this safe rather than merely small
 *
 * A PDF is an executable-ish container: it can hold JavaScript, launch actions, embedded files,
 * remote references and encrypted streams. **None of those is followed here.** The extractor reads
 * the page tree, the content streams the pages point at, and the text operators inside them.
 * `/JavaScript`, `/Launch`, `/EmbeddedFile`, `/URI`, `/GoToR` and `/OpenAction` are never resolved —
 * not blocked by a filter that could be bypassed, but simply never reached, because there is no code
 * here that would resolve them.
 *
 * ## What it cannot read, and why that is reported rather than hidden
 *
 * Returning partial text silently is the dangerous failure: a citation to page 14 of a document
 * whose page 14 was a scanned image would be a citation to nothing, and it would survive review.
 * So the parser reports `PARSE_INCOMPLETE` with named reasons for:
 *
 *   - scanned pages (an image XObject and no text operators);
 *   - CID fonts with `Identity-H` encoding, where byte pairs map through a font-embedded CMap this
 *     extractor does not read, so the recovered characters would be wrong rather than absent;
 *   - encrypted documents;
 *   - filters other than Flate (LZW, RunLength, JBIG2, CCITT, DCT).
 *
 * `PARSE_INCOMPLETE` is carried onto the document version and rendered on the receipt, and the
 * answerability engine treats a question that lands on an incompletely-parsed document as partially
 * answerable rather than answerable.
 */
import { MalformedInput, inflate, latin1 } from '@platform/bytes';

export interface PdfBudget {
  readonly maxInputBytes: number;
  readonly maxPages: number;
  readonly maxObjects: number;
  readonly maxTextCharsPerPage: number;
  readonly maxStreamBytes: number;
}

export const DEFAULT_PDF_BUDGET: PdfBudget = {
  maxInputBytes: 25 * 1024 * 1024,
  maxPages: 400,
  maxObjects: 20_000,
  maxTextCharsPerPage: 60_000,
  maxStreamBytes: 16 * 1024 * 1024,
};

export interface PdfPage {
  /** 1-based, in reading order as the page tree declares it. */
  readonly pageNumber: number;
  readonly text: string;
}

export interface PdfDocument {
  readonly pages: readonly PdfPage[];
  readonly title: string | null;
  readonly complete: boolean;
  /** Named reasons the extraction is incomplete. Empty when `complete` is true. */
  readonly unreadable: readonly string[];
  readonly producer: string | null;
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && latin1(bytes.subarray(0, 5)) === '%PDF-';
}

interface PdfObject {
  readonly id: number;
  readonly dict: string;
  readonly streamStart: number;
  readonly streamEnd: number;
}

export function parsePdf(bytes: Uint8Array, budget: PdfBudget = DEFAULT_PDF_BUDGET): PdfDocument {
  if (bytes.length > budget.maxInputBytes) {
    throw new MalformedInput(`PDF exceeds the ${String(budget.maxInputBytes)}-byte ceiling.`);
  }
  if (!isPdf(bytes)) throw new MalformedInput('Not a PDF: the file does not begin with %PDF-.');

  // Latin-1 keeps a one-byte-to-one-character mapping, so every offset computed on this string is a
  // byte offset into the original array. Decoding as UTF-8 would silently shift every offset the
  // moment a stream contained a byte above 0x7f, which is always.
  const text = latin1(bytes);
  const unreadable: string[] = [];

  if (/\/Encrypt\b/.test(text)) {
    return {
      pages: [], title: null, complete: false, producer: null,
      unreadable: ['The document is encrypted. Encrypted PDFs are not decrypted or guessed at.'],
    };
  }

  const objects = scanObjects(text, budget);
  const pageIds = resolvePageOrder(text, objects, budget, unreadable);

  const pages: PdfPage[] = [];
  for (let i = 0; i < pageIds.length; i += 1) {
    const pageId = pageIds[i];
    if (pageId === undefined) continue;
    const page = objects.get(pageId);
    if (page === undefined) continue;
    const content = contentStreamsFor(page, objects, bytes, budget, unreadable);
    if (/\/Subtype\s*\/Image/.test(page.dict) && content.trim() === '') {
      unreadable.push(`Page ${String(i + 1)} appears to be a scanned image; no text layer was present.`);
    }
    if (/\/Encoding\s*\/Identity-H/.test(fontsFor(page, objects))) {
      unreadable.push(
        `Page ${String(i + 1)} uses an Identity-H CID font whose character map is embedded in the font. `
        + 'Extracted characters would be wrong rather than missing, so the page is reported unread.',
      );
      pages.push({ pageNumber: i + 1, text: '' });
      continue;
    }
    const extracted = extractText(content).slice(0, budget.maxTextCharsPerPage);
    pages.push({ pageNumber: i + 1, text: extracted });
  }

  if (pages.length === 0) unreadable.push('No page could be located through the document page tree.');

  return {
    pages,
    title: infoValue(text, 'Title'),
    producer: infoValue(text, 'Producer'),
    complete: unreadable.length === 0,
    unreadable: [...new Set(unreadable)],
  };
}

/**
 * Indexes every `n g obj … endobj` block.
 *
 * The cross-reference table is deliberately not trusted: a linearised, incrementally-updated or
 * slightly-damaged PDF routinely has an xref that disagrees with the file, and every real-world
 * reader falls back to scanning. Scanning first removes a whole class of "the xref said 4096 and the
 * object is at 4098" failures, at the cost of one linear pass.
 */
function scanObjects(text: string, budget: PdfBudget): ReadonlyMap<number, PdfObject> {
  const out = new Map<number, PdfObject>();
  const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (out.size >= budget.maxObjects) break;
    const id = globalThis.Number.parseInt(m[1] ?? '', 10);
    if (!globalThis.Number.isFinite(id)) continue;
    const bodyStart = m.index + m[0].length;
    const endObj = text.indexOf('endobj', bodyStart);
    const end = endObj === -1 ? text.length : endObj;
    const streamAt = text.indexOf('stream', bodyStart);
    const hasStream = streamAt !== -1 && streamAt < end;
    let streamStart = -1;
    let streamEnd = -1;
    if (hasStream) {
      // The specification allows CRLF or LF after the keyword and nothing else.
      streamStart = streamAt + 6;
      if (text[streamStart] === '\r') streamStart += 1;
      if (text[streamStart] === '\n') streamStart += 1;
      const endStream = text.indexOf('endstream', streamStart);
      streamEnd = endStream === -1 ? end : endStream;
    }
    out.set(id, {
      id,
      dict: text.slice(bodyStart, hasStream ? streamAt : end),
      streamStart,
      streamEnd,
    });
  }
  return out;
}

/**
 * Walks `/Root → /Pages → /Kids` to get pages in reading order.
 *
 * Reading order matters more than it looks: a page number in a citation is only useful if it is the
 * number printed in the document, and object order is not page order in any PDF that has been
 * edited. Where the tree cannot be walked, the fallback is object order **and the document is marked
 * incomplete**, because a plausible but wrong page number is the fabricated citation ADR-0036 §6
 * prohibits.
 */
function resolvePageOrder(
  text: string, objects: ReadonlyMap<number, PdfObject>, budget: PdfBudget, unreadable: string[],
): readonly number[] {
  const rootRef = /\/Root\s+(\d+)\s+\d+\s+R/.exec(text)?.[1];
  const root = rootRef === undefined ? undefined : objects.get(globalThis.Number.parseInt(rootRef, 10));
  const pagesRef = root === undefined ? null : /\/Pages\s+(\d+)\s+\d+\s+R/.exec(root.dict)?.[1] ?? null;

  const order: number[] = [];
  const seen = new Set<number>();

  const walk = (id: number, depth: number): void => {
    if (depth > 64 || order.length >= budget.maxPages || seen.has(id)) return;
    seen.add(id);
    const node = objects.get(id);
    if (node === undefined) return;
    if (/\/Type\s*\/Page\b(?!s)/.test(node.dict)) { order.push(id); return; }
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.dict)?.[1] ?? '';
    for (const ref of kids.matchAll(/(\d+)\s+\d+\s+R/g)) {
      const kid = globalThis.Number.parseInt(ref[1] ?? '', 10);
      if (globalThis.Number.isFinite(kid)) walk(kid, depth + 1);
    }
  };

  if (pagesRef !== null) walk(globalThis.Number.parseInt(pagesRef, 10), 0);
  if (order.length > 0) return order;

  unreadable.push(
    'The document page tree could not be walked, so pages are numbered in object order. '
    + 'Citations from this document state a section rather than a page.',
  );
  for (const [id, obj] of objects) {
    if (order.length >= budget.maxPages) break;
    if (/\/Type\s*\/Page\b(?!s)/.test(obj.dict)) order.push(id);
  }
  return order;
}

function fontsFor(page: PdfObject, objects: ReadonlyMap<number, PdfObject>): string {
  const resourcesRef = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(page.dict)?.[1];
  const resources = resourcesRef === undefined
    ? page.dict
    : objects.get(globalThis.Number.parseInt(resourcesRef, 10))?.dict ?? page.dict;
  let out = resources;
  for (const ref of resources.matchAll(/\/(?:Font|F\d+)\s+(\d+)\s+\d+\s+R/g)) {
    const font = objects.get(globalThis.Number.parseInt(ref[1] ?? '', 10));
    if (font !== undefined) out += font.dict;
  }
  return out;
}

function contentStreamsFor(
  page: PdfObject,
  objects: ReadonlyMap<number, PdfObject>,
  bytes: Uint8Array,
  budget: PdfBudget,
  unreadable: string[],
): string {
  const contents = /\/Contents\s*(?:\[([^\]]*)\]|(\d+)\s+\d+\s+R)/.exec(page.dict);
  if (contents === null) return '';
  const refs: number[] = [];
  if (contents[1] !== undefined) {
    for (const r of contents[1].matchAll(/(\d+)\s+\d+\s+R/g)) {
      refs.push(globalThis.Number.parseInt(r[1] ?? '', 10));
    }
  } else if (contents[2] !== undefined) {
    refs.push(globalThis.Number.parseInt(contents[2], 10));
  }

  let out = '';
  for (const ref of refs) {
    const obj = objects.get(ref);
    if (obj === undefined || obj.streamStart < 0) continue;
    const raw = bytes.subarray(obj.streamStart, Math.min(obj.streamEnd, obj.streamStart + budget.maxStreamBytes));
    const filter = /\/Filter\s*(?:\[([^\]]*)\]|\/(\w+))/.exec(obj.dict);
    const name = filter?.[2] ?? filter?.[1]?.replace(/[/\s]/g, '') ?? null;
    if (name === null) { out += latin1(raw); continue; }
    if (name !== 'FlateDecode') {
      unreadable.push(
        `A content stream uses the ${name} filter, which this extractor does not decode. `
        + 'That page is reported unread rather than partially recovered.',
      );
      continue;
    }
    try {
      out += latin1(inflate(raw, {
        maxInputBytes: budget.maxStreamBytes,
        maxOutputBytes: budget.maxStreamBytes,
      }, 'zlib'));
    } catch {
      unreadable.push('A Flate content stream could not be inflated and that page was not recovered.');
    }
  }
  return out;
}

/**
 * Recovers text from a content stream's text-showing operators.
 *
 * Handles `Tj`, `TJ`, `'` and `"`, and treats `Td`, `TD`, `T*` and `ET` as line breaks. That
 * approximation is what turns a stream of positioned glyph runs back into paragraphs a reader
 * recognises — which is the whole requirement, since the output is chunked and cited rather than
 * re-rendered.
 *
 * `TJ` arrays carry kerning numbers between the strings; a large negative adjustment is a word gap,
 * so the threshold below inserts a space. Without it, `[(Accep)-2(tance)]TJ` becomes `Acceptance`
 * correctly but `[(Acceptance)-300(Criteria)]TJ` becomes `AcceptanceCriteria`, and a search for
 * "acceptance criteria" then misses the one passage it exists to find.
 */
export function extractText(content: string): string {
  let out = '';
  let i = 0;
  const pending: string[] = [];

  const flush = (separator: string): void => {
    if (pending.length > 0) { out += pending.join(''); pending.length = 0; }
    out += separator;
  };

  while (i < content.length) {
    const ch = content[i];

    if (ch === '(') {
      const { value, next } = readLiteralString(content, i);
      pending.push(value);
      i = next;
      continue;
    }
    if (ch === '<' && content[i + 1] !== '<') {
      const close = content.indexOf('>', i);
      if (close === -1) break;
      pending.push(hexString(content.slice(i + 1, close)));
      i = close + 1;
      continue;
    }
    if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) {
      const m = /^-?\d+(\.\d+)?/.exec(content.slice(i, i + 24));
      if (m !== null) {
        const value = globalThis.Number.parseFloat(m[0]);
        if (value <= -120 && pending.length > 0) pending.push(' ');
        i += m[0].length;
        continue;
      }
    }
    if (ch === 'T' || ch === "'" || ch === '"' || ch === 'E') {
      const op = content.slice(i, i + 2);
      if (op === 'Tj' || op === 'TJ') { flush(''); i += 2; continue; }
      if (op === 'Td' || op === 'TD' || op === 'T*') { flush('\n'); i += 2; continue; }
      if (op === 'ET') { flush('\n\n'); i += 2; continue; }
      if (ch === "'" || ch === '"') { flush('\n'); i += 1; continue; }
    }
    i += 1;
  }
  flush('');

  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function readLiteralString(content: string, start: number): { value: string; next: number } {
  let value = '';
  let depth = 0;
  let i = start;
  for (; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '\\') {
      const escaped = content[i + 1];
      i += 1;
      if (escaped === undefined) break;
      if (escaped >= '0' && escaped <= '7') {
        const octal = /^[0-7]{1,3}/.exec(content.slice(i, i + 3))?.[0] ?? escaped;
        i += octal.length - 1;
        value += String.fromCharCode(globalThis.Number.parseInt(octal, 8));
        continue;
      }
      value += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t'
        : escaped === 'b' ? '' : escaped === 'f' ? '' : escaped === '\n' ? '' : escaped;
      continue;
    }
    if (ch === '(') { depth += 1; if (depth > 1) value += ch; continue; }
    if (ch === ')') { depth -= 1; if (depth === 0) { i += 1; break; } value += ch; continue; }
    if (depth > 0 && ch !== undefined) value += ch;
  }
  return { value, next: i };
}

function hexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(globalThis.Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function infoValue(text: string, key: string): string | null {
  const m = new RegExp(`/${key}\\s*\\(([^)]{0,300})\\)`).exec(text);
  const value = m?.[1];
  if (value === undefined) return null;
  const cleaned = value.replace(/\\([()\\])/g, '$1').trim();
  return cleaned === '' ? null : cleaned;
}
