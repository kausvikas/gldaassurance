# PHASE_HANDOFF.md

**Current state:** Phase 3 complete — **DR-012 CLOSED** — Phase 4 not started
**Last updated:** 2026-08-29
**Updated by:** DR-012 PostgreSQL execution verification

> **DR-012 CLOSED — PHASE 4 ENTRY GATE SATISFIED.**
>
> The authored persistence model was executed against **real PostgreSQL 16.13** from an empty
> database. **80 checks, 80 passed, 0 failed**, on a clean rebuild, repeatably, via
> `npm run db:verify`. One genuine defect was found and corrected (see §0.7).
>
> Phase 4 is unblocked but **has not begun.**

> This file is rewritten at the end of every phase. It is the first thing the next phase reads after
> the four source-of-truth documents. It records what *is*, not what is hoped.

---

## 0. Phase 3 report

### 0.1 What was built

A reproducible 91-project synthetic portfolio with 18 months of weekly history, generated from causal
drivers, plus the eight curated executive scenarios the brief specifies.

| Artifact | Purpose |
| --- | --- |
| `scripts/generator/` | 8 modules: seeded RNG, fictional naming, 12 archetypes with causal drivers, portfolio structure, weekly simulation, the 8 curated scenarios, billing, validation |
| `scripts/generate-data.ts` · `validate-data.ts` | `npm run data:generate` / `npm run data:validate` |
| `data/synthetic/MANIFEST.json` | Seed, generator version, as-of date, record counts, content hash. **Committed**; the 25 MB of `.ndjson` is not, being regenerable |
| `tests/golden/synthetic-portfolio.test.ts` | 57 tests: reproducibility, shape, archetypes, privacy, layering, and all 8 scenarios |
| `SYNTHETIC_DATA_SPEC.md` v2.0.0 | Revised portfolio shape, 12 archetypes, the curated eight |
| `docs/SCENARIO_CATALOG.md` | Each scenario's figures and "what the executive should see" |
| `docs/DATA_VALIDATION_REPORT.md` | 13 check families, MC-6 calibration evidence, known limitations |
| `docs/traceability/PHASE-3-TRACEABILITY.md` | Full report |

| | |
| --- | --- |
| Projects | **91** — 75 fixed-price, 11 T&M, 5 capacity |
| Records | **126,126** |
| History | up to 78 weekly snapshots per project |
| Seed | `gldi-portfolio-2026-08-31` · generator 1.0.0 |
| Content hash | `7fdc2f19401e35503e944680b76de09be57b8533356a9d56564e84f9547ba0d7` |
| Tests | **289 passed, 0 failed, 0 skipped** |
| Generator validation | **PASS** — 0 errors, 0 warnings |

### 0.2 The eight curated scenarios — all hit their stated figures

| # | Scenario | Sold GM → Forecast GM | The distinguishing number |
| --- | --- | --- | --- |
| A | Healthy Green | 24.00% → 22.50% | 62% complete against 60% planned |
| B | Green-at-Risk | 28.00% → **22.90%** | 27.5 → 26.2 → 24.7 → 22.9; 70% cost, 72% contingency, $90K exposure |
| C | Reported Green, Evidence Amber | 22.00% → **16.00%** | Exactly 6 points eroded; 82% contingency at 48% complete; **Green every week** |
| D | Amber Recovering | 26.00% → **19.50%** | 26 → 16 → 17 → 18.5 → 19.5, with a $600K CR executed |
| E | Scope & Commercial Leakage | 24.00% → **15.83%** | **$280,000** delivered uncontracted, zero executed CRs |
| F | ETC Optimism | 25.00% → 19.44% | Implied EAC **$3,461,538** vs stated $2,900,000 — gap **$561,538** |
| G | Quality Margin Leakage | 24.00% → **8.67%** | 16% rework, ~$190K excess, 5 acceptance blockers, worsening reopens |
| H | Contract-Loss Risk | 24.00% → **3.00%** | Risk-adjusted **−4.00%**; incremental risk **$420,000** |

### 0.3 What the generator deliberately does not produce

Per `PHASE_HANDOFF` §3.2a of the previous phase, asserted by validator check family 12 and by test:

- **No derived metric** — no forecast GM, EAC, burn gap, margin bridge or value at risk is stored.
- **No health score, System-Assessed RAG, trajectory or outlook.**
- **No recognised revenue derived from physical completion.** It is an accounting fact under the
  documented `RECOGNITION-v1` synthetic policy, stamped with that policy id on every row.
- **Reported RAG is the only status value present**, because `MET-HLTH-012` is `L1_OBSERVED`. The
  divergence the product exists to detect is *caused* here — B and C declare Green while their
  generated evidence says otherwise.

### 0.4 MC-6 — provisional, over a cohort derived from explicit rules

> **SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY.** A synthetic distribution can
> test reasonableness and behaviour. It cannot establish an empirical real-world threshold.

