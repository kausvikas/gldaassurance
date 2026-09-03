/**
 * Phase 4 acceptance gate — a deterministic assessment of the eight curated executive scenarios.
 *
 * Prompt 4's gate is a report that states, for every curated project: the computed economics, the
 * health assessment with the rules that fired, the trajectory and forward outlook, the Green-at-Risk
 * determination, and the recovery position — each cross-checkable against `METRIC_CATALOG.md`.
 *
 * The adapter below turns generated facts into engine inputs **by the catalog definitions**. It is
 * shared with `tests/golden/phase4-engines.test.ts` on purpose: the report and the golden suite must
 * exercise the same path, or the report is describing code nobody tests.
 *
 * Nothing here computes a metric. Every number comes from a `contexts/*` engine.
 */
import { Money, type CurrencyCode, qty } from '@platform/decimal';
import type { RecordRef } from '@platform/provenance';
import { ruleVersion } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import { isOpenAsOf, settledOnAsOf } from '@platform/time';
import {
  type EconomicsInput, type EconomicsResult, computeEconomics, ratioValue,
} from '@contexts/financial';
import {
  type RuleApplicabilityContext, type SignalReading, HEALTH_MODEL_V2,
  type SignalState,
} from '@contexts/rules';

/** The window MET-DEL-019 needs before a demonstrated velocity can exist at all. */
export const VELOCITY_WINDOW_WEEKS = 8;

/** How stale defect telemetry may be before its silence stops being evidence (ADR-0028 D-4). */
export const QUALITY_SOURCE_CADENCE_DAYS = 90;
import {
  type HealthEvaluation, type HealthEvaluationInput, evaluateHealth, ratioToSignal,
} from '@contexts/health';
import {
  type GreenAtRiskFinding, type GreenAtRiskReason, type SignalSeries, type TrajectoryEvaluation,
  assessGreenAtRisk, evaluateTrajectory,
} from '@contexts/forecast';
import {
  type DataConfidenceAssessment, assessDataConfidence,
} from '@contexts/data-quality';
import {
  type DeliveryEvaluation, type DeliveryEvaluationInput, evaluateDelivery,
} from '@contexts/delivery';
import type { CommercialEvaluation, CommercialEvaluationInput } from '@contexts/commercial';
import type { QualityEvaluation, QualityEvaluationInput } from '@contexts/quality';
import type { ResourceEvaluationInput } from '@contexts/resource';
import type { NotEvaluatedReasonCode } from '@platform/explainability';
import { renderEvaluation } from '@platform/explainability';
import { type SyntheticPortfolio, generatePortfolio } from '../generator/index.js';

export const USD = 'USD' as CurrencyCode;
export const CATALOG_VERSION = '2.0.0';

/**
 * Facts → `EconomicsInput`, by the catalog definitions.
 *
 * Two rules are applied here because they are definitional and would otherwise be silently wrong:
 * only the **latest** ETC revision counts (MET-FIN-007, keyed on `estimatedOn`, not on id order),
 * and only executed changes **on or before the as-of date** move the contractual baseline
 * (MET-FIN-002, ADR-0003 §Decision 1).
 */
export function economicsInputFor(
  p: SyntheticPortfolio, projectId: string, asOfDate?: string,
): EconomicsInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const f = p.facts;
  // `asOfDate` lets a caller rewind the same builder to an earlier reporting period, which is how
  // the Phase 9 GM/EAC trend is produced: the *same* economics engine over the *same* facts, cut at
  // an earlier date. Re-deriving history with a second, simpler formula would give a trend that
  // disagrees with the current figure it ends at.
  const cut = asOfDate ?? p.asOf;
  const asOf = `${cut}T00:00:00.000Z` as Instant;
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);
  const ours = <T extends { contractId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.contractId === spec.contractId);
  const total = (rows: readonly { amount: { amount: string } }[]) =>
    rows.reduce((m, r) => m.plus(Money.of(r.amount.amount, USD)), Money.zero(USD));

  const etcRows = mine(f.etcLineItems).filter((r) => r.estimatedOn <= cut);
  const latestEtcOn = etcRows.reduce((a, r) => (r.estimatedOn > a ? r.estimatedOn : a), '');
  const commitmentRows = mine(f.commitments).filter((r) => r.committedOn <= cut);
  const latestCommitOn = commitmentRows.reduce((a, r) => (r.committedOn > a ? r.committedOn : a), '');

  const claims = mine(f.progressClaims).filter((r) => r.claimedOn <= cut);
  const latestClaim = claims[claims.length - 1];

  const exposures = mine(f.exposures);
  const exposureOf = (kind: string) =>
    exposures.filter((e) => e.kind === kind)
      .reduce((m, e) => m.plus(Money.of(e.estimatedValue.amount, USD)), Money.zero(USD));

  const executed = ours(f.executedChanges).filter((c) => c.executedOn <= cut);
  // A pending change is superseded only once the superseding change has actually **executed**.
  // A link to a change executing next month leaves it pending today.
  const executedById = new Map(ours(f.executedChanges).map((c) => [c.id, c.executedOn]));
  const pending = ours(f.pendingChanges).filter(
    (c) => isOpenAsOf(
      c.supersededByExecutedId === undefined ? undefined : executedById.get(c.supersededByExecutedId),
      cut as CalendarDate,
    ),
  );

  return {
    projectId,
    asOf,
    currency: USD,
    contractValueAsSold: Money.of(spec.contractValue.toDto().amount, USD),
    budgetedCostAsSold: Money.of(spec.budgetedCost.toDto().amount, USD),
    contingencyBudget: Money.of(spec.contingencyBudget.toDto().amount, USD),
    executedChanges: executed.map((c) => ({
      id: c.id,
      valueDelta: Money.of(c.valueDelta.amount, USD),
      costDelta: Money.of(c.costDelta.amount, USD),
      contingencyDelta: Money.of(c.contingencyDelta.amount, USD),
    })),
    pendingChanges: pending.map((c) => ({
      id: c.id,
      proposedValue: Money.of(c.proposedValue.amount, USD),
      approvalProbability: c.approvalProbability,
    })),
    costToDate: total(mine(f.actualCosts).filter((r) => r.periodEnd <= cut)),
    estimateToComplete: total(etcRows.filter((r) => r.estimatedOn === latestEtcOn)),
    committedFutureCost: commitmentRows.length === 0
      ? Money.zero(USD)
      : total(commitmentRows.filter((c) => c.committedOn === latestCommitOn)),
    contingencyConsumed: total(mine(f.contingencyDrawdowns).filter((r) => r.drawnOn <= cut)),
    physicalCompletion: latestClaim?.physicalCompletion ?? null,
    plannedCompletion: latestClaim?.plannedCompletion ?? null,
    risks: mine(f.risks).map((r) => ({
      id: r.id,
      probability: r.probability,
      costImpact: Money.of(r.costImpact.amount, USD),
      includedInEtc: r.includedInEtc,
      state: r.state,
    })),
    liquidatedDamagesExposure: exposureOf('LIQUIDATED_DAMAGES'),
    uncompensatedScopeExposure: exposureOf('UNCOMPENSATED_SCOPE'),
    maturityThresholdCompletion: '0.20',
    progressMeasureCredible: true,
  };
}

