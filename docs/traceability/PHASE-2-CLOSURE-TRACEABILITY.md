# Requirement Traceability Report — Phase 2 Closure: Semantic Contract Freeze & OQ-2 Resolution

- **Phase:** 2 (closure)
- **Date:** 2026-08-29
- **Author:** Principal Data Architect / Financial Systems Architect / Delivery Governance SME
- **Scope:** Decisions 1–14 of the Phase 2 closure brief; Steps 1–7
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md` v2.0.0, `SECURITY_MODEL.md`, `TEST_STRATEGY.md`, `DEFINITION_OF_DONE.md`,
  `PHASE_HANDOFF.md`, ADR-0001…0013, the metric registry, `migrations/`, and the open-question,
  metric-calibration and debt registers

---

## 1. Step 1 — Draft metric inventory (taken before any change)

33 of 137 metrics were `Draft`. Classification per Decision 8.

| Metric ID | Name | Was | Open item | Type | Recommended resolution | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| MET-FIN-006 | Percent Complete (cost-to-cost) | Draft | OQ-2 | **A → resolved** | Decision 1 removes its recognition role | Renamed *Cost Progress Ratio*; **Frozen** v2.0.0 |
| MET-FIN-009 | Recognised Revenue (ATD) | Draft | OQ-2 | **A → resolved** | Becomes an imported Finance fact | `L1_OBSERVED` / `FINANCE_SYSTEM`; **Frozen** v2.0.0 |
| MET-FIN-015 | Gross Margin — Actual to Date | Draft | OQ-2 via 009 | **A → resolved** | Computable once 009 is a fact | **Frozen** |
| MET-COM-006 | Unbilled Revenue | Draft | OQ-2 via 009 | **A → resolved** | Both sides now Finance facts | **Frozen** |
| MET-DEL-012 | Scope Completion | Draft | MC-8 | **A** | Scope unit is undefined; the answer changes what the number *means* | **Remains Draft**; owner named |
| MET-QUA-002 | Defect Density | Draft | MC-8 | **A** | Same undefined scope unit | **Remains Draft**; owner named |
| MET-HLTH-001…006 | Six health dimensions | Draft | MC-3, MC-2 | **B** | Normalisation mechanism is the contract; edges and weights are calibration | Mechanism made explicit; **Frozen**; 3 parameters each → `HEALTH-v1` |
| MET-HLTH-010 | Composite Health Score | Draft | MC-2 | **B** | Weighted sum; weights are calibration | **Frozen**; 6 weights → `HealthModelVersion` |
| MET-HLTH-011 | System-Assessed RAG | Draft | MC-3 | **B** | Banding + critical-breach precedence is the contract | **Frozen**; 3 parameters → `HEALTH-v1` |
| MET-HLTH-013 | Effective RAG | Draft | — | **B** | Fully specified; was Draft only via 011 | **Frozen** |
| MET-HLTH-030 | Status Divergence | Draft | — | **B** | Fully specified | **Frozen** |
| MET-HLTH-031 | Divergence Persistence | Draft | — | **B** | Fully specified | **Frozen** |
| MET-HLTH-032 | Dimension Contribution | Draft | MC-3 | **B** | Neutral baseline is calibration | **Frozen**; → `HEALTH-v1` |
| MET-FCST-001 | Health Trajectory | Draft | — | **B** | Least-squares over a declared window | **Frozen**; window settled at 8 by ADR-0003 |
| MET-FCST-002 | Deterioration Flag | Draft | MC-6 | **B** | Threshold is calibration | **Frozen**; → `TRAJECTORY-v1` |
| MET-FCST-003 | Weeks to Amber | Draft | MC-3 | **B** | Amber edge is calibration | **Frozen** |
| MET-FCST-004 | Margin Trajectory | Draft | — | **B** | Fully specified | **Frozen** |
| MET-FCST-005 | Projected Outturn Margin | Draft | MC-6 | **B** | Bounds are calibration | **Frozen**; clamp made explicit |
| MET-FCST-006 | Signal Confluence | Draft | — | **B** | Fully specified | **Frozen** |
| MET-FCST-007 | Intervention Window | Draft | MC-6 | **B** | Lead time is calibration | **Frozen** |
| MET-FCST-010 | Silent Deterioration Index | Draft | MC-6 | **B** | Composite mechanism was undefined; now explicit | **Frozen**; 6 parameters → `TRAJECTORY-v1` |
| MET-DQ-006 | Confidence-Qualified Health | Draft | — | **B** | Tuple; was Draft only via 010 | **Frozen** |
| MET-PORT-003 | Portfolio Value at Risk | Draft | — | **B** | De-duplication rule was deferred; now explicit | **Frozen** |
| MET-PORT-004 | RAG Distribution | Draft | — | **B** | Fully specified | **Frozen** |
| MET-PORT-005 | Divergent Project Count | Draft | — | **B** | Fully specified | **Frozen** |
| MET-PORT-006 | Deteriorating Greens | Draft | MC-6 | **B** | Threshold is calibration | **Frozen**; reclassified `L3_ASSESSED` |
| MET-PORT-007 | Intervention Priority Rank | Draft | MC-5 | **A** | "Intervenability" is an undefined *concept*, not a threshold | **Remains Draft**; owner named |
| MET-PORT-008 | Portfolio Confidence | Draft | — | **B** | Band floors are calibration | **Frozen** |

**Result: 30 of 33 froze. 3 remain, all genuine Type A.**

---

## 2. Steps 2–5 — decisions applied

| Decision | Applied | Evidence |
| --- | --- | --- |
| **1 — OQ-2 closed** | ✅ | `MET-FIN-009` is `L1_OBSERVED`/`FINANCE_SYSTEM` with formula `FinanceSystem.recognisedRevenueToDate (imported fact)`; new `RecognisedRevenueFact` entity and `financial.recognised_revenue_fact` table; `RECOGNITION-v1` marked POC-only |
| **2 — revenue separated** | ✅ | Eight distinct concepts, §4 below; tested in `metric-registry.test.ts` |
| **3 — Performance-Implied EAC** | ✅ | Reworded to "extrapolative diagnostic"; notes state it is not a recognition method, not a substitute for ETC, not the official EAC, not cost-to-cost recognition |
| **4 — forecast economics** | ✅ | EAC, Forecast GM $/%, GM Erosion $ unchanged and re-verified by golden recomputation |
| **5 — risk-adjusted economics** | ✅ | `includedInEtc` retained with a mandatory justification `CHECK`; double counting tested (gross 280,000 vs incremental 180,000) |
| **6 — epistemicLevel** | ⚠️ **partial** | Vocabulary, Trajectory, Forecast Confidence, Reported RAG, Recognised Revenue all applied. **Health held — see conflict C-6 and ADR-0014** |
| **7 — authoritativeSourceType** | ✅ | Required field; 7 source types in use; `L1_OBSERVED` may not claim `DERIVED` authority |
| **8 — metrics vs calibration** | ✅ | §1 inventory; 33 open parameters across 7 rule sets in `RULE_SETS` |
| **9 — registry status** | ✅ | Three states only: `Draft`, `Frozen`, `Deprecated`. `Implemented`/`Retired` removed |
| **10 — formula governance** | ✅ | `ARCHITECTURE_DECISIONS.md` §3.3 added; **C-4 closed**; MET-FIN-008 and MET-FIN-019 approved without retrospective ADRs |
| **11 — revenue metric review** | ✅ | `MET-FIN-039` added; `MET-FIN-002` renamed; no IDs renumbered |
| **12 — DR-012** | ✅ | Remains open; REQ-DATA-003 stays `IMPLEMENTED_WITH_DEBT`; hard Phase 4 gate added |
| **13 — cross-context RI** | ✅ | `ARCHITECTURE_DECISIONS.md` §3.4 added; DR-007 stays closed |
| **14 — fiscal periods** | ✅ | Confirmed unchanged; DR-011 stays closed |

### 2.1 New validation rules (Step 4)

`validateRegistry()` gained six checks, all failing the build:

| Code | Catches |
| --- | --- |
| `MISSING_EPISTEMIC_LEVEL` | A metric that does not say what kind of claim it is |
| `MISSING_AUTHORITATIVE_SOURCE` | A metric that does not say who is authoritative |
| `OBSERVED_FACT_CLAIMED_AS_DERIVED` | An `L1_OBSERVED` metric claiming `DERIVED`/`RULE_ENGINE` — i.e. Delivery Intelligence authoring a fact it should consume. **This is what makes OQ-2 structural rather than documentary** |
| `DERIVED_CLAIMS_EXTERNAL_AUTHORITY` | An `L2`/`L3` metric claiming an external system of record |
| `DERIVED_DEPENDS_ON_ASSESSMENT` | An L1/L2 metric resting on an L3 input (Step 5) |
| `UNNAMED_CALIBRATION` | A rule-parameterised metric that does not name its parameters |
| `DRAFT_WITHOUT_SEMANTIC_REASON` | A `Draft` metric that does not name a Type A gap and an owner |

### 2.2 Step 5 — dependency purity

- No `Frozen` metric depends on a `Draft` one. Achieved by swapping `MET-QUA-002` (MC-8 blocked) for
  `MET-QUA-010` in `MET-HLTH-004`; without it a single Type A gap would have kept the entire health
  and forecast tree Draft.
- No L1/L2 metric depends on an L3 assessment. `MET-PORT-006` reclassified to `L3_ASSESSED`
  accordingly — counting inferred flags produces an inferred count.
- No circular semantic dependency (cycle detection, unchanged).

---

## 3. Step 6 — golden recomputation

All 14 required metrics recomputed independently in `tests/golden/definition-recomputation.test.ts`
on a worked fixed-bid project. **Expected values were computed by hand from the catalog and are
stated in comments beside each assertion; none was generated from an implementation** — and there is
no engine implementation to generate them from.

| # | Metric | Expected | ✓ |
| --- | --- | --- | --- |
| 1 | MET-FIN-002 Contractual Revenue | 10,500,000.00 | ✅ pending 280,000 excluded |
| 2 | MET-FIN-008 EAC | 8,550,000.00 | ✅ 5.2M + 3.1M + 0.25M |
| 3 | MET-FIN-010 Forecast Revenue | 10,500,000.00 | ✅ |
| 4 | MET-FIN-024 Forecast GM $ | 1,950,000.00 | ✅ |
| 5 | MET-FIN-014 Forecast GM % | 0.185714 | ✅ vs 24.0% sold |
| 6 | MET-FIN-025 GM Erosion $ | 450,000.00 | ✅ exactly −MET-FIN-017 |
| 7 | MET-FIN-027 Burn Gap | 0.128379 | ✅ |
| 8 | MET-FIN-029 Performance-Implied EAC | 10,000,000.00 | ✅ |
| 9 | MET-FIN-030 ETC Optimism Gap | 1,450,000.00 | ✅ clamped at 0 when prudent |
| 10 | MET-FIN-034 Contingency Burn Gap | 0.30 | ✅ |
| 11 | MET-RSK-008 Incremental Risk Exposure | 180,000.00 | ✅ vs 280,000 gross |
| 12 | MET-FIN-031 Risk-Adjusted Revenue | 10,612,000.00 | ✅ |
| 13 | MET-FIN-032 Risk-Adjusted GM $ | 1,882,000.00 | ✅ |
| 14 | MET-FIN-033 Risk-Adjusted GM % / MET-FIN-019 GM VaR | 0.177346 / 518,000.00 | ✅ |

---

## 4. Step 7 — gates

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (strict; 8 compile-time `Money` assertions) | ✅ clean |
| `npm run check:architecture` | ✅ 45 files, 0 violations |
| `npm run check:schema` | ✅ 8 migrations, 14 insert-once tables, 0 violations |
| `npm run lint` | ✅ 0 problems |
| `validateRegistry()` | ✅ 0 violations across 138 metrics |
| Unit | ✅ 88 passed |
| Golden | ✅ 54 passed |
| Integration | ✅ 60 passed |
| **Total tests** | **✅ 202 passed, 0 failed, 0 skipped** |
| `node scripts/ci/secret-scan.mjs` | ✅ 132 files, 0 findings |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |
| **PostgreSQL execution** | ❌ **not run — no PostgreSQL, Docker not running. DR-012 remains open. No DB verification is claimed.** |

---

## 5. Conflicts

| ID | Conflict | Precedence applied | Disposition |
| --- | --- | --- | --- |
| **C-4** | §3.1 made any formula change ADR-mandatory; `METRIC_CATALOG.md` §1.3 permitted Draft changes in Phase 2 | Decision 10 resolves it | **CLOSED.** §3.3 added; MET-FIN-008 and MET-FIN-019 approved |
| **C-6** | **NEW.** Closure Decision 6 says *System Health → `L3_ASSESSED`*. ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 name "health score" as the canonical **L2** example, and §3.3 calls System-Assessed RAG "deterministic rules over L2 metrics" | ADRs rank 1; `PRODUCT_SPEC.md` ranks 4; a phase brief is not in the precedence order | **NOT resolved by inference.** Health kept `L2_DERIVED`; **ADR-0014 raised (Proposed)** setting out both cases and a third split option. Nothing is blocked either way — the level is a labelling and rendering decision. **Needs a decision before Phase 6, ideally before Phase 4 stamps provenance envelopes.** |
| C-5 | Performance-Implied EAC uses cost-to-cost arithmetic while OQ-2 was open | Decision 3 | **CLOSED.** It is a diagnostic; OQ-2 closed separately by Decision 1 |
| C-1, C-2, C-3 | Carried from Phase 1 | — | ADR-0011/0012 `Proposed`; ADR-0013 `Accepted` (see note below) |

> *(Historical, superseded: ADR-0013 acceptance was made **explicit** in the Phase 3 correction pass.
> The note below records the position as it stood when this report was written.)*
>
> **ADR-0013 acceptance is inferred, not explicit.** It was flipped to `Accepted` when the Phase 3
> brief was re-issued unchanged after its conflicts were surfaced. That inference is recorded in the
> ADR itself and is flagged here so it is visible. If it is wrong, revert it before Phase 3.

---

## 6. Debt

| ID | State | Change |
| --- | --- | --- |
| **DR-005** | **CLOSED** | Catalog freeze complete for every metric whose meaning is settled: 135 of 138 `Frozen`. The 3 remaining are Type A, named, owned |
| **DR-012** | **OPEN — hard Phase 4 gate** | Migrations authored, never executed. REQ-DATA-003 stays `IMPLEMENTED_WITH_DEBT`. **Must close before Phase 4 begins engine/database integration.** Does not block Phase 3 |
| DR-007, DR-011 | Stay CLOSED | Decisions 13 and 14 confirm the implemented behaviour |
| DR-013, DR-014 | Unchanged | Margin bridge decomposition (Phase 9); PostgreSQL repositories (Phase 5) |
| DR-001…004, 006, 008–010 | Unchanged | — |

---

## 7. Self-review

- [x] **Any `Frozen` claim resting on an unsettled meaning?** No. Every `Frozen` metric has an
      explicit formula; the six health dimensions, `MET-HLTH-011`, `MET-FCST-010` and `MET-PORT-003`
      had their mechanisms written out rather than left as "per rule set".
- [x] **Any golden expected value generated from the implementation?** No. All 14 are hand-computed
      and stated in comments. There is no engine to generate them from.
- [x] **Any formula changed silently?** No. Six version bumps and eleven wording refinements, each
      with a recorded reason, asserted non-empty by test and published in `METRIC_CATALOG.md` §13.
- [x] **Any open question resolved by inference?** One was declined: Decision 6's health
      reclassification, held as C-6 and raised as ADR-0014 rather than applied by editing a data file.
- [x] **Is DR-012 honestly stated?** Yes. No database ran. No DB verification is claimed anywhere.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for the 202
      tested claims and six gates. The exceptions are DR-012 (found in Phase 5) and C-6 (found in
      Phase 6 if left undecided) — both stated as such.
