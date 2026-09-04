/**
 * The composition root for the Phase 13 knowledge and connections demonstration.
 *
 * Assembles a `SourceRegistry` with the canonical portfolio, six enterprise fixtures, an identity
 * hub and an authority registry, and exposes the four uploads the mandatory demonstrations need.
 *
 * It lives in `scripts/` for the same reason `demo-api.ts` does: it reads the Phase 3 generator, and
 * the G-ORACLE gate forbids production source from importing it.
 */
import type { ApprovedMapping } from '@app';
import { SourceRegistry, ingestDocument, ingestStructured } from '@app';
import type { StructuredIngestionResult, DocumentIngestionResult } from '@app';
import { ProjectIdentityHub } from '@contexts/integration';
import type { Instant } from '@platform/time';
import {
  allFixtures, atlasSow, authorityRegistry, badRows, identityHub, supplementalFinancials,
  unassociatedMinutes,
} from './enterprise.js';

export const KNOWLEDGE_NOW = '2026-08-31T09:00:00.000Z' as Instant;

/** The mapping a person approved for the supplemental workbook. Two fields, both confirmed. */
export const SUPPLEMENTAL_MAPPING: ApprovedMapping = {
  mappingVersion: 'upload-financials-v1',
  identityField: 'finance_project_id',
  identitySystem: 'UPLOAD',
  periodField: 'period',
  fields: [
    { sourceField: 'actual_cost', concept: 'financial.actualCost', required: true, kind: 'NUMERIC', nonNegative: true },
    { sourceField: 'forecast_revenue', concept: 'financial.forecastRevenue', required: true, kind: 'NUMERIC', nonNegative: true },
  ],
};

export interface KnowledgeDemo {
  readonly registry: SourceRegistry;
  readonly identity: ProjectIdentityHub;
  /** Ingests the Atlas SOW. Returns the receipt so a caller can render it. */
  readonly addAtlasSow: () => DocumentIngestionResult;
  /** Ingests a governance document with no project association. */
  readonly addUnassociatedMinutes: () => DocumentIngestionResult;
  /** Ingests the supplemental workbook, which disagrees with Finance on one project. */
  readonly addSupplementalFinancials: () => StructuredIngestionResult;
  /** Ingests the deliberately-bad workbook. Every row must quarantine. */
  readonly addBadRows: () => StructuredIngestionResult;
}

/**
 * Builds the registry.
 *
 * The canonical portfolio is registered first and is the only source in the `CANONICAL` data
 * context. Everything else — every fixture, every upload — sits in `SANDBOX` and cannot reach a
 * governed figure, which is the property §8 and §29 of the Phase 13 contract require and which this
 * function is where it becomes true.
 */
export function knowledgeDemo(
  knownProjectIds: readonly string[],
  /**
   * The project the statement of work belongs to.
   *
   * Passed in rather than defaulted to the first authorised id, because the two are not the same
   * list: the authorised set is in identity order and the surfaces present projects in governed
   * ranking order. Associating the SOW with "the first project" silently associated it with a
   * different project from the one the demonstration then asked about, and the before/after proof
   * failed for a reason that had nothing to do with retrieval.
   */
  atlasProjectId: string,
): KnowledgeDemo {
  const registry = new SourceRegistry();
  const identity = identityHub();
  registry.setIdentity(identity);

  for (const grant of authorityRegistry().all()) registry.authority.register(grant);

  registry.register({
    sourceId: 'src-canonical',
    displayName: 'Synthetic delivery portfolio',
    kind: 'CANONICAL',
    domain: 'SYNTHETIC_CANONICAL',
    status: 'REAL_VERIFIED',
    isFixture: false,
    receipts: [],
    lastUpdated: KNOWLEDGE_NOW,
  });

  for (const connector of allFixtures()) registry.registerConnector(connector, 'FIXTURE');

  const ingestUpload = (
    sourceId: string, sourceName: string, fileName: string, bytes: Uint8Array,
    declaredRecordCount: number | null,
  ): StructuredIngestionResult => {
    registry.register({
      sourceId, displayName: sourceName, kind: 'FILE_UPLOAD', domain: 'FILE_UPLOAD',
      status: 'CONFIGURED_UNVERIFIED', isFixture: false, receipts: [], lastUpdated: null,
    });
    const result = ingestStructured({
      sourceId, sourceName, fileName, bytes,
      mapping: SUPPLEMENTAL_MAPPING,
      identity,
      registry: registry.authority,
      authority: 'SUPPLEMENTAL',
      dataContext: 'SANDBOX',
      receivedAt: KNOWLEDGE_NOW,
      effectiveDate: '2026-08-31',
      declaredRecordCount,
      knownProjectIds,
    });
    registry.addReceipt(sourceId, result.receipt);
    registry.addObservations(result.observations);
    registry.addStaged(result.staged);
    return result;
  };

  const ingestPdf = (
    sourceId: string, fileName: string, bytes: Uint8Array,
    projectIds: readonly string[], documentClass: 'SOW' | 'GOVERNANCE_MINUTES',
    statedVersion: string | null,
  ): DocumentIngestionResult => {
    registry.register({
      sourceId, displayName: fileName, kind: 'DOCUMENT', domain: 'DOCUMENT_REPOSITORY',
      status: 'CONFIGURED_UNVERIFIED', isFixture: false, receipts: [], lastUpdated: null,
    });
    const result = ingestDocument({
      sourceId, fileName, bytes,
      title: null,
      documentClass,
      association: { projectIds, customerIds: [], portfolioIds: [] },
      statedVersion,
      effectiveDate: '2026-01-12',
      authority: 'EVIDENCE_ONLY',
      dataContext: 'SANDBOX',
      receivedAt: KNOWLEDGE_NOW,
      index: registry.index,
    });
    registry.addReceipt(sourceId, result.receipt);
    return result;
  };

  return {
    registry,
    identity,
    addAtlasSow: () => ingestPdf(
      'src-doc-atlas-sow', 'Atlas-SOW-v3.pdf', atlasSow(),
      // The association is what makes a document reachable by a project question. A document with
      // no association is indexed and unreachable, which the second upload below demonstrates.
      [atlasProjectId], 'SOW', '3',
    ),
    addUnassociatedMinutes: () => ingestPdf(
      'src-doc-minutes', 'Governance-minutes-August.pdf', unassociatedMinutes(),
      [], 'GOVERNANCE_MINUTES', null,
    ),
    addSupplementalFinancials: () => ingestUpload(
      'src-upload-financials', 'Project_Financials.xlsx', 'Project_Financials.xlsx',
      supplementalFinancials(), 3,
    ),
    addBadRows: () => ingestUpload(
      'src-upload-bad', 'Project_Financials_bad.xlsx', 'Project_Financials_bad.xlsx',
      badRows(), 6,
    ),
  };
}
