# PHASE_HANDOFF.md

**Current state:** Phase 4 complete — **PASS WITH DEBT** — Phase 5 not started
**Last updated:** 2026-08-29
**Updated by:** Phase 4, core economics / health / trajectory / recovery engines

> **Phase 4 gate: PASS WITH DEBT.**
>
> Ten engines exist and compute. 351 tests pass, 0 fail, 0 skipped. The eight curated scenarios
> reproduce their Phase 3 hand-derived figures exactly, from a separately written implementation.
>
> **Four conflicts were raised, not resolved** (C-7, C-8, C-9, C-10 — ADR-0015, `Proposed`). Fifteen
> new metrics are `Draft` because of them. One requested service — Executive Intervention Priority —
> **cannot be built**: MC-5 leaves "intervenability" undefined, so `rankAsMetPort007()` throws rather
> than returning a plausible substitute.
>
> **`TEST_STRATEGY.md` §8 gates UI work on the golden suite. It passes, so Phase 6+ may proceed.**
> Read §0.6 first: the product's flagship rule does not currently fire on its own reference scenario,
> and whether that is correct is an open question (C-10), not a bug to quietly fix.

> This file is rewritten at the end of every phase. It is the first thing the next phase reads after
> the four source-of-truth documents. It records what *is*, not what is hoped.
> The Phase 3 handoff is archived at `docs/handoff/PHASE-3-HANDOFF.md`.

---

## 0. Phase 4 report

### 0.1 What was built

| Engine | Location | Metrics | State |
| --- | --- | --- | --- |
| **ProjectEconomicsEngine** | `src/contexts/financial/internal/economics-engine.ts` | MET-FIN-001…038, MET-RSK-001/008, MET-COM-010, MET-DEL-001…008 | Implemented |
| **HealthAssessmentEngine** | `src/contexts/health/internal/health-engine.ts` | MET-HLTH-011/012/013/030, MET-HLTH-020…024 | Implemented; model is **Draft** (C-7) |
| **RuleEngine + hard overrides** | `src/contexts/rules/internal/engine.ts`, `override-rules.ts` | 8 hard overrides, 3 elevations | Implemented |
| **TrajectoryEngine + forward outlook** | `src/contexts/forecast/internal/trajectory-engine.ts` | MET-FCST-020/021/022 | Implemented; **Draft** |
| **GreenAtRiskService** | `src/contexts/forecast/internal/green-at-risk.ts` | MET-FCST-025/026 | Implemented; **Draft**; see C-10 |
| **DataConfidenceService** | `src/contexts/data-quality/internal/confidence-engine.ts` | MET-DQ-001…005, 008 | Implemented |
| **ForecastConfidenceService** | same file | MET-DQ-007 (frozen formula), MET-DQ-009 (profile) | Implemented; MET-DQ-009 **Draft** (C-9) |
| **RecoveryEconomicsEngine** | `src/contexts/recovery/internal/recovery-economics.ts` | MET-REC-001/002/003 | Implemented; **Draft** |
| **Portfolio aggregation** | `src/contexts/portfolio/internal/aggregation.ts` | MET-PORT-001/002/003 | Implemented |
| **ExecutiveInterventionPriority** | `src/contexts/portfolio/internal/intervention-priority.ts` | MET-PORT-007 | **BLOCKED — throws** (C-8 / MC-5) |
| **MetricCalculationService** | `src/app/metrics/metric-calculation-service.ts` | orchestration | Implemented |

Supporting platform work:

| Module | Why it exists |
| --- | --- |
| `src/platform/decimal/quantity.ts` | A decimal-safe non-money quantity API, so the engines compute scores and slopes without importing `decimal.js` into `contexts` (ARCH-006) or coercing through `Number` (G-FLOAT) |
| `src/platform/explainability/index.ts` | `explain()` builds the evidence-carrying explanation object and **throws** if a firing rule cites no record. It caught four real defects this phase |

### 0.2 Numbers

