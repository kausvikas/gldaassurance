# ADR-0013 — Revised demo portfolio specification (Phase 3 brief reconciliation)

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Sponsor — **explicit approval confirmed before Phase 4** (Phase 3 correction &
  closure pass, Governance Decision 1). SP-1 resolved as 75 fixed-price plus the existing 11 T&M and
  5 capacity engagements (91 total); SP-2 resolved as all ten archetypes retained plus F and H.
- **Acceptance history:** first recorded as `Accepted` on 2026-08-29 on an *inferred* approval — the
  Phase 3 brief was re-issued unchanged after the conflicts in §§5-8 were surfaced in full. That
  inference was flagged in every phase report until the sponsor confirmed it explicitly. The
  substance of the decision is unchanged; only the basis of approval is.
- **Phase:** 3 (raised before implementation, per `CLAUDE.md` invariant 4)
- **Affects:** `SYNTHETIC_DATA_SPEC.md` (all sections), `METRIC_CATALOG.md` §§2–11, `PRODUCT_SPEC.md` §4.1; REQ-DATA-007, REQ-DATA-008, AC-2, AC-4
- **Supersedes:** — (revises `SYNTHETIC_DATA_SPEC.md` v1.0.0; supersedes no ADR)

---

## Context

The Phase 3 brief specifies a demo portfolio that differs from `SYNTHETIC_DATA_SPEC.md` v1.0.0
(Approved, Phase 0) in scale, composition, history granularity, and scenario set. It also names eight
curated executive scenarios with specific figures, four of which require metrics that
`METRIC_CATALOG.md` does not define.

`SYNTHETIC_DATA_SPEC.md` §Authority states: "Later phases may not invent projects, rename accounts, or
alter scenario outcomes to make a screen look better (global invariant 3)." That clause is aimed at a
*later phase* drifting on its own initiative. This is different — it is a sponsor instruction — but the
process is the same: the revision is recorded and approved before it is generated, not discovered
afterwards in a diff.

Two further constraints bear on this:

- **Phase order.** `PHASE_HANDOFF.md` records "Phase 1 complete — Phase 2 not started". Phase 2 owns
  the canonical model (REQ-DATA-001…006, REQ-DATA-010) and the `METRIC_CATALOG.md` freeze (DR-005).
  A generator has no canonical types to emit into and no frozen definitions to generate causes
  against.
- **ADR-0003 is Accepted and outranks a phase brief** (`CLAUDE.md` precedence rank 1 vs. unranked).
  Its weekly snapshot cadence is not a stylistic choice; `MET-FCST-001` is defined as the slope over
  "trailing 8 **weekly** snapshots", in units of points per **week**, and `MET-FCST-010` — the
  north-star metric — composes it.

## Decision

This ADR proposes the following. **Items marked RECONCILED are resolved by precedence and need no
sponsor decision; items marked OPEN require one and are listed in §Open questions.**

### 1. RECONCILED — history granularity and depth

**Weekly snapshots over 18 months are retained** (ADR-0003 §Decision 3, `SYNTHETIC_DATA_SPEC.md` G4).
The brief's "monthly/periodic history (target ~12 months)" is satisfied as a **superset**: 78 weekly
snapshots span 18 months and roll up to monthly reporting periods without loss. Monthly *storage*
would forfeit `MET-FCST-001`, `MET-FCST-003`, `MET-FCST-004` and `MET-FCST-010`, which are defined in
weeks — twelve monthly points cannot fill an eight-week trailing window.

Adopting monthly snapshots would require a **superseding ADR to ADR-0003** and a re-versioning of
every forecast metric. Not proposed.

### 2. RECONCILED — verticals

The brief's eight verticals are adopted. Six are **renames** of existing spec verticals, semantically
identical; two are additions:

| `SYNTHETIC_DATA_SPEC.md` v1.0.0 | Revised | Change |
| --- | --- | --- |
| Automotive | Mobility | rename |
| MedTech | Healthcare & Life Sciences | rename |
| Financial Services | Financial Services | — |
| Telco | Communications | rename |
| Industrial | Industrial & Energy | rename |
| Media | Media & Entertainment | rename |
| — | Technology | **new** |
| — | Retail & Consumer | **new** |

Client aliases in `SYNTHETIC_DATA_SPEC.md` §4 are re-mapped accordingly; no alias is dropped.

### 3. RECONCILED — regions and business units

The brief's four regions and the spec's three business units are **different axes**, not a conflict.
`organization` already models `BUSINESS_UNIT` and `GEOGRAPHY` as distinct node kinds
(`src/contexts/organization/index.ts`). Both are retained:

