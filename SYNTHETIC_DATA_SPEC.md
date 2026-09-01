# SYNTHETIC_DATA_SPEC.md — Demo Portfolio Specification

**Status:** Generated (Phase 3)
**Version:** 2.1.0 — revised by **ADR-0013** (Accepted, explicit), corrected by the Phase 3 closure pass
**Authority:** The demo narrative. Later phases may not invent projects, rename accounts, or alter
scenario outcomes to make a screen look better (global invariant 3).

---

## 1. Why the data is specified before it is generated

Synthetic data is where POCs quietly go wrong. Generated ad hoc, it produces a portfolio where the
margin bridge doesn't reconcile with the effort data, the "deteriorating" project has no
deterioration in its history, and the AI assistant confidently narrates a story the numbers don't
support. Each screen looks fine alone; together they contradict each other, and the demo dies under
the first informed question.

The data must therefore be **coherent, causal, and reproducible**: every visible symptom must have a
generated cause in the underlying facts, and the same seed must always produce the same portfolio.

---

## 2. Generation principles (binding)

| # | Principle |
| --- | --- |
| **G1** | **Deterministic.** A fixed seed produces byte-identical output. No wall-clock, no unseeded randomness, no `Math.random()` (REQ-DATA-007, AC-7). |
| **G2** | **Causal, not decorative.** Symptoms are *generated from* causes. A project with eroding margin has the effort overruns, rate drift, or rework hours that produce that erosion — arithmetically, not narratively. |
| **G3** | **Reconciling.** Cross-domain assertions hold: recognised revenue ≤ contract value; invoiced ≤ recognised + tolerance; effort hours × rates ≈ labour cost; margin bridge causes sum to the total delta. |
| **G4** | **Historical.** 18 months of weekly snapshots, so trajectory metrics have real series to compute over (ADR-0003 §3). Weekly is a superset of the monthly reporting the Phase 3 brief asked for: 78 weekly points roll up to monthly periods, whereas 12 monthly points cannot fill `MET-FCST-001`'s eight-week window (ADR-0013 §1). |
| **G10** | **Accounting corrections are append-only.** A recognised-revenue posting is immutable, but the *effective* position for a period may change through further authoritative postings that name what they supersede. Insert-once does not mean accounting history can never be corrected. |
| **G9** | **Observed facts only.** The generator emits L1 facts. Forecast GM, EAC, health, RAG assessment and trajectory are `L2_DERIVED`/`L3_ASSESSED` and are computed by Phase 4 from this data. Reported RAG (`MET-HLTH-012`) and Recognised Revenue (`MET-FIN-009`/`039`) are present because both are `L1_OBSERVED`. |
| **G5** | **Fixed as-of date.** The demo "today" is **2026-08-31**. All history precedes it. Nothing regenerates with the calendar. |
| **G6** | **Fictional and non-identifying.** No real client names, no real people, no real figures, no near-misses on real GlobalLogic accounts (REQ-DATA-009). |
| **G7** | **Imperfect on purpose.** Real portfolios have missing fields, stale updates, and inconsistent reporting. A pristine dataset makes the Data Quality context untestable and the demo unbelievable. |
| **G8** | **Every archetype present and findable.** Each scenario in §5 exists, is reachable in the UI, and is named in the demo script. |

---

## 3. Portfolio shape

Revised by **ADR-0013** (Accepted). v1.0.0's 48-project shape is superseded.

| Dimension | Value |
| --- | --- |
| Business units | 3 (Americas, EMEA, APAC) |
| Regions | 4 (North America, LATAM, Europe, India/APAC) — a **separate axis** from business unit |
| Client accounts | 16 |
| Programs | 16 |
| Projects | **91** |
| Engagement models | **Fixed-price 75** (the Phase 3 brief), plus T&M 11 and Capacity 5 retained so `PRODUCT_SPEC.md` §4.1 coverage survives |
| TCV bands | `<$1M` 18 · `$1–5M` 38 · `$5–10M` 22 · `$10M+` 13 |
| Contract value range | $0.42M – $28M |
| Lifecycle sub-stages | Mobilization 8 · Early execution 16 · Mid-project 28 · Late-stage 21 · UAT/acceptance 12 · Closed out 6 |
| History | up to 78 weekly snapshots per project (18 months), capped by project start |
| Currencies | USD (reporting), EUR, GBP, INR, JPY — with dated FX (exercises ADR-0002 §6) |
| Verticals | Mobility, Industrial & Energy, Media & Entertainment, Technology, Financial Services, Healthcare & Life Sciences, Communications, Retail & Consumer |
| Total records | 126,126 |

