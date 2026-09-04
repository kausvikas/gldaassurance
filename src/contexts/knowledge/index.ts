/**
 * Public surface — `knowledge`. The evidence plane (ADR-0035 §2, ADR-0036).
 *
 * Owns documents, their versions, their page-anchored chunks, the index those chunks are retrieved
 * from, and the citations retrieval produces. Tier 0 · imports no context.
 *
 * **What this context is not.** It is not a second source of business truth. Nothing here is an
 * operand of a governed metric, and there is no method that returns a value a financial or health
 * calculation could consume. A document that asserts a milestone date produces a *citation* saying
 * the document asserts it — never a date the delivery context will read. ADR-0035 §7 states the
 * rule; the absence of any numeric accessor on this surface is what enforces it.
 *
 * **Three properties this surface is shaped around.**
 *
 * 1. *A citation must survive being checked.* So a `Citation` carries the location the parser
 *    actually knew — `page` when page boundaries were preserved, `chunk` when they were not — and
 *    `locationKind` says which. There is no code path that infers a page number, because a
 *    fabricated citation is worse than none: it survives verification exactly once.
 * 2. *Evidence is versioned, never mutated.* Identical bytes are a duplicate; different bytes are a
 *    new version. An answer records the version it used, so re-reading an old answer does not
 *    silently re-ground it against a document that has since changed.
 * 3. *Retrieval must not require a network.* The index is lexical and first-party
 *    (ADR-0036 §5). A product whose citations depend on a hosted embedding service cannot cite
 *    anything when that service is unreachable — and its retrieval is not reproducible across
 *    providers, which would make the cross-provider factual reconciliation of §69 meaningless.
 */
import { shortId } from '@platform/bytes';
import type { DataContext, SourceAuthorityClass } from '@platform/provenance';
import type { Instant } from '@platform/time';

export const CONTEXT_ID = 'knowledge' as const;

// ---------------------------------------------------------------------------
// Document identity and classification
// ---------------------------------------------------------------------------

/**
 * What kind of document this is.
 *
 * Closed, because document class drives the external-AI policy (ADR-0033 §5) and a policy keyed on
 * an open string is a policy with a default. `OTHER` is present and is treated as the *most*
 * restricted class, not the least.
 */
export type DocumentClass =
  | 'SOW'
  | 'CONTRACT'
  | 'AMENDMENT'
  | 'CHANGE_REQUEST'
  | 'ACCEPTANCE_CRITERIA'
  | 'GOVERNANCE_MINUTES'
  | 'RISK_DOCUMENT'
  | 'STEERING_ARTIFACT'
  | 'OTHER';

export const ALL_DOCUMENT_CLASSES: readonly DocumentClass[] = [
  'SOW', 'CONTRACT', 'AMENDMENT', 'CHANGE_REQUEST', 'ACCEPTANCE_CRITERIA',
  'GOVERNANCE_MINUTES', 'RISK_DOCUMENT', 'STEERING_ARTIFACT', 'OTHER',
];

/**
 * What a document is about.
 *
 * An association is an explicit, recorded act. A document with no association is indexed and
 * **unreachable by a project question**, and `Verify Knowledge` reports exactly that rather than
 * letting a user conclude from a successful upload that the evidence is in play. Association by
 * filename or by name similarity is not implemented, deliberately (ADR-0035 §8).
 */
export interface DocumentAssociation {
  readonly projectIds: readonly string[];
  readonly customerIds: readonly string[];
  readonly portfolioIds: readonly string[];
}

export const NO_ASSOCIATION: DocumentAssociation = {
  projectIds: [], customerIds: [], portfolioIds: [],
};

/** Whether the parser read the whole document, and what it could not read. */
export type ParseCompleteness = 'COMPLETE' | 'PARSE_INCOMPLETE';

export interface DocumentMetadata {
  readonly title: string;
  readonly documentClass: DocumentClass;
  readonly association: DocumentAssociation;
  /** The document's own stated version, where it states one. Distinct from `versionOrdinal`. */
  readonly statedVersion: string | null;
  readonly effectiveDate: string | null;
  readonly uploadedAt: Instant;
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  /** The originating source registration this document arrived through. */
  readonly sourceId: string;
}

/**
 * One immutable version of one document.
 *
 * `documentId` is derived from the title and source, so successive uploads of a changing SOW are
 * versions of one document. `versionId` is derived from the content fingerprint, so identical bytes
 * can never produce two versions.
 */
export interface DocumentVersion {
  readonly documentId: string;
  readonly versionId: string;
  readonly versionOrdinal: number;
  readonly fingerprint: string;
  readonly byteLength: number;
  readonly pageCount: number;
  readonly completeness: ParseCompleteness;
  /** Present only when `completeness` is `PARSE_INCOMPLETE`. Named limits, never a vague warning. */
  readonly unreadable: readonly string[];
  readonly metadata: DocumentMetadata;
  readonly chunks: readonly DocumentChunk[];
}

