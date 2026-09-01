/**
 * Forward Risk, Early Warning & Recovery — the intervention surface (Phase 10).
 *
 * **It introduces no visual convention and it computes nothing.** Every element is a Phase 6
 * primitive; every string arrives pre-formatted. A test greps this file for arithmetic and the
 * G-FLOAT gate over `src/presentation` would reject any.
 *
 * ### The seven questions, in order
 *
 * The acceptance gate is a set of seven questions, and the page is laid out as those questions
 * rather than as a tour of the model:
 *
 * | # | Question | Section |
 * | --- | --- | --- |
 * | 1 | *What will likely break first?* | Emerging signals, most severe first |
 * | 2 | *Why?* | Each signal's value against its threshold, with the rule that fired |
 * | 3 | *How much is at risk?* | The economic impact column, and recovery economics |
 * | 4 | *Where is it heading?* | The explainable outlook, with its derivation stated in full |
 * | 5 | *What should happen now?* | Recovery actions |
 * | 6 | *Who owns it, by when?* | Owner and due date on every action; assurance separately |
 * | 7 | *What value can be protected?* | Recovery case and probability-adjusted case |
 *
 * **The authority notice is rendered on every page, not in a footnote.** Nothing here mutates a
 * baseline, an ETC or an official band, and a surface that proposes interventions has to say so
 * where the reader will see it.
 */
import type { JSX } from 'react';
import type {
  ColumnViewModel, EvidenceViewModel, ForwardRiskView, InsightViewModel, ProvenanceTreatment,
  RowViewModel, TableViewModel,
} from '../index.js';
import { DataTable, EvidenceDisclosure, InsightCallout, Panel, RichText,
} from '../index.js';

type Evidence = ForwardRiskView['signalsEvidence'];

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

/** Every fired signal, with everything the brief asks each one to carry. */
export function signalTable(view: ForwardRiskView): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'signal', header: 'Signal', widthHint: '20%' },
    { key: 'current', header: 'Current', align: 'end' },
    { key: 'expected', header: 'Fires when', align: 'end' },
    { key: 'trend', header: 'Trend' },
    { key: 'severity', header: 'Severity', description: 'Distance past the threshold, as a multiple — comparable across signals in different units' },
    { key: 'impact', header: 'Economic impact', align: 'end' },
    { key: 'lifecycle', header: 'Lifecycle' },
    { key: 'owner', header: 'Owner' },
    { key: 'due', header: 'Due' },
    { key: 'rule', header: 'Rule / version' },
    { key: 'evidence', header: 'Evidence as at' },
  ];
  const rows: readonly RowViewModel[] = view.signals.map((s): RowViewModel => ({
    id: s.ruleId,
    cells: {
      signal: { display: s.name, emphasis: s.severity === 'SEVERE' },
      current: { display: s.currentValue, treatment: 'computed' },
      expected: { display: s.expectedState },
      trend: { display: s.trend },
      severity: { display: `${s.severity} — ${s.severityDetail}`, emphasis: s.severity === 'SEVERE' },
      impact: { display: s.economicImpact, treatment: 'computed' },
      lifecycle: { display: s.lifecycle },
      owner: { display: s.ownerActorId },
      due: { display: s.dueOn },
      rule: { display: `${s.ruleId} · ${s.ruleVersion}` },
      evidence: { display: s.evidenceAsOf },
    },
  }));
  return {
    caption: 'Emerging signals — each fired against a stated threshold, most severe first',
    summary: view.headline,
    density: 'compact',
    columns,
    rows,
  };
}

export function outlookTable(view: ForwardRiskView): TableViewModel {
  return {
    caption: 'Explainable outlook — rule outputs, not probabilities',
    summary: view.outlook.derivation,
    density: 'compact',
    columns: [
      { key: 'horizon', header: 'Horizon' },
      { key: 'band', header: 'Band' },
      { key: 'basis', header: 'How it is derived' },
    ],
    rows: view.outlook.rows.map((r): RowViewModel => ({
      id: r.horizon,
      cells: {
        horizon: { display: r.horizon },
        band: { display: r.band, treatment: 'inferred' },
        basis: { display: r.basis },
      },
    })),
  };
}

