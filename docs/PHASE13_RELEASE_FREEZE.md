# Phase 13 — release freeze

> **DEMO — SYNTHETIC DATA.** Frozen 2026-09-04 against Cloud Run revision `gldi-runtime-00012-f5z`
> and the Firebase Hosting release serving `https://gldaassurance.web.app`.

## Status: **B — freeze with stated, accepted limitations**

Not A. Two P1s remain open and are named below rather than absorbed into a summary. Neither is on
§52's list of conditions that block a freeze; both are things a reader must be told before they
believe more of this than it can carry.

---

## 1 · What was proven, and how

Every line here is a measurement against the live public URL, not a reading of the code.

| Claim | Evidence |
| --- | --- |
| Uploaded knowledge survives a restart | Workbook + PDF + a restating workbook uploaded; revision replaced; 13 sources, 4 quarantined, 1 conflict, identical counts either side. `docs/PHASE13_STATE_LOCATION_AUDIT.md` |
| A document is still retrievable after a restart | `chunks=3`, `ingested=true`, on a fresh revision |
| A conflict survives, both sides of it | `financial.actualCost prj-002 → 2100000 vs 2940000`, after the restart |
| Quarantine survives | 4 quarantined rows, before and after |
| Original bytes are retained | `gs://gldaassurance-knowledge/src-doc-…/ver-…`, addressed by source and version, never by filename |
| Authority is re-derived, never read back | 4 grants restored, all `SUPPLEMENTAL`, none `AUTHORITATIVE` |
| The public API is closed | anonymous `ask` / `sources` / all three ingest routes → `401`, with a malformed body as well as a well-formed one; session without a code → `401` |
| A token cannot be forged or escalated | 4 forgeries refused, including a narrow caller's own token re-pointed at `exec.cdo` |
| Two callers are isolated | `exec.cdo` 75 projects, `dm.mobility` 0; the narrow caller does not receive the portfolio ranking |
| An ingest is refused where it would not persist | `503 ingestion_unavailable`, asserted in `server:check` |
| A model cannot widen scope through a plan | 7 end-to-end tests against the wired planner |
| Parsers refuse hostile files | 20 adversarial tests: traversal, encryption, zip bomb, XXE, cyclic page tree, formula injection |
| No credential reaches a client | `scan:secrets`: 620 files, 10 patterns, none found |

**Gates:** `verify` 1553 tests across 48 files · `server:check` 50/50 · `scan:secrets` PASS ·
`audit:links` 0 broken · `report:phase13` golden truth 11/11.

## 2 · The economics, frozen

| Figure | Value | Definition |
| --- | --- | --- |
| Portfolio contract value | **$453.47M** | `MET-PORT-001` = Σ `MET-FIN-002` contractual revenue (ADR-0039) |
| Forecast gross margin | **20.21%** | `MET-PORT-002` — weighted, `(Σ forecast revenue − Σ EAC) / Σ forecast revenue`, never a mean |
| As-sold gross margin | **25.46%** | same aggregation over as-sold |
| Margin at risk | **$35.95M** | sum of project exposure; deliberately not netted across shared root causes |
| Population | **75** fixed-bid projects | the assessed population, distinct from the authorised universe |

The Command Center, the API and the Assistant all report these. `report:phase13` re-derives them
from the running system and exits non-zero if one moves.

## 3 · Open, and accepted

| # | Finding | Severity |
| --- | --- | --- |
| 1 | The access code is a shared demo credential, not an identity — anyone holding it is whichever persona they choose | P1 |
| 2 | Audit lineage is not durable; `AuditRepository` is wired into `DurableStores` and the assistant still writes in-memory | P1 |
| 3 | Rate limiting is per-process; the real ceiling is `--max-instances 3` and the $25 budget | P2 |
| 4 | Parsers are not sandboxed — a recorded decision with trigger conditions, `docs/UPLOAD_THREAT_MODEL.md` §1 | P2 |
| 5 | No retention or deletion path for uploaded records and blobs | P2 |
| 6 | Three sources from the pre-fix revision remain listed with lost receipts | P3 |

## 4 · What this is not

- Not connected to any GlobalLogic system. Six connectors are labelled synthetic fixtures, and
  `CONNECTED` is not a value the status vocabulary contains.
- Not a system of record. Uploads reach `SANDBOX` and no code path promotes them further, which is
  why nothing anyone adds can move an executive figure.
- Not using a model for anything numeric. `AI_PROVIDER=none` in production; every answer says which
  composer wrote it.
- Not proof of production authorization. The authorization *path* is real and fully exercised; the
  *identity* is a demo fixture.
