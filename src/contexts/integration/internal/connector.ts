/**
 * The enterprise connector contract (ADR-0037).
 *
 * One interface for Finance/ERP, CRM, PSA, ALM, Delivery Assurance, analytics and document
 * repositories. Adding a GlobalLogic system means writing an adapter — not touching the Assistant,
 * the planner, the metric engines or any surface. That is the property §26 of the Phase 13 contract
 * asks for, and it is only true because nothing above this interface knows which adapter it has.
 *
 * **There is no write method.** §78 lists enterprise write-back among the prohibited operations, and
 * the strongest available form of that prohibition is an interface in which the operation is
 * unrepresentable. "Write this back to Salesforce" is therefore not a permission that was withheld;
 * it is a method that does not exist, in a type nobody can widen from the outside.
 *
 * **No GlobalLogic schema, object name, endpoint or authentication method is invented here.** Where
 * the real schema is unknown, an adapter declares the canonical concepts it *would* supply and
 * carries a labelled synthetic fixture. Generic product knowledge of Salesforce is not evidence
 * about GlobalLogic's tenant, and the integration matrix records `SCHEMA DISCOVERED: NO` for every
 * such row.
 */
import type { Instant } from '@platform/time';
import type { CanonicalConcept } from './authority.js';
import type { SourceSystem } from './identity.js';

/**
 * The business domain a source belongs to. Drives grouping on the Knowledge & Connections surface
 * and nothing else — authority is per concept, never per domain (ADR-0035 §3).
 */
export type SourceDomain =
  | 'FINANCE_ERP'
  | 'CRM_COMMERCIAL'
  | 'PSA_RESOURCE'
  | 'ALM_DELIVERY'
  | 'DELIVERY_ASSURANCE'
  | 'ANALYTICS'
  | 'DOCUMENT_REPOSITORY'
  | 'FILE_UPLOAD'
  | 'SYNTHETIC_CANONICAL';

/**
 * Honest status (ADR-0037 §2).
 *
 * **`CONNECTED` is not a value in this enumeration.** It was the obvious name and it is exactly the
 * word that lets a fixture be mistaken for a live system, so the enumeration says what is actually
 * known instead: `REAL_VERIFIED` requires a `healthCheck` that succeeded against a real endpoint,
 * and nothing else can produce it.
 */
export type SourceStatus =
  | 'REAL_VERIFIED'
  /**
   * A file that was received, parsed and indexed.
   *
   * Added because the vocabulary was designed for connectors and had no state for an upload, so a
   * successfully ingested workbook was rendered as `CONFIGURED_UNVERIFIED` — whose stated meaning
   * is *"credentials and an endpoint are configured; no successful call has been made"*, which is
   * nonsense about a file and is exactly the kind of almost-right label this vocabulary exists to
   * prevent. It is deliberately **not** `REAL_VERIFIED`: nothing was verified against a system, and
   * whether the content is trustworthy is the authority column's question, not this one.
   */
  | 'INGESTED'
  | 'CONFIGURED_UNVERIFIED'
  | 'ADAPTER_READY'
  | 'FIXTURE'
  | 'NOT_CONFIGURED'
  | 'DEGRADED'
  | 'SYNCING'
  | 'ERROR'
  | 'MAPPING_REVIEW_REQUIRED'
  /**
   * Content that reached the store without the receipt describing how it got there.
   *
   * Produced by a defect rather than by a workflow, and kept as a status rather than swept up,
   * because sweeping it up is how a demo quietly stops matching the account it gives of itself. A
   * source in this state is **excluded from governed retrieval and from conflict detection** — its
   * rows exist and nothing will stand on them.
   */
  | 'LEGACY_INCOMPLETE';

export const STATUS_LABEL: Readonly<Record<SourceStatus, string>> = {
  REAL_VERIFIED: 'Connected and verified',
  INGESTED: 'Received and indexed',
  CONFIGURED_UNVERIFIED: 'Configured, not yet verified',
  ADAPTER_READY: 'Adapter ready, not configured',
  FIXTURE: 'Synthetic fixture',
  NOT_CONFIGURED: 'Not configured',
  DEGRADED: 'Degraded',
  SYNCING: 'Synchronising',
  ERROR: 'Error',
  MAPPING_REVIEW_REQUIRED: 'Mapping review required',
  LEGACY_INCOMPLETE: 'Legacy incomplete — pre-durability',
};

/** What a status means for the data. Rendered, so a reader never has to infer it from a colour. */
export const STATUS_MEANING: Readonly<Record<SourceStatus, string>> = {
  REAL_VERIFIED: 'A live endpoint responded to a health check and its schema was read.',
  INGESTED: 'The file was received, parsed and indexed. What it is trusted for is the authority column.',
  CONFIGURED_UNVERIFIED: 'Credentials and an endpoint are configured; no successful call has been made.',
  ADAPTER_READY: 'The adapter, mapping and tests exist. No endpoint or credential is configured.',
  FIXTURE: 'Synthetic demonstration data shaped like this source. Not a connection to any real system.',
  NOT_CONFIGURED: 'Nothing is configured for this source.',
  DEGRADED: 'The source responded but did not meet its freshness or completeness expectations.',
  SYNCING: 'A synchronisation is in progress.',
  ERROR: 'The last attempt failed. The previous known-good state is still shown, dated.',
  MAPPING_REVIEW_REQUIRED: 'The source structure changed. Ingestion is stopped until a mapping is re-approved.',
  LEGACY_INCOMPLETE: 'Ingested before durable storage existed, so its receipt was lost and how it '
    + 'arrived cannot be reconstructed. Not available for governed retrieval, and excluded from '
    + 'conflict detection. Retained rather than deleted so the record of what happened stays honest.',
};