export function actionTable(view: ForwardRiskView): TableViewModel {
  return {
    caption: 'Recovery actions — delivery owns execution',
    summary: view.recoveryEconomics.doubleCountNarrative,
    density: 'compact',
    columns: [
      { key: 'issue', header: 'Issue' },
      { key: 'action', header: 'Recommended action', widthHint: '24%' },
      { key: 'why', header: 'Why it matters' },
      { key: 'owner', header: 'Owner' },
      { key: 'due', header: 'Due' },
      { key: 'gm', header: 'GM benefit', align: 'end' },
      { key: 'schedule', header: 'Schedule benefit', align: 'end' },
      { key: 'confidence', header: 'Confidence', align: 'end' },
      { key: 'status', header: 'Status' },
      { key: 'exec', header: 'Executive decision' },
    ],
    rows: view.recoveryActions.map((a): RowViewModel => ({
      id: a.id,
      cells: {
        issue: { display: a.issue },
        action: { display: a.recommendedAction },
        why: { display: a.whyItMatters },
        owner: { display: a.owner, emphasis: a.owner.startsWith('unowned') },
        due: { display: a.dueDate },
        gm: { display: a.gmBenefit, treatment: 'inferred' },
        schedule: { display: a.scheduleBenefit },
        confidence: { display: a.confidence },
        status: { display: a.status },
        exec: { display: a.executiveDecisionRequired ? 'required' : 'no' },
      },
    })),
  };
}

export interface ForwardRiskProps {
  readonly view: ForwardRiskView;
  /** `true` when the payload arrived without its commercial fields (SECURITY_MODEL.md §4.5). */
  readonly commercialRestricted: boolean;
}

