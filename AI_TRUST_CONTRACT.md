# AI_TRUST_CONTRACT.md

**Phase:** 11A — architecture only. **Binding on every assistant answer.**
**Status:** Proposed — depends on ADR-0031 (`Proposed`).
**Date:** 2026-09-01
**Authority:** ADR-0004 (epistemic layering) · ADR-0023 · ADR-0024 · ADR-0025 · ADR-0026 · ADR-0027 ·
ADR-0028 · `METRIC_CATALOG.md` · `PHASE_0_10_SEMANTIC_CLOSURE.md`

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. The four layers, and the one-way door

| Layer | Name | What it is | Produced by |
| --- | --- | --- | --- |
| **L1** | Observed Fact | An authoritative source observation | Ingestion / synthetic generator |
| **L2** | Deterministic Derived Metric | A governed calculation over L1 | Domain contexts, decimal-safe |
| **L3** | Assessed Intelligence | Rules, health, trajectory, warning, recovery, ranking | `health`, `forecast`, `rules`, `recovery`, `portfolio` |
| **L4** | Generated Narrative | Natural-language explanation **of** L1–L3 | The assistant — presentation only |

**The assistant may transform L1–L3 into L4. It may never promote L4 back into L1–L3.**

That door is one-way and it is enforced structurally, not by instruction:

- `MaterialClaim.epistemicLayer` is typed `'L1' | 'L2' | 'L3'`. **L4 is not a representable claim
  layer.** Prose that asserts something no claim carries has no layer to be stamped with, and the
  validator rejects it.
- The model emits `ValueReference`s, not digits (ADR-0004 §4). A generated number cannot occupy a
  fact position because it never becomes a value.
- An L4 sentence is never persisted, never cited, never fed back as an input, and never audited as
  content (`AI_ASSISTANT_ARCHITECTURE.md` §9). **There is no path by which today's narrative becomes
  tomorrow's evidence.**

### The failure this prevents

The repository's entire defect history has one shape: *a numerically valid output carries wrong
semantics because a layer above or below it silently loses meaning*
(`PHASE_0_10_SEMANTIC_CLOSURE.md` §1). A language model is a layer that loses meaning
**by default** — it is trained to produce plausible continuations, and a plausible continuation of a
governed L3 assessment is an ungoverned L4 conclusion that reads exactly like one.

---

## 2. The claim envelope (ADR-0031)

Every assistant-consumable material output carries this envelope. It is assembled at the application
boundary from fields that **already exist** in the domain — this contract standardises them, it does
not invent them.

| Field | Type | Source today |
| --- | --- | --- |
| `metricId` | `string \| null` | Metric registry (`MetricDefinition.id`) |
| `ruleId` | `string \| null` | `RuleEvaluation.ruleId` |
| `version` | `string` | `MetricDefinition.version` / `RuleEvaluation.ruleVersion` |
| `epistemicLayer` | `'L1' \| 'L2' \| 'L3'` | `Provenance.layer`, `MetricDefinition.epistemicLevel` |
| `asOf` | `Instant` | `@platform/time` as-of predicates |
| `sourceDomain` | `string` | `MetricDefinition.sourceDomain` |
| `evidenceFreshness` | `'CURRENT' \| 'STALE' \| 'UNKNOWN'` | Data-quality context; band-ceiling logic (DR-018 closure) |
| `evidenceCoverage` | `Ratio \| null` | `MET-FIN-041` for the bridge; input-state census elsewhere |
| `assessmentStatus` | `'COMPLETE' \| 'PROVISIONAL' \| 'NOT_COMPUTABLE'` | `health-engine.ts` |
| `signalState` | `SignalState` | `@platform/explainability` (ADR-0028) |
| `calibrationStatus` | `'SYNTHETIC_UNVALIDATED' \| 'APPROVED'` | Derived from `MetricDefinition.calibrationParameters` |
| `executiveAuthoritative` | `boolean` | `early-warning-engine.ts`; default **`false`** where unstated |
| `limitations` | `string[]` | Debt items reachable from this value (DR ids), machine-attached |
| `syntheticData` | `true` | Structural, never hand-typed (G-DEMO) |

**Two defaults are deliberately pessimistic**, for the reason ADR-0028 gives about `observed: null`:
an un-migrated producer must not be able to manufacture confidence.

