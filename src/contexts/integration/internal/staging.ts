/**
 * Durable staging, validation findings, quarantine and the ingestion receipt (ADR-0008 §1-§7,
 * ADR-0036 §3).
 *
 * Three decisions from ADR-0008 are load-bearing here and are worth restating where the code is:
 *
 *   - **The idempotency key is source system + source natural key + source version.** Never a
 *     generated id, never a payload hash. A payload hash makes a cosmetic source change look like
 *     new data, which is precisely how duplicate actuals enter a cost total and how a margin figure
 *     becomes indefensible in front of a controller.
 *   - **All-or-nothing per batch.** Half-ingested financials are worse than none: the product would
 *     show a confidently wrong number rather than an obviously incomplete one.
 *   - **Staging retains the raw record as it arrived.** Canonicalisation is lossy; staging is where
 *     the loss is recoverable from when someone asks what the source actually sent.
 */
import type { DataContext, SourceAuthorityClass } from '@platform/provenance';
import type { Instant } from '@platform/time';
import type { CanonicalConcept } from './authority.js';
import type { UnresolvedReason } from './identity.js';

/**
 * Everything ingestion can find wrong with a record.
 *
 * Closed and specific, because "invalid row" is not an actionable finding. A user looking at 2
 * quarantined rows out of 75 needs to know whether they have a typo, a stale export or a missing
 * identity mapping, and those have three different fixes.
 */
export type ValidationCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_DATA_TYPE'
  | 'INVALID_DATE'
  | 'DUPLICATE_PROJECT_ID'
  | 'DUPLICATE_PERIOD_RECORD'
  | 'IMPOSSIBLE_PERCENTAGE'
  | 'PROHIBITED_NEGATIVE_AMOUNT'
  | 'CURRENCY_MISMATCH'
  | 'UNKNOWN_PROJECT'
  | 'UNKNOWN_ENUM_VALUE'
  | 'SCHEMA_DRIFT'
  | 'UNRESOLVED_IDENTITY'
  | 'AMBIGUOUS_MAPPING'
  | 'FORMULA_CELL_REJECTED';

export const VALIDATION_MESSAGE: Readonly<Record<ValidationCode, string>> = {
  MISSING_REQUIRED_FIELD: 'A field the mapping marks as required was empty.',
  INVALID_DATA_TYPE: 'The value is not a number where a number is required.',
  INVALID_DATE: 'The value is not a date this pipeline will accept (ISO 8601, or a recognised export format).',
  DUPLICATE_PROJECT_ID: 'The same project appears more than once in a file that permits one row per project.',
  DUPLICATE_PERIOD_RECORD: 'The same project and period appear more than once.',
  IMPOSSIBLE_PERCENTAGE: 'A percentage outside the range this concept permits.',
  PROHIBITED_NEGATIVE_AMOUNT: 'A negative amount where the concept cannot be negative.',
  CURRENCY_MISMATCH: 'The row states a currency the source is not registered to supply.',
  UNKNOWN_PROJECT: 'The project identifier does not resolve to a project in this portfolio.',
  UNKNOWN_ENUM_VALUE: 'A categorical value outside the governed vocabulary for that field.',
  SCHEMA_DRIFT: 'The source structure no longer matches the approved mapping.',
  UNRESOLVED_IDENTITY: 'No declared identity mapping links this source identifier to a project.',
  AMBIGUOUS_MAPPING: 'More than one declared mapping claims this source identifier.',
  FORMULA_CELL_REJECTED: 'The cell holds a formula with no cached value; formulas are never evaluated.',
};

export interface ValidationFinding {
  readonly code: ValidationCode;
  /** The mapped concept or column this concerns, in business terms where one exists. */
  readonly field: string;
  /** Human detail. Never the raw value where the value could be sensitive. */
  readonly detail: string;
}

/**
 * One record as the source sent it, plus what this pipeline decided about it.
 *
 * `raw` is kept verbatim. `observedAt` is when the source says the fact was true; `receivedAt` is
 * when we got it. Ordering is never assumed and late arrival is normal (ADR-0008 §4), which is only
 * expressible because those two are separate fields.
 */
