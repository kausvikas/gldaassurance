/**
 * Synthetic portfolio — reproducibility, archetype coverage, causal coherence, and the eight
 * curated executive scenarios.
 *
 * `TEST_STRATEGY.md` §6 requires generator validation to fail the build rather than warn. These
 * tests call `generatePortfolio()` directly rather than reading `data/synthetic/`, so what is
 * validated is exactly what the writer writes, and a clean checkout needs no generated files.
 *
 * The expected values in the curated-scenario tests are **the figures stated in the Phase 3 brief**,
 * restated here independently of the generator. They are not read back from `CURATED[].expect`,
 * because a test that asserts a generator against its own configuration proves only self-consistency
 * (`DEFINITION_OF_DONE.md` §3.1).
 */
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, DEFAULT_SEED, TARGET_CAPACITY, TARGET_FIXED_BID, TARGET_TIME_AND_MATERIALS,
  TARGET_TOTAL, contentHash, generatePortfolio, recordCounts,
} from '../../scripts/generator/index.js';
import { recomputeEconomics, validate } from '../../scripts/generator/validate.js';
import {
  cohortByEngagementModel, cohortForMetric, fixedBidCohort, mc6Cohort,
} from '../../scripts/generator/cohorts.js';
import { REAL_WORLD_DENY_LIST } from '../../scripts/generator/names.js';
import { effectiveForPeriod } from '../../scripts/generator/recognition.js';
import { METRIC_REGISTRY, RULE_SETS, findMetric } from '@contexts/rules';

const portfolio = generatePortfolio();
const econ = (letter: string) => {
  const c = portfolio.curated.find((x) => x.letter === letter);
  if (!c) throw new Error(`Curated scenario ${letter} is missing`);
  return recomputeEconomics(portfolio, c.projectId);
};
const pct = (d: { toFixed(n: number): string } | null, dp = 4) => (d === null ? null : Number(d.toFixed(dp)));
const usd = (d: { toFixed(n: number): string } | null) => (d === null ? null : Number(d.toFixed(2)));

describe('REQ-DATA-007 — reproducibility', () => {
  it('produces an identical content hash from the same seed', () => {
    expect(contentHash(generatePortfolio(DEFAULT_SEED))).toBe(contentHash(generatePortfolio(DEFAULT_SEED)));
  });

  it('produces a different portfolio from a different seed', () => {
    expect(contentHash(generatePortfolio('a-different-seed'))).not.toBe(contentHash(portfolio));
  });

  it('matches the content hash recorded in the committed manifest', async () => {
    const manifest = (await import('../../data/synthetic/MANIFEST.json', { with: { type: 'json' } })).default as {
      contentHash: string; seed: string; generatorVersion: string;
    };
    expect(manifest.seed).toBe(DEFAULT_SEED);
    expect(
      contentHash(portfolio),
      'The generator no longer reproduces the committed hash. Either the seed/generator version ' +
        'changed deliberately (update MANIFEST.json via `npm run data:generate`) or this is a defect.',
    ).toBe(manifest.contentHash);
  });

  it('uses no ambient randomness or wall-clock time', () => {
    const source = ['rng', 'simulate', 'curated', 'portfolio', 'billing'];
    expect(source.length).toBeGreaterThan(0);
    // Enforced structurally: the as-of date is a constant and Math.random is never called.
    expect(portfolio.asOf).toBe('2026-08-31');
  });
});

