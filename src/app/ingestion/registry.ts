/**
 * The knowledge and connections registry — the one object that knows what this deployment has
 * ingested, what it is entitled to be believed about, and what has actually been used.
 *
 * It implements `KnowledgePort`, so the Assistant reaches evidence through the same kind of narrow,
 * application-supplied port it reaches data through: retrieve spans, list sources, describe data
 * quality, record a use. There is no method here that returns a document, a metric, or anything a
 * governed calculation could consume.
 *
 * ## Why `recordUse` exists
 *
 * ADR-0036 §4 defines a source as grounded only when it is **ingested, retrievable and demonstrably
 * used in an answer**. The third leg is the one that cannot be faked by a successful upload, and it
 * is only observable at the moment retrieval actually informs a response — so the retrieval path
 * records it, and `Verify Knowledge` reports it. A source that has never been used says so, which is
 * a genuinely useful thing for someone who thinks they have taught the system something.
 */
import type {
  DataQualitySummary, EvidenceSpan, KnowledgePort, SourceSummary,
} from '@contexts/ai-intelligence';
import type { DocumentVersion, KnowledgeIndex } from '@contexts/knowledge';
import { LexicalKnowledgeIndex } from '@contexts/knowledge';
import type {
  CanonicalConcept, ConceptObservation, EnterpriseConnector, IngestionReceipt,
  ProjectIdentityHub, SourceConflict, SourceStatus, StagedSourceRecord,
} from '@contexts/integration';
import {
  POC_MATERIALITY, SourceAuthorityRegistry, STATUS_MEANING, detectConflicts,
} from '@contexts/integration';
import type { Instant } from '@platform/time';
import type { DurableStores } from './ports.js';
import { InMemoryStores } from './ports.js';

/** One registered source, whatever kind it is. */
export interface RegisteredSource {
  readonly sourceId: string;
  readonly displayName: string;
  readonly kind: 'CANONICAL' | 'FILE_UPLOAD' | 'DOCUMENT' | 'CONNECTOR';
  readonly domain: string;
  readonly status: SourceStatus;
  readonly isFixture: boolean;
  readonly receipts: readonly IngestionReceipt[];
  readonly lastUpdated: Instant | null;
  /**
   * A record count the source knows about itself, where ingestion is not how it got here.
   *
   * The canonical portfolio has no ingestion receipts — it was generated, not ingested — so counting
   * receipts reported it as holding nothing, next to a data-context column saying it governs every
   * figure on every screen. Optional, and used only where the count is a fact about the data rather
   * than a record of a transfer.
   */
  readonly recordCount?: number;
}

/**
 * How a source has actually been used.
 *
 * Three independent booleans rather than one status, because the whole point is that they can
 * disagree: `ingested && retrievable && !used` is the common and important state, and a single
 * "indexed" flag would hide it.
 */
export interface KnowledgeVerification {
  readonly sourceId: string;
  readonly displayName: string;
  readonly ingested: boolean;
  readonly retrievable: boolean;
  readonly used: boolean;
  readonly fingerprint: string | null;
  readonly version: string | null;
  readonly recordsReceived: number;
  readonly recordsAccepted: number;
  readonly recordsQuarantined: number;
  readonly conceptsMapped: readonly CanonicalConcept[];
  readonly documentsIndexed: number;
  readonly chunksIndexed: number;
  readonly identityMappings: number;
  readonly conflicts: number;
  readonly validationState: string;
  readonly lastUsedFor: string | null;
  /** Questions this source can actually answer, derived from what it supplied — never invented. */
  readonly answerableExamples: readonly string[];
  readonly verdict:
    | 'GROUNDED'
    | 'INGESTED_NOT_USED'
    | 'INGESTED_NOT_REACHABLE'
    | 'NOT_INGESTED'
    /** Content without a receipt. Excluded from retrieval and from conflict detection (§13). */
    | 'LEGACY_INCOMPLETE';
}

export class SourceRegistry implements KnowledgePort {
  readonly index: KnowledgeIndex = new LexicalKnowledgeIndex();
  readonly authority = new SourceAuthorityRegistry();

