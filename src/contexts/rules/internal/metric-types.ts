/**
 * The semantic metric contract.
 *
 * Authority: `METRIC_CATALOG.md` §1.1 — "One definition, one implementation, one owner context.
 * If two contexts need the same metric, one owns it and the other consumes it. Duplicate
 * implementations are drift."
 *
 * This file makes that enforceable rather than aspirational. `METRIC_CATALOG.md` is *generated*
 * from the registry below, and a test asserts the two cannot diverge. A metric that exists in the
 * document but not the registry, or vice versa, fails the build.
 *
 * Field set is fixed by the Phase 2 brief: id, name, business definition, formula, inputs, units,
 * source domain, owner, aggregation behaviour, currency behaviour, null/edge handling, applicable
 * contract types, effective date, version, evidence expectations.
 */
import type { CalendarDate } from '@platform/time';
import type { EpistemicLayer } from '@platform/provenance';

/** `MET-<DOMAIN>-<NNN>` — permanent, never reused (`METRIC_CATALOG.md` §1.2). */
export type MetricId = string & { readonly __metricIdBrand: unique symbol };

export function metricId(value: string): MetricId {
  if (!/^MET-(FIN|COM|DEL|QUA|RES|RSK|HLTH|FCST|DQ|REC|PORT)-\d{3}$/.test(value)) {
    throw new TypeError(`Not a metric ID (MET-<DOMAIN>-<NNN>): "${value}".`);
  }
  return value as MetricId;
}

export type MetricDomain =
  | 'FIN' | 'COM' | 'DEL' | 'QUA' | 'RES' | 'RSK' | 'HLTH' | 'FCST' | 'DQ' | 'PORT';

/** Semantic version of a *definition*. A formula change is a major bump. */
export type MetricSemVer = `${number}.${number}.${number}`;

/**
 * Metric lifecycle. Three states, deliberately.
 *
 * `Frozen` means the **semantic contract** is settled: meaning, formula, inputs, units, edge
 * handling, authority, epistemic level, version, aggregation, contract types and evidence
 * expectations. It does **not** mean every alert threshold that uses the metric has been decided
 * forever — thresholds live in `RuleDefinition` and stay configurable (Phase 2 closure, Decision 9).
 *
 * A metric is `Draft` only while its *meaning* is genuinely unresolved, never merely because a
 * calibration value is outstanding.
 */
export type MetricStatus = 'Draft' | 'Frozen' | 'Deprecated';

export type MetricUnit =
  | 'Money' | 'Money/hr' | 'Money/period'
  | 'Percent' | 'PercentagePoints' | 'Ratio' | 'Index'
  | 'Days' | 'Hours' | 'Weeks' | 'Periods' | 'FTE'
  | 'Count' | 'Count/period' | 'Score' | 'Rank'
  | 'RAG' | 'BandDistribution' | 'Boolean' | 'Tuple' | 'MoneyBreakdown';

/**
 * How the metric behaves when rolled up across projects.
 *
 * `WEIGHTED_MEAN` and `RECOMPUTE_FROM_INPUTS` exist because averaging percentages across projects
 * of different sizes is the single most visible arithmetic error this product could make
 * (`METRIC_CATALOG.md` §11, MET-PORT-002). A metric that declares `NOT_AGGREGATABLE` may not appear
 * in a portfolio total at all.
 */
export type AggregationBehaviour =
  | 'SUM'
  | 'WEIGHTED_MEAN'
  | 'RECOMPUTE_FROM_INPUTS'
  | 'COUNT'
  | 'DISTRIBUTION'
  | 'MIN'
  | 'MAX'
  | 'NOT_AGGREGATABLE';

/**
 * `FX_CONVERT_REQUIRED` means the metric cannot be summed across currencies without an explicit,
 * dated rate — enforced at runtime by `Money` throwing on mixed-currency arithmetic.
 */
export type CurrencyBehaviour = 'NONE' | 'SINGLE_CURRENCY' | 'FX_CONVERT_REQUIRED';

/** `METRIC_CATALOG.md` §1.1 rule 5 — `NOT_COMPUTABLE` is a first-class state. */
export interface EdgeHandling {
  /** What happens when the denominator is zero. `null` means the metric has no denominator. */
  readonly zeroDenominator: 'NOT_COMPUTABLE' | 'ZERO' | 'NOT_APPLICABLE';
  /** What happens when a required input is absent. */
  readonly missingInput: 'NOT_COMPUTABLE' | 'TREAT_AS_ZERO';
  /** Minimum history required, in weekly snapshots. 0 = computable from a single snapshot. */
  readonly minimumHistoryWeeks: number;
  /** Any additional gate, e.g. a maturity threshold below which the metric is meaningless. */
  readonly precondition?: string;
}

export type EngagementModel = 'FIXED_BID' | 'TIME_AND_MATERIALS' | 'CAPACITY';

/** Which baseline a variance is stated against. §1.1 rule 6: unnamed baseline = defect. */
export type BaselineRef = 'AS_SOLD' | 'CURRENT_CONTRACTUAL' | 'FORECAST' | 'ACTUAL_TO_DATE' | 'RECOVERY';

