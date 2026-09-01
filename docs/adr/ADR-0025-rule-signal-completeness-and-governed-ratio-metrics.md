# ADR-0025 — Rule signal completeness is a machine-checked contract; two rule ratios become governed metrics

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Principal Enterprise Architect + Delivery Assurance Rules Architect + CFO /
  Delivery Economics + Commercial (metric owner) + Independent model-governance reviewer
- **Phase:** Pre-Phase-11 remediation
- **Affects:** `OVR-LD-EXPOSURE`, `ELV-ETC-OPTIMISM`, `HealthAssessment`, all executive surfaces
  carrying a System RAG explanation, `METRIC_CATALOG.md`
- **Introduces:** `MET-COM-011`, `MET-FIN-040`, `MET-FIN-041`
- **Resolves:** **CONFLICT C-23** (dead rule controls) and the governance gap on
  `explanatoryCoverage`

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

The pre-Phase-11 semantic red-team found that **a governed rule may declare a signal that no
adapter produces, while every automated gate stays green.**

Measured on the 75-project fixed-bid population:

| Rule | Evaluated | Reason |
| --- | --- | --- |
| `OVR-LD-EXPOSURE` (hard override) | **0 of 75** | `LD_EXPOSURE_RATIO` never assembled |
| `ELV-ETC-OPTIMISM` (elevation) | **0 of 75** | `ETC_OPTIMISM_RATIO` never assembled |

The rules engine handled this correctly — it returned
`notEvaluatedReason: "signal not computable — signal not supplied"` and its narrative says
*"Reported rather than treated as passing."* **The application layer then discarded it.**
`grep notEvaluatedReason src/app src/presentation` returned **zero hits**, so `firedOverrides.length
=== 0` conflated *"checked and clear"* with *"never checked."*

### Independently reproduced

- **`prj-011`** carries a `LIQUIDATED_DAMAGES` exposure of **$180,000** against **$6,000,000**
  contractual revenue = **3.00%**, against a **≥ 2.00%** threshold. **The override would have
  fired.** It is already RED via `OVR-RAGM-NEGATIVE` and `OVR-CONTRACT-LOSS`, so **no band is
  wrong** — the containment is coincidental, not designed.
- **`MET-FIN-030`** is computable on **57 of 75**; **7 projects** exceed 10% (prj-001 12.7%,
  prj-009 25.0%, prj-014 19.4%, prj-037 15.3%, prj-052 11.3%, prj-053 12.4%, prj-058 13.2%). All 7
  are already RED, and the rule only forces AMBER, so again **no band changes**.

### The deeper defect: both rules cite a metric that is not what they compare

`ELV-ETC-OPTIMISM` compares a **ratio** to `0.10` while citing `MET-FIN-030`, which is **Money**
(`max(0, MET-FIN-029 − MET-FIN-008)`). `OVR-LD-EXPOSURE` compares an LD **ratio** while citing
`MET-FIN-019`, which is **GM Value at Risk**. In both cases the comparand had **no registered
metric at all**, and the rule pointed at the nearest plausible one.

This is the same shape as C-20 and C-22: a definitional choice (here, *the denominator*) left
unregistered, made silently at the point of use.

## Decision

### D-1 — A rule's declared signal must have a registered builder, checked statically

Every governed rule reachable from an executive output resolves to exactly one state:

| State | Meaning |
| --- | --- |
| `EVALUATED` | Signal supplied, rule evaluated (fired or clear) |
| `NOT_COMPUTABLE` | Required fact or metric genuinely unavailable for this project |
| `NOT_APPLICABLE` | Rule does not apply under governed semantics |
| `CONFIGURATION_ERROR` | The rule requires a signal with **no registered builder** |

**`CONFIGURATION_ERROR` may never present as `CLEAR`**, and a static architecture test fails the
build when any rule reaches it. A rule declared in governance but impossible to assemble is an
architecture defect, not a passing control.

### D-2 — `MET-COM-011` Liquidated Damages Exposure Ratio

```
MET-COM-011 = Σ CommercialExposure[kind = LIQUIDATED_DAMAGES].estimatedValue / MET-FIN-002
```

Owned by **Commercial**, computed in the **commercial engine** — the exposure fact already lives in
that context, and the ratio is not computed in an adapter or a component. `NOT_COMPUTABLE` on a zero
denominator, exactly as `MET-COM-009` behaves.

`OVR-LD-EXPOSURE.signalMetricId` is corrected from `MET-FIN-019` to `MET-COM-011`.

