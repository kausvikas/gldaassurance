# Traceability Report — Pre-Phase-11 Remediation (C-23)

- **Phase:** remediation following the final semantic red-team — **COMPLETE**
- **Date:** 2026-09-01
- **Author:** Chief Enterprise Architect + Delivery Assurance Rules Architect + CFO / Delivery Economics
- **Scope:** the five Phase-11 blockers raised by the red-team, plus the systemic control that
  prevents recurrence. **No calibration. No new product scope. Phase 11 not started.**
- **Governing decision:** **ADR-0025**

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. What was previously believed, and what the red-team disproved

| Previously recorded | Disproved by | Actual state |
| --- | --- | --- |
| *"47 of 75 REDs are override-forced"* — presented as a complete override picture | Rule-evaluation census | **One of eight hard overrides had never been evaluated on any project.** The census was over seven controls, not eight |
| *"No hard override fired"* on 28 projects | `notEvaluatedReason` audit | On **every** project one override was never *run*. Not fired ≠ checked and clear |
| `explanatoryCoverage` treated as a presentational aid | Registry traversal | It was **executive-visible, evidence-cited, and registered nowhere** |
| `OVR-LD-EXPOSURE` provenance | Metric unit check | Cited `MET-FIN-019` (GM VaR, Money) for an LD ratio — the comparand had **no metric at all** |
| `ELV-ETC-OPTIMISM` provenance | Metric unit check | Cited `MET-FIN-030`, which is **Money**, while comparing against `0.10` |

**History is annotated, not rewritten.** The Phase 8 and architectural-closure records stated the
override counts in good faith; they were measured over the controls that ran.

## 2. Independent verification before any change

Every red-team figure was reproduced from facts before code was touched:

| Claim | Reproduced | Result |
| --- | --- | --- |
| `prj-011` LD = $180,000 | `facts.exposures[kind=LIQUIDATED_DAMAGES]` | ✅ exact |
| Contractual revenue = $6,000,000 | economics engine | ✅ exact |
| Ratio 3.00% ≥ 2.00% | independent division | ✅ **would fire** |
| `MET-FIN-030` computable on 57 of 75 | economics engine | ✅ exact |
| 7 projects ≥ 10% | independent division | ✅ prj-001, 009, 014, 037, 052, 053, 058 |

**Denominator sensitivity was measured before the choice was made.** With `MET-FIN-029`
(performance-implied EAC) as the denominator instead of `MET-FIN-008`, the breach count is
**identically 7** — so the `MET-FIN-040` definition is not outcome-selected.

## 3. Root-cause correction

The instances were not the problem. The **mechanism** was:

> A governed rule may declare a signal that no adapter produces, while every automated gate stays
> green — because the engine reports the gap honestly and the application layer discards it.

Corrected in three places:

1. **Statically** — every governed rule's signal must have a builder, its `signalMetricId` must
   resolve to a registered metric, and a `_RATIO` signal may not cite a Money metric.
2. **At runtime** — no rule may sit in `CONFIGURATION_ERROR`; a rule evaluated on **zero** projects
   fails. Zero *firings* remains acceptable.
3. **In the type system** — `RuleCoverage` makes non-evaluation a first-class field that a consumer
   must handle rather than infer.

**The control found three further instances on the day it was written** (DR-065) — which is the
argument for the control rather than a third patch.

## 4. Metrics registered

| ID | Name | Owner | Formula |
| --- | --- | --- | --- |
| **MET-COM-011** | Liquidated Damages Exposure Ratio | Commercial | `Σ CommercialExposure[LIQUIDATED_DAMAGES] / MET-FIN-002` |
| **MET-FIN-040** | ETC Optimism Ratio | Finance | `MET-FIN-030 / MET-FIN-008` |
| **MET-FIN-041** | Attributed Movement Coverage | Finance | `Σ|named MET-FIN-018 causes| / (Σ|named| + |residual|)` |

`MET-COM-011` is computed in the **commercial engine**, not an adapter — the exposure fact lives in
that context and a ratio on an executive page is not an adapter's to invent.

