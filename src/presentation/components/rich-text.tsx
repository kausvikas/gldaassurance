/**
 * Renders governed prose that carries `**emphasis**` markers.
 *
 * ## Why this exists
 *
 * The domain and application layers write executive prose with Markdown-style emphasis — *"the
 * residual is **not** subtracted from the total above"*, *"**Neither figure is in forecast
 * revenue.**"*. React escapes text nodes, so those markers reached the browser as **literal
 * asterisks**: the Phase 12A browser review counted **220 of them across five pages**, 116 on the
 * Margin page alone. Every one sat in a sentence an executive was meant to read.
 *
 * The emphasis is deliberate and load-bearing — it marks the clause a reader must not skip, and
 * several of those clauses are the ones the trust contract requires to be prominent. So the fix
 * renders the marker rather than stripping it.
 *
 * **Presentation only.** No string in the domain or application layer changes; the markers were
 * always there and were always meant to be emphasis.
 */
import type { JSX } from 'react';

/** Splits on paired `**` and emits `<strong>` for the enclosed runs. Odd markers render as text. */
export function RichText({ text }: { readonly text: string }): JSX.Element {
  const parts = text.split('**');
  // An even number of separators means every marker was paired; an odd trailing run is literal.
  return (
    <>
      {parts.map((part, i) => (
        // Position in the split IS the identity of a fragment; there is no other stable key.
        i % 2 === 1 && i < parts.length - 1
          ? <strong key={`s${String(i)}`}>{part}</strong>
          : <span key={`t${String(i)}`}>{part}</span>
      ))}
    </>
  );
}

/**
 * Renders a governed instant as an executive date.
 *
 * The wire format is an ISO-8601 instant (`2026-08-31T09:00:00.000Z`) because that is what a
 * governed `asOf` *is*, and it must stay that on the wire. But Phase 12A counted **138 of them
 * rendered raw** across the pages — in evidence panels, on the assistant's scope line, beside
 * figures — while the very same pages say *"as at 31 Aug 2026"* two inches away. An executive reads
 * the second and stumbles on the first.
 *
 * **No numeric parsing.** The month is looked up from its two-digit string, not converted — the
 * G-FLOAT gate forbids `parseInt`/`Number()` in presentation, and a date formatter has no business
 * doing arithmetic anyway. A string that is not an ISO instant is returned untouched rather than
 * mangled.
 */
const MONTH_BY_NUMBER: Readonly<Record<string, string>> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

export function formatInstant(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (m === null) return iso;
  const [, year, month, day, hh, mm] = m;
  const monthName = MONTH_BY_NUMBER[month ?? ''] ?? month ?? '';
  const dayText = (day ?? '').replace(/^0/, '');
  // Midnight UTC is a date, not a moment; showing 00:00 on it reads as false precision.
  const time = hh === '00' && mm === '00' ? '' : ` ${hh ?? ''}:${mm ?? ''} UTC`;
  return `${dayText} ${monthName} ${year ?? ''}${time}`;
}
