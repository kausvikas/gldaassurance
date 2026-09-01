/**
 * Phase 9 — Margin & Driver Intelligence.
 *
 * The suite is organised around the acceptance gate: a CFO or CDO answering what destroyed margin,
 * how much has gone, how much more is at risk, how credible the ETC is, and which lever recovers
 * most. Most of these tests exist because a decomposition can look authoritative and be wrong in
 * ways no chart reveals — a bridge that nearly reconciles, a risk deducted twice, a pending change
 * request quietly inside base revenue, or a modelled attribution presented as accounting truth.
 */
import { readFileSync } from 'node:fs';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { Money, qCompare, qty } from '@platform/decimal';
import { instant } from '@platform/time';
import type { MarginIntelligenceView } from '@app';
import { MarginIntelligence, bridgeTable, bridgeWaterfall } from '@presentation/index.js';
import { buildMarginBridge, computeEconomics, largestRemainderCents } from '@contexts/financial';
import { evaluateResource } from '@contexts/resource';
import { findMetric } from '@contexts/rules';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { economicsInputFor, resourceInputFor } from '../../scripts/assessment/curated-assessment.js';
import {
  marginBridgeFor, marginIntelligenceFor, marginTrendFor,
} from '../../scripts/assessment/margin-adapter.js';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

const portfolio = generatePortfolio();
const USD = 'USD' as const;
const FIXED_BID = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);

const idFor = (scenario: string): string => {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
};

const H = idFor('H');
const E = idFor('E');
const G = idFor('G');

const viewH = marginIntelligenceFor(portfolio, H, FIXED_BID);
const viewE = marginIntelligenceFor(portfolio, E, FIXED_BID);
const viewG = marginIntelligenceFor(portfolio, G, FIXED_BID);

const html = (el: JSX.Element): string => renderToStaticMarkup(el);
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pageH = text(<MarginIntelligence view={viewH} commercialRestricted={false} />);

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return api.contextFor(actorId, session.sessionId);
}

// ---------------------------------------------------------------------------
// 1. Waterfall reconciliation — AC-4, the phase's central claim
// ---------------------------------------------------------------------------