| | |
| --- | --- |
| Metrics in the registry | **153** (was 138) — 135 Frozen, 18 Draft |
| New Phase 4 metrics | 15, every one Draft and traceable to a named conflict |
| Source files under the architecture gate | 62 · **0 violations** |
| Tests | **351 passed, 0 failed, 0 skipped** (was 289) |
| New test files | `tests/golden/phase4-engines.test.ts` (36), `tests/unit/contexts/{confidence-engine,intervention-priority,aggregation}.test.ts` (26) |
| Rule sets | 8 — `HEALTH-v1`, **`HEALTH-v2`**, `TRAJECTORY-v1`, **`RECOVERY-v1`**, `DQ-v1`, `EAC-v1`, `VAR-v1`, `PRIORITY-v1`, `RECOGNITION-v1` |
| Open calibration parameters | 46, each named with a register item and an owner |

### 0.3 The acceptance gate

`npm run assess:curated` writes `docs/PHASE-4-CURATED-ASSESSMENT.md`: for each of the eight curated
scenarios, the full economics table with metric IDs, the health assessment with every rule that
fired, the trajectory and 30/60/90-day outlook, and the Green-at-Risk determination. Deterministic —
same seed, same rule versions, same bytes.

The economics reproduce the Phase 3 brief figures **exactly**: sold GM 24.00 / 28.00 / 22.00 / 26.00
/ 24.00 / 25.00 / 24.00 / 24.00%; forecast GM 22.50 / 22.90 / 16.00 / 19.50 / 15.83 / 19.44 / 8.67 /
3.00%; F's performance-implied EAC 3,461,538.46 and optimism gap 561,538.46; H's incremental risk
exposure 420,000.00 and risk-adjusted GM −4.00%.

That is three independent implementations agreeing with one hand calculation: the Phase 3 brief, the
Phase 3 validator oracle, and the Phase 4 engine.

### 0.4 What was deliberately not done

1. **No UI.** `TEST_STRATEGY.md` §8 gates it on the golden suite; the suite passes, so Phase 6 may
   start, but nothing was built ahead of the phase sequence.
2. **No persistence.** Assessments are computed on demand and never stored (**DR-022**).
3. **No authorization.** `assessProject()` computes over whatever it is handed. The enforcement point
   is Phase 5.
4. **No intervention ranking.** See §0.5.
5. **No margin bridge (MET-FIN-018).** Scoped to Phase 9 by `PRODUCT_SPEC.md`; recorded as **DR-020**
   because it carries AC-4, the most fragile credibility claim in the product.

### 0.5 The one thing that could not be built

`MET-PORT-007` Intervention Priority Rank orders by `MET-FIN-019 × MET-FCST-010 × intervenability`.
**MC-5 leaves intervenability undefined** — not a threshold awaiting a number, a concept nobody has
agreed how to represent.

What shipped instead: `orderByExposure()` computes the two factors that exist, stamps
`isInterventionPriority: false` and `blockedBy: 'MC-5'`, and carries a caveat saying that a project
high in the list may be one nothing can be done about. Projects missing either factor are returned
separately rather than sorted to the bottom — an unmeasured project is not a safe one.

`rankAsMetPort007()` throws. **AC-1 depends on this metric, so Phase 7 cannot ship until MC-5 is
answered**, and the throw is what will stop it.

### 0.6 Read this before Phase 5 — CONFLICT C-10

Curated scenario **B** is the Green-at-Risk reference case. In the acceptance report it comes back
**not Green-at-Risk**.

`MET-FCST-025` reads "Green" as `MET-HLTH-011` System-Assessed RAG, and under `HEALTH-v2`'s synthetic
band edges B already assesses **AMBER**. Its Reported RAG is GREEN, its margin has eroded 5.10
points, and its trajectory is DETERIORATING. On the *Reported* reading it is the archetypal case the
product exists for; on the *System-Assessed* reading it is an already-detected problem and
Green-at-Risk correctly declines to claim a discovery.

`PRODUCT_SPEC.md` §1.1 does not say which Green, and §3.3 insists the three RAG values stay separate.
Choosing here would resolve an open question by inference, so the conservative reading stands, three
regression tests pin it, and **ADR-0015 D-4 asks for a decision.**

The divergence is not lost either way: MET-HLTH-030 reports B as **+1 REPORTED_OPTIMISTIC**, which
`PRODUCT_SPEC.md` §3.3 calls the most valuable signal in the product.

### 0.7 Defects the gates caught

Eight, listed in `docs/traceability/PHASE-4-TRACEABILITY.md` §4. Three worth repeating:

