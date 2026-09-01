#!/usr/bin/env node
/**
 * Writes the synthetic portfolio to `data/synthetic/`.
 *
 * `SYNTHETIC_DATA_SPEC.md` §8: generator in `scripts/`, output in `data/synthetic/`, seed recorded
 * in `MANIFEST.json` with generator version, as-of date, record counts and a content hash.
 * Regeneration with the same seed must reproduce the identical hash.
 *
 * Run: `npm run data:generate`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SEED, GENERATOR_VERSION, contentHash, generatePortfolio, recordCounts,
} from './generator/index.js';

const OUT = join(import.meta.dirname, '..', 'data', 'synthetic');
const seed = process.argv[2] ?? DEFAULT_SEED;

const started = Date.now();
const portfolio = generatePortfolio(seed);
mkdirSync(OUT, { recursive: true });

const ndjson = (rows: readonly unknown[]): string =>
  rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

const files: Record<string, readonly unknown[]> = {
  'business-units': portfolio.structure.businessUnits,
  regions: portfolio.structure.regions,
  industries: portfolio.structure.industries,
  customers: portfolio.structure.customers,
  accounts: portfolio.structure.accounts,
  portfolios: portfolio.structure.portfolios,
  programs: portfolio.structure.programs,
  projects: portfolio.structure.projects,
  'fx-rates': portfolio.fxRates,
  users: portfolio.users,
  ...Object.fromEntries(Object.entries(portfolio.facts).map(([k, v]) => [
    k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v as readonly unknown[],
  ])),
};

for (const [name, rows] of Object.entries(files)) {
  writeFileSync(join(OUT, `${name}.ndjson`), ndjson(rows), 'utf8');
}

const counts = recordCounts(portfolio);
const hash = contentHash(portfolio);
const manifest = {
  demoMarker: 'DEMO — SYNTHETIC DATA',
  seed,
  generatorVersion: GENERATOR_VERSION,
  specVersion: '2.0.0',
  asOfDate: portfolio.asOf,
  contentHash: hash,
  recordCounts: counts,
  totalRecords: Object.values(counts).reduce((a, b) => a + b, 0),
  curatedScenarios: portfolio.curated.map((c) => ({
    letter: c.letter, projectId: c.projectId, archetype: c.scenario.archetype, title: c.scenario.title,
  })),
  note:
    'Regeneration with the same seed and generator version must reproduce this contentHash. ' +
    'A changed hash without a changed seed or generator version is a defect (REQ-DATA-007). ' +
    'The .ndjson files are regenerable and are not committed; this manifest is.',
};
writeFileSync(join(OUT, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`DEMO — SYNTHETIC DATA`);
console.log(`seed          ${seed}`);
console.log(`generator     ${GENERATOR_VERSION}`);
console.log(`as of         ${portfolio.asOf}`);
console.log(`projects      ${counts['projects']}`);
console.log(`records       ${manifest.totalRecords.toLocaleString('en-US')}`);
console.log(`content hash  ${hash}`);
console.log(`elapsed       ${Date.now() - started} ms`);
