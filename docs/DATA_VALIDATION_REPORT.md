# Data validation report — synthetic portfolio

**DEMO — SYNTHETIC DATA** · Phase 3 (correction & closure pass) · Generated 2026-08-29

| | |
| --- | --- |
| Seed | `gldi-portfolio-2026-08-31` |
| Generator version | 1.0.0 |
| Spec version | 2.0.0 |
| As-of date | 2026-08-31 |
| Content hash | `7fdc2f19401e35503e944680b76de09be57b8533356a9d56564e84f9547ba0d7` |
| Total records | **126,126** |
| Result | **PASS** — 0 errors, 0 warnings |

Reproduce with `npm run data:generate`; re-check with `npm run data:validate`. Both run in CI, and
`TEST_STRATEGY.md` §6 makes a validation failure a **build failure**, not a warning.

---

## 1. Record counts

| Collection | Rows |
| --- | --- |
| `projects` | 91 |
| `effort` | 82,101 |
| `defects` | 21,008 |
| `actualCosts` | 7,292 |
| `progressClaims` | 3,458 |
| `contingencyDrawdowns` | 2,606 |
| `statusReports` | 1,845 |
| `scopeItems` | 1,568 |
| `etcLineItems` | 1,316 |
| `pendingChanges` | 1,121 |
| `assignments` | 1,135 |
| `recognisedRevenue` | 946 |
| `invoices` | 777 |
| `commitments` | 658 |
| `executedChanges` | 572 |
| `baselineRevisions` | 572 |
| `payments` | 540 |
| `milestones` | 527 |
| `risks` | 375 |
| `dependencies` | 178 |
| `fxRates` | 160 |
| `exposures` | 69 |
| `acceptanceItems` | 38 |
| `customers` | 16 |
| `accounts` | 16 |
| `programs` | 16 |
| `users` | 7 |
| `regions` | 4 |
| `industries` | 8 |
| `portfolios` | 3 |
| `businessUnits` | 3 |
| `ragOverrides` | 2 |

---

## 2. Checks performed

All thirteen check families pass. Each is implemented in `scripts/generator/validate.ts` and mirrored
by assertions in `tests/golden/synthetic-portfolio.test.ts`.

| # | Check family | What it asserts | Result |
| --- | --- | --- | --- |
| 1 | `shape.*` | 91 projects — 75 fixed-price, 11 T&M, 5 capacity; all 8 verticals, 4 regions, 4 TCV bands and 6 lifecycle sub-stages non-empty | ✅ |
| 2 | `archetypes.present` | All twelve archetypes have at least one project (REQ-DATA-008) | ✅ |
| 3 | `privacy.*` | No deny-listed real-world company token anywhere in the corpus; every person referenced by an opaque `psn-NNNN` handle (REQ-DATA-009) | ✅ |
| 4 | `integrity.fk` | Every foreign key resolves: effort→assignment, effort→project, costs→project, defects→project, risks→project, changes→contract, payments→invoice, recognition→project | ✅ |
| 5 | `periods.*` | Every week identifier is ISO-8601 `YYYY-Www`; no fact is dated after the as-of date | ✅ |
| 6 | `contract.*` | Every executed change has a matching contractual baseline revision; every superseded pending change points at a real executed record; no executed change is dated in the future | ✅ |
| 7 | `money.*`, `percent.range` | Every monetary value is a plain decimal string accepted by the `Money` value object; no negative amounts where none are supported; every percentage and probability within [0,1] | ✅ |
| 8 | `monotonic.*` | Cumulative recognised revenue never falls; physical completion never collapses | ✅ |
| 9 | `reconcile.*` | Invoiced ≤ recognised + tolerance; collected ≤ invoiced; recognised ≤ contractual revenue; contingency consumed ≤ contingency budget | ✅ |
| 10 | `history.*` | Every project ≥16 weeks old and reporting normally has ≥8 weekly progress claims; ≥60 projects carry a computable trajectory window; `LOW_CONFIDENCE` projects *are* measurably under-reported | ✅ |
| 11 | `scenario.A…H` | All eight curated scenarios recompute to their stated figures | ✅ |
| 12 | `layering.derived` | No derived metric is stored as a fact | ✅ |
| 13 | `labelling.synthetic` | Every fact row carries `synthetic: true` (invariant 11) | ✅ |

