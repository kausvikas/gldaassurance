# ADR-0022 — Completing the HEALTH-v2 signal set: where a derivation lives, and when a dimension may compute

- **Status:** **Accepted** — 2026-08-31 (Phase 8 semantic closure)
- **Date proposed:** 2026-08-31
- **Date accepted:** 2026-08-31
- **Approver:** Principal Enterprise Architect (D-1…D-3), Delivery leadership + Independent
  Metric-Governance Reviewer (D-4, D-5)
- **Phase:** 8
- **Affects:** `MET-HLTH-011`, `MET-HLTH-020`…`024`, `HEALTH_MODEL_V2`, `MET-DEL-009`…`011`,
  `MET-DEL-018`…`020`, `MET-DEL-023`, `MET-COM-007`/`008`/`009`, `MET-QUA-001`/`003`/`006`/`009`/
  `010`/`011`/`012`, `MET-FIN-011`, `architecture/manifest.json`
- **Supersedes:** —
- **Resolves:** **CONFLICT C-21**

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## Context

`HEALTH_MODEL_V2` declares four executive dimensions and fifteen input signals, and ADR-0015 D-1 (as
amended at Phase 7 closure) made those four **authoritative for `MET-HLTH-011` System-Assessed RAG**.

Measured at the start of Phase 8, **only the Financial dimension computed** — on all 91 projects.
The health engine was correct; the assessment adapter supplied seven signals, all financial or
progress-related, so eleven of fifteen declared inputs arrived `null`. `MET-HLTH-011` was, in
practice, **a financial score wearing a four-dimension label**, and Phase 7 ranked a portfolio on it.

Delivery was completed first (D-1 below). Scope & Commercial and Product & Quality were **not**,
because the artifacts appeared to disagree about where their derivations could live. That was
`CONFLICT C-21`.

### Correction to the Phase 8 interim report

The interim Phase 8 report stated that *"ADR-0001 (Accepted) declares Commercial and Quality
L1-only."* **That was wrong, and the error mattered**: it made C-21 look like a conflict with a
top-precedence Accepted ADR, when it is not one.

`ADR-0001` contains **no per-context epistemic-layer table at all**. The `L1` label appears in two
places, neither of which is an accepted prohibition:

1. `ARCHITECTURE_DECISIONS.md` §4.2's **"Layer" column** — and §4's own preamble already says that
   this area is contested (recorded as `C-1`/`C-2`) and that *"the import rules enforced by the build
   are `architecture/manifest.json`"*. The column is documentation of typical outputs.
2. `architecture/manifest.json`'s `outputLayers: ["L1"]` for `commercial` and `quality` — a field the
   architecture gate does **not** enforce.

Both are contradicted by artifacts of higher or equal standing, and by the code itself.

## Decision

### D-1 — "L1 context" means **Interpretation B**: an authoritative fact domain that may also derive

An epistemic layer (L1/L2/L3) is a property of a **value**, not of a module. A module has a
**dependency tier**, which governs what it may import; its outputs each carry their own layer in the
provenance envelope (ADR-0004 §1). A context that owns a fact domain may therefore own governed L2
derivations whose semantics belong to that domain.

**This is a clarification, not an amendment. ADR-0001 is untouched.** The evidence:

