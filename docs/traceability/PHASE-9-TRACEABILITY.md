# Requirement Traceability Report — Phase 9: Margin & Driver Intelligence

- **Phase:** 9 — **COMPLETE WITH DEBT**
- **⚠️ AMENDED 2026-08-31:** §2 of "what the gates caught" fixed `MET-RES-002` **halfway**. Time-phasing was right; the *field* it time-phased by was still wrong, and cost the portfolio $63.31M of phantom credit. See **§2a**. The prj-009 bridge table below is superseded.
- **Date:** 2026-08-31
- **Author:** COO + CFO + Chief Delivery Officer + Financial Analytics Product Lead
- **Requirements in scope:** REQ-MRGN-001…003; REQ-FIN-005; AC-3, AC-4, AC-7, AC-8
- **Artifacts consumed:** `PRODUCT_SPEC.md` §7.8, `ARCHITECTURE_DECISIONS.md` §4, `METRIC_CATALOG.md`,
  `SECURITY_MODEL.md` §4.3/§4.5, `PHASE_HANDOFF.md`, ADR-0002, ADR-0003, ADR-0004, ADR-0005,
  ADR-0020, ADR-0022

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. Requirement coverage

| REQ / AC | Requirement | State | Evidence | Result |
| --- | --- | --- | --- | --- |
| **REQ-MRGN-001** | As-sold → forecast margin bridge with named, reconciling causes | **IMPLEMENTED** | `MET-FIN-018` built in `financial`, exactly the eight registered causes in order, reconciling on **75 of 75** fixed-bid projects | ✅ 9 tests |
| **REQ-MRGN-002** | Erosion drivers ranked by currency impact | **IMPLEMENTED** | `rankedDestroyers` per project; portfolio ranking across four driver families, each sorted by currency descending and naming its basis | ✅ 4 tests |
| **REQ-MRGN-003** | Unsecured upside shown separately and excluded from committed margin | **IMPLEMENTED** | `MET-FIN-011` and `MET-COM-010` reported separately; `MET-COM-010` enters `MET-FIN-031` only, as a scenario | ✅ 3 tests |
| **REQ-FIN-005** | Pending CRs never in base forecast | **IMPLEMENTED** | Identity `MET-FIN-031 = MET-FIN-010 + MET-COM-010` asserted on **all 75** projects, plus a project where the two genuinely differ | ✅ |
| **AC-4** | Margin decomposition reconciles to the cent | **IMPLEMENTED** | `causeSum` equals `MET-FIN-017` exactly on every project; largest-remainder allocation settles the bridge in cents | ✅ **the phase's central claim** |
| **AC-3** | Every headline number drills to L1 facts in ≤3 steps | **IMPLEMENTED** | Bridge, trend, risk, ETC and portfolio sections each carry an `EvidenceDto` with metric id and rule version | ✅ |
| **AC-7** | Identical inputs → byte-identical outputs | **IMPLEMENTED** | `JSON.stringify` equality over the whole view | ✅ |
| **AC-8** | No colour-only status | **IMPLEMENTED** | The modelled marker rides on the **waterfall label**, so it survives into the text alternative and the data table | ✅ + 125 a11y tests |

## 2. What was built

| Component | Location | Metrics implemented |
| --- | --- | --- |
| **Margin bridge** | `src/contexts/financial/internal/margin-bridge.ts` | `MET-FIN-018` + `largestRemainderCents` |
| **Resource engine** | `src/contexts/resource/internal/resource-engine.ts` | `MET-RES-001`/`002`/`003`/`004`/`005`/`007`/`010` |
| **Unsecured upside ratio** | `economics-engine.ts` | `MET-FIN-011 ÷ MET-FIN-002`, where both operands are Financial's own |
| **Application service** | `src/app/margin/margin-intelligence.ts` | Core financials, bridge, trend, risk, contingency, ETC, driver economics, scenarios, portfolio ranking |
| **Surface** | `src/presentation/surfaces/margin-intelligence.tsx` | Phase 6 primitives only; no arithmetic |
| **Route + classification** | `contract.ts`, `demo-api.ts` | `project.viewCommercial`, audited, `PERSONAL_DATA` on staffing mix |
| **Demo** | `scripts/design/build-margin-intelligence.tsx` | 4 cases through the real gateway |

