# Traceability Report — Pre-Phase-11 Architectural Closure

- **Phase:** closure pass between Phase 10 and Phase 11 — **COMPLETE WITH DEBT**
- **Date:** 2026-08-31 / 2026-09-01
- **Author:** Chief Architect review
- **Scope:** correctness of shipped formulas and the strength of the claims made from them.
  **No new product scope. Phase 11 not started.**
- **Artifacts consumed:** `METRIC_CATALOG.md`, `SECURITY_MODEL.md`, `PRODUCT_SPEC.md`,
  `ARCHITECTURE_DECISIONS.md`, ADR-0001…0024, `PHASE_HANDOFF.md`, Phase 7–10 traceability

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. What this pass found

Two **economic sign errors** in Frozen metrics, both of which had passed every gate — typecheck,
architecture, schema, lint, ~1150 tests, registry validation, catalog checks — for multiple phases.

| # | Defect | Effect | Resolution |
| --- | --- | --- | --- |
| **C-20** | `MET-PORT-003` de-duplicated value at risk across projects sharing a `riskCauseKey` | **Removed $38.93M of $89.19M — 44% of portfolio exposure** | **ADR-0023** supersedes ADR-0021. VaR = **$90.80M** |
| **C-22** | `MET-RES-002` time-phased the priced effort by **planned** completion instead of **physical** | **$63.31M of phantom margin credit**; the `effort-overrun` cause read **+$48.75M** on a portfolio losing **$79.72M** | **ADR-0024**. `MET-RES-002` v2.0.0 |

**Neither was found by a failing test.** Both were found by auditing outputs against the business
meaning they claim.

### The single most important finding

**Both defects have the same shape**, and it is a shape the gates cannot see:

> A Frozen formula **defers a choice** it does not fix → the implementation **makes** the choice →
> **nothing records** that a choice was made → the choice is wrong → every downstream check still
> passes, because the code is a faithful implementation of a wrong specification.

`MET-PORT-003` deferred *"the group total attributable to that cause"*. `MET-RES-002` deferred
*"planned hours (**named baseline**)"*. In both cases the deferral was legitimate; leaving it
unrecorded was the defect.

**The gates verify the code against the specification. Nothing verifies the specification against
the business meaning.** That gap is not closed by this pass, and it is the reason the honest summary
of this work is *"the audit is incomplete"* rather than *"the code is now clean"*.

## 2. Requirement and metric impact

| Item | Before | After | Evidence |
| --- | --- | --- | --- |
| `REQ-PORT-003` | Met on a **wrong basis** (ADR-0021) | **Met** — each distinct project counted once (ADR-0023) | Phase 7 §10a; adversarial tests |
| `MET-PORT-003` | v1.0.0, $50.26M | **v2.0.0**, **$90.80M** | Registry + catalog regenerated |
| `MET-RES-002` | v1.0.0, schedule baseline | **v2.0.0**, earned baseline | Registry + catalog; `architecture-closure` §6 |
| `MET-RES-010` | Inherited the wrong hours basis | Inherits the corrected basis | ADR-0024 D-2 |
| `MET-FIN-018` | Reconciled; explanatory power unstated | Reconciles **and reports coverage** | `architecture-closure` §7 |
| `MET-FCST-030` | `0.0%` rendered bare | Qualified; `executiveAuthoritative: false` | `architecture-closure` §5 |
| `MET-DEL-023` | Computable on **1 of 75** | **14 of 75** | As-of predicates + boundary tests |
| `MET-DEL-017` | Deferring phrase unrecorded | Recorded as deferring **nothing** | `architecture-closure` §8 |
| `MET-RES-003` | Deferring, unrecorded | Deferring, **named as DR-064** | `architecture-closure` §8 |

**Health bands and GM value at risk did not move under ADR-0024** — RED 47 / AMBER 27 / GREEN 1,
$90.80M, before and after — because they derive from EAC-based economics, which do not consume
`MET-RES-002`. The blast radius is the margin bridge's attribution. That narrows the impact and
excuses nothing: the bridge was wrong on its own terms.

## 3. Claim-strength corrections

Three places presented a conclusion stronger than the evidence supported. None was a wrong number;
all three were wrong **confidence**.

| Claim | What it said | What it says now |
| --- | --- | --- |
| **Late detection** | **"0.0%"** as a headline | The qualification renders **above** the figure; `historicalCoverage: PARTIAL`; `reconstructedDimensions: [FINANCIAL]`; `unavailableDimensions: [DELIVERY, SCOPE_COMMERCIAL, PRODUCT_QUALITY]`; `available` now means *quotable*, not *computed* |
| **Margin bridge** | "Reconciles to the cent — AC-4 holds" | Still true, and now stated as **by construction**. `explanatoryCoverage` reports what the named causes actually carry: **45.5% at the median project** |
| **RAG band** | A RED band read as a score | Measured: **47 of 75 REDs are override-forced and ZERO are band-driven** (composite alone: GREEN 15 / AMBER 39 / RED 21). `bandProvenance` is exposed with a surface callout |

### The demo itself was misrepresenting the model

The margin demo rendered three curated scenarios whose explanatory coverage is 95.4%, 87.1% and
65.2%. A reviewer would reasonably have concluded the bridge explains ~90% of margin movement. The
median project is **45.5%**, and the worst is **1.6%**.

**`prj-089` — 1.6% coverage on a $2.06M margin loss — is now the fourth case on the page**, beside
the 95.4% one. A demo assembled only from projects the model explains well misrepresents the model,
and that is a claim-strength failure even when every figure on it is correct.

## 4. New governance controls

