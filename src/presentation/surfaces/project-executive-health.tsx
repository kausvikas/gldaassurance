/**
 * Project Executive Health — the one-project executive review (Phase 8).
 *
 * **It introduces no visual convention and it computes nothing.** Every element is a Phase 6
 * primitive; every string arrives pre-formatted from `buildProjectExecutiveHealth()`. The G-FLOAT
 * and G-CLOCK gates over `src/presentation` would reject arithmetic here, and a test greps this file
 * for coercion, operators and `toFixed` — but the real reason is `PRODUCT_SPEC.md` §8: a metric
 * computed in a component is a defect, because it becomes a second implementation nobody diffs
 * against the first.
 *
 * ### The three-to-five minute layout, and why it is in this order
 *
 * The acceptance gate is a Global Delivery Head completing a meaningful review in three to five
 * minutes **and challenging an unsupported Green with evidence**. That second half drives the
 * ordering more than the first: a reviewer cannot challenge what they cannot see the basis of, so
 * every section that states a verdict is immediately followed by what produced it.
 *
 * | Reading order | Question | Section |
 * | --- | --- | --- |
 * | 1 | *What am I looking at?* | Header — project, alias, contract type, TCV, committed dates |
 * | 2 | *What is the verdict?* | Six primary outputs, each labelled with its epistemic layer |
 * | 3 | *Do I believe it?* | The status conflict — reported vs assessed vs override, with the rules that fired |
 * | 4 | *What is the summary I can quote?* | STATUS / CAUSE / OUTLOOK / IMPACT / ACTION, generated deterministically |
 * | 5 | *Where is it coming from?* | The four health dimensions, each with score, weight, contribution and inputs |
 * | 6 | *Are we delivering what we sold?* | Commitment comparison — as-sold, current contract, current forecast |
 * | 7 | *What are the economics?* | Financial strip, progress/burn, ETC credibility |
 * | 8 | *What is the schedule position?* | Milestones — last critical, next critical, hit rate |
 * | 9 | *What is leaking?* | Scope/commercial and quality signals |
 * | 10 | *Can I trust any of this?* | Data and assurance confidence — **and the Green claim rule** |
 *
 * Section 10 is deliberately last and deliberately unmissable. `PRODUCT_SPEC.md` §3.4 keeps data
 * confidence *beside* health rather than inside it, which means a page can show a confident-looking
 * Green resting on stale evidence unless something says so out loud. This one says so.
 */
import type { JSX } from 'react';
import type {
  CellViewModel, ColumnViewModel, ConfidenceViewModel, EvidenceViewModel, InsightViewModel,
  ProjectExecutiveHealthView, ProvenanceTreatment, RowViewModel, StatusConflictViewModel,
  StatusViewModel, TableViewModel, TrajectoryViewModel,
} from '../index.js';
import {
  ConfidenceBadge, DataTable, EvidenceDisclosure, HealthBadge, InsightCallout, Panel,
  ProgressBurnBars, RAG_TONE, StatusConflict, TrajectoryIndicator, statusFor, RichText,
} from '../index.js';

type Evidence = ProjectExecutiveHealthView['verdicts'][number]['evidence'];

// ---------------------------------------------------------------------------
// DTO → view model. Shape translation only.
// ---------------------------------------------------------------------------

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

const ragStatus = (rag: string, detail?: string): StatusViewModel => {
  const tone = RAG_TONE[rag as 'GREEN' | 'AMBER' | 'RED'] ?? RAG_TONE.UNKNOWN;
  return statusFor(tone, rag, detail);
};

const trajectoryOf = (state: string): TrajectoryViewModel => {
  const direction = state.includes('DETERIORAT')
    ? 'deteriorating'
    : state === 'IMPROVING' ? 'improving' : 'stable';
  return {
    direction,
    glyph: direction === 'deteriorating' ? '▼' : direction === 'improving' ? '▲' : '▬',
    label: state.toLowerCase().replace(/_/g, ' '),
    windowLabel: 'per signal policy',
  };
};

