# Requirement Traceability Report — Phase 8: Project Executive Health

- **Phase:** 8 — **CLOSED** (semantic closure completed 2026-08-31; C-21 resolved)
- **Date:** 2026-08-31
- **Author:** Global Delivery Head + Delivery Manager + DA Head + CFO reviewer + product design
- **Requirements in scope:** REQ-PROJ-001…003; AC-2, AC-3, AC-7, AC-8
- **Artifacts consumed:** `PRODUCT_SPEC.md` §3.4/§7.8/§8, `ARCHITECTURE_DECISIONS.md` §4,
  `METRIC_CATALOG.md`, `SECURITY_MODEL.md` §4.5, `BRAND_DESIGN_SYSTEM.md`, `PHASE_HANDOFF.md`,
  `docs/SCENARIO_CATALOG.md`, ADR-0001, ADR-0003, ADR-0004, ADR-0005, ADR-0015 (amended),
  ADR-0011, ADR-0018, ADR-0019, ADR-0020, ADR-0022 (Accepted)

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 0. The finding that shaped this phase

Phase 8 is the page that *shows the four health dimensions*. Before building it, I measured them:

| Dimension | Weight | Computable before Phase 8 | After |
| --- | --- | --- | --- |
| Financial | 0.40 | **91 of 91** | 91 |
| Delivery | 0.25 | **0 of 91** | **91** |
| Scope & Commercial | 0.20 | **0 of 91** | **91** (semantic closure) |
| Product & Quality | 0.15 | **0 of 91** | **91** (semantic closure) |

`MET-HLTH-011` — the number the Phase 7 Command Center ranks on, the number AC-2 is about — **was a
financial score wearing a four-dimension label**. The health engine was not at fault: it correctly
refuses to score a dimension carried by fewer than half its inputs and names the reason. The
assessment adapter supplied seven signals, all financial or progress-related, so eleven of fifteen
declared inputs arrived `null`. No prior phase recorded this.

A second defect of the same kind: `TrajectoryEvaluationInput.currentBand` — the band every forward
outlook is projected **from** — was the literal `'GREEN'` for every project. A RED project's 30-day
outlook read GREEN, which is the most reassuring possible way to be wrong on an executive page.

Both are fixed. Both are declared in ADR-0022 and below, because between them they change every
project's assessed health, and a reader must not discover that by noticing a number moved.

## 1. Requirement coverage

| REQ / AC | Requirement | State | Evidence | Result |
| --- | --- | --- | --- | --- |
| **REQ-PROJ-001** | Project health page shows score, per-dimension contribution, and rule version | **IMPLEMENTED** | `dimensionTable()` renders all four dimensions with score, weight, contribution and every input; `view.ruleVersion` is `HEALTH-v2` | ✅ 5 tests |
| **REQ-PROJ-002** | Evidence chain: every dimension drills to the L1 facts behind it | **IMPLEMENTED** | Each `DimensionDto` carries its inputs with observed value, weight and band edges, plus an `EvidenceDto`; every section that states a verdict carries one | ✅ 5 tests |
| **REQ-PROJ-003** | Reported vs System-Assessed divergence explained in narrative and evidence | **IMPLEMENTED** | `StatusConflictDto` carries both bands, the effective band, the override flag, the direction, the divergence and **`unexplainedBy`** — the named rule firings the reporter's declaration does not account for, which differ per project and are rendered on the page | ✅ 3 tests |
| **AC-2** | A demo project is Reported Green while System-Assessed Amber/Red, and the product explains the divergence with evidence | **IMPLEMENTED** | Curated **C** and **B** are both Reported GREEN / System RED. The page shows both verdicts, neither styled as the winner, with the rules that fired beneath | ✅ rendered in the artifact |
| **AC-3** | Every headline number drills to L1 facts in ≤3 steps | **IMPLEMENTED** | Six primary outputs plus nine sections, each with an `EvidenceDisclosure`; every `metricId` resolves in the registry | ✅ asserted per verdict |
| **AC-7** | Identical inputs → byte-identical outputs | **IMPLEMENTED** | `JSON.stringify` equality over the whole view and over the generated summary | ✅ |
| **AC-8** | Legible in the palette, no colour-only status | **IMPLEMENTED** | Every RAG is a `HealthBadge` (glyph + word + colour); no new visual convention introduced | ✅ + 125 a11y tests still green |