**`MET-FIN-041` is GROSS, and is named so.** *"Attributed Movement Coverage"* replaces the implicit
reading *"% of margin change explained"*, which the formula does not support: drivers of `+$5.0M`
and `−$5.1M` with zero residual give **100%** coverage on a `−$0.1M` net delta.

## 5. Rule evaluation coverage — 75 fixed-bid projects

| Rule | Fired | Clear | Not computable | Config error |
| --- | --- | --- | --- | --- |
| `OVR-GM-NEGATIVE` | 16 | 59 | 0 | 0 |
| `OVR-RAGM-NEGATIVE` | 21 | 54 | 0 | 0 |
| `OVR-CONTRACT-LOSS` | 30 | 45 | 0 | 0 |
| **`OVR-LD-EXPOSURE`** | **1** | **74** | **0** | 0 |
| `OVR-ACCEPTANCE-FAILURE` | 1 | 74 | 0 | 0 |
| `OVR-BURN-MISMATCH` | 7 | 68 | 0 | 0 |
| `OVR-UNCOMMERCIALISED-SCOPE` | 1 | 74 | 0 | 0 |
| `OVR-NO-CREDIBLE-PLAN` | 33 | 29 | **13** (legitimate) | 0 |
| **`ELV-ETC-OPTIMISM`** | **7** | **50** | **18** (maturity gate) | 0 |
| `ELV-CONTINGENCY-BURN` | 4 | 71 | 0 | 0 |
| `ELV-MARGIN-EROSION` | 73 | 2 | 0 | 0 |
| `BAND-COMPOSITE` | 74 | 1 | 0 | 0 |
| `RAG-OVERRIDE` | 0 | 75 | 0 | 0 |

**Was: two rules at 0 evaluations. Now: zero.**

## 6. Bands did not move

**RED 47 / AMBER 27 / GREEN 1 — identical before and after. GM VaR $90.80M — identical.**

`prj-011` was already RED via `OVR-RAGM-NEGATIVE` and `OVR-CONTRACT-LOSS`; the 7 ETC-optimism
projects were already RED and the elevation only forces AMBER. **This is containment by
coincidence, not by design**, and it is the reason the finding was S3 rather than S4.

## 7. Assessment completeness, without touching the band

`HealthAssessment.ruleCoverage` reports declared / fired / clear / not-computable counts and
**names** the unevaluated Red-forcing controls. The executive health surface renders a callout
whenever coverage is incomplete — including on AMBER and GREEN projects, which is exactly where a
reader assumes an absent override means the condition was checked.

**No band changed and no weight moved.** Rule coverage is reported *beside* the band, never folded
into the composite: doing so would convert an evidence-availability fact into a health judgement.

Eight AMBER projects (`prj-024`, `prj-033`, `prj-040`, `prj-059`, `prj-060`, `prj-066`, `prj-067`,
`prj-089`) carry `7/8` and now say so.

## 8. Tests

```
1204 tests, 0 failed, 0 skipped  (34 files)   was 1182
+17  tests/integration/rule-signal-completeness.test.ts   (new)
 +5  tests/integration/architecture-closure.test.ts §9    (MET-FIN-041)
```

**A pre-existing governance control caught my own registration.** `MET-FIN-041` was first registered
with `zeroDenominator: NOT_APPLICABLE` and an implementation returning `1` for a bridge with no
movement. The edge-case suite requires dividing metrics to declare `NOT_COMPUTABLE`, and it was
right: a vacuous *100% explained* is quotable. Both the registration and the implementation were
corrected — the metric is now nullable and says *"Not zero, and not 100% — there is nothing to
explain."*

## 9. Documentation corrections

- **Price/volume uniqueness claim removed.** The comment asserted the chosen pairing was *"the only
  pairing that partitions the cost delta exactly"* — **mathematically false**. At least one other
  ordered decomposition also partitions it exactly; the pairings differ in where the interaction
  term lands, and this convention assigns it wholly to rate/mix. **No bridge value changed** — only
  the claim about it.
- **`MET-FIN-019` semantics documented.** It exceeds sold GM on **21 of 75** projects, which is
  coherent: once risk-adjusted GM is negative the exposure covers the planned margin lost *and* the
  contract loss beyond it. No surface may present it as *"share of sold margin remaining."*

## 10. Deliberately not done

