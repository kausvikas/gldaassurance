/**
 * TrajectoryEngine and the forward outlook.
 *
 * Trajectory is **not** current RAG. A project can be Green and falling, or Red and recovering, and
 * confusing the two is the specific blindness this product exists to remove
 * (`PRODUCT_SPEC.md` §1.1). So the state is derived from movement across multiple periods and
 * multiple signals, never from the current band.
 *
 * The outlook is **rules-based and explainable, not a model**. `PRODUCT_SPEC.md` §4.2 defers ML
 * forecasting explicitly; a fitted curve nobody can interrogate would fail AC-3 and would be the
 * kind of confident narration ADR-0004 exists to prevent. Every horizon states which rules fired,
 * on what evidence.
 *
 * Everything here is `L3_ASSESSED` (ADR-0011): deterministic, and still a judgement about the
 * future.
 */
import {
  type Quantity, Q_ZERO, qAdd, qCompare, qDiv, qFixed, qMul, qSub, qty,
} from '@platform/decimal';
import { type Explanation, type RuleEvaluation, explain } from '@platform/explainability';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import { type TrajectoryObservationPolicy, policyFor } from '@contexts/rules';

export type TrajectoryState = 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'RAPIDLY_DETERIORATING';

export type OutlookHorizon = 'CURRENT' | 'DAYS_30' | 'DAYS_60' | 'DAYS_90';

export type OutlookBand = 'GREEN' | 'AMBER' | 'RED';

/** One observation in a signal's history, oldest first. */
export interface Observation {
  readonly period: WeekId;
  readonly value: Quantity;
}

/** A signal with enough history to have a direction. */
export interface SignalSeries {
  readonly signalId: string;
  readonly metricId: string;
  readonly observations: readonly Observation[];
  /** True when a rising value is a *worsening*, e.g. burn gap or rework. */
  readonly higherIsWorse: boolean;
  /** Movement per period beyond which this signal is considered materially adverse. */
  readonly materialAdverseSlope: Quantity;
  readonly evidence: readonly RecordRef[];
}

export interface SignalTrend {
  readonly signalId: string;
  readonly metricId: string;
  /** Least-squares slope per period, signed in the signal's own units. */
  readonly slope: Quantity | null;
  /** Slope re-signed so negative always means "getting worse", whatever the signal's direction. */
  readonly adverseSlope: Quantity | null;
  readonly observationCount: number;
  readonly policy: TrajectoryObservationPolicy | undefined;
  readonly materiallyAdverse: boolean;
  readonly notComputableReason?: string;
}

export interface TrajectoryEvaluationInput {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly series: readonly SignalSeries[];
  /** Current System-Assessed band, used only to place the outlook — never to derive trajectory. */
  readonly currentBand: OutlookBand;
  /** How many adverse signals constitute "rapid". Configuration, not a constant in code. */
  readonly rapidConfluenceThreshold: number;
}

