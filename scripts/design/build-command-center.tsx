/**
 * Renders the Portfolio Command Center — DEMO — SYNTHETIC DATA.
 *
 * The page is rendered from data that actually went through the pipeline. It logs a persona in,
 * builds a `RequestContext`, and calls `ApplicationGateway.request({ view: 'portfolio.commandCenter' })`
 * — so the payload passed session validation, the RBAC capability check, ABAC scope resolution, the
 * object-level check, field shaping and audit before a single component saw it. Nothing here reaches
 * around the enforcement point, and a screenshot of this page is a screenshot of authorised data.
 *
 * It renders three personas against the same portfolio, which is AC-5 made visible:
 *
 *   - the CDO sees every project they are authorised for;
 *   - the EMEA Portfolio Director sees a materially smaller portfolio and materially different
 *     totals — because the aggregate is computed over *their* authorised set, never filtered down
 *     from a global figure (ADR-0005 §5);
 *   - the Delivery Manager is denied the route outright: they do not hold
 *     `portfolio.viewAggregates`, and the response is the same generic not-found the product returns
 *     for a project that does not exist.
 *
 * The component's `commercialRestricted` path — a caller who holds the capability but not the
 * `COMMERCIAL_CONFIDENTIAL` classification — is exercised by test rather than by a persona, because
 * no current role is in that position. Staging one would be theatre; asserting the behaviour is
 * not.
 *
 * Static output, per ADR-0020: there is no transport and no client runtime (DR-044). Every
 * interaction the page offers is a link, and the interactivity a live build would add is a
 * view-model change dispatched through the same gateway.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSX } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommandCenterView } from '@app';
import { DEMO_DATA_BANNER } from '@app';
import {
  AppShell, DegradedState, PortfolioCommandCenter, designSystemCss,
} from '@presentation/index.js';
import type {
  FreshnessViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
} from '@presentation/index.js';
import { createDemoApi } from '../security/demo-api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'portfolio-command-center.html');

interface Persona {
  readonly username: string;
  readonly actorId: string;
  readonly display: string;
  readonly roleLabel: string;
  readonly scopeLabel: string;
  readonly note: string;
}

const PERSONAS: readonly Persona[] = [
  {
    username: 'exec.cdo', actorId: 'usr-exec-cdo',
    display: 'Chief Delivery Officer', roleLabel: 'EXECUTIVE', scopeLabel: 'All business units',
    note: 'Full portfolio breadth. Every figure below is the sum of the fixed-bid projects this caller is authorised for — the authorised universe is larger, and the page says by how much and what it left out.',
  },
  {
    username: 'dir.emea', actorId: 'usr-dir-emea',
    display: 'Portfolio Director, EMEA', roleLabel: 'PORTFOLIO_DIRECTOR', scopeLabel: 'EMEA',
    note: 'Same page, narrower authorised set. The totals differ because they are computed over this caller’s scope, never filtered from a global figure (ADR-0005 §5, AC-5). The fixed-bid population is applied inside that scope, not instead of it.',
  },
  {
    username: 'dm.mobility', actorId: 'usr-dm-mobility',
    display: 'Delivery Manager', roleLabel: 'DELIVERY_MANAGER', scopeLabel: 'Assigned projects',
    note: 'Denied outright: this role does not hold portfolio.viewAggregates, so the route returns the same generic not-found it returns for a project that does not exist. No capability, scope or reason is disclosed. The component’s Restricted path is a separate control for a caller who holds the capability but not the COMMERCIAL_CONFIDENTIAL classification — no current role is in that position, and that is stated rather than staged.',
  },
];

const SCOPE = (label: string): ScopeSelectionViewModel => ({
  label: 'Portfolio scope',
  selectedId: 'authorised',
  available: [{ id: 'authorised', label, kind: 'BUSINESS_UNIT' }],
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
  { view, persona, restricted }: {
    readonly view: CommandCenterView;
    readonly persona: Persona;
    readonly restricted: boolean;
  },
): JSX.Element {
  return (
    <AppShell
      currentId="portfolio"
      pageTitle="Portfolio Command Center"
      scope={SCOPE(persona.scopeLabel)}
      period={PERIOD}
      freshness={FRESHNESS}
      user={{ name: persona.display, roleLabel: persona.roleLabel }}
      banner={
        <div className="gl-callout">
          <span aria-hidden="true">◈</span>
          <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
            <span className="gl-card-title">{`${persona.display} · ${String(view.projectCount)} fixed-bid projects of ${String(view.authorisedUniverseCount)} authorised`}</span>
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>{persona.note}</p>
          </div>
        </div>
      }
    >
      <PortfolioCommandCenter view={view} commercialRestricted={restricted} />
    </AppShell>
  );
}

/ A page a caller is not authorised for at all, rendered as the product would render it. */
function DeniedPage({ persona }: { readonly persona: Persona }): JSX.Element {
  return (
    <AppShell
      currentId="portfolio"
      pageTitle="Portfolio Command Center"
      scope={SCOPE(persona.scopeLabel)}
      period={PERIOD}
      freshness={FRESHNESS}
      user={{ name: persona.display, roleLabel: persona.roleLabel }}
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

for (const persona of PERSONAS) {
  const session = await api.login(persona.username);
  if (session === undefined) throw new Error(`login failed for ${persona.username}`);
  const ctx = api.contextFor(persona.actorId, session.sessionId);

  // Through the gateway — session, RBAC, ABAC, object check, shaping, audit.
  const response = await api.gateway.request(ctx, { view: 'portfolio.commandCenter' });

  if (response.status !== 200) {
    pages.push(renderToStaticMarkup(<DeniedPage persona={persona} />));
    process.stdout.write(`${persona.username.padEnd(14)} → ${String(response.status)} (denied, rendered as the product would)\n`);
    continue;
  }

  const row = (response.body as { data: Record<string, unknown>[] }).data[0] ?? {};
  // The KPI block is COMMERCIAL_CONFIDENTIAL. Its ABSENCE is how the UI learns of the restriction —
  // never a flag carrying the withheld value (SECURITY_MODEL.md §4.5).
  const restricted = !('kpis' in row);
  const view = {
    ...(row as unknown as CommandCenterView),
    kpis: (row['kpis'] as CommandCenterView['kpis'] | undefined) ?? [],
  };

  pages.push(renderToStaticMarkup(
    <Page view={view} persona={persona} restricted={restricted} />,
  ));
  process.stdout.write(
    `${persona.username.padEnd(14)} → 200 · ${String(view.projectCount)} projects · `
    + `${restricted ? 'commercial fields ABSENT' : `TCV ${view.kpis[0]?.display ?? 'n/a'}`}\n`,
  );
}

/**
 * The half of the acceptance gate a test cannot close.
 *
 * AC-1 asks whether an executive can reach a named project needing intervention in under thirty
 * seconds. Everything structural about that is asserted in `tests/integration/command-center.test.tsx`
 * — the rank-1 project is named above the table, the KPIs are in the specified order, no status is
 * carried by colour alone. What no test can answer is whether the page *reads* that way at
 * 1440x900 to a person who has not seen it before. That is a human judgement, so the checklist ships
 * with the artifact rather than being asserted and quietly assumed.
 */
const CHECKLIST: readonly (readonly [string, string])[] = [
  ['Viewport', 'Open at exactly 1440x900. Do not zoom out to make it fit — if it needs zooming, it fails.'],
  ['Thirty seconds', 'Start a timer. Without scrolling, can you name the one project to intervene in, and say why?'],
  ['Three interactions', 'Count clicks to that answer. The target is zero; the gate is three.'],
  ['Population', 'Does the first line tell you this is the fixed-bid portfolio, and what was excluded?'],
  ['Reconciliation', 'Does the Amber/Red count denominator match the ranked row count?'],
  ['Colour', 'Squint, or view in greyscale. Is every status still readable as a word or a shape?'],
  ['Density', 'Does the KPI band read as eight figures, or as a wall? Two rows of four, never nine.'],
  ['Green-at-Risk', 'Are the two findings distinguishable as different questions, not one number twice?'],
  ['Table', 'Scroll the table sideways. Does the project column stay as the anchor?'],
  ['Honesty', 'Find one number you do not believe. Can you reach its evidence without leaving the page?'],
  ['Restriction', 'Compare the CDO and EMEA pages. Do the totals differ, and is that visibly deliberate?'],
  ['Denial', 'On the Delivery Manager page, does the product disclose anything about what was withheld?'],
];

const checklistHtml = `
<section class="gl-card gl-card-pad gl-stack" style="margin: var(--gl-space-lg)">
  <h2 class="gl-h2">Manual acceptance review — 1440x900</h2>
  <p class="gl-body-sm" style="max-width: 90ch">
    These twelve checks are <strong>not</strong> asserted by any test, and none of them was performed
    by the agent that built this page: the browser was not connected, so the page was never viewed.
    A reviewer must open this file at 1440x900 and answer each one. An unticked box is an open gate,
    not a formality.
  </p>
  <table class="gl-table gl-table-compact">
    <thead><tr><th scope="col">Check</th><th scope="col">What to do</th><th scope="col">Pass?</th></tr></thead>
    <tbody>
      ${CHECKLIST.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td><td>&#9744;</td></tr>`).join('\n      ')}
    </tbody>
  </table>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlobalLogic Delivery Intelligence — Portfolio Command Center</title>
<style>${designSystemCss()}
.gl-persona-sep { border: 0; border-top: 2px solid var(--gl-border-strong); margin: 0; }
</style>
</head>
<body>
${pages.join('\n<hr class="gl-persona-sep">\n')}
<hr class="gl-persona-sep">
${checklistHtml}
<!-- ${DEMO_DATA_BANNER} -->
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
process.stdout.write(`\ncommand center written: ${OUT}\n${DEMO_DATA_BANNER}\n`);
