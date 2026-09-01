/**
 * Public surface — `rules`.
 *
 * Owns: versioned rule definitions, thresholds, weights, explanations, **and the metric registry**.
 * Tier 0 · Support · **Depends on nothing but platform** (ARCHITECTURE_DECISIONS.md §4.1 rule 5).
 *
 * ADR-0004 §5: rules are *data*, versioned and explainable. "Changing a threshold is a config
 * change with an audit record — never an edit inside a component or a query."
 *
 * The metric registry lives here for the same reason thresholds do: a metric definition is
 * versioned, effective-dated configuration that many contexts consume and none may fork. Placing it
 * in a context that depends on nothing means no owning context can quietly redefine another's
 * metric. `METRIC_CATALOG.md` is generated from this registry, and a test asserts they cannot
 * diverge.
 *
 * **Still BLOCKED:** `HEALTH-v1` thresholds (MC-3), weights (OQ-4/MC-2), `PRIORITY-v1`
 * intervenability (MC-5), and the `TRAJECTORY-v1` deterioration threshold (MC-6). Metric
 * *structure* is frozen; those *parameters* are not, and the registry marks every affected metric
 * `Draft`.
 */
import type { RuleVersion } from '@platform/provenance';
import type { CalendarDate, Instant } from '@platform/time';

export const CONTEXT_ID = 'rules' as const;

export type RuleSetId =
  | 'HEALTH'
  | 'RECOVERY'
  | 'VAR'
  | 'PRIORITY'
  | 'DQ'
  | 'TRAJECTORY'
  | 'EAC'
  /** POC only. In production Finance supplies recognised revenue; there is no policy here to apply. */
  | 'RECOGNITION';

/**
 * A threshold or weight, as data. Never a constant compiled into a component.
 *
 * Exactly one of `value` and `blockedBy` is present. An undecided parameter still *exists*, is
 * named, and carries the register item and owner who must supply it — `value: undefined` is a
 * different claim from `value: '0'`, and the schema enforces the same rule at rest
 * (`migrations/0007`, `rules.rule_parameter`).
 */
export type RuleParameter =
  | { readonly name: string; readonly unit: string; readonly value: string; readonly blockedBy?: undefined }
  | { readonly name: string; readonly unit: string; readonly value?: undefined; readonly blockedBy: string };

export interface RuleDefinition {
  readonly id: RuleSetId;
  readonly version: RuleVersion;
  readonly effectiveFrom: CalendarDate;
  readonly effectiveTo?: CalendarDate;
  readonly parameters: readonly RuleParameter[];
  readonly description: string;
}

/**
 * A record that a rule was applied, with what it saw and what it concluded.
 * This is what lets Phase 12 answer "why did this project show Amber in June?"
 */
export interface RuleEvaluation {
  readonly ruleSetId: RuleSetId;
  readonly ruleVersion: RuleVersion;
  readonly evaluatedAt: Instant;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly explanation: RuleExplanation;
}

/** REQ-HLTH-006 — structured so the UI renders it and the audit log stores it. */
export interface RuleExplanation {
  readonly ruleName: string;
  readonly ruleVersion: RuleVersion;
  readonly inputs: readonly { readonly name: string; readonly value: string }[];
  readonly threshold: string;
  readonly comparison: string;
  readonly contribution: string;
}

/** The versioned weighting model behind MET-HLTH-010, separate from the thresholds. */
export interface HealthModelVersion {
  readonly version: RuleVersion;
  readonly effectiveFrom: CalendarDate;
  readonly dimensionWeights: readonly { readonly dimension: string; readonly weight: string }[];
  readonly approvedBy?: string;
  readonly blockedBy?: string;
}

export interface RulesService {
  /** The rule set in force at a given instant — this is what makes history reproducible. */
  ruleSetAt(id: RuleSetId, asOf: Instant): Promise<RuleDefinition | undefined>;
  ruleSetByVersion(version: RuleVersion): Promise<RuleDefinition | undefined>;
  healthModelAt(asOf: Instant): Promise<HealthModelVersion | undefined>;
}

// --- The semantic metric contract -------------------------------------------
export type {
  MetricId,
  MetricDefinition,
  EpistemicLevel,
  AuthoritativeSourceType,
  MetricVersionRecord,
  MetricDomain,
  MetricSemVer,
  MetricStatus,
  MetricUnit,
  AggregationBehaviour,
  CurrencyBehaviour,
  EdgeHandling,
  EngagementModel,
  BaselineRef,
  MetricOwner,
} from './internal/metric-types.js';
export { metricId, provenanceLayerOf } from './internal/metric-types.js';
export {
  METRIC_REGISTRY,
  METRIC_VERSION_HISTORY,
  PHASE_2_DEFINITION_REFINEMENTS,
  type RegistryViolation,
  findMetric,
  metricsOwnedBy,
  metricInputsOf,
  validateRegistry,
} from './internal/registry/index.js';

export {
  type TrajectoryObservationPolicy,
  type TrajectoryWindowType,
  type RecencyWeighting,
  TRAJECTORY_OBSERVATION_POLICIES,
  policyFor,
  policiesForMetric,
} from './internal/trajectory-policy.js';

export {
  RULE_SETS,
  HEALTH_MODEL_VERSIONS,
  openCalibration,
} from './internal/rule-sets.js';

// --- RuleEngine and versioned models (Phase 4) -------------------------------
export type {
  ThresholdRule, SignalReading, RuleSeverity, RuleApplicabilityContext, ApplicabilityVerdict,
} from './internal/engine.js';
export type { SignalState } from '@platform/explainability';
export { signalStateOf } from './internal/engine.js';
export { evaluateRule, evaluateRules, normaliseToScore } from './internal/engine.js';
export type {
  HealthModel, DimensionDefinition, DimensionInput, ExecutiveDimension, AnalyticalDimension,
} from './internal/health-model.js';
export {
  HEALTH_MODELS, HEALTH_MODEL_V1, HEALTH_MODEL_V2, defaultHealthModel, healthModelAt,
  validateHealthModel,
} from './internal/health-model.js';
export {
  ALL_HEALTH_RULES, BAND_THRESHOLDS, ELEVATION_RULES, HARD_OVERRIDE_RULES,
} from './internal/override-rules.js';

// --- Early-warning rules (Phase 10) ------------------------------------------
export type { WarningSeverityBand } from './internal/early-warning-rules.js';
export {
  EARLY_WARNING_RULES, EARLY_WARNING_RULE_VERSION, WARNING_SEVERITY_BANDS,
} from './internal/early-warning-rules.js';

export const IMPLEMENTATION_STATE =
  'Metric registry and rule-set definitions IMPLEMENTED (Phase 2 closure): 138 metrics, 135 Frozen. Rule *evaluation* STUBBED — target Phase 4. Calibration values for HEALTH-v1, TRAJECTORY-v1, DQ-v1 and PRIORITY-v1 remain open and are named with owners in RULE_SETS.' as const;