/** The accountable owner of the *definition*, not of the number. */
export type MetricOwner =
  | 'Finance'
  | 'Commercial'
  | 'Delivery'
  | 'Engineering'
  | 'People'
  | 'Risk'
  | 'Assurance'
  | 'Delivery Intelligence';

/**
 * What kind of claim the value is (Phase 2 closure, Decision 6; implements ADR-0011).
 *
 * **This describes the semantic meaning of the value, not whether its implementation is
 * deterministic.** A rule-based outlook is `L3_ASSESSED` because it is an assessment about project
 * state, even though the same inputs always produce the same output.
 *
 * | Level | Meaning | Examples |
 * | --- | --- | --- |
 * | `L1_OBSERVED` | Recorded by a person or a source system | Actual Cost; Recognised Revenue imported from Finance; Reported RAG |
 * | `L2_DERIVED` | A pure function of observed facts plus a versioned rule set | Forecast GM; Burn Gap; Performance-Implied EAC |
 * | `L3_ASSESSED` | A judgement about project state or its future | Trajectory; Forecast Confidence; Silent Deterioration Index |
 */
export type EpistemicLevel = 'L1_OBSERVED' | 'L2_DERIVED' | 'L3_ASSESSED';

/** The provenance envelope (ADR-0004 §1) speaks in L1/L2/L3; this is the single mapping. */
export function provenanceLayerOf(level: EpistemicLevel): EpistemicLayer {
  switch (level) {
    case 'L1_OBSERVED':
      return 'L1';
    case 'L2_DERIVED':
      return 'L2';
    case 'L3_ASSESSED':
      return 'L3';
  }
}

/**
 * Which system is authoritative for the value (Phase 2 closure, Decision 7).
 *
 * Use the **narrowest correct authority**. Delivery Intelligence is authoritative for `DERIVED` and
 * `RULE_ENGINE` values and for nothing else — it consumes the rest. This field is what makes
 * "we do not invent the accounting ledger" checkable rather than merely stated.
 */
export type AuthoritativeSourceType =
  | 'FINANCE_SYSTEM'
  | 'CONTRACT_SYSTEM'
  | 'DELIVERY_SYSTEM'
  | 'QUALITY_SYSTEM'
  | 'RESOURCE_SYSTEM'
  | 'COMMERCIAL_SYSTEM'
  | 'ASSURANCE_SYSTEM'
  | 'MANUAL_DECLARATION'
  | 'DERIVED'
  | 'RULE_ENGINE';

export interface MetricDefinition {
  readonly id: MetricId;
  readonly name: string;
  /** Plain-English statement a controller would accept. No formulas here. */
  readonly businessDefinition: string;
  /** Canonical formula, referencing other metric IDs or named L1 facts. */
  readonly formula: string;
  /** Metric IDs and L1 fact names this depends on. Drives the evidence chain (AC-3). */
  readonly inputs: readonly string[];
  readonly unit: MetricUnit;
  /** What kind of claim this is. Semantic, not a statement about determinism. */
  readonly epistemicLevel: EpistemicLevel;
  /** Which system is authoritative. `DERIVED`/`RULE_ENGINE` mean Delivery Intelligence itself. */
  readonly authoritativeSourceType: AuthoritativeSourceType;
  /** The bounded context that owns the implementation. Exactly one. */
  readonly sourceDomain: string;
  readonly owner: MetricOwner;
  readonly aggregation: AggregationBehaviour;
  readonly currencyBehaviour: CurrencyBehaviour;
  readonly edgeHandling: EdgeHandling;
  readonly applicableContractTypes: readonly EngagementModel[];
  readonly effectiveFrom: CalendarDate;
  readonly version: MetricSemVer;
  readonly status: MetricStatus;
  /** What must exist for a value of this metric to be defensible (REQ-DATA-010, AC-3). */
  readonly evidenceExpectations: readonly string[];
  /** Set where the metric is a variance. §1.1 rule 6. */
  readonly baseline?: BaselineRef;
  /** Rule set that parameterises it, if any, e.g. `VAR-v1`. */
  readonly ruleSet?: string;
  /**
   * The specific `RuleParameter` names this metric reads. Naming them is what separates a settled
   * *semantic contract* from an unsettled *calibration value* (Phase 2 closure, Decision 8): a
   * metric may be `Frozen` while every parameter listed here is still being argued about, because
   * changing a threshold does not change what the metric means.
   *
   * Required whenever `ruleSet` is set, and asserted by `validateRegistry()`.
   */
  readonly calibrationParameters?: readonly string[];
  readonly notes?: string;
}

/** An immutable historical record of one version of a definition (Phase 2 brief: MetricVersion). */
export interface MetricVersionRecord {
  readonly metricId: MetricId;
  readonly version: MetricSemVer;
  readonly effectiveFrom: CalendarDate;
  readonly formula: string;
  readonly supersedes?: MetricSemVer;
  readonly changeReason: string;
}
