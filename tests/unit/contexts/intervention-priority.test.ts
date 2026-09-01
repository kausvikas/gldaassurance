/**
 * `MET-PORT-007` Executive Intervention Priority Rank — MC-5 resolved (ADR-0019).
 *
 * The ordering is the single most consequential piece of semantics in the product: it decides what
 * a CDO looks at first, and AC-1 gives them thirty seconds. So the tests assert the *laws* of the
 * ordering, not a handful of example lists — a list can be right by accident, a law cannot.
 *
 * Four properties matter more than the rest and each has its own block:
 *
 *   - **hard risk cannot be buried** — no amount of size, urgency or plan quality lifts a project
 *     above one carrying crystallising contractual exposure;
 *   - **actionability never erases severity** — it sits below every exposure tier, so a small
 *     problem with a beautiful plan stays below a large problem with none;
 *   - **missing evidence lowers confidence, never fabricates certainty** — an unmeasured project is
 *     listed separately, never sorted last;
 *   - **determinism** — identical inputs, identical output, every time (AC-7).
 */
import { describe, expect, it } from 'vitest';
import type { Quantity } from '@platform/decimal';
import { qty } from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { WeekId } from '@platform/time';
import {
  type ActionabilityEvidence, type Band, type ConfidenceBand, type ExposureEvidence,
  type PriorityCandidate, type PriorityPolicy,
  PRIORITY_TIER_ORDER, comparePriority, gradeActionability, hasCriticalExposure,
  hasPredictedDeterioration, rankInterventionPriority, rankableCount, timeCriticalityWeeks,
} from '@contexts/portfolio';

const WEEK = '2026-W35' as WeekId;

const POLICY: PriorityPolicy = {
  version: 'PRIORITY-v1' as RuleVersion,
  criticalGmValueAtRiskFloor: qty('250000'),
  immediateHorizonWeeks: 4,
};

const NO_PLAN: ActionabilityEvidence = {
  openRecoveryActionId: null, namedOwner: null, dueDate: null,
  estimatedGmBenefit: null, estimatedScheduleBenefitWeeks: null,
  planConfidence: null, executiveDependency: false,
};

const CREDIBLE_PLAN: ActionabilityEvidence = {
  openRecoveryActionId: 'rec-1', namedOwner: 'A. Okafor', dueDate: '2026-09-15',
  estimatedGmBenefit: qty('180000'), estimatedScheduleBenefitWeeks: 3,
  planConfidence: 'MEDIUM', executiveDependency: true,
};

const exposure = (over: Partial<ExposureEvidence> = {}): ExposureEvidence => ({
  systemAssessedBand: 'AMBER',
  gmValueAtRisk: qty('100000'),
  contractualPenaltyExposure: null,
  forecastContractLoss: null,
  isSystemGreenAtRisk: false,
  outlook30: null,
  outlook60: null,
  weeksToBandChange: null,
  weeksToCriticalMilestone: null,
  hardOverridePresent: false,
  ...over,
});

const candidate = (
  projectId: string,
  over: Partial<ExposureEvidence> = {},
  actionability: ActionabilityEvidence = NO_PLAN,
  dataConfidenceBand: ConfidenceBand | null = 'HIGH',
): PriorityCandidate => ({
  projectId,
  exposure: exposure(over),
  actionability,
  dataConfidenceBand,
  forecastConfidenceBand: 'HIGH',
});

const order = (cs: readonly PriorityCandidate[]): string[] =>
  rankInterventionPriority(WEEK, POLICY, cs).ranked.map((r) => r.projectId);

// ---------------------------------------------------------------------------
// The model itself
// ---------------------------------------------------------------------------

