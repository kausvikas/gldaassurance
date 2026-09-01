/**
 * Early-warning detection and its lifecycle — turning evidence into intervention before Red.
 *
 * **A warning is derived, never stored.** It is recomputed from current evidence on every run, so
 * detection can never drift from the numbers it claims to be about. What *is* stored is the human
 * act that followed — assurance's disposition, delivery's corrective action — and this engine joins
 * the two so the product can measure **follow-through** rather than just detection.
 *
 * `forecast` is tier 4 and emits `L3_ASSESSED`. A warning is an inference, and every one produced
 * here is labelled as one wherever it is rendered (ADR-0004, REQ-UX-004).
 *
 * The output type is `DetectedWarning`, deliberately **not** the context's Phase 2 `EarlyWarning`.
 * That shape models a *persisted* warning record — it carries `detectedOn` and `synthetic: true`.
 * This one is the result of running the rules **now**, against current evidence, and holds no
 * identity of its own. Giving them one name would blur exactly the distinction this file exists to
 * maintain: what the system infers, versus what somebody recorded.
 *
 * ### Severity is distance past the threshold, not importance
 *
 * A burn gap 0.1 points past its threshold and one 30 points past fire the same rule. Treating them
 * as the same finding makes the list unprioritisable, so severity is computed as the observed value's
 * **multiple of its own threshold** and banded by data from `rules`. That keeps severity comparable
 * across signals measured in completely different units.
 *
 * ### The lifecycle, and who owns which part of it
 *
 * ```
 * EarlyWarning (derived) → disposition (assurance) → RecoveryAction (delivery) → closure | escalation
 * ```
 *
 * **Delivery owns corrective execution. Assurance owns validation, follow-through and escalation.**
 * The two never merge: an action carries a delivery owner and an execution status; a disposition
 * carries an assurance actor and a control clock. A warning that nobody dispositioned inside that
 * clock is an **assurance exception** — a failure of the control, not of the project — and is
 * reported as such rather than being folded into the project's health.
 */
import { type Quantity, qAbs, qCompare, qDiv, qty } from '@platform/decimal';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { RuleEvaluation, SignalDirection } from '@platform/explainability';
import type { CalendarDate, Instant } from '@platform/time';
import { daysBetween, dateOf } from '@platform/time';
import {
  EARLY_WARNING_RULES, WARNING_SEVERITY_BANDS, type SignalReading, evaluateRules,
} from '@contexts/rules';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What assurance did with a warning. Recorded, not derived. */
export interface DispositionInput {
  readonly signalId: string;
  readonly raisedOn: CalendarDate;
  readonly disposition: 'VALIDATED' | 'CHALLENGED' | 'ACCEPTED_RISK';
  readonly dispositionedOn?: CalendarDate;
  readonly assuranceActorId: string;
  readonly rationale: string;
  /** The control clock: assurance must disposition by this date or become an exception. */
  readonly dueOn: CalendarDate;
}

/** A corrective action delivery committed to, linked to the signal it answers. */
export interface ActionLinkInput {
  readonly id: string;
  readonly signalId: string | null;
  readonly description: string;
  readonly ownerActorId: string | null;
  readonly dueOn: CalendarDate | null;
  readonly status: string;
  readonly executiveDecisionRequired: boolean;
}

