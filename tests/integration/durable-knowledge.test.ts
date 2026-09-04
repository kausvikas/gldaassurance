/**
 * Durability: what an upload leaves behind must outlive the process that accepted it.
 *
 * These tests exist because the deployed product failed them. A workbook and a PDF uploaded to the
 * live runtime were accepted, produced receipts, and were gone at the next revision — the whole
 * surface reported them as though they had never been sent. A green suite proved nothing about that,
 * because every test built its registry and read it back inside one process, which is the one
 * condition under which losing everything is invisible.
 *
 * So the shape here is always the same and always two registries: one writes through a store, a
 * **second, independent** registry hydrates from that same store, and the assertions are made against
 * the second one. Anything that survives that survives a restart, because that is what a restart is.
 */
import { describe, expect, it } from 'vitest';
import {
  InMemoryStores, SourceRegistry, ingestDocument, ingestStructured,
} from '@app';
import type { ApprovedMapping } from '@app';
import { identityHub } from '../../scripts/fixtures/enterprise.js';
import { buildPdf, buildXlsx } from '../../scripts/fixtures/office.js';
import { instant } from '@platform/time';

const NOW = instant('2026-08-31T00:00:00Z');

const MAPPING: ApprovedMapping = {
  mappingVersion: 'durability-v1',
  identityField: 'finance_project_id',
  identitySystem: 'UPLOAD',
  periodField: 'period',
  fields: [
    { sourceField: 'actual_cost', concept: 'financial.actualCost', required: true, kind: 'NUMERIC', nonNegative: true },
  ],
};

function workbook(actualCost: string): Uint8Array {
  return buildXlsx([{
    name: 'Financials',
    headers: ['finance_project_id', 'period', 'actual_cost'],
    rows: [
      ['FIN-1001', '2026-08-31', '4820000'],
      ['FIN-1002', '2026-08-31', actualCost],
    ],
  }]);
}

/** Ingests a workbook exactly as the runtime route does, receipt and all. */
async function upload(
  registry: SourceRegistry, sourceId: string, bytes: Uint8Array,
): Promise<readonly string[]> {
  registry.register({
    sourceId, displayName: sourceId, kind: 'FILE_UPLOAD', domain: 'FILE_UPLOAD',
    status: 'CONFIGURED_UNVERIFIED', isFixture: false, receipts: [], lastUpdated: null,
  });
  const result = ingestStructured({
    sourceId,
    sourceName: sourceId,
    fileName: `${sourceId}.xlsx`,
    bytes,
    mapping: MAPPING,
    identity: identityHub(),
    registry: registry.authority,
    authority: 'SUPPLEMENTAL',
    dataContext: 'SANDBOX',
    receivedAt: NOW,
    effectiveDate: '2026-08-31',
    declaredRecordCount: null,
    knownProjectIds: ['prj-001', 'prj-002', 'prj-003'],
  });
  registry.addReceipt(sourceId, result.receipt);
  registry.addObservations(result.observations);
  registry.addStaged(result.staged);
  return registry.flush();
}

/**
 * A store whose writes complete out of the order they were issued.
 *
 * Without this the tests below prove almost nothing: `InMemoryStores` resolves synchronously, so
 * every write lands in issue order no matter how the registry schedules them, and the ordering defect
 * that lost the receipt in production is invisible. A real store is a network call — two `PATCH`es to
 * one document can complete in either order — so the first write here is made the slowest, which is
 * the arrangement that turns "concurrent" into "wrong" every time rather than occasionally.
 */
function reordering(stores: InMemoryStores): InMemoryStores {
  let issued = 0;
  const delayed = <T extends unknown[]>(fn: (...args: T) => Promise<void>) => (...args: T) => {
    issued += 1;
    const latency = Math.max(0, 20 - issued * 5);
    return new Promise<void>((resolve) => {
      setTimeout(() => { void fn(...args).then(resolve); }, latency);
    });
  };
  const sources = {
    ...stores.sources,
    putSource: delayed(stores.sources.putSource),
    putObservations: delayed(stores.sources.putObservations),
    putStaged: delayed(stores.sources.putStaged),
  };
  // A structural clone rather than a mutation: the caller keeps reading through the original, so a
  // test can assert on what was actually stored.
  return Object.assign(Object.create(Object.getPrototypeOf(stores) as object) as InMemoryStores,
    stores, { sources });
}

