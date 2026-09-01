# DR-012 — PostgreSQL Execution Verification

- **Date:** 2026-08-29
- **Author:** Principal Database Architect / Financial Systems Architect / Independent Technical Reviewer
- **Scope:** Verification only. No persistence redesign, no new infrastructure, no new capabilities.
- **Result:** **DR-012 CLOSED** — 80 checks, 80 passed, 0 failed, from a clean rebuild.

---

## 1. Runtime

| | |
| --- | --- |
| PostgreSQL version | **16.13** (aarch64-unknown-linux-musl, Alpine) |
| Execution mechanism | Disposable Docker container `gldi-pg-verify`, image `postgres:16-alpine`, host port 55432 |
| How it was obtained | Docker Desktop was installed but the daemon was stopped. It was started for this verification |
| Migration framework | **None.** Plain ordered `.sql` files applied in filename order. No down migrations, and none required — the framework does not define them |
| Command | `npm run db:verify` → `scripts/db/verify-postgres.mjs` |

The verification script provisions the container if it is absent, drops and recreates the database,
runs the migration chain from empty, executes every check, and exits non-zero on any failure.
Confirmed: a deliberately broken assertion produced exit code 1.

---

## 2. Migration chain (Step 2)

8 migrations, executed in order from an empty database. **All succeeded on the first attempt** — no
DDL defect, no manual repair.

| Object | Count |
| --- | --- |
| Bounded-context schemas | 19 |
| Tables | 56 |
| Domains (`money_amount`, `rate_amount`, `ratio`, `currency_code`) | 4 |
| Immutability triggers | 28 |
| CHECK constraints | 120 |
| UNIQUE constraints | 51 |
| Indexes | 74 |
| Foreign keys | 26 |
| **Cross-schema foreign keys** | **0** |
| Float/real/double columns | **0** |

---

## 3. As-Sold immutability (Step 3)

Ten checks, all DB-level. Domain code was not involved.

| Test | Result |
| --- | --- |
| `UPDATE contract.as_sold_baseline SET contract_value` | **Rejected** — `Table contract.as_sold_baseline is insert-once…` |
| `UPDATE … SET budgeted_cost` | **Rejected** |
| `DELETE FROM contract.as_sold_baseline` | **Rejected** |
| Baseline value unchanged after all three attempts | ✅ `10000000.0000` |
| `UPDATE contract.executed_change` (delivery/commercial baseline) | **Rejected** |
| `UPDATE contract.baseline_revision` | **Rejected** |

**The approved model still works.** An executed contractual amendment appends
(`contract.executed_change`), and the Current Forecast remains separately revisable by appending a
second `baseline_revision` that supersedes the first. Immutability constrains restatement; it does
not prevent legitimate contractual change.

---

## 4. Privilege controls (Step 4)

Only roles already present in the authored design were tested. No production role architecture was
invented.

| Test | Result |
| --- | --- |
| `gldi_app` exists, `NOLOGIN`, not superuser | ✅ |
| `SET ROLE gldi_app` → `SELECT contract.as_sold_baseline` | ✅ succeeds |
| `SET ROLE gldi_app` → `INSERT audit.audit_event` | ✅ succeeds |
| `SET ROLE gldi_app` → `UPDATE contract.as_sold_baseline` | **Rejected** — `permission denied for table as_sold_baseline` |
| `SET ROLE gldi_app` → `DELETE contract.as_sold_baseline` | **Rejected** |
| `SET ROLE gldi_app` → `UPDATE audit.audit_event` | **Rejected** |
| `SET ROLE gldi_app` → `DELETE audit.audit_event` | **Rejected** |

`SET ROLE` from a superuser drops the session to that role's privileges, so these are genuine
privilege checks — **superuser execution was not treated as proof of privilege separation**, and the
denials are distinct from the trigger rejections in §3. ADR-0007 §Decision 3 asks for two independent
controls; both were exercised separately, and either alone would have looked sufficient.

### 4.1 The defect this step found

`gldi_app` had `SELECT, INSERT` grants on two tables but **no `USAGE` on any schema**. It could not
reach a single table. Every authored `GRANT` was dead, and every `REVOKE UPDATE, DELETE` was a no-op
revoking a privilege that had never been held — so the "revoked privilege" control did not exist in
any meaningful sense, and would have failed on first deployment.

**Correction:** migration `0001` now grants schema `USAGE` to `gldi_app`. That is the minimum change
that makes the *already designed* model executable. No table privileges were added; the per-table
`GRANT`/`REVOKE` statements remain the sole source of table access. The database was recreated from
zero and the full chain re-run afterwards.

### 4.2 Residual limitation → DR-017

Only **2 of 56 tables** carry `gldi_app` grants — the only two the migrations ever granted. The other
54 are unreachable by the application role, so a complete application-role privilege model does not
yet exist.

**This does not block REQ-DATA-003.** That requirement is that As-Sold writes are *rejected at the
persistence layer*: the rejecting trigger enforces it against every role including the table owner,
and it is verified above. Carried as **DR-017**, owned by Phase 5, which builds authentication and
authorization.

---

## 5. Monetary precision (Step 5)

