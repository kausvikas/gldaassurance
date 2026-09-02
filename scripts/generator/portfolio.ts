/**
 * Portfolio structure: organisation, customers, accounts, portfolios, projects, contracts and
 * as-sold baselines.
 *
 * Everything here is time-invariant setup. The weekly causal simulation in `simulate.ts` runs on
 * top of it. Nothing in this file produces a derived metric.
 */
import { Money, type CurrencyCode } from '@platform/decimal';
import { addDays, calendarDate, compareDates, type CalendarDate } from '@platform/time';
import { type ArchetypeId, ARCHETYPES } from './archetypes.js';
import {
  BUSINESS_UNITS, CAPABILITIES, CLIENT_ALIASES, PHASES, REGION_CURRENCY, VERTICALS,
  type Vertical,
} from './names.js';
import { Rng, dec } from './rng.js';

export const AS_OF: CalendarDate = calendarDate('2026-08-31');
/** 18 months of weekly history (ADR-0003 §3, `SYNTHETIC_DATA_SPEC.md` G4). */
export const HISTORY_WEEKS = 78;

export type EngagementModel = 'FIXED_BID' | 'TIME_AND_MATERIALS' | 'CAPACITY';
export type LifecycleStage = 'INITIATING' | 'EXECUTING' | 'CLOSING' | 'CLOSED';
export type LifecycleSubStage =
  | 'MOBILIZATION' | 'EARLY_EXECUTION' | 'MID_PROJECT' | 'LATE_STAGE' | 'UAT_ACCEPTANCE' | 'CLOSED_OUT';

export const SUB_STAGE_TO_STAGE: Readonly<Record<LifecycleSubStage, LifecycleStage>> = {
  MOBILIZATION: 'INITIATING',
  EARLY_EXECUTION: 'EXECUTING',
  MID_PROJECT: 'EXECUTING',
  LATE_STAGE: 'EXECUTING',
  UAT_ACCEPTANCE: 'CLOSING',
  CLOSED_OUT: 'CLOSED',
};

/** TCV bands are a classification over the existing range, not a change to it (ADR-0013 §4). */
export type TcvBand = 'LT_1M' | 'B_1_5M' | 'B_5_10M' | 'GTE_10M';

export function tcvBandOf(contractValueUsd: number): TcvBand {
  if (contractValueUsd < 1_000_000) return 'LT_1M';
  if (contractValueUsd < 5_000_000) return 'B_1_5M';
  if (contractValueUsd < 10_000_000) return 'B_5_10M';
  return 'GTE_10M';
}

export interface ProjectSpec {
  readonly projectId: string;
  readonly contractId: string;
  readonly name: string;
  readonly accountId: string;
  readonly customerId: string;
  readonly organizationNodeId: string;
  readonly portfolioId: string;
  readonly programId: string;
  readonly vertical: Vertical;
  readonly region: string;
  readonly businessUnitId: string;
  readonly currency: CurrencyCode;
  readonly engagementModel: EngagementModel;
  readonly archetype: ArchetypeId;
  readonly curatedScenario?: string;
  readonly lifecycleSubStage: LifecycleSubStage;
  readonly lifecycleStage: LifecycleStage;
  readonly startDate: CalendarDate;
  readonly plannedEndDate: CalendarDate;
  readonly durationWeeks: number;
  readonly tcvBand: TcvBand;
  /** As-sold baseline inputs. Immutable once written (ADR-0003 §1). */
  readonly contractValue: Money;
  readonly budgetedCost: Money;
  readonly contingencyBudget: Money;
  readonly blendedRate: Money;
  readonly plannedEffortHours: string;
  readonly pyramidRatio: string;
  readonly reworkAllowance: string;
  readonly teamSize: number;
  readonly inRecovery: boolean;
}

/** 91 projects: 75 fixed-price per the Phase 3 brief, plus the T&M and capacity engagements */
/** `PRODUCT_SPEC.md` §4.1 requires be modelled (ADR-0013 §5). */
export const TARGET_FIXED_BID = 75;
export const TARGET_TIME_AND_MATERIALS = 11;
export const TARGET_CAPACITY = 5;
export const TARGET_TOTAL = TARGET_FIXED_BID + TARGET_TIME_AND_MATERIALS + TARGET_CAPACITY;