export interface SourceHealth {
  readonly status: SourceStatus;
  readonly checkedAt: Instant | null;
  /** Plain-language detail. Never a raw endpoint, never a credential, never a stack trace. */
  readonly detail: string;
  readonly latencyMs: number | null;
}

/** A field as the source presents it, from `discoverSchema`. Never invented for an unknown system. */
export interface DiscoveredField {
  readonly name: string;
  readonly type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  readonly nullable: boolean;
  readonly sample: string | null;
}

export interface DiscoveredSchema {
  readonly entity: string;
  readonly fields: readonly DiscoveredField[];
  /** `false` for every fixture. The integration matrix renders this verbatim. */
  readonly discoveredFromLiveSystem: boolean;
  readonly schemaVersion: string;
}

/** One approved field → concept mapping. Low-confidence suggestions never become this silently. */
export interface FieldMapping {
  readonly sourceField: string;
  readonly concept: CanonicalConcept;
  readonly required: boolean;
  readonly confirmedBy: string;
}

export interface SchemaMapping {
  readonly mappingVersion: string;
  readonly entity: string;
  readonly schemaVersion: string;
  readonly identityField: string;
  readonly periodField: string | null;
  readonly fields: readonly FieldMapping[];
}

export type SyncMode = 'INITIAL' | 'INCREMENTAL';

export interface SyncRequest {
  readonly mode: SyncMode;
  /** Records changed since this watermark. Ignored for `INITIAL`. */
  readonly since: string | null;
  readonly maxRecords: number;
}

export interface SyncResult {
  readonly sourceId: string;
  readonly mode: SyncMode;
  readonly startedAt: Instant;
  readonly recordsRead: number;
  /** New idempotency keys. A re-run of the same sync produces zero (ADR-0008 §3). */
  readonly recordsNew: number;
  readonly recordsDuplicate: number;
  readonly recordsRejected: number;
  readonly watermark: string | null;
  readonly schemaVersion: string;
  readonly schemaDrift: boolean;
  readonly status: SourceStatus;
  readonly notes: readonly string[];
}

export interface SyncState {
  readonly lastAttemptedAt: Instant | null;
  readonly lastSuccessAt: Instant | null;
  readonly watermark: string | null;
  readonly consecutiveFailures: number;
}

export interface SourceProvenance {
  readonly sourceId: string;
  readonly system: SourceSystem;
  readonly domain: SourceDomain;
  readonly displayName: string;
  /** Every rendering of a fixture says so; this is the field that makes that non-optional. */
  readonly isFixture: boolean;
  readonly fixtureNotice: string | null;
}

/** A raw record as the adapter read it. Values are strings; nothing is coerced before staging. */
export interface RawRecord {
  readonly naturalKey: string;
  readonly sourceVersion: string;
  readonly observedAt: string | null;
  readonly fields: Readonly<Record<string, string>>;
}

/**
 * The contract every source adapter satisfies.
 *
 * Read-only, bounded, and honest about what it is. `preview` exists so a mapping can be reviewed
 * against real shapes before any ingestion happens — the alternative is discovering a mapping error
 * after it has already staged four thousand records.
 */
export interface EnterpriseConnector {
  readonly provenance: SourceProvenance;
  readonly suppliesConcepts: readonly CanonicalConcept[];
  healthCheck(): Promise<SourceHealth>;
  discoverSchema(): Promise<DiscoveredSchema | null>;
  preview(limit: number): Promise<readonly RawRecord[]>;
  mapSchema(): SchemaMapping | null;
  sync(request: SyncRequest): Promise<{ readonly result: SyncResult; readonly records: readonly RawRecord[] }>;
  getChanges(since: string): Promise<readonly RawRecord[]>;
  getLastSync(): SyncState;
  getProvenance(): SourceProvenance;
  getAuthorityMetadata(): readonly { readonly concept: CanonicalConcept; readonly proposedAuthority: string }[];
}

/**
 * Detects schema drift between what a mapping was approved against and what the source now presents.
 *
 * Drift **stops ingestion**; it never triggers a remap. An automatic remap is how a column rename
 * silently starts feeding "actual cost" from a column that now holds something else — and the
 * resulting number looks entirely normal (ADR-0037 §5).
 */
export function detectDrift(
  mapping: SchemaMapping, schema: DiscoveredSchema,
): { readonly drifted: boolean; readonly missing: readonly string[]; readonly added: readonly string[] } {
  const present = new Set(schema.fields.map((f) => f.name));
  const mapped = new Set(mapping.fields.map((f) => f.sourceField));
  const missing = [...mapped].filter((f) => !present.has(f)).sort();
  const added = [...present].filter((f) => !mapped.has(f)).sort();
  // A new column is not drift: sources add fields, and refusing to ingest because a source grew a
  // column would make every upstream release an outage. A *missing mapped* column is drift, because
  // the mapping is now describing something that is not there.
  return { drifted: missing.length > 0 || mapping.schemaVersion !== schema.schemaVersion, missing, added };
}
