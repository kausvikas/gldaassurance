# BRAND_DESIGN_SYSTEM.md — GlobalLogic Visual Language

**Status:** Approved baseline (Phase 0) — **implemented as tokens and primitives in Phase 6**
**Version:** 1.1.0
**Authority:** For colour, type, spacing and status semantics, this file outranks any component.
No screen may introduce a colour, spacing value, or status treatment not defined here (REQ-UX-001).

> **Phase 0 boundary:** this file defines the *system*. Phase 6 implements it as tokens and
> primitives. Phases 7–11 consume it and may not extend it without updating this file.

> ### What changed in 1.1.0 (Phase 6)
>
> The system is built. Nothing in §1–§8 was altered: this revision **adds §9–§11 and marks
> implementation state**, because the document had defined a system nobody could yet point at.
>
> - **§2's instruction is discharged.** It ended with *"Phase 6 must encode these as lint-checkable
>   token pairings, not as documentation alone."* Every ratio in §2 is now **recomputed from the
>   palette by test**, and §2.1's four rules are `PAIRING_RULES` in
>   `src/presentation/tokens/tokens.ts`, asserted case by case.
> - **§8's prohibitions are mechanical where they can be.** A hex value in a component fails the
>   build (G-COLOUR); a hand-typed demo marker fails the build (G-DEMO); a status without a glyph and
>   a label is unconstructible, because the type requires both.
> - **New: §9** implementation map · **§10** the functional amber and red, with their reasoning and
>   measurements · **§11** what Phase 6 did *not* verify.
>
> Two things a reader should not infer: no brand token changed, and no new colour was introduced. The
> only additions to the palette are the derived dark-elevation steps §3.1 already sanctioned.

---

## 1. Brand tokens (authoritative palette)

These are the current GlobalLogic product UI values. **They are given, not chosen.** Do not
substitute, tint, shade, or "improve" them outside the derived scales in §3.

| Token | Hex | Role |
| --- | --- | --- |
| `steel-gray-100` | `#181A24` | Primary dark; text on light; dark-mode surface |
| `white` | `#FFFFFF` | Primary light surface |
| `light-steel` | `#F2F3F6` | Secondary light surface, app background |
| `steel-gray-25` | `#C8CAD3` | Hairlines, dividers, disabled on light |
| `steel-gray-50` | `#858A9B` | Secondary text (large only on light), muted UI |
| `steel-gray-75` | `#484F6B` | Body secondary text on light, strong borders |
| `impact-orange` | `#FF5F2D` | **Brand/action emphasis** — deliberate and scarce |
| `impact-blue` | `#4442E3` | **Principal analytical / predictive accent** |
| `light-blue` | `#D5D4FF` | Analytical fills, selection, dark-mode accent text |
| `green` | `#2E776A` | Positive / healthy |
| `light-green` | `#91C4BB` | Positive fills, dark-mode positive text |

**No GlobalLogic logo asset is fabricated in this repository.** Where a logo would appear, the demo
uses a neutral wordmark placeholder clearly marked as such.

---

## 2. Measured contrast — binding constraints

Computed WCAG 2.2 relative-luminance ratios for this exact palette. **These are measurements, not
estimates**, and they constrain what Phase 6 may build.

### On `white` `#FFFFFF`

| Token | Ratio | Normal text (≥4.5) | Large text (≥3) | UI / graphics (≥3) |
| --- | --- | --- | --- | --- |
| `steel-gray-100` | **17.33** | ✅ AAA | ✅ | ✅ |
| `steel-gray-75` | **8.06** | ✅ AAA | ✅ | ✅ |
| `impact-blue` | **6.70** | ✅ AA | ✅ | ✅ |
| `green` | **5.30** | ✅ AA | ✅ | ✅ |
| `steel-gray-50` | **3.44** | ❌ | ✅ | ✅ |
| `impact-orange` | **3.03** | ❌ | ✅ | ✅ |
| `light-blue` | 1.43 | ❌ | ❌ | ❌ |
| `steel-gray-25` | 1.63 | ❌ | ❌ | ❌ |
| `light-green` | 1.94 | ❌ | ❌ | ❌ |

### On `light-steel` `#F2F3F6`