export type LocationKind = 'PAGE' | 'CHUNK' | 'ROW';

/**
 * A retrievable span.
 *
 * `text` is **untrusted content**. It is never an instruction, never concatenated into a prompt
 * without delimiting, and never promoted to a claim. The type does not carry an `untrusted` flag
 * because every chunk is untrusted and a flag that is always true is a flag nobody checks; the rule
 * lives in the consumers, and `tests/integration/prompt-injection.test.ts` is what holds them to it.
 */
export interface DocumentChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly locationKind: LocationKind;
  /** 1-based page where the parser preserved pages; otherwise the chunk ordinal. */
  readonly location: number;
  readonly heading: string | null;
  readonly text: string;
}

export function documentIdFor(sourceId: string, title: string): string {
  return shortId('doc', sourceId, title.toLowerCase().trim());
}

export function versionIdFor(documentId: string, fingerprint: string): string {
  return shortId('ver', documentId, fingerprint);
}

export function chunkIdFor(versionId: string, ordinal: number): string {
  return shortId('chk', versionId, String(ordinal));
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  readonly text: string;
  /** Restricts retrieval to documents associated with these projects. Empty means unrestricted. */
  readonly projectIds: readonly string[];
  readonly documentClasses: readonly DocumentClass[];
  /** Hard ceiling on returned spans. Bounded so a long document cannot flood a prompt (§112). */
  readonly limit: number;
}

export interface RetrievalHit {
  readonly chunk: DocumentChunk;
  /** BM25. Comparable within one result set; not a probability and never rendered as one. */
  readonly score: number;
  readonly citation: Citation;
}

/**
 * Provenance for one piece of document evidence.
 *
 * Every field is something a reader could check by opening the document. `locationLabel` is built
 * from what the parser knew: `page 14` when pages were preserved, `section 3 of 9` when they were
 * not. It never says "page" about a location the parser inferred.
 */
export interface Citation {
  readonly documentId: string;
  readonly versionId: string;
  readonly title: string;
  readonly documentClass: DocumentClass;
  readonly statedVersion: string | null;
  readonly locationKind: LocationKind;
  readonly location: number;
  readonly locationLabel: string;
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  readonly sourceId: string;
}

export function citationFor(version: DocumentVersion, chunk: DocumentChunk): Citation {
  const label = chunk.locationKind === 'PAGE'
    ? `page ${String(chunk.location)}`
    : chunk.locationKind === 'ROW'
      ? `row ${String(chunk.location)}`
      : `section ${String(chunk.location)} of ${String(version.chunks.length)}`;
  return {
    documentId: version.documentId,
    versionId: version.versionId,
    title: version.metadata.title,
    documentClass: version.metadata.documentClass,
    statedVersion: version.metadata.statedVersion,
    locationKind: chunk.locationKind,
    location: chunk.location,
    locationLabel: label,
    authority: version.metadata.authority,
    dataContext: version.metadata.dataContext,
    sourceId: version.metadata.sourceId,
  };
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

export type IndexAdmission = 'INDEXED' | 'DUPLICATE' | 'SUPERSEDES';

export interface IndexResult {
  readonly admission: IndexAdmission;
  readonly version: DocumentVersion;
  readonly chunksIndexed: number;
  /** Set when `admission` is `SUPERSEDES`: the version this one replaced as current. */
  readonly supersededVersionId: string | null;
}

/**
 * What the application may do to the evidence plane.
 *
 * There is no `update`. A document changes by being re-ingested, which produces a new version, so
 * historical evidence cannot be edited out from under an answer that cited it (ADR-0036 §6).
 */
export interface KnowledgeIndex {
  add(version: DocumentVersion): IndexResult;
  retrieve(query: RetrievalQuery): readonly RetrievalHit[];
  /** Every version of every document, newest ordinal last. */
  versions(): readonly DocumentVersion[];
  /** The current version of each document. */
  current(): readonly DocumentVersion[];
  get(versionId: string): DocumentVersion | null;
  /** Removes a document and every version of it. Returns how many versions went. */
  remove(documentId: string): number;
  readonly documentCount: number;
  readonly chunkCount: number;
}

/**
 * Declared and deliberately unimplemented (ADR-0036 §5).
 *
 * Present so that adding semantic retrieval later is an implementation of a named port rather than
 * a rewrite of the retriever's callers — and so that the decision *not* to use embeddings in the POC
 * is legible as a decision.
 */
export interface EmbeddingProvider {
  readonly providerId: string;
  readonly dimensions: number;
  embed(texts: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export const IMPLEMENTATION_STATE: string =
  'IMPLEMENTED (Phase 13) — document model, versioning, page-anchored chunking, first-party BM25 '
  + 'index and citation assembly. EmbeddingProvider is declared and unimplemented by decision '
  + '(ADR-0036 §5). No accessor on this surface returns a value a governed metric could consume.';

export { LexicalKnowledgeIndex, chunkPages, BM25 } from './internal/lexical-index.js';
