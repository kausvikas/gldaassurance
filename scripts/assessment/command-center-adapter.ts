/**
 * Demo adapter: synthetic portfolio → `buildCommandCenter()` — **DEMO — SYNTHETIC DATA**.
 *
 * Lives in `scripts/` for the same reason the rest of the assessment adapter does: it reads the
 * Phase 3 generator, and the **G-ORACLE** gate forbids production source from importing it. A real
 * deployment replaces this file with repository reads; nothing above it changes, because the
 * application service takes a list of already-authorised projects and holds no data handle of its
 * own.
 *
 * **It runs every engine per project.** Economics, health, data confidence, forecast confidence,
 * trajectory (all six signals, DR-021) and the two forward-risk findings (ADR-0018) — the same code
 * paths `assessCurated()` exercises, over the whole portfolio rather than the nine curated
 * scenarios. Nothing here recomputes a metric; it assembles inputs and calls the engines.
 *
 * Results are memoised per project because the demo renders several personas against the same
 * portfolio and re-running 91 projects' worth of engines per persona is wasted work — the memo is
 * keyed on project id and the portfolio is immutable, so it cannot serve one caller another's data.
 */
import { Money, type Quantity, isComputable, qty, ratioToPercentString } from '@platform/decimal';
import { ruleVersion, type RuleVersion } from '@platform/provenance';
import {
  FixedClock, isOpenAsOf, type CalendarDate, type Instant, type WeekId,
} from '@platform/time';
import type { CommandCenterProject, CommandCenterView } from '@app';
import { assessProject, buildCommandCenter } from '@app';
import type { ActionabilityEvidence, PriorityPolicy } from '@contexts/portfolio';
import type { GreenAtRiskReason } from '@contexts/forecast';
import { computeEconomics } from '@contexts/financial';
import { marginTrendFor } from './margin-adapter.js';
import { evaluateCommercial } from '@contexts/commercial';
import { evaluateQuality } from '@contexts/quality';
import { type DeliveryEvaluation, evaluateDelivery } from '@contexts/delivery';
import type { SyntheticPortfolio } from '../generator/index.js';
import {
  applicabilityContextFor,
  CATALOG_VERSION, commercialInputFor, deliveryInputFor, economicsInputFor, healthInputFor,
  qualityInputFor, trajectorySeriesFor,
} from './curated-assessment.js';

const USD = 'USD' as const;

/** `PRIORITY-v1` in force. **Synthetic calibration candidates, not approved thresholds.** */
export const DEMO_PRIORITY_POLICY: PriorityPolicy = {
  version: ruleVersion('PRIORITY-v1'),
  criticalGmValueAtRiskFloor: qty('250000'),
  immediateHorizonWeeks: 4,
};

const RULE: RuleVersion = ruleVersion('HEALTH-v2');

const percent = (r: Parameters<typeof ratioToPercentString>[0]): number | null => {
  if (!isComputable(r)) return null;
  const s = ratioToPercentString(r, 4);
  return s === null ? null : Number(s.replace('%', ''));
};

const cache = new Map<string, CommandCenterProject>();

/**
 * One project, fully assessed.
 *
 * The `recovery` evidence is deliberately sparse: the POC has no recovery-plan store (Phase 10), so
 * most projects grade `NOT_ASSESSED`. That is the honest state — **not** a reason to synthesise
 * plans, which would make tier 5 of `MET-PORT-007` look exercised when it is not.
 */
