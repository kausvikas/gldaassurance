/**
 * The first-party lexical index (ADR-0036 §5).
 *
 * BM25 over page-anchored chunks. Chosen over an embedding index for four reasons that all matter
 * more in this product than recall on paraphrase does:
 *
 *   - **Deterministic.** The same corpus and the same question retrieve the same spans, on every
 *     run and behind every provider. §69 requires Claude and a local model to agree on the facts;
 *     that is not testable if retrieval itself is a model.
 *   - **Explainable.** "This passage was retrieved because it contains *acceptance*, *criteria* and
 *     *Atlas*" is a sentence a reviewer can check. A cosine distance is not.
 *   - **No egress.** Embedding a document means sending it somewhere. The evidence plane holds
 *     contract text; making retrieval depend on transmitting it would put an egress path underneath
 *     every citation.
 *   - **Honest failure.** Lexical retrieval fails by returning nothing, which the answerability
 *     engine turns into "the evidence does not cover that". Vector retrieval fails by returning the
 *     nearest thing, which is how a confident answer gets grounded in the wrong paragraph.
 *
 * The cost is real and is recorded in ADR-0036 §Consequences: a question phrased entirely in
 * synonyms will miss. That is the failure this product would rather have.
 */
import type {
  Citation, DocumentChunk, DocumentVersion, IndexResult, KnowledgeIndex, LocationKind,
  RetrievalHit, RetrievalQuery,
} from '../index.js';
import { chunkIdFor, citationFor } from '../index.js';

/** Standard BM25 constants. Named so a reader can see they are not tuned to make a demo look good. */
export const BM25 = { k1: 1.2, b: 0.75 } as const;

/**
 * Words carrying no retrieval signal in this domain.
 *
 * Deliberately small. An aggressive stop-list is a silent recall failure, and several words a
 * general-purpose list would drop — *risk*, *change*, *value*, *state* — are load-bearing here.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'do', 'does', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me',
  'my', 'no', 'nor', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
]);

/**
 * Tokenisation.
 *
 * Lowercase, split on anything that is not a letter or a digit, drop single characters and
 * stopwords. Identifiers survive intact because digits are kept: `prj-011` becomes `prj` and `011`,
 * and both are discriminating in this corpus.
 */
export function tokenise(text: string): readonly string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Splits parsed pages into retrievable chunks, preserving the page each came from.
 *
 * Chunking is by paragraph with a target size, never by a fixed character window: a window that
 * cuts mid-sentence produces citations that do not read as evidence when a reviewer opens the page.
 * Where a page is one long block, it is split on sentence boundaries at the target size.
 *
 * `locationKind` is `PAGE` only when the caller actually preserved pages. A caller that flattened a
 * document passes `CHUNK`, and every citation downstream then says "section", not "page" — which is
 * the mechanism that makes ADR-0036 §6's "a page number is never inferred" true rather than
 * aspirational.
 */
export function chunkPages(
  documentId: string,
  versionId: string,
  pages: readonly { readonly location: number; readonly text: string }[],
  locationKind: LocationKind,
  targetChars = 900,
): readonly DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let ordinal = 0;
  for (const page of pages) {
    const paragraphs = page.text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[ \t]+/g, ' ').trim())
      .filter((p) => p !== '');

    let buffer = '';
    let heading: string | null = null;
    const flush = (): void => {
      const text = buffer.trim();
      buffer = '';
      if (text === '') return;
      ordinal += 1;
      chunks.push({
        chunkId: chunkIdFor(versionId, ordinal),
        documentId,
        versionId,
        locationKind,
        location: locationKind === 'PAGE' ? page.location : ordinal,
        heading,
        text,
      });
    };

    for (const paragraph of paragraphs) {
      // A short line in title case or ending in a colon reads as a heading, and carrying it onto
      // the chunk is what lets a citation say "Acceptance Criteria, page 14" rather than a bare
      // page number a reader then has to scan.
      if (paragraph.length <= 80 && /^[^.!?]+:?$/.test(paragraph) && /[A-Z]/.test(paragraph[0] ?? '')) {
        if (buffer.length >= targetChars) flush();
        heading = paragraph.replace(/:$/, '');
      }
      if (buffer.length + paragraph.length > targetChars && buffer !== '') flush();
      buffer = buffer === '' ? paragraph : `${buffer}\n${paragraph}`;
      while (buffer.length > targetChars * 2) {
        const cut = buffer.lastIndexOf('. ', targetChars);
        const at = cut > targetChars / 2 ? cut + 1 : targetChars;
        const head = buffer.slice(0, at);
        buffer = buffer.slice(at).trim();
        const rest = buffer;
        buffer = head;
        flush();
        buffer = rest;
      }
    }
    flush();
  }
  return chunks;
}

