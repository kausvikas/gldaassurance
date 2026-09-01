# ADR-0021 — Portfolio value at risk: shared-cause de-duplication

- **Status:** **SUPERSEDED by ADR-0023** — 2026-08-31. Its problem statement stands; **its decision was economically wrong** and removed $38.93M of real exposure. Retained as the record.
- **Date proposed:** 2026-08-31
- **Approver:** Principal Enterprise Architect + Delivery leadership (metric owner) + Finance
- **Date accepted:** 2026-08-31
- **Phase:** 7 (raised at closure)
- **Affects:** `MET-PORT-003`, `MET-FIN-019`, `REQ-PORT-003`, the Portfolio Command Center GM
  value-at-risk KPI, `aggregate()` in `src/contexts/portfolio/internal/aggregation.ts`
- **Supersedes:** —
- **Raises:** **CONFLICT C-20 — Type A** · **Resolves it at acceptance**

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

`REQ-PORT-003` requires that *"portfolio value at risk aggregates without double counting"*, verified
by a golden test. `MET-PORT-003` is `Frozen` and states the rule:

> `Σ MET-FIN-019 over authorised projects − Σ over shared riskCauseKey groups of (group total
> attributable to that cause − the largest single-project contribution in the group)`

The intent is clear and correct: one root cause that threatens six projects is **one** exposure, and
summing it six times inflates the portfolio figure by exactly the amount an executive would later
have to explain away.

**The rule is not computable as written**, for two independent reasons.

### 1. "The group total attributable to that cause" has no definition

`MET-FIN-019` is `max(0, MET-FIN-026 − MET-FIN-032)` — sold gross margin less risk-adjusted gross
margin. It is a **single figure per project**. Nothing in the metric catalog says how to split it
across the causes that contributed to it. Candidate attributions each produce a different portfolio
total:

- by probability-weighted cost impact of the open risks carrying that cause;
- by raw cost impact, ignoring probability;
- in equal shares across the project's distinct causes;
- attributing the whole of a project's VaR to its single largest cause.

These are not roundings of one another. They are different metrics.

### 2. A project belongs to several groups at once, and the rule does not say what then

Measured against the demo portfolio (91 projects, all engagement models):

| Distinct open-risk cause keys per project | Projects |
| --- | --- |
| 1 | 10 |
| 2 | 28 |
| 3 | 32 |
| 4 | 19 |
| 5 | 2 |

**81 of 91 projects carry more than one cause**, and every one of the five causes is shared across
37–63 projects. Applying the subtraction once per group, as written, subtracts a project's
contribution repeatedly — driving the portfolio figure toward zero and, on this portfolio, past it.
A metric that returns a negative value at risk is not a conservative estimate; it is a wrong number.

This is **Type A**: the question is what the figure *means* when one project is exposed to four
shared causes at once, not what threshold to set. Two defensible readings — "de-duplicate per cause
and accept that a multi-cause project is discounted several times" versus "attribute each project to
exactly one cause for de-duplication purposes" — produce materially different portfolio totals from
identical facts, and an executive cannot be asked to choose between them at read time.

> ## ⛔ SUPERSEDED
>
> **ADR-0023 replaces the decision below.** The subtraction it specifies is not valid: `MET-FIN-019`
> is one project's own margin, so two projects hold **disjoint pools of money** and there is nothing
> to de-duplicate between them. A shared `riskCauseKey` is a category label, not an identifier for a
> single monetary event — the risk model carries no shared-exposure id, allocation amount or
> allocation basis. On the demo portfolio this decision removed **$38.93M of $89.19M**: real exposure,
> understated by 44%.
>
> The **Context** above remains accurate and is why C-20 was raised. Only the Decision is withdrawn.

## Decision — as accepted, now WITHDRAWN

The two open questions are answered, and `MET-PORT-003` is implemented in
`src/contexts/portfolio/internal/shared-cause-dedup.ts`.

### D-1 (a) — attribution is probability-weighted cost impact, scaled to `MET-FIN-019`

Each open risk contributes `probability × costImpact` to its own cause; the raw shares are then
scaled so they **sum exactly to the project's `MET-FIN-019`**. Scaling is the substantive part: it
keeps the subtraction denominated in the same authoritative figure the rest of the product reports,
rather than in a second, larger risk-register total that could let the deduction exceed the thing it
is subtracting from. A project with no attributable open risk keeps its whole value at risk and is
de-duplicated against nothing — absence of a recorded cause is not evidence of a shared one.

### D-2 (b) — option **(b2)**: each project is de-duplicated against its **dominant** cause

Every project is assigned to the cause carrying its largest attribution, so it appears in exactly one
group. This is the option that survives the measured reality: **81 of 91 projects carry more than one
cause key**, and (b1) would discount such a project once per group. (b2) is also the version an
executive can be told in one sentence — *"where several projects share their biggest root cause, that
cause is counted once, at its largest single exposure."*