The cohort is now derived from written rules (`MC6_ELIGIBILITY`): fixed-price only, excluding
mobilisation and closed-out projects, excluding the hand-solved curated scenarios, requiring ≥12
weekly claims. **91 − 16 non-fixed-price − 10 lifecycle − 9 curated − 2 short-history = 54.** The
previously reported 81 is superseded; it had silently included T&M, capacity and curated projects.

Distribution across the 54: p05 −1.77, **p10 −1.47**, p25 −0.83, p50 −0.49, p75 −0.30, p90 −0.24
pp/week. `marginDeteriorationSlopeThreshold` = **−1.40 pp/week**, `persistenceScale` = **6 weeks**.
Both carry the non-production label in their own unit field, asserted by test.

**`deteriorationSlopeThreshold` remains open — and not for want of data.** It is the slope of
`MET-HLTH-010`, which cannot be computed until MC-2 weights and MC-3 band edges exist. Calibrating
the slope of a score that has no definition would mean inventing the score. The four Silent
Deterioration Index weights and `slopeScale` inherit the same block. **Recalibrate in Phase 4.**

### 0.45 Corrections applied in the closure pass

**Phase 3 was not rebuilt.** The portfolio, the eight curated scenarios and their figures are
unchanged; A–H regression passes.

| Correction | Outcome |
| --- | --- |
| **ADR-0013** | **ACCEPTED — explicit approval confirmed before Phase 4.** No current-status artifact describes it as inferred |
| **ADR-0014 / C-6** | **ACCEPTED.** Health *measures* are `L2_DERIVED`; health *conclusions* are `L3_ASSESSED`. `MET-HLTH-011/013/030/031` and `MET-PORT-004/005` reclassified at v2.0.0. ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 needed no amendment — the score itself stays L2 |
| Reported vs System-Assessed RAG | Distinct and preserved. Reported RAG generated as `L1_OBSERVED`; System-Assessed RAG **not** generated |
| Invalid deterioration invariant | **Removed** — see §0.46 |
| Trajectory windows | `trajectoryWindowWeeks` → `defaultWeeklySignalWindowWeeks`; **10 signal-specific versioned observation policies** across 5 window types |
| Contract-type cohorts | 75 / 11 / 5 confirmed; `fixedBidCohort()` selects exactly 75; metrics cannot silently aggregate an unsupported contract type |
| MC-6 cohort | Derived from rules → 54, not 81 |
| Recognised revenue | Append-only `ORIGINAL`/`ADJUSTMENT`/`REVERSAL`/`RESTATEMENT`; 69 corrections generated |
| DR-015 | Architecture gate `G-ORACLE` blocks any `src/` import of the oracle. Proven to fire |

### 0.46 The deterioration invariant that was removed

~~"A project cannot be labelled deteriorating unless cost consumed is ahead of physical
completion."~~ **Wrong, and removed** from the tests, the validator and three documents.
Deterioration frequently precedes adverse cost burn.

**Replaced by:** *where a scenario specifically models margin erosion caused by delivery inefficiency
or cost overrun, its cost and progress facts must causally support that mechanism.* Scoped to
B, C, G, H. A dedicated counter-example test stops the general form creeping back.

**The counter-example — `prj-029`, scenario `LR`.** Cost consumed 55.00% against physical completion
58.00%; forecast margin 25.65% against 25.00% sold. Seven forward signals nonetheless adverse: a
62-day gating milestone forecast slip, four open customer dependencies (oldest 95 days), $310K
unsigned scope with zero executed CRs, three open critical risks, required velocity 2.33 pp/week
against 1.00 demonstrated (2.33×), contingency draw $49,250 against $25,000 in the prior eight weeks,
three blocking acceptance items. **No System-Assessed RAG, trajectory or outlook is generated for
it.**

### 0.7 DR-012 — PostgreSQL execution verification

**Runtime.** PostgreSQL **16.13** (aarch64, Alpine), disposable `postgres:16-alpine` Docker
container. Docker Desktop was installed but stopped; it was started for this verification.

**Command.** `npm run db:verify` — provisions the container if absent, drops and recreates the
database, runs the migration chain from empty, executes 80 checks, exits non-zero on any failure.
Run three times plus once from a fully removed container; identical result each time.

| Group | Checks | Result |
| --- | --- | --- |
| Migration chain from an empty database | 13 | ✅ 8 migrations, 19 schemas, 56 tables, 4 domains, 28 triggers |
| As-Sold baseline immutability | 10 | ✅ UPDATE/DELETE rejected; append model still works |
| Privilege controls | 8 | ✅ `gldi_app` reads and inserts; UPDATE/DELETE denied |
| Monetary precision | 10 | ✅ NUMERIC(18,4); `0.1+0.2=0.3`; overflow rejected |
| Authored CHECK / UNIQUE / temporal constraints | 17 | ✅ |
| Recognised revenue correction history | 12 | ✅ append-only; lineage intact; effective position reconstructs |
| Schema and bounded-context boundaries | 3 | ✅ zero cross-schema FKs |
| Transaction atomicity | 2 | ✅ multi-write rollback leaves no partial state |
| Declared indexes | 5 | ✅ 74 indexes present |
| **Total** | **80** | **80 passed, 0 failed** |

