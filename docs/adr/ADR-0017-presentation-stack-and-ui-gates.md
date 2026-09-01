# ADR-0017 — Presentation stack, the token boundary, and the UI source gates

- **Status:** **ACCEPTED**
- **Date proposed:** 2026-08-30
- **Date accepted:** 2026-08-30 (Phase 6 closure / Phase 7 entry gate)
- **Approver:** Principal Front-End Architect (D-1, D-2), Design Systems Lead (D-3),
  Principal Security Architect (D-4, D-5)
- **Phase:** 6
- **Affects:** `architecture/manifest.json` (`presentation.allowedExternal`, G-CLOCK, G-FLOAT,
  G-COLOUR, G-DEMO, new G-BROWSER); `tsconfig.json`; `package.json`; `src/app/index.ts`;
  `src/presentation/**`
- **Supersedes:** —

> ### Disposition at the Phase 7 entry gate
>
> Each decision was reviewed **independently of the fact that it is already implemented** — an ADR
> accepted because the code exists is a rubber stamp, and the whole point of the gate is to be able
> to say no.
>
> | # | Decision | Disposition | Note |
> | --- | --- | --- | --- |
> | D-1 | React + `react-dom` in presentation, nothing else | **ACCEPT** | Not a new decision: ADR-0001 §Decision 7 (Accepted) already names React. The manifest was stale from Phase 1, when no UI existed. The *restrictive* half — no router, no state library, no component library, **no charting library** — is what makes §8 prohibition 9 enforceable, and it is asserted by test |
> | D-2 | One G-COLOUR exemption for `tokens/palette.ts` | **ACCEPT** | `BRAND_DESIGN_SYSTEM.md` §3 requires the token layer to hold hex values; the gate forbade the only file that makes the rule satisfiable. Exactly one path, asserted to remain exactly one |
> | D-3 | G-DEMO activated over `src/presentation` | **ACCEPT** | The gate was declared with `state: DEFERRED to Phase 6`. Pure strengthening |
> | D-4 | `lib: DOM` repository-wide + G-BROWSER | **ACCEPT WITH DEBT** | Net strengthening — before this, nothing but the type-checker stopped a context calling `document.*`. But a regex is not a type boundary, and the honest description is *a good gate, not a proof*. Carried as **DR-040**; a per-layer `tsconfig` with project references is the real fix |
> | D-5 | `PlottableValue`; G-FLOAT and G-CLOCK extended to presentation | **ACCEPT** | Draws the line `PRODUCT_SPEC.md` §8 requires and enforces it mechanically. It has already caught two real coercions — the contrast utility's own `parseInt`, and a `Number()` in the DR-018 ceiling written during this very closure |
>
> **No decision is rejected and none is reverted.** D-4 is accepted *with* its limitation stated
> rather than accepted as though the limitation were not there — and DR-040 exists so nobody later
> reads "G-BROWSER" as a guarantee it does not make.
>
> **Does anything here block Phase 7?** No. D-4's residual risk is a production concern, not a
> Phase 7 one, and every other decision is settled.

> **Read this before the phase report claims anything.** Global invariant 4 requires a deviation to
> be documented as a proposed ADR *before* it is implemented, and identified explicitly in the phase
> report. Everything below was implemented in Phase 6 and is identified in the Phase 6 report. None
> of it changes a formula, a metric definition, a domain boundary, a security assumption, a brand
> token, RAG logic or a synthetic scenario narrative.

---

## Context

Phase 6 builds the design system and the application shell. Before a single component could be
written, five questions had to be answered, and four of them were answerable only by changing
`architecture/manifest.json` — a file whose own note says changing it is an architectural change
requiring an ADR.

### C-15 — the manifest forbade the UI framework the architecture already chose

`ADR-0001 §Decision 7` (Accepted) names the technology baseline: *"TypeScript on Node.js; PostgreSQL
with `NUMERIC` for money; … **React for presentation**."*

`architecture/manifest.json` set `presentation.allowedExternal: []`, so `import { … } from 'react'`
was an `ARCH-006` violation. That was not a disagreement about the decision — it was a manifest
written in Phase 1 when no presentation code existed and nothing needed to be allowed. Left alone, it
would have forced either a non-React design system (rewritten in Phase 7) or an undeclared
suppression.

### C-16 — the design tokens cannot exist without a colour literal

The G-COLOUR gate bans `#rrggbb`, `rgb(` and `hsl(` anywhere in `src/presentation`, implementing
REQ-UX-001 and `BRAND_DESIGN_SYSTEM.md` §8 prohibition 1 ("a hex value inside a component"). But
`BRAND_DESIGN_SYSTEM.md` §3 also says *"only the token layer references brand hex values"* — so the
token layer must contain them, and the gate as written forbade the very file that makes the rule
satisfiable. `exempt` was `[]`.

