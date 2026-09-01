# ADR-0005 — Server-side authorization, scoping and audit

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Principal CTO / Architect + CISO review (Phase 0)
- **Phase:** 0
- **Affects:** `Identity`, `Organization`, `Assurance`, Application layer, all read paths; REQ-SEC-001 through REQ-SEC-010, AC-5
- **Supersedes:** —

---

## Context

This system concentrates the most commercially sensitive information a services organisation holds:
per-project margin, cost rates, pricing, contract terms, and internal judgements about which
accounts are failing. A leak is not an embarrassment; it is a commercial and contractual event.

The exposure is unusual in shape. It is not primarily "can this user reach this page?" It is:

- **Scope** — a Portfolio Director for EMEA must not see APAC projects.
- **Field** — a Delivery Manager may legitimately see their project's schedule and quality signals
  while seeing *nothing* about cost rates or margin (OQ-3).
- **Aggregate** — a portfolio total silently including projects outside the user's scope leaks
  information even though no project is named.
- **Assistant** — a natural-language interface is the most efficient exfiltration tool ever attached
  to a data set, if authorization is not enforced beneath it.

Meanwhile, the fastest way to build a demo is to fetch everything and filter in the client. That
produces a screen that looks correct and an API that hands the whole portfolio to anyone with a
session cookie and a browser devtools panel.

## Decision

### 1. The browser is untrusted. Always.

The trust boundary is the Application layer. Every request is authorized there, from scratch, on
every call. **UI conditional rendering is a usability affordance and never an access control**
(REQ-SEC-002, global invariant 7).

### 2. Deny by default

An unmapped route, an undeclared field, or a resource with no explicit grant is **inaccessible**
(REQ-SEC-005). New surfaces are invisible until deliberately permitted. This inverts the usual POC
failure mode where new endpoints ship open.

### 3. Three-dimensional authorization

Every access decision evaluates:

| Dimension | Question | Mechanism |
| --- | --- | --- |
| **Role** | What kind of actor is this? | RBAC — role → permission set |
| **Scope** | Which entities are in their remit? | Organisational scope resolved to an entity set (REQ-SEC-003) |
| **Field sensitivity** | Which attributes may they see? | Field classification → required permission (REQ-SEC-004) |

Field classifications: `PUBLIC_INTERNAL`, `DELIVERY_SENSITIVE`, `COMMERCIAL_CONFIDENTIAL`,
`PERSONAL_DATA`. Cost, rate, and margin fields are `COMMERCIAL_CONFIDENTIAL`.

### 4. Redaction happens server-side, at serialisation

Unauthorised fields are **removed from the payload**, not blanked, nulled, or greyed out in the UI.
The response must not reveal the existence, shape, or magnitude of what was withheld. Where the UI
needs to explain an absence, it renders "restricted" from the *absence*, not from a flag containing
the secret.

### 5. Aggregates are computed over the caller's authorised set

Portfolio totals, counts, averages and rankings are computed **after** scope filtering, in the same
query path. A total is never computed globally and then filtered for display. Aggregate leakage is
treated as a real finding, not a theoretical one (REQ-PORT-003).

### 6. Audit is immutable and covers reads

- **Every read of `COMMERCIAL_CONFIDENTIAL` data and every write** produces an audit record
  (REQ-SEC-006): actor, action, entity, fields, timestamp, request correlation id, authorization
  decision.
- Audit records are append-only and queryable by actor, entity, and time window (REQ-SEC-007).
- Denials are audited as well as grants. A pattern of denials is a signal.
- Audit writes are not optional and not conditional on success — a failed authorization is exactly
  the event worth recording.

### 7. The assistant inherits, never elevates

`AI Intelligence` executes every retrieval under the requesting user's authorization context
(REQ-SEC-010) through the same Application services (ADR-0004). It has no service account, no
elevated read path, and no pre-built index that spans scopes.

### 8. Even synthetic data is protected as if real

The POC enforces every control above against synthetic data. Security implemented "for real later"
is security never implemented, and a CISO reviewing the POC is reviewing the controls, not the rows.

## Rationale

- **Field-level redaction is the requirement most likely to be skipped and most likely to matter.**
  OQ-3 (rates hidden from delivery managers) is a realistic organisational constraint; a system that
  cannot express it cannot be deployed.
- **Removing rather than nulling** matters because a `null` in a margin field still tells the reader
  that a margin field exists on this project, and a zero tells them something worse.
