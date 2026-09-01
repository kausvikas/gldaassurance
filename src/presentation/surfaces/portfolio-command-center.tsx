/**
 * The Portfolio Command Center — the executive landing surface (Phase 7).
 *
 * **This file introduces no visual convention.** Every element is a Phase 6 primitive arranged on
 * the 12-column grid: `ExecutiveKpiCard`, `HealthBadge`, `TrajectoryIndicator`, `DataTable`,
 * `BubbleMatrix`, `InsightCallout`, `EvidenceDisclosure`, `Panel`. If a screen had needed a colour,
 * a spacing value or a status treatment the system does not have, that would have been a gap in the
 * *system* — and the fix would belong there, not here. It did not.
 *
 * **It computes nothing.** Everything arrives from `buildCommandCenter()` as pre-formatted strings.
 * The functions below map one DTO shape onto one view-model shape; there is no arithmetic in this
 * file, and the G-FLOAT and G-CLOCK gates over `src/presentation` would reject any.
 *
 * ### The thirty-second layout, and why it is in this order
 *
 * AC-1 gives a CDO thirty seconds to reach a named project. The page answers the six executive
 * questions top to bottom, in the order they are actually asked:
 *
 * | Reading order | Question answered | Element |
 * | --- | --- | --- |
 * | 1 | *What changed since I last looked?* | The insight strip — three deterministic, evidence-backed lines |
 * | 2 | *How large is the portfolio, and where is margin?* | KPI row 1 — TCV, sold GM, forecast GM, GM at risk |
 * | 3 | *How exposed am I, and how many are already bad?* | KPI row 2 — contract loss, Amber/Red, Green-at-Risk, uncommercialised scope |
 * | 4 | *Which Green projects are deteriorating?* | The signature Green-at-Risk panel, with drivers |
 * | 5 | *Where should I intervene first?* | The ranked table — **row 1 is the answer**, and it says why |
 * | 6 | *Where does risk cluster?* | The bubble matrix, for the shape of the portfolio |
 *
 * The ranked table is ordered by `MET-PORT-007` and **never alphabetically**. Rank 1 is the product's
 * answer to the question the page exists to answer, and every row carries the tier that put it above
 * the next one — because "trust the ranking" is not a thing an executive should be asked to do.
 */
import type { JSX } from 'react';
import type {
  BubbleDto, BubbleMatrixViewModel, CellViewModel, CommandCenterView, ColumnViewModel,
  DeltaViewModel, EvidenceViewModel, ExecutiveRowDto, FilterViewModel, InsightViewModel,
  KpiDto, KpiViewModel, ProvenanceTreatment, RowViewModel, StatusViewModel, TableViewModel,
  TrajectoryViewModel,
} from '../index.js';
import {
  BubbleMatrix, DataTable, EvidenceDisclosure, ExecutiveKpiCard, FilterBar, HealthBadge,
  InsightCallout, Panel, RAG_TONE, RestrictedValue, statusFor, RichText,
} from '../index.js';

// ---------------------------------------------------------------------------
// DTO → view model. Shape translation only; no arithmetic, no decisions.
// ---------------------------------------------------------------------------

const evidenceOf = (e: CommandCenterView['kpis'][number]['evidence']): EvidenceViewModel => ({
  title: e.title,
  ...(e.metricId !== undefined ? { metricId: e.metricId } : {}),
  ...(e.ruleVersion !== undefined ? { ruleVersion: e.ruleVersion } : {}),
  ...(e.computedAt !== undefined ? { computedAt: e.computedAt } : {}),
  lines: e.lines.map((l) => ({
    label: l.label,
    value: l.value,
    ...(l.treatment !== undefined ? { treatment: l.treatment as ProvenanceTreatment } : {}),
  })),
  sources: e.sources,
});

const deltaOf = (d: KpiDto['delta']): DeltaViewModel | undefined =>
  d === undefined ? undefined : {
    direction: d.direction,
    sentiment: d.sentiment,
    display: d.display,
    comparisonLabel: d.comparisonLabel,
  };

