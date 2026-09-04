/**
 * A synthetic connector fixture (ADR-0037 §3).
 *
 * One class implements `EnterpriseConnector` over a supplied set of records and a supplied schema.
 * The six enterprise domains differ only in their data, which is the point: if adding Finance meant
 * writing a Finance-shaped connector class, then adding a real GlobalLogic system later would mean
 * writing another one, and §26's *"new systems without rewriting Assistant logic"* would be false.
 *
 * ## What makes this honest rather than a mock dressed up
 *
 * - `isFixture` is `true` and `provenance.fixtureNotice` carries the words a surface must render.
 *   `healthCheck()` returns `FIXTURE`, and **there is no path from this class to `REAL_VERIFIED`** —
 *   that status requires a live endpoint to have answered, and this class has no endpoint.
 * - `discoveredFromLiveSystem` is `false` on every schema it returns, so the integration matrix
 *   records `SCHEMA DISCOVERED: NO` for every fixture row without anyone having to remember.
 * - Field names are **generic to the category**, not invented GlobalLogic ones. `actual_cost` is what
 *   a cost column is called in general; it is not a claim about any GlobalLogic system's schema, and
 *   the matrix says so per row.
 * - There is no write method to omit — the interface has none.
 *
 * ## Sync behaviour is real, not simulated
 *
 * `sync()` computes genuine idempotency keys and genuinely returns zero new records on a re-run, and
 * `getChanges()` genuinely filters by watermark. Those are the two properties ADR-0008 says are
 * expensive to retrofit, and proving them against a fixture is worth more than asserting them in a
 * document.
 */
import type { Instant } from '@platform/time';
import type { CanonicalConcept } from './authority.js';
import type { SourceSystem } from './identity.js';
import type {
  DiscoveredSchema, EnterpriseConnector, RawRecord, SchemaMapping, SourceDomain, SourceHealth,
  SourceProvenance, SyncRequest, SyncResult, SyncState,
} from './connector.js';
import { idempotencyKey } from './staging.js';

export interface FixtureDefinition {
  readonly sourceId: string;
  readonly displayName: string;
  readonly system: SourceSystem;
  readonly domain: SourceDomain;
  readonly suppliesConcepts: readonly CanonicalConcept[];
  readonly schema: DiscoveredSchema;
  readonly mapping: SchemaMapping;
  readonly records: readonly RawRecord[];
  /** What this fixture demonstrates, in one sentence, rendered next to it. */
  readonly demonstrates: string;
  readonly now: () => Instant;
}

