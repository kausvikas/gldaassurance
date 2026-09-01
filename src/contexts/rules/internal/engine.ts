/**
 * The rule engine.
 *
 * ADR-0004 §5: rules are *data*. This evaluates them and emits a `RuleEvaluation` for every rule it
 * considered — including the ones that did **not** fire, and the ones it could not evaluate because
 * a threshold is still undecided. An engine that reports only what fired cannot be audited: you
 * cannot tell the difference between "we checked and it was fine" and "we never looked".
 *
 * Nothing here knows what a project is. It compares a value to a threshold and says so.
 */
import { type Quantity, qCompare, qNormaliseScore } from '@platform/decimal';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type {
  Comparison, NotEvaluatedReasonCode, RuleEvaluation, RuleEvaluationStatus, SignalDirection,
  SignalState,
} from '@platform/explainability';

/**
 * The governed facts an applicability predicate may consider (ADR-0026 D-2).
 *
 * Deliberately small and deliberately **not** `lifecycleStage` alone: measured on the demo
 * portfolio, keying applicability off the stage label misclassifies 3 of 13 projects. What decides
 * whether a forward-looking delivery rule applies is remaining work, remaining window and elapsed
 * delivery time.
 */
export interface RuleApplicabilityContext {
  /** `MET-DEL-016`, 0-1. `null` where nothing has been claimed. */
  readonly physicalCompletion: Quantity | null;
  /** Days from today to the baseline completion date. Negative once it has passed. */
  readonly daysToBaselineCompletion: number | null;
  /** Whole weeks of delivery elapsed since the project started. */
  readonly elapsedDeliveryWeeks: number | null;
  /** The window `MET-DEL-019` needs before a demonstrated velocity can exist at all. */
  readonly velocityWindowWeeks: number;
  readonly contractType: string;
  readonly lifecycleStage: string;
}

export interface ApplicabilityVerdict {
  readonly applicable: boolean;
  readonly reasonCode?: NotEvaluatedReasonCode;
  readonly reasonText?: string;
}

export type RuleSeverity = 'OVERRIDE' | 'WARNING' | 'INFORMATIONAL';

/** The state a reading resolves to, applying the conservative default for an unstated null. */
export function signalStateOf(reading: SignalReading | undefined): SignalState {
  if (reading === undefined) return 'NOT_COMPUTABLE';
  if (reading.state !== undefined) return reading.state;
  if (reading.adverseState === 'UNBOUNDED') return 'UNBOUNDED';
  return reading.value === null ? 'NOT_COMPUTABLE' : 'OBSERVED';
}

/**
 * A threshold rule, as data.
 *
 * `threshold` is optional. A rule whose threshold has not been decided is **not** silently skipped
 * and **not** given a default — it is evaluated to `notEvaluatedReason` and reported. That is the
 * difference between a control that is off and a control nobody has configured.
 */
export interface ThresholdRule {
  readonly id: string;
  readonly name: string;
  readonly ruleSetId: string;
  readonly ruleVersion: RuleVersion;
  readonly signalId: string;
  readonly signalMetricId?: string;
  readonly comparison: Comparison;
  readonly threshold?: string;
  readonly severity: RuleSeverity;
  /** What firing means, in the language of the person reading it. */
  readonly narrativeWhenFired: string;
  readonly narrativeWhenClear: string;
  /** What a firing does to the outcome. For an OVERRIDE this is the forced band. */
  readonly effect: string;
  readonly blockedBy?: string;
  /**
   * Governed applicability, evaluated **before** computability (ADR-0026 D-2).
   *
   * Absent means the rule applies wherever it is evaluated — which is correct for most economic
   * rules (a negative forecast margin is a negative forecast margin at any lifecycle stage).
   */
  readonly applicability?: (ctx: RuleApplicabilityContext) => ApplicabilityVerdict;
  /** The metrics/facts this rule needs, so a consumer can name what is missing. */
  readonly requiredEvidence?: readonly string[];
}

