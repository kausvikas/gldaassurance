# Requirement Traceability Report — Phase 10: Forward Risk, Early Warning & Recovery

- **Phase:** 10 — **COMPLETE WITH DEBT**
- **⚠️ AMENDED 2026-08-31:** §8 reported **"0.0% late detection"** as a headline. That figure comes from a **partial** historical replay and is no longer rendered unqualified. See **§8a**.
- **Date:** 2026-08-31
- **Author:** Chief Delivery Officer + DA Transformation Lead + Risk Product Manager + Recovery Program Architect
- **Requirements in scope:** REQ-RISK-001…002; REQ-REC-001; AC-3, AC-7, AC-8
- **Artifacts consumed:** `PRODUCT_SPEC.md` §3.4/§7.8, `ARCHITECTURE_DECISIONS.md` §4,
  `METRIC_CATALOG.md`, `SECURITY_MODEL.md` §4.2/§4.5, `PHASE_HANDOFF.md`, ADR-0003, ADR-0004,
  ADR-0005, ADR-0019, ADR-0020, ADR-0022

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 0. The data change, declared up front

**DR-049 is closed, and closing it changed the generator.** Three fact tables were added —
`recoveryPlans` (28), `recoveryActions` (84) and `warningDispositions` (65). **No existing fact
changed**; the tables are purely additive.

| | Before | After |
| --- | --- | --- |
| Generator version | `1.0.0` | **`1.1.0`** |
| Content hash | `7fdc2f19…` | **`5a3bdc96…`** |
| Records | 126,126 | **126,303** |

The hash covers the whole fact set, so it necessarily moved. The version bump is what makes that
movement explicable rather than alarming, and `data/synthetic/MANIFEST.json` was regenerated so
`REQ-DATA-007` still holds: same seed and version, same hash, verified by test.

This was the closure evidence DR-049 itself named — *"recovery plans in the synthetic portfolio"* —
so it is a planned change, not a surprise.

## 1. Requirement coverage

| REQ / AC | Requirement | State | Evidence | Result |
| --- | --- | --- | --- | --- |
| **REQ-RISK-001** | Forward risk register with exposure, proximity and trend | **IMPLEMENTED** | 13 `EARLY_WARNING-v1` rules, each carrying value, threshold, trend, severity, economic impact, rule id/version and evidence time | ✅ 9 tests |
| **REQ-RISK-002** | Early warnings detected before a band moves | **IMPLEMENTED** | Thresholds set deliberately tighter than the health band edges; curated **B** fires 4 warnings while its band has not moved | ✅ |
| **REQ-REC-001** | Recovery plan with owned actions and recovery economics | **IMPLEMENTED** | `MET-REC-001/002/003` compute on 28 plans; `computeRecoveryEconomics` was already built in Phase 4 and finally has data | ✅ 8 tests |
| **AC-3** | Every headline drills to evidence in ≤3 steps | **IMPLEMENTED** | Every section carries an `EvidenceDto` with metric id and rule version | ✅ |
| **AC-7** | Identical inputs → byte-identical outputs | **IMPLEMENTED** | `JSON.stringify` equality over the whole view; warning order is severity then rule id | ✅ |
| **AC-8** | No colour-only status | **IMPLEMENTED** | Severity is a word plus its distance past threshold; no status is carried by colour | ✅ + 125 a11y tests |

## 2. What was built

| Component | Location | Notes |
| --- | --- | --- |
| **Early-warning rules** | `src/contexts/rules/internal/early-warning-rules.ts` | 13 rules, `WARNING` severity, thresholds as data |
| **Detection + lifecycle engine** | `src/contexts/forecast/internal/early-warning-engine.ts` | `DetectedWarning`, lifecycle join, `MET-FCST-030` |
| **`MET-FCST-030` Late Detection Rate** | registry `phase4.ts` | Frozen, L3, registered this phase |
| **Recovery facts** | `scripts/generator/recovery.ts` | Plans, actions, dispositions — deterministic from the seed |
| **Application service** | `src/app/risk/forward-risk.ts` | Signals, outlook, actions, recovery economics, assurance, priority, late detection |
| **Surface** | `src/presentation/surfaces/forward-risk.tsx` | Phase 6 primitives only; no arithmetic |
| **Route + classification** | `contract.ts`, `demo-api.ts` | `project.view`, audited; recovery economics `COMMERCIAL_CONFIDENTIAL` |
| **Demo** | `scripts/design/build-forward-risk.tsx` | 4 cases through the real gateway |

