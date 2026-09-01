# ADR-0028 — Every executive dimension input carries an epistemic state, and renormalisation is only safe over governed absence

- **Status:** **Accepted** — 2026-09-01
- **Approver:** Principal Enterprise Architect + Chief Delivery Officer + Product/Quality Governance
  Architect + Principal Quantitative Health-Model Architect + Enterprise Data & Evidence Architect +
  Independent model-risk reviewer
- **Phase:** Phase 0–10 final model-correctness closure
- **Affects:** `SignalReading`, `scoreDimension`, `assessmentStatus`, `MET-QUA-003`, `MET-QUA-009`,
  `MET-DEL-010`, `MET-DEL-023`, `MET-COM-007`, `MET-FIN-034`, the project executive health DTO and surface
- **Resolves:** the Product/Quality **S4**, and generalises ADR-0027 across all four dimensions

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

ADR-0027 fixed one instance of a family. The entry gate then found the same shape one dimension
over, where **no override backstops it**:

> With defect evidence — escaped rate 30%, backlog rising — Quality scores **41.67**, composite
> **68.38**, band **AMBER**. With the defect feed unavailable, both inputs become `null`, Quality
> renormalises to **56.41**, composite **72.21**, band **GREEN**, and `assessmentStatus` stays
> **COMPLETE**.

**Losing quality evidence made the project green.**

### Why it happened, precisely

`MET-QUA-003` is `NOT_COMPUTABLE` when `defects.length === 0`. That single condition covers two
opposite realities:

| Reality | Correct reading |
| --- | --- |
| The defect source reported and there are genuinely no escaped defects | **Excellent quality — a healthy observation** |
| No defect telemetry reaches the product at all | **Unknown — the strongest adverse signal may be invisible** |

The engine's own reason — *"no defects have been recorded, so there is no population to rate"* — is
literally true of both and distinguishes neither.

`scoreDimension` then drops any `null` input and renormalises over the rest, so **the absence of the
worst fact raises the score**. Measured across all four dimensions, dropping any single non-required
input raises its dimension by **15 to 30 points**.

### Why the earlier general fix failed

Making *any* absent input cost completeness was implemented, measured and withdrawn: it marked
**64 of 75** projects `PROVISIONAL`, 61 of them only because `DEPENDENCY_AGEING_DAYS` was absent on
a project with **no open dependencies** — a known-good state wrongly encoded as `NOT_COMPUTABLE`.

**The defect was never "nulls cost nothing". It was that absence had no vocabulary.**

## Decision

### D-1 — Every executive dimension input carries an explicit state

```
OBSERVED             a value was measured
KNOWN_ZERO           the source reported, and the observation is zero
NOT_APPLICABLE       the risk object does not exist on this project
NOT_COMPUTABLE       the risk could exist; the evidence does not
UNBOUNDED            observed adverse with no finite value (ADR-0027)
CONFIGURATION_ERROR  the platform should produce this and cannot
```

**`observed: null` with no state is forbidden.** A `null` with no state defaults to
`NOT_COMPUTABLE` — the conservative reading — so an un-migrated caller cannot silently produce the
optimistic one.

### D-2 — Renormalisation is safe only over governed absence

| State | Scored? | In denominator? | Costs completeness? |
| --- | --- | --- | --- |
| `OBSERVED` / `KNOWN_ZERO` | yes | yes | no |
| `UNBOUNDED` | at the red edge | **yes** | no |
| `NOT_APPLICABLE` | no | no | **no** — the risk does not exist |
| `NOT_COMPUTABLE` | no | no | **yes** |
| `CONFIGURATION_ERROR` | no | no | **yes**, and reported as a control defect |

The score still renormalises for `NOT_COMPUTABLE` — **no health penalty is invented for
missingness**. What changes is the *authority* of the result, not the number.

### D-3 — Absence is reclassified at source, where the meaning is known

| Metric | Absence condition | Was | Now |
| --- | --- | --- | --- |
| `MET-DEL-023` | no open customer dependencies | `NOT_COMPUTABLE` | **`NOT_APPLICABLE`** |
| `MET-COM-007` | no pending change requests | `NOT_COMPUTABLE` | **`NOT_APPLICABLE`** |
| `MET-DEL-010` | no milestones recorded | `NOT_COMPUTABLE` | **`NOT_APPLICABLE`** |
| `MET-FIN-034` | no contingency budget | `NOT_COMPUTABLE` | **`NOT_APPLICABLE`** |
| `MET-QUA-003` | source reported, zero defects | `NOT_COMPUTABLE` | **`KNOWN_ZERO`** (scores healthy) |
| `MET-QUA-003` | source absent or stale | `NOT_COMPUTABLE` | **`NOT_COMPUTABLE`**, with the true reason |
| `MET-QUA-009` | insufficient history | `NOT_COMPUTABLE` | **`NOT_COMPUTABLE`** (unchanged, now costs completeness) |

The engine comment at `MET-DEL-023` claimed *"the health model treats a missing input as missing
rather than as good news."* Renormalisation made that false. It is true now because the state, not
the nullness, decides.

### D-4 — Quality evidence presence is an input, not an inference

`MET-QUA-003` gains a governed `defectSource` descriptor — availability, last observation, expected
cadence — so *"no defects"* and *"no telemetry"* stop sharing a code path. The metric is version-bumped
to **2.0.0**; its zero-population behaviour changes meaning.

Derived from facts, not asserted: a project with defect rows has a live source; one with no defects
but recorded acceptance items has a reporting quality domain and a genuine zero; one with neither
has **unknown** source presence and is `NOT_COMPUTABLE`.

### D-5 — GREEN + PROVISIONAL is a legitimate, required outcome

A numeric assessment with incomplete material evidence must be expressible. `PROVISIONAL` **never
changes the band** — it qualifies it. *"Available indicators are Green, but material evidence is
incomplete"* is the honest sentence, and the product must be able to say it instead of either
"healthy" or a manufactured Amber.

## Consequences

**Positive**

- The Quality S4 closes: the feed-unavailable case can no longer read `GREEN + COMPLETE`.
- Renormalisation becomes safe by construction rather than by luck, in all four dimensions.
- `NOT_APPLICABLE` reclassification removes false provisional noise on 61 projects.
- Phase 11 can read the state instead of inferring meaning from `null`.

**Negative**

- Six projects become `PROVISIONAL` on insufficient backlog history — correct, and previously hidden.
- Every dimension input gains state, which is more to carry.

**Neutral**

- **No band, weight, threshold or synthetic fact changes.** The generator hash is untouched.

## Alternatives considered

**Mark the Quality inputs MATERIAL and stop.** Rejected: it fixes two inputs and leaves the other
nine renormalising silently, which is how this family survived three passes.

**Penalise missing inputs with a worst-case score.** Rejected — explicitly forbidden, and it
conflates not-applicable, unknown and observed-adverse.

**Require a defect feed on every project.** Rejected: it converts an evidence question into a data
mandate and would make projects without telemetry unassessable rather than provisionally assessed.

## Rollback

Additive: one state field, one scoring branch, one completeness rule, one quality input. Reverting
restores the GREEN-on-missing-evidence behaviour, so the Q2 fixture fails by design.