export interface SignalReading {
  readonly signalId: string;
  /** Decimal string, or `null` when the metric is NOT_COMPUTABLE. */
  readonly value: string | null;
  readonly trend?: SignalDirection;
  readonly evidence: readonly RecordRef[];
  readonly estimatedImpact?: { readonly amount: string; readonly currency: string };
  /** Present when the signal itself could not be computed, e.g. a zero denominator. */
  readonly notComputableReason?: string;
  /**
   * An **observed** adverse state with no finite value (ADR-0027 D-2).
   *
   * `UNBOUNDED` breaches any finite upper threshold and scores at the red edge. It is not missing
   * evidence and must never be handled with the `value === null` branch.
   */
  readonly adverseState?: 'UNBOUNDED';
  /**
   * The epistemic state of this reading (ADR-0028 D-1).
   *
   * **A `null` value with no state is forbidden**, and defaults to `NOT_COMPUTABLE` — the
   * conservative reading — so an un-migrated caller cannot silently produce the optimistic one.
   * `NOT_APPLICABLE` means the risk object does not exist here; `NOT_COMPUTABLE` means it could and
   * the evidence does not. Only the first is safe to renormalise away.
   */
  readonly state?: SignalState;
  /** Machine-readable cause, for any state other than OBSERVED/KNOWN_ZERO. */
  readonly stateReasonCode?: NotEvaluatedReasonCode;
}

function compare(observed: Quantity, comparison: Comparison, threshold: Quantity): boolean {
  const c = qCompare(observed, threshold);
  switch (comparison) {
    case 'LT': return c < 0;
    case 'LTE': return c <= 0;
    case 'GT': return c > 0;
    case 'GTE': return c >= 0;
    case 'EQ': return c === 0;
    case 'NEQ': return c !== 0;
    case 'IN_BAND': return qCompare(observed.startsWith('-') ? observed.slice(1) : observed, threshold) <= 0;
    case 'PRESENT': return true;
  }
}

