/**
 * Cross-surface metric identity contract — the R1 release gate.
 *
 * **One governed metric ID → one executive label → one semantic meaning, on every surface.**
 *
 * This suite exists because a green suite did not catch two defects that a reader of the live
 * deployment caught in minutes. Both were of the same family: the arithmetic was right and the
 * *meaning* was wrong, so every value-based assertion passed.
 *
 *   - `MET-DEL-016` (Actual Physical Completion) was projected on Margin & Driver Intelligence
 *     from `MET-FIN-028` (Cost Consumed %). One project therefore read 85.5% complete on Margin
 *     and 66.0% complete everywhere else, and the contingency burn gap sitting beside it — which
 *     is computed from the correct value — silently disagreed with the number above it.
 *   - `MET-FIN-024` (Forecast GM $) named two different figures in one panel: "Forecast GM $" at
 *     $180K and "Potential contract loss" at $0.
 *
 * Neither is detectable by asserting a number. Both are detectable by asserting that a metric ID
 * carries the same name wherever it is rendered, which is what this file does.
 *
 * The walk is deliberately structural rather than a hand-maintained list: any future panel that
 * renders `{ label, metricId }` is covered the day it is written, with no test to remember to add.
 */
import { describe, expect, it } from 'vitest';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { buildCommandCenterFor } from '../../scripts/assessment/command-center-adapter.js';
import { marginIntelligenceFor } from '../../scripts/assessment/margin-adapter.js';
import { projectExecutiveHealthFor } from '../../scripts/assessment/project-health-adapter.js';

const portfolio = generatePortfolio();
const FIXED_BID = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);

const idFor = (scenario: string): string => {
  const spec = portfolio.structure.projects.find((p) => p.curatedScenario === scenario);
  if (spec === undefined) throw new Error(`no curated scenario ${scenario}`);
  return spec.projectId;
};

/** The projects the remediation gate names, plus the current rank-1 intervention candidate. */
const SUBJECTS = ['B', 'C', 'F', 'H'].map(idFor);

interface Sighting {
  readonly metricId: string;
  readonly label: string;
  readonly surface: string;
  readonly path: string;
}

/**
 * Collects every `{ label, metricId }` pair a view renders, wherever it sits in the tree.
 *
 * A pair is only counted when both are present and non-empty: a figure with no metric ID is making
 * no identity claim, and an ID with no label is not executive-facing.
 */
