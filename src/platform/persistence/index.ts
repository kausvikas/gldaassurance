/**
 * Public surface — platform/persistence.
 *
 * **Contracts only. Phase 2 lands the canonical schema; Phase 5 the immutability enforcement.**
 *
 * Authority: ADR-0001 §Decision 3 (schema-per-context, no cross-context foreign keys, no
 * cross-context joins) and ADR-0003 (append-only temporal model, DB-level immutability).
 * The persistence *strategy* is written up in `docs/architecture/DATA-PLATFORM.md` and
 * proposed as ADR-0007; nothing below is implemented until that ADR is accepted.
 */
import type { Instant } from '@platform/time';

/** Every context owns a PostgreSQL schema namespace of this name. */
export type SchemaName = string & { readonly __schemaNameBrand: unique symbol };

/**
 * Transaction boundary. One process, one database, one transaction boundary — this is what
 * makes the margin bridge reconcile (ADR-0001 §Rationale).
 */
export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** Opaque handle. Contexts never see a connection, a query builder, or raw SQL. */
export interface Transaction {
  readonly id: string;
}

export interface Repository<TEntity, TId extends string> {
  findById(tx: Transaction, id: TId): Promise<TEntity | undefined>;
  findMany(tx: Transaction, ids: readonly TId[]): Promise<readonly TEntity[]>;
}

/**
 * Insert-once store. Backs the Original As-Sold Baseline and the audit log.
 * ADR-0003 §Decision 1: updates and deletes are "rejected at the persistence layer, not by
 * application convention" (REQ-DATA-003). The interface deliberately offers no update path,
 * and Phase 5 must additionally revoke UPDATE/DELETE privileges and install a rejecting
 * trigger — the type is a reminder, the database is the control.
 */
export interface ImmutableStore<TEntity, TId extends string> {
  insert(tx: Transaction, entity: TEntity): Promise<void>;
  findById(tx: Transaction, id: TId): Promise<TEntity | undefined>;
}

/**
 * Append-only series store. Backs the weekly snapshots (ADR-0003 §Decision 3).
 * A correction is a *new* row carrying a `corrects` reference — never an update, so that
 * "what we believed then" and "what we now believe about then" are both recoverable.
 */
export interface AppendOnlyStore<TEntity> {
  append(tx: Transaction, entity: TEntity): Promise<void>;
  /** As-of: what we believed at `asOf`. */
  seriesAsOf(tx: Transaction, key: string, asOf: Instant): Promise<readonly TEntity[]>;
  /** As-corrected: what we now believe was true then. */
  seriesAsCorrected(tx: Transaction, key: string, asOf: Instant): Promise<readonly TEntity[]>;
}

export interface Migration {
  readonly id: string;
  readonly schema: SchemaName;
  readonly description: string;
  up(tx: Transaction): Promise<void>;
  /** Forward-only in the POC; a down path exists for local development only. */
  down?(tx: Transaction): Promise<void>;
}

export {
  InMemoryUnitOfWork,
  InMemoryRepository,
  InMemoryImmutableStore,
  InMemoryAppendOnlyStore,
  ImmutabilityViolationError,
  type SeriesRow,
} from './in-memory.js';

export const PERSISTENCE_IMPLEMENTATION_STATE =
  'Contracts + in-memory implementations IMPLEMENTED (Phase 2). PostgreSQL adapters and DB-level immutability enforcement DEFERRED to Phase 5 — see migrations/ for the DDL and DR-012 for why it is unverified.' as const;
