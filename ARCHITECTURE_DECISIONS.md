# ARCHITECTURE_DECISIONS.md — Decision Log & Process

**Status:** Approved baseline (Phase 0), extended by Phase 1
**Version:** 1.2.0

**Phase 1 added:** seven proposed ADRs (0006–0012), mechanical enforcement of §4.1, and the
architecture blueprint in [`docs/architecture/`](docs/architecture/README.md).

**Phase 2 closure added:** §3.3 metric formula governance (closing conflict C-4) and §3.4 the
cross-context referential integrity policy.

This file is the **index and process contract**. The decisions themselves live in `docs/adr/`.
An architectural change that is not recorded here as an accepted ADR did not happen and must be
reverted.

---

## 1. Why ADRs, specifically for this build

This POC has a failure mode more dangerous than bugs: **plausible drift.** A later phase, acting
reasonably and locally, replaces a boundary, re-derives a formula, or "simplifies" a security
control — and the result still demos beautifully while no longer being the product that was
approved. ADRs make drift *expensive and visible* rather than *cheap and silent*.

The rule is therefore not "write an ADR when you make a big decision." It is:

> **If you are about to do something a future reader would be surprised by, stop and write the ADR
> first. If you cannot write the ADR, you do not yet understand the change well enough to make it.**

---

## 2. ADR states

| State | Meaning | May code depend on it? |
| --- | --- | --- |
| `Proposed` | Written, not yet approved | **No** |
| `Accepted` | Approved and binding | Yes |
| `Superseded by ADR-NNNN` | Replaced; retained for history | No — read the successor |
| `Deprecated` | No longer applies, no successor | No |
| `Rejected` | Considered and declined; retained so it is not re-proposed | No |

ADRs are **never deleted and never edited in substance** once accepted. Change is expressed by a new
ADR that supersedes the old one. Typo and link fixes are permitted.

---

## 3. Process

1. **Copy** `docs/adr/ADR-TEMPLATE.md` to `docs/adr/ADR-NNNN-short-kebab-title.md`.
2. Number sequentially. Never reuse a number, even for a rejected ADR.
3. Write it with **Status: Proposed**.
4. Add a row to the register in §5 of this file.
5. Raise it explicitly in the phase report under "Proposed Deviations". **An ADR that is not
   surfaced in a phase report is not approved, regardless of what the file says.**
6. On approval, change Status to `Accepted` and record the date and approver.
7. Only then implement.

### 3.1 When an ADR is mandatory

- Adding, removing, merging or splitting a bounded context
- Changing a dependency direction between contexts
- Changing persistence technology, schema strategy, or the temporal/snapshot model
- Changing the money representation, rounding policy, or FX approach
- Changing any metric formula, health rule structure, or RAG threshold *mechanism*
  (threshold *values* are config, governed by `METRIC_CATALOG.md`) — **see §3.3 for the one carve-out**
- Changing the authorization model, trust boundaries, or audit scope
- Introducing any external service, network dependency, or model provider
- Changing the L1/L2/L3 layering or the AI boundary
- Adding a runtime, language, or heavyweight framework
- Deviating from the modular monolith

### 3.2 When an ADR is *not* needed

Implementation detail within an accepted boundary: file layout inside a context, choice of internal
helper, test structure, component decomposition, naming within a module.

### 3.3 Metric formula governance — the Draft carve-out

Added in the Phase 2 closure (Decision 10) because §3.1 and `METRIC_CATALOG.md` §1.3 previously
disagreed, and the disagreement was reported as conflict **C-4** rather than resolved by inference.

**Changing a `Frozen` metric formula requires an ADR.** No exceptions: a frozen formula has
downstream implementations, stored historical results, and golden fixtures that assert it.

**A `Draft` metric may be refined during its designated definition-and-freeze phase without a
dedicated ADR**, provided *all* of the following hold:

1. the metric version is incremented;
2. the rationale is recorded in the version history (`METRIC_VERSION_HISTORY`), not only in a commit
   message;