describe('the margin bridge reconciles to the cent (AC-4, REQ-MRGN-001)', () => {
  it('reconciles on every fixed-bid project in the portfolio', () => {
    const failures: string[] = [];
    for (const id of FIXED_BID) {
      const { bridge } = marginBridgeFor(portfolio, id);
      if (!bridge.reconciles) {
        failures.push(`${id}: ${bridge.causeSum.toQuantity()} vs ${bridge.totalDelta.toQuantity()}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('sums the causes to exactly MET-FIN-017, not to a tolerance', () => {
    const { bridge, economics } = marginBridgeFor(portfolio, H);
    expect(bridge.causeSum.toQuantity()).toBe(bridge.totalDelta.toQuantity());
    expect(bridge.totalDelta.toQuantity()).toBe(economics.marginValueDelta.toQuantity());
  });

  it('implements exactly the eight causes MET-FIN-018 registers, in order', () => {
    const { bridge } = marginBridgeFor(portfolio, H);
    expect(bridge.causes.map((c) => c.id)).toEqual([
      'scope-without-cr', 'effort-overrun', 'rate-mix', 'schedule-extension',
      'quality-rework', 'pass-through', 'fx', 'residual',
    ]);
    expect(findMetric('MET-FIN-018')?.status).toBe('Frozen');
    expect(findMetric('MET-FIN-018')?.formula).toMatch(/named residual/);
  });

  it('computes the residual as total less named, never as an estimate', () => {
    const { bridge } = marginBridgeFor(portfolio, E);
    const named = bridge.causes.filter((c) => c.id !== 'residual');
    const namedSum = named.reduce((a, c) => a.plus(c.amount), Money.zero(USD));
    const residual = bridge.causes.find((c) => c.id === 'residual');
    expect(residual?.amount.toQuantity())
      .toBe(bridge.totalDelta.minus(namedSum).toQuantity());
    expect(residual?.basis).toBe('RESIDUAL');
  });

  it('opens at MET-FIN-026 and closes at MET-FIN-024', () => {
    const { bridge, economics } = marginBridgeFor(portfolio, G);
    expect(bridge.soldGm.toQuantity()).toBe(economics.soldGmValue.toQuantity());
    expect(bridge.forecastGm.toQuantity()).toBe(economics.forecastGmValue.toQuantity());
  });

  it('keeps risk-adjusted GM outside the reconciliation, as a scenario step', () => {
    const { bridge } = marginBridgeFor(portfolio, H);
    expect(bridge.causes.map((c) => c.id)).not.toContain('risk-adjustment');
    expect(bridge.riskAdjustedGm).toBeDefined();
  });

  it('allocates rounded cents so the parts still sum to the whole', () => {
    // A third of a cent, three ways: naive rounding loses a cent, largest-remainder does not.
    const amounts = [Money.of('0.334', USD), Money.of('0.333', USD), Money.of('0.333', USD)];
    const total = Money.of('1.00', USD);
    const rounded = largestRemainderCents(amounts, total);
    const sum = rounded.reduce((a, m) => a.plus(m), Money.zero(USD));
    expect(sum.toQuantity()).toBe('1');
  });

  it('preserves signs through the allocation', () => {
    const amounts = [Money.of('-5.005', USD), Money.of('2.5', USD)];
    const total = Money.of('-2.5', USD);
    const rounded = largestRemainderCents(amounts, total);
    expect(rounded.reduce((a, m) => a.plus(m), Money.zero(USD)).toQuantity()).toBe('-2.5');
  });

  it('states reconciliation on the page rather than leaving it to be trusted', () => {
    expect(pageH).toContain('reconciles to the cent');
    expect(viewH.bridge.reconciles).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Attribution labelling — modelled is never presented as accounting truth
// ---------------------------------------------------------------------------

describe('attribution basis is on the face of every cause', () => {
  it('gives every cause one of the five declared bases', () => {
    for (const c of viewH.bridge.steps) {
      expect(['DERIVED', 'MODELLED', 'NOT_ATTRIBUTED', 'NOT_APPLICABLE', 'RESIDUAL'])
        .toContain(c.basis);
    }
  });

  it('marks effort overrun and rate/mix as modelled, because they value a quantity at a rate', () => {
    const byId = new Map(viewH.bridge.steps.map((s) => [s.id, s]));
    expect(byId.get('effort-overrun')?.modelled).toBe(true);
    expect(byId.get('rate-mix')?.modelled).toBe(true);
    expect(byId.get('effort-overrun')?.explanation).toMatch(/Modelled/);
  });

  it('does not mark a derived cause as modelled', () => {
    const byId = new Map(viewH.bridge.steps.map((s) => [s.id, s]));
    expect(byId.get('scope-without-cr')?.modelled).toBe(false);
    expect(byId.get('quality-rework')?.modelled).toBe(false);
  });

  it('distinguishes an unmeasured cause from one that cannot arise', () => {
    const byId = new Map(viewH.bridge.steps.map((s) => [s.id, s]));
    // Schedule extension is real and unmeasured; FX cannot arise in a single-currency portfolio.
    expect(byId.get('schedule-extension')?.basis).toBe('NOT_ATTRIBUTED');
    // DR-050 closed, so the slip is now measurable — but its *margin cost* still is not: it already
    // sits inside the EAC, and therefore inside this bridge's closing balance.
    expect(byId.get('schedule-extension')?.explanation).toMatch(/already inside the estimate at completion/);
    expect(byId.get('schedule-extension')?.explanation).toMatch(/double count/);
    expect(byId.get('fx')?.basis).toBe('NOT_APPLICABLE');
  });

  it('carries the modelled marker into the waterfall label, not only into a colour', () => {
    const chart = bridgeWaterfall(viewH);
    const labels = chart.steps.map((s) => s.label);
    expect(labels.some((l) => l.includes('(modelled)'))).toBe(true);
    expect(chart.textAlternative.length).toBeGreaterThan(50);
    expect(chart.reconciliationNote).toBe(viewH.bridge.reconciliationNarrative);
  });

  it('shows the basis column in the bridge table', () => {
    const table = bridgeTable(viewH);
    expect(table.columns.map((c) => c.header)).toContain('Basis');
    expect(table.rows).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// 3. Risk double counting and change-request handling
// ---------------------------------------------------------------------------

describe('risk is not double counted and pending CRs are not revenue', () => {
  it('deducts only incremental risk in MET-FIN-032', () => {
    expect(findMetric('MET-FIN-032')?.formula).toBe('MET-FIN-031 − MET-FIN-008 − MET-RSK-008');
    const e = computeEconomics(economicsInputFor(portfolio, H));
    expect(e.grossRiskExposure.toQuantity()).not.toBe(e.incrementalRiskExposure.toQuantity());
  });

  it('shows the amount excluded, so the control is visible rather than asserted', () => {
    expect(viewH.riskEconomics.provisionedInEtc).toBeDefined();
    expect(viewH.riskEconomics.doubleCountNarrative).toMatch(/excluded/);
    expect(viewH.riskEconomics.doubleCountNarrative).toMatch(/twice/);
  });

  it('marks a risk already inside the ETC as excluded rather than exposing it again', () => {
    const inEtc = viewH.riskEconomics.rows.filter((r) => r.includedInEtc.startsWith('yes'));
    for (const r of inEtc) expect(r.incrementalExposure).toMatch(/excluded/);
  });

  it('keeps expected pending CR recovery out of forecast revenue (REQ-FIN-005)', () => {
    // The identity must hold on every project: MET-FIN-031 = MET-FIN-010 + MET-COM-010, and
    // MET-FIN-010 never contains the pending figure.
    for (const id of FIXED_BID) {
      const e = computeEconomics(economicsInputFor(portfolio, id));
      expect(e.riskAdjustedRevenue.toQuantity(), id)
        .toBe(e.forecastRevenue.plus(e.expectedPendingCrRecovery).toQuantity());
    }
    // And on a project that actually has pending change requests, the two figures must differ —
    // otherwise the identity above would also be satisfied by silently folding CRs into revenue.
    const withPending = FIXED_BID
      .map((id) => ({ id, e: computeEconomics(economicsInputFor(portfolio, id)) }))
      .find((x) => !x.e.expectedPendingCrRecovery.isZero());
    expect(withPending, 'no fixed-bid project has a pending change request').toBeDefined();
    expect(withPending?.e.forecastRevenue.toQuantity())
      .not.toBe(withPending?.e.riskAdjustedRevenue.toQuantity());
  });

  it('says so on the page (REQ-MRGN-003)', () => {
    expect(viewH.riskEconomics.pendingCrNarrative).toMatch(/Neither figure is in forecast revenue/);
    expect(viewH.riskEconomics.pendingCrNarrative).toMatch(/scenario/);
  });

  it('shows unsecured upside separately from probability-weighted recovery', () => {
    expect(findMetric('MET-FIN-011')?.formula).toMatch(/Σ PendingChange.proposedValue/);
    expect(findMetric('MET-COM-010')?.formula).toMatch(/approvalProbability/);
    expect(viewH.riskEconomics.pendingCrRecovery).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Scenario arithmetic is stated, not hidden
// ---------------------------------------------------------------------------

describe('scenarios show their assumptions and their arithmetic', () => {
  it('produces exactly three scenarios', () => {
    expect(viewH.scenarios.map((s) => s.id)).toEqual(['recovery', 'most-likely', 'downside']);
  });

  it('states the arithmetic for each, in the units on screen', () => {
    for (const s of viewH.scenarios) {
      expect(s.arithmetic, s.id).toMatch(/MET-FIN-/);
      expect(s.assumptions.length, s.id).toBeGreaterThan(1);
    }
  });

  it('makes the most-likely case the forecast, with no probabilistic adjustment', () => {
    const ml = viewH.scenarios.find((s) => s.id === 'most-likely');
    expect(ml?.arithmetic).toMatch(/as computed/);
    expect(ml?.assumptions.join(' ')).toMatch(/excluded entirely/);
  });

  it('adds only the probability-weighted CR recovery in the recovery case', () => {
    const rec = viewH.scenarios.find((s) => s.id === 'recovery');
    expect(rec?.arithmetic).toMatch(/MET-COM-010/);
  });

  it('makes the contract-loss scenario prominent when margin is negative', () => {
    expect(viewH.contractLossWarning).not.toBeNull();
    expect(pageH).toContain('Forecast contract loss');
  });

  it('does not warn of contract loss where none is forecast', () => {
    expect(viewE.contractLossWarning).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Trend, contingency and ETC credibility
// ---------------------------------------------------------------------------

describe('the trend is the same engine rewound', () => {
  it('produces 6 to 12 periods, oldest first', () => {
    const trend = marginTrendFor(portfolio, H);
    expect(trend.length).toBeGreaterThanOrEqual(6);
    expect(trend.length).toBeLessThanOrEqual(12);
    const periods = trend.map((t) => t.period);
    expect([...periods].sort()).toEqual(periods);
  });

  it('ends at the figure the page shows above it', () => {
    const trend = marginTrendFor(portfolio, H);
    const last = trend.at(-1);
    const e = computeEconomics(economicsInputFor(portfolio, H));
    // Both are MET-FIN-024 from the same engine; the last trend point is the current figure.
    expect(last?.forecastGm.toQuantity()).toBe(e.forecastGmValue.toQuantity());
  });

  it('counts a deterioration streak rather than leaving it to be eyeballed', () => {
    expect(viewH.trend.deteriorationStreak).toBeGreaterThanOrEqual(0);
    expect(viewH.trend.narrative.length).toBeGreaterThan(20);
  });

  it('names a reason for every movement', () => {
    for (const r of viewH.trend.rows) expect(r.note.length).toBeGreaterThan(10);
  });

  it('reports contingency as original, consumed, remaining and burn gap', () => {
    const labels = viewH.contingency.map((c) => c.label);
    expect(labels).toContain('Original contingency');
    expect(labels).toContain('Consumed');
    expect(labels).toContain('Remaining');
    expect(labels).toContain('Contingency burn gap');
  });

  it('states ETC applicability rather than showing a dash', () => {
    expect(typeof viewH.etcCredibility.applicable).toBe('boolean');
    expect(viewH.etcCredibility.narrative.length).toBeGreaterThan(30);
    if (!viewH.etcCredibility.applicable) {
      expect(viewH.etcCredibility.narrative).toMatch(/Not applicable/);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Resource, quality and dependency economics
// ---------------------------------------------------------------------------

describe('driver economics are attributed and labelled', () => {
  it('measures effort variance against a time-phased baseline, and names it', () => {
    const e = computeEconomics(economicsInputFor(portfolio, H));
    const r = evaluateResource(resourceInputFor(portfolio, H, e));
    expect(r.effortBaselineBasis).toMatch(/time-phased/);
    expect(r.plannedEffortToDate.value).not.toBeNull();
  });

  it('does not compare hours to date against whole-project planned hours', () => {
    const e = computeEconomics(economicsInputFor(portfolio, H));
    const input = resourceInputFor(portfolio, H, e);
    const r = evaluateResource(input);
    // The time-phased baseline must be smaller than the whole-project figure on a live project.
    expect(qCompare(r.plannedEffortToDate.value as string, input.plannedEffortHours))
      .toBeLessThanOrEqual(0);
  });

  it('exposes no person identifier or per-person cost anywhere in the payload', () => {
    // A keyword grep would only catch the words this code happens to use — and would trip on the
    // page's own disclaimer. The real property is that no **actual** person reference from the
    // facts reaches the payload, and that the staffing shape carries counts only.
    const refs = new Set(
      portfolio.facts.assignments.filter((a) => a.projectId === H).map((a) => a.personRef),
    );
    expect(refs.size, 'the project has no assignments to leak').toBeGreaterThan(0);
    const serialised = JSON.stringify(viewH);
    for (const ref of refs) expect(serialised, ref).not.toContain(ref);

    // The staffing mix shape can carry a band, a headcount and an FTE — and nothing else.
    for (const m of viewH.seniorityMix) {
      expect(Object.keys(m).sort()).toEqual(['band', 'fte', 'people']);
    }
  });

  it('reports quality economics with rework valued at cost', () => {
    const labels = viewG.qualityEconomics.map((q) => q.label);
    expect(labels).toContain('Rework ratio');
    expect(labels).toContain('Excess rework cost');
    expect(labels).toContain('Acceptance blockers');
  });

  it('states that dependency economics are unmeasured rather than estimating them', () => {
    expect(viewH.dependencyNarrative).toMatch(/not measured|not estimated|cannot be valued/);
  });

  it('does not fabricate a blocked-hours figure', () => {
    const blocked = viewH.dependencyEconomics.find((d) => d.label === 'Blocked hours');
    expect(blocked?.value).toBe('not computable');
    expect(blocked?.notComputableReason).toMatch(/DR-057/);
  });
});

// ---------------------------------------------------------------------------
// 7. Portfolio driver ranking
// ---------------------------------------------------------------------------

describe('portfolio driver ranking is computed over the authorised set', () => {
  it('ranks by currency impact, descending (REQ-MRGN-002)', () => {
    const drivers = viewH.portfolio;
    expect(drivers).not.toBeNull();
    for (const list of [
      drivers?.topMarginLoss ?? [], drivers?.largestScopeLeakage ?? [],
      drivers?.largestResourceDrift ?? [],
    ]) {
      for (let i = 0; i + 1 < list.length; i += 1) {
        expect((list[i] as { value: number }).value)
          .toBeGreaterThanOrEqual((list[i + 1] as { value: number }).value);
      }
    }
  });

  it('names the basis of each ranking, so a reader knows what was ranked', () => {
    for (const row of viewH.portfolio?.topRecoverable ?? []) {
      expect(row.basis).toMatch(/MET-COM-010/);
      expect(row.basis).toMatch(/scenario/);
    }
  });

  it('counts only fixed-bid projects, matching the Command Center population', () => {
    expect(viewH.portfolio?.projectCount).toBe(FIXED_BID.length);
  });

  it('is absent when no authorised set is supplied, rather than defaulting to everything', () => {
    const noScope = marginIntelligenceFor(portfolio, H);
    expect(noScope.portfolio).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Authorization
// ---------------------------------------------------------------------------

describe('authorization is enforced by the server', () => {
  const fetchView = async (username: string, actorId: string, entityId: string) => {
    const ctx = await as(username, actorId);
    const response = await api.gateway.request(ctx, {
      view: 'project.marginIntelligence', entityId,
    });
    return { status: response.status, body: response.body as { data: Record<string, unknown>[] } };
  };

  it('returns the diagnostic to a caller holding project.viewCommercial', async () => {
    const r = await fetchView('exec.cdo', 'usr-exec-cdo', H);
    expect(r.status).toBe(200);
    const row = r.body.data[0] as unknown as MarginIntelligenceView;
    expect(row.bridge.reconciles).toBe(true);
  });

  it('denies a Delivery Manager, who does not hold project.viewCommercial', async () => {
    const r = await fetchView('dm.mobility', 'usr-dm-mobility', H);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('withholds the PERSONAL_DATA staffing mix from every caller', async () => {
    const r = await fetchView('exec.cdo', 'usr-exec-cdo', H);
    const row = r.body.data[0] as Record<string, unknown>;
    // No role holds PERSONAL_DATA, so all three staffing cuts are absent — and their absence is
    // the signal, never a flag carrying the withheld value.
    for (const f of ['seniorityMix', 'locationMix', 'engagementMix']) {
      expect(f in row, f).toBe(false);
    }
  });

  it('renders the withholding rather than an empty row', () => {
    const withheld = { ...viewH } as Record<string, unknown>;
    delete withheld['seniorityMix'];
    const rendered = text(
      <MarginIntelligence
        view={withheld as unknown as MarginIntelligenceView}
        commercialRestricted={false}
      />,
    );
    expect(rendered).toContain('Staffing mix withheld');
  });

  it('audits the read, because the payload is commercial throughout', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    await api.gateway.request(ctx, { view: 'project.marginIntelligence', entityId: H });
    const reads = api.audit.all().filter(
      (r) => r.entityType === 'marginIntelligence' && r.decision === 'GRANT',
    );
    expect(reads.length).toBeGreaterThan(0);
  });

  it('declares the view in the closed VIEW_ROUTES table', async () => {
    const { VIEW_ROUTES } = await import('@app');
    expect(VIEW_ROUTES['project.marginIntelligence']).toEqual({
      method: 'GET', path: '/v1/projects/:id/margin-intelligence',
    });
  });
});

// ---------------------------------------------------------------------------
// 9. The surface computes nothing, and the artifact exists
// ---------------------------------------------------------------------------

describe('the surface renders and does not compute', () => {
  it('contains no arithmetic', () => {
    const src = readFileSync('src/presentation/surfaces/margin-intelligence.tsx', 'utf8');
    expect(src).not.toMatch(/\.plus\(|\.minus\(|\.times\(|\.dividedBy\(|toFixed\(|parseFloat\(/);
  });

  it('renders every section the brief names', () => {
    for (const heading of [
      'Core financials', 'Margin bridge', 'Gross margin and EAC trend', 'Risk-adjusted economics',
      'Contingency', 'ETC credibility', 'Resource economics', 'Quality economics',
      'Customer dependency economics', 'Scenarios', 'Portfolio drivers',
    ]) {
      expect(pageH, heading).toContain(heading);
    }
  });

  it('carries the DEMO — SYNTHETIC DATA marker', () => {
    expect(pageH).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/);
  });

  it('renders a restricted payload as a denial, not as an empty page', () => {
    const restricted = text(<MarginIntelligence view={viewH} commercialRestricted />);
    expect(restricted).toContain('Restricted');
    expect(restricted).not.toContain('Margin bridge');
  });

  it('is deterministic (AC-7)', () => {
    expect(JSON.stringify(marginIntelligenceFor(portfolio, H, FIXED_BID)))
      .toBe(JSON.stringify(viewH));
  });

  it('carries the demo marker and the denial case through the built artifact', () => {
    const built = readFileSync('docs/design/margin-intelligence.html', 'utf8');
    expect(built).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/i);
    expect(built).toContain('Not available to this role');
  });
});
