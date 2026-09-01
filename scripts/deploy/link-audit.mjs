#!/usr/bin/env node
/**
 * Link audit over the built distribution, resolved through the Hosting rewrite table.
 *
 * A link is "resolvable" if it is an in-page anchor, a file that exists, or a route `firebase.json`
 * rewrites onto a file that exists. Auditing the files alone would pass links that 404 in
 * production and fail routes that work — the rewrite table is part of the contract.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist', 'executive-poc');
const cfg = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
const rewrites = cfg.hosting.rewrites;
const files = new Set(readdirSync(DIST));

const resolveRoute = (p) => {
  const path = p.split('?')[0].split('#')[0];
  if (path === '/' ) return files.has('index.html');
  const asFile = path.replace(/^\//, '');
  if (files.has(asFile) || files.has(`${asFile}.html`)) return true;
  for (const r of rewrites) {
    const src = r.source;
    const re = new RegExp(`^${src.replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`);
    if (re.test(path)) return files.has(r.destination.replace(/^\//, ''));
  }
  return false;
};

let checked = 0; const broken = []; const bad = [];
for (const f of [...files].filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(join(DIST, f), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('#') || url.startsWith('data:') || url.startsWith('mailto:')) continue;
    checked += 1;
    if (/^file:\/\//i.test(url)) { bad.push(`${f}: file:// -> ${url}`); continue; }
    if (/localhost|127\.0\.0\.1/i.test(url)) { bad.push(`${f}: localhost -> ${url}`); continue; }
    if (/^\/Users\//.test(url)) { bad.push(`${f}: local path -> ${url}`); continue; }
    if (/^https?:\/\//i.test(url)) continue;
    if (!resolveRoute(url)) broken.push(`${f} -> ${url}`);
  }
}
process.stdout.write(`internal links checked: ${checked}\nbroken: ${broken.length}\nunsafe (file/localhost/local path): ${bad.length}\n`);
[...broken, ...bad].slice(0, 20).forEach((b) => process.stdout.write('  ' + b + '\n'));
process.exit(broken.length + bad.length === 0 ? 0 : 1);