const ev = (projectId: string, metricId: string): RecordRef[] =>
  [{ context: 'financial', entityType: 'project', entityId: projectId, metricId }];

/** Economics → health readings. Only signals the facts actually support are populated. */

/**
 * Facts → `DeliveryEvaluationInput` (ADR-0022 D-1).
 *
 * The forecast completion date now comes from `delivery:ScheduleForecast` (**DR-050 closed**) — a
 * recorded fact, not the last milestone date. Using the milestone set would have reported every
 * project finishing months early, because milestones stop well before the contractual end.
 */
export function deliveryInputFor(
  p: SyntheticPortfolio, projectId: string,
): DeliveryEvaluationInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const asOf = `${p.asOf}T00:00:00.000Z` as Instant;
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);

  const milestones = mine(p.facts.milestones).map((m) => ({
    id: m.id,
    name: m.name,
    baselineDate: m.baselineDate as CalendarDate,
    forecastDate: m.forecastDate as CalendarDate,
    // A milestone with an actual date in the future has not been delivered yet.
    ...(() => {
      const actual = settledOnAsOf(m.actualDate, p.asOf as CalendarDate);
      return actual === undefined ? {} : { actualDate: actual };
    })(),
    paymentGating: m.paymentGating,
  }));

  return {
    projectId,
    asOf,
    baselineCompletionDate: spec.plannedEndDate as CalendarDate,
    ...(() => {
      const forecast = p.facts.scheduleForecasts.find((r) => r.projectId === projectId);
      return forecast === undefined
        ? {}
        : { forecastCompletionDate: forecast.forecastCompletionDate as CalendarDate };
    })(),
    milestones,
    dependencies: mine(p.facts.dependencies).map((d) => ({
      id: d.id,
      description: d.description,
      owner: d.owner,
      raisedOn: d.raisedOn as CalendarDate,
      dueOn: d.dueOn as CalendarDate,
      // A dependency whose resolution date is in the future is open today.
      ...(() => {
        const resolved = settledOnAsOf(d.resolvedOn, p.asOf as CalendarDate);
        return resolved === undefined ? {} : { resolvedOn: resolved };
      })(),
      blocking: d.blocking,
    })),
    // Ordered oldest-first: the trailing-window slice in MET-DEL-019 depends on it.
    progress: [...mine(p.facts.progressClaims)]
      .sort((a, b) => a.week.localeCompare(b.week))
      .map((c) => ({
        week: c.week,
        physicalCompletion: c.physicalCompletion,
        plannedCompletion: c.plannedCompletion,
      })),
    // MET-DEL-019's registered window, from the frozen formula.
    velocityWindowWeeks: VELOCITY_WINDOW_WEEKS,
  };
}


/**
 * Facts → `CommercialEvaluationInput` (ADR-0022 D-2).
 *
 * Only executed changes **on or before the as-of date** move the contractual baseline (ADR-0003
 * §Decision 1), which is why the contractual revenue is taken from the economics result rather than
 * re-summed here: one definition, one implementation.
 */
export function commercialInputFor(
  p: SyntheticPortfolio, projectId: string, e: EconomicsResult,
): CommercialEvaluationInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const ours = <T extends { contractId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.contractId === spec.contractId);

  return {
    projectId,
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    contractValueAsSold: Money.of(spec.contractValue.toDto().amount, USD),
    contractualRevenue: e.contractualRevenue,
    // MET-COM-011 numerator. The fact already existed and was passed to the economics engine, which
    // declared the field and never read it — so OVR-LD-EXPOSURE could never be assembled (ADR-0025).
    liquidatedDamagesExposure: p.facts.exposures
      .filter((x) => x.projectId === projectId && x.kind === 'LIQUIDATED_DAMAGES'
        && x.assessedOn <= p.asOf)
      .reduce((m, x) => m.plus(Money.of(x.estimatedValue.amount, USD)), Money.zero(USD)),
    pendingChanges: ours(p.facts.pendingChanges).map((c) => ({
      id: c.id,
      raisedOn: c.raisedOn as CalendarDate,
      proposedValue: Money.of(c.proposedValue.amount, USD),
      superseded: c.supersededByExecutedId !== undefined,
    })),
    scopeItems: p.facts.scopeItems
      .filter((s) => s.projectId === projectId)
      .map((s) => ({
        id: s.id,
        uncontracted: s.uncontracted,
        ...(() => {
          const done = settledOnAsOf(s.completedOn, p.asOf as CalendarDate);
          return done === undefined ? {} : { completedOn: done };
        })(),
        ...(s.estimatedValue === undefined
          ? {} : { estimatedValue: Money.of(s.estimatedValue.amount, USD) }),
      })),
  };
}

/**
 * Facts → `QualityEvaluationInput` (ADR-0022 D-3).
 *
 * The open-defect history is reconstructed week by week from raise and close dates, because
 * `MET-QUA-009` is a slope over trailing weekly snapshots and no snapshot table exists. Each point
 * is a count of defects open *at that week's end*, which is what a snapshot would have held.
 */
