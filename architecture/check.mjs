#!/usr/bin/env node
/**
 * CI gate. Exits non-zero on any architecture violation.
 * Authority: TEST_STRATEGY.md §5, §9; ADR-0001 §Verification.
 */
import { analyze } from './analyze.mjs';

const result = analyze();
const byCode = new Map();
for (const v of result.violations) {
  if (!byCode.has(v.code)) byCode.set(v.code, []);
  byCode.get(v.code).push(v);
}

console.log(
  `architecture gate: ${result.filesScanned} source files, ` +
    `${result.contextsDeclared} contexts, ${result.platformModulesDeclared} platform modules`,
);

if (result.violations.length === 0) {
  console.log('PASS — no architecture violations.');
  process.exit(0);
}

for (const [code, list] of [...byCode].sort()) {
  console.error(`\n${code} — ${list.length} violation(s)`);
  for (const v of list) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ''}${v.specifier ? `  import "${v.specifier}"` : ''}`);
    console.error(`    ${v.message}`);
    console.error(`    authority: ${v.authority}`);
  }
}
console.error(`\nFAIL — ${result.violations.length} architecture violation(s).`);
process.exit(1);