**Both immutability controls verified independently**, as ADR-0007 §Decision 3 requires: the
rejecting trigger fires against the table *owner*, and the revoked privilege fires against
`gldi_app`. Either alone would have looked sufficient.

**The one defect found.** `gldi_app` held `SELECT, INSERT` grants on two tables but had **no schema
`USAGE`**. The role could not reach any table: every authored `GRANT` was dead and every
`REVOKE UPDATE, DELETE` was a no-op revoking a privilege never held. The design would have failed on
first deployment. Migration `0001` now grants schema `USAGE` — the minimum correction that makes the
already-designed model executable. No table privileges were added.

**Residual limitation, stated plainly.** Only **2 of 56 tables** carry `gldi_app` grants
(`contract.as_sold_baseline`, `audit.audit_event`) — the only two the migrations ever granted. The
remaining 54 are unreachable by the application role, so a full application-role architecture does
not yet exist. This does **not** block REQ-DATA-003, whose requirement is that As-Sold writes are
*rejected at the persistence layer*: the rejecting trigger enforces that against every role including
the owner, and it is verified. It is carried as new debt **DR-017**, owned by Phase 5, which builds
authentication and authorization.

### 0.5 Debt

| ID | State | Note |
| --- | --- | --- |
| **DR-012** | **OPEN — hard Phase 4 gate** | Migrations authored, never executed. No PostgreSQL, Docker not running. **Must close before Phase 4 begins engine/database integration.** No DB verification is claimed |
| **MC-6** | **PROVISIONAL** | −1.40 pp/week over a 54-project derived cohort, labelled non-production. Health-slope threshold and SDI weights blocked on MC-2/MC-3, not on data |
| **DR-015** | **OPEN — enforced** | The oracle recomputes 14 metrics to prove the facts cohere. **It is not the Phase 4 engine.** Gate `G-ORACLE` rejects any `src/` import of it. After Phase 4 it may remain only as an independent test oracle, or be deleted |
| **DR-016** | **NEW — accepted** | 25 MB of `.ndjson` is not committed; regenerable from the committed seed and hash |
| **DR-017** | **NEW — DEFERRED (Phase 5)** | Only 2 of 56 tables carry `gldi_app` grants. A complete application-role privilege model does not exist. Does not block REQ-DATA-003 — the trigger enforces immutability against all roles — but Phase 5 owns it |
| DR-005, DR-007, DR-011 | CLOSED | — |
| DR-001…004, 006, 008–010, 013, 014 | Unchanged | — |

### 0.6 Conflicts

| ID | Disposition |
| --- | --- |
| Brief's "monthly, ~12 months" vs ADR-0003's weekly snapshots | **CLOSED.** ADR-0013 §1: weekly is a superset. And trajectory is no longer globally 8-weekly — signal-specific observation policies now cover reporting-period, event and age-based signals (Correction 2) |
| **C-6** | **CLOSED.** ADR-0014 `Accepted`: health measures are `L2_DERIVED`, health conclusions are `L3_ASSESSED` |

> **ADR-0013 — ACCEPTED. Explicit approval confirmed before Phase 4.** The 91-engagement portfolio
> (75 fixed-price + 11 T&M + 5 capacity) and the twelve-archetype set are settled. Earlier phase
> reports recorded the acceptance as inferred; that is now historical record only.

---

## 1. Handoff to Phase 4 — Core Engines

### 1.1 What Phase 4 consumes

1. `METRIC_CATALOG.md` v2.0.0 — **135 of 138 metrics `Frozen`**, formulas explicit
2. `src/contexts/rules/` — the registry, `RULE_SETS`, and 32 open calibration parameters with owners
3. `src/contexts/*/index.ts` — the canonical types to compute over
4. `scripts/generator/` — 129,028 L1 facts to compute *from*
5. `docs/SCENARIO_CATALOG.md` — the expected outcomes the engines must reproduce

### 1.2 What Phase 4 owes

| # | Deliverable | Requirement |
| --- | --- | --- |
| 1 | ~~Close DR-012~~ — **DONE.** Verified against real PostgreSQL 16.13; `npm run db:verify`, 80 checks. Keep it green: it is now a standing gate | REQ-DATA-003 |
| 2 | ProjectEconomicsEngine — every `Frozen` MET-FIN metric | REQ-FIN-002/003/006/007 |
| 3 | Delivery/EVM, quality, resource and risk engines | REQ-FIN-006 |
| 4 | Health engine — **needs MC-2 weights and MC-3 band edges first** | REQ-HLTH-001…006 |
| 5 | Trajectory engine — **recalibrate MC-6 once health exists** | REQ-HLTH-004 |
| 6 | Data confidence engine | REQ-DQ-001 |
| 7 | **Full golden suite for every implemented metric** — the phase gate | TEST_STRATEGY §8 |
| 8 | Decide DQ-1 (read model) and DQ-2 (recompute trigger) with real query shapes | ARCHITECTURE_DECISIONS §6 |
| 9 | Supersede or delete the generator's recomputation module (DR-015) | — |
| 10 | Traceability report + updated `PHASE_HANDOFF.md` | REQ-GOV-007 |