| Token | Ratio | Normal text | Large text | UI / graphics |
| --- | --- | --- | --- | --- |
| `steel-gray-100` | **15.61** | ✅ AAA | ✅ | ✅ |
| `steel-gray-75` | **7.26** | ✅ AAA | ✅ | ✅ |
| `impact-blue` | **6.04** | ✅ AA | ✅ | ✅ |
| `green` | **4.78** | ✅ AA | ✅ | ✅ |
| `steel-gray-50` | **3.10** | ❌ | ✅ | ✅ |
| `impact-orange` | **2.73** | ❌ | ❌ | ❌ |

### On `steel-gray-100` `#181A24` (dark surfaces)

| Token | Ratio | Normal text | Large text | UI / graphics |
| --- | --- | --- | --- | --- |
| `white` | **17.33** | ✅ AAA | ✅ | ✅ |
| `light-steel` | **15.61** | ✅ AAA | ✅ | ✅ |
| `light-blue` | **12.12** | ✅ AAA | ✅ | ✅ |
| `steel-gray-25` | **10.60** | ✅ AAA | ✅ | ✅ |
| `light-green` | **8.92** | ✅ AAA | ✅ | ✅ |
| `impact-orange` | **5.71** | ✅ AA | ✅ | ✅ |
| `steel-gray-50` | **5.04** | ✅ AA | ✅ | ✅ |
| `green` | 3.27 | ❌ | ✅ | ✅ |
| `impact-blue` | 2.59 | ❌ | ❌ | ❌ |

### 2.1 Rules that follow directly from these measurements

These are the non-obvious constraints that would otherwise be discovered late, on a finished screen:

1. **`impact-orange` may never be used for normal-size body text on any light surface** (3.03 on
   white, 2.73 on light-steel). It is legal for large text (≥24px, or ≥19px bold) on white **only**,
   and for icons, borders, bars, and fills anywhere on white. On `light-steel` it fails even the
   3:1 graphics threshold — **orange on the app background is prohibited for anything conveying
   meaning.** Use it on white cards, or as a dark-surface accent where it scores 5.71.
2. **`impact-blue` may not be used on dark surfaces** (2.59). On dark, the analytical accent is
   `light-blue` (12.12).
3. **`green` on dark is large-text/graphics only** (3.27). For positive *text* on dark, use
   `light-green` (8.92).
4. **`steel-gray-50` is not a body-text colour on light surfaces** (3.44 / 3.10). It is legal for
   large text, icons, and borders. Secondary body text on light is `steel-gray-75` (8.06 / 7.26).
5. **`steel-gray-25`, `light-blue` and `light-green` are fill-and-hairline colours on light
   surfaces only.** They carry no meaning that a user must read.

Phase 6 must encode these as lint-checkable token pairings, not as documentation alone.

---

## 3. Semantic tokens

Components reference **semantic** tokens; only the token layer references brand hex values. A
component containing a hex value is a defect (REQ-UX-001).

### 3.1 Surface & text

| Semantic | Light theme | Dark theme |
| --- | --- | --- |
| `surface/app` | `light-steel` | `steel-gray-100` |
| `surface/card` | `white` | `#20222E` (derived +1 step) |
| `surface/raised` | `white` + elevation | `#282B39` (derived +2 steps) |
| `text/primary` | `steel-gray-100` | `white` |
| `text/secondary` | `steel-gray-75` | `steel-gray-25` |
| `text/muted` | `steel-gray-50` (large only) | `steel-gray-50` |
| `border/hairline` | `steel-gray-25` | `steel-gray-75` |
| `border/strong` | `steel-gray-75` | `steel-gray-50` |

> Derived dark surfaces are the only permitted palette extensions, and only for elevation steps.

### 3.2 Status (RAG) — functional, not decorative

Brand colours alone cannot carry RAG: the palette has no red, and orange fails contrast on the app
background. Status therefore uses a **functional status ramp** defined here, held to the same
accessibility bar, and **never used for anything except status**.

| Status | Light text/icon | Light fill | Dark text/icon | Requirement |
| --- | --- | --- | --- | --- |
| **Green / Healthy** | `green` `#2E776A` | `light-green` @ 24% | `light-green` `#91C4BB` | ✅ icon + label always |
| **Amber / At risk** | `#8A5300` (functional) | `#F5C77E` @ 24% | `#F0B860` | ✅ icon + label always |
| **Red / Critical** | `#B3261E` (functional) | `#F4B4B0` @ 24% | `#F2B8B5` | ✅ icon + label always |
| **Grey / No data** | `steel-gray-50` | `steel-gray-25` @ 40% | `steel-gray-50` | ✅ icon + label always |

