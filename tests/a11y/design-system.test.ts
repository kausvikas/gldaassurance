/**
 * The design system, asserted rather than described.
 *
 * `BRAND_DESIGN_SYSTEM.md` §2 ends with an instruction to Phase 6: *"encode these as lint-checkable
 * token pairings, not as documentation alone."* This suite is the discharge of that instruction, and
 * it works in the direction that matters — every ratio is **recomputed from the palette**, never
 * transcribed from the document. A stated ratio nobody recalculates is a stated ratio that drifts,
 * and the drift is silent because the document keeps saying the old number.
 *
 * So if someone lightens `impact-orange` to make it "work" as body text, three tests fail and one of
 * them names the rule they broke.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRAND, DARK_THEME, LIGHT_THEME, PAIRING_RULES, RADIUS, SPACE, STATUS, STATUS_TONES,
  SURFACE_HEX, TOKEN_NAMES, TYPE, WCAG, contrastRatioRounded, designSystemCss, meetsContrast,
  parseHex,
} from '@presentation/index.js';
import { ALL_CAPABILITIES } from '@platform/authz';
import { ALL_DESTINATIONS, NAVIGATION, PLANNED_DESTINATIONS } from '@presentation/shell/navigation.js';

const brandDoc = readFileSync('BRAND_DESIGN_SYSTEM.md', 'utf8');
const css = designSystemCss();

describe('the palette is what BRAND_DESIGN_SYSTEM.md §1 says it is', () => {
  it('carries every brand token at its stated value', () => {
    // Transcribed independently from §1 — comparing the palette to itself would pass forever.
    const expected: Readonly<Record<string, string>> = {
      steelGray100: '#181A24',
      white: '#FFFFFF',
      lightSteel: '#F2F3F6',
      steelGray25: '#C8CAD3',
      steelGray50: '#858A9B',
      steelGray75: '#484F6B',
      impactOrange: '#FF5F2D',
      impactBlue: '#4442E3',
      lightBlue: '#D5D4FF',
      green: '#2E776A',
      lightGreen: '#91C4BB',
    };
    expect(BRAND).toEqual(expected);
  });

  it('names every brand hex in the approved document, so no colour was invented', () => {
    for (const hex of Object.values(BRAND)) {
      expect(brandDoc, `${hex} is not in BRAND_DESIGN_SYSTEM.md`).toContain(hex);
    }
    for (const hex of Object.values(STATUS)) {
      expect(brandDoc, `${hex} is not in BRAND_DESIGN_SYSTEM.md`).toContain(hex);
    }
  });

  it('parses every declared colour', () => {
    for (const hex of [...Object.values(BRAND), ...Object.values(STATUS)]) {
      expect(() => parseHex(hex)).not.toThrow();
    }
  });
});

describe('measured contrast matches the document (§2)', () => {
  /** §2's tables, transcribed by hand from the document. */
  const STATED: readonly (readonly [string, keyof typeof SURFACE_HEX, number])[] = [
    [BRAND.steelGray100, 'white', 17.33],
    [BRAND.steelGray75, 'white', 8.06],
    [BRAND.impactBlue, 'white', 6.70],
    [BRAND.green, 'white', 5.30],
    [BRAND.steelGray50, 'white', 3.44],
    [BRAND.impactOrange, 'white', 3.03],
    [BRAND.steelGray100, 'lightSteel', 15.61],
    [BRAND.steelGray75, 'lightSteel', 7.26],
    [BRAND.impactBlue, 'lightSteel', 6.04],
    [BRAND.green, 'lightSteel', 4.78],
    [BRAND.steelGray50, 'lightSteel', 3.10],
    [BRAND.impactOrange, 'lightSteel', 2.73],
    [BRAND.white, 'steelGray100', 17.33],
    [BRAND.lightBlue, 'steelGray100', 12.12],
    [BRAND.steelGray25, 'steelGray100', 10.60],
    [BRAND.lightGreen, 'steelGray100', 8.92],
    [BRAND.impactOrange, 'steelGray100', 5.71],
    [BRAND.steelGray50, 'steelGray100', 5.04],
    [BRAND.green, 'steelGray100', 3.27],
    [BRAND.impactBlue, 'steelGray100', 2.59],
  ];

  for (const [fg, surface, stated] of STATED) {
    it(`${fg} on ${surface} measures ${stated.toFixed(2)}`, () => {
      expect(contrastRatioRounded(fg, SURFACE_HEX[surface])).toBeCloseTo(stated, 1);
    });
  }
});

