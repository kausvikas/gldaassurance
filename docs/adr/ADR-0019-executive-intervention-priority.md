# ADR-0019 — Executive Intervention Priority: lexicographic tiers, with exposure separated from actionability

- **Status:** **ACCEPTED**
- **Date:** 2026-08-30 (Phase 6 closure / Phase 7 entry gate)
- **Approver:** Delivery leadership (owner of MC-5), Delivery Intelligence Product Owner,
  Enterprise Data / Analytics Architect
- **Phase:** 6 closure, resolving **MC-5**
- **Affects:** `MET-PORT-007`; rule set `PRIORITY-v1`;
  `src/contexts/portfolio/internal/intervention-priority.ts`;
  `tests/unit/contexts/intervention-priority.test.ts`
- **Supersedes:** ADR-0015 D-2 (the "ship the exposure ordering, labelled" holding position)

---

## Context

The Portfolio Command Center exists to answer one question in thirty seconds (AC-1): **where should
leadership intervene first?** `MET-PORT-007` is that answer, and it has been blocked since Phase 2.

The registered formula was `MET-FIN-019 × MET-FCST-010 × intervenability`. Two factors existed. The
third did not, and MC-5 recorded why it was not merely an unset threshold: *"intervenability" is not a
number awaiting calibration; it is a concept nobody has defined.* Phase 4 did the right thing —
`rankAsMetPort007()` **threw**, and `orderByExposure()` returned the two real factors under a caveat
saying a project high in the list might be one nothing can be done about.

That was correct and it could not survive into Phase 7, because a Command Center whose ranking
function throws is not a Command Center.

**Why the question was unanswerable as posed.** "Intervenability" conflated two things that are not
the same kind of fact and do not belong in the same product of terms:

- **exposure and urgency** — how bad is this, and how soon. Observed, or deterministically derived
  from observed facts.
- **actionability** — is there a credible intervention. Evidenced by an owner, a date, a stated
  benefit. Frequently **absent**, and absent is informative.

Multiplying them is worse than leaving one out. A project with catastrophic exposure and no plan
scores near zero on a product — it drops off the list precisely because nobody has done anything
about it yet.

---

## Decision

### D-1 — Separate exposure/urgency from actionability, and never infer one from the other

Two input shapes, `ExposureEvidence` and `ActionabilityEvidence`. Actionability is graded **only from
the presence of plan records**:

| Grade | Requires |
| --- | --- |
| `CREDIBLE_PLAN` | an open recovery action **and** a named owner **and** a due date **and** a stated GM or schedule benefit |
| `PLAN_FORMING` | an open recovery action, missing one of the above |
| `NO_PLAN` | somebody assessed it and there is no open action |
| `NOT_ASSESSED` | nobody has looked |

`NO_PLAN` and `NOT_ASSESSED` are deliberately distinct: one means there is nothing to do, the other
means nobody has checked, and they call for opposite responses. Severity is never an input to this
grade — a test asserts a catastrophic project with no records grades `NOT_ASSESSED`.

### D-2 — Lexicographic tiers, not a weighted score

Ordering walks seven tiers and returns at the **first difference**:

| # | Tier | Direction |
| --- | --- | --- |
| 1 | Critical economic or contractual exposure — penalty exposure > 0, or forecast contract loss > 0, or RED with `MET-FIN-019 ≥ criticalGmValueAtRiskFloor` | present first |
| 2 | Predicted deterioration — `MET-FCST-025`, or an outlook horizon worse than the present band | present first |
| 3 | Time criticality — `min(MET-FCST-007, weeksToCriticalMilestone)` | sooner first; unknown last |
| 4 | GM value at risk (`MET-FIN-019`) | larger first |
| 5 | Actionability grade | more credible first |
| 6 | Rank confidence | higher first |
| 7 | Project id | ascending |

**Why lexicographic.** A weighted composite lets a large GM value at risk outvote a contractual
penalty already crystallising, and nobody reading the number can see that it happened. With tiers, a
hard risk cannot be buried because there is no average to bury it in, and every adjacent pair in the
list can state the single tier that separated them — which is what makes the ordering defensible in
the room where it is used.

**Why actionability is tier 5.** Below every exposure tier, on purpose. It orders *equals*; it can
never lift a small problem with a good plan above a large problem without one. That is the property a
weighted model would have quietly violated, and it is asserted directly by test.

**No composite score is emitted anywhere.** `CLAUDE.md` invariant 9 and `PRODUCT_SPEC.md` §8; a test
greps the serialised result for `score`, `weight` and `compositeIndex` and fails on any of them.

### D-3 — Missing evidence lowers confidence; it never fabricates certainty

- A candidate with **no evaluable tier** (no critical exposure, no worse outlook, no GM value at
  risk) is returned in `insufficientEvidence` — **not sorted last**. An unmeasured project is not a
  safe one, and putting it at the bottom is a claim the function has no basis to make.
- A candidate that *can* be placed but has gaps is ranked with its `evidenceGaps` named and its
  `rankConfidence` reduced. Gaps only ever lower the band.
- Within tier 4, a measured exposure orders ahead of an unmeasured one at the same position, and the
  gap is stated on the row rather than hidden by the order.

