/**
 * Margin & Driver Intelligence — the economic diagnostic (Phase 9).
 *
 * **It introduces no visual convention and it computes nothing.** Every element is a Phase 6
 * primitive and every string arrives pre-formatted from `buildMarginIntelligence()`. The G-FLOAT
 * gate over `src/presentation` would reject arithmetic here, and a test greps this file for it.
 *
 * ### The five questions, in order
 *
 * The acceptance gate is a CFO or CDO answering five things. The page is laid out as those five
 * questions rather than as a tour of the data model:
 *
 * | # | Question | Section |
 * | --- | --- | --- |
 * | 1 | *How much margin has already gone?* | Core financials, then the bridge's opening and closing |
 * | 2 | *What destroyed it?* | The margin bridge waterfall, with each cause's basis on its face |
 * | 3 | *Is it still moving?* | GM/EAC trend, with the deterioration streak counted rather than eyeballed |
 * | 4 | *What more is at risk?* | Risk-adjusted economics, contingency, and the scenario set |
 * | 5 | *How credible is the forecast, and which lever recovers most?* | ETC credibility, driver economics, portfolio ranking |
 *
 * **Modelled causes are marked on the waterfall itself**, not in a footnote. A reader who cannot
 * tell an accounting figure from a modelling choice at a glance will quote the wrong one.
 */
import type { JSX } from 'react';
import type {
  ColumnViewModel, EvidenceViewModel, InsightViewModel, MarginIntelligenceView,
  ProvenanceTreatment, RowViewModel, TableViewModel, WaterfallViewModel,
} from '../index.js';
import {
  DataTable, EvidenceDisclosure, InsightCallout, Panel, Waterfall, RichText,
} from '../index.js';

type Evidence = MarginIntelligenceView['bridge']['evidence'];

const evidenceOf = (e: Evidence): EvidenceViewModel => ({
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

/** The bridge as a waterfall. Steps arrive signed and pre-formatted; nothing is recomputed. */
export function bridgeWaterfall(view: MarginIntelligenceView): WaterfallViewModel {
  return {
    title: 'As-sold gross margin to forecast gross margin (MET-FIN-018)',
    textAlternative:
      `Opening ${view.bridge.opening}. `
      + view.bridge.steps.map((s) => `${s.label} ${s.amount}`).join('; ')
      + `. Closing ${view.bridge.closing}. ${view.bridge.reconciliationNarrative}`,
    reconciliationNote: view.bridge.reconciliationNarrative,
    dataTable: bridgeTable(view),
    steps: [
      {
        label: 'Sold GM',
        amount: { value: view.bridge.openingValue, display: view.bridge.opening },
        kind: 'start' as const,
      },
      ...view.bridge.steps.map((s) => ({
        // The modelled marker rides on the label so it survives into the text alternative and the
        // data table, rather than living only in a colour a screen reader never sees.
        label: s.modelled ? `${s.label} (modelled)` : s.label,
        amount: { value: s.value, display: s.amount },
        kind: (s.value < 0 ? 'decrease' : 'increase') as 'decrease' | 'increase',
      })),
      {
        label: 'Forecast GM',
        amount: { value: view.bridge.closingValue, display: view.bridge.closing },
        kind: 'total' as const,
      },
    ],
  };
}

/** Every bridge cause with its metric, amount, basis and reason — the table behind the chart. */
export function bridgeTable(view: MarginIntelligenceView): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'cause', header: 'Cause', widthHint: '24%' },
    { key: 'metric', header: 'Metric' },
    { key: 'amount', header: 'Margin effect', align: 'end' },
    { key: 'basis', header: 'Basis', description: 'DERIVED is accounting over observed facts; MODELLED rests on a modelling choice; NOT_ATTRIBUTED is real but unmeasured' },
    { key: 'why', header: 'Why' },
  ];
  const rows: readonly RowViewModel[] = view.bridge.steps.map((s): RowViewModel => ({
    id: s.id,
    cells: {
      cause: { display: s.label },
      metric: { display: s.metricId ?? '—' },
      amount: { display: s.amount, emphasis: s.basis === 'RESIDUAL' },
      basis: { display: s.basis, emphasis: s.modelled },
      why: { display: s.explanation },
    },
  }));
  return {
    caption: 'The eight causes MET-FIN-018 registers, in order, summing exactly to MET-FIN-017',
    summary: view.bridge.reconciliationNarrative,
    density: 'compact',
    columns,
    rows,
  };
}

