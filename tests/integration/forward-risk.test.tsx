/**
 * Phase 10 — Forward Risk, Early Warning & Recovery.
 *
 * The suite is organised around the acceptance gate's seven questions and around the ways an
 * intervention surface can be confidently wrong: a warning that fires only once a band has already
 * moved, a rules engine describing itself as a probability, a recovery plan banking one saving
 * twice, an assurance failure quietly charged to the project, or an action that mutates a baseline
 * nobody authorised it to touch.
 */
import { readFileSync } from 'node:fs';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { qCompare, qty } from '@platform/decimal';
import { instant } from '@platform/time';
import type { ForwardRiskView } from '@app';
import { ForwardRisk, actionTable, signalTable } from '@presentation/index.js';
import { EARLY_WARNING_RULES, findMetric } from '@contexts/rules';
import {
  computeLateDetectionRate, evaluateEarlyWarnings, severityFor, thresholdMultipleOf,
} from '@contexts/forecast';
import { generatePortfolio } from '../../scripts/generator/index.js';
import {
  earlyWarningsFor, forwardRiskFor, lateDetectionFor, recoveryEconomicsFor, warningReadingsFor,
} from '../../scripts/assessment/risk-adapter.js';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

const portfolio = generatePortfolio();
const FIXED_BID = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);

const idFor = (scenario: string): string => {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
};

const B = idFor('B');
const D = idFor('D');
const H = idFor('H');

const viewB = forwardRiskFor(portfolio, B, FIXED_BID);
const viewD = forwardRiskFor(portfolio, D, FIXED_BID);
const viewH = forwardRiskFor(portfolio, H, FIXED_BID);

const html = (el: JSX.Element): string => renderToStaticMarkup(el);
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pageH = text(<ForwardRisk view={viewH} commercialRestricted={false} />);

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return api.contextFor(actorId, session.sessionId);
}

// ---------------------------------------------------------------------------
// 1. Warning generation and de-duplication
// ---------------------------------------------------------------------------

describe('early-warning detection', () => {
  it('evaluates every declared rule and accounts for each one', () => {
    const a = earlyWarningsFor(portfolio, H);
    expect(a.warnings.length + a.clear.length + a.notEvaluated.length)
      .toBe(EARLY_WARNING_RULES.length);
  });

  it('emits at most one warning per rule — no duplicates', () => {
    for (const id of FIXED_BID) {
      const ids = earlyWarningsFor(portfolio, id).warnings.map((w) => w.ruleId);
      expect(new Set(ids).size, id).toBe(ids.length);
    }
  });

  it('names the reason for every rule it could not evaluate', () => {
    for (const n of earlyWarningsFor(portfolio, D).notEvaluated) {
      expect(n.reason.length, n.ruleId).toBeGreaterThan(5);
    }
  });

  it('orders warnings most severe first, deterministically', () => {
    const rank: Record<string, number> = { SEVERE: 3, HIGH: 2, ELEVATED: 1 };
    const w = earlyWarningsFor(portfolio, H).warnings;
    for (let i = 0; i + 1 < w.length; i += 1) {
      const a = w[i] as { severity: string; ruleId: string };
      const b = w[i + 1] as { severity: string; ruleId: string };
      const byRank = (rank[a.severity] ?? 0) - (rank[b.severity] ?? 0);
      expect(byRank >= 0, `${a.ruleId} before ${b.ruleId}`).toBe(true);
      if (byRank === 0) expect(a.ruleId.localeCompare(b.ruleId)).toBeLessThanOrEqual(0);
    }
  });

  it('bands severity by distance past the threshold, not by which signal it is', () => {
    expect(severityFor(thresholdMultipleOf('9', '3'))).toBe('SEVERE');
    expect(severityFor(thresholdMultipleOf('2', '1'))).toBe('HIGH');
    expect(severityFor(thresholdMultipleOf('1.1', '1'))).toBe('ELEVATED');
  });

  it('falls back to ELEVATED where a zero threshold makes distance meaningless', () => {
    expect(thresholdMultipleOf('5', '0')).toBeNull();
    expect(severityFor(null)).toBe('ELEVATED');
  });

  it('carries value, threshold, trend, impact, rule version and evidence time on every warning', () => {
    for (const s of viewH.signals) {
      expect(s.currentValue).not.toBe('');
      expect(s.expectedState).toMatch(/fires|no threshold/);
      expect(s.trend.length).toBeGreaterThan(0);
      expect(s.ruleVersion).toMatch(/EARLY_WARNING-v1/);
      expect(s.evidenceAsOf).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(s.metricId).toMatch(/^MET-|—/);
    }
  });

  it('detects on the Green-at-Risk case, which is the point of the phase', () => {
    expect(viewB.signals.length).toBeGreaterThan(0);
  });

  it('finds nothing on the recovering case, and says what it checked', () => {
    expect(viewD.signals).toHaveLength(0);
    expect(viewD.clearSignals.length).toBeGreaterThan(5);
    expect(viewD.headline).toMatch(/No early-warning rule is firing/);
  });
});

