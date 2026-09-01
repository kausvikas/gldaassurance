# ADR-0030 — Narrative generation is a governed hybrid; grounding validation is deterministic and blocking

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Chief Enterprise Architect + Enterprise AI Architect + AI Security Lead + Delivery Economics SME + Independent Model-Governance Reviewer
- **Phase:** 11A (AI architecture)
- **Affects:** `src/contexts/ai-intelligence`, `AssistantAnswer`, `REQ-AI-001`, `REQ-AI-002`,
  `REQ-AI-003`, `REQ-AI-006`, `AC-6`
- **Supersedes:** —

---

## Context

Phase 11A must choose how prose is produced and how it is prevented from asserting things the system
does not know. Four options were on the table: (A) constrained structured generation, (B) deterministic
answer templates, (C) LLM generation plus a deterministic claim validator, (D) a governed hybrid.

Two facts about this repository constrain the choice more than any general argument about LLMs.

**First, fluent-and-wrong output has already passed review here, twice, without a model involved.**
`MET-PORT-003` removed $38.93M of real exposure and survived because it *reconciled, was deterministic,
was provably non-negative, and collapsed a hostile input correctly* — "every one of those properties is
satisfied by a wrong formula" (`PHASE_0_10_SEMANTIC_CLOSURE.md`). A language model manufactures those
surface properties at essentially zero cost.

**Second, the product's honest state is unflattering and must stay that way.** RED 47 / AMBER 27 /
GREEN 1. The median project's margin bridge explains 45.5% of gross movement. Late detection replays
one dimension of four. Every threshold is an unvalidated synthetic candidate. **A generator optimised
for a good answer will smooth all of that away**, and each smoothing is individually plausible.

`ARCHITECTURE_DECISIONS.md` and ADR-0004 §4 already fix one half: *"the model never types a digit that
reaches the screen as a fact"* — `ValueReference` exists for this. What is undecided is what happens to
the words around the digits, and what happens when generation goes wrong.

## Decision

**1. Option D — governed hybrid.**

- **Deterministic composition is the floor.** Every intent has a template that renders an answer from
  `materialClaims` with **zero** model involvement. This is a complete, shippable assistant on its own.
- **LLM narration is the optional ceiling.** When a model is configured, it produces *connective prose
  over an already-fixed claim set*. It receives claims, never operands, never unauthorised fields,
  never raw records outside delimited evidence quotes.
- **The claim set is fixed before generation and is never revised by it.** Generation may not add,
  remove, reorder or re-weight a claim.

**2. A deterministic grounding validator runs on every answer — template-rendered ones included — and
is blocking.** Ten detections, specified in `AI_ASSISTANT_ARCHITECTURE.md` §7: unsupported number,
unsupported percentage, unsupported project/customer, unsupported RAG, unsupported rank, unsupported
trajectory, unsupported causal claim, unsupported probability, unsupported recovery claim, unauthorized
object.

**3. On validation failure the generated prose is discarded, not repaired.** The deterministic template
renders instead; the failure is audited by detection id; the rejected prose is **not** logged. There is
**no regenerate-until-it-passes loop** — that turns a validator into a formatting hint and selects for
generations that evade it.

**4. The validator has no bypass.** No flag, no environment variable, no "trusted intent", no
confidence threshold above which it is skipped.

**5. Validator rejection rate is a first-class metric, and a zero rate against the adversarial fixture
set fails the build.** A control that never fires is indistinguishable from a control that is not
running — which is precisely how `OVR-LD-EXPOSURE` sat unevaluated on 75 of 75 projects while every
gate reported green (ADR-0025).

**6. Domain correctness is model-independent.** The same question, same fixtures, both configurations,
must produce **identical** `materialClaims`, `metricRefs` and `evidence`. Prose may differ; claims may
not. Asserted by test (E-15).

## Rationale

The property being bought is **the shape of the failure**. Every option fails sometimes; they differ in
how.

- **B alone** fails toward *dull*. Safe, and a strictly worse version of the four surfaces already
  built — it adds a text rendering of a table the user can already read.
- **C alone** fails toward *undefined*. It has no specified behaviour when the validator rejects, and
  the only tempting answer — retry — is the one that corrupts the validator.
- **A alone** constrains **shape, not truth**. A schema-valid response can still assert an unsupported
  causal claim in a free-text field. Structured output is a serialisation guarantee wearing a
  correctness costume.
- **D** fails toward **correct-and-dull**, always, because B is always present and always correct.

The cost is honest and real: two rendering paths, and a validator that must be roughly as expressive as
the prose it polices. That is the price of never shipping fluent-and-wrong, and given this repository's
defect history it is the right side of the trade.

**Why the validator, not the prompt, is the control.** A prompt instruction is evaluated by the
untrusted component against itself. The validator is deterministic, runs outside the model, and holds
even if the model is fully compromised by injection (`AI_THREAT_MODEL.md` T-AI-02) — which is why it is
listed there as the backstop rather than as hardening.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **A — constrained structured generation alone** | Constrains shape, not truth. Says nothing about a causal or probabilistic claim in a valid string field |
| **B — deterministic templates alone** | Safe and shippable, but the product becomes a worse rendering of existing surfaces. Retained as the floor rather than rejected |
| **C — LLM + validator alone** | No defined behaviour on rejection; the natural fix (retry) selects for evasive generations. Retained as the ceiling rather than rejected |
| **LLM-as-judge for grounding** | An LLM judging LLM output measures agreement, not truth, and shares the failure modes it is meant to catch. Rejected for the same reason `AI_EVALUATION_STRATEGY.md` §5 bans model-judged scores |
| **Confidence threshold — validate only low-confidence answers** | Model confidence is uncalibrated and unrelated to groundedness. It would exempt exactly the fluent answers most likely to mislead |
| **Warn instead of block** | A warning on a page an executive reads in thirty seconds is not a control. This product's standing rule is that reporting an absence is mandatory and rendering a plausible default is a lie |

## Consequences

**Positive**
- The product has a correct, complete, model-free configuration — genuinely useful for a client
  unwilling to send delivery economics to a third party.
- Removing or swapping the model changes prose quality and nothing else.
- Injection resistance no longer depends on the model's cooperation.

**Negative**
- Two rendering paths to build and maintain.
- Validator lexicons are hand-written and will be incomplete — carried as **DR-072**, not claimed closed.
- Template prose will read as flatter than a client demo might want. **That is the deliberate trade and
  it must not be quietly reversed in 11B.**

**Neutral**
- Whether an LLM is configured becomes a deployment decision, not an architectural one.
- The configuration must be **labelled accurately on the surface**: calling a deterministic template
  "AI" would be the same class of claim-strength failure as an unqualified "0% late detection".

## Compliance

- The validator is invoked on every response path; asserted by test, including the template path.
- No regeneration loop exists; asserted by a build control on the orchestrator.
- E-15 asserts claim-identity across both configurations; E-17 asserts a non-zero rejection rate.

## Status note

**`Accepted` at the opening of Phase 11B.** Phase 11A recorded that 11B could not begin until this
ADR was accepted, because `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a `Proposed` ADR.
The Phase 11B implementation instruction is that acceptance; it is recorded here rather than assumed,
and the trade this ADR asks a reviewer to accept is restated unchanged in `PHASE_HANDOFF.md` §0.4.
