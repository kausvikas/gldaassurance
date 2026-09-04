# Executive POC — frozen release baseline

> **Corrected by ADR-0039 (2026-09-03).** The portfolio contract value recorded below as
> **$451.28M** was the sum of the as-sold baseline. `MET-PORT-001` is the sum of `MET-FIN-002`
> contractual revenue — the as-sold baseline **plus executed change requests** — which is
> **$453.47M**, and is what the application's own KPI had been reporting all along. The two surfaces
> disagreed under one label; the catalogue won. Every other figure in this document is unchanged.


The reference baseline for executive demonstration. Future feature work happens after this freeze,
not by silently mutating it.

| | |
| --- | --- |
| Live URL | https://gldaassurance.web.app |
| Commit | see `git log` at freeze; branch `synthetic-portfolio-realism` |
| Synthetic manifest hash | `dc2ef99b3cc2d13acf76bff698619feaea4ff0c1b8575b5cd039f78613d7f596` |
| Records | 91 projects · 75 fixed-bid in the authorised population |
| Tests | 43 files · 1433 passing · 0 failures |

## Portfolio

| Measure | Value |
| --- | --- |
| Contract value | $451.28M |
| Sold margin (portfolio aggregate) | 25.46% |
| Forecast margin (portfolio aggregate) | 20.21% |
| Margin at risk (Σ project exposure) | $35.95M |
| Uncommercialised scope exposure | $3.07M |
| System RAG | 38 Green · 22 Amber · 15 Red |
| Reported RAG | 41 Green · 27 Amber · 7 Red |
| 30-day outlook | 38 · 20 · 17 |
| 60-day outlook | 28 · 19 · 28 |
| Trajectory | 4 improving · 37 stable · 30 deteriorating · 4 deteriorating fast |
| Reported Green — evidence disagrees | 9 |
| System Green — emerging risk | 10 |
| Overlap between the two | 0, disjoint by construction |
| Recovering | 4 |

**What Changed:** 73 projects with governed prior-period economics · −$3.02M forecast margin
movement · 39 worsened, 34 improved · 34 cost-at-completion revisions · 20 reported-status changes
(12 downgrades, 8 upgrades) · 2 contract-loss conditions cleared.

## Financial aggregation, as verified

Portfolio margin follows `MET-PORT-002`: `(Σ MET-FIN-010 − Σ MET-FIN-008) / Σ MET-FIN-010` —
aggregate forecast revenue less aggregate cost at completion, over aggregate forecast revenue.
**Not** a mean of project margins, weighted or otherwise. Stated on the surface.

Margin at risk is `Σ MET-FIN-019`, the sum of each project's exposure. It is deliberately **not**
`MET-PORT-003`, whose canonical formula subtracts shared-cause duplication. The surface says so:
the figure does not net off risks sharing a root cause.

## Accepted POC limitations

1. **ETC optimism and dependency blockage are not systemic drivers.** No authoritative driver fact
   exists for either. Six governed drivers are present and drill through. Future extension.
2. **What Changed covers financial and reported-status history only.** The portfolio stores no
   per-period system band, milestone-forecast snapshot or acceptance state, so those classes cannot
   be reconstructed without re-running the engines at an earlier as-of. Named on the surface.
3. **The assistant is a governed response set, not a live query loop.** The certified read-only
   architecture is preserved; the public build presents composed answers rather than accepting
   free-text input.
4. **Static demonstration.** Production identity, authentication, authorization and enterprise
   integrations are not enabled, and static access does not exercise them. Disclosed in the footer
   of every route.
5. **Distribution sits outside part of the believability envelope.** 38 Green against a 45–55
   diagnostic range and 15 Red against 5–10, traceable to adverse archetypes holding 29 of 75
   fixed-bid slots. Recorded in `FINAL_SYNTHETIC_BASELINE.md` rather than corrected by tuning.