### 1.3 What Phase 4 must NOT do

- Do not compute health before MC-2 and MC-3 are answered. The structure is frozen; the numbers are not.
- Do not build UI — Phase 6 onward.
- **Do not import, wrap, delegate to or invoke the Phase 3 recomputation oracle from any production
  path.** The authoritative engines must be implemented independently from the canonical metric
  registry. Gate `G-ORACLE` enforces this; do not add an exemption.
- Do not treat the eight curated scenarios' figures as engine output until the engines reproduce them.
- Do not regenerate the portfolio with a different seed to make a metric look better
  (`SYNTHETIC_DATA_SPEC.md` §9.5).
- Do not paste golden expected values from an engine run. `DEFINITION_OF_DONE.md` §3.1 requires them
  derived independently — the scenario catalog gives 8 projects' worth already.
- Do not mark DR-012 closed on DDL inspection, domain tests or in-memory persistence.

### 1.4 The trap Phase 4 must avoid

**Blessing a wrong formula by generating its fixture from the implementation.** The engines will
produce plausible numbers on day one; the only thing standing between plausible and correct is a
fixture whose expected value was computed by a human from the catalog. The eight curated scenarios
exist partly for this: their figures were fixed before any engine existed, so an engine that
reproduces them is agreeing with something it cannot have influenced.

### 1.5 Phase 4 is done when

- DR-012 is closed with real PostgreSQL evidence.
- Every `Frozen` metric has a passing golden fixture whose expected value was derived independently.
- The eight curated scenarios reproduce through the real engines, not the validator.
- Reproducibility holds: same inputs, same rule version, byte-identical output (AC-7).
- The traceability report accounts for every Phase 4 requirement with a state and evidence.

---

## 9. Appendix — Phase 2 closure record

## 0. Phase 2 closure summary

| | |
| --- | --- |
| **Metrics** | **138** total — **135 `Frozen`**, **3 `Draft`**, 0 `Deprecated` |
| **OQ-2** | **CLOSED.** Recognised Revenue is an authoritative Finance/ERP fact that Delivery Intelligence consumes |
| **MC items closed** | MC-1 (via OQ-2), MC-4, MC-9, MC-10, MC-11, MC-12 |
| **MC items moved to configurable calibration** | MC-2, MC-3, MC-6 → 33 named, owned parameters across 7 rule sets |
| **MC items still open as semantic gaps** | MC-5 (intervenability), MC-8 (scope unit) |
| **Tests** | 202 passed, 0 failed, 0 skipped |
| **Gates** | typecheck, architecture, schema, lint, registry validation, secret scan, audit — all pass |
| **Not run** | PostgreSQL. **DR-012 open. No database verification is claimed** |

### 0.1 The three metrics that remain `Draft`

Each is blocked on an unresolved *meaning*, not an undecided threshold — which is the only reason
Decision 8 permits `Draft`.

| Metric | Blocked by | Why it cannot freeze | Owner |
| --- | --- | --- | --- |
| `MET-DEL-012` Scope Completion | **MC-8** | What a "scope unit" is (requirement? story? deliverable?) is undefined, and the answer changes what the number means — two projects counted in different units are not comparable | Delivery + metric owner |
| `MET-QUA-002` Defect Density | **MC-8** | Inherits the same undefined denominator | Delivery + Engineering |
| `MET-PORT-007` Intervention Priority Rank | **MC-5** | "Intervenability" is a concept nobody has specified, not a threshold awaiting a number. Defining it would resolve an open question by inference | Delivery leadership |

Neither MC-8 nor MC-5 blocks Phase 3. `MET-DEL-016` physical completion carries progress everywhere
it is needed, and ranking is a Phase 7 surface. **MC-5 does block AC-1, so Phase 7 cannot ship
without it.**

### 0.2 Revenue semantics — the final separation

