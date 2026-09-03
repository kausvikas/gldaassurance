/**
 * The Enterprise Command Center — the root executive route.
 *
 * Answers one question: **where should leadership focus?** The forensic 18-column table that used
 * to be the landing page answered a different one — "what does the system know about all 75
 * projects?" — which is an analyst's question, and it pushed the decision off-screen.
 *
 * Composition follows `docs/GLOBALLOGIC_VISUAL_REFERENCE.md`: alternating full-bleed bands, a
 * floating navigation bar, figures in aligned columns rather than card tiles, and orange used once.
 * Every number is a governed fact from the domain; the browser filters and adds them up and does
 * nothing else (client-runtime contract §9).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executiveFacts } from './executive-facts.js';
import { GL_CSS } from './gl-theme.js';
import { GL_RUNTIME } from './gl-runtime.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'command-center.html');

const { facts, view } = executiveFacts();
const v = view as unknown as {
  asOf: string; projectCount: number; authorisedUniverseCount: number;
  whatChanged: { id: string; headline: string; body: string }[];
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const uniq = (key: keyof typeof facts[number]): string[] =>
  [...new Set(facts.map((f) => String(f[key])))].filter((s) => s !== '' && s !== '—').sort();

const NAV = [
  ['Command Center', '/', true],
  ['Projects', '/projects', false],
  ['Forward Risk', '/early-warnings', false],
  ['Interventions', '/interventions', false],
  ['Assistant', '/assistant', false],
] as const;

const select = (dim: string, label: string, options: string[]): string => `
        <label>${esc(label)}
          <select data-dim="${dim}">
            <option value="">All</option>
            ${options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
          </select>
        </label>`;

const QUICK: readonly (readonly [string, string])[] = [
  ['intervene', 'Needs intervention'],
  ['disagree', 'Reported Green — evidence disagrees'],
  ['emerging', 'System Green — emerging risk'],
  ['declining', 'Deteriorating'],
  ['recovering', 'Recovering'],
  ['erosion', 'Margin erosion'],
  ['scope', 'Scope leakage'],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Command Center — GlobalLogic Delivery Intelligence</title>
<style>${GL_CSS}</style>
</head>
<body>
<a class="gl-skip" href="#main">Skip to content</a>

<div class="gl-navwrap">
  <nav class="gl-nav" aria-label="Primary">
    <span class="gl-brand"><b>GlobalLogic</b><span>Delivery Intelligence</span></span>
    <ul class="gl-navlinks">
      ${NAV.map(([label, href, cur]) =>
        `<li><a href="${href}"${cur ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n      ')}
    </ul>
    <span class="gl-navmeta">
      <span>as at 31 Aug 2026</span>
      <span class="gl-demo">DEMO — SYNTHETIC DATA</span>
    </span>
  </nav>
</div>

<main id="main">

  <section class="gl-band gl-band--tint">
    <div class="gl-wrap">
      <p class="gl-eyebrow">Fixed-bid portfolio · Chief Delivery Officer</p>
      <h1 class="gl-lede">Where the portfolio stands, and <em>where to intervene first</em>.</h1>
      <p class="gl-sub">Every figure below is the governed assessment over the projects you are
        authorised for. Filters change the population, not the arithmetic.</p>

      <div class="gl-filters" role="group" aria-label="Portfolio filters">
        ${select('region', 'Geography', uniq('region'))}
        ${select('industry', 'Vertical', uniq('industry'))}
        ${select('account', 'Account', uniq('account'))}
        ${select('system', 'Health', ['GREEN', 'AMBER', 'RED'])}
        ${select('trajectory', 'Trajectory', ['IMPROVING', 'STABLE', 'DETERIORATING', 'RAPIDLY_DETERIORATING'])}
        ${select('outlook60', '60-day outlook', ['GREEN', 'AMBER', 'RED'])}
        <button type="button" class="gl-reset" id="gl-reset">Reset all</button>
      </div>
      <div class="gl-quick" role="group" aria-label="Quick views">
        ${QUICK.map(([k, label]) =>
          `<button type="button" data-quick="${k}" aria-pressed="false">${esc(label)}</button>`).join('\n        ')}
      </div>
      <p class="gl-scope" id="gl-scopeline" aria-live="polite"></p>

      <dl class="gl-figs">
        <div class="gl-fig"><dt>Contract value</dt><dd id="gl-tcv">—</dd>
          <div class="gl-vs"><span id="gl-n">—</span> projects</div></div>
        <div class="gl-fig"><dt>Forecast margin</dt><dd id="gl-fcst">—</dd>
          <div class="gl-vs">against <span id="gl-sold">—</span> sold</div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd id="gl-var">—</dd>
          <div class="gl-vs">gross margin exposed</div></div>
        <div class="gl-fig"><dt>Needs intervention</dt><dd id="gl-act">—</dd>
          <div class="gl-vs">projects awaiting a decision</div></div>
      </dl>
    </div>
  </section>

  <section class="gl-band gl-band--white">
    <div class="gl-wrap">
      <h2 class="gl-h2">Current health, by count and by economic weight</h2>
      <p class="gl-note">A portfolio can look healthy by project count while most of its contract
        value sits in the projects that are not. Both readings are shown because only one of them
        pays.</p>
      <div class="gl-split">
        <div class="gl-meter">
          <h3>By project count</h3>
          <div class="gl-bar" role="img" aria-label="Health by project count">
            <span class="g" id="gl-count-g"></span><span class="a" id="gl-count-a"></span><span class="r" id="gl-count-r"></span>
          </div>
          <p class="gl-legend">
            <span><span class="gl-rag gl-rag--GREEN">GREEN</span> <b id="gl-count-legend-g">—</b></span>
            <span><span class="gl-rag gl-rag--AMBER">AMBER</span> <b id="gl-count-legend-a">—</b></span>
            <span><span class="gl-rag gl-rag--RED">RED</span> <b id="gl-count-legend-r">—</b></span>
          </p>
        </div>
        <div class="gl-meter">
          <h3>By contract value</h3>
          <div class="gl-bar" role="img" aria-label="Health by contract value">
            <span class="g" id="gl-weight-g"></span><span class="a" id="gl-weight-a"></span><span class="r" id="gl-weight-r"></span>
          </div>
          <p class="gl-legend">
            <span><span class="gl-rag gl-rag--GREEN">GREEN</span> <b id="gl-weight-legend-g">—</b></span>
            <span><span class="gl-rag gl-rag--AMBER">AMBER</span> <b id="gl-weight-legend-a">—</b></span>
            <span><span class="gl-rag gl-rag--RED">RED</span> <b id="gl-weight-legend-r">—</b></span>
          </p>
        </div>
      </div>
    </div>
  </section>

  <section class="gl-band gl-band--tint">
    <div class="gl-wrap">
      <h2 class="gl-h2">Green projects requiring attention</h2>
      <p class="gl-note">Two different findings, counted apart. One is a disagreement about today;
        the other is a warning about what is coming. They are not exclusive — a project reported
        Green, assessed Green and deteriorating satisfies both — so <b id="gl-both">—</b> appear in
        both columns and the two numbers must not be added.</p>
      <div class="gl-split">
        <div>
          <p class="gl-eyebrow" style="margin-top:26px">Reported Green — evidence disagrees</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-disagree">—</p>
          <p class="gl-note">Delivery management reports these Green for the period. The governed
            assessment of current evidence does not agree. Nobody is necessarily wrong — reporting
            runs on a cycle and evidence does not — but the gap is the finding.</p>
        </div>
        <div>
          <p class="gl-eyebrow" style="margin-top:26px">System Green — emerging risk</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-emerging">—</p>
          <p class="gl-note">Healthy on today's evidence, with a governed 30- or 60-day outlook that
            turns. Nothing has failed yet, which is exactly why these are worth an hour now.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="gl-band gl-band--white">
    <div class="gl-wrap">
      <h2 class="gl-h2">Where the portfolio is heading</h2>
      <p class="gl-note">The governed outlook moves a project's band by trajectory and the number of
        signals moving adversely at once. These are rule outputs, not probabilities — nothing here is
        trained, fitted or sampled.</p>
      <div class="gl-flow">
        <div><h3>Today</h3>
          <p style="font-size:38px;font-weight:600;letter-spacing:-.02em" id="gl-today">—</p>
          <p class="gl-note" style="margin-top:8px">Projects the evidence assesses Amber or Red
            right now. The two columns beside this are what happens next if nothing changes.</p></div>
        <div><h3>Movement to 60 days</h3>
          <ul class="gl-moves" id="gl-moves"></ul></div>
        <div><h3>Recovering</h3>
          <p style="font-size:38px;font-weight:600;letter-spacing:-.02em" id="gl-improving">—</p>
          <p class="gl-note">Projects whose evidence is improving across successive observations —
            not a label, a trend. A product that only finds failure is incomplete.</p></div>
      </div>
    </div>
  </section>

  <section class="gl-band gl-band--tint">
    <div class="gl-wrap">
      <h2 class="gl-h2">Where intervention still changes the outcome</h2>
      <p class="gl-note">Ordered by the governed intervention ranking, which is not "most Red first".
        A loss already crystallised may need oversight; it is not necessarily where an hour of
        executive attention pays best.</p>
      <div class="gl-tablewrap">
        <table class="gl-t">
          <thead><tr>
            <th class="gl-sticky">Project</th><th>Reported</th><th>Assessed</th><th>Trajectory</th>
            <th>60-day</th><th class="num">Margin at risk</th><th>Time to act</th><th>Executive action</th>
          </tr></thead>
          <tbody id="gl-queue-body"></tbody>
        </table>
      </div>
      <p class="gl-note" style="margin-top:18px"><a class="gl-arrow" href="/projects">View all projects →</a></p>
    </div>
  </section>

  <section class="gl-band gl-band--white">
    <div class="gl-wrap">
      <h2 class="gl-h2">Where the same problem is repeating</h2>
      <p class="gl-note">Governed drivers across the selected population, by the margin they put at
        risk. Concentration tells you where to look; it does not reduce the exposure — correlation
        does not net off, only allocation evidence does.</p>
      <ul class="gl-list" id="gl-drivers"></ul>
      <p class="gl-note" style="margin-top:22px">Scope delivered without commercial cover across
        <b id="gl-scopecount">—</b> projects, worth <b id="gl-scope">—</b>.</p>
    </div>
  </section>

  <section class="gl-band gl-band--tint">
    <div class="gl-wrap">
      <h2 class="gl-h2">What changed</h2>
      <ul class="gl-list">
        ${v.whatChanged.length === 0
          ? '<li class="gl-empty">No comparison evidence is available for this period.</li>'
          : v.whatChanged.map((c) =>
            `<li><span class="v"><b>${esc(c.headline)}</b><br>${esc(c.body)}</span></li>`).join('\n        ')}
      </ul>
    </div>
  </section>

  <footer class="gl-foot"><div class="gl-wrap">
    <p><b>Synthetic demonstration data.</b> This public proof of concept renders representative
      executive views over a generated portfolio. Production identity, authentication, authorization
      and enterprise integrations are not enabled in this demonstration, and static access to this
      page does not exercise them.</p>
  </div></footer>
</main>

<script type="application/json" id="gl-facts">${JSON.stringify(facts).replace(/</g, '\\u003c')}</script>
<script>${GL_RUNTIME}</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
process.stdout.write(`command center written: ${OUT} (${String(facts.length)} projects)\n`);
