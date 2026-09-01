# Requirement Traceability Report — Phase 2: Canonical Data Model & Semantic Metric Contract

- **Phase:** 2
- **Date:** 2026-08-29
- **Author:** Principal Data Architect / Financial Systems Architect / Delivery Governance SME
- **Requirements in scope:** REQ-DATA-001…006, REQ-DATA-010, REQ-FIN-001, plus continuous
  REQ-DATA-009, REQ-SEC-008, REQ-GOV-005/006/007
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md` v1.0.0, `SECURITY_MODEL.md`, `SYNTHETIC_DATA_SPEC.md`, `TEST_STRATEGY.md`,
  `DEFINITION_OF_DONE.md`, `PHASE_HANDOFF.md`, `docs/adr/ADR-0001`…`ADR-0013`

---

## 1. Requirement coverage

| REQ ID | Requirement (short) | State | Evidence | Verification | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-DATA-001 | Canonical entities for every named noun | `IMPLEMENTED` | `src/contexts/*/index.ts` (19 surfaces), `migrations/0002`–`0008` | unit | ✅ 174 tests | All 40 entities in the Phase 2 brief modelled; mapping in §2 |
| REQ-DATA-002 | Three baselines as distinct, non-substitutable structures | `IMPLEMENTED` | `src/contexts/contract/index.ts:70-120`, `migrations/0004` | unit | ✅ `temporal-model.test.ts` (5) | Three types and three tables, not one table with a discriminator |
| REQ-DATA-003 | As-Sold immutable **at the persistence layer** | **`IMPLEMENTED`** | `migrations/0004:44-52`, `scripts/db/verify-postgres.mjs` | integration | ✅ | *(Updated after Phase 3: verified against real PostgreSQL 16.13. UPDATE and DELETE both rejected by the trigger against the table owner, and by revoked privilege against `gldi_app`. DR-012 CLOSED.)* |
| REQ-DATA-004 | Executed vs pending structurally distinct; pending cannot enter forecast | `IMPLEMENTED` | `src/contexts/contract/index.ts:122-160`, `migrations/0004:76-104` | golden | ✅ `temporal-model.test.ts` (4), `definition-recomputation.test.ts` | `PendingChange` has **no status column** — the flip is not expressible |
| REQ-DATA-005 | Append-only weekly snapshots enable as-of reconstruction | `IMPLEMENTED` | `src/platform/persistence/in-memory.ts:120-165`, `migrations/0003:48-70` | integration | ✅ `temporal-model.test.ts` (6) | As-of and as-corrected are separate methods returning different answers |
| REQ-DATA-006 | Every monetary value carries currency; FX explicit and dated | `IMPLEMENTED` | `src/platform/decimal/fx.ts`, `scripts/ci/check-schema-boundaries.mjs` | golden | ✅ `edge-cases.test.ts` (6) | Static gate rejects a money column with no currency beside it |
| REQ-DATA-010 | Lineage: inputs, rule version, computation timestamp | `IMPLEMENTED` | `src/platform/provenance/index.ts`, `migrations/0007:150-160` | integration | ✅ `provenance.test.ts` (8) | `assessment_evidence` table cites the exact snapshot rows read |
| REQ-FIN-001 | Decimal-safe money; float impossible by construction | `IMPLEMENTED` | `src/platform/decimal/money.ts`, `migrations/0001:44-52` | unit | ✅ `money.test.ts` (22) + 8 compile-time | `financial.money_amount` DOMAIN; schema gate rejects FLOAT/REAL |
| REQ-DATA-009 | No real client, person, or financial data | `IMPLEMENTED` | `CHECK (synthetic)` on every fact table; `scripts/ci/secret-scan.mjs` | integration | ✅ 0 findings | A real-data row is not storable, not merely discouraged |
| REQ-SEC-008 | No secret material; configuration externalised | `IMPLEMENTED` | `src/platform/config/index.ts` | integration | ✅ | Unchanged from Phase 1 |
| REQ-GOV-005/006 | Boundaries enforced by build | `IMPLEMENTED` | `architecture/`, `scripts/ci/check-schema-boundaries.mjs` | integration | ✅ 40 tests | Extended: schema boundaries now gated too (closes DR-007 statically) |
| REQ-GOV-007 | Phase ends with handoff and debt register | `IMPLEMENTED` | This file, `PHASE_HANDOFF.md` | manual | ✅ | — |
| REQ-HLTH-007 | Overrides require actor, reason, timestamp, expiry | `IMPLEMENTED` (model) | `src/contexts/health/index.ts`, `migrations/0007:196-210` | integration | ✅ schema gate | All four fields `NOT NULL` + `CHECK (expires_at > applied_at)`. Enforcement Phase 5 |

### 1.1 Phase 2 deliverables from the brief

| Deliverable | State | Evidence |
| --- | --- | --- |
| `METRIC_CATALOG.md` fully populated | `IMPLEMENTED_WITH_DEBT` | 3,870 lines, **137 metrics**, generated from the registry. **Not `Frozen`** — 33 remain `Draft` (§6) |
| ER / domain diagram | `IMPLEMENTED` | `docs/architecture/DOMAIN-MODEL.md` |
| Migrations | `IMPLEMENTED_WITH_DEBT` | `migrations/` — 8 files, 870 lines. **Written, reviewed, unexecuted (DR-012)** |
| Typed entities / interfaces | `IMPLEMENTED` | 45 source files; 19 context surfaces populated |
| Metric IDs / enums / constants | `IMPLEMENTED` | `src/contexts/rules/internal/metric-types.ts`, branded `MetricId` |
| Semantic metric interfaces | `IMPLEMENTED` | `MetricDefinition` with all 15 brief-required fields |
| Seed-independent repositories | `IMPLEMENTED` | `src/platform/persistence/` — contracts + in-memory implementations |
| Validation constraints | `IMPLEMENTED` | `validateRegistry()` (8 violation classes) + 47 SQL `CHECK` constraints |
| Validation tests | `IMPLEMENTED` | 174 passing (§3) |
| Data dictionary | `IMPLEMENTED` | `docs/DATA_DICTIONARY.md` |
| `PHASE_HANDOFF.md` | `IMPLEMENTED` | Rewritten |

### 1.2 Coverage summary

| State | Count |
| --- | --- |
| IMPLEMENTED | 18 |
| IMPLEMENTED_WITH_DEBT | 4 |
| MOCKED | 0 |
| STUBBED | 0 |
| DEFERRED | 0 |
| BLOCKED | 0 |
| **Total in scope** | **22** |

---

## 2. Canonical entity mapping

Every entity named in the Phase 2 brief, and where it landed. No entity was dropped; none was
placed in a context that would require a new dependency.

| Brief entity | Context | Notes |
| --- | --- | --- |
| Organization, OrganizationHierarchySnapshot, Region, Industry, Customer, Account | `organization` | Hierarchy snapshotted so as-of rollups traverse the structure that existed then |
| FiscalCalendar, ReportingPeriod | `organization` + `platform/time` | Calendar is *data*; arithmetic is a pure platform function. **Closes DR-011 without answering OQ-5** |
| Portfolio | `portfolio` | Plus `Program`, `PortfolioMembership` |
| Project, ProjectSnapshot | `project` | `ProjectSnapshot` is the weekly spine all others key to |
| Contract, ProjectBaseline, BaselineRevision, ScopeBaseline, ChangeRequest | `contract` | `ProjectBaseline` realised as three distinct types per ADR-0003 |
| FinancialSnapshot, FXRate | `financial` | Plus `ActualCost`, `EtcLineItem`, `Commitment`, `ContingencyDrawdown` |
| DeliverySnapshot, Milestone, Dependency | `delivery` | Plus `ScopeItem`, `ProgressClaim` |
| CommercialExposure | `commercial` | Plus `Invoice`, `Payment`, `CommercialSnapshot` |
| QualitySnapshot | `quality` | Plus `Defect`, `AcceptanceItem`, `ReleaseRecord` |
| ResourceSnapshot | `resource` | Plus `Assignment`, `EffortRecord`, `OpenRole` |
| Risk | `risk` | Plus `Mitigation`, `Intervention`, `RiskSnapshot` |
| RecoveryAction, RecoveryScenario | `recovery` | Plus `RecoveryPlan`, `RecoveryProgress` |
| AssuranceReview, EvidenceRecord | `assurance` | `EvidenceRecord` placed here (owns "evidence retention"); `health` emits platform `RecordRef` and the app layer links them, so no new dependency |
| EarlyWarning | `forecast` | L3 — it is a detected signal, not a review finding |
| HealthAssessment | `health` | Carries `snapshotRefs` and both rule versions |
| TrajectoryAssessment, ForecastSnapshot | `forecast` | L3 per ADR-0011 |
| RuleDefinition, RuleEvaluation, MetricDefinition, MetricVersion, HealthModelVersion | `rules` | Registry placed here: tier 0, so no owning context can fork another's metric |
| DataQualityAssessment, DataFreshness | `data-quality` | Plus `DomainObservation` probe port |
| DataSource | `integration` | Plus `StagedRecord`, `SourceFreshness` |
| AuditEvent | `platform/audit` | Named `AuditRecord`, matching `SECURITY_MODEL.md` §5.2 field for field |
| User, Role, AuthorizationPolicy | `identity` + `platform/authz` | `AuthorizationPolicy` is a platform contract so the app layer can depend on it and no context can |

---

## 3. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | 71 | 71 | 0 | 0 |
| golden | 43 | 43 | 0 | 0 |
| integration | 60 | 60 | 0 | 0 |
| authz | 0 | 0 | 0 | 0 |
| a11y | 0 | 0 | 0 | 0 |
| **Total** | **174** | **174** | **0** | **0** |

Build gates:

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (strict, 8 compile-time `Money` assertions) | ✅ clean |
| `npm run check:architecture` | ✅ 45 files, 0 violations |
| `npm run check:schema` | ✅ 8 migrations, 13 insert-once tables, 0 violations |
| `npm run lint` | ✅ 0 problems |
| `node scripts/ci/secret-scan.mjs` | ✅ 0 findings |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |

**Failures:** none. **Skipped:** none.

### 3.1 Defects the new gates caught during this phase

Recorded because a gate that has never fired proves nothing:

| Gate | Caught |
| --- | --- |
| `validateRegistry()` | `MET-DEL-006` was a variance naming no baseline; `MET-DQ-006` was `Frozen` while depending on a `Draft` metric; `MET-PORT-003` named no baseline |
| `check-schema-boundaries.mjs` | `delivery.delivery_snapshot` stored money with no currency column |
| `metric-registry.test.ts` | `MET-DEL-003`'s business definition restated a metric ID instead of defining it in prose |

All four were real defects in this phase's own work and were fixed, not suppressed.

---

## 4. Invariant compliance

| # | Invariant | Held? | Evidence |
| --- | --- | --- | --- |
| 3 | No silent change to formulas or definitions | ✅ | Two version bumps and six wording refinements recorded in `METRIC_CATALOG.md` §13 and asserted by test. See **C-4** |
| 5 | No false completion claims | ✅ | REQ-DATA-003 reported `IMPLEMENTED_WITH_DEBT`, not `IMPLEMENTED`, because the DB half is unexecuted |
| 6 | Decimal-safe, server-side financial computation | ✅ | `Money`; `financial.money_amount` DOMAIN; schema gate rejects FLOAT/REAL |
| 7 | Server-side authorization only | ✅ | Unchanged. No authorization logic entered any context |
| 8 | L1/L2/L3 separation intact | ✅ | Every metric declares a layer; test asserts no L1 metric depends on a derived one |
| 9 | AI is not calculator or system of record | ✅ | Unchanged; `ai-intelligence` still imports nothing |
| 10 | Modular monolith with strict contexts | ✅ | 45 files, 0 boundary violations; no new cross-context dependency added |
| 11 | `DEMO — SYNTHETIC DATA` labelling | ✅ | `CHECK (synthetic)` on every fact table; catalog header carries the marker |

---

## 5. Proposed deviations / ADRs

**No new ADR was raised in Phase 2.** ADR-0013 (revised demo portfolio) remains `Proposed` from the
Phase 3 attempt and is **not implemented** — no portfolio data was generated.

Two metric formulas were version-bumped rather than ADR'd. The reasoning is in **C-4** below; if the
sponsor disagrees with that reading, both bumps should become an ADR before Phase 4 builds engines
against them.

---

## 6. Conflicts encountered

| ID | Conflict | Precedence applied | Resolution |
| --- | --- | --- | --- |
| **C-4** | `ARCHITECTURE_DECISIONS.md` §3.1 makes "changing any metric formula" ADR-mandatory. `METRIC_CATALOG.md` §1.3 says a `Draft` definition "may still change in Phase 2", and `PHASE_HANDOFF.md` §3.2 makes freezing the catalog a Phase 2 deliverable — which is impossible without settling definitions | §3.1 read as governing *accepted/frozen* formulas; §1.3 as the explicit Phase 2 window for `Draft` ones | Two formulas changed (**MET-FIN-008** EAC gains Committed Future Cost; **MET-FIN-019** VaR gains the brief's concrete definition). **Both recorded with version bumps and reasons in `METRIC_CATALOG.md` §13**, both traceable to the Phase 2 brief's own authoritative statements. Surfaced here for approval rather than assumed |
| **C-5** | The Phase 2 brief names Performance-Implied EAC = Actual Cost / Physical Completion %, which is cost-to-cost arithmetic. OQ-2 (revenue recognition method) is still open | `PRODUCT_SPEC.md` §9 keeps OQ-2 open; the brief defines a *diagnostic*, not a recognition method | Treated as distinct. MET-FIN-029 is a performance check and is `Frozen`; MET-FIN-006/009/015 remain `Draft` and **BLOCKED**. Adopting one as the other would resolve OQ-2 by inference |
| C-1, C-2, C-3 | Carried from Phase 1 (Portfolio tier, Forecast layer, project count) | Unchanged | ADR-0011/0012/0013 still `Proposed` |

---

## 7. Debt register delta

| ID | Item | State | Owner | Target | Risk |
| --- | --- | --- | --- | --- | --- |
| DR-005 | Metric catalog not `Frozen` | **BLOCKED → partially reduced** | Metrics owner | 2/3 | 104 of 137 metrics are `Frozen`; **33 remain `Draft`**, blocked on MC-2/3/5/6/8 and OQ-2 |
| **DR-007** | No automated cross-context FK check | **CLOSED (statically)** | Platform | — | `scripts/ci/check-schema-boundaries.mjs` parses the DDL and fails on any cross-schema FK. Weaker than the live query in `migrations/README.md`; that difference is DR-012 |
| **DR-011** | Period / fiscal-calendar arithmetic stubbed | **CLOSED** | Platform | — | Implemented with the calendar as data, so OQ-5 stays open without blocking |
| **DR-012** | **Migrations written but never executed** | **NEW — DEFERRED** | Platform | 5 | No PostgreSQL or running Docker in this environment. The DB-level immutability controls (REQ-DATA-003) are **unverified**. The domain-level guarantee is tested; the authoritative one is not |
| **DR-013** | **`MET-FIN-018` margin bridge causes not yet decomposed** | **NEW — DEFERRED** | Finance | 9 | The metric is defined and its causes named, but AC-4 (causes sum exactly) is unproven until Phase 9 |
| **DR-014** | **No repository implementation against PostgreSQL** | **NEW — DEFERRED** | Platform | 5 | Only in-memory implementations exist. Phase 3 can generate against them; Phase 5 must add the real adapters |
| DR-001…004, 006, 008–010 | Unchanged from Phase 1 | — | — | — | — |

---

## 8. Open questions

| ID | Question | Status | Blocks |
| --- | --- | --- | --- |
| OQ-1 | Reporting currency + FX source | **Open** | Portfolio aggregates. Model is ready: `FxRate` carries type, date and source; nothing defaults |
| OQ-2 | Revenue recognition method | **Open — highest impact** | MET-FIN-006/009/015, MET-COM-006. 4 metrics `Draft` |
| OQ-3 | Cost rates visible to Delivery Managers? | Open | Phase 5 authorization matrix |
| OQ-4 / MC-2 | Health dimension weights | Open | MET-HLTH-001…006, 010. 7 metrics `Draft` |
| OQ-5 | Fiscal calendar | **Open but no longer blocking** | Calendar is data; DR-011 closed |
| MC-3 | `HEALTH-v1` thresholds | Open | MET-HLTH-011/013/030/031/032. 5 metrics `Draft` |
| **MC-4** | `VAR-v1` value-at-risk rules | **RESOLVED** | Defined by the Phase 2 brief; MET-FIN-019 v2.0.0 |
| MC-5 | `PRIORITY-v1` intervenability | Open | MET-PORT-007 |
| MC-6 | Deterioration threshold | Open | MET-FCST-002/010, MET-PORT-006. Calibrated in Phase 3 |
| MC-8 | Scope-unit definition | Open | MET-DEL-012, MET-QUA-002 |
| **MC-9** | Contingency definition | **RESOLVED** | MET-FIN-034/035/036/037 |
| **MC-10** | Physical completion | **RESOLVED** | MET-DEL-015/016/017 — modelled as a recorded claim with basis and author |
| **MC-11** | Risk-adjusted GM | **RESOLVED** | MET-FIN-031/032/033, MET-RSK-008, MET-COM-010 |
| **MC-12** | Acceptance latency and blockers | **RESOLVED** | MET-QUA-010/011 |
| SP-1, SP-2 | Phase 3 portfolio scale and scenario set | **Open** | All of Phase 3 (ADR-0013) |
| DQ-1…DQ-10 | Carried forward | Open | Per `docs/architecture/DEFERRED-DECISIONS.md` |

**Four of the eight MC items are now resolved**, all four by definitions the Phase 2 brief supplied.
The remaining four are calibration values that need a human owner, not a formula.

---

## 9. Handoff

- **What now exists:** 137 metric definitions in a validated registry with `METRIC_CATALOG.md`
  generated from it; canonical entities across all 19 contexts; 8 migration files with two
  independent immutability controls; in-memory persistence enforcing the same invariants; period and
  FX arithmetic; 174 passing tests.
- **What Phase 3 consumes:** the canonical types, the registry, the in-memory stores, and the fixed
  as-of date.
- **What Phase 3 must NOT assume:** that the catalog is frozen (33 metrics are not); that ADR-0013
  is accepted; that the migrations run; that OQ-2 has an answer.
- **`PHASE_HANDOFF.md` updated:** yes.

---

## 10. Self-review

- [x] **Is any `IMPLEMENTED` claim resting on a UI that merely looks right?** No UI exists.
- [x] **Is any golden fixture's expected value generated from the implementation it tests?** No. The
      ten acceptance-gate values in `definition-recomputation.test.ts` were computed by hand from the
      catalog and are stated in comments beside each assertion. There is no engine to generate them
      from — and the file says so, rather than implying a stronger guarantee than it provides.
- [x] **Is any authorization claim verified only through the UI?** No authorization was implemented.
- [x] **Did any formula change without an ADR?** Two did, under `METRIC_CATALOG.md` §1.3's Phase 2
      window, both recorded with reasons and both surfaced as **C-4** for approval. If the sponsor
      reads §3.1 as governing `Draft` formulas too, these need an ADR before Phase 4.
- [x] **Is any mock unlabelled?** No mocks. Every context surface carries an `IMPLEMENTATION_STATE`.
- [x] **If a claim in this report is wrong, would we find out now — or in front of the client?**
      Now, for the 174 tested claims and the four gates. **The exception is REQ-DATA-003:** the
      database-level immutability control is written and unexecuted, so if the DDL is wrong we find
      out in Phase 5. That is why it is `IMPLEMENTED_WITH_DEBT` and DR-012 exists.
