/**
 * Facts → early-warning, recovery and late-detection inputs — **DEMO — SYNTHETIC DATA**.
 *
 * The Phase 10 adapter. Like its siblings it **shapes facts into engine inputs and owns no
 * arithmetic**: every signal value it supplies was produced by a `contexts/*` engine, and the
 * estimated impact attached to each reading is a figure another engine already computed.
 *
 * ### Signal readings carry three things the rules engine needs
 *
 * A value, a **trend**, and an **estimated impact**. The value decides whether a rule fires; the
 * trend and the impact are what make a fired rule actionable rather than merely true. A warning list
 * ordered only by whether a threshold was crossed cannot be prioritised, which is why severity is
 * distance past the threshold and the money is attached at source.
 */
import { Money, qAbs, qCompare, qDiv, qty, ratioToQuantity } from '@platform/decimal';
import type { RecordRef } from '@platform/provenance';
import type { CalendarDate, Instant } from '@platform/time';
import { settledOnAsOf } from '@platform/time';
import type { SignalReading } from '@contexts/rules';
import {
  type ActionLinkInput, type DispositionInput, type EarlyWarningAssessment,
  evaluateEarlyWarnings,
} from '@contexts/forecast';
import type { RecoveryActionInput, RecoveryEconomics } from '@contexts/recovery';
import { computeRecoveryEconomics } from '@contexts/recovery';
import { computeEconomics } from '@contexts/financial';
import { evaluateCommercial } from '@contexts/commercial';
import { evaluateQuality } from '@contexts/quality';
import { evaluateResource } from '@contexts/resource';
import { evaluateDelivery } from '@contexts/delivery';
import { ruleVersion } from '@platform/provenance';
import type { ForwardRiskView } from '@app';
import { buildForwardRisk } from '@app';
import type { SyntheticPortfolio } from '../generator/index.js';
import {
  USD, CATALOG_VERSION, commercialInputFor, deliveryInputFor, economicsInputFor, qualityInputFor,
  resourceInputFor,
} from './curated-assessment.js';
import { buildCommandCenterFor, commandCenterProject } from './command-center-adapter.js';
import { marginTrendFor } from './margin-adapter.js';
import { evaluateHealth } from '@contexts/health';
import { healthInputFor } from './curated-assessment.js';
import {
  type LateDetectionCase, type LateDetectionRate, computeLateDetectionRate,
} from '@contexts/forecast';

const RECOVERY = ruleVersion('RECOVERY-v1');

const ref = (context: string, projectId: string, metricId: string): RecordRef =>
  ({ context, entityType: 'snapshot', entityId: projectId, metricId });

/** A reading the rules engine can evaluate, with the trend and money that make it actionable. */
function reading(
  signalId: string, value: string | null, evidence: readonly RecordRef[],
  trend?: SignalReading['trend'], impact?: Money,
): SignalReading {
  return {
    signalId,
    value,
    ...(trend === undefined ? {} : { trend }),
    evidence,
    ...(impact === undefined
      ? {}
      : { estimatedImpact: { amount: impact.toQuantity(), currency: impact.toDto().currency } }),
  };
}

