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
      <p class="gl-eyebrow">Fixed-bid portfolio · Chief Delivery Officer</p>
      <h1 class="gl-lede">Where the portfolio stands, and <em>where to intervene first</em>.</h1>
      <p class="gl-sub">Every figure below is the governed assessment over the projects you are
        authorised for. Filters change the population, not the arithmetic.</p>
      ${filterBar(DIMS)}
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Contract value</dt><dd id="gl-tcv">—</dd>
          <div class="gl-vs"><span id="gl-n">—</span> projects</div></div>
        <div class="gl-fig"><dt>Forecast margin</dt><dd id="gl-fcst">—</dd>
          <div class="gl-vs">against <span id="gl-sold">—</span> sold</div></div>
        <div class="gl-fig"><dt>Margin at risk</dt><dd id="gl-var">—</dd>
          <div class="gl-vs">gross margin exposed</div></div>
        <div class="gl-fig"><dt>Needs intervention</dt><dd id="gl-act">—</dd>
          <div class="gl-vs">projects awaiting a decision</div></div>
      </dl>`),
  band('white', `
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
      </div>`),
  band('tint', `
      <h2 class="gl-h2">Green projects requiring attention</h2>
      <p class="gl-note">Two findings, counted apart because they mean different things. One is a
        disagreement about today; the other is a warning about what is coming. They cannot overlap:
        the first requires the assessment to differ from the report, the second requires it to agree.
        A project the system also calls Green is never described as evidence disagreeing.</p>
      <div class="gl-split">
        <div><p class="gl-eyebrow" style="margin-top:26px">Reported Green — evidence disagrees</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-disagree">—</p>
          <p class="gl-note">Delivery management reports these Green for the period; the governed
            assessment of current evidence says Amber or Red. Nobody is necessarily wrong — reporting
            runs on a cycle and evidence does not — but the gap is the finding.</p>
          <p class="gl-note" style="margin-top:12px"><a class="gl-arrow" href="/projects?view=disagree">See these projects →</a></p></div>
        <div><p class="gl-eyebrow" style="margin-top:26px">System Green — emerging risk</p>
          <p style="font-size:44px;font-weight:600;letter-spacing:-.02em" id="gl-emerging">—</p>
          <p class="gl-note">Healthy on today's evidence, with a governed 30- or 60-day outlook that
            turns. Nothing has failed yet, which is exactly why these are worth an hour now.</p>
          <p class="gl-note" style="margin-top:12px"><a class="gl-arrow" href="/projects?view=emerging">See these projects →</a></p></div>
      </div>`),
  band('white', `
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
      </div>`),
  band('tint', `
      <h2 class="gl-h2">Where intervention still changes the outcome</h2>
      <p class="gl-note">Ordered by the governed intervention ranking, which is not "most Red first".
        A loss already crystallised may need oversight; it is not necessarily where an hour of
        executive attention pays best.</p>
      <div class="gl-tablewrap"><table class="gl-t"><thead><tr>
        <th class="gl-sticky">Project</th><th>Reported</th><th>Assessed</th><th>Trajectory</th>
        <th>60-day</th><th class="num">Margin at risk</th><th>Time to act</th><th>Executive action</th>
      </tr></thead><tbody id="gl-queue-body"></tbody></table></div>
      <p class="gl-note" style="margin-top:18px"><a class="gl-arrow" href="/interventions">Full intervention and recovery view →</a></p>`),
  band('white', `
      <h2 class="gl-h2">Where the same problem is repeating</h2>
      <p class="gl-note">Governed drivers across the selected population, by the margin they put at
        risk. Concentration tells you where to look; it does not reduce the exposure — correlation
        does not net off, only allocation evidence does.</p>
      <ul class="gl-list" id="gl-drivers"></ul>
      <p class="gl-note" style="margin-top:22px">Scope delivered without commercial cover across
        <b id="gl-scopecount">—</b> projects, worth <b id="gl-scope">—</b>.</p>`),
  band('tint', `
      <h2 class="gl-h2">What changed</h2>
      <p class="gl-note">Movement between the last two governed period ends, from the economics
        engine re-run at each. Items the available history cannot support are named as unavailable
        rather than left out or filled in.</p>
      <ul class="gl-list">
        ${whatChanged()}
      </ul>`),
].join('\n'));


/*
 * Material movement between the last two governed period ends.
 *
 * Every figure is a difference between two runs of the same engine, never a client-side derivation
 * and never a comparison invented where history does not reach. "No prior period is loaded" was an
 * honest message about a comparison the surface had not been built to make; it is not an acceptable
 * answer for a product whose second executive question is "what changed since my last review".
 */
function whatChanged(): string {
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

  if (withHistory.length === 0) {
    return unavailable('No governed prior period',
      'The economics engine has not been re-run at an earlier period end for any project in scope.');
  }

  const gmDelta = withHistory.reduce((t, f) => t + ((f.forecastGmNow as number) - (f.priorForecastGm as number)), 0);
  const fell = withHistory.filter((f) => (f.forecastGmNow as number) < (f.priorForecastGm as number));
  const rose = withHistory.filter((f) => (f.forecastGmNow as number) > (f.priorForecastGm as number));
  const eacUp = withHistory.filter((f) =>
    f.priorEac !== null && f.eacNow !== null && (f.eacNow - f.priorEac) > Math.abs(f.priorEac) * 0.005);
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
    unavailable('Health band movement, milestone risk and acceptance changes',
      'these need a full prior-period assessment, not only the economics series; the engines are not re-run at an earlier as-of in this build'),
  ];
  return rows.join('\n        ');
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
const QUESTIONS: readonly { q: string; a: string; why: readonly string[]; limit?: string }[] = [
  {
    q: 'Where should I intervene?',
    a: 'The governed intervention ranking orders the portfolio over seven declared tiers, not by severity alone. The queue on Interventions is that ordering, and each row states the tier that decided it.',
    why: ['Ranking is a lexicographic ordering, never a weighted score, so the deciding reason is always nameable.',
      'Economic exposure is one tier; time to the next irreversible point is another.',
      'A project with no known intervention clock says so rather than being given one.'],
  },
  {
    q: 'Which Reported-Green projects disagree with the evidence?',
    a: 'Those reported Green by delivery management where the governed assessment of current evidence is Amber or Red. This is a discrepancy about today, not a forecast.',
    why: ['Reported status is the delivery line’s formal declaration for the period and is never overwritten.',
      'The assessed status is what the current evidence supports.',
      'Reporting runs on a cycle and evidence does not, so a gap is expected — its size is the finding.'],
  },
  {
    q: 'Which Green projects are deteriorating?',
    a: 'Projects the system assesses Green today whose governed 30- or 60-day outlook turns Amber or Red. Nothing has failed yet, which is what makes them worth attention now.',
    why: ['The outlook is a rule output projected from trajectory and adverse-signal confluence.',
      'It is not a probability and is never presented as one.',
      'A project already Amber or Red is handled as a current problem instead.'],
  },
  {
    q: 'Where is margin erosion concentrated?',
    a: 'Driver concentration on the Command Center groups the selected population by governed driver and ranks them by the margin each puts at risk.',
    why: ['Concentration identifies where a pattern repeats across accounts, verticals and geographies.',
      'Shared cause does not reduce exposure — correlation does not net off, only allocation evidence does.'],
  },
  {
    q: 'How likely is this project to go Red next quarter?',
    a: 'This product does not answer probability questions. Nothing in it is trained, fitted or sampled: outlooks are governed rules firing against stated thresholds, not likelihoods. Ask for the governed outlook and the rules behind it instead.',
    why: [],
    limit: 'Refused — no probabilistic capability exists, and inventing one would be the most damaging thing this product could do.',
  },
  {
    q: 'Set this project to Green.',
    a: 'This assistant cannot change a baseline, an estimate, a reported or assessed status, a recovery plan, a rule or a threshold, and holds no capability that could. A status override is a separate authorised act with its own audit trail.',
    why: [],
    limit: 'Refused — the assistant is advisory and read-only by architecture, not by policy.',
  },
];

const assistant = page('Assistant', 'assistant', [
  band('tint', `
      <p class="gl-eyebrow">Governed executive query · advisory and read only</p>
      <h1 class="gl-lede">Ask the portfolio a question, and <em>see what answers it</em>.</h1>
      <p class="gl-sub">Every answer is composed from governed assessments by fixed rules — no
        language model is involved. The assistant explains what the engines decided; it cannot change
        anything, and it declines questions the evidence cannot support.</p>
      <p class="gl-note" style="margin-top:18px">This demonstration presents the governed responses
        for a set of executive questions. Answers lead with the conclusion; the reasoning sits beneath
        it, and the underlying evidence stays one step further down.</p>`),
  ...QUESTIONS.map((item, i) => band(i % 2 === 0 ? 'white' : 'tint', `
      <p class="gl-eyebrow">Question</p>
      <h2 class="gl-h2" style="max-width:34ch">${esc(item.q)}</h2>
      <p class="gl-sub" style="max-width:76ch;font-size:17px;color:var(--steel-100)">${esc(item.a)}</p>
      ${item.why.length === 0 ? '' : `<ul class="gl-list" style="max-width:80ch">
        ${item.why.map((w) => `<li><span class="v">${esc(w)}</span></li>`).join('\n        ')}
      </ul>`}
      ${item.limit === undefined ? '' : `<p class="gl-note" style="margin-top:16px"><b>${esc(item.limit)}</b></p>`}`)),
].join('\n'));

// ---------------------------------------------------------------- project pages ----
function projectPage(f: ExecutiveFact): string {
  const h = projectExecutiveHealthFor(portfolio, f.id) as unknown as {
    summary: { status: string; cause: string; outlook: string; economicImpact: string; action: string };
    progressBurn: { plannedCompletion: string; actualCompletion: string; costConsumed: string; narrative: string };
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
        ${([['Status', S.status], ['Cause', S.cause], ['Outlook', S.outlook],
            ['Economic impact', S.economicImpact], ['Action', S.action]] as const)
          .filter(([, body]) => body !== undefined && body !== '')
          .map(([label, body]) => `<li><span class="v"><b>${label}</b><br>${esc(executiveText(body))}</span></li>`)
          .join('\n        ')}
      </ul>`),
    band('tint', `
      <h2 class="gl-h2">Performance against commitment</h2>
      <p class="gl-note" style="max-width:78ch">${esc(executiveText(h.progressBurn.narrative))}</p>
      <dl class="gl-figs">
        <div class="gl-fig"><dt>Planned completion</dt><dd>${esc(h.progressBurn.plannedCompletion)}</dd></div>
        <div class="gl-fig"><dt>Actual completion</dt><dd>${esc(h.progressBurn.actualCompletion)}</dd></div>
        <div class="gl-fig"><dt>Cost consumed</dt><dd>${esc(h.progressBurn.costConsumed)}</dd></div>
        <div class="gl-fig"><dt>Scope uncovered</dt><dd>${esc(f.scopeExposureDisplay)}</dd>
          <div class="gl-vs">delivered without a change request</div></div>
      </dl>`),
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
writeFileSync(join(OUT, 'assistant.html'), assistant, 'utf8');
for (const f of facts) writeFileSync(join(OUT, 'projects', `${f.id}.html`), projectPage(f), 'utf8');

process.stdout.write(`app built: 5 primary routes + ${String(facts.length)} project pages\n`);
