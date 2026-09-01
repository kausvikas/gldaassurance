/**
 * Public surface — platform/explainability.
 *
 * Every assessment this system produces must be able to answer "why?" without a human re-deriving
 * it. REQ-HLTH-006: "Every rule firing yields a human-readable explanation citing inputs and
 * thresholds." AC-3: any headline number drills to the L1 facts behind it in ≤3 steps.
 *
 * The shape below is what makes that structural rather than a rendering convention. An engine that
 * returns a number without one of these is returning an assertion, and this product does not deal
 * in assertions.
 */
import type { Instant } from '@platform/time';
import type { RecordRef, RuleVersion } from '@platform/provenance';

/** Which way a signal is moving, independent of whether that is good or bad. */
export type SignalDirection = 'IMPROVING' | 'STABLE' | 'WORSENING' | 'NOT_COMPUTABLE';

/** How a rule's threshold was compared against the observed value. */
export type Comparison = 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ' | 'NEQ' | 'IN_BAND' | 'PRESENT';

export const COMPARISON_SYMBOL: Readonly<Record<Comparison, string>> = {
  LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=', NEQ: '≠', IN_BAND: 'within band', PRESENT: 'present',
};

/**
 * One rule firing (or not firing), with everything a reviewer needs to check it.
 *
 * `thresholdValue` is optional because a threshold may be **undecided** — MC-2, MC-3 and MC-5 are
 * still open. A rule whose threshold is unset does not fire and says so; it does not quietly assume
 * a number (`CLAUDE.md` invariant 4).
 */
/**
 * The five states a governed rule can be in (ADR-0026 D-1).
 *
 * **`fired === false` is not one state, it is three.** Before this existed, "did not apply",
 * "could not be computed" and "checked and clear" were indistinguishable to every consumer, and the
 * presentation layer guessed — wrongly, on all 13 affected projects.
 */
export type RuleEvaluationStatus =
  | 'FIRED'
  | 'CLEAR'
  | 'NOT_APPLICABLE'
  | 'NOT_COMPUTABLE'
  | 'CONFIGURATION_ERROR';

/**
 * Machine-readable cause. **This is the authoritative semantic state, not the prose.**
 *
 * A future assistant must never have to parse `notEvaluatedReason` to decide whether a control was
 * inapplicable, starved of evidence, or broken.
 */
/**
 * The epistemic state of an executive dimension input or rule signal (ADR-0028 D-1).
 *
 * Lives in `platform/explainability` rather than in `rules`: every domain engine must be able to
 * state what its own null MEANS, and a domain that had to import the rules context to say so would
 * invert the dependency the architecture gate protects.
 *
 * `KNOWN_ZERO` is a healthy **observation**, not an absence — the source reported and the answer is
 * zero. Distinguishing it from `NOT_COMPUTABLE` is what stops a dead telemetry feed reading as
 * excellent quality.
 */
export type SignalState =
  | 'OBSERVED'
  | 'KNOWN_ZERO'
  | 'NOT_APPLICABLE'
  | 'NOT_COMPUTABLE'
  | 'UNBOUNDED'
  | 'CONFIGURATION_ERROR';

export type NotEvaluatedReasonCode =
  | 'LIFECYCLE_NOT_APPLICABLE'
  | 'CONTRACT_TYPE_NOT_APPLICABLE'
  | 'NO_REMAINING_WORK'
  | 'RISK_OBJECT_ABSENT'
  | 'NO_REMAINING_DELIVERY_WINDOW'
  | 'INSUFFICIENT_EXECUTION_HISTORY'
  | 'REQUIRED_METRIC_NOT_COMPUTABLE'
  | 'REQUIRED_EVIDENCE_MISSING'
  | 'SIGNAL_BUILDER_MISSING'
  | 'THRESHOLD_UNDECIDED'
  | 'CONFIGURATION_ERROR';

export interface RuleEvaluation {
  /** The explicit state. Never infer it from `fired`. */
  readonly status: RuleEvaluationStatus;
  /** Set whenever `status` is not `FIRED` or `CLEAR`. */
  readonly notEvaluatedReasonCode?: NotEvaluatedReasonCode;
  /** The metric or fact this rule needs, so a consumer can say what is missing. */
  readonly requiredEvidence?: readonly string[];
  /** The subset of `requiredEvidence` that could not be produced. */
  readonly missingEvidence?: readonly string[];
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleSetId: string;
  readonly ruleVersion: RuleVersion;
  /** The metric or signal the rule looked at. */
  readonly signalId: string;
  readonly signalMetricId?: string;
  /** What the signal actually was, as a display string. `null` = not computable. */
  readonly observedValue: string | null;
  readonly comparison: Comparison;
  readonly thresholdValue?: string;
  /** Set when the rule could not be evaluated, naming what is missing. */
  readonly notEvaluatedReason?: string;
  readonly fired: boolean;
  /** How the signal has been moving, where a trend is available. */
  readonly trend?: SignalDirection;
  /** Currency impact attributable to this firing, where one is estimable. */
  readonly estimatedImpact?: { readonly amount: string; readonly currency: string };
  /** What this firing contributed to the outcome — points, a band shift, an override. */
  readonly contribution: string;
  /** A sentence a delivery director would accept without further explanation. */
  readonly narrative: string;
  /** The records this rests on. Empty is a defect, not an option (REQ-DATA-010). */
  readonly evidence: readonly RecordRef[];
}

