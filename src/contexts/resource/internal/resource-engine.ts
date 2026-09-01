/**
 * Resource derivation — the staffing economics behind the margin bridge.
 *
 * **Why this file exists here.** `MET-RES-001`…`010` are registered `L2_DERIVED` with
 * `owner: Resource`, and `ResourceSnapshot` in this context's public surface has declared them
 * since Phase 2, while the manifest said `outputLayers: ["L1"]`. That is the identical stale-entry
 * pattern `CONFLICT C-21` resolved for Commercial and Quality, and **ADR-0022 D-1 already settles
 * the principle**: an epistemic layer is a property of a *value*, not of a module. No new conflict
 * is raised; the manifest entry is corrected the same way.
 *
 * Tier 2, `mayDependOn: []`. The as-sold baseline figures this needs — planned effort, priced
 * blended rate, priced pyramid ratio — belong to `contract` and are **passed in**.
 *
 * ### Personal data never leaves here
 *
 * `SECURITY_MODEL.md` §4.3 classifies resource records `PERSONAL_DATA`. This engine takes
 * `personRef` and a seniority band and returns **counts, ratios and rates** — never a name, never an
 * individual's cost. `MET-RES-007` key-person concentration is registered as *"a percentage, never a
 * name"* for the same reason. A caller wanting to show staffing mix gets bands and headcounts; there
 * is no shape in this file that could carry a salary.
 */
import {
  type CurrencyCode, Money, type Quantity, qAdd, qCompare, qDiv, qMul, qSub, qty,
} from '@platform/decimal';
import type { Instant } from '@platform/time';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type SeniorityBand = 'PRINCIPAL' | 'SENIOR' | 'MID' | 'JUNIOR' | 'TRAINEE';

/**
 * Senior-side bands for `MET-RES-003`.
 *
 * **This is a definitional judgement, made here, and it is not recorded in any ADR (DR-064).** The
 * registered formula says *"senior FTE / junior FTE (bands per resource config)"* and defers the
 * split; there is no resource config, so this constant is the split. Placing `MID` on the junior
 * side is a defensible reading and is not the only one -- moving it changes `MET-RES-003` and
 * therefore `MET-RES-004` pyramid drift on every project.
 *
 * Left as-is deliberately: changing it would be inventing a policy, which is the rule owner's call.
 */
export const SENIOR_BANDS: readonly SeniorityBand[] = ['PRINCIPAL', 'SENIOR'];

export type DeliveryLocation = 'ONSHORE' | 'NEARSHORE' | 'OFFSHORE';
export type EngagementType = 'EMPLOYEE' | 'SUBCONTRACTOR';

export interface AssignmentInput {
  readonly id: string;
  /** An opaque reference. Never a name, and nothing here resolves it to one. */
  readonly personRef: string;
  readonly seniorityBand: SeniorityBand;
  /** A delivery site, never an address (DR-056). */
  readonly deliveryLocation: DeliveryLocation;
  /** A contract form, never a supplier name (DR-056). */
  readonly engagementType: EngagementType;
  readonly allocationPercent: Quantity;
  readonly ended: boolean;
}

export interface EffortInput {
  readonly week: string;
  readonly hours: Quantity;
  readonly billable: boolean;
  readonly isRework: boolean;
}