function harvest(node: unknown, surface: string, path = '$', out: Sighting[] = []): Sighting[] {
  if (Array.isArray(node)) {
    node.forEach((n, i) => harvest(n, surface, `${path}[${String(i)}]`, out));
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  const rec = node as Record<string, unknown>;
  const metricId = rec['metricId'];
  const label = rec['label'];
  /*
   * Dimension *inputs* are excluded from the identity invariant, deliberately.
   *
   * A row under `dimensions[].inputs[]` is not an executive figure making a naming claim — it is
   * the health model showing which governed input fed a score, under the model's own input name
   * ("forecast gm percent" feeding MET-FIN-014). Citing a metric as an input is a different act
   * from naming it as a figure, and conflating the two buries the real collisions in a list of
   * case variants. The vocabulary of those input names is an executive-surface concern in its own
   * right (R2.4), enforced elsewhere.
   */
  const isDimensionInput = /\.inputs\[/.test(path);
  if (
    !isDimensionInput
    && typeof metricId === 'string' && metricId !== ''
    && typeof label === 'string' && label !== ''
  ) {
    out.push({ metricId, label, surface, path });
  }
  for (const [k, v] of Object.entries(rec)) harvest(v, surface, `${path}.${k}`, out);
  return out;
}

const sightings: Sighting[] = [];
for (const id of SUBJECTS) {
  harvest(projectExecutiveHealthFor(portfolio, id), 'Project Executive Health', '$', sightings);
  harvest(marginIntelligenceFor(portfolio, id, FIXED_BID), 'Margin & Driver Intelligence', '$', sightings);
}
harvest(buildCommandCenterFor(portfolio, FIXED_BID), 'Portfolio Command Center', '$', sightings);

/**
 * Presentation aliases that are the *same* measure under a shorter name.
 *
 * Kept deliberately small and explicit. An entry here is a claim that two strings mean exactly the
 * same thing to an executive — not a place to silence a genuine collision.
 */
const SAME_MEASURE: Readonly<Record<string, readonly string[]>> = {
  // A panel already titled "Contingency" does not repeat the word in every row label.
  'MET-FIN-036': ['Original contingency', 'Remaining'],
  'MET-FIN-035': ['% consumed', 'Contingency consumed %'],
  'MET-FIN-037': ['Consumed', 'Contingency consumed'],
  // Long form on the surface that introduces the figure, short form where the panel already
  // establishes the context. The measure is identical and no reader could take them apart.
  'MET-FIN-008': ['Cost at completion (EAC)', 'EAC'],
  'MET-FIN-005': ['Actual cost to date', 'Actual cost'],
};

/**
 * Metric identifiers still carrying more than one executive meaning — the open half of R1.5.
 *
 * The R1 gate asked for an invariant of one ID → one name → one unit → one formula. Applying it
 * across the surfaces showed the two defects the deployment review found were not isolated: nine
 * identifiers name more than one figure. Two are now closed (`MET-DEL-016`, `MET-FIN-024`) and
 * are asserted closed below. The rest are recorded here rather than silently renamed, because
 * choosing which figure keeps an identifier — or minting a new one — is a METRIC_CATALOG decision
 * with a frozen registry behind it, and this gate forbids reopening governed economics on the way
 * past. Each entry states the conflict so the decision can be taken deliberately.
 *
 * **This register may only shrink.** A new collision fails the suite.
 */
const OPEN_COLLISIONS: Readonly<Record<string, string>> = {
  // A health band and an intervention flag are different assertions. The second is derived from
  // the first plus the outlook and the status conflict, so it needs its own identifier.
  'MET-HLTH-011': 'Overall health / Executive intervention',
  // MET-FIN-010 is Forecast Revenue (base). Contract value is the contractual figure
  // (MET-FIN-001 as-sold / MET-FIN-002 current) and must not borrow the forecast identifier.
  'MET-FIN-010': 'Contract value / Forecast revenue',
  // A committed end date and a modelled schedule-extension cost are not one measure.
  'MET-DEL-011': 'End date / Schedule extension',
  // A count of executed change requests and the revenue they carry are different quantities.
  'contract:ExecutedChange': 'Executed change requests / Executed CR revenue',
  // Money exposure, a count of scope items, and the portfolio total of the money exposure.
  'MET-COM-009': 'Uncommercialised exposure / Scope delivered without a change request / Uncommercialised scope',
  // The metric and the bridge cause it drives share an identifier; a cause label is not a metric name.
  'MET-QUA-012': 'Excess rework cost / Quality and rework',
  // MET-FIN-002 is Current Contractual Revenue; executed CR recovery is a bridge residual component.
  'MET-FIN-002': 'Current contractual revenue / Executed change request recovery',
  // MET-DEL-023 is the *oldest* open customer dependency in days (ADR-0022 D-3). A count of open
  // dependencies is a different quantity in a different unit and cannot share the identifier.
  'MET-DEL-023': 'Open customer dependencies / Oldest open dependency',
  /*
   * The resource cluster. In each case a margin-bridge *cause* and a resource *measure* share an
   * identifier, and in two of them the units differ (money against hours, a rate against a rate
   * variance). A bridge cause is a modelled attribution of movement; the measure it is derived
   * from is an observation. They are different claims and cannot answer to one name.
   */
  'MET-RES-002': 'Effort overrun / Planned hours to date / Effort variance',
  'MET-RES-010': 'Rate and seniority mix / Resource cost drift impact',
  'MET-RES-005': 'Actual blended rate / Blended rate variance',
};

/** Executive names still backed by more than one identifier — the same debt, seen from the other side. */
const OPEN_NAME_COLLISIONS: readonly string[] = [
  // A project figure and its portfolio aggregate share a name. Both are correct measures; the
  // portfolio total needs a name that says it is a total.
  'GM value at risk',
  'Scope delivered without a change request',
];

const canonical = (metricId: string, label: string): string => {
  const aliases = SAME_MEASURE[metricId];
  return aliases !== undefined && aliases.includes(label) ? `«${metricId} alias»` : label;
};

describe('one governed metric ID carries one executive label', () => {
  it('renders a meaningful number of identified figures', () => {
    // Guards the walk itself: a refactor that renames `metricId` would otherwise make this file
    // pass by testing nothing at all.
    expect(sightings.length).toBeGreaterThan(100);
  });

  it('never gives one metric ID two different executive names', () => {
    const byId = new Map<string, Map<string, Sighting[]>>();
    for (const s of sightings) {
      const labels = byId.get(s.metricId) ?? new Map<string, Sighting[]>();
      const key = canonical(s.metricId, s.label);
      labels.set(key, [...(labels.get(key) ?? []), s]);
      byId.set(s.metricId, labels);
    }

    const collisions = [...byId.entries()]
      .filter(([metricId, labels]) => labels.size > 1 && OPEN_COLLISIONS[metricId] === undefined)
      .map(([metricId, labels]) => {
        const detail = [...labels.entries()]
          .map(([label, ss]) => `      "${label}" — ${[...new Set(ss.map((s) => s.surface))].join(', ')}`)
          .join('\n');
        return `  ${metricId} is rendered under ${String(labels.size)} names:\n${detail}`;
      });

    expect(collisions.join('\n'), collisions.length === 0 ? '' : `\n${collisions.join('\n')}\n`)
      .toBe('');
  });

  it('never gives one executive name two different metric IDs', () => {
    const byLabel = new Map<string, Set<string>>();
    for (const s of sightings) {
      byLabel.set(s.label, new Set([...(byLabel.get(s.label) ?? []), s.metricId]));
    }
    const collisions = [...byLabel.entries()]
      .filter(([label, ids]) => ids.size > 1 && !OPEN_NAME_COLLISIONS.includes(label))
      .map(([label, ids]) => `  "${label}" is backed by ${[...ids].sort().join(' and ')}`);

    expect(collisions.join('\n'), collisions.length === 0 ? '' : `\n${collisions.join('\n')}\n`)
      .toBe('');
  });
});

describe('the open-collision register is honest', () => {
  it('records only identifiers that genuinely still collide', () => {
    const byId = new Map<string, Set<string>>();
    for (const s of sightings) {
      byId.set(s.metricId, new Set([...(byId.get(s.metricId) ?? []), canonical(s.metricId, s.label)]));
    }
    // A register entry that no longer collides must be deleted, not left to rot.
    const stale = Object.keys(OPEN_COLLISIONS).filter((id) => (byId.get(id)?.size ?? 0) <= 1);
    expect(stale, `register entries no longer colliding — delete them: ${stale.join(', ')}`).toEqual([]);
  });

  it('does not list the two identifiers this gate closed', () => {
    expect(Object.keys(OPEN_COLLISIONS)).not.toContain('MET-DEL-016');
    expect(Object.keys(OPEN_COLLISIONS)).not.toContain('MET-FIN-024');
  });
});

describe('R1.1 — physical completion is never projected from cost consumed', () => {
  const H = idFor('H');
  const margin = marginIntelligenceFor(portfolio, H, FIXED_BID);
  const health = projectExecutiveHealthFor(portfolio, H);

  const figure = (view: unknown, metricId: string): string | null => {
    const hit = harvest(view, 'x').find((s) => s.metricId === metricId);
    if (hit === null || hit === undefined) return null;
    // Re-walk to pull the value sitting beside the label.
    let found: string | null = null;
    const scan = (n: unknown): void => {
      if (Array.isArray(n)) { n.forEach(scan); return; }
      if (n === null || typeof n !== 'object') return;
      const r = n as Record<string, unknown>;
      if (r['metricId'] === metricId && typeof r['value'] === 'string' && found === null) {
        found = r['value'];
      }
      Object.values(r).forEach(scan);
    };
    scan(view);
    return found;
  };

  it('shows MET-DEL-016 on Margin, not MET-FIN-028 wearing its label', () => {
    const shown = figure(margin, 'MET-DEL-016');
    expect(shown).not.toBeNull();
    // The governed physical completion, as Project Health reports it from the same observation.
    expect(shown).toBe(`${health.progressBurn.actualCompletion}`);
  });

  it('keeps physical completion and cost consumed distinguishable', () => {
    expect(health.progressBurn.actualCompletion).not.toBe(health.progressBurn.costConsumed);
  });

  /*
   * The arithmetic tell that exposed the original defect.
   *
   * MET-FIN-034 Contingency Burn Gap is MET-FIN-035 − MET-DEL-016. When the panel displayed cost
   * consumed under the MET-DEL-016 label, the gap beside it no longer reconciled against the
   * number directly above it — the page disagreed with itself in plain sight.
   */
  it('reconciles the contingency burn gap against the completion it displays', () => {
    const consumedPct = figure(margin, 'MET-FIN-035');
    const completion = figure(margin, 'MET-DEL-016');
    const gap = figure(margin, 'MET-FIN-034');
    if (consumedPct === null || completion === null || gap === null) return;
    const num = (s: string): number => Number(s.replace(/[^0-9.-]/g, ''));
    expect(num(consumedPct) - num(completion)).toBeCloseTo(num(gap), 1);
  });
});

describe('R1.5 — MET-FIN-024 names exactly one figure', () => {
  it('is Forecast GM $ and nothing else, on every surface', () => {
    const labels = new Set(
      sightings.filter((s) => s.metricId === 'MET-FIN-024').map((s) => s.label),
    );
    expect([...labels]).toEqual(['Forecast GM $']);
  });

  it('does not present a contract-loss figure under a Forecast GM identifier', () => {
    expect(sightings.filter((s) => /contract loss/i.test(s.label)).map((s) => s.metricId))
      .not.toContain('MET-FIN-024');
  });
});
