# Scenario catalog — what the executive should see

**DEMO — SYNTHETIC DATA** · Phase 3 (correction & closure pass) · Seed `gldi-portfolio-2026-08-31` · Generator 1.0.0 · As of 2026-08-31

Eight curated executive scenarios drawn from a 91-project portfolio, plus the twelve archetypes the
rest of the portfolio is built from. **Every figure below is a demo narrative about fictional
projects. None of it is a claim about actual GlobalLogic delivery performance.**

Each scenario's numbers are produced by generated L1 facts — cost ledger entries, effort records,
progress claims, defect records, change records, risk register entries — not asserted alongside
them. The derived figures shown here are what Phase 4's engines will compute from those facts; the
Phase 3 validator recomputes them independently and fails the build if they drift
(`scripts/generator/validate.ts`).

---

## The eight curated scenarios

| # | Scenario | Archetype | Sold GM | Forecast GM | The one-line finding |
| --- | --- | --- | --- | --- | --- |
| **A** | Healthy Green | `HEALTHY_REFERENCE` | 24.00% | 22.50% | Nothing to do — and that matters |
| **B** | Green-at-Risk | `SILENT_DETERIORATOR` | 28.00% | 22.90% | Still Green, unmistakably falling |
| **C** | Reported Green, Evidence Amber | `SILENT_DETERIORATOR` | 22.00% | 16.00% | The reporting has not caught up with the arithmetic |
| **D** | Amber Recovering | `RECOVERING_RED` | 26.00% | 19.50% | Improving Red beats deteriorating Green |
| **E** | Scope & Commercial Leakage | `UNCOMPENSATED_SCOPE` | 24.00% | 15.83% | $280K delivered for free |
| **F** | ETC Optimism | `ETC_OPTIMISM` | 25.00% | 19.44% | The forecast does not match the run rate |
| **G** | Quality Margin Leakage | `QUALITY_SPIRAL` | 24.00% | 8.67% | Margin spent on rework nobody priced |
| **H** | Contract-Loss Risk | `CONTRACT_LOSS_RISK` | 24.00% | 3.00% | Negative once unresolved risk is counted |

Plus one **diagnostic case**, not one of the eight:

| # | Case | Archetype | Sold GM | Forecast GM | The one-line finding |
| --- | --- | --- | --- | --- | --- |
| **LR** | Leading Risk, No Cost Overrun | `SCHEDULE_SLIP_HONEST` | 25.00% | 25.65% | Every lagging measure says fine; every forward one disagrees |

---

### A — Healthy Green

| Measure | Value |
| --- | --- |
| Sold GM / Forecast GM | 24.00% → 22.50% |
| Physical vs planned completion | 62% vs 60% |
| Cost consumed | 60.4% |
| Contingency consumed | 13.8% |
| Rework | 4.5% (allowance 5%) |
| Excess rework cost | $0 |

**What the executive should see.** Nothing to do. Progress is on plan, cost is tracking to it, margin
has moved 1.5 points from as-sold and is stable. This project exists so the ranking has a credible
baseline to rank against — without a healthy majority every signal looks like noise.

---

### B — Green-at-Risk

| Measure | Value |
| --- | --- |
| Sold GM | 28.00% |
| Forecast GM trajectory | 27.5% → 26.2% → 24.7% → **22.9%** |
| Physical vs planned completion | **58% vs 66%** |
| Cost consumed | **70.0%** |
| Contingency consumed | **72.0%** |
| Uncommercialised exposure | **$90,000** |
| Reported RAG | **GREEN, every week** |

**What the executive should see.** The one to open first. Still reported Green and still above 20%
margin, so nothing escalates — but the trend is unambiguous: 27.5 → 26.2 → 24.7 → 22.9 over four
checkpoints. Progress is 8 points behind plan while 70% of the cost budget and 72% of contingency
are gone. Scope volatility is rising with $90K already delivered uncommercialised. There is still
time to act; in ten weeks there will not be.

---

### C — Reported Green, Evidence Amber · **the AC-2 flagship**

| Measure | Value |
| --- | --- |
| Sold GM → Forecast GM | 22.00% → 16.00% (**exactly 6 points of erosion**) |
| Physical completion | **48%** (planned 62%) |
| Contingency consumed | **82%** |
| Cost consumed | 64.6% |
| Reported RAG | **GREEN, every week** |
| Open blocking acceptance items | 3 |

**What the executive should see.** Reported Green every week for the whole period, while the evidence
has been Amber for most of it: six points of margin erosion, upward ETC revisions, UAT slipped, 82%
of contingency consumed at 48% completion. Nobody is lying — the reporting simply has not caught up
with the arithmetic. **The gap between the declaration and the evidence is the finding**, and it is
the single most valuable signal this product produces.

