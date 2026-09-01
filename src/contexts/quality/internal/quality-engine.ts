/**
 * Quality derivation — the Product & Quality half of `MET-HLTH-011`.
 *
 * **Why this file exists here.** `MET-QUA-003`, `006`, `009`, `011` and `012` are registered
 * `L2_DERIVED` with `owner: Quality`, and `QualitySnapshot` in this context's public surface has
 * declared all five since Phase 2. The manifest's `outputLayers: ["L1"]` contradicted both — that
 * was `CONFLICT C-21`, resolved at Phase 8 closure by ADR-0022 D-1/D-3.
 *
 * Tier 2, `mayDependOn: []`. `MET-QUA-012` needs `MET-FIN-005` actual cost, which belongs to
 * `financial` — so it is **passed in** rather than imported. A quality engine that reached into
 * financial would invert the dependency order to save one argument.
 *
 * ### `MET-QUA-002` is not here, and that is deliberate
 *
 * Defect Density is `Draft`, blocked by **MC-8** (the scope unit is undefined). No Draft metric may
 * enter an authoritative health chain, so it is absent rather than approximated — and the automated
 * draft-dependency audit would fail the build if it appeared.
 */
import { type Money, type Quantity, qAdd, qDiv, qIsNegative, qSub, qty } from '@platform/decimal';
import type { NotEvaluatedReasonCode, SignalState } from '@platform/explainability';
import type { CalendarDate, Instant } from '@platform/time';
import { daysBetween, dateOf } from '@platform/time';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type DefectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'TRIVIAL';

export interface DefectInput {
  readonly id: string;
  readonly severity: DefectSeverity;
  readonly raisedOn: CalendarDate;
  readonly closedOn?: CalendarDate;
  readonly escapedToClient: boolean;
}

/**
 * A client objection gating formal acceptance.
 *
 * **This is commercial/contractual acceptance, not product acceptance** — see ADR-0022 D-5. It
 * feeds `MET-QUA-010` because in fixed-bid an unresolved objection is quality evidence that gates
 * revenue, and the metric is registered to Quality. The *same* record's billing consequence belongs
 * to Commercial and is reported there, from the commercial exposure facts, not from this count.
 */
export interface AcceptanceItemInput {
  readonly id: string;
  readonly submittedOn: CalendarDate;
  readonly acceptedOn?: CalendarDate;
  readonly resolvedOn?: CalendarDate;
  readonly blocking: boolean;
}

/** One week of effort, split by whether it was rework. */
export interface EffortInput {
  readonly week: string;
  readonly hours: Quantity;
  readonly isRework: boolean;
}