/** Builds every early-warning signal reading for one project. */
export function warningReadingsFor(
  p: SyntheticPortfolio, projectId: string,
): Map<string, SignalReading> {
  const e = computeEconomics(economicsInputFor(p, projectId));
  const com = evaluateCommercial(commercialInputFor(p, projectId, e));
  const qua = evaluateQuality(qualityInputFor(p, projectId, e));
  const res = evaluateResource(resourceInputFor(p, projectId, e));
  const del = evaluateDelivery(deliveryInputFor(p, projectId));
  const dq = commandCenterProject(p, projectId).assessment.dataConfidence;
  const trend = marginTrendFor(p, projectId);

  const m = new Map<string, SignalReading>();

  // --- forecast margin deterioration streak ---------------------------------
  let streak = 0;
  let best = 0;
  for (let i = 1; i < trend.length; i += 1) {
    const now = (trend[i] as { forecastGm: Money }).forecastGm;
    const before = (trend[i - 1] as { forecastGm: Money }).forecastGm;
    if (now.minus(before).isNegative()) { streak += 1; best = Math.max(best, streak); } else streak = 0;
  }
  m.set('GM_DETERIORATION_STREAK', reading(
    'GM_DETERIORATION_STREAK', String(best), [ref('financial', projectId, 'MET-FIN-024')],
    best > 0 ? 'WORSENING' : 'STABLE', e.gmErosionValue,
  ));

  // --- EAC increase against the earliest period on record -------------------
  const firstEac = trend[0]?.estimateAtCompletion;
  const lastEac = trend.at(-1)?.estimateAtCompletion;
  if (firstEac !== undefined && lastEac !== undefined && !firstEac.isZero()) {
    const ratio = qDiv(lastEac.minus(firstEac).toQuantity(), firstEac.toQuantity());
    m.set('EAC_INCREASE_RATIO', reading(
      'EAC_INCREASE_RATIO', ratio, [ref('financial', projectId, 'MET-FIN-043')],
      ratio !== null && qCompare(ratio, qty('0')) > 0 ? 'WORSENING' : 'STABLE',
      lastEac.minus(firstEac),
    ));
  }

  // --- burn gap and contingency ---------------------------------------------
  m.set('BURN_GAP', reading(
    'BURN_GAP', ratioToQuantity(e.burnGap), [ref('financial', projectId, 'MET-FIN-027')],
    'WORSENING', e.gmValueAtRisk,
  ));
  m.set('CONTINGENCY_BURN_GAP', reading(
    'CONTINGENCY_BURN_GAP', ratioToQuantity(e.contingencyBurnGap),
    [ref('financial', projectId, 'MET-FIN-034')], 'WORSENING',
  ));

  // --- delivery --------------------------------------------------------------
  m.set('REQUIRED_VELOCITY_RATIO', reading(
    'REQUIRED_VELOCITY_RATIO', del.requiredVelocityRatio.value,
    [ref('delivery', projectId, 'MET-DEL-018')], 'WORSENING',
  ));
  m.set('MILESTONES_AT_RISK', reading(
    'MILESTONES_AT_RISK',
    del.milestonesAtRisk.value === null ? null : String(del.milestonesAtRisk.value),
    [ref('delivery', projectId, 'MET-DEL-010')], 'WORSENING',
  ));
  m.set('DEPENDENCY_AGEING_DAYS', reading(
    'DEPENDENCY_AGEING_DAYS',
    del.customerDependencyAgeingDays.value === null
      ? null : String(del.customerDependencyAgeingDays.value),
    [ref('delivery', projectId, 'MET-DEL-023')], 'WORSENING',
  ));

  // --- commercial ------------------------------------------------------------
  m.set('UNCOMPENSATED_SCOPE_RATIO', reading(
    'UNCOMPENSATED_SCOPE_RATIO', com.uncompensatedScopeRatio.value,
    [ref('commercial', projectId, 'MET-COM-009')], 'WORSENING', com.uncompensatedScopeValue,
  ));
  m.set('PENDING_CR_AGE_DAYS', reading(
    'PENDING_CR_AGE_DAYS',
    com.maxPendingCrAgeDays.value === null ? null : String(com.maxPendingCrAgeDays.value),
    [ref('commercial', projectId, 'MET-COM-007')], 'WORSENING', e.unsecuredUpside,
  ));

  // --- quality ---------------------------------------------------------------
  m.set('REWORK_RATIO', reading(
    'REWORK_RATIO', qua.reworkRatio.value, [ref('quality', projectId, 'MET-QUA-006')],
    'WORSENING', qua.excessReworkCost.value ?? undefined,
  ));
  m.set('DEFECT_BACKLOG_TREND', reading(
    'DEFECT_BACKLOG_TREND', qua.defectBacklogTrend.value,
    [ref('quality', projectId, 'MET-QUA-009')], 'WORSENING',
  ));

  // --- resource --------------------------------------------------------------
  // The drift is expressed as a share of budgeted cost so the rule's threshold is comparable
  // across projects of very different size — an absolute dollar threshold would fire on every
  // large project and never on a small one.
  const drift = res.resourceCostDriftImpact.value;
  const budget = e.budgetedCostCurrentContractual;
  m.set('RESOURCE_COST_DRIFT_RATIO', reading(
    'RESOURCE_COST_DRIFT_RATIO',
    drift === null || budget.isZero() ? null : qDiv(qAbs(drift.toQuantity()), budget.toQuantity()),
    [ref('resource', projectId, 'MET-RES-011')], 'WORSENING', drift ?? undefined,
  ));

  // --- evidence staleness ----------------------------------------------------
  m.set('CRITICAL_DOMAIN_STALENESS_DAYS', reading(
    'CRITICAL_DOMAIN_STALENESS_DAYS',
    dq.freshnessDays === null ? null : String(dq.freshnessDays),
    [ref('data-quality', projectId, 'MET-DQ-002')], 'WORSENING',
  ));

  return m;
}