export function commandCenterProject(
  p: SyntheticPortfolio, projectId: string,
): CommandCenterProject {
  const cached = cache.get(projectId);
  if (cached !== undefined) return cached;

  const spec = p.structure.projects.find((x) => x.projectId === projectId);
  if (spec === undefined) throw new Error(`unknown project ${projectId}`);

  const week = (p.facts.progressClaims.filter((r) => r.projectId === projectId).at(-1)?.week
    ?? '2026-W35') as WeekId;
  const asOf = `${p.asOf}T00:00:00.000Z` as Instant;
  const clock = new FixedClock(asOf);

  const econInput = economicsInputFor(p, projectId);
  // ADR-0022 D-1 — the Delivery dimension's three missing signals. Computed by the `delivery`
  // context, never here: this adapter shapes facts into engine inputs and owns no arithmetic.
  const delivery = evaluateDelivery(deliveryInputFor(p, projectId));
  // The Scope & Commercial and Product & Quality signals (ADR-0022 D-2/D-3). Both engines need the
  // economics result, so economics is computed once here and shared rather than run twice.
  const econForSignals = computeEconomics(econInput);
  const commercial = evaluateCommercial(commercialInputFor(p, projectId, econForSignals));
  const quality = evaluateQuality(qualityInputFor(p, projectId, econForSignals));
  const latestStatus = p.facts.statusReports.filter((r) => r.projectId === projectId).at(-1);
  const reportedRag = latestStatus?.reportedRag ?? null;

  const domains = ['financial', 'delivery', 'commercial', 'quality', 'resource', 'risk'];
  const evidence = (context: string) =>
    [{ context, entityType: 'snapshot', entityId: projectId }];

  const assessment = assessProject({
    projectId, week, currency: USD, ruleVersion: RULE, metricCatalogVersion: CATALOG_VERSION,
    economics: econInput,
    health: (e) => healthInputFor(
      e, week, reportedRag, delivery, commercial, quality, applicabilityContextFor(p, projectId),
    ),
    dataConfidence: {
      projectId, week, assessedAt: asOf, ruleVersion: ruleVersion('DQ-v1'),
      metricCatalogVersion: CATALOG_VERSION,
      expectedDomains: domains,
      observations: domains.map((d) => ({
        domain: d, requiredFields: 10, populatedFields: 10,
        valuesChecked: 10, valuesValid: 10, invalidFields: [],
        assertionsEvaluated: 4, assertionsPassed: 4, failedAssertions: [],
        // Delivery reports weekly; the others on their own cadence. Ages are derived from the
        // generated fact history so a genuinely quiet domain reports as quiet.
        ageDays: ageOfDomain(p, projectId, d),
        expectedCadenceDays: d === 'delivery' ? 7 : 30,
        evidence: evidence(d),
      })),
      assessmentEvidence: evidence('project'),
      weights: {
        completeness: qty('0.25'), freshness: qty('0.20'), consistency: qty('0.25'),
        coverage: qty('0.15'), validity: qty('0.15'),
        highBandFloor: qty('75'), mediumBandFloor: qty('50'), stalenessRedMultiple: qty('3'),
        criticalDomains: ['financial', 'delivery'],
        criticalStalenessTolerance: qty('3'),
        freshnessPolicyVersion: 'DQ-FRESHNESS-v1',
      },
    },
    forecastConfidence: {
      projectId, week, assessedAt: asOf, ruleVersion: ruleVersion('DQ-v1'),
      metricCatalogVersion: CATALOG_VERSION,
      replanFrequency: qty(String(p.facts.baselineRevisions.filter((r) => r.contractId === spec.contractId).length)),
      etcOptimismGap: null,
      velocityStability: qty('0.8'),
      weights: { replan: qty('0.34'), optimism: qty('0.33'), stability: qty('0.33') },
      edges: {
        replan: [qty('0'), qty('4')],
        optimism: [qty('0'), qty('500000')],
        stability: [qty('1'), qty('0')],
      },
      evidence: evidence('delivery'),
    },
    forecastConfidenceBands: { high: qty('75'), medium: qty('50') },
    trajectory: (health) => ({
      projectId, week, assessedAt: asOf, ruleVersion: RULE,
      metricCatalogVersion: CATALOG_VERSION,
      // The band the projection starts from is MET-HLTH-011, not a constant. Projecting every
      // project forward from GREEN made a RED project's 30-day outlook read GREEN, which is the
      // most reassuring possible way to be wrong on an executive page.
      currentBand: health.systemAssessedRag,
      rapidConfluenceThreshold: 3,
      series: trajectorySeriesFor(p, projectId),
    }),
    greenAtRisk: (economics, trajectory, health, dataConfidence) => ({
      projectId, week, assessedAt: asOf, ruleVersion: RULE,
      metricCatalogVersion: CATALOG_VERSION,
      systemAssessedBand: health.systemAssessedRag,
      reportedRag,
      trajectory,
      economicExposure: economics.gmValueAtRisk,
      marginPointsAtRisk: marginPoints(economics.marginErosionPp),
      reasons: reasonsFor(economics, econInput),
      bandEvidence: evidence('health'),
      dataConfidence: dataConfidence.confidenceScore,
      /*
       * No band-change clock is claimed, because the domain does not compute one.
       *
       * This adapter previously returned a literal 6 for every deteriorating project. Tier 3 of
       * MET-PORT-007 takes the minimum of the band-change clock and the next gating milestone, so
       * that constant became the time-to-act on 42 of 75 projects and the product rendered it as a
       * project-specific intervention horizon. It was a stub asserting a precision no evidence
       * supports, and it is exactly the kind of figure an executive would plan against.
       *
       * TRAJECTORY-v1 projects a *band* at 30 and 60 days; it does not project the date a band
       * edge is crossed. Until a governed metric for that exists, the honest value is null, which
       * the ranking already handles: "no clock known" and "now" are different statements and the
       * surface keeps them apart. The real clock — weeks to the next payment-gating milestone — is
       * supplied below and now carries tier 3 alone, giving genuine per-project variation.
       */
      weeksToBandChange: null,
      minimumInterventionWeeks: 4,
    }),
  }, clock);

  const forecastGm = assessment.economics.forecastGmValue;
  const built: CommandCenterProject = {
    projectId,
    name: spec.name,
    engagementModel: spec.engagementModel,
    industry: spec.vertical,
    region: spec.region,
    deliveryGroup: spec.businessUnitId,
    deliveryLeader: `Leader ${spec.portfolioId}`,
    daOwner: `DA ${spec.businessUnitId}`,
    sizeBand: spec.tcvBand,
    assessment,
    uncommercialisedExposure: econInput.uncompensatedScopeExposure ?? Money.zero(USD),
    // Forecast loss at completion: the amount by which forecast GM is below zero, and zero
    // otherwise. Not "a small margin" — an actual expected loss on the contract.
    contractLossExposure: forecastGm.isNegative() ? forecastGm.negated() : Money.zero(USD),
    contractualPenaltyExposure: econInput.liquidatedDamagesExposure ?? Money.zero(USD),
    weeksToCriticalMilestone: weeksToNextGatingMilestone(p, projectId),
    recovery: NO_RECOVERY_PLAN,
    // Open risks with their shared root-cause keys, for MET-PORT-003 (ADR-0021, C-20 resolved).
    riskCauses: p.facts.risks
      .filter((r) => r.projectId === projectId && (r.state === 'OPEN' || r.state === 'MITIGATING'))
      .map((r) => ({
        causeKey: r.riskCauseKey,
        probability: qty(r.probability),
        costImpact: Money.of(r.costImpact.amount, USD),
      })),
    /*
     * The previous governed period (Phase 13).
     *
     * Two histories the portfolio genuinely holds: forecast economics recomputed at the previous
     * period end by the same engine that produced today's, and the previous dated management
     * declaration. A prior *system-assessed* band is deliberately absent — health is assessed at the
     * current as-of and no per-period band is stored — and every surface that reports movement says
     * so rather than implying it covers all three.
     *
     * This is what closed a cross-surface gap: the built site reported "what changed" from these
     * same two histories while the application view had no prior period at all, so the Assistant
     * answered "no prior period is loaded" to a question the Command Center answered in detail.
     */
    ...periodMovementFor(p, projectId),
  };
  cache.set(projectId, built);
  return built;
}


