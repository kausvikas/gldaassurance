# Requirement Traceability Report — Phase 4: Core Economics, Health, Trajectory & Recovery Engines

- **Phase:** 4
- **Date:** 2026-08-29
- **Author:** Delivery Intelligence engineering
- **Requirements in scope:** REQ-FIN-001, 002, 003, 005, 006, 007, 008, 009; REQ-HLTH-001…006, 008;
  REQ-DQ-001; REQ-DATA-010 (continuing)
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md` v2.0.0, `SECURITY_MODEL.md`, `SYNTHETIC_DATA_SPEC.md` v2.1.0,
  `TEST_STRATEGY.md`, `DEFINITION_OF_DONE.md`, `PHASE_HANDOFF.md`, `docs/adr/ADR-0001`…`0014`

---

## 1. Requirement coverage

| REQ ID | Requirement (short) | State | Evidence (`file:line`) | Verification | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-FIN-001 | Decimal-safe money throughout; float money impossible by construction | IMPLEMENTED | `src/platform/decimal/money.ts`, `src/platform/decimal/quantity.ts` | unit + architecture | ✅ `tests/unit/platform/money.test.ts` (22), `money.type-safety.test.ts` (2), G-FLOAT gate | New `Quantity` API added so the engines compute decimal-safely **without** importing `decimal.js` into `contexts` (ARCH-006) |
| REQ-FIN-002 | Revenue recognition, cost-to-date, ETC, EAC per catalog | IMPLEMENTED | `src/contexts/financial/internal/economics-engine.ts:132` | golden | ✅ `tests/golden/phase4-engines.test.ts` §1 | Recognised revenue is an imported Finance fact, not computed here (OQ-2 closed, Phase 2) |
| REQ-FIN-003 | Margin for As-Sold, Current Contractual, Forecast, Actual-to-Date | IMPLEMENTED_WITH_DEBT | `economics-engine.ts` (`soldGmPercent`, `forecastGmPercent`, `riskAdjustedGmPercent`) | golden | ✅ 8/8 curated scenarios exact | **Actual-to-Date margin (MET-FIN-015) is not computed** — it needs recognised revenue per period, which is a Finance fact the engine input does not yet carry. **DR-019.** |
| REQ-FIN-005 | Unsecured upside reported separately, never in base forecast | IMPLEMENTED | `economics-engine.ts` (`forecastRevenue`, `unsecuredUpside`) | golden | ✅ `phase4-engines.test.ts` "never lets a pending change request reach base forecast revenue" | Asserted over all eight scenarios against an independently constructed executed-only total |
| REQ-FIN-006 | EVM measures (PV, EV, AC, CPI, SPI, VAC) computed and explainable | IMPLEMENTED | `economics-engine.ts` (`plannedValue`…`varianceAtCompletion`) | golden | ✅ `phase4-engines.test.ts` "computes the earned-value measures per MET-DEL-001…008" | NOT_COMPUTABLE when the progress claim is absent, rather than zero |
| REQ-FIN-007 | Value at Risk per project and aggregated without double counting | IMPLEMENTED | `economics-engine.ts` (`gmValueAtRisk`), `src/contexts/portfolio/internal/aggregation.ts:56` | golden + unit | ✅ `phase4-engines.test.ts`, `tests/unit/contexts/aggregation.test.ts` | Double counting is prevented at the project level (`riskProvisionedInEtc` returned explicitly) and the portfolio sum is of already-net figures |
| REQ-FIN-008 | All aggregations associative and order-independent (tested) | IMPLEMENTED | `src/contexts/portfolio/internal/aggregation.ts` | unit (property) | ✅ `aggregation.test.ts` — 4 seeds × 40 projects, forward/reverse/sorted | Also asserts weighted portfolio margin ≠ mean of project margins |
| REQ-FIN-009 | Single explicit rounding policy, presentation only | IMPLEMENTED | `src/platform/decimal/money.ts` (`toPresentationString`, `allocate`) | unit | ✅ `money.test.ts` | Unchanged from Phase 2; Phase 4 adds no new rounding |
| REQ-HLTH-001 | Composite health from weighted, versioned dimension scores | IMPLEMENTED_WITH_DEBT | `src/contexts/health/internal/health-engine.ts:164` | golden | ✅ `phase4-engines.test.ts` §2 | Computes against `HEALTH-v2`, which is **Draft** under CONFLICT C-7 (ADR-0015). The Frozen six-dimension model is unusable: MC-2 weights do not exist |
| REQ-HLTH-002 | Reported, System-Assessed and Override RAG stored and surfaced separately | IMPLEMENTED | `health-engine.ts` (`reportedRag`, `systemAssessedRag`, `override`, `effectiveRag`) | golden | ✅ "keeps Reported, System-Assessed and divergence as three separate values" | |
| REQ-HLTH-003 | Status divergence detected, quantified and ranked | IMPLEMENTED_WITH_DEBT | `health-engine.ts` (`StatusConflict`) | golden | ✅ scenario B: +1 REPORTED_OPTIMISTIC | Detected and quantified. **Ranking** across a portfolio is MET-PORT-005/007 and is blocked on MC-5 — see REQ below |
| REQ-HLTH-004 | Trajectory over history; deterioration detected before threshold breach | IMPLEMENTED_WITH_DEBT | `src/contexts/forecast/internal/trajectory-engine.ts:149` | golden | ✅ `phase4-engines.test.ts` §3 (6 tests) | Four states, multi-signal, policy-gated windows. **Draft** (MET-FCST-020, C-7). Deterioration-before-breach is demonstrated on scenario B, but see CONFLICT C-10 |
| REQ-HLTH-005 | Every health result carries rule version and per-dimension contribution | IMPLEMENTED | `health-engine.ts` (`DimensionScore.contribution`, `Explanation.ruleSetVersion`) | golden | ✅ "stamps every explanation with the rule set and catalog versions" | |
| REQ-HLTH-006 | Every rule firing yields a human-readable explanation citing inputs and thresholds | IMPLEMENTED | `src/platform/explainability/index.ts:110` | golden | ✅ "never lets an override fire without citing the evidence beneath it" | `explain()` **throws** if a firing rule cites no evidence. It caught four real defects during this phase (see §4) |
| REQ-HLTH-008 | Health scores never computed in the UI layer | IMPLEMENTED | `architecture/manifest.json` (layers), `architecture/ruleset.mjs` | architecture | ✅ `tests/integration/architecture.boundaries.test.ts` (41) | No UI exists yet; the boundary that will prevent it does, and is enforced |
| REQ-DQ-001 | Data confidence from completeness, freshness, consistency, source coverage | IMPLEMENTED | `src/contexts/data-quality/internal/confidence-engine.ts:100` | unit | ✅ `tests/unit/contexts/confidence-engine.test.ts` (12) | Validity (MET-DQ-008) added as a fifth component, Draft. Freshness is taken at the **worst** domain |
| REQ-DATA-010 | Lineage: every derived value records inputs, rule version, timestamp | IMPLEMENTED | `src/platform/explainability/index.ts`, `src/platform/provenance/index.ts` | golden | ✅ all Phase 4 explanations | |

### 1.1 Coverage summary

| State | Count |
| --- | --- |
| IMPLEMENTED | 12 |
| IMPLEMENTED_WITH_DEBT | 4 |
| MOCKED | 0 |
| STUBBED | 0 |
| DEFERRED | 0 |
| BLOCKED | 0 |
| NOT_STARTED | 0 |
| **Total in scope** | **16** |

**Not in Phase 4 scope but touched, and stated so it is not mistaken for delivered:**
`MET-PORT-007` Intervention Priority Rank remains **BLOCKED by MC-5**. An
`ExecutiveInterventionPriorityService` was requested; what shipped is `orderByExposure()`, which
computes two of the metric's three factors and labels itself as not being the metric.
`rankAsMetPort007()` throws.

---

## 2. Metric traceability

| Metric ID | Catalog version | Owner context | Implementation | Golden fixture | Fixture derived independently? | Rule version |
| --- | --- | --- | --- | --- | --- | --- |
| MET-FIN-001…038 (economics) | 2.0.0 | `financial` | `economics-engine.ts` | `phase4-engines.test.ts` §1 | **Yes** — Phase 3 brief figures restated as literals, hand-derived from catalog formulas | `EAC-v1`, `VAR-v1` |
| MET-DEL-001…008 (EVM) | 2.0.0 | `financial` (computed), `delivery` (owned) | `economics-engine.ts` | `phase4-engines.test.ts` §1 | **Yes** — recomputed in the test from budget × completion | — |
| MET-HLTH-011, 012, 013, 030 | 2.0.0 | `health` | `health-engine.ts` | `phase4-engines.test.ts` §2 | **Yes** — band arithmetic and divergence computed by hand | `HEALTH-v2` |
| MET-HLTH-020…024 | 2.0.0 (**Draft**) | `health` | `health-engine.ts` + `health-model.ts` | `phase4-engines.test.ts` §2 | Partial — the *mechanism* is asserted (renormalisation, NOT_COMPUTABLE); the *scores* are not pinned to hand values because the edges are unapproved calibration | `HEALTH-v2` |
| MET-FCST-020, 021, 022 | 2.0.0 (**Draft**) | `forecast` | `trajectory-engine.ts` | `phase4-engines.test.ts` §3 | **Yes** — slope over y=1…6 is exactly 1, checkable by hand | `TRAJECTORY-v1` |
| MET-FCST-025, 026 | 2.0.0 (**Draft**) | `forecast` | `green-at-risk.ts` | `phase4-engines.test.ts` §4 | **Yes** — each of the three conditions asserted independently | `TRAJECTORY-v1` |
| MET-DQ-001…005, 008 | 2.0.0 | `data-quality` | `confidence-engine.ts` | `confidence-engine.test.ts` | **Yes** — pooled share 95/110 computed by hand | `DQ-v1` |
| MET-DQ-007 | 2.0.0 | `data-quality` | `confidence-engine.ts` (`assessForecastConfidence`) | `confidence-engine.test.ts` | **Yes** | `DQ-v1` |
| MET-DQ-009 | 2.0.0 (**Draft**) | `data-quality` | `confidence-engine.ts` (`forecastReliabilityProfile`) | `confidence-engine.test.ts` | **Yes** | `DQ-v1` |
| MET-REC-001, 002, 003 | 2.0.0 (**Draft**) | `recovery` | `recovery-economics.ts` | `phase4-engines.test.ts` §5 | **Yes** — 1,000,000/950,000 with a 50,000 benefit gives exactly 10.00%, and 7.50% at confidence 0.5 | `RECOVERY-v1` |
| MET-PORT-001, 002, 003 | 2.0.0 | `portfolio` | `aggregation.ts` | `aggregation.test.ts` | **Yes** — the 50m@5% / 1m@40% case is worked in the test comment | — |
| MET-PORT-007 | 2.0.0 (**Draft**) | `portfolio` | `intervention-priority.ts` — **throws** | `intervention-priority.test.ts` | n/a | `PRIORITY-v1` |

> **Independence.** The economics fixtures are the strongest form available here: the expected values
> were hand-derived from the catalog formulas during Phase 3, were reproduced by the Phase 3
> validator's independent oracle (`scripts/generator/validate.ts`), and are now reproduced a third
> time by a separately written Phase 4 engine. Three implementations, one hand calculation.
>
> The MET-HLTH-02x row is honest about its limit: pinning a dimension *score* to a hand value would
> pin the unapproved edge values with it, and a later calibration change would then look like a
> regression. The mechanism is pinned; the calibration is not.

---

## 3. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | 120 | 120 | 0 | 0 |
| golden | 170 | 170 | 0 | 0 |
| integration | 61 | 61 | 0 | 0 |
| authz | 0 | 0 | 0 | 0 |
| architecture | 41 | 41 | 0 | 0 |
| a11y | 0 | 0 | 0 | 0 |
| **Total** | **351** | **351** | **0** | **0** |

Per file:

```
34  tests/golden/definition-recomputation.test.ts
20  tests/golden/edge-cases.test.ts
36  tests/golden/phase4-engines.test.ts          ← new
80  tests/golden/synthetic-portfolio.test.ts
41  tests/integration/architecture.boundaries.test.ts
 4  tests/integration/metric-catalog.test.ts
