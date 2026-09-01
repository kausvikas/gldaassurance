/**
 * The eight curated executive scenarios (A–H).
 *
 * The rest of the portfolio is generated forward from drivers. These eight are **solved backwards**:
 * the brief states target figures an executive should see, so the L1 facts are chosen to produce
 * exactly those figures when Phase 4 computes the metrics from them.
 *
 * That is still causal, and it is honest for the same reason: the facts are internally consistent
 * and the derived values fall out of them arithmetically. What differs is the direction of
 * construction. `SYNTHETIC_DATA_SPEC.md` §9.7 forbids the alternative — labelling a project
 * "deteriorating" while its underlying series does not deteriorate — and solving backwards is how
 * a stated target and a coherent series are made to agree rather than compete.
 *
 * Every target below is traceable to a line in the Phase 3 brief. The arithmetic that connects the
 * target to the emitted facts is written out beside each scenario, so a reviewer can check it
 * without running anything.
 */
import { Money } from '@platform/decimal';
import { addDays, compareDates, weekOf, type CalendarDate } from '@platform/time';
import type { ArchetypeId } from './archetypes.js';
import { emptyFacts, type ProjectFacts } from './facts.js';
import { buildBilling } from './billing.js';
import { AS_OF, type ProjectSpec } from './portfolio.js';
import { Rng, dec } from './rng.js';
import { applyCorrections, originalPosting } from './recognition.js';

/**
 * `A`-`H` are the eight curated executive scenarios from the Phase 3 brief.
 * `LR` is a diagnostic case added by the Phase 3 correction pass (Correction 11) — it is **not** a
 * ninth executive scenario and is excluded wherever "the eight" is asserted.
 */
export type ScenarioLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'LR';

/** The eight the brief specifies, for assertions that mean exactly those. */
export const EXECUTIVE_SCENARIO_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** One point on the project's history. Everything between checkpoints is interpolated. */
export interface Checkpoint {
  /** Weeks before the as-of date. 0 is the as-of week. */
  readonly weeksBefore: number;
  readonly physical: number;
  readonly planned: number;
  readonly costToDate: number;
  readonly etc: number;
  readonly committed: number;
  readonly contingencyConsumed: number;
  /** Cumulative executed change value in force at this point. */
  readonly executedValueDelta: number;
  readonly reportedRag: 'RED' | 'AMBER' | 'GREEN';
}

export interface CuratedScenario {
  readonly letter: ScenarioLetter;
  readonly archetype: ArchetypeId;
  readonly title: string;
  readonly vertical: string;
  readonly region: string;
  readonly subStage: 'MOBILIZATION' | 'EARLY_EXECUTION' | 'MID_PROJECT' | 'LATE_STAGE' | 'UAT_ACCEPTANCE' | 'CLOSED_OUT';
  readonly contractValue: number;
  readonly budgetedCost: number;
  readonly contingencyBudget: number;
  readonly reworkAllowance: number;
  readonly durationWeeks: number;
  /** How far through its duration the project is at the as-of date. Default 0.62. */
  readonly elapsedFraction?: number;
  readonly teamSize: number;
  readonly checkpoints: readonly Checkpoint[];
  /** Executed changes, if any. Only these move the contractual baseline, from their date forward. */
  readonly executedChanges: readonly { weeksBefore: number; value: number; cost: number }[];
  readonly pendingChanges: readonly { weeksBefore: number; value: number; probability: number }[];
  readonly uncontractedScopeValue: number;
  readonly reworkFraction: number;
  readonly blockingAcceptanceItems: number;
  readonly missedGatingMilestone: boolean;
  readonly liquidatedDamages?: number;
  /** Risks NOT provisioned in ETC, as (probability, impact) pairs. Drives MET-RSK-008 exactly. */
  readonly incrementalRisks: readonly { probability: number; impact: number }[];
  /**
   * Forward deterioration signals that do **not** depend on adverse cost burn (Correction 11).
   * Present so Phase 4 can be tested against the requirement that leading risk is detectable before
   * lagging cost/schedule status turns Red.
   */
  readonly leadingRiskSignals?: {
    /** Days the gating milestone is forecast to slip. Forecast only — not yet actual. */
    readonly gatingMilestoneForecastSlipDays: number;
    /** Unresolved customer dependencies, with ages in days. */
    readonly openCustomerDependencyAgesDays: readonly number[];
    /** Open critical risks accumulating in the register. */
    readonly openCriticalRisks: number;
    /** Contingency draw in the recent window vs the earlier one, to show acceleration. */
    readonly contingencyAccelerating: boolean;
  };
  readonly ragOverride?: { rag: 'AMBER'; reason: string };
  /** What the executive should see. Reproduced verbatim in `docs/SCENARIO_CATALOG.md`. */
  readonly executiveView: string;
  /** Independently stated expectations the validator recomputes and asserts. */
  readonly expect: {
    readonly soldGmPercent: number;
    readonly forecastGmPercent: number;
    readonly gmHistoryPercent?: readonly number[];
    readonly costConsumedPercent?: number;
    readonly contingencyConsumedPercent?: number;
    readonly physicalCompletion?: number;
    readonly plannedCompletion?: number;
    readonly performanceImpliedEac?: number;
    readonly etcOptimismGap?: number;
    readonly uncompensatedExposure?: number;
    readonly excessReworkCost?: number;
    readonly riskAdjustedGmPercent?: number;
    readonly incrementalRiskExposure?: number;
  };
}

const cp = (
  weeksBefore: number, physical: number, planned: number, costToDate: number,
  etc: number, committed: number, contingencyConsumed: number,
  executedValueDelta: number, reportedRag: 'RED' | 'AMBER' | 'GREEN',
): Checkpoint => ({ weeksBefore, physical, planned, costToDate, etc, committed, contingencyConsumed, executedValueDelta, reportedRag });