/** A second process reading the same store. */
async function restart(stores: InMemoryStores): Promise<SourceRegistry> {
  const next = new SourceRegistry(stores);
  await next.hydrate();
  return next;
}

describe('uploaded knowledge survives a restart', () => {
  it('keeps the receipt, and does not let the registration overwrite it', async () => {
    /*
     * The exact defect this file was opened for.
     *
     * `register` and `addReceipt` both write the same source document. Started concurrently they
     * raced, and the registration — which by definition carries no receipts — landed last often
     * enough to matter. Everything else survived, so the surface looked almost right: the source was
     * listed, its rows were there, its conflict was still detected, and Verify Knowledge said
     * NOT_INGESTED with zero records received.
     */
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(reordering(stores));
    expect(await upload(registry, 'src-a', workbook('2100000'))).toEqual([]);

    const before = registry.verify('src-a');
    const after = (await restart(stores)).verify('src-a');

    expect(after).not.toBeNull();
    expect(after?.ingested).toBe(true);
    expect(after?.recordsReceived).toBe(before?.recordsReceived);
    expect(after?.recordsAccepted).toBe(before?.recordsAccepted);
    expect(after?.recordsQuarantined).toBe(before?.recordsQuarantined);
    expect(after?.verdict).toBe(before?.verdict);
  });

  it('re-derives what an uploaded source is trusted for, rather than reading it back', async () => {
    /*
     * Authority is derived on hydrate, never stored. A grant read back from the same store the
     * source came from would be a source describing its own trust level — and the whole point of
     * ADR-0035 §4 is that a source cannot do that. Deriving it means the restart applies the same
     * rule the upload did.
     */
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(reordering(stores));
    registry.authority.register({
      sourceId: 'src-a', concept: 'financial.actualCost', authority: 'SUPPLEMENTAL',
      priority: 9, conflictBehaviour: 'DISCLOSE', rationale: 'An uploaded extract.',
    });
    await upload(registry, 'src-a', workbook('2100000'));

    const after = await restart(stores);
    const grants = after.authority.grantsBySource('src-a');
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.every((g) => g.authority === 'SUPPLEMENTAL')).toBe(true);
    // Never raised by a restart, whatever the stored record said.
    expect(grants.some((g) => g.authority === 'AUTHORITATIVE')).toBe(false);
  });

  it('keeps quarantined rows, so a defect is not silently forgiven', async () => {
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(reordering(stores));
    // The second row names a finance identifier nobody has mapped, so it must quarantine.
    await upload(registry, 'src-q', buildXlsx([{
      name: 'Financials',
      headers: ['finance_project_id', 'period', 'actual_cost'],
      rows: [['FIN-1001', '2026-08-31', '4820000'], ['FIN-9999', '2026-08-31', '1000000']],
    }]));
    expect(registry.quarantined().length).toBe(1);
    expect((await restart(stores)).quarantined().length).toBe(1);
  });

  it('keeps both sides of a disagreement, so the conflict is still detected', async () => {
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(reordering(stores));
    await upload(registry, 'src-first', workbook('2100000'));
    await upload(registry, 'src-second', workbook('2940000'));

    const before = registry.conflicts();
    expect(before.length).toBe(1);

    const after = (await restart(stores)).conflicts();
    expect(after.length).toBe(1);
    expect(after[0]?.concept).toBe(before[0]?.concept);
    expect(after[0]?.entries.map((e) => e.sourceId).sort())
      .toEqual(before[0]?.entries.map((e) => e.sourceId).sort());
  });

  it('keeps a document retrievable, and keeps its original bytes', async () => {
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(stores);
    const bytes = buildPdf([
      { lines: ['Statement of Work', '', 'The acceptance milestone for the integration release is 2026-11-30.'] },
      { lines: ['Payment is due thirty days after written acceptance by the customer.'] },
    ], 'Durability SOW');
    registry.register({
      sourceId: 'src-doc', displayName: 'SOW.pdf', kind: 'DOCUMENT',
      domain: 'DOCUMENT_REPOSITORY', status: 'CONFIGURED_UNVERIFIED', isFixture: false,
      receipts: [], lastUpdated: null,
    });
    const result = ingestDocument({
      sourceId: 'src-doc',
      fileName: 'SOW.pdf',
      bytes,
      title: null,
      documentClass: 'SOW',
      association: { projectIds: ['prj-001'], customerIds: [], portfolioIds: [] },
      statedVersion: '3',
      effectiveDate: null,
      authority: 'EVIDENCE_ONLY',
      dataContext: 'SANDBOX',
      receivedAt: NOW,
      index: registry.index,
    });
    registry.addReceipt('src-doc', result.receipt);
    registry.indexDocument(result.version);
    registry.retainOriginal('src-doc', result.version.versionId, bytes, 'application/pdf');
    expect(await registry.flush()).toEqual([]);

    const next = await restart(stores);
    const hits = next.retrieve({ text: 'acceptance milestone', projectIds: ['prj-001'], limit: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.sourceId).toBe('src-doc');

    // The bytes an answer was grounded in are still there to be checked against.
    const original = await stores.blobs.get(`src-doc/${result.version.versionId}`);
    expect(original).not.toBeNull();
    expect(original?.length).toBe(bytes.length);
  });

  it('reports a durable write failure rather than claiming the upload landed', async () => {
    /*
     * A store that refuses. The route's contract is that a receipt is never returned when `flush`
     * reports a failure, so the failure has to actually reach `flush` — silently swallowing it here
     * would produce exactly the false receipt this whole file is about.
     */
    const stores = new InMemoryStores();
    const broken = {
      ...stores,
      sources: {
        ...stores.sources,
        putSource: () => Promise.reject(new Error('the durable store refused the write')),
      },
    };
    const registry = new SourceRegistry(broken);
    registry.register({
      sourceId: 'src-x', displayName: 'x', kind: 'FILE_UPLOAD', domain: 'FILE_UPLOAD',
      status: 'CONFIGURED_UNVERIFIED', isFixture: false, receipts: [], lastUpdated: null,
    });
    const failures = await registry.flush();
    expect(failures.length).toBe(1);
    expect(failures[0]).toContain('refused');
  });
});

