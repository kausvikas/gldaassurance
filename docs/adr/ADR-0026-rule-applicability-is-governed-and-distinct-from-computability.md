# ADR-0026 — Rule applicability is governed business semantics, distinct from computability

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Principal Enterprise Architect + Delivery Assurance Rules Architect + Delivery
  Intelligence Domain Architect + AI Grounding Architect + Independent model-governance reviewer
- **Phase:** Pre-Phase-11 remediation (second)
- **Affects:** `ThresholdRule`, the rules engine, `RuleCoverage`, `OVR-NO-CREDIBLE-PLAN`, the
  project executive health service and surface
- **Resolves:** **S3-1** and **S3-2** from the final GO/NO-GO recheck

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

ADR-0025 made non-evaluation visible. It then **assumed every unevaluated rule meant missing
evidence**, and rendered:

> *"because the evidence each needs is not available on this project."*

The final gate disproved that on **all 13** affected projects. The sentence is false everywhere it
appears.

### What the evidence actually shows

`MET-DEL-018 = MET-DEL-020 / MET-DEL-019` — required future velocity over **demonstrated**
velocity. Measured per project, the 13 fall into **three distinct causes, none of which is missing
evidence**:

| Cause | Projects | What is true |
| --- | --- | --- |
| **Delivery is finished** — `physicalCompletion = 1.0` | prj-042, prj-072, prj-084, prj-059 | There is no remaining plan whose credibility could be in question |
| **The committed window has closed** — baseline completion date reached | prj-033 (62.5%), prj-060 (89.0%), prj-079 (64.5%) | `MET-DEL-020` divides by remaining weeks; there are none. The question "can you still finish on the committed date" is no longer forward-looking |
| **Delivery has not run long enough** — 1–7 weekly observations against the 9 an 8-week window requires | prj-024, prj-040, prj-066, prj-067, prj-081, prj-089 | The demonstrated-velocity denominator **cannot logically exist yet** |

**Lifecycle stage is not the predicate.** `prj-081` is `EXECUTING/EARLY_EXECUTION` and belongs to
the third group at 5 elapsed weeks; `prj-042` and `prj-072` are `EXECUTING/LATE_STAGE` and belong to
the first. Keying applicability off `lifecycleStage` would have misclassified three of thirteen. The
governing facts are **remaining work, remaining window, and elapsed delivery time** — not a label.

## Decision

### D-1 — Five explicit states, no nullable booleans

```
NOT_APPLICABLE      the rule does not apply under governed conditions
NOT_COMPUTABLE      the rule applies; required governed evidence is unavailable
CONFIGURATION_ERROR the rule should be evaluable; no builder can produce its signal
CLEAR               applicable, computable, evaluated, did not breach
FIRED               applicable, computable, evaluated, breached
```

Carried as an explicit discriminated status plus a machine-readable
`notEvaluatedReasonCode`, never inferred from `fired === false`.

### D-2 — Applicability is a predicate owned by the rule, evaluated before computability

`ThresholdRule` gains an optional `applicability` predicate over a governed
`RuleApplicabilityContext` (remaining work, days to baseline completion, elapsed delivery weeks,
velocity window, contract type, lifecycle stage). **It is not inferred from whether a signal
happens to exist**, and it does not live in an adapter or a component.

Order is fixed: **applicability → computability → evaluation → outcome.** A rule that does not apply
is never asked whether its signal is computable.

### D-3 — `OVR-NO-CREDIBLE-PLAN` applicability

Not applicable when any of:

| Condition | Reason code |
| --- | --- |
| `physicalCompletion ≥ 1` | `NO_REMAINING_WORK` |
| baseline completion date reached or passed | `NO_REMAINING_DELIVERY_WINDOW` |
| elapsed delivery weeks < velocity window + 1 | `INSUFFICIENT_EXECUTION_HISTORY` |

The third follows from the registered formula rather than from convenience: `MET-DEL-018`'s
denominator **is** demonstrated execution. The rule asks whether the demonstrated rate implies an
implausible step-change, so before enough weeks have elapsed for a demonstrated rate to exist the
question has no subject. This is the branch §4 of the remediation brief required to be decided from
product semantics, and it is decided **against** the reading that would have produced more
evaluations.

**A pre-execution plan-credibility rule would be a different rule** with a different signal
(planned throughput and staffing ramp rather than demonstrated velocity). None is registered, and
inventing one here would be the speculative business semantics this closure exists to avoid. It is
recorded as **DR-067**.

### D-4 — `NOT_APPLICABLE` leaves the denominator

Control completeness is reported over **applicable** controls:

```
Applicable Red-forcing controls evaluated: 7/7        ← correct
Red-forcing controls evaluated: 7/8                   ← withdrawn: implies a gap that does not exist
```

`declared`, `applicable`, `notApplicable`, `evaluated`, `fired`, `clear`, `notComputable` and
`configurationError` are all reported, so nothing is hidden by the change of denominator.

### D-5 — `CONFIGURATION_ERROR` is representable at runtime

The adapter declares the set of signal ids it builds. A rule whose signal is **not in that set** is
`CONFIGURATION_ERROR`; a rule whose signal is declared but null is `NOT_COMPUTABLE`. ADR-0025
hardcoded `configurationErrors: []`, which meant a dead control at runtime was indistinguishable
from a legitimate evidence gap — the exact conflation ADR-0025 was written to remove, reintroduced
one level down.

A configuration error is a **control-quality** finding, never a project-performance one.

### D-6 — No state affects health

`NOT_APPLICABLE`, `NOT_COMPUTABLE` and `CONFIGURATION_ERROR` change no band, no score and no weight.
They affect assessment completeness and governance attention only.

## Consequences

**Positive**

- The eight AMBER projects stop carrying a false explanation, and the demo page stops teaching it.
- Phase 11 can answer *applicable? evaluated? why not? what evidence? whose problem?* from typed
  fields without parsing prose.
- `7/7` is a stronger and more honest statement than `7/8`: it says the assessment is complete.

**Negative**

- `ThresholdRule` grows a predicate, so rule definitions carry behaviour as well as data. Confined
  to a pure function over a governed context, and only where a rule genuinely has applicability
  conditions.
- Applicability must now be decided for every future rule. That is the intended cost.

**Neutral**

- **No band changes**: every affected project keeps its RAG. No threshold, weight or fact moved.

## Alternatives considered

**Key applicability off `lifecycleStage`.** Rejected on evidence — it misclassifies 3 of 13.
Lifecycle is a label; the rule depends on remaining work, remaining window and elapsed delivery.

**Treat all 13 as `NOT_COMPUTABLE` and fix only the wording.** Rejected: it keeps a real distinction
collapsed and leaves Phase 11 unable to tell a control that cannot apply from one starved of data.

**Treat mobilising projects as `NOT_COMPUTABLE`.** Considered seriously, and rejected because
`MET-DEL-018`'s denominator is demonstrated velocity: at week 2 the data is not *missing*, it is
*not yet possible*. Calling that a data gap would imply someone failed to supply something.

**Make zero demonstrated velocity fire the override.** Rejected — out of scope and it would change
bands. A project stalled at zero progress with work remaining is a real finding that this override
does not currently make; recorded as **DR-068**, not silently implemented.

## Rollback

Additive: one optional predicate, one context type, extra status fields. Removing them restores
ADR-0025 behaviour — which would restore a false narrative, so the lifecycle tests would fail.
