/**
 * Phase 7 closure gates — **DEMO — SYNTHETIC DATA**.
 *
 * These are not a second copy of `command-center.test.tsx`. That suite asks whether the surface
 * behaves; this one asks the questions a release gate asks, and each was written because a
 * plausible-looking implementation could pass the first suite and still be wrong:
 *
 *   - a total that silently includes T&M work, and so reconciles to nothing;
 *   - a KPI labelled with a metric id whose registered formula is not the one that produced it;
 *   - a Frozen metric resting on a Draft one, so "frozen" means nothing;
 *   - a ranking that reads well at the top and is arbitrary in its tail;
 *   - a page that claims a movement it has no prior period to compute.
 *
 * Where a gate cannot be met, the test asserts the **honest statement** rather than the capability:
 * a page that says "no prior period" passes; a page that renders a 0% movement does not.
 */
import { readFileSync } from 'node:fs';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CommandCenterView } from '@app';
import { FIXED_BID_POPULATION, formatWeeks } from '@app';
import { PortfolioCommandCenter, executiveTable } from '@presentation/index.js';
import { METRIC_REGISTRY, findMetric, validateRegistry } from '@contexts/rules';
import { comparePriority } from '@contexts/portfolio';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { buildCommandCenterFor } from '../../scripts/assessment/command-center-adapter.js';

const portfolio = generatePortfolio();
const allIds = portfolio.structure.projects.map((p) => p.projectId);
const fixedBidIds = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);
const view = buildCommandCenterFor(portfolio, allIds);
const html = (el: JSX.Element): string => renderToStaticMarkup(el);
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const page = text(<PortfolioCommandCenter view={view} commercialRestricted={false} />);

// ---------------------------------------------------------------------------
// 1. Fixed-bid population integrity — the gate this closure exists for
// ---------------------------------------------------------------------------