```
Americas ─┬─ North America        EMEA ── Europe        APAC ─┬─ India
          └─ LATAM                                            └─ APAC (rest)
```

This preserves the `dir.emea` / `dir.amer` scope-separation demo (`SYNTHETIC_DATA_SPEC.md` §7, AC-5)
while adding LATAM.

### 4. RECONCILED — lifecycle stages and TCV bands

The brief's six lifecycle labels are **sub-stages** of the four canonical `LifecycleStage` values
already declared in `src/contexts/project/index.ts`, added as a reporting attribute rather than
replacing the enum:

| Brief sub-stage | Canonical `LifecycleStage` |
| --- | --- |
| Mobilization | `INITIATING` |
| Early execution / Mid-project / Late-stage | `EXECUTING` |
| UAT / acceptance | `CLOSING` |
| Recovery | orthogonal — an active `recovery` plan, not a lifecycle value |

TCV bands (`<$1M`, `$1–5M`, `$5–10M`, `$10M+`) are a **classification over** the existing
`$0.4M–$28M` range, not a change to it. No conflict.

### 5. OPEN — portfolio scale and engagement mix

| | v1.0.0 | Brief |
| --- | --- | --- |
| Projects | 48 | ~75 |
| Engagement models | Fixed-bid 32, T&M 11, Capacity 5 | "~75 Fixed-Price" |
| Portfolio TCV | ≈ $180M | unstated |

The spec's stated reason for 48 is hand-verifiability: "small enough that every project can be
hand-verified against its intended scenario during Phase 3 review." At 75 that review is ~56% more
work and remains feasible, but the claim in the spec would no longer be true as written.

The engagement mix is the sharper question. `PRODUCT_SPEC.md` §4.1 scopes T&M and capacity models as
"modelled but not optimised for". An all-fixed-price portfolio removes that coverage entirely.
**Proposed:** 75 fixed-price projects **plus** the existing 11 T&M and 5 capacity engagements
(91 total), preserving §4.1 coverage — or 75 total with the mix retained, if 91 is too many to verify.

### 6. OPEN — scenario set

The brief names eight curated executive scenarios. Five map onto existing archetypes; two are new;
five existing archetypes are unmentioned.

| Brief | Existing archetype | Status |
| --- | --- | --- |
| A Healthy Green | 5.6 `HEALTHY_REFERENCE` | maps |
| B Green-at-Risk | 5.1 `SILENT_DETERIORATOR` | maps (specific figures) |
| C Reported Green / system Amber | 5.1 `SILENT_DETERIORATOR` | maps — **this is AC-2** |
| D Amber Recovering | 5.5 `RECOVERING_RED` | maps |
| E Scope / Commercial Leakage | 5.2 `UNCOMPENSATED_SCOPE` | maps |
| F ETC Optimism | — | **new archetype** |
| G Quality Margin Leakage | 5.4 `QUALITY_SPIRAL` | maps |
| H Contract-Loss Risk | — | **new archetype** |
| — | 5.3 `PYRAMID_EROSION` | unmentioned |
| — | 5.7 `LOW_CONFIDENCE` | unmentioned |
| — | 5.8 `OVERRIDE_CONFLICT` | unmentioned |
| — | 5.9 `FX_EXPOSED` | unmentioned |
| — | 5.10 `SCHEDULE_SLIP_HONEST` | unmentioned |

**Proposed: all ten archetypes are retained, F and H are added as archetypes 5.11 and 5.12, and the
eight lettered scenarios become the curated *demo script* drawn from that set.** The brief says
"eight curated executive scenarios", not "only eight projects have scenarios" — this reading
satisfies it without dropping anything.

Dropping the five unmentioned archetypes would break named requirements, which is why this is
proposed rather than assumed:

| Archetype | What breaks if dropped |
| --- | --- |
| `LOW_CONFIDENCE` | REQ-DQ-003 — low confidence escalating as a reporting failure has no demo |
| `OVERRIDE_CONFLICT` | REQ-HLTH-007 — the three coexisting RAG values have no demo |
| `FX_EXPOSED` | AC-4 — the margin bridge never exercises an FX cause |
| `SCHEDULE_SLIP_HONEST` | The `MET-HLTH-030 = 0` control case. Without it every Amber looks like a reporting failure and the product cries wolf on honest teams |
| `PYRAMID_EROSION` | The "schedule green, margin red" case that proves health cannot be one number |

Independently: **REQ-DATA-008 is verified by integration test** — "Synthetic portfolio contains every
scenario archetype in `SYNTHETIC_DATA_SPEC.md`". Dropping archetypes without amending the spec fails
that test by construction.

### 7. OPEN — metrics the curated scenarios require but the catalog does not define