describe('content that arrived without its receipt is marked, not swept up', () => {
  /*
   * §13. Three sources on the deployed demo were ingested before durable storage existed: their
   * rows and chunks are in the store and the receipts describing how they got there were lost to
   * the write race. Deleting them would remove the evidence that the defect happened. Leaving them
   * as `CONFIGURED_UNVERIFIED` — "credentials and an endpoint are configured" — was nonsense about a
   * file, and `NOT_INGESTED` was worse, because the data was plainly there.
   */
  async function withOrphan(): Promise<SourceRegistry> {
    const stores = new InMemoryStores();
    const registry = new SourceRegistry(stores);
    await upload(registry, 'src-good', workbook('2100000'));
    await upload(registry, 'src-orphan', workbook('2940000'));

    // Reproduce the defect exactly: the source row survives with its registration state and the
    // receipt is gone, which is what the racing write produced.
    await stores.sources.putSource({
      sourceId: 'src-orphan', displayName: 'src-orphan', kind: 'FILE_UPLOAD',
      domain: 'FILE_UPLOAD', status: 'CONFIGURED_UNVERIFIED', isFixture: false,
      receipts: [], lastUpdated: null,
    });
    const next = new SourceRegistry(stores);
    await next.hydrate();
    return next;
  }

  it('detects it structurally rather than from a flag someone set', async () => {
    const registry = await withOrphan();
    expect([...registry.legacyIncomplete()]).toEqual(['src-orphan']);
    expect(registry.legacyIncompleteCount()).toBe(1);
  });

  it('says so in the status, instead of an almost-right label', async () => {
    const registry = await withOrphan();
    const row = registry.sources().find((s) => s.sourceId === 'src-orphan');
    expect(row?.status).toBe('LEGACY_INCOMPLETE');
    expect(registry.statusMeaning('LEGACY_INCOMPLETE'))
      .toContain('Not available for governed retrieval');
    expect(registry.verify('src-orphan')?.verdict).toBe('LEGACY_INCOMPLETE');
  });

  it('withdraws it from conflict detection rather than letting it govern one', async () => {
    const registry = await withOrphan();
    // Both sources disagree on prj-002. With the orphan withdrawn there is only one voice left, and
    // one voice is not a disagreement.
    expect(registry.conflicts().length).toBe(0);
    expect(registry.conflicts().flatMap((c) => c.entries.map((e) => e.sourceId)))
      .not.toContain('src-orphan');
  });

  it('leaves the sound source completely unaffected', async () => {
    const registry = await withOrphan();
    expect(registry.verify('src-good')?.verdict).toBe('INGESTED_NOT_USED');
    expect(registry.verify('src-good')?.recordsAccepted).toBe(2);
    expect(registry.legacyIncomplete().has('src-good')).toBe(false);
  });
});
