/**
 * Builds the component gallery — DEMO — SYNTHETIC DATA.
 *
 * Renders every Phase 6 primitive, in every state that matters, into a single static HTML page at
 * `docs/design/component-gallery.html`. Run it with `npm run design:gallery`.
 *
 * Why static server-rendered HTML rather than a dev server. There is no HTTP transport in this
 * repository — ADR-0006 is still `Proposed` and `ARCHITECTURE_DECISIONS.md` §2 forbids code
 * depending on it (Phase 5, DR-029). A gallery that needed a server would either require building
 * that transport early or would quietly become one. `renderToStaticMarkup` sidesteps the question
 * entirely: the components run, the markup is real, the page opens in any browser, and the
 * accessibility affordances are inspectable — because they are HTML, not a framework abstraction.
 *
 * It also means the gallery is *reviewable evidence*: the acceptance gate for this phase is "review
 * at 1440×900", and this file is what produces the thing being reviewed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JSX, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AppShell, BRAND, BubbleMatrix, ConfidenceBadge, DataFreshnessIndicator, DataTable,
  DegradedState, DemoSyntheticDataBadge, EmptyState, ErrorState, EvidenceDisclosure,
  ExecutiveActionCard, ExecutiveKpiCard, FilterBar, ForecastOutlook, HealthBadge, InsightCallout,
  LoadingState, MetricComparison, PAIRING_RULES, Panel, ProgressBurnBars, ProvenanceValue,
  RestrictedValue, STATUS, STATUS_TONES, StatusConflict, SURFACE_HEX, TrajectoryIndicator,
  TrendChart, Waterfall, contrastRatioRounded, designSystemCss, meetsContrast, statusFor,
} from '@presentation/index.js';
import { DEMO_DATA_BANNER } from '@app';
import {
  ACTIONS, BUBBLES, BURN, COMPARISON, CONFLICT, FILTERS, FRESHNESS_CURRENT, FRESHNESS_DEGRADED,
  INSIGHTS, KPIS, OUTLOOK, PERIOD, PORTFOLIO_TABLE, SCOPE, TREND, USER, WATERFALL,
} from './fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'component-gallery.html');

function Section({ id, title, note, children }: {
  readonly id: string; readonly title: string; readonly note?: string; readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="gl-stack" aria-labelledby={`sec-${id}`} style={{ gap: 'var(--gl-space-md)' }}>
      <div>
        <h2 className="gl-h2" id={`sec-${id}`}>{title}</h2>
        {note !== undefined ? <p className="gl-body-sm" style={{ margin: '4px 0 0', maxWidth: '80ch' }}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/ Palette swatches with the measured ratio beside each — the numbers are recomputed, not quoted. */