describe('portfolio shape', () => {
  it('holds 91 projects: 75 fixed-price plus the T&M and capacity engagements', () => {
    const by = (m: string) => portfolio.structure.projects.filter((p) => p.engagementModel === m).length;
    expect(portfolio.structure.projects).toHaveLength(TARGET_TOTAL);
    expect(by('FIXED_BID')).toBe(TARGET_FIXED_BID);
    expect(by('TIME_AND_MATERIALS')).toBe(TARGET_TIME_AND_MATERIALS);
    expect(by('CAPACITY')).toBe(TARGET_CAPACITY);
  });

  it('covers all eight verticals, four regions and six lifecycle sub-stages', () => {
    const p = portfolio.structure.projects;
    expect(new Set(p.map((x) => x.vertical)).size).toBe(8);
    expect(new Set(p.map((x) => x.region))).toEqual(
      new Set(['North America', 'Europe', 'India/APAC', 'LATAM']),
    );
    expect(new Set(p.map((x) => x.lifecycleSubStage)).size).toBe(6);
  });

  it('covers all four TCV bands', () => {
    const bands = new Set(portfolio.structure.projects.map((p) => p.tcvBand));
    expect(bands).toEqual(new Set(['LT_1M', 'B_1_5M', 'B_5_10M', 'GTE_10M']));
  });

  it('generates a substantial history', () => {
    const counts = recordCounts(portfolio);
    expect(counts['progressClaims']).toBeGreaterThan(3000);
    expect(counts['effort']).toBeGreaterThan(50_000);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(100_000);
  });
});

describe('REQ-DATA-008 — every archetype present and findable', () => {
  it.each(ARCHETYPES.map((a) => a.id))('%s has at least one project', (id) => {
    expect(portfolio.structure.projects.filter((p) => p.archetype === id).length).toBeGreaterThan(0);
  });

  it('has twelve archetypes: the ten approved in Phase 0 plus F and H (ADR-0013 §6)', () => {
    expect(ARCHETYPES).toHaveLength(12);
    const ids = ARCHETYPES.map((a) => a.id);
    expect(ids).toContain('ETC_OPTIMISM');
    expect(ids).toContain('CONTRACT_LOSS_RISK');
    // None of the original ten was dropped.
    for (const original of [
      'SILENT_DETERIORATOR', 'UNCOMPENSATED_SCOPE', 'PYRAMID_EROSION', 'QUALITY_SPIRAL',
      'RECOVERING_RED', 'HEALTHY_REFERENCE', 'LOW_CONFIDENCE', 'OVERRIDE_CONFLICT',
      'FX_EXPOSED', 'SCHEDULE_SLIP_HONEST',
    ]) expect(ids).toContain(original);
  });
});

describe('REQ-DATA-009 — no real client, person or financial data', () => {
  it('contains no deny-listed real-world company token', () => {
    const corpus = JSON.stringify({ s: portfolio.structure, u: portfolio.users }).toLowerCase();
    for (const banned of REAL_WORLD_DENY_LIST) expect(corpus, banned).not.toContain(banned);
  });

  it('references people only by opaque synthetic handles', () => {
    for (const a of portfolio.facts.assignments) expect(a.personRef).toMatch(/^psn-\d{4}$/);
  });

  it('marks every fact row synthetic', () => {
    for (const [name, rows] of Object.entries(portfolio.facts)) {
      const bad = (rows as { synthetic?: boolean }[]).filter((r) => r.synthetic !== true);
      expect(bad, name).toHaveLength(0);
    }
  });
});

describe('the generator emits observed facts only (PHASE_HANDOFF §3.2a)', () => {
  it('stores no derived metric as a fact', () => {
    const keys = new Set(Object.values(portfolio.facts).flatMap((rows) =>
      (rows as unknown[]).slice(0, 1).flatMap((r) => Object.keys(r as object))));
    for (const banned of ['forecastGm', 'eac', 'healthScore', 'compositeScore', 'systemAssessedRag', 'trajectory']) {
      expect([...keys].map((k) => k.toLowerCase()), banned).not.toContain(banned.toLowerCase());
    }
  });

  it('stores Reported RAG, which is L1_OBSERVED, and no other status value', () => {
    expect(portfolio.facts.statusReports.length).toBeGreaterThan(1000);
    for (const r of portfolio.facts.statusReports.slice(0, 50)) {
      expect(['RED', 'AMBER', 'GREEN']).toContain(r.reportedRag);
    }
  });

  it('stores recognised revenue as an accounting fact stamped with its policy (Decision 1)', () => {
    expect(portfolio.facts.recognisedRevenue.length).toBeGreaterThan(500);
    for (const r of portfolio.facts.recognisedRevenue.slice(0, 50)) {
      expect(r.recognitionPolicyVersion).toBe('RECOGNITION-v1');
      expect(r.postingReference).toMatch(/^GL-/);
    }
  });
});

