/**
 * Public surface — `integration`.
 *
 * Owns: the enterprise connector contract and its adapters, durable staging, identity resolution,
 * the source authority registry, conflict detection, ingestion receipts and data-context
 * classification. Tier 0 · Support · **Depends on nothing** — an adapter that imports its consumers
 * is not a seam, and an adapter that could reach the domain it feeds could resolve its own
 * conflicts.
 *
 * ADR-0008 was Proposed for eleven phases because no real source existed to justify it. Phase 13
 * supplies the sources, ADR-0035 promotes it, and this is where it lands.
 *
 * **The one thing to understand about this context.** Everything here is upstream of business
 * truth and nothing here decides business truth. It stages what a source said, resolves which
 * project the source meant, records which source is entitled to be believed about which concept, and
 * writes down the disagreements. What a *metric* is remains the metric catalogue's, and no registry
 * entry can change one — which is why the concept vocabulary here is deliberately separate from the
 * metric vocabulary rather than merged with it for convenience.
 */
import type { Instant } from '@platform/time';

export const CONTEXT_ID = 'integration' as const;

// ---------------------------------------------------------------------------
// Phase 2 contracts. Retained: the synthetic loader and MET-DQ-004 read these.
// ---------------------------------------------------------------------------

export type SourceSystemId = string & { readonly __sourceSystemIdBrand: unique symbol };
export type IngestionMode = 'BATCH' | 'EVENT' | 'CDC' | 'SYNTHETIC_SEED';

/**
 * Idempotency key: source system + source natural key + source version. Never a generated id,
 * never a payload hash — a payload hash makes a cosmetic source change look like new data, which
 * is how duplicate actuals enter a cost total (ADR-0008 §3).
 */
export type SourceRecordKey = string & { readonly __sourceRecordKeyBrand: unique symbol };

export interface DataSource {
  readonly id: SourceSystemId;
  readonly name: string;
  readonly mode: IngestionMode;
  /** Which domains this source feeds — drives MET-DQ-004 source coverage. */
  readonly domains: readonly string[];
  readonly expectedCadenceDays: number;
  readonly synthetic: true;
}

/** A record as it arrived, before canonicalisation. Staging keeps the original for disputes. */
export interface StagedRecord {
  readonly key: SourceRecordKey;
  readonly sourceSystemId: SourceSystemId;
  readonly observedAt: Instant;
  readonly receivedAt: Instant;
  readonly sourceVersion: string;
  readonly payload: unknown;
}

export interface SourceFreshness {
  readonly sourceSystemId: SourceSystemId;
  readonly mode: IngestionMode;
  readonly lastSuccessfulSyncAt?: Instant;
  readonly state: 'CURRENT' | 'STALE' | 'DEGRADED' | 'UNAVAILABLE';
  /** True when the surface is serving last known good rather than live data. */
  readonly servingLastKnownGood: boolean;
}

export interface IngestionService {
  sources(): Promise<readonly DataSource[]>;
  stage(records: readonly StagedRecord[]): Promise<void>;
  freshness(): Promise<readonly SourceFreshness[]>;
}

// ---------------------------------------------------------------------------
// Phase 13 (ADR-0008 Accepted, ADR-0035, ADR-0037).
// ---------------------------------------------------------------------------

export {
  type CanonicalConcept, type AuthorityGrant, type ConflictBehaviour,
  ALL_CONCEPTS, CONCEPT_LABEL, AUTHORITY_PROVENANCE,
  AuthorityConflict, SourceAuthorityRegistry,
} from './internal/authority.js';

export {
  type SourceSystem, type IdentityMapping, type IdentityResolution, type UnresolvedReason,
  ALL_SOURCE_SYSTEMS, ProjectIdentityHub,
} from './internal/identity.js';

export {
  type ValidationCode, type ValidationFinding, type StagedSourceRecord, type ConceptObservation,
  type IngestionReceipt, type Reconciliation,
  VALIDATION_MESSAGE, INGESTION_VERSION, idempotencyKey, reconcile,
} from './internal/staging.js';

export {
  type MaterialityPolicy, type ConflictEntry, type SourceConflict,
  POC_MATERIALITY, MATERIALITY_PROVENANCE, detectConflicts, isMaterial,
} from './internal/conflict.js';

export {
  type SourceDomain, type SourceStatus, type SourceHealth, type DiscoveredField,
  type DiscoveredSchema, type FieldMapping, type SchemaMapping, type SyncMode, type SyncRequest,
  type SyncResult, type SyncState, type SourceProvenance, type RawRecord, type EnterpriseConnector,
  STATUS_LABEL, STATUS_MEANING, detectDrift,
} from './internal/connector.js';

export const IMPLEMENTATION_STATE: string =
  'IMPLEMENTED (Phase 13, ADR-0008 Accepted 2026-09-03). Connector contract, authority registry, '
  + 'identity hub, staging, quarantine, conflict engine and receipts. Six enterprise adapters ship '
  + 'as clearly-labelled synthetic fixtures; none is represented as a live GlobalLogic connection.';