## 2. Brief → implementation

| Asked for | Where | Note |
| --- | --- | --- |
| Header: name, alias, industry, region, leader, DA owner, contract type, TCV, dates, demo marker | `HeaderDto` | `customerAlias` is derived from the account id, never a name that could read as a real client |
| Six primary outputs | `verdicts` | Health, trajectory, 30/60-day outlook, forecast confidence, intervention — each labelled with its epistemic layer |
| Four health dimensions | `dimensions` | All four rendered and all four scored, with assessment status and coverage stated beside them |
| Commitment comparison, six rows | `commitment` | Three baselines side by side (ADR-0003). Gross margin's *current contract* column reads "no registered metric" — see §4 |
| Financial strip, eight lines | `financial` | Actual cost, bottom-up ETC, EAC, sold/forecast/risk-adjusted GM, erosion, GM VaR |
| Progress/burn together, with explanation | `progressBurn` | Planned, actual and cost consumed on one chart; the narrative names which of the four cases the project is in |
| ETC credibility with applicability | `etcCredibility` | Shows the gap when `MET-FIN-029`'s maturity gate is met, and **says why not** when it is not |
| Milestones: last/next critical, hit rate, evidence | `milestones` | "Critical" is defined as payment-gating, stated in code — a milestone that converts slip into a cash event |
| Scope/commercial and quality signals | `scopeCommercial`, `quality` | L1 facts as facts and L2 derivations from their own contexts, each with its metric id |
| Status conflict with deterministic reasons | `statusConflict` | Reported vs assessed vs override, plus `unexplainedBy` |
| Data/assurance confidence; no evidence = no high confidence in Green | `confidence` | The rule is **computed server-side and stated on every page**, breached or not |
| STATUS / CAUSE / OUTLOOK / IMPACT / ACTION | `buildSummary()` | Generated by fixed rules from the assessment. **No language model is on this path**, and a test greps the source to keep it that way |

## 3. CONFLICT C-21 — resolved

**The interim report was wrong about where the constraint lived, and the error mattered.** It said
*"ADR-0001 (Accepted) declares Commercial and Quality L1-only"*. `ADR-0001` contains **no
per-context epistemic-layer table at all**. The `L1` label appears only in `ARCHITECTURE_DECISIONS.md`
§4.2's "Layer" column — whose own §4 preamble records the area as contested (`C-1`/`C-2`) and defers
the binding rule to the manifest's **import rules** — and in an unenforced `outputLayers` field.

C-21 therefore resolved by **clarification, not amendment** (ADR-0022 D-1). ADR-0001 is untouched.
An epistemic layer is a property of a *value*, not of a module; a fact-owning context may own
governed L2 derivations of its own facts. The decisive evidence was in the code: `CommercialSnapshot`
and `QualitySnapshot` — accepted Phase 2 interfaces in those very contexts — have declared eight L2
derived values since before the conflict existed. The manifest's `outputLayers: ["L1"]` was stale,
and is corrected to `["L1","L2"]`.

Both derivation sets are now implemented in their own contexts, to their registered formulas:

| Context | Metrics | Not implemented |
| --- | --- | --- |
| `commercial` | `MET-COM-007`, `MET-COM-008`, `MET-COM-009` | — |
| `quality` | `MET-QUA-001`, `003`, `006`, `009`, `010`, `011`, `012` | `MET-QUA-002` — `Draft`, blocked by MC-8 |

Health does not reimplement any of them, and adapters perform no division. Both are asserted by test.

## 4. What was deliberately not invented

- **A current-contractual gross margin percentage.** `MET-FIN-002` and `MET-FIN-004` both carry a
  `CURRENT_CONTRACTUAL` baseline, but their ratio is not a registered metric. The cell reads
  *"no registered metric"* rather than putting an unregistered number on an executive page.
- **A forecast completion date** (DR-050). `MET-DEL-011` needs one and the facts have none. The
  milestone set is not a substitute — the last milestone sits ~3 months before the contractual end
  on a typical project, so inferring one reports **every project finishing early**. I built that
  first, measured −78 to −96 days across the board, recognised it as a confident wrong number, and
  removed it.