**Implemented** in `src/presentation/tokens/palette.ts` (`STATUS`) and `tokens.ts`
(`STATUS_TONES`, `CLASSIFICATION`-independent). See §10 for how the amber and red values were chosen
and what they measure.

**Status rules**

- **Never colour-only** (REQ-UX-002). Every status shows a distinct **shape/icon** *and* a **text
  label**: ● Healthy, ▲ At risk, ■ Critical, ◌ No data. A user with deuteranopia, a printed page,
  and a screenshot in a deck must all remain readable.
- Functional amber/red are **not brand colours** and are used **only** for status. They may not
  appear in charts, buttons, links, or decoration.
- Status colour never competes with `impact-orange`. If a screen has both a status ramp and a
  primary action, the action is the only orange element in view.

### 3.3 Provenance treatments (ADR-0004, REQ-UX-004)

Three layers must be visually distinguishable at a glance. This is a **required** part of the system,
not a nicety — it is what makes AC-3 legible.

| Layer | Treatment | Rationale |
| --- | --- | --- |
| **L1 Observed fact** | Plain `text/primary`, no decoration | Facts look like facts |
| **L2 Derived metric** | `text/primary` with a subtle dotted underline; hover/focus reveals formula, inputs, rule version | Signals "this was computed, and you can see how" |
| **L3 Inferred** | Contained in a bordered `impact-blue` / `light-blue` panel with an explicit "Inferred" chip and confidence indicator | Blue is the analytical/predictive accent; containment prevents inferences from reading as facts |

**Restricted fields** (ADR-0005 §4) render as a neutral "Restricted" chip in `text/muted` with a lock
glyph — conveying nothing about the withheld value's existence, magnitude, or type beyond the fact of
restriction.

### 3.4 Data visualisation

Governed by the `dataviz` skill's principles, constrained to this palette.

- **Primary series / analytical emphasis:** `impact-blue`.
- **Comparison / baseline series:** `steel-gray-50` or `steel-gray-25` — baselines recede.
- **Positive delta:** `green`. **Negative delta:** functional red. Always paired with a `+`/`−` sign
  or direction glyph, never colour-only.
- **`impact-orange` in charts is reserved for the single element the user must act on** — the
  highlighted project, the intervention point, the threshold crossing. Typically **one orange mark
  per chart**. If everything is orange, nothing is urgent.
- Categorical sequences derive from `impact-blue` and `steel-gray-*` ramps; hue-cycling outside the
  palette is prohibited.
- Every chart has a text alternative and an accessible data table (REQ-UX-006).
- Forecast/projected segments are visually distinct from actuals (dashed, reduced opacity) **and**
  labelled — a projection that looks like an actual is a provenance failure (§3.3).

---

## 4. Typography

| Role | Size / weight | Token |
| --- | --- | --- |
| Display (executive headline metric) | 40–48px / 600 | `type/display` |
| H1 page title | 28px / 600 | `type/h1` |
| H2 section | 22px / 600 | `type/h2` |
| H3 card title | 17px / 600 | `type/h3` |
| Body | 15px / 400, line-height 1.5 | `type/body` |
| Body small / secondary | 13px / 400 | `type/body-sm` |
| Caption / metadata | 12px / 400 | `type/caption` |
| Numeric (all figures) | Tabular lining figures, 500 | `type/numeric` |

**Rules**

- **All monetary and metric figures use tabular (monospaced) lining numerals.** Executives compare
  numbers vertically down a column; proportional figures make columns ragged and slow the scan that
  AC-1 depends on.
- Minimum body size 13px. `type/caption` is for metadata (timestamps, rule versions), never for
  content a decision rests on.
- Font family: the GlobalLogic product typeface where licensed; otherwise a neutral system stack.
  **Do not embed or fabricate a licensed font file in this repository.**

---

## 5. Spacing, layout, motion

- **4px base unit.** Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. No arbitrary values.
- **Radius:** 4px controls, 8px cards, 999px chips.
- **Elevation:** three levels only. Elevation indicates layering, never importance — importance is
  typographic and positional.
