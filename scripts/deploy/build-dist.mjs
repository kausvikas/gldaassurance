#!/usr/bin/env node
/**
 * Builds the public executive distribution — DEMO / SYNTHETIC DATA.
 *
 * This is a **packaging step, not a build of the product**. It copies the already-rendered executive
 * pages produced by `npm run verify` into `dist/executive-poc/` and adds a landing page. No product
 * source is compiled here and no page content is rewritten, so nothing it does can move an economic
 * or health figure.
 *
 * ## Why routes are handled by Hosting rewrites rather than by editing the pages
 *
 * The shell's navigation points at product routes (`/portfolio`, `/projects`, `/financial`, …) that
 * are deliberately independent of filenames. Rewriting those hrefs into `*.html` would be a product
 * change made for a deployment's convenience. Instead `firebase.json` maps each route onto the file
 * that serves it, so the pages ship byte-identical to the ones the Phase 12A browser review accepted.
 *
 * Three declared destinations — Assurance, Data Quality, Rules & Models — have no built surface in
 * this POC. They are given an honest "not part of this POC" page rather than a 404, because a dead
 * link in an executive demo reads as a broken product.
 */
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(ROOT, 'docs', 'design');
const OUT = join(ROOT, 'dist', 'executive-poc');

const PAGES = [
  ['portfolio-command-center.html', 'Portfolio Command Center', '/portfolio',
    'Where the portfolio stands, and where to intervene first.'],
  ['project-executive-health.html', 'Project Executive Health', '/projects',
    'Why one project is the colour it is — reported status beside the evidence.'],
  ['margin-intelligence.html', 'Margin & Driver Intelligence', '/financial',
    'What moved gross margin, how much of the movement is attributed, and what is not.'],
  ['forward-risk.html', 'Forward Risk & Recovery', '/early-warnings',
    'Governed 30- and 60-day outlook, firing early warnings, and advisory recovery options.'],
  ['delivery-assistant.html', 'Delivery Intelligence Assistant', '/assistant',
    'Advisory and read only. It explains governed assessments; it cannot change anything.'],
  ['component-gallery.html', 'Design System', '/gallery',
    'The tokens and components every surface is assembled from.'],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const built = new Set(readdirSync(SRC).filter((f) => f.endsWith('.html')));
for (const [file] of PAGES) {
  if (!built.has(file)) throw new Error(`missing built page: ${file} — run "npm run verify" first`);
  cpSync(join(SRC, file), join(OUT, file));
}

/*
 * Per-project pages, one file per project.
 *
 * /projects/<projectId> must resolve to that project. Hosting's cleanUrls maps the path onto
 * projects/<projectId>.html, so the routing is a real file lookup rather than a rewrite that
 * discards the path segment and serves whatever the shared page happened to contain.
 */
const PROJECT_SRC = join(SRC, 'projects');
const projectPages = readdirSync(PROJECT_SRC).filter((f) => f.endsWith('.html'));
if (projectPages.length === 0) throw new Error('no per-project pages built — run "npm run verify" first');
mkdirSync(join(OUT, 'projects'), { recursive: true });
for (const file of projectPages) cpSync(join(PROJECT_SRC, file), join(OUT, 'projects', file));

const SHELL = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
:root {
  --ink: #14161c; --muted: #5a6172; --line: #dfe3ea; --card: #ffffff;
  --canvas: #f1f3f7; --accent: #e8552a; --shell: #14161c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--ink);
  font: 15px/1.55 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
header { background: var(--shell); color: #fff; padding: 28px 40px; }
.brand { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.sub { color: #aab1c2; font-size: 13px; margin-top: 2px; }
.rule { width: 34px; height: 3px; background: var(--accent); margin-top: 14px; }
main { max-width: 1080px; margin: 0 auto; padding: 32px 40px 64px; }
.banner { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--accent);
  color: var(--accent); border-radius: 3px; padding: 6px 10px; font-size: 12px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; }
h1 { font-size: 26px; margin: 22px 0 6px; letter-spacing: -0.01em; }
p.lede { color: var(--muted); max-width: 78ch; margin: 0 0 26px; }
ul.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
li.card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; }
li.card a { display: block; padding: 18px 20px; text-decoration: none; color: inherit; }
li.card a:hover { background: #fafbfd; }
li.card a:focus-visible { outline: 2px solid #4442e3; outline-offset: -2px; }
.card-title { font-weight: 650; font-size: 16px; }
.card-desc { color: var(--muted); font-size: 13.5px; margin-top: 5px; }
.card-route { color: #8a90a2; font-size: 12px; margin-top: 8px; font-variant-numeric: tabular-nums; }
footer { color: var(--muted); font-size: 12.5px; margin-top: 34px; border-top: 1px solid var(--line);
  padding-top: 16px; max-width: 82ch; }
a.back { color: var(--accent); font-weight: 600; text-decoration: none; }
a.back:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <div class="brand">GlobalLogic</div>
  <div class="sub">Delivery Intelligence</div>
  <div class="rule"></div>
</header>
<main>
${body}
</main>
</body>
</html>
`;

const cards = PAGES.map(([file, title, route, desc]) => `    <li class="card"><a href="${route}">
      <span class="card-title">${title}</span>
      <div class="card-desc">${desc}</div>
      <div class="card-route">${route}</div>
    </a></li>`).join('\n');

writeFileSync(join(OUT, 'index.html'), SHELL(
  'GlobalLogic Delivery Intelligence — Synthetic Executive POC',
  `  <span class="banner">● Demo — synthetic data</span>
  <h1>Delivery Intelligence — Synthetic Executive POC</h1>
  <p class="lede">A controlled proof of concept over a <strong>synthetic 91-project portfolio</strong>.
  Every figure, customer, project and person on these pages is generated. Nothing here is live
  customer data, and this is not an enterprise pilot or a production system.</p>
  <ul class="cards">
${cards}
  </ul>
  <footer>
    Fixed-bid population 75 of 91 authorised projects. Thresholds, weights and band edges are
    unvalidated synthetic calibration candidates. The assistant is advisory and read only: it
    explains governed assessments and cannot change a status, a forecast, a plan or a rule.
  </footer>`,
), 'utf8');

writeFileSync(join(OUT, 'not-in-poc.html'), SHELL(
  'Not part of this POC — GlobalLogic Delivery Intelligence',
  `  <span class="banner">● Demo — synthetic data</span>
  <h1>This view is declared, not built</h1>
  <p class="lede">Assurance, Data Quality and Rules &amp; Models are destinations the product
  declares but this proof of concept does not implement. They are shown in the navigation because
  hiding planned scope misrepresents the shape of the product — not because a page exists behind
  them.</p>
  <p><a class="back" href="/portfolio">← Back to the Portfolio Command Center</a></p>`,
), 'utf8');

const files = readdirSync(OUT);
process.stdout.write(`dist built: ${OUT}\n  ${files.length} files: ${files.join(', ')}\n`);
