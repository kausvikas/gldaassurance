# ADR-0003 — Three baselines and an append-only temporal model

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Principal CTO / Architect (Phase 0)
- **Phase:** 0
- **Affects:** `Contract`, `Financial`, `Delivery`, `Forecast`, `Health`, `Recovery`; REQ-DATA-002 through REQ-DATA-005, REQ-DATA-010, REQ-FIN-005, REQ-HLTH-004
- **Supersedes:** —

---

## Context

The differentiating claim — *detect deterioration while intervention still works* — is a claim about
**change over time**. It is unavailable to a system that stores only current state.

There is also a specific organisational pathology this product exists to counter: **baseline
laundering.** When a project slips, the most natural remedy is to move the baseline, after which
variance disappears and the project is "on track" against a target that was quietly rewritten. Every
delivery organisation does some version of this, usually without malice — a replan here, a
"corrected" estimate there. A system that permits it cannot detect deterioration, because
deterioration is defined relative to a fixed point.

Meanwhile, forecasting must remain fluid. Delivery leaders need to revise expectations constantly.
Freezing the forecast would be as wrong as floating the baseline.

## Decision

### 1. Three baselines, structurally distinct

| Baseline | Definition | Storage rule |
| --- | --- | --- |
| **Original As-Sold** | Scope, schedule, price, cost, margin at signature | **Immutable.** Insert-once. Updates and deletes rejected at the persistence layer, not by application convention (REQ-DATA-003) |
| **Current Contractual** | As-Sold + executed change records only | **Derived, never stored as an editable row.** Computed as As-Sold plus the ordered set of executed changes |
| **Current Forecast** | Best current estimate of outturn | Freely revisable, but **versioned** — every revision is a new row with `effective_from`, actor, and reason. Prior forecasts are never overwritten |

These are three different types in the domain model. They are **not** three rows in one
`baseline` table distinguished by a `type` column, because that shape invites `UPDATE baseline SET
… WHERE type = 'as_sold'`. Type-level separation makes laundering require a deliberate, visible act.

### 2. Change records are two distinct things

- `ExecutedChange` — formally approved and executed. Affects Current Contractual Baseline.
- `PendingChange` — proposed, in negotiation, or approved-but-unexecuted. Affects **nothing**
  authoritative. Surfaced only as *Unsecured Upside*, in its own field, on its own visual treatment
  (REQ-DATA-004, REQ-FIN-005, REQ-MRGN-003).

A pending change becoming executed is an **insert of an `ExecutedChange`**, not a status flip on a
row — so the pending record's own history survives, including how long it sat unexecuted (itself a
leading indicator).

### 3. Append-only weekly snapshots

- Every project produces a **weekly fact snapshot** capturing L1 facts and L2 derived metrics as of
  that week, stamped with the rule version used (REQ-DATA-005, REQ-DATA-010).
- Snapshots are **never updated**. A correction to a past period is a new snapshot carrying a
  `corrects` reference and a reason — so "what we believed then" and "what we believe now about
  then" are both recoverable.
