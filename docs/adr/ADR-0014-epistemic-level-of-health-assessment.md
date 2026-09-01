# ADR-0014 — Epistemic level of composite health and System-Assessed RAG

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Sponsor — explicit acceptance in the Phase 3 correction & closure pass, Governance
  Decision 2. **Resolves conflict C-6.**
- **Phase:** 2 (closure)
- **Affects:** `MET-HLTH-010`, `MET-HLTH-011`, `MET-HLTH-013`, `MET-HLTH-030`, `MET-HLTH-031`, `MET-HLTH-032`; ADR-0004 §1; `PRODUCT_SPEC.md` §3.2; REQ-UX-004
- **Supersedes:** — (would partially supersede ADR-0004 §1 if accepted)

---

## Context

The Phase 2 closure brief, Decision 6, lists the epistemic level of several metrics. Most confirm
what the registry already held. One does not:

> System Health → `L3_ASSESSED`

Two accepted artifacts say otherwise, explicitly:

- **ADR-0004 §1** defines L2 as "Deterministic Derived Metric — a pure function of L1 + a versioned
  rule set", and `PRODUCT_SPEC.md` §3.2 gives the L2 examples as "EAC, margin, CPI, **health
  score**".
- **`PRODUCT_SPEC.md` §3.3** describes System-Assessed RAG as "Deterministic rules over L2 metrics".

The closure brief's own justification — "a deterministic rule-based outlook remains L3 because it is
an assessment about future/project state" — is a coherent position, and it is the position ADR-0011
already took for `forecast`. Applied consistently it would move composite health and System-Assessed
RAG to `L3_ASSESSED` as well.

`CLAUDE.md` requires that a conflict between artifacts be reported and resolved by precedence, not by
inference. ADRs rank first; `PRODUCT_SPEC.md` ranks fourth; a phase brief is not in the precedence
order at all. So the registry was **not** changed, and this ADR exists to put the question properly.

**What was applied from Decision 6 without dispute:** the `L1_OBSERVED` / `L2_DERIVED` /
`L3_ASSESSED` vocabulary; Trajectory as `L3_ASSESSED`; Forecast Confidence reclassified to
`L3_ASSESSED`; Reported RAG as `L1_OBSERVED`; Recognised Revenue as `L1_OBSERVED`; and the rule that
epistemic level describes meaning rather than determinism. **Only the health reclassification is
held.**

## Decision

**The boundary falls between a health *measure* and a health *conclusion*, not around "health".**
Neither the "all L2" nor the "all L3" reading was adopted; the third option in §Alternatives was.

### `L2_DERIVED` — deterministic health measures

A mathematical or model output over observed facts under a versioned rule set.

| Metric | Level |
| --- | --- |
| `MET-HLTH-001` Financial Health Dimension | `L2_DERIVED` |
| `MET-HLTH-002` Schedule Health Dimension | `L2_DERIVED` |
| `MET-HLTH-003` Scope & Commercial Dimension | `L2_DERIVED` |
| `MET-HLTH-004` Quality Health Dimension | `L2_DERIVED` |
| `MET-HLTH-005` Resource Health Dimension | `L2_DERIVED` |
| `MET-HLTH-006` Risk Health Dimension | `L2_DERIVED` |
| `MET-HLTH-010` Composite Health Score | `L2_DERIVED` |
| `MET-HLTH-032` Dimension Contribution | `L2_DERIVED` |

### `L3_ASSESSED` — interpretive health conclusions

A judgement about project state or its future. **A deterministic implementation does not make an
output L2.** Epistemic level describes semantic meaning, not implementation technique: a rule-based
30-day outlook is `L3_ASSESSED` because it is an assessment of future project state.

| Metric | Level | Why |
| --- | --- | --- |
| `MET-HLTH-011` System-Assessed RAG | `L3_ASSESSED` | Asserts "this project is Amber" — a verdict, not an arithmetic consequence |
| `MET-HLTH-013` Effective RAG | `L3_ASSESSED` | The accountable verdict, whether from a rule or an override |
| `MET-HLTH-030` Status Divergence | `L3_ASSESSED` | Compares a declaration with a verdict; inherits the verdict's status |
| `MET-HLTH-031` Divergence Persistence | `L3_ASSESSED` | A run-length over a series of verdicts |
| `MET-FCST-001`…`007`, `010` Trajectory family | `L3_ASSESSED` | Already so classified (ADR-0011) |
| `MET-DQ-007` Forecast Confidence | `L3_ASSESSED` | Already so classified |
| 30-day / 60-day outlook | `L3_ASSESSED` | Future project state. **Not yet registered metrics** — Phase 4 owns them |

### Consequences for the artifacts that disagreed

`ADR-0004` §1's L2 example list and `PRODUCT_SPEC.md` §3.2 both name "health score" as the canonical
L2 example. **That remains correct** under this decision: `MET-HLTH-010` the *score* stays
`L2_DERIVED`. What moves is the *banding* of that score into a verdict. No amendment to either
artifact is required, which is a large part of why this option was chosen.

## Rationale