- `executiveAuthoritative` absent ⇒ **`false`**.
- `calibrationStatus` absent ⇒ **`SYNTHETIC_UNVALIDATED`**. In this POC it is *always* that value;
  there is no approved calibration anywhere in the repository.

---

## 3. Claim strength: the binding rules

Each rule is machine-evaluable from the envelope and enforced by the grounding validator. **These are
not style guidance.**

| # | Condition | The prose **must not** | The prose **must** |
| --- | --- | --- | --- |
| **CS-1** | `executiveAuthoritative === false` | Present the metric as an executive conclusion; use it as a premise for a recommendation | Report it *as reported*, with its stated limitation adjacent |
| **CS-2** | `calibrationStatus === 'SYNTHETIC_UNVALIDATED'` | Imply validated predictive accuracy — "accurately predicts", "proven", "reliably detects" | State that the threshold is an unvalidated synthetic calibration candidate where the claim depends on the threshold |
| **CS-3** | `assessmentStatus === 'PROVISIONAL'` | Say "complete", "full picture", "all controls checked" | Name the missing input and its `NotEvaluatedReasonCode` |
| **CS-4** | `evidenceCoverage < 0.80` on a bridge claim | Describe the named causes as *the* explanation, or as complete | Carry the coverage figure in the same sentence or the one adjacent |
| **CS-5** | `signalState ∈ {NOT_COMPUTABLE, CONFIGURATION_ERROR}` | Render as zero, as "none", or as a clean result | Say the value could not be computed, and why |
| **CS-6** | `signalState === 'NOT_APPLICABLE'` | Say "not measured", "no data", or "unknown" | Say the control does not apply, and state the reason code |
| **CS-7** | `signalState === 'KNOWN_ZERO'` | Say "no data" | Say the observed value is zero — an observation |
| **CS-8** | `signalState === 'UNBOUNDED'` | Omit the claim, or treat it as missing | Report it as the adverse observation it is (ADR-0027) |
| **CS-9** | `evidenceFreshness === 'STALE'` | Attach a HIGH confidence band | State the as-of date and the staleness |
| **CS-10** | `epistemicLayer === 'L3'` | Style, phrase or introduce it as an observed fact | Label it as an assessment |
| **CS-11** | Any `limitations[]` entry present | Drop it in summarisation | Surface at least the limitations material to the claim being made |
| **CS-12** | Claim derives from a metric whose formula **defers** a choice (determinacy sweep) | Explain *how* the number is produced as if the formula determined it | Name the recording ADR or the open debt item (e.g. `MET-RES-003` → DR-064) |

**CS-12 is the newest and least obvious.** Two Frozen metrics deferred a choice their formula did not
fix, and both were economically wrong for months (`PHASE_0_10_SEMANTIC_CLOSURE.md` §1). An assistant
that narrates a formula as determinate re-commits that error at the explanation layer, where it is
even harder to catch. `tests/integration/architecture-closure.test.ts` §8 enumerates the deferring
metrics; the envelope's `limitations[]` carries them.

---

## 4. Executive authority — the three-valued output

`AssistantResponse.executiveAuthority` is derived, never chosen:

| Value | When | What the surface does |
| --- | --- | --- |
| `AUTHORITATIVE` | Every material claim: `executiveAuthoritative === true`, `assessmentStatus === COMPLETE`, no CS rule triggered | Renders normally |
| `QUALIFIED` | Any CS rule triggered and satisfied | Renders with the qualification **above** the figure, per the late-detection precedent |
| `NOT_AUTHORITATIVE` | Any material claim could not be qualified, or the validator rejected the prose | Renders the deterministic template and the decline reason |

**`QUALIFIED` is a legitimate, expected, frequent outcome** — the same way `GREEN + PROVISIONAL` is
(`PHASE_0_10_SEMANTIC_CLOSURE.md` §2). A design that treats qualification as failure will produce an
assistant that suppresses caveats to look confident, which is the failure mode this whole contract
exists to prevent.

---

## 5. Semantic constraints preserved verbatim

**No assistant answer may imply otherwise.** Each row is an existing governed decision, restated
here as an assistant obligation, with the validator detection that enforces it.

### 5.1 Portfolio GM value at risk — ADR-0023

- Portfolio VaR is **additive** over canonical project-level `MET-FIN-019`, counted **once per
  distinct eligible authorized project**. Portfolio figure: **$90.80M**.
