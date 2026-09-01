# ADR-0015 — Phase 4 engine conflicts: executive health model, forecast reliability, and which "Green"

- **Status:** Partially accepted — D-1 (C-7) **resolved 2026-08-31**; D-2 superseded by ADR-0019; D-4 superseded by ADR-0018; D-3 (C-9) still open
- **Date proposed:** 2026-08-29
- **Approver:** *pending* — Sponsor / Delivery leadership (C-7, C-10), Assurance (C-9), Delivery
  leadership (C-8/MC-5)
- **Phase:** 4
- **Affects:** `MET-HLTH-001`…`006`, `MET-HLTH-010`, `MET-HLTH-011`, `MET-HLTH-020`…`024`,
  `MET-DQ-007`, `MET-DQ-008`, `MET-DQ-009`, `MET-FCST-020`…`022`, `MET-FCST-025`, `MET-FCST-026`,
  `MET-REC-001`…`003`, `MET-PORT-007`; rule sets `HEALTH-v1`, `HEALTH-v2`, `DQ-v1`, `RECOVERY-v1`,
  `TRAJECTORY-v1`, `PRIORITY-v1`
- **Supersedes:** —

---

## Context

Phase 4 was directed to build the economics, health, trajectory, outlook, Green-at-Risk, confidence,
recovery and intervention-priority engines. Four of those requirements conflict with artifacts that
outrank a phase instruction in the precedence order (`CLAUDE.md`). None was resolved by inference.
All four are recorded here, and in every case **both positions are implemented and labelled** rather
than one being silently overwritten.

### C-7 — four executive health dimensions versus six frozen ones

Phase 4 direction specifies a health model of four dimensions with stated weights: Financial 0.40,
Delivery 0.25, Scope & Commercial 0.20, Product Quality 0.15.

`METRIC_CATALOG.md` freezes a **six**-dimension model — `MET-HLTH-001`…`006` (Financial, Schedule,
Scope & Commercial, Quality, Resource, Risk) composed by `MET-HLTH-010`, whose formula is
`Σᵈ (MET-HLTH-00d × weightᵈ) / Σᵈ weightᵈ, d = 1…6`. It is `Frozen`, and its six weights are open
calibration blocked on **MC-2**.

These are not the same model, and they are not reconcilable by adjusting a weight. Risk and Resource
disappear as dimensions in the four-dimension model; Schedule becomes Delivery with different inputs.
The two can rank the same portfolio differently, so **a project's health is not defined until one is
chosen** — a semantic gap (Type A), not a threshold awaiting a number.

### C-8 — intervention priority remains blocked on MC-5

`MET-PORT-007` orders by `MET-FIN-019 × MET-FCST-010 × intervenability`. MC-5 records that
intervenability is undefined. Phase 4 direction asks for an ExecutiveInterventionPriorityService.

### C-9 — forecast confidence has two different factor lists

`MET-DQ-007` is `Frozen` with the formula *"weighted composite of MET-DEL-014 (replan frequency),
MET-FIN-030 (ETC optimism gap) and MET-DEL-013 (velocity stability) per DQ-v1"*.

Phase 4 direction asks for forecast confidence over seven different factors: ETC freshness, ETC
coverage, scope stability, milestone accuracy, open customer dependencies, resource stability, and
required future productivity.

### C-10 — which "Green" does Green-at-Risk mean?

`PRODUCT_SPEC.md` §1.1: the differentiator is *"identifying **Green** projects moving toward
Amber/Red while intervention can still change the outcome."* It does not say which of the three RAG
values §3.3 requires be kept separate.

The two readings disagree on the reference case. Curated scenario **B** — the Green-at-Risk archetype
— is Reported GREEN, has eroded 5.10 margin points, and is DETERIORATING; under HEALTH-v2's synthetic
band edges its System-Assessed RAG is **AMBER**. Reading "Green" as System-Assessed, the flagship
scenario does not fire the flagship rule.

---

## Decision

*(Proposed. Nothing below is implemented as authoritative until this ADR is accepted.)*

### D-1 (C-7) — **AMENDED at Phase 7 closure (2026-08-31): C-7 is resolved**

