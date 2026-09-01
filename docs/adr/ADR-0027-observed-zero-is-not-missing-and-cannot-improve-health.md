# ADR-0027 — Observed zero is data, not absence; and a missing adverse input may never improve health

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Principal Enterprise Architect + CFO / Delivery Economics Model Validator + Chief
  Delivery Officer + Principal Quantitative / Health-Model Architect + Independent model-risk reviewer
- **Phase:** Pre-Phase-11 model-correctness remediation
- **Affects:** `MET-DEL-018`, `SignalReading`, the rules engine, `scoreDimension`, `HEALTH-v2`
  dimension input metadata, `assessmentStatus`, the project executive health service and surface
- **Resolves:** **DR-068 (S4)** and the reason-provenance defect (S3)

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context — the hostile case that forced this

A Fixed-Bid project, 13 weeks into delivery, **every weekly progress claim recorded**, stuck at
**40% physical completion with zero advance across the whole 8-week window**, 200 days of window
remaining, needing 0.021 completion-points per week. Everything else genuinely clean.

The product assessed it:

| | |
| --- | --- |
| `MET-DEL-019` demonstrated velocity | **0** (observed, computable) |
| `MET-DEL-020` required future velocity | **0.021/week** (computable) |
| `MET-DEL-018` required velocity ratio | **null** |
| `OVR-NO-CREDIBLE-PLAN` | `NOT_COMPUTABLE` |
| Delivery dimension | **100.00** |
| Composite | **98.12** → **GREEN** |
| `assessmentStatus` | **COMPLETE** |
| **Final System RAG** | **GREEN** |

**A project that has not moved in eight weeks was assessed GREEN, with a complete four-dimension
assessment and a perfect delivery score.**

### Four independent defects, not one

1. **Metric semantics.** `MET-DEL-018` divides by demonstrated velocity and returns `null` when the
   denominator is zero. But *zero demonstrated velocity is an observation*, and the most adverse one
   the metric can carry. It was represented identically to "we have no idea."
2. **Scoring semantics.** `scoreDimension` renormalises over *usable* inputs
   (`score = Σ(normalised × weight) / Σ(weight of usable)`). `MET-DEL-018` carries **0.30 of 1.00**
   in Delivery, so dropping it re-weights the three clean inputs to 1.00 and the dimension
   **improves from what it would have been to a perfect 100**. The absence of the worst fact raised
   the score.
3. **Assessment completeness.** `assessmentStatus` was `COMPLETE` because every *dimension* produced
   a number. Dimension computability and assessment completeness are different questions, and the
   product answered the second with the first.
4. **Reason provenance.** The delivery engine knew exactly why — *"the project has not advanced, so
   there is no rate to compare the requirement against"*. `SignalReading` has a
   `notComputableReason` field and the adapter never populated it, so the payload said
   **"signal not supplied"** — describing a supply failure that did not happen.

## Decision

### D-1 — The governing invariant

> **A deterioration in observed project reality must never improve an executive health conclusion
> merely because a derived metric crosses from numeric into non-numeric representation.**

And its corollary:

> **Removing a risk-bearing input must not silently raise a score through renormalisation unless the
> model has proved the input is NOT_APPLICABLE rather than adverse or unknown.**

### D-2 — Three denominator states, separated

For a ratio metric whose denominator can be zero:

| State | Meaning | Result |
| --- | --- | --- |
| **Unknown denominator** | The evidence does not exist | `NOT_COMPUTABLE` |
| **Observed zero, zero requirement** | Nothing left to do, and nothing being done | Governed benign — `NOT_APPLICABLE` via the remaining-work predicate |
| **Observed zero, positive requirement** | Work remains, and no throughput has been demonstrated | **`UNBOUNDED` — an observed adverse state** |

**`UNBOUNDED` is not `NOT_COMPUTABLE`.** The ratio is not unmeasurable; it is unbounded, which is a
stronger statement than any finite number the metric could have returned.

### D-3 — `MET-DEL-018` gains an explicit `UNBOUNDED` state — Option A

Chosen over Option B (a companion condition metric) and Option C (a rule-level predicate):

- **Option C** puts the semantics in the rule, so the *dimension score* would still see a null and
  still renormalise upward. It fixes the override and leaves defect 2 alive.
- **Option B** creates a second metric describing the same fact, which then has to be kept
  consistent with the first — and the bridge and ranking would still read the null.
- **Option A** fixes the fact once, at the metric, and every consumer inherits it.

