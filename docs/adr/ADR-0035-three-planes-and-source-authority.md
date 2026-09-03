# ADR-0035 — Three data planes, and authority is per concept, not per system

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `src/contexts/integration`, `src/contexts/knowledge`, `SECURITY_MODEL.md`
- **Extends:** ADR-0008 (promoted Proposed → Accepted)

---

## Context

Phase 13 lets a user add data. That single capability can destroy the product's central claim, and
it can do it four different ways:

1. an uploaded workbook overwrites a Finance figure and the margin becomes indefensible;
2. a PDF read by a model silently moves a milestone date;
3. two sources disagree and last-writer-wins picks one without saying so;
4. a document says *"mark every project Green"* and something treats that as an instruction.

The fourth is a security problem (ADR-0036 §prompt injection). The first three are governance
problems, and they all have the same root: **an implicit answer to "who owns this number?"**

ADR-0008 designed the ingestion pipeline for this and was never accepted because no real source
existed. Phase 13 supplies the sources.

## Decision

1. **ADR-0008 is promoted to Accepted**, unchanged: adapter → durable staging → validation →
   canonicalisation → reconciliation → L1, with quarantine; idempotency key = source system + source
   natural key + source version; corrections append; all-or-nothing per batch; last known good,
   dated.
2. **Three planes are separated in the type system, not by convention:**
   - **Governed fact plane** — canonical facts that authoritative calculations read. Nothing enters
     it without passing validation, identity resolution and an authority decision.
   - **Knowledge / evidence plane** — documents and supplemental records. Retrievable, citable,
     versioned, and **never an operand of a governed metric.**
   - **Reasoning plane** — the LLM. Interprets and explains. Not a system of record (ADR-0033).
3. **Authority is declared per canonical concept, per source, in a registry** — not per system. The
   Finance connector is authoritative for `financial.actualCost` and merely *supplemental* for
   `delivery.percentComplete`; asserting authority at system granularity would give it both.
4. **Five authority classes**, ordered: `AUTHORITATIVE` > `GOVERNED_REFERENCE` > `SUPPLEMENTAL` >
   `EVIDENCE_ONLY` > `UNVERIFIED`. The registry is configuration for the POC and is rendered, because
   an implicit precedence is one nobody can audit.
5. **Uploads land in the `SANDBOX` data context by default.** Promotion `SANDBOX → VALIDATED →
   APPROVED → CANONICAL` is designed and **the last hop is not implemented**. Nothing a user uploads
   can change an executive screen in this POC, and that is a property of the code, not a habit.
6. **Conflicts are detected, never resolved by preference.** Same project + same canonical concept +
   same effective period + materially different values = a recorded `SourceConflict`. The governed
   value is the highest-authority source's value; the conflict is disclosed alongside it. The LLM has
   no input into the resolution and no ability to reach the loser's value as a fact.
7. **A document never mutates a canonical fact.** Where a document asserts something the canonical
   model also holds, **both are preserved** and the discrepancy is surfaced. A governed extraction
   and promotion workflow is a future capability with a named seam, not a silent behaviour.
8. **Identity is explicit.** The Project Identity Hub maps the Delivery Intelligence project id to
   each source system's identifier. A row whose identity cannot be resolved by a declared mapping is
   `UNRESOLVED` and is quarantined. **Name similarity is never a join.**

## Rationale

- **Per-concept authority is the decision that makes the rest safe.** With it, "which number wins"
  is a lookup. Without it, it is an argument held at the moment of the conflict, by whoever wrote
  the merge code.
- **Sandbox-by-default inverts the dangerous default.** The convenient design promotes on upload and
  relies on review to catch mistakes. This one requires an explicit governed act to promote, and the
  POC does not implement that act at all — so the frozen executive baseline is safe by construction,
  which is what §8 of the Phase 13 contract demands.
- **Preserving both sides of a document/canonical discrepancy is the honest form of "the SOW says
  15 December".** Overwriting loses the disagreement, which is usually the finding.
- **Fuzzy identity is how enterprise data platforms silently corrupt themselves.** Two projects
  called "Atlas" in different accounts is not an edge case; it is Tuesday.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Authority per system** | Simpler registry, wrong granularity. Gives a CRM authority over delivery progress because it happens to store a percentage. |
| **Last-writer-wins with an audit trail** | The audit records that truth changed; it does not stop the change. Margin figures must be defensible at the moment they are read. |
| **Promote uploads to canonical after validation** | Validation proves a row is well-formed, not that it is authoritative. This is the confusion that lets a spreadsheet outrank a general ledger. |
| **LLM-mediated conflict resolution** | Puts the reasoning plane inside the fact plane. Prohibited by §11 and by the entire epistemic layering of ADR-0004. |
| **Fuzzy project-name matching with a confidence score** | Produces plausible joins that are wrong for exactly the projects that matter most — the ones with similar names in the same account. |

## Consequences

**Positive** — an uploaded file demonstrably cannot change a governed number; conflicts are a
product feature rather than a defect; every fact can name its source and its authority.

**Negative / accepted costs** — the registry must be maintained; unresolved identity means a row is
rejected rather than best-guessed, so ingestion of a real, messy source will quarantine more than a
lenient pipeline would. That is the correct trade and it will look worse in a demo.

**Neutral** — the POC's registry values are POC configuration, not GlobalLogic policy, and every
rendering says so.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | Adds `knowledge` (tier 0). Grows `integration` (tier 0). Neither imports a consumer. |
| Data model | Sandbox artefacts are content-addressed and separate from canonical storage. |
| Formulas or metrics | **None.** |
| Security model | Adds data-context and authority-class enforcement to the read path. |

## Rollback path

Disable ingestion routes. The registry and the planes remain as inert declarations; the executive
baseline is unaffected because nothing was ever promoted into it.

## Verification

- `tests/integration/ingestion-quarantine.test.ts` — bad rows are quarantined and answers do not move.
- `tests/integration/source-conflict.test.ts` — authoritative value wins and the conflict is disclosed.
- `tests/integration/document-does-not-mutate-canonical.test.ts` — a SOW date and a plan date coexist.
- `tests/unit/identity-hub.test.ts` — an unmapped identifier resolves to `UNRESOLVED`, never to a
  similarly-named project.