- The system answers two distinct temporal questions and never confuses them:
  - **As-of** — "what did we believe on 2026-04-15?" (reads that week's snapshot)
  - **As-corrected** — "what do we now believe was true on 2026-04-15?" (reads latest correction)

### 4. Trajectory is computed from snapshots, not from current state

`Forecast` context derives deterioration by comparing snapshot series. This makes the flagship
signal reproducible and explainable: a trajectory claim can always name the weeks that produced it.

### 5. Time is injected, never ambient

A `Clock` abstraction in `src/platform/time` supplies "now". Domain code never calls `Date.now()`
directly. The demo runs against a **fixed as-of date** so the portfolio narrative is stable and
reproducible (REQ-DATA-007, AC-7).

## Rationale

- **Immutability of As-Sold is the anti-laundering control.** It is the one guarantee that makes
  every variance number in the product meaningful. Enforcing it in the database rather than in
  application code means a later phase cannot weaken it by accident.
- **Type separation over a discriminator column** costs a little schema verbosity and buys a large
  reduction in the chance of accidental mutation. Given the pathology described above, that trade is
  clearly correct.
- **Append-only snapshots** give trajectory, audit continuity, and "as-of" reconstruction from one
  mechanism, and they are dramatically simpler than event sourcing (rejected in ADR-0001).
- **Weekly granularity** matches the cadence at which delivery status actually changes and at which
  executives intervene. Daily would multiply data volume for noise; monthly would be too coarse to
  catch deterioration in time to act — which is the entire point.
- **Injected clock** is what makes the demo deterministic and the tests honest.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Single mutable baseline** | Standard practice, and the direct cause of the blindness this product exists to remove. Non-starter. |
| **One `baseline` table with a `type` discriminator** | Simpler schema, but makes the immutability guarantee a matter of vigilance. The cheapest possible mistake would be the most damaging one. |
| **Full event sourcing / bitemporal tables** | Correct in the large and a plausible post-POC direction. Rejected for the POC on complexity budget (see ADR-0001); snapshots deliver the required temporal properties at a fraction of the cost. |
| **Recompute history on demand from current facts** | Cheap storage, but it reconstructs what we *now* think was true and destroys what we *then* believed — which is precisely the divergence signal that makes the product valuable. |
| **Status flag on change records (`pending` → `executed`)** | Loses the duration a change sat unexecuted, and one careless `UPDATE` moves unsecured revenue into the forecast. Violates REQ-FIN-005 by construction. |
| **Daily snapshots** | ~7× the data for signal that does not move daily. Weekly plus event-triggered ad-hoc snapshots covers the need. |

## Consequences

**Positive**
- Variance is always meaningful because the reference point cannot move.
- Trajectory, "as-of" replay, and audit continuity all fall out of one mechanism.
- Unsecured upside cannot leak into committed forecast without a visible, deliberate act.
- Golden tests can pin a fixed as-of date and assert exact outputs.

**Negative / accepted costs**
- Storage grows linearly with projects × weeks. Trivial at POC scale; noted for post-POC.
- Corrections are more work than edits, and every phase must resist the temptation to "just update
  the row".
- Reads that need current state must select the latest snapshot — a small, recurring complexity that
  Phase 4 must encapsulate rather than scatter (see DQ-1).

**Neutral but notable**
- The Current Contractual Baseline being *derived* means it must be computed consistently in one
  place in the `Contract` context. Duplicating that derivation would be a boundary violation.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `Contract` owns baselines and changes; `Financial`/`Delivery` write snapshots; `Forecast` reads series |
| Data model / persistence | Separate tables per baseline type; DB-level immutability (revoked UPDATE/DELETE privileges plus a rejecting trigger) on As-Sold; append-only snapshot tables with a unique key on (project, week, correction_seq) |
| Formulas or metrics | Every variance metric in `METRIC_CATALOG.md` must name its baseline; trajectory metrics depend on snapshot series |
| Security model | Snapshot and baseline writes are audited; immutability violations are security events |
| Brand / design tokens | Unsecured upside requires a distinct, non-committed visual treatment (Phase 6) |
| Requirements affected | REQ-DATA-002/003/004/005/010, REQ-FIN-005, REQ-HLTH-004, REQ-MRGN-003 |
| Tests that must change | Integration test asserting As-Sold updates are *rejected*; as-of reconstruction tests |

## Migration implications

Greenfield. Phase 2 must land the temporal model and the immutability enforcement before Phase 3
generates data — retrofitting immutability after data exists means grandfathering whatever was
already mutated.

## Rollback path

Relaxing immutability is technically a privilege grant away, and that is exactly why it must never
be done casually. Any proposal to permit As-Sold restatement requires a superseding ADR that
explains how deterioration detection remains valid without a fixed reference point.

**Reconsider if:** a real-world contract novation genuinely replaces the original agreement. The
answer even then is a *new* As-Sold baseline record with a successor link — not an edit.

## Verification

- Integration test: `UPDATE` and `DELETE` against As-Sold rows are rejected by the database
  (REQ-DATA-003).
- Integration test: as-of query for a past week returns that week's values, unaffected by later
  snapshots (REQ-DATA-005).
- Golden test: a pending change does not alter forecast revenue; executing it does (REQ-FIN-005).
- Grep gate: no `Date.now()` or `new Date()` without argument in domain code.

## Open questions

- OQ-2 (revenue recognition method) determines how snapshots compute recognised revenue. Confirm in
  Phase 2 before data generation.
- Whether ad-hoc event-triggered snapshots (milestone completion, CR execution) supplement the
  weekly cadence — decide in Phase 3 when scenario needs are concrete.