> **C-7 is resolved. Acceptance chose option (c), with the roles named.**
>
> The **four HEALTH-v2 executive dimensions are authoritative for `MET-HLTH-011` System-Assessed
> RAG**:
>
> | Dimension | Weight | What it is accountable for |
> | --- | --- | --- |
> | Financial | 0.40 | Margin, cost and the forecast at completion |
> | Delivery | 0.25 | Schedule, progress and throughput |
> | Scope & Commercial | 0.20 | Change, uncommercialised scope, contractual position |
> | Product & Quality | 0.15 | Defects, acceptance and assurance |
>
> The **six HEALTH-v1 analytical dimensions (`MET-HLTH-001`…`006`, `010`) are retained, not
> deleted**. They are the diagnostic detail view *beneath* the executive four — the layer an owner
> opens after the executive four have told them where to look. They remain blocked on MC-2 for
> their own weights, which is a calibration question and does not gate the executive model.
>
> **Resource, dependency, acceptance and assurance measures are drivers feeding these four, not
> competing peer-level executive dimensions.** `MET-DEL-023` dependency ageing feeds Delivery;
> `MET-QUA-010` acceptance blockers feed Product & Quality. This is the part of the resolution that
> does real work: a fifth or sixth executive dimension is exactly how a health model stops being an
> executive instrument, and the rule is now written down rather than defended case by case.
>
> **Data confidence is reported beside health and is never a dimension of it** (`PRODUCT_SPEC.md`
> §3.4). A project can be in genuine trouble on excellent data, or apparently fine on data nobody
> should trust. Blending the two produces a number that answers neither question.
>
> **Status effect.** `MET-HLTH-020`…`024` move from `Draft` to `Frozen`, as do the twelve other
> metrics that were Draft *solely* because of C-7 — including `MET-PORT-007` and `MET-HLTH-033`,
> whose own conflicts (MC-5, C-10) were already resolved by ADR-0019 and ADR-0018 and which were
> waiting only on this. `MET-DQ-008` Validity carried a C-7 tag that was over-broad — a
> domain-validity ratio does not depend on which health model the organisation is accountable to —
> and is Frozen on its own terms. `MET-DEL-012`, `MET-QUA-002` (MC-8) and `MET-DQ-009` (C-9) stay
> `Draft`, because a different blocker remains against each. **No metric was frozen because C-7
> was resolved and nothing else was checked.**
>
> **What is frozen is the mechanism, not the calibration.** The four weights and every
> normalisation edge remain **open calibration (Type B)** in the `HEALTH-v2` rule set, owned by
> Delivery leadership. Changing one changes the number; it does not change what the number means.
> That distinction is the whole reason C-7 was a Type A conflict and its weights are not.
>
> **Why this and not option (a) or (b).** (a) deleting the six analytical dimensions would throw
> away the diagnostic layer that makes an executive band actionable; (b) keeping six and supplying
> MC-2 weights would put six numbers in front of an executive whose scanning budget is thirty
> seconds (AC-1). The resolution keeps both and — the part that was actually missing — **says which
> one drives RAG**.
>
> The text below is retained as the record of the holding position. **It is no longer the decision.**

### D-1 (C-7) — register the executive model as a parallel Draft family, decide later *(superseded)*

`MET-HLTH-020`…`024` and rule set `HEALTH-v2` are registered as **`Draft`**, with the four stated
weights as set parameters and every normalisation edge open. `MET-HLTH-001`…`006` and `MET-HLTH-010`
stay `Frozen` and stay blocked on MC-2. The engine defaults to `HEALTH-v2` because it is the only
model whose weights exist, and `HEALTH_MODEL_V1` carries `blockedBy: 'MC-2'` so it cannot be used
accidentally.

**What acceptance must decide:** which model is authoritative for `MET-HLTH-011` System-Assessed RAG.
Options: (a) adopt HEALTH-v2 and deprecate the six-dimension family; (b) keep six dimensions and
supply MC-2 weights, retiring HEALTH-v2; (c) keep both, one for the executive headline and one for
analysis, and say explicitly which drives RAG.

### D-2 (C-8) — **SUPERSEDED by ADR-0019 (Accepted, 2026-08-30)**

> **MC-5 is resolved.** ADR-0019 defines `MET-PORT-007` as a deterministic **lexicographic** ordering
> over seven declared tiers, with **exposure/urgency separated from actionability** — which is what
> made "intervenability" definable. `rankAsMetPort007()` and `orderByExposure()` no longer exist;
> `rankInterventionPriority()` replaces both and returns a ranking.
>
> The text below is retained as the record of the holding position. **It is no longer the decision.**

### D-2 (C-8) — do not invent intervenability; ship the exposure ordering, labelled *(superseded)*

`rankAsMetPort007()` **throws**. `orderByExposure()` returns the two factors that exist
(`MET-FIN-019 × MET-FCST-010`), stamped `isInterventionPriority: false`, `blockedBy: 'MC-5'`, and
carrying a caveat that says a project high in the list may be one nothing can be done about. Projects
missing either factor are returned in a separate `unrankable` list rather than sorted to the bottom —
an unmeasured project is not a safe one.

**AC-1 depends on `MET-PORT-007`, so Phase 7 cannot ship until MC-5 is answered.** The throw is what
will stop it.

### D-3 (C-9) — keep the frozen formula, register the factor list separately

