# ADR-0030 — Trajectory signals observe movement, not running totals

**Status:** Accepted · **Date:** 2026-09-02 · **Supersedes:** nothing · **Amends:** TRAJECTORY-v1 signal construction

## Context

Two of the six trajectory signals observed cumulative running totals:

- `CONTINGENCY_CONSUMPTION` accumulated every drawdown to date.
- `SCOPE_EXPOSURE_TREND` accumulated every unrecovered pending change to date.

A cumulative series is monotone by construction. Its slope can only ever be adverse or flat, never
improving — a project that had entirely stopped drawing contingency still reported
`CONTINGENCY_CONSUMPTION` as deteriorating, because the total it had already drawn could not fall.

Two consequences ran through the whole portfolio, and neither was visible from the metric values:

1. **`IMPROVING` was unreachable.** `evaluateTrajectory` reports IMPROVING only when a majority of
   measurable signals are improving and none is materially adverse. With two signals permanently
   adverse, no project could satisfy either half. The portfolio contained zero improving projects
   and the product could not demonstrate recovery at all.

2. **Rapid deterioration was systematically over-reported.** `rapidConfluenceThreshold` is 3. Two
   phantom adverse signals meant any project with a *single* genuine problem was classified
   `RAPIDLY_DETERIORATING`, and `projectOutlook` then degraded it a full band per horizon instead of
   half. Forward outlooks across the portfolio were one band too pessimistic.

## Decision

Trajectory signals observe **movement per period**. The cumulative business fact is preserved
unchanged and still drives its own metric and panel:

| Signal | Observes now | Cumulative fact retained by |
| --- | --- | --- |
| `CONTINGENCY_CONSUMPTION` | the draw in each period | `MET-FIN-035` contingency consumed %, unchanged |
| `SCOPE_EXPOSURE_TREND` | exposure arriving in each period | `MET-COM-009` exposure level, unchanged |

No threshold, weight, band edge, override or RAG rule changes. `higherIsWorse` is unchanged for
both: a larger draw *this period* is still worse.

## Consequences

- Recovery becomes observable. A project that stops consuming its buffer, or stops taking on
  unrecovered scope, now shows a falling series — which is what the signal names claim to measure.
- Confluence counts real agreement between signals. Scenarios B and LR are reported
  `DETERIORATING` rather than `RAPIDLY_DETERIORATING`; both retain their governed contracts, and LR
  remains System Green-at-Risk with an adverse 60-day outlook and an open intervention window.
- Golden expectations that encoded the inflated tier are corrected in place, with the reason
  recorded beside them.

## Rejected alternatives

- **Lower the confluence threshold or relax the IMPROVING rule.** That manufactures the states we
  want rather than measuring them, and the directive forbids weakening trajectory requirements.
- **Leave the cumulative series and add a separate delta signal.** Doubles the weight of two
  dimensions in every confluence count.
