/**
 * Public surface — `data-quality`.
 * Owns: completeness, freshness, consistency, source coverage, confidence scoring.
 * Tier 3 · Produces L2 · Depends on: `rules` only.
 *
 * Fact contexts implement `DataQualityProbe` and the Application layer registers them, so adding a
 * fact domain does not widen this context's import surface (ADR-0012, Proposed).
 *
 * MET-DQ-006 is deliberately a **tuple**, never a product: a project may be confidently Red or
 * unreliably Green, and blending them destroys the distinction PRODUCT_SPEC.md §3.4 exists to
 * preserve.
 */
import type { Ratio } from '@platform/decimal';
import type { ConfidenceBand, Provenance, RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'data-quality' as const;

/** Implemented by each fact context. A domain reports what it has; it does not score itself. */
export interface DataQualityProbe {
  readonly domain: string;
  observe(projectId: string, asOf: Instant): Promise<DomainObservation>;
}

export interface DomainObservation {
  readonly domain: string;
  readonly requiredFields: number;
  readonly populatedFields: number;
  readonly mostRecentUpdateAt?: Instant;
  readonly assertionsEvaluated: number;
  readonly assertionsPassed: number;
  /** Named failures, so a consistency drop can be explained rather than merely reported. */
  readonly failedAssertions: readonly string[];
}

/** Per-source freshness as observed by `integration`, consumed here. */
export interface DataFreshness {
  readonly domain: string;
  readonly lastUpdateAt?: Instant;
  readonly ageDays: number;
  readonly expectedCadenceDays: number;
  readonly stale: boolean;
}

export interface DataQualityAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  /** MET-DQ-001 */ readonly completeness: Provenance<Ratio>;
  /** MET-DQ-002 */ readonly freshnessDays: Provenance<number>;
  /** MET-DQ-003 */ readonly consistency: Provenance<Ratio>;
  /** MET-DQ-004 */ readonly sourceCoverage: Provenance<Ratio>;
  /** MET-DQ-005 */ readonly confidenceScore: Provenance<number>;
  readonly band: ConfidenceBand;
  /** MET-DQ-007 — whether this team's forecasts have historically held. */
  readonly forecastConfidenceScore: Provenance<number>;
  readonly perDomain: readonly DataFreshness[];
  readonly synthetic: true;
}

export interface DataQualityService {
  /** Pure over supplied observations — never reaches into a fact context itself. */
  assess(
    projectId: string,
    week: WeekId,
    observations: readonly DomainObservation[],
  ): Promise<DataQualityAssessment>;
}

// --- DataConfidence and ForecastConfidence engines (Phase 4) -----------------
export type {
  DataConfidenceAssessment, DataConfidenceInput, DataConfidenceWeights, DomainObservationInput,
  ForecastConfidenceAssessment, ForecastConfidenceInput, ForecastConfidenceWeights,
  ReliabilityFactor, ReliabilityFactorResult,
} from './internal/confidence-engine.js';
export {
  assessDataConfidence, assessForecastConfidence, forecastReliabilityProfile,
} from './internal/confidence-engine.js';

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); computation Phase 4' as const;