const confidenceOf = (band: string, rationale: string): ConfidenceViewModel => ({
  level: (band === 'HIGH' || band === 'MEDIUM' || band === 'LOW') ? band : 'LOW',
  label: band,
  rationale,
});

/**
 * The commitment comparison, as a four-column table.
 *
 * Deliberately **not** the `MetricComparison` primitive: that component compares two periods, and
 * this compares three baselines (ADR-0003). Bending a two-column component to hold three would have
 * meant dropping a column, and the middle one — what the contract says *now* — is exactly where
 * scope leakage becomes visible.
 */
export function commitmentTable(view: ProjectExecutiveHealthView): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'metric', header: 'Commitment', widthHint: '30%' },
    { key: 'sold', header: 'Original sold', align: 'end', description: 'The as-sold baseline, immutable once written (ADR-0003 §1)' },
    { key: 'contract', header: 'Current contract', align: 'end', description: 'The as-sold baseline plus every executed change' },
    { key: 'forecast', header: 'Current / forecast', align: 'end', description: 'What the evidence now says will happen' },
    { key: 'variance', header: 'Variance', align: 'end' },
  ];
  const rows: readonly RowViewModel[] = view.commitment.map((r): RowViewModel => ({
    id: r.label,
    cells: {
      metric: { display: r.label },
      sold: { display: r.originalSold, treatment: r.treatment as ProvenanceTreatment },
      contract: { display: r.currentContract, treatment: r.treatment as ProvenanceTreatment },
      forecast: { display: r.currentForecast, treatment: r.treatment as ProvenanceTreatment },
      variance: {
        display: r.variance,
        emphasis: r.sentiment === 'negative',
      } as CellViewModel,
    },
  }));
  return {
    caption: 'What we sold, what the contract now says, and what we now expect',
    summary: 'Three baselines side by side. A gap between the first two is commercial change; a gap '
      + 'between the last two is delivery risk.',
    density: 'compact',
    columns,
    rows,
  };
}

/** The four health dimensions, with the inputs that produced each score. */
export function dimensionTable(view: ProjectExecutiveHealthView): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'dimension', header: 'Dimension', widthHint: '26%' },
    { key: 'metric', header: 'Metric' },
    { key: 'weight', header: 'Weight', align: 'end' },
    { key: 'score', header: 'Score', align: 'end', description: '0–100, or the stated reason there is none' },
    { key: 'contribution', header: 'Contribution', align: 'end', description: 'Points this dimension put into the composite' },
    { key: 'inputs', header: 'Inputs' },
  ];
  const rows: readonly RowViewModel[] = view.dimensions.map((d): RowViewModel => ({
    id: d.id,
    cells: {
      dimension: { display: d.name, emphasis: !d.computable },
      metric: { display: d.metricId },
      weight: { display: d.weight },
      score: {
        display: d.computable ? d.score : 'not computable',
        treatment: 'computed',
      },
      contribution: { display: d.contribution, treatment: 'computed' },
      inputs: {
        display: d.computable
          ? d.inputs.map((i) => `${i.label} ${i.observed}`).join(' · ')
          : (d.notComputableReason ?? 'no reason given'),
      },
    },
  }));
  return {
    caption: 'The four HEALTH-v2 executive dimensions (ADR-0015 D-1)',
    summary: `${String(view.dimensions.filter((d) => d.computable).length)} of `
      + `${String(view.dimensions.length)} dimensions scored. A dimension carried by fewer than half `
      + 'its inputs is not reported, and says why.',
    density: 'compact',
    columns,
    rows,
  };
}