`resource` was `outputLayers: ["L1"]` in the manifest while registering **ten** `L2_DERIVED` metrics
and declaring them all in `ResourceSnapshot` since Phase 2 — the identical stale-entry pattern C-21
resolved. **ADR-0022 D-1 already settles the principle**, so the entry was corrected under it. No new
conflict was raised.

## 3. The bridge, and the two things that made it honest

The registered formula is *"ordered causes summing exactly to `MET-FIN-017`: scope-without-CR, effort
overrun, rate/mix, schedule extension, quality rework, pass-through, FX, **named residual**"*. The
named residual is what makes it determinate — unlike `MET-PORT-003` (C-20), nothing is
under-specified: whatever the named causes miss lands in the eighth, computed as `total − Σ(named)`.

**Two defects were found and fixed by measuring, not by reading.**

**1. The reconciliation failed on 10 of 75 projects at the twentieth decimal place.** Two causes are
products of a division and carry twenty significant digits; summing them and subtracting from the
delta gave `−47,999.9199999999999999999999999999` against `−47,999.92`. AC-4 is stated in cents, so
the bridge is now **settled in cents before the residual is taken** — largest-remainder, exactly as
the metric registers. Reconciliation became structural rather than exact-to-a-tolerance.

**2. `MET-RES-002` compared hours-to-date against whole-project planned hours.** On the flagship
project that gave −18,648 hours and a **+$1.38M phantom margin credit**, with a −$1.46M residual
absorbing it. The registered formula says *"planned hours (**named baseline**)"* — and naming the
baseline is the substantive part. The baseline is now **priced effort × planned physical completion
at t**, both observed figures. The same project's residual fell from −$1.46M to **+$17K**.

| prj-009 bridge | Amount | Basis |
| --- | --- | --- |
| Sold GM | $1.10M | opening (`MET-FIN-026`) |
| Scope delivered without a change request | −$64K | DERIVED |
| Effort overrun | −$102K | **MODELLED** |
| Rate and seniority mix | +$64 | **MODELLED** |
| Schedule extension | $0 | NOT_ATTRIBUTED — no forecast completion date (DR-050) |
| Quality and rework | −$151K | DERIVED |
| Pass-through | $0 | NOT_APPLICABLE — not modelled in this portfolio |
| FX movement | $0 | NOT_APPLICABLE — single currency |
| Unattributed residual | +$17K | RESIDUAL |
| **Σ causes** | **−$300K** | **= `MET-FIN-017` exactly** |

### 2a. AMENDMENT — the `MET-RES-002` fix above was only half a fix

*Added 2026-08-31 at the pre-Phase-11 architectural closure. §2 is retained as written.*

§2 correctly diagnosed that whole-project planned hours were the wrong baseline and correctly
time-phased them. **It then time-phased by the wrong field.** `ProgressClaim` carries two completion
figures, and §2's phrase *"planned physical completion at t"* elides exactly the distinction that
matters:

| Field | Question it answers |
| --- | --- |
| `plannedCompletion` | *Where the **schedule** said we would be by now* |
| `physicalCompletion` | *How much work has **actually** been completed* |

The implementation used `plannedCompletion`. That asks *"have we spent the hours we planned to have
spent by today?"* — so a project **behind schedule** has not done the work, has not burned the hours,
and books an **effort underrun** that the bridge values at the sold rate and reports as **margin
gained**. Slippage was being reported as efficiency.

| Measured on the demo portfolio | |
| --- | --- |
| Fixed-bid projects behind schedule | **48 of 75**, median **7.0pp** |
| Phantom margin credit created purely by the field choice | **$63.31M** |
| `effort-overrun` cause, net across 75 projects | **+$48.75M** — a *credit*, on a portfolio losing $79.72M |
| After correction (**ADR-0024**) | **−$14.57M** |
| Unattributed residual, net, before → after | **−$112.52M → −$49.21M** |