export interface QualityEvaluationInput {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly defects: readonly DefectInput[];
  readonly acceptanceItems: readonly AcceptanceItemInput[];
  readonly effort: readonly EffortInput[];
  /** `MET-FIN-005` actual cost to date — passed in, never imported (tier discipline). */
  readonly actualCost: Money;
  /** The contractual rework allowance, a decimal string in [0,1]. `MET-QUA-012`'s baseline. */
  readonly reworkAllowance: Quantity;
  /** `MET-QUA-009`'s registered window: trailing eight weekly snapshots. */
  readonly backlogWindowWeeks: number;
  /** Open-defect counts per week, oldest first, for the backlog trend. */
  readonly openDefectHistory: readonly { readonly week: string; readonly open: number }[];
  /**
   * Whether defect telemetry actually reaches this product (ADR-0028 D-4).
   *
   * **`defects.length === 0` cannot answer this.** "The source reported and there are no escaped
   * defects" and "no defect telemetry exists" are opposite realities that produced the same `null`,
   * and dropping that null renormalised Product & Quality upward — a dead feed read as excellent
   * quality and turned an AMBER project GREEN.
   */
  readonly defectSource: {
    /** `true` when the quality domain is known to be reporting for this project. */
    readonly available: boolean;
    /** Days since the source last reported. `null` where unknown. */
    readonly ageDays: number | null;
    /** Beyond this, the source is stale and its silence proves nothing. */
    readonly expectedCadenceDays: number;
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DerivedValue<T> {
  readonly metricId: string;
  readonly value: T | null;
  readonly notComputableReason?: string;
  /** The epistemic state of this value (ADR-0028 D-1). Absent means OBSERVED/NOT_COMPUTABLE. */
  readonly state?: SignalState;
  readonly stateReasonCode?: NotEvaluatedReasonCode;
}

export interface QualityEvaluation {
  readonly projectId: string;
  readonly asOf: Instant;
  /** `MET-QUA-001` — open defects grouped by severity. Observed, not derived. */
  readonly openDefectsBySeverity: Readonly<Record<DefectSeverity, number>>;
  readonly openDefectsTotal: number;
  readonly openCriticalDefects: number;
  /** `MET-QUA-003` — escaped over all defects. */
  readonly escapedDefectRate: DerivedValue<Quantity>;
  /** `MET-QUA-006` — rework hours over all hours. */
  readonly reworkRatio: DerivedValue<Quantity>;
  /** `MET-QUA-009` — least-squares slope of open defects, per week. */
  readonly defectBacklogTrend: DerivedValue<Quantity>;
  /** `MET-QUA-010` — unresolved blocking acceptance items. Observed, not derived. */
  readonly acceptanceBlockers: number;
  /** `MET-QUA-011` — mean days from submission to acceptance, over accepted items. */
  readonly acceptanceLatencyDays: DerivedValue<Quantity>;
  /** `MET-QUA-012` — `(MET-QUA-006 − allowance) × MET-FIN-005`, floored at zero. */
  readonly excessReworkCost: DerivedValue<Money>;
  readonly acceptedDeliverables: number;
  readonly submittedDeliverables: number;
}

const nc = <T>(metricId: string, reason: string): DerivedValue<T> =>
  ({ metricId, value: null, notComputableReason: reason });

const ok = <T>(metricId: string, value: T): DerivedValue<T> => ({ metricId, value });

/** A value with an explicit non-default state, e.g. a governed KNOWN_ZERO. */
const okState = <T>(metricId: string, state: SignalState, value: T): DerivedValue<T> =>
  ({ metricId, value, state });

/** A null with an explicit state and machine-readable cause. */
const ncState = <T>(
  metricId: string, state: SignalState, stateReasonCode: NotEvaluatedReasonCode, reason: string,
): DerivedValue<T> => ({ metricId, value: null, state, stateReasonCode, notComputableReason: reason });

const SEVERITIES: readonly DefectSeverity[] = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'];

/**
 * Least-squares slope over an ordered series, in units per period.
 *
 * Returns `null` below the registered minimum rather than fitting a line through three points: a
 * "trend" over too little history is how a forecast acquires false confidence, and the health model
 * would read the resulting number as evidence.
 */
function slope(values: readonly number[], minimum: number): Quantity | null {
  const n = values.length;
  if (n < minimum) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let x = 0; x < n; x += 1) {
    const dx = x - meanX;
    num += dx * ((values[x] as number) - meanY);
    den += dx * dx;
  }
  if (den === 0) return null;
  return qty((num / den).toFixed(6));
}

/** Every registered quality derivation, in one deterministic pass. Pure; no clock, no I/O. */
export function evaluateQuality(input: QualityEvaluationInput): QualityEvaluation {
  const today = dateOf(input.asOf);
  const zero = input.actualCost.minus(input.actualCost);

  // --- MET-QUA-001: open defects by severity (L1 observed) -------------------
  const open = input.defects.filter((d) => d.closedOn === undefined);
  const bySeverity = Object.fromEntries(
    SEVERITIES.map((s) => [s, open.filter((d) => d.severity === s).length]),
  ) as Record<DefectSeverity, number>;

  // --- MET-QUA-003: escaped / all defects ------------------------------------
  const sourceStale = input.defectSource.ageDays !== null
    && input.defectSource.ageDays > input.defectSource.expectedCadenceDays;
  const escapedDefectRate = input.defects.length === 0
    ? !input.defectSource.available
      ? ncState<Quantity>(
        'MET-QUA-003', 'NOT_COMPUTABLE', 'REQUIRED_EVIDENCE_MISSING',
        'no defect telemetry is available for this project, so the escaped-defect rate is unknown. '
        + 'This is NOT a statement that there are no defects.',
      )
      : sourceStale
        ? ncState<Quantity>(
          'MET-QUA-003', 'NOT_COMPUTABLE', 'REQUIRED_EVIDENCE_MISSING',
          `the defect source last reported ${String(input.defectSource.ageDays)} days ago, beyond `
          + `its ${String(input.defectSource.expectedCadenceDays)}-day cadence, so its silence is `
          + 'not evidence of zero defects',
        )
        // The source reported and the answer is zero. A healthy OBSERVATION, scored as such.
        : okState('MET-QUA-003', 'KNOWN_ZERO', qty('0'))
    : ok('MET-QUA-003', qDiv(
      qty(String(input.defects.filter((d) => d.escapedToClient).length)),
      qty(String(input.defects.length)),
    ) ?? qty('0'));

  // --- MET-QUA-006: rework hours / all hours ---------------------------------
  const totalHours = input.effort.reduce((a, e) => qAdd(a, e.hours), qty('0'));
  const reworkHours = input.effort
    .filter((e) => e.isRework)
    .reduce((a, e) => qAdd(a, e.hours), qty('0'));
  const reworkRatioValue = qDiv(reworkHours, totalHours);
  const reworkRatio = input.effort.length === 0 || reworkRatioValue === null
    ? nc<Quantity>('MET-QUA-006', 'no effort has been recorded, so there are no hours to divide')
    : ok('MET-QUA-006', reworkRatioValue);

  // --- MET-QUA-009: slope of open defects over the trailing window -----------
  const window = input.openDefectHistory.slice(-input.backlogWindowWeeks);
  const trendValue = slope(window.map((w) => w.open), input.backlogWindowWeeks);
  const defectBacklogTrend = trendValue === null
    ? nc<Quantity>(
      'MET-QUA-009',
      `${String(input.openDefectHistory.length)} weekly defect snapshot(s), below the `
      + `${String(input.backlogWindowWeeks)} the registered trailing window requires`,
    )
    : ok('MET-QUA-009', trendValue);

  // --- MET-QUA-010 / MET-QUA-011: acceptance ---------------------------------
  const blockers = input.acceptanceItems.filter(
    (a) => a.blocking && a.resolvedOn === undefined,
  ).length;
  const accepted = input.acceptanceItems.filter((a) => a.acceptedOn !== undefined);
  const acceptanceLatencyDays = accepted.length === 0
    ? nc<Quantity>('MET-QUA-011', 'no deliverable has been accepted yet, so there is no latency to average')
    : ok('MET-QUA-011', qty((
      accepted.reduce((a, x) => a + daysBetween(x.submittedOn, x.acceptedOn as CalendarDate), 0)
      / accepted.length
    ).toFixed(2)));

  // --- MET-QUA-012: (rework ratio − allowance) × actual cost ------------------
  // Floored at zero: a project running *below* its priced rework allowance has not earned a
  // negative cost, and reporting one would let good quality subsidise a margin figure.
  const excessReworkCost = reworkRatio.value === null
    ? nc<Money>('MET-QUA-012', `rework ratio is not computable: ${reworkRatio.notComputableReason ?? 'unknown'}`)
    : (() => {
      const excess = qSub(reworkRatio.value, input.reworkAllowance);
      if (qIsNegative(excess)) return ok('MET-QUA-012', zero);
      return ok('MET-QUA-012', input.actualCost.times(excess));
    })();

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    openDefectsBySeverity: bySeverity,
    openDefectsTotal: open.length,
    openCriticalDefects: bySeverity.CRITICAL,
    escapedDefectRate,
    reworkRatio,
    defectBacklogTrend,
    acceptanceBlockers: blockers,
    acceptanceLatencyDays,
    excessReworkCost,
    acceptedDeliverables: accepted.length,
    submittedDeliverables: input.acceptanceItems.length,
  };
}
