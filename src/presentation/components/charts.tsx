/**
 * Chart wrappers — inline SVG, no charting library.
 *
 * **Why no library.** `presentation.allowedExternal` is `react` and `react-dom` and nothing else, on
 * purpose. Every charting library ships its own colour scales, its own type sizes and its own
 * tooltip, and the moment one arrives the design system has a competitor inside it —
 * `BRAND_DESIGN_SYSTEM.md` §8 prohibition 9 ("per-screen chart palettes") stops being enforceable
 * because the palette is now the library's. These four wrappers cover what Phases 7–10 need, they
 * draw with token classes, and they are small enough to read.
 *
 * **What the components are permitted to compute.** Exactly one thing: the map from a supplied value
 * to a coordinate. `scale()` below is that map. Everything a reader sees as a number —
 * every axis label, every data label, every total — is rendered from the `display` string the view
 * model carried, never from arithmetic done here. See `view-models.ts` for why that line is drawn
 * where it is.
 *
 * **Accessibility is not optional on these.** REQ-UX-006 and §3.4 require a text alternative *and* an
 * accessible data table for every chart, so both are required fields on every chart view model —
 * a chart that cannot be described cannot be constructed.
 */
import type { JSX, ReactNode } from 'react';
import type {
  BubbleMatrixViewModel, ProgressBurnViewModel, TrendChartViewModel, WaterfallViewModel,
} from '../view-models.js';
import { DataTable } from './data.js';

/** Linear map from a value domain onto a pixel range. The one calculation a chart may do. */
function scale(value: number, domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): number {
  const span = domainMax - domainMin;
  if (span === 0) return (rangeMin + rangeMax) / 2;
  return rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * A chart plus its text alternative plus its data table.
 *
 * The `<details>` is deliberate: the table is one keystroke away for everyone, not hidden behind an
 * assistive-technology-only path. A sighted analyst who wants the numbers should not have to run a
 * screen reader to get them, and a table that only screen readers can reach is a table nobody tests.
 */
function ChartFrame(
  { title, textAlternative, children, dataTable }: {
    readonly title: string;
    readonly textAlternative: string;
    readonly children: ReactNode;
    readonly dataTable: TrendChartViewModel['dataTable'];
  },
): JSX.Element {
  return (
    <figure style={{ margin: 0 }} className="gl-stack">
      <figcaption className="gl-row" style={{ justifyContent: 'space-between' }}>
        <span className="gl-card-title">{title}</span>
      </figcaption>
      <div role="img" aria-label={`${title}. ${textAlternative}`}>{children}</div>
      <p className="gl-caption" style={{ margin: 0 }}>{textAlternative}</p>
      <details className="gl-evidence">
        <summary className="gl-chip gl-chip-neutral">
          <span className="gl-chip-glyph" aria-hidden="true">▸</span>
          <span>Show data table</span>
        </summary>
        <div style={{ marginTop: 'var(--gl-space-xs)' }}>
          <DataTable table={dataTable} />
        </div>
      </details>
    </figure>
  );
}

const PLOT = { width: 640, height: 200, left: 8, right: 8, top: 8, bottom: 24 } as const;

/**
 * Time series with optional projected continuation.
 *
 * §3.4: a projected segment is dashed, reduced in opacity **and labelled**. Two of those three are
 * cosmetic; the label is the control. A projection that merely looks slightly different from an
 * actual is a provenance failure waiting for a screenshot.
 */
export function TrendChart({ chart }: { readonly chart: TrendChartViewModel }): JSX.Element {
  const all = chart.series.flatMap((s) => s.points.map((p) => p.value.value));
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const innerH = PLOT.height - PLOT.top - PLOT.bottom;

  const hasProjection = chart.series.some((s) => s.points.some((p) => p.projected === true));

  return (
    <ChartFrame title={chart.title} textAlternative={chart.textAlternative} dataTable={chart.dataTable}>
      <svg
        className="gl-chart"
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ height: '200px' }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            className="gl-chart-grid"
            x1={PLOT.left}
            x2={PLOT.width - PLOT.right}
            y1={round(PLOT.top + t * innerH)}
            y2={round(PLOT.top + t * innerH)}
          />
        ))}
        {chart.series.map((series) => {
          const n = series.points.length;
          const at = (i: number, v: number): readonly [number, number] => [
            round(scale(i, 0, Math.max(n - 1, 1), PLOT.left, PLOT.width - PLOT.right)),
            round(scale(v, min, max, PLOT.top + innerH, PLOT.top)),
          ];
          // Actual and projected are drawn as two paths so the dash pattern is a property of the
          // segment, not of the whole line.
          const actual = series.points
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.projected !== true);
          const projected = series.points
            .map((p, i) => ({ p, i }))
            .filter(({ p, i }) => p.projected === true || (actual.at(-1)?.i ?? -1) === i);
          const toPath = (pts: readonly { readonly p: { readonly value: { readonly value: number } }; readonly i: number }[]): string =>
            pts.map(({ p, i }, k) => {
              const [x, y] = at(i, p.value.value);
              return `${k === 0 ? 'M' : 'L'}${x} ${y}`;
            }).join(' ');
          const cls = series.role === 'baseline' ? 'gl-chart-baseline' : 'gl-chart-series';
          return (
            <g key={series.id}>
              {actual.length > 1 ? <path className={cls} d={toPath(actual)} /> : null}
              {projected.length > 1 ? <path className="gl-chart-forecast" d={toPath(projected)} /> : null}
              {series.role === 'emphasis'
                ? series.points.map((p, i) => {
                  const [x, y] = at(i, p.value.value);
                  return <circle key={p.label} className="gl-chart-emphasis" cx={x} cy={y} r={3.5} />;
                })
                : null}
            </g>
          );
        })}
        {chart.series[0]?.points.map((p, i, arr) => (
          i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2)
            ? (
              <text
                key={p.label}
                className="gl-chart-label"
                x={round(scale(i, 0, Math.max(arr.length - 1, 1), PLOT.left, PLOT.width - PLOT.right))}
                y={PLOT.height - 6}
                textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}
              >
                {p.label}
              </text>
            )
            : null
        ))}
      </svg>
      <div className="gl-row gl-caption" style={{ marginTop: 'var(--gl-space-xxs)' }}>
        <span>{chart.yAxisLabel}</span>
        {chart.series.map((s) => (
          <span key={s.id} className="gl-row-tight">
            <span aria-hidden="true">{s.role === 'baseline' ? '┄' : '━'}</span>
            <span>{s.label}</span>
          </span>
        ))}
        {hasProjection
          ? (
            <span className="gl-chip gl-chip-analytic">
              <span className="gl-chip-glyph" aria-hidden="true">┄</span>
              <span>Dashed = projected, not actual</span>
            </span>
          )
          : null}
      </div>
    </ChartFrame>
  );
}

