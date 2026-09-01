/**
 * The assistant's typed read-only tool layer (**ADR-0029**).
 *
 * **Every tool is a bounded projection over an existing `ViewId`.** A tool is not a new data path;
 * it is a second caller of the path Phases 7–10 already built and tested. That is the single most
 * important property in this file, because it means the assistant *inherits* — rather than
 * re-implements — session validation, RBAC, ABAC scope resolution, the object-level check, field
 * shaping with named withholding, decimal safety, provenance and the epistemic state algebra.
 * Each of those was expensive to get right and each has already been wrong at least once.
 *
 * Three consequences worth stating, because they are what a reviewer should check:
 *
 *   1. **Nothing here authorises anything.** `ApplicationGateway.request()` goes through
 *      `Dispatcher` → `EnforcementPoint`, so a `projectId` the caller may not see comes back as the
 *      same generic not-found a non-existent project returns. A tool cannot weaken that and cannot
 *      detect the difference either.
 *   2. **A withheld field is absent, not masked.** `shape()` omits it, so it never reaches a claim,
 *      so it cannot reach the answer. That is AC-6, expressed as data flow rather than as a rule.
 *   3. **No tool composes a figure.** Every display string arrives already formatted by the service
 *      that owns the metric; this file moves strings and attaches envelopes.
 */
import type {
  AssistantToolId, ClaimEnvelope, MaterialClaim, RetrievedFact, ToolArgs, ToolResult,
} from '@contexts/ai-intelligence';
import type { EpistemicLayer, RecordRef } from '@platform/provenance';
import { valueReference } from '@platform/provenance';
import type { SignalState } from '@platform/explainability';
import type { Instant } from '@platform/time';
import type { ApiResponse } from '../api/dispatcher.js';
import type { ApplicationGateway, ViewId, ViewRequest } from '../gateway.js';
import type { RequestContext } from '../authorization/enforcement.js';
import { LIMITATIONS_FOR, envelope } from './envelope.js';
// DR-075 containment now lives with the other executive formatters (Phase 7), so the assistant and
// the pages trim identically rather than each keeping their own copy.
import { trimDecidingTier } from '../portfolio/command-center.js';

/**
 * The allowlist. **One tool ⇒ exactly one `ViewId`**, and the map is the enforcement: a tool with no
 * entry cannot be dispatched, and a `ViewId` outside `VIEW_ROUTES` cannot be reached at all.
 *
 * `audit.events` is absent by decision, not by oversight (ADR-0029 D-5).
 */
export const TOOL_VIEW: Readonly<Record<AssistantToolId, ViewId | 'REGISTRY'>> = {
  'portfolio.summary.get': 'portfolio.commandCenter',
  'portfolio.ranking.list': 'portfolio.commandCenter',
  'portfolio.reportedGreenRisk.list': 'portfolio.commandCenter',
  'portfolio.systemGreenAtRisk.list': 'portfolio.commandCenter',
  'portfolio.segments.compare': 'portfolio.commandCenter',
  'project.executiveHealth.get': 'project.executiveHealth',
  'project.marginDrivers.get': 'project.marginIntelligence',
  'project.forwardRisk.get': 'project.forwardRisk',
  'project.recoveryOptions.get': 'project.forwardRisk',
  'project.lateDetection.get': 'project.forwardRisk',
  'evidence.get': 'project.lineage',
  'metric.definition.get': 'REGISTRY',
};

/** Bounded by construction. A list tool cannot ask for "everything and I will filter". */
export const MAX_TOOL_ROWS = 25;
export const MAX_COMPARE_SEGMENTS = 4;

export class ToolDenied extends Error {
  constructor() {
    // Identical text for every cause — out of scope, non-existent, capability missing.
    super('Not found');
    this.name = 'ToolDenied';
  }
}

/** A tool asked for a project. Out-of-scope and non-existent are indistinguishable from here. */
interface Row { readonly [k: string]: unknown }

function rowsOf(response: ApiResponse): readonly Row[] {
  if (response.status !== 200) throw new ToolDenied();
  const body = response.body as { data?: unknown } | undefined;
  const data = body?.data;
  return Array.isArray(data) ? (data as Row[]) : [];
}

function str(row: Row | undefined, key: string): string | null {
  const v = row?.[key];
  return typeof v === 'string' ? v : null;
}

function sub(row: Row | undefined, key: string): Row | undefined {
  const v = row?.[key];
  return typeof v === 'object' && v !== null ? (v as Row) : undefined;
}

function list(row: Row | undefined, key: string): readonly Row[] {
  const v = row?.[key];
  return Array.isArray(v) ? (v as Row[]) : [];
}

