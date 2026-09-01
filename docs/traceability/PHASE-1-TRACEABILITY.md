# Requirement Traceability Report — Phase 1: Enterprise Architecture Blueprint

- **Phase:** 1
- **Date:** 2026-08-29
- **Author:** Chief Architect / CTO / Principal Data Architect / Platform Architect
- **Requirements in scope:** REQ-GOV-005, REQ-GOV-006, REQ-GOV-007, REQ-DATA-009, REQ-SEC-008
  (continuous), plus the Phase 1 deliverables listed in `PHASE_HANDOFF.md` §3.2
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md`, `SECURITY_MODEL.md`, `SYNTHETIC_DATA_SPEC.md`, `TEST_STRATEGY.md`,
  `DEFINITION_OF_DONE.md`, `PHASE_HANDOFF.md`, `docs/adr/ADR-0001`…`ADR-0005`

---

## 1. Requirement coverage

| REQ ID | Requirement (short) | State | Evidence (`file:line`) | Verification | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-GOV-005 | Bounded contexts defined with dependency rules; violations detectable | `IMPLEMENTED` | `architecture/manifest.json`, `architecture/ruleset.mjs:98` | integration | ✅ `tests/integration/architecture.boundaries.test.ts` (40) | All 19 contexts declared with tier, output layers, allow-list and written justification |
| REQ-GOV-006 | Modular monolith enforced by build/lint boundaries, not convention | `IMPLEMENTED` | `architecture/check.mjs`, `eslint.config.mjs:20`, `.github/workflows/ci.yml:52` | integration | ✅ same suite | Three callers, one ruleset; proven to fail on a deliberate violation (§3.1) |
| REQ-GOV-007 | Phase ends with updated `PHASE_HANDOFF.md` and debt register | `IMPLEMENTED` | `PHASE_HANDOFF.md`, this file §7 | manual | ✅ | — |
| REQ-DATA-009 | No real client, person, or financial data | `IMPLEMENTED` | `scripts/ci/secret-scan.mjs`, no `data/synthetic/` content | integration | ✅ 99 files scanned | No data generated in this phase |
| REQ-SEC-008 | No secret material; configuration externalised | `IMPLEMENTED` | `src/platform/config/index.ts:38`, `scripts/ci/secret-scan.mjs` | integration | ✅ 0 findings | `.env` git-ignored; CI gate active |
| REQ-HLTH-008 | Health never computed in the UI layer | `IMPLEMENTED_WITH_DEBT` | `architecture/manifest.json` → `layers.presentation.mayDependOn` | integration | ✅ 4 tests | Structurally impossible now; the requirement spans Phases 4–12 and is re-verified when `health` has behaviour |
| REQ-FIN-001 | Decimal-safe money; float money impossible by construction | `IMPLEMENTED_WITH_DEBT` | `src/platform/decimal/money.ts:38` | unit | ✅ 24 tests | Money type is complete and enforced; the requirement's phase is 4, when the domain uses it. Debt: TypeScript permits relational operators on objects (DR-008) |
| REQ-UX-001 | No ad-hoc colour values in components | `STUBBED` | `architecture/manifest.json` → `sourceGates.G-COLOUR` | integration | — | Gate is written and active but matches nothing — no components exist. Phase 6 owns this |
| REQ-UX-005 | `DEMO — SYNTHETIC DATA` on every screen and export | `IMPLEMENTED_WITH_DEBT` | `src/platform/config/index.ts:27`, `src/app/use-case.ts:26` | unit | ✅ 1 test | Marker is a constant carried in `ApplicationResponse`; no screen exists to verify it on |

### 1.1 Phase 1 deliverables from `PHASE_HANDOFF.md` §3.2

| # | Deliverable | State | Evidence |
| --- | --- | --- | --- |
| 1 | Module structure for all 19 contexts with a public-surface convention | `IMPLEMENTED` | `src/contexts/*/index.ts` (19 files); `ARCH-010` fails the build on a missing surface |
| 2 | Mechanical boundary enforcement (lint + `tests/integration/architecture.*`) | `IMPLEMENTED` | `architecture/`, `eslint.config.mjs`, 40 tests |
| 3 | Layering skeleton with the Application layer as the authorization enforcement point | `IMPLEMENTED` (structure) / `STUBBED` (behaviour) | `src/app/authorization/enforcement.ts`; behaviour is Phase 5 and is marked `STUB` in code |
| 4 | Platform module contracts | `IMPLEMENTED` (`decimal`, `time`, `provenance`, `config`) / `STUBBED` (`authz`, `audit`, `persistence`) | `src/platform/*/index.ts`; states declared in each module |
| 5 | Provenance envelope as a shared primitive | `IMPLEMENTED` | `src/platform/provenance/index.ts`; 8 tests |
| 6 | Persistence strategy: schema-per-context, migrations, immutability mechanism | `DEFERRED` (documented, not implemented) | `docs/architecture/DATA-PLATFORM.md`; proposed as ADR-0007. No schema exists — Phase 2 owns REQ-DATA-001…006 |
| 7 | CI pipeline with `TEST_STRATEGY.md` §9 gates | `IMPLEMENTED_WITH_DEBT` | `.github/workflows/ci.yml` — 6 of 6 applicable gates; 4 gates deferred because what they check does not exist (§7 DR-001) |
| 8 | New ADRs, surfaced in the phase report | `IMPLEMENTED` | ADR-0006…0012, all `Proposed`; §5 below |
| 9 | Traceability report + updated `PHASE_HANDOFF.md` | `IMPLEMENTED` | This file; `PHASE_HANDOFF.md` |

### 1.2 Coverage summary

| State | Count |
| --- | --- |
| IMPLEMENTED | 11 |
| IMPLEMENTED_WITH_DEBT | 5 |
| MOCKED | 0 |
| STUBBED | 2 (+7 context/platform surfaces explicitly marked `STUB` in code) |
| DEFERRED | 1 |
| BLOCKED | 0 |
| NOT_STARTED | 0 |
| **Total in scope** | **19** |

---

## 2. Metric traceability

**Not applicable to Phase 1.** No metric is implemented. `METRIC_CATALOG.md` remains `Draft` and
blocked on MC-1…MC-8 (debt DR-005). **No threshold, weight, or formula value appears in any source
file** — verified by inspection of all 34 source files. Rule parameters are typed as data
(`src/contexts/rules/index.ts` → `RuleParameter`), never as constants.

---

## 3. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | 44 | 44 | 0 | 0 |
| golden | 0 | 0 | 0 | 0 |
| integration (architecture) | 40 | 40 | 0 | 0 |
| authz | 0 | 0 | 0 | 0 |
| a11y | 0 | 0 | 0 | 0 |
| **Total** | **84** | **84** | **0** | **0** |

Plus, as build gates rather than test cases:

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (strict; includes 8 `@ts-expect-error` compile-time assertions) | ✅ clean |
| `npm run check:architecture` | ✅ 34 files, 0 violations |
| `npm run lint` | ✅ 0 problems |
| `node scripts/ci/secret-scan.mjs` | ✅ 99 files, 0 findings |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities |

**Failures:** none.
**Skipped tests:** none. The `golden`, `authz` and `a11y` suites have zero tests because their
subjects do not exist yet — that is a scope fact, not a skip. `TEST_STRATEGY.md` §8 assigns them to
Phases 4, 5 and 6.

### 3.1 The gate was proven to fail

A gate that has never failed is a green tick of unknown provenance. A file importing `@contexts/health`
from `src/contexts/quality/` was introduced and both enforcement paths rejected it with identical
output before it was removed:

```
ARCH-003: "quality" (tier 2) may not depend on "health" (tier 3).
          A fact does not know its own score.
          authority: ARCHITECTURE_DECISIONS.md §4.1 rule 3, ADR-0004 §2