describe('the §2.1 pairing rules hold (REQ-UX-003)', () => {
  for (const rule of PAIRING_RULES) {
    it(`${rule.rule}: ${rule.foreground} on ${rule.surface} for ${rule.use} is ${rule.permitted ? 'permitted' : 'prohibited'}`, () => {
      expect(meetsContrast(rule.foreground, SURFACE_HEX[rule.surface], rule.use)).toBe(rule.permitted);
    });
  }

  it('covers each of the four §2.1 rules at least once', () => {
    for (const rule of ['§2.1.1', '§2.1.2', '§2.1.3', '§2.1.4']) {
      expect(PAIRING_RULES.some((r) => r.rule === rule), rule).toBe(true);
    }
  });
});

describe('the functional status ramp is accessible on every surface it is used on (§3.2)', () => {
  it('clears normal-text contrast on both light surfaces', () => {
    for (const [name, hex] of [['amber', STATUS.amberOnLight], ['red', STATUS.redOnLight], ['green', BRAND.green]] as const) {
      for (const surface of ['white', 'lightSteel'] as const) {
        expect(
          contrastRatioRounded(hex, SURFACE_HEX[surface]),
          `${name} on ${surface}`,
        ).toBeGreaterThanOrEqual(WCAG.normalText);
      }
    }
  });

  it('clears normal-text contrast on the dark surface', () => {
    for (const [name, hex] of [['amber', STATUS.amberOnDark], ['red', STATUS.redOnDark], ['green', BRAND.lightGreen]] as const) {
      expect(
        contrastRatioRounded(hex, SURFACE_HEX.steelGray100),
        `${name} on dark`,
      ).toBeGreaterThanOrEqual(WCAG.normalText);
    }
  });

  /**
   * The exact figures §10 publishes. Stated numbers get quoted into decks and slide reviews, so they
   * are pinned here — the first draft of §10 carried four ratios that were wrong, and this is the
   * assertion that would have caught them.
   */
  it('measures exactly what BRAND_DESIGN_SYSTEM.md §10 publishes', () => {
    const stated: readonly (readonly [string, keyof typeof SURFACE_HEX, number])[] = [
      [STATUS.amberOnLight, 'white', 6.33],
      [STATUS.amberOnLight, 'lightSteel', 5.70],
      [STATUS.redOnLight, 'white', 6.54],
      [STATUS.redOnLight, 'lightSteel', 5.89],
      [STATUS.amberOnDark, 'steelGray100', 9.68],
      [STATUS.redOnDark, 'steelGray100', 10.15],
    ];
    for (const [fg, surface, ratio] of stated) {
      expect(contrastRatioRounded(fg, SURFACE_HEX[surface]), `${fg} on ${surface}`).toBeCloseTo(ratio, 1);
      expect(brandDoc, `${ratio.toFixed(2)} is not published in §10`).toContain(ratio.toFixed(2));
    }
  });

  it('gives every status a distinct shape as well as a colour (REQ-UX-002)', () => {
    const glyphs = Object.values(STATUS_TONES).map((s) => s.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    for (const def of Object.values(STATUS_TONES)) {
      expect(def.glyph.length).toBeGreaterThan(0);
      expect(def.label.length).toBeGreaterThan(0);
    }
  });
});

describe('semantic tokens (§3.1)', () => {
  it('defines the same token names in both themes, so a theme swap cannot leave a hole', () => {
    expect(Object.keys(LIGHT_THEME).sort()).toEqual(Object.keys(DARK_THEME).sort());
    expect(TOKEN_NAMES.length).toBeGreaterThan(25);
  });

  it('never puts impact-blue on a dark surface (§2.1 rule 2)', () => {
    // The prohibition is structural: the token simply is not in the dark map.
    expect(Object.values(DARK_THEME)).not.toContain(BRAND.impactBlue);
  });

  it('uses light-green, not green, for positive text on dark (§2.1 rule 3)', () => {
    expect(DARK_THEME['--gl-status-positive']).toBe(BRAND.lightGreen);
    expect(LIGHT_THEME['--gl-status-positive']).toBe(BRAND.green);
  });

  it('offers no token that would let a component set orange body text', () => {
    // There is deliberately no `--gl-text-*` token bound to impact-orange on a light surface.
    for (const [name, value] of Object.entries(LIGHT_THEME)) {
      if (name.startsWith('--gl-text-')) expect(value).not.toBe(BRAND.impactOrange);
    }
  });
});

describe('scales (§4, §5)', () => {
  it('keeps every spacing step on the 4px base', () => {
    for (const [name, value] of Object.entries(SPACE)) {
      const px = Number.parseInt(value.replace('px', ''), 10);
      expect(px % 4, `${name} = ${value}`).toBe(0);
    }
  });

  it('caps square-cornered radius at 8px and keeps the pill a pill', () => {
    expect(RADIUS.control).toBe('4px');
    expect(RADIUS.card).toBe('8px');
    expect(RADIUS.pill).toBe('999px');
  });

  it('never sets body-bearing text below 12px, and body itself at 15px (§4)', () => {
    expect(TYPE.body.size).toBe('15px');
    expect(TYPE.bodySm.size).toBe('13px');
    expect(TYPE.caption.size).toBe('12px');
    for (const role of Object.values(TYPE)) {
      expect(Number.parseInt(role.size.replace('px', ''), 10)).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('the stylesheet is generated from tokens, not written by hand', () => {
  it('contains no colour literal of its own (REQ-UX-001, G-COLOUR)', () => {
    // Token *values* legitimately appear once, inside :root and .gl-theme-dark. Everything after
    // those two blocks must be var() or color-mix().
    const afterThemes = css.slice(css.indexOf('/* --- reset'));
    expect(afterThemes).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(afterThemes).not.toMatch(/\brgba?\s*\(/);
    expect(afterThemes).not.toMatch(/\bhsla?\s*\(/);
  });

  it('declares every semantic token in :root', () => {
    for (const name of TOKEN_NAMES) {
      expect(css, name).toContain(`${name}:`);
    }
  });

  it('provides a visible focus ring on every focusable element (REQ-UX-006)', () => {
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 2px solid var(--gl-border-focus)');
    expect(css).toContain('outline-offset: 2px');
  });

  it('honours prefers-reduced-motion (§5)', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('carries the 12-column grid and its responsive collapse (§5)', () => {
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('.gl-col-12');
    expect(css).toContain('@media (max-width: 1200px)');
    expect(css).toContain('@media (max-width: 900px)');
  });

  it('caps content at the 1440px max width', () => {
    expect(css).toContain('--gl-grid-max: 1440px');
  });

  it('uses tabular lining numerals wherever figures are rendered (§4)', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums lining-nums');
  });

  it('applies text-muted only at large sizes (§2.1 rule 4)', () => {
    // steel-gray-50 measures 3.44 on white: legal for large text, never for body or caption.
    const mutedRules = css.split('}').filter((block) => block.includes('var(--gl-text-muted)'));
    for (const block of mutedRules) {
      const isLargeOnly = block.includes('gl-muted-lg')
        || block.includes('gl-nav-item[aria-disabled')
        || block.includes('gl-state-glyph');
      expect(isLargeOnly, `text-muted used in: ${block.trim().slice(0, 80)}`).toBe(true);
    }
  });
});

describe('navigation taxonomy', () => {
  it('gives every destination a unique id and a named surface', () => {
    const ids = ALL_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ALL_DESTINATIONS) {
      expect(d.surface.length, d.id).toBeGreaterThan(0);
      expect(d.label.length, d.id).toBeGreaterThan(0);
      expect(d.href.startsWith('/'), d.id).toBe(true);
    }
  });

  it('carries the ten active destinations the phase briefs name', () => {
    const labels = NAVIGATION.flatMap((g) => g.items).map((i) => i.label);
    for (const expected of [
      'Portfolio', 'Green-at-Risk', 'Projects', 'Financial Intelligence', 'Early Warnings',
      'Recovery', 'Assurance', 'Data Quality', 'Rules & Models',
      // Phase 11B. Filed under Governance because it explains governed assessments and cannot
      // produce them - see the placement note in navigation.ts.
      'Assistant',
    ]) {
      expect(labels, expected).toContain(expected);
    }
    expect(labels.length).toBe(10);
  });

  it('declares the three future destinations as disabled and labelled, not hidden', () => {
    expect(PLANNED_DESTINATIONS.map((d) => d.label))
      .toEqual(['Benchmarks', 'Deal Intelligence', 'Administration']);
    for (const d of PLANNED_DESTINATIONS) {
      expect(d.enabled, d.id).toBe(false);
      expect(d.stateLabel, d.id).toBe('Planned');
    }
  });

  it('treats capability as a presentation hint, never as the authorization control', () => {
    /*
     * Every capability named must be one the server actually declares, so the hint cannot drift
     * into being a second, wrong copy of the policy.
     *
     * This assertion used to hold a **hand-maintained list of six capability names** - which was
     * itself the second, wrong copy it warns against, and it failed the moment a tenth destination
     * named a capability the server had declared since Phase 5 (`assistant.use`). It now reads
     * `ALL_CAPABILITIES` from the policy, so the only way to fail it is to name something the
     * server genuinely does not have.
     */
    const declared = new Set<string>(ALL_CAPABILITIES);
    for (const d of ALL_DESTINATIONS) {
      if (d.requiresCapability !== undefined) {
        expect(declared, `${d.id} names an undeclared capability`).toContain(d.requiresCapability);
      }
    }
  });
});
