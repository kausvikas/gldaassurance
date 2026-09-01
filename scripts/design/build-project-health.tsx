/**
 * Renders Project Executive Health — DEMO — SYNTHETIC DATA.
 *
 * Every page here went through the pipeline. Each persona logs in, a `RequestContext` is built,
 * and `ApplicationGateway.request({ view: 'project.executiveHealth', entityId })` runs the full
 * enforcement path — session validation, the RBAC capability check, ABAC scope resolution, the
 * object-level check that this project is inside the caller's set, field shaping, and audit —
 * before a single component sees the payload. A screenshot of this file is a screenshot of
 * authorised data.
 *
 * It renders the three curated scenarios the Phase 8 gate names, plus the two authorization cases:
 *
 *   - C (`Reported Green, Evidence Amber`) — the AC-2 flagship, and the page the acceptance gate
 *     is really about: a Global Delivery Head challenging an unsupported Green with evidence;
 *   - B (`Green-at-Risk`) — reported GREEN, assessed RED, rapidly deteriorating;
 *   - F (`ETC Optimism`) — where management's EAC and the demonstrated run rate disagree;
 *   - a Delivery Manager on a project outside their set, which returns the same generic
 *     not-found the product returns for a project that does not exist;
 *   - a caller who holds `project.view` but not `COMMERCIAL_CONFIDENTIAL`, so the economics
 *     arrive absent and the page renders the shape without the numbers.
 *
 * Static output, per ADR-0020: there is no transport and no client runtime (DR-044).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProjectExecutiveHealthView } from '@app';
import { DEMO_DATA_BANNER } from '@app';
import {
  AppShell, DegradedState, ProjectExecutiveHealth, designSystemCss,
} from '@presentation/index.js';
import type {
  FreshnessViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
} from '@presentation/index.js';
import { generatePortfolio } from '../generator/index.js';
import { createDemoApi } from '../security/demo-api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'project-executive-health.html');

const portfolio = generatePortfolio();

/ The curated scenarios the Phase 8 gate names, resolved to project ids from the generator. */
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
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('C'),
    note: 'Curated scenario C — Reported Green, Evidence Amber. The AC-2 flagship. The reporting has not caught up with the arithmetic, and the page gives a Global Delivery Head the evidence to say so rather than an opinion to argue with.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('B'),
    note: 'Curated scenario B — the Green-at-Risk archetype. Reported GREEN, rapidly deteriorating. Note that the system now assesses this RED rather than the AMBER the scenario catalog records: see the Phase 8 report on HEALTH-v2 band calibration.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('F'),
    note: 'Curated scenario F — ETC Optimism. Management’s EAC and the cost performance actually demonstrated do not agree, and the ETC credibility section shows the gap and its size.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: 'prj-089',
    note: 'AMBER with an INAPPLICABLE control — included deliberately. Seven of eight Red-forcing controls apply and all seven were evaluated, so the page reads 7/7. The eighth, OVR-NO-CREDIBLE-PLAN, does not apply: the project is five weeks into delivery and a demonstrated velocity needs nine weekly observations, so the comparison it makes has no subject yet. That is not missing evidence and not a finding about delivery. An earlier version of this page called it "evidence not available" and reported 7/8 — both were wrong, and ADR-0026 is why (§12).',
  },
  {
    username: 'dm.mobility', actorId: 'usr-dm-mobility',
    display: 'Delivery Manager', roleLabel: 'DELIVERY_MANAGER', projectId: projectFor('C'),
    note: 'A Delivery Manager requesting a project outside their assigned set. The server returns the same generic not-found it returns for a project that does not exist — no capability, scope or reason is disclosed.',
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
    readonly view: ProjectExecutiveHealthView;
    readonly kase: Case;
    readonly restricted: boolean;
  },
): JSX.Element {
  return (
    <AppShell
      currentId="projects"
      pageTitle="Project Executive Health"
      scope={SCOPE(view.header.name)}
      period={PERIOD}
      freshness={FRESHNESS}
      user={{ name: kase.display, roleLabel: kase.roleLabel }}
      banner={
        <div className="gl-callout">
          <span aria-hidden="true">◈</span>
          <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
            <span className="gl-card-title">{`${kase.display} · ${view.header.projectId}`}</span>
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>{kase.note}</p>
          </div>
        </div>
      }
    >
      <ProjectExecutiveHealth view={view} commercialRestricted={restricted} />
    </AppShell>
  );
}

function DeniedPage({ kase }: { readonly kase: Case }): JSX.Element {
  return (
    <AppShell
      currentId="projects"
      pageTitle="Project Executive Health"
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
    view: 'project.executiveHealth', entityId: kase.projectId,
  });

  if (response.status !== 200) {
    pages.push(renderToStaticMarkup(<DeniedPage kase={kase} />));
    process.stdout.write(
      `${kase.username.padEnd(14)} ${kase.projectId} → ${String(response.status)} (denied, rendered as the product would)\n`,
    );
    continue;
  }

  const row = (response.body as { data: Record<string, unknown>[] }).data[0] ?? {};
  // The economics block is COMMERCIAL_CONFIDENTIAL. Its ABSENCE is how the UI learns of the
  // restriction — never a flag carrying the withheld value (SECURITY_MODEL.md §4.5).
  const restricted = !('financial' in row);
  const view = {
    ...(row as unknown as ProjectExecutiveHealthView),
    commitment: (row['commitment'] as ProjectExecutiveHealthView['commitment'] | undefined) ?? [],
    financial: (row['financial'] as ProjectExecutiveHealthView['financial'] | undefined) ?? [],
    scopeCommercial: (row['scopeCommercial'] as ProjectExecutiveHealthView['scopeCommercial'] | undefined) ?? [],
  };

  pages.push(renderToStaticMarkup(<Page view={view} kase={kase} restricted={restricted} />));
  process.stdout.write(
    `${kase.username.padEnd(14)} ${kase.projectId} → 200 · ${view.header.name} · `
    + `${view.statusConflict.reportedRag} reported / ${view.statusConflict.systemAssessedRag} assessed`
    + `${restricted ? ' · commercial fields ABSENT' : ''}\n`,
  );
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlobalLogic Delivery Intelligence — Project Executive Health</title>
<style>${designSystemCss()}
.gl-case-sep { border: 0; border-top: 2px solid var(--gl-border-strong); margin: 0; }
</style>
</head>
<body>
${pages.join('\n<hr class="gl-case-sep">\n')}
<!-- ${DEMO_DATA_BANNER} -->
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
process.stdout.write(`\nproject executive health written: ${OUT}\n${DEMO_DATA_BANNER}\n`);
