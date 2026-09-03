/**
 * Tabular and control primitives: `DataTable`, `FilterBar`, the scope and period selectors, and the
 * data-freshness indicator.
 *
 * **Why the table is a `<table>`.** A grid of `<div>`s can be made to look identical and cannot be
 * made to behave identically: `<th scope="col">` and `<th scope="row">` are what let a screen reader
 * answer "which column am I in?" halfway down a 91-row portfolio, and `aria-sort` is what tells it
 * the order changed. Those are REQ-UX-006 obligations, and reimplementing them on divs is a project
 * in itself that is never finished.
 *
 * **Why sorting is a view model field and not component state.** The service sorts. A table that
 * sorts client-side is a table that sorts *the page it was given*, which silently means "sorted
 * within the first 100 rows" — and on a ranked portfolio that is a wrong answer presented
 * confidently. The column carries `sort` so the header can render the state and the arrow; changing
 * it is a request, not a local mutation.
 */
import type { JSX } from 'react';
import { RichText } from './rich-text.js';
import type {
  CellViewModel, ColumnViewModel, FilterViewModel, FreshnessViewModel,
  ReportingPeriodViewModel, ScopeSelectionViewModel, TableViewModel,
} from '../view-models.js';
import { HealthBadge, TrajectoryIndicator } from './status.js';
import { ProvenanceValue, RestrictedValue } from './evidence.js';
import { DeltaIndicator } from './executive.js';

const SORT_GLYPH = { ascending: '↑', descending: '↓', none: '↕' } as const;

function Cell({ cell }: { readonly cell: CellViewModel }): JSX.Element {
  if (cell.restricted === true) return <RestrictedValue />;
  if (cell.status !== undefined) return <HealthBadge status={cell.status} compact />;
  if (cell.trajectory !== undefined) return <TrajectoryIndicator trajectory={cell.trajectory} />;
  if (cell.delta !== undefined) return <DeltaIndicator delta={cell.delta} />;
  // Cell text is governed prose in the explanation columns and carries `**emphasis**`, so it
  // renders through RichText for the same reason panel prose does (Phase 12A).
  const text = <RichText text={cell.display ?? '—'} />;
  return cell.treatment !== undefined
    ? <ProvenanceValue treatment={cell.treatment} srHint={false}>{text}</ProvenanceValue>
    : text;
}

export interface DataTableProps {
  readonly table: TableViewModel;
  /**
   * Pins the first column while the table scrolls sideways (DR-079).
   *
   * Opt-in rather than automatic: it only makes sense where the first column is the row's identity
   * and the table is wide enough to scroll. A compact three-column table gains nothing and would pay
   * a stacking-context cost for it.
   */
  readonly pinFirstColumn?: boolean;
  /** Rendered above the table; the caption stays for screen readers regardless. */
  readonly showCaption?: boolean;
}