| Control | What it prevents |
| --- | --- |
| **Frozen-metric determinacy sweep** (`architecture-closure` §8) | The exact shape of both defects. Enumerates Frozen metrics reachable from an executive output whose formula defers a choice, and **fails by name** unless each is recorded in an ADR, a rule set, or a named debt item |
| **Earned-baseline identity** (§6) | Re-wiring `MET-RES-002` to the schedule figure; `plannedCompletion` differs from `physicalCompletion` on 74 of 75 projects, so the identity fails outright |
| **Reconciles ≠ explains** (§7) | A bridge narrative implying reconciliation proves attribution |
| **Late-detection qualification** (§5) | An unqualified "0% late detection" executive claim from a partial replay |
| **As-of temporal predicates** + adapter grep | A future settlement date being read as already settled |
| **Escalation-ladder control** | A "warning" that fires after the band it was meant to precede |

## 5. Tests and gates

```
1182 tests, 0 failed, 0 skipped  (33 files)   was 1132 at Phase 10
```

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **103 source files, 19 contexts, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **1182 passed, 0 failed, 0 skipped** |
| `npm run data:validate` | 126,459 records, hash `514e835b…`, **reproducible from the seed** |
| all five `design:*` builds | rendered through the real gateway |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |
| **Any page viewed in a browser** | ❌ **NO — never, for any page, in any phase** |

**No generator fact changed in this pass.** ADR-0024 reads `physicalCompletion`, which was already
recorded on every progress claim; the content hash is unchanged from Phase 10's `514e835b…`.

### Tests of mine that were wrong, corrected rather than weakened

1. **The C-20 hostile-input property test was asserting the defect** — it demanded that twenty $1M
   projects sharing a cause total $1M. It was cited in the Phase 7 report as evidence.
2. **"A behind-schedule project can never book an effort credit"** — false, and it failed. Under
   earned value, slippage and efficiency are **independent**: `prj-017` is 7pp behind schedule and
   genuinely 338 hours under its earned baseline. Replaced with the baseline identity, which is the
   property actually being claimed.

## 6. What was deliberately NOT done

- **No threshold, weight or band edge was recalibrated.** Not one. The portfolio's RAG distribution
  (RED 47 / AMBER 27 / GREEN 1) is unflattering and unchanged.
- **No formula was changed to reduce a residual.** ADR-0024 halves the residual as a side effect;
  the reason for it is the sign error, and DR-062 stays open precisely so the improvement is not
  mistaken for a closure.
- **`MET-RES-003`'s seniority split was not changed** (DR-064). It defers to a "resource config"
  that does not exist, and `MID` is placed junior by a constant — moving it swings the portfolio
  pyramid ratio **0.607 → 1.464**. Choosing is a rule-owner policy decision; inventing one is the
  failure this closure exists to prevent.
- **No warning hysteresis policy was invented** (DR-063). Damping sets how long a real deterioration
  stays invisible — a decision with a safety direction, owned by the rule owner, ADR before code.
- **Phase 11 was not started.**

## 7. Debt

Three new items, and a reclassification of the whole register by **kind** rather than by phase
(`PHASE_HANDOFF.md` §3b), because the register's ordering hid the only question that matters: *which
of these can make the product say something untrue?*

| DR | Item | Category | Gate |
| --- | --- | --- | --- |
| **DR-062** | Bridge reconciles by construction; explains 45.5% at the median | B — unsupported claim strength | `ACCEPTED_DEBT` |
| **DR-063** | No early-warning hysteresis; flap rate unmeasured | D — missing capability | `PHASE_11_BLOCKER` |
| **DR-064** | `MET-RES-003` seniority split is an unrecorded definitional judgement | C′ — unrecorded definitional choice | `EXECUTIVE_DEMO_BLOCKER` |

**Category A — semantic defect — is now empty.** Both members were closed this pass. It is also the
only category that ever misled anyone here, and the only one found by audit rather than declared by
its author.

## 8. Self-review

- [x] **Did any change make the portfolio look better?** ADR-0023 raised exposure $50.26M → $90.80M.
      ADR-0024 turned a $48.75M effort *credit* into a $14.57M *cost*. Both moved the numbers
      **against** the portfolio. No threshold was touched.
- [x] **Was any formula changed to reduce a residual?** No — §6.
- [x] **Is any residual claim stronger than its evidence?** Not to the depth this audit reached. The
      three known weak claims now carry machine-readable qualification fields.
- [x] **Would a CFO reconciling these figures against the previous pack find a discrepancy?** **Yes,
      twice, and both are large.** VaR moves $50.26M → $90.80M and the bridge's effort term moves
      $48.75M → −$14.57M. Both are documented with the reason, the date and the ADR.
- [x] **Is the traceability record honest about having been wrong?** Yes. Phase 7 §10 is retained
      verbatim with §10a stating it was closed once on a wrong basis; Phase 9 §2 likewise with §2a;
      Phase 10 §8 with §8a. **Nothing was rewritten to look correct in hindsight.**
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now — for
      determinacy, sign, reconciliation, coverage, temporal state and authorization. **In front of
      the client** for anything requiring a human to look at a page.

## 9. The honest caveat

**Two economic sign errors were found in two successive audit passes of the same codebase**, both in
Frozen metrics that had passed every automated gate for multiple phases. The rate at which auditing
finds them has not reached zero.

The correct inference is **not** that the code is now clean. It is that a third pass would probably
find a third defect, and that the class of error — a deferred definitional choice, made silently in
implementation — is systemic rather than incidental. The determinacy control added in §4 turns that
class into a build failure going forward, but it cannot retroactively validate the choices already
made and recorded.

**Phase 11 must therefore treat every economic figure it surfaces as *auditable*, not as *audited*.**