- **Grid:** 12-column, 24px gutters, max content width 1440px.
- **Density:** executive surfaces use comfortable density; tabular drill-downs use compact.
- **Motion:** 150ms ease-out for state, 250ms for surfaces. Respect
  `prefers-reduced-motion`. **Nothing critical is communicated by motion alone.** No animated
  attention-grabbing on status — a deteriorating project is communicated by rank and label, not by
  pulsing.

---

## 6. Demo labelling (REQ-UX-005)

Every screen and every export carries a persistent, unmissable `DEMO — SYNTHETIC DATA` marker:

- Fixed chip in the application header, present on every route.
- Repeated in every export (PDF/CSV/image) header or footer.
- Styled with `impact-orange` on `white`/dark surface at large-text size or as an icon+label chip
  — never orange text at body size on `light-steel` (§2.1 rule 1).
- **Not dismissible.** A demo screenshot that circulates without this marker is exactly the risk
  the requirement exists to prevent.

---

## 7. Accessibility commitments (REQ-UX-002, 003, 006)

| Commitment | Standard |
| --- | --- |
| Text contrast | WCAG 2.2 AA — 4.5:1 normal, 3:1 large, per §2 measurements |
| UI/graphics contrast | 3:1 for boundaries and meaningful graphics |
| Colour independence | No meaning conveyed by colour alone, anywhere |
| Keyboard | All interactive elements reachable and operable; visible focus ring (3:1 against adjacent colour) |
| Screen readers | Semantic landmarks; charts have text alternatives and data tables |
| Motion | `prefers-reduced-motion` honoured |
| Target size | ≥24×24px minimum interactive target |
| Zoom | Usable at 200% without horizontal scrolling of content |

---

## 8. Prohibitions

1. A hex value inside a component (tokens only).
2. `impact-orange` as body text on any light surface; any orange on `light-steel` conveying meaning.
3. `impact-blue` on a dark surface.
4. Status by colour alone.
5. Functional amber/red used decoratively or in charts.
6. More than one `impact-orange` emphasis element competing in a single view.
7. An inferred (L3) value styled identically to an observed fact.
8. A fabricated GlobalLogic logo or an embedded licensed font file.
9. Per-screen chart palettes.
10. A screen without the `DEMO — SYNTHETIC DATA` marker.


---

## 9. Implementation map (Phase 6)

Where each part of this document lives in code. A section with no implementation reference is a
section Phase 6 did not build, and §11 says so explicitly rather than leaving it to be discovered.

| This document | Implementation | Verified by |
| --- | --- | --- |
| §1 Brand tokens | `src/presentation/tokens/palette.ts` — **the only file permitted a colour literal** (G-COLOUR exempts one path; ADR-0017 D-2) | `design-system.test.ts` "carries every brand token at its stated value" |
| §2 Measured contrast | `tokens/contrast.ts` — WCAG 2.2 luminance and ratio, recomputed | 20 generated cases asserting each stated ratio |
| §2.1 Pairing rules | `PAIRING_RULES` in `tokens/tokens.ts` | 24 generated cases, one per rule |
| §3.1 Semantic tokens | `LIGHT_THEME` / `DARK_THEME`; emitted as CSS custom properties | Both themes asserted to define identical token sets |
| §3.2 Status ramp | `STATUS_TONES`, `RAG_TONE`, `HealthBadge` | Glyph and label are **required fields**; a colour-only badge is unconstructible |
| §3.3 Provenance treatments | `ProvenanceValue`, `EvidenceDisclosure`, `.gl-prov-*` | Three distinct treatments; inference renders as a contained block |
| §3.4 Data visualisation | `components/charts.tsx` — four wrappers, inline SVG, token classes | Text alternative and data table required on every chart view model |
| §4 Typography | `TYPE`, `FONT_STACK`, `NUMERIC_FONT_FEATURES` | Body 15px, minimum 12px, tabular lining numerals asserted |
| §5 Spacing, layout, motion | `SPACE`, `RADIUS`, `ELEVATION`, `GRID`, `MOTION` | Every step a multiple of 4; `prefers-reduced-motion` present |
| §6 Demo labelling | `DemoSyntheticDataBadge`, sourced from `DEMO_DATA_BANNER` | G-DEMO fails the build on a hand-typed marker |
| §7 Accessibility | Semantic markup, landmarks, skip link, `:focus-visible`, 24px targets | 53 render assertions; **see §11 for what is not covered** |
| §8 Prohibitions | 1, 2, 3, 4, 6, 8, 9, 10 mechanically enforced; 5 and 7 by construction | Architecture gates plus `tests/a11y` |

