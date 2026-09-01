/**
 * RecoveryEconomicsEngine — four margin figures, kept apart on purpose.
 *
 * | Figure | Question it answers | Metric |
 * | --- | --- | --- |
 * | Current Forecast GM | Where we land if nothing changes | MET-FIN-014 |
 * | Risk-Adjusted GM | Where we land if the open risks materialise as assessed | MET-FIN-033 |
 * | Recovery Case GM | Where we land if every recovery action works | MET-REC-001 |
 * | Probability-Adjusted Recovery GM | Where we land given how likely those actions are | MET-REC-002 |
 *
 * The gap between the last two is the honest measure of how much of a recovery plan is a plan and
 * how much is hope. Reporting only the recovery case is how a project stays Green on a slide for
 * two quarters; reporting only the probability-adjusted figure hides what a fully-delivered plan
 * would actually be worth. Both, side by side, or neither.
 *
 * **Anti-double-counting.** Two actions in the same incompatibility group are two descriptions of
 * one fix — "renegotiate the CR" and "absorb the CR into the next release" cannot both bank their
 * benefit. Only the largest benefit in each group is counted, and every action dropped is named in
 * the explanation. This is the single most common way a recovery plan comes to promise more margin
 * than the contract contains.
 *
 * This context may not import `financial` (ADR-0001 §4.1; `recovery` may depend only on `rules`,
 * `contract`, `delivery`, `risk`). The base economics are therefore **passed in** by the application
 * layer rather than reached for — the same ports-in shape ADR-0012 uses elsewhere.
 */
import {
  type CurrencyCode, type Money, type Quantity, type Ratio,
  Q_ZERO, isComputable, notComputable, qAdd, qClamp, qCompare, qDiv, qFixed, qMul, qSub, qty,
  ratioToQuantity,
} from '@platform/decimal';
import { type Explanation, type RuleEvaluation, explain } from '@platform/explainability';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export type RecoveryActionStatus = 'PROPOSED' | 'COMMITTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ABANDONED';

/** A recovery action as the engine needs it: owned, dated, quantified, and confidence-rated. */
export interface RecoveryActionInput {
  readonly id: string;
  readonly description: string;
  /** Null is legal and is a finding: an unowned action is not a plan. */
  readonly ownerActorId: string | null;
  readonly dueOn: CalendarDate | null;
  readonly status: RecoveryActionStatus;
  /** Revenue this action would add — a signed CR, a released hold-back. Never a pending CR. */
  readonly revenueBenefit: Money;
  /** Cost this action would remove. */
  readonly costBenefit: Money;
  /** Weeks of schedule this action would recover. */
  readonly scheduleBenefitWeeks: number;
  /** 0–1. How likely this action is to land as written. */
  readonly confidence: Quantity;
  /**
   * Actions sharing a group address the same underlying problem; only the largest benefit in the
   * group is banked. Null means the action is independent.
   */
  readonly incompatibilityGroup: string | null;
  readonly evidence: readonly RecordRef[];
}

export interface RecoveryEconomicsInput {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly currency: CurrencyCode;
  /** MET-FIN-010 — forecast revenue, excluding pending change requests (REQ-FIN-005). */
  readonly forecastRevenue: Money;
  /** MET-FIN-008 — EAC cost. */
  readonly forecastCost: Money;
  /** MET-FIN-014, supplied not recomputed — one definition, one implementation, one owner. */
  readonly forecastGmPercent: Ratio;
  /** MET-FIN-033, supplied by `financial`. */
  readonly riskAdjustedGmPercent: Ratio;
  readonly actions: readonly RecoveryActionInput[];
  /**
   * The records behind the supplied base economics. Required: `explain()` refuses to build an
   * explanation in which a firing rule cites nothing (REQ-DATA-010, AC-3).
   */
  readonly baseEvidence: readonly RecordRef[];
  /** Applied to an incomplete action already past its due date. Calibration, in RECOVERY-v1. */
  readonly overdueDiscount: Quantity;
  /** Confidence below this is treated as zero rather than a small positive. */
  readonly confidenceFloor: Quantity;
  readonly today: CalendarDate;
  readonly credibilityWeights: {
    readonly ownership: Quantity;
    readonly timeliness: Quantity;
    readonly completion: Quantity;
  };
}

