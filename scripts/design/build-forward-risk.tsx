/**
 * Renders Forward Risk, Early Warning & Recovery — DEMO — SYNTHETIC DATA.
 *
 * Every page went through the pipeline: each persona logs in and the payload is fetched through
 * `ApplicationGateway.request({ view: 'project.forwardRisk', entityId })`, so it passed session
 * validation, the RBAC capability check, ABAC scope resolution, the object-level check, field
 * shaping and audit before a component saw it.
 *
 * The three curated scenarios the brief names, chosen to show detection → intervention →
 * outcome:
 *
 *   - B (`Green-at-Risk`) — the detection case. Signals firing on a project whose band has not
 *     yet moved: the whole reason the product exists.
 *   - D (`Amber Recovering`) — the outcome case. A recovery plan in flight, and no early-warning
 *     rule firing, which is what recovery working actually looks like.
 *   - H (`Contract-Loss Risk`) — the intervention case. Multiple severe signals, a plan with
 *     overdue actions, and the lowest plan credibility of the three.
 *
 * Plus a Delivery Manager on a project outside their set, denied without disclosure.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ForwardRiskView } from '@app';
import { DEMO_DATA_BANNER } from '@app';
import { AppShell, DegradedState, ForwardRisk, designSystemCss } from '@presentation/index.js';
import type {
  FreshnessViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
} from '@presentation/index.js';
import { generatePortfolio } from '../generator/index.js';
import { createDemoApi } from '../security/demo-api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'forward-risk.html');

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
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('B'),
    note: 'Curated scenario B — Green-at-Risk. The detection case. Early-warning rules firing against stated thresholds, each one before a band edge moved. This is the window a RAG status cannot describe.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('D'),
    note: 'Curated scenario D — Amber Recovering. The outcome case. A recovery plan in flight and no early-warning rule firing: this is what recovery working looks like, and the empty signal list is the finding.',
  },
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', projectId: projectFor('H'),
    note: 'Curated scenario H — Contract-Loss Risk. The intervention case. Multiple signals, a plan carrying overdue actions, and the lowest plan credibility of the three.',
  },
  {
    username: 'dm.mobility', actorId: 'usr-dm-mobility',
    display: 'Delivery Manager', roleLabel: 'DELIVERY_MANAGER', projectId: projectFor('B'),
    note: 'A Delivery Manager requesting a project outside their assigned set. The server returns the same generic not-found it returns for a project that does not exist.',
  },
];

const SCOPE = (label: string): ScopeSelectionViewModel => ({
  label: 'Project', selectedId: 'project',
  available: [{ id: 'project', label, kind: 'BUSINESS_UNIT' }],
});

const PERIOD: ReportingPeriodViewModel = {
  selectedId: '2026-08', asAtLabel: 'as at 31 Aug 2026',
  periods: [{ id: '2026-08', label: 'Aug 2026' }],
};

const FRESHNESS: FreshnessViewModel = {
  state: 'CURRENT', glyph: '●', label: 'Data current',
  detail: 'Finance 3d · Delivery 3d · Contract 1d', degradedSources: [],
};

function Page(
  { view, kase, restricted }: {
    readonly view: ForwardRiskView;
    readonly kase: Case;
    readonly restricted: boolean;
  },
): JSX.Element {
  return (
    <AppShell
      currentId="early-warnings"
      pageTitle="Forward Risk & Recovery"
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
      <ForwardRisk view={view} commercialRestricted={restricted} />
    </AppShell>
  );
}

function DeniedPage({ kase }: { readonly kase: Case }): JSX.Element {
  return (
    <AppShell
      currentId="early-warnings"
      pageTitle="Forward Risk & Recovery"
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
    view: 'project.forwardRisk', entityId: kase.projectId,
  });

  if (response.status !== 200) {
    pages.push(renderToStaticMarkup(<DeniedPage kase={kase} />));
    process.stdout.write(
      `${kase.username.padEnd(14)} ${kase.projectId} → ${String(response.status)} (denied, rendered as the product would)\n`,
    );
    continue;
  }

  const row = (response.body as { data: Record<string, unknown>[] }).data[0] ?? {};
  const restricted = !('recoveryEconomics' in row);
  const view = row as unknown as ForwardRiskView;

  pages.push(renderToStaticMarkup(<Page view={view} kase={kase} restricted={restricted} />));
  process.stdout.write(
    `${kase.username.padEnd(14)} ${kase.projectId} → 200 · ${view.projectName} · `
    + `${String(view.signals.length)} signals · rank ${view.interventionPriority.rank}`
    + `${restricted ? ' · recovery economics ABSENT' : ''}\n`,
  );
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlobalLogic Delivery Intelligence — Forward Risk &amp; Recovery</title>
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
process.stdout.write(`\nforward risk written: ${OUT}\n${DEMO_DATA_BANNER}\n`);
