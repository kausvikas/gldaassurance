# ADR-0039 — Portfolio contract value is contractual revenue, not the as-sold baseline

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `MET-PORT-001`, `scripts/design/executive-facts.ts`, the frozen Phase 12 headline figure
- **Supersedes:** nothing. **Corrects:** the published portfolio contract value

---

## Context

Phase 13's cross-surface reconciliation found the application layer and the built site reporting
**different numbers under the same label**:

| Surface | Figure | What it summed |
| --- | --- | --- |
| Command Center KPI (`MET-PORT-001`) | **$453.47M** | `MET-FIN-002` contractual revenue |
| Built static site, "Contract value" | **$451.28M** | `spec.contractValue`, the as-sold baseline |

`METRIC_CATALOG.md` defines `MET-PORT-001` as the sum of `MET-FIN-002` — *Contractual Revenue
(Current Contractual)* — which is the as-sold baseline **plus executed change requests**. The KPI's
own rendered evidence line says so verbatim: *"Sum of contractual revenue (MET-FIN-002)"*.

The site was summing the as-sold baseline. The $2.19M difference is executed change requests: work
the customer has signed for and the supplier is contractually owed, omitted from the headline figure
on the landing page.

**This is the Phase 12 portfolio-margin defect, repeating.** That one was a browser computing a
contract-value-weighted mean of project percentages where the catalogue specifies an aggregate. This
one is a browser summing a different component than the catalogue names. Both are the same failure:
a governed metric re-implemented at the presentation layer from whichever field was nearest.

It is worth recording how narrowly it survived. The **per-project** figure was already correct —
`tcvDisplay` carried the row's formatted `MET-FIN-002` — while the **numeric** field beside it,
which only the aggregate used, carried the as-sold baseline. Every project page showed the right
number and the portfolio total showed the wrong one, which is precisely the shape that makes a
defect like this invisible to a reader checking a few rows.

## Decision

1. **`MET-PORT-001` is the sum of `MET-FIN-002`, as the catalogue defines it.** The published
   portfolio contract value becomes **$453.47M**.
2. `ExecutiveFact.tcv` is sourced from the governed economics (`contractualRevenue`), not from the
   generator's contract specification, so the numeric projection and the display string come from
   one place.
3. **The catalogue wins.** `CLAUDE.md`'s precedence order puts `METRIC_CATALOG.md` above existing
   code for anything numeric, and this is resolved by that rule rather than by preferring the figure
   already published.
4. The Phase 12 baseline documents are corrected in place with the reason recorded, rather than the
   figure being quietly changed.

## Rationale

- **The as-sold baseline is a real and useful figure — under its own name.** It is what the
  portfolio was sold for. It is not what is currently under contract, and "Contract value" as a
  headline means the latter to every reader who has ever signed one.
- **Executed change requests are contracted revenue.** Omitting them understates the portfolio and,
  more importantly, understates it *inconsistently*: the sold-margin denominator on the same page
  already used contractual revenue, so the page was internally divided about what it was measuring.
- **Correcting downward would have been the tempting direction.** Making the KPI match the published
  site would have preserved a frozen number and broken the catalogue. The catalogue is the authority
  precisely so that the published number is not.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Change `MET-PORT-001` to mean the as-sold baseline** | Would make the KPI match the site by redefining a Frozen metric to fit an implementation. That is the inversion the precedence order exists to prevent. |
| **Show both figures** | Defensible on a detail surface and wrong as a headline: two contract values on a landing page is a question, not an answer. The as-sold position remains available through sold margin and the margin bridge. |
| **Leave it; the difference is 0.5%** | The size is not the point. Two surfaces disagreeing about a governed metric is a P0 whatever the magnitude, and a reconciliation that tolerates a small gap has stopped being one. |

## Consequences

**Positive** — the site, the application KPI, the Assistant and the metric catalogue now agree on one
number. Executed change requests are visible in the headline.

**Negative / accepted costs** — a frozen published figure changed. Anyone holding the earlier
$451.28M has a number that is now superseded, and the baseline documents say so with the reason.

**Neutral** — no formula changed. The generator, the engines and the distributions are untouched; a
presentation projection was reading the wrong governed field.

## Impact

| Dimension | Impact |
| --- | --- |
| Formulas or metrics | **None changed.** `MET-PORT-001` is applied as written for the first time on this surface. |
| Synthetic data | None. No generated value moved. |
| Requirements affected | REQ-PORT-001 |
| Tests that must change | The golden-truth expectation and the baseline documents. |

## Rollback path

Revert `ExecutiveFact.tcv` to the specification field. That restores the published $451.28M and
restores the disagreement, so rollback is only appropriate if the catalogue's definition is itself
changed by a later ADR.

## Verification

- `docs/ASSISTANT_GOLDEN_TRUTH_RESULTS.md` compares the Assistant's aggregate against the frozen
  baseline; the expectation is $453.47M and it is generated from the running system.
- `tests/integration/executive-facts-reconciliation.test.ts` asserts the embedded facts agree with
  the engines.
- The Command Center KPI and the Assistant now read the same components through the same
  `aggregate()` function, so a future divergence requires two changes rather than one.
