/**
 * Builds every primary product route through the one canonical shell.
 *
 * One script, one shell, one navigation, one filter vocabulary. Routes used to be produced by six
 * independent scripts with their own chrome, which is how the product came to have two different
 * user interfaces reachable from the same menu.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executiveFacts, type ExecutiveFact } from './executive-facts.js';
import { GL_RUNTIME } from './gl-runtime.js';
import { shell, filterBar, esc, executiveText, type Area } from './gl-shell.js';
import { projectExecutiveHealthFor } from '../assessment/project-health-adapter.js';
import { GL_ACCESS } from './gl-access.js';
import { GL_ASSISTANT_RUNTIME } from './gl-assistant.js';
import { GL_UPLOAD_RUNTIME } from './gl-upload.js';
import {
  authorityTable, buildKnowledge, conflictTable, quarantineTable, sourcesTable, verificationTable,
} from './build-knowledge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'docs', 'design', 'app');

const { facts, view, portfolio } = executiveFacts();
const v = view as unknown as { whatChanged: { headline: string; body: string }[] };
const FACTS = JSON.stringify(facts);

const uniq = (k: keyof ExecutiveFact): string[] =>
  [...new Set(facts.map((f) => String(f[k])))].filter((s) => s !== '' && s !== '—').sort();

const DIMS = [
  { id: 'region', label: 'Geography', options: uniq('region') },
  { id: 'industry', label: 'Vertical', options: uniq('industry') },
  { id: 'account', label: 'Account', options: uniq('account') },
  { id: 'system', label: 'Health', options: ['GREEN', 'AMBER', 'RED'] },
  { id: 'trajectory', label: 'Trajectory', options: ['IMPROVING', 'STABLE', 'DETERIORATING', 'RAPIDLY_DETERIORATING'] },
  { id: 'outlook60', label: '60-day outlook', options: ['GREEN', 'AMBER', 'RED'] },
];

const band = (tone: 'white' | 'tint', inner: string): string =>
  `  <section class="gl-band gl-band--${tone}"><div class="gl-wrap">${inner}</div></section>`;

const page = (title: string, active: Area, body: string, context?: string): string =>
  shell({ title, active, body, facts: FACTS, runtime: GL_RUNTIME, ...(context === undefined ? {} : { context }) });

// ---------------------------------------------------------------- command centre ----
const commandCenter = page('Command Center', 'command-center', [
  band('tint', `
      <p class="gl-eyebrow" id="gl-lens-eyebrow">Fixed-bid portfolio · Chief Delivery Officer</p>
      <h1 class="gl-lede" id="gl-lens-h1">Where the portfolio stands, and <em>where to intervene first</em>.</h1>
      <p class="gl-sub" id="gl-lens-lead">Every figure below is the governed assessment over the
        projects you are authorised for. Filters change the population, not the arithmetic.</p>
      <!--
        The methodology note is real and it is not the first thing a CDO needs.

        It occupied four lines above the fold on every visit, pushing the economic consequence below
        it. Behind a disclosure it is one line until someone wants it, which is the right ratio for a
        statement that changes on no schedule and that a reader needs exactly once.
      -->
      <details class="gl-method"><summary>How these figures are calculated</summary>
        <p class="gl-note" style="max-width:74ch">Portfolio margin is calculated from aggregate
        forecast revenue and aggregate cost at completion — not as an average of project margins,
        which would let small projects move a portfolio figure. Margin at risk is the sum of each
        project's exposure; it does not net off risks that share a root cause.</p></details>
      ${filterBar(DIMS)}
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Contract value</dt><dd id="gl-tcv">—</dd>
          <div class="gl-vs"><span id="gl-n">—</span> projects</div></div>
        <div class="gl-fig"><dt>Forecast margin</dt><dd id="gl-fcst">—</dd>
          <div class="gl-vs">against <span id="gl-sold">—</span> sold · portfolio aggregate</div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd id="gl-var">—</dd>
          <div class="gl-vs">sum of project exposure</div></div>
        <div class="gl-fig"><dt>Needs intervention</dt><dd id="gl-act">—</dd>
          <div class="gl-vs">projects awaiting a decision</div></div>
      </dl>`),
  band('white', `
      <div data-section="health">
      <h2 class="gl-h2">Current health, by count and by economic weight</h2>
      <p class="gl-note">A portfolio can look healthy by project count while most of its contract
        value sits in the projects that are not. Both readings are shown because only one of them pays.</p>
      <div class="gl-split">
        <div class="gl-meter"><h3>By project count</h3>
          <div class="gl-bar" role="img" aria-label="Health by project count">
            <span class="g" id="gl-count-g"></span><span class="a" id="gl-count-a"></span><span class="r" id="gl-count-r"></span></div>
          <p class="gl-legend">
            <span><span class="gl-rag gl-rag--GREEN">GREEN</span> <b id="gl-count-legend-g">—</b></span>
            <span><span class="gl-rag gl-rag--AMBER">AMBER</span> <b id="gl-count-legend-a">—</b></span>
            <span><span class="gl-rag gl-rag--RED">RED</span> <b id="gl-count-legend-r">—</b></span></p></div>
        <div class="gl-meter"><h3>By contract value</h3>
          <div class="gl-bar" role="img" aria-label="Health by contract value">
            <span class="g" id="gl-weight-g"></span><span class="a" id="gl-weight-a"></span><span class="r" id="gl-weight-r"></span></div>
          <p class="gl-legend">
            <span><span class="gl-rag gl-rag--GREEN">GREEN</span> <b id="gl-weight-legend-g">—</b></span>
            <span><span class="gl-rag gl-rag--AMBER">AMBER</span> <b id="gl-weight-legend-a">—</b></span>
            <span><span class="gl-rag gl-rag--RED">RED</span> <b id="gl-weight-legend-r">—</b></span></p></div>
      </div></div>`),
  band('tint', `
      <div data-section="green">
      <h2 class="gl-h2">Green projects requiring attention</h2>
      <p class="gl-note">Two findings, counted apart because they mean different things. One is a
        disagreement about today; the other is a warning about what is coming. They cannot overlap:
        the first requires the assessment to differ from the report, the second requires it to agree.
        A project the system also calls Green is never described as evidence disagreeing.</p>
      <div class="gl-split">
        <div data-count="gl-disagree"
          data-zero="No project in this view is reported Green while the evidence disagrees.">
          <p class="gl-eyebrow" style="margin-top:26px">Reported Green — evidence disagrees</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-disagree">—</p>
          <p class="gl-note" data-when="nonzero">Delivery management reports these Green for the
            period; the governed assessment of current evidence says Amber or Red. Nobody is
            necessarily wrong — reporting runs on a cycle and evidence does not — but the gap is the
            finding.</p>
          <p class="gl-note" style="margin-top:12px" data-when="nonzero"><a class="gl-arrow" href="/projects?view=disagree">See these projects →</a></p></div>
        <div data-count="gl-emerging"
          data-zero="None of these is System Green. Every one is a live disagreement about today rather than a warning about what is coming.">
          <p class="gl-eyebrow" style="margin-top:26px">System Green — emerging risk</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-emerging">—</p>
          <p class="gl-note" data-when="nonzero">Healthy on the evidence today, with a governed 30-
            or 60-day outlook that turns. Nothing has failed yet, which is exactly why these are
            worth an hour now.</p>
          <p class="gl-note" style="margin-top:12px" data-when="nonzero"><a class="gl-arrow" href="/projects?view=emerging">See these projects →</a></p></div>
      </div></div>`),
  band('white', `
      <div data-section="heading">
      <h2 class="gl-h2">Where the portfolio is heading</h2>
      <p class="gl-note">The governed outlook moves a band by trajectory and the number of signals
        moving adversely at once. Rule outputs, not probabilities — nothing here is trained, fitted
        or sampled.</p>
      <div class="gl-flow">
        <div><h3>Today</h3><p style="font-size:38px;font-weight:600;letter-spacing:-.02em" id="gl-today">—</p>
          <p class="gl-note" style="margin-top:8px">Projects the evidence assesses Amber or Red right now.</p></div>
        <div><h3>Movement to 60 days</h3><ul class="gl-moves" id="gl-moves"></ul></div>
        <div><h3>Recovering</h3><p style="font-size:38px;font-weight:600;letter-spacing:-.02em" id="gl-improving">—</p>
          <p class="gl-note">Improving across successive observations — a trend, not a label.</p>
          <p class="gl-note" style="margin-top:10px"><a class="gl-arrow" href="/interventions?view=recovering">Inspect recovery →</a></p></div>
      </div></div>`),
  band('tint', `
      <div data-section="queue">
      <h2 class="gl-h2">Where intervention still changes the outcome</h2>
      <p class="gl-note">Ordered by the governed intervention ranking, which is not "most Red first".
        A loss already crystallised may need oversight; it is not necessarily where an hour of
        executive attention pays best.</p>
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Reported</th><th>Assessed</th><th>Trajectory</th>
        <th>60-day</th><th class="num">Margin at risk</th><th>Time to act</th><th>Executive action</th>
      </tr></thead><tbody id="gl-queue-body"></tbody></table></div>
      <p class="gl-note" style="margin-top:18px"><a class="gl-arrow" href="/interventions">Full intervention and recovery view →</a></p></div>`),
  band('white', `
      <div data-section="drivers">
      <h2 class="gl-h2">Where the same problem is repeating</h2>
      <p class="gl-note">Governed drivers across the selected population, by the margin they put at
        risk. Concentration tells you where to look; it does not reduce the exposure — correlation
        does not net off, only allocation evidence does.</p>
      <ul class="gl-list" id="gl-drivers"></ul>
      <p class="gl-note" style="margin-top:22px" id="gl-scopeline2">Scope delivered without
        commercial cover across <b id="gl-scopecount">—</b> projects, worth <b id="gl-scope">—</b>.</p></div>`),
  band('tint', `
      <h2 class="gl-h2">What changed</h2>
      <p class="gl-note">Changes shown from governed financial history and formal reported-status
        history. What is not yet reconstructable is named in the list rather than left to inference.</p>
      <!--
        The first four are the ones a CDO acts on; the rest are the audit trail behind them. Showing
        all nine put 656px of list at the foot of the page, most of it read once.
      -->
      <ul class="gl-list">
        ${whatChanged(0, 4)}
      </ul>
      <details class="gl-method" style="margin-top:18px">
        <summary>The rest of the governed change record</summary>
        <ul class="gl-list" style="margin-top:14px">${whatChanged(4)}</ul>
      </details>`),
].join('\n'));


/*
 * Material movement between the last two governed period ends.
 *
 * Every figure is a difference between two runs of the same engine, never a client-side derivation
 * and never a comparison invented where history does not reach. "No prior period is loaded" was an
 * honest message about a comparison the surface had not been built to make; it is not an acceptable
 * answer for a product whose second executive question is "what changed since my last review".
 */
