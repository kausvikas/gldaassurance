/**
 * Public surface — platform/bytes.
 *
 * The one place in the product where a byte becomes a number, a stream becomes text, or content
 * becomes an identity. Three separate rules converge on this module and it exists so that none of
 * them has to be relaxed anywhere else:
 *
 *   - `ARCH-006` confines Node builtins to the platform layer, so `node:crypto` and `node:zlib`
 *     cannot be reached from a context, the application or a surface;
 *   - `G-FLOAT` bans numeric coercion above platform, so a parser that turns a spreadsheet cell
 *     into a quantity cannot live in `src/app/ingestion`;
 *   - ADR-0036 §2 requires every parse to be bounded on bytes, entries, pages, rows and time.
 *
 * A parser is the component most likely to be handed bytes chosen by an attacker, so every entry
 * point here takes an explicit budget and fails closed when it is exceeded. There is no unbounded
 * variant, and adding one would be a security change rather than a convenience.
 *
 * **Nothing here interprets meaning.** `toDecimalString` returns a *string* precisely so that the
 * decimal-safe money and quantity constructors stay the only route from an external figure to a
 * domain value: ADR-0002's guarantee is that no float ever becomes a system of record, and a
 * float-parse in an ingestion pipeline would be exactly that with extra steps.
 */
import { createHash } from 'node:crypto';
import { inflateRawSync, inflateSync, gunzipSync } from 'node:zlib';

/** Every bounded operation states its budget. There is no default that means "unlimited". */
export interface ByteBudget {
  /** Maximum input length in bytes. */
  readonly maxInputBytes: number;
  /** Maximum length any decompression may produce. The zip-bomb control. */
  readonly maxOutputBytes: number;
}

export class ByteLimitExceeded extends Error {
  constructor(
    readonly limit: keyof ByteBudget,
    readonly allowed: number,
    readonly seen: number,
  ) {
    super(
      `Refused: ${limit} is ${String(allowed)} bytes and the input reached ${String(seen)}. `
      + 'Parsing is bounded by construction (ADR-0036 §2); an unbounded parse is not available.',
    );
    this.name = 'ByteLimitExceeded';
  }
}

export class MalformedInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedInput';
  }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The content fingerprint every ingested artefact is identified by (ADR-0036 §3, ADR-0008 §3).
 *
 * SHA-256 of the exact bytes received, before any parsing. Re-uploading identical content produces
 * an identical fingerprint and is therefore a *duplicate*, not a new version — which is only true
 * because the hash is taken over the raw bytes rather than over anything the parser decided.
 */
export function fingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A short, stable, non-secret id derived from content. Used for document and chunk ids. */
export function shortId(prefix: string, ...parts: readonly string[]): string {
  const h = createHash('sha256').update(parts.join(' ')).digest('hex').slice(0, 12);
  return `${prefix}-${h}`;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

export function utf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf8');
}

export function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

export function bytesOf(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

// ---------------------------------------------------------------------------
// Bounded decompression
// ---------------------------------------------------------------------------

/**
 * DEFLATE, bounded on both sides.
 *
 * `maxOutputLength` is passed to zlib itself rather than checked afterwards: checking afterwards
 * means the bomb has already been allocated. A 42 KB input that expands to 4 GB is a normal, easily
 * constructed file, and it is the reason this function has no convenience form.
 */
export function inflate(
  bytes: Uint8Array,
  budget: ByteBudget,
  kind: 'raw' | 'zlib' | 'gzip' = 'raw',
): Uint8Array {
  if (bytes.length > budget.maxInputBytes) {
    throw new ByteLimitExceeded('maxInputBytes', budget.maxInputBytes, bytes.length);
  }
  const opts = { maxOutputLength: budget.maxOutputBytes };
  try {
    const out = kind === 'raw'
      ? inflateRawSync(bytes, opts)
      : kind === 'gzip' ? gunzipSync(bytes, opts) : inflateSync(bytes, opts);
    return new Uint8Array(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    if (message.includes('maxOutputLength') || message.includes('Buffer size')) {
      throw new ByteLimitExceeded('maxOutputBytes', budget.maxOutputBytes, budget.maxOutputBytes);
    }
    throw new MalformedInput(`Compressed stream could not be inflated (${kind}): ${message}`);
  }
}

// ---------------------------------------------------------------------------
// The audited numeric boundary
// ---------------------------------------------------------------------------

/**
 * Reads an external figure as a **decimal string**, or returns `null`.
 *
 * This is the only sanctioned conversion from untrusted text to a numeric value in the product, and
 * it deliberately does not produce a number. Callers hand the string to `Money`, `Quantity` or
 * `Ratio`, so ADR-0002's guarantee — that no IEEE-754 value is ever a system of record — survives
 * ingestion. A pipeline returning a raw number here would have broken it silently, in the one place
 * where the inputs come from outside.
 *
 * Rejects rather than coerces: an empty cell, a not-applicable marker, a spreadsheet error code, a
 * date, or anything with two decimal points is `null` and becomes a validation finding, not a zero.
 * Absence and zero are different things (ADR-0027), and this is where that distinction is first
 * available to be lost.
 */
export function toDecimalString(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return null;
  // Accounting negatives, thousands separators, a leading currency symbol and a trailing percent
  // are all normal in an exported workbook. Anything else is not silently discarded.
  const negative = /^\(.*\)$/.test(t);
  let s = negative ? t.slice(1, -1) : t;
  s = s.replace(/^[\p{Sc}]\s*/u, '').replace(/\s*%$/, '').replace(/,/g, '').trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const signed = s.startsWith('+') ? s.slice(1) : s;
  if (!negative) return signed;
  return signed.startsWith('-') ? signed.slice(1) : `-${signed}`;
}

/**
 * Integers used as *structure* — a ZIP offset, a row index, a page count — never as a business
 * figure. Separated from `toDecimalString` so the two uses cannot be confused at a call site.
 */
export function structuralInt(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw.trim())) return null;
  return globalThis.Number.parseInt(raw.trim(), 10);
}

/** Little-endian unsigned reads for container formats. Bounds-checked; no DataView aliasing. */
export function u16le(b: Uint8Array, at: number): number {
  const a = b[at]; const c = b[at + 1];
  if (a === undefined || c === undefined) throw new MalformedInput(`Truncated at offset ${String(at)}.`);
  return a | (c << 8);
}

export function u32le(b: Uint8Array, at: number): number {
  const x0 = b[at]; const x1 = b[at + 1]; const x2 = b[at + 2]; const x3 = b[at + 3];
  if (x0 === undefined || x1 === undefined || x2 === undefined || x3 === undefined) {
    throw new MalformedInput(`Truncated at offset ${String(at)}.`);
  }
  return ((x0 | (x1 << 8) | (x2 << 16)) >>> 0) + (x3 * 0x1000000);
}

export const BYTES_STATE: string =
  'The single audited boundary where bytes become text, numbers or identity. Every entry point is '
  + 'bounded; no unbounded variant exists (ADR-0036 §2).';