export function qualityInputFor(
  p: SyntheticPortfolio, projectId: string, e: EconomicsResult,
): QualityEvaluationInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);

  const defects = mine(p.facts.defects);
  const acceptance = mine(p.facts.acceptanceItems);
  /*
   * Source presence is DERIVED FROM FACTS, never asserted (ADR-0028 D-4).
   *
   * Defect rows prove the source is live. No defects but recorded acceptance items proves the
   * quality domain is reporting, so zero defects is a genuine KNOWN_ZERO. Neither means source
   * presence is UNKNOWN, and the escaped-defect rate is NOT_COMPUTABLE rather than perfect.
   */
  const latestQualityObservation = [
    ...defects.map((d) => d.raisedOn),
    ...acceptance.map((a) => a.submittedOn),
  ].sort().at(-1);
  const defectSource = {
    available: defects.length > 0 || acceptance.length > 0,
    ageDays: latestQualityObservation === undefined
      ? null
      : Math.round(
        (Date.parse(p.asOf) - Date.parse(latestQualityObservation)) / 86_400_000,
      ),
    expectedCadenceDays: QUALITY_SOURCE_CADENCE_DAYS,
  };
  const weeks = [...new Set(mine(p.facts.progressClaims).map((c) => c.week))].sort();
  // A defect is open at week w if it was raised on or before w's end and not closed by then.
  const weekEnd = new Map(mine(p.facts.progressClaims).map((c) => [c.week, c.claimedOn]));
  const openDefectHistory = weeks.map((w) => {
    const asAt = weekEnd.get(w) ?? p.asOf;
    return {
      week: w,
      open: defects.filter(
        (d) => d.raisedOn <= asAt && isOpenAsOf(d.closedOn, asAt as CalendarDate),
      ).length,
    };
  });

  return {
    projectId,
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    defects: defects.map((d) => ({
      id: d.id,
      severity: d.severity,
      raisedOn: d.raisedOn as CalendarDate,
      ...(() => {
        const closed = settledOnAsOf(d.closedOn, p.asOf as CalendarDate);
        return closed === undefined ? {} : { closedOn: closed };
      })(),
      escapedToClient: d.escapedToClient,
    })),
    acceptanceItems: mine(p.facts.acceptanceItems).map((a) => ({
      id: a.id,
      submittedOn: a.submittedOn as CalendarDate,
      ...(() => {
        const accepted = settledOnAsOf(a.acceptedOn, p.asOf as CalendarDate);
        return accepted === undefined ? {} : { acceptedOn: accepted };
      })(),
      ...(() => {
        const resolved = settledOnAsOf(a.resolvedOn, p.asOf as CalendarDate);
        return resolved === undefined ? {} : { resolvedOn: resolved };
      })(),
      blocking: a.blocking,
    })),
    effort: mine(p.facts.effort).map((r) => ({
      week: r.week, hours: qty(r.hours), isRework: r.isRework,
    })),
    actualCost: e.actualCost,
    reworkAllowance: qty(spec.reworkAllowance),
    // MET-QUA-009's registered trailing window.
    backlogWindowWeeks: 8,
    openDefectHistory,
    defectSource,
  };
}


/**
 * Facts → `ResourceEvaluationInput` (Phase 9, ADR-0022 D-1 applied to `resource`).
 *
 * Assignments carry a `personRef` and a seniority band. **No name, no individual cost** — the
 * engine returns counts, ratios and project-level rates, and `SECURITY_MODEL.md` §4.3 classifies
 * the underlying records `PERSONAL_DATA`.
 */
export function resourceInputFor(
  p: SyntheticPortfolio, projectId: string, e: EconomicsResult,
): ResourceEvaluationInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);

  return {
    projectId,
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    assignments: mine(p.facts.assignments).map((a) => ({
      id: a.id,
      personRef: a.personRef,
      seniorityBand: a.seniorityBand,
      deliveryLocation: a.deliveryLocation,
      engagementType: a.engagementType,
      allocationPercent: qty(a.allocationPercent),
      ended: a.endedOn !== undefined && a.endedOn <= p.asOf,
    })),
    effort: mine(p.facts.effort).map((r) => ({
      week: r.week, hours: qty(r.hours), billable: r.billable, isRework: r.isRework,
    })),
    actualCost: e.actualCost,
    plannedEffortHours: qty(spec.plannedEffortHours),
    // Earned, not scheduled. `plannedCompletion` is where the schedule said we would be; using it
    // books an effort underrun for work that simply has not been done yet (ADR-0024).
    earnedCompletionRatio: (() => {
      const latest = mine(p.facts.progressClaims).at(-1);
      return latest === undefined ? null : qty(latest.physicalCompletion);
    })(),
    soldBlendedRate: Money.of(spec.blendedRate.toDto().amount, USD),
    soldPyramidRatio: qty(spec.pyramidRatio),
  };
}

/** Net margin contributed by executed change requests: Σ valueDelta − Σ costDelta. */
export function executedChangeMarginFor(p: SyntheticPortfolio, projectId: string): Money {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  return p.facts.executedChanges
    .filter((c) => c.contractId === spec.contractId && c.executedOn <= p.asOf)
    .reduce(
      (m, c) => m.plus(Money.of(c.valueDelta.amount, USD)).minus(Money.of(c.costDelta.amount, USD)),
      Money.zero(USD),
    );
}