`METRIC_CATALOG.md` §1.1 rule 1: "Every number displayed anywhere in the product has a metric ID from
this catalog. A number on a screen with no ID is a defect." Four figures in the brief have no ID:

| Figure | Scenarios | Catalog status |
| --- | --- | --- |
| Contingency consumed % | B (72%), C (82%) | **absent** — no contingency metric exists |
| Physical vs planned progress % | B (58% / 66%) | **partial** — `MET-DEL-012` Scope Completion, `MET-DEL-001` PV; neither is "physical completion" as stated, and `MET-DEL-012` is BLOCKED by MC-8 |
| Risk-adjusted GM | H (−4%) | **absent** |
| Acceptance blockers / latency | G (5 blockers), FS portfolio pattern | **absent** |

Each requires a new catalog entry with a definition, a layer, a zero-denominator behaviour and an
owning context. **That is Phase 2's work** (`METRIC_CATALOG.md` §12: "Phase 2 may not declare the
catalog frozen while any of MC-1…MC-8 is open"), and it is added here as **MC-9…MC-12** rather than
invented by a generator.

The brief agrees on the principle: "All derived metrics must be computed by domain engines later, not
hardcoded as conflicting truths." The generator therefore emits the **L1 facts** that produce these
figures — contingency drawdown records, progress claims, acceptance events, risk register entries —
and never the percentages themselves. The percentages must still have catalog IDs before Phase 4 can
compute them.

### 8. OPEN — scenario F presumes the answer to OQ-2

Scenario F states Actual Cost $1.8M, Physical Completion 52%, implied EAC ≈ $3.46M. `1.8 / 0.52 =
3.4615` is **cost-to-cost percent-complete** — which is exactly `MET-FIN-006`'s *assumed but
unconfirmed* method, blocked as MC-1/OQ-2 and flagged in `PHASE_HANDOFF.md` §2 as the
highest-impact open question.

Generating scenario F confirms OQ-2 by implication. Either the sponsor confirms cost-to-cost
explicitly, or scenario F's figures are regenerated under whichever method is chosen. This ADR does
not assume it.

## Rationale

- **Reconciling rather than choosing, where reconciliation is honest.** Five of the eight differences
  (§§1–4) dissolve on inspection: weekly is a superset of monthly, regions and business units are
  different axes, sub-stages are an attribute, bands are a classification. Presenting those as
  conflicts requiring a sponsor decision would waste the sponsor's attention on non-questions.
- **Refusing to reconcile where it would be dishonest.** Project count, engagement mix, and the
  scenario set are genuine changes to an approved artifact with named requirements attached. Silently
  adopting the brief's numbers would be the "plausible drift" `ARCHITECTURE_DECISIONS.md` §1 exists to
  prevent — it would still demo beautifully.
- **The five unmentioned archetypes are load-bearing, not padding.** Each maps to a requirement or an
  acceptance criterion. `SCHEDULE_SLIP_HONEST` in particular is the control case: a product that
  flags every Amber as a reporting failure teaches delivery managers to stop reporting Amber.
- **Metrics before data.** A generator that emits a number with no catalog ID creates a definition by
  fiat, and Phase 4 then implements whatever the data implies. That is the catalog freeze happening
  in the wrong place, by the wrong artifact.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Generate the brief as written, amend the specs afterwards** | Fastest, and inverts the governance: the data would define the spec. `SYNTHETIC_DATA_SPEC.md` §1 exists because "synthetic data is where POCs quietly go wrong". |
| **Adopt monthly snapshots as the brief states** | Forfeits `MET-FCST-001/003/004/010`. The north-star metric would be uncomputable, and the product's differentiating claim rests on it. Would need to supersede ADR-0003. |
| **Replace the ten archetypes with the eight lettered scenarios** | Fails REQ-DATA-008's integration test and removes the demos for REQ-DQ-003, REQ-HLTH-007 and AC-4. |
| **Keep 48 projects and treat the brief's 75 as approximate** | Defensible on precedence, and ignores what is plainly a deliberate sponsor instruction. The brief is specific about composition, which reads as intent rather than approximation. |
| **Invent contingency and risk-adjusted GM definitions in the generator** | Produces numbers that reconcile with nothing and pre-empts the Phase 2 freeze. Directly contrary to the brief's own instruction that derived metrics come from engines. |
| **Generate a partial portfolio now, backfill after Phase 2** | Two seeds, two content hashes, and REQ-DATA-007 byte-reproducibility becomes meaningless. |

## Consequences

**Positive**
- The revised portfolio is larger and more varied, which strengthens AC-1: ranking 91 projects is
  genuinely a command-center problem rather than a list.