- **No threshold, weight or band edge changed.** Not one.
- **No synthetic fact changed** — content hash `514e835b…` unchanged. Every input already existed.
- **No band promoted or demoted** because a control was unevaluable.
- **Three ratio metrics not invented** for DR-065; each needs its own governed denominator.
- **Project-ID / economic-entity identity not redesigned** — documented as controlled debt.
- **DR-063 hysteresis and DR-064 seniority split left open**, as instructed.
- **Phase 11 not started.**

## 11. Self-review

- [x] **Did anything make the portfolio look better?** No. Two controls now fire that previously
      could not. Bands are unchanged.
- [x] **Was a threshold moved to make a rule fire or not fire?** No.
- [x] **Is any new number unregistered?** No — all three carry catalog entries, owners and versions.
- [x] **Could this remediation itself hide a defect?** The DR-065 allow-list is the risk. It names
      three specific rule ids; **any new occurrence fails the build.**
- [x] **Is the record honest about the previous claim?** Yes — §1 states what was believed and what
      was disproved, and no earlier report was edited to look correct.

---

# Addendum — Applicability Remediation (S3-1, S3-2)

- **Date:** 2026-09-01 · **Governing decision:** **ADR-0026**
- **Trigger:** the final GO/NO-GO recheck returned **NO-GO** against the remediation recorded above.

## What was previously believed, and what the gate disproved

> **The previous remediation correctly surfaced incomplete control coverage but incorrectly assumed
> every unevaluated rule represented unavailable evidence. The final semantic gate disproved that
> assumption and required explicit applicability semantics.**

ADR-0025 emitted one sentence for all thirteen cases — *"the evidence each needs is not available on
this project"* — and reported `7/8`. Both were wrong, and the false sentence was rendered on the
demo page. **The remediation converted a silent conflation into an explicit incorrect assertion**,
which is a worse failure than the one it replaced.

## Root cause

`fired === false` was three states wearing one name. The engine reported non-evaluation honestly;
nothing distinguished *does not apply* from *cannot be measured* from *control is broken*, so the
presentation layer guessed, and guessed the alarming reading.

## The three causes, measured

| Cause | Projects | Reason code |
| --- | --- | --- |
| Delivery complete (`physicalCompletion = 1.0`) | prj-042, 044, 059, 072, 084 | `NO_REMAINING_WORK` |
| Committed window closed | prj-033, prj-060, prj-079 | `NO_REMAINING_DELIVERY_WINDOW` |
| Elapsed delivery < velocity window + 1 | prj-024, 040, 066, 067, 081, 089 | `INSUFFICIENT_EXECUTION_HISTORY` |

`prj-044` was additionally reclassified from `CLEAR`: at 100% physical completion its "pass" was
meaningless. **Lifecycle stage is not the predicate** — it misclassifies 3 of 13.

## Result

- `OVR-NO-CREDIBLE-PLAN`: **33 fired · 28 clear · 14 not applicable · 0 not computable**.
- Every project reads **`7/7`** or **`8/8`**; no project reports an unevaluated applicable control.
- **Bands unchanged: RED 47 / AMBER 27 / GREEN 1. VaR $90.80M.** No threshold, weight or fact moved.
- **DR-065 closed**: `MET-FIN-042`, `MET-FIN-043`, `MET-RES-011` registered from denominators that
  were already deterministic in code. The completeness gate's allow-list is empty.
- **DR-067 / DR-068 opened**: no pre-execution credibility control exists, and a zero-velocity
  stall escapes the override. Both named rather than invented.

## Self-review

- [x] **Did the band move to fit the new model?** No — measured identical before and after.
- [x] **Was a rule made applicable to raise the evaluated count?** No. The decision went *against*
      the reading that would have produced more evaluations (ADR-0026 D-3).
- [x] **Can a consumer still be misled about why a control did not run?** Not from the DTO: status,
      reason code, required and missing evidence are all typed fields.
- [x] **Did this remediation introduce a claim nobody verified?** The applicability predicate is
      asserted per reason code against named projects, and the arithmetic of the five states is
      asserted closed on all 75.

---

# Addendum 2 — Model-Correctness Remediation (DR-068, S4)