export interface EarlyWarningInput {
  readonly projectId: string;
  readonly asOf: Instant;
  /** Signal readings keyed by `signalId`, each with value, trend and estimated impact. */
  readonly readings: ReadonlyMap<string, SignalReading>;
  readonly dispositions: readonly DispositionInput[];
  readonly actions: readonly ActionLinkInput[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type WarningSeverity = 'ELEVATED' | 'HIGH' | 'SEVERE';

/**
 * Where a warning sits in its lifecycle.
 *
 * `AWAITING_DISPOSITION` and `OVERDUE_DISPOSITION` are the same state to the project and completely
 * different states to the control: one is inside its clock, the other has broken it.
 */
export type WarningLifecycle =
  | 'AWAITING_DISPOSITION'
  | 'OVERDUE_DISPOSITION'
  | 'VALIDATED_NO_ACTION'
  | 'VALIDATED_ACTION_OPEN'
  | 'VALIDATED_ACTION_OVERDUE'
  | 'VALIDATED_ACTION_COMPLETE'
  | 'CHALLENGED'
  | 'ACCEPTED_RISK';

export interface DetectedWarning {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleVersion: RuleVersion;
  readonly signalId: string;
  readonly metricId: string | undefined;
  readonly observedValue: string | null;
  readonly threshold: string | undefined;
  readonly comparison: string;
  readonly trend: SignalDirection | undefined;
  readonly severity: WarningSeverity;
  /** How many times past its own threshold the observation sits. Comparable across signals. */
  readonly thresholdMultiple: Quantity | null;
  /** Money the signal puts at risk, where the caller could estimate it. */
  readonly estimatedImpact: { readonly amount: string; readonly currency: string } | undefined;
  readonly scheduleImpactWeeks: number | null;
  readonly narrative: string;
  readonly evidence: readonly RecordRef[];
  /** When the evidence behind this reading was last observed. */
  readonly evidenceAsOf: Instant;
  readonly lifecycle: WarningLifecycle;
  readonly disposition: DispositionInput | null;
  readonly linkedActions: readonly ActionLinkInput[];
  /** Set when the control clock has been broken. An assurance failure, not a project one. */
  readonly assuranceExceptionReason?: string;
}

export interface EarlyWarningAssessment {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly ruleSetVersion: RuleVersion;
  /** Fired warnings, most severe first. */
  readonly warnings: readonly DetectedWarning[];
  /** Rules that did not fire, kept so a reader can see what *was* checked. */
  readonly clear: readonly { readonly ruleId: string; readonly signalId: string; readonly narrative: string }[];
  /** Rules that could not be evaluated, each naming why. */
  readonly notEvaluated: readonly { readonly ruleId: string; readonly reason: string }[];
  /** Warnings whose assurance clock has been broken. */
  readonly assuranceExceptions: readonly DetectedWarning[];
  /** Warnings validated by assurance with no corrective action against them. */
  readonly validatedWithoutAction: readonly DetectedWarning[];
  readonly evaluatedAt: Instant;
}

// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Readonly<Record<WarningSeverity, number>> = {
  SEVERE: 3, HIGH: 2, ELEVATED: 1,
};

const OPEN_STATUSES = ['PROPOSED', 'COMMITTED', 'IN_PROGRESS'];

/**
 * How far past its threshold an observation sits, as a multiple.
 *
 * Uses absolute values so a signal whose adverse direction is negative bands the same way as one
 * whose adverse direction is positive. Returns `null` at a zero threshold, where "a multiple of the
 * threshold" has no meaning — the warning still fires, it simply cannot be banded by distance and
 * falls to `ELEVATED`.
 */
export function thresholdMultipleOf(
  observed: string | null, threshold: string | undefined,
): Quantity | null {
  if (observed === null || threshold === undefined) return null;
  const t = qAbs(qty(threshold));
  if (qCompare(t, qty('0')) === 0) return null;
  return qDiv(qAbs(qty(observed)), t);
}

/** Bands a multiple against `WARNING_SEVERITY_BANDS`, which is data in `rules`. */
export function severityFor(multiple: Quantity | null): WarningSeverity {
  if (multiple === null) return 'ELEVATED';
  for (const band of WARNING_SEVERITY_BANDS) {
    if (qCompare(multiple, qty(band.atMultiple)) >= 0) return band.id;
  }
  return 'ELEVATED';
}

/**
 * Detects warnings and joins them to their lifecycle.
 *
 * Pure over its inputs: same evidence and same records, same warnings, in the same order.
 */
export function evaluateEarlyWarnings(input: EarlyWarningInput): EarlyWarningAssessment {
  const today = dateOf(input.asOf);
  const evaluations: readonly RuleEvaluation[] = evaluateRules(EARLY_WARNING_RULES, input.readings);

  const byRule = new Map(EARLY_WARNING_RULES.map((r) => [r.id, r]));
  const dispositionBySignal = new Map(input.dispositions.map((d) => [d.signalId, d]));

  const warnings: DetectedWarning[] = [];
  const clear: { ruleId: string; signalId: string; narrative: string }[] = [];
  const notEvaluated: { ruleId: string; reason: string }[] = [];

  for (const e of evaluations) {
    const rule = byRule.get(e.ruleId);
    if (rule === undefined) continue;

    if (e.notEvaluatedReason !== undefined) {
      notEvaluated.push({ ruleId: e.ruleId, reason: e.notEvaluatedReason });
      continue;
    }
    if (!e.fired) {
      clear.push({
        ruleId: e.ruleId, signalId: rule.signalId, narrative: rule.narrativeWhenClear,
      });
      continue;
    }

    const reading = input.readings.get(rule.signalId);
    const multiple = thresholdMultipleOf(e.observedValue, rule.threshold);
    const disposition = dispositionBySignal.get(rule.signalId) ?? null;
    const linked = input.actions.filter((a) => a.signalId === rule.signalId);

    // --- lifecycle ---------------------------------------------------------
    // The order matters: an undispositioned warning past its clock is an assurance exception
    // whatever else is true of it, because the control failed before anything else could.
    let lifecycle: WarningLifecycle;
    let exceptionReason: string | undefined;
    if (disposition === null) {
      lifecycle = 'AWAITING_DISPOSITION';
    } else if (disposition.dispositionedOn === undefined) {
      const overdueBy = daysBetween(disposition.dueOn, today);
      if (overdueBy > 0) {
        lifecycle = 'OVERDUE_DISPOSITION';
        exceptionReason =
          `Assurance has not dispositioned this warning ${String(overdueBy)} day`
          + `${overdueBy === 1 ? '' : 's'} past its control date of ${disposition.dueOn}. `
          + 'Overdue assurance is an assurance exception in its own right — it is a failure of the '
          + 'control, not evidence about the project.';
      } else {
        lifecycle = 'AWAITING_DISPOSITION';
      }
    } else if (disposition.disposition === 'CHALLENGED') {
      lifecycle = 'CHALLENGED';
    } else if (disposition.disposition === 'ACCEPTED_RISK') {
      lifecycle = 'ACCEPTED_RISK';
    } else if (linked.length === 0) {
      lifecycle = 'VALIDATED_NO_ACTION';
    } else if (linked.every((a) => a.status === 'COMPLETE')) {
      lifecycle = 'VALIDATED_ACTION_COMPLETE';
    } else if (linked.some(
      (a) => OPEN_STATUSES.includes(a.status) && a.dueOn !== null && daysBetween(a.dueOn, today) > 0,
    )) {
      lifecycle = 'VALIDATED_ACTION_OVERDUE';
    } else {
      lifecycle = 'VALIDATED_ACTION_OPEN';
    }

    warnings.push({
      ruleId: e.ruleId,
      ruleName: rule.name,
      ruleVersion: rule.ruleVersion,
      signalId: rule.signalId,
      metricId: rule.signalMetricId,
      observedValue: e.observedValue,
      threshold: rule.threshold,
      comparison: rule.comparison,
      trend: reading?.trend,
      severity: severityFor(multiple),
      thresholdMultiple: multiple,
      estimatedImpact: reading?.estimatedImpact,
      scheduleImpactWeeks: null,
      narrative: rule.narrativeWhenFired,
      evidence: reading?.evidence ?? [],
      evidenceAsOf: input.asOf,
      lifecycle,
      disposition,
      linkedActions: linked,
      ...(exceptionReason === undefined ? {} : { assuranceExceptionReason: exceptionReason }),
    });
  }

  // Most severe first; ties broken by rule id so the order is deterministic (AC-7).
  const ordered = [...warnings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || a.ruleId.localeCompare(b.ruleId),
  );

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    ruleSetVersion: (EARLY_WARNING_RULES[0] as { ruleVersion: RuleVersion }).ruleVersion,
    warnings: ordered,
    clear,
    notEvaluated,
    assuranceExceptions: ordered.filter((w) => w.lifecycle === 'OVERDUE_DISPOSITION'),
    validatedWithoutAction: ordered.filter((w) => w.lifecycle === 'VALIDATED_NO_ACTION'),
    evaluatedAt: input.asOf,
  };
}