function whatChanged(from = 0, to?: number): string {
  const withHistory = facts.filter((f) => f.priorForecastGm !== null && f.forecastGmNow !== null);
  const money = (n: number): string => {
    const sign = n < 0 ? '\u2212' : '+';
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
    if (a >= 1_000) return `${sign}$${Math.round(a / 1_000).toLocaleString('en-GB')}K`;
    return `${sign}$${Math.round(a).toLocaleString('en-GB')}`;
  };
  const item = (k: string, label: string, detail: string): string =>
    `<li><span class="k">${esc(k)}</span><span class="v"><b>${esc(label)}</b> · ${esc(detail)}</span></li>`;
  const unavailable = (label: string, why: string): string =>
    `<li><span class="k" style="color:var(--steel-50);font-size:15px">—</span>` +
    `<span class="v"><b>${esc(label)}</b> · ${esc(why)}</span></li>`;

  const ORDER: Readonly<Record<string, number>> = { GREEN: 0, AMBER: 1, RED: 2 };
  const worse = (from: string, to: string): boolean => (ORDER[to] ?? 0) > (ORDER[from] ?? 0);

  if (withHistory.length === 0) {
    return unavailable('No governed prior period',
      'The economics engine has not been re-run at an earlier period end for any project in scope.');
  }

  const gmDelta = withHistory.reduce((t, f) => t + ((f.forecastGmNow as number) - (f.priorForecastGm as number)), 0);
  const fell = withHistory.filter((f) => (f.forecastGmNow as number) < (f.priorForecastGm as number));
  const rose = withHistory.filter((f) => (f.forecastGmNow as number) > (f.priorForecastGm as number));
  const eacUp = withHistory.filter((f) =>
    f.priorEac !== null && f.eacNow !== null && (f.eacNow - f.priorEac) > Math.abs(f.priorEac) * 0.005);
  const reportedMoves = facts.filter((f) => f.priorReported !== null && f.priorReported !== f.reported);
  const intoLoss = withHistory.filter((f) =>
    (f.priorForecastGm as number) >= 0 && (f.forecastGmNow as number) < 0);
  const outOfLoss = withHistory.filter((f) =>
    (f.priorForecastGm as number) < 0 && (f.forecastGmNow as number) >= 0);

  const rows = [
    item(money(gmDelta), 'Forecast margin movement',
      `across ${String(withHistory.length)} projects with a governed prior period`),
    item(String(fell.length), 'Projects whose forecast margin fell',
      fell.length === 0 ? 'none in this period' : `largest: ${esc(fell.sort((a, b) =>
        ((a.forecastGmNow as number) - (a.priorForecastGm as number))
        - ((b.forecastGmNow as number) - (b.priorForecastGm as number)))[0]?.name ?? '')}`),
    item(String(rose.length), 'Projects whose forecast margin improved',
      rose.length === 0 ? 'none in this period' : `largest: ${esc(rose.sort((a, b) =>
        ((b.forecastGmNow as number) - (b.priorForecastGm as number))
        - ((a.forecastGmNow as number) - (a.priorForecastGm as number)))[0]?.name ?? '')}`),
    item(String(eacUp.length), 'Material cost-at-completion revisions',
      'estimate raised by more than half a point of the prior figure'),
    intoLoss.length === 0 && outOfLoss.length === 0
      ? item('0', 'Contract-loss conditions created or cleared', 'no project crossed zero forecast margin')
      : item(`${String(intoLoss.length)}/${String(outOfLoss.length)}`, 'Contract-loss conditions created / cleared',
        'projects crossing zero forecast margin in each direction'),
    reportedMoves.length === 0
      ? item('0', 'Reported status changes', 'no project changed its reported band this cycle')
      : item(String(reportedMoves.length), 'Reported status changes',
        `${String(reportedMoves.filter((f) => worse(f.priorReported as string, f.reported)).length)} downgraded, ` +
        `${String(reportedMoves.filter((f) => !worse(f.priorReported as string, f.reported)).length)} upgraded by delivery management`),
    unavailable('System health band, milestone risk and acceptance movement',
      'the portfolio stores no per-period system band, milestone forecast snapshot or acceptance state, so these cannot be reconstructed without re-running the engines at an earlier as-of — which this build does not do'),
  ];
  return rows.slice(from, to).join('\n        ');
}

