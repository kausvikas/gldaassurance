# Requirement Traceability Report — Phase 7: Fixed-Bid Portfolio Command Center

- **Phase:** 7 — **CLOSED** (REQ-PORT-003 met at the pre-Phase-11 architectural closure; see §10)
- **⚠️ AMENDED 2026-08-31:** §10 recorded this gate as closed on a basis that was later found **economically wrong**. The gate is still closed, for a different and correct reason. **§10a is the current record; §10 is retained verbatim as the history.** Do not read §10's figures as current.
- **Date:** 2026-08-31 (closure pass)
- **Author:** Delivery leadership + executive product design + full-stack engineering
- **Requirements in scope:** REQ-PORT-001…004; AC-1, AC-3, AC-5, AC-7, AC-8
- **Artifacts consumed:** `PRODUCT_SPEC.md` §2, §5, §8, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md`, `SECURITY_MODEL.md` v2.1.0 §4.2/§12, `BRAND_DESIGN_SYSTEM.md` v1.1.0,
  `PHASE_HANDOFF.md` §1/§2/§2a, ADR-0005, ADR-0015 (amended), ADR-0017, ADR-0018, ADR-0019, ADR-0020, ADR-0021 (raised)

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 0. What the closure pass changed

The Phase 7 build was functionally complete and **wrong about its own population**. It aggregated
every project the caller was authorised for — 91 — while calling itself the *fixed-bid* command
centre. A fixed-margin metric computed over time-and-materials work is not a rounding error; it is a
category error, and every KPI, denominator, band count and bubble carried it.

| # | Change | Why it was not optional |
| --- | --- | --- |
| 1 | **Fixed-bid population filter**, applied in `buildCommandCenter()` before anything is computed | Filtering later would leave every aggregate wrong and only the visible rows right — a total nobody can reconcile to a list |
| 2 | `MET-PORT-009` registered for forecast loss exposure | The KPI was borrowing `MET-FIN-024`, a *per-project* margin metric, for a downside-only portfolio sum. Two meanings, one id |
| 3 | GM VaR relabelled `MET-PORT-003` → **`MET-FIN-019`** | `MET-PORT-003`'s registered formula de-duplicates shared risk causes. That is **not implemented** (DR-048). The KPI is a plain sum and now says so |
| 4 | Green-at-Risk executive KPI → **`MET-HLTH-033` Reported Green Risk** | The eight-slot KPI should carry the finding an executive can act on; both findings remain visible and separate in the panel (ADR-0018) |
| 5 | **C-7 resolved** (ADR-0015 D-1, amended) | Sixteen metrics were Draft on it, including `MET-PORT-007` — the ordering this entire surface rests on |
| 6 | `Time to act`, `Rank conf.` and `Recovery` added to the executive table | Tiers 3, 5 and 6 were computed and discarded. A reader could see the order but not how long they had or how much to trust it |
| 7 | Population scope stated on the page and in every KPI's evidence | 75 of 91 with nothing said about the other 16 is how a reader concludes the page is broken |

## 1. Requirement coverage

| REQ / AC | Requirement | State | Evidence | Result |
| --- | --- | --- | --- | --- |
| **REQ-PORT-001** | Portfolio ranked by intervention priority, not alphabetically or by size | **IMPLEMENTED** | `buildCommandCenter()` delegates to `rankInterventionPriority()` (`MET-PORT-007`, ADR-0019); every row carries `outranksBecause` | ✅ |
| **§5 surface** | Portfolio Command Center: executive KPI set with movement, drill-down, freshness and evidence (`PRODUCT_SPEC.md` §5, row "Portfolio Command Center") | **PARTIAL** | Exactly 8 KPIs, each with `metricId`, rule version, evidence, sources and a `filterId`. **Movement is unavailable** — no prior-period store (DR-045) — and the page says so rather than rendering "no change" | ✅ for the KPI set; ⚠ movement is DR-045 |
| **REQ-PORT-002** | "Deteriorating Greens" surfaced as a first-class portfolio view | **IMPLEMENTED** | The Green-at-Risk panel is its own section with count, TCV, GM VaR, ranked drivers and project links; both findings shown separately (ADR-0018) | ✅ |
| **REQ-PORT-003** | Portfolio value at risk aggregates **without double counting** | **IMPLEMENTED** — *on a corrected basis; see §10a* | `MET-PORT-003` **v2.0.0** is `Σ MET-FIN-019 over distinct eligible projects, each counted exactly once` (**ADR-0023**, superseding ADR-0021). Portfolio VaR = **$90.80M**. Counting each distinct project once is the entirety of the de-duplication the requirement asks for; shared cause is reported beside the total as non-additive **concentration**. ~~ADR-0021: $38.93M removed → $50.26M~~ **withdrawn — that reduction was unsupported** | ✅ property + adversarial tests |
| **REQ-PORT-004** | 30-second path verified by documented demo script | **PARTIAL** | `docs/DEMO_SCRIPT_PHASE_7.md` written, every figure in it verified against the built artifact. The **run** is a human judgement and has not been performed | ⚠ script exists; run pending |
| *(scope enforcement)* | Aggregates exclude out-of-scope entities — a property of ADR-0005 §5, **not** REQ-PORT-003 | **IMPLEMENTED** | Computed over `AuthorisedRequest.entitySet` only, then narrowed to the fixed-bid population; the service holds no data handle | ✅ 6 authorization tests + 10 population tests |
| **AC-1** | Load → named project needing intervention, <30s, <3 interactions | **PARTIAL** | Rank 1 named above the table with its deciding tier, its clock and its rank confidence; **0 interactions** to the answer. Live click-through needs a client runtime (DR-044); the 30-second *judgement* is a human check, shipped as a 12-point checklist in the artifact | ✅ structurally; ❌ not visually verified — §9 |
| **AC-3** | Every headline number drills to L1 facts in ≤3 steps | **IMPLEMENTED** | Every KPI, the Green-at-Risk panel and every narrative item carry an `EvidenceDto` rendered in an `EvidenceDisclosure`; each KPI's scope line names the population and the exclusion | ✅ |
| **AC-5** | Two roles, same project, materially different server-enforced data — **by test** | **IMPLEMENTED** | EMEA vs Americas directors: different counts, different TCV, **disjoint project sets**. The population filter is applied *inside* each caller's scope, never instead of it | ✅ 3 tests + visible in the artifact |
| **AC-7** | Identical inputs → byte-identical outputs | **IMPLEMENTED** | `JSON.stringify` equality over the whole view, including the new population fields | ✅ |
| **AC-8** | Legible in the palette, no colour-only status | **IMPLEMENTED** | Every status is a `HealthBadge` (shape + word + colour); bubble health is carried in the data table | ✅ + 125 a11y tests |

## 2. The eight KPIs, traced

| KPI | Metric | Layer | Value (CDO scope) |
| --- | --- | --- | --- |
| Total fixed-bid TCV | `MET-PORT-001` | computed | $453.64M |
| Sold GM $ | `MET-FIN-026` | computed | $115.47M |
| Forecast GM $ | `MET-FIN-024` | computed | $35.76M |
| GM value at risk | `MET-FIN-019` | computed | $89.19M |
| Forecast loss exposure | `MET-PORT-009` | computed | $4.76M |
| Amber / Red projects | `MET-PORT-004` | **inferred** | 73 of 75 |
| Reported Green Risk | `MET-HLTH-033` | **inferred** | 4 |
| Uncommercialised scope | `MET-COM-009` | computed | $3.48M |

Six `computed` (L2), two `inferred` (L3) — bands are verdicts, not arithmetic (ADR-0014), and the
cards render them differently. **Every id resolves in the registry, and every id is the formula that
actually ran.** Where it was not, the label was changed (rows 3 and 4 of §0), never the claim.

## 3. C-7 resolution

`HEALTH_MODEL_V2` already declared exactly the four executive dimensions the closure specifies, so
resolution was **confirmation and freezing, not redesign** — no formula, weight or band edge moved.

| | Weight | Fed by |
| --- | --- | --- |
| Financial | 0.40 | Margin, cost, forecast at completion |
| Delivery | 0.25 | Schedule, progress, throughput, `MET-DEL-023` dependency ageing |
| Scope & Commercial | 0.20 | Change, uncommercialised scope, contractual position |
| Product & Quality | 0.15 | Defects, `MET-QUA-010` acceptance blockers, assurance |

- The six HEALTH-v1 analytical dimensions are **retained** as the diagnostic layer beneath, still
  blocked on MC-2 for their own weights.
- Resource, dependency, acceptance and assurance are **drivers**, not peer executive dimensions.
- Data confidence sits **beside** health, never inside it (`PRODUCT_SPEC.md` §3.4).
- **Frozen is the mechanism; the weights and edges stay open calibration (Type B).**

**16 metrics moved Draft → Frozen.** `MET-DQ-008` Validity carried a C-7 tag that was over-broad and
is Frozen on its own terms, with that noted in the registry. **3 remain Draft**, each naming a
different blocker — and none of them is reachable from anything this surface displays:

| Metric | Blocker | Reachable from the Command Center? |
| --- | --- | --- |
| `MET-DEL-012` Scope Completion | MC-8 — the scope unit is undefined | No |
| `MET-QUA-002` Defect Density | MC-8 — same undefined unit | No |
| `MET-DQ-009` Forecast Reliability Profile | C-9 — supersede, coexist or withdraw | No |

Proved by test, not by inspection: the transitive dependency closure of all 8 KPIs plus
`MET-PORT-007`, `MET-FCST-025` and `MET-HLTH-033` — **80 metrics reached over 114 dependency
edges** — contains no Draft metric, and no Frozen metric anywhere in the registry rests on a Draft
one transitively.

## 4. Security

- The handler receives `input.authorised.entitySet.projectIds`, resolved by `EnforcementPoint` from
  the **session**, never from the request. The population filter narrows *within* that set and can
  never widen it: the service holds no repository.
- The three new view fields were caught by **deny-by-default field classification** on first run
  (`UnclassifiedField`) and classified `PUBLIC_INTERNAL` — they describe scope, not commercial
  position. The control worked before a human looked.
- Route `/v1/portfolio/command-center` requires `portfolio.viewAggregates`; reads are audited.
- A Delivery Manager receives the same generic `404 {"error":"not_found"}` as for a project that
  does not exist.

## 5. Tests and gates

```
909 tests, 0 failed, 0 skipped   (27 files)   was 860
+50  tests/integration/phase7-closure.test.tsx
 40  tests/integration/command-center.test.tsx  (6 updated for the population gate)