  /**
   * Where everything here is actually kept.
   *
   * In-memory by default, which is the correct store for a test and for a single-process run. A
   * cloud deployment supplies a durable one, and the *only* difference is this field — so the path
   * that persists and the path that does not are the same code with a different adapter, and the
   * tests exercise the real one.
   */
  #stores: DurableStores;

  constructor(stores: DurableStores = new InMemoryStores()) {
    this.#stores = stores;
  }

  get stores(): DurableStores {
    return this.#stores;
  }

  /**
   * Switches to durable storage, deliberately **after** the deterministic seed has been built.
   *
   * The fixture portfolio, its connectors and its demonstration uploads are rebuilt from code on
   * every start, so persisting them would be redundant — and worse than redundant: `hydrate()` would
   * then read those same observations back and append them to the ones already in memory, doubling
   * every figure they contribute to and inventing conflicts between a record and its own copy. So
   * seeding runs against the in-memory store, this call swaps in the durable one, and everything
   * from here — every upload a person makes — is written through.
   *
   * The queue is drained first. A pending in-memory write completing against the new store would
   * write seed content durably, which is the case this method exists to prevent.
   */
  async useDurableStores(stores: DurableStores): Promise<void> {
    await this.flush();
    this.#stores = stores;
  }

  /**
   * Rebuilds the registry from durable storage.
   *
   * Called once per process, at start-up. The retrieval index is **derived**, not stored: it is
   * rebuilt from the document versions, so there is no second copy of the corpus to fall out of step
   * with the versions it describes.
   */
  async hydrate(): Promise<void> {
    for (const source of await this.#stores.sources.listSources()) {
      this.#sources.set(source.sourceId, source);
      this.#restoreUploadAuthority(source);
    }
    for (const observation of await this.#stores.sources.listObservations()) {
      this.#observations.push(observation);
    }
    for (const staged of await this.#stores.sources.listStaged()) {
      this.#staged.push(staged);
    }
    for (const use of await this.#stores.sources.listUses()) {
      this.#uses.set(use.id, use.question);
    }

    const current = new Map(
      (await this.#stores.knowledge.listCurrent()).map((c) => [c.documentId, c.versionId]),
    );
    const versions = await this.#stores.knowledge.listVersions();
    // Ordered so the version a document is currently on is admitted last and therefore wins.
    const ordered = [...versions].sort(
      (a, b) => (current.get(a.documentId) === a.versionId ? 1 : 0)
        - (current.get(b.documentId) === b.versionId ? 1 : 0),
    );
    for (const version of ordered) this.index.add(version);
  }

  /**
   * Re-grants an uploaded source's authority over the concepts its receipts record.
   *
   * Grants are **derived, not stored**, and deliberately: an authority grant read back from the same
   * store the source was read from would be a source describing its own trust level, which is the
   * one thing ADR-0035 §4 forbids. Re-deriving them here means the rule that an upload is
   * `SUPPLEMENTAL` over exactly the concepts it mapped is applied by the same code on a restart as
   * on the original upload — so a restart cannot quietly widen or narrow what a source is believed
   * for.
   *
   * Without this the grants simply vanished on a cold start. Conflict detection still worked, because
   * an observation carries its own authority, but the Knowledge & Connections authority table lost
   * every uploaded row — a source listed as ingested, with nothing recorded about what it is trusted
   * for.
   */
  #restoreUploadAuthority(source: RegisteredSource): void {
    if (source.kind !== 'FILE_UPLOAD') return;
    const concepts = new Set(source.receipts.flatMap((r) => r.conceptsMapped));
    for (const concept of concepts) {
      this.authority.register({
        sourceId: source.sourceId,
        concept,
        authority: 'SUPPLEMENTAL',
        priority: 9,
        conflictBehaviour: 'DISCLOSE',
        rationale: 'An uploaded extract. Evidence of what someone believes, not a system of record.',
      });
    }
  }

  readonly #sources = new Map<string, RegisteredSource>();
  readonly #observations: ConceptObservation[] = [];
  readonly #staged: StagedSourceRecord[] = [];
  readonly #connectors = new Map<string, EnterpriseConnector>();
  /** versionId or sourceId -> the last question a retrieval from it informed. */
  readonly #uses = new Map<string, string>();
  #identity: ProjectIdentityHub | null = null;