3. dependent definitions are revalidated — `validateRegistry()` must still return empty;
4. golden fixtures are recomputed **independently**, not regenerated from the implementation
   (`DEFINITION_OF_DONE.md` §3.1);
5. no released downstream implementation depends on the prior meaning.

Phase 2's designated freeze phase is Phase 2 itself. On that basis the following are **approved
without a retrospective ADR**:

| Metric | Change | Version |
| --- | --- | --- |
| `MET-FIN-008` | EAC gains Committed Future Cost | 2.0.0 |
| `MET-FIN-019` | GM Value at Risk given its concrete formula (resolves MC-4) | 2.0.0 |
| `MET-FIN-009` | Recognised Revenue becomes an imported Finance fact (resolves OQ-2) | 2.0.0 |
| `MET-FIN-006` | Renamed to Cost Progress Ratio; arithmetic unchanged | 2.0.0 |
| `MET-HLTH-004` | Blocked input swapped for an unblocked one | 2.0.0 |
| `MET-PORT-006`, `MET-DQ-007` | Reclassified to `L3_ASSESSED`; arithmetic unchanged | 2.0.0 |

**Conflict C-4 is closed.** After Phase 2, every metric except the three listed in
`METRIC_CATALOG.md` §14 is `Frozen`, so §3.1 applies to essentially the whole catalog from here.

### 3.4 Cross-context referential integrity policy

Added in the Phase 2 closure (Decision 13). It restates, as a standing rule, what ADR-0001
§Decision 3 and ADR-0007 already require.

**Inside a bounded context:** physical relational foreign keys are correct and expected. Referential
integrity within a context is the database's job and is valued.

**Across bounded contexts:** never a physical foreign key. Contexts reference each other by stable,
typed identifiers, and integrity is asserted by the owning context's service and by application
validation.

The reason is not stylistic. A cross-schema foreign key makes the database enforce a coupling the
code has agreed not to have — and the first attempt to extract a context discovers it. It converts a
modular monolith into an unsplittable one, silently, while every test still passes.

Enforced statically by `scripts/ci/check-schema-boundaries.mjs`, which parses the DDL and fails on
any foreign key whose target schema differs from the table's own. **DR-007 stays closed**; reopen it
only if implemented behaviour violates this rule, not because the check is static rather than live.

---

## 4. Standing architecture (as of Phase 0)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION  (untrusted — renders, never decides)                      │
│  Executive surfaces · design system · charts                             │
│  MUST NOT: compute metrics · enforce authz · hold business rules         │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │  authorised, shaped view models only
┌─────────────────────────────▼────────────────────────────────────────────┐
│  APPLICATION  (trust boundary — every request re-authorised here)        │
│  Use cases · authorization enforcement · audit emission · DTO assembly   │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────────┐
│  DOMAIN — bounded contexts (the system of record for judgement)          │
│                                                                          │
│  Foundation:  Identity · Organization · Portfolio · Project · Contract    │
│  Fact (L1):   Financial · Delivery · Commercial · Quality · Resource      │
│               · Risk · Assurance                                         │
│  Derived(L2): Health · Forecast · Recovery · Data Quality  ← via Rules    │
│  Support:     Rules (versioned) · Integration (adapter seams)            │
│  Inferred(L3):AI Intelligence  ← reads L1/L2 only through app services   │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────────┐
│  PLATFORM   persistence · decimal · time/clock · audit sink · config     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Dependency rules (enforced, not advisory — REQ-GOV-005/006)

> **As of Phase 1 these are mechanically enforced.** The machine-readable form is
> [`architecture/manifest.json`](architecture/manifest.json); the gate is `npm run check:architecture`
> plus `tests/integration/architecture.boundaries.test.ts` and an ESLint rule sharing one
> implementation. Violation codes `ARCH-001` … `ARCH-011` map to the rules below and are documented in
> [`docs/architecture/MODULE-MAP.md`](docs/architecture/MODULE-MAP.md) §4.1.


