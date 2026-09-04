/**
 * Firestore and Cloud Storage, over their REST APIs.
 *
 * ## Why REST rather than the client libraries
 *
 * ADR-0032 §4 keeps the process that holds the API credential and parses untrusted uploads free of
 * dependency trees it cannot review. `@google-cloud/firestore` and `@google-cloud/storage` pull in
 * gRPC, protobuf and a long transitive tail — into exactly that process. The REST surface these two
 * services expose is small enough to call directly, so the decision stands rather than being quietly
 * traded away the first time durability was needed.
 *
 * ## Credentials
 *
 * There are none. On Cloud Run the service identity's access token comes from the metadata server,
 * which is reachable only from inside the instance and returns a short-lived token. Nothing is
 * stored, nothing is committed, and there is no key file to leak. Locally the store is absent and
 * the in-memory adapter is used instead, which is why a developer needs no cloud access to run the
 * product.
 *
 * ## Why every document is one JSON string
 *
 * Firestore's REST encoding is typed per field — `stringValue`, `integerValue`, `mapValue`,
 * `arrayValue`, and a null that is not the same as an absent field. Mapping the application's records
 * onto it would put a second, hand-written serialisation of every governed type in this file, where
 * it would drift from the first. One `stringValue` holding the record's JSON keeps the mapping
 * total, keeps absence and null distinct, and keeps this adapter a transport rather than a schema.
 */
import { HttpFailure, send } from '@platform/net';
import type { HostPolicy } from '@platform/net';
import type { Instant } from '@platform/time';
import type {
  AuditRepository, DocumentBlobStore, DurableStores, Keyed, KnowledgeRepository, SourceRepository,
} from '@app';
import type { ConceptObservation, StagedSourceRecord } from '@contexts/integration';
import type { DocumentVersion } from '@contexts/knowledge';
import type { RegisteredSource } from '@app';

const METADATA_HOST = 'metadata.google.internal';
const FIRESTORE_HOST = 'firestore.googleapis.com';
const STORAGE_HOST = 'storage.googleapis.com';

const POLICY: HostPolicy = {
  allowedHosts: [METADATA_HOST, FIRESTORE_HOST, STORAGE_HOST],
  requireTls: false,
};

/** Firestore refuses a document larger than 1 MiB; refuse first, with a reason. */
const MAX_DOCUMENT_BYTES = 900_000;

export class DurableStoreUnavailable extends Error {
  constructor(detail: string) {
    super(`The durable store is unavailable: ${detail}`);
    this.name = 'DurableStoreUnavailable';
  }
}

/**
 * The instance's own access token, cached until shortly before it expires.
 *
 * Refreshed early rather than on failure: a token that expires mid-request produces a 401 on a write
 * that has already been reported as accepted, which is the worst moment to discover it.
 */
class MetadataToken {
  #token: string | null = null;
  #expiresAtMs = 0;

  constructor(private readonly now: () => Instant) {}

  async get(): Promise<string> {
    const nowMs = Date.parse(String(this.now()));
    if (this.#token !== null && nowMs < this.#expiresAtMs) return this.#token;
    const response = await send({
      method: 'GET',
      url: `http://${METADATA_HOST}/computeMetadata/v1/instance/service-accounts/default/token`,
      headers: { 'Metadata-Flavor': 'Google' },
      budget: { timeoutMs: 5_000, maxResponseBytes: 8 * 1024 },
    }, POLICY, this.now);
    if (!response.ok) throw new DurableStoreUnavailable('the metadata server refused a token');
    const payload = JSON.parse(response.body) as { access_token?: string; expires_in?: number };
    if (typeof payload.access_token !== 'string') {
      throw new DurableStoreUnavailable('the metadata server returned no token');
    }
    this.#token = payload.access_token;
    // Sixty seconds of margin. The clock here is the injected one, so a test can drive expiry.
    this.#expiresAtMs = nowMs + Math.max(0, (payload.expires_in ?? 300) - 60) * 1000;
    return this.#token;
  }
}

interface FirestoreDocument {
  readonly name?: string;
  readonly fields?: { readonly payload?: { readonly stringValue?: string } };
}

/**
 * A Firestore collection holding JSON payloads at caller-chosen ids.
 *
 * Writes use `PATCH .../documents/{collection}/{id}`, which creates or replaces — so a Cloud Run
 * retry of the same request writes the same document at the same id rather than a second copy. That
 * is the idempotency §10 requires, and it is a property of the addressing rather than of a check.
 */
class Collection {
  constructor(
    private readonly project: string,
    private readonly database: string,
    private readonly name: string,
    private readonly token: MetadataToken,
    private readonly now: () => Instant,
  ) {}