  register(source: RegisteredSource): void {
    const existing = this.#sources.get(source.sourceId);
    const merged = existing === undefined ? source : {
      ...source,
      receipts: [...existing.receipts, ...source.receipts],
    };
    this.#sources.set(source.sourceId, merged);
    this.#persist(() => this.#stores.sources.putSource(merged));
  }

  registerConnector(connector: EnterpriseConnector, status: SourceStatus): void {
    this.#connectors.set(connector.provenance.sourceId, connector);
    this.register({
      sourceId: connector.provenance.sourceId,
      displayName: connector.provenance.displayName,
      kind: 'CONNECTOR',
      domain: connector.provenance.domain,
      status,
      isFixture: connector.provenance.isFixture,
      receipts: [],
      lastUpdated: connector.getLastSync().lastSuccessAt,
    });
  }

  setIdentity(hub: ProjectIdentityHub): void {
    this.#identity = hub;
  }

  addReceipt(sourceId: string, receipt: IngestionReceipt): void {
    const source = this.#sources.get(sourceId);
    if (source === undefined) return;
    /*
     * A file's status is what its ingestion produced, not what it was before.
     *
     * A connector's status is about a connection and is left alone. An upload has no connection: it
     * has been received and indexed, or it has not, and saying "configured, awaiting a call" about a
     * parsed workbook is a label that is almost right, which is the worst kind.
     */
    const status = source.kind === 'FILE_UPLOAD' || source.kind === 'DOCUMENT'
      ? 'INGESTED' as const
      : source.status;
    const updated = {
      ...source,
      status,
      receipts: [...source.receipts, receipt],
      lastUpdated: receipt.receivedAt,
    };
    this.#sources.set(sourceId, updated);
    this.#persist(() => this.#stores.sources.putSource(updated));
  }