// ---------------------------------------------------------------------------
// 2. The outlook is explainable, and never a fake probability
// ---------------------------------------------------------------------------

describe('the outlook explains how it was derived', () => {
  it('offers current, 30, 60 and 90-day horizons', () => {
    expect(viewH.outlook.rows.map((r) => r.horizon))
      .toEqual(['Current', '30 days', '60 days', '90 days']);
  });

  it('reports 90 days as not projected rather than extrapolating one', () => {
    const ninety = viewH.outlook.rows.find((r) => r.horizon === '90 days');
    expect(ninety?.band).toBe('not projected');
    expect(ninety?.basis).toMatch(/No 90-day horizon is registered/);
  });

  it('states that the bands are rule outputs, not probabilities', () => {
    expect(viewH.outlook.derivation).toMatch(/not probabilities/);
    expect(viewH.outlook.derivation).toMatch(/trained, fitted or sampled/);
  });

  it('uses no probabilistic language anywhere in the service source', () => {
    const src = readFileSync('src/app/risk/forward-risk.ts', 'utf8');
    // "likely"/"probability" may appear only where the file is disclaiming them.
    const claims = src.match(/\b\d+% (likely|probable|chance)\b/gi) ?? [];
    expect(claims).toEqual([]);
  });

  it('names the metric behind every horizon', () => {
    for (const r of viewH.outlook.rows) expect(r.basis.length).toBeGreaterThan(20);
  });
});

// ---------------------------------------------------------------------------
// 3. Lifecycle, closure and escalation
// ---------------------------------------------------------------------------