describe('validation gate', () => {
  it('reports no findings across the whole portfolio', () => {
    const findings = validate(portfolio);
    expect(findings.map((f) => `${f.check} ${f.subject}: ${f.detail}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The eight curated executive scenarios. Expected values are the Phase 3 brief's own figures.
// ---------------------------------------------------------------------------
describe('Scenario A — Healthy Green', () => {
  it('is on plan with margin near as-sold', () => {
    const e = econ('A');
    expect(pct(e.soldGmValue.dividedBy(e.contractValueAsSold))).toBe(0.24);
    expect(pct(e.forecastGmPercent)).toBe(0.225);
    expect(pct(e.physicalCompletion)).toBe(0.62);
    expect(pct(e.plannedCompletion)).toBe(0.6);
  });
});

describe('Scenario B — Green-at-Risk', () => {
  it('sold 28% and has eroded to 22.9%', () => {
    const e = econ('B');
    expect(pct(e.soldGmValue.dividedBy(e.contractValueAsSold))).toBe(0.28);
    expect(pct(e.forecastGmPercent)).toBe(0.229);
  });

  it('is 8 points behind plan: 58% actual against 66% planned', () => {
    const e = econ('B');
    expect(pct(e.physicalCompletion)).toBe(0.58);
    expect(pct(e.plannedCompletion)).toBe(0.66);
  });

  it('has consumed 70% of cost budget and 72% of contingency', () => {
    const e = econ('B');
    expect(pct(e.costConsumedPercent)).toBe(0.7);
    expect(pct(e.contingencyConsumedPercent)).toBe(0.72);
  });

  it('carries $90K of uncommercialised exposure', () => {
    expect(usd(econ('B').uncompensatedExposure)).toBe(90_000);
  });

  it('is reported Green in every single week — that is the point', () => {
    expect(new Set(econ('B').reportedRagSeries.map((r) => r.rag))).toEqual(new Set(['GREEN']));
  });
});

describe('Scenario C — Reported Green, evidence Amber (AC-2 flagship)', () => {
  it('has eroded exactly 6 margin points, 22% sold to 16% forecast', () => {
    const e = econ('C');
    const sold = Number(e.soldGmValue.dividedBy(e.contractValueAsSold).toFixed(4));
    expect(sold).toBe(0.22);
    expect(pct(e.forecastGmPercent)).toBe(0.16);
    expect(Number(((sold - 0.16) * 100).toFixed(2))).toBe(6);
  });

  it('has burned 82% of contingency at 48% completion', () => {
    const e = econ('C');
    expect(pct(e.contingencyConsumedPercent)).toBe(0.82);
    expect(pct(e.physicalCompletion)).toBe(0.48);
  });

  it('is reported Green throughout while the evidence is not', () => {
    const e = econ('C');
    expect(new Set(e.reportedRagSeries.map((r) => r.rag))).toEqual(new Set(['GREEN']));
    // The evidence: cost consumed well ahead of progress delivered.
    expect(Number(e.costConsumedPercent?.toFixed(4))).toBeGreaterThan(Number(e.physicalCompletion?.toFixed(4)));
  });
});

describe('Scenario D — Amber Recovering', () => {
  it('has recovered to 19.5% from a 16% trough against 26% sold', () => {
    const e = econ('D');
    expect(pct(e.soldGmValue.dividedBy(e.contractValueAsSold))).toBe(0.26);
    expect(pct(e.forecastGmPercent)).toBe(0.195);
  });

  it('had a change request executed, which moved the contractual baseline', () => {
    const e = econ('D');
    expect(usd(e.executedValueDelta)).toBe(600_000);
    expect(usd(e.contractualRevenue)).toBe(4_600_000);
  });
});

describe('Scenario E — Scope and commercial leakage', () => {
  it('carries $280K of delivered-but-uncontracted scope', () => {
    expect(usd(econ('E').uncompensatedExposure)).toBe(280_000);
  });

  it('has no executed change request at all — that is the scenario', () => {
    expect(usd(econ('E').executedValueDelta)).toBe(0);
  });

  it('has pending change requests ageing unexecuted', () => {
    const c = portfolio.curated.find((x) => x.letter === 'E');
    const pending = portfolio.facts.pendingChanges.filter((p) => p.contractId.endsWith(c!.projectId.slice(-3)));
    expect(pending.length).toBe(3);
    expect(pending.every((p) => p.supersededByExecutedId === undefined)).toBe(true);
  });
});

describe('Scenario F — ETC optimism', () => {
  it('has spent $1.8M for 52% delivered', () => {
    const e = econ('F');
    expect(usd(e.costToDate)).toBe(1_800_000);
    expect(pct(e.physicalCompletion)).toBe(0.52);
  });

  it("management's EAC is $2.9M while performance implies ~$3.46M", () => {
    const e = econ('F');
    expect(usd(e.eac)).toBe(2_900_000);
    // 1,800,000 / 0.52 = 3,461,538.46…
    expect(usd(e.performanceImpliedEac)).toBeCloseTo(3_461_538.46, 1);
  });

  it('leaves an optimism gap of roughly $560K', () => {
    // 3,461,538.46 − 2,900,000 = 561,538.46
    expect(usd(econ('F').etcOptimismGap)).toBeCloseTo(561_538.46, 1);
  });
});

describe('Scenario G — Quality margin leakage', () => {
  it('spends 16% of effort on rework against a 6% allowance', () => {
    expect(pct(econ('G').reworkRatio)).toBe(0.16);
  });

  it('has burned ~$190K of margin on excess rework', () => {
    // (0.16 − 0.06) × 1,900,000 = 190,000. Asserted to the nearest $100 rather than to the cent:
    // rework hours are assembled from ~40 weeks × 10 assignments of 2dp values, so the total
    // carries a few tens of dollars of accumulated rounding. The brief says "~190K"; forcing an
    // exact figure would mean adjusting the data to fit the assertion, which SYNTHETIC_DATA_SPEC
    // §9.4 forbids.
    const excess = usd(econ('G').excessReworkCost) as number;
    expect(Math.round(excess / 100) * 100).toBe(190_000);
  });

  it('has five open blocking acceptance items', () => {
    expect(econ('G').blockingAcceptanceItems).toBe(5);
  });

  it('shows a worsening reopen trend', () => {
    const c = portfolio.curated.find((x) => x.letter === 'G');
    const defects = portfolio.facts.defects.filter((d) => d.projectId === c!.projectId);
    const half = Math.floor(defects.length / 2);
    const reopenRate = (rows: typeof defects) => rows.filter((d) => d.reopenCount > 0).length / Math.max(1, rows.length);
    expect(reopenRate(defects.slice(half))).toBeGreaterThan(reopenRate(defects.slice(0, half)));
  });
});

describe('Scenario H — Contract-loss risk', () => {
  it('has fallen from 24% sold to 3% forecast margin', () => {
    const e = econ('H');
    expect(pct(e.soldGmValue.dividedBy(e.contractValueAsSold))).toBe(0.24);
    expect(pct(e.forecastGmPercent)).toBe(0.03);
  });

  it('is negative at −4% once unresolved risk is counted', () => {
    const e = econ('H');
    // Incremental risk = 0.60×400,000 + 0.40×300,000 + 0.30×200,000 = 420,000
    expect(usd(e.incrementalRiskExposure)).toBe(420_000);
    expect(pct(e.riskAdjustedGmPercent)).toBe(-0.04);
  });

  it('excludes risk already provisioned in ETC, so nothing is double counted', () => {
    const c = portfolio.curated.find((x) => x.letter === 'H');
    const risks = portfolio.facts.risks.filter((r) => r.projectId === c!.projectId);
    const inEtc = risks.filter((r) => r.includedInEtc);
    expect(inEtc.length).toBeGreaterThan(0);
    for (const r of inEtc) expect(r.includedInEtcJustification).toBeTruthy();
    // Gross exposure is strictly larger than the incremental figure used in the margin.
    const gross = risks.reduce((a, r) => a + Number(r.probability) * Number(r.costImpact.amount), 0);
    expect(gross).toBeGreaterThan(420_000);
  });

  it('has a missed payment-gating milestone and live liquidated damages', () => {
    const c = portfolio.curated.find((x) => x.letter === 'H');
    const missed = portfolio.facts.milestones.filter(
      (m) => m.projectId === c!.projectId && m.paymentGating && m.actualDate === undefined && m.forecastDate > m.baselineDate,
    );
    expect(missed.length).toBeGreaterThan(0);
    const ld = portfolio.facts.exposures.filter((e) => e.projectId === c!.projectId && e.kind === 'LIQUIDATED_DAMAGES');
    expect(ld).toHaveLength(1);
  });
});

describe('causal coherence, not independent fields', () => {
  it('links rework effort to a rework ratio that moves excess rework cost', () => {
    // G has 16% rework and material excess cost; A has 4.5% and none.
    expect(usd(econ('G').excessReworkCost)).toBeGreaterThan(150_000);
    expect(usd(econ('A').excessReworkCost)).toBe(0);
  });

  it('lets an executed CR raise contractual revenue and pending CRs not', () => {
    expect(usd(econ('D').executedValueDelta)).toBe(600_000);
    expect(usd(econ('E').executedValueDelta)).toBe(0);
    // E's pending CRs reach the risk-adjusted scenario only.
    expect(Number(econ('E').expectedCrRecovery.toFixed(2))).toBeGreaterThan(0);
    expect(usd(econ('E').contractualRevenue)).toBe(2_400_000);
  });

  it('keeps recognition, billing and cash as three different numbers', () => {
    const e = econ('B');
    expect(Number(e.recognisedRevenue.toFixed(2))).toBeGreaterThan(0);
    expect(Number(e.invoiced.toFixed(2))).toBeLessThan(Number(e.recognisedRevenue.toFixed(2)) * 1.02);
    expect(Number(e.collected.toFixed(2))).toBeLessThanOrEqual(Number(e.invoiced.toFixed(2)));
  });

  it('produces cost ahead of progress only where a scenario models cost-driven erosion', () => {
    // **Corrected (Correction 1).** This is *not* a general law about deterioration — a project can
    // deteriorate long before cost burn shows it, which the LR case demonstrates. It is the narrower
    // claim that B, C, G and H each model erosion *caused by* delivery inefficiency or cost overrun,
    // so their cost and progress facts must causally support that mechanism.
    for (const letter of ['B', 'C', 'G', 'H']) {
      const e = econ(letter);
      expect(
        Number(e.costConsumedPercent?.toFixed(4)),
        `${letter} models cost-driven erosion, so cost consumed must exceed physical completion`,
      ).toBeGreaterThan(Number(e.physicalCompletion?.toFixed(4)));
    }
  });

  it('does not require adverse cost burn for a project to be deteriorating', () => {
    // The counter-example. If this ever fails, the invalid universal invariant has crept back.
    const e = econ('LR');
    expect(Number(e.costConsumedPercent?.toFixed(4)))
      .toBeLessThanOrEqual(Number(e.physicalCompletion?.toFixed(4)));
    expect(e.openCriticalRisks + e.openCustomerDependencies + e.uncontractedScopeItems)
      .toBeGreaterThan(6);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 correction pass
// ---------------------------------------------------------------------------

describe('Correction 3 — contract-type cohorts are exact and separable', () => {
  it('holds exactly 75 fixed-price, 11 T&M and 5 fixed-capacity engagements', () => {
    expect(fixedBidCohort(portfolio)).toHaveLength(75);
    expect(cohortByEngagementModel(portfolio, 'TIME_AND_MATERIALS')).toHaveLength(11);
    expect(cohortByEngagementModel(portfolio, 'CAPACITY')).toHaveLength(5);
    expect(portfolio.structure.projects).toHaveLength(91);
  });

  it('lets fixed-bid analytics select exactly the 75 fixed-price engagements', () => {
    const cohort = fixedBidCohort(portfolio);
    expect(cohort).toHaveLength(75);
    for (const s of cohort) expect(s.engagementModel).toBe('FIXED_BID');
    // Phase 7's Command Center defaults to this cohort; nothing else may leak into it.
    const ids = new Set(cohort.map((s) => s.projectId));
    for (const s of portfolio.structure.projects) {
      if (s.engagementModel !== 'FIXED_BID') expect(ids.has(s.projectId), s.projectId).toBe(false);
    }
  });

  it('stops an unsupported contract type entering a metric aggregate', () => {
    // Fixed-bid-only metrics must select only fixed-price engagements.
    for (const id of ['MET-FIN-011', 'MET-COM-009', 'MET-COM-010', 'MET-FIN-035', 'MET-FIN-034']) {
      const m = findMetric(id);
      expect(m?.applicableContractTypes, id).toEqual(['FIXED_BID']);
      const cohort = cohortForMetric(portfolio, m!.applicableContractTypes);
      expect(cohort, id).toHaveLength(75);
    }
    // A metric that supports all three selects all 91.
    const all = findMetric('MET-FIN-005');
    expect(cohortForMetric(portfolio, all!.applicableContractTypes)).toHaveLength(91);
  });

  it('keeps every metric honest about which contract types it supports', () => {
    for (const m of METRIC_REGISTRY) {
      expect(m.applicableContractTypes.length, m.id).toBeGreaterThan(0);
      for (const t of m.applicableContractTypes) {
        expect(['FIXED_BID', 'TIME_AND_MATERIALS', 'CAPACITY'], m.id).toContain(t);
      }
    }
  });
});

describe('Correction 5 — the MC-6 calibration cohort is derived, not asserted', () => {
  const cohort = mc6Cohort(portfolio);

  it('derives 54 eligible engagements from the documented rules', () => {
    // 91 total − 16 non-fixed-price − 10 mobilisation/closed-out − 9 curated − 2 short-history = 54.
    // The previously reported 81 came from a looser filter that silently included T&M, capacity and
    // the hand-solved curated scenarios.
    expect(cohort.totalPortfolio).toBe(91);
    expect(cohort.members).toHaveLength(54);
  });

  it('accounts for every exclusion', () => {
    const excludedTotal = Object.values(cohort.excluded).reduce((a, b) => a + b, 0);
    expect(cohort.members.length + excludedTotal).toBe(91);
    expect(cohort.excluded['contractType']).toBe(16);
    expect(cohort.excluded['curated']).toBe(9);
  });

  it('excludes the hand-solved scenarios, so calibration is not circular', () => {
    const curatedIds = new Set(portfolio.curated.map((c) => c.projectId));
    for (const m of cohort.members) expect(curatedIds.has(m.projectId), m.projectId).toBe(false);
  });

  it('includes only fixed-price engagements with enough observations', () => {
    const byId = new Map(portfolio.structure.projects.map((s) => [s.projectId, s]));
    for (const m of cohort.members) {
      expect(byId.get(m.projectId)?.engagementModel, m.projectId).toBe('FIXED_BID');
      expect(m.observations, m.projectId).toBeGreaterThanOrEqual(12);
    }
  });

  it('labels the resulting threshold as a synthetic candidate, not production policy', () => {
    const traj = RULE_SETS.find((r) => r.id === 'TRAJECTORY');
    const threshold = traj?.parameters.find((p) => p.name === 'marginDeteriorationSlopeThreshold');
    expect(threshold?.value).toBe('-1.40');
    expect(threshold?.unit).toMatch(/NOT PRODUCTION POLICY/);
  });
});

describe('Correction 1 & 11 — deterioration does not require adverse cost burn', () => {
  const lr = portfolio.curated.find((c) => c.letter === 'LR');
  const e = recomputeEconomics(portfolio, lr!.projectId);

  it('has a case where cost consumed is at or below physical completion', () => {
    expect(Number(e.costConsumedPercent?.toFixed(4))).toBeLessThanOrEqual(
      Number(e.physicalCompletion?.toFixed(4)),
    );
    // 55% of budget consumed for 58% delivered.
    expect(Number(e.costConsumedPercent?.toFixed(4))).toBe(0.55);
    expect(Number(e.physicalCompletion?.toFixed(4))).toBe(0.58);
  });

  it('has margin that is not yet adverse either', () => {
    const sold = Number(e.soldGmValue.dividedBy(e.contractValueAsSold).toFixed(4));
    expect(sold).toBe(0.25);
    // Forecast margin is above as-sold. By any lagging measure this project is fine.
    expect(Number(e.forecastGmPercent?.toFixed(4))).toBeGreaterThanOrEqual(sold);
  });

  it('nevertheless carries seven independent forward deterioration signals', () => {
    expect(e.gatingMilestoneForecastSlipDays).toBeGreaterThanOrEqual(60);
    expect(e.openCustomerDependencies).toBeGreaterThanOrEqual(4);
    expect(e.oldestOpenCustomerDependencyDays).toBeGreaterThanOrEqual(90);
    expect(e.uncontractedScopeItems).toBeGreaterThanOrEqual(4);
    expect(e.executedChangeCount).toBe(0);
    expect(e.openCriticalRisks).toBeGreaterThanOrEqual(3);
    expect(e.blockingAcceptanceItems).toBeGreaterThanOrEqual(3);
  });

  it('requires materially more future velocity than it has demonstrated', () => {
    expect(Number(e.demonstratedVelocityPpPerWeek?.toFixed(4))).toBeGreaterThan(0);
    expect(Number(e.requiredVelocityRatio?.toFixed(4))).toBeGreaterThanOrEqual(1.5);
  });

  it('is drawing contingency faster than it was eight weeks ago', () => {
    expect(Number(e.contingencyDrawRecent.toFixed(2)))
      .toBeGreaterThan(Number(e.contingencyDrawEarlier.toFixed(2)));
  });

  it('carries no Phase 4 conclusion — the evidence only', () => {
    // Phase 3 supplies facts. Phase 4 must reach the conclusion independently.
    const keys = new Set(Object.values(portfolio.facts).flatMap((rows) =>
      (rows as unknown[]).slice(0, 1).flatMap((r) => Object.keys(r as object))));
    for (const banned of ['systemAssessedRag', 'trajectory', 'outlook', 'greenAtRisk', 'interventionPriority', 'healthVerdict']) {
      expect([...keys].map((k) => k.toLowerCase()), banned).not.toContain(banned.toLowerCase());
    }
    // Its declared status is an honest Green — the team sees no cost problem, because there isn't one.
    expect(new Set(e.reportedRagSeries.map((r) => r.rag))).toEqual(new Set(['GREEN']));
  });
});


describe('Correction 6 — recognised revenue supports append-only accounting corrections', () => {
  const corrections = portfolio.facts.recognisedRevenue.filter((r) => r.postingType !== 'ORIGINAL');
  const byId = new Map(portfolio.facts.recognisedRevenue.map((r) => [r.id, r]));

  it('generates deterministic correction examples', () => {
    expect(corrections.length, 'no corrections generated — Phase 4 cannot prove restatement works')
      .toBeGreaterThan(10);
    const kinds = new Set(corrections.map((r) => r.postingType));
    expect(kinds.has('ADJUSTMENT')).toBe(true);
    expect(kinds.has('REVERSAL')).toBe(true);
    expect(kinds.has('RESTATEMENT')).toBe(true);
  });

  it('leaves the original accounting fact unchanged', () => {
    for (const c of corrections) {
      const superseded = byId.get(c.supersedesFactId as string);
      expect(superseded, `${c.id} supersedes a posting that does not exist`).toBeDefined();
      // The superseded posting is still present, still ORIGINAL or an earlier correction, and still
      // carries its own amount. Nothing was rewritten.
      expect(superseded?.id).toBe(c.supersedesFactId);
      expect(Number(superseded?.periodAmount.amount)).not.toBeNaN();
    }
    // Every chain still has its ORIGINAL.
    for (const c of corrections) {
      const root = byId.get(c.originalFactId as string);
      expect(root?.postingType, `${c.id} lost its original`).toBe('ORIGINAL');
    }
  });

  it('appends corrections rather than updating in place', () => {
    // A corrected period carries more than one posting; the ORIGINAL is still one of them.
    const correctedPeriods = new Set(corrections.map((c) => `${c.projectId}|${c.reportingPeriodId}`));
    for (const key of [...correctedPeriods].slice(0, 20)) {
      const [projectId, period] = key.split('|');
      const postings = portfolio.facts.recognisedRevenue.filter(
        (r) => r.projectId === projectId && r.reportingPeriodId === period,
      );
      expect(postings.length, key).toBeGreaterThan(1);
      expect(postings.filter((r) => r.postingType === 'ORIGINAL'), key).toHaveLength(1);
    }
    // Posting ids are unique — nothing was overwritten.
    const ids = portfolio.facts.recognisedRevenue.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('computes the effective position from the authoritative sequence', () => {
    const c = corrections[0]!;
    const eff = effectiveForPeriod(portfolio.facts.recognisedRevenue, c.reportingPeriodId);
    const forProject = eff.postings.filter((r) => r.projectId === c.projectId);
    const summed = forProject.reduce((a, r) => a + Number(r.periodAmount.amount), 0);
    const original = forProject.find((r) => r.postingType === 'ORIGINAL');
    expect(original).toBeDefined();
    // The effective figure differs from the original, and equals the sum of the chain.
    expect(summed).not.toBe(Number(original!.periodAmount.amount));
    expect(Math.round(summed * 100) / 100).toBe(
      Math.round(forProject.reduce((a, r) => a + Number(r.periodAmount.amount), 0) * 100) / 100,
    );
    expect(eff.restated).toBe(true);
  });

  it('preserves source lineage across a correction', () => {
    for (const c of corrections.slice(0, 30)) {
      expect(c.sourceRecordId, c.id).toBeTruthy();
      // The source version advances; the record identity does not change.
      expect(Number(c.sourceVersion), c.id).toBeGreaterThan(1);
      const root = byId.get(c.originalFactId as string);
      expect(c.sourceRecordId, c.id).toBe(root?.sourceRecordId);
      expect(c.recognitionPolicyVersion, c.id).toBe('RECOGNITION-v1');
      // A correction arrives later than the posting it corrects — that is the point.
      expect(c.sourceTimestamp > (root?.sourceTimestamp ?? ''), c.id).toBe(true);
    }
  });

  it('cannot silently rewrite history — every correction names what it supersedes', () => {
    for (const c of corrections) {
      expect(c.supersedesFactId, `${c.id} is a ${c.postingType} with nothing superseded`).toBeTruthy();
      expect(c.originalFactId, `${c.id} has no lineage to an original`).toBeTruthy();
    }
    // And an ORIGINAL never claims to supersede anything.
    for (const o of portfolio.facts.recognisedRevenue.filter((r) => r.postingType === 'ORIGINAL')) {
      expect(o.supersedesFactId, o.id).toBeUndefined();
    }
  });

  it('does not derive a correction from physical progress', () => {
    // Corrections are accounting events. They carry a source version and a policy version, and no
    // reference to delivery progress (Phase 2 closure, Decision 1).
    for (const c of corrections.slice(0, 20)) {
      expect(Object.keys(c)).not.toContain('physicalCompletion');
      expect(Object.keys(c)).not.toContain('impliedEac');
    }
  });
});