### D-3 — `MET-FIN-040` ETC Optimism Ratio

```
MET-FIN-040 = MET-FIN-030 / MET-FIN-008
```

**The denominator is the stated (management) EAC**, so the metric reads *"management's estimate is
understated by X% of itself"* — which is what the rule narrative claims: *"Demonstrated performance
implies a materially higher outturn cost than the stated estimate."*

**The choice is recorded because it is a choice**, and the determinacy control (Frozen-metric sweep)
would otherwise flag it. Sensitivity was measured before deciding: with the denominator set to
`MET-FIN-029` (performance-implied EAC) instead, the breach count on the demo portfolio is
**7 — identical**. The decision is therefore not outcome-selected on this dataset.

`ELV-ETC-OPTIMISM.signalMetricId` is corrected from `MET-FIN-030` to `MET-FIN-040`.

### D-4 — `MET-FIN-041` Attributed Movement Coverage

`explanatoryCoverage` was executive-visible, consumed by an evidence block, and **registered
nowhere** — no id, owner, version, epistemic level or catalog entry. It is registered as:

```
MET-FIN-041 = Σ|named MET-FIN-018 causes| / (Σ|named MET-FIN-018 causes| + |residual|)
```

**It is a GROSS attribution share, not a share of net margin movement**, and the name says so.
*"Attributed Movement Coverage"* replaces the implicit reading *"% of margin change explained"*,
which the formula does not support: on a project whose named drivers are `+$5.0M` and `−$5.1M` with
zero residual, coverage is **100%** while the net delta is only `−$0.1M`. Both statements are true
and only the gross one is what this metric measures.

### D-5 — Rule coverage is reported beside the band, never inside it

`HealthAssessment` gains structured rule coverage — applicable / evaluated / not-computable /
not-applicable / configuration-error counts, plus the ids of **unevaluated Red-forcing controls**.

**No band changes as a result.** An AMBER whose plan-credibility override could not be evaluated
stays AMBER; it is not promoted to RED and not degraded to UNKNOWN. Rule coverage is **not** mixed
into the composite score or the weights — doing so would convert an evidence-availability fact into
a health judgement.

## Consequences

**Positive**

- Two dead controls become live. `OVR-LD-EXPOSURE` fires on `prj-011`; `ELV-ETC-OPTIMISM` fires on 7.
- A whole class of defect becomes a build failure rather than an audit finding.
- Three executive-visible numbers gain owners, versions and catalog entries.
- An executive can now distinguish *"all eight Red-forcing controls were checked and cleared"* from
  *"seven were checked; one could not be."*

**Negative**

- Every previous statement of the form *"no hard override fired"* was weaker than it appeared. Bands
  were correct; the completeness claim behind them was not, and the traceability record says so.
- Three new metrics enlarge the catalog and must be maintained.

**Neutral**

- **No band, threshold, weight or synthetic fact changes.** The generator content hash is unchanged;
  every input already existed and was simply never read.

## Alternatives considered

**Wire the two signals and stop.** Rejected — it fixes the instances and leaves the mechanism. The
red-team found this class three times (C-20, C-22, C-23); the third occurrence is the argument for a
contract rather than a third patch.

**Promote incomplete-evaluation AMBER to RED.** Rejected. Absence of evidence is not evidence of
failure, and forcing RED on unevaluable evidence would corrupt the band to express a data-quality
fact. The completeness claim is reported separately instead.

**Fold rule coverage into the composite score.** Rejected for the same reason, and because it would
silently change `HEALTH-v2` weights, which this phase forbids.

**Leave `explanatoryCoverage` unregistered as a "presentational aid".** Rejected: it is rendered to
a CFO and will be read by Phase 11. Anything an executive can quote needs an id they can look up.

**Define `MET-FIN-041` on net delta.** Rejected — undefined at zero net delta and unstable near it
(`prj-029` has a $27.5K net delta with a residual 10.4× larger). The gross denominator is stable;
the honesty problem is solved by naming, not by changing the denominator.

## Migration implications

Derivation only; no stored state, no data migration. `MET-COM-011` and `MET-FIN-040` are new, so
nothing is restated. `MET-FIN-041` formalises a value already being displayed — its number does not
change, only its identity.

## Rollback

Confined: two signal builders, two metric registrations, one renamed field and the coverage block.
Removing them restores the previous behaviour — which should not be done, since the static
completeness gate would then fail by design.
