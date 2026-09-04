/**
 * The container entrypoint (ADR-0010 §7 — the container is the deployment unit).
 *
 * One artefact across every environment; configuration differs and the build does not. `PORT` is
 * read here because Cloud Run supplies it, and nowhere below reads the environment (ADR-0010 §4).
 */
import { buildRuntime } from './main.js';

const port = ((): number => {
  const raw = (process.env['PORT'] ?? '8080').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    // No dangerous default: an unreadable port is a start-up failure, not a guess (ADR-0010 §5).
    throw new Error(`PORT must be a valid port number; received "${raw}".`);
  }
  return parsed;
})();

buildRuntime().listen(port);
// eslint-disable-next-line no-console
console.log(`[gldi] trusted runtime listening on ${String(port)} — DEMO, SYNTHETIC DATA`);
