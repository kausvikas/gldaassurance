/**
 * Orchestrator: structure → curated overrides → weekly simulation → portfolio.
 *
 * `generatePortfolio(seed)` is a pure function. Both the file writer and the validator call it, so
 * validation exercises exactly what is written rather than a re-read of it.
 */
import { createHash } from 'node:crypto';
import { Money } from '@platform/decimal';
import { addDays, calendarDate } from '@platform/time';
import { ARCHETYPES, type ArchetypeId } from './archetypes.js';
import { CURATED, buildCuratedFacts, type CuratedScenario } from './curated.js';
import { emptyFacts, type FxRateRow, type ProjectFacts, type RagOverrideRow } from './facts.js';
import { REAL_WORLD_DENY_LIST } from './names.js';
import { buildRecoveryFacts, buildScheduleAndAssuranceFacts } from './recovery.js';
import {
  AS_OF, HISTORY_WEEKS, TARGET_CAPACITY, TARGET_FIXED_BID, TARGET_TIME_AND_MATERIALS,
  TARGET_TOTAL, buildStructure, tcvBandOf, type ProjectSpec, type Structure,
} from './portfolio.js';
import { Rng, dec } from './rng.js';
import { simulateProject } from './simulate.js';

/**
 * `1.2.0` — architectural closure before Phase 11.
 *
 * `1.1.0` added `recoveryPlans`, `recoveryActions` and `warningDispositions` (DR-049). `1.2.0` adds
 * `scheduleForecasts` (**DR-050**) and `assuranceReviews` (**DR-053**), gives assignments a
 * `deliveryLocation` and `engagementType` (**DR-056**), and slips the undelivered milestones of
 * projects carrying productivity drag (**DR-051**) — which had left `MET-DEL-009` and `MET-DEL-010`
 * constant zero and reading as *perfect* into the Delivery dimension.
 *
 * **No existing fact was removed or repurposed.** The content hash moves because it covers the whole
 * fact set; the version bump is what makes that movement explicable rather than alarming.
 */
export const GENERATOR_VERSION = '1.2.0';
export const DEFAULT_SEED = 'gldi-portfolio-2026-08-31';

export interface DemoUser {
  readonly actorId: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: string;
  readonly scope: readonly { kind: string; id: string }[];
  readonly demonstrates: string;
  readonly synthetic: true;
}

export interface SyntheticPortfolio {
  readonly seed: string;
  readonly generatorVersion: string;
  readonly asOf: string;
  readonly structure: Structure;
  readonly curated: readonly { letter: string; projectId: string; scenario: CuratedScenario }[];
  readonly facts: ProjectFacts;
  readonly fxRates: FxRateRow[];
  readonly users: DemoUser[];
  /** Internal traces, for validation only. Never written to the data files. */
  readonly traces: Map<string, ReturnType<typeof simulateProject>['trace']>;
}

function mergeFacts(target: ProjectFacts, source: ProjectFacts): void {
  for (const key of Object.keys(target) as (keyof ProjectFacts)[]) {
    (target[key] as unknown[]).push(...(source[key] as unknown[]));
  }
}