**Why 91:** the brief asks for ~75 fixed-price projects; the 16 T&M and capacity engagements are
retained because `PRODUCT_SPEC.md` §4.1 requires those models to be *modelled but not optimised for*,
and dropping them would remove that coverage silently. Large enough that a portfolio view genuinely
requires ranking rather than reading (AC-1).

**Why fixed-bid dominant:** it is the commercial model where the north-star question bites hardest —
scope risk sits with GlobalLogic, so silent scope creep converts directly into margin loss.

---

## 4. Naming conventions

- **Clients:** invented corporate names with an explicit fictional marker in metadata, e.g.
  *Meridian Automotive*, *Northwind MedTech*, *Calder Financial*, *Halden Telco*, *Ardent
  Industrial*, *Vireo Media*. Checked against no real trademark of a GlobalLogic client.
- **Projects:** `<Client> <Capability> <Phase>` — e.g. *Meridian Connected Vehicle Platform R2*.
- **People:** synthetic personas with generated names, referenced by role wherever possible.
  Individual-level data is `PERSONAL_DATA` even when synthetic (`SECURITY_MODEL.md` §8).
- Every generated record carries `synthetic: true` and the generator version.

---

## 5. Required scenario archetypes

Each archetype must exist with the *causes* generated, not merely the labels applied. Counts are
minimums.

### 5.1 `SILENT_DETERIORATOR` — 4 projects — **the flagship (AC-2)**

Reported **Green** throughout. System-Assessed drifts Green → Amber over ~10 weeks.

Generated causes: effort burn outpacing scope completion; CPI declining from 1.02 to 0.88; rework
hours rising; two milestones re-forecast without a baseline change; `MET-HLTH-030` positive and
persistent for 6+ weeks.

**Demo purpose:** the product's entire claim. At least one of these must be large enough that its
value at risk puts it top of `MET-PORT-007` — a small deteriorating project is a curiosity, a $14M
one is a Monday morning.

### 5.2 `UNCOMPENSATED_SCOPE` — 4 projects

Client requests absorbed without change requests. Pending CRs raised late and ageing unexecuted.

Generated causes: scope units delivered exceeding contracted units; `MET-COM-007` ageing 60–140
days; `MET-COM-009` rising to 8–14%; `MET-FIN-011` (unsecured upside) material and — critically —
**excluded** from forecast revenue, so the demo can show the honest number beside the hopeful one
(REQ-FIN-005, REQ-MRGN-003).

### 5.3 `PYRAMID_EROSION` — 3 projects

Date pressure met by staffing seniors. Delivery looks fine; margin does not.

Generated causes: `MET-RES-003` drifting from as-sold 1:3 toward 1:1.4; blended cost rate up 12–20%;
schedule metrics healthy while `MET-FIN-014` erodes 6–9pp. **Schedule green, margin red** — the case
that proves health cannot be one number.

### 5.4 `QUALITY_SPIRAL` — 3 projects

Late-discovered quality debt consuming the remaining budget.

Generated causes: escaped defect rate rising post-release; S1/S2 backlog growing (`MET-QUA-009`
positive slope); rework ratio 18–30%; ETC revised upward twice; margin follows quality with a ~6-week
lag — visible in the trajectory series, which is the point.

### 5.5 `RECOVERING_RED` — 3 projects

Declared Red 4–6 months ago, under an active recovery plan, genuinely improving.

Generated causes: recovery baseline established; interventions with owners and dates, some
succeeded, some not; health trajectory positive; margin stabilised below as-sold but no longer
falling. **Demo purpose:** proves the product distinguishes *improving Red* from *deteriorating
Green* — and that Red is not automatically the top priority.

