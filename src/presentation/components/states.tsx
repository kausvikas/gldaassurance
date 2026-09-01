/**
 * Empty, loading, error and degraded states.
 *
 * These are usually an afterthought and they are the states a demo actually lands in — a scoped user
 * whose portfolio has nothing at risk, a feed that stopped reporting, a request that failed. Getting
 * them wrong is how a product looks broken while working correctly.
 *
 * Three rules the components encode:
 *
 * 1. **Empty is not an error.** "No projects breaching threshold" is good news for a portfolio and
 *    must not be dressed in a warning tone.
 * 2. **Degraded is not empty.** `DEGRADED` means the numbers on screen are real but their inputs are
 *    stale, and the sources are named. Blanking the screen would hide usable information; showing it
 *    silently would misrepresent it. The strip does the third thing: show, and say why to doubt it.
 * 3. **An error never leaks internals.** `SECURITY_MODEL.md` §4.5 — generic to the client, detail
 *    server-side, correlation id as the bridge. No stack trace, no SQL, no scope reasoning.
 */
import type { JSX } from 'react';
import { RichText } from './rich-text.js';
import type { EmptyStateViewModel, ErrorStateViewModel, FreshnessViewModel } from '../view-models.js';

export function EmptyState({ state }: { readonly state: EmptyStateViewModel }): JSX.Element {
  return (
    <div className="gl-state">
      <span className="gl-state-glyph" aria-hidden="true">{state.glyph ?? '◌'}</span>
      <span className="gl-card-title">{state.title}</span>
      <p className="gl-body-sm" style={{ margin: 0, maxWidth: '46ch' }}><RichText text={state.body} /></p>
      {state.actionLabel !== undefined
        ? <button type="button" className="gl-btn">{state.actionLabel}</button>
        : null}
    </div>
  );
}

/**
 * Loading.
 *
 * Skeletons rather than a spinner, because a skeleton preserves the layout and a spinner reflows the
 * page when it resolves — and an executive who has started reading a heading does not want it to
 * move. `aria-busy` plus a polite live region is what makes the wait perceivable without sight.
 */
export function LoadingState(
  { label = 'Loading', rows = 3 }: { readonly label?: string; readonly rows?: number },
): JSX.Element {
  return (
    <div className="gl-stack" aria-busy="true" aria-live="polite" style={{ gap: 'var(--gl-space-xs)' }}>
      <span className="gl-visually-hidden">{`${label}…`}</span>
      <div className="gl-skeleton gl-skeleton-lg" style={{ width: '38%' }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="gl-skeleton" style={{ width: i % 2 === 0 ? '100%' : '72%' }} />
      ))}
    </div>
  );
}

export function ErrorState({ state }: { readonly state: ErrorStateViewModel }): JSX.Element {
  return (
    <div className="gl-state" role="alert">
      <span className="gl-state-glyph" aria-hidden="true">■</span>
      <span className="gl-card-title">{state.title}</span>
      <p className="gl-body-sm" style={{ margin: 0, maxWidth: '46ch' }}><RichText text={state.body} /></p>
      {state.correlationId !== undefined
        ? <span className="gl-caption gl-numeric">{`Reference: ${state.correlationId}`}</span>
        : null}
    </div>
  );
}

/**
 * The degraded strip.
 *
 * Sits above content rather than replacing it, and names the sources. `role="status"` rather than
 * `role="alert"`: degradation is a condition to be aware of, not an interruption, and an alert that
 * fires on every stale feed teaches people to ignore alerts.
 */
export function DegradedState({ freshness }: { readonly freshness: FreshnessViewModel }): JSX.Element {
  return (
    <div className="gl-degraded-strip" role="status">
      <span aria-hidden="true">▲</span>
      <div className="gl-stack" style={{ gap: 0 }}>
        <span className="gl-body-sm" style={{ fontWeight: 600 }}>{freshness.label}</span>
        <span className="gl-caption" style={{ color: 'inherit' }}>
          {freshness.degradedSources.length > 0
            ? `Affected sources: ${freshness.degradedSources.join(', ')}. ${freshness.detail}`
            : freshness.detail}
        </span>
      </div>
    </div>
  );
}