`MET-DQ-007` is implemented exactly as frozen and remains the authoritative forecast-confidence
number. The seven requested factors are registered as **`MET-DQ-009` Forecast Reliability Profile**,
`Draft`, and returned as a **profile of banded named factors with no aggregate score** — for the same
reason `MET-DQ-006` is a tuple: one number tells an executive reliability is low without telling them
which condition to fix.

**What acceptance must decide:** whether `MET-DQ-009` supersedes `MET-DQ-007` (a new major version of
a frozen metric), sits beside it permanently, or is withdrawn.

### D-4 (C-10) — **SUPERSEDED by ADR-0018 (Accepted, 2026-08-30)**

> **C-10 is resolved.** ADR-0018 replaces the single-reading question with two named findings:
> **System Green-at-Risk** (`MET-FCST-025` — System-Assessed GREEN now, approved outlook AMBER/RED at
> 30 or 60 days) and **Reported Green Risk** (`MET-HLTH-033` — Reported GREEN while the evidence says
> otherwise). They are independent, and Reported RAG is never overwritten.
>
> ADR-0018 also removes the "≥ 1 stated economics reason" gate this decision carried, because it made
> curated scenario **LR** — schedule-led deterioration with no cost overrun — structurally
> undetectable.
>
> The text below is retained as the record of the holding position and the objection that motivated
> the resolution. **It is no longer the decision.**

### D-4 (C-10) — the conservative reading stands, pinned by test *(superseded)*

`MET-FCST-025` reads "Green" as `MET-HLTH-011` System-Assessed RAG. This is the reading that
under-reports rather than over-claims: it declines to present an already-detected problem as a
discovery. Three regression tests in `tests/golden/phase4-engines.test.ts` pin the behaviour on
scenario B, so the reading cannot change without someone editing them and stating why.

The divergence is not lost under either reading: `MET-HLTH-030` reports B as **+1
REPORTED_OPTIMISTIC**, which `PRODUCT_SPEC.md` §3.3 calls the most valuable signal in the product.

**What acceptance must decide:** whether Green-at-Risk keys off Reported RAG (what the organisation
believes), System-Assessed RAG (what the evidence supports), or fires on either with the reading
named in the finding.

---

## Consequences

**Positive**

- No frozen formula was rewritten to match a phase instruction, and no open question was closed by
  inference. Every position that exists in an approved artifact still exists in the registry.
- The four conflicts are now visible in the build: 18 `Draft` metrics, each naming its Type A gap and
  its owner, and a registry test that fails if a Draft appears without being listed.
- The one metric that cannot be honestly produced throws rather than returning a plausible
  substitute.

**Negative**

- The registry carries two health models, and a reader must be told which is authoritative. The
  `Draft` status and the C-7 note on every affected definition are what carry that.
- 138 → 153 metrics, 15 of them Draft. That is a real increase in surface area, and it is the price
  of not overwriting.
- Phase 7's AC-1 is blocked until MC-5 is answered, and this ADR makes that visible rather than
  discovering it during a demo.

**Neutral**

- `HEALTH-v2` band floors (Green ≥ 70, Amber ≥ 45) and the TRAJECTORY-v1 Phase 4 additions are
  labelled `SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY`, consistent with every
  other calibrated value in the repository.

## Alternatives considered

1. **Edit `MET-HLTH-010` to four dimensions.** Rejected: a silent change to a frozen formula, and it
   would destroy the Risk and Resource dimensions with no record that they ever existed.
2. **Implement only the six-dimension model.** Rejected: MC-2 weights do not exist, so it computes
   nothing, and Phase 4 would deliver a health engine that cannot produce a health score.
3. **Substitute a proxy for intervenability** (recency, team size, contract remedy count). Rejected:
   it resolves MC-5 by inference, and the resulting ranking would look complete while being a third
   fabricated.
4. **Rewrite `MET-DQ-007` to the seven factors.** Rejected: same objection as (1), and it would
   silently invalidate any Phase 3 figure computed against the frozen definition.
5. **Fire Green-at-Risk on Reported RAG so scenario B lights up.** Rejected *for now*: it is the
   likely right answer and it is still a decision about product meaning, not an implementation
   detail. Recorded as D-4 for acceptance rather than taken unilaterally.

## Rollback

Each decision is independently reversible.

- **D-1:** delete `EXECUTIVE_HEALTH_METRICS` from the registry and the `HEALTH-v2` rule set; the
  Frozen six-dimension family is untouched and needs no migration.
- **D-2:** replace `rankAsMetPort007()`'s throw with the real ordering once MC-5 lands.
- **D-3:** delete `MET-DQ-009` and `forecastReliabilityProfile()`; `MET-DQ-007` never moved.
- **D-4:** change one condition in `assessGreenAtRisk()` and update the three pinned tests.

No data migration is required by any of them: nothing in this ADR has been persisted.
