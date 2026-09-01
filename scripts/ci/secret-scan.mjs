#!/usr/bin/env node
/**
 * Secret scan — REQ-SEC-008, SECURITY_MODEL.md §7 ("secret-scanning in CI").
 *
 * Deliberately dependency-free and deliberately simple. It is a *gate*, not a security
 * product: it catches the realistic accident (a key pasted into a config file, a committed
 * `.env`), and `SECURITY_MODEL.md` §9 already records that no penetration test or managed
 * secret scanner is part of the POC.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { id: 'PRIVATE_KEY', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'AWS_ACCESS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'GENERIC_API_KEY', re: /\b(api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i },
  { id: 'PASSWORD_ASSIGNMENT', re: /\b(password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { id: 'BEARER_TOKEN', re: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*/ },
  { id: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'ANTHROPIC_KEY', re: /\bsk-ant-[A-Za-z0-9\-_]{16,}/ },
  { id: 'OPENAI_KEY', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
];

const SKIP = /^(node_modules|\.git|dist|coverage|package-lock\.json)/;

let files;
try {
  files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.error('secret-scan: not a git repository; nothing to scan.'); process.exit(0);
}
if (files.length === 0) {
  console.error('secret-scan: no files under version control or staged; nothing to scan.');
  process.exit(0);
}

const findings = [];

for (const file of files) {
  if (SKIP.test(file)) continue;
  if (/^\.env($|\.)/.test(file) && !file.endsWith('.example')) {
    findings.push({ file, id: 'COMMITTED_ENV_FILE', line: 0 });
    continue;
  }
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable
  }
  // This file necessarily contains the patterns it looks for.
  if (file === 'scripts/ci/secret-scan.mjs') continue;
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    for (const { id, re } of PATTERNS) {
      if (re.test(line)) findings.push({ file, id, line: i + 1 });
    }
  });
}

if (findings.length === 0) {
  console.log(`secret-scan: PASS — ${files.length} tracked files, no secret material found.`);
  process.exit(0);
}

for (const f of findings) {
  console.error(`secret-scan: ${f.id} at ${f.file}:${f.line}`);
}
console.error(
  `\nFAIL — ${findings.length} potential secret(s). REQ-SEC-008: no secret material in the repository; configuration is externalised.`,
);
process.exit(1);