| Evidence | What it shows |
| --- | --- |
| `ADR-0001` | Contains no per-context layer table. It never made the claim. |
| `ARCHITECTURE_DECISIONS.md` §4 preamble | Names this area as contested (`C-1`/`C-2`) and defers the binding rule to the manifest's **import rules** — i.e. the tier, not the Layer column. |
| Manifest tier definition | Tier 2 is *"Domain facts (L1), **some producing first-order derived values**"* — derivation is part of the tier's own definition. |
| `risk`, `financial`, `delivery` | All tier 2, all `["L1","L2"]`. `risk` is described as *"self-contained fact domain **with first-order exposure derivation**"* — the exact shape claimed here. |
| `METRIC_CATALOG.md` (precedence #2) | Registers `MET-COM-007/008/009` and `MET-QUA-003/006/009/011/012` as `L2_DERIVED` with `owner: Commercial` / `owner: Quality`. |
| **The contexts' own accepted interfaces** | `CommercialSnapshot` has declared `maxPendingCrAgeDays` and `uncompensatedScopeRatio` since Phase 2; `QualitySnapshot` has declared `escapedDefectRate`, `reworkRatio`, `excessReworkCost`, `defectBacklogTrend` and `acceptanceLatencyDays`. **Accepted, committed code in those contexts already declares L2 outputs.** |
| ADR-0011 (Proposed) | Says exactly this, in §1 and §6. Cited as corroboration only — a `Proposed` ADR is not depended on. |

So `outputLayers: ["L1"]` on `commercial` and `quality` was a **stale manifest entry**, contradicted
by the catalog and by those contexts' own accepted interfaces. It is corrected to `["L1","L2"]`.
Nothing about ADR-0001, the tier order, or the import rules changes.

### D-2 — Commercial owns its L2 derivations

`MET-COM-007` Pending CR Ageing, `MET-COM-008` Scope Change Ratio and `MET-COM-009` Uncompensated
Scope Ratio are implemented in `src/contexts/commercial/internal/commercial-engine.ts`, each to its
registered formula. Tier 2, `mayDependOn: ['contract']`; no sibling engine is imported.

`MET-FIN-011` expressed as a share of `MET-FIN-002` — the model's `UNSECURED_UPSIDE_RATIO`, whose
edges (0.01 → 0.12) are the edges of a proportion, not of an absolute sum — is produced by the
**economics engine**, where both operands are Financial's own. It is not divided in an adapter.

### D-3 — Quality owns its L2 derivations

`MET-QUA-003`, `006`, `009`, `011` and `012` are implemented in
`src/contexts/quality/internal/quality-engine.ts`, alongside the L1 counts `MET-QUA-001` and
`MET-QUA-010`. Tier 2, `mayDependOn: []` — `MET-QUA-012` needs `MET-FIN-005` actual cost, which is
**passed in** rather than imported.

**`MET-QUA-002` Defect Density is excluded.** It is `Draft`, blocked by `MC-8`, and no Draft metric
may enter an authoritative health chain. The automated audit (§D-4) fails the build if one appears.

**Health does not reimplement any of these**, and a test greps `health-engine.ts` for their ids and
for their source-fact field names. Adapters remain shape translators; a test asserts the assessment
adapter performs no division.

### D-4 — Dimension computability, and what a partial assessment is allowed to claim

**Two gates, in order.** A dimension scores only if both pass:

1. **Every *required* signal is present.** A required signal is the measure the dimension *is about*;
   its absence makes the dimension `NOT_COMPUTABLE` whatever the input count says. This is a
   semantic claim, not a threshold, which is why it lives in the model beside the weights.
2. **At least half the inputs are computable.** The pre-existing floor, retained.

| Dimension | Weight | Required signal | Optional signals | Partial score allowed? | Missing behaviour |
| --- | --- | --- | --- | --- | --- |
| Financial | 0.40 | `MET-FIN-014` Forecast GM % | `MET-FIN-016`, `MET-FIN-027`, `MET-FIN-034` | Yes, ≥ half | `NOT_COMPUTABLE` with the reason |
| Delivery | 0.25 | `MET-DEL-015` Progress Variance | `MET-DEL-018`, `MET-DEL-010`, `MET-DEL-023` | Yes, ≥ half | `NOT_COMPUTABLE` with the reason |
| Scope & Commercial | 0.20 | `MET-COM-009` Uncompensated Scope Ratio | `MET-COM-007`, `MET-FIN-011` | Yes, ≥ half | `NOT_COMPUTABLE` with the reason |
| Product & Quality | 0.15 | `MET-QUA-006` Rework Ratio | `MET-QUA-010`, `MET-QUA-003`, `MET-QUA-009` | Yes, ≥ half | `NOT_COMPUTABLE` with the reason |

Rework is required for Product & Quality precisely because it is the signal that ties quality to
margin: a dimension scoring confidently on defect counts while rework is unknown would be a
different metric wearing this one's name.

**The composite, and the renormalisation that was silent.** The composite is a weighted mean **over
the dimensions that scored**, so the denominator shrinks when one is missing. That arithmetic is
kept — scoring a missing dimension as zero would treat absent evidence as catastrophic performance,
and *missing evidence is not adverse evidence*. But it redistributes influence: with two dimensions
absent, Financial's declared 0.40 becomes an effective 0.615. **Before this ADR that happened
silently.** `evaluateHealth` now returns:

- `assessmentStatus` — `COMPLETE` · `PROVISIONAL` · `NOT_COMPUTABLE`;
- `dimensionCoverage`, `availableWeight`, `declaredWeight`;
- `missingDimensions`, each with its weight and the reason it could not be scored.

A consumer that needs an authoritative overall band must check `assessmentStatus` rather than assume
`compositeScore !== null` means complete. Tested at 100 / 85 / 65 / 40 / 0 % coverage.

**The four weights are unchanged — 0.40 / 0.25 / 0.20 / 0.15 — and nothing renormalises the model
itself.** The renormalisation is confined to one expression and is now named. Confidence remains a
separate output and is **not** a fifth dimension (`PRODUCT_SPEC.md` §3.4); a test asserts no
`MET-DQ-*` metric appears in any dimension.

### D-5 — Cross-dimension signal reuse

**No signal appears in two executive dimensions**, and a test enforces it. Where an underlying *fact*
legitimately reaches two dimensions, it does so through **different metrics asking different
questions**, each normalised against its own band:

| Underlying fact | Financial | Delivery | Scope & Commercial | Product & Quality | Intentional? | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Progress claims | `MET-FIN-027` burn gap, `MET-FIN-034` | `MET-DEL-015`, `MET-DEL-018` | — | — | **Yes** | Burn gap asks *"is cost outrunning progress?"*; progress variance asks *"is progress behind plan?"* Different questions, different bands. |
| Pending changes | — | — | `MET-COM-007` age, `MET-FIN-011` value | — | **Yes** | *How long* unresolved and *how much* at stake, composed within one dimension — not across two. |
| Defects | — | — | — | `MET-QUA-003`, `MET-QUA-009` | **Yes** | Escape rate and backlog direction, within one dimension. |
| Acceptance items | — | — | — | `MET-QUA-010` only | **Yes** | See below. |
| Actual cost | `MET-FIN-*` | — | — | `MET-QUA-012` (reported, **not** a health signal) | **Yes** | `MET-QUA-012` appears on the page, never in the composite, so it cannot depress two dimensions. |
| Milestones | — | `MET-DEL-009`, `MET-DEL-010` | — | — | n/a | Single dimension. |
| Scope items | — | — | `MET-COM-009` | — | n/a | Single dimension. |

**Product acceptance vs commercial acceptance.** The word covers two concepts and they are kept
apart. *Product/technical* acceptance — unresolved blocking objections — is `MET-QUA-010` and feeds
**Product & Quality**, because in fixed-bid an open objection is quality evidence. The *commercial*
consequence of the same records — billing dependency, disputed deliverable — reaches **Scope &
Commercial** only through `MET-COM-009` and the commercial exposure facts, which measure money, not
objection counts. The same record therefore never depresses two dimensions through two counts of
itself.

## Consequences

**Positive**

- All four dimensions compute on all 91 projects **from real evidence**: 4/4 inputs on Financial,
  3–4 of 4 on Delivery for 74 projects, 3 of 3 on Scope & Commercial for 70, 4 of 4 on Product &
  Quality for 85.
- Two curated archetypes express their designed signal for the first time: **E** (Scope & Commercial
  Leakage) now scores 0.76 on Scope & Commercial and fires `OVR-UNCOMMERCIALISED-SCOPE`; **G**
  (Quality Spiral) scores 17.62 on Product & Quality and fires `OVR-ACCEPTANCE-FAILURE`.
- The silent renormalisation is gone, replaced by a declared coverage contract.

**Negative**

- **Two hard overrides that were dormant are now reachable**, because their signals were never
  supplied: `OVR-NO-CREDIBLE-PLAN` (`MET-DEL-018 ≥ 2.00`) fires on **33 of 75** fixed-bid projects,
  and `OVR-ACCEPTANCE-FAILURE` on one. This is the largest single cause of the RAG migration. Each
  fires on a genuinely measured signal, not on missing data — but the override thresholds have never
  been calibrated against a portfolio where they could fire, which is now visible and belongs to
  MC-3 (DR-054).
- 50 of 75 fixed-bid projects are RED **by hard override rather than by band**, so the composite's
  calibration is not what is driving the distribution.

**Neutral**

- No generator data changed; the content hash is unchanged. No weight, band edge or override
  threshold was altered.

## Alternatives considered

**Amend ADR-0001 to permit L2 in these contexts.** Rejected as unnecessary and misleading: ADR-0001
never restricted them, and amending it would record a constraint-removal that was never there.

**Move the eight metrics' definitions to a context already permitted to derive.** Rejected. It would
make `health` the owner of defect and change-control arithmetic, and `owner: Commercial` in the
catalog would become a label with no structural meaning.

**Introduce a Tier-3 cross-domain derivation context.** Rejected: a new context in the monolith to
hold formulas that already have obvious owners.

**Lower the half-inputs rule so a dimension scores on one signal.** Rejected, and it is the dangerous
one — it would light every dimension up and silently change RAG logic to make a reporting gap
disappear.

## Migration and rollback

Additive: two engines, two input ports, seven signal readings, four coverage fields on
`HealthEvaluation`, and one corrected manifest entry. Rollback is removing the seven readings, which
returns Scope & Commercial and Product & Quality to `NOT_COMPUTABLE` and the composite to its
Phase 8-interim values. No data migration and no stored state.