export function kpiViewModel(k: KpiDto): KpiViewModel {
  const delta = deltaOf(k.delta);
  return {
    id: k.id,
    label: k.label,
    value: k.display,
    treatment: k.treatment as ProvenanceTreatment,
    metricId: k.metricId,
    evidence: evidenceOf(k.evidence),
    ...(delta !== undefined ? { delta } : {}),
  };
}

const ragStatus = (band: string, label?: string): StatusViewModel =>
  statusFor(RAG_TONE[band as keyof typeof RAG_TONE] ?? 'neutral', label ?? band);

const TRAJECTORY_LABEL: Readonly<Record<string, TrajectoryViewModel['direction']>> = {
  IMPROVING: 'improving',
  STABLE: 'stable',
  DETERIORATING: 'deteriorating',
  RAPIDLY_DETERIORATING: 'deteriorating',
};

const trajectoryOf = (state: string): TrajectoryViewModel => ({
  direction: TRAJECTORY_LABEL[state] ?? 'unknown',
  glyph: '',
  label: state.toLowerCase().replace(/_/g, ' '),
  windowLabel: 'per signal policy',
});

/**
 * The executive table.
 *
 * Twenty-one columns is a lot, and it is close to the set the brief specifies — an executive table
 * is a working instrument, not a summary. It renders `compact`, scrolls inside its own container,
 * and the first column is the row header so a reader can re-anchor after scrolling sideways.
 *
 * Four go beyond the brief's seventeen, and each earns its width by removing an interaction AC-1
 * cannot afford: Reported and Assessed RAG are **separate** columns because collapsing them destroys
 * the product's central signal (§3.3); `Time to act` and `Rank conf.` are tiers 3 and 6 of the
 * ranking, already computed, and a reader who can see the order but not *how long they have* or
 * *how much to trust it* has to ask a second question; `Recovery` is tier 5, and its honest value
 * across the demo portfolio is "Not assessed" — see DR-049.
 *
 * **`sort: 'descending'` on Executive priority is not a UI sort.** It reports the order the service
 * returned. Sorting a hundred rows in the browser would sort the page, not the portfolio — a wrong
 * answer delivered confidently (ADR-0020 D-4).
 */