/** Builds a claim. `groundedBy` empty is a defect, so the caller must supply at least one ref. */
export function claim(args: {
  readonly id: string;
  readonly text: string;
  readonly display: string | null;
  readonly metricId: string | null;
  readonly ruleId?: string | null;
  readonly layer: EpistemicLayer;
  readonly entityType: string;
  readonly entityId: string;
  readonly asOf: Instant;
  readonly sourceDomain: string;
  readonly refs: readonly RecordRef[];
  readonly signalState?: SignalState;
  readonly overrides?: Partial<ClaimEnvelope>;
}): MaterialClaim {
  const env = envelope({
    metricId: args.metricId,
    ruleId: args.ruleId ?? null,
    layer: args.layer,
    asOf: args.asOf,
    sourceDomain: args.sourceDomain,
    ...(args.signalState !== undefined ? { signalState: args.signalState } : {}),
    ...(args.overrides !== undefined ? { overrides: args.overrides } : {}),
  });
  return {
    claimId: args.id,
    text: args.text,
    valueRef: args.metricId === null
      ? null
      : valueReference(args.metricId, args.entityType, args.entityId, args.asOf),
    display: args.display,
    epistemicLayer: args.layer,
    envelope: env,
    groundedBy: args.refs,
  };
}

/** Evidence lines a view already carries, turned into record refs. */
function refsFrom(evidence: Row | undefined, entityId: string): readonly RecordRef[] {
  const sources = evidence?.['sources'];
  const titles = Array.isArray(sources) ? (sources as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const title = str(evidence, 'title') ?? 'Evidence';
  if (titles.length === 0) {
    return [{ context: 'assessment', entityType: 'assessment', entityId }];
  }
  return titles.map((s) => ({ context: s, entityType: 'source', entityId: `${entityId}:${title}` }));
}

export interface ToolContext {
  readonly ctx: RequestContext;
  readonly gateway: ApplicationGateway;
  readonly asOf: Instant;
  readonly authorisedProjectIds: readonly string[];
}

async function view(tc: ToolContext, request: ViewRequest): Promise<readonly Row[]> {
  return rowsOf(await tc.gateway.request(tc.ctx, request));
}

// ---------------------------------------------------------------------------
// Tool implementations.
// ---------------------------------------------------------------------------

async function portfolioRow(tc: ToolContext): Promise<Row> {
  const rows = await view(tc, { view: 'portfolio.commandCenter' });
  const row = rows[0];
  if (row === undefined) throw new ToolDenied();
  return row;
}

async function summary(tc: ToolContext): Promise<ToolResult> {
  const row = await portfolioRow(tc);
  const kpis = list(row, 'kpis');
  const claims: MaterialClaim[] = [];
  for (const k of kpis.slice(0, MAX_TOOL_ROWS)) {
    const metricId = str(k, 'metricId');
    const label = str(k, 'label') ?? '';
    const display = str(k, 'display') ?? '';
    if (metricId === null) continue;
    claims.push(claim({
      id: `kpi:${str(k, 'id') ?? metricId}`,
      text: `${label} is ${display}.`,
      display, metricId,
      layer: str(k, 'treatment') === 'inferred' ? 'L3' : 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: refsFrom(sub(k, 'evidence'), 'portfolio'),
    }));
  }
  // The population claim. A total a reader cannot reconcile to a list reads as a broken page.
  const projectCount = row['projectCount'];
  const universe = row['authorisedUniverseCount'];
  if (typeof projectCount === 'number' && typeof universe === 'number') {
    claims.push(claim({
      id: 'kpi:population',
      text: `The figures cover ${String(projectCount)} fixed-bid projects of ${String(universe)} you are authorised for.`,
      display: `${String(projectCount)} of ${String(universe)}`,
      metricId: null, layer: 'L1',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'population', entityId: str(row, 'populationLabel') ?? 'population' }],
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }));
  }
  return { tool: 'portfolio.summary.get', claims, untrustedContent: [] };
}

async function ranking(tc: ToolContext): Promise<ToolResult> {
  const row = await portfolioRow(tc);
  const ranked = list(row, 'ranked').slice(0, MAX_TOOL_ROWS);
  const claims: MaterialClaim[] = ranked.map((r, i) => claim({
    id: `rank:${str(r, 'projectId') ?? String(i)}`,
    // One sentence, not two fragments. The deciding tier is a subordinate clause here because it
    // begins lowercase in the domain's own wording, and concatenating it after a full stop produced
    // "GM at risk $5.55M. more gross margin is at risk" on the rendered page (Phase 12A).
    text: ((): string => {
      const tier = trimDecidingTier(str(r, 'outranksBecause') ?? '');
      const head = `Rank ${String(r['rank'] ?? i + 1)}: ${str(r, 'name') ?? ''} — System-Assessed ${str(r, 'systemAssessedRag') ?? 'unknown'}, GM at risk ${str(r, 'gmValueAtRisk') ?? 'not computable'}`;
      return tier === '' ? `${head}.` : `${head}; it outranks the next project because ${tier}.`;
    })(),
    display: String(r['rank'] ?? ''),
    metricId: 'MET-PORT-007', layer: 'L3',
    entityType: 'project', entityId: str(r, 'projectId') ?? '',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: [{ context: 'portfolio', entityType: 'project', entityId: str(r, 'projectId') ?? '', metricId: 'MET-PORT-007' }],
    overrides: { limitations: LIMITATIONS_FOR['MET-PORT-007'] ?? [] },
  }));
  return { tool: 'portfolio.ranking.list', claims, untrustedContent: [] };
}

