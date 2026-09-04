# ADR-0034 — A typed query plan supersedes single-intent routing

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `src/app/assistant`, `src/contexts/ai-intelligence`
- **Supersedes:** ADR-0029 §routing (the tool allow-list and its closure are **retained and extended**)

---

## Context

ADR-0029 replaced free-text retrieval with a closed union of thirteen intents and twelve tools. That
was the right decision and it holds: the allow-list is what makes "the model cannot reach data it was
not authorised for" a compile-time property.

But an intent is a single label, and Phase 13's executive questions are not single labels:

> *"Which current Green projects are expected to deteriorate over the next 60 days?"* → then
> *"Only Automotive."* → then *"Only North America."* → then *"Which has the greatest exposure?"*

Under intent routing, turn two is a new question with no memory, turn three loses turn two, and
"greatest exposure" has no population to be greatest within. The label carries the *family* of the
question and discards its *scope, filters, ordering and limit* — which is most of what the executive
actually said.

Worse, the failure is silent: the router matches `portfolio.ranking` on the word "which", answers a
different question correctly, and the reader has no way to see that the filter was dropped.

## Decision

1. **The unit of interpretation is a `QueryPlan`, not an intent.** A plan carries `scope`,
   `filters`, `metrics`, `time`, `comparison`, `sort`, `limit`, `projection` and `evidence` — the
   axes of §21 of the Phase 13 contract — and every field is drawn from a **closed vocabulary**.
   There is no free-text predicate, no field name, no expression, no SQL, at any point.
2. **Intent is retained as the plan's `shape`.** The intent union grows; it does not disappear. A
   plan with no shape is not executable.
3. **The planner is deterministic first and model-assisted second.** A first-party grammar over
   governed vocabulary resolves the question; an LLM is consulted **only** to propose a plan when the
   deterministic planner is unsure, and its proposal is parsed into the same typed structure and put
   through the same validator. A model proposal that fails validation is discarded, not repaired.
4. **Every plan is validated before any tool runs.** `validatePlan` rejects unknown metrics, unknown
   filter values, unauthorised scope, mutations, probabilistic requests, unsupported joins, tools
   outside the allow-list, and any limit outside its bound. Validation precedes execution
   unconditionally; there is no path from planner to tool that skips it.
5. **Conversation state refines a plan; it never creates a fact.** A turn produces a new plan by
   applying a bounded delta to the previous one. The state may hold scope, filters, the previous
   result population, the active project, the period and the previous plan — and nothing else. A
   reference like *"which of those"* resolves against the recorded population ids, so it can only
   ever narrow an already-authorised set.
6. **Filters carried from the application's own UI enter as an explicit plan input**, not as hidden
   state, so the Assistant answers about the population the executive is looking at, and the plan
   shows that it did.
7. **The plan is rendered.** The executive sees the resolved scope in business language; the plan and
   the tools it executed are available on the answer's provenance. An interpretation the reader
   cannot inspect is an interpretation they cannot correct.

## Rationale

- **A typed plan is the only place multi-axis questions can be validated.** Validating a sentence is
  guesswork; validating `{scope, filters, metrics, sort, limit}` against closed vocabularies is a
  total function.
- **Deterministic-first keeps the common path model-free.** The great majority of executive questions
  resolve on governed vocabulary alone, which means they are answerable with the model switched off
  and are byte-identical across providers.
- **A model proposing a plan is safe in a way a model calling a tool is not.** The proposal is data
  in a closed schema that a validator must accept. The model's most powerful available action is to
  request a read the caller was already entitled to.
- **Rendering the plan is the honesty control.** The Phase 12 review's hardest lesson was that a
  correct number under a wrong label is worse than a missing number. A dropped filter is exactly that
  defect, and showing the resolved scope is what makes it visible.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Keep intent routing; add filter keywords per intent** | Combinatorial, and puts scope resolution inside thirteen separate matchers. The fourth follow-up still has nowhere to live. |
| **Model-generated tool calls (function calling)** | The model chooses reads directly. ADR-0029 rejected this and nothing has changed; a validated plan gets the flexibility without the authority. |
| **Model-generated SQL against a read replica** | Prohibited by §22 and by every security assumption in `SECURITY_MODEL.md`. Also makes the metric catalogue advisory. |
| **Server-side conversation sessions** | Would introduce state, a store and a session-fixation surface into a runtime that is otherwise stateless. The client carries the state; the server re-validates and re-authorises it every turn, which is strictly safer. |

## Consequences

**Positive** — free-form and multi-turn questions become expressible; scope is inspectable; the
validator has something checkable to check.

**Negative / accepted costs** — the vocabulary is now a governed artefact that must be kept in step
with the metric catalogue and the filter registry; a question using a business term outside the
vocabulary is declined rather than guessed at. That is deliberate: `UNKNOWN IS BETTER THAN
FABRICATED PRECISION`.

**Neutral** — `INTENT_TOOLS` becomes `SHAPE_TOOLS` and grows; its closure property is unchanged.

## Impact

| Dimension | Impact |
| --- | --- |
| Formulas or metrics | **None.** A plan selects governed metrics; it never defines one. |
| Security model | Strengthens it: the validator now has a typed object to reject rather than prose to trust. |
| Requirements affected | REQ-AI-001…006 |

## Rollback path

The deterministic planner can be restricted to the thirteen Phase 11 shapes with no filters, which
is Phase 12 behaviour exactly. The plan structure would remain, carrying one field.

## Verification

- `tests/unit/query-plan-validator.test.ts` — every rejection class in §22.
- `tests/integration/assistant-conversation.test.ts` — the four-turn refinement above, and the
  proof that turn three has not lost turn two.
- `tests/integration/assistant-unseen-questions.test.ts` — questions absent from every source file
  in this repository resolve to correct plans, which is the canned-string detector.