// ---------------------------------------------------------------- projects ----
const projects = page('Projects', 'projects', [
  band('tint', `
      <p class="gl-eyebrow">Fixed-bid portfolio</p>
      <h1 class="gl-lede">Every project, in <em>one executive reading</em>.</h1>
      <p class="gl-sub">Reported status beside the assessed one, how each is performing against
        commitment, where it is heading, and what it puts at risk.</p>
      ${filterBar(DIMS)}
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Projects</dt><dd id="gl-n">—</dd><div class="gl-vs">in this view</div></div>
        <div class="gl-fig"><dt>Contract value</dt><dd id="gl-tcv">—</dd><div class="gl-vs">total</div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd id="gl-var">—</dd><div class="gl-vs">gross margin exposed</div></div>
        <div class="gl-fig"><dt>Needs intervention</dt><dd id="gl-act">—</dd><div class="gl-vs">awaiting a decision</div></div>
      </dl>`),
  band('white', `
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Reported</th><th>Assessed</th><th>Performance</th>
        <th>Trajectory</th><th>30-day</th><th>60-day</th>
        <th class="num">Forecast GM</th><th class="num">Margin at risk</th><th>Action</th>
      </tr></thead><tbody id="gl-all-body"></tbody></table></div>`),
].join('\n'));

