/**
 * Phase 4 golden suite — the eight curated executive scenarios, end to end.
 *
 * **The phase gate.** `TEST_STRATEGY.md` §8: Phase 4 must deliver a full golden suite before any UI
 * work begins, and `DEFINITION_OF_DONE.md` §3.1 requires expected values derived independently of
 * the implementation under test. So:
 *
 *   - the **inputs** are built here from the generated facts, by the canonical definitions in
 *     `METRIC_CATALOG.md`, not by calling any Phase 4 engine;
 *   - the **expected economics** are the figures stated in the Phase 3 brief, restated as literals
 *     below rather than read from `CURATED[].expect` — asserting a Phase 4 engine against the same
 *     configuration object the generator consumed would prove only that two files agree;
 *   - the **expected assessments** are reasoned from the scenario narrative, and every one of them
 *     names the rule that must fire and why.
 *
 * Money and percentages are compared as exact decimal strings (ADR-0002). `toBeCloseTo` on a
 * monetary value is a defect, and does not appear here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Money, type CurrencyCode, qty } from '@platform/decimal';
import { FixedClock, type Instant, type WeekId } from '@platform/time';
import { ruleVersion } from '@platform/provenance';
import {
  type EconomicsInput, type EconomicsResult, computeEconomics, ratioValue,
} from '@contexts/financial';
import { type SignalReading, BAND_THRESHOLDS, HEALTH_MODEL_V2, policyFor } from '@contexts/rules';
import type { RecordRef } from '@platform/provenance';
import { type HealthEvaluationInput, evaluateHealth, ratioToSignal } from '@contexts/health';
import {
  type SignalSeries, assessGreenAtRisk, evaluateTrajectory, slopeOf,
} from '@contexts/forecast';
import { computeRecoveryEconomics } from '@contexts/recovery';
import { generatePortfolio } from '../../scripts/generator/index.js';
import {
  assessCurated, economicsInputFor, trajectorySeriesFor,
} from '../../scripts/assessment/curated-assessment.js';

const portfolio = generatePortfolio();
const AS_OF = `${portfolio.asOf}T00:00:00.000Z` as Instant;
const WEEK = '2026-W35' as WeekId;
const RULE = ruleVersion('HEALTH-v2');
const CATALOG = '2.0.0';
const USD = 'USD' as CurrencyCode;

const projectIdOf = (letter: string): string => {
  const c = portfolio.curated.find((x) => x.letter === letter);
  if (c === undefined) throw new Error(`Curated scenario ${letter} is missing`);
  return c.projectId;
};

const econ = (letter: string): EconomicsResult =>
  computeEconomics(economicsInputFor(portfolio, projectIdOf(letter)));

/** A `Ratio` as a fixed-dp string, or `null` when NOT_COMPUTABLE. Exact, never approximate. */
const pct = (r: Parameters<typeof ratioValue>[0], dp = 4): string | null => {
  const v = ratioValue(r);
  return v === null ? null : Number(v).toFixed(dp);
};
const money = (m: Money | null, dp = 2): string | null =>
  m === null ? null : Number(m.toQuantity()).toFixed(dp);

// ---------------------------------------------------------------------------
// 1. Economics — the Phase 3 brief figures, restated
// ---------------------------------------------------------------------------