/** Every milestone, so a reviewer can check the two headline ones against the set. */
export function milestoneTable(view: ProjectExecutiveHealthView): TableViewModel {
  const columns: readonly ColumnViewModel[] = [
    { key: 'name', header: 'Milestone', widthHint: '30%' },
    { key: 'baseline', header: 'Baseline', align: 'end' },
    { key: 'forecast', header: 'Forecast', align: 'end' },
    { key: 'actual', header: 'Actual', align: 'end' },
    { key: 'slip', header: 'Slip', align: 'end' },
    { key: 'gating', header: 'Payment-gating' },
    { key: 'state', header: 'State' },
  ];
  const rows: readonly RowViewModel[] = view.milestones.all.map((m): RowViewModel => ({
    id: `${m.name}-${m.baselineDate}`,
    cells: {
      name: { display: m.name },
      baseline: { display: m.baselineDate },
      forecast: { display: m.forecastDate },
      actual: { display: m.actualDate },
      slip: { display: m.slip, emphasis: m.state === 'at risk' || m.state === 'delivered late' },
      gating: { display: m.paymentGating ? 'yes' : 'no' },
      state: { display: m.state },
    },
  }));
  return {
    caption: 'Milestones — a payment-gating milestone turns schedule slip into a cash event',
    summary: `${String(view.milestones.all.length)} milestones recorded`,
    density: 'compact',
    columns,
    rows,
  };
}