### 2.1 The independent recomputation

Check family 11 recomputes fourteen metrics from the generated facts using formulas written directly
from `METRIC_CATALOG.md`, independently of the metric registry and of any engine.

**This is deliberately not the Phase 4 engine and must not become it.** It exists to prove the
generated facts are coherent. If it and Phase 4 ever disagree, one of them is wrong, and the golden
fixtures in `tests/golden/definition-recomputation.test.ts` say which.

---

## 3. Curated scenario outcomes

Recomputed from the generated facts. Every figure matches the Phase 3 brief.

| # | Sold GM | Forecast GM | Physical | Planned | Cost % | Cont. % | Implied EAC | Optimism gap | Risk-adj GM | Incr. risk | Exposure | Rework |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 24.00% | 22.50% | 62% | 60% | 60.4% | 13.8% | — | $0 | 22.25% | $8,000 | $0 | 4.5% |
| B | 28.00% | **22.90%** | **58%** | **66%** | **70.0%** | **72.0%** | $6,951,724 | $783,724 | 22.83% | $93,000 | **$90,000** | 9.0% |
| C | 22.00% | **16.00%** | **48%** | 62% | 64.6% | **82.0%** | $5,250,000 | $1,050,000 | 15.61% | $60,000 | $64,000 | 11.0% |
| D | 26.00% | **19.50%** | 77% | 80% | 87.8% | 98.0% | $3,376,623 | $0 | 19.21% | $13,500 | $0 | 7.0% |
| E | 24.00% | **15.83%** | 56% | 62% | 63.1% | 43.6% | $2,053,571 | $33,571 | 17.43% | $33,000 | **$280,000** | 6.0% |
| F | 25.00% | 19.44% | **52%** | 60% | 66.7% | 64.0% | **$3,461,538** | **$561,538** | 18.36% | $39,000 | $0 | 8.0% |
| G | 24.00% | **8.67%** | 68% | 75% | 83.3% | 91.4% | $2,794,118 | $54,118 | 6.27% | $72,000 | $0 | **16.0%** |
| H | 24.00% | **3.00%** | 66% | 79% | 85.5% | 100.0% | $5,909,091 | $89,091 | **−4.00%** | **$420,000** | $0 | 13.0% |

Bold values are the figures the brief specifies. Scenario G's excess rework cost recomputes to
$190,016.58 against a stated "~190K" — the residual is accumulated 2dp rounding across ~40 weeks ×
10 assignments of effort rows, and is asserted to the nearest $100 rather than adjusted away
(`SYNTHETIC_DATA_SPEC.md` §9.4 forbids changing data to fit a number).

---

## 4. Causal coherence

The generator sets *drivers*, not outcomes. These relationships are asserted rather than assumed:

| Cause | Effect | Evidence in the data |
| --- | --- | --- |
| Scope arrives uncommercialised | Absorbed cost, exposure, margin pressure | E: $280K exposure, zero executed CRs, GM 24% → 15.83% |
| Executed CR | Contractual baseline moves — **from the execution date forward** | D: +$600K value, contractual revenue $4.0M → $4.6M, matching baseline revision |
| Defects rise | Rework hours rise → productive hours fall → cost per unit of progress rises | G: 16% rework, $190K excess cost, GM 24% → 8.67% |
| Rate drift | Blended cost per hour rises → EAC rises → GM falls | `PYRAMID_EROSION` and the North America pattern |
| Customer dependency unmet | Blocked effort → progress falls, cost absorbed | 178 dependency records with blocked effort attribution |
| ETC not revised to match performance | Implied EAC diverges from management EAC | F: $3.46M implied vs $2.9M stated, gap $561,538 |

### 4.1 Correction 1 — the invalid deterioration invariant, removed