/**
 * The full explanation behind one assessment.
 *
 * Carries the three versions that make a historical assessment reproducible: which rules were in
 * force, which metric definitions, and which health model (ADR-0004 §5).
 */
export interface Explanation {
  readonly outcome: string;
  readonly outcomeDetail?: string;
  readonly evaluatedAt: Instant;
  readonly ruleSetVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly healthModelVersion?: RuleVersion;
  readonly evaluations: readonly RuleEvaluation[];
  /** Evaluations that actually fired, in the order they were applied. */
  readonly firedRules: readonly string[];
  /** Rules that could not be evaluated because a threshold or an input is missing. */
  readonly unevaluatedRules: readonly string[];
  readonly evidence: readonly RecordRef[];
}

export class ExplanationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExplanationError';
  }
}

/**
 * Assembles an explanation, refusing the shapes that would make it useless.
 *
 * An assessment with no evaluations explains nothing, and a firing with no evidence cannot be
 * checked. Both are rejected here rather than caught in review.
 */
export function explain(args: {
  readonly outcome: string;
  readonly outcomeDetail?: string;
  readonly evaluatedAt: Instant;
  readonly ruleSetVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly healthModelVersion?: RuleVersion;
  readonly evaluations: readonly RuleEvaluation[];
}): Explanation {
  if (args.evaluations.length === 0) {
    throw new ExplanationError(
      `Assessment "${args.outcome}" has no rule evaluations. An assessment that cannot say what it ` +
        `looked at is an assertion (REQ-HLTH-006).`,
    );
  }
  for (const e of args.evaluations) {
    if (e.fired && e.evidence.length === 0) {
      throw new ExplanationError(
        `Rule "${e.ruleId}" fired with no evidence. A firing that cannot be traced to a record ` +
          `cannot be checked (REQ-DATA-010, AC-3).`,
      );
    }
  }
  const evidence = dedupeEvidence(args.evaluations.flatMap((e) => e.evidence));
  return {
    outcome: args.outcome,
    ...(args.outcomeDetail !== undefined ? { outcomeDetail: args.outcomeDetail } : {}),
    evaluatedAt: args.evaluatedAt,
    ruleSetVersion: args.ruleSetVersion,
    metricCatalogVersion: args.metricCatalogVersion,
    ...(args.healthModelVersion !== undefined ? { healthModelVersion: args.healthModelVersion } : {}),
    evaluations: args.evaluations,
    firedRules: args.evaluations.filter((e) => e.fired).map((e) => e.ruleId),
    unevaluatedRules: args.evaluations.filter((e) => e.notEvaluatedReason !== undefined).map((e) => e.ruleId),
    evidence,
  };
}

function dedupeEvidence(refs: readonly RecordRef[]): RecordRef[] {
  const seen = new Map<string, RecordRef>();
  for (const r of refs) {
    seen.set(`${r.context}|${r.entityType}|${r.entityId}|${r.metricId ?? ''}`, r);
  }
  return [...seen.values()];
}

/** Renders one evaluation as a line a human reads. Used by the acceptance-gate report. */
export function renderEvaluation(e: RuleEvaluation): string {
  if (e.notEvaluatedReason !== undefined) {
    return `  · ${e.ruleName}: NOT EVALUATED — ${e.notEvaluatedReason}`;
  }
  const cmp = e.thresholdValue === undefined
    ? COMPARISON_SYMBOL[e.comparison]
    : `${COMPARISON_SYMBOL[e.comparison]} ${e.thresholdValue}`;
  const impact = e.estimatedImpact ? `  [impact ${e.estimatedImpact.amount} ${e.estimatedImpact.currency}]` : '';
  const trend = e.trend && e.trend !== 'NOT_COMPUTABLE' ? `  (${e.trend.toLowerCase()})` : '';
  return `  ${e.fired ? '▲' : '·'} ${e.ruleName}: ${e.observedValue ?? 'not computable'} ${cmp}${trend}${impact}\n` +
    `      ${e.narrative}`;
}