export const CURATED: readonly CuratedScenario[] = [
  // ---------------------------------------------------------------- A -------
  {
    letter: 'A', archetype: 'HEALTHY_REFERENCE', title: 'Healthy Green',
    vertical: 'Technology', region: 'Europe', subStage: 'MID_PROJECT',
    // Sold GM = (3,200,000 − 2,432,000) / 3,200,000 = 24.00%
    contractValue: 3_200_000, budgetedCost: 2_432_000, contingencyBudget: 160_000,
    reworkAllowance: 0.05, durationWeeks: 78, teamSize: 9,
    checkpoints: [
      cp(36, 0.30, 0.29, 700_000, 1_760_000, 20_000, 4_000, 0, 'GREEN'),
      cp(24, 0.41, 0.40, 970_000, 1_460_000, 40_000, 9_000, 0, 'GREEN'),
      cp(12, 0.52, 0.51, 1_220_000, 1_200_000, 55_000, 16_000, 0, 'GREEN'),
      // EAC = 1,470,000 + 950,000 + 60,000 = 2,480,000 → GM$ 720,000 → 22.50%
      cp(0, 0.62, 0.60, 1_470_000, 950_000, 60_000, 22_000, 0, 'GREEN'),
    ],
    executedChanges: [], pendingChanges: [], uncontractedScopeValue: 0,
    reworkFraction: 0.045, blockingAcceptanceItems: 0, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.2, impact: 40_000 }],
    executiveView:
      'Nothing to do. Progress is on plan, cost is tracking to it, margin has moved 1.5 points from ' +
      'as-sold and is stable. This project exists so the ranking has a credible baseline to rank ' +
      'against — without a healthy majority every signal looks like noise.',
    expect: { soldGmPercent: 0.24, forecastGmPercent: 0.225, physicalCompletion: 0.62, plannedCompletion: 0.60 },
  },
  // ---------------------------------------------------------------- B -------
  {
    letter: 'B', archetype: 'SILENT_DETERIORATOR', title: 'Green-at-Risk',
    vertical: 'Mobility', region: 'North America', subStage: 'MID_PROJECT',
    // Sold GM = (8,000,000 − 5,760,000) / 8,000,000 = 28.00%
    contractValue: 8_000_000, budgetedCost: 5_760_000, contingencyBudget: 400_000,
    reworkAllowance: 0.05, durationWeeks: 96, teamSize: 16,
    checkpoints: [
      // GM 27.5% → EAC = 8,000,000 × 0.725 = 5,800,000 = 2,900,000 + 2,830,000 + 70,000
      cp(30, 0.41, 0.44, 2_900_000, 2_830_000, 70_000, 96_000, 0, 'GREEN'),
      // GM 26.2% → EAC = 5,904,000 = 3,280,000 + 2_534_000 + 90,000
      cp(20, 0.47, 0.52, 3_280_000, 2_534_000, 90_000, 154_000, 0, 'GREEN'),
      // GM 24.7% → EAC = 6,024,000 = 3,660,000 + 2,254,000 + 110,000
      cp(10, 0.53, 0.59, 3_660_000, 2_254_000, 110_000, 220_000, 0, 'GREEN'),
      // GM 22.9% → EAC = 6,168,000 = 4,032,000 + 2,000,000 + 136,000
      // Cost consumed = 4,032,000 / 5,760,000 = 70.00%; contingency 288,000 / 400,000 = 72.00%
      cp(0, 0.58, 0.66, 4_032_000, 2_000_000, 136_000, 288_000, 0, 'GREEN'),
    ],
    executedChanges: [],
    pendingChanges: [
      { weeksBefore: 22, value: 140_000, probability: 0.5 },
      { weeksBefore: 9, value: 95_000, probability: 0.45 },
    ],
    uncontractedScopeValue: 90_000,
    reworkFraction: 0.09, blockingAcceptanceItems: 1, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.35, impact: 180_000 }, { probability: 0.25, impact: 120_000 }],
    executiveView:
      'The one to open first. Still reported Green and still above 20% margin, so nothing escalates — ' +
      'but the trend is unambiguous: 27.5 → 26.2 → 24.7 → 22.9 over four checkpoints. Progress is 8 ' +
      'points behind plan (58% vs 66%) while 70% of the cost budget and 72% of contingency are gone. ' +
      'Scope volatility is rising with $90K already delivered uncommercialised. There is still time to ' +
      'act; in ten weeks there will not be.',
    expect: {
      soldGmPercent: 0.28, forecastGmPercent: 0.229,
      gmHistoryPercent: [0.275, 0.262, 0.247, 0.229],
      costConsumedPercent: 0.70, contingencyConsumedPercent: 0.72,
      physicalCompletion: 0.58, plannedCompletion: 0.66, uncompensatedExposure: 90_000,
    },
  },
  // ---------------------------------------------------------------- C -------
  {
    letter: 'C', archetype: 'SILENT_DETERIORATOR', title: 'Reported Green, Evidence Amber',
    vertical: 'Financial Services', region: 'North America', subStage: 'MID_PROJECT',
    // Sold GM = (5,000,000 − 3,900,000) / 5,000,000 = 22.00%
    contractValue: 5_000_000, budgetedCost: 3_900_000, contingencyBudget: 250_000,
    reworkAllowance: 0.05, durationWeeks: 88, teamSize: 12,
    checkpoints: [
      cp(30, 0.26, 0.31, 1_290_000, 2_760_000, 50_000, 62_000, 0, 'GREEN'),
      cp(20, 0.33, 0.42, 1_710_000, 2_450_000, 60_000, 108_000, 0, 'GREEN'),
      cp(10, 0.41, 0.53, 2_140_000, 1_950_000, 70_000, 160_000, 0, 'GREEN'),
      // EAC = 2,520,000 + 1,600,000 + 80,000 = 4,200,000 → GM$ 800,000 → 16.00%
      // Erosion = 22.00 − 16.00 = 6.00 points. Contingency 205,000 / 250,000 = 82.00%
      cp(0, 0.48, 0.62, 2_520_000, 1_600_000, 80_000, 205_000, 0, 'GREEN'),
    ],
    executedChanges: [],
    pendingChanges: [{ weeksBefore: 14, value: 120_000, probability: 0.4 }],
    uncontractedScopeValue: 64_000,
    reworkFraction: 0.11, blockingAcceptanceItems: 3, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.4, impact: 150_000 }],
    executiveView:
      'The flagship divergence case (AC-2). Reported Green every week for the whole period, while the ' +
      'evidence has been Amber for most of it: six points of margin erosion, three upward ETC ' +
      'revisions, UAT slipped, 82% of contingency consumed at 48% completion. Nobody is lying — the ' +
      'reporting simply has not caught up with the arithmetic. The gap between the declaration and ' +
      'the evidence is the finding, and it is the single most valuable signal this product produces.',
    expect: {
      soldGmPercent: 0.22, forecastGmPercent: 0.16,
      contingencyConsumedPercent: 0.82, physicalCompletion: 0.48,
    },
  },
  // ---------------------------------------------------------------- D -------
  {
    letter: 'D', archetype: 'RECOVERING_RED', title: 'Amber Recovering',
    vertical: 'Industrial & Energy', region: 'Europe', subStage: 'LATE_STAGE',
    // Sold GM = (4,000,000 − 2,960,000) / 4,000,000 = 26.00%
    contractValue: 4_000_000, budgetedCost: 2_960_000, contingencyBudget: 200_000,
    reworkAllowance: 0.05, durationWeeks: 92, teamSize: 11,
    checkpoints: [
      // Trough. GM 16% on the original 4,000,000 → EAC = 3,360,000
      cp(40, 0.44, 0.55, 1_700_000, 1_600_000, 60_000, 150_000, 0, 'RED'),
      // CR executed (+600,000 value). FR = 4,600,000; GM 17% → EAC = 3,818,000
      cp(28, 0.55, 0.63, 2_040_000, 1_700_000, 78_000, 176_000, 600_000, 'AMBER'),
      // GM 18.5% → EAC = 4,600,000 × 0.815 = 3,749,000
      cp(14, 0.66, 0.72, 2_320_000, 1_349_000, 80_000, 190_000, 600_000, 'AMBER'),
      // GM 19.5% → EAC = 4,600,000 × 0.805 = 3,703,000 = 2,600,000 + 1,050,000 + 53,000
      cp(0, 0.77, 0.80, 2_600_000, 1_050_000, 53_000, 196_000, 600_000, 'AMBER'),
    ],
    executedChanges: [{ weeksBefore: 30, value: 600_000, cost: 420_000 }],
    pendingChanges: [],
    uncontractedScopeValue: 0,
    reworkFraction: 0.07, blockingAcceptanceItems: 0, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.15, impact: 90_000 }],
    executiveView:
      'Red four months ago, now genuinely improving: 26 → 16 → 17 → 18.5 → 19.5. A change request was ' +
      'executed, staffing was rebalanced away from the senior-heavy mix, and rework is falling. This ' +
      'is here to prove Red is not automatically the top of the list — an improving Red needs less of ' +
      'your week than a deteriorating Green.',
    expect: {
      soldGmPercent: 0.26, forecastGmPercent: 0.195,
      gmHistoryPercent: [0.16, 0.17, 0.185, 0.195], physicalCompletion: 0.77,
    },
  },
  // ---------------------------------------------------------------- E -------
  {
    letter: 'E', archetype: 'UNCOMPENSATED_SCOPE', title: 'Scope and Commercial Leakage',
    vertical: 'Retail & Consumer', region: 'LATAM', subStage: 'MID_PROJECT',
    // Sold GM = (2,400,000 − 1,824,000) / 2,400,000 = 24.00%
    contractValue: 2_400_000, budgetedCost: 1_824_000, contingencyBudget: 110_000,
    reworkAllowance: 0.05, durationWeeks: 70, teamSize: 8,
    checkpoints: [
      cp(30, 0.30, 0.32, 620_000, 1_310_000, 20_000, 14_000, 0, 'GREEN'),
      cp(20, 0.39, 0.43, 810_000, 1_170_000, 28_000, 26_000, 0, 'GREEN'),
      cp(10, 0.48, 0.53, 990_000, 1_000_000, 34_000, 38_000, 0, 'AMBER'),
      // EAC = 1,150,000 + 830,000 + 40,000 = 2,020,000 → GM$ 380,000 → 15.83%
      cp(0, 0.56, 0.62, 1_150_000, 830_000, 40_000, 48_000, 0, 'AMBER'),
    ],
    // **No executed change at all.** That is the scenario.
    executedChanges: [],
    pendingChanges: [
      { weeksBefore: 26, value: 120_000, probability: 0.35 },
      { weeksBefore: 17, value: 90_000, probability: 0.3 },
      { weeksBefore: 6, value: 70_000, probability: 0.25 },
    ],
    uncontractedScopeValue: 280_000,
    reworkFraction: 0.06, blockingAcceptanceItems: 0, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.3, impact: 110_000 }],
    executiveView:
      'Roughly 18% more work in the backlog than was contracted, and not one executed change request ' +
      'against it. $280K of scope has been delivered for free, and three CRs sit unexecuted — the ' +
      'oldest raised six months ago. The margin loss is real and already incurred; the recovery is ' +
      'commercial, not delivery, and it needs the account director this week rather than the delivery ' +
      'manager.',
    expect: {
      soldGmPercent: 0.24, forecastGmPercent: 0.1583, uncompensatedExposure: 280_000,
    },
  },
  // ---------------------------------------------------------------- F -------
  {
    letter: 'F', archetype: 'ETC_OPTIMISM', title: 'ETC Optimism',
    vertical: 'Communications', region: 'India/APAC', subStage: 'MID_PROJECT',
    // Sold GM = (3,600,000 − 2,700,000) / 3,600,000 = 25.00%
    contractValue: 3_600_000, budgetedCost: 2_700_000, contingencyBudget: 150_000,
    reworkAllowance: 0.05, durationWeeks: 80, teamSize: 10,
    checkpoints: [
      cp(30, 0.28, 0.33, 980_000, 1_760_000, 60_000, 30_000, 0, 'GREEN'),
      cp(20, 0.36, 0.42, 1_250_000, 1_500_000, 80_000, 52_000, 0, 'GREEN'),
      cp(10, 0.44, 0.51, 1_530_000, 1_240_000, 90_000, 74_000, 0, 'AMBER'),
      // Actual Cost 1,800,000; Management EAC = 1,800,000 + 1,000,000 + 100,000 = 2,900,000
      // Physical completion 0.52 → implied EAC = 1,800,000 / 0.52 = 3,461,538.46
      // Optimism gap = 3,461,538.46 − 2,900,000 = 561,538.46
      cp(0, 0.52, 0.60, 1_800_000, 1_000_000, 100_000, 96_000, 0, 'AMBER'),
    ],
    executedChanges: [], pendingChanges: [],
    uncontractedScopeValue: 0,
    reworkFraction: 0.08, blockingAcceptanceItems: 1, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.3, impact: 130_000 }],
    executiveView:
      'The forecast does not match the run rate. $1.8M spent for 52% delivered implies a $3.46M outturn; ' +
      "management's estimate says $2.9M. The $562K gap is not a disagreement about scope — it is the " +
      'same project measured two ways, and only one of the two has been demonstrated. Ask what changes ' +
      'in the remaining 48% to make the second half cheaper than the first.',
    expect: {
      soldGmPercent: 0.25, forecastGmPercent: 0.1944,
      physicalCompletion: 0.52, performanceImpliedEac: 3_461_538.46, etcOptimismGap: 561_538.46,
    },
  },
  // ---------------------------------------------------------------- G -------
  {
    letter: 'G', archetype: 'QUALITY_SPIRAL', title: 'Quality Margin Leakage',
    vertical: 'Media & Entertainment', region: 'North America', subStage: 'LATE_STAGE',
    // Sold GM = (3,000,000 − 2,280,000) / 3,000,000 = 24.00%
    // Excess rework = (0.16 − 0.06) × 1,900,000 = 190,000
    contractValue: 3_000_000, budgetedCost: 2_280_000, contingencyBudget: 140_000,
    reworkAllowance: 0.06, durationWeeks: 84, teamSize: 10,
    checkpoints: [
      cp(30, 0.44, 0.48, 1_180_000, 1_260_000, 40_000, 40_000, 0, 'GREEN'),
      cp(20, 0.53, 0.58, 1_420_000, 1_120_000, 48_000, 68_000, 0, 'AMBER'),
      cp(10, 0.61, 0.67, 1_670_000, 940_000, 55_000, 98_000, 0, 'AMBER'),
      // EAC = 1,900,000 + 780,000 + 60,000 = 2,740,000 → GM$ 260,000 → 8.67%
      cp(0, 0.68, 0.75, 1_900_000, 780_000, 60_000, 128_000, 0, 'AMBER'),
    ],
    executedChanges: [], pendingChanges: [],
    uncontractedScopeValue: 0,
    reworkFraction: 0.16, blockingAcceptanceItems: 5, missedGatingMilestone: false,
    incrementalRisks: [{ probability: 0.45, impact: 160_000 }],
    executiveView:
      'Margin is at 8.7% against 24% sold, and the cause is not scope or rates — it is rework. 16% of ' +
      'all effort is redoing work against a 6% allowance, which is $190K of margin spent on defects ' +
      'nobody priced. Five acceptance blockers are open and the reopen rate is climbing, so the ' +
      'remaining work is likely to cost more than the last, not less.',
    expect: {
      soldGmPercent: 0.24, forecastGmPercent: 0.0867,
      excessReworkCost: 190_000,
    },
  },
  // ---------------------------------------------------------------- H -------
  {
    letter: 'H', archetype: 'CONTRACT_LOSS_RISK', title: 'Contract-Loss Risk',
    vertical: 'Healthcare & Life Sciences', region: 'Europe', subStage: 'LATE_STAGE',
    // Sold GM = (6,000,000 − 4,560,000) / 6,000,000 = 24.00%
    contractValue: 6_000_000, budgetedCost: 4_560_000, contingencyBudget: 300_000,
    reworkAllowance: 0.05, durationWeeks: 100, teamSize: 15,
    checkpoints: [
      cp(40, 0.42, 0.52, 2_400_000, 2_900_000, 90_000, 150_000, 0, 'AMBER'),
      cp(26, 0.52, 0.63, 2_950_000, 2_550_000, 105_000, 220_000, 0, 'AMBER'),
      cp(12, 0.60, 0.72, 3_480_000, 2_120_000, 115_000, 280_000, 0, 'RED'),
      // EAC = 3,900,000 + 1,800,000 + 120,000 = 5,820,000 → GM$ 180,000 → 3.00%
      // Risk-adjusted GM$ = 6,000,000 − 5,820,000 − 420,000 = −240,000 → −4.00%
      cp(0, 0.66, 0.79, 3_900_000, 1_800_000, 120_000, 300_000, 0, 'RED'),
    ],
    executedChanges: [], pendingChanges: [],
    uncontractedScopeValue: 0,
    reworkFraction: 0.13, blockingAcceptanceItems: 4, missedGatingMilestone: true,
    liquidatedDamages: 180_000,
    // Σ (p × impact) over risks NOT in ETC = 0.60×400,000 + 0.40×300,000 + 0.30×200,000 = 420,000
    incrementalRisks: [
      { probability: 0.60, impact: 400_000 },
      { probability: 0.40, impact: 300_000 },
      { probability: 0.30, impact: 200_000 },
    ],
    executiveView:
      'This one is a commercial conversation, not a delivery one. 3% forecast margin against 24% sold, ' +
      'and once unresolved risk that is not in the estimate is counted it is −4%. A payment-gating ' +
      'milestone has been missed, liquidated damages are live, acceptance is blocked and the customer ' +
      'has escalated. The remaining plan assumes a productivity step-change nobody on this project has ' +
      'demonstrated in a year. Decide whether to reserve, renegotiate or exit.',
    expect: {
      soldGmPercent: 0.24, forecastGmPercent: 0.03,
      riskAdjustedGmPercent: -0.04, incrementalRiskExposure: 420_000,
    },
  },
  // --------------------------------------------------------------- LR ------
  {
    letter: 'LR', archetype: 'SCHEDULE_SLIP_HONEST', title: 'Leading Risk, No Cost Overrun',
    vertical: 'Communications', region: 'Europe', subStage: 'LATE_STAGE',
    // Sold GM = (4,200,000 − 3,150,000) / 4,200,000 = 25.00%
    contractValue: 4_200_000, budgetedCost: 3_150_000, contingencyBudget: 200_000,
    reworkAllowance: 0.05, durationWeeks: 72, elapsedFraction: 0.75, teamSize: 11,
    checkpoints: [
      cp(24, 0.38, 0.40, 1_120_000, 1_910_000, 60_000, 60_000, 0, 'GREEN'),
      cp(16, 0.45, 0.47, 1_340_000, 1_720_000, 72_000, 78_000, 0, 'GREEN'),
      cp(8, 0.50, 0.53, 1_520_000, 1_500_000, 84_000, 104_000, 0, 'GREEN'),
      // Cost consumed = 1,732,500 / 3,150,000 = 55.00%, BELOW physical completion of 58%.
      // EAC = 1,732,500 + 1,300,000 + 90,000 = 3,122,500 → GM$ 1,077,500 → 25.65%, above as-sold.
      // Nothing in the cost or margin picture is adverse. Everything below it is.
      cp(0, 0.58, 0.60, 1_732_500, 1_300_000, 90_000, 150_000, 0, 'GREEN'),
    ],
    executedChanges: [],
    pendingChanges: [
      { weeksBefore: 20, value: 110_000, probability: 0.4 },
      { weeksBefore: 11, value: 95_000, probability: 0.35 },
    ],
    uncontractedScopeValue: 310_000,
    reworkFraction: 0.075, blockingAcceptanceItems: 3, missedGatingMilestone: false,
    incrementalRisks: [
      { probability: 0.5, impact: 220_000 },
      { probability: 0.4, impact: 180_000 },
      { probability: 0.35, impact: 140_000 },
    ],
    leadingRiskSignals: {
      gatingMilestoneForecastSlipDays: 62,
      openCustomerDependencyAgesDays: [95, 71, 58, 40],
      openCriticalRisks: 3,
      contingencyAccelerating: true,
    },
    executiveView:
      'Cost is *ahead* of the game — 55% of budget consumed for 58% delivered, and forecast margin is ' +
      '25.65% against 25% sold. By any lagging cost or margin measure this project is fine, and a ' +
      'traditional status report would say Green. Everything forward-looking disagrees: the gating ' +
      'milestone is forecast 62 days late, four customer dependencies are unresolved and ageing to 95 ' +
      'days, $310K of scope is accumulating unsigned with no executed CR, three critical risks are ' +
      'open, contingency draw has nearly doubled in the last eight weeks, and finishing on the ' +
      'committed date now needs roughly 2.3× the delivery rate the team has actually demonstrated. ' +
      'This case exists to prove the platform can see deterioration **before** the cost burn does.',
    expect: {
      soldGmPercent: 0.25, forecastGmPercent: 0.2565,
      costConsumedPercent: 0.55, physicalCompletion: 0.58, plannedCompletion: 0.60,
      uncompensatedExposure: 310_000,
    },
  },
];