/** Assurance dispositions for one project, as recorded. */
export function dispositionsFor(
  p: SyntheticPortfolio, projectId: string,
): readonly DispositionInput[] {
  return p.facts.warningDispositions
    .filter((w) => w.projectId === projectId)
    .map((w) => ({
      signalId: w.signalId,
      raisedOn: w.raisedOn as CalendarDate,
      disposition: w.disposition,
      // A disposition dated in the future has not happened yet.
      ...(() => {
        const done = settledOnAsOf(w.dispositionedOn, p.asOf as CalendarDate);
        return done === undefined ? {} : { dispositionedOn: done };
      })(),
      assuranceActorId: w.assuranceActorId,
      rationale: w.rationale,
      dueOn: w.dueOn as CalendarDate,
    }));
}

/**
 * Corrective actions, linked to the signal each answers.
 *
 * The generator records `respondsToSignal` against the **signal id** the action addresses, so the
 * lifecycle join is a data relationship rather than a string match invented at read time.
 */
export function actionLinksFor(
  p: SyntheticPortfolio, projectId: string,
): readonly ActionLinkInput[] {
  return p.facts.recoveryActions
    .filter((a) => a.projectId === projectId)
    .map((a) => ({
      id: a.id,
      signalId: a.respondsToSignal ?? null,
      description: a.description,
      ownerActorId: a.ownerActorId ?? null,
      dueOn: (a.dueOn ?? null) as CalendarDate | null,
      status: a.status,
      executiveDecisionRequired: a.executiveDecisionRequired,
    }));
}

export function earlyWarningsFor(
  p: SyntheticPortfolio, projectId: string,
): EarlyWarningAssessment {
  return evaluateEarlyWarnings({
    projectId,
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    readings: warningReadingsFor(p, projectId),
    dispositions: dispositionsFor(p, projectId),
    actions: actionLinksFor(p, projectId),
  });
}

/** Recovery economics for one project, or `null` where no plan exists. */
export function recoveryEconomicsFor(
  p: SyntheticPortfolio, projectId: string,
): RecoveryEconomics | null {
  const plan = p.facts.recoveryPlans.find((r) => r.projectId === projectId);
  if (plan === undefined) return null;

  const e = computeEconomics(economicsInputFor(p, projectId));
  const actions: readonly RecoveryActionInput[] = p.facts.recoveryActions
    .filter((a) => a.planId === plan.id)
    .map((a) => ({
      id: a.id,
      description: a.description,
      ownerActorId: a.ownerActorId ?? null,
      dueOn: (a.dueOn ?? null) as CalendarDate | null,
      status: a.status,
      revenueBenefit: Money.of(a.revenueBenefit.amount, USD),
      costBenefit: Money.of(a.costBenefit.amount, USD),
      scheduleBenefitWeeks: a.scheduleBenefitWeeks,
      confidence: qty(a.confidence),
      incompatibilityGroup: a.incompatibilityGroup ?? null,
      evidence: [ref('recovery', projectId, 'MET-REC-001')],
    }));

  return computeRecoveryEconomics({
    projectId,
    week: (p.facts.progressClaims.filter((c) => c.projectId === projectId).at(-1)?.week
      ?? '2026-W35') as never,
    assessedAt: `${p.asOf}T00:00:00.000Z` as Instant,
    ruleVersion: RECOVERY,
    metricCatalogVersion: CATALOG_VERSION,
    currency: USD,
    forecastRevenue: e.forecastRevenue,
    forecastCost: e.estimateAtCompletion,
    forecastGmPercent: e.forecastGmPercent,
    riskAdjustedGmPercent: e.riskAdjustedGmPercent,
    actions,
    baseEvidence: [ref('financial', projectId, 'MET-FIN-024')],
    // RECOVERY-v1 calibration. Synthetic candidates, like every other threshold here.
    overdueDiscount: qty('0.5'),
    confidenceFloor: qty('0.2'),
    today: p.asOf as CalendarDate,
    credibilityWeights: { ownership: qty('0.4'), timeliness: qty('0.3'), completion: qty('0.3') },
  });
}