1. Dependencies point **downward and inward only**. Presentation → Application → Domain → Platform.
2. **No context imports another context's internals.** Cross-context access is via published
   contracts (types + service interfaces) in that context's public surface.
3. **L2 contexts may read L1 contexts. L1 contexts may never read L2.** A fact does not know its
   own score.
4. **`AI Intelligence` may not import any domain context directly.** It consumes application
   services under the caller's authorization context, exactly as the UI does.
5. **`Rules` is depended upon; it depends on nothing** except platform primitives.
6. No context may import from `Presentation`. Ever.
7. Cycles are build failures.

### 4.2 Context responsibilities (one line each)

> **Phase 1 conflict note (unresolved, recorded).** The `Layer` column below and
> `METRIC_CATALOG.md` disagree in two places — `Forecast` (§4.2 says L2, `METRIC_CATALOG.md` §9 and
> ADR-0004 §Consequences say **L3 inferred**) and `Portfolio` (§4.2 says L1, `METRIC_CATALOG.md` §11
> defines aggregates over L2/L3 inputs). These are recorded as **C-2** and **C-1** in
> `docs/traceability/PHASE-1-TRACEABILITY.md` §6 and are proposed for resolution in **ADR-0011** and
> **ADR-0012**. Until those are accepted, the import rules enforced by the build are
> `architecture/manifest.json`, which implements §4.1 as written. Nothing has been resolved by
> inference.


| Context | Owns | Layer |
| --- | --- | --- |
| Identity | Users, roles, sessions, permission grants | L1 |
| Organization | Legal entities, business units, geographies, hierarchy | L1 |
| Portfolio | Portfolio/program grouping and rollup membership | L1 |
| Project | Project identity, lifecycle, engagement model, dates | L1 |
| Contract | As-sold baseline, executed changes, pending changes, contractual terms | L1 |
| Financial | Actuals, revenue recognition, cost, ETC/EAC, margin, FX | L1→L2 |
| Delivery | Milestones, scope items, schedule, progress, EVM inputs | L1→L2 |
| Commercial | Rates, pricing, invoicing, receivables, unsecured upside | L1 |
| Quality | Defects, escapes, coverage, rework, engineering signals | L1 |
| Resource | Assignments, utilisation, pyramid, attrition, key-person concentration | L1 |
| Risk | Risk register, exposure, proximity, mitigation state | L1→L2 |
| Assurance | Reviews, findings, audit records, evidence retention | L1 |
| Recovery | Recovery plans, recovery baselines, intervention outcomes | L1→L2 |
| Health | Composite scoring, RAG assessment, divergence, contribution breakdown | L2 |
| Forecast | Trajectory, deterioration detection, projected outturn | L2 |
| Rules | Versioned rule definitions, thresholds, weights, explanations | Support |
| Data Quality | Completeness, freshness, consistency, confidence scoring | L2 |
| Integration | Adapter seams and ingestion contracts (POC: synthetic loader only) | Support |
| AI Intelligence | Retrieval, grounding, narration, citation assembly | L3 |

---

## 5. Decision register

