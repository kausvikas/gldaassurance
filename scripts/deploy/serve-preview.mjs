#!/usr/bin/env node
/** Local validation server that applies the same firebase.json rewrites, so what is tested locally
 *  is what Hosting will serve. Validation only — never part of the product (ADR-0020). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist', 'executive-poc');
const rewrites = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8')).hosting.rewrites;
const PORT = Number(process.argv[2] ?? 8791);
createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path === '/' ? 'index.html' : path.replace(/^\//, '');
  /*
   * A path can name a directory as well as a file.
   *
   * `/assistant` is a page **and** a folder now that Knowledge & Connections lives beneath it, and
   * treating the folder as the file crashed this server with EISDIR. Hosting resolves the page,
   * so the local validator has to as well or it stops being a validator.
   */
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  if (!isFile(join(DIST, file))) {
    if (isFile(join(DIST, `${file}.html`))) file = `${file}.html`;
    else {
      const hit = rewrites.find((r) => new RegExp(`^${r.source.replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*')}$`).test(path));
      file = hit ? hit.destination.replace(/^\//, '') : 'index.html';
    }
  }
  const full = join(DIST, file);
  if (!isFile(full)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(full));
}).listen(PORT, () => process.stdout.write(`preview on http://localhost:${PORT}/\n`));