### 5.6 `HEALTHY_REFERENCE` — 8 projects

Genuinely well-run. Metrics near baseline, no divergence, high confidence.

**Demo purpose:** without a credible healthy majority, every signal looks like noise and the ranking
proves nothing.

### 5.7 `LOW_CONFIDENCE` — 3 projects

Reporting has degraded: stale updates, missing fields, absent quality data.

Generated causes: `MET-DQ-002` freshness 21–60 days; `MET-DQ-001` completeness 45–70%; quality domain
absent entirely on one. Health computes, but `MET-DQ-005` is Low.

**Demo purpose:** proves `PRODUCT_SPEC.md` §3.4 — these projects escalate as a *reporting failure*
with a named owner, are never hidden, and their health claim is explicitly qualified rather than
quietly presented (REQ-DQ-003).

### 5.8 `OVERRIDE_CONFLICT` — 2 projects

System-Assessed Red; an authorised executive override holds them Amber with a documented reason and
expiry.

**Demo purpose:** exercises REQ-HLTH-007 and shows all three RAG values coexisting — the override is
visible, attributed, dated, and expiring, not a silent adjustment.

### 5.9 `FX_EXPOSED` — 2 projects

Non-USD contract with local-currency delivery cost; FX movement contributes measurably to margin
variance and appears as its own named cause in `MET-FIN-018`.

**Demo purpose:** proves the margin bridge decomposes causes the delivery team did not create — and
that the FX cause reconciles like any other (AC-4).

### 5.10 `SCHEDULE_SLIP_HONEST` — 3 projects

Reported Amber, System-Assessed Amber, genuine slip, well-managed and transparently reported.

**Demo purpose:** the control case. `MET-HLTH-030 = 0`. Not every Amber is a problem with reporting,
and the product must not cry wolf on honest teams — a system that penalises candour destroys the
reporting quality it depends on.

### 5.11 `ETC_OPTIMISM` — 3 projects · **added by ADR-0013 §6**

Cost running well ahead of delivered progress while management's estimate to complete has not moved
to match.

Generated causes: `productivityDrag` above 1.15 with a positive weekly drift; ETC revisions recorded
at ~72% of the honest bottom-up figure. `MET-FIN-029` performance-implied EAC diverges from
`MET-FIN-008` and `MET-FIN-030` measures the gap.

**Demo purpose:** the forecast and the run rate are the same project measured two ways, and only one
of them has been demonstrated. Curated scenario **F**.

### 5.12 `CONTRACT_LOSS_RISK` — 2 projects · **added by ADR-0013 §6**

Margin nearly gone, and negative once unresolved risk is counted.

Generated causes: heavy productivity drag, high defect injection, uncommercialised scope, rate drift
and frequent customer blocking; a missed payment-gating milestone with live liquidated damages; risks
carrying `includedInEtc = false` so they contribute to `MET-RSK-008`.

**Demo purpose:** proves the risk-adjusted view can cross zero while the headline forecast is still
positive, and that the double-count guard works. Curated scenario **H**.

---

## 5A. The eight curated executive scenarios

Ten archetypes were approved in Phase 0; ADR-0013 §6 adds two, and the Phase 3 brief's eight lettered
scenarios are the **curated demo script drawn from that set** — not a replacement for it. Dropping
the five unmentioned archetypes would have failed REQ-DATA-008 and removed the demos for REQ-DQ-003,
REQ-HLTH-007 and AC-4.

| Letter | Scenario | Archetype |
| --- | --- | --- |
| A | Healthy Green | `HEALTHY_REFERENCE` |
| B | Green-at-Risk | `SILENT_DETERIORATOR` |
| C | Reported Green, Evidence Amber | `SILENT_DETERIORATOR` |
| D | Amber Recovering | `RECOVERING_RED` |
| E | Scope & Commercial Leakage | `UNCOMPENSATED_SCOPE` |
| F | ETC Optimism | `ETC_OPTIMISM` |
| G | Quality Margin Leakage | `QUALITY_SPIRAL` |
| H | Contract-Loss Risk | `CONTRACT_LOSS_RISK` |

