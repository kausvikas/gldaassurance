# PHASE_0_10_SEMANTIC_CLOSURE.md

**Status:** Phase 0–10 deterministic model — **certified for controlled synthetic POC use**
**Date:** 2026-09-01
**Authority:** ADR-0023 … ADR-0028, `METRIC_CATALOG.md`, `PHASE_HANDOFF.md`

> ## ⚠️ DEMO — SYNTHETIC DATA
> This is a proof of concept. Nothing here is a claim of production readiness.

---

## 1. The defect family this closure exists for

Seven audit passes found **one recurring shape**, not seven unrelated bugs:

> A numerically valid output carries wrong semantics because a layer above or below it silently
> loses meaning.

| # | Instance | Effect | Closed by |
| --- | --- | --- | --- |
| 1 | Shared cause treated as duplicated money | −$38.93M of real exposure (44%) | **ADR-0023** |
| 2 | Effort variance time-phased by *planned* completion | $63.31M phantom credit; slippage read as efficiency | **ADR-0024** |
| 3 | Two hard/elevation controls declared but never assembled | A live $180K LD exposure never evaluated | **ADR-0025** |
| 4 | Ratio signals citing Money metrics | Drill-through pointed at the wrong metric | **ADR-0025** |
| 5 | `NOT_APPLICABLE` conflated with `NOT_COMPUTABLE` | A false "evidence unavailable" on 13 projects | **ADR-0026** |
| 6 | Observed zero velocity represented as missing | A stalled project read **GREEN** | **ADR-0027** |
| 7 | Missing quality evidence indistinguishable from clean quality | A dead feed turned **AMBER → GREEN**, still `COMPLETE` | **ADR-0028** |

**None was found by a failing test.** Every one passed typecheck, architecture, lint, the full suite,
registry validation and catalog checks. They were found by asking what a number *means*.

## 2. Governing invariants (binding)

**Evidence.** No records is not zero. Zero is an observation. Unknown is an epistemic state. Not
applicable is not unknown. Unsupported is not healthy. Stale is not current. **Observed zero may be
the strongest adverse evidence there is.**

**Scoring.** A worsening observed condition may never improve a dimension because its representation
turned non-numeric. Renormalisation is safe **only** over `NOT_APPLICABLE` — a risk object that does
not exist. Losing evidence may change *authority*; it may never manufacture *health*.

**Completeness.** Computability ≠ completeness ≠ confidence ≠ health. A dimension may score and the
assessment still be `PROVISIONAL`. **GREEN + PROVISIONAL is a legitimate, required outcome.**

**Rules.** Applicability → computability → evaluation → outcome, never collapsed. A control not
evaluated is not a control evaluated clean. A configuration error is not a project defect.

**Economics.** Reconciled ≠ explained ≠ causal ≠ recoverable. Risk exposure may exceed sold margin.
Shared cause ≠ duplicated money.

## 3. The epistemic state algebra

Every executive dimension input and rule signal carries one of:

| State | Scored? | In denominator? | Costs completeness? |
| --- | --- | --- | --- |
| `OBSERVED` | yes | yes | no |
| `KNOWN_ZERO` | yes | yes | no |
| `UNBOUNDED` | at the red edge | **yes** | no |
| `NOT_APPLICABLE` | no | no | **no** |
| `NOT_COMPUTABLE` | no | no | **yes** |
| `CONFIGURATION_ERROR` | no | no | **yes**, as a control defect |

`observed: null` with no state is forbidden and defaults to `NOT_COMPUTABLE` — the conservative
reading — so an un-migrated caller cannot produce silent optimism. Lives in
`platform/explainability`, not `rules`, so a domain engine can state what its own null means without
inverting the architecture.

## 4. Metrics and rules changed across the closure

| Item | Change |
| --- | --- |
| `MET-PORT-003` → v2.0.0 | Additive over distinct projects; concentration reported separately, non-additive |
| `MET-RES-002` → v2.0.0 | Baseline is **earned** effort, not scheduled |
| `MET-DEL-018` → v2.0.0 | Explicit `UNBOUNDED` for observed zero with work remaining |
| `MET-QUA-003` → v2.0.0 | `KNOWN_ZERO` vs `NOT_COMPUTABLE` on an empty defect population |
| `MET-COM-011`, `MET-FIN-040/041/042/043`, `MET-RES-011` | Registered — comparands that were being used with no metric identity |
| `MET-DEL-023`, `MET-COM-007` | Absence reclassified `NOT_COMPUTABLE` → `NOT_APPLICABLE` |
| `OVR-LD-EXPOSURE`, `ELV-ETC-OPTIMISM` | Wired and live; provenance corrected |
| `OVR-NO-CREDIBLE-PLAN` | Governed applicability predicate |

## 5. Permanent controls

`A` observed zero ≠ missing · `B` null cannot silently preserve COMPLETE authority · `C`
monotonicity · `D` reason preservation · `E` null requires state · `F` applicability before
computability · `G` rule-signal completeness · `H` unit/metric provenance · `I` no Draft executive
dependency · `J` no non-finite serialisation.

Adversarial fixtures: `ZERO_VELOCITY_STALLED_ACTIVE_PROJECT`, Q1–Q6 quality evidence states, the
lifecycle applicability matrix, the DR-069 null-safety matrix across all four dimensions, and the
`MET-FIN-041` gross-coverage cases. All assert from constructed source facts, never from the
production function under test.

## 6. Remaining controlled debt

| ID | Class | What it is |
| --- | --- | --- |
| DR-069 (residual) | C | Scores still renormalise upward when evidence is lost; **authority no longer does**. Per-input structural/evidence/risk-trigger classification remains ungoverned |
| DR-070 | C | 17 executive-reachable ratio metrics still declare a blanket zero-denominator rule; the two that mattered are closed |
| DR-067 | E | No pre-execution plan-credibility control |
| DR-063 | E | No early-warning hysteresis; flap rate unmeasured |
| DR-064 | E | `MET-RES-003` seniority split unrecorded |
| DR-066 | C | Synthetic data never exercises realised/mitigated risk or configuration error |
| DR-062 | C | Margin bridge explains 45.5% of gross movement at the median |
| DR-059 | C | Late detection replays one dimension of four |
| DR-054/055/061, MC-2/3/6 | E | Uncalibrated thresholds and weights |
| DR-042 + all human gates | F | **No page has ever been viewed in a browser** |

## 7. The honest caveat

Seven passes, seven instances of one shape, each found only after the previous fix. The rate at
which auditing finds them has fallen — pass seven found one instance where pass one found three —
but it has not reached zero. **The correct inference is not that the model is now clean; it is that
the controls now fail the build for this family rather than relying on a reviewer noticing.**

What is genuinely closed: every known S4, and the ability of any of the seven shapes to recur
silently. What is not closed: the possibility of an eighth shape nobody has thought of.