```

The suite's 40 cases break down as **26 negative** (each rule rejects what it claims to reject),
**7 positive** (each rule permits what it claims to permit — a gate that rejects everything is also
broken), and **7 structural** (manifest consistency, public-surface presence, clean tree, gate
patterns).

---

## 4. Invariant compliance

| # | Invariant | Held? | Evidence / exception |
| --- | --- | --- | --- |
| 3 | No silent change to formulas, metrics, boundaries, security, brand, RAG, scenarios | ✅ | No formula, threshold or scenario exists in code. Two conflicts found were **reported, not resolved** (§6) |
| 5 | No false completion claims | ✅ | 7 context/platform surfaces carry an explicit `IMPLEMENTATION_STATE` marker naming their state and target phase |
| 6 | Decimal-safe, server-side financial computation | ✅ | `Money` implemented and tested; `decimal.js` confined to `platform/decimal` by `ARCH-006`; browser cannot reach it — `presentation` may import only `@app` |
| 7 | Server-side authorization only | ✅ (structurally) | `AuthorizationContext` is a platform type; `presentation` cannot import it. Enforcement behaviour is Phase 5 and is marked `STUB` |
| 8 | L1/L2/L3 separation intact | ✅ | Provenance envelope implemented; `inferred()` refuses to produce a value without citable evidence; tier rules prevent upward reads |
| 9 | AI is not calculator or system of record | ✅ | `ai-intelligence` imports nothing (`ARCH-004`, 8 tests); `ValueReference` has no `value` field |
| 10 | Modular monolith with strict contexts | ✅ | One process, one package, 19 contexts, no broker/cache/second datastore added |
| 11 | `DEMO — SYNTHETIC DATA` labelling present | ✅ (as far as applicable) | Constant in `platform/config`; carried on `ApplicationResponse`; every architecture document headed with it. No screen or export exists yet |

---

## 5. Proposed deviations / ADRs

**Seven ADRs, all `Proposed`. None is implemented** (`ARCHITECTURE_DECISIONS.md` §3 step 7).

| ADR | Title | Status | Rationale | Impact | Rollback |
| --- | --- | --- | --- | --- | --- |
| 0006 | Task-shaped BFF and three-axis versioning | Proposed | AC-1 is a composition problem; five client-side calls would put aggregation in the untrusted layer | Application + Presentation | Reversible until Phase 7 builds against the endpoint shapes |
| 0007 | Operational and analytical data strategy | Proposed | 48 → 5,000 projects is ×350 snapshot rows; the split must not change domain contracts | Persistence, all context schemas | POC single-database decision is ADR-0001's and unchanged |
| 0008 | Integration and ingestion model | Proposed | Idempotency and staging are free now and expensive to retrofit; last-known-good is a stated constraint | `integration`, `data-quality` | Reversible until Phase 3 wires the loader |
| 0009 | Observability on OpenTelemetry, separated from audit | Proposed | Prevents commercial values leaving via span attributes; introducing an SDK requires an ADR (§3.1) | New platform module | Removal is mechanical while confined to one module |
| 0010 | Deployment, environments and configuration | Proposed | REQ-OPS-003 reproducibility; `SECURITY_MODEL.md` §2 B6 no-bypass must be decided before a shortcut is wanted | Build, CI, config | Each element independently reversible |
| **0011** | **Epistemic layers are not dependency tiers** | **Proposed** | **Resolves CONFLICT C-2.** Required to mechanise §4.1 rule 3 at all | §4.2 Layer column; `forecast` | Reverting forces reclassifying `forecast` or splitting four contexts |
| **0012** | **Ports-in orchestration** | **Proposed** | **Resolves CONFLICT C-1.** Avoids weakening a dependency rule for three contexts | `portfolio`, `data-quality`, `ai-intelligence` | Reversible while contexts are stubs |

**ADR-0011 and ADR-0012 are the two that need a decision first.** They resolve conflicts between
existing accepted artifacts. Until they are accepted, the build enforces `architecture/manifest.json`,
which implements §4.1 exactly as written — no rule was weakened to make anything compile.

---

## 6. Conflicts encountered

| ID | Artifacts in conflict | Nature | Precedence applied | Resolution |
| --- | --- | --- | --- | --- |
| **C-1** | `ARCHITECTURE_DECISIONS.md` §4.2 (Portfolio = L1, tier 1) vs `METRIC_CATALOG.md` §11 (MET-PORT-001…008 defined over `MET-FIN-*`, `MET-HLTH-*`, `MET-FCST-*`) | A tier-1 context would have to read tiers 2, 3 and 4 to compute its own catalog metrics — forbidden by §4.1 rule 3 | ADRs (rank 1) over `METRIC_CATALOG.md` (rank 2). §4.2 is ADR-0001 content | **Not resolved by inference.** Reported here; ADR-0012 proposes inputs-in orchestration, which also satisfies ADR-0005 §5. `portfolio` currently declares no context dependency and its surface carries the note |
| **C-2** | `ARCHITECTURE_DECISIONS.md` §4.2 (Forecast = "Derived (L2)") vs `METRIC_CATALOG.md` §9 + ADR-0004 §Consequences (Forecast = **L3 inferred**) | A module cannot be both, and rule 3's enforcement needs to know which | Both are rank 1; ADR-0004 is later and more specific about what a layer *means* | **Not resolved by inference.** Reported here; ADR-0011 proposes separating epistemic layer (per value) from dependency tier (per module), which makes both statements true |
| **C-3** | This phase's brief ("Can 75 synthetic projects grow to thousands?") vs `SYNTHETIC_DATA_SPEC.md` §3 and `PHASE_HANDOFF.md` D-5 (**48** projects) | Different project counts | `SYNTHETIC_DATA_SPEC.md` is rank 6; the phase brief is not in the precedence order | **48 is authoritative.** The scale analysis in `docs/architecture/DATA-PLATFORM.md` §4 uses 48 → 5,000. Flagged in case the brief's 75 reflects a sponsor change that should amend the spec |

A fourth item is a gap rather than a conflict, recorded so it is not mistaken for enforcement:
**the "no cross-context foreign key" rule (ADR-0001 §3) is not yet mechanically checked**, because
no schema exists. Debt DR-007, Phase 2.

---

## 7. Debt register delta

| ID | Item | State | Owner | Target phase | Risk if unaddressed |
| --- | --- | --- | --- | --- | --- |
| DR-001 | No CI pipeline | **CLOSED (partial)** → `IMPLEMENTED_WITH_DEBT` | Platform | — | 6 gates active; 4 (a11y, token lint, generator validation, golden-fixture review) deferred to the phases that create their subjects. Listed in `ci.yml` rather than omitted |
| DR-002 | No MFA / SSO | DEFERRED | Security | Post-POC | `SECURITY_MODEL.md` §9 |
| DR-003 | No audit retention policy | DEFERRED | Security | Post-POC | Unbounded growth |
| DR-004 | No E2E browser tests | DEFERRED | QA | Post-POC | UI regressions found manually |
| DR-005 | Metric catalog is `Draft`, not `Frozen` | BLOCKED | Metrics owner | 2 | Blocked by MC-1…MC-8 |
| DR-006 | No penetration test | DEFERRED | Security | Post-POC | Residual vulnerabilities unknown |
| **DR-007** | **No automated cross-context foreign-key check** | **DEFERRED** | Platform | **2** | ADR-0001 §3 is enforced by review only until a schema exists. A single cross-schema FK would make the monolith unsplittable, quietly |
| **DR-008** | **TypeScript permits relational operators (`<`, `>`) on `Money`** | **IMPLEMENTED_WITH_DEBT** | Platform | 4 | `a < b` compiles and compares object references. `+`, `-`, `*` are compile errors; `Money.compare()` is the correct API. Recorded in `tests/unit/platform/money.type-safety.test.ts` rather than glossed |
| **DR-009** | **No backup / DR configuration; RPO and RTO are unowned placeholders** | **DEFERRED** | CTO / CISO | Post-POC | Values in `docs/architecture/RESILIENCE.md` §3 are proposals with named owners, not commitments. Already present in `SECURITY_MODEL.md` §9 |
| **DR-010** | **Presentation layer is a shell; no React, no design system, no bundler** | **STUBBED** | Frontend | 6 | Deliberate — `PHASE_HANDOFF.md` §3.3 forbids UI in Phase 1. The layering contract is proven; the rendering stack is unproven |
| **DR-011** | **Period / fiscal-calendar arithmetic is stubbed** | **BLOCKED** | Sponsor (OQ-5) | 2 | `platform/time` declares `WeekId` but implements no period arithmetic. Implementing it would have silently committed the product to calendar quarters |

---

## 8. Open questions

Every question from Phase 0 restated. **None was resolved by this phase, and none was resolved by
inference.**

| ID | Question | Status | What it blocks | Owner |
| --- | --- | --- | --- | --- |
| OQ-1 | Reporting currency + FX source | Open | All portfolio aggregates | Sponsor / Finance |
| OQ-2 | Revenue recognition method for fixed-bid | Open — **highest impact** | MET-FIN-006/009 and downstream | Sponsor / Finance |
| OQ-3 | Are cost rates visible to Delivery Managers? | Open | Authorization matrix, `tests/authz` | Sponsor / CISO |
| OQ-4 | Health dimension weighting owner and values | Open | MET-HLTH-010/011 | Sponsor / Delivery leadership |
| OQ-5 | Fiscal calendar | Open | Period definitions — **now blocking DR-011** | Sponsor |
| MC-3 | `HEALTH-v1` RAG thresholds + critical-breach overrides | Open | System-Assessed RAG | Rules + Delivery leadership |
| MC-4 | `VAR-v1` value-at-risk rules | Open | MET-FIN-019, MET-PORT-003 | Finance + Delivery |
| MC-5 | `PRIORITY-v1` intervenability factor | Open | MET-PORT-007, AC-1 | Delivery leadership |
| MC-6 | Deterioration threshold | Open | MET-FCST-002/010 | Phase 3 calibration |
| MC-8 | Scope-unit definition | Open | EVM + quality metrics | Phase 2 |
| DQ-1 | Read-model / projection strategy | Open — deliberately | Portfolio rollup performance | Phase 4 |
| DQ-2 | Health recompute trigger | Open — deliberately | Phase 4 design | Phase 4 |
| DQ-3 | Assistant retrieval strategy | Open — now constrained by ADR-0012 | Phase 11 design | Phase 11 |
| DQ-4 | Does `Recovery` survive as a context? | Open | Context count | Phase 10 |
| **DQ-6…DQ-10** | Pagination, cache tier, telemetry vendor, BFF deploy cadence, read replicas | **Opened by Phase 1** | See `docs/architecture/DEFERRED-DECISIONS.md` | Phases 7 / post-POC |
| **D-1** | Technology baseline (TypeScript/Node, PostgreSQL, React) | **Now materially committed** | Everything built from here | **Sponsor — confirm now** |

**D-1 deserves attention.** Phase 0 flagged the stack as the one genuinely discretionary choice and
asked the sponsor to "say now if it should be different". Phase 1 has built the module structure,
the enforcement gate and the platform contracts against it. Changing it after Phase 2 would be
expensive; changing it now would cost roughly a day.

---

## 9. Handoff

- **What now exists:** an enforced 19-context module structure with public surfaces; a
  three-caller architecture gate sharing one ruleset; a complete, tested `Money` value object; an
  injected `Clock`; the provenance envelope with layering preconditions; authorization, audit and
  persistence contracts; a CI pipeline; and eleven architecture documents covering C4 views, the
  module map, data flow, API strategy, the data platform and scale, integration, resilience,
  observability, deployment, security architecture and deferred decisions.
- **What Phase 2 consumes:** the platform contracts, the provenance envelope, the persistence
  contracts, and the public surfaces it must fill in.
- **What Phase 2 must NOT assume:** that ADR-0006…0012 are accepted; that OQ-1…OQ-5 or MC-1…MC-8
  have answers; that any stubbed surface has behaviour; that the persistence strategy in
  `DATA-PLATFORM.md` is binding before ADR-0007 is accepted.
- **`PHASE_HANDOFF.md` updated:** yes.

---

## 10. Self-review

- [x] **Is any `IMPLEMENTED` claim resting on a UI that merely looks right?** No — there is no UI.
      Every `IMPLEMENTED` claim is backed by a passing test or a build gate named in §1.
- [x] **Is any golden fixture's expected value generated from the implementation it tests?** No
      golden fixtures exist. The `Money` expectations in `tests/unit/platform/money.test.ts` are
      derived from ADR-0002's stated properties (exact decimal strings, half-up rounding, parts
      summing to the whole), not from a run.
- [x] **Is any authorization claim verified only through the UI?** No authorization is claimed as
      working. What is claimed is that it is *structurally enforceable in one place*, evidenced by
      import rules and tests.
- [x] **Did any formula, threshold, or scenario change without an ADR?** None exists to change. No
      threshold value appears in any source file.
- [x] **Is any mock unlabelled?** There are no mocks. Seven surfaces are `STUB`, each carrying an
      `IMPLEMENTATION_STATE` constant naming its state and target phase.
- [x] **If a claim in this report is wrong, would we find out now — or in front of the client?**
      Now, for everything mechanically enforced — the gate runs on every commit and has been shown
      to fail. The claims that would surface later are the *proposed* ADRs, which is precisely why
      they are `Proposed` and unimplemented rather than quietly built.
