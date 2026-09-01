/**
 * Component behaviour, asserted on rendered markup.
 *
 * Rendered with `renderToStaticMarkup` rather than a DOM testing library, for the same reason the
 * gallery is static HTML: there is no transport and no browser in this repository, and the
 * properties Phase 6 must prove are properties **of the markup** — is there a `<th scope>`, is the
 * status label present beside the colour, does the chart carry a text alternative, is the demo
 * marker on the page. Those are exactly what static rendering shows, and they are what a later
 * accessibility audit will look for first.
 *
 * **What this suite cannot prove, and does not claim to.** Focus order, actual tab traversal, screen
 * reader announcement, and visual contrast *as rendered* need a browser. They are Phase 12 work
 * (REQ-OPS-002) and are recorded as debt, not asserted here. A test that rendered a string and
 * claimed "keyboard navigable" would be exactly the kind of unearned completion claim global
 * invariant 5 prohibits.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { JSX } from 'react';
import { DEMO_DATA_BANNER } from '@app';
import {
  AppShell, BubbleMatrix, ConfidenceBadge, DataFreshnessIndicator, DataTable, DegradedState,
  DemoSyntheticDataBadge, EmptyState, ErrorState, EvidenceDisclosure, ExecutiveActionCard,
  ExecutiveKpiCard, ForecastOutlook, HealthBadge, InsightCallout, LoadingState, ProgressBurnBars,
  ProvenanceValue, RestrictedValue, STATUS_TONES, StatusConflict, TrajectoryIndicator, TrendChart,
  Waterfall, statusFor, type StatusTone,
} from '@presentation/index.js';
import {
  ACTIONS, BUBBLES, BURN, CONFLICT, FRESHNESS_CURRENT, FRESHNESS_DEGRADED, INSIGHTS, KPIS,
  OUTLOOK, PERIOD, PORTFOLIO_TABLE, SCOPE, TREND, USER, WATERFALL,
} from '../../scripts/design/fixtures.js';

const html = (el: JSX.Element): string => renderToStaticMarkup(el);
/** Text content with tags stripped — what a reader actually sees, plus SR-only text. */
const text = (el: JSX.Element): string => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// REQ-UX-002 — status is never colour alone
// ---------------------------------------------------------------------------

describe('status is never encoded by colour alone (REQ-UX-002, AC-8)', () => {
  for (const tone of ['positive', 'caution', 'critical', 'neutral'] as const) {
    it(`renders a glyph and a word for ${tone}, in compact and full`, () => {
      for (const compact of [false, true]) {
        const out = html(<HealthBadge status={statusFor(tone)} compact={compact} />);
        expect(out, `${tone} compact=${String(compact)}`).toContain(STATUS_TONES[tone].glyph);
        expect(out).toContain(STATUS_TONES[tone].label);
      }
    });
  }

  it('marks the glyph aria-hidden so a screen reader hears the word, not the shape', () => {
    const out = html(<HealthBadge status={statusFor('critical')} />);
    expect(out).toMatch(/aria-hidden="true"[^>]*>■/);
  });

  it('never emits a status element whose only content is a colour class', () => {
    for (const tone of Object.keys(STATUS_TONES) as StatusTone[]) {
      const out = text(<HealthBadge status={statusFor(tone)} />);
      expect(out.trim().length, tone).toBeGreaterThan(3);
    }
  });

  it('keeps the label when the badge is compact — compact shrinks padding, not meaning', () => {
    expect(text(<HealthBadge status={statusFor('caution')} compact />)).toContain('At risk');
  });

  it('carries a glyph and a label on trajectory and freshness too', () => {
    const traj = text(<TrajectoryIndicator trajectory={{ direction: 'deteriorating', glyph: '▼', label: 'Deteriorating', windowLabel: '6 wks' }} />);
    expect(traj).toContain('▼');
    expect(traj).toContain('Deteriorating');
    const fresh = text(<DataFreshnessIndicator freshness={FRESHNESS_DEGRADED} />);
    expect(fresh).toContain('Sources degraded');
    expect(fresh).toContain('Delivery tracker');
  });

  it('separates data confidence from health, so the two are not blended (PRODUCT_SPEC §3.4)', () => {
    const out = html(<ConfidenceBadge confidence={{ level: 'LOW', label: 'Low', rationale: 'Two sources stale.' }} />);
    expect(out).toContain('gl-chip-neutral');
    for (const ragClass of ['gl-status-positive', 'gl-status-caution', 'gl-status-critical']) {
      expect(out, `confidence must not borrow ${ragClass}`).not.toContain(ragClass);
    }
  });
});

// ---------------------------------------------------------------------------
// REQ-UX-004 — provenance is visually distinguishable
// ---------------------------------------------------------------------------

