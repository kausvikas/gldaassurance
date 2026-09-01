/**
 * Writes the Phase 4 acceptance-gate report.
 *
 * `npm run assess:curated` → `docs/PHASE-4-CURATED-ASSESSMENT.md`.
 */
import { writeFileSync } from 'node:fs';
import { EXECUTIVE_SCENARIO_LETTERS } from './generator/curated.js';
import { generatePortfolio, renderReport } from './assessment/curated-assessment.js';

const portfolio = generatePortfolio();
const markdown = renderReport(portfolio, EXECUTIVE_SCENARIO_LETTERS);
const target = 'docs/PHASE-4-CURATED-ASSESSMENT.md';
writeFileSync(target, `${markdown}\n`, 'utf8');

console.log('DEMO — SYNTHETIC DATA');
console.log(`seed         ${portfolio.seed}`);
console.log(`scenarios    ${EXECUTIVE_SCENARIO_LETTERS.join(', ')}`);
console.log(`written      ${target}  (${markdown.split('\n').length} lines)`);