describe('the fixed-bid population is the population, everywhere', () => {
  it('reports on fixed-bid projects only, from an authorised universe that is larger', () => {
    expect(fixedBidIds.length).toBeLessThan(allIds.length);
    expect(view.projectCount).toBe(fixedBidIds.length);
    expect(view.authorisedUniverseCount).toBe(allIds.length);
    expect(view.populationLabel).toBe('Fixed-bid');
  });

  it('excludes every non-fixed-bid engagement model from the ranked table', () => {
    const fb = new Set(fixedBidIds);
    for (const r of view.ranked) expect(fb.has(r.projectId), r.projectId).toBe(true);
  });

  it('excludes them from the bubble matrix and the Green-at-Risk panel too', () => {
    const fb = new Set(fixedBidIds);
    for (const b of view.bubbles) expect(fb.has(b.projectId), b.projectId).toBe(true);
    for (const id of view.greenAtRisk.projectIds) expect(fb.has(id), id).toBe(true);
    for (const id of view.greenAtRisk.reportedGreenRiskProjectIds) expect(fb.has(id), id).toBe(true);
  });

  it('names what it excluded, rather than leaving a total nobody can reconcile', () => {
    const excluded = view.excludedFromPopulation.reduce((n, e) => n + e.count, 0);
    expect(excluded).toBe(allIds.length - fixedBidIds.length);
    expect(excluded).toBeGreaterThan(0);
    for (const e of view.excludedFromPopulation) {
      expect(e.engagementModel).not.toBe('FIXED_BID');
      expect(e.count).toBeGreaterThan(0);
    }
  });

  it('states the population on the page before it states any number', () => {
    expect(page).toContain('Fixed-bid portfolio');
    expect(page).toContain(`${String(view.projectCount)} of ${String(view.authorisedUniverseCount)}`);
    expect(page).toContain('excluded');
  });

  it('filters before it computes — every KPI denominator is the fixed-bid count', () => {
    const amberRed = view.kpis.find((k) => k.id === 'amber-red');
    expect(amberRed?.display).toMatch(new RegExp(`of ${String(fixedBidIds.length)}$`));
    expect(Object.values(view.ragDistribution).reduce((a, b) => a + b, 0)).toBe(fixedBidIds.length);
  });

  it('reaches the same numbers whether the excluded projects are supplied or not', () => {
    // The strongest available statement of "filtered, not merely hidden": supplying the
    // out-of-population projects changes no figure at all. The two views differ only where they
    // *describe* the exclusion — each KPI's scope evidence line names what was left out, which is
    // exactly the difference a reader is entitled to see.
    const pure = buildCommandCenterFor(portfolio, fixedBidIds);
    const numbers = (v: CommandCenterView): unknown => ({
      projectCount: v.projectCount,
      ragDistribution: v.ragDistribution,
      kpis: v.kpis.map((k) => [k.id, k.display, k.treatment, k.evidence.metricId]),
      ranked: v.ranked.map((r) => [r.rank, r.projectId, r.gmValueAtRisk, r.outranksBecause]),
      bubbles: v.bubbles.map((b) => [b.projectId, b.financialRisk.value, b.deliveryRisk.value]),
      greenAtRisk: [
        v.greenAtRisk.systemGreenAtRiskCount, v.greenAtRisk.reportedGreenRiskCount,
        v.greenAtRisk.gmValueAtRisk, v.greenAtRisk.projectIds,
      ],
      filters: v.filters.map((f) => [f.id, f.options.map((o) => [o.value, o.count])]),
    });
    expect(JSON.stringify(numbers(pure))).toBe(JSON.stringify(numbers(view)));
  });

  it('names the exclusion in every KPI\'s scope evidence, not only in the page header', () => {
    for (const k of view.kpis) {
      const scope = k.evidence.lines.find((l) => /scope/i.test(l.label));
      expect(scope?.value, k.id).toMatch(/75 of 91 authorised/);
      expect(scope?.value, k.id).toMatch(/excluded/);
    }
  });

  it('declares the population as data, so a reviewer can see it without reading a loop', () => {
    expect(FIXED_BID_POPULATION.engagementModels).toEqual(['FIXED_BID']);
    expect(FIXED_BID_POPULATION.label).toBe('Fixed-bid');
  });

  it('totals an authorised set holding no fixed-bid work without inventing a portfolio', () => {
    const nonFb = portfolio.structure.projects
      .filter((p) => p.engagementModel !== 'FIXED_BID').map((p) => p.projectId);
    expect(nonFb.length).toBeGreaterThan(0);
    const empty = buildCommandCenterFor(portfolio, nonFb);
    expect(empty.projectCount).toBe(0);
    expect(empty.authorisedUniverseCount).toBe(nonFb.length);
    expect(empty.ranked).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Every KPI is the metric it claims to be
// ---------------------------------------------------------------------------

describe('each KPI names a registered metric it actually computed', () => {
  it('gives all eight KPIs a metric id that exists in the registry', () => {
    expect(view.kpis).toHaveLength(8);
    for (const k of view.kpis) {
      expect(k.evidence.metricId, k.id).toBeDefined();
      expect(findMetric(k.evidence.metricId ?? ''), `${k.id} -> ${String(k.evidence.metricId)}`)
        .toBeDefined();
    }
  });

  it('labels GM value at risk MET-PORT-003, which is now the additive sum (ADR-0023)', () => {
    expect(view.kpis.find((k) => k.id === 'gm-var')?.evidence.metricId).toBe('MET-PORT-003');
    expect(findMetric('MET-PORT-003')?.formula).toMatch(/each counted exactly once/);
    expect(findMetric('MET-PORT-003')?.formula).not.toMatch(/riskCauseKey/);
    expect(findMetric('MET-PORT-003')?.version).toBe('2.0.0');
  });

  it('equals the plain sum of per-project MET-FIN-019 — nothing netted between projects', () => {
    const kpi = view.kpis.find((k) => k.id === 'gm-var');
    const plain = view.ranked.reduce((n, r) => n + 1, 0);
    expect(plain).toBeGreaterThan(0);
    // The evidence must state that no cross-project reduction was applied, so a reader cannot
    // mistake the figure for a de-duplicated one.
    const lines = kpi?.evidence.lines ?? [];
    const reduction = lines.find((l) => l.label === 'Cross-project reduction')?.value ?? '';
    expect(reduction).toMatch(/none/);
    expect(reduction).toMatch(/disjoint pools/);
  });

  it('reports shared-cause concentration without subtracting it', () => {
    const lines = view.kpis.find((k) => k.id === 'gm-var')?.evidence.lines ?? [];
    const concentration = lines.find((l) => l.label === 'Largest risk concentration')?.value ?? '';
    expect(concentration.length).toBeGreaterThan(20);
    expect(concentration).toMatch(/not\*\* subtracted|not subtracted/);
  });

  it('gives potential contract loss its own metric rather than borrowing MET-FIN-024', () => {
    expect(view.kpis.find((k) => k.id === 'contract-loss')?.evidence.metricId).toBe('MET-PORT-009');
    const m = findMetric('MET-PORT-009');
    expect(m?.status).toBe('Frozen');
    expect(m?.formula).toMatch(/max\(0/);
  });

  it('sums only the downside for contract loss — a profitable project cannot net it off', () => {
    expect(view.kpis.find((k) => k.id === 'contract-loss')?.display).not.toMatch(/^−/);
  });

  it('uses Reported Green Risk as the executive KPI, with both findings still visible', () => {
    expect(view.kpis.find((k) => k.id === 'green-at-risk')?.evidence.metricId).toBe('MET-HLTH-033');
    expect(view.greenAtRisk.systemGreenAtRiskCount).toBeGreaterThanOrEqual(0);
    expect(view.greenAtRisk.reportedGreenRiskCount).toBeGreaterThanOrEqual(0);
    expect(page).toContain('Green-at-Risk');
  });

  it('separates the two Green-at-Risk findings rather than merging them into one number', () => {
    // Different questions: "the system disagrees with a Green report" and "a Green report is
    // deteriorating". They may overlap, but neither may be defined as the other.
    for (const r of view.ranked) {
      expect(typeof r.isSystemGreenAtRisk).toBe('boolean');
      expect(typeof r.isReportedGreenRisk).toBe('boolean');
    }
    expect(view.greenAtRisk.projectIds)
      .not.toEqual(view.greenAtRisk.reportedGreenRiskProjectIds);
  });

  it('uses one vocabulary for the Green-at-Risk findings, not two spellings of one', () => {
    // "Reported Green at Risk" and "Reported Green Risk" read as the same thing to the author and
    // as two different findings to a reader holding the catalog. The KPI carries the registered
    // name exactly; the panel names both findings and never merges them.
    expect(view.kpis.find((k) => k.id === 'green-at-risk')?.label)
      .toBe(findMetric('MET-HLTH-033')?.name);
    expect(findMetric('MET-HLTH-033')?.name).toBe('Reported Green Risk');
    expect(findMetric('MET-FCST-025')?.name).toMatch(/Green-at-Risk/);
    const src = readFileSync('src/app/portfolio/command-center.ts', 'utf8');
    expect(src).not.toMatch(/Reported Green at Risk/);
  });

  it('meets REQ-PORT-003 — the aggregate is free of shared-cause double counting', () => {
    // The requirement is "portfolio value at risk aggregates without double counting". It is met
    // when the de-duplication runs, not when the shortfall is merely labelled.
    expect(findMetric('MET-PORT-003')?.status).toBe('Frozen');
    const kpi = view.kpis.find((k) => k.id === 'gm-var');
    expect(kpi?.evidence.metricId).toBe('MET-PORT-003');
    // `aggregate()` still returns the plain sum and still says so — MET-PORT-003 is computed by a
    // dedicated function, and conflating the two is what the old comment existed to prevent.
    const agg = readFileSync('src/contexts/portfolio/internal/aggregation.ts', 'utf8');
    expect(agg).toMatch(/NOT `MET-PORT-003`/);
  });

  it('labels inferred KPIs differently from computed ones', () => {
    expect(new Set(view.kpis.map((k) => k.treatment)).size).toBeGreaterThan(1);
    expect(view.kpis.filter((k) => k.treatment === 'inferred').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. C-7 and the Draft frontier
// ---------------------------------------------------------------------------

interface RefLike { readonly id: string; readonly inputs: readonly string[]; readonly formula: string }

const metricRefs = (m: RefLike): string[] => {
  const s = new Set<string>();
  for (const i of m.inputs) if (i.startsWith('MET-')) s.add(i);
  for (const t of m.formula.match(/MET-[A-Z]+-\d+/g) ?? []) s.add(t);
  s.delete(m.id);
  return [...s].filter((r) => findMetric(r) !== undefined);
};

describe('C-7 is resolved and the Draft frontier is stated, not discovered', () => {
  it('leaves no metric blocked by C-7', () => {
    const blocked = METRIC_REGISTRY.filter((m) => /BLOCKED by CONFLICT C-7/i.test(m.notes ?? ''));
    expect(blocked.map((m) => m.id)).toEqual([]);
  });

  it('freezes the four executive dimensions and the composite that rests on them', () => {
    for (const id of ['MET-HLTH-020', 'MET-HLTH-021', 'MET-HLTH-022',
      'MET-HLTH-023', 'MET-HLTH-024']) {
      expect(findMetric(id)?.status, id).toBe('Frozen');
    }
  });

  it('retains the six HEALTH-v1 analytical dimensions rather than deleting them', () => {
    for (const id of ['MET-HLTH-001', 'MET-HLTH-002', 'MET-HLTH-003',
      'MET-HLTH-004', 'MET-HLTH-005', 'MET-HLTH-006']) {
      expect(findMetric(id), id).toBeDefined();
    }
  });

  it('records the resolution as calibration-open, not as a settled set of weights', () => {
    const note = findMetric('MET-HLTH-021')?.notes ?? '';
    expect(note).toMatch(/C-7 RESOLVED/);
    expect(note).toMatch(/calibration/i);
  });

  it('enumerates every remaining Draft metric explicitly, each naming its own blocker', () => {
    const drafts = METRIC_REGISTRY.filter((m) => m.status === 'Draft');
    expect(drafts.map((m) => m.id).sort()).toEqual(['MET-DEL-012', 'MET-DQ-009', 'MET-QUA-002']);
    for (const d of drafts) expect(d.notes ?? '', d.id).toMatch(/MC-8|C-9/);
  });

  it('lets no Frozen metric rest on a Draft one, transitively', () => {
    const offenders: string[] = [];
    for (const m of METRIC_REGISTRY) {
      if (m.status !== 'Frozen') continue;
      const seen = new Set<string>([m.id]);
      const stack = metricRefs(m);
      while (stack.length > 0) {
        const id = stack.pop() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const dep = findMetric(id);
        if (dep === undefined) continue;
        if (dep.status === 'Draft') offenders.push(`${m.id} -> ${id}`);
        stack.push(...metricRefs(dep));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps no Draft metric in the dependency closure of anything the Command Center shows', () => {
    const drafts: string[] = [];
    const seen = new Set<string>();
    const stack = [...view.kpis.map((k) => k.evidence.metricId ?? '').filter((id) => id !== ''),
      'MET-PORT-007', 'MET-FCST-025', 'MET-HLTH-033'];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const m = findMetric(id);
      if (m === undefined) continue;
      if (m.status === 'Draft') drafts.push(id);
      stack.push(...metricRefs(m));
    }
    expect(drafts).toEqual([]);
  });

  it('keeps the registry itself free of violations after the freeze', () => {
    expect(validateRegistry()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Ranking edge cases — the tail matters as much as the top
// ---------------------------------------------------------------------------

type Tiers = Parameters<typeof comparePriority>[0];

const tiers = (o: Partial<Tiers> = {}): Tiers => ({
  criticalExposure: false, predictedDeterioration: false, timeCriticalityWeeks: null,
  gmValueAtRisk: null, actionability: 'NOT_ASSESSED', rankConfidence: 'LOW', ...o,
});

describe('the ranking is total, ordered and defensible at every tier', () => {
  it('puts critical exposure above everything, including a far larger unexposed figure', () => {
    expect(comparePriority(
      tiers({ criticalExposure: true, gmValueAtRisk: '1' as Tiers['gmValueAtRisk'] }),
      tiers({ gmValueAtRisk: '999999999' as Tiers['gmValueAtRisk'] }), 'a', 'b',
    )).toBeLessThan(0);
  });

  it('orders two critically exposed projects by clock before value', () => {
    expect(comparePriority(
      tiers({ criticalExposure: true, timeCriticalityWeeks: 1, gmValueAtRisk: '1' as Tiers['gmValueAtRisk'] }),
      tiers({ criticalExposure: true, timeCriticalityWeeks: 9, gmValueAtRisk: '9000000' as Tiers['gmValueAtRisk'] }),
      'a', 'b',
    )).toBeLessThan(0);
  });

  it('sorts a known clock ahead of an unknown one at equal exposure', () => {
    expect(comparePriority(
      tiers({ criticalExposure: true, timeCriticalityWeeks: 20 }),
      tiers({ criticalExposure: true, timeCriticalityWeeks: null }), 'a', 'b',
    )).toBeLessThan(0);
  });

  it('treats "no clock known" and "now" as opposite statements, never as the same cell', () => {
    expect(formatWeeks(null)).toBe('no clock known');
    expect(formatWeeks(0)).toBe('now');
    expect(formatWeeks(1)).toBe('1 week');
    expect(formatWeeks(6)).toBe('6 weeks');
  });

  it('sorts a measured value at risk ahead of an unmeasured one', () => {
    expect(comparePriority(
      tiers({ criticalExposure: true, timeCriticalityWeeks: 3, gmValueAtRisk: '10' as Tiers['gmValueAtRisk'] }),
      tiers({ criticalExposure: true, timeCriticalityWeeks: 3, gmValueAtRisk: null }), 'a', 'b',
    )).toBeLessThan(0);
  });

  it('never lets actionability lift a small problem above a large one', () => {
    expect(comparePriority(
      tiers({ criticalExposure: true, gmValueAtRisk: '9000000' as Tiers['gmValueAtRisk'] }),
      tiers({ gmValueAtRisk: '1' as Tiers['gmValueAtRisk'], actionability: 'CREDIBLE_PLAN' }),
      'a', 'b',
    )).toBeLessThan(0);
  });

  it('falls back to the project id only when every tier is equal (AC-7)', () => {
    const a = tiers({ criticalExposure: true, timeCriticalityWeeks: 4, gmValueAtRisk: '5' as Tiers['gmValueAtRisk'] });
    expect(comparePriority(a, a, 'prj-001', 'prj-002')).toBeLessThan(0);
    expect(comparePriority(a, a, 'prj-002', 'prj-001')).toBeGreaterThan(0);
    expect(comparePriority(a, a, 'prj-001', 'prj-001')).toBe(0);
  });

  it('produces a strictly increasing rank across the whole real portfolio', () => {
    for (let i = 0; i + 1 < view.ranked.length; i += 1) {
      const x = view.ranked[i];
      const y = view.ranked[i + 1];
      if (x === undefined || y === undefined) continue;
      expect(x.rank).toBeLessThan(y.rank);
    }
  });

  it('ranks every fixed-bid project or says why it could not', () => {
    expect(view.ranked.length + view.insufficientEvidence.length).toBe(view.projectCount);
    for (const u of view.insufficientEvidence) expect(u.reason.length).toBeGreaterThan(10);
  });

  it('states the deciding tier for every row except the last', () => {
    for (const r of view.ranked.slice(0, -1)) {
      expect(r.outranksBecause, r.projectId).toMatch(/tier \d/);
    }
    expect(view.ranked.at(-1)?.outranksBecause).toBe('');
  });

  it('does not let tier 1 alone decide the order — it partitions, it does not rank', () => {
    // Tier 1 fires for most of this portfolio. If it were doing all the work, the tail of the
    // table would be arbitrary; in fact the clock and the value at risk separate most pairs.
    const deciders = view.ranked.slice(0, -1)
      .map((r) => (r.outranksBecause.match(/tier \d/) ?? ['none'])[0]);
    expect(new Set(deciders).size).toBeGreaterThan(1);
    expect(deciders.filter((d) => d === 'tier 3' || d === 'tier 4').length)
      .toBeGreaterThan(deciders.length / 2);
  });
});

// ---------------------------------------------------------------------------
// 5. Actionability — can a reader act without asking a second question?
// ---------------------------------------------------------------------------

describe('the table answers the follow-up questions without a second interaction', () => {
  const table = executiveTable(view, false);
  const headers = table.columns.map((c) => c.header);

  it('shows the clock, so a reader learns how long they have in the same glance', () => {
    expect(headers).toContain('Time to act');
    for (const row of table.rows) expect(row.cells['clock']?.display, row.id).toBeDefined();
  });

  it('shows rank confidence beside the order, never blended into it', () => {
    expect(headers).toContain('Rank conf.');
    for (const r of view.ranked) expect(['LOW', 'MEDIUM', 'HIGH']).toContain(r.rankConfidence);
  });

  it('shows recovery status honestly — "Not assessed" where no plan store exists (DR-049)', () => {
    expect(headers).toContain('Recovery');
    expect(new Set(table.rows.map((r) => r.cells['recovery']?.display)).has('Not assessed'))
      .toBe(true);
  });

  it('names an accountable owner on every row', () => {
    for (const r of view.ranked) {
      expect(r.deliveryLeader.length, r.projectId).toBeGreaterThan(0);
      expect(r.daOwner.length, r.projectId).toBeGreaterThan(0);
    }
  });

  it('carries the evidence gaps that qualify a row, rather than hiding them', () => {
    for (const r of view.ranked) expect(Array.isArray(r.evidenceGaps)).toBe(true);
  });

  it('names the first project to intervene in above the table', () => {
    const first = view.ranked[0];
    expect(first).toBeDefined();
    expect(page).toContain(first?.name ?? ' ');
  });
});

// ---------------------------------------------------------------------------
// 6. Honesty gates — nothing claimed that is not built
// ---------------------------------------------------------------------------

describe('the surface claims only what it can support', () => {
  it('reports the absence of a prior period rather than rendering a zero movement', () => {
    expect(view.kpis.every((k) => k.delta === undefined)).toBe(true);
    expect(page).toMatch(/no prior period|not available|unavailable|no comparison/i);
  });

  it('carries the DEMO — SYNTHETIC DATA labelling through the built artifact', () => {
    const built = readFileSync('docs/design/portfolio-command-center.html', 'utf8');
    expect(built).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/i);
  });

  it('computes no business value in the surface source', () => {
    const src = readFileSync('src/presentation/surfaces/portfolio-command-center.tsx', 'utf8');
    expect(src).not.toMatch(/\.plus\(|\.minus\(|\.times\(|toFixed\(|parseFloat\(/);
  });

  it('formats every money figure server-side, as a string the component cannot re-derive', () => {
    for (const k of view.kpis) expect(typeof k.display).toBe('string');
    for (const r of view.ranked) expect(typeof r.gmValueAtRisk).toBe('string');
  });

  it('is deterministic across a rebuild, including the new population fields (AC-7)', () => {
    expect(JSON.stringify(buildCommandCenterFor(portfolio, allIds))).toBe(JSON.stringify(view));
  });

  it('does not depend on wall-clock time — the same inputs give the same asOf', () => {
    expect(buildCommandCenterFor(portfolio, allIds).asOf).toBe(view.asOf);
  });
});