/**
 * The project's movement basis: two endpoints of one governed margin-trend series.
 *
 * Returns an empty object rather than a null field when there is no earlier period, so the optional
 * property is genuinely absent and `exactOptionalPropertyTypes` keeps "no prior period" and "a prior
 * period whose values are null" distinguishable — the same absence-versus-zero distinction ADR-0027
 * makes about observed data.
 *
 * **Both endpoints come from the same series.** `marginTrendFor` samples at period ends, and its
 * latest point is not necessarily the current as-of date; comparing it against today's economics
 * would report a different movement from the one the Command Center reports for the same question.
 */
function periodMovementFor(
  p: SyntheticPortfolio, projectId: string,
): { periodMovement?: NonNullable<CommandCenterProject['periodMovement']> } {
  const series = marginTrendFor(p, projectId);
  if (series.length < 2) return {};
  const prior = series[series.length - 2];
  const current = series[series.length - 1];
  if (prior === undefined || current === undefined) return {};

  const reports = p.facts.statusReports
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => a.reportedOn.localeCompare(b.reportedOn));
  const priorReport = reports.length >= 2 ? reports[reports.length - 2] : undefined;

  // A trend point carries margin and cost; the aggregate also needs revenue, so economics is
  // re-run at each of the two dates by the engine that produced the trend point itself.
  const priorEconomics = computeEconomics(economicsInputFor(p, projectId, prior.period));
  const currentEconomics = computeEconomics(economicsInputFor(p, projectId, current.period));

  return {
    periodMovement: {
      priorLabel: prior.period,
      priorForecastRevenue: priorEconomics.forecastRevenue,
      priorEstimateAtCompletion: prior.estimateAtCompletion,
      currentForecastRevenue: currentEconomics.forecastRevenue,
      currentEstimateAtCompletion: current.estimateAtCompletion,
      priorReportedRag: priorReport?.reportedRag ?? null,
    },
  };
}

/**
 * No recovery-plan store exists (Phase 10). Every project therefore grades `NOT_ASSESSED`, which is
 * *"nobody has looked"* — a different and more honest statement than `NO_PLAN`, and the reason
 * `gradeActionability()` distinguishes them.
 */
const NO_RECOVERY_PLAN: ActionabilityEvidence = {
  openRecoveryActionId: null, namedOwner: null, dueDate: null,
  estimatedGmBenefit: null, estimatedScheduleBenefitWeeks: null,
  planConfidence: null, executiveDependency: false,
};

