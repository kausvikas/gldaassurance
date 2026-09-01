# Deferred architectural decisions

**DEMO — SYNTHETIC DATA** · Phase 1

Recorded so a later phase does not decide them by accident. `CLAUDE.md` invariant: open questions are
escalated, not resolved by inference.

## 1. Carried forward from Phase 0 (`ARCHITECTURE_DECISIONS.md` §6)

| # | Question | Decide by | Phase 1 effect |
| --- | --- | --- | --- |
| DQ-1 | Read model vs compute-on-read for portfolio rollups | 4 | Aggregation is a pure function over supplied inputs, so either answer is cheap |
| DQ-2 | Health recompute: event-driven or batch on snapshot | 4 | `(project, week, ruleVersion)` is a pure function, so either trigger produces the same result |
| DQ-3 | Assistant retrieval strategy | 11 | Constrained: must run under caller authorization, must not be a second data path |
| DQ-4 | Does `Recovery` survive as a context? | 10 | Context exists with a public surface; its removal would be an ADR |
| DQ-5 | Extraction path from monolith to services | Post-POC | Four seams identified in `C4-DIAGRAMS.md` §2.2; none implemented |

## 2. Opened by Phase 1

| # | Question | Decide by | Why not now |
| --- | --- | --- | --- |
| DQ-6 | Pagination and result-cap strategy for portfolio collections | 7 | Depends on the Command Center's actual shape; capping before the surface exists would guess the wrong limit |
| DQ-7 | Cache tier for recompute results, if any | Post-POC | ADR-0001 forbids one in the POC; the cache key shape `(project, week, ruleVersion)` is already correct |
| DQ-8 | Telemetry backend and vendor | Post-POC | ADR-0009 fixes the *concepts*; the vendor is an operational choice with no architectural consequence |
| DQ-9 | Whether the BFF and the domain deploy separately | Post-POC | One team, one cadence; premature |
| DQ-10 | Read-replica routing for read paths | Post-POC | No load justifies it; contracts already permit it |

## 3. Open questions Phase 1 was careful **not** to answer

These belong to other phases. Phase 1 shaped the code so that answering them later does not require
rework, and stopped there.

| ID | Question | Owner phase | How Phase 1 avoided pre-empting it |
| --- | --- | --- | --- |
| OQ-1 | Reporting currency and FX source | 2 | `Money` refuses mixed-currency arithmetic rather than assuming a reporting currency |
| OQ-2 | Revenue recognition method for fixed-bid | 2 | `ProjectEconomicsService` declares the signature; MET-FIN-006/009 are marked BLOCKED |
| OQ-3 | Are cost rates visible to Delivery Managers? | 5 | `FieldClassification` is a type; the matrix is not encoded anywhere yet |
| OQ-4 | Health dimension weighting owner and values | 2 | Weights are `RuleParameter` data in `rules`, not constants |
| OQ-5 | Fiscal calendar | 2 | **Period arithmetic is deliberately `STUBBED`** in `platform/time` with the reason in the code |
| MC-3…MC-6 | `HEALTH-v1`, `VAR-v1`, `PRIORITY-v1`, deterioration threshold | 2–3 | `RuleSet` carries parameters as data; no threshold value appears in any source file |
| MC-8 | Scope-unit definition | 2 | `delivery` and `quality` surfaces note the block; no unit is assumed |

The `platform/time` stub is worth singling out. Implementing `weeksBetween` and `periodsIn` would
have taken twenty minutes and would have silently committed the product to calendar quarters, which
is OQ-5's assumed-but-unconfirmed answer. The types exist so Phase 2 can add the arithmetic without
changing a signature; the arithmetic does not, and the code says why.