| Concept | Metric | Level | Authority | What it is not |
| --- | --- | --- | --- | --- |
| **Contractual Revenue** | `MET-FIN-002` | `L2_DERIVED` | `DERIVED` | Not earned, billed or collected. Excludes identified, submitted and negotiated CRs |
| **Forecast Revenue at Completion** | `MET-FIN-010` | `L2_DERIVED` | `DERIVED` | Not accounting revenue. Contractually effective revenue only |
| **Recognised Revenue — cumulative** | `MET-FIN-009` | `L1_OBSERVED` | `FINANCE_SYSTEM` | **Not computed here.** Never derived from physical completion or Performance-Implied EAC |
| **Recognised Revenue — period** | `MET-FIN-039` | `L1_OBSERVED` | `FINANCE_SYSTEM` | Not derivable from the cumulative figure across a restatement |
| **Invoiced / Billed** | `MET-COM-001` | `L1_OBSERVED` | `FINANCE_SYSTEM` | **Not revenue.** Billing follows milestones; recognition follows policy |
| **Cash Collected** | `MET-COM-002` | `L1_OBSERVED` | `FINANCE_SYSTEM` | **Neither revenue nor billing** |
| **Pending CR Recovery — face value** | `MET-FIN-011` | `L2_DERIVED` | `DERIVED` | Never in base forecast revenue |
| **Pending CR Recovery — expected** | `MET-COM-010` | `L2_DERIVED` | `DERIVED` | A scenario input to `MET-FIN-031` only |

Enforced, not merely documented: `validateRegistry()` rejects any `L1_OBSERVED` metric that claims
`DERIVED` authority, so Delivery Intelligence cannot quietly start authoring an accounting figure it
is supposed to consume.

---

## 1. Phase 2 report

### 1.1 What was built

The canonical model and the semantic metric contract, before any synthetic data or UI — which was
the point. **No metric is computed yet**; Phase 4 owns the engines.

| Artifact | Purpose |
| --- | --- |
| `src/contexts/rules/internal/registry/` | **137 metric definitions**, each with all 15 fields the brief requires, plus `validateRegistry()` with 8 violation classes |
| `METRIC_CATALOG.md` v2.0.0 | 3,870 lines, **generated** from the registry. A hand edit that is not mirrored in the registry fails the build |
| `src/contexts/*/index.ts` | Canonical entities across all 19 contexts — every entity the brief named |
| `migrations/` (8 files, 870 lines) | Schema per context, `NUMERIC` money, two independent immutability controls. **Written and unexecuted — DR-012** |
| `src/platform/persistence/in-memory.ts` | Repository, immutable and append-only stores that enforce the same invariants the database must |
| `src/platform/time/periods.ts` | Calendar / fiscal / reporting / project periods. **Closes DR-011** |
| `src/platform/decimal/fx.ts` | Dated FX with rate type and source; `ConvertedMoney` retains both sides |
| `scripts/ci/check-schema-boundaries.mjs` | Static DDL gate: no cross-schema FK, no float, no money without currency, both immutability controls present. **Closes DR-007** |
| `docs/architecture/DOMAIN-MODEL.md` | ER diagrams: temporal core, snapshot spine, whole model |
| `docs/DATA_DICTIONARY.md` | Every entity, classification, and the metrics it feeds |
| `docs/traceability/PHASE-2-TRACEABILITY.md` | Full report |

### 1.2 Requirement coverage

| REQ ID | State | Evidence |
| --- | --- | --- |
| REQ-DATA-001 | IMPLEMENTED | 19 context surfaces; all 40 brief entities mapped |
| REQ-DATA-002 | IMPLEMENTED | Three baseline types, three tables, no discriminator |
| REQ-DATA-003 | **IMPLEMENTED_WITH_DEBT** | Domain guarantee tested; **DB controls written but unexecuted (DR-012)** |
| REQ-DATA-004 | IMPLEMENTED | `PendingChange` has no status column — the flip is not expressible |
| REQ-DATA-005 | IMPLEMENTED | As-of and as-corrected return different answers, by test |
| REQ-DATA-006 | IMPLEMENTED | Schema gate rejects a money column with no currency |
| REQ-DATA-010 | IMPLEMENTED | Provenance envelope + `assessment_evidence` lineage table |
| REQ-FIN-001 | IMPLEMENTED | `Money` + `financial.money_amount` DOMAIN; gate rejects FLOAT/REAL |
| REQ-HLTH-007 | IMPLEMENTED (model) | Actor, reason, timestamp, expiry all `NOT NULL`; enforcement Phase 5 |
| Others | Unchanged from Phase 1 | — |

**Verification:** 174 tests, 174 passed, 0 failed, **0 skipped**. Six gates green: typecheck,
architecture (45 files), schema (8 migrations), lint, secret scan, `npm audit`.

### 1.3 Deviations from the Phase 2 brief

**Two metric formulas changed, both traceable to the brief itself, both recorded not silent.**

| Metric | From | To | Why |
| --- | --- | --- | --- |
| **MET-FIN-008** EAC | `MET-FIN-005 + MET-FIN-007` | `+ MET-FIN-023 Committed Future Cost` | The brief defines EAC as Actual Cost + Bottom-Up ETC + Committed Future Cost. Committed cost is contractually fixed and is not part of a bottom-up estimate; omitting it understates EAC and overstates margin |
| **MET-FIN-019** VaR | `max(0, contracted margin at risk) per VAR-v1` (placeholder) | `max(0, MET-FIN-026 − MET-FIN-032)` | The brief defines GM Value at Risk concretely. **Resolves MC-4** |

