/**
 * Public surface — `assurance`.
 * Owns: reviews, findings, evidence records, evidence retention.
 * Tier 2 · Produces L1 · Depends on: nothing.
 *
 * The audit *sink* is a platform contract; this context is the assurance-facing read model over it
 * plus review and evidence records. Reading the audit log is itself audited (SECURITY_MODEL.md
 * §5.3) — enforced at the Application layer, not here.
 */
import type { AuditQuery, AuditRecord } from '@platform/audit';
import type { RecordRef } from '@platform/provenance';
import type { CalendarDate, Instant } from '@platform/time';

export const CONTEXT_ID = 'assurance' as const;

export type ReviewId = string & { readonly __reviewIdBrand: unique symbol };
export type EvidenceRecordId = string & { readonly __evidenceRecordIdBrand: unique symbol };

export interface AssuranceReview {
  readonly id: ReviewId;
  readonly projectId: string;
  readonly conductedOn: CalendarDate;
  readonly reviewerActorId: string;
  readonly kind: 'GATE' | 'DEEP_DIVE' | 'COMMERCIAL' | 'QUALITY' | 'RECOVERY';
  readonly findings: readonly AssuranceFinding[];
  readonly synthetic: true;
}

export interface AssuranceFinding {
  readonly description: string;
  readonly severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'OBSERVATION';
  readonly ownerActorId: string;
  readonly dueOn?: CalendarDate;
  readonly closedOn?: CalendarDate;
}

/**
 * A materialised, retained pointer to the records behind a derived value.
 *
 * `RecordRef` (platform) is the *reference*; this is the durable record that the reference resolved
 * to something real at assessment time — which is what makes AC-3 answerable months later, after
 * the underlying snapshot has been corrected.
 */
export interface EvidenceRecord {
  readonly id: EvidenceRecordId;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly metricId?: string;
  readonly ref: RecordRef;
  readonly capturedAt: Instant;
  readonly contentHash: string;
  readonly synthetic: true;
}

export interface AssuranceService {
  reviews(projectId: string): Promise<readonly AssuranceReview[]>;
  evidenceFor(subjectType: string, subjectId: string): Promise<readonly EvidenceRecord[]>;
  /** The Application layer has already authorised and audited this call. */
  auditTrail(criteria: AuditQuery): Promise<readonly AuditRecord[]>;
}

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); behaviour Phase 5' as const;
