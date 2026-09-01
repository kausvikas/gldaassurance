/**
 * Scenario archetypes and their causal drivers.
 *
 * `SYNTHETIC_DATA_SPEC.md` G2: "Symptoms are *generated from* causes. A project with eroding margin
 * has the effort overruns, rate drift, or rework hours that produce that erosion — arithmetically,
 * not narratively."
 *
 * So an archetype does **not** say "margin falls to 14%". It sets *drivers* — productivity, scope
 * arrival, defect injection, rate drift, dependency blocking, change-request behaviour — and the
 * weekly simulation lets margin fall out of them. `SYNTHETIC_DATA_SPEC.md` §9.7 names the failure
 * this avoids: a project labelled "deteriorating" whose underlying series does not deteriorate.
 *
 * Twelve archetypes: the ten approved in Phase 0 plus `ETC_OPTIMISM` and `CONTRACT_LOSS_RISK`,
 * added by ADR-0013 §6.
 */

export type ArchetypeId =
  | 'SILENT_DETERIORATOR'
  | 'UNCOMPENSATED_SCOPE'
  | 'PYRAMID_EROSION'
  | 'QUALITY_SPIRAL'
  | 'RECOVERING_RED'
  | 'HEALTHY_REFERENCE'
  | 'LOW_CONFIDENCE'
  | 'OVERRIDE_CONFLICT'
  | 'FX_EXPOSED'
  | 'SCHEDULE_SLIP_HONEST'
  | 'ETC_OPTIMISM'
  | 'CONTRACT_LOSS_RISK';

/**
 * The causal levers. Every one is a *cause*; nothing here is an outcome.
 *
 * All are multipliers or per-week rates applied during simulation, with seeded jitter, so two
 * projects of the same archetype differ without either drifting off-narrative.
 */
export interface ArchetypeDrivers {
  /** Effort actually needed per unit of planned progress. >1 means work is costing more than sold. */
  readonly productivityDrag: number;
  /** Weekly drift added to productivityDrag — the difference between a bad project and a worsening one. */
  readonly productivityDragPerWeek: number;
  /** Uncontracted scope arriving per week, as a fraction of original contracted scope. */
  readonly scopeCreepPerWeek: number;
  /** Probability that arriving scope becomes an *executed* change rather than absorbed cost. */
  readonly scopeCommercialisationRate: number;
  /** Defects injected per 100 hours of delivery effort. */
  readonly defectInjectionPer100h: number;
  /** Hours of rework per open major/critical defect per week. */
  readonly reworkHoursPerDefectWeek: number;
  /** Blended cost rate drift vs as-sold, per week. */
  readonly rateDriftPerWeek: number;
  /** Weekly probability that a customer dependency blocks part of the team. */
  readonly dependencyBlockChance: number;
  /** How optimistic the ETC revision is: 1.0 honest, <1 understates remaining cost. */
  readonly etcOptimism: number;
  /** How optimistic the reported RAG is relative to the evidence. 0 honest, 2 reports Green when Red. */
  readonly reportedRagOptimism: number;
  /** Weekly contingency drawdown as a fraction of the contingency budget, once overrunning. */
  readonly contingencyDrawPerWeek: number;
  /** Weekly probability a data field is left unpopulated or an update is skipped (G7). */
  readonly reportingGapChance: number;
  /** Recovery interventions land from this week index onward, reversing the drag. */
  readonly recoveryFromWeek?: number;
}

export interface Archetype {
  readonly id: ArchetypeId;
  /** Minimum instances in the portfolio (`SYNTHETIC_DATA_SPEC.md` §5 counts are minimums). */
  readonly minCount: number;
  readonly narrative: string;
  readonly drivers: ArchetypeDrivers;
}

const baseline: ArchetypeDrivers = {
  productivityDrag: 1.0,
  productivityDragPerWeek: 0,
  scopeCreepPerWeek: 0.0004,
  scopeCommercialisationRate: 0.85,
  defectInjectionPer100h: 0.9,
  reworkHoursPerDefectWeek: 1.4,
  rateDriftPerWeek: 0,
  dependencyBlockChance: 0.04,
  etcOptimism: 1.0,
  reportedRagOptimism: 0,
  contingencyDrawPerWeek: 0.004,
  reportingGapChance: 0.05,
};

