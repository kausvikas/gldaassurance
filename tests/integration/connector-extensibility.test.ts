/**
 * Adding a source is writing an adapter — proved, not asserted (§39).
 *
 * ADR-0037's central claim is that a new GlobalLogic system can be added without touching the
 * Assistant, the planner, the metric engines, or any surface. That claim is easy to make and easy to
 * be wrong about: the usual way it fails is a `switch` on system name somewhere downstream, so the
 * sixth connector works and the seventh needs a case added in three files.
 *
 * So this test defines an entirely new connector **here, in the test file**, for a system that does
 * not exist anywhere in `src/` or `scripts/`, registers it, and then exercises the surfaces. Nothing
 * in the product knows it exists. If any of these assertions needs a production file changed to
 * pass, the extensibility claim was false.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceRegistry } from '@app';
import type {
  DiscoveredSchema, EnterpriseConnector, RawRecord, SchemaMapping, SourceHealth, SourceProvenance,
  SyncRequest, SyncResult, SyncState,
} from '@contexts/integration';
import { instant } from '@platform/time';

const NOW = instant('2026-08-31T00:00:00Z');

/**
 * A procurement system nobody in this codebase has heard of.
 *
 * Deliberately declares `ADAPTER_READY` rather than anything that sounds live, and
 * `discoveredFromLiveSystem: false`, because no endpoint was called — which is the honesty ADR-0037
 * §2 is built around and the property the integration matrix renders verbatim.
 */
class ProcurementConnector implements EnterpriseConnector {
  readonly provenance: SourceProvenance = {
    sourceId: 'src-procurement',
    // An existing system value: adding a *system* is a change to a canonical vocabulary and is
    // deliberately not something an adapter may do on its own. Adding an *adapter* is.
    system: 'PSA',
    domain: 'PSA_RESOURCE',
    displayName: 'Subcontractor procurement (adapter, not configured)',
    isFixture: false,
    fixtureNotice: null,
  };

  readonly suppliesConcepts = ['resource.costRate', 'resource.actualEffort'] as const;

  healthCheck(): Promise<SourceHealth> {
    return Promise.resolve({
      status: 'ADAPTER_READY',
      checkedAt: NOW,
      detail: 'The adapter and its mapping exist. No endpoint or credential is configured.',
      latencyMs: null,
    });
  }

  discoverSchema(): Promise<DiscoveredSchema | null> {
    return Promise.resolve({
      entity: 'PurchaseOrderLine',
      fields: [
        { name: 'po_project_ref', type: 'string', nullable: false, sample: null },
        { name: 'day_rate', type: 'number', nullable: false, sample: null },
      ],
      discoveredFromLiveSystem: false,
      schemaVersion: 'proc-v1',
    });
  }

  preview(): Promise<readonly RawRecord[]> {
    return Promise.resolve([]);
  }

  mapSchema(): SchemaMapping {
    return {
      mappingVersion: 'proc-map-v1',
      entity: 'PurchaseOrderLine',
      schemaVersion: 'proc-v1',
      identityField: 'po_project_ref',
      periodField: null,
      fields: [{
        sourceField: 'day_rate', concept: 'resource.costRate', required: true,
        confirmedBy: 'this test',
      }],
    };
  }

  sync(request: SyncRequest): Promise<{ result: SyncResult; records: readonly RawRecord[] }> {
    return Promise.resolve({
      result: {
        sourceId: 'src-procurement',
        mode: request.mode,
        startedAt: NOW,
        recordsRead: 0,
        recordsNew: 0,
        recordsDuplicate: 0,
        recordsRejected: 0,
        watermark: null,
        schemaVersion: 'proc-v1',
        schemaDrift: false,
        status: 'ADAPTER_READY',
        notes: ['No endpoint is configured, so nothing was read.'],
      },
      records: [],
    });
  }

  getChanges(): Promise<readonly RawRecord[]> {
    return Promise.resolve([]);
  }

  getLastSync(): SyncState {
    return { lastAttemptedAt: null, lastSuccessAt: null, watermark: null, consecutiveFailures: 0 };
  }

  getProvenance(): SourceProvenance {
    return this.provenance;
  }

  getAuthorityMetadata(): readonly { concept: 'resource.costRate'; proposedAuthority: string }[] {
    // *Proposed*. What a source is trusted for is granted by the registry, never claimed by the
    // source — a connector that could assert its own authority could promote itself above Finance.
    return [{ concept: 'resource.costRate', proposedAuthority: 'GOVERNED_REFERENCE' }];
  }
}

describe('a source nobody wrote the product around', () => {
  it('registers, and appears on the surfaces, with no core change', () => {
    const registry = new SourceRegistry();
    registry.registerConnector(new ProcurementConnector(), 'ADAPTER_READY');

    const listed = registry.sourceList().find((s) => s.sourceId === 'src-procurement');
    expect(listed).toBeDefined();
    expect(listed?.kind).toBe('CONNECTOR');
    expect(listed?.status).toBe('ADAPTER_READY');
    // The status vocabulary carries a meaning for every value, so a reader never infers one.
    expect(registry.statusMeaning('ADAPTER_READY')).toContain('No endpoint');
    expect(registry.connector('src-procurement')).toBeDefined();
  });

  it('cannot claim its own authority', async () => {
    const registry = new SourceRegistry();
    const connector = new ProcurementConnector();
    registry.registerConnector(connector, 'ADAPTER_READY');

    // The adapter proposes GOVERNED_REFERENCE. Until a grant is registered, it holds none — the
    // proposal is an input to a decision, not the decision.
    expect(registry.authority.grantsBySource('src-procurement')).toEqual([]);
    expect(await connector.healthCheck()).toMatchObject({ status: 'ADAPTER_READY' });
  });

  it('has no write method, in a type nobody can widen from outside', () => {
    const connector = new ProcurementConnector() as unknown as Record<string, unknown>;
    for (const forbidden of ['write', 'update', 'push', 'post', 'save', 'delete', 'upsert']) {
      expect(connector[forbidden], `a connector must not expose "${forbidden}"`).toBeUndefined();
    }
  });

  it('declares that its schema was never read from a live system', async () => {
    const schema = await new ProcurementConnector().discoverSchema();
    // The field the integration matrix renders verbatim. Generic product knowledge of a vendor's
    // API is not evidence about a GlobalLogic tenant, and this is where that distinction lives.
    expect(schema?.discoveredFromLiveSystem).toBe(false);
  });

  it('is not named anywhere in the product it was added to', () => {
    /*
     * The assertion that makes the rest mean something.
     *
     * Every test above would still pass if `src/` contained a branch for this connector. Grepping
     * the product for its identifiers is what shows the surfaces reached it by contract rather than
     * by recognition — and it is the check that will fail the day somebody adds a special case.
     */
    const roots = ['src', 'server', 'scripts'];
    const matches: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) { walk(path); continue; }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const text = readFileSync(path, 'utf8');
        if (text.includes('src-procurement') || text.includes('ProcurementConnector')) {
          matches.push(path);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(matches).toEqual([]);
  });
});
