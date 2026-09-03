# ADR-0036 — Knowledge grounding is ingestion, indexing and citation — not training

- **Status:** **Accepted** — 2026-09-03
- **Phase:** 13
- **Affects:** `src/contexts/knowledge`, `src/app/ingestion`, `server/`
- **Extends:** ADR-0035

---

## Context

The capability an executive asks for is *"teach it about our contracts."* The capability that can
actually be built is ingestion, validation, versioning, indexing, retrieval and citation. Those are
not the same thing, and the gap between them is where an enterprise AI product loses its credibility:
a user who is told the system "learned" a document reasonably concludes the model changed, that the
knowledge is permanent, that it generalises, and that deleting the file is not enough.

None of that is true. No model weight is modified anywhere in this product.

There is a second, sharper problem. *"Upload succeeded"* is not evidence that anything was learned.
A file can parse, index and be listed as `INDEXED` while being unreachable by every question a user
would actually ask — because the association to a project was never made, or the retrieval never
scores it, or the answer path never consults it.

## Decision

1. **The user-facing verb may be "Add Knowledge" or "Teach Delivery Intelligence". The technical
   record states exactly what happened**, in the same surface, one disclosure away: parsed, validated,
   associated, versioned, indexed, retrievable. Every artefact in `docs/` uses the technical terms.
   **No document in this repository describes ingestion as training.**
2. **All parsing is first-party, in `src/platform`, with no third-party parser.** XLSX is read as
   ZIP + inflate + sheet XML, taking **cached values only and never evaluating a formula**; CSV is
   RFC 4180 with formula-prefix neutralisation; PDF is Flate-decoded content streams with page
   boundaries preserved. Every parser is bounded on bytes, entries, pages, rows and time.
3. **Every ingestion produces a receipt** — source id, fingerprint (SHA-256 of the bytes), rows or
   pages detected/accepted/quarantined, projects matched/unresolved, fields mapped/ignored, conflicts,
   authority class, effective date, mapping version, ingestion version. The receipt is
   machine-readable and rendered. An ingestion with no receipt did not happen.
4. **A source is "grounded" only when three things are true**: `INGESTED` **and** `RETRIEVABLE`
   **and** `DEMONSTRABLY USED IN AN ANSWER`. `Verify Knowledge` reports all three separately and
   names the last query that actually consulted the source. Upload success alone reports
   `INGESTED — NOT YET USED`.
5. **Retrieval is lexical (BM25) over page-anchored chunks, first-party, deterministic.** An
   `EmbeddingProvider` port is declared and left unimplemented rather than pulling an embedding
   dependency or an external embedding call into the evidence path. Retrieval must not require the
   external provider — a product whose citations depend on a hosted model cannot cite anything when
   that model is unreachable.
6. **Citations name a real location.** Page where the parser knows the page; chunk where it knows
   only the chunk. **A page number is never inferred.** Deterministic document ids and content
   fingerprints make re-upload a duplicate and changed content a new version; historical evidence is
   never mutated, and an answer records which version it used.
7. **Retrieved content is untrusted data with a hard precedence order:** system/security policy >
   application governance > tool policy > user question > retrieved content. Retrieved text cannot
   change the provider, the authority, a formula, the RAG, the authorised scope or the tool
   allow-list, because none of those is reachable from the retrieval path — it is not a matter of the
   model declining. Where a document contains instruction-shaped text, the system may *report that
   the text exists*; it never acts on it.

## Rationale

- **The three-part definition of "learned" is the whole point of the section.** It is the only
  definition that cannot be satisfied by a green upload toast.
- **First-party parsers are a smaller risk than they look and a much smaller one than the
  alternative.** Document parsers are a classic memory-safety and zip-bomb surface, and this process
  holds the credential. Bounded, dependency-free parsing of formats we also generate is the
  conservative option.
- **Lexical retrieval is the honest POC choice.** It is deterministic, explainable, reproducible
  across providers, requires no external call, and its failure mode is *"nothing matched"* rather
  than *"something semantically adjacent and wrong."* The embedding seam records that this is a
  deliberate stopping point, not an oversight.
- **Never inferring a page number** matters more than it sounds. A fabricated citation is worse than
  no citation: it survives being checked exactly once.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **SheetJS / pdf-parse / pdfjs** | Real capability, real transitive surface, in the one process holding the API key and parsing hostile bytes. Rejected on ADR-0032 §4. |
| **Vector database + hosted embeddings** | Better recall on paraphrase. Makes citation depend on an external service, adds an egress path for document text, and is not explainable to a reviewer asking why a passage was retrieved. |
| **Model-extracted fields promoted to canonical** | The single fastest way to corrupt the governed plane; prohibited by ADR-0035 §7. |
| **Calling it "training" in the UI** | Would be a lie in the product's most trust-sensitive surface. |

## Consequences

**Positive** — the "before / after" proof is mechanical rather than rhetorical; citations survive
being checked; deleting a source removes its reachability completely, which "training" would not.

**Negative / accepted costs** — lexical retrieval misses paraphrase a vector index would catch; the
PDF extractor handles Flate-encoded text operators and **does not** handle scanned images, CID fonts
with non-standard encodings, or unusual compression filters, and reports those as
`PARSE_INCOMPLETE` rather than returning partial text silently.

**Neutral** — all ingested content in this POC is synthetic.

## Impact

| Dimension | Impact |
| --- | --- |
| Formulas or metrics | **None.** Evidence is never an operand. |
| Security model | Adds file validation, parse budgets and the retrieved-content precedence order. |

## Rollback path

Disable the ingestion routes and delete the artefact store. The knowledge plane is additive; the
governed plane is untouched by construction.

## Verification

- `tests/integration/knowledge-before-after.test.ts` — the same question is unanswerable, then
  answerable from the document, with version and location.
- `tests/unit/pdf-parse.test.ts`, `tests/unit/xlsx-parse.test.ts`, `tests/unit/csv-parse.test.ts` —
  including bombs, oversize inputs and formula cells.
- `tests/integration/prompt-injection.test.ts` — the twelve adversarial cases of §110.