**The residual is what exposed it.** §3 of this report treated the residual as a reconciling
remainder. A residual of −$112.52M against a total delta of −$79.72M means the *named* causes netted
**+$32.80M** — they claimed the portfolio had gained money while it was losing it. **A residual
larger than the movement it explains is a sign error, not noise**, and the sign census (62 of 75
residuals negative) confirmed it was systematic.

`MET-RES-002` is now **v2.0.0**: `actual hours − (plannedEffortHours × physicalCompletion at t)` —
the earned-value comparison, which isolates effort efficiency from schedule position. Schedule
position keeps its own metric in the delivery dimension and is **not** re-expressed as money in the
bridge. Health bands and GM value at risk are unaffected (they derive from EAC-based economics, which
do not consume `MET-RES-002`); the blast radius is the bridge's attribution.

**No test failed when this was corrected.** The bridge's cause values were never pinned, so a $63M
swing in a headline term moved nothing. That gap is closed by the adversarial tests in
`tests/integration/architecture-closure.test.ts` §6.

### 2b. AMENDMENT — the bridge reconciles by construction, and now says how much it explains

The residual is defined as `total − Σ(named)`, so **AC-4 holds however little the named causes
account for**. This report presented reconciliation as evidence of attribution quality; it is not.
`explanatoryCoverage` (`Σ|named| / (Σ|named| + |residual|)`) is now computed and rendered:
**45.5% at the median project**, with `schedule-extension`, `pass-through` and `fx` structurally zero
on all 75. Recorded as **DR-062**. The waterfall is a partial attribution and now says so on the page.

---

**Effort overrun and rate/mix cannot double count.** `soldRate × (actualHours − plannedHours)` plus
`(actualRate − soldRate) × actualHours` is identically `actualCost − plannedCost` — the price/volume
split is the only pairing that partitions the cost delta exactly. Any other pairing overlaps, and
the overlap would appear twice on the waterfall.

## 4. Attribution honesty

Every cause carries one of five bases, and the distinction is on the face of the chart rather than in
a footnote:

- **DERIVED** — governed metrics over observed facts.
- **MODELLED** — a modelling choice was made. Valuing hours at a rate is a choice, and the label says
  so (DR-058).
- **NOT_ATTRIBUTED** — real, and this repository cannot measure it. Schedule extension is *not zero*;
  it is unmeasured, and the explanation says exactly that.
- **NOT_APPLICABLE** — cannot arise for this portfolio. FX in a single-currency book.
- **RESIDUAL** — computed, named, and interrogable: executed-CR margin is broken out inside it.

## 5. Risk, change requests and scenarios

- `MET-FIN-032` deducts **only incremental** risk. The amount already provisioned inside ETC is
  **displayed**, so the control is visible rather than asserted, and each in-ETC risk row reads
  *"excluded, to avoid double counting"*.
- `MET-FIN-011` (unsecured upside) and `MET-COM-010` (probability-weighted) are shown separately, and
  **neither is in forecast revenue**. The identity `MET-FIN-031 = MET-FIN-010 + MET-COM-010` is
  asserted across all 75 projects.
- Three scenarios, each stating its **arithmetic in full** — no hidden probabilistic maths. The
  contract-loss warning renders above everything when any scenario is negative.

## 6. Tests and gates

```
1075 tests, 0 failed, 0 skipped   (30 files)   was 1020
+55  tests/integration/margin-intelligence.test.tsx
```

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **98 source files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **1075 passed, 0 failed, 0 skipped** |
| authorization / a11y | 272 / 125 |
| metric registry / catalog | 42 |
| `npm run data:validate` | 126,126 records, hash `7fdc2f19…` **unchanged** |
| `npm run design:margin` | 4 cases through the real gateway |
| secret scan | 262 files, 0 findings |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| document links | 103 links, 0 broken |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |

**Three gates caught real defects during the build**, which is the return on having them:

1. **G-FLOAT** rejected a float remainder in the largest-remainder allocation, and later a
   `parseFloat` in the chart-value helper. Both were rewritten decimal-safe.