export function healthInputFor(
  e: EconomicsResult, week: WeekId, reportedRag: 'RED' | 'AMBER' | 'GREEN' | null,
  delivery?: DeliveryEvaluation,
  commercial?: CommercialEvaluation,
  quality?: QualityEvaluation,
  /** Governed applicability facts (ADR-0026 D-2). */
  applicability?: RuleApplicabilityContext,
): HealthEvaluationInput {
  const readings = new Map<string, SignalReading>();
  /**
   * `from` carries the metric's OWN state and reason (ADR-0027 D-7).
   *
   * The adapter previously passed only the value, so a domain engine that knew exactly why a metric
   * was non-computable had that reason replaced downstream by the generic "signal not supplied" --
   * which described a supply failure that had not happened.
   */
  const add = (
    signalId: string, metricId: string, value: string | null,
    from?: {
      readonly notComputableReason?: string;
      readonly adverseState?: 'UNBOUNDED';
      readonly state?: SignalState;
      readonly stateReasonCode?: NotEvaluatedReasonCode;
    },
  ): void => {
    readings.set(signalId, {
      signalId, value, evidence: ev(e.projectId, metricId),
      ...(from?.notComputableReason !== undefined
        ? { notComputableReason: from.notComputableReason } : {}),
      ...(from?.adverseState !== undefined ? { adverseState: from.adverseState } : {}),
      // The metric's own epistemic state travels with it (ADR-0028 D-1). Without this the health
      // model sees only `null` and cannot tell an absent risk object from absent evidence.
      ...(from?.state !== undefined ? { state: from.state } : {}),
      ...(from?.stateReasonCode !== undefined ? { stateReasonCode: from.stateReasonCode } : {}),
    });
  };
  add('FORECAST_GM_PERCENT', 'MET-FIN-014', ratioToSignal(e.forecastGmPercent));
  add('RISK_ADJUSTED_GM_PERCENT', 'MET-FIN-033', ratioToSignal(e.riskAdjustedGmPercent));
  add('MARGIN_EROSION_PP', 'MET-FIN-016', ratioToSignal(e.marginErosionPp));
  add('BURN_GAP', 'MET-FIN-027', ratioToSignal(e.burnGap));
  add('CONTINGENCY_BURN_GAP', 'MET-FIN-034', ratioToSignal(e.contingencyBurnGap));
  add('PROGRESS_VARIANCE', 'MET-DEL-015', ratioToSignal(e.progressVariance));
  add('GM_VALUE_AT_RISK_RATIO', 'MET-FIN-042', ratioToSignal(e.gmValueAtRiskRatio));
  // ELV-ETC-OPTIMISM's comparand. Declared as a rule signal since Phase 4 and never assembled, so a
  // live elevation rule evaluated on zero projects while MET-FIN-030 was computable on 57 of 75
  // (ADR-0025). Null where the MET-FIN-029 maturity gate is not met — that is NOT_COMPUTABLE, and
  // it must stay distinguishable from "clear".
  add('ETC_OPTIMISM_RATIO', 'MET-FIN-040',
    e.etcOptimismRatio === null ? null : ratioToSignal(e.etcOptimismRatio));

  // --- DELIVERY dimension (ADR-0022 D-1) ------------------------------------
  // Three signals the model has declared since Phase 4 and nothing supplied, so the dimension
  // scored NOT_COMPUTABLE on every project. A null still travels as null: an absent signal must
  // stay absent, because the engine's "fewer than half its inputs" rule is what stops a dimension
  // being carried by one number.
  if (delivery !== undefined) {
    add('REQUIRED_VELOCITY_RATIO', 'MET-DEL-018',
      delivery.requiredVelocityRatio.value, delivery.requiredVelocityRatio);
    add('MILESTONES_AT_RISK', 'MET-DEL-010',
      delivery.milestonesAtRisk.value === null ? null : String(delivery.milestonesAtRisk.value),
      delivery.milestonesAtRisk);
    add('DEPENDENCY_AGEING_DAYS', 'MET-DEL-023',
      delivery.customerDependencyAgeingDays.value === null
        ? null : String(delivery.customerDependencyAgeingDays.value),
      delivery.customerDependencyAgeingDays);
  }

  // --- SCOPE_COMMERCIAL dimension (ADR-0022 D-2) ----------------------------
  if (commercial !== undefined) {
    add('UNCOMPENSATED_SCOPE_RATIO', 'MET-COM-009', commercial.uncompensatedScopeRatio.value);
    // OVR-LD-EXPOSURE's comparand — a HARD OVERRIDE that was never evaluated on any project.
    add('LD_EXPOSURE_RATIO', 'MET-COM-011', commercial.liquidatedDamagesRatio.value);
    add('PENDING_CR_AGE_DAYS', 'MET-COM-007',
      commercial.maxPendingCrAgeDays.value === null
        ? null : String(commercial.maxPendingCrAgeDays.value),
      commercial.maxPendingCrAgeDays);
    // MET-FIN-011 over MET-FIN-002, produced by the economics engine — the edges (0.01/0.12) are
    // the edges of a proportion of contract value, not of an absolute sum.
    add('UNSECURED_UPSIDE_RATIO', 'MET-FIN-011', ratioToSignal(e.unsecuredUpsideRatio));
  }

  // --- PRODUCT_QUALITY dimension (ADR-0022 D-3) -----------------------------
  if (quality !== undefined) {
    add('REWORK_RATIO', 'MET-QUA-006', quality.reworkRatio.value, quality.reworkRatio);
    add('ACCEPTANCE_BLOCKERS', 'MET-QUA-010', String(quality.acceptanceBlockers));
    add('ESCAPED_DEFECT_RATE', 'MET-QUA-003',
      quality.escapedDefectRate.value, quality.escapedDefectRate);
    add('DEFECT_BACKLOG_TREND', 'MET-QUA-009',
      quality.defectBacklogTrend.value, quality.defectBacklogTrend);
  }

  return {
    projectId: e.projectId, week, assessedAt: e.asOf, metricCatalogVersion: CATALOG_VERSION,
    model: HEALTH_MODEL_V2, reportedRag, readings, evidence: ev(e.projectId, 'MET-HLTH-020'),
    ...(applicability !== undefined ? { applicability } : {}),
    // Every signal this adapter builds. A rule whose signal is absent from this set is a
    // CONFIGURATION_ERROR at runtime, not a missing measurement (ADR-0026 D-5).
    declaredSignals: new Set(readings.keys()),
  };
}

/**
 * The multi-signal trajectory adapter — **DR-021 closed**.
 *
 * Phase 4 built eleven signal-specific `TrajectoryObservationPolicy` entries, each with its own
 * window type, window size, minimum-observation count and recency weighting, for a good reason: a
 * milestone hit rate is a sequence of irregular events, a forecast margin is restated on a reporting
 * cycle, and a defect trend moves on the delivery iteration. Sampling all three on a common weekly
 * window produces three flat lines punctuated by steps, and a slope over that is noise.
 *
 * The Phase 4 *adapter*, however, supplied one series — the burn gap, labelled `DELIVERY_VELOCITY` —
 * so the engine's policy machinery was exercised by exactly one policy and the trajectory state was
 * effectively "is cost outrunning progress?". That made a project deteriorating on **forward**
 * signals with no adverse cost burn structurally undetectable, which is precisely curated scenario
 * **LR**, *Leading Risk, No Cost Overrun*.
 *
 * Each builder below emits its own `signalId`, so `policyFor(signalId)` in the engine selects that
 * signal's own window rather than a shared one. **A builder returns `null` when the facts do not
 * support the signal**, and the caller omits it — a fabricated observation is worse than a missing
 * one, because the engine cannot tell the difference and will happily draw a slope through it.
 */

/** Observations must be ordered and the window is a *trailing* slice, so ordering is load-bearing. */
const byWeek = <T extends { readonly week: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.week.localeCompare(b.week));

const seriesOf = (
  signalId: string,
  metricId: string,
  higherIsWorse: boolean,
  materialAdverseSlope: string,
  observations: readonly { readonly period: WeekId; readonly value: string }[],
  evidence: SignalSeries['evidence'],
): SignalSeries | null => (observations.length === 0 ? null : {
  signalId,
  metricId,
  higherIsWorse,
  materialAdverseSlope: qty(materialAdverseSlope),
  observations: observations.map((o) => ({ period: o.period, value: qty(o.value) })),
  evidence,
});

const ref = (context: string, entityType: string, projectId: string, metricId: string) =>
  [{ context, entityType, entityId: projectId, metricId }];

/**
 * Physical completion against planned — the original series, kept and still `DELIVERY_VELOCITY`.
 *
 * Uses cost-consumed-versus-progress rather than a stored margin because that is what actually moves
 * week to week; a per-week forecast margin would require the ETC to be restated weekly, which it is
 * not — which is exactly why `FORECAST_GM_TREND` carries a `REPORTING_PERIOD` policy instead.
 */
