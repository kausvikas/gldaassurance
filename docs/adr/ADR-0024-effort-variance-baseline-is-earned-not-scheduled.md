# ADR-0024 — `MET-RES-002`'s named baseline is *earned* effort, not *scheduled* effort

- **Status:** **Accepted** — 2026-08-31
- **Date proposed:** 2026-08-31
- **Date accepted:** 2026-08-31
- **Approver:** Principal Enterprise Architect + CFO / Delivery Economics + Delivery leadership
  (metric owner) + Independent model-validation reviewer
- **Phase:** Pre-Phase-11 architectural closure
- **Affects:** `MET-RES-002`, `MET-RES-010`, `MET-FIN-018` (cause 2 and cause 3), the Delivery and
  Financial health dimensions, the margin bridge on every project
- **Supersedes:** —
- **Raises and resolves:** **CONFLICT C-22 — Type A**

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

`MET-RES-002` is `Frozen`. Its registered formula is:

> `actual hours − planned hours (named baseline)`

**The formula defers the baseline rather than fixing it.** "Named baseline" is an instruction to
name one, and it is the implementation that chose. So selecting the baseline is an open decision,
not a frozen constant — which is why this is settled by ADR rather than treated as a formula change.

The implementation time-phases the priced plan by the **planned completion** recorded on the latest
progress claim:

```
plannedEffortToDate = plannedEffortHours × plannedCompletion
```

`ProgressClaim` carries **two** completion figures, and the choice between them is the whole issue:

| Field | Meaning |
| --- | --- |
| `plannedCompletion` | Where the **schedule** said the project would be by now |
| `physicalCompletion` | How much work has **actually been completed** |

### What the schedule baseline actually measures

Using `plannedCompletion` asks: *"have we spent the hours we planned to have spent by today?"* A
project that is behind schedule has not done the work, so it has not burned the hours — and it
therefore books an **effort underrun**, which the margin bridge values at the sold rate and reports
as **margin gained**.

That is a false statement about the business. The project has not saved money; it has not yet spent
it, and the work is still owed. Slippage is being reported as efficiency.

Using `physicalCompletion` asks the earned-value question instead: *"for the work we have actually
completed, did we spend more hours than that work was priced at?"* That isolates effort efficiency
from schedule position, which is what a variance labelled "Effort overrun" claims to be.

### Measured on the demo portfolio

| | |
| --- | --- |
| Fixed-bid projects **behind** schedule | **48 of 75** |
| Ahead | 26 · Level | 1 |
| Median gap (`plannedCompletion − physicalCompletion`) | **7.0 percentage points** |
| Margin credit created **purely** by the baseline choice | **$63.31M** |
| `effort-overrun` cause, net across the portfolio, before | **+$48.75M** (a credit) |

The portfolio is behind schedule and losing money, and the bridge's second-largest cause was telling
an executive that effort had **saved** $48.75M. The size of the error exceeds the size of the term.

### How it was found

It was not found by a failing test — every test passed. It surfaced from the §9.3 residual audit:
the unattributed residual was **−$112.52M against a −$79.72M total delta**, meaning the *named*
causes netted **+$32.8M** and the residual was carrying more than the entire portfolio loss. A
residual larger than the movement it explains is a signal that a named cause has the wrong sign, and
the sign census (**62 of 75 residuals negative**) confirmed it was systematic rather than noise.

## Decision

### D-1 — The named baseline is `plannedEffortHours × physicalCompletion`

`MET-RES-002` is measured against **earned** effort. The baseline is named in the output
(`effortBaselineBasis`) so the comparison stays auditable, and the input field is renamed
`earnedCompletionRatio` so the engine cannot be re-wired to the schedule figure by accident.

The **formula is unchanged** — it is still `actual hours − planned hours (named baseline)`. Only the
baseline is named, which is the act the formula asks for.

### D-2 — `MET-RES-010` follows, because it shares the baseline

Resource cost drift is `MET-RES-005 × hours to date`. It is not re-derived here; it inherits the
corrected hours basis so that cause 2 and cause 3 of the bridge remain a partition rather than
overlapping.

### D-3 — Schedule position keeps its own metric, and is not folded into effort

The `plannedCompletion − physicalCompletion` gap is real and is **schedule** information. It belongs
to the delivery dimension, where it is already reported. It is not re-expressed as money inside the
margin bridge, because doing so would recreate the same conflation from the other direction.

### D-4 — The residual is reported, not reduced