**The detection engine reuses the existing rules engine.** `ThresholdRule` and `SignalReading`
already carried everything needed — including `trend` and `estimatedImpact` — so early warning is a
new *rule set*, not a second evaluation mechanism.

## 3. Design decisions worth stating

**A warning is derived, never stored.** It is recomputed from current evidence on every run, so
detection cannot drift from the numbers it claims to be about. What *is* stored is the human act that
followed — assurance's disposition, delivery's corrective action. Separating the two is what makes
follow-through measurable: a warning nobody dispositioned is a different failure from one that was
validated and then ignored.

The output type is `DetectedWarning`, deliberately **not** the context's Phase 2 `EarlyWarning`,
which models a *persisted* record. Giving them one name would blur exactly that distinction.

**Severity is distance past the threshold, not importance.** A burn gap 0.1 points past its threshold
and one 30 points past fire the same rule and are not the same problem. Severity is the observed
value's multiple of its own threshold, banded by data in `rules` — which keeps it comparable across
signals measured in completely different units.

**Thresholds sit tighter than the health band edges, on purpose.** A warning system calibrated at the
band edge would only ever confirm what the RAG already said. That is the late-detection failure the
product exists to remove.

**Delivery owns execution; assurance owns follow-through.** An action carries a delivery owner and a
status; a disposition carries an assurance actor and a control clock. Overdue assurance is an
**assurance exception** — reported against the control, never folded into the project's health.
`PRODUCT_SPEC.md` §3.4 keeps assurance as confidence and exception, not as a weighted dimension, and
this phase did not change that.

## 4. What was deliberately not done

- **No fake probability.** The outlook section states in full that the bands are rule outputs:
  *"nothing here is trained, fitted or sampled"*. A rules engine described in the language of a model
  makes a claim it cannot support, and a test greps the source for percentage-likelihood phrasing.
- **No 90-day horizon.** None is registered in `METRIC_CATALOG.md`, so the row reads *not projected*
  with the reason rather than extrapolating from the 60-day band.
- **No mutation.** Nothing on the surface changes a baseline, an ETC or an official band. The
  authority notice is rendered on the page, the route is `isWrite: false`, and a test asserts both.
- **No recalibration** of health bands, override thresholds or HEALTH-v2 weights.

## 5. Curated demonstration — detection → intervention → outcome

| Scenario | Signals | Recovery | Rank | Shows |
| --- | --- | --- | --- | --- |
| **B** Green-at-Risk | **4** (1 severe) | case 25.3%, credibility 90.0, uplift 2.4pp | 39 of 75 | **Detection.** Rules firing before the band moved — the window a RAG cannot describe |
| **D** Amber Recovering | **0**, 11 clear | case 20.6%, credibility 86.7, **1 action discarded** | 66 of 75 | **Outcome.** What recovery working looks like; the empty signal list is the finding |
| **H** Contract-Loss Risk | **6** | case 4.7%, credibility **60.0** — the lowest | 26 of 75 | **Intervention.** Multiple signals, overdue actions, weakest plan |

## 6. Tests and gates

```
1132 tests, 0 failed, 0 skipped   (31 files)   was 1075
+56  tests/integration/forward-risk.test.tsx
```

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **102 source files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **1132 passed, 0 failed, 0 skipped** |
| authorization / a11y / golden | 272 / 125 / 184 |
| metric registry + catalog | 43 |
| `npm run data:validate` | 126,303 records, hash `5a3bdc96…`, **reproducible from the seed** |
| `npm run design:forward-risk` | 4 cases through the real gateway |
| secret scan | 272 files, 0 findings |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| document links | 103 links, 0 broken |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |

**Five tests failed after the deliberate changes and were resolved on their merits, not weakened:**

1. **Content-hash reproducibility** — the expected outcome of closing DR-049. Generator bumped to
   `1.1.0` and the manifest regenerated, so the invariant still holds.
2–4. **Catalog drift** (3 tests) — `MET-FCST-030` registered; catalog regenerated from the registry.
5. **Observation policy** — the rule required every `forecast` metric to have one. `MET-FCST-030` is
   a **portfolio KPI over a population**, not a sampled time series, so it has no window. The
   exemption is now **named with its reason**, plus a second test asserting the exemption only ever
   covers metrics that genuinely aggregate across projects — the rule was tightened, not loosened.