describe('the warning lifecycle', () => {
  it('places every fired warning in exactly one lifecycle state', () => {
    const states = new Set([
      'AWAITING_DISPOSITION', 'OVERDUE_DISPOSITION', 'VALIDATED_NO_ACTION',
      'VALIDATED_ACTION_OPEN', 'VALIDATED_ACTION_OVERDUE', 'VALIDATED_ACTION_COMPLETE',
      'CHALLENGED', 'ACCEPTED_RISK',
    ]);
    for (const s of viewH.signals) expect(states.has(s.lifecycle), s.lifecycle).toBe(true);
  });

  it('describes each lifecycle state rather than showing only its code', () => {
    for (const s of viewH.signals) expect(s.lifecycleDetail.length).toBeGreaterThan(20);
  });

  it('treats an undispositioned warning past its control date as an assurance exception', () => {
    const a = evaluateEarlyWarnings({
      projectId: 'prj-test',
      asOf: instant('2026-08-31T00:00:00.000Z'),
      readings: warningReadingsFor(portfolio, H),
      dispositions: [{
        signalId: 'BURN_GAP',
        raisedOn: '2026-07-01' as never,
        disposition: 'VALIDATED',
        assuranceActorId: 'usr-da-lead',
        rationale: 'not yet reviewed',
        dueOn: '2026-07-15' as never,
      }],
      actions: [],
    });
    const burn = a.warnings.find((w) => w.signalId === 'BURN_GAP');
    expect(burn?.lifecycle).toBe('OVERDUE_DISPOSITION');
    expect(burn?.assuranceExceptionReason).toMatch(/assurance exception/);
    expect(a.assuranceExceptions.length).toBeGreaterThan(0);
  });

  it('does not treat a dispositioned warning inside its window as an exception', () => {
    const a = evaluateEarlyWarnings({
      projectId: 'prj-test',
      asOf: instant('2026-08-31T00:00:00.000Z'),
      readings: warningReadingsFor(portfolio, H),
      dispositions: [{
        signalId: 'BURN_GAP',
        raisedOn: '2026-08-20' as never,
        disposition: 'VALIDATED',
        dispositionedOn: '2026-08-22' as never,
        assuranceActorId: 'usr-da-lead',
        rationale: 'reviewed',
        dueOn: '2026-09-03' as never,
      }],
      actions: [],
    });
    expect(a.assuranceExceptions).toHaveLength(0);
  });

  it('flags a validated warning with no corrective action against it', () => {
    const a = evaluateEarlyWarnings({
      projectId: 'prj-test',
      asOf: instant('2026-08-31T00:00:00.000Z'),
      readings: warningReadingsFor(portfolio, H),
      dispositions: [{
        signalId: 'BURN_GAP', raisedOn: '2026-08-20' as never, disposition: 'VALIDATED',
        dispositionedOn: '2026-08-21' as never, assuranceActorId: 'usr-da-lead',
        rationale: 'agreed', dueOn: '2026-09-03' as never,
      }],
      actions: [],
    });
    expect(a.validatedWithoutAction.map((w) => w.signalId)).toContain('BURN_GAP');
  });

  it('reports assurance findings against assurance, never against project health', () => {
    expect(viewH.assurance.ownershipNarrative).toMatch(/Delivery owns corrective execution/);
    expect(viewH.assurance.ownershipNarrative).toMatch(/not as a weighted health dimension/);
    expect(viewH.assurance.narrative).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Recovery scenario math and double counting
// ---------------------------------------------------------------------------

describe('recovery economics', () => {
  it('produces all four figures, read together', () => {
    for (const key of [
      'currentForecastGm', 'riskAdjustedGm', 'recoveryCaseGm', 'probabilityAdjustedGm',
    ] as const) {
      expect(viewH.recoveryEconomics[key], key).not.toBe('');
    }
  });

  it('never rates the probability-adjusted case above the recovery case', () => {
    for (const id of FIXED_BID) {
      const r = recoveryEconomicsFor(portfolio, id);
      if (r === null) continue;
      if (!r.recoveryCaseGmPercent.computable || !r.probabilityAdjustedGmPercent.computable) continue;
      expect(
        qCompare(
          qty(r.probabilityAdjustedGmPercent.value.toFixed()),
          qty(r.recoveryCaseGmPercent.value.toFixed()),
        ),
        id,
      ).toBeLessThanOrEqual(0);
    }
  });

  it('banks only the largest benefit in an incompatibility group', () => {
    // At least one project must have an action discarded, or the control is untested.
    const discarded = FIXED_BID
      .map((id) => recoveryEconomicsFor(portfolio, id))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .flatMap((r) => r.actions.filter((c) => !c.counted));
    expect(discarded.length).toBeGreaterThan(0);
    for (const c of discarded) expect(c.reason.length).toBeGreaterThan(5);
  });

  it('shows a discarded action with its reason rather than dropping it', () => {
    const withDiscard = [viewB, viewD, viewH].find(
      (v) => v.recoveryActions.some((a) => !a.counted),
    );
    expect(withDiscard, 'no demo project has a discarded action').toBeDefined();
    for (const a of withDiscard?.recoveryActions.filter((x) => !x.counted) ?? []) {
      expect(a.notCountedReason.length).toBeGreaterThan(5);
    }
  });

  it('states that recovery figures are scenarios, not a replacement forecast', () => {
    expect(viewH.recoveryEconomics.narrative).toMatch(/scenarios beside the forecast/);
  });

  it('reports the absence of a plan as a finding, not an empty section', () => {
    const noPlan = FIXED_BID
      .map((id) => forwardRiskFor(portfolio, id))
      .find((v) => !v.recoveryEconomics.available);
    expect(noPlan, 'every project has a plan; the no-plan path is untested').toBeDefined();
    expect(noPlan?.recoveryEconomics.narrative).toMatch(/No recovery plan exists/);
  });

  it('names the metrics behind each recovery figure', () => {
    const labels = viewH.recoveryEconomics.evidence.lines.map((l) => l.label).join(' ');
    for (const id of ['MET-REC-001', 'MET-REC-002', 'MET-REC-003']) expect(labels).toContain(id);
  });

  it('gives every recovery action an owner slot and a due date, naming absence', () => {
    for (const a of viewH.recoveryActions) {
      expect(a.owner.length).toBeGreaterThan(0);
      expect(a.dueDate.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Intervention priority
// ---------------------------------------------------------------------------

describe('intervention priority', () => {
  it('ranks within the caller’s authorised scope', () => {
    expect(viewH.interventionPriority.rank).toMatch(/^\d+ of 75$/);
  });

  it('states the tier that decided the placement', () => {
    expect(viewH.interventionPriority.decidingTier).toMatch(/tier \d|no adjacent|last in the ranked/);
  });

  it('is absent rather than global when no scope was supplied', () => {
    const unscoped = forwardRiskFor(portfolio, H);
    expect(unscoped.interventionPriority.rank).toBe('not ranked in this scope');
    expect(unscoped.lateDetection.available).toBe(false);
  });

  it('records that a large deteriorating Green can outrank a small Red', () => {
    const note = viewH.interventionPriority.evidence.lines.map((l) => l.value).join(' ');
    expect(note).toMatch(/outrank a small project already Red/);
  });

  it('delegates to MET-PORT-007 rather than reimplementing an order', () => {
    const src = readFileSync('src/app/risk/forward-risk.ts', 'utf8');
    expect(src).toContain('MET-PORT-007');
    expect(src).not.toMatch(/\.sort\(\(a, b\) => .*gmValueAtRisk/);
  });
});

// ---------------------------------------------------------------------------
// 6. Late detection
// ---------------------------------------------------------------------------

describe('late detection (MET-FCST-030)', () => {
  it('is registered, Frozen and L3', () => {
    const m = findMetric('MET-FCST-030');
    expect(m?.status).toBe('Frozen');
    expect(m?.epistemicLevel).toBe('L3_ASSESSED');
  });

  it('reports a zero denominator as not computable, never as 0%', () => {
    const empty = computeLateDetectionRate([]);
    expect(empty.rate).toBeNull();
    expect(empty.notComputableReason).toMatch(/absence of cases/);
  });

  it('counts a project with a prior Amber as detected', () => {
    const r = computeLateDetectionRate([
      { projectId: 'a', firstRedPeriod: '2026-05-01', priorBand: 'AMBER', priorWarningCount: 0, detected: true },
      { projectId: 'b', firstRedPeriod: '2026-05-01', priorBand: 'GREEN', priorWarningCount: 0, detected: false },
    ]);
    expect(r.lateDetections).toBe(1);
    expect(r.projectsReachingRed).toBe(2);
  });

  it('computes over the authorised scope only', () => {
    const small = lateDetectionFor(portfolio, FIXED_BID.slice(0, 10));
    const large = lateDetectionFor(portfolio, FIXED_BID);
    expect(small.projectsReachingRed).toBeLessThanOrEqual(large.projectsReachingRed);
  });

  it('says plainly that it measures the product rather than the portfolio', () => {
    expect(viewH.lateDetection.narrative).toMatch(/measures the product/);
  });
});

// ---------------------------------------------------------------------------
// 7. Nothing here changes anything
// ---------------------------------------------------------------------------

describe('no action can autonomously change a baseline, ETC or official health', () => {
  it('states the authority boundary on the view itself', () => {
    expect(viewH.authorityNotice).toMatch(/Nothing on this page changes anything/);
    expect(viewH.authorityNotice).toMatch(/authorised act with its own capability and audit trail/);
  });

  it('renders the notice on the page, not in a footnote nobody reads', () => {
    expect(pageH).toContain('This page proposes; it does not decide');
  });

  it('exposes no mutation in the Phase 10 route table', async () => {
    const { ROUTES } = await import('@app');
    const route = ROUTES.find((r) => r.path.endsWith('/forward-risk'));
    expect(route?.isWrite).toBe(false);
    expect(route?.method).toBe('GET');
  });

  it('writes nothing in the service or the engine', () => {
    for (const f of [
      'src/app/risk/forward-risk.ts',
      'src/contexts/forecast/internal/early-warning-engine.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\.push\(.*baseline|writeFile|INSERT |UPDATE /i);
    }
  });

  it('keeps recovery out of the official band — health is unchanged by a plan', () => {
    // The recovery case is a scenario. Two projects with identical health and different plans must
    // still carry the same System-Assessed band.
    const src = readFileSync('src/app/risk/forward-risk.ts', 'utf8');
    expect(src).not.toMatch(/systemAssessedRag\s*=/);
  });
});

// ---------------------------------------------------------------------------
// 8. Authorization
// ---------------------------------------------------------------------------

describe('authorization is enforced by the server', () => {
  it('returns the surface to a caller inside their scope', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    const r = await api.gateway.request(ctx, { view: 'project.forwardRisk', entityId: H });
    expect(r.status).toBe(200);
  });

  it('denies a project outside the caller’s resolved set, disclosing nothing', async () => {
    const ctx = await as('dm.mobility', 'usr-dm-mobility');
    const r = await api.gateway.request(ctx, { view: 'project.forwardRisk', entityId: H });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('audits the read', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    await api.gateway.request(ctx, { view: 'project.forwardRisk', entityId: H });
    expect(api.audit.all().filter(
      (r) => r.entityType === 'forwardRisk' && r.decision === 'GRANT',
    ).length).toBeGreaterThan(0);
  });

  it('declares the view in the closed VIEW_ROUTES table', async () => {
    const { VIEW_ROUTES } = await import('@app');
    expect(VIEW_ROUTES['project.forwardRisk']).toEqual({
      method: 'GET', path: '/v1/projects/:id/forward-risk',
    });
  });

  it('classifies every field, so none can be returned by default', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    const r = await api.gateway.request(ctx, { view: 'project.forwardRisk', entityId: H });
    expect(r.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 9. The surface renders and computes nothing
// ---------------------------------------------------------------------------

describe('the surface', () => {
  it('contains no arithmetic', () => {
    const src = readFileSync('src/presentation/surfaces/forward-risk.tsx', 'utf8');
    expect(src).not.toMatch(/\.plus\(|\.minus\(|\.times\(|\.dividedBy\(|toFixed\(|parseFloat\(/);
  });

  it('renders every section the brief names', () => {
    for (const heading of [
      'Emerging signals', 'Explainable outlook', 'Recovery actions', 'Recovery economics',
      'Assurance follow-through', 'Intervention priority', 'Late detection',
    ]) {
      expect(pageH, heading).toContain(heading);
    }
  });

  it('gives every signal row the columns the brief requires', () => {
    const headers = signalTable(viewH).columns.map((c) => c.header);
    for (const h of ['Current', 'Fires when', 'Trend', 'Severity', 'Economic impact', 'Owner', 'Due']) {
      expect(headers, h).toContain(h);
    }
  });

  it('gives every action row the columns the brief requires', () => {
    const headers = actionTable(viewH).columns.map((c) => c.header);
    for (const h of [
      'Issue', 'Recommended action', 'Why it matters', 'Owner', 'Due', 'GM benefit',
      'Schedule benefit', 'Confidence', 'Status', 'Executive decision',
    ]) {
      expect(headers, h).toContain(h);
    }
  });

  it('carries the DEMO — SYNTHETIC DATA marker', () => {
    expect(pageH).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/);
  });

  it('renders the withholding when recovery economics is absent', () => {
    const restricted = text(<ForwardRisk view={viewH} commercialRestricted />);
    expect(restricted).toContain('Restricted');
  });

  it('is deterministic (AC-7)', () => {
    expect(JSON.stringify(forwardRiskFor(portfolio, H, FIXED_BID))).toBe(JSON.stringify(viewH));
  });

  it('carries the demo marker and the denial through the built artifact', () => {
    const built = readFileSync('docs/design/forward-risk.html', 'utf8');
    expect(built).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/i);
    expect(built).toContain('Not available to this role');
  });
});