export function ForwardRisk({ view, commercialRestricted }: ForwardRiskProps): JSX.Element {
  const insights: readonly InsightViewModel[] = [
    {
      id: 'headline',
      tone: view.signals.length === 0 ? 'positive' : 'caution',
      headline: 'What will break first',
      body: view.headline,
      treatment: 'inferred',
    },
    {
      id: 'authority',
      tone: 'analytic',
      headline: 'This page proposes; it does not decide',
      body: view.authorityNotice,
      treatment: 'computed',
    },
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
        {insights.map((i) => <InsightCallout key={i.id} insight={i} />)}
      </section>

      <Panel title="Emerging signals">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          {view.signals.length === 0 ? (
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>
              No early-warning rule is firing. The rules that were evaluated and stayed clear are
              listed below, so a reader can see what <em>was</em> checked rather than assuming
              silence means nothing was looked at.
            </p>
          ) : <DataTable table={signalTable(view)} />}
          <details>
            <summary className="gl-body-sm">{`${String(view.clearSignals.length)} rules evaluated clear`}</summary>
            <ul className="gl-stack" style={{ gap: '2px', margin: 'var(--gl-space-xs) 0 0', paddingLeft: '1.2em' }}>
              {view.clearSignals.map((c) => (
                <li key={c.ruleId} className="gl-body-sm">{c.ruleId} — {c.narrative}</li>
              ))}
            </ul>
          </details>
          {view.notEvaluated.length > 0 ? (
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-card-title">Could not be evaluated</span>
              <ul className="gl-stack" style={{ gap: '2px', margin: 0, paddingLeft: '1.2em' }}>
                {view.notEvaluated.map((n) => (
                  <li key={n.ruleId} className="gl-body-sm">{n.ruleId} — {n.reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <EvidenceDisclosure evidence={evidenceOf(view.signalsEvidence)} />
        </div>
      </Panel>

      <Panel title="Explainable outlook">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <DataTable table={outlookTable(view)} />
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.outlook.derivation} /></p>
          <EvidenceDisclosure evidence={evidenceOf(view.outlook.evidence)} />
        </div>
      </Panel>

      <Panel title="Recovery actions">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          {view.recoveryActions.length === 0 ? (
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>
              {view.recoveryEconomics.narrative}
            </p>
          ) : <DataTable table={actionTable(view)} />}
        </div>
      </Panel>

      <Panel title="Recovery economics">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          {commercialRestricted ? (
            <p className="gl-body-sm" style={{ margin: 0, maxWidth: '90ch' }}>
              <strong>Restricted.</strong> Recovery economics are commercial figures and were omitted
              from this payload by the server.
            </p>
          ) : (
            <>
              <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
                {([
                  ['Current forecast GM', view.recoveryEconomics.currentForecastGm, 'MET-FIN-014'],
                  ['Risk-adjusted GM', view.recoveryEconomics.riskAdjustedGm, 'MET-FIN-033'],
                  ['Recovery case GM', view.recoveryEconomics.recoveryCaseGm, 'MET-REC-001'],
                  ['Probability-adjusted GM', view.recoveryEconomics.probabilityAdjustedGm, 'MET-REC-002'],
                  ['Plan credibility', view.recoveryEconomics.planCredibility, 'MET-REC-003'],
                  ['Uplift', view.recoveryEconomics.upliftPoints, 'MET-REC-001'],
                ] as const).map(([label, value, metric]) => (
                  <div key={label} className="gl-stack" style={{ gap: '2px' }}>
                    <span className="gl-caption">{label}</span>
                    <span className="gl-numeric" style={{ fontWeight: 600 }}>{value}</span>
                    <span className="gl-caption">{metric}</span>
                  </div>
                ))}
              </div>
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.recoveryEconomics.narrative} /></p>
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.recoveryEconomics.doubleCountNarrative} /></p>
              <EvidenceDisclosure evidence={evidenceOf(view.recoveryEconomics.evidence)} />
            </>
          )}
        </div>
      </Panel>

      <div className="gl-grid">
        <div className="gl-col-6">
          <Panel title="Assurance follow-through">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.assurance.narrative} /></p>
              {view.assurance.exceptions.map((x) => (
                <div key={x.ruleId} className="gl-callout">
                  <span aria-hidden="true">■</span>
                  <div className="gl-stack" style={{ gap: '2px' }}>
                    <span className="gl-card-title">{x.name}</span>
                    <span className="gl-body-sm">{x.lifecycleDetail}</span>
                  </div>
                </div>
              ))}
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.assurance.ownershipNarrative} /></p>
              <EvidenceDisclosure evidence={evidenceOf(view.assurance.evidence)} />
            </div>
          </Panel>
        </div>
        <div className="gl-col-6">
          <Panel title="Intervention priority">
            <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
              <div className="gl-stack" style={{ gap: '2px' }}>
                <span className="gl-caption">Rank in your authorised scope</span>
                <span className="gl-h2 gl-numeric">{view.interventionPriority.rank}</span>
              </div>
              <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.interventionPriority.narrative} /></p>
              <p className="gl-caption" style={{ margin: 0 }}>Deciding tier: {view.interventionPriority.decidingTier}</p>
              <EvidenceDisclosure evidence={evidenceOf(view.interventionPriority.evidence)} />
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Late detection — the measure of this product">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          {/*
            The qualification comes **before** the number, not after it. A reader who sees "0.0%"
            and stops reading has taken away a conclusion the evidence does not support.
          */}
          {view.lateDetection.executiveAuthoritative ? null : (
            <InsightCallout insight={{
              id: 'late-detection-partial',
              tone: 'caution',
              headline: 'Partial history — this figure is not an executive conclusion',
              body: view.lateDetection.claimQualification,
              treatment: 'computed',
            }} />
          )}
          <div className="gl-stack" style={{ gap: '2px' }}>
            <span className="gl-caption">Projects reaching Red with no prior Amber or warning</span>
            <span className="gl-h2 gl-numeric">{view.lateDetection.rate}</span>
            <span className="gl-caption">
              {`Historical coverage: ${view.lateDetection.historicalCoverage} · reconstructed `}
              {view.lateDetection.reconstructedDimensions}
              {` · not reconstructable ${view.lateDetection.unavailableDimensions}`}
            </span>
          </div>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.lateDetection.detail} /></p>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.lateDetection.narrative} /></p>
          <EvidenceDisclosure evidence={evidenceOf(view.lateDetection.evidence)} />
        </div>
      </Panel>
    </div>
  );
}