---

### D — Amber Recovering

| Measure | Value |
| --- | --- |
| Sold GM | 26.00% |
| Forecast GM trajectory | 26% → **16%** → 17% → 18.5% → **19.5%** |
| Executed change request | **+$600,000** contractual value |
| Contractual revenue | $4,600,000 (from $4,000,000) |
| Physical completion | 77% (planned 80%) |
| Reported RAG | AMBER, honestly |

**What the executive should see.** Red four months ago, now genuinely improving. A change request was
executed, staffing was rebalanced away from the senior-heavy mix, and rework is falling. This is here
to prove Red is not automatically the top of the list — **an improving Red needs less of your week
than a deteriorating Green.**

---

### E — Scope and Commercial Leakage

| Measure | Value |
| --- | --- |
| Sold GM → Forecast GM | 24.00% → 15.83% |
| Uncontracted scope delivered | **$280,000** |
| Executed change requests | **none** |
| Pending change requests | 3, all ageing unexecuted |
| Expected pending CR recovery | probability-weighted, **scenario only** |

**What the executive should see.** Roughly 18% more work in the backlog than was contracted, and not
one executed change request against it. $280K of scope has been delivered for free, and three CRs sit
unexecuted — the oldest raised six months ago. The margin loss is real and already incurred; the
recovery is commercial, not delivery, and it needs the account director this week rather than the
delivery manager.

---

### F — ETC Optimism

| Measure | Value |
| --- | --- |
| Actual cost to date | **$1,800,000** |
| Physical completion | **52%** |
| Management EAC | **$2,900,000** |
| Performance-implied EAC | **$3,461,538** |
| **ETC optimism gap** | **$561,538** |
| Sold GM → Forecast GM | 25.00% → 19.44% |

**What the executive should see.** The forecast does not match the run rate. $1.8M spent for 52%
delivered implies a $3.46M outturn; management's estimate says $2.9M. The $562K gap is not a
disagreement about scope — it is the same project measured two ways, and only one of the two has been
demonstrated. Ask what changes in the remaining 48% to make the second half cheaper than the first.

---

### G — Quality Margin Leakage

| Measure | Value |
| --- | --- |
| Sold GM → Forecast GM | 24.00% → **8.67%** |
| Rework ratio | **16%** (allowance 6%) |
| Excess rework cost | **~$190,000** |
| Open blocking acceptance items | **5** |
| Reopen trend | **worsening** — second half of the defect population reopens more than the first |

**What the executive should see.** Margin is at 8.7% against 24% sold, and the cause is not scope or
rates — it is rework. 16% of all effort is redoing work against a 6% allowance, which is $190K of
margin spent on defects nobody priced. Five acceptance blockers are open and the reopen rate is
climbing, so the remaining work is likely to cost more than the last, not less.

---

### H — Contract-Loss Risk

| Measure | Value |
| --- | --- |
| Sold GM → Forecast GM | 24.00% → **3.00%** |
| Incremental risk exposure | **$420,000** (risk *not* already in ETC) |
| **Risk-adjusted GM** | **−4.00%** |
| Payment-gating milestone | **missed**, 47 days late |
| Liquidated damages exposure | $180,000 |
| Open blocking acceptance items | 4 |

**What the executive should see.** This one is a commercial conversation, not a delivery one. 3%
forecast margin against 24% sold, and once unresolved risk that is not in the estimate is counted it
is −4%. A payment-gating milestone has been missed, liquidated damages are live, acceptance is
blocked and the customer has escalated. The remaining plan assumes a productivity step-change nobody
on this project has demonstrated in a year. Decide whether to reserve, renegotiate or exit.

> **The double-count guard is visible here.** Gross risk exposure exceeds $420K; only the risks whose
> `includedInEtc` flag is false contribute. A risk provisioned inside ETC *and* deducted from margin
> would be counted twice, which understates every portfolio it appears in.

---

### LR — Leading Risk, No Cost Overrun · **diagnostic case, not one of the eight**

Added by the Phase 3 correction pass (Correction 11) to prove the platform can later detect
deterioration **before** lagging cost and schedule status turns Red.

| Lagging measures | Value |
| --- | --- |
| Cost consumed | **55.00%** |
| Physical completion | **58.00%** — cost is *behind* progress |
| Sold GM → Forecast GM | 25.00% → **25.65%**, above as-sold |

