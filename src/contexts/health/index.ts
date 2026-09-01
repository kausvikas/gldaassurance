/**
 * Public surface — `health`.
 * Owns: composite scoring, RAG assessment, divergence, contribution breakdown.
 * Tier 3 · Produces L2 · Depends on: `rules` + the six fact domains.
 *
 * Three RAG values coexist and are always stored and surfaced separately (PRODUCT_SPEC.md §3.3).
 * MET-HLTH-030, the divergence between Reported and System-Assessed, is the flagship signal and
 * must never be averaged into the composite.
 *
 * **BLOCKED:** dimension weights (OQ-4/MC-2) and `HEALTH-v1` thresholds (MC-3).
 */
import type { Provenance, RuleVersion } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { RuleExplanation } from '@contexts/rules';

export const CONTEXT_ID = 'health' as const;

export type Rag = 'RED' | 'AMBER' | 'GREEN';

export type HealthDimension =
  | 'FINANCIAL' | 'SCHEDULE' | 'SCOPE_COMMERCIAL' | 'QUALITY' | 'RESOURCE' | 'RISK';

/** L1 — what the delivery team declared. Feeds MET-HLTH-012. */
export interface StatusReport {
  readonly projectId: string;
  readonly reportedOn: CalendarDate;
  readonly reportedRag: Rag;
  readonly commentary: string;
  readonly reportedByActorId: string;
  readonly synthetic: true;
}

/**
 * An authorised human decision (REQ-HLTH-007). Actor, reason, timestamp and expiry are all
 * required — an override without an expiry is a permanent silent adjustment.
 */
export interface RagOverride {
  readonly projectId: string;
  readonly rag: Rag;
  readonly reason: string;
  readonly actorId: string;
  readonly appliedAt: Instant;
  readonly expiresAt: Instant;
  readonly synthetic: true;
}

/** MET-HLTH-032 — the first drill step of the evidence chain (AC-3). */
export interface DimensionContribution {
  readonly dimension: HealthDimension;
  readonly score: number;
  readonly weight: string;
  readonly contribution: number;
  readonly explanation: RuleExplanation;
}

export interface RagAssessment {
  /** MET-HLTH-012 — L1. */ readonly reported: Provenance<Rag>;
  /** MET-HLTH-011 — L2. */ readonly systemAssessed: Provenance<Rag>;
  readonly override?: Provenance<Rag>;
  /** MET-HLTH-013 */ readonly effective: Provenance<Rag>;
  /** MET-HLTH-030 — positive means reported healthier than the evidence. */
  readonly divergence: Provenance<number>;
  /** MET-HLTH-031 */ readonly divergencePersistenceWeeks: Provenance<number>;
}

/**
 * Every assessment references the snapshots and rule versions that produced it, so a historical
 * assessment is reproducible (ADR-0004 §5, REQ-HLTH-005).
 */
export interface HealthAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly healthModelVersion: RuleVersion;
  /** The snapshot rows this assessment read. Named, not implied. */
  readonly snapshotRefs: readonly { readonly context: string; readonly week: WeekId; readonly correctionSeq: number }[];
  /** MET-HLTH-010 */ readonly compositeScore: Provenance<number>;
  readonly contributions: readonly DimensionContribution[];
  readonly rag: RagAssessment;
  readonly synthetic: true;
}

export interface HealthService {
  assess(projectId: string, week: WeekId): Promise<HealthAssessment>;
  /** Reproduces a historical assessment under the ruleset in force then. */
  reproduce(projectId: string, week: WeekId, ruleVersion: RuleVersion): Promise<HealthAssessment>;
}

// --- HealthAssessmentEngine (Phase 4) ---------------------------------------
export type {
  AssessmentStatus, DimensionScore, HealthEvaluation, HealthEvaluationInput, MissingDimension,
  RuleCoverage,
  StatusConflict,
} from './internal/health-engine.js';
export { evaluateHealth, ratioToSignal, toProvenance } from './internal/health-engine.js';

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); scoring Phase 4; BLOCKED by OQ-4/MC-2 and MC-3' as const;