| ADR | Title | Status | Date | Supersedes |
| --- | --- | --- | --- | --- |
| [ADR-0001](docs/adr/ADR-0001-poc-architecture.md) | POC architecture: modular monolith with strict bounded contexts | Accepted | 2026-08-29 | — |
| [ADR-0002](docs/adr/ADR-0002-decimal-safe-money.md) | Decimal-safe money and deterministic financial computation | Accepted | 2026-08-29 | — |
| [ADR-0003](docs/adr/ADR-0003-three-baselines-temporal-model.md) | Three baselines and an append-only temporal model | Accepted | 2026-08-29 | — |
| [ADR-0004](docs/adr/ADR-0004-fact-derived-inferred-layering.md) | L1/L2/L3 layering and the AI authority boundary | Accepted | 2026-08-29 | — |
| [ADR-0005](docs/adr/ADR-0005-server-side-authorization.md) | Server-side authorization, scoping and audit | Accepted | 2026-08-29 | — |
| [ADR-0006](docs/adr/ADR-0006-api-bff-contract-strategy.md) | Task-shaped BFF and three-axis versioning | **Proposed** | 2026-08-29 | — |
| [ADR-0007](docs/adr/ADR-0007-operational-analytical-data-strategy.md) | Operational and analytical data strategy | **Proposed** | 2026-08-29 | — |
| [ADR-0008](docs/adr/ADR-0008-integration-and-ingestion-model.md) | Integration and ingestion model | **Proposed** | 2026-08-29 | — |
| [ADR-0009](docs/adr/ADR-0009-observability-architecture.md) | Observability on OpenTelemetry, separated from audit | **Proposed** | 2026-08-29 | — |
| [ADR-0010](docs/adr/ADR-0010-deployment-environment-configuration.md) | Deployment, environments and configuration | **Proposed** | 2026-08-29 | — |
| [ADR-0011](docs/adr/ADR-0011-epistemic-layers-are-not-dependency-tiers.md) | Epistemic layers are not dependency tiers | **Proposed** | 2026-08-29 | — |
| [ADR-0012](docs/adr/ADR-0012-ports-in-orchestration.md) | Ports-in orchestration for aggregate, cross-domain and inferred contexts | **Proposed** | 2026-08-29 | — |
| [ADR-0013](docs/adr/ADR-0013-revised-demo-portfolio-specification.md) | Revised demo portfolio specification (Phase 3 brief reconciliation) | Accepted | 2026-08-29 | — |
| [ADR-0014](docs/adr/ADR-0014-epistemic-level-of-health-assessment.md) | Epistemic level of composite health and System-Assessed RAG | Accepted | 2026-08-29 | — |
| [ADR-0015](docs/adr/ADR-0015-phase-4-engine-conflicts.md) | Phase 4 engine conflicts: executive health model, forecast reliability, and which "Green" | **Proposed** | 2026-08-29 | — |
| [ADR-0016](docs/adr/ADR-0016-phase-5-security-conflicts.md) | Phase 5 security conflicts: role taxonomy, classification taxonomy, masking, and audit telemetry | **Proposed** | 2026-08-29 | — |

> **ADR-0006 through ADR-0012 are `Proposed`, not `Accepted`.** Per §2 no code may depend on them,
> and per §3 step 7 none of them is implemented. They are surfaced for approval in
> `docs/traceability/PHASE-1-TRACEABILITY.md` §5. ADR-0011 and ADR-0012 resolve conflicts found
> between existing artifacts (C-1, C-2) and are the highest priority for a decision.

> Next ADR number: **0017**

---

## 6. Deferred architectural questions

Recorded so a later phase does not decide them by accident.

| # | Question | Must be decided by |
| --- | --- | --- |
| DQ-1 | Read-model/projection strategy for portfolio rollups (compute-on-read vs materialised snapshot) | Phase 4 |
| DQ-2 | Whether health recomputation is event-driven or batch on snapshot | Phase 4 |
| DQ-3 | Retrieval strategy for the assistant (structured query vs embedding retrieval vs both) | Phase 11 |
| DQ-4 | Whether `Recovery` remains a context or folds into `Delivery` after Phase 10 usage is known | Phase 10 |
| DQ-5 | Extraction path from monolith to services if the POC is productised | Post-POC |
| DQ-6 | Pagination and result-cap strategy for portfolio collections | Phase 7 |
| DQ-7 | Cache tier for recompute results, if any | Post-POC |
| DQ-8 | Telemetry backend and vendor | Post-POC |
| DQ-9 | Whether the BFF deploys separately from the domain | Post-POC |
| DQ-10 | Read-replica routing for read paths | Post-POC |

Phase 1 additions are DQ-6 … DQ-10; see
[`docs/architecture/DEFERRED-DECISIONS.md`](docs/architecture/DEFERRED-DECISIONS.md) for what each
one is blocked on and why deciding it now would be guessing.
