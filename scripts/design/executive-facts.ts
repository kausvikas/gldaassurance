/**
 * The authoritative per-project facts the executive surfaces aggregate.
 *
 * Every value here is produced by a governed engine on the server side of the build. The browser
 * filters, counts and sums these; it never derives a band, an outlook, a margin or a ranking of its
 * own (ADR client-runtime contract §9). Where an executive aggregation needs a number the formatted
 * view model only carries as a display string — TCV, GM value at risk, forecast margin — the
 * numeric projection is emitted here rather than parsed back out of presentation, so there is one
 * business-truth path and the browser is only ever adding up figures the domain already decided.
 */
import { generatePortfolio } from '../generator/index.js';
import { commandCenterProject, buildCommandCenterFor } from '../assessment/command-center-adapter.js';
import { executiveText } from './gl-shell.js';

export interface ExecutiveFact {
  readonly id: string;
  readonly name: string;
  readonly customer: string;
  readonly industry: string;
  readonly region: string;
  readonly deliveryGroup: string;
  readonly account: string;
  readonly reported: string;
  readonly system: string;
  readonly trajectory: string;
  readonly outlook30: string;
  readonly outlook60: string;
  /** Numeric, for additive aggregation only. Display strings sit beside them. */
  readonly tcv: number;
  readonly tcvDisplay: string;
  readonly gmAtRisk: number;
  readonly gmAtRiskDisplay: string;
  readonly soldGmPct: number;
  readonly forecastGmPct: number;
  readonly scopeExposure: number;
  readonly scopeExposureDisplay: string;
  /*
   * The two executive Green findings, built from authoritative Reported RAG, System RAG and the
   * governed 30/60-day outlooks — not from MET-HLTH-033.
   *
   * MET-HLTH-033 is `reportedGreen && (systemDisagreesNow || materialDeterioration)`. Its second
   * arm admits projects that are reported Green, assessed Green and merely deteriorating, which is
   * not a management/system discrepancy at all — labelling those "evidence disagrees" tells a
   * Chief Delivery Officer the delivery line is misreporting when the system agrees with it. The
   * metric keeps its historical semantics and is preserved below; the executive category is a
   * presentation grouping over facts the engines already decided, and recalculates nothing.
   */
  readonly reportedGreenRisk: boolean;
  readonly emergingRisk: boolean;
  /** MET-HLTH-033 as the engine computed it, retained for provenance and never used as category A. */
  readonly legacyReportedGreenRisk: boolean;
  readonly action: string;
  readonly why: string;
  readonly timeToAct: string;
  readonly rank: number;
  readonly evidence: string;
  readonly drivers: readonly string[];
}

const num = (m: { toDto(): { amount: string } } | null | undefined): number =>
  m === null || m === undefined ? 0 : Number(m.toDto().amount);

const pct = (r: unknown): number => {
  const s = String(r ?? '');
  const v = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Governed driver categories a project exhibits.
 *
 * These are read from conditions the engines already assessed — they are not new rules. A project
 * appears under a driver when the governed evidence for that driver is present, which is what makes
 * "where is this pattern repeating" answerable without inventing a second classification.
 */
function driversFor(row: Record<string, unknown>, f: { soldGmPct: number; forecastGmPct: number; scopeExposure: number }): string[] {
  const out: string[] = [];
  if (f.soldGmPct - f.forecastGmPct >= 5) out.push('margin-erosion');
  if (f.scopeExposure > 0) out.push('scope-leakage');
  const burn = pct(row['burnGap']);
  const prog = pct(row['progressVariance']);
  if (burn >= 5) out.push('burn-ahead-of-progress');
  if (prog <= -5) out.push('behind-plan');
  if (String(row['trajectory']).includes('DETERIORATING')) out.push('deteriorating');
  if (row['isReportedGreenRisk'] === true) out.push('reporting-divergence');
  if (row['isSystemGreenAtRisk'] === true) out.push('emerging-risk');
  return out;
}

export function executiveFacts(): {
  facts: ExecutiveFact[];
  view: ReturnType<typeof buildCommandCenterFor>;
  portfolio: ReturnType<typeof generatePortfolio>;
} {
  const portfolio = generatePortfolio();
  const specs = portfolio.structure.projects.filter((p) => p.engagementModel === 'FIXED_BID');
  const view = buildCommandCenterFor(portfolio, specs.map((p) => p.projectId));
  const rows = (view as unknown as { ranked: Record<string, unknown>[] }).ranked;

  const facts = rows.map((row) => {
    const id = String(row['projectId']);
    const spec = specs.find((s) => s.projectId === id);
    const assessed = commandCenterProject(portfolio, id);
    const e = assessed.assessment.economics;
    const account = portfolio.structure.accounts.find((a) => a.id === spec?.accountId);
    const customer = portfolio.structure.customers.find((c) => c.id === spec?.customerId);

    const soldGmPct = pct(row['soldGmPercent']);
    const forecastGmPct = pct(row['forecastGmPercent']);
    // Uncommercialised exposure is carried on the row as a formatted figure; the numeric
    // projection comes from the same governed commercial evaluation the row was built from.
    const scopeExposure = num(assessed.uncommercialisedExposure ?? null);
    const base = { soldGmPct, forecastGmPct, scopeExposure };

    return {
      id,
      name: String(row['name']),
      customer: customer?.alias ?? String(row['name']).split(' ').slice(0, 2).join(' '),
      industry: String(row['industry']),
      region: String(row['region']),
      deliveryGroup: String(row['deliveryGroup'] ?? '—'),
      account: account?.name ?? customer?.alias ?? '—',
      reported: String(row['reportedRag']),
      system: String(row['systemAssessedRag']),
      trajectory: String(row['trajectory']),
      outlook30: String(row['outlook30']),
      outlook60: String(row['outlook60']),
      tcv: num(spec?.contractValue),
      tcvDisplay: String(row['tcv']),
      gmAtRisk: num(e.gmValueAtRisk),
      gmAtRiskDisplay: String(row['gmValueAtRisk']),
      soldGmPct,
      forecastGmPct,
      scopeExposure,
      scopeExposureDisplay: String(row['uncommercialisedExposure']),
      // A — current management/system discrepancy: reported Green, assessed worse.
      reportedGreenRisk: String(row['reportedRag']) === 'GREEN'
        && String(row['systemAssessedRag']) !== 'GREEN',
      // B — forward early warning: assessed Green today, governed outlook turns inside 60 days.
      emergingRisk: String(row['systemAssessedRag']) === 'GREEN'
        && (String(row['outlook30']) !== 'GREEN' || String(row['outlook60']) !== 'GREEN'),
      legacyReportedGreenRisk: row['isReportedGreenRisk'] === true,
      // Translated once, here, so the surface and the client runtime read the same words.
      action: executiveText(String(row['executiveAction'])),
      why: executiveText(String(row['rankNarrative'] ?? row['outranksBecause'] ?? '')),
      timeToAct: executiveText(String(row['timeCriticality'])),
      rank: Number(row['rank'] ?? 0),
      evidence: String(row['dataConfidence'] ?? 'not stated'),
      drivers: driversFor(row, base),
    } satisfies ExecutiveFact;
  });

  return { facts, view, portfolio };
}