**The result is provably non-negative.** Each project contributes its attribution to exactly one
group, that attribution is at most its own value at risk, and each group removes at most its own
total. A property test asserts it, including on a hostile input of twenty identical projects sharing
one cause — which collapses to exactly one of them.

### Measured effect on the demo portfolio

| | |
| --- | --- |
| `Σ MET-FIN-019` (gross) | **$89.19M** |
| Shared-cause deduction | **$38.93M** |
| `MET-PORT-003` | **$50.26M** |
| Shared-cause groups | 5, covering all 75 fixed-bid projects |

**`REQ-PORT-003` is met**, and the Phase 7 gate item it blocked is closed. The KPI now carries
`MET-PORT-003` because that is the formula that runs, and its evidence shows the gross sum, the
number of groups and the amount removed, so the reduction is auditable rather than asserted.

---

## The holding position, retained as the record

*The text below is what this ADR said while C-20 was open. It is no longer the decision.*

**Do not implement a guess. Ship the honest sum, labelled as a sum.**

1. The Portfolio Command Center's GM value-at-risk KPI is `Σ MET-FIN-019` and carries the metric id
   **`MET-FIN-019`**, not `MET-PORT-003`. It is not labelled with a metric whose formula did not
   run.
2. **`REQ-PORT-003` is NOT met.** The consequence is stated rather than absorbed: where a cause is
   shared, the plain sum **overstates** portfolio exposure. The direction of the error is known even
   though its size is not, and overstatement is the safer direction for a risk figure — but it is
   still an error, and the closure report says so.
3. `MET-PORT-003` stays `Frozen` and stays **unimplemented**. It is not quietly redefined as "a sum
   of per-project figures", which is what the code comment in `aggregation.ts` previously implied —
   a Frozen metric made true by rewriting what it means is worse than one left unimplemented.
4. Recorded as **DR-048**, owning phase 9 (Margin Intelligence), gate `PHASE_9_BLOCKER`.

## What acceptance must decide

**(a) The attribution rule.** How much of a project's `MET-FIN-019` is attributable to a given cause?
The recommendation is *probability-weighted cost impact of the open and mitigating risks carrying
that cause, scaled so the attributions sum to the project's VaR* — it uses facts already in the risk
model (`RiskRow.probability`, `RiskRow.costImpact`, `RiskRow.riskCauseKey`) and needs no new data.

**(b) The multi-cause rule.** Either:

- **(b1)** de-duplicate per cause and cap the total subtraction at each project's own VaR, so no
  project can be discounted below zero; or
- **(b2)** assign each project to its **dominant** cause — the one with the largest attribution —
  for de-duplication purposes, so each project appears in exactly one group.

(b2) is simpler to explain to an executive and cannot produce a negative total. (b1) is more faithful
to the intent that *every* shared cause be counted once. This ADR does not choose between them,
because choosing is the acceptance decision.

## Consequences

**Positive**

- No fabricated number reaches an executive surface, and no Frozen metric is silently redefined.
- The gap is now sized rather than suspected: the distribution above tells Phase 9 exactly how often
  the multi-cause case arises, which is the fact that makes (b1) versus (b2) a real decision.
- `REQ-PORT-003` fails visibly, in the closure report, rather than passing on a substituted
  requirement.

**Negative**

- **Phase 7 cannot claim `REQ-PORT-003`.** The Command Center is otherwise complete; this one
  requirement is not met, and the phase gate must say so.
- The portfolio GM value-at-risk figure ($89.19M on the demo portfolio) overstates true exposure by
  an unquantified amount. Anyone reconciling a future Margin Intelligence figure against it will find
  a discrepancy, which is why the KPI is labelled `MET-FIN-019` and DR-048 names the direction.

**Neutral**

- No formula, weight, band edge or synthetic scenario changed. The generator content hash is
  unchanged.

## Alternatives considered

**Implement (a) + (b2) now and mark it provisional.** Rejected. The metric is `Frozen`; implementing
a chosen reading of a frozen formula without an accepted ADR is precisely the silent-formula-change
the repository contract forbids, and "provisional" on an executive figure is a label nobody reads.

**Redefine `MET-PORT-003` as a plain sum and mark `REQ-PORT-003` met.** Rejected, and worth naming
because it is the tempting one: it would close the gate today by deleting the requirement's content.
Double counting would still be in the number; only the record of it would be gone.

**Relabel the KPI `MET-PORT-003` and note the de-duplication as "future work".** Rejected. The id is
the contract. A reader who looks up `MET-PORT-003` finds a de-duplication rule and will assume it
ran.

## Rollback

Additive and confined: one new file in `portfolio`, one field on `CommandCenterProject`, and the
KPI's metric id. Rolling back means relabelling the KPI `MET-FIN-019` and dropping the de-duplication
call — the plain sum is still computed and still returned by `aggregate()`, which was never changed.
No data model change and no stored state.
