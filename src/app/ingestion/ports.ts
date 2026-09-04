/**
 * Storage ports (§7).
 *
 * The application says *what* it needs kept; infrastructure decides *where*. No domain or
 * application module imports a Firestore class, a Cloud Storage client or any GCP transport object —
 * they are behind these four interfaces, which is what keeps a local run, a test and a cloud
 * deployment on the same code path rather than on three code paths that agree for now.
 *
 * ## Why records travel as opaque JSON
 *
 * Each method takes and returns the application's own record types, serialised by the implementation
 * however it likes. A port shaped around a query language would leak that language upward: a
 * `where()` here would mean the application had started writing Firestore queries in a different
 * syntax, and swapping the store would then mean rewriting the callers rather than the adapter.
 *
 * ## Why every write is idempotent by key
 *
 * Cloud Run retries. A record is written **at a deterministic id** derived from its own content —
 * source id, version id, idempotency key — so a retried request overwrites rather than appends. That
 * is the property §10 asks for, and putting it in the port means an implementation cannot forget it.
 */
import type {
  ConceptObservation, IngestionReceipt, SourceConflict, StagedSourceRecord,
} from '@contexts/integration';
import type { DocumentVersion } from '@contexts/knowledge';
import type { RegisteredSource } from './registry.js';

/** One durable record, addressed by a key the caller derives deterministically. */
export interface Keyed<T> {
  readonly key: string;
  readonly value: T;
}

/**
 * Sources, their receipts, and what has been ingested from them.
 *
 * `putSource` is a full replace at the source id rather than a merge: a source's receipts are part of
 * its identity here, and a partial update would let two instances interleave into a record that
 * describes neither of their uploads.
 */
export interface SourceRepository {
  listSources(): Promise<readonly RegisteredSource[]>;
  putSource(source: RegisteredSource): Promise<void>;
  putObservations(records: readonly Keyed<ConceptObservation>[]): Promise<void>;
  listObservations(): Promise<readonly ConceptObservation[]>;
  putStaged(records: readonly Keyed<StagedSourceRecord>[]): Promise<void>;
  listStaged(): Promise<readonly StagedSourceRecord[]>;
  /** Recorded so `Verify Knowledge` can answer "has an answer ever used this?" after a restart. */
  putUse(sourceOrVersionId: string, question: string): Promise<void>;
  listUses(): Promise<readonly { readonly id: string; readonly question: string }[]>;
}

/** Document versions and their page-anchored chunks. Versions are immutable once written. */
export interface KnowledgeRepository {
  listVersions(): Promise<readonly DocumentVersion[]>;
  putVersion(version: DocumentVersion): Promise<void>;
  /** Which version is currently live for a document. Separate, because it is the only mutable part. */
  putCurrent(documentId: string, versionId: string): Promise<void>;
  listCurrent(): Promise<readonly { readonly documentId: string; readonly versionId: string }[]>;
}

/**
 * The original uploaded bytes, immutable (§8).
 *
 * Addressed by `sourceId/versionId`, never by filename: a filename is attacker-controlled, and an
 * object store keyed on one is an object store with a path-traversal question. The blob is written
 * once and never updated — changed content is a new version at a new key, so an answer that cited
 * version 2 can still be checked against the bytes version 2 was read from.
 */
export interface DocumentBlobStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<Uint8Array | null>;
  /** `null` where the store cannot address blobs, so a caller renders "not retained" rather than a broken link. */
  reference(key: string): string | null;
}

/** Execution lineage that must outlive the instance that produced it (§42). */
export interface AuditRepository {
  append(record: Readonly<Record<string, unknown>>): Promise<void>;
  recent(limit: number): Promise<readonly Readonly<Record<string, unknown>>[]>;
}

/** Everything the registry needs kept. Absent means in-memory, which is correct for tests. */
export interface DurableStores {
  readonly sources: SourceRepository;
  readonly knowledge: KnowledgeRepository;
  readonly blobs: DocumentBlobStore;
  readonly audit: AuditRepository;
}

export type { IngestionReceipt, SourceConflict };

/**
 * The in-memory implementation.
 *
 * Not a stub: it is the correct store for a test and for a single-process local run, and it exists so
 * that the durable path and the ephemeral path are the *same code* with a different adapter. A
 * codebase where the cloud path is the only one that persists is a codebase whose tests prove
 * something else.
 */
export class InMemoryStores implements DurableStores {
  readonly #sources = new Map<string, RegisteredSource>();
  readonly #observations = new Map<string, ConceptObservation>();
  readonly #staged = new Map<string, StagedSourceRecord>();
  readonly #versions = new Map<string, DocumentVersion>();
  readonly #current = new Map<string, string>();
  readonly #uses = new Map<string, string>();
  readonly #blobs = new Map<string, Uint8Array>();
  readonly #audit: Readonly<Record<string, unknown>>[] = [];

  readonly sources: SourceRepository = {
    listSources: () => Promise.resolve([...this.#sources.values()]),
    putSource: (source) => {
      this.#sources.set(source.sourceId, source);
      return Promise.resolve();
    },
    putObservations: (records) => {
      for (const r of records) this.#observations.set(r.key, r.value);
      return Promise.resolve();
    },
    listObservations: () => Promise.resolve([...this.#observations.values()]),
    putStaged: (records) => {
      for (const r of records) this.#staged.set(r.key, r.value);
      return Promise.resolve();
    },
    listStaged: () => Promise.resolve([...this.#staged.values()]),
    putUse: (id, question) => {
      this.#uses.set(id, question);
      return Promise.resolve();
    },
    listUses: () => Promise.resolve(
      [...this.#uses].map(([id, question]) => ({ id, question })),
    ),
  };

  readonly knowledge: KnowledgeRepository = {
    listVersions: () => Promise.resolve([...this.#versions.values()]),
    putVersion: (version) => {
      this.#versions.set(version.versionId, version);
      return Promise.resolve();
    },
    putCurrent: (documentId, versionId) => {
      this.#current.set(documentId, versionId);
      return Promise.resolve();
    },
    listCurrent: () => Promise.resolve(
      [...this.#current].map(([documentId, versionId]) => ({ documentId, versionId })),
    ),
  };

  readonly blobs: DocumentBlobStore = {
    put: (key, bytes) => {
      this.#blobs.set(key, bytes);
      return Promise.resolve(key);
    },
    get: (key) => Promise.resolve(this.#blobs.get(key) ?? null),
    reference: (key) => (this.#blobs.has(key) ? `memory://${key}` : null),
  };

  readonly audit: AuditRepository = {
    append: (record) => {
      this.#audit.push(record);
      return Promise.resolve();
    },
    recent: (limit) => Promise.resolve(this.#audit.slice(-limit)),
  };
}
