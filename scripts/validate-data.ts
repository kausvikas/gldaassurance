#!/usr/bin/env node
/**
 * Generator validation gate.
 *
 * `TEST_STRATEGY.md` §6: validation **fails the build**, not a warning. A demo built on incoherent
 * data is worse than no demo.
 *
 * Run: `npm run data:validate`
 */
import { DEFAULT_SEED, contentHash, generatePortfolio, recordCounts } from './generator/index.js';
import { validate } from './generator/validate.js';

const seed = process.argv[2] ?? DEFAULT_SEED;
const portfolio = generatePortfolio(seed);
const findings = validate(portfolio);
const counts = recordCounts(portfolio);

console.log('DEMO — SYNTHETIC DATA');
console.log(`seed         ${seed}`);
console.log(`content hash ${contentHash(portfolio)}`);
console.log(`projects     ${counts['projects']}   records ${Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString('en-US')}`);
console.log('');

const errors = findings.filter((f) => f.severity === 'ERROR');
const warns = findings.filter((f) => f.severity === 'WARN');

if (findings.length === 0) {
  console.log('PASS — all generator validation checks hold.');
  process.exit(0);
}
for (const f of findings) {
  console.error(`${f.severity}  ${f.check}  ${f.subject}\n       ${f.detail}`);
}
console.error(`\n${errors.length} error(s), ${warns.length} warning(s).`);
process.exit(errors.length > 0 ? 1 : 0);