Recorded in `METRIC_CATALOG.md` §13 with reasons, asserted by test, and surfaced as **conflict C-4**
(§1.6) because `ARCHITECTURE_DECISIONS.md` §3.1 and `METRIC_CATALOG.md` §1.3 disagree about whether
a `Draft` formula change needs an ADR. **If you read §3.1 as governing `Draft` formulas too, both
bumps need an ADR before Phase 4 builds engines against them.**

**No new ADR was raised.** ADR-0013 remains `Proposed` and unimplemented.

### 1.4 Decisions the sponsor must confirm

| # | Decision | Why now |
| --- | --- | --- |
| **C-4** | Are the two formula version bumps acceptable under `METRIC_CATALOG.md` §1.3, or do they need an ADR? | Phase 4 builds engines against them |
| **OQ-2** | Revenue recognition method | **Still the highest-impact open item.** 4 metrics `Draft`; the model is ready for either answer |
| **OQ-4 / MC-2, MC-3** | Health dimension weights and `HEALTH-v1` thresholds | 12 metrics `Draft`; blocks the catalog freeze and all of Phase 4 |
| **MC-5, MC-6, MC-8** | Intervenability factor, deterioration threshold, scope unit | 6 metrics `Draft` |
| **SP-1, SP-2** | Phase 3 portfolio scale (48 vs 75) and scenario set (10 archetypes vs 8 letters) | ADR-0013; blocks all of Phase 3 |
| D-1 | Technology baseline | Now deeply committed — 45 source files and 8 migrations |
| D-2 | Half-up rounding | Implemented and tested; confirm before Phase 4 golden fixtures |
| D-4 | Read-auditing of commercial data | Confirm before Phase 5 builds it |

### 1.5 Debt register

| ID | Item | State | Owner | Target | Risk |
| --- | --- | --- | --- | --- | --- |
| DR-001 | CI pipeline | PARTLY CLOSED | Platform | — | 7 gates live; a11y, token lint, generator validation, golden-fixture review deferred to their phases |
| DR-002 | No MFA / SSO | DEFERRED | Security | Post-POC | — |
| DR-003 | No audit retention policy | DEFERRED | Security | Post-POC | — |
| DR-004 | No E2E browser tests | DEFERRED | QA | Post-POC | — |
| DR-005 | Catalog not `Frozen` | **CLOSED** | Metrics owner | — | 135 of 138 `Frozen`. The 3 remaining are Type A semantic gaps with named owners, not calibration gaps |
| DR-006 | No penetration test | DEFERRED | Security | Post-POC | — |
| DR-007 | Cross-context FK check | **CLOSED (statically)** | Platform | — | Live query still owed once a database exists |
| DR-008 | TS permits `<`/`>` on `Money` | IMPLEMENTED_WITH_DEBT | Platform | 4 | `Money.compare()` is the API |
| DR-009 | No backup/DR; RPO/RTO unowned | DEFERRED | CTO / CISO | Post-POC | — |
| DR-010 | Presentation is a shell | STUBBED | Frontend | 6 | — |
| DR-011 | Period arithmetic stubbed | **CLOSED** | Platform | — | Calendar is data; OQ-5 stays open without blocking |
| **DR-012** | **Migrations written but never executed** | **OPEN — HARD PHASE 4 GATE** | Platform | **before Phase 4** | No PostgreSQL or running Docker. **REQ-DATA-003's authoritative control is unverified and no DB verification is claimed.** Does not block Phase 3. **Must close before Phase 4 begins authoritative engine/database integration**, and closure requires real PostgreSQL execution of: the migrations; the As-Sold immutability trigger; the revoked mutation privileges; `NUMERIC` precision behaviour; temporal constraints; the key `CHECK` constraints; schema ownership and boundary controls; required indexes; and reference-integrity behaviour. Verification queries are in `migrations/README.md`. **Do not fake execution if the runtime stays unavailable** |
| **DR-013** | Margin bridge causes not decomposed | **NEW** | Finance | 9 | AC-4 unproven until Phase 9 |
| **DR-014** | No PostgreSQL repository implementations | **NEW** | Platform | 5 | Only in-memory stores exist |

### 1.6 Conflicts encountered