- **Shared cause means concentration.** It is systemic correlation, reported *beside* the total and
  explicitly non-additive.
- **Shared cause does NOT establish duplicate money.** `MET-FIN-019` is one project's own margin; two
  projects hold disjoint pools. Cause identity cannot distinguish six separate losses from one root
  cause from one loss booked six times, and only the second is duplication.
- **Banned phrasings:** "net of shared causes", "after de-duplication", "the true figure once overlap
  is removed", any subtraction across projects.
- **Concentration rows are non-additive** — a project exposed to three causes appears three times.
  Prose that sums them is rejected.

> **Stale-text warning.** `PHASE_HANDOFF.md` §2 item 13 and §4's C-20 row still describe the
> **withdrawn** ADR-0021 de-duplication as current, as does `DR-048` in
> `docs/SECURITY_DEBT_REGISTER.md`. **ADR-0023 governs** (ADRs outrank the handoff). These are
> corrected in this phase — see the Phase 11A traceability report §6.

### 5.2 Effort economics — ADR-0024

- **Earned / physical completion is the governed baseline** for `MET-RES-002`. Not planned, not
  scheduled.
- **Schedule slippage cannot become apparent productivity efficiency.** A project running late has
  not thereby become efficient. The wrong baseline produced **$63.31M of phantom credit** and turned
  a **−$14.57M cost** into a **+$48.75M credit**.
- Slippage and efficiency are **independent** under earned value. `prj-017` is 7pp behind schedule and
  genuinely 338 hours under its earned baseline; both statements are true and the assistant may state
  both — it may not derive either from the other.

### 5.3 Margin bridge

- **Reconciliation ≠ explanatory completeness.** The bridge reconciles **by construction**, because
  the residual is *defined* as `total − Σ(named)`. Reconciliation is therefore evidence of
  arithmetic, not of attribution.
- **`MET-FIN-041` coverage travels with the causes, always** — one tool, not two
  (`AI_ASSISTANT_ARCHITECTURE.md` §5). Median project: **45.5%** of gross movement. Worst: **1.6%**.
- **The residual is unexplained/unattributed economics. It is NOT recovery opportunity.** Treating a
  residual as recoverable invents money.
- Two causes are `MODELLED` and one `NOT_ATTRIBUTED` (DR-058); `schedule-extension`, `pass-through`
  and `fx` are structurally zero on all 75 (DR-062). Absence of a cause is not evidence of its
  absence in reality.

### 5.4 RAG — five distinct things, never collapsed

| Concept | Rule |
| --- | --- |
| **Reported RAG** | The delivery line's declaration. The assistant **never** overwrites, corrects, derives or "fixes" it |
| **Dimension scores** | Four HEALTH-v2 executive dimensions, each with its own inputs and states |
| **Pre-override composite** | The weighted score *before* any override. Composite alone: GREEN 15 / AMBER 39 / RED 21 |
| **Hard override** | A rule that forces a band. **47 of 75 REDs are override-forced; ZERO are band-driven** |
| **Final System RAG** | The published outcome. RED 47 / AMBER 27 / GREEN 1 |