- **An independent review** (DR-053). No review store exists; the section states its absence.
- **A recalibration of the HEALTH-v2 band edges** (DR-054). 53 of 75 fixed-bid projects assess RED
  and the curated scenarios no longer match `SCENARIO_CATALOG.md`. Band edges are **open calibration
  (Type B, MC-3)** owned by Delivery leadership, and adjusting them to make a demo look right is
  exactly the silent change the contract forbids.

## 5. Tests and gates

```
1020 tests, 0 failed, 0 skipped   (29 files)   was 909
+64  tests/integration/project-executive-health.test.tsx
+47  tests/integration/phase8-closure.test.ts        (semantic closure)
```

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **94 source files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **1020 passed, 0 failed, 0 skipped** |
| authorization / a11y | 272 / 125 (unchanged) |
| `npm run data:validate` | 126,126 records, hash `7fdc2f19…` **unchanged** |
| `npm run design:project-health` | 4 cases through the real gateway |
| `node scripts/ci/secret-scan.mjs` | 254 files, 0 findings |
| document-link validation | 103 relative links across 75 documents, 0 broken |
| `npm run catalog:generate` | catalog matches the registry; no metric definition changed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |

Two of my own tests failed first and were **corrected rather than weakened**: a branded-`CalendarDate`
violation that `vitest` did not catch but `tsc` did, and an assertion that the conflict *narrative*
be project-specific. The narrative is a band-pair template; the project-specific explanation is
`unexplainedBy`. I re-pointed the test at the real mechanism and added a second test asserting those
rules reach the page.

## 6. Demo

`npm run design:project-health` → `docs/design/project-executive-health.html` (194KB, four cases).

| Case | Result |
| --- | --- |
| **CDO** on curated **C** (`prj-009`) | 200 · **GREEN reported / RED assessed** — the AC-2 flagship |
| **CDO** on curated **B** (`prj-001`) | 200 · **GREEN reported / RED assessed**, rapidly deteriorating |
| **CDO** on curated **F** (`prj-014`) | 200 · AMBER reported / RED assessed, ETC optimism gap shown and sized |
| **Delivery Manager** on `prj-009` | **404** — the same generic not-found returned for a project that does not exist |

## 7. Technical debt

| DR | Item | Owning phase | Gate | Blocks Phase 9? |
| --- | --- | --- | --- | --- |
| **DR-050** | No forecast completion date fact; `MET-DEL-011` not computable | 9 | `EXECUTIVE_DEMO_BLOCKER` | No |
| **DR-051** | Generator models almost no schedule slip (2 of 527 milestones) or open customer dependencies (1 of 91 projects); `MILESTONES_AT_RISK` is a constant-perfect input | 9 | `EXECUTIVE_DEMO_BLOCKER` | No |
| **DR-052** | System Green-at-Risk is now 0 of 75; the Phase 7 signature panel has no subject | 9 | `EXECUTIVE_DEMO_BLOCKER` | No |
| **DR-053** | No independent/DA review store | 12 | `PHASE_12_BLOCKER` | No |
| **DR-054** | HEALTH-v2 band edges diverge from `SCENARIO_CATALOG.md`; 53 of 75 assess RED | 9 | `EXECUTIVE_DEMO_BLOCKER` | No |

## 8. Output changes a reader must be told about

Three states, over the 75 fixed-bid projects. No weight, band edge or override threshold changed
between them; only the evidence supplied did.

| | A — pre-Phase-8 (Financial only, coverage 0.40) | B — intermediate (F+D, 0.65) | C — final (all four, 1.00) |
| --- | --- | --- | --- |
| GREEN | 2 | 1 | **1** |
| AMBER | 22 | 21 | **24** |
| RED | 51 | 53 | **50** |
| Assessment status | PROVISIONAL on all 75 | PROVISIONAL on all 75 | **COMPLETE on all 75** |

**Transition A → C**

| prev \ final | GREEN | AMBER | RED |
| --- | --- | --- | --- |
| GREEN | 1 | 0 | 1 |
| AMBER | 0 | 13 | 9 |
| RED | 0 | **11** | 40 |