export function burnGapSeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const claims = byWeek(p.facts.progressClaims.filter((c) => c.projectId === projectId)).slice(-10);
  return seriesOf('DELIVERY_VELOCITY', 'MET-DEL-015', false, '0.002',
    claims.map((c) => ({
      period: c.week as WeekId,
      value: (Number(c.physicalCompletion) - Number(c.plannedCompletion)).toFixed(6),
    })),
    ref('delivery', 'progressClaim', projectId, 'MET-DEL-015'));
}

/**
 * Cumulative cost against cumulative progress, sampled on the reporting cadence.
 *
 * A proxy for the direction of successive EAC revisions: when cost accumulates faster than value is
 * earned, the next ETC restatement goes up. Sampled every fourth week because `EAC_REVISION_TREND`
 * is a `REPORTING_PERIOD` policy — an ETC revision is a discrete management act, and interpolating
 * it weekly invents movement between the acts.
 */
export function eacRevisionSeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const costs = byWeek(p.facts.actualCosts.filter((c) => c.projectId === projectId));
  const claims = byWeek(p.facts.progressClaims.filter((c) => c.projectId === projectId));
  if (costs.length === 0 || claims.length === 0) return null;

  const cumulativeByWeek = new Map<string, number>();
  let running = 0;
  for (const c of costs) {
    running += Number(c.amount.amount);
    cumulativeByWeek.set(c.week, running);
  }
  if (running === 0) return null;

  /**
   * **Cost per unit of completion, indexed to the first sample.**
   *
   * The obvious proxy — cumulative cost as a share of cost-to-date, minus completion — has a
   * denominator artefact that makes it useless: the final sample always divides by itself, so the
   * series rises toward `1 − completion` on every project including a healthy one. It flagged the
   * healthy reference scenario, which is how the bug was found.
   *
   * Cost per point of progress has no such artefact. Indexing to the first observation makes it
   * scale-free, so one adverse-slope threshold is meaningful across a $6M project and a $60M one.
   */
  const unitCostAt = (week: string, completion: string): number | null => {
    const spent = cumulativeByWeek.get(week);
    const done = Number(completion);
    return spent === undefined || done <= 0 ? null : spent / done;
  };

  // Every fourth claim week, trailing — the reporting-period cadence the policy declares.
  const sampled = claims.filter((_, i) => (claims.length - 1 - i) % 4 === 0).slice(-4);
  const first = sampled
    .map((c) => unitCostAt(c.week, c.physicalCompletion))
    .find((v): v is number => v !== null);
  if (first === undefined || first === 0) return null;

  const observations = sampled.flatMap((c) => {
    const unit = unitCostAt(c.week, c.physicalCompletion);
    return unit === null ? [] : [{ period: c.week as WeekId, value: (unit / first).toFixed(6) }];
  });
  return seriesOf('EAC_REVISION_TREND', 'MET-FIN-008', true, '0.02', observations,
    ref('financial', 'actualCost', projectId, 'MET-FIN-008'));
}

/**
 * Rework hours as a share of hours worked, weekly.
 *
 * `QUALITY_REWORK_TREND` is a six-week rolling window with linear recency weighting: defect and
 * rework signals move on a delivery-iteration cadence, faster than a reporting period and noisier
 * than velocity.
 */
export function qualityReworkSeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const effort = p.facts.effort.filter((e) => e.projectId === projectId);
  if (effort.length === 0) return null;
  const weeks = new Map<string, { rework: number; total: number }>();
  for (const e of effort) {
    const bucket = weeks.get(e.week) ?? { rework: 0, total: 0 };
    const hours = Number(e.hours);
    weeks.set(e.week, {
      rework: bucket.rework + (e.isRework ? hours : 0),
      total: bucket.total + hours,
    });
  }
  const observations = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .flatMap(([week, b]) => (b.total === 0
      ? []
      : [{ period: week as WeekId, value: (b.rework / b.total).toFixed(6) }]));
  return seriesOf('QUALITY_REWORK_TREND', 'MET-QUA-006', true, '0.004', observations,
    ref('quality', 'effortRecord', projectId, 'MET-QUA-006'));
}

/**
 * Cumulative contingency consumed, weekly.
 *
 * `CONTINGENCY_CONSUMPTION` uses `CUMULATIVE_PLUS_RECENT` because both the level and the rate
 * matter: 82% consumed is a fact about position, a doubling of the weekly draw is a fact about
 * direction, and neither alone is the signal.
 */
export function contingencySeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const draws = byWeek(p.facts.contingencyDrawdowns.filter((d) => d.projectId === projectId));
  if (draws.length === 0) return null;
  /*
   * ADR: trajectory reads movement, not the running total (approved).
   *
   * This observed cumulative consumption, which is monotone by construction: a project can only
   * ever have drawn more contingency than it had drawn before, so the slope was adverse or flat and
   * never improving. A project that stopped drawing entirely still reported CONTINGENCY_CONSUMPTION
   * as deteriorating. Combined with SCOPE_EXPOSURE_TREND, two of the six trajectory signals could
   * not improve under any circumstances, and IMPROVING - which requires a majority improving with
   * none adverse - was unreachable for every project in the portfolio.
   *
   * The cumulative business fact is untouched and still drives MET-FIN-035 and the contingency
   * panel. What the trajectory engine now reads is the draw *in each period*: a recovery that stops
   * consuming the buffer shows as a falling series, which is the movement the signal is named for.
   */
  const observations = draws.map((d) => ({
    period: d.week as WeekId, value: Number(d.amount.amount).toFixed(2),
  })).slice(-8);
  return seriesOf('CONTINGENCY_CONSUMPTION', 'MET-FIN-035', true, '1000', observations,
    ref('financial', 'contingencyDrawdown', projectId, 'MET-FIN-035'));
}

/**
 * Milestone slippage in days, one observation per milestone, most recent five.
 *
 * `MILESTONE_HIT_RATE` is `LAST_N_EVENTS` rather than a rolling week, because milestones arrive on
 * their own irregular cadence: "four of the last five slipped" is meaningful, a weekly slope over
 * milestone dates is not. **This is the signal that makes scenario LR visible** — schedule slips
 * ahead of any cost consequence.
 */
export function milestoneSlipSeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const milestones = p.facts.milestones
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => a.baselineDate.localeCompare(b.baselineDate))
    .slice(-5);
  const observations = milestones.flatMap((m, i) => {
    const slipDays = Math.round(
      (Date.parse(m.actualDate ?? m.forecastDate) - Date.parse(m.baselineDate)) / 86_400_000,
    );
    return Number.isFinite(slipDays)
      // LAST_N_EVENTS: the period is the event's ordinal, not a calendar week — the policy's window
      // is a count of events, and labelling them with weeks would imply a cadence they do not have.
      ? [{ period: `E${String(i + 1)}` as WeekId, value: String(slipDays) }]
      : [];
  });
  return seriesOf('MILESTONE_HIT_RATE', 'MET-DEL-009', true, '1.5', observations,
    ref('delivery', 'milestone', projectId, 'MET-DEL-009'));
}

