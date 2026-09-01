/**
 * The `DEMO — SYNTHETIC DATA` marker (REQ-UX-005, global invariant 11).
 *
 * **The string is never typed here.** It arrives from `DEMO_DATA_BANNER`, re-exported by `@app` from
 * `platform/config`, and the G-DEMO source gate fails the build on any literal spelling of it inside
 * `src/presentation`. That is deliberate: a marker somebody can retype is a marker somebody can
 * mistype, shorten, or — the failure that actually matters — omit on the one screen that ends up in
 * a deck.
 *
 * `BRAND_DESIGN_SYSTEM.md` §6 fixes the treatment, and one clause of it is a contrast constraint
 * rather than a style preference: the badge may be orange on **white or dark**, never orange on
 * `light-steel`, where `impact-orange` measures 2.73:1 and fails even the graphics threshold
 * (§2.1 rule 1). Hence the white chip surface with an orange border and dot — the orange is a
 * *boundary and a mark*, and the text carrying the meaning is `text/primary` at 17.33:1.
 *
 * It is not dismissible. There is no prop for that, and adding one would be a requirement change.
 */
import type { JSX } from 'react';
import { DEMO_DATA_BANNER } from '@app';

export interface DemoSyntheticDataBadgeProps {
  /** Rendered inside a dark region — the token layer handles the rest via `.gl-theme-dark`. */
  readonly onDark?: boolean;
}

export function DemoSyntheticDataBadge({ onDark = false }: DemoSyntheticDataBadgeProps): JSX.Element {
  return (
    <span
      className={`gl-demo-badge${onDark ? ' gl-theme-dark' : ''}`}
      role="note"
      aria-label={`${DEMO_DATA_BANNER}. This environment contains no real client, employee or financial data.`}
    >
      <span className="gl-demo-badge-dot" aria-hidden="true" />
      <span aria-hidden="true">{DEMO_DATA_BANNER}</span>
    </span>
  );
}

/** The banner text, for surfaces that need it in a sentence rather than a chip (exports, print). */
export const DEMO_MARKER_TEXT: string = DEMO_DATA_BANNER;