export function trendTable(view: MarginIntelligenceView): TableViewModel {
  return {
    caption: 'Forecast GM, risk-adjusted GM and EAC, recomputed at each period end',
    summary: view.trend.narrative,
    density: 'compact',
    columns: [
      { key: 'period', header: 'Period' },
      { key: 'fcst', header: 'Forecast GM', align: 'end' },
      { key: 'ra', header: 'Risk-adjusted GM', align: 'end' },
      { key: 'eac', header: 'EAC', align: 'end' },
      { key: 'move', header: 'Movement', align: 'end' },
      { key: 'note', header: 'Reason' },
    ],
    rows: view.trend.rows.map((r): RowViewModel => ({
      id: r.period,
      cells: {
        period: { display: r.period },
        fcst: { display: r.forecastGm, treatment: 'computed' },
        ra: { display: r.riskAdjustedGm, treatment: 'computed' },
        eac: { display: r.estimateAtCompletion, treatment: 'computed' },
        move: { display: r.movement },
        note: { display: r.note },
      },
    })),
  };
}

export function riskTable(view: MarginIntelligenceView): TableViewModel {
  return {
    caption: 'Open risks, and which of them the ETC already carries',
    summary: view.riskEconomics.doubleCountNarrative,
    density: 'compact',
    columns: [
      { key: 'risk', header: 'Risk', widthHint: '30%' },
      { key: 'severity', header: 'Severity' },
      { key: 'probability', header: 'Probability', align: 'end' },
      { key: 'impact', header: 'Cost impact', align: 'end' },
      { key: 'etc', header: 'In ETC?' },
      { key: 'incremental', header: 'Incremental exposure', align: 'end' },
    ],
    rows: view.riskEconomics.rows.map((r): RowViewModel => ({
      id: r.id,
      cells: {
        risk: { display: r.description },
        severity: { display: r.severity },
        probability: { display: r.probability },
        impact: { display: r.costImpact, treatment: 'fact' },
        etc: { display: r.includedInEtc },
        incremental: { display: r.incrementalExposure, treatment: 'computed' },
      },
    })),
  };
}

