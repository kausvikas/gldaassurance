/**
 * Chooses where this process keeps what people upload.
 *
 * One decision, made once, at composition time (§7). Everything above this file talks to
 * `DurableStores` and cannot tell which implementation it got — which is what keeps a test, a laptop
 * and Cloud Run on the same code path instead of three that agree until one of them doesn't.
 *
 * ## Why configuration decides, and not detection
 *
 * A "am I on Cloud Run?" probe would make the choice implicit, and an implicit choice is one nobody
 * reviews. Naming the project and the bucket explicitly means a deployment that has not been given
 * somewhere to write knows it, says so, and refuses uploads — rather than accepting them into memory
 * and losing them at the next revision, which is exactly the defect this release exists to close.
 */
import type { DurableStores } from '@app';
import type { Instant } from '@platform/time';
import { gcpStores } from './infrastructure/gcp.js';

/**
 * The durable store this deployment is configured for, or `null` for none.
 *
 * `null` is a legitimate answer and not a failure: a local run and every test are correct without
 * one. It is the *caller's* job to refuse ingestion when there is no store, and it does — a receipt
 * for content that will not survive the process is a false receipt.
 */
export function durableStores(
  env: Readonly<Record<string, string | undefined>>,
  now: () => Instant,
): DurableStores | null {
  const projectId = (env['GLDI_GCP_PROJECT'] ?? env['GOOGLE_CLOUD_PROJECT'] ?? '').trim();
  const bucket = (env['GLDI_BLOB_BUCKET'] ?? '').trim();
  // Both, or neither. A project without a bucket would persist the records and silently drop the
  // original bytes §8 requires be retained, leaving citations pointing at content nobody kept.
  if (projectId === '' || bucket === '') return null;
  return gcpStores({
    projectId,
    databaseId: (env['GLDI_FIRESTORE_DATABASE'] ?? '(default)').trim(),
    bucket,
    now,
  });
}
