# ADR-0011 — Epistemic layers are not dependency tiers

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `ARCHITECTURE_DECISIONS.md` §4.1 rule 3 and §4.2; `forecast`, `financial`, `delivery`, `risk`, `recovery`; REQ-GOV-005, REQ-GOV-006, REQ-UX-004
- **Supersedes:** — (clarifies ADR-0001 §4.2 and ADR-0004 §1–2; supersedes neither)

---

## Context

Phase 1's job was to make ADR-0001 §4.1's dependency rules mechanically enforceable. Mechanising rule
3 — "L2 contexts may read L1 contexts. L1 contexts may never read L2. A fact does not know its own
score" — required deciding what "an L1 context" *is*, and the artifacts do not agree.

Two concrete disagreements surfaced, both real and neither resolvable by preference:

**C-2 — `forecast`.** `ARCHITECTURE_DECISIONS.md` §4.2 lists it under "Derived (L2)".
`METRIC_CATALOG.md` §9 titles it "**L3 inferred**", and ADR-0004 §Consequences states plainly: "Some
`Forecast` outputs are L3 despite being deterministic rule-based… 'L3' means *inferred*, not
*non-deterministic*."

**The general case.** §4.2 marks `financial`, `delivery`, `risk` and `recovery` as "L1→L2" — a single
context emitting both kinds of value. `MET-FIN-001` (contract value as sold) is a recorded fact;
`MET-FIN-014` (forecast margin) is computed from it. Under a rule that assigns one layer per module,
`financial` is simultaneously permitted and forbidden to be read by other L1 contexts.

The conflation is understandable — the layers and the module ordering usually agree — but a build
gate cannot act on "usually". Precedence (`CLAUDE.md`) puts accepted ADRs first; ADR-0001 §4.2 and
ADR-0004 are both accepted, and ADR-0004 is the more specific and later decision on what a layer
*means*. Rather than pick a winner by inference, the resolution is to separate two things that were
never the same.

## Decision

1. **An epistemic layer (L1/L2/L3) is a property of a *value*, not of a module.** It travels in the
   provenance envelope (ADR-0004 §1). A module does not have a layer; its outputs each declare one.
2. **A module has a *dependency tier*** — an integer that determines what it may import. Tiers are
   declared per context in `architecture/manifest.json`:

   | Tier | Meaning | Contexts |
   | --- | --- | --- |
   | 0 | Support: depended upon, depends on nothing | `rules`, `integration` |
   | 1 | Foundation identity and structure | `identity`, `organization`, `portfolio`, `project`, `contract` |
   | 2 | Domain facts, some first-order derivation | `financial`, `delivery`, `commercial`, `quality`, `resource`, `risk`, `assurance` |
   | 3 | Deterministic derived | `health`, `data-quality`, `recovery` |
   | 4 | Inferred | `forecast`, `ai-intelligence` |

3. **A dependency may never point to a higher tier.** This is ADR-0001 §4.1 rule 3, made decidable.
   The manifest self-check (`ARCH-009`) prevents the declared allow-lists from themselves encoding an
   inversion.
4. **Each context declares `outputLayers`** — which epistemic layers its values may carry. `financial`
   declares `["L1","L2"]`; `forecast` declares `["L3"]`; `rules` and `integration` declare none, being
   support.
5. **`forecast` is tier 4 and emits L3**, per ADR-0004 §Consequences and `METRIC_CATALOG.md` §9. Its
   outputs are labelled inferred on every surface (REQ-UX-004) and must never be presented with the
   authority of a computed margin figure.
6. **`ARCHITECTURE_DECISIONS.md` §4.2's "Layer" column is documentation of typical output layers, not
   an import rule.** The import rule is the tier, and the manifest is its authority.

## Rationale

- **The two axes are genuinely independent.** `forecast` is the proof: it sits at the top of the
  dependency order *and* produces the least authoritative values. Collapsing the axes would force
  either an incorrect import rule or an incorrect provenance label, and both are visible to a reviewer.
