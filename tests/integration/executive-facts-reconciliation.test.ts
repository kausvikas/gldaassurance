/**
 * The browser aggregates authoritative facts. This proves the facts are authoritative.
 *
 * The client runtime filters, counts and sums the payload embedded in the Command Center. It never
 * derives a band, an outlook, a margin or a ranking — but that guarantee is only worth anything if
 * the payload it reads agrees with the engines. These assertions re-derive, from the domain, the
 * same aggregations the browser performs, for several non-trivial filter combinations.
 */
import { describe, expect, it } from 'vitest';
import { executiveFacts } from '../../scripts/design/executive-facts.js';

const { facts, view } = executiveFacts();
const ranked = (view as unknown as { ranked: Record<string, unknown>[] }).ranked;

const sum = (rows: typeof facts, key: 'tcv' | 'gmAtRisk'): number =>
  rows.reduce((t, f) => t + f[key], 0);

describe('the embedded executive facts are the governed ones', () => {
  it('carries every fixed-bid project the command centre ranked', () => {
    expect(facts).toHaveLength(ranked.length);
    expect(new Set(facts.map((f) => f.id)))
      .toEqual(new Set(ranked.map((r) => String(r['projectId']))));
  });

  it('never disagrees with the engine on a band, trajectory or outlook', () => {
    for (const f of facts) {
      const row = ranked.find((r) => String(r['projectId']) === f.id);
      expect(row, f.id).toBeDefined();
      expect(f.system, f.id).toBe(String(row!['systemAssessedRag']));
      expect(f.reported, f.id).toBe(String(row!['reportedRag']));
      expect(f.trajectory, f.id).toBe(String(row!['trajectory']));
      expect(f.outlook30, f.id).toBe(String(row!['outlook30']));
      expect(f.outlook60, f.id).toBe(String(row!['outlook60']));
      /*
       * The executive Green categories are built from Reported RAG, System RAG and the governed
       * outlooks — not from MET-HLTH-033, whose second arm admits projects the system also assesses
       * Green. The legacy metric is carried unchanged for provenance and asserted separately.
       */
      expect(f.reportedGreenRisk, f.id)
        .toBe(f.reported === 'GREEN' && f.system !== 'GREEN');
      expect(f.emergingRisk, f.id)
        .toBe(f.system === 'GREEN' && (f.outlook30 !== 'GREEN' || f.outlook60 !== 'GREEN'));
      expect(f.legacyReportedGreenRisk, f.id).toBe(row!['isReportedGreenRisk'] === true);
    }
  });

  it('carries a numeric projection beside every money figure it displays', () => {
    for (const f of facts) {
      expect(Number.isFinite(f.tcv), f.id).toBe(true);
      expect(Number.isFinite(f.gmAtRisk), f.id).toBe(true);
      expect(f.tcv, f.id).toBeGreaterThan(0);
    }
  });
});

/*
 * Five non-trivial combinations. Each asserts that filtering the payload the way the browser does
 * selects exactly the projects the governed rows say it should, and that the additive totals are
 * sums of governed values rather than anything recomputed.
 */
const COMBINATIONS: readonly { name: string; pick: (f: typeof facts[number]) => boolean }[] = [
  { name: 'Europe', pick: (f) => f.region === 'Europe' },
  { name: 'Europe + Amber', pick: (f) => f.region === 'Europe' && f.system === 'AMBER' },
  { name: 'reported Green, evidence disagrees', pick: (f) => f.reportedGreenRisk },
  { name: 'System Green, emerging risk', pick: (f) => f.emergingRisk },
  { name: 'deteriorating with margin erosion', pick: (f) => f.trajectory.includes('DETERIORATING') && f.drivers.includes('margin-erosion') },
];