// ---------------------------------------------------------------- forward risk ----
const forwardRisk = page('Forward Risk', 'forward-risk', [
  band('tint', `
      <p class="gl-eyebrow">Deterministic governed outlook</p>
      <h1 class="gl-lede">Where the portfolio will be in <em>30 and 60 days</em>.</h1>
      <p class="gl-sub">Each band is a rule output projected from the current assessment by
        trajectory and adverse-signal confluence. No probability is stated because none is computed.</p>
      ${filterBar(DIMS)}`),
  band('white', `
      <h2 class="gl-h2">Health across the three horizons</h2>
      <div class="gl-flow">
        <div><h3>Today</h3><div class="gl-bar" role="img" aria-label="Health today">
          <span class="g" id="gl-h0-g"></span><span class="a" id="gl-h0-a"></span><span class="r" id="gl-h0-r"></span></div>
          <p class="gl-legend"><span>Green <b id="gl-h0-legend-g">—</b></span><span>Amber <b id="gl-h0-legend-a">—</b></span><span>Red <b id="gl-h0-legend-r">—</b></span></p></div>
        <div><h3>At 30 days</h3><div class="gl-bar" role="img" aria-label="Health at 30 days">
          <span class="g" id="gl-h30-g"></span><span class="a" id="gl-h30-a"></span><span class="r" id="gl-h30-r"></span></div>
          <p class="gl-legend"><span>Green <b id="gl-h30-legend-g">—</b></span><span>Amber <b id="gl-h30-legend-a">—</b></span><span>Red <b id="gl-h30-legend-r">—</b></span></p></div>
        <div><h3>At 60 days</h3><div class="gl-bar" role="img" aria-label="Health at 60 days">
          <span class="g" id="gl-h60-g"></span><span class="a" id="gl-h60-a"></span><span class="r" id="gl-h60-r"></span></div>
          <p class="gl-legend"><span>Green <b id="gl-h60-legend-g">—</b></span><span>Amber <b id="gl-h60-legend-a">—</b></span><span>Red <b id="gl-h60-legend-r">—</b></span></p></div>
      </div>`),
  band('tint', `
      <h2 class="gl-h2">Which projects move, and what moves with them</h2>
      <p class="gl-note">Governed band transitions between today and 60 days, with the contract value
        travelling in each direction.</p>
      <ul class="gl-moves" id="gl-moves" style="margin-top:24px"></ul>`),
  band('white', `
      <h2 class="gl-h2">Healthy today, weaker ahead</h2>
      <p class="gl-note">The early-warning population: assessed Green now, with a governed outlook
        that turns inside 60 days. <b id="gl-emerging">—</b> projects in this view.</p>
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Assessed</th><th>Trajectory</th><th>30-day</th><th>60-day</th>
        <th class="num">Margin at risk</th><th>Time to act</th>
      </tr></thead><tbody id="gl-emerging-body"></tbody></table></div>`),
].join('\n'));

// ---------------------------------------------------------------- interventions ----
const interventions = page('Interventions', 'interventions', [
  band('tint', `
      <p class="gl-eyebrow">Intervention and recovery</p>
      <h1 class="gl-lede">Where leadership action <em>still changes the outcome</em>.</h1>
      <p class="gl-sub">Ordered by the governed intervention ranking. Severity is one tier of seven —
        a large loss already taken is not automatically where an hour of attention pays best.</p>
      ${filterBar(DIMS)}
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Awaiting a decision</dt><dd id="gl-act">—</dd><div class="gl-vs">projects</div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd id="gl-var">—</dd><div class="gl-vs">across this view</div></div>
        <div class="gl-fig"><dt>Recovering</dt><dd id="gl-improving">—</dd><div class="gl-vs">improving on evidence</div></div>
        <div class="gl-fig"><dt>Scope uncovered</dt><dd id="gl-scope">—</dd><div class="gl-vs">delivered without a change request</div></div>
      </dl>`),
  band('white', `
      <h2 class="gl-h2">Intervention queue</h2>
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Condition</th><th class="num">Margin at risk</th>
        <th>Trajectory</th><th>Time to act</th><th>Why it ranks here</th><th>Executive action</th>
      </tr></thead><tbody id="gl-int-body"></tbody></table></div>`),
  band('tint', `
      <h2 class="gl-h2">Recovery</h2>
      <p class="gl-note">Projects improving across successive observations. What improved is named
        from the governed trajectory signals, not summarised into a score — a system that only finds
        deterioration is incomplete, and a recovery an executive cannot inspect is only a label.
        Margin movement is the change between the last two governed period ends.</p>
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Today → 60-day</th><th>What improved</th>
        <th class="num">Margin movement</th><th class="num">Exposure remaining</th>
        <th>Is recovery sufficient?</th>
      </tr></thead><tbody id="gl-rec-body"></tbody></table></div>`),
].join('\n'));