2. **Deny-by-default field classification** threw on the unclassified `coverage` field in Phase 8's
   resource and again here — a control firing before a human looked.
3. **Field shaping** omitted the `PERSONAL_DATA` staffing mix and the surface crashed mapping it.
   **No role in this product holds `PERSONAL_DATA`**, so the field is absent from every payload; the
   surface now renders the withholding, which is the control being demonstrated rather than hidden.

Two of my own tests were wrong and were **corrected rather than weakened**: one asserted forecast and
risk-adjusted revenue must differ on a project that has no pending change requests, and one grepped
for the word "compensation" — which matched the page's own disclaimer saying no compensation is
shown. Both now test the real property: the identity across all 75 projects plus a project that
genuinely has pending CRs, and that no **actual** `personRef` from the facts reaches the payload.

## 7. Demo

`npm run design:margin` → `docs/design/margin-intelligence.html`.

| Case | Result |
| --- | --- |
| **CDO** on curated **H** (Contract-Loss Risk) | 200 · bridge reconciles · **CONTRACT LOSS** warning |
| **CDO** on curated **E** (Scope & Commercial Leakage) | 200 · bridge reconciles · no loss warning |
| **CDO** on curated **G** (Quality Margin Leakage) | 200 · bridge reconciles · **CONTRACT LOSS** warning |
| **Delivery Manager** | **404** — does not hold `project.viewCommercial` |

## 8. Technical debt

| DR | Item | Owning phase | Gate | Blocks Phase 10? |
| --- | --- | --- | --- | --- |
| **DR-056** | No location or subcontractor dimension on assignments; mix is seniority-only | 10 | `PHASE_10_BLOCKER` | No |
| **DR-057** | `blockedByDependencyId` never populated, so dependency economics cannot be valued | 10 | `PHASE_10_BLOCKER` | No |
| **DR-058** | Two bridge causes are `MODELLED` and one is `NOT_ATTRIBUTED` (pending DR-050) | 10 | `ACCEPTED_DEBT` | No |

Carried forward unchanged: **DR-048/C-20** still blocks the *Phase 7* gate — Phase 9 does **not**
consume the portfolio GM value-at-risk aggregate, so nothing here depends on it.

## 9. Self-review

- [x] **Does the bridge reconcile?** Yes, on 75 of 75, to the cent, asserted per project.
- [x] **Is any cause presented as accounting truth when it is a modelling choice?** No — two are
      marked `MODELLED` on the chart label, in the table, and in the text alternative.
- [x] **Is any risk counted twice?** No. Only incremental risk is deducted, and the excluded amount
      is displayed.
- [x] **Is a pending CR anywhere in base revenue?** No, asserted across the whole portfolio.
- [x] **Did any formula or metric definition change?** No. `MET-FIN-018` is implemented exactly as
      registered; `MET-RES-002`'s *baseline* was named, which the formula requires and does not fix.
- [x] **Does any component compute a business value?** No — asserted by source inspection.
- [x] **Is individual compensation exposed?** No — asserted against the actual `personRef` values,
      and the staffing shape carries band, headcount and FTE only.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      reconciliation, double counting, CR handling, determinism and authorization. **In front of the
      client** for the five-question CFO gate — §10.

## 10. Acceptance gate — what was and was not verified

| Question | Answered by | Verified |
| --- | --- | --- |
| What destroyed margin? | The bridge waterfall, ranked destroyers beneath it | ✅ by test |
| How much has already eroded? | `MET-FIN-025` in core financials; the bridge's opening and closing | ✅ by test |
| What additional amount is at risk? | GM VaR, incremental risk exposure, the downside scenario | ✅ by test |
| How credible is the ETC? | Management vs performance-implied EAC, with the maturity gate stated | ✅ by test |
| Which lever recovers the most value? | Ranked destroyers, top recoverable GM, portfolio driver ranking | ✅ by test |
| *Can a CFO work all five in one sitting?* | — | ❌ **not verified — open the page and judge** |

The Chrome extension is not connected, so **the page was never viewed**. Structural demonstration and
human validation are separate claims, and only the first is made here.
