/**
 * Facts → `MarginIntelligenceInput` — **DEMO — SYNTHETIC DATA**.
 *
 * The Phase 9 adapter. Like its Phase 7 and 8 siblings it **shapes facts into engine inputs and owns
 * no arithmetic**: every figure it passes on was produced by a `contexts/*` engine, and where it
 * appears to compute — summing executed change deltas, counting risks — it is aggregating L1 records
 * into the L1 figures the surface reports as facts.
 *
 * ### The trend is the same engine, rewound
 *
 * `marginTrendFor` recomputes `MET-FIN-024`, `MET-FIN-032` and `MET-FIN-008` at each of the last
 * twelve reporting periods by calling `computeEconomics` with the fact set **cut at that date**. It
 * does not derive history with a cheaper second formula — a trend that ends somewhere other than the
 * figure printed above it is worse than no trend, because the disagreement is invisible until
 * someone checks.
 */
import { Money, type Quantity, qAdd, qty } from '@platform/decimal';
import { ruleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import type {
  MarginIntelligenceInput, MarginIntelligenceView, PortfolioDriversDto, RiskLine, TrendPoint,
} from '@app';
import { buildMarginIntelligence } from '@app';
import { buildMarginBridge, computeEconomics } from '@contexts/financial';
import { evaluateCommercial } from '@contexts/commercial';
import { evaluateQuality } from '@contexts/quality';
import { evaluateResource } from '@contexts/resource';
import { evaluateDelivery } from '@contexts/delivery';
import type { SyntheticPortfolio } from '../generator/index.js';
import {
  USD, commercialInputFor, deliveryInputFor, economicsInputFor, executedChangeMarginFor,
  qualityInputFor, resourceInputFor,
} from './curated-assessment.js';
import { commandCenterProject } from './command-center-adapter.js';

const RULE = ruleVersion('VAR-v1');

/** How many reporting periods the trend shows, and how often they are sampled. */
const TREND_PERIODS = 8;
const TREND_STRIDE = 4;

/** The margin bridge for one project, from the engines that own each cause. */
export function marginBridgeFor(p: SyntheticPortfolio, projectId: string) {
  const e = computeEconomics(economicsInputFor(p, projectId));
  const com = evaluateCommercial(commercialInputFor(p, projectId, e));
  const qua = evaluateQuality(qualityInputFor(p, projectId, e));
  const resInput = resourceInputFor(p, projectId, e);
  const res = evaluateResource(resInput);
  return {
    economics: e,
    commercial: com,
    quality: qua,
    resource: res,
    soldBlendedRate: resInput.soldBlendedRate,
    bridge: buildMarginBridge({
      projectId,
      asOf: `${p.asOf}T00:00:00.000Z` as Instant,
      currency: USD,
      soldGmValue: e.soldGmValue,
      forecastGmValue: e.forecastGmValue,
      marginValueDelta: e.marginValueDelta,
      riskAdjustedGmValue: e.riskAdjustedGmValue,
      uncompensatedScopeValue: com.uncompensatedScopeValue,
      effortVarianceHours: res.effortVarianceHours.value,
      soldBlendedRate: resInput.soldBlendedRate,
      resourceCostDriftImpact: res.resourceCostDriftImpact.value,
      excessReworkCost: qua.excessReworkCost.value,
      // Single-currency portfolio: MET-FIN-038 is structurally zero, not unmeasured.
      fxMarginImpact: null,
      executedChangeMargin: executedChangeMarginFor(p, projectId),
    }),
  };
}

/** `MET-FIN-024` / `MET-FIN-032` / `MET-FIN-008`, recomputed at each historical period end. */
export function marginTrendFor(p: SyntheticPortfolio, projectId: string): readonly TrendPoint[] {
  const dates = [...new Set(
    p.facts.progressClaims.filter((c) => c.projectId === projectId).map((c) => c.claimedOn),
  )].sort();
  const sampled = dates.filter((_, i) => i % TREND_STRIDE === 0).slice(-TREND_PERIODS);
  return sampled.map((date) => {
    const e = computeEconomics(economicsInputFor(p, projectId, date));
    return {
      period: date,
      forecastGm: e.forecastGmValue,
      riskAdjustedGm: e.riskAdjustedGmValue,
      estimateAtCompletion: e.estimateAtCompletion,
    };
  });
}

export function marginIntelligenceInputFor(
  p: SyntheticPortfolio, projectId: string,
): MarginIntelligenceInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`unknown project ${projectId}`);

  const parts = marginBridgeFor(p, projectId);
  const project = commandCenterProject(p, projectId);
  const delivery = evaluateDelivery(deliveryInputFor(p, projectId));
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);

  const risks: readonly RiskLine[] = mine(p.facts.risks)
    .filter((r) => r.state === 'OPEN' || r.state === 'MITIGATING')
    .map((r) => ({
      id: r.id,
      description: r.description,
      severity: r.severity,
      probability: qty(r.probability),
      costImpact: Money.of(r.costImpact.amount, USD),
      includedInEtc: r.includedInEtc,
      state: r.state,
    }));

  // Effort recorded as blocked by a customer dependency. The generator carries the field but never
  // populates it, so this is `null` on every project (DR-057) rather than a fabricated zero.
  const blocked = mine(p.facts.effort).filter((r) => r.blockedByDependencyId !== undefined);
  const blockedHours: Quantity | null = blocked.length === 0
    ? null
    : blocked.reduce((a, r) => qAdd(a, qty(r.hours)), qty('0'));

  return {
    asOf: `${p.asOf}T00:00:00.000Z` as Instant,
    week: (mine(p.facts.progressClaims).at(-1)?.week ?? '2026-W35') as WeekId,
    currency: USD,
    zero: Money.zero(USD),
    ruleVersion: RULE,
    projectId,
    projectName: spec.name,
    customerAlias: `Client ${spec.accountId.replace(/^acc-/, '').toUpperCase()}`,
    assessment: project.assessment,
    bridge: parts.bridge,
    commercial: parts.commercial,
    quality: parts.quality,
    resource: parts.resource,
    delivery,
    risks,
    contingencyBudget: Money.of(spec.contingencyBudget.toDto().amount, USD),
    contingencyConsumed: mine(p.facts.contingencyDrawdowns)
      .reduce((m, d) => m.plus(Money.of(d.amount.amount, USD)), Money.zero(USD)),
    trend: marginTrendFor(p, projectId),
    blockedHours,
    soldBlendedRate: parts.soldBlendedRate,
  };
}

