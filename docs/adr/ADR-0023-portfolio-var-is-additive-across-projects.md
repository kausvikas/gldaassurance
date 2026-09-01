# ADR-0023 — Portfolio value at risk is additive across projects; shared cause is concentration, not duplication

- **Status:** **Accepted** — 2026-08-31
- **Date proposed:** 2026-08-31
- **Date accepted:** 2026-08-31
- **Approver:** Principal Enterprise Architect + CFO / Delivery Economics + Delivery leadership
  (metric owner) + Independent model-validation reviewer
- **Phase:** Pre-Phase-11 architectural closure
- **Affects:** `MET-PORT-003`, `REQ-PORT-003`, the Portfolio Command Center GM value-at-risk KPI,
  `METRIC_CATALOG.md`
- **Supersedes:** **ADR-0021** (its decision, not its problem statement)
- **Resolves:** **CONFLICT C-20**, correctly this time

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context — what ADR-0021 got wrong

ADR-0021 was accepted earlier the same day. It implemented `MET-PORT-003` as its Frozen formula
reads: subtract, for every group of projects sharing a `riskCauseKey`, the group total less its
largest single-project contribution. On the demo portfolio that removed **$38.93M from an $89.19M
gross — 44% of portfolio exposure.**

**The reduction was economically unsupported, and it understated real exposure.**

`MET-FIN-019` is `max(0, MET-FIN-026 − MET-FIN-032)`: *this* project's sold margin less *this*
project's risk-adjusted margin. **Two projects' margins are disjoint pools of money.** No dollar can
appear in both, so between two projects there is nothing to de-duplicate. If a key person is lost
across three projects, three margins are damaged and the portfolio loses all three.

### A shared cause key is a category, not a monetary event

The fact model settles it. `RiskRow` carries `riskCauseKey`, `probability` and `costImpact` — and
**no shared-exposure identifier, no allocation amount, and no allocation basis**. On the demo
portfolio, `KEY_PERSON` spans **75 risk rows across 59 projects with 67 distinct cost impacts**.
Those are 59 separate risks filed under one label, not one loss booked 59 times.

Cause identity alone can never distinguish:

- *six separate losses arising from one root cause* — additive, nothing to remove; from
- *one loss booked six times* — genuine duplication.

Only the second is double counting, and only explicit monetary allocation evidence can identify it.

### Why the error survived review

It reconciled, it was deterministic, it was provably non-negative, and it collapsed a hostile input
of twenty identical projects to one. **Every one of those properties is satisfied by a wrong
formula.** The hostile-input test asserted that twenty $1M projects sharing a cause total $1M — it
was asserting the defect. A green suite is evidence about the code, not about the specification.

## Decision

### D-1 — `MET-PORT-003` is additive across distinct eligible projects

```
MET-PORT-003 = Σ MET-FIN-019 over distinct authorised eligible projects, each counted exactly once
```

`MET-FIN-019`'s raw, downside-only semantics are preserved exactly; nothing is floored, scaled or
transformed on the way into the sum.

**This satisfies `REQ-PORT-003`.** *"Aggregates without double counting"* means no project's exposure
is counted twice — which counting each distinct project once achieves, and which the multi-cause
reading over-interpreted. A project carrying four cause keys contributes its figure **once**, and a
project supplied twice in one call contributes **once**. That is the entirety of the de-duplication
the requirement asks for.

### D-2 — The Frozen formula is corrected, not worked around

`MET-PORT-003`'s registered formula embedded the economic error, so the metric is amended and
version-bumped rather than left standing while the code diverges from it. `METRIC_CATALOG.md` is
regenerated from the registry.

Amending a Frozen metric is a governed act and is done here for a **correctness** reason, not a
presentational one — the previous definition instructed implementers to remove money that was
genuinely at risk.

### D-3 — Concentration is reported beside the total, never inside it

Shared root cause is real and important: it is **systemic concentration**. It is now reported as
diagnostics carrying, per cause, the exposed project count, the total value at risk on projects
carrying it, the largest single-project exposure and its share of the portfolio.

These rows are **explicitly non-additive** — a project exposed to three causes appears in three rows,
so the rows sum to more than the portfolio total — and the result object carries
`concentrationIsAdditive: false` plus a `deduplicationBasis` string so no consumer can render the
figure as de-duplicated when it is not.

### D-4 — What a future reduction would require

Cross-project monetary de-duplication becomes permissible only with an explicit fact model:

| Field | Meaning |
| --- | --- |
| `SharedExposureId` | The single monetary event |
| `TotalSharedExposureAmount` | Its governed total |
| `ProjectAllocationAmount` | The portion booked against each project |
| `AllocationBasis` | How the split was determined |
| `AllocationConfidence` | How reliable that split is |
| `ResidualUnallocatedAmount` | The part attributed to no project |
| Provenance and effective date | So the allocation is auditable and dated |

Allocated exposure plus residual must reconcile exactly to the governed shared total. **Cause
identity remains insufficient, permanently.**

## Consequences

**Positive**

- Portfolio exposure returns to **$89.19M** on the demo portfolio. The figure an executive is shown
  is no longer 44% below the evidence.
- Concentration is now visible *as concentration* — arguably more useful than the subtraction ever
  was, and it cannot be mistaken for an allocation.
- The adversarial cases are permanent tests, including the exact input the old code collapsed.

**Negative**

- `REQ-PORT-003` was reported met at the previous closure on a wrong basis. It is met now, for a
  different and correct reason. The Phase 7 record must show both, and it does — history is
  annotated, not rewritten.
- The KPI moves from $50.26M back to $89.19M. Anyone who saw the earlier figure saw an understatement.

**Neutral**

- No generator data changed. No other metric changed. `MET-FIN-019` is untouched.

## Alternatives considered

**Keep the subtraction because the metric was Frozen.** Rejected. Precedence exists so that an
accepted decision can be corrected through governance, not so that a known economic error survives
because changing it is inconvenient. The alternative was knowingly showing a 44% understatement.

**Leave `MET-PORT-003` unimplementable and label the KPI `MET-FIN-019`.** Rejected as less honest:
the plain sum over distinct projects *is* the right portfolio figure, so the portfolio-level metric
should say so rather than being abandoned.

**Attribute a share of each project's VaR to each cause and de-duplicate the shares.** Rejected —
this is what ADR-0021 did. Attribution *within* a project is defensible and is retained as a driver
diagnostic; using it to net money *between* projects is the error.

## Rollback

Confined: one module, one KPI evidence block, one metric definition. Rolling back means restoring
the ADR-0021 subtraction — which should not be done, and the adversarial tests would fail if it were.
