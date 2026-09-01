/**
 * Versioned rule sets — where calibration lives once a metric has been frozen.
 *
 * Phase 2 closure, Decision 8. A metric's *meaning* and its *thresholds* are different artifacts
 * with different owners and different change cadences. Freezing the first while leaving the second
 * configurable is what lets Phase 3 and Phase 4 proceed against a settled semantic contract while
 * Delivery leadership is still arguing about where Amber starts.
 *
 * A parameter with `blockedBy` set has **no value yet**. That is deliberate and visible: the
 * parameter exists, is named, has an owner, and is known to be undecided. `value: null` is not the
 * same as `value: 0`, and the schema enforces that one of the two must be present
 * (`migrations/0007`, `rules.rule_parameter`).
 */
import { calendarDate } from '@platform/time';
import { ruleVersion } from '@platform/provenance';
import type { HealthModelVersion, RuleDefinition } from '../index.js';

const EFFECTIVE = calendarDate('2026-08-31');

/** Named so an unresolved value can be traced back to the register that owns it. */
type Blocker = 'MC-2' | 'MC-3' | 'MC-5' | 'MC-6' | 'OQ-1' | 'POLICY' | 'C-7' | 'C-9';

const open = (name: string, unit: string, blockedBy: Blocker, owner: string) =>
  ({ name, unit, blockedBy: `${blockedBy} — owner: ${owner}` }) as const;

const set = (name: string, value: string, unit: string) => ({ name, value, unit }) as const;