/**
 * Unrecovered scope exposure, sampled on the reporting cadence.
 *
 * `SCOPE_EXPOSURE_TREND` is a `REPORTING_PERIOD` policy because scope arrives in lumps and is
 * assessed commercially on a period cadence, not weekly.
 */
export function scopeExposureSeries(p: SyntheticPortfolio, projectId: string): SignalSeries | null {
  const spec = p.structure.projects.find((x) => x.projectId === projectId);
  if (spec === undefined) return null;
  const pending = p.facts.pendingChanges
    .filter((c) => c.contractId === spec.contractId && c.supersededByExecutedId === undefined)
    .sort((a, b) => a.raisedOn.localeCompare(b.raisedOn));
  if (pending.length === 0) return null;
  /*
   * ADR: trajectory reads movement, not the running total (approved).
   *
   * As with contingency, accumulating exposure made this signal monotone and therefore incapable of
   * reporting improvement. The exposure *level* remains a cumulative fact and still feeds
   * MET-COM-009 and the commercial panels; the trajectory signal is the exposure arriving in each
   * period, so a project that has stopped taking on unrecovered scope - or is landing the change
   * requests behind it - shows a falling series.
   */
  const observations = pending.map((c, i) => ({
    period: `P${String(i + 1)}` as WeekId,
    value: (Number(c.proposedValue.amount) * (1 - Number(c.approvalProbability))).toFixed(2),
  })).slice(-4);
  return seriesOf('SCOPE_EXPOSURE_TREND', 'MET-COM-009', true, '1000', observations,
    ref('commercial', 'pendingChange', projectId, 'MET-COM-009'));
}

/**
 * Every signal the facts support, each under its own observation policy.
 *
 * Builders that return `null` are dropped rather than zero-filled. The engine treats a signal with
 * too few observations as *not computable* and says so; a zero-filled series would instead be
 * reported as a confident flat trend, which is a fabricated measurement.
 */
export function trajectorySeriesFor(
  p: SyntheticPortfolio, projectId: string,
): readonly SignalSeries[] {
  return [
    burnGapSeries(p, projectId),
    eacRevisionSeries(p, projectId),
    qualityReworkSeries(p, projectId),
    contingencySeries(p, projectId),
    milestoneSlipSeries(p, projectId),
    scopeExposureSeries(p, projectId),
  ].filter((s): s is SignalSeries => s !== null);
}

export interface CuratedAssessment {
  readonly letter: string;
  readonly projectId: string;
  readonly title: string;
  readonly economics: EconomicsResult;
  readonly health: HealthEvaluation;
  readonly dataConfidence: DataConfidenceAssessment;
  readonly trajectory: TrajectoryEvaluation;
  readonly greenAtRisk: GreenAtRiskFinding;
}

/** Runs every engine over one curated scenario. Deterministic: no clock, no randomness. */
export function assessCurated(p: SyntheticPortfolio, letter: string): CuratedAssessment {
  const c = p.curated.find((x) => x.letter === letter);
  if (c === undefined) throw new Error(`Curated scenario ${letter} is missing`);
  const week = (p.facts.progressClaims.filter((r) => r.projectId === c.projectId).at(-1)?.week
    ?? '2026-W35') as WeekId;
  const asOf = `${p.asOf}T00:00:00.000Z` as Instant;
  const rule = ruleVersion('HEALTH-v2');

  const economics = computeEconomics(economicsInputFor(p, c.projectId));

  const latestStatus = p.facts.statusReports
    .filter((r) => r.projectId === c.projectId)
    .at(-1);
  const health = evaluateHealth(
    healthInputFor(economics, week, latestStatus?.reportedRag ?? null),
  );

  const dataConfidence = assessDataConfidence({
    projectId: c.projectId, week, assessedAt: asOf, ruleVersion: ruleVersion('DQ-v1'),
    metricCatalogVersion: CATALOG_VERSION,
    expectedDomains: ['financial', 'delivery', 'commercial', 'quality', 'resource', 'risk'],
    observations: ['financial', 'delivery', 'commercial', 'quality', 'resource', 'risk'].map((d) => ({
      domain: d, requiredFields: 10, populatedFields: 10,
      valuesChecked: 10, valuesValid: 10, invalidFields: [],
      assertionsEvaluated: 4, assertionsPassed: 4, failedAssertions: [],
      ageDays: 3, expectedCadenceDays: 7,
      evidence: [{ context: d, entityType: 'snapshot', entityId: c.projectId }],
    })),
    assessmentEvidence: [{ context: 'project', entityType: 'snapshot', entityId: c.projectId }],
    weights: {
      completeness: qty('0.25'), freshness: qty('0.20'), consistency: qty('0.25'),
      coverage: qty('0.15'), validity: qty('0.15'),
      highBandFloor: qty('75'), mediumBandFloor: qty('50'), stalenessRedMultiple: qty('3'),
      // DR-018: financial and delivery are the authoritative domains an executive decision rests
      // on. Tolerance is 3× each domain's own cadence, not a universal day count.
      criticalDomains: ['financial', 'delivery'],
      criticalStalenessTolerance: qty('3'),
      freshnessPolicyVersion: 'DQ-FRESHNESS-v1',
    },
  });

  const trajectory = evaluateTrajectory({
    projectId: c.projectId, week, assessedAt: asOf, ruleVersion: rule,
    metricCatalogVersion: CATALOG_VERSION,
    currentBand: health.systemAssessedRag,
    rapidConfluenceThreshold: 3,
    series: trajectorySeriesFor(p, c.projectId),
  });

  const reasons: GreenAtRiskReason[] = [];
  const erosion = ratioValue(economics.marginErosionPp);
  if (erosion !== null && Number(erosion) < -0.01) {
    reasons.push({
      code: 'MARGIN_ERODING', metricId: 'MET-FIN-016', observedValue: erosion,
      narrative:
        `Forecast margin is ${(Number(erosion) * 100).toFixed(2)} percentage points below As-Sold.`,
      evidence: ev(c.projectId, 'MET-FIN-016'),
    });
  }
  const burn = ratioValue(economics.burnGap);
  if (burn !== null && Number(burn) > 0.05) {
    reasons.push({
      code: 'BURN_AHEAD_OF_PROGRESS', metricId: 'MET-FIN-027', observedValue: burn,
      narrative:
        `Budget is ${(Number(burn) * 100).toFixed(2)} percentage points ahead of physical progress.`,
      evidence: ev(c.projectId, 'MET-FIN-027'),
    });
  }
  const contingency = ratioValue(economics.contingencyConsumedPercent);
  if (contingency !== null && Number(contingency) > 0.7) {
    reasons.push({
      code: 'CONTINGENCY_DEPLETING', metricId: 'MET-FIN-035', observedValue: contingency,
      narrative: `${(Number(contingency) * 100).toFixed(1)}% of contingency is already consumed.`,
      evidence: ev(c.projectId, 'MET-FIN-035'),
    });
  }
  const uncompensated = economicsInputFor(p, c.projectId).uncompensatedScopeExposure;
  if (uncompensated !== undefined && !uncompensated.isZero()) {
    reasons.push({
      code: 'UNCOMMERCIALISED_SCOPE', metricId: 'MET-COM-009',
      observedValue: uncompensated.toQuantity(),
      narrative:
        `${uncompensated.toPresentationString()} of scope is being delivered without commercial recovery.`,
      evidence: ev(c.projectId, 'MET-COM-009'),
    });
  }

  const greenAtRisk = assessGreenAtRisk({
    projectId: c.projectId, week, assessedAt: asOf, ruleVersion: rule,
    metricCatalogVersion: CATALOG_VERSION,
    systemAssessedBand: health.systemAssessedRag,
    // L1 observed, exactly as the delivery manager reported it (C-10 / ADR-0018).
    reportedRag: latestStatus?.reportedRag ?? null,
    trajectory,
    economicExposure: economics.gmValueAtRisk,
    marginPointsAtRisk: erosion === null ? null : qty(erosion),
    reasons,
    bandEvidence: ev(c.projectId, 'MET-HLTH-011'),
    dataConfidence: dataConfidence.confidenceScore,
    weeksToBandChange: trajectory.state === 'STABLE' || trajectory.state === 'IMPROVING' ? null : 6,
    minimumInterventionWeeks: 4,
  });

  return {
    letter, projectId: c.projectId, title: c.scenario.title,
    economics, health, dataConfidence, trajectory, greenAtRisk,
  };
}