```

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **89 source files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **909 passed, 0 failed, 0 skipped** |
| authorization / a11y | 272 / 125 |
| `npm run data:validate` | 126,126 records, hash `7fdc2f19…` **unchanged** |
| `npm run catalog:generate` | regenerated; catalog matches the registry byte for byte |
| `npm run design:command-center` | 3 personas through the real gateway |
| `node scripts/ci/secret-scan.mjs` | 242 files, 0 findings |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |

Six existing tests failed on the population change and were **updated, not weakened**: each computed
its expectation over all 12 supplied projects while the view now reports on the 8 fixed-bid ones.
The suite now deliberately supplies a *mixed* authorised set, so a test whose input was already pure
could not notice if the filter were deleted.

## 6. Demo story

`npm run design:command-center` → `docs/design/portfolio-command-center.html` (424KB, three personas plus the manual
review checklist).

| Persona | Result | What it demonstrates |
| --- | --- | --- |
| **CDO** (`exec.cdo`) | 200 · **75 fixed-bid of 91 authorised · TCV $453.64M** | The full command centre, with the exclusion stated |
| **Portfolio Director, EMEA** (`dir.emea`) | 200 · **27 projects · TCV $139.09M** | **AC-5**: same request, different authorised set, computed over scope |
| **Delivery Manager** (`dm.mobility`) | **404** | Denied without disclosure |

## 7. Technical debt

| DR | Item | Owning phase | Gate | Blocks Phase 8? |
| --- | --- | --- | --- | --- |
| **DR-044** | No client runtime — filters, sorting and drill-through render as links | 7/8 | `PHASE_7_BLOCKER` for a *driven* AC-1 demo | No |
| **DR-045** | No prior-period snapshot store, so KPI movement is unavailable and the page says so | 8 | `EXECUTIVE_DEMO_BLOCKER` | No — **kept open**; the honest-absence behaviour is asserted by test |
| **DR-046** | Nested rows classified at container level | Post-POC | `PRODUCTION_BLOCKER` | No — **kept open** with a precise gate: closes when a caller exists who holds the capability without `COMMERCIAL_CONFIDENTIAL` (DR-038) |
| **DR-047** | Drill-through targets declared, destinations are Phase 8+ | 8 | `PHASE_8_BLOCKER` | **No** — it is Phase 8's own deliverable, not an obstacle to it |
| **DR-048** | `MET-PORT-003` shared-cause de-duplication declared but not implemented; the KPI is the plain sum and is labelled `MET-FIN-019` | 9 | `PHASE_9_BLOCKER` | No |
| **DR-049** | No recovery-plan store, so `MET-PORT-007` tier 5 never fires; every project reads "Not assessed" | 10 | `EXECUTIVE_DEMO_BLOCKER` | No |

## 8. Self-review

- [x] **Is any aggregate computed over the wrong population?** No — that was the defect this closure
      existed to fix, and 10 tests now hold it, including one asserting that supplying the excluded
      projects changes no figure at all.
- [x] **Does any KPI claim a metric whose formula did not run?** No. Two labels were corrected rather
      than two implementations faked.
- [x] **Did any formula, threshold, weight or scenario change?** No. C-7 froze what already existed.
      The content hash is unchanged.
- [x] **Is any Frozen metric resting on a Draft one?** No, transitively, asserted over the whole
      registry.
- [x] **Does any component compute a business value?** No — asserted by source inspection.
- [x] **Is anything claimed that is not built?** KPI movement (DR-045), tier-5 recovery (DR-049) and
      the `MET-PORT-003` de-duplication (DR-048) are all absent, all labelled, and all asserted to be
      *stated* rather than faked.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      population, authorization, reconciliation, determinism, metric identity and formatting.
      **In front of the client** for the thirty-second judgement — §9.

## 9. Acceptance gate — what was and was not verified

Five of the six AC-1 questions are answerable from the page's structure and are asserted by test.
The sixth is a human judgement about a rendered page: **the Chrome extension is not connected, so
the page was never viewed at 1440×900.**

| Question | Answered by | Verified |
| --- | --- | --- |
| How large is the portfolio? | KPI 1, and the population line above it | ✅ by test |
| Where is margin forecast? | KPIs 2–3, adjacent for comparison | ✅ by test |
| How much GM is at risk? | KPI 4 | ✅ by test |
| How many are already Amber/Red? | KPI 6, `73 of 75` | ✅ by test |
| Which Green projects are deteriorating? | The Green-at-Risk panel, both findings separate | ✅ by test |
| Where should I intervene first? | Named above the table, with the deciding tier, the clock and the rank confidence | ✅ by test |
| *Does it feel right in under 30 seconds?* | — | ❌ **not verified** |

The artifact now ships a **12-point manual review checklist** as its last section, stating plainly
that none of the checks was performed by the agent that built the page and that an unticked box is
an open gate. That converts an unverifiable claim into an assignable one.

---

## 10. Why Phase 7 now closes

**`REQ-PORT-003` is met.** It was the single item holding this gate open, and it is resolved.

The interim report traced it against the wrong text — it claimed *"aggregates exclude out-of-scope
entities"*, which is a real, implemented property and **not what REQ-PORT-003 says**. That correction
stands, and it is why the requirement was found unmet in the first place.

**Why it could not be implemented at Phase 7 closure.** `MET-PORT-003` is Frozen and its formula was
under-determined in the common case: nothing defined how a project's single `MET-FIN-019` splits
across its causes, and **81 of 91 projects carry more than one cause key**, so subtracting once per
group would discount a project repeatedly and drive the total past zero. Choosing a reading would
have been a silent change to a frozen formula, so it was raised as **CONFLICT C-20 / ADR-0021** with
the two decisions acceptance had to make.

**How it was resolved.** ADR-0021 is **Accepted**, answering both:

- **Attribution** is probability-weighted cost impact, **scaled so the shares sum exactly to the
  project's `MET-FIN-019`** — which keeps the subtraction denominated in the same authoritative
  figure the rest of the product reports.
- **Multi-cause** takes option **(b2)**: each project is de-duplicated against its **dominant**
  cause, so it appears in exactly one group. The result is provably non-negative, and a property test
  asserts it on a hostile input of twenty identical projects sharing one cause — which collapses to
  exactly one of them.

| | |
| --- | --- |
| `Σ MET-FIN-019` (gross) | $89.19M |
| Shared-cause deduction | **$38.93M** |
| `MET-PORT-003` | **$50.26M** |
| Groups | 5, covering all 75 fixed-bid projects |

**DR-048 is closed.** The KPI carries `MET-PORT-003` because that is now the formula that runs, and
its evidence line shows the gross sum, the number of groups and the amount removed — so the 44%
reduction is auditable rather than asserted.

---

## 10a. AMENDMENT — this gate was closed once on a wrong basis

*Added 2026-08-31 at the pre-Phase-11 architectural closure. **§10 above is retained exactly as
written** because a traceability record that quietly acquires the right answer teaches nobody
anything. What follows is what actually happened.*

**The decision recorded in §10 was economically wrong, and it understated real exposure by 44%.**

`MET-FIN-019` is `max(0, MET-FIN-026 − MET-FIN-032)`: *this* project's sold margin less *this*
project's risk-adjusted margin. **Two projects' margins are disjoint pools of money.** No dollar can
appear in both, so between two projects there is nothing to de-duplicate. If a key person is lost
across three projects, three margins are damaged and the portfolio loses all three.

A shared `riskCauseKey` is a **category label, not a monetary event**. `RiskRow` carries
`riskCauseKey`, `probability` and `costImpact` — and no shared-exposure identifier, no allocation
amount, and no allocation basis. On the demo portfolio `KEY_PERSON` spans **75 risk rows across 59
projects with 67 distinct cost impacts**: 59 separate risks filed under one label, not one loss
booked 59 times. Cause identity alone can never distinguish *six separate losses from one root cause*
(additive) from *one loss booked six times* (duplication), and only the second is double counting.

| | §10 as closed | §10a, corrected |
| --- | --- | --- |
| `Σ MET-FIN-019` (gross) | $89.19M | — |
| Deduction | **$38.93M** | **$0** — there is nothing to net |
| Reported `MET-PORT-003` | **$50.26M** | **$90.80M** |

**Why the error survived this report's own review.** It reconciled, it was deterministic, it was
provably non-negative, and it collapsed a hostile input of twenty identical projects to one. Every
one of those properties is satisfied by a wrong formula. **The hostile-input property test cited in
§10 as evidence was asserting the defect** — it demanded that twenty $1M projects sharing a cause
total $1M. A green suite is evidence about the code, not about the specification.

**Current basis (ADR-0023, Accepted).** `MET-PORT-003` v2.0.0 = `Σ MET-FIN-019 over distinct
eligible projects, each counted exactly once`. `REQ-PORT-003`'s *"without double counting"* means no
project's exposure is counted twice — which counting each distinct project once achieves. A project
carrying four cause keys contributes **once**; a project supplied twice in one call contributes
**once**. Shared root cause is real and is now reported as **systemic concentration** beside the
total, carrying `concentrationIsAdditive: false` so no consumer can render it as a de-duplication.

**Cross-project monetary de-duplication remains permanently impermissible on cause identity alone.**
It requires an explicit fact model — `SharedExposureId`, `TotalSharedExposureAmount`,
`ProjectAllocationAmount`, `AllocationBasis`, `AllocationConfidence`, `ResidualUnallocatedAmount`,
plus provenance and effective date — reconciling exactly to a governed shared total. See ADR-0023 D-4.
