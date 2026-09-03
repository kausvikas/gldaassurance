# Final synthetic baseline — provenance record

Frozen at commit `3aca00c` and its descendants. Recorded for provenance, not to match an earlier
build. No contract value, threshold, weight, band edge or rule was edited to reach these figures.

## The accepted baseline

| Measure | Value |
| --- | --- |
| Fixed-bid projects | 75 (of 91 authorised) |
| Contract value | **$451.28M** |
| Sold gross margin, TCV-weighted | 25.6% |
| Forecast gross margin, TCV-weighted | 20.2% |
| Gross margin at risk | $35.95M |
| Uncommercialised scope exposure | $3.07M |
| System RAG | 38 Green · 22 Amber · 15 Red |
| Reported RAG | 41 Green · 27 Amber · 7 Red |
| 30-day outlook | 38 Green · 20 Amber · 17 Red |
| 60-day outlook | 28 Green · 19 Amber · 28 Red |
| Trajectory | 4 improving · 37 stable · 30 deteriorating · 4 deteriorating fast |
| Reported Green — evidence disagrees | 9 |
| System Green — emerging risk | 10 |
| Overlap between the two | **0** (disjoint by construction) |
| Recovering | 4 |
| Manifest content hash | `dc2ef99b3cc2d13acf76bff698619feaea4ff0c1b8575b5cd039f78613d7f596` |
| Records | 91 projects |

## Why contract value moved from $453.64M to $451.28M

A −$2.36M change, 0.5% of the portfolio. **No contract value was edited.**

Nine fixed-bid projects carry a curated scenario, and a curated scenario replaces the sampled
contract value of the slot it occupies with its own fixed figure — those nine total $39.40M; the
remaining 66 ordinary projects total $411.88M. Curated scenarios claim the first available fixed-bid
slot in their vertical, so when the adverse archetype minimums were rebalanced (39 of 91 down to 25,
documented in `SYNTHETIC_ENTERPRISE_PORTFOLIO_CONTRACT.md` §2), the scenarios landed on a different
set of slots and therefore replaced a different set of sampled values.

The difference is a consequence of the archetype rebalance, which was made for believability and is
recorded in its own commit. It is not a data edit and was not chased toward any figure.

## What the distributions are, and are not

These are outcomes, not targets. The reasonableness envelope in the portfolio contract is a
diagnostic applied after generation; no code reads it. Where the population sits outside a range,
the disposition is to investigate the generator, never to move a threshold.

Against that envelope the current population sits inside it for Amber (22 against 15–22), improving
(4 against ≥4), emerging risk (10 against 3–8, marginally above) and management disagreement (9
against 4–10). Green at 38 is below the 45–55 range and Red at 15 above 5–10 — both traceable to
adverse archetypes still carrying 29 of 75 fixed-bid slots. That is a believability observation
about the portfolio's construction, not a defect in any governed rule, and it is recorded here
rather than corrected by tuning.
