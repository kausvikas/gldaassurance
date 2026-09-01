/**
 * ProjectEconomicsEngine — the authoritative implementation of `METRIC_CATALOG.md` §Financial.
 *
 * This is the only place project economics are computed. `PRODUCT_SPEC.md` §8.2 makes a metric
 * computed in a component, a chart config or an ad-hoc SQL view a defect, and the architecture gate
 * makes it a build failure.
 *
 * Written **independently from the Phase 3 generator oracle** (`scripts/generator/validate.ts`),
 * from the catalog definitions directly. Gate `G-ORACLE` makes importing that oracle from `src/` a
 * build failure — an engine validated against the thing that produced its own inputs proves nothing
 * (debt DR-015).
 *
 * Every function is pure: facts in, provenance-wrapped values out. No clock, no I/O, no ambient
 * state. That is what makes AC-7 — same inputs, same rule version, byte-identical output —
 * achievable rather than aspirational.
 */
import {
  type CurrencyCode, type Quantity, type Ratio, Money,
  isComputable, notComputable, qCompare, qIsZero, qSub, qty,
  ratioFromQuantity, ratioSubtractQuantity, ratioToQuantity,
} from '@platform/decimal';
import type { Instant } from '@platform/time';
import type { RecordRef } from '@platform/provenance';

/** L1 facts the engine needs. Supplied by the application layer; the engine fetches nothing. */
export interface EconomicsInput {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly currency: CurrencyCode;

  // --- contract, as-sold (immutable) ---------------------------------------
  /** MET-FIN-001 */ readonly contractValueAsSold: Money;
  /** MET-FIN-003 */ readonly budgetedCostAsSold: Money;
  /** MET-FIN-036 */ readonly contingencyBudget: Money;

  // --- executed contractual change, effective from its execution date only --
  readonly executedChanges: readonly {
    readonly id: string;
    readonly valueDelta: Money;
    readonly costDelta: Money;
    readonly contingencyDelta: Money;
  }[];

  /** Unexecuted. Never reaches base forecast revenue (REQ-FIN-005). */
  readonly pendingChanges: readonly {
    readonly id: string;
    readonly proposedValue: Money;
    /** Decimal string 0–1. */
    readonly approvalProbability: string;
  }[];

  // --- actuals and estimates -----------------------------------------------
  /** MET-FIN-005 */ readonly costToDate: Money;
  /** MET-FIN-007 — latest bottom-up revision only. */ readonly estimateToComplete: Money;
  /** MET-FIN-023 — non-cancellable commitments only. */ readonly committedFutureCost: Money;
  /** MET-FIN-037 */ readonly contingencyConsumed: Money;

  // --- delivery ------------------------------------------------------------
  /** MET-DEL-016 — decimal string 0–1, an observed claim. */ readonly physicalCompletion: string | null;
  /** MET-DEL-017 */ readonly plannedCompletion: string | null;

  // --- risk ----------------------------------------------------------------
  readonly risks: readonly {
    readonly id: string;
    readonly probability: string;
    readonly costImpact: Money;
    /** The anti-double-counting flag. See `incrementalRiskExposure`. */
    readonly includedInEtc: boolean;
    readonly state: string;
  }[];

  // --- other exposure ------------------------------------------------------
  readonly liquidatedDamagesExposure?: Money;
  readonly uncompensatedScopeExposure?: Money;

  // --- policy --------------------------------------------------------------
  /** EAC-v1: below this physical completion, MET-FIN-029 is arithmetic noise. */
  readonly maturityThresholdCompletion: string;
  readonly progressMeasureCredible: boolean;
}