- **Auditing reads, not just writes,** is what lets the CISO answer "who looked at the Nordics
  account's margin last quarter?" Read-auditing is unusual and is deliberate here given the
  sensitivity concentration.
- **Deny-by-default plus mechanical enforcement** is the only approach that survives eleven more
  phases of feature work under demo pressure.
- **AC-5 is written as a test, not an inspection,** precisely because UI-based verification of
  authorization is how organisations convince themselves they are safe while they are not.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Client-side filtering for POC speed** | Ships the entire portfolio to every session. The demo would look identical and be indefensible. Explicitly forbidden by global invariant 7. |
| **Route-level RBAC only** | Cannot express scope or field sensitivity — misses the two dimensions that actually matter here. |
| **Database row-level security (RLS) as the primary control** | Genuinely strong for scope, and worth revisiting post-POC. Rejected as *primary* because it cannot express field-level policy cleanly, complicates the single-process test story, and would place authorization logic where the Application layer's audit emission cannot see the decision. Not precluded as defence in depth. |
| **Nulling unauthorised fields** | Leaks schema and, by implication, existence. Cheap to get wrong, hard to notice. |
| **Post-query filtering of aggregates** | The classic aggregate-leak bug: correct-looking totals computed over unauthorised rows. |
| **Audit writes only** | Fails the "who saw the margin?" question, which is the one a CISO will actually ask of this system. |
| **Service account for the assistant** | Operationally convenient, and it converts the assistant into a universal read oracle. Categorically rejected. |

## Consequences

**Positive**
- AC-5 and AC-6 are provable by automated test rather than argued.
- The Phase 12 adversarial review has something real to attack.
- Scope and field policy are declared in one place, so a new surface inherits them rather than
  reinventing them.

**Negative / accepted costs**
- Every read path carries scope resolution and serialisation-time redaction — more machinery than a
  POC would otherwise need, and a small latency cost.
- Read-auditing generates substantial volume. Acceptable at POC scale; retention policy is post-POC
  debt.
- Field-level policy means DTOs vary by caller, which complicates response typing and caching.
  Caching of authorised responses must be keyed by authorization context or omitted (POC: omitted).

**Neutral but notable**
- Some demo scenarios become slightly harder to stage, because the demo user must genuinely have the
  right scope. This is a feature: it means the demo is exercising the real control.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `Identity` (roles, grants, sessions), `Organization` (scope hierarchy), `Assurance` (audit sink); Application layer enforces |
| Data model / persistence | Scope hierarchy must be queryable as an entity set; append-only audit table with no UPDATE/DELETE privilege |
| Formulas or metrics | Aggregate metrics must document that they are computed over the authorised set (`METRIC_CATALOG.md`) |
| Security model | This ADR is the backbone of `SECURITY_MODEL.md` |
| Brand / design tokens | Phase 6 needs a "restricted" treatment that reveals nothing about the withheld value |
| Requirements affected | REQ-SEC-001…010, REQ-PORT-003, REQ-HLTH-007, AC-5, AC-6 |
| Tests that must change | Dedicated `tests/authz` suite of **negative** tests per role × scope × field |

## Migration implications

Greenfield. Phase 5 delivers the enforcement layer, but Phase 2's canonical model must already carry
field classifications and the scope hierarchy — retrofitting classification onto an existing model
means classifying under deadline pressure, which reliably under-classifies.

## Rollback path

None. Weakening authorization is not a rollback, it is a security incident. Any change requires a
superseding ADR with CISO approval and a re-run of the full `tests/authz` suite.

## Verification

- `tests/authz`: for each role × scope × sensitive field, a **negative** test asserting the field is
  absent from the API payload (not merely hidden in the UI) — REQ-SEC-004, AC-5.
- Test: a request for an out-of-scope entity id returns the same response as a non-existent entity
  (no existence disclosure) — REQ-SEC-003.
- Test: portfolio aggregate for a scoped user excludes out-of-scope projects — REQ-PORT-003.
- Test: unmapped route returns denied — REQ-SEC-005.
- Test: reading a `COMMERCIAL_CONFIDENTIAL` field emits an audit record; a denied read emits one too
  — REQ-SEC-006.
- Test (Phase 11): assistant answer for a scoped user contains no out-of-scope facts — REQ-SEC-010.

## Open questions

- OQ-3 (are cost rates visible to Delivery Managers?) — assumed **no** for the POC. Sponsor must
  confirm; the authorization matrix in `SECURITY_MODEL.md` §4 changes if the answer changes.
- Audit retention and archival policy — post-POC.
