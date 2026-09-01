# ADR-0001 — POC architecture: modular monolith with strict bounded contexts

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Principal CTO / Architect (Phase 0)
- **Phase:** 0
- **Affects:** All contexts; REQ-GOV-005, REQ-GOV-006
- **Supersedes:** —

---

## Context

Delivery Intelligence must demonstrate, in a POC timeframe, that portfolio economics, delivery
signals, health scoring and AI narration can be made to reconcile with each other and be defended
in front of a CDO, a CFO's controller, and a CISO.

Two failure modes are available to us, and both are fatal:

1. **Premature distribution.** Splitting into services now buys deployment independence we do not
   need and pays for it with network partitions, eventual-consistency bugs, and cross-service
   transaction ambiguity — in a system whose core claim is that *the numbers reconcile*. A margin
   bridge that does not add up because two services disagreed about a snapshot boundary would
   destroy the demo's credibility.
2. **Disposable demo architecture.** A single-layer application with metrics computed in
   components and SQL views scattered per screen. It demos on day one and cannot survive the
   Phase 12 traceability review, let alone productisation.

The POC must be *architecturally honest* — the boundaries that would become services later must be
real now, even though they run in one process.

## Decision

**The POC is a modular monolith with strict, enforced bounded contexts.**

1. One deployable process, one primary transactional database (PostgreSQL).
2. Nineteen bounded contexts as listed in `ARCHITECTURE_DECISIONS.md` §4.2:
   `Identity`, `Organization`, `Portfolio`, `Project`, `Contract`, `Financial`, `Delivery`,
   `Commercial`, `Quality`, `Resource`, `Risk`, `Assurance`, `Recovery`, `Health`, `Forecast`,
   `Rules`, `Data Quality`, `Integration`, `AI Intelligence`.
3. Each context owns its schema namespace. **No cross-context foreign keys and no cross-context
   joins.** Contexts reference each other by identifier and cross a published contract.
4. Each context exposes a **public surface** (`index.ts`: types + service interfaces). Everything
   else is internal and may not be imported from outside.
5. Layering is Presentation → Application → Domain → Platform. Dependencies point downward only.
   Cycles are build failures.
6. Boundary rules are **mechanically enforced** — import-boundary lint rules plus an architecture
   test in `tests/integration` that fails the build on violation. Convention alone is insufficient;
   convention is what drift eats first.
7. **Technology baseline:** TypeScript on Node.js; PostgreSQL with `NUMERIC` for money; a typed
   query builder or ORM restricted so that raw cross-schema SQL requires an explicit exemption;
   React for presentation. No message broker, no cache tier, no second datastore in the POC.

## Rationale

- **Reconciliation is the product.** One database and one transaction boundary means the margin
  bridge, the portfolio rollup and the health score are computed against a single consistent state.
  This is not a compromise; for this product it is the correct design.
- **Boundaries are free to draw now and expensive to draw later.** Contexts cost us discipline
  today and buy an extraction path later (see `ARCHITECTURE_DECISIONS.md` DQ-5).
- **The Phase 12 gate is adversarial.** An architecture whose rules are enforced by tooling can be
  demonstrated to a CISO. One enforced by good intentions cannot.
- **The AI boundary needs a wall to sit on.** Rule 4 in the dependency rules — `AI Intelligence`
  cannot import domain contexts — is only meaningful if boundaries are real.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Microservices per context** | 19 services for a POC. Buys independent scaling and deployment we do not need; costs distributed transactions, cross-service snapshot skew, and an order-of-magnitude increase in the surface a CISO must review. Reconciliation guarantees become hard where they are currently free. |
| **Layered monolith, no bounded contexts** | Fastest to build, and the standard route to the exact failure this playbook exists to prevent: business logic migrating into UI, formulas duplicating per screen, no defensible extraction path. Fails REQ-GOV-005/006. |
| **Serverless functions + managed data** | Attractive demo economics, but function-level fan-out makes deterministic, reproducible metric runs (AC-7) considerably harder to guarantee and complicates audit continuity. |
| **Event-sourced core** | Genuinely appealing given the append-only temporal requirement (ADR-0003) and it remains a candidate post-POC. Rejected for the POC because projection-rebuild complexity would consume the budget that belongs to the six executive surfaces. ADR-0003 achieves the needed temporal properties with far less machinery. |
| **Document store (MongoDB et al.)** | Money and reconciliation want exact numerics, constraints, and transactions. PostgreSQL `NUMERIC` and referential integrity within a context are load-bearing here. |

## Consequences

**Positive**
- Single transaction boundary; reconciliation is achievable and testable.
- Fast local development; the whole system runs from one command — essential for Phase 12's
  clean-environment demo requirement (REQ-OPS-003).
- Contexts give later phases an unambiguous answer to "where does this code go?", which is the
  single most common source of drift.
- Extraction to services later is a refactor, not a rewrite.

**Negative / accepted costs**
- Boundary discipline must be enforced continuously; without the lint/test gate it degrades within
  two phases. We accept the cost of building that gate in Phase 1.
- Single process is a single blast radius. Acceptable for a POC; recorded as post-POC debt.
- Nineteen contexts is a lot of ceremony for a small codebase. We accept verbosity in exchange for
  the boundaries being real.

**Neutral but notable**
- Some contexts (`Integration`, `Recovery`, `Assurance`) will be thin in early phases. Thin is fine;
  absent is not. A named empty context is a decision; a missing one is an omission.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | Defines all 19 and their dependency rules |
| Data model / persistence | PostgreSQL, schema-per-context, no cross-context FKs |
| Formulas or metrics | None directly; establishes that formulas live in domain contexts, never in UI or ad-hoc SQL |
| Security model | Establishes the Application layer as the authorization enforcement point (see ADR-0005) |
| Brand / design tokens | None |
| Requirements affected | REQ-GOV-005, REQ-GOV-006, REQ-HLTH-008, REQ-FIN-001 |
| Tests that must change | Adds architecture/boundary test suite in Phase 1 |

## Migration implications

Greenfield — no migration. Phase 1 must deliver the folder structure, the public-surface convention,
and the boundary-enforcement tooling **before** any domain logic is written in Phase 2. Building
domain logic first and adding enforcement later would mean the first violations are grandfathered,
which defeats the control.

## Rollback path

Reversal to a plain layered application is a matter of relaxing lint rules and is always available,
at the cost of the guarantees above. Reversal *forward* to microservices is the intended growth
path, not a rollback.

**Reconsider this ADR if:** a single context's compute needs isolation for scale; a second team
needs an independent deploy cadence; or a regulatory requirement forces data residency separation.
None apply to the POC.

## Verification

- `tests/integration/architecture.boundaries.test.ts` fails on any import that crosses a context
  boundary outside its public surface, any upward dependency, any cycle, or any import of a domain
  context from `AI Intelligence`.
- Schema inspection confirms no cross-schema foreign keys.
- Phase reports cite this ADR when adding or altering a context.

## Open questions

- DQ-1 (read-model strategy) and DQ-2 (recompute trigger) are deliberately deferred to Phase 4,
  when real query shapes are known. Deciding them now would be guessing.
