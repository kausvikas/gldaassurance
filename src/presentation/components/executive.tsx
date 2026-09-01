/**
 * Executive primitives — the components an executive surface is assembled from.
 *
 * The design constraint behind all of them is AC-1: *"portfolio load to a specific named project
 * needing intervention in under 30 seconds and under 3 interactions."* Thirty seconds is not much,
 * and it is spent on scanning, so these components are built for scanning:
 *
 *   - one figure per card, at display size, in tabular numerals so a column of them aligns;
 *   - the delta directly under the figure with a sign glyph, because "down" is the question an
 *     executive asks second and it should not require a click;
 *   - status as shape + word, never a coloured dot the reader has to decode;
 *   - and **at most one orange element in view** (`BRAND_DESIGN_SYSTEM.md` §8 prohibition 6). If
 *     everything is urgent, the scan has nothing to land on and the thirty seconds are gone.
 */
import type { JSX, ReactNode } from 'react';
import { RichText } from './rich-text.js';
import type {
  DeltaViewModel, ExecutiveActionViewModel, ForecastOutlookViewModel, InsightViewModel,
  KpiViewModel, MetricComparisonViewModel,
} from '../view-models.js';
import { ConfidenceBadge, HealthBadge } from './status.js';
import { EvidenceDisclosure, ProvenanceValue, RestrictedValue } from './evidence.js';
import { DemoSyntheticDataBadge } from './demo-badge.js';

const DELTA_GLYPH = { up: '▲', down: '▼', flat: '▬' } as const;
const DELTA_CLASS = {
  positive: 'gl-delta-positive',
  negative: 'gl-delta-negative',
  neutral: 'gl-delta-flat',
} as const;

/**
 * A movement, with its direction *and* its sentiment.
 *
 * These are two different facts and conflating them is a classic dashboard bug: margin down is bad,
 * defect count down is good, and no arrow knows which. The view model carries `sentiment` because
 * the domain decided it; the component only picks a class.
 */
export function DeltaIndicator({ delta }: { readonly delta: DeltaViewModel }): JSX.Element {
  return (
    <span className={`gl-body-sm gl-numeric ${DELTA_CLASS[delta.sentiment]}`}>
      <span aria-hidden="true">{DELTA_GLYPH[delta.direction]}</span>
      {' '}
      {delta.display}
      <span className="gl-caption" style={{ color: 'var(--gl-text-secondary)', fontWeight: 400 }}>
        {` ${delta.comparisonLabel}`}
      </span>
    </span>
  );
}

export interface ExecutiveKpiCardProps {
  readonly kpi: KpiViewModel;
  /** `true` renders the figure at h1 rather than display size, for secondary rows. */
  readonly secondary?: boolean;
}

/**
 * The headline figure.
 *
 * When `kpi.restricted` is set the card renders a neutral chip and nothing else — no dash, no zero,
 * no ghosted number. `SECURITY_MODEL.md` §4.5: the field is *absent* from the payload, so the card
 * genuinely does not have a value to hint at, and it must not imply one.
 */
export function ExecutiveKpiCard({ kpi, secondary = false }: ExecutiveKpiCardProps): JSX.Element {
  return (
    <section className="gl-card gl-card-pad gl-kpi" aria-labelledby={`kpi-${kpi.id}`}>
      <div className="gl-row" style={{ justifyContent: 'space-between' }}>
        <span className="gl-eyebrow" id={`kpi-${kpi.id}`}>{kpi.label}</span>
        {kpi.status !== undefined ? <HealthBadge status={kpi.status} compact /> : null}
      </div>

      {kpi.restricted === true
        ? <div style={{ paddingBlock: 'var(--gl-space-xs)' }}><RestrictedValue /></div>
        : (
          <div className={`gl-kpi-value${secondary ? ' gl-kpi-value-sm' : ''}`}>
            <ProvenanceValue treatment={kpi.treatment} srHint={false}>
              {kpi.value}
            </ProvenanceValue>
            {kpi.unitHint !== undefined
              ? <span className="gl-caption" style={{ marginLeft: 'var(--gl-space-xxs)' }}>{kpi.unitHint}</span>
              : null}
          </div>
        )}

      <div className="gl-kpi-foot">
        {kpi.delta !== undefined ? <DeltaIndicator delta={kpi.delta} /> : null}
        {kpi.evidence !== undefined ? <EvidenceDisclosure evidence={kpi.evidence} label="Evidence" /> : null}
      </div>
    </section>
  );
}

/**
 * The forward-looking panel.
 *
 * Always rendered as `inferred` containment: an outlook is a model's estimate, and §3.3 requires it
 * to be visually incapable of being mistaken for an observation. The confidence badge is mandatory
 * rather than decorative — an outlook without a stated confidence is an assertion.
 */