- Two new archetypes (ETC optimism, contract-loss risk) cover failure modes the original ten did not,
  and both are common in real fixed-price delivery.
- Eight curated executive scenarios give the demo script a spine it did not have.

**Negative / accepted costs**
- `SYNTHETIC_DATA_SPEC.md` goes to v2.0.0; every section changes. The Phase 0 approval of v1.0.0 does
  not carry over.
- Hand-verification of every project against its intended scenario — the spec's stated reason for 48
  — becomes materially more work.
- Four new metrics (MC-9…MC-12) extend Phase 2's already-blocked catalog freeze.
- Client alias renames touch `SYNTHETIC_DATA_SPEC.md` §4 and any demo script referencing them.

**Neutral but notable**
- No accepted ADR is superseded. ADR-0003's weekly cadence, ADR-0002's money rules and ADR-0004's
  layering are all preserved unchanged.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None. No context added, removed, or re-scoped |
| Data model / persistence | None beyond what Phase 2 already owes |
| Formulas or metrics | **Four new catalog entries required** (contingency consumed, physical completion, risk-adjusted GM, acceptance latency/blockers) as MC-9…MC-12. No existing formula changes |
| Security model | None. `PERSONAL_DATA` handling and the seeded user/scope set are unchanged |
| Brand / design tokens | None |
| Requirements affected | REQ-DATA-007, REQ-DATA-008, AC-1, AC-2, AC-4, AC-5 |
| Tests that must change | `SYNTHETIC_DATA_SPEC.md` §5 archetype list drives the REQ-DATA-008 integration test; adding 5.11/5.12 adds cases |

## Migration implications

No data exists, so nothing migrates. **Order of operations if accepted:**

1. Sponsor confirms §§5–8 and OQ-2.
2. **Phase 2 completes** — canonical model, three baselines, immutability, snapshots, lineage — and
   freezes `METRIC_CATALOG.md` including MC-9…MC-12.
3. `SYNTHETIC_DATA_SPEC.md` is reissued as v2.0.0 recording this decision.
4. Phase 3 generates against the frozen catalog and the canonical types.

Generating before step 2 means the generator defines the canonical model implicitly, and Phase 2 then
conforms to the data rather than the reverse.

## Rollback path

Fully reversible until a seed is committed and a content hash is recorded in
`data/synthetic/MANIFEST.json`. After that, reverting to the v1.0.0 portfolio is a regeneration under
a different spec version — cheap in itself, but it invalidates every golden fixture written against
the v2.0.0 data (Phase 4 onward). The practical point of no return is therefore the **Phase 4 golden
suite**, not this ADR.

**Reconsider if:** hand-verification of 75–91 projects proves impractical during Phase 3 review, which
would argue for the spec's original reasoning and a smaller portfolio.

## Verification

- `SYNTHETIC_DATA_SPEC.md` v2.0.0 lists every archetype, and the REQ-DATA-008 integration test asserts
  each is present and findable.
- Every figure in the eight curated scenarios resolves to a metric ID in a `Frozen`
  `METRIC_CATALOG.md`; a figure without one fails review.
- The generator emits L1 facts only; a validation check asserts no derived percentage is present as
  stored data.
- Same seed → identical content hash (REQ-DATA-007).

## Open questions

| # | Question | Blocks | Owner |
| --- | --- | --- | --- |
| ~~SP-1~~ | ~~Portfolio scale and engagement mix~~ | **RESOLVED** — 75 fixed-price + 11 T&M + 5 capacity = 91 projects, preserving `PRODUCT_SPEC.md` §4.1 coverage | Sponsor |
| ~~SP-2~~ | ~~Archetypes retained or replaced~~ | **RESOLVED** — all ten retained, F and H added as 5.11 and 5.12, the eight letters become the curated demo script | Sponsor |
| ~~SP-3~~ | ~~Phase 2 before Phase 3~~ | **RESOLVED** — Phase 2 was executed and completed before this phase | Sponsor |
| **MC-9** | Contingency: definition, whether it is drawn from a contract reserve or a cost buffer, and its owning context | Scenarios B, C | Finance + Phase 2 |
| **MC-10** | Physical completion: relationship to `MET-DEL-012` Scope Completion, itself blocked by MC-8 | Scenarios B, F | Delivery + Phase 2 |
| **MC-11** | Risk-adjusted GM: the risk weighting applied, and whether it is L2 or L3 | Scenario H | Finance + Delivery |
| **MC-12** | Acceptance latency and blocker definitions | Scenario G, FS portfolio pattern | Delivery + Phase 2 |
| **OQ-2** | Revenue recognition method — scenario F's arithmetic presumes cost-to-cost | Scenario F and all of `MET-FIN-*` | **Sponsor — highest impact** |