export class FixtureConnector implements EnterpriseConnector {
  readonly #definition: FixtureDefinition;
  /** Keys this connector has already delivered. The idempotency proof lives here. */
  readonly #delivered = new Set<string>();
  #state: SyncState = {
    lastAttemptedAt: null, lastSuccessAt: null, watermark: null, consecutiveFailures: 0,
  };
  /** Set when a caller mutates the fixture's schema to demonstrate drift detection. */
  #driftedSchema: DiscoveredSchema | null = null;

  constructor(definition: FixtureDefinition) {
    this.#definition = definition;
  }

  get provenance(): SourceProvenance {
    return {
      sourceId: this.#definition.sourceId,
      system: this.#definition.system,
      domain: this.#definition.domain,
      displayName: this.#definition.displayName,
      isFixture: true,
      fixtureNotice:
        'SYNTHETIC FIXTURE — demonstration data shaped like this category of system. This is not a '
        + 'connection to any GlobalLogic system, and no schema here was discovered from one.',
    };
  }

  get suppliesConcepts(): readonly CanonicalConcept[] {
    return this.#definition.suppliesConcepts;
  }

  get demonstrates(): string {
    return this.#definition.demonstrates;
  }

  healthCheck(): Promise<SourceHealth> {
    return Promise.resolve({
      // Not `REAL_VERIFIED`, and this class cannot produce that value. A fixture responding is not a
      // system responding, and the status vocabulary exists so the difference is legible (§33).
      status: 'FIXTURE',
      checkedAt: this.#definition.now(),
      detail: `Synthetic fixture holding ${String(this.#definition.records.length)} records. `
        + 'No endpoint is configured and no real system was contacted.',
      latencyMs: null,
    });
  }

  discoverSchema(): Promise<DiscoveredSchema | null> {
    return Promise.resolve(this.#driftedSchema ?? this.#definition.schema);
  }

  preview(limit: number): Promise<readonly RawRecord[]> {
    return Promise.resolve(this.#definition.records.slice(0, Math.max(0, limit)));
  }

  mapSchema(): SchemaMapping | null {
    return this.#definition.mapping;
  }

  sync(request: SyncRequest): Promise<{
    readonly result: SyncResult; readonly records: readonly RawRecord[];
  }> {
    const startedAt = this.#definition.now();
    const candidates = request.mode === 'INCREMENTAL' && request.since !== null
      ? this.#definition.records.filter(
        (r) => r.observedAt !== null && r.observedAt > (request.since ?? ''),
      )
      : this.#definition.records;

    const bounded = candidates.slice(0, Math.max(0, request.maxRecords));
    const fresh: RawRecord[] = [];
    let duplicate = 0;
    for (const record of bounded) {
      const key = idempotencyKey(
        this.#definition.sourceId, record.naturalKey, record.sourceVersion,
      );
      if (this.#delivered.has(key)) { duplicate += 1; continue; }
      this.#delivered.add(key);
      fresh.push(record);
    }

    const schema = this.#driftedSchema ?? this.#definition.schema;
    const drifted = schema.schemaVersion !== this.#definition.mapping.schemaVersion;
    const watermark = bounded
      .map((r) => r.observedAt)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? this.#state.watermark;

    this.#state = {
      lastAttemptedAt: startedAt,
      lastSuccessAt: drifted ? this.#state.lastSuccessAt : startedAt,
      watermark,
      consecutiveFailures: 0,
    };

    return Promise.resolve({
      records: drifted ? [] : fresh,
      result: {
        sourceId: this.#definition.sourceId,
        mode: request.mode,
        startedAt,
        recordsRead: bounded.length,
        recordsNew: drifted ? 0 : fresh.length,
        recordsDuplicate: duplicate,
        recordsRejected: 0,
        watermark,
        schemaVersion: schema.schemaVersion,
        schemaDrift: drifted,
        // Drift stops ingestion; it never triggers a remap. An automatic remap is how a renamed
        // column silently starts feeding a concept from a column that now holds something else.
        status: drifted ? 'MAPPING_REVIEW_REQUIRED' : 'FIXTURE',
        notes: drifted
          ? ['The source structure no longer matches the approved mapping. No record was ingested, '
            + 'and none will be until a mapping is re-approved.']
          : [this.#definition.demonstrates],
      },
    });
  }

  getChanges(since: string): Promise<readonly RawRecord[]> {
    return Promise.resolve(this.#definition.records.filter(
      (r) => r.observedAt !== null && r.observedAt > since,
    ));
  }

  getLastSync(): SyncState {
    return this.#state;
  }

  getProvenance(): SourceProvenance {
    return this.provenance;
  }

  getAuthorityMetadata(): readonly {
    readonly concept: CanonicalConcept; readonly proposedAuthority: string;
  }[] {
    /*
     * A connector **proposes**; the registry decides.
     *
     * Naming this `proposedAuthority` rather than `authority` is the whole point: a source that
     * could declare its own authority could promote itself above Finance by shipping a different
     * adapter, and the registry would be documentation rather than a control (ADR-0035 §4).
     */
    return this.#definition.suppliesConcepts.map((concept) => ({
      concept,
      proposedAuthority: 'SUPPLEMENTAL',
    }));
  }

  /**
   * Replaces the fixture's schema, so drift detection can be demonstrated against a real code path
   * rather than asserted. Test and demonstration affordance only — no production connector has this,
   * because no production source lets its consumer rewrite its schema.
   */
  simulateSchemaChange(schema: DiscoveredSchema): void {
    this.#driftedSchema = schema;
  }
}
