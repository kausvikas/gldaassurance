# Resilience model

**DEMO — SYNTHETIC DATA** · Phase 1

The POC is a single process with a single database. Its blast radius is honestly small and honestly
total: if the process is down, the product is down. `SECURITY_MODEL.md` §9 already records the
absence of a DR/backup strategy as accepted POC risk. This document states what the architecture
must survive, what it currently does not, and which values are placeholders awaiting a business
owner.

---

## 1. Failure modes and responses

| Failure | POC behaviour | Target behaviour | Requirement |
| --- | --- | --- | --- |
| A source is unreachable | Serve last known good; expose degradation | Same, plus alerting on staleness threshold | REQ-DQ-004 |
| A source returns malformed data | Batch quarantined, not partially applied | Same, plus automatic re-drive after fix | — |
| Reconciliation mismatch | Quarantine; consistency metric drops; confidence band falls | Same, plus a named owner notified | REQ-DQ-003 |
| Recompute job fails | Prior snapshot remains authoritative; no partial overwrite | Retry with backoff, then alert | ADR-0003 §3 |
| Database unavailable | Application returns a generic error; no cached fallback | Read replica for read paths | — |
| LLM provider unavailable | Assistant declines; **all other surfaces unaffected** | Same | REQ-AI-006 |
| LLM returns an unusable answer | Decline rather than speculate | Same | REQ-AI-006 |
| Authorization policy fails to evaluate | **Deny.** Fail closed, audit the denial | Same | REQ-SEC-005 |
| Audit sink fails on a write | **Fail the operation.** A write that cannot be audited does not happen | Same | `SECURITY_MODEL.md` §5.3 |

The last two are the ones worth defending in a review. Both fail *closed*, and both are counter to
the usual availability instinct. An unauditable write in a system whose purpose is defensibility is
not a degraded success; it is a silent loss of the property the system exists to provide.

The LLM row is why `ai-intelligence` is isolated: the assistant is the only component with an
external runtime dependency, and its unavailability must not touch the Portfolio Command Center. The
import ban gives that property for free.

---

## 2. Retry policy

| Class | Retry | Rationale |
| --- | --- | --- |
| Transient infrastructure (connection reset, timeout) | Exponential backoff, jitter, bounded attempts | Standard |
| Source ingestion | Retry the batch; idempotency key makes re-delivery a no-op | §Integration §3 |
| Reconciliation mismatch | **No retry.** Quarantine and surface | Retrying a mismatch just produces the same mismatch, later |
| Authorization denial | **Never** | A retried denial is an attack pattern, not a transient fault |
| Assistant call | At most one retry, then decline | Latency budget; a slow answer is worse than a declined one |

---

## 3. Backup, RPO and RTO

**These are placeholders. No business owner has set them, and inventing them would be exactly the
kind of plausible-looking assumption this repository's process exists to prevent.**

| Data class | Proposed RPO | Proposed RTO | Reasoning | Owner |
| --- | --- | --- | --- | --- |
| Audit log | **0** — no acceptable loss | 4 h | An audit log with a gap fails its only purpose; must be synchronously durable | CISO |
| As-Sold baselines and contracts | 0 | 4 h | Immutable and irreplaceable; the reference point every variance depends on | Finance |
| Weekly snapshots | 1 week | 8 h | Recomputable from L1 given the rule version, so loss costs compute, not truth | Delivery Ops |
| Derived L2 values | ∞ — fully recomputable | 8 h | Pure function of L1 + rule version | — |
| Overrides and interventions | 0 | 4 h | The product's own system-of-record content; not recoverable from anywhere else | Delivery Ops |
| Synthetic demo data | ∞ | 1 h | Regenerable from seed with an identical content hash | — |

The interesting column is "reasoning". Two categories genuinely tolerate loss because they are
derived, and two tolerate none because nothing else holds them. That distinction is a consequence of
the L1/L2 separation — it is what makes a differentiated backup policy possible instead of backing
everything up as though it were equally irreplaceable.

**POC state:** no backups are configured. Recorded as debt DR-009, and already present in
`SECURITY_MODEL.md` §9.

---

## 4. Degradation is a first-class UI state

Not an error page. `ApplicationResponse.degradation` travels with every response, so a surface
cannot render as though everything were fine. This is the architectural expression of the constraint
that external source failure must not blank the UI: the product's job during a source outage is to
be **explicitly less certain**, not silently wrong and not blank.

---

## 5. What Phase 1 does not build

No retry logic, no circuit breaker, no backup job, no health check endpoint. The contracts that make
them expressible exist (`SourceFreshness`, `ApplicationResponse.degradation`); the behaviour arrives
with the components that need it.