/**
 * Margin-bridge waterfall.
 *
 * AC-4 requires the decomposition to reconcile to the cent — and that reconciliation is asserted by
 * the domain, not by this component. `reconciliationNote` is displayed because a reader is entitled
 * to see the claim; the component does not add the steps up to check it, because a browser adding
 * currency is the exact thing ADR-0002 forbids.
 */
export function Waterfall({ chart }: { readonly chart: WaterfallViewModel }): JSX.Element {
  const values = chart.steps.map((s) => s.amount.value);
  let running = 0;
  const bars = chart.steps.map((step) => {
    const start = step.kind === 'start' || step.kind === 'total' ? 0 : running;
    const end = step.kind === 'start' || step.kind === 'total' ? step.amount.value : running + step.amount.value;
    if (step.kind !== 'start' && step.kind !== 'total') running = end;
    else running = end;
    return { step, start, end };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.start, b.end)), ...values);
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.start, b.end)), ...values);
  const innerH = PLOT.height - PLOT.top - PLOT.bottom;
  const bandW = PLOT.width / Math.max(bars.length, 1);
  const barW = bandW * 0.56;

  const classFor = (kind: WaterfallViewModel['steps'][number]['kind'], delta: number): string => {
    if (kind === 'start' || kind === 'total') return 'gl-chart-neutral';
    return delta >= 0 ? 'gl-chart-positive' : 'gl-chart-negative';
  };

  return (
    <ChartFrame title={chart.title} textAlternative={chart.textAlternative} dataTable={chart.dataTable}>
      <svg className="gl-chart" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} aria-hidden="true" style={{ height: '200px' }}>
        <line
          className="gl-chart-axis"
          x1={0}
          x2={PLOT.width}
          y1={round(scale(0, lo, hi, PLOT.top + innerH, PLOT.top))}
          y2={round(scale(0, lo, hi, PLOT.top + innerH, PLOT.top))}
        />
        {bars.map(({ step, start, end }, i) => {
          const yA = scale(start, lo, hi, PLOT.top + innerH, PLOT.top);
          const yB = scale(end, lo, hi, PLOT.top + innerH, PLOT.top);
          const x = bandW * i + (bandW - barW) / 2;
          return (
            <g key={step.label}>
              {i > 0
                ? (
                  <line
                    className="gl-chart-connector"
                    x1={round(bandW * (i - 1) + (bandW + barW) / 2)}
                    x2={round(x)}
                    y1={round(yA)}
                    y2={round(yA)}
                  />
                )
                : null}
              <rect
                className={classFor(step.kind, end - start)}
                x={round(x)}
                y={round(Math.min(yA, yB))}
                width={round(barW)}
                height={round(Math.max(Math.abs(yB - yA), 1))}
                rx={2}
              />
              <text
                className="gl-chart-label"
                x={round(bandW * i + bandW / 2)}
                y={PLOT.height - 6}
                textAnchor="middle"
              >
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="gl-caption" style={{ margin: 0 }}>{chart.reconciliationNote}</p>
    </ChartFrame>
  );
}

/**
 * Value-at-risk × deterioration bubble matrix — the Phase 7 triage picture.
 *
 * At most one bubble carries `emphasis`, and that is the only orange mark on the chart
 * (§3.4: "typically one orange mark per chart. If everything is orange, nothing is urgent").
 * Every bubble also carries a status, so the picture survives greyscale.
 */
export function BubbleMatrix({ chart }: { readonly chart: BubbleMatrixViewModel }): JSX.Element {
  const xs = chart.bubbles.map((b) => b.x.value);
  const ys = chart.bubbles.map((b) => b.y.value);
  const sizes = chart.bubbles.map((b) => b.size.value);
  const xLo = Math.min(...xs, 0);
  const xHi = Math.max(...xs, 1);
  const yLo = Math.min(...ys, 0);
  const yHi = Math.max(...ys, 1);
  const sHi = Math.max(...sizes, 1);
  const H = 260;
  const innerH = H - PLOT.top - PLOT.bottom;

  const toneClass = {
    positive: 'gl-chart-positive',
    caution: 'gl-chart-neutral',
    critical: 'gl-chart-negative',
    neutral: 'gl-chart-neutral',
  } as const;

  return (
    <ChartFrame title={chart.title} textAlternative={chart.textAlternative} dataTable={chart.dataTable}>
      <svg className="gl-chart" viewBox={`0 0 ${PLOT.width} ${H}`} aria-hidden="true" style={{ height: '260px' }}>
        {[0, 0.5, 1].map((t) => (
          <line
            key={`h${t}`}
            className="gl-chart-grid"
            x1={PLOT.left}
            x2={PLOT.width - PLOT.right}
            y1={round(PLOT.top + t * innerH)}
            y2={round(PLOT.top + t * innerH)}
          />
        ))}
        {[0, 0.5, 1].map((t) => (
          <line
            key={`v${t}`}
            className="gl-chart-grid"
            y1={PLOT.top}
            y2={PLOT.top + innerH}
            x1={round(PLOT.left + t * (PLOT.width - PLOT.left - PLOT.right))}
            x2={round(PLOT.left + t * (PLOT.width - PLOT.left - PLOT.right))}
          />
        ))}
        {chart.bubbles.map((b) => {
          const cx = round(scale(b.x.value, xLo, xHi, PLOT.left + 24, PLOT.width - PLOT.right - 24));
          const cy = round(scale(b.y.value, yLo, yHi, PLOT.top + innerH - 12, PLOT.top + 12));
          const r = round(6 + (b.size.value / sHi) * 16);
          return (
            <g key={b.id}>
              <circle
                className={`gl-bubble ${b.emphasis === true ? 'gl-chart-emphasis' : toneClass[b.status.tone]}`}
                cx={cx}
                cy={cy}
                r={r}
                opacity={b.emphasis === true ? 1 : 0.75}
              />
              {b.emphasis === true
                ? <text className="gl-chart-label" x={cx} y={round(cy - r - 5)} textAnchor="middle">{b.label}</text>
                : null}
            </g>
          );
        })}
        <text className="gl-chart-label" x={PLOT.left} y={H - 6}>{chart.xAxisLabel}</text>
        <text className="gl-chart-label" x={PLOT.width - PLOT.right} y={H - 6} textAnchor="end">{chart.sizeLabel}</text>
      </svg>
    </ChartFrame>
  );
}

/**
 * Actual-versus-planned progress bars.
 *
 * Both figures arrive already computed; the bar maps each to a width and never divides one by the
 * other. The planned position is drawn as a marker rather than a second bar, because the question
 * is "how far behind is this?" and two bars make the reader do the subtraction.
 */
export function ProgressBurnBars({ chart }: { readonly chart: ProgressBurnViewModel }): JSX.Element {
  const max = Math.max(...chart.bars.flatMap((b) => [b.actual.value, b.planned.value]), 1);
  return (
    <div className="gl-stack" role="group" aria-label={`${chart.title}. ${chart.textAlternative}`}>
      {chart.bars.map((bar) => (
        <div className="gl-stack" key={bar.label} style={{ gap: 'var(--gl-space-xxs)' }}>
          <div className="gl-row" style={{ justifyContent: 'space-between' }}>
            <span className="gl-body-sm">{bar.label}</span>
            <span className="gl-row-tight">
              <span className="gl-body-sm gl-numeric">{bar.actual.display}</span>
              <span className="gl-caption">{`plan ${bar.planned.display}`}</span>
            </span>
          </div>
          <div className="gl-bar-track" style={{ position: 'relative' }}>
            <div
              className="gl-bar-fill"
              style={{ width: `${round((bar.actual.value / max) * 100)}%` }}
            />
            <div
              className="gl-bar-marker"
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${round((bar.planned.value / max) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
      <p className="gl-caption" style={{ margin: 0 }}>{chart.textAlternative}</p>
    </div>
  );
}