/** A labelled figure list where an uncomputable entry shows its reason in place of a value. */
function FigureList(
  { figures }: { readonly figures: MarginIntelligenceView['coreFinancials'] },
): JSX.Element {
  return (
    <div className="gl-grid">
      {figures.map((f) => (
        <div className="gl-col-3" key={f.metricId + f.label}>
          <div className="gl-stack" style={{ gap: '2px' }}>
            <span className="gl-caption">{f.label}</span>
            <span className="gl-numeric" style={{ fontWeight: 600 }}>
              {f.notComputableReason === undefined ? f.value : 'not computable'}
            </span>
            <span className="gl-caption">
              {f.notComputableReason ?? f.metricId}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function driverList(
  rows: MarginIntelligenceView['portfolio'] extends null ? never
    : NonNullable<MarginIntelligenceView['portfolio']>['topMarginLoss'],
): JSX.Element {
  return (
    <ol className="gl-stack" style={{ gap: 'var(--gl-space-xxs)', margin: 0, paddingLeft: '1.4em' }}>
      {rows.length === 0
        ? <li className="gl-body-sm">Nothing to rank — no project in scope carries this driver.</li>
        : rows.map((r) => (
          <li key={r.projectId} className="gl-body-sm">
            <strong className="gl-numeric">{r.amount}</strong> — {r.projectName}
          </li>
        ))}
    </ol>
  );
}

export interface MarginIntelligenceProps {
  readonly view: MarginIntelligenceView;
  /** `true` when the payload arrived without its commercial fields (SECURITY_MODEL.md §4.5). */
  readonly commercialRestricted: boolean;
}

export function MarginIntelligence(
  { view, commercialRestricted }: MarginIntelligenceProps,
): JSX.Element {
  if (commercialRestricted) {
    return (
      <Panel title="Margin & Driver Intelligence">
        <p className="gl-body-sm" style={{ margin: 0, maxWidth: '90ch' }}>
          <strong>Restricted.</strong> Every figure on this surface is commercial, so the server
          returned the page without them. Nothing is hidden here by the interface — the values are
          absent from the payload (SECURITY_MODEL.md §4.5).
        </p>
      </Panel>
    );
  }

  const summaryInsights: readonly InsightViewModel[] = [
    {
      id: 'reconciliation',
      tone: view.bridge.reconciles ? 'positive' : 'critical',
      headline: view.bridge.reconciles ? 'The bridge reconciles to the cent' : 'THE BRIDGE DOES NOT RECONCILE',
      body: view.bridge.reconciliationNarrative,
      treatment: 'computed',
    },
    {
      // Rendered beside the reconciliation claim, deliberately. "It adds up" and "it explains the
      // movement" are different statements, and only the first is guaranteed by construction.
      id: 'explanatory-coverage',
      tone: 'analytic',
      headline: `Attributed Movement Coverage ${view.bridge.explanatoryCoverage} of GROSS movement (${view.bridge.explanatoryCoverageMetricId})`,
      body: view.bridge.explanatoryCoverageNarrative,
      treatment: 'computed',
    },
    ...(view.contractLossWarning === null ? [] : [{
      id: 'contract-loss',
      tone: 'critical' as const,
      headline: 'Forecast contract loss',
      body: view.contractLossWarning,
      treatment: 'computed' as const,
    }]),
  ];

  return (
    <div className="gl-stack" style={{ gap: 'var(--gl-space-lg)' }}>
      <section className="gl-card gl-card-pad gl-stack" aria-label="Project identification">
        <div className="gl-row" style={{ gap: 'var(--gl-space-sm)', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="gl-h2">{view.projectName}</span>
          <span className="gl-caption">{view.customerAlias}</span>
          <span className="gl-caption" style={{ marginLeft: 'auto' }}>{view.demoMarker}</span>
        </div>
      </section>

      <section className="gl-stack" aria-label="Headline" style={{ gap: 'var(--gl-space-xs)' }}>
        {summaryInsights.map((i) => <InsightCallout key={i.id} insight={i} />)}
      </section>

      <Panel title="Core financials">
        <FigureList figures={view.coreFinancials} />
      </Panel>

      <Panel title="Margin bridge">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <Waterfall chart={bridgeWaterfall(view)} />
          <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
            <span className="gl-body-sm">{view.bridge.openingLabel} <strong className="gl-numeric">{view.bridge.opening}</strong></span>
            <span className="gl-body-sm">{view.bridge.closingLabel} <strong className="gl-numeric">{view.bridge.closing}</strong></span>
            <span className="gl-body-sm">{view.bridge.riskAdjustedLabel} <strong className="gl-numeric">{view.bridge.riskAdjusted}</strong></span>
            <span className="gl-body-sm">Attributed Movement Coverage <strong className="gl-numeric">{view.bridge.explanatoryCoverage}</strong> of <em>gross</em> movement</span>
          </div>
          {view.bridge.residualComponents.length > 0 ? (
            <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
              <span className="gl-card-title">Named components inside the residual</span>
              <p className="gl-caption" style={{ margin: 0, maxWidth: '96ch' }}>
                Not MET-FIN-018 causes — a breakdown of the eighth, so a large residual can be
                interrogated rather than shrugged at.
              </p>
              {view.bridge.residualComponents.map((c) => (
                <span key={c.id} className="gl-body-sm">
                  {c.label} <strong className="gl-numeric">{c.amount}</strong> — {c.explanation}
                </span>
              ))}
            </div>
          ) : null}
          <EvidenceDisclosure evidence={evidenceOf(view.bridge.evidence)} />
        </div>
      </Panel>

      <Panel title="Gross margin and EAC trend">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.trend.narrative} /></p>
          <DataTable table={trendTable(view)} />
          <EvidenceDisclosure evidence={evidenceOf(view.trend.evidence)} />
        </div>
      </Panel>

      <Panel title="Risk-adjusted economics">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <DataTable table={riskTable(view)} />
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.riskEconomics.doubleCountNarrative} /></p>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.riskEconomics.pendingCrNarrative} /></p>
          <EvidenceDisclosure evidence={evidenceOf(view.riskEconomics.evidence)} />
        </div>
      </Panel>

      <div className="gl-grid">
        <div className="gl-col-6">
          <Panel title="Contingency">
            <FigureList figures={view.contingency} />
          </Panel>
        </div>
        <div className="gl-col-6">
          <Panel title="ETC credibility">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
              <div className="gl-row" style={{ gap: 'var(--gl-space-md)', flexWrap: 'wrap' }}>
                <span className="gl-body-sm">Management EAC <strong className="gl-numeric">{view.etcCredibility.managementEac}</strong></span>
                <span className="gl-body-sm">Performance-implied <strong className="gl-numeric">{view.etcCredibility.performanceImpliedEac}</strong></span>
                <span className="gl-body-sm">Optimism gap <strong className="gl-numeric">{view.etcCredibility.optimismGap}</strong></span>
              </div>
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.etcCredibility.narrative} /></p>
              <EvidenceDisclosure evidence={evidenceOf(view.etcCredibility.evidence)} />
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Resource economics">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <FigureList figures={view.resourceEconomics} />
          {/*
            Staffing mix is PERSONAL_DATA, and **no role in this product holds it**. The field is
            therefore absent from every payload, and its absence is what the UI reads — never a flag
            carrying the withheld value (SECURITY_MODEL.md §4.5). Rendering the withholding is the
            point: a reader should see that a control fired, not an empty row.
          */}
          {view.seniorityMix === undefined || view.seniorityMix.length === 0 ? (
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>
              <strong>Staffing mix withheld.</strong> Seniority breakdown is classified
              PERSONAL_DATA and was omitted from this payload by the server. Blended rates and drift
              above are project-level aggregates and carry no individual&rsquo;s cost.
            </p>
          ) : (
            <div className="gl-row" style={{ gap: 'var(--gl-space-md)', flexWrap: 'wrap' }}>
              {view.seniorityMix.map((m) => (
                <span key={m.band} className="gl-body-sm">
                  {m.band} <strong className="gl-numeric">{m.people}</strong> ({m.fte} FTE)
                </span>
              ))}
            </div>
          )}
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.resourceNarrative} /></p>
        </div>
      </Panel>

      <div className="gl-grid">
        <div className="gl-col-6">
          <Panel title="Quality economics">
            <FigureList figures={view.qualityEconomics} />
          </Panel>
        </div>
        <div className="gl-col-6">
          <Panel title="Customer dependency economics">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
              <FigureList figures={view.dependencyEconomics} />
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.dependencyNarrative} /></p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Scenarios">
        <div className="gl-grid">
          {view.scenarios.map((s) => (
            <div className="gl-col-4" key={s.id}>
              <div className="gl-stack" style={{ gap: 'var(--gl-space-xs)' }}>
                <span className="gl-card-title">{s.name}</span>
                <span className="gl-h2 gl-numeric">{s.gmValue}</span>
                <span className="gl-caption"><RichText text={s.arithmetic} /></span>
                <ul className="gl-stack" style={{ gap: '2px', margin: 0, paddingLeft: '1.2em' }}>
                  {s.assumptions.map((a) => <li key={a} className="gl-body-sm">{a}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {view.portfolio !== null ? (
        <Panel title={`Portfolio drivers — ${view.portfolio.scope}`}>
          <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
            <p className="gl-caption" style={{ margin: 0 }}>
              Ranked by currency impact across the {String(view.portfolio.projectCount)} fixed-bid
              projects in your authorised set. Projects outside it are unreachable, not filtered.
            </p>
            <div className="gl-grid">
              <div className="gl-col-6">
                <span className="gl-card-title">Top margin loss</span>
                {driverList(view.portfolio.topMarginLoss)}
              </div>
              <div className="gl-col-6">
                <span className="gl-card-title">Top recoverable GM (scenario only)</span>
                {driverList(view.portfolio.topRecoverable)}
              </div>
              <div className="gl-col-6">
                <span className="gl-card-title">Largest scope leakage</span>
                {driverList(view.portfolio.largestScopeLeakage)}
              </div>
              <div className="gl-col-6">
                <span className="gl-card-title">Largest resource cost drift</span>
                {driverList(view.portfolio.largestResourceDrift)}
              </div>
            </div>
            <EvidenceDisclosure evidence={evidenceOf(view.portfolio.evidence)} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
