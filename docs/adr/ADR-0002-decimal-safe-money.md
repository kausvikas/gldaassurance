# ADR-0002 — Decimal-safe money and deterministic financial computation

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Principal CTO / Architect (Phase 0)
- **Phase:** 0
- **Affects:** `Financial`, `Commercial`, `Contract`, `Forecast`, `Health`; REQ-FIN-001, REQ-FIN-008, REQ-FIN-009, REQ-DATA-006, AC-4, AC-7
- **Supersedes:** —

---

## Context

The product's central promise is that a CDO can look at a margin bridge and trust it. Acceptance
criterion AC-4 requires that decomposed margin causes sum **exactly** to the total delta — to the
cent — and AC-7 requires byte-identical outputs across runs.

IEEE-754 binary floating point cannot satisfy either promise. `0.1 + 0.2 !== 0.3` is not a curiosity
here; across a portfolio of hundreds of line items it produces residuals that show up on an
executive screen as an unexplained rounding line, and residuals in a margin bridge are precisely the
thing that makes a controller stop trusting a system.

Compounding this: JavaScript's `number` is a float, the presentation layer is JavaScript, and the
easiest thing in the world is to compute a total in a chart component.

## Decision

1. **All monetary and rate values are fixed-scale decimals.** Storage: PostgreSQL `NUMERIC` with
   explicit precision and scale. In-domain: an arbitrary-precision decimal library
   (e.g. `decimal.js` / `big.js`), wrapped in a `Money` value object.
2. **`Money` is a value object, not a number.** It carries `{ amount: Decimal, currency: ISO4217 }`.
   It is immutable. Arithmetic is via methods; the type system must make raw `+` on money a
   compile error.
3. **Money never crosses a boundary as a JS `number`.** Serialisation is a string amount plus a
   currency code. A `number` appearing where money is expected is a defect, caught by lint and type.
4. **The browser never computes money as the system of record.** The presentation layer receives
   computed, rounded, formatted values from the Application layer. Client-side arithmetic is
   permitted only for ephemeral visual affordances (bar widths, positions) and never for a displayed
   figure.
5. **Rounding is deliberate, single-policy, and applied at presentation only.**
   - Intermediate computation carries full precision — no rounding between steps.
   - Presentation rounding: half-up ("banker's rounding" is *rejected* here, because executives
     reconcile against invoices, which round half-up).
   - Currency scale from ISO 4217 (2 for USD/EUR/GBP; 0 for JPY).
   - Where a rounded set must sum to a rounded total (allocations, decompositions), use **largest
     remainder allocation** so the parts sum to the whole. A visible residual line is permitted only
     when it is a genuine, named business residual — never a rounding artifact.
6. **Currency is explicit on every amount.** Aggregating mixed currencies without conversion is a
   runtime error, not a silent sum. Conversion requires an FX rate with a rate date and source; the
   converted result records both (REQ-DATA-006).
7. **Aggregations are order-independent and associative** and this is tested with property-based
   tests over shuffled inputs (REQ-FIN-008).
8. **Division guards.** Every ratio metric (margin %, CPI, SPI) defines its zero-denominator
   behaviour in `METRIC_CATALOG.md` and returns an explicit "not computable" state — never `NaN`,
   `Infinity`, `0`, or `null` silently rendered as a dash.

## Rationale

- Exactness is not a quality attribute here; it is the product. A margin bridge that does not
  reconcile is worse than no margin bridge, because it teaches the executive to distrust the tool.
- Half-up over banker's rounding is a deliberate, non-obvious choice: statistical unbiasedness is
  irrelevant when the user's mental model is an invoice. Matching the finance team's arithmetic
  matters more than matching a statistician's.
- Largest-remainder allocation eliminates the single most common cause of "the parts don't add up"
  in decomposition views — exactly what Phase 9 is built on.
- Making `Money` a type rather than a convention means Phase 9 cannot accidentally reintroduce
  floats under deadline pressure.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Integer minor units (cents) as `bigint`** | Genuinely exact and fast, and a defensible choice. Rejected because rates, percentages and effort-hours in this domain need sub-minor-unit precision (a blended rate of $87.335/hr, a 0.5% escalation), which forces a second numeric strategy and a conversion seam between them. One decimal representation everywhere is simpler to keep correct. |
| **JS `number` with rounding discipline** | Fails AC-4 and AC-7. Discipline is not enforceable across 12 phases. |
| **`NUMERIC` in the database, floats in the app** | The worst of both: exact at rest, lossy in exactly the layer that does the computing. |
| **Compute money in the client for responsiveness** | Violates the global invariant and the trust boundary; makes the untrusted layer authoritative. |
| **Banker's rounding (half-even)** | Statistically unbiased but does not match invoice arithmetic, producing off-by-a-cent disputes against finance's own numbers. |

## Consequences

**Positive**
- AC-4 and AC-7 become achievable and testable rather than aspirational.
- Financial golden tests (Phase 4) can assert exact string equality on outputs.
- Reconciliation disputes during the demo become impossible to trigger.

**Negative / accepted costs**
- Decimal arithmetic is slower than float. Irrelevant at POC data volumes; noted for post-POC.
- More verbose code: `a.plus(b)` rather than `a + b`.
- Serialisation must carry strings, so every DTO and API contract must respect it — a discipline
  every phase inherits.

**Neutral but notable**
- Percentages, effort hours and counts are **not** `Money` but still use `Decimal` where they feed
  monetary results.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `Financial`, `Commercial`, `Contract`, `Forecast` primarily; all contexts that expose amounts |
| Data model / persistence | `NUMERIC(18,4)` baseline for amounts, `NUMERIC(12,6)` for rates/ratios; explicit currency column beside every amount |
| Formulas or metrics | All of `METRIC_CATALOG.md` §Financial; each ratio metric must state zero-denominator behaviour |
| Security model | None |
| Brand / design tokens | None |
| Requirements affected | REQ-FIN-001, REQ-FIN-004, REQ-FIN-008, REQ-FIN-009, REQ-DATA-006 |
| Tests that must change | Phase 4 golden tests assert exact values; property tests for associativity |

## Migration implications

Greenfield. Phase 2 must define the `Money` value object and the platform decimal module
(`src/platform/decimal`) **before** any financial entity is modelled, so no code is ever written
against a float money type.

## Rollback path

None desired. Reverting to floats would invalidate AC-4 and AC-7 and require re-baselining every
golden test. If performance ever forces a change, the migration is to integer minor units behind the
same `Money` interface — which the value-object wrapper makes a contained change.

## Verification

- Lint rule forbidding arithmetic operators on `Money`-typed expressions.
- Type-level test that `Money + Money` does not compile.
- Property test: shuffled aggregation produces identical results (REQ-FIN-008).
- Golden test: a decomposition of known inputs sums exactly to the total with zero residual (AC-4).
- Grep gate in CI: no `parseFloat`/`Number(` on amount fields in domain code.

## Open questions

- OQ-1 (reporting currency) affects FX policy but not this decision. Confirm in Phase 2.
