# ADR-0007 — Operational and analytical data strategy

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `platform/persistence`, all contexts owning a schema; REQ-DATA-003/005/010, REQ-PORT-003, AC-7
- **Supersedes:** —

---

## Context

ADR-0001 fixes one PostgreSQL database for the POC and ADR-0003 fixes an append-only weekly snapshot
model. Neither says what happens when the portfolio is not 48 projects but 5,000, and 18 months of
history is not 78 weeks but 260.

The arithmetic: ~48 × 78 ≈ 3.7 k snapshot rows today, ~5,000 × 260 ≈ 1.3 M at target, and roughly a
hundred derived values each — order 130 M narrow rows. That is not a large table, but it is
comfortably past the point where a portfolio view can scan history on read.

The risk is not the volume. It is that the natural fix — letting a reporting query join across
context schemas, or letting a screen read a materialised view directly — would dissolve the context
boundaries from underneath, quietly, while every test still passes.

## Decision

1. **POC: one PostgreSQL serves both workloads**, schema per context, no cross-context foreign keys
   and no cross-context joins (restating ADR-0001 §3 as a persistence rule).
2. **Money is `NUMERIC(18,4)` with an adjacent currency column; rates and ratios are
   `NUMERIC(12,6)`.**
3. **Immutability is enforced by two independent controls**, not one: revoked `UPDATE`/`DELETE`
   privileges *and* a rejecting trigger, on As-Sold baselines and on the audit table. One control can
   be granted back by accident; two cannot be undone silently.
4. **Snapshots are keyed `(project, week, correction_seq)`** and partitioned by week at scale.
5. **Migrations are ordered and forward-only**, one file per change, each naming the context and the
   ADR or requirement that motivated it. A `down` path exists for local development only.
6. **Any read model or projection must be fully recomputable from L1 plus a rule version.** A
   projection that cannot be rebuilt is a second system of record and is prohibited.
7. **The future operational/analytical split is fed by CDC from the operational store**, and changes
   no domain contract: contexts depend on `Repository`, `AppendOnlyStore` and `UnitOfWork`, never on
   SQL, a connection, or a schema.
8. **A feature store is conditional on ML forecasting arriving**, which `PRODUCT_SPEC.md` §4.2
   defers. It is not planned work.

Detail: `docs/architecture/DATA-PLATFORM.md`.

## Rationale

- **Two immutability controls rather than one** is proportionate to what immutability is protecting.
  ADR-0003 calls baseline laundering the pathology the product exists to counter; a single revocable
  grant is a thin defence against the organisation's most natural instinct.
- **No cross-context foreign keys** is what keeps the monolith splittable. Foreign keys make the
  database enforce a coupling the code has agreed not to have, and the first extraction attempt is
  where that gets discovered.
- **The recomputability rule** is what makes a warehouse safe. Analytical stores drift from their
  source; one that is a derived cache of a reproducible function cannot drift into being authoritative.
- **CDC rather than dual writes** keeps exactly one writer for the operational truth.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **One database forever** | Fine to ~1 M snapshot rows. Beyond that, portfolio-history scans compete with interactive reads for the same buffers. Deferring the split is right; pretending it will never come is not. |
| **Separate database per context now** | Buys the isolation the boundaries already give logically, and costs the single transaction boundary that makes the margin bridge reconcile (ADR-0001 §Rationale). |
| **Dual writes to OLTP and warehouse** | Two writers, two truths, and reconciliation bugs that surface as an executive number that does not match itself. CDC has one writer. |
| **Event sourcing as the analytical feed** | Rejected in ADR-0001 on complexity budget; nothing here changes that. |
| **Materialised views read directly by surfaces** | Fast, and it moves metric definitions into SQL outside the owning context — `PRODUCT_SPEC.md` §8.2's definition of a defect. |
| **Single immutability control (revoked grant only)** | The cheapest possible mistake — a grant restored during a debugging session — would be the most damaging one. |

## Consequences

**Positive**
- The split is a swap of the adapter behind `AppendOnlyStore`, not a rewrite.
- Immutability survives a careless privilege change.
- Read models cannot silently become authoritative.

**Negative / accepted costs**
- No cross-context joins means some reads are two calls where one SQL statement would do.
- Forward-only migrations mean a bad migration is fixed by another migration.
- Partitioning and CDC are real operational work, deferred rather than avoided.

**Neutral but notable**
- At POC volume none of this is load-bearing for performance. It is load-bearing for *not having to
  redesign* when volume arrives.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | Each owns a schema namespace; none may reach another's |
| Data model / persistence | Numeric precision, key shapes, partitioning, migration policy |
| Formulas or metrics | None directly; enforces that formulas stay out of SQL |
| Security model | Audit append-only enforced by privilege, per `SECURITY_MODEL.md` §5.3 |
| Brand / design tokens | None |
| Requirements affected | REQ-DATA-003, REQ-DATA-005, REQ-DATA-010, REQ-PORT-003, AC-7 |
| Tests that must change | Phase 2 adds the cross-schema FK check (debt DR-007) and the As-Sold rejection test |

## Migration implications

None — no schema exists. **Order matters:** Phase 2 must land the temporal model and both
immutability controls *before* Phase 3 generates data. Retrofitting immutability after data exists
grandfathers whatever was already mutated (ADR-0003 §Migration implications).

## Rollback path

The POC single-database decision is already ADR-0001's and is not being changed. The future split is
a forward step; rolling it back means pointing the analytical adapter at the operational store again,
which the contract permits. The rule that cannot be rolled back without a superseding ADR is
recomputability — abandoning it creates a second system of record.

**Reconsider if:** analytical scans measurably degrade interactive latency, or a data-residency
requirement forces regional separation.

## Verification

- Phase 2 integration test: `UPDATE`/`DELETE` on an As-Sold row is rejected by the database.
- Phase 2 integration test: an as-of query returns that week's values, unaffected by later snapshots.
- Phase 2 schema check: no foreign key crosses a schema boundary (closes DR-007).
- Phase 5: the audit table rejects `UPDATE`/`DELETE` for the application role.
- Any projection introduced must ship with a rebuild test proving it reproduces from L1.

## Open questions

- DQ-1 (read model vs compute-on-read) — Phase 4, deliberately.
- DQ-7 (cache tier) and DQ-10 (read replicas) — post-POC.
- OQ-1 (reporting currency and FX source) affects aggregate storage; Phase 2.