- **Date:** 2026-09-01 · **Governing decision:** **ADR-0027**
- **Trigger:** the final Phase-11 entry gate returned **NO-GO** with an S4.

## What was previously believed, and what the gate disproved

The applicability remediation (ADR-0026) classified rule states correctly and handed the composite a
**silent null** that *improved* the score. The belief was that classifying the input correctly was
sufficient; the gate disproved it by showing the layer that consumes the input was never examined.

**A Fixed-Bid project with every weekly claim recorded and zero advance for eight weeks — 40%
complete, 200 days remaining — was assessed GREEN, COMPLETE, Delivery 100.00, no override fired.**

## Four defects behind one symptom

| # | Layer | Defect |
| --- | --- | --- |
| 1 | Metric | `MET-DEL-018` returned `null` for an **observed** zero denominator, identical to "unknown" |
| 2 | Scoring | `scoreDimension` renormalises over *usable* inputs, so dropping the 0.30-weighted signal re-weighted three clean inputs to 1.00 — **absence raised the score** |
| 3 | Completeness | `assessmentStatus` answered *"was everything evaluated?"* with *"did every dimension score?"* |
| 4 | Provenance | The adapter discarded `SignalReading.notComputableReason`, so a known cause became *"signal not supplied"* |

## Result

| Metric / Assessment | Before | After |
| --- | --- | --- |
| `MET-DEL-019` | 0 (observed) | 0 (observed) |
| `MET-DEL-020` | 0.021/week | 0.021/week |
| `MET-DEL-018` | `null` / NOT_COMPUTABLE | **`UNBOUNDED`**, cause stated |
| `OVR-NO-CREDIBLE-PLAN` | NOT_COMPUTABLE | **FIRED**, `observedValue: UNBOUNDED` |
| Delivery dimension | **100.00** | **70.00** |
| Composite | 98.12 | 90.62 |
| `assessmentStatus` | COMPLETE | COMPLETE *(the input is present and adverse, not absent)* |
| **Final System RAG** | **GREEN** | **RED** |

**Portfolio unchanged: RED 47 / AMBER 27 / GREEN 1, VaR $90.80M, hash `514e835b…`.** Completed
zero-velocity projects remain `NOT_APPLICABLE` — applicability still precedes metric evaluation.

## Two tests that asserted the defect

1. *"refuses a velocity ratio when demonstrated velocity is zero or negative"* — demanded the exact
   behaviour that produced the S4. Rewritten to assert `UNBOUNDED`, not weakened.
2. *"reports every assessment as COMPLETE"* — `prj-005` became PROVISIONAL because its material
   input was absent. Investigated rather than adjusted: the absence is due to the rule being
   `NOT_APPLICABLE`, so completeness now **reuses ADR-0026's applicability ruling** instead of
   re-deciding it.

## What was measured and deliberately not shipped

**DR-069.** Making *any* absent input cost completeness was implemented and measured: **64 of 75**
projects turn PROVISIONAL, 61 of them only because `DEPENDENCY_AGEING_DAYS` is absent on a project
with **no open dependencies** — a known-good state. It was withdrawn: trading "unknown reported as
complete" for "known-good reported as provisional" is not a fix. The bias table is recorded instead.

**DR-070.** 19 of 21 executive-reachable ratio metrics declare a blanket `NOT_COMPUTABLE` zero
denominator. `MET-RES-003` (zero junior FTE = an observed all-senior team) is the closest analogue.
Not changed — each denominator's zero has its own business meaning.

## Self-review

- [x] **Did any threshold, weight or band edge move?** No.
- [x] **Was a null mapped to the worst score?** No — only the explicitly governed `UNBOUNDED` state
      scores adversely. `NOT_COMPUTABLE` and `NOT_APPLICABLE` keep their treatment.
- [x] **Did any non-finite number enter the decimal layer?** No — asserted by test.
- [x] **Did completed projects turn RED?** No — asserted by test and by the portfolio measurement.
- [x] **Was the hostile case weakened to pass?** No — it is a permanent golden fixture asserting
      from 13 source observations, and reverting the fix fails it.
- [x] **Is anything claimed that was not measured?** The two open items carry their measurements.