interface Posting {
  readonly chunkIndex: number;
  readonly termFrequency: number;
}

/**
 * An in-memory BM25 index.
 *
 * In-memory is the right scale for this POC and is stated rather than assumed: the corpus is tens
 * of documents, the runtime is stateless (ADR-0032 §Consequences), and the index is rebuilt from
 * the content-addressed artefact store at start-up. A persistent index would introduce a second
 * copy of the evidence that could drift from the artefacts it describes.
 */
export class LexicalKnowledgeIndex implements KnowledgeIndex {
  /** versionId → version. Every version ever admitted, including superseded ones. */
  readonly #versions = new Map<string, DocumentVersion>();

  /** documentId → the versionId currently treated as this document's live evidence. */
  readonly #currentVersion = new Map<string, string>();

  /** Flat chunk table; postings index into it. */
  readonly #chunks: DocumentChunk[] = [];

  /** term → postings. */
  readonly #postings = new Map<string, Posting[]>();

  #totalLength = 0;

  add(version: DocumentVersion): IndexResult {
    const existing = this.#versions.get(version.versionId);
    if (existing !== undefined) {
      // Identical bytes for an identical document. Not a new version, and not an error — a user
      // re-uploading the same file has done nothing wrong and should be told so precisely.
      return {
        admission: 'DUPLICATE', version: existing, chunksIndexed: 0, supersededVersionId: null,
      };
    }
    const previous = this.#currentVersion.get(version.documentId) ?? null;
    this.#versions.set(version.versionId, version);
    this.#currentVersion.set(version.documentId, version.versionId);

    for (const chunk of version.chunks) {
      const chunkIndex = this.#chunks.length;
      this.#chunks.push(chunk);
      const terms = tokenise(chunk.text);
      this.#totalLength += terms.length;
      const counts = new Map<string, number>();
      for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [term, tf] of counts) {
        const list = this.#postings.get(term);
        if (list === undefined) this.#postings.set(term, [{ chunkIndex, termFrequency: tf }]);
        else list.push({ chunkIndex, termFrequency: tf });
      }
    }

