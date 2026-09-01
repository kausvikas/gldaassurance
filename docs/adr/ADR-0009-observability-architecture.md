# ADR-0009 — Observability on OpenTelemetry, separated from audit

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `platform/observability` (new), Application layer; REQ-SEC-006, `SECURITY_MODEL.md` §7
- **Supersedes:** —

---

## Context

The system needs operational visibility, and `ARCHITECTURE_DECISIONS.md` §3.1 makes introducing a
runtime dependency an ADR-level decision.

The product-specific risk is not choosing a vendor. It is that this system already has a rigorous
record of who did what — the audit log — and telemetry looks superficially like the same thing.
Conflating them fails in a specific, predictable way: someone debugging a margin calculation adds
`margin=0.114` as a span attribute, and `COMMERCIAL_CONFIDENTIAL` data leaves the trust boundary for
a third-party telemetry backend, sampled, unaudited, and outside every control in
`SECURITY_MODEL.md`. `SECURITY_MODEL.md` §7 already forbids full commercial payloads in application
logs; spans are the same exposure with better ergonomics and worse visibility.

## Decision

1. **Adopt OpenTelemetry concepts** — traces, metrics, logs, W3C context propagation — vendor-neutral,
   with the backend chosen operationally (DQ-8).
2. **Observability and audit are separate systems with different guarantees.** Telemetry is sampled,
   short-retention and best-effort. Audit is append-only PostgreSQL, never sampled, and a failure to
   write fails the operation.
3. **They share exactly one field: `correlationId`.** It is already a required field on `AuditRecord`
   and already present in `AuthorizationContext`.
4. **The telemetry redaction rule:** no `COMMERCIAL_CONFIDENTIAL` or `PERSONAL_DATA` *value* may
   appear in a span attribute, metric label, or log line. Field *names*, entity ids, and counts may.
5. **Enforced, not documented.** A single facade in `src/platform/observability` whose attribute
   setter accepts only declared, classified keys, plus an architecture gate confining the
   OpenTelemetry SDK to that module — the same mechanism that confines `decimal.js` to
   `platform/decimal` and is already enforced as `ARCH-006`.
6. **Named spans and metrics** that answer questions this system will actually be asked:
   `authz.resolve_scope`, `dto.redact` with `fields.removed`, `*.assess` with `rule.version`,
   `authz.denials`, `ingestion.freshness_seconds`, `recompute.duration`, `assistant.declines`,
   `provenance.render_rejections`.

Detail: `docs/architecture/OBSERVABILITY.md`.

## Rationale

- **The separation is the decision.** Everything else here is standard practice; keeping commercial
  values out of telemetry is what is specific to this product, and it is the thing that would erode
  first under debugging pressure.
- **A facade with a classified key list** turns a discipline into a compile-time property. The same
  pattern is already proven in this codebase for `decimal.js`.
- **`dto.redact` with `fields.removed` is deliberately chosen**: it makes a redaction failure
  observable. A zero for a `DELIVERY_MANAGER` on a commercial route is a finding, and finding it in
  telemetry is far better than finding it in Phase 12.
- **`correlationId` as the only join** gives an engineer a path from an audit record to a trace
  without giving telemetry any of the audit record's content.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Use the audit log as telemetry** | Audit is unsampled and legally meaningful; adding latency spans to it destroys signal-to-noise and grows an append-only table with operational chatter. |
| **Use telemetry as audit** | Sampled, best-effort, often third-party-hosted. Fails REQ-SEC-006 outright. |
| **Vendor SDK directly (Datadog, New Relic)** | Faster to wire; couples the codebase to a vendor and makes the confinement rule harder to enforce. |
| **Plain structured logs, no tracing** | Adequate for a single process, and loses request-level causality exactly when the monolith starts splitting — the point at which it is hardest to add. |
| **Allow commercial values in spans behind a config flag** | A flag that must be off in production is a flag that will be on in staging with production-shaped data. |
| **Defer observability entirely to post-POC** | Tempting, and would leave `recompute.duration` unmeasured — the number DQ-1 is supposed to be decided on in Phase 4. |

## Consequences

**Positive**
- Debugging does not become an exfiltration path.
- Redaction failures are observable rather than latent.
- DQ-1 gets measured evidence rather than an estimate.

**Negative / accepted costs**
- The facade is friction: adding an attribute means declaring it.
- OpenTelemetry SDK weight in the runtime.
- Some debugging is harder because the value you want is exactly the value you may not log.

**Neutral but notable**
- The vendor decision is deliberately not made here; nothing architectural depends on it.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None — a new platform module only |
| Data model / persistence | None |
| Formulas or metrics | None |
| Security model | Extends `SECURITY_MODEL.md` §7 logging rules to spans and metric labels |
| Brand / design tokens | None |
| Requirements affected | REQ-SEC-006 (by separation), `SECURITY_MODEL.md` §7 |
| Tests that must change | Architecture gate extended to confine the OTel SDK; a test that the facade rejects an undeclared attribute key |

## Migration implications

None — nothing is instrumented. If accepted, the facade lands before the first span, so no
instrumentation is ever written against the raw SDK.

## Rollback path

Removing instrumentation is mechanical while it is confined to one module — which is itself an
argument for the facade. The rule that should not be rolled back is the redaction constraint; relaxing
it needs a superseding ADR explaining how commercial values in a third-party backend are consistent
with `SECURITY_MODEL.md` §1.

**Reconsider if:** the operational cost of the facade demonstrably slows incident response, or a
regulatory requirement forbids third-party telemetry entirely.

## Verification

- Architecture gate: no import of an OpenTelemetry package outside `src/platform/observability`.
- Unit test: the facade rejects an attribute key that is not declared, and rejects any key classified
  `COMMERCIAL_CONFIDENTIAL` or `PERSONAL_DATA`.
- Phase 12: adversarial review includes a search for commercial values in telemetry output.

## Open questions

- DQ-8 (backend and vendor) — post-POC, no architectural consequence.
- Sampling policy for traces once volume exists.
