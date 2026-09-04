#!/usr/bin/env node
/**
 * The secret-leakage gate (§82, §111).
 *
 * Scans the repository, the built distribution and every fixture for credential shapes. A known
 * exposure is a P0, so this exits non-zero rather than warning.
 *
 * It scans for **credential shapes generally**, not only this product's own key: a Google
 * service-account key or an AWS id pasted into a fixture is the same defect, and a scanner that only
 * knew about the key we happen to use would miss the one someone else left behind.
 *
 * Findings report *what kind* and *where*. Never the matched text — a leak report that republishes
 * the leak has widened it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  ['anthropic-api-key', /sk-ant-[A-Za-z0-9_-]{16,}/],
  ['openai-api-key', /sk-(?!ant-)[A-Za-z0-9]{32,}/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/],
  ['gcp-private-key', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['aws-access-key-id', /\bAKIA[0-9A-Z]{16}\b/],
  ['slack-token', /\bxox[abprs]-[0-9A-Za-z-]{10,}/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['salesforce-session', /\b00D[A-Za-z0-9]{12,15}![A-Za-z0-9._-]{20,}/],
  // A literal assignment of a credential-shaped environment variable. This is the one that catches
  // the well-meaning "just for now" line, which is how most keys actually reach a repository.
  ['inline-credential-assignment', /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i],
];

const SKIP_DIRS = new Set(['node_modules', '.git', '.firebase', 'coverage']);
const SCANNED = /\.(ts|tsx|mjs|js|json|md|html|css|yml|yaml|txt|sql)$/;

/**
 * Files that legitimately contain the *patterns themselves*.
 *
 * The scanner and its test necessarily hold the regexes they scan for, and excluding them is not a
 * hole: they contain pattern sources, never a credential. Everything else is scanned, including
 * every fixture and every built asset.
 */
const PATTERN_HOLDERS = new Set([
  'scripts/ci/secret-scan.mjs',
  'src/platform/secrets/index.ts',
]);

const roots = ['src', 'scripts', 'server', 'tests', 'docs', 'architecture', 'migrations'];
for (const extra of ['dist', 'data']) if (existsSync(extra)) roots.push(extra);
for (const file of ['package.json', 'firebase.json', '.firebaserc', 'README.md', 'Dockerfile']) {
  if (existsSync(file)) roots.push(file);
}

const findings = [];
let scanned = 0;

function scan(path) {
  const relative = path.replace(`${process.cwd()}/`, '');
  if (PATTERN_HOLDERS.has(relative)) return;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  scanned += 1;
  for (const [id, pattern] of PATTERNS) {
    if (pattern.test(text)) findings.push({ id, where: relative });
  }
}

function walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (SCANNED.test(path)) scan(path);
    return;
  }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    walk(join(path, entry));
  }
}

for (const root of roots) if (existsSync(root)) walk(root);

console.log(`secret scan: ${scanned} files, ${PATTERNS.length} credential shapes`);

if (findings.length === 0) {
  console.log('PASS — no credential shape found in source, fixtures or built output.');
  process.exit(0);
}

console.error(`\nFAIL — ${findings.length} potential credential exposure(s):`);
for (const finding of findings) console.error(`  ${finding.id} in ${finding.where}`);
console.error('\nA known secret exposure is a P0. The value is not printed here: a leak report that '
  + 'republishes the leak has widened it.');
process.exit(1);