### C-17 — G-DEMO was declared and inert

The manifest carried a G-DEMO gate with `appliesTo: []`, `pattern: "__never_matches__"` and
`state: "DEFERRED to Phase 6 — no presentation components exist yet"`. Phase 6 is that phase.

### C-18 — React's types require the DOM lib, repository-wide

`@types/react` references `HTMLElement`, `Event` and the rest of `lib.dom`. `tsconfig.json` had
`"lib": ["ES2023"]`, and there is one `tsc` project. Adding `"DOM"` makes `document`, `window`,
`localStorage` and `fetch` *typed* in every layer — including domain contexts, where reaching for any
of them would be an architecture violation that now compiles cleanly.

### C-19 — how much may a chart compute?

`PRODUCT_SPEC.md` §8 lists *"a metric computed in a React component"* as a **defect**, and ADR-0002
§Decision 4 forbids the browser being the system of record for money. But a chart must turn a value
into a coordinate, and shipping pixel positions from the server is absurd. The boundary needed
stating before four chart wrappers were written against an unstated one.

---

## Decision

### D-1 (C-15) — React and `react-dom`, and nothing else, in the presentation layer

`presentation.allowedExternal` becomes `["react", "react-dom"]`. This aligns the manifest with
ADR-0001 §Decision 7 rather than deciding anything new.

**What is deliberately still forbidden, and why it matters more than what is allowed:** no client
router, no state library, no component library, and — the one a reviewer should check first — **no
charting library**. Every charting library ships its own colour scale, type ramp and tooltip. The
moment one arrives, `BRAND_DESIGN_SYSTEM.md` §8 prohibition 9 ("per-screen chart palettes") stops
being enforceable, because the palette belongs to the library. The four chart wrappers in
`components/charts.tsx` are inline SVG drawn with token classes for exactly this reason.

**Rendering model: server-rendered static markup.** The component gallery is produced by
`renderToStaticMarkup` into a single HTML file. There is no bundler, no dev server and no client-side
hydration, because there is no HTTP transport in this repository — ADR-0006 is `Proposed`,
`ARCHITECTURE_DECISIONS.md` §2 forbids depending on it, and Phase 5 recorded the absence as DR-029. A
gallery that needed a server would have required building that transport early or quietly becoming
one. Interactive affordances therefore use `<details>`/`<summary>` and CSS rather than JavaScript,
which has an accessibility dividend: the evidence drawer is keyboard-operable and printable with no
script at all.

### D-2 (C-16) — exactly one G-COLOUR exemption

`exempt: ["src/presentation/tokens/palette.ts"]`. One path, one file, and the only file in the
repository permitted to contain a colour literal.

A second exemption is how "tokens only" becomes "tokens mostly", so the count is asserted by test:
`tests/integration/architecture.boundaries.test.ts` fails if the exemption list is anything other
than that single entry. The generated stylesheet is separately asserted to contain no literal of its
own past its `:root` block — every colour after that point is `var()` or `color-mix()`.

### D-3 (C-17) — G-DEMO activated

`appliesTo: ["src/presentation"]`, matching `DEMO\s*[—–-]\s*SYNTHETIC\s*DATA` in any of its plausible
spellings. Components obtain the marker from `DEMO_DATA_BANNER`, re-exported by `@app` from
`platform/config` — which required that re-export, since `presentation` may import `@app` and nothing
else.

A marker somebody can retype is a marker somebody can mistype, shorten, or omit on the one screen
that ends up in a deck. REQ-UX-005 exists for that screen.

### D-4 (C-18) — DOM lib enabled, G-BROWSER closes the hole it opens

`"lib": ["ES2023", "DOM"]` plus a new source gate:

```
G-BROWSER — appliesTo: [src/contexts, src/app, src/platform]
```

It matches browser *members* (`localStorage.`, `navigator.`, `document.querySelector`,
`window.location`, …) rather than the bare identifier `window`, which is a legitimate domain term in
this codebase — a rate-limit window, a trajectory window — and must stay usable. That distinction was
found by running the first draft of the gate, which flagged seven false positives in
`rate-limit.ts`, `trajectory-engine.ts` and the metric registry.

The net effect is a **strengthening**: before this ADR nothing stopped a domain context calling
`document.querySelector` except that it would not have type-checked. Now it does not type-check *and*
the gate rejects it, and the gate keeps working if the lib setting ever changes again.

### D-5 (C-19) — a component may map a value to a coordinate, and may derive nothing

The seam is the `PlottableValue` type:

```ts
interface PlottableValue { readonly value: number; readonly display: string; }
```

- `display` is the authoritative, decimal-safe, already-formatted string. **It is what gets
  rendered** — every axis label, data label and total on every chart.