/**
 * `MET-FCST-030` Late Detection Rate — the portfolio KPI that measures the product itself.
 *
 * *What share of projects reached Red without a prior Amber or a prior early warning?* It is the one
 * number that says whether early detection is working, and it is deliberately uncomfortable: a high
 * rate means the product is confirming failures rather than preventing them.
 *
 * A project counts as **detected** if, at the period before it first went Red, it was either already
 * Amber or carrying at least one fired warning. Anything else is a late detection.
 */
export interface LateDetectionCase {
  readonly projectId: string;
  readonly firstRedPeriod: string;
  readonly priorBand: string | null;
  readonly priorWarningCount: number;
  readonly detected: boolean;
}

/**
 * How much of the health model the historical replay could actually reconstruct.
 *
 * `PARTIAL` is not a hedge. It is the difference between *"every project that reached Red was
 * flagged first"* and *"every project that reached Red was flagged first, on the one dimension we
 * can rewind"* — and only the second is supportable when the fact tables hold no per-period snapshot
 * of the delivery, commercial and quality derivations.
 */
export type HistoricalCoverage = 'COMPLETE' | 'PARTIAL' | 'NONE';

export interface LateDetectionRate {
  readonly metricId: 'MET-FCST-030';
  readonly projectsReachingRed: number;
  readonly lateDetections: number;
  /** Late detections over projects reaching Red. `null` when nothing reached Red. */
  readonly rate: Quantity | null;
  readonly notComputableReason?: string;
  readonly cases: readonly LateDetectionCase[];
  /** Which health dimensions the historical replay could reconstruct. */
  readonly reconstructedDimensions: readonly string[];
  /** Dimensions that could not be rewound, and are therefore absent from the historical band. */
  readonly unavailableDimensions: readonly string[];
  readonly historicalCoverage: HistoricalCoverage;
  /**
   * **Whether this figure may be stated as an executive conclusion.**
   *
   * `false` while the replay is partial. A consumer must render the qualification, not the bare
   * percentage: "0% late detection" from a one-dimension rewind is a stronger claim than the
   * evidence supports, and it is the most flattering possible way to be wrong.
   */
  readonly executiveAuthoritative: boolean;
  readonly claimQualification: string;
}