**A RED must never be narrated as a score when it is a rule.** `bandProvenance` says which, and CS-4's
sibling detection (validator #4) enforces it. Reported and System RAG occupy two columns on every
surface and must remain two claims in every answer.

### 5.5 Forecast and early warning

- Warnings and outlooks are **deterministic governed assessments** — a rule firing against a stated
  threshold.
- **They are NOT probability predictions.** Nothing in this product is trained, fitted or sampled.
- The probability lexicon is **banned outright** by validator detection #8: `likely`, `probability`,
  `chance`, `odds`, `expected to`, `will probably`, `X% likely`, `risk of X%`, `predicts`.
- Permitted framing: *"`ELV-ETC-OPTIMISM` fired: the ETC optimism ratio is 12.4% against a ≥10.0%
  threshold."* That is a fact about a rule, and it is stronger than a fabricated likelihood.

### 5.6 Late detection — DR-059

- Historical reconstruction is **partial**: the replay rewinds the **financial dimension only**.
  `reconstructedDimensions: [FINANCIAL]`; `unavailableDimensions: [DELIVERY, SCOPE_COMMERCIAL,
  PRODUCT_QUALITY]`; `historicalCoverage: PARTIAL`; `executiveAuthoritative: false`.
- **No bare authoritative "0% late detection" claim.** The qualification renders *above* the figure.
- **Banned:** "the product catches every deterioration early", "we detect issues before they
  materialise", or any generalisation from one dimension to four.

### 5.7 Threshold calibration — DR-054 / DR-055 / DR-061, MC-2 / MC-3 / MC-6

- **Every band edge, weight, override threshold and early-warning threshold in this repository is an
  unvalidated synthetic calibration candidate.** All 13 early-warning thresholds included.
- Do not hide it. CS-2 requires the statement wherever the claim depends on the threshold.
- The assistant **may not adjust any weight, band edge or threshold** — not to make an answer
  reconcile, not to resolve a contradiction, not at user request.

### 5.8 Warning hysteresis — DR-063

- **Unresolved.** There is no damping, and the flap rate is unmeasured.
- **Do not fabricate persistence semantics.** Banned: "has been red for three weeks", "persistently
  breaching", "sustained deterioration", "consistently above threshold" — the system does not know.
- Permitted: the current firing, with its as-of date.

### 5.9 Resource taxonomy — DR-064

- `MET-RES-003`'s seniority split is an **unrecorded definitional judgement**: `MID` is placed junior
  by a constant, and moving it swings the portfolio pyramid ratio **0.607 → 1.464**.
- **The assistant must not resolve this.** It may not choose, explain away, or assume a split.
- Where the output is material, it is **qualified** under CS-12 with DR-064 named.

### 5.10 Recovery — the five-rung ladder

These are **five different things** and the assistant may never substitute one for another:

| Rung | Meaning | Confusion it prevents |
| --- | --- | --- |
| **Historical Driver** | What has already damaged margin | ≠ what is still damaging it |
| **Remaining Exposure** | What is still at risk | ≠ what has already been lost |
| **Intervention Surface** | Where action is *possible* | ≠ where action would *work* |
| **Potential Recovery** | A scenario — `MET-REC-001/002` | ≠ a forecast; sits **beside** `MET-FIN-024`, never replaces it |
| **Realized Recovery** | What has actually been recovered | ≠ any of the above |

**Reconciled ≠ explained ≠ causal ≠ recoverable** (`PHASE_0_10_SEMANTIC_CLOSURE.md` §2). Validator
detection #9 matches recovery lexicon against the exact rung the claim carries.

---

## 6. What the assistant must say when it cannot answer

Declining is a **first-class outcome**, not a failure (REQ-AI-006). Three reasons, and the surface
renders each differently:

| Reason | Meaning | What must be said |
| --- | --- | --- |
| `INSUFFICIENT_EVIDENCE` | The evidence exists in principle but is `NOT_COMPUTABLE` here | Name the missing input and its reason code |
| `OUT_OF_SCOPE` | The question reaches outside the authorised set | **Generic decline.** Never confirm the entity exists (§4 of the architecture) |
| `NOT_ANSWERABLE` | The product cannot answer this at all — e.g. "what will margin be next quarter?" | Say the product does not forecast probabilistically, and offer the governed alternative |

**A decline that names a real limitation is a better answer than a hedged assertion**, and the
evaluation suite scores it as a pass, not as a miss (`AI_EVALUATION_STRATEGY.md` §5).

---

## 7. Caveat derivation is mechanical

`AssistantResponse.caveats[]` is **computed from the envelopes**, never authored by the model:

```
for each materialClaim:
    for each CS rule CS-1..CS-12:
        if rule.condition(claim.envelope):
            caveats.push({ ruleId: CS-n, claimId, text: rule.requiredStatement(claim) })
```

The model may re-word a caveat's placement in prose. **It may not omit one, and it may not add one.**
An added caveat is an ungoverned L4 assertion about the system's reliability; an omitted one is the
claim-strength failure this contract exists to prevent.

---

## 8. Honest limits of this contract

- **It governs the claims the assistant makes. It does not govern the claims it declines to make.**
  An answer that omits the single most important fact is fully compliant with every rule above. This
  is the selection-bias gap named in `AI_ASSISTANT_ARCHITECTURE.md` §12 and carried as **DR-072**.
- **CS-12 depends on the determinacy sweep being complete.** It enumerates Frozen metrics reachable
  from an executive output; a deferring metric reachable only through a path the sweep does not walk
  is invisible to it.
- **No part of this contract has been executed.** It is a specification. The repository's own standard
  is that a specification is not a working control.
