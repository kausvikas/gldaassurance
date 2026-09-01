/**
 * Public surface — `integration`.
 * Owns: data sources, adapter seams, durable staging, freshness.
 * Tier 0 · Support · Depends on: nothing — an adapter that imports its consumers is not a seam.
 *
 * POC: synthetic loader only (PRODUCT_SPEC.md §4.2). The full ingestion model is proposed as
 * **ADR-0008** and is not implemented.
 */
import type { Instant } from '@platform/time';

export const CONTEXT_ID = 'integration' as const;

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

export const IMPLEMENTATION_STATE =
  'Contracts IMPLEMENTED (Phase 2); synthetic loader Phase 3; adapter model BLOCKED pending ADR-0008' as const;