/** Unused-hours guard so a caller can state the population it relied on. */
export function hasRecoveryPlan(p: SyntheticPortfolio, projectId: string): boolean {
  return p.facts.recoveryPlans.some((r) => r.projectId === projectId);
}


/**
 * `MET-FCST-030` Late Detection Rate over an authorised scope.
 *
 * For each project, the band is recomputed at every sampled reporting period **through the same
 * health engine**, and the first RED is located. A project counts as *detected* if the period
 * immediately before that first RED was already AMBER, or carried at least one fired early-warning
 * rule. Anything else is a late detection.
 *
 * Deriving history with a cheaper second formula would produce a rate that disagrees with the bands
 * the rest of the product shows, so the same engine is rewound instead.
 */
export function lateDetectionFor(
  p: SyntheticPortfolio, projectIds: readonly string[],
): LateDetectionRate {
  const cases: LateDetectionCase[] = [];

  for (const projectId of projectIds) {
    const spec = p.structure.projects.find((s) => s.projectId === projectId);
    if (spec?.engagementModel !== 'FIXED_BID') continue;

    const dates = [...new Set(
      p.facts.progressClaims.filter((c) => c.projectId === projectId).map((c) => c.claimedOn),
    )].sort();
    // Sampled on the reporting cadence, like the margin trend, so the two agree period for period.
    const sampled = dates.filter((_, i) => i % 4 === 0).slice(-8);
    if (sampled.length < 2) continue;

    const reported = p.facts.statusReports.filter((r) => r.projectId === projectId).at(-1)?.reportedRag ?? null;
    const week = (p.facts.progressClaims.filter((c) => c.projectId === projectId).at(-1)?.week ?? '2026-W35');

    const bands = sampled.map((date) => {
      const e = computeEconomics(economicsInputFor(p, projectId, date));
      // Delivery, commercial and quality signals are as-at today: the fact tables carry no
      // per-period snapshot of them, so only the financial dimension genuinely rewinds. That is
      // stated in the Phase 10 report rather than presented as a full historical assessment.
      const h = evaluateHealth(healthInputFor(e, week as never, reported as never));
      return { date, band: h.systemAssessedRag };
    });

    const firstRedIndex = bands.findIndex((b) => b.band === 'RED');
    if (firstRedIndex <= 0) continue;

    const prior = bands[firstRedIndex - 1] as { date: string; band: string };
    // Would a warning have fired at that prior period? The rules are evaluated against the
    // evidence available then, not against today's.
    const priorWarnings = evaluateEarlyWarnings({
      projectId,
      asOf: `${prior.date}T00:00:00.000Z` as Instant,
      readings: warningReadingsAsOf(p, projectId, prior.date),
      dispositions: [],
      actions: [],
    }).warnings.length;

    cases.push({
      projectId,
      firstRedPeriod: (bands[firstRedIndex] as { date: string }).date,
      priorBand: prior.band,
      priorWarningCount: priorWarnings,
      detected: prior.band === 'AMBER' || priorWarnings > 0,
    });
  }

  // Only the financial dimension genuinely rewinds: no per-period snapshot of the delivery,
  // commercial or quality derivations exists. Naming what was and was not reconstructed is what
  // stops the resulting rate being quoted as an executive conclusion (DR-059).
  return computeLateDetectionRate(cases, {
    reconstructedDimensions: ['FINANCIAL'],
    unavailableDimensions: ['DELIVERY', 'SCOPE_COMMERCIAL', 'PRODUCT_QUALITY'],
  });
}