export interface StagedSourceRecord {
  readonly idempotencyKey: string;
  readonly sourceId: string;
  readonly naturalKey: string;
  readonly sourceVersion: string;
  readonly observedAt: string | null;
  readonly receivedAt: Instant;
  readonly rowNumber: number;
  readonly raw: Readonly<Record<string, string>>;
  /** Resolved by the identity hub, or `null` when it did not resolve. */
  readonly projectId: string | null;
  readonly unresolvedReason: UnresolvedReason | null;
  readonly findings: readonly ValidationFinding[];
  readonly disposition: 'ACCEPTED' | 'QUARANTINED';
}

/** ADR-0008 §3. The one key that makes re-delivery a no-op instead of a double count. */
export function idempotencyKey(
  sourceId: string, naturalKey: string, sourceVersion: string,
): string {
  return `${sourceId}::${naturalKey}::${sourceVersion}`;
}

/**
 * One mapped observation, ready for authority resolution.
 *
 * `value` is a decimal **string** or a categorical token — never a number. Everything from here on
 * stays decimal-safe, so an ingested figure and a domain figure are compared under the same
 * arithmetic (ADR-0002).
 */
export interface ConceptObservation {
  readonly sourceId: string;
  readonly projectId: string;
  readonly concept: CanonicalConcept;
  readonly period: string;
  readonly value: string;
  readonly kind: 'NUMERIC' | 'CATEGORICAL';
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  readonly observedAt: string | null;
  readonly sourceVersion: string;
}

/**
 * The mandatory ingestion receipt (§45).
 *
 * Machine-readable and rendered. Every field is a count of something that actually happened, which
 * is what makes this the answer to "did the system learn this?" rather than an upload confirmation.
 * An ingestion with no receipt did not occur.
 */
export interface IngestionReceipt {
  readonly receiptId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceKind: 'FILE_UPLOAD' | 'CONNECTOR_SYNC' | 'DOCUMENT_UPLOAD';
  readonly fingerprint: string;
  readonly byteLength: number;
  readonly receivedAt: Instant;
  readonly effectiveDate: string | null;
  readonly recordsDetected: number;
  readonly recordsAccepted: number;
  readonly recordsQuarantined: number;
  readonly projectsMatched: number;
  readonly projectsUnresolved: number;
  readonly fieldsMapped: number;
  readonly fieldsIgnored: number;
  readonly conceptsMapped: readonly CanonicalConcept[];
  readonly conflictsDetected: number;
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  readonly mappingVersion: string;
  readonly ingestionVersion: string;
  /** Documents only. Pages parsed and chunks indexed. */
  readonly pagesParsed: number | null;
  readonly chunksIndexed: number | null;
  readonly parseCompleteness: 'COMPLETE' | 'PARSE_INCOMPLETE' | null;
  readonly notes: readonly string[];
}

/** The pipeline's own version. Bumped when mapping or validation semantics change. */
export const INGESTION_VERSION = 'INGEST-v1' as const;

/**
 * Reconciliation over a staged batch (ADR-0008 §6).
 *
 * A batch reconciles when the counts we produced agree with the counts the source declared. A
 * mismatch quarantines the **whole batch** for that context; partial application is prohibited,
 * because a partially applied financial batch is a confidently wrong number.
 */
export interface Reconciliation {
  readonly declaredRecordCount: number | null;
  readonly stagedRecordCount: number;
  readonly reconciled: boolean;
  readonly reason: string | null;
}

export function reconcile(
  declaredRecordCount: number | null, staged: readonly StagedSourceRecord[],
): Reconciliation {
  if (declaredRecordCount === null) {
    return {
      declaredRecordCount: null,
      stagedRecordCount: staged.length,
      // A source that declares no control total cannot be reconciled against one. That is recorded
      // as a stated absence rather than treated as a pass, so the receipt does not imply a check
      // that never ran.
      reconciled: true,
      reason: 'The source declared no control total; record-count reconciliation did not run.',
    };
  }
  const ok = declaredRecordCount === staged.length;
  return {
    declaredRecordCount,
    stagedRecordCount: staged.length,
    reconciled: ok,
    reason: ok ? null
      : `The source declared ${String(declaredRecordCount)} records and ${String(staged.length)} were staged. `
        + 'The batch is quarantined whole; partial application is prohibited (ADR-0008 §6).',
  };
}