16  tests/integration/temporal-model.test.ts
 6  tests/unit/contexts/aggregation.test.ts       ← new
12  tests/unit/contexts/confidence-engine.test.ts ← new
 8  tests/unit/contexts/intervention-priority.test.ts ← new
 5  tests/unit/platform/config.test.ts
22  tests/unit/platform/money.test.ts
 2  tests/unit/platform/money.type-safety.test.ts
 8  tests/unit/platform/provenance.test.ts
17  tests/unit/platform/time.test.ts
40  tests/unit/rules/metric-registry.test.ts
```

**Failures:** none outstanding.

**Skipped tests:** none. No test in this repository is skipped.

Other gates: `npm run typecheck` clean · `check:architecture` 62 files, 0 violations ·
`check:schema` 8 migrations, 0 violations · `lint` 0 problems · `data:validate` 126,126 records,
0 errors. `db:verify` **not run this phase** — it requires the Docker PostgreSQL container and no
migration changed; DR-012 remains closed on its Phase 3 evidence.

---

## 4. Defects the gates caught during this phase

Recorded because they are the argument for the gates, not despite them.

| # | Found by | Defect | Disposition |
| --- | --- | --- | --- |
| 1 | `check:architecture` ARCH-006 | `decimal.js` imported directly by `rules`, `financial` and `health` engines | Fixed by adding `platform/decimal/quantity.ts` and converting all three. The boundary was not weakened |
| 2 | `check:architecture` ARCH-008 (G-FLOAT) | `Number(...)` coercion of scores in `health-model.ts` and `health-engine.ts` | Fixed — scores are `Quantity` strings end to end |
| 3 | `explain()` | `GAR-BAND`, `GAR-TRAJECTORY`, `GAR-WINDOW` fired citing no evidence | Fixed — `GreenAtRiskInput` now requires `bandEvidence`; trajectory rules cite the series |
| 4 | `explain()` | `REC-BASE`, `REC-RISK`, `REC-CREDIBILITY` fired citing no evidence | Fixed — `RecoveryEconomicsInput` now requires `baseEvidence` |
| 5 | `explain()` | `DQ-BAND` and `DQ-MISSING-DOMAINS` fired citing no evidence | Fixed — `DataConfidenceInput` requires `assessmentEvidence`, so a finding about **absence** cites the record that establishes the expectation |
| 6 | Report review | `BAND-COMPOSITE` rendered as `66.40 ≥ 70` on a rule that *did* fire — a false statement printed beside a firing | Fixed — comparison is `IN_BAND` with both floors named |
| 7 | `validateRegistry()` | 15 new Draft metrics gave no Type A reason and named no owner | Fixed — every one now names its conflict and owner |
| 8 | `metric-registry.test.ts` | New `REC` metric domain rejected by the ID scheme | `recovery` added to the whitelist deliberately; it is an existing bounded context |

---

## 5. Invariant compliance

| # | Invariant | Held? | Evidence / exception |
| --- | --- | --- | --- |
| 3 | No silent change to formulas, metrics, boundaries, security, brand, RAG, scenarios | **Yes** | Four conflicts (C-7, C-8, C-9, C-10) raised in ADR-0015; no Frozen formula edited. `MET-DQ-007` and `MET-HLTH-010` are byte-identical to Phase 2 |
| 5 | No false completion claims | **Yes** | `rankAsMetPort007()` throws rather than returning a substitute. REQ-FIN-003 is marked `IMPLEMENTED_WITH_DEBT` because MET-FIN-015 is genuinely absent |
| 6 | Decimal-safe, server-side financial computation | **Yes** | ARCH-006/G-FLOAT enforced; `decimal.js` confined to `platform/decimal`; no browser code exists |
| 7 | Server-side authorization only | **Yes (vacuous)** | No UI and no API surface yet. `assessProject()` computes and does not authorise; enforcement is at the use-case boundary in Phase 5 |
| 8 | L1/L2/L3 separation intact | **Yes** | New metrics classified: MET-FCST-020…026 and MET-REC-001…003 `L3_ASSESSED`; MET-HLTH-020…024 and MET-DQ-008 `L2_DERIVED`. `DERIVED_DEPENDS_ON_ASSESSMENT` passes |
| 9 | AI is not calculator or system of record | **Yes (vacuous)** | No assistant code exists. Every number in `docs/PHASE-4-CURATED-ASSESSMENT.md` comes from a `contexts/*` engine |
| 10 | Modular monolith with strict contexts | **Yes** | 62 source files, 0 violations. `recovery` does **not** import `financial`: base economics are passed in, ports-in style (ADR-0012) |
| 11 | `DEMO — SYNTHETIC DATA` labelling present | **Yes** | Header of the acceptance report; `npm run assess:curated` prints it; `synthetic: true` throughout the model |

---

## 6. Proposed deviations / ADRs

| ADR | Title | Status | Rationale | Impact | Rollback |
| --- | --- | --- | --- | --- | --- |
| [0015](../adr/ADR-0015-phase-4-engine-conflicts.md) | Phase 4 engine conflicts: executive health model, forecast reliability, and which "Green" | **Proposed** | Four Phase 4 requirements conflict with Frozen artifacts or open questions; each is registered in parallel rather than overwriting | 15 new Draft metrics; 138 → 153; `HEALTH-v2` and `RECOVERY-v1` rule sets added | Each of D-1…D-4 is independently reversible; nothing has been persisted |

---

## 7. Conflicts encountered

| Artifacts in conflict | Nature of conflict | Precedence rule applied | Resolution |
| --- | --- | --- | --- |
| **C-7** — Phase 4 direction vs `METRIC_CATALOG.md` `MET-HLTH-010` | Four executive dimensions vs six Frozen ones. Not reconcilable by reweighting: Risk and Resource disappear | METRIC_CATALOG (rank 2) outranks a phase instruction (not in the order) | Both registered. `MET-HLTH-020…024` + `HEALTH-v2` as **Draft**; the six-dimension family untouched and still blocked on MC-2. ADR-0015 D-1 |
| **C-8** — Phase 4 direction vs MC-5 | An intervention-priority service was requested; intervenability is undefined | Invariant 4: do not resolve an open question by inference | `rankAsMetPort007()` throws; `orderByExposure()` ships two of three factors, labelled. ADR-0015 D-2 |
| **C-9** — Phase 4 direction vs `MET-DQ-007` Frozen formula | Seven factors requested; three different ones are frozen | METRIC_CATALOG (rank 2) | `MET-DQ-007` implemented exactly as frozen; the seven factors registered separately as **Draft** `MET-DQ-009`, returned as a profile with no aggregate. ADR-0015 D-3 |
| **C-10** — `PRODUCT_SPEC.md` §1.1 vs §3.3 | "Green projects moving toward Amber/Red" — §3.3 requires three RAG values be kept separate and §1.1 does not say which one this means. Under System-Assessed, the flagship scenario B does not fire the flagship rule | Neither section outranks the other; the spec is silent | Conservative reading (System-Assessed) implemented and **pinned by three regression tests**, so it cannot change silently. Raised for decision. ADR-0015 D-4 |

---

## 8. Debt register delta

| ID | Item | State | Owner | Target phase | Risk if unaddressed |
| --- | --- | --- | --- | --- | --- |
| DR-017 | Only 2 of 56 tables carry `gldi_app` grants | DEFERRED | Platform | 5 | Grants are incomplete; a real runtime user would fail on 54 tables. Carried from DR-012 closure, unchanged |
| DR-018 | Data-confidence band floors let a 60-day-stale domain sit behind a HIGH label (score 80.00) | DEFERRED | Assurance | 6 | An executive reads "high confidence" over a two-month-old feed. Whether worst-domain staleness should cap the band is policy, not an engine decision. Pinned by test so the arithmetic is at least visible |
| DR-019 | `MET-FIN-015` Gross Margin — Actual to Date is not computed | DEFERRED | Finance + Delivery Intelligence | 5 | REQ-FIN-003 is only three-quarters delivered. Needs per-period recognised revenue on the engine input, which is a Finance fact the adapter does not yet carry |
| DR-020 | `MET-FIN-018` margin bridge decomposition not implemented | DEFERRED | Delivery Intelligence | 9 | AC-4 (causes sum exactly, zero residual) is unproven. Scoped to Phase 9 by `PRODUCT_SPEC.md`; recorded here because it is the most fragile credibility claim in the product |
| DR-021 | Trajectory in the acceptance report runs on **one** signal series (progress variance) | IMPLEMENTED_WITH_DEBT | Delivery Intelligence | 7 | Confluence detection cannot fire in the report, so `RAPIDLY_DETERIORATING` is unreachable there. The engine handles n signals and is golden-tested with three; the *adapter* only builds one, because the other series need weekly restatements the generator does not emit |
| DR-022 | No persistence for any Phase 4 output | DEFERRED | Platform | 5 | Assessments are recomputed on demand and never stored, so "reproduce a historical assessment" (REQ-HLTH-005) is provable in principle and untested in practice |

**Closed this phase:** none. DR-012 remains closed.

---

## 9. Open questions

Every still-open item from prior phases, restated. Dropping one silently is a governance failure.

| ID | Question | Status | What it blocks | Owner |
| --- | --- | --- | --- | --- |
| MC-2 / OQ-4 | The six health dimension weights | **Open** | `MET-HLTH-001…006`, `MET-HLTH-010` — `HEALTH_MODEL_V1` carries `blockedBy` and cannot be used | Sponsor / Delivery leadership |
| MC-3 | `HEALTH-v1` band edges and critical-breach triggers | **Open** | The Frozen six-dimension model. `HEALTH-v2` ships synthetic candidates instead | Rules + Delivery leadership |
| MC-5 | What "intervenability" means | **Open** | `MET-PORT-007`, and therefore **AC-1 and Phase 7** | Delivery leadership |
| MC-6 | Deterioration threshold calibration | **Partially open** | `deteriorationSlopeThreshold` still blocked on MC-2/MC-3 (it is a slope of a score that has no definition). `marginDeteriorationSlopeThreshold` has a synthetic candidate of −1.40 pp/week | Delivery leadership |
| MC-8 | What a "scope unit" is | **Open** | `MET-DEL-012`, `MET-QUA-002` | Delivery + Engineering |
| DQ-4 | Whether `recovery` survives as a bounded context | **Open** | Decided after Phase 10. It now carries three metrics and an engine, which raises the cost of retiring it | Architecture |
| C-7 | Four executive dimensions or six? | **Open — ADR-0015 D-1** | Which model is authoritative for `MET-HLTH-011` | Sponsor / Delivery leadership |
| C-8 | Ship an intervention ranking without intervenability? | **Answered by D-2** | — | Delivery leadership |
| C-9 | Does the seven-factor profile supersede `MET-DQ-007`? | **Open — ADR-0015 D-3** | Whether `MET-DQ-009` is permanent | Assurance |
| C-10 | Which "Green" does Green-at-Risk mean? | **Open — ADR-0015 D-4** | Whether scenario B — the reference case — is flagged by the product's flagship rule | Sponsor / Delivery leadership |
| OQ-2 | Recognised revenue ownership | **Closed** (Phase 2 closure, Decision 1) | — | — |
| C-1…C-6 | Phase 1–3 conflicts | **Closed** by ADR-0011, 0012, 0013, 0014 | — | — |

---

## 10. Handoff

- **What now exists:** ten engines — economics (incl. EVM), health with hard overrides and banding,
  trajectory with a four-state model and a 30/60/90-day outlook, Green-at-Risk, data confidence,
  forecast confidence, the forecast-reliability profile, recovery economics, portfolio aggregation,
  and an exposure ordering that refuses to impersonate `MET-PORT-007`. One application-layer
  orchestrator (`assessProject`). An explainability platform module that **throws** rather than
  producing an unevidenced claim. 15 new metrics, all Draft and all traceable to a named conflict.
  A deterministic acceptance report over the eight curated scenarios.
- **What Phase 5 consumes:** `src/app/metrics/metric-calculation-service.ts` as the computation
  entry point; `RULE_SETS` for calibration; `docs/PHASE-4-CURATED-ASSESSMENT.md` as the reference
  output to authorise and persist against.
- **What Phase 5 must NOT assume:**
  1. That any threshold is approved. Every one is a synthetic calibration candidate.
  2. That `HEALTH-v2` is the health model. It is Draft under C-7.
  3. That an intervention ranking exists. It does not, and the function that would produce it throws.
  4. That assessments are persisted. Nothing is stored (DR-022).
  5. That authorization is anywhere in this code. It is not; `assessProject()` computes over whatever
     it is given, and the enforcement point is Phase 5's job.
- **`PHASE_HANDOFF.md` updated:** yes

---

## 11. Self-review

- [x] **Is any `IMPLEMENTED` claim resting on a UI that merely looks right?** No UI exists.
- [x] **Is any golden fixture's expected value generated from the implementation it tests?** No. The
      economics fixtures are Phase 3 brief figures restated as literals; the EVM, trajectory,
      recovery and aggregation fixtures are recomputed in the test from primitives. The one place
      independence is *partial* — MET-HLTH-02x dimension scores — is stated in §2 rather than glossed.
- [x] **Is any authorization claim verified only through the UI?** No authorization claim is made.
- [x] **Did any formula, threshold, or scenario change without an ADR?** No. Four conflicts raised in
      ADR-0015; `MET-DQ-007` and `MET-HLTH-010` are unchanged.
- [x] **Is any mock unlabelled?** There are no mocks. `rankAsMetPort007()` is the one place a stub
      would have been natural, and it throws instead.
- [x] **If a claim in this report is wrong, would we find out now — or in front of the client?**
      Now, for everything the gates cover — and the gates caught eight real defects this phase. The
      exposure is C-10: if the Reported reading is the right one, the product's headline feature
      currently does not fire on its own reference scenario. That is written into the acceptance
      report and pinned by test rather than left to be discovered in a demo.