export interface EconomicsResult {
  readonly projectId: string;
  readonly asOf: Instant;
  readonly currency: CurrencyCode;
  /** MET-FIN-002 */ readonly contractualRevenue: Money;
  /** MET-FIN-004 */ readonly budgetedCostCurrentContractual: Money;
  /** MET-FIN-010 */ readonly forecastRevenue: Money;
  /** MET-FIN-011 */ readonly unsecuredUpside: Money;
  /**
   * `MET-FIN-011` expressed as a share of `MET-FIN-002`.
   *
   * Not a new metric: it is the same figure over the contractual revenue that gives it meaning.
   * `HEALTH_MODEL_V2`'s `UNSECURED_UPSIDE_RATIO` input is banded at 0.01 → 0.12, which are the edges
   * of a *proportion of contract value*, not of an absolute sum — so the ratio is produced here,
   * where both operands are Financial's own, rather than divided in an adapter (ADR-0022 D-2).
   */
  readonly unsecuredUpsideRatio: Ratio;
  /** MET-FIN-008 */ readonly estimateAtCompletion: Money;
  /** MET-FIN-026 */ readonly soldGmValue: Money;
  /** MET-FIN-012 */ readonly soldGmPercent: Ratio;
  /** MET-FIN-024 */ readonly forecastGmValue: Money;
  /** MET-FIN-014 */ readonly forecastGmPercent: Ratio;
  /** MET-FIN-017 */ readonly marginValueDelta: Money;
  /** MET-FIN-025 */ readonly gmErosionValue: Money;
  /** MET-FIN-016 */ readonly marginErosionPp: Ratio;
  /** MET-FIN-028 */ readonly costConsumedPercent: Ratio;
  /** MET-FIN-027 */ readonly burnGap: Ratio;
  /** MET-DEL-015 */ readonly progressVariance: Ratio;
  /** MET-FIN-035 */ readonly contingencyConsumedPercent: Ratio;
  /** MET-FIN-034 */ readonly contingencyBurnGap: Ratio;
  /** MET-FIN-029 — null below the maturity gate, with the reason stated. */
  readonly performanceImpliedEac: Money | null;
  readonly performanceImpliedEacNotComputableReason?: string;
  /** MET-FIN-030 */ readonly etcOptimismGap: Money | null;
  /**
   * `MET-FIN-040` — the optimism gap as a share of the **stated** EAC.
   *
   * The comparand behind `ELV-ETC-OPTIMISM`, which previously compared a ratio against `0.10` while
   * citing `MET-FIN-030` — a Money value. Denominated in the stated EAC so it reads "management's
   * estimate is understated by X% of itself" (ADR-0025 D-3).
   */
  readonly etcOptimismRatio: Ratio | null;
  /** MET-RSK-001 */ readonly grossRiskExposure: Money;
  /** MET-RSK-008 — only risk NOT already in ETC. */ readonly incrementalRiskExposure: Money;
  /** The double count avoided, reported so the control is visible rather than implied. */
  readonly riskProvisionedInEtc: Money;
  /** MET-COM-010 */ readonly expectedPendingCrRecovery: Money;
  /** MET-FIN-031 */ readonly riskAdjustedRevenue: Money;
  /** MET-FIN-032 */ readonly riskAdjustedGmValue: Money;
  /** MET-FIN-033 */ readonly riskAdjustedGmPercent: Ratio;
  /** MET-FIN-019 */ readonly gmValueAtRisk: Money;
  readonly gmValueAtRiskRatio: Ratio;

  // --- earned value (REQ-FIN-006) -------------------------------------------
  /** MET-DEL-001 — budgeted cost of the work the baseline says should be done by now. */
  readonly plannedValue: Money | null;
  /** MET-DEL-002 — budgeted cost of the work actually done. */
  readonly earnedValue: Money | null;
  /** MET-DEL-003 — the same observed figure as MET-FIN-005, named in EVM terms. */
  readonly actualCost: Money;
  /** MET-DEL-004 — EV / AC. Below 1 means each pound bought less than a pound of value. */
  readonly costPerformanceIndex: Ratio;
  /** MET-DEL-005 — EV / PV. */
  readonly schedulePerformanceIndex: Ratio;
  /** MET-DEL-006 — EV − AC. */
  readonly costVariance: Money | null;
  /** MET-DEL-007 — EV − PV. */
  readonly scheduleVariance: Money | null;
  /** MET-DEL-008 — budgeted cost at completion − EAC. Negative is an overrun. */
  readonly varianceAtCompletion: Money;
  readonly evidence: readonly RecordRef[];
}