/**
 * Signal readings as they would have read at an earlier date.
 *
 * Only the financial signals genuinely rewind — the fact tables hold no per-period snapshot of the
 * delivery, commercial or quality derivations. The rest are therefore **omitted rather than carried
 * back from today**, which would attribute today's evidence to a past decision and make detection
 * look better than it was.
 */
export function warningReadingsAsOf(
  p: SyntheticPortfolio, projectId: string, asOfDate: string,
): Map<string, SignalReading> {
  const e = computeEconomics(economicsInputFor(p, projectId, asOfDate));
  const m = new Map<string, SignalReading>();
  m.set('BURN_GAP', reading(
    'BURN_GAP', ratioToQuantity(e.burnGap), [ref('financial', projectId, 'MET-FIN-027')],
    'WORSENING', e.gmValueAtRisk,
  ));
  m.set('CONTINGENCY_BURN_GAP', reading(
    'CONTINGENCY_BURN_GAP', ratioToQuantity(e.contingencyBurnGap),
    [ref('financial', projectId, 'MET-FIN-034')], 'WORSENING',
  ));
  return m;
}

/** Builds the whole Phase 10 view for one project, ranked within the caller's authorised set. */
export function forwardRiskFor(
  p: SyntheticPortfolio, projectId: string, authorisedIds?: readonly string[],
): ForwardRiskView {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`unknown project ${projectId}`);

  const project = commandCenterProject(p, projectId);
  const plan = p.facts.recoveryPlans.find((r) => r.projectId === projectId) ?? null;
  const actionRows = p.facts.recoveryActions.filter((a) => a.projectId === projectId);

  // Ranking and late detection are portfolio measures and need a scope. Where none was supplied
  // they are absent rather than computed over everything — the caller's set is the population.
  const scoped = authorisedIds === undefined
    ? null
    : buildCommandCenterFor(p, authorisedIds);
  const rankRow = scoped?.ranked.find((r) => r.projectId === projectId) ?? null;

  return buildForwardRisk({
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    week: (p.facts.progressClaims.filter((c) => c.projectId === projectId).at(-1)?.week
      ?? '2026-W35') as never,
    currency: USD,
    zero: Money.zero(USD),
    ruleVersion: ruleVersion('EARLY_WARNING-v1'),
    projectId,
    projectName: spec.name,
    customerAlias: `Client ${spec.accountId.replace(/^acc-/, '').toUpperCase()}`,
    assessment: project.assessment,
    warnings: earlyWarningsFor(p, projectId),
    recovery: recoveryEconomicsFor(p, projectId),
    recoveryPlan: plan === null ? null : {
      id: plan.id,
      openedOn: plan.openedOn,
      targetExitOn: plan.targetExitOn,
      sponsorActorId: plan.sponsorActorId,
    },
    actionDetails: actionRows.map((a) => ({
      id: a.id,
      description: a.description,
      ownerActorId: a.ownerActorId ?? null,
      dueOn: a.dueOn ?? null,
      status: a.status,
      scheduleBenefitWeeks: a.scheduleBenefitWeeks,
      confidence: qty(a.confidence),
      executiveDecisionRequired: a.executiveDecisionRequired,
      respondsToSignal: a.respondsToSignal ?? null,
    })),
    rankNarrative: rankRow?.rankNarrative ?? null,
    decidingTier: rankRow?.outranksBecause ?? null,
    rankOf: rankRow?.rank ?? null,
    rankedOutOf: scoped?.ranked.length ?? null,
    lateDetection: authorisedIds === undefined ? null : lateDetectionFor(p, authorisedIds),
  });
}
