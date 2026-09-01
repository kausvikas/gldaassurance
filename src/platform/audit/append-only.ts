/**
 * The audit log — append-only in code as well as in the schema.
 *
 * `migrations/0008` revokes `UPDATE`/`DELETE` from `gldi_app` and installs a rejecting trigger, so
 * the database enforces this for the persisted log. This in-process implementation is what the POC
 * runs against, and it enforces the same property by construction: `records` is private, `record()`
 * only pushes, and `query()` hands back frozen copies. There is no method that mutates a past entry
 * because there is no such operation in the model (`SECURITY_MODEL.md` §5.3).
 *
 * **Failure to audit fails the operation.** `record()` rejects rather than swallowing, and the
 * enforcement point awaits it before returning data. An audit sink that logs its own failure and
 * carries on is the control silently switching itself off.
 */
import { createHash } from 'node:crypto';
import type { Instant } from '@platform/time';
import type { ActorId, CorrelationId } from '@platform/authz';
import type { AuditQuery, AuditReader, AuditRecord, AuditSink } from './index.js';

/**
 * A before/after pair for a write, reduced to hashes.
 *
 * `SECURITY_MODEL.md` §5.2 asks for "before/after representation **or hash** where appropriate".
 * Hashes are the default here and the reason is §7: the audit log must not become a second copy of
 * `COMMERCIAL_CONFIDENTIAL` data sitting behind a different access rule. A hash proves the value
 * changed and proves what it changed to *if you already have the candidate value*, which is exactly
 * what an investigation has and an attacker does not.
 */
export interface ChangeFingerprint {
  readonly beforeHash: string | null;
  readonly afterHash: string;
  readonly changedFields: readonly string[];
}

/** SHA-256 over a stable serialisation. `null` before-state means the entity did not exist. */
export function fingerprint(before: unknown, after: unknown): ChangeFingerprint {
  const hash = (v: unknown): string =>
    createHash('sha256').update(stableStringify(v)).digest('hex');
  const changedFields = diffKeys(before, after);
  return {
    beforeHash: before === undefined || before === null ? null : hash(before),
    afterHash: hash(after),
    changedFields,
  };
}

/** Key order must not change the hash, or two identical states fingerprint differently. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function diffKeys(before: unknown, after: unknown): string[] {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObj(after)) return [];
  const b = isObj(before) ? before : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(after)]);
  return [...keys]
    .filter((k) => stableStringify(b[k]) !== stableStringify(after[k]))
    .sort();
}

export class AuditWriteFailed extends Error {
  constructor(cause: string) {
    super(`Audit write failed: ${cause}. The audited operation must not complete.`);
    this.name = 'AuditWriteFailed';
  }
}

/**
 * In-process append-only audit log.
 *
 * Ids are derived from the record content and its position, not from a clock or a random source, so
 * the same sequence of audited actions produces the same ids — which is what makes an audit
 * assertion in a test meaningful rather than incidental.
 */
export class InMemoryAuditLog implements AuditSink, AuditReader {
  readonly #records: AuditRecord[] = [];
  #sealed = false;

  async record(entry: Omit<AuditRecord, 'id'>): Promise<void> {
    if (this.#sealed) throw new AuditWriteFailed('the log is sealed');
    if (entry.actorId.length === 0) throw new AuditWriteFailed('no actor');
    if (entry.entityType.length === 0) throw new AuditWriteFailed('no entity type');
    const seq = this.#records.length;
    const id = createHash('sha256')
      .update(`${seq}:${stableStringify(entry)}`)
      .digest('hex')
      .slice(0, 32);
    this.#records.push(Object.freeze({ ...entry, id }));
    return Promise.resolve();
  }

  /**
   * REQ-SEC-007 — queryable by actor, entity and time window.
   *
   * Reading the audit log is itself an audited event (`SECURITY_MODEL.md` §5.3). This method does
   * **not** write that record: it would be auditing itself, and a sink that appends while being read
   * is a sink whose own reads are invisible. The enforcement point writes the `audit.read` record
   * before calling here, which is why `ctx` is required — it is the correlation the caller must
   * already have established.
   */
  query(criteria: AuditQuery, ctx: { readonly correlationId: CorrelationId }): Promise<readonly AuditRecord[]> {
    void ctx;
    const out = this.#records.filter((r) =>
      (criteria.actorId === undefined || r.actorId === criteria.actorId)
      && (criteria.entityType === undefined || r.entityType === criteria.entityType)
      && (criteria.entityId === undefined || r.entityId === criteria.entityId)
      && (criteria.from === undefined || r.occurredAt >= criteria.from)
      && (criteria.to === undefined || r.occurredAt <= criteria.to));
    return Promise.resolve(Object.freeze(out));
  }

  /** Everything, for test assertions and the demo audit view. Still a copy, still frozen. */
  all(): readonly AuditRecord[] {
    return Object.freeze([...this.#records]);
  }

  get size(): number {
    return this.#records.length;
  }

  /** Refuses further writes. Used to prove the failure path fails the operation. */
  seal(): void {
    this.#sealed = true;
  }
}

/** The subset of actions `SECURITY_ADMIN` may read (`SECURITY_MODEL.md` §4.4, audit access events). */
export const ACCESS_EVENT_ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILURE', 'SESSION_EXPIRY',
  'IMPERSONATION_START', 'IMPERSONATION_END',
] as const;

export function isAccessEvent(r: AuditRecord): boolean {
  return (ACCESS_EVENT_ACTIONS as readonly string[]).includes(r.action);
}

/** Narrow a result set to what the reader's role permits, applied after the read is authorised. */
export function accessEventsOnly(records: readonly AuditRecord[]): readonly AuditRecord[] {
  return records.filter(isAccessEvent);
}

/**
 * Narrow a result set to the entities the reader's scope actually covers.
 *
 * `SECURITY_MODEL.md` §4.2: *all* reads are computed over the caller's resolved entity set. The
 * audit log is a read like any other, and an auditor granted one business unit has no more business
 * seeing another unit's access history than seeing its margins — the history is arguably the more
 * revealing of the two, because it names who is looking at what.
 *
 * The rule is deliberately narrow: a record is dropped **only** when it names an entity that is
 * known to be a project and is not in the authorised set. A record about a session, a login, or a
 * collection-level read (`entityId === '*'`) names no project and is kept, because dropping the
 * security events an investigator needs in order to look tidy would defeat the purpose of the log.
 *
 * `knownEntityIds` is supplied by the application layer rather than queried here — this module
 * holds no data handle, and a filter that can look things up is a filter that can be made to look
 * them up for the wrong caller.
 */
export function withinAuthorisedEntities(
  records: readonly AuditRecord[],
  knownEntityIds: readonly string[],
  authorisedEntityIds: readonly string[],
): readonly AuditRecord[] {
  const known = new Set(knownEntityIds);
  const authorised = new Set(authorisedEntityIds);
  return records.filter((r) => !known.has(r.entityId) || authorised.has(r.entityId));
}

export type { ActorId };