**For reclassifying (the brief's position).** A health score is an opinion expressed as a number. It
rests on weights nobody has yet agreed (OQ-4/MC-2) and band edges nobody has yet set (MC-3); change
either and the same facts yield a different verdict. `PRODUCT_SPEC.md` §3.2 says an L2 value changes
"only via a versioned formula change" — but a health score changes when a *weight* changes, which is
configuration, not formula. That is closer to how the spec describes L3. And the product's central
claim is that Reported and System-Assessed RAG can legitimately differ; a value that can legitimately
disagree with a human's stated position is an assessment, not an arithmetic consequence.

**Against (the position ADR-0004 took).** L2 was defined as reproducible-under-a-rule-version, and
health is exactly that: same inputs, same `HEALTH-v1`, same score, byte-identical — which is what
AC-7 tests. Moving it to L3 puts the flagship divergence signal (`MET-HLTH-030`) into the same visual
register as LLM narration, which Phase 6 must then work hard to distinguish. It also weakens AC-3's
drill-down promise: an evidence chain that terminates in "an assessment" is less defensible to a
controller than one that terminates in "a versioned formula over these facts".

**Why this is worth an ADR rather than a registry edit.** ADR-0004 is the decision that gives the
product its epistemic credibility, and `PRODUCT_SPEC.md` §3.2 names health score as the canonical L2
example. Changing that by editing a data file would be precisely the "plausible drift"
`ARCHITECTURE_DECISIONS.md` §1 exists to prevent — reasonable, local, and invisible.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Apply the brief and edit the registry** | Fastest, and silently overturns an accepted ADR plus a spec clause by editing a TypeScript file. Exactly what `CLAUDE.md` invariant 3 forbids. |
| **Keep health L2 and close the question** | Defensible on precedence and leaves the brief's Decision 6 partially unapplied without saying so. Reporting it is the minimum; deciding it is better. |
| **Split: score L2, RAG banding L3** | **ADOPTED.** The most semantically precise option, and the only one that leaves ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 correct as written. It does put a boundary mid-chain — `MET-HLTH-030` divergence compares an L1 declaration with an L3 verdict — but that is a faithful description of what divergence *is*, and it is why divergence is itself L3. Phase 6 carries the cost: a health panel shows a computed score and an assessed verdict side by side, in two registers. |
| **Introduce a fourth level for "deterministic assessment"** | Closure Decision 9 says not to add states without necessity, and the same logic applies to levels. Three registers are already the most a screen can carry. |

## Consequences

**Positive**
- The vocabulary is now consistent and checkable: anything that *judges* project state is L3,
  whether or not it is reproducible; anything that *measures* is L2.
- ADR-0004 §1 and `PRODUCT_SPEC.md` §3.2 stay correct as written — no accepted artifact is amended.
- The evidence chain still terminates in a versioned formula over observed facts: a reader drills
  from the verdict (L3) to the score (L2) to the dimensions (L2) to the facts (L1).
- `MET-HLTH-030` divergence becomes structurally honest — comparing an L1 declaration with an L3
  verdict is exactly what the signal is.

**Negative / accepted costs**
- The boundary sits mid-chain, so a health panel carries two registers. Phase 6 must design for that
  rather than treat health as one visual class.
- Four metrics change `epistemicLevel`, so `MET-PORT-004` and `MET-PORT-005`, which aggregate them,
  move to `L3_ASSESSED` as well under the dependency-purity rule.

**Neutral but notable**
- No metric's status, formula, inputs or edge handling changes. `AC-7` still applies:
  reproducibility is a property of the implementation, not of the epistemic level.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None |
| Data model / persistence | None |
| Formulas or metrics | No formula changes; 12 metrics change `epistemicLevel` if accepted |
| Security model | None |
| Brand / design tokens | Phase 6 provenance treatments: health moves from the computed register to the inferred one |
| Requirements affected | REQ-UX-004, AC-2, AC-3 |
| Tests that must change | `metric-registry.test.ts` layer assertions; the L3-dependency purity check would then permit `MET-PORT-004`/`005` to remain L2 only if they too move |

## Migration implications

Applied in the Phase 3 correction pass: `MET-HLTH-011`, `013`, `030`, `031` reclassified to
`L3_ASSESSED` with version bumps, `MET-PORT-004` and `MET-PORT-005` following under the
dependency-purity rule, and `METRIC_CATALOG.md` regenerated. No engine exists yet, so nothing
computed is affected — which is why this was worth resolving before Phase 4 stamps provenance
envelopes onto stored health results.

## Rollback path

Fully reversible while it is only a label. It stops being reversible cheaply once Phase 4 has written
provenance envelopes into stored snapshots and Phase 6 has built rendering around them — at that
point reclassifying means rewriting stored provenance.

## Verification

- `validateRegistry()` returns empty under either outcome.
- The dependency-purity test (`no L1/L2 metric depends on an L3 assessment`) still passes: if health
  moves to L3, `MET-PORT-004` and `MET-PORT-005` must move with it, and the test will say so.
- Phase 6 accessibility review confirms three distinguishable registers, whichever side health is on.

## Open questions

None. The split option was adopted; C-6 is closed.