**The three causes of migration, in order of size:**

1. **A dormant hard override became reachable.** `OVR-NO-CREDIBLE-PLAN` fires on `MET-DEL-018 ≥ 2.00`
   — a signal never supplied before Phase 8. It now fires on **33 of 75**, and is the dominant cause
   of the 9 AMBER → RED moves. It fires on a genuinely measured signal, not on missing data.
2. **Scope & Commercial scores high on most projects** (100.00 where no uncompensated scope, no aged
   CR and no unsecured upside exist), lifting composites and moving **11 projects RED → AMBER**.
3. **Product & Quality entering at 0.15** moderates both directions, and surfaced two more overrides
   — `OVR-ACCEPTANCE-FAILURE` and `OVR-UNCOMMERCIALISED-SCOPE`, one project each.

**50 of 75 RED are RED by hard override, not by composite band.** The band calibration is therefore
not what drives the distribution; the override thresholds are, and they have never been calibrated
against a portfolio where they could fire. That is MC-3 / DR-054 and was not touched here.

| | Before Phase 8 | After closure |
| --- | --- | --- |
| Dimensions scored | 1 of 4 | **4 of 4** |
| Amber/Red KPI | 73 of 75 | **74 of 75** |
| System Green-at-Risk | 1 | **0** (DR-052) |
| Reported Green Risk | 4 | 4 |
| GM value at risk | $89.19M | $89.19M (economics untouched) |
| Content hash | `7fdc2f19…` | `7fdc2f19…` **unchanged** |

**Curated archetypes recovered.** Two now express their designed signal for the first time: **E**
(Scope & Commercial Leakage) scores **0.76** on Scope & Commercial and fires
`OVR-UNCOMMERCIALISED-SCOPE`; **G** (Quality Spiral) scores **17.62** on Product & Quality and fires
`OVR-ACCEPTANCE-FAILURE`. **B** and **C** still do not match `SCENARIO_CATALOG.md` — they already
diverged before Phase 8, and the cause remains band calibration (DR-054), classified as a **stale
calibration expectation**, not an engine defect.

## 9. Self-review

- [x] **Did any formula, weight, band edge or scenario change?** No. Every metric is implemented to
      its registered formula; the HEALTH-v2 weights and edges are untouched; the generator is
      untouched and its hash is unchanged.
- [x] **Does any component compute a business value?** No — asserted by grepping the surface source.
- [x] **Is any metric computed twice?** No. The adapter reuses `commandCenterProject()` rather than
      running the engines again, and a test asserts it does not call `assessProject`.
- [x] **Is anything shown that is not computed?** No. Every unscored dimension, blocked metric and
      absent fact carries its reason, and 8 tests hold that.
- [x] **Was a conflict resolved by inference?** No. C-21 was raised, not resolved, and the code obeys
      the higher-precedence artifact while the ADR asks for a decision.
- [x] **Is the executive summary an LLM output?** No, and a test greps the source to keep it so.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      authorization, evidence, determinism, metric identity and the not-computable paths.
      **In front of the client** for the three-to-five-minute review itself — §10.

## 10. Acceptance gate — what was and was not verified

The gate is a Global Delivery Head completing a meaningful review in three to five minutes and
challenging an unsupported Green using evidence. The **structural** half is asserted; the **timing
and feel** half is a human judgement on a rendered page, and **the Chrome extension is not
connected, so the page was never viewed.**

| Question | Answered by | Verified |
| --- | --- | --- |
| What am I looking at? | The header — ten identifying facts plus the demo marker | ✅ by test |
| What is the verdict? | Six primary outputs, each labelled by epistemic layer | ✅ by test |
| Do I believe it? | The status conflict, with the rules the report does not account for | ✅ by test |
| Where does the verdict come from? | Four dimensions, with scores, contributions and inputs | ✅ by test |
| Are we delivering what we sold? | Commitment comparison across three baselines | ✅ by test |
| Can I challenge an unsupported Green? | The Green-claim rule, computed server-side, stated on every page | ✅ by test |
| *Can a Global Delivery Head do all that in 3–5 minutes?* | — | ❌ **not verified — open the page and time it** |