export function executiveTable(view: CommandCenterView, restricted: boolean): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'project', header: 'Project', widthHint: '18%', sort: 'descending', description: 'Ordered by MET-PORT-007 executive intervention priority, not alphabetically' },
    { key: 'industry', header: 'Industry' },
    { key: 'region', header: 'Region' },
    { key: 'tcv', header: 'TCV', align: 'end' },
    { key: 'soldGm', header: 'Sold GM %', align: 'end' },
    { key: 'forecastGm', header: 'Forecast GM %', align: 'end' },
    { key: 'riskAdjGm', header: 'Risk-adj GM %', align: 'end' },
    { key: 'gmVar', header: 'GM VaR', align: 'end' },
    { key: 'progressVariance', header: 'Progress var.', align: 'end' },
    { key: 'burnGap', header: 'Burn gap', align: 'end' },
    { key: 'scopeExposure', header: 'Uncomm. scope', align: 'end' },
    { key: 'reported', header: 'Reported', description: 'Reported RAG — the management declaration, never overwritten' },
    { key: 'health', header: 'Assessed', description: 'System-Assessed RAG — what the evidence supports' },
    { key: 'trajectory', header: 'Trajectory' },
    { key: 'outlook30', header: '30-day' },
    { key: 'outlook60', header: '60-day' },
    { key: 'clock', header: 'Time to act', description: 'MET-PORT-007 tier 3 — weeks to the nearest irreversible point. "No clock known" and "now" are different statements' },
    { key: 'confidence', header: 'Forecast conf.' },
    { key: 'rankConf', header: 'Rank conf.', description: 'MET-PORT-007 tier 6 — how much the ranking itself can be trusted. Qualifies the order; never blended into it' },
    { key: 'action', header: 'Executive action' },
    { key: 'recovery', header: 'Recovery', description: 'Evidence of a credible intervention (MET-PORT-007 tier 5). Never inferred from severity' },
  ];

  const money = (display: string): CellViewModel =>
    restricted ? { restricted: true } : { display, treatment: 'computed' };

  const rows: readonly RowViewModel[] = view.ranked.map((r): RowViewModel => ({
    id: r.projectId,
    href: `/projects/${r.projectId}`,
    cells: {
      project: { display: `${String(r.rank)}. ${r.name}`, emphasis: r.rank === 1 },
      industry: { display: r.industry },
      region: { display: r.region },
      tcv: money(r.tcv),
      soldGm: money(r.soldGmPercent),
      forecastGm: money(r.forecastGmPercent),
      riskAdjGm: money(r.riskAdjustedGmPercent),
      gmVar: money(r.gmValueAtRisk),
      progressVariance: { display: r.progressVariance, treatment: 'computed' },
      burnGap: { display: r.burnGap, treatment: 'computed' },
      scopeExposure: money(r.uncommercialisedExposure),
      reported: { status: ragStatus(r.reportedRag, r.reportedRag === 'Not reported' ? 'Not reported' : r.reportedRag) },
      health: { status: ragStatus(r.systemAssessedRag) },
      trajectory: { trajectory: trajectoryOf(r.trajectory) },
      outlook30: { status: ragStatus(r.outlook30) },
      outlook60: { status: ragStatus(r.outlook60) },
      clock: { display: r.timeCriticality },
      confidence: { display: r.forecastConfidence },
      rankConf: { display: r.rankConfidence },
      action: { display: r.executiveAction, emphasis: r.rank === 1 },
      recovery: { display: r.actionability === 'NOT_ASSESSED' ? 'Not assessed' : r.actionability },
    },
  }));

  return {
    caption: 'Projects in your authorised scope, ordered by executive intervention priority (MET-PORT-007)',
    summary:
      `${String(view.ranked.length)} of ${String(view.projectCount)} projects ranked · ordered by `
      + 'intervention priority, not alphabetically'
      + (view.insufficientEvidence.length > 0
        ? ` · ${String(view.insufficientEvidence.length)} listed separately for insufficient evidence`
        : ''),
    density: 'compact',
    columns,
    rows,
  };
}

/**
 * The bubble matrix: financial risk against delivery risk, sized by TCV.
 *
 * Health is carried by the bubble's **status** (shape + word in the data table), never by fill alone
 * — §3.2 forbids colour-only status, and a matrix is exactly where that rule gets forgotten. The
 * accompanying data table is required by the chart view model, so the picture is never the only way
 * to read it.
 */