export interface CountedAction {
  readonly id: string;
  readonly counted: boolean;
  readonly reason: string;
  readonly appliedRevenueBenefit: Money;
  readonly appliedCostBenefit: Money;
  readonly appliedConfidence: Quantity;
}

export interface RecoveryEconomics {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  /** MET-FIN-014, echoed so the four figures are always read together. */
  readonly currentForecastGmPercent: Ratio;
  /** MET-FIN-033 */ readonly riskAdjustedGmPercent: Ratio;
  /** MET-REC-001 */ readonly recoveryCaseGmPercent: Ratio;
  /** MET-REC-002 */ readonly probabilityAdjustedGmPercent: Ratio;
  /** MET-REC-003 — 0–100. Owned, dated, delivered; separate from whether it is optimistic. */
  readonly planCredibility: Quantity | null;
  /** Recovery-case margin points above the current forecast. */
  readonly recoveryUpliftPp: Quantity | null;
  /** Weeks of schedule the counted actions recover. */
  readonly scheduleBenefitWeeks: number;
  readonly actions: readonly CountedAction[];
  readonly explanation: Explanation;
}

const ACTIVE: readonly RecoveryActionStatus[] = ['PROPOSED', 'COMMITTED', 'IN_PROGRESS', 'COMPLETE'];

/** GM% = (revenue − cost) / revenue, NOT_COMPUTABLE at zero revenue. */
function gm(revenue: Money, cost: Money): Ratio {
  return revenue.minus(cost).dividedBy(revenue);
}

