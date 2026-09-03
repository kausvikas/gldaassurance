/**
 * Renders Margin & Driver Intelligence — DEMO — SYNTHETIC DATA.
 *
 * Every page went through the pipeline: each persona logs in and the payload is fetched through
 * `ApplicationGateway.request({ view: 'project.marginIntelligence', entityId })`, so it passed
 * session validation, the RBAC capability check, ABAC scope resolution, the object-level check,
 * field shaping and audit before a component saw it.
 *
 * Five cases, chosen to exercise the economics rather than to look good:
 *
 *   - H (`Contract-Loss Risk`) — negative once unresolved risk is counted. The contract-loss
 *     warning is the one thing on this surface that must be impossible to miss.
 *   - E (`Scope & Commercial Leakage`) — margin delivered away without a change request.
 *   - G (`Quality Margin Leakage`) — margin spent on rework nobody priced.
 *   - prj-089 — the portfolio's *weakest* bridge: 1.6% explanatory coverage on a $2.06M loss.
 *     A demo assembled only from projects the model explains well would misrepresent the model, so
 *     the worst case is on the page next to the best one (DR-062).
 *   - a Delivery Manager, who does not hold `project.viewCommercial` and is denied the route.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarginIntelligenceView } from '@app';
import { DEMO_DATA_BANNER } from '@app';
import {
  AppShell, DegradedState, MarginIntelligence, designSystemCss,
} from '@presentation/index.js';
import type {
  FreshnessViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
} from '@presentation/index.js';
import { generatePortfolio } from '../generator/index.js';
import { createDemoApi } from '../security/demo-api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'margin-intelligence.html');

const portfolio = generatePortfolio();

function projectFor(scenario: string): string {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
}

interface Case {
  readonly username: string;
  readonly actorId: string;
  readonly display: string;
  readonly roleLabel: string;
  readonly projectId: string;
  readonly note: string;
}

const CASES: readonly Case[] = [
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('H'),
    note: 'Curated scenario H — Contract-Loss Risk. Negative once unresolved risk is counted. The contract-loss warning sits above every other figure, because a fixed-bid contract completing at a loss is a commercial event before it is a delivery one.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('E'),
    note: 'Curated scenario E — Scope & Commercial Leakage. Work delivered without an executed change request behind it, visible as the scope-without-CR step on the bridge.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('G'),
    note: 'Curated scenario G — Quality Margin Leakage. Margin spent on rework nobody priced, visible as the quality/rework step and quantified by MET-QUA-012.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: 'prj-089',
    note: 'The weakest bridge in the portfolio, included deliberately. The named causes account for only 1.6% of the gross movement on a $2.06M margin loss — the waterfall reconciles to the cent and still explains almost nothing. Shown because a demo built only from projects the model explains well would misrepresent the model (DR-062). Compare it with scenario H above, at 95.4%.',
  },
  {
    username: 'dm.mobility', actorId: 'usr-dm-mobility',
    display: 'Delivery Manager', roleLabel: 'DELIVERY_MANAGER', projectId: projectFor('H'),
    note: 'A Delivery Manager does not hold project.viewCommercial. The route is denied outright rather than served as a page with every figure withheld — a shell that looks like a page is worse than a denial.',
  },
];

const SCOPE = (label: string): ScopeSelectionViewModel => ({
  label: 'Project',
  selectedId: 'project',
  available: [{ id: 'project', label, kind: 'BUSINESS_UNIT' }],
});

const PERIOD: ReportingPeriodViewModel = {
  selectedId: '2026-08',
  asAtLabel: 'as at 31 Aug 2026',
  periods: [{ id: '2026-08', label: 'Aug 2026' }],
};

const FRESHNESS: FreshnessViewModel = {
  state: 'CURRENT', glyph: '●', label: 'Data current',
  detail: 'Finance 3d · Delivery 3d · Contract 1d',
  degradedSources: [],
};

function Page(
  { view, kase, restricted }: {
    readonly view: MarginIntelligenceView;
    readonly kase: Case;
    readonly restricted: boolean;
  },
): JSX.Element {
  return (
    <AppShell
      currentId="financial"
      pageTitle="Margin & Driver Intelligence"
      scope={SCOPE(view.projectName)}
      period={PERIOD}
      freshness={FRESHNESS}
      user={{ name: kase.display, roleLabel: kase.roleLabel }}
      banner={
        <div className="gl-callout">
          <span aria-hidden="true">◈</span>
          <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
            <span className="gl-card-title">{`${kase.display} · ${view.projectId}`}</span>
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>{kase.note}</p>
          </div>
        </div>
      }
    >
      <MarginIntelligence view={view} commercialRestricted={restricted} />
    </AppShell>
  );
}

function DeniedPage({ kase }: { readonly kase: Case }): JSX.Element {
  return (
    <AppShell
      currentId="financial"
      pageTitle="Margin & Driver Intelligence"
      scope={SCOPE('Assigned projects')}
      period={PERIOD}
      freshness={FRESHNESS}
      user={{ name: kase.display, roleLabel: kase.roleLabel }}
      banner={
        <div className="gl-callout">
          <span aria-hidden="true">◈</span>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>{kase.note}</p>
        </div>
      }
    >
      <DegradedState
        freshness={{
          state: 'UNAVAILABLE', glyph: '■', label: 'Not available to this role',
          detail:
            'The server returned the same generic not-found it returns for a project that does not '
            + 'exist. No capability, scope or reason is disclosed (SECURITY_MODEL.md §4.5).',
          degradedSources: [],
        }}
      />
    </AppShell>
  );
}

const api = createDemoApi();
const pages: string[] = [];

for (const kase of CASES) {
  const session = await api.login(kase.username);
  if (session === undefined) throw new Error(`login failed for ${kase.username}`);
  const ctx = api.contextFor(kase.actorId, session.sessionId);

  const response = await api.gateway.request(ctx, {
    view: 'project.marginIntelligence', entityId: kase.projectId,
  });

  if (response.status !== 200) {
    pages.push(renderToStaticMarkup(<DeniedPage kase={kase} />));
    process.stdout.write(
      `${kase.username.padEnd(14)} ${kase.projectId} → ${String(response.status)} (denied, rendered as the product would)\n`,
    );
    continue;
  }

  const row = (response.body as { data: Record<string, unknown>[] }).data[0] ?? {};
  const restricted = !('bridge' in row);
  const view = row as unknown as MarginIntelligenceView;

  pages.push(renderToStaticMarkup(<Page view={view} kase={kase} restricted={restricted} />));
  process.stdout.write(
    `${kase.username.padEnd(14)} ${kase.projectId} → 200 · ${view.projectName} · `
    + `bridge reconciles ${String(view.bridge.reconciles)} · `
    + `${view.contractLossWarning === null ? 'no loss warning' : 'CONTRACT LOSS'}\n`,
  );
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlobalLogic Delivery Intelligence — Margin &amp; Driver Intelligence</title>
<style>${designSystemCss()}
.gl-case-sep { border: 0; border-top: 2px solid var(--gl-border-strong); margin: 0; }
</style>
</head>
<body>
${(() => {
  /*
   * One application shell per executive route.
   *
   * These scripts rendered every persona into a single document separated by rules — a design
   * review artefact published as the product. An executive opening the page scrolled through the
   * same surface three to five times under different roles, including an authorization-denial
   * fixture belonging to another user. Only the Chief Delivery Officer's view is published here;
   * the persona and denial cases remain exercised by the authorization tests, which is where a
   * security behaviour belongs.
   */
  const first = pages[0];
  if (first === undefined) throw new Error('no executive page was rendered');
  return first;
})()}
<!-- ${DEMO_DATA_BANNER} -->
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
process.stdout.write(`\nmargin intelligence written: ${OUT}\n${DEMO_DATA_BANNER}\n`);
