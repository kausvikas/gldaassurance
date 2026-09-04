# Phase 13 — state location audit

> **Traced from source through the deployed runtime on 2026-09-04.** Nothing below is inferred from
> an interface. Where a claim is a measurement, the measurement is quoted.
>
> The audit was taken twice: **before** the fix, against revision `gldi-runtime-00003-6d7`, and
> **after** it, against `gldi-runtime-00009-gwc`. Both runs are kept. A document that recorded only
> the passing run would be evidence of nothing — the point of an audit is the delta.

## Method

Every object was traced to the field that actually holds it, then confirmed against the live
deployment by uploading a file, reading it back, forcing a cold start, and reading again.

## The audit

| # | Object | Where it actually lives | Survives a restart? |
| --- | --- | --- | --- |
| A | Frozen synthetic portfolio | **Static build** + regenerated in process from `DEFAULT_SEED`; `generatePortfolio` is a pure function | **Yes** — deterministic from the seed |
| B | Uploaded original file bytes | **Nowhere.** Bytes are parsed and discarded; no store holds them | **No** |
| C | Source metadata | `SourceRegistry.#sources` — a `Map` in **process memory** | **No** |
| D | SHA-256 fingerprint | Field on the receipt, inside `#sources` — **process memory** | **No** |
| E | Source versions | `LexicalKnowledgeIndex.#versions` — **process memory** | **No** |
| F | Confirmed schema mappings | Carried on the request, applied, then held only on the receipt — **process memory** | **No** |
| G | Project identity mappings | Rebuilt per call from `identityHub()` — **static code** | Yes (it is code) |
| H | Ingestion receipts | `RegisteredSource.receipts` — **process memory** | **No** |
| I | Staged records | `SourceRegistry.#staged` — **process memory** | **No** |
| J | Accepted observations | `SourceRegistry.#observations` — **process memory** | **No** |
| K | Quarantined records | Derived from `#staged` — **process memory** | **No** |
| L | Source authority registry | `SourceAuthorityRegistry.#grants` — **process memory**, seeded from static fixture config | Static grants yes; upload-time grants **no** |
| M | Source conflicts | Recomputed from `#observations` — **process memory** | **No** |
| N | Document metadata | `DocumentVersion.metadata` in `#versions` — **process memory** | **No** |
| O | PDF page text / chunks | `DocumentVersion.chunks` and `#chunks` — **process memory** | **No** |
| P | Retrieval index | `#postings`, `#chunks`, `#totalLength` — **process memory** | **No** |
| Q | Last-retrieval usage | `SourceRegistry.#uses` — **process memory** | **No** |
| R | Assistant conversation state | **Client memory**, echoed to the server per request and re-validated | Not applicable — the client holds it |
| S | Audit events | `InMemoryAuditLog` — **process memory** | **No** |
| T | Connector sync / watermark | `FixtureConnector.#state`, `#delivered` — **process memory** | **No** |
| U | Provider configuration | Cloud Run environment variables, read once at start-up | Yes |

## Measured, not asserted

Against the live public URL:

```
upload      → sourceId src-upload-mtn35zi0 · fingerprint 6ccda983aae1a423 · accepted 2 · quarantined 1
verify      → 200 · INGESTED_NOT_USED · accepted 2
cold start  → new revision deployed
verify      → 404 not_found
sources     → 7 listed · uploaded source absent · quarantined 0 · conflicts 0
```

## After the fix — the same sequence, re-measured

The store is Firestore (records) and Cloud Storage (original bytes), reached over REST with
metadata-server credentials. Seeded fixture content is deliberately **not** written: it is rebuilt
from code on every start, so persisting it would only mean reading a second copy back and
double-counting it. `useDurableStores` is called after the seed and before `hydrate`.

```
upload xlsx → src-upload-mtn4l7cc · 3 detected · 2 accepted · 1 quarantined · SUPPLEMENTAL · SANDBOX
upload pdf  → src-doc-mtn4l830 · 3 pages · 3 chunks · COMPLETE
              retained at gs://gldaassurance-knowledge/src-doc-mtn4l830/ver-5945d9929a5b
upload xlsx → src-upload-mtn4lcb5 · a restatement disagreeing on one project
before      → 13 sources · 4 quarantined · 1 conflict
cold start  → revision replaced (gldi-runtime-00009-gwc)
after       → 13 sources · 4 quarantined · 1 conflict · durable true
  verify src-upload-mtn4l7cc  200 INGESTED_NOT_USED      received=3 accepted=2 quarantined=1
  verify src-doc-mtn4l830     200 INGESTED_NOT_REACHABLE received=3 accepted=3 chunks=3
  verify src-upload-mtn4lcb5  200 INGESTED_NOT_USED      received=3 accepted=2 quarantined=1
  conflict financial.actualCost prj-002 → 2100000 (src-upload-mtn438y5) vs 2940000 (src-upload-mtn4lcb5)
```