An earlier version of this report and of the validator carried a **general** claim:

> ~~"A project cannot be labelled deteriorating unless cost consumed is ahead of physical
> completion."~~

**That is wrong, and it has been removed.** A project may deteriorate well before cost burn shows
it — through milestone forecast slippage, acceptance delay, customer dependency blockage, rising
requirements volatility, unsigned scope accumulation, a worsening reopen trend, a required future
velocity above the demonstrated one, resource instability, forecast-date deterioration, contingency
acceleration, or unresolved critical risk accumulation. Cost burn is **one** deterioration signal,
not a prerequisite for all deterioration.

What replaces it is the narrower, correct claim, scoped in `validate.ts` to
`COST_DRIVEN_EROSION_SCENARIOS`:

> Where a scenario **specifically models margin erosion caused by delivery inefficiency or cost
> overrun**, its cost and progress facts must causally support that mechanism.

B, C, G and H model that mechanism and are asserted against it. A, D, E, F and **LR** are not.

### 4.2 The counter-example — leading risk before adverse cost burn (Correction 11)

`prj-029` (scenario **LR**, *Leading Risk, No Cost Overrun*) exists to prove the platform can later
detect deterioration before lagging cost and schedule status turns Red.

| Lagging measures — all benign | |
| --- | --- |
| Cost consumed | **55.00%** |
| Physical completion | **58.00%** — cost is *behind* progress |
| Sold GM → Forecast GM | 25.00% → **25.65%**, above as-sold |

| Forward signals — all adverse | |
| --- | --- |
| Gating milestone forecast slip | **62 days** (forecast only; not yet a missed-date fact) |
| Open customer dependencies | **4**, oldest **95 days** |
| Uncontracted scope items / executed CRs | **4 / 0** — $310K accumulating unsigned |
| Open critical risks | **3** |
| Demonstrated vs required velocity | 1.000 vs **2.333** pp/week — ratio **2.33×** |
| Contingency draw, recent 8 weeks vs prior 8 | **$49,250** vs $25,000 — nearly doubled |
| Blocking acceptance items | **3** |

**No System-Assessed RAG, trajectory or outlook is generated for this project.** Phase 3 supplies the
evidence; Phase 4 must reach the conclusion independently. Its Reported RAG is an honest Green — the
team sees no cost problem, because there is not one.

---

## 5. MC-6 calibration — provisional, with an explicitly derived cohort

> ### ⚠️ SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY
>
> A synthetic distribution can test reasonableness and behaviour. It **cannot** establish an
> empirical real-world threshold. Production calibration requires business ownership and/or real
> historical evidence before any value here is used for anything that matters.

### 5.1 The eligible cohort — 54 of 91, derived from rules

The cohort was previously reported as 81 without the rules that produced it. Correction 5 required
those rules be written down; applying them yields **54**, and the earlier figure is superseded. It
had silently included T&M engagements, capacity engagements and the hand-solved curated scenarios.

Rules are in `scripts/generator/cohorts.ts` → `MC6_ELIGIBILITY`, and asserted by test.

| | Count | Why |
| --- | --- | --- |
| Total portfolio | 91 | |
| − non-fixed-price | 16 | Margin trajectory measures erosion against a fixed price. On T&M the client absorbs effort overrun, so the same slope means something different; mixing them makes the distribution describe two populations at once |
| − mobilisation / closed-out | 10 | A project in mobilisation has no history to have a trend; a closed-out one has stopped moving. Both drag the distribution toward zero for reasons unrelated to deterioration |
| − curated scenarios | 9 | A–H and LR are hand-solved to hit stated figures. Including them would calibrate the threshold partly against numbers chosen to demonstrate it — circular |
| − fewer than 12 weekly claims | 2 | A slope needs enough points to be a slope |
| **= eligible** | **54** | |

### 5.2 Distribution across the 54 (percentage points of margin per week)

| p05 | p10 | p25 | p50 | p75 | p90 |
| --- | --- | --- | --- | --- | --- |
| −1.769 | **−1.465** | −0.834 | −0.493 | −0.302 | −0.236 |