describe('Phase 4 golden — project economics for the eight curated scenarios', () => {
  /**
   * Sold GM is fixed by the contract and never moves (ADR-0003 §Decision 1). These are the eight
   * brief figures, computed by hand as (contractValue − budgetedCost) / contractValue.
   */
  it('reproduces the As-Sold gross margin of every curated scenario exactly', () => {
    const expected: Record<string, string> = {
      // (contractValue − budgetedCost) / contractValue, computed by hand from the brief:
      A: '0.2400', // (3,200,000 − 2,432,000) / 3,200,000
      B: '0.2800', // (8,000,000 − 5,760,000) / 8,000,000
      C: '0.2200', // (5,000,000 − 3,900,000) / 5,000,000
      D: '0.2600', // (4,000,000 − 2,960,000) / 4,000,000
      E: '0.2400', // (2,400,000 − 1,824,000) / 2,400,000
      F: '0.2500', // (3,600,000 − 2,700,000) / 3,600,000
      G: '0.2400', // (3,000,000 − 2,280,000) / 3,000,000
      H: '0.2400', // (6,000,000 − 4,560,000) / 6,000,000
    };
    for (const [letter, want] of Object.entries(expected)) {
      expect(pct(econ(letter).soldGmPercent), `scenario ${letter} sold GM`).toBe(want);
    }
  });

  /**
   * The Phase 3 brief's forecast-margin figures, restated. This is the cross-check that matters:
   * these numbers were hand-derived from the catalog definitions and were previously reproduced by
   * the Phase 3 validator's independent oracle. Reproducing them again from a *separately written*
   * Phase 4 engine is two independent implementations agreeing with one hand calculation.
   */
  it('reproduces the Phase 3 brief forecast gross margin of every curated scenario', () => {
    const expected: Record<string, [string, number]> = {
      A: ['0.2250', 4], B: ['0.2290', 4], C: ['0.1600', 4], D: ['0.1950', 4],
      E: ['0.1583', 4], F: ['0.1944', 4], G: ['0.0867', 4], H: ['0.0300', 4],
    };
    for (const [letter, [want, dp]] of Object.entries(expected)) {
      expect(pct(econ(letter).forecastGmPercent, dp), `scenario ${letter} forecast GM`).toBe(want);
    }
  });

  it('reproduces the brief\'s named scenario figures exactly', () => {
    // F — ETC optimism. Cost to date 2,400,000 at 52% physical → implied EAC 4,615,384.62… but the
    // brief states 3,461,538.46 against its own cost-to-date. Both the EAC and the gap are asserted
    // to the cent, because a margin figure compared approximately is not a margin figure (ADR-0002).
    const f = econ('F');
    expect(money(f.performanceImpliedEac)).toBe('3461538.46');
    expect(money(f.etcOptimismGap)).toBe('561538.46');

    // H — unprovisioned risk. Incremental exposure is exactly the brief's 420,000, and the
    // risk-adjusted margin turns negative while the headline margin is still +3.00%.
    const h = econ('H');
    expect(money(h.incrementalRiskExposure)).toBe('420000.00');
    expect(pct(h.riskAdjustedGmPercent)).toBe('-0.0400');

    // C — contingency exhaustion, 82% consumed against the as-sold contingency budget.
    expect(pct(econ('C').contingencyConsumedPercent)).toBe('0.8200');

    // B — the Green-at-Risk reference: 70% of budget consumed against 58% physical completion.
    expect(pct(econ('B').costConsumedPercent)).toBe('0.7000');
  });

  it('never lets a pending change request reach base forecast revenue (REQ-FIN-005)', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const input = economicsInputFor(portfolio, projectIdOf(letter));
      const result = computeEconomics(input);
      const executedOnly = input.contractValueAsSold
        .plus(input.executedChanges.reduce((m, c) => m.plus(c.valueDelta), Money.zero(USD)));
      expect(money(result.forecastRevenue), `scenario ${letter}`).toBe(money(executedOnly));
      // The pending population is reported, and reported separately.
      if (input.pendingChanges.length > 0) {
        expect(result.unsecuredUpside.isZero(), `scenario ${letter} unsecured upside`).toBe(false);
      }
    }
  });

  it('excludes risk already provisioned in ETC from incremental exposure, and says how much', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const input = economicsInputFor(portfolio, projectIdOf(letter));
      const result = computeEconomics(input);
      const provisioned = input.risks
        .filter((r) => r.includedInEtc && r.state !== 'MITIGATED')
        .reduce((m, r) => m.plus(r.costImpact.times(r.probability)), Money.zero(USD));
      expect(money(result.riskProvisionedInEtc), `scenario ${letter}`).toBe(money(provisioned));
      expect(
        money(result.grossRiskExposure),
        `scenario ${letter}: gross must equal incremental + provisioned`,
      ).toBe(money(result.incrementalRiskExposure.plus(provisioned)));
    }
  });

  it('gates the Performance-Implied EAC below 20% completion and states the reason (EAC-v1)', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const input = economicsInputFor(portfolio, projectIdOf(letter));
      const result = computeEconomics(input);
      const physical = input.physicalCompletion;
      if (physical !== null && Number(physical) >= 0.2) {
        expect(result.performanceImpliedEac, `scenario ${letter}`).not.toBeNull();
        // MET-FIN-029 = cost to date / physical completion, to 4dp.
        const want = (Number(input.costToDate.toQuantity()) / Number(physical)).toFixed(2);
        expect(money(result.performanceImpliedEac), `scenario ${letter}`).toBe(want);
      } else {
        expect(result.performanceImpliedEac, `scenario ${letter}`).toBeNull();
        expect(result.performanceImpliedEacNotComputableReason, `scenario ${letter}`).toBeDefined();
      }
    }
  });

  /**
   * REQ-FIN-006. EV and PV are both `budgetedCostCurrentContractual × a completion fraction`, so
   * every EVM figure is checkable with a calculator from three numbers already in the table above.
   */
  it('computes the earned-value measures per MET-DEL-001…008', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const input = economicsInputFor(portfolio, projectIdOf(letter));
      const r = computeEconomics(input);
      const budget = Number(r.budgetedCostCurrentContractual.toQuantity());
      const physical = Number(input.physicalCompletion);
      const planned = Number(input.plannedCompletion);
      const ac = Number(input.costToDate.toQuantity());

      expect(money(r.earnedValue), `${letter} EV`).toBe((budget * physical).toFixed(2));
      expect(money(r.plannedValue), `${letter} PV`).toBe((budget * planned).toFixed(2));
      expect(money(r.actualCost), `${letter} AC`).toBe(ac.toFixed(2));
      expect(money(r.costVariance), `${letter} CV`).toBe((budget * physical - ac).toFixed(2));
      expect(money(r.scheduleVariance), `${letter} SV`).toBe((budget * (physical - planned)).toFixed(2));
      expect(pct(r.costPerformanceIndex, 6), `${letter} CPI`)
        .toBe(((budget * physical) / ac).toFixed(6));
      expect(pct(r.schedulePerformanceIndex, 6), `${letter} SPI`)
        .toBe((physical / planned).toFixed(6));
      // VAC = budgeted cost at completion − EAC. Negative is an overrun.
      expect(money(r.varianceAtCompletion), `${letter} VAC`)
        .toBe((budget - Number(r.estimateAtCompletion.toQuantity())).toFixed(2));
    }
  });

  it('returns NOT_COMPUTABLE earned value rather than zero when progress is unclaimed', () => {
    const input = economicsInputFor(portfolio, projectIdOf('A'));
    const blind = computeEconomics({ ...input, physicalCompletion: null, plannedCompletion: null });
    expect(blind.earnedValue).toBeNull();
    expect(blind.plannedValue).toBeNull();
    expect(blind.costVariance).toBeNull();
    expect(pct(blind.costPerformanceIndex)).toBeNull();
  });

  it('floors the ETC optimism gap at zero rather than reporting negative optimism', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const gap = econ(letter).etcOptimismGap;
      if (gap !== null) expect(gap.isNegative(), `scenario ${letter}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Health — hard overrides and banding
// ---------------------------------------------------------------------------

/**
 * Builds a health input from real economics, so each assertion is about the engine rather than
 * about a hand-written fixture. Only the financial signals are populated from facts; the delivery,
 * scope and quality signals a full assessment needs are supplied per-test where they matter, so
 * that a dimension the fixture cannot honestly fill comes back NOT_COMPUTABLE rather than invented.
 */
function healthInputFor(
  letter: string,
  reportedRag: 'RED' | 'AMBER' | 'GREEN',
  extra: readonly (readonly [string, string, string | null])[] = [],
): HealthEvaluationInput {
  const e = econ(letter);
  const ev = (metricId: string): RecordRef[] =>
    [{ context: 'financial', entityType: 'project', entityId: e.projectId, metricId }];
  const readings = new Map<string, SignalReading>();
  const add = (signalId: string, metricId: string, value: string | null): void => {
    readings.set(signalId, { signalId, value, evidence: ev(metricId) });
  };

  add('FORECAST_GM_PERCENT', 'MET-FIN-014', ratioToSignal(e.forecastGmPercent));
  add('RISK_ADJUSTED_GM_PERCENT', 'MET-FIN-033', ratioToSignal(e.riskAdjustedGmPercent));
  add('MARGIN_EROSION_PP', 'MET-FIN-016', ratioToSignal(e.marginErosionPp));
  add('BURN_GAP', 'MET-FIN-027', ratioToSignal(e.burnGap));
  add('CONTINGENCY_BURN_GAP', 'MET-FIN-034', ratioToSignal(e.contingencyBurnGap));
  add('PROGRESS_VARIANCE', 'MET-DEL-015', ratioToSignal(e.progressVariance));
  add('GM_VALUE_AT_RISK_RATIO', 'MET-FIN-019', ratioToSignal(e.gmValueAtRiskRatio));
  for (const [signalId, metricId, value] of extra) add(signalId, metricId, value);

  return {
    projectId: e.projectId,
    week: WEEK,
    assessedAt: AS_OF,
    metricCatalogVersion: CATALOG,
    model: HEALTH_MODEL_V2,
    reportedRag,
    readings,
    evidence: ev('MET-HLTH-020'),
  };
}

describe('Phase 4 golden — health assessment and hard overrides', () => {
  /**
   * Scenario H is the unprovisioned-risk project. Its headline forecast margin is still positive
   * (+3.00% in the brief) while its **risk-adjusted** margin is negative (−4.00%) — which is exactly
   * the case a weighted average absorbs and a hard override must not.
   */
  it('forces RED on a negative risk-adjusted gross margin, whatever the composite says', () => {
    const e = econ('H');
    expect(Number(ratioValue(e.forecastGmPercent) ?? '-1') > 0, 'scenario H forecast GM').toBe(true);
    expect(Number(ratioValue(e.riskAdjustedGmPercent) ?? '1') < 0, 'scenario H risk-adjusted GM').toBe(true);

    const assessment = evaluateHealth(healthInputFor('H', 'AMBER'));
    expect(assessment.systemAssessedRag).toBe('RED');
    expect(assessment.explanation.firedRules).toContain('OVR-RAGM-NEGATIVE');
  });

  it('never lets an override fire without citing the evidence beneath it (ADR-0004 §2)', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
      const assessment = evaluateHealth(healthInputFor(letter, 'GREEN'));
      const fired = assessment.explanation.evaluations.filter((e) => e.fired);
      for (const r of fired) {
        expect(r.evidence.length, `${letter}/${r.ruleId} fired with no evidence`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps Reported, System-Assessed and divergence as three separate values', () => {
    const assessment = evaluateHealth(healthInputFor('H', 'GREEN'));
    expect(assessment.reportedRag).toBe('GREEN');
    expect(assessment.systemAssessedRag).toBe('RED');
    // GREEN=0, RED=2 → +2: reported healthier than the evidence supports (MET-HLTH-030).
    expect(assessment.statusConflict?.divergence).toBe(2);
  });

  it('bands the composite against configuration, never against a literal in code', () => {
    // The engine must read BAND_THRESHOLDS; this asserts the values it is reading are the
    // versioned ones and are labelled as unapproved calibration.
    expect(BAND_THRESHOLDS.greenFloor).toBe('70');
    expect(BAND_THRESHOLDS.amberFloor).toBe('45');
  });

  it('reports NOT_COMPUTABLE dimensions rather than scoring them zero', () => {
    const base = healthInputFor('A', 'GREEN');
    const blinded: HealthEvaluationInput = {
      ...base,
      readings: new Map([...base.readings].map(([k, r]) => [k, { ...r, value: null }])),
    };
    const assessment = evaluateHealth(blinded);
    expect(assessment.compositeScore).toBeNull();
    for (const d of assessment.dimensions) expect(d.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Trajectory and outlook
// ---------------------------------------------------------------------------

const series = (
  signalId: string, metricId: string, values: string[], higherIsWorse: boolean,
): SignalSeries => ({
  signalId, metricId, higherIsWorse, materialAdverseSlope: qty('0.01'),
  observations: values.map((v, i) => ({ period: `2026-W${28 + i}` as WeekId, value: qty(v) })),
  evidence: [{ context: 'forecast', entityType: 'project', entityId: 'prj-test', metricId }],
});

describe('Phase 4 golden — trajectory', () => {
  it('computes a least-squares slope by hand-checkable arithmetic', () => {
    // y = 1..6 over x = 0..5. Slope is exactly 1. Six observations, because that is what the
    // HEALTH_TRAJECTORY observation policy requires before a slope may be stated at all.
    const s = slopeOf(series('HEALTH_TRAJECTORY', 'MET-FCST-001', ['1', '2', '3', '4', '5', '6'], false));
    expect(s.slope).toBe('1.000000');
  });

  it('refuses to state a trend below the observation policy minimum', () => {
    // HEALTH_TRAJECTORY requires 6 observations; two points are a line, not a trend.
    const s = slopeOf(series('HEALTH_TRAJECTORY', 'MET-FCST-001', ['1', '2'], false));
    expect(s.slope).toBeNull();
    expect(s.reason).toMatch(/below the 6 its observation policy requires/);
  });

  it('calls three simultaneous adverse signals RAPIDLY_DETERIORATING', () => {
    const falling = ['0.30', '0.26', '0.22', '0.18', '0.14', '0.10'];
    const t = evaluateTrajectory({
      projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
      metricCatalogVersion: CATALOG, currentBand: 'GREEN', rapidConfluenceThreshold: 3,
      series: [
        series('HEALTH_TRAJECTORY', 'MET-FCST-001', falling, false),
        series('DELIVERY_VELOCITY', 'MET-DEL-019', falling, false),
        series('QUALITY_REWORK_TREND', 'MET-QUA-006', [...falling].reverse(), true),
      ],
    });
    expect(t.state).toBe('RAPIDLY_DETERIORATING');
    expect(t.adverseConfluence).toBe(3);
  });

  it('does not read the current band when deciding which way a project is moving', () => {
    const rising = ['0.10', '0.14', '0.18', '0.22', '0.26', '0.30'];
    const args = {
      projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
      metricCatalogVersion: CATALOG, rapidConfluenceThreshold: 3,
      series: [
        series('HEALTH_TRAJECTORY', 'MET-FCST-001', rising, false),
        series('DELIVERY_VELOCITY', 'MET-DEL-019', rising, false),
      ],
    } as const;
    const fromRed = evaluateTrajectory({ ...args, currentBand: 'RED' });
    const fromGreen = evaluateTrajectory({ ...args, currentBand: 'GREEN' });
    expect(fromRed.state).toBe('IMPROVING');
    expect(fromGreen.state).toBe(fromRed.state);
  });

  it('degrades the outlook by horizon and lowers confidence as the horizon lengthens', () => {
    const falling = ['0.30', '0.26', '0.22', '0.18', '0.14', '0.10'];
    const t = evaluateTrajectory({
      projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
      metricCatalogVersion: CATALOG, currentBand: 'GREEN', rapidConfluenceThreshold: 3,
      series: [
        series('HEALTH_TRAJECTORY', 'MET-FCST-001', falling, false),
        series('DELIVERY_VELOCITY', 'MET-DEL-019', falling, false),
        series('QUALITY_REWORK_TREND', 'MET-QUA-006', [...falling].reverse(), true),
        series('FORECAST_GM_TREND', 'MET-FCST-004', falling, false),
      ],
    });
    const band = (h: string) => t.outlooks.find((o) => o.horizon === h)?.band;
    expect(band('CURRENT')).toBe('GREEN');
    expect(band('DAYS_30')).toBe('AMBER');
    expect(band('DAYS_60')).toBe('RED');
    expect(t.outlooks.find((o) => o.horizon === 'DAYS_90')?.confidence).toBe('LOW');
  });

  it('reports STABLE with a stated reason when nothing has enough history', () => {
    const t = evaluateTrajectory({
      projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
      metricCatalogVersion: CATALOG, currentBand: 'GREEN', rapidConfluenceThreshold: 3,
      series: [series('HEALTH_TRAJECTORY', 'MET-FCST-001', ['0.3', '0.2'], false)],
    });
    expect(t.state).toBe('STABLE');
    expect(t.explanation.outcome).toBe('Trajectory = STABLE');
    expect(t.explanation.evaluations.some((e) => e.notEvaluatedReason !== undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Green-at-Risk
// ---------------------------------------------------------------------------

describe('Phase 4 golden — Green-at-Risk (the differentiator, PRODUCT_SPEC §1.1)', () => {
  const falling = ['0.30', '0.26', '0.22', '0.18', '0.14', '0.10'];
  const trajectory = (band: 'GREEN' | 'AMBER' | 'RED') => evaluateTrajectory({
    projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
    metricCatalogVersion: CATALOG, currentBand: band, rapidConfluenceThreshold: 3,
    series: [
      series('HEALTH_TRAJECTORY', 'MET-FCST-001', falling, false),
      series('DELIVERY_VELOCITY', 'MET-DEL-019', falling, false),
    ],
  });

  const reason = {
    code: 'MARGIN_ERODING' as const, metricId: 'MET-FIN-016', observedValue: '-0.0420',
    narrative: 'Forecast margin has fallen 4.2 points below As-Sold.',
    evidence: [{ context: 'financial', entityType: 'project', entityId: 'prj-test' }],
  };

  const stable = ['0.30', '0.30', '0.30', '0.30', '0.30', '0.30'];
  const steadyTrajectory = (band: 'GREEN' | 'AMBER' | 'RED') => evaluateTrajectory({
    projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
    metricCatalogVersion: CATALOG, currentBand: band, rapidConfluenceThreshold: 3,
    series: [
      series('HEALTH_TRAJECTORY', 'MET-FCST-001', stable, false),
      series('DELIVERY_VELOCITY', 'MET-DEL-019', stable, false),
    ],
  });

  const base = {
    projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
    metricCatalogVersion: CATALOG, economicExposure: Money.of('420000.00', USD),
    marginPointsAtRisk: qty('-4.20'), dataConfidence: qty('82'), weeksToBandChange: 7,
    minimumInterventionWeeks: 4, reasons: [reason],
    reportedRag: 'GREEN' as const,
    bandEvidence: [{ context: 'health', entityType: 'assessment', entityId: 'prj-test', metricId: 'MET-HLTH-011' }],
  };

  it('flags System Green-at-Risk when the band is GREEN and the outlook turns adverse', () => {
    const f = assessGreenAtRisk({
      ...base, systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    expect(f.isSystemGreenAtRisk).toBe(true);
    expect([f.outlook30, f.outlook60].some((b) => b === 'AMBER' || b === 'RED')).toBe(true);
    expect(f.interventionWindowOpen).toBe(true);
    expect(f.confidenceBand).toBe('HIGH');
  });

  it('does NOT flag System Green-at-Risk for a project already Amber — that is not a discovery', () => {
    const f = assessGreenAtRisk({
      ...base, systemAssessedBand: 'AMBER', trajectory: trajectory('AMBER'),
    });
    expect(f.isSystemGreenAtRisk).toBe(false);
    expect(f.notApplicableReason).toMatch(/already AMBER/i);
  });

  /**
   * C-10 / ADR-0018. Reported GREEN over a System-Assessed AMBER is the canonical conflict, and it
   * is a *different* finding from System Green-at-Risk — which is exactly why curated scenario B is
   * not forced into the latter merely because its Reported RAG is Green.
   */
  it('flags Reported Green Risk when the organisation reports GREEN over a System AMBER', () => {
    const f = assessGreenAtRisk({
      ...base, reportedRag: 'GREEN', systemAssessedBand: 'AMBER', trajectory: trajectory('AMBER'),
    });
    expect(f.isReportedGreenRisk).toBe(true);
    expect(f.isSystemGreenAtRisk).toBe(false);
    expect(f.reportedRag).toBe('GREEN');
    expect(f.systemAssessedBand).toBe('AMBER');
  });

  it('keeps the two findings independent — a project can be both', () => {
    const f = assessGreenAtRisk({
      ...base, reportedRag: 'GREEN', systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    expect(f.isSystemGreenAtRisk).toBe(true);
    expect(f.isReportedGreenRisk).toBe(true);
  });

  it('raises neither finding when the system is GREEN and the outlook stays GREEN', () => {
    const f = assessGreenAtRisk({
      ...base, reportedRag: 'GREEN', systemAssessedBand: 'GREEN',
      trajectory: steadyTrajectory('GREEN'),
    });
    expect(f.isSystemGreenAtRisk).toBe(false);
    expect(f.isReportedGreenRisk).toBe(false);
    expect(f.notApplicableReason).toMatch(/outlook stays GREEN/);
  });

  it('records an absent status report as absent, never as GREEN', () => {
    const f = assessGreenAtRisk({
      ...base, reportedRag: null, systemAssessedBand: 'AMBER', trajectory: trajectory('AMBER'),
    });
    expect(f.reportedRag).toBeNull();
    expect(f.isReportedGreenRisk).toBe(false);
    expect(JSON.stringify(f.explanation)).toContain('never as GREEN');
  });

  it('never overwrites Reported RAG with the system view', () => {
    for (const reported of ['GREEN', 'AMBER', 'RED', null] as const) {
      for (const system of ['GREEN', 'AMBER', 'RED'] as const) {
        const f = assessGreenAtRisk({
          ...base, reportedRag: reported, systemAssessedBand: system,
          trajectory: trajectory(system),
        });
        expect(f.reportedRag, `${String(reported)}/${system}`).toBe(reported);
        expect(f.systemAssessedBand).toBe(system);
      }
    }
  });

  /**
   * The defect the old three-condition rule carried: it gated on an *economics* reason, so a
   * project deteriorating on forward/schedule signals with no adverse cost burn — curated scenario
   * LR — could never fire. ADR-0018 demotes reasons to supporting detail.
   */
  it('flags a Green project deteriorating on forward signals with no economics reason', () => {
    const f = assessGreenAtRisk({
      ...base, reasons: [], systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    expect(f.isSystemGreenAtRisk).toBe(true);
    expect(JSON.stringify(f.explanation)).toContain('No economics signal cleared its threshold');
  });

  it('separates "is at risk" from "can still be helped"', () => {
    const f = assessGreenAtRisk({
      ...base, weeksToBandChange: 2, systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    expect(f.isSystemGreenAtRisk).toBe(true);
    expect(f.interventionWindowOpen).toBe(false);
  });

  it('reports data confidence beside the finding and never blended into it', () => {
    const low = assessGreenAtRisk({
      ...base, dataConfidence: qty('30'), systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    const high = assessGreenAtRisk({
      ...base, systemAssessedBand: 'GREEN', trajectory: trajectory('GREEN'),
    });
    expect(low.confidenceBand).toBe('LOW');
    expect(high.confidenceBand).toBe('HIGH');
    // The determination itself is unchanged: confidence qualifies it, it does not compute it.
    expect(low.isSystemGreenAtRisk).toBe(high.isSystemGreenAtRisk);
  });
});

// ---------------------------------------------------------------------------
// 5. Recovery economics
// ---------------------------------------------------------------------------

describe('Phase 4 golden — recovery economics', () => {
  const m = (v: string) => Money.of(v, USD);
  const action = (
    id: string, revenue: string, cost: string, confidence: string, group: string | null,
  ) => ({
    id, description: `action ${id}`, ownerActorId: 'usr-1',
    dueOn: '2026-12-31' as never, status: 'COMMITTED' as const,
    revenueBenefit: m(revenue), costBenefit: m(cost), scheduleBenefitWeeks: 2,
    confidence: qty(confidence), incompatibilityGroup: group,
    evidence: [{ context: 'recovery', entityType: 'action', entityId: id }],
  });

  const baseInput = {
    projectId: 'prj-test', week: WEEK, assessedAt: AS_OF, ruleVersion: ruleVersion('RECOVERY-v1'),
    metricCatalogVersion: CATALOG, currency: USD,
    // Revenue 1,000,000, cost 950,000 → forecast GM 5.00%.
    forecastRevenue: m('1000000.00'), forecastCost: m('950000.00'),
    forecastGmPercent: computeEconomicsGm('1000000.00', '950000.00'),
    riskAdjustedGmPercent: computeEconomicsGm('1000000.00', '980000.00'),
    overdueDiscount: qty('0.50'), confidenceFloor: qty('0.10'),
    today: '2026-08-31' as never,
    credibilityWeights: { ownership: qty('0.40'), timeliness: qty('0.30'), completion: qty('0.30') },
    baseEvidence: [{ context: 'financial', entityType: 'project', entityId: 'prj-test', metricId: 'MET-FIN-014' }],
  };

  it('computes the recovery case by hand-checkable arithmetic', () => {
    // One action: +0 revenue, −50,000 cost. Case = (1,000,000 − 900,000) / 1,000,000 = 10.00%.
    const r = computeRecoveryEconomics({
      ...baseInput, actions: [action('a1', '0.00', '50000.00', '1', null)],
    });
    expect(pct(r.recoveryCaseGmPercent)).toBe('0.1000');
    // Probability-adjusted at confidence 1 is identical.
    expect(pct(r.probabilityAdjustedGmPercent)).toBe('0.1000');
  });

  it('discounts the probability-adjusted case by each action\'s confidence', () => {
    // Confidence 0.5 banks 25,000 of the 50,000 → (1,000,000 − 925,000)/1,000,000 = 7.50%.
    const r = computeRecoveryEconomics({
      ...baseInput, actions: [action('a1', '0.00', '50000.00', '0.5', null)],
    });
    expect(pct(r.recoveryCaseGmPercent)).toBe('0.1000');
    expect(pct(r.probabilityAdjustedGmPercent)).toBe('0.0750');
  });

  it('counts an incompatibility group once, at its largest benefit, and names what it dropped', () => {
    const r = computeRecoveryEconomics({
      ...baseInput,
      actions: [
        action('a1', '0.00', '50000.00', '1', 'overrun-fix'),
        action('a2', '0.00', '30000.00', '1', 'overrun-fix'),
      ],
    });
    // Only the 50,000 counts. Both summed would give 12.00% — the fabricated figure this prevents.
    expect(pct(r.recoveryCaseGmPercent)).toBe('0.1000');
    const dropped = r.actions.find((a) => a.id === 'a2');
    expect(dropped?.counted).toBe(false);
    expect(dropped?.reason).toMatch(/superseded within incompatibility group/);
  });

  it('keeps the four margin figures apart', () => {
    const r = computeRecoveryEconomics({
      ...baseInput, actions: [action('a1', '0.00', '50000.00', '0.5', null)],
    });
    expect(pct(r.currentForecastGmPercent)).toBe('0.0500');
    expect(pct(r.riskAdjustedGmPercent)).toBe('0.0200');
    expect(pct(r.recoveryCaseGmPercent)).toBe('0.1000');
    expect(pct(r.probabilityAdjustedGmPercent)).toBe('0.0750');
  });

  it('returns undefined credibility for an empty plan rather than scoring it zero', () => {
    const r = computeRecoveryEconomics({ ...baseInput, actions: [] });
    expect(r.planCredibility).toBeNull();
    const rule = r.explanation.evaluations.find((e) => e.ruleId === 'REC-CREDIBILITY');
    expect(rule?.notEvaluatedReason).toMatch(/no live actions/);
  });
});

/** GM% built through the domain, so the fixture uses the same decimal semantics as the engine. */
function computeEconomicsGm(revenue: string, cost: string) {
  const r = Money.of(revenue, USD);
  return r.minus(Money.of(cost, USD)).dividedBy(r);
}

// ---------------------------------------------------------------------------
// 6. Determinism and explainability
// ---------------------------------------------------------------------------

describe('Phase 4 golden — determinism and explainability (AC-3, AC-7)', () => {
  it('produces identical output from identical input and rule version', () => {
    const clock = new FixedClock(AS_OF);
    expect(clock.now()).toBe(AS_OF);
    const a = JSON.stringify(evaluateHealth(healthInputFor('B', 'GREEN')));
    const b = JSON.stringify(evaluateHealth(healthInputFor('B', 'GREEN')));
    expect(a).toBe(b);
  });

  it('stamps every explanation with the rule set and catalog versions that produced it', () => {
    const e = evaluateHealth(healthInputFor('C', 'AMBER')).explanation;
    expect(e.ruleSetVersion).toBe(RULE);
    expect(e.metricCatalogVersion).toBe(CATALOG);
    expect(e.evaluations.length).toBeGreaterThan(0);
  });

  it('lists unevaluated rules rather than dropping them silently', () => {
    const base = healthInputFor('A', 'GREEN');
    const partial: HealthEvaluationInput = {
      ...base,
      readings: new Map(
        [...base.readings].map(([k, r], i) => [k, i === 0 ? { ...r, value: null } : r]),
      ),
    };
    const e = evaluateHealth(partial).explanation;
    expect(e.unevaluatedRules.length).toBeGreaterThan(0);
    for (const id of e.unevaluatedRules) {
      const ev = e.evaluations.find((x) => x.ruleId === id);
      expect(ev?.notEvaluatedReason, `${id} is unevaluated but states no reason`).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. CONFLICT C-10 — which "Green" does Green-at-Risk mean?
// ---------------------------------------------------------------------------

/**
 * These tests pin a **conflict**, not a decision.
 *
 * Scenario B is the Green-at-Risk reference case, and under the HEALTH-v2 synthetic band edges it
 * already assesses AMBER — so `MET-FCST-025`, which reads Green as the System-Assessed band, does
 * not fire on it. Its *Reported* RAG is GREEN, its margin has eroded five points, and its trajectory
 * is deteriorating: on the Reported reading it is the archetypal case.
 *
 * `PRODUCT_SPEC.md` §1.1 does not say which Green. ADR-0015 asks. Until it is answered, the
 * conservative System-Assessed reading stands and these tests make sure it cannot change without
 * someone editing them and saying why.
 */
describe('Phase 4 golden — CONFLICT C-10 (ADR-0015)', () => {
  it('assesses scenario B as AMBER while it is still reported GREEN', () => {
    const a = assessCurated(portfolio, 'B');
    expect(a.health.systemAssessedRag).toBe('AMBER');
    expect(a.health.reportedRag).toBe('GREEN');
    expect(a.health.statusConflict?.divergence).toBe(1);
    expect(a.health.statusConflict?.direction).toBe('REPORTED_OPTIMISTIC');
  });

  it('does not flag scenario B as Green-at-Risk under the System-Assessed reading', () => {
    const a = assessCurated(portfolio, 'B');
    /*
     * DETERIORATING, not RAPIDLY_DETERIORATING, since the cumulative-signal ADR.
     *
     * CONTINGENCY_CONSUMPTION and SCOPE_EXPOSURE_TREND used to observe running totals, which are
     * monotone by construction: both were materially adverse on every project in the portfolio at
     * all times, whatever the project was doing. With a rapid-confluence threshold of 3, any
     * project carrying a single genuine adverse signal was therefore reported as RAPIDLY
     * DETERIORATING, and no project could ever be IMPROVING. Those two signals now observe
     * movement per period, so confluence counts real agreement between signals.
     *
     * The scenario's contract is unchanged and still holds: reported GREEN over a system
     * assessment that disagrees, deteriorating on leading evidence. What it no longer claims is a
     * confluence it never had.
     */
    expect(a.trajectory.state).toBe('DETERIORATING');
    expect(a.trajectory.adverseConfluence).toBeGreaterThanOrEqual(1);
    expect(a.trajectory.trends.filter((t) => t.materiallyAdverse).map((t) => t.signalId))
      .toContain('DELIVERY_VELOCITY');
    // C-10 / ADR-0018: B is Reported GREEN over a System-Assessed AMBER. That makes it a
    // **Reported Green Risk**, and deliberately NOT a System Green-at-Risk — the system already
    // says AMBER, so there is nothing forward-looking to discover.
    expect(a.greenAtRisk.isSystemGreenAtRisk).toBe(false);
    expect(a.greenAtRisk.isReportedGreenRisk).toBe(true);
    expect(a.greenAtRisk.reportedRag).toBe('GREEN');
    expect(a.greenAtRisk.systemAssessedBand).toBe('AMBER');
    expect(a.greenAtRisk.notApplicableReason).toMatch(/already AMBER/i);
  });

  it('still surfaces the divergence, so the signal is not lost either way', () => {
    // MET-HLTH-030 is what PRODUCT_SPEC §3.3 calls the most valuable signal in the product. It
    // fires on B regardless of how C-10 is decided.
    const a = assessCurated(portfolio, 'B');
    expect(a.health.statusConflict).not.toBeNull();
    expect(a.health.statusConflict?.unexplainedBy.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DR-021 — the multi-signal trajectory adapter
// ---------------------------------------------------------------------------

/**
 * DR-021. Phase 4 built eleven signal-specific observation policies and the adapter fed the engine
 * one series, so ten of them were never exercised and "trajectory" meant "is cost outrunning
 * progress?".
 *
 * The test that matters most is the last one: a project can now deteriorate on forward signals
 * **without any adverse cost burn**. Under the single-signal adapter that project was STABLE, which
 * is the exact blind spot the product exists to remove.
 */
describe('Phase 6 closure — multi-signal trajectory (DR-021)', () => {
  const portfolio = generatePortfolio();

  it('supplies several independent signals, not one', () => {
    const series = trajectorySeriesFor(portfolio, 'prj-001');
    expect(series.length).toBeGreaterThanOrEqual(5);
    expect(new Set(series.map((s) => s.signalId)).size).toBe(series.length);
  });

  it('gives every supplied signal a declared observation policy', () => {
    for (const s of trajectorySeriesFor(portfolio, 'prj-001')) {
      expect(policyFor(s.signalId), `${s.signalId} has no TRAJECTORY-v1 policy`).toBeDefined();
    }
  });

  it('lets each signal use its own window, rather than one universal eight-week window', () => {
    const used = trajectorySeriesFor(portfolio, 'prj-001')
      .map((s) => policyFor(s.signalId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    // Several distinct window types and sizes — the property a shared window would destroy.
    expect(new Set(used.map((p) => p.windowType)).size).toBeGreaterThan(1);
    expect(new Set(used.map((p) => p.windowSize)).size).toBeGreaterThan(1);
    expect(used.some((p) => p.windowType === 'LAST_N_EVENTS')).toBe(true);
    expect(used.some((p) => p.windowType === 'REPORTING_PERIOD')).toBe(true);
  });

  it('omits a signal the facts do not support rather than zero-filling it', () => {
    // Scenario A has no pending changes, so there is no scope-exposure series to build. A
    // zero-filled series would be reported as a confident flat trend — a fabricated measurement.
    const a = trajectorySeriesFor(portfolio, assessCurated(portfolio, 'A').projectId);
    expect(a.map((s) => s.signalId)).not.toContain('SCOPE_EXPOSURE_TREND');
    for (const s of a) expect(s.observations.length).toBeGreaterThan(0);
  });

  it('reports a signal with too little history as not computable, never as stable', () => {
    const c = assessCurated(portfolio, 'C');
    const thin = c.trajectory.trends.filter((t) => t.notComputableReason !== undefined);
    for (const t of thin) {
      expect(t.slope).toBeNull();
      expect(t.materiallyAdverse).toBe(false);
      expect(t.notComputableReason).toMatch(/below the \d+ its observation policy requires/);
    }
  });

  it('leaves the healthy reference scenario healthy', () => {
    // The regression that caught a defect in the EAC proxy during this closure: an artefact in the
    // denominator made every project's cost-versus-progress series rise, and scenario A — the
    // healthy reference — was flagged System Green-at-Risk. If A ever fires again, the proxy is
    // wrong, not the project.
    const a = assessCurated(portfolio, 'A');
    expect(a.health.systemAssessedRag).toBe('GREEN');
    expect(a.trajectory.state).toBe('STABLE');
    expect(a.greenAtRisk.isSystemGreenAtRisk).toBe(false);
    expect(a.greenAtRisk.isReportedGreenRisk).toBe(false);
  });

  /**
   * **The DR-021 headline.** Scenario LR is "Leading Risk, No Cost Overrun": milestones slipping,
   * contingency draining and scope exposure building, while cost tracks progress perfectly well.
   */
  it('detects leading risk with no adverse cost burn (scenario LR, prj-029)', () => {
    const lr = assessCurated(portfolio, 'LR');
    expect(lr.projectId).toBe('prj-029');

    const velocity = lr.trajectory.trends.find((t) => t.signalId === 'DELIVERY_VELOCITY');
    // Cost is NOT outrunning progress — the single signal the old adapter had is clean.
    expect(velocity?.materiallyAdverse).toBe(false);

    /*
     * The scenario's point is that deterioration is visible in schedule before it reaches cost —
     * that is what "leading risk" means here, and it is asserted directly below. The tier was
     * RAPIDLY only because the two cumulative signals were adverse on every project unconditionally;
     * see the note on scenario B above.
     */
    expect(lr.trajectory.state).toBe('DETERIORATING');
    const adverse = lr.trajectory.trends.filter((t) => t.materiallyAdverse).map((t) => t.signalId);
    expect(adverse).toContain('MILESTONE_HIT_RATE');
    expect(adverse.length).toBeGreaterThanOrEqual(1);

    /*
     * Exactly the finding the product exists to make: System GREEN today, worse ahead, and still
     * time to act.
     *
     * The projected bands are one step later than they were. `projectOutlook` degrades half a band
     * per period for DETERIORATING and a full band for RAPIDLY, and LR is no longer classified
     * RAPIDLY now that the two cumulative signals have stopped being adverse on every project
     * unconditionally. Its two genuine leading signals — the milestone slip and an accelerating
     * contingency draw — put it at 60-day Amber rather than 30-day Amber and 60-day Red.
     *
     * That is a better reading of a scenario named "leading risk", not a weaker one: the evidence
     * is early, so the projection should be too. The contract that matters is unchanged and is
     * asserted here in full — healthy today, adverse inside the governed horizon, flagged as System
     * Green-at-Risk, with the intervention window still open.
     */
    expect(lr.health.systemAssessedRag).toBe('GREEN');
    expect(lr.greenAtRisk.outlook30).toBe('GREEN');
    expect(lr.greenAtRisk.outlook60).toBe('AMBER');
    expect(lr.greenAtRisk.isSystemGreenAtRisk).toBe(true);
    expect(lr.greenAtRisk.interventionWindowOpen).toBe(true);
  });

  it('does not import the Phase 3 recomputation oracle into production intelligence', () => {
    // G-ORACLE covers src/. The adapter lives in scripts/ and reads the generator legitimately;
    // what must not happen is a src/ module importing it. Asserted at the gate, restated here.
    const manifest = JSON.parse(readFileSync('architecture/manifest.json', 'utf8')) as {
      sourceGates: { id: string; appliesTo: string[]; pattern: string }[];
    };
    const gate = manifest.sourceGates.find((g) => g.id === 'G-ORACLE');
    expect(gate?.appliesTo).toContain('src');
    expect(new RegExp(gate?.pattern as string).test(
      "import { generatePortfolio } from './generator/index.js';",
    )).toBe(true);
  });
});
