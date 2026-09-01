# Requirement Traceability Report — Phase 3: Synthetic Portfolio & Scenario Generator

- **Phase:** 3 (including the correction & closure pass)
- **Date:** 2026-08-29
- **Author:** Delivery Portfolio SME / Data Scientist / Synthetic Data Engineer / Fixed-Price Economics
- **Requirements in scope:** REQ-DATA-007, REQ-DATA-008, REQ-DATA-009, plus continuous REQ-GOV-005/006/007, REQ-SEC-008
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md` v2.0.0, `SECURITY_MODEL.md`, `SYNTHETIC_DATA_SPEC.md`, `TEST_STRATEGY.md`,
  `DEFINITION_OF_DONE.md`, `PHASE_HANDOFF.md`, ADR-0001…0014

---

## 1. Requirement coverage

| REQ ID | Requirement | State | Evidence | Verification | Result |
| --- | --- | --- | --- | --- | --- |
| REQ-DATA-007 | Portfolio generated from a fixed seed and byte-reproducible | `IMPLEMENTED` | `scripts/generator/rng.ts`, `contentHash()`, `data/synthetic/MANIFEST.json` | golden | ✅ same seed → identical hash; committed hash asserted |
| REQ-DATA-008 | Portfolio contains every scenario archetype | `IMPLEMENTED` | `scripts/generator/archetypes.ts`, `validate.ts` check 2 | integration | ✅ all 12 present and findable |
| REQ-DATA-009 | No real client, person or financial data | `IMPLEMENTED` | `names.ts` deny-list, `psn-NNNN` handles, `CHECK (synthetic)` | integration | ✅ 0 findings across 129,028 rows |
| REQ-GOV-005/006 | Boundaries enforced by build | `IMPLEMENTED` | Architecture gate unchanged | integration | ✅ 45 files, 0 violations |
| REQ-GOV-007 | Phase ends with handoff and debt register | `IMPLEMENTED` | This file, `PHASE_HANDOFF.md` | manual | ✅ |
| REQ-SEC-008 | No secret material | `IMPLEMENTED` | Secret scan | integration | ✅ 0 findings |
| REQ-DQ-001 | Data confidence computable from generated imperfection | `IMPLEMENTED_WITH_DEBT` | G7 injection: gaps, late entry, unpaid invoices | integration | ✅ data present; the *metric* is Phase 4 |

### 1.1 Phase 3 brief deliverables

| Deliverable | State | Evidence |
| --- | --- | --- |
| Seed / generator code | `IMPLEMENTED` | `scripts/generator/` — 8 modules, 2 entry points |
| Synthetic data specification and seed version | `IMPLEMENTED` | `SYNTHETIC_DATA_SPEC.md` v2.0.0; seed and hash in `MANIFEST.json` |
| Scenario catalog with "what the executive should see" | `IMPLEMENTED` | `docs/SCENARIO_CATALOG.md` |
| Data validation report | `IMPLEMENTED` | `docs/DATA_VALIDATION_REPORT.md` |
| `PHASE_HANDOFF.md` | `IMPLEMENTED` | Rewritten |
| Validation tests | `IMPLEMENTED` | `tests/golden/synthetic-portfolio.test.ts` (57), `scripts/generator/validate.ts` (13 families) |

### 1.2 Brief requirements, point by point

| Brief requirement | State | Evidence |
| --- | --- | --- |
| ~75 fixed-price projects | ✅ | 75 fixed-price + 11 T&M + 5 capacity = 91 |
| 8 verticals | ✅ | All eight present and non-empty |
| 4 regions | ✅ | NA, Europe, India/APAC, LATAM — modelled as a second axis under 3 business units |
| 4 TCV bands | ✅ | 18 / 38 / 22 / 13 |
| 6 lifecycle stages | ✅ | All six sub-stages non-empty, mapped to the 4 canonical values |
| `DEMO — SYNTHETIC DATA` labelling | ✅ | Manifest header; `synthetic: true` on every fact row |
| ~12 months of periodic history | ✅ **exceeded** | Up to 78 weekly snapshots (18 months); weekly rolls up to monthly |
| Causal consistency, not independent fields | ✅ | Driver-based simulation; §3 below |
| 8 curated scenarios A–H | ✅ | All eight hit their stated figures |
| Portfolio-level patterns | ✅ | 4 patterns, applied as nudges |
| Deterministic seed, documented logic | ✅ | `rng.ts`; every module carries its rationale |
| No PII | ✅ | Opaque `psn-NNNN` handles only |
| 7 validation assertions | ✅ | §2 below |

---

## 2. The brief's seven validation assertions

| # | Assertion | Where | Result |
| --- | --- | --- | --- |
| 1 | No negative impossible percentages | `validate.ts` `percent.range`, `money.negative` | ✅ |
| 2 | Executed CR dates align to contractual baseline revisions | `contract.crRevision`, `contract.crLink` | ✅ 572 executed changes, each with a matching revision |
| 3 | Cost/history monotonic where appropriate | `monotonic.recognised`, `monotonic.progress` | ✅ |
| 4 | Forecast metrics respond coherently to drivers | `scenario.*`, plus the cost-ahead-of-progress assertion | ✅ |
| 5 | Curated projects meet required scenarios | `scenario.A`…`scenario.H` | ✅ all 8 |
| 6 | All foreign keys and periods valid | `integrity.fk`, `periods.*` | ✅ 9 relationships checked |
| 7 | All money uses decimal-safe types | `money.type/format/decimalSafe` | ✅ every amount survives `Money.of()` unchanged |

---

## 3. Causal consistency

The generator sets drivers; outcomes fall out. Asserted rather than assumed:

| Cause | Effect chain | Verified by |
| --- | --- | --- |
| Scope arrives uncommercialised | absorbed cost → exposure → margin | E: $280K exposure, 0 executed CRs, GM 24% → 15.83% |
| Executed CR | contractual baseline moves, **from execution date forward** | D: +$600K, revenue $4.0M → $4.6M, matching revision row |
| Quality deterioration | rework hours → productive hours ↓ → cost per unit ↑ | G: 16% rework → $190K excess → GM 24% → 8.67% |
| Resource cost drift | blended rate ↑ → EAC ↑ → GM ↓ | `PYRAMID_EROSION`, North America pattern |
| Customer delay | blocked effort → progress ↓, cost absorbed | 178 dependency records with effort attribution |
| ETC not revised | implied EAC diverges from stated EAC | F: $3.46M vs $2.9M, gap $561,538 |

**General form, asserted:** for every eroding scenario (B, C, G, H) cost consumed exceeds physical
completion. Margin cannot erode without the spending pattern that causes it.

---

## 4. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | 88 | 88 | 0 | 0 |
| golden | 111 | 111 | 0 | 0 |
| integration | 60 | 60 | 0 | 0 |
| **Total** | **259** | **259** | **0** | **0** |

Gates: `tsc --noEmit` ✅ · architecture ✅ 45 files, 0 violations · schema ✅ · lint ✅ ·
registry validation ✅ 0 violations across 138 metrics · **generator validation ✅ 0 errors,
0 warnings across 129,028 records** · secret scan ✅ · `npm audit` ✅ 0 vulnerabilities.

**PostgreSQL: still not run.** DR-012 remains open. No database verification is claimed.

### 4.1 Defects the validator caught during this phase

A gate that has never fired proves nothing. All five were real and were fixed, not suppressed:

| Finding | Cause |
| --- | --- |
| Forecast GM wrong on all 8 curated scenarios | The validator picked the *oldest* ETC revision — the two generators number revisions in opposite directions, and an id-suffix heuristic broke on one of them. Now keyed on the estimate date |
| Contingency short by exactly the opening balance on B and C | The first checkpoint's consumption was never emitted as a drawdown |
| Cumulative recognised revenue fell on two projects | An upward ETC revision lowers the cost-to-cost ratio; real accounting does not claw back revenue for that. `RECOGNITION-v1` now does not reverse |
| Invoiced exceeded recognised on four projects | The billing fraction was re-drawn per period, so the target oscillated. One fraction per project |
| A 5-week-old project flagged for insufficient history | The check was wrong, not the data. Now scoped to projects ≥16 weeks old and reporting normally, with a separate assertion that `LOW_CONFIDENCE` really is under-reported |

---

## 5. Invariant compliance

| # | Invariant | Held? | Evidence |
| --- | --- | --- | --- |
| 3 | No silent change to formulas, boundaries, scenarios | ✅ | No metric changed. `SYNTHETIC_DATA_SPEC.md` → v2.0.0 under the already-accepted ADR-0013 |
| 5 | No false completion claims | ✅ | MC-6 reported as *reduced*, not closed, with the reason |
| 6 | Decimal-safe financial logic | ✅ | Every emitted amount snapped through `Money`; asserted across the corpus |
| 7 | Server-side authorization only | ✅ | Untouched. Seeded users carry scope for Phase 5 |
| 8 | L1/L2/L3 separation intact | ✅ | Check family 12: no derived metric stored as a fact |
| 9 | AI is not calculator or system of record | ✅ | Untouched |
| 10 | Modular monolith, strict contexts | ✅ | Generator lives in `scripts/`, outside the architecture gate's scope, and imports only public surfaces |
| 11 | `DEMO — SYNTHETIC DATA` labelling | ✅ | Manifest header, `synthetic: true` on all 129,028 fact rows, asserted |

---

## 6. Proposed deviations / ADRs

**No new ADR.** Phase 3 implemented ADR-0013, which was already `Accepted`.

> **ADR-0013 — ACCEPTED, explicit approval confirmed before Phase 4** (Phase 3 correction pass,
> Governance Decision 1). At the time this report was first written the acceptance was inferred from
> the brief being re-issued unchanged; that is now historical record. The substance is unchanged.

**ADR-0014 — ACCEPTED** in the Phase 3 correction pass (Governance Decision 2), resolving conflict
C-6. See §10.

---

## 7. Conflicts

| ID | Conflict | Disposition |
| --- | --- | --- |
| — | Brief asks for "monthly/periodic history (~12 months)"; ADR-0003 fixes weekly snapshots | **Resolved by ADR-0013 §1, already accepted.** Weekly is a superset: 78 weekly points roll up to monthly, and 12 monthly points cannot fill `MET-FCST-001`'s eight-week window |
| C-6 | Epistemic level of composite health | Still open (ADR-0014). Untouched by Phase 3 — no health value is generated |

---

## 8. Debt

| ID | State | Change |
| --- | --- | --- |
| **DR-012** | **OPEN — hard Phase 4 gate** | Unchanged. Migrations authored, never executed. No PostgreSQL |
| **MC-6** | **PROVISIONAL, not closed** | Margin-trajectory threshold **−1.40 pp/week** over an explicitly derived 54-project cohort, labelled `SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY`. Health-slope threshold and SDI weights **blocked on MC-2/MC-3, not on data** |
| **DR-015** | **OPEN — enforced** | `scripts/generator/validate.ts` recomputes 14 metrics independently. It is *not* the Phase 4 engine. Architecture gate `G-ORACLE` now rejects any `src/` import of it, proven to fire. After Phase 4 it may remain only as an independent test oracle, or be deleted |
| **DR-016** | **NEW — accepted** | `.ndjson` output (25 MB) is not committed. Regenerable from the committed seed; `MANIFEST.json` carries the hash that proves it |
| DR-005, DR-007, DR-011 | Stay CLOSED | — |
| DR-001…004, 006, 008–010, 013, 014 | Unchanged | — |

---

## 10. Phase 3 correction & closure pass

Twelve corrections applied after the initial Phase 3 gate. **Phase 3 was not rebuilt**; the portfolio,
the eight curated scenarios and their figures are unchanged.

| # | Correction | Outcome |
| --- | --- | --- |
| G1 | ADR-0013 explicit acceptance | `Accepted`, explicit approval confirmed before Phase 4. Earlier "inferred" wording retained only as historical record in the Phase 2 closure report |
| G2 | ADR-0014 / C-6 | **Accepted.** The boundary falls between a health *measure* (L2_DERIVED) and a health *conclusion* (L3_ASSESSED). `MET-HLTH-011/013/030/031` and `MET-PORT-004/005` reclassified to `L3_ASSESSED` at v2.0.0; `MET-HLTH-001…006`, `010`, `032` stay `L2_DERIVED`. **ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 needed no amendment** — "health score" remains the canonical L2 example, because the score is what stays L2 |
| G3 | Reported vs System-Assessed RAG | Preserved as distinct. Reported RAG is `L1_OBSERVED` and generated; System-Assessed RAG is `L3_ASSESSED` and is **not** generated. Asserted by test |
| 1 | Invalid deterioration invariant | **Removed.** See §10.1 |
| 2 | Trajectory windows | `trajectoryWindowWeeks` renamed `defaultWeeklySignalWindowWeeks`; **10 signal-specific versioned observation policies** added across 5 window types |
| 3 | 91-project portfolio | Confirmed 75 / 11 / 5. `fixedBidCohort()` and `cohortForMetric()` added with tests |
| 4 | MC-6 provisional | Labelled `SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY` in the parameter's own unit field, asserted by test |
| 5 | MC-6 cohort | Derived from explicit rules → **54, not 81**. The earlier figure had silently included T&M, capacity and curated projects |
| 6 | Recognised-revenue corrections | Append-only `ORIGINAL`/`ADJUSTMENT`/`REVERSAL`/`RESTATEMENT` model in the canonical type, the schema and the generator. 69 corrections generated |
| 7 | DR-015 | Architecture gate `G-ORACLE` blocks any `src/` import of the generator or its oracle. Proven to fire |
| 8 | DR-012 | Remains OPEN. No PostgreSQL. Hard Phase 4 entry gate |
| 9 | Curated scenarios stable | A–H regression: all unchanged |
| 10 | Scenario C | Still Reported Green throughout; no conclusion precomputed |
| 11 | Leading risk case | `LR` / `prj-029` added. See §10.2 |
| 12 | L1 facts only | Re-asserted; no intelligence output is seeded |

### 10.1 The invalid invariant

**Removed:** ~~"a project cannot be labelled deteriorating unless cost consumed is ahead of physical
completion"~~. It was carried in `tests/golden/synthetic-portfolio.test.ts`, in the validator's
scenario checks, and in three documents. It is wrong: deterioration frequently precedes adverse cost
burn.

**Replaced by**, scoped in `validate.ts` to `COST_DRIVEN_EROSION_SCENARIOS = {B, C, G, H}`: *where a
scenario specifically models margin erosion caused by delivery inefficiency or cost overrun, its cost
and progress facts must causally support that mechanism.* A, D, E, F and LR are not asserted against
it. A dedicated test asserts the counter-example holds, so the general form cannot creep back.

### 10.2 The leading-risk case — `prj-029`, scenario `LR`

Cost consumed **55.00%** against physical completion **58.00%**; forecast margin **25.65%** against
25.00% sold. Every lagging measure is benign. Seven forward signals are not: a 62-day gating
milestone forecast slip, four open customer dependencies with the oldest at 95 days, $310K of
unsigned scope with zero executed CRs, three open critical risks, a required velocity of 2.33 pp/week
against 1.00 demonstrated (**2.33×**), contingency draw of $49,250 in the last eight weeks against
$25,000 in the prior eight, and three blocking acceptance items.

**No System-Assessed RAG, trajectory or outlook is generated for it.** Its Reported RAG is an honest
Green.

---

## 9. Self-review

- [x] **Any `IMPLEMENTED` claim resting on something that merely looks right?** No. Every claim is
      backed by one of 259 tests or 13 validator check families.
- [x] **Any expected value generated from the implementation it tests?** No. The curated scenarios'
      expected values in `tests/golden/synthetic-portfolio.test.ts` are the Phase 3 brief's own
      figures, restated independently — deliberately not read back from `CURATED[].expect`, which
      would prove only self-consistency.
- [x] **Any narrative-only scenario?** No. `SYNTHETIC_DATA_SPEC.md` §9.7's failure — a project
      labelled deteriorating whose series does not deteriorate — is asserted against directly: every
      eroding scenario must show cost consumed ahead of physical completion.
- [x] **Was data adjusted to make a number look right?** No. Scenario G's excess rework recomputes to
      $190,016.58 against a stated "~190K"; the assertion was widened to the nearest $100 and the
      reason documented, rather than the data being nudged (§9.4 forbids it).
- [x] **Any open question resolved by inference?** No. MC-6 is reported as partially calibrated with
      the reason; MC-8's scope unit was not invented; no health weights were assumed.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      everything gated. The one exception is DR-012, which is found in Phase 4 and is stated plainly
      as an open hard gate.
