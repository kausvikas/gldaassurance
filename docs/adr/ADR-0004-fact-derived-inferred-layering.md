# ADR-0004 — L1/L2/L3 layering and the AI authority boundary

- **Status:** Accepted
- **Date proposed:** 2026-08-29
- **Date accepted:** 2026-08-29
- **Approver:** Principal CTO / Architect (Phase 0)
- **Phase:** 0
- **Affects:** All contexts; especially `Rules`, `Health`, `Forecast`, `AI Intelligence`; REQ-HLTH-005/006/008, REQ-AI-001 through REQ-AI-006, REQ-UX-004, AC-3, AC-6
- **Supersedes:** —

---

## Context

This product will be shown to executives who will make expensive decisions from it — reassigning
delivery leaders, escalating to clients, reserving against margin. It will also be reviewed by a
CISO and by a finance controller whose instinct is to ask "where did that number come from?"

Three kinds of statement will appear on the same screen, often side by side:

- *"$4.2M invoiced to date"* — a fact someone recorded.
- *"Forecast margin 11.4%, down from 22% as sold"* — an arithmetic consequence of facts.
- *"This project resembles three others that went Red within eight weeks"* — an inference.

They carry radically different epistemic weight. A product that renders them in the same visual
register, or lets the third one modify the first two, is not a decision-support tool; it is a
confident narrator. The specific catastrophe available here is an LLM producing a margin figure that
looks authoritative, is off by 3%, and reaches a client conversation.

Additionally, an LLM's failure mode is not "error" but *plausible* error. Where deterministic code
fails loudly, a model fails fluently. That asymmetry justifies an architectural wall rather than a
guideline.

## Decision

### 1. Three layers, formally typed

| Layer | Definition | Produced by | Reproducible? |
| --- | --- | --- | --- |
| **L1 — Observed Fact** | Something recorded by a person or source system | Ingestion / `Integration` | N/A — it is the input |
| **L2 — Deterministic Derived Metric** | A pure function of L1 + a versioned rule set | Domain contexts via `Rules` | **Yes, exactly** |
| **L3 — Inferred Intelligence** | Trajectory judgements, similarity warnings, narratives, recommendations | `Forecast` (rule-based) and `AI Intelligence` (model-based) | No |

Every value crossing the Application boundary carries a **provenance envelope**:

```
{ value, layer: 'L1'|'L2'|'L3', sources: [recordRef], ruleVersion?, computedAt, confidence? }
```

A value without a provenance envelope may not be rendered (REQ-UX-004). This is enforced by type,
not by review.

### 2. Directional rules

- **L3 may read L1 and L2. L3 may never write, adjust, override, or substitute for them.**
- **L2 may read L1. L1 never reads L2** — a fact does not know its own score.
- L2 output is stamped with `ruleVersion`; the same inputs and version always yield the same output
  (AC-7).
- An L3 output that cannot cite the L1/L2 evidence it rests on **is not rendered** (REQ-AI-002).

### 3. The AI authority boundary

The assistant **may**:
- retrieve facts and metrics through Application services, under the requesting user's
  authorization context (REQ-SEC-010, REQ-AI-001);
- explain, summarise, compare, rank by criteria the domain already computed, and narrate;
- state what it does not know and decline (REQ-AI-006).

The assistant **may not**:
- compute or restate any economic or health figure by its own arithmetic (REQ-AI-003) — every
  number in an answer is a value passed through from a domain service, rendered verbatim;
- access data outside the caller's authorization scope, by any path, including retrieval indexes;
- be the system of record for anything;
- have its instructions or authorization altered by content it retrieves (REQ-AI-004).

**Architecturally:** `AI Intelligence` may not import any domain context (ADR-0001 dependency rule
4). It calls the same Application services the UI calls. It has no privileged path to data. This is
what makes AC-6 testable — revoke a permission, and the fact disappears from the answer because the
retrieval genuinely could not see it.

### 4. Numbers in AI answers are references, not text

When the assistant states a figure, it emits a **reference token** to a domain-computed value which
the presentation layer resolves and renders. The model never types a digit that reaches the screen
as a fact. This eliminates transcription error as a category.

### 5. Rules are data, versioned and explainable

- Thresholds, weights, and rule definitions live in `Rules` as versioned configuration.
- Every firing produces a structured explanation: inputs, threshold, comparison, contribution
  (REQ-HLTH-006).
- Changing a threshold is a config change with an audit record — never an edit inside a component
  or a query.

## Rationale

- **The separation is the credibility.** AC-3 (drill any number to its facts in ≤3 steps) is only
  possible if provenance is structural rather than documented.