describe('the model is declared, versioned and lexicographic — never an opaque score', () => {
  it('names itself and its rule version', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [candidate('p1')]);
    expect(r.metricId).toBe('MET-PORT-007');
    expect(r.model).toBe('LEXICOGRAPHIC_TIERED');
    expect(r.ruleVersion).toBe('PRIORITY-v1');
    expect(r.week).toBe(WEEK);
  });

  it('publishes its tier order, so the ordering can be read without reading the code', () => {
    expect(PRIORITY_TIER_ORDER).toHaveLength(7);
    expect(PRIORITY_TIER_ORDER[0]).toMatch(/Critical economic/);
    expect(PRIORITY_TIER_ORDER[6]).toMatch(/deterministic tiebreak/i);
  });

  it('emits no composite score anywhere in the result', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [candidate('p1'), candidate('p2')]);
    const serialised = JSON.stringify(r);
    expect(serialised).not.toMatch(/"score"/);
    expect(serialised).not.toMatch(/"weight"/);
    expect(serialised).not.toMatch(/"compositeIndex"/);
  });

  it('explains every placement, and every adjacent pair by its deciding tier', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [
      candidate('p1', { contractualPenaltyExposure: qty('50000') }),
      candidate('p2'),
    ]);
    for (const row of r.ranked) expect(row.narrative.length).toBeGreaterThan(40);
    expect(r.ranked[0]?.outranksBecause).toMatch(/tier 1/);
    // The last ranked project has nothing below it to outrank.
    expect(r.ranked.at(-1)?.outranksBecause).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tier 1 — hard risk cannot be buried
// ---------------------------------------------------------------------------

describe('tier 1 — critical exposure cannot be outweighed by anything below it', () => {
  it('recognises a crystallising contractual penalty', () => {
    expect(hasCriticalExposure(exposure({ contractualPenaltyExposure: qty('1') }), POLICY)).toBe(true);
  });

  it('recognises a forecast contract loss', () => {
    expect(hasCriticalExposure(exposure({ forecastContractLoss: qty('1') }), POLICY)).toBe(true);
  });

  it('recognises a RED project above the governed GM floor, and not one below it', () => {
    expect(hasCriticalExposure(
      exposure({ systemAssessedBand: 'RED', gmValueAtRisk: qty('250000') }), POLICY,
    )).toBe(true);
    expect(hasCriticalExposure(
      exposure({ systemAssessedBand: 'RED', gmValueAtRisk: qty('249999.99') }), POLICY,
    )).toBe(false);
  });

  /** The property that a weighted average would destroy, asserted against every lower tier at once. */
  it('outranks a project that beats it on every single lower tier', () => {
    const small = candidate('small-penalty', {
      contractualPenaltyExposure: qty('1'),
      gmValueAtRisk: qty('1'),
      weeksToBandChange: 99,
    }, NO_PLAN, 'LOW');
    const huge = candidate('huge-everything-else', {
      systemAssessedBand: 'AMBER',
      gmValueAtRisk: qty('99999999'),
      isSystemGreenAtRisk: true,
      weeksToBandChange: 1,
      weeksToCriticalMilestone: 1,
    }, CREDIBLE_PLAN, 'HIGH');
    expect(order([huge, small])).toEqual(['small-penalty', 'huge-everything-else']);
  });
});

// ---------------------------------------------------------------------------
// Tier 2 — predicted deterioration
// ---------------------------------------------------------------------------

describe('tier 2 — predicted deterioration', () => {
  it('fires on System Green-at-Risk', () => {
    expect(hasPredictedDeterioration(exposure({ isSystemGreenAtRisk: true }))).toBe(true);
  });

  it('fires when an outlook horizon is worse than the present band', () => {
    expect(hasPredictedDeterioration(
      exposure({ systemAssessedBand: 'GREEN', outlook30: 'AMBER' }),
    )).toBe(true);
    expect(hasPredictedDeterioration(
      exposure({ systemAssessedBand: 'AMBER', outlook60: 'RED' }),
    )).toBe(true);
  });

  it('does not fire when the outlook is the same or better', () => {
    expect(hasPredictedDeterioration(
      exposure({ systemAssessedBand: 'AMBER', outlook30: 'AMBER', outlook60: 'GREEN' }),
    )).toBe(false);
  });

  it('does not fire when the present band is unknown — that is a gap, not a prediction', () => {
    expect(hasPredictedDeterioration(
      exposure({ systemAssessedBand: null, outlook30: 'RED' }),
    )).toBe(false);
  });

  it('places a deteriorating project above a larger, stable one', () => {
    const deteriorating = candidate('will-worsen', {
      gmValueAtRisk: qty('50000'), isSystemGreenAtRisk: true,
    });
    const bigStable = candidate('big-but-stable', { gmValueAtRisk: qty('5000000') });
    expect(order([bigStable, deteriorating])).toEqual(['will-worsen', 'big-but-stable']);
  });
});