// ---------------------------------------------------------------- assistant ----
/*
 * The Assistant workspace, and Knowledge & Connections beneath it.
 *
 * The previous build shipped six hard-coded question-and-answer pairs. That is a brochure for a
 * query engine rather than a query engine, and §3 prohibits it by name. This page has a text field
 * and calls the trusted runtime; when the runtime is not reachable — which is the case on the static
 * public preview — it shows a **recorded run of the real engine**, captured at build time and
 * labelled as a recording.
 */
const knowledge = await buildKnowledge();
const RECORDED = JSON.stringify(knowledge.recorded);

const SUGGESTIONS: readonly string[] = [
  'Which Green projects should I worry about over the next 60 days?',
  'What changed since the previous review?',
  'Where is margin erosion concentrated?',
  'Which projects are recovering?',
  'What is the portfolio forecast margin across the whole portfolio?',
];

const assistantBody = [
  band('tint', `
      <p class="gl-eyebrow">Governed executive query · advisory and read only</p>
      <h1 class="gl-lede">Ask the portfolio a question, and <em>see what answers it</em>.</h1>
      <p class="gl-sub">Type a question in your own words. It is resolved into a governed query plan
        over the same engines every screen reads, and the plan is shown above the answer so you can
        see how it was understood.</p>
      <p class="gl-note" style="margin-top:14px;max-width:76ch">A language model may write the
        sentences. It never produces a figure, chooses what is retrieved, or decides a status —
        switch it off and the same answer arrives from the governed composer, which is what the
        badge under each answer records.</p>
      <div class="gl-ask">
        <form id="gl-askform">
          <label for="gl-q">Ask Delivery Intelligence
            <input type="text" id="gl-q" name="q" autocomplete="off" spellcheck="false"
              placeholder="Which projects need leadership attention this week?">
          </label>
          <button type="submit" id="gl-send">Ask</button>
        </form>
        <div class="gl-suggest">
          ${SUGGESTIONS.map((s) => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join('\n          ')}
        </div>
        <p style="margin-top:14px"><span class="gl-badge" id="gl-conn" role="status">Looking for the trusted runtime…</span></p>
      </div>`),
  `  <section class="gl-band gl-band--white"><div class="gl-wrap">
      <div id="gl-out" aria-live="polite" aria-atomic="false"></div>
    </div></section>`,
  band('tint', `
      <h2 class="gl-h2">What this assistant will not do</h2>
      <ul class="gl-list" style="max-width:82ch">
        <li><span class="v"><b>It will not state a probability.</b> Nothing here is trained, fitted or
          sampled; the 30- and 60-day outlooks are governed rules firing against stated thresholds.</span></li>
        <li><span class="v"><b>It will not change anything.</b> There is no write tool, and the
          connector interface has no write method to withhold.</span></li>
        <li><span class="v"><b>It will not calculate.</b> Every figure comes from the governed
          services; the model reuses figures it is given and its output is checked against them
          before you see it.</span></li>
        <li><span class="v"><b>It will not answer beyond the evidence.</b> Where part of a question
          is unsupported, the answer says which part rather than estimating it.</span></li>
      </ul>
      <p class="gl-note" style="margin-top:20px"><a class="gl-arrow" href="/assistant/knowledge">Knowledge &amp; Connections →</a></p>`),
].join('\n');

const assistant = page('Assistant', 'assistant', assistantBody);

// ---------------------------------------------------------------- knowledge ----
const addKnowledge = band('white', `
      <h2 class="gl-h2">Add knowledge</h2>
      <p class="gl-sub">A workbook or a delimited file, parsed on the server and mapped to governed
        concepts by you. Nothing is guessed: a suggestion marked <em>likely</em> is left unselected,
        because accepting it should be something you did rather than something you failed to undo.</p>
      <p class="gl-note" style="margin-top:12px;max-width:78ch">Every accepted record enters the
        sandbox data context as supplemental evidence. There is no control on this screen that raises
        it, because there is no path in the product that raises it — an uploaded extract is one
        person's export, and the executive figures continue to come from the governed portfolio.</p>
      <div class="gl-upload" id="gl-upload">
        <ol class="gl-steps" id="gl-steps" aria-label="Ingestion steps"></ol>
        <label class="gl-drop" id="gl-drop" for="gl-file">
          <b>Choose a data file</b>
          <span>Workbook or delimited text. The file's own bytes decide how it is read, not its name.</span>
          <input type="file" id="gl-file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        </label>
        <p style="margin-top:14px"><span class="gl-badge" id="gl-upnote" role="status">Looking for the trusted runtime…</span></p>
        <div id="gl-stage" aria-live="polite"></div>
      </div>`);