/**
 * Driver ranking across an **authorised** set of projects.
 *
 * The caller supplies the project ids; this function has no way to widen them, which is what makes
 * "computed over the caller's scope" structural rather than a promise (ADR-0005 §5).
 */
export function portfolioDriversFor(
  p: SyntheticPortfolio, projectIds: readonly string[], scopeLabel: string,
): PortfolioDriversDto {
  const fixedBid = projectIds.filter(
    (id) => p.structure.projects.find((s) => s.projectId === id)?.engagementModel === 'FIXED_BID',
  );
  const nameOf = (id: string) => p.structure.projects.find((s) => s.projectId === id)?.name ?? id;

  const rows = fixedBid.map((id) => {
    const parts = marginBridgeFor(p, id);
    const e = parts.economics;
    return {
      id,
      name: nameOf(id),
      erosion: e.gmErosionValue,
      recoverable: e.expectedPendingCrRecovery,
      scopeLeakage: parts.commercial.uncompensatedScopeValue,
      resourceDrift: parts.resource.resourceCostDriftImpact.value,
    };
  });

  const top = <T>(
    source: readonly T[], amount: (x: T) => Money | null, basis: string,
  ) => source
    .flatMap((x) => {
      const m = amount(x);
      return m === null || m.isZero() ? [] : [{ x, m }];
    })
    .sort((a, b) => Number(b.m.toQuantity()) - Number(a.m.toQuantity()))
    .slice(0, 5)
    .map(({ x, m }) => ({
      projectId: (x as { id: string }).id,
      projectName: (x as { name: string }).name,
      amount: m.toPresentationString(),
      value: Number(m.toQuantity()),
      basis,
    }));

  return {
    scope: scopeLabel,
    projectCount: fixedBid.length,
    topMarginLoss: top(rows, (r) => r.erosion, 'MET-FIN-025 gross margin erosion'),
    topRecoverable: top(rows, (r) => r.recoverable, 'MET-COM-010 expected pending CR recovery — a scenario, never base revenue'),
    largestScopeLeakage: top(rows, (r) => r.scopeLeakage, 'MET-COM-009 delivered scope with no change request'),
    largestResourceDrift: top(rows, (r) => r.resourceDrift, 'MET-RES-010 blended rate drift across hours delivered'),
    evidence: {
      title: 'Portfolio driver ranking',
      metricId: 'MET-FIN-025',
      computedAt: `${p.asOf}T00:00:00.000Z`,
      lines: [
        { label: 'Scope', value: `${String(fixedBid.length)} fixed-bid projects in the caller's authorised set`, treatment: 'fact' },
        { label: 'Ranking basis', value: 'currency impact, descending (REQ-MRGN-002)' },
        { label: 'Excluded', value: 'projects outside the caller\'s authorised set are unreachable, not filtered' },
      ],
      sources: ['financial', 'commercial', 'resource'],
    },
  };
}

/** Builds the whole view for one project, with portfolio drivers over the authorised set. */
export function marginIntelligenceFor(
  p: SyntheticPortfolio, projectId: string, authorisedIds?: readonly string[],
): MarginIntelligenceView {
  return buildMarginIntelligence(
    marginIntelligenceInputFor(p, projectId),
    authorisedIds === undefined
      ? undefined
      : portfolioDriversFor(p, authorisedIds, 'Your authorised fixed-bid portfolio'),
  );
}
