/**
 * A bounded, read-only ZIP reader (ADR-0036 §2).
 *
 * XLSX is a ZIP of XML, so reading a workbook without a third-party library means reading a ZIP
 * without one. That is a small amount of well-specified code and a large reduction in the attack
 * surface of the one process that holds the API credential.
 *
 * Every classic ZIP hazard is closed here rather than in the caller:
 *
 *   - **zip bombs** — the output cap is passed into zlib, so an over-expanding stream is aborted
 *     during inflation rather than after it has been allocated;
 *   - **entry-count exhaustion** — a hard ceiling on directory entries, because a directory with
 *     four million entries costs nothing to build and everything to walk;
 *   - **path traversal** — entry names containing `..`, a leading separator or a drive letter are
 *     rejected outright. Nothing here writes to disk, but a name that would traverse is evidence of
 *     a hostile archive, and the correct response to that is to stop, not to sanitise and continue;
 *   - **encrypted entries** — the general-purpose bit flag is checked, and an encrypted entry is a
 *     refusal rather than a stream of noise handed to an XML parser.
 *
 * Only the two stored/deflated methods exist. An archive using anything else is refused, not
 * partially read.
 */
import { ByteLimitExceeded, MalformedInput, inflate, u16le, u32le, utf8 } from '@platform/bytes';
import type { ByteBudget } from '@platform/bytes';

export interface ZipBudget extends ByteBudget {
  readonly maxEntries: number;
  /** Per-entry uncompressed ceiling, independent of the archive total. */
  readonly maxEntryBytes: number;
}

export const DEFAULT_ZIP_BUDGET: ZipBudget = {
  maxInputBytes: 25 * 1024 * 1024,
  maxOutputBytes: 120 * 1024 * 1024,
  maxEntries: 512,
  maxEntryBytes: 32 * 1024 * 1024,
};

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly method: number;
  readonly localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class ZipArchive {
  readonly #bytes: Uint8Array;
  readonly #budget: ZipBudget;
  readonly entries: readonly ZipEntry[];

  private constructor(bytes: Uint8Array, budget: ZipBudget, entries: readonly ZipEntry[]) {
    this.#bytes = bytes;
    this.#budget = budget;
    this.entries = entries;
  }

  static open(bytes: Uint8Array, budget: ZipBudget = DEFAULT_ZIP_BUDGET): ZipArchive {
    if (bytes.length > budget.maxInputBytes) {
      throw new ByteLimitExceeded('maxInputBytes', budget.maxInputBytes, bytes.length);
    }
    const eocd = findEocd(bytes);
    const entryCount = u16le(bytes, eocd + 10);
    if (entryCount > budget.maxEntries) {
      throw new MalformedInput(
        `Archive declares ${String(entryCount)} entries; the ceiling is ${String(budget.maxEntries)}.`,
      );
    }
    let cursor = u32le(bytes, eocd + 16);
    const entries: ZipEntry[] = [];
    for (let i = 0; i < entryCount; i += 1) {
      if (u32le(bytes, cursor) !== CENTRAL_SIGNATURE) {
        throw new MalformedInput(`Central directory entry ${String(i)} has a bad signature.`);
      }
      const flags = u16le(bytes, cursor + 8);
      // Bit 0 is the encryption flag. An encrypted member cannot be read and must not be guessed at.
      if ((flags & 0x0001) !== 0) throw new MalformedInput('Encrypted archive members are not read.');
      const method = u16le(bytes, cursor + 10);
      const compressedSize = u32le(bytes, cursor + 20);
      const uncompressedSize = u32le(bytes, cursor + 24);
      const nameLength = u16le(bytes, cursor + 28);
      const extraLength = u16le(bytes, cursor + 30);
      const commentLength = u16le(bytes, cursor + 32);
      const localHeaderOffset = u32le(bytes, cursor + 42);
      const name = utf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      assertSafeName(name);
      if (uncompressedSize > budget.maxEntryBytes) {
        throw new ByteLimitExceeded('maxOutputBytes', budget.maxEntryBytes, uncompressedSize);
      }
      entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return new ZipArchive(bytes, budget, entries);
  }

  has(name: string): boolean {
    return this.entries.some((e) => e.name === name);
  }

  /** Reads one entry as UTF-8 text, or `null` when the archive does not contain it. */
  readText(name: string): string | null {
    const bytes = this.read(name);
    return bytes === null ? null : utf8(bytes);
  }

  read(name: string): Uint8Array | null {
    const entry = this.entries.find((e) => e.name === name);
    if (entry === undefined) return null;
    const at = entry.localHeaderOffset;
    if (u32le(this.#bytes, at) !== LOCAL_SIGNATURE) {
      throw new MalformedInput(`Local header for "${name}" has a bad signature.`);
    }
    const nameLength = u16le(this.#bytes, at + 26);
    const extraLength = u16le(this.#bytes, at + 28);
    const start = at + 30 + nameLength + extraLength;
    const data = this.#bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method !== 8) {
      throw new MalformedInput(
        `Entry "${name}" uses compression method ${String(entry.method)}; only stored and deflate are read.`,
      );
    }
    return inflate(data, {
      maxInputBytes: this.#budget.maxInputBytes,
      maxOutputBytes: Math.min(this.#budget.maxEntryBytes, this.#budget.maxOutputBytes),
    }, 'raw');
  }
}

/**
 * Locates the end-of-central-directory record.
 *
 * Scanned backwards over the last 64 KiB, because the record ends with a variable-length comment and
 * the specification gives no other way to find it. The scan window is bounded so a file consisting
 * entirely of near-miss signatures cannot make this quadratic.
 */
function findEocd(bytes: Uint8Array): number {
  const floor = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (u32le(bytes, i) === EOCD_SIGNATURE) return i;
  }
  throw new MalformedInput('Not a ZIP archive: no end-of-central-directory record was found.');
}

function assertSafeName(name: string): void {
  if (name.includes('..') || name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) {
    throw new MalformedInput(
      `Archive entry "${name}" has a traversing path. Nothing is written to disk, but an archive `
      + 'that contains one is refused rather than sanitised.',
    );
  }
}
