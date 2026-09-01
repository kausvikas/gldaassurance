# GlobalLogic Delivery Intelligence — Repository Operating Contract

**DEMO — SYNTHETIC DATA.** This repository is a proof of concept. It contains no real client,
employee, or financial data and must never be pointed at production systems.

Any agent or engineer working in this repository is bound by the invariants below.

---

## GLOBAL EXECUTION INVARIANTS

You are continuing an approved GlobalLogic Delivery Intelligence build. Treat the repository's
approved specifications and Architecture Decision Records as authoritative.

Before changing code:

1. Read `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`, `METRIC_CATALOG.md`, `SECURITY_MODEL.md`,
   and the most recent `PHASE_HANDOFF.md`.
2. Inspect the existing implementation. Do not recreate or replace working architecture merely for
   convenience.
3. Do not silently change formulas, metric definitions, domain boundaries, data relationships,
   security assumptions, brand tokens, RAG logic, or synthetic scenario narratives.
4. If a deviation is genuinely required, first document it as a proposed Architecture Decision
   Record with rationale, impact, alternatives, migration implications, and rollback path. Do not
   implement the deviation until it is explicitly identified in your phase report.
5. Do not claim a requirement is complete if it is a placeholder, mocked without being labeled,
   visually represented but not functionally implemented, or untested where tests are required.
6. All financial calculations must use decimal-safe server/domain logic, never browser
   floating-point as the system of record.
7. All authorization must be enforced server-side; UI hiding is never an authorization control.
8. Observed facts, deterministic derived metrics, and inferred/intelligence outputs must remain
   separate.
9. The LLM/assistant must never be the calculator or system of record for project economics or
   official health.
10. Keep the POC a modular monolith with strict bounded contexts unless an approved ADR says
    otherwise.
11. Maintain `DEMO - SYNTHETIC DATA` labeling throughout the POC.
12. At the end of the phase, produce a requirement-to-implementation traceability report, list tests
    run/results, identify technical debt/deferred items, and update `PHASE_HANDOFF.md` for the next
    phase.

If prior artifacts conflict, stop implementation of the conflicting area, identify the conflict
explicitly, and use the approved ADR/specification precedence rather than inventing a resolution.

---

## Precedence order (highest first)

When two artifacts disagree, the higher item wins. Do not resolve conflicts by inference.

1. Accepted ADRs in `docs/adr/` (most recent accepted ADR on a topic supersedes earlier ones)
2. `METRIC_CATALOG.md` — for anything numeric, financial, or health-related
3. `SECURITY_MODEL.md` — for anything about identity, authorization, data exposure, or audit
4. `PRODUCT_SPEC.md` — for scope, requirements, and product behaviour
5. `BRAND_DESIGN_SYSTEM.md` — for visual tokens and UI semantics
6. `SYNTHETIC_DATA_SPEC.md` — for the demo portfolio narrative
7. `TEST_STRATEGY.md` / `DEFINITION_OF_DONE.md` — for verification and completion claims
8. `PHASE_HANDOFF.md` — for current state and next-phase inputs
9. Existing code
10. Anything else

## Source-of-truth map

| Question | Authoritative file |
| --- | --- |
| What are we building and why? | `PRODUCT_SPEC.md` |
| What is a requirement's ID and acceptance test? | `PRODUCT_SPEC.md` §7 |
| How is any number defined or calculated? | `METRIC_CATALOG.md` |
| What is the system's shape and why? | `ARCHITECTURE_DECISIONS.md` + `docs/adr/` |
| Who may see or do what? | `SECURITY_MODEL.md` |
| What colour/type/spacing may I use? | `BRAND_DESIGN_SYSTEM.md` |
| What does the demo portfolio contain? | `SYNTHETIC_DATA_SPEC.md` |
| How do I prove it works? | `TEST_STRATEGY.md` |
| May I say this is "done"? | `DEFINITION_OF_DONE.md` |
| What did the last phase leave me? | `PHASE_HANDOFF.md` |

## Phase sequence

`0` Governance → `1` Architecture → `2` Canonical model & metrics → `3` Synthetic data →
`4` Core engines → `5` Security foundations → `6` Design system → `7` Portfolio Command Center →
`8` Project Executive Health → `9` Margin Intelligence → `10` Forward Risk & Recovery →
`11` AI Assistant → `12` Independent Release Gate

Do not run ahead of the current phase recorded in `PHASE_HANDOFF.md`.