- **Reference tokens, not generated numbers,** is the single highest-leverage control in the AI
  design. It converts "hope the model does arithmetic correctly" into "the model cannot express an
  incorrect number".
- **Denying `AI Intelligence` direct domain access** makes the authorization guarantee real rather
  than promised. Any design where the assistant has its own data path eventually diverges from the
  UI's authorization rules — usually silently, and usually in the direction of over-sharing.
- **Rule versioning** is what lets Phase 12 answer "why did this project show Amber in June?" The
  answer must include which rules were in force.
- L3 being non-reproducible is fine and expected — provided it is *labelled* as such and cannot
  contaminate L1/L2.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **One "value" type; document provenance in the UI** | Provenance becomes a rendering convention that decays within two phases. Fails REQ-UX-004 and AC-3 in practice even if honoured on paper. |
| **Let the LLM compute from retrieved raw data** | Fluent, plausible, wrong. Directly violates global invariant 9. The failure would surface in a client conversation, not in a test. |
| **Give the assistant its own read-optimised index with its own access rules** | Faster retrieval, but creates a second authorization implementation that will drift from the first. The drift direction is over-exposure. Rejected outright. |
| **Post-hoc validation of LLM numeric output against domain values** | A safety net rather than a boundary — it presumes the model produces numbers at all, and must then decide what to do when they disagree mid-answer. Reference tokens make the failure impossible instead of detectable. |
| **Blend L2 and L3 into one "insight" score** | Simpler UI, and destroys the distinction between what we measured and what we suspect. This is exactly the conflation the spec forbids (§3.2, §3.4). |
| **Hard-code thresholds for POC speed** | Saves days in Phase 4 and forfeits explainability, calibration, and the Phase 12 audit answer. |

## Consequences

**Positive**
- Every screen can honestly show what kind of claim it is making.
- AC-6 becomes a real test: removing authorization removes the fact from the answer.
- The assistant can be wrong about *narrative* without ever being wrong about *numbers*.
- Rule changes are auditable and reversible.

**Negative / accepted costs**
- The provenance envelope adds weight to every DTO and every component signature.
- Reference-token rendering is more machinery than letting the model write prose with numbers in it,
  and constrains answer formatting.
- Rules-as-data is slower to build than constants in code.
- Three visual registers must be designed in Phase 6 and honoured in Phases 7–11.

**Neutral but notable**
- Some `Forecast` outputs are L3 despite being deterministic rule-based (not model-based). "L3" means
  *inferred*, not *non-deterministic*. A deterministic trajectory projection is still a judgement
  about the future and is labelled accordingly.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | `Rules` becomes load-bearing from Phase 4; `AI Intelligence` is isolated by construction |
| Data model / persistence | Provenance/lineage recorded with every derived value (REQ-DATA-010); rule versions stored and referenced by snapshots |
| Formulas or metrics | Every entry in `METRIC_CATALOG.md` declares its layer; L2 entries declare their rule dependency |
| Security model | AI executes under caller authorization (REQ-SEC-010); no privileged retrieval path; injection resistance (REQ-AI-004) |
| Brand / design tokens | Phase 6 must define three provenance treatments (fact / computed / inferred) |
| Requirements affected | REQ-HLTH-005/006/008, REQ-UX-004, REQ-AI-001…006, REQ-SEC-010, REQ-DATA-010 |
| Tests that must change | Phase 11 integration tests must prove revoked permission removes facts from answers; type tests for provenance envelope |

## Migration implications

Greenfield. The provenance envelope must be defined in Phase 2 alongside the canonical model. Adding
it later would require touching every DTO and every component — and would predictably be done
partially.

## Rollback path

The layering cannot be rolled back without invalidating AC-3 and AC-6 and the product's core
credibility claim. The AI boundary specifically could be relaxed only by a superseding ADR that
explains how numeric correctness is otherwise guaranteed — a burden no alternative has met.

## Verification

- Type test: a value without a provenance envelope cannot be passed to a rendering primitive.
- Architecture test: `AI Intelligence` imports no domain context (ADR-0001 verification suite).
- Integration test (Phase 11): identical question, two users, different scopes → different answers,
  each citing only authorised records (AC-6).
- Integration test (Phase 11): assistant answers contain no free-typed numerals in fact positions —
  only resolved reference tokens (REQ-AI-003).
- Golden test: same inputs + same rule version → identical L2 outputs (AC-7).

## Open questions

- DQ-3 (retrieval strategy) is deferred to Phase 11 but is constrained by this ADR: whatever is
  chosen must execute under caller authorization and must not constitute a second data path.
- OQ-4 (health weighting ownership) affects `Rules` configuration governance. Confirm in Phase 2.