/** `SYNTHETIC_DATA_SPEC.md` §7 — the seeded users that make AC-5 demonstrable. */
function demoUsers(): DemoUser[] {
  return [
    { actorId: 'usr-exec-cdo', username: 'exec.cdo', displayName: 'Chief Delivery Officer', role: 'EXECUTIVE', scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-americas' }, { kind: 'BUSINESS_UNIT', id: 'bu-emea' }, { kind: 'BUSINESS_UNIT', id: 'bu-apac' }], demonstrates: 'Full portfolio and commercial breadth', synthetic: true },
    { actorId: 'usr-dir-emea', username: 'dir.emea', displayName: 'Portfolio Director, EMEA', role: 'PORTFOLIO_DIRECTOR', scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-emea' }], demonstrates: 'Scope filtering; aggregates over the authorised set only', synthetic: true },
    { actorId: 'usr-dir-amer', username: 'dir.amer', displayName: 'Portfolio Director, Americas', role: 'PORTFOLIO_DIRECTOR', scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-americas' }], demonstrates: 'Two directors, materially different portfolio totals', synthetic: true },
    { actorId: 'usr-dm-mobility', username: 'dm.mobility', displayName: 'Delivery Manager', role: 'DELIVERY_MANAGER', scope: [], demonstrates: 'Commercial fields absent from the payload (AC-5)', synthetic: true },
    { actorId: 'usr-fin-ctrl', username: 'fin.controller', displayName: 'Finance Controller', role: 'FINANCE_CONTROLLER', scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-americas' }, { kind: 'BUSINESS_UNIT', id: 'bu-emea' }, { kind: 'BUSINESS_UNIT', id: 'bu-apac' }], demonstrates: 'Commercial without delivery detail', synthetic: true },
    { actorId: 'usr-audit', username: 'audit.assurance', displayName: 'Assurance Auditor', role: 'ASSURANCE_AUDITOR', scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-americas' }, { kind: 'BUSINESS_UNIT', id: 'bu-emea' }, { kind: 'BUSINESS_UNIT', id: 'bu-apac' }], demonstrates: 'Read-only across scope plus audit log access', synthetic: true },
    { actorId: 'usr-sec-admin', username: 'sec.admin', displayName: 'Security Administrator', role: 'SECURITY_ADMIN', scope: [], demonstrates: 'No business data at all', synthetic: true },
  ];
}

/** Dated FX rates covering the whole history, monthly, so any conversion has a rate (REQ-DATA-006). */
function fxRates(seed: string): FxRateRow[] {
  const rng = Rng.fromSeed(`${seed}:fx`);
  const out: FxRateRow[] = [];
  const pairs: [string, string, number][] = [['EUR', 'USD', 1.09], ['GBP', 'USD', 1.27], ['INR', 'USD', 0.0119], ['JPY', 'USD', 0.0067]];
  for (const [from, to, base] of pairs) {
    for (let m = 0; m <= 19; m += 1) {
      const date = addDays(AS_OF, -(19 - m) * 30);
      for (const rateType of ['SPOT', 'MONTHLY_AVERAGE'] as const) {
        out.push({
          id: `fx-${from}-${to}-${rateType}-${date}`, from, to,
          rate: dec(base * (1 + rng.jitter() * 0.06), 6), rateType,
          effectiveDate: date, source: 'SYNTHETIC-FX-FEED', synthetic: true,
        });
      }
    }
  }
  return out;
}

export function generatePortfolio(seed: string = DEFAULT_SEED): SyntheticPortfolio {
  const structure = buildStructure(seed);
  const specs = [...structure.projects];
  const facts = emptyFacts();
  const traces = new Map<string, ReturnType<typeof simulateProject>['trace']>();
  const curated: { letter: string; projectId: string; scenario: CuratedScenario }[] = [];

  // --- assign the eight curated scenarios to real projects -------------------
  const taken = new Set<string>();
  for (const scenario of CURATED) {
    const idx = specs.findIndex(
      (s) => !taken.has(s.projectId) && s.engagementModel === 'FIXED_BID' && s.vertical === scenario.vertical,
    );
    const fallback = specs.findIndex((s) => !taken.has(s.projectId) && s.engagementModel === 'FIXED_BID');
    const at = idx >= 0 ? idx : fallback;
    const base = specs[at] as ProjectSpec;
    taken.add(base.projectId);

    const startDate = addDays(AS_OF, -Math.round(scenario.durationWeeks * (scenario.elapsedFraction ?? 0.62)) * 7);
    const rate = 74;
    const spec: ProjectSpec = {
      ...base,
      name: `${base.name.split(' ').slice(0, 2).join(' ')} ${scenario.title}`,
      curatedScenario: scenario.letter,
      archetype: scenario.archetype,
      lifecycleSubStage: scenario.subStage,
      lifecycleStage: scenario.subStage === 'UAT_ACCEPTANCE' ? 'CLOSING' : 'EXECUTING',
      currency: 'USD',
      startDate,
      plannedEndDate: addDays(startDate, scenario.durationWeeks * 7),
      durationWeeks: scenario.durationWeeks,
      teamSize: scenario.teamSize,
      tcvBand: tcvBandOf(scenario.contractValue),
      contractValue: Money.of(dec(scenario.contractValue), 'USD'),
      budgetedCost: Money.of(dec(scenario.budgetedCost), 'USD'),
      contingencyBudget: Money.of(dec(scenario.contingencyBudget), 'USD'),
      blendedRate: Money.of(dec(rate), 'USD'),
      plannedEffortHours: dec(Math.round(scenario.budgetedCost / rate)),
      reworkAllowance: dec(scenario.reworkAllowance, 4),
      inRecovery: scenario.archetype === 'RECOVERING_RED',
    };
    specs[at] = spec;
    curated.push({ letter: scenario.letter, projectId: spec.projectId, scenario });
    mergeFacts(facts, buildCuratedFacts(scenario, spec, seed));
  }

  // --- simulate everything else ---------------------------------------------
  for (const spec of specs) {
    if (spec.curatedScenario !== undefined) continue;
    const result = simulateProject(spec, seed);
    mergeFacts(facts, result.facts);
    traces.set(spec.projectId, result.trace);
  }

  // --- overrides: OVERRIDE_CONFLICT projects carry an authorised, expiring override
  const overrides: RagOverrideRow[] = [];
  for (const spec of specs.filter((s) => s.archetype === 'OVERRIDE_CONFLICT')) {
    overrides.push({
      projectId: spec.projectId, appliedAt: `${addDays(AS_OF, -21)}T10:00:00Z`, rag: 'AMBER',
      reason: 'Client remediation plan agreed and funded; holding Amber pending the December gate review',
      actorId: 'usr-exec-cdo', expiresAt: `${addDays(AS_OF, 42)}T10:00:00Z`, synthetic: true,
    });
  }
  facts.ragOverrides.push(...overrides);

  // --- Phase 10: recovery plans, corrective actions and assurance dispositions (closes DR-049)
  // Built last, over the final spec list, so a plan can only exist for a project that exists.
  const recovery = buildRecoveryFacts(specs, AS_OF, seed);
  facts.recoveryPlans.push(...recovery.recoveryPlans);
  facts.recoveryActions.push(...recovery.recoveryActions);
  facts.warningDispositions.push(...recovery.warningDispositions);

  // DR-050 and DR-053 — a completion forecast for every project, and an assurance review for most.
  const schedule = buildScheduleAndAssuranceFacts(specs, AS_OF, seed);
  facts.scheduleForecasts.push(...schedule.scheduleForecasts);
  facts.assuranceReviews.push(...schedule.assuranceReviews);

  return {
    seed, generatorVersion: GENERATOR_VERSION, asOf: AS_OF,
    structure: { ...structure, projects: specs },
    curated, facts, fxRates: fxRates(seed), users: demoUsers(), traces,
  };
}

/** Stable content hash. Same seed → same hash (REQ-DATA-007). */
export function contentHash(p: SyntheticPortfolio): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({
    seed: p.seed, generatorVersion: p.generatorVersion, asOf: p.asOf,
    structure: p.structure, facts: p.facts, fxRates: p.fxRates, users: p.users,
  }));
  return h.digest('hex');
}

export function recordCounts(p: SyntheticPortfolio): Record<string, number> {
  const counts: Record<string, number> = {
    businessUnits: p.structure.businessUnits.length,
    regions: p.structure.regions.length,
    industries: p.structure.industries.length,
    customers: p.structure.customers.length,
    accounts: p.structure.accounts.length,
    portfolios: p.structure.portfolios.length,
    programs: p.structure.programs.length,
    projects: p.structure.projects.length,
    fxRates: p.fxRates.length,
    users: p.users.length,
  };
  for (const [k, v] of Object.entries(p.facts)) counts[k] = (v as unknown[]).length;
  return counts;
}

export { ARCHETYPES, CURATED, AS_OF, HISTORY_WEEKS, REAL_WORLD_DENY_LIST, TARGET_TOTAL, TARGET_FIXED_BID, TARGET_TIME_AND_MATERIALS, TARGET_CAPACITY };
export type { ArchetypeId, CuratedScenario, ProjectSpec, Structure };