// ---------------------------------------------------------------------------
// Tiers 3 and 4 — time, then size
// ---------------------------------------------------------------------------

describe('tier 3 — time criticality takes the sooner clock', () => {
  it('uses the earliest of the band-change and milestone clocks', () => {
    expect(timeCriticalityWeeks(exposure({ weeksToBandChange: 8, weeksToCriticalMilestone: 3 }))).toBe(3);
    expect(timeCriticalityWeeks(exposure({ weeksToBandChange: 2 }))).toBe(2);
    expect(timeCriticalityWeeks(exposure())).toBeNull();
  });

  it('orders sooner before later at equal exposure', () => {
    expect(order([
      candidate('later', { weeksToBandChange: 10 }),
      candidate('sooner', { weeksToBandChange: 2 }),
    ])).toEqual(['sooner', 'later']);
  });

  it('places an unknown clock after a known one, without calling it safe', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [
      candidate('no-clock'),
      candidate('has-clock', { weeksToBandChange: 40 }),
    ]);
    expect(r.ranked.map((x) => x.projectId)).toEqual(['has-clock', 'no-clock']);
    expect(r.ranked[1]?.evidenceGaps).toContain('no time-to-band-change or milestone clock');
  });
});

describe('tier 4 — GM value at risk orders by size once the qualitative tiers are equal', () => {
  it('orders larger exposure first', () => {
    expect(order([
      candidate('small', { gmValueAtRisk: qty('10000'), weeksToBandChange: 5 }),
      candidate('large', { gmValueAtRisk: qty('900000'), weeksToBandChange: 5 }),
    ])).toEqual(['large', 'small']);
  });

  it('does not let GM value at risk override an earlier clock', () => {
    expect(order([
      candidate('big-slow', { gmValueAtRisk: qty('900000'), weeksToBandChange: 20 }),
      candidate('small-urgent', { gmValueAtRisk: qty('10000'), weeksToBandChange: 1 }),
    ])).toEqual(['small-urgent', 'big-slow']);
  });
});

// ---------------------------------------------------------------------------
// Tier 5 — actionability is separate, and subordinate
// ---------------------------------------------------------------------------

describe('actionability is evidence of a plan, never a restatement of severity', () => {
  it('grades from the evidence that exists', () => {
    expect(gradeActionability(NO_PLAN)).toBe('NOT_ASSESSED');
    expect(gradeActionability(CREDIBLE_PLAN)).toBe('CREDIBLE_PLAN');
    expect(gradeActionability({ ...CREDIBLE_PLAN, dueDate: null })).toBe('PLAN_FORMING');
    expect(gradeActionability({ ...CREDIBLE_PLAN, estimatedGmBenefit: null, estimatedScheduleBenefitWeeks: null }))
      .toBe('PLAN_FORMING');
  });

  it('distinguishes "nobody looked" from "somebody looked and there is no plan"', () => {
    expect(gradeActionability(NO_PLAN)).toBe('NOT_ASSESSED');
    expect(gradeActionability({ ...NO_PLAN, namedOwner: 'A. Okafor' })).toBe('NO_PLAN');
  });

  it('never derives actionability from severity', () => {
    const catastrophic = candidate('catastrophic', {
      systemAssessedBand: 'RED', gmValueAtRisk: qty('9000000'),
      contractualPenaltyExposure: qty('500000'),
    }, NO_PLAN);
    const r = rankInterventionPriority(WEEK, POLICY, [catastrophic]);
    expect(r.ranked[0]?.tiers.actionability).toBe('NOT_ASSESSED');
  });

  /** Tier 5 sits below every exposure tier precisely so this cannot happen. */
  it('does not lift a small problem above a large one', () => {
    expect(order([
      candidate('small-with-plan', { gmValueAtRisk: qty('1000'), weeksToBandChange: 5 }, CREDIBLE_PLAN),
      candidate('large-no-plan', { gmValueAtRisk: qty('900000'), weeksToBandChange: 5 }, NO_PLAN),
    ])).toEqual(['large-no-plan', 'small-with-plan']);
  });

  it('does order two otherwise-identical projects by plan credibility', () => {
    expect(order([
      candidate('no-plan', { gmValueAtRisk: qty('100000'), weeksToBandChange: 5 }, NO_PLAN),
      candidate('has-plan', { gmValueAtRisk: qty('100000'), weeksToBandChange: 5 }, CREDIBLE_PLAN),
    ])).toEqual(['has-plan', 'no-plan']);
  });
});