- `value` may be used for exactly one purpose: the `scale()` map from a value domain onto a pixel
  range. It may not be summed, averaged, differenced or re-rounded, and it must never be rendered.

Two supporting gates make the line hold rather than merely be stated: **G-FLOAT** and **G-CLOCK** now
apply to `src/presentation`. A component that parses a number has started to compute one; a component
that reads the clock has decided what "as at" means, which is a service's decision. The first casualty
was the contrast utility's own `parseInt` for hex digits, which became a table lookup — a small price
for a gate that means what it says.

---

## Consequences

**Positive**

- The design system is written in the framework Phases 7–11 will use, so nothing is rewritten.
- Token discipline is mechanical, not cultural: 125 tests, and a build that fails on a stray hex.
- Every contrast ratio in `BRAND_DESIGN_SYSTEM.md` §2 is now **recomputed from the palette by test**
  rather than transcribed, discharging §2's explicit instruction to Phase 6.
- The gallery is a static file. It opens anywhere, prints, and needs no toolchain to review.

**Negative**

- `"DOM"` in `lib` is repository-wide and G-BROWSER is a regex, not a type-system boundary. A
  determined author could still reach a browser global through an alias the pattern does not match.
  The honest description is *a good gate, not a proof*; a per-layer `tsconfig` with project
  references would be the real fix and is recorded as **DR-040**.
- Four chart wrappers is not a charting library. Phases 9–10 may need a chart type these do not
  cover, and the cost of adding one falls on this repository rather than on a dependency. That is the
  intended trade and it will feel like a cost at least once.
- No client-side interactivity means no live filtering, sorting or drill-down in the gallery. The
  components are built to receive those as view-model changes; wiring them needs the transport
  (DR-029) and a client runtime, recorded as **DR-041**.

**Neutral**

- `react` and `react-dom` add 47 packages. `npm audit --audit-level=high` reports 0 vulnerabilities
  at the time of writing, and the lockfile is committed.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Framework-free TS + template strings** | Avoids the dependency and the manifest change, and contradicts ADR-0001 §Decision 7. Phase 7 would rewrite every component in React, which is precisely the waste this phase exists to prevent. |
| **Vite dev server + client-side gallery** | A better authoring experience and a worse architectural position: it is a transport in all but name while ADR-0006 is `Proposed`, and it would make the gallery unreviewable without a toolchain. |
| **A component library (MUI, Radix, shadcn)** | Ships an opinion about colour, spacing and type that competes with `BRAND_DESIGN_SYSTEM.md`. The document outranks the library, so the library would be fought, then wrapped, then mostly disabled. |
| **A charting library (Recharts, Visx, Chart.js)** | Same objection, sharper: §8 prohibition 9 bans per-screen chart palettes, and a chart library's defaults *are* a per-library palette. |
| **Put the tokens outside `src/presentation` to dodge G-COLOUR** | Moves brand colour into a layer that has no business holding it, to avoid writing a two-word exemption. Dishonest about where the concern lives. |
| **Suppress G-COLOUR per-line** | Suppression comments are invisible in review and multiply. One declared exemption in a governed file is auditable; twelve inline suppressions are not. |
| **Leave DOM out of `lib` and type React loosely** | Would require `any` at every component boundary, defeating `strict` and `exactOptionalPropertyTypes`, which are load-bearing elsewhere in this repository. |
| **Let charts receive pre-computed pixel coordinates** | Puts layout in the domain, couples the service to a viewport size, and makes a responsive chart a server change. |

## Migration implications

- `npm ci` installs four new packages. No source outside `src/presentation` changes behaviour.
- `tsconfig.json` gains `jsx` and `DOM`; existing code is unaffected.
- `npm run verify` gains `design:gallery`, so a component library that cannot render fails the build
  rather than failing silently.
- No migration, no schema change, no data change. The content hash of the synthetic portfolio is
  unchanged (`7fdc2f19…`), which is asserted by the existing generator validation.

## Rollback

- **D-1:** remove `react`/`react-dom` from `allowedExternal` and from `package.json`; delete
  `src/presentation/components`, `shell` and `scripts/design`. The token layer is framework-free and
  survives.
- **D-2:** clear the G-COLOUR exemption and move the palette out of `src/presentation`.
- **D-3:** restore `appliesTo: []` and the `__never_matches__` pattern. The `DEMO_DATA_BANNER`
  re-export from `@app` is independently useful and can stay.
- **D-4:** drop `"DOM"` from `lib` and remove G-BROWSER together — removing the lib without the gate
  is fine; removing the gate without the lib re-opens the hole.
- **D-5:** the `PlottableValue` shape is additive. Reverting means charts take only `display`, and
  the four wrappers lose their axes.