export interface ResourceEvaluationInput {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly assignments: readonly AssignmentInput[];
  readonly effort: readonly EffortInput[];
  /** `MET-FIN-005` cost to date — the numerator of the actual blended rate. */
  readonly actualCost: Money;
  /** `contract:baseline.plannedEffortHours` — the whole-project priced effort. */
  readonly plannedEffortHours: Quantity;
  /**
   * `MET-DEL-016` **claimed physical completion**, used to time-phase the priced effort.
   *
   * Not `MET-DEL-017` (planned progress at t). The two differ on 74 of 75 fixed-bid projects and
   * naming the wrong one is exactly the defect ADR-0024 removed.
   *
   * `MET-RES-002` is *"actual hours − planned hours (**named baseline**)"*, and naming the baseline
   * is the substantive part. Comparing hours-to-date against whole-project planned hours compares
   * incomparable things: a project halfway through would show a vast fictitious "saving" — on the
   * demo portfolio, -18,648 hours and a +$1.38M phantom credit on the margin bridge.
   *
   * The named baseline is **priced effort x physical completion at t** — the effort the work
   * *actually completed* was priced at. This is the earned-value comparison, and ADR-0024 fixes it
   * deliberately in preference to the schedule figure.
   *
   * **It must not be the planned-completion ratio.** Time-phasing by where the *schedule* said the
   * project would be asks whether the planned hours have been spent, so a project running late
   * books an effort *underrun* for work it has not done, which the bridge then values at the sold
   * rate and reports as margin gained. On the demo portfolio that mistake created **$63.31M** of
   * phantom credit across 48 behind-schedule projects. Slippage is a schedule fact and is reported
   * by the delivery dimension; it is not effort efficiency.
   *
   * `null` where no progress has been claimed, in which case the variance is not computable.
   */
  readonly earnedCompletionRatio: Quantity | null;
  /** `contract:baseline.blendedRate` — the reference for `MET-RES-005`. */
  readonly soldBlendedRate: Money;
  /** `contract:baseline.pyramidRatio` — the reference for `MET-RES-004`. */
  readonly soldPyramidRatio: Quantity;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface DerivedValue<T> {
  readonly metricId: string;
  readonly value: T | null;
  readonly notComputableReason?: string;
}

/** Headcount by band. Counts only — the shape cannot carry a name or a rate per person. */
export interface SeniorityMix {
  readonly band: SeniorityBand;
  readonly people: number;
  readonly fte: Quantity;
}

export interface ResourceEvaluation {
  readonly projectId: string;
  readonly asOf: Instant;
  /** `MET-RES-001` — billable hours over all hours. */
  readonly billableUtilisation: DerivedValue<Quantity>;
  /** `MET-RES-002` — actual hours less planned hours **to date**. Positive is an overrun. */
  readonly effortVarianceHours: DerivedValue<Quantity>;
  /** The named baseline the variance was measured against, so the comparison is auditable. */
  readonly plannedEffortToDate: DerivedValue<Quantity>;
  /** Which baseline `MET-RES-002` was measured against, in words. */
  readonly effortBaselineBasis: string;
  readonly actualHours: Quantity;
  /** `MET-RES-003` — senior FTE over junior FTE. */
  readonly pyramidRatio: DerivedValue<Quantity>;
  /** `MET-RES-004` — pyramid ratio less the as-sold ratio. */
  readonly pyramidDrift: DerivedValue<Quantity>;
  /** The actual blended cost rate: `MET-FIN-005 / total hours`. */
  readonly actualBlendedRate: DerivedValue<Money>;
  /** `MET-RES-005` — actual blended rate less the as-sold rate, per hour. */
  readonly blendedRateVariance: DerivedValue<Money>;
  /** `MET-RES-010` — `MET-RES-005 × hours to date`. The margin effect of rate drift. */
  readonly resourceCostDriftImpact: DerivedValue<Money>;
  /** `MET-RES-007` — the largest single contributor's share of hours. A percentage, never a name. */
  readonly keyPersonConcentration: DerivedValue<Quantity>;
  readonly seniorityMix: readonly SeniorityMix[];
  /** Headcount and FTE by delivery location. Counts only — no individual is identifiable. */
  readonly locationMix: readonly { readonly location: DeliveryLocation; readonly people: number; readonly fte: Quantity }[];
  /** Employee versus subcontractor split, as counts. */
  readonly engagementMix: readonly { readonly engagementType: EngagementType; readonly people: number; readonly fte: Quantity }[];
  readonly activeAssignments: number;
}

const nc = <T>(metricId: string, reason: string): DerivedValue<T> =>
  ({ metricId, value: null, notComputableReason: reason });

const ok = <T>(metricId: string, value: T): DerivedValue<T> => ({ metricId, value });

/** Every registered resource derivation, in one deterministic pass. Pure; no clock, no I/O. */
export function evaluateResource(input: ResourceEvaluationInput): ResourceEvaluation {
  const totalHours = input.effort.reduce((a, e) => qAdd(a, e.hours), qty('0'));
  const billableHours = input.effort
    .filter((e) => e.billable)
    .reduce((a, e) => qAdd(a, e.hours), qty('0'));
  const noHours = qCompare(totalHours, qty('0')) <= 0;

  // --- MET-RES-001: billable / all hours ------------------------------------
  const billableUtilisation = noHours
    ? nc<Quantity>('MET-RES-001', 'no effort has been recorded, so there are no hours to divide')
    : ok('MET-RES-001', qDiv(billableHours, totalHours) ?? qty('0'));

  // --- MET-RES-002: actual hours − planned hours to date --------------------
  // Signed: a project genuinely delivering under its priced effort is a real and reportable
  // outcome, and reporting it as an absolute "variance" would make underspend look like overrun.
  const plannedEffortToDate = input.earnedCompletionRatio === null
    ? nc<Quantity>('MET-RES-002', 'no physical completion has been claimed, so the priced effort cannot be time-phased')
    : ok('MET-RES-002', qMul(input.plannedEffortHours, input.earnedCompletionRatio));
  const effortVarianceHours = plannedEffortToDate.value === null
    ? nc<Quantity>('MET-RES-002', plannedEffortToDate.notComputableReason ?? 'planned effort to date is not computable')
    : ok('MET-RES-002', qSub(totalHours, plannedEffortToDate.value));

  // --- MET-RES-003 / 004: pyramid ------------------------------------------
  const active = input.assignments.filter((a) => !a.ended);
  const fteOf = (bands: readonly SeniorityBand[]): Quantity => active
    .filter((a) => bands.includes(a.seniorityBand))
    .reduce((acc, a) => qAdd(acc, qDiv(a.allocationPercent, qty('100')) ?? qty('0')), qty('0'));
  const seniorFte = fteOf(SENIOR_BANDS);
  const juniorFte = fteOf((['MID', 'JUNIOR', 'TRAINEE'] as const));
  const pyramidRatio = qCompare(juniorFte, qty('0')) <= 0
    ? nc<Quantity>(
      'MET-RES-003',
      active.length === 0
        ? 'no active assignments'
        : 'no junior-band FTE on the project, so the senior-to-junior ratio has no denominator',
    )
    : ok('MET-RES-003', qDiv(seniorFte, juniorFte) ?? qty('0'));
  const pyramidDrift = pyramidRatio.value === null
    ? nc<Quantity>('MET-RES-004', `pyramid ratio is not computable: ${pyramidRatio.notComputableReason ?? 'unknown'}`)
    : ok('MET-RES-004', qSub(pyramidRatio.value, input.soldPyramidRatio));

  // --- Actual blended rate, MET-RES-005, MET-RES-010 ------------------------
  // The actual rate is cost over hours. Both are project totals, so no individual's cost is
  // recoverable from the result — which is what makes this safe to show.
  const currency = input.actualCost.toDto().currency as CurrencyCode;
  const rateQ = noHours ? null : qDiv(input.actualCost.toQuantity(), totalHours);
  const actualBlendedRate = rateQ === null
    ? nc<Money>('MET-RES-005', 'no effort has been recorded, so there is no hour count to divide cost by')
    : ok('MET-RES-005', Money.of(rateQ, currency));
  const blendedRateVariance = rateQ === null
    ? nc<Money>('MET-RES-005', 'no effort has been recorded, so there is no actual blended rate to compare')
    : ok('MET-RES-005', (actualBlendedRate.value as Money).minus(input.soldBlendedRate));
  const resourceCostDriftImpact = blendedRateVariance.value === null
    ? nc<Money>('MET-RES-010', `blended rate variance is not computable: ${blendedRateVariance.notComputableReason ?? 'unknown'}`)
    : ok('MET-RES-010', (blendedRateVariance.value).times(totalHours));

  // --- MET-RES-007: key-person concentration -------------------------------
  // The largest single contributor's share of delivered hours. Registered as a percentage and
  // returned as one: the person is identified only by an opaque reference, which is not returned.
  const byPerson = new Map<string, Quantity>();
  for (const a of active) {
    byPerson.set(a.personRef, qAdd(byPerson.get(a.personRef) ?? qty('0'), a.allocationPercent));
  }
  const totalAllocation = [...byPerson.values()].reduce((x, y) => qAdd(x, y), qty('0'));
  const largest = [...byPerson.values()].reduce(
    (x, y) => (qCompare(y, x) > 0 ? y : x), qty('0'),
  );
  const keyPersonConcentration = qCompare(totalAllocation, qty('0')) <= 0
    ? nc<Quantity>('MET-RES-007', 'no active assignments, so there is no allocation to concentrate')
    : ok('MET-RES-007', qDiv(largest, totalAllocation) ?? qty('0'));

  // --- Seniority mix --------------------------------------------------------
  const bands: readonly SeniorityBand[] = ['PRINCIPAL', 'SENIOR', 'MID', 'JUNIOR', 'TRAINEE'];
  const seniorityMix = bands.map((band) => {
    const inBand = active.filter((a) => a.seniorityBand === band);
    return {
      band,
      people: new Set(inBand.map((a) => a.personRef)).size,
      fte: inBand.reduce((acc, a) => qAdd(acc, qDiv(a.allocationPercent, qty('100')) ?? qty('0')), qty('0')),
    };
  });

  const mixOf = <K extends string>(
    keys: readonly K[], pick: (a: AssignmentInput) => K,
  ) => keys.map((key) => {
    const inGroup = active.filter((a) => pick(a) === key);
    return {
      key,
      people: new Set(inGroup.map((a) => a.personRef)).size,
      fte: inGroup.reduce((acc, a) => qAdd(acc, qDiv(a.allocationPercent, qty('100')) ?? qty('0')), qty('0')),
    };
  });

  return {
    projectId: input.projectId,
    asOf: input.asOf,
    locationMix: mixOf(['ONSHORE', 'NEARSHORE', 'OFFSHORE'] as const, (a) => a.deliveryLocation)
      .map((m) => ({ location: m.key, people: m.people, fte: m.fte })),
    engagementMix: mixOf(['EMPLOYEE', 'SUBCONTRACTOR'] as const, (a) => a.engagementType)
      .map((m) => ({ engagementType: m.key, people: m.people, fte: m.fte })),
    billableUtilisation,
    effortVarianceHours,
    plannedEffortToDate,
    effortBaselineBasis:
      'priced effort (contract:baseline.plannedEffortHours) time-phased by the claimed **physical '
      + 'completion** at the as-of date -- the effort the work actually completed was priced at '
      + '(earned value). Not the planned-completion ratio: that would credit unperformed work as an '
      + 'effort saving (ADR-0024).',
    actualHours: totalHours,
    pyramidRatio,
    pyramidDrift,
    actualBlendedRate,
    blendedRateVariance,
    resourceCostDriftImpact,
    keyPersonConcentration,
    seniorityMix,
    activeAssignments: active.length,
  };
}

/** Unused hours guard, exported so a caller can state the denominator it relied on. */
export function hasEffort(input: ResourceEvaluationInput): boolean {
  return input.effort.length > 0;
}