Plus one **diagnostic case**, `LR` — *Leading Risk, No Cost Overrun* — added by the Phase 3
correction pass. It is not a ninth executive scenario. It exists because deterioration does **not**
require adverse cost burn, and Phase 4 must be testable against detecting leading risk before lagging
cost and schedule status turns Red.

Full figures and the "what the executive should see" narrative for each:
[`docs/SCENARIO_CATALOG.md`](docs/SCENARIO_CATALOG.md).

**The curated eight are solved backwards** — the brief states target figures, so the L1 facts are
chosen to produce exactly those figures. The other 83 projects are simulated forward from causal
drivers only. Both are documented in `scripts/generator/curated.ts` and `scripts/generator/simulate.ts`.

---

## 6. Data quality injection (G7)

Deliberate imperfection, applied by seeded rule so it is reproducible:

| Imperfection | Extent |
| --- | --- |
| Missing optional fields | ~12% of records |
| Missing required fields | Confined to `LOW_CONFIDENCE` projects |
| Stale updates (>14 days) | ~15% of active projects |
| Late/backdated timesheet entries | ~8% of effort records |
| Cross-domain inconsistency within tolerance | ~5% of projects |
| Absent quality-domain reporting | 1 project |

Imperfection is **never** injected into the projects whose narrative depends on precision
(`FX_EXPOSED`, `OVERRIDE_CONFLICT`, and the flagship `SILENT_DETERIORATOR` used in the demo script) —
noise there would undermine the very reconciliation the demo is proving.

---

## 7. Users and scopes (for AC-5)

Seeded demo users must make the authorization story demonstrable:

| User | Role | Scope | Demonstrates |
| --- | --- | --- | --- |
| `exec.cdo` | `EXECUTIVE` | All | Full portfolio and commercial breadth |
| `dir.emea` | `PORTFOLIO_DIRECTOR` | EMEA only | Scope filtering; aggregates over authorised set |
| `dir.amer` | `PORTFOLIO_DIRECTOR` | Americas only | Two directors, different portfolio totals |
| `dm.meridian` | `DELIVERY_MANAGER` | 3 projects | **Commercial fields absent from payload** (AC-5) |
| `fin.controller` | `FINANCE_CONTROLLER` | All | Commercial without delivery detail |
| `audit.assurance` | `ASSURANCE_AUDITOR` | All, read-only | Audit log access |
| `sec.admin` | `SECURITY_ADMIN` | Identity only | **No business data at all** |

`dir.emea` and `dir.amer` must have **non-overlapping, materially different** portfolio values so
scope enforcement is visible on screen, not just in tests.

---

## 8. Generation output & reproducibility

- Generator lives in `scripts/generator/`; entry points `scripts/generate-data.ts` and
  `scripts/validate-data.ts`; output in `data/synthetic/`.
- Seed recorded in `data/synthetic/MANIFEST.json` with generator version, as-of date, record counts,
  and a **content hash**. The manifest is committed; the `.ndjson` output is not, because it is
  25 MB and fully regenerable from the committed seed.
- Current seed `gldi-portfolio-2026-08-31`, generator 1.0.0, content hash
  `424623d5fe6356dd91af4b3247c931b8f415b417bfb6435c7060391c9d401dc1`.
- **Regeneration with the same seed must reproduce the identical hash.** A changed hash without a
  changed seed or generator version is a defect (REQ-DATA-007).
- Generator version bumps when logic changes; the manifest records which version produced the data.
- A validation pass runs after generation and **fails the build** on: broken cross-domain assertions
  (G3), a missing archetype (G8), any real-world name match, or any snapshot series too short for
  trajectory computation.

---

## 9. Prohibitions

1. Real client, employee, or partner names — including recognisable disguises.
2. Real financial figures from any actual engagement.
3. Any personal data of a real person.
4. Adjusting generated data to make a screen look better. If a screen looks wrong, the finding is
   either a real product defect or a scenario defect — fix the cause, not the number.
5. Regenerating with a different seed to escape an inconvenient result.
6. Unlabelled data: every record carries `synthetic: true`.
7. Narrative-only scenarios where the label says "deteriorating" but the underlying series does not
   deteriorate (violates G2 — and it is exactly the kind of thing an informed audience finds).