/**
 * ADR-0018's **two** findings stay two tools.
 *
 * Merging them produces "Green-at-Risk" with no subject, which is already open debt as DR-052.
 * `reported` selects the organisation-says-GREEN finding; `system` selects the outlook finding.
 */
async function greenAtRisk(tc: ToolContext, which: 'reported' | 'system'): Promise<ToolResult> {
  const row = await portfolioRow(tc);
  const panel = sub(row, 'greenAtRisk');
  const ranked = list(row, 'ranked');
  const flag = which === 'reported' ? 'isReportedGreenRisk' : 'isSystemGreenAtRisk';
  const countKey = which === 'reported' ? 'reportedGreenRiskCount' : 'systemGreenAtRiskCount';
  const metricId = which === 'reported' ? 'MET-PORT-006' : 'MET-PORT-005';
  const count = panel?.[countKey];
  const claims: MaterialClaim[] = [];
  claims.push(claim({
    id: `gar:${which}:count`,
    text: which === 'reported'
      ? `${String(count ?? 0)} projects are reported GREEN by the delivery line while the evidence disagrees.`
      : `${String(count ?? 0)} projects are System-Assessed GREEN today with an AMBER or RED outlook at 30 or 60 days.`,
    display: String(count ?? 0),
    metricId, layer: 'L3',
    entityType: 'portfolio', entityId: 'authorised-set',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: refsFrom(sub(panel, 'evidence'), 'portfolio'),
  }));
  for (const r of ranked.filter((x) => x[flag] === true).slice(0, MAX_TOOL_ROWS)) {
    claims.push(claim({
      id: `gar:${which}:${str(r, 'projectId') ?? ''}`,
      text: `${str(r, 'name') ?? ''} — Reported ${str(r, 'reportedRag') ?? '?'}, System-Assessed ${str(r, 'systemAssessedRag') ?? '?'}, 30-day outlook ${str(r, 'outlook30') ?? '?'}, 60-day outlook ${str(r, 'outlook60') ?? '?'}.`,
      display: str(r, 'systemAssessedRag'),
      metricId, layer: 'L3',
      entityType: 'project', entityId: str(r, 'projectId') ?? '',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'project', entityId: str(r, 'projectId') ?? '', metricId }],
    }));
  }
  return {
    tool: which === 'reported' ? 'portfolio.reportedGreenRisk.list' : 'portfolio.systemGreenAtRisk.list',
    claims, untrustedContent: [],
  };
}

/** Bounded comparison **inside** the authorised set. An unresolvable segment is `Not found`. */
async function compare(tc: ToolContext, args: ToolArgs): Promise<ToolResult> {
  const row = await portfolioRow(tc);
  const ranked = list(row, 'ranked');
  const wanted = (args.segmentIds ?? []).slice(0, MAX_COMPARE_SEGMENTS);
  const claims: MaterialClaim[] = [];
  for (const segment of wanted) {
    const inSegment = ranked.filter(
      (r) => str(r, 'region') === segment || str(r, 'deliveryGroup') === segment || str(r, 'industry') === segment,
    );
    if (inSegment.length === 0) throw new ToolDenied();
    const red = inSegment.filter((r) => str(r, 'systemAssessedRag') === 'RED').length;
    claims.push(claim({
      id: `segment:${segment}`,
      text: `${segment}: ${String(inSegment.length)} projects in your authorised set, ${String(red)} System-Assessed RED.`,
      display: `${String(red)} of ${String(inSegment.length)} RED`,
      metricId: 'MET-HLTH-011', layer: 'L3',
      entityType: 'segment', entityId: segment,
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'segment', entityId: segment }],
    }));
  }
  if (claims.length === 0) throw new ToolDenied();
  return { tool: 'portfolio.segments.compare', claims, untrustedContent: [] };
}

async function projectView(tc: ToolContext, v: ViewId, projectId: string | undefined): Promise<Row> {
  if (projectId === undefined || projectId === '') throw new ToolDenied();
  const rows = await view(tc, { view: v, entityId: projectId });
  const row = rows[0];
  if (row === undefined) throw new ToolDenied();
  return row;
}

export const TOOL_STATE: string =
  '12 tools, all read-only, each mapped to exactly one ViewId in VIEW_ROUTES (ADR-0029).';

export {
  compare, greenAtRisk, projectView, ranking, refsFrom, summary, list, str, sub,
};