describe('provenance layers are distinguishable (REQ-UX-004, ADR-0004)', () => {
  it('gives each layer a different treatment class', () => {
    const fact = html(<ProvenanceValue treatment="fact">x</ProvenanceValue>);
    const computed = html(<ProvenanceValue treatment="computed">x</ProvenanceValue>);
    const inferred = html(<ProvenanceValue treatment="inferred">x</ProvenanceValue>);
    expect(fact).toContain('gl-prov-fact');
    expect(computed).toContain('gl-prov-computed');
    expect(inferred).toContain('gl-prov-inferred');
    expect(new Set([fact, computed, inferred]).size).toBe(3);
  });

  it('contains an inference in a block and labels it, so it cannot read as a fact', () => {
    const out = html(<ProvenanceValue treatment="inferred">estimate</ProvenanceValue>);
    expect(out).toContain('Inferred');
    expect(out.startsWith('<div')).toBe(true);
  });

  it('announces the layer to assistive technology, not only through styling', () => {
    expect(text(<ProvenanceValue treatment="computed">18.1%</ProvenanceValue>)).toContain('Derived metric');
  });

  it('always renders a forecast outlook as inferred with a stated confidence', () => {
    const out = html(<ForecastOutlook outlook={OUTLOOK} />);
    expect(out).toContain('gl-prov-inferred');
    expect(out).toContain('Medium confidence');
  });
});

// ---------------------------------------------------------------------------
// Authorization: a restricted field discloses nothing
// ---------------------------------------------------------------------------

describe('restricted fields disclose nothing (SECURITY_MODEL §4.5, ADR-0005 §4)', () => {
  it('renders a neutral chip with no value, no zero and no mask', () => {
    const out = text(<RestrictedValue />);
    expect(out).toContain('Restricted');
    expect(out).not.toContain('***');
    expect(out).not.toContain('0.00');
    expect(out).not.toContain('null');
  });

  it('shows a restricted KPI without hinting at magnitude or type', () => {
    const restricted = KPIS.find((k) => k.restricted === true);
    expect(restricted).toBeDefined();
    const out = text(<ExecutiveKpiCard kpi={restricted as never} />);
    expect(out).toContain('Restricted');
    expect(out).not.toMatch(/\$\d/);
    expect(out).not.toContain('—');
  });

  it('renders a restricted table cell the same way, with no placeholder value', () => {
    const out = html(<DataTable table={PORTFOLIO_TABLE} />);
    expect(out).toContain('gl-restricted');
    expect(out).not.toContain('*****');
  });
});

// ---------------------------------------------------------------------------
// REQ-UX-006 — tables and charts
// ---------------------------------------------------------------------------

describe('tables are semantic (REQ-UX-006)', () => {
  const out = html(<DataTable table={PORTFOLIO_TABLE} />);

  it('uses scoped column and row headers', () => {
    expect(out).toContain('scope="col"');
    expect(out).toContain('scope="row"');
  });

  it('exposes sort state through aria-sort rather than an arrow alone', () => {
    expect(out).toContain('aria-sort="descending"');
  });

  it('carries a caption even when it is visually hidden', () => {
    expect(out).toContain('<caption');
    expect(out).toContain(PORTFOLIO_TABLE.caption);
  });

  it('describes glyph-only or abbreviated headers for screen readers', () => {
    expect(out).toContain('Status reported by the delivery manager');
  });

  it('scrolls inside its own container rather than the page', () => {
    expect(out).toContain('gl-table-wrap');
  });
});

describe('every chart carries a text alternative and a data table (REQ-UX-006, §3.4)', () => {
  const charts: readonly (readonly [string, JSX.Element, string])[] = [
    ['trend', <TrendChart chart={TREND} />, TREND.textAlternative],
    ['waterfall', <Waterfall chart={WATERFALL} />, WATERFALL.textAlternative],
    ['bubble', <BubbleMatrix chart={BUBBLES} />, BUBBLES.textAlternative],
    ['burn', <ProgressBurnBars chart={BURN} />, BURN.textAlternative],
  ];

  for (const [name, element, alternative] of charts) {
    it(`${name} states its alternative text`, () => {
      expect(text(element)).toContain(alternative.slice(0, 60));
    });
  }

  it('gives the SVG charts an accessible name and hides the raw SVG from readers', () => {
    for (const element of [<TrendChart chart={TREND} />, <Waterfall chart={WATERFALL} />, <BubbleMatrix chart={BUBBLES} />]) {
      const out = html(element);
      expect(out).toContain('role="img"');
      expect(out).toContain('aria-label=');
      expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
    }
  });

  it('offers the data table to everyone, not only to assistive technology', () => {
    const out = html(<TrendChart chart={TREND} />);
    expect(out).toContain('Show data table');
    expect(out).toContain('<details');
    expect(out).toContain('<table');
  });

  it('marks projected segments as projected, not merely styled differently (§3.4)', () => {
    const out = html(<TrendChart chart={TREND} />);
    expect(out).toContain('gl-chart-forecast');
    expect(text(out === '' ? <span /> : <TrendChart chart={TREND} />)).toContain('Dashed = projected, not actual');
  });

  it('draws at most one emphasis mark on the triage matrix (§3.4, §8 prohibition 6)', () => {
    const out = html(<BubbleMatrix chart={BUBBLES} />);
    const emphasised = out.match(/gl-chart-emphasis/g) ?? [];
    expect(emphasised.length).toBeLessThanOrEqual(2); // the circle, plus its label element
    expect(BUBBLES.bubbles.filter((b) => b.emphasis === true).length).toBe(1);
  });

  it('shows the reconciliation claim on the margin bridge without recomputing it (AC-4)', () => {
    expect(text(<Waterfall chart={WATERFALL} />)).toContain('sum to the total delta to the cent');
  });
});