const knowledgePage = page('Knowledge & Connections', 'assistant', [
  band('tint', `
      <p class="gl-eyebrow">Assistant · Knowledge &amp; Connections</p>
      <h1 class="gl-lede">What this system has been told, and <em>what it did with it</em>.</h1>
      <p class="gl-sub">Adding a document or a data extract does not change the model. It is parsed,
        validated, versioned, indexed and made retrievable — and every one of those steps produces a
        count you can check.</p>
      <p class="gl-note" style="margin-top:14px;max-width:78ch">Nothing added here reaches the
        executive figures. Uploaded material enters a sandbox data context, and this proof of concept
        implements no path that promotes it to canonical. The synthetic portfolio remains the only
        governed source.</p>`),
  addKnowledge,
  band('tint', `
      <h2 class="gl-h2">Sources</h2>
      <p class="gl-sub">Six enterprise connectors are present as clearly-labelled synthetic fixtures.
        A fixture is never shown as a connection: reaching <em>connected and verified</em> requires a
        live endpoint to have answered, and a fixture has none.</p>
      ${sourcesTable(knowledge.registry)}`),
  band('white', `
      <h2 class="gl-h2">Verify knowledge</h2>
      <p class="gl-sub">A successful upload is not evidence that anything was learned. A source counts
        as grounded only when it has been ingested, is retrievable, <em>and</em> an answer has actually
        used it — reported here as three separate facts, because they disagree more often than not.</p>
      ${verificationTable(knowledge)}`),
  band('tint', `
      <h2 class="gl-h2">Source conflicts</h2>
      <p class="gl-sub">The same project, the same concept, the same period, materially different
        values. The higher authority governs and the disagreement is shown beside it — never merged,
        never averaged, and never resolved by whichever source arrived last.</p>
      <p class="gl-note" style="margin-bottom:6px">Materiality is half a percentage point with an
        absolute floor, so rounding noise does not fill this register and bury the real ones. Both
        thresholds are POC configuration.</p>
      ${conflictTable(knowledge.registry)}`),
  band('white', `
      <h2 class="gl-h2">Quarantine</h2>
      <p class="gl-sub">Records that failed validation. They keep their values so they can be
        inspected, they carry the reason a person can act on, and they contribute to no answer.</p>
      ${quarantineTable(knowledge.registry)}`),
  band('tint', `
      <h2 class="gl-h2">Source authority</h2>
      <p class="gl-sub">Authority is declared per canonical concept, not per system: a finance system
        is authoritative for cost and merely supplemental for delivery progress, even though it stores
        a percentage. Where two sources disagree, the higher authority governs and the disagreement is
        disclosed rather than merged.</p>
      <p class="gl-note" style="margin-bottom:6px"><b>POC configuration — not an approved GlobalLogic
        data-ownership policy.</b></p>
      ${authorityTable(knowledge.registry)}`),
].join('\n'));