export function bubbleMatrix(view: CommandCenterView, restricted: boolean): BubbleMatrixViewModel {
  const bubbles = view.bubbles.map((b: BubbleDto) => ({
    id: b.projectId,
    label: b.name,
    x: { value: b.financialRisk.value, display: b.financialRisk.display },
    y: { value: b.deliveryRisk.value, display: b.deliveryRisk.display },
    size: { value: b.tcv.value, display: b.tcv.display },
    status: ragStatus(b.systemAssessedRag),
    ...(b.emphasis ? { emphasis: true } : {}),
  }));

  const dataTable: TableViewModel = {
    caption: 'Portfolio risk matrix data',
    density: 'compact',
    columns: [
      { key: 'project', header: 'Project' },
      { key: 'tcv', header: 'TCV', align: 'end' },
      { key: 'soldGm', header: 'Sold GM %', align: 'end' },
      { key: 'forecastGm', header: 'Forecast GM %', align: 'end' },
      { key: 'gmVar', header: 'GM VaR', align: 'end' },
      { key: 'health', header: 'Assessed' },
      { key: 'trajectory', header: 'Trajectory' },
      { key: 'outlook30', header: '30-day outlook' },
      { key: 'driver', header: 'Top driver' },
    ],
    rows: view.bubbles.map((b): RowViewModel => ({
      id: b.projectId,
      cells: {
        project: { display: b.name },
        tcv: restricted ? { restricted: true } : { display: b.tcv.display },
        soldGm: restricted ? { restricted: true } : { display: b.soldGmPercent },
        forecastGm: restricted ? { restricted: true } : { display: b.forecastGmPercent },
        gmVar: restricted ? { restricted: true } : { display: b.gmValueAtRisk },
        health: { status: ragStatus(b.systemAssessedRag) },
        trajectory: { trajectory: trajectoryOf(b.trajectory) },
        outlook30: { status: ragStatus(b.outlook30) },
        driver: { display: b.topDriver.toLowerCase().replace(/_/g, ' ') },
      },
    })),
  };

  return {
    title: 'Portfolio risk matrix',
    xAxisLabel: 'Financial risk →',
    yAxisLabel: 'Delivery risk →',
    sizeLabel: 'Bubble size = TCV',
    textAlternative:
      `${String(view.bubbles.length)} projects plotted by financial risk against delivery risk, sized `
      + 'by contract value. Health is shown as a status in the accompanying data table, not by colour '
      + 'alone. The highlighted bubble is the top-ranked intervention candidate.',
    bubbles,
    dataTable,
  };
}

const insightOf = (n: CommandCenterView['whatChanged'][number]): InsightViewModel => ({
  id: n.id,
  tone: n.tone,
  headline: n.headline,
  body: n.body,
  treatment: n.treatment as ProvenanceTreatment,
  evidence: evidenceOf(n.evidence),
});

const filterOf = (f: CommandCenterView['filters'][number]): FilterViewModel => ({
  id: f.id,
  label: f.label,
  selected: f.options[0]?.value ?? 'all',
  options: f.options.map((o) => ({
    value: o.value,
    label: o.label,
    count: String(o.count),
  })),
});

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export interface PortfolioCommandCenterProps {
  readonly view: CommandCenterView;
  /**
   * `true` when the caller's payload arrived without its commercial fields.
   *
   * The UI learns this from a field being **absent**, never from a flag carrying the withheld value
   * (`SECURITY_MODEL.md` §4.5). Hiding is not the control — the server already removed them; this
   * only decides whether to render a neutral "Restricted" chip in the space they would have taken.
   */
  readonly commercialRestricted: boolean;
}

