# ADR-0037 — One connector contract, honest status, and no invented schemas

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `src/contexts/integration`, `docs/ENTERPRISE_INTEGRATION_MATRIX.md`
- **Extends:** ADR-0008, ADR-0035

---

## Context

Delivery Intelligence claims to sit above GlobalLogic's delivery systems — Finance/ERP, Salesforce,
a PSA, Jira or Azure DevOps, the Delivery Assurance platform, Tableau, and contract repositories. The
POC has credentials for none of them.

There are two dishonest ways to demonstrate this and one honest one. The dishonest ways are to invent
plausible schemas and endpoint names (which a reviewer who knows the real systems will catch, and
which would be wrong in ways that matter to an integration estimate), or to label a fixture
`CONNECTED` (which is a lie in exactly the surface whose job is to tell the truth about data).

## Decision

1. **One `EnterpriseConnector` interface for all source domains**: `healthCheck`, `discoverSchema`,
   `preview`, `mapSchema`, `sync`, `getChanges`, `getLastSync`, `getProvenance`,
   `getAuthorityMetadata`. Adding a GlobalLogic system means writing an adapter, not touching the
   Assistant, the planner, the metric engines or any surface.
2. **Status vocabulary is closed and honest**: `REAL_VERIFIED`, `CONFIGURED_UNVERIFIED`,
   `ADAPTER_READY`, `FIXTURE`, `NOT_CONFIGURED`, `DEGRADED`, `SYNCING`, `ERROR`,
   `MAPPING_REVIEW_REQUIRED`. **A fixture is never rendered as connected**, and the word `FIXTURE`
   appears on the surface, not only in a tooltip. `CONNECTED` is not a value in the enumeration —
   `REAL_VERIFIED` requires a `healthCheck` that actually succeeded against a real endpoint.
3. **No GlobalLogic schema, object name, endpoint or authentication method is invented.** Where the
   real schema is unknown, the adapter declares the *canonical concepts it would supply* and carries
   a clearly-labelled synthetic fixture shaped by generic product knowledge of the category — and the
   integration matrix records `SCHEMA DISCOVERED: NO` for it. Generic product knowledge of Salesforce
   or Tableau is not evidence about GlobalLogic's tenant, and the matrix says so per row.
4. **All sync is server-side** (ADR-0010 §8). No connector credential, endpoint or response ever
   reaches the browser.
5. **Sync is idempotent by ADR-0008 §3's key.** Re-running a sync creates no duplicate canonical
   record. Schema drift is **detected and never silently remapped**: the source moves to
   `MAPPING_REVIEW_REQUIRED` and stops contributing new facts until a mapping is re-approved.
6. **Read-only, always.** No adapter implements a write, and the interface has no write method, so
   "write back to Salesforce" is not a permission that was withheld — it is an operation that does not
   exist.
7. **A connector supplies facts to the canonical model; the Assistant never queries a connector.**
   Cross-source questions are answered by governed services over canonical facts, so a multi-system
   answer is a governed join, never a model-performed one.

## Rationale

- **Status honesty is the product's core claim applied to itself.** A tool that tells a CDO their
  reported Green disagrees with the evidence cannot label a fixture as a live connection.
- **Refusing to invent schemas preserves the artefact's usefulness.** The integration matrix is the
  document an architect uses to scope real work; invented field names make it actively misleading.
- **Idempotency and drift detection are the two properties that are expensive to retrofit**, per
  ADR-0008. Building them against fixtures is cheap and proves the shape.
- **No write method** converts a policy into a type. `§78` lists write operations as prohibited; the
  strongest form of that prohibition is an interface in which they are unrepresentable.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Per-system bespoke interfaces** | Every new GlobalLogic system becomes an Assistant change. Fails §26 of the Phase 13 contract. |
| **Plausible invented schemas for realism** | Misleads the estimate, and a reviewer who knows the real system loses trust in everything else on the page. |
| **Label fixtures `CONNECTED` for the demo** | The one thing §33 prohibits by name. |
| **Scrape or OCR Tableau dashboards** | Prohibited by §36. Facts derived from pixels have no lineage and no authority. |

## Consequences

**Positive** — a real GlobalLogic system can be added as one adapter; the demo is credible to a
reviewer who knows these systems; the matrix is usable as scoping input.

**Negative / accepted costs** — six of the seven source domains report `FIXTURE` or `NOT_CONFIGURED`,
which is less impressive than six green ticks and is the only defensible position.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `integration` grows; it still imports no consumer. |
| Formulas or metrics | **None.** |
| Security model | Reinforces ADR-0010 §8. |

## Rollback path

Adapters are additive and inert without configuration; removing them removes fixtures only.

## Verification

- `tests/unit/connector-contract.test.ts` — every adapter satisfies the interface and none exposes a write.
- `tests/integration/connector-sync-idempotency.test.ts` — a repeated sync adds no record.
- `tests/integration/connector-schema-drift.test.ts` — a changed fixture schema produces
  `MAPPING_REVIEW_REQUIRED`, not a silent remap.
- `tests/unit/connector-status-honesty.test.ts` — no adapter without a successful real `healthCheck`
  can report `REAL_VERIFIED`.
