/**
 * Document ingestion: PDF into versioned, page-anchored, retrievable evidence (ADR-0036).
 *
 * ```
 * bytes -> content-type validation -> safe parse (pages preserved) -> metadata -> association
 *       -> version -> chunk -> index -> receipt
 * ```
 *
 * ## What "indexed" does and does not mean
 *
 * A document that reaches the end of this pipeline is **ingested and retrievable**. It is not yet
 * *grounded*, which ADR-0036 §4 defines as ingested **and** retrievable **and** demonstrably used in
 * an answer. `Verify Knowledge` reports the three separately, because a green upload toast is the
 * single most misleading artefact an AI product can produce: a file can parse, index and appear in a
 * list while being unreachable by every question a user would actually ask — because it was never
 * associated with a project.
 *
 * That is why `association` is a required argument here rather than an optional refinement. A
 * document with no association is accepted, and the receipt says in words that no project question
 * will reach it.
 *
 * ## Evidence never becomes fact
 *
 * Nothing here extracts a field. A SOW stating an acceptance date produces a *citation* saying the
 * SOW states it — never a date the delivery context reads. Where the canonical plan says something
 * different, both survive and the discrepancy is the finding (ADR-0035 §7).
 */
import type {
  DocumentAssociation, DocumentClass, DocumentMetadata, DocumentVersion, IndexResult,
  KnowledgeIndex, ParseCompleteness,
} from '@contexts/knowledge';
import { chunkPages, documentIdFor, versionIdFor } from '@contexts/knowledge';
import type { IngestionReceipt } from '@contexts/integration';
import { INGESTION_VERSION } from '@contexts/integration';
import { detectFormat, parsePdf } from '@platform/parse';
import { fingerprint, shortId, utf8 } from '@platform/bytes';
import type { DataContext, SourceAuthorityClass } from '@platform/provenance';
import type { Instant } from '@platform/time';

export interface DocumentIngestionRequest {
  readonly sourceId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly title: string | null;
  readonly documentClass: DocumentClass;
  readonly association: DocumentAssociation;
  readonly statedVersion: string | null;
  readonly effectiveDate: string | null;
  readonly authority: SourceAuthorityClass;
  readonly dataContext: DataContext;
  readonly receivedAt: Instant;
  readonly index: KnowledgeIndex;
}

export interface DocumentIngestionResult {
  readonly receipt: IngestionReceipt;
  readonly version: DocumentVersion;
  readonly admission: IndexResult['admission'];
  readonly supersededVersionId: string | null;
}

export class UnreadableDocument extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableDocument';
  }
}