// ---------------------------------------------------------------- project pages ----
function projectPage(f: ExecutiveFact): string {
  const h = projectExecutiveHealthFor(portfolio, f.id) as unknown as {
    summary: { status: string; cause: string; outlook: string; economicImpact: string; action: string };
    progressBurn: {
      plannedCompletion: string; actualCompletion: string; costConsumed: string; narrative: string;
      progressVariance: string; requiredVelocityRatio: string | null;
      requiredVelocityUnavailable: string | null;
    };
    financial: { label: string; value: string }[];
    confidence: { dataBand: string; forecastBand: string; greenClaimHeadline: string };
  };
  const fin = (label: string): string =>
    h.financial.find((x) => x.label === label)?.value ?? '—';
  const S = h.summary;

  const context = `<div class="gl-band gl-band--tint" style="padding:26px 0 0"><div class="gl-wrap">
    <p class="gl-note" style="font-size:13.5px"><a class="gl-arrow" href="/projects" data-carry>← All projects</a></p>
  </div></div>`;

  const body = [
    band('tint', `
      <p class="gl-eyebrow">${esc(f.customer)} · ${esc(f.industry)} · ${esc(f.region)}</p>
      <h1 class="gl-lede" style="max-width:26ch">${esc(f.name)}</h1>
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Reported</dt><dd style="font-size:20px"><span class="gl-rag gl-rag--${f.reported}">${f.reported}</span></dd>
          <div class="gl-vs">delivery management</div></div>
        <div class="gl-fig"><dt>Assessed</dt><dd style="font-size:20px"><span class="gl-rag gl-rag--${f.system}">${f.system}</span></dd>
          <div class="gl-vs">governed evidence</div></div>
        <div class="gl-fig"><dt>Trajectory</dt><dd style="font-size:20px">${esc(word(f.trajectory))}</dd>
          <div class="gl-vs">30-day <span class="gl-rag gl-rag--${f.outlook30}">${f.outlook30}</span> · 60-day <span class="gl-rag gl-rag--${f.outlook60}">${f.outlook60}</span></div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd>${esc(f.gmAtRiskDisplay)}</dd>
          <div class="gl-vs">of ${esc(f.tcvDisplay)} contracted</div></div>
      </dl>`),
    band('white', `
      <h2 class="gl-h2">Why it is in this condition</h2>
      <ul class="gl-list" style="max-width:82ch">
        ${([['Status', statusLine(S.status, S.cause, f)], ['Cause', S.cause], ['Outlook', S.outlook],
            ['Economic impact', S.economicImpact], ['Action', S.action]] as const)
          .filter(([, body]) => body !== undefined && body !== '')
          .map(([label, body]) => `<li><span class="v"><b>${label}</b><br>${esc(executiveText(body))}</span></li>`)
          .join('\n        ')}
      </ul>`),
    /*
     * Two questions, asked separately, because they have different answers.
     *
     * These four figures used to sit in one undifferentiated row under one narrative, and a project
     * could read *"progress is on or ahead of plan and cost is tracking progress. No burn concern is
     * indicated."* while the section above it said *"the plan now needs 4.65× the delivery rate the
     * team has demonstrated"*. A reader has no way to reconcile that, and the natural reading — one
     * of these must be wrong — is the wrong reading. Both are correct.
     *
     * They are correct because they measure different things. Completion-to-date against plan-to-date
     * is a statement about **where the project is now**. Required-over-demonstrated velocity is a
     * statement about **whether the plan that remains is deliverable at the rate so far shown**, and
     * a back-loaded plan can be ahead on the first and alarming on the second at the same time.
     *
     * Measured before writing this: across the portfolio the ratio is not an artefact of being early
     * — projects under 10% complete average 2.99× and projects over 40% average 2.26×, and the
     * highest single ratio (6.13×) belongs to a project 62% complete. It is a real signal, so the
     * page states it as a figure rather than burying it in a sentence.
     */
    band('tint', `
      <h2 class="gl-h2">Performance against commitment</h2>
      <div class="gl-split" style="margin-top:22px">
        <div>
          <p class="gl-eyebrow">Current position</p>
          <dl class="gl-figs" style="margin-top:14px">
            <div class="gl-fig"><dt>Actual completion</dt><dd>${esc(h.progressBurn.actualCompletion)}</dd>
              <div class="gl-vs">plan today ${esc(h.progressBurn.plannedCompletion)} · ${esc(h.progressBurn.progressVariance)}</div></div>
            <div class="gl-fig"><dt>Cost consumed</dt><dd>${esc(h.progressBurn.costConsumed)}</dd>
              <div class="gl-vs">of budget at completion</div></div>
          </dl>
          <p class="gl-note" style="max-width:44ch;margin-top:14px">${esc(executiveText(h.progressBurn.narrative))}</p>
        </div>
        <div>
          <p class="gl-eyebrow">Remaining plan realism</p>
          <dl class="gl-figs" style="margin-top:14px">
            <div class="gl-fig"><dt>Required future delivery rate</dt>
              <dd>${h.progressBurn.requiredVelocityRatio === null
                ? '—' : esc(h.progressBurn.requiredVelocityRatio)}</dd>
              <div class="gl-vs">${h.progressBurn.requiredVelocityRatio === null
                ? esc(h.progressBurn.requiredVelocityUnavailable ?? 'not computable')
                : 'of the rate demonstrated over the governed window'}</div></div>
            <div class="gl-fig"><dt>Scope uncovered</dt><dd>${esc(f.scopeExposureDisplay)}</dd>
              <div class="gl-vs">delivered without a change request</div></div>
          </dl>
          <p class="gl-note" style="max-width:44ch;margin-top:14px">${esc(remainingPlanReading(h.progressBurn))}</p>
        </div>
      </div>`),
    band('white', `
      <h2 class="gl-h2">Economics</h2>
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Sold margin</dt><dd>${esc(fin('Sold GM %'))}</dd></div>
        <div class="gl-fig"><dt>Forecast margin</dt><dd>${esc(fin('Forecast GM %'))}</dd></div>
        <div class="gl-fig"><dt>Risk-adjusted</dt><dd>${esc(fin('Risk-adjusted GM %'))}</dd>
          <div class="gl-vs">scenario, not accounting</div></div>
        <div class="gl-fig"><dt>Cost at completion</dt><dd>${esc(fin('EAC'))}</dd></div>
      </dl>`),
    band('tint', `
      <h2 class="gl-h2">What to do, and how far to trust it</h2>
      <p class="gl-sub" style="max-width:76ch;color:var(--steel-100)">${esc(executiveText(f.action))}</p>
      <p class="gl-note" style="margin-top:16px">${esc(executiveText(f.why))}</p>
      <p class="gl-note" style="margin-top:22px"><b>Evidence.</b> ${esc(h.confidence.greenClaimHeadline)}.
        Data confidence ${esc(h.confidence.dataBand.toLowerCase())}; forecast confidence
        ${esc(h.confidence.forecastBand.toLowerCase())}. Time to act: ${esc(f.timeToAct)}.</p>`),
  ].join('\n');

  return shell({ title: f.name, active: 'projects', body, context });
}