export function PortfolioCommandCenter(
  { view, commercialRestricted }: PortfolioCommandCenterProps,
): JSX.Element {
  const gar = view.greenAtRisk;
  return (
    <div className="gl-stack" style={{ gap: 'var(--gl-space-lg)' }}>

      {/*
        0 — the population, stated before any number.

        Every figure below is a fixed-bid figure. A reader who is told "91 projects" by their
        authorised scope and shown a total covering 75 of them cannot reconcile the two, and will
        reasonably conclude one of them is wrong. So the surface says which population it is
        reporting on, and what it left out, before it says anything else.
      */}
      <p className="gl-caption" style={{ margin: 0 }} data-testid="population-scope">
        {`${view.populationLabel} portfolio · ${String(view.projectCount)} of `
          + `${String(view.authorisedUniverseCount)} projects in your authorised scope`}
        {view.excludedFromPopulation.length > 0
          ? ` · excluded: ${view.excludedFromPopulation
              .map((e) => `${String(e.count)} ${e.engagementModel}`).join(', ')}`
          : ' · nothing excluded'}
      </p>

      {/* 1 — what changed. Deterministic, evidence-backed, three lines at most. */}
      <section className="gl-stack" aria-label="What changed" style={{ gap: 'var(--gl-space-xs)' }}>
        {view.whatChanged.slice(0, 3).map((n) => (
          <InsightCallout key={n.id} insight={insightOf(n)} />
        ))}
      </section>

      {/* 2 & 3 — eight KPIs, two rows of four. Never nine. */}
      <section aria-label="Portfolio key figures">
        <div className="gl-grid">
          {view.kpis.map((k) => (
            <div className="gl-col-3" key={k.id}>
              {commercialRestricted && k.treatment === 'computed' && k.display.includes('$')
                ? (
                  <div className="gl-card gl-card-pad gl-kpi">
                    <span className="gl-eyebrow">{k.label}</span>
                    <div style={{ paddingBlock: 'var(--gl-space-xs)' }}><RestrictedValue /></div>
                    <span className="gl-caption">{k.metricId}</span>
                  </div>
                )
                : <ExecutiveKpiCard kpi={kpiViewModel(k)} />}
            </div>
          ))}
        </div>
      </section>

      {/* 4 — the signature Green-at-Risk panel. */}
      <section className="gl-card gl-card-pad gl-stack" aria-labelledby="gar-title">
        <div className="gl-row" style={{ justifyContent: 'space-between' }}>
          <span className="gl-h2" id="gar-title">Green-at-Risk</span>
          <span className="gl-row">
            <span className="gl-chip gl-chip-analytic">
              <span className="gl-chip-glyph" aria-hidden="true">◈</span>
              <span>MET-FCST-025 · inferred</span>
            </span>
          </span>
        </div>

        <p className="gl-body-sm" style={{ margin: 0, maxWidth: '86ch' }}>
          Projects the <strong>system</strong> assesses GREEN today whose approved 30- or 60-day
          outlook is Amber or Red. Reported Green Risk — projects the <strong>organisation</strong>
          {' '}still reports Green while the evidence disagrees — is a separate finding and is counted
          separately below.
        </p>

        <div className="gl-grid">
          <div className="gl-col-3">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
              <span className="gl-eyebrow">System Green-at-Risk</span>
              <span className="gl-kpi-value gl-kpi-value-sm">{String(gar.systemGreenAtRiskCount)}</span>
              <span className="gl-caption">projects · MET-FCST-025</span>
            </div>
          </div>
          <div className="gl-col-3">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
              <span className="gl-eyebrow">Contract value</span>
              <span className="gl-kpi-value gl-kpi-value-sm">
                {commercialRestricted ? '' : gar.contractValue}
              </span>
              {commercialRestricted ? <RestrictedValue /> : <span className="gl-caption">TCV at stake</span>}
            </div>
          </div>
          <div className="gl-col-3">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
              <span className="gl-eyebrow">GM value at risk</span>
              <span className="gl-kpi-value gl-kpi-value-sm">
                {commercialRestricted ? '' : gar.gmValueAtRisk}
              </span>
              {commercialRestricted ? <RestrictedValue /> : <span className="gl-caption">MET-FIN-019</span>}
            </div>
          </div>
          <div className="gl-col-3">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
              <span className="gl-eyebrow">Reported Green Risk</span>
              <span className="gl-kpi-value gl-kpi-value-sm">{String(gar.reportedGreenRiskCount)}</span>
              <span className="gl-caption">reported Green, evidence disagrees · MET-HLTH-033</span>
            </div>
          </div>
        </div>

        <div className="gl-stack" style={{ gap: 'var(--gl-space-xs)' }}>
          <span className="gl-eyebrow">Top deterioration drivers</span>
          {gar.drivers.length === 0
            ? (
              <p className="gl-body-sm" style={{ margin: 0 }}>
                No signal-level driver cleared its threshold on these projects. The finding rests on
                the forward outlook, which carries its own evidence.
              </p>
            )
            : gar.drivers.map((d) => (
              <div className="gl-callout gl-callout-caution" key={d.code}>
                <span aria-hidden="true">▲</span>
                <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
                  <span className="gl-body-sm" style={{ fontWeight: 600 }}>
                    {d.code.toLowerCase().replace(/_/g, ' ')}
                    <span className="gl-caption">{` · ${d.metricId}`}</span>
                  </span>
                  <span className="gl-body-sm"><RichText text={d.narrative} /></span>
                  <a className="gl-caption" href={`/projects?filter.driver=${d.code}`}>
                    {`Show the ${String(d.projectCount)} affected project${d.projectCount === 1 ? '' : 's'} →`}
                  </a>
                </div>
              </div>
            ))}
        </div>

        <div className="gl-row">
          <a className="gl-btn gl-btn-primary" href="/projects?filter.green-at-risk=yes">
            {`Show ${String(gar.systemGreenAtRiskCount)} Green-at-Risk project${gar.systemGreenAtRiskCount === 1 ? '' : 's'}`}
          </a>
          <a className="gl-btn" href="/projects?filter.reported-green-risk=yes">
            Show Reported Green Risk
          </a>
          <EvidenceDisclosure evidence={evidenceOf(gar.evidence)} label="Evidence" />
        </div>
      </section>

      {/* 5 — the ranked table. Row 1 is the answer to "where do I intervene first?" */}
      <Panel
        title="Where to intervene first"
        labelledById="ranked-title"
        actions={<FilterBar filters={view.filters.slice(0, 5).map(filterOf)} />}
      >
        <div className="gl-stack">
          <p className="gl-caption" style={{ margin: 0, maxWidth: '90ch' }}>
            Ordered by <strong>MET-PORT-007</strong> — a lexicographic ordering over seven declared
            tiers, not a weighted score. Rank 1 outranks rank 2 for a stated reason, shown below.
          </p>
          {view.ranked[0] !== undefined ? <TopIntervention row={view.ranked[0]} /> : null}
          <DataTable table={executiveTable(view, commercialRestricted)} pinFirstColumn />
          {view.insufficientEvidence.length > 0
            ? (
              <div className="gl-callout">
                <span aria-hidden="true">◌</span>
                <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
                  <span className="gl-card-title">Listed separately — insufficient evidence</span>
                  <p className="gl-body-sm" style={{ margin: 0 }}>
                    {`${String(view.insufficientEvidence.length)} project(s) could not be placed in the ordering and are not ranked last. An unmeasured project is not a safe one.`}
                  </p>
                </div>
              </div>
            )
            : null}
        </div>
      </Panel>

      {/* 6 — the shape of the portfolio. */}
      <Panel title="Portfolio risk matrix" labelledById="matrix-title">
        <BubbleMatrix chart={bubbleMatrix(view, commercialRestricted)} />
      </Panel>
    </div>
  );
}

/**
 * Rank 1, stated as a sentence.
 *
 * The single most valuable element on the page: it answers *"where do I intervene first?"* without
 * the reader parsing a table, and it says **why** — the tier that decided it — so the ranking is
 * arguable rather than merely asserted.
 */
function TopIntervention({ row }: { readonly row: ExecutiveRowDto }): JSX.Element {
  return (
    <div className="gl-callout gl-callout-critical">
      <span aria-hidden="true">■</span>
      <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
        <div className="gl-row">
          <span className="gl-card-title">{`Intervene first: ${row.name}`}</span>
          <HealthBadge status={ragStatus(row.systemAssessedRag)} compact />
          <span className="gl-chip gl-chip-neutral">{row.executiveAction}</span>
        </div>
        <p className="gl-body-sm" style={{ margin: 0 }}><RichText text={row.rankNarrative} /></p>
        {row.outranksBecause === ''
          ? null
          : (
            <p className="gl-body-sm" style={{ margin: 0 }}>
              <strong>Outranks the next project because</strong>
              {` ${row.outranksBecause}.`}
            </p>
          )}
        <a className="gl-caption" href={`/projects/${row.projectId}`}>
          Open Project Executive Health →
        </a>
      </div>
    </div>
  );
}