  #base(): string {
    return `https://${FIRESTORE_HOST}/v1/projects/${this.project}/databases/${this.database}/documents`;
  }

  async put(id: string, value: unknown): Promise<void> {
    const payload = JSON.stringify(value);
    if (payload.length > MAX_DOCUMENT_BYTES) {
      throw new DurableStoreUnavailable(
        `a record for "${this.name}" exceeds the ${String(MAX_DOCUMENT_BYTES)}-byte document ceiling`,
      );
    }
    const response = await send({
      method: 'POST',
      url: `${this.#base()}/${this.name}?documentId=${encodeURIComponent(id)}`,
      headers: {
        authorization: `Bearer ${await this.token.get()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fields: { payload: { stringValue: payload } } }),
      budget: { timeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024 },
    }, POLICY, this.now);

    // 409 means the document id already exists, which for a content-addressed key means the same
    // record. Replace it rather than failing: a retry must be a no-op, not an error.
    if (response.status === 409) {
      const patch = await send({
        method: 'POST',
        url: `https://${FIRESTORE_HOST}/v1/projects/${this.project}/databases/${this.database}`
          + `/documents:commit`,
        headers: {
          authorization: `Bearer ${await this.token.get()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          writes: [{
            update: {
              name: `projects/${this.project}/databases/${this.database}/documents/${this.name}/${id}`,
              fields: { payload: { stringValue: payload } },
            },
          }],
        }),
        budget: { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 },
      }, POLICY, this.now);
      if (!patch.ok) throw new DurableStoreUnavailable(`write to ${this.name} returned ${String(patch.status)}`);
      return;
    }
    if (!response.ok) {
      throw new DurableStoreUnavailable(`write to ${this.name} returned ${String(response.status)}`);
    }
  }

  async putMany(records: readonly { readonly key: string; readonly value: unknown }[]): Promise<void> {
    // Sequential rather than parallel. A burst of parallel writes against a cold Firestore is how a
    // request that would have succeeded times out instead, and these batches are small.
    for (const record of records) await this.put(record.key, record.value);
  }

  async list<T>(): Promise<readonly T[]> {
    const out: T[] = [];
    let pageToken: string | null = null;
    // Bounded: a demo corpus is small, and an unbounded pager is an unbounded response.
    for (let page = 0; page < 20; page += 1) {
      const url = `${this.#base()}/${this.name}?pageSize=300`
        + (pageToken === null ? '' : `&pageToken=${encodeURIComponent(pageToken)}`);
      const response = await send({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${await this.token.get()}` },
        budget: { timeoutMs: 10_000, maxResponseBytes: 8 * 1024 * 1024 },
      }, POLICY, this.now);
      // A collection that has never been written does not exist, and that is not an error.
      if (response.status === 404) return out;
      if (!response.ok) {
        throw new DurableStoreUnavailable(`read of ${this.name} returned ${String(response.status)}`);
      }
      const body = JSON.parse(response.body) as {
        documents?: FirestoreDocument[]; nextPageToken?: string;
      };
      for (const document of body.documents ?? []) {
        const raw = document.fields?.payload?.stringValue;
        if (raw === undefined) continue;
        try {
          out.push(JSON.parse(raw) as T);
        } catch {
          // A record that will not parse is skipped rather than failing the whole read: one corrupt
          // document must not make every other source invisible.
        }
      }
      pageToken = body.nextPageToken ?? null;
      if (pageToken === null) break;
    }
    return out;
  }
}

/**
 * Cloud Storage, for the original uploaded bytes.
 *
 * Uploads are `uploadType=media` with a caller-chosen object name, and the name is always
 * `sourceId/versionId` — never anything derived from the filename a user supplied. No ACL is set, so
 * the object inherits the bucket's uniform, private access (§8).
 */
class Blobs implements DocumentBlobStore {
  constructor(
    private readonly bucket: string,
    private readonly token: MetadataToken,
    private readonly now: () => Instant,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const response = await send({
      method: 'POST',
      url: `https://${STORAGE_HOST}/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`
        + `?uploadType=media&name=${encodeURIComponent(key)}`,
      headers: {
        authorization: `Bearer ${await this.token.get()}`,
        'content-type': contentType,
      },
      body: Buffer.from(bytes).toString('binary'),
      budget: { timeoutMs: 20_000, maxResponseBytes: 256 * 1024 },
    }, POLICY, this.now);
    if (!response.ok) {
      throw new DurableStoreUnavailable(`object write returned ${String(response.status)}`);
    }
    return key;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await send({
      method: 'GET',
      url: `https://${STORAGE_HOST}/storage/v1/b/${encodeURIComponent(this.bucket)}/o/`
        + `${encodeURIComponent(key)}?alt=media`,
      headers: { authorization: `Bearer ${await this.token.get()}` },
      budget: { timeoutMs: 20_000, maxResponseBytes: 32 * 1024 * 1024 },
    }, POLICY, this.now);
    if (response.status === 404) return null;
    if (!response.ok) throw new DurableStoreUnavailable(`object read returned ${String(response.status)}`);
    return new Uint8Array(Buffer.from(response.body, 'binary'));
  }

  reference(key: string): string | null {
    // A `gs://` reference, not a URL. The object is private and a link nobody can open would be
    // worse than none — this is an identifier an operator can resolve with the tools they have.
    return `gs://${this.bucket}/${key}`;
  }
}

export interface GcpStoreOptions {
  readonly projectId: string;
  readonly databaseId: string;
  readonly bucket: string;
  readonly now: () => Instant;
}

export function gcpStores(options: GcpStoreOptions): DurableStores {
  const token = new MetadataToken(options.now);
  const collection = (name: string): Collection =>
    new Collection(options.projectId, options.databaseId, name, token, options.now);

  const sourcesC = collection('sources');
  const observationsC = collection('observations');
  const stagedC = collection('staged');
  const usesC = collection('uses');
  const versionsC = collection('documentVersions');
  const currentC = collection('documentCurrent');
  const auditC = collection('audit');

  const sources: SourceRepository = {
    listSources: () => sourcesC.list<RegisteredSource>(),
    putSource: (source) => sourcesC.put(safeId(source.sourceId), source),
    putObservations: (records: readonly Keyed<ConceptObservation>[]) =>
      observationsC.putMany(records.map((r) => ({ key: safeId(r.key), value: r.value }))),
    listObservations: () => observationsC.list<ConceptObservation>(),
    putStaged: (records: readonly Keyed<StagedSourceRecord>[]) =>
      stagedC.putMany(records.map((r) => ({ key: safeId(r.key), value: r.value }))),
    listStaged: () => stagedC.list<StagedSourceRecord>(),
    putUse: (id, question) => usesC.put(safeId(id), { id, question }),
    listUses: () => usesC.list<{ id: string; question: string }>(),
  };

  const knowledge: KnowledgeRepository = {
    listVersions: () => versionsC.list<DocumentVersion>(),
    putVersion: (version) => versionsC.put(safeId(version.versionId), version),
    putCurrent: (documentId, versionId) =>
      currentC.put(safeId(documentId), { documentId, versionId }),
    listCurrent: () => currentC.list<{ documentId: string; versionId: string }>(),
  };

  const audit: AuditRepository = {
    append: (record) => auditC.put(
      safeId(`${String(record['correlationId'] ?? 'evt')}-${String(Date.parse(String(options.now())))}`),
      record,
    ),
    recent: async (limit) => (await auditC.list<Readonly<Record<string, unknown>>>()).slice(-limit),
  };

  return { sources, knowledge, blobs: new Blobs(options.bucket, token, options.now), audit };
}

/**
 * A Firestore-safe document id.
 *
 * Ids may not contain `/`, may not be `.` or `..`, and may not exceed 1500 bytes. The application's
 * keys are already tame — `src-upload-…`, `ver-…`, `srcId::naturalKey::version` — but an
 * idempotency key contains a natural key that came from a file, so it is sanitised here rather than
 * trusted. A key that reduces to nothing gets a stable fallback rather than an empty path segment.
 */
function safeId(raw: string): string {
  const cleaned = raw.replace(/[/.\u0000-\u001f]/g, '_').slice(0, 400);
  return cleaned === '' || cleaned === '_' ? 'unnamed' : cleaned;
}
