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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
/*
 * One file per project, under docs/design/projects/.
 *
 * This script used to render several personas into a single document separated by rules, which is
 * a design-review artefact rather than a product: /projects served every case stacked on one page,
 * a request for a specific project could not be honoured, and an authorization-denial fixture was
 * published inside an executive route. Each project now gets its own page, so Hosting's cleanUrls
 * resolve /projects/<projectId> to exactly that project.
 */
const OUT_DIR = join(HERE, '..', '..', 'docs', 'design', 'projects');
const OUT_INDEX = join(HERE, '..', '..', 'docs', 'design', 'project-executive-health.html');

const portfolio = generatePortfolio();

/ The curated scenarios the Phase 8 gate names, resolved to project ids from the generator. */
function projectFor(scenario: string): string {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
}

/*
 * The persona and authorization-denial fixtures that used to live here have been removed from the
 * executive route. A denial is a real behaviour worth demonstrating, but publishing it inside
 * /projects meant an executive scrolled from their own portfolio into another role's refusal
 * screen. It belongs in the design gallery, not the product.
 */

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
  { view, note, restricted }: {
    readonly view: ProjectExecutiveHealthView;
    readonly note: string | undefined;
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
      user={{ name: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE' }}
      banner={note === undefined ? undefined : (
        <div className="gl-callout">
          <span aria-hidden="true">◈</span>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>{note}</p>
        </div>
      )}
    >
      <ProjectExecutiveHealth view={view} commercialRestricted={restricted} />
    </AppShell>
  );
}

const api = createDemoApi();

const session = await api.login('exec.cdo');
if (session === undefined) throw new Error('login failed for exec.cdo');
const ctx = api.contextFor('usr-exec-cdo', session.sessionId);

/** Every fixed-bid project the Chief Delivery Officer is authorised for. */
const PROJECT_IDS = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID')
  .map((p) => p.projectId);

const NOTES: Readonly<Record<string, string>> = {
  [projectFor('C')]: 'Reported Green while the evidence assesses otherwise. The reporting has not caught up with the arithmetic, and this page gives a Global Delivery Head evidence to act on rather than an opinion to argue with.',
  [projectFor('B')]: 'Reported Green against a deteriorating assessment — the early-warning archetype this product exists to surface.',
  [projectFor('F')]: 'Management’s estimate at completion and the cost performance actually demonstrated do not agree. The ETC credibility section shows the gap and its size.',
};

function shell(view: ProjectExecutiveHealthView, restricted: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${view.header.name} — Delivery Intelligence</title>
<style>${designSystemCss()}</style>
</head>
<body>
${renderToStaticMarkup(<Page view={view} note={NOTES[view.header.projectId]} restricted={restricted} />)}
<!-- ${DEMO_DATA_BANNER} -->
</body>
</html>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
let denied = 0;
const index: { id: string; name: string }[] = [];

for (const projectId of PROJECT_IDS) {
  const response = await api.gateway.request(ctx, {
    view: 'project.executiveHealth', entityId: projectId,
  });
  if (response.status !== 200) { denied += 1; continue; }

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

  writeFileSync(join(OUT_DIR, `${projectId}.html`), shell(view, restricted), 'utf8');
  index.push({ id: projectId, name: view.header.name });
  written += 1;
}

// The bare /projects route lands on the highest-priority project rather than a gallery.
const first = index[0];
if (first === undefined) throw new Error('no project pages were written');
writeFileSync(
  OUT_INDEX,
  readFileSync(join(OUT_DIR, `${first.id}.html`), 'utf8'),
  'utf8',
);

process.stdout.write(`project pages written: ${String(written)} (denied ${String(denied)})\n`);

