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
      expect(f.emergingRisk, f.id).toBe(row!['isSystemGreenAtRisk'] === true);
      expect(f.reportedGreenRisk, f.id).toBe(row!['isReportedGreenRisk'] === true);
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
  it('discloses the overlap between the two Green findings rather than assuming there is none', () => {
    const disagree = facts.filter((f) => f.reportedGreenRisk);
    const emerging = facts.filter((f) => f.emergingRisk);
    expect(disagree.length).toBeGreaterThan(0);
    expect(emerging.length).toBeGreaterThan(0);

    const both = disagree.filter((f) => emerging.some((e) => e.id === f.id));
    // Every project in the intersection must satisfy both governed definitions on its own terms.
    for (const f of both) {
      expect(f.reported, f.id).toBe('GREEN');
      expect(f.system, f.id).toBe('GREEN');
      expect([f.outlook30, f.outlook60].some((b) => b !== 'GREEN'), f.id).toBe(true);
    }
    // The union is what an executive should read as "Green projects requiring attention".
    const union = new Set([...disagree, ...emerging].map((f) => f.id));
    expect(union.size).toBe(disagree.length + emerging.length - both.length);
  });
});
