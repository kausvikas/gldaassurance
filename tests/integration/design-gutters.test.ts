/**
 * A vertical divider must have the same air on both sides.
 *
 * This bug was found by eye three times in one session, in three components, always the same shape:
 * `padding: Npx Mpx Npx 0` on an element that also draws `border-right`. Zero on the left, something
 * on the right, and the rule painted on the right edge — so every cell after the first has its
 * content pressed against the divider to its left while all the air sits on the far side of the
 * divider to its right. Evenly spaced rules with unevenly placed content is exactly what a reader
 * reports as "the columns don't line up", and it is invisible in a mockup with one column.
 *
 * The rule is narrow and only applies to *vertical* dividers. A table cell's `border-bottom` with no
 * left padding is correct — there is no rule beside the text for it to crowd — which is why this
 * checks `border-right` specifically rather than banning the padding shape outright.
 */
import { describe, expect, it } from 'vitest';
import { GL_CSS } from '../../scripts/design/gl-theme.js';

/** Declaration blocks, as `selector` → `body`. Enough for a stylesheet this file also authored. */
function blocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  // Strip comments first: they contain braces and prose that would otherwise parse as rules.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bare)) !== null) {
    out.push({ selector: (m[1] ?? '').trim().replace(/\s+/g, ' '), body: (m[2] ?? '').trim() });
  }
  return out;
}

describe('vertical dividers have symmetric gutters', () => {
  it('no rule draws a right border while zeroing its left padding', () => {
    const offenders: string[] = [];
    for (const { selector, body } of blocks(GL_CSS)) {
      if (!/border-right:\s*1px\s+solid/.test(body)) continue;

      // `padding: a b c d` — the fourth value is the left inset.
      const shorthand = /padding:\s*([^;}]+)/.exec(body);
      if (shorthand) {
        const parts = (shorthand[1] ?? '').trim().split(/\s+/);
        const left = parts.length === 4 ? parts[3] : parts.length === 2 ? parts[1] : parts[0];
        if (left === '0' || left === '0px') offenders.push(`${selector} { padding: ${parts.join(' ')} }`);
      }
      const explicit = /padding-left:\s*0(px)?\s*(;|$)/.test(body);
      if (explicit) offenders.push(`${selector} { padding-left: 0 }`);
    }
    /*
     * `:first-child` is the one legitimate exception and is not in the list above, because a first
     * column has no divider on its left and *should* sit flush with the page's left margin — the
     * headline, the prose and the tables all align there.
     */
    expect(
      offenders.filter((o) => !/:first-child|:nth-child\(1\)/.test(o)),
      'a right border needs equal padding on both sides — see .gl-fig and .gl-flow',
    ).toEqual([]);
  });

  it('the components this was found in keep their symmetric padding', () => {
    /*
     * Every block for the selector, not the last one. A selector appears more than once — the base
     * rule and its narrow-viewport override — and keying a Map by selector silently kept whichever
     * came last, which here was a media query that sets no shorthand padding at all. The first
     * version of this test failed for that reason and not because the CSS was wrong.
     */
    for (const selector of ['.gl-fig', '.gl-flow>div']) {
      const bodies = blocks(GL_CSS).filter((b) => b.selector === selector).map((b) => b.body);
      expect(bodies.length, `${selector} should still exist`).toBeGreaterThan(0);

      const shorthands = bodies
        .map((body) => /padding:\s*([^;}]+)/.exec(body)?.[1])
        .filter((v): v is string => v !== undefined)
        .map((v) => v.trim().split(/\s+/));
      expect(shorthands.length, `${selector} should set shorthand padding somewhere`).toBeGreaterThan(0);
      for (const parts of shorthands) {
        // Two values means "vertical horizontal" — symmetric by construction, which is the point.
        expect(parts.length, `${selector} should use symmetric padding, got: ${parts.join(' ')}`).toBe(2);
      }
    }
  });
});
