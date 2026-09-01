/**
 * In-memory implementations of the persistence contracts.
 *
 * These are **not** test doubles that pretend. They enforce the same invariants the database must:
 * an immutable store rejects a second insert of the same key, and an append-only store rejects any
 * update. That makes the domain-level guarantee testable today, while the *authoritative* control
 * remains the database (revoked privileges plus a rejecting trigger — see
 * `migrations/`, ADR-0007 §Decision 3).
 *
 * Two controls, deliberately. `SECURITY_MODEL.md` and ADR-0003 both treat As-Sold immutability as a
 * control rather than a convention, and a single control that can be granted back by accident is
 * not one.
 */
import type { AppendOnlyStore, ImmutableStore, Repository, Transaction, UnitOfWork } from './index.js';

export class ImmutabilityViolationError extends Error {
  constructor(readonly entity: string, readonly id: string) {
    super(
      `${entity} "${id}" already exists and is immutable. As-Sold baselines and audit records are ` +
        `insert-once; a correction is a new record, never an update (ADR-0003 §Decision 1, REQ-DATA-003).`,
    );
    this.name = 'ImmutabilityViolationError';
  }
}

export class InMemoryUnitOfWork implements UnitOfWork {
  private sequence = 0;
  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    this.sequence += 1;
    return work({ id: `tx-${this.sequence}` });
  }
}

export class InMemoryRepository<TEntity, TId extends string> implements Repository<TEntity, TId> {
  protected readonly rows = new Map<TId, TEntity>();

  constructor(
    private readonly entityName: string,
    private readonly idOf: (e: TEntity) => TId,
  ) {}

  async findById(_tx: Transaction, id: TId): Promise<TEntity | undefined> {
    return this.rows.get(id);
  }

  async findMany(_tx: Transaction, ids: readonly TId[]): Promise<readonly TEntity[]> {
    return ids.map((id) => this.rows.get(id)).filter((e): e is TEntity => e !== undefined);
  }

  async upsert(_tx: Transaction, entity: TEntity): Promise<void> {
    this.rows.set(this.idOf(entity), entity);
  }

  get name(): string {
    return this.entityName;
  }

  get size(): number {
    return this.rows.size;
  }
}

/**
 * Insert-once store. There is deliberately **no update method** — the guarantee is expressed in the
 * type as well as at runtime, so the accidental version does not compile and the deliberate version
 * throws.
 */
export class InMemoryImmutableStore<TEntity, TId extends string>
  implements ImmutableStore<TEntity, TId>
{
  private readonly rows = new Map<TId, TEntity>();

  constructor(
    private readonly entityName: string,
    private readonly idOf: (e: TEntity) => TId,
  ) {}

  async insert(_tx: Transaction, entity: TEntity): Promise<void> {
    const id = this.idOf(entity);
    if (this.rows.has(id)) {
      throw new ImmutabilityViolationError(this.entityName, id);
    }
    this.rows.set(id, Object.freeze({ ...entity }));
  }

  async findById(_tx: Transaction, id: TId): Promise<TEntity | undefined> {
    return this.rows.get(id);
  }

  get size(): number {
    return this.rows.size;
  }
}

/** A row in an append-only series. Corrections append with a higher `correctionSeq`. */
export interface SeriesRow {
  readonly key: string;
  readonly week: string;
  readonly correctionSeq: number;
  readonly capturedAt: string;
  readonly corrects?: number;
}

/**
 * Append-only weekly series (ADR-0003 §Decision 3). Unique on `(key, week, correctionSeq)`.
 *
 * The two read methods are separate because they answer different questions and conflating them
 * would destroy the divergence signal: what we believed *then* versus what we now believe was true
 * then is exactly the evidence that a project was deteriorating unnoticed.
 */
export class InMemoryAppendOnlyStore<TEntity extends SeriesRow> implements AppendOnlyStore<TEntity> {
  private readonly rows: TEntity[] = [];

  constructor(private readonly entityName: string) {}

  async append(_tx: Transaction, entity: TEntity): Promise<void> {
    const clash = this.rows.find(
      (r) => r.key === entity.key && r.week === entity.week && r.correctionSeq === entity.correctionSeq,
    );
    if (clash) {
      throw new ImmutabilityViolationError(
        this.entityName,
        `${entity.key}/${entity.week}/seq${entity.correctionSeq}`,
      );
    }
    if (entity.correctionSeq > 0 && entity.corrects === undefined) {
      throw new TypeError(
        `A correction to ${this.entityName} must name the sequence it corrects (ADR-0003 §Decision 3).`,
      );
    }
    this.rows.push(Object.freeze({ ...entity }));
  }

  /** What we believed at `asOf`: the original write for each week, ignoring later corrections. */
  async seriesAsOf(_tx: Transaction, key: string, asOf: string): Promise<readonly TEntity[]> {
    return this.rows
      .filter((r) => r.key === key && r.capturedAt <= asOf && r.correctionSeq === 0)
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  /** What we now believe was true then: the highest correction for each week. */
  async seriesAsCorrected(_tx: Transaction, key: string, asOf: string): Promise<readonly TEntity[]> {
    const latest = new Map<string, TEntity>();
    for (const r of this.rows) {
      if (r.key !== key || r.capturedAt > asOf) continue;
      const held = latest.get(r.week);
      if (!held || r.correctionSeq > held.correctionSeq) latest.set(r.week, r);
    }
    return [...latest.values()].sort((a, b) => a.week.localeCompare(b.week));
  }

  get size(): number {
    return this.rows.length;
  }
}