export const RULE_SETS: readonly RuleDefinition[] = [
  {
    id: 'HEALTH', version: ruleVersion('HEALTH-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Dimension normalisation edges, dimension weights, RAG band thresholds and the critical-breach ' +
      'triggers behind MET-HLTH-001…006, 010, 011, 013 and 032. The mechanism these parameterise is ' +
      'frozen; these values are not.',
    parameters: [
      open('redThreshold', 'score 0-100', 'MC-3', 'Rules + Delivery leadership'),
      open('amberThreshold', 'score 0-100', 'MC-3', 'Rules + Delivery leadership'),
      open('criticalBreachTriggers', 'list of metric conditions', 'MC-3', 'Rules + Delivery leadership'),
      open('neutralBaseline', 'score 0-100', 'MC-3', 'Rules + Delivery leadership'),
      open('dimensionWeight.FINANCIAL', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      open('dimensionWeight.SCHEDULE', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      open('dimensionWeight.SCOPE_COMMERCIAL', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      open('dimensionWeight.QUALITY', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      open('dimensionWeight.RESOURCE', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      open('dimensionWeight.RISK', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
      // Per-input normalisation edges. One green/red/weight triple per contributing metric.
      open('*.greenEdge', 'metric-native unit', 'MC-3', 'Rules + Delivery leadership'),
      open('*.redEdge', 'metric-native unit', 'MC-3', 'Rules + Delivery leadership'),
      open('*.weight', 'ratio', 'MC-2', 'Sponsor / Delivery leadership'),
    ],
  },
  {
    id: 'HEALTH', version: ruleVersion('HEALTH-v2'), effectiveFrom: EFFECTIVE,
    description:
      'The four-dimension **executive** health model behind MET-HLTH-020…024 (CONFLICT C-7, ' +
      'ADR-0015). Registered alongside HEALTH-v1, not in place of it: which model the organisation ' +
      'is accountable to is an ADR decision, not a configuration one. The four dimension weights are ' +
      'stated because Phase 4 direction states them; every normalisation edge remains open, because ' +
      'nobody has said where Green starts.',
    parameters: [
      set('dimensionWeight.FINANCIAL', '0.40', 'ratio'),
      set('dimensionWeight.DELIVERY', '0.25', 'ratio'),
      set('dimensionWeight.SCOPE_COMMERCIAL', '0.20', 'ratio'),
      set('dimensionWeight.PRODUCT_QUALITY', '0.15', 'ratio'),
      // **SYNTHETIC CALIBRATION CANDIDATES — NOT APPROVED PRODUCTION POLICY.** Band floors are
      // needed for the engine to produce anything at all; they are labelled and versioned so that
      // replacing them is a recorded act rather than an edit.
      set('greenFloor', '70', 'score 0-100 — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      set('amberFloor', '45', 'score 0-100 — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      open('*.greenEdge', 'metric-native unit', 'C-7', 'Rules + Delivery leadership'),
      open('*.redEdge', 'metric-native unit', 'C-7', 'Rules + Delivery leadership'),
      open('*.weight', 'ratio', 'C-7', 'Rules + Delivery leadership'),
    ],
  },
  {
    id: 'RECOVERY', version: ruleVersion('RECOVERY-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Recovery-case economics and plan credibility behind MET-REC-001…003. Thresholds live here, ' +
      'never in a component: a discount rate embedded in React is a formula nobody can version.',
    parameters: [
      // Type C — organisation policy with a stated default, so the engine is computable today.
      set('overdueDiscount', '0.50', 'ratio applied to the confidence of an overdue open action'),
      set('confidenceFloor', '0.10', 'ratio below which an action banks nothing'),
      set('ownershipWeight', '0.40', 'ratio'),
      set('timelinessWeight', '0.30', 'ratio'),
      set('completionWeight', '0.30', 'ratio'),
      // Which actions cancel each other out is a delivery judgement about the work, not a number.
      open('incompatibleActionGroups', 'named groups of mutually exclusive actions', 'POLICY', 'Delivery leadership'),
    ],
  },
  {
    id: 'TRAJECTORY', version: ruleVersion('TRAJECTORY-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Trajectory window, deterioration threshold, projection bounds and the Silent Deterioration ' +
      'Index weights behind MET-FCST-001…007, 010 and MET-PORT-006.',
    parameters: [
      // The one parameter here that is already settled: ADR-0003 fixes the snapshot cadence, and
      // METRIC_CATALOG defines the trailing window as 8 weekly snapshots.
      // Renamed from `trajectoryWindowWeeks` in the Phase 3 correction pass (Correction 2). The old
      // name invited reading 8 weeks as *the* business definition of trajectory. It is not: it is the
      // window for one signal that genuinely moves weekly. Signal-specific policies live in
      // TRAJECTORY_OBSERVATION_POLICIES; this remains only as the default for weekly-cadence signals.
      set('defaultWeeklySignalWindowWeeks', '8', 'weeks'),
      // **SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY.**
      //
      // Measured against the MC-6 eligible cohort, which is derived from explicit rules in
      // `scripts/generator/cohorts.ts` (MC6_ELIGIBILITY): fixed-price only, excluding mobilisation
      // and closed-out projects, excluding the hand-solved curated scenarios, and requiring at
      // least 12 weekly progress claims. That yields **54 of 91** engagements — not the 81 reported
      // before the rules were written down, which had silently included T&M, capacity and curated
      // projects (Phase 3 correction, Correction 5).
      //
      // Distribution across the 54: p05 −1.77, p10 −1.47, p25 −0.83, p50 −0.49, p75 −0.30,
      // p90 −0.24 percentage points per week. −1.40 sits just inside the tenth percentile, flagging
      // roughly the worst tenth — few enough for a CDO to act on in a week (AC-1).
      //
      // A synthetic distribution can test reasonableness and behaviour. It cannot establish an
      // empirical real-world threshold. Production calibration requires business ownership and/or
      // real historical evidence before this value is used for anything that matters.
      set('marginDeteriorationSlopeThreshold', '-1.40', 'percentage points per week — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      // **Still open, and not for want of data.** MET-FCST-001 is the slope of MET-HLTH-010, and
      // the composite health score cannot be computed until the HEALTH-v1 weights (MC-2) and band
      // edges (MC-3) exist. Calibrating a slope of a score that has no definition yet would be
      // inventing the score. Recalibrate here once MC-2 and MC-3 land.
      open('deteriorationSlopeThreshold', 'health score points per week', 'MC-6', 'Blocked on MC-2/MC-3, not on data — recalibrate in Phase 4'),
      open('outturnFloor', 'percent', 'MC-6', 'Finance'),
      open('outturnCeiling', 'percent', 'MC-6', 'Finance'),
      open('interventionLeadTimeWeeks', 'weeks', 'MC-6', 'Delivery leadership'),
      // The SDI weights combine a health slope, a divergence and a confluence count — all three
      // depend on MET-HLTH-010, so they inherit the same block as deteriorationSlopeThreshold.
      open('slopeWeight', 'ratio', 'MC-6', 'Blocked on MC-2/MC-3 — recalibrate in Phase 4'),
      open('divergenceWeight', 'ratio', 'MC-6', 'Blocked on MC-2/MC-3 — recalibrate in Phase 4'),
      open('persistenceWeight', 'ratio', 'MC-6', 'Blocked on MC-2/MC-3 — recalibrate in Phase 4'),
      open('confluenceWeight', 'ratio', 'MC-6', 'Blocked on MC-2/MC-3 — recalibrate in Phase 4'),
      open('slopeScale', 'health score points per week', 'MC-6', 'Blocked on MC-2/MC-3 — recalibrate in Phase 4'),
      // SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY. Divergence persistence
      // needs no health weights; across the generated portfolio the silent-deteriorator archetypes
      // hold a positive divergence for 6-14 weeks, so 6 is where a run stops being noise. Same
      // caveat: synthetic evidence tests behaviour, it does not establish production policy.
      set('persistenceScale', '6', 'weeks — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      // Phase 4 additions. Confluence and the outlook step rate are the two values that decide
      // whether a project is "deteriorating" or "rapidly deteriorating", so they are named,
      // versioned and owned rather than living as constants in the engine.
      set('rapidConfluenceThreshold', '3', 'count of materially adverse signals — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      set('materialAdverseSlope', '0.01', 'signal-native units per period — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
      set('stepsPerHorizon.RAPIDLY_DETERIORATING', '1', 'band steps per 30-day horizon — SYNTHETIC CANDIDATE'),
      set('stepsPerHorizon.DETERIORATING', '0.5', 'band steps per 30-day horizon — SYNTHETIC CANDIDATE'),
      set('minimumInterventionWeeks', '4', 'weeks — SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY'),
    ],
  },
  {
    id: 'EAC', version: ruleVersion('EAC-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Applicability gates for the Performance-Implied EAC diagnostic (MET-FIN-029) and the ETC ' +
      'Optimism Gap that inherits them (MET-FIN-030).',
    parameters: [
      // Type C — organisation policy, not a semantic gap. A default is stated so the metric is
      // computable today; it stays configurable and carries a named owner.
      set('maturityThresholdCompletion', '0.20', 'ratio 0-1'),
      set('progressMeasureCredibilityRequired', 'true', 'boolean'),
    ],
  },
  {
    id: 'VAR', version: ruleVersion('VAR-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Risk-adjusted economics. MC-4 was resolved in Phase 2 by the authoritative formulas, so this ' +
      'set carries no open parameters — risk probabilities and the IncludedInETC flag are per-record ' +
      'data, not calibration.',
    parameters: [],
  },
  {
    id: 'DQ', version: ruleVersion('DQ-v1'), effectiveFrom: EFFECTIVE,
    description: 'Data-confidence and forecast-confidence weights and band floors.',
    parameters: [
      open('completenessWeight', 'ratio', 'POLICY', 'Assurance'),
      open('freshnessWeight', 'ratio', 'POLICY', 'Assurance'),
      open('consistencyWeight', 'ratio', 'POLICY', 'Assurance'),
      open('coverageWeight', 'ratio', 'POLICY', 'Assurance'),
      open('highBandFloor', 'score 0-100', 'POLICY', 'Assurance'),
      open('mediumBandFloor', 'score 0-100', 'POLICY', 'Assurance'),
      open('replanWeight', 'ratio', 'POLICY', 'Assurance'),
      open('optimismWeight', 'ratio', 'POLICY', 'Assurance'),
      open('stabilityWeight', 'ratio', 'POLICY', 'Assurance'),
      // Phase 4: MET-DQ-008 validity joins the data-confidence composite, and freshness needs a
      // stated decay or "stale" is a word rather than a number.
      open('validityWeight', 'ratio', 'POLICY', 'Assurance'),
      open('stalenessRedMultiple', 'multiple of the expected cadence at which freshness scores zero', 'POLICY', 'Assurance'),
      // MET-DQ-009 — the seven forecast-reliability factors (CONFLICT C-9, ADR-0015). Each needs a
      // green and a red edge; none has been set, because nobody has said what a believable ETC age is.
      open('etcFreshnessGreenEdge', 'days', 'C-9', 'Assurance + Finance'),
      open('etcFreshnessRedEdge', 'days', 'C-9', 'Assurance + Finance'),
      open('etcCoverageGreenEdge', 'ratio', 'C-9', 'Assurance + Finance'),
      open('etcCoverageRedEdge', 'ratio', 'C-9', 'Assurance + Finance'),
      open('scopeStabilityGreenEdge', 'ratio', 'C-9', 'Commercial'),
      open('scopeStabilityRedEdge', 'ratio', 'C-9', 'Commercial'),
      open('milestoneAccuracyGreenEdge', 'ratio', 'C-9', 'Delivery'),
      open('milestoneAccuracyRedEdge', 'ratio', 'C-9', 'Delivery'),
      open('dependencyGreenEdge', 'days of ageing', 'C-9', 'Delivery'),
      open('dependencyRedEdge', 'days of ageing', 'C-9', 'Delivery'),
      open('resourceStabilityGreenEdge', 'ratio', 'C-9', 'People'),
      open('resourceStabilityRedEdge', 'ratio', 'C-9', 'People'),
      open('requiredProductivityGreenEdge', 'percent uplift', 'C-9', 'Delivery'),
      open('requiredProductivityRedEdge', 'percent uplift', 'C-9', 'Delivery'),
    ],
  },
  {
    id: 'PRIORITY', version: ruleVersion('PRIORITY-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Executive intervention ranking (MET-PORT-007). **MC-5 is resolved — ADR-0019.** The ordering ' +
      'is lexicographic over seven declared tiers rather than a weighted composite, so a hard risk ' +
      'cannot be averaged away and every adjacent pair can state the one tier that separated them. ' +
      'The two parameters below are ordinary calibration values, not the semantic gap that blocked ' +
      'this metric: what was missing was a definition, and the definition now exists.',
    parameters: [
      set('criticalGmValueAtRiskFloor', '250000.00', 'reporting currency — a RED project at or above this counts as tier-1 critical exposure'),
      set('immediateHorizonWeeks', '4', 'weeks at or below which time criticality is treated as immediate'),
    ],
  },
  {
    id: 'RECOGNITION', version: ruleVersion('RECOGNITION-v1'), effectiveFrom: EFFECTIVE,
    description:
      'Synthetic accounting recognition policy — **POC only**. Phase 2 closure Decision 1 makes ' +
      'Recognised Revenue an authoritative Finance fact that Delivery Intelligence consumes. In ' +
      'production this rule set does not exist: Finance/ERP supplies the figure. For the synthetic ' +
      'POC the generator produces the fact using this documented policy, and stores it as an ' +
      'accounting fact, never as a Delivery Intelligence calculation.',
    parameters: [
      set('syntheticPolicy', 'PERCENT_COMPLETE_COST_TO_COST', 'policy identifier'),
      set('appliesTo', 'SYNTHETIC_DATA_ONLY', 'scope'),
    ],
  },
];

/**
 * The health weighting model, versioned separately from the thresholds.
 *
 * Weights and band edges change on different cadences and by different authority — recalibrating a
 * threshold is an operational act, reweighting the dimensions is a governance one — so they are
 * separate versioned artifacts even though both are `HEALTH-v1` today.
 */
export const HEALTH_MODEL_VERSIONS: readonly HealthModelVersion[] = [
  {
    version: ruleVersion('HEALTH-v1'),
    effectiveFrom: EFFECTIVE,
    dimensionWeights: [
      { dimension: 'FINANCIAL', weight: 'UNSET' },
      { dimension: 'SCHEDULE', weight: 'UNSET' },
      { dimension: 'SCOPE_COMMERCIAL', weight: 'UNSET' },
      { dimension: 'QUALITY', weight: 'UNSET' },
      { dimension: 'RESOURCE', weight: 'UNSET' },
      { dimension: 'RISK', weight: 'UNSET' },
    ],
    blockedBy: 'OQ-4 / MC-2 — owner: Sponsor / Delivery leadership',
  },
];

/** Every parameter that still has no value, with the register item and owner that must supply it. */
export function openCalibration(): readonly { ruleSet: string; parameter: string; blockedBy: string }[] {
  return RULE_SETS.flatMap((rs) =>
    rs.parameters
      .filter((p) => p.value === undefined)
      .map((p) => ({ ruleSet: `${rs.id}-${rs.version}`, parameter: p.name, blockedBy: p.blockedBy ?? 'unknown' })),
  );
}