/** Evaluates one rule against one reading. Always returns an evaluation — never throws, never skips. */
export function evaluateRule(
  rule: ThresholdRule,
  reading: SignalReading | undefined,
  /** Governed applicability facts. Omitted means applicability is not assessed for this call. */
  context?: RuleApplicabilityContext,
  /**
   * The signal ids some builder claims to produce. When supplied, a rule whose signal is **absent
   * from this set** is a `CONFIGURATION_ERROR` rather than a missing measurement (ADR-0026 D-5).
   */
  declaredSignals?: ReadonlySet<string>,
): RuleEvaluation {
  const base = {
    ruleId: rule.id, ruleName: rule.name, ruleSetId: rule.ruleSetId, ruleVersion: rule.ruleVersion,
    signalId: rule.signalId, comparison: rule.comparison,
    ...(rule.signalMetricId !== undefined ? { signalMetricId: rule.signalMetricId } : {}),
    ...(rule.threshold !== undefined ? { thresholdValue: rule.threshold } : {}),
    ...(rule.requiredEvidence !== undefined ? { requiredEvidence: rule.requiredEvidence } : {}),
  };

  // --- 1. APPLICABILITY, before anything is asked about evidence -------------
  // A rule that does not apply is not missing data, and must never be described as if it were.
  if (rule.applicability !== undefined && context !== undefined) {
    const verdict = rule.applicability(context);
    if (!verdict.applicable) {
      return {
        ...base,
        status: 'NOT_APPLICABLE' as RuleEvaluationStatus,
        observedValue: reading?.value ?? null,
        fired: false,
        ...(verdict.reasonCode !== undefined ? { notEvaluatedReasonCode: verdict.reasonCode } : {}),
        notEvaluatedReason: verdict.reasonText
          ?? 'the rule does not apply to this project under its governed applicability conditions',
        contribution: 'none — rule not applicable',
        narrative:
          `"${rule.name}" does not apply to this project. `
          + `${verdict.reasonText ?? ''} This is **not** missing evidence and is **not** a finding `
          + 'about delivery: the condition the rule tests cannot arise here.',
        evidence: reading?.evidence ?? [],
      };
    }
  }

  // --- 2. CONFIGURATION, before computability -------------------------------
  // No builder claims to produce this signal, so nobody could ever have measured it. That is an
  // architecture defect, not an evidence gap, and it must not be reported as one.
  if (declaredSignals !== undefined && !declaredSignals.has(rule.signalId)) {
    return {
      ...base,
      status: 'CONFIGURATION_ERROR' as RuleEvaluationStatus,
      observedValue: null,
      fired: false,
      notEvaluatedReasonCode: 'SIGNAL_BUILDER_MISSING' as NotEvaluatedReasonCode,
      notEvaluatedReason:
        `no registered builder produces ${rule.signalId}, so this control cannot run anywhere`,
      missingEvidence: [rule.signalId],
      contribution: 'none — control not operational',
      narrative:
        `"${rule.name}" could not run because no builder produces ${rule.signalId}. This is a `
        + '**system control defect, not a project finding** — the control is not operational and '
        + 'its silence says nothing about this project.',
      evidence: [],
    };
  }

  if (rule.threshold === undefined && rule.comparison !== 'PRESENT') {
    return {
      ...base,
      status: 'NOT_COMPUTABLE' as RuleEvaluationStatus,
      notEvaluatedReasonCode: 'THRESHOLD_UNDECIDED' as NotEvaluatedReasonCode,
      observedValue: reading?.value ?? null, fired: false,
      notEvaluatedReason: rule.blockedBy
        ? `threshold undecided — ${rule.blockedBy}`
        : 'threshold undecided; the rule exists but has no configured value',
      contribution: 'none — rule not evaluated',
      narrative:
        `"${rule.name}" could not be evaluated because its threshold has not been set. The rule is ` +
        `declared and will apply as soon as a value is configured; it is not silently off.`,
      evidence: reading?.evidence ?? [],
    };
  }

  // --- 3. OBSERVED ADVERSE STATE, before computability ----------------------
  // An unbounded observation is not a missing one. For an upper-bound comparison it exceeds every
  // finite threshold, so it fires; the reverse direction is untouched (ADR-0027 D-4).
  if (reading?.adverseState === 'UNBOUNDED') {
    const upperBound = rule.comparison === 'GTE' || rule.comparison === 'GT';
    return {
      ...base,
      status: (upperBound ? 'FIRED' : 'CLEAR') as RuleEvaluationStatus,
      observedValue: 'UNBOUNDED',
      fired: upperBound,
      contribution: upperBound ? rule.effect : 'none — the comparison is not an upper bound',
      narrative: upperBound
        ? `${rule.narrativeWhenFired} **The observed value is unbounded**: `
          + `${reading.notComputableReason ?? 'the denominator is an observed zero'}. That exceeds `
          + `the ${String(rule.threshold)} threshold by more than any finite value could.`
        : rule.narrativeWhenClear,
      evidence: reading.evidence,
    };
  }

  if (reading === undefined || reading.value === null) {
    const why = reading?.notComputableReason ?? 'signal not supplied';
    return {
      ...base,
      status: 'NOT_COMPUTABLE' as RuleEvaluationStatus,
      notEvaluatedReasonCode: 'REQUIRED_METRIC_NOT_COMPUTABLE' as NotEvaluatedReasonCode,
      missingEvidence: [rule.signalMetricId ?? rule.signalId],
      observedValue: null, fired: false,
      notEvaluatedReason: `signal not computable — ${why}`,
      contribution: 'none — signal not computable',
      narrative:
        `"${rule.name}" could not be evaluated: ${rule.signalId} is not computable (${why}). ` +
        `Reported rather than treated as passing.`,
      evidence: reading?.evidence ?? [],
    };
  }

  const fired = rule.comparison === 'PRESENT'
    ? true
    : compare(reading.value as Quantity, rule.comparison, rule.threshold as Quantity);

  return {
    ...base,
    status: (fired ? 'FIRED' : 'CLEAR') as RuleEvaluationStatus,
    observedValue: reading.value,
    fired,
    ...(reading.trend !== undefined ? { trend: reading.trend } : {}),
    ...(fired && reading.estimatedImpact !== undefined ? { estimatedImpact: reading.estimatedImpact } : {}),
    contribution: fired ? rule.effect : 'none — within threshold',
    narrative: fired ? rule.narrativeWhenFired : rule.narrativeWhenClear,
    evidence: reading.evidence,
  };
}

export function evaluateRules(
  rules: readonly ThresholdRule[],
  readings: ReadonlyMap<string, SignalReading>,
  context?: RuleApplicabilityContext,
  declaredSignals?: ReadonlySet<string>,
): RuleEvaluation[] {
  return rules.map((r) => evaluateRule(r, readings.get(r.signalId), context, declaredSignals));
}

/**
 * Piecewise-linear normalisation of a signal onto 0–100, used by the health dimensions.
 *
 * Clamped at both ends: a project four times past the red edge is not four times worse than one just
 * past it, and letting the score run negative would let one catastrophic dimension erase three
 * healthy ones. The arithmetic lives in `platform/decimal`; this is the domain-facing name for it.
 */
export function normaliseToScore(
  value: Quantity, greenEdge: Quantity, redEdge: Quantity, higherIsBetter: boolean,
): Quantity {
  return qNormaliseScore(value, greenEdge, redEdge, higherIsBetter);
}
