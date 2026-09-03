# SYNTHETIC_ENTERPRISE_PORTFOLIO_CONTRACT.md

**DEMO — SYNTHETIC DATA.** Binding contract for what the generated portfolio must contain.

Status: **Proposed.** Authored during the enterprise reframe after the 2 Sep 2026 live review.
Supersedes nothing; it constrains `SYNTHETIC_DATA_SPEC.md` §3 and §5 rather than replacing them.

---

## 1. Why this document exists

The portfolio produced 74 of 75 fixed-bid projects Amber or Red, and exactly one system-GREEN
project. System Green-at-Risk — the product's signature capability — therefore had an empty
candidate pool and rendered `0`, beside a primary button offering to *"Show 0 Green-at-Risk
projects"*. The intervention ranking could not discriminate because every project was critical.

None of that was caused by a threshold, a weight or a band edge. It was caused by three defects in
synthetic **input** generation (§6). The lesson this document encodes: **a demonstration portfolio
is an engineered artefact with acceptance criteria, not an incidental output of a simulation.**

The governing principle is unchanged and absolute:

> Do not make the portfolio healthier. Make it believable.
> Never move a threshold, weight, band edge, override policy or RAG rule to change a distribution.
> If governed rules put the portfolio outside the envelope below, the fault is in the synthetic
> inputs. Fix those.

---

## 2. Reasonableness envelope — a check, never a target

These are **acceptance ranges applied after generation**, never inputs to health logic. No code may
read them.

| Measure | Envelope (75 fixed-bid) | Rationale |
| --- | --- | --- |
| System GREEN | 45–55 | A delivery organisation that cannot keep two thirds of its portfolio healthy is not operating; it is failing. Every signal reads as noise without a healthy majority. |
| System AMBER | 15–22 | Enough to populate an intervention queue that requires judgment to order. |
| System RED | 5–10 | Rare enough that Red means something. |
| Reported ≠ System | 4–10 | The governance-divergence finding needs a population; too many implies systemic misreporting, which is a different story. |
| System Green + adverse 30/60 outlook | 3–8 | The early-warning population. Must never be zero. |
| Trajectory IMPROVING | ≥ 4 | A product that only ever finds deterioration is incomplete. Recovery must be visible. |
| Trajectory DETERIORATING + RAPIDLY | ≤ 40% of population | Above this the portfolio reads as an organisation in freefall. |

**Distribution sanity is not believability.** A portfolio can sit inside every range above and still
be obviously constructed. §4 governs that separately.

---

## 3. Required populations — each must exist, none may be named

The portfolio must contain at least one project satisfying each condition. These are **contract
tests**, and the synthetic build fails if a condition is unsatisfiable — it is never silenced by
relabelling a project that has drifted.

| # | Condition | Governed assertion |
| --- | --- | --- |
| P1 | Healthy reference | System GREEN, stable, 30d and 60d GREEN, no override fired |
| P2 | System Green / Emerging Risk | System GREEN **and** (30d ∈ {AMBER,RED} or 60d ∈ {AMBER,RED}) **and** no hard override forcing Amber/Red **and** intervention window still open |
| P3 | Reported Green / evidence disagrees | Reported GREEN, System ∈ {AMBER,RED}, divergence recorded |
| P4 | Hard override | Pre-override composite band ≠ final System RAG |
| P5 | Burn / progress mismatch | Cost consumed materially ahead of physical completion |
| P6 | ETC optimism | MET-FIN-030 optimism gap material and ELV-ETC-OPTIMISM fired |
| P7 | Scope / commercial leakage | MET-COM-009 uncommercialised exposure material |
| P8 | Contract loss | Risk-adjusted GM negative |
| P9 | Low explanatory coverage | Attributed Movement Coverage materially low, bridge still reconciling |
| P10 | PROVISIONAL assessment | Assessment status PROVISIONAL with the missing input named |
| P11 | Recovering | Trajectory IMPROVING with an active recovery plan and realised benefit |
| P12 | Acceptance / dependency risk | Acceptance blockers or customer dependency ageing material |

### 3.1 P2 is the one that must be genuinely early