  addObservations(observations: readonly ConceptObservation[]): void {
    this.#observations.push(...observations);
    this.#persist(() => this.#stores.sources.putObservations(observations.map((o) => ({
      // Content-addressed, so a retried request rewrites the same record rather than adding one.
      key: `${o.sourceId}|${o.projectId}|${o.concept}|${o.period}|${o.sourceVersion}`,
      value: o,
    }))));
  }

  /**
   * Admits a document version to the index **and** to durable storage.
   *
   * The one seam through which a document becomes retrievable. `ingestDocument` writes to the index
   * directly, which is right for a pure function; going through here is what makes the write
   * durable, and a caller that used the index alone would produce a document that vanished on the
   * next cold start with a receipt saying otherwise.
   */
  indexDocument(version: DocumentVersion): void {
    /*
     * `add` is idempotent on version id and `ingestDocument` has usually already called it, so this
     * is a no-op on the index and the write is what matters. It is not conditional on the admission
     * being new: a re-upload of identical content is reported as a duplicate, and skipping the write
     * on that basis would mean a document first uploaded before durable storage existed — or during
     * a failed commit — could never become durable, however many times someone re-sent it.
     */
    this.index.add(version);
    this.#persist(() => this.#stores.knowledge.putVersion(version));
    this.#persist(() => this.#stores.knowledge.putCurrent(version.documentId, version.versionId));
  }

  /** Retains the original bytes, immutable, addressed by source and version — never by filename. */
  retainOriginal(
    sourceId: string, versionId: string, bytes: Uint8Array, contentType: string,
  ): string {
    const key = `${sourceId}/${versionId}`;
    this.#persist(() => this.#stores.blobs.put(key, bytes, contentType).then(() => undefined));
    return this.#stores.blobs.reference(key) ?? key;
  }

  addStaged(staged: readonly StagedSourceRecord[]): void {
    this.#staged.push(...staged);
    this.#persist(() => this.#stores.sources.putStaged(
      staged.map((s) => ({ key: s.idempotencyKey, value: s })),
    ));
  }

  /**
   * Sources whose content arrived without the receipt that describes how (§13).
   *
   * Derived, never stored — a flag somebody sets is a flag somebody forgets to set. The condition is
   * structural and exact: a file or document source holding **no receipt at all**, that nonetheless
   * has rows or chunks attributable to it. That combination is only reachable through the write-race
   * defect closed in this phase, and it cannot be produced by any current code path.
   *
   * They are marked rather than deleted. Deleting them would remove the evidence that the defect
   * happened, and this repository's whole posture is that a demo which quietly tidies its own history
   * is a demo nobody should believe.
   */
  legacyIncomplete(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const source of this.#sources.values()) {
      if (source.kind !== 'FILE_UPLOAD' && source.kind !== 'DOCUMENT') continue;
      if (source.receipts.length > 0) continue;
      const hasContent = this.#observations.some((o) => o.sourceId === source.sourceId)
        || this.#staged.some((r) => r.sourceId === source.sourceId)
        || this.index.current().some((v) => v.metadata.sourceId === source.sourceId);
      if (hasContent) out.add(source.sourceId);
    }
    return out;
  }

  /**
   * Every recorded disagreement. Recomputed rather than cached, so it cannot go stale.
   *
   * Observations from a legacy-incomplete source are excluded. A conflict is a statement that two
   * sources disagree, and it names one of them as governing — which is a claim this product should
   * not make on behalf of a source whose ingestion it cannot account for.
   */
  conflicts(): readonly SourceConflict[] {
    const excluded = this.legacyIncomplete();
    return detectConflicts(
      this.#observations.filter((o) => !excluded.has(o.sourceId)), POC_MATERIALITY,
    );
  }

  quarantined(): readonly StagedSourceRecord[] {
    return this.#staged.filter((s) => s.disposition === 'QUARANTINED');
  }

  observations(): readonly ConceptObservation[] {
    return [...this.#observations];
  }

  sourceList(): readonly RegisteredSource[] {
    return [...this.#sources.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  connector(sourceId: string): EnterpriseConnector | undefined {
    return this.#connectors.get(sourceId);
  }

  // -------------------------------------------------------------------------
  // KnowledgePort
  // -------------------------------------------------------------------------

  retrieve(query: {
    readonly text: string;
    readonly projectIds: readonly string[];
    readonly limit: number;
  }): readonly EvidenceSpan[] {
    const excluded = this.legacyIncomplete();
    const hits = this.index.retrieve({
      text: query.text,
      projectIds: query.projectIds,
      documentClasses: [],
      // Over-fetch so that dropping legacy spans does not silently shorten the result. Filtering
      // after a limit is how a page of evidence quietly becomes half a page.
      limit: excluded.size === 0 ? query.limit : query.limit * 2,
    }).filter((hit) => !excluded.has(hit.citation.sourceId)).slice(0, query.limit);
    return hits.map((hit) => ({
      text: hit.chunk.text,
      documentId: hit.citation.documentId,
      versionId: hit.citation.versionId,
      title: hit.citation.title,
      documentClass: hit.citation.documentClass,
      statedVersion: hit.citation.statedVersion,
      locationLabel: hit.citation.locationLabel,
      authority: hit.citation.authority,
      dataContext: hit.citation.dataContext,
      sourceId: hit.citation.sourceId,
    }));
  }

  recordUse(versionIds: readonly string[], question: string): void {
    const trimmed = question.slice(0, 200);
    for (const versionId of versionIds) {
      this.#uses.set(versionId, trimmed);
      this.#persist(() => this.#stores.sources.putUse(versionId, trimmed));
      const version = this.index.get(versionId);
      if (version !== null) {
        this.#uses.set(version.metadata.sourceId, trimmed);
        this.#persist(() => this.#stores.sources.putUse(version.metadata.sourceId, trimmed));
      }
    }
  }

  /**
   * A durable write, ordered, awaited by the caller that needs it, and never able to crash a request.
   *
   * The registry's methods are synchronous because every caller of them was, and rewriting that would
   * have rippled through the whole ingestion path. Writes are therefore queued here and `flush()` is
   * what an ingestion route awaits before reporting a receipt, so a source is never reported
   * committed before it is (§9). A failure is recorded and surfaced by `flush` rather than thrown
   * into a synchronous caller that cannot handle it.
   *
   * ## Why the queue is serial, and why the argument is a function
   *
   * An upload writes the same source document twice: once when it is registered, with no receipts,
   * and again when its receipt is attached. Started concurrently, those are two `PATCH`es to one
   * document id, and the store is entitled to apply them in either order — so roughly half the time
   * the empty registration landed last and overwrote the receipt. The symptom was precise and
   * misleading: after a restart the source was listed, its observations were intact, its quarantined
   * rows were intact, its conflict was still detected — and `Verify Knowledge` said `NOT_INGESTED`,
   * 0 records received, because the one document describing the transfer had been overwritten by its
   * own earlier state.
   *
   * Ordering cannot be restored after the fact, because a promise handed to this method has already
   * been started. So callers pass a *thunk*, and each is invoked only once the previous write has
   * settled. Serial rather than batched: these are single-digit writes per upload, and a batch would
   * trade an ordering bug for a partial-commit one.
   */
  #tail: Promise<void> = Promise.resolve();
  #failures: string[] = [];

  #persist(work: () => Promise<void>): void {
    this.#tail = this.#tail.then(work).catch((e: unknown) => {
      this.#failures.push(e instanceof Error ? e.message : 'unknown durable write failure');
    });
  }

  /** Waits for every queued write. Returns the failures, so a caller can refuse to claim success. */
  async flush(): Promise<readonly string[]> {
    await this.#tail;
    const failures = [...this.#failures];
    this.#failures = [];
    return failures;
  }

  sources(): readonly SourceSummary[] {
    const legacy = this.legacyIncomplete();
    return this.sourceList().map((s) => {
      const documents = this.index.current().filter((v) => v.metadata.sourceId === s.sourceId);
      const receiptRecords = s.receipts.reduce((n, r) => n + r.recordsAccepted, 0);
      const grants = this.authority.grantsBySource(s.sourceId);
      return {
        sourceId: s.sourceId,
        displayName: s.displayName,
        kind: s.kind,
        // Derived where it applies, so the row says what is true of the data rather than what was
        // last written to a field.
        status: legacy.has(s.sourceId) ? 'LEGACY_INCOMPLETE' as const : s.status,
        /*
         * **A source does not have an authority. A source has authority over concepts.**
         *
         * Rendering the first grant's class put the word "authoritative" in a column headed
         * *Authority* next to a system name — which is precisely the system-level framing ADR-0035
         * §3 rejects, on the page whose job is to argue against it. A CRM shown as "authoritative"
         * invites exactly the conclusion that it is authoritative for whatever it stores.
         *
         * So the cell states the distribution: what this source is trusted for, and how much of it.
         */
        authority: summariseAuthority(grants, s.kind),
        dataContext: s.kind === 'CANONICAL' ? 'CANONICAL' : 'SANDBOX',
        recordCount: s.recordCount ?? (documents.length > 0 ? documents.length : receiptRecords),
        lastUpdated: s.lastUpdated,
        conflicts: this.conflicts().filter(
          (c) => c.entries.some((e) => e.sourceId === s.sourceId),
        ).length,
        isFixture: s.isFixture,
      };
    });
  }

  dataQuality(projectId: string | null): DataQualitySummary {
    const conflicts = this.conflicts();
    const quarantine = this.quarantined();
    const uploads = this.sourceList().filter((s) => s.kind !== 'CANONICAL');
    const documents = this.index.current();
    const incomplete = documents.filter((d) => d.completeness === 'PARSE_INCOMPLETE');
    const unassociated = documents.filter((d) => d.metadata.association.projectIds.length === 0);
    const notes: string[] = [];

    if (uploads.length === 0) {
      notes.push('No enterprise source or uploaded file is contributing to this deployment. Every '
        + 'figure comes from the governed synthetic portfolio.');
    }
    if (quarantine.length > 0) {
      notes.push(`${String(quarantine.length)} records are quarantined. They are inspectable, they `
        + 'carry their reasons, and they contribute to no answer.');
    }
    if (unassociated.length > 0) {
      notes.push(`${String(unassociated.length)} indexed documents are not associated with any `
        + 'project, so no project question will reach them.');
    }
    if (incomplete.length > 0) {
      notes.push(`${String(incomplete.length)} documents parsed incompletely; the unread parts are `
        + 'named on their receipts.');
    }

    return {
      completeness: uploads.length === 0
        ? 'Governed synthetic portfolio only'
        : `${String(documents.length)} documents and ${String(uploads.length)} registered sources beyond the canonical portfolio`,
      freshness: 'Current as at the demo as-of date',
      authority: this.authority.all().length === 0
        ? 'Canonical only'
        : `${String(this.authority.all().length)} concept-level grants registered across ${String(uploads.length)} sources`,
      conflicts: conflicts.length === 0
        ? 'None recorded'
        : `${String(conflicts.length)} recorded; the authoritative value governs and the disagreement is disclosed`,
      mappingStatus: uploads.some((u) => u.status === 'MAPPING_REVIEW_REQUIRED')
        ? 'One or more sources need a mapping review before they contribute again'
        : 'All approved mappings match their sources',
      validationStatus: quarantine.length === 0
        ? 'No record failed validation'
        : `${String(quarantine.length)} records quarantined`,
      identityResolution: this.#identity === null
        ? 'Not applicable — one source'
        : `${String(this.#identity.size)} declared identity mappings; unmapped identifiers are quarantined, never guessed`,
      notes: projectId === null ? notes : [
        ...notes,
        `Scoped to ${projectId}. Document evidence reaches a project question only through a `
        + 'declared association.',
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Verify Knowledge (§62)
  // -------------------------------------------------------------------------

  /** How many sources are excluded from governed retrieval, so a surface can say so rather than not. */
  legacyIncompleteCount(): number {
    return this.legacyIncomplete().size;
  }

  verify(sourceId: string): KnowledgeVerification | null {
    const source = this.#sources.get(sourceId);
    if (source === undefined) return null;

    const versions = this.index.versions().filter((v) => v.metadata.sourceId === sourceId);
    const current = this.index.current().filter((v) => v.metadata.sourceId === sourceId);
    const latest = source.receipts.at(-1) ?? null;
    const ingested = source.receipts.length > 0 || versions.length > 0;
    /*
     * Retrievability means different things for the two kinds of source, and conflating them hid
     * exactly the state this feature exists to expose.
     *
     * A **document** is retrievable when it has indexed chunks *and* an association that a question
     * can arrive through. The row-count fallback below is for structured uploads and, applied to a
     * document, reported an unassociated file as retrievable because its chunks had been accepted —
     * which is the "indexed but unreachable" state reported as reachable.
     */
    const retrievable = versions.length > 0
      ? current.some((v) => v.chunks.length > 0 && reachable(v))
      : (latest?.recordsAccepted ?? 0) > 0;
    const lastUsedFor = this.#uses.get(sourceId) ?? null;

    const accepted = source.receipts.reduce((n, r) => n + r.recordsAccepted, 0);
    const quarantined = source.receipts.reduce((n, r) => n + r.recordsQuarantined, 0);
    const detected = source.receipts.reduce((n, r) => n + r.recordsDetected, 0);
    const concepts = [...new Set(source.receipts.flatMap((r) => r.conceptsMapped))];

    return {
      sourceId,
      displayName: source.displayName,
      ingested,
      retrievable,
      used: lastUsedFor !== null,
      fingerprint: latest?.fingerprint ?? null,
      version: latest?.mappingVersion ?? null,
      recordsReceived: detected,
      recordsAccepted: accepted,
      recordsQuarantined: quarantined,
      conceptsMapped: concepts,
      documentsIndexed: current.length,
      chunksIndexed: current.reduce((n, v) => n + v.chunks.length, 0),
      identityMappings: this.#identity?.all().filter(() => true).length ?? 0,
      conflicts: this.conflicts().filter((c) => c.entries.some((e) => e.sourceId === sourceId)).length,
      validationState: quarantined === 0 ? 'All records passed validation'
        : `${String(quarantined)} of ${String(detected)} records quarantined`,
      lastUsedFor,
      answerableExamples: examplesFor(concepts, current),
      /*
       * Checked first, because it outranks every other reading of this source.
       *
       * These rows previously reported `NOT_INGESTED` — literally true (no receipt) and badly
       * misleading, because the content plainly *had* been ingested and was still feeding a conflict
       * register. Saying "not ingested" about data that is present is the almost-right label this
       * vocabulary exists to prevent.
       */
      verdict: this.legacyIncomplete().has(sourceId) ? 'LEGACY_INCOMPLETE'
        : !ingested ? 'NOT_INGESTED'
          : !retrievable ? 'INGESTED_NOT_REACHABLE'
            : lastUsedFor === null ? 'INGESTED_NOT_USED' : 'GROUNDED',
    };
  }

  /**
   * The honest meaning of a status, so a surface never has to invent one.
   *
   * The canonical portfolio is not a connector and never answered a health check. Rendering
   * `REAL_VERIFIED`'s meaning — *"a live endpoint responded"* — against it was a small lie in the
   * one column whose job is to prevent them, so the source that is not a connection says what it
   * actually is.
   */
  statusMeaning(status: SourceStatus, kind?: RegisteredSource['kind']): string {
    if (kind === 'CANONICAL') {
      return 'The generated synthetic portfolio. Not a connection to anything: it is the dataset '
        + 'every governed figure in this proof of concept is computed from.';
    }
    return STATUS_MEANING[status];
  }
}

/**
 * What a source is trusted for, in one line.
 *
 * Counts by class rather than naming a single one, because the useful fact is the shape of the
 * trust: "authoritative for 4 concepts" says something a reviewer can check, and "authoritative"
 * says something that is not true of any source in this model.
 */
function summariseAuthority(
  grants: readonly { readonly authority: string }[], kind: RegisteredSource['kind'],
): string {
  // The canonical source is not in the connector model and has no per-concept grants, and "none
  // registered" beside a CANONICAL data context read as *trusted for nothing* — the opposite of the
  // truth. It governs everything, which is what the data context already says and what this says.
  if (kind === 'CANONICAL') return 'governs every governed figure';
  if (grants.length === 0) return kind === 'DOCUMENT' ? 'evidence only' : 'none registered';
  const counts = new Map<string, number>();
  for (const g of grants) counts.set(g.authority, (counts.get(g.authority) ?? 0) + 1);
  const order = ['AUTHORITATIVE', 'GOVERNED_REFERENCE', 'SUPPLEMENTAL', 'EVIDENCE_ONLY', 'UNVERIFIED'];
  return [...counts]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([authority, count]) => `${authority.toLowerCase().replace(/_/g, ' ')} for ${String(count)}`)
    .join(' · ');
}

/** A document is reachable by a project question only if something associates it with a project. */
function reachable(version: DocumentVersion): boolean {
  return version.metadata.association.projectIds.length > 0
    || version.metadata.association.customerIds.length > 0
    || version.metadata.association.portfolioIds.length > 0;
}

/**
 * Questions this source can now answer.
 *
 * Derived from what it actually supplied — the concepts it mapped and the documents it indexed —
 * never from a fixed list. A source that supplied nothing produces no examples, which is the correct
 * and useful answer to "what did this teach the system?"
 */
function examplesFor(
  concepts: readonly CanonicalConcept[], documents: readonly DocumentVersion[],
): readonly string[] {
  const out: string[] = [];
  for (const document of documents.slice(0, 3)) {
    const project = document.metadata.association.projectIds[0];
    out.push(project === undefined
      ? `What does ${document.metadata.title} say about acceptance?`
      : `What does ${project}'s ${document.metadata.title} say about acceptance?`);
  }
  if (concepts.includes('financial.actualCost')) out.push('What actual cost has this source reported?');
  if (concepts.includes('financial.forecastRevenue')) out.push('What forecast revenue does this source report, and does it agree with Finance?');
  if (concepts.includes('assurance.reviewDate')) out.push('Which projects have an overdue assurance review?');
  if (concepts.includes('delivery.velocity')) out.push('Which projects have declining delivery performance?');
  return out.slice(0, 5);
}
