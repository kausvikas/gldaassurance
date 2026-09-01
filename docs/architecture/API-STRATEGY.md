# API and BFF strategy

**DEMO — SYNTHETIC DATA** · Phase 1 · **Proposed as ADR-0006 — not implemented**

---

## 1. Shape

One HTTP API, task-shaped, serving one client. It is a **BFF** in the strict sense: its contracts are
defined by what a surface needs, not by what the domain contains.

```
Browser ──HTTPS──▶ BFF (/api/v1/…) ──▶ Application use case ──▶ Domain contexts
                     │                        │
                     │                        └─▶ authorization + audit  (the trust boundary)
                     └─ session, CSRF, schema validation, rate limiting
```

The BFF is a thin adapter over use cases. It owns transport concerns and nothing else: **no
authorization decision, no metric computation, no DTO invention.** If a route needs data three use
cases can supply, the answer is a fourth use case, not composition in the route handler — otherwise
the composition escapes the audit and authorization path.

### 1.1 Why a BFF rather than a resource API

The CDO's 30-second path (AC-1) is a composition problem. The Portfolio Command Center needs, in one
round trip: ranked projects, value at risk, deterioration flags, divergence counts and confidence
distribution — drawn from `portfolio`, `financial`, `health`, `forecast` and `data-quality`. Under a
resource-shaped API the browser makes five calls and assembles them, which is precisely the failure
mode `PRODUCT_SPEC.md` §8.4 names: authorization by conditional rendering, and aggregation in the
untrusted layer.

One endpoint per *decision*, not per *entity*:

| Endpoint | Serves | Requirement |
| --- | --- | --- |
| `GET /api/v1/portfolio/command-center` | The whole ranked view in one authorised call | REQ-PORT-001/002/003, AC-1 |
| `GET /api/v1/projects/{id}/health` | Score, contributions, rule version, three RAGs | REQ-PROJ-001/003 |
| `GET /api/v1/projects/{id}/evidence/{metricId}` | One drill step of the evidence chain | REQ-PROJ-002, AC-3 |
| `GET /api/v1/projects/{id}/margin-bridge` | Reconciling decomposition | REQ-MRGN-001/002, AC-4 |
| `GET /api/v1/projects/{id}/forward-risk` | Risks, early warnings, interventions | REQ-RISK-001/002 |
| `POST /api/v1/projects/{id}/interventions` | Create an owned, time-boxed intervention | REQ-RISK-003 |
| `POST /api/v1/projects/{id}/rag-override` | Override with actor, reason, expiry | REQ-HLTH-007 |
| `POST /api/v1/assistant/query` | Grounded answer with citations | REQ-AI-001/002/005 |
| `GET /api/v1/audit` | Audit query by actor, entity, window | REQ-SEC-007 |

### 1.2 REST-shaped, not GraphQL

GraphQL's field-level flexibility is genuinely attractive for an evidence-chain UI. It is rejected
for this product because a client-composed query graph makes field-level authorization
(REQ-SEC-004) a per-resolver concern, and "authorization in two places is authorization in neither"
(`SECURITY_MODEL.md` §2 B3). A fixed set of authorised projections keeps redaction in one place, at
serialisation, where ADR-0005 §4 puts it.

---

## 2. Response contract

Every response carries the same envelope:

```jsonc
{
  "data":       { /* view-model, provenance-enveloped values */ },
  "asOf":       "2026-08-31T00:00:00Z",
  "demoMarker": "DEMO — SYNTHETIC DATA",   // REQ-UX-005 — on every response, not just screens
  "degradation": {                          // present only when degraded
    "state": "STALE", "since": "2026-08-24T02:00:00Z", "affectedSources": ["psa"]
  }
}
```

Binding rules, each traceable:

| Rule | Why | Authority |
| --- | --- | --- |
| Money is `{ amount: "1234.5678", currency: "USD" }` — a **string** | A JSON number is a float by the time the browser parses it | ADR-0002 §3 |
| Every value carries a provenance envelope | A value without one may not be rendered | ADR-0004 §1, REQ-UX-004 |
| A non-computable ratio is `{ percent: null, notComputableReason: "ZERO_DENOMINATOR" }` | Never `NaN`, never a silent dash | ADR-0002 §8 |
| Unauthorised fields are **absent** — not `null`, not `"***"` | A null discloses that the field exists and applies | ADR-0005 §4 |
| Out-of-scope entity → identical response to a non-existent one | No existence disclosure | `SECURITY_MODEL.md` §4.5 |
| Errors are generic to the client; detail is server-side under a correlation id | No internal identifiers, SQL, or scope reasoning leaks | `SECURITY_MODEL.md` §4.5 |
| `asOf` on every response | Stale data must be detectable, not merely plausible | REQ-DQ-004 |

---

## 3. Versioning

**URI-prefixed major version, additive minor evolution.**

- `/api/v1/…`. The major version changes only for a breaking change and both versions run
  concurrently through a deprecation window.
- **Additive is not breaking:** new optional field, new endpoint, new enum member the client is
  required to tolerate. Clients must ignore unknown fields — stated in the contract, not assumed.
- **Breaking:** removing or renaming a field, narrowing a type, changing a unit or currency
  convention, changing the *meaning* of a field while keeping its name. The last is the dangerous
  one and is the reason for the next rule.

### 3.1 Metric and rule versions are separate from API versions

This is the part that is specific to this product and is easy to get wrong.

| Version | Governs | Changes when | Visible where |
| --- | --- | --- | --- |
| **API version** (`v1`) | Wire shape | A field's shape or presence changes incompatibly | URI |
| **Metric catalog version** | What a metric *means* | A formula changes (`METRIC_CATALOG.md` §1.1 rule 3 — requires an ADR and a version bump) | Response payload, per value |
| **Rule version** (`HEALTH-v1`) | Thresholds, weights, banding | Calibration changes | `ruleVersion` in the provenance envelope |

A health score changing from 68 to 61 because thresholds were recalibrated is **not** an API change.
It is a rule version change, and the client must show it as such. Collapsing these three into one
version number would either freeze calibration or silently restate history — and ADR-0004 §5's
promise that Phase 12 can answer "why was this Amber in June?" depends on them staying separate.

### 3.2 Deprecation

`Deprecation` and `Sunset` headers on the older major, a changelog entry, and a minimum one-phase
overlap. In the POC there is one client and one version, so this is a rule stated in advance rather
than a process being exercised — recorded so that the first breaking change has a procedure to
follow instead of a decision to make under pressure.

---

## 4. Transport and session

Per `SECURITY_MODEL.md` §3 and §7, restated here as API obligations:

- Opaque server-side session in an `HttpOnly; Secure; SameSite=Lax` cookie. **No token in local
  storage** — XSS-reachable.
- Anti-CSRF token on every state-changing request.
- Schema validation at the boundary, rejecting unknown fields. An undeclared field is not silently
  accepted (REQ-SEC-005 applied to input).
- Rate limiting on authentication and assistant endpoints at minimum.
- Strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors deny`, HSTS.

---

## 5. What Phase 1 does not build

No HTTP server exists. `PHASE_HANDOFF.md` §3.3 forbids introducing a network dependency in this
phase, and `ARCHITECTURE_DECISIONS.md` §3 forbids implementing a proposed ADR. What exists is the
layering contract at `src/app/index.ts` — the single public surface the presentation layer may
import — so that when the BFF lands in Phase 5 it is a transport adapter over an existing
authorization boundary rather than a new one.