export function ingestDocument(request: DocumentIngestionRequest): DocumentIngestionResult {
  const format = detectFormat(request.bytes);
  const digest = fingerprint(request.bytes);

  const parsed = readPages(request, format);
  const title = request.title ?? parsed.title ?? request.fileName.replace(/\.[a-z0-9]+$/i, '');
  const documentId = documentIdFor(request.sourceId, title);
  const versionId = versionIdFor(documentId, digest);

  const existing = request.index.get(versionId);
  const ordinal = existing !== null
    ? existing.versionOrdinal
    : request.index.versions().filter((v) => v.documentId === documentId).length + 1;

  const metadata: DocumentMetadata = {
    title,
    documentClass: request.documentClass,
    association: request.association,
    statedVersion: request.statedVersion,
    effectiveDate: request.effectiveDate,
    uploadedAt: request.receivedAt,
    // Read from the request, and constrained by the caller: nothing in this pipeline may raise a
    // document above EVIDENCE_ONLY, because a document is evidence by definition (ADR-0035 §7).
    authority: request.authority === 'AUTHORITATIVE' ? 'EVIDENCE_ONLY' : request.authority,
    dataContext: request.dataContext,
    sourceId: request.sourceId,
  };

  const chunks = chunkPages(
    documentId, versionId,
    parsed.pages.map((p) => ({ location: p.pageNumber, text: p.text })),
    parsed.pagesPreserved ? 'PAGE' : 'CHUNK',
  );

  const version: DocumentVersion = {
    documentId,
    versionId,
    versionOrdinal: ordinal,
    fingerprint: digest,
    byteLength: request.bytes.length,
    pageCount: parsed.pages.length,
    completeness: parsed.completeness,
    unreadable: parsed.unreadable,
    metadata,
    chunks,
  };

  const admitted = request.index.add(version);

  const notes: string[] = [];
  if (admitted.admission === 'DUPLICATE') {
    notes.push('Identical content has already been indexed under this title, so this upload is a '
      + 'duplicate rather than a new version. Nothing changed, and nothing was lost.');
  }
  if (admitted.admission === 'SUPERSEDES') {
    notes.push('The content differs from the indexed version, so this is a new version. The previous '
      + 'version is retained for audit and for answers that already cited it; new answers use this one.');
  }
  if (request.association.projectIds.length === 0) {
    notes.push('This document is not associated with any project. It is indexed and it will not be '
      + 'reached by a question about a project. Associating it is what makes it answerable.');
  }
  if (parsed.completeness === 'PARSE_INCOMPLETE') {
    notes.push('Part of this document could not be read. The unreadable parts are named rather than '
      + 'silently omitted, and answers grounded in this document are reported as partial.');
    for (const reason of parsed.unreadable) notes.push(reason);
  }
  if (!parsed.pagesPreserved) {
    notes.push('Page boundaries could not be established, so citations from this document state a '
      + 'section rather than a page. A page number is never inferred.');
  }

  const receipt: IngestionReceipt = {
    receiptId: shortId('rcpt', request.sourceId, digest),
    sourceId: request.sourceId,
    sourceName: title,
    sourceKind: 'DOCUMENT_UPLOAD',
    fingerprint: digest,
    byteLength: request.bytes.length,
    receivedAt: request.receivedAt,
    effectiveDate: request.effectiveDate,
    recordsDetected: parsed.pages.length,
    recordsAccepted: admitted.admission === 'DUPLICATE' ? 0 : chunks.length,
    recordsQuarantined: 0,
    projectsMatched: request.association.projectIds.length,
    projectsUnresolved: 0,
    fieldsMapped: 0,
    fieldsIgnored: 0,
    conceptsMapped: request.documentClass === 'ACCEPTANCE_CRITERIA'
      ? ['document.acceptanceCriteria'] : ['document.contractTerm'],
    conflictsDetected: 0,
    authority: metadata.authority,
    dataContext: metadata.dataContext,
    mappingVersion: `${request.documentClass}-v${String(ordinal)}`,
    ingestionVersion: INGESTION_VERSION,
    pagesParsed: parsed.pages.length,
    chunksIndexed: admitted.chunksIndexed,
    parseCompleteness: parsed.completeness,
    notes,
  };

  return {
    receipt,
    version,
    admission: admitted.admission,
    supersededVersionId: admitted.supersededVersionId,
  };
}

interface ParsedDocument {
  readonly pages: readonly { readonly pageNumber: number; readonly text: string }[];
  readonly pagesPreserved: boolean;
  readonly completeness: ParseCompleteness;
  readonly unreadable: readonly string[];
  readonly title: string | null;
}

/**
 * Reads the document's pages.
 *
 * PDF goes through the bounded first-party extractor. Plain text is accepted as a single unpaginated
 * document — useful for governance minutes and pasted contract extracts — and its citations say
 * "section", because it has no pages and inventing them would be the fabricated citation ADR-0036 §6
 * prohibits.
 */
function readPages(request: DocumentIngestionRequest, format: string): ParsedDocument {
  if (format === 'PDF') {
    const doc = parsePdf(request.bytes);
    if (doc.pages.length === 0) {
      throw new UnreadableDocument(
        `${request.fileName} could not be read: ${doc.unreadable.join(' ')}`,
      );
    }
    return {
      pages: doc.pages,
      pagesPreserved: doc.unreadable.every((u) => !u.includes('page tree')),
      completeness: doc.complete ? 'COMPLETE' : 'PARSE_INCOMPLETE',
      unreadable: doc.unreadable,
      title: doc.title,
    };
  }
  if (format === 'TEXT') {
    const text = utf8(request.bytes);
    return {
      pages: [{ pageNumber: 1, text }],
      pagesPreserved: false,
      completeness: 'COMPLETE',
      unreadable: [],
      title: null,
    };
  }
  throw new UnreadableDocument(
    `${request.fileName} is not a PDF or a text document. The file's own bytes decide this, not `
    + 'its extension.',
  );
}