This decision is taken because the previous baseline was **wrong**, not because it shrinks the
residual. The residual remains computed as `total − Σ(named)` and is still large; §9.3 debt
(**DR-062**) stands on its own and is not considered closed by this ADR.

## Consequences

**Positive**

- The bridge stops reporting schedule slippage as margin saved. The single largest misstatement
  found in the pre-Phase-11 audit is removed.
- Effort variance becomes comparable across projects at different schedule positions, which it was
  not before: two projects with identical efficiency but different slippage previously produced
  different "effort" numbers.
- The explanatory coverage of the bridge improves as a *side effect*, which is evidence the causes
  are now pointing the right way — not the reason for the change.

**Negative**

- **The portfolio looks worse on the bridge, and it should.** Projects previously credited with an
  effort saving lose it. Any figure an executive saw before this change overstated effort
  performance. That is stated plainly rather than quietly corrected.
- `MET-RES-002` values are not comparable across the change. The catalog entry is version-bumped so
  the discontinuity is dated and visible.
- **The residual's *share* of the bridge rises in the tail even though its size halves**, because the
  named terms shrank faster than the residual did (projects with residual ≥75% of gross: 8 → 26).
  Both facts are reported. A smaller residual that is a larger fraction of a smaller explained total
  is still a bridge that explains less than it appears to, which is why DR-062 stays open.

### Measured effect — after implementation

| | Before | After |
| --- | --- | --- |
| `effort-overrun`, net across 75 projects | **+$48.75M** (credit) | **−$14.57M** (cost) |
| `effort-overrun`, gross absolute | $60.81M | $15.29M |
| Residual, net | **−$112.52M** | **−$49.21M** |
| Residual, gross absolute | $115.26M | $54.27M |
| Σ named causes, net (against a −$79.72M delta) | **+$32.80M** | **−$30.51M** |
| Median residual share of gross | 0.548 | 0.545 |
| Negative residuals | 62 of 75 | 63 of 75 |

**The named causes previously pointed the wrong way in aggregate.** They claimed the portfolio had
gained $32.80M while the total delta was a $79.72M loss. They now point the same direction as the
delta they are supposed to explain.

**Health bands did not move: RED 47 / AMBER 27 / GREEN 1 before and after, and GM value at risk is
unchanged at $90.80M.** This was *predicted* in draft and is *measured* here, and the prediction was
wrong in an instructive way: official health and value at risk derive from EAC-based economics, which
do not consume `MET-RES-002`. The blast radius is therefore the **margin bridge's attribution**, not
the official band. That is a narrower impact than feared and is stated rather than claimed as a
validation — the bridge was wrong on its own terms, and nothing about the band's stability makes the
earlier attribution acceptable.

**Neutral**

- No generator fact changed; the content hash is unaffected. Both completion figures were already
  recorded on every progress claim — this reads a different one, it does not create data.
- No threshold, weight or band edge was touched.

## Alternatives considered

**Keep the schedule baseline and explain it in the tooltip.** Rejected. The cause is *labelled*
"Effort overrun" and is valued in money on an executive waterfall. A label that means something
other than what it says is not repaired by a footnote, and the audience for this page reads the
waterfall, not the definitions.

**Report both baselines side by side.** Rejected for the bridge, which must partition a single delta
exactly once — two effort terms would double count. The schedule gap remains available in the
delivery dimension (D-3), which is where the comparison genuinely belongs.

**Treat the whole thing as `NOT_ATTRIBUTED` and push effort into the residual.** Rejected as a
retreat: effort variance against earned progress is computable from facts already recorded, and
moving a computable cause into the residual would make the bridge explain less in order to avoid
making a decision.

**Defer to Phase 11.** Rejected. The defect misstates the direction of a headline economic term by
$63M on a 75-project demo portfolio. Shipping a known sign error into an AI-assistant phase would
let the assistant quote it.

## Migration implications

Confined to derivation; there is no stored state and no data migration. `MET-RES-002` and
`MET-RES-010` change value on projects where `physicalCompletion ≠ plannedCompletion` (74 of 75).
Every consumer is recomputed from facts on each run, so there is no cache or snapshot to invalidate.
Golden-output tests that pinned the old values are updated to the new ones **with the reason
recorded in the phase report**, not silently re-baselined.

## Rollback

One expression in the adapter and one field name in the resource engine. Restoring
`plannedCompletion` reverts it exactly — which should not be done, and the adversarial test asserting
that a behind-schedule project cannot book an effort **credit** would fail if it were.