| Forward signals | Value |
| --- | --- |
| Gating milestone forecast slip | **62 days**, forecast only — not yet a missed-date fact |
| Open customer dependencies | **4**, oldest **95 days** |
| Unsigned scope / executed CRs | **$310,000 / zero** |
| Open critical risks | **3** |
| Demonstrated vs required velocity | 1.00 vs **2.33** pp/week — **2.33×** |
| Contingency draw, last 8 weeks vs prior 8 | **$49,250** vs $25,000 |
| Blocking acceptance items | **3** |

**What the executive should see.** Cost is *ahead* of the game — 55% of budget consumed for 58%
delivered, and forecast margin is 25.65% against 25% sold. By any lagging cost or margin measure this
project is fine, and a traditional status report would say Green. Everything forward-looking
disagrees. Finishing on the committed date now needs roughly 2.3× the delivery rate the team has
actually demonstrated.

> **No System-Assessed RAG, trajectory or outlook is generated for this project.** Phase 3 supplies
> the evidence; Phase 4 must reach the conclusion independently. Its Reported RAG is an honest
> Green — the team sees no cost problem, because there is not one.

---

## The twelve archetypes

The other 83 projects are generated forward from causal drivers, not from target figures. Counts are
minimums; the generator fills the remainder with `HEALTHY_REFERENCE`.

| Archetype | Min | The narrative |
| --- | --- | --- |
| `HEALTHY_REFERENCE` | 22 | Genuinely well run. Without a credible healthy majority every signal looks like noise. |
| `SILENT_DETERIORATOR` | 6 | Reported Green while the evidence drifts to Amber over ~10 weeks. The product's entire claim. |
| `UNCOMPENSATED_SCOPE` | 5 | Client requests absorbed without change requests; pending CRs ageing unexecuted. |
| `PYRAMID_EROSION` | 3 | Date pressure met by staffing seniors. Schedule green, margin red. |
| `QUALITY_SPIRAL` | 4 | Late-discovered quality debt consuming the remaining budget, margin following with a lag. |
| `RECOVERING_RED` | 4 | Declared Red months ago, under a recovery plan, genuinely improving. |
| `ETC_OPTIMISM` | 3 | Cost running ahead of progress while the stated estimate has not moved. **New (ADR-0013 §6).** |
| `CONTRACT_LOSS_RISK` | 2 | Margin nearly gone, negative once risk is counted, milestone missed, LDs live. **New.** |
| `LOW_CONFIDENCE` | 4 | Reporting degraded — stale updates, missing fields. Health computes; confidence is Low. |
| `OVERRIDE_CONFLICT` | 2 | Evidence Red; an authorised, expiring executive override holds it Amber. |
| `FX_EXPOSED` | 3 | Non-USD contract; exchange movement contributes measurably to margin variance. |
| `SCHEDULE_SLIP_HONEST` | 3 | Genuine slip, well managed, transparently reported. Divergence zero — the control case. |

---

## Portfolio-level patterns

Fictional systematic tendencies, applied as a nudge to drivers rather than an override of the
archetype. **These exist solely to make the POC interesting and are never claims about actual
delivery performance.**

| Pattern | Applies to | Effect |
| --- | --- | --- |
| `MOBILITY_SCOPE_PRESSURE` | Mobility projects | More late requirement change, less of it commercialised |
| `NORTH_AMERICA_BLENDED_COST_PRESSURE` | North America | Upward blended-cost drift against the as-sold rate card |
| `MEDIA_QUALITY_PRESSURE` | Media & Entertainment | Higher defect injection and rework |
| `FINANCIAL_SERVICES_ACCEPTANCE_LATENCY` | Financial Services | Longer customer-side acceptance and more blocking dependencies |

---

## How to find a scenario

Every curated project carries `curatedScenario: 'A'…'H'` on its project record, and the manifest
lists the letter-to-project mapping:

```bash
npm run data:generate          # writes data/synthetic/ and MANIFEST.json
jq '.curatedScenarios' data/synthetic/MANIFEST.json
```

---

## Accounting corrections in the data

Recognised revenue carries append-only correction semantics (Phase 3 correction, Correction 6). Of
912 postings, **69 are corrections** — 33 `ADJUSTMENT`, 18 `REVERSAL`, 18 `RESTATEMENT`. Each names
the posting it supersedes and the original at the head of its chain, arrives later than what it
corrects, and leaves the superseded posting untouched.

This exists so Phase 4 and later Finance views can prove the model handles restatement. It also
produces a genuinely interesting condition on a handful of projects: invoiced value exceeding
*restated* recognised revenue, because a downward restatement months later does not retract an
invoice already issued.