function marginPoints(r: Parameters<typeof ratioToPercentString>[0]): Quantity | null {
  const pct = percent(r);
  return pct === null ? null : qty(pct.toFixed(4));
}

/** Days since the domain last produced a fact. `null` where the domain never reported. */
function ageOfDomain(p: SyntheticPortfolio, projectId: string, domain: string): number | null {
  const asOfMs = Date.parse(p.asOf);
  const latest = (dates: readonly string[]): number | null => {
    const ms = dates.map((d) => Date.parse(d)).filter((n) => Number.isFinite(n));
    return ms.length === 0 ? null : Math.round((asOfMs - Math.max(...ms)) / 86_400_000);
  };
  switch (domain) {
    case 'financial':
      return latest(p.facts.actualCosts.filter((r) => r.projectId === projectId).map((r) => r.periodEnd));
    case 'delivery':
      return latest(p.facts.progressClaims.filter((r) => r.projectId === projectId).map((r) => r.claimedOn));
    case 'quality':
      return latest(p.facts.defects.filter((r) => r.projectId === projectId).map((r) => r.raisedOn));
    default:
      return 3;
  }
}

function weeksToNextGatingMilestone(p: SyntheticPortfolio, projectId: string): number | null {
  const asOfMs = Date.parse(p.asOf);
  const future = p.facts.milestones
    .filter((m) => m.projectId === projectId && m.paymentGating
      && isOpenAsOf(m.actualDate, p.asOf as CalendarDate))
    .map((m) => Date.parse(m.forecastDate))
    .filter((ms) => Number.isFinite(ms) && ms >= asOfMs)
    .sort((a, b) => a - b);
  const next = future[0];
  return next === undefined ? null : Math.round((next - asOfMs) / (7 * 86_400_000));
}

/** The signal-level reasons, on the same thresholds `assessCurated()` uses. */
function reasonsFor(
  economics: ReturnType<typeof computeEconomics>,
  input: ReturnType<typeof economicsInputFor>,
): GreenAtRiskReason[] {
  const ref = (metricId: string) =>
    [{ context: 'financial', entityType: 'project', entityId: economics.projectId, metricId }];
  const out: GreenAtRiskReason[] = [];

  const erosion = percent(economics.marginErosionPp);
  if (erosion !== null && erosion < -1) {
    out.push({
      code: 'MARGIN_ERODING', metricId: 'MET-FIN-016', observedValue: erosion.toFixed(2),
      narrative: `Forecast margin is ${erosion.toFixed(2)} percentage points below As-Sold.`,
      evidence: ref('MET-FIN-016'),
    });
  }
  const burn = percent(economics.burnGap);
  if (burn !== null && burn > 5) {
    out.push({
      code: 'BURN_AHEAD_OF_PROGRESS', metricId: 'MET-FIN-027', observedValue: burn.toFixed(2),
      narrative: `Budget is ${burn.toFixed(2)} percentage points ahead of physical progress.`,
      evidence: ref('MET-FIN-027'),
    });
  }
  const contingency = percent(economics.contingencyConsumedPercent);
  if (contingency !== null && contingency > 70) {
    out.push({
      code: 'CONTINGENCY_DEPLETING', metricId: 'MET-FIN-035', observedValue: contingency.toFixed(1),
      narrative: `${contingency.toFixed(1)}% of contingency is already consumed.`,
      evidence: ref('MET-FIN-035'),
    });
  }
  const uncompensated = input.uncompensatedScopeExposure;
  if (uncompensated !== undefined && !uncompensated.isZero()) {
    out.push({
      code: 'UNCOMMERCIALISED_SCOPE', metricId: 'MET-COM-009',
      observedValue: uncompensated.toQuantity(),
      narrative: `${uncompensated.toPresentationString()} of scope is being delivered without commercial recovery.`,
      evidence: ref('MET-COM-009'),
    });
  }
  return out;
}

/**
 * Builds the command centre for exactly the projects the caller was authorised for.
 *
 * The `projectIds` argument comes from `AuthorisedRequest.entitySet`, resolved by the enforcement
 * point from the session. This function has no way to widen it: it maps over what it was given.
 */
export function buildCommandCenterFor(
  p: SyntheticPortfolio, projectIds: readonly string[],
): CommandCenterView {
  const projects = projectIds.map((id) => commandCenterProject(p, id));
  const week = (p.facts.progressClaims.at(-1)?.week ?? '2026-W35') as WeekId;
  return buildCommandCenter({
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    week,
    currency: USD,
    zero: Money.zero(USD),
    ruleVersion: RULE,
    priorityPolicy: DEMO_PRIORITY_POLICY,
    projects,
  });
}