export function computeRecoveryEconomics(input: RecoveryEconomicsInput): RecoveryEconomics {
  const zero = input.forecastRevenue.minus(input.forecastRevenue);

  // --- 1. drop abandoned actions, then resolve incompatibility groups ---------
  const live = input.actions.filter((a) => ACTIVE.includes(a.status));
  const bestInGroup = new Map<string, string>();
  for (const a of live) {
    if (a.incompatibilityGroup === null) continue;
    const incumbentId = bestInGroup.get(a.incompatibilityGroup);
    const incumbent = live.find((x) => x.id === incumbentId);
    const total = (x: RecoveryActionInput) => x.revenueBenefit.plus(x.costBenefit);
    if (incumbent === undefined || total(a).compare(total(incumbent)) > 0) {
      bestInGroup.set(a.incompatibilityGroup, a.id);
    }
  }

  const counted: CountedAction[] = input.actions.map((a) => {
    if (!ACTIVE.includes(a.status)) {
      return {
        id: a.id, counted: false, reason: `status ${a.status}`,
        appliedRevenueBenefit: zero, appliedCostBenefit: zero, appliedConfidence: Q_ZERO,
      };
    }
    if (a.incompatibilityGroup !== null && bestInGroup.get(a.incompatibilityGroup) !== a.id) {
      return {
        id: a.id, counted: false,
        reason:
          `superseded within incompatibility group "${a.incompatibilityGroup}" by ` +
          `${bestInGroup.get(a.incompatibilityGroup)} — the same problem is not fixed twice`,
        appliedRevenueBenefit: zero, appliedCostBenefit: zero, appliedConfidence: Q_ZERO,
      };
    }
    const overdue =
      a.status !== 'COMPLETE' && a.dueOn !== null && a.dueOn < input.today;
    const discounted = overdue
      ? qMul(a.confidence, qSub(qty('1'), input.overdueDiscount))
      : a.confidence;
    const applied = qCompare(discounted, input.confidenceFloor) < 0
      ? Q_ZERO
      : qClamp(discounted, Q_ZERO, qty('1'));
    return {
      id: a.id, counted: true,
      reason: overdue
        ? `counted; overdue since ${a.dueOn as string}, confidence discounted ${a.confidence} → ${applied}`
        : 'counted',
      appliedRevenueBenefit: a.revenueBenefit,
      appliedCostBenefit: a.costBenefit,
      appliedConfidence: applied,
    };
  });

  const countedIds = new Set(counted.filter((c) => c.counted).map((c) => c.id));
  const countedActions = live.filter((a) => countedIds.has(a.id));

  // --- 2. the recovery case: every counted action lands in full ---------------
  const caseRevenue = countedActions.reduce((m, a) => m.plus(a.revenueBenefit), input.forecastRevenue);
  const caseCost = countedActions.reduce((m, a) => m.minus(a.costBenefit), input.forecastCost);
  const recoveryCaseGmPercent = gm(caseRevenue, caseCost);

  // --- 3. probability-adjusted: each benefit scaled by its applied confidence --
  const padRevenue = countedActions.reduce((m, a) => {
    const c = counted.find((x) => x.id === a.id)?.appliedConfidence ?? Q_ZERO;
    return m.plus(a.revenueBenefit.times(c));
  }, input.forecastRevenue);
  const padCost = countedActions.reduce((m, a) => {
    const c = counted.find((x) => x.id === a.id)?.appliedConfidence ?? Q_ZERO;
    return m.minus(a.costBenefit.times(c));
  }, input.forecastCost);
  const probabilityAdjustedGmPercent = gm(padRevenue, padCost);

  // --- 4. credibility: owned, on time, delivered ------------------------------
  const n = live.length;
  const w = input.credibilityWeights;
  const planCredibility = n === 0 ? null : (() => {
    const shareOf = (pred: (a: RecoveryActionInput) => boolean): Quantity =>
      qDiv(qty(String(live.filter(pred).length)), qty(String(n))) ?? Q_ZERO;
    const owned = shareOf((a) => a.ownerActorId !== null && a.dueOn !== null);
    const onTime = shareOf((a) => a.status === 'COMPLETE' || a.dueOn === null || a.dueOn >= input.today);
    const complete = shareOf((a) => a.status === 'COMPLETE');
    const weightSum = qAdd(qAdd(w.ownership, w.timeliness), w.completion);
    const s = qDiv(
      qAdd(qAdd(qMul(owned, w.ownership), qMul(onTime, w.timeliness)), qMul(complete, w.completion)),
      weightSum,
    );
    return s === null ? null : qty(qFixed(qMul(s, qty('100')), 2));
  })();

  const forecastQ = ratioToQuantity(input.forecastGmPercent);
  const caseQ = ratioToQuantity(recoveryCaseGmPercent);
  const recoveryUpliftPp = forecastQ !== null && caseQ !== null
    ? qty(qFixed(qSub(caseQ, forecastQ), 6))
    : null;

  const scheduleBenefitWeeks = countedActions.reduce((a, x) => a + x.scheduleBenefitWeeks, 0);

  const evaluations: RuleEvaluation[] = [
    {
      ruleId: 'REC-BASE', ruleName: 'Current forecast margin', ruleSetId: 'RECOVERY-v1',
      ruleVersion: input.ruleVersion, signalId: 'FORECAST_GM', signalMetricId: 'MET-FIN-014',
      observedValue: forecastQ, comparison: 'PRESENT',
      status: forecastQ === null ? 'NOT_COMPUTABLE' : 'FIRED',
      ...(forecastQ === null
        ? {
          notEvaluatedReason: 'forecast revenue is zero',
          notEvaluatedReasonCode: 'REQUIRED_METRIC_NOT_COMPUTABLE' as const,
        }
        : {}),
      fired: forecastQ !== null, contribution: 'the base the recovery case is measured from',
      narrative: forecastQ === null
        ? 'Forecast GM is NOT_COMPUTABLE, so no recovery uplift can be stated.'
        : `Current forecast GM is ${forecastQ}, supplied by financial — not recomputed here.`,
      evidence: input.baseEvidence,
    },
    {
      ruleId: 'REC-RISK', ruleName: 'Risk-adjusted margin', ruleSetId: 'RECOVERY-v1',
      ruleVersion: input.ruleVersion, signalId: 'RISK_ADJUSTED_GM', signalMetricId: 'MET-FIN-033',
      observedValue: ratioToQuantity(input.riskAdjustedGmPercent), comparison: 'PRESENT',
      status: isComputable(input.riskAdjustedGmPercent) ? 'FIRED' : 'NOT_COMPUTABLE',
      fired: isComputable(input.riskAdjustedGmPercent),
      contribution: 'reported beside the recovery case, never merged into it',
      narrative:
        'Risk-adjusted margin answers "what if the open risks land"; the recovery case answers ' +
        '"what if our fixes land". They are different questions and are never averaged.',
      evidence: input.baseEvidence,
    },
    ...counted.map((c): RuleEvaluation => {
      const a = input.actions.find((x) => x.id === c.id) as RecoveryActionInput;
      return {
        ruleId: `REC-ACTION-${c.id}`, ruleName: a.description, ruleSetId: 'RECOVERY-v1',
        ruleVersion: input.ruleVersion, signalId: 'RECOVERY_ACTION',
        signalMetricId: 'MET-REC-001',
        observedValue: a.revenueBenefit.plus(a.costBenefit).toQuantity(),
        comparison: 'PRESENT',
        status: c.counted ? 'FIRED' : 'NOT_APPLICABLE',
        ...(c.counted
          ? {}
          : { notEvaluatedReason: c.reason, notEvaluatedReasonCode: 'REQUIRED_EVIDENCE_MISSING' as const }),
        fired: c.counted,
        ...(c.counted
          ? { estimatedImpact: a.revenueBenefit.plus(a.costBenefit).toDto() }
          : {}),
        contribution: c.counted
          ? `${c.reason}; +${a.revenueBenefit.toQuantity()} revenue, −${a.costBenefit.toQuantity()} ` +
            `cost, ${a.scheduleBenefitWeeks}w schedule at applied confidence ${c.appliedConfidence}`
          : c.reason,
        narrative:
          `${a.description} — owner ${a.ownerActorId ?? 'UNASSIGNED'}, due ${a.dueOn ?? 'UNDATED'}, ` +
          `status ${a.status}. ${c.reason}.` +
          (a.ownerActorId === null || a.dueOn === null
            ? ' An action without an owner or a date is a wish, and is counted in the economics but ' +
              'held against plan credibility.'
            : ''),
        evidence: a.evidence,
      };
    }),
    {
      ruleId: 'REC-CREDIBILITY', ruleName: 'Plan credibility', ruleSetId: 'RECOVERY-v1',
      ruleVersion: input.ruleVersion, signalId: 'PLAN_CREDIBILITY', signalMetricId: 'MET-REC-003',
      observedValue: planCredibility, comparison: 'PRESENT',
      status: planCredibility === null ? 'NOT_APPLICABLE' : 'FIRED',
      ...(planCredibility === null
        ? {
          notEvaluatedReason: 'the plan contains no live actions',
          notEvaluatedReasonCode: 'REQUIRED_EVIDENCE_MISSING' as const,
        }
        : {}),
      fired: planCredibility !== null,
      contribution: 'reported separately from the economics',
      narrative: planCredibility === null
        ? 'No live recovery actions, so credibility is undefined rather than zero — there is no plan ' +
          'to judge. OVR-NO-CREDIBLE-PLAN reads this state directly.'
        : `Plan credibility ${planCredibility} over ${n} live action${n === 1 ? '' : 's'}. A plan can ` +
          'be arithmetically sound and completely unowned; this number is what says so.',
      evidence: live.flatMap((a) => a.evidence),
    },
  ];

  return {
    projectId: input.projectId, week: input.week, assessedAt: input.assessedAt,
    currentForecastGmPercent: input.forecastGmPercent,
    riskAdjustedGmPercent: input.riskAdjustedGmPercent,
    recoveryCaseGmPercent,
    probabilityAdjustedGmPercent,
    planCredibility,
    recoveryUpliftPp,
    scheduleBenefitWeeks,
    actions: counted,
    explanation: explain({
      outcome: caseQ === null
        ? 'Recovery case NOT_COMPUTABLE'
        : `Recovery case GM ${caseQ}, probability-adjusted ${ratioToQuantity(probabilityAdjustedGmPercent) ?? 'NOT_COMPUTABLE'}`,
      ...(recoveryUpliftPp !== null
        ? { outcomeDetail: `${recoveryUpliftPp} margin points above the current forecast if the plan lands in full` }
        : {}),
      evaluatedAt: input.assessedAt,
      ruleSetVersion: input.ruleVersion,
      metricCatalogVersion: input.metricCatalogVersion,
      evaluations,
    }),
  };
}

/** Re-exported so callers can build a NOT_COMPUTABLE ratio without importing platform directly. */
export { notComputable };