const d = (over: Partial<ArchetypeDrivers>): ArchetypeDrivers => ({ ...baseline, ...over });

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'HEALTHY_REFERENCE', minCount: 22,
    narrative:
      'Genuinely well run. Metrics near baseline, no divergence, high confidence. Without a credible ' +
      'healthy majority every signal looks like noise and the ranking proves nothing.',
    drivers: d({}),
  },
  {
    id: 'SILENT_DETERIORATOR', minCount: 6,
    narrative:
      'Reported Green throughout while the evidence drifts Green → Amber over roughly ten weeks. The ' +
      "product's entire claim (AC-2).",
    drivers: d({
      productivityDrag: 1.02, productivityDragPerWeek: 0.0055,
      defectInjectionPer100h: 1.35, reworkHoursPerDefectWeek: 2.1,
      scopeCreepPerWeek: 0.0011, scopeCommercialisationRate: 0.45,
      reportedRagOptimism: 1, contingencyDrawPerWeek: 0.011,
    }),
  },
  {
    id: 'UNCOMPENSATED_SCOPE', minCount: 5,
    narrative:
      'Client requests absorbed without change requests. Pending CRs raised late and ageing unexecuted, ' +
      'so unsecured upside is material and excluded from forecast revenue.',
    drivers: d({
      scopeCreepPerWeek: 0.0034, scopeCommercialisationRate: 0.12,
      productivityDrag: 1.01, productivityDragPerWeek: 0.0018, reportedRagOptimism: 1,
    }),
  },
  {
    id: 'PYRAMID_EROSION', minCount: 3,
    narrative:
      'Date pressure met by staffing seniors. Schedule green, margin red — the case that proves health ' +
      'cannot be one number.',
    drivers: d({ rateDriftPerWeek: 0.0021, productivityDrag: 0.97, reportedRagOptimism: 1 }),
  },
  {
    id: 'QUALITY_SPIRAL', minCount: 4,
    narrative:
      'Late-discovered quality debt consuming the remaining budget. Margin follows quality with roughly ' +
      'a six-week lag, visible in the trajectory series.',
    drivers: d({
      defectInjectionPer100h: 3.1, reworkHoursPerDefectWeek: 4.2,
      productivityDragPerWeek: 0.0035, etcOptimism: 0.94, reportedRagOptimism: 1,
    }),
  },
  {
    id: 'RECOVERING_RED', minCount: 4,
    narrative:
      'Declared Red months ago, under an active recovery plan, genuinely improving. Proves the product ' +
      'distinguishes improving Red from deteriorating Green.',
    drivers: d({
      productivityDrag: 1.19, productivityDragPerWeek: -0.0042, recoveryFromWeek: 34,
      defectInjectionPer100h: 1.9, reworkHoursPerDefectWeek: 2.4,
      scopeCommercialisationRate: 0.9, reportedRagOptimism: 0, contingencyDrawPerWeek: 0.013,
    }),
  },
  {
    id: 'ETC_OPTIMISM', minCount: 3,
    narrative:
      "Cost is running well ahead of delivered progress, but management's estimate to complete has not " +
      'moved to match. The gap between demonstrated performance and the stated forecast is the signal.',
    drivers: d({
      productivityDrag: 1.16, productivityDragPerWeek: 0.0022,
      etcOptimism: 0.72, reportedRagOptimism: 1, contingencyDrawPerWeek: 0.009,
    }),
  },
  {
    id: 'CONTRACT_LOSS_RISK', minCount: 2,
    narrative:
      'Margin nearly gone and negative once unresolved risk is counted. Missed payment-gating milestone, ' +
      'liquidated-damages exposure, acceptance blocked, and a remaining plan that assumes a productivity ' +
      'step-change nobody has demonstrated.',
    drivers: d({
      productivityDrag: 1.24, productivityDragPerWeek: 0.0048,
      defectInjectionPer100h: 2.6, reworkHoursPerDefectWeek: 3.4,
      scopeCreepPerWeek: 0.0022, scopeCommercialisationRate: 0.2,
      rateDriftPerWeek: 0.0012, dependencyBlockChance: 0.13,
      etcOptimism: 0.8, reportedRagOptimism: 0, contingencyDrawPerWeek: 0.02,
    }),
  },
  {
    id: 'LOW_CONFIDENCE', minCount: 4,
    narrative:
      'Reporting has degraded: stale updates, missing fields, absent quality data. Health computes, but ' +
      'confidence is Low. Escalates as a reporting failure, never hidden.',
    drivers: d({ reportingGapChance: 0.42, productivityDragPerWeek: 0.0012 }),
  },
  {
    id: 'OVERRIDE_CONFLICT', minCount: 2,
    narrative:
      'Evidence points Red; an authorised executive override holds the project Amber with a documented ' +
      'reason and an expiry. All three RAG values coexist, visibly.',
    drivers: d({
      productivityDrag: 1.15, productivityDragPerWeek: 0.0031,
      defectInjectionPer100h: 2.0, reportedRagOptimism: 1, contingencyDrawPerWeek: 0.014,
    }),
  },
  {
    id: 'FX_EXPOSED', minCount: 3,
    narrative:
      'Non-USD contract with local-currency delivery cost. Exchange movement contributes measurably to ' +
      'margin variance and appears as its own named cause — a cause the delivery team did not create.',
    drivers: d({ productivityDrag: 1.02, reportedRagOptimism: 0 }),
  },
  {
    id: 'SCHEDULE_SLIP_HONEST', minCount: 3,
    narrative:
      'Genuine slip, well managed, transparently reported. Reported Amber, evidence Amber, divergence ' +
      'zero. The control case: a system that penalises candour destroys the reporting it depends on.',
    drivers: d({
      productivityDrag: 1.08, dependencyBlockChance: 0.11,
      reportedRagOptimism: 0, scopeCommercialisationRate: 0.9,
    }),
  },
];