`TRAJECTORY-v1.marginDeteriorationSlopeThreshold` = **−1.40 pp/week** — just inside the tenth
percentile, flagging roughly the worst tenth of the cohort. Few enough for a CDO to act on in a
week, which is the constraint AC-1 imposes. `persistenceScale` = **6 weeks**. Both carry the
`SYNTHETIC CANDIDATE, NOT PRODUCTION POLICY` label in their unit field, asserted by test.

### 5.3 What remains open, and why it is not a data problem

Phase 3 owned calibrating the deterioration threshold against real generated series
(`PHASE_HANDOFF.md` §3.2a constraint 5). It is **partially** done, and the remainder is blocked on
something data cannot supply.

`deteriorationSlopeThreshold` is the slope of `MET-HLTH-010`, and the composite health score cannot
be computed until the HEALTH-v1 weights (MC-2) and band edges (MC-3) exist. Calibrating the slope of
a score with no definition would mean inventing the score. The same block applies to the four Silent
Deterioration Index weights and `slopeScale`. **Recalibrate in Phase 4.** MC-6 is *provisional*, not
closed.

---

## 6. Deliberate imperfection (G7)

`SYNTHETIC_DATA_SPEC.md` G7 requires the data to be imperfect on purpose — a pristine dataset makes
the Data Quality context untestable and the demo unbelievable.

| Imperfection | How it appears |
| --- | --- |
| Missed timesheet entries | ~5% of assignment-weeks have no effort row; 42% for `LOW_CONFIDENCE` |
| Missed progress claims | Same gap rate applied to weekly progress reporting |
| Late / backdated effort entry | ~8% of effort rows have `recordedAt` 5–16 days after `periodEnd`, so freshness is measurable rather than uniform |
| Unpaid and ageing invoices | ~14% of invoices have no payment, feeding receivables and DSO |
| Under-reported projects | `LOW_CONFIDENCE` projects are asserted to have materially fewer claims than weeks — the archetype must actually be degraded, not merely labelled |

Imperfection is **not** injected into the curated scenarios, whose narratives depend on precision.

---

## 7. What the generator deliberately does not produce

Per `PHASE_HANDOFF.md` §3.2a, verified by check family 12:

- **No derived metric.** No forecast GM, EAC, burn gap, margin bridge or value at risk is stored.
  Phase 4 computes these from the facts.
- **No health score, System-Assessed RAG, trajectory or outlook.** Those are `L2_DERIVED` and
  `L3_ASSESSED` outputs.
- **No recognised revenue derived from physical completion.** It is generated as an authoritative
  accounting fact under the documented `RECOGNITION-v1` synthetic policy and stamped with that
  policy id on every row (Phase 2 closure, Decision 1).
- **Reported RAG is the one status value present**, because `MET-HLTH-012` is `L1_OBSERVED` — a
  delivery manager's declaration, not an assessment. The divergence the product exists to detect is
  *caused* here, by declaring Green while the generated evidence says otherwise.

---

## 8. Known limitations

| # | Limitation | Impact |
| --- | --- | --- |
| 1 | MC-6 calibrated only for margin trajectory | Health-slope threshold and SDI weights recalibrate in Phase 4 |
| 2 | Scope units are not modelled | MC-8 is open, so `MET-DEL-012` and `MET-QUA-002` stay `Draft`. Progress is carried by `MET-DEL-016` throughout, so nothing downstream is blocked |
| 3 | Generator-internal arithmetic uses floating point | These are *generation decisions*, not the system of record. Every emitted amount is snapped through `Money` to a decimal string and check family 7 asserts it |
| 4 | Curated scenarios are solved backwards | Deliberate, and documented in `scripts/generator/curated.ts`. The 83 non-curated projects are simulated forward from drivers only |
| 5 | `.ndjson` output is not committed | 25 MB, and fully regenerable from the committed seed. `MANIFEST.json` carries the hash that proves it |