/** Linear interpolation between the surrounding checkpoints for a given week offset. */
function interpolate(cps: readonly Checkpoint[], weeksBefore: number): Checkpoint {
  const sorted = [...cps].sort((a, b) => b.weeksBefore - a.weeksBefore);
  const first = sorted[0] as Checkpoint;
  const last = sorted[sorted.length - 1] as Checkpoint;
  if (weeksBefore >= first.weeksBefore) return first;
  if (weeksBefore <= last.weeksBefore) return last;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i] as Checkpoint;
    const b = sorted[i + 1] as Checkpoint;
    if (weeksBefore <= a.weeksBefore && weeksBefore >= b.weeksBefore) {
      const span = a.weeksBefore - b.weeksBefore;
      const t = span === 0 ? 0 : (a.weeksBefore - weeksBefore) / span;
      const lerp = (x: number, y: number) => x + (y - x) * t;
      return {
        weeksBefore,
        physical: lerp(a.physical, b.physical),
        planned: lerp(a.planned, b.planned),
        costToDate: lerp(a.costToDate, b.costToDate),
        etc: lerp(a.etc, b.etc),
        committed: lerp(a.committed, b.committed),
        contingencyConsumed: lerp(a.contingencyConsumed, b.contingencyConsumed),
        executedValueDelta: t < 0.5 ? a.executedValueDelta : b.executedValueDelta,
        reportedRag: t < 0.5 ? a.reportedRag : b.reportedRag,
      };
    }
  }
  return last;
}