    return {
      admission: previous === null ? 'INDEXED' : 'SUPERSEDES',
      version,
      chunksIndexed: version.chunks.length,
      supersededVersionId: previous,
    };
  }

  retrieve(query: RetrievalQuery): readonly RetrievalHit[] {
    const terms = tokenise(query.text);
    if (terms.length === 0 || this.#chunks.length === 0) return [];

    const admissible = this.#admissibleChunkIndexes(query);
    if (admissible.size === 0) return [];

    const avgdl = this.#totalLength / this.#chunks.length;
    const scores = new Map<number, number>();

    for (const term of new Set(terms)) {
      const postings = this.#postings.get(term);
      if (postings === undefined) continue;
      const relevant = postings.filter((p) => admissible.has(p.chunkIndex));
      if (relevant.length === 0) continue;
      // Robertson/Sparck-Jones IDF with the +1 that keeps a term appearing in every document from
      // scoring negative — without it a common term actively pushes a matching chunk down.
      const idf = Math.log(1 + (admissible.size - relevant.length + 0.5) / (relevant.length + 0.5));
      for (const posting of relevant) {
        const chunk = this.#chunks[posting.chunkIndex];
        if (chunk === undefined) continue;
        const dl = tokenise(chunk.text).length;
        const tf = posting.termFrequency;
        const denominator = tf + BM25.k1 * (1 - BM25.b + BM25.b * (dl / (avgdl || 1)));
        const contribution = idf * ((tf * (BM25.k1 + 1)) / (denominator || 1));
        scores.set(posting.chunkIndex, (scores.get(posting.chunkIndex) ?? 0) + contribution);
      }
    }

    const ranked = [...scores.entries()]
      .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
      .slice(0, Math.max(0, query.limit));

    const hits: RetrievalHit[] = [];
    for (const [chunkIndex, score] of ranked) {
      const chunk = this.#chunks[chunkIndex];
      if (chunk === undefined) continue;
      const version = this.#versions.get(chunk.versionId);
      if (version === undefined) continue;
      const citation: Citation = citationFor(version, chunk);
      hits.push({ chunk, score, citation });
    }
    return hits;
  }

  /**
   * Which chunks this query may see at all.
   *
   * Superseded versions are excluded: an answer must be grounded in the current evidence, and
   * retrieving a paragraph from a replaced SOW would produce a citation that is true about a
   * document nobody is working from. The superseded version stays in the store for audit and for
   * answers that already cited it.
   *
   * A project restriction is a **hard filter, not a ranking boost**. A document that was never
   * associated with the project is not weakly relevant to a question about that project; it is
   * inadmissible, and boosting instead of filtering is how evidence from one client's contract ends
   * up cited in another client's answer.
   */
  #admissibleChunkIndexes(query: RetrievalQuery): ReadonlySet<number> {
    const out = new Set<number>();
    for (let i = 0; i < this.#chunks.length; i += 1) {
      const chunk = this.#chunks[i];
      if (chunk === undefined) continue;
      if (this.#currentVersion.get(chunk.documentId) !== chunk.versionId) continue;
      const version = this.#versions.get(chunk.versionId);
      if (version === undefined) continue;
      if (query.projectIds.length > 0) {
        const linked = version.metadata.association.projectIds;
        if (!query.projectIds.some((id) => linked.includes(id))) continue;
      }
      if (query.documentClasses.length > 0
        && !query.documentClasses.includes(version.metadata.documentClass)) continue;
      out.add(i);
    }
    return out;
  }

  versions(): readonly DocumentVersion[] {
    return [...this.#versions.values()].sort(
      (a, b) => a.documentId.localeCompare(b.documentId) || a.versionOrdinal - b.versionOrdinal,
    );
  }

  current(): readonly DocumentVersion[] {
    const out: DocumentVersion[] = [];
    for (const versionId of this.#currentVersion.values()) {
      const v = this.#versions.get(versionId);
      if (v !== undefined) out.push(v);
    }
    return out.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  }

  get(versionId: string): DocumentVersion | null {
    return this.#versions.get(versionId) ?? null;
  }

  remove(documentId: string): number {
    let removed = 0;
    for (const [versionId, version] of [...this.#versions]) {
      if (version.documentId !== documentId) continue;
      this.#versions.delete(versionId);
      removed += 1;
    }
    this.#currentVersion.delete(documentId);
    if (removed > 0) this.#rebuildPostings();
    return removed;
  }

  /**
   * Rebuilds the flat chunk table and postings from the surviving versions.
   *
   * Deletion rebuilds rather than patching because postings hold *positions* in the chunk table:
   * splicing one document out shifts every later index, and a stale posting would retrieve a
   * neighbouring document's text under the deleted document's citation. Rebuilding is O(corpus) on
   * an operation that happens rarely, against a class of bug that would be nearly invisible.
   */
  #rebuildPostings(): void {
    this.#chunks.length = 0;
    this.#postings.clear();
    this.#totalLength = 0;
    for (const version of this.versions()) {
      for (const chunk of version.chunks) {
        const chunkIndex = this.#chunks.length;
        this.#chunks.push(chunk);
        const terms = tokenise(chunk.text);
        this.#totalLength += terms.length;
        const counts = new Map<string, number>();
        for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
        for (const [term, tf] of counts) {
          const list = this.#postings.get(term);
          if (list === undefined) this.#postings.set(term, [{ chunkIndex, termFrequency: tf }]);
          else list.push({ chunkIndex, termFrequency: tf });
        }
      }
    }
  }

  get documentCount(): number {
    return this.#currentVersion.size;
  }

  get chunkCount(): number {
    return this.#chunks.length;
  }
}