**No `Infinity` or `NaN` enters `Money` or `Quantity`.** The state is carried as an explicit
discriminated field alongside a `null` numeric value, so the decimal infrastructure never sees a
non-finite number and nothing non-finite can serialise.

`MET-DEL-018` is version-bumped to **2.0.0**: its zero-denominator behaviour changes from
"NOT_COMPUTABLE" to "UNBOUNDED where required velocity is positive", which is a semantic change to a
Frozen metric and is therefore governed here rather than made silently.

### D-4 — An `UNBOUNDED` signal breaches any finite upper threshold

`OVR-NO-CREDIBLE-PLAN` fires. This is not a new rule and not a widened one: the rule already owns
*"finishing on the committed date requires at least twice the demonstrated rate"*, and a project
with no demonstrated rate at all requires **more** than any multiple of it. Zero observed velocity
with work remaining is unequivocally inside the rule's intended domain.

For a `GTE`/`GT` comparison an `UNBOUNDED` observation fires. For `LT`/`LTE` it does not. The
direction is explicit, not inferred.

### D-5 — An `UNBOUNDED` input scores at the red edge, never dropped

In `scoreDimension` an `UNBOUNDED` input normalises to **0** — the worst score — and stays in the
denominator. It is an observation, so it is scored like one.

**This is not a null penalty.** `NOT_COMPUTABLE` and `NOT_APPLICABLE` keep their existing treatment;
only the explicitly governed adverse state scores adversely (§12 of the remediation brief).

### D-6 — Material inputs, and honest completeness

`DimensionInput` gains `materiality: 'MATERIAL' | 'SUPPORTING'` (default `SUPPORTING`). A dimension
that loses a **MATERIAL** input still scores where the arithmetic allows, but is marked
**provisional**, and the assessment reports `PROVISIONAL` rather than `COMPLETE`.

`MET-DEL-018` is `MATERIAL`: it is the only Delivery input that asks whether the remaining plan is
achievable. `MET-FIN-014`, `MET-COM-009` and `MET-QUA-006` are already `required` — a stronger
condition — and are unchanged.

**Dimension computability, assessment completeness and evidence confidence are three questions.**
This separates the first two; confidence remains where it is.

### D-7 — The strongest truthful reason survives

Where a domain engine knows why a metric is non-computable, no downstream layer may replace that
reason with a weaker generic one. `SignalReading.notComputableReason` is populated by the adapter
from the metric's own reason and carried through rule evaluation into the application DTO.

### D-8 — No double counting

The adverse state is represented **twice on purpose**: the Delivery dimension degrades (it is a real
delivery fact) and the override fires (it guarantees escalation past a weighted average). That is
the existing, governed relationship between dimensions and overrides — the surface already separates
pre-override composite, override, and final RAG, so a reader can see both without adding them.

## Consequences

**Positive**

- The hostile project can no longer read GREEN, and the defect class — *missing adverse input
  improves score* — becomes a permanent model invariant with tests.
- `NOT_COMPUTABLE` regains its meaning now that the observed-zero case has left it.
- Phase 11 can state why a control did not evaluate, in the domain's own words.

**Negative**

- `MET-DEL-018` values are not comparable across the version change where the denominator is zero.
- A third state on a metric result is more to reason about than a nullable number. It is the
  minimum needed to stop a stall reading as health.

**Neutral**

- No threshold, weight, band edge or synthetic fact changes. The generator hash is untouched.
- Completed projects stay `NOT_APPLICABLE`: applicability is still evaluated **before** the metric,
  so zero velocity at 100% completion never reaches the `UNBOUNDED` branch.

## Alternatives considered

**Map `null` to the worst score.** Rejected outright — it conflates not-applicable, unknown and
observed-pathological, and would turn every evidence gap into a red delivery signal.

**Keep the metric null and fix only the override (Option C).** Rejected: the dimension would still
renormalise upward, so composite and dimension score stay wrong while only the band is rescued.

**Make `MET-DEL-018` `required`.** Rejected: that makes the whole Delivery dimension NOT_COMPUTABLE
on every early-stage project, which is a large regression to fix a narrow case, and it would report
"cannot assess delivery" where the truth is "this particular question does not apply yet."

**Persist `Infinity`.** Rejected. It escapes into serialisation, comparison and formatting, and
`Money`/`Quantity` are decimal types that must never carry a non-finite value.

## Rollback

Additive: one metric state, one signal field, one scoring branch, one materiality flag. Reverting
restores the GREEN assessment of a stalled project, so the golden case would fail — which is the
point of promoting it to a permanent fixture.