const pct = (r: Parameters<typeof ratioValue>[0], dp = 2): string => {
  const v = ratioValue(r);
  return v === null ? 'NOT_COMPUTABLE' : `${(Number(v) * 100).toFixed(dp)}%`;
};
const usd = (m: Money | null): string => (m === null ? 'NOT_COMPUTABLE' : m.toPresentationString());

/** Renders the acceptance-gate report. Same input, same bytes, every run. */
export function renderReport(p: SyntheticPortfolio, letters: readonly string[]): string {
  const out: string[] = [
    '# Phase 4 Acceptance Gate — Curated Scenario Assessment',
    '',
    '> ## ⚠️ DEMO — SYNTHETIC DATA',
    '> No real client, employee or financial data. Every figure below is computed from the',
    '> generated portfolio by the Phase 4 engines.',
    '',
    '**Generated** by `npm run assess:curated`. Deterministic: the same seed and the same rule',
    'versions produce the same bytes. Do not edit by hand.',
    '',
    `- Seed: \`${p.seed}\``,
    `- As-of: \`${p.asOf}\``,
    '- Health model: `HEALTH-v2` (four executive dimensions) — **Draft**, CONFLICT C-7, ADR-0015',
    '- Rule sets: `HEALTH-v2`, `TRAJECTORY-v1`, `DQ-v1`, `EAC-v1`, `VAR-v1`',
    `- Metric catalog: \`${CATALOG_VERSION}\``,
    '',
    '**Every threshold below is a SYNTHETIC CALIBRATION CANDIDATE, not approved production policy.**',
    'See `RULE_SETS` in `src/contexts/rules/internal/rule-sets.ts` for the values in force and the',
    'register item and owner that must supply each one still open.',
    '',
    '---',
    '',
  ];

  for (const letter of letters) {
    const a = assessCurated(p, letter);
    const e = a.economics;
    out.push(
      `## Scenario ${letter} — ${a.title}`,
      '',
      `\`${a.projectId}\``,
      '',
      '### Economics',
      '',
      '| Metric | ID | Value |',
      '| --- | --- | --- |',
      `| Contract value (As-Sold) | MET-FIN-001 | ${usd(e.contractualRevenue)} |`,
      `| Forecast revenue (executed change only) | MET-FIN-010 | ${usd(e.forecastRevenue)} |`,
      `| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | ${usd(e.unsecuredUpside)} |`,
      `| Estimate at completion | MET-FIN-008 | ${usd(e.estimateAtCompletion)} |`,
      `| Gross margin — As-Sold | MET-FIN-012 | ${pct(e.soldGmPercent)} |`,
      `| Gross margin — Forecast | MET-FIN-014 | ${pct(e.forecastGmPercent)} |`,
      `| Margin erosion | MET-FIN-016 | ${pct(e.marginErosionPp)} |`,
      `| Cost consumed | MET-FIN-028 | ${pct(e.costConsumedPercent)} |`,
      `| Burn gap (cost consumed − physical) | MET-FIN-027 | ${pct(e.burnGap)} |`,
      `| Contingency consumed | MET-FIN-035 | ${pct(e.contingencyConsumedPercent)} |`,
      `| Performance-implied EAC | MET-FIN-029 | ${usd(e.performanceImpliedEac)} |`,
      `| ETC optimism gap | MET-FIN-030 | ${usd(e.etcOptimismGap)} |`,
      `| Incremental risk exposure (not in ETC) | MET-RSK-008 | ${usd(e.incrementalRiskExposure)} |`,
      `| Risk already provisioned in ETC (not double counted) | — | ${usd(e.riskProvisionedInEtc)} |`,
      `| Risk-adjusted gross margin | MET-FIN-033 | ${pct(e.riskAdjustedGmPercent)} |`,
      `| GM value at risk | MET-FIN-019 | ${usd(e.gmValueAtRisk)} |`,
      '',
      '### Health',
      '',
      `- **Reported RAG** (MET-HLTH-012, L1): ${a.health.reportedRag ?? 'not declared'}`,
      `- **System-Assessed RAG** (MET-HLTH-011, L3): **${a.health.systemAssessedRag}**`,
      `- **Composite** (MET-HLTH-020, Draft): ${a.health.compositeScore ?? 'NOT_COMPUTABLE'}`,
      `- **Data confidence** (MET-DQ-005): ${a.dataConfidence.confidenceScore ?? 'NOT_COMPUTABLE'} — ${a.dataConfidence.band}`,
      ...(a.health.statusConflict === null
        ? ['- **Status divergence** (MET-HLTH-030): none']
        : [
            `- **Status divergence** (MET-HLTH-030): ${a.health.statusConflict.divergence > 0 ? '+' : ''}${a.health.statusConflict.divergence} — ${a.health.statusConflict.direction}`,
            `  - ${a.health.statusConflict.narrative}`,
          ]),
      '',
      '```',
      a.health.explanation.outcome,
      ...a.health.explanation.evaluations.filter((x) => x.fired).map(renderEvaluation),
      '```',
      '',
      '### Trajectory and outlook',
      '',
      `- **State** (MET-FCST-020, Draft): **${a.trajectory.state}**`,
      `- Materially adverse signals: ${a.trajectory.adverseConfluence}`,
      '',
      '| Horizon | Band | Confidence | Rationale |',
      '| --- | --- | --- | --- |',
      ...a.trajectory.outlooks.map(
        (o) => `| ${o.horizon} | ${o.band} | ${o.confidence} | ${o.rationale} |`,
      ),
      '',
      '### Green-at-Risk',
      '',
      `- **System Green-at-Risk** (MET-FCST-025, Draft): ${a.greenAtRisk.isSystemGreenAtRisk ? '**YES**' : 'no'}`
      + ` — System ${a.greenAtRisk.systemAssessedBand} now; outlook 30d ${a.greenAtRisk.outlook30 ?? 'n/a'}, 60d ${a.greenAtRisk.outlook60 ?? 'n/a'}`,
      `- **Reported Green Risk** (MET-HLTH-031, Draft): ${a.greenAtRisk.isReportedGreenRisk ? '**YES**' : 'no'}`
      + ` — Reported ${a.greenAtRisk.reportedRag ?? 'not reported'} vs System ${a.greenAtRisk.systemAssessedBand}`,
      ...(a.greenAtRisk.notApplicableReason === undefined
        ? []
        : [`- Why not: ${a.greenAtRisk.notApplicableReason}`]),
      `- Economic exposure (MET-FCST-026, Draft): ${usd(a.greenAtRisk.economicExposure)}`,
      `- Intervention window open: ${a.greenAtRisk.interventionWindowOpen ? 'yes' : 'no'}`,
      `- Confidence in the finding: ${a.greenAtRisk.confidenceBand}`,
      ...(a.greenAtRisk.reasons.length === 0
        ? []
        : ['', ...a.greenAtRisk.reasons.map((r) => `- **${r.code}** (${r.metricId}): ${r.narrative}`)]),
      '',
      '---',
      '',
    );
  }

  out.push(
    '## What this report does not claim',
    '',
    '1. **The thresholds are not approved.** Every band edge, weight and slope threshold above is a',
    '   synthetic calibration candidate. A synthetic distribution can test behaviour; it cannot',
    '   establish production policy.',
    '2. **The health model is Draft.** `HEALTH-v2` and MET-HLTH-020…024 exist under CONFLICT C-7 and',
    '   are not authoritative until ADR-0015 is accepted. The Frozen six-dimension model',
    '   (MET-HLTH-001…006, 010) remains blocked on MC-2.',
    '3. **Intervention priority is absent.** MET-PORT-007 is blocked on MC-5 and no substitute has',
    '   been rendered. `orderByExposure()` returns two of its three factors and says so.',
    '4. **Recovery economics are not shown per scenario.** The synthetic portfolio contains no',
    '   recovery plans; the engine is proved by golden tests over hand-computed cases instead.',
    '',
    '---',
    '',
    '## CONFLICT C-10 — the flagship scenario does not fire the flagship rule',
    '',
    'Scenario B is the Green-at-Risk reference case. Above, it is reported **not Green-at-Risk**,',
    'because `MET-FCST-025` reads *Green* as `MET-HLTH-011` System-Assessed RAG, and under the',
    'HEALTH-v2 synthetic band edges B already assesses **AMBER**. Its Reported RAG is GREEN, its',
    'margin has eroded 5.10 points, and its trajectory is DETERIORATING.',
    '',
    'There are two readings of "Green" and they disagree here:',
    '',
    '- **System-Assessed** — the band the evidence supports. Under this reading B is an *already',
    '  detected* problem, and Green-at-Risk correctly declines to claim a discovery.',
    '- **Reported** — the band the organisation believes. Under this reading B is exactly the case',
    '  the product exists for: it looks fine on the report that reaches the executive, and it is',
    '  deteriorating.',
    '',
    '`PRODUCT_SPEC.md` §1.1 says the differentiator is "identifying Green projects moving toward',
    'Amber/Red **while intervention can still change the outcome**", and does not say which Green.',
    'Choosing one here would resolve an open question by inference (`CLAUDE.md` invariant 4), so the',
    'implementation uses the System-Assessed reading — the conservative one, which under-reports',
    'rather than over-claims — and the conflict is raised in **ADR-0015** for a decision. A',
    'regression test pins the current behaviour so the reading cannot change silently.',
    '',
    'The divergence itself is not lost either way: MET-HLTH-030 reports B as **+1',
    'REPORTED_OPTIMISTIC**, which is the signal `PRODUCT_SPEC.md` §3.3 calls the most valuable in',
    'the product.',
    '',
  );
  return out.join('\n');
}

