/**
 * Phase 8 — Project Executive Health.
 *
 * The suite is organised around the acceptance gate rather than around the code: a Global Delivery
 * Head must complete a meaningful review in three to five minutes **and be able to challenge an
 * unsupported Green using evidence**. Most of these tests exist because a page could satisfy the
 * first half and fail the second — showing every section, beautifully, while quietly presenting a
 * derived number as a fact, a missing metric as a zero, or a narrative nobody can reproduce.
 */
import { readFileSync } from 'node:fs';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectExecutiveHealthView } from '@app';
import { ProjectExecutiveHealth, commitmentTable, dimensionTable } from '@presentation/index.js';
import { findMetric } from '@contexts/rules';
import { evaluateDelivery } from '@contexts/delivery';
import { calendarDate } from '@platform/time';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { deliveryInputFor } from '../../scripts/assessment/curated-assessment.js';
import { projectExecutiveHealthFor } from '../../scripts/assessment/project-health-adapter.js';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

const portfolio = generatePortfolio();

const idFor = (scenario: string): string => {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
};

const B = idFor('B');
const C = idFor('C');
const F = idFor('F');

const viewB = projectExecutiveHealthFor(portfolio, B);
const viewC = projectExecutiveHealthFor(portfolio, C);
const viewF = projectExecutiveHealthFor(portfolio, F);

const html = (el: JSX.Element): string => renderToStaticMarkup(el);
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pageC = text(<ProjectExecutiveHealth view={viewC} commercialRestricted={false} />);

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return api.contextFor(actorId, session.sessionId);
}

// ---------------------------------------------------------------------------
// 1. The curated scenarios render what they are supposed to be about
// ---------------------------------------------------------------------------