**The component gallery** — every primitive in every state — is generated by
`npm run design:gallery` into `docs/design/component-gallery.html`. It is regenerated as part of
`npm run verify`, so a component library that cannot render fails the build.

---

## 10. The functional amber and red, and why they exist

§3.2 introduced them; this section records the reasoning, because "we picked a red" is not something
a later phase should have to re-derive.

**Why the brand palette could not carry RAG.** It contains no red at all, and `impact-orange` — the
nearest thing to amber — measures **2.73:1 on `light-steel`**, below even the 3:1 threshold for
graphics. A RAG system built from brand colours alone would be illegible on the application
background, and would also overload the brand *action* colour with *status* meaning, after which a
screen cannot distinguish "this is urgent" from "click this".

**The values, and what they measure.** Each was chosen as the darkest usable hue that clears
normal-text contrast on **both** light surfaces, paired with a light fill for chips and a
light-on-dark variant for the dark rail.

| Token | Hex | On `white` | On `light-steel` | On `steel-gray-100` | Role |
| --- | --- | --- | --- | --- | --- |
| `status.amberOnLight` | `#8A5300` | **6.33** | **5.70** | — | Amber text and icons on light |
| `status.amberFill` | `#F5C77E` | — | — | — | Amber chip fill (decorative, never load-bearing) |
| `status.amberOnDark` | `#F0B860` | — | — | **9.68** | Amber text on the dark rail |
| `status.redOnLight` | `#B3261E` | **6.54** | **5.89** | — | Red text and icons on light |
| `status.redFill` | `#F4B4B0` | — | — | — | Red chip fill |
| `status.redOnDark` | `#F2B8B5` | — | — | **10.15** | Red text on the dark rail |

Every figure above clears the 4.5:1 normal-text threshold on the surface it is used on, with the
narrowest margin being amber on `light-steel` at 5.70.

Ratios are **recomputed by test**, not transcribed — `design-system.test.ts` asserts every functional
status colour clears 4.5:1 on the surfaces it is used on, and would fail if one were adjusted.

**Green is not in this table on purpose.** Healthy is the one status the brand palette can already
express (`green` `#2E776A`, 5.30 on white). Inventing a second green beside it would have been a
palette extension with no justification.

**Three standing constraints on these six values:**

1. They are **not brand colours**. They may not appear in a chart series, a button, a link, a border
   or a decoration — only in status.
2. They never compete with `impact-orange`. Where a screen shows both a status ramp and a primary
   action, the action is the only orange element in view (§8 prohibition 6).
3. They are never the only signal. Every status carries a distinct shape and a word (§3.2).

---

## 11. What Phase 6 did **not** verify

Recorded plainly, because a design system that claims accessibility it has not demonstrated is worse
than one that claims less.

| Claim | State | Why |
| --- | --- | --- |
| Contrast ratios meet WCAG 2.2 AA | **Verified** — computed from the palette by test | Arithmetic on declared values; no rendering required |
| Status is never colour-only | **Verified** — asserted on rendered markup | The type makes the alternative unconstructible |
| Semantic structure: landmarks, scoped table headers, `aria-sort`, chart text alternatives, skip link, one `h1` | **Verified** — asserted on rendered markup | These are properties of the HTML |
| Focus is visible | **Declared and tested as CSS** — `:focus-visible` with a 2px ring and offset is asserted present in the stylesheet | Whether the ring is visible *as rendered* needs a browser |
| Keyboard navigation works end to end | **NOT VERIFIED** | Tab order, focus trapping and `<details>` behaviour need a real browser. **DR-042** |
| Screen readers announce as intended | **NOT VERIFIED** | Needs NVDA/JAWS/VoiceOver. **DR-042** |
| Rendered contrast at 200% zoom, and reflow | **NOT VERIFIED** | The stylesheet declares the responsive behaviour; nobody has resized a window. **DR-042** |
| Automated axe/Lighthouse audit | **NOT RUN** | No browser-based test harness exists. **DR-042** |
| The 1440×900 visual acceptance review | **NOT PERFORMED by the build** | `docs/design/component-gallery.html` is the artefact; a human opens it. |

**DR-042** is the single debt item covering all of the above: browser-based accessibility and
responsive verification. It is a Phase 12 obligation (REQ-OPS-002) and it is not closed by any test in
this repository today.
