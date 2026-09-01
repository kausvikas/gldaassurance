# ADR-0008 — Integration and ingestion model

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `integration`, `data-quality`, all fact contexts; REQ-DQ-002/003/004, REQ-DATA-005/010
- **Supersedes:** —

---

## Context

`PRODUCT_SPEC.md` §4.2 defers live integrations: the POC's only source is the synthetic generator.
But `integration` exists as a named context precisely so the seam is real before a real source
arrives (ADR-0001 §Consequences: "a named empty context is a decision; a missing one is an omission").

The architecture brief requires batch, event-driven and CDC-ready ingestion, durable staging,
canonicalisation, idempotency and reconciliation, and last-known-good behaviour. All of those are
cheap to design now and expensive to retrofit — particularly idempotency, which determines whether a
re-delivered batch double-counts a cost total.

There is also a hard product constraint: "External source failure must not blank the UI; expose
freshness/degradation." A product whose central claim is early detection cannot go blank when a
source hiccups, and — worse — must not serve yesterday's number as though it were today's, because a
number that has stopped moving is itself a deterioration signal.

## Decision

1. **Pipeline:** adapter → durable staging → validation → canonicalisation → reconciliation → L1,
   with a quarantine for anything that fails validation or reconciliation.
2. **Staging retains the raw payload as it arrived**, with its idempotency key, `observedAt` and
   `receivedAt`. Canonicalisation is lossy; staging is where the loss is recoverable from.
3. **Idempotency key = source system + source natural key + source version.** Never a generated id,
   never a payload hash. Same key and version re-delivered is a no-op; a higher version is a
   correction, appended.
4. **Ordering is never assumed.** Records carry `observedAt`; late arrival is normal.
5. **Corrections append**, carrying a `corrects` reference — never an update to a canonical row
   (ADR-0003 §3).
6. **Reconciliation is mandatory per batch**: record counts and control totals asserted against the
   source's own. A mismatch quarantines the whole batch for that context; partial application is
   prohibited.
7. **Reconciliation failure is a data-quality event**, surfacing through `MET-DQ-003` and lowering
   `MET-DQ-005`, so an affected project carries a confidence qualifier rather than looking normal.
8. **Last known good** is served when a source is stale, degraded or unavailable, always dated and
   always accompanied by a `degradation` block in the response envelope.
9. **CDC readiness means three properties**, not a CDC implementation: stable natural keys,
   append-only canonical writes with `observedAt`, and an ingestion contract that accepts an
   unordered, possibly incomplete stream.
10. **`integration` imports no other context.** An adapter cannot reach the domain it feeds.

Detail: `docs/architecture/INTEGRATION-MODEL.md`.

## Rationale

- **The idempotency key choice is the single highest-value decision here.** A payload hash makes a
  cosmetic source change look like new data, which is how duplicate actuals enter a cost total and
  how a margin figure becomes indefensible.
- **All-or-nothing per batch** because half-ingested financials are worse than none: the product
  would show a confidently wrong number rather than an obviously incomplete one.
- **Routing ingestion failures into data confidence** rather than into an error log is what makes
  `PRODUCT_SPEC.md` §3.4 real. A stale project should look *less certain*, not normal.
- **Last known good, dated** — serving an undated stale number is indistinguishable from a fresh
  number that stopped changing, and the second is a signal this product exists to catch.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **No staging; canonicalise on arrival** | Simpler and loses the ability to answer "what did the source actually send on 12 June?" during a dispute — the exact question a controller asks. |
| **Payload-hash idempotency** | Trivial to implement; treats a whitespace change as new data. Duplicate cost rows are the failure this must prevent. |
| **Status flag flipped on re-delivery** | Same objection ADR-0003 §2 makes to pending-change status flips: loses history and permits a one-statement corruption. |
| **Best-effort partial application** | Higher availability, and produces reconciliation failures visible only as an unexplained number on an executive screen. |
| **Blank or error the UI on source failure** | Directly violates the stated constraint, and trains users to distrust the product for reasons unrelated to delivery. |
| **Implement CDC now** | No live source exists. Infrastructure with no producer, and readiness costs nothing to keep. |
| **A message broker for event ingestion** | Forbidden by ADR-0001 in the POC, and unjustified with one synthetic source. |

## Consequences

**Positive**
- A real adapter is an implementation of an existing contract, not a restructuring.
- Duplicate and out-of-order delivery are handled by construction.
- Source degradation is visible to the user as reduced confidence rather than as a silent wrong number.

**Negative / accepted costs**
- Staging duplicates data storage.
- All-or-nothing batches mean one bad record blocks a batch until quarantined and re-driven.
- Reconciliation requires the source to expose control totals; some will not, and those sources get a
  weaker guarantee that must be recorded rather than assumed.

**Neutral but notable**
- In the POC this pipeline has exactly one producer, the Phase 3 generator. Thin is fine; absent
  would not be.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `integration` gains the staging/freshness contracts; `data-quality` consumes freshness |
| Data model / persistence | Staging and quarantine tables; `observedAt` on canonical entities |
| Formulas or metrics | `MET-DQ-002` freshness and `MET-DQ-003` consistency are fed by this pipeline |
| Security model | Source credentials are server-side only; the browser never reaches a source |
| Brand / design tokens | Phase 6 needs a degradation treatment distinct from an error state |
| Requirements affected | REQ-DQ-002/003/004, REQ-DATA-005, REQ-DATA-010 |
| Tests that must change | Phase 3: re-delivery is a no-op; out-of-order arrival converges; a mismatched batch quarantines |

## Migration implications

None — greenfield. Phase 3's synthetic loader must implement this contract rather than writing to
contexts directly, or the seam exists in name only.

## Rollback path

Each element is independently reversible before Phase 3 wires the loader. After that, staging and
idempotency are structural. The element most likely to need revisiting is all-or-nothing batching, if
a real source proves too unreliable to deliver a clean batch — that would be a superseding ADR
stating what partial application does to `MET-DQ-003`.

**Reconsider if:** a live source cannot supply control totals, or event volume makes per-batch
reconciliation impractical.

## Verification

- Phase 3: re-staging the same batch produces no additional canonical rows.
- Phase 3: records delivered out of `observedAt` order converge to the same state.
- Phase 3: a batch failing its control total is quarantined whole, and `MET-DQ-003` reflects it.
- Architecture gate: `integration` imports no context (`ARCH-003`).
- Phase 7: a source marked `UNAVAILABLE` renders last-known-good with a dated degradation notice.

## Open questions

- Whether ad-hoc event-triggered snapshots supplement the weekly cadence — ADR-0003 leaves this to
  Phase 3.
- Per-source reconciliation capability is unknown until real sources exist; sources without control
  totals must be recorded as a weaker guarantee, not assumed equivalent.