| Test | Result |
| --- | --- |
| REAL / FLOAT / DOUBLE PRECISION columns anywhere | **0** |
| Every `money_amount` column | `NUMERIC(18,4)` |
| `0.1 + 0.2 = 0.3` in the money domain | **true** |
| Same comparison in `double precision` | **false** — which is why the domain exists |
| `28000000.0001` round-trip | exact |
| Sum of 1,000 × `0.01` | exactly `10.0000` |
| Negative amount where the design allows one | `-1500.0000` stored |
| 5th decimal at scale 4 | rounds to `12345.6789` |
| Value beyond precision 18 | **rejected** — `numeric field overflow`, not silently truncated |
| `rate_amount` / `ratio` scale | 6 / 6 |

---

## 6. Constraints (Step 6)

Seventeen checks against the **authored** constraints. No new invariants were added to the database.

Rejected as designed: risk probability > 1 · physical completion > 1 · project ending before it
starts · RAG override expiring before it was applied · RAG override with a blank reason ·
unsupported currency code · `includedInEtc` with no justification · `synthetic = false` (real data is
unstorable) · duplicate `(project, week, correction_seq)` · a correction that does not name what it
corrects · malformed ISO week identifier · a financial snapshot violating the **EAC identity**
(`EAC = ATD + ETC + committed`) · negative value at risk · a rule parameter with neither a value nor
a blocker.

Accepted as designed: a valid weekly snapshot, and a correction that *does* name what it corrects.

No invariant was found that documentation required of the database but the database did not enforce.

---

## 7. Recognised revenue history (Step 7)

| Test | Result |
| --- | --- |
| `ORIGINAL` posting accepted | ✅ `420000.0000` |
| `ORIGINAL` claiming to supersede something | **Rejected** |
| `ADJUSTMENT` naming nothing to supersede | **Rejected** |
| Posting superseding itself | **Rejected** |
| `ADJUSTMENT` appended with lineage | ✅ 2 postings for the period |
| `REVERSAL` + `RESTATEMENT` appended | ✅ 4 postings for the period |
| **Original unchanged after three corrections** | ✅ `420000.0000 \| v1 \| ORIGINAL` |
| `UPDATE` any posting | **Rejected** by trigger |
| `DELETE` any posting | **Rejected** by trigger |
| Duplicate `(source_record_id, source_version)` | **Rejected** |
| **Effective position reconstructs from the sequence** | ✅ `401000.0000` — 420,000 − 35,000 − 385,000 + 401,000 |
| Lineage resolves to an `ORIGINAL` sharing the source record, dated later | ✅ 3 of 3 |

Nothing was derived from physical progress, and no `billed ≤ recognised` rule was introduced.

---

## 8. Schema and bounded-context boundaries (Step 8)

| Test | Result |
| --- | --- |
| Foreign keys crossing a schema boundary | **0** — the approved policy holds |
| Within-context foreign keys where designed | 26 |
| Cross-context references as plain identifier columns | 6 `project_id` columns in `financial`, none of them a FK |

No cross-context FK was added, and none was found to remove.

---

## 9. Transaction atomicity (Step 9)

An existing multi-write authoritative workflow — insert `contract` → insert `as_sold_baseline` →
insert `risk` — was executed with the final write forced to fail on a CHECK constraint.

**Result:** zero rows survived in `contract.contract`, `contract.as_sold_baseline` and `risk.risk`.
No partial authoritative state remained. The rollback covered the immutable As-Sold insert, which is
the write that would have been most damaging to leave orphaned.

---

## 10. Declared indexes (Step 10)

74 indexes present after a clean migration. No speculative index was added.

| Spot-check | Count |
| --- | --- |
| `audit.audit_event` — the REQ-SEC-007 query paths (actor, entity, correlation) | 4 |
| `financial.recognised_revenue_fact` — PK, source uniqueness, period series, both lineage directions | 5 |
| `project.project_snapshot` — PK plus the descending week lookup | 2 |

---

## 11. Repeatability (Steps 11–12)

- Clean rebuild: database dropped, recreated empty, full chain re-run, full suite re-executed. **All
  evidence in this report comes from that run.**
- Run three times in succession plus once with the container removed entirely (the script
  re-provisions it): identical result each time.
- A deliberately broken assertion produced **exit code 1**, confirming the suite fails loudly.

```bash
npm run db:verify
```

---

## 12. Closure assessment

| DR-012 closure requirement | Met |
| --- | --- |
| Migrations execute from an empty database | ✅ |
| As-Sold immutability works | ✅ |
| Existing privilege controls verified to the extent implemented | ✅ — with DR-017 recorded |
| Monetary NUMERIC precision works | ✅ |
| Important authored constraints execute correctly | ✅ |
| Recognised Revenue history is append-only as designed | ✅ |
| Bounded-context DB relationships match the approved architecture | ✅ |
| One authoritative multi-write transaction proves rollback atomicity | ✅ |
| Declared indexes exist | ✅ |
| Clean rebuild succeeds | ✅ |
| Verification is repeatable | ✅ |
| No mandatory DB test skipped | ✅ |

**DR-012 CLOSED. REQ-DATA-003 → `IMPLEMENTED`** (previously `IMPLEMENTED_WITH_DEBT`), on the basis
that its stated requirement — As-Sold writes rejected at the persistence layer — is now verified
against real PostgreSQL by both designed controls.

**Not claimed:** a complete application-role privilege model (DR-017), load or performance
characteristics, backup and restore, or behaviour at production data volumes. None of those was in
scope, and none is implied by this report.
