/**
 * Status, trajectory, confidence and conflict — the components that carry meaning without colour.
 *
 * **The rule these enforce structurally.** REQ-UX-002 and `BRAND_DESIGN_SYSTEM.md` §3.2 forbid
 * status by colour alone. That is easy to state and easy to erode: someone needs a compact table and
 * drops the label, then someone else drops the glyph, and six months later the product fails an
 * accessibility review on a screen nobody remembers changing.
 *
 * So there is no API here that yields a colour by itself. `StatusViewModel` requires `glyph` and
 * `label`, `HealthBadge` renders both, and the compact variant shrinks the *text*, never removes it.
 * A colour-only badge is not a discouraged option — it is not an option.
 */
import type { JSX } from 'react';
import type {
  ConfidenceViewModel, StatusConflictViewModel, StatusViewModel, TrajectoryViewModel,
} from '../view-models.js';
import { STATUS_TONES, type StatusTone } from '../tokens/tokens.js';
import { EvidenceDisclosure } from './evidence.js';

const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  positive: 'gl-status-positive',
  caution: 'gl-status-caution',
  critical: 'gl-status-critical',
  neutral: 'gl-status-neutral',
};

/** Build a status view model from a tone, keeping the glyph/label pairing canonical. */
export function statusFor(tone: StatusTone, label?: string, detail?: string): StatusViewModel {
  const def = STATUS_TONES[tone];
  return {
    tone,
    glyph: def.glyph,
    label: label ?? def.label,
    ...(detail !== undefined ? { detail } : {}),
  };
}

export interface HealthBadgeProps {
  readonly status: StatusViewModel;
  /** Compact shortens nothing meaningful — the label stays, the padding shrinks. */
  readonly compact?: boolean;
}

/**
 * The canonical status chip: shape + word + colour, in that order of reliability.
 *
 * The glyph is `aria-hidden` because it is a *visual* redundancy for the word beside it; a screen
 * reader announcing "black square Critical" is worse than "Critical". The redundancy is for people
 * reading a greyscale print-out or a screenshot in a deck, which is the case §3.2 actually names.
 */
export function HealthBadge({ status, compact = false }: HealthBadgeProps): JSX.Element {
  return (
    <span
      className={`gl-chip ${TONE_CLASS[status.tone]}`}
      style={compact ? { paddingInline: 'var(--gl-space-xxs)' } : undefined}
    >
      <span className="gl-chip-glyph" aria-hidden="true">{status.glyph}</span>
      <span>{status.label}</span>
      {status.detail !== undefined && !compact
        ? <span className="gl-visually-hidden">{` — ${status.detail}`}</span>
        : null}
    </span>
  );
}

const TRAJECTORY_GLYPH = {
  improving: '▲',
  stable: '▬',
  deteriorating: '▼',
  unknown: '◌',
} as const;

/**
 * Direction of travel over a stated window.
 *
 * **Direction is not sentiment.** A rising cost trajectory is deteriorating; a rising completion
 * trajectory is improving. The view model supplies the verdict, because only the domain knows which
 * way is up for a given metric — a component that inferred it from the arrow would be computing.
 */
export function TrajectoryIndicator({ trajectory }: { readonly trajectory: TrajectoryViewModel }): JSX.Element {
  const toneFor: Readonly<Record<TrajectoryViewModel['direction'], StatusTone>> = {
    improving: 'positive',
    stable: 'neutral',
    deteriorating: 'critical',
    unknown: 'neutral',
  };
  const glyph = trajectory.glyph.length > 0
    ? trajectory.glyph
    : TRAJECTORY_GLYPH[trajectory.direction];
  return (
    <span className="gl-row-tight">
      <span className={`gl-chip ${TONE_CLASS[toneFor[trajectory.direction]]}`}>
        <span className="gl-chip-glyph" aria-hidden="true">{glyph}</span>
        <span>{trajectory.label}</span>
      </span>
      <span className="gl-caption">{trajectory.windowLabel}</span>
    </span>
  );
}

/**
 * Data confidence — deliberately *not* a status badge.
 *
 * `PRODUCT_SPEC.md` §3.4: Data Confidence is separate from Project Health, and §8 prohibition 7
 * forbids a blended score. Rendering confidence in the RAG ramp would invite exactly that
 * conflation, so it uses the neutral chip and always states its rationale.
 */
export function ConfidenceBadge({ confidence }: { readonly confidence: ConfidenceViewModel }): JSX.Element {
  return (
    <span className="gl-chip gl-chip-neutral" title={confidence.rationale}>
      <span className="gl-chip-glyph" aria-hidden="true">◆</span>
      <span>{`${confidence.label} confidence`}</span>
      <span className="gl-visually-hidden">{` — ${confidence.rationale}`}</span>
    </span>
  );
}

/**
 * Reported status versus system-assessed status — the AC-2 component.
 *
 * The whole point is that a disagreement must be *unmissable and neutral*: both verdicts side by
 * side, both attributed, neither styled as the winner. The product's job is to show the divergence
 * and route to the evidence, not to declare the delivery manager wrong on a chip.
 */
export function StatusConflict({ conflict }: { readonly conflict: StatusConflictViewModel }): JSX.Element {
  return (
    <section className="gl-card gl-card-pad gl-stack" aria-label="Status divergence">
      <div className="gl-row" style={{ justifyContent: 'space-between' }}>
        <span className="gl-eyebrow">Status divergence</span>
        <span className="gl-chip gl-chip-analytic">
          <span className="gl-chip-glyph" aria-hidden="true">⇄</span>
          <span>Reported ≠ Assessed</span>
        </span>
      </div>
      <div className="gl-row" style={{ gap: 'var(--gl-space-lg)' }}>
        <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
          <span className="gl-caption">{`Reported by ${conflict.reportedBy}`}</span>
          <HealthBadge status={conflict.reported} />
        </div>
        <span aria-hidden="true" className="gl-caption">vs</span>
        <div className="gl-stack" style={{ gap: 'var(--gl-space-xxs)' }}>
          <span className="gl-caption">System-assessed</span>
          <HealthBadge status={conflict.assessed} />
        </div>
      </div>
      <p className="gl-body-sm" style={{ margin: 0 }}>{conflict.divergenceSummary}</p>
      {conflict.evidence !== undefined
        ? <EvidenceDisclosure evidence={conflict.evidence} label="Show the divergence evidence" />
        : null}
    </section>
  );
}