export function DataTable(
  { table, showCaption = false, pinFirstColumn = false }: DataTableProps,
): JSX.Element {
  const density = table.density === 'compact' ? ' gl-table-compact' : '';
  const pinned = pinFirstColumn ? ' gl-table-pinned' : '';
  return (
    <div className="gl-stack" style={{ gap: 'var(--gl-space-xs)' }}>
      {table.summary !== undefined ? <div className="gl-caption"><RichText text={table.summary} /></div> : null}
      <div className="gl-table-wrap">
        <table className={`gl-table${density}${pinned}`}>
          <caption className={showCaption ? undefined : 'gl-visually-hidden'}>{table.caption}</caption>
          <thead>
            <tr>
              {table.columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={col.align === 'end' ? 'gl-num' : undefined}
                  style={col.widthHint !== undefined ? { width: col.widthHint } : undefined}
                  {...(col.sort !== undefined ? { 'aria-sort': col.sort } : {})}
                >
                  {col.header}
                  {col.sort !== undefined
                    ? <span className="gl-sort-glyph" aria-hidden="true">{SORT_GLYPH[col.sort]}</span>
                    : null}
                  {col.description !== undefined
                    ? <span className="gl-visually-hidden">{` — ${col.description}`}</span>
                    : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const [first, ...rest] = table.columns;
              return (
                <tr key={row.id}>
                  {first !== undefined
                    ? (
                      // The first column is the row header: it is what identifies the row, and
                      // scope="row" is what lets a reader re-anchor after scrolling sideways.
                      <th scope="row" style={{ fontWeight: 500 }}>
                        <Cell cell={row.cells[first.key] ?? {}} />
                      </th>
                    )
                    : null}
                  {rest.map((col) => (
                    <td key={col.key} className={col.align === 'end' ? 'gl-num' : undefined}>
                      <Cell cell={row.cells[col.key] ?? {}} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
 * These read as current context, not as controls.
 *
 * They were <label class="gl-select"> wrappers carrying a ▾ affordance, an aria-label and a
 * visually-hidden "N options available" — around no form control at all. Nothing could operate
 * them by mouse or by keyboard, and a screen reader was told there were options to choose that did
 * not exist. A control that advertises interaction it does not have is worse than no control:
 * an executive who clicks it and gets nothing stops trusting the rest of the screen.
 *
 * This static demonstration has no client runtime to filter with, so the honest presentation is a
 * statement of the context the server resolved. The chevron and the false option counts are gone;
 * the label and the resolved value remain, which is the information these ever carried. Real
 * enterprise filtering is a product capability still to be built, and it will bring real controls
 * with it.
 */
export function FilterBar({ filters }: { readonly filters: readonly FilterViewModel[] }): JSX.Element {
  return (
    <div className="gl-row" role="group" aria-label="Applied view context">
      {filters.map((filter) => {
        const selected = filter.options.find((o) => o.value === filter.selected);
        return (
          <span className="gl-select" key={filter.id}>
            <span className="gl-select-label gl-caption">{`${filter.label}:`}</span>
            <span className="gl-select-value gl-body-sm">{selected?.label ?? '—'}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * The organisational scope selector.
 *
 * `available` is the **authorised** set the server resolved, not a catalogue of everything that
 * exists (`SECURITY_MODEL.md` §4.2, §12.1). A scope this control cannot offer is a scope the caller
 * cannot reach, and selecting one is a request the server re-authorises from scratch — the control
 * narrows a view, it never grants access.
 */
export function PortfolioScopeSelector(
  { scope }: { readonly scope: ScopeSelectionViewModel },
): JSX.Element {
  const selected = scope.available.find((n) => n.id === scope.selectedId);
  return (
    <span className="gl-select">
      <span className="gl-select-label gl-caption">Scope:</span>
      <span className="gl-select-value gl-body-sm">{selected?.label ?? 'All authorised'}</span>
    </span>
  );
}

export function ReportingPeriodSelector(
  { period }: { readonly period: ReportingPeriodViewModel },
): JSX.Element {
  const selected = period.periods.find((p) => p.id === period.selectedId);
  return (
    <div className="gl-row-tight">
      <span className="gl-select">
        <span className="gl-select-label gl-caption">Period:</span>
        <span className="gl-select-value gl-body-sm">{selected?.label ?? '—'}</span>
      </span>
      <span className="gl-caption">{period.asAtLabel}</span>
    </div>
  );
}

const FRESHNESS_TONE = {
  CURRENT: 'gl-status-positive',
  STALE: 'gl-status-caution',
  DEGRADED: 'gl-status-caution',
  UNAVAILABLE: 'gl-status-critical',
} as const;

const FRESHNESS_GLYPH = {
  CURRENT: '●', STALE: '▲', DEGRADED: '▲', UNAVAILABLE: '■',
} as const;

/**
 * Source freshness, named rather than averaged.
 *
 * `BRAND_DESIGN_SYSTEM.md` §3.4 and the Phase 5 lineage service take the *worst* state, never the
 * mean — a dead feed must not hide behind five healthy ones — and degraded sources are listed by
 * name. "3 sources degraded" tells a reader nothing they can act on; "Delivery tracker 12d" does.
 */
export function DataFreshnessIndicator(
  { freshness }: { readonly freshness: FreshnessViewModel },
): JSX.Element {
  const glyph = freshness.glyph.length > 0 ? freshness.glyph : FRESHNESS_GLYPH[freshness.state];
  return (
    <span className="gl-row-tight">
      <span className={`gl-chip ${FRESHNESS_TONE[freshness.state]}`}>
        <span className="gl-chip-glyph" aria-hidden="true">{glyph}</span>
        <span>{freshness.label}</span>
      </span>
      <span className="gl-caption">{freshness.detail}</span>
      {freshness.servingLastKnownGood === true
        ? (
          <span className="gl-chip gl-chip-neutral">
            <span className="gl-chip-glyph" aria-hidden="true">↺</span>
            <span>Last known good</span>
          </span>
        )
        : null}
      {freshness.degradedSources.length > 0
        ? (
          <span className="gl-visually-hidden">
            {`Degraded sources: ${freshness.degradedSources.join(', ')}`}
          </span>
        )
        : null}
    </span>
  );
}
