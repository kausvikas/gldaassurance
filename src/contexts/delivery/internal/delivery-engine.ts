/**
 * Delivery derivation — the schedule and velocity half of `MET-HLTH-011`.
 *
 * **Why this file exists.** `HEALTH_MODEL_V2` has declared four `DELIVERY` inputs since Phase 4 and
 * three of them were never computed, so the Delivery dimension scored `NOT_COMPUTABLE` on all 91
 * demo projects and the executive health model was, in practice, its Financial dimension wearing a
 * four-dimension label (ADR-0022 D-1). Every input needed already existed as an L1 fact; nothing was
 * missing but the arithmetic.
 *
 * `delivery` is `L1→L2` in `ARCHITECTURE_DECISIONS.md` §4, so these derivations belong here. Its
 * siblings `quality` and `commercial` are **L1 only**, which is why the equivalent quality and
 * commercial signals are *not* computed anywhere yet — see `CONFLICT C-21` in ADR-0022 D-2. That is
 * a boundary question, not an oversight, and it is not resolved by putting their arithmetic here.
 *
 * Tier 2, depending only on `contract`, so this file imports no sibling engine (ADR-0001 §4.1).
 *
 * ### The rule every function here obeys
 *
 * **A metric with insufficient input returns `null` and says why.** Not zero, not a carried-forward
 * value, not a shorter window. `MET-DEL-018` and `MET-DEL-019` need eight weeks of progress history
 * and a young project does not have it — reporting a velocity trend over three weeks would let a
 * project acquire a confident-looking delivery score precisely when least is known about it. The
 * reason travels with the null so the surface can print it instead of a dash.
 */
import { type Quantity, qAdd, qCompare, qDiv, qFixed, qMul, qSub, qty } from '@platform/decimal';
import type { NotEvaluatedReasonCode, SignalState } from '@platform/explainability';
import type { CalendarDate, Instant } from '@platform/time';
import { daysBetween, dateOf } from '@platform/time';

// ---------------------------------------------------------------------------
// Inputs — supplied by the Application layer, never fetched here
// ---------------------------------------------------------------------------

/** One milestone, as `delivery` owns it. Dates are calendar dates; slippage is a whole-day count. */
export interface MilestoneInput {
  readonly id: string;
  readonly name: string;
  readonly baselineDate: CalendarDate;
  readonly forecastDate: CalendarDate;
  readonly actualDate?: CalendarDate;
  readonly paymentGating: boolean;
}

/** An obligation delivery is waiting on. Only `CUSTOMER` ones feed `MET-DEL-023`. */
export interface DependencyInput {
  readonly id: string;
  readonly description: string;
  readonly owner: 'CUSTOMER' | 'THIRD_PARTY' | 'INTERNAL';
  readonly raisedOn: CalendarDate;
  readonly dueOn: CalendarDate;
  readonly resolvedOn?: CalendarDate;
  readonly blocking: boolean;
}

/** One weekly progress observation. `physicalCompletion` is a decimal string in [0,1]. */
export interface ProgressObservation {
  readonly week: string;
  readonly physicalCompletion: string;
  readonly plannedCompletion: string;
}