function Swatches(): JSX.Element {
  const entries: readonly (readonly [string, string])[] = [
    ...Object.entries(BRAND),
    ['status.amberOnLight', STATUS.amberOnLight],
    ['status.redOnLight', STATUS.redOnLight],
    ['status.amberOnDark', STATUS.amberOnDark],
    ['status.redOnDark', STATUS.redOnDark],
  ];
  return (
    <div className="gl-grid">
      {entries.map(([name, hex]) => {
        const onWhite = contrastRatioRounded(hex, SURFACE_HEX.white);
        const onDark = contrastRatioRounded(hex, SURFACE_HEX.steelGray100);
        return (
          <div className="gl-col-3" key={name}>
            <div className="gl-card gl-card-pad gl-stack" style={{ gap: 'var(--gl-space-xs)' }}>
              <div style={{ background: hex, height: '48px', borderRadius: 'var(--gl-radius-control)', border: '1px solid var(--gl-border-hairline)' }} />
              <div>
                <div className="gl-body-sm" style={{ fontWeight: 600 }}>{name}</div>
                <div className="gl-caption gl-numeric">{hex}</div>
              </div>
              <div className="gl-caption gl-numeric">
                {`on white ${onWhite.toFixed(2)} · on steel-100 ${onDark.toFixed(2)}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/ §2.1 encoded and re-verified at build time. A row that disagreed would fail the a11y suite. */
function PairingTable(): JSX.Element {
  return (
    <div className="gl-table-wrap">
      <table className="gl-table gl-table-compact">
        <caption>Token pairing rules from BRAND_DESIGN_SYSTEM.md §2.1, recomputed from the palette</caption>
        <thead>
          <tr>
            <th scope="col">Foreground</th>
            <th scope="col">Surface</th>
            <th scope="col">Use</th>
            <th scope="col" className="gl-num">Ratio</th>
            <th scope="col">Rule</th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {PAIRING_RULES.map((r) => {
            const ratio = contrastRatioRounded(r.foreground, SURFACE_HEX[r.surface]);
            const passes = meetsContrast(r.foreground, SURFACE_HEX[r.surface], r.use);
            const agrees = passes === r.permitted;
            return (
              <tr key={`${r.foreground}-${r.surface}-${r.use}`}>
                <th scope="row" className="gl-numeric" style={{ fontWeight: 400 }}>{r.foreground}</th>
                <td>{r.surface}</td>
                <td>{r.use}</td>
                <td className="gl-num gl-numeric">{ratio.toFixed(2)}</td>
                <td>{r.rule}</td>
                <td>
                  <HealthBadge
                    status={agrees
                      ? statusFor(r.permitted ? 'positive' : 'neutral', r.permitted ? 'Permitted' : 'Prohibited')
                      : statusFor('critical', 'Rule disagrees with measurement')}
                    compact
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Gallery(): JSX.Element {
  return (
    <AppShell
      currentId="portfolio"
      pageTitle="Design system — component gallery"
      scope={SCOPE}
      period={PERIOD}
      freshness={FRESHNESS_CURRENT}
      user={USER}
      // Deliberately NOT `gl-btn-primary`. §8 prohibition 6 permits one orange emphasis element per
      // view, and on this page that one element is the intervention CTA in §6 — which is what an
      // executive surface would actually make primary. A gallery that showed two orange buttons
      // would be demonstrating the components while breaking the rule they exist to serve.
      actions={<button type="button" className="gl-btn">Export</button>}
      banner={<DegradedState freshness={FRESHNESS_DEGRADED} />}
    >
      <p className="gl-body" style={{ margin: 0, maxWidth: '86ch' }}>
        Every primitive Phases 7–11 may use, in every state that matters. Nothing on this page
        computes a business value: each component receives a typed view model whose figures arrive
        pre-formatted from decimal-safe domain logic. A later screen that needs a visual convention
        not shown here has found a gap in the system — the fix belongs in the system, not the screen.
      </p>

      <Section
        id="tokens"
        title="1 · Brand tokens and measured contrast"
        note="Ratios are recomputed from the palette at build time, not transcribed. The pairing table is BRAND_DESIGN_SYSTEM.md §2.1 expressed as data; the accessibility suite asserts the same rows."
      >
        <Swatches />
        <Panel title="Token pairing rules">
          <PairingTable />
        </Panel>
      </Section>

      <Section
        id="type"
        title="2 · Typography and numeric hierarchy"
        note="Helvetica Neue where the machine has it, then Inter, Arial, system sans. No font file is embedded. All figures use tabular lining numerals so a column of them aligns on the decimal."
      >
        <div className="gl-card gl-card-pad gl-stack">
          <div className="gl-display gl-numeric">$4.82M</div>
          <h3 className="gl-h1">H1 · Portfolio Command Center</h3>
          <div className="gl-h2">H2 · Section heading</div>
          <div className="gl-h3">H3 · Card title</div>
          <div className="gl-body">Body 15px — the size a paragraph of explanation is set in.</div>
          <div className="gl-body-sm">Body small 13px — table cells, secondary detail.</div>
          <div className="gl-caption">Caption 12px — metadata, timestamps, rule versions. Never a figure a decision rests on.</div>
          <div className="gl-eyebrow">Eyebrow · KPI label</div>
          <div className="gl-numeric gl-body">1,204,880.55 · 18.1% · −7.9pp · $24.5M</div>
        </div>
      </Section>

      <Section
        id="status"
        title="3 · Status, trajectory, confidence"
        note="Shape, word, colour — in that order of reliability. There is no API in this library that yields a status colour without its glyph and label, so a colour-only badge is not a discouraged option; it is not an option."
      >
        <div className="gl-card gl-card-pad gl-row" style={{ gap: 'var(--gl-space-md)' }}>
          {(['positive', 'caution', 'critical', 'neutral'] as const).map((tone) => (
            <HealthBadge key={tone} status={statusFor(tone)} />
          ))}
          <TrajectoryIndicator trajectory={{ direction: 'deteriorating', glyph: '▼', label: 'Deteriorating', windowLabel: '6 wks' }} />
          <TrajectoryIndicator trajectory={{ direction: 'improving', glyph: '▲', label: 'Improving', windowLabel: '6 wks' }} />
          <TrajectoryIndicator trajectory={{ direction: 'stable', glyph: '▬', label: 'Stable', windowLabel: '6 wks' }} />
          <ConfidenceBadge confidence={{ level: 'MEDIUM', label: 'Medium', rationale: 'Delivery tracker 12 days stale.' }} />
          <DataFreshnessIndicator freshness={FRESHNESS_CURRENT} />
        </div>
        <StatusConflict conflict={CONFLICT} />
      </Section>

      <Section
        id="provenance"
        title="4 · Provenance — observed, derived, inferred"
        note="ADR-0004 and BRAND_DESIGN_SYSTEM.md §3.3. Facts are undecorated. Derived values carry a dotted underline and reach their formula. Inferences are contained in a bordered blue panel with an explicit chip — containment is what stops a model's estimate reading as an observation."
      >
        <div className="gl-grid">
          <div className="gl-col-4">
            <div className="gl-card gl-card-pad gl-stack">
              <span className="gl-eyebrow">L1 · Observed</span>
              <span className="gl-body gl-numeric"><ProvenanceValue treatment="fact">$61.40M contract value</ProvenanceValue></span>
              <span className="gl-caption">Plain. Facts look like facts.</span>
            </div>
          </div>
          <div className="gl-col-4">
            <div className="gl-card gl-card-pad gl-stack">
              <span className="gl-eyebrow">L2 · Derived</span>
              <span className="gl-body gl-numeric"><ProvenanceValue treatment="computed">18.1% forecast GM</ProvenanceValue></span>
              <EvidenceDisclosure evidence={KPIS[0]?.evidence ?? { title: '', lines: [], sources: [] }} label="Show the working" />
            </div>
          </div>
          <div className="gl-col-4">
            <div className="gl-card gl-card-pad gl-stack">
              <span className="gl-eyebrow">L3 · Inferred</span>
              <ProvenanceValue treatment="inferred">
                <span className="gl-body">Projected to close 5.2pp below as-sold margin.</span>
              </ProvenanceValue>
            </div>
          </div>
          <div className="gl-col-4">
            <div className="gl-card gl-card-pad gl-stack">
              <span className="gl-eyebrow">Restricted field</span>
              <RestrictedValue />
              <span className="gl-caption">
                The field is absent from the payload — not masked. The chip discloses nothing about
                the withheld value.
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="kpi"
        title="5 · Executive KPI cards"
        note="One figure per card at display size, the delta directly beneath with a sign glyph and a stated sentiment, evidence one keystroke away. The fourth card shows what a field the caller is not authorised for looks like."
      >
        <div className="gl-grid">
          {KPIS.map((kpi) => (
            <div className="gl-col-3" key={kpi.id}><ExecutiveKpiCard kpi={kpi} /></div>
          ))}
        </div>
      </Section>

      <Section
        id="forward"
        title="6 · Forward-looking and advisory"
        note="An outlook is always contained and always carries a confidence badge; an outlook without a stated confidence is an assertion. At most one action card in a view renders its button in orange."
      >
        <div className="gl-grid">
          <div className="gl-col-6"><ForecastOutlook outlook={OUTLOOK} /></div>
          <div className="gl-col-6">
            <div className="gl-stack">
              {INSIGHTS.map((i) => <InsightCallout key={i.id} insight={i} />)}
            </div>
          </div>
          {ACTIONS.map((a, i) => (
            <div className="gl-col-6" key={a.id}><ExecutiveActionCard action={a} primary={i === 0} /></div>
          ))}
        </div>
      </Section>

      <Section
        id="tables"
        title="7 · Data table and filters"
        note="A real <table> with scoped headers and aria-sort. Sorting is a view-model field, not component state: the service sorts the whole set, because a table that sorts its own page silently sorts only the first hundred rows."
      >
        <Panel title="Projects in scope" actions={<FilterBar filters={FILTERS} />}>
          <DataTable table={PORTFOLIO_TABLE} />
        </Panel>
        <MetricComparison comparison={COMPARISON} />
      </Section>

      <Section
        id="charts"
        title="8 · Chart wrappers"
        note="Inline SVG drawn with token classes — no charting library, because every library brings its own palette and type scale and then the design system has a competitor inside it. Each chart carries a required text alternative and an accessible data table."
      >
        <div className="gl-grid">
          <div className="gl-col-6"><div className="gl-card gl-card-pad"><TrendChart chart={TREND} /></div></div>
          <div className="gl-col-6"><div className="gl-card gl-card-pad"><Waterfall chart={WATERFALL} /></div></div>
          <div className="gl-col-7"><div className="gl-card gl-card-pad"><BubbleMatrix chart={BUBBLES} /></div></div>
          <div className="gl-col-5">
            <Panel title="Budget consumed against completion">
              <ProgressBurnBars chart={BURN} />
            </Panel>
          </div>
        </div>
      </Section>

      <Section
        id="states"
        title="9 · Empty, loading, error, degraded"
        note="The states a demo actually lands in. Empty is not an error — “nothing breaching threshold” is good news. Degraded shows the numbers and names the reason to doubt them. An error never leaks internals; it offers a correlation id."
      >
        <div className="gl-grid">
          <div className="gl-col-3">
            <div className="gl-card"><EmptyState state={{ title: 'Nothing at risk', body: 'No project in this scope breaches an amber threshold this period.', glyph: '●' }} /></div>
          </div>
          <div className="gl-col-3">
            <div className="gl-card gl-card-pad"><LoadingState label="Loading portfolio" /></div>
          </div>
          <div className="gl-col-3">
            <div className="gl-card"><ErrorState state={{ title: 'Could not load', body: 'The request could not be completed. Nothing has been changed.', correlationId: 'cor-8f31a2' }} /></div>
          </div>
          <div className="gl-col-3">
            <DegradedState freshness={FRESHNESS_DEGRADED} />
          </div>
        </div>
      </Section>

      <Section
        id="marker"
        title="10 · Demo marker"
        note="REQ-UX-005. The string is never typed in a component — it arrives from a constant, and the G-DEMO source gate fails the build on any literal spelling of it inside the presentation layer. Orange on white or dark, never on the app background, where it measures 2.73:1."
      >
        <div className="gl-card gl-card-pad gl-row" style={{ gap: 'var(--gl-space-md)' }}>
          <DemoSyntheticDataBadge />
          <span className="gl-theme-dark" style={{ background: 'var(--gl-surface-app)', padding: 'var(--gl-space-xs)', borderRadius: 'var(--gl-radius-control)' }}>
            <DemoSyntheticDataBadge onDark />
          </span>
        </div>
      </Section>
    </AppShell>
  );
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GlobalLogic Delivery Intelligence — Design System</title>
<style>${designSystemCss()}</style>
</head>
<body>
${renderToStaticMarkup(<Gallery />)}
<!-- ${DEMO_DATA_BANNER} -->
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
process.stdout.write(`component gallery written: ${OUT}\n`);
process.stdout.write(`${DEMO_DATA_BANNER}\n`);
