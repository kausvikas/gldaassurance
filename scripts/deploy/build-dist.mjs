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
  ['data-sources.html', '/data-sources'],
];

/**
 * Secondary routes, nested under a primary product area. Currently none.
 *
 * The list is kept because the shape is still right for a future sub-surface, and because the
 * decision it used to hold is worth keeping visible: Knowledge & Connections sat under Assistant on
 * the reasoning that it is where a data owner works, not where an executive starts, and that
 * promoting it would spend the most valuable row of the product on an administrative surface.
 *
 * That reasoning was not wrong; it was outvoted. Buried a level down, the one surface that answers
 * "where did this number come from and what is it trusted for" was reachable only by someone who
 * already knew it existed — which is precisely the wrong audience for a governance surface. It is
 * now the sixth primary destination, renamed **Data Sources** for what it actually inventories.
 */
const NESTED = [];

/** Markers that mean a page came from the retired admin-sidebar shell. */
const LEGACY = ['gl-shell-sidebar', 'gl-sidebar', 'class="gl-app-shell"'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'projects'), { recursive: true });

const built = new Set(readdirSync(SRC).filter((f) => f.endsWith('.html')));
for (const [file] of ROUTES) {
  if (!built.has(file)) throw new Error(`missing route: ${file} — run "npm run design:app" first`);
  cpSync(join(SRC, file), join(OUT, file));
}

for (const [dir, file] of NESTED) {
  mkdirSync(join(OUT, dir), { recursive: true });
  const source = join(SRC, dir, file);
  cpSync(source, join(OUT, dir, file));
}

const projectPages = readdirSync(join(SRC, 'projects')).filter((f) => f.endsWith('.html'));
if (projectPages.length === 0) throw new Error('no project pages built');
for (const f of projectPages) cpSync(join(SRC, 'projects', f), join(OUT, 'projects', f));

// --- gates ------------------------------------------------------------------
const published = [
  ...ROUTES.map(([f]) => join(OUT, f)),
  ...NESTED.map(([dir, file]) => join(OUT, dir, file)),
  ...projectPages.map((f) => join(OUT, 'projects', f)),
];

let shells = 0;
let scripts = 0;
for (const path of published) {
  const html = readFileSync(path, 'utf8');
  const marker = LEGACY.find((m) => html.includes(m));
  if (marker !== undefined) throw new Error(`legacy shell "${marker}" reached ${path}`);
  const navs = (html.match(/class="gl-nav"/g) ?? []).length;
  if (navs !== 1) throw new Error(`${path} renders ${String(navs)} application shells, expected exactly 1`);
  if (!html.includes('aria-current="page"')) throw new Error(`${path} marks no active navigation state`);
  shells += navs;

  /*
   * Every inline script must parse.
   *
   * The client runtime is authored inside a TypeScript template literal, so an escape that is
   * correct in the source can be wrong in the emitted JavaScript — `\'` inside a template literal
   * becomes a bare apostrophe and terminates the string it was meant to sit inside. That shipped
   * once: a one-character error silently broke the whole runtime, and the deployed Command Center
   * rendered every governed figure as an em dash. No test caught it, because no test parses the
   * artefact the browser actually receives.
   *
   * `new Function` compiles without executing, which is the exact question being asked: is what we
   * are about to publish syntactically a program?
   */
  for (const [i, block] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(block[1]);
      scripts += 1;
    } catch (e) {
      throw new Error(
        `${path} inline script ${String(i)} does not parse: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

console.log(`dist built: ${OUT}`);
console.log(
  `  ${String(ROUTES.length)} primary routes · ${String(NESTED.length)} nested · `
  + `${String(projectPages.length)} project pages`,
);
console.log(`  one shell per page verified across ${String(shells)} pages · no legacy shell markers`);
console.log(`  ${String(scripts)} inline scripts parse`);