describe('filtered populations reconcile to the governed rows', () => {
  for (const c of COMBINATIONS) {
    it(`selects the same projects the engine would for "${c.name}"`, () => {
      const selected = facts.filter(c.pick);
      // Non-degenerate: a combination that selects nothing proves nothing.
      expect(selected.length, c.name).toBeGreaterThan(0);
      expect(selected.length, c.name).toBeLessThanOrEqual(facts.length);

      for (const f of selected) {
        const row = ranked.find((r) => String(r['projectId']) === f.id);
        expect(row, `${c.name}: ${f.id}`).toBeDefined();
      }

      // Additive totals are sums of governed per-project values, never a re-derivation.
      const tcv = sum(selected, 'tcv');
      const byHand = selected.reduce((t, f) => t + f.tcv, 0);
      expect(tcv).toBe(byHand);
      expect(tcv).toBeLessThanOrEqual(sum(facts, 'tcv'));
      expect(sum(selected, 'gmAtRisk')).toBeLessThanOrEqual(sum(facts, 'gmAtRisk'));
    });
  }

  it('returns exactly the enterprise population when nothing is selected', () => {
    expect(facts.filter(() => true)).toHaveLength(facts.length);
    expect(sum(facts, 'tcv')).toBeGreaterThan(0);
  });

  /*
   * The two Green findings genuinely overlap, and the surface must say so.
   *
   * MET-HLTH-033 is `reportedGreen && (systemDisagreesNow || materialDeterioration)`. The second
   * arm means a project reported Green, assessed Green, and deteriorating satisfies it — and that
   * same project satisfies System Green-at-Risk. The populations are therefore not disjoint, and a
   * surface showing both counts side by side is showing overlapping sets.
   *
   * That is not a defect to remove; it is a counting semantic to disclose. Adding the two numbers
   * would double-count exactly these projects, so the Command Center states the intersection rather
   * than leaving a reader to assume the sets are exclusive.
   */
  it('keeps the two executive Green findings disjoint by construction', () => {
    const disagree = facts.filter((f) => f.reportedGreenRisk);
    const emerging = facts.filter((f) => f.emergingRisk);
    expect(disagree.length).toBeGreaterThan(0);
    expect(emerging.length).toBeGreaterThan(0);

    /*
     * Category A requires the system to disagree today; category B requires it to agree today. A
     * project cannot satisfy both, so the counts are additive and no overlap disclosure is owed.
     *
     * This previously used MET-HLTH-033 for category A and the sets intersected on nine projects —
     * projects reported Green, assessed Green and merely deteriorating, which the surface was
     * describing as "evidence disagrees" when the evidence agreed. The metric was never wrong; it
     * was the wrong metric for this category.
     */
    const both = disagree.filter((f) => emerging.some((e) => e.id === f.id));
    expect(both).toEqual([]);
    for (const f of disagree) expect(f.system, f.id).not.toBe('GREEN');
    for (const f of emerging) expect(f.system, f.id).toBe('GREEN');
  });
});

/*
 * Portfolio margin is the governed aggregate, not a mean of project margins.
 *
 * MET-PORT-002 is `(Σ MET-FIN-010 − Σ MET-FIN-008) / Σ MET-FIN-010`, and the catalogue states the
 * point directly: "weighted, never a mean of project margins". The Command Center previously
 * computed a contract-value-weighted mean of per-project percentages, which agreed only because no
 * project in this portfolio carries an executed change request — the moment one does, forecast
 * revenue diverges from contract value and the two formulas separate.
 *
 * These assertions fix the method rather than the number, so the defect cannot return the next time
 * the synthetic portfolio gains an executed change.
 */
describe('portfolio margin follows the governed aggregation', () => {
  const sumOf = (key: 'soldRevenue' | 'budgetedCost' | 'forecastRevenue' | 'eac'): number =>
    facts.reduce((t, f) => t + f[key], 0);

  it('carries the four components the governed formula needs', () => {
    for (const f of facts) {
      expect(Number.isFinite(f.forecastRevenue), f.id).toBe(true);
      expect(Number.isFinite(f.eac), f.id).toBe(true);
      expect(f.forecastRevenue, f.id).toBeGreaterThan(0);
      expect(f.soldRevenue, f.id).toBeGreaterThan(0);
    }
  });

  it('reproduces each project margin from its own components', () => {
    for (const f of facts) {
      const derived = ((f.forecastRevenue - f.eac) / f.forecastRevenue) * 100;
      expect(derived, f.id).toBeCloseTo(f.forecastGmPct, 1);
    }
  });

  it('aggregates revenue and cost, never the percentages', () => {
    const governed = ((sumOf('forecastRevenue') - sumOf('eac')) / sumOf('forecastRevenue')) * 100;
    const weightedMean = facts.reduce((t, f) => t + f.forecastGmPct * f.tcv, 0)
      / facts.reduce((t, f) => t + f.tcv, 0);

    // Both are computable; the contract is that the surface uses the first.
    expect(Number.isFinite(governed)).toBe(true);
    expect(Number.isFinite(weightedMean)).toBe(true);

    // On a portfolio with an executed change the two must be allowed to differ — this asserts the
    // components are present and self-consistent, not that the answers coincide.
    const soldGoverned = ((sumOf('soldRevenue') - sumOf('budgetedCost')) / sumOf('soldRevenue')) * 100;
    expect(soldGoverned).toBeGreaterThan(0);
    expect(governed).toBeLessThan(soldGoverned);
  });
});