const SENIORITY = ['PRINCIPAL', 'SENIOR', 'MID', 'JUNIOR', 'TRAINEE'] as const;

/** Emits the L1 facts for one curated project. */
export function buildCuratedFacts(
  scenario: CuratedScenario, spec: ProjectSpec, masterSeed: string,
): ProjectFacts {
  const rng = Rng.fromSeed(`${masterSeed}:curated:${scenario.letter}`);
  const f = emptyFacts();
  const currency = spec.currency;
  const money = (n: number) => Money.of(dec(Math.max(0, n)), currency).toDto();
  const iso = (d: CalendarDate, h = 9) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;

  const horizon = Math.max(...scenario.checkpoints.map((c) => c.weeksBefore));
  const rate = scenario.budgetedCost / Number(spec.plannedEffortHours);

  for (let i = 0; i < scenario.teamSize; i += 1) {
    f.assignments.push({
      id: `asg-${spec.projectId}-${String(i + 1).padStart(2, '0')}`, projectId: spec.projectId,
      personRef: `psn-${String(rng.int(1000, 9999))}`,
      seniorityBand: SENIORITY[Math.min(4, Math.floor(rng.range(0, 5)))] as typeof SENIORITY[number],
      // DR-056: a delivery site and a contract form. Never an address or a supplier name.
      deliveryLocation: rng.pick(['ONSHORE', 'NEARSHORE', 'OFFSHORE'] as const),
      engagementType: rng.chance(0.22) ? 'SUBCONTRACTOR' : 'EMPLOYEE',
      startedOn: spec.startDate, allocationPercent: dec(rng.range(0.7, 1.0), 4), synthetic: true,
    });
  }

  // Milestones, with the gating one missed where the scenario calls for it.
  const milestoneCount = 6;
  for (let m = 1; m <= milestoneCount; m += 1) {
    const at = addDays(spec.startDate, Math.round((scenario.durationWeeks * 7 * m) / (milestoneCount + 1)));
    const gating = m % 2 === 1;
    const missed = scenario.missedGatingMilestone && m === 3;
    f.milestones.push({
      id: `mst-${spec.projectId}-${m}`, projectId: spec.projectId, name: `Milestone ${m}`,
      baselineDate: at, forecastDate: missed ? addDays(at, 47) : at,
      ...(compareDates(at, AS_OF) < 0 && !missed ? { actualDate: at } : {}),
      paymentGating: gating,
      ...(gating ? { gatedValue: money(scenario.contractValue / 3) } : {}),
      synthetic: true,
    });
  }

  let prevCost = 0;
  let cumulativeRecognised = 0;
  let lastRecognisedPeriod = '';
  let defectSeq = 0;

  for (let wb = horizon; wb >= 0; wb -= 1) {
    const date = addDays(AS_OF, -wb * 7);
    if (compareDates(date, spec.startDate) < 0) continue;
    const week = weekOf(date);
    const point = interpolate(scenario.checkpoints, wb);
    const w = Rng.fromSeed(`${masterSeed}:${scenario.letter}:w${wb}`);
    const weekCost = Math.max(0, point.costToDate - prevCost);
    prevCost = point.costToDate;

    // Effort: total hours implied by cost, split rework vs productive by the scenario's fraction.
    const weekHours = weekCost / rate;
    const reworkHours = weekHours * scenario.reworkFraction;
    const perAssignment = (weekHours - reworkHours) / f.assignments.length;
    const reworkPer = reworkHours / f.assignments.length;
    for (const a of f.assignments) {
      f.effort.push({
        projectId: spec.projectId, assignmentId: a.id, periodEnd: date, week,
        hours: dec(Math.max(0, perAssignment)), billable: true, isRework: false,
        recordedAt: iso(addDays(date, 1), 17), synthetic: true,
      });
      if (reworkPer > 0.05) {
        f.effort.push({
          projectId: spec.projectId, assignmentId: a.id, periodEnd: date, week,
          hours: dec(reworkPer), billable: true, isRework: true,
          recordedAt: iso(addDays(date, 1), 17), synthetic: true,
        });
      }
    }

    f.actualCosts.push({
      id: `cst-${spec.projectId}-${wb}-L`, projectId: spec.projectId, periodEnd: date, week,
      category: 'LABOUR', amount: money(weekCost * 0.9), recordedAt: iso(addDays(date, 2)), synthetic: true,
    });
    f.actualCosts.push({
      id: `cst-${spec.projectId}-${wb}-N`, projectId: spec.projectId, periodEnd: date, week,
      category: 'NON_LABOUR', amount: money(weekCost * 0.1), recordedAt: iso(addDays(date, 2)), synthetic: true,
    });

    f.progressClaims.push({
      projectId: spec.projectId, claimedOn: date, week,
      physicalCompletion: dec(point.physical, 4), plannedCompletion: dec(point.planned, 4),
      basis: 'Completion criteria signed off per work package',
      claimedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, synthetic: true,
    });

    // ETC and commitments are restated at every checkpoint, so EAC lands exactly on the target.
    const isCheckpoint = scenario.checkpoints.some((c) => c.weeksBefore === wb);
    if (isCheckpoint || wb % 6 === 0) {
      f.etcLineItems.push({
        projectId: spec.projectId, forecastRevisionId: `fcr-${spec.projectId}-${wb}`, week,
        category: 'LABOUR', amount: money(point.etc * 0.88),
        basisOfEstimate: 'Bottom-up by work package, reviewed with delivery lead',
        estimatedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, estimatedOn: date, synthetic: true,
      });
      f.etcLineItems.push({
        projectId: spec.projectId, forecastRevisionId: `fcr-${spec.projectId}-${wb}`, week,
        category: 'NON_LABOUR', amount: money(point.etc * 0.12),
        basisOfEstimate: 'Run-rate extrapolation of non-labour spend',
        estimatedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, estimatedOn: date, synthetic: true,
      });
      f.commitments.push({
        id: `cmt-${spec.projectId}-${wb}`, projectId: spec.projectId, amount: money(point.committed),
        committedOn: date, expectedIncurBy: addDays(date, 90), cancellable: false,
        reference: `PO-${spec.projectId.slice(-3)}-${wb}`, synthetic: true,
      });
    }

    // Contingency drawdown as an increment. At the first week there is no earlier point, so the
    // opening balance is emitted whole — otherwise the first checkpoint's consumption vanishes and
    // the total lands short by exactly that amount.
    const draw = wb === horizon
      ? point.contingencyConsumed
      : point.contingencyConsumed - interpolate(scenario.checkpoints, wb + 1).contingencyConsumed;
    if (draw > 1) {
      f.contingencyDrawdowns.push({
        projectId: spec.projectId, drawnOn: date, week, amount: money(draw),
        reason: 'Cost incurred ahead of baseline curve',
        authorisedByActorId: `usr-pd-${spec.projectId.slice(-3)}`, synthetic: true,
      });
    }

    if (wb % 2 === 0) {
      f.statusReports.push({
        projectId: spec.projectId, reportedOn: date, week, reportedRag: point.reportedRag,
        commentary: 'Weekly delivery status submitted by the delivery manager',
        reportedByActorId: `usr-dm-${spec.projectId.slice(-3)}`, synthetic: true,
      });
    }

    // Defects, with a worsening reopen trend where the scenario calls for one.
    const injected = Math.round(weekHours / 100 * (scenario.reworkFraction > 0.12 ? 3.2 : 1.0));
    for (let i = 0; i < injected; i += 1) {
      defectSeq += 1;
      const lateInLife = (horizon - wb) / Math.max(1, horizon);
      f.defects.push({
        id: `def-${spec.projectId}-${defectSeq}`, projectId: spec.projectId,
        severity: w.chance(0.12) ? 'CRITICAL' : w.chance(0.4) ? 'MAJOR' : 'MINOR',
        raisedOn: date, ...(w.chance(0.7) ? { closedOn: addDays(date, w.int(4, 35)) } : {}),
        discoveryPhase: w.chance(0.25) ? 'POST_RELEASE' : 'PRE_RELEASE',
        escapedToClient: w.chance(0.2),
        reopenCount: w.chance(0.1 + lateInLife * (scenario.reworkFraction > 0.12 ? 0.4 : 0.05)) ? w.int(1, 3) : 0,
        synthetic: true,
      });
    }

    // Recognised revenue — the synthetic accounting policy, stamped. Monthly.
    if (wb % 4 === 0) {
      const eac = Math.max(1, point.costToDate + point.etc + point.committed);
      const contractual = scenario.contractValue + point.executedValueDelta;
      const target = contractual * Math.min(1, point.costToDate / eac);
      // One ORIGINAL posting per accounting period; the amount accrues across ticks inside it
      // (see simulate.ts). RECOGNITION-v1 does not reverse.
      const period = date.slice(0, 7);
      if (period !== lastRecognisedPeriod) {
        const periodAmount = Math.max(0, target - cumulativeRecognised);
        cumulativeRecognised = Math.max(cumulativeRecognised, target);
        lastRecognisedPeriod = period;
        f.recognisedRevenue.push(originalPosting({
          projectId: spec.projectId, period, date, periodAmount,
          cumulative: cumulativeRecognised, currency, seq: wb,
        }));
      }
    }
  }

  // --- accounting corrections (Correction 6) --------------------------------
  const corrected = applyCorrections(f.recognisedRevenue, spec.projectId, currency, masterSeed);
  f.recognisedRevenue.length = 0;
  f.recognisedRevenue.push(...corrected);

  // --- billing and cash -----------------------------------------------------
  const billing = buildBilling(spec.projectId, spec.contractId, currency, f.recognisedRevenue, masterSeed);
  f.invoices.push(...billing.invoices);
  f.payments.push(...billing.payments);

  // --- change records -------------------------------------------------------
  for (const [i, ec] of scenario.executedChanges.entries()) {
    const on = addDays(AS_OF, -ec.weeksBefore * 7);
    f.executedChanges.push({
      id: `crx-${spec.projectId}-${i + 1}`, contractId: spec.contractId, executedOn: on,
      valueDelta: money(ec.value), costDelta: money(ec.cost), contingencyDelta: money(ec.value * 0.03),
      completionDateDelta: 14, synthetic: true,
    });
    f.baselineRevisions.push({
      id: `rev-${spec.projectId}-${i + 1}`, contractId: spec.contractId, baselineKind: 'FORECAST',
      effectiveFrom: iso(on), actorId: `usr-dm-${spec.projectId.slice(-3)}`,
      reason: `Contractual baseline revised on execution of crx-${spec.projectId}-${i + 1}`, synthetic: true,
    });
  }
  for (const [i, pc] of scenario.pendingChanges.entries()) {
    const on = addDays(AS_OF, -pc.weeksBefore * 7);
    f.pendingChanges.push({
      id: `crp-${spec.projectId}-${i + 1}`, contractId: spec.contractId, raisedOn: on,
      proposedValue: money(pc.value), estimatedCost: money(pc.value * 0.74),
      approvalProbability: dec(pc.probability, 4),
      probabilityAssessedBy: `usr-com-${spec.projectId.slice(-3)}`,
      probabilityAssessedOn: addDays(on, 5), synthetic: true,
    });
  }

  // --- uncontracted scope and exposure --------------------------------------
  if (scenario.uncontractedScopeValue > 0) {
    const parts = 4;
    const each = scenario.uncontractedScopeValue / parts;
    for (let i = 0; i < parts; i += 1) {
      const on = addDays(AS_OF, -(horizon - i * Math.floor(horizon / parts)) * 7);
      f.scopeItems.push({
        id: `scp-${spec.projectId}-${i + 1}`, projectId: spec.projectId,
        description: 'Additional requirement delivered without an executed change request',
        raisedOn: on, completedOn: addDays(on, 21), uncontracted: true,
        estimatedValue: money(each), synthetic: true,
      });
    }
    f.exposures.push({
      projectId: spec.projectId, assessedOn: AS_OF, kind: 'UNCOMPENSATED_SCOPE',
      estimatedValue: money(scenario.uncontractedScopeValue),
      estimationBasis: 'Estimated from delivered scope items with no linked executed change (estimate)',
      assessedByActorId: `usr-com-${spec.projectId.slice(-3)}`, synthetic: true,
    });
  }
  if (scenario.liquidatedDamages !== undefined) {
    f.exposures.push({
      projectId: spec.projectId, assessedOn: AS_OF, kind: 'LIQUIDATED_DAMAGES',
      estimatedValue: money(scenario.liquidatedDamages),
      estimationBasis: 'Contractual LD rate applied to the missed payment-gating milestone (estimate)',
      assessedByActorId: `usr-com-${spec.projectId.slice(-3)}`, synthetic: true,
    });
  }

  // --- acceptance blockers --------------------------------------------------
  for (let i = 0; i < scenario.blockingAcceptanceItems; i += 1) {
    const on = addDays(AS_OF, -(14 + i * 9));
    f.acceptanceItems.push({
      id: `acp-${spec.projectId}-${i + 1}`, projectId: spec.projectId,
      milestoneId: `mst-${spec.projectId}-3`, submittedOn: on, blocking: true,
      clientReference: `CLIENT-OBJ-${100 + i}`, synthetic: true,
    });
  }
  // A few accepted items too, so acceptance latency is computable.
  for (let i = 0; i < 3; i += 1) {
    const on = addDays(AS_OF, -(90 + i * 20));
    f.acceptanceItems.push({
      id: `acp-${spec.projectId}-ok-${i + 1}`, projectId: spec.projectId,
      submittedOn: on, acceptedOn: addDays(on, 12 + i * 6), blocking: false,
      resolvedOn: addDays(on, 12 + i * 6), clientReference: `CLIENT-ACC-${200 + i}`, synthetic: true,
    });
  }

  // --- forward deterioration signals, independent of cost burn (Correction 11) ---
  const lr = scenario.leadingRiskSignals;
  if (lr) {
    // The most recent gating milestone is forecast to slip and has **not** been accepted. It is not
    // yet a missed-date fact — the baseline date has barely passed — but the forecast has already
    // moved. Forecast-date deterioration is visible weeks before a missed-date fact exists, which is
    // the whole point of this case.
    const gatingMilestones = f.milestones.filter((m) => m.paymentGating);
    const latestGating = gatingMilestones[gatingMilestones.length - 1];
    if (latestGating) {
      const { actualDate: _dropped, ...withoutActual } = latestGating;
      f.milestones[f.milestones.indexOf(latestGating)] = {
        ...withoutActual,
        forecastDate: addDays(latestGating.baselineDate as CalendarDate, lr.gatingMilestoneForecastSlipDays),
      };
    }
    // Unresolved customer dependencies, ageing.
    for (const [i, ageDays] of lr.openCustomerDependencyAgesDays.entries()) {
      f.dependencies.push({
        id: `dep-${spec.projectId}-lr-${i + 1}`, projectId: spec.projectId,
        description: 'Awaiting customer decision / environment provisioning',
        owner: 'CUSTOMER', raisedOn: addDays(AS_OF, -ageDays),
        dueOn: addDays(AS_OF, -Math.floor(ageDays / 2)), blocking: true, synthetic: true,
      });
    }
    // Critical risks accumulating, none of them provisioned in ETC.
    for (let i = 0; i < lr.openCriticalRisks; i += 1) {
      f.risks.push({
        id: `rsk-${spec.projectId}-crit-${i + 1}`, projectId: spec.projectId,
        description: 'Unresolved critical risk to the committed delivery date',
        severity: 'CRITICAL', probability: dec(0.45 + i * 0.05, 4), costImpact: money(90_000),
        includedInEtc: false, riskCauseKey: 'CUSTOMER_ENV_DELAY',
        proximityDate: addDays(AS_OF, 21 + i * 14), state: 'OPEN',
        raisedOn: addDays(AS_OF, -(70 - i * 15)), updatedAt: iso(addDays(AS_OF, -3)), synthetic: true,
      });
    }
  }

  // --- risks ----------------------------------------------------------------
  // Incremental risks are stated exactly so MET-RSK-008 lands on the scenario's target.
  for (const [i, r] of scenario.incrementalRisks.entries()) {
    f.risks.push({
      id: `rsk-${spec.projectId}-inc-${i + 1}`, projectId: spec.projectId,
      description: 'Unresolved risk not provisioned in the current estimate to complete',
      severity: r.impact > 250_000 ? 'CRITICAL' : 'HIGH',
      probability: dec(r.probability, 4), costImpact: money(r.impact),
      includedInEtc: false, riskCauseKey: ['CUSTOMER_ENV_DELAY', 'SCOPE_AMBIGUITY', 'THIRD_PARTY_INTEGRATION'][i % 3] as string,
      proximityDate: addDays(AS_OF, 30 + i * 25), state: 'OPEN',
      raisedOn: addDays(AS_OF, -120), updatedAt: iso(addDays(AS_OF, -5)), synthetic: true,
    });
  }
  // One risk that IS provisioned, so the double-count guard has something to exclude.
  f.risks.push({
    id: `rsk-${spec.projectId}-inetc-1`, projectId: spec.projectId,
    description: 'Risk already provisioned within the bottom-up ETC',
    severity: 'MEDIUM', probability: '0.5000', costImpact: money(200_000),
    includedInEtc: true,
    includedInEtcJustification: 'Provisioned in the current bottom-up ETC line items',
    riskCauseKey: 'KEY_PERSON', proximityDate: addDays(AS_OF, 60), state: 'MITIGATING',
    raisedOn: addDays(AS_OF, -150), updatedAt: iso(addDays(AS_OF, -9)), synthetic: true,
  });

  return f;
}
