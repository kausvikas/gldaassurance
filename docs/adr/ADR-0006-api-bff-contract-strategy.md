# ADR-0006 — Task-shaped BFF and three-axis versioning

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Date accepted:** —
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** Application layer, Presentation layer; REQ-PORT-001…004, REQ-PROJ-001/002, REQ-SEC-002/004/005, AC-1, AC-3
- **Supersedes:** —

---

## Context

ADR-0001 fixes the internal layering but says nothing about how the browser reaches it. Two forces
pull in different directions.

The CDO's thirty-second path (AC-1) is a *composition* problem: the Portfolio Command Center needs
ranked projects, value at risk, deterioration flags, divergence counts and confidence distribution in
one view, drawn from five contexts. Under a resource-shaped API the browser makes five calls and
assembles them — which puts aggregation in the untrusted layer and invites exactly the anti-pattern
`PRODUCT_SPEC.md` §8.4 names as a defect.

Meanwhile ADR-0005 §4 requires redaction at serialisation, in one place. Any API shape that lets the
client choose its own projection multiplies the places redaction must be correct.

There is also a versioning trap specific to this product. Three things can change independently: the
wire shape, what a metric *means*, and how a rule is calibrated. A single version number would force
one of them to be frozen or to change silently.

## Decision

1. **One HTTP API, task-shaped, acting as a BFF.** Endpoints are defined by the decision a surface
   supports, not by the entities it touches. `GET /api/v1/portfolio/command-center` returns the whole
   authorised view in one call.
2. **The BFF owns transport only** — session, CSRF, schema validation, rate limiting, serialisation.
   It makes no authorization decision, computes no metric, and invents no DTO. Composition that a
   route handler would perform is instead a use case, so it stays inside the authorization and audit
   path.
3. **REST-shaped, not GraphQL.** A client-composed query graph makes field-level authorization a
   per-resolver concern; a fixed set of authorised projections keeps redaction where ADR-0005 §4 puts
   it.
4. **A uniform response envelope**: `{ data, asOf, demoMarker, degradation? }`. Money serialises as
   `{ amount: string, currency }`; every value carries a provenance envelope; a non-computable ratio
   is `{ percent: null, notComputableReason }`; unauthorised fields are absent.
5. **Three independent version axes**: API major version in the URI (`/api/v1`); metric catalog
   version, carried per value; rule version, carried in the provenance envelope. A recalibration
   changes the rule version and neither of the others.
6. **Additive change is not breaking.** Clients must ignore unknown fields — stated in the contract.
   Breaking changes get a new major, a deprecation window with `Deprecation`/`Sunset` headers, and
   concurrent operation.

Detail: `docs/architecture/API-STRATEGY.md`.

## Rationale

- **Task shape is what makes AC-1 achievable honestly.** One authorised call is both faster and safer
  than five, and it removes the temptation to aggregate client-side.
- **A thin BFF keeps the trust boundary singular.** The moment a route handler composes two use
  cases, there is a second place where scope and field rules must be right.
- **Rejecting GraphQL is a security decision, not a taste one.** Its flexibility is real; so is the
  cost of implementing REQ-SEC-004 per resolver.
- **Three version axes** are what let Phase 12 answer "why did this project show Amber in June?" The
  answer names a rule version. Collapsing versions would either freeze calibration or restate history
  silently — ADR-0004 §5 forbids the latter.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Resource-shaped REST** (`/projects`, `/metrics`) | Pushes composition to the browser, which is Zone 0. Five round trips for the Command Center, and aggregation in the untrusted layer. |
| **GraphQL** | Genuinely good fit for the evidence-chain drill (AC-3). Rejected because field-level authorization becomes per-resolver, and `SECURITY_MODEL.md` §2 B3 is explicit that authorization in two places drifts open. |
| **tRPC / typed RPC over the module boundary** | Excellent DX and strong typing. Rejected because it couples client and server release cycles and makes the wire contract implicit — the opposite of what a versioning policy needs. |
| **Single version number for API, metric and rule** | Simplest to explain. Forces recalibration to look like a breaking API change, or hides it entirely. Both are worse than three numbers. |
| **No versioning in the POC** | Defensible for a demo, and precisely how the first breaking change becomes an unplanned decision made under pressure. |

## Consequences

**Positive**
- One authorised call per decision; AC-1 is a design property rather than an optimisation.
- Redaction has exactly one home.
- Recalibration is expressible without lying about history.

**Negative / accepted costs**
- Task-shaped endpoints multiply as surfaces are added; each is a use case to authorise and audit.
- A new surface variant may need a new endpoint rather than a new query.
- Three version axes are more to explain than one.

**Neutral but notable**
- The POC has one client and one API version, so the deprecation policy is stated in advance rather
  than exercised.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None — the BFF sits above the Application layer |
| Data model / persistence | None |
| Formulas or metrics | Metric catalog version becomes part of the wire contract |
| Security model | Reinforces ADR-0005 §4; redaction stays singular |
| Brand / design tokens | None |
| Requirements affected | REQ-PORT-001…004, REQ-PROJ-001/002, REQ-SEC-002/004/005, REQ-UX-005 |
| Tests that must change | Phase 5 `tests/authz` asserts on the payload of these endpoints |

## Migration implications

None — greenfield. The BFF lands in Phase 5 alongside authentication. Phase 1 delivers only
`src/app/index.ts` as the single surface the presentation layer may import, so the BFF arrives as a
transport adapter over an existing boundary rather than creating one.

## Rollback path

Reversible until Phase 7 builds surfaces against these endpoint shapes. Reverting to resource-shaped
REST would require moving composition into the client, which would breach `PRODUCT_SPEC.md` §8.4 —
so the realistic rollback is a different task shape, not a different paradigm.

**Reconsider if:** a second, materially different client appears (a mobile app, a partner API), at
which point one BFF per client is the standard answer and this ADR should be superseded rather than
stretched.

## Verification

- Phase 5: `tests/authz` asserts unauthorised fields are absent from these payloads, not null.
- Phase 5: an unmapped route returns the deny-by-default response (REQ-SEC-005).
- Phase 7: the documented demo script completes the 30-second path within three interactions.
- Contract test: every response carries `asOf` and `demoMarker` (REQ-UX-005).

## Open questions

- DQ-6 (pagination and result caps) is deferred to Phase 7, when collection sizes are real.
- Whether the BFF deploys separately from the domain (DQ-9) is post-POC.