### D-4 — Deterministic, explainable, versioned

Identical inputs give byte-identical output (AC-7). The comparison is exported so its **laws** are
tested rather than a sample of its outputs: antisymmetry and transitivity are asserted over every
pair and triple of a six-project universe, and ordering is proven independent of input order.

`PRIORITY-v1` now carries two ordinary calibration parameters — `criticalGmValueAtRiskFloor` and
`immediateHorizonWeeks` — replacing the open `intervenabilityFactor`. **They remain synthetic
calibration candidates**, like every other threshold in this repository.

---

## Consequences

**Positive**

- `MET-PORT-007` returns a ranking instead of throwing. Phase 7 can build the Command Center.
- Every placement is explainable in one sentence, and every adjacent pair by the tier that decided
  it — AC-3 applies to the ranking itself, not only to the numbers in it.
- "There is no plan" becomes visible as a fact about a project rather than invisible inside a score.

**Negative**

- Lexicographic ordering is **discontinuous**: a project one dollar under `criticalGmValueAtRiskFloor`
  ranks materially below one a dollar over. That is inherent to tiering and it is the price of a hard
  risk being unburiable. The floor is a governed parameter partly so this edge is visible and
  arguable rather than buried in a weight.
- Seven tiers is more to explain than one number. Mitigated by publishing `PRIORITY_TIER_ORDER` and
  by `outranksBecause` on every row.
- Actionability depends on recovery-plan records that Phase 10 owns. Until then most projects grade
  `NOT_ASSESSED`, so tier 5 rarely decides anything — the ordering is correct but tier 5 is mostly
  inert in the POC, and that should not be mistaken for it being unnecessary.

**Neutral**

- `MET-PORT-007` stays `Draft`. Its own semantics are settled; tiers 1 and 2 consume `MET-HLTH-011`
  and `MET-FCST-025`, whose health model is still unresolved under **C-7**. That is an input
  question, not an ordering question, and it does not block Phase 7.

## Phase 7 closure — what the real portfolio showed (2026-08-31)

The ranking was exercised against all 75 fixed-bid projects. The decision is unchanged; three
observations are recorded because a later reader will otherwise re-derive them from scratch.

**Tier 1 partitions; it does not rank.** Critical exposure fires for **47 of 75** projects. That is
not a defect — a portfolio in this condition genuinely has that many projects carrying penalty
exposure, forecast loss or a Red band over the value-at-risk floor. But it means tier 1 answers
"is this in the serious half?" and almost nothing else, and the ordering that an executive actually
reads is produced by tiers 3 and 4. Empirically **72 of the 74 adjacent pairs** are decided by the
clock (21) or by gross margin at risk (51). A reader told only "it is ranked by intervention
priority" would wrongly imagine tier 1 doing the work.

**Tier 2 never co-occurs with tier 1 in this portfolio.** No project is both critically exposed and
predicted to deteriorate: the seven projects with a worsening outlook are all *below* the critical
exposure line. This is a property of the synthetic portfolio, not a law — but it is worth knowing
that the demo does not exercise the tier-1/tier-2 interaction, and a reviewer who assumes it does
will over-read the ordering.

**Tier 5 never fires at all.** Every project grades `NOT_ASSESSED` for actionability because the POC
has no recovery-plan store. The tier is implemented and unit-tested; it simply has no data to act
on. Recorded as **DR-049**, and the executive table shows "Not assessed" rather than an empty cell,
because a blank would read as "no recovery needed".

**No change to the tier order.** The alternative — giving tier 1 an internal ordered structure, so
that a larger penalty outranks a smaller one before the clock is consulted — was considered and
rejected: it would put money ahead of time inside the tier that exists precisely because time is
what makes an exposure unrecoverable. Tiers 3 and 4 already order within tier 1, in that order,
and the deciding tier is stated on every row so the reader can see which one applied.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Define `intervenability` as a 0–1 factor and keep the product** | The original formula. Requires inventing the concept MC-5 says nobody has defined, and the multiplication still lets a zero-plan project vanish from the list |
| **A weighted 0–100 executive priority score** | Explicitly prohibited by the phase brief, and rightly: it buries hard risk, needs weights nobody has approved, and cannot answer "why is this third?" |
| **Rank by GM value at risk alone** | Simple, defensible, and wrong: it puts a large stable project above a small one about to breach a contractual deadline |
| **An ML ranking learned from past interventions** | No outcome data exists, `PRODUCT_SPEC.md` §4.2 defers ML, and a fitted ranking nobody can interrogate fails AC-3 |
| **Keep `orderByExposure()` and label the screen** | The Phase 4 holding position. A Command Center that says "this list may be wrong in a way we cannot tell you about" is not one an executive will use twice |
| **Put actionability above GM value at risk** | Would let a well-documented small problem outrank a large undocumented one — rewarding paperwork over exposure |

## Rollback

Restore `orderByExposure()` and the throwing `rankAsMetPort007()`; revert the `MET-PORT-007` formula
and the `PRIORITY-v1` parameters. Phase 7's Command Center then has no ranking, which is the state
this ADR exists to leave behind.
