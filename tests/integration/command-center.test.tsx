/**
 * The Portfolio Command Center — service, authorization and surface.
 *
 * Three questions this suite exists to answer, in order of how badly a wrong answer would hurt:
 *
 *   1. **Are the aggregates the caller's own?** A portfolio total that quietly includes a project the
 *      caller may not see is a data leak wearing a KPI card. AC-5 is asserted here against the real
 *      pipeline, not against a mock.
 *   2. **Does the page compute anything?** `PRODUCT_SPEC.md` §8 calls a metric computed in a
 *      component a defect. The surface is asserted to contain no arithmetic and to render only the
 *      strings the service produced.
 *   3. **Does every number trace?** AC-3 gives a reader ≤3 steps from a headline figure to the L1
 *      facts. Every KPI is asserted to carry a metric id, a rule version and evidence lines.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { JSX } from 'react';
import { Money, qty } from '@platform/decimal';
import { ruleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import type { CommandCenterView } from '@app';
import { buildCommandCenter, formatMoneyCompact, formatPercentagePoints, formatRatio } from '@app';
import { PortfolioCommandCenter, bubbleMatrix, executiveTable, kpiViewModel } from '@presentation/index.js';
import { generatePortfolio } from '../../scripts/generator/index.js';
import {
  DEMO_PRIORITY_POLICY, buildCommandCenterFor, commandCenterProject,
} from '../../scripts/assessment/command-center-adapter.js';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

const portfolio = generatePortfolio();
const USD = 'USD' as const;

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return api.contextFor(actorId, session.sessionId);
}

const html = (el: JSX.Element): string => renderToStaticMarkup(el);
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/**
 * An authorised *universe* that deliberately mixes contracting models.
 *
 * The Command Center reports on the fixed-bid population only, so every expectation below must be
 * computed over `someFixedBid`, never over `someProjects`. Handing the builder a mixed set is the
 * point: a test whose input is already pure would not notice if the filter were deleted.
 */
const someProjects = portfolio.structure.projects.slice(0, 12).map((p) => p.projectId);
const someFixedBid = portfolio.structure.projects
  .slice(0, 12).filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);
const view = buildCommandCenterFor(portfolio, someProjects);

/**
 * **DR-075 regression.** Every figure that reaches an executive surface is formatted.
 *
 * `MET-PORT-007` composes its explanation from raw decimal strings, so `outranksBecause` carried
 * `(tier 4: 5552145.679817 vs 3224813.110147)` and `rankNarrative` carried
 * `GM value at risk 5552145.679817`. Ten instances were rendered on two shipped pages, beside
 * columns reading `$5.55M`. A reader who tries to reconcile the two is reconciling the same number
 * against itself in two notations.
 *
 * The value is untouched; only its presentation is. This guard is on the **view model**, not on the
 * built HTML, because `npm run verify` runs the tests before it rebuilds the pages - a test reading
 * `docs/design/*.html` would be asserting against the previous build.
 */
const UNFORMATTED_DECIMAL = /\d{5,}\.\d{4,}/;


// ---------------------------------------------------------------------------
// 1. The service
// ---------------------------------------------------------------------------