export function computeLateDetectionRate(
  cases: readonly LateDetectionCase[],
  coverage: {
    readonly reconstructedDimensions: readonly string[];
    readonly unavailableDimensions: readonly string[];
  } = { reconstructedDimensions: [], unavailableDimensions: [] },
): LateDetectionRate {
  const historicalCoverage: HistoricalCoverage = coverage.unavailableDimensions.length === 0
    ? (coverage.reconstructedDimensions.length === 0 ? 'NONE' : 'COMPLETE')
    : 'PARTIAL';
  const executiveAuthoritative = historicalCoverage === 'COMPLETE';

  const qualification = executiveAuthoritative
    ? 'The historical replay reconstructed every health dimension, so this rate is stated over the '
      + 'same band the product reports today.'
    : `**Not an executive conclusion.** The historical replay could rewind `
      + `${coverage.reconstructedDimensions.join(', ') || 'no'} `
      + `dimension${coverage.reconstructedDimensions.length === 1 ? '' : 's'} only; `
      + `${coverage.unavailableDimensions.join(', ') || 'the rest'} could not be reconstructed `
      + 'because the fact tables hold no per-period snapshot of them. Carrying today\'s signals '
      + 'backward would attribute current evidence to a past decision and flatter detection, so they '
      + 'are omitted. This rate therefore measures detection against a **partial historical band**, '
      + 'not against the four-dimension band the product reports now (DR-059).';

  const late = cases.filter((c) => !c.detected).length;
  if (cases.length === 0) {
    return {
      metricId: 'MET-FCST-030',
      projectsReachingRed: 0,
      lateDetections: 0,
      rate: null,
      notComputableReason:
        'No project in scope reached Red within the observed history, so there is no population to '
        + 'rate. That is not a 0% late-detection rate — it is an absence of cases.',
      cases,
      reconstructedDimensions: coverage.reconstructedDimensions,
      unavailableDimensions: coverage.unavailableDimensions,
      historicalCoverage,
      executiveAuthoritative: false,
      claimQualification: qualification,
    };
  }
  return {
    metricId: 'MET-FCST-030',
    projectsReachingRed: cases.length,
    lateDetections: late,
    rate: qDiv(qty(String(late)), qty(String(cases.length))),
    cases,
    reconstructedDimensions: coverage.reconstructedDimensions,
    unavailableDimensions: coverage.unavailableDimensions,
    historicalCoverage,
    executiveAuthoritative,
    claimQualification: qualification,
  };
}