const ref = (context: string, entityType: string, entityId: string, metricId?: string): RecordRef =>
  metricId === undefined ? { context, entityType, entityId } : { context, entityType, entityId, metricId };

/**
 * The whole of project economics, in one deterministic pass.
 *
 * Two properties are enforced here rather than trusted:
 *   1. **Pending change requests never reach base forecast revenue.** `forecastRevenue` is derived
 *      from executed changes only, and the pending population is not in scope of that expression.
 *   2. **Risk is not double counted.** A risk already provisioned inside ETC is excluded from
 *      incremental exposure, and the amount excluded is returned so the control can be seen.
 */
export function computeEconomics(input: EconomicsInput): EconomicsResult {
  const { currency } = input;
  const zero = Money.zero(currency);

  // --- MET-FIN-002 / 004: executed contractual change only -------------------
  const executedValueDelta = input.executedChanges.reduce((a, c) => a.plus(c.valueDelta), zero);
  const executedCostDelta = input.executedChanges.reduce((a, c) => a.plus(c.costDelta), zero);
  const executedContingencyDelta = input.executedChanges.reduce((a, c) => a.plus(c.contingencyDelta), zero);
  const contractualRevenue = input.contractValueAsSold.plus(executedValueDelta);
  const budgetedCostCurrentContractual = input.budgetedCostAsSold.plus(executedCostDelta);
  const contingencyBudget = input.contingencyBudget.plus(executedContingencyDelta);

  // --- MET-FIN-010: base forecast revenue -----------------------------------
  // REQ-FIN-005. Pending changes are deliberately absent from this expression: there is no code
  // path by which an unexecuted change can raise it. They surface as MET-FIN-011 and, weighted, in
  // the risk-adjusted scenario — and nowhere else.
  const forecastRevenue = contractualRevenue;

  const unsecuredUpside = input.pendingChanges.reduce((a, c) => a.plus(c.proposedValue), zero);

  // --- MET-FIN-008: EAC = ATD + bottom-up ETC + committed future cost --------
  const estimateAtCompletion = input.costToDate
    .plus(input.estimateToComplete)
    .plus(input.committedFutureCost);

  // --- margin ----------------------------------------------------------------
  const soldGmValue = input.contractValueAsSold.minus(input.budgetedCostAsSold);
  const soldGmPercent = soldGmValue.dividedBy(input.contractValueAsSold);
  const forecastGmValue = forecastRevenue.minus(estimateAtCompletion);
  const forecastGmPercent = forecastGmValue.dividedBy(forecastRevenue);
  const marginValueDelta = forecastGmValue.minus(soldGmValue);
  const gmErosionValue = soldGmValue.minus(forecastGmValue);
  const soldGmQ = ratioToQuantity(soldGmPercent);
  const forecastGmQ = ratioToQuantity(forecastGmPercent);
  const marginErosionPp = forecastGmQ !== null && soldGmQ !== null
    ? ratioFromQuantity(qSub(forecastGmQ as Quantity, soldGmQ as Quantity))
    : notComputable('ZERO_DENOMINATOR');

  // --- progress and burn -----------------------------------------------------
  const costConsumedPercent = input.costToDate.dividedBy(budgetedCostCurrentContractual);
  const physical = input.physicalCompletion === null ? null : qty(input.physicalCompletion);
  const planned = input.plannedCompletion === null ? null : qty(input.plannedCompletion);

  const burnGap = isComputable(costConsumedPercent) && physical !== null
    ? ratioSubtractQuantity(costConsumedPercent, physical)
    : notComputable(physical === null ? 'SOURCE_UNAVAILABLE' : 'ZERO_DENOMINATOR');

  const progressVariance = physical !== null && planned !== null
    ? ratioFromQuantity(qSub(physical, planned))
    : notComputable('SOURCE_UNAVAILABLE');

  const contingencyConsumedPercent = input.contingencyConsumed.dividedBy(contingencyBudget);
  const contingencyBurnGap = isComputable(contingencyConsumedPercent) && physical !== null
    ? ratioSubtractQuantity(contingencyConsumedPercent, physical)
    : notComputable(physical === null ? 'SOURCE_UNAVAILABLE' : 'ZERO_DENOMINATOR');

  // --- MET-FIN-029 / 030: the maturity gate is part of the definition --------
  // Below the threshold, cost ÷ completion is arithmetic noise presented as a forecast: at 3%
  // complete a rounding error in the progress claim moves the implied outturn by millions.
  let performanceImpliedEac: Money | null = null;
  let performanceImpliedEacNotComputableReason: string | undefined;
  if (physical === null) {
    performanceImpliedEacNotComputableReason = 'physical completion is not available';
  } else if (qIsZero(physical)) {
    performanceImpliedEacNotComputableReason = 'physical completion is zero';
  } else if (!input.progressMeasureCredible) {
    performanceImpliedEacNotComputableReason = 'the progress measure is not assessed as credible (EAC-v1)';
  } else if (qCompare(physical, qty(input.maturityThresholdCompletion)) < 0) {
    performanceImpliedEacNotComputableReason =
      `physical completion ${physical} is below the EAC-v1 maturity threshold of ` +
      `${input.maturityThresholdCompletion}`;
  } else {
    performanceImpliedEac = input.costToDate.dividedByQuantity(physical);
  }

  // Clamped at zero: a management EAC above the implied figure is prudence, not optimism.
  const etcOptimismGap = performanceImpliedEac === null
    ? null
    : performanceImpliedEac.compare(estimateAtCompletion) > 0
      ? performanceImpliedEac.minus(estimateAtCompletion)
      : zero;

  const etcOptimismRatio = etcOptimismGap === null || estimateAtCompletion.isZero()
    ? null
    : etcOptimismGap.dividedBy(estimateAtCompletion);

  // --- risk, without double counting ----------------------------------------
  const openRisks = input.risks.filter((r) => r.state !== 'MITIGATED' && r.state !== 'REALISED');
  const weighted = (r: { probability: string; costImpact: Money }) => r.costImpact.times(r.probability);
  const grossRiskExposure = openRisks.reduce((a, r) => a.plus(weighted(r)), zero);
  const incrementalRiskExposure = openRisks
    .filter((r) => !r.includedInEtc)
    .reduce((a, r) => a.plus(weighted(r)), zero);
  // Returned explicitly so the control is auditable. A risk provisioned inside ETC and also deducted
  // from margin is counted twice, and the error is invisible unless the exclusion is reported.
  const riskProvisionedInEtc = openRisks
    .filter((r) => r.includedInEtc)
    .reduce((a, r) => a.plus(weighted(r)), zero);

  // --- risk-adjusted scenario ------------------------------------------------
  const expectedPendingCrRecovery = input.pendingChanges
    .reduce((a, c) => a.plus(c.proposedValue.times(c.approvalProbability)), zero);
  const riskAdjustedRevenue = forecastRevenue.plus(expectedPendingCrRecovery);
  const riskAdjustedGmValue = riskAdjustedRevenue
    .minus(estimateAtCompletion)
    .minus(incrementalRiskExposure);
  const riskAdjustedGmPercent = riskAdjustedGmValue.dividedBy(riskAdjustedRevenue);

  // --- MET-FIN-019 -----------------------------------------------------------
  // Clamped at zero and capped at contractual revenue: a project cannot put more at risk than it is
  // worth (TEST_STRATEGY §3.3).
  //
  // **MET-FIN-019 can legitimately exceed sold GM, and does on 21 of 75 fixed-bid projects.** It is
  // erosion against the as-sold position, not "the share of sold margin still at risk": once
  // risk-adjusted GM goes negative the exposure covers both the planned margin lost AND the
  // contract loss beyond it. Sold GM +$1.0M against risk-adjusted GM -$0.8M is a VaR of $1.8M, and
  // that is coherent. **No surface may present this as a percentage of sold margin remaining.**
  const rawVar = soldGmValue.minus(riskAdjustedGmValue);
  const gmValueAtRisk = rawVar.isNegative()
    ? zero
    : rawVar.compare(contractualRevenue) > 0 ? contractualRevenue : rawVar;
  const gmValueAtRiskRatio = soldGmValue.isZero()
    ? notComputable('ZERO_DENOMINATOR')
    : gmValueAtRisk.dividedBy(soldGmValue);

  const p = input.projectId;
  const evidence: RecordRef[] = [
    ref('contract', 'AsSoldBaseline', p, 'MET-FIN-001'),
    ref('financial', 'ActualCost', p, 'MET-FIN-005'),
    ref('financial', 'EtcLineItem', p, 'MET-FIN-007'),
    ref('financial', 'Commitment', p, 'MET-FIN-023'),
    ref('financial', 'ContingencyDrawdown', p, 'MET-FIN-037'),
    ref('delivery', 'ProgressClaim', p, 'MET-DEL-016'),
    ...input.executedChanges.map((c) => ref('contract', 'ExecutedChange', c.id)),
    ...input.pendingChanges.map((c) => ref('contract', 'PendingChange', c.id)),
    ...openRisks.map((r) => ref('risk', 'Risk', r.id)),
  ];

  // --- MET-DEL-001…008: earned value ---------------------------------------
  // PV and EV are both budget × a completion fraction, so both are NOT_COMPUTABLE when the
  // corresponding completion claim is missing. Returning zero would read as "no work planned" or
  // "no work done", which are claims the facts do not support.
  const plannedValue = input.plannedCompletion === null
    ? null
    : budgetedCostCurrentContractual.times(input.plannedCompletion);
  const earnedValue = input.physicalCompletion === null
    ? null
    : budgetedCostCurrentContractual.times(input.physicalCompletion);
  const costPerformanceIndex = earnedValue === null
    ? notComputable('SOURCE_UNAVAILABLE')
    : earnedValue.dividedBy(input.costToDate);
  const schedulePerformanceIndex = earnedValue === null || plannedValue === null
    ? notComputable('SOURCE_UNAVAILABLE')
    : earnedValue.dividedBy(plannedValue);
  const costVariance = earnedValue === null ? null : earnedValue.minus(input.costToDate);
  const scheduleVariance = earnedValue === null || plannedValue === null
    ? null
    : earnedValue.minus(plannedValue);
  const varianceAtCompletion = budgetedCostCurrentContractual.minus(estimateAtCompletion);

  return {
    projectId: p, asOf: input.asOf, currency,
    contractualRevenue, budgetedCostCurrentContractual, forecastRevenue, unsecuredUpside,
    unsecuredUpsideRatio: unsecuredUpside.dividedBy(contractualRevenue),
    estimateAtCompletion, soldGmValue, soldGmPercent, forecastGmValue, forecastGmPercent,
    marginValueDelta, gmErosionValue, marginErosionPp, costConsumedPercent, burnGap,
    progressVariance, contingencyConsumedPercent, contingencyBurnGap,
    performanceImpliedEac,
    ...(performanceImpliedEacNotComputableReason !== undefined
      ? { performanceImpliedEacNotComputableReason } : {}),
    etcOptimismGap, etcOptimismRatio, grossRiskExposure, incrementalRiskExposure, riskProvisionedInEtc,
    expectedPendingCrRecovery, riskAdjustedRevenue, riskAdjustedGmValue, riskAdjustedGmPercent,
    gmValueAtRisk, gmValueAtRiskRatio,
    plannedValue, earnedValue, actualCost: input.costToDate,
    costPerformanceIndex, schedulePerformanceIndex,
    costVariance, scheduleVariance, varianceAtCompletion,
    evidence,
  };
}

/** Ratio → decimal string, or `null` when NOT_COMPUTABLE. Never `NaN`, never a silent dash. */
export function ratioValue(r: Ratio, dp = 6): string | null {
  return isComputable(r) ? r.value.toFixed(dp) : null;
}