// ---------------------------------------------------------------------------
// REQ-UX-005 — the demo marker
// ---------------------------------------------------------------------------

describe('the DEMO — SYNTHETIC DATA marker (REQ-UX-005)', () => {
  it('renders the constant, not a hand-typed string', () => {
    expect(text(<DemoSyntheticDataBadge />)).toContain(DEMO_DATA_BANNER);
  });

  it('explains itself to assistive technology', () => {
    expect(html(<DemoSyntheticDataBadge />)).toContain('no real client, employee or financial data');
  });

  it('offers no way to dismiss it', () => {
    const out = html(<DemoSyntheticDataBadge />);
    // No control to close it, no `hidden` attribute, nothing display:none. `aria-hidden` on the
    // inner spans is the opposite concern — it stops a screen reader announcing the marker twice,
    // once from the aria-label and once from the visible text.
    expect(out).not.toContain('<button');
    expect(out).not.toMatch(/\shidden(?:=|\s|>)/);
    expect(out).not.toContain('display:none');
    expect(out).not.toContain('onClick');
  });

  it('appears on every shell-rendered page, twice — top bar and sidebar', () => {
    const out = html(shell(<p>content</p>));
    const occurrences = out.split(DEMO_DATA_BANNER).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

function shell(children: JSX.Element, capabilities?: readonly string[]): JSX.Element {
  return (
    <AppShell
      currentId="portfolio"
      pageTitle="Portfolio Command Center"
      scope={SCOPE}
      period={PERIOD}
      freshness={FRESHNESS_CURRENT}
      user={USER}
      {...(capabilities !== undefined ? { capabilities } : {})}
    >
      {children}
    </AppShell>
  );
}

describe('the application shell', () => {
  const out = html(shell(<p>content</p>));

  it('provides landmarks a keyboard user can move between', () => {
    expect(out).toContain('<nav');
    expect(out).toContain('aria-label="Primary"');
    expect(out).toContain('<main');
    expect(out).toContain('<header');
  });

  it('offers a skip link ahead of the navigation', () => {
    expect(out).toContain('gl-skip-link');
    expect(out.indexOf('gl-skip-link')).toBeLessThan(out.indexOf('<nav'));
    expect(out).toContain('Skip to content');
  });

  it('has exactly one h1, and it is the page title', () => {
    expect((out.match(/<h1/g) ?? []).length).toBe(1);
    expect(out).toContain('Portfolio Command Center');
  });

  it('marks the current destination with aria-current, not colour alone', () => {
    expect(out).toContain('aria-current="page"');
  });

  it('shows scope, period and freshness together — what every number on the page depends on', () => {
    expect(out).toContain('Scope:');
    expect(out).toContain('Period:');
    expect(out).toContain('as at 31 Aug 2026');
    expect(out).toContain('Data current');
  });

  it('uses a text wordmark and fabricates no logo asset (§1)', () => {
    expect(out).toContain('GlobalLogic');
    expect(out).toContain('Delivery Intelligence');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('logo');
  });

  it('applies the dark theme class to the sidebar so tokens resolve dark-correct', () => {
    expect(out).toMatch(/class="gl-sidebar gl-theme-dark"/);
  });

  it('shows planned destinations as disabled and labelled rather than hiding them', () => {
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('Planned');
    expect(out).toContain('Benchmarks');
  });

  /**
   * The security-critical assertion in this file. `SECURITY_MODEL.md` §12.1: the UI may hide a
   * control the caller cannot use, and that hiding is **never** the control. This test proves the
   * component treats capability as presentation only — the link is dimmed and untabbable, and
   * nothing about the page pretends to be an authorization decision.
   */
  it('treats a missing capability as presentation, never as authorization', () => {
    const restricted = html(shell(<p>content</p>, ['project.view']));
    expect(restricted).toContain('aria-disabled="true"');
    expect(restricted).toContain('not available to your role');
    // The destination is still declared — the server, not the sidebar, decides access.
    expect(restricted).toContain('Financial Intelligence');
  });
});

// ---------------------------------------------------------------------------
// States and evidence
// ---------------------------------------------------------------------------

describe('states', () => {
  it('renders empty without an error tone — nothing at risk is good news', () => {
    const out = html(<EmptyState state={{ title: 'Nothing at risk', body: 'No breach this period.' }} />);
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain('gl-status-critical');
  });

  it('announces loading politely and preserves layout with skeletons', () => {
    const out = html(<LoadingState />);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('gl-skeleton');
  });

  it('reports an error generically, with a correlation id and no internals', () => {
    const out = text(<ErrorState state={{ title: 'Could not load', body: 'Nothing has been changed.', correlationId: 'cor-8f31a2' }} />);
    expect(out).toContain('cor-8f31a2');
    expect(out).not.toMatch(/at [A-Za-z]+\.[a-z]+ \(/);
    expect(out).not.toContain('SELECT');
  });

  it('shows degraded data rather than hiding it, and names the affected sources', () => {
    const out = text(<DegradedState freshness={FRESHNESS_DEGRADED} />);
    expect(out).toContain('Delivery tracker');
    expect(out).toContain('Contract system');
    expect(html(<DegradedState freshness={FRESHNESS_DEGRADED} />)).toContain('role="status"');
  });
});

describe('evidence and divergence (AC-2, AC-3)', () => {
  it('reaches the evidence chain without leaving the page', () => {
    const evidence = KPIS[0]?.evidence;
    expect(evidence).toBeDefined();
    const out = text(<EvidenceDisclosure evidence={evidence as never} />);
    expect(out).toContain('Contract value (as-sold)');
    expect(out).toContain('FIN-v2.1');
    expect(out).toContain('Finance / ERP');
  });

  it('presents reported and assessed status side by side, neither styled as the winner', () => {
    const out = text(<StatusConflict conflict={CONFLICT} />);
    expect(out).toContain('Reported by Delivery Manager');
    expect(out).toContain('System-assessed');
    expect(out).toContain('Green');
    expect(out).toContain('Amber');
    expect(out).toContain('Reported ≠ Assessed');
  });

  it('labels an inferred insight even inside a callout', () => {
    const inferred = INSIGHTS.find((i) => i.treatment === 'inferred');
    expect(text(<InsightCallout insight={inferred as never} />)).toContain('Inferred');
  });

  it('requires an owner and a due date on an action card', () => {
    const out = text(<ExecutiveActionCard action={ACTIONS[0] as never} primary />);
    expect(out).toContain('Owner:');
    expect(out).toContain('Due:');
  });
});

// ---------------------------------------------------------------------------
// The prohibition that is easiest to break under deadline pressure
// ---------------------------------------------------------------------------

describe('orange is deliberate and scarce (§8 prohibition 6)', () => {
  it('renders at most one primary (orange) button in a full page of action cards', () => {
    const page = html(
      <>
        {ACTIONS.map((a, i) => <ExecutiveActionCard key={a.id} action={a} primary={i === 0} />)}
      </>,
    );
    expect((page.match(/gl-btn-primary/g) ?? []).length).toBe(1);
  });

  /**
   * The acceptance artefact itself, checked.
   *
   * The assertion above scopes to a list of action cards, which is where the rule is easiest to
   * break — and it passed while the gallery as a whole rendered **two** competing orange buttons,
   * because a second one lived in the page header. That is exactly the failure §8 prohibition 6
   * describes and exactly the kind a component-scoped test cannot see. So the built page is counted
   * too: whatever a reviewer opens at 1440x900 gets the same rule applied to it as a component does.
   */
  it('renders exactly one orange emphasis element across the whole component gallery', () => {
    const page = readFileSync('docs/design/component-gallery.html', 'utf8');
    const body = page.slice(page.indexOf('</style>'));
    expect((body.match(/gl-btn-primary/g) ?? []).length).toBe(1);
  });

  it('uses no orange class on status, confidence or trajectory', () => {
    const statusHtml = [
      html(<HealthBadge status={statusFor('caution')} />),
      html(<ConfidenceBadge confidence={{ level: 'LOW', label: 'Low', rationale: 'x' }} />),
      html(<TrajectoryIndicator trajectory={{ direction: 'deteriorating', glyph: '▼', label: 'Deteriorating', windowLabel: '6 wks' }} />),
    ].join('');
    expect(statusHtml).not.toContain('gl-action-primary');
    expect(statusHtml).not.toContain('gl-viz-emphasis');
  });
});
