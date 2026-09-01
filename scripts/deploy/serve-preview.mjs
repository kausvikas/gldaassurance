#!/usr/bin/env node
/** Local validation server that applies the same firebase.json rewrites, so what is tested locally
 *  is what Hosting will serve. Validation only — never part of the product (ADR-0020). */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist', 'executive-poc');
const rewrites = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8')).hosting.rewrites;
const PORT = Number(process.argv[2] ?? 8791);
createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path === '/' ? 'index.html' : path.replace(/^\//, '');
  if (!existsSync(join(DIST, file))) {
    if (existsSync(join(DIST, `${file}.html`))) file = `${file}.html`;
    else {
      const hit = rewrites.find((r) => new RegExp(`^${r.source.replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`).test(path));
      file = hit ? hit.destination.replace(/^\//, '') : 'index.html';
    }
  }
  const full = join(DIST, file);
  if (!existsSync(full)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(full));
}).listen(PORT, () => process.stdout.write(`preview on http://localhost:${PORT}/\n`));