| ID | Conflict | Disposition |
| --- | --- | --- |
| **C-4** | §3.1 made any formula change ADR-mandatory; `METRIC_CATALOG.md` §1.3 permitted `Draft` changes in Phase 2 | **CLOSED** by closure Decision 10. `ARCHITECTURE_DECISIONS.md` §3.3 now states the Draft carve-out and its five conditions. MET-FIN-008 and MET-FIN-019 approved without retrospective ADRs |
| **C-5** | Performance-Implied EAC uses cost-to-cost arithmetic while OQ-2 was open | **CLOSED** by closure Decisions 1 and 3. It is a diagnostic; recognition is a Finance fact |
| **C-6** | **OPEN — needs a decision.** Closure Decision 6 says *System Health → `L3_ASSESSED`*. ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 name "health score" as the canonical **L2** example | **Not resolved by inference.** Health kept `L2_DERIVED`; **ADR-0014 raised (`Proposed`)** with both cases and a third split option. Nothing is blocked — the level is a labelling and rendering decision. **Decide before Phase 6; ideally before Phase 4 stamps provenance envelopes onto stored health results** |
| C-1, C-2 | Carried from Phase 1 | ADR-0011/0012 still `Proposed` |
| C-3 | Portfolio project count | **CLOSED.** ADR-0013 `Accepted`, explicit approval confirmed before Phase 4 |

### 1.7 Acceptance gate

**Ten key metrics recomputed independently from their definitions** —
`tests/golden/definition-recomputation.test.ts`, on a worked fixed-bid project. Every expected value
was computed by hand from `METRIC_CATALOG.md` and is stated in a comment beside its assertion.

| # | Metric | Hand-computed | Verified |
| --- | --- | --- | --- |
| 1 | MET-FIN-002 Contract Value (CC) | 10,500,000.00 | ✅ pending 280,000 excluded |
| 2 | MET-FIN-008 EAC | 8,550,000.00 | ✅ 5.2M + 3.1M + 0.25M |
| 3 | MET-FIN-024 Forecast GM $ | 1,950,000.00 | ✅ |
| 4 | MET-FIN-014 Forecast GM % | 0.185714 | ✅ vs 24.0% sold |
| 5 | MET-FIN-025 GM Erosion $ | 450,000.00 | ✅ exactly −MET-FIN-017 |
| 6 | MET-FIN-029 Performance-Implied EAC | 10,000,000.00 | ✅ |
| 7 | MET-FIN-030 ETC Optimism Gap | 1,450,000.00 | ✅ clamped at 0 when prudent |
| 8 | MET-FIN-034 Contingency Burn Gap | 0.30 (82% − 52%) | ✅ |
| 9 | MET-RSK-008 Incremental Risk Exposure | 180,000.00 | ✅ vs 280,000 gross — the double count avoided |
| 10 | MET-FIN-019 GM Value at Risk | 518,000.00 | ✅ |

**No duplicate or conflicting definition exists in the repository.** `validateRegistry()` fails on a
duplicate ID *or* a duplicate formula-and-input pair, and it returns empty across all 137 metrics.
`METRIC_CATALOG.md` is generated from the same registry, so document and code cannot disagree.

---

## 2. Open questions carried forward

| ID | Question | Blocks | Must resolve by |
| --- | --- | --- | --- |
| **OQ-2** | **Revenue recognition method** | — | **CLOSED.** Delivery Intelligence consumes the Finance fact; it does not set accounting policy |
| **MC-1, MC-4, MC-9, MC-10, MC-11, MC-12** | — | — | **CLOSED in Phase 2** |
| OQ-1 | Reporting currency + FX source | Portfolio aggregate presentation | Phase 3. Model is ready — every rate carries type, date and source; nothing defaults |
| OQ-3 | Cost rates visible to Delivery Managers? | Authorization matrix | Phase 5 |
| **OQ-4 / MC-2** | Health dimension weights | **No metric — now 6 named parameters in `HealthModelVersion`** | Phase 4 (before engines compute health) |
| OQ-5 | Fiscal calendar | Nothing — calendar is data | Whenever the sponsor chooses |
| **MC-3** | `HEALTH-v1` band edges and critical-breach triggers | **No metric — 4 named `HEALTH-v1` parameters** | Phase 4 |
| **MC-6** | Deterioration threshold and SDI weights | **No metric — 10 named `TRAJECTORY-v1` parameters** | Phase 3 (calibrate against generated data) |
| **MC-5** | `PRIORITY-v1` **intervenability definition** | `MET-PORT-007` — the only metric still Draft on a ranking gap | **Phase 7 (blocks AC-1)** |
| **MC-8** | **Scope-unit definition** | `MET-DEL-012`, `MET-QUA-002` | Phase 4. Neither blocks Phase 3 |
| **C-6 / ADR-0014** | Epistemic level of composite health and System-Assessed RAG | Rendering register, not computation | **Before Phase 6; ideally before Phase 4** |
| SP-1, SP-2 | Portfolio scale; scenario set | — | **CLOSED.** Resolved by ADR-0013, explicitly accepted |
| DQ-1…DQ-10 | Architecture deferrals | Per `DEFERRED-DECISIONS.md` | Phases 4, 7, post-POC |

**The shape of what changed:** MC-2, MC-3 and MC-6 used to block 26 metrics. They now block **zero
metrics** and instead sit as 33 named, owned parameters in versioned rule sets. Changing one changes
a number; it no longer changes what anything *means*.

---

## 3. Handoff to Phase 3 — Synthetic Portfolio & Scenario Generator

