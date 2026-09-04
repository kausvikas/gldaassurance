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
  readonly verdict: 'GROUNDED' | 'INGESTED_NOT_USED' | 'INGESTED_NOT_REACHABLE' | 'NOT_INGESTED';
}

export class SourceRegistry implements KnowledgePort {
  readonly index: KnowledgeIndex = new LexicalKnowledgeIndex();
  readonly authority = new SourceAuthorityRegistry();

  readonly #sources = new Map<string, RegisteredSource>();
  readonly #observations: ConceptObservation[] = [];
  readonly #staged: StagedSourceRecord[] = [];
  readonly #connectors = new Map<string, EnterpriseConnector>();
  /** versionId or sourceId -> the last question a retrieval from it informed. */
  readonly #uses = new Map<string, string>();
  #identity: ProjectIdentityHub | null = null;

  register(source: RegisteredSource): void {
    const existing = this.#sources.get(source.sourceId);
    this.#sources.set(source.sourceId, existing === undefined ? source : {
      ...source,
      receipts: [...existing.receipts, ...source.receipts],
    });
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
    this.#sources.set(sourceId, {
      ...source,
      receipts: [...source.receipts, receipt],
      lastUpdated: receipt.receivedAt,
    });
  }

  addObservations(observations: readonly ConceptObservation[]): void {
    this.#observations.push(...observations);
  }

  addStaged(staged: readonly StagedSourceRecord[]): void {
    this.#staged.push(...staged);
  }

  /** Every recorded disagreement. Recomputed rather than cached, so it cannot go stale. */
  conflicts(): readonly SourceConflict[] {
    return detectConflicts(this.#observations, POC_MATERIALITY);
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
    const hits = this.index.retrieve({
      text: query.text,
      projectIds: query.projectIds,
      documentClasses: [],
      limit: query.limit,
    });
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
      const version = this.index.get(versionId);
      if (version !== null) this.#uses.set(version.metadata.sourceId, trimmed);
    }
  }

  sources(): readonly SourceSummary[] {
    return this.sourceList().map((s) => {
      const documents = this.index.current().filter((v) => v.metadata.sourceId === s.sourceId);
      const receiptRecords = s.receipts.reduce((n, r) => n + r.recordsAccepted, 0);
      const grants = this.authority.grantsBySource(s.sourceId);
      return {
        sourceId: s.sourceId,
        displayName: s.displayName,
        kind: s.kind,
        status: s.status,
        authority: grants[0]?.authority ?? (s.kind === 'DOCUMENT' ? 'EVIDENCE_ONLY' : 'UNVERIFIED'),
        dataContext: s.kind === 'CANONICAL' ? 'CANONICAL' : 'SANDBOX',
        recordCount: documents.length > 0 ? documents.length : receiptRecords,
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
      verdict: !ingested ? 'NOT_INGESTED'
        : !retrievable ? 'INGESTED_NOT_REACHABLE'
          : lastUsedFor === null ? 'INGESTED_NOT_USED' : 'GROUNDED',
    };
  }

  /** The honest meaning of a status, so a surface never has to invent one. */
  statusMeaning(status: SourceStatus): string {
    return STATUS_MEANING[status];
  }
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