Every count is identical either side of the restart, including the quarantined rows and the
disagreement — which is the assertion that matters most, because a conflict needs *both* sides to
have survived.

### A second defect, found only by measuring after the fix

The first post-fix run looked like this:

```
  verify src-upload-…  200 NOT_INGESTED  received=0 accepted=0 quarantined=0
```

Sources listed, observations intact, quarantined rows intact, conflict still detected — and the
receipt gone. An upload writes its source document twice: once on registration, with no receipts,
and again when the receipt is attached. Both writes were started concurrently, and the store is
entitled to apply two `PATCH`es to one document in either order, so the empty registration landed
last often enough to matter.

Durable writes are now issued through a serial queue, and callers pass a thunk rather than a started
promise — ordering cannot be restored after a request is already in flight.
`tests/integration/durable-knowledge.test.ts` reproduces the race with a store whose writes complete
out of order, and fails against the concurrent implementation.

## Findings (before the fix — retained)

**P0-1 — uploaded knowledge does not survive a restart.** Everything in rows B–Q and S–T is
process-local. Cloud Run scales to zero, cold-starts, and may run up to three instances with no
affinity between requests, so this is not a theoretical exposure: a source ingested by one instance
is invisible to the next request, and a receipt shown to a user describes something that no longer
exists. Under §4 this is unambiguous.

**P0-2 — a second consequence of the same defect, separately damaging.** The Knowledge & Connections
page is rendered at build time from a registry that has four uploaded sources; the live API's
registry has seven and no uploads. The page and the API disagree about what has been ingested, which
is the cross-surface class §48 prohibits, arriving through the state layer rather than the metric
layer.

**Not a finding — row A.** The portfolio is regenerated from its seed rather than read from disk, so
it survives restarts by construction. That is why the executive surfaces were unaffected by any of
the above, and it is worth stating: the durability defect was confined to *added* knowledge, which is
also why nothing in the frozen baseline moved.

**Not a finding — row R.** Conversation state living on the client is a deliberate decision
(ADR-0032): the runtime is stateless, and a forged state can only request reads the caller's own
resolved scope already permits.

## The table, after the fix

Rows A, G, R and U are unchanged. The rest now read:

| # | Object | Where it lives now | Survives a restart? |
| --- | --- | --- | --- |
| B | Uploaded original file bytes | Cloud Storage, at `sourceId/versionId` — **never at a filename** | **Yes** |
| C, D, H | Source metadata, fingerprint, receipts | Firestore `sources`, one JSON document per source | **Yes** |
| E, N, O, P | Versions, document metadata, chunks, retrieval index | Firestore `documentVersions` / `documentCurrent`; the index is **derived** from them at start-up rather than stored, so there is no second copy of the corpus to fall out of step | **Yes** |
| I, K | Staged and quarantined records | Firestore `staged`, keyed by idempotency key | **Yes** |
| J, M | Observations and conflicts | Firestore `observations`; conflicts recomputed, never cached | **Yes** |
| L | Authority grants | Static grants from code; upload-time grants re-derived from the source's mapped concepts on hydrate | **Yes** |
| Q | Last-retrieval usage | Firestore `uses` | **Yes** |
| S | Audit events | `AuditRepository` exists and Firestore-backed; the in-memory log is still what the assistant writes to | **Partly — see below** |
| T | Connector sync watermark | `FixtureConnector.#state` — **process memory** | **No** |
| F | Confirmed schema mappings | On the receipt, which is now durable | **Yes** |

### Two rows that are still honest "no"

**Row T** — a fixture connector's watermark. A fixture has no real endpoint and re-derives its
records from code, so a lost watermark costs nothing and persisting it would be persisting a
property of a synthetic object. A *real* connector's watermark must be durable, and
`docs/REAL_GL_CONNECTOR_ONBOARDING.md` §3 step 6 says so.

**Row S** — the audit log. `AuditRepository` is implemented and wired into `DurableStores`, and the
assistant's audit path still writes to the in-memory log. This is **declared, not done**: an
execution-lineage record that does not survive the process is of limited forensic value, and calling
it durable because the port exists would be exactly the "scaffolding described as wiring" defect
this phase was opened to find.