/**
 * What the remaining-plan figure means, in the reader's terms and nobody's more than that.
 *
 * Every branch here is a restatement of two governed figures and their comparison. There is no
 * causal claim — the page does not say *why* the remaining plan is steep, because the engines do not
 * know and inventing a reason would be exactly the fabricated explanation this product refuses
 * elsewhere. What it does say is which of the two readings the reader is looking at, so the pair
 * stops looking like a contradiction.
 */
function remainingPlanReading(pb: {
  requiredVelocityRatio: string | null;
  requiredVelocityUnavailable: string | null;
  progressVariance: string;
}): string {
  if (pb.requiredVelocityRatio === null) {
    return 'The remaining plan cannot be tested against demonstrated delivery here: '
      + `${pb.requiredVelocityUnavailable ?? 'the ratio is not computable'}. `
      + 'That is a gap in the evidence, not a clean bill of health.';
  }
  const ratio = globalThis.Number.parseFloat(pb.requiredVelocityRatio);
  const ahead = pb.progressVariance.trim().startsWith('+');
  if (!globalThis.Number.isFinite(ratio) || ratio <= 1.05) {
    return 'The work outstanding, spread across the weeks that remain, needs no more than the rate '
      + 'this team has already demonstrated.';
  }
  return `${ahead ? 'Ahead today, but the' : 'The'} remaining plan requires a delivery rate `
    + `${pb.requiredVelocityRatio} the one demonstrated over the governed window. `
    + 'Completion against plan measures where the project is; this measures whether what is left is '
    + 'deliverable at the rate so far shown.';
}

/*
 * A status line is never just a colour.
 *
 * The governed summary can be as terse as "RED." on a project whose narrative offers nothing more.
 * That is honest and useless: an executive reading a band with no reason has learned only that
 * something is wrong. Where the assessment carries an explanation, the band is stated with it.
 * Where it genuinely does not, the line says the evidence is insufficient to isolate a driver
 * rather than generating prose to fill the space — unknown is better than fabricated explanation.
 */
function statusLine(status: string, cause: string, f: ExecutiveFact): string {
  const bare = status.replace(/[^A-Za-z]/g, '');
  if (bare.length > 0 && bare.toUpperCase() !== status.replace(/[^A-Za-z]/g, '').toUpperCase()) return status;
  const isBare = /^(RED|AMBER|GREEN)\.?$/i.test(status.trim());
  if (!isBare) return status;
  if (cause.trim() !== '') {
    return `${status.replace(/\.$/, '')}, on the evidence set out below.`;
  }
  return `${status.replace(/\.$/, '')}. The evidence is insufficient to isolate a primary driver; `
    + `${f.gmAtRiskDisplay} of sold margin is exposed.`;
}

/**
 * Adds the Assistant's own runtime and its recorded transcript to the page.
 *
 * Appended rather than merged into the shared runtime because only this route needs it, and a
 * hundred kilobytes of query-workspace JavaScript on the Command Center would be paid for by every
 * reader who never opens the Assistant.
 */
function withAssistantRuntime(html: string): string {
  const recording = `<script type="application/json" id="gl-recorded">${RECORDED.replace(/</g, '\\u003c')}</script>`;
  // The gate first: both scripts call `GLAccess`, and a page that shipped one without the other
  // would ask the runtime for a session it has no way to obtain.
  return html.replace(
    '</body>',
    `${recording}\n<script>${GL_ACCESS}</script>\n<script>${GL_ASSISTANT_RUNTIME}</script>\n</body>`,
  );
}

/** The upload client, on the one route that needs it. */
function withUploadRuntime(html: string): string {
  return html.replace(
    '</body>',
    `<script>${GL_ACCESS}</script>\n<script>${GL_UPLOAD_RUNTIME}</script>\n</body>`,
  );
}

function word(t: string): string {
  return ({ IMPROVING: 'Improving', STABLE: 'Stable', DETERIORATING: 'Deteriorating',
    RAPIDLY_DETERIORATING: 'Deteriorating fast' } as Record<string, string>)[t] ?? t;
}

// ---------------------------------------------------------------- write ----
mkdirSync(join(OUT, 'projects'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), commandCenter, 'utf8');
writeFileSync(join(OUT, 'projects.html'), projects, 'utf8');
writeFileSync(join(OUT, 'forward-risk.html'), forwardRisk, 'utf8');
writeFileSync(join(OUT, 'interventions.html'), interventions, 'utf8');
writeFileSync(join(OUT, 'assistant.html'), withAssistantRuntime(assistant), 'utf8');
mkdirSync(join(OUT, 'assistant'), { recursive: true });
writeFileSync(
  join(OUT, 'assistant', 'knowledge.html'), withUploadRuntime(knowledgePage), 'utf8',
);
for (const f of facts) writeFileSync(join(OUT, 'projects', `${f.id}.html`), projectPage(f), 'utf8');

process.stdout.write(
  `app built: 5 primary routes + Knowledge & Connections + ${String(facts.length)} project pages\n`,
);