- The architecture gate caught `decimal.js` leaking into three context engines and `Number()`
  coercion of health scores. Fixed by building the `Quantity` API, not by widening the boundary.
- `explain()` threw on **eight** rules across three engines that fired while citing no evidence.
  Every one is now required to carry its records, including findings about *absence* — which cite the
  record that establishes the expectation, since they cannot cite the record that is missing.
- The composite-banding explanation rendered `66.40 ≥ 70` beside a rule that **did** fire: a false
  statement printed next to a firing, in the one artifact an executive is meant to be able to check.

---

## 1. What Phase 5 consumes

| Input | Where |
| --- | --- |
| Computation entry point | `src/app/metrics/metric-calculation-service.ts` → `assessProject()` |
| Engine public surfaces | `@contexts/{financial,health,forecast,data-quality,recovery,portfolio,rules}` |
| Calibration | `RULE_SETS` and `HEALTH_MODEL_VERSIONS` in `src/contexts/rules/internal/rule-sets.ts` |
| Reference output to authorise against | `docs/PHASE-4-CURATED-ASSESSMENT.md` |
| Security contract | `SECURITY_MODEL.md`, ADR-0005, `src/app/authorization/enforcement.ts` |
| Persistence model | `migrations/0001`…`0008`, verified against real PostgreSQL (DR-012 closed) |

## 2. What Phase 5 must NOT assume

1. **That any threshold is approved.** Every band edge, weight and slope threshold in the repository
   is a synthetic calibration candidate. A synthetic distribution tests behaviour; it does not
   establish production policy.
2. **That `HEALTH-v2` is the health model.** It is `Draft` under C-7. The Frozen six-dimension model
   still exists and is still blocked on MC-2.
3. **That an intervention ranking exists.** It does not, and the function that would produce it
   throws.
4. **That anything is persisted.** DR-022.
5. **That authorization exists anywhere in the engine code.** It does not, by design. Building the
   enforcement point — and the negative-test matrix in `tests/authz` that `TEST_STRATEGY.md` §4
   requires — is Phase 5's whole job.
6. **That `MET-FIN-015` or `MET-FIN-018` are available.** DR-019 and DR-020.

## 3. Debt register (open)

| ID | Item | Target phase |
| --- | --- | --- |
| DR-017 | Only 2 of 56 tables carry `gldi_app` grants | 5 |
| DR-018 | A 60-day-stale domain can sit behind a HIGH data-confidence label | 6 |
| DR-019 | `MET-FIN-015` Gross Margin — Actual to Date not computed | 5 |
| DR-020 | `MET-FIN-018` margin bridge not implemented (carries AC-4) | 9 |
| DR-021 | The acceptance-report adapter builds one trajectory signal series, so confluence cannot fire there | 7 |
| DR-022 | No persistence for any Phase 4 output | 5 |

## 4. Open questions (all, restated)

| ID | Question | Blocks |
| --- | --- | --- |
| MC-2 / OQ-4 | Six health dimension weights | `MET-HLTH-001…006`, `MET-HLTH-010` |
| MC-3 | `HEALTH-v1` band edges and critical-breach triggers | The Frozen health model |
| MC-5 | What "intervenability" means | `MET-PORT-007`, **AC-1, Phase 7** |
| MC-6 | Deterioration threshold calibration | Partially open — inherits MC-2/MC-3 |
| MC-8 | What a "scope unit" is | `MET-DEL-012`, `MET-QUA-002` |
| DQ-4 | Whether `recovery` survives as a context | Decided after Phase 10 |
| C-7 | Four executive health dimensions or six? | Which model drives `MET-HLTH-011` — **ADR-0015 D-1** |
| C-9 | Does `MET-DQ-009` supersede `MET-DQ-007`? | **ADR-0015 D-3** |
| C-10 | Which "Green" does Green-at-Risk mean? | Whether the reference scenario fires the flagship rule — **ADR-0015 D-4** |

## 5. Commands

```bash
npm ci
npm run verify           # typecheck + architecture + schema + lint + 351 tests + data validation
npm run assess:curated   # regenerates docs/PHASE-4-CURATED-ASSESSMENT.md
npm run catalog:generate # regenerates METRIC_CATALOG.md from the registry
npm run db:verify        # 80 real-PostgreSQL checks (needs the Docker container)
```