/** Band shares, chosen so the portfolio needs ranking rather than reading (AC-1). */
/**
 * Share of the as-sold cost budget priced for non-labour and pass-through spend.
 *
 * Mirrors the 5–11% simulate.ts charges on top of labour, at its midpoint. Kept here beside the
 * as-sold baseline because it is an estimating assumption, not a simulation parameter.
 */
const NON_LABOUR_BUDGET_SHARE = 0.08;

const BAND_PLAN: readonly { band: TcvBand; count: number; minUsd: number; maxUsd: number }[] = [
  { band: 'LT_1M', count: 18, minUsd: 420_000, maxUsd: 980_000 },
  { band: 'B_1_5M', count: 38, minUsd: 1_100_000, maxUsd: 4_900_000 },
  { band: 'B_5_10M', count: 22, minUsd: 5_100_000, maxUsd: 9_800_000 },
  { band: 'GTE_10M', count: 13, minUsd: 10_200_000, maxUsd: 28_000_000 },
];

const SUB_STAGE_PLAN: readonly { stage: LifecycleSubStage; count: number }[] = [
  { stage: 'MOBILIZATION', count: 8 },
  { stage: 'EARLY_EXECUTION', count: 16 },
  { stage: 'MID_PROJECT', count: 28 },
  { stage: 'LATE_STAGE', count: 21 },
  { stage: 'UAT_ACCEPTANCE', count: 12 },
  { stage: 'CLOSED_OUT', count: 6 },
];

/** Archetypes that only make sense where scope risk sits with the supplier. */
const FIXED_BID_ONLY_ARCHETYPES = new Set<ArchetypeId>([
  'UNCOMPENSATED_SCOPE', 'SILENT_DETERIORATOR', 'ETC_OPTIMISM',
  'CONTRACT_LOSS_RISK', 'PYRAMID_EROSION', 'OVERRIDE_CONFLICT',
]);

function archetypePlan(rng: Rng): ArchetypeId[] {
  const plan: ArchetypeId[] = [];
  for (const a of ARCHETYPES) for (let i = 0; i < a.minCount; i += 1) plan.push(a.id);
  // Fill the remainder with well-run projects: without a credible healthy majority every signal
  // looks like noise (SYNTHETIC_DATA_SPEC §5.6).
  while (plan.length < TARGET_TOTAL) plan.push('HEALTHY_REFERENCE');
  return rng.shuffle(plan).slice(0, TARGET_TOTAL);
}

function expand<T>(plan: readonly { count: number }[], key: (p: never) => T): T[] {
  return plan.flatMap((p) => Array.from({ length: p.count }, () => key(p as never)));
}

export interface Structure {
  readonly businessUnits: { id: string; name: string; kind: string }[];
  readonly regions: { code: string; name: string; parentBusinessUnitId: string }[];
  readonly industries: { code: string; name: string }[];
  readonly customers: { id: string; alias: string; industryCode: string; regionCode: string }[];
  readonly accounts: { id: string; customerId: string; organizationNodeId: string; name: string }[];
  readonly portfolios: { id: string; name: string; organizationNodeId: string }[];
  readonly programs: { id: string; portfolioId: string; name: string }[];
  readonly projects: ProjectSpec[];
}