- **Per-value layers are already required** by ADR-0004 §1 and are already implemented in
  `platform/provenance`. This ADR does not add a mechanism; it stops a second, contradictory one from
  being invented in the gate.
- **Tiers make rule 3 checkable.** "A fact does not know its own score" becomes an integer comparison
  producing a specific error message naming both tiers, rather than a review conversation.
- **Declaring the resolution rather than assuming it** is what `CLAUDE.md` requires when artifacts
  conflict. The gate could have been written either way in twenty minutes; the point is that it was
  not written silently.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Treat `forecast` as L2, per §4.2** | Contradicts ADR-0004 §Consequences and `METRIC_CATALOG.md` §9 explicitly, and would render trajectory claims — the product's flagship signal — with the visual authority of a computed figure. That is the precise failure ADR-0004 exists to prevent. |
| **Split `forecast` into an L2 half and an L3 half** | Removes the conflict by fiat and creates a context boundary with no owner, no responsibility of its own, and a distinction users would never see. |
| **One layer per module, and split every L1→L2 context in two** | Consistent, and would turn 19 contexts into ~25, several of which exist only to satisfy a labelling rule. ADR-0001 already accepts 19 as "a lot of ceremony"; this would be ceremony without a boundary behind it. |
| **Enforce only "no cycles" and drop directionality** | Cheapest gate. Loses "a fact does not know its own score" entirely — the rule that keeps derived values from contaminating the facts beneath them. |
| **Leave it to reviewer judgement** | This is the drift ADR-0001 §6 was written to prevent: "convention is what drift eats first." |

## Consequences

**Positive**
- Rule 3 is mechanically enforced, with error messages that name the tiers and cite the rule.
- The `forecast` conflict is resolved explicitly and in writing, rather than by whichever phase
  touched it first.
- `financial` can emit both a fact and a derived metric without ambiguity.

**Negative / accepted costs**
- Two concepts to explain where the artifacts implied one.
- Tier assignment is a judgement recorded in the manifest; changing one is an architectural change
  requiring an ADR.
- `ARCHITECTURE_DECISIONS.md` §4.2's Layer column now needs a clarifying note, or it will be read as
  an import rule again.

**Neutral but notable**
- No context's actual permitted imports change as a result of this ADR. It names and makes checkable
  what §4.1 already intended.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | No context added, removed, merged or split. Tiers and `outputLayers` declared for all 19 |
| Data model / persistence | None |
| Formulas or metrics | None. `METRIC_CATALOG.md` §9's L3 classification is confirmed, not changed |
| Security model | None |
| Brand / design tokens | Phase 6's three provenance treatments key off the *value's* layer, which is already the case |
| Requirements affected | REQ-GOV-005, REQ-GOV-006, REQ-UX-004 |
| Tests that must change | `tests/integration/architecture.boundaries.test.ts` — tier-inversion and manifest-consistency cases |

## Migration implications

None — no domain code exists. If accepted, add a clarifying note to `ARCHITECTURE_DECISIONS.md` §4.2
stating that its Layer column describes typical output layers and that
`architecture/manifest.json` is the authority for import rules. **Until accepted, the gate enforces
the tier model as written and this ADR is the record of why.**

## Rollback path

Reverting means choosing one axis. Collapsing to modules-have-layers requires either reclassifying
`forecast` as L2 — contradicting an accepted ADR — or splitting four contexts. Both are more
disruptive than the two-axis model, which is itself an argument for it.

**Reconsider if:** a future context genuinely cannot be assigned a stable tier, which would suggest
its responsibilities are not yet understood.

## Verification

- `evaluateManifestConsistency()` — no declared allow-list inverts a tier (`ARCH-009`).
- Test: an L1 context importing an L2 context is rejected with a message naming both tiers.
- Test: `forecast` may import `health` and `financial`; `financial` may not import `forecast`.
- Test: every context declares `outputLayers` consistent with `METRIC_CATALOG.md`.

## Open questions

- Whether `recovery` remains a context is DQ-4, deferred to Phase 10. Its tier would not change if it
  folded into `delivery`, but its allow-list would.