/** A signal list where an uncomputable entry shows its reason in place of a value. */
function SignalList(
  { lines }: { readonly lines: ProjectExecutiveHealthView['quality'] },
): JSX.Element {
  return (
    <dl className="gl-stack" style={{ gap: 'var(--gl-space-xs)', margin: 0 }}>
      {lines.map((l) => (
        <div key={l.metricId + l.label} className="gl-row" style={{ gap: 'var(--gl-space-sm)', alignItems: 'baseline' }}>
          <dt className="gl-body-sm" style={{ minWidth: '22ch' }}>{l.label}</dt>
          <dd className="gl-numeric" style={{ margin: 0, fontWeight: 500 }}>
            {l.notComputableReason === undefined
              ? l.value
              : <span className="gl-caption">{l.notComputableReason}</span>}
          </dd>
          <dd className="gl-caption" style={{ margin: 0, marginLeft: 'auto' }}>{l.metricId}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export interface ProjectExecutiveHealthProps {
  readonly view: ProjectExecutiveHealthView;
  /**
   * `true` when the caller's payload arrived without its commercial fields.
   *
   * The UI learns this from a field being **absent**, never from a flag carrying the withheld value
   * (`SECURITY_MODEL.md` §4.5). Hiding is not the control — the server already removed them.
   */
  readonly commercialRestricted: boolean;
}

export function ProjectExecutiveHealth(
  { view, commercialRestricted }: ProjectExecutiveHealthProps,
): JSX.Element {
  const h = view.header;
  const conflict: StatusConflictViewModel = {
    reported: ragStatus(view.statusConflict.reportedRag),
    assessed: ragStatus(view.statusConflict.systemAssessedRag),
    reportedBy: 'delivery management',
    divergenceSummary: view.statusConflict.narrative,
    evidence: evidenceOf(view.statusConflict.evidence),
  };

  const summaryInsights: readonly InsightViewModel[] = [
    { id: 'status', tone: 'analytic', headline: 'STATUS', body: view.summary.status, treatment: 'inferred' },
    { id: 'cause', tone: 'caution', headline: 'CAUSE', body: view.summary.cause, treatment: 'computed' },
    { id: 'outlook', tone: 'caution', headline: 'OUTLOOK', body: view.summary.outlook, treatment: 'inferred' },
    { id: 'impact', tone: 'critical', headline: 'ECONOMIC IMPACT', body: view.summary.economicImpact, treatment: 'computed' },
    { id: 'action', tone: 'analytic', headline: 'ACTION', body: view.summary.action, treatment: 'inferred' },
  ];

  return (
    <div className="gl-stack" style={{ gap: 'var(--gl-space-lg)' }}>

      {/* 1 — header. Everything an executive needs to know they are in the right review. */}
      <section className="gl-card gl-card-pad gl-stack" aria-label="Project identification">
        <div className="gl-row" style={{ gap: 'var(--gl-space-sm)', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="gl-h2">{h.name}</span>
          <span className="gl-caption">{h.customerAlias}</span>
          <span className="gl-caption" style={{ marginLeft: 'auto' }}>{h.demoMarker}</span>
        </div>
        <dl className="gl-row" style={{ gap: 'var(--gl-space-md)', flexWrap: 'wrap', margin: 0 }}>
          {([
            ['Industry', h.industry], ['Region', h.region], ['Delivery leader', h.deliveryLeader],
            ['DA owner', h.daOwner], ['Contract type', h.contractType],
            ['TCV', h.totalContractValue], ['Start', h.startDate],
            ['Committed end', h.committedEndDate],
          ] as const).map(([label, value]) => (
            <div key={label} className="gl-stack" style={{ gap: '2px' }}>
              <dt className="gl-caption">{label}</dt>
              <dd className="gl-numeric" style={{ margin: 0, fontWeight: 500 }}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2 — the six primary outputs. Each says what kind of claim it is. */}
      <section aria-label="Primary outputs">
        <div className="gl-grid">
          {view.verdicts.map((v) => (
            <div className="gl-col-2" key={v.id}>
              <div className="gl-card gl-card-pad gl-stack" style={{ gap: 'var(--gl-space-xxs)', height: '100%' }}>
                <span className="gl-caption">{v.label}</span>
                {v.id === 'overall-health' || v.id.startsWith('outlook')
                  ? <HealthBadge status={ragStatus(v.value)} />
                  : v.id === 'trajectory'
                    ? <TrajectoryIndicator trajectory={trajectoryOf(v.value)} />
                    : v.id === 'forecast-confidence'
                      ? <ConfidenceBadge confidence={confidenceOf(v.value, v.detail)} />
                      : <span className="gl-h2">{v.value}</span>}
                <span className="gl-caption"><RichText text={v.detail} /></span>
                <EvidenceDisclosure evidence={evidenceOf(v.evidence)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — which mechanism produced the band, before the divergence. */}
      {view.bandProvenance.decidedBy === 'POLICY_OVERRIDE' ? (
        <InsightCallout insight={{
          id: 'band-provenance',
          tone: 'critical',
          headline: `System RAG ${view.bandProvenance.systemAssessedRag} — hard override, not the weighted model`,
          body: view.bandProvenance.narrative,
          treatment: 'inferred',
        }} />
      ) : null}

      {/*
        3b — rule coverage. Rendered whenever a Red-forcing control could not be run, including on
        an AMBER or GREEN project, because that is exactly the case where a reader assumes the
        absence of an override means the condition was checked and cleared (ADR-0025 D-5).
      */}
      {view.bandProvenance.allApplicableCriticalControlsEvaluated
        && view.bandProvenance.notApplicableControls.length === 0 ? null : (
        <InsightCallout insight={{
          id: 'rule-coverage',
          // A rule that does not apply is not a caution. Only a genuine evidence gap or a broken
          // control warrants one (ADR-0026 §11).
          tone: view.bandProvenance.allApplicableCriticalControlsEvaluated ? 'analytic' : 'caution',
          headline:
            `Applicable Red-forcing controls evaluated: ${view.bandProvenance.applicableControlsEvaluated}`,
          body: view.bandProvenance.coverageNarrative,
          treatment: 'computed',
        }} />
      )}

      {/* 4 — the divergence, before the detail. AC-2 lives here. */}
      <StatusConflict conflict={conflict} />
      {view.statusConflict.unexplainedBy.length > 0 ? (
        <Panel title="What the reported status does not account for">
          <ul className="gl-stack" style={{ gap: 'var(--gl-space-xxs)', margin: 0, paddingLeft: '1.2em' }}>
            {view.statusConflict.unexplainedBy.map((u) => <li key={u} className="gl-body-sm">{u}</li>)}
          </ul>
        </Panel>
      ) : null}

      {/* 4 — the quotable summary. Generated by rules, never by a language model. */}
      <section className="gl-stack" aria-label="Executive summary" style={{ gap: 'var(--gl-space-xs)' }}>
        {summaryInsights.map((i) => <InsightCallout key={i.id} insight={i} />)}
        <EvidenceDisclosure evidence={evidenceOf(view.summary.evidence)} />
      </section>

      {/* 5 — where the verdict comes from, and how much of the model it rests on. */}
      <Panel title="Health dimensions">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Assessment status</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.coverage.status}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Dimension coverage</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>
                {view.coverage.coverage} · {view.coverage.availableWeight} of {view.coverage.declaredWeight} declared weight
              </span>
            </div>
          </div>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.coverage.narrative} /></p>
          {view.coverage.missing.length > 0 ? (
            <ul className="gl-stack" style={{ gap: 'var(--gl-space-xxs)', margin: 0, paddingLeft: '1.2em' }}>
              {view.coverage.missing.map((m) => (
                <li key={m.name} className="gl-body-sm">
                  <strong>{m.name}</strong> ({m.weight}) — {m.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <DataTable table={dimensionTable(view)} />
        </div>
      </Panel>

      {/* 6 — are we delivering what we sold? */}
      <Panel title="Commitment comparison">
        <DataTable table={commitmentTable(view)} />
      </Panel>

      {/* 7 — the economics. */}
      <Panel title="Financial position">
        <div className="gl-grid">
          {view.financial.map((f) => (
            <div className="gl-col-3" key={f.metricId + f.label}>
              <div className="gl-stack" style={{ gap: '2px' }}>
                <span className="gl-caption">{f.label}</span>
                <span className="gl-numeric" style={{ fontWeight: 600 }}>
                  {commercialRestricted && f.value.includes('$') ? 'Restricted' : f.value}
                </span>
                <span className="gl-caption">{f.metricId}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Progress and burn">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <ProgressBurnBars chart={{
            title: 'Planned completion, actual completion and cost consumed',
            textAlternative: `Planned ${view.progressBurn.plannedCompletion}, actual `
              + `${view.progressBurn.actualCompletion}, cost consumed ${view.progressBurn.costConsumed}.`,
            bars: [
              { label: 'Planned physical completion', planned: { value: view.progressBurn.plannedValue, display: view.progressBurn.plannedCompletion }, actual: { value: view.progressBurn.plannedValue, display: view.progressBurn.plannedCompletion } },
              { label: 'Actual physical completion', planned: { value: view.progressBurn.plannedValue, display: view.progressBurn.plannedCompletion }, actual: { value: view.progressBurn.actualValue, display: view.progressBurn.actualCompletion } },
              { label: 'Cost consumed', planned: { value: view.progressBurn.actualValue, display: view.progressBurn.actualCompletion }, actual: { value: view.progressBurn.costValue, display: view.progressBurn.costConsumed } },
            ],
          }} />
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.progressBurn.narrative} /></p>
          <div className="gl-row" style={{ gap: 'var(--gl-space-md)' }}>
            <span className="gl-body-sm">Progress variance <strong className="gl-numeric">{view.progressBurn.progressVariance}</strong></span>
            <span className="gl-body-sm">Burn gap <strong className="gl-numeric">{view.progressBurn.burnGap}</strong></span>
          </div>
          <EvidenceDisclosure evidence={evidenceOf(view.progressBurn.evidence)} />
        </div>
      </Panel>

      <Panel title="ETC credibility">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Management EAC (MET-FIN-008)</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.etcCredibility.managementEac}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Performance-implied EAC (MET-FIN-029)</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.etcCredibility.performanceImpliedEac}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Optimism gap (MET-FIN-030)</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.etcCredibility.optimismGap}</span>
            </div>
          </div>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}><RichText text={view.etcCredibility.narrative} /></p>
          <EvidenceDisclosure evidence={evidenceOf(view.etcCredibility.evidence)} />
        </div>
      </Panel>

      {/* 8 — the schedule position. */}
      <Panel title="Milestones">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Last critical milestone</span>
              <span className="gl-body-sm">{view.milestones.last === null ? 'none delivered yet' : `${view.milestones.last.name} — baseline ${view.milestones.last.baselineDate}, actual ${view.milestones.last.actualDate} (${view.milestones.last.slip})`}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Next critical milestone</span>
              <span className="gl-body-sm">{view.milestones.next === null ? 'none outstanding' : `${view.milestones.next.name} — baseline ${view.milestones.next.baselineDate}, forecast ${view.milestones.next.forecastDate} (${view.milestones.next.slip})`}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Hit rate</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.milestones.hitRate}</span>
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Total slippage · at risk</span>
              <span className="gl-numeric" style={{ fontWeight: 600 }}>{view.milestones.slippageDays} · {view.milestones.atRisk}</span>
            </div>
          </div>
          <DataTable table={milestoneTable(view)} />
          <EvidenceDisclosure evidence={evidenceOf(view.milestones.evidence)} />
        </div>
      </Panel>

      {/* 9 — what is leaking. */}
      <div className="gl-grid">
        <div className="gl-col-6">
          <Panel title="Scope and commercial">
            <SignalList lines={view.scopeCommercial} />
          </Panel>
        </div>
        <div className="gl-col-6">
          <Panel title="Quality and product">
            <SignalList lines={view.quality} />
          </Panel>
        </div>
      </div>

      {/* 10 — can I trust any of this? The Green claim rule is stated here, always. */}
      <Panel title="Data and assurance confidence">
        <div className="gl-stack" style={{ gap: 'var(--gl-space-sm)' }}>
          <div className="gl-row" style={{ gap: 'var(--gl-space-lg)', flexWrap: 'wrap' }}>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Data confidence (MET-DQ-005)</span>
              <ConfidenceBadge confidence={confidenceOf(view.confidence.dataBand, `score ${view.confidence.dataScore} of 100`)} />
            </div>
            <div className="gl-stack" style={{ gap: '2px' }}>
              <span className="gl-caption">Forecast confidence (MET-DQ-007)</span>
              <ConfidenceBadge confidence={confidenceOf(view.confidence.forecastBand, `score ${view.confidence.forecastScore} of 100`)} />
            </div>
            {view.confidence.cappedBy !== undefined ? (
              <div className="gl-stack" style={{ gap: '2px' }}>
                <span className="gl-caption">Band capped below the arithmetic</span>
                <span className="gl-body-sm">{view.confidence.arithmeticBand} → {view.confidence.dataBand}: {view.confidence.cappedBy}</span>
              </div>
            ) : null}
          </div>
          <div className="gl-row" style={{ gap: 'var(--gl-space-md)', flexWrap: 'wrap' }}>
            {view.confidence.domainFreshness.map((f) => (
              <span key={f.domain} className="gl-body-sm">{f.domain} <strong className="gl-numeric">{f.age}</strong></span>
            ))}
          </div>
          <p className="gl-body-sm" style={{ margin: 0, maxWidth: '96ch' }}>
            <strong>Independent review:</strong> {view.confidence.independentReview}
          </p>
          <InsightCallout insight={{
            id: 'green-claim',
            tone: view.confidence.greenClaimSupported ? 'positive' : 'critical',
            // R1.7. Wording is governed in the view model — see greenClaimHeadline.
            headline: view.confidence.greenClaimHeadline,
            body: view.confidence.greenClaimNarrative,
            treatment: 'computed',
          }} />
          <EvidenceDisclosure evidence={evidenceOf(view.confidence.evidence)} />
        </div>
      </Panel>
    </div>
  );
}