export interface OutlookAssessment {
  readonly horizon: OutlookHorizon;
  readonly band: OutlookBand;
  readonly rationale: string;
  readonly contributingSignals: readonly string[];
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TrajectoryEvaluation {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly state: TrajectoryState;
  readonly trends: readonly SignalTrend[];
  /** How many signals are moving materially adversely at once. */
  readonly adverseConfluence: number;
  readonly outlooks: readonly OutlookAssessment[];
  readonly explanation: Explanation;
}

/**
 * Least-squares slope over the observations, in units per period.
 *
 * Returns `null` below the policy's minimum: a "trend" over two points is a line between two points,
 * and reporting it as a trend is how a forecast acquires false confidence.
 */
export function slopeOf(series: SignalSeries): { slope: Quantity | null; reason?: string } {
  const policy = policyFor(series.signalId);
  const minimum = policy?.minimumObservations ?? 3;
  const n = series.observations.length;
  if (n < minimum) {
    return {
      slope: null,
      reason: `${n} observation${n === 1 ? '' : 's'}, below the ${minimum} its observation policy requires`,
    };
  }
  const window = policy === undefined ? series.observations : series.observations.slice(-policy.windowSize);
  const count = window.length;
  const meanX = qDiv(qty(String(count - 1)), qty('2')) ?? Q_ZERO;
  const meanY = qDiv(window.reduce((a, o) => qAdd(a, o.value), Q_ZERO), qty(String(count)));
  if (meanY === null) return { slope: null, reason: 'empty window' };

  let numerator = Q_ZERO;
  let denominator = Q_ZERO;
  window.forEach((o, idx) => {
    const dx = qSub(qty(String(idx)), meanX);
    numerator = qAdd(numerator, qMul(dx, qSub(o.value, meanY)));
    denominator = qAdd(denominator, qMul(dx, dx));
  });
  const slope = qDiv(numerator, denominator);
  return slope === null
    ? { slope: null, reason: 'all observations fall in the same period' }
    : { slope: qty(qFixed(slope, 6)) };
}

function trendOf(series: SignalSeries): SignalTrend {
  const { slope, reason } = slopeOf(series);
  const policy = policyFor(series.signalId);
  if (slope === null) {
    return {
      signalId: series.signalId, metricId: series.metricId, slope: null, adverseSlope: null,
      observationCount: series.observations.length, policy, materiallyAdverse: false,
      ...(reason !== undefined ? { notComputableReason: reason } : {}),
    };
  }
  // Re-sign so negative always means "getting worse", whichever way the raw signal runs.
  const adverseSlope = series.higherIsWorse ? qMul(slope, qty('-1')) : slope;
  return {
    signalId: series.signalId, metricId: series.metricId, slope, adverseSlope,
    observationCount: series.observations.length, policy,
    materiallyAdverse: qCompare(adverseSlope, qMul(series.materialAdverseSlope, qty('-1'))) <= 0,
  };
}

export function evaluateTrajectory(input: TrajectoryEvaluationInput): TrajectoryEvaluation {
  const trends = input.series.map(trendOf);
  const computable = trends.filter((t) => t.adverseSlope !== null);
  const adverse = computable.filter((t) => t.materiallyAdverse);
  const improving = computable.filter(
    (t) => t.adverseSlope !== null && qCompare(t.adverseSlope, Q_ZERO) > 0,
  );

  // --- state ----------------------------------------------------------------
  // Multiple signals, multiple periods. Never the current band.
  let state: TrajectoryState;
  let stateNarrative: string;
  if (computable.length === 0) {
    state = 'STABLE';
    stateNarrative =
      'No signal has enough history for a trend. Reported as Stable because there is no evidence of ' +
      'movement — not because movement was ruled out.';
  } else if (adverse.length >= input.rapidConfluenceThreshold) {
    state = 'RAPIDLY_DETERIORATING';
    stateNarrative =
      `${adverse.length} signals are moving materially adversely at once ` +
      `(${adverse.map((t) => t.signalId).join(', ')}). One dimension declining is a problem; several ` +
      `declining together is usually the same problem seen from several angles, and it compounds.`;
  } else if (adverse.length > 0) {
    state = 'DETERIORATING';
    stateNarrative =
      `${adverse.length} signal${adverse.length > 1 ? 's are' : ' is'} moving materially adversely ` +
      `(${adverse.map((t) => t.signalId).join(', ')}).`;
  } else if (improving.length > computable.length / 2) {
    state = 'IMPROVING';
    stateNarrative =
      `${improving.length} of ${computable.length} measurable signals are improving and none is ` +
      `materially adverse.`;
  } else {
    state = 'STABLE';
    stateNarrative = 'No signal is moving materially in either direction.';
  }

  // --- outlook ---------------------------------------------------------------
  const outlooks = projectOutlook(input.currentBand, state, adverse.length, computable.length);

  const evaluations: RuleEvaluation[] = [
    ...trends.map((t): RuleEvaluation => ({
      ruleId: `TRAJ-${t.signalId}`,
      ruleName: `${t.signalId} trend`,
      ruleSetId: 'TRAJECTORY',
      ruleVersion: input.ruleVersion,
      signalId: t.signalId,
      ...(t.metricId !== undefined ? { signalMetricId: t.metricId } : {}),
      observedValue: t.slope,
      comparison: 'LTE',
      thresholdValue: qMul(
        (input.series.find((s) => s.signalId === t.signalId)?.materialAdverseSlope ?? Q_ZERO),
        qty('-1'),
      ),
      status: (t.materiallyAdverse) ? 'FIRED' : 'CLEAR',
      fired: t.materiallyAdverse,
      ...(t.notComputableReason !== undefined ? { notEvaluatedReason: t.notComputableReason } : {}),
      trend: t.adverseSlope === null ? 'NOT_COMPUTABLE'
        : qCompare(t.adverseSlope, Q_ZERO) > 0 ? 'IMPROVING'
        : qCompare(t.adverseSlope, Q_ZERO) < 0 ? 'WORSENING' : 'STABLE',
      contribution: t.materiallyAdverse ? 'counts toward adverse confluence' : 'none',
      narrative: t.notComputableReason !== undefined
        ? `${t.signalId}: ${t.notComputableReason}.`
        : `${t.signalId} slope ${t.slope} per period over ${t.observationCount} observations` +
          `${t.policy ? ` (${t.policy.windowType}/${t.policy.windowSize})` : ''}.` +
          `${t.materiallyAdverse ? ' Materially adverse.' : ''}`,
      evidence: input.series.find((s) => s.signalId === t.signalId)?.evidence ?? [],
    })),
    {
      ruleId: 'TRAJ-STATE', ruleName: 'Trajectory state', ruleSetId: 'TRAJECTORY',
      ruleVersion: input.ruleVersion, signalId: 'ADVERSE_CONFLUENCE',
      signalMetricId: 'MET-FCST-006',
      observedValue: String(adverse.length), comparison: 'GTE',
      thresholdValue: String(input.rapidConfluenceThreshold),
      status: (state === 'DETERIORATING' || state === 'RAPIDLY_DETERIORATING') ? 'FIRED' : 'CLEAR',
      fired: state === 'DETERIORATING' || state === 'RAPIDLY_DETERIORATING',
      contribution: `Trajectory = ${state}`,
      narrative: stateNarrative,
      evidence: input.series.flatMap((s) => s.evidence),
    },
  ];

  return {
    projectId: input.projectId, week: input.week, assessedAt: input.assessedAt,
    state, trends, adverseConfluence: adverse.length, outlooks,
    explanation: explain({
      outcome: `Trajectory = ${state}`,
      outcomeDetail: `${adverse.length} of ${computable.length} measurable signals materially adverse`,
      evaluatedAt: input.assessedAt,
      ruleSetVersion: input.ruleVersion,
      metricCatalogVersion: input.metricCatalogVersion,
      evaluations,
    }),
  };
}

const BAND_ORDER: readonly OutlookBand[] = ['GREEN', 'AMBER', 'RED'];

function degrade(band: OutlookBand, steps: number): OutlookBand {
  const idx = Math.min(BAND_ORDER.length - 1, BAND_ORDER.indexOf(band) + steps);
  return BAND_ORDER[idx] as OutlookBand;
}

/**
 * Rules-based forward outlook. Deliberately simple and deliberately legible.
 *
 * The rule is: a deteriorating project degrades one band per horizon it survives, and a rapidly
 * deteriorating one degrades faster. That is a *stated assumption*, not a fitted model, and an
 * executive can argue with it — which is the point. Confidence falls with the horizon because it
 * should: a 90-day statement about a project is worth less than a 30-day one, and pretending
 * otherwise is how forecasts stop being believed.
 */
function projectOutlook(
  current: OutlookBand, state: TrajectoryState, adverseCount: number, measurable: number,
): OutlookAssessment[] {
  const stepsPerHorizon = state === 'RAPIDLY_DETERIORATING' ? 1
    : state === 'DETERIORATING' ? 0.5
    : 0;
  const confidence = measurable === 0 ? 'LOW' : measurable >= 4 ? 'HIGH' : 'MEDIUM';

  const horizons: readonly { h: OutlookHorizon; periods: number }[] = [
    { h: 'CURRENT', periods: 0 },
    { h: 'DAYS_30', periods: 1 },
    { h: 'DAYS_60', periods: 2 },
    { h: 'DAYS_90', periods: 3 },
  ];

  return horizons.map(({ h, periods }) => {
    const steps = Math.floor(stepsPerHorizon * periods);
    const band = degrade(current, steps);
    const horizonConfidence: OutlookAssessment['confidence'] =
      h === 'CURRENT' ? confidence
      : h === 'DAYS_30' ? confidence
      : h === 'DAYS_60' ? (confidence === 'HIGH' ? 'MEDIUM' : 'LOW')
      : 'LOW';
    return {
      horizon: h,
      band,
      rationale: h === 'CURRENT'
        ? `Current System-Assessed band is ${current}.`
        : steps === 0
          ? `No band change expected by ${h.replace('DAYS_', '')} days: trajectory is ${state}.`
          : `Expected to reach ${band} by ${h.replace('DAYS_', '')} days if the current trajectory ` +
            `(${state}, ${adverseCount} adverse signal${adverseCount === 1 ? '' : 's'}) continues ` +
            `unchanged. This is a stated rule, not a fitted model: it assumes nothing intervenes.`,
      contributingSignals: [],
      confidence: horizonConfidence,
    };
  });
}