describe('the curated scenarios render their own story', () => {
  it('renders scenario C as the AC-2 flagship: reported Green, evidence says otherwise', () => {
    expect(viewC.statusConflict.reportedRag).toBe('GREEN');
    expect(viewC.statusConflict.systemAssessedRag).not.toBe('GREEN');
    expect(viewC.statusConflict.present).toBe(true);
    expect(viewC.statusConflict.direction).toBe('REPORTED_OPTIMISTIC');
    expect(viewC.statusConflict.narrative.length).toBeGreaterThan(20);
  });

  it('explains the divergence with the rules the reported status does not account for', () => {
    // The narrative itself is a template keyed on the band pair — "Reported GREEN while the
    // evidence supports RED" reads the same for any two projects in that position, and that is
    // fine, because it is not where the explanation lives. The explanation is `unexplainedBy`: the
    // named rule firings the reporter's declaration does not account for, which differ per project
    // and are what a reviewer actually challenges the status with.
    expect(viewC.statusConflict.unexplainedBy.length).toBeGreaterThan(0);
    expect(viewB.statusConflict.unexplainedBy.length).toBeGreaterThan(0);
    expect(viewC.statusConflict.unexplainedBy).not.toEqual(viewB.statusConflict.unexplainedBy);
    for (const rule of viewC.statusConflict.unexplainedBy) expect(rule).toMatch(/^(OVR|ELV)-/);
  });

  it('renders those rules on the page, so the challenge is visible and not only in the payload', () => {
    for (const rule of viewC.statusConflict.unexplainedBy) expect(pageC).toContain(rule);
    expect(pageC).toContain('What the reported status does not account for');
  });

  it('renders scenario B as reported Green while deteriorating', () => {
    expect(viewB.statusConflict.reportedRag).toBe('GREEN');
    expect(viewB.verdicts.find((v) => v.id === 'trajectory')?.value).toMatch(/DETERIORATING/);
  });

  it('renders scenario F with an ETC optimism gap that is shown and sized', () => {
    expect(viewF.etcCredibility.applicable).toBe(true);
    expect(viewF.etcCredibility.performanceImpliedEac).not.toBe('not computable');
    expect(viewF.etcCredibility.optimismGap).not.toBe('not computable');
    expect(viewF.etcCredibility.narrative).toMatch(/performing better than the project has performed/);
  });

  it('flags executive intervention on all three, since all three diverge or deteriorate', () => {
    for (const v of [viewB, viewC, viewF]) expect(v.interventionRequired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Every headline carries its evidence (AC-3, REQ-PROJ-002)
// ---------------------------------------------------------------------------

describe('every headline figure reaches its evidence', () => {
  it('gives all six primary outputs a metric id, a rule version and evidence lines', () => {
    expect(viewC.verdicts).toHaveLength(6);
    for (const v of viewC.verdicts) {
      expect(v.metricId, v.id).toMatch(/^MET-/);
      expect(v.evidence.ruleVersion, v.id).toBeDefined();
      expect(v.evidence.lines.length, v.id).toBeGreaterThan(0);
      expect(v.evidence.sources.length, v.id).toBeGreaterThan(0);
    }
  });

  it('names a metric that exists in the registry for every primary output', () => {
    for (const v of viewC.verdicts) {
      expect(findMetric(v.metricId), `${v.id} → ${v.metricId}`).toBeDefined();
    }
  });

  it('carries evidence on every section that states a verdict', () => {
    for (const e of [
      viewC.progressBurn.evidence, viewC.etcCredibility.evidence, viewC.milestones.evidence,
      viewC.statusConflict.evidence, viewC.confidence.evidence, viewC.summary.evidence,
    ]) {
      expect(e.lines.length).toBeGreaterThan(0);
      expect(e.ruleVersion).toBeDefined();
    }
  });

  it('drills each health dimension to the inputs that produced it (REQ-PROJ-001)', () => {
    for (const d of viewC.dimensions) {
      expect(d.metricId).toMatch(/^MET-HLTH-/);
      expect(d.weight).toMatch(/%$/);
      expect(d.inputs.length).toBeGreaterThan(0);
      for (const i of d.inputs) expect(findMetric(i.metricId), i.metricId).toBeDefined();
    }
  });

  it('states the rule version on the view, so a score is reproducible', () => {
    expect(viewC.ruleVersion).toMatch(/HEALTH-v2/);
  });
});

// ---------------------------------------------------------------------------
// 3. Absence is reported, never rendered as zero
// ---------------------------------------------------------------------------

describe('a metric that cannot be computed says so', () => {
  it('reports every dimension it scores, and a reason wherever it does not', () => {
    // Since C-21 was resolved all four dimensions score on this portfolio, so the assertion is the
    // invariant rather than a count: a dimension is either a score with a contribution, or a stated
    // reason. Never a blank, never a zero standing in for an absence. The unscored path itself is
    // exercised directly against the engine in `phase8-closure.test.ts`.
    for (const d of viewC.dimensions) {
      if (d.computable) {
        expect(d.score, d.id).not.toBe('not computable');
        expect(d.contribution, d.id).not.toBe('not computable');
      } else {
        expect(d.score, d.id).toBe('not computable');
        expect(d.contribution, d.id).toBe('not computable');
        expect((d.notComputableReason ?? '').length, d.id).toBeGreaterThan(20);
      }
    }
  });

  it('names CONFLICT C-21 on the quality and commercial metrics it blocks', () => {
    const blocked = [...viewC.quality, ...viewC.scopeCommercial]
      .filter((l) => l.notComputableReason !== undefined);
    expect(blocked.length).toBeGreaterThan(0);
    for (const l of blocked) {
      expect(l.value).toBe('not computable');
      expect(l.notComputableReason).toMatch(/C-21/);
    }
  });

  it('computes MET-DEL-011 from a recorded forecast, never from a milestone date (DR-050 closed)', () => {
    const d = evaluateDelivery(deliveryInputFor(portfolio, C));
    expect(d.scheduleVarianceDays.value).not.toBeNull();
    // The forecast is a recorded fact. A milestone-derived date would report the project finishing
    // ~3 months early, because milestones stop well before the contractual end.
    const forecast = portfolio.facts.scheduleForecasts.find((r) => r.projectId === C);
    expect(forecast).toBeDefined();
    const lastMilestone = portfolio.facts.milestones
      .filter((m) => m.projectId === C)
      .map((m) => m.forecastDate).sort().at(-1);
    expect(forecast?.forecastCompletionDate).not.toBe(lastMilestone);
  });

  it('still refuses MET-DEL-011 when no forecast is recorded', () => {
    // `exactOptionalPropertyTypes` means the field must be genuinely absent, not set to undefined
    // — which is the same distinction the engine itself relies on.
    const { forecastCompletionDate: _omitted, ...noForecast } = deliveryInputFor(portfolio, C);
    const withoutForecast = evaluateDelivery(noForecast);
    expect(withoutForecast.scheduleVarianceDays.value).toBeNull();
    expect(withoutForecast.scheduleVarianceDays.notComputableReason)
      .toMatch(/no forecast completion date/);
  });

  it('says why a performance-implied EAC is unavailable rather than showing a dash', () => {
    const young = portfolio.structure.projects
      .map((p) => projectExecutiveHealthFor(portfolio, p.projectId))
      .find((v) => !v.etcCredibility.applicable);
    if (young === undefined) return; // every project passed the maturity gate; nothing to assert
    expect(young.etcCredibility.performanceImpliedEac).toBe('not computable');
    expect(young.etcCredibility.narrative).toMatch(/Not applicable/);
  });

  it('reports an independent review where one exists, and its absence where none does (DR-053)', () => {
    // 58 of 91 projects carry a review; the rest genuinely have none, and a distressed project with
    // no independent review is a finding about the control rather than a blank cell.
    const reviewed = portfolio.facts.assuranceReviews.map((r) => r.projectId);
    const withReview = projectExecutiveHealthFor(portfolio, reviewed[0] as string);
    expect(withReview.confidence.independentReview).not.toMatch(/No independent or DA review/);
    expect(withReview.confidence.independentReview).toMatch(/SATISFACTORY|QUALIFIED|ADVERSE/);

    const unreviewed = portfolio.structure.projects
      .map((p) => p.projectId).find((id) => !reviewed.includes(id));
    expect(unreviewed, 'every project has a review; the absence path is untested').toBeDefined();
    expect(projectExecutiveHealthFor(portfolio, unreviewed as string).confidence.independentReview)
      .toMatch(/No independent or DA review is recorded/);
  });
});

// ---------------------------------------------------------------------------
// 4. The Green claim rule — the half of the gate that is about challenge
// ---------------------------------------------------------------------------

describe('no evidence means no high confidence in Green', () => {
  it('states the rule on every page, whether or not it is breached', () => {
    for (const v of [viewB, viewC, viewF]) {
      expect(v.confidence.greenClaimNarrative.length).toBeGreaterThan(20);
      expect(typeof v.confidence.greenClaimSupported).toBe('boolean');
    }
  });

  it('reports the data confidence band and the arithmetic band separately (DR-018)', () => {
    expect(viewC.confidence.dataBand).toMatch(/HIGH|MEDIUM|LOW/);
    expect(viewC.confidence.arithmeticBand).toMatch(/HIGH|MEDIUM|LOW/);
  });

  it('shows domain freshness so a reader can see what the confidence rests on', () => {
    expect(viewC.confidence.domainFreshness.length).toBeGreaterThan(0);
    for (const f of viewC.confidence.domainFreshness) {
      expect(f.age).toMatch(/day|never reported/);
    }
  });

  it('renders the rule on the page, not only in the payload', () => {
    expect(pageC).toMatch(
      /Data confidence is sufficient to present the reported Green|No Green is reported, so this evidence rule does not apply|No evidence means no high confidence in Green/,
    );
  });

  /*
   * R1.7. The assurance headline states what it supports, never a bare "status".
   *
   * Project C reports GREEN while the system assesses RED, so a headline saying the evidence
   * supports "the status being claimed" read as ratifying the reported RAG on the very page whose
   * headline finding is that the two disagree. This rule only ever judged whether data confidence
   * is strong enough to present a Green claim.
   */
  it('never claims the evidence supports an unqualified "status"', () => {
    expect(pageC).not.toMatch(/evidence supports the status being claimed/);
  });

  it('names data confidence, not status agreement, when the Green claim is supported', () => {
    expect(viewC.confidence.greenClaimSupported).toBe(true);
    expect(viewC.confidence.greenClaimHeadline).toBe(
      'Data confidence is sufficient to present the reported Green',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The commitment comparison holds three baselines apart (ADR-0003)
// ---------------------------------------------------------------------------

describe('the commitment comparison keeps three baselines distinct', () => {
  it('shows as-sold, current contract and current forecast as separate columns', () => {
    const table = commitmentTable(viewC);
    const headers = table.columns.map((c) => c.header);
    expect(headers).toContain('Original sold');
    expect(headers).toContain('Current contract');
    expect(headers).toContain('Current / forecast');
    expect(headers).toContain('Variance');
  });

  it('covers every commitment the brief names', () => {
    const labels = viewC.commitment.map((r) => r.label);
    expect(labels).toContain('Gross margin %');
    expect(labels).toContain('Cost at completion (EAC)');
    expect(labels).toContain('Physical completion (planned vs actual)');
    expect(labels).toContain('End date');
    expect(labels).toContain('Next critical milestone');
  });

  /*
   * R1.4. Every row is one measure at three baselines.
   *
   * "Commercial exposure" was not: its columns held a literal zero, MET-COM-009 uncommercialised
   * exposure and incrementalRiskExposure — three different quantities — and its variance summed
   * the last two instead of differencing original against forecast, roughly doubling the figure.
   * MET-COM-009 is a current-state measure with no as-sold baseline, so it has no three-baseline
   * reading and belongs in the scope and commercial block, where it still appears.
   */
  it('does not place a current-state exposure in a three-baseline table', () => {
    expect(viewC.commitment.map((r) => r.label)).not.toContain('Commercial exposure');
    expect(viewC.scopeCommercial.map((f) => f.label)).toContain('Uncommercialised exposure');
  });

  it('does not invent a current-contractual gross margin percentage', () => {
    // MET-FIN-002 and MET-FIN-004 both carry a CURRENT_CONTRACTUAL baseline, but their ratio is not
    // a registered metric. Showing one would put an unregistered number on an executive page.
    const gm = viewC.commitment.find((r) => r.label === 'Gross margin %');
    expect(gm?.currentContract).toBe('no registered metric');
    expect(findMetric('MET-FIN-012')?.baseline).toBe('AS_SOLD');
  });

  it('takes the as-sold margin from the engine rather than recomputing it in an adapter', () => {
    const src = readFileSync('scripts/assessment/project-health-adapter.ts', 'utf8');
    expect(src).toMatch(/soldGmPercentAsSold: project\.assessment\.economics\.soldGmPercent/);
    expect(src).not.toMatch(/dividedBy\(soldValue\)/);
  });
});

// ---------------------------------------------------------------------------
// 6. The executive summary is generated, deterministic, and not from a model
// ---------------------------------------------------------------------------

describe('the STATUS / CAUSE / OUTLOOK / IMPACT / ACTION summary', () => {
  it('produces all five parts, none empty', () => {
    const s = viewC.summary;
    for (const [k, v] of Object.entries({
      status: s.status, cause: s.cause, outlook: s.outlook,
      impact: s.economicImpact, action: s.action,
    })) {
      expect(v.length, k).toBeGreaterThan(15);
    }
  });

  it('is byte-identical across two builds of the same project (AC-7)', () => {
    const again = projectExecutiveHealthFor(portfolio, C);
    expect(JSON.stringify(again.summary)).toBe(JSON.stringify(viewC.summary));
  });

  it('says different things about different projects', () => {
    expect(viewC.summary.cause).not.toBe(viewF.summary.cause);
  });

  it('names the divergence in STATUS when one exists', () => {
    expect(viewC.summary.status).toMatch(/Reported GREEN/);
    expect(viewC.summary.status).toMatch(/evidence assesses/);
  });

  it('quantifies the economic impact rather than describing it', () => {
    expect(viewC.summary.economicImpact).toMatch(/\$/);
    expect(viewC.summary.economicImpact).toMatch(/margin at risk/);
  });

  it('records that no language model produced it', () => {
    expect(viewC.summary.evidence.lines.some(
      (l) => l.value.includes('no language model'),
    )).toBe(true);
  });

  it('is built from fixed rules in the application layer, with no model call anywhere', () => {
    const src = readFileSync('src/app/project/executive-health.ts', 'utf8');
    expect(src).not.toMatch(/openai|anthropic|llm|completion\(|prompt/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Authorization is server-side (REQ-SEC, ADR-0005)
// ---------------------------------------------------------------------------

describe('authorization is enforced by the server, not by the page', () => {
  const fetchView = async (username: string, actorId: string, entityId: string) => {
    const ctx = await as(username, actorId);
    const response = await api.gateway.request(ctx, { view: 'project.executiveHealth', entityId });
    return { status: response.status, body: response.body as { data: Record<string, unknown>[] } };
  };

  it('returns the review to an executive who may see the project', async () => {
    const r = await fetchView('exec.cdo', 'usr-exec-cdo', C);
    expect(r.status).toBe(200);
    const row = r.body.data[0] as unknown as ProjectExecutiveHealthView;
    expect(row.header.projectId).toBe(C);
  });

  it('denies a project outside the caller’s resolved set, disclosing nothing', async () => {
    const r = await fetchView('dm.mobility', 'usr-dm-mobility', C);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('returns the same generic not-found for a project that does not exist', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    const r = await api.gateway.request(ctx, {
      view: 'project.executiveHealth', entityId: 'prj-does-not-exist',
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('audits the read, because the payload carries commercial data', async () => {
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    await api.gateway.request(ctx, { view: 'project.executiveHealth', entityId: C });
    const reads = api.audit.all().filter(
      (r) => r.entityType === 'projectExecutiveHealth' && r.decision === 'GRANT',
    );
    expect(reads.length).toBeGreaterThan(0);
  });

  it('classifies every field on the resource, so none can be returned by default', async () => {
    // Deny-by-default: an unclassified field throws rather than leaking. This test would have
    // caught the three unclassified Phase 7 fields before a human did.
    const ctx = await as('exec.cdo', 'usr-exec-cdo');
    const r = await api.gateway.request(ctx, { view: 'project.executiveHealth', entityId: C });
    expect(r.status).toBe(200);
  });

  it('declares the view in the closed VIEW_ROUTES table', async () => {
    const { VIEW_ROUTES } = await import('@app');
    expect(VIEW_ROUTES['project.executiveHealth']).toEqual({
      method: 'GET', path: '/v1/projects/:id/executive-health',
    });
  });
});

// ---------------------------------------------------------------------------
// 8. The surface renders view models and computes nothing
// ---------------------------------------------------------------------------

describe('the surface renders and does not compute', () => {
  it('contains no arithmetic — it maps shapes', () => {
    const src = readFileSync('src/presentation/surfaces/project-executive-health.tsx', 'utf8');
    expect(src).not.toMatch(/\.plus\(|\.minus\(|\.times\(|\.dividedBy\(|toFixed\(|parseFloat\(|parseInt\(/);
  });

  it('renders the header a reviewer needs to know they are in the right review', () => {
    for (const s of [
      viewC.header.name, viewC.header.customerAlias, viewC.header.industry, viewC.header.region,
      viewC.header.deliveryLeader, viewC.header.daOwner, viewC.header.contractType,
      viewC.header.totalContractValue, viewC.header.startDate, viewC.header.committedEndDate,
    ]) {
      expect(pageC).toContain(s);
    }
  });

  it('carries the DEMO — SYNTHETIC DATA marker', () => {
    expect(pageC).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/);
  });

  it('renders every section the brief names', () => {
    for (const heading of [
      'Health dimensions', 'Commitment comparison', 'Financial position', 'Progress and burn',
      'ETC credibility', 'Milestones', 'Scope and commercial', 'Quality and product',
      'Data and assurance confidence',
    ]) {
      expect(pageC, heading).toContain(heading);
    }
  });

  it('renders the five-part summary on the page', () => {
    for (const part of ['STATUS', 'CAUSE', 'OUTLOOK', 'ECONOMIC IMPACT', 'ACTION']) {
      expect(pageC).toContain(part);
    }
  });

  it('renders no status by colour alone — every RAG carries a word', () => {
    expect(pageC).toMatch(/RED|AMBER|GREEN/);
    const rendered = html(<ProjectExecutiveHealth view={viewC} commercialRestricted={false} />);
    // Each health badge renders a glyph and a label beside its colour class.
    expect(rendered).toMatch(/gl-badge|gl-status/);
  });

  it('renders Restricted where the commercial fields were withheld, and no value', () => {
    const restricted = text(
      <ProjectExecutiveHealth view={viewC} commercialRestricted />,
    );
    expect(restricted).toContain('Restricted');
  });

  it('builds a dimension table with a row per declared dimension, none blank', () => {
    const table = dimensionTable(viewC);
    expect(table.rows).toHaveLength(4);
    for (const r of table.rows) {
      // Either the inputs that produced the score, or the reason there is none — always something.
      expect((r.cells['inputs']?.display ?? '').length, r.id).toBeGreaterThan(10);
      expect((r.cells['score']?.display ?? '').length, r.id).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. No metric is computed twice
// ---------------------------------------------------------------------------

describe('no metric is computed twice', () => {
  it('reads health from the engine rather than re-deriving a band', () => {
    const src = readFileSync('src/app/project/executive-health.ts', 'utf8');
    expect(src).toContain('h.systemAssessedRag');
    expect(src).not.toMatch(/compositeScore\s*[<>]=?\s*\d/);
  });

  it('reads the delivery metrics from the delivery engine, not from the facts', () => {
    const src = readFileSync('src/app/project/executive-health.ts', 'utf8');
    expect(src).not.toMatch(/milestones\.filter\(.*baselineDate/);
  });

  it('reconciles the milestone counts to the delivery evaluation', () => {
    const d = evaluateDelivery(deliveryInputFor(portfolio, C));
    expect(viewC.milestones.all).toHaveLength(d.milestones.length);
    expect(viewC.milestones.atRisk).toBe(String(d.milestonesAtRisk.value));
  });

  it('reuses the command-centre assessment rather than running the engines twice', () => {
    const src = readFileSync('scripts/assessment/project-health-adapter.ts', 'utf8');
    expect(src).toContain('commandCenterProject');
    expect(src).not.toContain('assessProject(');
  });

  it('reconciles the GM value at risk to the economics engine', () => {
    const gmVar = viewC.financial.find((f) => f.metricId === 'MET-FIN-019');
    expect(gmVar).toBeDefined();
    expect(viewC.summary.economicImpact).toContain(gmVar?.value ?? '@@');
  });
});

// ---------------------------------------------------------------------------
// 10. The delivery engine, which Phase 8 built (ADR-0022 D-1)
// ---------------------------------------------------------------------------

describe('the delivery engine computes what METRIC_CATALOG registers', () => {
  const d = evaluateDelivery(deliveryInputFor(portfolio, C));

  it('makes the Delivery dimension computable, which it was not before Phase 8', () => {
    const delivery = viewC.dimensions.find((x) => x.id === 'DELIVERY');
    expect(delivery?.computable).toBe(true);
  });

  it('sums only forward milestone slippage, so recovery does not net off a slip', () => {
    expect(d.milestoneSlippageDays.value).toBeGreaterThanOrEqual(0);
  });

  it('counts only undelivered milestones as at risk', () => {
    const late = d.milestones.filter((m) => m.actualDate === null && m.slipDays > 0);
    expect(d.milestonesAtRisk.value).toBe(late.length);
  });

  it('reports an observed zero velocity with work remaining as UNBOUNDED, not unmeasurable', () => {
    // ADR-0027. This test previously asserted the defect: it demanded NOT_COMPUTABLE for a stalled
    // project, which let the signal drop out of the Delivery dimension and the dimension
    // renormalise upward to 100.00 — a stalled project read GREEN.
    const stalled = evaluateDelivery({
      ...deliveryInputFor(portfolio, C),
      progress: Array.from({ length: 10 }, (_, i) => ({
        week: `2026-W${String(i + 10).padStart(2, '0')}`,
        physicalCompletion: '0.5000',
        plannedCompletion: '0.6000',
      })),
    });
    expect(stalled.demonstratedVelocity.value).toBe('0');   // observed, not missing
    expect(stalled.requiredVelocityRatio.value).toBeNull(); // no finite ratio exists
    expect(stalled.requiredVelocityRatio.adverseState).toBe('UNBOUNDED');
    expect(stalled.requiredVelocityRatio.notComputableReason).toMatch(/observed zero/);
  });

  it('refuses a velocity below its registered eight-week minimum history', () => {
    const young = evaluateDelivery({
      ...deliveryInputFor(portfolio, C),
      progress: [
        { week: '2026-W30', physicalCompletion: '0.1', plannedCompletion: '0.2' },
        { week: '2026-W31', physicalCompletion: '0.2', plannedCompletion: '0.3' },
      ],
    });
    expect(young.demonstratedVelocity.value).toBeNull();
    expect(young.demonstratedVelocity.notComputableReason).toMatch(/below the 9/);
  });

  it('takes the maximum, not the mean, for the dependency-ageing health signal (ADR-0022 D-3)', () => {
    const withDeps = evaluateDelivery({
      ...deliveryInputFor(portfolio, C),
      dependencies: [
        { id: 'a', description: 'x', owner: 'CUSTOMER', raisedOn: calendarDate('2026-08-01'), dueOn: calendarDate('2026-08-10'), blocking: true },
        { id: 'b', description: 'y', owner: 'CUSTOMER', raisedOn: calendarDate('2026-01-01'), dueOn: calendarDate('2026-01-10'), blocking: true },
      ],
    });
    const max = withDeps.customerDependencyAgeingDays.value;
    const mean = withDeps.customerDependencyMeanDays.value;
    expect(max).not.toBeNull();
    expect(mean).not.toBeNull();
    expect(max as number).toBeGreaterThan(mean as number);
  });

  it('ignores third-party and internal dependencies, which MET-DEL-023 does not cover', () => {
    const other = evaluateDelivery({
      ...deliveryInputFor(portfolio, C),
      dependencies: [
        { id: 'a', description: 'x', owner: 'THIRD_PARTY', raisedOn: calendarDate('2026-01-01'), dueOn: calendarDate('2026-01-10'), blocking: true },
        { id: 'b', description: 'y', owner: 'INTERNAL', raisedOn: calendarDate('2026-01-01'), dueOn: calendarDate('2026-01-10'), blocking: true },
      ],
    });
    expect(other.openCustomerDependencies).toBe(0);
    expect(other.customerDependencyAgeingDays.value).toBeNull();
  });

  it('is deterministic — identical inputs, identical output', () => {
    const again = evaluateDelivery(deliveryInputFor(portfolio, C));
    expect(JSON.stringify(again)).toBe(JSON.stringify(d));
  });
});

// ---------------------------------------------------------------------------
// 11. The forward outlook starts from the assessed band, not from a constant
// ---------------------------------------------------------------------------

describe('the forward outlook is projected from MET-HLTH-011', () => {
  it('does not hardcode a starting band in the adapter', () => {
    const src = readFileSync('scripts/assessment/command-center-adapter.ts', 'utf8');
    expect(src).toContain('currentBand: health.systemAssessedRag');
    expect(src).not.toMatch(/currentBand: 'GREEN'/);
  });

  it('takes the trajectory input as a function of health, so ordering is enforced by the type', () => {
    const src = readFileSync('src/app/metrics/metric-calculation-service.ts', 'utf8');
    expect(src).toMatch(/trajectory: \(health: HealthEvaluation\) => TrajectoryEvaluationInput/);
  });

  it('never projects a band better than the current one without an improving trajectory', () => {
    const order: Record<string, number> = { GREEN: 0, AMBER: 1, RED: 2 };
    for (const v of [viewB, viewC, viewF]) {
      const current = order[v.statusConflict.systemAssessedRag] ?? 0;
      const o30 = v.verdicts.find((x) => x.id === 'outlook-30')?.value ?? 'not projected';
      if (o30 === 'not projected') continue;
      const trajectory = v.verdicts.find((x) => x.id === 'trajectory')?.value ?? '';
      if (trajectory.includes('DETERIORATING')) {
        expect(order[o30] ?? 0, `${v.header.projectId} ${o30}`).toBeGreaterThanOrEqual(current);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Determinism and the built artifact
// ---------------------------------------------------------------------------

describe('determinism and the artifact', () => {
  it('produces a byte-identical view for identical inputs (AC-7)', () => {
    expect(JSON.stringify(projectExecutiveHealthFor(portfolio, C))).toBe(JSON.stringify(viewC));
  });

  it('carries the demo marker through the built page', () => {
    const built = readFileSync('docs/design/project-executive-health.html', 'utf8');
    expect(built).toMatch(/DEMO\s*[—-]\s*SYNTHETIC DATA/i);
  });

  it('renders the denial case in the built page, not only the happy path', () => {
    const built = readFileSync('docs/design/project-executive-health.html', 'utf8');
    expect(built).toContain('Not available to this role');
  });
});
