#!/usr/bin/env node
/**
 * Packages the executive distribution — DEMO / SYNTHETIC DATA.
 *
 * One application, one shell. Every primary route and every project page is produced by
 * `scripts/design/build-app.tsx` through `gl-shell.ts`, so the product cannot drift back into the
 * state where Command Center carried the new experience while Projects and Assistant opened the
 * legacy admin sidebar.
 *
 * The legacy design surfaces still build — Phase 8–12 tests assert against them — but they are not
 * published. A build gate below fails if a legacy shell marker reaches the distribution.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(ROOT, 'docs', 'design', 'app');
const OUT = join(ROOT, 'dist', 'executive-poc');

/** Primary routes, each a real file so Hosting's cleanUrls resolves them without a rewrite. */
const ROUTES = [
  ['index.html', '/'],
  ['projects.html', '/projects'],
  ['forward-risk.html', '/forward-risk'],
  ['interventions.html', '/interventions'],
  ['assistant.html', '/assistant'],
];

/** Markers that mean a page came from the retired admin-sidebar shell. */
const LEGACY = ['gl-shell-sidebar', 'gl-sidebar', 'class="gl-app-shell"'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'projects'), { recursive: true });

const built = new Set(readdirSync(SRC).filter((f) => f.endsWith('.html')));
for (const [file] of ROUTES) {
  if (!built.has(file)) throw new Error(`missing route: ${file} — run "npm run design:app" first`);
  cpSync(join(SRC, file), join(OUT, file));
}

const projectPages = readdirSync(join(SRC, 'projects')).filter((f) => f.endsWith('.html'));
if (projectPages.length === 0) throw new Error('no project pages built');
for (const f of projectPages) cpSync(join(SRC, 'projects', f), join(OUT, 'projects', f));

// --- gates ------------------------------------------------------------------
const published = [
  ...ROUTES.map(([f]) => join(OUT, f)),
  ...projectPages.map((f) => join(OUT, 'projects', f)),
];

let shells = 0;
for (const path of published) {
  const html = readFileSync(path, 'utf8');
  const marker = LEGACY.find((m) => html.includes(m));
  if (marker !== undefined) throw new Error(`legacy shell "${marker}" reached ${path}`);
  const navs = (html.match(/class="gl-nav"/g) ?? []).length;
  if (navs !== 1) throw new Error(`${path} renders ${String(navs)} application shells, expected exactly 1`);
  if (!html.includes('aria-current="page"')) throw new Error(`${path} marks no active navigation state`);
  shells += navs;
}

writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

console.log(`dist built: ${OUT}`);
console.log(`  ${String(ROUTES.length)} primary routes · ${String(projectPages.length)} project pages`);
console.log(`  one shell per page verified across ${String(shells)} pages · no legacy shell markers`);
