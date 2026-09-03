# ADR-0033 — The LLM is a provider behind a port, and sending data to one is a policy decision

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `src/app/llm`, `src/contexts/ai-intelligence` (`NarrationPort`), `SECURITY_MODEL.md` §7
- **Extends:** ADR-0030 (grounding is deterministic and generation is not trusted)

---

## Context

ADR-0030 already established that generation is not trusted and that the deterministic composer is
the floor. Phase 13 adds two things that ADR-0030 did not have to answer:

1. **More than one model may produce the narration.** An enterprise buyer will require that
   delivery and commercial evidence can be processed by a model running inside their own boundary.
2. **Choosing a model is choosing where the data goes.** The moment a second provider exists, a
   failure in one becomes a *routing* question, and the convenient answer — fall back to the other —
   is a data-egress event dressed as resilience.

The second is the one that matters. A local-first deployment that silently retries against a hosted
API on timeout has exported the customer's delivery and margin data, and nothing in the response
would say so.

## Decision

1. **`LLMProvider` is a port with `generate`, `healthCheck`, `providerMetadata` and `capabilities`.**
   Assistant code depends on the port; no assistant module imports a provider SDK, and there is no
   SDK — the Anthropic provider is a bounded `fetch` against the documented Messages API, and the
   local provider speaks `openai-compatible` or `ollama` by configuration.
2. **A provider is selected by configuration, once, at the composition root** (ADR-0010 §4). There
   is no per-request provider parameter reachable from the browser, so a caller cannot choose where
   their question is sent — and neither can a prompt.
3. **There is no silent fallback. Ever.** If the selected provider is unavailable the answer is
   produced by the deterministic composer and the response says the provider was unavailable. It is
   never re-issued to a different provider.
4. **A local→external fallback may exist only when all four hold:** it is explicitly configured;
   `externalAIAllowed` is true for the *source classes present in the request*; the policy decision
   is carried on the response where a reader can see it; and the routing is audited. Any one of the
   four absent means the fallback does not happen.
5. **External transmission is gated per source class and per document class, not per request.** The
   policy is evaluated against the classification of the material that would actually be sent. A
   request touching one `COMMERCIAL_CONFIDENTIAL` document is an external-prohibited request even if
   everything else in it is public.
6. **Nothing is sent to any provider except claims and caveats.** `NarrationPort.narrate` already
   receives `MaterialClaim[]` and `Caveat[]` — never raw records, never a document body, never an
   operand the caller was not authorised for. Retrieval output reaches the model only as claim text
   that has already passed `neutraliseRetrievedText`.
7. **The composer kind is carried on every response and rendered.** `DETERMINISTIC_COMPOSER` is
   never described as AI. A model that did not run is never implied to have run.

## Rationale

- **Silent fallback is the single highest-consequence defect available in this design.** It is one
  line of code, it looks like good engineering, and it is a policy breach that leaves no trace. It is
  therefore prohibited structurally — the routing function has no branch that can reach a second
  provider without the policy object saying so.
- **Claims-only narration is what makes provider choice a low-stakes decision.** If the model saw
  raw financials, provider selection would be a data-residency decision on every request. It sees
  sentences the domain already licensed.
- **Configuration-time selection removes an injection target.** A per-request provider field would be
  reachable from untrusted text through the planner; there is no such field.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Anthropic SDK dependency** | Adds a dependency tree to the process holding the credential, for an HTTP call this repository can make in forty lines. Also makes the port a fiction — the SDK's types leak into application code. |
| **Provider chosen per request by the UI** | Convenient for demonstration; creates a user-controlled data-egress switch and an injection target. Demonstrated instead by configuration and an honest status surface. |
| **Automatic failover local→hosted** | The defect this ADR exists to prevent. |
| **Send retrieved document text to the model for summarisation** | Would make the evidence plane an egress path and put untrusted bytes directly into the prompt. Citations are resolved from the index; the model narrates the claim, not the page. |

## Consequences

**Positive** — provider substitution is a configuration change; data egress is a visible, audited,
policy-gated event; the product still answers when every model is switched off.

**Negative / accepted costs** — narration quality is bounded by what the claims say, which is the
point but does constrain prose; local providers vary in instruction-following, so the grounding
validator rejects more often on some local models, and that shows up as `DETERMINISTIC_COMPOSER` in
the response rather than as a worse answer.

**Neutral** — `healthCheck` is a real request against the provider; a configured-but-unreachable
provider reports `CONFIGURED_UNVERIFIED`, never `HEALTHY`.

## Impact

| Dimension | Impact |
| --- | --- |
| Formulas or metrics | None. The provider never computes. |
| Security model | Adds the external-AI policy seam and the no-fallback rule to `SECURITY_MODEL.md` §7. |
| Requirements affected | REQ-AI-001…006 |

## Rollback path

Remove the provider configuration. Every response reverts to `DETERMINISTIC_COMPOSER`, which is the
Phase 12 behaviour, with no loss of governed content.

## Verification

- `tests/unit/llm-provider-routing.test.ts` — a failing selected provider never reaches a second one.
- `tests/unit/external-ai-policy.test.ts` — a prohibited source class blocks transmission, and the
  block is on the response.
- `tests/integration/assistant-provider-parity.test.ts` — identical authoritative facts across
  providers; prose may differ.