describe('the command-centre service', () => {
  it('emits exactly eight KPIs, in the order the brief specifies', () => {
    expect(view.kpis).toHaveLength(8);
    expect(view.kpis.map((k) => k.id)).toEqual([
      'tcv', 'sold-gm', 'forecast-gm', 'gm-var',
      'contract-loss', 'amber-red', 'green-at-risk', 'uncommercialised',
    ]);
  });

  it('gives every KPI a metric id, a rule version and evidence lines (AC-3)', () => {
    for (const k of view.kpis) {
      expect(k.metricId, k.id).toMatch(/^MET-[A-Z]+-\d{3}$/);
      expect(k.evidence.ruleVersion, k.id).toBeDefined();
      expect(k.evidence.lines.length, k.id).toBeGreaterThan(1);
      expect(k.evidence.sources.length, k.id).toBeGreaterThan(0);
      expect(k.filterId, k.id).not.toBe('');
    }
  });

  it('labels each KPI with its epistemic layer, never uniformly', () => {
    const treatments = new Set(view.kpis.map((k) => k.treatment));
    // Counts of assessed bands are inferred; money totals are computed. Both appear.
    expect(treatments.has('computed')).toBe(true);
    expect(treatments.has('inferred')).toBe(true);
  });

  it('orders the table by intervention priority, never alphabetically', () => {
    const names = view.ranked.map((r) => r.name);
    const alphabetical = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).not.toEqual(alphabetical);
    expect(view.ranked.map((r) => r.rank)).toEqual(view.ranked.map((_, i) => i + 1));
  });

  it('states why each row outranks the next, so the ordering is arguable', () => {
    for (const r of view.ranked.slice(0, -1)) {
      expect(r.outranksBecause, `${r.projectId} gives no reason`).toMatch(/tier \d/);
      expect(r.rankNarrative.length).toBeGreaterThan(40);
    }
    expect(view.ranked.at(-1)?.outranksBecause).toBe('');
  });

  it('reconciles the Green-at-Risk panel to the engine, project for project', () => {
    const fromEngine = someFixedBid
      .map((id) => commandCenterProject(portfolio, id))
      .filter((p) => p.assessment.greenAtRisk.isSystemGreenAtRisk)
      .map((p) => p.projectId);
    expect(view.greenAtRisk.systemGreenAtRiskCount).toBe(fromEngine.length);
    expect([...view.greenAtRisk.projectIds].sort()).toEqual([...fromEngine].sort());
  });

  it('counts Reported Green Risk separately from System Green-at-Risk (ADR-0018)', () => {
    const reported = someFixedBid
      .map((id) => commandCenterProject(portfolio, id))
      .filter((p) => p.assessment.greenAtRisk.isReportedGreenRisk)
      .map((p) => p.projectId);
    expect(view.greenAtRisk.reportedGreenRiskCount).toBe(reported.length);
    expect([...view.greenAtRisk.reportedGreenRiskProjectIds].sort()).toEqual([...reported].sort());
  });

  it('reconciles the Green-at-Risk value at risk to the sum of its own projects', () => {
    const expected = someFixedBid
      .map((id) => commandCenterProject(portfolio, id))
      .filter((p) => p.assessment.greenAtRisk.isSystemGreenAtRisk)
      .reduce((m, p) => m.plus(p.assessment.economics.gmValueAtRisk), Money.zero(USD));
    expect(view.greenAtRisk.gmValueAtRisk).toBe(formatMoneyCompact(expected));
  });

  it('reports the absence of a prior period rather than rendering no change', () => {
    expect(view.priorPeriodLabel).toBeNull();
    for (const k of view.kpis) expect(k.delta).toBeUndefined();
    expect(view.whatChanged.some((n) => n.id === 'no-prior')).toBe(true);
    expect(text(<PortfolioCommandCenter view={view} commercialRestricted={false} />))
      .toContain('No prior period is loaded');
  });

  it('computes deltas, with sentiment separate from direction, when a prior period is supplied', () => {
    const projects = someProjects.map((id) => commandCenterProject(portfolio, id));
    const withPrior = buildCommandCenter({
      asOf: '2026-08-31T00:00:00.000Z' as Instant,
      week: '2026-W35' as WeekId,
      currency: USD,
      zero: Money.zero(USD),
      ruleVersion: ruleVersion('HEALTH-v2'),
      priorityPolicy: DEMO_PRIORITY_POLICY,
      projects,
      // A prior period of half the portfolio: TCV must read as *up*, and up on TCV is not bad news.
      prior: { label: 'Jul 2026', projects: projects.slice(0, 6) },
    });
    const tcv = withPrior.kpis.find((k) => k.id === 'tcv');
    expect(tcv?.delta?.direction).toBe('up');
    expect(tcv?.delta?.sentiment).toBe('positive');
    const gmVar = withPrior.kpis.find((k) => k.id === 'gm-var');
    expect(gmVar?.delta?.direction).toBe('up');
    // Same direction, opposite meaning. The service decides; no arrow could.
    expect(gmVar?.delta?.sentiment).toBe('negative');
    expect(withPrior.whatChanged.some((n) => n.id === 'var-move')).toBe(true);
  });

  it('offers every filter the brief names, with server-side counts', () => {
    const ids = view.filters.map((f) => f.id);
    for (const expected of [
      'region', 'industry', 'delivery-group', 'delivery-leader', 'da-owner', 'size', 'rag',
      'trajectory', 'green-at-risk', 'forecast-confidence', 'margin-erosion', 'scope-exposure',
      'executive-intervention',
    ]) {
      expect(ids, expected).toContain(expected);
    }
    for (const f of view.filters) {
      expect(f.options.length, f.id).toBeGreaterThan(1);
      for (const o of f.options) expect(o.count, `${f.id}/${o.value}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic — identical inputs, byte-identical output (AC-7)', () => {
    const a = buildCommandCenterFor(portfolio, someProjects);
    const b = buildCommandCenterFor(portfolio, someProjects);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('totals an empty authorised set in a stated currency rather than failing', () => {
    const empty = buildCommandCenterFor(portfolio, []);
    expect(empty.projectCount).toBe(0);
    expect(empty.kpis).toHaveLength(8);
    expect(empty.kpis[0]?.display).toBe('$0');
    expect(empty.ranked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Formatting is decimal-safe and done once
// ---------------------------------------------------------------------------

describe('every figure is formatted server-side, decimal-safely', () => {
  it('formats money compactly, with a real minus sign for a loss', () => {
    expect(formatMoneyCompact(Money.of('4820000.00', USD))).toBe('$4.82M');
    expect(formatMoneyCompact(Money.of('812400.00', USD))).toBe('$812K');
    expect(formatMoneyCompact(Money.of('940.00', USD))).toBe('$940');
    expect(formatMoneyCompact(Money.of('0.00', USD))).toBe('$0');
    expect(formatMoneyCompact(Money.of('-1100000.00', USD))).toBe('−$1.10M');
  });

  it('never loses precision to a float on the way to a string', () => {
    // 0.1 + 0.2 in binary floating point is 0.30000000000000004. Decimal arithmetic is why this
    // repository exists, and the formatter must not undo it at the last step.
    const m = Money.of('0.10', USD).plus(Money.of('0.20', USD));
    expect(m.toQuantity()).toBe('0.3');
    expect(m.toQuantity()).not.toContain('0.30000000000000004');
    expect(formatMoneyCompact(m)).toBe('$0');
    // And at a scale where a float error would actually surface in an executive figure.
    const large = Money.of('4820000.10', USD).plus(Money.of('0.20', USD));
    expect(large.toQuantity()).toBe('4820000.3');
    expect(formatMoneyCompact(large)).toBe('$4.82M');
  });

  it('says "not computable" rather than showing a dash or a zero', () => {
    const notComputable = { computable: false as const, reason: 'ZERO_DENOMINATOR' as const };
    expect(formatRatio(notComputable as never)).toBe('not computable');
    expect(formatPercentagePoints(notComputable as never)).toBe('not computable');
  });

  it('signs percentage points, because −7.9pp is not −7.9%', () => {
    const row = view.ranked[0];
    expect(row?.burnGap).toMatch(/^[+−-]?\d/);
    expect(row?.burnGap).toContain('pp');
  });
});

// ---------------------------------------------------------------------------
// 3. Authorization — the aggregate is the caller's own
// ---------------------------------------------------------------------------

describe('aggregates are computed within the caller scope (AC-5, ADR-0005 §5)', () => {
  const fetchView = async (username: string, actorId: string) => {
    const ctx = await as(username, actorId);
    const response = await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });
    return { status: response.status, body: response.body as { data: Record<string, unknown>[] } };
  };

  it('gives two directors materially different portfolios from the same request', async () => {
    const emea = await fetchView('dir.emea', 'usr-dir-emea');
    const amer = await fetchView('dir.amer', 'usr-dir-amer');
    expect(emea.status).toBe(200);
    expect(amer.status).toBe(200);

    const emeaRow = emea.body.data[0] as unknown as CommandCenterView;
    const amerRow = amer.body.data[0] as unknown as CommandCenterView;
    expect(emeaRow.projectCount).toBeGreaterThan(0);
    expect(amerRow.projectCount).toBeGreaterThan(0);
    expect(emeaRow.projectCount).not.toBe(amerRow.projectCount);

    const tcv = (v: CommandCenterView) => v.kpis.find((k) => k.id === 'tcv')?.display;
    expect(tcv(emeaRow)).not.toBe(tcv(amerRow));

    // And no project appears in both — the sets are genuinely disjoint, not merely different totals.
    const emeaIds = new Set(emeaRow.ranked.map((r) => r.projectId));
    for (const r of amerRow.ranked) expect(emeaIds.has(r.projectId), r.projectId).toBe(false);
  });

  it('gives an executive a strictly larger portfolio than a scoped director', async () => {
    const exec = await fetchView('exec.cdo', 'usr-exec-cdo');
    const emea = await fetchView('dir.emea', 'usr-dir-emea');
    const execRow = exec.body.data[0] as unknown as CommandCenterView;
    const emeaRow = emea.body.data[0] as unknown as CommandCenterView;
    expect(execRow.projectCount).toBeGreaterThan(emeaRow.projectCount);
  });

  it('denies a role without portfolio.viewAggregates, disclosing nothing', async () => {
    const ctx = await as('dm.mobility', 'usr-dm-mobility');
    const response = await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('refuses the security administrator, who holds no business capability', async () => {
    const ctx = await as('sec.admin', 'usr-sec-admin');
    const response = await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });
    expect(response.status).toBe(404);
  });

  it('audits the read, because the payload carries commercial data', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });
    const reads = api.audit.all().filter(
      (r) => r.entityType === 'portfolioCommandCenter' && r.decision === 'GRANT',
    );
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.at(-1)?.fields).toContain('kpis');
  });

  it('never returns a project outside the caller’s resolved set', async () => {
    const ctx = await as('dir.emea', 'usr-dir-emea');
    const authorised = new Set((await api.policy.resolveScope(ctx.auth)).projectIds);
    const response = await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });
    const row = (response.body as { data: Record<string, unknown>[] }).data[0] as unknown as CommandCenterView;
    for (const r of row.ranked) expect(authorised.has(r.projectId), r.projectId).toBe(true);
    for (const b of row.bubbles) expect(authorised.has(b.projectId), b.projectId).toBe(true);
    for (const id of row.greenAtRisk.projectIds) expect(authorised.has(id), id).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The surface renders, and computes nothing
// ---------------------------------------------------------------------------

describe('the surface renders view models and computes nothing', () => {
  const page = <PortfolioCommandCenter view={view} commercialRestricted={false} />;

  it('renders all eight KPI cards with their figures', () => {
    const out = text(page);
    for (const k of view.kpis) {
      expect(out, k.label).toContain(k.label);
      expect(out, k.display).toContain(k.display);
    }
  });

  it('shows the Green-at-Risk panel with both counts, never one label for both', () => {
    const out = text(page);
    expect(out).toContain('System Green-at-Risk');
    expect(out).toContain('Reported Green Risk');
    expect(out).toContain(String(view.greenAtRisk.systemGreenAtRiskCount));
  });

  it('answers "where do I intervene first?" above the table', () => {
    const out = text(page);
    expect(out).toContain('Intervene first');
    expect(out).toContain(view.ranked[0]?.name ?? '');
    expect(out).toContain('Outranks the next project because');
  });

  it('carries a drill-through from every KPI, the panel and every row', () => {
    const out = html(page);
    expect(out).toContain('/projects?filter.green-at-risk=yes');
    expect(out).toContain(`/projects/${view.ranked[0]?.projectId ?? ''}`);
  });

  it('renders a table ordered by rank, with the first column as the row header', () => {
    const out = html(page);
    expect(out).toContain('scope="row"');
    expect(out).toContain('aria-sort="descending"');
    expect(out).toContain(`1. ${view.ranked[0]?.name ?? ''}`);
  });

  it('renders no status by colour alone', () => {
    const out = text(page);
    // Every RAG cell renders its word; a bare coloured chip is unconstructible by type.
    for (const band of ['GREEN', 'AMBER', 'RED']) {
      if (view.ranked.some((r) => r.systemAssessedRag === band)) {
        expect(out, band).toContain(band);
      }
    }
  });

  it('gives the bubble matrix a text alternative and a data table', () => {
    const chart = bubbleMatrix(view, false);
    expect(chart.textAlternative.length).toBeGreaterThan(60);
    expect(chart.dataTable.rows).toHaveLength(view.bubbles.length);
    expect(html(page)).toContain('Show data table');
  });

  it('contains no arithmetic — the surface maps shapes, it does not compute', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/presentation/surfaces/portfolio-command-center.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    // No coercion, no money maths, no percentage maths.
    expect(source).not.toMatch(/parseFloat|parseInt|Number\s*\(/);
    expect(source).not.toMatch(/[a-zA-Z)\]]\s*[*/]\s*[a-zA-Z(\d]/);
    expect(source).not.toMatch(/\.plus\(|\.minus\(|\.dividedBy\(|\.times\(/);
    expect(source).not.toMatch(/toFixed\s*\(/);
  });

  it('renders Restricted where commercial fields were withheld, and no value', () => {
    // No current role holds portfolio.viewAggregates without COMMERCIAL_CONFIDENTIAL, so this path
    // is asserted directly rather than staged through a persona that does not exist.
    const restricted = text(<PortfolioCommandCenter view={view} commercialRestricted />);
    expect(restricted).toContain('Restricted');
    const tcv = view.kpis.find((k) => k.id === 'tcv')?.display ?? '';
    expect(restricted).not.toContain(tcv);
    expect(restricted).not.toContain('*****');
  });

  it('maps a KPI to a view model without inventing or dropping anything', () => {
    const k = view.kpis[3];
    if (k === undefined) throw new Error('fixture');
    const vm = kpiViewModel(k);
    expect(vm.value).toBe(k.display);
    expect(vm.metricId).toBe(k.metricId);
    expect(vm.evidence?.lines).toHaveLength(k.evidence.lines.length);
  });

  it('builds a table with every column the brief specifies', () => {
    const table = executiveTable(view, false);
    const headers = table.columns.map((c) => c.header);
    for (const expected of [
      'Project', 'Industry', 'Region', 'TCV', 'Sold GM %', 'Forecast GM %', 'Risk-adj GM %',
      'GM VaR', 'Progress var.', 'Burn gap', 'Uncomm. scope', 'Reported', 'Assessed', 'Trajectory',
      '30-day', '60-day', 'Forecast conf.', 'Executive action',
    ]) {
      expect(headers, expected).toContain(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. No duplicated formulas
// ---------------------------------------------------------------------------

describe('no metric is computed twice', () => {
  it('delegates ranking to MET-PORT-007 rather than reimplementing it', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/app/portfolio/command-center.ts', 'utf8');
    expect(source).toContain('rankInterventionPriority');
    // No local ordering: no comparator, no sort by exposure.
    expect(source).not.toMatch(/\.sort\(\s*\([a-z]+,\s*[a-z]+\)\s*=>\s*[a-z]+\.(?:gmValueAtRisk|exposure)/);
  });

  it('delegates the portfolio aggregate to MET-PORT-002 rather than recomputing margin', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/app/portfolio/command-center.ts', 'utf8');
    expect(source).toContain('aggregate(');
    expect(source).not.toMatch(/forecastRevenue\.minus\(.*\)\.dividedBy/);
  });

  it('reads Green-at-Risk from the engine and never re-derives it', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/app/portfolio/command-center.ts', 'utf8');
    expect(source).toContain('greenAtRisk.isSystemGreenAtRisk');
    expect(source).not.toMatch(/outlook30\s*===\s*'AMBER'\s*\|\|/);
  });

  it('reconciles the Amber/Red KPI to the health engine, not to a local rule', () => {
    const expected = someFixedBid
      .map((id) => commandCenterProject(portfolio, id))
      .filter((p) => p.assessment.health.systemAssessedRag !== 'GREEN').length;
    expect(view.kpis.find((k) => k.id === 'amber-red')?.display)
      .toBe(`${String(expected)} of ${String(someFixedBid.length)}`);
  });

  it('reconciles the RAG distribution to the same engine output', () => {
    const counts: Record<string, number> = { GREEN: 0, AMBER: 0, RED: 0 };
    for (const id of someFixedBid) {
      const band = commandCenterProject(portfolio, id).assessment.health.systemAssessedRag;
      counts[band] = (counts[band] ?? 0) + 1;
    }
    expect(view.ragDistribution).toEqual(counts);
    expect(Object.values(view.ragDistribution).reduce((a, b) => a + b, 0)).toBe(someFixedBid.length);
  });

  it('uses a decimal Quantity for every priority tier value it passes on', () => {
    // A float leaking into the ranking would be a silent precision defect in the most consequential
    // ordering in the product.
    for (const r of view.ranked) {
      expect(typeof r.gmValueAtRisk).toBe('string');
    }
    expect(qty('1')).toBe('1');
  });
});

describe('no executive surface renders an unformatted figure (DR-075)', () => {
  it('carries no raw decimal anywhere the surface renders', () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        if (UNFORMATTED_DECIMAL.test(node)) offenders.push(`${path}: ${node}`);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((n, i) => { walk(n, `${path}[${String(i)}]`); });
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
      }
    };
    /*
     * `contributions` is excluded, and the exclusion is the point of the next test rather than a
     * hole in this one.
     *
     * DR-075 is about *presentation*: a reader reconciling `$5.55M` against `5552145.679817` on the
     * same page is reconciling a number against itself in two notations. `contributions` is the
     * opposite kind of field — a deliberately unformatted governed projection that exists so a
     * filtered `MET-PORT-002` is computed by the catalogue's formula rather than approximated from
     * percentages (Phase 13, ADR-0034). Formatting it would destroy the only property it has.
     *
     * The guard that keeps this honest is that nothing renders it, which is asserted below.
     */
    const { contributions: _contributions, ...rendered } = view;
    walk(rendered, 'view');
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('never renders the raw aggregation components it carries for the Assistant', () => {
    // Every governed component is present and unformatted - that is what makes it aggregable.
    expect(view.contributions.length).toBe(view.ranked.length);
    for (const c of view.contributions) {
      expect(c.forecastRevenue).toMatch(/^-?\d/);
      expect(c.estimateAtCompletion).toMatch(/^-?\d/);
    }
    // And no presentation module reads them. A raw decimal is safe exactly as long as that holds.
    const surfaces = readdirSync(join(process.cwd(), 'src/presentation/surfaces'))
      .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
      .map((f) => readFileSync(join(process.cwd(), 'src/presentation/surfaces', f), 'utf8'));
    for (const source of surfaces) expect(source).not.toContain('contributions');
  });

  it('keeps the deciding tier while dropping only the raw comparison', () => {
    const withTier = view.ranked.filter((r) => r.outranksBecause.includes('(tier '));
    expect(withTier.length).toBeGreaterThan(0);
    for (const r of withTier) {
      // The tier identity is the governed part of the explanation and must survive.
      expect(r.outranksBecause).toMatch(/\(tier \d\)/);
      expect(r.outranksBecause).not.toMatch(/vs /);
    }
  });
});