// ---------------------------------------------------------------------------
// Missing evidence
// ---------------------------------------------------------------------------

describe('missing evidence lowers confidence and never fabricates certainty', () => {
  it('lists a candidate with no evaluable tier separately, not last', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [
      candidate('measured', { gmValueAtRisk: qty('5000') }),
      candidate('unmeasured', { gmValueAtRisk: null, systemAssessedBand: null }),
    ]);
    expect(r.ranked.map((x) => x.projectId)).toEqual(['measured']);
    expect(r.insufficientEvidence.map((x) => x.projectId)).toEqual(['unmeasured']);
    expect(r.insufficientEvidence[0]?.reason).toMatch(/not a safe one/);
  });

  it('still ranks a candidate whose higher tier fired, and names the gap', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [
      candidate('penalty-no-var', { gmValueAtRisk: null, contractualPenaltyExposure: qty('9000') }),
    ]);
    expect(r.ranked).toHaveLength(1);
    expect(r.ranked[0]?.evidenceGaps).toContain('MET-FIN-019 GM value at risk');
    expect(r.ranked[0]?.narrative).toMatch(/Placed on partial evidence/);
  });

  it('lowers rank confidence when evidence is missing, and never raises it', () => {
    const complete = rankInterventionPriority(WEEK, POLICY, [
      candidate('complete', { weeksToBandChange: 4 }, CREDIBLE_PLAN, 'HIGH'),
    ]).ranked[0];
    const gappy = rankInterventionPriority(WEEK, POLICY, [
      candidate('gappy', { gmValueAtRisk: null, contractualPenaltyExposure: qty('1') }, NO_PLAN, null),
    ]).ranked[0];
    expect(complete?.tiers.rankConfidence).toBe('HIGH');
    expect(gappy?.tiers.rankConfidence).toBe('LOW');
  });

  it('counts only what could be evaluated', () => {
    expect(rankableCount([
      candidate('a', { gmValueAtRisk: qty('1') }),
      candidate('b', { gmValueAtRisk: null, systemAssessedBand: null }),
    ], POLICY)).toBe('2'.replace('2', '1'));
    expect(rankableCount([], POLICY)).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Determinism and ordering laws
// ---------------------------------------------------------------------------

describe('determinism and the laws of the ordering (AC-7)', () => {
  const universe: readonly PriorityCandidate[] = [
    candidate('p-a', { systemAssessedBand: 'RED', gmValueAtRisk: qty('400000'), weeksToBandChange: 2 }, CREDIBLE_PLAN),
    candidate('p-b', { gmValueAtRisk: qty('400000'), weeksToBandChange: 2 }, NO_PLAN),
    candidate('p-c', { gmValueAtRisk: qty('100000'), isSystemGreenAtRisk: true }, CREDIBLE_PLAN),
    candidate('p-d', { contractualPenaltyExposure: qty('20000'), gmValueAtRisk: qty('50000') }, NO_PLAN),
    candidate('p-e', { gmValueAtRisk: qty('100000'), weeksToCriticalMilestone: 6 }, NO_PLAN, 'LOW'),
    candidate('p-f', { gmValueAtRisk: null, systemAssessedBand: null }, NO_PLAN, null),
  ];

  it('produces an identical ordering from identical inputs', () => {
    const a = rankInterventionPriority(WEEK, POLICY, universe);
    const b = rankInterventionPriority(WEEK, POLICY, universe);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('is independent of input order', () => {
    const forward = order(universe);
    const reversed = order([...universe].reverse());
    expect(reversed).toEqual(forward);
  });

  it('breaks a total tie by project id, ascending', () => {
    expect(order([
      candidate('zulu', { gmValueAtRisk: qty('100'), weeksToBandChange: 3 }),
      candidate('alpha', { gmValueAtRisk: qty('100'), weeksToBandChange: 3 }),
    ])).toEqual(['alpha', 'zulu']);
  });

  it('is antisymmetric and transitive over every pair and triple in the universe', () => {
    const r = rankInterventionPriority(WEEK, POLICY, universe);
    const rows = r.ranked;
    for (const x of rows) {
      for (const y of rows) {
        const xy = comparePriority(x.tiers, y.tiers, x.projectId, y.projectId);
        const yx = comparePriority(y.tiers, x.tiers, y.projectId, x.projectId);
        // Sum rather than negation: Math.sign(0) is +0 and -Math.sign(0) is -0, which Object.is
        // distinguishes. Antisymmetry is what is being asserted, not the sign of zero.
        expect(Math.sign(xy) + Math.sign(yx), `${x.projectId} vs ${y.projectId}`).toBe(0);
      }
    }
    for (const x of rows) {
      for (const y of rows) {
        for (const z of rows) {
          const xy = comparePriority(x.tiers, y.tiers, x.projectId, y.projectId);
          const yz = comparePriority(y.tiers, z.tiers, y.projectId, z.projectId);
          const xz = comparePriority(x.tiers, z.tiers, x.projectId, z.projectId);
          if (xy < 0 && yz < 0) {
            expect(xz, `${x.projectId} < ${y.projectId} < ${z.projectId}`).toBeLessThan(0);
          }
        }
      }
    }
  });

  it('assigns contiguous ranks from 1', () => {
    const r = rankInterventionPriority(WEEK, POLICY, universe);
    expect(r.ranked.map((x) => x.rank)).toEqual(r.ranked.map((_, i) => i + 1));
  });

  it('depends on no Draft-blocked metric — every tier input is supplied, never computed here', () => {
    // The module imports nothing but platform primitives; a domain import would be ARCH-003.
    const source = String(rankInterventionPriority);
    expect(source).not.toMatch(/HEALTH_MODEL/);
    expect(source).not.toMatch(/MET-HLTH-02[0-4]/);
  });
});

// ---------------------------------------------------------------------------
// The blocked function is gone
// ---------------------------------------------------------------------------

describe('MC-5 is resolved', () => {
  it('no longer exposes a throwing MET-PORT-007 stub', async () => {
    const portfolio = await import('@contexts/portfolio');
    expect('rankAsMetPort007' in portfolio).toBe(false);
    expect('orderByExposure' in portfolio).toBe(false);
  });

  it('returns a ranking rather than throwing', () => {
    expect(() => rankInterventionPriority(WEEK, POLICY, [candidate('p1')])).not.toThrow();
  });

  it('carries a Quantity type on every monetary tier value', () => {
    const r = rankInterventionPriority(WEEK, POLICY, [candidate('p1', { gmValueAtRisk: qty('12345.67') })]);
    const v: Quantity | null = r.ranked[0]?.tiers.gmValueAtRisk ?? null;
    expect(v).toBe('12345.67');
  });
});

// Referenced so the Band type is exercised rather than merely imported.
const _bands: readonly Band[] = ['GREEN', 'AMBER', 'RED'];
void _bands;