export interface DeliveryEvaluationInput {
  readonly projectId: string;
  readonly asOf: Instant;
  /** The contractual completion date. `MET-DEL-011` and `MET-DEL-020` are measured against it. */
  readonly baselineCompletionDate: CalendarDate;
  /**
   * Delivery's current view of when the **project** will finish.
   *
   * Optional, and deliberately not defaulted. A milestone set is not a completion forecast — the
   * last milestone commonly sits well before the contractual end date, so inferring one from the
   * other reports every project finishing months early with total confidence. Where no forecast
   * exists, `MET-DEL-011` is not computable, which is the true statement.
   */
  readonly forecastCompletionDate?: CalendarDate;
  readonly milestones: readonly MilestoneInput[];
  readonly dependencies: readonly DependencyInput[];
  /** Ordered oldest-first. The window slice below assumes it. */
  readonly progress: readonly ProgressObservation[];
  /** `MET-DEL-019`'s registered window. Eight weeks, from the frozen formula. */
  readonly velocityWindowWeeks: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A number that may legitimately be absent, carrying the reason when it is. */
export interface DerivedValue<T> {
  readonly metricId: string;
  readonly value: T | null;
  readonly notComputableReason?: string;
  /** The epistemic state of this value (ADR-0028 D-1). */
  readonly state?: SignalState;
  readonly stateReasonCode?: NotEvaluatedReasonCode;
  /**
   * An **observed** adverse state that has no finite numeric representation (ADR-0027 D-2).
   *
   * `UNBOUNDED` means the ratio is not unmeasurable — it is larger than any finite value the metric
   * could return. It is the opposite of missing evidence and must never be treated as such: a
   * `null` value with this state set is the most adverse observation the metric can carry.
   */
  readonly adverseState?: 'UNBOUNDED';
}

export interface MilestoneView {
  readonly id: string;
  readonly name: string;
  readonly baselineDate: CalendarDate;
  readonly forecastDate: CalendarDate;
  readonly actualDate: CalendarDate | null;
  readonly paymentGating: boolean;
  /** Signed: positive is late against baseline. For a delivered milestone, against `actualDate`. */
  readonly slipDays: number;
  readonly state: 'DELIVERED_ON_TIME' | 'DELIVERED_LATE' | 'AT_RISK' | 'ON_TRACK';
}

export interface DeliveryEvaluation {
  readonly projectId: string;
  readonly asOf: Instant;
  /** `MET-DEL-009` — total forward slippage in days, across every milestone. */
  readonly milestoneSlippageDays: DerivedValue<number>;
  /** `MET-DEL-010` — undelivered milestones already forecast past their baseline. */
  readonly milestonesAtRisk: DerivedValue<number>;
  /** `MET-DEL-011` — signed calendar days between forecast and baseline completion. */
  readonly scheduleVarianceDays: DerivedValue<number>;
  /** `MET-DEL-019` — completion points gained per week over the trailing window. */
  readonly demonstratedVelocity: DerivedValue<Quantity>;
  /** `MET-DEL-020` — completion points per week still required to hit the baseline date. */
  readonly requiredFutureVelocity: DerivedValue<Quantity>;
  /** `MET-DEL-018` — required ÷ demonstrated. Above 1 means the plan needs a team it has not been. */
  readonly requiredVelocityRatio: DerivedValue<Quantity>;
  /** `MET-DEL-023` — the **oldest** open customer dependency, in days (ADR-0022 D-3). */
  readonly customerDependencyAgeingDays: DerivedValue<number>;
  /** The mean the signal collapsed, reported so the distribution is visible, never fed to health. */
  readonly customerDependencyMeanDays: DerivedValue<number>;
  readonly openCustomerDependencies: number;
  /** Delivered milestones hit on or before baseline, over delivered milestones. */
  readonly milestoneHitRate: DerivedValue<Quantity>;
  readonly milestones: readonly MilestoneView[];
  readonly lastCriticalMilestone: MilestoneView | null;
  readonly nextCriticalMilestone: MilestoneView | null;
  /**
   * The most recent progress observation, carried through untouched.
   *
   * `MET-DEL-016` and `MET-DEL-017` are **observed claims**, not derivations — they are passed on
   * rather than recomputed so a consumer that needs planned-versus-actual completion reads the same
   * fact the velocity metrics were built from, instead of finding its own latest row.
   */
  readonly progressAtLatest: ProgressObservation | null;
}

// ---------------------------------------------------------------------------

const nc = <T>(metricId: string, reason: string): DerivedValue<T> =>
  ({ metricId, value: null, notComputableReason: reason });

const ok = <T>(metricId: string, value: T): DerivedValue<T> => ({ metricId, value });

/** The risk object does not exist here: nothing is missing, and renormalising it away is safe. */
const na = <T>(metricId: string, reason: string): DerivedValue<T> => ({
  metricId, value: null, state: 'NOT_APPLICABLE',
  stateReasonCode: 'RISK_OBJECT_ABSENT', notComputableReason: reason,
});

/**
 * A milestone is *critical* when it gates payment.
 *
 * Not "important-sounding": a payment-gating milestone converts schedule slip into a cash and
 * revenue-recognition event, which is the only sense in which an executive surface can call one
 * milestone more critical than another without inventing a priority. The predicate is `paymentGating`
 * wherever `critical` appears below.
 */

function viewOf(m: MilestoneInput): MilestoneView {
  const settled = m.actualDate ?? null;
  // A delivered milestone is judged on when it actually landed. An undelivered one on where it is
  // currently forecast to land — those are different questions and must not share a field.
  const slipDays = settled === null
    ? daysBetween(m.baselineDate, m.forecastDate)
    : daysBetween(m.baselineDate, settled);
  const state: MilestoneView['state'] = settled !== null
    ? (slipDays > 0 ? 'DELIVERED_LATE' : 'DELIVERED_ON_TIME')
    : (slipDays > 0 ? 'AT_RISK' : 'ON_TRACK');
  return {
    id: m.id,
    name: m.name,
    baselineDate: m.baselineDate,
    forecastDate: m.forecastDate,
    actualDate: settled,
    paymentGating: m.paymentGating,
    slipDays,
    state,
  };
}

/**
 * Every registered delivery derivation, in one deterministic pass.
 *
 * Pure: same inputs, same output, no clock read and no I/O. `asOf` is supplied because "how old is
 * this dependency" is a question about a stated moment, not about now (G-CLOCK).
 */
export function evaluateDelivery(input: DeliveryEvaluationInput): DeliveryEvaluation {
  const today = dateOf(input.asOf);
  const views = input.milestones.map(viewOf);

  // --- MET-DEL-009: Σ max(0, forecastDate − baselineDate) --------------------
  // Forward-looking by construction: a milestone recovered to earlier than its baseline does not
  // offset one that slipped. Slippage does not net off, because the client did not experience it
  // netting off.
  const slippage = input.milestones.length === 0
    ? nc<number>('MET-DEL-009', 'the project has no milestones recorded')
    : ok('MET-DEL-009', input.milestones.reduce(
      (total, m) => total + Math.max(0, daysBetween(m.baselineDate, m.forecastDate)), 0,
    ));

  // --- MET-DEL-010: count(forecast > baseline AND actual IS NULL) ------------
  const atRisk = input.milestones.length === 0
    ? nc<number>('MET-DEL-010', 'the project has no milestones recorded')
    : ok('MET-DEL-010', input.milestones.filter(
      (m) => m.actualDate === undefined && daysBetween(m.baselineDate, m.forecastDate) > 0,
    ).length);

  // --- MET-DEL-011: forecastCompletionDate − baselineCompletionDate ----------
  // Signed, unlike MET-DEL-009: pulling the whole project earlier is a real and reportable outcome.
  const scheduleVariance = input.forecastCompletionDate === undefined
    ? nc<number>(
      'MET-DEL-011',
      'no forecast completion date is recorded for this project — the milestone set ends before '
      + 'the contractual end date and is not a substitute for one',
    )
    : ok('MET-DEL-011', daysBetween(input.baselineCompletionDate, input.forecastCompletionDate));

  // --- MET-DEL-019: (completion@t − completion@t−8w) / 8 ---------------------
  const window = input.velocityWindowWeeks;
  const n = input.progress.length;
  let demonstrated: DerivedValue<Quantity>;
  if (n < window + 1) {
    demonstrated = nc(
      'MET-DEL-019',
      `${String(n)} weekly progress observation${n === 1 ? '' : 's'}, below the `
      + `${String(window + 1)} an ${String(window)}-week velocity window requires`,
    );
  } else {
    const latest = input.progress[n - 1] as ProgressObservation;
    const earlier = input.progress[n - 1 - window] as ProgressObservation;
    const gained = qSub(qty(latest.physicalCompletion), qty(earlier.physicalCompletion));
    const perWeek = qDiv(gained, qty(String(window)));
    demonstrated = perWeek === null
      ? nc('MET-DEL-019', 'the velocity window is zero weeks')
      : ok('MET-DEL-019', perWeek);
  }

  // --- MET-DEL-020: (1 − completion) / weeks remaining to baseline ----------
  const latestClaim = input.progress.at(-1) ?? null;
  const daysRemaining = daysBetween(today, input.baselineCompletionDate);
  let required: DerivedValue<Quantity>;
  if (latestClaim === null) {
    required = nc('MET-DEL-020', 'no progress has been claimed, so completion is unknown');
  } else if (daysRemaining <= 0) {
    // Past the contractual date, "velocity required per remaining week" has no denominator. That is
    // not a nil requirement — it is a project already past its committed end, and saying so is the
    // honest output.
    required = nc(
      'MET-DEL-020',
      `the baseline completion date passed ${String(-daysRemaining)} days ago, so no weeks remain `
      + 'to spread the outstanding work across',
    );
  } else {
    const remainingWork = qSub(qty('1'), qty(latestClaim.physicalCompletion));
    const weeksRemaining = qDiv(qty(String(daysRemaining)), qty('7'));
    const perWeek = weeksRemaining === null ? null : qDiv(remainingWork, weeksRemaining);
    required = perWeek === null
      ? nc('MET-DEL-020', 'no weeks remain to the baseline completion date')
      : ok('MET-DEL-020', perWeek);
  }

  // --- MET-DEL-018: MET-DEL-020 / MET-DEL-019 -------------------------------
  let ratio: DerivedValue<Quantity>;
  if (required.value === null) {
    ratio = nc('MET-DEL-018', `required future velocity is not computable: ${required.notComputableReason ?? 'unknown'}`);
  } else if (demonstrated.value === null) {
    ratio = nc('MET-DEL-018', `demonstrated velocity is not computable: ${demonstrated.notComputableReason ?? 'unknown'}`);
  } else if (qCompare(demonstrated.value, qty('0')) <= 0) {
    /*
     * Observed zero is DATA, not absence (ADR-0027 D-2).
     *
     * Where work still remains -- required future velocity is positive -- a demonstrated velocity of
     * zero does not make the ratio unmeasurable. It makes it **unbounded**: the project needs
     * throughput it has not shown any of. Reporting that as NOT_COMPUTABLE let a stalled project
     * drop out of the Delivery score and read GREEN.
     *
     * No Infinity is produced: the numeric value stays null and the state is carried explicitly, so
     * nothing non-finite ever reaches Money/Quantity or serialisation.
     */
    ratio = qCompare(required.value, qty('0')) > 0
      ? {
        metricId: 'MET-DEL-018',
        value: null,
        adverseState: 'UNBOUNDED',
        notComputableReason:
          'demonstrated velocity is an observed zero over the window while '
          + `${qFixed(required.value, 4)} completion-points per week are still required -- the `
          + 'project has delivered nothing measurable and the required step-change is unbounded',
      }
      : nc(
        'MET-DEL-018',
        'demonstrated velocity is zero and no future velocity is required, so there is no '
        + 'step-change to assess',
      );
  } else if (false) {
    // Dividing by a zero or negative demonstrated velocity would produce an infinity or a
    // sign-flipped ratio that reads as *healthy*. A project that has gone backwards needs its own
    // statement, not a number.
    ratio = nc(
      'MET-DEL-018',
      'demonstrated velocity is zero or negative over the window — the project has not advanced, '
      + 'so there is no rate to compare the requirement against',
    );
  } else {
    const r = qDiv(required.value, demonstrated.value);
    ratio = r === null ? nc('MET-DEL-018', 'demonstrated velocity is zero') : ok('MET-DEL-018', r);
  }

  // --- MET-DEL-023: max and mean of (t − raisedDate) over open CUSTOMER deps -
  const openCustomer = input.dependencies.filter(
    (d) => d.owner === 'CUSTOMER' && d.resolvedOn === undefined,
  );
  const ages = openCustomer.map((d) => daysBetween(d.raisedOn, today));
  let ageingMax: DerivedValue<number>;
  let ageingMean: DerivedValue<number>;
  if (ages.length === 0) {
    /*
     * No open customer dependency is NOT_APPLICABLE, not unknown (ADR-0028 D-3).
     *
     * The risk object does not exist, so there is nothing to age and nothing missing. This was
     * previously NOT_COMPUTABLE, and the earlier claim in this comment — that the health model
     * "treats a missing input as missing rather than as good news" — was false: renormalisation
     * dropped it and raised the dimension by 15 points. Now the state says the risk is absent, and
     * only that state is safe to renormalise away.
     */
    const reason = 'no open customer dependencies exist on this project, so there is none to age';
    ageingMax = na('MET-DEL-023', reason);
    ageingMean = na('MET-DEL-023', reason);
  } else {
    ageingMax = ok('MET-DEL-023', Math.max(...ages));
    const total = ages.reduce((a, b) => a + b, 0);
    ageingMean = ok('MET-DEL-023', Math.round((total / ages.length) * 10) / 10);
  }

  // --- Milestone hit rate ---------------------------------------------------
  const delivered = views.filter((v) => v.actualDate !== null);
  const hitRate = delivered.length === 0
    ? nc<Quantity>('MET-DEL-009', 'no milestone has been delivered yet')
    : ok('MET-DEL-009', qDiv(
      qty(String(delivered.filter((v) => v.state === 'DELIVERED_ON_TIME').length)),
      qty(String(delivered.length)),
    ) ?? qty('0'));

  // --- Last and next critical milestone -------------------------------------
  const critical = views.filter((v) => v.paymentGating);
  const past = critical
    .filter((v) => v.actualDate !== null)
    .sort((a, b) => (a.actualDate as string).localeCompare(b.actualDate as string));
  const upcoming = critical
    .filter((v) => v.actualDate === null)
    .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate));

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    milestoneSlippageDays: slippage,
    milestonesAtRisk: atRisk,
    scheduleVarianceDays: scheduleVariance,
    demonstratedVelocity: demonstrated,
    requiredFutureVelocity: required,
    requiredVelocityRatio: ratio,
    customerDependencyAgeingDays: ageingMax,
    customerDependencyMeanDays: ageingMean,
    openCustomerDependencies: openCustomer.length,
    milestoneHitRate: hitRate,
    milestones: views,
    lastCriticalMilestone: past.at(-1) ?? null,
    nextCriticalMilestone: upcoming[0] ?? null,
    progressAtLatest: input.progress.at(-1) ?? null,
  };
}

/** Total gated value sitting behind milestones that are late and undelivered. */
export function gatedValueAtRisk(
  evaluation: DeliveryEvaluation,
  gatedValueOf: (milestoneId: string) => Quantity | null,
): Quantity {
  return evaluation.milestones
    .filter((m) => m.state === 'AT_RISK')
    .reduce((total, m) => qAdd(total, gatedValueOf(m.id) ?? qty('0')), qty('0'));
}

/** Percentage points, for a surface that wants `12.4` rather than `0.124`. */
export function asPoints(q: Quantity): Quantity {
  return qMul(q, qty('100'));
}