One of my own assertions was wrong (matching *"never as a weighted health dimension"* against text
reading *"not as a weighted health dimension"*) and was corrected to the actual wording.

## 7. Technical debt

| DR | Item | Owning phase | Gate | Blocks Phase 11? |
| --- | --- | --- | --- | --- |
| ~~DR-049~~ | ~~No recovery-plan store~~ — **CLOSED** | — | — | — |
| **DR-059** | Late detection rewinds only the financial dimension — no per-period snapshot of delivery, commercial or quality exists | 11 | `PHASE_11_BLOCKER` | No |
| **DR-060** | No authorised workflow to accept a recommendation or record a closure | 12 | `PHASE_12_BLOCKER` | No |
| **DR-061** | All 13 early-warning thresholds are uncalibrated synthetic candidates | 11 | `PHASE_11_BLOCKER` | No |

## 8. Late detection, measured

**0.0% across 27 fixed-bid projects reaching Red** — every one passed through Amber first.

That is an honest result and it comes with a stated limitation: only the financial dimension genuinely
rewinds (DR-059), so the historical band is a financial-dimension band. Carrying today's delivery,
commercial and quality signals back into a past period would have made detection look better than it
was, so those signals are **omitted from the historical assessment rather than back-filled**.

### 8a. AMENDMENT — 0.0% was never quotable as an executive conclusion

*Added 2026-08-31 at the pre-Phase-11 architectural closure. §8 is retained as written.*

§8 stated the DR-059 limitation honestly in prose and then **still let "0.0%" stand as the headline
number**. A reader who sees the figure and stops reading takes away a conclusion the evidence does
not support: the rate measures detection against a **financial-dimension band**, not against the
four-dimension band the product reports today.

The engine now carries the coverage explicitly rather than describing it in a footnote:

| Field | Value on this portfolio |
| --- | --- |
| `historicalCoverage` | **`PARTIAL`** |
| `reconstructedDimensions` | `FINANCIAL` |
| `unavailableDimensions` | `DELIVERY`, `SCOPE_COMMERCIAL`, `PRODUCT_QUALITY` |
| `executiveAuthoritative` | **`false`** |

The rate renders as *"0.0% (partial history — not an executive conclusion)"*, the qualification is
rendered **above** the number rather than after it, and `available` now means *quotable* rather than
*computed*. DR-059 stays open and is reclassified as **Category B — unsupported claim strength**
(`PHASE_HANDOFF.md` §3b), which is the class that matters most entering Phase 11: an assistant will
quote whatever confidence the payload implies.

---

## 9. Self-review

- [x] **Does a warning fire before the band moves?** Yes — curated B fires 4 while its band is
      unmoved, and thresholds are deliberately tighter than the band edges.
- [x] **Is any rule output presented as a probability?** No, and a test greps for it.
- [x] **Can a recovery plan bank one saving twice?** No — incompatibility groups are enforced by the
      Phase 4 engine, discarded actions are shown with the reason, and a test asserts at least one is
      genuinely discarded.
- [x] **Is an assurance failure charged to the project?** No. It is reported against assurance and
      changes no band.
- [x] **Can anything here mutate a baseline, ETC or band?** No — asserted three ways: the notice, the
      route's `isWrite: false`, and a source grep.
- [x] **Did any existing fact, formula or threshold change?** No. Three additive fact tables; the
      version bump and hash change are declared in §0.
- [x] **Does any component compute a business value?** No — asserted by source inspection.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      detection, lifecycle, double counting, authority and authorization. **In front of the client**
      for the seven-question gate — §10.

## 10. Acceptance gate — what was and was not verified

| Question | Answered by | Verified |
| --- | --- | --- |
| What will likely break first? | Emerging signals, most severe first | ✅ by test |
| Why? | Each signal's value against its threshold, with the rule that fired | ✅ by test |
| How much is at risk? | Economic impact per signal; recovery economics | ✅ by test |
| What should happen now? | Recovery actions, with the discarded ones explained | ✅ by test |
| Who owns it? | Owner on every action; assurance ownership stated separately | ✅ by test |
| By when? | Due date on every action; the assurance control clock | ✅ by test |
| What value can be protected? | Recovery case and probability-adjusted case, with credibility | ✅ by test |
| *Does it work as a review in front of a CDO?* | — | ❌ **not verified** |

The Chrome extension is not connected, so **the page was never viewed**. Structural demonstration and
human validation are separate claims, and only the first is made here: open
`docs/design/forward-risk.html` at 1440×900 and judge it.