export function ForecastOutlook({ outlook }: { readonly outlook: ForecastOutlookViewModel }): JSX.Element {
  return (
    <section className="gl-prov-inferred gl-stack" aria-label="Forecast outlook" style={{ gap: 'var(--gl-space-xs)' }}>
      <div className="gl-row" style={{ justifyContent: 'space-between' }}>
        <span className="gl-chip gl-chip-analytic">
          <span className="gl-chip-glyph" aria-hidden="true">◈</span>
          <span>Inferred outlook</span>
        </span>
        <ConfidenceBadge confidence={outlook.confidence} />
      </div>
      <div className="gl-h3">{outlook.headline}</div>
      {outlook.rangeLabel !== undefined
        ? <div className="gl-body-sm gl-numeric">{outlook.rangeLabel}</div>
        : null}
      <div className="gl-caption">
        {[outlook.basis, outlook.ruleVersion !== undefined ? `rule ${outlook.ruleVersion}` : undefined]
          .filter((x): x is string => x !== undefined)
          .join(' · ')}
      </div>
    </section>
  );
}

const INSIGHT_CLASS = {
  analytic: '',
  positive: 'gl-callout-positive',
  caution: 'gl-callout-caution',
  critical: 'gl-callout-critical',
} as const;

const INSIGHT_GLYPH = {
  analytic: '◈', positive: '●', caution: '▲', critical: '■',
} as const;

/** A short, attributed observation. Carries its treatment, so an inference cannot masquerade. */
export function InsightCallout({ insight }: { readonly insight: InsightViewModel }): JSX.Element {
  return (
    <div className={`gl-callout ${INSIGHT_CLASS[insight.tone]}`.trim()}>
      <span aria-hidden="true" style={{ lineHeight: 1.4 }}>{INSIGHT_GLYPH[insight.tone]}</span>
      <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
        <div className="gl-row" style={{ gap: 'var(--gl-space-xs)' }}>
          <span className="gl-card-title">{insight.headline}</span>
          {insight.treatment === 'inferred'
            ? (
              <span className="gl-chip gl-chip-analytic">
                <span className="gl-chip-glyph" aria-hidden="true">◈</span>
                <span>Inferred</span>
              </span>
            )
            : null}
        </div>
        <p className="gl-body-sm" style={{ margin: 0 }}><RichText text={insight.body} /></p>
        {insight.evidence !== undefined ? <EvidenceDisclosure evidence={insight.evidence} /> : null}
      </div>
    </div>
  );
}

/**
 * A recommended intervention with an owner and a date.
 *
 * The primary action is the one place `impact-orange` appears on a screen full of these — which is
 * why the button is optional and why a list of action cards renders at most one primary. An
 * intervention nobody owns and nothing is due on is a note, not an action, so both fields are
 * required by the type.
 */
export function ExecutiveActionCard(
  { action, primary = false }: {
    readonly action: ExecutiveActionViewModel;
    readonly primary?: boolean;
  },
): JSX.Element {
  return (
    <article className="gl-card gl-card-pad gl-action-card" aria-labelledby={`action-${action.id}`}>
      <div className="gl-row" style={{ justifyContent: 'space-between' }}>
        <span className="gl-card-title" id={`action-${action.id}`}>{action.title}</span>
        <HealthBadge status={action.status} compact />
      </div>
      <p className="gl-body-sm" style={{ margin: 0 }}>{action.rationale}</p>
      <div className="gl-action-meta gl-caption">
        <span>{`Owner: ${action.owner}`}</span>
        <span>{`Due: ${action.dueLabel}`}</span>
        {action.valueAtRisk !== undefined
          ? <span className="gl-numeric">{`Value at risk: ${action.valueAtRisk}`}</span>
          : null}
      </div>
      {action.primaryActionLabel !== undefined
        ? (
          <div>
            <button type="button" className={`gl-btn${primary ? ' gl-btn-primary' : ''}`}>
              {action.primaryActionLabel}
            </button>
          </div>
        )
        : null}
    </article>
  );
}

/** Two periods, one metric set, and the delta between them. Deltas arrive computed. */
export function MetricComparison(
  { comparison }: { readonly comparison: MetricComparisonViewModel },
): JSX.Element {
  return (
    <section className="gl-card" aria-labelledby="cmp-title">
      <header className="gl-card-head">
        <span className="gl-card-title" id="cmp-title">{comparison.title}</span>
      </header>
      <div className="gl-table-wrap">
        <table className="gl-table gl-table-compact">
          <caption className="gl-visually-hidden">{comparison.title}</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className="gl-num">{comparison.leftLabel}</th>
              <th scope="col" className="gl-num">{comparison.rightLabel}</th>
              <th scope="col" className="gl-num">Change</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" style={{ fontWeight: 400 }}>{row.label}</th>
                <td className="gl-num gl-numeric">{row.left}</td>
                <td className="gl-num gl-numeric">
                  {row.treatment !== undefined
                    ? <ProvenanceValue treatment={row.treatment} srHint={false}>{row.right}</ProvenanceValue>
                    : row.right}
                </td>
                <td className="gl-num"><DeltaIndicator delta={row.delta} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A titled panel. Used everywhere, so section headings stay consistent across surfaces. */
export function Panel(
  { title, actions, children, labelledById }: {
    readonly title: string;
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly labelledById?: string;
  },
): JSX.Element {
  const id = labelledById ?? `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="gl-card" aria-labelledby={id}>
      <header className="gl-card-head">
        <span className="gl-card-title" id={id}>{title}</span>
        {actions !== undefined ? <span style={{ marginLeft: 'auto' }}>{actions}</span> : null}
      </header>
      <div className="gl-card-pad">{children}</div>
    </section>
  );
}

export { DemoSyntheticDataBadge };