export function buildStructure(masterSeed: string): Structure {
  const rng = Rng.fromSeed(`${masterSeed}:structure`);

  const businessUnits = BUSINESS_UNITS.map((b) => ({ id: b.id, name: b.name, kind: 'BUSINESS_UNIT' }));
  const regions = BUSINESS_UNITS.flatMap((b) =>
    b.regions.map((r) => ({ code: r, name: r, parentBusinessUnitId: b.id })),
  );
  const industries = VERTICALS.map((v) => ({ code: v.toLowerCase().replace(/[^a-z]+/g, '-'), name: v }));

  const customers: Structure['customers'] = [];
  const accounts: Structure['accounts'] = [];
  const portfolios: Structure['portfolios'] = [];
  const programs: Structure['programs'] = [];

  for (const bu of BUSINESS_UNITS) {
    portfolios.push({ id: `pf-${bu.id}`, name: `${bu.name} Delivery Portfolio`, organizationNodeId: bu.id });
  }

  let customerIndex = 0;
  for (const vertical of VERTICALS) {
    for (const alias of CLIENT_ALIASES[vertical]) {
      customerIndex += 1;
      const bu = BUSINESS_UNITS[customerIndex % BUSINESS_UNITS.length] as (typeof BUSINESS_UNITS)[number];
      const region = bu.regions[customerIndex % bu.regions.length] as string;
      const id = `cus-${String(customerIndex).padStart(3, '0')}`;
      customers.push({
        id, alias,
        industryCode: vertical.toLowerCase().replace(/[^a-z]+/g, '-'),
        regionCode: region,
      });
      accounts.push({ id: `acc-${String(customerIndex).padStart(3, '0')}`, customerId: id, organizationNodeId: bu.id, name: `${alias} Account` });
      programs.push({ id: `prg-${String(customerIndex).padStart(3, '0')}`, portfolioId: `pf-${bu.id}`, name: `${alias} Programme` });
    }
  }

  const bands = rng.shuffle(expand(BAND_PLAN, (p: { band: TcvBand; minUsd: number; maxUsd: number }) => p));
  const subStages = rng.shuffle(expand(SUB_STAGE_PLAN, (p: { stage: LifecycleSubStage }) => p.stage));
  const engagements = rng.shuffle([
    ...Array.from({ length: TARGET_FIXED_BID }, () => 'FIXED_BID' as const),
    ...Array.from({ length: TARGET_TIME_AND_MATERIALS }, () => 'TIME_AND_MATERIALS' as const),
    ...Array.from({ length: TARGET_CAPACITY }, () => 'CAPACITY' as const),
  ]);
  const archetypes = archetypePlan(Rng.fromSeed(`${masterSeed}:archetypes`));

  const projects: ProjectSpec[] = [];
  for (let i = 0; i < TARGET_TOTAL; i += 1) {
    const p = Rng.fromSeed(`${masterSeed}:project:${i}`);
    const account = accounts[i % accounts.length] as Structure['accounts'][number];
    const customer = customers.find((c) => c.id === account.customerId) as Structure['customers'][number];
    const vertical = VERTICALS.find((v) => v.toLowerCase().replace(/[^a-z]+/g, '-') === customer.industryCode) as Vertical;
    const engagement = engagements[i] as EngagementModel;

    // Fixed-bid-only archetypes must not land on a T&M or capacity engagement.
    let archetype = archetypes[i] as ArchetypeId;
    if (engagement !== 'FIXED_BID' && FIXED_BID_ONLY_ARCHETYPES.has(archetype)) {
      archetype = p.chance(0.6) ? 'HEALTHY_REFERENCE' : 'SCHEDULE_SLIP_HONEST';
    }

    const band = bands[i] as { band: TcvBand; minUsd: number; maxUsd: number };
    const subStage = subStages[i] as LifecycleSubStage;
    const contractUsd = Math.round(p.range(band.minUsd, band.maxUsd) / 1000) * 1000;
    // As-sold margin between 18% and 32%; the archetype decides what happens to it afterwards.
    const soldMarginPct = p.range(0.18, 0.32);
    const budgetedCostUsd = Math.round(contractUsd * (1 - soldMarginPct));
    const contingencyUsd = Math.round(budgetedCostUsd * p.range(0.04, 0.09));

    const durationWeeks = p.int(18, 130);
    // Position the project in its lifecycle by choosing how far through it the as-of date falls.
    const progressed: Record<LifecycleSubStage, [number, number]> = {
      MOBILIZATION: [0.02, 0.09], EARLY_EXECUTION: [0.1, 0.29], MID_PROJECT: [0.3, 0.62],
      LATE_STAGE: [0.63, 0.86], UAT_ACCEPTANCE: [0.87, 0.98], CLOSED_OUT: [1.0, 1.0],
    };
    const [lo, hi] = progressed[subStage];
    const elapsedWeeks = Math.max(1, Math.round(durationWeeks * p.range(lo, hi)));
    const startDate = addDays(AS_OF, -elapsedWeeks * 7);
    const plannedEndDate = addDays(startDate, durationWeeks * 7);

    const blendedRateUsd = p.range(52, 96);
    /*
     * The as-sold plan reserves a share of the cost budget for non-labour spend.
     *
     * `plannedHours` previously consumed the entire budgeted cost as labour, while simulate.ts
     * charges non-labour and pass-through at 5–11% of labour every week on top. Non-labour was
     * therefore an overrun *by construction* on every project in the portfolio — roughly 8pp of
     * margin erosion applied uniformly, before any archetype driver did anything. A project with
     * no productivity drag, no scope creep and no rework still finished materially below its sold
     * margin, which is why so few could be assessed healthy.
     *
     * A real fixed-bid estimate prices non-labour inside the cost base. The plan now does too, so
     * a project that performs to plan lands on its sold margin and any erosion is caused by a
     * driver rather than by an accounting gap in the generator.
     *
     * This changes a synthetic as-sold input. No formula, threshold or band edge is affected.
     */
    const plannedHours = Math.round((budgetedCostUsd * (1 - NON_LABOUR_BUDGET_SHARE)) / blendedRateUsd);
    const currency = REGION_CURRENCY[customer.regionCode] ?? 'USD';

    projects.push({
      projectId: `prj-${String(i + 1).padStart(3, '0')}`,
      contractId: `ctr-${String(i + 1).padStart(3, '0')}`,
      name: `${customer.alias} ${p.pick(CAPABILITIES)} ${p.pick(PHASES)}`,
      accountId: account.id,
      customerId: customer.id,
      organizationNodeId: account.organizationNodeId,
      portfolioId: `pf-${account.organizationNodeId}`,
      programId: `prg-${account.id.slice(4)}`,
      vertical,
      region: customer.regionCode,
      businessUnitId: account.organizationNodeId,
      currency: archetype === 'FX_EXPOSED' ? (currency === 'USD' ? 'EUR' : currency) : currency,
      engagementModel: engagement,
      lifecycleSubStage: subStage,
      lifecycleStage: SUB_STAGE_TO_STAGE[subStage],
      startDate,
      plannedEndDate,
      durationWeeks,
      tcvBand: band.band,
      contractValue: Money.of(dec(contractUsd), currency),
      budgetedCost: Money.of(dec(budgetedCostUsd), currency),
      contingencyBudget: Money.of(dec(contingencyUsd), currency),
      blendedRate: Money.of(dec(blendedRateUsd), currency),
      plannedEffortHours: dec(plannedHours),
      pyramidRatio: dec(p.range(0.28, 0.42), 4),
      reworkAllowance: dec(p.range(0.04, 0.07), 4),
      teamSize: Math.max(4, Math.min(18, Math.round(plannedHours / (durationWeeks * 34)))),
      archetype,
      inRecovery: archetype === 'RECOVERING_RED',
    });
  }

  // Sanity: the structure must match the plan before a single fact is generated.
  if (projects.length !== TARGET_TOTAL) {
    throw new Error(`Expected ${TARGET_TOTAL} projects, built ${projects.length}.`);
  }
  return { businessUnits, regions, industries, customers, accounts, portfolios, programs, projects };
}

export function weeksElapsed(spec: ProjectSpec): number {
  return Math.max(0, Math.round((Date.parse(AS_OF) - Date.parse(spec.startDate)) / (7 * 86_400_000)));
}

export function historyStart(spec: ProjectSpec): CalendarDate {
  const earliest = addDays(AS_OF, -HISTORY_WEEKS * 7);
  return compareDates(spec.startDate, earliest) > 0 ? spec.startDate : earliest;
}