An emerging-risk project must be recognisable to an executive as *"nothing has failed yet, but we
should act now."* It must **not** be a distressed project wearing a Green band. Concretely: modest
margin erosion, modest burn divergence, leading signals turning, milestones not yet missed, required
future velocity becoming difficult but not impossible, and no catastrophic quality or contractual
condition. If the only way to produce P2 is to make a failing project Green, the scenario has drifted
and the build fails.

---

## 4. Believability — no synthetic fingerprints

A skeptical CDO seeing the data for the first time must not be able to tell which rows were
constructed for which feature.

1. **Ordinary projects dominate.** Curated scenarios are a small minority seeded among them.
2. **No scenario label may appear in a project name.** Names describe work a client would recognise
   — *"Meridian Automotive — Connected Cockpit Platform"* — never *"Green-at-Risk"*,
   *"Contract-Loss Risk"*, *"ETC Optimism"* or *"Reported Green, Evidence Amber"*.
3. **No value may repeat implausibly.** Time-to-act, executive action, narrative text and driver
   values must disperse. A single time-to-act value on more than ~15% of the population is a
   fingerprint.
4. **No uniform trajectory.** Improving, stable and deteriorating must all be materially present.
5. **No everywhere-round numbers.** Dimension scores of exactly 0.0 and exactly 100.0 on one project
   read as constructed.
6. **Economic dispersion must be plausible.** TCV, sold GM, erosion and VaR spread across bands; a
   forecast GM of −114% is a scenario, not a population member.
7. **Recovery must not be uniformly absent.** "Not assessed" on every project makes the recovery
   capability undemonstrable.

---

## 5. Lifecycle and control-state coverage

The population must exercise every governed control state **by construction**. These states
previously appeared by accident and vanished when an unrelated generator defect was corrected.

| State | Where it must arise |
| --- | --- |
| `INSUFFICIENT_EXECUTION_HISTORY` | A project too few weeks into delivery for a demonstrated velocity |
| `NO_REMAINING_WORK` | A project in UAT/acceptance: built what was contracted, awaiting acceptance |
| `NO_REMAINING_DELIVERY_WINDOW` | A closed-out project past its contractual date |
| Fully applicable | At least one project evaluating 8/8 applicable controls |
| `NOT_APPLICABLE` ≠ not computable | Every inapplicable control carries a reason code, never "evidence unavailable" |

**No test may pin a control state to a project id.** Coverage is asserted over the population;
which project holds a state is not a fact worth freezing. A test that pins an id will pass on
artefacts and fail on corrections — which is exactly what happened to `NO_REMAINING_WORK`.

---

## 6. Defects this contract exists to prevent

All three were in synthetic input generation. None was a threshold.

1. **Progress accrued linearly against an S-curve plan.** `plannedProgressAt` is `3f² − 2f³`; at 75%
   elapsed it expects 84.4% complete while a linear accrual reaches 75%. Every project drifted ~9pp
   behind its own plan through its back half, with no driver causing it.

2. **`teamSize` was clamped to [4, 18] while also being the numerator of progress.** A project whose
   planned effort implied 30 FTE received 18 and could never track its plan, producing progress
   variances of −53pp and −72.8pp on projects the generator intends as healthy.

3. **`plannedHours = budgetedCost / rate` budgeted labour at 100% of the cost base**, while the
   simulator charges non-labour and pass-through at 5–11% of labour on top every week. Non-labour was
   an overrun *by construction* — roughly 8pp of uniform margin erosion before any archetype acted.

Together these meant 37 fixed-bid `HEALTHY_REFERENCE` projects — drivers at pure baseline, no drag,
no drift, no optimism — produced 1 Green, 20 Amber and 16 Red.

**Standing rule:** when the portfolio falls outside §2, look here first. A driver-level explanation
must exist for every departure from plan. If a project with baseline drivers does not land near its
sold margin and its planned completion, the generator is wrong, not the health model.

---

## 7. Reporting obligation

Every regeneration reports, before and after: RAG distribution, TCV, sold and forecast GM, GM
erosion, GM VaR, contract-loss exposure, scope exposure, trajectory mix, 30/60 transition counts,
time-to-act dispersion, recovery status mix, explanatory-coverage spread and evidence completeness.

Differences are attributed explicitly to **synthetic input regeneration** — and any semantic change
is identified separately and never folded into a data-change narrative.