### 3.1 Artifacts Phase 3 must consume

1. `CLAUDE.md` — invariants and precedence
2. **`docs/adr/ADR-0013`** — the proposed portfolio revision. **Confirm SP-1 and SP-2 before generating**
3. `SYNTHETIC_DATA_SPEC.md` — currently v1.0.0 (48 projects, 10 archetypes, weekly, 18 months)
4. `METRIC_CATALOG.md` v2.0.0 — 137 definitions; note which 33 are `Draft`
5. `src/contexts/*/index.ts` — the canonical types to generate into
6. `src/platform/persistence/` — the in-memory stores to generate against
7. `TEST_STRATEGY.md` §6 — generator test obligations

### 3.2 What Phase 3 owes

| # | Deliverable | Requirement |
| --- | --- | --- |
| 1 | Seeded generator producing byte-identical output from a fixed seed | REQ-DATA-007 |
| 2 | Every archetype in the accepted `SYNTHETIC_DATA_SPEC.md` present and findable | REQ-DATA-008 |
| 3 | Causal generation — symptoms generated *from* causes, arithmetically | G2 |
| 4 | Cross-domain reconciliation assertions holding | G3 |
| 5 | 78 weekly snapshots per active project | G4, ADR-0003 |
| 6 | `MANIFEST.json` with seed, generator version, record counts, content hash | REQ-DATA-007 |
| 7 | Deliberate imperfection by seeded rule (G7) | REQ-DQ-001 |
| 8 | Data validation report; validation failure **fails the build** | TEST_STRATEGY §6 |
| 9 | Calibration of MC-6 against the generated series | MC-6 |
| 10 | Traceability report + updated `PHASE_HANDOFF.md` | REQ-GOV-007 |

### 3.2a Constraints Phase 3 must honour

1. **Do not compute Recognised Revenue.** Generate it as an authoritative accounting fact
   (`RecognisedRevenueFact`) using the documented `RECOGNITION-v1` synthetic policy, and stamp that
   policy id on every row. Never derive it from physical completion or Performance-Implied EAC.
2. **Generate L1 facts, not derived metrics.** The 135 `Frozen` definitions are what Phase 4 will
   compute *from* the data. A generator that writes a Forecast GM figure creates a second, competing
   truth.
3. **Do not write RAG, health scores or trajectory into the data.** Those are `L2_DERIVED` and
   `L3_ASSESSED` outputs. `MET-HLTH-012` Reported RAG is the exception — it is an `L1_OBSERVED`
   declaration by a delivery manager and *must* be generated.
4. **Weekly snapshots, per ADR-0003.** `trajectoryWindowWeeks` is settled at 8; a monthly series
   cannot fill it.
5. **Calibrate MC-6 against the generated series** and record the values into `TRAJECTORY-v1`. That
   is the one calibration item Phase 3 owns.
6. **Every fact row carries `synthetic: true`** — a `CHECK` constraint, so real data is unstorable.
7. **Do not freeze `MET-DEL-012`, `MET-QUA-002` or `MET-PORT-007`** by inventing a scope unit or an
   intervenability factor to make generation easier.

### 3.3 What Phase 3 must NOT do

- **Do not generate before SP-1 and SP-2 are answered.** ADR-0013 is `Proposed`; generating under
  either reading creates a seed and a content hash that everything downstream depends on.
- Do not implement metric engines — Phase 4.
- Do not build UI. Do not introduce an LLM or a network dependency.
- **Do not resolve OQ-2 by generating recognised revenue.** Leave `recognisedRevenue` absent, as the
  model does.
- Do not adjust generated data to make a screen look better (`SYNTHETIC_DATA_SPEC.md` §9.4).
- Do not add a metric to the registry without a definition, an owner and evidence expectations —
  `validateRegistry()` will reject it, which is the point.

### 3.4 The trap Phase 3 must avoid

**Generating a narrative rather than a cause.** `SYNTHETIC_DATA_SPEC.md` §9.7 names it: a project
labelled "deteriorating" whose underlying series does not deteriorate. The model now makes the
honest version straightforward — `ProgressClaim`, `ActualCost`, `EffortRecord.isRework` and
`Risk.probability` are all present as L1 facts, so a symptom can be *produced* by moving a cause
rather than asserted alongside one. The dishonest version is still easier, and it is exactly what an
informed audience finds.

### 3.5 Phase 3 is done when

- The same seed produces an identical content hash, proven by test.
- Every archetype in the accepted spec is present, findable, and named in the demo script.
- Cross-domain assertions hold: effort × rates ≈ labour cost; invoiced ≤ recognised + tolerance;
  margin bridge causes sum to the total.
- Every generated project has ≥ 78 weekly snapshots where its lifecycle permits.
- No real-world name appears; every fact row carries `synthetic: true`.
- MC-6's deterioration threshold is calibrated against real generated series and recorded.
- The traceability report accounts for every Phase 3 requirement with a state and evidence.