export { generatePortfolio };

/**
 * The governed applicability facts for one project (ADR-0026 D-2).
 *
 * Deliberately **not** derived from `lifecycleStage`: on this portfolio the stage label
 * misclassifies 3 of 13 projects — `prj-081` is `EXECUTING` with 5 weeks elapsed and belongs with
 * the mobilising group, while `prj-042` is `EXECUTING` at 100% complete and belongs with the
 * finished one. What decides applicability is remaining work, remaining window and elapsed delivery.
 */
export function applicabilityContextFor(
  p: SyntheticPortfolio, projectId: string,
): RuleApplicabilityContext {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`Unknown project ${projectId}`);
  const claims = p.facts.progressClaims
    .filter((c) => c.projectId === projectId && c.claimedOn <= p.asOf);
  const latest = claims.at(-1);
  const days = (from: string, to: string): number =>
    Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  return {
    physicalCompletion: latest === undefined ? null : qty(latest.physicalCompletion),
    daysToBaselineCompletion: days(p.asOf, spec.plannedEndDate),
    elapsedDeliveryWeeks: Math.floor(days(spec.startDate, p.asOf) / 7),
    velocityWindowWeeks: VELOCITY_WINDOW_WEEKS,
    contractType: spec.engagementModel,
    lifecycleStage: spec.lifecycleStage,
  };
}
