# Observability architecture

**DEMO — SYNTHETIC DATA** · Phase 1 · **Proposed as ADR-0009 — not implemented**

OpenTelemetry concepts, vendor-neutral. The POC emits nothing; what follows is the design and, more
importantly, the boundary between observability and audit — the one part of this that is
product-specific rather than standard practice.

---

## 1. Observability is not audit, and the distinction is load-bearing

| | Observability | Audit |
| --- | --- | --- |
| Question | Is the system healthy and fast? | Who saw what, who changed what? |
| Consumer | Engineers | CISO, assurance, Phase 12 review |
| Store | Telemetry backend, sampled, short retention | PostgreSQL, append-only, never sampled |
| Loss | Acceptable | **Not acceptable** — a failure to audit fails the operation |
| Contains | Ids, counts, durations, status | Actor, entity, fields, decision |
| Contains commercial values | **Never** | Field *names*, never values |

They are separate systems and must stay separate. A trace is sampled, best-effort and often
third-party-hosted; an audit record is legal evidence. The realistic failure is convenience-driven:
someone adds `margin=0.114` as a span attribute to debug a calculation, and
`COMMERCIAL_CONFIDENTIAL` data leaves for a telemetry vendor with no audit record and no
authorization check. `SECURITY_MODEL.md` §7 already forbids full commercial payloads in application
logs; the same rule applies to spans, and §4 below makes it explicit.

Both share one field: **`correlationId`**. Given an audit record, an engineer can find the trace;
given a trace, an auditor can find the audit record. That is the intended and only coupling.

---

## 2. Traces

One trace per request, propagated W3C `traceparent`.

```
GET /api/v1/portfolio/command-center
├─ bff.request                      { http.route, user.role }
├─ authz.resolve_scope              { scope.node_count, entity_set.size }
├─ portfolio.gather_inputs
│  ├─ financial.economics           { project.count }
│  ├─ health.assess                 { rule.version = "HEALTH-v1" }
│  └─ forecast.trajectory           { window.weeks = 8 }
├─ portfolio.aggregate              { metric.id = "MET-PORT-003" }
└─ dto.redact                       { fields.removed = 4 }
```

Spans worth having on purpose, because each answers a question that has been asked of this kind of
system before:

| Span | Answers |
| --- | --- |
| `authz.resolve_scope` | Is scope resolution the bottleneck as the hierarchy deepens? |
| `dto.redact` with `fields.removed` | Is redaction actually happening on this path? A zero here for a `DELIVERY_MANAGER` on a commercial route is a finding |
| `*.assess` with `rule.version` | Which ruleset produced this run |
| `portfolio.aggregate` with `metric.id` | Which aggregate is expensive at portfolio scale |

---

## 3. Metrics and logs

**Metrics** — RED for the API (rate, errors, duration), plus product-specific gauges that are cheap
and diagnostic:

| Metric | Why it earns its place |
| --- | --- |
| `authz.denials` by role and capability | A denial pattern is a signal, not noise (ADR-0005 §6) |
| `ingestion.freshness_seconds` by source | Directly backs `MET-DQ-002` and the degradation banner |
| `ingestion.quarantined_batches` | Reconciliation failures that would otherwise be invisible |
| `recompute.duration` by project count | The number that decides DQ-1 in Phase 4 |
| `assistant.declines` by reason | REQ-AI-006 working, or the assistant being uselessly cautious |
| `provenance.render_rejections` | A value reaching presentation without an envelope — should be zero |

**Logs** — structured, correlation-id-carrying, and subject to `SECURITY_MODEL.md` §7: no secrets, no
credentials, no `PERSONAL_DATA`, no full commercial payloads. Error detail is server-side under a
correlation id; the client sees a generic message.

---

## 4. The telemetry redaction rule

> **No `COMMERCIAL_CONFIDENTIAL` or `PERSONAL_DATA` *value* may appear in a span attribute, a metric
> label, or a log line. Field *names*, entity ids, and counts may.**

`margin.value = 0.114` is prohibited. `fields.removed = ["margin","costRate"]` is fine and is
exactly what makes a redaction bug detectable.

This must be enforced, not documented, or it will decay in the first difficult debugging session.
The proposed mechanism (ADR-0009): a single telemetry facade in `src/platform/observability` whose
attribute setter accepts only declared, classified keys, plus an architecture gate forbidding direct
imports of the OpenTelemetry SDK anywhere else — the same pattern that confines `decimal.js` to
`platform/decimal` today and is already enforced as `ARCH-006`.

---

## 5. What Phase 1 does not build

No SDK, no exporter, no facade module. ADR-0009 is `Proposed`; `ARCHITECTURE_DECISIONS.md` §3.1
requires an ADR before introducing a runtime dependency, and §3 step 7 forbids implementing one
before acceptance. The `correlationId` type already exists in `src/platform/authz` and is already a
required field on `AuditRecord`, so the join key between the two systems is in place before either
is built.
