/**
 * The one canonical Delivery Intelligence application shell.
 *
 * Every primary route renders through this function. The previous build produced each surface with
 * its own script and its own chrome, so the Command Center carried the new GlobalLogic experience
 * while Projects and Assistant still opened the legacy admin sidebar — navigating between product
 * areas felt like changing applications, and the primary navigation vanished the moment you left
 * the landing page. One shell is the only structural guarantee that cannot happen again.
 *
 * Navigation is identical on every route, marks the active product area with `aria-current` and a
 * weight change rather than colour alone, and keeps Projects active while inside an individual
 * project so the user always knows which product area they are in.
 */
import { GL_CSS } from './gl-theme.js';

export type Area = 'command-center' | 'projects' | 'forward-risk' | 'interventions' | 'assistant';

const NAV: readonly { area: Area; label: string; href: string }[] = [
  { area: 'command-center', label: 'Command Center', href: '/' },
  { area: 'projects', label: 'Projects', href: '/projects' },
  { area: 'forward-risk', label: 'Forward Risk', href: '/forward-risk' },
  { area: 'interventions', label: 'Interventions', href: '/interventions' },
  { area: 'assistant', label: 'Assistant', href: '/assistant' },
];

/**
 * The executive vocabulary layer.
 *
 * Domain narratives are written for traceability and carry the identifiers that make a claim
 * checkable — "(MET-COM-009)", "OVR-NO-CREDIBLE-PLAN", "NOT_COMPUTABLE". That is right in evidence
 * and wrong on an executive surface: an identifier a reader cannot resolve is noise that makes the
 * sentence around it look like machine output, and a Chief Delivery Officer should never need to
 * know a metric's number to understand their portfolio.
 *
 * Known codes are translated into the business condition they describe; bare parenthetical
 * references are removed. Nothing is invented — every replacement states what the rule already
 * means, and the raw identifier remains available under Evidence and Governance.
 */
const PHRASES: readonly (readonly [RegExp, string])[] = [
  [/OVR-NO-CREDIBLE-PLAN/g, 'the recovery plan is not credible against demonstrated delivery performance'],
  [/OVR-CONTRACT-LOSS/g, 'the contract is forecast to complete at a loss'],
  [/OVR-RAGM-NEGATIVE/g, 'risk-adjusted margin is negative'],
  [/OVR-GM-NEGATIVE/g, 'forecast margin is negative'],
  [/OVR-LD-EXPOSURE/g, 'contractual penalty exposure is material'],
  [/ELV-ETC-OPTIMISM/g, 'the estimate to complete assumes performance the project has not demonstrated'],
  [/ELV-CONTINGENCY-BURN/g, 'contingency is being consumed ahead of the work'],
  [/ELV-MARGIN-EROSION/g, 'margin has eroded materially against the as-sold position'],
  [/NOT_COMPUTABLE/g, 'insufficient evidence to assess'],
  [/CONFIGURATION_ERROR/g, 'assessment unavailable because of a configuration issue'],
  [/RISK_OBJECT_ABSENT/g, 'no applicable risk record'],
  [/REPORTED_OPTIMISTIC/g, 'reported ahead of the evidence'],
];

/** Strips identifiers from a narrative bound for an executive surface. */
export function executiveText(text: string): string {
  let out = text;
  for (const [pattern, plain] of PHRASES) out = out.replace(pattern, plain);
  // Bare references the reader cannot act on: "(MET-COM-009)", "(ADR-0022 D-2)", "(DR-059)".
  out = out.replace(/\s*\((?:MET|ADR|DR|OVR|ELV|REQ|AC|CS)-[^)]*\)/g, '');
  out = out.replace(/\s*\(Governance:[^)]*\)/g, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

export const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function shell(opts: {
  title: string;
  active: Area;
  body: string;
  /** Serialised authoritative facts, embedded for the filter runtime. */
  facts?: string;
  runtime?: string;
  /** Rendered under the nav on inner routes, e.g. the project a page is about. */
  context?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(opts.title)} — GlobalLogic Delivery Intelligence</title>
<style>${GL_CSS}</style>
</head>
<body>
<a class="gl-skip" href="#main">Skip to content</a>
<div class="gl-navwrap">
  <nav class="gl-nav" aria-label="Primary">
    <a class="gl-brand" href="/"><b>GlobalLogic</b><span>Delivery Intelligence</span></a>
    <ul class="gl-navlinks">
      ${NAV.map((n) => `<li><a href="${n.href}"${n.area === opts.active ? ' aria-current="page"' : ''}>${n.label}</a></li>`).join('\n      ')}
    </ul>
    <span class="gl-navmeta">
      <span>as at 31 Aug 2026</span>
      <span class="gl-demo">DEMO — SYNTHETIC DATA</span>
    </span>
  </nav>
</div>
${opts.context ?? ''}
<main id="main">
${opts.body}
  <footer class="gl-foot"><div class="gl-wrap">
    <p><b>Synthetic demonstration data.</b> This public proof of concept renders representative
      executive views over a generated portfolio. Production identity, authentication, authorization
      and enterprise integrations are not enabled in this demonstration, and static access to this
      page does not exercise them.</p>
  </div></footer>
</main>
${opts.facts === undefined ? '' : `<script type="application/json" id="gl-facts">${opts.facts.replace(/</g, '\\u003c')}</script>`}
${opts.runtime === undefined ? '' : `<script>${opts.runtime}</script>`}
</body>
</html>
`;
}

/** The shared enterprise filter bar. One control set, one vocabulary, every surface. */
export function filterBar(dims: { id: string; label: string; options: string[] }[]): string {
  const sel = (d: { id: string; label: string; options: string[] }): string => `
        <label>${esc(d.label)}
          <select data-dim="${d.id}">
            <option value="">All</option>
            ${d.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
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
  return `
      <div class="gl-filters" role="group" aria-label="Portfolio filters">
        ${dims.map(sel).join('')}
        <button type="button" class="gl-reset" id="gl-reset">Reset all</button>
      </div>
      <div class="gl-quick" role="group" aria-label="Quick views">
        ${QUICK.map(([k, l]) => `<button type="button" data-quick="${k}" aria-pressed="false">${esc(l)}</button>`).join('\n        ')}
      </div>
      <p class="gl-scope" id="gl-scopeline" aria-live="polite"></p>`;
}
