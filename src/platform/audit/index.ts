/**
 * Public surface — platform/audit.
 *
 * **Contracts only. Phase 5 implements them.** (REQ-SEC-006, REQ-SEC-007, ADR-0005 §6.)
 *
 * The record shape is fixed by SECURITY_MODEL.md §5.2 and reproduced here verbatim so that
 * a change to it is a visible change to a governed artifact rather than a field quietly
 * appearing in a log line.
 */
import type { Instant } from '@platform/time';
import type {
  ActorId,
  CorrelationId,
  Decision,
  Role,
} from '@platform/authz';
import type { RuleVersion } from '@platform/provenance';

export type AuditAction =
  | 'READ'
  | 'WRITE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILURE'
  | 'SESSION_EXPIRY'
  | 'IMPERSONATION_START'
  | 'IMPERSONATION_END'
  | 'ASSISTANT_QUERY'
  | 'OVERRIDE'
  | 'RULE_CHANGE';

/** SECURITY_MODEL.md §5.2. */
export interface AuditRecord {
  readonly id: string;
  readonly occurredAt: Instant;
  readonly actorId: ActorId;
  readonly actorRole: Role;
  readonly impersonatorId?: ActorId;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly fields: readonly string[];
  readonly decision: Decision;
  readonly reason?: string;
  readonly correlationId: CorrelationId;
  readonly ruleVersion?: RuleVersion;
  readonly sourceIp: string;
  readonly userAgent: string;
}

/**
 * STUB — Phase 5.
 *
 * Contract obligations the implementation must honour (SECURITY_MODEL.md §5.3):
 *   - append-only; the application database role holds no UPDATE/DELETE on the audit table;
 *   - written in the same transaction as the audited write — a failure to audit fails the
 *     operation;
 *   - denials are recorded as well as grants;
 *   - reading the audit log is itself audited.
 */
export interface AuditSink {
  record(entry: Omit<AuditRecord, 'id'>): Promise<void>;
}

/** REQ-SEC-007 — queryable by actor, entity, and time window. */
export interface AuditQuery {
  readonly actorId?: ActorId;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly from?: Instant;
  readonly to?: Instant;
}

export interface AuditReader {
  query(criteria: AuditQuery, ctx: { readonly correlationId: CorrelationId }): Promise<readonly AuditRecord[]>;
}

// --- Append-only implementation (Phase 5) -----------------------------------
export type { ChangeFingerprint } from './append-only.js';
export {
  ACCESS_EVENT_ACTIONS, AuditWriteFailed, InMemoryAuditLog,
  accessEventsOnly, fingerprint, isAccessEvent, withinAuthorisedEntities,
} from './append-only.js';

export const AUDIT_IMPLEMENTATION_STATE =
  'IMPLEMENTED in process (Phase 5) — append-only by construction, before/after fingerprints, failure fails the operation. NOT DURABLE: the log does not survive a restart, is not tamper-resistant against a privileged infrastructure actor, has no retention, and has never been exercised with concurrent durable writers. The PostgreSQL sink is debt DR-024.' as const;
