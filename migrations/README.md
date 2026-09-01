# Migrations

Forward-only, ordered, one file per change. Each names the context it belongs to and the ADR or
requirement that motivated it (ADR-0007 §Decision 5).

**Executed and verified against real PostgreSQL 16.13.** DR-012 is **CLOSED**.

```bash
npm run db:verify     # drops, recreates, migrates from zero, runs 80 checks
```

The suite provisions a disposable `postgres:16-alpine` container, drops and recreates the database,
runs this chain from empty, and exercises the controls the DDL claims to install. It exits non-zero
on any failure. `scripts/ci/check-schema-boundaries.mjs` parses this SQL as *text*; `db:verify`
executes it — that difference was the whole of DR-012.

ADR-0007 §Decision 3 requires **two independent controls** on immutability — a revoked privilege
*and* a rejecting trigger — because one control can be granted back by accident. Both are now
verified to fire, separately: the trigger rejects a mutation by the table owner, and the privilege
rejects one by `gldi_app`.

| # | File | Context | Motivated by |
| --- | --- | --- | --- |
| 0001 | `0001_schemas_and_roles.sql` | all | ADR-0001 §Decision 3, ADR-0007 |
| 0002 | `0002_organization.sql` | organization | REQ-DATA-001 |
| 0003 | `0003_project_portfolio.sql` | project, portfolio | REQ-DATA-001, REQ-DATA-005 |
| 0004 | `0004_contract_baselines.sql` | contract | REQ-DATA-002/003/004, ADR-0003 |
| 0005 | `0005_financial.sql` | financial | REQ-DATA-006, REQ-FIN-001 |
| 0006 | `0006_delivery_quality_resource_risk.sql` | delivery, quality, resource, risk | REQ-DATA-001 |
| 0007 | `0007_snapshots_and_lineage.sql` | health, forecast, data-quality | REQ-DATA-005/010 |
| 0008 | `0008_identity_audit_assurance.sql` | identity, assurance | REQ-SEC-006/007 |

## The one defect the first execution found

`gldi_app` was granted `SELECT, INSERT` on two tables but was never granted **`USAGE` on any
schema**. The role therefore could not reach the tables at all: every authored `GRANT` was dead, and
every `REVOKE UPDATE, DELETE` was a no-op revoking a privilege that had never been held. The design
would have failed on first deployment.

Migration `0001` now grants schema `USAGE` to `gldi_app`. That is the minimum correction that makes
the *already designed* privilege model executable — no table privileges were added, and the per-table
`GRANT`/`REVOKE` statements remain the sole source of table access.

## Manual spot-checks (the suite runs these and more)

```sql
-- REQ-DATA-003: both controls must reject.
UPDATE contract.as_sold_baseline SET contract_value = 1 WHERE contract_id = '…';  -- expect: ERROR
DELETE FROM contract.as_sold_baseline WHERE contract_id = '…';                     -- expect: ERROR
UPDATE audit.audit_event SET action = 'READ' WHERE id = '…';                       -- expect: ERROR

-- ADR-0001 §Decision 3: no foreign key may cross a schema boundary.
SELECT c.conname, n1.nspname AS from_schema, n2.nspname AS to_schema
FROM pg_constraint c
  JOIN pg_class t1 ON t1.oid = c.conrelid  JOIN pg_namespace n1 ON n1.oid = t1.relnamespace
  JOIN pg_class t2 ON t2.oid = c.confrelid JOIN pg_namespace n2 ON n2.oid = t2.relnamespace
WHERE c.contype = 'f' AND n1.nspname <> n2.nspname;   -- expect: 0 rows
```
