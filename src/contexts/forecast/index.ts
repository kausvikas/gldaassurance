/**
 * Public surface — `forecast`.
 * Owns: trajectory, deterioration detection, projected outturn, early warnings.
 * Tier 4 · Produces **L3** · Depends on: `rules`, `health`, `financial`.
 *
 * Layer note (CONFLICT C-2, ADR-0011): ARCHITECTURE_DECISIONS.md §4.2 lists this context as L2;
 * METRIC_CATALOG.md §9 and ADR-0004 §Consequences classify its outputs as **L3 inferred**. ADR-0004
 * governs — "'L3' means *inferred*, not *non-deterministic*."
 *
 * **BLOCKED:** the deterioration threshold (MC-6) is calibrated against the synthetic portfolio in
 * Phase 3.
 */
import type { Ratio } from '@platform/decimal';
import type { Provenance, RuleVersion } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'forecast' as const;

/** The trajectory window, named explicitly so a claim can always cite the weeks behind it. */
export interface TrajectoryWindow {
  readonly projectId: string;
  readonly weeks: readonly WeekId[];
}

export interface TrajectoryAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly window: TrajectoryWindow;
  /** MET-FCST-001 */ readonly healthSlope: Provenance<number>;
  /** MET-FCST-002 */ readonly deteriorating: Provenance<boolean>;
  /** MET-FCST-003 */ readonly weeksToAmber: Provenance<number | null>;
  /** MET-FCST-004 */ readonly marginSlope: Provenance<number>;
  /** MET-FCST-005 */ readonly projectedOutturnMargin: Provenance<Ratio>;
  /** MET-FCST-006 */ readonly signalConfluence: Provenance<number>;
  /** MET-FCST-007 */ readonly interventionWindowWeeks: Provenance<number | null>;
  /** MET-FCST-010 — the north-star ranking signal. */
  readonly silentDeteriorationIndex: Provenance<number>;
  readonly synthetic: true;
}

/**
 * A detected signal that has not yet become an intervention (REQ-RISK-002).
 * L3 — it must cite the evidence it rests on or it may not be produced (ADR-0004 §2).
 */
export interface EarlyWarning {
  readonly projectId: string;
  readonly detectedOn: CalendarDate;
  readonly signal:
    | 'SILENT_DETERIORATION' | 'ETC_OPTIMISM' | 'CONTINGENCY_BURN'
    | 'UNCOMPENSATED_SCOPE' | 'QUALITY_SPIRAL' | 'VELOCITY_INFEASIBLE'
    | 'ACCEPTANCE_STALL' | 'RESOURCE_COST_DRIFT';
  readonly narrative: Provenance<string>;
  /** The metric values that triggered it. An early warning with no evidence is not rendered. */
  readonly triggeringMetrics: readonly { readonly metricId: string; readonly value: string }[];
  readonly proposedInterventionId?: string;
  readonly synthetic: true;
}

export interface ForecastSnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  readonly trajectory: TrajectoryAssessment;
  readonly warnings: readonly EarlyWarning[];
  readonly synthetic: true;
}

export interface ForecastService {
  trajectory(projectId: string, week: WeekId): Promise<TrajectoryAssessment>;
  warnings(projectId: string, asOf: Instant): Promise<readonly EarlyWarning[]>;
}

// --- TrajectoryEngine, forward outlook and Green-at-Risk (Phase 4) -----------
export type {
  Observation, OutlookAssessment, OutlookBand, OutlookHorizon, SignalSeries, SignalTrend,
  TrajectoryEvaluation, TrajectoryEvaluationInput, TrajectoryState,
} from './internal/trajectory-engine.js';
export { evaluateTrajectory, slopeOf } from './internal/trajectory-engine.js';
export type {
  GreenAtRiskFinding, GreenAtRiskInput, GreenAtRiskReason, GreenAtRiskReasonCode,
} from './internal/green-at-risk.js';
export { assessGreenAtRisk } from './internal/green-at-risk.js';

// --- Early warning and late detection (Phase 10) -----------------------------
export type {
  ActionLinkInput, DetectedWarning, DispositionInput, EarlyWarningAssessment, EarlyWarningInput,
  HistoricalCoverage, LateDetectionCase, LateDetectionRate, WarningLifecycle, WarningSeverity,
} from './internal/early-warning-engine.js';
export {
  computeLateDetectionRate, evaluateEarlyWarnings, severityFor, thresholdMultipleOf,
} from './internal/early-warning-engine.js';

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); computation Phase 4; BLOCKED by MC-6' as const;