export const ARCHETYPE_BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

/**
 * Portfolio-level patterns — fictional systematic tendencies, present only to make the demo
 * interesting. **These are demo narratives and are never claims about actual delivery performance.**
 * Applied as a small nudge to drivers, not as an override of the archetype.
 */
export interface PortfolioPattern {
  readonly id: string;
  readonly appliesTo: (vertical: string, region: string) => boolean;
  readonly nudge: Partial<ArchetypeDrivers>;
  readonly narrative: string;
}

export const PORTFOLIO_PATTERNS: readonly PortfolioPattern[] = [
  {
    id: 'MOBILITY_SCOPE_PRESSURE',
    appliesTo: (v) => v === 'Mobility',
    nudge: { scopeCreepPerWeek: 0.0018, scopeCommercialisationRate: 0.55 },
    narrative: 'Mobility engagements tend to absorb late requirement changes without a change request.',
  },
  {
    id: 'NORTH_AMERICA_BLENDED_COST_PRESSURE',
    appliesTo: (_v, r) => r === 'North America',
    nudge: { rateDriftPerWeek: 0.0009 },
    narrative: 'North American delivery shows upward blended-cost drift against the as-sold rate card.',
  },
  {
    id: 'MEDIA_QUALITY_PRESSURE',
    appliesTo: (v) => v === 'Media & Entertainment',
    nudge: { defectInjectionPer100h: 1.8, reworkHoursPerDefectWeek: 2.6 },
    narrative: 'Media engagements carry higher rework from late content and integration churn.',
  },
  {
    id: 'FINANCIAL_SERVICES_ACCEPTANCE_LATENCY',
    appliesTo: (v) => v === 'Financial Services',
    nudge: { dependencyBlockChance: 0.12 },
    narrative: 'Financial Services clients take materially longer to formally accept deliverables.',
  },
];
